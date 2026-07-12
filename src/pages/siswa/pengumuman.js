import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getPengumumanForSiswa,
  recordPengumumanRead,
  getPengumumanReadMap,
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

const INITIAL_VISIBLE = 5;

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
  return `${dayLong[d.getDay()]}, ${d.getDate()} ${monthLong[d.getMonth()]} ${d.getFullYear()} • ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

function getInitials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?';
}

export async function renderSiswaPengumumanPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const siswaId = session?.user?.username || session?.user?.id || '';
  const siswaNama = session?.user?.nama || '';
  const kelasId = session?.user?.kelas_id || session?.user?.kelas || '';

  let semuaPengumuman = [];
  let readMap = new Map();
  let visibleCount = INITIAL_VISIBLE;

  if (kelasId) {
    semuaPengumuman = await getPengumumanForSiswa(context, kelasId);
  }
  if (siswaId) {
    readMap = await getPengumumanReadMap(siswaId);
  }

  const belumDibaca = semuaPengumuman.filter((item) => !readMap.has(`${String(item.id).trim()}__${String(siswaId).trim().toLowerCase()}`)).length;

  function renderTimeline() {
    const timeline = container.querySelector('#timeline-pengumuman');
    if (!timeline) return;

    if (!kelasId) {
      timeline.innerHTML = emptyState('Kelas belum diatur', 'Akun Anda belum terhubung ke kelas mana pun. Hubungi guru atau admin untuk memperbaiki data kelas Anda.');
      return;
    }

    if (!semuaPengumuman.length) {
      timeline.innerHTML = emptyState('Belum ada pengumuman', 'Saat ada pengumuman baru dari guru Anda, ia akan muncul di sini sebagai timeline.');
      return;
    }

    const ditampilkan = semuaPengumuman.slice(0, visibleCount);
    const masihAda = semuaPengumuman.length > visibleCount;

    timeline.innerHTML = `
      <div class="relative pl-14 sm:pl-16">
        <span class="absolute left-[22px] top-2 bottom-2 w-px bg-gradient-to-b from-amber-200 via-slate-200 to-transparent sm:left-[26px]"></span>
        ${ditampilkan.map((item, idx) => renderTimelineItem(item, idx === ditampilkan.length - 1)).join('')}
      </div>
      ${masihAda ? `
        <div class="mt-5 flex justify-center">
          <button id="btn-load-more" type="button" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-amber-300 hover:text-amber-600 active:scale-[0.98]">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>
            Muat pengumuman lebih lama
          </button>
        </div>` : ''}
    `;

    // Tandai dibaca saat kartu diklik
    timeline.querySelectorAll('[data-pengumuman-id]').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-pengumuman-id');
        const key = `${String(id).trim()}__${String(siswaId).trim().toLowerCase()}`;
        if (readMap.has(key)) return; // sudah dibaca
        await recordPengumumanRead({
          pengumuman_id: id,
          siswa_id: siswaId,
          siswa_nama: siswaNama,
        });
        readMap.set(key, { pengumuman_id: id, siswa_id: siswaId });
        // Perbarui badge header & gaya item tanpa reload penuh
        perbaruiHeader();
        const item = semuaPengumuman.find((p) => p.id === id);
        if (item) {
          const baru = renderTimelineItem(item, false, true);
          if (baru) el.outerHTML = baru;
        }
      });
    });

    const loadMore = timeline.querySelector('#btn-load-more');
    if (loadMore) {
      loadMore.addEventListener('click', () => {
        visibleCount += 5;
        renderTimeline();
      });
    }
  }

  function renderTimelineItem(item, isLast, sudahDibaca) {
    const d = new Date(item.created_at);
    const tanggalValid = !Number.isNaN(d.getTime());
    const hari = tanggalValid ? d.getDate() : '?';
    const bulan = tanggalValid ? monthShort[d.getMonth()] : '';
    const tahun = tanggalValid ? d.getFullYear() : '';

    const key = `${String(item.id).trim()}__${String(siswaId).trim().toLowerCase()}`;
    const dibaca = sudahDibaca || readMap.has(key);
    const warnaTanggal = dibaca
      ? 'border-slate-200 bg-white text-slate-500'
      : 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600';
    const badgeBaru = dibaca
      ? ''
      : `<span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
           <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>Baru
         </span>`;

    const lingkaranClasses = isLast ? 'mb-0' : 'mb-7';

    return `
      <div data-pengumuman-id="${escapeHtml(item.id)}" class="group relative ${lingkaranClasses} cursor-pointer rounded-3xl border ${dibaca ? 'border-slate-100 bg-white' : 'border-amber-100 bg-white'} p-4 shadow-sm ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-md">
        <!-- Lingkaran tanggal di kiri -->
        <div class="absolute -left-14 top-4 flex h-11 w-11 flex-col items-center justify-center rounded-2xl border-2 bg-white shadow-sm sm:-left-16 sm:h-12 sm:w-12 ${warnaTanggal}">
          <span class="text-base font-bold leading-none sm:text-lg">${hari}</span>
          <span class="text-[9px] font-semibold uppercase leading-none">${bulan}</span>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-base font-semibold text-slate-900">${escapeHtml(item.judul || 'Tanpa judul')}</h3>
          ${badgeBaru}
        </div>
        <div class="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
          <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[9px] font-bold text-white">${getInitials(item.guru_nama)}</span>
          <span class="font-medium text-slate-600">${escapeHtml(item.guru_nama || 'Guru')}</span>
          <span>•</span>
          <span>${escapeHtml(formatLongDate(item.created_at))}</span>
        </div>
        <p class="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">${escapeHtml(item.isi || '')}</p>
        ${tanggalValid ? `<p class="mt-3 text-[10px] uppercase tracking-wide text-slate-300">${tahun}</p>` : ''}
      </div>`;
  }

  function perbaruiHeader() {
    const badge = container.querySelector('#badge-belum');
    if (!badge) return;
    const sisa = semuaPengumuman.filter((item) => !readMap.has(`${String(item.id).trim()}__${String(siswaId).trim().toLowerCase()}`)).length;
    if (sisa > 0) {
      badge.textContent = `${sisa} belum dibaca`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function emptyState(judul, pesan) {
    return `
      <div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l14-7v16L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h2"/><path d="M19 8v8"/></svg>
        </div>
        <p class="text-sm font-semibold text-slate-600">${escapeHtml(judul)}</p>
        <p class="mx-auto mt-1 max-w-xs text-xs text-slate-400">${escapeHtml(pesan)}</p>
      </div>`;
  }

  const html = renderLayout('Pengumuman Siswa', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[28px] border border-amber-100 bg-gradient-to-br from-white via-amber-50 to-orange-50 p-4 shadow-[0_24px_70px_-42px_rgba(245,158,11,0.55)] sm:p-5">
        <div class="absolute -left-10 top-0 h-24 w-24 rounded-full bg-amber-200/50 blur-3xl"></div>
        <div class="absolute bottom-0 right-6 h-20 w-20 rounded-full bg-orange-200/50 blur-3xl"></div>
        <div class="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 backdrop-blur-sm">
              <span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
              Linimasa Pengumuman
            </div>
            <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Pengumuman untuk Kelas Anda</h2>
            <p class="mt-1 text-sm text-slate-500">Klik pengumuman untuk menandainya sudah dibaca.</p>
          </div>
          <span id="badge-belum" class="${belumDibaca > 0 ? '' : 'hidden'} inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-700 backdrop-blur">
            <span class="h-2 w-2 rounded-full bg-amber-500"></span>
            ${belumDibaca} belum dibaca
          </span>
        </div>
      </div>

      <div id="timeline-pengumuman"></div>
    </div>
  `);

  container.innerHTML = html;
  renderTimeline();
}
