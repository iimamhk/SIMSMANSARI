/**
 * Endpoint konfigurasi backup Google Drive (khusus admin).
 *
 * GET  → konfigurasi publik atau callback OAuth Google.
 * POST → simpan konfigurasi, ambil token upload, catat upload, atau disconnect.
 */

const { getAuth } = require('../_lib/firebase-admin');
const { handleOptions, sendJson } = require('../_lib/ai');
const {
  buildConsentUrl,
  buildRedirectUri,
  disconnectDrive,
  ensureBackupFolder,
  exchangeCodeForRefreshToken,
  getAccessToken,
  getPublicConfig,
  recordUpload,
  readStoredConfig,
  writeCredentials,
} = require('../_lib/backup-config');

const ALLOWED_ROLES = ['admin', 'guru'];

async function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(header.slice(7));
    return decoded.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
}

async function requireUser(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(header.slice(7));
    return ALLOWED_ROLES.includes(decoded.role) ? decoded : null;
  } catch {
    return null;
  }
}

function renderOAuthPage({ title, message, tone }) {
  const accent = tone === 'error' ? '#be123c' : '#047857';
  const background = tone === 'error' ? '#fff1f2' : '#ecfdf5';
  const border = tone === 'error' ? '#fecdd3' : '#a7f3d0';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:Arial,sans-serif;padding:24px}main{max-width:520px;width:100%;background:#fff;border:1px solid ${border};border-radius:18px;padding:28px;box-shadow:0 20px 50px -30px rgba(15,23,42,.35)}h1{margin:0 0 10px;font-size:20px;color:${accent}}p{margin:0 0 18px;font-size:14px;line-height:1.65;color:#475569}.badge{display:inline-block;margin-bottom:14px;padding:5px 11px;border-radius:999px;background:${background};color:${accent};font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}a{display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700}</style></head>
<body><main><span class="badge">Google Drive</span><h1>${title}</h1><p>${message}</p><a href="/#admin/pengaturan">Kembali ke Panel Admin</a></main></body></html>`;
}

function sendOAuthPage(res, statusCode, page) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(page);
}

async function handleOAuthCallback(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const code = String(url.searchParams.get('code') || '').trim();
  const oauthError = String(url.searchParams.get('error') || '').trim();
  if (oauthError) {
    sendOAuthPage(res, 400, renderOAuthPage({ title: 'Izin ditolak', message: `Google menolak permintaan izin (${oauthError}). Coba hubungkan ulang dari panel admin.`, tone: 'error' }));
    return;
  }
  if (!code) {
    sendOAuthPage(res, 400, renderOAuthPage({ title: 'Kode otorisasi tidak ditemukan', message: 'Buka panel admin lalu tekan "Hubungkan Google Drive" untuk memulai proses dari awal.', tone: 'error' }));
    return;
  }
  try {
    const result = await exchangeCodeForRefreshToken({ code, redirectUri: buildRedirectUri(req) });
    const akun = result.accountEmail ? `akun <strong>${result.accountEmail}</strong>` : 'akun Google Anda';
    sendOAuthPage(res, 200, renderOAuthPage({ title: 'Google Drive berhasil dihubungkan', message: `Backup akan diunggah ke ${akun}. Anda dapat kembali ke panel admin untuk menjalankan tes unggah.`, tone: 'success' }));
  } catch (error) {
    sendOAuthPage(res, 400, renderOAuthPage({ title: 'Gagal menghubungkan Google Drive', message: String(error?.message || 'Terjadi kesalahan tidak diketahui.'), tone: 'error' }));
  }
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  // OAuth callback tidak membawa Firebase Bearer token.
  if (req.method === 'GET' && new URL(req.url, 'http://localhost').searchParams.has('code')) {
    await handleOAuthCallback(req, res);
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || '').trim();

  if (action === 'token' || action === 'record-upload') {
    const user = await requireUser(req);
    if (!user) {
      sendJson(req, res, 401, { error: 'Login sebagai guru atau admin diperlukan.', code: 'unauthorized' });
      return;
    }
    if (req.method === 'POST' && action === 'record-upload') {
      try {
        await recordUpload({ fileName: body.fileName ?? body.file_name, fileId: body.fileId ?? body.file_id, size: body.size, uploadedBy: user.username || user.uid || '' });
        sendJson(req, res, 200, { ok: true });
      } catch (error) {
        sendJson(req, res, 500, { error: 'Gagal mencatat metadata unggahan.', code: 'record_failed' });
      }
      return;
    }
    if (req.method !== 'POST') {
      sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
      return;
    }
    try {
      const { accessToken, expiresIn, config } = await getAccessToken();
      const folderId = await ensureBackupFolder({ accessToken, config });
      sendJson(req, res, 200, { ok: true, accessToken, expiresIn, folderId, folderName: config.folderName, accountEmail: config.accountEmail });
    } catch (error) {
      sendJson(req, res, 409, { ok: false, error: error?.message || 'Google Drive tidak tersedia.', code: 'drive_unavailable' });
    }
    return;
  }

  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    sendJson(req, res, 401, { error: 'Akses admin diperlukan.', code: 'unauthorized' });
    return;
  }

  const redirectUri = buildRedirectUri(req);

  if (req.method === 'GET') {
    try {
      const config = await getPublicConfig();
      const consentUrl = config.configured
        ? buildConsentUrl({
          clientId: config.clientId,
          redirectUri,
          state: adminUser.username || adminUser.uid || 'admin',
        })
        : '';
      sendJson(req, res, 200, { ...config, redirectUri, consentUrl });
    } catch (error) {
      sendJson(req, res, 500, { error: 'Gagal membaca konfigurasi backup Drive.', code: 'read_failed' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      if (action === 'disconnect') {
        await disconnectDrive({ updatedBy: adminUser.username || adminUser.uid || 'admin' });
        sendJson(req, res, 200, { ok: true, disconnected: true });
        return;
      }

      const result = await writeCredentials({
        clientId: body.clientId ?? body.client_id,
        clientSecret: body.clientSecret ?? body.client_secret,
        folderName: body.folderName ?? body.folder_name,
        updatedBy: adminUser.username || adminUser.uid || 'admin',
      });
      const stored = await readStoredConfig({ forceRefresh: true });
      const consentUrl = buildConsentUrl({
        clientId: stored.clientId,
        redirectUri,
        state: adminUser.username || adminUser.uid || 'admin',
      });
      sendJson(req, res, 200, { ...result, redirectUri, consentUrl, connected: Boolean(stored.refreshToken) });
    } catch (error) {
      sendJson(req, res, 400, { error: error?.message || 'Gagal menyimpan konfigurasi backup Drive.', code: 'write_failed' });
    }
    return;
  }

  sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
};
