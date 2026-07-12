export function renderLayout(title, content, opts = {}) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const userName = session?.user?.nama || 'Pengguna';
  const role = session?.user?.role || 'guest';
  const isAdmin = role === 'admin';
  const isGuru = role === 'guru';
  const isSiswa = role === 'siswa';
  let waliCache = null;
  try {
    waliCache = JSON.parse(localStorage.getItem('simguru_wali') || 'null');
  } catch {
    waliCache = null;
  }
  const isWaliKelas = isGuru && !!(waliCache && waliCache.kelas_id);
  const currentHash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
  const activePeriod = context?.tahun_ajaran_aktif_nama && context?.semester_aktif_nama
    ? `${context.tahun_ajaran_aktif_nama} / ${context.semester_aktif_nama}`
    : '';
  const headerClockRoutes = [
    '#guru/dashboard',
    '#guru/input-absen',
    '#guru/jurnal',
    '#guru/input-nilai',
    '#guru/penilaian',
    '#guru/materi',
    '#guru/materi-ai',
    '#guru/game',
    '#guru/kuiz',
    '#guru/pembayaran-buku',
    '#guru/wali-kelas',
    '#siswa/dashboard',
    '#siswa/absensi',
    '#siswa/nilai',
    '#siswa/materi',
    '#siswa/game',
    '#siswa/kuiz',
  ];
  const showHeaderClock = (isGuru || isSiswa) && headerClockRoutes.some((route) => currentHash === route || currentHash.startsWith(`${route}/`));

  const accentPanel = opts?.accentPanel || 'from-emerald-500 via-cyan-500 to-sky-500';

  const isRouteActive = (routes) => routes.some((route) => currentHash === route || currentHash.startsWith(`${route}/`));
  const activeItemClass = 'text-[#4F46E5]';
  const inactiveItemClass = 'text-slate-500';

  const iconWallet = (active) => `
    <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="16.5" cy="13.5" r="1.4" fill="currentColor"/>
    </svg>
  `;

  const guruBottomNavItems = [
    {
      label: 'Home',
      href: '#guru/dashboard',
      routes: ['#guru/dashboard'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
    {
      label: 'Absen',
      href: '#guru/input-absen',
      routes: ['#guru/input-absen'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `,
    },
    {
      label: 'Materi',
      href: '#guru/materi',
      routes: ['#guru/materi'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M17.5 4l.7 1.9L20 6.5l-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
      `,
    },
    {
      label: 'Nilai',
      href: '#guru/penilaian',
      routes: ['#guru/penilaian', '#guru/input-nilai'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="5" cy="19" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="6" r="1.2" fill="currentColor"/>
          <circle cx="19" cy="13" r="1.2" fill="currentColor"/>
        </svg>
      `,
    },
    {
      label: 'Akun',
      href: '#guru/pengatur-sistem',
      routes: ['#guru/pengatur-sistem'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="currentColor" stroke-width="1.8"/>
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
  ];

  const guruBottomNav = guruBottomNavItems
    .map((item) => {
      const active = isRouteActive(item.routes);
      return `
        <a href="${item.href}" class="group relative flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-1.5 transition-colors ${active ? '' : 'hover:bg-black/[0.03]'}">
          <span class="relative flex h-8 w-12 items-center justify-center">
            ${active ? '<span class="absolute inset-0 rounded-full bg-[var(--nav-primary-container)] nav-pill-active"></span>' : ''}
            <span class="relative flex h-8 w-8 items-center justify-center ${active ? 'nav-icon-active' : ''}">${item.icon(active)}</span>
          </span>
          <span class="relative text-[10px] font-medium leading-tight ${active ? 'text-[var(--nav-primary)] nav-label-active' : 'text-[var(--nav-inactive)]'}">${item.label}</span>
        </a>
      `;
    })
    .join('');

  const siswaBottomNavItems = [
    {
      label: 'Home',
      href: '#siswa/dashboard',
      routes: ['#siswa/dashboard'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
    {
      label: 'Nilai',
      href: '#siswa/nilai',
      routes: ['#siswa/nilai'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="5" cy="19" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="6" r="1.2" fill="currentColor"/>
          <circle cx="19" cy="13" r="1.2" fill="currentColor"/>
        </svg>
      `,
    },
    {
      label: 'Absensi',
      href: '#siswa/absensi',
      routes: ['#siswa/absensi'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `,
    },
    {
      label: 'Materi',
      href: '#siswa/materi',
      routes: ['#siswa/materi'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `,
    },
    {
      label: 'Akun',
      href: '#siswa/pengatur-sistem',
      routes: ['#siswa/pengatur-sistem'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="currentColor" stroke-width="1.8"/>
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
  ];

  const siswaBottomNav = siswaBottomNavItems
    .map((item) => {
      const active = isRouteActive(item.routes);
      return `
        <a href="${item.href}" class="group relative flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-1.5 transition-colors ${active ? '' : 'hover:bg-black/[0.03]'}">
          <span class="relative flex h-8 w-12 items-center justify-center">
            ${active ? '<span class="absolute inset-0 rounded-full bg-[var(--nav-primary-container)] nav-pill-active"></span>' : ''}
            <span class="relative flex h-8 w-8 items-center justify-center ${active ? 'nav-icon-active' : ''}">${item.icon(active)}</span>
          </span>
          <span class="relative text-[10px] font-medium leading-tight ${active ? 'text-[var(--nav-primary)] nav-label-active' : 'text-[var(--nav-inactive)]'}">${item.label}</span>
        </a>
      `;
    })
    .join('');

  const iconHome = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const iconCalendar = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconChart = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="5" cy="19" r="1.2" fill="currentColor"/>
      <circle cx="12" cy="6" r="1.2" fill="currentColor"/>
      <circle cx="19" cy="13" r="1.2" fill="currentColor"/>
    </svg>
  `;

  const iconBook = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconUser = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconSettings = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const iconClassroom = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5" width="17" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconLink = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 14l4-4M8.5 16.5l-2 2a3 3 0 1 1-4.2-4.2l2-2M15.5 7.5l2-2a3 3 0 0 1 4.2 4.2l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconMegaphone = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 11l14-7v16L3 13z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M3 11v2a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M19 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconChat = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;

  const iconGame = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="8" width="18" height="8" rx="4" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconSparkle = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.7L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M18.5 15l.9 2.3 2.4.9-2.4.9-.9 2.3-.9-2.3-2.4-.9 2.4-.9.9-2.3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    </svg>
  `;

  const iconBookSpark = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M17.5 4l.7 1.9L20 6.5l-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>
  `;

  const desktopNavItems = isAdmin
    ? [
        { label: 'Dashboard', href: '#admin/dashboard', routes: ['#admin/dashboard'], icon: iconHome },
        { label: 'Tahun Ajaran', href: '#admin/master-tahun-ajaran', routes: ['#admin/master-tahun-ajaran'], icon: iconCalendar },
        { label: 'Akademik', href: '#admin/master-akademik', routes: ['#admin/master-akademik'], icon: iconBook },
        { label: 'Guru', href: '#admin/master-guru', routes: ['#admin/master-guru'], icon: iconUser },
        { label: 'Siswa', href: '#admin/master-siswa', routes: ['#admin/master-siswa'], icon: iconUser },
        { label: 'Lobi Sekolah', href: '#admin/lobi-sekolah', routes: ['#admin/lobi-sekolah'], icon: iconLink },
        { label: 'Mapping', href: '#admin/plotting-jadwal', routes: ['#admin/plotting-jadwal'], icon: iconLink },
        { label: 'Pembelajaran', href: '#admin/master-pembelajaran', routes: ['#admin/master-pembelajaran'], icon: iconClassroom },
        { label: 'Wali Kelas', href: '#admin/wali-kelas', routes: ['#admin/wali-kelas'], icon: iconClassroom },
        { label: 'Akun', href: '#admin/pengatur-sistem', routes: ['#admin/pengatur-sistem'], icon: iconSettings },
      ]
    : isGuru
      ? [
          { label: 'Dashboard', href: '#guru/dashboard', routes: ['#guru/dashboard'], icon: iconHome },
          { label: 'Input Absensi', href: '#guru/input-absen', routes: ['#guru/input-absen'], icon: iconCalendar },
          { label: 'Jurnal', href: '#guru/jurnal', routes: ['#guru/jurnal'], icon: iconBookSpark },
          { label: 'Input Nilai', href: '#guru/penilaian', routes: ['#guru/penilaian', '#guru/input-nilai'], icon: iconChart },
          { label: 'Materi', href: '#guru/materi', routes: ['#guru/materi'], icon: iconBookSpark },
          { label: 'Materi AI', href: '#guru/materi-ai', routes: ['#guru/materi-ai'], icon: iconSparkle },
          { label: 'Game Center', href: '#guru/game', routes: ['#guru/game'], icon: iconGame },
          { label: 'Kuiz', href: '#guru/kuiz', routes: ['#guru/kuiz'], icon: iconBookSpark },
          { label: 'Pembayaran', href: '#guru/pembayaran-buku', routes: ['#guru/pembayaran-buku'], icon: iconWallet },
          { label: 'Pengumuman', href: '#guru/pengumuman', routes: ['#guru/pengumuman'], icon: iconMegaphone },
          { label: 'Pesan', href: '#chat', routes: ['#chat', '#chat/room'], icon: iconChat },
          ...(isWaliKelas ? [{ label: 'Wali Kelas', href: '#guru/wali-kelas', routes: ['#guru/wali-kelas'], icon: iconClassroom }] : []),
          { label: 'Akun', href: '#guru/pengatur-sistem', routes: ['#guru/pengatur-sistem'], icon: iconSettings },
        ]
      : isSiswa
        ? [
            { label: 'Dashboard', href: '#siswa/dashboard', routes: ['#siswa/dashboard'], icon: iconHome },
            { label: 'Nilai', href: '#siswa/nilai', routes: ['#siswa/nilai'], icon: iconChart },
            { label: 'Absensi', href: '#siswa/absensi', routes: ['#siswa/absensi'], icon: iconCalendar },
            { label: 'Materi', href: '#siswa/materi', routes: ['#siswa/materi'], icon: iconBookSpark },
            { label: 'Kas Kelas', href: '#siswa/kas-kelas', routes: ['#siswa/kas-kelas'], icon: iconWallet },
            { label: 'Game Center', href: '#siswa/game', routes: ['#siswa/game'], icon: iconGame },
            { label: 'Kuiz', href: '#siswa/kuiz', routes: ['#siswa/kuiz'], icon: iconBookSpark },
            { label: 'Woro-woro', href: '#siswa/pengumuman', routes: ['#siswa/pengumuman'], icon: iconMegaphone },
            { label: 'Pesan', href: '#chat', routes: ['#chat', '#chat/room'], icon: iconChat },
            { label: 'Akun', href: '#siswa/pengatur-sistem', routes: ['#siswa/pengatur-sistem'], icon: iconSettings },
          ]
        : [];

  const navItems = desktopNavItems
    .map((item) => {
      const active = isRouteActive(item.routes);
      return `
        <a href="${item.href}" class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${active ? 'bg-indigo-50 text-[#4F46E5]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}">
          ${item.icon(active)}
          <span>${item.label}</span>
        </a>
      `;
    })
    .join('');

  const mobilePrimaryNav = isAdmin
    ? desktopNavItems
        .map((item) => {
          const active = isRouteActive(item.routes);
          return `
            <a href="${item.href}" class="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? 'bg-indigo-50 text-[#4F46E5]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              ${item.icon(active)}
              <span>${item.label}</span>
            </a>
          `;
        })
        .join('')
    : '';

  return `
    <style>
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-20px); }
      }
      .float-animation {
        animation: float 6s ease-in-out infinite;
      }
      .safe-bottom-spacing {
        padding-bottom: calc(8.5rem + env(safe-area-inset-bottom));
      }
      .mobile-bottom-nav {
        transform: translateX(-50%);
      }
      .nav-bottom {
        --nav-primary: #4F46E5;
        --nav-primary-container: #EEF2FF;
        --nav-inactive: #64748B;
      }
      @keyframes navPillIn {
        0% { transform: scale(0.5); opacity: 0; }
        60% { transform: scale(1.08); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes navIconIn {
        0% { transform: translateY(3px) scale(0.8); opacity: 0.4; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }
      @keyframes navLabelIn {
        0% { transform: translateY(5px); opacity: 0; }
        100% { transform: translateY(0); opacity: 1; }
      }
      .nav-pill-active { animation: navPillIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
      .nav-icon-active { animation: navIconIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      .nav-label-active { animation: navLabelIn 0.3s ease-out both; }
    </style>

    <div class="min-h-screen bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#0EA5E9] p-4 sm:p-6 relative overflow-hidden">
      <!-- Decorative animated elements -->
      <div class="absolute top-20 right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl float-animation"></div>
      <div class="absolute bottom-20 left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 2s;"></div>
      <div class="absolute top-1/2 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 4s;"></div>

      <div class="mx-auto flex max-w-6xl flex-col gap-4 relative z-10 ${(isGuru || isSiswa) ? 'safe-bottom-spacing md:pb-0' : ''}">
        <header class="relative overflow-hidden rounded-[24px] border border-white/60 bg-white/85 p-3 shadow-[0_10px_34px_-12px_rgba(15,23,42,0.22)] ring-1 ring-white/70 backdrop-blur-xl sm:rounded-[28px] sm:p-4">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br ${accentPanel} opacity-[0.14]"></div>
          <div class="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-gradient-to-br ${accentPanel} opacity-20 blur-2xl"></div>
          <div class="relative flex flex-col gap-2.5 pr-24 sm:pr-32">
            ${showHeaderClock ? `
              <div class="absolute right-0 top-0 flex flex-col items-end text-right">
                <p id="dashboard-clock" class="text-lg font-extrabold leading-none text-slate-900 sm:text-xl">--:--:--</p>
                <p id="dashboard-date" class="mt-1 text-[10px] text-slate-500 sm:text-[11px]">Memuat tanggal...</p>
              </div>
            ` : ''}
          ${(showHeaderClock || isAdmin) ? `
            <div class="absolute bottom-0 right-0 flex items-center gap-2">
              <a href="#chat" class="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-[#25D366] hover:text-[#25D366] sm:h-10 sm:w-10" aria-label="Pesan" title="Pesan">
                <svg viewBox="0 0 24 24" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z"/></svg>
              </a>
              <button id="logout-btn" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 sm:h-10 sm:w-10" aria-label="Keluar" title="Keluar">
                <svg viewBox="0 0 24 24" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10"/><path d="m17 8 4 4-4 4"/></svg>
              </button>
            </div>
          ` : ''}
            <div class="flex items-center gap-3">
              <div class="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accentPanel} text-white shadow-lg sm:flex">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z"/></svg>
              </div>
              <div class="min-w-0">
                <p class="text-xs text-slate-500 sm:text-sm">SIM SMANSARI</p>
                <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">${title}</h2>
                ${activePeriod ? `<p class="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700/90 sm:text-[11px]"><span class="text-amber-600">TP</span> <span class="text-amber-500/80">•</span> ${activePeriod}</p>` : ''}
              </div>
            </div>
            <div class="inline-flex w-auto max-w-[calc(100%-4.5rem)] items-center gap-2 self-start rounded-[18px] border border-slate-200/70 bg-slate-50/80 px-2.5 py-2 sm:max-w-xs sm:gap-3 sm:rounded-[22px] sm:px-3 sm:py-2.5">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${accentPanel} text-xs font-semibold text-white shadow ring-2 ring-white sm:h-9 sm:w-9 sm:text-sm">${userName.charAt(0)}</div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-slate-800">${userName}</p>
                  <p class="text-[11px] text-slate-500 sm:text-xs">Akses ${role}</p>
                </div>
            </div>
          </div>
        </header>

        <nav class="hidden md:flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          ${navItems}
        </nav>

        ${isAdmin ? `
          <nav class="md:hidden overflow-x-auto rounded-[20px] border border-slate-200 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div class="flex w-max items-center gap-2 pr-1">
              ${mobilePrimaryNav}
            </div>
          </nav>
        ` : ''}

        <main class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6">
          ${content}
        </main>

        ${isGuru || isSiswa ? `
          <a href="#chat" class="md:hidden fixed bottom-24 right-4 z-[55] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-4 ring-white/50 transition hover:scale-105 active:scale-95" aria-label="Pesan" title="Pesan">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z"/></svg>
          </a>
          <nav class="mobile-bottom-nav nav-bottom md:hidden fixed left-1/2 bottom-4 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-black/5 bg-white/70 px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md" style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));">
            <div class="flex items-center justify-between gap-1">
              ${isGuru ? guruBottomNav : siswaBottomNav}
            </div>
          </nav>
        ` : ''}
      </div>
    </div>
  `;
}

export function initHeaderClock(container) {
  if (!container) {
    return;
  }

  const clockEl = container.querySelector('#dashboard-clock');
  const dateEl = container.querySelector('#dashboard-date');

  if (container.headerClockInterval) {
    clearInterval(container.headerClockInterval);
    container.headerClockInterval = null;
  }

  if (!clockEl || !dateEl) {
    return;
  }

  const updateClock = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dateEl.textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  updateClock();
  container.headerClockInterval = setInterval(updateClock, 1000);
}
