import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import {
  getActiveTeachingAssignments,
  getDocumentsWhere,
  saveDocument,
} from '../../firebase/data-service.js';
import {
  TIPE_SOAL, COLLECTION_SESI, COLLECTION_JAWABAN, COLLECTION_PAKET,
  LS_SESI, LS_JAWABAN, LS_PAKET,
  generateId, formatDateTime, formatDuration,
  hitungSkorJawaban, hitungMaxPoin, isSesiMasihBisa, hitungSisaWaktu,
  getStatusSesiBadge, shuffleArray, getSeed,
  saveDraft, loadDraft, clearDraft, readLocal, upsertLocal, renderMathPreview, ensureKaTeXReady,
} from '../../utils/kuiz-engine.js';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

const state = {
  view: 'list',        // 'list' | 'quiz' | 'review'
  sesiList: [],
  paketCache: {},
  jawabanSaya: {},     // { [sesiId]: jawabanDoc }
  activeSesi: null,
  activePaket: null,
  soalOrder: [],       // array of soal (shuffled if needed)
  jawaban: {},         // { [soalId]: answer }
  raguragu: new Set(),
  currentQ: 0,
  timeLeft: 0,
  timerInterval: null,
  siswaId: '',
  siswaNama: '',
  kelasId: '',
  kelasNama: '',
  context: null,
  securityActive: false,
  securityTriggered: false,
  fullscreenRequested: false,
  securityGraceUntil: 0,
  lastViolationAt: 0,
};

const quizSecurityHandlers = {
  visibility: null,
  blur: null,
  fullscreen: null,
  beforeUnload: null,
};

function renderQuizMathText(text) {
  return renderMathPreview(String(text || '')).replace(/\n/g, '<br>');
}
function renderQuizReviewMathBlock(text, tone = 'slate', fallback = '(kosong)') {
  const palette = {
    slate: 'border-slate-200 bg-slate-50/80 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-800',
    red: 'border-red-200 bg-red-50/80 text-red-700',
  };
  const html = String(text || '').trim() ? renderQuizMathText(text) : fallback;
  return `<div class="rounded-2xl border px-3 py-2.5 text-sm leading-6 ${palette[tone] || palette.slate}">${html}</div>`;
}

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────

const db = () => window.firebaseDb || null;

async function fsQuery(collection, filters = []) {
  if (!db()) return [];
  try {
    let q = db().collection(collection);
    filters.forEach(({ field, op, value }) => { q = q.where(field, op || '==', value); });
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function fsSave(collection, data, id = null) {
  if (!db()) {
    upsertLocal(collection === COLLECTION_JAWABAN ? LS_JAWABAN : LS_SESI, data);
    return data;
  }
  try {
    const ref = id ? db().collection(collection).doc(id) : db().collection(collection).doc();
    const payload = { ...data, updated_at: new Date().toISOString() };
    await ref.set(payload, { merge: true });
    return { id: ref.id, ...payload };
  } catch (e) {
    console.warn('fsSave error', e);
    return data;
  }
}

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────

async function loadSesiUntukSiswa() {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const allowedClassKeys = new Set([
    normalizeKelas(state.kelasId),
    normalizeKelas(state.kelasNama),
    normalizeKelas(session?.user?.kelas_id),
    normalizeKelas(session?.user?.kelas_nama),
    normalizeKelas(session?.user?.kelas),
  ].filter(Boolean));
  let assignmentMap = new Map();

  try {
    const assignments = await getActiveTeachingAssignments(state.context);
    assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const userKeys = getSessionUserKeys(session, state.context).map((key) => normalizeUserKey(key)).filter(Boolean);
    assignments.forEach((assignment) => {
      const assignmentStudentKeys = [assignment.siswa_id, assignment.siswa_username, assignment.user_id]
        .map((key) => normalizeUserKey(key))
        .filter(Boolean);
      const memberKeys = Array.isArray(assignment.siswa)
        ? assignment.siswa.flatMap((student) => [student?.siswa_id, student?.id, student?.username, student?.nisn, student?.nis])
          .map((key) => normalizeUserKey(key))
          .filter(Boolean)
        : [];
      const isMatched = assignmentStudentKeys.some((key) => userKeys.includes(key))
        || memberKeys.some((key) => userKeys.includes(key));
      if (isMatched) {
        allowedClassKeys.add(normalizeKelas(assignment.kelas_id));
        allowedClassKeys.add(normalizeKelas(assignment.kelas_nama));
        if (!state.kelasId && assignment.kelas_id) state.kelasId = assignment.kelas_id;
        if (!state.kelasNama && assignment.kelas_nama) state.kelasNama = assignment.kelas_nama;
      }
    });
  } catch {
    /* ignore assignment lookup and fallback to session class fields */
  }

  const isVisibleToStudent = (sesi) => {
    if (!allowedClassKeys.size) return false;
    const assignment = assignmentMap.get(sesi.assignment_id);
    const sesiClassKeys = [
      normalizeKelas(sesi.kelas_id),
      normalizeKelas(sesi.kelas_nama),
      normalizeKelas(assignment?.kelas_id),
      normalizeKelas(assignment?.kelas_nama),
    ].filter(Boolean);
    if (!sesiClassKeys.length) return false;
    return sesiClassKeys.some((key) => allowedClassKeys.has(key));
  };

  const filterByContext = (sesi) => {
    const tahunAktif = state.context?.tahun_ajaran_aktif;
    const semesterAktif = state.context?.semester_aktif;
    const sameTahun = !tahunAktif || !sesi.tahun_ajaran_id || sesi.tahun_ajaran_id === tahunAktif;
    const sameSemester = !semesterAktif || !sesi.semester_id || sesi.semester_id === semesterAktif;
    return sameTahun && sameSemester;
  };

  if (!db()) {
    state.sesiList = readLocal(LS_SESI).filter((s) => isVisibleToStudent(s) && filterByContext(s));
    return;
  }
  try {
    const remote = await fsQuery(COLLECTION_SESI, []);
    state.sesiList = remote.filter((s) => isVisibleToStudent(s) && filterByContext(s));
  } catch {
    state.sesiList = readLocal(LS_SESI).filter((s) => isVisibleToStudent(s) && filterByContext(s));
  }
}

async function loadPaket(paketId) {
  if (state.paketCache[paketId]) return state.paketCache[paketId];
  const localList = readLocal(LS_PAKET);
  const localPaket = localList.find((p) => p.id === paketId);
  if (!db()) { state.paketCache[paketId] = localPaket || null; return localPaket || null; }
  try {
    const snap = await db().collection(COLLECTION_PAKET).doc(paketId).get();
    const data = snap.exists ? { id: snap.id, ...snap.data() } : localPaket || null;
    if (data) state.paketCache[paketId] = data;
    return data;
  } catch { return localPaket || null; }
}

function getEffectivePaketForSesi(sesi, paket = null) {
  const snapshotSoal = Array.isArray(sesi?.soal_snapshot) ? sesi.soal_snapshot : [];
  if (paket?.soal?.length) {
    return paket;
  }
  if (!snapshotSoal.length) {
    return paket;
  }
  return {
    ...(paket || {}),
    id: paket?.id || sesi?.paket_id || generateId('paket_fallback'),
    judul: paket?.judul || sesi?.paket_judul || 'Ujian',
    mapel_id: paket?.mapel_id || sesi?.mapel_id || '',
    mapel_nama: paket?.mapel_nama || sesi?.mapel_nama || '',
    kelas_id: paket?.kelas_id || sesi?.kelas_id || '',
    kelas_nama: paket?.kelas_nama || sesi?.kelas_nama || '',
    acak_soal: paket?.acak_soal ?? sesi?.acak_soal ?? false,
    acak_opsi: paket?.acak_opsi ?? sesi?.acak_opsi ?? false,
    soal: snapshotSoal,
  };
}

async function loadJawabanSaya(sesiId) {
  if (!db()) return null;
  try {
    const docs = await fsQuery(COLLECTION_JAWABAN, [
      { field: 'sesi_id', value: sesiId },
      { field: 'siswa_id', value: state.siswaId },
    ]);
    return docs[0] || null;
  } catch { return null; }
}

async function loadAllJawabanSaya() {
  const map = {};
  await Promise.all(state.sesiList.map(async (s) => {
    const j = await loadJawabanSaya(s.id);
    if (j) map[s.id] = j;
  }));
  state.jawabanSaya = map;
}

async function submitJawaban() {
  const sesi = state.activeSesi;
  const paket = state.activePaket;
  if (!sesi || !paket) return;

  const now = new Date().toISOString();
  const jawabanId = state.jawabanSaya[sesi.id]?.id || generateId('jawaban');

  const { nilaiAkhir, total, maxTotal } = hitungSkorJawaban(paket, state.jawaban);

  const doc = {
    id: jawabanId,
    sesi_id: sesi.id,
    paket_id: paket.id,
    siswa_id: state.siswaId,
    siswa_nama: state.siswaNama,
    kelas_id: state.kelasId,
    jawaban: state.jawaban,
    skor: total,
    skor_max: maxTotal,
    nilai_akhir: nilaiAkhir,
    started_at: state.jawabanSaya[sesi.id]?.started_at || now,
    submitted_at: now,
    essay_graded: false,
    pelanggaran_count: Number(state.jawabanSaya[sesi.id]?.pelanggaran_count || 0),
    pelanggaran_log: state.jawabanSaya[sesi.id]?.pelanggaran_log || [],
    toleransi_pelanggaran: Number(sesi.toleransi_pelanggaran || 0),
    submitted_by_security: Boolean(state.jawabanSaya[sesi.id]?.submitted_by_security),
    reset_count: Number(state.jawabanSaya[sesi.id]?.reset_count || 0),
  };

  await fsSave(COLLECTION_JAWABAN, doc, jawabanId);
  clearDraft(sesi.id, state.siswaId);
  state.jawabanSaya[sesi.id] = doc;
  return doc;
}

async function recordStart(sesi) {
  const now = new Date().toISOString();
  const existing = state.jawabanSaya[sesi.id] || {};
  const jawabanId = existing.id || generateId('jawaban');
  const doc = {
    id: jawabanId,
    sesi_id: sesi.id,
    paket_id: sesi.paket_id,
    siswa_id: state.siswaId,
    siswa_nama: state.siswaNama,
    kelas_id: state.kelasId,
    jawaban: existing.jawaban || {},
    started_at: existing.started_at || now,
    submitted_at: existing.submitted_by_security ? null : (existing.submitted_at || null),
    essay_graded: false,
    pelanggaran_count: Number(existing.pelanggaran_count || 0),
    pelanggaran_log: existing.pelanggaran_log || [],
    toleransi_pelanggaran: Number(sesi.toleransi_pelanggaran || existing.toleransi_pelanggaran || 0),
    submitted_by_security: false,
    reset_count: Number(existing.reset_count || 0),
  };
  await fsSave(COLLECTION_JAWABAN, doc, jawabanId);
  state.jawabanSaya[sesi.id] = doc;
  return doc;
}

function closeViolationWarning() {
  document.getElementById('kuiz-warning-overlay')?.remove();
}

function showViolationWarning({ reason, count, tolerance, remaining }) {
  closeViolationWarning();
  const overlay = document.createElement('div');
  overlay.id = 'kuiz-warning-overlay';
  overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-4';
  overlay.innerHTML = `
    <div class="w-full max-w-md rounded-[28px] border border-amber-200 bg-white p-6 shadow-2xl">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl">!</div>
      <p class="mt-4 text-center text-lg font-semibold text-slate-900">Peringatan Pelanggaran</p>
      <p class="mt-2 text-center text-sm leading-6 text-slate-600">${reason}</p>
      <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>Pelanggaran: <strong>${count}</strong></p>
        <p>Toleransi: <strong>${tolerance}</strong></p>
        <p>Sisa kesempatan: <strong>${Math.max(remaining, 0)}</strong></p>
      </div>
      <button type="button" id="btn-warning-ok" class="mt-5 w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">Saya Mengerti</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('btn-warning-ok')?.addEventListener('click', async () => {
    state.securityGraceUntil = Date.now() + 1500;
    state.fullscreenRequested = false;
    closeViolationWarning();
    await requestQuizFullscreen(true);
  });
}

async function registerViolation(type, reason) {
  if (!state.activeSesi || !state.securityActive || state.view !== 'quiz' || state.securityTriggered) return;
  const nowTs = Date.now();
  if (nowTs < state.securityGraceUntil) return;
  if (nowTs - state.lastViolationAt < 1200) return;
  state.lastViolationAt = nowTs;

  const sesi = state.activeSesi;
  const existing = state.jawabanSaya[sesi.id] || {};
  const tolerance = Number(sesi.toleransi_pelanggaran || existing.toleransi_pelanggaran || 0);
  const nextCount = Number(existing.pelanggaran_count || 0) + 1;
  const remaining = tolerance - nextCount;
  const nextLog = [
    ...(existing.pelanggaran_log || []),
    { type, reason, at: new Date().toISOString() },
  ];

  const patched = {
    ...existing,
    id: existing.id || generateId('jawaban'),
    sesi_id: sesi.id,
    paket_id: sesi.paket_id,
    siswa_id: state.siswaId,
    siswa_nama: state.siswaNama,
    kelas_id: state.kelasId,
    jawaban: state.jawaban,
    started_at: existing.started_at || new Date().toISOString(),
    submitted_at: existing.submitted_at || null,
    essay_graded: false,
    pelanggaran_count: nextCount,
    pelanggaran_log: nextLog,
    toleransi_pelanggaran: tolerance,
    submitted_by_security: nextCount > tolerance,
    last_violation_at: nextLog[nextLog.length - 1]?.at || null,
    last_violation_type: type,
  };

  await fsSave(COLLECTION_JAWABAN, patched, patched.id);
  state.jawabanSaya[sesi.id] = patched;

  if (nextCount > tolerance) {
    await submitAndFinish('Batas pelanggaran terlampaui. Jawaban dikumpulkan otomatis.', 'error', true);
    return;
  }

  showViolationWarning({ reason, count: nextCount, tolerance, remaining });
}

function normalizeKelas(val) {
  return String(val || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function isSameClass(a, b) {
  const one = normalizeKelas(a);
  const two = normalizeKelas(b);
  return Boolean(one && two && one === two);
}

// ─── TIMER ────────────────────────────────────────────────────────────────────

function startTimer(seconds) {
  stopTimer();
  state.timeLeft = seconds;
  updateTimerUI();
  state.timerInterval = setInterval(() => {
    state.timeLeft = Math.max(0, state.timeLeft - 1);
    updateTimerUI();
    autoSaveDraft();
    if (state.timeLeft === 0) {
      stopTimer();
      handleAutoSubmit();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

async function requestQuizFullscreen(force = false) {
  if (document.fullscreenElement) {
    state.fullscreenRequested = true;
    return true;
  }
  if (state.fullscreenRequested && !force) return false;
  const root = document.documentElement;
  if (!root?.requestFullscreen) return false;
  try {
    state.fullscreenRequested = true;
    await root.requestFullscreen();
    state.fullscreenRequested = Boolean(document.fullscreenElement);
    state.securityGraceUntil = Date.now() + 1500;
    return true;
  } catch {
    state.fullscreenRequested = Boolean(document.fullscreenElement);
    showNotif('Aktifkan mode layar penuh untuk mengerjakan kuiz.', 'info');
    return false;
  }
}

async function exitQuizFullscreen() {
  if (!document.fullscreenElement || !document.exitFullscreen) return;
  try {
    await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

async function handleSecurityViolation(reason) {
  if (!state.securityActive || state.view !== 'quiz') return;
  await registerViolation('security', reason);
}

function activateQuizSecurity() {
  if (state.securityActive) return;
  state.securityActive = true;
  state.securityTriggered = false;

  quizSecurityHandlers.visibility = () => {
    if (document.visibilityState === 'hidden') {
      handleSecurityViolation('Keluar dari tab terdeteksi.');
    }
  };

  quizSecurityHandlers.blur = () => {
    handleSecurityViolation('Perpindahan fokus browser terdeteksi.');
  };

  quizSecurityHandlers.fullscreen = () => {
    state.fullscreenRequested = Boolean(document.fullscreenElement);
    if (state.securityActive && state.view === 'quiz' && !document.fullscreenElement) {
      handleSecurityViolation('Mode layar penuh ditutup.');
    }
  };

  quizSecurityHandlers.beforeUnload = (event) => {
    if (!state.securityActive || state.view !== 'quiz') return;
    event.preventDefault();
    event.returnValue = '';
    return '';
  };

  document.addEventListener('visibilitychange', quizSecurityHandlers.visibility);
  window.addEventListener('blur', quizSecurityHandlers.blur);
  document.addEventListener('fullscreenchange', quizSecurityHandlers.fullscreen);
  window.addEventListener('beforeunload', quizSecurityHandlers.beforeUnload);

  requestQuizFullscreen();
}

function deactivateQuizSecurity() {
  state.securityActive = false;
  state.securityTriggered = false;
  state.fullscreenRequested = false;
  state.securityGraceUntil = 0;
  state.lastViolationAt = 0;
  closeViolationWarning();
  if (quizSecurityHandlers.visibility) {
    document.removeEventListener('visibilitychange', quizSecurityHandlers.visibility);
    quizSecurityHandlers.visibility = null;
  }
  if (quizSecurityHandlers.blur) {
    window.removeEventListener('blur', quizSecurityHandlers.blur);
    quizSecurityHandlers.blur = null;
  }
  if (quizSecurityHandlers.fullscreen) {
    document.removeEventListener('fullscreenchange', quizSecurityHandlers.fullscreen);
    quizSecurityHandlers.fullscreen = null;
  }
  if (quizSecurityHandlers.beforeUnload) {
    window.removeEventListener('beforeunload', quizSecurityHandlers.beforeUnload);
    quizSecurityHandlers.beforeUnload = null;
  }
  exitQuizFullscreen();
}

function updateTimerUI() {
  const el = document.getElementById('quiz-timer');
  if (!el) return;
  const t = state.timeLeft;
  el.textContent = formatDuration(t);
  const urgent = t < 300; // < 5 minutes
  el.className = `tabular-nums font-mono text-2xl font-bold ${urgent ? 'text-red-500 animate-pulse' : 'text-slate-900'}`;
}

function autoSaveDraft() {
  if (!state.activeSesi) return;
  saveDraft(state.activeSesi.id, state.siswaId, {
    jawaban: state.jawaban,
    raguragu: Array.from(state.raguragu),
    currentQ: state.currentQ,
    timeLeft: state.timeLeft,
  });
}

async function handleAutoSubmit() {
  await submitAndFinish('Waktu habis! Jawaban dikumpulkan otomatis.', 'info');
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────

function showNotif(msg, type = 'success') {
  const existing = document.getElementById('siswa-kuiz-notif');
  if (existing) existing.remove();
  const colors = { success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', info: 'bg-slate-800 text-white' };
  const el = document.createElement('div');
  el.id = 'siswa-kuiz-notif';
  el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl ${colors[type] || colors.info}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── VIEW: DAFTAR KUIZ ────────────────────────────────────────────────────────

function renderDaftarKuiz() {
  const active = state.sesiList.filter((s) => s.status === 'aktif');
  const selesai = state.sesiList.filter((s) => ['selesai', 'diarsipkan'].includes(s.status));
  const riwayatTerbaru = [...selesai].sort((a, b) => String(b.updated_at || b.submitted_at || '').localeCompare(String(a.updated_at || a.submitted_at || '')));

  const formatScheduleCompact = (sesi) => {
    const parts = [];
    if (sesi.waktu_mulai) parts.push(`Mulai ${formatDateTime(sesi.waktu_mulai)}`);
    if (sesi.waktu_selesai) parts.push(`Berakhir ${formatDateTime(sesi.waktu_selesai)}`);
    return parts.length ? parts.join(' • ') : 'Waktu fleksibel';
  };

  const getCardTheme = ({ sudahSubmit, sedangKerjakan, bisaKerjakan, perluKode, status }) => {
    if (sudahSubmit) {
      return {
        shell: 'border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-teal-50 shadow-[0_20px_56px_-34px_rgba(16,185,129,0.38)]',
        badge: 'border-emerald-200 bg-emerald-100 text-emerald-700',
        badgeText: 'Selesai',
        iconWrap: 'bg-emerald-100 text-emerald-700',
        stat: 'border-emerald-100 bg-white/85',
        meta: 'border-emerald-100 bg-white/80',
        action: 'border-emerald-100 bg-white/70',
        pulse: 'from-emerald-500 to-teal-500',
      };
    }
    if (sedangKerjakan && bisaKerjakan) {
      return {
        shell: 'border-amber-200 bg-gradient-to-br from-white via-amber-50 to-orange-50 shadow-[0_20px_56px_-34px_rgba(245,158,11,0.38)]',
        badge: 'border-amber-200 bg-amber-100 text-amber-700',
        badgeText: 'Belum Selesai',
        iconWrap: 'bg-amber-100 text-amber-700',
        stat: 'border-amber-100 bg-white/85',
        meta: 'border-amber-100 bg-white/80',
        action: 'border-amber-100 bg-white/70',
        pulse: 'from-amber-500 to-orange-500',
      };
    }
    if (bisaKerjakan) {
      return {
        shell: 'border-indigo-200 bg-gradient-to-br from-white via-indigo-50 to-sky-50 shadow-[0_20px_56px_-34px_rgba(99,102,241,0.4)]',
        badge: perluKode ? 'border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700' : 'border-indigo-200 bg-indigo-100 text-indigo-700',
        badgeText: perluKode ? 'Perlu Token' : 'Tersedia',
        iconWrap: perluKode ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-indigo-100 text-indigo-700',
        stat: 'border-indigo-100 bg-white/85',
        meta: 'border-indigo-100 bg-white/80',
        action: 'border-indigo-100 bg-white/70',
        pulse: perluKode ? 'from-fuchsia-500 to-pink-500' : 'from-indigo-500 to-sky-500',
      };
    }
    if (status === 'selesai' || status === 'diarsipkan') {
      return {
        shell: 'border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm',
        badge: 'border-slate-200 bg-slate-100 text-slate-500',
        badgeText: 'Berakhir',
        iconWrap: 'bg-slate-100 text-slate-600',
        stat: 'border-slate-200 bg-white/85',
        meta: 'border-slate-200 bg-white/80',
        action: 'border-slate-200 bg-white/70',
        pulse: 'from-slate-500 to-slate-400',
      };
    }
    return {
      shell: 'border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm',
      badge: 'border-slate-200 bg-slate-100 text-slate-500',
      badgeText: 'Tidak Tersedia',
      iconWrap: 'bg-slate-100 text-slate-600',
      stat: 'border-slate-200 bg-white/85',
      meta: 'border-slate-200 bg-white/80',
      action: 'border-slate-200 bg-white/70',
      pulse: 'from-slate-500 to-slate-400',
    };
  };

  const renderCard = (s) => {
    const paket = getEffectivePaketForSesi(s, state.paketCache[s.paket_id]);
    const jawabanku = state.jawabanSaya[s.id];
    const sudahSubmit = !!jawabanku?.submitted_at;
    const sedangKerjakan = !!jawabanku?.started_at && !sudahSubmit;
    const bisaKerjakan = isSesiMasihBisa(s) && !sudahSubmit;
    const hasilTersedia = sudahSubmit && s.nilai_dipublish;
    const soalCount = (paket?.soal || []).length;
    const perluKode = !!s.kode_akses;
    const theme = getCardTheme({ sudahSubmit, sedangKerjakan, bisaKerjakan, perluKode, status: s.status });

    let badge = `<span class="rounded-full border px-3 py-1 text-[11px] font-semibold ${theme.badge}">${theme.badgeText}</span>`;
    let actionBtn = '';

    if (sudahSubmit) {
      actionBtn = hasilTersedia
        ? `<button type="button" data-action="lihat-hasil" data-sesi-id="${s.id}" class="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition">Lihat Hasil</button>`
        : `<div class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">Menunggu guru mempublikasi nilai</div>`;
    } else if (sedangKerjakan && bisaKerjakan) {
      actionBtn = `<button type="button" data-action="mulai-kuiz" data-sesi-id="${s.id}" class="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 transition">Lanjutkan Mengerjakan</button>`;
    } else if (bisaKerjakan) {
      actionBtn = perluKode
        ? `
          <div class="space-y-2">
            <input id="kode-input-${s.id}" type="text" maxlength="8" placeholder="Masukkan kode akses" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm uppercase font-mono text-center tracking-widest focus:outline-none focus:border-indigo-400"/>
            <button type="button" data-action="mulai-kuiz" data-sesi-id="${s.id}" data-perlu-kode="true" class="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition">Masuk & Mulai Ujian</button>
          </div>
        `
        : `<button type="button" data-action="mulai-kuiz" data-sesi-id="${s.id}" class="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition">Mulai Ujian</button>`;
    } else if (s.status === 'selesai' || s.status === 'diarsipkan') {
      actionBtn = `<div class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">Sesi telah berakhir</div>`;
    } else {
      actionBtn = '';
    }

    return `
      <div class="group rounded-[28px] border p-4 ${theme.shell} transition duration-200 active:scale-[0.99] sm:p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.iconWrap}">
              <svg viewBox="0 0 24 24" class="h-6 w-6 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>
            </div>
            <div class="min-w-0 flex-1">
               <p class="text-base font-semibold leading-6 text-slate-900">${paket?.judul || s.paket_judul || 'Ujian'}</p>
              <p class="mt-1 text-xs text-slate-500">${paket?.mapel_nama || '-'} • ${s.guru_nama || 'Guru'}</p>
              <div class="mt-2 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-white/60">
                <span class="h-2 w-2 rounded-full bg-gradient-to-r ${theme.pulse}"></span>
                ${s.kelas_nama || 'Kelas aktif'}
              </div>
            </div>
          </div>
          ${badge}
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-2xl border px-3 py-3 ${theme.stat}">
            <p class="text-lg font-semibold text-slate-900">${soalCount}</p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Soal</p>
          </div>
          <div class="rounded-2xl border px-3 py-3 ${theme.stat}">
            <p class="text-lg font-semibold text-slate-900">${s.durasi_menit || 60} mnt</p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Durasi</p>
          </div>
          <div class="rounded-2xl border px-3 py-3 ${theme.stat}">
            <p class="text-lg font-semibold ${sudahSubmit ? 'text-emerald-600' : 'text-slate-900'}">
              ${sudahSubmit ? (state.jawabanSaya[s.id]?.nilai_akhir ?? '-') : '-'}
            </p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nilai</p>
          </div>
        </div>

        <div class="mt-4 rounded-[22px] border px-4 py-3 ${theme.meta}">
          <div class="flex items-start gap-3">
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
              <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Jadwal</p>
              <p class="mt-1 text-sm leading-6 text-slate-700">${formatScheduleCompact(s)}</p>
            </div>
          </div>
        </div>

        ${actionBtn ? `<div class="mt-4 rounded-[22px] border p-3 ${theme.action}">${actionBtn}</div>` : ''}
      </div>
    `;
  };

  return `
    <div class="space-y-6">
      <section class="space-y-4">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Ujian Tersedia</p>
          <h3 class="text-2xl font-semibold text-slate-900">Ujian Saya</h3>
        </div>
        ${active.length === 0 ? `
          <div class="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <p class="text-sm text-slate-500">Belum ada kuiz aktif saat ini.</p>
            <p class="text-xs text-slate-400 mt-1">Guru akan membuka kuiz dan kamu akan melihatnya di sini.</p>
          </div>
        ` : `
          <div class="grid gap-4 sm:grid-cols-2">${active.map(renderCard).join('')}</div>
        `}
      </section>

      ${selesai.length > 0 ? `
        <section class="space-y-4">
          <details class="group overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Riwayat Ujian</p>
                <p class="mt-1 text-sm text-slate-600">Riwayat kuiz yang sudah dikerjakan. Tampilkan untuk melihat detail.</p>
              </div>
              <div class="flex items-center gap-3">
                <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">${selesai.length} riwayat</span>
                <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition group-open:rotate-180">
                  <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </span>
              </div>
            </summary>
            <div class="border-t border-slate-100 px-4 py-4 sm:px-5">
              <div class="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Buka riwayat hanya jika ingin melihat hasil kuiz lama. Fokus utama tetap pada kuiz aktif di atas.
              </div>
              <div class="grid gap-4 sm:grid-cols-2">${riwayatTerbaru.map(renderCard).join('')}</div>
            </div>
          </details>
        </section>
      ` : ''}
    </div>
  `;
}

// ─── VIEW: PENGERJAAN KUIZ ────────────────────────────────────────────────────

function renderPengerjaanKuiz() {
  const sesi = state.activeSesi;
  const soal = state.soalOrder[state.currentQ];
  if (!sesi || !soal) return '<p class="text-center py-20 text-slate-500">Soal tidak tersedia.</p>';

  const total = state.soalOrder.length;
  const answered = Object.keys(state.jawaban).length;
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;
  const isRagu = state.raguragu.has(soal.id);

  const navGrid = state.soalOrder.map((s, i) => {
    const hasAnswer = state.jawaban[s.id] !== undefined && state.jawaban[s.id] !== '';
    const isRaguThis = state.raguragu.has(s.id);
    const isCurrent = i === state.currentQ;
    let cls = 'h-10 w-10 rounded-xl text-sm font-semibold transition border ';
    if (isCurrent) cls += 'border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-300 ring-offset-1';
    else if (isRaguThis) cls += 'border-amber-300 bg-amber-50 text-amber-700';
    else if (hasAnswer) cls += 'border-emerald-300 bg-emerald-50 text-emerald-700';
    else cls += 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
    return `<button type="button" class="nav-soal-btn ${cls}" data-q-index="${i}">${i + 1}</button>`;
  }).join('');

  return `
    <div class="fixed inset-0 z-[95] overflow-y-auto bg-slate-100">
    <!-- Timer Bar -->
    <div class="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <p class="truncate text-sm font-semibold text-slate-700">${state.activePaket?.judul || 'Ujian'}</p>
          <p class="mt-1 text-[11px] text-rose-600">Mode pengawasan aktif: fullscreen wajib, pindah tab atau minimize akan mengumpulkan jawaban otomatis.</p>
          <div class="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-1.5 rounded-full bg-indigo-500 transition-all" style="width: ${progress}%"></div>
          </div>
        </div>
        <div class="flex flex-col items-end gap-0.5 shrink-0">
          <div id="quiz-timer" class="tabular-nums font-mono text-2xl font-bold text-slate-900">${formatDuration(state.timeLeft)}</div>
          <p class="text-[10px] text-slate-400">${answered}/${total} dijawab</p>
        </div>
      </div>
    </div>

    <div class="mx-auto mt-5 max-w-5xl space-y-5 px-4 pb-6 sm:px-6">
      <!-- Question -->
      <div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center gap-2 mb-4">
          <span class="h-8 w-8 flex items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">${state.currentQ + 1}</span>
          <span class="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide bg-slate-50 border-slate-200 text-slate-600">${TIPE_SOAL[soal.tipe] || soal.tipe}</span>
          <span class="ml-auto text-xs text-slate-400">${soal.poin || 1} poin</span>
        </div>
        <div class="text-base leading-7 text-slate-900 whitespace-pre-wrap font-medium">${renderQuizMathText(soal.pertanyaan)}</div>
      </div>

      <!-- Answer Area -->
      <div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">Jawaban Anda</p>
        ${renderAnswerInput(soal)}
      </div>

      <!-- Ragu-ragu Toggle -->
      <button type="button" id="btn-ragu" class="w-full rounded-2xl border-2 py-3 text-sm font-semibold transition ${isRagu ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">
        ${isRagu ? '★ Ditandai Ragu-ragu (klik untuk hapus tanda)' : '☆ Tandai Ragu-ragu'}
      </button>

      <!-- Navigation Grid -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Navigasi Soal</p>
        <div class="flex flex-wrap gap-2">${navGrid}</div>
        <div class="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
          <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-emerald-100 border border-emerald-300"></span> Dijawab</span>
          <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-amber-100 border border-amber-300"></span> Ragu-ragu</span>
          <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-white border border-slate-200"></span> Belum</span>
        </div>
      </div>

      <!-- Bottom Nav -->
      <div class="grid grid-cols-3 gap-3 pb-4">
        <button type="button" id="btn-prev" ${state.currentQ === 0 ? 'disabled' : ''} class="rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
          ← Sebelumnya
        </button>
        ${state.currentQ < total - 1
          ? `<button type="button" id="btn-next" class="rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">Selanjutnya →</button>`
          : `<button type="button" id="btn-submit-quiz" class="rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition">Kumpulkan</button>`
        }
        <div class="text-right flex items-center justify-end">
          <span class="text-xs text-slate-400">${state.currentQ + 1} / ${total}</span>
        </div>
      </div>
    </div>
    </div>
  `;
}

function renderAnswerInput(soal) {
  const current = state.jawaban[soal.id];

  if (soal.tipe === 'pg') {
    const opsi = soal.opsi || [];
    const letters = 'ABCDE';
    return `
      <div class="space-y-3" id="pg-options">
        ${opsi.map((o, i) => {
          const letter = letters[i];
          const isSelected = current === letter;
          return `
            <label class="flex items-center gap-4 rounded-2xl border-2 cursor-pointer py-4 px-4 transition select-none ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}">
              <input type="radio" name="answer_pg" value="${letter}" ${isSelected ? 'checked' : ''} class="sr-only"/>
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}">${letter}</span>
              <span class="text-sm text-slate-800 leading-6">${renderQuizMathText(o)}</span>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  if (soal.tipe === 'bs') {
    return `
      <div class="grid grid-cols-2 gap-3" id="bs-options">
        <label class="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 cursor-pointer py-6 transition select-none ${current === 'benar' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}">
          <input type="radio" name="answer_bs" value="benar" ${current === 'benar' ? 'checked' : ''} class="sr-only"/>
          <span class="text-3xl">✓</span>
          <span class="text-sm font-semibold ${current === 'benar' ? 'text-emerald-700' : 'text-slate-700'}">BENAR</span>
        </label>
        <label class="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 cursor-pointer py-6 transition select-none ${current === 'salah' ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white hover:bg-slate-50'}">
          <input type="radio" name="answer_bs" value="salah" ${current === 'salah' ? 'checked' : ''} class="sr-only"/>
          <span class="text-3xl">✕</span>
          <span class="text-sm font-semibold ${current === 'salah' ? 'text-red-600' : 'text-slate-700'}">SALAH</span>
        </label>
      </div>
    `;
  }

  if (soal.tipe === 'isian') {
    return `
      <input type="text" id="answer-isian" value="${current || ''}" placeholder="Tulis jawaban di sini…" autocomplete="off"
        class="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-base focus:border-indigo-500 focus:bg-white focus:outline-none transition"/>
    `;
  }

  if (soal.tipe === 'menjodohkan') {
    const pasangan = soal.pasangan || [];
    const currentMap = (typeof current === 'object' && current !== null) ? current : {};
    const rightSide = [...pasangan.map((p) => p.kanan)].sort();
    return `
      <div class="space-y-3" id="menjodohkan-container">
        ${pasangan.map((pair) => `
          <div class="flex items-center gap-3">
            <div class="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">${pair.kiri}</div>
            <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-slate-400 stroke-current" fill="none" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <select data-pair-kiri="${pair.kiri}" class="menjodohkan-select flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-sm focus:border-indigo-500 focus:outline-none transition ${currentMap[pair.kiri] ? 'border-indigo-300 bg-indigo-50' : ''}">
              <option value="">-- Pilih --</option>
              ${rightSide.map((r) => `<option value="${r}" ${currentMap[pair.kiri] === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (soal.tipe === 'essay') {
    return `
      <textarea id="answer-essay" rows="6" placeholder="Tulis jawaban essay kamu di sini…"
        class="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 resize-none focus:border-indigo-500 focus:bg-white focus:outline-none transition">${current || ''}</textarea>
      <p class="mt-2 text-xs text-slate-400">Jawaban essay akan dinilai secara manual oleh guru.</p>
    `;
  }

  return '<p class="text-sm text-slate-500">Tipe soal tidak dikenal.</p>';
}

function collectCurrentAnswer() {
  const soal = state.soalOrder[state.currentQ];
  if (!soal) return;

  if (soal.tipe === 'pg') {
    const selected = document.querySelector('input[name="answer_pg"]:checked');
    if (selected) state.jawaban[soal.id] = selected.value;
    else delete state.jawaban[soal.id];
  } else if (soal.tipe === 'bs') {
    const selected = document.querySelector('input[name="answer_bs"]:checked');
    if (selected) state.jawaban[soal.id] = selected.value;
    else delete state.jawaban[soal.id];
  } else if (soal.tipe === 'isian') {
    const val = document.getElementById('answer-isian')?.value?.trim();
    if (val) state.jawaban[soal.id] = val;
    else delete state.jawaban[soal.id];
  } else if (soal.tipe === 'menjodohkan') {
    const map = {};
    document.querySelectorAll('.menjodohkan-select').forEach((sel) => {
      const kiri = sel.dataset.pairKiri;
      if (sel.value) map[kiri] = sel.value;
    });
    if (Object.keys(map).length > 0) state.jawaban[soal.id] = map;
    else delete state.jawaban[soal.id];
  } else if (soal.tipe === 'essay') {
    const val = document.getElementById('answer-essay')?.value?.trim();
    if (val) state.jawaban[soal.id] = val;
    else delete state.jawaban[soal.id];
  }
}

// ─── VIEW: REVIEW HASIL ───────────────────────────────────────────────────────

function renderReviewHasil() {
  const sesi = state.activeSesi;
  const paket = state.activePaket;
  const jawabanku = state.jawabanSaya[sesi?.id];

  if (!sesi || !paket || !jawabanku?.submitted_at) {
    return `
      <div class="text-center py-16 space-y-4">
        <p class="text-5xl">📋</p>
        <p class="text-lg font-semibold text-slate-800">Ujian Selesai</p>
        <p class="text-sm text-slate-500">Jawaban kamu sudah dikumpulkan. Tunggu guru mempublikasi nilai.</p>
        <button type="button" id="btn-kembali-list" class="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">Kembali ke Daftar</button>
      </div>
    `;
  }

  const { nilaiAkhir, total, maxTotal, detail } = hitungSkorJawaban(paket, jawabanku.jawaban || {}, jawabanku.nilai_manual || {});
  const hasilDipublish = sesi.nilai_dipublish;

  const scoreColor = nilaiAkhir >= 75 ? 'text-emerald-600' : nilaiAkhir >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = nilaiAkhir >= 75 ? 'from-emerald-500 to-teal-500' : nilaiAkhir >= 60 ? 'from-amber-500 to-orange-500' : 'from-red-500 to-rose-500';
  const adaEssay = (paket.soal || []).some((s) => s.tipe === 'essay');
  const essayBelumDikoreksi = adaEssay && Object.values(jawabanku.nilai_manual || {}).every((v) => v === undefined || v === null || v === '');

  const soalReview = hasilDipublish ? (paket.soal || []).map((s, i) => {
    const d = detail[s.id] || {};
    const jawabanSiswa = d.jawaban;
    const isEssay = s.tipe === 'essay';
    const isBenar = d.benar;
    const komentar = jawabanku.komentar_guru?.[s.id];

    let jawabanDisplay = '-';
    if (typeof jawabanSiswa === 'object' && jawabanSiswa !== null) {
      jawabanDisplay = Object.entries(jawabanSiswa).map(([k, v]) => `${renderQuizMathText(k)} → ${renderQuizMathText(v)}`).join('<br>');
    } else {
      jawabanDisplay = String(jawabanSiswa || '-');
    }

    let jawabanBenarDisplay = '';
    if (!isEssay && s.jawaban_benar) {
      if (s.tipe === 'menjodohkan') {
        jawabanBenarDisplay = (s.pasangan || []).map((p) => `${renderQuizMathText(p.kiri)} → ${renderQuizMathText(p.kanan)}`).join(', ');
      } else {
          jawabanBenarDisplay = renderQuizMathText(s.jawaban_benar);
      }
    }

      if (typeof jawabanSiswa !== 'object' || jawabanSiswa === null) {
        jawabanDisplay = renderQuizMathText(jawabanDisplay);
      }

    return `
      <div class="rounded-[20px] border ${isEssay ? 'border-amber-200 bg-amber-50/50' : isBenar ? 'border-emerald-200 bg-emerald-50/50' : !jawabanSiswa ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50/50'} p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="h-7 w-7 flex items-center justify-center rounded-xl text-xs font-bold ${isEssay ? 'bg-amber-100 text-amber-700' : isBenar ? 'bg-emerald-100 text-emerald-700' : !jawabanSiswa ? 'bg-slate-200 text-slate-500' : 'bg-red-100 text-red-700'}">${i + 1}</span>
            <span class="text-[10px] rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide bg-white border-slate-200 text-slate-500">${TIPE_SOAL[s.tipe]}</span>
          </div>
          <div class="text-right shrink-0">
            ${isEssay
              ? `<span class="text-sm font-semibold text-amber-700">${d.poin !== undefined ? d.poin : '-'}/${d.max} poin</span>`
              : `<span class="text-sm font-bold ${isBenar ? 'text-emerald-600' : !jawabanSiswa ? 'text-slate-400' : 'text-red-600'}">${isBenar ? `+${d.max}` : !jawabanSiswa ? '0' : '0'} poin</span>`
            }
          </div>
        </div>
        <div class="text-sm font-medium text-slate-900">${renderQuizMathText(s.pertanyaan)}</div>
        <div class="space-y-1.5">
          <div class="space-y-1.5">
            <span class="text-xs font-semibold ${isEssay ? 'text-amber-600' : isBenar ? 'text-emerald-600' : !jawabanSiswa ? 'text-slate-400' : 'text-red-600'} shrink-0 mt-0.5">Jawaban kamu:</span>
            ${renderQuizReviewMathBlock(jawabanDisplay || '(kosong)', isEssay ? 'amber' : isBenar ? 'emerald' : !jawabanSiswa ? 'slate' : 'red')}
          </div>
          ${!isEssay && jawabanBenarDisplay ? `
            <div class="space-y-1.5">
              <span class="text-xs font-semibold text-emerald-600 shrink-0 mt-0.5">Jawaban benar:</span>
              ${renderQuizReviewMathBlock(jawabanBenarDisplay, 'emerald')}
            </div>
          ` : ''}
          ${isEssay && komentar ? `
            <div class="flex items-start gap-2 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <span class="text-xs font-semibold text-amber-600 shrink-0">Komentar Guru:</span>
              <span class="text-sm text-amber-800">${komentar}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('') : '';

  return `
    <div class="space-y-5">
      <div class="overflow-hidden rounded-[32px] bg-gradient-to-br ${scoreBg} p-8 text-white text-center shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Nilai Akhir</p>
        <div class="mt-4 flex items-baseline justify-center gap-2">
          <p class="text-7xl font-bold tracking-tight">${nilaiAkhir}</p>
          <p class="text-3xl font-semibold text-white/70">/100</p>
        </div>
        <p class="mt-2 text-white/80">Skor total: ${total} / ${maxTotal} poin</p>
        ${essayBelumDikoreksi ? '<p class="mt-1 text-xs text-white/60">Skor essay belum dikoreksi, nilai dapat berubah.</p>' : ''}
        <p class="mt-1 text-sm text-white/60">${paket.judul}</p>
      </div>

      ${hasilDipublish ? `
        <div class="space-y-3">
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Review Jawaban</p>
          ${soalReview}
        </div>
      ` : `
        <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-center">
          <p class="text-sm text-slate-600">Guru belum mempublikasi pembahasan soal.</p>
        </div>
      `}

      <button type="button" id="btn-kembali-list" class="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 transition">
        Kembali ke Daftar Ujian
      </button>
    </div>
  `;
}

// ─── RENDER PAGE ──────────────────────────────────────────────────────────────

function renderPage() {
  const mainEl = document.querySelector('#siswa-kuiz-view') || document.querySelector('#app main');
  if (!mainEl) return;

  let title = 'Ujian';
  let content = '';
  if (state.view === 'list') { title = 'Ujian Saya'; content = renderDaftarKuiz(); }
  else if (state.view === 'quiz') { title = 'Sedang Mengerjakan'; content = renderPengerjaanKuiz(); }
  else if (state.view === 'review') { title = 'Hasil Ujian'; content = renderReviewHasil(); }

  mainEl.innerHTML = content;
  attachViewListeners();
}

function attachViewListeners() {
  if (state.view === 'list') {
    document.querySelectorAll('[data-action="mulai-kuiz"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sesiId = btn.dataset.sesiId;
        const perluKode = btn.dataset.perluKode === 'true';
        const sesi = state.sesiList.find((s) => s.id === sesiId);
        if (!sesi) return;

        if (perluKode && sesi.kode_akses) {
          const input = document.getElementById(`kode-input-${sesiId}`);
          const masuk = input?.value?.trim().toUpperCase();
          if (masuk !== sesi.kode_akses.toUpperCase()) {
            showNotif('Kode akses salah!', 'error');
            return;
          }
        }

        const paket = getEffectivePaketForSesi(sesi, await loadPaket(sesi.paket_id));
        if (!paket || !paket.soal?.length) { showNotif('Soal kuiz belum tersedia di sesi ini.', 'error'); return; }

        // Check for existing draft
        const draft = loadDraft(sesi.id, state.siswaId);
        const seed = getSeed(sesi.id + state.siswaId);
        const soalOrder = (sesi.acak_soal ?? paket.acak_soal)
          ? shuffleArray(paket.soal, seed)
          : [...paket.soal];

        state.activeSesi = sesi;
        state.activePaket = paket;
        state.soalOrder = soalOrder;
        state.currentQ = draft?.currentQ ?? 0;
        state.jawaban = draft?.jawaban ?? state.jawabanSaya[sesi.id]?.jawaban ?? {};
        state.raguragu = new Set(draft?.raguragu ?? []);
        state.view = 'quiz';

        await recordStart(sesi);

        const sisaWaktu = hitungSisaWaktu(sesi, state.jawabanSaya[sesi.id]?.started_at);
        startTimer(sisaWaktu);
        renderPage();
        activateQuizSecurity();
      });
    });

    document.querySelectorAll('[data-action="lihat-hasil"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sesiId = btn.dataset.sesiId;
        const sesi = state.sesiList.find((s) => s.id === sesiId);
        if (!sesi) return;
        const paket = await loadPaket(sesi.paket_id);
        state.activeSesi = sesi;
        state.activePaket = paket;
        state.view = 'review';
        renderPage();
      });
    });
  }

  if (state.view === 'quiz') {
    // PG options
    document.getElementById('pg-options')?.addEventListener('change', (e) => {
      const soal = state.soalOrder[state.currentQ];
      if (soal) state.jawaban[soal.id] = e.target.value;
      document.querySelectorAll('#pg-options label').forEach((label) => {
        const radio = label.querySelector('input[type="radio"]');
        const isChecked = radio?.checked;
        label.className = label.className.replace(/border-indigo-500 bg-indigo-50|border-slate-200 bg-white hover:bg-slate-50/g, '');
        label.classList.add(...(isChecked ? ['border-indigo-500', 'bg-indigo-50'] : ['border-slate-200', 'bg-white', 'hover:bg-slate-50']));
        const badge = label.querySelector('span:first-of-type');
        if (badge) {
          badge.className = badge.className.replace(/bg-indigo-600 text-white|bg-slate-100 text-slate-600/g, '');
          badge.classList.add(...(isChecked ? ['bg-indigo-600', 'text-white'] : ['bg-slate-100', 'text-slate-600']));
        }
      });
      autoSaveDraft();
    });

    // BS options
    document.getElementById('bs-options')?.addEventListener('change', (e) => {
      const soal = state.soalOrder[state.currentQ];
      if (soal) state.jawaban[soal.id] = e.target.value;
      autoSaveDraft();
    });

    // Isian
    document.getElementById('answer-isian')?.addEventListener('input', (e) => {
      const soal = state.soalOrder[state.currentQ];
      if (soal) {
        if (e.target.value.trim()) state.jawaban[soal.id] = e.target.value.trim();
        else delete state.jawaban[soal.id];
      }
      autoSaveDraft();
    });

    // Essay
    document.getElementById('answer-essay')?.addEventListener('input', (e) => {
      const soal = state.soalOrder[state.currentQ];
      if (soal) {
        if (e.target.value.trim()) state.jawaban[soal.id] = e.target.value.trim();
        else delete state.jawaban[soal.id];
      }
      autoSaveDraft();
    });

    // Menjodohkan
    document.querySelectorAll('.menjodohkan-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const soal = state.soalOrder[state.currentQ];
        if (!soal) return;
        const map = {};
        document.querySelectorAll('.menjodohkan-select').forEach((s) => {
          if (s.value) map[s.dataset.pairKiri] = s.value;
        });
        if (Object.keys(map).length > 0) state.jawaban[soal.id] = map;
        else delete state.jawaban[soal.id];
        autoSaveDraft();
      });
    });

    // Nav soal grid
    document.querySelectorAll('.nav-soal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        collectCurrentAnswer();
        state.currentQ = parseInt(btn.dataset.qIndex, 10);
        renderPage();
      });
    });

    // Prev
    document.getElementById('btn-prev')?.addEventListener('click', () => {
      collectCurrentAnswer();
      if (state.currentQ > 0) { state.currentQ--; renderPage(); }
    });

    // Next
    document.getElementById('btn-next')?.addEventListener('click', () => {
      collectCurrentAnswer();
      if (state.currentQ < state.soalOrder.length - 1) { state.currentQ++; renderPage(); }
    });

    // Ragu-ragu
    document.getElementById('btn-ragu')?.addEventListener('click', () => {
      const soalId = state.soalOrder[state.currentQ]?.id;
      if (!soalId) return;
      if (state.raguragu.has(soalId)) state.raguragu.delete(soalId);
      else state.raguragu.add(soalId);
      autoSaveDraft();
      renderPage();
    });

    // Submit
    document.getElementById('btn-submit-quiz')?.addEventListener('click', () => {
      collectCurrentAnswer();
      const unanswered = state.soalOrder.filter((s) => !state.jawaban[s.id]).length;
      const msg = unanswered > 0
        ? `Kamu belum menjawab ${unanswered} soal. Kumpulkan sekarang?`
        : 'Kumpulkan jawaban sekarang?';
      if (!confirm(msg)) return;
      submitAndFinish();
    });

    // Keluar
    document.getElementById('btn-keluar-kuiz')?.addEventListener('click', () => {
      collectCurrentAnswer();
      autoSaveDraft();
      if (!confirm('Keluar dari kuiz? Jawaban tersimpan dan bisa dilanjutkan.')) return;
      stopTimer();
      deactivateQuizSecurity();
      state.view = 'list';
      renderPage();
    });
  }

  if (state.view === 'review') {
    document.getElementById('btn-kembali-list')?.addEventListener('click', () => {
      stopTimer();
      deactivateQuizSecurity();
      state.view = 'list';
      state.activeSesi = null;
      state.activePaket = null;
      renderPage();
    });
  }
}

async function submitAndFinish(message = 'Jawaban berhasil dikumpulkan!', messageType = 'success', submittedBySecurity = false) {
  stopTimer();
  if (submittedBySecurity && state.activeSesi && state.jawabanSaya[state.activeSesi.id]) {
    state.jawabanSaya[state.activeSesi.id] = {
      ...state.jawabanSaya[state.activeSesi.id],
      submitted_by_security: true,
    };
  }
  deactivateQuizSecurity();
  await submitJawaban();
  state.view = 'review';
  renderPage();
  showNotif(message, messageType);
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function renderSiswaKuizPage(container) {
  container.innerHTML = renderLayout('Ujian', '<div class="py-20 text-center text-slate-500 text-sm">Memuat ujian…</div>');
  await ensureKaTeXReady();

  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const user = session?.user || {};
  state.siswaId = user.username || '';
  state.siswaNama = user.nama || '';
  state.kelasId = user.kelas_id || user.kelas || '';
  state.kelasNama = user.kelas_nama || user.kelas || '';
  state.context = context;
  state.view = 'list';
  state.activeSesi = null;
  state.activePaket = null;
  stopTimer();
  deactivateQuizSecurity();

  // Try to get kelas_id from teaching assignments if not in session
  if (!state.kelasId) {
    try {
      const assignments = await getActiveTeachingAssignments(context);
      const userKeys = getSessionUserKeys(session, context);
      const matched = assignments.find((a) =>
        userKeys.some((k) => normalizeUserKey(k) === normalizeUserKey(a.siswa_id || ''))
        || (Array.isArray(a.siswa) && a.siswa.some((student) =>
          userKeys.some((k) => [student?.siswa_id, student?.id, student?.username, student?.nisn, student?.nis]
            .map((value) => normalizeUserKey(value))
            .includes(normalizeUserKey(k)))
        ))
      );
      if (matched) {
        state.kelasId = matched.kelas_id || state.kelasId;
        state.kelasNama = matched.kelas_nama || state.kelasNama;
      }
    } catch { /* ignore */ }
  }

  await loadSesiUntukSiswa();

  // Pre-load paket untuk sesi
  await Promise.all(state.sesiList.map((s) => loadPaket(s.paket_id)));

  // Load semua jawaban siswa
  await loadAllJawabanSaya();

  const html = renderLayout('Ujian', `
    <div class="space-y-5">
      <section class="overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 px-5 py-4 text-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-200">Ujian Saya</p>
            <h2 class="text-xl font-semibold tracking-tight">Hai, ${state.siswaNama.split(' ')[0] || 'Siswa'}!</h2>
            <p class="text-xs leading-5 text-indigo-50/80">Kerjakan kuiz dari guru dan pantau progres pengerjaanmu dari satu panel yang ringkas.</p>
          </div>
          <div class="grid grid-cols-2 gap-2 xl:min-w-[320px]">
            <div class="rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <p class="text-[10px] uppercase tracking-[0.18em] text-indigo-100">Tersedia</p>
              <p class="mt-1 text-2xl font-semibold">${state.sesiList.filter((s) => s.status === 'aktif').length}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <p class="text-[10px] uppercase tracking-[0.18em] text-indigo-100">Selesai</p>
              <p class="mt-1 text-2xl font-semibold">${Object.values(state.jawabanSaya).filter((j) => j.submitted_at).length}</p>
            </div>
          </div>
        </div>
      </section>
      <main id="siswa-kuiz-view">
        ${renderDaftarKuiz()}
      </main>
    </div>
  `);

  container.innerHTML = html;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
  renderPage();
}
