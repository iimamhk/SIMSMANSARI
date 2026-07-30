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
  getActiveTeachingAssignments,
  getClassMembers,
  getDocumentsWhere,
  batchWrite,
} from '../firebase/data-service.js';
import { addBackupHistory, computeChecksum } from './backup-history.js';

const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const BACKUP_TS_KEY = 'simguru_backup_last_run';
const INSTITUTION_NAME = 'SIM SMANSARI';

// Palet warna (ARGB)
const COLOR = {
  primary: 'FF1F4E79',
  primaryDark: 'FF0F2D52',
  primaryLight: 'FFD6E4F0',
  accent: 'FF2E75B6',
  white: 'FFFFFFFF',
  headerFont: 'FFFFFFFF',
  totalBg: 'FFE6E6E6',
  zebra: 'FFF4F8FC',
  border: 'FFB7C3D0',
  borderDark: 'FF7F8C99',
  // Status absensi
  hadir: 'FFD1FAE5',
  hadirFont: 'FF065F46',
  sakit: 'FFFEF3C7',
  sakitFont: 'FF92400E',
  izin: 'FFDBEAFE',
  izinFont: 'FF1E40AF',
  alpa: 'FFFEE2E2',
  alpaFont: 'FF991B1B',
  keluar: 'FFEDE9FE',
  keluarFont: 'FF5B21B6',
  // Grade
  gradeA: 'FFD1FAE5',
  gradeB: 'FFDBEAFE',
  gradeC: 'FFFEF3C7',
  gradeD: 'FFFEE2E2',
};

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

export function setLastBackupTimestamp(meta = {}) {
  try {
    localStorage.setItem(BACKUP_TS_KEY, JSON.stringify({
      at: new Date().toISOString(),
      ...meta,
    }));
  } catch { /* ignore */ }
}

export function getDaysSinceLastBackup() {
  const last = getLastBackupTimestamp();
  if (!last?.at) return Infinity;
  const ms = Date.now() - new Date(last.at).getTime();
  return Math.floor(ms / 86400000);
}

function isFriday() {
  return new Date().getDay() === 5;
}

export function isBackupRequiredToday() {
  if (isFriday()) return true;
  return getDaysSinceLastBackup() >= 7;
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

async function ensureJSZipLoaded() {
  if (window.JSZip) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat JSZip dari CDN. Periksa koneksi internet.'));
    document.head.appendChild(s);
  });
  if (!window.JSZip) {
    throw new Error('JSZip gagal dimuat.');
  }
}

function sanitizeSheetName(name) {
  return String(name || '').replace(/[[\]:?*\/\\]/g, '').slice(0, 28) || 'Sheet';
}

/**
 * Nama sheet Excel harus unik dalam satu workbook (ExcelJS melempar error bila
 * duplikat). Bila nama dasar sudah dipakai, tambahkan sufiks " (2)", " (3)", ...
 * dengan tetap menjaga batas 31 karakter Excel.
 */
function uniqueSheetName(workbook, baseName) {
  const base = sanitizeSheetName(baseName);
  const taken = new Set(workbook.worksheets.map((w) => w.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 24)} ${Date.now().toString().slice(-6)}`;
}

function formatDate(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return String(date);
  }
}

function formatDateTimeDisplay(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(date);
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
// Styling helpers (ExcelJS)
// ---------------------------------------------------------------------------

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: COLOR.border } },
  left: { style: 'thin', color: { argb: COLOR.border } },
  bottom: { style: 'thin', color: { argb: COLOR.border } },
  right: { style: 'thin', color: { argb: COLOR.border } },
};

const MED_BORDER = {
  top: { style: 'medium', color: { argb: COLOR.borderDark } },
  left: { style: 'thin', color: { argb: COLOR.border } },
  bottom: { style: 'medium', color: { argb: COLOR.borderDark } },
  right: { style: 'thin', color: { argb: COLOR.border } },
};

function applyTitleCell(cell, text) {
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: COLOR.headerFont } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = MED_BORDER;
}

function applySubtitleCell(cell, text) {
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: COLOR.headerFont } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = THIN_BORDER;
}

function applyInfoCell(cell, label, value) {
  cell.value = `${label}: ${value}`;
  cell.font = { size: 10, color: { argb: 'FF334155' }, bold: true };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primaryLight } };
  cell.border = THIN_BORDER;
}

function applyHeaderCell(cell, text) {
  cell.value = text;
  cell.font = { bold: true, size: 10, color: { argb: COLOR.headerFont } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = MED_BORDER;
}

function applyDataCell(cell, rowIdx, opts = {}) {
  cell.font = { size: 10, color: { argb: 'FF1E293B' }, bold: opts.bold || false };
  cell.alignment = {
    horizontal: opts.align || 'center',
    vertical: 'center',
    wrapText: opts.wrap || false,
  };
  cell.border = THIN_BORDER;
  if (rowIdx % 2 === 1) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.zebra } };
  }
  if (opts.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  }
  if (opts.fontColor) {
    cell.font = { ...cell.font, color: { argb: opts.fontColor }, bold: opts.bold || false };
  }
}

function applyTotalCell(cell, text, align = 'center') {
  cell.value = text;
  cell.font = { bold: true, size: 10, color: { argb: 'FF1E293B' } };
  cell.alignment = { horizontal: align, vertical: 'middle' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.totalBg } };
  cell.border = MED_BORDER;
}

// Tulis blok header institusi di atas sheet. Mengembalikan baris berikutnya (header tabel).
function writeInstitutionHeader(sheet, totalColumns, title, infoPairs) {
  const cols = Math.max(totalColumns, 1);

  // Row 1: Judul utama
  const row1 = sheet.getRow(1);
  row1.height = 26;
  applyTitleCell(row1.getCell(1), title);
  sheet.mergeCells(1, 1, 1, cols);

  // Row 2: Nama institusi
  const row2 = sheet.getRow(2);
  row2.height = 18;
  applySubtitleCell(row2.getCell(1), INSTITUTION_NAME);
  sheet.mergeCells(2, 1, 2, cols);

  // Row 3-4: Info berpasangan (2 per baris)
  let infoRow = 3;
  const halfCol = Math.ceil(cols / 2);
  for (let i = 0; i < infoPairs.length; i += 2) {
    const row = sheet.getRow(infoRow);
    row.height = 16;
    const left = infoPairs[i];
    const right = infoPairs[i + 1];
    if (left) {
      applyInfoCell(row.getCell(1), left.label, left.value);
      sheet.mergeCells(infoRow, 1, infoRow, halfCol);
    }
    if (right && halfCol + 1 <= cols) {
      applyInfoCell(row.getCell(halfCol + 1), right.label, right.value);
      sheet.mergeCells(infoRow, halfCol + 1, infoRow, cols);
    }
    infoRow++;
  }

  // Baris pemisah kosong
  sheet.getRow(infoRow).height = 6;
  return infoRow + 1;
}

// Estimasi lebar karakter sebuah nilai (akomodasi karakter lebar & angka)
function estimateTextWidth(value) {
  if (value === null || value === undefined) return 0;
  let text;
  if (typeof value === 'object') {
    if (value.text) text = String(value.text);
    else if (value.result !== undefined) text = String(value.result);
    else if (value.formula) text = String(value.formula);
    else if (value.richText) text = value.richText.map((r) => r.text || '').join('');
    else text = '';
  } else {
    text = String(value);
  }
  if (!text) return 0;
  // Karakter lebar (CJK, emoji) dihitung ~2 unit, sisanya 1 unit
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (code >= 0x1100 && (
      code <= 0x115F || // Hangul Jamo
      code === 0x2329 || code === 0x232A ||
      (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) || // CJK
      (code >= 0xAC00 && code <= 0xD7A3) || // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF00 && code <= 0xFF60) || // Fullwidth
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      code >= 0x20000 // CJK Extension
    )) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// Cari rentang merge yang mengandung sebuah cell.
// Mengembalikan { startCol, endCol, spanCols } atau null.
function findMergeRange(sheet, cell) {
  const target = cell.address;
  // ExcelJS menyimpan merge di sheet._merges (map address -> range)
  const merges = sheet._merges || sheet.model?.merges || {};
  for (const key of Object.keys(merges)) {
    const merge = merges[key];
    const model = merge?.model || merge;
    if (!model) continue;
    if (target === model.topLeft || target === model.bottomRight) {
      return { startCol: model.left, endCol: model.right, spanCols: model.right - model.left + 1 };
    }
    if (model.top <= cell.row && cell.row <= model.bottom && model.left <= cell.col && cell.col <= model.right) {
      return { startCol: model.left, endCol: model.right, spanCols: model.right - model.left + 1 };
    }
  }
  return null;
}

// Sesuaikan lebar tiap kolom berdasarkan isi cell terlebar.
// startRow: baris mulai yang dihitung (lewati merged header institusi).
// Cell merged non-top-left diabaikan. Cell merged top-left dibagi rata ke
// jumlah kolom yang di-merge agar teks panjang tidak membuat tiap kolom jadi lebar.
function autoFitColumns(sheet, startRow, minWidth = 8, maxWidth = 48) {
  sheet.columns.forEach((col) => {
    let maxLen = minWidth;
    col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber < startRow) return;
      if (!cell.isMerged) {
        const len = estimateTextWidth(cell.value);
        if (len > maxLen) maxLen = len;
        return;
      }
      // Cell merged: hanya hitung dari top-left
      if (cell.master && cell.master.address !== cell.address) return;
      const range = findMergeRange(sheet, cell);
      const span = range?.spanCols || 1;
      const len = estimateTextWidth(cell.value);
      // Bagi rata teks ke seluruh kolom yang di-merge
      const perCol = Math.ceil(len / span);
      if (perCol > maxLen) maxLen = perCol;
    });
    col.width = Math.max(minWidth, Math.min(maxLen + 3, maxWidth));
  });
}

function statusStyle(status) {
  switch (status) {
    case 'H': return { fill: COLOR.hadir, fontColor: COLOR.hadirFont, bold: true };
    case 'S': return { fill: COLOR.sakit, fontColor: COLOR.sakitFont, bold: true };
    case 'I': return { fill: COLOR.izin, fontColor: COLOR.izinFont, bold: true };
    case 'A': return { fill: COLOR.alpa, fontColor: COLOR.alpaFont, bold: true };
    case 'K': return { fill: COLOR.keluar, fontColor: COLOR.keluarFont, bold: true };
    default: return {};
  }
}

function gradeStyle(grade) {
  if (!grade) return {};
  if (grade.startsWith('A')) return { fill: COLOR.gradeA, fontColor: COLOR.hadirFont, bold: true };
  if (grade.startsWith('B')) return { fill: COLOR.gradeB, fontColor: COLOR.izinFont, bold: true };
  if (grade.startsWith('C')) return { fill: COLOR.gradeC, fontColor: COLOR.sakitFont, bold: true };
  return { fill: COLOR.gradeD, fontColor: COLOR.alpaFont, bold: true };
}

function buildInfoPairs(assignment, context, userName) {
  const periodNama = context?.tahun_ajaran_aktif_nama && context?.semester_aktif_nama
    ? `${context.tahun_ajaran_aktif_nama} / ${context.semester_aktif_nama}`
    : `${context?.tahun_ajaran_aktif || '-'} / ${context?.semester_aktif || '-'}`;
  return [
    { label: 'Guru', value: userName || assignment?.guru_nama || '-' },
    { label: 'Mata Pelajaran', value: assignment?.mapel_nama || '-' },
    { label: 'Kelas', value: assignment?.kelas_nama || assignment?.kelas_id || '-' },
    { label: 'Periode', value: periodNama },
    { label: 'Tanggal Backup', value: formatDateTimeDisplay(new Date()) },
    { label: 'Pengajaran ID', value: String(assignment?.id || '-').slice(0, 24) },
  ];
}

function sortMembers(members) {
  return members.slice().sort((a, b) =>
    String(a.siswa_nama || '').localeCompare(String(b.siswa_nama || '')));
}

// ---------------------------------------------------------------------------
// Sheet builders (ExcelJS)
// ---------------------------------------------------------------------------

function buildRekapAbsensiSheet(workbook, assignment, members, absensi, context, userName) {
  const headers = ['No', 'Nama Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Keluar', 'Total', '% Kehadiran'];
  const sheet = workbook.addWorksheet(uniqueSheetName(workbook, `Rekap Absen ${assignment.kelas_nama || assignment.kelas_id}`), {
    views: [{ state: 'frozen' }],
    properties: { defaultRowHeight: 18 },
  });

  const headerRowNum = writeInstitutionHeader(sheet, headers.length, 'REKAPITULASI ABSENSI SISWA', buildInfoPairs(assignment, context, userName));

  // Header tabel
  const hdrRow = sheet.getRow(headerRowNum);
  hdrRow.height = 30;
  headers.forEach((h, i) => applyHeaderCell(hdrRow.getCell(i + 1), h));

  // Data
  const rekap = {};
  absensi.forEach((a) => {
    const sid = a.siswa_id || '';
    if (!rekap[sid]) rekap[sid] = { H: 0, S: 0, I: 0, A: 0, K: 0, Total: 0 };
    if (rekap[sid][a.status] !== undefined) rekap[sid][a.status]++;
    rekap[sid].Total++;
  });

  const sorted = sortMembers(members);
  let dataRowNum = headerRowNum + 1;
  let n = 1;
  const totals = { H: 0, S: 0, I: 0, A: 0, K: 0, Total: 0 };

  sorted.forEach((m) => {
    const d = rekap[m.siswa_id] || { H: 0, S: 0, I: 0, A: 0, K: 0, Total: 0 };
    const pct = d.Total > 0 ? (d.H / d.Total) * 100 : 0;
    const row = sheet.getRow(dataRowNum);
    row.height = 18;
    applyDataCell(row.getCell(1), dataRowNum - headerRowNum, { align: 'center' });
    row.getCell(1).value = n++;
    applyDataCell(row.getCell(2), dataRowNum, { align: 'left' });
    row.getCell(2).value = m.siswa_nama || '-';
    [['H', d.H, COLOR.hadir, COLOR.hadirFont], ['S', d.S, COLOR.sakit, COLOR.sakitFont],
     ['I', d.I, COLOR.izin, COLOR.izinFont], ['A', d.A, COLOR.alpa, COLOR.alpaFont],
     ['K', d.K, COLOR.keluar, COLOR.keluarFont]].forEach((s, i) => {
      const cell = row.getCell(i + 3);
      cell.value = s[1];
      applyDataCell(cell, dataRowNum, { fill: s[2], fontColor: s[3], bold: true });
      totals[s[0]] += s[1];
    });
    applyDataCell(row.getCell(8), dataRowNum, { bold: true });
    row.getCell(8).value = d.Total;
    totals.Total += d.Total;
    const pctCell = row.getCell(9);
    pctCell.value = `${pct.toFixed(1)}%`;
    const pctFill = pct >= 80 ? COLOR.hadir : pct >= 60 ? COLOR.sakit : COLOR.alpa;
    const pctFont = pct >= 80 ? COLOR.hadirFont : pct >= 60 ? COLOR.sakitFont : COLOR.alpaFont;
    applyDataCell(pctCell, dataRowNum, { fill: pctFill, fontColor: pctFont, bold: true });
    dataRowNum++;
  });

  // Footer total
  const totalRow = sheet.getRow(dataRowNum);
  totalRow.height = 20;
  applyTotalCell(totalRow.getCell(1), '', 'center');
  applyTotalCell(totalRow.getCell(2), 'TOTAL KESELURUHAN', 'left');
  [['H'], ['S'], ['I'], ['A'], ['K']].forEach((s, i) => {
    applyTotalCell(totalRow.getCell(i + 3), totals[s[0]], 'center');
  });
  applyTotalCell(totalRow.getCell(8), totals.Total, 'center');
  const grandPct = totals.Total > 0 ? (totals.H / totals.Total) * 100 : 0;
  applyTotalCell(totalRow.getCell(9), `${grandPct.toFixed(1)}%`, 'center');

  // Freeze: keep No+Nama visible, keep header visible
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRowNum }];

  autoFitColumns(sheet, headerRowNum, 8, 32);
  sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width || 20, 22);
  return sheet;
}

function buildAbsensiHarianSheet(workbook, assignment, members, absensi, context, userName) {
  const dates = [...new Set(absensi.map((a) => a.tanggal))].sort();
  const staticHeaders = ['No', 'Nama Siswa', ...dates.map(formatDate), 'H', 'S', 'I', 'A'];
  const totalCols = staticHeaders.length;
  const sheet = workbook.addWorksheet(uniqueSheetName(workbook, `Absen Harian ${assignment.kelas_nama || assignment.kelas_id}`), {
    views: [{ state: 'frozen' }],
    properties: { defaultRowHeight: 18 },
  });

  const headerRowNum = writeInstitutionHeader(sheet, totalCols, 'ABSENSI HARIAN SISWA', buildInfoPairs(assignment, context, userName));

  // Header tabel
  const hdrRow = sheet.getRow(headerRowNum);
  hdrRow.height = 30;
  staticHeaders.forEach((h, i) => applyHeaderCell(hdrRow.getCell(i + 1), h));

  // Data
  const bySiswa = {};
  absensi.forEach((a) => {
    if (!bySiswa[a.siswa_id]) bySiswa[a.siswa_id] = {};
    bySiswa[a.siswa_id][a.tanggal] = a.status;
  });

  const sorted = sortMembers(members);
  let dataRowNum = headerRowNum + 1;
  let n = 1;
  const dailyTotals = {};
  dates.forEach((d) => { dailyTotals[d] = { H: 0, S: 0, I: 0, A: 0 }; });

  sorted.forEach((m) => {
    const sd = bySiswa[m.siswa_id] || {};
    const row = sheet.getRow(dataRowNum);
    row.height = 18;
    row.getCell(1).value = n++;
    applyDataCell(row.getCell(1), dataRowNum, { align: 'center' });
    row.getCell(2).value = m.siswa_nama || '-';
    applyDataCell(row.getCell(2), dataRowNum, { align: 'left' });

    let H = 0, S = 0, I = 0, A = 0;
    dates.forEach((d, di) => {
      const st = sd[d] || '';
      const cell = row.getCell(di + 3);
      cell.value = st;
      const sty = statusStyle(st);
      applyDataCell(cell, dataRowNum, { fill: sty.fill, fontColor: sty.fontColor, bold: true });
      if (st === 'H') { H++; dailyTotals[d].H++; }
      else if (st === 'S') { S++; dailyTotals[d].S++; }
      else if (st === 'I') { I++; dailyTotals[d].I++; }
      else if (st === 'A') { A++; dailyTotals[d].A++; }
    });

    const sumStart = dates.length + 3;
    [['H', H, COLOR.hadir, COLOR.hadirFont], ['S', S, COLOR.sakit, COLOR.sakitFont],
     ['I', I, COLOR.izin, COLOR.izinFont], ['A', A, COLOR.alpa, COLOR.alpaFont]].forEach((s, i) => {
      const cell = row.getCell(sumStart + i);
      cell.value = s[1];
      applyDataCell(cell, dataRowNum, { fill: s[2], fontColor: s[3], bold: true });
    });
    dataRowNum++;
  });

  // Footer total harian
  const totalRow = sheet.getRow(dataRowNum);
  totalRow.height = 20;
  applyTotalCell(totalRow.getCell(1), '', 'center');
  applyTotalCell(totalRow.getCell(2), 'TOTAL HADIR / JUMLAH', 'left');
  dates.forEach((d, di) => {
    const dt = dailyTotals[d];
    const present = dt.H;
    const total = dt.H + dt.S + dt.I + dt.A;
    applyTotalCell(totalRow.getCell(di + 3), total > 0 ? `${present}/${total}` : '', 'center');
  });
  const sumStart = dates.length + 3;
  ['H', 'S', 'I', 'A'].forEach((k, i) => {
    const sum = Object.values(dailyTotals).reduce((acc, dt) => acc + dt[k], 0);
    applyTotalCell(totalRow.getCell(sumStart + i), sum, 'center');
  });

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRowNum }];
  autoFitColumns(sheet, headerRowNum, 8, 22);
  sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width || 20, 22);
  return sheet;
}

function buildRekapNilaiSheet(workbook, assignment, members, data, context, userName) {
  const { babs, tugasMap, uhKolom, nilaiTugas, nilaiUH, nilaiPTS, nilaiPAS } = data;
  const babList = babs.slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
  const uhSorted = uhKolom.slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

  // Hitung total kolom: No, Nama, [tugas per bab], [UH murni + remidi...], [PTS murni + remidi], [PAS murni + remidi], Akhir, Grade
  const tugasCountPerBab = babList.map((b) => Math.max(1, (tugasMap[b.bab_id || b.id] || []).length));
  const totalTugasCols = tugasCountPerBab.reduce((s, c) => s + c, 0);
  const totalCols = 2 + totalTugasCols + uhSorted.length * 2 + 2 * 2 + 2; // tugas + (UH*2) + (PTS*2) + (PAS*2) + Akhir + Grade

  const sheet = workbook.addWorksheet(uniqueSheetName(workbook, `Nilai ${assignment.kelas_nama || assignment.kelas_id}`), {
    views: [{ state: 'frozen' }],
    properties: { defaultRowHeight: 18 },
  });

  // Header institusi
  const startRow = writeInstitutionHeader(sheet, totalCols, 'REKAPITULASI NILAI SISWA', buildInfoPairs(assignment, context, userName));

  // Row konfigurasi bobot
  const cfgRow = sheet.getRow(startRow);
  cfgRow.height = 16;
  applyInfoCell(cfgRow.getCell(1), 'Bobot', 'Tugas 25% • UH 25% • PTS 25% • PAS 25%');
  sheet.mergeCells(startRow, 1, startRow, totalCols);

  // Header 2-level
  const hdrTopRowNum = startRow + 1;
  const hdrSubRowNum = startRow + 2;
  const hdrTop = sheet.getRow(hdrTopRowNum);
  hdrTop.height = 24;
  const hdrSub = sheet.getRow(hdrSubRowNum);
  hdrSub.height = 22;

  applyHeaderCell(hdrTop.getCell(1), 'No');
  applyHeaderCell(hdrSub.getCell(1), '');
  applyHeaderCell(hdrTop.getCell(2), 'Nama Siswa');
  applyHeaderCell(hdrSub.getCell(2), '');

  let col = 3;
  const babColSpans = [];
  babList.forEach((bab) => {
    const tugasList = tugasMap[bab.bab_id || bab.id] || [];
    const span = Math.max(1, tugasList.length);
    const startCol = col;
    const endCol = col + span - 1;
    babColSpans.push({ startCol, endCol, bab });
    applyHeaderCell(hdrTop.getCell(startCol), bab.nama || bab.bab_nama || 'Bab');
    if (span > 1) sheet.mergeCells(hdrTopRowNum, startCol, hdrTopRowNum, endCol);
    if (tugasList.length === 0) {
      applyHeaderCell(hdrSub.getCell(startCol), '');
    } else {
      tugasList.forEach((t, ti) => {
        applyHeaderCell(hdrSub.getCell(startCol + ti), t.nama || t.tugas_nama || 'Tugas');
      });
    }
    col = endCol + 1;
  });

  // UH (Murni + Remidi per UH)
  const uhColStart = col;
  applyHeaderCell(hdrTop.getCell(col), 'Ulangan Harian');
  if (uhSorted.length > 0) sheet.mergeCells(hdrTopRowNum, col, hdrTopRowNum, col + uhSorted.length * 2 - 1);
  uhSorted.forEach((uh, ui) => {
    const baseCol = col + ui * 2;
    applyHeaderCell(hdrSub.getCell(baseCol), `${uh.nama || uh.uh_nama || `UH ${ui + 1}`} (Murni)`);
    applyHeaderCell(hdrSub.getCell(baseCol + 1), `${uh.nama || uh.uh_nama || `UH ${ui + 1}`} (Remidi)`);
  });
  col += uhSorted.length * 2;

  // PTS (Murni + Remidi)
  const ptsCol = col;
  applyHeaderCell(hdrTop.getCell(col), 'PTS');
  sheet.mergeCells(hdrTopRowNum, col, hdrTopRowNum, col + 1);
  applyHeaderCell(hdrSub.getCell(col), 'Murni');
  applyHeaderCell(hdrSub.getCell(col + 1), 'Remidi');
  col += 2;

  // PAS (Murni + Remidi)
  const pasCol = col;
  applyHeaderCell(hdrTop.getCell(col), 'PAS');
  sheet.mergeCells(hdrTopRowNum, col, hdrTopRowNum, col + 1);
  applyHeaderCell(hdrSub.getCell(col), 'Murni');
  applyHeaderCell(hdrSub.getCell(col + 1), 'Remidi');
  col += 2;

  // Nilai Akhir
  const akhirCol = col;
  applyHeaderCell(hdrTop.getCell(col), 'Nilai Akhir');
  applyHeaderCell(hdrSub.getCell(col), '');
  col++;

  // Grade
  const gradeCol = col;
  applyHeaderCell(hdrTop.getCell(col), 'Grade');
  applyHeaderCell(hdrSub.getCell(col), '');

  // Data rows
  const sorted = sortMembers(members);
  let dataRowNum = hdrSubRowNum + 1;
  let n = 1;

  sorted.forEach((m) => {
    const sid = m.siswa_id;
    const row = sheet.getRow(dataRowNum);
    row.height = 18;
    row.getCell(1).value = n++;
    applyDataCell(row.getCell(1), dataRowNum, { align: 'center' });
    row.getCell(2).value = m.siswa_nama || '-';
    applyDataCell(row.getCell(2), dataRowNum, { align: 'left' });

    let tugasSum = 0, tugasCount = 0;
    let curCol = 3;
    babList.forEach((bab) => {
      const bid = bab.bab_id || bab.id;
      const tugasList = tugasMap[bid] || [];
      if (tugasList.length === 0) {
        const cell = row.getCell(curCol);
        cell.value = '';
        applyDataCell(cell, dataRowNum);
        curCol++;
      } else {
        tugasList.forEach((t) => {
          const tid = t.tugas_id || t.id;
          const val = nilaiTugas[`${bid}_${tid}_${sid}`];
          const cell = row.getCell(curCol);
          cell.value = val ?? '';
          applyDataCell(cell, dataRowNum, { align: 'center' });
          if (typeof val === 'number') { tugasSum += val; tugasCount++; }
          curCol++;
        });
      }
    });

    // UH Murni + Remidi
    let uhSum = 0, uhCount = 0;
    uhSorted.forEach((uh, ui) => {
      const uid = uh.uh_id || uh.id;
      const baseCol = uhColStart + ui * 2;
      const valMurni = nilaiUH[`${sid}_${uid}_murni`] ?? nilaiUH[`${sid}_${uid}`] ?? '';
      const valRemidi = nilaiUH[`${sid}_${uid}_remidi`] ?? '';
      const cellMurni = row.getCell(baseCol);
      const cellRemidi = row.getCell(baseCol + 1);
      cellMurni.value = valMurni ?? '';
      cellRemidi.value = valRemidi ?? '';
      applyDataCell(cellMurni, dataRowNum, { align: 'center' });
      applyDataCell(cellRemidi, dataRowNum, { align: 'center' });
      [valMurni, valRemidi].forEach((v) => {
        if (typeof v === 'number') { uhSum += v; uhCount++; }
      });
    });

    // PTS Murni + Remidi
    const ptsMurni = nilaiPTS[`${sid}_murni`] ?? '';
    const ptsRemidi = nilaiPTS[`${sid}_remidi`] ?? '';
    const ptsMurniCell = row.getCell(ptsCol);
    const ptsRemidiCell = row.getCell(ptsCol + 1);
    ptsMurniCell.value = ptsMurni ?? '';
    ptsRemidiCell.value = ptsRemidi ?? '';
    applyDataCell(ptsMurniCell, dataRowNum, { align: 'center' });
    applyDataCell(ptsRemidiCell, dataRowNum, { align: 'center' });
    [ptsMurni, ptsRemidi].forEach((v) => { if (typeof v === 'number') { uhSum += v; uhCount++; } });

    // PAS Murni + Remidi
    const pasMurni = nilaiPAS[`${sid}_murni`] ?? '';
    const pasRemidi = nilaiPAS[`${sid}_remidi`] ?? '';
    const pasMurniCell = row.getCell(pasCol);
    const pasRemidiCell = row.getCell(pasCol + 1);
    pasMurniCell.value = pasMurni ?? '';
    pasRemidiCell.value = pasRemidi ?? '';
    applyDataCell(pasMurniCell, dataRowNum, { align: 'center' });
    applyDataCell(pasRemidiCell, dataRowNum, { align: 'center' });
    [pasMurni, pasRemidi].forEach((v) => { if (typeof v === 'number') { uhSum += v; uhCount++; } });

    // Nilai akhir: rata-rata dari semua nilai yang ada (tugas + UH + PTS + PAS)
    const allVals = [];
    // tugas
    babList.forEach((bab) => {
      const bid = bab.bab_id || bab.id;
      const tugasList = tugasMap[bid] || [];
      tugasList.forEach((t) => {
        const tid = t.tugas_id || t.id;
        const val = nilaiTugas[`${bid}_${tid}_${sid}`];
        if (typeof val === 'number') allVals.push(val);
      });
    });
    // UH murni + remidi
    uhSorted.forEach((uh) => {
      const uid = uh.uh_id || uh.id;
      const valMurni = nilaiUH[`${sid}_${uid}_murni`] ?? nilaiUH[`${sid}_${uid}`];
      const valRemidi = nilaiUH[`${sid}_${uid}_remidi`];
      if (typeof valMurni === 'number') allVals.push(valMurni);
      if (typeof valRemidi === 'number') allVals.push(valRemidi);
    });
    // PTS murni + remidi
    if (typeof ptsMurni === 'number') allVals.push(ptsMurni);
    if (typeof ptsRemidi === 'number') allVals.push(ptsRemidi);
    // PAS murni + remidi
    if (typeof pasMurni === 'number') allVals.push(pasMurni);
    if (typeof pasRemidi === 'number') allVals.push(pasRemidi);

    let akhir = '';
    if (allVals.length > 0) {
      akhir = Number((allVals.reduce((s, v) => s + v, 0) / allVals.length).toFixed(1));
    }
    const akhirCell = row.getCell(akhirCol);
    akhirCell.value = akhir;
    let akhirFill = null, akhirFont = COLOR.hadirFont;
    if (typeof akhir === 'number') {
      if (akhir >= 80) { akhirFill = COLOR.hadir; }
      else if (akhir >= 70) { akhirFill = COLOR.izin; }
      else if (akhir >= 60) { akhirFill = COLOR.sakit; akhirFont = COLOR.sakitFont; }
      else { akhirFill = COLOR.alpa; akhirFont = COLOR.alpaFont; }
    }
    applyDataCell(akhirCell, dataRowNum, { align: 'center', bold: true, fill: akhirFill, fontColor: akhirFont });

    // Grade
    let grade = '';
    if (typeof akhir === 'number') {
      if (akhir >= 90) grade = 'A';
      else if (akhir >= 85) grade = 'A-';
      else if (akhir >= 80) grade = 'B+';
      else if (akhir >= 75) grade = 'B';
      else if (akhir >= 60) grade = 'C';
      else grade = 'D';
    }
    const gradeCell = row.getCell(gradeCol);
    gradeCell.value = grade;
    const gSty = gradeStyle(grade);
    applyDataCell(gradeCell, dataRowNum, { align: 'center', bold: true, fill: gSty.fill, fontColor: gSty.fontColor });

    dataRowNum++;
  });

  // Footer statistik kelas
  const statRow = sheet.getRow(dataRowNum);
  statRow.height = 20;
  applyTotalCell(statRow.getCell(1), '', 'center');
  applyTotalCell(statRow.getCell(2), 'RERATA KELAS', 'left');
  // Hitung rerata kolom akhir
  let kelasSum = 0, kelasCount = 0;
  for (let r = hdrSubRowNum + 1; r < dataRowNum; r++) {
    const v = sheet.getRow(r).getCell(akhirCol).value;
    if (typeof v === 'number') { kelasSum += v; kelasCount++; }
  }
  for (let c = 3; c <= totalCols; c++) {
    if (c === akhirCol) {
      applyTotalCell(statRow.getCell(c), kelasCount > 0 ? Number((kelasSum / kelasCount).toFixed(1)) : '', 'center');
    } else {
      applyTotalCell(statRow.getCell(c), '', 'center');
    }
  }

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: hdrSubRowNum }];
  autoFitColumns(sheet, startRow, 8, 30);
  sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width || 20, 22);
  return sheet;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ambil data satu pengajaran lalu tambahkan 3 sheet (rekap absensi, absensi
 * harian, rekap nilai) ke workbook. Dipakai bersama oleh backup guru dan backup
 * sistem (semua guru) agar formatnya identik.
 */
async function appendAssignmentSheets(workbook, assignment, context, userName) {
  const pid = assignment.id;
  const members = await getClassMembers(context, assignment.kelas_id);
  const [absensi, nilaiTugasDocs, nilaiUjianDocs, babDocs, tugasDocs, uhKolomDocs] = await Promise.all([
    fetchScoped('absensi', context, pid),
    fetchScoped('nilai_tugas', context, pid),
    fetchScoped('nilai_ujian', context, pid),
    fetchScoped('bab', context, pid),
    fetchScoped('tugas_bab', context, pid),
    fetchScoped('ulangan_harian_kolom', context, pid),
  ]);

  // Normalisasi bab & tugas
  const babs = babDocs.map((doc) => ({
    ...doc,
    bab_id: doc.bab_id || doc.id,
    nama: doc.nama || doc.bab_nama || 'Tanpa Nama',
    urutan: doc.urutan || 0,
  })).sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

  const tugasMap = {};
  tugasDocs.forEach((doc) => {
    const bid = doc.bab_id || doc.id;
    if (!tugasMap[bid]) tugasMap[bid] = [];
    tugasMap[bid].push({
      ...doc,
      tugas_id: doc.tugas_id || doc.id,
      nama: doc.nama || doc.tugas_nama || 'Tanpa Nama',
      urutan: doc.urutan || 0,
    });
  });
  Object.values(tugasMap).forEach((arr) => arr.sort((a, b) => (a.urutan || 0) - (b.urutan || 0)));

  const uhKolom = uhKolomDocs
    .map((doc, i) => ({
      ...doc,
      uh_id: doc.uh_id || doc.id || `uh${i + 1}`,
      nama: doc.uh_nama || doc.nama || `UH ${i + 1}`,
      urutan: Number(doc.urutan || i + 1),
    }))
    .filter((col) => !['murni', 'remidi'].includes(String(col.id || '').toLowerCase()))
    .filter((col) => !['murni', 'remidi'].includes(String(col.nama || '').trim().toLowerCase()));

  const nilaiTugas = {};
  nilaiTugasDocs.forEach((doc) => {
    nilaiTugas[`${doc.bab_id}_${doc.tugas_id}_${doc.siswa_id}`] = doc.nilai;
  });

  const nilaiUH = {};
  nilaiUjianDocs.filter((d) => d.jenis_nilai === 'ulangan_harian').forEach((doc) => {
    const tipe = doc.tipe || 'uh1';
    nilaiUH[`${doc.siswa_id}_${tipe}`] = doc.nilai;
  });

  const nilaiPTS = {};
  nilaiUjianDocs.filter((d) => d.jenis_nilai === 'pts').forEach((doc) => {
    nilaiPTS[`${doc.siswa_id}_${doc.tipe || 'murni'}`] = doc.nilai;
  });

  const nilaiPAS = {};
  nilaiUjianDocs.filter((d) => d.jenis_nilai === 'pas').forEach((doc) => {
    nilaiPAS[`${doc.siswa_id}_${doc.tipe || 'murni'}`] = doc.nilai;
  });

  const data = { babs, tugasMap, uhKolom, nilaiTugas, nilaiUH, nilaiPTS, nilaiPAS };

  buildRekapAbsensiSheet(workbook, assignment, members, absensi, context, userName);
  buildAbsensiHarianSheet(workbook, assignment, members, absensi, context, userName);
  buildRekapNilaiSheet(workbook, assignment, members, data, context, userName);
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
 * Backup sistem tingkat admin: bangun satu workbook berisi 3 sheet per pengajaran
 * untuk SELURUH guru pada periode aktif (format identik dengan backup guru).
 *
 * Catatan: dipertahankan untuk kompatibilitas. Untuk backup sistem yang benar
 * gunakan buildSystemBackupZip yang memisahkan berkas per guru sehingga tidak
 * ada bentrok nama sheet antar guru yang mengajar kelas sama.
 */
export async function buildSystemBackupWorkbook(context, onProgress = () => {}) {
  await ensureExcelJSLoaded();
  const ExcelJS = window.ExcelJS;

  const assignments = await getActiveTeachingAssignments(context);
  if (!assignments.length) {
    throw new Error('Tidak ada data pengajaran aktif untuk dibackup pada periode ini.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIM SMANSARI Backup Sistem';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  let processed = 0;
  for (const assignment of assignments) {
    const guru = assignment.guru_nama || assignment.guru_id || 'Guru';
    const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Kelas';
    const mapelNama = assignment.mapel_nama || 'Mapel';

    onProgress({
      label: `${guru} • ${kelasNama} • ${mapelNama}`,
      current: processed + 1,
      total: assignments.length,
    });

    try {
      await appendAssignmentSheets(workbook, assignment, context, guru);
    } catch (error) {
      console.warn(`Backup sistem: gagal memproses pengajaran ${assignment.id}:`, error);
    }
    processed++;
  }

  return { workbook, assignmentsCount: assignments.length };
}

/**
 * Backup sistem yang benar: satu berkas Excel PER GURU, dikemas dalam satu ZIP.
 *
 * Kenapa per guru (bukan satu workbook gabungan): nama sheet Excel harus unik
 * dalam satu workbook. Bila dua guru mengajar kelas yang sama (mis. "Rekap Absen
 * XII-1"), penggabungan ke satu workbook menimbulkan bentrok nama sehingga guru
 * yang diproses belakangan gagal ditambahkan — inilah sebab hanya satu guru yang
 * datanya masuk. Memisahkan per guru menghilangkan bentrok tersebut sekaligus
 * membuat berkas lebih mudah dibagikan ke masing-masing guru.
 *
 * @returns {Promise<{blob:Blob, fileName:string, guruCount:number, assignmentsCount:number, failures:Array}>}
 */
export async function buildSystemBackupZip(context, onProgress = () => {}) {
  await ensureExcelJSLoaded();
  await ensureJSZipLoaded();
  const ExcelJS = window.ExcelJS;
  const JSZip = window.JSZip;

  const assignments = await getActiveTeachingAssignments(context);
  if (!assignments.length) {
    throw new Error('Tidak ada data pengajaran aktif untuk dibackup pada periode ini.');
  }

  // Kelompokkan pengajaran per guru.
  const byGuru = new Map();
  for (const a of assignments) {
    const key = String(a.guru_id || a.guru_nama || 'tanpa-guru');
    if (!byGuru.has(key)) {
      byGuru.set(key, { guruId: key, guruNama: a.guru_nama || a.guru_id || 'Guru', items: [] });
    }
    byGuru.get(key).items.push(a);
  }

  const zip = new JSZip();
  const guruList = [...byGuru.values()];
  const usedNames = new Set();
  const failures = [];
  let processed = 0;

  for (const guru of guruList) {
    processed++;
    onProgress({
      label: `${guru.guruNama} (${guru.items.length} kelas)`,
      current: processed,
      total: guruList.length,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SIM SMANSARI Backup Sistem';
    workbook.lastModifiedBy = guru.guruNama;
    workbook.created = new Date();
    workbook.modified = new Date();

    let sheetsAdded = 0;
    for (const assignment of guru.items) {
      try {
        await appendAssignmentSheets(workbook, assignment, context, guru.guruNama);
        sheetsAdded++;
      } catch (error) {
        console.warn(`Backup sistem: gagal memproses pengajaran ${assignment.id} (${guru.guruNama}):`, error);
        failures.push({ guru: guru.guruNama, pengajaran: assignment.id, reason: error?.message || 'gagal' });
      }
    }

    // Guru tanpa sheet yang berhasil (mis. semua kelas kosong) tetap dilewati.
    if (sheetsAdded === 0) continue;

    // Nama berkas unik & aman di dalam ZIP.
    const safeName = String(guru.guruNama).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Guru';
    let fileName = `${safeName}.xlsx`;
    let n = 2;
    while (usedNames.has(fileName)) { fileName = `${safeName}_${n++}.xlsx`; }
    usedNames.add(fileName);

    const buffer = await workbook.xlsx.writeBuffer();
    zip.file(fileName, buffer);
  }

  if (usedNames.size === 0) {
    throw new Error('Tidak ada data guru yang berhasil dibackup pada periode ini.');
  }

  onProgress({ label: 'Mengemas ZIP...', current: guruList.length, total: guruList.length });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  return {
    blob,
    guruCount: usedNames.size,
    assignmentsCount: assignments.length,
    failures,
  };
}

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
  const delivery = await deliverBackupBlob(blob, fileName, onProgress, {
    destination: options.destination,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    logType: 'guru',
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
  return { fileName, assignments_count: Math.ceil(sheetCount / 3), drive: delivery };
}

/**
 * Auto-upload senyap: bangun workbook guru yang sedang login lalu unggah ke Drive
 * SAJA (tanpa mengunduh ke perangkat, tanpa popup). Dipakai penjadwal agar data
 * guru tercadangkan otomatis saat mereka membuka aplikasi.
 *
 * @returns {Promise<{uploaded:boolean, fileName?:string, reason?:string}>}
 */
export async function uploadGuruBackupSilently() {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const userName = session?.user?.nama || 'Guru';
  if (!userId) return { uploaded: false, reason: 'Sesi guru tidak ditemukan.' };

  let workbook;
  try {
    workbook = await buildGuruBackupWorkbook(context, userId, userName);
  } catch (error) {
    // Tidak ada pengajaran / data — bukan kegagalan yang perlu dicatat.
    return { uploaded: false, reason: error?.message || 'Tidak ada data untuk dibackup.' };
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = String(userName).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  const fileName = `Backup-Auto-SIMSMANSARI-${safeName}-${dateStr}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const result = await uploadBackupToDrive(blob, fileName, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    logType: 'otomatis-guru',
  });

  if (result.uploaded) {
    setLastBackupTimestamp({
      guru_id: userId,
      guru_nama: userName,
      tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
      semester_id: context?.semester_aktif || '',
      file_name: fileName,
      drive_uploaded: true,
      auto: true,
    });
  }

  return result;
}

// ============================================================================
// NEW: Selective Backup (per kelas, per tipe data)
// ============================================================================

export const BACKUP_DATA_TYPES = {
  ABSENSI_REKAP: { key: 'absensi_rekap', label: 'Rekap Absensi', icon: '📊' },
  ABSENSI_HARIAN: { key: 'absensi_harian', label: 'Absensi Harian', icon: '📅' },
  NILAI_REKAP: { key: 'nilai_rekap', label: 'Rekap Nilai', icon: '📈' },
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
    const [absensi, nilaiTugasDocs, nilaiUjianDocs, babDocs, tugasDocs, uhKolomDocs] = await Promise.all([
      fetchScoped('absensi', context, pid),
      fetchScoped('nilai_tugas', context, pid),
      fetchScoped('nilai_ujian', context, pid),
      fetchScoped('bab', context, pid),
      fetchScoped('tugas_bab', context, pid),
      fetchScoped('ulangan_harian_kolom', context, pid),
    ]);

    // Normalisasi bab & tugas
    const babs = babDocs.map((doc) => ({
      ...doc,
      bab_id: doc.bab_id || doc.id,
      nama: doc.nama || doc.bab_nama || 'Tanpa Nama',
      urutan: doc.urutan || 0,
    })).sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

    const tugasMap = {};
    tugasDocs.forEach((doc) => {
      const bid = doc.bab_id || doc.id;
      if (!tugasMap[bid]) tugasMap[bid] = [];
      tugasMap[bid].push({
        ...doc,
        tugas_id: doc.tugas_id || doc.id,
        nama: doc.nama || doc.tugas_nama || 'Tanpa Nama',
        urutan: doc.urutan || 0,
      });
    });
    Object.values(tugasMap).forEach((arr) => arr.sort((a, b) => (a.urutan || 0) - (b.urutan || 0)));

    const uhKolom = uhKolomDocs
      .map((doc, i) => ({
        ...doc,
        uh_id: doc.uh_id || doc.id || `uh${i + 1}`,
        nama: doc.uh_nama || doc.nama || `UH ${i + 1}`,
        urutan: Number(doc.urutan || i + 1),
      }))
      .filter((col) => !['murni', 'remidi'].includes(String(col.id || '').toLowerCase()))
      .filter((col) => !['murni', 'remidi'].includes(String(col.nama || '').trim().toLowerCase()));

    const nilaiTugas = {};
    nilaiTugasDocs.forEach((doc) => {
      nilaiTugas[`${doc.bab_id}_${doc.tugas_id}_${doc.siswa_id}`] = doc.nilai;
    });

    const nilaiUH = {};
    nilaiUjianDocs.filter((d) => d.jenis_nilai === 'ulangan_harian').forEach((doc) => {
      const tipe = doc.tipe || 'uh1';
      nilaiUH[`${doc.siswa_id}_${tipe}`] = doc.nilai;
    });

    const nilaiPTS = {};
    nilaiUjianDocs.filter((d) => d.jenis_nilai === 'pts').forEach((doc) => {
      nilaiPTS[`${doc.siswa_id}_${doc.tipe || 'murni'}`] = doc.nilai;
    });

    const nilaiPAS = {};
    nilaiUjianDocs.filter((d) => d.jenis_nilai === 'pas').forEach((doc) => {
      nilaiPAS[`${doc.siswa_id}_${doc.tipe || 'murni'}`] = doc.nilai;
    });

    const data = { babs, tugasMap, uhKolom, nilaiTugas, nilaiUH, nilaiPTS, nilaiPAS };

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
  const delivery = await deliverBackupBlob(blob, fileName, onProgress, {
    destination: options.destination,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    logType: 'guru',
  });

  // Record in history
  const checksum = await computeChecksum(blob);
  addBackupHistory({
    guru_id: userId,
    guru_nama: userName,
    tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
    semester_id: context?.semester_aktif || '',
    file_name: fileName,
    data_types: selectedDataTypes,
    assignment_count: selectedAssignments.length,
    checksum,
    backup_type: 'selective',
    drive_uploaded: delivery.uploaded === true,
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

// ============================================================================
// NEW: Multi-format Export (CSV, JSON)
// ============================================================================

export const EXPORT_FORMATS = {
  XLSX: { key: 'xlsx', label: 'Excel (.xlsx)', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  CSV: { key: 'csv', label: 'CSV (.csv)', mime: 'text/csv', ext: '.csv' },
  JSON: { key: 'json', label: 'JSON (.json)', mime: 'application/json', ext: '.json' },
};

async function workbookToCSV(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return '';
  let csv = '';
  sheet.eachRow((row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      let val = cell.value;
      if (val === null || val === undefined) val = '';
      if (typeof val === 'object' && val !== null) {
        if (val.text) val = val.text;
        else if (val.result !== undefined) val = val.result;
        else if (val.formula) val = val.formula;
        else if (val.richText) val = val.richText.map((r) => r.text || '').join('');
        else val = JSON.stringify(val);
      }
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val}"`;
      }
      values.push(val);
    });
    csv += values.join(',') + '\n';
  });
  return csv;
}

export async function exportWorkbookAsCSV(workbook) {
  const csvParts = [];
  workbook.eachSheet((sheet) => {
    csvParts.push(`# Sheet: ${sheet.name}\n`);
    csvParts.push(workbookToCSV(workbook, sheet.name));
    csvParts.push('\n');
  });
  const blob = new Blob(csvParts, { type: 'text/csv;charset=utf-8;' });
  return blob;
}

export async function exportWorkbookAsJSON(workbook) {
  const jsonData = {};
  workbook.eachSheet((sheet) => {
    const rows = [];
    const headers = [];
    let headerRowFound = false;
    sheet.eachRow((row, rowNumber) => {
      const rowData = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (!headerRowFound && rowNumber <= 10) {
          // Try to detect header row
          const val = cell.value;
          if (val && typeof val === 'string' && val.length > 0) {
            headers[colNumber - 1] = val;
          }
        }
        let val = cell.value;
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object' && val !== null) {
          if (val.text) val = val.text;
          else if (val.result !== undefined) val = val.result;
          else if (val.formula) val = val.formula;
          else if (val.richText) val = val.richText.map((r) => r.text || '').join('');
          else val = JSON.stringify(val);
        }
        const header = headers[colNumber - 1] || `col_${colNumber}`;
        rowData[header] = val;
      });
      if (Object.keys(rowData).length > 0) {
        rows.push(rowData);
      }
    });
    jsonData[sheet.name] = rows;
  });
  const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
  return blob;
}

export async function exportBackupMultiFormat(
  context,
  userId,
  userName,
  selectedAssignments,
  selectedDataTypes,
  format = EXPORT_FORMATS.XLSX,
  onProgress = () => {},
  options = {}
) {
  const workbook = await buildSelectiveBackupWorkbook(context, userId, userName, selectedAssignments, selectedDataTypes, onProgress);

  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = String(userName).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  const typesStr = selectedDataTypes.map((k) => k.slice(0, 3)).join('-');
  const fileName = `Backup-SIMSMANSARI-${safeName}-${dateStr}-${typesStr}${format.ext}`;

  let blob;
  switch (format.key) {
    case 'csv':
      blob = await exportWorkbookAsCSV(workbook);
      break;
    case 'json':
      blob = await exportWorkbookAsJSON(workbook);
      break;
    case 'xlsx':
    default:
      const buffer = await workbook.xlsx.writeBuffer();
      blob = new Blob([buffer], { type: format.mime });
      break;
  }

  const delivery = await deliverBackupBlob(blob, fileName, onProgress, {
    destination: options.destination,
    mimeType: format.mime,
    logType: 'guru',
  });

  const checksum = await computeChecksum(blob);
  addBackupHistory({
    guru_id: userId,
    guru_nama: userName,
    tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
    semester_id: context?.semester_aktif || '',
    file_name: fileName,
    data_types: selectedDataTypes,
    assignment_count: selectedAssignments.length,
    format: format.key,
    checksum,
    backup_type: 'selective',
    drive_uploaded: delivery.uploaded === true,
  });

  setLastBackupTimestamp({
    guru_id: userId,
    guru_nama: userName,
    tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
    semester_id: context?.semester_aktif || '',
    file_name: fileName,
    drive_uploaded: delivery.uploaded === true,
  });

  return { fileName, format: format.key, assignments_count: selectedAssignments.length, drive: delivery };
}

// ============================================================================
// NEW: Restore/Import from Backup (Excel -> Firestore)
// ============================================================================

export const RESTORE_TYPES = {
  ABSENSI: { key: 'absensi', label: 'Data Absensi', collections: ['absensi'] },
  NILAI_TUGAS: { key: 'nilai_tugas', label: 'Nilai Tugas', collections: ['nilai_tugas'] },
  NILAI_UJIAN: { key: 'nilai_ujian', label: 'Nilai Ujian (UH/PTS/PAS)', collections: ['nilai_ujian'] },
  ALL: { key: 'all', label: 'Semua Data', collections: ['absensi', 'nilai_tugas', 'nilai_ujian'] },
};

export async function parseBackupFile(file) {
  await ensureExcelJSLoaded();
  const ExcelJS = window.ExcelJS;
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  return workbook;
}

function extractSheetData(workbook, sheetNamePattern) {
  const sheets = [];
  workbook.eachSheet((sheet) => {
    if (sheetNamePattern.test(sheet.name)) {
      const rows = [];
      let headers = [];
      let headerRowNum = -1;
      sheet.eachRow((row, rowNumber) => {
        // Skip institution header rows (first few rows)
        if (rowNumber <= 10 && !headerRowNum) {
          const hasHeader = row.values.some((v) => v && typeof v === 'string' && /^(No|Nama|Hadir|Sakit|Izin|Alpa|Keluar|Total|Persen|Tugas|UH|PTS|PAS|Nilai|Grade)$/i.test(v));
          if (hasHeader) {
            headerRowNum = rowNumber;
            row.eachCell({ includeEmpty: true }, (cell) => {
              headers.push(cell.value || '');
            });
          }
        } else if (headerRowNum > 0 && rowNumber > headerRowNum) {
          const rowData = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber - 1] || `col_${colNumber}`;
            let val = cell.value;
            if (val === null || val === undefined) val = '';
            if (typeof val === 'object' && val !== null) {
              if (val.text) val = val.text;
              else if (val.result !== undefined) val = val.result;
              else if (val.formula) val = val.formula;
              else if (val.richText) val = val.richText.map((r) => r.text || '').join('');
              else val = JSON.stringify(val);
            }
            rowData[header] = val;
          });
          if (Object.values(rowData).some((v) => v !== '')) {
            rows.push(rowData);
          }
        }
      });
      if (rows.length > 0) {
        sheets.push({ name: sheet.name, headers, rows, type: detectSheetType(sheet.name) });
      }
    }
  });
  return sheets;
}

function detectSheetType(sheetName) {
  const name = sheetName.toLowerCase();
  if (name.includes('rekap absen') || name.includes('rekap_absen')) return 'absensi_rekap';
  if (name.includes('absen harian') || name.includes('absen_harian')) return 'absensi_harian';
  if (name.includes('nilai') || name.includes('rekap nilai')) return 'nilai_rekap';
  return 'unknown';
}

// Helper: convert simple writes to batchWrite operations format
function toBatchWriteOps(writes) {
  return writes.map((w) => ({
    collection: w.collection,
    id: w.id || crypto.randomUUID(),
    type: 'set',
    payload: w.data,
    merge: true,
  }));
}

export async function previewBackupFile(file, onProgress = () => {}) {
  const workbook = await parseBackupFile(file);
  const allSheets = [];
  workbook.eachSheet((sheet) => {
    allSheets.push({ name: sheet.name, rowCount: sheet.rowCount, colCount: sheet.columnCount });
  });
  return { fileName: file.name, fileSize: file.size, sheets: allSheets };
}

export async function restoreFromBackup(file, context, options = {}, onProgress = () => {}) {
  const { restoreTypes = [RESTORE_TYPES.ALL.key], assignmentFilter = null, dryRun = false } = options;
  const workbook = await parseBackupFile(file);

  const results = {
    totalSheets: 0,
    processedSheets: 0,
    totalRows: 0,
    restoredRows: 0,
    errors: [],
    details: [],
  };

  const sheetsToProcess = [];
  workbook.eachSheet((sheet) => {
    const type = detectSheetType(sheet.name);
    if (restoreTypes.includes('all') || restoreTypes.includes(type)) {
      if (!assignmentFilter || sheet.name.includes(assignmentFilter)) {
        sheetsToProcess.push({ sheet, type });
      }
    }
  });

  results.totalSheets = sheetsToProcess.length;

  for (const { sheet, type } of sheetsToProcess) {
    onProgress({ label: sheet.name, current: results.processedSheets + 1, total: results.totalSheets });
    results.processedSheets++;

    try {
      if (type === 'absensi_rekap' || type === 'absensi_harian') {
        const rowCount = await restoreAbsensiSheet(sheet, context, type, { dryRun });
        results.totalRows += rowCount;
        results.restoredRows += rowCount;
        results.details.push({ sheet: sheet.name, type, rows: rowCount });
      } else if (type === 'nilai_rekap') {
        const rowCount = await restoreNilaiSheet(sheet, context, { dryRun });
        results.totalRows += rowCount;
        results.restoredRows += rowCount;
        results.details.push({ sheet: sheet.name, type, rows: rowCount });
      }
    } catch (err) {
      results.errors.push({ sheet: sheet.name, error: err.message });
    }
  }

  return results;
}

async function restoreAbsensiSheet(sheet, context, type, options = {}) {
  const { dryRun = false } = options;
  let count = 0;

  // Find header row
  let headerRowNum = -1;
  let headers = [];
  sheet.eachRow((row, rowNumber) => {
    if (headerRowNum === -1 && rowNumber <= 15) {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell) => vals.push(cell.value));
      if (vals.some((v) => v && /^(No|Nama|Hadir|Sakit|Izin|Alpa|Keluar|Total|%? ?Kehadiran)$/i.test(String(v)))) {
        headerRowNum = rowNumber;
        headers = vals;
      }
    }
  });

  if (headerRowNum === -1) return 0;

  const pengajaranId = extractPengajaranId(sheet.name);
  if (!pengajaranId) return 0;

  const writes = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNum) return;
    const rowData = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) rowData[header] = cell.value;
    });
    if (!rowData.Nama && !rowData['Nama Siswa']) return;

    const siswaId = findSiswaIdByName(context, rowData['Nama Siswa'] || rowData.Nama);
    if (!siswaId) return;

    // Parse absensi rekap or harian
    if (type === 'absensi_rekap') {
      // Format: No, Nama Siswa, Hadir, Sakit, Izin, Alpa, Keluar, Total, % Kehadiran
      ['Hadir', 'Sakit', 'Izin', 'Alpa', 'Keluar'].forEach((status) => {
        const cnt = parseInt(rowData[status]) || 0;
        for (let i = 0; i < cnt; i++) {
          writes.push({
            collection: 'absensi',
            data: {
              pengajaran_id: pengajaranId,
              siswa_id: siswaId,
              status: status[0], // H, S, I, A, K
              tanggal: new Date().toISOString().slice(0, 10),
              tahun_ajaran_id: context.tahun_ajaran_aktif,
              semester_id: context.semester_aktif,
              created_at: new Date().toISOString(),
            },
          });
          count++;
        }
      });
    } else if (type === 'absensi_harian') {
      // Daily columns - find date columns
      const dateCols = headers.filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(String(h)));
      dateCols.forEach((dateCol) => {
        const status = rowData[dateCol];
        if (status && ['H', 'S', 'I', 'A', 'K'].includes(status)) {
          writes.push({
            collection: 'absensi',
            data: {
              pengajaran_id: pengajaranId,
              siswa_id: siswaId,
              status,
              tanggal: dateCol,
              tahun_ajaran_id: context.tahun_ajaran_aktif,
              semester_id: context.semester_aktif,
              created_at: new Date().toISOString(),
            },
          });
          count++;
        }
      });
    }
  });

  if (!dryRun && writes.length > 0) {
    await batchWrite(toBatchWriteOps(writes));
  }
  return count;
}

async function restoreNilaiSheet(sheet, context, options = {}) {
  const { dryRun = false } = options;
  let count = 0;

  // Find header rows (2-level header)
  let headerTopRow = -1, headerSubRow = -1;
  let topHeaders = [], subHeaders = [];
  sheet.eachRow((row, rowNumber) => {
    if (headerTopRow === -1 && rowNumber <= 15) {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell) => vals.push(cell.value));
      if (vals.some((v) => v && /^(No|Nama|Tugas|UH|PTS|PAS|Nilai|Grade)$/i.test(String(v)))) {
        headerTopRow = rowNumber;
        topHeaders = vals;
      }
    } else if (headerTopRow > 0 && headerSubRow === -1 && rowNumber === headerTopRow + 1) {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell) => vals.push(cell.value));
      headerSubRow = rowNumber;
      subHeaders = vals;
    }
  });

  if (headerTopRow === -1 || headerSubRow === -1) return 0;

  const pengajaranId = extractPengajaranId(sheet.name);
  if (!pengajaranId) return 0;

  const writes = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerSubRow) return;
    const rowData = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const top = topHeaders[colNumber - 1] || '';
      const sub = subHeaders[colNumber - 1] || '';
      const header = `${top}_${sub}`.replace(/^_+|_+$/g, '') || `col_${colNumber}`;
      let val = cell.value;
      if (val === null || val === undefined) val = '';
      if (typeof val === 'object' && val !== null) {
        if (val.text) val = val.text;
        else if (val.result !== undefined) val = val.result;
        else if (val.formula) val = val.formula;
        else if (val.richText) val = val.richText.map((r) => r.text || '').join('');
        else val = JSON.stringify(val);
      }
      rowData[header] = val;
    });
    if (!rowData.Nama && !rowData['Nama Siswa']) return;

    const siswaId = findSiswaIdByName(context, rowData['Nama Siswa'] || rowData.Nama);
    if (!siswaId) return;

    // Parse nilai columns
    Object.entries(rowData).forEach(([key, val]) => {
      if (typeof val !== 'number' && typeof val !== 'string') return;
      const numVal = typeof val === 'string' ? parseFloat(val) : val;
      if (isNaN(numVal)) return;

      // Determine jenis_nilai and tipe from key
      let jenis_nilai = 'tugas';
      let tipe = 'murni';
      const keyLower = key.toLowerCase();
      if (keyLower.includes('uh') || keyLower.includes('ulangan')) {
        jenis_nilai = 'ulangan_harian';
        tipe = keyLower.includes('remidi') ? 'remidi' : 'murni';
      } else if (keyLower.includes('pts')) {
        jenis_nilai = 'pts';
        tipe = keyLower.includes('remidi') ? 'remidi' : 'murni';
      } else if (keyLower.includes('pas')) {
        jenis_nilai = 'pas';
        tipe = keyLower.includes('remidi') ? 'remidi' : 'murni';
      } else if (keyLower.includes('tugas')) {
        jenis_nilai = 'tugas';
        tipe = 'murni';
      }

      writes.push({
        collection: 'nilai_ujian',
        data: {
          pengajaran_id: pengajaranId,
          siswa_id: siswaId,
          jenis_nilai,
          tipe,
          nilai: numVal,
          tahun_ajaran_id: context.tahun_ajaran_aktif,
          semester_id: context.semester_aktif,
          created_at: new Date().toISOString(),
        },
      });
      count++;
    });
  });

  if (!dryRun && writes.length > 0) {
    await batchWrite(toBatchWriteOps(writes));
  }
  return count;
}

function extractPengajaranId(sheetName) {
  // Sheet names are sanitized, try to find pengajaran_id pattern or use context
  const match = sheetName.match(/pengajaran[_-]?([a-zA-Z0-9]+)/i);
  if (match) return match[1];
  // Fallback: try to find in context or use first assignment
  return null;
}

function findSiswaIdByName(context, nama) {
  // This would need a mapping from context or a lookup
  // For now return null - would need to be implemented with actual data
  return null;
}

// ============================================================================
// NEW: Auto Backup Scheduler (Service Worker based)
// ============================================================================

export function registerAutoBackupScheduler() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-backup.js').then((reg) => {
      console.log('Auto-backup SW registered:', reg.scope);
      // Schedule periodic sync
      if ('periodicSync' in reg) {
        reg.periodicSync.register('auto-backup', { minInterval: 24 * 60 * 60 * 1000 }).catch(() => {});
      }
    }).catch((err) => console.warn('SW registration failed:', err));
  }
}

export function scheduleDailyBackupCheck() {
  // Client-side fallback: check every hour if it's Friday 15:00 or 7 days since last backup
  setInterval(() => {
    const now = new Date();
    const isFriday = now.getDay() === 5;
    const isFriday3PM = isFriday && now.getHours() === 15 && now.getMinutes() === 0;

    const lastBackup = getLastBackupTimestamp();
    const daysSince = lastBackup?.at ? Math.floor((Date.now() - new Date(lastBackup.at).getTime()) / 86400000) : Infinity;

    if (isFriday3PM || daysSince >= 7) {
      // Dispatch custom event for UI to show notification
      window.dispatchEvent(new CustomEvent('simguru:auto-backup-due', {
        detail: { isFriday, daysSince, lastBackup }
      }));
    }
  }, 60 * 60 * 1000); // Check every hour
}
