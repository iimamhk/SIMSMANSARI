import { renderLayout } from '../../layouts/dashboard-layout.js';
import { generateUsername, getStoredContext } from '../../utils/helpers.js';
import { synchronizeRenamedUserReferences } from '../../firebase/data-service.js';
import { getManagedUsers, saveManagedUser, deleteManagedUser } from '../../firebase/auth-service.js';

export async function renderMasterGuruPage(container) {
  const context = getStoredContext();
  const guruList = await getManagedUsers('guru');
  const guruRows = guruList
    .map((item) => `
      <tr class="border-t border-slate-100 text-sm text-slate-600">
        <td class="px-3 py-2">${item.nama}</td>
        <td class="px-3 py-2">${item.username}</td>
        <td class="px-3 py-2">Tersimpan aman</td>
        <td class="px-3 py-2">${item.status || 'active'}</td>
        <td class="px-3 py-2">
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="edit-guru" data-account-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
            <button type="button" data-action="delete-guru" data-account-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  const html = renderLayout('Master Guru', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-[0_28px_60px_-32px_rgba(14,165,233,0.55)] sm:p-6">
        <div class="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/25 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Admin Console</p>
        <h3 id="guru-form-title" class="mt-2 text-2xl font-bold tracking-tight">Master Guru</h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-white/90">Password hanya diproses server dan tidak pernah ditampilkan kembali.</p>
      </div>

      <div class="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
        <h4 class="text-base font-semibold text-slate-900">Import Guru</h4>
        <p class="mt-1 text-sm text-slate-500">Unggah file CSV untuk menambah data guru sekaligus.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button id="download-guru-template-btn" type="button" class="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">Unduh Template</button>
          <label class="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 font-semibold text-slate-700">
            <span>Pilih File CSV</span>
            <input id="import-guru-input" type="file" accept=".csv" class="hidden" />
          </label>
        </div>
        <div id="guru-import-progress" class="mt-4 hidden">
          <div class="grid gap-3 sm:grid-cols-3">
            <div id="guru-progress-step-1" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">1. Membaca file</div>
            <div id="guru-progress-step-2" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">2. Mengolah data</div>
            <div id="guru-progress-step-3" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">3. Menyimpan data</div>
          </div>
        </div>
        <div id="guru-import-message" class="mt-3 text-sm text-slate-600"></div>
      </div>

      <form id="guru-form" class="space-y-3 rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
        <input id="guru-nama" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Nama lengkap guru" required />
        <input id="guru-username" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Kosongkan untuk membuat dari nama" pattern="[A-Za-z0-9._-]{3,30}" />
        <input id="guru-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Password" required />
        <div class="flex flex-wrap gap-2">
          <button id="guru-submit-btn" type="submit" class="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Simpan Guru</button>
          <button id="guru-cancel-btn" type="button" class="hidden rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Batal</button>
        </div>
      </form>

      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-100 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Daftar Guru</div>
        <table class="w-full text-left">
          <thead class="bg-white text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th class="px-3 py-2">Nama</th>
              <th class="px-3 py-2">Username</th>
              <th class="px-3 py-2">Password</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>${guruRows}</tbody>
        </table>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const progressContainer = container.querySelector('#guru-import-progress');
  const messageBox = container.querySelector('#guru-import-message');
  const setProgressState = (step, state) => {
    const el = container.querySelector(`#guru-progress-step-${step}`);
    if (!el) return;
    if (state === 'done') {
      el.className = 'rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700';
      el.textContent = `✓ ${el.textContent.replace(/^\d+\.\s*/, '')}`;
    } else if (state === 'active') {
      el.className = 'rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700';
    } else {
      el.className = 'rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-600';
    }
  };
  const resetProgress = () => {
    progressContainer?.classList.remove('hidden');
    [1, 2, 3].forEach((step) => setProgressState(step, 'idle'));
    setProgressState(1, 'active');
    messageBox.textContent = '';
  };
  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(',').map((item) => item.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((item) => item.trim());
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      return record;
    }).filter((record) => record.nama || record.username || record.password);
  };

  container.querySelector('#download-guru-template-btn')?.addEventListener('click', () => {
    const template = ['nama,username,password', 'Imam Budiharto,imambudiharto,123456', 'Tatimmatul Ianah,tatimmatulianah,123456'].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template-guru.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  container.querySelector('#import-guru-input')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    resetProgress();
    try {
      const text = await file.text();
      setProgressState(1, 'done');
      setProgressState(2, 'active');
      const rows = parseCsv(text);
      if (!rows.length) throw new Error('File kosong atau format tidak valid.');
      setProgressState(2, 'done');
      setProgressState(3, 'active');
      let saved = 0;
      for (const row of rows) {
        const nama = String(row.nama || '').trim();
        const username = String(row.username || generateUsername(nama)).trim();
        const password = String(row.password || '123456').trim();
        if (!nama) continue;
         const payload = { username, password, nama, role: 'guru', status: 'active', created_at: new Date().toISOString(), tahun_ajaran_id: context.tahun_ajaran_aktif, semester_id: context.semester_aktif };
         await saveManagedUser(payload);
        saved += 1;
      }
      setProgressState(3, 'done');
      messageBox.innerHTML = `<span class="font-semibold text-emerald-700">✓ Impor selesai.</span> ${saved} guru berhasil disimpan.`;
      event.target.value = '';
      renderMasterGuruPage(container);
    } catch (error) {
      setProgressState(3, 'idle');
      messageBox.innerHTML = `<span class="font-semibold text-rose-600">Import gagal.</span> ${error.message}`;
    }
  });

  let editingAccountId = null;
  let editingUsername = null;
  const form = container.querySelector('#guru-form');
  const submitBtn = container.querySelector('#guru-submit-btn');
  const cancelBtn = container.querySelector('#guru-cancel-btn');
  const title = container.querySelector('#guru-form-title');

  const setEditMode = (isEditing, accountId = '', username = '') => {
    editingAccountId = isEditing ? accountId : null;
    editingUsername = isEditing ? username : null;
    submitBtn.textContent = isEditing ? 'Perbarui Guru' : 'Simpan Guru';
    cancelBtn.classList.toggle('hidden', !isEditing);
    title.textContent = isEditing ? 'Edit Guru' : 'Tambah Guru';
    container.querySelector('#guru-password').required = !isEditing;
    container.querySelector('#guru-password').placeholder = isEditing ? 'Kosongkan jika password tidak diubah' : 'Password';
    if (!isEditing) {
      form.reset();
      container.querySelector('#guru-username').value = '';
      container.querySelector('#guru-password').value = '123456';
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nama = container.querySelector('#guru-nama').value.trim();
    const password = container.querySelector('#guru-password').value.trim();
    const username = container.querySelector('#guru-username').value.trim() || generateUsername(nama);

    const payload = {
      username,
      ...(password ? { password } : {}),
      nama,
      role: 'guru',
      status: 'active',
      created_at: new Date().toISOString(),
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      username_lower: username.toLowerCase().replace(/\s+/g, ''),
    };

    try {
      const savedUser = await saveManagedUser(payload, editingAccountId || '');
      const oldUsernames = new Set([
        editingUsername,
        ...(Array.isArray(savedUser.previous_usernames) ? savedUser.previous_usernames : []),
      ].filter((item) => item && item.toLowerCase() !== savedUser.username.toLowerCase()));
      for (const oldUsername of oldUsernames) {
        await synchronizeRenamedUserReferences(context, 'guru', oldUsername, savedUser);
      }
    } catch (error) {
      alert(error.message || 'Gagal menyimpan guru.');
      return;
    }
    const wasEditing = Boolean(editingUsername);
    setEditMode(false);
    alert(wasEditing ? `Guru berhasil diperbarui.` : `Guru berhasil disimpan dengan username ${username}`);
    renderMasterGuruPage(container);
  });

  cancelBtn.addEventListener('click', () => setEditMode(false));

  container.querySelectorAll('[data-action="edit-guru"]').forEach((button) => {
    button.addEventListener('click', () => {
      const accountId = button.dataset.accountId;
      const item = guruList.find((entry) => entry.id === accountId);
      if (!item) return;
      container.querySelector('#guru-nama').value = item.nama || '';
      container.querySelector('#guru-username').value = item.username || '';
       container.querySelector('#guru-password').value = '';
      setEditMode(true, item.id, item.username);
    });
  });

  container.querySelectorAll('[data-action="delete-guru"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accountId = button.dataset.accountId;
      const item = guruList.find((entry) => entry.id === accountId);
      if (!item) return;
      const confirmed = confirm(`Hapus akun guru ${item.nama}?`);
      if (!confirmed) return;
       try {
         await deleteManagedUser(accountId);
       } catch (error) {
         alert(error.message || 'Gagal menghapus guru.');
         return;
      }
      alert('Guru berhasil dihapus.');
      renderMasterGuruPage(container);
    });
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
