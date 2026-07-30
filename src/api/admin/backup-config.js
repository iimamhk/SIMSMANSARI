/**
 * Endpoint konfigurasi backup Google Drive (khusus admin).
 *
 * GET  → konfigurasi publik + URL persetujuan Google.
 * POST → simpan Client ID/Secret/nama folder, atau action=disconnect.
 */

const { getAuth } = require('../_lib/firebase-admin');
const { handleOptions, sendJson } = require('../_lib/ai');
const {
  buildConsentUrl,
  buildRedirectUri,
  disconnectDrive,
  getPublicConfig,
  readStoredConfig,
  writeCredentials,
} = require('../_lib/backup-config');

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

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

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
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '').trim();

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
