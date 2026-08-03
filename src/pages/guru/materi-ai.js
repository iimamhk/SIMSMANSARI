/**
 * Halaman Materi AI — form generate 3 blok yang rapi & mudah dipahami.
 * Konfigurasi AI (Base URL/API key/Model) diatur admin; guru hanya mengisi materi.
 * Logika interaksi ada di sini; HTML/CSS di materi-ai-form.js.
 */

import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { streamGenerateMaterialJson, streamGenerateMaterialHtml, MaterialGenerationError } from '../../utils/ai-material-client.js';
import { getApiBase } from '../../utils/ai-client.js';
import { buildMaterialHtml } from '../../utils/materi-renderer.js';
import { ensureKaTeXReady } from '../../utils/markdown-export.js';
import { getTeachingAssignmentsForUser, savePublishedMaterialForClasses, saveMaterialWorkspaceDraft, deleteMaterialWorkspaceDraft, getMaterialWorkspaceDrafts, getPublishedMaterialsForTeacher } from '../../firebase/data-service.js';
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

/**
 * Materi mode "Premium HTML" disimpan dalam pembungkus bertanda agar seluruh
 * alur yang sudah ada (history/undo, simpan, publish, guard "belum ada materi")
 * tetap bekerja tanpa dicabang di banyak tempat.
 */
function isHtmlDoc(material) {
  return Boolean(material && typeof material === 'object' && material.__htmlDoc === true);
}
function makeHtmlDoc(html, title) {
  return { __htmlDoc: true, title: String(title || 'Materi'), html: String(html || '') };
}

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

export async function renderGuruMateriAiPage(container, params = {}) {
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

  // Tahap 5: bila diminta membuka materi/draft tersimpan, muat lebih dulu.
  const draftId = String(params?.draftId || '').trim();
  const publishedId = String(params?.publishedId || '').trim();
  let preload = null;
  if (draftId || publishedId) {
    try {
      preload = await loadSavedMaterial({ userId, draftId, publishedId });
    } catch (error) {
      console.warn('Gagal memuat materi tersimpan untuk disunting:', error);
    }
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
      <a class="mwnav-btn" href="#guru/ppt-ai"><span class="mwnav-ico">📊</span><span class="mwnav-label">Materi PPT</span></a>
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
  initMateriAi(container, { userId, userName, context, teachingAssignments, preload });
}

/**
 * Muat materi tersimpan (draft atau materi terbit) milik guru untuk disunting.
 * Mengembalikan { material, meta, draftId, source, title }.
 *
 * Materi mode "Premium HTML" (document_json null tetapi doc_mode 'html') dimuat
 * sebagai dokumen HTML sehingga tetap bisa direvisi lewat chat, meski tidak
 * dapat disunting per-bagian. Materi lama hanya-HTML tanpa penanda mode
 * dikembalikan sebagai unsupported.
 */
async function loadSavedMaterial({ userId, draftId, publishedId }) {
  if (draftId) {
    const drafts = await getMaterialWorkspaceDrafts(userId);
    const draft = (drafts || []).find((d) => String(d.id) === draftId);
    if (!draft) return null;
    if (!draft.document_json || typeof draft.document_json !== 'object') {
      if (draft.doc_mode === 'html' && typeof draft.html_source === 'string' && draft.html_source.trim()) {
        return {
          material: makeHtmlDoc(draft.html_source, draft.title || 'Materi'),
          draftId: draft.id,
          source: 'draft',
          docMode: 'html',
          title: draft.title || 'Materi',
          meta: {
            subject: draft.subject || '',
            className: draft.class_name || '',
            chapter: draft.chapter || '',
            meetings: draft.duration || '',
            gaya: draft.gaya || '',
          },
          form: {
            mapel: draft.subject || '',
            bab: draft.chapter || '',
            alokasiWaktu: draft.duration || '',
          },
        };
      }
      return { unsupported: true, title: draft.title || 'Materi' };
    }
    return {
      material: draft.document_json,
      draftId: draft.id,
      source: 'draft',
      docMode: 'structured',
      title: draft.title || draft.document_json.title || 'Materi',
      meta: {
        subject: draft.subject || '',
        className: draft.class_name || '',
        chapter: draft.chapter || '',
        meetings: draft.duration || '',
        gaya: draft.gaya || '',
      },
      form: {
        mapel: draft.subject || '',
        bab: draft.chapter || '',
        alokasiWaktu: draft.duration || '',
      },
    };
  }
  if (publishedId) {
    const list = await getPublishedMaterialsForTeacher(userId);
    const doc = (list || []).find((m) => String(m.source_id || m.id) === publishedId || String(m.id) === publishedId);
    if (!doc) return null;
    if (!doc.document_json || typeof doc.document_json !== 'object') {
      if (doc.doc_mode === 'html' && typeof doc.html_source === 'string' && doc.html_source.trim()) {
        return {
          material: makeHtmlDoc(doc.html_source, doc.title || 'Materi'),
          draftId: String(doc.source_id || doc.id),
          source: 'published',
          docMode: 'html',
          title: doc.title || 'Materi',
          meta: {
            subject: doc.mapel_nama || doc.mapel_id || '',
            className: doc.kelas_nama || '',
            chapter: doc.chapter || '',
            meetings: doc.meetings || '',
            gaya: doc.gaya || '',
          },
          form: {
            mapel: doc.mapel_nama || doc.mapel_id || '',
            bab: doc.chapter || '',
            alokasiWaktu: doc.meetings || '',
          },
        };
      }
      return { unsupported: true, title: doc.title || 'Materi' };
    }
    return {
      material: doc.document_json,
      draftId: String(doc.source_id || doc.id),
      source: 'published',
      docMode: 'structured',
      title: doc.title || doc.document_json.title || 'Materi',
      meta: {
        subject: doc.mapel_nama || doc.mapel_id || '',
        className: doc.kelas_nama || '',
        chapter: doc.chapter || '',
        meetings: doc.meetings || '',
        gaya: doc.gaya || '',
      },
      form: {
        mapel: doc.mapel_nama || doc.mapel_id || '',
        bab: doc.chapter || '',
        alokasiWaktu: doc.meetings || '',
      },
    };
  }
  return null;
}

function initMateriAi(root, { userId, userName, context, teachingAssignments, preload }) {
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
  const chatLog = root.querySelector('#maip-chat-log');
  const chatEmpty = root.querySelector('#maip-chat-empty');
  const focusBar = root.querySelector('#maip-focus');
  const focusLabel = root.querySelector('#maip-focus-label');
  const focusClear = root.querySelector('#maip-focus-clear');
  const undoBtn = root.querySelector('#maip-undo');
  const redoBtn = root.querySelector('#maip-redo');
  const versionPill = root.querySelector('#maip-version');
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
  // Tahap 3: riwayat versi (undo/redo) + fokus edit bertarget.
  let history = [];       // array of material snapshot (JSON-cloned)
  let historyIndex = -1;  // posisi aktif dalam history
  let focusTarget = null; // { target, label } untuk klik-untuk-perbaiki
  const publishTargets = Array.from(new Map((teachingAssignments || []).map((item) => [String(item.id), item])).values());

  function cloneMaterial(m) {
    try { return JSON.parse(JSON.stringify(m)); } catch { return m; }
  }
  function updateVersionUi() {
    if (undoBtn) undoBtn.disabled = historyIndex <= 0 || isGenerating;
    if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1 || isGenerating;
    if (versionPill) {
      if (history.length > 0) {
        versionPill.hidden = false;
        versionPill.innerHTML = `<span class="maip-dot"></span>v${historyIndex + 1}/${history.length}`;
      } else {
        versionPill.hidden = true;
      }
    }
  }
  // Catat snapshot materi baru sebagai versi. Membuang "redo" di depan.
  function pushHistory(material) {
    const snap = cloneMaterial(material);
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    historyIndex = history.length - 1;
    updateVersionUi();
  }
  function resetHistory() {
    history = [];
    historyIndex = -1;
    updateVersionUi();
  }

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

  // --- Panel chat editor AI (Tahap 1) ---
  function clearChatEmpty() {
    // Query ulang: resetChatLog menulis ulang isi chat, jadi referensi awal bisa basi.
    const placeholder = chatLog?.querySelector('#maip-chat-empty') || chatEmpty;
    if (placeholder && placeholder.parentNode) placeholder.remove();
  }
  function addChatMessage(role, text) {
    if (!chatLog) return null;
    clearChatEmpty();
    const msg = document.createElement('div');
    msg.className = `maip-msg ${role === 'user' ? 'user' : 'ai'}`;
    const avatar = document.createElement('span');
    avatar.className = 'maip-msg-avatar';
    avatar.textContent = role === 'user' ? (String(userName || 'G').trim().charAt(0).toUpperCase() || 'G') : '\u2726';
    const bubble = document.createElement('div');
    bubble.className = 'maip-msg-bubble';
    bubble.textContent = text;
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
    return bubble;
  }
  function addThinkingBubble() {
    const bubble = addChatMessage('ai', 'Sedang menyesuaikan materi\u2026');
    if (bubble) bubble.classList.add('thinking');
    return bubble;
  }


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
      docMode: String(data.get('docMode') || 'structured') === 'html' ? 'html' : 'structured',
    };
  }

  function buildMeta(input) {
    return {
      subject: input.mapel,
      className: [input.kelas, input.rombel].filter(Boolean).join('.'),
      chapter: input.bab || input.topik,
      meetings: input.alokasiWaktu,
      gaya: input.gaya,
    };
  }

  async function renderPreview(material, meta) {
    // Mode Premium HTML: dokumen sudah utuh dari AI, tampilkan apa adanya.
    // Iframe pratinjau ber-sandbox tanpa same-origin, jadi skrip di dalam
    // dokumen tidak dapat menyentuh aplikasi induk.
    if (isHtmlDoc(material)) {
      previewEl.srcdoc = material.html || '';
      previewEl.hidden = false;
      emptyEl.hidden = true;
      return;
    }
    await ensureKaTeXReady();
    // Mode editable aktif → tiap bagian punya tombol "Edit bagian ini".
    previewEl.srcdoc = buildMaterialHtml(material, meta, { editable: true });
    previewEl.hidden = false;
    emptyEl.hidden = true;
  }

  function setGenerating(state) {
    isGenerating = state;
    generateBtn.disabled = state;
    stopBtn.disabled = !state;
    generateBtn.innerHTML = state ? '&#8987; Menghasilkan&hellip;' : '&#10022; Generate Materi';
    updateVersionUi();
  }

  // --- Fokus edit (klik-untuk-perbaiki) ---
  function setFocusTarget(target, label) {
    focusTarget = target ? { target, label: label || target } : null;
    if (focusBar) focusBar.hidden = !focusTarget;
    if (focusLabel && focusTarget) focusLabel.textContent = focusTarget.label;
    if (focusTarget && revisiInput) revisiInput.focus();
  }
  focusClear?.addEventListener('click', () => setFocusTarget(null));

  // Terima pesan dari iframe pratinjau saat guru klik "Edit bagian ini".
  function handlePreviewMessage(event) {
    const data = event?.data;
    if (!data || data.type !== 'mai-edit-section') return;
    // Hanya terima dari iframe pratinjau kita.
    if (previewEl && event.source && event.source !== previewEl.contentWindow) return;
    setFocusTarget(String(data.target || ''), String(data.label || data.target || ''));
  }
  window.addEventListener('message', handlePreviewMessage);

  async function runGenerate(revisionInstruction = '', options = {}) {
    const viaChat = options.viaChat === true;
    const thinkingBubble = options.thinkingBubble || null;
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
    // Saat revisi via chat, progres teknis tidak ditampilkan (chat yang memandu).
    if (!viaChat) {
      progressEl.textContent = '';
      progressWrap.hidden = false;
    }
    const progressLabel = root.querySelector('#maip-progress-label');
    if (progressLabel && !viaChat) progressLabel.textContent = 'AI sedang berpikir dan menulis materi...';
    abortController = new AbortController();

    const startTime = Date.now();
    const elapsedTimer = setInterval(() => {
      if (!isGenerating) { clearInterval(elapsedTimer); return; }
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 10 && progressLabel && !viaChat) {
        progressLabel.textContent = `AI sedang berpikir dan menulis materi... (${elapsed}s)`;
      }
    }, 5000);

    const previousMaterial = currentMaterial;
    const currentJson = isRevision ? JSON.stringify(previousMaterial) : undefined;
    let gotMaterial = false;
    let patchSummary = '';

    // --- MODE PREMIUM HTML ---
    // AI menulis dokumen utuh; tidak ada patch bertarget, jadi revisi = tulis ulang.
    if (input.docMode === 'html') {
      try {
        await streamGenerateMaterialHtml({
          input,
          revisionInstruction: isRevision ? revisionInstruction : undefined,
          currentHtml: isRevision && isHtmlDoc(previousMaterial) ? previousMaterial.html : undefined,
          signal: abortController.signal,
          onDelta: (chunk) => {
            if (viaChat) return;
            progressEl.textContent = (progressEl.textContent + chunk).slice(-4000);
            progressEl.scrollTop = progressEl.scrollHeight;
          },
          onHtml: (html, meta) => {
            gotMaterial = true;
            const doc = makeHtmlDoc(html, meta?.title || input.topik || 'Materi');
            currentMaterial = doc;
            renderPreview(doc, currentMeta);
            pushHistory(doc);
            progressWrap.hidden = true;
            revisiWrap.hidden = false;
            simpanBtn.disabled = false;
            publishBtn.disabled = false;
            const dropped = Array.isArray(meta?.removed) ? meta.removed.length : 0;
            setStatus(`Selesai · mode HTML · model ${meta?.model || ''}${dropped ? ` · ${dropped} sumber luar diblokir` : ''}`);
            resultSub.textContent = doc.title || 'Materi siap';
            if (viaChat && thinkingBubble) {
              thinkingBubble.classList.remove('thinking');
              thinkingBubble.textContent = `Materi ditulis ulang sesuai permintaan: "${doc.title}".`;
              chatLog.scrollTop = chatLog.scrollHeight;
            }
          },
          onError: (err) => {
            if (viaChat && thinkingBubble) {
              thinkingBubble.classList.remove('thinking');
              thinkingBubble.textContent = `Maaf, gagal menerapkan perubahan: ${err.message || 'terjadi kesalahan.'}`;
            } else {
              showError(err.message || 'Gagal menghasilkan materi.');
            }
            progressWrap.hidden = true;
          },
        });
      } catch (err) {
        if (!(err instanceof MaterialGenerationError && err.code === 'aborted')) {
          if (viaChat && thinkingBubble) {
            thinkingBubble.classList.remove('thinking');
            thinkingBubble.textContent = `Maaf, gagal menerapkan perubahan: ${err?.message || 'terjadi kesalahan.'}`;
          } else {
            showError(err?.message || 'Gagal menghasilkan materi.');
          }
        } else if (viaChat && thinkingBubble) {
          thinkingBubble.classList.remove('thinking');
          thinkingBubble.textContent = 'Perubahan dibatalkan.';
        }
        progressWrap.hidden = true;
      } finally {
        clearInterval(elapsedTimer);
        if (isRevision && !gotMaterial && previousMaterial) {
          currentMaterial = previousMaterial;
          renderPreview(previousMaterial, currentMeta);
        }
        setGenerating(false);
        if (!errorWrap.hidden) retryBtn.hidden = false;
        abortController = null;
      }
      return;
    }

    try {
      await streamGenerateMaterialJson({
        input,
        // Via chat pada materi yang ada → mode PATCH (edit bertarget).
        // Selain itu → revisi penuh (tombol/otomatis) atau generate baru.
        editInstruction: viaChat && isRevision ? revisionInstruction : undefined,
        revisionInstruction: !viaChat && isRevision ? revisionInstruction : undefined,
        currentJson,
        signal: abortController.signal,
        onDelta: (chunk) => {
          if (viaChat) return; // progres teknis disembunyikan saat mode chat
          progressEl.textContent = (progressEl.textContent + chunk).slice(-4000);
          progressEl.scrollTop = progressEl.scrollHeight;
        },
        onPatch: (patch) => {
          patchSummary = String(patch?.summary || '').trim();
          if (viaChat && thinkingBubble && patchSummary) {
            thinkingBubble.textContent = patchSummary;
          }
        },
        onMaterial: (material, meta) => {
          gotMaterial = true;
          currentMaterial = material;
          renderPreview(material, currentMeta);
          pushHistory(material); // catat versi baru untuk undo/redo
          progressWrap.hidden = true;
          revisiWrap.hidden = false;
          simpanBtn.disabled = false;
          publishBtn.disabled = false;
          setStatus(`Selesai · model ${meta?.model || ''}`);
          resultSub.textContent = material.title || 'Materi siap';
          // Perubahan sudah diterapkan → lepaskan fokus edit.
          if (viaChat) setFocusTarget(null);
          if (viaChat && thinkingBubble) {
            thinkingBubble.classList.remove('thinking');
            const applied = Number(meta?.applied);
            let msg = patchSummary || `Materi diperbarui: "${material.title || 'materi'}".`;
            if (meta?.patched === false) {
              msg = `${patchSummary || 'Materi diperbarui menyeluruh.'} (perubahan besar)`;
            } else if (Number.isFinite(applied) && applied > 0) {
              msg = `${msg} (${applied} bagian diubah)`;
            }
            thinkingBubble.textContent = msg;
            chatLog.scrollTop = chatLog.scrollHeight;
          }
        },
        onError: (err) => {
          if (viaChat && thinkingBubble) {
            thinkingBubble.classList.remove('thinking');
            thinkingBubble.textContent = `Maaf, gagal menerapkan perubahan: ${err.message || 'terjadi kesalahan.'}`;
          } else {
            showError(err.message || 'Gagal menghasilkan materi.');
          }
          progressWrap.hidden = true;
        },
      });
    } catch (err) {
      if (!(err instanceof MaterialGenerationError && err.code === 'aborted')) {
        if (viaChat && thinkingBubble) {
          thinkingBubble.classList.remove('thinking');
          thinkingBubble.textContent = `Maaf, gagal menerapkan perubahan: ${err?.message || 'terjadi kesalahan.'}`;
        } else {
          showError(err?.message || 'Gagal menghasilkan materi.');
        }
      } else if (viaChat && thinkingBubble) {
        thinkingBubble.classList.remove('thinking');
        thinkingBubble.textContent = 'Perubahan dibatalkan.';
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

  // Kirim instruksi revisi lewat panel chat: tampilkan gelembung, terapkan live.
  function sendChatInstruction(instruction) {
    const text = String(instruction || '').trim();
    if (!text) return;
    if (isGenerating) return;
    if (!currentMaterial) {
      showError('Belum ada materi. Generate materi terlebih dahulu sebelum menyunting lewat chat.');
      return;
    }
    // Bila ada fokus edit aktif, arahkan instruksi ke bagian tersebut.
    const label = focusTarget ? focusTarget.label : '';
    const displayText = label ? `[${label}] ${text}` : text;
    const finalInstruction = focusTarget
      ? `Fokus perubahan HANYA pada bagian "${focusTarget.label}" (field: ${focusTarget.target}). ${text}`
      : text;
    addChatMessage('user', displayText);
    const thinkingBubble = addThinkingBubble();
    runGenerate(finalInstruction, { viaChat: true, thinkingBubble });
  }

  function resetChatLog() {
    if (!chatLog) return;
    const htmlMode = String(new FormData(form).get('docMode') || '') === 'html';
    chatLog.innerHTML = htmlMode
      ? '<div class="maip-chat-empty" id="maip-chat-empty">Mode HTML: ketik permintaan perubahan, materi akan <strong>ditulis ulang utuh</strong> oleh AI. Contoh: "perbanyak contoh soal", "tambah grafik fungsi", "buat pembagian bersusun lebih jelas".</div>'
      : '<div class="maip-chat-empty" id="maip-chat-empty">Mulai percakapan untuk menyempurnakan materi. Contoh: "perbanyak contoh soal", "ubah gaya jadi lebih santai", "tambah mini kuis 5 soal". Anda juga bisa klik <strong>Edit bagian ini</strong> pada pratinjau.</div>';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isGenerating) return;
    currentMaterial = null;
    currentDraftId = null;
    revisiWrap.hidden = true;
    simpanBtn.disabled = true;
    publishBtn.disabled = true;
    resetChatLog();
    resetHistory();
    setFocusTarget(null);
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
      const instruction = btn.getAttribute('data-instruction') || '';
      sendChatInstruction(instruction);
    });
  });

  function autoGrow() {
    if (!revisiInput) return;
    revisiInput.style.height = 'auto';
    revisiInput.style.height = `${Math.min(revisiInput.scrollHeight, 120)}px`;
  }
  revisiInput.addEventListener('input', autoGrow);
  revisiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const instruction = String(revisiInput.value || '').trim();
      if (!instruction) return;
      revisiInput.value = '';
      autoGrow();
      sendChatInstruction(instruction);
    }
  });

  revisiBtn.addEventListener('click', () => {
    if (isGenerating || !currentMaterial) return;
    const instruction = String(revisiInput.value || '').trim();
    if (!instruction) {
      showError('Tulis dulu instruksi perubahan.');
      return;
    }
    revisiInput.value = '';
    autoGrow();
    sendChatInstruction(instruction);
  });

  retryBtn.addEventListener('click', () => {
    if (isGenerating) return;
    currentMaterial = null;
    currentDraftId = null;
    revisiWrap.hidden = true;
    simpanBtn.disabled = true;
    publishBtn.disabled = true;
    resetChatLog();
    resetHistory();
    setFocusTarget(null);
    runGenerate('');
  });

  // --- Undo / Redo versi materi ---
  function applyHistoryAt(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    currentMaterial = cloneMaterial(history[index]);
    renderPreview(currentMaterial, currentMeta);
    resultSub.textContent = currentMaterial.title || 'Materi siap';
    setFocusTarget(null);
    updateVersionUi();
  }
  undoBtn?.addEventListener('click', () => {
    if (isGenerating || historyIndex <= 0) return;
    applyHistoryAt(historyIndex - 1);
    setStatus(`Kembali ke versi v${historyIndex + 1}.`);
  });
  redoBtn?.addEventListener('click', () => {
    if (isGenerating || historyIndex >= history.length - 1) return;
    applyHistoryAt(historyIndex + 1);
    setStatus(`Maju ke versi v${historyIndex + 1}.`);
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
      const htmlMode = isHtmlDoc(currentMaterial);
      if (!htmlMode) await ensureKaTeXReady();
      const input = readForm();
      const meta = buildMeta(input);
      const htmlSource = htmlMode ? currentMaterial.html : buildMaterialHtml(currentMaterial, meta);
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
        gaya: safeString(input.gaya),
        note: `Materi dari AI - ${input.topik || ''}`,
        source: 'ai',
        doc_mode: htmlMode ? 'html' : 'structured',
        html_source: htmlSource,
        // Simpan JSON terstruktur agar materi bisa disunting ulang di Studio (Tahap 5).
        // Mode HTML tidak punya struktur per-bagian, jadi null.
        document_json: htmlMode ? null : cloneMaterial(currentMaterial),
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
      const htmlMode = isHtmlDoc(currentMaterial);
      const htmlSource = htmlMode ? currentMaterial.html : buildMaterialHtml(currentMaterial, meta);
      // Satu dokumen untuk semua kelas — html_source tidak diduplikasi.
      await savePublishedMaterialForClasses({
        id: sourceId,
        source_id: sourceId,
        guru_id: safeString(userId),
        guru_nama: safeString(userName || 'Guru'),
        mapel_id: safeString(input.mapel),
        mapel_nama: safeString(input.mapel || 'Mata Pelajaran'),
        title: safeString(currentMaterial.title || 'Materi AI'),
        note: `Materi dari AI - ${input.topik || ''}`,
        level: safeString(input.fase),
        chapter: safeString(input.bab || input.topik),
        meetings: safeString(input.alokasiWaktu),
        gaya: safeString(input.gaya),
        html_source: htmlSource,
        visible_to_students: true,
        source: 'materi_ai',
        doc_mode: htmlMode ? 'html' : 'structured',
        // Simpan JSON agar materi terbit bisa disunting ulang di Studio.
        // Mode HTML tidak memiliki struktur per-bagian.
        document_json: htmlMode ? null : cloneMaterial(currentMaterial),
        tahun_ajaran_id: safeString(context?.tahun_ajaran_aktif),
        semester_id: safeString(context?.semester_aktif),
        published_at: now,
        created_at: now,
      }, targets.map((target) => ({
        id: safeString(target.id),
        kelas_id: safeString(target.kelas_id || target.kelas_nama || input.kelas),
        kelas_nama: safeString(target.kelas_nama || target.kelas_id || input.kelas),
        mapel_id: safeString(target.mapel_id || input.mapel),
        mapel_nama: safeString(target.mapel_nama || input.mapel || 'Mata Pelajaran'),
      })));
      // Draft sudah menjadi materi terbit — hapus agar tidak muncul dua kali.
      try { await deleteMaterialWorkspaceDraft(sourceId, userId); } catch { /* draft belum ada */ }
      currentDraftId = sourceId;
      closePublishModal();
      setStatus(`Berhasil diterbitkan ke ${targets.length} kelas. Lihat di menu Materi > Materi Saya.`);
    } catch (error) {
      showError(error?.message || 'Publish gagal.');
      setStatus('Publish gagal. Coba lagi.');
    } finally {
      publishConfirmBtn.textContent = 'Publish';
      updateTargetCount();
    }
  });

  // --- Tahap 5: hidrasi materi tersimpan untuk disunting ---
  function setFormField(name, value) {
    if (value == null || value === '') return;
    const el = form.querySelector(`[name="${name}"]`);
    if (el) el.value = value;
  }
  function loadPreloadMaterial(data) {
    if (!data) return;
    if (data.unsupported) {
      // Materi lama tanpa JSON terstruktur — beri tahu, jangan paksa.
      revisiWrap.hidden = true;
      emptyEl.hidden = false;
      previewEl.hidden = true;
      showError(`Materi "${data.title || ''}" dibuat sebelum editor terstruktur, jadi belum bisa disunting per-bagian di sini. Buat materi baru atau gunakan editor manual.`);
      return;
    }
    if (!data.material || typeof data.material !== 'object') return;
    // Isi field form dari metadata agar konteks revisi tetap akurat.
    if (data.form) {
      setFormField('mapel', data.form.mapel);
      setFormField('bab', data.form.bab);
      setFormField('alokasiWaktu', data.form.alokasiWaktu);
    }
    // Selaraskan pilihan Mode Materi dengan materi yang dimuat, supaya revisi
    // memakai jalur generate yang sama dengan cara materi ini dibuat.
    const loadedMode = data.docMode || (isHtmlDoc(data.material) ? 'html' : 'structured');
    const modeInput = form.querySelector(`[name="docMode"][value="${loadedMode}"]`);
    if (modeInput) modeInput.checked = true;
    currentMaterial = data.material;
    currentDraftId = data.draftId || null;
    currentMeta = data.meta || buildMeta(readForm());
    resetChatLog();
    resetHistory();
    pushHistory(currentMaterial);
    renderPreview(currentMaterial, currentMeta);
    revisiWrap.hidden = false;
    simpanBtn.disabled = false;
    publishBtn.disabled = false;
    resultSub.textContent = currentMaterial.title || data.title || 'Materi siap disunting';
    addChatMessage('ai', loadedMode === 'html'
      ? `Materi "${currentMaterial.title || data.title || ''}" (mode HTML) dimuat. Ketik perubahan yang diinginkan — materi akan ditulis ulang utuh karena mode ini tidak mendukung edit per-bagian.`
      : `Materi "${currentMaterial.title || data.title || ''}" dimuat untuk disunting. Ketik perubahan yang diinginkan, atau klik "Edit bagian ini" pada pratinjau.`);
    setStatus('Materi tersimpan dimuat. Perubahan dapat disimpan sebagai draft atau diterbitkan.');
  }

  if (preload) loadPreloadMaterial(preload);
}
