/**
 * Komputasi ringkasan nilai per mata pelajaran — dipakai bersama oleh halaman
 * Nilai siswa (tampilan detail) dan proses penyusunan dokumen ringkasan
 * (`ringkasan_siswa`) agar ANGKA SELALU KONSISTEN di mana pun ditampilkan.
 *
 * Definisi (disepakati):
 * - Rata komponen (tugas/UH/PTS/PAS) = rata-rata nilai yang TERISI pada komponen itu.
 * - Nilai akhir per mapel = rata-rata dari komponen yang PUNYA data saja
 *   (komponen kosong tidak ikut membagi). Ini menghindari nilai akhir jatuh
 *   drastis saat baru sebagian komponen terisi, sekaligus konsisten dengan cara
 *   perhitungan "rata total" yang sudah dipakai aplikasi.
 * - "Tugas belum" = jumlah tugas aktif yang diharapkan dikurangi jumlah tugas
 *   yang sudah ada nilainya untuk siswa tsb — dipakai untuk mengingatkan siswa.
 */

export const KKM_DEFAULT = 70;

export function meanScores(values = []) {
  const valid = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/** Nilai akhir: rata-rata komponen yang punya data (komponen kosong diabaikan). */
export function computeFinalScore(tugasAvg, uhAvg, ptsAvg, pasAvg) {
  return meanScores([tugasAvg, uhAvg, ptsAvg, pasAvg].filter((v) => v > 0));
}

export function roundScore(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

/**
 * Hitung ringkasan satu mapel dari kumpulan skor komponen milik seorang siswa.
 * @param {object} input
 * @param {number[]} input.tugasScores nilai tugas (aktif) siswa
 * @param {number[]} input.uhScores nilai ulangan harian siswa
 * @param {number[]} input.ptsScores nilai PTS siswa
 * @param {number[]} input.pasScores nilai PAS siswa
 * @param {number} input.tugasTotal jumlah tugas aktif yang diharapkan
 * @param {number} input.tugasTerisi jumlah tugas yang sudah ada nilainya
 */
export function computeMapelSummary(input = {}) {
  const tugasScores = Array.isArray(input.tugasScores) ? input.tugasScores : [];
  const uhScores = Array.isArray(input.uhScores) ? input.uhScores : [];
  const ptsScores = Array.isArray(input.ptsScores) ? input.ptsScores : [];
  const pasScores = Array.isArray(input.pasScores) ? input.pasScores : [];

  const tugasAvg = meanScores(tugasScores);
  const uhAvg = meanScores(uhScores);
  const ptsAvg = meanScores(ptsScores);
  const pasAvg = meanScores(pasScores);
  const finalAvg = computeFinalScore(tugasAvg, uhAvg, ptsAvg, pasAvg);

  const tugasTotal = Math.max(0, Number(input.tugasTotal || 0));
  const tugasTerisi = Math.max(0, Number(input.tugasTerisi || tugasScores.length));
  const tugasBelum = Math.max(0, tugasTotal - tugasTerisi);

  return {
    tugas: roundScore(tugasAvg),
    uh: roundScore(uhAvg),
    pts: roundScore(ptsAvg),
    pas: roundScore(pasAvg),
    nilai_akhir: roundScore(finalAvg),
    tugas_total: tugasTotal,
    tugas_terisi: tugasTerisi,
    tugas_belum: tugasBelum,
  };
}

/** Warna status terhadap KKM: aman (>=KKM), waspada (>=KKM-10), kurang. */
export function scoreStatus(score, kkm = KKM_DEFAULT) {
  const value = Number(score || 0);
  if (value <= 0) return 'kosong';
  if (value >= kkm) return 'aman';
  if (value >= kkm - 10) return 'waspada';
  return 'kurang';
}

// ---------------------------------------------------------------------------
// KEAKTIFAN
// Lima indikator (diselaraskan dengan excel-sheets.js / guru/keaktifan.js).
// ---------------------------------------------------------------------------
export const ACTIVITY_INDICATORS = [
  { key: 'bertanya', label: 'Bertanya' },
  { key: 'menjawab', label: 'Menjawab' },
  { key: 'diskusi', label: 'Diskusi' },
  { key: 'presentasi', label: 'Presentasi' },
  { key: 'tugas_kelas', legacyKey: 'membantu', label: 'Tugas Kelas' },
];

export function isIndicatorActive(indicators, item) {
  const map = indicators && typeof indicators === 'object' ? indicators : {};
  if (Object.prototype.hasOwnProperty.call(map, item.key)) return Boolean(map[item.key]);
  if (item.legacyKey && Object.prototype.hasOwnProperty.call(map, item.legacyKey)) {
    return Boolean(map[item.legacyKey]);
  }
  return false;
}

/** Poin satu catatan, dibatasi 1-4 (sama seperti halaman keaktifan). */
export function recordPoints(record) {
  const raw = Number(record?.poin_indikator ?? record?.skor ?? 1) || 1;
  return Math.max(1, Math.min(4, raw));
}

// Kategori keaktifan berbasis TOTAL poin (akumulasi sepanjang periode).
// Tiap kategori punya predikat + motivasi singkat yang ditampilkan ke siswa.
export const ACTIVITY_TIERS = [
  { min: 0, max: 0, predikat: 'Belum Mulai', motivasi: 'Ayo mulai berpartisipasi di kelas hari ini!', style: 'kosong' },
  { min: 1, max: 5, predikat: 'Pemula', motivasi: 'Langkah awal yang baik. Terus berusaha!', style: 'kurang' },
  { min: 6, max: 10, predikat: 'Berkembang', motivasi: 'Kamu mulai aktif. Pertahankan!', style: 'waspada' },
  { min: 11, max: 15, predikat: 'Aktif', motivasi: 'Partisipasi kamu bagus. Lanjutkan!', style: 'aman' },
  { min: 16, max: 20, predikat: 'Sangat Aktif', motivasi: 'Luar biasa, semangatmu membanggakan!', style: 'aman' },
  { min: 21, max: Infinity, predikat: 'Hebat', motivasi: 'Kamu teladan partisipasi kelas!', style: 'hebat' },
];

/** Tentukan kategori keaktifan dari total poin. */
export function activityTier(totalPoin) {
  const total = Math.max(0, Math.floor(Number(totalPoin || 0)));
  return ACTIVITY_TIERS.find((t) => total >= t.min && total <= t.max) || ACTIVITY_TIERS[ACTIVITY_TIERS.length - 1];
}

/**
 * Rekap keaktifan satu siswa dari daftar catatannya.
 * @param {Array} records dokumen keaktifan_siswa milik siswa tsb.
 * @returns {{ jumlah_catatan:number, total_poin:number, rata_poin:number, predikat:string, motivasi:string, indikator:Object }}
 */
export function computeActivitySummary(records = []) {
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
  const tier = activityTier(poin);
  return {
    jumlah_catatan: jumlah,
    total_poin: poin,
    rata_poin: Math.round(rata * 100) / 100,
    predikat: tier.predikat,
    motivasi: tier.motivasi,
    indikator,
  };
}

