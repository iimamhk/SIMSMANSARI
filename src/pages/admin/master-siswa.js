import { renderLayout } from '../../layouts/dashboard-layout.js';
import { generateUsername, getStoredContext } from '../../utils/helpers.js';
import { saveDocument, getCollectionDocs, synchronizeCurrentClassMemberships, synchronizeRenamedUserReferences } from '../../firebase/data-service.js';
import { getManagedUsers, saveManagedUser, deleteManagedUser } from '../../firebase/auth-service.js';

export async function renderMasterSiswaPage(container) {
  const context = getStoredContext();

  // Muat seluruh siswa SATU KALI (hasilnya di-cache oleh getManagedUsers dengan TTL,
  // sehingga filter/pencarian/paginasi berikutnya tidak memicu read tambahan).
  const [allStudents, kelasList] = await Promise.all([
    getManagedUsers('siswa'),
    getCollectionDocs('kelas'),
  ]);
  let kelasCatalog = kelasList;
  let siswaList = (Array.isArray(allStudents) ? allStudents : [])
    .filter((item) => item.role === 'siswa')
    .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
  const totalUsers = siswaList.length;
  const kelasFilterOptions = [...new Set([...(kelasCatalog || []).map((item) => item.nama || item.id).filter(Boolean), ...(siswaList || []).map((item) => item.kelas_nama || item.kelas_id).filter(Boolean)])]
    .sort((a, b) => String(a).localeCompare(String(b), 'id', { sensitivity: 'base' }));
  const totalSiswa = totalUsers;
  const activeSiswa = siswaList.filter((item) => (item.status || 'active') === 'active').length;
  const kelasTerpakai = new Set(siswaList.map((item) => item.kelas_nama || item.kelas_id).filter(Boolean)).size;

  const html = renderLayout('Master Siswa', `
    <div class="space-y-6">
      <div class="rounded-[28px] border border-slate-200 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-6 text-white shadow-sm">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">Manajemen Data</p>
            <h3 class="mt-2 text-2xl font-semibold">Master Siswa</h3>
            <p class="mt-2 text-sm text-white/90">Kelola akun siswa, kelas, dan impor data.</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-[0.2em] text-white/75">Total Siswa</p>
              <p id="stat-total-siswa" class="mt-1 text-xl font-semibold">${totalSiswa}</p>
            </div>
            <div class="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-[0.2em] text-white/75">Siswa Aktif</p>
              <p id="stat-active-siswa" class="mt-1 text-xl font-semibold">${activeSiswa}</p>
            </div>
            <div class="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-[0.2em] text-white/75">Kelas Terpakai</p>
              <p id="stat-kelas-terpakai" class="mt-1 text-xl font-semibold">${kelasTerpakai}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <div class="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold text-slate-900">Tambah Siswa</h4>
              <p class="mt-1 text-sm text-slate-500">Tambah satu akun siswa.</p>
            </div>
          </div>
          <button id="open-siswa-form-btn" type="button" class="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-sky-600 hover:to-cyan-600">Tambah Siswa Baru</button>
        </div>

        <div class="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold text-slate-900">Import Siswa</h4>
              <p class="mt-1 text-sm text-slate-500">Impor banyak siswa sekaligus dari file CSV.</p>
            </div>
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
            <p class="text-sm text-slate-500" aria-live="polite">Menampilkan <span id="siswa-results-count" class="font-semibold text-slate-700">0</span> siswa</p>
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
          <div id="siswa-pagination" class="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
              <p id="siswa-page-summary" class="text-xs text-slate-500" aria-live="polite"></p>
              <label class="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Tampil</span>
                <select id="siswa-page-size" class="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white">
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="40">40</option>
                </select>
              </label>
            </div>
            <div class="flex items-center gap-2">
              <button id="siswa-prev-page" type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
              <span id="siswa-page-number" class="min-w-20 text-center text-xs font-semibold text-slate-700"></span>
              <button id="siswa-next-page" type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
            </div>
          </div>
        </div>
      </div>

      <dialog id="siswa-dialog" aria-labelledby="siswa-form-title" class="m-auto max-h-[92vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-hidden rounded-[28px] border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-sm">
        <div class="max-h-[92vh] overflow-y-auto">
          <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Data Siswa</p>
              <h4 id="siswa-form-title" class="mt-1 text-xl font-semibold text-slate-900">Tambah Siswa</h4>
            </div>
            <button id="siswa-dialog-close" type="button" aria-label="Tutup formulir" class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">Tutup</button>
          </div>
          <form id="siswa-form" class="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div class="sm:col-span-2">
              <label for="siswa-nama" class="mb-2 block text-sm font-medium text-slate-700">Nama lengkap</label>
              <input id="siswa-nama" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Nama lengkap siswa" required />
            </div>
            <div>
              <label for="siswa-username" class="mb-2 block text-sm font-medium text-slate-700">Username</label>
              <input id="siswa-username" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Otomatis dari nama" pattern="[A-Za-z0-9._-]{3,30}" />
            </div>
            <div>
              <label for="siswa-password" class="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <input id="siswa-password" type="password" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Password" required />
            </div>
            <div class="sm:col-span-2">
              <label for="siswa-kelas" class="mb-2 block text-sm font-medium text-slate-700">Kelas</label>
              <input id="siswa-kelas" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Kode/Nama kelas (mis. X_1 atau X.1)" />
            </div>
            <div class="sticky bottom-0 -mx-5 -mb-5 flex gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:col-span-2 sm:-mx-6 sm:-mb-6 sm:px-6">
              <button id="siswa-submit-btn" type="submit" class="flex-1 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60">Simpan Siswa</button>
              <button id="siswa-cancel-btn" type="button" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Batal</button>
            </div>
          </form>
        </div>
      </dialog>
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
  const dialog = container.querySelector('#siswa-dialog');
  const pageSummary = container.querySelector('#siswa-page-summary');
  const pageNumber = container.querySelector('#siswa-page-number');
  const prevPageBtn = container.querySelector('#siswa-prev-page');
  const nextPageBtn = container.querySelector('#siswa-next-page');
  const pageSizeSelect = container.querySelector('#siswa-page-size');
  let PAGE_SIZE = 10;
  let currentPage = 1;
  let lastEditTrigger = null;

  const filterState = {
    search: '',
    kelas: 'all',
    status: 'all',
  };

  const closeDialog = () => {
    if (dialog?.open) dialog.close();
    lastEditTrigger?.focus?.();
    lastEditTrigger = null;
  };

  const openDialog = (trigger = null) => {
    lastEditTrigger = trigger;
    dialog?.showModal();
    requestAnimationFrame(() => container.querySelector('#siswa-nama')?.focus());
  };

  const getVisibleSiswa = () => {
    const q = filterState.search.trim().toLowerCase();
    const kelasSel = filterState.kelas.toLowerCase();
    const statusSel = filterState.status.toLowerCase();
    return siswaList.filter((item) => {
      const nama = String(item.nama || '').toLowerCase();
      const username = String(item.username || '').toLowerCase();
      const kelas = String(item.kelas_nama || item.kelas_id || '').toLowerCase();
      const status = String(item.status || 'active').toLowerCase();
      const searchMatch = !q || nama.includes(q) || username.includes(q);
      const kelasMatch = filterState.kelas === 'all' || kelas === kelasSel;
      const statusMatch = filterState.status === 'all' || status === statusSel;
      return searchMatch && kelasMatch && statusMatch;
    });
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
        openDialog(button);
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
        // Hapus dari daftar lokal & render ulang tanpa memuat ulang seluruh siswa dari server.
        siswaList = siswaList.filter((entry) => entry.id !== accountId);
        refreshStats();
        renderRows();
      });
    });
  };

  const renderRows = () => {
    const visibleItems = getVisibleSiswa();
    const totalFiltered = visibleItems.length;
    resultsCount.textContent = totalFiltered;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = visibleItems.slice(startIndex, startIndex + PAGE_SIZE);
    const rangeStart = totalFiltered ? startIndex + 1 : 0;
    const rangeEnd = startIndex + pageItems.length;
    pageSummary.textContent = `${rangeStart}-${rangeEnd} dari ${totalFiltered} siswa`;
    pageNumber.textContent = `Halaman ${currentPage}/${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;

    if (!pageItems.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">Tidak ada data siswa yang sesuai filter saat ini.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = pageItems.map((item, index) => `
      <tr class="text-sm text-slate-600 hover:bg-slate-50">
        <td class="px-4 py-3 text-slate-500">${startIndex + index + 1}</td>
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

    bindRowActions(pageItems);
  };

  // Perbarui angka ringkasan (header) dari data lokal — tanpa membaca ulang Firestore.
  const refreshStats = () => {
    const totalEl = container.querySelector('#stat-total-siswa');
    const activeEl = container.querySelector('#stat-active-siswa');
    const kelasEl = container.querySelector('#stat-kelas-terpakai');
    if (totalEl) totalEl.textContent = siswaList.length;
    if (activeEl) activeEl.textContent = siswaList.filter((item) => (item.status || 'active') === 'active').length;
    if (kelasEl) kelasEl.textContent = new Set(siswaList.map((item) => item.kelas_nama || item.kelas_id).filter(Boolean)).size;
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
      const importedUsers = [];
      for (const row of rows) {
        const nama = String(row.nama || '').trim();
        const username = String(row.username || generateUsername(nama)).trim();
        const password = String(row.password || '123456').trim();
        const kelasInfo = await ensureKelas(row.kelas || row.kelas_nama || row.kelas_id || '');
        if (!nama) continue;
        const payload = { username, password, nama, role: 'siswa', status: 'active', created_at: new Date().toISOString(), tahun_ajaran_id: context.tahun_ajaran_aktif, semester_id: context.semester_aktif, kelas_id: kelasInfo?.id || '', kelas_nama: kelasInfo?.nama || '', username_lower: username.toLowerCase().replace(/\s+/g, '') };
         const savedUser = await saveManagedUser(payload);
         await synchronizeCurrentClassMemberships(context, [savedUser]);
        importedUsers.push(savedUser);
        saved += 1;
      }
      setProgressState(3, 'done');
      messageBox.innerHTML = `<span class="font-semibold text-emerald-700">✓ Impor selesai.</span> ${saved} siswa berhasil disimpan.`;
      event.target.value = '';
      // Gabungkan hasil impor ke daftar lokal & render ulang tanpa membaca ulang seluruh siswa.
      importedUsers.forEach((u) => {
        const idx = siswaList.findIndex((entry) => entry.id === u.id);
        if (idx >= 0) siswaList[idx] = { ...siswaList[idx], ...u };
        else siswaList.push(u);
      });
      siswaList.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
      refreshStats();
      renderRows();
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
    title.textContent = isEditing ? 'Edit Siswa' : 'Tambah Siswa';
    container.querySelector('#siswa-password').required = !isEditing;
    container.querySelector('#siswa-password').placeholder = isEditing ? 'Kosongkan jika password tidak diubah' : 'Password';
    if (!isEditing) {
      form.reset();
      container.querySelector('#siswa-username').value = '';
      container.querySelector('#siswa-password').value = '';
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    const previousSubmitLabel = submitBtn.textContent;
    submitBtn.textContent = editingAccountId ? 'Memperbarui...' : 'Menyimpan...';
    const nama = container.querySelector('#siswa-nama').value.trim();
    const password = container.querySelector('#siswa-password').value.trim();
    const kelasInput = container.querySelector('#siswa-kelas').value.trim();
    const username = container.querySelector('#siswa-username').value.trim() || generateUsername(nama);
    try {
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
      const savedUser = await saveManagedUser(payload, editingAccountId || '');
      await synchronizeCurrentClassMemberships(context, [savedUser]);
      const oldUsernames = new Set([
        editingUsername,
        ...(Array.isArray(savedUser.previous_usernames) ? savedUser.previous_usernames : []),
      ].filter((item) => item && item.toLowerCase() !== savedUser.username.toLowerCase()));
      for (const oldUsername of oldUsernames) {
        await synchronizeRenamedUserReferences(context, 'siswa', oldUsername, savedUser);
      }
      // Perbarui daftar lokal (tambah/edit) agar tidak perlu membaca ulang seluruh siswa.
      const existingIndex = siswaList.findIndex((entry) => entry.id === savedUser.id);
      if (existingIndex >= 0) {
        siswaList[existingIndex] = { ...siswaList[existingIndex], ...savedUser };
      } else {
        siswaList.push(savedUser);
      }
      siswaList.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }));
    } catch (error) {
      alert(error.message || 'Gagal menyimpan siswa.');
      submitBtn.disabled = false;
      submitBtn.textContent = previousSubmitLabel;
      return;
    }
    const wasEditing = Boolean(editingUsername);
    setEditMode(false);
    closeDialog();
    alert(wasEditing ? `Siswa berhasil diperbarui.` : `Siswa berhasil disimpan dengan username ${username}`);
    refreshStats();
    renderRows();
  });

  cancelBtn.addEventListener('click', () => {
    setEditMode(false);
    closeDialog();
  });
  container.querySelector('#siswa-dialog-close')?.addEventListener('click', () => {
    setEditMode(false);
    closeDialog();
  });
  container.querySelector('#open-siswa-form-btn')?.addEventListener('click', (event) => {
    setEditMode(false);
    openDialog(event.currentTarget);
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) {
      setEditMode(false);
      closeDialog();
    }
  });
  dialog?.addEventListener('cancel', () => setEditMode(false));

  prevPageBtn?.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderRows();
  });
  nextPageBtn?.addEventListener('click', () => {
    currentPage += 1;
    renderRows();
  });

  if (pageSizeSelect) {
    pageSizeSelect.value = String(PAGE_SIZE);
    pageSizeSelect.addEventListener('change', () => {
      PAGE_SIZE = Number(pageSizeSelect.value) || 10;
      currentPage = 1;
      renderRows();
    });
  }

  // Filter & pencarian murni di sisi klien (data sudah dimuat sekali, tidak ada read tambahan).
  let searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        filterState.search = searchInput.value.trim();
        currentPage = 1;
        renderRows();
      }, 200);
    });
  }
  if (kelasFilter) {
    kelasFilter.addEventListener('change', () => {
      filterState.kelas = kelasFilter.value || 'all';
      currentPage = 1;
      renderRows();
    });
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      filterState.status = statusFilter.value || 'all';
      currentPage = 1;
      renderRows();
    });
  }

  renderRows();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
