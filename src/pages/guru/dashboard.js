import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getTeachingAssignmentsForUser, getDocumentsWhere } from '../../firebase/data-service.js';
import { getLastBackupTimestamp, getDaysSinceLastBackup, isBackupRequiredToday } from '../../utils/backup-excel.js';

export function renderGuruDashboard(container) {
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Bapak/Ibu Guru';
  const shortName = userName.split(' ')[0] || 'Guru';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayName = dayNames[new Date().getDay()];

  const sunRays = (count = 12, r1 = 36, r2 = 47) => {
    let lines = '';
    for (let i = 0; i < count; i++) {
      const a = ((i * 360) / count) * (Math.PI / 180);
      const x1 = (50 + r1 * Math.cos(a)).toFixed(1);
      const y1 = (50 + r1 * Math.sin(a)).toFixed(1);
      const x2 = (50 + r2 * Math.cos(a)).toFixed(1);
      const y2 = (50 + r2 * Math.sin(a)).toFixed(1);
      lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
    }
    return `<svg viewBox="0 0 100 100" class="hc-rays" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">${lines}</svg>`;
  };
  const renderCelestial = (theme) => {
    if (theme.celestialType === 'moon') {
      return `<div class="hero-celestial hc-moon ${theme.celestialPos} h-14 w-14 sm:h-16 sm:w-16">
        <div class="hc-halo"></div>
        <div class="hc-disk"></div>
      </div>`;
    }
    return `<div class="hero-celestial ${theme.celestialFloat ? 'hc-float' : ''} ${theme.celestialPos} h-16 w-16 sm:h-20 sm:w-20" style="--hc-color:${theme.hcColor};--hc-core:${theme.hcCore};--hc-edge:${theme.hcEdge};--hc-glow:${theme.hcGlow}">
      <div class="hc-halo"></div>
      ${sunRays()}
      <div class="hc-disk"></div>
    </div>`;
  };
  const nightStars = `
    <div class="hero-stars">
      <span class="hc-star" style="left:12%;top:22%;width:3px;height:3px;animation-delay:.2s"></span>
      <span class="hc-star" style="left:28%;top:14%;width:2px;height:2px;animation-delay:1.1s"></span>
      <span class="hc-star" style="left:46%;top:26%;width:3px;height:3px;animation-delay:.7s"></span>
      <span class="hc-star" style="left:63%;top:12%;width:2px;height:2px;animation-delay:1.6s"></span>
      <span class="hc-star" style="left:80%;top:30%;width:3px;height:3px;animation-delay:.4s"></span>
      <span class="hc-star" style="left:90%;top:16%;width:2px;height:2px;animation-delay:2s"></span>
    </div>`;

  const heroTheme = (() => {
    const m = hour * 60 + new Date().getMinutes();
    const sun = 'right-6 bottom-3';
    if (m >= 270 && m < 360) return { // 04:30–06:00 Fajar
      panel: 'from-[#F6A55F] via-[#FFD7A1] to-[#FFEFD8]', onLight: true, txt: '#47342A',
      quote: 'Fajar membawa harapan baru — mulai hari dengan niat ikhlas.',
      celestialType: 'sun', celestialPos: sun, celestialFloat: true,
      hcColor: 'rgba(255,243,200,0.85)', hcCore: '#ffe27a', hcEdge: '#ffb43d', hcGlow: 'rgba(255,210,110,0.85)',
    };
    if (m < 480) return { // 06:00–08:00 Matahari Terbit
      panel: 'from-[#4FA8FF] via-[#8ED6FF] to-[#FFF4C4]', onLight: true, txt: '#1D3557',
      quote: 'Setiap pagi adalah kesempatan baru untuk menginspirasi siswa.',
      celestialType: 'sun', celestialPos: sun, celestialFloat: true,
      hcColor: 'rgba(255,243,200,0.9)', hcCore: '#fff6cf', hcEdge: '#ffd86b', hcGlow: 'rgba(255,236,150,0.95)',
    };
    if (m < 600) return { // 08:00–10:00 Langit Biru Sejuk
      panel: 'from-[#2F80ED] via-[#6EC6FF] to-[#B9F2FF]', onLight: true, txt: '#23395B',
      quote: 'Langit cerah cermin pikiran jernih — saatnya fokus mengajar.',
      celestialType: 'sun', celestialPos: sun, celestialFloat: true,
      hcColor: 'rgba(255,243,200,0.9)', hcCore: '#fff6cf', hcEdge: '#ffd86b', hcGlow: 'rgba(255,236,150,0.95)',
    };
    if (m < 780) return { // 10:00–13:00 Tengah Hari
      panel: 'from-[#4C8BF5] via-[#7EC9FF] to-[#FFFFFF]', onLight: true, txt: '#223A5E',
      quote: 'Puncak energi hari ini — pertahankan ritme dan semangat mengajar.',
      celestialType: 'sun', celestialPos: sun, celestialFloat: true,
      hcColor: 'rgba(255,243,200,0.95)', hcCore: '#fff6cf', hcEdge: '#ffd86b', hcGlow: 'rgba(255,236,150,0.95)',
    };
    if (m < 960) return { // 13:00–16:00 Siang Hangat
      panel: 'from-[#5C8DFF] via-[#A5D8FF] to-[#FFE5B2]', onLight: true, txt: '#2D3F5F',
      quote: 'Ke hangatan siang, rapikan progres sebelum sore tiba.',
      celestialType: 'sun', celestialPos: sun, celestialFloat: true,
      hcColor: 'rgba(255,243,200,0.9)', hcCore: '#fff6cf', hcEdge: '#ffd86b', hcGlow: 'rgba(255,236,150,0.95)',
    };
    if (m < 1080) return { // 16:00–18:00 Senja
      panel: 'from-[#FF8A5C] via-[#FFC48A] to-[#FFD6C0]', onLight: true, txt: '#50312C',
      quote: 'Setiap kerja keras hari ini jadi bibit masa depan siswa.',
      celestialType: 'sun', celestialPos: sun, celestialFloat: true,
      hcColor: 'rgba(255,225,180,0.9)', hcCore: '#ffb259', hcEdge: '#ff7a3d', hcGlow: 'rgba(255,140,80,0.85)',
    };
    if (m < 1260) return { // 18:00–21:00 Malam Awal
      panel: 'from-[#3949AB] via-[#5C6BC0] to-[#7E8CE0]', onLight: false,
      quote: 'Malam tenang untuk merangkum dan menyiapkan esok.',
      celestialType: 'moon', celestialPos: 'right-6 top-4',
    };
    return { // 21:00–04:30 Tengah Malam
      panel: 'from-[#1F2A5A] via-[#394C8D] to-[#5E72E4]', onLight: false,
      quote: 'Guru hebat tak pernah berhenti belajar, bahkan di tengah malam.',
      celestialType: 'moon', celestialPos: 'right-6 top-4',
    };
  })();

  const toneChip = (tone) => ({
    teal: 'bg-teal-500/10 text-teal-600',
    cyan: 'bg-cyan-500/10 text-cyan-600',
    sky: 'bg-sky-500/10 text-sky-600',
    amber: 'bg-amber-500/10 text-amber-600',
    slate: 'bg-slate-500/10 text-slate-600',
  }[tone] || 'bg-teal-500/10 text-teal-600');
  const quickCard = (href, title, desc, icon, tone = 'blue') => `
          <a href="${href}" class="qa-card group flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 active:scale-[0.98]">
            <span class="flex h-12 w-12 items-center justify-center rounded-[1rem] ${toneChip(tone)} transition group-hover:scale-105 group-active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </span>
            <span class="min-w-0 w-full">
              <p class="text-sm font-semibold text-slate-900">${title}</p>
              <p class="mt-0.5 text-xs leading-snug text-slate-500">${desc}</p>
            </span>
          </a>`;
  const quickCardButton = (id, title, desc, icon, tone = 'amber', extraBadge = '') => `
          <button id="${id}" type="button" class="qa-card group relative flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 active:scale-[0.98]">
            ${extraBadge}
            <span class="flex h-12 w-12 items-center justify-center rounded-[1rem] ${toneChip(tone)} transition group-hover:scale-105 group-active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </span>
            <span class="min-w-0 w-full">
              <p class="text-sm font-semibold text-slate-900">${title}</p>
              <p class="mt-0.5 text-xs leading-snug text-slate-500">${desc}</p>
            </span>
          </button>`;

  const waliCacheDash = (() => {
    try {
      return JSON.parse(localStorage.getItem('simguru_wali') || 'null');
    } catch {
      return null;
    }
  })();
  const waliQuickCard = waliCacheDash && waliCacheDash.kelas_id
    ? quickCard('#guru/wali-kelas', 'Wali Kelas', `Kelola kelas ${waliCacheDash.kelas_nama}.`, '<rect x="3.5" y="5" width="17" height="11" rx="2"/><path d="M8 20h8M12 16v4"/>', 'sky')
    : '';

  const lastBackup = getLastBackupTimestamp();
  const daysSince = getDaysSinceLastBackup();
  const backupRequired = isBackupRequiredToday();
  let backupBadge = '';
  if (backupRequired) {
    const today = new Date().getDay() === 5;
    backupBadge = `<span class="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full ${today ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'} px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
      <span class="inline-block h-1.5 w-1.5 rounded-full ${today ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}"></span>
      ${today ? 'Wajib' : 'Perlu'}
    </span>`;
  } else if (lastBackup) {
    backupBadge = `<span class="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
      <svg viewBox="0 0 24 24" class="h-2.5 w-2.5" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
      Aman
    </span>`;
  }

  const L = heroTheme.onLight;
  const txt = heroTheme.txt || '#0f172a';
  const cMain = L ? `text-[${txt}]` : 'text-white';
  const cEyebrow = L ? `text-[${txt}]/70` : 'text-white/70';
  const cSub = L ? `text-[${txt}]/75` : 'text-white/80';
  const cQuote = L ? `text-[${txt}]/85` : 'text-white/90';
  const cIcon = L ? `text-[${txt}]/50` : 'text-white/70';
  const chip = L
    ? `border-black/10 bg-black/5 ${cEyebrow}`
    : 'border-white/15 bg-white/10 text-white/70 backdrop-blur-sm';

  const pageHtml = `
    <div class="space-y-6">
      <section>
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroTheme.panel} p-6 ${cMain} shadow-lg sm:p-8">
          <div class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full ${L ? 'bg-white/30' : 'bg-white/10'} blur-3xl"></div>
          <div class="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full ${L ? 'bg-white/25' : 'bg-white/10'} blur-3xl"></div>
          ${renderCelestial(heroTheme)}
          ${heroTheme.celestialType === 'moon' ? nightStars : ''}
          <div class="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0 max-w-xl">
              <p class="text-xs font-medium uppercase tracking-[0.2em] ${cEyebrow}">${greeting}</p>
              <h1 class="mt-1.5 text-2xl font-semibold sm:text-3xl">${shortName}</h1>
              <p class="mt-2 text-sm ${cSub}">${todayName}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</p>
              <p class="mt-3 flex items-start gap-2 text-sm font-medium italic ${cQuote}">
                <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 ${cIcon}" fill="currentColor"><path d="M9.5 7C6.5 7 5 9 5 12v5h6v-6H8c0-1.5.5-2 2-2V7zm9 0c-3 0-4.5 2-4.5 5v5h6v-6h-3c0-1.5.5-2 2-2V7z"/></svg>
                <span>${heroTheme.quote}</span>
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div class="rounded-xl border ${chip} px-4 py-2.5">
                <p class="text-[11px] font-medium uppercase tracking-wide ${cEyebrow}">Jadwal hari ini</p>
                <p class="text-lg font-semibold ${cMain}"><span id="hero-jadwal-count">-</span> kelas</p>
              </div>
              <a href="#guru/input-absen" class="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[0.98]">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/></svg>
                Mulai Absensi
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Menu Cepat</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          ${quickCard('#guru/input-absen', 'Absensi', 'Input kehadiran harian.', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/>', 'teal')}
          ${quickCard('#guru/penilaian', 'Penilaian', 'Kelola nilai per mapel.', '<path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5"/><circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none"/>', 'cyan')}
          ${quickCard('#guru/jurnal', 'Jurnal', 'Catat jurnal mengajar.', '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 11h8M8 15h6"/>', 'sky')}
          ${quickCard('#guru/materi', 'Materi', 'Buat & publikasi materi.', '<path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/>', 'teal')}
          ${quickCard('#guru/materi-ai', 'Materi AI', 'Materi bantuan AI.', '<path d="M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.7L12 3z"/><path d="M18.5 15l.9 2.3 2.4.9-2.4.9-.9 2.3-.9-2.3-2.4-.9 2.4-.9.9-2.3z"/>', 'cyan')}
          ${waliQuickCard}
          ${quickCardButton('btn-backup-data', 'Backup Data', 'Cadangkan ke Excel.', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>', 'amber', backupBadge)}
          ${quickCard('#guru/pengatur-sistem', 'Akun', 'Pengaturan akun.', '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z"/>', 'slate')}
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Jadwal Mengajar</h2>
          <span id="jadwal-count" class="rounded-full bg-[var(--color-primary-container)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)]">0 jadwal</span>
        </div>
        <div id="jadwal-hari-ini" class="space-y-2"></div>
      </section>
    </div>
  `;

  const html = renderLayout('Dashboard Guru', pageHtml);

  container.innerHTML = html;

  const renderJadwal = async () => {
    const wrap = container.querySelector('#jadwal-hari-ini');
    const badge = container.querySelector('#jadwal-count');
    if (!wrap) return;

    const userId = session?.user?.username || '';
    const assignments = await getTeachingAssignmentsForUser(context, userId);
    const todaySchedules = assignments
      .filter((item) => String(item.hari || '').toLowerCase() === todayName.toLowerCase())
      .sort((a, b) => String(a.jam_ke || '').localeCompare(String(b.jam_ke || '')));

    if (badge) {
      badge.textContent = `${todaySchedules.length} jadwal`;
    }
    const heroCount = container.querySelector('#hero-jadwal-count');
    if (heroCount) {
      heroCount.textContent = String(todaySchedules.length);
    }

    if (!todaySchedules.length) {
      wrap.innerHTML = `
        <div class="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${heroTheme.panel} py-10 text-center text-white shadow-sm">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-6 w-6 text-white/90" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
          </div>
          <p class="mt-3 text-sm font-medium text-white/90">Tidak ada jadwal hari ini</p>
        </div>`;
      return;
    }

    wrap.innerHTML = todaySchedules
      .map(
        (item) => `
          <div class="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 transition hover:bg-slate-100">
            <div class="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <span class="text-[10px] font-semibold uppercase leading-none">Jam</span>
              <span class="text-sm font-bold leading-tight">${item.jam_ke || '-'}</span>
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-900">${item.mapel_nama || '-'}</p>
              <p class="truncate text-xs text-slate-500">Kelas ${item.kelas_nama || '-'}</p>
            </div>
            <div class="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-indigo-500 ring-1 ring-slate-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
            </div>
          </div>`
      )
      .join('');
  };

  renderJadwal();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });

  container.querySelector('#btn-backup-data')?.addEventListener('click', () => {
    window.location.hash = '#guru/backup';
  });

  const refreshWali = async () => {
    const userId = session?.user?.username || '';
    if (!userId) return;
    const waliRels = await getDocumentsWhere('wali_kelas', [
      { field: 'guru_id', value: userId },
      { field: 'tahun_ajaran_id', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', value: context.semester_aktif },
    ], { cacheMs: 180000 });
    const wali = waliRels[0] || null;
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem('simguru_wali') || 'null');
    } catch {
      cached = null;
    }
    const changed = (wali?.kelas_id || null) !== (cached?.kelas_id || null);
    if (changed) {
      try {
        localStorage.setItem('simguru_wali', JSON.stringify(wali));
      } catch {}
      renderGuruDashboard(container);
    }
  };

  refreshWali();
}
