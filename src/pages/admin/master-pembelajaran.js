import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getDocumentsWhere } from '../../firebase/data-service.js';

export async function renderMasterPembelajaranPage(container) {
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const context = getStoredContext();
  const filters = [];
  if (context?.tahun_ajaran_aktif) filters.push({ field: 'tahun_ajaran_id', value: context.tahun_ajaran_aktif });
  if (context?.semester_aktif) filters.push({ field: 'semester_id', value: context.semester_aktif });
  const pembelajaranList = (await getDocumentsWhere('pembelajaran', filters, { cacheMs: 300000, persist: true, persistTtlMs: 43200000 }))
    .sort((a, b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || ''), 'id', { sensitivity: 'base' }));
  const totalSiswa = new Set(pembelajaranList.flatMap((item) => (Array.isArray(item.siswa) ? item.siswa : []))
    .map((student) => student.siswa_id || student.id || student.username || student.siswa_nama || student.nama)
    .filter(Boolean)).size;
  const totalGuru = new Set(pembelajaranList.map((item) => item.guru_id || item.guru_nama).filter(Boolean)).size;

  const cardsHtml = pembelajaranList.map((item, index) => {
    const students = Array.isArray(item.siswa) ? item.siswa : [];
    const searchText = [item.kelas_nama, item.kelas_id, item.mapel_nama, item.mapel_id, item.guru_nama, item.guru_id,
      ...students.flatMap((student) => [student.siswa_nama, student.nama, student.username])]
      .filter(Boolean).join(' ').toLowerCase();
    return `
      <details data-pembelajaran-card data-search="${escapeHtml(searchText)}" class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm open:border-sky-200 open:shadow-[0_16px_34px_-28px_rgba(14,165,233,0.45)]">
        <summary class="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-100">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sm font-bold text-sky-700">${index + 1}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h4 class="truncate text-sm font-semibold text-slate-900">${escapeHtml(item.mapel_nama || item.mapel_id || '-')}</h4>
              <span class="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">${escapeHtml(item.kelas_nama || item.kelas_id || '-')}</span>
            </div>
            <p class="mt-0.5 truncate text-xs text-slate-500">${escapeHtml(item.guru_nama || item.guru_id || '-')} · ${escapeHtml(item.hari || 'Hari belum diatur')} · Jam ${escapeHtml(item.jam_ke || '-')}</p>
          </div>
          <span class="hidden shrink-0 rounded-xl bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:inline">${students.length} siswa</span>
          <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div class="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
          <div class="mb-3 grid gap-2 text-xs sm:grid-cols-3">
            <div class="rounded-xl bg-white px-3 py-2 text-slate-500 ring-1 ring-slate-200"><span class="block font-semibold text-slate-800">${escapeHtml(item.kelas_nama || '-')}</span>Kelas</div>
            <div class="rounded-xl bg-white px-3 py-2 text-slate-500 ring-1 ring-slate-200"><span class="block font-semibold text-slate-800">${escapeHtml(item.guru_nama || '-')}</span>Pengajar</div>
            <div class="rounded-xl bg-white px-3 py-2 text-slate-500 ring-1 ring-slate-200"><span class="block font-semibold text-slate-800">${escapeHtml(item.hari || '-')} / ${escapeHtml(item.jam_ke || '-')}</span>Hari / jam</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white">
            <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Daftar siswa</p>
              <span class="text-xs text-slate-400">${students.length} orang</span>
            </div>
            <div class="max-h-64 overflow-y-auto p-3">
              ${students.length ? `<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">${students.map((student, studentIndex) => `
                <div class="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">${studentIndex + 1}</span>
                  <span class="truncate">${escapeHtml(student.siswa_nama || student.nama || '-')}</span>
                </div>
              `).join('')}</div>` : '<p class="py-4 text-center text-sm text-slate-500">Belum ada siswa terdaftar.</p>'}
            </div>
          </div>
        </div>
      </details>
    `;
  }).join('');

  container.innerHTML = renderLayout('Master Pembelajaran', `
    <div class="space-y-5">
      <section class="rounded-[28px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-sm sm:p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-white/75">Kelas Belajar</p>
            <h3 class="mt-2 text-2xl font-semibold">Master Pembelajaran</h3>
            <p class="mt-2 text-sm leading-6 text-white/90">Ringkasan kelas periode aktif. Buka hanya kelas yang ingin diperiksa agar halaman tetap ringkas.</p>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-2xl border border-white/25 bg-white/15 px-3 py-2.5 backdrop-blur"><p class="text-[10px] uppercase tracking-wider text-white/70">Kelas</p><p class="mt-1 text-xl font-semibold">${pembelajaranList.length}</p></div>
            <div class="rounded-2xl border border-white/25 bg-white/15 px-3 py-2.5 backdrop-blur"><p class="text-[10px] uppercase tracking-wider text-white/70">Guru</p><p class="mt-1 text-xl font-semibold">${totalGuru}</p></div>
            <div class="rounded-2xl border border-white/25 bg-white/15 px-3 py-2.5 backdrop-blur"><p class="text-[10px] uppercase tracking-wider text-white/70">Siswa</p><p class="mt-1 text-xl font-semibold">${totalSiswa}</p></div>
          </div>
        </div>
      </section>

      <section class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 class="font-semibold text-slate-900">Daftar kelas</h4>
            <p id="pembelajaran-result-count" class="mt-1 text-xs text-slate-500" aria-live="polite">${pembelajaranList.length} kelas ditampilkan</p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row">
            <label class="relative">
              <span class="sr-only">Cari pembelajaran</span>
              <input id="pembelajaran-search" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100 sm:w-64" placeholder="Cari kelas, mapel, guru..." />
            </label>
            <button id="collapse-pembelajaran" type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Tutup semua</button>
          </div>
        </div>

        <div id="pembelajaran-list" class="mt-4 space-y-2">
          ${cardsHtml || '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Belum ada kelas pembelajaran pada periode aktif.</div>'}
        </div>
        <div id="pembelajaran-empty-filter" class="mt-4 hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Tidak ada kelas yang cocok dengan pencarian.</div>
      </section>
    </div>
  `);

  const cards = [...container.querySelectorAll('[data-pembelajaran-card]')];
  const searchInput = container.querySelector('#pembelajaran-search');
  const countEl = container.querySelector('#pembelajaran-result-count');
  const emptyFilter = container.querySelector('#pembelajaran-empty-filter');

  searchInput?.addEventListener('input', () => {
    const keyword = searchInput.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const matches = !keyword || String(card.dataset.search || '').includes(keyword);
      card.classList.toggle('hidden', !matches);
      if (matches) visible += 1;
    });
    countEl.textContent = `${visible} kelas ditampilkan`;
    emptyFilter?.classList.toggle('hidden', visible > 0 || !cards.length);
  });

  container.querySelector('#collapse-pembelajaran')?.addEventListener('click', () => {
    cards.forEach((card) => { card.open = false; });
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
