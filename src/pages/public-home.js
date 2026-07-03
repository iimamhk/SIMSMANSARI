import { getLobbyPayload, getLobbySectionLinks } from '../utils/lobby.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
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

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

      .public-lobby {
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      @keyframes hero-float {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(0, -14px, 0); }
      }

      @keyframes card-rise {
        from { opacity: 0; transform: translate3d(0, 24px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
      }

      .hero-float {
        animation: hero-float 7s ease-in-out infinite;
      }

      .card-rise {
        animation: card-rise 700ms ease-out both;
      }

      .glass-panel {
        position: relative;
        overflow: hidden;
      }

      .glass-panel::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08) 48%, rgba(255,255,255,0));
        pointer-events: none;
      }

      .glass-panel > * {
        position: relative;
        z-index: 1;
      }
    </style>

    <div class="public-lobby min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.55),_transparent_38%),linear-gradient(145deg,_#10b981_0%,_#5eead4_28%,_#67e8f9_56%,_#93c5fd_76%,_#c4b5fd_100%)] text-slate-900">
      <div class="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div class="pointer-events-none absolute inset-0 overflow-hidden">
          <div class="hero-float absolute -top-16 right-[8%] h-44 w-44 rounded-full bg-white/20 blur-3xl"></div>
          <div class="hero-float absolute bottom-16 left-[4%] h-52 w-52 rounded-full bg-cyan-200/30 blur-3xl" style="animation-delay: 1.5s;"></div>
          <div class="hero-float absolute top-1/3 left-1/3 h-36 w-36 rounded-full bg-violet-200/30 blur-3xl" style="animation-delay: 3s;"></div>
        </div>

        <header class="glass-panel relative z-10 rounded-[28px] border border-white/40 bg-white/60 px-4 py-3 shadow-[0_20px_80px_rgba(15,23,42,0.12)] ring-1 ring-white/20 backdrop-blur-xl sm:px-6 sm:py-4 sm:rounded-[30px] sm:px-7">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="inline-flex items-center rounded-full border border-emerald-200/70 bg-white/72 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-800 shadow-[0_8px_24px_rgba(16,185,129,0.12)]">${settings.hero_badge || 'Portal Publik'}</p>
              <h1 class="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">${settings.hero_title || 'SIM SMANSARI'}</h1>
              <p class="mt-2 max-w-2xl overflow-hidden text-sm leading-5 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:text-base sm:leading-6 sm:[display:block] sm:[-webkit-line-clamp:unset]">${settings.hero_description || ''}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              ${role ? `<a href="${dashboardRoute}" class="inline-flex items-center justify-center rounded-2xl border border-white/70 bg-white/88 px-5 py-3 text-sm font-bold text-slate-800 shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(15,23,42,0.12)]">Masuk ke Dashboard</a>` : ''}
            </div>
          </div>
        </header>

        <section class="relative z-10 mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr] sm:mt-6 sm:gap-6">
          <div class="glass-panel rounded-[30px] border border-white/40 bg-white/58 p-4 shadow-[0_24px_90px_rgba(15,23,42,0.12)] ring-1 ring-white/18 backdrop-blur-xl sm:rounded-[34px] sm:p-8">
            <div class="hidden flex-wrap gap-2 sm:flex">
              ${(settings.info_pills || []).slice(0, 4).map((item) => `<span class="rounded-full border border-white/55 bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">${item}</span>`).join('')}
            </div>
            <h2 class="mt-2 max-w-3xl text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:mt-6 sm:text-4xl">${settings.hero_heading || ''}</h2>
            <p class="mt-3 max-w-2xl overflow-hidden text-sm leading-6 text-slate-800 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] sm:mt-5 sm:text-base sm:leading-7 sm:[display:block] sm:[-webkit-line-clamp:unset]">${settings.hero_subheading || ''}</p>
          </div>

          <aside class="glass-panel rounded-[30px] border border-white/40 bg-white/80 p-4 text-black shadow-[0_24px_90px_rgba(15,23,42,0.18)] ring-1 ring-white/22 backdrop-blur-xl sm:rounded-[34px] sm:p-8">
            <p class="text-xs font-bold uppercase tracking-[0.28em] text-black">${settings.access_badge || 'Akses Sistem'}</p>
            <h3 class="mt-3 text-xl font-extrabold tracking-tight text-black sm:mt-4 sm:text-2xl">${settings.access_title || 'Login Pengguna'}</h3>
            <p class="mt-2 overflow-hidden text-sm leading-6 text-black [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:mt-3 sm:leading-7 sm:[display:block] sm:[-webkit-line-clamp:unset]">${settings.access_description || ''}</p>
            <div class="mt-4 rounded-[24px] border border-white/75 bg-white/88 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-100 sm:mt-6 sm:rounded-[28px] sm:p-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-black">Masuk ke Sistem Akademik</p>
                  <p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">Akses guru, dan siswa</p>
                </div>
                <span class="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Cepat</span>
              </div>
              <a href="#login" class="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 px-5 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_18px_45px_rgba(52,211,153,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(59,130,246,0.26)] sm:mt-5 sm:py-4 sm:text-base">${settings.access_button_text || 'Buka Halaman Login'}</a>
            </div>
            <div class="mt-6 hidden gap-3 sm:grid sm:grid-cols-2">
              <div class="rounded-[24px] border border-slate-200 bg-white p-4">
                <p class="text-xs font-bold uppercase tracking-[0.16em] text-black">Konten</p>
                <p class="mt-2 text-sm leading-6 text-black">Dokumen, RPP, materi, dan pengumuman.</p>
              </div>
              <div class="rounded-[24px] border border-slate-200 bg-white p-4">
                <p class="text-xs font-bold uppercase tracking-[0.16em] text-black">Publik</p>
                <p class="mt-2 text-sm leading-6 text-black">Ruang informasi sekolah.</p>
              </div>
            </div>
          </aside>
        </section>

        <section class="relative z-10 mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          ${activeSections.map((section, index) => {
            const previewLinks = getLobbySectionLinks(links, section.id).slice(0, 3);
            return `
              <a href="#lobi/${section.slug}" class="glass-panel card-rise flex h-full flex-col rounded-[30px] border border-white/45 bg-white/74 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.12)] ring-1 ring-white/18 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(15,23,42,0.16)]" style="animation-delay: ${index * 120}ms;">
                <div class="flex items-center justify-between gap-3">
                  <div class="h-2 w-24 rounded-full bg-gradient-to-r ${section.accent}"></div>
                  <span class="rounded-full border border-white/70 bg-white/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">${section.requires_token ? 'Token' : 'Publik'}</span>
                </div>
                <h3 class="mt-5 text-xl font-extrabold tracking-tight text-slate-900">${section.title}</h3>
                <p class="mt-3 overflow-hidden text-sm leading-6 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">${section.description}</p>
                <div class="mt-5 flex min-h-[170px] flex-1 flex-col space-y-2">
                  ${previewLinks.length ? previewLinks.map((item, itemIndex) => `<div class="rounded-2xl border border-slate-200/70 bg-white/85 px-4 py-3 text-sm text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"><p class="font-semibold">${itemIndex + 1}. ${item.title}</p></div>`).join('') : '<div class="flex flex-1 items-center rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-500">Belum ada tautan.</div>'}
                  ${previewLinks.length < 3 ? Array.from({ length: 3 - previewLinks.length }, () => '<div class="rounded-2xl border border-dashed border-white/55 bg-white/35 px-4 py-3 text-sm text-transparent select-none">.</div>').join('') : ''}
                </div>
                <div class="mt-5 flex items-center justify-between text-sm font-semibold text-slate-900">
                  <span>${section.requires_token ? 'Perlu token' : 'Akses langsung'}</span>
                  <span class="inline-flex items-center gap-2">Lihat Detail <span class="text-base leading-none">›</span></span>
                </div>
              </a>
            `;
          }).join('')}
        </section>

        <section class="relative z-10 mt-6 rounded-[34px] border border-white/35 bg-white/68 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.3em] text-sky-800">${settings.footer_label || 'Informasi Tambahan'}</p>
              <h3 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">${settings.footer_title || 'Tambahkan informasi sekolah di sini.'}</h3>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
