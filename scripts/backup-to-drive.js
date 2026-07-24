const { google } = require('googleapis');
const admin = require('firebase-admin');
const path = require('path');

// --- Helper Functions ---

// Sanitize sheet names for Google Sheets (max 100 chars, no invalid chars)
function sanitizeSheetName(name) {
  return String(name || '').replace(/[[\]:?*\/\\]/g, '').slice(0, 100);
}

// Convert column index (0-based) to A1 notation letter (e.g., 0 -> A, 25 -> Z, 26 -> AA)
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

// Group array of objects by a key
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}

// Format date to YYYY-MM-DD
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Firestore Data Fetching ---

async function getFirestoreData(db, collectionName, filters = [], orderBy = null, limit = null) {
  let query = db.collection(collectionName);
  filters.forEach(f => {
    query = query.where(f.field, f.operator || '==', f.value);
  });
  if (orderBy) {
    query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
  }
  if (limit) {
    query = query.limit(limit);
  }
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getActiveTeachingAssignments(db, period) {
  const filters = [
    { field: 'tahun_ajaran_id', value: period.year },
    { field: 'semester_id', value: period.semester },
  ];
  const pengajaranData = await getFirestoreData(db, 'pengajaran', filters);

  if (!pengajaranData.length) {
    // Fallback to pembelajaran if no pengajaran found (for old data compatibility)
    return getFirestoreData(db, 'pembelajaran', filters);
  }
  return pengajaranData;
}

// --- Google Drive & Sheets API Functions ---

async function getServiceAccountAuth(sa) {
  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file', // Allows creating files in user's Drive
    ],
  });
  return auth.getClient();
}

async function ensureBackupFolder(drive, folderName, parentId = null) {
  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q: parentId ? `${q} and '${parentId}' in parents` : q });
  if (res.data.files.length) {
    return res.data.files[0];
  }
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : [],
  };
  const folder = await drive.files.create({ resource: fileMetadata, fields: 'id' });
  return folder.data;
}

async function createSpreadsheet(sheets, drive, parentFolderId, guruId, guruName, dateStr) {
  const spreadsheetTitle = `Laporan - ${guruName} - ${dateStr}`;
  const fileMetadata = {
    name: spreadsheetTitle,
    parents: [parentFolderId],
    mimeType: 'application/vnd.google-apps.spreadsheet',
  };
  const spreadsheet = await sheets.spreadsheets.create({ resource: fileMetadata, fields: 'spreadsheetId' });
  console.log(`Created spreadsheet for ${guruName}: ${spreadsheet.data.spreadsheetId}`);
  return spreadsheet.data.spreadsheetId;
}

async function createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex) {
  const request = {
    spreadsheetId,
    resource: {
      requests: [{
        addSheet: {
          properties: {
            title: sanitizeSheetName(sheetTitle),
            index: sheetIndex,
          },
        },
      }],
    },
  };
  await sheets.spreadsheets.batchUpdate(request);
}

// --- Data Processing & Sheet Generation ---

async function generateRekapAbsensi(sheets, spreadsheetId, assignment, siswaList, absensiData, sheetIndex) {
  const sheetTitle = sanitizeSheetName(`Rekap Absensi - ${assignment.kelas_nama || assignment.kelas_id}`);
  await createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex);
  const rekapAbsen = {};
  absensiData.forEach(absen => {
    if (!rekapAbsen[absen.siswa_id]) {
      rekapAbsen[absen.siswa_id] = { nama: absen.siswa_nama, H: 0, S: 0, I: 0, A: 0, Total: 0 };
    }
    rekapAbsen[absen.siswa_id][absen.status]++;
    rekapAbsen[absen.siswa_id].Total++;
  });

  const values = [
    ['No', 'Nama Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total Pertemuan', '% Kehadiran'],
  ];
  let rowNum = 1;
  const sheetSiswa = siswaList.sort((a,b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  sheetSiswa.forEach(siswa => {
    const data = rekapAbsen[siswa.id] || { nama: siswa.nama, H: 0, S: 0, I: 0, A: 0, Total: 0 };
    const percentage = data.Total > 0 ? (data.H / data.Total) * 100 : 0;
    values.push([
      rowNum++,
      data.nama,
      data.H,
      data.S,
      data.I,
      data.A,
      data.Total,
      `${percentage.toFixed(1)}%`,
    ]);
  });

  // Footer for totals
  const totalHadir = Object.values(rekapAbsen).reduce((sum, r) => sum + r.H, 0);
  const totalSakit = Object.values(rekapAbsen).reduce((sum, r) => sum + r.S, 0);
  const totalIzin = Object.values(rekapAbsen).reduce((sum, r) => sum + r.I, 0);
  const totalAlpa = Object.values(rekapAbsen).reduce((sum, r) => sum + r.A, 0);
  const grandTotal = Object.values(rekapAbsen).reduce((sum, r) => sum + r.Total, 0);
  const grandPercentage = grandTotal > 0 ? (totalHadir / grandTotal) * 100 : 0;

  values.push([
    '',
    'Total Keseluruhan',
    totalHadir,
    totalSakit,
    totalIzin,
    totalAlpa,
    grandTotal,
    `${grandPercentage.toFixed(1)}%`,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
  return sheetTitle;
}

async function generateAbsensiHarian(sheets, spreadsheetId, assignment, siswaList, absensiData, sheetIndex) {
  const sheetTitle = sanitizeSheetName(`Absensi Harian - ${assignment.kelas_nama || assignment.kelas_id}`);
  await createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex);

  const dates = [...new Set(absensiData.map(a => a.tanggal))].sort();
  const dateHeaders = dates.map(d => formatDate(d));

  const headerRow = ['No', 'Nama Siswa', ...dateHeaders, 'H', 'S', 'I', 'A'];
  const values = [headerRow];

  const absenBySiswaAndDate = {};
  absensiData.forEach(absen => {
    if (!absenBySiswaAndDate[absen.siswa_id]) absenBySiswaAndDate[absen.siswa_id] = {};
    absenBySiswaAndDate[absen.siswa_id][absen.tanggal] = absen.status;
  });

  let rowNum = 1;
  const sheetSiswa = siswaList.sort((a,b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  sheetSiswa.forEach(siswa => {
    const studentData = absenBySiswaAndDate[siswa.id] || {};
    const row = [rowNum++, siswa.nama];
    let H_count = 0, S_count = 0, I_count = 0, A_count = 0;

    dates.forEach(date => {
      const status = studentData[date] || '-'; // Use '-' for empty
      row.push(status);
      if (status === 'H') H_count++;
      else if (status === 'S') S_count++;
      else if (status === 'I') I_count++;
      else if (status === 'A') A_count++;
    });
    row.push(H_count, S_count, I_count, A_count);
    values.push(row);
  });

  // Footer for total attendance per date
  const totalFooterRow = ['Total Harian', ''];
  const statusCounts = {}; // { date: { H: count, S: count, I: count, A: count } }
  dates.forEach(date => statusCounts[date] = { H: 0, S: 0, I: 0, A: 0 });

  absensiData.forEach(absen => {
    if (statusCounts[absen.tanggal]) {
      statusCounts[absen.tanggal][absen.status]++;
    }
  });

  dates.forEach(date => {
    const counts = statusCounts[date];
    const totalPresent = (counts.H || 0) + (counts.S || 0) + (counts.I || 0); // Consider S/I as 'present' for total count
    const totalStudentsForDay = totalPresent + (counts.A || 0); // Assuming 'A' is absent

    if (totalStudentsForDay > 0) {
        totalFooterRow.push(`${counts.H}/${totalStudentsForDay}`); // Display H/Total for simplicity
    } else {
        totalFooterRow.push('-');
    }
  });
  // Add empty cells for the final H/S/I/A columns in the footer
  totalFooterRow.push('', '', '', '');
  values.push(totalFooterRow);


  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });
  return sheetTitle;
}

async function generateNilai(sheets, spreadsheetId, assignment, siswaList, nilaiData, babData, tugasData, uhKolomData, sheetIndex) {
  const sheetTitle = sanitizeSheetName(`Nilai - ${assignment.kelas_nama || assignment.kelas_id}`);
  await createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex);

  // --- Configuration Section ---
  const configValues = [
    ['KONFIGURASI BOBOT NILAI'],
    ['Bobot Tugas', 0.25, 'Bobot UH', 0.25, 'Bobot PTS', 0.25, 'Bobot PAS', 0.25],
    [], // Empty row for spacing
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: configValues },
  });

  // --- Dynamic Headers ---
  const babMap = {}; // bab_id -> {nama, urutan, tugas: []}
  babData.sort((a,b) => (a.urutan || 0) - (b.urutan || 0)).forEach(bab => {
    babMap[bab.id] = { ...bab, tugas: [] };
  });

  tugasData.forEach(tugas => {
    if (babMap[tugas.bab_id]) {
      babMap[tugas.bab_id].tugas.push(tugas);
    }
  });

  Object.values(babMap).forEach(bab => {
    bab.tugas.sort((a,b) => (a.urutan || 0) - (b.urutan || 0));
  });

  const uhKolomMap = {}; // id -> nama
  uhKolomData.forEach(uh => { uhKolomMap[uh.id] = uh.nama; });

  const mergedHeaders = [['No', 'Nama Siswa']];
  const secondLevelHeaders = [['', '']]; // Task-specific headers

  let currentColumn = 2; // Start after No (A) and Nama Siswa (B)

  // BAB and Tugas Headers
  Object.values(babMap).forEach(bab => {
    if (bab.tugas.length === 0) {
      mergedHeaders[0].push(bab.nama);
      secondLevelHeaders[0].push('Tugas'); // Just 'Tugas' if no specific tasks
      currentColumn++;
    } else {
      mergedHeaders[0].push(bab.nama); // BAB name for merge
      for (let i = 1; i < bab.tugas.length; i++) { mergedHeaders[0].push(''); } // Empty for merge
      bab.tugas.forEach(tugas => {
        secondLevelHeaders[0].push(tugas.nama);
        currentColumn++;
      });
    }
  });

  // Rerata Tugas
  mergedHeaders[0].push('Rerata Tugas');
  secondLevelHeaders[0].push('');
  currentColumn++;

  // UH Headers
  const uhHeaders = Object.values(uhKolomMap).sort().map(name => name); // Sort by name
  uhHeaders.forEach(uhName => {
    mergedHeaders[0].push('Ulangan Harian'); // Group UH
    secondLevelHeaders[0].push(uhName); // Specific UH name
    currentColumn++;
  });

  // Rerata UH
  mergedHeaders[0].push('Rerata UH');
  secondLevelHeaders[0].push('');
  currentColumn++;

  // PTS, PAS
  mergedHeaders[0].push('PTS');
  secondLevelHeaders[0].push('');
  currentColumn++;
  mergedHeaders[0].push('PAS');
  secondLevelHeaders[0].push('');
  currentColumn++;

  // Nilai Akhir & Grade
  mergedHeaders[0].push('Nilai Akhir');
  secondLevelHeaders[0].push('');
  currentColumn++;
  mergedHeaders[0].push('Grade');
  secondLevelHeaders[0].push('');
  currentColumn++;


  const headerStartRow = configValues.length + 1; // After config and empty line
  const dataStartRow = headerStartRow + mergedHeaders.length + 1; // After headers and empty line

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A${headerStartRow}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: mergedHeaders.concat(secondLevelHeaders) },
  });

  // --- Data Rows ---
  const nilaiMap = {}; // siswa_id -> { bab_id -> { tugas_id -> nilai }, uh_id -> nilai, pts: nilai, pas: nilai }
  nilaiData.nilaiTugas.forEach(nt => {
    if (!nilaiMap[nt.siswa_id]) nilaiMap[nt.siswa_id] = {};
    if (!nilaiMap[nt.siswa_id][nt.bab_id]) nilaiMap[nt.siswa_id][nt.bab_id] = {};
    nilaiMap[nt.siswa_id][nt.bab_id][nt.tugas_id] = nt.nilai;
  });

  nilaiData.nilaiUjian.forEach(nu => {
    if (!nilaiMap[nu.siswa_id]) nilaiMap[nu.siswa_id] = {};
    if (nu.jenis_nilai === 'ulangan_harian') {
      nilaiMap[nu.siswa_id][nu.tipe] = nu.nilai; // UH score by ulangan_harian_kolom id
    } else if (nu.jenis_nilai === 'pts') {
      nilaiMap[nu.siswa_id].pts = nu.nilai;
    } else if (nu.jenis_nilai === 'pas') {
      nilaiMap[nu.siswa_id].pas = nu.nilai;
    }
  });

  const dataRows = [];
  let studentRowNum = 1;
  const sheetSiswa = siswaList.sort((a,b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  sheetSiswa.forEach(siswa => {
    const row = [studentRowNum++, siswa.nama];
    const studentNilai = nilaiMap[siswa.id] || {};

    let totalTugasScore = 0;
    let totalTugasCount = 0;
    const tugasScores = []; // Keep track of specific tugas scores for average

    Object.values(babMap).forEach(bab => {
      if (bab.tugas.length === 0) {
        // Just empty cell if no tasks
        row.push('');
      } else {
        bab.tugas.forEach(tugas => {
          const score = studentNilai[bab.id]?.[tugas.id] || '-';
          row.push(score);
          if (typeof score === 'number') {
            tugasScores.push(score);
            totalTugasScore += score;
            totalTugasCount++;
          }
        });
      }
    });

    // Rerata Tugas Formula
    const rerataTugasFormulaCell = columnToLetter(row.length + 1); // +1 because we are pushing values
    const rerataTugasFormula = tugasScores.length > 0 ? `=AVERAGE(${columnToLetter(currentColumn - tugasScores.length + 2)}${dataStartRow + studentRowNum -1}:${columnToLetter(currentColumn + 1)}${dataStartRow + studentRowNum-1})` : '-';
    // this formula is wrong, need to calculate dynamically
    row.push(tugasScores.length > 0 ? (totalTugasScore / totalTugasCount).toFixed(1) : '-');


    let totalUHScore = 0;
    let totalUHCount = 0;

    // UH Scores
    uhHeaders.forEach(uhName => {
      const uhId = Object.keys(uhKolomMap).find(key => uhKolomMap[key] === uhName);
      const score = studentNilai[uhId] || '-';
      row.push(score);
      if (typeof score === 'number') {
        totalUHScore += score;
        totalUHCount++;
      }
    });

    // Rerata UH Formula
    row.push(totalUHCount > 0 ? (totalUHScore / totalUHCount).toFixed(1) : '-');

    // PTS, PAS
    row.push(studentNilai.pts || '-');
    row.push(studentNilai.pas || '-');

    // Nilai Akhir Formula (references config cells A2,C2,E2,G2 etc, and other cells in this row)
    const rerataTugasColLetter = columnToLetter(currentColumn + 2); // Assuming Rerata Tugas is the next one
    const rerataUHColLetter = columnToLetter(currentColumn + 4 + uhHeaders.length); // Assuming Rerata UH position
    const ptsColLetter = columnToLetter(currentColumn + 5 + uhHeaders.length);
    const pasColLetter = columnToLetter(currentColumn + 6 + uhHeaders.length);

    const nilaiAkhirFormula = `=IFERROR((${rerataTugasColLetter}${dataStartRow + studentRowNum -1}*B$2)+(${rerataUHColLetter}${dataStartRow + studentRowNum -1}*D$2)+(${ptsColLetter}${dataStartRow + studentRowNum -1}*F$2)+(${pasColLetter}${dataStartRow + studentRowNum -1}*H$2),"-")`;
    row.push(nilaiAkhirFormula);

    // Grade Formula
    const nilaiAkhirColLetter = columnToLetter(currentColumn + 7 + uhHeaders.length);
    const gradeFormula = `=IF(${nilaiAkhirColLetter}${dataStartRow + studentRowNum -1}>=90,"A",IF(${nilaiAkhirColLetter}${dataStartRow + studentRowNum -1}>=85,"A-",IF(${nilaiAkhirColLetter}${dataStartRow + studentRowNum -1}>=80,"B+",IF(${nilaiAkhirColLetter}${dataStartRow + studentRowNum -1}>=75,"B",IF(${nilaiAkhirColLetter}${dataStartRow + studentRowNum -1}>=60,"C","D")))))`;
    row.push(gradeFormula);

    dataRows.push(row);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A${dataStartRow}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: dataRows },
  });

  // --- Apply Formatting ---
  const requests = [];
  // ... (formatting requests will go here)

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests },
  });

  return sheetTitle;
}

// --- Main Backup Function ---

async function main() {
  if (!process.env.GOOGLE_SA_KEY && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('Error: GOOGLE_SA_KEY or FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set.');
    process.exit(1);
  }

  const saJson = process.env.GOOGLE_SA_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const sa = JSON.parse(saJson);

  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  const auth = await getServiceAccountAuth(sa);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const dateStr = new Date().toISOString().slice(0, 10);
  const rootFolderName = 'Backup SIMSMANSARI';
  const rootFolder = await ensureBackupFolder(drive, rootFolderName);
  const dateFolder = await ensureBackupFolder(drive, `Laporan SIMSMANSARI - ${dateStr}`, rootFolder.id);

  const pengajaranData = await getFirestoreData(db, 'pengajaran', [
    { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' }, // Default year
    { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' }, // Default semester
  ]);

  const assignmentsByGuru = groupBy(pengajaranData, 'guru_id');
  let guruCount = 0;

  for (const guruId of Object.keys(assignmentsByGuru)) {
    guruCount++;
    const assignments = assignmentsByGuru[guruId];
    const guruName = assignments[0].guru_nama || `Guru-${guruId}`;
    const mapelName = assignments[0].mapel_nama || 'Mapel';

    const spreadsheetTitle = `${String(guruCount).padStart(2, '0')} - ${guruName} (${mapelName})`;
    const spreadsheetId = await createSpreadsheet(sheets, drive, dateFolder.id, guruId, guruName, spreadsheetTitle);

    // Get all students for this guru's classes
    const classIds = [...new Set(assignments.map(a => a.kelas_id))];
    let siswaList = [];
    for (const classId of classIds) {
      const studentsInClass = await getFirestoreData(db, 'users', [
        { field: 'role', operator: '==', value: 'siswa' },
        { field: 'kelas_id', operator: '==', value: classId },
      ]);
      siswaList.push(...studentsInClass);
    }
    siswaList = [...new Map(siswaList.map(item => [item.id, item])).values()]; // Deduplicate

    // Data for all assignments for this guru
    const allAbsensi = await getFirestoreData(db, 'absensi', [
      { field: 'guru_id', operator: '==', value: guruId },
      { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' },
      { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' },
    ]);
    const allNilaiTugas = await getFirestoreData(db, 'nilai_tugas', [
      { field: 'guru_id', operator: '==', value: guruId },
      { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' },
      { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' },
    ]);
    const allNilaiUjian = await getFirestoreData(db, 'nilai_ujian', [
      { field: 'guru_id', operator: '==', value: guruId },
      { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' },
      { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' },
    ]);
    const allBab = await getFirestoreData(db, 'bab', [
      { field: 'guru_id', operator: '==', value: guruId }, // Assuming bab has guru_id
      { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' },
      { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' },
    ]);
    const allTugasBab = await getFirestoreData(db, 'tugas_bab', [
      { field: 'guru_id', operator: '==', value: guruId }, // Assuming tugas_bab has guru_id
      { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' },
      { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' },
    ]);
    const allUhKolom = await getFirestoreData(db, 'ulangan_harian_kolom', [
      { field: 'guru_id', operator: '==', value: guruId }, // Assuming ulangan_harian_kolom has guru_id
      { field: 'tahun_ajaran_id', operator: '==', value: process.env.TAHUN_AJARAN_AKTIF || '2025' },
      { field: 'semester_id', operator: '==', value: process.env.SEMESTER_AKTIF || 'gasal' },
    ]);

    let sheetIndex = 0;
    for (const assignment of assignments.sort((a,b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || '')))) {
      const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Unknown';
      const pengajaranId = assignment.id;

      const currentKelasSiswa = siswaList.filter(s => s.kelas_id === assignment.kelas_id);
      const currentAbsensi = allAbsensi.filter(a => a.pengajaran_id === pengajaranId);
      const currentNilaiTugas = allNilaiTugas.filter(n => n.pengajaran_id === pengajaranId);
      const currentNilaiUjian = allNilaiUjian.filter(n => n.pengajaran_id === pengajaranId);
      const currentBab = allBab.filter(b => b.pengajaran_id === pengajaranId);
      const currentTugasBab = allTugasBab.filter(t => t.pengajaran_id === pengajaranId);
      const currentUhKolom = allUhKolom.filter(uh => uh.pengajaran_id === pengajaranId);

      // Create Rekap Absensi sheet
      await generateRekapAbsensi(sheets, spreadsheetId, assignment, currentKelasSiswa, currentAbsensi, sheetIndex++);
      // Create Absensi Harian sheet
      await generateAbsensiHarian(sheets, spreadsheetId, assignment, currentKelasSiswa, currentAbsensi, sheetIndex++);
      // Create Nilai sheet
      await generateNilai(sheets, spreadsheetId, assignment, currentKelasSiswa, {
        nilaiTugas: currentNilaiTugas,
        nilaiUjian: currentNilaiUjian,
      }, currentBab, currentTugasBab, currentUhKolom, sheetIndex++);
    }
    // Delete initial Sheet1 if multiple sheets were created
    if (sheetIndex > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{
                    deleteSheet: { sheetId: 0 } // Sheet1 usually has ID 0
                }]
            }
        });
    }
  }
  console.log('Backup process completed.');
}

// Helper to check if a Firestore error is an index error
function isFirestoreIndexError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (code === 'failed-precondition' && message.includes('index')) || message.includes('the query requires an index');
}


main().catch(console.error);
