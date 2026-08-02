/**
 * Renderer materi terstruktur (JSON) → HTML premium bernuansa iOS.
 *
 * - Pure functions (string → string), mudah diuji tanpa DOM.
 * - KaTeX dirender via window.katex bila tersedia (opsional).
 * - Interaktif (isian, kuis, drag-drop, collapsible) dirender sebagai markup
 *   terstruktur dengan atribut data-mai-*; perilakunya dipasang terpisah oleh
 *   bindMaterialInteractions (Tahap 7) — markup sudah siap sejak sekarang.
 */

// ---------------------------------------------------------------------------
// Helper dasar
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

// ---------------------------------------------------------------------------
// Inline formatting: escape → markdown ringan → KaTeX (bila tersedia)
// ---------------------------------------------------------------------------

function renderMath(html) {
  if (typeof window === 'undefined' || !window.katex?.renderToString) return html;
  let out = String(html);
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    try {
      return `<div class="mai-math-display">${window.katex.renderToString(String(formula).trim(), { displayMode: true, throwOnError: false, trust: true })}</div>`;
    } catch { return match; }
  });
  out = out.replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, (match, formula) => {
    try {
      return `<span class="mai-math-inline">${window.katex.renderToString(String(formula).trim(), { displayMode: false, throwOnError: false, trust: true })}</span>`;
    } catch { return match; }
  });
  return out;
}

/** Escape dulu agar aman, lalu terapkan markdown ringan pada teks yang aman. */
function renderInline(text) {
  let html = escapeHtml(text);
  // Kode inline `...`
  html = html.replace(/`([^`]+)`/g, '<code class="mai-code">$1</code>');
  // Tebal **...** atau __...__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Miring *...* atau _..._
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return renderMath(html);
}

/** Render blok konten markdown-sederhana: paragraf, daftar -, dan daftar 1. */
function renderBlocks(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const parts = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  const flushList = () => {
    if (!list) return;
    const tag = list.type;
    parts.push(`<${tag} class="mai-list">${list.items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
    list = null;
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const ulMatch = line.match(/^\s*[-*•]\s+(.+)$/);
    const olMatch = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ulMatch) {
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(ulMatch[1]);
      return;
    }
    if (olMatch) {
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(olMatch[2]);
      return;
    }
    flushList();
    if (!line.trim()) return;
    parts.push(`<p>${renderInline(line)}</p>`);
  });
  flushList();
  return parts.join('');
}

// ---------------------------------------------------------------------------
// CSS premium iOS
// ---------------------------------------------------------------------------

// Pemetaan gaya bahasa → tema warna. Tema menentukan aksen, hero, latar, dan
// tabel agar nuansa visual mengikuti gaya yang dipilih guru (bukan mapel).
// Default 'hangat' bila gaya tidak dikenal (mis. materi lama tanpa field gaya).
function resolveTheme(gaya) {
  const g = String(gaya || '').toLowerCase();
  const known = ['hangat', 'formal', 'santai', 'memotivasi', 'menarik', 'ceria', 'fokus'];
  return known.includes(g) ? g : 'hangat';
}

function getStyles() {
  return `
    :root { color-scheme: light; --mai-bg:rgba(var(--mai-brand-rgb),.035); --mai-surface:rgba(var(--mai-brand-rgb),.06); --mai-card:#ffffff; --mai-ink:#1d1d1f; --mai-muted:#6e6e73; --mai-line:rgba(0,0,0,.06); --mai-brand:#0a84ff; --mai-brand2:#5e5ce6; --mai-brand-rgb:10,132,255; --mai-brand2-rgb:94,92,230; --mai-hero-1:#0a84ff; --mai-hero-2:#5e5ce6; --mai-green:#30d158; --mai-amber:#ffd60a; --mai-rose:#ff453a; --mai-radius:20px; --mai-shadow:0 10px 30px -18px rgba(0,0,0,.25); }
    .mai-page { max-width:820px; margin:0 auto; padding:16px 14px 44px; font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Inter,Arial,sans-serif; background:var(--mai-bg); color:var(--mai-ink); -webkit-font-smoothing:antialiased; line-height:1.6; }
    .mai-card { background:var(--mai-card); border-radius:var(--mai-radius); box-shadow:var(--mai-shadow); border:1px solid var(--mai-line); padding:18px 18px; margin-bottom:14px; }
    .mai-hero { background:linear-gradient(135deg,var(--mai-hero-1),var(--mai-hero-2)); color:#fff; border:none; }
    .mai-eyebrow { margin:0 0 4px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; opacity:.78; }
    .mai-hero h1 { margin:0; font-size:clamp(1.45rem,4.4vw,2rem); line-height:1.15; font-weight:700; letter-spacing:-.02em; }
    .mai-sub { margin:8px 0 0; font-size:.85rem; opacity:.85; }
    .mai-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
    .mai-chip { background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.22); border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; }
    .mai-hook { font-size:.98rem; line-height:1.65; border-left:4px solid var(--mai-brand); background:linear-gradient(90deg,rgba(var(--mai-brand-rgb),.06),transparent 60%); }
    .mai-h { display:flex; align-items:center; gap:10px; margin:0 0 12px; }
    .mai-h-ic { flex:none; width:30px; height:30px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg,rgba(var(--mai-brand-rgb),.14),rgba(var(--mai-brand2-rgb),.14)); color:var(--mai-brand); font-size:15px; }
    .mai-h h2 { margin:0; font-size:1.12rem; font-weight:700; letter-spacing:-.01em; }
    .mai-h-sub { font-size:.74rem; color:var(--mai-muted); margin:2px 0 0; font-weight:500; }
    .mai-list { margin:.5em 0; padding-left:1.2rem; }
    .mai-list li { margin:.35em 0; }
    .mai-concept-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .mai-badge { flex:none; min-width:26px; height:26px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; background:var(--mai-ink); color:#fff; font-size:.78rem; font-weight:700; padding:0 6px; }
    .mai-concept-head h3 { margin:0; font-size:1.02rem; font-weight:700; }
    .mai-variant { font-size:.66rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--mai-brand); background:rgba(var(--mai-brand-rgb),.1); border-radius:999px; padding:2px 8px; margin-left:auto; }
    .mai-table-wrap { overflow-x:auto; margin:10px 0; border-radius:12px; border:1px solid var(--mai-line); }
    .mai-table { width:100%; border-collapse:collapse; font-size:.86rem; }
    .mai-table th, .mai-table td { padding:9px 12px; text-align:left; border-bottom:1px solid var(--mai-line); }
    .mai-table th { background:var(--mai-surface); font-weight:700; }
    .mai-table tr:last-child td { border-bottom:none; }
    .mai-chart { margin:12px 0; }
    .mai-chart-box { position:relative; width:100%; height:320px; background:#fff; border:1px solid var(--mai-line); border-radius:14px; padding:10px 12px; }
    .mai-chart-box canvas { width:100% !important; height:100% !important; }
    .mai-chart-cap { margin:8px 2px 0; font-size:.78rem; color:var(--mai-muted); text-align:center; }
    .mai-chart-fallback { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:.82rem; color:var(--mai-muted); text-align:center; padding:12px; }
    @media (max-width:640px){ .mai-chart-box { height:260px; } }
    .mai-viz-box { position:relative; width:100%; height:360px; background:#fff; border:1px solid var(--mai-line); border-radius:14px; overflow:hidden; }
    .mai-jxg { width:100%; height:100%; }
    .mai-nl-box { background:#fff; border:1px solid var(--mai-line); border-radius:14px; padding:6px 8px; }
    .mai-longdiv { }
    .mai-ld-head { font-size:.9rem; margin:2px 0; }
    .mai-ld-lbl { color:var(--mai-muted); }
    .mai-ld-eq { font-size:.82rem; color:var(--mai-muted); margin:2px 0 8px; }
    .mai-ld-grid { display:flex; flex-direction:column; gap:2px; background:#fff; border:1px solid var(--mai-line); border-radius:12px; padding:10px 12px; font-family:ui-monospace,Menlo,monospace; overflow-x:auto; }
    .mai-ld-row { display:grid; gap:0 6px; }
    .mai-ld-c { text-align:center; font-size:.9rem; padding:2px 4px; }
    .mai-ld-dividend { border-bottom:2px solid var(--mai-ink); padding-bottom:2px; }
    .mai-ld-sub { color:var(--mai-rose); }
    .mai-ld-rem { border-top:1px solid var(--mai-line); }
    @media (max-width:640px){ .mai-viz-box { height:300px; } }
    .mai-highlight { display:flex; gap:10px; border-radius:14px; padding:12px 14px; margin:10px 0; font-size:.9rem; align-items:flex-start; }
    .mai-highlight-ic { flex:none; font-size:16px; line-height:1.4; }
    .mai-hl-penting { background:rgba(255,214,10,.14); border:1px solid rgba(255,214,10,.4); }
    .mai-hl-miskonsepsi { background:rgba(255,69,58,.1); border:1px solid rgba(255,69,58,.3); }
    .mai-hl-perhatian { background:rgba(255,159,10,.12); border:1px solid rgba(255,159,10,.35); }
    .mai-hl-info { background:rgba(var(--mai-brand-rgb),.1); border:1px solid rgba(var(--mai-brand-rgb),.28); }
    .mai-example { border:1px solid var(--mai-line); border-radius:16px; padding:14px; margin:10px 0; background:#fcfcfd; }
    .mai-example-q { font-weight:600; margin:0 0 10px; }
    .mai-steps-toggle { border:none; background:linear-gradient(135deg,var(--mai-brand),var(--mai-brand2)); color:#fff; font-weight:600; font-size:.8rem; border-radius:999px; padding:8px 14px; cursor:pointer; }
    .mai-steps { margin-top:12px; border-top:1px dashed var(--mai-line); padding-top:12px; }
    .mai-step { display:flex; gap:10px; margin:8px 0; }
    .mai-step-n { flex:none; width:22px; height:22px; border-radius:999px; background:rgba(var(--mai-brand-rgb),.12); color:var(--mai-brand); font-size:.72rem; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
    .mai-answer { margin-top:10px; background:rgba(48,209,88,.12); border:1px solid rgba(48,209,88,.3); border-radius:12px; padding:10px 12px; font-size:.9rem; }
    .mai-fill { display:inline-block; min-width:72px; border:none; border-bottom:2px solid var(--mai-brand); background:rgba(var(--mai-brand-rgb),.06); border-radius:6px 6px 0 0; padding:2px 8px; font-size:.9em; text-align:center; }
    .mai-quiz-opt { display:block; width:100%; text-align:left; border:1px solid var(--mai-line); background:#fff; border-radius:12px; padding:10px 12px; margin:6px 0; cursor:pointer; font-size:.9rem; transition:.15s ease; }
    .mai-quiz-opt:hover { border-color:var(--mai-brand); }
    .mai-quiz-opt.correct { background:rgba(48,209,88,.12); border-color:var(--mai-green); }
    .mai-quiz-opt.wrong { background:rgba(255,69,58,.1); border-color:var(--mai-rose); }
    .mai-quiz-feedback { font-size:.82rem; margin-top:6px; }
    .mai-dd { display:grid; gap:8px; margin:8px 0; }
    .mai-dd-row { display:flex; gap:8px; align-items:center; }
    .mai-dd-item { flex:1; border:1px solid var(--mai-line); background:#fff; border-radius:12px; padding:10px 12px; font-size:.88rem; }
    .mai-dd-target { flex:1; border:1.5px dashed rgba(var(--mai-brand-rgb),.4); background:rgba(var(--mai-brand-rgb),.05); border-radius:12px; min-height:42px; padding:10px 12px; font-size:.88rem; color:var(--mai-muted); }
    .mai-math-display { overflow-x:auto; margin:10px 0; padding:12px 14px; background:var(--mai-surface); border:1px solid var(--mai-line); border-radius:12px; }
    .mai-math-inline { display:inline-flex; max-width:100%; overflow-x:auto; vertical-align:middle; }
    .mai-code { background:var(--mai-surface); padding:2px 6px; border-radius:6px; font-size:.88em; font-family:ui-monospace,Menlo,monospace; }
    .mai-roles { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
    .mai-role { background:rgba(var(--mai-brand2-rgb),.1); color:var(--mai-brand2); border-radius:999px; padding:4px 10px; font-size:.74rem; font-weight:600; }
    .mai-divider { height:1px; background:var(--mai-line); margin:14px 0; }
    @media (max-width:640px){ .mai-page{padding:12px 10px 32px;} .mai-card{padding:15px 14px; border-radius:16px;} .mai-dd-row{flex-direction:column;} .mai-dd-item,.mai-dd-target{width:100%;} }
    @media print { .mai-page{background:#fff; padding:0;} .mai-card{box-shadow:none; border:1px solid #ddd; page-break-inside:avoid;} .mai-hero{background:var(--mai-hero-1) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact;} .mai-steps-toggle{display:none;} .mai-steps{display:block !important;} }

    /* Tema warna per gaya bahasa (override variabel pada .mai-page).
       Latar & tabel ikut via --mai-bg/--mai-surface yang memakai --mai-brand-rgb,
       jadi sekali brand diubah, seluruh nuansa ikut bergeser. */
    .mai-page.mai-theme-hangat { --mai-brand:#e0552b; --mai-brand2:#f4a261; --mai-brand-rgb:224,85,43; --mai-brand2-rgb:244,162,97; --mai-hero-1:#e0552b; --mai-hero-2:#f4a261; }
    .mai-page.mai-theme-formal { --mai-brand:#2c5282; --mai-brand2:#4a5568; --mai-brand-rgb:44,82,130; --mai-brand2-rgb:74,85,104; --mai-hero-1:#1e3a5f; --mai-hero-2:#2c5282; }
    .mai-page.mai-theme-santai { --mai-brand:#0e9488; --mai-brand2:#0ea5e9; --mai-brand-rgb:14,148,136; --mai-brand2-rgb:14,165,233; --mai-hero-1:#0e9488; --mai-hero-2:#0ea5e9; }
    .mai-page.mai-theme-memotivasi { --mai-brand:#dc2626; --mai-brand2:#f59e0b; --mai-brand-rgb:220,38,38; --mai-brand2-rgb:245,158,11; --mai-hero-1:#dc2626; --mai-hero-2:#f59e0b; }
    .mai-page.mai-theme-menarik { --mai-brand:#7c3aed; --mai-brand2:#db2777; --mai-brand-rgb:124,58,237; --mai-brand2-rgb:219,39,119; --mai-hero-1:#7c3aed; --mai-hero-2:#db2777; }
    .mai-page.mai-theme-ceria { --mai-brand:#16a34a; --mai-brand2:#ca8a04; --mai-brand-rgb:22,163,74; --mai-brand2-rgb:202,138,4; --mai-hero-1:#16a34a; --mai-hero-2:#ca8a04; }
    .mai-page.mai-theme-fokus { --mai-brand:#475569; --mai-brand2:#64748b; --mai-brand-rgb:71,85,105; --mai-brand2-rgb:100,116,139; --mai-hero-1:#334155; --mai-hero-2:#475569; }

    /* Tata letak per variant konsep — supaya penyajian benar-benar berbeda. */
    .mai-cv-definisi .mai-def { background:rgba(var(--mai-brand-rgb),.06); border-left:4px solid var(--mai-brand); border-radius:12px; padding:12px 14px; margin:8px 0; }
    .mai-cv-definisi .mai-def p:first-child { margin-top:0; }
    .mai-cv-kasus .mai-case { margin:0; padding:14px 16px; border-left:4px solid var(--mai-brand2); background:#fcfcfd; border-radius:12px; }
    .mai-cv-kasus .mai-case p:first-child { margin-top:0; }
    .mai-cv-langkah .mai-steps-v .mai-list { counter-reset:maistep; list-style:none; padding-left:0; }
    .mai-cv-langkah .mai-steps-v .mai-list li { position:relative; padding:10px 12px 10px 46px; margin:8px 0; background:rgba(var(--mai-brand-rgb),.05); border-radius:12px; counter-increment:maistep; }
    .mai-cv-langkah .mai-steps-v .mai-list li::before { content:counter(maistep); position:absolute; left:10px; top:10px; width:26px; height:26px; border-radius:8px; background:var(--mai-brand); color:#fff; font-weight:700; display:inline-flex; align-items:center; justify-content:center; font-size:.82rem; }
    .mai-cv-perbandingan .mai-compare { background:#fcfcfd; border:1px solid var(--mai-line); border-radius:14px; padding:14px 16px; }
    .mai-cv-perbandingan .mai-compare .mai-table-wrap { margin-top:8px; }
  `;
}

// ---------------------------------------------------------------------------
// Ikon (SF-symbol-like, inline SVG ringan)
// ---------------------------------------------------------------------------

const ICONS = {
  hook: '✦', objective: '◎', concept: '❑', highlight: '⚑', example: '✎',
  exercise: '✓', group: '👥', assignment: '✍', summary: '★', reflection: '☁',
  penting: '★', miskonsepsi: '⚠', perhatian: '⚠', info: 'ℹ',
};

function sectionHead(icon, title, sub) {
  return `<div class="mai-h"><span class="mai-h-ic">${icon}</span><div><h2>${escapeHtml(title)}</h2>${sub ? `<p class="mai-h-sub">${escapeHtml(sub)}</p>` : ''}</div></div>`;
}

// ---------------------------------------------------------------------------
// Renderer per bagian
// ---------------------------------------------------------------------------

function renderHero(material, meta) {
  const chips = [
    meta.subject || meta.mapel, meta.className ? `Kelas ${meta.className}` : null,
    meta.chapter || meta.bab, meta.meetings || meta.alokasiWaktu,
  ].filter(Boolean);
  return `<div class="mai-card mai-hero">
    <p class="mai-eyebrow">Materi Pembelajaran</p>
    <h1>${escapeHtml(material.title || 'Materi')}</h1>
    <p class="mai-sub">${escapeHtml(meta.subject || meta.mapel || '')}</p>
    ${chips.length ? `<div class="mai-chips">${chips.map((c) => `<span class="mai-chip">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
  </div>`;
}

function renderHook(material) {
  if (!material.hook) return '';
  return `<div class="mai-card mai-hook">${renderInline(material.hook)}</div>`;
}

function renderObjectives(material) {
  if (!material.objectives?.length) return '';
  return `<div class="mai-card">${sectionHead(ICONS.objective, 'Tujuan Pembelajaran', 'Setelah mempelajari materi ini, kamu mampu:')}
    <ul class="mai-list">${material.objectives.map((o) => `<li>${renderInline(o)}</li>`).join('')}</ul></div>`;
}

function renderConcept(concept, index) {
  const variant = String(concept.variant || 'narasi').toLowerCase();
  const tableHtml = concept.table && Array.isArray(concept.table.headers)
    ? `<div class="mai-table-wrap"><table class="mai-table"><thead><tr>${concept.table.headers.map((h) => `<th>${renderInline(h)}</th>`).join('')}</tr></thead><tbody>${(concept.table.rows || []).map((row) => `<tr>${(row || []).map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '';
  // Bungkus isi sesuai variant agar penyajian benar-benar berbeda visual,
  // bukan hanya berbeda label. Variant tak dikenal → narasi (kartu biasa).
  let body;
  if (variant === 'definisi') body = `<div class="mai-def">${renderBlocks(concept.content)}</div>`;
  else if (variant === 'kasus') body = `<blockquote class="mai-case">${renderBlocks(concept.content)}</blockquote>`;
  else if (variant === 'langkah') body = `<div class="mai-steps-v">${renderBlocks(concept.content)}</div>`;
  else if (variant === 'perbandingan') body = `<div class="mai-compare">${renderBlocks(concept.content)}</div>`;
  else body = renderBlocks(concept.content);
  return `<div class="mai-card mai-cv-${variant}">
    <div class="mai-concept-head"><span class="mai-badge">${index + 1}</span><h3>${escapeHtml(concept.heading || `Konsep ${index + 1}`)}</h3><span class="mai-variant">${escapeHtml(variant)}</span></div>
    ${body}
    ${tableHtml}
    ${renderChart(concept.chart)}
    ${renderVisual(concept.visual)}
  </div>`;
}

/** Tipe grafik yang dikenali renderer. */
const CHART_TYPES = ['line', 'bar', 'pie', 'scatter', 'function'];

/**
 * Render satu grafik sebagai <canvas> pembawa DATA (bukan HTML/JS mentah).
 * Spesifikasi disematkan pada atribut data-mai-chart dan digambar saat runtime
 * oleh getChartScript() memakai Chart.js. Aman: tidak ada script dari AI.
 */
function renderChart(chart) {
  if (!chart || typeof chart !== 'object') return '';
  const type = String(chart.type || '').toLowerCase();
  if (!CHART_TYPES.includes(type)) return '';
  const spec = escapeHtml(JSON.stringify(chart));
  const cid = uid('chart');
  const title = chart.title ? `<figcaption class="mai-chart-cap">${renderInline(chart.title)}</figcaption>` : '';
  return `<figure class="mai-chart">
    <div class="mai-chart-box"><canvas id="${cid}" data-mai-chart="${spec}" role="img" aria-label="${escapeHtml(chart.title || 'Grafik')}"></canvas>
    <div class="mai-chart-fallback" data-mai-chart-fallback hidden>Grafik tidak dapat dimuat.</div></div>
    ${title}
  </figure>`;
}

/** Apakah materi mengandung minimal satu grafik? (untuk memuat Chart.js secara kondisional) */
function materialHasChart(material) {
  return Array.isArray(material?.concepts) && material.concepts.some((c) => c && c.chart && typeof c.chart === 'object');
}

/** Apakah ada visual yang butuh JSXGraph (graph/geometry)? */
function materialNeedsJsxgraph(material) {
  return Array.isArray(material?.concepts) && material.concepts.some((c) => {
    const k = c && c.visual && c.visual.kind;
    return k === 'graph' || k === 'geometry';
  });
}

/** Dispatch visual matematika lanjutan. */
function renderVisual(visual) {
  if (!visual || typeof visual !== 'object') return '';
  const kind = String(visual.kind || '').toLowerCase();
  if (kind === 'longdiv') return renderLongDiv(visual);
  if (kind === 'numberline') return renderNumberline(visual);
  if (kind === 'graph' || kind === 'geometry') {
    const spec = escapeHtml(JSON.stringify(visual));
    const cid = uid('viz');
    const cap = visual.title ? `<figcaption class="mai-chart-cap">${renderInline(visual.title)}</figcaption>` : '';
    return `<figure class="mai-chart">
      <div class="mai-viz-box"><div id="${cid}" class="mai-jxg" data-mai-viz="${spec}" role="img" aria-label="${escapeHtml(visual.title || 'Visual matematika')}"></div>
      <div class="mai-chart-fallback" data-mai-viz-fallback hidden>Visual tidak dapat dimuat.</div></div>
      ${cap}
    </figure>`;
  }
  return '';
}

/** Format satu suku polinomial dari koefisien & derajat (untuk longdiv). */
function fmtPolyTerm(coef, degree, variable, first) {
  if (coef === 0) return '';
  const sign = coef < 0 ? '−' : (first ? '' : '+');
  let mag = Math.abs(coef);
  let magStr = (Math.round(mag * 1000) / 1000).toString();
  let varStr = '';
  if (degree === 1) varStr = variable;
  else if (degree > 1) varStr = `${variable}^${degree}`;
  if (varStr && mag === 1) magStr = '';
  const body = magStr && varStr ? `${magStr}${varStr}` : (varStr || magStr || '0');
  return `${sign}${sign ? ' ' : ''}${body}`;
}

/** Ubah array koefisien (tinggi→rendah) menjadi string polinomial. */
function polyToString(coeffs, variable) {
  const deg = coeffs.length - 1;
  const parts = [];
  coeffs.forEach((c, i) => {
    const term = fmtPolyTerm(c, deg - i, variable, parts.length === 0);
    if (term) parts.push(term);
  });
  return parts.length ? parts.join(' ') : '0';
}

/**
 * Pembagian polinomial cara susun — DIHITUNG di sini (deterministik) agar tidak
 * bergantung pada aritmetika AI. Menghasilkan tabel bertingkat yang selaras
 * per-derajat memakai CSS grid.
 */
function renderLongDiv(visual) {
  const dividend = Array.isArray(visual.dividend) ? visual.dividend.slice() : [];
  const divisor = Array.isArray(visual.divisor) ? visual.divisor.slice() : [];
  const v = visual.variable || 'x';
  if (dividend.length < divisor.length || !divisor.length || divisor[0] === 0) return '';

  const nCols = dividend.length; // kolom = derajat tertinggi..0
  const work = dividend.slice();
  const quotient = [];
  const rows = []; // tiap langkah: { product: number[]|null, remainder: number[] } sejajar kolom penuh
  const steps = dividend.length - divisor.length + 1;

  for (let i = 0; i < steps; i += 1) {
    const coef = work[i] / divisor[0];
    quotient.push(coef);
    // baris hasil kali (coef * divisor) diletakkan mulai kolom i
    const product = new Array(nCols).fill(null);
    for (let j = 0; j < divisor.length; j += 1) product[i + j] = coef * divisor[j];
    // kurangi
    for (let j = 0; j < divisor.length; j += 1) work[i + j] -= coef * divisor[j];
    const remainder = new Array(nCols).fill(null);
    for (let k = i + 1; k < nCols; k += 1) remainder[k] = work[k];
    rows.push({ product, remainder, startCol: i });
  }

  const quotientStr = polyToString(quotient, v);
  const divisorStr = polyToString(divisor, v);
  const remainderCoeffs = work.slice(steps);
  const remainderStr = polyToString(remainderCoeffs.length ? remainderCoeffs : [0], v);

  const cell = (val) => (val == null ? '' : (Math.round(val * 1000) / 1000).toString());
  const gridRow = (arr, cls) => `<div class="mai-ld-row ${cls || ''}" style="grid-template-columns:repeat(${nCols},minmax(2.2em,1fr))">${arr.map((val) => `<span class="mai-ld-c">${cell(val)}</span>`).join('')}</div>`;

  const stepRows = rows.map((r) => {
    const prod = r.product.map((val) => (val == null ? null : -val)); // ditampilkan sebagai pengurangan
    return `${gridRow(prod, 'mai-ld-sub')}${gridRow(r.remainder, 'mai-ld-rem')}`;
  }).join('');

  const cap = visual.title ? `<figcaption class="mai-chart-cap">${renderInline(visual.title)}</figcaption>` : '';
  return `<figure class="mai-chart mai-longdiv">
    <div class="mai-ld-head"><span class="mai-ld-lbl">Hasil bagi</span> <strong>${escapeHtml(quotientStr)}</strong> <span class="mai-ld-lbl">, sisa</span> <strong>${escapeHtml(remainderStr)}</strong></div>
    <div class="mai-ld-eq">( ${escapeHtml(polyToString(dividend, v))} ) ÷ ( ${escapeHtml(divisorStr)} )</div>
    <div class="mai-ld-grid">
      ${gridRow(dividend, 'mai-ld-dividend')}
      ${stepRows}
    </div>
    ${cap}
  </figure>`;
}

/** Garis bilangan — SVG statis (tanpa library). */
function renderNumberline(visual) {
  const min = Number(visual.min);
  const max = Number(visual.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return '';
  const step = Number(visual.step) > 0 ? Number(visual.step) : 1;
  const W = 640; const H = 96; const padX = 30; const axisY = 56;
  const span = max - min;
  const xPix = (val) => padX + ((val - min) / span) * (W - 2 * padX);

  const ticks = [];
  // Batasi jumlah tick agar tidak terlalu rapat.
  const maxTicks = 40;
  const drawStep = (span / step > maxTicks) ? span / maxTicks : step;
  for (let t = min; t <= max + 1e-9; t += drawStep) {
    const x = xPix(t);
    const label = (Math.round(t * 1000) / 1000).toString();
    ticks.push(`<line x1="${x.toFixed(1)}" y1="${axisY - 5}" x2="${x.toFixed(1)}" y2="${axisY + 5}" stroke="#8a8a8e" stroke-width="1"/>`
      + `<text x="${x.toFixed(1)}" y="${axisY + 22}" font-size="11" text-anchor="middle" fill="#6e6e73">${escapeHtml(label)}</text>`);
  }

  const intervals = (visual.intervals || []).map((it) => {
    const x1 = xPix(Math.max(min, it.from)); const x2 = xPix(Math.min(max, it.to));
    const bar = `<line x1="${x1.toFixed(1)}" y1="${axisY}" x2="${x2.toFixed(1)}" y2="${axisY}" stroke="#0a84ff" stroke-width="5" stroke-linecap="round" opacity="0.85"/>`;
    const end = (x, closed) => `<circle cx="${x.toFixed(1)}" cy="${axisY}" r="5" fill="${closed ? '#0a84ff' : '#ffffff'}" stroke="#0a84ff" stroke-width="2"/>`;
    const lbl = it.label ? `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${axisY - 12}" font-size="11" text-anchor="middle" fill="#0a84ff">${escapeHtml(it.label)}</text>` : '';
    return bar + end(x1, it.fromClosed) + end(x2, it.toClosed) + lbl;
  }).join('');

  const points = (visual.points || []).map((p) => {
    const x = xPix(p.x);
    const dot = `<circle cx="${x.toFixed(1)}" cy="${axisY}" r="5" fill="${p.closed ? '#5e5ce6' : '#ffffff'}" stroke="#5e5ce6" stroke-width="2"/>`;
    const lbl = p.label ? `<text x="${x.toFixed(1)}" y="${axisY - 12}" font-size="11" text-anchor="middle" fill="#5e5ce6">${escapeHtml(p.label)}</text>` : '';
    return dot + lbl;
  }).join('');

  const axis = `<line x1="${padX}" y1="${axisY}" x2="${W - padX + 12}" y2="${axisY}" stroke="#3a3a3c" stroke-width="1.5"/>`
    + `<polygon points="${W - padX + 12},${axisY} ${W - padX + 4},${axisY - 4} ${W - padX + 4},${axisY + 4}" fill="#3a3a3c"/>`;

  const cap = visual.title ? `<figcaption class="mai-chart-cap">${renderInline(visual.title)}</figcaption>` : '';
  return `<figure class="mai-chart">
    <div class="mai-nl-box"><svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(visual.title || 'Garis bilangan')}">
      ${axis}${ticks.join('')}${intervals}${points}
    </svg></div>
    ${cap}
  </figure>`;
}

function renderHighlights(material) {
  if (!material.highlights?.length) return '';
  const items = material.highlights.map((h) => {
    const kind = String(h.kind || 'info').toLowerCase();
    const cls = ['penting', 'miskonsepsi', 'perhatian', 'info'].includes(kind) ? kind : 'info';
    return `<div class="mai-highlight mai-hl-${cls}"><span class="mai-highlight-ic">${ICONS[cls] || ICONS.info}</span><div><strong>${escapeHtml(kind)}</strong> — ${renderInline(h.content)}</div></div>`;
  }).join('');
  return `<div class="mai-card">${sectionHead(ICONS.highlight, 'Sorotan Penting')}${items}</div>`;
}

function renderExamples(material) {
  if (!material.examples?.length) return '';
  const items = material.examples.map((ex, i) => {
    const gid = uid('ex');
    const steps = (ex.steps || []).map((s, j) => `<div class="mai-step"><span class="mai-step-n">${j + 1}</span><div>${renderInline(s)}</div></div>`).join('');
    return `<div class="mai-example">
      <p class="mai-example-q"><span class="mai-badge">${ex.number ?? i + 1}</span> ${renderInline(ex.question)}</p>
      <button type="button" class="mai-steps-toggle" data-mai-toggle="${gid}" aria-expanded="false">Lihat Pembahasan</button>
      <div class="mai-steps" id="${gid}" hidden>${steps}${ex.answer ? `<div class="mai-answer"><strong>Jawaban:</strong> ${renderInline(ex.answer)}</div>` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="mai-card">${sectionHead(ICONS.example, 'Contoh Soal', 'Pahami langkah penyelesaiannya')}${items}</div>`;
}

function renderFillBlank(ex) {
  const prompt = String(ex.prompt || '');
  const html = renderInline(prompt).replace(/_{3,}|\[…\]|\(\.\.\.\)/g, `<input type="text" class="mai-fill" data-mai-fill data-answer="${escapeHtml(ex.answer || '')}" placeholder="…">`);
  return `<div class="mai-example"><p class="mai-example-q">${html}</p>
    <button type="button" class="mai-steps-toggle" data-mai-check>Periksa</button>
    <span class="mai-quiz-feedback" data-mai-feedback></span>
    ${ex.hint ? `<div class="mai-quiz-feedback" style="color:var(--mai-muted)">Petunjuk: ${renderInline(ex.hint)}</div>` : ''}</div>`;
}

function renderMultipleChoice(ex) {
  const gid = uid('q');
  const opts = (ex.options || []).map((opt, i) => `<button type="button" class="mai-quiz-opt" data-mai-quiz="${gid}" data-index="${i}" data-correct="${i === ex.answerIndex ? '1' : '0'}">${escapeHtml(String.fromCharCode(65 + i))}. ${renderInline(opt)}</button>`).join('');
  return `<div class="mai-example"><p class="mai-example-q">${renderInline(ex.question)}</p>${opts}
    <div class="mai-quiz-feedback" data-mai-feedback-${gid}></div>
    ${ex.explanation ? `<div class="mai-quiz-feedback" data-mai-exp-${gid} hidden style="color:var(--mai-muted)">${renderInline(ex.explanation)}</div>` : ''}</div>`;
}

function renderDragDrop(ex) {
  const gid = uid('dd');
  const pairs = ex.pairs || [];
  const rights = pairs.map((p) => p.right);
  // Acak sisi kanan untuk interaksi.
  const shuffled = [...rights].sort(() => Math.random() - 0.5);
  const rows = pairs.map((p, i) => `<div class="mai-dd-row">
      <div class="mai-dd-item">${renderInline(p.left)}</div>
      <div class="mai-dd-target" data-mai-dd-target="${gid}" data-answer="${escapeHtml(p.right)}">?</div>
    </div>`).join('');
  const pool = shuffled.map((r) => `<span class="mai-dd-item" data-mai-dd-item="${gid}" draggable="true" style="display:inline-block; cursor:grab;">${renderInline(r)}</span>`).join('');
  return `<div class="mai-example"><p class="mai-example-q">${renderInline(ex.instruction || 'Cocokkan pasangan berikut')}</p>
    <div style="margin-bottom:8px">${pool}</div>
    <div class="mai-dd">${rows}</div>
    <button type="button" class="mai-steps-toggle" data-mai-dd-check="${gid}">Periksa</button>
    <span class="mai-quiz-feedback" data-mai-feedback></span></div>`;
}

function renderEssay(ex) {
  return `<div class="mai-example"><p class="mai-example-q">${renderInline(ex.question)}</p>
    ${ex.guide ? `<div class="mai-quiz-feedback" style="color:var(--mai-muted)">${renderInline(ex.guide)}</div>` : ''}</div>`;
}

function renderExercises(material) {
  if (!material.exercises?.length) return '';
  const items = material.exercises.map((ex) => {
    const kind = String(ex.kind || 'essay').toLowerCase();
    if (kind === 'fill_blank') return renderFillBlank(ex);
    if (kind === 'multiple_choice') return renderMultipleChoice(ex);
    if (kind === 'drag_drop') return renderDragDrop(ex);
    return renderEssay(ex);
  }).join('');
  return `<div class="mai-card">${sectionHead(ICONS.exercise, 'Latihan', 'Asah pemahamanmu')}${items}</div>`;
}

function renderGroupActivity(material) {
  const g = material.group_activity;
  if (!g) return '';
  return `<div class="mai-card">${sectionHead(ICONS.group, g.title || 'Tugas Kelompok', g.goal || '')}
    ${g.steps?.length ? `<ol class="mai-list">${g.steps.map((s) => `<li>${renderInline(s)}</li>`).join('')}</ol>` : ''}
    ${g.roles?.length ? `<div class="mai-roles">${g.roles.map((r) => `<span class="mai-role">${escapeHtml(r)}</span>`).join('')}</div>` : ''}
    ${g.output ? `<div class="mai-answer"><strong>Hasil akhir:</strong> ${renderInline(g.output)}</div>` : ''}
  </div>`;
}

function renderAssignment(material) {
  const a = material.assignment;
  if (!a) return '';
  return `<div class="mai-card">${sectionHead(ICONS.assignment, a.title || 'Tugas Individu')}
    ${a.tasks?.length ? `<ul class="mai-list">${a.tasks.map((t) => `<li>${renderInline(t)}</li>`).join('')}</ul>` : ''}
    ${a.note ? `<div class="mai-quiz-feedback" style="color:var(--mai-muted)">${renderInline(a.note)}</div>` : ''}
  </div>`;
}

function renderSummary(material) {
  if (!material.summary?.length) return '';
  return `<div class="mai-card">${sectionHead(ICONS.summary, 'Rangkuman')}
    <ul class="mai-list">${material.summary.map((s) => `<li>${renderInline(s)}</li>`).join('')}</ul></div>`;
}

function renderReflection(material) {
  if (!material.reflection?.length) return '';
  return `<div class="mai-card">${sectionHead(ICONS.reflection, 'Refleksi', 'Jawab jujur untuk dirimu sendiri')}
    <ul class="mai-list">${material.reflection.map((r) => `<li>${renderInline(r)}</li>`).join('')}</ul></div>`;
}

// ---------------------------------------------------------------------------
// API publik
// ---------------------------------------------------------------------------

// Bungkus satu bagian dengan penanda edit (mode editable) agar bisa
// diklik-untuk-perbaiki. Non-editable → kembalikan html apa adanya.
function editWrap(targetLabel, humanLabel, html, editable) {
  if (!editable || !html) return html || '';
  return `<div class="mai-editsec" data-mai-target="${escapeHtml(targetLabel)}" data-mai-label="${escapeHtml(humanLabel)}">`
    + `<button type="button" class="mai-editbtn" data-mai-edit="${escapeHtml(targetLabel)}" data-mai-label="${escapeHtml(humanLabel)}" title="Perbaiki bagian ini dengan AI">✎ Edit bagian ini</button>`
    + html + '</div>';
}

/** Bangun isi body materi (tanpa <html>) — untuk preview di dalam app. */
export function buildMaterialBody(material, meta = {}, options = {}) {
  if (!material || typeof material !== 'object') return '';
  const editable = options.editable === true;
  const theme = resolveTheme(meta?.gaya);
  const concepts = (material.concepts || []).map((c, i) =>
    editWrap(`concepts[${i}]`, `Konsep ${i + 1}: ${c.heading || ''}`.trim(), renderConcept(c, i), editable)
  ).join('');
  const parts = [
    editWrap('title', 'Judul & info materi', renderHero(material, meta), editable),
    editWrap('hook', 'Paragraf pembuka', renderHook(material), editable),
    editWrap('objectives', 'Tujuan pembelajaran', renderObjectives(material), editable),
    concepts,
    editWrap('highlights', 'Sorotan penting', renderHighlights(material), editable),
    editWrap('examples', 'Contoh soal', renderExamples(material), editable),
    editWrap('exercises', 'Latihan', renderExercises(material), editable),
    editWrap('group_activity', 'Tugas kelompok', renderGroupActivity(material), editable),
    editWrap('assignment', 'Tugas individu', renderAssignment(material), editable),
    editWrap('summary', 'Rangkuman', renderSummary(material), editable),
    editWrap('reflection', 'Refleksi', renderReflection(material), editable),
  ];
  const editStyles = editable ? getEditableStyles() : '';
  return `<style>${getStyles()}${editStyles}</style><div class="mai-page mai-theme-${theme}${editable ? ' mai-editable' : ''}">${parts.join('')}</div>`;
}

/** CSS tambahan untuk mode editable (klik-untuk-perbaiki). */
function getEditableStyles() {
  return `
    .mai-editsec { position:relative; }
    .mai-editsec > .mai-editbtn { position:absolute; top:6px; right:6px; z-index:5; opacity:0; transform:translateY(-4px); transition:opacity .18s ease, transform .18s ease; border:none; border-radius:999px; padding:6px 12px; font-size:.72rem; font-weight:700; color:#fff; background:linear-gradient(135deg,var(--mai-brand),var(--mai-brand2)); box-shadow:0 8px 20px -8px rgba(var(--mai-brand-rgb),.7); cursor:pointer; }
    .mai-editsec:hover > .mai-editbtn, .mai-editsec:focus-within > .mai-editbtn { opacity:1; transform:translateY(0); }
    .mai-editsec:hover > .mai-card, .mai-editsec.mai-editsec-active > .mai-card { outline:2px solid rgba(var(--mai-brand-rgb),.45); outline-offset:2px; }
    @media (max-width:640px){ .mai-editsec > .mai-editbtn { opacity:1; transform:none; padding:5px 10px; font-size:.68rem; } }
  `;
}

/** Script interaktif yang dijalankan di dalam iframe materi (self-contained). */
function getInteractionScript() {
  return `<script>
(function(){
  var d=document;
  // 1. Collapsible pembahasan contoh soal
  d.addEventListener('click',function(e){
    var t=e.target.closest('[data-mai-toggle]');
    if(!t)return;
    var panel=d.getElementById(t.getAttribute('data-mai-toggle'));
    if(!panel)return;
    var open=panel.hasAttribute('hidden');
    if(open){panel.removeAttribute('hidden');t.setAttribute('aria-expanded','true');t.textContent='Sembunyikan Pembahasan';}
    else{panel.setAttribute('hidden','');t.setAttribute('aria-expanded','false');t.textContent='Lihat Pembahasan';}
  });
  // 2. Isian (fill blank) — cek jawaban
  d.addEventListener('click',function(e){
    var btn=e.target.closest('[data-mai-check]');
    if(!btn)return;
    var card=btn.closest('.mai-example');
    if(!card)return;
    var input=card.querySelector('[data-mai-fill]');
    var fb=card.querySelector('[data-mai-feedback]');
    if(!input||!fb)return;
    var ans=String(input.getAttribute('data-answer')||'').trim().toLowerCase();
    var val=String(input.value||'').trim().toLowerCase();
    if(!val){fb.textContent='Isi dulu jawabanmu.';fb.style.color='#b25f00';return;}
    var ok=ans&&val===ans;
    fb.textContent=ok?'Benar! Kerja bagil.':'Belum tepat. Jawaban: '+input.getAttribute('data-answer');
    fb.style.color=ok?'#1f9d43':'#d92b20';
    input.style.borderColor=ok?'#30d158':'#ff453a';
  });
  // 3. Kuis pilihan ganda
  d.addEventListener('click',function(e){
    var opt=e.target.closest('[data-mai-quiz]');
    if(!opt)return;
    var gid=opt.getAttribute('data-mai-quiz');
    var group=opt.closest('.mai-example');
    if(!group)return;
    var correct=opt.getAttribute('data-correct')==='1';
    group.querySelectorAll('[data-mai-quiz="'+gid+'"]').forEach(function(o){
      o.classList.remove('correct','wrong');
      o.disabled=false;
    });
    opt.classList.add(correct?'correct':'wrong');
    if(!correct){
      var right=group.querySelector('[data-mai-quiz="'+gid+'"][data-correct="1"]');
      if(right)right.classList.add('correct');
    }
    var fb=group.querySelector('[data-mai-feedback-'+gid+']');
    if(fb){fb.textContent=correct?'Benar!':'Jawaban yang tepat disorot hijau.';fb.style.color=correct?'#1f9d43':'#d92b20';}
    var exp=group.querySelector('[data-mai-exp-'+gid+']');
    if(exp)exp.removeAttribute('hidden');
  });
  // 4. Drag & drop dengan fallback tap-to-select (aksesibel di HP)
  var selected=null;
  function clearSel(gid){d.querySelectorAll('[data-mai-dd-item="'+gid+'"]').forEach(function(i){i.style.outline='';i.classList.remove('mai-dd-sel');});selected=null;}
  d.addEventListener('click',function(e){
    var item=e.target.closest('[data-mai-dd-item]');
    var target=e.target.closest('[data-mai-dd-target]');
    if(item){
      var gid=item.getAttribute('data-mai-dd-item');
      clearSel(gid);
      selected=item;
      item.style.outline='2px solid #0a84ff';
      item.classList.add('mai-dd-sel');
      e.preventDefault();return;
    }
    if(target&&selected){
      var gid2=target.getAttribute('data-mai-dd-target');
      if(selected.getAttribute('data-mai-dd-item')!==gid2){return;}
      if(target.querySelector('.mai-dd-placed'))return;
      var placed=d.createElement('span');
      placed.className='mai-dd-placed';
      placed.textContent=selected.textContent;
      placed.setAttribute('data-placed',selected.textContent);
      target.textContent='';
      target.appendChild(placed);
      target.style.color='var(--mai-ink)';
      selected.remove();
      clearSel(gid2);
      e.preventDefault();return;
    }
  });
  // HTML5 drag untuk desktop
  d.addEventListener('dragstart',function(e){
    var item=e.target.closest('[data-mai-dd-item]');
    if(!item)return;
    e.dataTransfer.setData('text/plain',item.textContent);
    e.dataTransfer.effectAllowed='move';
  });
  d.addEventListener('dragover',function(e){
    if(e.target.closest('[data-mai-dd-target]'))e.preventDefault();
  });
  d.addEventListener('drop',function(e){
    var target=e.target.closest('[data-mai-dd-target]');
    if(!target)return;
    e.preventDefault();
    var txt=e.dataTransfer.getData('text/plain');
    if(!txt||target.querySelector('.mai-dd-placed'))return;
    var placed=d.createElement('span');
    placed.className='mai-dd-placed';
    placed.textContent=txt;
    placed.setAttribute('data-placed',txt);
    target.textContent='';
    target.appendChild(placed);
    target.style.color='var(--mai-ink)';
    var item=d.querySelector('[data-mai-dd-item]');
    d.querySelectorAll('[data-mai-dd-item]').forEach(function(i){if(i.textContent===txt)i.remove();});
  });
  // 5. Periksa drag-drop
  d.addEventListener('click',function(e){
    var btn=e.target.closest('[data-mai-dd-check]');
    if(!btn)return;
    var gid=btn.getAttribute('data-mai-dd-check');
    var wrap=btn.closest('.mai-example');
    if(!wrap)return;
    var fb=wrap.querySelector('[data-mai-feedback]');
    var targets=wrap.querySelectorAll('[data-mai-dd-target="'+gid+'"]');
    var allOk=true,count=0;
    targets.forEach(function(t){
      var placed=t.querySelector('.mai-dd-placed');
      var ans=t.getAttribute('data-answer');
      if(!placed){allOk=false;return;}
      count++;
      var ok=String(placed.getAttribute('data-placed')||'').trim()===String(ans||'').trim();
      t.style.borderColor=ok?'#30d158':'#ff453a';
      if(!ok)allOk=false;
    });
    if(!fb)return;
    if(count===0){fb.textContent='Letakkan semua jawaban dulu.';fb.style.color='#b25f00';return;}
    fb.textContent=allOk?'Semua benar! Kerja bagil.':count+'/'+targets.length+' tepat. Periksa yang merah.';
    fb.style.color=allOk?'#1f9d43':'#d92b20';
  });
})();
<\/script>`;
}

/** Bangun dokumen HTML standalone (untuk iframe siswa / simpan / ekspor). */
export function buildMaterialHtml(material, meta = {}, options = {}) {
  const editable = options.editable === true;
  const body = buildMaterialBody(material, meta, { editable });
  const hasChart = materialHasChart(material);
  const needsJsxgraph = materialNeedsJsxgraph(material);
  const chartHead = hasChart
    ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>'
    : '';
  const jxgHead = needsJsxgraph
    ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsxgraph@1.10.1/distrib/jsxgraph.css">\n<script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.10.1/distrib/jsxgraphcore.js"></script>'
    : '';
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(material?.title || 'Materi Pembelajaran')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
${chartHead}
${jxgHead}
<style>.mai-dd-placed{display:inline-block;background:rgba(var(--mai-brand-rgb),.1);border-radius:8px;padding:2px 8px;font-weight:600;color:var(--mai-brand);}.mai-dd-sel{opacity:.6;}</style>
</head>
<body>
${body}
${getInteractionScript()}
${hasChart ? getChartScript() : ''}
${needsJsxgraph ? getVisualScript() : ''}
${editable ? getEditBridgeScript() : ''}
</body>
</html>`;
}

/**
 * Script penggambar grafik (self-contained, dijalankan di dalam iframe materi).
 * Membaca DATA dari atribut data-mai-chart lalu menggambar via Chart.js.
 * Ekspresi grafik "function" dievaluasi oleh parser aman (bukan eval/Function),
 * sehingga AI tidak pernah dapat menyuntikkan kode yang dieksekusi.
 */
function getChartScript() {
  return `<script>
(function(){
  var PALETTE=['#0a84ff','#5e5ce6','#30d158','#ff9f0a','#ff453a','#64d2ff','#bf5af2','#ffd60a'];
  function withAlpha(hex,a){var n=parseInt(hex.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}

  // ---- Parser ekspresi matematika aman (recursive descent) ----
  function makeEvaluator(expr){
    var s=String(expr||''), i=0;
    var FUNCS={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,
      sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,ln:Math.log,log:function(v){return Math.log(v)/Math.LN10;},
      log10:function(v){return Math.log(v)/Math.LN10;},floor:Math.floor,ceil:Math.ceil,round:Math.round};
    var CONSTS={pi:Math.PI,e:Math.E};
    function ws(){while(i<s.length&&/\\s/.test(s[i]))i++;}
    function peek(){ws();return s[i];}
    function parseExpr(){var v=parseTerm();for(;;){var c=peek();if(c==='+'){i++;v+=parseTerm();}else if(c==='-'){i++;v-=parseTerm();}else return v;}}
    function parseTerm(){var v=parseUnary();for(;;){var c=peek();if(c==='*'){i++;v*=parseUnary();}else if(c==='/'){i++;v/=parseUnary();}else return v;}}
    function parseUnary(){var c=peek();if(c==='-'){i++;return -parseUnary();}if(c==='+'){i++;return parseUnary();}return parsePower();}
    function parsePower(){var v=parseBase();var c=peek();if(c==='^'){i++;v=Math.pow(v,parseUnary());}return v;}
    function parseBase(x){
      ws();var c=s[i];
      if(c==='('){i++;var v=parseExpr();ws();if(s[i]===')')i++;return v;}
      if(/[0-9.]/.test(c)){var start=i;while(i<s.length&&/[0-9.]/.test(s[i]))i++;
        if(s[i]==='e'||s[i]==='E'){/* biar identifier 'e' ditangani terpisah bila bukan eksponen angka */}
        return parseFloat(s.slice(start,i));}
      if(/[a-zA-Z]/.test(c)){var st=i;while(i<s.length&&/[a-zA-Z0-9_]/.test(s[i]))i++;var name=s.slice(st,i).toLowerCase();
        ws();
        if(s[i]==='('){i++;var arg=parseExpr();ws();if(s[i]===')')i++;var fn=FUNCS[name];return fn?fn(arg):NaN;}
        if(name==='x')return CURRENT_X;
        if(CONSTS[name]!=null)return CONSTS[name];
        return NaN;}
      // token tak dikenal
      i++;return NaN;
    }
    var CURRENT_X=0;
    return function(xVal){CURRENT_X=xVal;i=0;try{var r=parseExpr();return (typeof r==='number'&&isFinite(r))?r:null;}catch(_){return null;}};
  }

  function sampleFunction(spec){
    var f=makeEvaluator(spec.expr);
    var xMin=Number(spec.xMin),xMax=Number(spec.xMax);
    if(!isFinite(xMin)||!isFinite(xMax)||xMax<=xMin){xMin=-10;xMax=10;}
    var N=200,pts=[],step=(xMax-xMin)/N;
    for(var k=0;k<=N;k++){var x=xMin+step*k;var y=f(x);if(y!=null)pts.push({x:Number(x.toFixed(6)),y:Number(y.toFixed(6))});}
    return pts;
  }

  function baseOpts(spec,showLegend){
    var o={responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'nearest'},
      plugins:{legend:{display:!!showLegend,labels:{font:{size:11}}},tooltip:{enabled:true}},scales:{}};
    return o;
  }
  function axisScales(spec,linearX){
    var sc={x:{title:{display:!!spec.xLabel,text:spec.xLabel||''},ticks:{font:{size:10}}},
      y:{title:{display:!!spec.yLabel,text:spec.yLabel||''},ticks:{font:{size:10}},beginAtZero:true}};
    if(linearX)sc.x.type='linear';
    return sc;
  }

  function buildConfig(spec){
    var type=String(spec.type||'').toLowerCase();
    if(type==='function'){
      var pts=sampleFunction(spec);
      var o=baseOpts(spec,false);o.scales=axisScales(spec,true);o.scales.y.beginAtZero=false;o.elements={point:{radius:0}};
      return {type:'line',data:{datasets:[{label:spec.title||'f(x)',data:pts,borderColor:PALETTE[0],backgroundColor:withAlpha(PALETTE[0],.12),borderWidth:2,tension:.25,fill:false}]},options:o};
    }
    if(type==='scatter'){
      var pts2=(spec.points||[]).map(function(p){return {x:p[0],y:p[1]};});
      var o2=baseOpts(spec,false);o2.scales=axisScales(spec,true);o2.scales.y.beginAtZero=false;
      return {type:'scatter',data:{datasets:[{label:spec.title||'Data',data:pts2,borderColor:PALETTE[0],backgroundColor:withAlpha(PALETTE[0],.6)}]},options:o2};
    }
    if(type==='pie'){
      var data=(spec.series&&spec.series[0]&&spec.series[0].data)||[];
      var colors=data.map(function(_,idx){return PALETTE[idx%PALETTE.length];});
      var o3=baseOpts(spec,true);
      return {type:'pie',data:{labels:spec.labels||[],datasets:[{data:data,backgroundColor:colors,borderColor:'#fff',borderWidth:1}]},options:o3};
    }
    // line | bar
    var series=spec.series||[];
    var ds=series.map(function(sr,idx){var col=PALETTE[idx%PALETTE.length];
      return {label:sr.name||('Seri '+(idx+1)),data:sr.data||[],borderColor:col,backgroundColor:type==='bar'?withAlpha(col,.75):withAlpha(col,.14),borderWidth:2,tension:.25,fill:type==='line'?false:true};});
    var o4=baseOpts(spec,series.length>1);o4.scales=axisScales(spec,false);
    return {type:type==='bar'?'bar':'line',data:{labels:spec.labels||[],datasets:ds},options:o4};
  }

  function draw(){
    var nodes=document.querySelectorAll('[data-mai-chart]');
    if(!nodes.length)return;
    nodes.forEach(function(canvas){
      var box=canvas.parentNode;
      var fb=box?box.querySelector('[data-mai-chart-fallback]'):null;
      if(typeof window.Chart==='undefined'){if(fb)fb.hidden=false;return;}
      var spec;try{spec=JSON.parse(canvas.getAttribute('data-mai-chart'));}catch(_){if(fb)fb.hidden=false;return;}
      try{new window.Chart(canvas.getContext('2d'),buildConfig(spec));}
      catch(err){if(fb){fb.hidden=false;fb.textContent='Grafik gagal dimuat.';}}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);else draw();
})();
<\/script>`;
}

/**
 * Script penggambar visual matematika lanjutan (graph & geometry) via JSXGraph.
 * Membaca DATA dari atribut data-mai-viz. Ekspresi fungsi dievaluasi parser aman
 * berparameter (bukan eval), sehingga AI tak pernah mengeksekusi kode.
 */
function getVisualScript() {
  return `<script>
(function(){
  var PAL=['#0a84ff','#5e5ce6','#30d158','#ff9f0a','#ff453a','#bf5af2'];

  // Evaluator aman berparameter: resolve(name) memberi nilai x / parameter slider.
  function evalExpr(expr, resolve){
    var s=String(expr||''), i=0;
    var FUNCS={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,
      sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,ln:Math.log,log:function(v){return Math.log(v)/Math.LN10;},
      floor:Math.floor,ceil:Math.ceil,round:Math.round};
    var CONSTS={pi:Math.PI,e:Math.E};
    function ws(){while(i<s.length&&/\\s/.test(s[i]))i++;}
    function peek(){ws();return s[i];}
    function pExpr(){var v=pTerm();for(;;){var c=peek();if(c==='+'){i++;v+=pTerm();}else if(c==='-'){i++;v-=pTerm();}else return v;}}
    function pTerm(){var v=pUnary();for(;;){var c=peek();if(c==='*'){i++;v*=pUnary();}else if(c==='/'){i++;v/=pUnary();}else return v;}}
    function pUnary(){var c=peek();if(c==='-'){i++;return -pUnary();}if(c==='+'){i++;return pUnary();}return pPow();}
    function pPow(){var v=pBase();var c=peek();if(c==='^'){i++;v=Math.pow(v,pUnary());}return v;}
    function pBase(){ws();var c=s[i];
      if(c==='('){i++;var v=pExpr();ws();if(s[i]===')')i++;return v;}
      if(/[0-9.]/.test(c)){var st=i;while(i<s.length&&/[0-9.]/.test(s[i]))i++;return parseFloat(s.slice(st,i));}
      if(/[a-zA-Z]/.test(c)){var a=i;while(i<s.length&&/[a-zA-Z0-9_]/.test(s[i]))i++;var name=s.slice(a,i).toLowerCase();
        ws();
        if(s[i]==='('){i++;var arg=pExpr();ws();if(s[i]===')')i++;var fn=FUNCS[name];return fn?fn(arg):NaN;}
        if(CONSTS[name]!=null)return CONSTS[name];
        var r=resolve(name);return (r==null||isNaN(r))?NaN:r;}
      i++;return NaN;
    }
    try{var res=pExpr();return (typeof res==='number'&&isFinite(res))?res:null;}catch(_){return null;}
  }
  function makeFn(expr,sliders){return function(x){return evalExpr(expr,function(n){
    if(n==='x')return x;for(var k=0;k<sliders.length;k++){if(sliders[k].name===n)return sliders[k].obj.Value();}return null;});};}

  function drawGraph(el,spec){
    var xMin=Number(spec.xMin),xMax=Number(spec.xMax);
    if(!(xMax>xMin)){xMin=-10;xMax=10;}
    var params=spec.params||[];
    var initResolve=function(n){if(n==='x')return 0;for(var k=0;k<params.length;k++){if(params[k].name===n)return params[k].value;}return null;};
    var yMin=spec.yMin,yMax=spec.yMax;
    if(yMin==null||yMax==null){
      var lo=Infinity,hi=-Infinity,N=60;
      for(var q=0;q<=N;q++){var xx=xMin+(xMax-xMin)*q/N;
        for(var fi=0;fi<spec.functions.length;fi++){var yy=evalExpr(spec.functions[fi].expr,function(n){return n==='x'?xx:initResolve(n);});
          if(yy!=null){if(yy<lo)lo=yy;if(yy>hi)hi=yy;}}}
      if(!isFinite(lo)||!isFinite(hi)){lo=-10;hi=10;}
      if(hi-lo<1){hi+=1;lo-=1;}
      var pad=(hi-lo)*0.15;yMin=lo-pad;yMax=hi+pad;
      if(yMin<-1000)yMin=-1000;if(yMax>1000)yMax=1000;
    }
    var board=JXG.JSXGraph.initBoard(el.id,{boundingbox:[xMin,yMax,xMax,yMin],axis:true,showCopyright:false,showNavigation:false,keepAspectRatio:false,pan:{enabled:false}});
    var sliders=[];
    for(var p=0;p<params.length;p++){var pr=params[p];
      var xa=xMin+(xMax-xMin)*0.06, xb=xMin+(xMax-xMin)*0.44, yy=yMax-(p+1)*(yMax-yMin)*0.09;
      var sl=board.create('slider',[[xa,yy],[xb,yy],[pr.min,pr.value,pr.max]],{name:pr.name,snapWidth:pr.step||null,strokeColor:PAL[p%PAL.length],fillColor:PAL[p%PAL.length]});
      sliders.push({name:pr.name,obj:sl});
    }
    for(var f=0;f<spec.functions.length;f++){(function(fn,idx){
      board.create('functiongraph',[makeFn(fn.expr,sliders),xMin,xMax],{strokeColor:PAL[idx%PAL.length],strokeWidth:2.5,name:fn.label||'',withLabel:!!fn.label});
    })(spec.functions[f],f);}
  }

  function drawGeometry(el,spec){
    var xs=spec.points.map(function(p){return p.x;}),ys=spec.points.map(function(p){return p.y;});
    var minx=Math.min.apply(null,xs),maxx=Math.max.apply(null,xs),miny=Math.min.apply(null,ys),maxy=Math.max.apply(null,ys);
    var padX=Math.max(1,(maxx-minx)*0.25),padY=Math.max(1,(maxy-miny)*0.25);
    var board=JXG.JSXGraph.initBoard(el.id,{boundingbox:[minx-padX,maxy+padY,maxx+padX,miny-padY],axis:false,showCopyright:false,showNavigation:false,keepAspectRatio:true});
    var P={};
    spec.points.forEach(function(pt){P[pt.name]=board.create('point',[pt.x,pt.y],{name:pt.label||pt.name,fixed:true,size:2,strokeColor:'#1d1d1f',fillColor:'#1d1d1f',label:{offset:[6,6]}});});
    (spec.polygons||[]).forEach(function(pg){var verts=pg.map(function(n){return P[n];});if(verts.every(Boolean))board.create('polygon',verts,{fillColor:'#0a84ff',fillOpacity:0.08,borders:{strokeColor:'#0a84ff',strokeWidth:2}});});
    (spec.segments||[]).forEach(function(sg){if(P[sg[0]]&&P[sg[1]])board.create('segment',[P[sg[0]],P[sg[1]]],{strokeColor:'#0a84ff',strokeWidth:2});});
    (spec.circles||[]).forEach(function(c){if(!P[c.center])return;if(c.radius!=null)board.create('circle',[P[c.center],c.radius],{strokeColor:'#5e5ce6'});else if(P[c.through])board.create('circle',[P[c.center],P[c.through]],{strokeColor:'#5e5ce6'});});
    (spec.rightAngles||[]).forEach(function(a){if(P[a[0]]&&P[a[1]]&&P[a[2]])board.create('angle',[P[a[0]],P[a[1]],P[a[2]]],{type:'square',radius:Math.max(0.4,(maxx-minx)*0.08),fillColor:'#ff9f0a',fillOpacity:0.4});});
  }

  function draw(){
    var nodes=document.querySelectorAll('[data-mai-viz]');
    if(!nodes.length)return;
    nodes.forEach(function(el){
      var box=el.parentNode;var fb=box?box.querySelector('[data-mai-viz-fallback]'):null;
      if(typeof window.JXG==='undefined'){if(fb)fb.hidden=false;return;}
      var spec;try{spec=JSON.parse(el.getAttribute('data-mai-viz'));}catch(_){if(fb)fb.hidden=false;return;}
      try{if(spec.kind==='graph')drawGraph(el,spec);else if(spec.kind==='geometry')drawGeometry(el,spec);}
      catch(err){if(fb){fb.hidden=false;fb.textContent='Visual gagal dimuat.';}}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);else draw();
})();
<\/script>`;
}

/**
 * Script jembatan mode editable: saat tombol "Edit bagian ini" diklik, kirim
 * pesan ke aplikasi induk (postMessage) berisi target section + label. Aplikasi
 * lalu mengarahkan instruksi chat ke bagian tersebut (klik-untuk-perbaiki).
 */
function getEditBridgeScript() {
  return `<script>
(function(){
  var d=document;
  d.addEventListener('click',function(e){
    var btn=e.target.closest('[data-mai-edit]');
    if(!btn)return;
    e.preventDefault();
    var target=btn.getAttribute('data-mai-edit');
    var label=btn.getAttribute('data-mai-label')||target;
    d.querySelectorAll('.mai-editsec-active').forEach(function(el){el.classList.remove('mai-editsec-active');});
    var sec=btn.closest('.mai-editsec');
    if(sec)sec.classList.add('mai-editsec-active');
    try{ parent.postMessage({ type:'mai-edit-section', target:target, label:label }, '*'); }catch(_){}
  });
})();
<\/script>`;
}

export const __testing = { renderBlocks, renderInline, escapeHtml, renderConcept, getStyles };
