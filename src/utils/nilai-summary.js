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
