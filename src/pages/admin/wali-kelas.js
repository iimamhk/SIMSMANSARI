import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { saveDocument, deleteDocument, getCollectionDocs, getDocumentsWhere } from '../../firebase/data-service.js';
import { getManagedUsers } from '../../firebase/auth-service.js';

export async function renderAdminWaliKelasPage(container) {
  const context = getStoredContext();
  const guruList = await getManagedUsers('guru');
  const kelasList = await getCollectionDocs('kelas');
  const relations = await getDocumentsWhere('wali_kelas', [
    { field: 'tahun_ajaran_id', value: context.tahun_ajaran_aktif },
    { field: 'semester_id', value: context.semester_aktif },
  ]);

  const guruOptions = guruList
    .map((item) => `<option value="${item.username}">${item.nama}</option>`)
    .join('');
  const kelasOptions = kelasList
    .map((item) => `<option value="${item.id}">${item.nama}</option>`)
    .join('');

  const relationRows = relations
    .map(
      (item) => `
        <tr class="border-t border-slate-100 text-sm text-slate-600">
          <td class="px-3 py-2">${item.guru_nama || '-'}</td>
          <td class="px-3 py-2">${item.kelas_nama || '-'}</td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-2">
              <button type="button" data-action="edit-wali" data-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit Relasi</button>
              <button type="button" data-action="delete-wali" data-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus Relasi</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');

  const html = renderLayout('Wali Kelas', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-[0_28px_60px_-32px_rgba(14,165,233,0.55)] sm:p-6">
        <div class="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/25 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Admin Console</p>
        <h3 class="mt-2 text-2xl font-bold tracking-tight">Relasi Wali Kelas</h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-white/90">Tetapkan guru sebagai wali kelas untuk periode aktif ${context.tahun_ajaran_aktif_nama || ''} / ${context.semester_aktif_nama || ''}. Satu kelas hanya memiliki satu wali kelas.</p>
      </div>

      <form id="wali-form" class="space-y-3 rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
        <h4 id="wali-form-title" class="text-base font-semibold text-slate-900">Tambah Wali Kelas</h4>
        <div>
          <label for="guru" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pilih Guru</label>
          <select id="guru" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">${guruOptions}</select>
        </div>
        <div>
          <label for="kelas" class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pilih Kelas</label>
          <select id="kelas" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">${kelasOptions}</select>
        </div>
        <p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Perhatian: menetapkan wali kelas baru pada kelas yang sama akan menggantikan wali kelas sebelumnya.</p>
        <button type="submit" class="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Simpan Relasi Wali Kelas</button>
      </form>

      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-100 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">Relasi Saat Ini</div>
        <table class="w-full text-left">
          <thead class="bg-white text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th class="px-3 py-2">Guru</th>
              <th class="px-3 py-2">Kelas</th>
              <th class="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>${relationRows || `<tr><td colspan="3" class="px-3 py-4 text-center text-sm text-slate-400">Belum ada relasi wali kelas.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `);

  container.innerHTML = html;

  let editingId = null;
  const formTitle = container.querySelector('#wali-form-title');

  const setFormMode = (relation = null) => {
    editingId = relation?.id || null;
    if (formTitle) {
      formTitle.textContent = editingId ? 'Perbarui Wali Kelas' : 'Tambah Wali Kelas';
    }
    if (editingId) {
      container.querySelector('#guru').value = relation.guru_id || '';
      container.querySelector('#kelas').value = relation.kelas_id || '';
    } else {
      container.querySelector('#wali-form').reset();
    }
  };

  const waliForm = container.querySelector('#wali-form');
  const handleWaliSubmit = async (event) => {
    event.preventDefault();
    const guruId = container.querySelector('#guru').value;
    const kelasId = container.querySelector('#kelas').value;
    const guruName = guruList.find((item) => item.username === guruId)?.nama || '';
    const kelasName = kelasList.find((item) => item.id === kelasId)?.nama || '';

    if (!guruId || !kelasId) {
      alert('Pilih guru dan kelas terlebih dahulu.');
      return;
    }

    const waliId = `${context.tahun_ajaran_aktif}_${context.semester_aktif}_${kelasId}`;
    const payload = {
      id: waliId,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      kelas_id: kelasId,
      kelas_nama: kelasName,
      guru_id: guruId,
      guru_nama: guruName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await saveDocument('wali_kelas', payload, waliId);
    const kelasDoc = kelasList.find((item) => item.id === kelasId);
    await saveDocument('kelas', {
      ...(kelasDoc || {}),
      id: kelasId,
      wali_kelas_id: guruId,
      wali_kelas_nama: guruName,
      updated_at: new Date().toISOString(),
    }, kelasId);

    alert(editingId ? 'Relasi wali kelas berhasil diperbarui.' : 'Guru berhasil ditetapkan sebagai wali kelas.');
    renderAdminWaliKelasPage(container);
  };

  if (container.waliFormSubmitHandler) {
    waliForm?.removeEventListener('submit', container.waliFormSubmitHandler);
  }
  waliForm?.addEventListener('submit', handleWaliSubmit);
  container.waliFormSubmitHandler = handleWaliSubmit;

  const handleWaliClick = async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    const waliId = button.getAttribute('data-id');
    const relation = relations.find((item) => item.id === waliId);
    if (!relation) return;

    if (action === 'edit-wali') {
      const editConfirmed = confirm(`Ubah relasi ini?\n\nGuru: ${relation.guru_nama || '-'}\nKelas: ${relation.kelas_nama || '-'}\n\nLanjutkan ke mode edit.`);
      if (!editConfirmed) return;
      setFormMode(relation);
      return;
    }

    if (action === 'delete-wali') {
      const confirmed = confirm(`Hapus relasi wali kelas ini?\n\nGuru: ${relation.guru_nama || '-'}\nKelas: ${relation.kelas_nama || '-'}`);
      if (!confirmed) return;
      await deleteDocument('wali_kelas', waliId).catch((error) => console.warn('Gagal menghapus relasi wali kelas:', error));
      const kelasDoc = kelasList.find((item) => item.id === relation.kelas_id);
      await saveDocument('kelas', {
        ...(kelasDoc || {}),
        id: relation.kelas_id,
        wali_kelas_id: '',
        wali_kelas_nama: '',
        updated_at: new Date().toISOString(),
      }, relation.kelas_id).catch(() => {});
      alert('Relasi wali kelas berhasil dihapus.');
      renderAdminWaliKelasPage(container);
    }
  };

  if (container.waliClickHandler) {
    container.removeEventListener('click', container.waliClickHandler);
  }
  container.addEventListener('click', handleWaliClick);
  container.waliClickHandler = handleWaliClick;

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
