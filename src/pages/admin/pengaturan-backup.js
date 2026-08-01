import { renderLayout } from '../../layouts/dashboard-layout.js';
import {
  disconnectDriveBackup,
  getDriveBackupConfig,
  saveBackupReminder,
  saveBackupSchedule,
  saveDriveBackupConfig,
} from '../../firebase/auth-service.js';
import { uploadBackupToDrive } from '../../utils/drive-upload.js';
import { computeLastScheduledOccurrence } from '../../utils/backup-schedule.js';
import { adminAccentPanel, adminIcons, adminPageHero, bindAdminLogout } from '../../utils/admin-ui.js';

export async function renderAdminBackupSettingsPage(container) {
  container.innerHTML = renderLayout('Backup & Ekspor', `
    <div class="space-y-6">
      ${adminPageHero({
        eyebrow: 'Backup',
        title: 'Backup & Ekspor',
        description: 'Cadangkan rekap absensi & nilai seluruh guru ke Google Drive, atur jadwal otomatis, dan kelola pengingat backup guru.',
        chips: [`${adminIcons.download} Google Drive`],
      })}

      <section class="rounded-[24px] border border-emerald-100 bg-white p-4 shadow-[0_16px_40px_-30px_rgba(5,150,105,.5)] sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Backup</p>
            <h3 class="mt-1 text-lg font-bold text-slate-900">Google Drive</h3>
            <p class="mt-1 text-xs leading-5 text-slate-500">Backup guru otomatis diunggah ke Drive sekolah. Client Secret dan refresh token dienkripsi di server.</p>
          </div>
          <span id="drive-status" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Memuat...</span>
        </div>

        <div id="drive-redirect-box" class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p class="text-xs font-bold text-amber-900">Authorized redirect URI</p>
          <p class="mt-1 text-[11px] leading-5 text-amber-800">Daftarkan URI berikut di Google Cloud Console → Credentials → OAuth client Anda, tepat seperti tertulis.</p>
          <div class="mt-2 flex items-center gap-2">
            <code id="drive-redirect-uri" class="flex-1 overflow-x-auto rounded-lg bg-white px-2.5 py-2 text-[11px] text-slate-700">Memuat...</code>
            <button type="button" id="drive-copy-redirect" class="flex-none rounded-lg border border-amber-300 bg-white px-2.5 py-2 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100">Salin</button>
          </div>
        </div>

        <form id="drive-config-form" class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="sm:col-span-2"><span class="mb-1 block text-xs font-semibold text-slate-600">Client ID</span><input id="drive-client-id" required class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-100" placeholder="1234567890-abc.apps.googleusercontent.com"></label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">Client Secret</span><input id="drive-client-secret" type="password" autocomplete="new-password" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-100" placeholder="Isi untuk mengganti secret"></label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">Nama Folder Drive</span><input id="drive-folder-name" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-100" placeholder="SIMSMANSARI Backup"></label>
          <p id="drive-secret-hint" class="text-xs text-slate-500 sm:col-span-2">Client Secret belum disimpan.</p>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" id="drive-save-btn" class="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105">Simpan Kredensial</button>
            <a id="drive-connect-btn" href="#" class="pointer-events-none rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 opacity-50 transition hover:bg-emerald-50">Hubungkan Google Drive</a>
            <button type="button" id="drive-test-btn" class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Tes Unggah</button>
            <button type="button" id="drive-disconnect-btn" class="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50">Putuskan</button>
          </div>
          <p id="drive-message" class="text-xs text-slate-500 sm:col-span-2" role="status"></p>
        </form>

        <dl id="drive-meta" class="mt-3 grid gap-2 text-xs sm:grid-cols-3"></dl>
      </section>

      <section class="rounded-[24px] border border-teal-100 bg-white p-4 shadow-[0_16px_40px_-30px_rgba(13,148,136,.5)] sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-600">Backup</p>
            <h3 class="mt-1 text-lg font-bold text-slate-900">Cadangan Otomatis Mingguan</h3>
            <p class="mt-1 text-xs leading-5 text-slate-500">Cadangan seluruh basis data dibuat oleh server setiap <strong>Minggu 01:00 WIB</strong>, saat tidak ada kegiatan mengajar. Tidak ada tombol backup manual di halaman ini &mdash; penjelasannya di bawah.</p>
          </div>
          <span id="sys-backup-status" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Memuat...</span>
        </div>

        <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div class="min-w-0 text-xs leading-5 text-slate-600">
              <p class="text-sm font-bold text-slate-900">Mengapa tidak ada tombol "Backup Sekarang"?</p>
              <p class="mt-1">Tombol itu dulu membangun cadangan seluruh sekolah di dalam tab peramban admin. Sekali tekan berarti membaca setiap kelas setiap guru &mdash; sekitar <strong>200.000 operasi baca</strong>, atau empat kali kuota harian database pada paket gratis. Menekannya pada jam kerja membuat absensi, nilai, dan materi berhenti dapat dibuka oleh semua pengguna sampai hari berikutnya.</p>
              <p class="mt-1">Karena itu pekerjaan tersebut dipindahkan ke server dan dijadwalkan pada hari Minggu dini hari. Bila cadangan perlu dijalankan segera, buka <strong>GitHub &rarr; Actions &rarr; Snapshot Backup Mingguan &rarr; Run workflow</strong>. Cara itu tidak membebani perangkat siapa pun dan tetap tercatat di riwayat di bawah.</p>
              <p class="mt-1">Isi cadangan: seluruh dokumen beserta ID-nya dalam satu berkas <code class="rounded bg-white px-1 py-0.5 ring-1 ring-slate-200">.json.gz</code>, disimpan di Google Drive sekolah dan dilampirkan ke GitHub Release sebagai salinan kedua.</p>
            </div>
          </div>
          <p id="sys-backup-message" class="mt-3 text-xs text-slate-500" role="status"></p>
        </div>

        <form id="schedule-form" class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" id="schedule-enabled" class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-200">
            <span class="text-sm font-semibold text-slate-700">Aktifkan backup otomatis terjadwal</span>
          </label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">Frekuensi</span>
            <select id="schedule-frequency" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100">
              <option value="daily">Harian</option>
              <option value="weekly">Mingguan</option>
              <option value="monthly">Bulanan</option>
            </select>
          </label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">Jam (waktu perangkat)</span>
            <input type="time" id="schedule-time" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100">
          </label>
          <label id="schedule-dow-wrap"><span class="mb-1 block text-xs font-semibold text-slate-600">Hari (mingguan)</span>
            <select id="schedule-dow" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100">
              <option value="1">Senin</option>
              <option value="2">Selasa</option>
              <option value="3">Rabu</option>
              <option value="4">Kamis</option>
              <option value="5">Jumat</option>
              <option value="6">Sabtu</option>
              <option value="0">Minggu</option>
            </select>
          </label>
          <label id="schedule-dom-wrap"><span class="mb-1 block text-xs font-semibold text-slate-600">Tanggal (bulanan, 1-28)</span>
            <input type="number" id="schedule-dom" min="1" max="28" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100">
          </label>
          <p id="schedule-next" class="text-xs text-slate-500 sm:col-span-2"></p>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="submit" id="schedule-save-btn" class="rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50">Simpan Jadwal</button>
            <span id="schedule-message" class="text-xs text-slate-500" role="status"></span>
          </div>
        </form>

        <div class="mt-6 border-t border-slate-100 pt-5">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Pengingat Guru</p>
          <h4 class="mt-1 text-sm font-bold text-slate-900">Pengingat Backup untuk Guru</h4>
          <p class="mt-1 text-xs leading-5 text-slate-500">Popup pengingat muncul untuk guru sesuai jadwal ini, mengajak backup ke perangkat (lokal) dan unggah ke Drive (online). Opsional kirim notifikasi browser.</p>

          <form id="reminder-form" class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" id="reminder-enabled" class="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-200">
              <span class="text-sm font-semibold text-slate-700">Aktifkan pengingat backup untuk guru</span>
            </label>
            <label><span class="mb-1 block text-xs font-semibold text-slate-600">Frekuensi</span>
              <select id="reminder-frequency" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100">
                <option value="daily">Harian</option>
                <option value="weekly">Mingguan</option>
                <option value="custom">Custom (pilih beberapa hari)</option>
              </select>
            </label>
            <label><span class="mb-1 block text-xs font-semibold text-slate-600">Jam pengingat</span>
              <input type="time" id="reminder-time" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-amber-300 focus:bg-white focus:ring-4 focus:ring-amber-100">
            </label>
            <div id="reminder-days-wrap" class="sm:col-span-2">
              <span class="mb-1 block text-xs font-semibold text-slate-600">Pilih hari</span>
              <div class="flex flex-wrap gap-1.5">
                ${[['1', 'Sen'], ['2', 'Sel'], ['3', 'Rab'], ['4', 'Kam'], ['5', 'Jum'], ['6', 'Sab'], ['0', 'Min']].map(([v, l]) => `
                  <label class="reminder-day inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-amber-50">
                    <input type="checkbox" value="${v}" class="reminder-day-cb h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-200">${l}
                  </label>`).join('')}
              </div>
              <p id="reminder-day-mode" class="mt-1 text-[11px] text-slate-400"></p>
            </div>
            <label class="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" id="reminder-push" class="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-200">
              <span class="text-xs font-medium text-slate-700">Kirim juga notifikasi browser (push) bila diizinkan perangkat guru</span>
            </label>
            <p id="reminder-next" class="text-xs text-slate-500 sm:col-span-2"></p>
            <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button type="submit" id="reminder-save-btn" class="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50">Simpan Pengingat</button>
              <span id="reminder-message" class="text-xs text-slate-500" role="status"></span>
            </div>
          </form>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Riwayat Backup</p>
            <button type="button" id="backup-log-refresh" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50">Muat ulang</button>
          </div>
          <div class="mt-2 overflow-x-auto rounded-xl border border-slate-100">
            <table class="w-full min-w-[520px] text-left text-xs">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th class="px-3 py-2 font-bold">Waktu</th>
                  <th class="px-3 py-2 font-bold">Jenis</th>
                  <th class="px-3 py-2 font-bold">Berkas</th>
                  <th class="px-3 py-2 font-bold">Ukuran</th>
                  <th class="px-3 py-2 font-bold">Oleh</th>
                  <th class="px-3 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody id="backup-log-body" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
          <p id="backup-log-empty" class="mt-2 hidden text-xs text-slate-400">Belum ada riwayat backup.</p>
        </div>
      </section>
    </div>
  `, { accentPanel: adminAccentPanel() });

  bindAdminLogout(container);

  // -------------------------------------------------------------------------
  // Backup Google Drive
  // -------------------------------------------------------------------------
  const driveForm = container.querySelector('#drive-config-form');
  const driveClientId = container.querySelector('#drive-client-id');
  const driveClientSecret = container.querySelector('#drive-client-secret');
  const driveFolderName = container.querySelector('#drive-folder-name');
  const driveSecretHint = container.querySelector('#drive-secret-hint');
  const driveStatus = container.querySelector('#drive-status');
  const driveMessage = container.querySelector('#drive-message');
  const driveMeta = container.querySelector('#drive-meta');
  const driveRedirectUri = container.querySelector('#drive-redirect-uri');
  const driveCopyRedirect = container.querySelector('#drive-copy-redirect');
  const driveSaveBtn = container.querySelector('#drive-save-btn');
  const driveConnectBtn = container.querySelector('#drive-connect-btn');
  const driveTestBtn = container.querySelector('#drive-test-btn');
  const driveDisconnectBtn = container.querySelector('#drive-disconnect-btn');
  let hasStoredDriveSecret = false;

  function setDriveMessage(text, isError = false) {
    if (!driveMessage) return;
    driveMessage.textContent = text || '';
    driveMessage.className = isError ? 'text-xs text-rose-600 sm:col-span-2' : 'text-xs text-slate-500 sm:col-span-2';
  }

  function formatDriveDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function applyDriveConfig(config) {
    hasStoredDriveSecret = Boolean(config.secretTail);
    if (config.clientId) driveClientId.value = config.clientId;
    driveFolderName.value = config.folderName || '';
    driveSecretHint.textContent = config.secretTail
      ? `Client Secret tersimpan: ${config.secretTail}. Kosongkan kolom bila tidak diganti.`
      : 'Client Secret belum disimpan.';
    if (driveRedirectUri) driveRedirectUri.textContent = config.redirectUri || '-';

    if (config.consentUrl && driveConnectBtn) {
      driveConnectBtn.href = config.consentUrl;
      driveConnectBtn.classList.remove('pointer-events-none', 'opacity-50');
    } else if (driveConnectBtn) {
      driveConnectBtn.href = '#';
      driveConnectBtn.classList.add('pointer-events-none', 'opacity-50');
    }

    if (!config.configured) {
      driveStatus.textContent = 'Belum diatur';
      driveStatus.className = 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500';
    } else if (config.connected) {
      driveStatus.textContent = 'Terhubung';
      driveStatus.className = 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
    } else {
      driveStatus.textContent = 'Perlu dihubungkan';
      driveStatus.className = 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700';
    }

    const rows = [
      ['Akun Drive', config.accountEmail || '-'],
      ['Folder', config.folderName || '-'],
      ['Dihubungkan', formatDriveDate(config.connectedAt)],
      ['Unggahan terakhir', config.lastUploadName || '-'],
      ['Waktu unggahan', formatDriveDate(config.lastUploadAt)],
      ['Cakupan izin', 'drive.file (hanya berkas aplikasi)'],
    ];
    driveMeta.innerHTML = rows.map(([label, value]) => `
      <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
        <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${label}</dt>
        <dd class="mt-0.5 break-words text-[11px] font-semibold text-slate-700">${value}</dd>
      </div>`).join('');
  }

  async function reloadDriveConfig() {
    try {
      const config = await getDriveBackupConfig();
      applyDriveConfig(config);
      applyBackupExtras(config);
    } catch (error) {
      driveStatus.textContent = 'Gagal memuat';
      driveStatus.className = 'rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700';
      setDriveMessage(error.message, true);
    }
  }

  driveCopyRedirect?.addEventListener('click', async () => {
    const value = driveRedirectUri?.textContent || '';
    try {
      await navigator.clipboard.writeText(value);
      driveCopyRedirect.textContent = 'Tersalin';
      setTimeout(() => { driveCopyRedirect.textContent = 'Salin'; }, 1800);
    } catch {
      setDriveMessage('Clipboard diblokir. Salin URI secara manual.', true);
    }
  });

  driveForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const clientId = String(driveClientId?.value || '').trim();
    const clientSecret = String(driveClientSecret?.value || '').trim();
    if (!clientId || (!clientSecret && !hasStoredDriveSecret)) {
      setDriveMessage('Lengkapi Client ID dan Client Secret.', true);
      return;
    }
    driveSaveBtn.disabled = true;
    driveSaveBtn.textContent = 'Menyimpan...';
    try {
      await saveDriveBackupConfig({
        clientId,
        clientSecret,
        folderName: String(driveFolderName?.value || '').trim(),
      });
      driveClientSecret.value = '';
      await reloadDriveConfig();
      setDriveMessage('Kredensial tersimpan. Lanjutkan dengan "Hubungkan Google Drive".');
    } catch (error) {
      setDriveMessage(error.message, true);
    } finally {
      driveSaveBtn.disabled = false;
      driveSaveBtn.textContent = 'Simpan Kredensial';
    }
  });

  driveTestBtn?.addEventListener('click', async () => {
    driveTestBtn.disabled = true;
    driveTestBtn.textContent = 'Menguji...';
    setDriveMessage('Mengunggah berkas uji ke Google Drive...');
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const content = `Tes koneksi backup SIM SMANSARI\nWaktu: ${new Date().toISOString()}\n`;
      const blob = new Blob([content], { type: 'text/plain' });
      const result = await uploadBackupToDrive(blob, `tes-koneksi-${stamp}.txt`, { mimeType: 'text/plain', logType: 'tes' });
      if (!result.uploaded) throw new Error(result.reason || 'Unggahan uji gagal.');
      await reloadDriveConfig();
      setDriveMessage(`Berhasil. Berkas uji tersimpan di folder "${result.folderName || 'backup'}".`);
    } catch (error) {
      setDriveMessage(error.message, true);
    } finally {
      driveTestBtn.disabled = false;
      driveTestBtn.textContent = 'Tes Unggah';
    }
  });

  driveDisconnectBtn?.addEventListener('click', async () => {
    if (!window.confirm('Putuskan koneksi Google Drive? Backup tidak akan terunggah sampai dihubungkan lagi.')) return;
    driveDisconnectBtn.disabled = true;
    try {
      await disconnectDriveBackup();
      await reloadDriveConfig();
      setDriveMessage('Koneksi Google Drive diputus.');
    } catch (error) {
      setDriveMessage(error.message, true);
    } finally {
      driveDisconnectBtn.disabled = false;
    }
  });

  // -------------------------------------------------------------------------
  // Backup otomatis, backup manual, & riwayat
  // -------------------------------------------------------------------------
  const sysStatus = container.querySelector('#sys-backup-status');
  const sysMessage = container.querySelector('#sys-backup-message');
  const scheduleForm = container.querySelector('#schedule-form');
  const scheduleEnabled = container.querySelector('#schedule-enabled');
  const scheduleFrequency = container.querySelector('#schedule-frequency');
  const scheduleTime = container.querySelector('#schedule-time');
  const scheduleDow = container.querySelector('#schedule-dow');
  const scheduleDowWrap = container.querySelector('#schedule-dow-wrap');
  const scheduleDom = container.querySelector('#schedule-dom');
  const scheduleDomWrap = container.querySelector('#schedule-dom-wrap');
  const scheduleSaveBtn = container.querySelector('#schedule-save-btn');
  const scheduleMessage = container.querySelector('#schedule-message');
  const scheduleNext = container.querySelector('#schedule-next');
  const reminderForm = container.querySelector('#reminder-form');
  const reminderEnabled = container.querySelector('#reminder-enabled');
  const reminderFrequency = container.querySelector('#reminder-frequency');
  const reminderTime = container.querySelector('#reminder-time');
  const reminderDaysWrap = container.querySelector('#reminder-days-wrap');
  const reminderDayCbs = Array.from(container.querySelectorAll('.reminder-day-cb'));
  const reminderDayMode = container.querySelector('#reminder-day-mode');
  const reminderPush = container.querySelector('#reminder-push');
  const reminderSaveBtn = container.querySelector('#reminder-save-btn');
  const reminderMessage = container.querySelector('#reminder-message');
  const reminderNext = container.querySelector('#reminder-next');
  const logBody = container.querySelector('#backup-log-body');
  const logEmpty = container.querySelector('#backup-log-empty');
  const logRefreshBtn = container.querySelector('#backup-log-refresh');

  const DOW_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const FREQ_LABELS = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };
  const LOG_TYPE_BADGE = {
    otomatis: 'bg-teal-50 text-teal-700',
    'otomatis-guru': 'bg-emerald-50 text-emerald-700',
    manual: 'bg-sky-50 text-sky-700',
    tes: 'bg-slate-100 text-slate-600',
    guru: 'bg-indigo-50 text-indigo-700',
  };

  function setSysMessage(text, isError = false) {
    if (!sysMessage) return;
    sysMessage.textContent = text || '';
    sysMessage.className = isError ? 'mt-3 text-xs text-rose-600' : 'mt-3 text-xs text-slate-500';
  }

  function setScheduleMessage(text, isError = false) {
    if (!scheduleMessage) return;
    scheduleMessage.textContent = text || '';
    scheduleMessage.className = isError ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
  }

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n <= 0) return '-';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  function updateScheduleFieldVisibility() {
    const freq = scheduleFrequency?.value || 'weekly';
    if (scheduleDowWrap) scheduleDowWrap.style.display = freq === 'weekly' ? '' : 'none';
    if (scheduleDomWrap) scheduleDomWrap.style.display = freq === 'monthly' ? '' : 'none';
  }

  function describeSchedule(schedule) {
    if (!schedule || !schedule.enabled) return 'Jadwal pengingat nonaktif. Snapshot mingguan oleh server tetap berjalan.';
    const freq = FREQ_LABELS[schedule.frequency] || schedule.frequency;
    let when = `pukul ${schedule.time}`;
    if (schedule.frequency === 'weekly') when = `setiap ${DOW_NAMES[schedule.dayOfWeek] || 'Jumat'} pukul ${schedule.time}`;
    else if (schedule.frequency === 'monthly') when = `tanggal ${schedule.dayOfMonth} pukul ${schedule.time}`;
    else when = `setiap hari pukul ${schedule.time}`;
    let nextText = '';
    try {
      const lastOcc = computeLastScheduledOccurrence(schedule, new Date());
      if (lastOcc) {
        const next = new Date(lastOcc);
        if (schedule.frequency === 'daily') next.setDate(next.getDate() + 1);
        else if (schedule.frequency === 'weekly') next.setDate(next.getDate() + 7);
        else next.setMonth(next.getMonth() + 1);
        nextText = ` Perkiraan jadwal berikutnya: ${formatDriveDate(next.toISOString())}.`;
      }
    } catch { /* abaikan */ }
    return `Jadwal ${freq}, ${when}.${nextText} Catatan: jadwal ini dipakai untuk pengingat guru dan pencatatan. Snapshot basis data yang sebenarnya dijalankan GitHub Actions setiap Minggu 01:00 WIB, tidak bergantung pada admin membuka aplikasi.`;
  }

  function renderLogs(logs) {
    if (!logBody) return;
    const list = Array.isArray(logs) ? logs : [];
    if (!list.length) {
      logBody.innerHTML = '';
      if (logEmpty) logEmpty.classList.remove('hidden');
      return;
    }
    if (logEmpty) logEmpty.classList.add('hidden');
    logBody.innerHTML = list.map((entry) => {
      const badge = LOG_TYPE_BADGE[entry.type] || 'bg-slate-100 text-slate-600';
      const statusOk = entry.status !== 'error';
      const statusHtml = statusOk
        ? '<span class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Sukses</span>'
        : `<span class="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700" title="${escapeHtml(entry.message || '')}">Gagal</span>`;
      return `<tr class="text-slate-600">
        <td class="whitespace-nowrap px-3 py-2">${formatDriveDate(entry.at)}</td>
        <td class="px-3 py-2"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${badge}">${escapeHtml(entry.type || '-')}</span></td>
        <td class="max-w-[180px] truncate px-3 py-2" title="${escapeHtml(entry.file_name || '')}">${escapeHtml(entry.file_name || '-')}</td>
        <td class="whitespace-nowrap px-3 py-2">${formatBytes(entry.size)}</td>
        <td class="px-3 py-2">${escapeHtml(entry.by || '-')}</td>
        <td class="px-3 py-2">${statusHtml}</td>
      </tr>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function applyBackupExtras(config) {
    const schedule = config?.schedule || { enabled: false, frequency: 'weekly', time: '02:00', dayOfWeek: 5, dayOfMonth: 1 };
    if (scheduleEnabled) scheduleEnabled.checked = schedule.enabled === true;
    if (scheduleFrequency) scheduleFrequency.value = schedule.frequency || 'weekly';
    if (scheduleTime) scheduleTime.value = schedule.time || '02:00';
    if (scheduleDow) scheduleDow.value = String(Number.isInteger(schedule.dayOfWeek) ? schedule.dayOfWeek : 5);
    if (scheduleDom) scheduleDom.value = String(schedule.dayOfMonth || 1);
    updateScheduleFieldVisibility();
    if (scheduleNext) scheduleNext.textContent = describeSchedule(schedule);

    if (sysStatus) {
      if (!config?.connected) {
        sysStatus.textContent = 'Drive belum terhubung';
        sysStatus.className = 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700';
      } else if (schedule.enabled) {
        sysStatus.textContent = 'Otomatis aktif';
        sysStatus.className = 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
      } else {
        sysStatus.textContent = 'Jadwal server aktif';
        sysStatus.className = 'rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700';
      }
    }
    if (!config?.connected) {
      setSysMessage('Google Drive belum terhubung. Snapshot mingguan tetap dibuat dan dilampirkan ke GitHub Release, tetapi tidak akan tersalin ke Drive sekolah sampai koneksi diatur di atas.', true);
    } else {
      setSysMessage('');
    }

    applyReminderConfig(config?.reminder);
    renderLogs(config?.logs);
  }

  const REM_FREQ_LABELS = { daily: 'Harian', weekly: 'Mingguan', custom: 'Custom' };

  function setReminderMessage(text, isError = false) {
    if (!reminderMessage) return;
    reminderMessage.textContent = text || '';
    reminderMessage.className = isError ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
  }

  function updateReminderFieldVisibility() {
    const freq = reminderFrequency?.value || 'weekly';
    if (reminderDaysWrap) reminderDaysWrap.style.display = freq === 'daily' ? 'none' : '';
    if (reminderDayMode) {
      reminderDayMode.textContent = freq === 'weekly'
        ? 'Mode mingguan: pilih tepat satu hari (hari pertama yang dicentang dipakai).'
        : freq === 'custom'
          ? 'Mode custom: pilih satu atau beberapa hari.'
          : '';
    }
  }

  function describeReminder(reminder) {
    if (!reminder || !reminder.enabled) return 'Pengingat guru nonaktif.';
    const freq = REM_FREQ_LABELS[reminder.frequency] || reminder.frequency;
    const dayNames = (reminder.days || []).map((d) => DOW_NAMES[d]).filter(Boolean);
    let when;
    if (reminder.frequency === 'daily') when = `setiap hari pukul ${reminder.time}`;
    else if (reminder.frequency === 'weekly') when = `setiap ${dayNames[0] || 'Jumat'} pukul ${reminder.time}`;
    else when = `pada ${dayNames.join(', ') || '—'} pukul ${reminder.time}`;
    const push = reminder.push ? ' Notifikasi browser diaktifkan bila diizinkan.' : '';
    return `Pengingat ${freq}, ${when}.${push}`;
  }

  function applyReminderConfig(reminder) {
    const r = reminder || { enabled: false, frequency: 'weekly', days: [5], time: '07:00', push: false };
    if (reminderEnabled) reminderEnabled.checked = r.enabled === true;
    if (reminderFrequency) reminderFrequency.value = r.frequency || 'weekly';
    if (reminderTime) reminderTime.value = r.time || '07:00';
    const days = Array.isArray(r.days) ? r.days.map(Number) : [];
    reminderDayCbs.forEach((cb) => { cb.checked = days.includes(Number(cb.value)); });
    if (reminderPush) reminderPush.checked = r.push === true;
    updateReminderFieldVisibility();
    if (reminderNext) reminderNext.textContent = describeReminder(r);
  }

  function readReminderForm() {
    const frequency = reminderFrequency?.value || 'weekly';
    let days = reminderDayCbs.filter((cb) => cb.checked).map((cb) => Number(cb.value));
    if (frequency === 'weekly') days = days.length ? [days[0]] : [5];
    else if (frequency === 'daily') days = [];
    return {
      enabled: Boolean(reminderEnabled?.checked),
      frequency,
      days,
      time: reminderTime?.value || '07:00',
      push: Boolean(reminderPush?.checked),
    };
  }

  scheduleFrequency?.addEventListener('change', updateScheduleFieldVisibility);
  reminderFrequency?.addEventListener('change', updateReminderFieldVisibility);

  reminderForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const reminder = readReminderForm();
    if (reminder.enabled && reminder.frequency === 'custom' && !reminder.days.length) {
      setReminderMessage('Pilih minimal satu hari untuk mode custom.', true);
      return;
    }
    if (reminderSaveBtn) { reminderSaveBtn.disabled = true; reminderSaveBtn.textContent = 'Menyimpan...'; }
    try {
      // Bila push diminta, minta izin notifikasi dari perangkat admin (opsional).
      if (reminder.enabled && reminder.push && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* abaikan */ }
      }
      await saveBackupReminder(reminder);
      await reloadDriveConfig();
      setReminderMessage('Pengingat guru tersimpan.');
    } catch (error) {
      setReminderMessage(error?.message || 'Gagal menyimpan pengingat.', true);
    } finally {
      if (reminderSaveBtn) { reminderSaveBtn.disabled = false; reminderSaveBtn.textContent = 'Simpan Pengingat'; }
    }
  });

  scheduleForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const schedule = {
      enabled: Boolean(scheduleEnabled?.checked),
      frequency: scheduleFrequency?.value || 'weekly',
      time: scheduleTime?.value || '02:00',
      dayOfWeek: Number(scheduleDow?.value ?? 5),
      dayOfMonth: Number(scheduleDom?.value ?? 1),
    };
    if (scheduleSaveBtn) { scheduleSaveBtn.disabled = true; scheduleSaveBtn.textContent = 'Menyimpan...'; }
    try {
      await saveBackupSchedule(schedule);
      await reloadDriveConfig();
      setScheduleMessage('Jadwal backup tersimpan.');
    } catch (error) {
      setScheduleMessage(error?.message || 'Gagal menyimpan jadwal.', true);
    } finally {
      if (scheduleSaveBtn) { scheduleSaveBtn.disabled = false; scheduleSaveBtn.textContent = 'Simpan Jadwal'; }
    }
  });

  logRefreshBtn?.addEventListener('click', async () => {
    logRefreshBtn.disabled = true;
    try { await reloadDriveConfig(); } finally { logRefreshBtn.disabled = false; }
  });

  // Muat konfigurasi Drive + jadwal + riwayat setelah seluruh elemen siap.
  await reloadDriveConfig();
}
