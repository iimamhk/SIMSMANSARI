/**
 * build-teacher-excel.js — bangun satu berkas Excel per guru dari data snapshot.
 *
 * NOL OPERASI BACA TAMBAHAN
 * -------------------------
 * Berkas ini tidak menyentuh Firestore sama sekali. Seluruh data diterima dari
 * scripts/backup-snapshot.js, yang sudah membacanya untuk membuat snapshot JSON.
 * Jadi Excel mingguan untuk semua guru praktis gratis dalam hitungan kuota:
 *
 *   Baca Firestore  ->  data di memori  ->  JSON (.json.gz)      <- snapshot
 *                                       ->  Excel per guru       <- berkas ini
 *
 * SATU SUMBER TAMPILAN
 * --------------------
 * Sheet dibangun oleh src/utils/excel-sheets.js, modul yang sama yang dipakai
 * halaman Backup guru di peramban. Karena itu berkas yang dibuat otomatis di
 * server dan berkas yang diunduh guru sendiri punya bentuk, rumus, dan sheet
 * Petunjuk yang persis sama. Sebelumnya ada dua pembangun terpisah dan versi
 * server tertinggal: nama sheet melewati batas 31 karakter Excel, angkanya mati
 * tanpa rumus, dan tidak ada sheet Petunjuk.
 */

const path = require('path');
const { pathToFileURL } = require('url');

/** Muat modul ESM excel-sheets.js dari CommonJS. */
async function loadSheetBuilders() {
  const target = path.join(__dirname, '..', 'src', 'utils', 'excel-sheets.js');
  return import(pathToFileURL(target).href);
}

/** Nama berkas yang aman untuk sistem berkas dan Google Drive. */
function safeFileName(value) {
  return String(value || 'Guru')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Guru';
}

/**
 * Kelompokkan pengajaran per guru, lalu urutkan agar keluarannya dapat diprediksi.
 * `guru_id` pada koleksi pengajaran berisi username guru.
 */
function groupByTeacher(pengajaranDocs) {
  const map = new Map();
  for (const doc of pengajaranDocs) {
    const d = doc.data || {};
    const guruId = String(d.guru_id || '').trim();
    if (!guruId) continue;
    if (!map.has(guruId)) {
      map.set(guruId, { guruId, guruNama: String(d.guru_nama || guruId), assignments: [] });
    }
    const entry = map.get(guruId);
    if (!entry.guruNama && d.guru_nama) entry.guruNama = String(d.guru_nama);
    entry.assignments.push({
      id: doc.id,
      kelas_id: String(d.kelas_id || ''),
      kelas_nama: String(d.kelas_nama || d.kelas_id || ''),
      mapel_id: String(d.mapel_id || ''),
      mapel_nama: String(d.mapel_nama || ''),
      guru_id: guruId,
      guru_nama: String(d.guru_nama || guruId),
    });
  }
  for (const entry of map.values()) {
    entry.assignments.sort((a, b) => (
      a.kelas_nama.localeCompare(b.kelas_nama, 'id') || a.mapel_nama.localeCompare(b.mapel_nama, 'id')
    ));
  }
  return [...map.values()].sort((a, b) => a.guruNama.localeCompare(b.guruNama, 'id'));
}

/** Susun indeks dokumen berdasarkan pengajaran_id agar pencarian tidak O(n^2). */
function indexByPengajaran(docs) {
  const index = new Map();
  for (const doc of docs) {
    const pid = String(doc.data?.pengajaran_id || '');
    if (!pid) continue;
    if (!index.has(pid)) index.set(pid, []);
    index.get(pid).push({ id: doc.id, ...doc.data });
  }
  return index;
}

/** Anggota kelas per kelas_id, hanya yang berstatus aktif. */
function indexMembersByClass(docs) {
  const index = new Map();
  for (const doc of docs) {
    const d = doc.data || {};
    if (d.status && d.status !== 'active') continue;
    const kelasId = String(d.kelas_id || '');
    if (!kelasId) continue;
    if (!index.has(kelasId)) index.set(kelasId, []);
    index.get(kelasId).push({
      siswa_id: String(d.siswa_id || ''),
      siswa_nama: String(d.siswa_nama || '-'),
      nomor_absen: Number(d.nomor_absen || 0),
    });
  }
  return index;
}

/**
 * Bangun satu workbook Excel per guru.
 *
 * @param {object} options
 * @param {object} options.collections Isi snapshot: { namaKoleksi: [{id, data}] }
 * @param {object} options.context Periode aktif { tahun_ajaran_aktif, ... }
 * @param {function} [options.log] Penulis log.
 * @returns {Promise<Array<{guruId, guruNama, fileName, buffer, assignments, sheets}>>}
 */
async function buildTeacherWorkbooks({ collections, context, log = () => {} }) {
  const ExcelJS = require('exceljs');
  const S = await loadSheetBuilders();

  const get = (name) => (Array.isArray(collections[name]) ? collections[name] : []);

  const teachers = groupByTeacher(get('pengajaran'));
  if (!teachers.length) {
    log('  ! Tidak ada dokumen pengajaran, Excel per guru dilewati.');
    return [];
  }

  const membersByClass = indexMembersByClass(get('anggota_kelas'));
  const absensiIdx = indexByPengajaran(get('absensi'));
  const nilaiTugasIdx = indexByPengajaran(get('nilai_tugas'));
  const nilaiUjianIdx = indexByPengajaran(get('nilai_ujian'));
  const babIdx = indexByPengajaran(get('bab'));
  const tugasIdx = indexByPengajaran(get('tugas_bab'));
  const uhIdx = indexByPengajaran(get('ulangan_harian_kolom'));
  const keaktifanIdx = indexByPengajaran(get('keaktifan_siswa'));

  const hasil = [];
  const stamp = new Date().toISOString().slice(0, 10);

  for (const teacher of teachers) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SIM SMANSARI Backup Otomatis';
    workbook.lastModifiedBy = teacher.guruNama;
    workbook.created = new Date();
    workbook.modified = new Date();

    S.addGuideSheet(workbook, {
      userName: teacher.guruNama,
      context,
      scope: `Cadangan otomatis mingguan: ${teacher.assignments.length} pengajaran (kelas x mata pelajaran) yang diampu.`,
    });

    for (const assignment of teacher.assignments) {
      const pid = assignment.id;
      const members = membersByClass.get(assignment.kelas_id) || [];
      const absensi = absensiIdx.get(pid) || [];

      const data = S.normalizeAssignmentData({
        babDocs: babIdx.get(pid) || [],
        tugasDocs: tugasIdx.get(pid) || [],
        uhKolomDocs: uhIdx.get(pid) || [],
        nilaiTugasDocs: nilaiTugasIdx.get(pid) || [],
        nilaiUjianDocs: nilaiUjianIdx.get(pid) || [],
      });

      S.buildRekapAbsensiSheet(workbook, assignment, members, absensi, context, teacher.guruNama);
      S.buildAbsensiHarianSheet(workbook, assignment, members, absensi, context, teacher.guruNama);
      S.buildRekapNilaiSheet(workbook, assignment, members, data, context, teacher.guruNama);
      S.buildKeaktifanSheet(workbook, assignment, members, keaktifanIdx.get(pid) || [], context, teacher.guruNama);
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `Backup-${safeFileName(teacher.guruNama)}-${stamp}.xlsx`;
    hasil.push({
      guruId: teacher.guruId,
      guruNama: teacher.guruNama,
      fileName,
      buffer,
      assignments: teacher.assignments.length,
      sheets: workbook.worksheets.length,
    });
    log(`  ${teacher.guruNama.padEnd(28)} ${String(teacher.assignments.length).padStart(2)} pengajaran, ${String(workbook.worksheets.length).padStart(2)} sheet, ${(buffer.length / 1024).toFixed(0)} KB`);
  }

  return hasil;
}

module.exports = { buildTeacherWorkbooks, groupByTeacher, safeFileName };
