import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getCollectionDocs, saveDocument } from '../../firebase/data-service.js';
import { normalizePassword, normalizeUsername, removeLocalUser, upsertLocalUser } from '../../firebase/auth-service.js';

export async function renderSiswaSystemSettingsPage(container) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const currentUser = session?.user || {};
  const currentUsername = currentUser.username || '';

  const html = renderLayout('Pengaturan Akun', `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-lg font-semibold text-slate-900">Pengaturan Akun Siswa</h3>
        <p class="mt-1 text-sm text-slate-500">Ubah username dan password akun Anda.</p>
      </div>

      <form id="settings-form" class="space-y-4">
        <div>
          <label class="mb-2 block text-sm font-medium text-slate-700">Username Saat Ini</label>
          <input value="${currentUsername}" disabled class="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none" />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-slate-700">Username Baru</label>
          <input id="new-username" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#007AFF]" placeholder="Kosongkan jika tidak diubah" />
          <p class="mt-1 text-xs text-slate-500">Gunakan 3-30 karakter tanpa spasi (huruf, angka, titik, garis bawah, atau minus).</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Password Baru</label>
            <input id="new-password" type="password" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#007AFF]" placeholder="Minimal 6 karakter" />
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Konfirmasi Password Baru</label>
            <input id="confirm-password" type="password" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#007AFF]" placeholder="Ulangi password baru" />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0063CC]">Simpan Akun</button>
          <p id="account-message" class="text-sm text-slate-500"></p>
        </div>
      </form>
    </div>
  `);

  container.innerHTML = html;

  const messageEl = container.querySelector('#account-message');

  function setMessage(text, isError = false) {
    if (!messageEl) {
      return;
    }
    messageEl.textContent = text;
    messageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

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
      const cachedUsers = JSON.parse(localStorage.getItem('simguru_users') || '[]');
      const normalizedCurrent = normalizeUsername(currentUsername);
      const nextUsername = newUsername || currentUsername;
      const normalizedNext = normalizeUsername(nextUsername);

      const usernameTaken = cachedUsers.some((item) => normalizeUsername(item.username) === normalizedNext && normalizeUsername(item.username) !== normalizedCurrent);
      if (usernameTaken) {
        setMessage('Username baru sudah dipakai oleh pengguna lain.', true);
        return;
      }

      const cachedCurrentUser = cachedUsers.find((item) => normalizeUsername(item.username) === normalizedCurrent) || {};
      const nextPassword = newPassword || normalizePassword(cachedCurrentUser.password || '');

      if (!nextPassword) {
        setMessage('Password lama tidak ditemukan. Isi password baru untuk melanjutkan.', true);
        return;
      }

      const firestoreUsers = await getCollectionDocs('users');
      const firestoreCurrentUser = firestoreUsers.find((item) => normalizeUsername(item.username) === normalizedCurrent);

      const mergedUser = {
        ...(firestoreCurrentUser || {}),
        ...(cachedCurrentUser || {}),
        id: currentUser.id || firestoreCurrentUser?.id || cachedCurrentUser.id,
        nama: currentUser.nama || firestoreCurrentUser?.nama || cachedCurrentUser.nama || 'Siswa',
        role: currentUser.role || firestoreCurrentUser?.role || cachedCurrentUser.role || 'siswa',
        username: nextUsername,
        username_lower: normalizedNext,
        password: nextPassword,
        updated_at: new Date().toISOString(),
      };

      if (mergedUser.id) {
        await saveDocument('users', mergedUser, mergedUser.id);
      } else if (firestoreCurrentUser?.firestoreId || firestoreCurrentUser?.id) {
        await saveDocument('users', mergedUser, firestoreCurrentUser.firestoreId || firestoreCurrentUser.id);
      }

      if (normalizedCurrent !== normalizedNext) {
        removeLocalUser(currentUsername);
      }
      upsertLocalUser(mergedUser);

      const updatedSession = {
        ...session,
        user: {
          ...currentUser,
          username: nextUsername,
        },
      };
      localStorage.setItem('simguru_session', JSON.stringify(updatedSession));

      const form = container.querySelector('#settings-form');
      form?.reset();
      setMessage('Akun berhasil diperbarui.');
    } catch (error) {
      console.error('Gagal memperbarui akun siswa:', error);
      setMessage('Gagal menyimpan perubahan akun.', true);
    }
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
