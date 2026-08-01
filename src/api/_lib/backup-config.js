/**
 * Konfigurasi backup Google Drive yang disimpan di Firestore (settings/backup_drive).
 *
 * Semua nilai sensitif (client secret dan refresh token) dienkripsi AES-256-GCM
 * memakai helper yang sama dengan konfigurasi AI, sehingga tidak ada env baru
 * yang perlu dibuat manual: secret diturunkan dari AI_CONFIG_SECRET bila ada,
 * atau dari kredensial service account Firebase yang sudah terpasang.
 *
 * Dokumen `settings/backup_drive` ditolak untuk klien oleh Firestore Rules
 * (hanya `settings/app_config` yang diizinkan dari browser), jadi hanya Admin
 * SDK (fungsi serverless ini) yang dapat membaca dan menulisnya.
 *
 * Model otorisasi: OAuth 2.0 refresh token milik akun Google sekolah.
 * Service account sengaja tidak dipakai karena akun Google non-Workspace tidak
 * memiliki kuota penyimpanan Drive untuk service account (storageQuotaExceeded).
 */

const { encryptSecret, decryptSecret, describeSecretKeySources } = require('./ai-config');
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

const LOG_LIMIT = 50;
const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly'];
const DEFAULT_SCHEDULE = {
  enabled: false,
  frequency: 'weekly',
  time: '02:00',
  dayOfWeek: 5, // 0=Minggu ... 6=Sabtu (default Jumat)
  dayOfMonth: 1,
};

// Pengingat backup untuk guru (popup + opsional push notification browser).
const VALID_REMINDER_FREQUENCIES = ['daily', 'weekly', 'custom'];
const DEFAULT_REMINDER = {
  enabled: false,
  frequency: 'weekly', // daily | weekly | custom
  days: [5],           // 0=Minggu..6=Sabtu; weekly pakai 1 hari, custom banyak hari
  time: '07:00',
  push: false,         // gunakan Notification API browser bila diizinkan
};

let cache = { at: 0, config: null };

/** Bersihkan & validasi objek jadwal dari sumber tak tepercaya. */
function normalizeSchedule(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const frequency = VALID_FREQUENCIES.includes(source.frequency) ? source.frequency : DEFAULT_SCHEDULE.frequency;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(source.time || '')) ? source.time : DEFAULT_SCHEDULE.time;
  let dayOfWeek = Number.isInteger(source.dayOfWeek) ? source.dayOfWeek : DEFAULT_SCHEDULE.dayOfWeek;
  if (dayOfWeek < 0 || dayOfWeek > 6) dayOfWeek = DEFAULT_SCHEDULE.dayOfWeek;
  let dayOfMonth = Number.isInteger(source.dayOfMonth) ? source.dayOfMonth : DEFAULT_SCHEDULE.dayOfMonth;
  if (dayOfMonth < 1 || dayOfMonth > 28) dayOfMonth = DEFAULT_SCHEDULE.dayOfMonth;
  return { enabled: source.enabled === true, frequency, time, dayOfWeek, dayOfMonth };
}

/** Bersihkan & validasi objek pengingat backup dari sumber tak tepercaya. */
function normalizeReminder(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const frequency = VALID_REMINDER_FREQUENCIES.includes(source.frequency) ? source.frequency : DEFAULT_REMINDER.frequency;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(source.time || '')) ? source.time : DEFAULT_REMINDER.time;
  let days = Array.isArray(source.days) ? source.days : [];
  days = [...new Set(days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (frequency === 'weekly') {
    days = days.length ? [days[0]] : [DEFAULT_REMINDER.days[0]];
  } else if (frequency === 'custom') {
    if (!days.length) days = [...DEFAULT_REMINDER.days];
  } else {
    days = []; // daily: setiap hari, tidak butuh daftar hari
  }
  return { enabled: source.enabled === true, frequency, days, time, push: source.push === true };
}

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
        schedule: normalizeSchedule(data.schedule),
        reminder: normalizeReminder(data.reminder),
        lastAutoBackupAt: String(data.last_auto_backup_at || ''),
        logs: Array.isArray(data.logs) ? data.logs : [],
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

/** Simpan pengaturan pengingat backup untuk guru (khusus admin). */
async function writeReminder({ reminder, updatedBy } = {}) {
  const normalized = normalizeReminder(reminder);
  await docRef().set({
    reminder: normalized,
    updated_at: new Date().toISOString(),
    updated_by: String(updatedBy || '').trim(),
  }, { merge: true });
  invalidateCache();
  return { ok: true, reminder: normalized };
}

/** Konfigurasi publik untuk ditampilkan di panel admin (tanpa nilai rahasia). */
async function getPublicConfig({ forceRefresh = false } = {}) {
  const config = await readStoredConfig({ forceRefresh });
  if (!config || !config.clientId) {
    return {
      configured: false,
      connected: false,
      folderName: DEFAULT_FOLDER_NAME,
      scope: DRIVE_SCOPE,
      schedule: DEFAULT_SCHEDULE,
      reminder: DEFAULT_REMINDER,
      lastAutoBackupAt: '',
      logs: [],
    };
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
    schedule: config.schedule || DEFAULT_SCHEDULE,
    reminder: config.reminder || DEFAULT_REMINDER,
    lastAutoBackupAt: config.lastAutoBackupAt || '',
    logs: Array.isArray(config.logs) ? config.logs : [],
  };
}

/** Pengaturan pengingat untuk guru (tanpa data sensitif). */
async function getReminderConfig({ forceRefresh = false } = {}) {
  const config = await readStoredConfig({ forceRefresh });
  return config?.reminder ? config.reminder : DEFAULT_REMINDER;
}

/** Bentuk redirect URI dari host permintaan agar tidak perlu env tambahan. */
function buildRedirectUri(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim()
    || (forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${forwardedProto}://${forwardedHost}/api/admin/backup-config`;
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

  // Pesan kesalahan dibedakan per penyebab, karena penanganannya berbeda jauh.
  // `client_id` disimpan sebagai teks biasa, sedangkan `client_secret` dan
  // `refresh_token` dienkripsi. Jadi bila client_id ADA tetapi secret kosong,
  // yang bermasalah adalah kunci dekripsinya, bukan konfigurasinya.
  if (!config?.clientId) {
    throw new Error(
      'Google Drive belum dikonfigurasi. Buka panel Admin > Pengaturan Backup, '
      + 'isi Client ID dan Client Secret, lalu tekan "Hubungkan Google Drive".'
    );
  }
  if (!config.clientSecret) {
    throw new Error(
      'Client Secret Google Drive tidak dapat didekripsi dengan kunci apa pun yang '
      + `tersedia di lingkungan ini (${describeSecretKeySources().join(', ')}). `
      + 'Artinya kredensial memang tersimpan, tetapi dienkripsi memakai kunci lain. '
      + 'Perbaikan paling pasti: setel secret AI_CONFIG_SECRET dengan nilai yang '
      + 'SAMA PERSIS di Vercel dan di GitHub Actions, lalu simpan ulang kredensial '
      + 'Drive dari panel admin agar terenkripsi memakai kunci tersebut.'
    );
  }
  if (!config.refreshToken) {
    throw new Error(
      'Google Drive belum dihubungkan. Admin perlu menekan "Hubungkan Google Drive" '
      + 'di panel admin untuk memberi izin akses, karena tanpa refresh token '
      + 'unggahan tidak dapat dilakukan.'
    );
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

/** Simpan pengaturan jadwal backup otomatis (khusus admin). */
async function writeSchedule({ schedule, updatedBy } = {}) {
  const normalized = normalizeSchedule(schedule);
  await docRef().set({
    schedule: normalized,
    updated_at: new Date().toISOString(),
    updated_by: String(updatedBy || '').trim(),
  }, { merge: true });
  invalidateCache();
  return { ok: true, schedule: normalized };
}

/**
 * Tambahkan satu entri ke riwayat backup (disimpan sebagai array di dokumen
 * settings/backup_drive, dibatasi LOG_LIMIT entri terbaru). Entri bertipe
 * "otomatis" yang sukses juga memperbarui penanda waktu backup otomatis terakhir.
 */
async function appendLog(entry = {}) {
  const stored = await readStoredConfig({ forceRefresh: true });
  const existing = Array.isArray(stored?.logs) ? stored.logs : [];
  const record = {
    at: new Date().toISOString(),
    type: String(entry.type || 'manual').slice(0, 20),
    status: entry.status === 'error' ? 'error' : 'success',
    file_name: String(entry.fileName || entry.file_name || '').slice(0, 200),
    size: Number(entry.size || 0),
    by: String(entry.by || '').slice(0, 60),
    message: String(entry.message || '').slice(0, 300),
  };
  const logs = [record, ...existing].slice(0, LOG_LIMIT);
  const payload = { logs };
  if (record.type === 'otomatis' && record.status === 'success') {
    payload.last_auto_backup_at = record.at;
  }
  await docRef().set(payload, { merge: true });
  invalidateCache();
  return { ok: true, entry: record };
}

/** Catat metadata unggahan terakhir untuk ditampilkan di panel admin. */
async function recordUpload({ fileName, fileId, size, uploadedBy, type }) {
  await docRef().set({
    last_upload_at: new Date().toISOString(),
    last_upload_name: String(fileName || '').slice(0, 200),
    last_upload_id: String(fileId || '').slice(0, 100),
    last_upload_size: Number(size || 0),
    last_upload_by: String(uploadedBy || '').slice(0, 60),
  }, { merge: true });
  invalidateCache();
  // Setiap unggahan sukses juga tercatat di riwayat agar terlihat di panel admin.
  await appendLog({
    type: type || 'manual',
    status: 'success',
    fileName,
    size,
    by: uploadedBy,
  });
  return { ok: true };
}

/**
 * Enkripsi ulang kredensial yang tersimpan memakai kunci UTAMA lingkungan ini.
 *
 * MASALAH YANG DIPECAHKAN
 * -----------------------
 * Kredensial ditulis oleh Vercel (lewat panel admin) tetapi perlu dibaca juga
 * oleh GitHub Actions saat snapshot mingguan mengunggah ke Google Drive. Kunci
 * enkripsi diturunkan dari variabel lingkungan, sehingga bila kedua tempat tidak
 * memiliki variabel yang sama, GitHub Actions tidak dapat mendekripsi.
 *
 * Fungsi ini dijalankan DI TEMPAT YANG MASIH BISA MENDEKRIPSI (Vercel): nilainya
 * dibaca dengan kunci lama, lalu ditulis ulang memakai kunci utama saat ini.
 * Setelah AI_CONFIG_SECRET diset sama di Vercel dan GitHub Actions, sekali
 * penyelarasan membuat keduanya dapat membaca nilai yang sama — tanpa admin
 * perlu mengetik ulang Client Secret atau mengulang izin Google.
 *
 * Sifatnya aman: bila ada nilai yang tidak dapat didekripsi, nilai itu TIDAK
 * disentuh sama sekali, sehingga tidak ada kredensial yang rusak.
 */
async function reencryptSecrets({ updatedBy } = {}) {
  const snapshot = await docRef().get();
  if (!snapshot.exists) {
    return { ok: false, reason: 'Belum ada konfigurasi Google Drive untuk diselaraskan.' };
  }
  const data = snapshot.data() || {};

  const payload = {};
  const migrated = [];
  const failed = [];

  const fields = [
    ['client_secret_enc', 'Client Secret'],
    ['refresh_token_enc', 'Refresh Token'],
  ];

  for (const [field, label] of fields) {
    const stored = data[field];
    if (!stored) continue;
    const plain = decryptSecret(stored);
    if (!plain) {
      failed.push(label);
      continue;
    }
    const reencrypted = encryptSecret(plain);
    // Verifikasi hasilnya benar-benar terbaca kembali sebelum ditulis.
    if (decryptSecret(reencrypted) !== plain) {
      failed.push(label);
      continue;
    }
    payload[field] = reencrypted;
    migrated.push(label);
  }

  if (failed.length) {
    return {
      ok: false,
      reason: `Tidak dapat mendekripsi ${failed.join(' dan ')} di lingkungan ini. `
        + `Kunci yang tersedia: ${describeSecretKeySources().join(', ')}. `
        + 'Jalankan penyelarasan dari lingkungan yang menyimpan kredensial tersebut '
        + '(biasanya aplikasi web di Vercel), bukan dari proses lain.',
      migrated,
      failed,
    };
  }

  if (!migrated.length) {
    return { ok: false, reason: 'Tidak ada kredensial terenkripsi yang perlu diselaraskan.' };
  }

  payload.updated_at = new Date().toISOString();
  payload.updated_by = String(updatedBy || '').trim();
  payload.secret_key_synced_at = payload.updated_at;

  await docRef().set(payload, { merge: true });
  invalidateCache();

  await appendLog({
    type: 'manual',
    status: 'success',
    message: `Kunci enkripsi diselaraskan untuk ${migrated.join(' dan ')}.`,
    by: updatedBy,
  });

  return { ok: true, migrated };
}

module.exports = {
  DEFAULT_FOLDER_NAME,
  DEFAULT_SCHEDULE,
  DEFAULT_REMINDER,
  DRIVE_SCOPE,
  appendLog,
  buildConsentUrl,
  buildRedirectUri,
  disconnectDrive,
  ensureBackupFolder,
  exchangeCodeForRefreshToken,
  getAccessToken,
  getPublicConfig,
  getReminderConfig,
  readStoredConfig,
  recordUpload,
  reencryptSecrets,
  writeCredentials,
  writeReminder,
  writeSchedule,
};
