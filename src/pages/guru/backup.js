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
// 1. Hanya ekspor Excel. Pilihan CSV dan JSON dibuang karena keluarannya rusak
//    namun tetap dilaporkan berhasil.
// 2. Maksimal 3 ekspor per minggu per guru; aturannya di utils/backup-policy.js.
// 3. Hanya data milik sendiri: daftar kelas berasal dari
//    getTeachingAssignmentsForUser dan diverifikasi ulang sebelum ekspor jalan.
// ---------------------------------------------------------------------------

const MODE_ACTIVE_CLASS = 'ring-2 ring-offset-2 ring-offset-white shadow-xl';

const DEST_ACTIVE_CLASS = 'ring-2 ring-offset-2 ring-offset-white shadow-xl';

const HISTORY_LIGHTS = [
  {
    card: 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50 shadow-cyan-100/80 hover:border-cyan-300 hover:shadow-cyan-200/80',
    icon: 'bg-cyan-100 text-cyan-700',
  },
  {
    card: 'border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 shadow-violet-100/80 hover:border-violet-300 hover:shadow-violet-200/80',
    icon: 'bg-violet-100 text-violet-700',
  },
  {
    card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 shadow-amber-100/80 hover:border-amber-300 hover:shadow-amber-200/80',
    icon: 'bg-amber-100 text-amber-700',
  },
  {
    card: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-lime-50 shadow-emerald-100/80 hover:border-emerald-300 hover:shadow-emerald-200/80',
    icon: 'bg-emerald-100 text-emerald-700',
  },
];

function toggleClassString(element, classes, enabled) {
  String(classes || '').split(/\s+/).filter(Boolean).forEach((className) => {
    element.classList.toggle(className, enabled);
  });
}

function renderHistoryCard(h, index = 0) {
  const light = HISTORY_LIGHTS[index % HISTORY_LIGHTS.length];
  const dest = getDestinationMeta(h.destination || 'local', h.driveUploaded);
  const typeLabel = getBackupTypeLabel(h.backupType);
  const typeBadge = getBackupTypeBadgeClass(h.backupType);
  const meta = [];
  if (h.assignmentsCount) meta.push(`${h.assignmentsCount} kelas`);
  if (h.totalStudents) meta.push(`${h.totalStudents} siswa`);
  meta.push(formatFileSize(h.fileSize));
  if (h.durationMs) meta.push(formatDuration(h.durationMs));

  const driveBtn = h.driveUploaded && (h.driveWebViewLink || h.driveFolderLink)
    ? `<a href="${escapeHtml(h.driveWebViewLink || h.driveFolderLink)}" target="_blank" rel="noopener" class="rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 shadow-sm shadow-sky-100 transition hover:-translate-y-0.5 hover:from-sky-100 hover:to-cyan-100 hover:shadow-sky-200">Drive</a>`
    : '';

  return `
    <div class="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${light.card}" data-id="${h.id}">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 flex-none items-center justify-center rounded-xl shadow-inner ${light.icon}">
          ${getFormatIcon(h.format)}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-900" title="${escapeHtml(h.fileName)}">${escapeHtml(h.fileName)}</p>
          <p class="mt-0.5 text-xs text-slate-500">${formatDateShort(h.timestamp)}</p>
        </div>
        <button class="btn-delete flex-none rounded-lg bg-gradient-to-br from-rose-50 to-red-100 p-1.5 text-rose-500 shadow-sm shadow-rose-100 transition hover:-translate-y-0.5 hover:from-rose-100 hover:to-red-200 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 sm:opacity-0 sm:group-hover:opacity-100" title="Hapus riwayat" aria-label="Hapus riwayat" data-id="${h.id}">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeBadge}">${typeLabel}</span>
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${dest.badge}">${dest.icon}${dest.label}</span>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p class="text-xs text-slate-500">${meta.join(' • ')}</p>
        <div class="flex items-center gap-1.5">
          ${driveBtn}
          <button class="btn-preview inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 shadow-sm shadow-violet-100 transition hover:-translate-y-0.5 hover:from-violet-100 hover:to-fuchsia-100 hover:shadow-violet-200" data-id="${h.id}">
            Detail
          </button>
        </div>
      </div>
    </div>
  `;
}

// Satu sumber untuk keadaan kosong: sebelumnya markup yang sama ditulis ulang di
// tiga tempat dengan kalimat yang berbeda-beda.
const EMPTY_HISTORY_HTML = `
  <div class="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
    <p class="text-sm font-semibold text-slate-700">Belum ada riwayat ekspor</p>
    <p class="mt-1 text-xs text-slate-500">Riwayat muncul setelah ekspor pertama dan hanya tersimpan di perangkat ini.</p>
  </div>`;

let assignmentsCache = [];
let assignmentsLoaded = false;
let isLoadingAssignments = false;

export async function renderGuruBackupPage(container) {
  const history = getBackupHistory();
  const stats = getBackupStats();
  const policy = getExportStatus();

  // Daftar kelas TIDAK dimuat di sini. Dulu `loadAssignmentsForSelectiveBackup()`
  // dipanggil setiap kali halaman dibuka, sehingga membuka tab Riwayat pun ikut
  // menembak query Firestore. Sekarang daftar hanya dimuat ketika guru benar-benar
  // memilih mode "Selektif" (lihat initBackupModeToggle).

  const BADGE = {
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    warn: 'bg-amber-50 text-amber-700 ring-amber-100',
    info: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  const badgeClass = BADGE[policy.badgeTone] || BADGE.info;

  // Satu kartu ringkas menggantikan hero + kartu status + empat kartu statistik +
  // esai kuota. Angka yang dibutuhkan guru muncul sekaligus, tanpa mendorong
  // tombol ekspor jauh ke bawah layar.
  const summary = [
    ['Kuota minggu ini', `${policy.quotaText}${policy.remaining > 0 ? ` · sisa ${policy.remaining}` : ''}`],
    ['Ekspor tersimpan', String(stats.totalBackups)],
    ['Total ukuran', formatFileSize(stats.totalSize)],
    ['Terakhir', stats.lastBackup ? formatDateShort(stats.lastBackup) : 'Belum ada'],
  ];

  const statusCard = `
    <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-slate-900 sm:text-lg">${escapeHtml(policy.title)}</h2>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-500">${escapeHtml(policy.detail)}</p>
        </div>
        <span class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${badgeClass}">${escapeHtml(policy.badgeLabel)}</span>
      </div>
      <dl class="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
        ${summary.map(([label, value]) => `
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-400">${label}</dt>
            <dd class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(value)}</dd>
          </div>`).join('')}
      </dl>
      <p class="mt-4 text-xs leading-5 text-slate-500">Batas ${policy.limit} ekspor per minggu menjaga kuota baca database yang dipakai bersama seluruh pengguna. Cadangan seluruh sekolah tetap dibuat server setiap Minggu dini hari.</p>
    </section>`;

  const historyCards = history.length > 0
    ? history.slice(0, 20).map((h, index) => renderHistoryCard(h, index)).join('')
    : EMPTY_HISTORY_HTML;

  const pageHtml = `
    <div class="space-y-4">
      ${statusCard}

      <div class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <nav class="flex gap-5 overflow-x-auto border-b border-slate-100 px-4 sm:px-5" id="backup-tabs" role="tablist">
          <button data-tab="backup" data-active-class="border-emerald-500 text-emerald-700" data-inactive-class="border-transparent text-slate-500 hover:text-emerald-700" role="tab" aria-selected="true" aria-controls="tab-backup" class="tab-btn -mb-px whitespace-nowrap border-b-2 border-emerald-500 px-1 py-3 text-sm font-semibold text-emerald-700 transition">Ekspor</button>
          <button data-tab="history" data-active-class="border-violet-500 text-violet-700" data-inactive-class="border-transparent text-slate-500 hover:text-violet-700" role="tab" aria-selected="false" aria-controls="tab-history" class="tab-btn -mb-px whitespace-nowrap border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-slate-500 transition hover:text-violet-700">Riwayat</button>
          <button data-tab="settings" data-active-class="border-amber-500 text-amber-700" data-inactive-class="border-transparent text-slate-500 hover:text-amber-700" role="tab" aria-selected="false" aria-controls="tab-settings" class="tab-btn -mb-px whitespace-nowrap border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-slate-500 transition hover:text-amber-700">Pengaturan</button>
        </nav>

        <!-- TAB: EKSPOR -->
        <div id="tab-backup" class="tab-panel p-4 sm:p-5" role="tabpanel">
          <section>
            <h3 class="text-sm font-semibold text-slate-900">Cakupan data</h3>
            <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label id="mode-full" data-active-class="${MODE_ACTIVE_CLASS} ring-emerald-300" class="mode-btn cursor-pointer rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-3.5 shadow-sm shadow-emerald-100/80 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-200/80 ${MODE_ACTIVE_CLASS} ring-emerald-300">
                <input type="radio" name="backupMode" value="full" class="sr-only" checked>
                <p class="text-sm font-semibold text-slate-900">Semua kelas</p>
                <p class="mt-1 text-xs leading-5 text-slate-500">Seluruh kelas yang Anda ampu, dengan semua jenis data.</p>
              </label>
              <label id="mode-selective" data-active-class="${MODE_ACTIVE_CLASS} ring-violet-300" class="mode-btn cursor-pointer rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 p-3.5 shadow-sm shadow-violet-100/80 transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-200/80">
                <input type="radio" name="backupMode" value="selective" class="sr-only">
                <p class="text-sm font-semibold text-slate-900">Pilih sendiri</p>
                <p class="mt-1 text-xs leading-5 text-slate-500">Tentukan kelas dan jenis data yang diperlukan saja.</p>
              </label>
            </div>
          </section>

          <section id="selective-options" class="mt-5 hidden space-y-4">
            <div class="rounded-xl border border-slate-200 p-3.5">
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-slate-900">Kelas</h4>
                <button id="btn-refresh-classes" type="button" class="rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 px-2 py-1 text-xs font-semibold text-cyan-700 shadow-sm shadow-cyan-100 transition hover:-translate-y-0.5 hover:from-cyan-100 hover:to-sky-100 hover:shadow-cyan-200">Muat ulang</button>
              </div>
              <div id="class-checkboxes" class="mt-3 grid max-h-60 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
                <p class="col-span-full py-4 text-center text-sm text-slate-500">Memuat daftar kelas...</p>
              </div>
            </div>
            <div class="rounded-xl border border-slate-200 p-3.5">
              <h4 class="text-sm font-semibold text-slate-900">Jenis data</h4>
              <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" id="data-type-checkboxes">
                ${Object.values(BACKUP_DATA_TYPES).map((dt) => `
                  <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-blue-100 bg-gradient-to-br from-white via-blue-50/70 to-indigo-50 p-3 shadow-sm shadow-blue-100/70 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-blue-200/80">
                    <input type="checkbox" name="dataType" value="${dt.key}" class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked>
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-slate-900">${escapeHtml(dt.label)}</span>
                      <span class="mt-0.5 block text-xs leading-4 text-slate-500">${escapeHtml(dt.description || '')}</span>
                    </span>
                  </label>
                `).join('')}
              </div>
            </div>
          </section>

          <section class="mt-5">
            <h3 class="text-sm font-semibold text-slate-900">Tujuan berkas</h3>
            <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3" id="destination-options">
              <label data-active-class="${DEST_ACTIVE_CLASS} ring-amber-300" class="dest-opt relative cursor-pointer rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-3.5 shadow-sm shadow-amber-100/80 transition duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-200/80 ${DEST_ACTIVE_CLASS} ring-amber-300">
                <span class="dest-check absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm shadow-amber-200 transition"><svg viewBox="0 0 24 24" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
                <input type="radio" name="backupDestination" value="local" class="sr-only" checked>
                <p class="pr-6 text-sm font-semibold text-slate-900">Perangkat ini</p>
                <p class="mt-1 text-xs leading-5 text-slate-500">Berkas Excel langsung diunduh.</p>
              </label>
              <label data-active-class="${DEST_ACTIVE_CLASS} ring-sky-300" class="dest-opt relative cursor-pointer rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 p-3.5 shadow-sm shadow-sky-100/80 transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-200/80">
                <span class="dest-check absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-white opacity-0 shadow-sm shadow-sky-200 transition"><svg viewBox="0 0 24 24" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
                <input type="radio" name="backupDestination" value="drive" class="sr-only">
                <p class="pr-6 text-sm font-semibold text-slate-900">Google Drive</p>
                <p class="mt-1 text-xs leading-5 text-slate-500">Diunggah ke Drive sekolah.</p>
              </label>
              <label data-active-class="${DEST_ACTIVE_CLASS} ring-fuchsia-300" class="dest-opt relative cursor-pointer rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-pink-50 to-rose-50 p-3.5 shadow-sm shadow-fuchsia-100/80 transition duration-200 hover:-translate-y-0.5 hover:border-fuchsia-300 hover:shadow-lg hover:shadow-fuchsia-200/80">
                <span class="dest-check absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-fuchsia-500 text-white opacity-0 shadow-sm shadow-fuchsia-200 transition"><svg viewBox="0 0 24 24" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
                <input type="radio" name="backupDestination" value="both" class="sr-only">
                <p class="pr-6 text-sm font-semibold text-slate-900">Keduanya</p>
                <p class="mt-1 text-xs leading-5 text-slate-500">Diunduh sekaligus diunggah.</p>
              </label>
            </div>
            <div id="drive-inline-status" class="mt-3 hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"></div>
            <p id="destination-hint" class="sr-only"></p>
          </section>

          <section class="mt-5 border-t border-slate-100 pt-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-900" id="backup-action-title">Siap diekspor</p>
                <p class="mt-1 text-xs leading-5 text-slate-500" id="backup-action-desc">Tersedia ${policy.limit} ekspor per minggu.</p>
              </div>
              <button id="btn-start-backup" type="button" class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/80 transition hover:-translate-y-0.5 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 hover:shadow-cyan-300/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200">
                <span id="btn-start-backup-label">Ekspor Sekarang</span>
              </button>
            </div>

            <div id="backup-progress-box" class="mt-4 hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex items-center gap-3">
                <svg class="h-4 w-4 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                <p id="backup-progress-text" class="text-sm text-slate-600">Memulai ekspor...</p>
              </div>
              <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div id="backup-progress-bar" class="h-full w-0 bg-emerald-600 transition-all duration-300"></div>
              </div>
            </div>

            <div id="backup-success-box" class="mt-4 hidden rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p class="text-sm font-semibold text-emerald-900">Ekspor selesai</p>
              <p id="backup-success-text" class="mt-1 text-xs leading-5 text-emerald-800"></p>
              <a id="backup-success-drive" href="#" target="_blank" rel="noopener" class="mt-3 hidden inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-gradient-to-r from-white to-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm shadow-emerald-100 transition hover:-translate-y-0.5 hover:from-emerald-50 hover:to-teal-100 hover:shadow-emerald-200">
                Buka folder Google Drive
              </a>
            </div>
          </section>
        </div>

        <!-- TAB: RIWAYAT -->
        <div id="tab-history" class="tab-panel hidden p-4 sm:p-5" role="tabpanel">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-sm font-semibold text-slate-900">Riwayat ekspor</h3>
              <p class="mt-1 text-xs text-slate-500">${history.length} dari maksimal 50 entri, tersimpan di perangkat ini.</p>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-open-drive-folder" type="button" class="hidden rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 text-xs font-semibold text-sky-700 shadow-sm shadow-sky-100 transition hover:-translate-y-0.5 hover:from-sky-100 hover:to-cyan-100 hover:shadow-sky-200">Folder Drive</button>
              <button id="btn-clear-history" type="button" class="rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm shadow-rose-100 transition hover:-translate-y-0.5 hover:from-rose-100 hover:to-red-100 hover:shadow-rose-200">Hapus semua</button>
            </div>
          </div>
          <div id="history-grid" class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            ${historyCards}
          </div>
          ${history.length > 20 ? `
            <div class="mt-4 text-center">
              <button id="btn-load-more-history" type="button" class="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm shadow-amber-100 transition hover:-translate-y-0.5 hover:from-amber-100 hover:to-orange-100 hover:shadow-amber-200">Tampilkan ${history.length - 20} lainnya</button>
            </div>
          ` : ''}
        </div>

        <!-- TAB: PENGATURAN -->
        <div id="tab-settings" class="tab-panel hidden space-y-6 p-4 sm:p-5" role="tabpanel">
          <section>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-slate-900">Google Drive</h3>
              <span id="drive-state-badge" class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">Memeriksa...</span>
            </div>
            <div class="mt-3 space-y-3 rounded-xl border border-slate-200 p-3.5">
              <label class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-slate-900">Jadikan Drive tujuan default</p>
                  <p class="mt-1 text-xs leading-5 text-slate-500">Pilihan "Keduanya" akan terpilih otomatis saat ekspor.</p>
                </div>
                <input type="checkbox" id="drive-upload-toggle" class="mt-0.5 h-5 w-5 flex-none rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">
              </label>
              <p id="drive-state-detail" class="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Memeriksa koneksi Google Drive...</p>
              <a id="drive-open-folder" href="#" target="_blank" rel="noopener" class="hidden inline-flex items-center rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 text-xs font-semibold text-sky-700 shadow-sm shadow-sky-100 transition hover:-translate-y-0.5 hover:from-sky-100 hover:to-cyan-100 hover:shadow-sky-200">
                Buka folder Drive
              </a>
            </div>
          </section>
          <section>
            <h3 class="text-sm font-semibold text-slate-900">Cadangan otomatis sekolah</h3>
            <p class="mt-2 text-xs leading-5 text-slate-500">Server membuat cadangan seluruh data sekolah setiap Minggu dini hari, jadi tidak ada jadwal yang perlu diatur di sini. Ekspor di halaman ini hanya untuk salinan pribadi Anda.</p>
          </section>
          <section>
            <h3 class="text-sm font-semibold text-slate-900">Data lokal</h3>
            <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button id="btn-export-history" type="button" class="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50 p-3.5 text-left shadow-sm shadow-indigo-100 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-200/80">
                <p class="text-sm font-medium text-indigo-900">Ekspor riwayat</p>
                <p class="mt-1 text-xs text-slate-500">Unduh sebagai JSON</p>
              </button>
              <button id="btn-import-history" type="button" class="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 via-emerald-50 to-lime-50 p-3.5 text-left shadow-sm shadow-teal-100 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-200/80">
                <p class="text-sm font-medium text-teal-900">Impor riwayat</p>
                <p class="mt-1 text-xs text-slate-500">Pulihkan dari JSON</p>
              </button>
              <button id="btn-clear-all-data" type="button" class="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 via-red-50 to-orange-50 p-3.5 text-left shadow-sm shadow-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-lg hover:shadow-rose-200/80">
                <p class="text-sm font-medium text-rose-700">Hapus data lokal</p>
                <p class="mt-1 text-xs text-slate-500">Riwayat & penanda ekspor</p>
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
    assignmentsLoaded = true;
    isLoadingAssignments = false;
  }
}

function renderClassCheckboxes(container) {
  const checkboxesContainer = container.querySelector('#class-checkboxes');
  if (!checkboxesContainer) return;

  if (!assignmentsCache.length) {
    // Penanda "sudah pernah dicoba" mencegah pemuatan berulang tanpa henti bila
    // guru memang tidak punya kelas: sebelumnya setiap render memicu query baru.
    if (!assignmentsLoaded && !isLoadingAssignments) {
      checkboxesContainer.innerHTML = '<p class="col-span-full py-6 text-center text-sm text-slate-500">Memuat daftar kelas...</p>';
      loadAssignmentsForSelectiveBackup().then(() => renderClassCheckboxes(container));
      return;
    }
    checkboxesContainer.innerHTML = isLoadingAssignments
      ? '<p class="col-span-full py-6 text-center text-sm text-slate-500">Memuat daftar kelas...</p>'
      : '<p class="col-span-full py-6 text-center text-sm text-slate-500">Tidak ada kelas yang dapat diekspor.</p>';
    return;
  }

  checkboxesContainer.innerHTML = assignmentsCache.map((a) => `
    <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-teal-100 bg-gradient-to-br from-white via-teal-50/70 to-emerald-50 p-3 shadow-sm shadow-teal-100/70 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-teal-200/80">
      <input type="checkbox" name="assignment" value="${escapeHtml(a.id)}" class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-slate-900">${escapeHtml(a.kelas_nama || a.kelas_id)}</span>
        <span class="block truncate text-xs text-slate-500">${escapeHtml(a.mapel_nama || 'Mapel')}</span>
      </span>
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
        const active = t === tab;
        toggleClassString(t, t.dataset.activeClass, active);
        toggleClassString(t, t.dataset.inactiveClass, !active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      panels.forEach((p) => {
        if (p.id === `tab-${tabName}`) {
          p.classList.remove('hidden');
        } else {
          p.classList.add('hidden');
        }
      });
    });
  });
}

function initBackupModeToggle(container) {
  const modeBtns = container.querySelectorAll('.mode-btn');
  const selectiveOptions = container.querySelector('#selective-options');

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => {
        toggleClassString(b, b.dataset.activeClass, false);
        b.querySelector('input').checked = false;
      });
      toggleClassString(btn, btn.dataset.activeClass, true);
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

  // Tombol muat ulang daftar kelas untuk ekspor pilihan sendiri.
  container.querySelector('#btn-refresh-classes')?.addEventListener('click', () => {
    assignmentsCache = [];
    assignmentsLoaded = false;
    loadAssignmentsForSelectiveBackup().then(() => renderClassCheckboxes(container));
  });
}

function updateBackupActionText(container, mode) {
  const titleEl = container.querySelector('#backup-action-title');
  const descEl = container.querySelector('#backup-action-desc');

  if (titleEl) titleEl.textContent = mode === 'selective' ? 'Ekspor pilihan Anda' : 'Ekspor semua kelas';
  if (descEl) {
    descEl.textContent = mode === 'selective'
      ? 'Pastikan kelas dan jenis data sudah dicentang.'
      : 'Seluruh kelas yang Anda ampu ikut diekspor.';
  }
}

// Pilihan tujuan berkas: sorot kartu terpilih, label tombol, dan status Drive.
function initDestinationToggle(container) {
  const destOpts = Array.from(container.querySelectorAll('.dest-opt'));
  const hint = container.querySelector('#destination-hint');
  const startLabel = container.querySelector('#btn-start-backup-label');

  const HINTS = {
    local: 'Berkas diunduh ke perangkat ini.',
    drive: 'Berkas diunggah ke Google Drive sekolah.',
    both: 'Berkas diunduh sekaligus diunggah ke Google Drive.',
  };
  const LABELS = { local: 'Unduh Excel', drive: 'Unggah ke Drive', both: 'Unduh + Unggah' };
  const inlineStatus = container.querySelector('#drive-inline-status');

  const apply = (value) => {
    destOpts.forEach((opt) => {
      const input = opt.querySelector('input');
      const isActive = input.value === value;
      input.checked = isActive;
      toggleClassString(opt, opt.dataset.activeClass, isActive);
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
        inlineStatus.innerHTML = '<span>Memeriksa koneksi Google Drive...</span>';
        checkDriveStatus().then((status) => {
          if (status.available) {
            const akun = status.accountEmail ? ` · ${escapeHtml(status.accountEmail)}` : '';
            const folderBtn = status.folderLink
              ? ` <a href="${escapeHtml(status.folderLink)}" target="_blank" rel="noopener" class="font-semibold text-emerald-700 underline underline-offset-2">Buka folder</a>`
              : '';
            inlineStatus.innerHTML = `<span>Drive terhubung ke folder <strong>${escapeHtml(status.folderName || 'backup')}</strong>${akun}.${folderBtn}</span>`;
          } else {
            inlineStatus.innerHTML = `<span class="text-amber-700">${escapeHtml(status.reason || 'Google Drive belum siap.')} Hubungi admin untuk mengaturnya.</span>`;
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

  // Keadaan tombol ekspor mengikuti sisa kuota: guru perlu tahu sisanya, bukan
  // hanya tahu bahwa tombolnya terkunci.
  const policy = getExportStatus();
  const labelEl = container.querySelector('#btn-start-backup-label');
  const titleEl = container.querySelector('#backup-action-title');
  const descEl = container.querySelector('#backup-action-desc');

  if (!policy.allowed && startBtn) {
    startBtn.disabled = true;
    startBtn.classList.remove('bg-gradient-to-r', 'from-emerald-500', 'via-teal-500', 'to-cyan-500', 'text-white', 'shadow-lg', 'shadow-emerald-200/80', 'hover:-translate-y-0.5', 'hover:from-emerald-600', 'hover:via-teal-600', 'hover:to-cyan-600', 'hover:shadow-cyan-300/80');
    startBtn.classList.add('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
    if (labelEl) labelEl.textContent = 'Kuota penuh';
    startBtn.title = `Kuota terisi kembali pada ${policy.nextAvailableText}.`;
    if (titleEl) titleEl.textContent = `Kuota minggu ini penuh (${policy.quotaText})`;
    if (descEl) descEl.textContent = `Terisi kembali pada ${policy.nextAvailableText}. Berkas lama tetap tersedia di tab Riwayat.`;
  } else if (policy.used > 0) {
    if (titleEl) titleEl.textContent = `Ekspor ke-${policy.used + 1} dari ${policy.limit} minggu ini`;
    if (descEl) descEl.textContent = `Sisa ${policy.remaining} ekspor untuk minggu ini.`;
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
      alert(`Kuota ekspor minggu ini sudah terpakai (${current.quotaText}).\n\n${current.detail}`);
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

      // Konfirmasi sekali, dengan cakupan dan sisa kuota dinyatakan terbuka.
      const jumlahKelas = mode === 'selective' ? selectedAssignments.length : assignmentsCache.length;
      const biaya = describeReadCost(jumlahKelas);
      const tujuanTeks = destination === 'local'
        ? 'diunduh ke perangkat ini'
        : destination === 'drive'
          ? 'diunggah ke Google Drive sekolah'
          : 'diunduh dan diunggah ke Google Drive';
      const konfirmasi = [
        'Jalankan ekspor Excel sekarang?',
        '',
        `Cakupan : ${mode === 'selective' ? 'kelas terpilih' : 'semua kelas Anda'}${biaya ? ` (${biaya})` : ''}`,
        `Hasil   : ${tujuanTeks}`,
        `Kuota   : ekspor ke-${current.used + 1} dari ${current.limit} minggu ini`,
      ].filter(Boolean).join('\n');
      if (!confirm(konfirmasi)) return;

      // Bila tujuan menyertakan Drive, pastikan Drive siap SEBELUM membaca data,
      // supaya kuota baca tidak terpakai untuk ekspor yang pasti gagal diunggah.
      if (destination === 'drive' || destination === 'both') {
        updateProgress('Memeriksa koneksi Google Drive...', 6);
        const status = await checkDriveStatus();
        if (!status.available) {
          if (progressBox) progressBox.classList.add('hidden');
          alert(`Google Drive belum siap: ${status.reason || 'belum dikonfigurasi admin.'}\n\nKuota ekspor Anda belum terpakai. Coba lagi nanti atau pilih tujuan "Perangkat ini".`);
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

      updateProgress('Selesai', 100);

      const drive = result?.drive || {};
      const driveFolderLink = drive.folderLink || drive.webViewLink || '';
      let doneMsg = '';
      if (destination === 'local') doneMsg = 'Berkas Excel sudah diunduh. Sheet "Petunjuk" di dalamnya menjelaskan cara melanjutkan pekerjaan.';
      else if (destination === 'drive') {
        doneMsg = drive.uploaded ? 'Berkas Excel tersimpan di Google Drive sekolah.' : `Gagal unggah ke Drive: ${drive.reason || 'terjadi kesalahan.'}`;
      } else {
        doneMsg = drive.uploaded
          ? 'Berkas Excel diunduh ke perangkat dan tersimpan di Google Drive.'
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
        alert(`Detail ekspor\n\nBerkas: ${entry.fileName}\nJenis: ${getBackupTypeLabel(entry.backupType)}\nTujuan: ${dest}\nKelas: ${entry.assignmentsCount || 0}\nUkuran: ${formatFileSize(entry.fileSize)}\nWaktu: ${formatDateShort(entry.timestamp)}`);
      }
    } else if (btn.classList.contains('btn-delete')) {
      if (confirm('Hapus riwayat ini?')) {
        deleteBackupHistory(id);
        btn.closest('[data-id]')?.remove();
        if (grid && !grid.querySelector('[data-id]')) grid.innerHTML = EMPTY_HISTORY_HTML;
      }
    }
  });

  loadMoreBtn?.addEventListener('click', () => {
    const history = getBackupHistory();
    const cards = history.slice(20).map((h, index) => renderHistoryCard(h, index + 20)).join('');
    grid.insertAdjacentHTML('beforeend', cards);
    loadMoreBtn.remove();
  });

  clearBtn?.addEventListener('click', () => {
    if (confirm('Hapus seluruh riwayat ekspor di perangkat ini? Tindakan ini tidak bisa dibatalkan.')) {
      clearBackupHistory();
      if (grid) grid.innerHTML = EMPTY_HISTORY_HTML;
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
    const base = 'rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1';
    const tones = {
      ok: `${base} bg-emerald-50 text-emerald-700 ring-emerald-100`,
      warn: `${base} bg-amber-50 text-amber-700 ring-amber-100`,
      off: `${base} bg-slate-100 text-slate-500 ring-slate-200`,
    };
    driveBadge.textContent = text;
    driveBadge.className = tones[tone] || tones.off;
  };

  async function refreshDriveState() {
    const openFolder = container.querySelector('#drive-open-folder');
    if (openFolder) openFolder.classList.add('hidden');
    if (!driveToggle?.checked) {
      setBadge('Nonaktif', 'off');
      if (driveDetail) driveDetail.textContent = 'Drive tidak dijadikan tujuan default. Anda tetap bisa memilihnya saat ekspor.';
      return;
    }
    setBadge('Memeriksa...', 'off');
    if (driveDetail) driveDetail.textContent = 'Memeriksa koneksi Google Drive...';
    const status = await checkDriveStatus();
    if (status.available) {
      setBadge('Terhubung', 'ok');
      const akun = status.accountEmail ? ` (${status.accountEmail})` : '';
      if (driveDetail) driveDetail.textContent = `Berkas diunggah ke folder "${status.folderName || 'backup'}"${akun}.`;
      if (openFolder && status.folderLink) {
        openFolder.href = status.folderLink;
        openFolder.classList.remove('hidden');
      }
    } else {
      setBadge('Belum siap', 'warn');
      if (driveDetail) driveDetail.textContent = `${status.reason || 'Google Drive belum dikonfigurasi.'} Hubungi admin untuk mengaturnya.`;
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
    if (confirm('Hapus data lokal backup?\n\nRiwayat ekspor, penanda ekspor terakhir, dan penundaan pengingat akan dihapus dari perangkat ini. Tidak dapat dibatalkan.')) {
      localStorage.removeItem('simguru_backup_history');
      localStorage.removeItem('simguru_backup_last_run');
      localStorage.removeItem('simguru_backup_snooze');
      localStorage.removeItem('simguru_backup_reminder_seen');
      localStorage.removeItem('auto_backup_friday');
      renderGuruBackupPage(container);
    }
  });
}
