/**
 * Halaman Materi PPT — generate kerangka presentasi dengan AI lalu ekspor ke .pptx.
 * Alur mengikuti pola halaman RPM AI: form di kiri, preview di kanan, streaming SSE.
 * Konversi ke PowerPoint memakai util pptx-export.js (PptxGenJS).
 */

import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getApiBase } from '../../utils/ai-client.js';
import { renderMarkdown } from '../../utils/markdown-export.js';
import { PPT_THEMES, DEFAULT_THEME, parseSlidesFromMarkdown, exportToPptx } from '../../utils/pptx-export.js';

const FASE_OPTS = ['E', 'F', 'G', 'H'];
const SEMESTER_OPTS = ['Ganjil', 'Genap'];
const JUMLAH_SLIDE_OPTS = ['6', '8', '10', '12', '15', '20'];
const POIN_OPTS = ['3-4', '4-6', '5-7'];
const AUDIENS_OPTS = ['Siswa SMA/SMK/MA', 'Siswa SMP', 'Guru / Rekan Sejawat', 'Umum'];

const CARD = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
const LABEL = 'block text-sm font-medium text-slate-700 mb-1';
const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500';
const GRID2 = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

function getSession() {
  try { return JSON.parse(localStorage.getItem('simguru_session') || '{}'); } catch { return {}; }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function workspaceNavHtml() {
  return `
    <style>
      .mwnav-bar { position:relative; display:flex; gap:3px; margin-bottom:14px; padding:4px; border:1px solid rgba(249,115,22,.25); border-radius:16px; background:linear-gradient(135deg,rgba(255,247,237,.95),rgba(255,237,213,.82)); box-shadow:0 10px 28px -22px rgba(15,23,42,.3), inset 0 1px 0 rgba(255,255,255,.85); overflow-x:auto; scrollbar-width:none; }
      .mwnav-bar::-webkit-scrollbar { display:none; }
      .mwnav-btn { position:relative; flex:1 1 0; min-width:max-content; display:inline-flex; flex-direction:column; align-items:center; gap:2px; border:1px solid transparent; border-radius:12px; padding:7px 11px 6px; background:transparent; color:#64748b; font-size:11px; font-weight:700; cursor:pointer; transition:all .28s cubic-bezier(.22,1,.36,1); white-space:nowrap; text-decoration:none; }
      .mwnav-ico { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:9px; background:rgba(100,116,139,.08); color:#64748b; font-size:14px; line-height:1; transition:all .28s cubic-bezier(.22,1,.36,1); }
      .mwnav-label { display:block; line-height:1.15; }
      .mwnav-btn:hover { color:#334155; background:rgba(255,255,255,.7); transform:translateY(-1px); }
      .mwnav-btn:hover .mwnav-ico { background:rgba(249,115,22,.14); color:#ea580c; transform:scale(1.06); }
      .mwnav-btn.active { background:linear-gradient(135deg,#ea580c,#f97316); color:#fff; box-shadow:0 10px 24px -8px rgba(249,115,22,.5), inset 0 1px 0 rgba(255,255,255,.3); transform:translateY(-1px); }
      .mwnav-btn.active .mwnav-ico { background:rgba(255,255,255,.22); color:#fff; transform:scale(1.08); }
      @media (max-width:640px) { .mwnav-btn { flex:none; padding:6px 10px 5px; } .mwnav-ico { width:25px; height:25px; font-size:13px; } .mwnav-label { font-size:10px; } }
    </style>
    <nav class="mwnav-bar" aria-label="Workspace materi">
      <a class="mwnav-btn" href="#guru/materi"><span class="mwnav-ico">▤</span><span class="mwnav-label">Materi Saya</span></a>
      <a class="mwnav-btn" href="#guru/materi-ai"><span class="mwnav-ico">✦</span><span class="mwnav-label">Materi AI</span></a>
      <a class="mwnav-btn" href="#guru/materi-import"><span class="mwnav-ico">📥</span><span class="mwnav-label">Import Materi</span></a>
      <a class="mwnav-btn active" href="#guru/ppt-ai"><span class="mwnav-ico">📊</span><span class="mwnav-label">Materi PPT</span></a>
    </nav>
  `;
}

export async function renderGuruPptAiPage(container) {
  const session = getSession();
  if (!session?.user) {
    window.location.hash = '#login';
    return;
  }
  const myNama = session.user.nama || '';

  let formData = {
    namaSekolah: 'SMA Negeri 1 Wanasari',
    mapel: '',
    kelas: '',
    fase: '',
    semester: '',
    topik: '',
    tujuan: '',
    jumlahSlide: '10',
    poinPerSlide: '4-6',
    gaya: DEFAULT_THEME,
    audiens: 'Siswa SMA/SMK/MA',
    bahasa: 'Indonesia',
    sumber: '',
    namaGuru: myNama,
    instruksiTambahan: '',
  };

  let previewMarkdown = '';
  let slides = [];
  let lastGenerationMeta = null;
  let isGenerating = false;

  // Konfigurasi AI (provider/model) mengikuti Pengaturan AI admin — sama seperti
  // halaman Materi AI. Guru tidak memilih model secara manual di sini.

  // ---------- Form ----------
  function cardBasic() {
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-orange-600">1 · Informasi Presentasi</h3>
        <div class="space-y-3">
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Nama Sekolah</label>
              <input type="text" id="namaSekolah" class="${INPUT}" value="${escapeHtml(formData.namaSekolah)}" />
            </div>
            <div>
              <label class="${LABEL}">Mata Pelajaran <span class="text-rose-500">*</span></label>
              <input type="text" id="mapel" class="${INPUT}" value="${escapeHtml(formData.mapel)}" placeholder="Contoh: Fisika" />
            </div>
          </div>
          <div>
            <label class="${LABEL}">Topik / Judul Presentasi <span class="text-rose-500">*</span></label>
            <input type="text" id="topik" class="${INPUT}" value="${escapeHtml(formData.topik)}" placeholder="Contoh: Hukum Newton tentang Gerak" />
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="${LABEL}">Kelas</label>
              <select id="kelas" class="${INPUT}">
                <option value="">--</option>
                ${['X', 'XI', 'XII'].map((k) => `<option value="${k}" ${formData.kelas === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="${LABEL}">Fase</label>
              <select id="fase" class="${INPUT}">
                <option value="">--</option>
                ${FASE_OPTS.map((f) => `<option value="${f}" ${formData.fase === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="${LABEL}">Semester</label>
              <select id="semester" class="${INPUT}">
                <option value="">--</option>
                ${SEMESTER_OPTS.map((s) => `<option value="${s}" ${formData.semester === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <label class="${LABEL}">Tujuan Pembelajaran <span class="text-xs font-normal text-slate-400">(opsional, AI menyimpulkan bila kosong)</span></label>
            <textarea id="tujuan" class="${INPUT}" rows="2" placeholder="Apa yang harus dikuasai siswa setelah presentasi ini?">${escapeHtml(formData.tujuan)}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function cardTampilan() {
    const themeOptions = Object.entries(PPT_THEMES)
      .map(([key, t]) => `<option value="${key}" ${formData.gaya === key ? 'selected' : ''}>${escapeHtml(t.label)}</option>`)
      .join('');
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-orange-600">2 · Struktur & Tampilan</h3>
        <div class="space-y-3">
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Jumlah Slide Isi</label>
              <select id="jumlahSlide" class="${INPUT}">
                ${JUMLAH_SLIDE_OPTS.map((n) => `<option value="${n}" ${formData.jumlahSlide === n ? 'selected' : ''}>${n} slide</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="${LABEL}">Poin per Slide</label>
              <select id="poinPerSlide" class="${INPUT}">
                ${POIN_OPTS.map((n) => `<option value="${n}" ${formData.poinPerSlide === n ? 'selected' : ''}>${n} poin</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Tema Warna</label>
              <select id="gaya" class="${INPUT}">${themeOptions}</select>
            </div>
            <div>
              <label class="${LABEL}">Audiens</label>
              <select id="audiens" class="${INPUT}">
                ${AUDIENS_OPTS.map((a) => `<option value="${a}" ${formData.audiens === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="${GRID2}">
            <div>
              <label class="${LABEL}">Bahasa</label>
              <input type="text" id="bahasa" class="${INPUT}" value="${escapeHtml(formData.bahasa)}" />
            </div>
            <div>
              <label class="${LABEL}">Nama Guru</label>
              <input type="text" id="namaGuru" class="${INPUT}" value="${escapeHtml(formData.namaGuru)}" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function cardInstruksi() {
    return `
      <div class="${CARD}">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-orange-600">3 · Tambahan</h3>
        <div class="space-y-3">
          <div>
            <label class="${LABEL}">Sumber / Referensi</label>
            <textarea id="sumber" class="${INPUT}" rows="2" placeholder="Buku, modul, atau referensi yang dipakai.">${escapeHtml(formData.sumber)}</textarea>
          </div>
          <div>
            <label class="${LABEL}">Instruksi Tambahan AI</label>
            <textarea id="instruksiTambahan" class="${INPUT}" rows="3" placeholder="Contoh: Sertakan contoh soal, gunakan analogi sehari-hari, tambahkan slide kuis singkat.">${escapeHtml(formData.instruksiTambahan)}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderForm() {
    return `
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div class="min-w-0">
            <p class="text-xs text-slate-500">AI mengikuti Pengaturan Admin</p>
            <span id="pptTestApiStatus" class="text-xs font-medium text-slate-400">Belum diuji</span>
          </div>
          <button id="pptTestApiBtn" class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">Tes Koneksi API</button>
        </div>
        ${cardBasic()}
        ${cardTampilan()}
        ${cardInstruksi()}
        <button id="pptGenerateBtn" class="sticky bottom-0 w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-700 disabled:opacity-60">
          <span class="inline-flex items-center gap-2 justify-center">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>
            Generate Presentasi dengan AI
          </span>
        </button>
      </div>
    `;
  }

  function renderResultPlaceholder() {
    return `
      <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-slate-400">
        <svg viewBox="0 0 24 24" class="h-14 w-14 text-orange-300" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7 9h10M7 13h6"/></svg>
        <p class="mt-3 font-medium text-slate-500">Kerangka slide akan muncul di sini</p>
        <p class="text-sm">Isi form di kiri, lalu tekan <b>Generate Presentasi</b>.</p>
      </div>
    `;
  }

  function renderModelUsageMeta() {
    if (!lastGenerationMeta) return '';
    const notes = [];
    if (lastGenerationMeta.profileId) notes.push(`Profil: ${lastGenerationMeta.profileId}`);
    if (lastGenerationMeta.model) notes.push(`Model: ${lastGenerationMeta.model}`);
    return `<p class="mt-1 text-xs text-slate-500">${escapeHtml(notes.join(' • '))}</p>`;
  }

  function renderStreaming(md) {
    return `
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-bold text-slate-800">Menyusun slide…</h2>
        <span class="inline-flex items-center gap-2 text-sm font-medium text-orange-600">
          <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500"></span> Menghasilkan…
        </span>
      </div>
      <div class="ppt-prose max-w-none text-sm leading-relaxed text-slate-700">${renderMarkdown(md)}</div>
    `;
  }

  function renderSlideCard(slide, idx) {
    if (slide.kind === 'title') {
      return `
        <div class="overflow-hidden rounded-xl border border-orange-200 shadow-sm">
          <div class="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-white">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-white/80">Slide Judul</p>
            <h3 class="text-base font-bold">${escapeHtml(slide.title)}</h3>
            ${slide.subtitle ? `<p class="text-sm text-white/90">${escapeHtml(slide.subtitle)}</p>` : ''}
          </div>
        </div>
      `;
    }
    const items = Array.isArray(slide.items) ? slide.items : [];
    const bulletsMd = items.map((it) => `${'  '.repeat(it.level || 0)}- ${it.text}`).join('\n');
    return `
      <div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
          <h3 class="text-sm font-semibold text-slate-800">${String(idx).padStart(2, '0')}. ${escapeHtml(slide.title)}</h3>
          ${slide.note ? '<span class="text-[11px] font-medium text-orange-600" title="Ada catatan pembicara">🗒️ Catatan</span>' : ''}
        </div>
        <div class="p-3">
          <div class="ppt-prose max-w-none text-sm leading-relaxed text-slate-700">${renderMarkdown(bulletsMd || '_(kosong)_')}</div>
          ${slide.note ? `<div class="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800"><b>Catatan pembicara:</b> ${escapeHtml(slide.note)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderPreview() {
    if (!previewMarkdown) return renderResultPlaceholder();
    slides = parseSlidesFromMarkdown(previewMarkdown);
    const contentCount = slides.filter((s) => s.kind !== 'title').length;
    const hasTitle = slides.some((s) => s.kind === 'title');
    let contentIdx = 0;
    const cards = slides.map((s) => {
      if (s.kind === 'title') return renderSlideCard(s, 0);
      contentIdx += 1;
      return renderSlideCard(s, contentIdx);
    }).join('');
    return `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-lg font-bold text-slate-800">Hasil Presentasi</h2>
            <p class="text-xs text-slate-500">${hasTitle ? `${contentCount} slide isi + 1 slide judul` : `${contentCount} slide`}</p>
            ${renderModelUsageMeta()}
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="pptExportBtn" class="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700">Unduh PowerPoint (.pptx)</button>
          </div>
        </div>
        <div id="ppt-slides" class="space-y-3">${cards}</div>
      </div>
    `;
  }

  function updateFormData() {
    const val = (id) => document.getElementById(id)?.value || '';
    formData.namaSekolah = val('namaSekolah');
    formData.mapel = val('mapel');
    formData.kelas = val('kelas');
    formData.fase = val('fase');
    formData.semester = val('semester');
    formData.topik = val('topik');
    formData.tujuan = val('tujuan');
    formData.jumlahSlide = val('jumlahSlide') || '10';
    formData.poinPerSlide = val('poinPerSlide') || '4-6';
    formData.gaya = val('gaya') || DEFAULT_THEME;
    formData.audiens = val('audiens');
    formData.bahasa = val('bahasa') || 'Indonesia';
    formData.sumber = val('sumber');
    formData.namaGuru = val('namaGuru');
    formData.instruksiTambahan = val('instruksiTambahan');
  }

  async function testApiConnection() {
    updateFormData();
    const btn = document.getElementById('pptTestApiBtn');
    const status = document.getElementById('pptTestApiStatus');
    if (btn) { btn.disabled = true; btn.textContent = 'Menguji…'; }
    if (status) { status.textContent = 'Memeriksa koneksi…'; status.className = 'text-xs font-medium text-slate-500'; }
    try {
      const res = await fetch(`${getApiBase()}/api/ai/test-connection`);
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.ok === true;
      if (status) {
        status.textContent = ok ? `Terhubung ✓ (${data?.model || 'AI'})` : `Gagal: ${data?.error || ('HTTP ' + res.status)}`;
        status.className = ok ? 'text-xs font-medium text-emerald-600' : 'text-xs font-medium text-rose-600';
      }
    } catch {
      if (status) { status.textContent = 'Tidak dapat menghubungi server AI.'; status.className = 'text-xs font-medium text-rose-600'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Tes Koneksi API'; }
    }
  }

  async function generatePpt() {
    if (isGenerating) return;
    updateFormData();
    if (!formData.mapel && !formData.topik) { alert('Mata Pelajaran atau Topik harus diisi.'); return; }

    isGenerating = true;
    lastGenerationMeta = null;
    const genBtn = document.getElementById('pptGenerateBtn');
    if (genBtn) genBtn.disabled = true;
    resultEl.innerHTML = `
      <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-slate-500">
        <div class="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
        <p>Sedang menyusun kerangka slide…</p>
      </div>`;
    try {
      const response = await fetch(`${getApiBase()}/api/ai/generate-ppt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          input: { ...formData },
          stream: true,
          temperature: 0.8,
          maxTokens: 6000,
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
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
            continue;
          }
          if (sseEvent === 'delta') {
            accumulated += typeof parsed.content === 'string' ? parsed.content : '';
            previewMarkdown = accumulated;
            resultEl.innerHTML = renderStreaming(accumulated);
          } else if (sseEvent === 'done') {
            lastGenerationMeta = parsed;
          } else if (sseEvent === 'error') {
            throw new Error(parsed.error || 'Unknown error');
          }
        }
      }
      reader.releaseLock();
      previewMarkdown = accumulated;
      slides = parseSlidesFromMarkdown(previewMarkdown);
      resultEl.innerHTML = renderPreview();
      bindPreviewEvents();
    } catch (err) {
      console.error('Generation error:', err);
      const isNetwork = err instanceof TypeError && /fetch/i.test(err.message);
      const msg = isNetwork
        ? 'Tidak dapat terhubung ke server AI. Pastikan server berjalan, periksa koneksi internet, atau coba lagi sebentar. Bila baru saja memperbarui aplikasi, tunggu deployment selesai.'
        : `Gagal menghasilkan presentasi: ${escapeHtml(err.message)}`;
      resultEl.innerHTML = `
        <div class="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-rose-600">
          <p>${msg}</p>
          <button id="ppt-retry-btn" class="mt-4 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">Coba Lagi</button>
        </div>`;
      document.getElementById('ppt-retry-btn')?.addEventListener('click', generatePpt);
    } finally {
      isGenerating = false;
      const b = document.getElementById('pptGenerateBtn');
      if (b) b.disabled = false;
    }
  }

  async function exportPptx() {
    if (!previewMarkdown) { alert('Belum ada slide untuk diekspor. Buat presentasi terlebih dahulu.'); return; }
    updateFormData();
    slides = parseSlidesFromMarkdown(previewMarkdown);
    const btn = document.getElementById('pptExportBtn');
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Menyiapkan…'; }
    try {
      const footer = [formData.namaSekolah, formData.namaGuru].filter(Boolean).join(' • ');
      const fileName = `${formData.topik || formData.mapel || 'Presentasi'} ${formData.kelas || ''}`.trim();
      await exportToPptx(fileName, slides, { theme: formData.gaya, footer, author: formData.namaGuru || 'SIM SMANSARI' });
    } catch (err) {
      console.error('Export PPTX error:', err);
      alert('Gagal mengekspor PowerPoint: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  function bindPreviewEvents() {
    document.getElementById('pptExportBtn')?.addEventListener('click', exportPptx);
  }

  // ---------- Initial render ----------
  const html = renderLayout('Materi PPT', `
    ${workspaceNavHtml()}
    <div id="ppt-app" class="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section class="order-1 w-full lg:w-[42%] xl:w-[38%]">
        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 lg:h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-2">
          ${renderForm()}
        </div>
      </section>
      <section class="order-2 w-full lg:w-[58%] xl:w-[62%]">
        <div id="ppt-result" class="rounded-2xl border border-slate-200 bg-white p-4 lg:h-[calc(100vh-260px)] lg:overflow-y-auto">
          ${renderResultPlaceholder()}
        </div>
      </section>
    </div>
  `, { accentPanel: 'from-orange-500 via-amber-500 to-yellow-500' });

  container.innerHTML = html;
  const appEl = container.querySelector('#ppt-app');
  const resultEl = appEl.querySelector('#ppt-result');

  document.getElementById('pptGenerateBtn')?.addEventListener('click', generatePpt);
  document.getElementById('pptTestApiBtn')?.addEventListener('click', testApiConnection);
}
