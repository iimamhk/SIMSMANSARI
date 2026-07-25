import { renderLayout } from '../../layouts/dashboard-layout.js';
import { showBackupReminder } from '../../utils/backup-reminder.js';
import {
  exportGuruBackupExcel,
  exportBackupMultiFormat,
  exportSelectiveBackupExcel,
  getLastBackupTimestamp,
  getDaysSinceLastBackup,
  isBackupRequiredToday,
  BACKUP_DATA_TYPES,
  EXPORT_FORMATS,
  RESTORE_TYPES,
  previewBackupFile,
  restoreFromBackup,
  buildGuruBackupWorkbook,
  getSession,
} from '../../utils/backup-excel.js';
import {
  getBackupHistory,
  getBackupStats,
  deleteBackupHistory,
  formatFileSize,
  formatDuration,
  getBackupTypeLabel,
  getBackupTypeBadgeClass,
  getFormatLabel,
  getFormatIcon,
  validateBackupFile,
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

let currentTab = 'backup';
let assignmentsCache = [];
let membersCache = {};
let isLoadingAssignments = false;

export async function renderGuruBackupPage(container) {
  const session = getSession();
  const userName = session?.user?.nama || 'Bapak/Ibu Guru';
  const last = getLastBackupTimestamp();
  const daysSince = getDaysSinceLastBackup();
  const required = isBackupRequiredToday();
  const isFriday = new Date().getDay() === 5;
  const history = getBackupHistory();
  const stats = getBackupStats();

  // Load assignments for selective backup
  await loadAssignmentsForSelectiveBackup();

  let statusCard = '';
  if (required) {
    statusCard = `
      <div class="relative overflow-hidden rounded-3xl border-2 ${isFriday ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-white' : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white'} p-5 shadow-sm">
        <div class="flex items-start gap-4">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${isFriday ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold text-slate-900">${isFriday ? 'Wajib Backup Hari Ini' : 'Backup Diperlukan'}</h2>
              <span class="rounded-full ${isFriday ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'} px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">${isFriday ? 'Jadwal Jumat' : `${daysSince} hari lalu`}</span>
            </div>
            <p class="mt-1 text-sm text-slate-600">${isFriday ? 'Hari Jumat adalah jadwal wajib backup data. Popup tidak dapat ditutup sampai backup selesai.' : `Sudah ${daysSince} hari sejak backup terakhir. Segera cadangkan data Anda.`}</p>
          </div>
        </div>
      </div>`;
  } else if (last) {
    statusCard = `
      <div class="relative overflow-hidden rounded-3xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
        <div class="flex items-start gap-4">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold text-slate-900">Data Aman</h2>
              <span class="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Terbackup</span>
            </div>
            <p class="mt-1 text-sm text-slate-600">Backup terakhir: <strong>${formatDateTimeDisplay(last.at)}</strong>. Disarankan backup rutin setiap minggu.</p>
          </div>
        </div>
      </div>`;
  } else {
    statusCard = `
      <div class="relative overflow-hidden rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
        <div class="flex items-start gap-4">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-bold text-slate-900">Belum Pernah Backup</h2>
            <p class="mt-1 text-sm text-slate-600">Mulai cadangkan data absensi & penilaian Anda untuk menghindari kehilangan data.</p>
          </div>
        </div>
      </div>`;
  }

  const statsCards = `
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Backup</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">${stats.totalBackups}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Ukuran</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">${formatFileSize(stats.totalSize)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rata-rata Ukuran</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">${formatFileSize(stats.avgSize)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Backup Terakhir</p>
        <p class="mt-1 text-sm font-semibold text-slate-900">${stats.lastBackup ? formatDateShort(stats.lastBackup) : 'Belum ada'}</p>
      </div>
    </div>`;

  const historyRows = history.length > 0 ? history.slice(0, 20).map((h) => `
    <tr class="hover:bg-slate-50 transition-colors" data-id="${h.id}">
      <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${formatDateShort(h.timestamp)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          ${getFormatIcon(h.format)}
          <span class="text-sm font-medium text-slate-900 truncate max-w-[200px]">${h.fileName}</span>
        </div>
      </td>
      <td class="px-4 py-3 whitespace-nowrap">
        <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getBackupTypeBadgeClass(h.backupType)}">${getBackupTypeLabel(h.backupType)}</span>
      </td>
      <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${h.assignmentsCount || 0} kelas</td>
      <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${h.totalStudents || 0} siswa</td>
      <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${formatFileSize(h.fileSize)}</td>
      <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${formatDuration(h.durationMs)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-1">
          <button class="btn-preview text-slate-500 hover:text-emerald-600 p-1.5 rounded" title="Preview" data-id="${h.id}"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
          <button class="btn-download text-slate-500 hover:text-sky-600 p-1.5 rounded" title="Unduh" data-id="${h.id}"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg></button>
          <button class="btn-delete text-slate-500 hover:text-rose-600 p-1.5 rounded" title="Hapus riwayat" data-id="${h.id}"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="8" class="px-4 py-12 text-center text-slate-400">
        <svg class="mx-auto h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <p class="mt-2 text-sm">Belum ada riwayat backup</p>
      </td>
    </tr>
  `;

  const restoreTypesHtml = Object.values(RESTORE_TYPES).map((rt) => `
    <label class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition cursor-pointer">
      <input type="checkbox" name="restoreTypes" value="${rt.key}" class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked>
      <div class="flex-1">
        <p class="font-medium text-slate-900">${rt.label}</p>
        <p class="text-xs text-slate-500">${rt.description}</p>
      </div>
      ${getFormatIcon('xlsx')}
    </label>
  `).join('');

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
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Cadangkan seluruh data absensi dan nilai per kelas yang Anda ajarkan. Mendukung backup selektif, multi-format (Excel/CSV/JSON), riwayat lengkap, dan restore data.</p>
        </div>
      </section>

      ${statusCard}

      ${statsCards}

      <!-- Tab Navigation -->
      <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <nav class="flex border-b border-slate-200" id="backup-tabs">
          <button data-tab="backup" class="tab-btn flex-1 px-4 py-3 text-sm font-semibold text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50">Backup</button>
          <button data-tab="history" class="tab-btn flex-1 px-4 py-3 text-sm font-semibold text-slate-500 hover:text-slate-700">Riwayat</button>
          <button data-tab="restore" class="tab-btn flex-1 px-4 py-3 text-sm font-semibold text-slate-500 hover:text-slate-700">Restore</button>
          <button data-tab="settings" class="tab-btn flex-1 px-4 py-3 text-sm font-semibold text-slate-500 hover:text-slate-700">Pengaturan</button>
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
              <h4 class="font-bold text-amber-800">Pilih Tipe Data</h4>
              <p class="mt-1 text-sm text-amber-700">Centang tipe data yang ingin diekspor</p>
              <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" id="data-type-checkboxes">
                ${Object.values(BACKUP_DATA_TYPES).map((dt) => `
                  <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" name="dataType" value="${dt.key}" class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked>
                    <span class="font-medium text-slate-900">${dt.icon} ${dt.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </section>

          <!-- Format Selection -->
          <section class="mb-6">
            <h3 class="mb-3 text-lg font-bold text-slate-900">Format Ekspor</h3>
            <div class="flex flex-wrap gap-3" id="format-options">
              ${Object.values(EXPORT_FORMATS).map((f) => `
                <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition">
                  <input type="radio" name="exportFormat" value="${f.key}" class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" ${f.key === 'xlsx' ? 'checked' : ''}>
                  <span class="font-medium text-slate-900">${getFormatIcon(f.key)} ${f.label}</span>
                </label>
              `).join('')}
            </div>
          </section>

          <!-- Action Buttons -->
          <section>
            <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 class="text-lg font-bold text-slate-900" id="backup-action-title">Mulai Backup Sekarang</h3>
                  <p class="mt-1 text-sm text-slate-500" id="backup-action-desc">Klik tombol di bawah untuk mengunduh seluruh data Anda dalam format Excel (.xlsx).</p>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row">
                  <button id="btn-preview-backup" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    Preview
                  </button>
                  <button id="btn-start-backup" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-95">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                    Backup Data
                  </button>
                </div>
              </div>

              <div id="backup-progress-box" class="hidden mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <div class="flex items-center gap-3">
                  <svg class="h-5 w-5 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                  <p id="backup-progress-text" class="text-sm font-medium text-slate-600">Memulai backup...</p>
                </div>
                <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div id="backup-progress-bar" class="h-full w-0 bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"></div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- TAB: HISTORY -->
        <div id="tab-history" class="tab-panel hidden p-5 sm:p-6">
          <section class="mb-6">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 class="text-lg font-bold text-slate-900">Riwayat Backup</h3>
              <div class="flex items-center gap-2">
                <button id="btn-clear-history" class="text-sm font-medium text-rose-600 hover:text-rose-700">Hapus Semua Riwayat</button>
              </div>
            </div>
            <p class="mt-1 text-sm text-slate-500">Menampilkan ${history.length} riwayat backup terakhir (maksimal 50).</p>
          </section>
          <section>
            <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-slate-50">
                    <tr>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tanggal</th>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">File</th>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tipe</th>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Kelas</th>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Siswa</th>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ukuran</th>
                      <th class="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Durasi</th>
                      <th class="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Aksi</th>
                    </tr>
                  </thead>
                  <tbody id="history-tbody">
                    ${historyRows}
                  </tbody>
                </table>
              </div>
              ${history.length > 20 ? `
                <div class="border-t border-slate-200 px-4 py-3 text-center">
                  <button id="btn-load-more-history" class="text-sm font-medium text-emerald-600 hover:text-emerald-700">Tampilkan ${history.length - 20} lebih...</button>
                </div>
              ` : ''}
            </div>
          </section>
        </div>

        <!-- TAB: RESTORE -->
        <div id="tab-restore" class="tab-panel hidden p-5 sm:p-6">
          <section class="mb-6">
            <h3 class="mb-2 text-lg font-bold text-slate-900">Restore Data dari File Backup</h3>
            <p class="text-sm text-slate-500">Unggah file backup Excel (.xlsx) untuk memulihkan data ke Firebase. Pilih tipe data yang ingin direstore.</p>
          </section>
          <section class="mb-6">
            <div class="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-emerald-400 hover:bg-emerald-50 transition" id="restore-dropzone">
              <input type="file" id="restore-file-input" accept=".xlsx,.xls" class="hidden">
              <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              <p class="mt-3 text-sm font-medium text-slate-700">Seret & lepas file Excel di sini, atau klik untuk memilih</p>
              <p class="mt-1 text-xs text-slate-500">Format: .xlsx (backup dari SIM SMANSARI)</p>
            </div>
            <div id="restore-file-info" class="hidden mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  ${getFormatIcon('xlsx')}
                  <div>
                    <p class="font-medium text-emerald-800" id="restore-file-name"></p>
                    <p class="text-sm text-emerald-700" id="restore-file-details"></p>
                  </div>
                </div>
                <button id="btn-remove-restore-file" class="text-emerald-600 hover:text-emerald-800">Hapus</button>
              </div>
            </div>
          </section>
          <section class="mb-6" id="restore-options" style="display: none;">
            <h4 class="mb-3 font-bold text-slate-900">Pilih Tipe Data untuk Restore</h4>
            <div class="space-y-2" id="restore-type-checkboxes">
              ${restoreTypesHtml}
            </div>
            <p class="mt-3 text-sm text-amber-700"><strong>Peringatan:</strong> Restore akan menimpa data yang ada di Firebase untuk tipe data yang dipilih. Pastikan Anda memiliki backup terbaru sebelum melanjutkan.</p>
          </section>
          <section>
            <button id="btn-start-restore" type="button" disabled class="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-300 px-6 py-3 text-sm font-bold text-slate-500 cursor-not-allowed">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7"/><path d="M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3"/></svg>
              Mulai Restore
            </button>
            <div id="restore-progress-box" class="hidden mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div class="flex items-center gap-3">
                <svg class="h-5 w-5 animate-spin text-sky-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                <p id="restore-progress-text" class="text-sm font-medium text-slate-600">Memulai restore...</p>
              </div>
              <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div id="restore-progress-bar" class="h-full w-0 bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"></div>
              </div>
            </div>
          </section>
        </div>

        <!-- TAB: SETTINGS -->
        <div id="tab-settings" class="tab-panel hidden p-5 sm:p-6 space-y-6">
          <section>
            <h3 class="mb-4 text-lg font-bold text-slate-900">Pengaturan Backup Otomatis</h3>
            <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <label class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-slate-900">Backup Otomatis Setiap Jumat</p>
                  <p class="text-sm text-slate-500">Otomatis menjalankan backup penuh setiap Jumat jam 15:00</p>
                </div>
                <input type="checkbox" id="auto-backup-friday" class="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" ${localStorage.getItem('auto_backup_friday') === 'true' ? 'checked' : ''}>
              </label>
              <label class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-slate-900">Notifikasi Email Backup</p>
                  <p class="text-sm text-slate-500">Kirim notifikasi email setelah backup selesai (memerlukan konfigurasi server)</p>
                </div>
                <input type="checkbox" id="email-notification" class="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" disabled>
              </label>
              <label class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-slate-900">Simpan Riwayat Backup</p>
                  <p class="text-sm text-slate-500">Menyimpan metadata riwayat backup di browser (localStorage)</p>
                </div>
                <input type="checkbox" id="save-history" class="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked disabled>
              </label>
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
  initBackupActions(container);
  initHistoryActions(container);
  initRestoreActions(container);
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
        t.classList.remove('text-emerald-600', 'border-emerald-500', 'bg-emerald-50');
        t.classList.add('text-slate-500');
      });
      tab.classList.add('text-emerald-600', 'border-emerald-500', 'bg-emerald-50');
      tab.classList.remove('text-slate-500');

      panels.forEach((p) => {
        if (p.id === `tab-${tabName}`) {
          p.classList.remove('hidden');
        } else {
          p.classList.add('hidden');
        }
      });

      currentTab = tabName;

      if (tabName === 'history') {
        renderClassCheckboxes(container);
      }
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
        renderClassCheckboxes(container);
      } else {
        selectiveOptions.classList.add('hidden');
      }
      updateBackupActionText(container, mode);
    });
  });

  // Refresh button for selective backup class list
  container.querySelector('#btn-refresh-classes')?.addEventListener('click', () => {
    renderClassCheckboxes(container);
  });
}

function updateBackupActionText(container, mode) {
  const titleEl = container.querySelector('#backup-action-title');
  const descEl = container.querySelector('#backup-action-desc');

  if (mode === 'selective') {
    titleEl.textContent = 'Backup Selektif';
    descEl.textContent = 'Pilih kelas dan tipe data di atas, lalu klik tombol backup untuk mengunduh data terpilih.';
  } else {
    titleEl.textContent = 'Mulai Backup Sekarang';
    descEl.textContent = 'Klik tombol di bawah untuk mengunduh seluruh data Anda dalam format Excel (.xlsx).';
  }
}

function initBackupActions(container) {
  const startBtn = container.querySelector('#btn-start-backup');
  const previewBtn = container.querySelector('#btn-preview-backup');
  const progressBox = container.querySelector('#backup-progress-box');
  const progressText = container.querySelector('#backup-progress-text');
  const progressBar = container.querySelector('#backup-progress-bar');

  const updateProgress = (text, percent) => {
    if (progressBox) progressBox.classList.remove('hidden');
    if (progressText) progressText.textContent = text;
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  };

  const runBackup = async (isPreview = false) => {
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }
    if (previewBtn) {
      previewBtn.disabled = true;
      previewBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    try {
      const mode = container.querySelector('input[name="backupMode"]:checked')?.value || 'full';
      const format = container.querySelector('input[name="exportFormat"]:checked')?.value || 'xlsx';
      const dataTypes = Array.from(container.querySelectorAll('input[name="dataType"]:checked')).map((cb) => cb.value);
      const selectedAssignments = Array.from(container.querySelectorAll('input[name="assignment"]:checked')).map((cb) => cb.value)
        .map((id) => assignmentsCache.find((a) => a.id === id))
        .filter(Boolean);

      updateProgress('Memeriksa data pengajaran...', 10);

      let result;
      if (mode === 'full') {
        result = await exportGuruBackupExcel((p) => {
          const pct = 20 + Math.floor((p.current / Math.max(p.total, 1)) * 70);
          updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
        });
      } else if (mode === 'selective') {
        if (!selectedAssignments.length) {
          alert('Pilih minimal satu kelas untuk backup selektif.');
          return;
        }
        if (!dataTypes.length) {
          alert('Pilih minimal satu tipe data untuk backup selektif.');
          return;
        }
        const context = (await import('../../utils/helpers.js')).getStoredContext();
        const session = getSession();
        const userId = session?.user?.username || context?.user_logged_in || '';
        const userName = session?.user?.nama || 'Guru';
        result = await exportSelectiveBackupExcel(context, userId, userName, selectedAssignments, dataTypes, (p) => {
          const pct = 20 + Math.floor((p.current / Math.max(p.total, 1)) * 70);
          updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
        });
      }

      if (format !== 'xlsx') {
        const { getStoredContext } = await import('../../utils/helpers.js');
        const { getSession: getSessionUtil } = await import('../../utils/backup-excel.js');
        const context = getStoredContext();
        const session = getSessionUtil();
        const userId = session?.user?.username || context?.user_logged_in || '';
        const userName = session?.user?.nama || 'Guru';

        const workbook = mode === 'full'
          ? await buildGuruBackupWorkbook(context, userId, userName, (p) => {
              const pct = 20 + Math.floor((p.current / Math.max(p.total, 1)) * 70);
              updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
            })
          : await (await import('../../utils/backup-excel.js')).buildSelectiveBackupWorkbook(context, userId, userName, selectedAssignments, dataTypes, (p) => {
              const pct = 20 + Math.floor((p.current / Math.max(p.total, 1)) * 70);
              updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
            });

        updateProgress('Mengonversi format...', 95);
        const { exportBackupMultiFormat } = await import('../../utils/backup-excel.js');
        await exportBackupMultiFormat(workbook, format);
      }

      updateProgress('Selesai!', 100);

      if (!isPreview) {
        setTimeout(() => {
          renderGuruBackupPage(container);
        }, 800);
      } else {
        if (progressBox) progressBox.classList.add('hidden');
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
        if (previewBtn) {
          previewBtn.disabled = false;
          previewBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
        alert('Preview backup selesai! File telah diunduh.');
      }
    } catch (err) {
      console.error('Backup error:', err);
      if (progressBox) progressBox.classList.add('hidden');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
      alert(`Backup gagal: ${err?.message || 'Terjadi kesalahan.'}`);
    }
  };

  startBtn?.addEventListener('click', () => runBackup(false));
  previewBtn?.addEventListener('click', () => runBackup(true));
}

function initHistoryActions(container) {
  const tbody = container.querySelector('#history-tbody');
  const loadMoreBtn = container.querySelector('#btn-load-more-history');
  const clearBtn = container.querySelector('#btn-clear-history');

  tbody?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('btn-preview')) {
      const entry = getBackupHistoryById(id);
      if (entry) alert(`Preview: ${entry.fileName}\nTipe: ${getBackupTypeLabel(entry.backupType)}\nKelas: ${entry.assignmentsCount}\nSiswa: ${entry.totalStudents}\nUkuran: ${formatFileSize(entry.fileSize)}`);
    } else if (btn.classList.contains('btn-download')) {
      // Note: Cannot re-download from localStorage, would need to re-generate
      alert('Fitur unduh ulang memerlukan regenerasi backup. Silakan buat backup baru.');
    } else if (btn.classList.contains('btn-delete')) {
      if (confirm('Hapus riwayat ini?')) {
        deleteBackupHistory(id);
        btn.closest('tr')?.remove();
      }
    }
  });

  loadMoreBtn?.addEventListener('click', () => {
    const history = getBackupHistory();
    const rows = history.slice(20).map((h) => `
      <tr class="hover:bg-slate-50 transition-colors" data-id="${h.id}">
        <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${formatDateShort(h.timestamp)}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            ${getFormatIcon(h.format)}
            <span class="text-sm font-medium text-slate-900 truncate max-w-[200px]">${h.fileName}</span>
          </div>
        </td>
        <td class="px-4 py-3 whitespace-nowrap"><span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getBackupTypeBadgeClass(h.backupType)}">${getBackupTypeLabel(h.backupType)}</span></td>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${h.assignmentsCount || 0} kelas</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${h.totalStudents || 0} siswa</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${formatFileSize(h.fileSize)}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${formatDuration(h.durationMs)}</td>
        <td class="px-4 py-3"><div class="flex items-center justify-end gap-1"><button class="btn-preview text-slate-500 hover:text-emerald-600 p-1.5 rounded" title="Preview" data-id="${h.id}"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button><button class="btn-delete text-slate-500 hover:text-rose-600 p-1.5 rounded" title="Hapus riwayat" data-id="${h.id}"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button></div></td>
      </tr>
    `).join('');
    tbody.insertAdjacentHTML('beforeend', rows);
    loadMoreBtn.remove();
  });

  clearBtn?.addEventListener('click', () => {
    if (confirm('Hapus SEMUA riwayat backup? Tindakan ini tidak bisa dibatalkan.')) {
      clearBackupHistory();
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-12 text-center text-slate-400">
            <svg class="mx-auto h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <p class="mt-2 text-sm">Belum ada riwayat backup</p>
          </td>
        </tr>
      `;
    }
  });
}

function initRestoreActions(container) {
  const dropzone = container.querySelector('#restore-dropzone');
  const fileInput = container.querySelector('#restore-file-input');
  const fileInfo = container.querySelector('#restore-file-info');
  const fileNameEl = container.querySelector('#restore-file-name');
  const fileDetailsEl = container.querySelector('#restore-file-details');
  const removeBtn = container.querySelector('#btn-remove-restore-file');
  const restoreOptions = container.querySelector('#restore-options');
  const startBtn = container.querySelector('#btn-start-restore');
  const progressBox = container.querySelector('#restore-progress-box');
  const progressText = container.querySelector('#restore-progress-text');
  const progressBar = container.querySelector('#restore-progress-bar');

  let selectedFile = null;

  const updateProgress = (text, percent) => {
    if (progressBox) progressBox.classList.remove('hidden');
    if (progressText) progressText.textContent = text;
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  };

  dropzone?.addEventListener('click', () => fileInput.click());
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-emerald-400', 'bg-emerald-50');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('border-emerald-400', 'bg-emerald-50'));
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-emerald-400', 'bg-emerald-50');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });
  removeBtn?.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    dropzone.classList.remove('hidden');
    restoreOptions.style.display = 'none';
    startBtn.disabled = true;
    startBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
    startBtn.classList.remove('bg-gradient-to-r', 'from-sky-500', 'to-emerald-500', 'text-white');
  });

  async function handleFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Format file tidak didukung. Gunakan .xlsx atau .xls');
      return;
    }

    updateProgress('Memvalidasi file...', 10);
    const validation = await validateBackupFile(file);
    if (!validation.valid) {
      alert('File tidak valid atau rusak.');
      return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileDetailsEl.textContent = `${validation.sheetCount} sheet, ${validation.totalRows} baris total, ${formatFileSize(validation.fileSize)}`;
    dropzone.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    restoreOptions.style.display = 'block';
    startBtn.disabled = false;
    startBtn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
    startBtn.classList.add('bg-gradient-to-r', 'from-sky-500', 'to-emerald-500', 'text-white');
  }

  startBtn?.addEventListener('click', async () => {
    if (!selectedFile) return;

    const restoreTypes = Array.from(container.querySelectorAll('input[name="restoreTypes"]:checked')).map((cb) => cb.value);
    if (!restoreTypes.length) {
      alert('Pilih minimal satu tipe data untuk direstore.');
      return;
    }

    if (!confirm(`Restore akan menimpa data di Firebase untuk: ${restoreTypes.join(', ')}. Lanjutkan?`)) return;

    startBtn.disabled = true;
    startBtn.classList.add('opacity-60', 'cursor-not-allowed');

    try {
      updateProgress('Memuat file backup...', 10);
      const { restoreFromBackup } = await import('../../utils/backup-excel.js');
      const result = await restoreFromBackup(selectedFile, restoreTypes, (p) => {
        const pct = 20 + Math.floor((p.current / Math.max(p.total, 1)) * 70);
        updateProgress(`${p.label} (${p.current}/${p.total})...`, pct);
      });
      updateProgress('Restore selesai!', 100);
      setTimeout(() => {
        alert(`Restore berhasil!\n${result.summary}`);
        renderGuruBackupPage(container);
      }, 500);
    } catch (err) {
      console.error('Restore error:', err);
      updateProgress('Restore gagal', 0);
      progressBox.classList.add('hidden');
      startBtn.disabled = false;
      startBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      alert(`Restore gagal: ${err?.message || 'Terjadi kesalahan.'}`);
    }
  });
}

function initSettingsActions(container) {
  const autoBackupFriday = container.querySelector('#auto-backup-friday');
  autoBackupFriday?.addEventListener('change', () => {
    localStorage.setItem('auto_backup_friday', autoBackupFriday.checked);
  });

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

function getBackupHistoryById(id) {
  const history = getBackupHistory();
  return history.find((h) => h.id === id) || null;
}