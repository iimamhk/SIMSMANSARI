// ============================================================================
// system-backup.js
// Backup data sistem tingkat admin: membangun satu berkas Excel PER GURU untuk
// seluruh guru pada periode aktif (format identik dengan backup guru), dikemas
// dalam satu arsip ZIP, lalu diunggah ke Google Drive memakai koneksi Drive admin.
//
// Kenapa ZIP per guru (bukan satu workbook gabungan): nama sheet Excel harus
// unik dalam satu workbook. Bila dua guru mengajar kelas yang sama, sheet mereka
// bentrok dan hanya satu guru yang datanya masuk. Memisahkan berkas per guru
// menghilangkan bentrok itu dan memudahkan pembagian berkas ke tiap guru.
//
// Unggahan berjalan di browser admin memakai access token berumur pendek dari
// server, sehingga tidak menambah fungsi serverless baru.
// ============================================================================

import { getStoredContext } from './helpers.js';
import { buildSystemBackupZip } from './backup-excel.js';
import { uploadBackupToDrive } from './drive-upload.js';
import { appendBackupLog } from '../firebase/auth-service.js';

const ZIP_MIME = 'application/zip';

function pad(n) {
  return String(n).padStart(2, '0');
}

function buildFileName(date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `Backup-Sistem-SIMSMANSARI-${stamp}.zip`;
}

/**
 * Bangun arsip ZIP (satu Excel per guru), unggah ke Google Drive, dan catat
 * hasilnya ke riwayat backup.
 *
 * @param {object} [options]
 * @param {'manual'|'otomatis'|'tes'} [options.type] Jenis backup untuk pelabelan riwayat.
 * @param {(p:{current:number,total:number,label:string})=>void} [options.onProgress]
 * @returns {Promise<{uploaded:boolean, fileName:string, guruCount:number, assignments:number, reason?:string, webViewLink?:string}>}
 */
export async function runSystemBackupToDrive(options = {}) {
  const { type = 'manual', onProgress = () => {} } = options;
  const report = (label, current, total) => {
    try { onProgress({ current, total, label }); } catch { /* abaikan */ }
  };

  let blob;
  const fileName = buildFileName();
  let guruCount = 0;
  let assignments = 0;

  try {
    const context = getStoredContext();
    report('Mengumpulkan data seluruh guru...', 0, 1);
    const built = await buildSystemBackupZip(context, onProgress);
    blob = built.blob;
    guruCount = built.guruCount;
    assignments = built.assignmentsCount;
  } catch (error) {
    const message = error?.message || 'Gagal menyusun berkas backup.';
    await appendBackupLog({ logType: type, status: 'error', message });
    return { uploaded: false, fileName: '', guruCount: 0, assignments: 0, reason: message };
  }

  report('Mengunggah ke Google Drive...', 1, 1);
  const result = await uploadBackupToDrive(blob, fileName, {
    mimeType: ZIP_MIME,
    force: true,
    logType: type,
    onProgress: (text) => report(text, 1, 1),
  });

  if (!result.uploaded) {
    // uploadBackupToDrive tidak menulis riwayat saat gagal, jadi catat di sini.
    await appendBackupLog({
      logType: type,
      status: 'error',
      fileName,
      size: blob.size,
      message: result.reason || 'Unggahan Drive gagal.',
    });
    return { uploaded: false, fileName, guruCount, assignments, reason: result.reason };
  }

  // Unggahan sukses sudah dicatat oleh uploadBackupToDrive (record-upload).
  return {
    uploaded: true,
    fileName: result.fileName || fileName,
    guruCount,
    assignments,
    webViewLink: result.webViewLink || '',
    folderName: result.folderName || '',
  };
}
