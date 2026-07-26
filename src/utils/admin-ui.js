/**
 * Admin design system — fresh SaaS palette (cyan / sky / teal / soft violet)
 * Avoid heavy black-green gradients. Prefer airy, bright, high-clarity surfaces.
 */

export const adminTheme = {
  accent: 'from-cyan-400 via-sky-400 to-teal-400',
  accentSoft: 'from-cyan-50 via-sky-50 to-teal-50',
  accentText: 'text-sky-700',
  hero: 'from-[#0f766e] via-[#0891b2] to-[#0ea5e9]',
  heroPanel: 'from-white/25 via-white/10 to-white/5',
  primaryBtn: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white',
  secondaryBtn: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  dangerBtn: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100 hover:bg-rose-100',
  ghostBtn: 'border border-slate-200 bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900',
  card: 'rounded-2xl border border-slate-200 bg-white shadow-sm',
  softCard: 'rounded-2xl border border-slate-200 bg-slate-50',
  input: 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100',
  label: 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500',
  tableWrap: 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
  th: 'px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400',
  td: 'px-3 py-3 text-sm text-slate-600',
  badgeLive: 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100',
  badgeMuted: 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200',
  badgeWarn: 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100',
};

export function adminIcon(paths, className = 'h-5 w-5') {
  return `<svg viewBox="0 0 24 24" class="${className}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const adminIcons = {
  calendar: adminIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  users: adminIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  book: adminIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  building: adminIcon('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>'),
  link: adminIcon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  shield: adminIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  spark: adminIcon('<path d="m12 3 1.9 5.8L20 10.7l-4.8 1.9L12 18.5l-1.9-5.9L5 10.7l6.1-1.9L12 3z"/>'),
  check: adminIcon('<path d="M20 6 9 17l-5-5"/>', 'h-4 w-4'),
  alert: adminIcon('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>', 'h-4 w-4'),
  arrow: adminIcon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', 'h-4 w-4'),
  plus: adminIcon('<path d="M12 5v14"/><path d="M5 12h14"/>', 'h-4 w-4'),
  upload: adminIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>', 'h-4 w-4'),
  download: adminIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>', 'h-4 w-4'),
  search: adminIcon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 'h-4 w-4'),
  settings: adminIcon('<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 'h-4 w-4'),
  school: adminIcon('<path d="m4 10 8-6 8 6"/><path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/><path d="M10 20v-5h4v5"/>'),
};

export function adminPageHero({
  eyebrow = 'Admin Console',
  title = '',
  description = '',
  chips = [],
  actions = '',
  stats = [],
} = {}) {
  const chipHtml = chips
    .map((chip) => `<span class="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">${chip}</span>`)
    .join('');
  const statsHtml = stats.length
    ? `<div class="mt-5 grid gap-2 sm:grid-cols-${Math.min(stats.length, 3)}">${stats.map((item) => `
        <div class="rounded-2xl border border-white/25 bg-white/15 px-3 py-3 backdrop-blur-md">
          <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">${item.label}</p>
          <p class="mt-1 text-xl font-bold text-white">${item.value}</p>
        </div>
      `).join('')}</div>`
    : '';

  return `
    <section class="relative overflow-hidden rounded-2xl bg-gradient-to-br ${adminTheme.hero} p-6 text-white sm:p-8">
      <div class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl"></div>
      <div class="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-teal-300/20 blur-3xl"></div>
      <div class="relative grid gap-5 lg:grid-cols-[1.4fr_auto] lg:items-end">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">${eyebrow}</p>
          <h2 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">${title}</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-white/90">${description}</p>
          ${chipHtml ? `<div class="mt-4 flex flex-wrap gap-2">${chipHtml}</div>` : ''}
          ${statsHtml}
        </div>
        ${actions ? `<div class="flex flex-wrap gap-2 lg:justify-end">${actions}</div>` : ''}
      </div>
    </section>
  `;
}

export function adminMetricCard({ label, value, hint = '', icon = adminIcons.spark, tone = 'sky' } = {}) {
  const tones = {
    sky: 'bg-sky-50 text-sky-600',
    teal: 'bg-teal-50 text-teal-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return `
    <article class="${adminTheme.card} p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">${label}</p>
          <p class="mt-2 text-2xl font-bold tracking-tight text-slate-900">${value}</p>
          ${hint ? `<p class="mt-1 text-xs text-slate-500">${hint}</p>` : ''}
        </div>
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.sky}">
          ${icon}
        </div>
      </div>
    </article>
  `;
}

export function adminSection({ title, description = '', badge = '', actions = '', body = '', className = '' } = {}) {
  return `
    <section class="${adminTheme.card} p-4 sm:p-5 ${className}">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base font-semibold text-slate-900 sm:text-lg">${title}</h3>
            ${badge ? `<span class="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 ring-1 ring-sky-100">${badge}</span>` : ''}
          </div>
          ${description ? `<p class="mt-1 text-sm leading-6 text-slate-500">${description}</p>` : ''}
        </div>
        ${actions ? `<div class="flex flex-wrap gap-2">${actions}</div>` : ''}
      </div>
      <div class="mt-4">${body}</div>
    </section>
  `;
}

export function adminButton({ label, type = 'button', id = '', variant = 'primary', extraClass = '', attrs = '' } = {}) {
  const variants = {
    primary: adminTheme.primaryBtn,
    secondary: adminTheme.secondaryBtn,
    danger: adminTheme.dangerBtn,
    ghost: adminTheme.ghostBtn,
  };
  return `<button ${id ? `id="${id}"` : ''} type="${type}" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 ${variants[variant] || variants.primary} ${extraClass}" ${attrs}>${label}</button>`;
}

export function adminEmptyState({ title = 'Belum ada data', description = '', action = '' } = {}) {
  return `
    <div class="rounded-[24px] border border-dashed border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-cyan-50/50 px-6 py-10 text-center">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">${adminIcons.spark}</div>
      <p class="mt-3 text-sm font-semibold text-slate-800">${title}</p>
      ${description ? `<p class="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">${description}</p>` : ''}
      ${action ? `<div class="mt-4 flex justify-center">${action}</div>` : ''}
    </div>
  `;
}

export function adminNotice({ text = '', tone = 'info' } = {}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  return `<div class="rounded-2xl border px-3 py-2.5 text-xs leading-5 ${tones[tone] || tones.info}">${text}</div>`;
}

export function adminTable({ headers = [], rowsHtml = '', emptyColspan = 1, emptyText = 'Belum ada data.' } = {}) {
  const head = headers.map((h) => `<th class="${adminTheme.th}">${h}</th>`).join('');
  return `
    <div class="${adminTheme.tableWrap}">
      <div class="overflow-x-auto">
        <table class="min-w-full text-left">
          <thead class="bg-gradient-to-r from-slate-50 via-sky-50/40 to-cyan-50/30">
            <tr>${head}</tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rowsHtml || `<tr><td colspan="${emptyColspan}" class="px-4 py-8 text-center text-sm text-slate-500">${emptyText}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindAdminLogout(container) {
  container.querySelector('#logout-btn')?.addEventListener('click', async () => {
    try {
      await window.firebaseAuth?.signOut?.();
    } catch {
      // ignore
    }
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}

export function adminAccentPanel() {
  return adminTheme.accent;
}
