import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  saveRpmDraft,
  getRpmDrafts,
  getRpmDraftById,
  getTeachingAssignmentsForUser,
} from '../../firebase/data-service.js';
import { streamGenerateMaterial, getApiBase, MaterialGenerationError } from '../../utils/ai-client.js';
import { renderMarkdown, ensureKaTeXReady, exportToPdf, exportToWord } from '../../utils/markdown-export.js';

const JENJANG_OPTS = ['SMA', 'SMK', 'MA'];
const SEMESTER_OPTS = ['Ganjil', 'Genap'];
const FASE_OPTS = ['E', 'F', 'G', 'H'];
const ALOKASI_OPTS = [
  '1 JP × 45 Menit',
  '2 JP × 45 Menit',
  '3 JP × 45 Menit',
  '4 JP × 45 Menit',
  '5 JP × 45 Menit',
  '6 JP × 45 Menit',
];
const MODEL_OPTS = [
  'Problem Based Learning (PBL)',
  'Project Based Learning (PjBL)',
  'Discovery Learning',
  'Inquiry Learning',
  'Cooperative Learning',
  'Direct Instruction',
  'Expositive',
  'Inkuiri Terbimbing',
];
const METODE_OPTS = [
  'Diskusi',
  'Tanya Jawab',
  'Presentasi',
  'Demonstrasi',
  'Penugasan',
  'Praktik',
  'Observasi',
  'Eksperimen',
  'Simulasi',
  'Role Play',
  'Studi Kasus',
  'Brainstorming',
];
const MEDIA_OPTS = [
  'PowerPoint',
  'LKPD',
  'GeoGebra',
  'Canva',
  'Video',
  'Internet',
  'LCD',
  'Papan Tulis',
  'Modul',
  'Buku Teks',
  'Alat Percobaan',
];
const DIMENSI = [
  'Keimanan dan Ketakwaan kepada Tuhan Yang Maha Esa',
  'Kewargaan',
  'Penalaran Kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
];

const RPM_SECTIONS = [
  { key: 'identitas', title: 'Identitas RPM' },
  { key: 'identifikasi', title: 'Identifikasi Murid' },
  { key: 'analisis', title: 'Analisis Materi' },
  { key: 'desain', title: 'Desain Pembelajaran' },
  { key: 'pengalaman', title: 'Pengalaman Belajar' },
  { key: 'asesmen', title: 'Asesmen Pembelajaran' },
  { key: 'rubrik', title: 'Rubrik Penilaian' },
  { key: 'lkm', title: 'Lembar Kerja Murid (LKM)' },
  { key: 'pengesahan', title: 'Pengesahan' },
];

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function formatDateForInput(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

const CARD = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
const LABEL = 'block text-sm font-medium text-slate-700 mb-1';
const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const GRID2 = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

export async function renderGuruRpmAiPage(container) {
  const session = getSession();
  if (!session?.user) {
    window.location.hash = '#login';
    return;
  }
  const myUid = session.user.username || session.user.id || '';
  const myNama = session.user.nama || '';

  let formData = {
    namaSekolah: 'SMA Negeri 1 Wanasari',
    jenjang: 'SMA',
    kelas: '',
    semester: '',
    fase: '',
    mapel: '',
    topik: '',
    capaian: '',
    tahunPelajaran: '',
    totalWaktu: '',
    alokasiWaktu: '',
    modelPembelajaran: '',
    metode: [],
    media: [],
    sumberBelajar: '',
    dimensi: [],
    kabupaten: '',
    tanggalPengesahan: formatDateForInput(new Date()),
    namaGuru: myNama,
    nipGuru: '',
    namaKepala: '',
    nipKepala: '',
    karakteristik: '',
    instruksiTambahan: '',
  };

  let previewMarkdown = '';
  let sections = [];
  let aiProfiles = [];
  let selectedAiProfileId = localStorage.getItem('rpm_ai_profile_id') || '';
  let selectedAiModel = localStorage.getItem('rpm_ai_model_override') || '';
  let lastGenerationMeta = null;
  let draftId = null;
  let version = 0;
  let isGenerating = false;
  let isGeneratingSection = false;
  let generatingSectionKey = null;
  let abortController = null;
  let unsubscribeDraft = null;

  await loadAiProfiles();

  // ---------- Form rendering (LEFT column) ----------
  function renderForm() {
    return `
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div class="min-w-0">
            <p class="text-xs text-slate-500">Cek koneksi sebelum Generate</p>
            <span id="testApiStatus" class="text-xs font-medium text-slate-400">Belum diuji</span>
          </div>
          <button id="testApiBtn" class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            Tes Koneksi API
          </button>
        </div>
        ${cardAiModel()}
        ${cardBasic()}
        ${cardPembelajaran()}
        ${cardDimensi()}
        ${cardGuru()}
        ${cardInstruksi()}
        <button id="generateBtn" class="sticky bottom-0 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-700 disabled:opacity-60">
          <span class="inline-flex items-center gap-2 justify-center">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.7L12 3z"/><path d="M18.5 15l.9 2.3 2.4.9-2.4.9-.9 2.3-.9-2.3-2.4-.9 2.4-.9.9-2.3z"/></svg>
            Generate RPM dengan AI
          </span>
        </button>
      </div>
    `;
  }

  function cardAiModel() {
    const profileOptions = aiProfiles.length
      ? aiProfiles.map(profile => `<option value="${profile.id}" ${selectedAiProfileId === profile.id ? 'selected' : ''}>${profile.label}</option>`).join('')
      : '<option value="">Memuat profil AI...</option>';
    const currentProfile = getSelectedAiProfile();
    const availableModels = getAvailableModelsForProfile(currentProfile);
    const modelOptions = [
      `<option value="" ${!selectedAiModel ? 'selected' : ''}>Gunakan default profil (${escapeHtml(currentProfile?.model || 'memuat...')})</option>`,
      ...availableModels.map(model => `<option value="${escapeHtml(model)}" ${selectedAiModel === model ? 'selected' : ''}>${escapeHtml(model)}</option>`),
    ].join('');

    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-600">0 · Model AI</h3>
        <div class="space-y-3">
          <div>
            <label class="${LABEL}">Profil AI</label>
            <select id="aiProfile" class="${INPUT}">
              ${profileOptions}
            </select>
            <p class="mt-1 text-xs text-slate-500">Gunakan satu profil provider, lalu kelola beberapa model dari provider tersebut.</p>
          </div>
          <div>
            <label class="${LABEL}">Model Groq</label>
            <select id="aiModel" class="${INPUT}">
              ${modelOptions}
            </select>
            <p class="mt-1 text-xs text-slate-500">Daftar model diambil dari konfigurasi backend. Pilih kosong untuk memakai model default profil.</p>
          </div>
        </div>
      </div>
    `;
  }

  function getSelectedAiProfile() {
    return aiProfiles.find(profile => profile.id === selectedAiProfileId) || aiProfiles[0] || null;
  }

  function getAvailableModelsForProfile(profile) {
    if (!profile) return [];
    const candidates = Array.isArray(profile.models) && profile.models.length ? profile.models : [profile.model];
    return Array.from(new Set(candidates.map(model => String(model || '').trim()).filter(Boolean)));
  }

  function syncSelectedAiModel() {
    const profile = getSelectedAiProfile();
    const availableModels = getAvailableModelsForProfile(profile);
    if (selectedAiModel && !availableModels.includes(selectedAiModel)) {
      selectedAiModel = '';
    }
  }

  function refreshAiModelSelect() {
    const select = document.getElementById('aiModel');
    if (!select) return;
    const profile = getSelectedAiProfile();
    const availableModels = getAvailableModelsForProfile(profile);
    select.innerHTML = [
      `<option value="" ${!selectedAiModel ? 'selected' : ''}>Gunakan default profil (${escapeHtml(profile?.model || 'memuat...')})</option>`,
      ...availableModels.map(model => `<option value="${escapeHtml(model)}" ${selectedAiModel === model ? 'selected' : ''}>${escapeHtml(model)}</option>`),
    ].join('');
  }

  function cardBasic() {
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-600">1 · Informasi Dasar</h3>
        <div class="space-y-3">
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Nama Sekolah <span class="text-rose-500">*</span></label>
              <input type="text" id="namaSekolah" class="${INPUT}" value="${formData.namaSekolah}" />
            </div>
            <div>
              <label class="${LABEL}">Jenjang</label>
              <select id="jenjang" class="${INPUT}">
                ${JENJANG_OPTS.map(j => `<option value="${j}" ${formData.jenjang === j ? 'selected' : ''}>${j}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Kelas <span class="text-rose-500">*</span></label>
              <select id="kelas" class="${INPUT}">
                <option value="">-- Pilih Kelas --</option>
                ${['X', 'XI', 'XII'].map(k => `<option value="${k}" ${formData.kelas === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="${LABEL}">Semester <span class="text-rose-500">*</span></label>
              <select id="semester" class="${INPUT}">
                <option value="">-- Pilih Semester --</option>
                ${SEMESTER_OPTS.map(s => `<option value="${s}" ${formData.semester === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Fase <span class="text-rose-500">*</span></label>
              <select id="fase" class="${INPUT}">
                <option value="">-- Pilih Fase --</option>
                ${FASE_OPTS.map(f => `<option value="${f}" ${formData.fase === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="${LABEL}">Mata Pelajaran <span class="text-rose-500">*</span></label>
              <input type="text" id="mapel" class="${INPUT}" value="${formData.mapel}" placeholder="Contoh: Matematika Tingkat Lanjut" />
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Topik Pembelajaran <span class="text-rose-500">*</span></label>
              <input type="text" id="topik" class="${INPUT}" value="${formData.topik}" placeholder="Contoh: Polinomial" />
            </div>
            <div>
              <label class="${LABEL}">Tahun Pelajaran</label>
              <input type="text" id="tahunPelajaran" class="${INPUT}" value="${formData.tahunPelajaran}" placeholder="Contoh: 2026/2027" />
            </div>
          </div>
          <div>
            <label class="${LABEL}">Capaian Pembelajaran <span class="text-rose-500">*</span></label>
            <textarea id="capaian" class="${INPUT}" rows="3">${formData.capaian}</textarea>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Total Waktu (JP)</label>
              <input type="number" id="totalWaktu" class="${INPUT}" value="${formData.totalWaktu}" min="1" />
            </div>
            <div>
              <label class="${LABEL}">Alokasi Waktu</label>
              <select id="alokasiWaktu" class="${INPUT}">
                <option value="">-- Pilih Alokasi --</option>
                ${ALOKASI_OPTS.map(a => `<option value="${a}" ${formData.alokasiWaktu === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
              <p class="mt-1 text-xs text-slate-500" id="estimasiPertemuan"></p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function cardPembelajaran() {
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-600">2 · Pembelajaran</h3>
        <div class="space-y-3">
          <div>
            <label class="${LABEL}">Model Pembelajaran <span class="text-rose-500">*</span></label>
            <select id="modelPembelajaran" class="${INPUT}">
              <option value="">-- Pilih Model --</option>
              ${MODEL_OPTS.map(m => `<option value="${m}" ${formData.modelPembelajaran === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="${LABEL}">Metode Pembelajaran <span class="text-xs font-normal text-slate-400">(boleh kosong, AI memilih)</span></label>
            <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              ${METODE_OPTS.map(m => `
                <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" value="${m}" class="metode-checkbox h-4 w-4 rounded text-indigo-600" ${formData.metode.includes(m) ? 'checked' : ''} />
                  <span>${m}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div>
            <label class="${LABEL}">Media Pembelajaran <span class="text-xs font-normal text-slate-400">(boleh kosong, AI menentukan)</span></label>
            <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              ${MEDIA_OPTS.map(m => `
                <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" value="${m}" class="media-checkbox h-4 w-4 rounded text-indigo-600" ${formData.media.includes(m) ? 'checked' : ''} />
                  <span>${m}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div>
            <label class="${LABEL}">Sumber Belajar</label>
            <textarea id="sumberBelajar" class="${INPUT}" rows="2">${formData.sumberBelajar}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function cardDimensi() {
    return `
      <div class="${CARD}">
        <h3 class="mb-1 text-sm font-semibold uppercase tracking-wide text-indigo-600">3 · Dimensi Profil Lulusan</h3>
        <p class="mb-3 text-xs text-slate-500">Pilih minimal 2 dimensi yang menjadi fokus RPM ini.</p>
        <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          ${DIMENSI.map(d => `
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" value="${d}" class="dimensi-checkbox h-4 w-4 rounded text-indigo-600" ${formData.dimensi.includes(d) ? 'checked' : ''} />
              <span>${d}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  function cardGuru() {
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-600">4 · Identitas Guru</h3>
        <div class="space-y-3">
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Kabupaten / Kota <span class="text-rose-500">*</span></label>
              <input type="text" id="kabupaten" class="${INPUT}" value="${formData.kabupaten}" />
            </div>
            <div>
              <label class="${LABEL}">Tanggal Pengesahan <span class="text-rose-500">*</span></label>
              <input type="date" id="tanggalPengesahan" class="${INPUT}" value="${formData.tanggalPengesahan}" />
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Nama Guru <span class="text-rose-500">*</span></label>
              <input type="text" id="namaGuru" class="${INPUT}" value="${formData.namaGuru}" />
            </div>
            <div>
              <label class="${LABEL}">NIP Guru</label>
              <input type="text" id="nipGuru" class="${INPUT}" value="${formData.nipGuru}" />
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Nama Kepala Sekolah <span class="text-rose-500">*</span></label>
              <input type="text" id="namaKepala" class="${INPUT}" value="${formData.namaKepala}" />
            </div>
            <div>
              <label class="${LABEL}">NIP Kepala Sekolah</label>
              <input type="text" id="nipKepala" class="${INPUT}" value="${formData.nipKepala}" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function cardInstruksi() {
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-600">5 · Instruksi Tambahan</h3>
        <div class="space-y-3">
          <div>
            <label class="${LABEL}">Karakteristik Murid</label>
            <textarea id="karakteristik" class="${INPUT}" rows="3" placeholder="Contoh: Peserta didik aktif berdiskusi namun masih kurang teliti dalam operasi aljabar.">${formData.karakteristik}</textarea>
          </div>
          <div>
            <label class="${LABEL}">Instruksi Tambahan AI</label>
            <textarea id="instruksiTambahan" class="${INPUT}" rows="3" placeholder="Contoh: Gunakan konteks kehidupan sehari-hari. Tambahkan soal HOTS. Gunakan GeoGebra.">${formData.instruksiTambahan}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderResultPlaceholder() {
    return `
      <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-slate-400">
        <svg viewBox="0 0 24 24" class="h-14 w-14 text-indigo-300" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/><path d="M17.5 4l.7 1.9L20 6.5l-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9z"/></svg>
        <p class="mt-3 font-medium text-slate-500">Hasil RPM akan muncul di sini</p>
        <p class="text-sm">Isi form di kiri, lalu tekan <b>Generate RPM</b>.</p>
      </div>
    `;
  }

  function renderStreaming(md) {
    return `
      <div class="mb-3 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Hasil RPM (AI)</h2>
          ${renderModelUsageMeta(true)}
        </div>
        <span class="inline-flex items-center gap-2 text-sm font-medium text-indigo-600">
          <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-500"></span> Menghasilkan…
        </span>
      </div>
      <div class="rpm-prose max-w-none text-sm leading-relaxed text-slate-700">${renderMarkdown(md)}</div>
    `;
  }

  function renderModelUsageMeta(isGenerating = false) {
    if (!lastGenerationMeta && !isGenerating) return '';
    const activeProfile = getSelectedAiProfile();
    const requestedModel = selectedAiModel || activeProfile?.model || '-';
    const actualModel = lastGenerationMeta?.model || requestedModel;
    const notes = [];
    if (lastGenerationMeta?.profileId) notes.push(`Profil: ${lastGenerationMeta.profileId}`);
    notes.push(`Model: ${actualModel}`);
    if (lastGenerationMeta?.modelFallbackUsed) notes.push(`fallback model aktif`);
    if (lastGenerationMeta?.fallbackUsed) notes.push(`fallback profil aktif`);
    if (lastGenerationMeta?.requestedModel && lastGenerationMeta.requestedModel !== actualModel) {
      notes.push(`permintaan awal: ${lastGenerationMeta.requestedModel}`);
    }
    if (isGenerating && !lastGenerationMeta) {
      notes.length = 0;
      notes.push(`Model diminta: ${requestedModel}`);
    }
    return `<p class="mt-1 text-xs text-slate-500">${escapeHtml(notes.join(' • '))}</p>`;
  }

  // ---------- Right column: preview ----------
  function renderPreview() {
    if (!previewMarkdown) return renderResultPlaceholder();
    sections = parseSections(previewMarkdown);
    return `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-lg font-bold text-slate-800">Hasil RPM</h2>
            ${renderModelUsageMeta()}
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="saveDraftBtn" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Simpan Draft</button>
            <button id="exportDocxBtn" class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Export Word (.doc)</button>
            <button id="exportPdfBtn" class="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">Export PDF</button>
          </div>
        </div>
        <div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between gap-2 bg-indigo-50 px-3 py-2">
            <h3 class="text-sm font-semibold text-indigo-900">Preview Dokumen Penuh</h3>
            <span class="text-xs text-indigo-700">Tinjau hasil AI terlebih dahulu sebelum ekspor</span>
          </div>
          <div class="p-4">${buildRpmDocumentHtml()}</div>
        </div>
        <div id="sections-container" class="space-y-3">
          ${sections.map((sec, idx) => renderSectionCard(sec, idx)).join('')}
        </div>
      </div>
    `;
  }

  function renderSectionCard(sec, idx) {
    const isEditing = editingSectionIdx === idx;
    const expanded = isExpandedSection === idx;
    return `
      <div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
          <h3 class="text-sm font-semibold text-slate-800">${String(idx + 1).padStart(2, '0')}. ${sec.title}</h3>
          <div class="flex items-center gap-1">
            <button class="edit-btn rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200" data-idx="${idx}">Edit</button>
            <button class="regenerate-btn rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200" data-idx="${idx}" ${isGeneratingSection && generatingSectionKey === sec.key ? 'disabled' : ''}>Regenerate</button>
            <button class="copy-btn rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200" data-idx="${idx}">Copy</button>
            <button class="expand-btn rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200" data-idx="${idx}">${expanded ? 'Ciutkan' : 'Perbesar'}</button>
          </div>
        </div>
        <div class="p-3 ${expanded ? '' : 'max-h-72 overflow-y-auto'}">
          ${isEditing ? renderSectionEditForm(sec, idx) : `<div class="rpm-prose max-w-none text-sm leading-relaxed text-slate-700">${renderMarkdown(sec.content)}</div>`}
        </div>
      </div>
    `;
  }

  function renderSectionEditForm(sec, idx) {
    return `
      <div class="space-y-2">
        <textarea id="section-edit-${idx}" class="h-48 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">${sec.content}</textarea>
        <div class="flex justify-end gap-2">
          <button id="section-save-${idx}" class="section-save rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Simpan</button>
          <button id="section-cancel-${idx}" class="section-cancel rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300">Batal</button>
        </div>
        <div id="section-status-${idx}" class="text-sm text-slate-600"></div>
      </div>
    `;
  }

  // ---------- State ----------
  let editingSectionIdx = null;
  let isExpandedSection = null;

  function updateFormData() {
    formData.namaSekolah = document.getElementById('namaSekolah')?.value || '';
    formData.jenjang = document.getElementById('jenjang')?.value || '';
    formData.kelas = document.getElementById('kelas')?.value || '';
    formData.semester = document.getElementById('semester')?.value || '';
    formData.fase = document.getElementById('fase')?.value || '';
    formData.mapel = document.getElementById('mapel')?.value || '';
    formData.topik = document.getElementById('topik')?.value || '';
    formData.capaian = document.getElementById('capaian')?.value || '';
    formData.tahunPelajaran = document.getElementById('tahunPelajaran')?.value || '';
    formData.totalWaktu = document.getElementById('totalWaktu')?.value || '';
    formData.alokasiWaktu = document.getElementById('alokasiWaktu')?.value || '';
    formData.modelPembelajaran = document.getElementById('modelPembelajaran')?.value || '';
    formData.metode = Array.from(document.querySelectorAll('.metode-checkbox:checked')).map(el => el.value);
    formData.media = Array.from(document.querySelectorAll('.media-checkbox:checked')).map(el => el.value);
    formData.sumberBelajar = document.getElementById('sumberBelajar')?.value || '';
    formData.dimensi = Array.from(document.querySelectorAll('.dimensi-checkbox:checked')).map(el => el.value);
    formData.kabupaten = document.getElementById('kabupaten')?.value || '';
    formData.tanggalPengesahan = document.getElementById('tanggalPengesahan')?.value || '';
    formData.namaGuru = document.getElementById('namaGuru')?.value || '';
    formData.nipGuru = document.getElementById('nipGuru')?.value || '';
    formData.namaKepala = document.getElementById('namaKepala')?.value || '';
    formData.nipKepala = document.getElementById('nipKepala')?.value || '';
    formData.karakteristik = document.getElementById('karakteristik')?.value || '';
    formData.instruksiTambahan = document.getElementById('instruksiTambahan')?.value || '';
    selectedAiProfileId = document.getElementById('aiProfile')?.value || selectedAiProfileId || '';
    selectedAiModel = (document.getElementById('aiModel')?.value || '').trim();
    localStorage.setItem('rpm_ai_profile_id', selectedAiProfileId);
    if (selectedAiModel) localStorage.setItem('rpm_ai_model_override', selectedAiModel);
    else localStorage.removeItem('rpm_ai_model_override');
  }

  async function loadAiProfiles() {
    try {
      const res = await fetch(`${getApiBase()}/api/ai/model-options`, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      aiProfiles = Array.isArray(data?.profiles) ? data.profiles : [];
      if (!selectedAiProfileId) {
        selectedAiProfileId = data?.defaultProfileId || aiProfiles[0]?.id || '';
      }
      if (aiProfiles.length && !aiProfiles.some(profile => profile.id === selectedAiProfileId)) {
        selectedAiProfileId = data?.defaultProfileId || aiProfiles[0]?.id || '';
      }
      syncSelectedAiModel();
    } catch (err) {
      aiProfiles = [];
      selectedAiModel = '';
    }
  }

  function buildAiRequestOptions() {
    const options = {
      profileId: selectedAiProfileId || undefined,
      model: selectedAiModel || undefined,
    };
    return Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value === 'string' && value.trim()));
  }

  function updateEstimasi() {
    const el = document.getElementById('estimasiPertemuan');
    if (!el) return;
    const jp = parseInt(formData.alokasiWaktu, 10);
    el.textContent = jp ? `Estimasi: ${jp} Pertemuan` : '';
  }

  function resetApiTestStatus(message = 'Belum diuji') {
    const status = document.getElementById('testApiStatus');
    if (!status) return;
    status.textContent = message;
    status.className = 'text-xs font-medium text-slate-400';
  }

  function buildPengalamanBelajarInstruction() {
    const totalJp = Number.parseInt(String(formData.totalWaktu || '').trim(), 10);
    const totalMinutes = Number.isFinite(totalJp) && totalJp > 0 ? totalJp * 45 : null;
    if (!totalMinutes) {
      return 'Pada bagian Pengalaman Belajar, wajib gunakan tabel markdown langkah pembelajaran dengan kolom Tahap, Alokasi Waktu, Langkah-Langkah Pembelajaran, dan Keterangan Pedagogis/Asesmen.';
    }

    const pendahuluan = Math.max(10, Math.round((totalMinutes * 0.15) / 5) * 5);
    const penutup = Math.max(10, Math.round((totalMinutes * 0.1) / 5) * 5);
    const inti = Math.max(15, totalMinutes - pendahuluan - penutup);

    return [
      'Pada bagian Pengalaman Belajar, wajib gunakan tabel markdown langkah pembelajaran dengan kolom Tahap, Alokasi Waktu, Langkah-Langkah Pembelajaran, dan Keterangan Pedagogis/Asesmen.',
      `Total waktu harus terbagi habis menjadi ${totalJp} JP = ${totalMinutes} menit.`,
      `Gunakan pembagian realistis: pendahuluan sekitar ${pendahuluan} menit, kegiatan inti sekitar ${inti} menit, dan penutup sekitar ${penutup} menit.`,
      'Jika total JP lebih dari 2, pecah kegiatan inti menjadi beberapa langkah atau sesi yang berurutan.',
    ].join(' ');
  }

  function buildRpmInputPayload() {
    const pengalamanInstruction = buildPengalamanBelajarInstruction();
    const instruksiTambahan = [formData.instruksiTambahan, pengalamanInstruction]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n\n');

    return {
      ...formData,
      instruksiTambahan,
    };
  }

  async function testApiConnection() {
    updateFormData();
    const btn = document.getElementById('testApiBtn');
    const status = document.getElementById('testApiStatus');
    if (btn) { btn.disabled = true; btn.textContent = 'Menguji…'; }
    if (status) { status.textContent = 'Memeriksa koneksi…'; status.className = 'text-xs font-medium text-slate-500'; }
    try {
      const params = new URLSearchParams(buildAiRequestOptions());
      const res = await fetch(`${getApiBase()}/api/ai/test-connection${params.toString() ? `?${params.toString()}` : ''}`);
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.ok === true;
      if (status) {
        status.textContent = ok
          ? `Terhubung ✓ (${data?.model || 'AI'})`
          : `Gagal: ${data?.error || ('HTTP ' + res.status)}`;
        status.className = ok ? 'text-xs font-medium text-emerald-600' : 'text-xs font-medium text-rose-600';
      }
    } catch (err) {
      if (status) {
        status.textContent = 'Tidak dapat menghubungi server AI.';
        status.className = 'text-xs font-medium text-rose-600';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Tes Koneksi API'; }
    }
  }

  async function generateRpm() {
    if (isGenerating) return;
    updateFormData();
    if (!formData.mapel && !formData.topik) {
      alert('Mata Pelajaran atau Topik harus diisi.');
      return;
    }
    if (!formData.kelas) { alert('Kelas harus dipilih.'); return; }
    if (!formData.semester) { alert('Semester harus dipilih.'); return; }
    if (!formData.fase) { alert('Fase harus dipilih.'); return; }
    if (!formData.modelPembelajaran) { alert('Model Pembelajaran harus dipilih.'); return; }
    if (formData.dimensi.length < 2) { alert('Pilih minimal 2 Dimensi Profil Lulusan.'); return; }

    isGenerating = true;
    lastGenerationMeta = null;
    const genBtn = document.getElementById('generateBtn');
    if (genBtn) genBtn.disabled = true;
    resultEl.innerHTML = `
      <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-slate-500">
        <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <p>Sedang menghasilkan RPM…</p>
      </div>`;
    try {
      const response = await fetch(`${getApiBase()}/api/ai/generate-rpm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          input: buildRpmInputPayload(),
          stream: true,
          temperature: 0.85,
          maxTokens: 7000,
          ...buildAiRequestOptions(),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        let sseEvent = 'message';
        for (const line of lines) {
          if (line.startsWith(':')) continue;
          if (line === '') { sseEvent = 'message'; continue; }
          if (line.startsWith('event:')) { sseEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if (sseEvent === 'delta') {
              accumulated += typeof parsed.content === 'string' ? parsed.content : '';
              previewMarkdown = accumulated;
              resultEl.innerHTML = renderStreaming(accumulated);
            } else if (sseEvent === 'done') {
              lastGenerationMeta = parsed;
              break;
            } else if (sseEvent === 'error') {
              throw new Error(parsed.error || 'Unknown error');
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
        if (done) break;
      }
      reader.releaseLock();
      previewMarkdown = accumulated;
      sections = parseSections(previewMarkdown);
      resultEl.innerHTML = renderPreview();
      bindPreviewEvents();
    } catch (err) {
      console.error('Generation error:', err);
      resultEl.innerHTML = `
        <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-rose-600">
          <p>Gagal menghasilkan RPM: ${err.message}</p>
          <button id="retry-btn" class="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Coba Lagi</button>
        </div>`;
      document.getElementById('retry-btn')?.addEventListener('click', generateRpm);
    } finally {
      isGenerating = false;
      const b = document.getElementById('generateBtn');
      if (b) b.disabled = false;
    }
  }

  function parseSections(markdown) {
    if (!markdown) return [];
    const text = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const h2Regex = /^##\s+(.+)$/gm;
    const matches = [...text.matchAll(h2Regex)];
    if (matches.length === 0) return [{ title: 'RPM', content: markdown }];
    const found = [];
    for (const match of matches) {
      const title = match[1].trim();
      const start = match.index;
      const end = match.index + match[0].length;
      const nextMatch = matches.find(m => m.index > end);
      const contentEnd = nextMatch ? nextMatch.index : text.length;
      found.push({ title, content: text.slice(end, contentEnd).trim() });
    }
    if (matches[0].index > 0) {
      const preamble = text.slice(0, matches[0].index).trim();
      if (preamble) found[0].content = preamble + '\n\n' + found[0].content;
    }
    return RPM_SECTIONS.map(sect => {
      const f = found.find(s =>
        s.title.toLowerCase().includes(sect.title.toLowerCase()) ||
        sect.title.toLowerCase().includes(s.title.toLowerCase()));
      return { ...sect, content: f ? f.content : '' };
    });
  }

  function bindPreviewEvents() {
    document.getElementById('saveDraftBtn')?.addEventListener('click', saveDraft);
    document.getElementById('exportDocxBtn')?.addEventListener('click', exportDocx);
    document.getElementById('exportPdfBtn')?.addEventListener('click', exportPdf);
    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => setEditingIdx(Number(btn.dataset.idx))));
    document.querySelectorAll('.regenerate-btn').forEach(btn => btn.addEventListener('click', () => regenerateSection(Number(btn.dataset.idx))));
    document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', () => copySection(Number(btn.dataset.idx))));
    document.querySelectorAll('.expand-btn').forEach(btn => btn.addEventListener('click', () => toggleExpand(Number(btn.dataset.idx))));
    document.querySelectorAll('.section-save').forEach(btn => btn.addEventListener('click', () => saveSectionEdit(Number(btn.id.split('-').pop()))));
    document.querySelectorAll('.section-cancel').forEach(btn => btn.addEventListener('click', () => cancelSectionEdit(Number(btn.id.split('-').pop()))));
  }

  function setEditingIdx(idx) { editingSectionIdx = idx; resultEl.innerHTML = renderPreview(); bindPreviewEvents(); }
  function cancelSectionEdit(idx) { editingSectionIdx = null; resultEl.innerHTML = renderPreview(); bindPreviewEvents(); }

  async function saveSectionEdit(idx) {
    const textarea = document.getElementById(`section-edit-${idx}`);
    if (!textarea) return;
    sections[idx].content = textarea.value.trim();
    previewMarkdown = sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
    editingSectionIdx = null;
    resultEl.innerHTML = renderPreview();
    bindPreviewEvents();
  }

  async function regenerateSection(idx) {
    if (isGeneratingSection) return;
    const sec = sections[idx];
    if (!sec) return;
    isGeneratingSection = true;
    lastGenerationMeta = null;
    generatingSectionKey = sec.key;
    const statusEl = document.getElementById(`section-status-${idx}`);
    if (statusEl) { statusEl.textContent = 'Sedang meregenerate…'; statusEl.className = 'text-sm text-indigo-600'; }
    try {
      updateFormData();
      const context = sections.filter((s, i) => i !== idx).map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
      const response = await fetch(`${getApiBase()}/api/ai/generate-rpm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          input: buildRpmInputPayload(),
          stream: true,
          sectionTitle: sec.title,
          context,
          currentSection: sec.content,
          temperature: 0.85,
          maxTokens: 2800,
          ...buildAiRequestOptions(),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        let sseEvent = 'message';
        for (const line of lines) {
          if (line.startsWith(':')) continue;
          if (line === '') { sseEvent = 'message'; continue; }
          if (line.startsWith('event:')) { sseEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if (sseEvent === 'delta') {
              accumulated += typeof parsed.content === 'string' ? parsed.content : '';
              sections[idx].content = accumulated;
              resultEl.innerHTML = renderPreview();
              bindPreviewEvents();
            } else if (sseEvent === 'done') {
              lastGenerationMeta = parsed;
              break;
            } else if (sseEvent === 'error') {
              throw new Error(parsed.error || 'Unknown error');
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
        if (done) break;
      }
      reader.releaseLock();
      sections[idx].content = accumulated;
      previewMarkdown = sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
      resultEl.innerHTML = renderPreview();
      bindPreviewEvents();
    } catch (err) {
      console.error('Regenerate error:', err);
      if (statusEl) { statusEl.textContent = `Gagal: ${err.message}`; statusEl.className = 'text-sm text-rose-600'; }
    } finally {
      isGeneratingSection = false;
      generatingSectionKey = null;
    }
  }

  function copySection(idx) {
    const sec = sections[idx];
    if (!sec) return;
    navigator.clipboard.writeText(sec.content).then(() => {
      const btn = document.querySelector(`.copy-btn[data-idx="${idx}"]`);
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = 'Disalin!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(err => console.error('Copy failed:', err));
  }

  function toggleExpand(idx) {
    isExpandedSection = isExpandedSection === idx ? null : idx;
    resultEl.innerHTML = renderPreview();
    bindPreviewEvents();
  }

  async function saveDraft() {
    updateFormData();
    if (!previewMarkdown) { alert('Tidak ada draft untuk disimpan. Buat RPM terlebih dahulu.'); return; }
    try {
      const result = await saveRpmDraft(
        myUid,
        (formData.mapel || `RPM ${formData.kelas || ''}`).trim() || 'RPM',
        sections,
        formData,
        (version || 0) + 1
      );
      if (result && result.id) { draftId = result.id; version = result.version || version + 1; }
      alert('Draft berhasil disimpan.' + (version ? ` (Versi ${version})` : ''));
    } catch (err) {
      console.error('Save draft error:', err);
      alert('Gagal menyimpan draft: ' + err.message);
    }
  }

  async function exportDocx() {
    if (!previewMarkdown) { alert('Tidak ada data untuk diekspor. Buat RPM terlebih dahulu.'); return; }
    updateFormData();
    try {
      exportToWord(
        `${formData.mapel || 'RPM'} ${formData.kelas || ''} ${formData.semester || ''}`.trim(),
        buildRpmDocumentHtml(),
        { styles: getRpmWordStyles() }
      );
    } catch (err) {
      console.error('Export Word error:', err);
      alert('Gagal mengekspor dokumen Word: ' + err.message);
    }
  }

  function getRpmWordStyles() {
    return `
      body {
        font-family: "Times New Roman", serif;
        font-size: 12pt;
        line-height: 1.3;
        color: #000;
        width: 100%;
        max-width: none;
        margin: 0;
        padding: 18pt 24pt;
      }
      .rpm-word-doc {
        font-family: "Times New Roman", serif;
        color: #000;
      }
      .rpm-word-doc p {
        margin: 0 0 9pt;
      }
      .rpm-word-doc .rpm-title,
      .rpm-word-doc .rpm-section-title {
        font-weight: 700;
      }
      .rpm-word-doc .rpm-title {
        margin: 0 0 12pt;
      }
      .rpm-word-doc .rpm-section-title {
        margin: 12pt 0 6pt;
      }
      .rpm-word-doc table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 12pt;
      }
      .rpm-word-doc th,
      .rpm-word-doc td {
        border: 1px solid #000;
        padding: 4.5pt;
        vertical-align: top;
        text-align: left;
      }
      .rpm-word-doc thead th {
        background: #FAE2D5;
        text-align: center;
      }
      .rpm-word-doc .rpm-meta-table td:nth-child(1) {
        width: 25%;
      }
      .rpm-word-doc .rpm-meta-table td:nth-child(2) {
        width: 2%;
        text-align: center;
      }
      .rpm-word-doc .rpm-signature-table td,
      .rpm-word-doc .rpm-signature-table th {
        border: none;
        padding: 4.5pt;
      }
      .rpm-word-doc .rpm-sign-space {
        height: 60pt;
      }
      .rpm-word-doc ul,
      .rpm-word-doc ol {
        margin: 0 0 9pt 22pt;
        padding-left: 0;
      }
      .rpm-word-doc li {
        margin-bottom: 4pt;
      }
      .rpm-word-doc h1,
      .rpm-word-doc h2,
      .rpm-word-doc h3,
      .rpm-word-doc h4 {
        font-family: "Times New Roman", serif;
        color: #000;
        margin: 0 0 6pt;
        font-size: 12pt;
      }
      .rpm-word-doc blockquote {
        margin: 0 0 9pt;
        padding: 0 0 0 9pt;
        border-left: 1pt solid #999;
        background: transparent;
      }
      .rpm-word-doc pre {
        white-space: pre-wrap;
        border: 1px solid #000;
        padding: 6pt;
        margin: 0 0 9pt;
      }
    `;
  }

  function buildRpmDocumentHtml() {
    const identityRows = [
      ['Satuan Pendidikan', formData.namaSekolah],
      ['Kelas / Fase', [formData.kelas, formData.fase].filter(Boolean).join(' / ')],
      ['Semester', formData.semester],
      ['Mata Pelajaran', formData.mapel],
      ['Topik Pembelajaran', formData.topik],
      ['Capaian Pembelajaran', formData.capaian],
      ['Tahun Pelajaran', formData.tahunPelajaran],
      ['Alokasi Waktu', [formData.totalWaktu ? `${formData.totalWaktu} JP` : '', formData.alokasiWaktu].filter(Boolean).join(' / ')],
      ['Model Pembelajaran', formData.modelPembelajaran],
      ['Metode Pembelajaran', (formData.metode || []).join(', ')],
      ['Media Pembelajaran', (formData.media || []).join(', ')],
      ['Sumber Belajar', formData.sumberBelajar],
      ['Dimensi Profil Lulusan', (formData.dimensi || []).join(', ')],
      ['Karakteristik Murid', formData.karakteristik],
      ['Instruksi Tambahan Guru', formData.instruksiTambahan],
      ['Nama Guru', formData.namaGuru],
      ['NIP Guru', formData.nipGuru],
      ['Nama Kepala Sekolah', formData.namaKepala],
      ['NIP Kepala Sekolah', formData.nipKepala],
      ['Kabupaten / Kota', formData.kabupaten],
      ['Tanggal Pengesahan', formatApprovalDate(formData.tanggalPengesahan)],
    ].filter(([, value]) => String(value || '').trim());

    const identityTable = identityRows.length ? `
      <div class="rpm-word-doc">
      <table class="rpm-meta-table">
        <tbody>
          ${identityRows.map(([label, value]) => `
            <tr>
              <td>${escapeHtml(label)}</td>
              <td>:</td>
              <td>${escapeHtml(String(value || '')).replace(/\n/g, '<br>')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
    ` : '';

    const contentSections = sections
      .filter((section) => String(section?.content || '').trim() && !/identitas rpm|pengesahan/i.test(section.title || ''))
      .map((section) => `
        <section>
          <p class="rpm-section-title">${escapeHtml(section.title)}</p>
          ${renderMarkdown(section.content)}
        </section>
      `)
      .join('');

    const signature = (formData.namaGuru || formData.namaKepala) ? `
      <section>
        <p class="rpm-section-title">Pengesahan</p>
        <table class="rpm-signature-table">
          <tbody>
            <tr>
              <td style="width:50%; vertical-align:top;">
                <p>Mengetahui,</p>
                <p>Kepala Sekolah</p>
                <div class="rpm-sign-space"></div>
                <p><strong><u>${escapeHtml(formData.namaKepala || '-')}</u></strong></p>
                ${formData.nipKepala ? `<p>NIP. ${escapeHtml(formData.nipKepala)}</p>` : ''}
              </td>
              <td style="width:50%; vertical-align:top;">
                <p>${escapeHtml(formatApprovalPlaceAndDate(formData.kabupaten, formData.tanggalPengesahan))}</p>
                <p>Guru Mata Pelajaran</p>
                <div class="rpm-sign-space"></div>
                <p><strong><u>${escapeHtml(formData.namaGuru || '-')}</u></strong></p>
                ${formData.nipGuru ? `<p>NIP. ${escapeHtml(formData.nipGuru)}</p>` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    ` : '';

    return `
      <style>${getRpmWordStyles()}</style>
      <div class="rpm-word-doc">
        <p class="rpm-title">RENCANA PEMBELAJARAN MENDALAM (RPM)</p>
        ${identityTable}
        ${contentSections}
        ${signature}
      </div>
    `;
  }

  function formatApprovalDate(isoDate) {
    if (!isoDate) return '';
    const [year, monthStr, dayStr] = String(isoDate).split('-');
    const monthIndex = Number(monthStr) - 1;
    const day = Number(dayStr);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    if (!year || Number.isNaN(day) || Number.isNaN(monthIndex)) return String(isoDate);
    return `${day} ${months[monthIndex] || ''} ${year}`.trim();
  }

  function formatApprovalPlaceAndDate(place, isoDate) {
    const dateText = formatApprovalDate(isoDate);
    if (place && dateText) return `${place}, ${dateText}`;
    return place || dateText || '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function exportPdf() {
    if (!previewMarkdown) { alert('Tidak ada data untuk diekspor. Buat RPM terlebih dahulu.'); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = buildRpmDocumentHtml();
    try {
      await exportToPdf('RPM Preview', tmp);
    } catch (err) {
      console.error('Export PDF error:', err);
      alert('Gagal mengekspor PDF: ' + err.message);
    }
  }

  // ---------- Initial render ----------
  const html = renderLayout('RPM AI', `
    <div id="rpm-app" class="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section class="order-1 w-full lg:w-[42%] xl:w-[38%]">
        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 lg:h-[calc(100vh-210px)] lg:overflow-y-auto lg:pr-2">
          ${renderForm()}
        </div>
      </section>
      <section class="order-2 w-full lg:w-[58%] xl:w-[62%]">
        <div id="rpm-result" class="rounded-2xl border border-slate-200 bg-white p-4 lg:h-[calc(100vh-210px)] lg:overflow-y-auto">
          ${renderResultPlaceholder()}
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;
  const appEl = container.querySelector('#rpm-app');
  const resultEl = appEl.querySelector('#rpm-result');

  // Bind alokasi -> estimasi
  document.getElementById('alokasiWaktu')?.addEventListener('change', (e) => {
    formData.alokasiWaktu = e.target.value;
    updateEstimasi();
  });
  updateEstimasi();

  document.getElementById('generateBtn')?.addEventListener('click', generateRpm);
  document.getElementById('testApiBtn')?.addEventListener('click', testApiConnection);
  document.getElementById('aiProfile')?.addEventListener('change', () => {
    updateFormData();
    syncSelectedAiModel();
    refreshAiModelSelect();
    resetApiTestStatus('Profil berubah, uji ulang koneksi.');
  });
  document.getElementById('aiModel')?.addEventListener('change', () => {
    updateFormData();
    resetApiTestStatus('Model berubah, uji ulang koneksi.');
  });

  // Cleanup on unmount
  container.routeCleanup = () => {
    if (unsubscribeDraft) unsubscribeDraft();
    if (abortController) abortController.abort();
  };
}
