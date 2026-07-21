import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getCollectionDocs, saveDocument, deleteDocument, saveAppConfig, getAppConfig } from '../../firebase/data-service.js';
import { getStoredContext } from '../../utils/helpers.js';

function formatStatus(isActive) {
  return isActive
    ? '<span class="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Aktif</span>'
    : '<span class="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Tidak aktif</span>';
}

function buildPeriodRow(item, activeConfig) {
  const isActiveInConfig = activeConfig && activeConfig.tahun_ajaran_aktif === item.tahun_ajaran_id && activeConfig.semester_aktif === item.semester_id;
  const isActive = item.is_active || isActiveInConfig;
  return `
    <tr class="border-t border-slate-100 text-sm text-slate-600">
      <td class="px-3 py-3 font-medium text-slate-900">${item.tahun_ajaran_id || '-'}</td>
      <td class="px-3 py-3">${item.tahun_ajaran_nama || '-'}</td>
      <td class="px-3 py-3 font-medium text-slate-900">${item.semester_id || '-'}</td>
      <td class="px-3 py-3">${item.semester_nama || '-'}</td>
      <td class="px-3 py-3">${formatStatus(isActive)}</td>
      <td class="px-3 py-3">
        <div class="flex flex-wrap gap-2">
          ${!isActive ? `<button type="button" data-action="activate-period" data-id="${item.id}" class="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">Aktifkan</button>` : ''}
          <button type="button" data-action="edit-period" data-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
          <button type="button" data-action="delete-period" data-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus</button>
        </div>
      </td>
    </tr>
  `;
}

function getPeriodId(yearId, semesterId) {
  return `${String(yearId || '').trim()}_${String(semesterId || '').trim()}`.replace(/\s+/g, '_');
}

export async function renderMasterTahunAjaranPage(container) {
  const context = getStoredContext();
  const records = await getCollectionDocs('tahun_ajaran');
  const activeConfig = await getAppConfig();
  const activePeriodId = activeConfig?.tahun_ajaran_aktif && activeConfig?.semester_aktif ? `${activeConfig.tahun_ajaran_aktif}_${activeConfig.semester_aktif}` : '';

  const rows = records.length
    ? records.map((item) => buildPeriodRow(item, activeConfig)).join('')
    : '<tr><td colspan="6" class="px-3 py-4 text-sm text-slate-500">Belum ada periode yang disimpan.</td></tr>';

  const html = renderLayout('Master Tahun Ajaran', `
    <div class="space-y-6">
      <div class="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-[0_28px_60px_-32px_rgba(14,165,233,0.55)] sm:p-6">
        <div class="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/25 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Admin Console</p>
        <h3 class="mt-2 text-2xl font-bold tracking-tight">Kelola Tahun Ajaran & Semester</h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-white/90">Tambahkan, sunting, hapus, dan aktifkan periode belajar yang akan berlaku untuk seluruh pengguna.</p>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div class="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <h4 class="text-base font-semibold text-slate-900">Daftar Periode</h4>
          <div class="mt-4 overflow-x-auto rounded-3xl border border-slate-100 bg-slate-50 p-3">
            <table class="min-w-full text-left text-sm text-slate-700">
              <thead>
                <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-400">
                  <th class="px-3 py-3">Tahun Ajaran</th>
                  <th class="px-3 py-3">Nama Tahun</th>
                  <th class="px-3 py-3">Semester</th>
                  <th class="px-3 py-3">Nama Semester</th>
                  <th class="px-3 py-3">Status</th>
                  <th class="px-3 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody id="period-table-body">${rows}</tbody>
            </table>
          </div>
          <div class="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <p class="font-medium text-slate-900">Periode Aktif Saat Ini</p>
            <p class="mt-2 text-slate-700">${activeConfig?.tahun_ajaran_aktif_nama || '-'} • ${activeConfig?.semester_aktif_nama || '-'}</p>
            <p class="mt-1 text-slate-500">Perubahan periode aktif akan mempengaruhi seluruh modul dan input guru setelah halaman dimuat ulang.</p>
          </div>
        </div>

        <div class="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <h4 id="period-form-title" class="text-base font-semibold text-slate-900">Tambah Tahun Ajaran</h4>
          <form id="period-form" class="mt-4 space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Kode Tahun Ajaran</label>
              <input id="period-year-id" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: 2026_2027" required />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Nama Tahun Ajaran</label>
              <input id="period-year-name" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: 2026/2027" required />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Kode Semester</label>
              <input id="period-semester-id" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: 2026_2027_1" required />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-slate-700">Nama Semester</label>
              <input id="period-semester-name" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Contoh: Semester 1 (Ganjil)" required />
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Simpan Periode</button>
              <button id="period-cancel-btn" type="button" class="hidden rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Batal</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const periodTableBody = container.querySelector('#period-table-body');
  const periodForm = container.querySelector('#period-form');
  const formTitle = container.querySelector('#period-form-title');
  const cancelBtn = container.querySelector('#period-cancel-btn');
  const yearIdInput = container.querySelector('#period-year-id');
  const yearNameInput = container.querySelector('#period-year-name');
  const semesterIdInput = container.querySelector('#period-semester-id');
  const semesterNameInput = container.querySelector('#period-semester-name');

  let editingId = null;

  const refreshPage = async () => {
    await renderMasterTahunAjaranPage(container);
  };

  const setEditMode = (record) => {
    editingId = record?.id || null;
    formTitle.textContent = editingId ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran';
    cancelBtn.classList.toggle('hidden', !editingId);
    if (editingId) {
      yearIdInput.value = record.tahun_ajaran_id || '';
      yearNameInput.value = record.tahun_ajaran_nama || '';
      semesterIdInput.value = record.semester_id || '';
      semesterNameInput.value = record.semester_nama || '';
      yearIdInput.disabled = true;
      semesterIdInput.disabled = true;
    } else {
      periodForm.reset();
      yearIdInput.disabled = false;
      semesterIdInput.disabled = false;
    }
  };

  const activatePeriod = async (recordId) => {
    const recordsToSave = records.map((record) => ({
      ...record,
      is_active: record.id === recordId,
    }));

    await Promise.all(recordsToSave.map((record) => saveDocument('tahun_ajaran', record, record.id)));
    const activeRecord = records.find((record) => record.id === recordId);
    if (!activeRecord) {
      alert('Periode tidak ditemukan.');
      return;
    }

    const updatedContext = {
      ...getStoredContext(),
      tahun_ajaran_aktif: activeRecord.tahun_ajaran_id,
      tahun_ajaran_aktif_nama: activeRecord.tahun_ajaran_nama,
      semester_aktif: activeRecord.semester_id,
      semester_aktif_nama: activeRecord.semester_nama,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem('simguru_context', JSON.stringify(updatedContext));
    await saveAppConfig({
      tahun_ajaran_aktif: activeRecord.tahun_ajaran_id,
      tahun_ajaran_aktif_nama: activeRecord.tahun_ajaran_nama,
      semester_aktif: activeRecord.semester_id,
      semester_aktif_nama: activeRecord.semester_nama,
    });
    alert('Periode aktif berhasil diubah. Muat ulang halaman guru untuk melihat perubahan.');
    await refreshPage();
  };

  periodTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const recordId = button.getAttribute('data-id');
    const record = records.find((item) => item.id === recordId);
    if (!record) return;

    if (action === 'edit-period') {
      setEditMode(record);
      return;
    }

    if (action === 'delete-period') {
      const confirmed = confirm('Yakin ingin menghapus periode ini?');
      if (!confirmed) return;
      await deleteDocument('tahun_ajaran', recordId);
      await refreshPage();
      return;
    }

    if (action === 'activate-period') {
      await activatePeriod(recordId);
      return;
    }
  });

  periodForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tahunAjaranId = yearIdInput.value.trim();
    const tahunAjaranName = yearNameInput.value.trim();
    const semesterId = semesterIdInput.value.trim();
    const semesterName = semesterNameInput.value.trim();

    if (!tahunAjaranId || !tahunAjaranName || !semesterId || !semesterName) {
      alert('Semua kolom harus diisi.');
      return;
    }

    const recordId = editingId || getPeriodId(tahunAjaranId, semesterId);
    await saveDocument('tahun_ajaran', {
      id: recordId,
      tahun_ajaran_id: tahunAjaranId,
      tahun_ajaran_nama: tahunAjaranName,
      semester_id: semesterId,
      semester_nama: semesterName,
      is_active: editingId ? records.find((item) => item.id === editingId)?.is_active || false : false,
    }, recordId);

    setEditMode(null);
    await refreshPage();
  });

  cancelBtn.addEventListener('click', () => setEditMode(null));
  setEditMode(null);
}
