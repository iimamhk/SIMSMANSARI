// ============================================================================
// admin-backup-scheduler.js
// Penjadwal backup otomatis sisi-klien untuk admin.
//
// Karena aplikasi berjalan di Vercel Hobby (tanpa cron server), jadwal backup
// dievaluasi di browser admin: setiap kali admin membuka aplikasi, penjadwal
// memeriksa apakah ada jadwal backup yang terlewat/jatuh tempo lalu
// menjalankannya. Penanda waktu backup otomatis terakhir disimpan di server
// (settings/backup_drive) sehingga tidak berjalan ganda antar-perangkat.
//
// Konsekuensi yang jujur: backup otomatis hanya berjalan bila ada admin yang
// membuka aplikasi setelah waktu jadwal. Bila tidak ada admin yang login pada
// hari itu, backup dijalankan pada kesempatan berikutnya (mekanisme catch-up).
// ============================================================================

import { getDriveBackupConfig } from '../firebase/auth-service.js';
import { runSystemBackupToDrive } from './system-backup.js';

const LAST_CHECK_KEY = 'admin_autobackup_last_check';
const CHECK_THROTTLE_MS = 3 * 60 * 60 * 1000; // maksimal cek sekali per 3 jam per browser
let checkingThisLoad = false;

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function isAdmin() {
  return getSession()?.user?.role === 'admin';
}

function parseTime(value) {
  const [h, m] = String(value || '02:00').split(':').map((n) => Number(n));
  return { h: Number.isFinite(h) ? h : 2, m: Number.isFinite(m) ? m : 0 };
}

function atTime(baseDate, h, m) {
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Kesempatan jadwal terakhir yang <= sekarang (untuk mendeteksi jadwal terlewat). */
export function computeLastScheduledOccurrence(schedule, now = new Date()) {
  if (!schedule) return null;
  const { h, m } = parseTime(schedule.time);

  if (schedule.frequency === 'daily') {
    const d = atTime(now, h, m);
    if (d > now) d.setDate(d.getDate() - 1);
    return d;
  }

  if (schedule.frequency === 'weekly') {
    const target = Number.isInteger(schedule.dayOfWeek) ? schedule.dayOfWeek : 5;
    for (let i = 0; i <= 7; i++) {
      const d = atTime(now, h, m);
      d.setDate(d.getDate() - i);
      if (d.getDay() === target && d <= now) return d;
    }
    return null;
  }

  if (schedule.frequency === 'monthly') {
    const dom = Math.min(Math.max(Number(schedule.dayOfMonth) || 1, 1), 28);
    let d = atTime(now, h, m);
    d.setDate(dom);
    if (d > now) {
      d = atTime(now, h, m);
      d.setMonth(d.getMonth() - 1);
      d.setDate(dom);
    }
    return d;
  }

  return null;
}

/**
 * Periksa & jalankan backup otomatis bila jatuh tempo. Aman dipanggil sering:
 * ada throttle per-browser dan penanda server agar tidak berjalan berulang.
 */
export async function maybeRunScheduledBackup() {
  if (!isAdmin() || checkingThisLoad) return;

  let lastCheck = 0;
  try { lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0); } catch { /* abaikan */ }
  if (Date.now() - lastCheck < CHECK_THROTTLE_MS) return;

  checkingThisLoad = true;
  try {
    try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch { /* abaikan */ }

    const config = await getDriveBackupConfig();
    const schedule = config?.schedule;
    if (!config?.connected || !schedule?.enabled) return;

    const now = new Date();
    const occurrence = computeLastScheduledOccurrence(schedule, now);
    if (!occurrence) return;

    const lastAuto = config.lastAutoBackupAt ? new Date(config.lastAutoBackupAt) : null;
    const due = !lastAuto || Number.isNaN(lastAuto.getTime()) || lastAuto.getTime() < occurrence.getTime();
    if (!due) return;

    console.info('[Backup otomatis] Jadwal jatuh tempo, menjalankan backup sistem ke Drive...');
    const result = await runSystemBackupToDrive({ type: 'otomatis' });
    if (result.uploaded) {
      console.info(`[Backup otomatis] Selesai: ${result.fileName} (${result.totalDocs} dokumen).`);
    } else {
      console.warn(`[Backup otomatis] Gagal: ${result.reason || 'tidak diketahui'}.`);
    }
  } catch (error) {
    console.warn('[Backup otomatis] Pemeriksaan jadwal gagal:', error);
  } finally {
    checkingThisLoad = false;
  }
}
