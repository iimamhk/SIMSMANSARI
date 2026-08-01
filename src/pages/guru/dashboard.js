import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getTeachingAssignmentsForUser, getDocumentsWhere } from '../../firebase/data-service.js';
import { getExportStatus } from '../../utils/backup-policy.js';

/** Amankan teks untuk dipakai di dalam atribut HTML (mis. title="..."). */
function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
      return `<div class="hero-celestial hc-moon ${theme.celestialPos} h-11 w-11 sm:h-16 sm:w-16">
        <div class="hc-halo"></div>
        <div class="hc-disk"></div>
      </div>`;
    }
    return `<div class="hero-celestial ${theme.celestialFloat ? 'hc-float' : ''} ${theme.celestialPos} h-12 w-12 sm:h-20 sm:w-20" style="--hc-color:${theme.hcColor};--hc-core:${theme.hcCore};--hc-edge:${theme.hcEdge};--hc-glow:${theme.hcGlow}">
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
    teal: 'ios-app-icon--green',
    cyan: 'ios-app-icon--blue',
    sky: 'ios-app-icon--indigo',
    amber: 'ios-app-icon--orange',
    slate: 'ios-app-icon--slate',
  }[tone] || 'ios-app-icon--blue');
  const quickCard = (href, title, desc, icon, tone = 'blue', featured = false) => `
          <a href="${href}" class="ios-app group ${featured ? 'ios-app--primary' : ''}"${featured ? '' : ` title="${desc}"`}>
            <span class="ios-app-icon ${toneChip(tone)}">
              <span class="ios-app-gloss"></span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </span>
            <span class="ios-app-label">${title}</span>
          </a>`;
  const quickCardButton = (id, title, desc, icon, tone = 'amber', extraBadge = '') => `
          <button id="${id}" type="button" class="ios-app group" title="${desc}">
            <span class="ios-app-icon ${toneChip(tone)}">
              <span class="ios-app-gloss"></span>
              ${extraBadge}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </span>
            <span class="ios-app-label">${title}</span>
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

  // Status ekspor data guru. Seluruhnya dibaca dari localStorage, jadi tidak ada
  // satu pun operasi baca Firestore untuk menampilkan bagian ini.
  const exportStatus = getExportStatus();
  const backupBadge = exportStatus.allowed
    ? `<span class="ios-notification-badge" title="${escapeAttr(exportStatus.title)}">!</span>`
    : `<span class="ios-status-dot" title="${escapeAttr(exportStatus.title)}"><span class="visually-hidden">${escapeAttr(exportStatus.title)}</span></span>`;

  // Keterangan pada kartu dibuat sebagai kalimat utuh, bukan hanya titik warna,
  // agar guru langsung tahu keadaannya tanpa perlu membuka halaman backup.
  const backupCardDesc = exportStatus.state === 'done'
    ? 'Sudah tersimpan minggu ini.'
    : exportStatus.state === 'never'
      ? 'Belum pernah disimpan.'
      : 'Belum tersimpan minggu ini.';

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

  // Konten berikut sengaja bersifat lokal dan deterministik. Dashboard tetap
  // terasa hidup tanpa menambah pembacaan data dari Firestore.
  const dayProgress = Math.min(100, Math.max(8, Math.round(((hour * 60 + new Date().getMinutes()) / 1440) * 100)));
  const focusCopy = hour < 12
    ? 'Awali dengan absensi dan satu target mengajar yang paling penting.'
    : hour < 18
      ? 'Rapikan catatan pembelajaran selagi konteks kelas masih segar.'
      : 'Gunakan sore ini untuk refleksi singkat dan menyiapkan esok.';
  const localTip = hour % 2 === 0
    ? 'Tip hari ini: simpan satu kalimat refleksi setelah setiap sesi mengajar.'
    : 'Tip hari ini: beri ruang 2 menit bagi siswa untuk merangkum pelajaran dengan kata mereka sendiri.';

  const scheduleSortValue = (item) => {
    const raw = String(item?.jam_ke || '').trim();
    const timeMatch = raw.match(/(?:^|\s)(\d{1,2})[.:](\d{2})/);
    if (timeMatch) return (Number(timeMatch[1]) * 60) + Number(timeMatch[2]);
    const numberMatch = raw.match(/\d+/);
    return numberMatch ? Number(numberMatch[0]) : Number.MAX_SAFE_INTEGER;
  };
  const getScheduleTimeRange = (item) => {
    const raw = String(item?.jam_ke || '').trim();
    const matches = [...raw.matchAll(/(\d{1,2})[.:](\d{2})/g)];
    if (!matches.length) return null;
    const toMinutes = (match) => (Number(match[1]) * 60) + Number(match[2]);
    return { start: toMinutes(matches[0]), end: matches[1] ? toMinutes(matches[1]) : null };
  };
  const getScheduleStatus = (item, index, schedules) => {
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const range = getScheduleTimeRange(item);
    if (range) {
      if (currentMinutes < range.start) {
        const hasEarlierActiveOrUpcoming = schedules.slice(0, index).some((entry) => {
          const earlierRange = getScheduleTimeRange(entry);
          return earlierRange && (!earlierRange.end || currentMinutes <= earlierRange.end);
        });
        return hasEarlierActiveOrUpcoming
          ? { label: 'Terjadwal', tone: 'planned' }
          : { label: 'Berikutnya', tone: 'next' };
      }
      if (range.end && currentMinutes <= range.end) return { label: 'Berlangsung', tone: 'live' };
      if (range.end && currentMinutes > range.end) return { label: 'Selesai', tone: 'done' };
    }
    const hasEarlierPending = schedules.slice(0, index).some((entry, earlierIndex) => {
      const earlierStatus = getScheduleStatus(entry, earlierIndex, schedules.slice(0, index));
      return earlierStatus.tone === 'live' || earlierStatus.tone === 'next';
    });
    return !hasEarlierPending
      ? { label: 'Berikutnya', tone: 'next' }
      : { label: 'Terjadwal', tone: 'planned' };
  };

  const pageHtml = `
    <div class="space-y-6">
      <section>
        <div class="guru-ios-hero relative overflow-hidden bg-gradient-to-br ${heroTheme.panel} px-4 py-4 ${cMain} sm:px-8 sm:py-7">
          <div class="guru-ios-hero-glass"></div>
          <div class="guru-ios-hero-orb guru-ios-hero-orb--one"></div>
          <div class="guru-ios-hero-orb guru-ios-hero-orb--two"></div>
          <div class="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full ${L ? 'bg-white/30' : 'bg-white/10'} blur-3xl"></div>
          <div class="pointer-events-none absolute -bottom-20 -left-10 h-36 w-36 rounded-full ${L ? 'bg-white/25' : 'bg-white/10'} blur-3xl"></div>
          ${renderCelestial(heroTheme)}
          ${heroTheme.celestialType === 'moon' ? nightStars : ''}
          <div class="relative flex flex-col">
            <div class="min-w-0">
              <h1 class="guru-ios-title">${greeting}, ${shortName}</h1>
              <p class="guru-ios-date mt-1 ${cSub}">${todayName}, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</p>
              <p class="guru-ios-quote mt-1.5 flex items-start gap-1.5 ${cQuote}">
                <svg viewBox="0 0 24 24" class="mt-0.5 h-3.5 w-3.5 shrink-0 ${cIcon}" fill="currentColor"><path d="M9.5 7C6.5 7 5 9 5 12v5h6v-6H8c0-1.5.5-2 2-2V7zm9 0c-3 0-4.5 2-4.5 5v5h6v-6h-3c0-1.5.5-2 2-2V7z"/></svg>
                <span>${heroTheme.quote}</span>
              </p>
            </div>
            <div class="mt-3 flex items-center gap-2.5 border-t pt-3 ${L ? 'border-black/10' : 'border-white/15'}">
              <div class="guru-ios-schedule border ${chip}">
                <p class="text-[11px] font-medium uppercase tracking-wide ${cEyebrow}">Jadwal hari ini</p>
                <p class="text-base font-semibold ${cMain}"><span id="hero-jadwal-count">-</span> kelas</p>
              </div>
              <a href="#guru/input-absen" class="guru-ios-hero-button ml-auto">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/></svg>
                Mulai Absensi
              </a>
            </div>
          </div>
        </div>
      </section>

      <section class="guru-workspace-grid">
        <div class="min-w-0">
          <div class="mb-3 flex items-end justify-between gap-3">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-600">Ruang kerja</p>
              <h2 class="mt-1 text-xl font-bold tracking-tight text-slate-900">Mulai dari yang penting</h2>
            </div>
            <span class="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 sm:inline-flex">${dayProgress}% waktu hari berjalan</span>
          </div>
          <div class="guru-action-grid">
            ${quickCard('#guru/input-absen', 'Absensi', 'Catat kehadiran kelas.', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/>', 'teal', true)}
            ${quickCard('#guru/penilaian', 'Penilaian', 'Kelola nilai dengan rapi.', '<path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5"/><circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none"/>', 'cyan')}
            ${quickCard('#guru/jurnal', 'Jurnal', 'Simpan refleksi mengajar.', '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 11h8M8 15h6"/>', 'sky')}
            ${quickCard('#guru/materi', 'Materi', 'Buat bahan belajar.', '<path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/>', 'teal')}
            ${quickCard('#guru/materi-ai', 'Materi AI', 'Mulai dari ide cerdas.', '<path d="M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.7L12 3z"/><path d="M18.5 15l.9 2.3 2.4.9-2.4.9-.9 2.3-.9-2.3-2.4-.9 2.4-.9.9-2.3z"/>', 'cyan')}
            ${waliQuickCard}
            ${quickCardButton('btn-backup-data', 'Backup Data', backupCardDesc, '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>', 'amber', backupBadge)}
            <div class="ios-today-widget" aria-label="Ringkasan hari ini">
              <div class="ios-today-date"><span>${todayName.slice(0, 3)}</span><strong>${new Date().getDate()}</strong></div>
              <div class="min-w-0 flex-1">
                <p class="ios-today-kicker">Kelas berikutnya</p>
                <p id="workspace-next-class" class="ios-today-summary"><strong>Memuat jadwal...</strong></p>
                <div class="ios-today-progress"><span style="width:${dayProgress}%"></span></div>
              </div>
            </div>
          </div>
        </div>
        <aside class="guru-insight-panel">
          <div class="flex items-start justify-between gap-3"><div><p class="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-600">Fokus hari ini</p><h3 class="mt-1 text-lg font-bold text-slate-900">Tetap ringan, tetap berdampak.</h3></div><span class="guru-sparkle">✦</span></div>
          <p class="mt-3 text-sm leading-relaxed text-slate-600">${focusCopy}</p>
          <div class="mt-5"><div class="mb-2 flex justify-between text-xs font-semibold text-slate-500"><span>Waktu hari berjalan</span><span>${dayProgress}%</span></div><div class="h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400" style="width:${dayProgress}%"></div></div></div>
          <div class="mt-5 rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-900">${localTip}</div>
        </aside>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-500">Jadwal Mengajar</h2>
          <span id="jadwal-count" class="rounded-full bg-[var(--color-primary-container)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)]">Memuat...</span>
        </div>
        <div id="jadwal-hari-ini" class="space-y-2" aria-live="polite">
          <div class="dashboard-schedule-skeleton"></div>
          <div class="dashboard-schedule-skeleton"></div>
          <div class="dashboard-schedule-skeleton"></div>
        </div>
      </section>
    </div>
  `;

  const html = renderLayout('Dashboard Guru', pageHtml);

  container.innerHTML = html;

  const renderJadwal = async () => {
    const wrap = container.querySelector('#jadwal-hari-ini');
    const badge = container.querySelector('#jadwal-count');
    if (!wrap) return;

    try {
      const userId = session?.user?.username || '';
      const assignments = await getTeachingAssignmentsForUser(context, userId);
      const todaySchedules = assignments
        .filter((item) => String(item.hari || '').toLowerCase() === todayName.toLowerCase())
        .sort((a, b) => scheduleSortValue(a) - scheduleSortValue(b));

    if (badge) {
      badge.textContent = `${todaySchedules.length} jadwal`;
    }
    const heroCount = container.querySelector('#hero-jadwal-count');
    if (heroCount) {
      heroCount.textContent = String(todaySchedules.length);
    }
    const nextClass = container.querySelector('#workspace-next-class');
    if (nextClass) {
      nextClass.innerHTML = todaySchedules.length
        ? `<strong>${todaySchedules[0].mapel_nama || '-'}</strong><br><span>Kelas ${todaySchedules[0].kelas_nama || '-'} · Jam ${todaySchedules[0].jam_ke || '-'}</span>`
        : '<strong>Tidak ada kelas lagi</strong><br><span>Waktu untuk menyiapkan esok.</span>';
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

      const currentScheduleIndex = todaySchedules.findIndex((item, index) => {
        const status = getScheduleStatus(item, index, todaySchedules);
        return status.tone === 'live';
      });
      const nextScheduleIndex = todaySchedules.findIndex((item, index) => getScheduleStatus(item, index, todaySchedules).tone === 'next');
      const effectiveNextIndex = currentScheduleIndex >= 0 ? currentScheduleIndex : nextScheduleIndex;
      if (nextClass) {
        if (effectiveNextIndex >= 0) {
          const nextItem = todaySchedules[effectiveNextIndex];
          const nextStatus = getScheduleStatus(nextItem, effectiveNextIndex, todaySchedules);
          nextClass.innerHTML = `<strong>${nextItem.mapel_nama || '-'}</strong><br><span>${nextStatus.label} · Kelas ${nextItem.kelas_nama || '-'} · Jam ${nextItem.jam_ke || '-'}</span>`;
        } else {
          nextClass.innerHTML = '<strong>Semua kelas selesai</strong><br><span>Jadwal mengajar hari ini telah berakhir.</span>';
        }
      }

      wrap.innerHTML = todaySchedules
      .map((item, index) => {
        const status = getScheduleStatus(item, index, todaySchedules);
        return `
          <div class="dashboard-schedule-card ${status.tone === 'next' || status.tone === 'live' ? 'is-next' : ''}">
            <div class="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <span class="text-[10px] font-semibold uppercase leading-none">Jam</span>
              <span class="text-sm font-bold leading-tight">${item.jam_ke || '-'}</span>
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-900">${item.mapel_nama || '-'}</p>
              <p class="truncate text-xs text-slate-500">Kelas ${item.kelas_nama || '-'}</p>
              <span class="dashboard-schedule-status ${status.tone}">${status.label}</span>
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-1.5">
              <a href="#guru/input-absen" class="dashboard-schedule-action primary">Absen</a>
              <a href="#guru/jurnal" class="dashboard-schedule-action secondary hidden sm:inline-flex">Jurnal</a>
            </div>
          </div>`
      })
      .join('');
    } catch (error) {
      console.error('Gagal memuat jadwal dashboard guru:', error);
      if (badge) badge.textContent = 'Gagal memuat';
      const nextClass = container.querySelector('#workspace-next-class');
      if (nextClass) nextClass.innerHTML = '<strong>Jadwal belum tersedia</strong><br><span>Periksa koneksi lalu coba lagi.</span>';
      wrap.innerHTML = `<div class="dashboard-schedule-error"><div><strong>Jadwal belum dapat dimuat.</strong><p class="mt-1">Data belum berhasil diambil dari server.</p></div><button id="retry-jadwal" type="button">Coba lagi</button></div>`;
      container.querySelector('#retry-jadwal')?.addEventListener('click', () => {
        if (badge) badge.textContent = 'Memuat...';
        wrap.innerHTML = '<div class="dashboard-schedule-skeleton"></div><div class="dashboard-schedule-skeleton"></div><div class="dashboard-schedule-skeleton"></div>';
        renderJadwal();
      }, { once: true });
    }
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
