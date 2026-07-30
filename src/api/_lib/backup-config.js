/**
 * Konfigurasi backup Google Drive yang disimpan di Firestore (settings/backup_drive).
 *
 * Semua nilai sensitif (client secret dan refresh token) dienkripsi AES-256-GCM
 * memakai helper yang sama dengan konfigurasi AI, sehingga tidak ada env baru
 * yang perlu dibuat manual: secret diturunkan dari AI_CONFIG_SECRET bila ada,
 * atau dari kredensial service account Firebase yang sudah terpasang.
 *
 * Koleksi `settings` ditolak total oleh Firestore Rules untuk klien, jadi hanya
 * Admin SDK (fungsi serverless ini) yang dapat membacanya.
 *
 * Model otorisasi: OAuth 2.0 refresh token milik akun Google sekolah.
 * Service account sengaja tidak dipakai karena akun Google non-Workspace tidak
 * memiliki kuota penyimpanan Drive untuk service account (storageQuotaExceeded).
 */

const { encryptSecret, decryptSecret } = require('./ai-config');
const { getFirestore } = require('./firebase-admin');

const CONFIG_COLLECTION = 'settings';
const CONFIG_DOC_ID = 'backup_drive';
const CACHE_TTL_MS = 30000;

// drive.file = hanya berkas yang dibuat aplikasi ini. Scope paling sempit yang
// cukup untuk mengunggah backup, dan tidak termasuk scope sensitif Google.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DEFAULT_FOLDER_NAME = 'SIMSMANSARI Backup';

let cache = { at: 0, config: null };

function docRef() {
  return getFirestore().collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID);
}

function maskTail(value) {
  const tail = String(value || '').trim().slice(-4);
  return tail ? `••••${tail}` : '';
}

function invalidateCache() {
  cache = { at: 0, config: null };
}

/** Baca konfigurasi mentah (termasuk nilai terdekripsi). */
async function readStoredConfig({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.config !== null && now - cache.at < CACHE_TTL_MS) {
    return cache.config;
  }

  let config = null;
  try {
    const snapshot = await docRef().get();
    if (snapshot.exists) {
      const data = snapshot.data() || {};
      config = {
        clientId: String(data.client_id || '').trim(),
        clientSecret: data.client_secret_enc ? decryptSecret(data.client_secret_enc) : '',
        refreshToken: data.refresh_token_enc ? decryptSecret(data.refresh_token_enc) : '',
        folderName: String(data.folder_name || DEFAULT_FOLDER_NAME).trim(),
        folderId: String(data.folder_id || '').trim(),
        accountEmail: String(data.account_email || '').trim(),
        isActive: data.is_active !== false,
        connectedAt: String(data.connected_at || ''),
        updatedAt: String(data.updated_at || ''),
        updatedBy: String(data.updated_by || ''),
        lastUploadAt: String(data.last_upload_at || ''),
        lastUploadName: String(data.last_upload_name || ''),
      };
    }
  } catch (error) {
    console.warn('Gagal membaca konfigurasi backup Drive:', error?.message || error);
  }

  cache = { at: now, config };
  return config;
}

/** Simpan kredensial OAuth dari panel admin. Client secret dienkripsi. */
async function writeCredentials({ clientId, clientSecret, folderName, updatedBy }) {
  const normalizedId = String(clientId || '').trim();
  const trimmedSecret = String(clientSecret || '').trim();
  if (!normalizedId) throw new Error('Client ID wajib diisi.');
  if (!/\.apps\.googleusercontent\.com$/.test(normalizedId)) {
    throw new Error('Client ID harus berakhiran .apps.googleusercontent.com');
  }

  const stored = await readStoredConfig({ forceRefresh: true });
  const finalSecret = trimmedSecret || stored?.clientSecret || '';
  if (!finalSecret) throw new Error('Client Secret wajib diisi.');

  const payload = {
    client_id: normalizedId,
    client_secret_enc: encryptSecret(finalSecret),
    folder_name: String(folderName || '').trim() || DEFAULT_FOLDER_NAME,
    is_active: true,
    updated_at: new Date().toISOString(),
    updated_by: String(updatedBy || '').trim(),
  };

  // Client ID berubah membuat refresh token lama tidak berlaku.
  if (stored?.clientId && stored.clientId !== normalizedId) {
    payload.refresh_token_enc = '';
    payload.folder_id = '';
    payload.account_email = '';
    payload.connected_at = '';
  }

  await docRef().set(payload, { merge: true });
  invalidateCache();
  return { ok: true, secretTail: maskTail(finalSecret), updatedAt: payload.updated_at };
}

/** Hapus koneksi Drive (refresh token dan folder), kredensial tetap tersimpan. */
async function disconnectDrive({ updatedBy } = {}) {
  await docRef().set({
    refresh_token_enc: '',
    folder_id: '',
    account_email: '',
    connected_at: '',
    updated_at: new Date().toISOString(),
    updated_by: String(updatedBy || '').trim(),
  }, { merge: true });
  invalidateCache();
  return { ok: true };
}

/** Konfigurasi publik untuk ditampilkan di panel admin (tanpa nilai rahasia). */
async function getPublicConfig() {
  const config = await readStoredConfig();
  if (!config || !config.clientId) {
    return { configured: false, connected: false, folderName: DEFAULT_FOLDER_NAME, scope: DRIVE_SCOPE };
  }
  return {
    configured: true,
    connected: Boolean(config.refreshToken),
    clientId: config.clientId,
    secretTail: maskTail(config.clientSecret),
    folderName: config.folderName,
    folderId: config.folderId,
    accountEmail: config.accountEmail,
    connectedAt: config.connectedAt,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
    lastUploadAt: config.lastUploadAt,
    lastUploadName: config.lastUploadName,
    scope: DRIVE_SCOPE,
  };
}

/** Bentuk redirect URI dari host permintaan agar tidak perlu env tambahan. */
function buildRedirectUri(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim()
    || (forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${forwardedProto}://${forwardedHost}/api/admin/drive-oauth`;
}

/** URL persetujuan Google. `state` dipakai untuk mengembalikan admin ke UI. */
function buildConsentUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    // prompt=consent memastikan refresh_token selalu dikirim ulang.
    prompt: 'consent',
    state: String(state || ''),
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

async function postForm(url, form) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(`Google OAuth menolak permintaan: ${detail}`);
  }
  return data;
}

/** Tukar authorization code menjadi refresh token, lalu simpan terenkripsi. */
async function exchangeCodeForRefreshToken({ code, redirectUri }) {
  const config = await readStoredConfig({ forceRefresh: true });
  if (!config?.clientId || !config?.clientSecret) {
    throw new Error('Client ID/Secret Google belum disimpan di panel admin.');
  }

  const token = await postForm(OAUTH_TOKEN_URL, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const refreshToken = String(token.refresh_token || '').trim();
  if (!refreshToken) {
    throw new Error('Google tidak mengirim refresh token. Cabut akses aplikasi di myaccount.google.com lalu hubungkan ulang.');
  }

  let accountEmail = '';
  try {
    const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (info.ok) {
      const profile = await info.json();
      accountEmail = String(profile.email || '').trim();
    }
  } catch {
    // Email hanya untuk tampilan; kegagalan tidak menghalangi koneksi.
  }

  await docRef().set({
    refresh_token_enc: encryptSecret(refreshToken),
    account_email: accountEmail,
    connected_at: new Date().toISOString(),
    is_active: true,
  }, { merge: true });
  invalidateCache();

  return { ok: true, accountEmail };
}

/** Tukar refresh token menjadi access token berumur pendek. */
async function getAccessToken() {
  const config = await readStoredConfig();
  if (!config?.clientId || !config?.clientSecret) {
    throw new Error('Google Drive belum dikonfigurasi oleh admin.');
  }
  if (!config.refreshToken) {
    throw new Error('Google Drive belum dihubungkan. Admin perlu menekan "Hubungkan Google Drive".');
  }

  const token = await postForm(OAUTH_TOKEN_URL, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });

  const accessToken = String(token.access_token || '').trim();
  if (!accessToken) throw new Error('Google tidak mengirim access token.');
  return {
    accessToken,
    expiresIn: Number(token.expires_in || 3600),
    config,
  };
}

/**
 * Pastikan folder tujuan ada. Dengan scope drive.file aplikasi hanya dapat
 * mengakses berkas/folder yang dibuatnya sendiri, jadi folder dibuat oleh
 * aplikasi lalu ID-nya disimpan untuk dipakai ulang.
 */
async function ensureBackupFolder({ accessToken, config }) {
  const folderName = config.folderName || DEFAULT_FOLDER_NAME;

  if (config.folderId) {
    try {
      const check = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(config.folderId)}?fields=id,trashed`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (check.ok) {
        const data = await check.json();
        if (data.id && data.trashed !== true) return data.id;
      }
    } catch {
      // Folder tidak dapat diverifikasi; buat ulang di bawah.
    }
  }

  const create = await fetch(`${DRIVE_FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!create.ok) {
    const detail = await create.text();
    throw new Error(`Gagal membuat folder Drive: ${detail.slice(0, 200)}`);
  }
  const created = await create.json();
  const folderId = String(created.id || '').trim();
  if (!folderId) throw new Error('Google Drive tidak mengembalikan ID folder.');

  await docRef().set({ folder_id: folderId }, { merge: true });
  invalidateCache();
  return folderId;
}

/** Catat metadata unggahan terakhir untuk ditampilkan di panel admin. */
async function recordUpload({ fileName, fileId, size, uploadedBy }) {
  await docRef().set({
    last_upload_at: new Date().toISOString(),
    last_upload_name: String(fileName || '').slice(0, 200),
    last_upload_id: String(fileId || '').slice(0, 100),
    last_upload_size: Number(size || 0),
    last_upload_by: String(uploadedBy || '').slice(0, 60),
  }, { merge: true });
  invalidateCache();
  return { ok: true };
}

module.exports = {
  DEFAULT_FOLDER_NAME,
  DRIVE_SCOPE,
  buildConsentUrl,
  buildRedirectUri,
  disconnectDrive,
  ensureBackupFolder,
  exchangeCodeForRefreshToken,
  getAccessToken,
  getPublicConfig,
  readStoredConfig,
  recordUpload,
  writeCredentials,
};
