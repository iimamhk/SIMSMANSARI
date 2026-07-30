/**
 * Berikan access token Google Drive berumur pendek kepada klien yang sudah login.
 *
 * Unggahan berkas dilakukan langsung dari browser ke Google Drive, bukan melalui
 * fungsi serverless, karena batas ukuran body Vercel (±4,5 MB) lebih kecil
 * daripada ukuran backup Excel yang mungkin dihasilkan. Server hanya:
 * - menukar refresh token (tersimpan terenkripsi) menjadi access token,
 * - memastikan folder tujuan tersedia,
 * - mencatat metadata unggahan terakhir.
 *
 * Access token yang dikirim ke browser hanya bercakupan `drive.file`, yaitu
 * hanya berkas yang dibuat oleh aplikasi ini, dan berumur sekitar satu jam.
 */

const { getAuth } = require('../_lib/firebase-admin');
const { handleOptions, sendJson } = require('../_lib/ai');
const { ensureBackupFolder, getAccessToken, recordUpload } = require('../_lib/backup-config');

const ALLOWED_ROLES = ['admin', 'guru'];

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

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const user = await requireUser(req);
  if (!user) {
    sendJson(req, res, 401, { error: 'Login sebagai guru atau admin diperlukan.', code: 'unauthorized' });
    return;
  }

  // Catat hasil unggahan yang sudah dilakukan browser.
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      await recordUpload({
        fileName: body.fileName ?? body.file_name,
        fileId: body.fileId ?? body.file_id,
        size: body.size,
        uploadedBy: user.username || user.uid || '',
      });
      sendJson(req, res, 200, { ok: true });
    } catch (error) {
      sendJson(req, res, 500, { error: 'Gagal mencatat metadata unggahan.', code: 'record_failed' });
    }
    return;
  }

  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  try {
    const { accessToken, expiresIn, config } = await getAccessToken();
    const folderId = await ensureBackupFolder({ accessToken, config });
    sendJson(req, res, 200, {
      ok: true,
      accessToken,
      expiresIn,
      folderId,
      folderName: config.folderName,
      accountEmail: config.accountEmail,
    });
  } catch (error) {
    // 409 dipakai agar klien dapat membedakan "belum dikonfigurasi" dari kegagalan lain.
    sendJson(req, res, 409, {
      ok: false,
      error: error?.message || 'Google Drive tidak tersedia.',
      code: 'drive_unavailable',
    });
  }
};
