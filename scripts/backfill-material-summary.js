/**
 * backfill-material-summary.js — isi dokumen materi_ringkasan untuk SEMUA kelas
 * dari materi_publish yang sudah ada (sekali jalan).
 *
 * TUJUAN
 * ------
 * Halaman materi siswa membaca 1 dokumen materi_ringkasan/{tahun}_{semester}_{kelasToken}
 * (metadata materi tanpa html_source) alih-alih meng-query koleksi materi_publish
 * (2 query array-contains + legacy) tiap siswa tiap buka. Dokumen ringkasan
 * biasanya terbentuk saat guru publish/hapus materi. Skrip ini mengisi sekaligus
 * untuk materi yang SUDAH terbit sebelumnya, sehingga penghematan read langsung
 * berlaku penuh tanpa menunggu guru menyentuh tiap materi.
 *
 * AMAN
 * ----
 * - Default DRY-RUN: hanya melaporkan, tidak menulis.
 * - Tambahkan --apply untuk benar-benar menulis.
 * - Menggunakan Admin SDK (melewati Rules).
 * - Field berat (html_source, markdown_source, document_json) DIBUANG dari
 *   dokumen ringkasan agar tetap ringan (jauh di bawah batas 1 MB Firestore).
 * - Hanya membaca materi_publish + menulis materi_ringkasan; koleksi lain tidak
 *   disentuh.
 *
 * MENJALANKAN
 * -----------
 *   npm run backfill:materi             # dry-run (default)
 *   npm run backfill:materi -- --apply  # tulis dokumen ringkasan
 *
 * Kredensial dibaca otomatis dari server/.env
 * (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).
 */

const fs = require('fs');
const path = require('path');

const MATERIAL_PUBLISHED_COLLECTION = 'materi_publish';
const MATERIAL_SUMMARY_COLLECTION = 'materi_ringkasan';
const MAX_ITEMS_PER_SUMMARY = 300;

// Selaras dengan normalizeMaterialClassToken di src/firebase/data-service.js:
// huruf kecil, non-alfanumerik → "_", buang "_" di ujung.
function normalizeMaterialClassToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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

// Buang field berat agar dokumen ringkasan tetap ringan.
function stripMaterialHeavyFields(material = {}) {
  const { html_source, markdown_source, document_json, ...meta } = material || {};
  return meta;
}

// Kumpulkan semua token kelas yang terkait satu materi.
function getMaterialClassTokens(material = {}) {
  const tokens = new Set();
  (Array.isArray(material.kelas_ids) ? material.kelas_ids : []).forEach((value) => {
    const token = normalizeMaterialClassToken(value);
    if (token) tokens.add(token);
  });
  [material.kelas_token, material.kelas_id, material.kelas_nama].forEach((value) => {
    const token = normalizeMaterialClassToken(value);
    if (token) tokens.add(token);
  });
  return Array.from(tokens);
}

function buildMaterialSummaryId(year, semester, token) {
  return `${year}_${semester}_${normalizeMaterialClassToken(token)}`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  loadServerEnv();
  const { getFirestore } = require('../api/_lib/firebase-admin');
  const db = getFirestore();

  // 1) Baca SELURUH materi_publish (sekali) — sumber kebenaran metadata.
  const publishSnap = await db.collection(MATERIAL_PUBLISHED_COLLECTION).get();
  const materials = publishSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Materi terbit dibaca: ${materials.length}`);

  // 2) Kelompokkan per (tahun, semester, kelasToken).
  //    Key grup: `${year}__${semester}__${token}` (materi tanpa periode dilewati).
  const groups = new Map();
  let skippedNoPeriod = 0;
  let skippedNoClass = 0;

  materials.forEach((material) => {
    const year = String(material.tahun_ajaran_id || '').trim();
    const semester = String(material.semester_id || '').trim();
    if (!year || !semester) { skippedNoPeriod += 1; return; }
    const tokens = getMaterialClassTokens(material);
    if (!tokens.length) { skippedNoClass += 1; return; }
    tokens.forEach((token) => {
      const key = `${year}__${semester}__${token}`;
      if (!groups.has(key)) groups.set(key, { year, semester, token, items: [] });
      groups.get(key).items.push(stripMaterialHeavyFields(material));
    });
  });

  // 3) Susun payload ringkasan per grup (dedup by id, urut terbaru, batasi 300).
  const summaries = [];
  for (const group of groups.values()) {
    const byId = new Map();
    group.items.forEach((item) => {
      const id = String(item.id || '').trim();
      if (!id) return;
      // Simpan versi paling baru bila ada duplikat id lintas dokumen.
      const existing = byId.get(id);
      const a = String(item.updated_at || item.published_at || '');
      const b = String(existing?.updated_at || existing?.published_at || '');
      if (!existing || a >= b) byId.set(id, item);
    });
    const scoped = Array.from(byId.values())
      .sort((a, b) => String(b.updated_at || b.published_at || '').localeCompare(String(a.updated_at || a.published_at || '')))
      .slice(0, MAX_ITEMS_PER_SUMMARY);
    summaries.push({
      id: buildMaterialSummaryId(group.year, group.semester, group.token),
      year: group.year,
      semester: group.semester,
      token: group.token,
      items: scoped,
    });
  }

  console.log(`\nGrup ringkasan (kelas × periode): ${summaries.length}`);
  console.log(`  Materi tanpa periode (dilewati): ${skippedNoPeriod}`);
  console.log(`  Materi tanpa kelas (dilewati): ${skippedNoClass}`);
  summaries
    .slice()
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 10)
    .forEach((s) => console.log(`  - ${s.id}: ${s.items.length} materi`));

  if (!apply) {
    console.log('\nDRY-RUN: tidak ada yang ditulis. Jalankan dengan -- --apply untuk menyimpan.');
    return;
  }

  console.log('\nMenulis dokumen materi_ringkasan...');
  const nowIso = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < summaries.length; i += 400) {
    const batch = db.batch();
    summaries.slice(i, i + 400).forEach((s) => {
      batch.set(db.collection(MATERIAL_SUMMARY_COLLECTION).doc(s.id), {
        id: s.id,
        tahun_ajaran_id: s.year,
        semester_id: s.semester,
        kelas_token: s.token,
        items: s.items,
        updated_at: nowIso,
      }, { merge: true });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    written += Math.min(400, summaries.length - i);
    console.log(`  ${written}/${summaries.length} ditulis...`);
  }
  console.log(`Selesai. ${written} dokumen materi_ringkasan ditulis.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Gagal:', error.message || error);
    process.exit(1);
  });
