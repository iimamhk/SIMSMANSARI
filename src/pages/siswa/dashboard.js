import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys } from '../../utils/helpers.js';
import {
  getAttendanceSummary,
  getPengumumanForSiswa,
  recordPengumumanRead,
  getPengumumanReadMap,
} from '../../firebase/data-service.js';

const ALPA_ALERT_THRESHOLD = 3;

const PENGUMUMAN_DASHBOARD_MAX = 5;

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

const studentToneChip = (tone) => ({
  teal: 'student-app-icon--green',
  cyan: 'student-app-icon--blue',
  sky: 'student-app-icon--indigo',
  amber: 'student-app-icon--orange',
  slate: 'student-app-icon--slate',
  rose: 'student-app-icon--rose',
}[tone] || 'student-app-icon--blue');

const quickCard = (href, title, desc, icon, tone = 'blue', options = {}) => {
  const { featured = false, badge = '' } = options;
  return `
          <a href="${href}" class="student-app group ${featured ? 'student-app--primary' : ''}" title="${escapeHtml(desc)}">
            <span class="student-app-icon ${studentToneChip(tone)}">
              <span class="student-app-gloss"></span>
              ${badge}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </span>
            <span class="student-app-label">${escapeHtml(title)}</span>
            ${featured ? `<span class="student-app-featured-copy">${escapeHtml(desc)}<br><strong>Lihat hasilmu</strong></span>` : ''}
            <span class="visually-hidden">${escapeHtml(desc)}</span>
          </a>`;
};

export async function renderSiswaDashboardPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Siswa';
  const siswaKeys = getSessionUserKeys(session, context);
  const shortName = userName.split(' ')[0] || 'Siswa';
  const siswaId = session?.user?.username || session?.user?.id || '';
  const siswaNama = session?.user?.nama || '';
  const kelasId = session?.user?.kelas_id || session?.user?.kelas || '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const attendanceSummary = await getAttendanceSummary(context, siswaId, siswaKeys);
  const totalAlpa = Number(attendanceSummary?.total_alpa || 0);
  const hasAlpaWarning = totalAlpa >= ALPA_ALERT_THRESHOLD;

  let semuaPengumuman = [];
  let readMap = new Map();
  if (kelasId) {
    semuaPengumuman = await getPengumumanForSiswa(context, kelasId);
  }
  if (siswaId) {
    readMap = await getPengumumanReadMap(siswaId);
  }
  const readKey = (id) => `${String(id).trim()}__${String(siswaId).trim().toLowerCase()}`;
  const hitungBelumDibaca = () =>
    semuaPengumuman.filter((item) => !readMap.has(readKey(item.id))).length;
  const belumDibaca = hitungBelumDibaca();
  const attendanceBadge = hasAlpaWarning
    ? `<span class="student-notification-badge" aria-label="${totalAlpa} kali alpa">${totalAlpa > 9 ? '9+' : totalAlpa}</span>`
    : '';
  const announcementBadge = belumDibaca > 0
    ? `<span class="student-notification-badge" aria-label="${belumDibaca} pengumuman belum dibaca">${belumDibaca > 9 ? '9+' : belumDibaca}</span>`
    : '';

  function renderDashboardTimeline() {
    const timeline = container.querySelector('#dashboard-timeline-pengumuman');
    if (!timeline) return;

    if (!kelasId) {
      timeline.innerHTML = emptyStateDashboard('Kelas belum diatur', 'Akun Anda belum terhubung ke kelas mana pun sehingga pengumuman belum dapat ditampilkan.');
      return;
    }
    if (!semuaPengumuman.length) {
      timeline.innerHTML = emptyStateDashboard('Belum ada pengumuman', 'Pengumuman dari guru akan muncul di sini sebagai linimasa.');
      return;
    }

    const ditampilkan = semuaPengumuman.slice(0, PENGUMUMAN_DASHBOARD_MAX);
    const masihAda = semuaPengumuman.length > PENGUMUMAN_DASHBOARD_MAX;

    timeline.innerHTML = `
      <div class="relative pl-14 sm:pl-16">
        <span class="absolute left-[22px] top-3 bottom-3 w-px bg-gradient-to-b from-amber-200 via-slate-200 to-transparent sm:left-[26px]"></span>
        ${ditampilkan.map((item, idx) => renderDashboardTimelineItem(item, idx === ditampilkan.length - 1)).join('')}
        ${masihAda ? `<p class="pt-3 text-center text-[11px] text-slate-400">Geser ke atas untuk melihat ${semuaPengumuman.length - PENGUMUMAN_DASHBOARD_MAX} pengumuman lebih lama</p>` : ''}
      </div>`;

    timeline.querySelectorAll('[data-pengumuman-id]').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-pengumuman-id');
        const key = readKey(id);
        if (readMap.has(key)) return;
        await recordPengumumanRead({
          pengumuman_id: id,
          siswa_id: siswaId,
          siswa_nama: siswaNama,
        });
        readMap.set(key, { pengumuman_id: id, siswa_id: siswaId });
        perbaruiBadgeDashboard();
        const item = semuaPengumuman.find((p) => p.id === id);
        if (item) {
          const baru = renderDashboardTimelineItem(item, false, true);
          if (baru) el.outerHTML = baru;
        }
      });
    });
  }

  function renderDashboardTimelineItem(item, isLast, sudahDibaca) {
    const d = new Date(item.created_at);
    const tanggalValid = !Number.isNaN(d.getTime());
    const hari = tanggalValid ? d.getDate() : '?';
    const bulan = tanggalValid ? monthShort[d.getMonth()] : '';
    const tahun = tanggalValid ? d.getFullYear() : '';

    const dibaca = sudahDibaca || readMap.has(readKey(item.id));
    const warnaTanggal = dibaca
      ? 'border-slate-200 bg-white text-slate-500'
      : 'border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600';
    const badgeBaru = dibaca
      ? ''
      : `<span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
           <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>Baru
         </span>`;

    const lingkaranClasses = isLast ? 'mb-0' : 'mb-5';

    return `
      <div data-pengumuman-id="${escapeHtml(item.id)}" class="group relative ${lingkaranClasses} cursor-pointer rounded-3xl border ${dibaca ? 'border-slate-100 bg-white' : 'border-amber-100 bg-white'} p-4 shadow-sm ring-1 ring-slate-50 transition hover:-translate-y-0.5 hover:shadow-md">
        <div class="absolute -left-14 top-3 flex h-11 w-11 flex-col items-center justify-center rounded-2xl border-2 bg-white shadow-sm sm:-left-16 sm:h-12 sm:w-12 ${warnaTanggal}">
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
        <p class="mt-3 line-clamp-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">${escapeHtml(item.isi || '')}</p>
        ${tanggalValid ? `<p class="mt-3 text-[10px] uppercase tracking-wide text-slate-300">${tahun}</p>` : ''}
      </div>`;
  }

  function perbaruiBadgeDashboard() {
    const badge = container.querySelector('#dashboard-badge-belum');
    if (!badge) return;
    const sisa = hitungBelumDibaca();
    if (sisa > 0) {
      badge.textContent = `${sisa} belum dibaca`;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function emptyStateDashboard(judul, pesan) {
    return `
      <div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l14-7v16L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h2"/><path d="M19 8v8"/></svg>
        </div>
        <p class="text-sm font-semibold text-slate-600">${escapeHtml(judul)}</p>
        <p class="mx-auto mt-1 max-w-xs text-xs text-slate-400">${escapeHtml(pesan)}</p>
      </div>`;
  }

  const html = renderLayout('Dashboard Siswa', `
    <div class="space-y-6">
      <section>
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f766e] via-[#0891b2] to-[#0ea5e9] p-6 text-white sm:p-8">
          <div class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl"></div>
          <div class="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-teal-300/20 blur-3xl"></div>
          <div class="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-xs font-medium uppercase tracking-[0.2em] text-teal-100">${greeting}</p>
              <h1 class="mt-1.5 text-2xl font-semibold sm:text-3xl">${shortName}</h1>
              <p class="mt-2 text-sm text-white/80">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              ${hasAlpaWarning ? `
              <div class="rounded-xl border border-rose-300/40 bg-rose-500/20 px-4 py-2.5 backdrop-blur-sm">
                <p class="text-[11px] font-medium uppercase tracking-wide text-rose-100">Alpa periode ini</p>
                <p class="text-lg font-semibold">${totalAlpa} kali</p>
              </div>
              ` : `
              <div class="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
                <p class="text-[11px] font-medium uppercase tracking-wide text-blue-200">Pengumuman baru</p>
                <p class="text-lg font-semibold">${belumDibaca} belum dibaca</p>
              </div>
              `}
              <a href="${hasAlpaWarning ? '#siswa/absensi' : '#siswa/materi'}" class="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-primary)] transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e40af] active:scale-[0.98]">
                ${hasAlpaWarning ? 'Cek Absensi' : 'Baca Materi'}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="mb-3">
          <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-600">Ruang belajar</p>
          <h2 class="mt-1 text-xl font-bold tracking-tight text-slate-900">Akses cepat untukmu</h2>
        </div>
        <div class="student-action-grid">
          ${quickCard('#siswa/nilai', 'Nilai', 'Pantau perkembangan belajar per mata pelajaran.', '<path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5"/><circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none"/>', 'cyan', { featured: true })}
          ${quickCard('#siswa/absensi', 'Absensi', hasAlpaWarning ? 'Perhatian kehadiran!' : 'Pantau kehadiran harian.', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/>', hasAlpaWarning ? 'rose' : 'teal', { badge: attendanceBadge })}
          ${quickCard('#siswa/materi', 'Materi', 'Baca materi dari guru.', '<path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/>', 'sky')}
          ${quickCard('#siswa/kuiz', 'Ujian', 'Masuk ke ujian kelas.', '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>', 'teal')}
          ${quickCard('#siswa/pengumuman', 'Woro-woro', 'Pengumuman dari guru.', '<path d="M3 11l14-7v16L3 13z"/><path d="M3 11v2a2 2 0 0 0 2 2h2"/><path d="M19 8v8"/>', 'amber', { badge: announcementBadge })}
          ${quickCard('#siswa/kas-kelas', 'Kas Kelas', 'Cek iuran & saldo kelas.', '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="13.5" r="1.4" fill="currentColor" stroke="none"/>', 'amber')}
          ${quickCard('#siswa/pengatur-sistem', 'Akun', 'Kelola profil dan sandi.', '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z"/>', 'slate')}
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Woro-woro</h2>
          <a href="#siswa/pengumuman" class="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline">
            Lihat semua
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </a>
        </div>
        <span id="dashboard-badge-belum" class="${belumDibaca > 0 ? '' : 'hidden'} mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
          <span class="h-2 w-2 rounded-full bg-amber-500"></span>
          ${belumDibaca} belum dibaca
        </span>
        <div id="dashboard-timeline-pengumuman" class="max-h-[460px] overflow-y-auto pr-1"></div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  renderDashboardTimeline();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
