/**
 * cleanup-orphan-memberships.js — hapus keanggotaan kelas yatim di `anggota_kelas`.
 *
 * MASALAH YANG DIATASI
 * --------------------
 * Halaman guru (absensi, nilai, keaktifan, jurnal, dll) membaca daftar siswa
 * per kelas HANYA dari koleksi `anggota_kelas`, bukan dari `users`. Bila sebuah
 * akun siswa dihapus admin tetapi dokumen `anggota_kelas`-nya tertinggal, siswa
 * itu tetap muncul di daftar kelas guru. Skrip ini membersihkan dokumen
 * `anggota_kelas` yang `siswa_id`-nya sudah tidak ada lagi di koleksi `users`.
 *
 * AMAN & IDEMPOTEN
 * ----------------
 * - Mode default DRY-RUN: hanya melaporkan, tidak menghapus apa pun.
 * - Tambahkan argumen `--apply` untuk benar-benar menghapus.
 * - Hanya menghapus `anggota_kelas`. Data historis (absensi/nilai/keaktifan)
 *   tidak disentuh.
 *
 * MENJALANKAN
 * -----------
 *   # dry-run (lihat apa yang akan dihapus, TIDAK menghapus):
 *   npm run cleanup:orphan-members
 *
 *   # benar-benar hapus:
 *   npm run cleanup:orphan-members -- --apply
 *
 * KREDENSIAL
 * ----------
 * Skrip otomatis membaca kredensial dari `server/.env` (mendukung
 * FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, atau
 * FIREBASE_SERVICE_ACCOUNT_JSON). Bila variabel sudah ada di environment,
 * nilai environment yang dipakai.
 */

const fs = require('fs');
const path = require('path');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Muat server/.env tanpa dependensi (parser KEY=VALUE sederhana). */
function loadServerEnv() {
  const envPath = path.join(__dirname, '..', 'server', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  });
}

function initFirebase() {
  loadServerEnv();
  // Pakai loader kredensial proyek yang sudah mendukung service-account JSON
  // maupun trio PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY.
  const { getFirestore } = require('../api/_lib/firebase-admin');
  return getFirestore();
}

/** Kumpulan semua identitas user yang masih hidup (doc id + field username). */
async function loadLiveUserKeys(db) {
  const keys = new Set();
  const snapshot = await db.collection('users').get();
  snapshot.docs.forEach((doc) => {
    keys.add(normalizeUsername(doc.id));
    const data = doc.data() || {};
    if (data.username) keys.add(normalizeUsername(data.username));
    if (Array.isArray(data.previous_usernames)) {
      data.previous_usernames.forEach((value) => keys.add(normalizeUsername(value)));
    }
  });
  keys.delete('');
  return keys;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = initFirebase();

  console.log('Memuat daftar user aktif...');
  const liveKeys = await loadLiveUserKeys(db);
  console.log(`  ${liveKeys.size} identitas user ditemukan.`);

  console.log('Memindai anggota_kelas...');
  const snapshot = await db.collection('anggota_kelas').get();
  console.log(`  ${snapshot.size} dokumen keanggotaan dipindai.`);

  const orphans = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const siswaId = normalizeUsername(data.siswa_id || doc.id);
    if (!siswaId || !liveKeys.has(siswaId)) {
      orphans.push({
        id: doc.id,
        ref: doc.ref,
        siswa_id: data.siswa_id || '(kosong)',
        siswa_nama: data.siswa_nama || '(tanpa nama)',
        kelas_id: data.kelas_id || '(tanpa kelas)',
      });
    }
  });

  if (!orphans.length) {
    console.log('Tidak ada keanggotaan yatim. Data sudah bersih.');
    return;
  }

  console.log(`\nDitemukan ${orphans.length} keanggotaan yatim (siswa tidak ada di users):`);
  orphans.slice(0, 100).forEach((o) => {
    console.log(`  - ${o.siswa_nama} [${o.siswa_id}] @ ${o.kelas_id}  (doc: ${o.id})`);
  });
  if (orphans.length > 100) console.log(`  ... dan ${orphans.length - 100} lainnya.`);

  if (!apply) {
    console.log('\nDRY-RUN: tidak ada yang dihapus. Jalankan ulang dengan --apply untuk menghapus.');
    return;
  }

  console.log('\nMenghapus...');
  const refs = orphans.map((o) => o.ref);
  let deleted = 0;
  for (let index = 0; index < refs.length; index += 400) {
    const batch = db.batch();
    refs.slice(index, index + 400).forEach((ref) => batch.delete(ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    deleted += Math.min(400, refs.length - index);
    console.log(`  ${deleted}/${refs.length} dihapus...`);
  }
  console.log(`Selesai. ${deleted} keanggotaan yatim dihapus.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Gagal:', error.message || error);
    process.exit(1);
  });
