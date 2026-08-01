import { renderLayout } from '../../layouts/dashboard-layout.js';
import { checkDriveStatus, isDriveUploadEnabled, setDriveUploadEnabled } from '../../utils/drive-upload.js';
import {
  exportGuruBackupExcel,
  exportSelectiveBackupExcel,
  BACKUP_DATA_TYPES,
  getSession,
} from '../../utils/backup-excel.js';
import {
  getExportStatus,
  describeReadCost,
  ESTIMATED_READS_PER_ASSIGNMENT,
} from '../../utils/backup-policy.js';
import {
  getBackupHistory,
  getBackupStats,
  deleteBackupHistory,
  clearBackupHistory,
  getBackupHistoryById,
  formatFileSize,
  formatDuration,
  getBackupTypeLabel,
  getBackupTypeBadgeClass,
  getDestinationMeta,
  getFormatIcon,
} from '../../utils/backup-history.js';

function formatDateTimeDisplay(date) {
  if (!date) return 'Belum pernah';
  try {
    return new Date(date).toLocaleString('id-ID', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(date);
  }
}

function formatDateShort(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(date);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Kebijakan halaman ini
//
// 1. EKSPOR EXCEL SAJA. Pilihan format CSV dan JSON dibuang: keluaran CSV
//    sebenarnya rusak (setiap sheet menjadi teks "[object Promise]" karena
//    pemanggilan async yang tidak di-await), dan kunci pada JSON diambil dari
//    baris judul sehingga tidak bermakna. Keduanya tetap melaporkan "Backup
//    Berhasil", yang lebih buruk daripada tidak ada pilihan itu sama sekali.
//
// 2. SATU KALI PER MINGGU. Satu ekspor membaca ribuan dokumen Firestore. Batas
//    ini melindungi kuota baca harian yang dipakai bersama seluruh aplikasi.
//    Aturannya ada di src/utils/backup-policy.js.
//
// 3. DATA MILIK SENDIRI SAJA. Daftar kelas hanya berasal dari
//    getTeachingAssignmentsForUser (difilter guru_id), dan sebelum ekspor
//    dijalankan setiap pilihan diverifikasi ulang terhadap daftar itu.
//
// 4. TIDAK ADA MENU BAYANGAN. Tab Restore, tombol "Preview", dan tiga sakelar
//    pengaturan yang tidak terhubung ke apa pun sudah dibuang, bukan disembunyikan.
// ---------------------------------------------------------------------------

// Kartu riwayat backup (desain premium, jelas di mobile & desktop).
function renderHistoryCard(h) {
  const dest = getDestinationMeta(h.destination || 'local', h.driveUploaded);
  const typeLabel = getBackupTypeLabel(h.backupType);
  const typeBadge = getBackupTypeBadgeClass(h.backupType);
  const meta = [];
  if (h.assignmentsCount) meta.push(`${h.assignmentsCount} kelas`);
  if (h.totalStudents) meta.push(`${h.totalStudents} siswa`);
  meta.push(formatFileSize(h.fileSize));
  if (h.durationMs) meta.push(formatDuration(h.durationMs));

  const driveBtn = h.driveUploaded && (h.driveWebViewLink || h.driveFolderLink)
    ? `<a href="${escapeHtml(h.driveWebViewLink || h.driveFolderLink)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100" title="Buka di Google Drive">
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
        Drive
      </a>`
    : '';

  return `
    <div class="group relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md" data-id="${h.id}">
      <div class="flex items-start gap-3">
        <div class="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600">
          ${getFormatIcon(h.format)}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-slate-900" title="${escapeHtml(h.fileName)}">${escapeHtml(h.fileName)}</p>
          <p class="mt-0.5 text-xs text-slate-500">${formatDateShort(h.timestamp)}</p>
        </div>
        <button class="btn-delete flex-none rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" title="Hapus riwayat" data-id="${h.id}">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeBadge}">${typeLabel}</span>
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${dest.badge}">${dest.icon}${dest.label}</span>
        ${h.driveUploaded ? '<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Tersimpan di Drive</span>' : ''}
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p class="text-xs text-slate-500">${meta.join(' • ')}</p>
        <div class="flex items-center gap-1.5">
          ${driveBtn}
          <button class="btn-preview inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" title="Detail" data-id="${h.id}">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            Detail
          </button>
        </div>
      </div>
    </div>
  `;
}

let currentTab = 'backup';
let assignmentsCache = [];
let membersCache = {};
let isLoadingAssignments = false;

export async function renderGuruBackupPage(container) {
  const session = getSession();
  const userName = session?.user?.nama || 'Bapak/Ibu Guru';
  const history = getBackupHistory();
  const stats = getBackupStats();
  const policy = getExportStatus();

  // Daftar kelas TIDAK dimuat di sini. Dulu `loadAssignmentsForSelectiveBackup()`
  // dipanggil setiap kali halaman dibuka, sehingga membuka tab Riwayat pun ikut
  // menembak query Firestore. Sekarang daftar hanya dimuat ketika guru benar-benar
  // memilih mode "Selektif" (lihat initBackupModeToggle).

  const TONE = {
    ok: {
      wrap: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
      icon: 'bg-emerald-100 text-emerald-600',
      chip: 'bg-emerald-100 text-emerald-700',
      svg: '<path d="M20 6L9 17l-5-5"/>',
    },
    warn: {
      wrap: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
      icon: 'bg-amber-100 text-amber-600',
      chip: 'bg-amber-100 text-amber-700',
      svg: '<path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>',
    },
    info: {
      wrap: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white',
      icon: 'bg-sky-100 text-sky-600',
      chip: 'bg-sky-100 text-sky-700',
      svg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    },
  };
  const tone = TONE[policy.badgeTone] || TONE.info;

  const statusCard = `
    <div class="relative overflow-hidden rounded-3xl border-2 ${tone.wrap} p-5 shadow-sm">
      <div class="flex items-start gap-4">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tone.icon}">
          <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${tone.svg}</svg>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-bold text-slate-900">${escapeHtml(policy.title)}</h2>
            <span class="rounded-full ${tone.chip} px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">${escapeHtml(policy.badgeLabel)}</span>
          </div>
          <p class="mt-1.5 text-sm leading-relaxed text-slate-600">${escapeHtml(policy.detail)}</p>
        </div>
      </div>
    </div>`;

  // Penjelasan aturan satu kali per minggu, ditulis dengan alasannya agar guru
  // memahami batas ini sebagai perlindungan bersama, bukan sekadar larangan.
  const quotaNotice = `
    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-start gap-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </div>
        <div class="min-w-0 text-sm leading-relaxed text-slate-600">
          <p class="font-bold text-slate-900">Mengapa ekspor dibatasi satu kali per minggu?</p>
          <p class="mt-1">Satu kali ekspor membaca ribuan baris data dari database sekolah. Database ini punya batas pemakaian harian yang dipakai bersama oleh semua guru dan siswa. Bila batas itu habis, seluruh aplikasi berhenti dapat membuka absensi, nilai, dan materi sampai hari berikutnya.</p>
          <p class="mt-1">Karena itu setiap guru mengekspor sekali dalam seminggu. Cadangan lengkap seluruh sekolah tetap dibuat otomatis oleh sistem setiap <strong>hari Minggu dini hari</strong>, saat tidak ada kegiatan mengajar.</p>
        </div>
      </div>
    </div>`;

  const statsCards = `
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-2 text-slate-400"><svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7"/><path stroke-linecap="round" stroke-linejoin="round" d="M4 7l8-4 8 4M4 7l8 4 8-4"/></svg><p class="text-[10px] font-semibold uppercase tracking-wider">Total Backup</p></div>
        <p class="mt-2 text-2xl font-bold text-slate-900">${stats.totalBackups}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-2 text-slate-400"><svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"/></svg><p class="text-[10px] font-semibold uppercase tracking-wider">Total Ukuran</p></div>
        <p class="mt-2 text-2xl font-bold text-slate-900">${formatFileSize(stats.totalSize)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-2 text-slate-400"><svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17V7m6 10V11M3 21h18"/></svg><p class="text-[10px] font-semibold uppercase tracking-wider">Rata-rata</p></div>
        <p class="mt-2 text-2xl font-bold text-slate-900">${formatFileSize(stats.avgSize)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-2 text-slate-400"><svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2"/></svg><p class="text-[10px] font-semibold uppercase tracking-wider">Terakhir</p></div>
        <p class="mt-2 text-sm font-semibold text-slate-900">${stats.lastBackup ? formatDateShort(stats.lastBackup) : 'Belum ada'}</p>
      </div>
    </div>`;

  const historyCards = history.length > 0 ? history.slice(0, 20).map((h) => renderHistoryCard(h)).join('') : `
    <div class="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      </div>
      <div>
        <p class="text-sm font-bold text-slate-700">Belum ada riwayat backup</p>
        <p class="mt-1 text-xs text-slate-500">Riwayat backup Anda akan muncul di sini setelah backup pertama.</p>
      </div>
    </div>
  `;

  const pageHtml = `
    <div class="space-y-5">
      <section class="relative overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-teal-50 p-5 shadow-[0_24px_70px_-42px_rgba(16,185,129,0.55)] sm:p-6">
        <div class="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl"></div>
        <div class="absolute bottom-0 left-6 h-24 w-24 rounded-full bg-teal-200/40 blur-3xl"></div>
        <div class="relative">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 backdrop-blur-sm">
            <span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
            Pusat Backup Data
          </div>
          <h2 class="text-2xl font-bold text-slate-900 sm:text-3xl">Backup Data Absensi & Penilaian</h2>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Salin data absensi dan nilai kelas yang Anda ampu menjadi berkas Excel siap kerja. Satu kali ekspor per minggu, dengan riwayat lengkap di perangkat ini.</p>
        </div>
      </section>

      ${statusCard}

      ${statsCards}

      ${quotaNotice}

      <!-- Tab Navigation -->
      <div class="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <nav class="flex gap-1 border-b border-slate-100 bg-slate-50/60 p-1.5" id="backup-tabs">
          <button data-tab="backup" class="tab-btn flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 shadow-sm transition">
            <span class="inline-flex items-center justify-center gap-2"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Backup</span>
          </button>
          <button data-tab="history" class="tab-btn flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-white">
            <span class="inline-flex items-center justify-center gap-2"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Riwayat</span>
          </button>
          <button data-tab="settings" class="tab-btn flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-white">
            <span class="inline-flex items-center justify-center gap-2"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V2a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Pengaturan</span>
          </button>
        </nav>

        <!-- TAB: BACKUP -->
        <div id="tab-backup" class="tab-panel p-5 sm:p-6">
          <section class="mb-6">
            <h3 class="mb-4 text-lg font-bold text-slate-900">Pilih Mode Backup</h3>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button id="mode-full" class="mode-btn relative rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-left transition">
                <input type="radio" name="backupMode" value="full" class="sr-only" checked>
                <div class="flex items-start gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v4"/></svg></div>
                  <div>
                    <p class="font-bold text-slate-900">Backup Penuh (Full)</p>
                    <p class="mt-1 text-sm text-slate-600">Semua kelas, semua tipe data (Rekap Absensi, Absensi Harian, Rekap Nilai)</p>
                  </div>
                </div>
                <span class="absolute right-4 top-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">Direkomendasikan</span>
              </button>
              <button id="mode-selective" class="mode-btn relative rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-slate-300">
                <input type="radio" name="backupMode" value="selective" class="sr-only">
                <div class="flex items-start gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-600"><svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg></div>
                  <div>
                    <p class="font-bold text-slate-900">Backup Selektif</p>
                    <p class="mt-1 text-sm text-slate-600">Pilih kelas & tipe data tertentu (Rekap Absensi / Absensi Harian / Rekap Nilai)</p>
                  </div>
                </div>
              </button>
            </div>
          </section>

          <!-- Selective Options (hidden by default) -->
          <section id="selective-options" class="hidden mb-6 space-y-4">
            <div class="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div class="flex items-center justify-between">
                <h4 class="font-bold text-sky-800">Pilih Kelas</h4>
                <button id="btn-refresh-classes" type="button" class="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1" title="Muat ulang daftar kelas">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Refresh
                </button>
              </div>
              <p class="mt-1 text-sm text-sky-700">Centang kelas yang ingin dibackup</p>
              <div id="class-checkboxes" class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-auto">
                <p class="text-sm text-sky-600 col-span-full text-center py-4">Memuat daftar kelas...</p>
              </div>
            </div>
            <div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h4 class="font-bold text-amber-800">Pilih Jenis Data</h4>
              <p class="mt-1 text-sm text-amber-700">Centang data yang ingin dimasukkan ke berkas Excel. Semakin sedikit yang dicentang, semakin ringan pemakaian database.</p>
              <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" id="data-type-checkboxes">
                ${Object.values(BACKUP_DATA_TYPES).map((dt) => `
                  <label class="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" name="dataType" value="${dt.key}" class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked>
                    <span class="min-w-0">
                      <span class="block font-medium text-slate-900">${dt.icon} ${escapeHtml(dt.label)}</span>
                      <span class="mt-0.5 block text-xs leading-4 text-slate-500">${escapeHtml(dt.description || '')}</span>
                    </span>
                  </label>
                `).join('')}
              </div>
            </div>
          </section>

          <!-- Destination Selection -->
          <section class="mb-6">
            <div class="mb-3 flex items-center gap-2">
              <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700">1</span>
              <h3 class="text-base font-bold text-slate-900">Pilih Tujuan Backup</h3>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3" id="destination-options">
              <label class="dest-opt group relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 transition">
                <span class="dest-check absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white opacity-100 transition"><svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
                <input type="radio" name="backupDestination" value="local" class="sr-only" checked>
                <div class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg></div>
                <div>
                  <p class="font-bold text-slate-900">Lokal</p>
                  <p class="mt-0.5 text-xs text-slate-600">Unduh berkas ke perangkat ini.</p>
                </div>
              </label>
              <label class="dest-opt group relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 transition hover:border-slate-300">
                <span class="dest-check absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white opacity-0 transition"><svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
                <input type="radio" name="backupDestination" value="drive" class="sr-only">
                <div class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sky-100 text-sky-600"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 16V4M12 4l-4 4M12 4l4 4"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 16.5A3.5 3.5 0 0016.5 13H16a5 5 0 10-9.9 1.2A3 3 0 006 20h12a3 3 0 002-3.5z"/></svg></div>
                <div>
                  <p class="font-bold text-slate-900">Online (Drive)</p>
                  <p class="mt-0.5 text-xs text-slate-600">Unggah ke Drive sekolah, tanpa unduh.</p>
                </div>
              </label>
              <label class="dest-opt group relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 transition hover:border-slate-300">
                <span class="dest-check absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white opacity-0 transition"><svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
                <input type="radio" name="backupDestination" value="both" class="sr-only">
                <div class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19h14"/></svg></div>
                <div>
                  <p class="font-bold text-slate-900">Keduanya</p>
                  <p class="mt-0.5 text-xs text-slate-600">Unduh & unggah sekaligus.</p>
                </div>
              </label>
            </div>
            <div id="drive-inline-status" class="mt-3 hidden items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-800"></div>
            <p id="destination-hint" class="mt-2 text-xs text-slate-500"></p>
          </section>

          <!-- Action Buttons -->
          <section>
            <div class="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 class="text-lg font-bold text-slate-900" id="backup-action-title">Mulai Backup Sekarang</h3>
                  <p class="mt-1 text-sm text-slate-500" id="backup-action-desc">Pilih tujuan backup di atas, lalu klik tombol backup.</p>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row">
                  <button id="btn-start-backup" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-95">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                    <span id="btn-start-backup-label">Backup Sekarang</span>
                  </button>
                </div>
              </div>

              <div id="backup-progress-box" class="hidden mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div class="flex items-center gap-3">
                  <svg class="h-5 w-5 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                  <p id="backup-progress-text" class="text-sm font-medium text-slate-600">Memulai backup...</p>
                </div>
                <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div id="backup-progress-bar" class="h-full w-0 bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"></div>
                </div>
              </div>

              <!-- Panel sukses dengan tombol ke folder Drive -->
              <div id="backup-success-box" class="hidden mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div class="flex items-start gap-3">
                  <div class="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-emerald-900">Backup Berhasil</p>
                    <p id="backup-success-text" class="mt-0.5 text-xs text-emerald-700"></p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <a id="backup-success-drive" href="#" target="_blank" rel="noopener" class="hidden inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
                        Buka Folder Google Drive
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- TAB: HISTORY -->
        <div id="tab-history" class="tab-panel hidden p-5 sm:p-6">
          <section class="mb-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 class="text-lg font-bold text-slate-900">Riwayat Backup</h3>
                <p class="mt-1 text-sm text-slate-500">${history.length} riwayat tersimpan (maksimal 50). Berkas yang diunggah punya tautan langsung ke Google Drive.</p>
              </div>
              <div class="flex items-center gap-2">
                <button id="btn-open-drive-folder" type="button" class="hidden inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100" title="Buka folder Google Drive">
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  Buka Folder Drive
                </button>
                <button id="btn-clear-history" class="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50">
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
                  Hapus Semua
                </button>
              </div>
            </div>
          </section>
          <section>
            <div id="history-grid" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              ${historyCards}
            </div>
            ${history.length > 20 ? `
              <div class="mt-4 text-center">
                <button id="btn-load-more-history" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50">Tampilkan ${history.length - 20} lebih...</button>
              </div>
            ` : ''}
          </section>
        </div>

        <!-- TAB: SETTINGS -->
        <div id="tab-settings" class="tab-panel hidden p-5 sm:p-6 space-y-6">
          <section>
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-lg font-bold text-slate-900">Google Drive</h3>
              <span id="drive-state-badge" class="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Memeriksa...</span>
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <label class="flex items-center justify-between gap-4">
                <div>
                  <p class="font-medium text-slate-900">Unggah Backup ke Google Drive</p>
                  <p class="text-sm text-slate-500">Jadikan Google Drive sebagai tujuan default (opsi "Keduanya") saat backup.</p>
                </div>
                <input type="checkbox" id="drive-upload-toggle" class="h-5 w-5 flex-none rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
              </label>
              <p id="drive-state-detail" class="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">Memeriksa koneksi Google Drive...</p>
              <a id="drive-open-folder" href="#" target="_blank" rel="noopener" class="hidden inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                Buka Folder Google Drive
              </a>
            </div>
          </section>
          <section>
            <h3 class="mb-4 text-lg font-bold text-slate-900">Backup Otomatis Sekolah</h3>
            <div class="rounded-xl border border-slate-200 bg-white p-4">
              <div class="flex items-start gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/></svg>
                </div>
                <div class="min-w-0 text-sm leading-relaxed text-slate-600">
                  <p class="font-medium text-slate-900">Dijalankan sistem setiap Minggu dini hari</p>
                  <p class="mt-1">Cadangan lengkap seluruh data sekolah dibuat otomatis oleh server, bukan oleh perangkat Bapak/Ibu. Karena itu tidak ada pengaturan jadwal yang perlu diatur di sini.</p>
                  <p class="mt-1">Ekspor Excel di halaman ini bersifat pelengkap: gunanya agar Bapak/Ibu memegang salinan sendiri yang dapat dibuka dan dilanjutkan tanpa aplikasi.</p>
                </div>
              </div>
            </div>
          </section>
          <section>
            <h3 class="mb-4 text-lg font-bold text-slate-900">Kelola Data Lokal</h3>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <button id="btn-export-history" class="rounded-xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 transition">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg></div>
                <p class="mt-3 font-bold text-slate-900">Ekspor Riwayat</p>
                <p class="mt-1 text-sm text-slate-500">Unduh riwayat backup sebagai JSON</p>
              </button>
              <button id="btn-import-history" class="rounded-xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 transition">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg></div>
                <p class="mt-3 font-bold text-slate-900">Impor Riwayat</p>
                <p class="mt-1 text-sm text-slate-500">Pulihkan riwayat dari file JSON</p>
              </button>
              <button id="btn-clear-all-data" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-left hover:bg-rose-100 transition">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></div>
                <p class="mt-3 font-bold text-rose-900">Hapus Semua Data Lokal</p>
                <p class="mt-1 text-sm text-rose-700">Riwayat, timestamp, pengaturan</p>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;

  const html = renderLayout('Backup Data', pageHtml, { accentPanel: 'from-emerald-500 via-teal-500 to-cyan-500' });
  container.innerHTML = html;

  // Initialize event listeners
  initTabNavigation(container);
  initBackupModeToggle(container);
  initDestinationToggle(container);
  initBackupActions(container);
  initHistoryActions(container);
  initSettingsActions(container);

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}

async function loadAssignmentsForSelectiveBackup() {
  if (isLoadingAssignments) return;
  isLoadingAssignments = true;
  try {
    const { getStoredContext } = await import('../../utils/helpers.js');
    const { getTeachingAssignmentsForUser } = await import('../../firebase/data-service.js');

    const context = getStoredContext();
    const session = getSession();
    const userId = session?.user?.username || context?.user_logged_in || '';

    if (userId) {
      assignmentsCache = await getTeachingAssignmentsForUser(context, userId);
    }
  } catch (e) {
    console.warn('Gagal memuat pengajaran:', e);
    assignmentsCache = [];
  } finally {
    isLoadingAssignments = false;
  }
}

function renderClassCheckboxes(container) {
  const checkboxesContainer = container.querySelector('#class-checkboxes');
  if (!checkboxesContainer) return;

  if (!assignmentsCache.length && !isLoadingAssignments) {
    checkboxesContainer.innerHTML = `
      <div class="col-span-full flex flex-col items-center gap-2 py-6 text-center">
        <svg class="animate-spin h-6 w-6 text-slate-400" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        <p class="text-sm text-slate-500">Memuat data pengajaran...</p>
      </div>`;
    // Trigger reload
    loadAssignmentsForSelectiveBackup().then(() => renderClassCheckboxes(container));
    return;
  }

  if (!assignmentsCache.length && isLoadingAssignments) {
    // Already loading, show spinner but don't trigger another load
    checkboxesContainer.innerHTML = `
      <div class="col-span-full flex flex-col items-center gap-2 py-6 text-center">
        <svg class="animate-spin h-6 w-6 text-slate-400" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        <p class="text-sm text-slate-500">Memuat data pengajaran...</p>
      </div>`;
    return;
  }

  checkboxesContainer.innerHTML = assignmentsCache.map((a) => `
    <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" name="assignment" value="${a.id}" class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-slate-900 truncate">${a.kelas_nama || a.kelas_id}</p>
        <p class="text-xs text-slate-500 truncate">${a.mapel_nama || 'Mapel'}</p>
      </div>
    </label>
  `).join('');
}

function initTabNavigation(container) {
  const tabs = container.querySelectorAll('.tab-btn');
  const panels = container.querySelectorAll('.tab-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      tabs.forEach((t) => {
        t.classList.remove('bg-slate-900', 'text-white', 'shadow-sm');
        t.classList.add('text-slate-500');
      });
      tab.classList.add('bg-slate-900', 'text-white', 'shadow-sm');
      tab.classList.remove('text-slate-500');

      panels.forEach((p) => {
        if (p.id === `tab-${tabName}`) {
          p.classList.remove('hidden');
        } else {
          p.classList.add('hidden');
        }
      });

      currentTab = tabName;
    });
  });
}

function initBackupModeToggle(container) {
  const modeBtns = container.querySelectorAll('.mode-btn');
  const selectiveOptions = container.querySelector('#selective-options');

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => {
        b.classList.remove('border-emerald-300', 'bg-emerald-50');
        b.classList.add('border-slate-200', 'bg-white');
        b.querySelector('input').checked = false;
      });
      btn.classList.add('border-emerald-300', 'bg-emerald-50');
      btn.classList.remove('border-slate-200', 'bg-white');
      btn.querySelector('input').checked = true;

      const mode = btn.querySelector('input').value;
      if (mode === 'selective') {
        selectiveOptions.classList.remove('hidden');
        // Daftar kelas dimuat SEKARANG, bukan saat halaman dibuka. Guru yang
        // hanya melihat Riwayat atau Pengaturan tidak perlu membebani kuota baca.
        loadAssignmentsForSelectiveBackup().then(() => renderClassCheckboxes(container));
      } else {
        selectiveOptions.classList.add('hidden');
      }
      updateBackupActionText(container, mode);
    });
  });

  // Tombol muat ulang daftar kelas untuk backup selektif.
  container.querySelector('#btn-refresh-classes')?.addEventListener('click', () => {
    assignmentsCache = [];
    loadAssignmentsForSelectiveBackup().then(() => renderClassCheckboxes(container));
  });
}

function updateBackupActionText(container, mode) {
  const titleEl = container.querySelector('#backup-action-title');
  const descEl = container.querySelector('#backup-action-desc');

  if (mode === 'selective') {
    titleEl.textContent = 'Backup Selektif';
    descEl.textContent = 'Pilih kelas dan tipe data di atas, lalu tentukan tujuan backup (lokal / Drive / keduanya).';
  } else {
    titleEl.textContent = 'Mulai Backup Sekarang';
    descEl.textContent = 'Pilih tujuan backup (lokal / Drive / keduanya), lalu klik tombol backup.';
  }
}

// Pilihan tujuan backup: highlight kartu terpilih + teks bantuan + label tombol.
function initDestinationToggle(container) {
  const destOpts = Array.from(container.querySelectorAll('.dest-opt'));
  const hint = container.querySelector('#destination-hint');
  const startLabel = container.querySelector('#btn-start-backup-label');

  const HINTS = {
    local: 'Berkas backup akan diunduh ke perangkat ini saja.',
    drive: 'Berkas backup akan diunggah langsung ke Google Drive sekolah (tidak diunduh ke perangkat).',
    both: 'Berkas backup diunduh ke perangkat sekaligus diunggah ke Google Drive.',
  };
  const LABELS = { local: 'Unduh ke Perangkat', drive: 'Unggah ke Drive', both: 'Unduh + Unggah' };
  const inlineStatus = container.querySelector('#drive-inline-status');

  const apply = (value) => {
    destOpts.forEach((opt) => {
      const input = opt.querySelector('input');
      const isActive = input.value === value;
      input.checked = isActive;
      opt.classList.toggle('border-emerald-300', isActive);
      opt.classList.toggle('bg-emerald-50', isActive);
      opt.classList.toggle('border-slate-200', !isActive);
      opt.classList.toggle('bg-white', !isActive);
      const check = opt.querySelector('.dest-check');
      if (check) check.classList.toggle('opacity-0', !isActive);
    });
    if (hint) hint.textContent = HINTS[value] || '';
    if (startLabel) startLabel.textContent = LABELS[value] || 'Ekspor Sekarang';

    // Tampilkan status koneksi Drive saat tujuan menyertakan Drive.
    if (inlineStatus) {
      if (value === 'drive' || value === 'both') {
        inlineStatus.classList.remove('hidden');
        inlineStatus.classList.add('flex');
        inlineStatus.innerHTML = `<svg class="h-3.5 w-3.5 animate-spin text-sky-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>Memeriksa koneksi Google Drive...</span>`;
        checkDriveStatus().then((status) => {
          if (status.available) {
            const akun = status.accountEmail ? ` • ${status.accountEmail}` : '';
            const folderBtn = status.folderLink
              ? ` <a href="${status.folderLink}" target="_blank" rel="noopener" class="ml-1 inline-flex items-center gap-1 font-bold text-sky-700 underline decoration-sky-300 underline-offset-2">Buka folder</a>`
              : '';
            inlineStatus.innerHTML = `<svg class="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span>Terhubung ke folder <strong>${status.folderName || 'backup'}</strong>${akun}.${folderBtn}</span>`;
          } else {
            inlineStatus.innerHTML = `<svg class="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg><span>${status.reason || 'Google Drive belum siap.'} Admin dapat mengaturnya di Pengaturan → Google Drive.</span>`;
          }
        });
      } else {
        inlineStatus.classList.add('hidden');
        inlineStatus.classList.remove('flex');
      }
    }
  };

  destOpts.forEach((opt) => {
    opt.addEventListener('click', () => apply(opt.querySelector('input').value));
  });
  apply('local');
}

function initBackupActions(container) {
  const startBtn = container.querySelector('#btn-start-backup');
  const progressBox = container.querySelector('#backup-progress-box');
  const progressText = container.querySelector('#backup-progress-text');
  const progressBar = container.querySelector('#backup-progress-bar');
  const successBox = container.querySelector('#backup-success-box');
  const successText = container.querySelector('#backup-success-text');
  const successDrive = container.querySelector('#backup-success-drive');

  // Kuota mingguan sudah habis: matikan tombol dan jelaskan alasannya, jangan
  // biarkan guru menekan tombol lalu ditolak dengan pesan kesalahan.
  const policy = getExportStatus();
  if (!policy.allowed && startBtn) {
    startBtn.disabled = true;
    startBtn.classList.remove('bg-gradient-to-r', 'from-emerald-500', 'to-teal-500', 'text-white', 'shadow-lg', 'shadow-emerald-500/30', 'hover:-translate-y-0.5', 'hover:shadow-xl', 'active:scale-95');
    startBtn.classList.add('bg-slate-200', 'text-slate-500', 'cursor-not-allowed');
    const label = container.querySelector('#btn-start-backup-label');
    if (label) label.textContent = 'Sudah ekspor minggu ini';
    startBtn.title = `Ekspor berikutnya tersedia mulai ${policy.nextAvailableText}.`;
    const titleEl = container.querySelector('#backup-action-title');
    const descEl = container.querySelector('#backup-action-desc');
    if (titleEl) titleEl.textContent = 'Ekspor minggu ini sudah selesai';
    if (descEl) {
      descEl.textContent = `Berkas Excel Anda sudah tersimpan. Ekspor berikutnya dapat dilakukan mulai ${policy.nextAvailableText}. Berkas lama tetap ada di tab Riwayat.`;
    }
  }

  const updateProgress = (text, percent) => {
    if (successBox) successBox.classList.add('hidden');
    if (progressBox) progressBox.classList.remove('hidden');
    if (progressText) progressText.textContent = text;
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  };

  const showSuccess = (message, driveLink) => {
    if (progressBox) progressBox.classList.add('hidden');
    if (!successBox) return;
    successBox.classList.remove('hidden');
    if (successText) successText.textContent = message;
    if (successDrive) {
      if (driveLink) {
        successDrive.href = driveLink;
        successDrive.classList.remove('hidden');
      } else {
        successDrive.classList.add('hidden');
      }
    }
  };

  const runBackup = async () => {
    // Pemeriksaan ulang tepat sebelum jalan. Tombol memang sudah dimatikan bila
    // kuota habis, tapi halaman bisa terbuka lama sehingga statusnya berubah.
    const current = getExportStatus();
    if (!current.allowed) {
      alert(
        'Ekspor minggu ini sudah dilakukan.\n\n'
        + `${current.detail}\n\n`
        + 'Batas satu kali per minggu ini menjaga agar kuota database sekolah '
        + 'tidak habis, karena kuota tersebut dipakai bersama oleh semua guru dan siswa.'
      );
      return;
    }

    if (startBtn) { startBtn.disabled = true; startBtn.classList.add('opacity-60', 'cursor-not-allowed'); }

    try {
      const mode = container.querySelector('input[name="backupMode"]:checked')?.value || 'full';
      const destination = container.querySelector('input[name="backupDestination"]:checked')?.value || 'local';
      const dataTypes = Array.from(container.querySelectorAll('input[name="dataType"]:checked')).map((cb) => cb.value);

      // Verifikasi pemilikan data: setiap kelas yang dipilih harus benar-benar
      // ada di daftar pengajaran milik guru ini. assignmentsCache hanya diisi
      // getTeachingAssignmentsForUser (difilter guru_id), dan pencarian .find
      // di bawah membuang nilai apa pun yang tidak berasal dari daftar itu —
      // termasuk bila nilai checkbox diubah lewat DevTools.
      const selectedAssignments = Array.from(container.querySelectorAll('input[name="assignment"]:checked'))
        .map((cb) => cb.value)
        .map((id) => assignmentsCache.find((a) => a.id === id))
        .filter(Boolean);

      const context = (await import('../../utils/helpers.js')).getStoredContext();
      const session = getSession();
      const userId = session?.user?.username || context?.user_logged_in || '';
      const userName = session?.user?.nama || 'Guru';

      if (!userId) {
        alert('Sesi Anda tidak terbaca. Silakan keluar lalu masuk kembali.');
        return;
      }

      if (mode === 'selective') {
        if (!selectedAssignments.length) { alert('Pilih minimal satu kelas untuk ekspor selektif.'); return; }
        if (!dataTypes.length) { alert('Pilih minimal satu jenis data untuk ekspor selektif.'); return; }
        // Lapis kedua: tolak bila ada pilihan yang guru_id-nya bukan guru ini.
        const foreign = selectedAssignments.filter((a) => {
          const owner = String(a.guru_id || '').trim().toLowerCase();
          return owner && owner !== String(userId).trim().toLowerCase();
        });
        if (foreign.length) {
          alert('Ekspor dibatalkan: terdapat kelas yang bukan kelas Anda. Setiap guru hanya dapat mengekspor data kelas yang diampunya sendiri.');
          return;
        }
      }

      // Konfirmasi sekali, dengan biayanya dinyatakan terbuka. Ini satu-satunya
      // kesempatan ekspor untuk minggu ini, jadi guru perlu tahu sebelum menekan.
      const jumlahKelas = mode === 'selective' ? selectedAssignments.length : assignmentsCache.length;
      const biaya = describeReadCost(jumlahKelas);
      const tujuanTeks = destination === 'local'
        ? 'diunduh ke perangkat ini'
        : destination === 'drive'
          ? 'diunggah ke Google Drive sekolah'
          : 'diunduh ke perangkat dan diunggah ke Google Drive';
      const konfirmasi = [
        'Jalankan ekspor Excel sekarang?',
        '',
        `Mode      : ${mode === 'selective' ? 'Selektif (kelas terpilih)' : 'Penuh (semua kelas Anda)'}`,
        `Hasil     : ${tujuanTeks}`,
        biaya ? `Cakupan   : ${biaya}` : '',
        '',
        'Ini adalah ekspor Anda untuk minggu ini. Setelah selesai, tombol ekspor',
        'akan terkunci sampai minggu depan.',
      ].filter(Boolean).join('\n');
      if (!confirm(konfirmasi)) return;

      // Bila tujuan menyertakan Drive, pastikan Drive siap SEBELUM membaca data,
      // supaya kuota baca tidak terpakai untuk ekspor yang pasti gagal diunggah.
      if (destination === 'drive' || destination === 'both') {
        updateProgress('Memeriksa koneksi Google Drive...', 6);
        const status = await checkDriveStatus();
        if (!status.available) {
          if (progressBox) progressBox.classList.add('hidden');
          alert(`Google Drive belum siap: ${status.reason || 'belum dikonfigurasi admin.'}\n\nKuota database tidak terpakai, jadi Anda masih bisa mencoba lagi setelah admin mengatur Drive, atau pilih tujuan "Lokal".`);
          return;
        }
      }

      updateProgress('Membaca data pengajaran...', 12);

      const progress = (p) => {
        const pct = 20 + Math.floor((p.current / Math.max(p.total, 1)) * 70);
        updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
      };

      const result = mode === 'full'
        ? await exportGuruBackupExcel(progress, { destination })
        : await exportSelectiveBackupExcel(context, userId, userName, selectedAssignments, dataTypes, progress, { destination });

      updateProgress('Selesai!', 100);

      const drive = result?.drive || {};
      const driveFolderLink = drive.folderLink || drive.webViewLink || '';
      let doneMsg = '';
      if (destination === 'local') doneMsg = 'Berkas Excel sudah diunduh ke perangkat Anda. Buka sheet "Petunjuk" di dalamnya untuk cara melanjutkan pekerjaan.';
      else if (destination === 'drive') {
        doneMsg = drive.uploaded ? 'Berkas Excel berhasil diunggah ke Google Drive sekolah.' : `Gagal unggah ke Drive: ${drive.reason || 'terjadi kesalahan.'}`;
      } else {
        doneMsg = drive.uploaded
          ? 'Berkas Excel diunduh ke perangkat dan diunggah ke Google Drive.'
          : `Berkas diunduh ke perangkat. Unggah Drive gagal: ${drive.reason || 'terjadi kesalahan.'}`;
      }

      showSuccess(doneMsg, drive.uploaded ? driveFolderLink : '');
      // Muat ulang halaman agar status mingguan, riwayat, dan statistik ikut
      // ter-update. Jeda diberi agar guru sempat melihat tombol folder Drive.
      setTimeout(() => { renderGuruBackupPage(container); }, drive.uploaded && driveFolderLink ? 3500 : 1800);
    } catch (err) {
      console.error('Ekspor gagal:', err);
      if (progressBox) progressBox.classList.add('hidden');
      alert(`Ekspor gagal: ${err?.message || 'Terjadi kesalahan.'}`);
    } finally {
      if (startBtn && getExportStatus().allowed) {
        startBtn.disabled = false;
        startBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
    }
  };

  startBtn?.addEventListener('click', () => runBackup());
}

function initHistoryActions(container) {
  const grid = container.querySelector('#history-grid');
  const loadMoreBtn = container.querySelector('#btn-load-more-history');
  const clearBtn = container.querySelector('#btn-clear-history');
  const openFolderBtn = container.querySelector('#btn-open-drive-folder');

  // Tombol "Buka Folder Drive": tampil bila ada riwayat dengan tautan Drive,
  // atau bila koneksi Drive aktif (folder link dari status).
  (async () => {
    if (!openFolderBtn) return;
    const history = getBackupHistory();
    let folderLink = history.find((h) => h.driveFolderLink)?.driveFolderLink || '';
    if (!folderLink) {
      try {
        const status = await checkDriveStatus();
        if (status.available && status.folderLink) folderLink = status.folderLink;
      } catch { /* abaikan */ }
    }
    if (folderLink) {
      openFolderBtn.classList.remove('hidden');
      openFolderBtn.addEventListener('click', () => window.open(folderLink, '_blank', 'noopener'));
    }
  })();

  grid?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('btn-preview')) {
      const entry = getBackupHistoryById(id);
      if (entry) {
        const dest = getDestinationMeta(entry.destination || 'local', entry.driveUploaded).label;
        alert(`Detail Backup\n\nBerkas: ${entry.fileName}\nTipe: ${getBackupTypeLabel(entry.backupType)}\nTujuan: ${dest}\nKelas: ${entry.assignmentsCount || 0}\nUkuran: ${formatFileSize(entry.fileSize)}\nWaktu: ${formatDateShort(entry.timestamp)}${entry.driveUploaded ? '\nStatus Drive: Tersimpan' : ''}`);
      }
    } else if (btn.classList.contains('btn-delete')) {
      if (confirm('Hapus riwayat ini?')) {
        deleteBackupHistory(id);
        btn.closest('[data-id]')?.remove();
        if (grid && !grid.querySelector('[data-id]')) {
          grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>
              <div><p class="text-sm font-bold text-slate-700">Belum ada riwayat backup</p><p class="mt-1 text-xs text-slate-500">Riwayat backup Anda akan muncul di sini setelah backup pertama.</p></div>
            </div>`;
        }
      }
    }
  });

  loadMoreBtn?.addEventListener('click', () => {
    const history = getBackupHistory();
    const cards = history.slice(20).map((h) => renderHistoryCard(h)).join('');
    grid.insertAdjacentHTML('beforeend', cards);
    loadMoreBtn.remove();
  });

  clearBtn?.addEventListener('click', () => {
    if (confirm('Hapus SEMUA riwayat backup? Tindakan ini tidak bisa dibatalkan.')) {
      clearBackupHistory();
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>
            <div><p class="text-sm font-bold text-slate-700">Belum ada riwayat backup</p><p class="mt-1 text-xs text-slate-500">Riwayat backup Anda akan muncul di sini setelah backup pertama.</p></div>
          </div>`;
      }
      loadMoreBtn?.remove();
    }
  });
}

function initSettingsActions(container) {
  // --- Google Drive ---
  const driveToggle = container.querySelector('#drive-upload-toggle');
  const driveBadge = container.querySelector('#drive-state-badge');
  const driveDetail = container.querySelector('#drive-state-detail');
  if (driveToggle) driveToggle.checked = isDriveUploadEnabled();
  driveToggle?.addEventListener('change', () => {
    setDriveUploadEnabled(driveToggle.checked);
    refreshDriveState();
  });

  const setBadge = (text, tone) => {
    if (!driveBadge) return;
    const tones = {
      ok: 'rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700',
      warn: 'rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700',
      off: 'rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500',
    };
    driveBadge.textContent = text;
    driveBadge.className = tones[tone] || tones.off;
  };

  async function refreshDriveState() {
    const openFolder = container.querySelector('#drive-open-folder');
    if (openFolder) openFolder.classList.add('hidden');
    if (!driveToggle?.checked) {
      setBadge('Nonaktif', 'off');
      if (driveDetail) driveDetail.textContent = 'Google Drive tidak dijadikan tujuan default. Anda tetap bisa memilih tujuan "Online" atau "Keduanya" saat backup.';
      return;
    }
    setBadge('Memeriksa...', 'off');
    if (driveDetail) driveDetail.textContent = 'Memeriksa koneksi Google Drive...';
    const status = await checkDriveStatus();
    if (status.available) {
      setBadge('Terhubung', 'ok');
      const akun = status.accountEmail ? ` (${status.accountEmail})` : '';
      if (driveDetail) driveDetail.textContent = `Aktif. Backup akan diunggah ke folder "${status.folderName || 'backup'}"${akun}.`;
      if (openFolder && status.folderLink) {
        openFolder.href = status.folderLink;
        openFolder.classList.remove('hidden');
      }
    } else {
      setBadge('Belum siap', 'warn');
      if (driveDetail) driveDetail.textContent = `${status.reason || 'Google Drive belum dikonfigurasi.'} Admin dapat mengatur di Pengaturan → Google Drive.`;
    }
  }

  refreshDriveState();

  container.querySelector('#btn-export-history')?.addEventListener('click', () => {
    const history = getBackupHistory();
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector('#btn-import-history')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            if (Array.isArray(data)) {
              localStorage.setItem('simguru_backup_history', JSON.stringify(data));
              alert(`Berhasil mengimpor ${data.length} riwayat backup.`);
              renderGuruBackupPage(container);
            } else {
              alert('Format file tidak valid.');
            }
          } catch {
            alert('File JSON tidak valid.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  });

  container.querySelector('#btn-clear-all-data')?.addEventListener('click', () => {
    if (confirm('HAPUS SEMUA DATA LOKAL?\n\nIni akan menghapus:\n- Riwayat backup\n- Timestamp backup terakhir\n- Pengaturan backup otomatis\n- Snooze reminder\n\nTindakan ini TIDAK DAPAT DIBATALKAN.')) {
      localStorage.removeItem('simguru_backup_history');
      localStorage.removeItem('simguru_backup_last_run');
      localStorage.removeItem('simguru_backup_snooze');
      localStorage.removeItem('simguru_backup_reminder_seen');
      localStorage.removeItem('auto_backup_friday');
      alert('Semua data lokal backup telah dihapus.');
      renderGuruBackupPage(container);
    }
  });
}