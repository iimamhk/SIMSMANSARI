/**
 * backfill-student-summary.js — isi dokumen ringkasan_siswa SEMUA siswa
 * dari data nilai & keaktifan yang sudah ada (sekali jalan).
 *
 * TUJUAN
 * ------
 * Dashboard siswa membaca 1 dokumen ringkasan_siswa per siswa (nilai per mapel +
 * keaktifan per mapel). Dokumen ini biasanya terisi bertahap saat guru menyimpan
 * penilaian atau saat siswa membuka halaman Nilai. Skrip ini mengisi sekaligus
 * untuk SEMUA siswa & SEMUA pengajaran aktif, sehingga dashboard langsung penuh.
 *
 * AMAN
 * ----
 * - Default DRY-RUN: hanya melaporkan, tidak menulis.
 * - Tambahkan --apply untuk benar-benar menulis.
 * - Menggunakan Admin SDK (melewati Rules).
 *
 * MENJALANKAN
 * -----------
 *   npm run backfill:summary             # dry-run
 *   npm run backfill:summary -- --apply  # tulis
 *
 * Kredensial dibaca otomatis dari server/.env
 * (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).
 */

const fs = require('fs');
const path = require('path');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
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

function meanScores(values = []) {
  const valid = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function roundScore(v) {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v * 10) / 10;
}

// --- Nilai ---
function computeFinalScore(tugasAvg, uhAvg, ptsAvg, pasAvg) {
  return meanScores([tugasAvg, uhAvg, ptsAvg, pasAvg].filter((v) => v > 0));
}

// --- Keaktifan ---
const ACTIVITY_INDICATORS = [
  { key: 'bertanya', label: 'Bertanya' },
  { key: 'menjawab', label: 'Menjawab' },
  { key: 'diskusi', label: 'Diskusi' },
  { key: 'presentasi', label: 'Presentasi' },
  { key: 'tugas_kelas', legacyKey: 'membantu', label: 'Tugas Kelas' },
];

function isIndicatorActive(indicators, item) {
  const map = indicators && typeof indicators === 'object' ? indicators : {};
  if (Object.prototype.hasOwnProperty.call(map, item.key)) return Boolean(map[item.key]);
  if (item.legacyKey && Object.prototype.hasOwnProperty.call(map, item.legacyKey)) return Boolean(map[item.legacyKey]);
  return false;
}

function recordPoints(record) {
  const raw = Number(record?.poin_indikator ?? record?.skor ?? 1) || 1;
  return Math.max(1, Math.min(4, raw));
}

function activityPredikat(totalPoin) {
  const total = Math.max(0, Math.floor(Number(totalPoin || 0)));
  const tiers = [
    { min: 0, max: 0, predikat: 'Belum Mulai', motivasi: 'Ayo mulai berpartisipasi di kelas hari ini!' },
    { min: 1, max: 5, predikat: 'Pemula', motivasi: 'Langkah awal yang baik. Terus berusaha!' },
    { min: 6, max: 10, predikat: 'Berkembang', motivasi: 'Kamu mulai aktif. Pertahankan!' },
    { min: 11, max: 15, predikat: 'Aktif', motivasi: 'Partisipasi kamu bagus. Lanjutkan!' },
    { min: 16, max: 20, predikat: 'Sangat Aktif', motivasi: 'Luar biasa, semangatmu membanggakan!' },
    { min: 21, max: Infinity, predikat: 'Hebat', motivasi: 'Kamu teladan partisipasi kelas!' },
  ];
  return tiers.find((t) => total >= t.min && total <= t.max) || tiers[tiers.length - 1];
}

function computeActivitySummary(records = []) {
  let jumlah = 0;
  let poin = 0;
  const indikator = {};
  ACTIVITY_INDICATORS.forEach((item) => { indikator[item.key] = 0; });
  (Array.isArray(records) ? records : []).forEach((rec) => {
    jumlah += 1;
    poin += recordPoints(rec);
    ACTIVITY_INDICATORS.forEach((item) => {
      if (isIndicatorActive(rec.indikator, item)) indikator[item.key] += 1;
    });
  });
  const rata = jumlah > 0 ? poin / jumlah : 0;
  const tier = activityPredikat(poin);
  return {
    jumlah_catatan: jumlah,
    total_poin: poin,
    rata_poin: Math.round(rata * 100) / 100,
    predikat: tier.predikat,
    motivasi: tier.motivasi,
    indikator,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  loadServerEnv();
  const { getFirestore } = require('../api/_lib/firebase-admin');
  const db = getFirestore();

  // 1) Periode aktif dari settings/app_config.
  let year = '';
  let semester = '';
  try {
    const cfg = await db.collection('settings').doc('app_config').get();
    const data = cfg.data() || {};
    year = data.tahun_ajaran_aktif || '';
    semester = data.semester_aktif || '';
  } catch (error) {
    console.warn('Gagal membaca periode aktif, menebak dari pengajaran terbaru:', error.message);
  }
  if (!year || !semester) {
    console.error('Periode aktif (tahun_ajaran_aktif/semester_aktif) tidak ditemukan di settings/app_config. Setel dulu di aplikasi.');
    process.exit(1);
  }
  console.log(`Periode aktif: ${year} / ${semester}`);

  // 2) Semua pengajaran periode aktif.
  const pengajaranSnap = await db.collection('pengajaran')
    .where('tahun_ajaran_id', '==', year)
    .where('semester_id', '==', semester)
    .get();
  const pengajaranList = pengajaranSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Pengajaran aktif: ${pengajaranList.length}`);

  // 3) Semua anggota_kelas periode aktif (untuk tahu siswa per pengajaran/kelas).
  const anggotaSnap = await db.collection('anggota_kelas')
    .where('tahun_ajaran_id', '==', year)
    .where('semester_id', '==', semester)
    .get();
  const anggotaList = anggotaSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => String(m.status || 'active').toLowerCase() === 'active');
  console.log(`Anggota kelas aktif: ${anggotaList.length}`);

  // Akumulasi ringkasan per siswa: { siswa_id: { siswa_nama, kelas, nilai_per_mapel:{}, keaktifan_per_mapel:{} } }
  const summaries = new Map();

  function ensureSummary(member) {
    const sid = normalizeUsername(member.siswa_id);
    if (!sid) return null;
    if (!summaries.has(sid)) {
      summaries.set(sid, {
        siswa_id: sid,
        siswa_nama: member.siswa_nama || '',
        kelas_id: member.kelas_id || '',
        kelas_nama: member.kelas_nama || '',
        nilai_per_mapel: {},
        keaktifan_per_mapel: {},
      });
    }
    return summaries.get(sid);
  }
  anggotaList.forEach(ensureSummary);

  let nilaiCount = 0;
  let keaktifanCount = 0;

  // 4) Per pengajaran: hitung nilai + keaktifan untuk anggota kelasnya.
  for (const assignment of pengajaranList) {
    const kelasId = String(assignment.kelas_id || '');
    const mapelId = String(assignment.mapel_id || '').trim() || '-';
    const mapelNama = String(assignment.mapel_nama || assignment.mapel_id || 'Mapel').trim();
    const classMembers = anggotaList.filter((m) => normalizeId(m.kelas_id) === normalizeId(kelasId));
    if (!classMembers.length) continue;

    // --- Nilai ---
    const base = [
      { field: 'tahun_ajaran_id', value: year },
      { field: 'semester_id', value: semester },
      { field: 'pengajaran_id', value: assignment.id },
    ];
    let babDocs = [];
    let tugasDocs = [];
    let nilaiTugasDocs = [];
    let nilaiUjianDocs = [];
    let keaktifanDocs = [];
    try {
      [babDocs, tugasDocs, nilaiTugasDocs, nilaiUjianDocs, keaktifanDocs] = await Promise.all([
        db.collection('bab').where('tahun_ajaran_id', '==', year).where('semester_id', '==', semester).where('pengajaran_id', '==', assignment.id).get(),
        db.collection('tugas_bab').where('tahun_ajaran_id', '==', year).where('semester_id', '==', semester).where('pengajaran_id', '==', assignment.id).get(),
        db.collection('nilai_tugas').where('tahun_ajaran_id', '==', year).where('semester_id', '==', semester).where('pengajaran_id', '==', assignment.id).get(),
        db.collection('nilai_ujian').where('tahun_ajaran_id', '==', year).where('semester_id', '==', semester).where('pengajaran_id', '==', assignment.id).get(),
        db.collection('keaktifan_siswa').where('tahun_ajaran_id', '==', year).where('semester_id', '==', semester).where('pengajaran_id', '==', assignment.id).get(),
      ]);
    } catch (error) {
      console.warn(`  Gagal membaca data pengajaran ${assignment.id}:`, error.message);
      continue;
    }
    babDocs = babDocs.docs.map((d) => ({ id: d.id, ...d.data() }));
    tugasDocs = tugasDocs.docs.map((d) => ({ id: d.id, ...d.data() }));
    nilaiTugasDocs = nilaiTugasDocs.docs.map((d) => ({ id: d.id, ...d.data() }));
    nilaiUjianDocs = nilaiUjianDocs.docs.map((d) => ({ id: d.id, ...d.data() }));
    keaktifanDocs = keaktifanDocs.docs.map((d) => ({ id: d.id, ...d.data() }));

    const activeBab = new Set(babDocs.map((d) => normalizeId(d.bab_id || d.id)));
    const activeTugasIds = new Set(
      tugasDocs.filter((t) => activeBab.has(normalizeId(t.bab_id))).map((t) => normalizeId(t.tugas_id || t.id))
    );
    const tugasTotal = activeTugasIds.size;

    for (const member of classMembers) {
      const sid = normalizeUsername(member.siswa_id);
      if (!sid) continue;
      const summary = ensureSummary(member);

      // Nilai
      const myTugas = nilaiTugasDocs.filter((d) => normalizeUsername(d.siswa_id) === sid && activeTugasIds.has(normalizeId(d.tugas_id)));
      const tugasScores = myTugas.map((d) => Number(d.nilai || 0));
      const tugasTerisi = new Set(myTugas.map((d) => normalizeId(d.tugas_id))).size;
      const myUjian = nilaiUjianDocs.filter((d) => normalizeUsername(d.siswa_id) === sid);
      const uhScores = myUjian.filter((d) => String(d.jenis_nilai).toLowerCase() === 'ulangan_harian').map((d) => Number(d.nilai || 0));
      const ptsScores = myUjian.filter((d) => String(d.jenis_nilai).toLowerCase() === 'pts').map((d) => Number(d.nilai || 0));
      const pasScores = myUjian.filter((d) => String(d.jenis_nilai).toLowerCase() === 'pas').map((d) => Number(d.nilai || 0));
      const tugasAvg = meanScores(tugasScores);
      const uhAvg = meanScores(uhScores);
      const ptsAvg = meanScores(ptsScores);
      const pasAvg = meanScores(pasScores);
      const finalAvg = computeFinalScore(tugasAvg, uhAvg, ptsAvg, pasAvg);
      const tugasBelum = Math.max(0, tugasTotal - tugasTerisi);
      if (tugasScores.length || uhScores.length || ptsScores.length || pasScores.length || tugasTotal) {
        summary.nilai_per_mapel[mapelId] = {
          mapel_nama: mapelNama,
          tugas: roundScore(tugasAvg),
          uh: roundScore(uhAvg),
          pts: roundScore(ptsAvg),
          pas: roundScore(pasAvg),
          nilai_akhir: roundScore(finalAvg),
          tugas_total: tugasTotal,
          tugas_terisi: tugasTerisi,
          tugas_belum: tugasBelum,
        };
        nilaiCount += 1;
      }

      // Keaktifan
      const myKeaktifan = keaktifanDocs.filter((d) => normalizeUsername(d.siswa_id) === sid);
      if (myKeaktifan.length) {
        summary.keaktifan_per_mapel[mapelId] = { mapel_nama: mapelNama, ...computeActivitySummary(myKeaktifan) };
        keaktifanCount += 1;
      }
    }
  }

  console.log(`\nRingkasan terhitung untuk ${summaries.size} siswa.`);
  console.log(`  Entri nilai: ${nilaiCount}`);
  console.log(`  Entri keaktifan: ${keaktifanCount}`);

  if (!apply) {
    console.log('\nDRY-RUN: tidak ada yang ditulis. Jalankan --apply untuk menyimpan.');
    return;
  }

  console.log('\nMenulis dokumen ringkasan_siswa...');
  const entries = Array.from(summaries.values()).filter((s) => Object.keys(s.nilai_per_mapel).length || Object.keys(s.keaktifan_per_mapel).length);
  const docId = (sid) => `${year}_${semester}_${normalizeUsername(sid)}`;
  let written = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    entries.slice(i, i + 400).forEach((s) => {
      batch.set(db.collection('ringkasan_siswa').doc(docId(s.siswa_id)), {
        id: docId(s.siswa_id),
        tahun_ajaran_id: year,
        semester_id: semester,
        siswa_id: s.siswa_id,
        siswa_nama: s.siswa_nama,
        kelas_id: s.kelas_id,
        kelas_nama: s.kelas_nama,
        nilai_per_mapel: s.nilai_per_mapel,
        keaktifan_per_mapel: s.keaktifan_per_mapel,
        nilai_updated_at: new Date().toISOString(),
        keaktifan_updated_at: new Date().toISOString(),
      }, { merge: true });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    written += Math.min(400, entries.length - i);
    console.log(`  ${written}/${entries.length} ditulis...`);
  }
  console.log(`Selesai. ${written} dokumen ringkasan_siswa ditulis.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Gagal:', error.message || error);
    process.exit(1);
  });
