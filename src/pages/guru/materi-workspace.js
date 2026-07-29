import { renderLayout } from '../../layouts/dashboard-layout.js';
import { deleteMaterialWorkspaceDraft, getMaterialWorkspaceDrafts, saveMaterialWorkspaceDraft, savePublishedMaterial, getActiveTeachingAssignments } from '../../firebase/data-service.js';

const STORAGE_KEY = 'simguru_material_workspace_draft';
const HISTORY_LIMIT = 50;
const BLOCKS = [
  { type: 'heading', label: 'Heading', hint: 'Judul dan subjudul', icon: 'H' },
  { type: 'text', label: 'Text', hint: 'Paragraf materi', icon: 'T' },
  { type: 'image', label: 'Image', hint: 'Gambar dari URL', icon: 'I' },
  { type: 'divider', label: 'Divider', hint: 'Pemisah konten', icon: '—' },
  { type: 'button', label: 'Button', hint: 'Tombol tindakan', icon: '→' },
  { type: 'spacer', label: 'Spacer', hint: 'Ruang antar bagian', icon: '·' },
  { type: 'formula', label: 'Formula', hint: 'Rumus matematika (KaTeX)', icon: '∑' },
  { type: 'quiz', label: 'Kuis', hint: 'Pilihan ganda', icon: '?' },
  { type: 'highlight', label: 'Highlight', hint: 'Catatan penting', icon: '★' },
  { type: 'example', label: 'Contoh', hint: 'Contoh soal & pembahasan', icon: '✎' },
  { type: 'exercise', label: 'Latihan', hint: 'Soal latihan', icon: '✓' },
  { type: 'table', label: 'Tabel', hint: 'Tabel data', icon: '▦' },
  { type: 'code', label: 'Kode', hint: 'Cuplikan kode', icon: '</>' },
  { type: 'definition', label: 'Definisi', hint: 'Istilah dan definisi', icon: 'D' },
];

const THEMES = {
  education: { name: 'Education Blue', primary: '#2563eb', accent: '#f59e0b', background: '#f8fafc', surface: '#ffffff', text: '#0f172a' },
  minimal: { name: 'Minimal White', primary: '#334155', accent: '#64748b', background: '#ffffff', surface: '#ffffff', text: '#0f172a' },
  green: { name: 'Green Science', primary: '#15803d', accent: '#eab308', background: '#f0fdf4', surface: '#ffffff', text: '#14532d' },
  dark: { name: 'Dark Focus', primary: '#60a5fa', accent: '#fbbf24', background: '#0f172a', surface: '#1e293b', text: '#f8fafc' },
};

const LAYOUTS = {
  single: { name: 'Single Column', icon: '▦', columns: 1, hasSidebar: false, hasFeatured: false },
  twoColumn: { name: 'Two Column', icon: '▧', columns: 2, hasSidebar: false, hasFeatured: false },
  sidebarLeft: { name: 'Sidebar Kiri', icon: '▨', columns: 1, hasSidebar: true, sidebarPosition: 'left', hasFeatured: false },
  sidebarRight: { name: 'Sidebar Kanan', icon: '▩', columns: 1, hasSidebar: true, sidebarPosition: 'right', hasFeatured: false },
  featured: { name: 'Featured', icon: '▥', columns: 2, hasSidebar: false, hasFeatured: true },
};

function uid(prefix = 'block') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
function documentIdToken(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'target'; }

function defaultDocument() {
  return {
    schemaVersion: 1,
    id: uid('materi'),
    meta: { title: 'Materi Baru', subject: '', className: '', duration: '2 JP' },
    theme: { ...THEMES.education },
    layout: 'single',
    blocks: [
      { id: uid(), type: 'heading', props: { text: 'Judul Materi Pembelajaran', level: 'h1', fontSize: 36, color: '#0f172a', align: 'left' } },
      { id: uid(), type: 'text', props: { text: 'Mulai tulis materi di sini. Klik dua kali pada teks untuk mengedit langsung.', fontSize: 16, color: '#334155', lineHeight: 1.6, align: 'left' } },
    ],
  };
}

function normalizeDocument(value) {
  const base = defaultDocument();
  if (!value || typeof value !== 'object') return base;
  return {
    ...base, ...value,
    meta: { ...base.meta, ...(value.meta || {}) },
    theme: { ...THEMES.education, ...(value.theme || {}) },
    layout: LAYOUTS[value.layout] ? value.layout : base.layout,
    blocks: Array.isArray(value.blocks) && value.blocks.length ? value.blocks : base.blocks,
  };
}

function createBlock(type) {
  const defaults = {
    heading: { text: 'Judul Bagian', level: 'h2', fontSize: 28, color: '#0f172a', align: 'left' },
    text: { text: 'Tulis isi materi di sini.', fontSize: 16, color: '#334155', lineHeight: 1.6, align: 'left' },
    image: { src: '', alt: 'Gambar materi', width: '100%', maxWidth: 720, height: 'auto', radius: 14, opacity: 100, caption: '' },
    divider: { color: '#e2e8f0', thickness: 1, margin: 18 },
    button: { text: 'Buka Materi', url: '#', color: '#2563eb', textColor: '#ffffff', radius: 12, align: 'left' },
    spacer: { height: 24 },
    formula: { latex: '', display: true, caption: '' },
    quiz: { question: '', options: ['', '', '', ''], correct: 0, explanation: '' },
    highlight: { type: 'penting', text: '' },
    example: { title: '', question: '', solution: '' },
    exercise: { question: '', hints: '', answer: '' },
    table: { headers: ['', ''], rows: [['', '']], caption: '' },
    code: { language: 'javascript', code: '', caption: '' },
    definition: { term: '', definition: '' },
  };
  return { id: uid(), type, props: { ...(defaults[type] || defaults.text) } };
}

function loadDocument() {
  try { return normalizeDocument(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { return defaultDocument(); }
}

function getSessionContext() {
  try {
    const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
    const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
    return { guruId: String(session?.user?.username || '').trim(), userName: String(session?.user?.nama || session?.user?.name || '').trim(), context };
  } catch {
    return { guruId: '', userName: '', context: {} };
  }
}

function pageStyles() {
  return `
    .mw { --mw-primary:#2563eb; --mw-bg:#f1f5f9; --mw-surface:#fff; --mw-text:#0f172a; --mw-muted:#64748b; --mw-line:#e2e8f0; min-height:calc(100vh - 2rem); color:var(--mw-text); }
    .mw * { box-sizing:border-box; }
    .mw-toolbar { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:8px; min-height:58px; padding:8px 12px; background:rgba(255,255,255,.9); border:1px solid rgba(226,232,240,.9); border-radius:16px; box-shadow:0 10px 28px -20px rgba(15,23,42,.35); backdrop-filter:blur(18px); }
    .mw-toolbar-title { min-width:140px; margin-right:auto; font-size:14px; font-weight:750; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mw-meta { display:grid; grid-template-columns:minmax(180px,2fr) minmax(120px,1fr) minmax(100px,1fr) minmax(90px,.7fr); gap:8px; margin-top:10px; }
    .mw-meta input,.mw-meta select { width:100%; border:1px solid var(--mw-line); border-radius:10px; padding:9px 10px; background:#fff; color:var(--mw-text); font-size:12px; }
    .mw-workspace-nav { display:flex; gap:4px; margin-top:10px; padding:4px; border:1px solid var(--mw-line); border-radius:12px; background:rgba(255,255,255,.72); overflow:auto; }
    .mw-nav-btn { flex:none; border:0; border-radius:9px; padding:8px 12px; background:transparent; color:#64748b; font-size:12px; font-weight:750; cursor:pointer; }
    .mw-nav-btn.active { background:#fff; color:var(--mw-primary); box-shadow:0 3px 10px rgba(15,23,42,.08); }
    .mw-overview { margin-top:12px; }
    .mw-overview-head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; padding:24px; border:1px solid var(--mw-line); border-radius:18px; background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(239,246,255,.82)); }
    .mw-eyebrow { margin:0 0 6px; color:var(--mw-primary); font-size:10px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
    .mw-overview h1 { margin:0; font-size:clamp(1.35rem,3vw,2rem); letter-spacing:-.035em; }
    .mw-overview-head p:not(.mw-eyebrow) { margin:7px 0 0; color:var(--mw-muted); font-size:13px; }
    .mw-overview-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:10px; }
    .mw-overview-grid article { padding:16px; border:1px solid var(--mw-line); border-radius:14px; background:rgba(255,255,255,.84); }
    .mw-stat-label { display:block; color:var(--mw-muted); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
    .mw-overview-grid strong { display:block; margin-top:10px; font-size:18px; } .mw-overview-grid small { display:block; margin-top:4px; color:var(--mw-muted); font-size:11px; line-height:1.4; }
    .mw-icon-btn,.mw-action-btn { border:1px solid var(--mw-line); background:#fff; color:#334155; border-radius:10px; min-height:34px; padding:0 10px; font-size:12px; font-weight:700; cursor:pointer; }
    .mw-icon-btn { width:34px; padding:0; font-size:15px; }
    .mw-icon-btn:disabled,.mw-action-btn:disabled { opacity:.4; cursor:not-allowed; }
    .mw-action-btn.primary { border-color:var(--mw-primary); background:var(--mw-primary); color:#fff; }
    .mw-action-btn:focus-visible,.mw-icon-btn:focus-visible,.mw-library-item:focus-visible,.mw-prop-input:focus-visible { outline:3px solid rgba(37,99,235,.22); outline-offset:2px; }
    .mw-viewports { display:flex; gap:4px; padding:3px; background:#f1f5f9; border-radius:10px; }
    .mw-viewport { border:0; background:transparent; color:#64748b; border-radius:7px; padding:6px 8px; font-size:11px; font-weight:700; cursor:pointer; }
    .mw-viewport.active { background:#fff; color:var(--mw-primary); box-shadow:0 2px 6px rgba(15,23,42,.1); }
    .mw-layout-select { border:1px solid var(--mw-line); border-radius:7px; padding:5px 8px; background:#fff; color:var(--mw-text); font-size:11px; font-weight:700; cursor:pointer; margin-left:6px; }
    .mw-layout-select:focus-visible { outline:3px solid rgba(37,99,235,.22); outline-offset:2px; }
    .mw-canvas[data-layout="twoColumn"] { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .mw-canvas[data-layout="sidebarLeft"] { display:grid; grid-template-columns:220px 1fr; gap:16px; }
    .mw-canvas[data-layout="sidebarRight"] { display:grid; grid-template-columns:1fr 220px; gap:16px; }
    .mw-canvas[data-layout="featured"] { display:grid; grid-template-columns:1fr; gap:16px; }
    .mw-canvas[data-layout="featured"] .mw-block.featured { grid-column:1 / -1; }
    .mw-canvas[data-layout="twoColumn"] .mw-block[data-layout-span="2"] { grid-column:span 2; }
    .mw-canvas[data-layout="sidebarLeft"] .mw-sidebar { grid-column:1; }
    .mw-canvas[data-layout="sidebarLeft"] .mw-main { grid-column:2; }
    .mw-canvas[data-layout="sidebarRight"] .mw-sidebar { grid-column:2; }
    .mw-canvas[data-layout="sidebarRight"] .mw-main { grid-column:1; }
    .mw-layout { display:grid; grid-template-columns:190px minmax(0,1fr) 240px; gap:12px; align-items:start; margin-top:12px; }
    .mw-panel { background:rgba(255,255,255,.92); border:1px solid var(--mw-line); border-radius:16px; overflow:hidden; }
    .mw-panel-head { display:flex; align-items:center; justify-content:space-between; padding:13px 14px 10px; border-bottom:1px solid #f1f5f9; font-size:12px; font-weight:800; }
    .mw-panel-sub { padding:10px 14px 6px; color:var(--mw-muted); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; }
    .mw-library { padding:6px; }
    .mw-library-item { display:flex; align-items:center; gap:9px; width:100%; margin:3px 0; padding:9px; border:1px solid transparent; border-radius:11px; background:transparent; color:#334155; text-align:left; cursor:grab; }
    .mw-library-item:hover { border-color:#bfdbfe; background:#eff6ff; color:#1d4ed8; }
    .mw-library-icon { display:inline-flex; align-items:center; justify-content:center; width:27px; height:27px; border-radius:8px; background:#eff6ff; color:var(--mw-primary); font-size:12px; font-weight:800; }
    .mw-library-label { font-size:12px; font-weight:700; } .mw-library-hint { display:block; color:#94a3b8; font-size:10px; font-weight:500; }
    .mw-canvas-wrap { min-width:0; padding:12px; background:var(--mw-bg); border:1px solid var(--mw-line); border-radius:16px; overflow:auto; }
    .mw-canvas { width:100%; min-height:680px; margin:0 auto; padding:20px; background:var(--mw-surface); color:var(--mw-text); border-radius:12px; transition:max-width .2s ease; }
    .mw-canvas[data-viewport="desktop"] { max-width:100%; } .mw-canvas[data-viewport="tablet"] { max-width:768px; } .mw-canvas[data-viewport="mobile"] { max-width:390px; }
    .mw-dropzone { height:10px; margin:3px 0; border-radius:6px; transition:background .15s, height .15s; } .mw-dropzone.active { height:32px; background:#dbeafe; outline:2px dashed #60a5fa; }
    .mw-block-definition { padding:14px 18px; border:1px solid #e2e8f0; border-radius:12px; background:#fafafa; margin:6px 0; }
    .mw-def-term { font-weight:700; font-size:14px; color:#0f172a; margin-bottom:4px; }
    .mw-def-definition { margin:0; color:#334155; font-size:13px; line-height:1.6; }
    .mw-block-quiz { padding:14px 18px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; margin:6px 0; }
    .mw-quiz-option { display:block; padding:8px 12px; margin:4px 0; border:1px solid #e2e8f0; border-radius:8px; font-size:13px; cursor:default; }
    .mw-quiz-option input { margin-right:8px; }
    .mw-quiz-explanation { margin-top:10px; padding:10px; background:#f0fdf4; border-radius:8px; font-size:12px; color:#14532d; }
    .mw-block-highlight { padding:12px 16px; border-radius:12px; margin:6px 0; font-size:13px; display:flex; gap:8px; align-items:flex-start; }
    .mw-hl-penting { background:#fef9c3; border:1px solid #fde047; }
    .mw-hl-miskonsepsi { background:#fee2e2; border:1px solid #fecaca; }
    .mw-hl-perhatian { background:#fef3c7; border:1px solid #fcd34d; }
    .mw-hl-info { background:#dbeafe; border:1px solid #93c5fd; }
    .mw-hl-icon { font-size:16px; flex:none; }
    .mw-block-example { padding:14px 18px; border:1px solid #e2e8f0; border-radius:12px; background:#fcfcfd; margin:6px 0; }
    .mw-example-title { font-weight:700; font-size:13px; color:#6366f1; margin:0 0 8px; }
    .mw-example-solution { margin-top:10px; padding:10px; background:#f0fdf4; border-radius:8px; font-size:12px; }
    .mw-block-exercise { padding:14px 18px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; margin:6px 0; }
    .mw-exercise-hints { font-size:12px; color:#64748b; margin-top:6px; }
    .mw-exercise-answer { margin-top:8px; font-size:12px; }
    .mw-exercise-answer summary { cursor:pointer; color:#2563eb; font-weight:600; }
    .mw-block-table { overflow-x:auto; margin:6px 0; }
    .mw-block-table table { width:100%; border-collapse:collapse; font-size:13px; }
    .mw-block-table th { background:#f1f5f9; padding:8px 12px; text-align:left; border-bottom:2px solid #e2e8f0; font-weight:700; font-size:12px; }
    .mw-block-table td { padding:6px 12px; border-bottom:1px solid #e2e8f0; font-size:12px; }
    .mw-block-code { background:#1e293b; border-radius:12px; padding:14px; margin:6px 0; overflow-x:auto; }
    .mw-block-code pre { margin:0; }
    .mw-block-code code { font-family:'Fira Code','Cascadia Code',monospace; font-size:12px; color:#e2e8f0; white-space:pre; }
    .mw-block-formula { padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin:6px 0; overflow-x:auto; }
    .mw-math-preview { font-size:16px; }
    .mw-block:hover { border-color:#dbeafe; } .mw-block.selected { border-color:#60a5fa; box-shadow:0 0 0 3px rgba(37,99,235,.1); }
    .mw-block-handle { position:absolute; top:10px; left:-1px; display:none; align-items:center; justify-content:center; width:21px; height:26px; border-radius:7px 0 0 7px; background:#dbeafe; color:#2563eb; font-size:13px; cursor:grab; }
    .mw-block.selected .mw-block-handle,.mw-block:hover .mw-block-handle { display:flex; }
    .mw-block-actions { position:absolute; top:-11px; right:6px; display:none; gap:3px; padding:3px; background:#fff; border:1px solid var(--mw-line); border-radius:8px; box-shadow:0 5px 12px rgba(15,23,42,.1); }
    .mw-block.selected .mw-block-actions { display:flex; } .mw-mini-btn { border:0; background:transparent; color:#64748b; cursor:pointer; padding:3px 5px; font-size:11px; } .mw-mini-btn:hover { color:#2563eb; }
    [contenteditable="true"] { outline:2px solid #93c5fd; outline-offset:3px; border-radius:4px; }
    .mw-image-placeholder { display:flex; align-items:center; justify-content:center; min-height:160px; border:2px dashed #cbd5e1; border-radius:14px; color:#94a3b8; font-size:12px; }
    .mw-image { display:block; max-width:100%; object-fit:cover; }
    .mw-properties { padding:12px; } .mw-prop-group { margin-bottom:13px; } .mw-prop-label { display:block; margin-bottom:5px; color:#64748b; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
    .mw-prop-input { width:100%; border:1px solid var(--mw-line); border-radius:9px; padding:8px 9px; background:#f8fafc; color:#0f172a; font-size:12px; }
    .mw-prop-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; } .mw-empty-props { padding:26px 14px; color:#94a3b8; text-align:center; font-size:12px; line-height:1.5; }
    .mw-status { min-height:18px; margin-top:7px; color:#64748b; font-size:11px; } .mw-toast { position:fixed; right:18px; bottom:18px; z-index:50; padding:10px 14px; border-radius:11px; background:#0f172a; color:#fff; font-size:12px; box-shadow:0 14px 30px -12px rgba(15,23,42,.4); }
    .mw-draft-list { display:grid; gap:10px; margin-top:12px; } .mw-draft-card { display:flex; align-items:center; gap:12px; padding:14px; border:1px solid var(--mw-line); border-radius:14px; background:#fff; } .mw-draft-card strong { display:block; font-size:13px; } .mw-draft-card small { display:block; margin-top:3px; color:var(--mw-muted); font-size:11px; } .mw-draft-actions { display:flex; gap:5px; margin-left:auto; } .mw-draft-empty { padding:28px 16px; border:1px dashed #cbd5e1; border-radius:14px; color:var(--mw-muted); text-align:center; font-size:12px; }
    @media (max-width:1023px) { .mw-layout { grid-template-columns:160px minmax(0,1fr); } .mw-properties { grid-column:1 / -1; } }
    @media (max-width:639px) { .mw-toolbar { position:sticky; top:0; flex-wrap:wrap; border-radius:12px; } .mw-toolbar-title { width:100%; min-width:0; margin:0; order:-2; } .mw-viewports { margin-left:auto; } .mw-layout { display:block; } .mw-panel.library-panel,.mw-panel.properties-panel { display:none; } .mw-panel.mobile-open { display:block; position:fixed; left:10px; right:10px; bottom:10px; z-index:40; max-height:72vh; overflow:auto; box-shadow:0 24px 60px -25px rgba(15,23,42,.45); } .mw-canvas-wrap { padding:7px; margin-top:8px; } .mw-canvas { min-height:560px; padding:11px; } .mw-mobile-tools { display:flex !important; } .mw-overview-head { align-items:stretch; flex-direction:column; padding:18px; } .mw-overview-grid { grid-template-columns:1fr; } .mw-meta { grid-template-columns:1fr 1fr; } }
    .mw-mobile-tools { display:none; gap:6px; margin-top:8px; }
    .mw-modal { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; }
    .mw-modal-backdrop { position:absolute; inset:0; background:rgba(15,23,42,.5); }
    .mw-modal-content { position:relative; background:#fff; border-radius:18px; box-shadow:0 24px 60px -25px rgba(15,23,42,.45); max-width:520px; width:90vw; max-height:80vh; overflow:auto; }
    .mw-modal-head { display:flex; align-items:center; justify-content:space-between; padding:18px 20px; border-bottom:1px solid #e2e8f0; }
    .mw-modal-head h3 { margin:0; font-size:16px; font-weight:750; }
    .mw-modal-body { padding:16px 20px; }
    .mw-modal-desc { margin:0 0 12px; color:#64748b; font-size:13px; }
    .mw-publish-targets { display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto; }
    .mw-publish-target { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; cursor:pointer; transition:background .15s; }
    .mw-publish-target:hover { background:#f8fafc; }
    .mw-publish-target input[type=checkbox] { accent-color:#2563eb; width:16px; height:16px; }
    .mw-publish-target-info { flex:1; }
    .mw-publish-target-name { font-size:13px; font-weight:700; }
    .mw-publish-target-meta { font-size:11px; color:#64748b; }
    .mw-modal-foot { display:flex; gap:8px; justify-content:flex-end; padding:14px 20px; border-top:1px solid #e2e8f0; }
    .mw-publish-result { margin-top:10px; padding:10px; border-radius:10px; font-size:12px; }
    .mw-publish-result.success { background:#f0fdf4; color:#14532d; border:1px solid #bbf7d0; }
    .mw-publish-result.partial { background:#fef9c3; color:#854d0e; border:1px solid #fde047; }
    .mw-publish-result.error { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
  `;
}

function renderBlock(block, selectedId) {
  const p = block.props || {};
  const selected = block.id === selectedId ? ' selected' : '';
  const style = block.type === 'heading' || block.type === 'text'
    ? `font-size:${Number(p.fontSize) || 16}px;color:${escapeAttr(p.color || '#0f172a')};line-height:${Number(p.lineHeight) || 1.5};text-align:${escapeAttr(p.align || 'left')}`
    : '';
  let content = '';
  if (block.type === 'heading') content = `<${p.level || 'h2'} class="mw-content-text" style="${style}">${escapeHtml(p.text || '')}</${p.level || 'h2'}>`;
  else if (block.type === 'text') content = `<p class="mw-content-text" style="${style}">${escapeHtml(p.text || '')}</p>`;
  else if (block.type === 'image') content = p.src ? `<img class="mw-image" src="${escapeAttr(p.src)}" alt="${escapeAttr(p.alt || '')}" style="width:${escapeAttr(p.width || '100%')};max-width:${Number(p.maxWidth) || 720}px;height:${escapeAttr(p.height || 'auto')};border-radius:${Number(p.radius) || 0}px;opacity:${(Number(p.opacity) || 100) / 100}">` : '<div class="mw-image-placeholder">Masukkan URL gambar di Properties</div>';
  else if (block.type === 'divider') content = `<div style="height:${Number(p.thickness) || 1}px;background:${escapeAttr(p.color || '#e2e8f0')};margin:${Number(p.margin) || 18}px 0"></div>`;
  else if (block.type === 'button') content = `<div style="text-align:${escapeAttr(p.align || 'left')}"><span style="display:inline-block;padding:10px 16px;border-radius:${Number(p.radius) || 12}px;background:${escapeAttr(p.color || '#2563eb')};color:${escapeAttr(p.textColor || '#fff')};font-size:13px;font-weight:700">${escapeHtml(p.text || '')}</span></div>`;
  else if (block.type === 'formula') content = `<div class="mw-block-formula"><div class="mw-math-preview" data-latex="${escapeAttr(p.latex || '')}" data-display="${p.display !== false}"></div>${p.caption ? `<small style="display:block;margin-top:7px;color:#64748b;text-align:center">${escapeHtml(p.caption)}</small>` : ''}</div>`;
  else if (block.type === 'quiz') content = `<div class="mw-block-quiz"><p class="mw-content-text" style="${style}">${escapeHtml(p.question || '')}</p>${(p.options || []).map((opt, i) => `<label class="mw-quiz-option"><input type="radio" name="quiz-${block.id}" value="${i}" ${i === (p.correct || 0) ? 'checked' : ''} disabled>${escapeHtml(opt || 'Opsi ' + (i + 1))}</label>`).join('')}${p.explanation ? `<p class="mw-quiz-explanation">${escapeHtml(p.explanation)}</p>` : ''}</div>`;
  else if (block.type === 'highlight') content = `<div class="mw-block-highlight mw-hl-${escapeAttr(p.type || 'penting')}"><span class="mw-hl-icon">★</span><span class="mw-hl-text">${escapeHtml(p.text || '')}</span></div>`;
  else if (block.type === 'example') content = `<div class="mw-block-example"><p class="mw-example-title">${escapeHtml(p.title || 'Contoh')}</p><p class="mw-content-text">${escapeHtml(p.question || '')}</p>${p.solution ? `<div class="mw-example-solution"><strong>Pembahasan:</strong> ${escapeHtml(p.solution)}</div>` : ''}</div>`;
  else if (block.type === 'exercise') content = `<div class="mw-block-exercise"><p class="mw-content-text">${escapeHtml(p.question || '')}</p>${p.hints ? `<p class="mw-exercise-hints"><strong>Petunjuk:</strong> ${escapeHtml(p.hints)}</p>` : ''}${p.answer ? `<details class="mw-exercise-answer"><summary>Lihat jawaban</summary>${escapeHtml(p.answer)}</details>` : ''}</div>`;
  else if (block.type === 'table') { const headers = (p.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join(''); const rows = (p.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell || '')}</td>`).join('')}</tr>`).join(''); content = `<div class="mw-block-table"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>${p.caption ? `<small style="display:block;margin-top:7px;color:#64748b;text-align:center">${escapeHtml(p.caption)}</small>` : ''}</div>`; }
  else if (block.type === 'code') content = `<div class="mw-block-code"><pre><code class="mw-code-lang-${escapeAttr(p.language || 'javascript')}">${escapeHtml(p.code || '')}</code></pre>${p.caption ? `<small style="display:block;margin-top:7px;color:#64748b;text-align:center">${escapeHtml(p.caption)}</small>` : ''}</div>`;
  else if (block.type === 'definition') content = `<div class="mw-block-definition"><dt class="mw-def-term">${escapeHtml(p.term || '')}</dt><dd class="mw-def-definition">${escapeHtml(p.definition || '')}</dd></div>`;
  else content = `<div style="height:${Number(p.height) || 24}px"></div>`;
  return `<article class="mw-block${selected}" data-block-id="${escapeAttr(block.id)}" draggable="true"><span class="mw-block-handle" title="Tarik untuk pindah">⋮⋮</span><div class="mw-block-actions"><button class="mw-mini-btn" data-action="duplicate" title="Duplikat">＋</button><button class="mw-mini-btn" data-action="delete" title="Hapus">×</button></div>${content}${block.type === 'image' && p.caption ? `<small style="display:block;margin-top:7px;color:#64748b;text-align:center">${escapeHtml(p.caption)}</small>` : ''}</article>`;
}

function propertiesHtml(block) {
  if (!block) return '<div class="mw-empty-props">Pilih block di canvas untuk mengubah pengaturan.</div>';
  const p = block.props || {};
  const input = (label, key, value, type = 'text') => `<label class="mw-prop-group"><span class="mw-prop-label">${label}</span><input class="mw-prop-input" data-prop="${key}" type="${type}" value="${escapeAttr(value ?? '')}"></label>`;
  const select = (label, key, value, options) => `<label class="mw-prop-group"><span class="mw-prop-label">${label}</span><select class="mw-prop-input" data-prop="${key}">${options.map((o) => `<option value="${escapeAttr(o[0])}" ${o[0] === value ? 'selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select></label>`;
  if (block.type === 'heading') return `${input('Teks','text',p.text)}${select('Level','level',p.level,[['h1','Heading 1'],['h2','Heading 2'],['h3','Heading 3']])}<div class="mw-prop-grid">${input('Ukuran','fontSize',p.fontSize,'number')}${input('Warna','color',p.color,'color')}</div>${select('Alignment','align',p.align,[['left','Kiri'],['center','Tengah'],['right','Kanan']])}`;
  if (block.type === 'text') return `${input('Teks','text',p.text)}<div class="mw-prop-grid">${input('Ukuran','fontSize',p.fontSize,'number')}${input('Warna','color',p.color,'color')}</div>${input('Line Height','lineHeight',p.lineHeight,'number')}${select('Alignment','align',p.align,[['left','Kiri'],['center','Tengah'],['right','Kanan']])}`;
  if (block.type === 'image') return `${input('URL Gambar','src',p.src)}${input('Alt Text','alt',p.alt)}<div class="mw-prop-grid">${input('Lebar','width',p.width)}${input('Radius','radius',p.radius,'number')}</div><div class="mw-prop-grid">${input('Max Width','maxWidth',p.maxWidth,'number')}${input('Opacity','opacity',p.opacity,'number')}</div>${input('Caption','caption',p.caption)}`;
  if (block.type === 'divider') return `<div class="mw-prop-grid">${input('Ketebalan','thickness',p.thickness,'number')}${input('Margin','margin',p.margin,'number')}</div>${input('Warna','color',p.color,'color')}`;
  if (block.type === 'button') return `${input('Label','text',p.text)}${input('URL','url',p.url)}<div class="mw-prop-grid">${input('Warna','color',p.color,'color')}${input('Radius','radius',p.radius,'number')}</div>${select('Alignment','align',p.align,[['left','Kiri'],['center','Tengah'],['right','Kanan']])}`;
  if (block.type === 'formula') return `${input('LaTeX','latex',p.latex,'textarea')}${select('Tampilan','display',p.display,[['true','Tampil'],['false','Sejajar']])}${input('Caption','caption',p.caption)}`;
  if (block.type === 'quiz') return `${input('Pertanyaan','question',p.question,'textarea')}${input('Opsi A','options',(p.options || [])[0] || '')}${input('Opsi B','options',(p.options || [])[1] || '')}${input('Opsi C','options',(p.options || [])[2] || '')}${input('Opsi D','options',(p.options || [])[3] || '')}${select('Jawaban Benar','correct',p.correct,[['0','A'],['1','B'],['2','C'],['3','D']])}${input('Penjelasan','explanation',p.explanation,'textarea')}`;
  if (block.type === 'highlight') return `${select('Tipe','type',p.type,[['penting','Penting'],['miskonsepsi','Miskonsepsi'],['perhatian','Perhatian'],['info','Info']])}${input('Teks','text',p.text,'textarea')}`;
  if (block.type === 'example') return `${input('Judul','title',p.title)}${input('Soal','question',p.question,'textarea')}${input('Pembahasan','solution',p.solution,'textarea')}`;
  if (block.type === 'exercise') return `${input('Soal','question',p.question,'textarea')}${input('Petunjuk','hints',p.hints,'textarea')}${input('Jawaban','answer',p.answer,'textarea')}`;
  if (block.type === 'table') return `${input('Header 1','headers',(p.headers || [])[0] || '')}${input('Header 2','headers',(p.headers || [])[1] || '')}${input('Baris 1, Sel 1','rows',((p.rows || [])[0] || [])[0] || '')}${input('Baris 1, Sel 2','rows',((p.rows || [])[0] || [])[1] || '')}${input('Caption','caption',p.caption)}`;
  if (block.type === 'code') return `${select('Bahasa','language',p.language,[['javascript','JavaScript'],['python','Python'],['html','HTML'],['css','CSS'],['json','JSON'],['bash','Bash']])}${input('Kode','code',p.code,'textarea')}${input('Caption','caption',p.caption)}`;
  if (block.type === 'definition') return `${input('Istilah','term',p.term)}${input('Definisi','definition',p.definition,'textarea')}`;
  return input('Tinggi','height',p.height,'number');
}

export async function renderGuruMateriPage(container) {
  const { guruId, userName, context } = getSessionContext();
  let doc = loadDocument();
  let remoteDrafts = [];
  if (guruId) {
    try {
      remoteDrafts = await getMaterialWorkspaceDrafts(guruId);
      const latest = remoteDrafts[0];
      if (latest?.document_json && typeof latest.document_json === 'object') doc = normalizeDocument(latest.document_json);
    } catch (error) {
      console.warn('Draft lokal dipakai karena Firestore tidak tersedia:', error);
    }
  }
  let selectedId = doc.blocks[0]?.id || '';
  let viewport = 'desktop';
  let layout = doc.layout || 'single';
  let mode = 'home';
  let history = [JSON.stringify(doc)];
  let historyIndex = 0;
  let draggedId = '';

  const html = renderLayout('Materi', `<style>${pageStyles()}</style><div class="mw" style="--mw-primary:${doc.theme.primary};--mw-bg:${doc.theme.background};--mw-surface:${doc.theme.surface};--mw-text:${doc.theme.text}">
    <div class="mw-toolbar"><span class="mw-toolbar-title" id="mw-title">Materi</span><button class="mw-icon-btn" id="mw-undo" title="Undo" aria-label="Undo">↶</button><button class="mw-icon-btn" id="mw-redo" title="Redo" aria-label="Redo">↷</button><button class="mw-action-btn" id="mw-save">Simpan</button><button class="mw-action-btn" id="mw-preview">Preview</button><button class="mw-action-btn primary" id="mw-publish" title="Fase publish akan datang">Publish</button><div class="mw-viewports"><button class="mw-viewport active" data-viewport="desktop">Desktop</button><button class="mw-viewport" data-viewport="tablet">Tablet</button><button class="mw-viewport" data-viewport="mobile">Mobile</button></div><select id="mw-layout" class="mw-layout-select" aria-label="Tata letak" title="Pilih tata letak"><option value="single">▦ Tunggal</option><option value="twoColumn">▧ Dua Kolom</option><option value="sidebarLeft">▨ Sidebar Kiri</option><option value="sidebarRight">▩ Sidebar Kanan</option><option value="featured">▥ Featured</option></select></div>
    <nav class="mw-workspace-nav" aria-label="Workspace materi"><button class="mw-nav-btn active" data-mode="home">Beranda</button><button class="mw-nav-btn" data-mode="drafts">Draft</button><button class="mw-nav-btn" data-mode="published">Terbit &amp; Distribusi</button><button class="mw-nav-btn" data-mode="editor">Buat Materi</button></nav>
    <section id="mw-overview" class="mw-overview"></section>
    <div id="mw-meta" class="mw-meta" hidden><input data-meta="title" aria-label="Judul materi" placeholder="Judul materi"><input data-meta="subject" aria-label="Mata pelajaran" placeholder="Mata pelajaran"><input data-meta="className" aria-label="Kelas" placeholder="Kelas"><select data-meta="duration" aria-label="Alokasi waktu"><option>2 JP</option><option>3 JP</option><option>4 JP</option><option>5 JP</option><option>6 JP</option><option>8 JP</option></select></div>
    <div class="mw-mobile-tools"><button class="mw-action-btn" id="mw-open-library">Blok</button><button class="mw-action-btn" id="mw-open-properties">Properties</button></div>
    <div id="mw-editor" class="mw-layout"><aside class="mw-panel library-panel"><div class="mw-panel-head">Block Library</div><div class="mw-panel-sub">Dasar</div><div class="mw-library">${BLOCKS.map((b) => `<button class="mw-library-item" draggable="true" data-block-type="${b.type}"><span class="mw-library-icon">${b.icon}</span><span><span class="mw-library-label">${b.label}</span><span class="mw-library-hint">${b.hint}</span></span></button>`).join('')}</div></aside><main class="mw-canvas-wrap"><div id="mw-canvas" class="mw-canvas" data-viewport="desktop"></div><p class="mw-status" id="mw-status" aria-live="polite"></p></main><aside class="mw-panel properties-panel"><div class="mw-panel-head">Properties</div><div id="mw-properties" class="mw-properties"></div></aside></div>
    <div id="mw-toast" class="mw-toast" hidden></div>
    <div id="mw-publish-modal" class="mw-modal" hidden><div class="mw-modal-backdrop"></div><div class="mw-modal-content"><div class="mw-modal-head"><h3>Publikasikan ke Kelas</h3><button class="mw-icon-btn" id="mw-publish-close" aria-label="Tutup">×</button></div><div class="mw-modal-body"><p class="mw-modal-desc">Pilih kelas tujuan untuk mempublikasikan materi ini.</p><div id="mw-publish-targets" class="mw-publish-targets"></div><p id="mw-publish-status" class="mw-status"></p></div><div class="mw-modal-foot"><button class="mw-action-btn" id="mw-publish-cancel">Batal</button><button class="mw-action-btn primary" id="mw-publish-confirm">Publikasikan</button></div></div></div>`);
  container.innerHTML = html;

  const canvas = container.querySelector('#mw-canvas');
  const props = container.querySelector('#mw-properties');
  const status = container.querySelector('#mw-status');
  const toast = container.querySelector('#mw-toast');
  const root = container.querySelector('.mw');
  const editor = container.querySelector('#mw-editor');
  const overview = container.querySelector('#mw-overview');
  const metaPanel = container.querySelector('#mw-meta');
  const navButtons = [...container.querySelectorAll('.mw-nav-btn')];
  const showToast = (message) => { toast.textContent = message; toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 2200); };
  const snapshot = () => JSON.stringify(doc);
  const commit = () => { const next = snapshot(); if (history[historyIndex] === next) return; history = history.slice(0, historyIndex + 1); history.push(next); if (history.length > HISTORY_LIMIT) history.shift(); historyIndex = history.length - 1; scheduleSave(); };
  const restore = (value) => { const restored = normalizeDocument(JSON.parse(value)); Object.keys(doc).forEach((key) => delete doc[key]); Object.assign(doc, restored); selectedId = doc.blocks.some((b) => b.id === selectedId) ? selectedId : doc.blocks[0]?.id || ''; render(); };
  const selected = () => doc.blocks.find((b) => b.id === selectedId);
  const formatDate = (value) => { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); };
  const renderDrafts = () => { const local = (() => { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return value ? [{ id: value.id, title: value.meta?.title, subject: value.meta?.subject, class_name: value.meta?.className, updated_at: value.updated_at, document_json: value, local: true }] : []; } catch { return []; } })(); const drafts = remoteDrafts.length ? remoteDrafts : local; const list = drafts.length ? `<div class="mw-draft-list">${drafts.map((draft) => `<article class="mw-draft-card"><span class="mw-library-icon">D</span><div><strong>${escapeHtml(draft.title || 'Materi Baru')}</strong><small>${escapeHtml([draft.subject, draft.class_name].filter(Boolean).join(' · ') || 'Belum ada metadata')} · ${escapeHtml(formatDate(draft.updated_at))}</small></div><div class="mw-draft-actions"><button class="mw-icon-btn" data-draft-open="${escapeAttr(draft.id)}" title="Buka draft">↗</button><button class="mw-icon-btn" data-draft-clone="${escapeAttr(draft.id)}" title="Clone draft">⧉</button>${draft.local ? '' : `<button class="mw-icon-btn" data-draft-delete="${escapeAttr(draft.id)}" title="Hapus draft">×</button>`}</div></article>`).join('')}</div>` : '<div class="mw-draft-empty">Belum ada draft tersimpan.</div>'; overview.innerHTML = `<div class="mw-overview-head"><div><p class="mw-eyebrow">Material Workspace</p><h1>Draft materi</h1><p>Draft tersimpan di Firestore dan bisa dibuka kembali dari perangkat lain.</p></div><button class="mw-action-btn primary" data-open-editor>+ Buat Materi</button></div>${list}`; overview.querySelector('[data-open-editor]')?.addEventListener('click', () => setMode('editor')); overview.querySelectorAll('[data-draft-open]').forEach((button) => button.addEventListener('click', () => openDraft(button.dataset.draftOpen))); overview.querySelectorAll('[data-draft-clone]').forEach((button) => button.addEventListener('click', () => cloneDraft(button.dataset.draftClone))); overview.querySelectorAll('[data-draft-delete]').forEach((button) => button.addEventListener('click', () => removeDraft(button.dataset.draftDelete))); };
  const renderOverview = () => { if (mode === 'drafts') { renderDrafts(); return; } const saved = Boolean(localStorage.getItem(STORAGE_KEY)); const layoutName = LAYOUTS[layout]?.name || layout; const copy = mode === 'home' ? ['Kelola materi pembelajaran dalam satu workspace.', 'Buat materi baru, lanjutkan draft, lalu siapkan distribusi ke kelas.'] : ['Terbit & Distribusi', 'Manajemen publish multi-kelas akan aktif setelah penyimpanan JSON fase berikutnya.']; overview.innerHTML = `<div class="mw-overview-head"><div><p class="mw-eyebrow">Material Workspace</p><h1>${copy[0]}</h1><p>${copy[1]}</p></div><button class="mw-action-btn primary" data-open-editor>+ Buat Materi</button></div><div class="mw-overview-grid"><article><span class="mw-stat-label">Status Draft</span><strong>${saved ? 'Tersimpan' : 'Belum dimulai'}</strong><small>${saved ? 'Siap dilanjutkan di editor' : 'Mulai dari canvas kosong'}</small></article><article><span class="mw-stat-label">Tata Letak</span><strong>${layoutName}</strong><small>Grid: ${LAYOUTS[layout]?.columns || 1} kolom</small></article><article><span class="mw-stat-label">Block Dasar</span><strong>6</strong><small>Heading, Text, Image, Divider, Button, Spacer</small></article><article><span class="mw-stat-label">Workspace</span><strong>${mode === 'published' ? 'Distribusi' : 'Editor visual'}</strong><small>Fase 1-2 aktif</small></article></div>`; overview.querySelector('[data-open-editor]')?.addEventListener('click', () => setMode('editor')); };
  const syncMeta = () => { metaPanel.querySelectorAll('[data-meta]').forEach((input) => { input.value = doc.meta[input.dataset.meta] || ''; }); };
  const setMode = (nextMode) => { mode = nextMode; const editing = mode === 'editor'; editor.hidden = !editing; metaPanel.hidden = !editing; root.querySelector('.mw-mobile-tools').hidden = !editing; overview.hidden = editing; navButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === mode)); container.querySelector('#mw-title').textContent = editing ? doc.meta.title : 'Materi'; if (editing) syncMeta(); renderOverview(); };
  const applyLayout = (nextLayout) => { layout = nextLayout; doc.layout = nextLayout; scheduleSave(); render(); showToast(`Tata letak: ${LAYOUTS[nextLayout]?.name || nextLayout}`); };
  const render = () => { canvas.dataset.viewport = viewport; canvas.dataset.layout = layout; canvas.innerHTML = doc.blocks.map((block, i) => `${i ? `<div class="mw-dropzone" data-drop-index="${i}"></div>` : ''}${renderBlock(block, selectedId)}`).join('') + `<div class="mw-dropzone" data-drop-index="${doc.blocks.length}"></div>`; props.innerHTML = propertiesHtml(selected()); container.querySelector('#mw-undo').disabled = historyIndex <= 0; container.querySelector('#mw-redo').disabled = historyIndex >= history.length - 1; renderOverview(); };
  const addBlock = (type, index = doc.blocks.length) => { const block = createBlock(type); doc.blocks.splice(index, 0, block); selectedId = block.id; commit(); render(); showToast(`${type} ditambahkan`); };
  const updateProp = (key, value) => { const block = selected(); if (!block) return; block.props[key] = ['fontSize','lineHeight','radius','maxWidth','opacity','thickness','margin','height'].includes(key) ? Number(value) : value; commit(); render(); };
  let saveTimer = null;
  const persistDraft = async (notice = true) => {
    const now = new Date().toISOString();
    const payload = { id: doc.id, guru_id: guruId, title: doc.meta.title, subject: doc.meta.subject, class_name: doc.meta.className, duration: doc.meta.duration, schema_version: doc.schemaVersion, layout: doc.layout, document_json: doc, updated_at: now, created_at: doc.created_at || now };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    if (!guruId) { if (notice) showToast('Draft lokal tersimpan'); return; }
    try { await saveMaterialWorkspaceDraft(payload); if (notice) showToast('Draft tersimpan'); }
    catch (error) { console.warn('Draft tersimpan lokal; Firestore gagal:', error); if (notice) showToast('Tersimpan lokal; sinkronisasi gagal'); }
  };
  const openDraft = (id) => { const draft = remoteDrafts.find((item) => String(item.id) === String(id)); if (!draft?.document_json) return; doc = normalizeDocument(draft.document_json); selectedId = doc.blocks[0]?.id || ''; history = [JSON.stringify(doc)]; historyIndex = 0; setMode('editor'); render(); showToast('Draft dibuka'); };
  const cloneDraft = async (id) => { const draft = remoteDrafts.find((item) => String(item.id) === String(id)); if (!draft?.document_json) return; doc = normalizeDocument(JSON.parse(JSON.stringify(draft.document_json))); doc.id = uid('materi'); doc.meta.title = `${doc.meta.title || 'Materi'} (Salinan)`; selectedId = doc.blocks[0]?.id || ''; history = [JSON.stringify(doc)]; historyIndex = 0; await persistDraft(true); setMode('editor'); render(); };
  const removeDraft = async (id) => { if (!guruId || !window.confirm('Hapus draft ini?')) return; try { await deleteMaterialWorkspaceDraft(id, guruId); remoteDrafts = remoteDrafts.filter((item) => String(item.id) !== String(id)); renderOverview(); showToast('Draft dihapus'); } catch (error) { showToast('Draft gagal dihapus'); console.warn(error); } };
  const openPublishModal = () => { const modal = container.querySelector('#mw-publish-modal'); const targetsWrap = container.querySelector('#mw-publish-targets'); const statusEl = container.querySelector('#mw-publish-status'); if (!modal) return; modal.hidden = false; targetsWrap.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Memuat daftar kelas...</p>'; statusEl.textContent = ''; statusEl.className = 'mw-status'; loadPublishTargets(targetsWrap, statusEl); };
  const closePublishModal = () => { const modal = container.querySelector('#mw-publish-modal'); if (modal) modal.hidden = true; };
  const loadPublishTargets = async (targetsWrap, statusEl) => { try { const assignments = await getActiveTeachingAssignments(context); const targetList = assignments.filter((item) => String(item.guru_id || '').toLowerCase() === guruId.toLowerCase() && (item.kelas_id || item.kelas_nama)); if (!targetList.length) { targetsWrap.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Tidak ada kelas tersedia. Pastikan relasi mengajar sudah diatur.</p>'; return; } targetsWrap.innerHTML = targetList.map((target) => `<label class="mw-publish-target"><input type="checkbox" value="${escapeAttr(target.id)}"><div class="mw-publish-target-info"><span class="mw-publish-target-name">${escapeHtml(target.kelas_nama || target.kelas_id)}</span><span class="mw-publish-target-meta">${escapeHtml(target.mapel_nama || target.mapel_id || '')}</span></div></label>`).join(''); } catch (error) { targetsWrap.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Gagal memuat daftar kelas.</p>'; console.warn(error); } };
  const updateTargetCount = () => { const checked = container.querySelectorAll('#mw-publish-targets input:checked').length; const btn = container.querySelector('#mw-publish-confirm'); if (btn) btn.textContent = checked ? `Publish (${checked})` : 'Publikasikan'; };
  const doPublish = async () => { const targets = [...container.querySelectorAll('#mw-publish-targets input:checked')].map((input) => { const label = input.closest('.mw-publish-target'); const name = label?.querySelector('.mw-publish-target-name')?.textContent || ''; return { id: input.value, kelas_nama: name, kelas_id: input.value }; }); if (!targets.length) return; const confirmBtn = container.querySelector('#mw-publish-confirm'); const statusEl = container.querySelector('#mw-publish-status'); if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Memublikasikan...'; } const now = new Date().toISOString(); const htmlSource = doc.blocks.map((b) => renderBlock(b, '')).join(''); try { const results = await Promise.allSettled(targets.map((target) => savePublishedMaterial({ id: `${doc.id}__${documentIdToken(target.id)}`, source_id: doc.id, guru_id: guruId, guru_nama: userName || 'Guru', pengajaran_id: target.id, kelas_id: target.id, kelas_nama: target.kelas_nama || target.id, mapel_id: doc.meta.subject || '', mapel_nama: doc.meta.subject || 'Mata Pelajaran', title: doc.meta.title || 'Materi', note: 'Materi dari workspace', level: doc.meta.duration || '2 JP', chapter: doc.meta.title || '', meetings: doc.meta.duration || '2 JP', html_source: htmlSource, visible_to_students: true, source: 'materi_workspace', tahun_ajaran_id: context?.tahun_ajaran_aktif || '', semester_id: context?.semester_aktif || '', published_at: now, created_at: now, }))); const successes = results.filter((result) => result.status === 'fulfilled').length; const failures = targets.filter((_target, index) => results[index].status === 'rejected'); if (!failures.length) { showToast(`Berhasil dipublikasikan ke ${successes} kelas`); if (statusEl) { statusEl.textContent = `Berhasil dipublikasikan ke ${successes} kelas.`; statusEl.className = 'mw-status mw-publish-result success'; } setTimeout(closePublishModal, 1500); } else { const failedNames = failures.map((item) => item.kelas_nama || item.kelas_id).join(', '); showToast(`${successes} kelas berhasil, ${failures.length} gagal`); if (statusEl) { statusEl.textContent = `${successes} kelas berhasil, ${failures.length} gagal (${failedNames}).`; statusEl.className = 'mw-status mw-publish-result partial'; } } } catch (error) { showToast('Publish gagal'); if (statusEl) { statusEl.textContent = 'Publish gagal. Periksa koneksi dan izin.'; statusEl.className = 'mw-status mw-publish-result error'; } console.warn(error); } finally { if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Publikasikan'; } updateTargetCount(); } };
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => persistDraft(false), 700); };

  const startInlineEdit = (text, blockEl) => { selectedId = blockEl.dataset.blockId; const block = selected(); if (!block || !['heading','text'].includes(block.type)) return; const original = block.props.text; let cancelled = false; text.contentEditable = 'true'; text.focus(); const finish = () => { if (text.contentEditable !== 'true') return; if (!cancelled) block.props.text = text.textContent; text.contentEditable = 'false'; commit(); render(); }; text.addEventListener('blur', finish, { once: true }); text.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); text.blur(); } if (e.key === 'Escape') { cancelled = true; text.textContent = original; text.blur(); } }); };
  canvas.addEventListener('click', (event) => { const blockEl = event.target.closest('[data-block-id]'); if (!blockEl) return; const text = event.target.closest('.mw-content-text'); if (event.detail === 2 && text) { startInlineEdit(text, blockEl); return; } const action = event.target.closest('[data-action]')?.dataset.action; selectedId = blockEl.dataset.blockId; if (action === 'delete') { doc.blocks = doc.blocks.filter((b) => b.id !== selectedId); selectedId = doc.blocks[0]?.id || ''; commit(); } else if (action === 'duplicate') { const source = selected(); const copy = JSON.parse(JSON.stringify(source)); copy.id = uid(); doc.blocks.splice(doc.blocks.findIndex((b) => b.id === source.id) + 1, 0, copy); selectedId = copy.id; commit(); } render(); });
  canvas.addEventListener('dragstart', (event) => { const blockEl = event.target.closest('[data-block-id]'); if (blockEl) { draggedId = blockEl.dataset.blockId; event.dataTransfer.effectAllowed = 'move'; } });
  canvas.addEventListener('dragover', (event) => { const zone = event.target.closest('.mw-dropzone'); if (zone) { event.preventDefault(); zone.classList.add('active'); } });
  canvas.addEventListener('dragleave', (event) => { event.target.closest('.mw-dropzone')?.classList.remove('active'); });
  canvas.addEventListener('drop', (event) => { const zone = event.target.closest('.mw-dropzone'); if (!zone || !draggedId) return; event.preventDefault(); const from = doc.blocks.findIndex((b) => b.id === draggedId); let to = Number(zone.dataset.dropIndex); if (from < 0) return; const [item] = doc.blocks.splice(from, 1); if (from < to) to -= 1; doc.blocks.splice(to, 0, item); selectedId = item.id; draggedId = ''; commit(); render(); });
  container.querySelector('.library-panel').addEventListener('dragstart', (event) => { const type = event.target.closest('[data-block-type]')?.dataset.blockType; if (type) { event.dataTransfer.setData('text/block-type', type); event.dataTransfer.effectAllowed = 'copy'; } });
  canvas.addEventListener('drop', (event) => { const type = event.dataTransfer.getData('text/block-type'); if (!type) return; const zone = event.target.closest('.mw-dropzone'); if (zone) { event.preventDefault(); addBlock(type, Number(zone.dataset.dropIndex)); } });
  props.addEventListener('change', (event) => { const input = event.target.closest('[data-prop]'); if (input) updateProp(input.dataset.prop, input.value); });
  props.addEventListener('input', (event) => { const input = event.target.closest('[data-prop="text"]'); if (input) { const block = selected(); if (block) block.props.text = input.value; } });
  container.querySelector('.library-panel').addEventListener('click', (event) => { const item = event.target.closest('[data-block-type]'); if (item) { addBlock(item.dataset.blockType); container.querySelector('.library-panel').classList.remove('mobile-open'); } });
  container.querySelectorAll('[data-viewport]').forEach((button) => button.addEventListener('click', () => { viewport = button.dataset.viewport; container.querySelectorAll('.mw-viewport').forEach((b) => b.classList.toggle('active', b === button)); canvas.dataset.viewport = viewport; }));
  container.querySelector('#mw-layout')?.addEventListener('change', (event) => { applyLayout(event.target.value); });
  navButtons.forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.mode); if (button.dataset.mode === 'editor') render(); }));
  container.querySelector('#mw-undo').addEventListener('click', () => { if (historyIndex > 0) { historyIndex -= 1; restore(history[historyIndex]); } });
  container.querySelector('#mw-redo').addEventListener('click', () => { if (historyIndex < history.length - 1) { historyIndex += 1; restore(history[historyIndex]); } });
  container.querySelector('#mw-save').addEventListener('click', () => persistDraft(true));
  container.querySelector('#mw-preview').addEventListener('click', () => { const win = window.open('', '_blank'); if (!win) { showToast('Izinkan popup untuk membuka preview'); return; } win.document.write(`<title>${escapeHtml(doc.meta.title)}</title><style>body{margin:0;background:${doc.theme.background};color:${doc.theme.text};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.preview{max-width:820px;margin:0 auto;padding:32px 20px;background:${doc.theme.surface};min-height:100vh}</style><main class="preview">${doc.blocks.map((b) => renderBlock(b, '')).join('')}</main>`); win.document.close(); });
  container.querySelector('#mw-publish').addEventListener('click', () => { if (!guruId) { showToast('Publish memerlukan akun guru'); return; } openPublishModal(); });
  container.querySelector('#mw-publish-close')?.addEventListener('click', closePublishModal);
  container.querySelector('#mw-publish-cancel')?.addEventListener('click', closePublishModal);
  container.querySelector('#mw-publish-confirm')?.addEventListener('click', doPublish);
  container.querySelector('#mw-publish-targets')?.addEventListener('change', updateTargetCount);
  container.querySelector('#mw-publish-modal .mw-modal-backdrop')?.addEventListener('click', closePublishModal);
  container.querySelector('#mw-open-library').addEventListener('click', () => { container.querySelector('.library-panel').classList.toggle('mobile-open'); container.querySelector('.properties-panel').classList.remove('mobile-open'); }); container.querySelector('#mw-open-properties').addEventListener('click', () => { container.querySelector('.properties-panel').classList.toggle('mobile-open'); container.querySelector('.library-panel').classList.remove('mobile-open'); });
  metaPanel.addEventListener('input', (event) => { const input = event.target.closest('[data-meta]'); if (!input) return; doc.meta[input.dataset.meta] = input.value; container.querySelector('#mw-title').textContent = doc.meta.title || 'Materi'; scheduleSave(); });
  render();
  setMode('home');
}
