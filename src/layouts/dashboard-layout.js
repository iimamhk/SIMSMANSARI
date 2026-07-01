export function renderLayout(title, content) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Pengguna';
  const role = session?.user?.role || 'guest';
  const isAdmin = role === 'admin';
  const isGuru = role === 'guru';
  const isSiswa = role === 'siswa';
  const currentHash = typeof window !== 'undefined' ? (window.location.hash || '') : '';

  const isRouteActive = (routes) => routes.includes(currentHash);
  const activeItemClass = 'text-[#4F46E5]';
  const inactiveItemClass = 'text-slate-500';

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
      label: 'Absensi',
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
      label: 'Game',
      href: '#guru/game',
      routes: ['#guru/game'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="8" width="18" height="8" rx="4" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
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
        <a href="${item.href}" class="flex min-w-[78px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition ${active ? activeItemClass : inactiveItemClass} hover:bg-slate-50">
          <span class="transition">${item.icon(active)}</span>
          <span>${item.label}</span>
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
      label: 'Game',
      href: '#siswa/game',
      routes: ['#siswa/game'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="8" width="18" height="8" rx="4" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
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
        <a href="${item.href}" class="flex min-w-[92px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition ${active ? activeItemClass : inactiveItemClass} hover:bg-slate-50">
          <span class="transition">${item.icon(active)}</span>
          <span>${item.label}</span>
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

  const iconGame = (active) => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="8" width="18" height="8" rx="4" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  const desktopNavItems = isAdmin
    ? [
        { label: 'Dashboard', href: '#admin/dashboard', routes: ['#admin/dashboard'], icon: iconHome },
        { label: 'Tahun Ajaran', href: '#admin/master-tahun-ajaran', routes: ['#admin/master-tahun-ajaran'], icon: iconCalendar },
        { label: 'Akademik', href: '#admin/master-akademik', routes: ['#admin/master-akademik'], icon: iconBook },
        { label: 'Guru', href: '#admin/master-guru', routes: ['#admin/master-guru'], icon: iconUser },
        { label: 'Siswa', href: '#admin/master-siswa', routes: ['#admin/master-siswa'], icon: iconUser },
        { label: 'Mapping', href: '#admin/plotting-jadwal', routes: ['#admin/plotting-jadwal'], icon: iconLink },
        { label: 'Pembelajaran', href: '#admin/master-pembelajaran', routes: ['#admin/master-pembelajaran'], icon: iconClassroom },
        { label: 'Akun', href: '#admin/pengatur-sistem', routes: ['#admin/pengatur-sistem'], icon: iconSettings },
      ]
    : isGuru
      ? [
          { label: 'Dashboard', href: '#guru/dashboard', routes: ['#guru/dashboard'], icon: iconHome },
          { label: 'Input Absensi', href: '#guru/input-absen', routes: ['#guru/input-absen'], icon: iconCalendar },
          { label: 'Input Nilai', href: '#guru/penilaian', routes: ['#guru/penilaian', '#guru/input-nilai'], icon: iconChart },
          { label: 'Game', href: '#guru/game', routes: ['#guru/game'], icon: iconGame },
          { label: 'Akun', href: '#guru/pengatur-sistem', routes: ['#guru/pengatur-sistem'], icon: iconSettings },
        ]
      : isSiswa
        ? [
            { label: 'Dashboard', href: '#siswa/dashboard', routes: ['#siswa/dashboard'], icon: iconHome },
            { label: 'Nilai', href: '#siswa/nilai', routes: ['#siswa/nilai'], icon: iconChart },
            { label: 'Absensi', href: '#siswa/absensi', routes: ['#siswa/absensi'], icon: iconCalendar },
            { label: 'Game', href: '#siswa/game', routes: ['#siswa/game'], icon: iconGame },
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

  const adminMobileNav = isAdmin
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
        padding-bottom: calc(6.5rem + env(safe-area-inset-bottom));
      }
    </style>

    <div class="min-h-screen bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#0EA5E9] p-4 sm:p-6 relative overflow-hidden">
      <!-- Decorative animated elements -->
      <div class="absolute top-20 right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl float-animation"></div>
      <div class="absolute bottom-20 left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 2s;"></div>
      <div class="absolute top-1/2 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 4s;"></div>

      <div class="mx-auto flex max-w-6xl flex-col gap-4 relative z-10 ${(isGuru || isSiswa) ? 'safe-bottom-spacing md:pb-0' : ''}">
        <header class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm text-slate-500">SIM SMANSARI</p>
              <h2 class="text-xl font-semibold text-slate-900">${title}</h2>
            </div>
            <div class="flex items-center gap-2">
              <button id="logout-btn" class="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 sm:px-4 sm:text-sm">Keluar</button>
              <div class="flex items-center gap-3 rounded-full bg-slate-50 px-3 py-2">
              <div class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-sm font-semibold text-white">${userName.charAt(0)}</div>
              <div>
                <p class="text-sm font-medium text-slate-800">${userName}</p>
                <p class="text-xs text-slate-500">Akses ${role}</p>
              </div>
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
              ${adminMobileNav}
            </div>
          </nav>
        ` : ''}

        <main class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6">
          ${content}
        </main>

        ${isGuru || isSiswa ? `
          <nav class="md:hidden fixed bottom-3 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-[26px] border border-slate-200 bg-white/95 px-2 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur supports-[backdrop-filter]:bg-white/80" style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));">
            <div class="flex items-center justify-center ${(isGuru || isSiswa) ? 'justify-between' : ''}">
              ${isGuru ? guruBottomNav : siswaBottomNav}
            </div>
          </nav>
        ` : ''}
      </div>
    </div>
  `;
}
