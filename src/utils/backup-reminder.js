// ============================================================================
// backup-reminder.js
// Pengingat ekspor data untuk guru.
//
// ATURAN (mengikuti kebijakan satu ekspor per minggu)
// --------------------------------------------------
//  - Muncul paling banyak SEKALI PER HARI, dan hanya bila guru belum mengekspor
//    pada minggu kalender yang sedang berjalan.
//  - Selalu dapat ditutup. Tidak ada lagi popup terkunci pada hari Jumat.
//  - Tidak ada lagi eskalasi 3/5/7/14 hari. Ukurannya cukup satu: sudah ekspor
//    minggu ini atau belum.
//
// MENGAPA PEMAKSAAN HARI JUMAT DIBUANG
// ------------------------------------
// Popup Jumat yang tidak bisa ditutup mendorong SELURUH guru mengekspor pada hari
// yang sama. Karena satu ekspor membaca ribuan dokumen, hari Jumat menjadi puncak
// pemakaian kuota baca Firestore, justru pada hari kerja tersibuk. Bila kuota
// harian habis, seluruh aplikasi berhenti dapat membaca data.
//
// Pengingat ini kini bersifat mengajak, bukan memaksa, dan boleh dikerjakan kapan
// saja dalam minggu itu sehingga bebannya tersebar.
// ============================================================================

import { getExportStatus, hasExportedThisWeek } from './backup-policy.js';
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

/** Kuota ekspor minggu ini sudah dipakai, jadi tidak perlu diingatkan lagi. */
function alreadyDone() {
  return hasExportedThisWeek();
}

function getReminderLevel() {
  if (alreadyDone()) return null;
  // Pengingat terjadwal admin diberi nada lebih tegas, sisanya bernada ajakan.
  if (isAdminReminderDueToday()) {
    return { level: 'admin', title: 'Pengingat Ekspor Data Mingguan', tone: 'warning' };
  }
  return { level: 'weekly', title: 'Belum Ekspor Data Minggu Ini', tone: 'info' };
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
  if (!isAdminReminderDueToday() || alreadyDone()) return;
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
  if (alreadyDone()) return false;
  const level = getReminderLevel();
  if (!level) return false;
  // Satu kali per hari untuk semua tingkat. Guru hanya punya satu kesempatan
  // ekspor per minggu, jadi mengingatkan lebih dari sekali sehari tidak menambah
  // manfaat dan hanya mengganggu.
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
  const status = getExportStatus();
  const lastText = status.lastAt
    ? new Date(status.lastAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })
    : 'belum pernah';

  const alasan = 'Berkas Excel ini dapat Bapak/Ibu buka dan lanjutkan sendiri bila aplikasi sedang tidak dapat diakses.';
  const batas = 'Ekspor cukup <strong>satu kali dalam seminggu</strong>. Batas ini menjaga kuota database sekolah yang dipakai bersama oleh semua guru dan siswa.';

  if (level === 'admin') {
    return {
      badge: 'PENGINGAT TERJADWAL',
      body: `Sesuai jadwal dari admin, saatnya menyalin data absensi dan nilai Anda ke Excel.<br/><br/>${alasan}<br/><br/>${batas}<br/><br/>Ekspor terakhir: ${lastText}.`,
      primaryLabel: 'Buka Halaman Backup',
      secondary: 'Ingatkan Nanti',
      closable: true,
    };
  }

  return {
    badge: 'BELUM DIEKSPOR',
    body: `Bapak/Ibu belum mengekspor data pada minggu ini.<br/><br/>${alasan}<br/><br/>${batas}<br/><br/>Ekspor terakhir: ${lastText}.`,
    primaryLabel: 'Buka Halaman Backup',
    secondary: 'Ingatkan Nanti',
    closable: true,
  };
}

function buildBackupModalHTML(level, messages, tone) {
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

          <div class="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <button id="backup-remind-primary" type="button" class="inline-flex w-full items-center justify-center gap-2 rounded-xl ${tone.accent} px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition sm:w-auto">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              ${messages.primaryLabel}
            </button>
            ${secondaryBtn}
          </div>

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

/**
 * Arahkan guru ke halaman Backup, bukan menjalankan ekspor dari popup.
 *
 * Sebelumnya popup ini punya dua jalur ekspor sendiri (unduh lokal dan unggah
 * Drive) yang memanggil exportGuruBackupExcel/buildGuruBackupWorkbook langsung.
 * Keduanya melewati pemeriksaan batas satu-ekspor-per-minggu yang hanya ada di
 * halaman Backup, sehingga guru dapat menghabiskan kuota baca berkali-kali dari
 * popup. Satu jalur, satu tempat penegakan aturan.
 */
function goToBackupPage() {
  markReminderSeenToday();
  closeModal();
  window.location.hash = '#guru/backup';
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

  // Satu tombol saja: buka halaman Backup, tempat aturan mingguan ditegakkan.
  document.getElementById('backup-remind-primary')?.addEventListener('click', goToBackupPage);

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
