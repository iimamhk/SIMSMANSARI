import { getLobbyPayload, getLobbySectionBySlug, getLobbySectionLinks, isLobbyTokenValid } from '../utils/lobby.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

/** Escape teks dinamis (dari admin/Firestore) sebelum masuk HTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Atribut aman untuk URL: hanya http(s) & anchor internal; sisanya diabaikan. */
function safeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '#';
  if (value.startsWith('#') || /^https?:\/\//i.test(value)) return value;
  return '#';
}

function isExternal(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

/** Tebak jenis dokumen dari URL untuk memberi ikon & label yang relevan. */
function linkKind(url) {
  const u = String(url || '').toLowerCase();
  if (/docs\.google\.com\/document|\.docx?(\?|$)/.test(u)) return 'doc';
  if (/docs\.google\.com\/spreadsheets|\.xlsx?(\?|$)|sheets/.test(u)) return 'sheet';
  if (/\.pdf(\?|$)/.test(u)) return 'pdf';
  if (/drive\.google\.com|dropbox|onedrive/.test(u)) return 'drive';
  if (/docs\.google\.com\/forms|forms\.gle/.test(u)) return 'form';
  if (/youtube\.com|youtu\.be|vimeo/.test(u)) return 'video';
  if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/.test(u)) return 'image';
  return 'link';
}

const KIND_META = {
  doc: { label: 'Dokumen', cls: 'text-blue-600 bg-blue-50 ring-blue-100', icon: '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>' },
  sheet: { label: 'Spreadsheet', cls: 'text-emerald-600 bg-emerald-50 ring-emerald-100', icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>' },
  pdf: { label: 'PDF', cls: 'text-rose-600 bg-rose-50 ring-rose-100', icon: '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M8.5 15.5h1a1.5 1.5 0 0 0 0-3h-1zM14 12.5v3M14 12.5h1.6"/>' },
  drive: { label: 'Drive', cls: 'text-amber-600 bg-amber-50 ring-amber-100', icon: '<path d="M8 3h8l5 9-4 7H7l-4-7z"/><path d="M8 3l4 9M16 3l-4 9M3.5 12h17"/>' },
  form: { label: 'Formulir', cls: 'text-violet-600 bg-violet-50 ring-violet-100', icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
  video: { label: 'Video', cls: 'text-rose-600 bg-rose-50 ring-rose-100', icon: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>' },
  image: { label: 'Gambar', cls: 'text-sky-600 bg-sky-50 ring-sky-100', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6"/>' },
  link: { label: 'Tautan', cls: 'text-slate-600 bg-slate-100 ring-slate-200', icon: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>' },
};

function kindIcon(kind) {
  const meta = KIND_META[kind] || KIND_META.link;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">${meta.icon}</svg>`;
}

function renderLinkCard(item, index) {
  const url = safeUrl(item.url);
  const external = isExternal(url);
  const kind = linkKind(item.url);
  const meta = KIND_META[kind] || KIND_META.link;
  const target = external ? 'target="_blank" rel="noopener noreferrer"' : '';
  return `
    <a href="${esc(url)}" ${target} data-reveal
       class="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_20px_44px_-28px_rgba(37,99,235,0.4)]"
       style="transition-delay:${Math.min(index, 8) * 45}ms">
      <span class="inline-flex h-12 w-12 flex-none items-center justify-center rounded-xl ring-1 ${meta.cls}">${kindIcon(kind)}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="truncate text-[15px] font-semibold text-slate-900">${esc(item.title)}</span>
          <span class="hidden flex-none rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200 sm:inline">${esc(meta.label)}</span>
        </span>
        <span class="mt-1 block truncate text-sm text-slate-500">${esc(item.description || (external ? 'Buka tautan eksternal' : 'Buka tautan'))}</span>
      </span>
      <span class="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-200 transition group-hover:bg-blue-600 group-hover:text-white group-hover:ring-blue-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          ${external ? '<path d="M7 17L17 7M9 7h8v8"/>' : '<path d="M5 12h14M13 6l6 6-6 6"/>'}
        </svg>
      </span>
    </a>
  `;
}

function pageShell(inner) {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      .lp { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#ffffff; color:#0f172a; -webkit-font-smoothing:antialiased; }
      .lp *::selection { background:rgba(37,99,235,.18); }
      .lp-mesh { background:
        radial-gradient(55% 55% at 12% 0%, rgba(59,130,246,.10), transparent 60%),
        radial-gradient(45% 45% at 92% 8%, rgba(99,102,241,.10), transparent 60%); }
      .lp-grid-lines { background-image:linear-gradient(rgba(15,23,42,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.04) 1px, transparent 1px); background-size:44px 44px; -webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 0%, #000 40%, transparent 100%); mask-image:radial-gradient(ellipse 80% 70% at 50% 0%, #000 40%, transparent 100%); }
      .lp-btn { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; height:44px; padding:0 1.25rem; border-radius:14px; font-size:.875rem; font-weight:600; transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease, background .18s ease; }
      .lp-btn:active { transform:translateY(0) scale(.98); }
      .lp-btn-primary { background:linear-gradient(180deg,#3b82f6,#2563eb); color:#fff; box-shadow:0 10px 24px -10px rgba(37,99,235,.7), inset 0 1px 0 rgba(255,255,255,.25); }
      .lp-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 32px -12px rgba(37,99,235,.75); }
      .lp-btn-ghost { background:#fff; color:#1e293b; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(15,23,42,.04); }
      .lp-btn-ghost:hover { transform:translateY(-2px); border-color:#cbd5e1; box-shadow:0 12px 24px -16px rgba(15,23,42,.3); }
      .lp-btn:focus-visible, .lp a:focus-visible, .lp input:focus-visible { outline:3px solid rgba(37,99,235,.4); outline-offset:2px; }
      [data-reveal] { opacity:0; transform:translateY(18px); transition:opacity .6s cubic-bezier(.22,1,.36,1), transform .6s cubic-bezier(.22,1,.36,1); will-change:opacity,transform; }
      [data-reveal].is-in { opacity:1; transform:none; }
      .lp-pin-input { width:3.4rem; height:4rem; border-radius:16px; border:1.5px solid #e2e8f0; background:#fff; text-align:center; font-size:1.6rem; font-weight:700; color:#0f172a; box-shadow:0 1px 2px rgba(15,23,42,.05); transition:border-color .15s ease, box-shadow .15s ease, transform .15s ease; caret-color:#2563eb; }
      .lp-pin-input:focus { outline:none; border-color:#2563eb; box-shadow:0 0 0 4px rgba(37,99,235,.15); transform:translateY(-1px); }
      .lp-pin-input.is-filled { border-color:#93c5fd; background:#f8faff; }
      .lp-shake { animation:lpShake .4s cubic-bezier(.36,.07,.19,.97); }
      @keyframes lpShake { 10%,90%{transform:translateX(-1px)} 20%,80%{transform:translateX(2px)} 30%,50%,70%{transform:translateX(-4px)} 40%,60%{transform:translateX(4px)} }
      @media (prefers-reduced-motion: reduce) { [data-reveal]{opacity:1;transform:none;transition:none} .lp-shake{animation:none} }
    </style>
    <div class="lp min-h-screen">${inner}</div>
  `;
}

function attachReveal(container) {
  const targets = container.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && targets.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => io.observe(el));
  } else {
    targets.forEach((el) => el.classList.add('is-in'));
  }
}

export async function renderPublicLobbyDetailPage(container, slug, forceAccess = false) {
  const { settings, sections, links } = await getLobbyPayload();
  const section = getLobbySectionBySlug(sections, slug);
  const brand = esc(settings.hero_title || 'SIMSMANSARI');
  const schoolName = esc(settings.school_name || 'SMA Negeri 1 Wanasari');

  // --- Halaman tidak ditemukan ---
  if (!section) {
    container.innerHTML = pageShell(`
      <div class="relative overflow-hidden lp-mesh">
        <div class="pointer-events-none absolute inset-0 lp-grid-lines"></div>
        <div class="relative mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
          <span class="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
          </span>
          <h1 class="mt-6 text-2xl font-bold tracking-tight text-slate-900">Kategori tidak ditemukan</h1>
          <p class="mt-3 text-sm leading-7 text-slate-500">Halaman yang Anda buka tidak tersedia atau sudah tidak aktif pada portal ${brand}.</p>
          <div class="mt-8 flex gap-3">
            <a href="#home" class="lp-btn lp-btn-ghost">Kembali ke Beranda</a>
            <a href="#login" class="lp-btn lp-btn-primary">Masuk</a>
          </div>
        </div>
      </div>
    `);
    return;
  }

  const session = getSession();
  const role = session?.user?.role || '';
  const dashboardRoute = role === 'admin' ? '#admin/dashboard'
    : role === 'guru' ? '#guru/dashboard'
    : role === 'siswa' ? '#siswa/dashboard' : '#login';
  const hasAccess = !section.requires_token || forceAccess;
  const sectionLinks = getLobbySectionLinks(links, section.id);
  const accessLabel = section.requires_token ? 'Terkunci PIN' : 'Akses publik';

  const navbar = `
    <header class="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav class="mx-auto flex max-w-4xl items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2.5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <a href="#home" class="flex items-center gap-2.5">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-[12px] font-bold text-white">${brand.slice(0, 2).toUpperCase()}</span>
          <span class="flex flex-col leading-none">
            <span class="text-sm font-bold tracking-tight text-slate-900">${brand}</span>
            <span class="mt-0.5 hidden text-[11px] font-medium text-slate-500 sm:block">${schoolName}</span>
          </span>
        </a>
        <div class="flex items-center gap-2">
          <a href="#home" class="lp-btn lp-btn-ghost" style="height:38px;padding:0 .9rem">Beranda</a>
          ${role ? `<a href="${dashboardRoute}" class="lp-btn lp-btn-primary" style="height:38px;padding:0 .9rem">Dashboard</a>` : `<a href="#login" class="lp-btn lp-btn-primary" style="height:38px;padding:0 .9rem">Masuk</a>`}
        </div>
      </nav>
    </header>
  `;

  const header = `
    <section class="relative overflow-hidden lp-mesh">
      <div class="pointer-events-none absolute inset-0 lp-grid-lines"></div>
      <div class="relative mx-auto max-w-4xl px-5 pb-8 pt-10 sm:px-6 sm:pt-14">
        <a href="#home" data-reveal class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
          Portal Sekolah
        </a>
        <div class="mt-5 flex items-start gap-4">
          <span class="inline-flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_16px_32px_-16px_rgba(37,99,235,0.8)]" data-reveal>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="h-7 w-7"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M14 3v6h6"/></svg>
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2" data-reveal>
              <h1 class="text-3xl font-extrabold tracking-[-0.02em] text-slate-900 sm:text-4xl">${esc(section.title)}</h1>
              <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${section.requires_token ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">${section.requires_token ? '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>' : '<path d="M20 6L9 17l-5-5"/>'}</svg>
                ${esc(accessLabel)}
              </span>
            </div>
            <p class="mt-3 max-w-2xl text-base leading-7 text-slate-600" data-reveal>${esc(section.description || 'Kumpulan tautan dan dokumen penting sekolah.')}</p>
          </div>
        </div>
      </div>
    </section>
  `;

  // Gerbang PIN kotak hanya untuk token PIN pendek (4-8 digit angka). Token
  // alfanumerik/panjang (mis. "RPP2026") tetap memakai input tunggal agar
  // kompatibel dengan data lama.
  const tokenStr = String(section.access_token || '');
  const usePinBoxes = /^\d{4,8}$/.test(tokenStr);
  const pinLen = usePinBoxes ? tokenStr.length : 0;

  let body = '';
  if (section.requires_token && !hasAccess) {
    const gateInner = usePinBoxes
      ? `<div id="lobby-pin-boxes" class="flex justify-center gap-2 sm:gap-2.5" role="group" aria-label="PIN akses">
          ${Array.from({ length: pinLen }, (_, i) => `<input inputmode="numeric" autocomplete="off" maxlength="1" aria-label="Digit ${i + 1}" class="lp-pin-input" data-pin-index="${i}" ${i === 0 ? 'autofocus' : ''} />`).join('')}
        </div>
        <input type="hidden" id="lobby-access-token" />`
      : `<input id="lobby-access-token" type="password" autocomplete="off" autofocus
            class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-center text-base font-semibold tracking-[0.2em] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,.05)] focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15"
            placeholder="Masukkan kode akses" />`;
    body = `
      <section class="mx-auto max-w-md px-5 pb-20 sm:px-6">
        <div data-reveal class="rounded-[28px] border border-slate-200/80 bg-white p-7 text-center shadow-[0_30px_60px_-40px_rgba(15,23,42,0.4)] sm:p-9">
          <span class="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="h-7 w-7"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2"/></svg>
          </span>
          <h2 class="mt-5 text-xl font-bold tracking-tight text-slate-900">Halaman terlindungi ${usePinBoxes ? 'PIN' : 'kode akses'}</h2>
          <p class="mt-2 text-sm leading-6 text-slate-500">Masukkan ${usePinBoxes ? 'PIN' : 'kode akses'} yang diberikan admin untuk membuka kumpulan tautan ini.</p>
          <form id="lobby-token-form" class="mt-7">
            ${gateInner}
            <p id="lobby-token-message" class="mt-4 min-h-[1.25rem] text-sm font-medium text-rose-600" role="status"></p>
            <button type="submit" class="lp-btn lp-btn-primary mt-2 w-full">Buka Halaman</button>
            ${usePinBoxes ? '<button type="button" id="lobby-pin-clear" class="mt-3 text-xs font-medium text-slate-400 transition hover:text-slate-600">Bersihkan</button>' : ''}
          </form>
        </div>
      </section>
    `;
  } else {
    const count = sectionLinks.length;
    body = `
      <section class="mx-auto max-w-4xl px-5 pb-20 sm:px-6">
        <div class="mb-4 flex items-center justify-between" data-reveal>
          <p class="text-sm font-medium text-slate-500">${count} tautan tersedia</p>
        </div>
        ${count ? `<div class="grid gap-3">${sectionLinks.map((item, i) => renderLinkCard(item, i)).join('')}</div>` : `
          <div data-reveal class="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
            <span class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-300 ring-1 ring-slate-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>
            </span>
            <p class="text-sm font-semibold text-slate-700">Belum ada tautan</p>
            <p class="text-xs text-slate-500">Admin belum menambahkan tautan pada kategori ini.</p>
          </div>
        `}
      </section>
    `;
  }

  container.innerHTML = pageShell(navbar + header + body);
  attachReveal(container);

  // --- Interaksi gerbang akses ---
  const tokenForm = container.querySelector('#lobby-token-form');
  if (tokenForm) {
    const boxes = Array.from(container.querySelectorAll('[data-pin-index]'));
    const hidden = container.querySelector('#lobby-access-token');
    const messageEl = container.querySelector('#lobby-token-message');
    const boxRow = container.querySelector('#lobby-pin-boxes');
    const usesBoxes = boxes.length > 0;

    const collect = () => (usesBoxes ? boxes.map((b) => b.value).join('') : String(hidden?.value || ''));
    const syncHidden = () => { if (hidden && usesBoxes) hidden.value = collect(); };

    const failFeedback = () => {
      if (messageEl) messageEl.textContent = usesBoxes ? 'PIN tidak sesuai. Coba lagi.' : 'Kode akses tidak sesuai.';
      if (boxRow) {
        boxRow.classList.remove('lp-shake');
        void boxRow.offsetWidth; // reflow untuk restart animasi
        boxRow.classList.add('lp-shake');
      }
      if (usesBoxes) {
        boxes.forEach((b) => { b.value = ''; b.classList.remove('is-filled'); });
        syncHidden();
        boxes[0].focus();
      }
    };

    if (usesBoxes) {
      const tryAutoSubmit = () => { if (collect().length === boxes.length) tokenForm.requestSubmit(); };
      boxes.forEach((box, i) => {
        box.addEventListener('input', () => {
          box.value = box.value.replace(/\s/g, '').slice(0, 1);
          box.classList.toggle('is-filled', Boolean(box.value));
          if (messageEl) messageEl.textContent = '';
          syncHidden();
          if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
          tryAutoSubmit();
        });
        box.addEventListener('keydown', (event) => {
          if (event.key === 'Backspace' && !box.value && i > 0) {
            boxes[i - 1].focus();
            boxes[i - 1].value = '';
            boxes[i - 1].classList.remove('is-filled');
            syncHidden();
          }
          if (event.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
          if (event.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
        });
        box.addEventListener('paste', (event) => {
          event.preventDefault();
          const text = (event.clipboardData?.getData('text') || '').replace(/\s/g, '');
          if (!text) return;
          boxes.forEach((b, j) => {
            b.value = text[j] || '';
            b.classList.toggle('is-filled', Boolean(b.value));
          });
          syncHidden();
          boxes[Math.min(text.length, boxes.length - 1)].focus();
          tryAutoSubmit();
        });
      });

      container.querySelector('#lobby-pin-clear')?.addEventListener('click', () => {
        boxes.forEach((b) => { b.value = ''; b.classList.remove('is-filled'); });
        syncHidden();
        if (messageEl) messageEl.textContent = '';
        boxes[0].focus();
      });
    } else if (hidden) {
      hidden.addEventListener('input', () => { if (messageEl) messageEl.textContent = ''; });
    }

    tokenForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const tokenValue = collect();
      if (!isLobbyTokenValid(section, tokenValue)) {
        failFeedback();
        return;
      }
      await renderPublicLobbyDetailPage(container, slug, true);
    });
  }
}
