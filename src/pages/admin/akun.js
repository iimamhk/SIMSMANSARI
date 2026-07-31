import { renderLayout } from '../../layouts/dashboard-layout.js';
import { changePassword, normalizePassword } from '../../firebase/auth-service.js';
import { adminAccentPanel, adminIcons, adminPageHero, bindAdminLogout } from '../../utils/admin-ui.js';

export async function renderAdminAccountPage(container) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const currentUser = session?.user || {};
  const currentUsername = currentUser.username || '';

  container.innerHTML = renderLayout('Akun & Keamanan', `
    <div class="space-y-6">
      ${adminPageHero({
        eyebrow: 'Keamanan',
        title: 'Akun Admin',
        description: 'Perbarui username atau password akun admin yang sedang aktif. Password disimpan terenkripsi di server.',
        chips: [`${adminIcons.shield} ${currentUsername || 'Administrator'}`],
      })}

      <section class="rounded-[24px] border border-sky-100 bg-white p-4 shadow-[0_16px_40px_-30px_rgba(14,165,233,.5)] sm:p-6">
        <div class="mb-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">Keamanan</p>
          <h3 class="mt-1 text-lg font-bold text-slate-900">Ubah Kredensial</h3>
          <p class="mt-1 text-xs leading-5 text-slate-500">Kosongkan bagian yang tidak ingin diubah.</p>
        </div>
        <form id="settings-form" class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Username Saat Ini</label>
            <input value="${currentUsername}" disabled class="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none" />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Username Baru</label>
            <input id="new-username" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Kosongkan jika tidak diubah" />
            <p class="mt-1 text-xs text-slate-500">Gunakan 3-30 karakter tanpa spasi (huruf, angka, titik, garis bawah, atau minus).</p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Password Baru</label>
              <input id="new-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Minimal 6 karakter" />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Konfirmasi Password Baru</label>
              <input id="confirm-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Ulangi password baru" />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button type="submit" class="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-cyan-600">Simpan Akun</button>
            <p id="account-message" class="text-sm text-slate-500"></p>
          </div>
        </form>
      </section>
    </div>
  `, { accentPanel: adminAccentPanel() });

  bindAdminLogout(container);

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
}
