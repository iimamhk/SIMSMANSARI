/**
 * Halaman Materi AI — form generate 3 blok yang rapi & mudah dipahami.
 * Konfigurasi AI (Base URL/API key/Model) diatur admin; guru hanya mengisi materi.
 * Logika interaksi ada di sini; HTML/CSS di materi-ai-form.js.
 */

import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { streamGenerateMaterialJson, MaterialGenerationError } from '../../utils/ai-material-client.js';
import { getApiBase } from '../../utils/ai-client.js';
import { buildMaterialHtml } from '../../utils/materi-renderer.js';
import { ensureKaTeXReady } from '../../utils/markdown-export.js';
import { getTeachingAssignmentsForUser, savePublishedMaterial, deletePublishedMaterial, saveMaterialWorkspaceDraft, deleteMaterialWorkspaceDraft } from '../../firebase/data-service.js';
import {
  pageStyles,
  statusBannerHtml,
  blok1Html,
  blok2Html,
  blok3Html,
  resultHtml,
  publishModalHtml,
  escapeHtml,
} from './materi-ai-form.js';

const MATERIAL_DRAFTS_KEY = 'simguru_material_html_drafts';

function getSession() {
  try { return JSON.parse(localStorage.getItem('simguru_session') || '{}'); } catch { return {}; }
}
function readDrafts() {
  try { return JSON.parse(localStorage.getItem(MATERIAL_DRAFTS_KEY) || '[]'); } catch { return []; }
}
function writeDrafts(drafts) {
  try {
    localStorage.setItem(MATERIAL_DRAFTS_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

export async function renderGuruMateriAiPage(container) {
  const storedContext = getStoredContext();
  const context = {
    ...storedContext,
    tahun_ajaran_aktif: storedContext?.tahun_ajaran_aktif || '2026_2027',
    tahun_ajaran_aktif_nama: storedContext?.tahun_ajaran_aktif_nama || '2026/2027',
    semester_aktif: storedContext?.semester_aktif || '2026_2027_1',
    semester_aktif_nama: storedContext?.semester_aktif_nama || 'Semester 1 (Ganjil)',
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

  const html = renderLayout(
    'Materi AI',
    `
    <style>${pageStyles()}</style>
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
      <a class="mwnav-btn active" href="#guru/materi-ai"><span class="mwnav-ico">✦</span><span class="mwnav-label">Materi AI</span></a>
      <a class="mwnav-btn" href="#guru/materi-import"><span class="mwnav-ico">📥</span><span class="mwnav-label">Import Materi</span></a>
    </nav>
    <div class="maip">
      ${statusBannerHtml()}
      <form id="maip-form" novalidate>
        ${blok1Html()}
        ${blok2Html()}
        ${blok3Html()}
      </form>
      ${resultHtml()}
      ${publishModalHtml()}
    </div>
    `,
    { accentPanel: 'from-violet-500 via-indigo-500 to-fuchsia-500' }
  );

  container.innerHTML = html;
  initMateriAi(container, { userId, userName, context, teachingAssignments });
}

function initMateriAi(root, { userId, userName, context, teachingAssignments }) {
  const form = root.querySelector('#maip-form');
  const generateBtn = root.querySelector('#maip-generate');
  const stopBtn = root.querySelector('#maip-stop');
  const simpanBtn = root.querySelector('#maip-simpan');
  const publishBtn = root.querySelector('#maip-publish');
  const connEl = root.querySelector('#maip-conn');
  const progressWrap = root.querySelector('#maip-progress-wrap');
  const progressEl = root.querySelector('#maip-progress');
  const previewEl = root.querySelector('#maip-preview');
  const emptyEl = root.querySelector('#maip-empty');
  const revisiWrap = root.querySelector('#maip-revisi-wrap');
  const revisiInput = root.querySelector('#maip-revisi-input');
  const revisiBtn = root.querySelector('#maip-revisi-btn');
  const retryBtn = root.querySelector('#maip-retry');
  const errorWrap = root.querySelector('#maip-error-wrap');
  const errorEl = root.querySelector('#maip-error');
  const statusEl = root.querySelector('#maip-status');
  const resultSub = root.querySelector('#maip-result-sub');
  const publishModal = root.querySelector('#maip-publish-modal');
  const targetList = root.querySelector('#maip-target-list');
  const targetCount = root.querySelector('#maip-target-count');
  const selectAllBtn = root.querySelector('#maip-select-all');
  const publishCloseBtn = root.querySelector('#maip-publish-close');
  const publishCancelBtn = root.querySelector('#maip-publish-cancel');
  const publishConfirmBtn = root.querySelector('#maip-publish-confirm');

  let abortController = null;
  let isGenerating = false;
  let currentMaterial = null;
  let currentMeta = null;
  let currentDraftId = null;
  let publishTrigger = null;
  const publishTargets = Array.from(new Map((teachingAssignments || []).map((item) => [String(item.id), item])).values());

  function setConn(state, text) {
    if (!connEl) return;
    connEl.className = `maip-status-pill ${state}`;
    connEl.innerHTML = `<span class="maip-dot"></span>${escapeHtml(text)}`;
  }
  function showError(msg) {
    errorWrap.hidden = false;
    errorEl.textContent = msg;
    retryBtn.hidden = isGenerating;
  }
  function clearError() {
    errorWrap.hidden = true;
    errorEl.textContent = '';
  }
  function setStatus(msg) { statusEl.textContent = msg || ''; }

  function documentIdToken(value) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'target';
  }

  function safeString(value) {
    return String(value ?? '').trim();
  }

  function selectedTargets() {
    const ids = new Set(Array.from(targetList.querySelectorAll('input:checked')).map((input) => input.value));
    return publishTargets.filter((item) => ids.has(String(item.id)));
  }

  function updateTargetCount() {
    const count = selectedTargets().length;
    targetCount.textContent = `${count} kelas dipilih`;
    publishConfirmBtn.disabled = count === 0;
  }

  function closePublishModal() {
    publishModal.classList.remove('open');
    publishModal.setAttribute('aria-hidden', 'true');
    publishTrigger?.focus();
  }

  function openPublishModal() {
    clearError();
    if (!publishTargets.length) {
      showError('Relasi mengajar aktif tidak ditemukan. Hubungi admin untuk melengkapi mapping mengajar.');
      return;
    }
    publishTrigger = document.activeElement;
    targetList.innerHTML = publishTargets.map((item) => `
      <label class="maip-target">
        <input type="checkbox" value="${escapeHtml(String(item.id))}">
        <span><strong>${escapeHtml(item.kelas_nama || item.kelas_id || 'Tanpa kelas')}</strong><span>${escapeHtml(item.mapel_nama || item.mapel_id || 'Tanpa mata pelajaran')}</span></span>
      </label>`).join('');
    targetList.querySelectorAll('input').forEach((input) => input.addEventListener('change', updateTargetCount));
    updateTargetCount();
    publishModal.classList.add('open');
    publishModal.setAttribute('aria-hidden', 'false');
    targetList.querySelector('input')?.focus();
  }

  // Cek koneksi AI (config admin tersimpan di server).
  (async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/ai/test-connection`, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) setConn('ok', `Terhubung${data.model ? ` · ${data.model}` : ''}`);
      else setConn('err', data?.error || 'Belum terhubung — minta admin mengatur AI');
    } catch {
      setConn('err', 'Server AI tidak dapat dihubungi');
    }
  })();

  function readForm() {
    const data = new FormData(form);
    return {
      mapel: String(data.get('mapel') || '').trim(),
      topik: String(data.get('topik') || '').trim(),
      bab: String(data.get('bab') || '').trim(),
      alokasiWaktu: String(data.get('alokasiWaktu') || ''),
      kelas: String(data.get('kelas') || ''),
      rombel: String(data.get('rombel') || '').trim(),
      fase: String(data.get('fase') || ''),
      semester: String(data.get('semester') || ''),
      kedalaman: String(data.get('kedalaman') || 'menengah'),
      gaya: String(data.get('gaya') || 'hangat'),
      jumlahContoh: String(data.get('jumlahContoh') || ''),
      lainLain: String(data.get('lainLain') || '').trim(),
      fitur: data.getAll('fitur').map(String),
    };
  }

  function buildMeta(input) {
    return {
      subject: input.mapel,
      className: [input.kelas, input.rombel].filter(Boolean).join('.'),
      chapter: input.bab || input.topik,
      meetings: input.alokasiWaktu,
    };
  }

  async function renderPreview(material, meta) {
    await ensureKaTeXReady();
    previewEl.srcdoc = buildMaterialHtml(material, meta);
    previewEl.hidden = false;
    emptyEl.hidden = true;
  }

  function setGenerating(state) {
    isGenerating = state;
    generateBtn.disabled = state;
    stopBtn.disabled = !state;
    generateBtn.innerHTML = state ? '&#8987; Menghasilkan&hellip;' : '&#10022; Generate Materi';
  }

  async function runGenerate(revisionInstruction = '') {
    clearError();
    const input = readForm();
    if (!input.mapel && !input.topik) {
      showError('Isi minimal Mata Pelajaran atau Topik (Blok 1).');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const isRevision = Boolean(revisionInstruction && revisionInstruction.trim());
    if (isRevision && !currentMaterial) {
      showError('Tidak ada materi untuk direvisi.');
      return;
    }

    currentMeta = buildMeta(input);
    setGenerating(true);
    setStatus('');
    progressEl.textContent = '';
    progressWrap.hidden = false;
    const progressLabel = root.querySelector('#maip-progress-label');
    if (progressLabel) progressLabel.textContent = 'AI sedang berpikir dan menulis materi...';
    abortController = new AbortController();

    const startTime = Date.now();
    const elapsedTimer = setInterval(() => {
      if (!isGenerating) { clearInterval(elapsedTimer); return; }
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 10 && progressLabel) {
        progressLabel.textContent = `AI sedang berpikir dan menulis materi... (${elapsed}s)`;
      }
    }, 5000);

    const previousMaterial = currentMaterial;
    const currentJson = isRevision ? JSON.stringify(previousMaterial) : undefined;
    let gotMaterial = false;

    try {
      await streamGenerateMaterialJson({
        input,
        revisionInstruction: isRevision ? revisionInstruction : undefined,
        currentJson,
        signal: abortController.signal,
        onDelta: (chunk) => {
          progressEl.textContent = (progressEl.textContent + chunk).slice(-4000);
          progressEl.scrollTop = progressEl.scrollHeight;
        },
        onMaterial: (material, meta) => {
          gotMaterial = true;
          currentMaterial = material;
          renderPreview(material, currentMeta);
          progressWrap.hidden = true;
          revisiWrap.hidden = false;
          simpanBtn.disabled = false;
          publishBtn.disabled = false;
          setStatus(`Selesai · model ${meta?.model || ''}`);
          resultSub.textContent = material.title || 'Materi siap';
        },
        onError: (err) => {
          showError(err.message || 'Gagal menghasilkan materi.');
          progressWrap.hidden = true;
        },
      });
    } catch (err) {
      if (!(err instanceof MaterialGenerationError && err.code === 'aborted')) {
        showError(err?.message || 'Gagal menghasilkan materi.');
      }
      progressWrap.hidden = true;
    } finally {
      clearInterval(elapsedTimer);
      // Revisi gagal → kembalikan materi lama agar tidak rusak.
      if (isRevision && !gotMaterial && previousMaterial) {
        currentMaterial = previousMaterial;
        renderPreview(previousMaterial, currentMeta);
      }
      setGenerating(false);
      if (!errorWrap.hidden) retryBtn.hidden = false;
      abortController = null;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isGenerating) return;
    currentMaterial = null;
    currentDraftId = null;
    revisiWrap.hidden = true;
    simpanBtn.disabled = true;
    publishBtn.disabled = true;
    runGenerate('');
  });

  stopBtn.addEventListener('click', () => {
    if (abortController) abortController.abort();
    setGenerating(false);
    progressWrap.hidden = true;
    setStatus('Dibatalkan.');
  });

  root.querySelectorAll('[data-revisi]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isGenerating || !currentMaterial) return;
      runGenerate(btn.getAttribute('data-instruction') || '');
    });
  });

  revisiBtn.addEventListener('click', () => {
    if (isGenerating || !currentMaterial) return;
    const instruction = String(revisiInput.value || '').trim();
    if (!instruction) {
      showError('Tulis dulu instruksi revisi.');
      return;
    }
    runGenerate(instruction);
  });

  retryBtn.addEventListener('click', () => {
    if (isGenerating) return;
    currentMaterial = null;
    currentDraftId = null;
    revisiWrap.hidden = true;
    simpanBtn.disabled = true;
    publishBtn.disabled = true;
    runGenerate('');
  });

  // Simpan materi ke koleksi publish dengan status belum diterbitkan (unpublish).
  // Simpan sebagai DRAFT di koleksi draft workspace (satu sumber draft untuk
  // semua metode pembuatan). Materi belum terlihat siswa sampai diterbitkan.
  simpanBtn.addEventListener('click', async () => {
    if (!currentMaterial) return;
    clearError();
    simpanBtn.disabled = true;
    simpanBtn.textContent = 'Menyimpan...';
    try {
      await ensureKaTeXReady();
      const input = readForm();
      const meta = buildMeta(input);
      const htmlSource = buildMaterialHtml(currentMaterial, meta);
      const id = currentDraftId || `maai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const draft = {
        id,
        guru_id: safeString(userId),
        guru_nama: safeString(userName || 'Guru'),
        title: safeString(currentMaterial.title || 'Materi AI'),
        subject: safeString(input.mapel),
        class_name: safeString(meta.className || input.kelas),
        duration: safeString(input.alokasiWaktu || '2 JP'),
        chapter: safeString(meta.chapter),
        note: `Materi dari AI - ${input.topik || ''}`,
        source: 'ai',
        html_source: htmlSource,
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
      setStatus('Tersimpan sebagai draft. Buka menu Materi > Materi Saya > Draft untuk menerbitkan.');
      setTimeout(() => setStatus(''), 6000);
    } catch (error) {
      showError(error?.message || 'Gagal menyimpan draft.');
    } finally {
      simpanBtn.disabled = !currentMaterial;
      simpanBtn.textContent = 'Simpan';
    }
  });

  publishBtn.addEventListener('click', () => {
    if (currentMaterial) openPublishModal();
  });

  selectAllBtn.addEventListener('click', () => {
    const inputs = Array.from(targetList.querySelectorAll('input'));
    const checkAll = inputs.some((input) => !input.checked);
    inputs.forEach((input) => { input.checked = checkAll; });
    updateTargetCount();
  });
  publishCloseBtn.addEventListener('click', closePublishModal);
  publishCancelBtn.addEventListener('click', closePublishModal);
  publishModal.addEventListener('click', (event) => {
    if (event.target === publishModal) closePublishModal();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && publishModal.classList.contains('open')) closePublishModal();
  });

  publishConfirmBtn.addEventListener('click', async () => {
    const targets = selectedTargets();
    if (!currentMaterial || !targets.length) return;
    clearError();
    publishConfirmBtn.disabled = true;
    publishConfirmBtn.textContent = 'Memublikasikan...';
    try {
      const input = readForm();
      const meta = buildMeta(input);
      const sourceId = currentDraftId || `maai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const htmlSource = buildMaterialHtml(currentMaterial, meta);
      const results = await Promise.allSettled(targets.map((target) => {
        const kelasId = safeString(target.kelas_id || target.kelas_nama || input.kelas);
        const kelasNama = safeString(target.kelas_nama || target.kelas_id || input.kelas);
        const mapelId = safeString(target.mapel_id || input.mapel);
        const mapelNama = safeString(target.mapel_nama || input.mapel || 'Mata Pelajaran');
        return savePublishedMaterial({
          id: `${sourceId}__${documentIdToken(target.id)}`,
          source_id: sourceId,
          guru_id: safeString(userId),
          guru_nama: safeString(userName || 'Guru'),
          pengajaran_id: safeString(target.id),
          kelas_id: kelasId,
          kelas_nama: kelasNama,
          kelas_token: documentIdToken(kelasId || kelasNama),
          mapel_id: mapelId,
          mapel_nama: mapelNama,
          title: safeString(currentMaterial.title || 'Materi AI'),
          note: `Materi dari AI - ${input.topik || ''}`,
          level: safeString(input.fase),
          chapter: safeString(input.bab || input.topik),
          meetings: safeString(input.alokasiWaktu),
          html_source: htmlSource,
          visible_to_students: true,
          source: 'materi_ai',
          tahun_ajaran_id: safeString(context?.tahun_ajaran_aktif),
          semester_id: safeString(context?.semester_aktif),
          published_at: now,
          created_at: now,
        });
      }));
      // Materi sudah terbit per kelas — bersihkan placeholder & draft agar tidak ganda.
      try { await deletePublishedMaterial(sourceId); } catch { /* placeholder belum ada */ }
      try { await deleteMaterialWorkspaceDraft(sourceId, userId); } catch { /* draft belum ada */ }
      const successes = results.filter((result) => result.status === 'fulfilled').length;
      const failures = targets.filter((_target, index) => results[index].status === 'rejected');
      if (!failures.length) {
        currentDraftId = sourceId;
        closePublishModal();
        setStatus(`Berhasil diterbitkan ke ${successes} kelas. Lihat di menu Materi > Materi Saya.`);
      } else {
        const failedNames = failures.map((item) => item.kelas_nama || item.kelas_id).join(', ');
        showError(`${successes} kelas berhasil, ${failures.length} gagal (${failedNames}).`);
        setStatus(successes ? 'Publish sebagian. Pilih kelas yang gagal lalu coba lagi.' : 'Publish gagal. Periksa koneksi dan izin, lalu coba lagi.');
      }
    } catch (error) {
      showError(error?.message || 'Publish gagal.');
      setStatus('Publish gagal. Coba lagi.');
    } finally {
      publishConfirmBtn.textContent = 'Publish';
      updateTargetCount();
    }
  });
}
