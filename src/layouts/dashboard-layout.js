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
  let firestoreReadStatus = null;
  try {
    firestoreReadStatus = JSON.parse(localStorage.getItem('simguru_firestore_read_status') || 'null');
  } catch {
    firestoreReadStatus = null;
  }
  const showReadQuotaBanner = firestoreReadStatus?.state === 'exhausted';
  const readQuotaTime = showReadQuotaBanner && firestoreReadStatus?.detected_at
    ? new Date(firestoreReadStatus.detected_at).toLocaleString('id-ID')
    : '';
  const headerClockRoutes = [
    '#guru/dashboard',
    '#guru/input-absen',
    '#guru/keaktifan',
    '#guru/jurnal',
    '#guru/input-nilai',
    '#guru/penilaian',
    '#guru/materi',
    '#guru/materi-ai',
    '#guru/materi-import',
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
  const headerRightPadding = showHeaderClock && showReadQuotaBanner
    ? 'pr-56 sm:pr-72'
    : 'pr-24 sm:pr-32';

  const accentPanel = opts?.accentPanel || 'from-emerald-500 via-cyan-500 to-sky-500';

  const isRouteActive = (routes) => routes.some((route) => currentHash === route || currentHash.startsWith(`${route}/`));
  const activeNavIconClass = '';
  const inactiveNavIconClass = '';

  const iconWallet = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
    {
      label: 'Absen',
      href: '#guru/input-absen',
      routes: ['#guru/input-absen'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `,
    },
    {
      label: 'Keaktifan',
      href: '#guru/keaktifan',
      routes: ['#guru/keaktifan'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.5 12h4l2.2-5.5 4.1 11 2.2-5.5h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
    {
      label: 'Nilai',
      href: '#guru/penilaian',
      routes: ['#guru/penilaian', '#guru/input-nilai'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="5" cy="19" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="6" r="1.2" fill="currentColor"/>
          <circle cx="19" cy="13" r="1.2" fill="currentColor"/>
        </svg>
      `,
    },
    {
      label: 'Materi',
      href: '#guru/materi',
      routes: ['#guru/materi'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `,
    },
    {
      label: 'Akun',
      href: '#guru/pengatur-sistem',
      routes: ['#guru/pengatur-sistem'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <a href="${item.href}" class="mb-nav-item ${active ? 'is-active' : ''}" aria-current="${active ? 'page' : 'false'}">
          <span class="mb-nav-icon">${item.icon(active)}</span>
          <span class="mb-nav-label">${item.label}</span>
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
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
    },
    {
      label: 'Nilai',
      href: '#siswa/nilai',
      routes: ['#siswa/nilai'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[var(--color-primary)]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <a href="${item.href}" class="mb-nav-item ${active ? 'is-active' : ''}" aria-current="${active ? 'page' : 'false'}">
          <span class="mb-nav-icon">${item.icon(active)}</span>
          <span class="mb-nav-label">${item.label}</span>
        </a>
      `;
    })
    .join('');

  const iconHome = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const iconCalendar = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconChart = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="5" cy="19" r="1.2" fill="currentColor"/>
      <circle cx="12" cy="6" r="1.2" fill="currentColor"/>
      <circle cx="19" cy="13" r="1.2" fill="currentColor"/>
    </svg>
  `;

  const iconBook = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconUser = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M5 19a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconSettings = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const iconClassroom = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5" width="17" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconLink = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 14l4-4M8.5 16.5l-2 2a3 3 0 1 1-4.2-4.2l2-2M15.5 7.5l2-2a3 3 0 0 1 4.2 4.2l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconMegaphone = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 11l14-7v16L3 13z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M3 11v2a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M19 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconChat = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;

  const iconGame = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="8" width="18" height="8" rx="4" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const iconSparkle = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.7L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M18.5 15l.9 2.3 2.4.9-2.4.9-.9 2.3-.9-2.3-2.4-.9 2.4-.9.9-2.3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    </svg>
  `;

  const iconBackup = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 15V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const iconBookSpark = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? activeNavIconClass : inactiveNavIconClass}" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        { label: 'Pengaturan AI', href: '#admin/pengaturan-ai', routes: ['#admin/pengaturan-ai', '#admin/pengatur-sistem'], icon: iconSparkle },
        { label: 'Backup', href: '#admin/pengaturan-backup', routes: ['#admin/pengaturan-backup'], icon: iconBackup },
        { label: 'Akun', href: '#admin/akun', routes: ['#admin/akun'], icon: iconSettings },
      ]
    : isGuru
      ? [
          { label: 'Dashboard', href: '#guru/dashboard', routes: ['#guru/dashboard'], icon: iconHome },
          { label: 'Input Absensi', href: '#guru/input-absen', routes: ['#guru/input-absen'], icon: iconCalendar },
          { label: 'Jurnal', href: '#guru/jurnal', routes: ['#guru/jurnal'], icon: iconBookSpark },
          { label: 'Keaktifan', href: '#guru/keaktifan', routes: ['#guru/keaktifan'], icon: iconChart },
          { label: 'Input Nilai', href: '#guru/penilaian', routes: ['#guru/penilaian', '#guru/input-nilai'], icon: iconChart },
          { label: 'Materi', href: '#guru/materi', routes: ['#guru/materi', '#guru/materi-ai', '#guru/materi-import'], icon: iconBookSpark },
          { label: 'Game Center', href: '#guru/game', routes: ['#guru/game'], icon: iconGame },
          { label: 'Ujian', href: '#guru/kuiz', routes: ['#guru/kuiz'], icon: iconBookSpark },
          { label: 'Pembayaran', href: '#guru/pembayaran-buku', routes: ['#guru/pembayaran-buku'], icon: iconWallet },
          { label: 'Pengumuman', href: '#guru/pengumuman', routes: ['#guru/pengumuman'], icon: iconMegaphone },
          { label: 'Pesan', href: '#chat', routes: ['#chat', '#chat/room'], icon: iconChat },
          ...(isWaliKelas ? [{ label: 'Wali Kelas', href: '#guru/wali-kelas', routes: ['#guru/wali-kelas'], icon: iconClassroom }] : []),
          { label: 'Relasi Mengajar', href: '#guru/plotting-jadwal', routes: ['#guru/plotting-jadwal'], icon: iconLink },
          { label: 'Backup Data', href: '#guru/backup', routes: ['#guru/backup'], icon: iconBackup },
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
            { label: 'Ujian', href: '#siswa/kuiz', routes: ['#siswa/kuiz'], icon: iconBookSpark },
            { label: 'Woro-woro', href: '#siswa/pengumuman', routes: ['#siswa/pengumuman'], icon: iconMegaphone },
            { label: 'Pesan', href: '#chat', routes: ['#chat', '#chat/room'], icon: iconChat },
            { label: 'Akun', href: '#siswa/pengatur-sistem', routes: ['#siswa/pengatur-sistem'], icon: iconSettings },
          ]
        : [];

  const navItems = desktopNavItems
    .map((item) => {
      const active = isRouteActive(item.routes);
      return `
        <a href="${item.href}" class="sidebar-item ${active ? 'is-active' : ''}" aria-current="${active ? 'page' : 'false'}">
          <span class="sidebar-item-icon">${item.icon(active)}</span>
          <span class="sidebar-item-label">${item.label}</span>
        </a>
      `;
    })
    .join('');

  const mobilePrimaryNav = isAdmin
    ? desktopNavItems
        .map((item) => {
          const active = isRouteActive(item.routes);
          return `
            <a href="${item.href}" class="inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? 'bg-[var(--color-primary-container)] text-[var(--color-primary)]' : 'text-slate-600 hover:bg-slate-100'}">
              <span class="inline-flex h-6 w-6 items-center justify-center">${item.icon(active)}</span>
              <span>${item.label}</span>
            </a>
          `;
        })
        .join('')
    : '';

  return `
    <style>
      .app-shell { display:flex; min-height:100vh; background: var(--color-background); }
      .app-sidebar {
        position: fixed; top:.75rem; bottom:.75rem; left:.75rem; width:15.25rem; z-index:40;
        display:flex; flex-direction:column;
        overflow:hidden; border-radius:1.75rem;
        background:radial-gradient(circle at 12% 0%,rgba(45,212,191,.24),transparent 30%),linear-gradient(165deg,#0f766e 0%,#0e7490 52%,#075985 100%);
        border:1px solid rgba(255,255,255,.2);
        color: #ccfbf1;
        box-shadow:0 28px 60px -32px rgba(2,44,54,.9),inset 0 1px 0 rgba(255,255,255,.2);
        -webkit-backdrop-filter:blur(22px); backdrop-filter:blur(22px);
      }
      .app-main { flex:1; min-width:0; margin-left:16.75rem; display:flex; flex-direction:column; transition:margin-left .25s var(--ease-in-out); }
      .app-sidebar { transition: transform .25s var(--ease-in-out); }
      .sidebar-backdrop { display:none; }

      /* Desktop: collapse */
      @media (min-width:1024px){
        .app-shell.is-collapsed .app-sidebar { transform: translateX(-100%); }
        .app-shell.is-collapsed .app-main { margin-left:0; }
      }
      /* Mobile: drawer overlay */
      @media (max-width:1023px){
        .app-sidebar { top:.65rem; bottom:.65rem; left:.65rem; transform:translateX(calc(-100% - 1rem)); z-index:60; }
        .app-shell.is-open .app-sidebar { transform: translateX(0); }
        .app-main { margin-left:0; }
        .sidebar-backdrop { display:block; position:fixed; inset:0; z-index:55; background:rgba(15,23,42,.38); opacity:0; pointer-events:none; transition:opacity .25s var(--ease-in-out); -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px); }
        .app-shell.is-open .sidebar-backdrop { opacity:1; pointer-events:auto; }
      }

      .sidebar-brand { display:flex; align-items:center; gap:.7rem; margin:.65rem; padding:.72rem; border:1px solid rgba(255,255,255,.13); border-radius:1.2rem; background:rgba(255,255,255,.08); box-shadow:inset 0 1px 0 rgba(255,255,255,.1); }
      .sidebar-brand-mark { display:flex; height:2.5rem; width:2.5rem; align-items:center; justify-content:center; border-radius:.85rem; background:linear-gradient(145deg,#99f6e4,#22d3ee); color:#0f766e; flex:none; box-shadow:0 10px 20px -10px rgba(34,211,238,.85),inset 0 1px 1px rgba(255,255,255,.8); }
      .sidebar-nav { flex:1; overflow-y:auto; padding:.3rem .65rem .65rem; display:flex; flex-direction:column; gap:.2rem; }
      .sidebar-nav::-webkit-scrollbar{ width:5px; }
      .sidebar-nav::-webkit-scrollbar-thumb{ background:rgba(204,251,241,0.25); border-radius:999px; }
      .sidebar-item { display:flex; align-items:center; gap:.65rem; padding:.42rem .52rem; border:1px solid transparent; border-radius:1rem; font-size:.8rem; font-weight:550; color:#ccfbf1; transition:transform .15s var(--ease-out),background .15s var(--ease-out),color .15s var(--ease-out),border-color .15s var(--ease-out); }
      .sidebar-item:hover { transform:translateX(2px); background:rgba(255,255,255,.09); color:#fff; }
      .sidebar-item.is-active { background:rgba(255,255,255,.94); border-color:rgba(255,255,255,.72); color:#0f766e; font-weight:750; box-shadow:0 12px 22px -15px rgba(2,44,54,.75),inset 0 1px 0 #fff; }
      .sidebar-item-icon { display:inline-flex; height:2rem; width:2rem; align-items:center; justify-content:center; flex:none; border-radius:.68rem; background:rgba(255,255,255,.1); box-shadow:inset 0 1px 0 rgba(255,255,255,.08); }
      .sidebar-item.is-active .sidebar-item-icon { background:linear-gradient(145deg,#ccfbf1,#a5f3fc); color:#0f766e; box-shadow:0 5px 10px -7px rgba(13,148,136,.65),inset 0 1px 0 #fff; }
      .sidebar-foot { margin:.2rem .65rem .65rem; padding:.72rem; border:1px solid rgba(255,255,255,.13); border-radius:1.2rem; background:rgba(255,255,255,.08); }
      .sidebar-foot .role-dot { display:inline-flex; height:.5rem; width:.5rem; border-radius:999px; background:#34d399; box-shadow:0 0 0 3px rgba(52,211,153,0.25); }

      .topbar { position:sticky; top:.75rem; z-index:30; display:flex; align-items:center; justify-content:space-between; gap:.75rem; margin:.75rem 1rem 0; padding:.58rem .7rem; border:1px solid rgba(203,213,225,.75); border-radius:1.3rem; background:rgba(255,255,255,.82); color:#0f172a; box-shadow:0 16px 38px -28px rgba(15,23,42,.65),inset 0 1px 0 rgba(255,255,255,.95); -webkit-backdrop-filter:blur(22px) saturate(1.35); backdrop-filter:blur(22px) saturate(1.35); }
      @media (max-width:1023px){ .topbar{ top:.5rem; margin:.5rem .65rem 0; padding:.5rem .58rem; border-radius:1.15rem; } }
      .topbar-icon-btn { display:inline-flex; height:2.45rem; width:2.45rem; align-items:center; justify-content:center; border-radius:.82rem; border:1px solid rgba(203,213,225,.75); background:linear-gradient(145deg,#fff,#f1f5f9); color:#475569; box-shadow:0 7px 14px -11px rgba(15,23,42,.7),inset 0 1px 0 #fff; transition:transform .15s var(--ease-out),background .15s var(--ease-out),color .15s var(--ease-out),border-color .15s var(--ease-out); }
      .topbar-icon-btn:hover { transform:translateY(-1px); background:#fff; color:#0f766e; border-color:#99f6e4; }
      .topbar-title { color:#0f172a; font-weight:750; letter-spacing:-.02em; }
      .topbar-subtitle { color:#64748b; }
      .topbar-clock { border:1px solid rgba(203,213,225,.7); border-radius:.85rem; background:rgba(248,250,252,.82); padding:.4rem .65rem; color:#0f172a; box-shadow:inset 0 1px 0 #fff; }

      .content { width:100%; max-width:var(--container-max); margin:0 auto; padding:1.5rem; flex:1; }
      @media (max-width:767px){ .content{ padding:1rem; padding-bottom:calc(5.5rem + env(safe-area-inset-bottom)); } }

      .admin-mobile-nav { display:flex; gap:.5rem; overflow-x:auto; padding:.5rem 1rem; border-bottom:1px solid var(--color-border); background:var(--color-surface); scrollbar-width:none; }
      .admin-mobile-nav::-webkit-scrollbar{ display:none; }

      .mb-nav { position:fixed; inset-inline:0; bottom:0; z-index:50; border-top:1px solid var(--color-border); background:rgba(255,255,255,.96); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); padding-bottom:env(safe-area-inset-bottom); }
      .mb-nav-inner { display:flex; max-width:30rem; margin-inline:auto; align-items:stretch; justify-content:space-between; }
      .mb-nav-item { flex:1; display:flex; flex-direction:column; align-items:center; gap:.1875rem; padding:.5rem .25rem; min-height:3.5rem; color:var(--nav-inactive); transition:color .15s var(--ease-out); }
      .mb-nav-item.is-active { color:var(--nav-primary); }
      .mb-nav-icon { display:inline-flex; height:1.5rem; width:1.5rem; align-items:center; justify-content:center; }
      .mb-nav-label { font-size:.625rem; font-weight:500; line-height:1; }

      .chat-fab { position:fixed; right:1rem; bottom:5rem; z-index:55; display:inline-flex; height:3.5rem; width:3.5rem; align-items:center; justify-content:center; border-radius:9999px; background:linear-gradient(135deg, #0d9488, #0891b2); color:#fff; box-shadow:var(--shadow-lg); transition:transform .15s var(--ease-out); }
      .chat-fab:hover { transform:scale(1.05); }
      .chat-fab:active { transform:scale(.95); }
      @media (min-width:1024px){ .chat-fab{ display:none; } }
    </style>

    <div class="app-shell">
      <aside class="app-sidebar" id="app-sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-mark">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5L12 4l8.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4.5v-5h-5v5H5a1.5 1.5 0 0 1-1.5-1.5v-8z"/></svg>
          </span>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-white leading-tight">SIM SMANSARI</p>
            <p class="text-[11px] text-teal-200/70 leading-tight truncate">${title}</p>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Navigasi utama">
          ${navItems}
        </nav>
        <div class="sidebar-foot">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm">${userName.charAt(0)}</div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-white">${userName}</p>
              <p class="text-[11px] capitalize text-teal-100/80"><span class="role-dot mr-1.5 align-middle"></span>Akses ${role}</p>
            </div>
          </div>
          ${activePeriod ? `<p class="mt-2 truncate text-[11px] font-medium text-teal-100/60">${activePeriod}</p>` : ''}
        </div>
      </aside>
      <div id="sidebar-backdrop" class="sidebar-backdrop" aria-hidden="true"></div>

      <div class="app-main">
        <header class="topbar">
          <button id="sidebar-toggle" type="button" class="topbar-icon-btn shrink-0" aria-label="Tampilkan menu" aria-expanded="false" aria-controls="app-sidebar">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div class="min-w-0">
              <h1 class="topbar-title truncate text-base sm:text-lg">${title}</h1>
              ${activePeriod ? `<p class="topbar-subtitle truncate text-[11px]">${activePeriod}</p>` : ''}
          </div>
          <div class="flex items-center gap-2">
            ${showHeaderClock ? `
              <div class="topbar-clock text-right">
                <p id="dashboard-clock" class="text-sm font-semibold leading-none">--:--:--</p>
                <p id="dashboard-date" class="mt-0.5 hidden text-[11px] text-slate-500 sm:block">Memuat tanggal...</p>
              </div>
            ` : ''}
            ${showReadQuotaBanner ? `
              <span class="hidden items-center gap-1 rounded-lg border border-white/25 bg-white/15 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm sm:inline-flex" title="Read quota habis${readQuotaTime ? ' · ' + readQuotaTime : ''}">
                <span class="h-1.5 w-1.5 rounded-full bg-rose-300"></span>Quota
              </span>
            ` : ''}
            ${(isGuru || isSiswa) ? `
              <a href="#chat" class="topbar-icon-btn hidden lg:inline-flex" aria-label="Pesan" title="Pesan">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z"/></svg>
              </a>
            ` : ''}
            <button id="logout-btn" type="button" class="topbar-icon-btn" aria-label="Keluar" title="Keluar">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h10"/><path d="m17 8 4 4-4 4"/></svg>
            </button>
          </div>
        </header>

        ${isAdmin ? `
          <nav class="admin-mobile-nav lg:hidden" aria-label="Navigasi admin">
            ${mobilePrimaryNav}
          </nav>
        ` : ''}

        <main class="content">
          ${content}
        </main>
      </div>

      ${isGuru || isSiswa ? `
        <a href="#chat" class="chat-fab lg:hidden" aria-label="Pesan" title="Pesan">
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.5-.6L3 21l1.3-4A8.4 8.4 0 1 1 21 11.5z"/></svg>
        </a>
        <nav class="mb-nav lg:hidden" aria-label="Navigasi bawah" style="--nav-primary:var(--color-primary);--nav-primary-container:var(--color-primary-container);--nav-inactive:#64748B;">
          <div class="mb-nav-inner">
            ${isGuru ? guruBottomNav : siswaBottomNav}
          </div>
        </nav>
      ` : ''}
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

export function initSidebarToggle(container) {
  if (!container) return;
  const shell = container.querySelector('.app-shell');
  const toggles = container.querySelectorAll('[data-sidebar-toggle], #sidebar-toggle');
  const backdrop = container.querySelector('#sidebar-backdrop');
  if (!shell || !toggles.length) return;

  const mq = window.matchMedia('(min-width: 1024px)');

  // Restore desktop collapse state
  try {
    if (mq.matches && localStorage.getItem('sim_sidebar_collapsed') === '1') {
      shell.classList.add('is-collapsed');
    }
  } catch {}

  const isOpen = () => shell.classList.contains('is-open');
  const isCollapsed = () => shell.classList.contains('is-collapsed');

  const syncAria = () => {
    const expanded = mq.matches ? !isCollapsed() : isOpen();
    toggles.forEach((t) => {
      t.setAttribute('aria-expanded', String(expanded));
      t.setAttribute('aria-label', expanded ? 'Sembunyikan menu' : 'Tampilkan menu');
    });
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      if (mq.matches) {
        const willCollapse = !isCollapsed();
        shell.classList.toggle('is-collapsed', willCollapse);
        shell.classList.remove('is-open');
        try { localStorage.setItem('sim_sidebar_collapsed', willCollapse ? '1' : '0'); } catch {}
      } else {
        shell.classList.toggle('is-open');
        shell.classList.remove('is-collapsed');
      }
      syncAria();
    });
  });

  backdrop?.addEventListener('click', () => {
    shell.classList.remove('is-open');
    syncAria();
  });

  // Close mobile drawer on nav click
  shell.querySelectorAll('.sidebar-item').forEach((a) => {
    a.addEventListener('click', () => {
      if (!mq.matches) {
        shell.classList.remove('is-open');
        syncAria();
      }
    });
  });

  // Reset on resize across breakpoint
  mq.addEventListener('change', () => {
    shell.classList.remove('is-open');
    syncAria();
  });

  syncAria();
}
