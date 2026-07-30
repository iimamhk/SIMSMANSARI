/**
 * Callback OAuth Google Drive.
 *
 * Google mengarahkan admin ke sini setelah menyetujui izin. Endpoint menukar
 * authorization code menjadi refresh token, menyimpannya terenkripsi, lalu
 * menampilkan halaman konfirmasi ringkas.
 *
 * Endpoint ini tidak memakai Bearer token karena dipanggil langsung oleh
 * browser melalui redirect Google. Keamanannya bertumpu pada:
 * - authorization code sekali pakai dan berumur pendek,
 * - client secret yang hanya ada di server,
 * - redirect URI yang harus cocok persis dengan yang terdaftar di Google Cloud.
 */

const { buildRedirectUri, exchangeCodeForRefreshToken } = require('../_lib/backup-config');

function renderPage({ title, message, tone }) {
  const accent = tone === 'error' ? '#be123c' : '#047857';
  const background = tone === 'error' ? '#fff1f2' : '#ecfdf5';
  const border = tone === 'error' ? '#fecdd3' : '#a7f3d0';
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; padding:24px; }
  main { max-width:520px; width:100%; background:#fff; border:1px solid ${border}; border-radius:18px;
    padding:28px; box-shadow:0 20px 50px -30px rgba(15,23,42,.35); }
  h1 { margin:0 0 10px; font-size:20px; color:${accent}; }
  p { margin:0 0 18px; font-size:14px; line-height:1.65; color:#475569; }
  .badge { display:inline-block; margin-bottom:14px; padding:5px 11px; border-radius:999px;
    background:${background}; color:${accent}; font-size:11px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
  a { display:inline-block; background:#0f172a; color:#fff; text-decoration:none; padding:11px 18px;
    border-radius:10px; font-size:13px; font-weight:700; }
</style></head>
<body><main>
  <span class="badge">Google Drive</span>
  <h1>${title}</h1>
  <p>${message}</p>
  <a href="/#admin/pengaturan">Kembali ke Panel Admin</a>
</main></body></html>`;
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendHtml(res, 405, renderPage({
      title: 'Metode tidak diizinkan',
      message: 'Halaman ini hanya dapat diakses melalui pengalihan dari Google.',
      tone: 'error',
    }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const code = String(url.searchParams.get('code') || '').trim();
  const oauthError = String(url.searchParams.get('error') || '').trim();

  if (oauthError) {
    sendHtml(res, 400, renderPage({
      title: 'Izin ditolak',
      message: `Google menolak permintaan izin (<code>${oauthError}</code>). Coba hubungkan ulang dari panel admin.`,
      tone: 'error',
    }));
    return;
  }

  if (!code) {
    sendHtml(res, 400, renderPage({
      title: 'Kode otorisasi tidak ditemukan',
      message: 'Buka panel admin lalu tekan "Hubungkan Google Drive" untuk memulai proses dari awal.',
      tone: 'error',
    }));
    return;
  }

  try {
    const result = await exchangeCodeForRefreshToken({
      code,
      redirectUri: buildRedirectUri(req),
    });
    const akun = result.accountEmail ? `akun <strong>${result.accountEmail}</strong>` : 'akun Google Anda';
    sendHtml(res, 200, renderPage({
      title: 'Google Drive berhasil dihubungkan',
      message: `Backup akan diunggah ke ${akun}. Anda dapat menutup halaman ini dan kembali ke panel admin untuk menjalankan tes unggah.`,
      tone: 'success',
    }));
  } catch (error) {
    sendHtml(res, 400, renderPage({
      title: 'Gagal menghubungkan Google Drive',
      message: String(error?.message || 'Terjadi kesalahan tidak diketahui.'),
      tone: 'error',
    }));
  }
};
