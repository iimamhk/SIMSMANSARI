import { getLobbyPayload, getLobbySectionBySlug, getLobbySectionLinks, isLobbyTokenValid } from '../utils/lobby.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function getAccessKey(slug) {
  return `simguru_lobby_access_${slug}`;
}

function getAccentClass(section) {
  return section?.accent || 'from-emerald-400 via-cyan-400 to-sky-400';
}

function renderSectionLinks(section, sectionLinks) {
  const theme = section?.display_theme || 'glass_cards';

  if (!sectionLinks.length) {
    return `
      <div class="rounded-[28px] border border-white/35 bg-white/82 p-6 text-sm text-slate-600 shadow-[0_24px_90px_rgba(15,23,42,0.1)] backdrop-blur-xl md:col-span-2 xl:col-span-3">
        Belum ada tautan yang tersedia pada kategori ini.
      </div>
    `;
  }

  if (theme === 'outline_list') {
    return sectionLinks.map((item, index) => `
      <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="group flex items-start gap-4 rounded-[24px] border-2 border-slate-200 bg-white p-5 transition hover:border-slate-900 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:col-span-2 xl:col-span-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r ${getAccentClass(section)} text-sm font-bold text-slate-950">${index + 1}</div>
        <div class="min-w-0 flex-1">
          <p class="text-lg font-bold text-slate-900">${item.title}</p>
          <p class="mt-1 text-sm leading-6 text-slate-600">${item.description || 'Buka tautan ini.'}</p>
          <span class="mt-3 inline-flex text-sm font-semibold text-slate-900">Buka Tautan</span>
        </div>
      </a>
    `).join('');
  }

  if (theme === 'compact_strips') {
    return sectionLinks.map((item, index) => `
      <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="group rounded-[22px] border border-slate-200 bg-white/92 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Link ${index + 1}</p>
            <p class="mt-2 text-base font-bold text-slate-900">${item.title}</p>
            <p class="mt-1 text-sm leading-6 text-slate-600">${item.description || 'Buka tautan ini.'}</p>
          </div>
          <div class="mt-1 h-3 w-16 rounded-full bg-gradient-to-r ${getAccentClass(section)}"></div>
        </div>
      </a>
    `).join('');
  }

  if (theme === 'poster_blocks') {
    return sectionLinks.map((item, index) => `
      <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="group overflow-hidden rounded-[30px] border border-white/40 bg-slate-950 text-white shadow-[0_24px_90px_rgba(15,23,42,0.16)] transition hover:-translate-y-1 hover:shadow-[0_28px_96px_rgba(15,23,42,0.2)]">
        <div class="h-3 w-full bg-gradient-to-r ${getAccentClass(section)}"></div>
        <div class="p-5">
          <p class="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Tautan ${index + 1}</p>
          <p class="mt-3 text-xl font-bold text-white">${item.title}</p>
          <p class="mt-2 text-sm leading-6 text-white/75">${item.description || 'Buka tautan ini.'}</p>
          <span class="mt-5 inline-flex text-sm font-semibold text-white">Buka Tautan</span>
        </div>
      </a>
    `).join('');
  }

  return sectionLinks.map((item, index) => `
    <a href="${item.url || '#'}" ${item.url && !item.url.startsWith('#') ? 'target="_blank" rel="noopener noreferrer"' : ''} class="group rounded-[28px] border border-white/35 bg-white/82 p-5 shadow-[0_24px_90px_rgba(15,23,42,0.1)] backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-[0_28px_96px_rgba(15,23,42,0.14)]">
      <div class="h-2 w-24 rounded-full bg-gradient-to-r ${getAccentClass(section)}"></div>
      <p class="mt-5 text-lg font-bold text-slate-900">${index + 1}. ${item.title}</p>
      <p class="mt-2 text-sm leading-6 text-slate-700">${item.description || 'Buka tautan ini.'}</p>
      <span class="mt-5 inline-flex text-sm font-semibold text-slate-900">Buka Tautan</span>
    </a>
  `).join('');
}

export async function renderPublicLobbyDetailPage(container, slug) {
  const { settings, sections, links } = await getLobbyPayload();
  const section = getLobbySectionBySlug(sections, slug);

  if (!section) {
    container.innerHTML = `
      <div class="min-h-screen bg-[linear-gradient(145deg,_#10b981_0%,_#5eead4_28%,_#67e8f9_56%,_#93c5fd_76%,_#c4b5fd_100%)] px-4 py-8 text-slate-900">
        <div class="mx-auto max-w-3xl rounded-[32px] border border-white/35 bg-white/80 p-8 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <p class="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Halaman Tidak Ditemukan</p>
          <h1 class="mt-3 text-3xl font-bold text-slate-900">Kategori lobi tidak tersedia.</h1>
          <a href="#home" class="mt-6 inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Kembali ke Lobi</a>
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
  const accessKey = getAccessKey(slug);
  const grantedToken = sessionStorage.getItem(accessKey) || '';
  const hasAccess = isLobbyTokenValid(section, grantedToken);
  const sectionLinks = getLobbySectionLinks(links, section.id);

  container.innerHTML = `
    <div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.55),_transparent_38%),linear-gradient(145deg,_#10b981_0%,_#5eead4_28%,_#67e8f9_56%,_#93c5fd_76%,_#c4b5fd_100%)] px-4 py-8 text-slate-900">
      <div class="mx-auto max-w-5xl space-y-6">
        <header class="rounded-[32px] border border-white/35 bg-white/78 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">${settings.hero_title}</p>
              <h1 class="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">${section.title}</h1>
              <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-700">${section.description}</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <a href="#home" class="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm">Kembali ke Lobi</a>
              ${session?.user?.role ? `<a href="${dashboardRoute}" class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm">Masuk ke Dashboard</a>` : ''}
            </div>
          </div>
        </header>

        ${section.requires_token && !hasAccess ? `
          <section class="rounded-[32px] border border-white/35 bg-white/82 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8">
            <div class="max-w-2xl">
              <p class="text-xs font-bold uppercase tracking-[0.3em] text-slate-500">Akses Terbatas</p>
              <h2 class="mt-3 text-2xl font-bold text-slate-900">Masukkan token untuk membuka halaman ini.</h2>
              <p class="mt-3 text-sm leading-7 text-slate-700">Halaman ini dibatasi oleh admin sekolah. Masukkan token yang diberikan untuk melihat daftar tautan.</p>
            </div>
            <form id="lobby-token-form" class="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
              <input id="lobby-access-token" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" placeholder="Masukkan token akses" required />
              <button type="submit" class="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">Buka Halaman</button>
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
    sessionStorage.setItem(accessKey, tokenValue);
    await renderPublicLobbyDetailPage(container, slug);
  });
}
