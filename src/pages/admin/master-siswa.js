import { renderLayout } from '../../layouts/dashboard-layout.js';
import { generateUsername, getStoredContext } from '../../utils/helpers.js';
import { saveDocument, getCollectionDocs, synchronizeCurrentClassMemberships, synchronizeRenamedUserReferences } from '../../firebase/data-service.js';
import { getManagedUsers, saveManagedUser, deleteManagedUser } from '../../firebase/auth-service.js';

export async function renderMasterSiswaPage(container) {
  const context = getStoredContext();
  const allUsers = await getManagedUsers('siswa');
  const kelasList = await getCollectionDocs('kelas');
  let kelasCatalog = kelasList;
  const siswaList = allUsers
    .filter((item) => item.role === 'siswa')
    .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
  const kelasFilterOptions = [...new Set([...(kelasCatalog || []).map((item) => item.nama || item.id).filter(Boolean), ...(siswaList || []).map((item) => item.kelas_nama || item.kelas_id).filter(Boolean)])];
  const totalSiswa = siswaList.length;
  const activeSiswa = siswaList.filter((item) => (item.status || 'active') === 'active').length;
  const kelasTerpakai = new Set(siswaList.map((item) => item.kelas_nama || item.kelas_id).filter(Boolean)).size;

  const html = renderLayout('Master Siswa', `
    <div class="space-y-6">
      <div class="rounded-[28px] border border-slate-200 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-6 text-white shadow-sm">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">Manajemen Data</p>
            <h3 class="mt-2 text-2xl font-semibold">Master Siswa</h3>
            <p class="mt-2 text-sm text-white/90">Kelola akun siswa, kelas, dan import data dengan tampilan yang lebih terstruktur dan profesional.</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-[0.2em] text-white/75">Total Siswa</p>
              <p class="mt-1 text-xl font-semibold">${totalSiswa}</p>
            </div>
            <div class="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-[0.2em] text-white/75">Aktif</p>
              <p class="mt-1 text-xl font-semibold">${activeSiswa}</p>
            </div>
            <div class="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-[0.2em] text-white/75">Kelas</p>
              <p class="mt-1 text-xl font-semibold">${kelasTerpakai}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div class="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 id="siswa-form-title" class="text-lg font-semibold text-slate-900">Tambah Siswa</h4>
              <p class="mt-1 text-sm text-slate-500">Buat akun siswa baru, tetapkan kelas, dan sesuaikan password secara langsung.</p>
            </div>
            <span class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">Form Master</span>
          </div>
          <form id="siswa-form" class="mt-5 grid gap-4 md:grid-cols-2">
            <div class="md:col-span-2">
              <label class="mb-2 block text-sm font-medium text-slate-700">Nama lengkap</label>
              <input id="siswa-nama" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition focus:border-sky-300 focus:bg-white" placeholder="Nama lengkap siswa" required />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Username</label>
              <input id="siswa-username" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition focus:border-sky-300 focus:bg-white" placeholder="Kosongkan untuk membuat dari nama" pattern="[A-Za-z0-9._-]{3,30}" />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <input id="siswa-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition focus:border-sky-300 focus:bg-white" placeholder="Password" required />
            </div>
            <div class="md:col-span-2">
              <label class="mb-2 block text-sm font-medium text-slate-700">Kelas</label>
              <input id="siswa-kelas" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition focus:border-sky-300 focus:bg-white" placeholder="Kode/Nama kelas (mis. X_1 atau X.1)" />
            </div>
            <div class="md:col-span-2 flex flex-wrap gap-2">
              <button id="siswa-submit-btn" type="submit" class="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm">Simpan Siswa</button>
              <button id="siswa-cancel-btn" type="button" class="hidden rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Batal</button>
            </div>
          </form>
        </div>

        <div class="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold text-slate-900">Import Siswa</h4>
              <p class="mt-1 text-sm text-slate-500">Unggah file CSV untuk mempercepat input data siswa dan asosiasi kelas.</p>
            </div>
            <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Bulk Upload</span>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <button id="download-siswa-template-btn" type="button" class="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">Unduh Template</button>
            <label class="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <span>Pilih File CSV</span>
              <input id="import-siswa-input" type="file" accept=".csv" class="hidden" />
            </label>
          </div>
          <div id="siswa-import-progress" class="mt-4 hidden">
            <div class="grid gap-3 sm:grid-cols-3">
              <div id="siswa-progress-step-1" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">1. Membaca file</div>
              <div id="siswa-progress-step-2" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">2. Mengolah data</div>
              <div id="siswa-progress-step-3" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">3. Menyimpan data</div>
            </div>
          </div>
          <div id="siswa-import-message" class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"></div>
        </div>
      </div>

      <div class="rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h4 class="text-lg font-semibold text-slate-900">Daftar Siswa</h4>
            <p class="mt-1 text-sm text-slate-500">Filter data berdasarkan kelas, status, atau kata kunci untuk pencarian yang cepat.</p>
          </div>
          <div class="flex flex-col gap-2 md:flex-row">
            <label class="text-sm text-slate-600">
              <span class="mb-1 block">Cari</span>
              <input id="siswa-search" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white" placeholder="Nama atau username" />
            </label>
            <label class="text-sm text-slate-600">
              <span class="mb-1 block">Kelas</span>
              <select id="siswa-kelas-filter" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white">
                <option value="all">Semua kelas</option>
                ${kelasFilterOptions.map((kelas) => `<option value="${kelas}">${kelas}</option>`).join('')}
              </select>
            </label>
            <label class="text-sm text-slate-600">
              <span class="mb-1 block">Status</span>
              <select id="siswa-status-filter" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white">
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Tidak aktif</option>
              </select>
            </label>
          </div>
        </div>

        <div class="p-5">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm text-slate-500">Menampilkan <span id="siswa-results-count" class="font-semibold text-slate-700">0</span> siswa</p>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="w-12 px-4 py-3 text-left">No</th>
                  <th class="px-4 py-3 text-left">Nama</th>
                  <th class="px-4 py-3 text-left">Username</th>
                  <th class="px-4 py-3 text-left">Kelas</th>
                  <th class="px-4 py-3 text-left">Status</th>
                  <th class="px-4 py-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody id="siswa-table-body" class="divide-y divide-slate-100 bg-white"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const tableBody = container.querySelector('#siswa-table-body');
  const resultsCount = container.querySelector('#siswa-results-count');
  const searchInput = container.querySelector('#siswa-search');
  const kelasFilter = container.querySelector('#siswa-kelas-filter');
  const statusFilter = container.querySelector('#siswa-status-filter');
  const progressContainer = container.querySelector('#siswa-import-progress');
  const messageBox = container.querySelector('#siswa-import-message');

  const filterState = {
    search: '',
    kelas: 'all',
    status: 'all',
  };

  const sortSiswaByNama = (items) => {
    return [...items].sort((a, b) => String(a.nama || '').trim().localeCompare(String(b.nama || '').trim(), 'id', { sensitivity: 'base' }));
  };

  const getVisibleSiswa = () => {
    const filtered = siswaList.filter((item) => {
      const nama = String(item.nama || '').toLowerCase();
      const username = String(item.username || '').toLowerCase();
      const kelas = String(item.kelas_nama || item.kelas_id || '').toLowerCase();
      const status = String(item.status || 'active').toLowerCase();
      const searchMatch = !filterState.search || `${nama} ${username}`.includes(filterState.search.toLowerCase());
      const kelasMatch = filterState.kelas === 'all' || kelas === filterState.kelas.toLowerCase();
      const statusMatch = filterState.status === 'all' || status === filterState.status.toLowerCase();
      return searchMatch && kelasMatch && statusMatch;
    });

    return sortSiswaByNama(filtered);
  };

  const bindRowActions = (visibleItems) => {
    container.querySelectorAll('[data-action="edit-siswa"]').forEach((button) => {
      button.addEventListener('click', () => {
        const accountId = button.dataset.accountId;
        const item = siswaList.find((entry) => entry.id === accountId);
        if (!item) return;
        container.querySelector('#siswa-nama').value = item.nama || '';
        container.querySelector('#siswa-username').value = item.username || '';
      container.querySelector('#siswa-password').value = '';
        container.querySelector('#siswa-kelas').value = item.kelas_nama || item.kelas_id || '';
        setEditMode(true, item.id, item.username);
      });
    });

    container.querySelectorAll('[data-action="delete-siswa"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const accountId = button.dataset.accountId;
        const item = siswaList.find((entry) => entry.id === accountId);
        if (!item) return;
        const confirmed = confirm(`Hapus akun siswa ${item.nama}?`);
        if (!confirmed) return;
        try {
          await deleteManagedUser(accountId);
          await synchronizeCurrentClassMemberships(context, [{ ...item, status: 'inactive' }]);
        } catch (error) {
          alert(error.message || 'Gagal menghapus siswa.');
          return;
        }
        alert('Siswa berhasil dihapus.');
        renderMasterSiswaPage(container);
      });
    });
  };

  const renderRows = () => {
    const visibleItems = getVisibleSiswa();
    resultsCount.textContent = visibleItems.length;

    if (!visibleItems.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">Tidak ada data siswa yang sesuai filter saat ini.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = visibleItems.map((item, index) => `
      <tr class="text-sm text-slate-600 hover:bg-slate-50">
        <td class="px-4 py-3 text-slate-500">${index + 1}</td>
        <td class="px-4 py-3">
          <div class="font-semibold text-slate-800">${item.nama}</div>
        </td>
        <td class="px-4 py-3">${item.username}</td>
        <td class="px-4 py-3">${item.kelas_nama || item.kelas_id || '-'}</td>
        <td class="px-4 py-3">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold ${String(item.status || 'active').toLowerCase() === 'inactive' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}">${String(item.status || 'active').toLowerCase() === 'inactive' ? 'Tidak aktif' : 'Aktif'}</span>
        </td>
        <td class="px-4 py-3">
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="edit-siswa" data-account-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
            <button type="button" data-action="delete-siswa" data-account-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus</button>
          </div>
        </td>
      </tr>
    `).join('');

    bindRowActions(visibleItems);
  };

  const setProgressState = (step, state) => {
    const el = container.querySelector(`#siswa-progress-step-${step}`);
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
    }).filter((record) => record.nama || record.username || record.password || record.kelas);
  };

  const ensureKelas = async (kelasInput) => {
    const raw = String(kelasInput || '').trim();
    if (!raw) return null;
    const normalizedId = raw.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
    const existing = kelasCatalog.find((item) => item.id === normalizedId || item.nama === raw || item.id === raw);
    if (existing) return existing;
    const newKelas = { id: normalizedId, nama: raw };
    await saveDocument('kelas', newKelas, normalizedId);
    kelasCatalog = [...kelasCatalog, newKelas];
    return newKelas;
  };

  container.querySelector('#download-siswa-template-btn')?.addEventListener('click', () => {
    const template = ['nama,username,password,kelas', 'Aditya Bayu Permana,adityabayupremana,123456,X.1', 'Budi Santoso,budisantoso,123456,X_2'].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template-siswa.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  container.querySelector('#import-siswa-input')?.addEventListener('change', async (event) => {
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
        const kelasInfo = await ensureKelas(row.kelas || row.kelas_nama || row.kelas_id || '');
        if (!nama) continue;
        const payload = { username, password, nama, role: 'siswa', status: 'active', created_at: new Date().toISOString(), tahun_ajaran_id: context.tahun_ajaran_aktif, semester_id: context.semester_aktif, kelas_id: kelasInfo?.id || '', kelas_nama: kelasInfo?.nama || '', username_lower: username.toLowerCase().replace(/\s+/g, '') };
         const savedUser = await saveManagedUser(payload);
         await synchronizeCurrentClassMemberships(context, [savedUser]);
        saved += 1;
      }
      setProgressState(3, 'done');
      messageBox.innerHTML = `<span class="font-semibold text-emerald-700">✓ Impor selesai.</span> ${saved} siswa berhasil disimpan.`;
      event.target.value = '';
      renderMasterSiswaPage(container);
    } catch (error) {
      setProgressState(3, 'idle');
      messageBox.innerHTML = `<span class="font-semibold text-rose-600">Import gagal.</span> ${error.message}`;
    }
  });

  let editingAccountId = null;
  let editingUsername = null;
  const form = container.querySelector('#siswa-form');
  const submitBtn = container.querySelector('#siswa-submit-btn');
  const cancelBtn = container.querySelector('#siswa-cancel-btn');
  const title = container.querySelector('#siswa-form-title');

  const setEditMode = (isEditing, accountId = '', username = '') => {
    editingAccountId = isEditing ? accountId : null;
    editingUsername = isEditing ? username : null;
    submitBtn.textContent = isEditing ? 'Perbarui Siswa' : 'Simpan Siswa';
    cancelBtn.classList.toggle('hidden', !isEditing);
    title.textContent = isEditing ? 'Edit Siswa' : 'Tambah Siswa';
    container.querySelector('#siswa-password').required = !isEditing;
    container.querySelector('#siswa-password').placeholder = isEditing ? 'Kosongkan jika password tidak diubah' : 'Password';
    if (!isEditing) {
      form.reset();
      container.querySelector('#siswa-username').value = '';
      container.querySelector('#siswa-password').value = '123456';
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nama = container.querySelector('#siswa-nama').value.trim();
    const password = container.querySelector('#siswa-password').value.trim();
    const kelasInput = container.querySelector('#siswa-kelas').value.trim();
    const username = container.querySelector('#siswa-username').value.trim() || generateUsername(nama);
    const kelasInfo = await ensureKelas(kelasInput);
    const payload = {
      username,
      ...(password ? { password } : {}),
      nama,
      role: 'siswa',
      status: 'active',
      created_at: new Date().toISOString(),
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      kelas_id: kelasInfo?.id || '',
      kelas_nama: kelasInfo?.nama || '',
      username_lower: username.toLowerCase().replace(/\s+/g, ''),
    };

    try {
      const savedUser = await saveManagedUser(payload, editingAccountId || '');
      await synchronizeCurrentClassMemberships(context, [savedUser]);
      const oldUsernames = new Set([
        editingUsername,
        ...(Array.isArray(savedUser.previous_usernames) ? savedUser.previous_usernames : []),
      ].filter((item) => item && item.toLowerCase() !== savedUser.username.toLowerCase()));
      for (const oldUsername of oldUsernames) {
        await synchronizeRenamedUserReferences(context, 'siswa', oldUsername, savedUser);
      }
    } catch (error) {
      alert(error.message || 'Gagal menyimpan siswa.');
      return;
    }
    const wasEditing = Boolean(editingUsername);
    setEditMode(false);
    alert(wasEditing ? `Siswa berhasil diperbarui.` : `Siswa berhasil disimpan dengan username ${username}`);
    renderMasterSiswaPage(container);
  });

  cancelBtn.addEventListener('click', () => setEditMode(false));

  ['input', 'change'].forEach((eventName) => {
    searchInput?.addEventListener(eventName, () => {
      filterState.search = searchInput.value.trim();
      renderRows();
    });
    kelasFilter?.addEventListener(eventName, () => {
      filterState.kelas = kelasFilter.value;
      renderRows();
    });
    statusFilter?.addEventListener(eventName, () => {
      filterState.status = statusFilter.value;
      renderRows();
    });
  });

  renderRows();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
