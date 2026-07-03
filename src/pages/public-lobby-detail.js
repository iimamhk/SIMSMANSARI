import { getLobbyPayload, getLobbySectionBySlug, getLobbySectionLinks, isLobbyTokenValid } from '../utils/lobby.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function getAccentClass(section) {
  return section?.accent || 'from-emerald-400 via-cyan-400 to-sky-400';
}

function getSectionAccessLabel(section) {
  return section?.requires_token ? 'Token' : 'Publik';
}

function renderSectionLinks(section, sectionLinks) {
  const theme = section?.display_theme || 'glass_cards';

  if (!sectionLinks.length) {
    return `
      <div class="glass-panel rounded-[28px] border border-white/40 bg-white/80 p-6 text-sm text-slate-600 shadow-[0_24px_90px_rgba(15,23,42,0.1)] ring-1 ring-white/22 backdrop-blur-xl md:col-span-2 xl:col-span-3">
        Belum ada tautan yang tersedia pada kategori ini.
      </div>
    `;
  }

  if (theme === 'outline_list') {
    return sectionLinks.map((item, index) => `
      <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="detail-card group glass-panel flex min-h-[148px] items-start gap-4 rounded-[24px] border border-white/50 bg-white/88 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white/96 hover:shadow-[0_24px_56px_rgba(15,23,42,0.14)] md:col-span-2 xl:col-span-3" style="animation-delay: ${index * 70}ms;">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r ${getAccentClass(section)} text-sm font-bold text-slate-950 shadow-[0_12px_24px_rgba(15,23,42,0.12)] transition duration-300 group-hover:scale-[1.06] group-hover:shadow-[0_16px_28px_rgba(15,23,42,0.16)]">${index + 1}</div>
        <div class="flex min-h-[108px] min-w-0 flex-1 flex-col justify-between">
          <div>
            <p class="text-lg font-bold leading-6 text-slate-900">${item.title}</p>
            <p class="mt-2 overflow-hidden text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">${item.description || 'Buka tautan ini.'}</p>
          </div>
          <span class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">Buka Tautan <span class="text-base leading-none">›</span></span>
        </div>
      </a>
    `).join('');
  }

  if (theme === 'compact_strips') {
    return sectionLinks.map((item, index) => `
      <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="detail-card group glass-panel flex min-h-[152px] flex-col rounded-[22px] border border-white/55 bg-white/90 px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/24 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)]" style="animation-delay: ${index * 70}ms;">
        <div class="flex flex-1 items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Link ${index + 1}</p>
            <p class="mt-2 text-base font-bold leading-6 text-slate-900">${item.title}</p>
            <p class="mt-2 overflow-hidden text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">${item.description || 'Buka tautan ini.'}</p>
          </div>
          <div class="mt-1 h-3 w-16 shrink-0 rounded-full bg-gradient-to-r ${getAccentClass(section)} transition duration-300 group-hover:w-20"></div>
        </div>
        <span class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">Buka Tautan <span class="text-base leading-none">›</span></span>
      </a>
    `).join('');
  }

  if (theme === 'poster_blocks') {
    return sectionLinks.map((item, index) => `
      <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="detail-card group flex min-h-[240px] flex-col overflow-hidden rounded-[30px] border border-white/40 bg-slate-950 text-white shadow-[0_24px_90px_rgba(15,23,42,0.16)] transition hover:-translate-y-1 hover:shadow-[0_32px_104px_rgba(15,23,42,0.24)]" style="animation-delay: ${index * 70}ms;">
        <div class="h-3 w-full bg-gradient-to-r ${getAccentClass(section)} transition duration-300 group-hover:h-4"></div>
        <div class="flex flex-1 flex-col p-5 sm:p-6">
          <p class="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Tautan ${index + 1}</p>
          <p class="mt-3 text-lg font-bold leading-7 text-white transition duration-300 group-hover:text-white sm:text-xl">${item.title}</p>
          <p class="mt-2 overflow-hidden text-sm leading-6 text-white/75 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">${item.description || 'Buka tautan ini.'}</p>
          <span class="mt-auto pt-6 inline-flex items-center gap-2 text-sm font-semibold text-white">Buka Tautan <span class="text-base leading-none">›</span></span>
        </div>
      </a>
    `).join('');
  }

  return sectionLinks.map((item, index) => `
    <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="detail-card group glass-panel flex min-h-[208px] flex-col rounded-[28px] border border-white/40 bg-white/82 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.1)] ring-1 ring-white/22 backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/70 hover:bg-white/92 hover:shadow-[0_30px_102px_rgba(15,23,42,0.16)]" style="animation-delay: ${index * 70}ms;">
      <div class="flex items-center justify-between gap-3">
        <div class="h-2 w-24 rounded-full bg-gradient-to-r ${getAccentClass(section)} transition duration-300 group-hover:w-28"></div>
        <span class="rounded-full border border-white/70 bg-white/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">${getSectionAccessLabel(section)}</span>
      </div>
      <p class="mt-5 text-lg font-bold leading-7 text-slate-900">${index + 1}. ${item.title}</p>
      <p class="mt-2 overflow-hidden text-sm leading-6 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">${item.description || 'Buka tautan ini.'}</p>
      <span class="mt-auto pt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">Buka Tautan <span class="text-base leading-none">›</span></span>
    </a>
  `).join('');
}

export async function renderPublicLobbyDetailPage(container, slug, forceAccess = false) {
  const { settings, sections, links } = await getLobbyPayload();
  const section = getLobbySectionBySlug(sections, slug);

  if (!section) {
    container.innerHTML = `
      <style>
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

      <div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.55),_transparent_38%),linear-gradient(145deg,_#10b981_0%,_#5eead4_28%,_#67e8f9_56%,_#93c5fd_76%,_#c4b5fd_100%)] px-4 py-6 text-slate-900 sm:py-8">
        <div class="mx-auto max-w-3xl">
          <div class="glass-panel rounded-[30px] border border-white/40 bg-white/80 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.12)] ring-1 ring-white/22 backdrop-blur-xl sm:rounded-[32px] sm:p-8">
            <p class="inline-flex items-center rounded-full border border-white/70 bg-white/76 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">Halaman Tidak Ditemukan</p>
            <h1 class="mt-4 text-3xl font-bold tracking-tight text-slate-900">Kategori lobi tidak tersedia.</h1>
            <p class="mt-3 max-w-xl text-sm leading-7 text-slate-700">Kategori yang Anda buka tidak ditemukan atau sudah tidak aktif pada lobi sekolah.</p>
            <div class="mt-6 flex flex-wrap gap-3">
              <a href="#home" class="inline-flex items-center justify-center rounded-2xl border border-white/70 bg-white/88 px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">Kembali ke Lobi</a>
              <a href="#login" class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(15,23,42,0.12)]">Buka Login</a>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const session = getSession();
  const dashboardRoute = session?.user?.role === 'admin'
    ? '#admin/dashboard'
    : session?.user?.role === 'guru'
      ? '#guru/dashboard'
      : session?.user?.role === 'siswa'
        ? '#siswa/dashboard'
        : '#login';
  const hasAccess = !section.requires_token || forceAccess;
  const sectionLinks = getLobbySectionLinks(links, section.id);

  container.innerHTML = `
    <style>
      @keyframes detail-card-enter {
        from {
          opacity: 0;
          transform: translate3d(0, 20px, 0) scale(0.985);
        }

        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
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

      .detail-card {
        animation: detail-card-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
        will-change: transform, opacity;
      }
    </style>

    <div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.55),_transparent_38%),linear-gradient(145deg,_#10b981_0%,_#5eead4_28%,_#67e8f9_56%,_#93c5fd_76%,_#c4b5fd_100%)] px-4 py-6 text-slate-900 sm:py-8">
      <div class="mx-auto max-w-5xl space-y-6">
        <header class="glass-panel rounded-[30px] border border-white/40 bg-white/78 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] ring-1 ring-white/22 backdrop-blur-xl sm:rounded-[32px] sm:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="inline-flex items-center rounded-full border border-white/70 bg-white/76 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">${settings.hero_title}</p>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                <h1 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">${section.title}</h1>
                <span class="rounded-full border border-white/70 bg-white/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">${getSectionAccessLabel(section)}</span>
              </div>
              <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-700">${section.description}</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <a href="#home" class="inline-flex items-center justify-center rounded-2xl border border-white/70 bg-white/88 px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">Kembali ke Lobi</a>
              ${session?.user?.role ? `<a href="${dashboardRoute}" class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(15,23,42,0.12)]">Masuk ke Dashboard</a>` : ''}
            </div>
          </div>
        </header>

        ${section.requires_token && !hasAccess ? `
          <section class="glass-panel rounded-[30px] border border-white/40 bg-white/82 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.12)] ring-1 ring-white/22 backdrop-blur-xl sm:rounded-[32px] sm:p-8">
            <div class="max-w-2xl">
              <p class="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Akses Terbatas</p>
              <h2 class="mt-3 text-2xl font-bold text-slate-900">Masukkan token untuk membuka halaman ini.</h2>
              <p class="mt-3 text-sm leading-7 text-slate-700">Halaman ini dibatasi oleh admin sekolah. Masukkan token yang diberikan untuk melihat daftar tautan.</p>
            </div>
            <form id="lobby-token-form" class="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
              <input id="lobby-access-token" class="w-full rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" placeholder="Masukkan token akses" required />
              <button type="submit" class="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(15,23,42,0.12)]">Buka Halaman</button>
            </form>
            <p id="lobby-token-message" class="mt-3 text-sm text-slate-600"></p>
          </section>
        ` : `
          <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            ${renderSectionLinks(section, sectionLinks)}
          </section>
        `}
      </div>
    </div>
  `;

  const tokenForm = container.querySelector('#lobby-token-form');
  tokenForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tokenInput = container.querySelector('#lobby-access-token');
    const messageEl = container.querySelector('#lobby-token-message');
    const tokenValue = tokenInput?.value || '';
    if (!isLobbyTokenValid(section, tokenValue)) {
      if (messageEl) {
        messageEl.textContent = 'Token tidak sesuai.';
        messageEl.className = 'mt-3 text-sm text-rose-600';
      }
      return;
    }
    await renderPublicLobbyDetailPage(container, slug, true);
  });
}
