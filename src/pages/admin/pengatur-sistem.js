import { renderLayout } from '../../layouts/dashboard-layout.js';
import { auth } from '../../firebase/firebase-config.js';
import {
  changePassword,
  disconnectDriveBackup,
  getAiAdminConfig,
  getDriveBackupConfig,
  normalizePassword,
  saveAiAdminConfig,
  saveDriveBackupConfig,
  testAiAdminConfig,
} from '../../firebase/auth-service.js';
import { uploadBackupToDrive } from '../../utils/drive-upload.js';

export async function renderSystemSettingsPage(container) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const currentUser = session?.user || {};
  const currentUsername = currentUser.username || '';

  const html = renderLayout('Pengaturan Akun', `
    <div class="space-y-4">
      <div class="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-[0_28px_60px_-32px_rgba(14,165,233,0.55)] sm:p-6">
        <div class="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/25 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Security</p>
        <h3 class="mt-2 text-2xl font-bold tracking-tight">Manajemen Akun Admin</h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-white/90">Ubah password akun admin yang sedang aktif. Password disimpan terenkripsi di server.</p>
      </div>

      <section class="rounded-[24px] border border-indigo-100 bg-white p-4 shadow-[0_16px_40px_-30px_rgba(79,70,229,.5)] sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">AI Agent</p><h3 class="mt-1 text-lg font-bold text-slate-900">Konfigurasi Materi AI</h3><p class="mt-1 text-xs leading-5 text-slate-500">Satu model aktif untuk semua guru. API key dienkripsi sebelum disimpan.</p></div>
          <span id="ai-config-status" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Memuat...</span>
        </div>
        <form id="ai-config-form" class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="sm:col-span-2"><span class="mb-1 block text-xs font-semibold text-slate-600">Base URL</span><input id="ai-base-url" type="url" required class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100" placeholder="https://api.groq.com/openai/v1"></label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">API Key</span><input id="ai-api-key" type="password" autocomplete="new-password" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100" placeholder="Isi untuk mengganti key"></label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">Model Agent</span><input id="ai-model" required class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100" placeholder="llama-3.3-70b-versatile"></label>
          <p id="ai-key-hint" class="text-xs text-slate-500 sm:col-span-2">API key belum disimpan.</p>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2"><button type="button" id="ai-test-btn" class="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">Tes Koneksi</button><button type="submit" id="ai-save-btn" class="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105">Simpan AI</button><span id="ai-config-message" class="text-xs text-slate-500" role="status"></span></div>
        </form>
      </section>

      <section class="rounded-[24px] border border-emerald-100 bg-white p-4 shadow-[0_16px_40px_-30px_rgba(5,150,105,.5)] sm:p-5">
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

      <form id="settings-form" class="space-y-4">
        <div>
          <label class="mb-2 block text-sm font-medium text-slate-700">Username Saat Ini</label>
          <input value="${currentUsername}" disabled class="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none" />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-slate-700">Username Baru</label>
          <input id="new-username" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 outline-none transition focus:border-transparent focus:ring-4 focus:ring-sky-100" placeholder="Kosongkan jika tidak diubah" />
          <p class="mt-1 text-xs text-slate-500">Gunakan 3-30 karakter tanpa spasi (huruf, angka, titik, garis bawah, atau minus).</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Password Baru</label>
            <input id="new-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 outline-none transition focus:border-transparent focus:ring-4 focus:ring-sky-100" placeholder="Minimal 6 karakter" />
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Konfirmasi Password Baru</label>
            <input id="confirm-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 outline-none transition focus:border-transparent focus:ring-4 focus:ring-sky-100" placeholder="Ulangi password baru" />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-cyan-600">Simpan Akun</button>
          <p id="account-message" class="text-sm text-slate-500"></p>
        </div>
      </form>
    </div>
  `);

  container.innerHTML = html;

  const messageEl = container.querySelector('#account-message');
  const aiForm = container.querySelector('#ai-config-form');
  const aiBaseUrl = container.querySelector('#ai-base-url');
  const aiApiKey = container.querySelector('#ai-api-key');
  const aiModel = container.querySelector('#ai-model');
  const aiKeyHint = container.querySelector('#ai-key-hint');
  const aiStatus = container.querySelector('#ai-config-status');
  const aiMessage = container.querySelector('#ai-config-message');
  const aiTestBtn = container.querySelector('#ai-test-btn');
  const aiSaveBtn = container.querySelector('#ai-save-btn');
  let hasStoredAiKey = false;

  function setMessage(text, isError = false) {
    if (!messageEl) {
      return;
    }
    messageEl.textContent = text;
    messageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function setAiMessage(text, isError = false) {
    aiMessage.textContent = text || '';
    aiMessage.className = isError ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
  }

  function readAiForm() {
    return {
      baseUrl: String(aiBaseUrl?.value || '').trim(),
      apiKey: String(aiApiKey?.value || '').trim(),
      model: String(aiModel?.value || '').trim(),
    };
  }

  try {
    const config = await getAiAdminConfig();
    hasStoredAiKey = Boolean(config.configured);
    if (config.baseUrl) aiBaseUrl.value = config.baseUrl;
    if (config.model) aiModel.value = config.model;
    aiKeyHint.textContent = config.keyTail ? `API key tersimpan: ${config.keyTail}. Kosongkan kolom bila tidak diganti.` : 'API key belum disimpan.';
    aiStatus.textContent = config.configured ? 'Terkonfigurasi' : 'Fallback env';
    aiStatus.className = config.configured ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700' : 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700';
  } catch (error) {
    aiStatus.textContent = 'Gagal memuat';
    aiStatus.className = 'rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700';
    setAiMessage(error.message, true);
  }

  aiTestBtn?.addEventListener('click', async () => {
    const config = readAiForm();
    if (!config.baseUrl || !config.model || (!config.apiKey && !hasStoredAiKey)) {
      setAiMessage('Lengkapi Base URL, API key, dan Model.', true);
      return;
    }
    aiTestBtn.disabled = true;
    aiTestBtn.textContent = 'Menguji...';
    try {
      const result = await testAiAdminConfig(config);
      if (!result.ok) throw new Error(result.error || 'Koneksi gagal.');
      setAiMessage(`Terhubung ke ${result.model || config.model}.`);
    } catch (error) {
      setAiMessage(error.message, true);
    } finally {
      aiTestBtn.disabled = false;
      aiTestBtn.textContent = 'Tes Koneksi';
    }
  });

  aiForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const config = readAiForm();
    if (!config.baseUrl || !config.model || (!config.apiKey && !hasStoredAiKey)) {
      setAiMessage('Lengkapi Base URL, API key, dan Model.', true);
      return;
    }
    aiSaveBtn.disabled = true;
    aiSaveBtn.textContent = 'Menyimpan...';
    try {
      const result = await saveAiAdminConfig(config);
      hasStoredAiKey = true;
      aiApiKey.value = '';
      aiKeyHint.textContent = `API key tersimpan: ${result.keyTail || 'terenkripsi'}. Kosongkan kolom bila tidak diganti.`;
      aiStatus.textContent = 'Terkonfigurasi';
      aiStatus.className = 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
      setAiMessage('Konfigurasi AI berhasil disimpan.');
    } catch (error) {
      setAiMessage(error.message, true);
    } finally {
      aiSaveBtn.disabled = false;
      aiSaveBtn.textContent = 'Simpan AI';
    }
  });

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
    } catch (error) {
      driveStatus.textContent = 'Gagal memuat';
      driveStatus.className = 'rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700';
      setDriveMessage(error.message, true);
    }
  }

  await reloadDriveConfig();

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
      const result = await uploadBackupToDrive(blob, `tes-koneksi-${stamp}.txt`, { mimeType: 'text/plain' });
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

  container.querySelector('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newUsernameRaw = container.querySelector('#new-username')?.value || '';
    const newPasswordRaw = container.querySelector('#new-password')?.value || '';
    const confirmPasswordRaw = container.querySelector('#confirm-password')?.value || '';

    const newUsername = String(newUsernameRaw).trim();
    const newPassword = normalizePassword(newPasswordRaw);
    const confirmPassword = normalizePassword(confirmPasswordRaw);

    if (!newUsername && !newPassword) {
      setMessage('Isi username baru atau password baru terlebih dahulu.', true);
      return;
    }

    if (newUsername && !/^[a-zA-Z0-9._-]{3,30}$/.test(newUsername)) {
      setMessage('Username harus 3-30 karakter (huruf/angka/._-), tanpa spasi.', true);
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setMessage('Password baru minimal 6 karakter.', true);
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setMessage('Konfirmasi password baru tidak sama.', true);
      return;
    }

    try {
      if (newUsername && newUsername !== currentUsername) {
        setMessage('Perubahan username admin dilakukan melalui migrasi akun terpisah.', true);
        return;
      }
      if (newPassword) {
        await changePassword(newPassword);
      }

      const updatedSession = {
        ...session,
        user: {
          ...currentUser,
           username: currentUsername,
        },
      };
      localStorage.setItem('simguru_session', JSON.stringify(updatedSession));

      const form = container.querySelector('#settings-form');
      form?.reset();
      setMessage('Akun admin berhasil diperbarui.');
    } catch (error) {
      console.error('Gagal memperbarui akun admin:', error);
      setMessage('Gagal menyimpan perubahan akun.', true);
    }
  });

  container.querySelector('#logout-btn')?.addEventListener('click', async () => {
     await auth?.signOut();
     localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
