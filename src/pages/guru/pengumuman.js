import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getTeachingAssignmentsForUser,
  getPengumumanForGuru,
  savePengumuman,
  deletePengumuman,
  getPengumumanReadCounts,
} from '../../firebase/data-service.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const monthLong = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dayLong = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLongDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '-';
  return `${dayLong[d.getDay()]}, ${d.getDate()} ${monthLong[d.getMonth()]} ${d.getFullYear()}`;
}

function formatRelative(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const menit = Math.floor(diff / 60000);
  if (menit < 1) return 'Baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return formatLongDate(dateString);
}

function uniqueKelasFromAssignments(assignments) {
  const map = new Map();
  assignments.forEach((item) => {
    const id = (item.kelas_id || '').trim();
    const nama = (item.kelas_nama || item.kelas_id || '').trim();
    if (id && !map.has(id)) {
      map.set(id, { kelas_id: id, kelas_nama: nama });
    }
  });
  return Array.from(map.values());
}

export async function renderGuruPengumumanPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const userNama = session?.user?.nama || '';

  const assignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  const kelasOptions = uniqueKelasFromAssignments(assignments);

  let daftarPengumuman = await getPengumumanForGuru(context, userId);
  let readCounts = await getPengumumanReadCounts();

  let editingId = null;

  function renderKelasCheckboxes(selected = []) {
    if (!kelasOptions.length) {
      return `<p class="text-xs text-slate-500">Anda belum memiliki kelas mengajar untuk periode aktif.</p>`;
    }
    return kelasOptions
      .map(
        (k) => `
        <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50/50">
          <input type="checkbox" name="kelas_target" value="${escapeHtml(k.kelas_id)}" data-kelas-nama="${escapeHtml(k.kelas_nama)}" class="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" ${selected.includes(k.kelas_id) ? 'checked' : ''}>
          <span>${escapeHtml(k.kelas_nama)}</span>
        </label>`
      )
      .join('');
  }

  function renderDaftar() {
    const body = container.querySelector('#daftar-pengumuman');
    if (!body) return;

    if (!daftarPengumuman.length) {
      body.innerHTML = `
        <div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l14-7v16L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h2"/><path d="M19 8v8"/></svg>
          </div>
          <p class="text-sm font-medium text-slate-600">Belum ada pengumuman</p>
          <p class="mt-1 text-xs text-slate-400">Pengumuman yang Anda buat akan tampil di sini.</p>
        </div>`;
      return;
    }

    body.innerHTML = daftarPengumuman
      .map((item) => {
        const pembaca = Number(readCounts[item.id] || 0);
        const kelasLabel = item.kelas_nama_csv || (item.kelas_ids || []).join(', ') || '-';
        return `
        <div class="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-50 sm:p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-base font-semibold text-slate-900">${escapeHtml(item.judul || 'Tanpa judul')}</h3>
                <span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l14-7v16L3 13z"/></svg>
                  ${pembaca} pembaca
                </span>
              </div>
              <p class="mt-1 text-xs text-slate-500">${escapeHtml(formatRelative(item.created_at))}</p>
              <p class="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">${escapeHtml(item.isi || '')}</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                ${(item.kelas_ids || []).map(
                  (k) => `<span class="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">${escapeHtml(k)}</span>`
                ).join('')}
              </div>
              <p class="mt-2 text-[11px] text-slate-400">Target: ${escapeHtml(kelasLabel)}</p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button data-action="edit" data-id="${escapeHtml(item.id)}" class="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                Edit
              </button>
              <button data-action="hapus" data-id="${escapeHtml(item.id)}" class="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                Hapus
              </button>
            </div>
          </div>
        </div>`;
      })
      .join('');

    body.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = daftarPengumuman.find((p) => p.id === id);
        if (item) mulaiEdit(item);
      });
    });
    body.querySelectorAll('[data-action="hapus"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = daftarPengumuman.find((p) => p.id === id);
        if (!item) return;
        if (!confirm(`Hapus pengumuman "${item.judul}"? Tindakan ini tidak dapat dibatalkan.`)) return;
        await deletePengumuman(id);
        daftarPengumuman = daftarPengumuman.filter((p) => p.id !== id);
        readCounts = await getPengumumanReadCounts();
        renderDaftar();
        tampilkanToast('Pengumuman dihapus.');
      });
    });
  }

  function mulaiEdit(item) {
    editingId = item.id;
    const judulInput = container.querySelector('#input-judul');
    const isiInput = container.querySelector('#input-isi');
    const kelasWrap = container.querySelector('#kelas-checkboxes');
    judulInput.value = item.judul || '';
    isiInput.value = item.isi || '';
    kelasWrap.innerHTML = renderKelasCheckboxes(item.kelas_ids || []);
    container.querySelector('#form-title').textContent = 'Edit Pengumuman';
    container.querySelector('#btn-submit').textContent = 'Simpan Perubahan';
    container.querySelector('#btn-cancel').classList.remove('hidden');
    container.querySelector('#form-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    judulInput.focus();
  }

  function resetForm() {
    editingId = null;
    container.querySelector('#input-judul').value = '';
    container.querySelector('#input-isi').value = '';
    container.querySelector('#kelas-checkboxes').innerHTML = renderKelasCheckboxes();
    container.querySelector('#form-title').textContent = 'Buat Pengumuman Baru';
    container.querySelector('#btn-submit').textContent = 'Kirim Pengumuman';
    container.querySelector('#btn-cancel').classList.add('hidden');
  }

  function tampilkanToast(pesan) {
    const toast = container.querySelector('#toast');
    if (!toast) return;
    toast.textContent = pesan;
    toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-[-20px]', 'opacity-0');
    }, 2500);
  }

  const html = renderLayout('Pengumuman Guru', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[28px] border border-amber-100 bg-gradient-to-br from-white via-amber-50 to-orange-50 p-4 shadow-[0_24px_70px_-42px_rgba(245,158,11,0.55)] sm:p-5">
        <div class="absolute -left-10 top-0 h-24 w-24 rounded-full bg-amber-200/50 blur-3xl"></div>
        <div class="absolute bottom-0 right-6 h-20 w-20 rounded-full bg-orange-200/50 blur-3xl"></div>
        <div class="relative">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 backdrop-blur-sm">
            <span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
            Pusat Pengumuman
          </div>
          <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Bagikan Pengumuman ke Kelas</h2>
          <p class="mt-1 text-sm text-slate-500">Sampaikan info penting kepada siswa di kelas yang Anda ajar. Mereka akan menerimanya di dashboard masing-masing.</p>
        </div>
      </div>

      <div id="form-area" class="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm ring-1 ring-slate-50 sm:p-5">
        <div class="mb-4 flex items-center justify-between">
          <h3 id="form-title" class="text-base font-semibold text-slate-900">Buat Pengumuman Baru</h3>
        </div>
        <div class="space-y-4">
          <div>
            <label for="input-judul" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Judul</label>
            <input id="input-judul" type="text" maxlength="120" placeholder="Tulis judul pengumuman..." class="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100">
          </div>
          <div>
            <label for="input-isi" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Isi Pengumuman</label>
            <textarea id="input-isi" rows="4" maxlength="2000" placeholder="Tuliskan isi pengumuman di sini..." class="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"></textarea>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Kirim ke Kelas <span class="font-normal normal-case text-slate-400">(pilih satu atau beberapa)</span></label>
            <div id="kelas-checkboxes" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              ${renderKelasCheckboxes()}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button id="btn-submit" type="button" class="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/30 transition hover:shadow-lg active:scale-[0.98]">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
              Kirim Pengumuman
            </button>
            <button id="btn-cancel" type="button" class="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Batal</button>
          </div>
        </div>
      </div>

      <div>
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pengumuman Saya</h3>
          <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">${daftarPengumuman.length} pengumuman</span>
        </div>
        <div id="daftar-pengumuman" class="space-y-3"></div>
      </div>

      <div id="toast" class="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 translate-y-[-20px] rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition-all duration-300"></div>
    </div>
  `);

  container.innerHTML = html;

  container.querySelector('#btn-submit').addEventListener('click', async () => {
    const judul = container.querySelector('#input-judul').value.trim();
    const isi = container.querySelector('#input-isi').value.trim();
    const kelasTerpilih = Array.from(container.querySelectorAll('input[name="kelas_target"]:checked'));
    const kelasIds = kelasTerpilih.map((el) => el.value).filter(Boolean);
    const kelasNamaCsv = kelasTerpilih.map((el) => el.getAttribute('data-kelas-nama')).filter(Boolean).join(', ');

    if (!judul) {
      tampilkanToast('Judul wajib diisi.');
      container.querySelector('#input-judul').focus();
      return;
    }
    if (!isi) {
      tampilkanToast('Isi pengumuman wajib diisi.');
      container.querySelector('#input-isi').focus();
      return;
    }
    if (!kelasIds.length) {
      tampilkanToast('Pilih minimal satu kelas penerima.');
      return;
    }

    const btn = container.querySelector('#btn-submit');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    const payload = {
      judul,
      isi,
      guru_id: userId,
      guru_nama: userNama,
      kelas_ids: kelasIds,
      kelas_nama_csv: kelasNamaCsv,
      tahun_ajaran_id: context.tahun_ajaran_aktif || '',
      semester_id: context.semester_aktif || '',
    };

    try {
      const saved = await savePengumuman(payload, editingId);
      if (editingId) {
        const idx = daftarPengumuman.findIndex((p) => p.id === editingId);
        if (idx >= 0) daftarPengumuman[idx] = { ...daftarPengumuman[idx], ...saved };
        tampilkanToast('Pengumuman diperbarui.');
      } else {
        daftarPengumuman.unshift({ ...saved });
        daftarPengumuman.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        tampilkanToast('Pengumuman dikirim.');
      }
      resetForm();
      renderDaftar();
    } catch (error) {
      console.error('Gagal menyimpan pengumuman:', error);
      tampilkanToast('Gagal menyimpan. Coba lagi.');
    } finally {
      btn.disabled = false;
      btn.textContent = editingId ? 'Simpan Perubahan' : 'Kirim Pengumuman';
    }
  });

  container.querySelector('#btn-cancel').addEventListener('click', resetForm);

  renderDaftar();
}
