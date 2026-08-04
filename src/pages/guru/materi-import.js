/**
 * Halaman Import Materi — paste HTML mentah dari penyedia AI eksternal.
 * Mode: Raw HTML (disimpan langsung sebagai html_source).
 * Sanitasi XSS, preview live, simpan draft, publish multi-kelas.
 */

import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getTeachingAssignmentsForUser, savePublishedMaterialForClasses, saveMaterialWorkspaceDraft, deleteMaterialWorkspaceDraft, savePublishedMaterial, getPublishedMaterialsForTeacher } from '../../firebase/data-service.js';
import { sanitizeMaterialHtml, buildRevisionPrompt } from '../../utils/html-sanitizer.js';

const MATERIAL_DRAFTS_KEY = 'simguru_material_html_drafts';

function getSession() {
  try { return JSON.parse(localStorage.getItem('simguru_session') || '{}'); } catch { return {}; }
}
function readDrafts() {
  try { return JSON.parse(localStorage.getItem(MATERIAL_DRAFTS_KEY) || '[]'); } catch { return []; }
}
function writeDrafts(drafts) {
  try { localStorage.setItem(MATERIAL_DRAFTS_KEY, JSON.stringify(drafts)); return true; } catch { return false; }
}
function safeString(v) { return String(v ?? '').trim(); }
function documentIdToken(v) { return String(v || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'target'; }
function escapeHtml(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

const ALLOWED_TAGS = new Set(['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','img','table','thead','tbody','tr','td','th','code','pre','strong','em','b','i','u','s','span','div','blockquote','a','sup','sub','dl','dt','dd','figure','figcaption','mark','small','details','summary']);
const ALLOWED_ATTRS = new Set(['href','src','alt','title','width','height','style','class','colspan','rowspan','target','rel','lang','dir','align','valign','bgcolor','color','data-latex','data-display','type','name','value','id','min','max','step','placeholder','draggable','data-answer','for']);
const DANGEROUS_ATTR_PREFIXES = ['on'];

// Sanitasi materi memakai allowlist CDN bersama di utils/html-sanitizer.js
// (dipakai juga oleh jalur AI), sehingga aturan keamanan konsisten di semua
// jalur: script/link/img/iframe ke host luar allowlist dibuang, polyfill.io
// diblokir. Konstanta tag/atribut di atas dipertahankan sebagai referensi.
void ALLOWED_TAGS; void ALLOWED_ATTRS; void DANGEROUS_ATTR_PREFIXES;

/** Ekstrak judul dari <h1>, <title>, atau baris pertama teks. */
function extractTitle(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h1 = doc.querySelector('h1');
    if (h1?.textContent?.trim()) return h1.textContent.trim().slice(0, 200);
    const title = doc.querySelector('title');
    if (title?.textContent?.trim()) return title.textContent.trim().slice(0, 200);
    const firstText = doc.body?.textContent?.trim();
    if (firstText) return firstText.split(/\n/)[0].slice(0, 120);
  } catch { /* ignore */ }
  return 'Materi Import';
}

function pageStyles() {
  return `
    .mi { --mi-primary:#2563eb; --mi-bg:#f1f5f9; --mi-surface:#fff; --mi-text:#0f172a; --mi-muted:#64748b; --mi-line:#e2e8f0; --mi-radius:18px; min-height:calc(100vh - 2rem); color:var(--mi-text); }
    .mi * { box-sizing:border-box; }
    .mi [hidden] { display:none !important; }
    .mi-hero { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:22px 26px; border-radius:22px; color:#fff; background:linear-gradient(125deg,#0f172a,#1e293b 50%,#0d9488); box-shadow:0 22px 50px -32px rgba(13,148,136,.5); }
    .mi-hero-copy { position:relative; z-index:1; }
    .mi-hero p.mi-kicker { display:flex; align-items:center; gap:8px; margin:0 0 8px; color:rgba(255,255,255,.7); font-size:10px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    .mi-hero p.mi-kicker span { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.2); border-radius:9px; background:rgba(255,255,255,.1); font-size:14px; }
    .mi-hero h1 { margin:0; font-size:clamp(1.3rem,3vw,1.8rem); letter-spacing:-.035em; }
    .mi-hero p.mi-sub { margin:7px 0 0; color:rgba(255,255,255,.65); font-size:12.5px; line-height:1.5; max-width:480px; }
    .mi-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; margin-top:14px; align-items:start; }
    .mi-panel { background:var(--mi-surface); border:1px solid var(--mi-line); border-radius:var(--mi-radius); overflow:hidden; }
    .mi-panel-head { display:flex; align-items:center; justify-content:space-between; padding:13px 16px; border-bottom:1px solid var(--mi-line); font-size:13px; font-weight:800; }
    .mi-panel-head small { color:var(--mi-muted); font-size:11px; font-weight:600; }
    .mi-panel-body { padding:14px 16px; }
    .mi-textarea { width:100%; min-height:60vh; border:1px solid var(--mi-line); border-radius:12px; padding:12px 14px; background:#f8fafc; color:var(--mi-text); font-family:ui-monospace,Menlo,'Cascadia Code',monospace; font-size:12px; line-height:1.6; resize:vertical; outline:none; transition:border-color .2s, box-shadow .2s; }
    .mi-textarea:focus { border-color:var(--mi-primary); box-shadow:0 0 0 3px rgba(37,99,235,.12); }
    .mi-textarea::placeholder { color:#94a3b8; }
    .mi-preview-wrap { min-height:60vh; padding:12px; background:#f8fafc; border:1px solid var(--mi-line); border-radius:12px; overflow:auto; }
    .mi-preview-frame { width:100%; min-height:calc(60vh - 24px); border:0; border-radius:8px; background:#fff; }
    .mi-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:calc(60vh - 24px); color:#94a3b8; text-align:center; gap:8px; }
    .mi-empty span { font-size:28px; }
    .mi-empty p { margin:0; font-size:12px; max-width:200px; line-height:1.5; }
    .mi-meta { display:grid; grid-template-columns:minmax(180px,2fr) minmax(120px,1fr) minmax(100px,1fr); gap:8px; margin-top:12px; }
    .mi-meta input,.mi-meta select { width:100%; border:1px solid var(--mi-line); border-radius:10px; padding:9px 11px; background:#fff; color:var(--mi-text); font-size:12px; }
    .mi-meta input:focus,.mi-meta select:focus { border-color:var(--mi-primary); box-shadow:0 0 0 3px rgba(37,99,235,.1); outline:none; }
    .mi-toolbar { display:flex; align-items:center; gap:8px; margin-top:14px; flex-wrap:wrap; }
    .mi-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--mi-line); background:#fff; color:#334155; border-radius:11px; padding:9px 16px; font-size:12.5px; font-weight:700; cursor:pointer; transition:all .2s; }
    .mi-btn:hover:not(:disabled) { border-color:#bfdbfe; background:#eff6ff; color:#1d4ed8; }
    .mi-btn:disabled { opacity:.45; cursor:not-allowed; }
    .mi-btn.primary { border-color:var(--mi-primary); background:var(--mi-primary); color:#fff; }
    .mi-btn.primary:hover:not(:disabled) { background:#1d4ed8; }
    .mi-btn.danger { border-color:#fecaca; background:#fff; color:#dc2626; }
    .mi-btn.danger:hover:not(:disabled) { background:#fef2f2; }
    .mi-btn.icon { padding:9px 11px; font-size:14px; }
    .mi-toggle { display:inline-flex; align-items:center; gap:6px; margin-right:auto; padding:5px; background:#f1f5f9; border-radius:10px; }
    .mi-toggle button { border:0; background:transparent; color:#64748b; border-radius:7px; padding:6px 10px; font-size:11px; font-weight:700; cursor:pointer; transition:all .2s; }
    .mi-toggle button.active { background:#fff; color:var(--mi-primary); box-shadow:0 2px 6px rgba(15,23,42,.1); }
    .mi-status { min-height:20px; margin-top:8px; color:var(--mi-muted); font-size:11.5px; }
    .mi-toast { position:fixed; right:18px; bottom:18px; z-index:60; padding:11px 16px; border-radius:12px; background:#0f172a; color:#fff; font-size:12px; box-shadow:0 14px 30px -12px rgba(15,23,42,.4); opacity:0; transform:translateY(8px); transition:opacity .25s, transform .25s; pointer-events:none; }
    .mi-toast.show { opacity:1; transform:translateY(0); }
    .mi-info-card { margin-top:12px; padding:14px 16px; border:1px solid #dbeafe; border-radius:14px; background:linear-gradient(135deg,rgba(239,246,255,.9),rgba(240,253,250,.6)); font-size:12px; line-height:1.6; color:#1e3a5f; }
    .mi-info-card strong { color:#0f172a; }
    .mi-info-card ul { margin:6px 0 0; padding-left:16px; }
    .mi-info-card li { margin:2px 0; }
    .mi-chars { font-size:11px; color:var(--mi-muted); font-weight:600; }
    .mi-modal { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; }
    .mi-modal[hidden] { display:none !important; }
    .mi-modal-bg { position:absolute; inset:0; background:rgba(15,23,42,.5); }
    .mi-modal-card { position:relative; background:#fff; border-radius:20px; box-shadow:0 24px 60px -25px rgba(15,23,42,.45); max-width:520px; width:90vw; max-height:80vh; overflow:auto; }
    .mi-modal-head { display:flex; align-items:center; justify-content:space-between; padding:18px 20px; border-bottom:1px solid var(--mi-line); }
    .mi-modal-head h3 { margin:0; font-size:16px; font-weight:750; }
    .mi-modal-body { padding:16px 20px; }
    .mi-modal-desc { margin:0 0 12px; color:var(--mi-muted); font-size:13px; }
    .mi-targets { display:flex; flex-direction:column; gap:6px; max-height:240px; overflow-y:auto; }
    .mi-target { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--mi-line); border-radius:10px; cursor:pointer; transition:background .15s; }
    .mi-target:hover { background:#f8fafc; }
    .mi-target input[type=checkbox] { accent-color:var(--mi-primary); width:16px; height:16px; }
    .mi-target-info { flex:1; }
    .mi-target-name { font-size:13px; font-weight:700; }
    .mi-target-meta { font-size:11px; color:var(--mi-muted); }
    .mi-modal-foot { display:flex; gap:8px; justify-content:flex-end; padding:14px 20px; border-top:1px solid var(--mi-line); }
    .mi-result { margin-top:10px; padding:10px 12px; border-radius:10px; font-size:12px; }
    .mi-result.success { background:#f0fdf4; color:#14532d; border:1px solid #bbf7d0; }
    .mi-result.partial { background:#fef9c3; color:#854d0e; border:1px solid #fde047; }
    .mi-result.error { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
    .mi-modal-toolbar { display:flex; gap:6px; margin-bottom:10px; }
    .mi-modal-toolbar .mi-btn { padding:6px 10px; font-size:11px; }
    @media (max-width:768px) {
      .mi-grid { grid-template-columns:1fr; }
      .mi-meta { grid-template-columns:1fr 1fr; }
      .mi-hero { padding:18px; border-radius:16px; }
      .mi-textarea { min-height:50vh; }
      .mi-preview-wrap { min-height:50vh; }
      .mi-preview-frame { min-height:calc(50vh - 24px); }
    }
    @media (max-width:480px) {
      .mi-meta { grid-template-columns:1fr; }
      .mi-toolbar { gap:6px; }
      .mi-btn { padding:8px 12px; font-size:11.5px; }
      .mi-toggle { width:100%; justify-content:center; }
    }
  `;
}

export async function renderGuruMateriImportPage(container, options = {}) {
  const editId = String(options?.editId || '').trim();
  const editMode = Boolean(editId);
  const storedContext = getStoredContext();
  const context = {
    ...storedContext,
    tahun_ajaran_aktif: storedContext?.tahun_ajaran_aktif || '2026_2027',
    semester_aktif: storedContext?.semester_aktif || '2026_2027_1',
  };
  const session = getSession();
  const userId = session?.user?.username || '';
  const userName = session?.user?.nama || 'Guru';
  let teachingAssignments = [];
  try {
    teachingAssignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  } catch (error) {
    console.warn('Gagal memuat relasi mengajar untuk publish:', error);
  }

  let rawHtml = '';
  let sanitizedHtml = '';
  let autoTitle = '';
  let currentDraftId = '';
  let previewMode = 'rendered';
  let editingDoc = null;

  const html = renderLayout('Import Materi', `<style>${pageStyles()}</style>
    <style>
      .mwnav-bar { position:relative; display:flex; gap:3px; margin-bottom:14px; padding:4px; border:1px solid rgba(16,185,129,.25); border-radius:16px; background:linear-gradient(135deg,rgba(240,253,244,.95),rgba(236,253,245,.82)); box-shadow:0 10px 28px -22px rgba(15,23,42,.3), inset 0 1px 0 rgba(255,255,255,.85), 0 0 0 1px rgba(16,185,129,.06); overflow-x:auto; scrollbar-width:none; }
      .mwnav-bar::-webkit-scrollbar { display:none; }
      .mwnav-btn { position:relative; flex:1 1 0; min-width:max-content; display:inline-flex; flex-direction:column; align-items:center; gap:2px; border:1px solid transparent; border-radius:12px; padding:7px 11px 6px; background:transparent; color:#64748b; font-size:11px; font-weight:700; cursor:pointer; transition:all .28s cubic-bezier(.22,1,.36,1); white-space:nowrap; text-decoration:none; }
      .mwnav-ico { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:9px; background:rgba(100,116,139,.08); color:#64748b; font-size:14px; line-height:1; transition:all .28s cubic-bezier(.22,1,.36,1); }
      .mwnav-label { display:block; line-height:1.15; }
      .mwnav-btn:hover { color:#334155; background:rgba(255,255,255,.7); transform:translateY(-1px); }
      .mwnav-btn:hover .mwnav-ico { background:rgba(16,185,129,.14); color:#059669; transform:scale(1.06); }
      .mwnav-btn.active { background:linear-gradient(135deg,#059669,#10b981); color:#fff; box-shadow:0 10px 24px -8px rgba(16,185,129,.5), inset 0 1px 0 rgba(255,255,255,.3); transform:translateY(-1px); }
      .mwnav-btn.active .mwnav-ico { background:rgba(255,255,255,.22); color:#fff; transform:scale(1.08); }
      @media (max-width:640px) { .mwnav-btn { flex:none; padding:6px 10px 5px; } .mwnav-ico { width:25px; height:25px; font-size:13px; } .mwnav-label { font-size:10px; } }
    </style>
    <nav class="mwnav-bar" aria-label="Workspace materi">
      <a class="mwnav-btn" href="#guru/materi"><span class="mwnav-ico">▤</span><span class="mwnav-label">Materi Saya</span></a>
      <a class="mwnav-btn" href="#guru/materi"><span class="mwnav-ico">＋</span><span class="mwnav-label">Buat Materi</span></a>
      <a class="mwnav-btn" href="#guru/materi-ai"><span class="mwnav-ico">✦</span><span class="mwnav-label">Materi AI</span></a>
      <a class="mwnav-btn active" href="#guru/materi-import"><span class="mwnav-ico">📥</span><span class="mwnav-label">Import Materi</span></a>
      <a class="mwnav-btn" href="#guru/ppt-ai"><span class="mwnav-ico">📊</span><span class="mwnav-label">Materi PPT</span></a>
    </nav>
    <div class="mi">
    <section class="mi-hero"><div class="mi-hero-copy"><p class="mi-kicker"><span>${editMode ? '✏️' : '📥'}</span> <span id="mi-hero-kicker">${editMode ? 'Edit Materi' : 'Import Materi'}</span></p><h1 id="mi-hero-title">${editMode ? 'Edit kode HTML materi terbit.' : 'Tempel HTML dari AI eksternal.'}</h1><p class="mi-sub" id="mi-hero-sub">${editMode ? 'Ubah HTML langsung atau tempel hasil revisi dari Kilo/Cline. Simpan untuk memperbarui materi yang sudah dilihat siswa.' : 'Salin hasil dari ChatGPT, Claude, atau penyedia lain — tempel di sini, lihat pratinjau, lalu simpan atau publikasikan ke kelas.'}</p></div></section>

    <div class="mi-info-card">
      <strong>Cara pakai:</strong>
      <ul>
        <li>Salin HTML dari penyedia AI (klik "Copy HTML" atau "Export").</li>
        <li>Tempel ke kolom di kiri — pratinjau muncul otomatis di kanan.</li>
        <li>Tailwind, MathJax, font, dan interaktivitas (drag-drop, kuis) tetap berfungsi.</li>
        <li>Tombol <strong>Sanitasi</strong> opsional: hapus script & event handler untuk versi statis.</li>
        <li>Isi judul/mapel/kelas, lalu Simpan (draft) atau Publish (distribusi ke kelas).</li>
      </ul>
    </div>

    <div class="mi-meta">
      <input id="mi-title" placeholder="Judul materi (otomatis dari H1)" aria-label="Judul">
      <input id="mi-mapel" placeholder="Mata pelajaran" aria-label="Mata pelajaran">
      <input id="mi-kelas" placeholder="Kelas (cth: X.1)" aria-label="Kelas">
    </div>

    <div class="mi-grid">
      <div class="mi-panel">
        <div class="mi-panel-head"><span>Kode HTML</span><small class="mi-chars" id="mi-chars">0 karakter</small></div>
        <div class="mi-panel-body">
          <textarea id="mi-html" class="mi-textarea" placeholder="Tempel kode HTML di sini...&#10;&#10;Contoh dari ChatGPT:&#10;&lt;h1&gt;Fotosintesis&lt;/h1&gt;&#10;&lt;p&gt;Fotosintesis adalah proses...&lt;/p&gt;&#10;&lt;img src=&quot;...&quot; alt=&quot;diagram&quot;&gt;&#10;&#10;Script & event handler otomatis dihapus." aria-label="Kode HTML"></textarea>
        </div>
      </div>
      <div class="mi-panel">
        <div class="mi-panel-head">
          <span>Pratinjau</span>
          <div class="mi-toggle"><button class="active" data-preview="rendered">Hasil</button><button data-preview="source">Sumber</button></div>
        </div>
        <div class="mi-panel-body">
          <div class="mi-preview-wrap" id="mi-preview-wrap">
            <div class="mi-empty" id="mi-preview-empty"><span>📄</span><p>Pratinjau muncul di sini setelah HTML ditempel.</p></div>
            <iframe id="mi-preview-frame" class="mi-preview-frame" hidden sandbox="allow-scripts allow-modals allow-popups" title="Pratinjau materi"></iframe>
            <pre id="mi-preview-source" hidden style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.6;color:#475569"></pre>
          </div>
        </div>
      </div>
    </div>

    <div class="mi-toolbar">
      <div class="mi-toggle">
        <button class="active" data-mode="paste">Tempel</button>
        <button data-mode="clear" id="mi-clear-btn">Bersihkan</button>
      </div>
      <button class="mi-btn icon" id="mi-paste-btn" title="Tempel dari clipboard">📋 Tempel</button>
      <button class="mi-btn" id="mi-copy-html-btn" disabled title="Salin HTML saat ini untuk direvisi di Kilo/Cline">📄 Salin HTML</button>
      <button class="mi-btn" id="mi-copy-prompt-btn" disabled title="Salin HTML + instruksi revisi siap tempel ke Kilo/Cline">✨ Salin Prompt Revisi</button>
      <button class="mi-btn" id="mi-sanitize-btn" disabled>🛡️ Sanitasi</button>
      <button class="mi-btn danger" id="mi-reset-btn">Reset</button>
      <span style="flex:1"></span>
      <button class="mi-btn" id="mi-save-btn" disabled>${editMode ? '💾 Simpan Perubahan' : '💾 Simpan Draft'}</button>
      <button class="mi-btn primary" id="mi-publish-btn" disabled>${editMode ? '📤 Ubah Kelas' : '📤 Publish'}</button>
    </div>
    <p class="mi-status" id="mi-status" aria-live="polite"></p>

    <div id="mi-publish-modal" class="mi-modal" hidden>
      <div class="mi-modal-bg"></div>
      <div class="mi-modal-card">
        <div class="mi-modal-head"><h3>Publikasikan ke Kelas</h3><button class="mi-btn icon" id="mi-publish-close" aria-label="Tutup">×</button></div>
        <div class="mi-modal-body">
          <p class="mi-modal-desc">Pilih kelas tujuan. Materi akan langsung terlihat oleh siswa di kelas tersebut.</p>
          <div class="mi-modal-toolbar"><button class="mi-btn" id="mi-select-all">Pilih Semua</button><button class="mi-btn" id="mi-deselect-all">Kosongkan</button></div>
          <div class="mi-targets" id="mi-targets"></div>
          <p id="mi-publish-status" class="mi-status"></p>
        </div>
        <div class="mi-modal-foot"><button class="mi-btn" id="mi-publish-cancel">Batal</button><button class="mi-btn primary" id="mi-publish-confirm">Publikasikan</button></div>
      </div>
    </div>

    <div id="mi-toast" class="mi-toast"></div>
  </div>`);
  container.innerHTML = html;

  const ta = container.querySelector('#mi-html');
  const titleInput = container.querySelector('#mi-title');
  const mapelInput = container.querySelector('#mi-mapel');
  const kelasInput = container.querySelector('#mi-kelas');
  const charsEl = container.querySelector('#mi-chars');
  const previewFrame = container.querySelector('#mi-preview-frame');
  const previewSource = container.querySelector('#mi-preview-source');
  const previewEmpty = container.querySelector('#mi-preview-empty');
  const previewWrap = container.querySelector('#mi-preview-wrap');
  const statusEl = container.querySelector('#mi-status');
  const toastEl = container.querySelector('#mi-toast');
  const sanitizeBtn = container.querySelector('#mi-sanitize-btn');
  const copyHtmlBtn = container.querySelector('#mi-copy-html-btn');
  const copyPromptBtn = container.querySelector('#mi-copy-prompt-btn');
  const saveBtn = container.querySelector('#mi-save-btn');
  const publishBtn = container.querySelector('#mi-publish-btn');
  const resetBtn = container.querySelector('#mi-reset-btn');
  const pasteBtn = container.querySelector('#mi-paste-btn');
  const publishModal = container.querySelector('#mi-publish-modal');
  const targetsWrap = container.querySelector('#mi-targets');
  const publishStatusEl = container.querySelector('#mi-publish-status');
  const publishConfirmBtn = container.querySelector('#mi-publish-confirm');

  const showToast = (msg) => { toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 2400); };
  const setStatus = (msg) => { statusEl.textContent = msg || ''; };

  const updatePreview = () => {
    rawHtml = ta.value.trim();
    charsEl.textContent = `${rawHtml.length.toLocaleString('id-ID')} karakter`;
    if (!rawHtml) {
      previewFrame.hidden = true;
      previewSource.hidden = true;
      previewEmpty.hidden = false;
      sanitizeBtn.disabled = true;
      copyHtmlBtn.disabled = true;
      copyPromptBtn.disabled = true;
      saveBtn.disabled = true;
      publishBtn.disabled = true;
      return;
    }
    sanitizedHtml = rawHtml;
    sanitizeBtn.disabled = false;
    copyHtmlBtn.disabled = false;
    copyPromptBtn.disabled = false;
    saveBtn.disabled = false;
    publishBtn.disabled = false;
    if (!titleInput.value.trim()) {
      autoTitle = extractTitle(rawHtml);
      titleInput.value = autoTitle;
    }
    previewEmpty.hidden = true;
    if (previewMode === 'rendered') {
      previewFrame.hidden = false;
      previewSource.hidden = true;
      const isFullDoc = /^\s*<!doctype|^\s*<html/i.test(rawHtml);
      previewFrame.srcdoc = isFullDoc ? rawHtml : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${rawHtml}</body></html>`;
    } else {
      previewFrame.hidden = true;
      previewSource.hidden = false;
      previewSource.textContent = sanitizedHtml;
    }
  };

  let debounceTimer = null;
  ta.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(updatePreview, 300); });

  container.querySelectorAll('[data-preview]').forEach((btn) => btn.addEventListener('click', () => {
    previewMode = btn.dataset.preview;
    container.querySelectorAll('[data-preview]').forEach((b) => b.classList.toggle('active', b === btn));
    updatePreview();
  }));

  sanitizeBtn.addEventListener('click', () => {
    if (!rawHtml) return;
    const { html: cleaned, removed } = sanitizeMaterialHtml(rawHtml);
    ta.value = cleaned;
    updatePreview();
    showToast(removed.length
      ? `Sanitasi selesai · ${removed.length} sumber luar allowlist dibuang`
      : 'Aman · tidak ada sumber luar allowlist');
    if (removed.length) setStatus(`Dibuang: ${removed.join(' | ')}`);
  });

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  copyHtmlBtn.addEventListener('click', async () => {
    if (!rawHtml) return;
    const ok = await copyToClipboard(rawHtml);
    showToast(ok ? 'HTML disalin — tempel ke Kilo/Cline untuk direvisi' : 'Gagal menyalin — pilih teks di editor lalu Ctrl+C');
  });

  copyPromptBtn.addEventListener('click', async () => {
    if (!rawHtml) return;
    const prompt = buildRevisionPrompt(rawHtml, { title: titleInput.value || autoTitle || 'Materi' });
    const ok = await copyToClipboard(prompt);
    showToast(ok ? 'Prompt revisi disalin — tempel ke Kilo/Cline' : 'Gagal menyalin prompt');
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { ta.value = text; updatePreview(); showToast('Ditempel dari clipboard'); }
      else { showToast('Clipboard kosong'); }
    } catch {
      showToast('Akses clipboard ditolak — tempel manual (Ctrl+V)');
      ta.focus();
    }
  });

  resetBtn.addEventListener('click', () => {
    if (!ta.value && !titleInput.value) return;
    if (!window.confirm('Reset semua? HTML, judul, dan metadata akan dikosongkan.')) return;
    ta.value = ''; titleInput.value = ''; mapelInput.value = ''; kelasInput.value = '';
    currentDraftId = ''; sanitizedHtml = ''; autoTitle = '';
    updatePreview(); setStatus(''); showToast('Direset');
  });

  container.querySelector('#mi-clear-btn').addEventListener('click', () => { ta.value = ''; updatePreview(); });

  const saveDraft = async () => {
    if (!sanitizedHtml) return;
    const { html: safeHtml, removed } = sanitizeMaterialHtml(sanitizedHtml);
    if (removed.length) {
      ta.value = safeHtml;
      updatePreview();
    }
    saveBtn.disabled = true;
    const savingLabel = editMode ? 'Menyimpan...' : 'Menyimpan...';
    saveBtn.textContent = savingLabel;
    try {
      const now = new Date().toISOString();

      // Mode edit: perbarui materi TERBIT di tempat (id yang sama), sehingga
      // versi yang dilihat siswa ikut ter-update tanpa menduplikasi dokumen.
      if (editMode && editingDoc) {
        const payload = {
          ...editingDoc,
          title: safeString(titleInput.value || editingDoc.title || autoTitle || 'Materi'),
          html_source: safeHtml,
          doc_mode: 'html',
          document_json: null,
          updated_at: now,
        };
        await savePublishedMaterial(payload);
        editingDoc = payload;
        setStatus(`Perubahan tersimpan${removed.length ? ` · ${removed.length} sumber luar allowlist dibuang` : ''}. Siswa melihat versi baru.`);
        showToast('Perubahan tersimpan');
        return;
      }

      const id = currentDraftId || `mimp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const draft = {
        id,
        guru_id: safeString(userId),
        guru_nama: safeString(userName || 'Guru'),
        title: safeString(titleInput.value || autoTitle || 'Materi Import'),
        subject: safeString(mapelInput.value),
        class_name: safeString(kelasInput.value),
        duration: '2 JP',
        chapter: '',
        note: 'Materi dari Import HTML',
        source: 'import',
        doc_mode: 'html',
        html_source: safeHtml,
        document_json: null,
        tahun_ajaran_id: safeString(context?.tahun_ajaran_aktif),
        semester_id: safeString(context?.semester_aktif),
        updated_at: now,
        created_at: now,
      };
      // Cadangan lokal (offline) — bukan sumber utama.
      const drafts = readDrafts();
      const idx = drafts.findIndex((d) => d.id === id);
      if (idx >= 0) drafts[idx] = draft; else drafts.push(draft);
      writeDrafts(drafts);
      await saveMaterialWorkspaceDraft(draft);
      currentDraftId = id;
      setStatus(`Tersimpan sebagai draft${removed.length ? ` · ${removed.length} sumber luar allowlist dibuang` : ''}. Buka menu Materi > Materi Saya > Draft untuk menerbitkan.`);
      showToast('Draft tersimpan');
    } catch (error) {
      showToast(error?.message || 'Gagal menyimpan');
      setStatus(error?.message || 'Gagal menyimpan.');
    } finally {
      saveBtn.disabled = !sanitizedHtml;
      saveBtn.textContent = editMode ? '💾 Simpan Perubahan' : '💾 Simpan Draft';
    }
  };
  saveBtn.addEventListener('click', saveDraft);

  const openPublishModal = () => {
    if (!sanitizedHtml) return;
    if (!teachingAssignments.length) { showToast('Relasi mengajar belum diatur'); return; }
    const preselected = new Set([
      ...((editingDoc?.pengajaran_ids) || []),
      editingDoc?.pengajaran_id,
    ].filter(Boolean).map(String));
    targetsWrap.innerHTML = teachingAssignments.map((item) => `<label class="mi-target"><input type="checkbox" value="${escapeHtml(String(item.id))}"${preselected.has(String(item.id)) ? ' checked' : ''}><div class="mi-target-info"><span class="mi-target-name">${escapeHtml(item.kelas_nama || item.kelas_id || 'Tanpa kelas')}</span><span class="mi-target-meta">${escapeHtml(item.mapel_nama || item.mapel_id || 'Tanpa mapel')}</span></div></label>`).join('');
    targetsWrap.querySelectorAll('input').forEach((input) => input.addEventListener('change', updateTargetCount));
    publishStatusEl.textContent = ''; publishStatusEl.className = 'mi-status';
    updateTargetCount();
    publishModal.hidden = false;
  };
  const closePublishModal = () => { publishModal.hidden = true; };
  const updateTargetCount = () => {
    const count = targetsWrap.querySelectorAll('input:checked').length;
    publishConfirmBtn.textContent = count ? `Publikasikan (${count})` : 'Publikasikan';
    publishConfirmBtn.disabled = count === 0;
  };

  publishBtn.addEventListener('click', openPublishModal);
  container.querySelector('#mi-publish-close').addEventListener('click', closePublishModal);
  container.querySelector('#mi-publish-cancel').addEventListener('click', closePublishModal);
  container.querySelector('.mi-modal-bg').addEventListener('click', closePublishModal);
  container.querySelector('#mi-select-all').addEventListener('click', () => { targetsWrap.querySelectorAll('input').forEach((i) => { i.checked = true; }); updateTargetCount(); });
  container.querySelector('#mi-deselect-all').addEventListener('click', () => { targetsWrap.querySelectorAll('input').forEach((i) => { i.checked = false; }); updateTargetCount(); });

  publishConfirmBtn.addEventListener('click', async () => {
    const targets = [...targetsWrap.querySelectorAll('input:checked')].map((input) => {
      const label = input.closest('.mi-target');
      return { id: input.value, kelas_nama: label?.querySelector('.mi-target-name')?.textContent || '', kelas_id: input.value, mapel_nama: label?.querySelector('.mi-target-meta')?.textContent || '' };
    });
    if (!targets.length) return;
    publishConfirmBtn.disabled = true; publishConfirmBtn.textContent = 'Memublikasikan...';
    const sourceId = (editMode && editingDoc)
      ? String(editingDoc.source_id || editingDoc.id || currentDraftId)
      : (currentDraftId || `mimp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const now = new Date().toISOString();
    const title = safeString(titleInput.value || autoTitle || 'Materi Import');
    const mapel = safeString(mapelInput.value || editingDoc?.mapel_nama || editingDoc?.mapel_id);
    const kelas = safeString(kelasInput.value);
    const { html: safeHtml } = sanitizeMaterialHtml(sanitizedHtml);
    try {
      // Satu dokumen untuk semua kelas — html_source tidak diduplikasi.
      await savePublishedMaterialForClasses({
        id: sourceId,
        source_id: sourceId,
        guru_id: safeString(userId),
        guru_nama: safeString(userName || 'Guru'),
        mapel_id: safeString(mapel),
        mapel_nama: safeString(mapel || 'Mata Pelajaran'),
        title,
        note: editingDoc?.note || 'Materi dari Import HTML',
        level: editingDoc?.level || '',
        chapter: editingDoc?.chapter || '',
        meetings: editingDoc?.meetings || '',
        doc_mode: 'html',
        html_source: safeHtml,
        document_json: null,
        visible_to_students: true,
        source: editingDoc?.source || 'materi_import',
        tahun_ajaran_id: safeString(editingDoc?.tahun_ajaran_id || context?.tahun_ajaran_aktif),
        semester_id: safeString(editingDoc?.semester_id || context?.semester_aktif),
        published_at: editingDoc?.published_at || now,
        created_at: editingDoc?.created_at || now,
      }, targets.map((target) => ({
        id: safeString(target.id),
        kelas_id: safeString(target.kelas_id || target.kelas_nama || kelas),
        kelas_nama: safeString(target.kelas_nama || target.kelas_id || kelas),
        mapel_id: safeString(mapel),
        mapel_nama: safeString(mapel || target.mapel_nama || 'Mata Pelajaran'),
      })));
      // Draft sudah menjadi materi terbit — hapus agar tidak muncul dua kali.
      try { await deleteMaterialWorkspaceDraft(sourceId, userId); } catch { /* draft belum ada */ }
      currentDraftId = sourceId;
      closePublishModal();
      showToast(`Diterbitkan ke ${targets.length} kelas`);
      setStatus(`Berhasil diterbitkan ke ${targets.length} kelas. Siswa dapat melihat materi sekarang.`);
    } catch (error) {
      publishStatusEl.textContent = error?.message || 'Publish gagal. Periksa koneksi dan izin.';
      publishStatusEl.className = 'mi-result error';
      showToast(error?.message || 'Publish gagal');
    } finally {
      publishConfirmBtn.disabled = false;
      updateTargetCount();
    }
  });

  // Mode edit: muat materi terbit ber-mode HTML lalu isi editor.
  if (editMode) {
    setStatus('Memuat materi untuk diedit...');
    saveBtn.disabled = true;
    publishBtn.disabled = true;
    try {
      const list = userId ? await getPublishedMaterialsForTeacher(userId) : [];
      const doc = (list || []).find((m) => String(m.source_id || m.id) === editId || String(m.id) === editId);
      if (!doc) {
        setStatus('Materi tidak ditemukan atau bukan milik Anda.');
        showToast('Materi tidak ditemukan');
      } else if (!(typeof doc.html_source === 'string' && doc.html_source.trim()) || (doc.document_json && typeof doc.document_json === 'object')) {
        setStatus('Materi ini bukan mode HTML sehingga tidak bisa diedit di sini. Gunakan "Sunting AI".');
        showToast('Bukan materi HTML');
      } else {
        editingDoc = doc;
        currentDraftId = String(doc.source_id || doc.id);
        titleInput.value = doc.title || '';
        mapelInput.value = doc.mapel_nama || doc.mapel_id || '';
        kelasInput.value = doc.kelas_nama_csv || doc.kelas_nama || '';
        ta.value = doc.html_source || '';
        updatePreview();
        setStatus('Materi dimuat. Edit HTML atau tempel hasil revisi, lalu Simpan Perubahan.');
      }
    } catch (error) {
      setStatus(error?.message || 'Gagal memuat materi.');
      showToast('Gagal memuat materi');
    }
    return;
  }

  updatePreview();
}
