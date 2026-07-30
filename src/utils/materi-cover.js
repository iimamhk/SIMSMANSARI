/**
 * Desain cover materi bergaya editorial/Canva.
 *
 * Cover dibuat sepenuhnya dari CSS + SVG inline sehingga:
 * - tidak ada aset gambar yang perlu diunduh,
 * - tidak ada tambahan read Firestore,
 * - hasilnya deterministik (materi yang sama selalu tampil sama).
 *
 * Palet dipilih dari mata pelajaran; pola dekoratif dipilih dari hash ID materi
 * sehingga dua materi pada mapel yang sama tetap terlihat berbeda.
 */

const PALETTES = {
  matematika: { from: '#1d4ed8', to: '#0ea5e9', accent: '#fbbf24', ink: '#e0f2fe', symbol: '∑' },
  bindo: { from: '#be123c', to: '#f97316', accent: '#fde047', ink: '#fff1f2', symbol: 'Aa' },
  bing: { from: '#4338ca', to: '#a855f7', accent: '#22d3ee', ink: '#f5f3ff', symbol: 'EN' },
  fisika: { from: '#0f172a', to: '#475569', accent: '#38bdf8', ink: '#e2e8f0', symbol: 'Fx' },
  kimia: { from: '#047857', to: '#22d3ee', accent: '#fcd34d', ink: '#ecfeff', symbol: 'H₂O' },
  biologi: { from: '#15803d', to: '#84cc16', accent: '#fde047', ink: '#f0fdf4', symbol: 'DNA' },
  sejarah: { from: '#92400e', to: '#f59e0b', accent: '#fef3c7', ink: '#fffbeb', symbol: '⌛' },
  geografi: { from: '#0e7490', to: '#14b8a6', accent: '#fbbf24', ink: '#ecfeff', symbol: '◔' },
  informatika: { from: '#1e1b4b', to: '#6366f1', accent: '#34d399', ink: '#eef2ff', symbol: '</>' },
  agama: { from: '#065f46', to: '#10b981', accent: '#fcd34d', ink: '#ecfdf5', symbol: '✦' },
  pkn: { from: '#991b1b', to: '#dc2626', accent: '#fef08a', ink: '#fef2f2', symbol: '★' },
  seni: { from: '#9d174d', to: '#ec4899', accent: '#fde047', ink: '#fdf2f8', symbol: '◆' },
  olahraga: { from: '#c2410c', to: '#fb923c', accent: '#4ade80', ink: '#fff7ed', symbol: '◉' },
  ekonomi: { from: '#115e59', to: '#0d9488', accent: '#fbbf24', ink: '#f0fdfa', symbol: '₹' },
};

// Palet cadangan untuk mapel yang tidak dikenali.
const FALLBACK_PALETTES = [
  { from: '#1e40af', to: '#3b82f6', accent: '#fbbf24', ink: '#dbeafe', symbol: '◆' },
  { from: '#7c2d12', to: '#ea580c', accent: '#fde047', ink: '#fff7ed', symbol: '✦' },
  { from: '#134e4a', to: '#14b8a6', accent: '#fcd34d', ink: '#f0fdfa', symbol: '○' },
  { from: '#581c87', to: '#a855f7', accent: '#22d3ee', ink: '#faf5ff', symbol: '◇' },
  { from: '#831843', to: '#ec4899', accent: '#fef08a', ink: '#fdf2f8', symbol: '❋' },
  { from: '#0c4a6e', to: '#0ea5e9', accent: '#a3e635', ink: '#f0f9ff', symbol: '⌁' },
];

const SUBJECT_MATCHERS = [
  [/matematika|matematik/, 'matematika'],
  [/bahasa\s*indonesia|b\.?\s*indo/, 'bindo'],
  [/bahasa\s*inggris|b\.?\s*ing|english/, 'bing'],
  [/fisika/, 'fisika'],
  [/kimia/, 'kimia'],
  [/biologi|ipa\s*biologi/, 'biologi'],
  [/sejarah/, 'sejarah'],
  [/geografi/, 'geografi'],
  [/informatika|tik|komputer|coding/, 'informatika'],
  [/agama|pai|akidah/, 'agama'],
  [/pkn|pancasila|kewarganegaraan/, 'pkn'],
  [/seni|budaya|musik|rupa/, 'seni'],
  [/olahraga|pjok|penjas|jasmani/, 'olahraga'],
  [/ekonomi|akuntansi|bisnis/, 'ekonomi'],
];

// Arah seni dekoratif. Setiap pola menggambar lapisan SVG di belakang teks.
const PATTERNS = ['arcs', 'blob', 'grid', 'waves', 'diagonal', 'frame', 'confetti', 'halftone'];

function hashString(value) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 1000003;
  }
  return hash;
}

function resolvePalette(subject) {
  const normalized = String(subject || '').toLowerCase();
  const matched = SUBJECT_MATCHERS.find(([pattern]) => pattern.test(normalized));
  if (matched) return PALETTES[matched[1]];
  return null;
}

/**
 * Tentukan desain cover untuk satu materi.
 * @param {object} material Objek materi (dipakai: mapel_nama/subject, id, title).
 * @param {number} index Urutan tampil, dipakai hanya sebagai variasi cadangan.
 */
export function getCoverDesign(material, index = 0) {
  const subject = String(material?.mapel_nama || material?.subject || material?.mapel_id || '').trim();
  const seed = hashString(`${material?.id || ''}|${material?.title || ''}|${subject}`) + index;
  const palette = resolvePalette(subject) || FALLBACK_PALETTES[seed % FALLBACK_PALETTES.length];
  return {
    ...palette,
    pattern: PATTERNS[seed % PATTERNS.length],
    // Rotasi halus supaya rak buku tidak terasa kaku.
    tilt: (seed % 3) - 1,
  };
}

/** Lapisan dekoratif SVG untuk setiap arah seni. */
function patternSvg(pattern) {
  const open = '<svg class="mc-art" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
  const close = '</svg>';
  if (pattern === 'arcs') {
    return `${open}
      <circle cx="300" cy="400" r="240" fill="var(--mc-accent)" opacity=".16"/>
      <circle cx="300" cy="400" r="170" fill="#fff" opacity=".10"/>
      <circle cx="300" cy="400" r="100" fill="var(--mc-accent)" opacity=".22"/>
      <circle cx="46" cy="52" r="15" fill="var(--mc-accent)" opacity=".5"/>
    ${close}`;
  }
  if (pattern === 'blob') {
    return `${open}
      <path d="M-30 250c60-70 20-150 90-190 70-40 150 10 190-40 30-38 60-30 80-10v420H-30z" fill="#fff" opacity=".09"/>
      <path d="M-20 330c70-40 90-120 170-130 60-8 110 30 160 6v220H-20z" fill="var(--mc-accent)" opacity=".18"/>
      <circle cx="238" cy="70" r="30" fill="var(--mc-accent)" opacity=".28"/>
    ${close}`;
  }
  if (pattern === 'grid') {
    return `${open}
      <defs><pattern id="mcDots" width="26" height="26" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="2.4" fill="#fff" opacity=".30"/>
      </pattern></defs>
      <rect width="300" height="400" fill="url(#mcDots)"/>
      <rect x="188" y="250" width="150" height="150" fill="var(--mc-accent)" opacity=".22"/>
      <rect x="20" y="20" width="52" height="6" rx="3" fill="var(--mc-accent)" opacity=".75"/>
    ${close}`;
  }
  if (pattern === 'waves') {
    return `${open}
      <path d="M-10 300c60-34 110 22 170-8s90-30 150 4v120H-10z" fill="#fff" opacity=".10"/>
      <path d="M-10 336c66-30 106 26 168-4s86-24 152 8v70H-10z" fill="var(--mc-accent)" opacity=".24"/>
      <path d="M-10 372c70-26 108 22 170-6s84-18 150 10v34H-10z" fill="#fff" opacity=".14"/>
    ${close}`;
  }
  if (pattern === 'diagonal') {
    return `${open}
      <path d="M300 0v400H60z" fill="#fff" opacity=".08"/>
      <path d="M300 120v280H150z" fill="var(--mc-accent)" opacity=".20"/>
      <path d="M0 0h300v10H0z" fill="var(--mc-accent)" opacity=".8"/>
    ${close}`;
  }
  if (pattern === 'frame') {
    return `${open}
      <rect x="16" y="16" width="268" height="368" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
      <rect x="26" y="26" width="248" height="348" fill="none" stroke="var(--mc-accent)" stroke-opacity=".45" stroke-width="1"/>
      <circle cx="150" cy="330" r="34" fill="var(--mc-accent)" opacity=".18"/>
    ${close}`;
  }
  if (pattern === 'confetti') {
    return `${open}
      <circle cx="52" cy="96" r="13" fill="var(--mc-accent)" opacity=".55"/>
      <rect x="212" y="60" width="26" height="26" rx="6" fill="#fff" opacity=".26" transform="rotate(18 225 73)"/>
      <path d="M240 300l24 40h-48z" fill="var(--mc-accent)" opacity=".38"/>
      <circle cx="72" cy="330" r="22" fill="#fff" opacity=".16"/>
      <rect x="130" y="24" width="8" height="46" rx="4" fill="#fff" opacity=".24"/>
      <circle cx="258" cy="196" r="9" fill="var(--mc-accent)" opacity=".5"/>
    ${close}`;
  }
  // halftone
  return `${open}
    <defs><radialGradient id="mcGlow" cx="78%" cy="14%" r="70%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".38"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="300" height="400" fill="url(#mcGlow)"/>
    <g fill="var(--mc-accent)" opacity=".42">
      <circle cx="40" cy="360" r="10"/><circle cx="76" cy="360" r="8"/><circle cx="108" cy="360" r="6"/>
      <circle cx="136" cy="360" r="4"/><circle cx="40" cy="326" r="7"/><circle cx="72" cy="326" r="5"/>
      <circle cx="100" cy="326" r="3.4"/>
    </g>
  ${close}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Bangun HTML cover lengkap.
 *
 * @param {object} options
 * @param {object} options.design Hasil getCoverDesign().
 * @param {string} options.title Judul materi.
 * @param {string} options.subject Nama mata pelajaran.
 * @param {string} [options.footer] Baris kecil di bawah judul (kelas/tanggal).
 * @param {string} [options.badgeHtml] Elemen status di pojok kanan atas.
 * @param {boolean} [options.compact] Versi kecil untuk baris tabel.
 */
export function renderCoverHtml({ design, title, subject, footer = '', badgeHtml = '', compact = false }) {
  const style = `--mc-from:${design.from};--mc-to:${design.to};--mc-accent:${design.accent};--mc-ink:${design.ink}`;
  if (compact) {
    return `<div class="mc-cover mc-compact" data-pattern="${design.pattern}" style="${style}">
      ${patternSvg(design.pattern)}
      <span class="mc-spine" aria-hidden="true"></span>
      <span class="mc-compact-symbol">${escapeHtml(design.symbol)}</span>
      <strong class="mc-compact-title">${escapeHtml(title)}</strong>
    </div>`;
  }
  return `<div class="mc-cover" data-pattern="${design.pattern}" style="${style}">
    ${patternSvg(design.pattern)}
    <span class="mc-spine" aria-hidden="true"></span>
    <div class="mc-top">
      <span class="mc-symbol">${escapeHtml(design.symbol)}</span>
      ${badgeHtml}
    </div>
    <div class="mc-copy">
      <small class="mc-subject">${escapeHtml(subject || 'Materi')}</small>
      <strong class="mc-title">${escapeHtml(title)}</strong>
      <span class="mc-rule" aria-hidden="true"></span>
      ${footer ? `<span class="mc-footer">${escapeHtml(footer)}</span>` : ''}
    </div>
  </div>`;
}

/** CSS cover. Disuntikkan sekali per halaman. */
export function coverStyles() {
  return `
    .mc-cover { position:relative; overflow:hidden; display:flex; flex-direction:column; width:100%; aspect-ratio:3/4.15;
      padding:16px 15px 15px 22px; border-radius:6px 14px 14px 6px; color:#fff; isolation:isolate;
      background:linear-gradient(150deg,var(--mc-from) 0%,var(--mc-to) 100%);
      box-shadow:-3px 3px 0 rgba(0,0,0,.16), 0 18px 30px -18px rgba(15,23,42,.75);
      transition:transform .32s cubic-bezier(.2,.8,.2,1), box-shadow .32s; }
    .mc-cover::after { content:''; position:absolute; inset:0; z-index:3; pointer-events:none;
      background:linear-gradient(125deg,rgba(255,255,255,.20) 0%,transparent 34%,transparent 68%,rgba(0,0,0,.14) 100%); }
    .mc-art { position:absolute; inset:0; z-index:1; width:100%; height:100%; pointer-events:none; }
    .mc-spine { position:absolute; z-index:2; inset:0 auto 0 10px; width:3px;
      background:linear-gradient(to right,rgba(0,0,0,.22),rgba(255,255,255,.16)); }
    .mc-cover > .mc-top, .mc-cover > .mc-copy { position:relative; z-index:4; }
    .mc-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .mc-symbol { display:inline-flex; min-width:36px; height:36px; align-items:center; justify-content:center; padding:0 8px;
      border:1px solid rgba(255,255,255,.34); border-radius:11px; background:rgba(255,255,255,.18);
      font-size:12px; font-weight:850; letter-spacing:.02em; backdrop-filter:blur(10px); }
    .mc-copy { margin-top:auto; }
    .mc-subject { display:block; margin-bottom:8px; color:var(--mc-ink); font-size:8px; font-weight:850;
      letter-spacing:.18em; text-transform:uppercase; opacity:.9; }
    .mc-title { display:-webkit-box; overflow:hidden; color:#fff; font-size:15px; font-weight:800; line-height:1.2;
      letter-spacing:-.022em; text-wrap:balance; -webkit-box-orient:vertical; -webkit-line-clamp:4;
      text-shadow:0 1px 2px rgba(0,0,0,.22); }
    .mc-rule { display:block; width:34px; height:3px; margin:9px 0 0; border-radius:2px; background:var(--mc-accent); opacity:.95; }
    .mc-footer { display:block; margin-top:7px; overflow:hidden; color:rgba(255,255,255,.82); font-size:8.5px;
      font-weight:600; letter-spacing:.04em; text-overflow:ellipsis; white-space:nowrap; }
    .mc-badge { display:inline-flex; align-items:center; flex:none; padding:4px 9px; border-radius:999px;
      font-size:8px; font-weight:850; letter-spacing:.07em; text-transform:uppercase; backdrop-filter:blur(6px); }
    .mc-badge.read { border:1px solid rgba(74,222,128,.55); background:rgba(34,197,94,.32); color:#f0fdf4; }
    .mc-badge.unread { border:1px solid rgba(253,224,71,.55); background:rgba(250,204,21,.3); color:#fefce8; }

    /* Penyesuaian per arah seni supaya teks tetap terbaca. */
    .mc-cover[data-pattern="diagonal"] { padding-top:20px; }
    .mc-cover[data-pattern="frame"] { padding:26px 26px 26px 30px; }
    .mc-cover[data-pattern="frame"] .mc-title { -webkit-line-clamp:3; }

    /* Versi kecil untuk baris tabel. */
    .mc-cover.mc-compact { aspect-ratio:3/4; padding:8px 7px 8px 13px; border-radius:4px 9px 9px 4px;
      box-shadow:-2px 2px 0 rgba(0,0,0,.15), 0 12px 18px -13px rgba(15,23,42,.8); }
    .mc-compact .mc-spine { inset:0 auto 0 6px; width:2px; }
    .mc-compact-symbol { position:relative; z-index:4; display:inline-flex; min-width:20px; height:20px;
      align-items:center; justify-content:center; padding:0 3px; border-radius:6px;
      background:rgba(255,255,255,.22); font-size:8px; font-weight:850; }
    .mc-compact-title { position:relative; z-index:4; display:-webkit-box; overflow:hidden; margin-top:auto;
      color:#fff; font-size:8px; font-weight:800; line-height:1.24; -webkit-box-orient:vertical; -webkit-line-clamp:3; }

    @media (prefers-reduced-motion:reduce) { .mc-cover { transition:none; } }
  `;
}
