// ============================================================================
// backup-policy.js
// Satu sumber kebenaran untuk aturan ekspor data guru.
//
// ATURAN: maksimal 3 kali ekspor per minggu kalender (Senin-Minggu) per guru.
//
// MENGAPA 3, BUKAN 1
// ------------------
// Batas awalnya 1 kali per minggu, ditetapkan ketika biaya ekspor masih
// diperkirakan ~1.000 operasi baca per pengajaran untuk sekolah berisi puluhan
// guru. Angka nyata dari data sekolah ini jauh lebih kecil: 23 pengajaran dan
// 4 guru, dengan seluruh basis data hanya sekitar 3.400 dokumen.
//
// Perhitungan ulang dengan angka nyata:
//
//   1 ekspor penuh seorang guru        ~ 6.000 operasi baca
//   4 guru x 3 ekspor per minggu       ~ 72.000 operasi baca per minggu
//   Kuota Firestore paket gratis       50.000 per HARI = 350.000 per minggu
//   ------------------------------------------------------------------------
//   Pemakaian ekspor pada batas 3x     ~ 20% kuota mingguan, tersebar antar hari
//
// Batas 1x terlalu ketat: guru yang salah pilih kelas atau kehilangan berkasnya
// harus menunggu berhari-hari, padahal kuotanya masih sangat longgar. Batas 3x
// memberi ruang koreksi tanpa membuka peluang pemborosan tanpa batas.
//
// SIFAT BATAS INI
// ---------------
// Ini PAGAR KESELAMATAN, bukan kontrol keamanan. Penandanya ada di localStorage
// sehingga hilang bila data peramban dibersihkan atau guru berganti perangkat,
// dan tidak ada pemeriksaan di sisi server. Tujuannya mencegah ekspor berulang
// karena tidak sengaja — klik ganda, coba-coba, atau lupa sudah mengekspor —
// yang merupakan penyebab pemborosan kuota yang nyata dalam praktik.
// ============================================================================

/** Penanda ekspor terakhir. Dipertahankan agar data lama tetap terbaca. */
const LAST_RUN_KEY = 'simguru_backup_last_run';

/** Daftar waktu setiap ekspor, dipakai untuk menghitung pemakaian per minggu. */
const RUNS_KEY = 'simguru_backup_runs';

/** Batas ekspor per minggu kalender per guru. */
export const WEEKLY_EXPORT_LIMIT = 3;

/** Perkiraan baca Firestore untuk satu pengajaran, dipakai untuk info ke guru. */
export const ESTIMATED_READS_PER_ASSIGNMENT = 1000;

/** Simpan riwayat maksimal 5 minggu agar localStorage tidak menumpuk. */
const RETENTION_WEEKS = 5;

/**
 * Awal minggu kalender (Senin 00:00 waktu lokal) untuk tanggal tertentu.
 * Minggu Senin–Minggu dipilih karena paling dekat dengan cara guru memahami
 * "minggu ini" dalam kalender sekolah.
 */
export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Minggu, 1=Senin, ... 6=Sabtu
  const diff = day === 0 ? 6 : day - 1; // Minggu dihitung sebagai hari ke-7
  d.setDate(d.getDate() - diff);
  return d;
}

/** Baca penanda ekspor terakhir dari localStorage. */
export function getLastExport() {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Daftar waktu ekspor (ISO), terurut dari terlama ke terbaru.
 *
 * Bila daftar belum ada tetapi penanda ekspor terakhir ada, penanda itu dipakai
 * sebagai satu entri. Tanpa ini, guru yang sudah mengekspor sebelum pembaruan
 * akan terlihat belum memakai kuota sama sekali.
 */
export function getExportRuns() {
  let runs = [];
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) runs = parsed;
  } catch { runs = []; }

  runs = runs
    .map((item) => (typeof item === 'string' ? item : item?.at))
    .filter((at) => typeof at === 'string' && Number.isFinite(new Date(at).getTime()));

  if (!runs.length) {
    const last = getLastExport();
    if (last?.at && Number.isFinite(new Date(last.at).getTime())) runs = [last.at];
  }

  return runs.sort((a, b) => new Date(a) - new Date(b));
}

/**
 * Catat satu ekspor yang baru selesai.
 *
 * Menulis kedua penanda: daftar riwayat (untuk menghitung kuota mingguan) dan
 * penanda ekspor terakhir (dipakai dasbor serta pengingat).
 */
export function recordExport(meta = {}) {
  const at = new Date().toISOString();
  try {
    const batas = startOfWeek(new Date());
    batas.setDate(batas.getDate() - RETENTION_WEEKS * 7);
    const runs = [...getExportRuns(), at]
      .filter((iso) => new Date(iso).getTime() >= batas.getTime());
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch { /* localStorage penuh atau diblokir; penanda terakhir tetap ditulis */ }
  try {
    localStorage.setItem(LAST_RUN_KEY, JSON.stringify({ at, ...meta }));
  } catch { /* ignore */ }
  return at;
}

/** Jumlah ekspor yang sudah dipakai pada minggu kalender yang sedang berjalan. */
export function getExportsThisWeek(now = new Date()) {
  const awal = startOfWeek(now).getTime();
  return getExportRuns().filter((iso) => new Date(iso).getTime() >= awal).length;
}

/** Sisa kuota ekspor untuk minggu ini. */
export function getRemainingExports(now = new Date()) {
  return Math.max(0, WEEKLY_EXPORT_LIMIT - getExportsThisWeek(now));
}

/** Jumlah hari penuh sejak ekspor terakhir. Infinity bila belum pernah. */
export function getDaysSinceLastExport() {
  const last = getLastExport();
  if (!last?.at) return Infinity;
  const ms = Date.now() - new Date(last.at).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return Math.floor(ms / 86400000);
}

/** Apakah sudah ada ekspor pada minggu kalender yang sedang berjalan. */
export function hasExportedThisWeek(now = new Date()) {
  return getExportsThisWeek(now) > 0;
}

/** Senin berikutnya 00:00 — saat kuota ekspor mingguan terisi lagi. */
export function nextExportAvailableAt(now = new Date()) {
  const next = startOfWeek(now);
  next.setDate(next.getDate() + 7);
  return next;
}

function formatTanggal(date) {
  try {
    return new Date(date).toLocaleDateString('id-ID', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

function formatTanggalJam(date) {
  try {
    return new Date(date).toLocaleString('id-ID', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(date);
  }
}

/** "Ekspor ke-2 dari 3 minggu ini" — dipakai di beberapa tempat. */
export function describeQuota(now = new Date()) {
  const dipakai = getExportsThisWeek(now);
  return {
    used: dipakai,
    limit: WEEKLY_EXPORT_LIMIT,
    remaining: Math.max(0, WEEKLY_EXPORT_LIMIT - dipakai),
    usedText: `${dipakai} dari ${WEEKLY_EXPORT_LIMIT}`,
    nextText: `ke-${Math.min(dipakai + 1, WEEKLY_EXPORT_LIMIT)} dari ${WEEKLY_EXPORT_LIMIT}`,
  };
}

/**
 * Status ekspor guru dalam bentuk siap tampil di UI.
 *
 * @returns {{
 *   allowed: boolean,          apakah ekspor boleh dijalankan sekarang
 *   state: 'never'|'due'|'partial'|'full',
 *   used: number,              ekspor yang sudah dipakai minggu ini
 *   limit: number,             batas per minggu
 *   remaining: number,         sisa kuota minggu ini
 *   badgeLabel: string,        teks pendek untuk lencana
 *   badgeTone: 'ok'|'warn'|'info',
 *   title: string,             kalimat utama
 *   detail: string,            penjelasan lengkap
 *   quotaText: string,         mis. "2 dari 3"
 *   lastAt: string,            ISO waktu ekspor terakhir ('' bila belum pernah)
 *   lastFileName: string,
 *   daysSince: number,
 *   nextAvailableText: string, kapan kuota terisi lagi ('' bila masih ada sisa)
 * }}
 */
export function getExportStatus(now = new Date()) {
  const last = getLastExport();
  const daysSince = getDaysSinceLastExport();
  const lastAt = last?.at || '';
  const lastFileName = last?.file_name || '';
  const kuota = describeQuota(now);
  const dasar = {
    used: kuota.used,
    limit: kuota.limit,
    remaining: kuota.remaining,
    quotaText: kuota.usedText,
    lastAt,
    lastFileName,
    daysSince,
  };

  // Belum pernah mengekspor sama sekali.
  if (!lastAt && kuota.used === 0) {
    return {
      ...dasar,
      allowed: true,
      state: 'never',
      badgeLabel: 'Belum pernah',
      badgeTone: 'warn',
      title: 'Belum pernah ekspor data',
      detail: `Data Anda belum pernah disalin ke Excel. Tersedia ${kuota.limit} kali ekspor setiap minggu — lakukan sekali agar Anda punya salinan mandiri bila aplikasi tidak dapat diakses.`,
      daysSince: Infinity,
      nextAvailableText: '',
    };
  }

  // Kuota minggu ini sudah terpakai habis.
  if (kuota.remaining === 0) {
    const nextAt = nextExportAvailableAt(now);
    return {
      ...dasar,
      allowed: false,
      state: 'full',
      badgeLabel: 'Kuota penuh',
      badgeTone: 'ok',
      title: `Kuota ekspor minggu ini sudah terpakai (${kuota.usedText})`,
      detail: `Ekspor terakhir: ${formatTanggalJam(lastAt)}${lastFileName ? ` (${lastFileName})` : ''}. Kuota terisi kembali pada ${formatTanggal(nextAt)}. Berkas yang sudah diunduh tetap tersimpan dan dapat dibuka kapan saja.`,
      nextAvailableText: formatTanggal(nextAt),
    };
  }

  // Sudah mengekspor minggu ini, tetapi masih ada sisa.
  if (kuota.used > 0) {
    return {
      ...dasar,
      allowed: true,
      state: 'partial',
      badgeLabel: `Sisa ${kuota.remaining}`,
      badgeTone: 'ok',
      title: `Sudah ${kuota.usedText} ekspor minggu ini`,
      detail: `Ekspor terakhir: ${formatTanggalJam(lastAt)}${lastFileName ? ` (${lastFileName})` : ''}. Masih tersisa ${kuota.remaining} kali ekspor untuk minggu ini, misalnya bila ada data yang baru diperbaiki.`,
      nextAvailableText: '',
    };
  }

  // Belum mengekspor minggu ini, tetapi pernah pada minggu sebelumnya.
  return {
    ...dasar,
    allowed: true,
    state: 'due',
    badgeLabel: 'Perlu ekspor',
    badgeTone: 'warn',
    title: 'Belum ekspor data minggu ini',
    detail: `Ekspor terakhir: ${formatTanggalJam(lastAt)} (${daysSince} hari lalu). Tersedia ${kuota.limit} kali ekspor untuk minggu ini.`,
    nextAvailableText: '',
  };
}

/**
 * Perkiraan biaya baca Firestore untuk sejumlah pengajaran, dalam bentuk teks
 * yang bisa dipahami guru. Dipakai pada dialog konfirmasi ekspor.
 */
export function describeReadCost(assignmentCount) {
  const count = Math.max(0, Number(assignmentCount) || 0);
  if (!count) return '';
  const reads = count * ESTIMATED_READS_PER_ASSIGNMENT;
  return `${count} kelas • perkiraan ${reads.toLocaleString('id-ID')} operasi baca database`;
}
