// ============================================================================
// excel-sheets.js
// Pembangun sheet Excel — MURNI, tanpa impor dan tanpa ketergantungan peramban.
//
// Berkas ini dipakai bersama oleh dua tempat:
//
//   1. src/utils/backup-excel.js   — ekspor manual oleh guru dari peramban
//   2. scripts/build-teacher-excel.js — pembuatan otomatis mingguan di server
//                                       (GitHub Actions), dari data snapshot
//
// Disatukan dengan sengaja. Sebelumnya ada dua pembangun Excel terpisah, dan
// versi server tertinggal: nama sheet melewati batas 31 karakter, tidak ada rumus
// hidup, dan tidak ada sheet Petunjuk. Satu sumber kode berarti perbaikan pada
// tampilan atau rumus otomatis berlaku di kedua tempat.
//
// ATURAN BERKAS INI: tidak boleh ada 'import' maupun 'require'. Objek ExcelJS
// dan seluruh data selalu diterima sebagai argumen, sehingga berkas ini dapat
// dimuat di peramban maupun di Node.js tanpa penyesuaian.
// ============================================================================


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

// ---------------------------------------------------------------------------
// Helper rumus Excel
//
// Sel angka pada berkas backup ditulis sebagai RUMUS, bukan angka mati, supaya
// guru dapat melanjutkan pekerjaan di Excel bila aplikasi tidak dapat diakses:
// mengubah satu status kehadiran atau satu nilai akan otomatis memperbarui
// total, persentase, rata-rata, dan grade.
//
// Setiap rumus juga menyertakan `result` (hasil yang sudah dihitung sistem) agar
// nilainya tetap tampil benar di penampil yang tidak menghitung ulang rumus,
// misalnya pratinjau Google Drive, WhatsApp, atau ponsel.
// ---------------------------------------------------------------------------

/** Nomor kolom (1-based) menjadi huruf kolom Excel. 1 → A, 27 → AA. */
function colLetter(column) {
  let n = Number(column) || 1;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(rem + 65) + letter;
    n = (n - rem - 1) / 26;
  }
  return letter;
}

/**
 * Bentuk nilai sel berupa rumus beserta hasil cache-nya.
 * @param {string} formula Rumus tanpa tanda '=' di depan.
 * @param {number|string} result Hasil yang sudah dihitung sistem.
 */
function formulaCell(formula, result) {
  return { formula, result: result === undefined || result === null ? '' : result };
}

/** Alamat rentang satu baris pada kolom tertentu, mis. C6:G6. */
function rowRange(startCol, endCol, row) {
  return `${colLetter(startCol)}${row}:${colLetter(endCol)}${row}`;
}

/** Alamat rentang satu kolom pada rentang baris, mis. C6:C40. */
function colRange(col, startRow, endRow) {
  const L = colLetter(col);
  return `${L}${startRow}:${L}${endRow}`;
}

/**
 * Pasang AutoFilter pada tabel dengan satu baris header, sehingga guru dapat
 * menyaring dan mengurutkan data langsung di Excel.
 */
function applyAutoFilter(sheet, headerRow, lastDataRow, totalCols) {
  if (!(lastDataRow > headerRow) || totalCols < 1) return;
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: lastDataRow, column: totalCols },
  };
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
  const firstDataRow = headerRowNum + 1;
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
    // Total = jumlah kolom H..K pada baris ini (rumus, ikut berubah bila diedit).
    const totalCell = row.getCell(8);
    applyDataCell(totalCell, dataRowNum, { bold: true });
    totalCell.value = formulaCell(`SUM(${rowRange(3, 7, dataRowNum)})`, d.Total);
    totals.Total += d.Total;
    // % Kehadiran = Hadir / Total, disimpan sebagai angka desimal + format persen
    // supaya bisa diurutkan dan dihitung, bukan teks seperti "85,7%".
    const pctCell = row.getCell(9);
    pctCell.value = formulaCell(
      `IF(H${dataRowNum}=0,"",C${dataRowNum}/H${dataRowNum})`,
      d.Total > 0 ? d.H / d.Total : ''
    );
    pctCell.numFmt = '0.0%';
    const pctFill = pct >= 80 ? COLOR.hadir : pct >= 60 ? COLOR.sakit : COLOR.alpa;
    const pctFont = pct >= 80 ? COLOR.hadirFont : pct >= 60 ? COLOR.sakitFont : COLOR.alpaFont;
    applyDataCell(pctCell, dataRowNum, { fill: pctFill, fontColor: pctFont, bold: true });
    dataRowNum++;
  });

  const lastDataRow = dataRowNum - 1;
  const hasData = lastDataRow >= firstDataRow;

  // Footer total
  const totalRow = sheet.getRow(dataRowNum);
  totalRow.height = 20;
  applyTotalCell(totalRow.getCell(1), '', 'center');
  applyTotalCell(totalRow.getCell(2), 'TOTAL KESELURUHAN', 'left');
  [['H'], ['S'], ['I'], ['A'], ['K']].forEach((s, i) => {
    const col = i + 3;
    const value = hasData
      ? formulaCell(`SUM(${colRange(col, firstDataRow, lastDataRow)})`, totals[s[0]])
      : totals[s[0]];
    applyTotalCell(totalRow.getCell(col), value, 'center');
  });
  applyTotalCell(
    totalRow.getCell(8),
    hasData ? formulaCell(`SUM(${colRange(8, firstDataRow, lastDataRow)})`, totals.Total) : totals.Total,
    'center'
  );
  const grandPct = totals.Total > 0 ? (totals.H / totals.Total) * 100 : 0;
  const grandPctCell = totalRow.getCell(9);
  applyTotalCell(
    grandPctCell,
    hasData
      ? formulaCell(
        `IF(H${dataRowNum}=0,"",C${dataRowNum}/H${dataRowNum})`,
        totals.Total > 0 ? totals.H / totals.Total : ''
      )
      : (totals.Total > 0 ? grandPct / 100 : ''),
    'center'
  );
  grandPctCell.numFmt = '0.0%';

  // Freeze: keep No+Nama visible, keep header visible
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRowNum }];
  applyAutoFilter(sheet, headerRowNum, lastDataRow, headers.length);

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
  const firstDataRow = headerRowNum + 1;
  let dataRowNum = headerRowNum + 1;
  let n = 1;
  const dailyTotals = {};
  dates.forEach((d) => { dailyTotals[d] = { H: 0, S: 0, I: 0, A: 0 }; });

  // Rentang kolom tanggal: dipakai rumus COUNTIF pada kolom rekap H/S/I/A.
  const dateFirstCol = 3;
  const dateLastCol = dates.length + 2;
  const sumStart = dates.length + 3;

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

    // Kolom rekap memakai COUNTIF pada baris tanggal, sehingga bila guru
    // mengubah/menambah status harian, rekapnya ikut terhitung ulang.
    const dailyRange = dates.length ? rowRange(dateFirstCol, dateLastCol, dataRowNum) : '';
    [['H', H, COLOR.hadir, COLOR.hadirFont], ['S', S, COLOR.sakit, COLOR.sakitFont],
     ['I', I, COLOR.izin, COLOR.izinFont], ['A', A, COLOR.alpa, COLOR.alpaFont]].forEach((s, i) => {
      const cell = row.getCell(sumStart + i);
      cell.value = dailyRange ? formulaCell(`COUNTIF(${dailyRange},"${s[0]}")`, s[1]) : s[1];
      applyDataCell(cell, dataRowNum, { fill: s[2], fontColor: s[3], bold: true });
    });
    dataRowNum++;
  });

  const lastDataRow = dataRowNum - 1;
  const hasData = lastDataRow >= firstDataRow;

  // Footer total harian
  const totalRow = sheet.getRow(dataRowNum);
  totalRow.height = 20;
  applyTotalCell(totalRow.getCell(1), '', 'center');
  applyTotalCell(totalRow.getCell(2), 'TOTAL HADIR / JUMLAH', 'left');
  dates.forEach((d, di) => {
    const dt = dailyTotals[d];
    const present = dt.H;
    const total = dt.H + dt.S + dt.I + dt.A;
    const cached = total > 0 ? `${present}/${total}` : '';
    let value = cached;
    if (hasData) {
      // Tampilkan "hadir/terisi" sebagai rumus agar mengikuti perubahan kolom.
      const rng = colRange(di + 3, firstDataRow, lastDataRow);
      const terisi = `COUNTIF(${rng},"H")+COUNTIF(${rng},"S")+COUNTIF(${rng},"I")+COUNTIF(${rng},"A")`;
      value = formulaCell(`IF((${terisi})=0,"",COUNTIF(${rng},"H")&"/"&(${terisi}))`, cached);
    }
    applyTotalCell(totalRow.getCell(di + 3), value, 'center');
  });
  ['H', 'S', 'I', 'A'].forEach((k, i) => {
    const col = sumStart + i;
    const sum = Object.values(dailyTotals).reduce((acc, dt) => acc + dt[k], 0);
    const value = hasData
      ? formulaCell(`SUM(${colRange(col, firstDataRow, lastDataRow)})`, sum)
      : sum;
    applyTotalCell(totalRow.getCell(col), value, 'center');
  });

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRowNum }];
  applyAutoFilter(sheet, headerRowNum, lastDataRow, totalCols);
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

  // Row keterangan cara Nilai Akhir dihitung.
  //
  // Catatan penting: label lama menyebut "Tugas 25% • UH 25% • PTS 25% • PAS 25%",
  // padahal perhitungan di bawah adalah RATA-RATA SEDERHANA dari seluruh nilai
  // yang terisi (setiap tugas, UH, PTS, dan PAS berbobot sama). Label diselaraskan
  // dengan perhitungan yang sebenarnya agar tidak menyesatkan guru. Bila memang
  // menginginkan bobot 25% per komponen, rumusnya harus diubah lebih dulu.
  const cfgRow = sheet.getRow(startRow);
  cfgRow.height = 16;
  applyInfoCell(cfgRow.getCell(1), 'Nilai Akhir', 'Rata-rata semua nilai yang terisi (tugas, UH, PTS, PAS berbobot sama) • dibulatkan 1 desimal');
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
    // Kolom 3 s/d (akhirCol-1) berisi SEMUA kolom nilai (tugas, UH, PTS, PAS)
    // secara berurutan, jadi rata-ratanya cukup satu AVERAGE. AVERAGE otomatis
    // mengabaikan sel kosong, persis seperti perhitungan sistem di atas.
    const nilaiRange = rowRange(3, akhirCol - 1, dataRowNum);
    const akhirCell = row.getCell(akhirCol);
    akhirCell.value = formulaCell(
      `IF(COUNT(${nilaiRange})=0,"",ROUND(AVERAGE(${nilaiRange}),1))`,
      akhir
    );
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
    // Grade mengikuti kolom Nilai Akhir, jadi ikut berubah bila nilai diperbaiki.
    const akhirRef = `${colLetter(akhirCol)}${dataRowNum}`;
    gradeCell.value = formulaCell(
      `IF(${akhirRef}="","",IF(${akhirRef}>=90,"A",IF(${akhirRef}>=85,"A-",IF(${akhirRef}>=80,"B+",IF(${akhirRef}>=75,"B",IF(${akhirRef}>=60,"C","D"))))))`,
      grade
    );
    const gSty = gradeStyle(grade);
    applyDataCell(gradeCell, dataRowNum, { align: 'center', bold: true, fill: gSty.fill, fontColor: gSty.fontColor });

    dataRowNum++;
  });

  const firstDataRow = hdrSubRowNum + 1;
  const lastDataRow = dataRowNum - 1;
  const hasData = lastDataRow >= firstDataRow;

  // Footer statistik kelas
  const statRow = sheet.getRow(dataRowNum);
  statRow.height = 20;
  applyTotalCell(statRow.getCell(1), '', 'center');
  applyTotalCell(statRow.getCell(2), 'RERATA KELAS', 'left');
  // Hitung rerata kolom akhir
  let kelasSum = 0, kelasCount = 0;
  for (let r = firstDataRow; r < dataRowNum; r++) {
    const cellVal = sheet.getRow(r).getCell(akhirCol).value;
    const v = cellVal && typeof cellVal === 'object' ? cellVal.result : cellVal;
    if (typeof v === 'number') { kelasSum += v; kelasCount++; }
  }
  const rerataKelas = kelasCount > 0 ? Number((kelasSum / kelasCount).toFixed(1)) : '';
  for (let c = 3; c <= totalCols; c++) {
    if (c === akhirCol) {
      const rng = colRange(akhirCol, firstDataRow, lastDataRow);
      applyTotalCell(
        statRow.getCell(c),
        hasData
          ? formulaCell(`IF(COUNT(${rng})=0,"",ROUND(AVERAGE(${rng}),1))`, rerataKelas)
          : rerataKelas,
        'center'
      );
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
// Sheet "Petunjuk"
// ---------------------------------------------------------------------------

/**
 * Tambahkan sheet petunjuk sebagai sheet pertama. Tujuannya agar berkas ini
 * dapat dipakai sebagai dokumen kerja mandiri: guru yang membukanya tanpa
 * membuka aplikasi tetap tahu isinya apa, mana yang boleh diedit, dan bagian
 * mana yang menghitung ulang sendiri.
 *
 * @param {object} workbook Workbook ExcelJS.
 * @param {object} meta
 * @param {string} [meta.userName] Nama guru pemilik berkas.
 * @param {object} [meta.context] Konteks periode aktif.
 * @param {string} [meta.scope] Keterangan cakupan isi berkas.
 */
function addGuideSheet(workbook, meta = {}) {
  const { userName = '', context = {}, scope = '' } = meta;
  const sheet = workbook.addWorksheet('Petunjuk', {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 18 },
  });

  const COLS = 2;
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 86;

  const row1 = sheet.getRow(1);
  row1.height = 28;
  applyTitleCell(row1.getCell(1), 'PETUNJUK PEMAKAIAN BERKAS BACKUP');
  sheet.mergeCells(1, 1, 1, COLS);

  const row2 = sheet.getRow(2);
  row2.height = 18;
  applySubtitleCell(row2.getCell(1), INSTITUTION_NAME);
  sheet.mergeCells(2, 1, 2, COLS);

  let r = 4;

  const addSectionRow = (title) => {
    const row = sheet.getRow(r);
    row.height = 22;
    applyHeaderCell(row.getCell(1), title);
    applyHeaderCell(row.getCell(2), '');
    sheet.mergeCells(r, 1, r, COLS);
    r += 1;
  };

  const addPairRow = (label, value) => {
    const row = sheet.getRow(r);
    row.height = 18;
    applyDataCell(row.getCell(1), r, { align: 'left', bold: true });
    row.getCell(1).value = label;
    applyDataCell(row.getCell(2), r, { align: 'left', wrap: true });
    row.getCell(2).value = value;
    r += 1;
  };

  const addNoteRow = (text) => {
    const row = sheet.getRow(r);
    row.height = 18;
    applyDataCell(row.getCell(1), r, { align: 'left' });
    row.getCell(1).value = '';
    applyDataCell(row.getCell(2), r, { align: 'left', wrap: true });
    row.getCell(2).value = text;
    r += 1;
  };

  const addSpacer = () => {
    sheet.getRow(r).height = 8;
    r += 1;
  };

  addSectionRow('IDENTITAS BERKAS');
  addPairRow('Pemilik', userName || '-');
  addPairRow('Tahun Ajaran', context.tahun_ajaran_aktif_nama || context.tahun_ajaran_aktif || '-');
  addPairRow('Semester', context.semester_aktif_nama || context.semester_aktif || '-');
  addPairRow('Dibuat pada', formatDateTimeDisplay(new Date()));
  addPairRow('Cakupan', scope || 'Absensi dan penilaian pada periode aktif di atas.');
  addSpacer();

  addSectionRow('BERKAS INI DAPAT DIPAKAI SEBAGAI LEMBAR KERJA');
  addNoteRow('Bila aplikasi SIMSMANSARI tidak dapat diakses, Bapak/Ibu tetap dapat melanjutkan pencatatan langsung di berkas Excel ini. Angka rekap di dalamnya bukan angka mati: sebagian besar berupa rumus yang menghitung ulang secara otomatis.');
  addSpacer();

  addSectionRow('KOLOM YANG MENGHITUNG SENDIRI (RUMUS)');
  addPairRow('Rekap Absen', 'Kolom "Total" dan "% Kehadiran", serta baris "TOTAL KESELURUHAN" di bagian bawah.');
  addPairRow('Absen Harian', 'Kolom rekap "H", "S", "I", "A" di sisi kanan, serta baris total di bagian bawah.');
  addPairRow('Nilai', 'Kolom "Nilai Akhir", kolom "Grade", dan baris "RERATA KELAS" di bagian bawah.');
  addNoteRow('Kolom-kolom tersebut tidak perlu dihitung manual. Cukup ubah data mentahnya, hasilnya menyesuaikan sendiri.');
  addSpacer();

  addSectionRow('CARA MELANJUTKAN PEKERJAAN');
  addPairRow('Menambah hari absen', 'Pada sheet "Absen Harian", sisipkan kolom baru SEBELUM kolom rekap "H" (bukan sesudahnya), lalu tulis tanggalnya di baris header dan isi status setiap siswa.');
  addPairRow('Status yang dipakai', 'H = Hadir, S = Sakit, I = Izin, A = Alpa, K = Keluar. Tulis dengan huruf kapital agar terhitung.');
  addPairRow('Mengubah nilai', 'Pada sheet "Nilai", ketik langsung angka di kolom tugas, UH, PTS, atau PAS. Kolom "Nilai Akhir" dan "Grade" akan menyesuaikan.');
  addPairRow('Mengubah keaktifan', 'Pada sheet "Keaktifan", ubah angka pada kolom indikator, "Jumlah Catatan", atau "Total Poin". Kolom "Rata-rata Poin" dan "Predikat" akan menyesuaikan.');
  addPairRow('Menambah siswa', 'Sisipkan baris baru DI ANTARA baris siswa yang ada (jangan di bawah baris total), agar tercakup rumus total.');
  addPairRow('Menyaring & mengurutkan', 'Sheet "Rekap Absen", "Absen Harian", dan "Keaktifan" sudah dilengkapi filter otomatis pada baris header.');
  addSpacer();

  addSectionRow('HAL YANG PERLU DIPERHATIKAN');
  addNoteRow('1. Berkas ini adalah SALINAN. Perubahan yang Bapak/Ibu lakukan di sini TIDAK otomatis masuk ke aplikasi, dan sebaliknya perubahan di aplikasi tidak masuk ke berkas ini.');
  addNoteRow('2. Bila nanti aplikasi kembali normal, data yang sudah ditambahkan di Excel perlu dimasukkan kembali ke aplikasi secara manual. Berkas Excel tidak dapat diunggah balik ke sistem.');
  addNoteRow('3. Simpanlah berkas ini dengan nama baru setiap kali diubah (misalnya diberi tambahan tanggal), agar versi aslinya tetap utuh sebagai bukti cadangan.');
  addNoteRow('4. "Nilai Akhir" dihitung sebagai rata-rata sederhana dari semua nilai yang terisi; setiap tugas, UH, PTS, dan PAS berbobot sama.');
  addNoteRow('5. Predikat keaktifan mengikuti aturan aplikasi: rata-rata poin 3,5 atau lebih = A, 2,5 sampai di bawah 3,5 = B, di bawah 2,5 = C.');
  addNoteRow('6. Jangan menghapus baris header berwarna biru atau baris total di bagian bawah, karena rumus mengacu ke baris-baris tersebut.');

  return sheet;
}

// ---------------------------------------------------------------------------
// Sheet Keaktifan Siswa
// ---------------------------------------------------------------------------

/** Lima indikator keaktifan, sama seperti di src/pages/guru/keaktifan.js:12-18. */
const ACTIVITY_INDICATORS = [
  { key: 'bertanya', label: 'Bertanya' },
  { key: 'menjawab', label: 'Menjawab' },
  { key: 'diskusi', label: 'Diskusi' },
  { key: 'presentasi', label: 'Presentasi' },
  { key: 'tugas_kelas', legacyKey: 'membantu', label: 'Tugas Kelas' },
];

/**
 * Apakah satu indikator aktif pada sebuah catatan keaktifan.
 * Menangani nama lama `membantu` yang kini bernama `tugas_kelas`.
 */
function isIndicatorActive(indicators, item) {
  const map = indicators && typeof indicators === 'object' ? indicators : {};
  if (Object.prototype.hasOwnProperty.call(map, item.key)) return Boolean(map[item.key]);
  if (item.legacyKey && Object.prototype.hasOwnProperty.call(map, item.legacyKey)) {
    return Boolean(map[item.legacyKey]);
  }
  return false;
}

/** Poin satu catatan, dibatasi 1-4 seperti clampScore() di halaman keaktifan. */
function recordPoints(record) {
  const raw = Number(record?.poin_indikator ?? record?.skor ?? 1) || 1;
  return Math.max(1, Math.min(4, raw));
}

/**
 * Rekap keaktifan siswa untuk satu pengajaran.
 *
 * Nilai mentah (jumlah tiap indikator, jumlah catatan, total poin) ditulis sebagai
 * angka, sedangkan rata-rata dan predikat ditulis sebagai RUMUS agar ikut berubah
 * bila guru menyunting angkanya di Excel. Ambang predikat mengikuti scoreGrade()
 * di src/pages/guru/keaktifan.js:85 — 3,5 ke atas A, 2,5 ke atas B, sisanya C.
 *
 * @param {object} workbook Workbook ExcelJS.
 * @param {object} assignment Pengajaran (kelas_nama, mapel_nama, ...).
 * @param {Array} members Daftar anggota kelas.
 * @param {Array} records Dokumen keaktifan_siswa untuk pengajaran ini.
 * @param {object} context Periode aktif.
 * @param {string} userName Nama guru.
 */
function buildKeaktifanSheet(workbook, assignment, members, records, context, userName) {
  const sheetName = uniqueSheetName(workbook, `Keaktifan ${assignment.kelas_nama || ''}`);
  const sheet = workbook.addWorksheet(sheetName, { properties: { defaultRowHeight: 18 } });

  const headers = [
    'No', 'Nama Siswa',
    ...ACTIVITY_INDICATORS.map((item) => item.label),
    'Jumlah Catatan', 'Total Poin', 'Rata-rata Poin', 'Predikat',
  ];
  const totalCols = headers.length;
  const idxJumlah = 3 + ACTIVITY_INDICATORS.length;   // kolom "Jumlah Catatan"
  const idxTotal = idxJumlah + 1;                     // kolom "Total Poin"
  const idxRerata = idxTotal + 1;                     // kolom "Rata-rata Poin"
  const idxPredikat = idxRerata + 1;                  // kolom "Predikat"

  const startRow = writeInstitutionHeader(
    sheet, totalCols,
    `REKAP KEAKTIFAN SISWA - ${assignment.kelas_nama || '-'}`,
    buildInfoPairs(assignment, context, userName)
  );

  const headerRowNum = startRow;
  const headerRow = sheet.getRow(headerRowNum);
  headerRow.height = 26;
  headers.forEach((text, i) => applyHeaderCell(headerRow.getCell(i + 1), text));

  // Kelompokkan catatan per siswa.
  const perSiswa = {};
  (Array.isArray(records) ? records : []).forEach((rec) => {
    const sid = rec?.siswa_id;
    if (!sid) return;
    if (!perSiswa[sid]) {
      perSiswa[sid] = { jumlah: 0, poin: 0, indikator: {} };
      ACTIVITY_INDICATORS.forEach((item) => { perSiswa[sid].indikator[item.key] = 0; });
    }
    const bucket = perSiswa[sid];
    bucket.jumlah += 1;
    bucket.poin += recordPoints(rec);
    ACTIVITY_INDICATORS.forEach((item) => {
      if (isIndicatorActive(rec.indikator, item)) bucket.indikator[item.key] += 1;
    });
  });

  const sorted = sortMembers(members);
  const firstDataRow = headerRowNum + 1;
  let dataRowNum = firstDataRow;
  let n = 1;
  const totals = { jumlah: 0, poin: 0, indikator: {} };
  ACTIVITY_INDICATORS.forEach((item) => { totals.indikator[item.key] = 0; });

  sorted.forEach((m) => {
    const d = perSiswa[m.siswa_id] || { jumlah: 0, poin: 0, indikator: {} };
    const row = sheet.getRow(dataRowNum);
    row.height = 18;

    applyDataCell(row.getCell(1), dataRowNum, { align: 'center' });
    row.getCell(1).value = n++;
    applyDataCell(row.getCell(2), dataRowNum, { align: 'left' });
    row.getCell(2).value = m.siswa_nama || '-';

    ACTIVITY_INDICATORS.forEach((item, i) => {
      const jumlah = Number(d.indikator?.[item.key] || 0);
      const cell = row.getCell(i + 3);
      cell.value = jumlah;
      applyDataCell(cell, dataRowNum, {
        bold: jumlah > 0,
        fill: jumlah > 0 ? COLOR.hadir : null,
        fontColor: jumlah > 0 ? COLOR.hadirFont : null,
      });
      totals.indikator[item.key] += jumlah;
    });

    const cJumlah = row.getCell(idxJumlah);
    cJumlah.value = d.jumlah;
    applyDataCell(cJumlah, dataRowNum, { bold: true });
    totals.jumlah += d.jumlah;

    const cTotal = row.getCell(idxTotal);
    cTotal.value = d.poin;
    applyDataCell(cTotal, dataRowNum, { bold: true });
    totals.poin += d.poin;

    const rerata = d.jumlah > 0 ? Number((d.poin / d.jumlah).toFixed(2)) : '';
    const refJumlah = `${colLetter(idxJumlah)}${dataRowNum}`;
    const refTotal = `${colLetter(idxTotal)}${dataRowNum}`;
    const cRerata = row.getCell(idxRerata);
    cRerata.value = formulaCell(
      `IF(${refJumlah}=0,"",ROUND(${refTotal}/${refJumlah},2))`,
      rerata
    );
    cRerata.numFmt = '0.00';

    const predikat = typeof rerata === 'number'
      ? (rerata >= 3.5 ? 'A' : rerata >= 2.5 ? 'B' : 'C')
      : '';
    const fill = predikat === 'A' ? COLOR.hadir : predikat === 'B' ? COLOR.izin : predikat === 'C' ? COLOR.sakit : null;
    const font = predikat === 'A' ? COLOR.hadirFont : predikat === 'C' ? COLOR.sakitFont : COLOR.izinFont;
    applyDataCell(cRerata, dataRowNum, { bold: true, fill, fontColor: fill ? font : null });

    const refRerata = `${colLetter(idxRerata)}${dataRowNum}`;
    const cPredikat = row.getCell(idxPredikat);
    cPredikat.value = formulaCell(
      `IF(${refRerata}="","",IF(${refRerata}>=3.5,"A",IF(${refRerata}>=2.5,"B","C")))`,
      predikat
    );
    applyDataCell(cPredikat, dataRowNum, { align: 'center', bold: true, fill, fontColor: fill ? font : null });

    dataRowNum += 1;
  });

  const lastDataRow = dataRowNum - 1;
  const hasData = lastDataRow >= firstDataRow;

  // Footer total kelas.
  const totalRow = sheet.getRow(dataRowNum);
  totalRow.height = 20;
  applyTotalCell(totalRow.getCell(1), '', 'center');
  applyTotalCell(totalRow.getCell(2), 'TOTAL KELAS', 'left');
  ACTIVITY_INDICATORS.forEach((item, i) => {
    const col = i + 3;
    applyTotalCell(
      totalRow.getCell(col),
      hasData
        ? formulaCell(`SUM(${colRange(col, firstDataRow, lastDataRow)})`, totals.indikator[item.key])
        : totals.indikator[item.key],
      'center'
    );
  });
  applyTotalCell(
    totalRow.getCell(idxJumlah),
    hasData ? formulaCell(`SUM(${colRange(idxJumlah, firstDataRow, lastDataRow)})`, totals.jumlah) : totals.jumlah,
    'center'
  );
  applyTotalCell(
    totalRow.getCell(idxTotal),
    hasData ? formulaCell(`SUM(${colRange(idxTotal, firstDataRow, lastDataRow)})`, totals.poin) : totals.poin,
    'center'
  );
  const rerataKelas = totals.jumlah > 0 ? Number((totals.poin / totals.jumlah).toFixed(2)) : '';
  const cRerataKelas = totalRow.getCell(idxRerata);
  applyTotalCell(
    cRerataKelas,
    hasData
      ? formulaCell(
        `IF(${colLetter(idxJumlah)}${dataRowNum}=0,"",ROUND(${colLetter(idxTotal)}${dataRowNum}/${colLetter(idxJumlah)}${dataRowNum},2))`,
        rerataKelas
      )
      : rerataKelas,
    'center'
  );
  cRerataKelas.numFmt = '0.00';
  const refRerataKelas = `${colLetter(idxRerata)}${dataRowNum}`;
  applyTotalCell(
    totalRow.getCell(idxPredikat),
    hasData
      ? formulaCell(
        `IF(${refRerataKelas}="","",IF(${refRerataKelas}>=3.5,"A",IF(${refRerataKelas}>=2.5,"B","C")))`,
        typeof rerataKelas === 'number' ? (rerataKelas >= 3.5 ? 'A' : rerataKelas >= 2.5 ? 'B' : 'C') : ''
      )
      : '',
    'center'
  );

  // Keterangan bila memang belum ada catatan keaktifan sama sekali, supaya guru
  // tidak menyangka datanya hilang.
  if (!totals.jumlah) {
    const noteRow = sheet.getRow(dataRowNum + 2);
    applyInfoCell(noteRow.getCell(1), 'Catatan', 'Belum ada catatan keaktifan untuk periode dan kelas ini.');
    sheet.mergeCells(dataRowNum + 2, 1, dataRowNum + 2, totalCols);
  }

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRowNum }];
  applyAutoFilter(sheet, headerRowNum, lastDataRow, totalCols);
  autoFitColumns(sheet, headerRowNum);
  return sheet;
}


// ---------------------------------------------------------------------------
// Normalisasi data satu pengajaran
// ---------------------------------------------------------------------------

/**
 * Ubah dokumen mentah Firestore menjadi bentuk yang dipakai buildRekapNilaiSheet.
 *
 * Dipisahkan dan dibuat murni agar dua pemanggil memakai pemetaan yang sama:
 * ekspor guru di peramban (mengambil data lewat query) dan pembuatan Excel
 * mingguan di server (mengambil data dari snapshot yang sudah di memori).
 * Perbedaan pemetaan sekecil apa pun akan membuat kedua berkas tidak sama,
 * dan itu justru yang ingin dihindari.
 *
 * @param {object} docs
 * @param {Array} docs.babDocs
 * @param {Array} docs.tugasDocs
 * @param {Array} docs.uhKolomDocs
 * @param {Array} docs.nilaiTugasDocs
 * @param {Array} docs.nilaiUjianDocs
 */
function normalizeAssignmentData({
  babDocs = [],
  tugasDocs = [],
  uhKolomDocs = [],
  nilaiTugasDocs = [],
  nilaiUjianDocs = [],
} = {}) {
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

  return { babs, tugasMap, uhKolom, nilaiTugas, nilaiUH, nilaiPTS, nilaiPAS };
}

// ---------------------------------------------------------------------------
// Ekspor
// ---------------------------------------------------------------------------

export {
  INSTITUTION_NAME,
  COLOR,
  ACTIVITY_INDICATORS,
  sanitizeSheetName,
  uniqueSheetName,
  formatDate,
  formatDateTimeDisplay,
  colLetter,
  formulaCell,
  rowRange,
  colRange,
  applyAutoFilter,
  applyTitleCell,
  applySubtitleCell,
  applyInfoCell,
  applyHeaderCell,
  applyDataCell,
  applyTotalCell,
  writeInstitutionHeader,
  estimateTextWidth,
  autoFitColumns,
  statusStyle,
  gradeStyle,
  buildInfoPairs,
  sortMembers,
  normalizeAssignmentData,
  buildRekapAbsensiSheet,
  buildAbsensiHarianSheet,
  buildRekapNilaiSheet,
  buildKeaktifanSheet,
  addGuideSheet,
};
