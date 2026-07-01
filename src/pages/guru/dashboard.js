import { renderLayout } from '../../layouts/dashboard-layout.js';

export function renderGuruDashboard(container) {
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Bapak/Ibu Guru';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const weather = {
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-8 w-8 text-yellow-400">
        <path fill="currentColor" d="M12 3.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V4.25A.75.75 0 0 1 12 3.5Zm4.285 1.965a.75.75 0 1 1 1.06 1.06l-1.062 1.062a.75.75 0 1 1-1.06-1.06l1.062-1.062ZM18.5 11.25a.75.75 0 0 1 .75.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75.75.75 0 0 1 .75-.75Zm-2.155 6.035a.75.75 0 0 1 1.06 0l1.062 1.062a.75.75 0 0 1-1.06 1.06l-1.062-1.062a.75.75 0 0 1 0-1.06ZM12 17.75a5.75 5.75 0 1 1 0-11.5 5.75 5.75 0 0 1 0 11.5Zm-5.75-5.75a.75.75 0 0 1 .75-.75H8.5a.75.75 0 0 1 0 1.5H7A.75.75 0 0 1 6.25 12ZM5.715 5.465a.75.75 0 0 1 1.06 0l1.062 1.062a.75.75 0 1 1-1.06 1.06L5.715 6.525a.75.75 0 0 1 0-1.06Zm-1.22 7.785a.75.75 0 0 1 .75-.75H6.5a.75.75 0 0 1 0 1.5H5.245a.75.75 0 0 1-.75-.75Z"/>
      </svg>
    `,
    label: 'Cerah',
    temperature: '28°C',
    detail: 'Langit cerah dengan angin sepoi-sepoi',
  };

  const html = renderLayout('Dashboard Guru', `
    <div class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <article class="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
          <div class="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/5 blur-2xl"></div>
          <div class="relative space-y-5">
            <p class="text-sm uppercase tracking-[0.24em] text-slate-300">${greeting}, ${userName.split(' ')[0] || 'Guru'}.</p>
            <h1 class="text-3xl font-semibold text-white">Dashboard Pintar</h1>
            <p class="max-w-xl text-sm text-slate-300">Kelola absensi, nilai, dan informasi penting untuk periode aktif ${context.tahun_ajaran_aktif_nama || '-'} / ${context.semester_aktif_nama || '-'}.</p>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-[28px] bg-white/10 p-4 backdrop-blur-md">
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">Waktu Sekarang</p>
                <p id="dashboard-clock" class="mt-3 text-3xl font-semibold text-white">--:--</p>
                <p id="dashboard-date" class="mt-1 text-sm text-slate-200">Memuat tanggal...</p>
              </div>
              <div class="rounded-[28px] bg-white/10 p-4 backdrop-blur-md">
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">Cuaca</p>
                <div class="mt-3 flex items-center gap-3">
                  <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/15 text-2xl">${weather.icon}</div>
                  <div>
                    <p class="text-2xl font-semibold text-white">${weather.temperature}</p>
                    <p class="text-sm text-slate-200">${weather.label}</p>
                  </div>
                </div>
                <p class="mt-3 text-sm text-slate-300">${weather.detail}</p>
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
            <div class="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">Periode aktif: <span class="font-semibold text-slate-900">${context.tahun_ajaran_aktif_nama || '-'} / ${context.semester_aktif_nama || '-'}</span></div>
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

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <a href="#guru/input-absen" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#007AFF]/10 text-[#007AFF]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 7h16M7 11h10M7 15h6" />
                <path d="M8 5h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Absensi</p>
            <p class="mt-2 text-sm text-slate-500">Catat kehadiran cepat.</p>
          </a>

          <a href="#guru/penilaian" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#34C759]/10 text-[#34C759]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 21h14" />
                <path d="M8 7h8M8 11h8M8 15h5" />
                <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Penilaian</p>
            <p class="mt-2 text-sm text-slate-500">Masukkan nilai siswa.</p>
          </a>

          <a href="#guru/dashboard" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#AF52DE]/10 text-[#AF52DE]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
                <path d="M8 7h8M8 7v14M16 7v14M12 7v14" />
                <path d="M4 11h16" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Jadwal</p>
            <p class="mt-2 text-sm text-slate-500">Ringkasan jadwal mengajar.</p>
          </a>

          <a href="#guru/dashboard" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FF9500]/10 text-[#FF9500]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10Z" />
                <path d="M8 9h8M8 13h4" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Pengumuman</p>
            <p class="mt-2 text-sm text-slate-500">Lihat info terbaru sekolah.</p>
          </a>

          <a href="#guru/pengatur-sistem" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#5856D6]/10 text-[#5856D6]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Pengaturan Akun</p>
            <p class="mt-2 text-sm text-slate-500">Ubah username dan password akun guru.</p>
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
