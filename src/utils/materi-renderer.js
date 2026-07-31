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

function getStyles() {
  return `
    :root { color-scheme: light; --mai-bg:#f5f5f7; --mai-card:#ffffff; --mai-ink:#1d1d1f; --mai-muted:#6e6e73; --mai-line:rgba(0,0,0,.06); --mai-brand:#0a84ff; --mai-brand2:#5e5ce6; --mai-green:#30d158; --mai-amber:#ffd60a; --mai-rose:#ff453a; --mai-radius:20px; --mai-shadow:0 10px 30px -18px rgba(0,0,0,.25); }
    .mai-page { max-width:820px; margin:0 auto; padding:16px 14px 44px; font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Inter,Arial,sans-serif; background:var(--mai-bg); color:var(--mai-ink); -webkit-font-smoothing:antialiased; line-height:1.6; }
    .mai-card { background:var(--mai-card); border-radius:var(--mai-radius); box-shadow:var(--mai-shadow); border:1px solid var(--mai-line); padding:18px 18px; margin-bottom:14px; }
    .mai-hero { background:linear-gradient(135deg,#0a84ff,#5e5ce6); color:#fff; border:none; }
    .mai-eyebrow { margin:0 0 4px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; opacity:.78; }
    .mai-hero h1 { margin:0; font-size:clamp(1.45rem,4.4vw,2rem); line-height:1.15; font-weight:700; letter-spacing:-.02em; }
    .mai-sub { margin:8px 0 0; font-size:.85rem; opacity:.85; }
    .mai-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
    .mai-chip { background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.22); border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; }
    .mai-hook { font-size:.98rem; line-height:1.65; border-left:4px solid var(--mai-brand); background:linear-gradient(90deg,rgba(10,132,255,.06),transparent 60%); }
    .mai-h { display:flex; align-items:center; gap:10px; margin:0 0 12px; }
    .mai-h-ic { flex:none; width:30px; height:30px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg,rgba(10,132,255,.14),rgba(94,92,230,.14)); color:var(--mai-brand); font-size:15px; }
    .mai-h h2 { margin:0; font-size:1.12rem; font-weight:700; letter-spacing:-.01em; }
    .mai-h-sub { font-size:.74rem; color:var(--mai-muted); margin:2px 0 0; font-weight:500; }
    .mai-list { margin:.5em 0; padding-left:1.2rem; }
    .mai-list li { margin:.35em 0; }
    .mai-concept-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .mai-badge { flex:none; min-width:26px; height:26px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; background:var(--mai-ink); color:#fff; font-size:.78rem; font-weight:700; padding:0 6px; }
    .mai-concept-head h3 { margin:0; font-size:1.02rem; font-weight:700; }
    .mai-variant { font-size:.66rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--mai-brand); background:rgba(10,132,255,.1); border-radius:999px; padding:2px 8px; margin-left:auto; }
    .mai-table-wrap { overflow-x:auto; margin:10px 0; border-radius:12px; border:1px solid var(--mai-line); }
    .mai-table { width:100%; border-collapse:collapse; font-size:.86rem; }
    .mai-table th, .mai-table td { padding:9px 12px; text-align:left; border-bottom:1px solid var(--mai-line); }
    .mai-table th { background:#f5f5f7; font-weight:700; }
    .mai-table tr:last-child td { border-bottom:none; }
    .mai-highlight { display:flex; gap:10px; border-radius:14px; padding:12px 14px; margin:10px 0; font-size:.9rem; align-items:flex-start; }
    .mai-highlight-ic { flex:none; font-size:16px; line-height:1.4; }
    .mai-hl-penting { background:rgba(255,214,10,.14); border:1px solid rgba(255,214,10,.4); }
    .mai-hl-miskonsepsi { background:rgba(255,69,58,.1); border:1px solid rgba(255,69,58,.3); }
    .mai-hl-perhatian { background:rgba(255,159,10,.12); border:1px solid rgba(255,159,10,.35); }
    .mai-hl-info { background:rgba(10,132,255,.1); border:1px solid rgba(10,132,255,.28); }
    .mai-example { border:1px solid var(--mai-line); border-radius:16px; padding:14px; margin:10px 0; background:#fcfcfd; }
    .mai-example-q { font-weight:600; margin:0 0 10px; }
    .mai-steps-toggle { border:none; background:linear-gradient(135deg,var(--mai-brand),var(--mai-brand2)); color:#fff; font-weight:600; font-size:.8rem; border-radius:999px; padding:8px 14px; cursor:pointer; }
    .mai-steps { margin-top:12px; border-top:1px dashed var(--mai-line); padding-top:12px; }
    .mai-step { display:flex; gap:10px; margin:8px 0; }
    .mai-step-n { flex:none; width:22px; height:22px; border-radius:999px; background:rgba(10,132,255,.12); color:var(--mai-brand); font-size:.72rem; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
    .mai-answer { margin-top:10px; background:rgba(48,209,88,.12); border:1px solid rgba(48,209,88,.3); border-radius:12px; padding:10px 12px; font-size:.9rem; }
    .mai-fill { display:inline-block; min-width:72px; border:none; border-bottom:2px solid var(--mai-brand); background:rgba(10,132,255,.06); border-radius:6px 6px 0 0; padding:2px 8px; font-size:.9em; text-align:center; }
    .mai-quiz-opt { display:block; width:100%; text-align:left; border:1px solid var(--mai-line); background:#fff; border-radius:12px; padding:10px 12px; margin:6px 0; cursor:pointer; font-size:.9rem; transition:.15s ease; }
    .mai-quiz-opt:hover { border-color:var(--mai-brand); }
    .mai-quiz-opt.correct { background:rgba(48,209,88,.12); border-color:var(--mai-green); }
    .mai-quiz-opt.wrong { background:rgba(255,69,58,.1); border-color:var(--mai-rose); }
    .mai-quiz-feedback { font-size:.82rem; margin-top:6px; }
    .mai-dd { display:grid; gap:8px; margin:8px 0; }
    .mai-dd-row { display:flex; gap:8px; align-items:center; }
    .mai-dd-item { flex:1; border:1px solid var(--mai-line); background:#fff; border-radius:12px; padding:10px 12px; font-size:.88rem; }
    .mai-dd-target { flex:1; border:1.5px dashed rgba(10,132,255,.4); background:rgba(10,132,255,.05); border-radius:12px; min-height:42px; padding:10px 12px; font-size:.88rem; color:var(--mai-muted); }
    .mai-math-display { overflow-x:auto; margin:10px 0; padding:12px 14px; background:#f5f5f7; border:1px solid var(--mai-line); border-radius:12px; }
    .mai-math-inline { display:inline-flex; max-width:100%; overflow-x:auto; vertical-align:middle; }
    .mai-code { background:#f5f5f7; padding:2px 6px; border-radius:6px; font-size:.88em; font-family:ui-monospace,Menlo,monospace; }
    .mai-roles { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
    .mai-role { background:rgba(94,92,230,.1); color:var(--mai-brand2); border-radius:999px; padding:4px 10px; font-size:.74rem; font-weight:600; }
    .mai-divider { height:1px; background:var(--mai-line); margin:14px 0; }
    @media (max-width:640px){ .mai-page{padding:12px 10px 32px;} .mai-card{padding:15px 14px; border-radius:16px;} .mai-dd-row{flex-direction:column;} .mai-dd-item,.mai-dd-target{width:100%;} }
    @media print { .mai-page{background:#fff; padding:0;} .mai-card{box-shadow:none; border:1px solid #ddd; page-break-inside:avoid;} .mai-hero{background:#0a84ff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact;} .mai-steps-toggle{display:none;} .mai-steps{display:block !important;} }
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
  return `<div class="mai-card">
    <div class="mai-concept-head"><span class="mai-badge">${index + 1}</span><h3>${escapeHtml(concept.heading || `Konsep ${index + 1}`)}</h3><span class="mai-variant">${escapeHtml(variant)}</span></div>
    ${renderBlocks(concept.content)}
    ${tableHtml}
  </div>`;
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
  return `<style>${getStyles()}${editStyles}</style><div class="mai-page${editable ? ' mai-editable' : ''}">${parts.join('')}</div>`;
}

/** CSS tambahan untuk mode editable (klik-untuk-perbaiki). */
function getEditableStyles() {
  return `
    .mai-editsec { position:relative; }
    .mai-editsec > .mai-editbtn { position:absolute; top:6px; right:6px; z-index:5; opacity:0; transform:translateY(-4px); transition:opacity .18s ease, transform .18s ease; border:none; border-radius:999px; padding:6px 12px; font-size:.72rem; font-weight:700; color:#fff; background:linear-gradient(135deg,#0a84ff,#5e5ce6); box-shadow:0 8px 20px -8px rgba(10,132,255,.7); cursor:pointer; }
    .mai-editsec:hover > .mai-editbtn, .mai-editsec:focus-within > .mai-editbtn { opacity:1; transform:translateY(0); }
    .mai-editsec:hover > .mai-card, .mai-editsec.mai-editsec-active > .mai-card { outline:2px solid rgba(10,132,255,.45); outline-offset:2px; }
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
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(material?.title || 'Materi Pembelajaran')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
<style>.mai-dd-placed{display:inline-block;background:rgba(10,132,255,.1);border-radius:8px;padding:2px 8px;font-weight:600;color:var(--mai-brand);}.mai-dd-sel{opacity:.6;}</style>
</head>
<body>
${body}
${getInteractionScript()}
${editable ? getEditBridgeScript() : ''}
</body>
</html>`;
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
