/**
 * backup-snapshot.js — cadangan otomatis hasil kerja guru dalam format JSON.
 *
 * CAKUPAN
 * -------
 * Hanya data hasil kerja guru: ABSENSI, NILAI, dan KEAKTIFAN SISWA. Data lain
 * (kuis, permainan, percakapan, materi ajar, keuangan, tampilan lobi) tidak
 * dicadangkan. Koleksi `users` dan `settings` juga tidak, karena keduanya memuat
 * kredensial; nama siswa dan guru sudah tersedia di `anggota_kelas` dan
 * `pengajaran`.
 *
 * Cadangan ini adalah tanggung jawab ADMIN dan berjalan otomatis tanpa campur
 * tangan siapa pun. Guru tetap punya tanggung jawab terpisah: mengekspor data
 * miliknya sendiri ke Excel satu kali per minggu dari halaman Backup, karena
 * berkas Excel itulah yang dapat langsung dipakai bekerja bila aplikasi tidak
 * dapat diakses. Keduanya saling melengkapi, bukan menggantikan:
 *
 *   Snapshot JSON (admin, otomatis)  -> untuk MEMULIHKAN sistem
 *   Excel (guru, mingguan)           -> untuk MELANJUTKAN pekerjaan
 *
 * MENGAPA DIJALANKAN DI GITHUB ACTIONS, BUKAN DI PERAMBAN
 * -------------------------------------------------------
 * 1. Kuota baca. Firestore paket gratis memberi 50.000 operasi baca per hari,
 *    dipakai bersama seluruh pengguna. Bila cadangan dijalankan dari peramban
 *    admin pada jam kerja, kuota bisa habis dan aplikasi berhenti bisa membaca
 *    data. Dijalankan Minggu dini hari, kuota hari itu memang tidak terpakai.
 * 2. Token Google Drive tidak pernah keluar dari server.
 * 3. Tidak bergantung pada ada tidaknya admin yang membuka aplikasi.
 * 4. Admin SDK melewati Firestore Rules, sehingga cakupannya tidak dibatasi oleh
 *    aturan akses peramban.
 *
 * PENGAMAN KUOTA
 * --------------
 * Skrip menghitung setiap dokumen yang dibaca dan BERHENTI bila melewati
 * MAX_READS. Lebih baik snapshot berhenti dengan pesan jelas daripada
 * menghabiskan kuota dan membuat aplikasi mati pada hari Senin.
 *
 * Variabel lingkungan:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (wajib) kredensial service account
 *   AI_CONFIG_SECRET               (opsional) kunci dekripsi kredensial Drive
 *   BACKUP_MAX_READS               (opsional) batas baca, default 45000
 *   BACKUP_SKIP_DRIVE              (opsional) '1' untuk melewati unggah Drive
 *   BACKUP_CORE_ONLY               (opsional) '1' untuk melewati kunci pembaca
 *   BACKUP_EXTRA_COLLECTIONS       (opsional) koleksi tambahan, dipisah koma
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink';

// Batas aman di bawah kuota harian 50.000 baca, menyisakan ruang untuk
// aktivitas lain yang mungkin terjadi pada hari yang sama.
const DEFAULT_MAX_READS = 45000;

/**
 * Cakupan backup: HANYA hasil kerja guru.
 *
 * Keputusan cakupan (diminta oleh sekolah): yang dicadangkan otomatis adalah
 * absensi, nilai, dan keaktifan siswa. Data lain — kuis, permainan, percakapan,
 * materi, keuangan, tampilan lobi — TIDAK dicadangkan.
 *
 * Daftar dibagi dua lapis karena data hasil kerja guru menyimpan relasi berupa
 * ID saja, bukan nama. Tanpa lapis kedua, angka-angkanya tetap ada tetapi tidak
 * dapat dibaca lagi: absensi hanya berisi `siswa_id` dan `pengajaran_id`, dan
 * nilai hanya berisi `bab_id`, `tugas_id`, atau `uh_id`.
 */

/** LAPIS 1 — hasil kerja guru. Tidak dapat dibuat ulang bila hilang. */
const CORE_COLLECTIONS = [
  'absensi',
  'nilai_tugas',
  'nilai_ujian',
  'keaktifan_siswa',
];

/**
 * LAPIS 2 — kunci pembaca. Volumenya kecil (puluhan sampai ratusan dokumen),
 * tetapi tanpa ini lapis 1 kehilangan makna:
 *
 *   pengajaran            `pengajaran_id` yang dipakai SETIAP dokumen lapis 1;
 *                         memuat guru, kelas, dan mata pelajaran sekaligus
 *   anggota_kelas         memetakan `siswa_id` menjadi nama dan nomor absen
 *   bab, tugas_bab        memberi nama pada `bab_id` dan `tugas_id` di nilai tugas
 *   ulangan_harian_kolom  memberi nama pada `uh_id` di nilai ujian
 *   tahun_ajaran, kelas,  nama periode, kelas, dan mata pelajaran
 *   mata_pelajaran
 *
 * Lapis ini dapat dimatikan dengan BACKUP_CORE_ONLY=1, tetapi hasilnya menjadi
 * kumpulan angka tanpa keterangan siapa dan pelajaran apa.
 */
const REFERENCE_COLLECTIONS = [
  'pengajaran',
  'anggota_kelas',
  'bab',
  'tugas_bab',
  'ulangan_harian_kolom',
  'tahun_ajaran',
  'kelas',
  'mata_pelajaran',
];

/**
 * Koleksi yang SENGAJA tidak dicadangkan, beserta alasannya. Didokumentasikan
 * agar keputusan ini dapat ditinjau ulang, bukan terlihat sebagai kelalaian.
 */
const EXCLUDED = {
  users: 'Menyimpan password_hash bcrypt dan, pada akun lama yang belum pernah login, password teks biasa. Memasukkannya ke berkas backup menjadikan berkas itu materi kredensial. Nama siswa dan guru sudah tersedia di anggota_kelas dan pengajaran, jadi tidak diperlukan.',
  settings: 'Memuat kredensial Google Drive dan API key AI dalam bentuk terenkripsi. Tidak boleh ikut ke berkas yang tersimpan di luar Firestore.',
  usernames: 'Indeks keunikan nama pengguna; dibentuk ulang dari users.',
  absensi_ringkasan_siswa: 'Sepenuhnya turunan dari absensi. Dihitung ulang otomatis pada penulisan absensi berikutnya, dan getAttendanceSummary sudah punya jalur hitung ulang bila dokumennya tidak ada.',
  catatan_khusus: 'Di luar cakupan yang diminta (absensi, nilai, keaktifan). Catatan: ini masukan asli guru yang tidak punya salinan lain — dapat ditambahkan lewat BACKUP_EXTRA_COLLECTIONS bila diinginkan.',
  jurnal_guru: 'Di luar cakupan yang diminta. Sama seperti catatan_khusus, ini masukan asli guru tanpa salinan lain.',
  item_pembayaran_buku: 'Di luar cakupan yang diminta (data keuangan).',
  pembayaran_buku: 'Di luar cakupan yang diminta (data keuangan).',
  kas_kelas: 'Di luar cakupan yang diminta (data keuangan).',
  kas_transaksi: 'Di luar cakupan yang diminta (data keuangan).',
  kuiz_paket: 'Di luar cakupan yang diminta. Nilai akhir kuis sudah tersalin ke nilai_ujian dan nilai_tugas.',
  kuiz_sesi: 'Di luar cakupan yang diminta.',
  kuiz_jawaban: 'Di luar cakupan yang diminta; volumenya terbesar di basis data.',
  kuiz_nilai_final: 'Di luar cakupan yang diminta; nilainya sudah tersalin ke nilai_ujian/nilai_tugas.',
  materi_publish: 'Di luar cakupan yang diminta (bahan ajar, bukan hasil penilaian).',
  materi_ai: 'Di luar cakupan yang diminta.',
  rpm_drafts: 'Di luar cakupan yang diminta.',
  pengumuman: 'Di luar cakupan yang diminta.',
  pembelajaran: 'Di luar cakupan yang diminta; relasi yang dipakai data akademik adalah pengajaran.',
  wali_kelas: 'Di luar cakupan yang diminta; keanggotaan kelas sudah tercakup anggota_kelas.',
  game_configs: 'Di luar cakupan yang diminta.',
  game_sessions: 'Di luar cakupan yang diminta; bersifat sementara.',
  game_session_rekap: 'Di luar cakupan yang diminta; bukan nilai resmi.',
  chat_rooms: 'Di luar cakupan yang diminta.',
  lobby_settings: 'Di luar cakupan yang diminta; memuat PIN akses lobi.',
  lobby_sections: 'Di luar cakupan yang diminta; memuat access_token lobi.',
  lobby_links: 'Di luar cakupan yang diminta.',
};

/**
 * Nama field yang SELALU dibuang dari setiap dokumen sebelum ditulis ke berkas.
 *
 * Jaring pengaman, bukan pengganti pemilihan koleksi: bila suatu saat koleksi
 * ditambahkan lewat BACKUP_EXTRA_COLLECTIONS, kredensial tetap tidak akan ikut
 * ke berkas yang tersimpan di luar Firestore.
 */
const REDACTED_FIELDS = [
  'password',
  'password_hash',
  'client_secret_enc',
  'refresh_token_enc',
  'api_key_enc',
  'access_token',
  'refresh_token',
  'client_secret',
];

/** Koleksi tambahan atas permintaan operator, mis. "catatan_khusus,jurnal_guru". */
function extraCollections() {
  return String(process.env.BACKUP_EXTRA_COLLECTIONS || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Daftar koleksi final, sesuai urutan pencadangan. */
function resolveCollections() {
  const coreOnly = process.env.BACKUP_CORE_ONLY === '1';
  const list = [...CORE_COLLECTIONS];
  if (!coreOnly) list.push(...REFERENCE_COLLECTIONS);
  for (const name of extraCollections()) {
    if (!list.includes(name)) list.push(name);
  }
  return list;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON belum diset.');
  }
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.');
  }
  admin.initializeApp({ credential: admin.credential.cert(credentials) });
  return admin.firestore();
}

/** Baca periode aktif dari settings/app_config, bukan dari nilai yang ditulis tetap. */
async function readActivePeriod(db) {
  try {
    const snapshot = await db.collection('settings').doc('app_config').get();
    if (!snapshot.exists) return { year: '', semester: '', source: 'tidak ditemukan' };
    const data = snapshot.data() || {};
    return {
      year: String(data.tahun_ajaran_aktif || ''),
      semester: String(data.semester_aktif || ''),
      yearName: String(data.tahun_ajaran_aktif_nama || ''),
      semesterName: String(data.semester_aktif_nama || ''),
      source: 'settings/app_config',
    };
  } catch (error) {
    log(`  ! Gagal membaca periode aktif: ${error.message}`);
    return { year: '', semester: '', source: 'gagal dibaca' };
  }
}

/** Buang field kredensial dari satu dokumen, termasuk objek bersarang. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  // Timestamp Firestore dan tipe khusus lain dibiarkan apa adanya.
  if (typeof value.toDate === 'function') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (REDACTED_FIELDS.includes(key)) continue;
    out[key] = redact(val);
  }
  return out;
}

/**
 * Salin satu koleksi apa adanya.
 *
 * Sengaja memakai get() tanpa filter apa pun: query tanpa where() tidak
 * memerlukan composite index (yang bisa gagal dan menghasilkan snapshot kosong
 * tanpa disadari), dan biaya bacanya sama saja karena Firestore menagih per
 * dokumen yang dikembalikan.
 */
async function dumpCollection(db, name, budget) {
  const snapshot = await db.collection(name).get();
  const docs = [];
  snapshot.forEach((doc) => {
    docs.push({ id: doc.id, data: redact(doc.data()) });
  });
  // Query kosong tetap ditagih 1 baca oleh Firestore.
  budget.used += Math.max(1, docs.length);
  return docs;
}

async function uploadToDrive(fileName, buffer, mimeType) {
  // Dimuat setelah Firebase Admin aktif agar helper memakai app yang sama.
  const { ensureBackupFolder, getAccessToken, recordUpload } = require('../src/api/_lib/backup-config');

  const { accessToken, config } = await getAccessToken();
  const folderId = await ensureBackupFolder({ accessToken, config });
  return uploadWithToken({ fileName, buffer, mimeType, accessToken, folderId, config, recordUpload });
}

/**
 * Unggah beberapa berkas memakai SATU access token dan satu pemeriksaan folder.
 *
 * Dipakai untuk Excel per guru: memanggil getAccessToken() berulang kali berarti
 * menukar refresh token ke Google sebanyak jumlah guru, padahal satu token
 * berlaku sekitar satu jam.
 */
async function uploadManyToDrive(files, { logType = 'otomatis', by = 'snapshot-mingguan' } = {}) {
  const { ensureBackupFolder, getAccessToken, recordUpload } = require('../src/api/_lib/backup-config');
  const { accessToken, config } = await getAccessToken();
  const folderId = await ensureBackupFolder({ accessToken, config });

  const hasil = [];
  for (const file of files) {
    try {
      const res = await uploadWithToken({
        fileName: file.fileName,
        buffer: file.buffer,
        mimeType: file.mimeType,
        accessToken,
        folderId,
        config,
        recordUpload,
        logType,
        by: file.by || by,
      });
      hasil.push({ ok: true, fileName: file.fileName, id: res.id });
    } catch (error) {
      hasil.push({ ok: false, fileName: file.fileName, error: error.message });
    }
  }
  return { hasil, folderName: config.folderName };
}

async function uploadWithToken({
  fileName, buffer, mimeType, accessToken, folderId, config, recordUpload,
  logType = 'otomatis', by = 'snapshot-mingguan',
}) {
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
    throw new Error(`Unggah Google Drive gagal: ${String(detail).slice(0, 300)}`);
  }
  if (!result.id) throw new Error('Google Drive tidak mengembalikan ID berkas.');

  await recordUpload({
    fileName: result.name || fileName,
    fileId: result.id,
    size: Number(result.size || buffer.length || 0),
    uploadedBy: by,
    type: logType,
  });
  return { ...result, folderName: config.folderName };
}

/** Catat hasil ke riwayat backup agar terlihat di panel admin. */
async function writeLog({ status, fileName, size, message }) {
  try {
    const { appendLog } = require('../src/api/_lib/backup-config');
    await appendLog({
      type: 'otomatis',
      status,
      fileName,
      size,
      message,
      by: 'snapshot-mingguan',
    });
  } catch (error) {
    log(`  ! Gagal menulis riwayat backup: ${error.message}`);
  }
}

/**
 * Tulis ringkasan ke halaman ikhtisar GitHub Actions, sehingga hasilnya terlihat
 * tanpa harus membaca seluruh log. Diabaikan saat dijalankan di luar Actions.
 */
function writeSummary({
  fileName, totalDocs, reads, gzSize, complete, drive, scope, coreDocs, refDocs,
  excelCount = 0, excelKB = 0, excelError = '',
}) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  const barisExcel = excelError
    ? `| **Excel per guru GAGAL** | — | ${excelError} |`
    : `| ${excelCount} berkas Excel (${excelKB} KB) | Setiap guru | Dibuka & dilanjutkan langsung di Excel bila aplikasi tidak dapat diakses |`;
  const rows = [
    '## Hasil Backup Mingguan',
    '',
    '| Keterangan | Nilai |',
    '| --- | --- |',
    `| Cakupan | ${scope} |`,
    `| Data hasil kerja guru | ${coreDocs.toLocaleString('id-ID')} dokumen |`,
    `| Kunci pembaca | ${refDocs.toLocaleString('id-ID')} dokumen |`,
    `| Total dokumen | ${totalDocs.toLocaleString('id-ID')} |`,
    `| Operasi baca Firestore | ${reads.toLocaleString('id-ID')} |`,
    '',
    '### Berkas yang dihasilkan',
    '',
    '| Berkas | Untuk siapa | Kegunaan |',
    '| --- | --- | --- |',
    `| \`${fileName}\` (${(gzSize / 1024).toFixed(0)} KB) | Admin | Memulihkan data ke sistem bila terjadi kehilangan |`,
    barisExcel,
    '',
    '| Keterangan | Nilai |',
    '| --- | --- |',
    `| Snapshot lengkap | ${complete ? 'Ya' : 'TIDAK — batas baca tercapai'} |`,
    `| Unggah Google Drive | ${drive} |`,
    '',
  ];

  if (excelError) {
    rows.push(
      '> **Excel per guru tidak terbentuk.** Snapshot JSON tetap berhasil dan tersimpan,',
      '> jadi data tidak hilang. Namun guru tidak mendapat berkas Excel minggu ini;',
      '> mereka masih dapat mengekspor sendiri dari halaman Backup.',
      `> Alasan teknis: \`${excelError}\``,
      ''
    );
  } else {
    rows.push(
      complete
        ? 'Cadangan minggu ini tersimpan di Google Drive dan dilampirkan pada Release di bawah.'
        : 'Snapshot berhenti di tengah karena batas baca. Naikkan `BACKUP_MAX_READS` atau tinjau koleksi bervolume besar.',
      '',
      'Berkas Excel dibuat dari data yang sama yang sudah dibaca untuk snapshot, '
        + 'sehingga **tidak menambah satu pun operasi baca** Firestore.',
      ''
    );
  }

  rows.push(
    '<details><summary>Apa saja yang dicadangkan dan apa yang tidak</summary>',
    '',
    `**Hasil kerja guru:** ${CORE_COLLECTIONS.join(', ')}`,
    '',
    `**Kunci pembaca** (kecil, tanpa ini data di atas kehilangan keterangan siswa, kelas, dan nama tugas): ${REFERENCE_COLLECTIONS.join(', ')}`,
    '',
    '**Tidak dicadangkan:** kuis, permainan, percakapan, materi ajar, keuangan, tampilan lobi, '
      + 'serta `users` dan `settings` karena keduanya memuat kredensial.',
    '',
    '**Isi setiap berkas Excel per guru:** satu sheet Petunjuk, lalu untuk setiap kelas yang '
      + 'diampu ada 4 sheet — Rekap Absen, Absen Harian, Nilai, dan Keaktifan. Seluruh total, '
      + 'persentase, nilai akhir, grade, dan predikat berupa rumus Excel yang menghitung ulang '
      + 'sendiri bila datanya disunting.',
    '',
    '</details>'
  );

  if (String(drive).startsWith('gagal')) {
    rows.push(
      '',
      '> Google Drive belum menerima salinan. Ini **tidak** menggagalkan cadangan:',
      '> berkasnya tetap tersimpan sebagai lampiran Release. Untuk mengaktifkan',
      '> salinan Drive, buka panel Admin > Pengaturan Backup dan hubungkan Google Drive.'
    );
  }
  try {
    fs.appendFileSync(target, `${rows.join('\n')}\n`);
  } catch { /* ringkasan bersifat tambahan, kegagalannya tidak penting */ }
}

async function main() {
  const startedAt = Date.now();
  const maxReads = Number(process.env.BACKUP_MAX_READS || DEFAULT_MAX_READS);
  const budget = { used: 0, max: maxReads };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const fileName = `Snapshot-SIMSMANSARI-${stamp}.json.gz`;
  const COLLECTIONS = resolveCollections();
  const coreOnly = process.env.BACKUP_CORE_ONLY === '1';
  const extras = extraCollections();

  log('=== Snapshot data hasil kerja guru — SIMSMANSARI ===');
  log('Cakupan: absensi, nilai, keaktifan siswa (beserta kunci pembacanya).');
  log('Tidak dicadangkan: kuis, permainan, percakapan, materi, keuangan, lobi,');
  log('serta users dan settings karena keduanya memuat kredensial.');
  if (coreOnly) log('! BACKUP_CORE_ONLY=1 — kunci pembaca DILEWATI, hasilnya angka tanpa keterangan.');
  if (extras.length) log(`Koleksi tambahan atas permintaan: ${extras.join(', ')}`);
  log(`Batas baca: ${maxReads.toLocaleString('id-ID')} dokumen\n`);

  let db;
  try {
    db = initFirebase();
  } catch (error) {
    log(`GAGAL: ${error.message}`);
    process.exit(1);
    return;
  }

  const period = await readActivePeriod(db);
  budget.used += 1;
  log(`Periode aktif: ${period.year || '(tidak diketahui)'} / ${period.semester || '(tidak diketahui)'} — sumber: ${period.source}\n`);

  const collections = {};
  const stats = [];
  const skipped = [];
  let stoppedEarly = false;

  for (const name of COLLECTIONS) {
    if (budget.used >= budget.max) {
      stoppedEarly = true;
      skipped.push(name);
      continue;
    }
    try {
      const before = budget.used;
      const docs = await dumpCollection(db, name, budget);
      collections[name] = docs;
      stats.push({ collection: name, documents: docs.length, reads: budget.used - before });
      log(`  ${name.padEnd(26)} ${String(docs.length).padStart(7)} dokumen   (total baca: ${budget.used.toLocaleString('id-ID')})`);
    } catch (error) {
      stats.push({ collection: name, documents: 0, reads: 0, error: error.message });
      log(`  ${name.padEnd(26)} GAGAL: ${error.message}`);
    }
  }

  if (stoppedEarly) {
    log(`\n! Batas baca tercapai. ${skipped.length} koleksi dilewati: ${skipped.join(', ')}`);
    log('  Snapshot tetap disimpan berisi koleksi yang sudah terbaca.');
    log('  Naikkan BACKUP_MAX_READS bila kuota Firestore sudah ditingkatkan.');
  }

  const snapshot = {
    meta: {
      schema_version: 2,
      generated_at: new Date().toISOString(),
      generated_by: 'scripts/backup-snapshot.js',
      scope: 'hasil-kerja-guru',
      scope_description: 'Absensi, nilai, dan keaktifan siswa, beserta koleksi kunci yang diperlukan untuk membacanya.',
      core_collections: CORE_COLLECTIONS,
      reference_collections: coreOnly ? [] : REFERENCE_COLLECTIONS,
      extra_collections: extras,
      redacted_fields: REDACTED_FIELDS,
      active_period: period,
      total_reads: budget.used,
      max_reads: budget.max,
      complete: !stoppedEarly,
      skipped_collections: skipped,
      excluded_collections: EXCLUDED,
      stats,
    },
    collections,
  };

  const json = JSON.stringify(snapshot);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  const outPath = path.join(process.cwd(), fileName);
  fs.writeFileSync(outPath, gz);

  const docsIn = (names) => stats
    .filter((s) => names.includes(s.collection))
    .reduce((sum, s) => sum + s.documents, 0);
  const coreDocs = docsIn(CORE_COLLECTIONS);
  const refDocs = docsIn(REFERENCE_COLLECTIONS);
  const totalDocs = stats.reduce((sum, s) => sum + s.documents, 0);
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const scopeLabel = coreOnly
    ? 'Hasil kerja guru saja (tanpa kunci pembaca)'
    : 'Hasil kerja guru + kunci pembaca';

  log('\n--- Ringkasan ---');
  log(`Hasil kerja guru : ${coreDocs.toLocaleString('id-ID')} dokumen (absensi, nilai, keaktifan)`);
  log(`Kunci pembaca    : ${refDocs.toLocaleString('id-ID')} dokumen (pengajaran, anggota kelas, bab, dll)`);
  log(`Total dokumen    : ${totalDocs.toLocaleString('id-ID')}`);
  log(`Operasi baca     : ${budget.used.toLocaleString('id-ID')} dari batas ${budget.max.toLocaleString('id-ID')}`);
  log(`Ukuran JSON      : ${(json.length / 1048576).toFixed(2)} MB`);
  log(`Setelah gzip     : ${(gz.length / 1048576).toFixed(2)} MB`);
  log(`Durasi           : ${durationSec} detik`);
  log(`Berkas           : ${outPath}`);
  log(`Lengkap          : ${snapshot.meta.complete ? 'ya' : 'TIDAK (batas baca tercapai)'}`);

  const summaryBase = {
    fileName,
    totalDocs,
    reads: budget.used,
    gzSize: gz.length,
    complete: snapshot.meta.complete,
    scope: scopeLabel,
    coreDocs,
    refDocs,
  };

  // -------------------------------------------------------------------------
  // Excel per guru — dari data yang SUDAH di memori, tanpa satu pun baca baru.
  // -------------------------------------------------------------------------
  let excelFiles = [];
  let excelError = '';
  if (process.env.BACKUP_SKIP_EXCEL === '1') {
    log('\nPembuatan Excel per guru dilewati (BACKUP_SKIP_EXCEL=1).');
  } else {
    try {
      log('\n--- Excel per guru (0 operasi baca tambahan) ---');
      const { buildTeacherWorkbooks } = require('./build-teacher-excel');
      excelFiles = await buildTeacherWorkbooks({
        collections,
        context: {
          tahun_ajaran_aktif: period.year,
          tahun_ajaran_aktif_nama: period.yearName || period.year,
          semester_aktif: period.semester,
          semester_aktif_nama: period.semesterName || period.semester,
        },
        log,
      });
      if (!excelFiles.length) {
        excelError = 'Tidak ada berkas Excel yang terbentuk. Periksa apakah koleksi pengajaran memuat guru_id.';
        log(`! ${excelError}`);
      } else {
        const totalKB = excelFiles.reduce((n, f) => n + f.buffer.length, 0) / 1024;
        log(`Total: ${excelFiles.length} berkas Excel, ${totalKB.toFixed(0)} KB`);
        // Simpan juga ke disk agar terlampir pada GitHub Release.
        for (const f of excelFiles) {
          fs.writeFileSync(path.join(process.cwd(), f.fileName), f.buffer);
        }
      }
    } catch (error) {
      // Kegagalan Excel tidak boleh menjatuhkan snapshot JSON yang sudah selesai,
      // TETAPI harus terlihat jelas. Versi sebelumnya hanya mencatatnya ke log
      // Actions, sehingga kegagalan nyata (dynamic import ESM gagal di Node 20)
      // tampak seolah tidak terjadi apa-apa: ringkasan tetap hijau dan riwayat
      // tetap "success". Sekarang alasannya dibawa ke ringkasan dan riwayat.
      excelError = error.message || String(error);
      log(`\n! GAGAL membuat Excel per guru: ${excelError}`);
      if (error.stack) log(error.stack.split('\n').slice(1, 4).join('\n'));
      log('  Snapshot JSON tetap dibuat dan diunggah.');
      excelFiles = [];
    }
  }
  summaryBase.excelCount = excelFiles.length;
  summaryBase.excelKB = Math.round(excelFiles.reduce((n, f) => n + f.buffer.length, 0) / 1024);
  summaryBase.excelError = excelError;

  if (process.env.BACKUP_SKIP_DRIVE === '1') {
    log('\nUnggah Google Drive dilewati (BACKUP_SKIP_DRIVE=1).');
    await writeLog({
      status: 'success',
      fileName,
      size: gz.length,
      message: `Snapshot hasil kerja guru: ${coreDocs} dokumen absensi/nilai/keaktifan + ${refDocs} kunci pembaca, ${budget.used} baca, ${excelFiles.length} berkas Excel. Tidak diunggah ke Drive.`,
    });
    writeSummary({ ...summaryBase, drive: 'dilewati' });
    return;
  }

  try {
    log('\nMengunggah ke Google Drive...');
    const berkas = [
      { fileName, buffer: gz, mimeType: 'application/gzip' },
      ...excelFiles.map((f) => ({
        fileName: f.fileName,
        buffer: f.buffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        by: f.guruId || 'snapshot-mingguan',
      })),
    ];
    const { hasil, folderName } = await uploadManyToDrive(berkas, { logType: 'otomatis' });
    const sukses = hasil.filter((r) => r.ok);
    const gagal = hasil.filter((r) => !r.ok);

    log(`Folder Drive : ${folderName || '-'}`);
    sukses.forEach((r) => log(`  terunggah  : ${r.fileName}`));
    gagal.forEach((r) => log(`  GAGAL      : ${r.fileName} — ${r.error}`));

    // Snapshot JSON adalah berkas pertama; bila itu gagal, anggap Drive gagal.
    const snapshotOk = hasil[0]?.ok;
    if (!snapshotOk) throw new Error(hasil[0]?.error || 'Unggah snapshot gagal.');

    log(`\n=== Selesai: ${sukses.length} dari ${berkas.length} berkas terunggah ===`);
    // Riwayat di panel admin harus ikut menandai bila Excel tidak terbentuk,
    // supaya kegagalannya tidak tampak seperti keberhasilan.
    if (excelError) {
      await writeLog({
        status: 'error',
        fileName,
        size: gz.length,
        message: `Snapshot berhasil & terunggah, tetapi Excel per guru GAGAL dibuat: ${excelError}`,
      });
    }
    writeSummary({
      ...summaryBase,
      drive: gagal.length
        ? `berhasil sebagian (${sukses.length}/${berkas.length}) — ${gagal[0].error}`
        : `berhasil (${sukses.length} berkas)`,
    });
  } catch (error) {
    // PENTING: kegagalan Drive TIDAK menggagalkan snapshot.
    //
    // Snapshot-nya sendiri sudah selesai dan tersimpan, dan berkasnya akan
    // dilampirkan ke GitHub Release sebagai salinan yang sah. Google Drive adalah
    // tujuan KEDUA, bukan syarat. Menggagalkan seluruh proses hanya karena Drive
    // belum dikonfigurasi berarti membuang cadangan yang sudah berhasil dibuat —
    // dan membuang pula kuota baca yang sudah terpakai untuk membuatnya.
    log(`\n! Unggah Google Drive dilewati: ${error.message}`);
    log('');
    log('  Snapshot TETAP BERHASIL. Berkasnya tersimpan dan akan dilampirkan ke');
    log('  GitHub Release pada langkah berikutnya, jadi cadangan minggu ini aman.');
    log('  Hubungkan Google Drive dari panel admin bila ingin salinan di Drive sekolah.');
    await writeLog({
      status: 'error',
      fileName,
      size: gz.length,
      message: `Snapshot berhasil (${totalDocs} dokumen, ${excelFiles.length} Excel) tetapi belum tersalin ke Drive: ${error.message}`,
    });
    writeSummary({ ...summaryBase, drive: `gagal — ${error.message}` });
  }
}

main().catch(async (error) => {
  log('\n=== Snapshot GAGAL ===');
  log(`Error: ${error?.message || error}`);
  if (error?.stack) log(error.stack.split('\n').slice(0, 4).join('\n'));
  try {
    const { appendLog } = require('../src/api/_lib/backup-config');
    await appendLog({
      type: 'otomatis',
      status: 'error',
      message: `Snapshot mingguan gagal: ${error?.message || error}`,
      by: 'snapshot-mingguan',
    });
  } catch { /* riwayat gagal ditulis, error utama sudah dilaporkan */ }
  process.exit(1);
});
