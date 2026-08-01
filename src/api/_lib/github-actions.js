/**
 * github-actions.js — memicu workflow backup di GitHub Actions dari server.
 *
 * MENGAPA LEWAT SERVER, BUKAN LANGSUNG DARI PERAMBAN
 * --------------------------------------------------
 * Memicu workflow memerlukan GitHub Personal Access Token. Token itu memberi
 * kuasa menjalankan workflow pada repository, jadi ia TIDAK BOLEH sampai ke
 * peramban. Berkas ini berjalan di fungsi serverless: peramban hanya mengirim
 * "tolong jalankan backup", dan tokennya tetap di server.
 *
 * MENGAPA MEMICU WORKFLOW, BUKAN MEMBANGUN BACKUP DI PERAMBAN
 * -----------------------------------------------------------
 * Backup dijalankan oleh kode yang sama persis dengan jadwal mingguan, di tempat
 * yang sama. Tidak ada logika kedua yang bisa menyimpang, dan peramban admin tidak
 * perlu membaca ribuan dokumen Firestore. Nol operasi baca dari sisi admin.
 *
 * Variabel lingkungan (disetel di Vercel):
 *   GITHUB_BACKUP_TOKEN  (wajib)   fine-grained PAT, izin "Actions: Read and write"
 *                                  pada repository ini saja
 *   GITHUB_REPO          (opsional) "pemilik/nama-repo", default di bawah
 *   GITHUB_BRANCH        (opsional) branch tempat workflow berada, default "main"
 *   GITHUB_WORKFLOW_FILE (opsional) nama berkas workflow, default di bawah
 */

const DEFAULT_REPO = 'iimamhk/SIMSMANSARI';
const DEFAULT_BRANCH = 'main';
const DEFAULT_WORKFLOW = 'backup-snapshot.yml';
const GITHUB_API = 'https://api.github.com';

function readSettings() {
  const repo = String(process.env.GITHUB_REPO || DEFAULT_REPO).trim().replace(/^\/+|\/+$/g, '');
  return {
    token: String(process.env.GITHUB_BACKUP_TOKEN || '').trim(),
    repo,
    branch: String(process.env.GITHUB_BRANCH || DEFAULT_BRANCH).trim(),
    workflow: String(process.env.GITHUB_WORKFLOW_FILE || DEFAULT_WORKFLOW).trim(),
  };
}

/** Apakah fitur ini siap dipakai, tanpa membocorkan nilai token. */
function getWorkflowStatus() {
  const s = readSettings();
  const runsUrl = `https://github.com/${s.repo}/actions/workflows/${s.workflow}`;
  return {
    configured: Boolean(s.token),
    repo: s.repo,
    branch: s.branch,
    workflow: s.workflow,
    runsUrl,
    reason: s.token
      ? ''
      : 'Token GitHub belum disetel. Tambahkan variabel lingkungan GITHUB_BACKUP_TOKEN di Vercel.',
  };
}

/**
 * Ubah kode status GitHub menjadi penjelasan yang dapat ditindaklanjuti.
 * Pesan generik seperti "HTTP 404" membuat admin tidak tahu harus berbuat apa.
 */
function describeError(status, body, s) {
  const detail = String(body?.message || '').trim();
  if (status === 401) {
    return 'Token GitHub tidak diterima (kedaluwarsa atau salah). Buat token baru, '
      + 'lalu perbarui variabel GITHUB_BACKUP_TOKEN di Vercel dan deploy ulang.';
  }
  if (status === 403) {
    return 'Token GitHub ada, tetapi tidak berizin menjalankan workflow. Pada halaman '
      + 'token, bagian Permissions, setel "Actions" menjadi "Read and write".';
  }
  if (status === 404) {
    return `GitHub tidak menemukan workflow "${s.workflow}" pada repository "${s.repo}". `
      + 'Periksa: (1) token diberi akses ke repository tersebut, (2) nama repository '
      + 'benar, (3) berkas workflow sudah ada di branch yang dituju.';
  }
  if (status === 422) {
    return `GitHub menolak permintaan: branch "${s.branch}" tidak ditemukan, atau workflow `
      + `belum memiliki pemicu manual (workflow_dispatch). ${detail}`.trim();
  }
  return `GitHub menolak permintaan (HTTP ${status}). ${detail}`.trim();
}

/**
 * Jalankan workflow backup sekarang.
 *
 * @param {object} [options]
 * @param {boolean} [options.skipDrive]  lewati unggah ke Google Drive
 * @param {boolean} [options.skipExcel]  lewati pembuatan Excel per guru
 * @param {string}  [options.extraCollections] koleksi tambahan, dipisah koma
 * @param {string}  [options.triggeredBy] nama admin, untuk pencatatan
 * @returns {Promise<{ok:boolean, runsUrl?:string, reason?:string}>}
 */
async function triggerBackupWorkflow(options = {}) {
  const s = readSettings();
  const status = getWorkflowStatus();
  if (!status.configured) {
    return { ok: false, reason: status.reason };
  }

  const inputs = {
    skip_drive: options.skipDrive ? 'true' : 'false',
    skip_excel: options.skipExcel ? 'true' : 'false',
    extra_collections: String(options.extraCollections || ''),
    max_reads: '45000',
  };

  const url = `${GITHUB_API}/repos/${s.repo}/actions/workflows/${encodeURIComponent(s.workflow)}/dispatches`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'SIMSMANSARI-Backup',
      },
      body: JSON.stringify({ ref: s.branch, inputs }),
    });
  } catch (error) {
    return { ok: false, reason: `Tidak dapat menghubungi GitHub: ${error.message}` };
  }

  // GitHub membalas 204 No Content bila berhasil — tanpa isi, tanpa ID run.
  if (response.status === 204) {
    return { ok: true, runsUrl: status.runsUrl };
  }

  let body = {};
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : {};
  } catch { body = {}; }

  return { ok: false, reason: describeError(response.status, body, s), status: response.status };
}

module.exports = { getWorkflowStatus, triggerBackupWorkflow };
