import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  listMateriAiForUser,
  saveMateriAi,
  deleteMateriAi,
} from '../../firebase/materi-ai-service.js';
import { 
  savePublishedMaterial,
  getActiveTeachingAssignments,
} from '../../firebase/data-service.js';
import { streamGenerateMaterial, MaterialGenerationError, getApiBase } from '../../utils/ai-client.js';
import {
  renderMarkdown,
  exportToWord,
  exportToPdf,
  extractTitleFromMarkdown,
} from '../../utils/markdown-export.js';

const MATERIAL_DRAFTS_KEY = 'simguru_material_html_drafts';

const MATERIAL_DRAFTS_KEY = 'simguru_material_html_drafts';

const TAMPILAN_OPTIONS = [
  { value: 'modern', label: 'Modern' },
  { value: 'premium', label: 'Premium' },
  { value: 'interaktif', label: 'Interaktif' },
  { value: 'bersih', label: 'Bersih' },
  { value: 'multitab', label: 'Multi Tab' },
  { value: 'ilustratif', label: 'Ilustratif' },
  { value: 'ringkas', label: 'Ringkas' },
];

function normalizeClassToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(MATERIAL_DRAFTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeDrafts(drafts) {
  localStorage.setItem(MATERIAL_DRAFTS_KEY, JSON.stringify(drafts));
}

const KEDALAMAN_OPTIONS = [
  { value: '', label: 'Pilih tingkat' },
  { value: 'pengenalan', label: 'Pengenalan' },
  { value: 'menengah', label: 'Menengah' },
  { value: 'mendalam', label: 'Mendalam (HOTS)' },
  { value: 'advanced', label: 'Advanced' },
];

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid() {
  return `mai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function premiumStyles() {
  return `
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes floatSoft { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.02); } }
    @keyframes slideUp { 0% { opacity:0; transform:translateY(16px); } 100% { opacity:1; transform:translateY(0); } }
    @keyframes pulseGlow { 0%,100% { opacity: 0.35; } 50% { opacity: 0.8; } }
    .premium-glass { background: rgba(255,255,255,0.72); backdrop-filter: blur(20px) saturate(1.4); -webkit-backdrop-filter: blur(20px) saturate(1.4); border: 1px solid rgba(255,255,255,0.5); }
    .premium-glass-strong { background: rgba(255,255,255,0.9); backdrop-filter: blur(24px) saturate(1.6); -webkit-backdrop-filter: blur(24px) saturate(1.6); border: 1px solid rgba(255,255,255,0.6); }
    .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
    .animate-float { animation: floatSoft 5s ease-in-out infinite; }
    .scrollbar-premium::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-premium::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
    .premium-input { transition: all 0.25s cubic-bezier(0.16,1,0.3,1); }
    .premium-input:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99,102,241,0.12); outline: none; }
    .btn-premium { transition: all 0.3s cubic-bezier(0.16,1,0.3,1); position: relative; overflow: hidden; }
    .btn-premium:active { transform: scale(0.97); }
    .btn-premium:disabled { opacity: 0.6; cursor: not-allowed; }
    .card-hover-premium { transition: all 0.35s cubic-bezier(0.16,1,0.3,1); }
    .card-hover-premium:hover { transform: translateY(-3px); box-shadow: 0 22px 44px -14px rgba(15,23,42,0.2); }
    .ai-preview :where(h1,h2,h3) { font-weight: 700; line-height: 1.3; margin: 1em 0 0.4em; color:#0f172a; }
    .ai-preview h1 { font-size: 1.6rem; }
    .ai-preview h2 { font-size: 1.3rem; }
    .ai-preview h3 { font-size: 1.1rem; }
    .ai-preview p { margin: 0.6em 0; line-height: 1.75; color:#1e293b; }
    .ai-preview ul, .ai-preview ol { margin: 0.6em 0; padding-left: 1.4em; color:#1e293b; }
    .ai-preview li { margin: 0.3em 0; line-height: 1.7; }
    .ai-preview table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    .ai-preview th, .ai-preview td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    .ai-preview th { background: #eef2ff; }
    .ai-preview pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 12px; overflow-x: auto; }
    .ai-preview code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; font-size: 0.9em; }
    .ai-preview pre code { background: transparent; padding: 0; }
    .ai-preview blockquote { border-left: 4px solid #6366f1; margin: 1em 0; padding: 8px 14px; background: #f8fafc; border-radius: 0 12px 12px 0; color: #334155; }
    .ai-preview img { max-width: 100%; border-radius: 12px; }
    .ai-typing-dot { display:inline-block; width:6px; height:6px; margin:0 1px; border-radius:999px; background:#6366f1; animation: pulseGlow 1s ease-in-out infinite; }
  `;
}

function formHtml() {
  const tampilanCheckboxes = TAMPILAN_OPTIONS.map(
    (opt) => `
      <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50">
        <input type="checkbox" name="tampilan" value="${opt.value}" class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400" />
        <span>${opt.label}</span>
      </label>`
  ).join('');

  const kedalamanOptions = KEDALAMAN_OPTIONS.map(
    (opt) => `<option value="${opt.value}">${opt.label}</option>`
  ).join('');

  return `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div class="flex items-center gap-2 text-xs font-medium text-slate-500">
        <i class="fas fa-plug"></i>
        <span>Status Layanan AI:</span>
        <span id="conn-status" class="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 text-slate-600">
          <span class="h-2 w-2 rounded-full bg-slate-400"></span>Belum dicek
        </span>
      </div>
      <button type="button" id="test-conn-btn" class="btn-premium inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50">
        <i class="fas fa-circle-nodes"></i><span>Tes Koneksi</span>
      </button>
    </div>
    <form id="materi-ai-form" class="space-y-4" novalidate>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Mata Pelajaran</label>
          <input name="mapel" type="text" placeholder="Mis. Matematika" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Kelas</label>
          <input name="kelas" type="text" placeholder="Mis. X.1" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Fase</label>
          <input name="fase" type="text" placeholder="Mis. Fase E" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Semester</label>
          <input name="semester" type="text" placeholder="Mis. Ganjil" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Bab / Unit</label>
          <input name="bab" type="text" placeholder="Mis. Persamaan Linear" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Topik</label>
          <input name="topik" type="text" placeholder="Mis. SPLDV" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Alokasi Waktu</label>
          <input name="alokasiWaktu" type="text" placeholder="Mis. 2 JP" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Tingkat Kedalaman</label>
          <select name="kedalaman" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">${kedalamanOptions}</select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Jumlah Contoh</label>
          <input name="jumlahContoh" type="number" min="0" max="20" value="3" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold text-slate-600">Jumlah Latihan Soal</label>
          <input name="jumlahLatihan" type="number" min="0" max="50" value="5" class="premium-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-semibold text-slate-600">Lain-lain (catatan tambahan)</label>
        <textarea name="lainLain" rows="2" placeholder="Mis. Tekankan langkah berpikir, sertakan soal HOTS..." class="premium-input w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"></textarea>
      </div>

      <div>
        <label class="mb-1.5 block text-xs font-semibold text-slate-600">Tampilan</label>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">${tampilanCheckboxes}</div>
      </div>

      <div class="flex flex-col gap-2 pt-1 sm:flex-row">
        <button type="submit" id="generate-btn" class="btn-premium inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-12px_rgba(99,102,241,0.55)]">
          <i class="fas fa-wand-magic-sparkles"></i>
          <span>Generate Materi</span>
        </button>
        <button type="button" id="stop-btn" disabled class="btn-premium inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm disabled:opacity-50">
          <i class="fas fa-stop"></i>
          <span>Stop</span>
        </button>
        <button type="button" id="continue-btn" disabled class="btn-premium inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-50">
          <i class="fas fa-forward-step"></i>
          <span>Lanjutkan</span>
        </button>
      </div>
    </form>
  `;
}

function resultHtml() {
  return `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div id="result-status" class="text-xs font-medium text-slate-500">Belum ada hasil.</div>
        <div class="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-xs font-semibold">
          <button type="button" data-view="editor" class="ai-view-btn rounded-full px-3 py-1.5 text-slate-600">Editor</button>
          <button type="button" data-view="preview" class="ai-view-btn rounded-full px-3 py-1.5 text-slate-600">Preview</button>
          <button type="button" data-view="split" class="ai-view-btn rounded-full px-3 py-1.5 text-slate-600">Split</button>
        </div>
      </div>

      <div id="result-panels" class="grid gap-3" data-view="split">
        <div data-panel="editor" class="min-h-[320px]">
          <textarea id="markdown-editor" placeholder="Hasil Markdown akan muncul di sini. Anda dapat menyuntingnya langsung." class="scrollbar-premium h-[52vh] min-h-[320px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none"></textarea>
        </div>
        <div data-panel="preview" class="min-h-[320px]">
          <div id="markdown-preview" class="ai-preview scrollbar-premium h-[52vh] min-h-[320px] overflow-auto rounded-2xl border border-slate-200 bg-white p-5"></div>
        </div>
      </div>

      <div id="ai-error" hidden class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"></div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" id="save-btn" disabled class="btn-premium inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50">
          <i class="fas fa-save"></i><span>Simpan</span>
        </button>
        <button type="button" id="publish-btn" disabled class="btn-premium inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50">
          <i class="fas fa-paper-plane"></i><span>Publish</span>
        </button>
        <button type="button" id="word-btn" disabled class="btn-premium inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
          <i class="fas fa-file-word"></i><span>Word</span>
        </button>
        <button type="button" id="pdf-btn" disabled class="btn-premium inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
          <i class="fas fa-file-pdf"></i><span>PDF</span>
        </button>
        <button type="button" id="copy-btn" disabled class="btn-premium inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
          <i class="fas fa-copy"></i><span>Salin</span>
        </button>
        <button type="button" id="clear-btn" class="btn-premium ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-50">
          <i class="fas fa-eraser"></i><span>Bersihkan</span>
        </button>
      </div>
      <div id="save-status" class="text-xs text-emerald-600"></div>
    </div>
  `;
}

function historyHtml() {
  return `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-700">Riwayat Generate</h3>
        <button type="button" id="refresh-history" class="text-xs font-medium text-indigo-600 hover:underline"><i class="fas fa-rotate"></i> Muat ulang</button>
      </div>
      <div id="history-list" class="space-y-2">
        <p class="text-xs text-slate-400">Memuat riwayat...</p>
      </div>
    </div>
  `;
}

export async function renderGuruMateriAiPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const userName = session?.user?.nama || 'Guru';

  // Load teaching assignments untuk keperluan draft
  let teachingAssignments = [];
  try {
    teachingAssignments = await getActiveTeachingAssignments(context);
  } catch (error) {
    console.warn('Gagal memuat relasi mengajar:', error);
  }

  const html = renderLayout(
    'Materi AI',
    `
    <style>${premiumStyles()}</style>
    <div class="animate-slide-up space-y-5">
      <section class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-600 via-indigo-600 to-fuchsia-600 p-5 text-white shadow-[0_28px_70px_-36px_rgba(99,102,241,0.6)] sm:p-6">
        <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-3xl animate-float"></div>
        <div class="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Asisten Guru • AI Aman</p>
            <h2 class="mt-1 text-xl font-bold sm:text-2xl">Generator Materi AI</h2>
            <p class="mt-1 max-w-xl text-sm text-white/85">Buat materi pembelajaran lengkap dari OpenAI-compatible API. API key disimpan di server, tidak pernah di frontend.</p>
          </div>
          <div class="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium">
            <i class="fas fa-shield-halved"></i><span>Aman • Streaming</span>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <section class="premium-glass-strong rounded-[24px] p-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] sm:p-5 lg:col-span-2">
          ${formHtml()}
        </section>

        <section class="premium-glass-strong rounded-[24px] p-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] sm:p-5 lg:col-span-3">
          ${resultHtml()}
        </section>
      </div>

      <section class="premium-glass-strong rounded-[24px] p-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] sm:p-5">
        ${historyHtml()}
      </section>
    </div>
  `,
    { accentPanel: 'from-violet-500 via-indigo-500 to-fuchsia-500' }
  );

  container.innerHTML = html;

  initMateriAi(container, { userId, userName, teachingAssignments, context });
  loadHistory(container, userId);
}

function initMateriAi(root, { userId, userName, teachingAssignments, context }) {
  const form = root.querySelector('#materi-ai-form');
  const generateBtn = root.querySelector('#generate-btn');
  const stopBtn = root.querySelector('#stop-btn');
  const editor = root.querySelector('#markdown-editor');
  const preview = root.querySelector('#markdown-preview');
  const statusEl = root.querySelector('#result-status');
  const errorEl = root.querySelector('#ai-error');
  const panels = root.querySelector('#result-panels');
  const saveBtn = root.querySelector('#save-btn');
  const publishBtn = root.querySelector('#publish-btn');
  const wordBtn = root.querySelector('#word-btn');
  const pdfBtn = root.querySelector('#pdf-btn');
  const copyBtn = root.querySelector('#copy-btn');
  const clearBtn = root.querySelector('#clear-btn');
  const continueBtn = root.querySelector('#continue-btn');
  const saveStatus = root.querySelector('#save-status');

  let abortController = null;
  let isGenerating = false;
  let currentRecordId = null;
  let previewTimer = null;

  const actionButtons = [saveBtn, publishBtn, wordBtn, pdfBtn, copyBtn];

  // Helper untuk build draft payload dari materi AI
  function buildDraftPayloadFromAI() {
    const markdown = editor.value.trim();
    if (!markdown) {
      showError('Konten materi masih kosong.');
      return null;
    }

    const input = readForm();
    const title = extractTitleFromMarkdown(markdown);
    const htmlContent = renderMarkdown(markdown);

    // Cari teaching assignment yang sesuai dengan mapel dan kelas dari form
    let assignment = null;
    if (teachingAssignments && teachingAssignments.length > 0) {
      const mapelLower = String(input.mapel || '').trim().toLowerCase();
      const kelasLower = String(input.kelas || '').trim().toLowerCase();
      
      assignment = teachingAssignments.find((ta) => {
        const taMapel = String(ta.mapel_nama || '').trim().toLowerCase();
        const taKelas = String(ta.kelas_nama || '').trim().toLowerCase();
        return taMapel.includes(mapelLower) || mapelLower.includes(taMapel) ||
               taKelas.includes(kelasLower) || kelasLower.includes(taKelas);
      });
      
      // Jika tidak ketemu, ambil assignment pertama
      if (!assignment) {
        assignment = teachingAssignments[0];
      }
    }

    // Build payload
    const draftId = currentRecordId || `maai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const payload = {
      id: draftId,
      guru_id: userId,
      guru_nama: userName,
      title: title || 'Materi AI Tanpa Judul',
      level: input.fase || '',
      chapter: input.bab || '',
      meetings: input.alokasiWaktu || '',
      note: input.lainLain || `Materi dari AI - ${input.topik || ''}`,
      html_source: `<h1>${escapeHtml(title)}</h1>${htmlContent}`,
      updated_at: new Date().toISOString(),
      source: 'materi_ai',
      tahun_ajaran_id: context?.tahun_ajaran_aktif || '',
      semester_id: context?.semester_aktif || '',
    };

    // Tambahkan data dari assignment jika ada
    if (assignment) {
      payload.pengajaran_id = assignment.id;
      payload.kelas_id = assignment.kelas_id;
      payload.kelas_nama = assignment.kelas_nama;
      payload.kelas_token = normalizeClassToken(assignment.kelas_id || assignment.kelas_nama);
      payload.mapel_id = assignment.mapel_id;
      payload.mapel_nama = assignment.mapel_nama;
    } else {
      // Fallback jika tidak ada assignment
      payload.pengajaran_id = '';
      payload.kelas_id = '';
      payload.kelas_nama = input.kelas || '-';
      payload.kelas_token = normalizeClassToken(input.kelas || '');
      payload.mapel_id = '';
      payload.mapel_nama = input.mapel || 'Materi AI';
    }

    return payload;
  }

  function setView(view) {
    panels.setAttribute('data-view', view);
    root.querySelectorAll('.ai-view-btn').forEach((btn) => {
      const active = btn.getAttribute('data-view') === view;
      btn.classList.toggle('bg-white', active);
      btn.classList.toggle('shadow', active);
      btn.classList.toggle('text-indigo-700', active);
      btn.classList.toggle('text-slate-600', !active);
    });
    const editorPanel = panels.querySelector('[data-panel="editor"]');
    const previewPanel = panels.querySelector('[data-panel="preview"]');
    if (view === 'editor') {
      editorPanel.style.display = '';
      previewPanel.style.display = 'none';
    } else if (view === 'preview') {
      editorPanel.style.display = 'none';
      previewPanel.style.display = '';
    } else {
      editorPanel.style.display = '';
      previewPanel.style.display = '';
    }
  }

  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      preview.innerHTML = renderMarkdown(editor.value);
    }, 200);
  }

  function setGenerating(state) {
    isGenerating = state;
    generateBtn.disabled = state;
    stopBtn.disabled = !state;
    generateBtn.querySelector('span').textContent = state ? 'Menghasilkan...' : 'Generate Materi';
    if (state) {
      statusEl.innerHTML = '<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span> Sedang menulis materi...';
    }
  }

  function setResultAvailable(available) {
    actionButtons.forEach((btn) => (btn.disabled = !available));
  }

  function showError(message) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function readForm() {
    const data = new FormData(form);
    const tampilan = data.getAll('tampilan').map(String);
    return {
      mapel: String(data.get('mapel') || ''),
      kelas: String(data.get('kelas') || ''),
      fase: String(data.get('fase') || ''),
      semester: String(data.get('semester') || ''),
      bab: String(data.get('bab') || ''),
      topik: String(data.get('topik') || ''),
      alokasiWaktu: String(data.get('alokasiWaktu') || ''),
      kedalaman: String(data.get('kedalaman') || ''),
      jumlahContoh: String(data.get('jumlahContoh') || ''),
      jumlahLatihan: String(data.get('jumlahLatihan') || ''),
      lainLain: String(data.get('lainLain') || ''),
      tampilan,
    };
  }

  function updateContinueButton() {
    if (continueBtn) continueBtn.disabled = isGenerating || !editor.value.trim();
  }

  async function runStream(partial) {
    clearError();
    const input = readForm();

    if (!input.mapel.trim() && !input.topik.trim()) {
      showError('Minimal isi Mata Pelajaran atau Topik.');
      return;
    }

    const isContinuation = Boolean(partial && partial.trim());
    if (!isContinuation) {
      editor.value = '';
      preview.innerHTML = '';
      currentRecordId = null;
    }
    setResultAvailable(false);
    saveStatus.textContent = '';
    statusEl.textContent = isContinuation ? 'Melanjutkan materi…' : 'Menyiapkan…';
    setGenerating(true);
    updateContinueButton();

    abortController = new AbortController();

    try {
      await streamGenerateMaterial({
        input,
        temperature: 0.7,
        partial: isContinuation ? partial : undefined,
        signal: abortController.signal,
        onDelta: (chunk) => {
          editor.value += chunk;
          editor.scrollTop = editor.scrollHeight;
          schedulePreview();
        },
        onDone: ({ model }) => {
          statusEl.textContent = `Selesai${model ? ` • model: ${model}` : ''}`;
        },
        onError: (err) => {
          showError(err.message || 'Gagal menghasilkan materi.');
        },
      });
      setResultAvailable(Boolean(editor.value.trim()));
    } catch (err) {
      if (err instanceof MaterialGenerationError && err.code !== 'aborted') {
        showError(err.message);
        // Bila generasi terputus di tengah jalan, hasil sebagian tetap di editor.
        if (editor.value.trim()) {
          setResultAvailable(true);
          statusEl.textContent = isContinuation
            ? 'Lanjutan terputus — hasil sebagian bisa disimpan.'
            : 'Generasi terputus — hasil sebagian bisa disimpan.';
        }
      }
    } finally {
      setGenerating(false);
      abortController = null;
      updateContinueButton();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runStream(null);
  });

  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (!editor.value.trim() || isGenerating) return;
      runStream(editor.value);
    });
  }

  stopBtn.addEventListener('click', () => {
    if (abortController) abortController.abort();
    setGenerating(false);
    statusEl.textContent = 'Dibatalkan.';
  });

  const testConnBtn = root.querySelector('#test-conn-btn');
  const connStatus = root.querySelector('#conn-status');

  function renderConnStatus(state, text) {
    const map = {
      idle: ['bg-slate-200 text-slate-600', 'bg-slate-400'],
      checking: ['bg-amber-100 text-amber-700', 'bg-amber-400'],
      ok: ['bg-emerald-100 text-emerald-700', 'bg-emerald-500'],
      error: ['bg-rose-100 text-rose-700', 'bg-rose-500'],
    };
    const [wrap, dot] = map[state] || map.idle;
    connStatus.className = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${wrap}`;
    connStatus.innerHTML = `<span class="h-2 w-2 rounded-full ${dot} ${state === 'checking' ? 'animate-pulse' : ''}"></span>${escapeHtml(text)}`;
  }

  if (testConnBtn) {
    testConnBtn.addEventListener('click', async () => {
      renderConnStatus('checking', 'Mengecek...');
      testConnBtn.disabled = true;
      try {
        const res = await fetch(`${getApiBase()}/api/ai/test-connection`, { headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (data && data.ok) {
          renderConnStatus('ok', `Terhubung${data.model ? ` • ${data.model}` : ''}`);
        } else {
          renderConnStatus('error', data?.error || 'Gagal terhubung');
        }
      } catch (err) {
        renderConnStatus('error', 'Tidak dapat menghubungi server');
      } finally {
        testConnBtn.disabled = false;
      }
    });
  }

  editor.addEventListener('input', () => {
    schedulePreview();
    if (editor.value.trim()) setResultAvailable(true);
    updateContinueButton();
  });

  root.querySelectorAll('.ai-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.getAttribute('data-view')));
  });

  clearBtn.addEventListener('click', () => {
    editor.value = '';
    preview.innerHTML = '';
    currentRecordId = null;
    statusEl.textContent = 'Belum ada hasil.';
    setResultAvailable(false);
    saveStatus.textContent = '';
    clearError();
  });

  saveBtn.addEventListener('click', async () => {
    const draftPayload = buildDraftPayloadFromAI();
    if (!draftPayload) {
      return;
    }

    try {
      // Simpan ke draft localStorage (seperti di menu materi biasa)
      const allDrafts = readDrafts();
      const existingIndex = allDrafts.findIndex((item) => item.id === draftPayload.id);
      
      if (existingIndex >= 0) {
        allDrafts[existingIndex] = draftPayload;
      } else {
        allDrafts.push(draftPayload);
      }
      
      writeDrafts(allDrafts);
      currentRecordId = draftPayload.id;
      
      // Simpan juga ke riwayat materi_ai untuk tracking
      const markdown = editor.value.trim();
      const input = readForm();
      const title = extractTitleFromMarkdown(markdown);
      const aiRecord = {
        id: currentRecordId,
        guru_id: userId,
        guru_nama: userName,
        title,
        markdown,
        ...input,
        published: false,
        created_at: new Date().toISOString(),
      };
      await saveMateriAi(aiRecord);
      
      saveStatus.textContent = 'Tersimpan sebagai draft materi. Lihat di menu Materi > tab Daftar.';
      saveStatus.className = 'text-xs text-emerald-600';
      setTimeout(() => (saveStatus.textContent = ''), 4000);
      loadHistory(root, userId);
    } catch (err) {
      console.error('Error saving draft:', err);
      saveStatus.textContent = 'Gagal menyimpan draft.';
      saveStatus.className = 'text-xs text-rose-600';
    }
  });

  publishBtn.addEventListener('click', async () => {
    const draftPayload = buildDraftPayloadFromAI();
    if (!draftPayload) {
      return;
    }

    try {
      // 1. Simpan ke draft dengan status published
      const publishedDraft = {
        ...draftPayload,
        status: 'published',
        visible_to_students: true,
        published_at: new Date().toISOString(),
      };
      
      const allDrafts = readDrafts();
      const existingIndex = allDrafts.findIndex((item) => item.id === publishedDraft.id);
      
      if (existingIndex >= 0) {
        allDrafts[existingIndex] = publishedDraft;
      } else {
        allDrafts.push(publishedDraft);
      }
      
      writeDrafts(allDrafts);
      currentRecordId = publishedDraft.id;

      // 2. Publish ke koleksi materi_publish (untuk siswa)
      await savePublishedMaterial({
        id: publishedDraft.id,
        guru_id: publishedDraft.guru_id,
        guru_nama: publishedDraft.guru_nama,
        pengajaran_id: publishedDraft.pengajaran_id,
        kelas_id: publishedDraft.kelas_id,
        kelas_nama: publishedDraft.kelas_nama,
        kelas_token: publishedDraft.kelas_token,
        mapel_id: publishedDraft.mapel_id,
        mapel_nama: publishedDraft.mapel_nama,
        title: publishedDraft.title,
        html: publishedDraft.html_source,
        visible_to_students: true,
        status: 'published',
        published_at: publishedDraft.published_at,
        source: 'materi_ai',
        tahun_ajaran_id: publishedDraft.tahun_ajaran_id,
        semester_id: publishedDraft.semester_id,
        created_at: publishedDraft.updated_at,
        updated_at: publishedDraft.updated_at,
      });

      // 3. Simpan juga ke riwayat materi_ai
      const markdown = editor.value.trim();
      const input = readForm();
      const title = extractTitleFromMarkdown(markdown);
      const aiRecord = {
        id: currentRecordId,
        guru_id: userId,
        guru_nama: userName,
        title,
        markdown,
        ...input,
        published: true,
        created_at: new Date().toISOString(),
      };
      await saveMateriAi(aiRecord);

      saveStatus.textContent = 'Berhasil dipublikasikan! Materi sudah masuk ke halaman siswa dan daftar materi guru.';
      saveStatus.className = 'text-xs text-emerald-600';
      setTimeout(() => (saveStatus.textContent = ''), 4000);
      loadHistory(root, userId);
    } catch (err) {
      console.error('Error publishing material:', err);
      saveStatus.textContent = 'Gagal memublikasikan materi.';
      saveStatus.className = 'text-xs text-rose-600';
    }
  });

  wordBtn.addEventListener('click', () => {
    const markdown = editor.value.trim();
    if (!markdown) return;
    exportToWord(extractTitleFromMarkdown(markdown), renderMarkdown(markdown));
  });

  pdfBtn.addEventListener('click', async () => {
    const markdown = editor.value.trim();
    if (!markdown) return;
    pdfBtn.disabled = true;
    const original = pdfBtn.querySelector('span').textContent;
    pdfBtn.querySelector('span').textContent = 'Membuat PDF...';
    try {
      await exportToPdf(extractTitleFromMarkdown(markdown), preview);
    } catch (err) {
      showError(err.message || 'Gagal ekspor PDF.');
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.querySelector('span').textContent = original;
    }
  });

  copyBtn.addEventListener('click', async () => {
    const markdown = editor.value.trim();
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      const original = copyBtn.querySelector('span').textContent;
      copyBtn.querySelector('span').textContent = 'Tersalin!';
      setTimeout(() => (copyBtn.querySelector('span').textContent = original), 1500);
    } catch {
      showError('Tidak dapat menyalin ke clipboard.');
    }
  });

  const historyList = root.querySelector('#history-list');
  if (historyList) {
    historyList.addEventListener('click', async (event) => {
      const loadBtn = event.target.closest('[data-load-id]');
      const deleteBtn = event.target.closest('[data-delete-id]');
      if (loadBtn) {
        const id = loadBtn.getAttribute('data-load-id');
        const { getMateriAi } = await import('../../firebase/materi-ai-service.js');
        const record = await getMateriAi(id);
        if (record) loadRecordIntoForm(root, form, editor, preview, statusEl, record);
      } else if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-delete-id');
        if (window.confirm('Hapus riwayat ini?')) {
          await deleteMateriAi(id);
          loadHistory(root, userId);
        }
      }
    });
  }

  setView('split');
  setResultAvailable(false);
  updateContinueButton();
}

function loadRecordIntoForm(root, form, editor, preview, statusEl, record) {
  ['mapel', 'kelas', 'fase', 'semester', 'bab', 'topik', 'alokasiWaktu', 'lainLain'].forEach((field) => {
    const el = form.elements[field];
    if (el && record[field] != null) el.value = record[field];
  });
  if (form.elements['kedalaman'] && record.kedalaman) form.elements['kedalaman'].value = record.kedalaman;
  if (record.jumlahContoh != null && form.elements['jumlahContoh']) form.elements['jumlahContoh'].value = record.jumlahContoh;
  if (record.jumlahLatihan != null && form.elements['jumlahLatihan']) form.elements['jumlahLatihan'].value = record.jumlahLatihan;
  if (Array.isArray(record.tampilan)) {
    form.querySelectorAll('input[name="tampilan"]').forEach((cb) => {
      cb.checked = record.tampilan.includes(cb.value);
    });
  }
  editor.value = record.markdown || '';
  preview.innerHTML = renderMarkdown(record.markdown || '');
  statusEl.textContent = 'Dimuat dari riwayat.';
  root.querySelectorAll('#save-btn,#publish-btn,#word-btn,#pdf-btn,#copy-btn').forEach((b) => (b.disabled = false));
}

async function loadHistory(root, userId) {
  const list = root.querySelector('#history-list');
  if (!list) return;
  if (!userId) {
    list.innerHTML = '<p class="text-xs text-slate-400">Riwayat tersimpan per guru yang login.</p>';
    return;
  }
  try {
    const items = await listMateriAiForUser(userId);
    if (!items.length) {
      list.innerHTML = '<p class="text-xs text-slate-400">Belum ada riwayat generate.</p>';
      return;
    }
    list.innerHTML = items
      .map((item) => {
        const date = new Date(item.updated_at || item.created_at || Date.now()).toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        const badge = item.published
          ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Published</span>'
          : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Draft</span>';
        return `
          <div class="card-hover-premium group flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5" data-history-id="${item.id}">
            <div class="min-w-0 cursor-pointer" data-load-id="${item.id}">
              <p class="truncate text-sm font-medium text-slate-800">${escapeHtml(item.title || 'Materi')}</p>
              <p class="truncate text-xs text-slate-400">${escapeHtml([item.mapel, item.kelas, item.topik].filter(Boolean).join(' • '))} • ${date}</p>
            </div>
            <div class="flex items-center gap-1.5">
              ${badge}
              <button type="button" data-load-id="${item.id}" class="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50" title="Muat"><i class="fas fa-folder-open"></i></button>
              <button type="button" data-delete-id="${item.id}" class="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title="Hapus"><i class="fas fa-trash"></i></button>
            </div>
          </div>`;
      })
      .join('');
  } catch (err) {
    list.innerHTML = '<p class="text-xs text-rose-500">Gagal memuat riwayat.</p>';
  }
}
