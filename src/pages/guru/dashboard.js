import { renderLayout } from '../../layouts/dashboard-layout.js';

export function renderGuruDashboard(container) {
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Bapak/Ibu Guru';
  const shortName = userName.split(' ')[0] || 'Guru';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const heroTheme = hour < 12
    ? {
        panel: 'from-sky-600 via-cyan-600 to-emerald-500',
        subtext: 'text-sky-50/85',
        eyebrow: 'text-cyan-100',
        glowA: 'bg-white/22',
        glowB: 'bg-cyan-200/20',
        glass: 'bg-white/14',
        accentLabel: 'Start Kelas',
        accentIcon: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
        title: 'Awali Kelas Dengan Ritme Jelas',
        message: 'Pagi hari ideal untuk menata absensi, materi, dan fokus kelas sebelum aktivitas berjalan penuh.',
        insightLabel: 'Arah Hari Ini',
        insightValue: 'Siap Mengajar',
        insightDetail: 'Susun prioritas utama sejak awal agar pengelolaan kelas tetap ringan dan cepat.'
      }
    : hour < 15
      ? {
          panel: 'from-amber-500 via-orange-500 to-rose-500',
          subtext: 'text-amber-50/90',
          eyebrow: 'text-amber-100',
          glowA: 'bg-white/20',
          glowB: 'bg-amber-100/24',
          glass: 'bg-white/12',
          accentLabel: 'Puncak Aktivitas',
          accentIcon: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
          title: 'Jaga Fokus Saat Aktivitas Padat',
          message: 'Gunakan dashboard untuk memantau progres kelas, penilaian, dan materi tanpa membuka terlalu banyak langkah.',
          insightLabel: 'Ritme Mengajar',
          insightValue: 'Sedang Aktif',
          insightDetail: 'Pertahankan alur kerja yang singkat agar keputusan di tengah jam belajar tetap cepat.'
        }
      : hour < 18
        ? {
            panel: 'from-indigo-600 via-violet-600 to-fuchsia-600',
            subtext: 'text-violet-50/85',
            eyebrow: 'text-violet-100',
            glowA: 'bg-white/18',
            glowB: 'bg-fuchsia-200/18',
            glass: 'bg-white/12',
            accentLabel: 'Sore Terkelola',
            accentIcon: '<path d="M4 15c2.5-4.8 5.8-7.2 10-7.2 2.4 0 4.3.6 6 1.8-1.4 5-5.2 8.4-10 8.4-2.1 0-4.1-1-6-3z"/><path d="M13 5.5c1.3.5 2.3 1.6 2.7 3"/>',
            title: 'Rapikan Progres Sebelum Hari Usai',
            message: 'Sore hari pas untuk merangkum hasil belajar, memperbarui catatan, dan menuntaskan tindak lanjut kelas.',
            insightLabel: 'Status Kelas',
            insightValue: 'Terpantau',
            insightDetail: 'Gunakan jeda sore untuk memastikan materi, nilai, dan aktivitas siswa tetap sinkron.'
          }
        : {
            panel: 'from-slate-900 via-indigo-900 to-blue-950',
            subtext: 'text-indigo-50/82',
            eyebrow: 'text-indigo-200',
            glowA: 'bg-white/12',
            glowB: 'bg-indigo-300/16',
            glass: 'bg-white/10',
            accentLabel: 'Mode Evaluasi',
            accentIcon: '<path d="M18.5 14.5A6.5 6.5 0 0 1 9.5 5.5 7.5 7.5 0 1 0 18.5 14.5Z"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="4.5" r="0.8" fill="currentColor" stroke="none"/>',
            title: 'Tutup Hari Dengan Evaluasi Ringkas',
            message: 'Malam cocok untuk meninjau hasil, mengecek agenda esok, dan menjaga semua administrasi tetap rapi.',
            insightLabel: 'Mode Kerja',
            insightValue: 'Reflektif',
            insightDetail: 'Selesaikan tinjauan penting malam ini agar esok dimulai tanpa beban yang tertinggal.'
          };

  const html = renderLayout('Dashboard Guru', `
    <div class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <article class="relative overflow-hidden rounded-[30px] bg-gradient-to-br ${heroTheme.panel} p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] lg:p-6">
          <div class="absolute -right-10 -top-10 h-28 w-28 rounded-full ${heroTheme.glowA} blur-2xl"></div>
          <div class="absolute -left-10 bottom-0 h-24 w-24 rounded-full ${heroTheme.glowB} blur-2xl"></div>
          <div class="absolute right-4 top-4 flex h-16 w-16 items-center justify-center rounded-[24px] border border-white/20 ${heroTheme.glass} text-white/90 backdrop-blur-md sm:h-20 sm:w-20">
            <svg viewBox="0 0 24 24" class="h-8 w-8 stroke-current sm:h-10 sm:w-10" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${heroTheme.accentIcon}</svg>
          </div>
          <div class="absolute -bottom-6 right-20 h-24 w-24 rotate-12 rounded-[28px] border border-white/10 ${heroTheme.glass} backdrop-blur-md"></div>
          <div class="relative space-y-4">
            <div class="pr-20 sm:pr-24">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] ${heroTheme.eyebrow}">${greeting}, ${shortName}.</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <h1 class="text-2xl font-semibold text-white sm:text-3xl">${heroTheme.title}</h1>
                <span class="rounded-full border border-white/20 ${heroTheme.glass} px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">${heroTheme.accentLabel}</span>
              </div>
              <p class="mt-2 max-w-xl text-sm ${heroTheme.subtext}">${heroTheme.message}</p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-[24px] ${heroTheme.glass} p-4 backdrop-blur-md">
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">Waktu Sekarang</p>
                <p id="dashboard-clock" class="mt-3 text-3xl font-semibold text-white">--:--</p>
                <p id="dashboard-date" class="mt-1 text-sm text-slate-200">Memuat tanggal...</p>
              </div>
              <div class="rounded-[24px] ${heroTheme.glass} p-4 backdrop-blur-md">
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">${heroTheme.insightLabel}</p>
                <p class="mt-3 text-2xl font-semibold text-white">${heroTheme.insightValue}</p>
                <p class="mt-2 text-sm text-slate-200">${heroTheme.insightDetail}</p>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-slate-500">Akses Cepat</p>
              <p class="mt-2 text-2xl font-semibold text-slate-900">Menu Utama</p>
            </div>
            <div class="rounded-3xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Guru</div>
          </div>
          <div class="mt-6 grid gap-3">
            <div class="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">Login sebagai <span class="font-semibold text-slate-900">${userName}</span></div>
            <div class="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">Dashboard ini dirancang untuk membantu Anda tetap fokus dan cepat dalam tugas harian.</div>
          </div>
        </article>
      </section>

      <section>
        <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Menu Cepat</p>
            <h2 class="text-2xl font-semibold text-slate-900">Navigasi Utama</h2>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <a href="#guru/input-absen" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="5" width="16" height="15" rx="3" />
                  <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Absensi</p>
              <p class="mt-1 text-xs text-white/90">Input kehadiran harian siswa.</p>
            </div>
          </a>

          <a href="#guru/penilaian" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" />
                  <circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Penilaian</p>
              <p class="mt-1 text-xs text-white/90">Kelola nilai per mapel.</p>
            </div>
          </a>

          <a href="#guru/materi" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" />
                  <path d="M8 19h10" />
                  <path d="M17.5 4l.7 1.9L20 6.5l-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9z" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Materi</p>
              <p class="mt-1 text-xs text-white/90">Buat dan publikasikan materi.</p>
            </div>
          </a>

          <a href="#guru/game" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="8" width="18" height="8" rx="4" />
                  <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Game</p>
              <p class="mt-1 text-xs text-white/90">Atur aktivitas game kelas.</p>
            </div>
          </a>

          <a href="#guru/dashboard" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
                  <path d="M8 7h8M8 7v14M16 7v14M12 7v14" />
                  <path d="M4 11h16" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Jadwal</p>
              <p class="mt-1 text-xs text-white/90">Lihat ringkasan jadwal mengajar.</p>
            </div>
          </a>

          <a href="#guru/dashboard" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5.5v8" />
                  <path d="M12 17.5h.01" />
                  <path d="M10.3 3.8 4.8 13.1a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3l-5.5-9.3a2 2 0 0 0-3.4 0Z" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Info</p>
              <p class="mt-1 text-xs text-white/90">Pantau informasi terbaru.</p>
            </div>
          </a>

          <a href="#guru/pengatur-sistem" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-500 via-blue-600 to-slate-700 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                  <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Akun</p>
              <p class="mt-1 text-xs text-white/90">Ubah pengaturan akun.</p>
            </div>
          </a>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const updateClock = () => {
    const now = new Date();
    const clockEl = container.querySelector('#dashboard-clock');
    const dateEl = container.querySelector('#dashboard-date');
    if (!clockEl || !dateEl) return;
    clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  updateClock();
  if (!container.dashboardClockInterval) {
    container.dashboardClockInterval = setInterval(updateClock, 60000);
  }

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
