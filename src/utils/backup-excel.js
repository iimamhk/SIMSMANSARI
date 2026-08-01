// ============================================================================
// backup-excel.js
// Backup data absensi & penilaian per-guru, dijalankan di browser.
// - Memakai session guru yang sedang login (Firestore Rules request.auth != null)
// - Memakai ExcelJS untuk styling Excel profesional (fill, border, merge, font)
// - Anti-index-error: query single-field (pengajaran_id) lalu filter client-side
// - Gratis, tanpa server, tanpa service account, tanpa cloud berbayar
// ============================================================================

import { getStoredContext } from './helpers.js';
import { isDriveUploadEnabled, uploadBackupToDrive } from './drive-upload.js';
import {
  getTeachingAssignmentsForUser,
  getClassMembers,
  getDocumentsWhere,
} from '../firebase/data-service.js';
import { addBackupHistory, computeChecksum } from './backup-history.js';
import { recordExport } from './backup-policy.js';
import {
  INSTITUTION_NAME,
  addGuideSheet,
  buildAbsensiHarianSheet,
  buildKeaktifanSheet,
  buildRekapAbsensiSheet,
  buildRekapNilaiSheet,
  formatDateTimeDisplay,
  normalizeAssignmentData,
} from './excel-sheets.js';

const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const BACKUP_TS_KEY = 'simguru_backup_last_run';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

export function getLastBackupTimestamp() {
  try {
    const raw = localStorage.getItem(BACKUP_TS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Catat satu ekspor yang baru selesai.
 *
 * Seluruh aturan kuota dan bentuk penyimpanannya berada di
 * src/utils/backup-policy.js supaya hanya ada satu sumber kebenaran. Fungsi ini
 * tinggal meneruskan, dan namanya dipertahankan agar pemanggil lama tetap jalan.
 *
 * recordExport() menulis DUA penanda: daftar riwayat ekspor (untuk menghitung
 * pemakaian kuota mingguan) dan penanda ekspor terakhir (dipakai dasbor serta
 * pengingat). Sebelumnya berkas ini hanya menulis penanda terakhir, sehingga
 * jumlah ekspor per minggu tidak dapat dihitung.
 */
export function setLastBackupTimestamp(meta = {}) {
  recordExport(meta);
}

async function ensureExcelJSLoaded() {
  if (window.ExcelJS && window.ExcelJS.Workbook) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EXCELJS_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat ExcelJS dari CDN. Periksa koneksi internet.'));
    document.head.appendChild(s);
  });
  if (!window.ExcelJS || !window.ExcelJS.Workbook) {
    throw new Error('ExcelJS gagal dimuat.');
  }
}


function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Kirim backup sesuai tujuan yang dipilih guru.
 *
 * @param {Blob} blob
 * @param {string} fileName
 * @param {(p:object)=>void} [onProgress]
 * @param {object} [options]
 * @param {'local'|'drive'|'both'} [options.destination] Tujuan pengiriman.
 *   - 'local': hanya unduh ke perangkat.
 *   - 'drive': hanya unggah ke Google Drive (tidak mengunduh).
 *   - 'both' : unduh ke perangkat lalu unggah ke Drive (perilaku lama).
 *   Bila tidak diisi, mengikuti preferensi toggle Drive: 'both' saat aktif,
 *   'local' saat nonaktif.
 * @param {string} [options.mimeType] MIME type untuk unggahan Drive.
 * @param {string} [options.logType] Label tipe untuk riwayat backup.
 * @returns {Promise<{uploaded:boolean, downloaded:boolean, reason?:string, webViewLink?:string, folderName?:string}>}
 */
async function deliverBackupBlob(blob, fileName, onProgress = () => {}, options = {}) {
  const destination = options.destination || (isDriveUploadEnabled() ? 'both' : 'local');
  const wantLocal = destination === 'local' || destination === 'both';
  const wantDrive = destination === 'drive' || destination === 'both';

  // Pelaporan progres memakai bentuk { current, total, label } seperti pemanggil lain.
  const report = (label) => {
    try { onProgress({ current: 1, total: 1, label }); } catch { /* abaikan */ }
  };

  let downloaded = false;
  if (wantLocal) {
    downloadBlob(blob, fileName);
    downloaded = true;
    report('Tersimpan ke perangkat.');
  }

  if (!wantDrive) {
    return { uploaded: false, downloaded, reason: destination === 'local' ? 'Hanya backup lokal dipilih.' : undefined };
  }

  try {
    const result = await uploadBackupToDrive(blob, fileName, {
      // Tujuan Drive dipilih eksplisit oleh guru, jadi paksa unggah walau toggle mati.
      force: true,
      mimeType: options.mimeType,
      logType: options.logType || 'guru',
      onProgress: (text) => report(text),
    });
    report(result.uploaded ? 'Terunggah ke Google Drive.' : `Drive: ${result.reason}`);
    return { ...result, downloaded };
  } catch (error) {
    // Kegagalan Drive tidak boleh membatalkan backup yang mungkin sudah terunduh.
    console.warn('Unggahan Drive gagal:', error);
    return { uploaded: false, downloaded, reason: error?.message || 'Unggahan Drive gagal.' };
  }
}

// Ambil dokumen dengan filter pengajaran_id + periode, fallback filter client-side
// agar tidak bergantung pada composite index Firestore.
async function fetchScoped(collection, context, pengajaranId) {
  const { tahun_ajaran_aktif: year, semester_aktif: semester } = context || {};
  try {
    const docs = await getDocumentsWhere(collection, [
      { field: 'pengajaran_id', operator: '==', value: pengajaranId },
    ], { cacheMs: 90000 });
    return docs.filter((d) =>
      String(d.tahun_ajaran_id || '') === String(year || '') &&
      String(d.semester_id || '') === String(semester || '')
    );
  } catch (e) {
    console.warn(`Gagal mengambil ${collection}:`, e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ambil data satu pengajaran lalu tambahkan 4 sheet (rekap absensi, absensi
 * harian, rekap nilai, keaktifan) ke workbook.
 *
 * Pemetaan dokumen mentah dan pembangunan sheet dikerjakan oleh
 * src/utils/excel-sheets.js, modul yang sama yang dipakai pembuatan Excel
 * mingguan di server. Dengan begitu berkas yang diunduh guru dan berkas yang
 * tersimpan di Google Drive punya bentuk yang persis sama.
 */
async function appendAssignmentSheets(workbook, assignment, context, userName) {
  const pid = assignment.id;
  const members = await getClassMembers(context, assignment.kelas_id);
  const [
    absensi, nilaiTugasDocs, nilaiUjianDocs, babDocs, tugasDocs, uhKolomDocs, keaktifanDocs,
  ] = await Promise.all([
    fetchScoped('absensi', context, pid),
    fetchScoped('nilai_tugas', context, pid),
    fetchScoped('nilai_ujian', context, pid),
    fetchScoped('bab', context, pid),
    fetchScoped('tugas_bab', context, pid),
    fetchScoped('ulangan_harian_kolom', context, pid),
    fetchScoped('keaktifan_siswa', context, pid),
  ]);

  const data = normalizeAssignmentData({
    babDocs, tugasDocs, uhKolomDocs, nilaiTugasDocs, nilaiUjianDocs,
  });

  buildRekapAbsensiSheet(workbook, assignment, members, absensi, context, userName);
  buildAbsensiHarianSheet(workbook, assignment, members, absensi, context, userName);
  buildRekapNilaiSheet(workbook, assignment, members, data, context, userName);
  buildKeaktifanSheet(workbook, assignment, members, keaktifanDocs, context, userName);
}

export async function buildGuruBackupWorkbook(context, userId, userName, onProgress = () => {}) {
  await ensureExcelJSLoaded();
  const ExcelJS = window.ExcelJS;

  const assignments = await getTeachingAssignmentsForUser(context, userId);
  if (!assignments.length) {
    throw new Error('Tidak ada data pengajaran untuk Anda pada periode aktif. Backup dibatalkan.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIM SMANSARI Backup';
  workbook.lastModifiedBy = userName || 'Guru';
  workbook.created = new Date();
  workbook.modified = new Date();

  addGuideSheet(workbook, {
    userName,
    context,
    scope: `Backup penuh: ${assignments.length} pengajaran (kelas × mata pelajaran) yang diampu.`,
  });

  let processed = 0;

  for (const assignment of assignments) {
    const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Kelas';
    const mapelNama = assignment.mapel_nama || 'Mapel';

    onProgress({
      label: `${kelasNama} • ${mapelNama}`,
      current: processed + 1,
      total: assignments.length,
    });

    await appendAssignmentSheets(workbook, assignment, context, userName);
    processed++;
  }

  return workbook;
}

/**
 * CATATAN: buildSystemBackupWorkbook() dan buildSystemBackupZip() DIHAPUS.
 *
 * Keduanya membangun backup SELURUH SEKOLAH di dalam tab peramban admin:
 * memanggil getActiveTeachingAssignments() lalu, untuk setiap pengajaran,
 * menjalankan 7 query Firestore. Untuk 40 guru x 5 kelas itu berarti sekitar
 * 200.000 operasi baca dalam sekali jalan — empat kali kuota harian Firestore
 * paket gratis (50.000/hari) — sekaligus menahan ratusan megabyte di memori tab.
 *
 * Backup seluruh sekolah kini dikerjakan server, sekali seminggu, pada hari yang
 * tidak ada kegiatan mengajar: scripts/backup-snapshot.js yang dijalankan oleh
 * .github/workflows/backup-snapshot.yml setiap Minggu 01:00 WIB.
 */

export async function exportGuruBackupExcel(onProgress = () => {}, options = {}) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const userName = session?.user?.nama || 'Guru';
  if (!userId) throw new Error('Sesi guru tidak ditemukan. Silakan login kembali.');

  const workbook = await buildGuruBackupWorkbook(context, userId, userName, onProgress);

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = String(userName).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  const fileName = `Backup-SIMSMANSARI-${safeName}-${dateStr}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const startedAt = Date.now();
  const delivery = await deliverBackupBlob(blob, fileName, onProgress, {
    destination: options.destination,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    logType: 'guru',
  });

  const sheetCount = workbook.worksheets.length;
  // Setiap pengajaran menghasilkan 4 sheet (rekap absen, absen harian, nilai,
  // keaktifan), ditambah 1 sheet "Petunjuk" di depan.
  const assignmentsCount = Math.max(0, Math.ceil((sheetCount - 1) / 4));

  // Catat ke riwayat lokal agar tab Riwayat selalu terisi (dulu hanya selektif).
  try {
    const checksum = await computeChecksum(blob);
    await addBackupHistory({
      fileName,
      fileSize: blob.size,
      checksum,
      assignmentsCount,
      tahunAjaranId: context?.tahun_ajaran_aktif || '',
      semesterId: context?.semester_aktif || '',
      backupType: 'full',
      format: 'xlsx',
      durationMs: Date.now() - startedAt,
      destination: options.destination || 'local',
      driveUploaded: delivery.uploaded === true,
      driveWebViewLink: delivery.webViewLink || '',
      driveFolderLink: delivery.folderLink || '',
    });
  } catch (e) {
    console.warn('Gagal mencatat riwayat backup penuh:', e);
  }

  setLastBackupTimestamp({
    guru_id: userId,
    guru_nama: userName,
    tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
    semester_id: context?.semester_aktif || '',
    file_name: fileName,
    drive_uploaded: delivery.uploaded === true,
  });

  return { fileName, assignments_count: assignmentsCount, drive: delivery };
}

/**
 * CATATAN: uploadGuruBackupSilently() DIHAPUS.
 *
 * Fungsi ini mengunggah backup seorang guru ke Drive secara diam-diam setiap
 * kali guru itu membuka aplikasi dan jadwalnya dianggap jatuh tempo. Masalahnya:
 *
 *  - Biayanya sekitar 5.000 operasi baca Firestore per guru per jalan, dipicu
 *    tanpa sepengetahuan guru. Dengan puluhan guru, kuota harian habis sendiri.
 *  - Kegagalannya tidak pernah tercatat di mana pun (hanya console.info), jadi
 *    admin tidak punya cara mengetahui backup sudah gagal berminggu-minggu.
 *  - Penandanya memakai localStorage yang sama dengan ekspor manual, sehingga
 *    guru yang mengunduh berkas secara manual justru mematikan unggahan otomatis
 *    miliknya sendiri tanpa ada apa pun yang benar-benar sampai ke Drive.
 *
 * Penggantinya: guru mengekspor sendiri, maksimal 3 kali per minggu (dengan status yang
 * terlihat jelas di dasbor), dan cadangan seluruh sekolah dikerjakan server
 * setiap Minggu dini hari lewat scripts/backup-snapshot.js.
 */

// ============================================================================
// NEW: Selective Backup (per kelas, per tipe data)
// ============================================================================

export const BACKUP_DATA_TYPES = {
  ABSENSI_REKAP: {
    key: 'absensi_rekap',
    label: 'Rekap Absensi',
    description: 'Jumlah Hadir, Sakit, Izin, Alpa, dan persentase kehadiran per siswa.',
    icon: '📊',
  },
  ABSENSI_HARIAN: {
    key: 'absensi_harian',
    label: 'Absensi Harian',
    description: 'Status kehadiran setiap siswa untuk setiap tanggal pertemuan.',
    icon: '📅',
  },
  NILAI_REKAP: {
    key: 'nilai_rekap',
    label: 'Rekap Nilai',
    description: 'Nilai tugas, ulangan harian, PTS, PAS, nilai akhir, dan grade.',
    icon: '📈',
  },
  KEAKTIFAN: {
    key: 'keaktifan',
    label: 'Keaktifan Siswa',
    description: 'Jumlah bertanya, menjawab, diskusi, presentasi, tugas kelas, dan predikat.',
    icon: '✨',
  },
};

export async function buildSelectiveBackupWorkbook(
  context,
  userId,
  userName,
  selectedAssignments,
  selectedDataTypes,
  onProgress = () => {}
) {
  await ensureExcelJSLoaded();
  const ExcelJS = window.ExcelJS;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIM SMANSARI Backup (Selective)';
  workbook.lastModifiedBy = userName || 'Guru';
  workbook.created = new Date();
  workbook.modified = new Date();

  const scopeLabels = selectedDataTypes
    .map((key) => Object.values(BACKUP_DATA_TYPES).find((t) => t.key === key)?.label || key)
    .join(', ');
  addGuideSheet(workbook, {
    userName,
    context,
    scope: `Backup selektif: ${selectedAssignments.length} pengajaran • tipe data: ${scopeLabels || '-'}.`,
  });

  let processed = 0;

  for (const assignment of selectedAssignments) {
    const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Kelas';
    const mapelNama = assignment.mapel_nama || 'Mapel';
    const pid = assignment.id;

    onProgress({
      label: `${kelasNama} • ${mapelNama}`,
      current: processed + 1,
      total: selectedAssignments.length,
    });

    const members = await getClassMembers(context, assignment.kelas_id);
    // Keaktifan hanya diambil bila memang dipilih, agar tidak memakai kuota baca
    // untuk data yang tidak akan ditulis ke berkas.
    const perluKeaktifan = selectedDataTypes.includes(BACKUP_DATA_TYPES.KEAKTIFAN.key);
    const [
      absensi, nilaiTugasDocs, nilaiUjianDocs, babDocs, tugasDocs, uhKolomDocs, keaktifanDocs,
    ] = await Promise.all([
      fetchScoped('absensi', context, pid),
      fetchScoped('nilai_tugas', context, pid),
      fetchScoped('nilai_ujian', context, pid),
      fetchScoped('bab', context, pid),
      fetchScoped('tugas_bab', context, pid),
      fetchScoped('ulangan_harian_kolom', context, pid),
      perluKeaktifan ? fetchScoped('keaktifan_siswa', context, pid) : Promise.resolve([]),
    ]);

    const data = normalizeAssignmentData({
      babDocs, tugasDocs, uhKolomDocs, nilaiTugasDocs, nilaiUjianDocs,
    });

    // Build sheets based on selected data types
    if (selectedDataTypes.includes(BACKUP_DATA_TYPES.ABSENSI_REKAP.key)) {
      buildRekapAbsensiSheet(workbook, assignment, members, absensi, context, userName);
    }
    if (selectedDataTypes.includes(BACKUP_DATA_TYPES.ABSENSI_HARIAN.key)) {
      buildAbsensiHarianSheet(workbook, assignment, members, absensi, context, userName);
    }
    if (selectedDataTypes.includes(BACKUP_DATA_TYPES.NILAI_REKAP.key)) {
      buildRekapNilaiSheet(workbook, assignment, members, data, context, userName);
    }
    if (perluKeaktifan) {
      buildKeaktifanSheet(workbook, assignment, members, keaktifanDocs, context, userName);
    }

    processed++;
  }

  return workbook;
}

export async function exportSelectiveBackupExcel(
  context,
  userId,
  userName,
  selectedAssignments,
  selectedDataTypes,
  onProgress = () => {},
  options = {}
) {
  const workbook = await buildSelectiveBackupWorkbook(context, userId, userName, selectedAssignments, selectedDataTypes, onProgress);

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = String(userName).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  const typesStr = selectedDataTypes.map((k) => k.slice(0, 3)).join('-');
  const fileName = `Backup-SIMSMANSARI-${safeName}-${dateStr}-${typesStr}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const startedAt = Date.now();
  const delivery = await deliverBackupBlob(blob, fileName, onProgress, {
    destination: options.destination,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    logType: 'guru',
  });

  // Record in history (nama field disamakan dengan addBackupHistory).
  const checksum = await computeChecksum(blob);
  await addBackupHistory({
    fileName,
    fileSize: blob.size,
    checksum,
    assignmentsCount: selectedAssignments.length,
    tahunAjaranId: context?.tahun_ajaran_aktif || '',
    semesterId: context?.semester_aktif || '',
    backupType: 'selective',
    selectedDataTypes,
    format: 'xlsx',
    durationMs: Date.now() - startedAt,
    destination: options.destination || 'local',
    driveUploaded: delivery.uploaded === true,
    driveWebViewLink: delivery.webViewLink || '',
    driveFolderLink: delivery.folderLink || '',
  });

  setLastBackupTimestamp({
    guru_id: userId,
    guru_nama: userName,
    tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
    semester_id: context?.semester_aktif || '',
    file_name: fileName,
    drive_uploaded: delivery.uploaded === true,
  });

  const sheetCount = workbook.worksheets.length;
  return { fileName, assignments_count: selectedAssignments.length, sheets: sheetCount, drive: delivery };
}

