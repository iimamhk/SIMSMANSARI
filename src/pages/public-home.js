import { getLobbyPayload, getLobbySectionLinks } from '../utils/lobby.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

/** Escape teks dinamis (dari admin/Firestore) sebelum disisipkan ke HTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Monogram dari nama sekolah untuk logo fallback (tanpa aset eksternal). */
function monogram(name) {
  const words = String(name || 'SIM SMANSARI').trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || 'S').slice(0, 2);
  return letters.toUpperCase();
}

export async function renderPublicHomePage(container) {
  const session = getSession();
  const role = session?.user?.role || '';
  const dashboardRoute = role === 'admin'
    ? '#admin/dashboard'
    : role === 'guru'
      ? '#guru/dashboard'
      : role === 'siswa'
        ? '#siswa/dashboard'
        : '#login';

  const { settings, sections, links } = await getLobbyPayload();
  const activeSections = sections.filter((item) => item.is_active !== false);

  const schoolName = settings.school_name || 'SMA Negeri 1 Wanasari';
  const brandTitle = settings.hero_title || 'SIMSMANSARI';
  const slogan = settings.slogan || 'Ekosistem pendidikan digital untuk sekolah modern.';
  const heroHeading = settings.hero_heading || 'Satu platform untuk seluruh kehidupan akademik sekolah.';
  const heroSub = settings.hero_subheading || 'SIMSMANSARI menyatukan absensi, penilaian, materi, dan AI dalam satu pengalaman yang cepat, rapi, dan menyenangkan digunakan.';
  const logoUrl = settings.logo_url || '';

  const logoMark = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="Logo ${esc(schoolName)}" class="h-9 w-9 rounded-xl object-cover ring-1 ring-white/15" loading="eager" decoding="async" />`
    : `<span class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-[13px] font-bold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.8)]">${esc(monogram(brandTitle))}</span>`;

  // --- Fitur (grid kompak & seragam; tanpa fitur sensitif seperti pembayaran) ---
  const features = [
    { accent: 'blue', title: 'Absensi Real-time', desc: 'Rekap kehadiran harian per kelas.', icon: '<path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>' },
    { accent: 'indigo', title: 'Penilaian Terpadu', desc: 'Tugas, ulangan, PTS & PAS dalam satu rekap.', icon: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>' },
    { accent: 'sky', title: 'Materi Digital', desc: 'Susun materi interaktif & bagikan ke kelas.', icon: '<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v6h6"/>' },
    { accent: 'blue', title: 'Kuis & Battle', desc: 'Kuis interaktif dengan papan skor langsung.', icon: '<path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.8 7.2 17l.9-5.4L4.2 7.7l5.4-.8z"/>' },
    { accent: 'indigo', title: 'Jurnal Mengajar', desc: 'Catatan pembelajaran harian yang tertata.', icon: '<path d="M4 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2z"/><path d="M8 7h7M8 11h7"/>' },
    { accent: 'sky', title: 'Pengumuman', desc: 'Informasi & agenda sekolah tersampaikan.', icon: '<path d="M3 11l14-5v12L3 13z"/><path d="M8 12v4a2 2 0 0 0 4 0"/>' },
  ];

  const featIcon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${path}</svg>`;
  const accentClass = {
    blue: 'text-blue-600 bg-blue-50 ring-blue-100',
    indigo: 'text-indigo-600 bg-indigo-50 ring-indigo-100',
    sky: 'text-sky-600 bg-sky-50 ring-sky-100',
    slate: 'text-slate-600 bg-slate-100 ring-slate-200',
  };

  const featureCards = features.map((f) => `
    <article data-reveal class="group flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_36px_-26px_rgba(15,23,42,0.28)]">
      <span class="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl ring-1 ${accentClass[f.accent] || accentClass.blue}">${featIcon(f.icon)}</span>
      <div class="min-w-0">
        <h3 class="text-[15px] font-semibold tracking-tight text-slate-900">${esc(f.title)}</h3>
        <p class="mt-1 text-sm leading-6 text-slate-500">${esc(f.desc)}</p>
      </div>
    </article>
  `).join('');

  // --- AI capabilities ---
  const aiItems = [
    { t: 'Membuat RPP/Modul Ajar', d: 'Rancang perangkat ajar lengkap dalam hitungan detik.', i: '<path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v6h6"/>' },
    { t: 'Membuat Soal Otomatis', d: 'Bank soal beragam tingkat kesulitan, siap pakai.', i: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><path d="M12 17h.01"/>' },
    { t: 'Analisis Nilai', d: 'Temukan tren capaian dan siswa yang perlu perhatian.', i: '<path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5"/>' },
    { t: 'Analisis Kehadiran', d: 'Deteksi pola ketidakhadiran lebih dini.', i: '<path d="M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/>' },
    { t: 'Chat AI', d: 'Asisten pengajaran yang memahami konteks kelas.', i: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    { t: 'Laporan Otomatis', d: 'Ringkasan akademik rapi tanpa kerja manual.', i: '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M9 13h6M9 17h6M9 9h2"/>' },
  ];
  const aiCards = aiItems.map((a) => `
    <div data-reveal class="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition duration-300 hover:border-white/20 hover:bg-white/[0.07]">
      <span class="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 text-blue-200 ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${a.i}</svg>
      </span>
      <div>
        <h3 class="text-[15px] font-semibold text-white">${esc(a.t)}</h3>
        <p class="mt-1 text-sm leading-6 text-slate-400">${esc(a.d)}</p>
      </div>
    </div>
  `).join('');

  // --- Portal publik: pusat "semua link penting" (mengarah ke halaman lobi) ---
  const sectionChips = activeSections.slice(0, 6).map((s) => {
    const locked = s.requires_token === true;
    return `
    <a href="#lobi/${esc(s.slug)}" data-reveal class="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_-28px_rgba(37,99,235,0.4)]">
      <div class="flex min-w-0 items-center gap-3">
        <span class="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl ${locked ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' : 'bg-blue-50 text-blue-600 ring-1 ring-blue-100'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${locked ? '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>' : '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'}</svg>
        </span>
        <div class="min-w-0">
          <p class="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span class="truncate">${esc(s.title)}</span>
            ${locked ? '<span class="flex-none rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">PIN</span>' : ''}
          </p>
          <p class="mt-0.5 truncate text-xs text-slate-500">${esc(s.description || 'Akses informasi sekolah')}</p>
        </div>
      </div>
      <span class="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-200 transition group-hover:bg-blue-600 group-hover:text-white group-hover:ring-blue-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </span>
    </a>
  `;
  }).join('');

  const navLinks = [
    { href: '#features', label: 'Fitur' },
    { href: '#portal', label: 'Portal' },
  ];

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      .lp { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#ffffff; color:#0f172a; -webkit-font-smoothing:antialiased; }
      .lp *::selection { background:rgba(37,99,235,.18); }
      .lp-nav-link { position:relative; font-size:.875rem; font-weight:500; color:#475569; transition:color .2s ease; }
      .lp-nav-link:hover { color:#0f172a; }
      .lp-nav-link::after { content:''; position:absolute; left:0; bottom:-4px; height:2px; width:0; background:#2563eb; border-radius:2px; transition:width .25s ease; }
      .lp-nav-link:hover::after { width:100%; }
      .lp-btn { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; height:44px; padding:0 1.25rem; border-radius:14px; font-size:.875rem; font-weight:600; transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease, background .18s ease; }
      .lp-btn:active { transform:translateY(0) scale(.98); }
      .lp-btn-primary { background:linear-gradient(180deg,#3b82f6,#2563eb); color:#fff; box-shadow:0 10px 24px -10px rgba(37,99,235,.7), inset 0 1px 0 rgba(255,255,255,.25); }
      .lp-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 32px -12px rgba(37,99,235,.75), inset 0 1px 0 rgba(255,255,255,.3); }
      .lp-btn-ghost { background:#fff; color:#1e293b; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(15,23,42,.04); }
      .lp-btn-ghost:hover { transform:translateY(-2px); border-color:#cbd5e1; box-shadow:0 12px 24px -16px rgba(15,23,42,.3); }
      .lp-btn-nav { height:40px; padding:0 1rem; }
      .lp-btn:focus-visible { outline:3px solid rgba(37,99,235,.4); outline-offset:2px; }
      .lp-nav-link:focus-visible, .lp a:focus-visible { outline:3px solid rgba(37,99,235,.4); outline-offset:3px; border-radius:8px; }

      @keyframes lpFloat { 0%,100% { transform:translate3d(0,0,0); } 50% { transform:translate3d(0,-16px,0); } }
      @keyframes lpFloatSlow { 0%,100% { transform:translate3d(0,0,0); } 50% { transform:translate3d(0,12px,0); } }
      @keyframes lpOrbit { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      @keyframes lpPulse { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:.9; transform:scale(1.06); } }
      .lp-float { animation:lpFloat 7s ease-in-out infinite; }
      .lp-float-slow { animation:lpFloatSlow 9s ease-in-out infinite; }

      [data-reveal] { opacity:0; transform:translateY(20px); transition:opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1); will-change:opacity,transform; }
      [data-reveal].is-in { opacity:1; transform:none; }

      .lp-mesh { background:
        radial-gradient(60% 60% at 15% 10%, rgba(59,130,246,.10), transparent 60%),
        radial-gradient(50% 50% at 90% 20%, rgba(99,102,241,.10), transparent 60%),
        radial-gradient(60% 60% at 70% 90%, rgba(56,189,248,.08), transparent 60%); }
      .lp-grid-lines { background-image:linear-gradient(rgba(15,23,42,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.04) 1px, transparent 1px); background-size:44px 44px; -webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%); mask-image:radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%); }
      .lp-glass-card { background:rgba(255,255,255,.72); border:1px solid rgba(255,255,255,.7); box-shadow:0 30px 60px -30px rgba(15,23,42,.35), inset 0 1px 0 rgba(255,255,255,.8); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); }
      @media (prefers-reduced-motion: reduce) {
        .lp-float, .lp-float-slow { animation:none; }
        [data-reveal] { opacity:1; transform:none; transition:none; }
      }
    </style>

    <div class="lp min-h-screen">
      <!-- Floating Navbar -->
      <header class="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <nav class="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2.5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:px-5">
          <a href="#home" class="flex items-center gap-2.5">
            <span class="[&_img]:h-9 [&_img]:w-9">${logoMark}</span>
            <span class="flex flex-col leading-none">
              <span class="text-[15px] font-bold tracking-tight text-slate-900">${esc(brandTitle)}</span>
              <span class="mt-0.5 hidden text-[11px] font-medium text-slate-500 sm:block">${esc(schoolName)}</span>
            </span>
          </a>
          <div class="hidden items-center gap-7 md:flex">
            ${navLinks.map((l) => `<a href="${l.href}" class="lp-nav-link">${esc(l.label)}</a>`).join('')}
          </div>
          <div class="flex items-center gap-2">
            ${role
              ? `<a href="${dashboardRoute}" class="lp-btn lp-btn-primary lp-btn-nav">Dashboard</a>`
              : `<a href="#login" class="lp-btn lp-btn-ghost lp-btn-nav hidden sm:inline-flex">Masuk</a>
                 <a href="#login" class="lp-btn lp-btn-primary lp-btn-nav">Mulai</a>`}
          </div>
        </nav>
      </header>

      <!-- Hero -->
      <section class="relative overflow-hidden lp-mesh">
        <div class="pointer-events-none absolute inset-0 lp-grid-lines"></div>
        <div class="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:pb-28 lg:pt-24">
          <!-- Left -->
          <div>
            <span data-reveal class="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-xs font-semibold text-blue-700">
              <span class="relative flex h-1.5 w-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60"></span><span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600"></span></span>
              ${esc(settings.hero_badge || 'Platform Sekolah Digital')}
            </span>
            <h1 data-reveal class="mt-5 text-[2.15rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-slate-900 sm:text-5xl lg:text-[3.35rem]">
              ${esc(heroHeading)}
            </h1>
            <p data-reveal class="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">${esc(heroSub)}</p>
            <div data-reveal class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#login" class="lp-btn lp-btn-primary w-full sm:w-auto">${esc(settings.access_button_text || 'Masuk ke Sistem')}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
              <a href="#features" class="lp-btn lp-btn-ghost w-full sm:w-auto">Jelajahi Fitur</a>
            </div>
            <p data-reveal class="mt-6 text-sm text-slate-500">${esc(slogan)}</p>
          </div>

          <!-- Right: ilustrasi abstrak (nol data, nol Firestore) -->
          <div data-reveal class="relative mx-auto hidden h-[420px] w-full max-w-md lg:block" aria-hidden="true">
            <div class="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-400/25 to-indigo-500/20 blur-3xl" style="animation:lpPulse 6s ease-in-out infinite;"></div>

            <!-- kartu utama (glass) -->
            <div class="lp-float absolute left-4 top-10 w-64 rounded-[26px] lp-glass-card p-5">
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.8 7.2 17l.9-5.4L4.2 7.7l5.4-.8z"/></svg>
                </span>
                <div class="flex-1">
                  <div class="h-2.5 w-24 rounded-full bg-slate-200"></div>
                  <div class="mt-2 h-2 w-16 rounded-full bg-slate-100"></div>
                </div>
              </div>
              <div class="mt-4 space-y-2.5">
                <div class="h-2 w-full rounded-full bg-slate-100"></div>
                <div class="h-2 w-4/5 rounded-full bg-slate-100"></div>
                <div class="h-2 w-2/3 rounded-full bg-blue-100"></div>
              </div>
            </div>

            <!-- kartu kecil melayang -->
            <div class="lp-float-slow absolute right-2 top-2 w-40 rounded-3xl lp-glass-card p-4">
              <div class="flex items-center gap-2">
                <span class="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/90 text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6L9 17l-5-5"/></svg>
                </span>
                <div class="h-2 w-16 rounded-full bg-slate-200"></div>
              </div>
              <div class="mt-3 grid grid-cols-4 gap-1.5">
                ${Array.from({ length: 8 }, (_, i) => `<span class="h-6 rounded-md ${i % 3 === 0 ? 'bg-blue-200' : 'bg-slate-100'}"></span>`).join('')}
              </div>
            </div>

            <!-- orbit AI -->
            <div class="absolute bottom-4 left-10 h-40 w-40" style="animation:lpFloat 8s ease-in-out infinite;">
              <div class="absolute inset-0 rounded-full border border-blue-200/70"></div>
              <div class="absolute inset-4 rounded-full border border-indigo-200/70"></div>
              <div class="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-xl">
                <span class="text-[12px] font-bold tracking-widest">${esc(monogram(brandTitle))}</span>
              </div>
              <div class="absolute inset-0" style="animation:lpOrbit 12s linear infinite;">
                <span class="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(37,99,235,.8)]"></span>
              </div>
              <div class="absolute inset-4" style="animation:lpOrbit 9s linear infinite reverse;">
                <span class="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,.8)]"></span>
              </div>
            </div>

            <span class="absolute right-8 bottom-12 h-3 w-3 rounded-full bg-sky-400/80 lp-float"></span>
            <span class="absolute left-2 top-2 h-2 w-2 rounded-full bg-indigo-400/80 lp-float-slow"></span>
          </div>
        </div>
      </section>

      <!-- Features (Bento) -->
      <section id="features" class="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 lg:py-24">
        <div class="max-w-2xl">
          <p data-reveal class="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">Fitur</p>
          <h2 data-reveal class="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Semua kebutuhan akademik, satu tempat</h2>
          <p data-reveal class="mt-3 text-base leading-7 text-slate-600">Dirancang untuk guru dan siswa: cepat dibuka, mudah dipahami, dan konsisten di semua perangkat.</p>
        </div>
        <div class="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${featureCards}
        </div>
      </section>

      <!-- AI Section -->
      <section id="ai" class="relative scroll-mt-24 overflow-hidden bg-gradient-to-b from-[#0A1B3D] to-[#0B1220] py-16 lg:py-24">
        <div class="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl"></div>
        <div class="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl"></div>
        <div class="relative mx-auto grid max-w-6xl items-start gap-10 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <span data-reveal class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-blue-200">Ditenagai AI</span>
            <h2 data-reveal class="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Kecerdasan yang meringankan pekerjaan guru</h2>
            <p data-reveal class="mt-4 max-w-md text-base leading-7 text-slate-400">Dari menyusun perangkat ajar sampai menganalisis capaian kelas — AI SIMSMANSARI bekerja di latar, Anda tetap memegang kendali.</p>
            <a data-reveal href="#login" class="lp-btn lp-btn-primary mt-8 inline-flex">Coba Sekarang
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            ${aiCards}
          </div>
        </div>
      </section>

      <!-- Portal publik -->
      ${activeSections.length ? `
      <section id="portal" class="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 sm:px-6 lg:py-24">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-xl">
            <p data-reveal class="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">Portal Publik</p>
            <h2 data-reveal class="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Pusat semua link penting sekolah</h2>
            <p data-reveal class="mt-3 text-base leading-7 text-slate-600">Dokumen, RPP, materi, formulir, dan pengumuman dalam satu pintu. Sebagian terbuka untuk umum, sebagian dilindungi PIN.</p>
          </div>
          <p data-reveal class="text-sm text-slate-500">${activeSections.length} kategori tersedia</p>
        </div>
        <div class="mt-10 grid gap-3 sm:grid-cols-2">
          ${sectionChips}
        </div>
      </section>` : ''}

      <!-- CTA strip -->
      <section class="mx-auto max-w-6xl px-5 sm:px-6">
        <div data-reveal class="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-gradient-to-br from-[#0A1B3D] to-[#12224d] px-8 py-14 text-center shadow-[0_40px_80px_-40px_rgba(10,27,61,0.6)]">
          <div class="pointer-events-none absolute inset-0 opacity-40 lp-mesh"></div>
          <h2 class="relative text-2xl font-bold tracking-tight text-white sm:text-3xl">Siap memulai dengan ${esc(brandTitle)}?</h2>
          <p class="relative mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-300">Masuk sesuai peran Anda sebagai guru atau siswa dan rasakan pengalaman akademik yang lebih rapi.</p>
          <div class="relative mt-8 flex justify-center">
            <a href="#login" class="lp-btn lp-btn-primary">${esc(settings.access_button_text || 'Buka Halaman Login')}</a>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="mx-auto mt-16 max-w-6xl px-5 pb-10 sm:px-6">
        <div class="flex flex-col items-center justify-between gap-6 border-t border-slate-200 pt-8 sm:flex-row">
          <div class="flex items-center gap-2.5">
            <span class="[&_img]:h-8 [&_img]:w-8">${logoMark}</span>
            <div class="leading-tight">
              <p class="text-sm font-bold text-slate-900">${esc(brandTitle)}</p>
              <p class="text-xs text-slate-500">${esc(schoolName)}</p>
            </div>
          </div>
          <div class="flex items-center gap-6 text-sm text-slate-500">
            <a href="#features" class="lp-nav-link">Fitur</a>
            <a href="#portal" class="lp-nav-link">Portal</a>
            <a href="#login" class="lp-nav-link">Masuk</a>
          </div>
          <p class="text-xs text-slate-400">© ${new Date().getFullYear()} ${esc(schoolName)}</p>
        </div>
      </footer>
    </div>
  `;

  // Scroll reveal (60fps, transform/opacity). Hormati reduced-motion via CSS.
  const revealTargets = container.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealTargets.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
      io.observe(el);
    });
  } else {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  }
}
