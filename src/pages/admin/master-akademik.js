import { renderLayout } from '../../layouts/dashboard-layout.js';
import { saveDocument, getCollectionDocs, deleteDocument } from '../../firebase/data-service.js';

export async function renderMasterAkademikPage(container) {
  const mataPelajaran = await getCollectionDocs('mata_pelajaran');
  const kelas = await getCollectionDocs('kelas');

  const mataPelajaranRows = mataPelajaran
    .map((item) => `
      <tr class="border-t border-slate-100 text-sm text-slate-600">
        <td class="px-3 py-2">${item.id}</td>
        <td class="px-3 py-2">${item.nama}</td>
        <td class="px-3 py-2">
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="edit-mapel" data-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
            <button type="button" data-action="delete-mapel" data-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  const kelasRows = kelas
    .map((item) => `
      <tr class="border-t border-slate-100 text-sm text-slate-600">
        <td class="px-3 py-2">${item.id}</td>
        <td class="px-3 py-2">${item.nama}</td>
        <td class="px-3 py-2">
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="edit-kelas" data-id="${item.id}" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
            <button type="button" data-action="delete-kelas" data-id="${item.id}" class="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-600">Hapus</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  const html = renderLayout('Master Akademik', `
    <div class="space-y-6">
      <div class="relative overflow-hidden rounded-[30px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-[0_28px_60px_-32px_rgba(14,165,233,0.55)] sm:p-6">
        <div class="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/25 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">Admin Console</p>
        <h3 class="mt-2 text-2xl font-bold tracking-tight">Data Akademik</h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-white/90">Kelola mata pelajaran dan kelas yang digunakan dalam sistem dengan alur master yang rapi.</p>
      </div>

      <div class="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
        <h4 class="text-base font-semibold text-slate-900">Import Data Akademik</h4>
        <p class="mt-1 text-sm text-slate-500">Unduh template CSV, isi data, lalu unggah untuk menambahkan mata pelajaran dan kelas secara cepat.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button id="download-template-btn" type="button" class="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">Unduh Template</button>
          <label class="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 font-semibold text-slate-700">
            <span>Pilih File CSV</span>
            <input id="import-file-input" type="file" accept=".csv" class="hidden" />
          </label>
        </div>
        <div id="import-progress" class="mt-4 hidden">
          <div class="grid gap-3 sm:grid-cols-3">
            <div id="progress-step-1" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">1. Membaca file</div>
            <div id="progress-step-2" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">2. Memvalidasi data</div>
            <div id="progress-step-3" class="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-700">3. Menyimpan data</div>
          </div>
        </div>
        <div id="import-message" class="mt-3 text-sm text-slate-600"></div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <h4 id="mapel-form-title" class="text-base font-semibold text-slate-900">Tambah Mata Pelajaran</h4>
          <form id="mapel-form" class="mt-3 space-y-3">
            <input id="mapel-id" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Kode mapel" required />
            <input id="mapel-nama" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Nama mapel" required />
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Simpan Mapel</button>
              <button id="mapel-cancel-btn" type="button" class="hidden rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Batal</button>
            </div>
          </form>
          <table class="mt-4 w-full text-left">
            <thead class="text-xs uppercase tracking-wide text-slate-400">
              <tr><th class="px-3 py-2">Kode</th><th class="px-3 py-2">Nama</th><th class="px-3 py-2">Aksi</th></tr>
            </thead>
            <tbody>${mataPelajaranRows}</tbody>
          </table>
        </div>

        <div class="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_-30px_rgba(14,165,233,0.28)]">
          <h4 id="kelas-form-title" class="text-base font-semibold text-slate-900">Tambah Kelas</h4>
          <form id="kelas-form" class="mt-3 space-y-3">
            <input id="kelas-id" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Kode kelas" required />
            <input id="kelas-nama" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Nama kelas" required />
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Simpan Kelas</button>
              <button id="kelas-cancel-btn" type="button" class="hidden rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Batal</button>
            </div>
          </form>
          <table class="mt-4 w-full text-left">
            <thead class="text-xs uppercase tracking-wide text-slate-400">
              <tr><th class="px-3 py-2">Kode</th><th class="px-3 py-2">Nama</th><th class="px-3 py-2">Aksi</th></tr>
            </thead>
            <tbody>${kelasRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const progressContainer = container.querySelector('#import-progress');
  const messageBox = container.querySelector('#import-message');
  const setProgressState = (step, state) => {
    const el = container.querySelector(`#progress-step-${step}`);
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
    }).filter((record) => record.kode || record.id || record.nama || record.tipe);
  };

  container.querySelector('#download-template-btn')?.addEventListener('click', () => {
    const template = ['kode,nama,tipe', 'MTK,MATEMATIKA UMUM,mapel', 'BIND,BAHASA INDONESIA,mapel', 'X_1,X.1,kelas', 'XI_1,XI.1,kelas'].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template-akademik.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  container.querySelector('#import-file-input')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    resetProgress();
    messageBox.textContent = 'Memproses file...';
    try {
      const text = await file.text();
      setProgressState(1, 'done');
      setProgressState(2, 'active');
      const rows = parseCsv(text);
      if (!rows.length) throw new Error('File kosong atau format tidak valid.');
      setProgressState(2, 'done');
      setProgressState(3, 'active');
      let savedCount = 0;
      let mapelCount = 0;
      let kelasCount = 0;
      for (const row of rows) {
        const type = String(row.tipe || '').toLowerCase();
        const id = String(row.kode || row.id || '').trim();
        const nama = String(row.nama || '').trim();
        if (!id || !nama) continue;
        if (type === 'mapel') {
          await saveDocument('mata_pelajaran', { id, nama }, id);
          mapelCount += 1;
        } else if (type === 'kelas') {
          await saveDocument('kelas', { id, nama }, id);
          kelasCount += 1;
        }
        savedCount += 1;
      }
      setProgressState(3, 'done');
      messageBox.innerHTML = `<span class="font-semibold text-emerald-700">✓ Impor selesai.</span> ${savedCount} data berhasil disimpan (${mapelCount} mata pelajaran, ${kelasCount} kelas).`;
      event.target.value = '';
      renderMasterAkademikPage(container);
    } catch (error) {
      setProgressState(3, 'idle');
      messageBox.innerHTML = `<span class="font-semibold text-rose-600">Import gagal.</span> ${error.message}`;
    }
  });

  let editingMapelId = null;
  let editingKelasId = null;
  const mapelForm = container.querySelector('#mapel-form');
  const kelasForm = container.querySelector('#kelas-form');
  const mapelCancelBtn = container.querySelector('#mapel-cancel-btn');
  const kelasCancelBtn = container.querySelector('#kelas-cancel-btn');
  const mapelTitle = container.querySelector('#mapel-form-title');
  const kelasTitle = container.querySelector('#kelas-form-title');

  const setMapelEditMode = (isEditing, id = '') => {
    editingMapelId = isEditing ? id : null;
    mapelTitle.textContent = isEditing ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran';
    mapelCancelBtn.classList.toggle('hidden', !isEditing);
    if (!isEditing) {
      mapelForm.reset();
    }
  };

  const setKelasEditMode = (isEditing, id = '') => {
    editingKelasId = isEditing ? id : null;
    kelasTitle.textContent = isEditing ? 'Edit Kelas' : 'Tambah Kelas';
    kelasCancelBtn.classList.toggle('hidden', !isEditing);
    if (!isEditing) {
      kelasForm.reset();
    }
  };

  mapelForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = container.querySelector('#mapel-id').value.trim().toUpperCase();
    const nama = container.querySelector('#mapel-nama').value.trim();
    const targetId = editingMapelId || id;
    await saveDocument('mata_pelajaran', { id: targetId, nama }, targetId);
    setMapelEditMode(false);
    alert('Mata pelajaran berhasil disimpan.');
    renderMasterAkademikPage(container);
  });

  kelasForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = container.querySelector('#kelas-id').value.trim();
    const nama = container.querySelector('#kelas-nama').value.trim();
    const targetId = editingKelasId || id;
    await saveDocument('kelas', { id: targetId, nama }, targetId);
    setKelasEditMode(false);
    alert('Kelas berhasil disimpan.');
    renderMasterAkademikPage(container);
  });

  mapelCancelBtn.addEventListener('click', () => setMapelEditMode(false));
  kelasCancelBtn.addEventListener('click', () => setKelasEditMode(false));

  container.querySelectorAll('[data-action="edit-mapel"]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = mataPelajaran.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      container.querySelector('#mapel-id').value = item.id || '';
      container.querySelector('#mapel-nama').value = item.nama || '';
      setMapelEditMode(true, item.id);
    });
  });

  container.querySelectorAll('[data-action="delete-mapel"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = confirm('Hapus mata pelajaran ini?');
      if (!confirmed) return;
      try {
        await deleteDocument('mata_pelajaran', button.dataset.id);
      } catch (error) {
        console.warn('Gagal menghapus mapel:', error);
      }
      renderMasterAkademikPage(container);
    });
  });

  container.querySelectorAll('[data-action="edit-kelas"]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = kelas.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      container.querySelector('#kelas-id').value = item.id || '';
      container.querySelector('#kelas-nama').value = item.nama || '';
      setKelasEditMode(true, item.id);
    });
  });

  container.querySelectorAll('[data-action="delete-kelas"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = confirm('Hapus kelas ini?');
      if (!confirmed) return;
      try {
        await deleteDocument('kelas', button.dataset.id);
      } catch (error) {
        console.warn('Gagal menghapus kelas:', error);
      }
      renderMasterAkademikPage(container);
    });
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
