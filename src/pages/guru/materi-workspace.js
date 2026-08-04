import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getCoverDesign, renderCoverHtml, coverStyles } from '../../utils/materi-cover.js';
import { deleteMaterialWorkspaceDraft, getMaterialWorkspaceDrafts, saveMaterialWorkspaceDraft, savePublishedMaterial, savePublishedMaterialForClasses, migratePublishedMaterialsToMultiClass, deletePublishedMaterial, getActiveTeachingAssignments, getPublishedMaterialsForTeacher, getMaterialReadStatsForTeacher } from '../../firebase/data-service.js';

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
    return { guruId: String(session?.user?.username || context?.user_logged_in || '').trim(), userName: String(session?.user?.nama || session?.user?.name || '').trim(), context };
  } catch {
    return { guruId: '', userName: '', context: {} };
  }
}

function getPublishedMaterialBaseId(item) {
  const sourceId = String(item?.source_id || '').trim();
  if (sourceId) return sourceId;
  const itemId = String(item?.id || '').trim();
  return itemId.includes('__') ? itemId.split('__')[0] : itemId;
}

function groupPublishedMaterials(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const baseId = getPublishedMaterialBaseId(item) || String(item?.id || '').trim();
    if (!baseId) return;
    const existing = groups.get(baseId) || { id: baseId, items: [], representative: item, classNames: new Set(), latestAt: '' };
    existing.items.push(item);
    // Struktur baru menyimpan semua kelas pada satu dokumen; struktur lama satu kelas per dokumen.
    if (Array.isArray(item?.kelas_ids) && item.kelas_ids.length) {
      String(item.kelas_nama_csv || item.kelas_nama || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((name) => existing.classNames.add(name));
    } else if (item?.kelas_nama || item?.kelas_id) {
      existing.classNames.add(String(item.kelas_nama || item.kelas_id));
    }
    const itemDate = String(item?.published_at || item?.updated_at || item?.created_at || '');
    if (itemDate >= existing.latestAt) {
      existing.latestAt = itemDate;
      existing.representative = item;
    }
    groups.set(baseId, existing);
  });
  return [...groups.values()]
    .map((group) => {
      const classNames = [...group.classNames];
      const multi = group.items.find((item) => Array.isArray(item?.kelas_ids) && item.kelas_ids.length);
      return {
        ...group,
        classNames,
        // Jumlah kelas: dari array pada struktur baru, atau jumlah dokumen pada struktur lama.
        classCount: multi ? (multi.pengajaran_ids?.length || classNames.length || 1) : group.items.length,
        isLegacy: !multi,
        isVisible: group.items.some((item) => item?.visible_to_students !== false),
      };
    })
    .sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}


function pageStyles() {
  return `
    ${coverStyles()}
    .mw { --mw-primary:#2563eb; --mw-bg:#f1f5f9; --mw-surface:#fff; --mw-text:#0f172a; --mw-muted:#64748b; --mw-line:#e2e8f0; min-height:calc(100vh - 2rem); color:var(--mw-text); }
    .mw [hidden] { display:none !important; }
    .mw * { box-sizing:border-box; }
    .mw-toolbar { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:8px; min-height:58px; padding:8px 12px; background:rgba(255,255,255,.9); border:1px solid rgba(226,232,240,.9); border-radius:16px; box-shadow:0 10px 28px -20px rgba(15,23,42,.35); backdrop-filter:blur(18px); }
    .mw-toolbar-title { min-width:140px; margin-right:auto; font-size:14px; font-weight:750; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mw-meta { display:grid; grid-template-columns:minmax(180px,2fr) minmax(120px,1fr) minmax(100px,1fr) minmax(90px,.7fr); gap:8px; margin-top:10px; }
    .mw-meta input,.mw-meta select { width:100%; border:1px solid var(--mw-line); border-radius:10px; padding:9px 10px; background:#fff; color:var(--mw-text); font-size:12px; }
    .mw-workspace-nav { position:relative; display:flex; gap:3px; margin-top:12px; padding:4px; border:1px solid rgba(16,185,129,.25); border-radius:16px; background:linear-gradient(135deg,rgba(240,253,244,.95),rgba(236,253,245,.82)); box-shadow:0 10px 28px -22px rgba(15,23,42,.3), inset 0 1px 0 rgba(255,255,255,.85), 0 0 0 1px rgba(16,185,129,.06); overflow-x:auto; scrollbar-width:none; }
    .mw-workspace-nav::-webkit-scrollbar { display:none; }
    .mw-nav-btn { position:relative; flex:1 1 0; min-width:max-content; display:inline-flex; flex-direction:column; align-items:center; gap:2px; border:1px solid transparent; border-radius:12px; padding:7px 11px 6px; background:transparent; color:#64748b; font-size:11px; font-weight:700; cursor:pointer; transition:all .28s cubic-bezier(.22,1,.36,1); white-space:nowrap; }
    .mw-nav-ico { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:9px; background:rgba(100,116,139,.08); color:#64748b; font-size:14px; line-height:1; transition:all .28s cubic-bezier(.22,1,.36,1); }
    .mw-nav-label { display:block; line-height:1.15; transition:color .28s; }
    .mw-nav-badge { position:absolute; top:4px; right:6px; min-width:15px; height:15px; padding:0 3px; border-radius:999px; background:#ef4444; color:#fff; font-size:9px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; line-height:1; box-shadow:0 2px 6px rgba(239,68,68,.4); }
    .mw-nav-btn:hover { color:#334155; background:rgba(255,255,255,.7); transform:translateY(-1px); }
    .mw-nav-btn:hover .mw-nav-ico { background:rgba(16,185,129,.14); color:#059669; transform:scale(1.06); }
    .mw-nav-btn:focus-visible { outline:3px solid rgba(16,185,129,.25); outline-offset:2px; }
    .mw-nav-btn.active { background:linear-gradient(135deg,#059669,#10b981); color:#fff; border-color:transparent; box-shadow:0 10px 24px -8px rgba(16,185,129,.5), inset 0 1px 0 rgba(255,255,255,.3); transform:translateY(-1px); }
    .mw-nav-btn.active .mw-nav-ico { background:rgba(255,255,255,.22); color:#fff; transform:scale(1.08); box-shadow:0 3px 8px rgba(0,0,0,.1); }
    .mw-nav-btn.active .mw-nav-label { font-weight:800; }
    .mw-nav-btn.active .mw-nav-badge { background:#fff; color:#059669; box-shadow:0 2px 6px rgba(0,0,0,.18); }
    @media (max-width:640px) { .mw-nav-btn { flex:none; padding:6px 10px 5px; } .mw-nav-ico { width:25px; height:25px; font-size:13px; } .mw-nav-label { font-size:10px; } }
    .mw-overview { margin-top:12px; }
    .mw-overview-head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; padding:24px; border:1px solid var(--mw-line); border-radius:18px; background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(239,246,255,.82)); }
    .mw-eyebrow { margin:0 0 6px; color:var(--mw-primary); font-size:10px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
    .mw-overview h1 { margin:0; font-size:clamp(1.35rem,3vw,2rem); letter-spacing:-.035em; }
    .mw-overview-head p:not(.mw-eyebrow) { margin:7px 0 0; color:var(--mw-muted); font-size:13px; }
    .mw-overview-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:10px; }
    .mw-overview-grid article { padding:16px; border:1px solid var(--mw-line); border-radius:14px; background:rgba(255,255,255,.84); }
    .mw-stat-label { display:block; color:var(--mw-muted); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
    .mw-overview-grid strong { display:block; margin-top:10px; font-size:18px; } .mw-overview-grid small { display:block; margin-top:4px; color:var(--mw-muted); font-size:11px; line-height:1.4; }
    .mw-ios-home { --ios-blue:#0a84ff; --ios-label:#1c1c1e; --ios-secondary:#6e6e73; padding:4px 0 24px; }
    .mw-ios-hero { position:relative; overflow:hidden; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:20px; min-height:176px; padding:26px; border-radius:26px; color:#fff; background:linear-gradient(125deg,#1c1c1e 0%,#2c2c2e 42%,#0a84ff 120%); box-shadow:0 25px 60px -36px rgba(15,23,42,.7); }
    .mw-ios-hero::before,.mw-ios-hero::after { content:''; position:absolute; border-radius:999px; filter:blur(2px); pointer-events:none; }
    .mw-ios-hero::before { width:260px; height:260px; right:-65px; top:-100px; background:rgba(94,92,230,.45); }
    .mw-ios-hero::after { width:190px; height:190px; right:120px; bottom:-130px; background:rgba(48,176,199,.3); }
    .mw-ios-hero-copy,.mw-ios-hero-art { position:relative; z-index:1; }
    .mw-ios-kicker { display:flex; align-items:center; gap:8px; margin:0 0 12px; color:rgba(255,255,255,.68); font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }
    .mw-ios-kicker span { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.2); border-radius:9px; background:rgba(255,255,255,.1); font-size:14px; }
    .mw-ios-hero h1 { max-width:650px; margin:0; font-size:clamp(1.45rem,3vw,2.25rem); line-height:1.04; letter-spacing:-.04em; }
    .mw-ios-hero-stats { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
    .mw-ios-stat { display:inline-flex; align-items:center; gap:7px; padding:7px 11px; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(255,255,255,.1); color:rgba(255,255,255,.88); font-size:10px; font-weight:750; backdrop-filter:blur(12px); }
    .mw-ios-hero-art { display:flex; align-items:center; justify-content:center; width:150px; }
    .mw-ios-stack { position:relative; width:105px; height:140px; transform:rotate(5deg); }
    .mw-ios-stack span { position:absolute; inset:0; border-radius:9px 15px 15px 9px; border:1px solid rgba(255,255,255,.28); box-shadow:0 22px 34px -18px rgba(0,0,0,.7); }
    .mw-ios-stack span:nth-child(1) { transform:translate(-30px,14px) rotate(-13deg); background:linear-gradient(145deg,#ff375f,#ff9f0a); }
    .mw-ios-stack span:nth-child(2) { transform:translate(-13px,5px) rotate(-5deg); background:linear-gradient(145deg,#30b0c7,#34c759); }
    .mw-ios-stack span:nth-child(3) { display:flex; align-items:center; justify-content:center; background:linear-gradient(145deg,#0a84ff,#5e5ce6); font-size:34px; font-weight:800; }
    .mw-ios-library { margin-top:16px; padding:20px; border:1px solid rgba(209,209,214,.72); border-radius:26px; background:rgba(255,255,255,.82); box-shadow:0 22px 50px -38px rgba(0,0,0,.38); backdrop-filter:blur(24px) saturate(1.3); }
    .mw-ios-library-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
    .mw-ios-library-head h2 { margin:2px 0 0; color:var(--ios-label); font-size:22px; letter-spacing:-.035em; }
    .mw-ios-library-head p { margin:4px 0 0; color:var(--ios-secondary); font-size:11px; }
    .mw-ios-tools { display:flex; align-items:center; gap:8px; }
    .mw-ios-search { position:relative; min-width:220px; }
    .mw-ios-search svg { position:absolute; left:11px; top:50%; width:14px; height:14px; color:#8e8e93; transform:translateY(-50%); }
    .mw-ios-search input { width:100%; min-height:36px; padding:8px 12px 8px 32px; border:0; border-radius:11px; background:#e9e9eb; color:#1c1c1e; font-size:12px; outline:none; }
    .mw-ios-search input:focus { box-shadow:0 0 0 3px rgba(10,132,255,.2); }
    .mw-ios-books { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:24px 18px; }
    .mw-ios-book { min-width:0; animation:mwBookIn .42s cubic-bezier(.2,.75,.2,1) both; }
    @keyframes mwBookIn { from { opacity:0; transform:translateY(12px) scale(.97); } to { opacity:1; transform:none; } }
    .mw-ios-book-button { display:block; width:100%; padding:0; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .mw-ios-book-button:hover .mc-cover { transform:translateY(-8px) rotate(-1.2deg); box-shadow:-4px 4px 0 rgba(0,0,0,.17), 0 26px 38px -18px rgba(15,23,42,.8); }
    .mw-ios-book-button:focus-visible { outline:3px solid rgba(37,99,235,.3); outline-offset:4px; border-radius:12px; }
    .mw-pub-cover-btn { display:block; width:62px; flex:none; padding:0; border:0; background:transparent; cursor:pointer; }
    .mw-pub-cover-btn:hover .mc-cover { transform:translateY(-3px); }
    .mw-pub-cover-btn:focus-visible { outline:3px solid rgba(37,99,235,.3); outline-offset:3px; border-radius:8px; }
    .mw-ios-book-info { padding:10px 3px 0; }
    .mw-ios-book-info strong { display:block; overflow:hidden; color:#1c1c1e; font-size:12px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
    .mw-ios-book-info span { display:block; overflow:hidden; margin-top:3px; color:#8e8e93; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
    .mw-ios-empty { padding:46px 20px; border:1px dashed #c7c7cc; border-radius:18px; background:rgba(242,242,247,.72); text-align:center; }
    .mw-ios-empty-icon { display:inline-flex; width:56px; height:56px; align-items:center; justify-content:center; border-radius:16px; background:#fff; color:#0a84ff; font-size:25px; box-shadow:0 10px 24px -16px rgba(0,0,0,.3); }
    .mw-ios-empty h3 { margin:12px 0 4px; font-size:15px; }.mw-ios-empty p { margin:0;color:#8e8e93;font-size:11px; }
    .mw-segments { display:flex; gap:4px; margin-bottom:16px; padding:4px; border-radius:13px; background:#f1f5f9; overflow-x:auto; scrollbar-width:none; }
    .mw-segments::-webkit-scrollbar { display:none; }
    .mw-seg { flex:none; display:inline-flex; align-items:center; gap:6px; border:0; border-radius:10px; padding:7px 13px; background:transparent; color:#64748b; font-size:11.5px; font-weight:750; cursor:pointer; transition:all .2s; white-space:nowrap; }
    .mw-seg b { padding:1px 6px; border-radius:999px; background:rgba(100,116,139,.14); font-size:10px; font-weight:800; }
    .mw-seg:hover { color:#334155; background:rgba(255,255,255,.7); }
    .mw-seg.active { background:#fff; color:#059669; box-shadow:0 2px 8px rgba(15,23,42,.1); }
    .mw-seg.active b { background:rgba(5,150,105,.14); color:#059669; }
    .mw-chip { display:inline-flex; align-items:center; gap:4px; flex:none; padding:3px 8px; border-radius:999px; font-size:8.5px; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }
    .mw-chip.draft { border:1px solid rgba(255,214,10,.5); background:rgba(255,159,10,.24); color:#fffbeb; }
    .mw-chip.live { border:1px solid rgba(48,209,88,.5); background:rgba(48,209,88,.26); color:#f0fff4; }
    .mw-chip.hidden-chip { border:1px solid rgba(255,255,255,.3); background:rgba(0,0,0,.28); color:#f1f5f9; }
    .mw-pub-title-line .mw-chip.draft { border-color:#fde047; background:#fef9c3; color:#854d0e; }
    .mw-pub-title-line .mw-chip.live { border-color:#bbf7d0; background:#ecfdf3; color:#027a48; }
    .mw-pub-title-line .mw-chip.hidden-chip { border-color:#e4e7ec; background:#f2f4f7; color:#475467; }
    .mw-chip.src { border:1px solid #e4e7ec; background:#f8fafc; color:#667085; }
    .mw-card-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; margin-top:8px; }
    .mw-card-actions .mw-pub-btn { min-height:28px; padding:0 6px; font-size:8.5px; }
    .mw-migrate-note { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:14px; padding:13px 16px; border:1px solid #fde047; border-radius:14px; background:linear-gradient(135deg,#fefce8,#fef9c3); }
    .mw-migrate-note strong { display:block; color:#854d0e; font-size:12.5px; }
    .mw-migrate-note span { display:block; margin-top:3px; color:#a16207; font-size:11px; line-height:1.5; }
    .mw-pub-page { padding:4px 0 24px; }
    .mw-pub-hero { position:relative; overflow:hidden; display:flex; align-items:flex-end; justify-content:space-between; gap:24px; min-height:176px; padding:26px; border-radius:26px; color:#fff; background:linear-gradient(125deg,#101828,#1d2939 55%,#344054); box-shadow:0 25px 60px -36px rgba(15,23,42,.7); }
    .mw-pub-hero::after { content:''; position:absolute; width:270px; height:270px; right:-80px; top:-130px; border-radius:50%; background:linear-gradient(135deg,rgba(10,132,255,.58),rgba(94,92,230,.42)); }
    .mw-pub-hero > * { position:relative; z-index:1; }.mw-pub-hero h1 { margin:0; font-size:clamp(1.45rem,3vw,2.25rem); letter-spacing:-.04em; }.mw-pub-hero p { max-width:620px; margin:8px 0 0; color:rgba(255,255,255,.68); font-size:12px; line-height:1.6; }
    .mw-pub-summary { display:flex; flex:none; gap:8px; }.mw-pub-summary span { padding:8px 11px; border:1px solid rgba(255,255,255,.14); border-radius:12px; background:rgba(255,255,255,.09); font-size:10px; font-weight:750; backdrop-filter:blur(12px); }
    .mw-pub-panel { margin-top:14px; padding:18px; border:1px solid #e4e7ec; border-radius:24px; background:rgba(255,255,255,.86); box-shadow:0 22px 50px -40px rgba(15,23,42,.45); backdrop-filter:blur(22px); }
    .mw-pub-panel-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:14px; }.mw-pub-panel-head h2 { margin:0; font-size:18px; letter-spacing:-.025em; }.mw-pub-panel-head p { margin:4px 0 0; color:#667085; font-size:11px; }
    .mw-pub-list { display:grid; gap:10px; }.mw-pub-row { display:grid; grid-template-columns:72px minmax(0,1fr) auto; gap:15px; align-items:center; padding:13px; border:1px solid #e4e7ec; border-radius:19px; background:#fff; transition:transform .2s,border-color .2s,box-shadow .2s; }.mw-pub-row:hover { transform:translateY(-2px); border-color:#b2ddff; box-shadow:0 18px 34px -27px rgba(15,23,42,.5); }
    .mw-pub-main { min-width:0; }.mw-pub-title-line { display:flex; flex-wrap:wrap; align-items:center; gap:7px; }.mw-pub-title-line h3 { min-width:0; margin:0; color:#101828; font-size:14px; letter-spacing:-.015em; }.mw-pub-status { display:inline-flex; align-items:center; gap:5px; padding:4px 7px; border-radius:999px; font-size:8px; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }.mw-pub-status::before { content:''; width:6px; height:6px; border-radius:50%; background:currentColor; }.mw-pub-status.on { background:#ecfdf3;color:#027a48; }.mw-pub-status.off { background:#fffaeb;color:#b54708; }.mw-pub-status.partial { background:#eff8ff;color:#175cd3; }
    .mw-pub-note { margin:5px 0 0; overflow:hidden; color:#667085; font-size:10px; line-height:1.45; text-overflow:ellipsis; white-space:nowrap; }.mw-pub-meta { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:8px; }.mw-pub-meta span { display:inline-flex; align-items:center; gap:5px; color:#667085; font-size:9px; }.mw-pub-meta b { color:#344054;font-weight:750; }
    .mw-pub-actions { display:grid; grid-template-columns:repeat(2,minmax(86px,1fr)); gap:6px; width:190px; }.mw-pub-btn { min-height:32px; padding:0 9px; border:1px solid #d0d5dd; border-radius:9px; background:#fff; color:#344054; font-size:9px; font-weight:800; cursor:pointer; transition:background .15s,border-color .15s,color .15s; }.mw-pub-btn:hover { border-color:#84caff;background:#eff8ff;color:#175cd3; }.mw-pub-btn.primary { border-color:#0a84ff;background:#0a84ff;color:#fff; }.mw-pub-btn.warning { border-color:#fedf89;color:#b54708; }.mw-pub-btn.danger { border-color:#fecdca;color:#b42318; }
    .mw-form-field { display:block; margin-bottom:12px; }.mw-form-field span { display:block; margin-bottom:5px; color:#475467; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; }.mw-form-field input,.mw-form-field textarea { width:100%; padding:10px 11px; border:1px solid #d0d5dd; border-radius:10px; background:#fff; color:#101828; font:inherit; font-size:12px; outline:none; }.mw-form-field textarea { min-height:86px; resize:vertical; }.mw-form-field input:focus,.mw-form-field textarea:focus { border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.14); }
    .mw-distribution-list { display:grid; gap:7px; max-height:310px; overflow:auto; }.mw-distribution-item { display:flex; align-items:center; gap:10px; padding:10px; border:1px solid #e4e7ec; border-radius:11px; cursor:pointer; }.mw-distribution-item:hover { background:#f9fafb; }.mw-distribution-item input { width:17px;height:17px;accent-color:#0a84ff; }.mw-distribution-item div { min-width:0;flex:1; }.mw-distribution-item strong,.mw-distribution-item small { display:block; }.mw-distribution-item strong { font-size:12px; }.mw-distribution-item small { margin-top:2px;color:#667085;font-size:10px; }
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
    @media (max-width:639px) { .mw-toolbar { position:sticky; top:0; flex-wrap:wrap; border-radius:12px; } .mw-toolbar-title { width:100%; min-width:0; margin:0; order:-2; } .mw-viewports { margin-left:auto; } .mw-layout { display:block; } .mw-panel.library-panel,.mw-panel.properties-panel { display:none; } .mw-panel.mobile-open { display:block; position:fixed; left:10px; right:10px; bottom:10px; z-index:40; max-height:72vh; overflow:auto; box-shadow:0 24px 60px -25px rgba(15,23,42,.45); } .mw-canvas-wrap { padding:7px; margin-top:8px; } .mw-canvas { min-height:560px; padding:11px; } .mw-mobile-tools { display:flex !important; } .mw-overview-head { align-items:stretch; flex-direction:column; padding:18px; } .mw-overview-grid { grid-template-columns:1fr; } .mw-meta { grid-template-columns:1fr 1fr; } .mw-ios-hero { display:block; min-height:auto; padding:22px; border-radius:22px; } .mw-ios-hero-art { display:none; } .mw-ios-library { padding:15px; border-radius:21px; } .mw-ios-library-head { align-items:stretch; flex-direction:column; } .mw-ios-tools,.mw-ios-search { width:100%; min-width:0; } .mw-ios-search { flex:1; } .mw-ios-books { grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px 12px; } .mw-reader-content { width:96vw; height:90vh; } .mw-pub-hero { align-items:flex-start; flex-direction:column; padding:21px; }.mw-pub-summary { flex-wrap:wrap; }.mw-pub-panel { padding:11px; }.mw-pub-row { grid-template-columns:58px minmax(0,1fr); gap:11px; padding:11px; }.mw-pub-cover-btn { width:52px; }.mw-pub-actions { grid-column:1/-1; width:100%; grid-template-columns:repeat(2,minmax(0,1fr)); }.mw-pub-meta { display:grid;grid-template-columns:1fr;gap:5px; } }
    .mw-mobile-tools { display:none; gap:6px; margin-top:8px; }
    .mw-modal { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; }
    .mw-modal[hidden] { display:none; }
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
    .mw-reader-content { width:min(1120px,94vw); max-width:none; height:min(86vh,900px); display:flex; flex-direction:column; overflow:hidden; }
    .mw-reader-modal { z-index:120; display:block; padding:0; }
    .mw-reader-shell { display:flex; flex-direction:column; width:100vw; height:100vh; height:100dvh; background:#fff; }
    .mw-reader-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 18px; padding-top:calc(12px + env(safe-area-inset-top)); border-bottom:1px solid #e2e8f0; background:#fff; box-shadow:0 6px 18px -14px rgba(15,23,42,.4); }
    .mw-reader-bar-left { display:flex; align-items:center; gap:12px; min-width:0; }
    .mw-reader-home { flex:none; display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; border:1px solid #e2e8f0; border-radius:13px; background:#f8fafc; color:#2563eb; cursor:pointer; transition:background .15s,transform .15s,box-shadow .15s; }
    .mw-reader-home:hover { background:#eff6ff; transform:translateY(-1px); box-shadow:0 10px 22px -14px rgba(37,99,235,.6); }
    .mw-reader-home:focus-visible { outline:3px solid rgba(37,99,235,.35); outline-offset:2px; }
    .mw-reader-heading { min-width:0; }
    .mw-reader-heading .mw-eyebrow { margin:0; }
    .mw-reader-heading h3 { margin:2px 0 0; font-size:16px; font-weight:750; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mw-reader-back-btn { flex:none; display:inline-flex; align-items:center; gap:7px; padding:9px 16px; border:1px solid #e2e8f0; border-radius:999px; background:#fff; color:#334155; font-size:13px; font-weight:650; cursor:pointer; transition:background .15s; }
    .mw-reader-back-btn:hover { background:#f1f5f9; }
    .mw-reader-back-btn:focus-visible { outline:3px solid rgba(37,99,235,.35); outline-offset:2px; }
    .mw-reader-frame { width:100%; flex:1; min-height:0; border:0; background:#f8fafc; padding-bottom:env(safe-area-inset-bottom); }
    @media (max-width:520px) { .mw-reader-bar { padding:10px 14px; padding-top:calc(10px + env(safe-area-inset-top)); } .mw-reader-back-btn span { display:none; } .mw-reader-back-btn { padding:9px 11px; } }
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
  let publishedMaterials = [];
  let readStats = [];
  if (guruId) {
    try {
      // Tiga query sekali jalan, semuanya ter-cache di data-service.
      [remoteDrafts, publishedMaterials, readStats] = await Promise.all([
        getMaterialWorkspaceDrafts(guruId),
        getPublishedMaterialsForTeacher(guruId),
        getMaterialReadStatsForTeacher(guruId).catch(() => []),
      ]);
      const latest = remoteDrafts.find((item) => item?.document_json && typeof item.document_json === 'object');
      if (latest) doc = normalizeDocument(latest.document_json);
    } catch (error) {
      console.warn('Data materi lokal dipakai karena Firestore tidak tersedia:', error);
      try { publishedMaterials = await getPublishedMaterialsForTeacher(guruId); } catch { publishedMaterials = []; }
    }
  }
  let selectedId = doc.blocks[0]?.id || '';
  let viewport = 'desktop';
  let layout = doc.layout || 'single';
  let mode = 'home';
  let listView = 'grid';
  let listStatus = 'all';
  let listQuery = '';
  let history = [JSON.stringify(doc)];
  let historyIndex = 0;
  let draggedId = '';

  const html = renderLayout('Materi', `<style>${pageStyles()}</style><div class="mw" style="--mw-primary:${doc.theme.primary};--mw-bg:${doc.theme.background};--mw-surface:${doc.theme.surface};--mw-text:${doc.theme.text}">
    <nav class="mw-workspace-nav" aria-label="Workspace materi"><button class="mw-nav-btn active" data-mode="home"><span class="mw-nav-ico">▤</span><span class="mw-nav-label">Materi Saya</span><span class="mw-nav-badge" id="mw-nav-draft-count" hidden>0</span></button><button class="mw-nav-btn" data-mode="editor"><span class="mw-nav-ico">＋</span><span class="mw-nav-label">Buat Materi</span></button><button class="mw-nav-btn" data-mode="ai" data-nav-href="#guru/materi-ai"><span class="mw-nav-ico">✦</span><span class="mw-nav-label">Materi AI</span></button><button class="mw-nav-btn" data-mode="import" data-nav-href="#guru/materi-import"><span class="mw-nav-ico">📥</span><span class="mw-nav-label">Import Materi</span></button><button class="mw-nav-btn" data-nav-href="#guru/ppt-ai"><span class="mw-nav-ico">📊</span><span class="mw-nav-label">Materi PPT</span></button></nav>
    <div class="mw-toolbar"><span class="mw-toolbar-title" id="mw-title">Materi</span><button class="mw-icon-btn" id="mw-undo" title="Undo" aria-label="Undo">↶</button><button class="mw-icon-btn" id="mw-redo" title="Redo" aria-label="Redo">↷</button><button class="mw-action-btn" id="mw-save">Simpan</button><button class="mw-action-btn" id="mw-preview">Preview</button><button class="mw-action-btn primary" id="mw-publish" title="Fase publish akan datang">Publish</button><div class="mw-viewports"><button class="mw-viewport active" data-viewport="desktop">Desktop</button><button class="mw-viewport" data-viewport="tablet">Tablet</button><button class="mw-viewport" data-viewport="mobile">Mobile</button></div><select id="mw-layout" class="mw-layout-select" aria-label="Tata letak" title="Pilih tata letak"><option value="single">▦ Tunggal</option><option value="twoColumn">▧ Dua Kolom</option><option value="sidebarLeft">▨ Sidebar Kiri</option><option value="sidebarRight">▩ Sidebar Kanan</option><option value="featured">▥ Featured</option></select></div>
    <section id="mw-overview" class="mw-overview"></section>
    <div id="mw-meta" class="mw-meta" hidden><input data-meta="title" aria-label="Judul materi" placeholder="Judul materi"><input data-meta="subject" aria-label="Mata pelajaran" placeholder="Mata pelajaran"><input data-meta="className" aria-label="Kelas" placeholder="Kelas"><select data-meta="duration" aria-label="Alokasi waktu"><option>2 JP</option><option>3 JP</option><option>4 JP</option><option>5 JP</option><option>6 JP</option><option>8 JP</option></select></div>
    <div class="mw-mobile-tools"><button class="mw-action-btn" id="mw-open-library">Blok</button><button class="mw-action-btn" id="mw-open-properties">Properties</button></div>
    <div id="mw-editor" class="mw-layout"><aside class="mw-panel library-panel"><div class="mw-panel-head">Block Library</div><div class="mw-panel-sub">Dasar</div><div class="mw-library">${BLOCKS.map((b) => `<button class="mw-library-item" draggable="true" data-block-type="${b.type}"><span class="mw-library-icon">${b.icon}</span><span><span class="mw-library-label">${b.label}</span><span class="mw-library-hint">${b.hint}</span></span></button>`).join('')}</div></aside><main class="mw-canvas-wrap"><div id="mw-canvas" class="mw-canvas" data-viewport="desktop"></div><p class="mw-status" id="mw-status" aria-live="polite"></p></main><aside class="mw-panel properties-panel"><div class="mw-panel-head">Properties</div><div id="mw-properties" class="mw-properties"></div></aside></div>
    <div id="mw-toast" class="mw-toast" hidden></div>
    <div id="mw-publish-modal" class="mw-modal" hidden><div class="mw-modal-backdrop"></div><div class="mw-modal-content"><div class="mw-modal-head"><h3>Publikasikan ke Kelas</h3><button class="mw-icon-btn" id="mw-publish-close" aria-label="Tutup">×</button></div><div class="mw-modal-body"><p class="mw-modal-desc">Pilih kelas tujuan untuk mempublikasikan materi ini.</p><div id="mw-publish-targets" class="mw-publish-targets"></div><p id="mw-publish-status" class="mw-status"></p></div><div class="mw-modal-foot"><button class="mw-action-btn" id="mw-publish-cancel">Batal</button><button class="mw-action-btn primary" id="mw-publish-confirm">Publikasikan</button></div></div></div>
    <div id="mw-reader-modal" class="mw-modal mw-reader-modal" hidden><div class="mw-reader-shell"><header class="mw-reader-bar"><div class="mw-reader-bar-left"><button class="mw-reader-home" id="mw-reader-close" type="button" aria-label="Kembali ke daftar materi" title="Kembali ke daftar materi"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M9 21v-6h6v6"></path></svg></button><div class="mw-reader-heading"><p class="mw-eyebrow">Pratinjau E-Book</p><h3 id="mw-reader-title">Materi</h3></div></div><button class="mw-reader-back-btn" id="mw-reader-back" type="button"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg><span>Kembali</span></button></header><iframe id="mw-reader-frame" class="mw-reader-frame" title="Pratinjau materi layar penuh" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe></div></div>
    <div id="mw-pub-action-modal" class="mw-modal" hidden><div class="mw-modal-backdrop"></div><div class="mw-modal-content"><div class="mw-modal-head"><div><p class="mw-eyebrow">Distribusi Materi</p><h3 id="mw-pub-action-title">Kelola Materi</h3></div><button class="mw-icon-btn" id="mw-pub-action-close" aria-label="Tutup">×</button></div><div class="mw-modal-body" id="mw-pub-action-body"></div><div class="mw-modal-foot"><button class="mw-action-btn" id="mw-pub-action-cancel">Batal</button><button class="mw-action-btn primary" id="mw-pub-action-confirm">Simpan</button></div></div></div>`);
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
  const draftBadge = container.querySelector('#mw-nav-draft-count');
  const updateDraftBadge = () => { if (!draftBadge) return; const count = remoteDrafts.length; if (count > 0) { draftBadge.textContent = count > 99 ? '99+' : String(count); draftBadge.hidden = false; } else { draftBadge.hidden = true; } };
  const publishedGroups = () => groupPublishedMaterials(publishedMaterials);
  const showToast = (message) => { toast.textContent = message; toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 2200); };
  const snapshot = () => JSON.stringify(doc);
  const commit = () => { const next = snapshot(); if (history[historyIndex] === next) return; history = history.slice(0, historyIndex + 1); history.push(next); if (history.length > HISTORY_LIMIT) history.shift(); historyIndex = history.length - 1; scheduleSave(); };
  const restore = (value) => { const restored = normalizeDocument(JSON.parse(value)); Object.keys(doc).forEach((key) => delete doc[key]); Object.assign(doc, restored); selectedId = doc.blocks.some((b) => b.id === selectedId) ? selectedId : doc.blocks[0]?.id || ''; render(); };
  const selected = () => doc.blocks.find((b) => b.id === selectedId);
  const formatDate = (value) => { const date = new Date(value || 0); return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); };
  const buildPublishedPreview = (material) => {
    const source = String(material?.html_source || material?.html || '').trim();
    if (/<html[\s>]|<!doctype/i.test(source)) return source;
    return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(material?.title || 'Materi')}</title><style>body{margin:0;padding:28px 18px;background:#f2f2f7;color:#1c1c1e;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}.book-page{max-width:860px;min-height:80vh;margin:auto;padding:28px;background:#fff;border-radius:24px;box-shadow:0 28px 70px -45px rgba(0,0,0,.5)}.mw-block{position:relative;margin:8px 0;padding:8px}.mw-block img{max-width:100%}.mw-block-table{overflow:auto}.mw-block-table table{width:100%;border-collapse:collapse}.mw-block-table th,.mw-block-table td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}.mw-block-highlight,.mw-block-example,.mw-block-exercise,.mw-block-definition,.mw-block-formula{padding:14px;border:1px solid #e5e7eb;border-radius:14px}.mw-block-code{overflow:auto;padding:14px;border-radius:14px;background:#1e293b;color:#e2e8f0}@media(max-width:640px){body{padding:0}.book-page{padding:20px 15px;border-radius:0}}</style></head><body><main class="book-page">${source || '<p>Isi materi tidak tersedia.</p>'}</main></body></html>`;
  };
  const closePublishedPreview = () => {
    const modal = container.querySelector('#mw-reader-modal');
    const frame = container.querySelector('#mw-reader-frame');
    if (modal) modal.hidden = true;
    if (frame) frame.srcdoc = '';
    document.body.classList.remove('overflow-hidden');
  };
  const openPublishedPreview = (groupId) => {
    const group = publishedGroups().find((item) => String(item.id) === String(groupId));
    if (!group?.representative) return;
    const modal = container.querySelector('#mw-reader-modal');
    const frame = container.querySelector('#mw-reader-frame');
    const title = container.querySelector('#mw-reader-title');
    if (!modal || !frame) return;
    title.textContent = group.representative.title || 'Materi';
    frame.srcdoc = buildPublishedPreview(group.representative);
    modal.hidden = false;
    document.body.classList.add('overflow-hidden');
  };
  const closePubActionModal = () => { const modal = container.querySelector('#mw-pub-action-modal'); if (modal) modal.hidden = true; };
  const refreshPublishedMaterials = async () => { publishedMaterials = guruId ? await getPublishedMaterialsForTeacher(guruId) : []; renderOverview(); };
  const getDistributionAssignments = async () => {
    const assignments = await getActiveTeachingAssignments(context);
    return assignments.filter((item) => String(item.guru_id || '').trim().toLowerCase() === String(guruId).trim().toLowerCase() && (item.id || item.kelas_id || item.kelas_nama));
  };
  const openPubActionModal = async (action, groupId) => {
    const group = publishedGroups().find((item) => String(item.id) === String(groupId));
    if (!group?.representative) return;
    const modal = container.querySelector('#mw-pub-action-modal');
    const body = container.querySelector('#mw-pub-action-body');
    const title = container.querySelector('#mw-pub-action-title');
    const confirm = container.querySelector('#mw-pub-action-confirm');
    const item = group.representative;
    modal.hidden = false;
    title.textContent = action === 'edit' ? 'Edit informasi materi' : action === 'publish' ? 'Pilih kelas distribusi' : action === 'delete' ? 'Hapus materi' : 'Ubah status terbit';
    confirm.textContent = action === 'edit' ? 'Simpan perubahan' : action === 'publish' ? 'Terbitkan ke kelas' : action === 'delete' ? 'Hapus permanen' : (group.isVisible ? 'Unpublish' : 'Terbitkan');
    confirm.classList.toggle('danger', action === 'delete');
    if (action === 'edit') {
      body.innerHTML = `<p class="mw-modal-desc">Perubahan akan diterapkan ke ${group.items.length} distribusi kelas.</p><label class="mw-form-field"><span>Judul materi</span><input id="mw-pub-edit-title" value="${escapeAttr(item.title || '')}" maxlength="200"></label><label class="mw-form-field"><span>Keterangan</span><textarea id="mw-pub-edit-note" maxlength="500">${escapeHtml(item.note || item.description || '')}</textarea></label>`;
    } else if (action === 'publish') {
      let assignments = [];
      try { assignments = await getDistributionAssignments(); } catch (error) { body.innerHTML = '<p class="mw-modal-desc">Gagal memuat daftar kelas. Periksa koneksi dan izin.</p>'; console.warn(error); }
      // Kelas yang sudah menerima materi: dari array pengajaran_ids (struktur baru)
      // atau dari dokumen per kelas (struktur lama).
      const selectedIds = new Set();
      group.items.forEach((value) => {
        if (Array.isArray(value?.pengajaran_ids)) value.pengajaran_ids.forEach((entry) => selectedIds.add(String(entry).trim()));
        const single = String(value?.pengajaran_id || value?.kelas_id || '').trim();
        if (single) selectedIds.add(single);
      });
      body.innerHTML = `<p class="mw-modal-desc">Centang satu atau beberapa kelas. Kelas yang sudah terdistribusi tetap tercentang.</p><div class="mw-distribution-list">${assignments.length ? assignments.map((target) => { const targetId = String(target.id || target.pengajaran_id || target.kelas_id || '').trim(); return `<label class="mw-distribution-item"><input type="checkbox" value="${escapeAttr(targetId)}" ${selectedIds.has(targetId) ? 'checked' : ''}><div><strong>${escapeHtml(target.kelas_nama || target.kelas_id || targetId)}</strong><small>${escapeHtml(target.mapel_nama || target.mapel_id || 'Mata pelajaran')}</small></div></label>`; }).join('') : '<p class="mw-modal-desc">Belum ada relasi mengajar aktif.</p>'}</div>`;
    } else if (action === 'delete') {
      body.innerHTML = `<div class="mw-ios-empty" style="padding:24px 12px"><span class="mw-ios-empty-icon" style="color:#b42318">×</span><h3>Hapus “${escapeHtml(item.title || 'Tanpa judul')}”?</h3><p>Semua ${group.items.length} distribusi kelas dan jejak bacanya akan dihapus permanen.</p></div>`;
    } else {
      body.innerHTML = `<p class="mw-modal-desc">${group.isVisible ? 'Materi akan disembunyikan dari siswa, tetapi tetap tersimpan di koleksi guru.' : 'Materi akan ditampilkan kembali untuk siswa pada semua kelas yang sudah dipilih.'}</p>`;
    }
    const submit = async () => {
      confirm.disabled = true;
      try {
        if (action === 'edit') {
          const nextTitle = String(container.querySelector('#mw-pub-edit-title')?.value || '').trim();
          const nextNote = String(container.querySelector('#mw-pub-edit-note')?.value || '').trim();
          if (!nextTitle) throw new Error('Judul materi wajib diisi.');
          await Promise.all(group.items.map((value) => savePublishedMaterial({ ...value, title: nextTitle, note: nextNote })));
          showToast('Informasi materi diperbarui');
        } else if (action === 'publish') {
          const selected = [...body.querySelectorAll('input[type="checkbox"]:checked')].map((input) => String(input.value || '').trim()).filter(Boolean);
          if (!selected.length) throw new Error('Pilih minimal satu kelas.');
          const assignments = await getDistributionAssignments();
          const byId = new Map(assignments.map((target) => [String(target.id || target.pengajaran_id || target.kelas_id || '').trim(), target]));
          const targets = selected.map((targetId) => {
            const target = byId.get(targetId) || {};
            return {
              id: target.id || targetId,
              kelas_id: target.kelas_id || targetId,
              kelas_nama: target.kelas_nama || targetId,
              mapel_id: target.mapel_id || item.mapel_id || '',
              mapel_nama: target.mapel_nama || item.mapel_nama || '',
            };
          });
          // Tulis ulang sebagai satu dokumen multi-kelas.
          await savePublishedMaterialForClasses({
            ...item,
            id: group.id,
            source_id: group.id,
            published_at: new Date().toISOString(),
            visible_to_students: true,
          }, targets);
          // Bersihkan dokumen lama per kelas bila materi ini masih berstruktur lama.
          if (group.isLegacy) {
            await Promise.all(group.items
              .filter((value) => String(value.id) !== group.id)
              .map((value) => deletePublishedMaterial(value.id).catch(() => null)));
          }
          showToast(`Materi diterbitkan ke ${targets.length} kelas`);
        } else if (action === 'delete') {
          await Promise.all(group.items.map((value) => deletePublishedMaterial(value.id)));
          showToast('Materi dan distribusinya dihapus');
        } else {
          await Promise.all(group.items.map((value) => savePublishedMaterial({ ...value, visible_to_students: !group.isVisible })));
          showToast(group.isVisible ? 'Materi di-unpublish' : 'Materi diterbitkan kembali');
        }
        closePubActionModal();
        await refreshPublishedMaterials();
      } catch (error) { showToast(error?.message || 'Aksi gagal dilakukan'); } finally { confirm.disabled = false; }
    };
    confirm.onclick = submit;
  };
  // ---------------------------------------------------------------------------
  // Daftar terpadu: draft + materi terbit dalam satu koleksi tampilan.
  // Draft = belum terlihat siswa. Terbit = sudah terlihat. Tidak ada tab terpisah.
  // ---------------------------------------------------------------------------
  const readCountByBaseId = () => {
    const map = new Map();
    (readStats || []).forEach((entry) => {
      const baseId = getPublishedMaterialBaseId(entry?.material_id ? { id: entry.material_id, source_id: entry.source_id } : entry);
      if (!baseId) return;
      const isRead = Number(entry?.read_count || 0) > 0 || Boolean(entry?.last_read_at);
      if (!isRead) return;
      const current = map.get(baseId) || new Set();
      current.add(String(entry?.siswa_id || '').trim());
      map.set(baseId, current);
    });
    return map;
  };

  const buildLibraryEntries = () => {
    const reads = readCountByBaseId();
    const draftEntries = (remoteDrafts || []).map((draft) => ({
      kind: 'draft',
      id: String(draft.id || ''),
      title: draft.title || 'Materi Baru',
      subject: draft.subject || '',
      chapter: draft.chapter || '',
      source: draft.source || 'manual',
      classNames: draft.class_name ? [String(draft.class_name)] : [],
      updatedAt: draft.updated_at || draft.created_at || '',
      readers: 0,
      raw: draft,
    }));
    const publishedEntries = publishedGroups().map((group) => {
      const item = group.representative || {};
      return {
        kind: 'published',
        id: String(group.id || ''),
        title: item.title || 'Tanpa judul',
        subject: item.mapel_nama || item.mapel_id || '',
        chapter: item.chapter || '',
        source: item.source === 'materi_ai' ? 'ai' : item.source === 'materi_import' ? 'import' : 'manual',
        classNames: group.classNames,
        updatedAt: group.latestAt || '',
        isVisible: group.isVisible,
        distributionCount: group.classCount,
        readers: (reads.get(String(group.id)) || new Set()).size,
        group,
        raw: item,
      };
    });
    return [...draftEntries, ...publishedEntries]
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  };

  const filterLibraryEntries = (entries) => {
    const q = String(listQuery || '').trim().toLowerCase();
    return entries.filter((entry) => {
      const statusMatch = listStatus === 'all'
        || (listStatus === 'draft' && entry.kind === 'draft')
        || (listStatus === 'published' && entry.kind === 'published' && entry.isVisible)
        || (listStatus === 'hidden' && entry.kind === 'published' && !entry.isVisible);
      if (!statusMatch) return false;
      if (!q) return true;
      return [entry.title, entry.subject, entry.chapter, ...entry.classNames].join(' ').toLowerCase().includes(q);
    });
  };

  const SOURCE_LABEL = { manual: 'Manual', ai: 'AI', import: 'Import' };

  const statusChip = (entry) => {
    if (entry.kind === 'draft') return '<span class="mw-chip draft">Draft</span>';
    if (!entry.isVisible) return '<span class="mw-chip hidden-chip">Ditarik</span>';
    return '<span class="mw-chip live">Terbit</span>';
  };

  const entryActions = (entry) => {
    const id = escapeAttr(entry.id);
    if (entry.kind === 'draft') {
      const openBtn = entry.source === 'manual'
        ? `<button class="mw-pub-btn" data-draft-open="${id}">Buka</button>`
        : `<button class="mw-pub-btn" data-draft-preview="${id}">Pratinjau</button>`;
      // Draft dari AI: tombol "Sunting AI" membuka Studio Materi AI.
      const aiEditBtn = entry.source === 'ai'
        ? `<button class="mw-pub-btn" data-ai-edit-draft="${id}">Sunting AI</button>`
        : '';
      return `${openBtn}${aiEditBtn}<button class="mw-pub-btn primary" data-draft-publish="${id}">Terbitkan</button><button class="mw-pub-btn" data-draft-clone="${id}">Duplikat</button><button class="mw-pub-btn danger" data-draft-delete="${id}">Hapus</button>`;
    }
    // Materi terbit dari AI: sediakan "Sunting AI" (membuka Studio dengan JSON).
    const aiEditBtn = entry.source === 'ai'
      ? `<button class="mw-pub-btn" data-ai-edit-pub="${id}">Sunting AI</button>`
      : '';
    // Materi mode HTML (AI Premium HTML atau Import): sediakan "Edit HTML"
    // untuk menyunting kode langsung / menempel hasil revisi Kilo/Cline.
    // Termasuk materi import lama yang belum menyimpan doc_mode.
    const isHtmlDocEntry = entry.raw?.doc_mode === 'html'
      || (typeof entry.raw?.html_source === 'string' && entry.raw.html_source.trim() && !entry.raw?.document_json);
    const htmlEditBtn = isHtmlDocEntry
      ? `<button class="mw-pub-btn" data-html-edit-pub="${id}">Edit HTML</button>`
      : '';
    return `<button class="mw-pub-btn" data-pub-preview="${id}">Pratinjau</button><button class="mw-pub-btn" data-pub-edit="${id}">Edit</button>${aiEditBtn}${htmlEditBtn}<button class="mw-pub-btn primary" data-pub-distribute="${id}">Kelas</button><button class="mw-pub-btn ${entry.isVisible ? 'warning' : 'primary'}" data-pub-toggle="${id}">${entry.isVisible ? 'Tarik' : 'Terbitkan'}</button><button class="mw-pub-btn danger" data-pub-delete="${id}">Hapus</button>`;
  };

  const entryMetaLine = (entry) => {
    const parts = [];
    if (entry.subject) parts.push(escapeHtml(entry.subject));
    if (entry.chapter) parts.push(escapeHtml(entry.chapter));
    if (entry.classNames.length) parts.push(escapeHtml(entry.classNames.join(', ')));
    parts.push(escapeHtml(formatDate(entry.updatedAt)));
    return parts.join(' · ');
  };

  const readLine = (entry) => {
    if (entry.kind === 'draft') return 'Belum dibagikan ke siswa';
    if (!entry.isVisible) return 'Disembunyikan dari siswa';
    return entry.readers > 0
      ? `${entry.readers} siswa sudah membaca`
      : 'Belum ada siswa yang membaca';
  };

  const renderLibrary = () => {
    const allEntries = buildLibraryEntries();
    const entries = filterLibraryEntries(allEntries);
    const counts = {
      all: allEntries.length,
      draft: allEntries.filter((entry) => entry.kind === 'draft').length,
      published: allEntries.filter((entry) => entry.kind === 'published' && entry.isVisible).length,
      hidden: allEntries.filter((entry) => entry.kind === 'published' && !entry.isVisible).length,
    };
    const totalReaders = allEntries.reduce((total, entry) => total + (entry.readers || 0), 0);

    const body = entries.length
      ? (listView === 'grid'
        ? `<div class="mw-ios-books">${entries.map((entry, index) => {
            const design = getCoverDesign(entry.raw, index);
            const openAttr = entry.kind === 'draft'
              ? (entry.source === 'manual' ? `data-draft-open="${escapeAttr(entry.id)}"` : `data-draft-preview="${escapeAttr(entry.id)}"`)
              : `data-pub-preview="${escapeAttr(entry.id)}"`;
            const cover = renderCoverHtml({
              design,
              title: entry.title,
              subject: entry.subject || SOURCE_LABEL[entry.source] || 'Materi',
              footer: entry.classNames.join(', ') || 'Belum ada kelas',
              badgeHtml: statusChip(entry),
            });
            return `<article class="mw-ios-book" style="animation-delay:${Math.min(index, 16) * 32}ms"><button type="button" class="mw-ios-book-button" ${openAttr} aria-label="Buka ${escapeAttr(entry.title)}">${cover}<div class="mw-ios-book-info"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.classNames.join(', ') || 'Belum ada kelas')}</span><span>${escapeHtml(readLine(entry))}</span></div></button><div class="mw-card-actions">${entryActions(entry)}</div></article>`;
          }).join('')}</div>`
        : `<div class="mw-pub-list">${entries.map((entry, index) => {
            const design = getCoverDesign(entry.raw, index);
            const openAttr = entry.kind === 'draft'
              ? (entry.source === 'manual' ? `data-draft-open="${escapeAttr(entry.id)}"` : `data-draft-preview="${escapeAttr(entry.id)}"`)
              : `data-pub-preview="${escapeAttr(entry.id)}"`;
            const cover = renderCoverHtml({ design, title: entry.title, subject: entry.subject, compact: true });
            return `<article class="mw-pub-row" style="animation:mwBookIn .35s both;animation-delay:${Math.min(index, 15) * 30}ms"><button type="button" class="mw-pub-cover-btn" ${openAttr} aria-label="Buka ${escapeAttr(entry.title)}">${cover}</button><div class="mw-pub-main"><div class="mw-pub-title-line"><h3>${escapeHtml(entry.title)}</h3>${statusChip(entry)}<span class="mw-chip src">${escapeHtml(SOURCE_LABEL[entry.source] || 'Manual')}</span></div><p class="mw-pub-note">${entryMetaLine(entry)}</p><div class="mw-pub-meta"><span>◉ ${escapeHtml(readLine(entry))}</span>${entry.kind === 'published' ? `<span>⌁ <b>Distribusi:</b> ${entry.distributionCount} kelas</span>` : ''}</div></div><div class="mw-pub-actions">${entryActions(entry)}</div></article>`;
          }).join('')}</div>`)
      : `<div class="mw-ios-empty"><span class="mw-ios-empty-icon">${listQuery ? '⌕' : '▤'}</span><h3>${listQuery ? 'Materi tidak ditemukan' : 'Belum ada materi'}</h3><p>${listQuery ? 'Coba kata kunci judul, mapel, atau kelas yang lain.' : 'Mulai dari Buat Materi, Materi AI, atau Import Materi.'}</p></div>`;

    const firstName = escapeHtml((userName || 'Guru').split(/\s+/)[0]);
    const tab = (value, label, count) => `<button type="button" class="mw-seg${listStatus === value ? ' active' : ''}" data-status="${value}">${label}${count ? ` <b>${count}</b>` : ''}</button>`;
    // Tawarkan penggabungan hanya bila masih ada materi berstruktur lama.
    const legacyCount = publishedGroups().filter((group) => group.isLegacy && group.items.length > 1).length;
    const migrateBanner = legacyCount
      ? `<div class="mw-migrate-note"><div><strong>${legacyCount} materi masih tersimpan terpisah per kelas.</strong><span>Gabungkan menjadi satu dokumen agar hemat penyimpanan dan sekali edit berlaku untuk semua kelas.</span></div><button class="mw-action-btn primary" id="mw-migrate-btn">Gabungkan Sekarang</button></div>`
      : '';

    overview.innerHTML = `<div class="mw-ios-home">
      <section class="mw-ios-hero">
        <div class="mw-ios-hero-copy">
          <p class="mw-ios-kicker"><span>▤</span> Perpustakaan Materi</p>
          <h1>Halo, ${firstName}.</h1>
          <div class="mw-ios-hero-stats"><span class="mw-ios-stat">${counts.all} materi</span><span class="mw-ios-stat">${counts.published} terbit</span><span class="mw-ios-stat">${counts.draft} draft</span><span class="mw-ios-stat">${totalReaders} pembaca</span></div>
        </div>
        <div class="mw-ios-hero-art" aria-hidden="true"><div class="mw-ios-stack"><span></span><span></span><span>▤</span></div></div>
      </section>
      <section class="mw-ios-library">
        <div class="mw-ios-library-head">
          <div>
            <p class="mw-eyebrow">Koleksi Saya</p>
            <h2>Materi Saya</h2>
            <p>${entries.length} dari ${counts.all} materi ditampilkan.</p>
          </div>
          <div class="mw-ios-tools">
            <label class="mw-ios-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg><input id="mw-book-search" type="search" value="${escapeAttr(listQuery)}" placeholder="Cari materi" aria-label="Cari materi"></label>
            <div class="mw-viewports"><button class="mw-viewport${listView === 'grid' ? ' active' : ''}" data-list-view="grid" title="Tampilan rak">▦</button><button class="mw-viewport${listView === 'table' ? ' active' : ''}" data-list-view="table" title="Tampilan tabel">☰</button></div>
            <button class="mw-action-btn primary" data-open-editor>+ Materi Baru</button>
          </div>
        </div>
        <div class="mw-segments">${tab('all', 'Semua', counts.all)}${tab('draft', 'Draft', counts.draft)}${tab('published', 'Terbit', counts.published)}${tab('hidden', 'Ditarik', counts.hidden)}</div>
        ${migrateBanner}
        ${body}
      </section>
    </div>`;

    overview.querySelector('[data-open-editor]')?.addEventListener('click', () => { resetEditorForNewMaterial(); setMode('editor'); });
    overview.querySelector('#mw-migrate-btn')?.addEventListener('click', runMigration);
    overview.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => { listStatus = button.dataset.status; renderLibrary(); }));
    overview.querySelectorAll('[data-list-view]').forEach((button) => button.addEventListener('click', () => { listView = button.dataset.listView; renderLibrary(); }));
    const searchInput = overview.querySelector('#mw-book-search');
    searchInput?.addEventListener('input', (event) => { listQuery = event.target.value; renderLibrary(); });
    if (listQuery && searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
    overview.querySelectorAll('[data-pub-preview]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openPublishedPreview(button.dataset.pubPreview); }));
    overview.querySelectorAll('[data-pub-edit]').forEach((button) => button.addEventListener('click', () => openPubActionModal('edit', button.dataset.pubEdit)));
    overview.querySelectorAll('[data-pub-toggle]').forEach((button) => button.addEventListener('click', () => openPubActionModal('toggle', button.dataset.pubToggle)));
    overview.querySelectorAll('[data-pub-distribute]').forEach((button) => button.addEventListener('click', () => openPubActionModal('publish', button.dataset.pubDistribute)));
    overview.querySelectorAll('[data-pub-delete]').forEach((button) => button.addEventListener('click', () => openPubActionModal('delete', button.dataset.pubDelete)));
    overview.querySelectorAll('[data-draft-open]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openDraft(button.dataset.draftOpen); }));
    overview.querySelectorAll('[data-draft-preview]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openDraftPreview(button.dataset.draftPreview); }));
    overview.querySelectorAll('[data-draft-clone]').forEach((button) => button.addEventListener('click', () => cloneDraft(button.dataset.draftClone)));
    overview.querySelectorAll('[data-draft-delete]').forEach((button) => button.addEventListener('click', () => removeDraft(button.dataset.draftDelete)));
    overview.querySelectorAll('[data-draft-publish]').forEach((button) => button.addEventListener('click', () => openDraftPublishModal(button.dataset.draftPublish)));
    // Sunting dengan Studio Materi AI (membuka halaman Materi AI dengan JSON tersimpan).
    overview.querySelectorAll('[data-ai-edit-draft]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); window.location.hash = `#guru/materi-ai?draft=${encodeURIComponent(button.dataset.aiEditDraft)}`; }));
    overview.querySelectorAll('[data-ai-edit-pub]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); window.location.hash = `#guru/materi-ai?published=${encodeURIComponent(button.dataset.aiEditPub)}`; }));
    overview.querySelectorAll('[data-html-edit-pub]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); window.location.hash = `#guru/materi-import?edit=${encodeURIComponent(button.dataset.htmlEditPub)}`; }));
  };
  const renderOverview = () => { renderLibrary(); };

  /**
   * Gabungkan materi lama (satu dokumen per kelas) menjadi satu dokumen multi-kelas.
   * Dijalankan atas permintaan guru, aman diulang karena hanya menyentuh dokumen
   * yang masih berpola `base__kelas` dan belum punya `kelas_ids`.
   */
  const runMigration = async () => {
    const button = container.querySelector('#mw-migrate-btn');
    if (!guruId) { showToast('Migrasi memerlukan akun guru'); return; }
    if (!window.confirm('Gabungkan materi lama menjadi satu dokumen per materi? Distribusi kelas tetap sama.')) return;
    if (button) { button.disabled = true; button.textContent = 'Menggabungkan...'; }
    try {
      const result = await migratePublishedMaterialsToMultiClass(guruId);
      publishedMaterials = await getPublishedMaterialsForTeacher(guruId);
      showToast(result.merged ? `${result.merged} materi digabung, ${result.removed} dokumen lama dihapus` : 'Tidak ada materi lama yang perlu digabung');
      renderOverview();
    } catch (error) {
      showToast(error?.message || 'Penggabungan gagal');
      console.warn(error);
      if (button) { button.disabled = false; button.textContent = 'Gabungkan Sekarang'; }
    }
  };
  const syncMeta = () => { metaPanel.querySelectorAll('[data-meta]').forEach((input) => { input.value = doc.meta[input.dataset.meta] || ''; }); };
  const setMode = (nextMode) => { mode = nextMode; const editing = mode === 'editor'; editor.hidden = !editing; metaPanel.hidden = !editing; root.querySelector('.mw-mobile-tools').hidden = !editing; root.querySelector('.mw-toolbar').hidden = !editing; overview.hidden = editing; navButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === mode)); container.querySelector('#mw-title').textContent = editing ? doc.meta.title : 'Materi'; if (editing) syncMeta(); renderOverview(); };
  const applyLayout = (nextLayout) => { layout = nextLayout; doc.layout = nextLayout; scheduleSave(); render(); showToast(`Tata letak: ${LAYOUTS[nextLayout]?.name || nextLayout}`); };
  const render = () => { canvas.dataset.viewport = viewport; canvas.dataset.layout = layout; canvas.innerHTML = doc.blocks.map((block, i) => `${i ? `<div class="mw-dropzone" data-drop-index="${i}"></div>` : ''}${renderBlock(block, selectedId)}`).join('') + `<div class="mw-dropzone" data-drop-index="${doc.blocks.length}"></div>`; props.innerHTML = propertiesHtml(selected()); container.querySelector('#mw-undo').disabled = historyIndex <= 0; container.querySelector('#mw-redo').disabled = historyIndex >= history.length - 1; renderOverview(); };
  const addBlock = (type, index = doc.blocks.length) => { const block = createBlock(type); doc.blocks.splice(index, 0, block); selectedId = block.id; commit(); render(); showToast(`${type} ditambahkan`); };
  const updateProp = (key, value) => { const block = selected(); if (!block) return; block.props[key] = ['fontSize','lineHeight','radius','maxWidth','opacity','thickness','margin','height'].includes(key) ? Number(value) : value; commit(); render(); };
  let saveTimer = null;
  const persistDraft = async (notice = true) => {
    const now = new Date().toISOString();
    const payload = { id: doc.id, guru_id: guruId, guru_nama: userName, title: doc.meta.title, subject: doc.meta.subject, class_name: doc.meta.className, duration: doc.meta.duration, source: 'manual', schema_version: doc.schemaVersion, layout: doc.layout, document_json: doc, tahun_ajaran_id: context?.tahun_ajaran_aktif || '', semester_id: context?.semester_aktif || '', updated_at: now, created_at: doc.created_at || now };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    if (!guruId) { if (notice) showToast('Draft lokal tersimpan'); return; }
    try {
      await saveMaterialWorkspaceDraft(payload);
      // Jaga daftar lokal tetap sinkron tanpa query ulang ke Firestore.
      const index = remoteDrafts.findIndex((item) => String(item.id) === String(doc.id));
      if (index >= 0) remoteDrafts[index] = { ...remoteDrafts[index], ...payload };
      else remoteDrafts.unshift(payload);
      updateDraftBadge();
      if (notice) showToast('Draft tersimpan');
    } catch (error) { console.warn('Draft tersimpan lokal; Firestore gagal:', error); if (notice) showToast('Tersimpan lokal; sinkronisasi gagal'); }
  };
  const findDraft = (id) => remoteDrafts.find((item) => String(item.id) === String(id));
  const resetEditorForNewMaterial = () => {
    doc = defaultDocument();
    layout = doc.layout;
    selectedId = doc.blocks[0]?.id || '';
    history = [JSON.stringify(doc)];
    historyIndex = 0;
  };
  const openDraft = (id) => {
    const draft = findDraft(id);
    if (!draft) return;
    if (!draft.document_json) { openDraftPreview(id); return; }
    doc = normalizeDocument(draft.document_json);
    layout = doc.layout;
    selectedId = doc.blocks[0]?.id || '';
    history = [JSON.stringify(doc)];
    historyIndex = 0;
    setMode('editor');
    render();
    showToast('Draft dibuka');
  };
  const openDraftPreview = (id) => {
    const draft = findDraft(id);
    if (!draft) return;
    const modal = container.querySelector('#mw-reader-modal');
    const frame = container.querySelector('#mw-reader-frame');
    const title = container.querySelector('#mw-reader-title');
    if (!modal || !frame) return;
    const html = draft.document_json
      ? normalizeDocument(draft.document_json).blocks.map((block) => renderBlock(block, '')).join('')
      : String(draft.html_source || '');
    title.textContent = draft.title || 'Materi';
    frame.srcdoc = buildPublishedPreview({ ...draft, html_source: html });
    modal.hidden = false;
    document.body.classList.add('overflow-hidden');
  };
  const cloneDraft = async (id) => {
    const draft = findDraft(id);
    if (!draft) return;
    const newId = uid('materi');
    const now = new Date().toISOString();
    const copy = {
      ...draft,
      id: newId,
      title: `${draft.title || 'Materi'} (Salinan)`,
      created_at: now,
      updated_at: now,
    };
    if (draft.document_json) {
      const cloned = normalizeDocument(JSON.parse(JSON.stringify(draft.document_json)));
      cloned.id = newId;
      cloned.meta.title = copy.title;
      copy.document_json = cloned;
    }
    try {
      await saveMaterialWorkspaceDraft({ ...copy, guru_id: guruId, guru_nama: userName });
      remoteDrafts.unshift(copy);
      updateDraftBadge();
      renderOverview();
      showToast('Draft diduplikasi');
    } catch (error) { showToast('Gagal menduplikasi draft'); console.warn(error); }
  };
  const removeDraft = async (id) => { if (!guruId || !window.confirm('Hapus draft ini?')) return; try { await deleteMaterialWorkspaceDraft(id, guruId); remoteDrafts = remoteDrafts.filter((item) => String(item.id) !== String(id)); updateDraftBadge(); renderOverview(); showToast('Draft dihapus'); } catch (error) { showToast('Draft gagal dihapus'); console.warn(error); } };
  const openPublishModal = () => { const modal = container.querySelector('#mw-publish-modal'); const targetsWrap = container.querySelector('#mw-publish-targets'); const statusEl = container.querySelector('#mw-publish-status'); if (!modal) return; modal.hidden = false; targetsWrap.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Memuat daftar kelas...</p>'; statusEl.textContent = ''; statusEl.className = 'mw-status'; loadPublishTargets(targetsWrap, statusEl); };
  const closePublishModal = () => { const modal = container.querySelector('#mw-publish-modal'); if (modal) modal.hidden = true; pendingPublishDraftId = ''; };
  const loadPublishTargets = async (targetsWrap, statusEl) => { try { const assignments = await getActiveTeachingAssignments(context); const targetList = assignments.filter((item) => String(item.guru_id || '').toLowerCase() === guruId.toLowerCase() && (item.kelas_id || item.kelas_nama)); if (!targetList.length) { targetsWrap.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Tidak ada kelas tersedia. Pastikan relasi mengajar sudah diatur.</p>'; return; } targetsWrap.innerHTML = targetList.map((target) => `<label class="mw-publish-target"><input type="checkbox" value="${escapeAttr(target.id)}"><div class="mw-publish-target-info"><span class="mw-publish-target-name">${escapeHtml(target.kelas_nama || target.kelas_id)}</span><span class="mw-publish-target-meta">${escapeHtml(target.mapel_nama || target.mapel_id || '')}</span></div></label>`).join(''); } catch (error) { targetsWrap.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:20px;">Gagal memuat daftar kelas.</p>'; console.warn(error); } };
  const updateTargetCount = () => { const checked = container.querySelectorAll('#mw-publish-targets input:checked').length; const btn = container.querySelector('#mw-publish-confirm'); if (btn) btn.textContent = checked ? `Publish (${checked})` : 'Publikasikan'; };

  // Sumber materi yang akan diterbitkan: editor aktif, atau draft tertentu dari daftar.
  let pendingPublishDraftId = '';
  const openDraftPublishModal = (id) => {
    if (!findDraft(id)) return;
    pendingPublishDraftId = String(id);
    openPublishModal();
  };
  const buildPublishSource = () => {
    if (pendingPublishDraftId) {
      const draft = findDraft(pendingPublishDraftId);
      if (draft) {
        const html = draft.document_json
          ? normalizeDocument(draft.document_json).blocks.map((block) => renderBlock(block, '')).join('')
          : String(draft.html_source || '');
        return {
          id: String(draft.id),
          title: draft.title || 'Materi',
          subject: draft.subject || '',
          chapter: draft.chapter || draft.title || '',
          duration: draft.duration || '2 JP',
          note: draft.note || `Materi dari ${SOURCE_LABEL[draft.source] || 'Manual'}`,
          source: draft.source || 'manual',
          html,
        };
      }
    }
    return {
      id: String(doc.id),
      title: doc.meta.title || 'Materi',
      subject: doc.meta.subject || '',
      chapter: doc.meta.title || '',
      duration: doc.meta.duration || '2 JP',
      note: 'Materi dari editor workspace',
      source: 'manual',
      html: doc.blocks.map((block) => renderBlock(block, '')).join(''),
    };
  };
  const doPublish = async () => {
    const targets = [...container.querySelectorAll('#mw-publish-targets input:checked')].map((input) => {
      const label = input.closest('.mw-publish-target');
      return {
        id: input.value,
        kelas_nama: label?.querySelector('.mw-publish-target-name')?.textContent || '',
        mapel_nama: label?.querySelector('.mw-publish-target-meta')?.textContent || '',
      };
    });
    if (!targets.length) return;
    const confirmBtn = container.querySelector('#mw-publish-confirm');
    const statusEl = container.querySelector('#mw-publish-status');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Memublikasikan...'; }
    const src = buildPublishSource();
    const now = new Date().toISOString();
    try {
      if (!String(src.html || '').trim()) throw new Error('Materi masih kosong.');
      // Satu dokumen untuk semua kelas — tidak ada duplikasi html_source.
      await savePublishedMaterialForClasses({
        id: src.id,
        source_id: src.id,
        guru_id: guruId,
        guru_nama: userName || 'Guru',
        mapel_id: src.subject || '',
        mapel_nama: src.subject || 'Mata Pelajaran',
        title: src.title,
        note: src.note,
        level: src.duration,
        chapter: src.chapter,
        meetings: src.duration,
        html_source: src.html,
        visible_to_students: true,
        source: src.source === 'ai' ? 'materi_ai' : src.source === 'import' ? 'materi_import' : 'materi_workspace',
        tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
        semester_id: context?.semester_aktif || '',
        published_at: now,
        created_at: now,
      }, targets);
      publishedMaterials = await getPublishedMaterialsForTeacher(guruId);
      // Draft sudah menjadi materi terbit — hapus agar tidak muncul dua kali.
      if (pendingPublishDraftId) {
        try { await deleteMaterialWorkspaceDraft(pendingPublishDraftId, guruId); remoteDrafts = remoteDrafts.filter((item) => String(item.id) !== pendingPublishDraftId); updateDraftBadge(); } catch (error) { console.warn('Draft gagal dibersihkan setelah publish:', error); }
      }
      showToast(`Diterbitkan ke ${targets.length} kelas`);
      if (statusEl) { statusEl.textContent = `Berhasil diterbitkan ke ${targets.length} kelas.`; statusEl.className = 'mw-status mw-publish-result success'; }
      setTimeout(closePublishModal, 1200);
      renderOverview();
    } catch (error) {
      showToast(error?.message || 'Publish gagal');
      if (statusEl) { statusEl.textContent = error?.message || 'Publish gagal. Periksa koneksi dan izin.'; statusEl.className = 'mw-status mw-publish-result error'; }
      console.warn(error);
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
      updateTargetCount();
    }
  };
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
  navButtons.forEach((button) => button.addEventListener('click', () => { if (button.dataset.navHref) { window.location.hash = button.dataset.navHref; return; } setMode(button.dataset.mode); if (button.dataset.mode === 'editor') render(); }));
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
  container.querySelector('#mw-reader-close')?.addEventListener('click', closePublishedPreview);
  container.querySelector('#mw-reader-back')?.addEventListener('click', closePublishedPreview);
  container.querySelector('#mw-reader-modal .mw-modal-backdrop')?.addEventListener('click', closePublishedPreview);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !container.querySelector('#mw-reader-modal')?.hidden) closePublishedPreview(); });
  container.querySelector('#mw-pub-action-close')?.addEventListener('click', closePubActionModal);
  container.querySelector('#mw-pub-action-cancel')?.addEventListener('click', closePubActionModal);
  container.querySelector('#mw-pub-action-modal .mw-modal-backdrop')?.addEventListener('click', closePubActionModal);
  container.querySelector('#mw-open-library').addEventListener('click', () => { container.querySelector('.library-panel').classList.toggle('mobile-open'); container.querySelector('.properties-panel').classList.remove('mobile-open'); }); container.querySelector('#mw-open-properties').addEventListener('click', () => { container.querySelector('.properties-panel').classList.toggle('mobile-open'); container.querySelector('.library-panel').classList.remove('mobile-open'); });
  metaPanel.addEventListener('input', (event) => { const input = event.target.closest('[data-meta]'); if (!input) return; doc.meta[input.dataset.meta] = input.value; container.querySelector('#mw-title').textContent = doc.meta.title || 'Materi'; scheduleSave(); });
  render();
  setMode('home');
  updateDraftBadge();
}
