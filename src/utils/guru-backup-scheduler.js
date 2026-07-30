// ============================================================================
// guru-backup-scheduler.js
// Auto-upload backup guru sisi-klien.
//
// Saat seorang guru membuka aplikasi, jika jadwal backup otomatis (yang diatur
// admin) sudah jatuh tempo dan guru tersebut belum ter-backup pada periode
// jadwal berjalan, data guru itu diunggah diam-diam ke Google Drive. Interval
// mengikuti frekuensi jadwal admin (harian/mingguan/bulanan) sehingga tidak
// menjadi spam harian.
//
// Penanda "backup terakhir" disimpan per-perangkat (localStorage), sehingga
// keputusan jatuh-tempo tidak memerlukan hak baca admin.
// ============================================================================

import { getDriveUploadToken } from '../firebase/auth-service.js';
import { getLastBackupTimestamp, uploadGuruBackupSilently } from './backup-excel.js';
import { computeLastScheduledOccurrence } from './admin-backup-scheduler.js';

const CHECK_KEY = 'simguru_guru_autobackup_check';
const FORCE_KEY = 'simguru_autobackup_force'; // set '1' di localStorage untuk memaksa uji
const THROTTLE_MS = 6 * 60 * 60 * 1000; // maksimal cek jaringan sekali per 6 jam
let running = false;

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

function isForced() {
  try { return localStorage.getItem(FORCE_KEY) === '1'; } catch { return false; }
}

function backedUpToday() {
  const last = getLastBackupTimestamp();
  if (!last?.at) return false;
  const d = new Date(last.at);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

/**
 * Periksa & jalankan auto-upload backup guru bila jatuh tempo. Aman dipanggil
 * sering: ada throttle per-perangkat dan pra-cek murah sebelum menyentuh jaringan.
 * Set localStorage 'simguru_autobackup_force' = '1' untuk memaksa (uji coba).
 */
export async function maybeRunGuruAutoBackup() {
  if (!isGuru() || running) return;

  const forced = isForced();

  if (!forced) {
    let lastCheck = 0;
    try { lastCheck = Number(localStorage.getItem(CHECK_KEY) || 0); } catch { /* abaikan */ }
    if (Date.now() - lastCheck < THROTTLE_MS) return;
    // Pra-cek murah: jika sudah backup hari ini, pasti belum jatuh tempo lagi.
    if (backedUpToday()) {
      try { localStorage.setItem(CHECK_KEY, String(Date.now())); } catch { /* abaikan */ }
      return;
    }
  }

  running = true;
  try {
    try { localStorage.setItem(CHECK_KEY, String(Date.now())); } catch { /* abaikan */ }

    // Ambil token sekaligus jadwal (endpoint mengizinkan guru+admin).
    const token = await getDriveUploadToken();
    if (!token.available) return;

    if (!forced) {
      const schedule = token.schedule;
      if (!schedule?.enabled) return;
      const occurrence = computeLastScheduledOccurrence(schedule, new Date());
      if (!occurrence) return;
      const last = getLastBackupTimestamp();
      const lastAt = last?.at ? new Date(last.at) : null;
      const due = !lastAt || Number.isNaN(lastAt.getTime()) || lastAt.getTime() < occurrence.getTime();
      if (!due) return;
    }

    console.info('[Auto-backup guru] Menjalankan unggahan otomatis ke Drive...');
    const result = await uploadGuruBackupSilently();
    if (result.uploaded) {
      console.info(`[Auto-backup guru] Terunggah: ${result.fileName}.`);
    } else {
      console.info(`[Auto-backup guru] Dilewati/gagal: ${result.reason || 'tidak diketahui'}.`);
    }

    // Bersihkan flag uji agar hanya berjalan sekali saat dipaksa.
    if (forced) {
      try { localStorage.removeItem(FORCE_KEY); } catch { /* abaikan */ }
    }
  } catch (error) {
    console.warn('[Auto-backup guru] gagal:', error);
  } finally {
    running = false;
  }
}
