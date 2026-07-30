const ExcelJS = require('exceljs');
const admin = require('firebase-admin');
const path = require('path');

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink';

const COLOR_HEADER_BG = { argb: 'FF1F4E79' };
const COLOR_HEADER_FONT = { argb: 'FFFFFFFF' };
const COLOR_TOTAL_BG = { argb: 'FFE6E6E6' };

function sanitizeSheetName(name) {
  return String(name || '').replace(/[[\]:?*\/\\]/g, '').slice(0, 100);
}

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isFirestoreIndexError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (code === 'failed-precondition' && message.includes('index')) || message.includes('the query requires an index');
}

async function uploadFileToDrive(fileName, buffer) {
  // Muat setelah Firebase Admin aktif agar helper memakai app yang sama.
  const {
    ensureBackupFolder,
    getAccessToken,
    recordUpload,
  } = require('../src/api/_lib/backup-config');

  const { accessToken, config } = await getAccessToken();
  const folderId = await ensureBackupFolder({ accessToken, config });
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const metadata = { name: fileName, mimeType, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([buffer], { type: mimeType }), fileName);

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const text = await response.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = {}; }
  if (!response.ok) {
    const detail = result?.error?.message || text || `HTTP ${response.status}`;
    throw new Error(`Upload Google Drive gagal: ${String(detail).slice(0, 300)}`);
  }
  if (!result.id) throw new Error('Google Drive tidak mengembalikan ID file backup.');

  await recordUpload({
    fileName: result.name || fileName,
    fileId: result.id,
    size: Number(result.size || buffer.length || 0),
    uploadedBy: 'backup-mingguan',
  });
  return {
    ...result,
    folderName: config.folderName,
  };
}

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
    { field: 'tahun_ajaran_id', operator: '==', value: period.year },
    { field: 'semester_id', operator: '==', value: period.semester },
  ];
  const pengajaranData = await getFirestoreData(db, 'pengajaran', filters);
  if (pengajaranData.length) return pengajaranData;

  console.log('No pengajaran data found, trying pembelajaran collection...');
  const pembelajaranData = await getFirestoreData(db, 'pembelajaran', filters);
  return pembelajaranData;
}

async function generateWorkbook(assignmentsByGuru, siswaDataMap, dataMap, period) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMSMANSARI Backup';
  workbook.created = new Date();

  for (const [guruId, assignments] of Object.entries(assignmentsByGuru)) {
    const guruName = assignments[0].guru_nama || `Guru-${guruId}`;
    const mapelName = assignments[0].mapel_nama || 'Mapel';
    const sheetName = sanitizeSheetName(`${guruName} (${mapelName})`);

    for (const assignment of assignments.sort((a, b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || '')))) {
      const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Unknown';
      const pengajaranId = assignment.id;

      const currentKelasSiswa = siswaDataMap[assignment.kelas_id] || [];
      const currentAbsensi = dataMap.allAbsensi[guruId]?.filter(a => a.pengajaran_id === pengajaranId) || [];
      const currentNilaiTugas = dataMap.allNilaiTugas[guruId]?.filter(n => n.pengajaran_id === pengajaranId) || [];
      const currentNilaiUjian = dataMap.allNilaiUjian[guruId]?.filter(n => n.pengajaran_id === pengajaranId) || [];
      const currentBab = dataMap.allBab[guruId]?.filter(b => b.pengajaran_id === pengajaranId) || [];
      const currentTugasBab = dataMap.allTugasBab[guruId]?.filter(t => t.pengajaran_id === pengajaranId) || [];
      const currentUhKolom = dataMap.allUhKolom[guruId]?.filter(uh => uh.pengajaran_id === pengajaranId) || [];

      await addRekapAbsensiSheet(workbook, assignment, currentKelasSiswa, currentAbsensi);
      await addAbsensiHarianSheet(workbook, assignment, currentKelasSiswa, currentAbsensi);
      await addNilaiSheet(workbook, assignment, currentKelasSiswa, {
        nilaiTugas: currentNilaiTugas,
        nilaiUjian: currentNilaiUjian,
      }, currentBab, currentTugasBab, currentUhKolom);
    }
  }

  return workbook;
}

async function addRekapAbsensiSheet(workbook, assignment, siswaList, absensiData) {
  const sheetTitle = sanitizeSheetName(`Rekap Absensi - ${assignment.kelas_nama || assignment.kelas_id} (${assignment.guru_id?.slice(0,8)})`);
  const newSheet = workbook.addWorksheet(sheetTitle);

  const rekapAbsen = {};
  absensiData.forEach(absen => {
    if (!rekapAbsen[absen.siswa_id]) {
      rekapAbsen[absen.siswa_id] = { nama: absen.siswa_nama, H: 0, S: 0, I: 0, A: 0, Total: 0 };
    }
    rekapAbsen[absen.siswa_id][absen.status]++;
    rekapAbsen[absen.siswa_id].Total++;
  });

  const headers = ['No', 'Nama Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total Pertemuan', '% Kehadiran'];
  newSheet.addRow(headers);

  let rowNum = 1;
  const sheetSiswa = siswaList.sort((a,b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  sheetSiswa.forEach(siswa => {
    const data = rekapAbsen[siswa.id] || { nama: siswa.nama, H: 0, S: 0, I: 0, A: 0, Total: 0 };
    const percentage = data.Total > 0 ? (data.H / data.Total) * 100 : 0;
    newSheet.addRow([rowNum++, data.nama, data.H, data.S, data.I, data.A, data.Total, `${percentage.toFixed(1)}%`]);
  });

  const totalHadir = Object.values(rekapAbsen).reduce((sum, r) => sum + r.H, 0);
  const totalSakit = Object.values(rekapAbsen).reduce((sum, r) => sum + r.S, 0);
  const totalIzin = Object.values(rekapAbsen).reduce((sum, r) => sum + r.I, 0);
  const totalAlpa = Object.values(rekapAbsen).reduce((sum, r) => sum + r.A, 0);
  const grandTotal = Object.values(rekapAbsen).reduce((sum, r) => sum + r.Total, 0);
  const grandPercentage = grandTotal > 0 ? (totalHadir / grandTotal) * 100 : 0;

  newSheet.addRow(['', 'Total Keseluruhan', totalHadir, totalSakit, totalIzin, totalAlpa, grandTotal, `${grandPercentage.toFixed(1)}%`]);

  formatAttendanceSheet(newSheet, headers, sheetSiswa.length + 1);
}

async function addAbsensiHarianSheet(workbook, assignment, siswaList, absensiData) {
  const sheetTitle = sanitizeSheetName(`Absensi Harian - ${assignment.kelas_nama || assignment.kelas_id} (${assignment.guru_id?.slice(0,8)})`);
  const newSheet = workbook.addWorksheet(sheetTitle);

  const dates = [...new Set(absensiData.map(a => a.tanggal))].sort();
  const dateHeaders = dates.map(d => formatDate(d));

  const headerRow = ['No', 'Nama Siswa', ...dateHeaders, 'H', 'S', 'I', 'A'];
  newSheet.addRow(headerRow);

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
    dates.forEach(date => {
      row.push(studentData[date] || '');
    });
    newSheet.addRow(row);
  });

  const totalFooterRow = ['Total Harian', ''];
  dates.forEach(date => {
    let H = 0, S = 0, I = 0, A = 0;
    absensiData.forEach(absen => {
      if (absen.tanggal === date) {
        if (absen.status === 'H') H++;
        else if (absen.status === 'S') S++;
        else if (absen.status === 'I') I++;
        else if (absen.status === 'A') A++;
      }
    });
    totalFooterRow.push(`${H}/${H+S+I+A}`);
  });
  totalFooterRow.push('', '', '', '');
  newSheet.addRow(totalFooterRow);

  formatAttendanceSheet(newSheet, headerRow, sheetSiswa.length + 1, dateHeaders.length);
}

function formatAttendanceSheet(sheet, headers, studentRowCount, dateCount = null) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (let i = 0; i < headers.length; i++) {
    const cell = sheet.getRow(1).getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
  }

  const totalRowIndex = studentRowCount + 1;
  const dateCountActual = dateCount !== null ? dateCount : headers.length - 5;
  for (let col = 1; col <= headers.length; col++) {
    const cell = sheet.getRow(totalRowIndex).getCell(col);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } };
    cell.alignment = { horizontal: 'center' };
  }

  for (let r = 2; r <= totalRowIndex - 1; r++) {
    for (let c = 3; c <= 2 + dateCountActual + 4; c++) {
      if (c <= headers.length) {
        sheet.getRow(r).getCell(c).alignment = { horizontal: 'center' };
      }
    }
  }

  sheet.columns.forEach(col => {
    let maxLength = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const length = cell.value ? String(cell.value).length : 0;
      maxLength = Math.max(maxLength, length);
    });
    col.width = Math.min(maxLength + 2, 30);
  });
}

async function addNilaiSheet(workbook, assignment, siswaList, nilaiData, babData, tugasData, uhKolomData) {
  const sheetTitle = sanitizeSheetName(`Nilai - ${assignment.kelas_nama || assignment.kelas_id} (${assignment.guru_id?.slice(0,8)})`);
  const sheet = workbook.addWorksheet(sheetTitle);

  const configRows = [
    ['KONFIGURASI BOBOT NILAI'],
    ['Bobot Tugas', 0.25, 'Bobot UH', 0.25, 'Bobot PTS', 0.25, 'Bobot PAS', 0.25],
  ];
  configRows.forEach(row => sheet.addRow(row));

  const babMap = {};
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

  const uhKolomMap = {};
  uhKolomData.forEach(uh => { uhKolomMap[uh.id] = uh.nama; });

  const mergedHeaders = [['No', 'Nama Siswa']];
  const secondLevelHeaders = [['', '']];

  let currentColumn = 2;
  let rerataTugasCol = 0;
  let rerataUHCol = 0;
  let ptsCol = 0;
  let pasCol = 0;
  let nilaiAkhirCol = 0;
  let gradeCol = 0;

  Object.values(babMap).forEach(bab => {
    if (bab.tugas.length === 0) {
      mergedHeaders[0].push(bab.nama);
      secondLevelHeaders[0].push('');
      currentColumn++;
    } else {
      mergedHeaders[0].push(bab.nama);
      for (let i = 1; i < bab.tugas.length; i++) { mergedHeaders[0].push(''); }
      bab.tugas.forEach(() => {
        secondLevelHeaders[0].push('');
        currentColumn++;
      });
    }
  });

  mergedHeaders[0].push('Rerata Tugas');
  secondLevelHeaders[0].push('');
  currentColumn++;
  rerataTugasCol = currentColumn;

  const uhHeaders = Object.values(uhKolomMap).sort().map(name => name);
  uhHeaders.forEach(uhName => {
    mergedHeaders[0].push('Ulangan Harian');
    secondLevelHeaders[0].push(uhName);
    currentColumn++;
  });

  mergedHeaders[0].push('Rerata UH');
  secondLevelHeaders[0].push('');
  currentColumn++;
  rerataUHCol = currentColumn;

  mergedHeaders[0].push('PTS');
  secondLevelHeaders[0].push('');
  currentColumn++;
  ptsCol = currentColumn;

  mergedHeaders[0].push('PAS');
  secondLevelHeaders[0].push('');
  currentColumn++;
  pasCol = currentColumn;

  mergedHeaders[0].push('Nilai Akhir');
  secondLevelHeaders[0].push('');
  currentColumn++;
  nilaiAkhirCol = currentColumn;

  mergedHeaders[0].push('Grade');
  secondLevelHeaders[0].push('');
  currentColumn++;
  gradeCol = currentColumn;

  const headerStartRow = configRows.length + 1;
  sheet.addRow(mergedHeaders[0]);
  sheet.addRow(secondLevelHeaders[0]);

  const nilaiMap = {};
  nilaiData.nilaiTugas.forEach(nt => {
    if (!nilaiMap[nt.siswa_id]) nilaiMap[nt.siswa_id] = {};
    if (!nilaiMap[nt.siswa_id][nt.bab_id]) nilaiMap[nt.siswa_id][nt.bab_id] = {};
    nilaiMap[nt.siswa_id][nt.bab_id][nt.tugas_id] = nt.nilai;
  });

  nilaiData.nilaiUjian.forEach(nu => {
    if (!nilaiMap[nu.siswa_id]) nilaiMap[nu.siswa_id] = {};
    if (nu.jenis_nilai === 'ulangan_harian') {
      nilaiMap[nu.siswa_id][nu.tipe] = nu.nilai;
    } else if (nu.jenis_nilai === 'pts') {
      nilaiMap[nu.siswa_id].pts = nu.nilai;
    } else if (nu.jenis_nilai === 'pas') {
      nilaiMap[nu.siswa_id].pas = nu.nilai;
    }
  });

  const sheetSiswa = siswaList.sort((a,b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  const dataStartRow = headerStartRow + 2;
  let studentRowNum = 1;

  sheetSiswa.forEach(siswa => {
    const rowNum = [studentRowNum++, siswa.nama];
    const studentNilai = nilaiMap[siswa.id] || {};

    let totalTugasScore = 0;
    let totalTugasCount = 0;
    const tugasScores = [];

    Object.values(babMap).forEach(bab => {
      if (bab.tugas.length === 0) {
        rowNum.push('');
      } else {
        bab.tugas.forEach(tugas => {
          const score = studentNilai[bab.id]?.[tugas.id] || '';
          rowNum.push(score);
          if (typeof score === 'number') {
            tugasScores.push(score);
            totalTugasScore += score;
            totalTugasCount++;
          }
        });
      }
    });

    rowNum.push(tugasScores.length > 0 ? Number((totalTugasScore / totalTugasCount).toFixed(1)) : '');

    let totalUHScore = 0;
    let totalUHCount = 0;

    uhHeaders.forEach(uhName => {
      const uhId = Object.keys(uhKolomMap).find(key => uhKolomMap[key] === uhName);
      const score = studentNilai[uhId] ?? '';
      rowNum.push(score);
      const numericScore = Number(score);
      if (score !== '' && Number.isFinite(numericScore)) {
        totalUHScore += numericScore;
        totalUHCount++;
      }
    });

    rowNum.push(totalUHCount > 0 ? Number((totalUHScore / totalUHCount).toFixed(1)) : '');
    rowNum.push(studentNilai.pts ?? '');
    rowNum.push(studentNilai.pas ?? '');

    const nilaiAkhirFormula = `=IFERROR((${columnToLetter(rerataTugasCol)}${dataStartRow + studentRowNum - 1}*B$2)+(${columnToLetter(rerataUHCol)}${dataStartRow + studentRowNum - 1}*D$2)+(${columnToLetter(ptsCol)}${dataStartRow + studentRowNum - 1}*F$2)+(${columnToLetter(pasCol)}${dataStartRow + studentRowNum - 1}*H$2),"-")`;
    const gradeFormula = `=IF(${columnToLetter(nilaiAkhirCol)}${dataStartRow + studentRowNum - 1}>=90,"A",IF(${columnToLetter(nilaiAkhirCol)}${dataStartRow + studentRowNum - 1}>=85,"A-",IF(${columnToLetter(nilaiAkhirCol)}${dataStartRow + studentRowNum - 1}>=80,"B+",IF(${columnToLetter(nilaiAkhirCol)}${dataStartRow + studentRowNum - 1}>=75,"B",IF(${columnToLetter(nilaiAkhirCol)}${dataStartRow + studentRowNum - 1}>=60,"C","D")))))`;

    rowNum.push(nilaiAkhirFormula);
    rowNum.push(gradeFormula);
    sheet.addRow(rowNum);
  });

  sheet.views = [{ state: 'frozen', ySplit: dataStartRow - 1, xSplit: 1 }];

  for (let i = 1; i <= currentColumn; i++) {
    const cell = sheet.getRow(headerStartRow).getCell(i);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
  }

  for (let i = 1; i <= currentColumn; i++) {
    const cell = sheet.getRow(headerStartRow + 1).getCell(i);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
  }

  sheet.columns.forEach(col => {
    let maxLength = 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const val = cell.value;
      const length = val ? String(val).length : 0;
      maxLength = Math.max(maxLength, length);
    });
    col.width = Math.min(maxLength + 2, 35);
  });
}

async function main() {
  try {
    console.log('=== Backup SIMSMANSARI Excel - Starting ===');
    console.log(`Time: ${new Date().toISOString()}`);

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.error('Error: FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set.');
      process.exit(1);
    }

    let sa;
    try {
      sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.error('Error: Failed to parse Service Account JSON. Check that the secret is valid JSON.');
      console.error(e.message);
      process.exit(1);
    }

    admin.initializeApp({ 
      credential: admin.credential.cert(sa),
      storageBucket: `${sa.project_id}.appspot.com`
    });
    const db = admin.firestore();

    const dateStr = new Date().toISOString().slice(0, 10);

    let period = {
      year: process.env.TAHUN_AJARAN_AKTIF || '2026_2027',
      semester: process.env.SEMESTER_AKTIF || '2026_2027_1',
    };
    console.log(`Fetching teaching assignments for ${period.year} / ${period.semester}...`);
    let pengajaranData;
    try {
      pengajaranData = await getActiveTeachingAssignments(db, period);
    } catch (e) {
      if (isFirestoreIndexError(e)) {
        console.error('Firestore index error — create composite indexes at:');
        console.error(`  https://console.firebase.google.com/project/${sa.project_id}/firestore/indexes`);
      }
      throw e;
    }

    if (pengajaranData.length === 0) {
      console.warn(`No assignments for ${period.year}/${period.semester}; checking all teaching assignments...`);
      pengajaranData = await getFirestoreData(db, 'pengajaran');
      if (!pengajaranData.length) {
        pengajaranData = await getFirestoreData(db, 'pembelajaran');
      }
      if (pengajaranData.length) {
        period = {
          year: pengajaranData[0].tahun_ajaran_id,
          semester: pengajaranData[0].semester_id,
        };
        console.log(`Using detected period ${period.year}/${period.semester}.`);
      }
    }

    console.log(`Found ${pengajaranData.length} teaching assignments.`);
    if (pengajaranData.length === 0) {
      throw new Error('Tidak ada data pengajaran/pembelajaran. Backup dihentikan.');
    }

    const assignmentsByGuru = groupBy(pengajaranData, 'guru_id');
    console.log(`Processing ${Object.keys(assignmentsByGuru).length} teachers...`);

    const classIds = [...new Set(pengajaranData.map(a => a.kelas_id))];
    const siswaDataMap = {};
    for (const classId of classIds) {
      const studentsInClass = await getFirestoreData(db, 'users', [
        { field: 'role', operator: '==', value: 'siswa' },
        { field: 'kelas_id', operator: '==', value: classId },
      ]);
      siswaDataMap[classId] = studentsInClass;
    }

    const guruIds = Object.keys(assignmentsByGuru);

    // Fetch per collection, grouped by guru
    const allAbsensi = await Promise.all(guruIds.map(guruId => 
      getFirestoreData(db, 'absensi', [
        { field: 'guru_id', operator: '==', value: guruId },
        { field: 'tahun_ajaran_id', operator: '==', value: period.year },
        { field: 'semester_id', operator: '==', value: period.semester },
      ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on absensi collection.`); } return []; })
    ));

    const allNilaiTugas = await Promise.all(guruIds.map(guruId => 
      getFirestoreData(db, 'nilai_tugas', [
        { field: 'guru_id', operator: '==', value: guruId },
        { field: 'tahun_ajaran_id', operator: '==', value: period.year },
        { field: 'semester_id', operator: '==', value: period.semester },
      ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on nilai_tugas collection.`); } return []; })
    ));

    const allNilaiUjian = await Promise.all(guruIds.map(guruId => 
      getFirestoreData(db, 'nilai_ujian', [
        { field: 'guru_id', operator: '==', value: guruId },
        { field: 'tahun_ajaran_id', operator: '==', value: period.year },
        { field: 'semester_id', operator: '==', value: period.semester },
      ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on nilai_ujian collection.`); } return []; })
    ));

    const allBab = await Promise.all(guruIds.map(guruId => 
      getFirestoreData(db, 'bab', [
        { field: 'guru_id', operator: '==', value: guruId },
        { field: 'tahun_ajaran_id', operator: '==', value: period.year },
        { field: 'semester_id', operator: '==', value: period.semester },
      ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on bab collection.`); } return []; })
    ));

    const allTugasBab = await Promise.all(guruIds.map(guruId => 
      getFirestoreData(db, 'tugas_bab', [
        { field: 'guru_id', operator: '==', value: guruId },
        { field: 'tahun_ajaran_id', operator: '==', value: period.year },
        { field: 'semester_id', operator: '==', value: period.semester },
      ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on tugas_bab collection.`); } return []; })
    ));

    const allUhKolom = await Promise.all(guruIds.map(guruId => 
      getFirestoreData(db, 'ulangan_harian_kolom', [
        { field: 'guru_id', operator: '==', value: guruId },
        { field: 'tahun_ajaran_id', operator: '==', value: period.year },
        { field: 'semester_id', operator: '==', value: period.semester },
      ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on ulangan_harian_kolom collection.`); } return []; })
    ));

    const dataMap = {
      allAbsensi: Object.fromEntries(guruIds.map((id, i) => [id, allAbsensi[i]])),
      allNilaiTugas: Object.fromEntries(guruIds.map((id, i) => [id, allNilaiTugas[i]])),
      allNilaiUjian: Object.fromEntries(guruIds.map((id, i) => [id, allNilaiUjian[i]])),
      allBab: Object.fromEntries(guruIds.map((id, i) => [id, allBab[i]])),
      allTugasBab: Object.fromEntries(guruIds.map((id, i) => [id, allTugasBab[i]])),
      allUhKolom: Object.fromEntries(guruIds.map((id, i) => [id, allUhKolom[i]])),
    };

    const workbook = await generateWorkbook(assignmentsByGuru, siswaDataMap, dataMap, period);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const fs = require('fs');
    const fileName = `Laporan-SIMSMANSARI-${dateStr}.xlsx`;
    const outputPath = path.join(process.cwd(), fileName);
    fs.writeFileSync(outputPath, buffer);

    console.log('Uploading backup to Google Drive...');
    const driveResult = await uploadFileToDrive(fileName, buffer);

    console.log(`\n=== Backup process completed successfully ===`);
    console.log(`Backup file: ${outputPath}`);
    console.log(`Size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
    console.log(`Google Drive folder: ${driveResult.folderName || '-'}`);
    console.log(`Google Drive file ID: ${driveResult.id}`);
    if (driveResult.webViewLink) console.log(`Google Drive link: ${driveResult.webViewLink}`);
  } catch (error) {
    console.error('\n=== Backup FAILED ===');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    process.exit(1);
  }
}

main();
