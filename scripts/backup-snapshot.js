/**
 * backup-snapshot.js — cadangan penuh basis data dalam format JSON.
 *
 * PERAN
 * -----
 * Ini adalah backup yang sesungguhnya: satu berkas JSON berisi seluruh dokumen
 * beserta ID-nya, sehingga data dapat dipulihkan kembali ke Firestore. Berkas
 * Excel yang diunduh guru BUKAN backup dalam pengertian ini, karena Excel hanya
 * menyimpan nama siswa, bukan ID dokumen, sehingga tidak bisa dipulihkan.
 *
 * MENGAPA DIJALANKAN DI GITHUB ACTIONS, BUKAN DI PERAMBAN
 * -------------------------------------------------------
 * 1. Kuota baca. Membaca seluruh basis data memerlukan puluhan ribu operasi
 *    baca. Bila dijalankan dari peramban admin pada jam kerja, kuota harian
 *    Firestore (50.000 baca/hari pada paket gratis) habis dan seluruh aplikasi
 *    berhenti bisa membaca data. Dijalankan Minggu dini hari, kuota hari itu
 *    memang sedang tidak terpakai karena tidak ada kegiatan mengajar.
 * 2. Token Google Drive tidak pernah keluar dari server. Peramban tidak lagi
 *    perlu diberi access token Drive.
 * 3. Tidak bergantung pada ada tidaknya admin yang membuka aplikasi.
 * 4. Admin SDK melewati Firestore Rules, sehingga koleksi yang tidak dapat
 *    dibaca peramban (mis. `users`, `settings`) tetap tercadangkan.
 *
 * PENGAMAN KUOTA
 * --------------
 * Skrip menghitung setiap dokumen yang dibaca dan BERHENTI bila melewati
 * MAX_READS. Lebih baik snapshot gagal dengan pesan jelas daripada menghabiskan
 * kuota dan membuat aplikasi mati pada hari Senin.
 *
 * Variabel lingkungan:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (wajib) kredensial service account
 *   AI_CONFIG_SECRET               (opsional) kunci dekripsi kredensial Drive
 *   BACKUP_MAX_READS               (opsional) batas baca, default 45000
 *   BACKUP_SKIP_DRIVE              (opsional) '1' untuk melewati unggah Drive
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
 * Koleksi yang dicadangkan, diurutkan dari yang paling penting.
 *
 * Urutan ini disengaja: bila pengaman kuota memutus proses di tengah jalan,
 * data yang paling tidak tergantikan (struktur kelas, nilai, absensi) sudah
 * masuk lebih dulu. Koleksi bervolume besar dan mudah dibuat ulang berada di
 * urutan belakang.
 */
const COLLECTIONS = [
  // -- Struktur & identitas: kecil, tapi tanpa ini data lain kehilangan makna --
  'users',
  'tahun_ajaran',
  'kelas',
  'mata_pelajaran',
  'pengajaran',
  'pembelajaran',
  'anggota_kelas',
  'wali_kelas',
  'settings',

  // -- Data akademik inti: hasil kerja guru sepanjang semester --
  'absensi',
  'absensi_ringkasan_siswa',
  'nilai_tugas',
  'nilai_ujian',
  'bab',
  'tugas_bab',
  'ulangan_harian_kolom',
  'catatan_khusus',
  'jurnal_guru',
  'keaktifan_siswa',

  // -- Keuangan: tidak punya cadangan lain sama sekali --
  'item_pembayaran_buku',
  'pembayaran_buku',
  'kas_kelas',
  'kas_transaksi',

  // -- Materi & pengumuman --
  'materi_publish',
  'materi_ai',
  'rpm_drafts',
  'pengumuman',

  // -- Kuis: bervolume besar, nilai akhirnya sudah tersalin ke nilai_ujian --
  'kuiz_paket',
  'kuiz_nilai_final',
  'kuiz_sesi',

  // -- Tampilan publik: mudah dibuat ulang --
  'lobby_settings',
  'lobby_sections',
  'lobby_links',
];

/**
 * Koleksi yang SENGAJA tidak dicadangkan, beserta alasannya. Didokumentasikan
 * agar keputusan ini dapat ditinjau ulang, bukan terlihat sebagai kelalaian.
 */
const EXCLUDED = {
  kuiz_jawaban: 'Jawaban mentah per soal; volumenya terbesar di basis data dan nilai akhirnya sudah tersimpan di kuiz_nilai_final.',
  game_sessions: 'Sesi permainan bersifat sementara.',
  game_session_rekap: 'Rekap permainan, bukan nilai resmi.',
  game_configs: 'Konfigurasi permainan, mudah dibuat ulang.',
  game_tokens: 'Token harian, kedaluwarsa dengan sendirinya.',
  battle_rooms: 'Ruang permainan sementara.',
  battle_participants: 'Peserta permainan sementara.',
  chat_rooms: 'Percakapan, bukan data akademik.',
  materi_reads: 'Penanda "sudah dibaca", dapat dibentuk ulang.',
  pengumuman_reads: 'Penanda "sudah dibaca", dapat dibentuk ulang.',
  materi_workspace_drafts: 'Draf kerja sementara milik guru.',
  dashboard_counts: 'Angka ringkasan yang dihitung ulang otomatis.',
};

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
    docs.push({ id: doc.id, data: doc.data() });
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
    uploadedBy: 'snapshot-mingguan',
    type: 'otomatis',
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
function writeSummary({ fileName, totalDocs, reads, gzSize, complete, drive }) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  const rows = [
    '## Hasil Snapshot Backup',
    '',
    '| Keterangan | Nilai |',
    '| --- | --- |',
    `| Berkas | \`${fileName}\` |`,
    `| Dokumen tersalin | ${totalDocs.toLocaleString('id-ID')} |`,
    `| Operasi baca Firestore | ${reads.toLocaleString('id-ID')} |`,
    `| Ukuran (gzip) | ${(gzSize / 1024).toFixed(0)} KB |`,
    `| Snapshot lengkap | ${complete ? 'Ya' : 'TIDAK — batas baca tercapai'} |`,
    `| Unggah Google Drive | ${drive} |`,
    '',
    complete
      ? 'Cadangan minggu ini tersimpan dan dilampirkan pada Release di bawah.'
      : 'Snapshot berhenti di tengah karena batas baca. Naikkan `BACKUP_MAX_READS` atau tinjau koleksi bervolume besar.',
  ];
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

  log('=== Snapshot basis data SIMSMANSARI ===');
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
      schema_version: 1,
      generated_at: new Date().toISOString(),
      generated_by: 'scripts/backup-snapshot.js',
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

  const totalDocs = stats.reduce((sum, s) => sum + s.documents, 0);
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  log('\n--- Ringkasan ---');
  log(`Dokumen tersalin : ${totalDocs.toLocaleString('id-ID')}`);
  log(`Operasi baca     : ${budget.used.toLocaleString('id-ID')} dari batas ${budget.max.toLocaleString('id-ID')}`);
  log(`Ukuran JSON      : ${(json.length / 1048576).toFixed(2)} MB`);
  log(`Setelah gzip     : ${(gz.length / 1048576).toFixed(2)} MB`);
  log(`Durasi           : ${durationSec} detik`);
  log(`Berkas           : ${outPath}`);
  log(`Lengkap          : ${snapshot.meta.complete ? 'ya' : 'TIDAK (batas baca tercapai)'}`);

  if (process.env.BACKUP_SKIP_DRIVE === '1') {
    log('\nUnggah Google Drive dilewati (BACKUP_SKIP_DRIVE=1).');
    await writeLog({
      status: 'success',
      fileName,
      size: gz.length,
      message: `Snapshot lokal: ${totalDocs} dokumen, ${budget.used} baca. Tidak diunggah ke Drive.`,
    });
    writeSummary({ fileName, totalDocs, reads: budget.used, gzSize: gz.length, complete: snapshot.meta.complete, drive: 'dilewati' });
    return;
  }

  try {
    log('\nMengunggah ke Google Drive...');
    const result = await uploadToDrive(fileName, gz, 'application/gzip');
    log(`Folder Drive : ${result.folderName || '-'}`);
    log(`ID berkas    : ${result.id}`);
    if (result.webViewLink) log(`Tautan       : ${result.webViewLink}`);
    log('\n=== Snapshot selesai ===');
    writeSummary({ fileName, totalDocs, reads: budget.used, gzSize: gz.length, complete: snapshot.meta.complete, drive: 'berhasil' });
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
      message: `Snapshot berhasil (${totalDocs} dokumen) tetapi belum tersalin ke Drive: ${error.message}`,
    });
    writeSummary({
      fileName, totalDocs, reads: budget.used, gzSize: gz.length,
      complete: snapshot.meta.complete, drive: `gagal — ${error.message}`,
    });
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
