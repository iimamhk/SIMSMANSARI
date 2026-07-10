import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getDocumentsWhere } from '../../firebase/data-service.js';

const ALPA_ALERT_THRESHOLD = 3;

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

  const quickCard = (href, title, desc, grad, icon) => `
          <a href="${href}" class="qa-card group relative flex flex-col items-center overflow-hidden rounded-3xl border border-slate-100 bg-white p-3.5 text-center shadow-sm ring-1 ring-slate-50 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-slate-200 active:scale-[0.98]">
            <div class="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-white shadow-md shadow-black/10">
              <span class="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/30 to-white/0"></span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="relative h-6 w-6 drop-shadow-sm" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
            </div>
            <p class="mt-3 text-sm font-semibold text-slate-900">${title}</p>
            <p class="mt-1 text-xs leading-snug text-slate-500">${desc}</p>
            <span class="pointer-events-none absolute right-3 top-3 text-slate-300 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100">
              <svg viewBox="0 0 24 24" class="h-4 w-4 translate-x-1 transition-transform duration-300 group-hover:translate-x-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </span>
          </a>`;

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
        statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Waktu yang pas untuk menyiapkan fokus sebelum pelajaran berjalan penuh.',
        celestialType: 'sun',
        celestialPos: 'right-6 bottom-3',
        celestialFloat: true,
        hcColor: 'rgba(255,243,200,0.85)',
        hcCore: '#ffe27a',
        hcEdge: '#ffb43d',
        hcGlow: 'rgba(255,210,110,0.85)'
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
          statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Pertahankan fokus agar tugas, kuiz, dan materi selesai lebih cepat.',
          celestialType: 'sun',
          celestialPos: 'right-6 bottom-3',
          celestialFloat: true,
          hcColor: 'rgba(255,225,180,0.9)',
          hcCore: '#ffb259',
          hcEdge: '#ff7a3d',
          hcGlow: 'rgba(255,140,80,0.85)'
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
            statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Gunakan waktu sore untuk merapikan progres sebelum hari berakhir.',
            celestialType: 'sun',
            celestialPos: 'right-6 bottom-3',
            celestialFloat: true,
            hcColor: 'rgba(255,225,180,0.9)',
            hcCore: '#ffb259',
            hcEdge: '#ff7a3d',
            hcGlow: 'rgba(255,140,80,0.85)'
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
            statusMessage: hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Akhiri hari dengan evaluasi singkat agar besok mulai lebih siap.',
            celestialType: 'moon',
            celestialPos: 'left-1/2 top-0 -translate-x-1/2'
          };

  const html = renderLayout('Dashboard Siswa', `
    <div class="space-y-6">
      <section>
        <article class="relative overflow-hidden rounded-[28px] bg-gradient-to-br ${heroTheme.panel} p-4 text-white shadow-[0_20px_60px_rgba(15,23,42,0.2)] sm:p-5">
          <div class="absolute -right-12 -top-12 h-32 w-32 rounded-full ${heroTheme.glowA} blur-3xl"></div>
          <div class="absolute -left-10 bottom-0 h-28 w-28 rounded-full ${heroTheme.glowB} blur-3xl"></div>
          <div class="absolute bottom-0 right-0 h-20 w-32 rounded-tl-[36px] bg-white/5"></div>

          ${renderCelestial(heroTheme)}
          ${heroTheme.celestialType === 'moon' ? nightStars : ''}

          <div class="relative flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-[0.22em] ${heroTheme.eyebrow}">${greeting}, ${shortName}.</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <h1 class="text-xl font-semibold text-white sm:text-2xl">${heroTheme.title}</h1>
                <span class="rounded-full border border-white/20 ${heroTheme.glass} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">${heroTheme.accentLabel}</span>
              </div>
            </div>
            <div class="flex shrink-0 items-center justify-end gap-3 text-right">
              <div>
                <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Cuaca</p>
                <div class="mt-0.5 flex items-center justify-end gap-1.5">
                  <div class="text-right">
                    <p id="dashboard-weather-temp" class="text-2xl font-semibold leading-none text-white sm:text-3xl">--°</p>
                    <p id="dashboard-weather-desc" class="mt-1 text-[10px] text-white/80 sm:text-[11px]">Memuat cuaca...</p>
                  </div>
                  <svg id="dashboard-weather-icon" viewBox="0 0 24 24" class="h-5 w-5 stroke-current text-amber-200" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4.5" />
                    <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
                  </svg>
                </div>
              </div>
              <div class="border-l border-white/20 pl-3 text-right">
                <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Waktu</p>
                <p id="dashboard-clock" class="mt-0.5 text-xl font-semibold leading-none text-white">--:--</p>
                <p id="dashboard-date" class="mt-1 text-[10px] text-white/80">Memuat tanggal...</p>
              </div>
            </div>
          </div>

          <p class="relative mt-2 max-w-2xl text-[13px] leading-snug ${heroTheme.subtext}">${heroTheme.message}</p>

          ${hasAlpaWarning ? `<div class="relative mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.8 4.8 13.1a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/></svg>Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.</div>` : `<div class="relative mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/90 ring-1 ring-white/20 backdrop-blur-sm"><span class="h-1.5 w-1.5 rounded-full bg-emerald-300"></span>${heroTheme.statusValue}</div>`}
        </article>
      </section>

      <section>
        <div class="rounded-3xl bg-white p-5 shadow-md ring-1 ring-slate-100">
          <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Menu Cepat</p>
              <h2 class="text-2xl font-semibold text-slate-900">Navigasi Utama</h2>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          ${quickCard('#siswa/nilai', 'Nilai', 'Lihat hasil belajar per mapel.', 'from-blue-600 to-indigo-500', '<path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5"/><circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none"/>')}
          ${quickCard('#siswa/absensi', 'Absensi', hasAlpaWarning ? 'Perhatian kehadiran!' : 'Pantau kehadiran harian.', hasAlpaWarning ? 'from-rose-500 to-red-500' : 'from-emerald-500 to-teal-500', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/>')}
          ${quickCard('#siswa/materi', 'Materi', 'Baca materi dari guru.', 'from-sky-500 to-cyan-500', '<path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/>')}
          ${quickCard('#siswa/game', 'Game', 'Mainkan game pembelajaran.', 'from-pink-500 to-rose-500', '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h4M10 10v4M16.5 11.5h.01M18 12.5h.01"/>')}
          ${quickCard('#siswa/kuiz', 'Kuiz', 'Masuk ke kuiz kelas.', 'from-violet-500 to-purple-600', '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>')}
          ${quickCard('#siswa/pengatur-sistem', 'Akun', 'Kelola profil dan sandi.', 'from-slate-700 to-slate-900', '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z"/>')}
          </div>
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

  const updateWeather = () => {
    const tempEl = container.querySelector('#dashboard-weather-temp');
    const descEl = container.querySelector('#dashboard-weather-desc');
    const iconEl = container.querySelector('#dashboard-weather-icon');
    if (!tempEl || !descEl) return;
    const hour = new Date().getHours();
    const isDay = hour >= 6 && hour < 18;
    const sample = isDay
      ? { temp: 29, desc: 'Cerah Berawan', icon: '<circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />', color: 'text-amber-200' }
      : { temp: 24, desc: 'Cerah', icon: '<path d="M18.5 14.5A6.5 6.5 0 0 1 9.5 5.5 7.5 7.5 0 1 0 18.5 14.5Z" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="4.5" r="0.8" fill="currentColor" stroke="none" />', color: 'text-indigo-200' };
    tempEl.textContent = `${sample.temp}°`;
    descEl.textContent = sample.desc;
    if (iconEl) {
      iconEl.innerHTML = sample.icon;
      iconEl.setAttribute('class', `h-5 w-5 stroke-current ${sample.color}`);
    }
  };

  updateWeather();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
