import { renderLayout } from '../../layouts/dashboard-layout.js';
import { changePassword, normalizePassword } from '../../firebase/auth-service.js';
import { getReadMeter, resetReadMeter } from '../../firebase/data-service.js';

const FIRESTORE_DAILY_READ_LIMIT = 50000; // Kuota baca harian paket gratis Firestore.

function readMeterBarTone(total) {
  const ratio = total / FIRESTORE_DAILY_READ_LIMIT;
  if (ratio >= 0.8) return { bar: 'bg-rose-500', text: 'text-rose-600' };
  if (ratio >= 0.5) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
}

function renderReadMeterBody() {
  const meter = getReadMeter();
  const total = Number(meter.total) || 0;
  const percent = Math.min(100, Math.round((total / FIRESTORE_DAILY_READ_LIMIT) * 100));
  const tone = readMeterBarTone(total);
  const entries = Object.entries(meter.byCollection || {});
  const topRows = entries.slice(0, 10).map(([name, count]) => `
    <div class="flex items-center justify-between gap-3 py-1 text-sm">
      <span class="truncate font-mono text-slate-600">${name}</span>
      <span class="shrink-0 font-semibold text-slate-900">${Number(count).toLocaleString('id-ID')}</span>
    </div>`).join('');
  const updated = meter.updatedAt ? new Date(meter.updatedAt).toLocaleTimeString('id-ID') : '-';

  return `
    <div class="flex items-baseline justify-between">
      <span class="text-sm text-slate-500">Read hari ini</span>
      <span class="text-2xl font-bold ${tone.text}">${total.toLocaleString('id-ID')}</span>
    </div>
    <div class="mt-1 text-xs text-slate-400">dari kuota ${FIRESTORE_DAILY_READ_LIMIT.toLocaleString('id-ID')}/hari · ${percent}%</div>
    <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div class="h-full ${tone.bar} transition-all" style="width:${percent}%"></div>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="rounded-xl bg-slate-50 p-3">
        <div class="text-xs text-slate-500">Sesi ini</div>
        <div class="text-lg font-semibold text-slate-900">${(Number(meter.sessionTotal) || 0).toLocaleString('id-ID')}</div>
      </div>
      <div class="rounded-xl bg-slate-50 p-3">
        <div class="text-xs text-slate-500">Diperbarui</div>
        <div class="text-lg font-semibold text-slate-900">${updated}</div>
      </div>
    </div>
    ${topRows ? `
      <div class="mt-3 border-t border-slate-100 pt-2">
        <div class="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Per koleksi (terbanyak)</div>
        ${topRows}
      </div>` : '<p class="mt-3 text-sm text-slate-400">Belum ada pembacaan tercatat pada sesi ini.</p>'}`;
}

export async function renderGuruSystemSettingsPage(container) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const currentUser = session?.user || {};
  const currentUsername = currentUser.username || '';

  const html = renderLayout('Pengaturan Akun', `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-lg font-semibold text-slate-900">Pengaturan Akun Guru</h3>
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

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-slate-900">Pemantau Baca Database</h3>
            <p class="mt-1 text-xs text-slate-500">Diagnostik kuota baca Firestore. Angka hanya menghitung pembacaan dari server (bukan dari cache).</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button type="button" id="read-meter-refresh" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Segarkan</button>
            <button type="button" id="read-meter-reset" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">Reset sesi</button>
          </div>
        </div>
        <div id="read-meter-body" class="mt-3">${renderReadMeterBody()}</div>
      </div>
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
      if (newUsername && newUsername !== currentUsername) {
        setMessage('Perubahan username dilakukan melalui administrator.', true);
        return;
      }
      if (newPassword) await changePassword(newPassword);

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
      setMessage('Akun berhasil diperbarui.');
    } catch (error) {
      console.error('Gagal memperbarui akun guru:', error);
      setMessage('Gagal menyimpan perubahan akun.', true);
    }
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });

  // ── Pemantau baca database ────────────────────────────────────────────────
  const readMeterBody = container.querySelector('#read-meter-body');
  const refreshReadMeter = () => {
    if (readMeterBody) readMeterBody.innerHTML = renderReadMeterBody();
  };
  container.querySelector('#read-meter-refresh')?.addEventListener('click', refreshReadMeter);
  container.querySelector('#read-meter-reset')?.addEventListener('click', () => {
    resetReadMeter();
    refreshReadMeter();
  });
  // Segarkan berkala selama halaman terbuka; hentikan saat elemen tak lagi ada.
  const readMeterTimer = setInterval(() => {
    if (!document.body.contains(readMeterBody)) {
      clearInterval(readMeterTimer);
      return;
    }
    if (!document.hidden) refreshReadMeter();
  }, 5000);
}
