// ============================================================================
// backup-reminder.js
// Popup peringatan backup data bertahap untuk guru.
//
// Aturan:
//  - Setiap hari Jumat: popup TIDAK BISA di-close sampai guru selesai backup.
//    (close button hidden; hanya tombol "Backup Sekarang" yang memenuhi syarat)
//  - Hari lain: peringatan bertahap berdasarkan hari sejak backup terakhir:
//      >= 3 hari  : info ringan (bisa di-tutup / snooze)
//      >= 5 hari  : peringatan (bisa di-tutup / snooze)
//      >= 7 hari  : peringatan kuat (bisa di-tutup, tapi tidak bisa snooze lagi hari ini)
//      >= 14 hari : peringatan kritis (bisa di-tutup tapi reminder muncul lagi besok)
//  - Snooze menunda popup hingga akhir hari (disimpan per-hari di localStorage).
//  - Catatan backup (timestamp) disimpan di localStorage key simguru_backup_last_run.
// ============================================================================

import { getDaysSinceLastBackup, getLastBackupTimestamp, isBackupRequiredToday } from './backup-excel.js';
import { getBackupReminder } from '../firebase/auth-service.js';

const SNOOZE_KEY = 'simguru_backup_snooze';
const REMINDER_SEEN_KEY = 'simguru_backup_reminder_seen';
const ADMIN_REMINDER_CACHE_KEY = 'simguru_admin_reminder_cache';
const ADMIN_REMINDER_FETCH_KEY = 'simguru_admin_reminder_fetch';
const ADMIN_PUSH_SENT_KEY = 'simguru_admin_reminder_push_day';
const ADMIN_FETCH_TTL_MS = 6 * 60 * 60 * 1000;

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function isGuru() {
  return getSession()?.user?.role === 'guru';
}

function isFriday() {
  return new Date().getDay() === 5;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getSnooze() {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null');
  } catch {
    return null;
  }
}

function setSnooze(days = 0) {
  // Snooze sampai akhir hari ini (atau +N hari jika diberi)
  const target = new Date();
  target.setHours(23, 59, 0, 0);
  target.setDate(target.getDate() + days);
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ until: target.toISOString() }));
  } catch { /* ignore */ }
}

function isSnoozed() {
  const s = getSnooze();
  if (!s?.until) return false;
  return new Date(s.until).getTime() > Date.now();
}

function markReminderSeenToday() {
  try {
    localStorage.setItem(REMINDER_SEEN_KEY, JSON.stringify({ day: todayKey() }));
  } catch { /* ignore */ }
}

function hasSeenReminderToday() {
  try {
    const v = JSON.parse(localStorage.getItem(REMINDER_SEEN_KEY) || 'null');
    return v?.day === todayKey();
  } catch {
    return false;
  }
}

function getFridayState() {
  // Status backup khusus hari Jumat: true jika sudah backup hari ini
  const last = getLastBackupTimestamp();
  if (!last?.at) return false;
  const lastDate = new Date(last.at);
  const today = new Date();
  return lastDate.getFullYear() === today.getFullYear()
    && lastDate.getMonth() === today.getMonth()
    && lastDate.getDate() === today.getDate();
}

function getReminderLevel() {
  // Prioritas 1: pengingat terjadwal dari admin (harian/mingguan/custom).
  if (isAdminReminderDueToday() && !getFridayState()) {
    return { level: 'admin', title: 'Pengingat Backup Data', tone: 'warning' };
  }
  if (isFriday() && !getFridayState()) {
    return { level: 'friday', title: 'Wajib Backup Data — Hari Jumat', tone: 'critical' };
  }
  const days = getDaysSinceLastBackup();
  if (days >= 14) return { level: 'critical', title: 'Backup Data Mendesak!', tone: 'critical' };
  if (days >= 7) return { level: 'strong', title: 'Sudah 7+ Hari Tanpa Backup', tone: 'warning' };
  if (days >= 5) return { level: 'medium', title: 'Saatnya Backup Data', tone: 'warning' };
  if (days >= 3) return { level: 'info', title: 'Pengingat Backup Data', tone: 'info' };
  return null;
}

// --- Pengingat terjadwal admin ---------------------------------------------

function getCachedAdminReminder() {
  try {
    const raw = localStorage.getItem(ADMIN_REMINDER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Apakah hari & (opsional) frekuensi pengingat admin jatuh tempo hari ini. */
function isAdminReminderDueToday() {
  const reminder = getCachedAdminReminder();
  if (!reminder || reminder.enabled !== true) return false;
  const today = new Date().getDay(); // 0=Minggu..6=Sabtu
  if (reminder.frequency === 'daily') return true;
  const days = Array.isArray(reminder.days) ? reminder.days.map(Number) : [];
  return days.includes(today);
}

/**
 * Ambil pengaturan pengingat dari server (throttle 6 jam), simpan di cache lokal.
 * Bila push diizinkan & hari ini jatuh tempo, kirim satu notifikasi browser/hari.
 */
async function refreshAdminReminder() {
  if (!isGuru()) return;
  let lastFetch = 0;
  try { lastFetch = Number(localStorage.getItem(ADMIN_REMINDER_FETCH_KEY) || 0); } catch { /* abaikan */ }
  if (Date.now() - lastFetch < ADMIN_FETCH_TTL_MS) return;
  try { localStorage.setItem(ADMIN_REMINDER_FETCH_KEY, String(Date.now())); } catch { /* abaikan */ }

  const reminder = await getBackupReminder();
  if (!reminder) return;
  try { localStorage.setItem(ADMIN_REMINDER_CACHE_KEY, JSON.stringify(reminder)); } catch { /* abaikan */ }

  maybeSendPushNotification(reminder);
}

function maybeSendPushNotification(reminder) {
  if (!reminder?.enabled || !reminder.push) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!isAdminReminderDueToday() || getFridayState()) return;
  // Satu push per hari.
  try {
    const sent = JSON.parse(localStorage.getItem(ADMIN_PUSH_SENT_KEY) || 'null');
    if (sent?.day === todayKey()) return;
  } catch { /* abaikan */ }
  try {
    new Notification('Pengingat Backup Data — SIM SMANSARI', {
      body: 'Waktunya backup data absensi & nilai. Unduh ke perangkat dan unggah ke Google Drive dari menu Backup.',
      tag: 'simguru-backup-reminder',
    });
    localStorage.setItem(ADMIN_PUSH_SENT_KEY, JSON.stringify({ day: todayKey() }));
  } catch { /* abaikan */ }
}

function shouldShowReminder() {
  if (!isGuru()) return false;
  if (isSnoozed()) return false;
  const level = getReminderLevel();
  if (!level) return false;
  // Jumat: selalu muncul (tidak peduli seen) selama belum backup hari ini
  if (level.level === 'friday') return !getFridayState();
  // Pengingat terjadwal admin: tampilkan sekali per hari (kecuali sudah backup hari ini)
  if (level.level === 'admin') return !getFridayState() && !hasSeenReminderToday();
  // Hari lain: tampilkan sekali per hari, atau jika level >= strong (muncul lagi)
  if (level.level === 'critical' || level.level === 'strong') {
    return true;
  }
  return !hasSeenReminderToday();
}

const TONE_STYLES = {
  critical: {
    overlay: 'bg-rose-950/60',
    panel: 'border-rose-300 bg-white',
    iconWrap: 'bg-rose-100 text-rose-600',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    accent: 'bg-rose-600 hover:bg-rose-700',
    msg: 'text-rose-700',
  },
  warning: {
    overlay: 'bg-amber-950/50',
    panel: 'border-amber-300 bg-white',
    iconWrap: 'bg-amber-100 text-amber-600',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    accent: 'bg-amber-600 hover:bg-amber-700',
    msg: 'text-amber-700',
  },
  info: {
    overlay: 'bg-sky-950/45',
    panel: 'border-sky-300 bg-white',
    iconWrap: 'bg-sky-100 text-sky-600',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    accent: 'bg-sky-600 hover:bg-sky-700',
    msg: 'text-sky-700',
  },
};

function getMessages(level) {
  const last = getLastBackupTimestamp();
  const lastText = last?.at
    ? new Date(last.at).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })
    : 'belum pernah';
  const days = getDaysSinceLastBackup();

  switch (level) {
    case 'admin':
      return {
        badge: 'PENGINGAT TERJADWAL',
        body: `Sesuai jadwal dari admin, saatnya mencadangkan data absensi & penilaian Anda.<br/><br/>Anda dapat <strong>mengunduh ke perangkat</strong> (lokal) dan/atau <strong>mengunggah ke Google Drive</strong> (online).<br/><br/>Backup terakhir: ${lastText}.`,
        primaryLabel: 'Unduh ke Perangkat',
        secondary: 'Ingatkan Nanti',
        closable: true,
        showDrive: true,
      };
    case 'friday':
      return {
        badge: 'WAJIB HARI INI',
        body: `Hari Jumat adalah jadwal wajib backup data absensi & penilaian Anda. Popup ini <strong>tidak dapat ditutup</strong> sampai Anda menyelesaikan backup.<br/><br/>Anda dapat mengunduh ke perangkat (lokal) dan mengunggah ke Google Drive (online).<br/><br/>Backup terakhir: ${lastText}.`,
        primaryLabel: 'Unduh ke Perangkat (Wajib)',
        secondary: null,
        closable: false,
        showDrive: true,
      };
    case 'critical':
      return {
        badge: 'KRITIS',
        body: `Sudah <strong>${days} hari</strong> sejak backup terakhir (${lastText}). Risiko kehilangan data sangat tinggi jika terjadi gangguan Firebase. Segera lakukan backup ke perangkat dan/atau Google Drive.`,
        primaryLabel: 'Unduh ke Perangkat',
        secondary: 'Ingatkan Besok',
        closable: true,
        showDrive: true,
      };
    case 'strong':
      return {
        badge: 'PENTING',
        body: `Sudah <strong>${days} hari</strong> tanpa backup. Lindungi data absensi & nilai Anda: unduh ke perangkat dan/atau unggah ke Google Drive.`,
        primaryLabel: 'Unduh ke Perangkat',
        secondary: 'Tutup',
        closable: true,
        showDrive: true,
      };
    case 'medium':
      return {
        badge: 'PENGINGAT',
        body: `Sudah <strong>${days} hari</strong> sejak backup terakhir (${lastText}). Disarankan backup ke perangkat dan/atau Google Drive.`,
        primaryLabel: 'Unduh ke Perangkat',
        secondary: 'Ingatkan Nanti',
        closable: true,
        showDrive: true,
      };
    case 'info':
    default:
      return {
        badge: 'INFO',
        body: `Backup terakhir: ${lastText}. Rutin mencadangkan data absensi & penilaian ke perangkat dan Google Drive menjaga data tetap aman.`,
        primaryLabel: 'Unduh ke Perangkat',
        secondary: 'Ingatkan Nanti',
        closable: true,
        showDrive: true,
      };
  }
}

function buildBackupModalHTML(level, messages, tone) {
  const fridayLock = level === 'friday';
  const closeBtn = messages.closable
    ? `<button id="backup-remind-close" type="button" class="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>`
    : `<div class="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 ring-1 ring-rose-200">
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        Terkunci
       </div>`;

  const secondaryBtn = messages.secondary
    ? `<button id="backup-remind-secondary" type="button" class="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto">${messages.secondary}</button>`
    : '';

  return `
    <div id="backup-reminder-overlay" class="fixed inset-0 z-[100] flex items-center justify-center p-4 ${tone.overlay} backdrop-blur-sm">
      <div class="relative w-full max-w-md rounded-3xl border-2 ${tone.panel} p-6 shadow-2xl sm:p-7 animate-[fadeIn_0.2s_ease-out]">
        ${closeBtn}
        <div class="flex flex-col items-center text-center">
          <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${tone.iconWrap}">
            <svg viewBox="0 0 24 24" class="h-9 w-9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <path d="M7 10l5 5 5-5"/>
              <path d="M12 15V3"/>
            </svg>
          </div>
          <span class="mb-3 inline-flex items-center rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${tone.badge}">${messages.badge}</span>
          <h3 class="text-lg font-bold text-slate-900 sm:text-xl">${getReminderLevel().title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">${messages.body}</p>

          <div id="backup-progress-box" class="hidden mt-4 w-full rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-100">
            <div class="flex items-center gap-2">
              <svg class="h-4 w-4 animate-spin text-slate-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
              <p id="backup-progress-text" class="text-xs font-medium text-slate-600">Memulai backup...</p>
            </div>
            <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div id="backup-progress-bar" class="h-full w-0 bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"></div>
            </div>
          </div>

          <div class="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <button id="backup-remind-primary" type="button" class="inline-flex w-full items-center justify-center gap-2 rounded-xl ${tone.accent} px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition sm:w-auto">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              ${messages.primaryLabel}
            </button>
            ${messages.showDrive ? `<button id="backup-remind-drive" type="button" class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 sm:w-auto">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M20 16.5A3.5 3.5 0 0016.5 13H16a5 5 0 10-9.9 1.2A3 3 0 006 20h12a3 3 0 002-3.5z"/></svg>
              Unggah ke Drive
            </button>` : ''}
            ${secondaryBtn}
          </div>

          ${fridayLock ? `<p class="mt-4 text-[11px] text-slate-400">Popup ini terkunci setiap hari Jumat sampai backup berhasil diunduh.</p>` : ''}
        </div>
      </div>
      <style>@keyframes fadeIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}</style>
    </div>
  `;
}

function closeModal() {
  const overlay = document.getElementById('backup-reminder-overlay');
  if (overlay) overlay.remove();
}

function updateProgress(text, percent) {
  const box = document.getElementById('backup-progress-box');
  const txt = document.getElementById('backup-progress-text');
  const bar = document.getElementById('backup-progress-bar');
  if (box) box.classList.remove('hidden');
  if (txt) txt.textContent = text;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function showSuccess(fileName, viaDrive = false) {
  const overlay = document.getElementById('backup-reminder-overlay');
  if (!overlay) return;
  const panel = overlay.querySelector('.relative');
  if (!panel) return;
  const detail = viaDrive
    ? `File <strong>${fileName}</strong> telah diunggah ke Google Drive sekolah.`
    : `File <strong>${fileName}</strong> telah diunduh ke komputer Anda.`;
  const note = viaDrive
    ? 'Data Anda kini tersimpan aman di cloud sekolah.'
    : 'Simpan file ini di tempat yang aman (flashdisk / cloud gratis seperti Google Drive pribadi).';
  panel.innerHTML = `
    <div class="flex flex-col items-center text-center py-2">
      <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
        <svg viewBox="0 0 24 24" class="h-9 w-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h3 class="text-lg font-bold text-slate-900">Backup Berhasil!</h3>
      <p class="mt-2 text-sm text-slate-600">${detail}</p>
      <p class="mt-1 text-xs text-slate-400">${note}</p>
      <button id="backup-remind-done" type="button" class="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">Selesai</button>
    </div>
  `;
  document.getElementById('backup-remind-done')?.addEventListener('click', closeModal);
}

function showError(message) {
  const overlay = document.getElementById('backup-reminder-overlay');
  if (!overlay) return;
  const panel = overlay.querySelector('.relative');
  if (!panel) return;
  panel.innerHTML = `
    <div class="flex flex-col items-center text-center py-2">
      <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
        <svg viewBox="0 0 24 24" class="h-9 w-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
      </div>
      <h3 class="text-lg font-bold text-slate-900">Backup Gagal</h3>
      <p class="mt-2 text-sm text-slate-600">${message}</p>
      <button id="backup-remind-retry" type="button" class="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">Coba Lagi</button>
    </div>
  `;
  document.getElementById('backup-remind-retry')?.addEventListener('click', () => {
    closeModal();
    showBackupReminder(true);
  });
}

async function runBackup(level) {
  const primary = document.getElementById('backup-remind-primary');
  const secondary = document.getElementById('backup-remind-secondary');
  const driveBtn = document.getElementById('backup-remind-drive');
  if (primary) primary.disabled = true;
  if (secondary) secondary.disabled = true;
  if (driveBtn) driveBtn.disabled = true;

  try {
    updateProgress('Memeriksa data pengajaran...', 10);
    const { exportGuruBackupExcel } = await import('./backup-excel.js');
    updateProgress('Mengumpulkan data absensi & nilai...', 30);
    const result = await exportGuruBackupExcel((p) => {
      const pct = 30 + Math.floor((p.current / Math.max(p.total, 1)) * 65);
      updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
    });
    updateProgress('Menyusun file Excel...', 100);
    showSuccess(result.fileName, false);
    markReminderSeenToday();
  } catch (err) {
    console.error('Backup error:', err);
    showError(err?.message || 'Terjadi kesalahan saat backup.');
  } finally {
    if (primary) primary.disabled = false;
    if (secondary) secondary.disabled = false;
    if (driveBtn) driveBtn.disabled = false;
  }
}

/** Backup langsung ke Google Drive dari popup pengingat (tanpa unduh lokal). */
async function runDriveBackup() {
  const primary = document.getElementById('backup-remind-primary');
  const secondary = document.getElementById('backup-remind-secondary');
  const driveBtn = document.getElementById('backup-remind-drive');
  if (primary) primary.disabled = true;
  if (secondary) secondary.disabled = true;
  if (driveBtn) driveBtn.disabled = true;

  try {
    updateProgress('Memeriksa koneksi Google Drive...', 10);
    const { checkDriveStatus, uploadBackupToDrive } = await import('./drive-upload.js');
    const status = await checkDriveStatus();
    if (!status.available) {
      showError(`Google Drive belum siap: ${status.reason || 'belum dikonfigurasi admin.'}`);
      return;
    }
    const { buildGuruBackupWorkbook, getSession: getSessionUtil } = await import('./backup-excel.js');
    const { getStoredContext } = await import('./helpers.js');
    const context = getStoredContext();
    const session = getSessionUtil();
    const userId = session?.user?.username || context?.user_logged_in || '';
    const userName = session?.user?.nama || 'Guru';

    updateProgress('Mengumpulkan data absensi & nilai...', 30);
    const workbook = await buildGuruBackupWorkbook(context, userId, userName, (p) => {
      const pct = 30 + Math.floor((p.current / Math.max(p.total, 1)) * 55);
      updateProgress(`Memproses ${p.label} (${p.current}/${p.total})...`, pct);
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = String(userName).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
    const fileName = `Backup-SIMSMANSARI-${safeName}-${dateStr}.xlsx`;
    updateProgress('Menyusun file Excel...', 88);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    updateProgress('Mengunggah ke Google Drive...', 94);
    const result = await uploadBackupToDrive(blob, fileName, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      force: true,
      logType: 'guru',
    });
    if (!result.uploaded) {
      showError(`Gagal mengunggah ke Drive: ${result.reason || 'terjadi kesalahan.'}`);
      return;
    }
    updateProgress('Selesai!', 100);
    showSuccess(result.fileName || fileName, true);
    markReminderSeenToday();
  } catch (err) {
    console.error('Backup Drive error:', err);
    showError(err?.message || 'Terjadi kesalahan saat unggah ke Drive.');
  } finally {
    if (primary) primary.disabled = false;
    if (secondary) secondary.disabled = false;
    if (driveBtn) driveBtn.disabled = false;
  }
}

export function showBackupReminder(force = false) {
  if (document.getElementById('backup-reminder-overlay')) return;
  if (!force && !shouldShowReminder()) return;

  const reminder = getReminderLevel();
  if (!reminder) return;
  const messages = getMessages(reminder.level);
  const tone = TONE_STYLES[reminder.tone] || TONE_STYLES.info;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildBackupModalHTML(reminder.level, messages, tone);
  document.body.appendChild(wrapper.firstElementChild);

  // Tombol backup utama (unduh lokal)
  document.getElementById('backup-remind-primary')?.addEventListener('click', () => runBackup(reminder.level));
  // Tombol unggah ke Drive
  document.getElementById('backup-remind-drive')?.addEventListener('click', () => runDriveBackup());

  // Tombol tutup (hanya jika closable)
  if (messages.closable) {
    document.getElementById('backup-remind-close')?.addEventListener('click', () => {
      markReminderSeenToday();
      closeModal();
    });
    document.getElementById('backup-remind-secondary')?.addEventListener('click', (e) => {
      const label = String(e.target.textContent || '').toLowerCase();
      if (label.includes('besok')) {
        // snooze sampai besok
        setSnooze(1);
      } else if (label.includes('nanti')) {
        // snooze sampai akhir hari ini
        setSnooze(0);
      }
      markReminderSeenToday();
      closeModal();
    });
  }
}

// Cek & tampilkan reminder otomatis (dipanggil dari router setelah render).
// Ada delay kecil agar tidak bertabrakan dengan render halaman.
export function maybeShowBackupReminder() {
  if (!isGuru()) return;
  // Hindari muncul di halaman login
  const hash = window.location.hash || '';
  if (hash === '#login' || hash === '#home' || hash === '') return;
  // Segarkan pengaturan pengingat admin di latar belakang (throttle internal),
  // lalu tampilkan popup memakai cache terbaru.
  refreshAdminReminder().finally(() => {
    setTimeout(() => {
      try {
        showBackupReminder(false);
      } catch (e) {
        console.warn('Backup reminder gagal ditampilkan:', e);
      }
    }, 1200);
  });
}
