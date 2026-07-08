import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getDocumentsWhere } from '../../firebase/data-service.js';

const ALPA_ALERT_THRESHOLD = 3;

export async function renderSiswaDashboardPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Siswa';
  const siswaKeys = getSessionUserKeys(session, context);
  const shortName = userName.split(' ')[0] || 'Siswa';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const absensiDocs = await getDocumentsWhere('absensi', [
    { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
    { field: 'semester_id', operator: '==', value: context.semester_aktif },
  ]);
  const currentStudentAbsensi = absensiDocs.filter((item) => siswaKeys.includes(normalizeUserKey(item.siswa_id)));
  const totalAlpa = currentStudentAbsensi.filter((item) => item.status === 'A').length;
  const hasAlpaWarning = totalAlpa >= ALPA_ALERT_THRESHOLD;
  const heroTheme = hour < 12
    ? {
        panel: 'from-sky-500 via-cyan-500 to-emerald-400',
        subtext: 'text-sky-50/85',
        eyebrow: 'text-cyan-100',
        glowA: 'bg-white/25',
        glowB: 'bg-cyan-200/25',
        glass: 'bg-white/16',
        accentLabel: 'Energi Pagi',
        accentIcon: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
        title: 'Mulai Hari Dengan Ringan',
        message: 'Cek jadwal, materi, dan target belajar sejak pagi agar aktivitas sekolah terasa lebih terarah.',
        statusLabel: 'Mood Belajar',
        statusValue: 'Siap Memulai',
        statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Waktu yang pas untuk menyiapkan fokus sebelum pelajaran berjalan penuh.'
      }
    : hour < 15
      ? {
          panel: 'from-amber-400 via-orange-400 to-rose-400',
          subtext: 'text-amber-50/90',
          eyebrow: 'text-amber-100',
          glowA: 'bg-white/20',
          glowB: 'bg-amber-100/25',
          glass: 'bg-white/14',
          accentLabel: 'Fokus Siang',
          accentIcon: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
          title: 'Tetap Tajam Di Tengah Hari',
          message: 'Ringkas progres utama Anda dan lanjutkan pelajaran penting tanpa kehilangan ritme.',
          statusLabel: 'Ritme Akademik',
          statusValue: 'Sedang Aktif',
          statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Pertahankan fokus agar tugas, kuiz, dan materi selesai lebih cepat.'
        }
      : hour < 18
        ? {
            panel: 'from-indigo-500 via-violet-500 to-fuchsia-500',
            subtext: 'text-violet-50/85',
            eyebrow: 'text-violet-100',
            glowA: 'bg-white/18',
            glowB: 'bg-fuchsia-200/20',
            glass: 'bg-white/12',
            accentLabel: 'Sore Produktif',
            accentIcon: '<path d="M4 15c2.5-4.8 5.8-7.2 10-7.2 2.4 0 4.3.6 6 1.8-1.4 5-5.2 8.4-10 8.4-2.1 0-4.1-1-6-3z"/><path d="M13 5.5c1.3.5 2.3 1.6 2.7 3"/>',
            title: 'Rapikan Sisa Target Hari Ini',
            message: 'Sore cocok untuk meninjau nilai, membuka materi, dan memastikan tidak ada tugas yang terlewat.',
            statusLabel: 'Arah Belajar',
            statusValue: 'Tetap Stabil',
            statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Gunakan waktu sore untuk merapikan progres sebelum hari berakhir.'
          }
        : {
            panel: 'from-slate-900 via-indigo-900 to-blue-950',
            subtext: 'text-indigo-50/82',
            eyebrow: 'text-indigo-200',
            glowA: 'bg-white/12',
            glowB: 'bg-indigo-300/18',
            glass: 'bg-white/10',
            accentLabel: 'Malam Tenang',
            accentIcon: '<path d="M18.5 14.5A6.5 6.5 0 0 1 9.5 5.5 7.5 7.5 0 1 0 18.5 14.5Z"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="4.5" r="0.8" fill="currentColor" stroke="none"/>',
            title: 'Review Santai Sebelum Istirahat',
            message: 'Malam hari pas untuk melihat rangkuman belajar, meninjau hasil, dan menyiapkan esok dengan lebih tenang.',
            statusLabel: 'Mode Belajar',
            statusValue: 'Reflektif',
            statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Akhiri hari dengan evaluasi singkat agar besok mulai lebih siap.'
          };

  const html = renderLayout('Dashboard Siswa', `
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
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">${heroTheme.statusLabel}</p>
                <p class="mt-3 text-2xl font-semibold text-white">${heroTheme.statusValue}</p>
                <p class="mt-2 text-sm text-slate-200">${heroTheme.statusMessage}</p>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Akses Cepat</p>
              <p class="mt-1 text-lg font-semibold text-slate-900">Menu Utama</p>
            </div>
            <div class="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">Siswa</div>
          </div>
          <div class="mt-4 grid gap-2.5">
            <div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Login sebagai <span class="font-semibold text-slate-900">${userName}</span></div>
          </div>
        </article>
      </section>

      <section>
        <div class="mb-4">
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Menu Cepat</p>
          <h2 class="text-2xl font-semibold text-slate-900">Navigasi Utama</h2>
        </div>

        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <a href="#siswa/nilai" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-blue-500 via-sky-500 to-cyan-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" />
                  <circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Nilai</p>
              <p class="mt-1 text-xs text-white/90">Lihat hasil belajar per mapel.</p>
            </div>
          </a>

          <a href="#siswa/absensi" class="group relative overflow-hidden rounded-[30px] p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)] ${hasAlpaWarning ? 'bg-gradient-to-br from-rose-500 via-pink-500 to-red-500' : 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500'}">
            <div class="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="5" width="16" height="15" rx="3" />
                  <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" />
                </svg>
              </div>
              <div class="mt-3 flex items-center gap-1.5">
                <p class="text-sm font-semibold">Absensi</p>
                ${hasAlpaWarning ? '<span class="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold uppercase">!</span>' : ''}
              </div>
              <p class="mt-1 text-xs text-white/90">Pantau kehadiran harian.</p>
            </div>
          </a>

          <a href="#siswa/materi" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" />
                  <path d="M8 19h10" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Materi</p>
              <p class="mt-1 text-xs text-white/90">Baca materi dari guru.</p>
            </div>
          </a>

          <a href="#siswa/game" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="8" width="18" height="8" rx="4" />
                  <path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Game</p>
              <p class="mt-1 text-xs text-white/90">Mainkan game pembelajaran.</p>
            </div>
          </a>

          <a href="#siswa/kuiz" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-600 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Kuiz</p>
              <p class="mt-1 text-xs text-white/90">Masuk ke kuiz dan riwayat pengerjaan.</p>
            </div>
          </a>

          <a href="#siswa/pengatur-sistem" class="group relative overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-500 via-blue-600 to-slate-700 p-4 text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)]">
            <div class="absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
            <div class="relative">
              <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                  <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
                </svg>
              </div>
              <p class="mt-3 text-sm font-semibold">Akun</p>
              <p class="mt-1 text-xs text-white/90">Kelola profil dan sandi.</p>
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
    if (!clockEl || !dateEl) {
      return;
    }

    clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
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
