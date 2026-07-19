import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { saveDocument, deleteDocument, getCollectionDocs, getActiveTeachingAssignments, getAppConfig, saveAppConfig, createPembelajaranFromPlotting } from '../../firebase/data-service.js';
import { getManagedUsers } from '../../firebase/auth-service.js';

export async function renderPlottingJadwalPage(container) {
  const context = getStoredContext();
  const guruList = await getManagedUsers('guru');
  const mapelList = await getCollectionDocs('mata_pelajaran');
  const kelasList = await getCollectionDocs('kelas');
  const assignments = await getActiveTeachingAssignments(context);
  const appConfig = await getAppConfig();
  const guruBolehIsi = appConfig.guru_boleh_isi_relasi !== false;

  const guruOptions = guruList
    .map((item) => `<option value="${item.username}">${item.nama}</option>`)
    .join('');
  const mapelOptions = mapelList
    .map((item) => `<option value="${item.id}">${item.nama}</option>`)
    .join('');
  const kelasOptions = kelasList
    .map((item) => `<option value="${item.id}">${item.nama}</option>`)
    .join('');

  const assignmentRows = assignments
    .map(
      (item) => `
        <tr class="border-t border-slate-100 text-sm text-slate-600">
          <td class="px-3 py-2">${item.guru_nama || '-'}</td>
          <td class="px-3 py-2">${item.mapel_nama || '-'}</td>
          <td class="px-3 py-2">${item.kelas_nama || '-'}</td>
          <td class="px-3 py-2">${item.hari || '-'} / ${item.jam_ke || '-'}</td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-2">
              <button type="button" data-action="edit-assignment" data-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit Relasi</button>
              <button type="button" data-action="delete-assignment" data-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus Relasi</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');

  const html = renderLayout('Plotting Jadwal', `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-lg font-semibold text-slate-900">Pengunci Relasi Mengajar</h3>
        <p class="mt-1 text-sm text-slate-500">Tetapkan guru, mata pelajaran, dan kelas untuk periode aktif ${context.tahun_ajaran_aktif_nama || ''} / ${context.semester_aktif_nama || ''}.</p>
      </div>

      <div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h4 class="text-sm font-semibold text-slate-900">Izinkan Guru Mengisi Relasi Sendiri</h4>
          <p class="mt-0.5 text-xs text-slate-500">Jika aktif, guru dapat menambahkan dan mengelola relasi mengajar sendiri di halaman Mapping.</p>
        </div>
        <button type="button" id="toggle-guru-relasi" class="relative inline-flex h-7 w-12 items-center rounded-full transition ${guruBolehIsi ? 'bg-[#007AFF]' : 'bg-slate-300'}" aria-pressed="${guruBolehIsi}">
          <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition ${guruBolehIsi ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
      </div>

      <form id="plotting-form" class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 id="plotting-form-title" class="text-base font-semibold text-slate-900">Tambah Plotting Jadwal</h4>
        <div>
          <label for="guru" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pilih Guru</label>
          <select id="guru" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${guruOptions}</select>
        </div>
        <div>
          <label for="mapel" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pilih Mata Pelajaran</label>
          <select id="mapel" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${mapelOptions}</select>
        </div>
        <div>
          <label for="kelas" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pilih Kelas</label>
          <select id="kelas" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${kelasOptions}</select>
        </div>
        <div>
          <label for="hari" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Hari Mengajar</label>
          <input id="hari" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="Contoh: Senin" />
        </div>
        <div>
          <label for="jam" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jam Ke</label>
          <input id="jam" type="text" inputmode="text" autocomplete="off" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="Contoh: 1-2" />
        </div>
        <p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Perhatian: perubahan relasi akan memengaruhi data pembelajaran pada relasi yang sama.</p>
        <button type="submit" class="rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-semibold text-white">Simpan Plotting</button>
      </form>

      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-100 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Relasi Saat Ini</div>
        <div class="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">Warning: Tombol hapus akan menghapus relasi mengajar beserta data pembelajaran terkait.</div>
        <table class="w-full text-left">
          <thead class="bg-white text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th class="px-3 py-2">Guru</th>
              <th class="px-3 py-2">Mapel</th>
              <th class="px-3 py-2">Kelas</th>
              <th class="px-3 py-2">Jadwal</th>
              <th class="px-3 py-2">Aksi (Berisiko)</th>
            </tr>
          </thead>
          <tbody>${assignmentRows}</tbody>
        </table>
      </div>
    </div>
  `);

  container.innerHTML = html;

  let editingId = null;
  const formTitle = container.querySelector('#plotting-form-title');

  const setFormMode = (assignment = null) => {
    editingId = assignment?.id || null;
    const title = editingId ? 'Perbarui Plotting Jadwal' : 'Tambah Plotting Jadwal';
    if (formTitle) {
      formTitle.textContent = title;
    }
    if (editingId) {
      container.querySelector('#guru').value = assignment.guru_id || '';
      container.querySelector('#mapel').value = assignment.mapel_id || '';
      container.querySelector('#kelas').value = assignment.kelas_id || '';
      container.querySelector('#hari').value = assignment.hari || '';
      container.querySelector('#jam').value = assignment.jam_ke || '';
    } else {
      container.querySelector('#plotting-form').reset();
    }
  };

  const plottingForm = container.querySelector('#plotting-form');
  const handlePlottingSubmit = async (event) => {
    event.preventDefault();
    const guruId = container.querySelector('#guru').value;
    const mapelId = container.querySelector('#mapel').value;
    const kelasId = container.querySelector('#kelas').value;
    const guruName = guruList.find((item) => item.username === guruId)?.nama || '';
    const mapelName = mapelList.find((item) => item.id === mapelId)?.nama || '';
    const kelasName = kelasList.find((item) => item.id === kelasId)?.nama || '';

    const payload = {
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      guru_id: guruId,
      guru_nama: guruName,
      mapel_id: mapelId,
      mapel_nama: mapelName,
      kelas_id: kelasId,
      kelas_nama: kelasName,
      hari: container.querySelector('#hari').value.trim(),
      jam_ke: container.querySelector('#jam').value.trim(),
    };

    const pengajaranId = `${payload.tahun_ajaran_id}_${payload.semester_id}_${payload.guru_id}_${payload.kelas_id}_${payload.mapel_id}`;
    if (editingId && editingId !== pengajaranId) {
      await deleteDocument('pengajaran', editingId);
      await deleteDocument('pembelajaran', editingId);
    }

    await saveDocument('pengajaran', payload, pengajaranId);
    await createPembelajaranFromPlotting(payload, context);
    alert(editingId ? 'Plotting jadwal berhasil diperbarui.' : 'Relasi mengajar berhasil disimpan dan kelas pembelajaran dibuat.');
    renderPlottingJadwalPage(container);
  };

  if (container.plottingFormSubmitHandler) {
    plottingForm?.removeEventListener('submit', container.plottingFormSubmitHandler);
  }
  plottingForm?.addEventListener('submit', handlePlottingSubmit);
  container.plottingFormSubmitHandler = handlePlottingSubmit;

  const handlePlottingClick = async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const assignmentId = button.getAttribute('data-id');
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;

    if (action === 'edit-assignment') {
      const editConfirmed = confirm(`Ubah relasi ini?\n\nGuru: ${assignment.guru_nama || '-'}\nMapel: ${assignment.mapel_nama || '-'}\nKelas: ${assignment.kelas_nama || '-'}\nJadwal: ${assignment.hari || '-'} / ${assignment.jam_ke || '-'}\n\nLanjutkan ke mode edit.`);
      if (!editConfirmed) return;
      setFormMode(assignment);
      return;
    }

    if (action === 'delete-assignment') {
      const confirmed = confirm(`Hapus relasi mengajar ini?\n\nGuru: ${assignment.guru_nama || '-'}\nMapel: ${assignment.mapel_nama || '-'}\nKelas: ${assignment.kelas_nama || '-'}\nJadwal: ${assignment.hari || '-'} / ${assignment.jam_ke || '-'}\n\nDampak: data pengajaran dan data pembelajaran terkait relasi ini akan dihapus.`);
      if (!confirmed) return;
      await deleteDocument('pengajaran', assignmentId).catch((error) => console.warn('Gagal menghapus plotting:', error));
      await deleteDocument('pembelajaran', assignmentId).catch(() => {});
      alert('Plotting jadwal berhasil dihapus.');
      renderPlottingJadwalPage(container);
    }
  };

  if (container.plottingClickHandler) {
    container.removeEventListener('click', container.plottingClickHandler);
  }
  container.addEventListener('click', handlePlottingClick);
  container.plottingClickHandler = handlePlottingClick;

  const toggleButton = container.querySelector('#toggle-guru-relasi');
  if (toggleButton) {
    const updateToggleVisual = (isOn) => {
      toggleButton.className = `relative inline-flex h-7 w-12 items-center rounded-full transition ${isOn ? 'bg-[#007AFF]' : 'bg-slate-300'}`;
      toggleButton.setAttribute('aria-pressed', String(isOn));
      const thumb = toggleButton.querySelector('span');
      if (thumb) {
        thumb.className = `inline-block h-5 w-5 rounded-full bg-white shadow transition ${isOn ? 'translate-x-6' : 'translate-x-1'}`;
      }
    };

    toggleButton.addEventListener('click', async () => {
      const next = !guruBolehIsi;
      updateToggleVisual(next);
      await saveAppConfig({ ...(await getAppConfig()), guru_boleh_isi_relasi: next });
      alert(next ? 'Guru sekarang diperbolehkan mengisi relasi sendiri.' : 'Guru tidak lagi diperbolehkan mengisi relasi sendiri.');
      renderPlottingJadwalPage(container);
    });
  }

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
