export function renderLayout(title, content) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const userName = session?.user?.nama || 'Pengguna';
  const role = session?.user?.role || 'guest';
  const isAdmin = role === 'admin';
  const isGuru = role === 'guru';
  const isSiswa = role === 'siswa';
  const currentHash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
  const activePeriod = context?.tahun_ajaran_aktif_nama && context?.semester_aktif_nama
    ? `${context.tahun_ajaran_aktif_nama} / ${context.semester_aktif_nama}`
    : '';

  const isRouteActive = (routes) => routes.some((route) => currentHash === route || currentHash.startsWith(`${route}/`));
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
      label: 'Game Center',
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
      label: 'Kuiz',
      href: '#guru/kuiz',
      routes: ['#guru/kuiz'],
      icon: (active) => `
        <svg viewBox="0 0 24 24" class="h-6 w-6 ${active ? 'text-[#4F46E5]' : 'text-slate-500'}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.8"/>
          <path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
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
        <a href="${item.href}" class="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2.5 text-[11px] font-semibold transition ${active ? activeItemClass : inactiveItemClass} hover:bg-slate-50 sm:px-3 sm:text-xs">
          <span class="flex h-7 w-7 items-center justify-center transition">${item.icon(active)}</span>
          <span class="w-full text-center leading-tight break-words">${item.label}</span>
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
        <a href="${item.href}" class="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2.5 text-[11px] font-semibold transition ${active ? activeItemClass : inactiveItemClass} hover:bg-slate-50 sm:px-3 sm:text-xs">
          <span class="flex h-7 w-7 items-center justify-center transition">${item.icon(active)}</span>
          <span class="w-full text-center leading-tight break-words">${item.label}</span>
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
        { label: 'Akun', href: '#admin/pengatur-sistem', routes: ['#admin/pengatur-sistem'], icon: iconSettings },
      ]
    : isGuru
      ? [
          { label: 'Dashboard', href: '#guru/dashboard', routes: ['#guru/dashboard'], icon: iconHome },
          { label: 'Input Absensi', href: '#guru/input-absen', routes: ['#guru/input-absen'], icon: iconCalendar },
          { label: 'Input Nilai', href: '#guru/penilaian', routes: ['#guru/penilaian', '#guru/input-nilai'], icon: iconChart },
          { label: 'Materi', href: '#guru/materi', routes: ['#guru/materi'], icon: iconBookSpark },
          { label: 'Game Center', href: '#guru/game', routes: ['#guru/game'], icon: iconGame },
          { label: 'Kuiz', href: '#guru/kuiz', routes: ['#guru/kuiz'], icon: iconBookSpark },
          { label: 'Akun', href: '#guru/pengatur-sistem', routes: ['#guru/pengatur-sistem'], icon: iconSettings },
        ]
      : isSiswa
        ? [
            { label: 'Dashboard', href: '#siswa/dashboard', routes: ['#siswa/dashboard'], icon: iconHome },
            { label: 'Nilai', href: '#siswa/nilai', routes: ['#siswa/nilai'], icon: iconChart },
            { label: 'Absensi', href: '#siswa/absensi', routes: ['#siswa/absensi'], icon: iconCalendar },
            { label: 'Materi', href: '#siswa/materi', routes: ['#siswa/materi'], icon: iconBookSpark },
            { label: 'Game Center', href: '#siswa/game', routes: ['#siswa/game'], icon: iconGame },
            { label: 'Kuiz', href: '#siswa/kuiz', routes: ['#siswa/kuiz'], icon: iconBookSpark },
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
      @media (max-width: 767px) {
        .mobile-bottom-nav {
          width: calc((100vw - 2rem) / var(--mobile-bottom-nav-scale, 1));
          max-width: none;
          transform: translateX(-50%) scale(var(--mobile-bottom-nav-scale, 1));
          transform-origin: bottom center;
          bottom: calc(0.75rem + env(safe-area-inset-bottom));
        }
      }
    </style>

    <div class="min-h-screen bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#0EA5E9] p-4 sm:p-6 relative overflow-hidden">
      <!-- Decorative animated elements -->
      <div class="absolute top-20 right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl float-animation"></div>
      <div class="absolute bottom-20 left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 2s;"></div>
      <div class="absolute top-1/2 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 4s;"></div>

      <div class="mx-auto flex max-w-6xl flex-col gap-4 relative z-10 ${(isGuru || isSiswa) ? 'safe-bottom-spacing md:pb-0' : ''}">
        <header class="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:rounded-[28px] sm:p-4">
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <div>
              <p class="text-xs text-slate-500 sm:text-sm">SIM SMANSARI</p>
              <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">${title}</h2>
              ${activePeriod ? `<p class="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400/90 sm:text-[11px]"><span class="text-slate-300">Periode aktif</span> <span class="text-slate-400">•</span> ${activePeriod}</p>` : ''}
            </div>
            <div class="flex items-center">
              <div class="flex w-full items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50 px-2.5 py-2 sm:w-auto sm:gap-3 sm:rounded-[22px] sm:px-3 sm:py-2.5">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs font-semibold text-white sm:h-9 sm:w-9 sm:text-sm">${userName.charAt(0)}</div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-slate-800">${userName}</p>
                  <p class="text-[11px] text-slate-500 sm:text-xs">Akses ${role}</p>
                </div>
                <button id="logout-btn" class="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm">Keluar</button>
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
          <nav class="mobile-bottom-nav md:hidden fixed left-1/2 z-50 rounded-[26px] border border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur supports-[backdrop-filter]:bg-white/80" style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));">
            <div class="flex w-full items-start justify-between gap-1.5 overflow-hidden">
              ${isGuru ? guruBottomNav : siswaBottomNav}
            </div>
          </nav>
        ` : ''}
      </div>
    </div>
  `;
}
