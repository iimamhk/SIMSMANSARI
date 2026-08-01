// ============================================================================
// backup-policy.js
// Satu sumber kebenaran untuk aturan ekspor data guru.
//
// LATAR BELAKANG KUOTA
// --------------------
// Firestore paket gratis (Spark) memberi 50.000 operasi baca per hari, dan
// Firestore menagih 1 baca per DOKUMEN yang dikembalikan query — bukan per query.
// Satu ekspor penuh milik seorang guru membaca kira-kira:
//
//   anggota_kelas        ~ jumlah siswa            (mis. 32)
//   absensi              ~ siswa x pertemuan       (mis. 32 x 18 = 576)
//   nilai_tugas          ~ siswa x jumlah tugas    (mis. 256)
//   nilai_ujian          ~ siswa x jumlah ujian    (mis. 128)
//   bab, tugas_bab, ulangan_harian_kolom  ~ 20
//   ------------------------------------------------------------
//   ~ 1.000 baca per pengajaran, jadi ~5.000 baca untuk 5 kelas.
//
// Bila 10 guru mengekspor pada hari yang sama, kuota harian habis dan SELURUH
// aplikasi berhenti bisa membaca data — absensi, nilai, materi, semuanya.
// Karena itu ekspor dibatasi satu kali per minggu kalender per guru.
//
// Batas ini adalah PAGAR KESELAMATAN, bukan kontrol keamanan: penandanya ada di
// localStorage sehingga bisa dihapus dari peramban. Tujuannya mencegah ekspor
// berulang karena tidak sengaja (klik ganda, coba-coba, lupa sudah ekspor),
// yang merupakan penyebab pemborosan kuota yang nyata.
// ============================================================================

const LAST_RUN_KEY = 'simguru_backup_last_run';

/** Perkiraan baca Firestore untuk satu pengajaran, dipakai untuk info ke guru. */
export const ESTIMATED_READS_PER_ASSIGNMENT = 1000;

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
  const last = getLastExport();
  if (!last?.at) return false;
  const lastAt = new Date(last.at).getTime();
  if (!Number.isFinite(lastAt)) return false;
  return lastAt >= startOfWeek(now).getTime();
}

/** Senin berikutnya 00:00 — saat kuota ekspor mingguan terbuka lagi. */
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

/**
 * Status ekspor guru dalam bentuk siap tampil di UI.
 *
 * @returns {{
 *   allowed: boolean,          apakah ekspor boleh dijalankan sekarang
 *   state: 'never'|'done'|'due',
 *   badgeLabel: string,        teks pendek untuk lencana
 *   badgeTone: 'ok'|'warn'|'info',
 *   title: string,             kalimat utama
 *   detail: string,            penjelasan lengkap
 *   lastAt: string,            ISO waktu ekspor terakhir ('' bila belum pernah)
 *   lastFileName: string,
 *   daysSince: number,
 *   nextAvailableText: string, kapan boleh ekspor lagi ('' bila boleh sekarang)
 * }}
 */
export function getExportStatus(now = new Date()) {
  const last = getLastExport();
  const daysSince = getDaysSinceLastExport();
  const lastAt = last?.at || '';
  const lastFileName = last?.file_name || '';

  if (!lastAt) {
    return {
      allowed: true,
      state: 'never',
      badgeLabel: 'Belum pernah',
      badgeTone: 'warn',
      title: 'Belum pernah ekspor data',
      detail: 'Data Anda belum pernah disalin ke Excel. Lakukan ekspor sekali minggu ini agar Anda punya salinan mandiri bila aplikasi tidak dapat diakses.',
      lastAt: '',
      lastFileName: '',
      daysSince: Infinity,
      nextAvailableText: '',
    };
  }

  if (hasExportedThisWeek(now)) {
    const nextAt = nextExportAvailableAt(now);
    return {
      allowed: false,
      state: 'done',
      badgeLabel: 'Sudah tersimpan',
      badgeTone: 'ok',
      title: 'Data minggu ini sudah tersimpan di perangkat Anda',
      detail: `Ekspor terakhir: ${formatTanggalJam(lastAt)}${lastFileName ? ` (${lastFileName})` : ''}. Ekspor berikutnya dapat dilakukan mulai ${formatTanggal(nextAt)}.`,
      lastAt,
      lastFileName,
      daysSince,
      nextAvailableText: formatTanggal(nextAt),
    };
  }

  return {
    allowed: true,
    state: 'due',
    badgeLabel: 'Perlu ekspor',
    badgeTone: 'warn',
    title: 'Belum ekspor data minggu ini',
    detail: `Ekspor terakhir: ${formatTanggalJam(lastAt)} (${daysSince} hari lalu). Silakan ekspor sekali untuk minggu ini.`,
    lastAt,
    lastFileName,
    daysSince,
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
