const { google } = require('googleapis');
const admin = require('firebase-admin');
const path = require('path');

const DRIVE_API_OPTIONS = {
  supportsAllDrives: true,
};

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
    { field: 'tahun_ajaran_id', operator: '==', value: period.year },
    { field: 'semester_id', operator: '==', value: period.semester },
  ];
  const pengajaranData = await getFirestoreData(db, 'pengajaran', filters);
  if (pengajaranData.length) return pengajaranData;

  // Fallback to pembelajaran if no pengajaran found
  console.log('No pengajaran data found, trying pembelajaran collection...');
  const pembelajaranData = await getFirestoreData(db, 'pembelajaran', filters);
  return pembelajaranData;
}

// --- Google Drive & Sheets API Functions ---

async function getServiceAccountAuth(sa) {
  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive', // Full Drive access so shared folders are visible
    ],
  });
  return auth.getClient();
}

async function ensureBackupFolder(drive, folderName, parentId = null) {
  let q = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }
  const res = await drive.files.list({
    ...DRIVE_API_OPTIONS,
    includeItemsFromAllDrives: true,
    q,
    fields: 'files(id,name,parents,mimeType)',
  });
  if (res.data.files.length) {
    console.log(`  Folder found: ${folderName} (${res.data.files[0].id})`);
    return res.data.files[0];
  }
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : [],
  };
  console.log(`  Creating folder: ${folderName}`);
  const folder = await drive.files.create({
    ...DRIVE_API_OPTIONS,
    resource: fileMetadata,
    fields: 'id,name,parents,mimeType',
  });
  return folder.data;
}

// Check and report Drive quota
async function checkDriveQuota(drive) {
  const about = await drive.about.get({ fields: 'storageQuota' });
  const quota = about.data.storageQuota;
  const used = parseInt(quota.usageInDrive || quota.usage || 0, 10);
  const limit = parseInt(quota.limit || 0, 10);
  const free = limit - used;
  console.log(`Drive quota: ${(used / 1073741824).toFixed(2)}GB used / ${(limit / 1073741824).toFixed(2)}GB total (${(free / 1073741824).toFixed(2)}GB free)`);
  return { used, limit, free };
}

// Delete backup folders older than N days and empty trash to free quota
async function cleanupOldBackups(drive, rootFolderId, keepDays = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  console.log(`Cleaning up backup folders older than ${keepDays} days (before ${cutoffStr})...`);

  // List old folders in the root backup folder
  const res = await drive.files.list({
    ...DRIVE_API_OPTIONS,
    q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and createdTime < '${cutoffStr}T00:00:00'`,
    fields: 'files(id,name,createdTime)',
  });

  if (res.data.files.length) {
    let deleted = 0;
    for (const folder of res.data.files) {
      try {
        await drive.files.delete({ ...DRIVE_API_OPTIONS, fileId: folder.id });
        console.log(`  Deleted: ${folder.name} from ${folder.createdTime}`);
        deleted++;
      } catch (e) {
        console.warn(`  Failed to delete ${folder.name}: ${e.message}`);
      }
    }
    console.log(`  Deleted ${deleted} old backup folder(s).`);
  } else {
    console.log('  No old backups to clean up.');
  }

  // Empty trash to actually free the quota
  console.log('  Emptying Drive trash to free quota...');
  try {
    await drive.files.emptyTrash();
    console.log('  Trash emptied.');
  } catch (e) {
    console.warn(`  Could not empty trash: ${e.message}`);
  }
}

async function createSpreadsheet(sheets, drive, parentFolderId, guruId, guruName, dateStr) {
  const spreadsheetTitle = `Laporan - ${guruName} - ${dateStr}`;
  const fileMetadata = {
    name: spreadsheetTitle,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: parentFolderId ? [parentFolderId] : undefined,
  };
  const file = await drive.files.create({
    ...DRIVE_API_OPTIONS,
    resource: fileMetadata,
    fields: 'id,name,parents,mimeType,webViewLink',
  });
  const fileId = file.data.id;
  console.log(`DEBUG: Spreadsheet created with ID: ${fileId}`);
  console.log(`Created spreadsheet for ${guruName}: https://docs.google.com/spreadsheets/d/${fileId}/edit`);

  const verifiedFile = await drive.files.get({
    ...DRIVE_API_OPTIONS,
    fileId,
    fields: 'id,name,parents,mimeType,webViewLink',
  });
  if (verifiedFile.data.mimeType !== 'application/vnd.google-apps.spreadsheet') {
    throw new Error(`File backup ${fileId} bukan Google Spreadsheet.`);
  }

  // Older Drive implementations may ignore parents during creation, so verify it.
  if (parentFolderId && !verifiedFile.data.parents?.includes(parentFolderId)) {
    await drive.files.update({
      ...DRIVE_API_OPTIONS,
      fileId,
      addParents: parentFolderId,
      fields: 'id,parents',
    });
  }

  // Transfer ownership to user's email so storage counts against their quota
  if (process.env.BACKUP_SHARE_EMAIL) {
    try {
      await drive.permissions.create({
        ...DRIVE_API_OPTIONS,
        fileId,
        requestBody: {
          type: 'user',
          role: 'owner',
          emailAddress: process.env.BACKUP_SHARE_EMAIL,
        },
        transferOwnership: true,
      });
      console.log(`  Transferred ownership to ${process.env.BACKUP_SHARE_EMAIL}`);
    } catch (e) {
      console.warn(`  Could not transfer ownership: ${e.message}`);
    }
  }

  return fileId;
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
  const response = await sheets.spreadsheets.batchUpdate(request);
  return response.data.replies?.[0]?.addSheet?.properties?.sheetId;
}

async function formatSheet(sheets, spreadsheetId, sheetId, columnCount, rowCount, frozenRows = 1) {
  if (sheetId == null || columnCount < 1 || rowCount < 1) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: frozenRows } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: Math.min(frozenRows, rowCount), startColumnIndex: 0, endColumnIndex: columnCount },
            cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.28, blue: 0.45 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' } },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: columnCount },
          },
        },
      ],
    },
  });
}

// --- Data Processing & Sheet Generation ---

async function generateRekapAbsensi(sheets, spreadsheetId, assignment, siswaList, absensiData, sheetIndex) {
  const sheetTitle = sanitizeSheetName(`Rekap Absensi - ${assignment.kelas_nama || assignment.kelas_id}`);
  const sheetId = await createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex);
  const rekapAbsen = {};
  console.log(`DEBUG: generateRekapAbsensi for assignment ${assignment.id}, siswaList size ${siswaList.length}, absensiData size ${absensiData.length}`);
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
  await formatSheet(sheets, spreadsheetId, sheetId, values[0].length, values.length);
  return sheetTitle;
}

async function generateAbsensiHarian(sheets, spreadsheetId, assignment, siswaList, absensiData, sheetIndex) {
  const sheetTitle = sanitizeSheetName(`Absensi Harian - ${assignment.kelas_nama || assignment.kelas_id}`);
  const sheetId = await createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex);
  console.log(`DEBUG: generateAbsensiHarian for assignment ${assignment.id}, siswaList size ${siswaList.length}, absensiData size ${absensiData.length}`);

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
  await formatSheet(sheets, spreadsheetId, sheetId, values[0].length, values.length);
  return sheetTitle;
}

async function generateNilai(sheets, spreadsheetId, assignment, siswaList, nilaiData, babData, tugasData, uhKolomData, sheetIndex) {
  const sheetTitle = sanitizeSheetName(`Nilai - ${assignment.kelas_nama || assignment.kelas_id}`);
  const sheetId = await createSheet(sheets, spreadsheetId, sheetTitle, sheetIndex);
  console.log(`DEBUG: generateNilai for assignment ${assignment.id}, siswaList size ${siswaList.length}, nilaiTugas size ${nilaiData.nilaiTugas.length}, nilaiUjian size ${nilaiData.nilaiUjian.length}`);

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
  let taskColumnCount = 0;

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
        taskColumnCount++;
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
    row.push(tugasScores.length > 0 ? Number((totalTugasScore / totalTugasCount).toFixed(1)) : '-');


    let totalUHScore = 0;
    let totalUHCount = 0;

    // UH Scores
    uhHeaders.forEach(uhName => {
      const uhId = Object.keys(uhKolomMap).find(key => uhKolomMap[key] === uhName);
      const score = studentNilai[uhId] ?? '-';
      row.push(score);
      const numericScore = Number(score);
      if (score !== '-' && Number.isFinite(numericScore)) {
        totalUHScore += numericScore;
        totalUHCount++;
      }
    });

    // Rerata UH Formula
    row.push(totalUHCount > 0 ? Number((totalUHScore / totalUHCount).toFixed(1)) : '-');

    // PTS, PAS
    row.push(studentNilai.pts ?? '-');
    row.push(studentNilai.pas ?? '-');

    // Nilai Akhir Formula (references config cells A2,C2,E2,G2 etc, and other cells in this row)
    const rerataTugasColLetter = columnToLetter(taskColumnCount + 3);
    const rerataUHColLetter = columnToLetter(taskColumnCount + uhHeaders.length + 4);
    const ptsColLetter = columnToLetter(taskColumnCount + uhHeaders.length + 5);
    const pasColLetter = columnToLetter(taskColumnCount + uhHeaders.length + 6);

    const nilaiAkhirFormula = `=IFERROR((${rerataTugasColLetter}${dataStartRow + studentRowNum -1}*B$2)+(${rerataUHColLetter}${dataStartRow + studentRowNum -1}*D$2)+(${ptsColLetter}${dataStartRow + studentRowNum -1}*F$2)+(${pasColLetter}${dataStartRow + studentRowNum -1}*H$2),"-")`;
    row.push(nilaiAkhirFormula);

    // Grade Formula
    const nilaiAkhirColLetter = columnToLetter(taskColumnCount + uhHeaders.length + 7);
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
    resource: { requests: requests.concat([
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: dataStartRow - 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: headerStartRow - 1, endRowIndex: dataStartRow - 1, startColumnIndex: 0, endColumnIndex: currentColumn + 6 + uhHeaders.length },
          cell: { userEnteredFormat: { backgroundColor: { red: 0.12, green: 0.28, blue: 0.45 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)',
        },
      },
      {
        autoResizeDimensions: {
          dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: currentColumn + 7 + uhHeaders.length },
        },
      },
    ]) },
  });

  return sheetTitle;
}

// --- Main Backup Function ---

async function main() {
  try {
    console.log('=== Backup SIMSMANSARI - Starting ===');
    console.log(`Time: ${new Date().toISOString()}`);

    if (!process.env.GOOGLE_SA_KEY && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.error('Error: GOOGLE_SA_KEY or FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set.');
      process.exit(1);
    }

    const saJson = process.env.GOOGLE_SA_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let sa;
    try {
      sa = JSON.parse(saJson);
    } catch (e) {
      console.error('Error: Failed to parse Service Account JSON. Check that the secret is valid JSON.');
      console.error(e.message);
      process.exit(1);
    }

    admin.initializeApp({ credential: admin.credential.cert(sa) });
    const db = admin.firestore();

    console.log('Authenticating to Google APIs...');
    const auth = await getServiceAccountAuth(sa);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    console.log('Authentication successful.');

    const dateStr = new Date().toISOString().slice(0, 10);
    const rootFolderName = 'Backup SIMSMANSARI';

    // Use BACKUP_FOLDER_ID if provided to place backup in a specific folder
    let rootFolder;
    if (process.env.BACKUP_FOLDER_ID) {
      console.log(`Using specified BACKUP_FOLDER_ID: ${process.env.BACKUP_FOLDER_ID}`);
      try {
        const folderRes = await drive.files.get({
          ...DRIVE_API_OPTIONS,
          fileId: process.env.BACKUP_FOLDER_ID,
          fields: 'id,name,mimeType,parents',
        });
        if (folderRes.data.mimeType !== 'application/vnd.google-apps.folder') {
          throw new Error('BACKUP_FOLDER_ID bukan folder Google Drive.');
        }
        console.log(`  Parent folder: "${folderRes.data.name}" (${folderRes.data.id})`);
        rootFolder = folderRes.data;
      } catch (e) {
        throw new Error(
          `BACKUP_FOLDER_ID "${process.env.BACKUP_FOLDER_ID}" tidak dapat diakses oleh service account. ` +
          `Bagikan folder tersebut ke email client_email pada service-account JSON. Detail: ${e.message}`
        );
      }
    } else {
      // Find or create root folder in the service account's Drive
      rootFolder = await ensureBackupFolder(drive, rootFolderName);
    }

    // Check Drive quota
    await checkDriveQuota(drive);

    // Clean up old backups (older than 14 days) and empty trash to free quota
    await cleanupOldBackups(drive, rootFolder.id, 14);

    // Check quota again after cleanup
    await checkDriveQuota(drive);

    // Find or create the daily folder inside the root folder
    const dateFolderName = `Laporan SIMSMANSARI - ${dateStr}`;
    const dateFolder = await ensureBackupFolder(drive, dateFolderName, rootFolder.id);
    console.log(`Backup folder: ${dateFolderName} (${dateFolder.id})`);

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

    // A wrong period setting previously produced an empty folder and a successful run.
    // Fall back to the available teaching period so the backup contains real data.
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
      throw new Error('Tidak ada data pengajaran/pembelajaran. Backup dihentikan agar tidak menghasilkan folder kosong.');
    }

    const assignmentsByGuru = groupBy(pengajaranData, 'guru_id');
    let guruCount = 0;
    let createdSpreadsheetCount = 0;
    const totalGurus = Object.keys(assignmentsByGuru).length;
    console.log(`Processing ${totalGurus} teachers...`);

    for (const guruId of Object.keys(assignmentsByGuru)) {
      guruCount++;
      const assignments = assignmentsByGuru[guruId];
      const guruName = assignments[0].guru_nama || `Guru-${guruId}`;
      const mapelName = assignments[0].mapel_nama || 'Mapel';

      console.log(`\n[${guruCount}/${totalGurus}] Processing: ${guruName} (${mapelName})`);

      const spreadsheetTitle = `${String(guruCount).padStart(2, '0')} - ${guruName} (${mapelName})`;
      let spreadsheetId;
      try {
        spreadsheetId = await createSpreadsheet(sheets, drive, dateFolder.id, guruId, guruName, spreadsheetTitle);
        createdSpreadsheetCount++;
      } catch (e) {
        console.error(`  Failed to create spreadsheet for ${guruName}: ${e.message}`);
        continue; // Skip this guru, continue with next
      }

      // Get all students for this guru's classes
      console.log(`  Fetching students...`);
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
      console.log(`  Found ${siswaList.length} students across ${classIds.length} classes.`);

      // Fetch all data for this guru in parallel
      console.log(`  Fetching attendance and grade data...`);
      const [allAbsensi, allNilaiTugas, allNilaiUjian, allBab, allTugasBab, allUhKolom] = await Promise.all([
        getFirestoreData(db, 'absensi', [
          { field: 'guru_id', operator: '==', value: guruId },
          { field: 'tahun_ajaran_id', operator: '==', value: period.year },
          { field: 'semester_id', operator: '==', value: period.semester },
        ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on absensi collection.`); } throw e; }),
        getFirestoreData(db, 'nilai_tugas', [
          { field: 'guru_id', operator: '==', value: guruId },
          { field: 'tahun_ajaran_id', operator: '==', value: period.year },
          { field: 'semester_id', operator: '==', value: period.semester },
        ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on nilai_tugas collection.`); } throw e; }),
        getFirestoreData(db, 'nilai_ujian', [
          { field: 'guru_id', operator: '==', value: guruId },
          { field: 'tahun_ajaran_id', operator: '==', value: period.year },
          { field: 'semester_id', operator: '==', value: period.semester },
        ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on nilai_ujian collection.`); } throw e; }),
        getFirestoreData(db, 'bab', [
          { field: 'guru_id', operator: '==', value: guruId },
          { field: 'tahun_ajaran_id', operator: '==', value: period.year },
          { field: 'semester_id', operator: '==', value: period.semester },
        ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on bab collection.`); } throw e; }),
        getFirestoreData(db, 'tugas_bab', [
          { field: 'guru_id', operator: '==', value: guruId },
          { field: 'tahun_ajaran_id', operator: '==', value: period.year },
          { field: 'semester_id', operator: '==', value: period.semester },
        ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on tugas_bab collection.`); } throw e; }),
        getFirestoreData(db, 'ulangan_harian_kolom', [
          { field: 'guru_id', operator: '==', value: guruId },
          { field: 'tahun_ajaran_id', operator: '==', value: period.year },
          { field: 'semester_id', operator: '==', value: period.semester },
        ]).catch(e => { if (isFirestoreIndexError(e)) { console.error(`  Firestore index error on ulangan_harian_kolom collection.`); } throw e; }),
      ]);
      console.log(`DEBUG: Fetched data for guru ${guruName}:`);
      console.log(`  allAbsensi: ${allAbsensi.length} records`);
      console.log(`  allNilaiTugas: ${allNilaiTugas.length} records`);
      console.log(`  allNilaiUjian: ${allNilaiUjian.length} records`);
      console.log(`  allBab: ${allBab.length} records`);
      console.log(`  allTugasBab: ${allTugasBab.length} records`);

      let sheetIndex = 0;
      for (const assignment of assignments.sort((a,b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || '')))) {
        const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Unknown';
        const pengajaranId = assignment.id;

        console.log(`    Creating sheets for class: ${kelasNama}`);

        const currentKelasSiswa = siswaList.filter(s => s.kelas_id === assignment.kelas_id);
        const currentAbsensi = allAbsensi.filter(a => a.pengajaran_id === pengajaranId);
        const currentNilaiTugas = allNilaiTugas.filter(n => n.pengajaran_id === pengajaranId);
        const currentNilaiUjian = allNilaiUjian.filter(n => n.pengajaran_id === pengajaranId);
        const currentBab = allBab.filter(b => b.pengajaran_id === pengajaranId);
        const currentTugasBab = allTugasBab.filter(t => t.pengajaran_id === pengajaranId);
        const currentUhKolom = allUhKolom.filter(uh => uh.pengajaran_id === pengajaranId);

        try {
          // Create Rekap Absensi sheet
          await generateRekapAbsensi(sheets, spreadsheetId, assignment, currentKelasSiswa, currentAbsensi, sheetIndex++);
          // Create Absensi Harian sheet
          await generateAbsensiHarian(sheets, spreadsheetId, assignment, currentKelasSiswa, currentAbsensi, sheetIndex++);
          // Create Nilai sheet
          await generateNilai(sheets, spreadsheetId, assignment, currentKelasSiswa, {
            nilaiTugas: currentNilaiTugas,
            nilaiUjian: currentNilaiUjian,
          }, currentBab, currentTugasBab, currentUhKolom, sheetIndex++);
          console.log(`    ✓ Sheets created for ${kelasNama}`);
        } catch (e) {
          console.error(`    ✗ Failed to create sheets for ${kelasNama}: ${e.message}`);
        }
      }
      // Delete initial Sheet1 if multiple sheets were created
      if (sheetIndex > 0) {
        try {
          const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets(properties(sheetId,title))',
          });
          const initialSheet = spreadsheet.data.sheets?.find(sheet => sheet.properties?.title === 'Sheet1');
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
              requests: initialSheet ? [{
                deleteSheet: { sheetId: initialSheet.properties.sheetId }
              }] : []
            }
          });
        } catch (e) {
          // Ignore error deleting Sheet1
        }
      }
      console.log(`  ✓ ${guruName} backup complete.`);
    }

    if (createdSpreadsheetCount === 0) {
      throw new Error('Tidak ada spreadsheet laporan yang berhasil dibuat. Periksa akses Google Drive/Sheets dan konfigurasi periode.');
    }

    const backupFiles = await drive.files.list({
      ...DRIVE_API_OPTIONS,
      includeItemsFromAllDrives: true,
      q: `'${dateFolder.id}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,webViewLink)',
      orderBy: 'name',
    });
    console.log(`\nFiles in backup folder (${backupFiles.data.files.length}):`);
    backupFiles.data.files.forEach(file => {
      const url = file.mimeType === 'application/vnd.google-apps.spreadsheet'
        ? `https://docs.google.com/spreadsheets/d/${file.id}/edit`
        : `https://drive.google.com/open?id=${file.id}`;
      console.log(`  - ${file.name}: ${url}`);
    });

    // Share backup folder with user if email is provided
    if (process.env.BACKUP_SHARE_EMAIL) {
      try {
        console.log(`\nSharing backup folder with ${process.env.BACKUP_SHARE_EMAIL}...`);
        await drive.permissions.create({
          fileId: dateFolder.id,
          requestBody: {
            type: 'user',
            role: 'reader',
            emailAddress: process.env.BACKUP_SHARE_EMAIL,
          },
          sendNotificationEmail: true,
        });
        console.log(`  ✓ Shared successfully. Check your email for notification.`);
      } catch (e) {
        console.warn(`  Warning: Could not share folder: ${e.message}`);
        console.warn(`  Manually share folder URL with your email:`);
        console.warn(`  https://drive.google.com/drive/folders/${dateFolder.id}`);
      }
    }

    console.log('\n=== Backup process completed successfully ===');
    console.log(`\n📁 Backup folder URL:`);
    console.log(`https://drive.google.com/drive/folders/${rootFolder.id}`);
    console.log(`https://drive.google.com/drive/folders/${dateFolder.id}`);
  } catch (error) {
    console.error('\n=== Backup FAILED ===');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    process.exit(1);
  }
}

// Helper to check if a Firestore error is an index error
function isFirestoreIndexError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (code === 'failed-precondition' && message.includes('index')) || message.includes('the query requires an index');
}

main();
