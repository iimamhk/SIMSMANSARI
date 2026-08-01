import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getTeachingAssignmentsForUser,
  getActiveTeachingAssignments,
  getClassMembers,
  saveDocument,
  getDocumentsWhere,
  deleteDocument,
} from '../../firebase/data-service.js';
import {
  generateId, generateAccessCode, formatDateTime, formatDateTimeInput,
  hitungSkorJawaban, hitungStatistikSoal, hitungMaxPoin, hasEssayPerluKoreksi,
  getStatusSesiBadge, isSesiMasihBisa, exportToCSV,
  parseMarkdownSoal, parseJsonBulkSoal, renderMathPreview, buildPreviewHtml, ensureKaTeXReady,
  TIPE_SOAL, COLLECTION_PAKET, COLLECTION_SESI, COLLECTION_JAWABAN,
  LS_PAKET, LS_SESI, LS_JAWABAN, readLocal, writeLocal, upsertLocal, deleteLocal,
} from '../../utils/kuiz-engine.js';
import { streamGenerateSoal } from '../../utils/ai-soal-client.js';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

const state = {
  tab: 'bank',
  paketList: [],
  sesiList: [],
  paketLoadedAt: 0,
  sesiLoadedAt: 0,
  loadedForGuru: '',
  jawabanCache: {},
  assignments: [],
  context: null,
  guruId: '',
  guruNama: '',
  activeFilter: 'semua',
  editingPaket: null,
  editingSoal: null,
  editingSoalPaketId: null,
  editingSesi: null,
  monitorSesiId: null,
  monitorTab: 'hasil',
  hasilSesiId: null,
  essayJawabanId: null,
  importFormat: 'markdown',
  importingPaketId: null,
  genAbort: null,
  genSoal: [],
  genPaketId: null,
  genPaketJudul: '',
};

const DEFAULT_AI_PRESET = 'matematika';
const DEFAULT_AI_MATH_MATERI = 'operasi polinomial';
const DEFAULT_AI_SCIENCE_MATERI = 'sistem pernapasan manusia';
const DEFAULT_AI_GENERAL_MATERI = 'teks eksplanasi';
const COLLECTION_KUIZ_NILAI_FINAL = 'kuiz_nilai_final';
const COLLECTION_BAB = 'bab';
const COLLECTION_TUGAS_BAB = 'tugas_bab';
const COLLECTION_NILAI_TUGAS = 'nilai_tugas';
const COLLECTION_NILAI_UJIAN = 'nilai_ujian';
const COLLECTION_UH_KOLOM = 'ulangan_harian_kolom';

// Optimasi read: paket & sesi milik guru jarang berubah antar navigasi.
// Dengan TTL ini, membuka ulang halaman Kuiz dalam rentang waktu tersebut
// memakai data yang sudah ada di memori (0 read Firestore). Cache di-refresh
// otomatis setiap kali guru menyimpan/menghapus (state di-update lokal).
const PAKET_SESI_CACHE_TTL_MS = 60000;

function buildAiMathPrompt(materi = DEFAULT_AI_MATH_MATERI) {
  const finalMateri = String(materi || '').trim() || DEFAULT_AI_MATH_MATERI;
  return [
  'Anda adalah guru Matematika SMA yang ahli dalam menyusun soal.',
  '',
  'Buatkan 10 soal sesuai materi yang saya tentukan dengan ketentuan berikut.',
  '',
  '## Format Soal',
  '',
  '* Nomori soal mulai dari Soal 1 sampai Soal 10.',
  '* Soal 1-8 adalah Pilihan Ganda dengan 5 pilihan jawaban (A-E).',
  '* Soal 9-10 adalah Isian.',
  '* Untuk soal pilihan ganda, tuliskan Jawaban: di bawah pilihan jawaban.',
  '* Untuk soal isian, tuliskan:',
  '  * Jawaban:',
  '  * Poin: 2',
  '',
  '## Format Penulisan Matematika',
  '',
  'Gunakan LaTeX penuh dengan aturan berikut.',
  '',
  '* Gunakan $...$ untuk rumus inline.',
  '* Gunakan $$...$$ untuk rumus display.',
  '* Gunakan perintah LaTeX standar seperti \\frac, \\sqrt, \\int, \\sum, \\lim, dan sebagainya.',
  '* Jangan menggunakan \\(...\\) atau \\[...\\].',
  '* Jangan menggunakan HTML maupun Markdown Math selain $...$ dan $$...$$.',
  '* Semua ekspresi matematika harus ditulis dalam LaTeX.',
  '',
  '## Format Output',
  '',
  '* Output hanya berupa Markdown sederhana sehingga dapat langsung disalin.',
  '* Pisahkan setiap soal dengan:',
  '',
  '---',
  '',
  '* Jangan menambahkan penjelasan, pembahasan, atau langkah penyelesaian.',
  '* Jangan menggunakan blok kode tiga backtick.',
  '* Jangan menggunakan writing block.',
  '* Jangan menambahkan kalimat pembuka maupun penutup.',
  '',
  '## Contoh Format',
  '',
  '**Soal 1 (PG)**',
  'Tentukan hasil dari',
  '$$',
  '(3x^2+2x-5)+(2x^2-4x+7).',
  '$$',
  '',
  'A) $5x^2-2x+2$',
  'B) $5x^2+6x+2$',
  'C) $x^2-2x+12$',
  'D) $5x^2+2x-12$',
  'E) $5x^2-2x-12$',
  '',
  'Jawaban: A',
  '',
  '---',
  '',
  '**Soal 2 (Isian)**',
  'Hitung hasil dari',
  '$$',
  '\\frac{x^2-9}{x-3}.',
  '$$',
  '',
  'Jawaban: $x+3$',
  '',
  'Poin: 2',
  '',
  '## Kualitas Soal',
  '',
  '* Soal harus benar secara matematis.',
  '* Tingkat kesulitan bervariasi dari mudah, sedang, hingga sulit.',
  '* Distraktor pada pilihan ganda harus logis.',
  '* Hindari soal yang jawabannya dapat ditebak.',
  '* Gunakan notasi matematika yang rapi dan konsisten.',
  '* Sesuaikan konteks dan tingkat kesulitan dengan materi yang saya berikan.',
  '',
  `Materi ${finalMateri}.`,
].join('\n');
}

function buildAiGeneralPrompt(materi = DEFAULT_AI_GENERAL_MATERI) {
  const finalMateri = String(materi || '').trim() || DEFAULT_AI_GENERAL_MATERI;
  return [
    'Anda adalah guru mata pelajaran sekolah yang ahli dalam menyusun soal.',
    '',
    'Buatkan 10 soal sesuai materi yang saya tentukan dengan ketentuan berikut.',
    '',
    '## Format Soal',
    '',
    '* Nomori soal mulai dari Soal 1 sampai Soal 10.',
    '* Soal 1-8 adalah Pilihan Ganda dengan 5 pilihan jawaban (A-E).',
    '* Soal 9-10 adalah Isian.',
    '* Untuk soal pilihan ganda, tuliskan Jawaban: di bawah pilihan jawaban.',
    '* Untuk soal isian, tuliskan:',
    '  * Jawaban:',
    '  * Poin: 2',
    '',
    '## Format Output',
    '',
    '* Output hanya berupa Markdown sederhana sehingga dapat langsung disalin.',
    '* Pisahkan setiap soal dengan:',
    '',
    '---',
    '',
    '* Jangan menambahkan penjelasan, pembahasan, atau langkah penyelesaian.',
    '* Jangan menggunakan blok kode.',
    '* Jangan menggunakan kalimat pembuka maupun penutup.',
    '',
    '## Contoh Format',
    '',
    '**Soal 1 (PG)**',
    'Perhatikan pernyataan berikut.',
    '',
    'A) Pilihan A',
    'B) Pilihan B',
    'C) Pilihan C',
    'D) Pilihan D',
    'E) Pilihan E',
    '',
    'Jawaban: A',
    '',
    '---',
    '',
    '**Soal 2 (Isian)**',
    'Tuliskan jawaban yang tepat.',
    '',
    'Jawaban: Contoh jawaban',
    '',
    'Poin: 2',
    '',
    '## Kualitas Soal',
    '',
    '* Soal harus benar secara konsep.',
    '* Tingkat kesulitan bervariasi dari mudah, sedang, hingga sulit.',
    '* Distraktor pada pilihan ganda harus logis.',
    '* Hindari soal yang jawabannya dapat ditebak.',
    '* Gunakan bahasa yang ringkas, jelas, dan sesuai tingkat siswa.',
    '* Sesuaikan konteks dan tingkat kesulitan dengan materi yang saya berikan.',
    '',
    `Materi ${finalMateri}.`,
  ].join('\n');
}

function buildAiSciencePrompt(materi = DEFAULT_AI_SCIENCE_MATERI) {
  const finalMateri = String(materi || '').trim() || DEFAULT_AI_SCIENCE_MATERI;
  return [
    'Anda adalah guru IPA/Sains sekolah yang ahli dalam menyusun soal.',
    '',
    'Buatkan 10 soal sesuai materi yang saya tentukan dengan ketentuan berikut.',
    '',
    '## Format Soal',
    '',
    '* Nomori soal mulai dari Soal 1 sampai Soal 10.',
    '* Soal 1-8 adalah Pilihan Ganda dengan 5 pilihan jawaban (A-E).',
    '* Soal 9-10 adalah Isian.',
    '* Untuk soal pilihan ganda, tuliskan Jawaban: di bawah pilihan jawaban.',
    '* Untuk soal isian, tuliskan:',
    '  * Jawaban:',
    '  * Poin: 2',
    '',
    '## Format Penulisan Istilah dan Simbol',
    '',
    '* Gunakan istilah ilmiah yang tepat dan konsisten.',
    '* Gunakan simbol sederhana bila diperlukan, seperti CO2, O2, H2O, NaCl, m/s, °C, cm, dan g.',
    '* Jika ada rumus pendek atau notasi ilmiah sederhana, tuliskan dengan rapi dalam teks biasa atau LaTeX sederhana bila perlu.',
    '* Hindari format tabel atau blok kode.',
    '',
    '## Format Output',
    '',
    '* Output hanya berupa Markdown sederhana sehingga dapat langsung disalin.',
    '* Pisahkan setiap soal dengan:',
    '',
    '---',
    '',
    '* Jangan menambahkan penjelasan, pembahasan, atau langkah penyelesaian.',
    '* Jangan menggunakan blok kode.',
    '* Jangan menggunakan kalimat pembuka maupun penutup.',
    '',
    '## Contoh Format',
    '',
    '**Soal 1 (PG)**',
    'Perhatikan proses pertukaran gas pada manusia.',
    '',
    'A) Oksigen berdifusi dari alveolus ke kapiler darah',
    'B) Karbon dioksida berdifusi dari alveolus ke kapiler darah',
    'C) Oksigen berdifusi dari darah ke alveolus',
    'D) Nitrogen berdifusi dari kapiler ke alveolus',
    'E) Uap air menjadi sumber utama oksigen tubuh',
    '',
    'Jawaban: A',
    '',
    '---',
    '',
    '**Soal 2 (Isian)**',
    'Satuan percepatan dalam SI adalah ....',
    '',
    'Jawaban: m/s^2',
    '',
    'Poin: 2',
    '',
    '## Kualitas Soal',
    '',
    '* Soal harus benar secara konsep ilmiah.',
    '* Tingkat kesulitan bervariasi dari mudah, sedang, hingga sulit.',
    '* Distraktor pada pilihan ganda harus logis.',
    '* Hindari soal yang jawabannya dapat ditebak.',
    '* Gunakan bahasa yang jelas, ringkas, dan sesuai tingkat siswa.',
    '* Sesuaikan konteks dan tingkat kesulitan dengan materi yang saya berikan.',
    '',
    `Materi ${finalMateri}.`,
  ].join('\n');
}

function getAiPresetConfig(preset = DEFAULT_AI_PRESET) {
  if (preset === 'sains') {
    return {
      label: 'Pilih Preset',
      infoTitle: 'AI IPA/Sains',
      stepLabel: 'Copy preset IPA/Sains.',
      defaultMateri: DEFAULT_AI_SCIENCE_MATERI,
      materiPlaceholder: 'Contoh: hukum Newton',
      buildPrompt: buildAiSciencePrompt,
      copyNotif: 'Preset prompt IPA/Sains berhasil disalin.',
    };
  }

  if (preset === 'umum') {
    return {
      label: 'Pilih Preset',
      infoTitle: 'AI Mapel Umum',
      stepLabel: 'Copy preset Mapel Umum.',
      defaultMateri: DEFAULT_AI_GENERAL_MATERI,
      materiPlaceholder: 'Contoh: struktur teks eksplanasi',
      buildPrompt: buildAiGeneralPrompt,
      copyNotif: 'Preset prompt Mapel Umum berhasil disalin.',
    };
  }

  return {
    label: 'Pilih Preset',
    infoTitle: 'AI Matematika',
    stepLabel: 'Copy preset Matematika.',
    defaultMateri: DEFAULT_AI_MATH_MATERI,
    materiPlaceholder: 'Contoh: limit fungsi aljabar',
    buildPrompt: buildAiMathPrompt,
    copyNotif: 'Preset prompt Matematika berhasil disalin.',
  };
}

function renderMathSnippet(text, fallback = '(Soal kosong)') {
  const source = String(text || '').trim();
  if (!source) {
    return fallback;
  }

  const compact = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => `$${String(formula || '').trim()}$`)
    .replace(/\s+/g, ' ')
    .trim();

  return renderMathPreview(compact);
}

function renderMathMultiline(text, fallback = '-') {
  const source = String(text || '').trim();
  if (!source) {
    return fallback;
  }

  return renderMathPreview(source).replace(/\n/g, '<br>');
}

function renderGuruMathBlock(text, options = {}) {
  const {
    tone = 'slate',
    fallback = '-',
    className = '',
  } = options;

  const palette = {
    slate: 'border-slate-200 bg-slate-50/80 text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-800',
    red: 'border-red-200 bg-red-50/80 text-red-700',
    indigo: 'border-indigo-200 bg-indigo-50/80 text-indigo-800',
  };

  const html = String(text || '').trim() ? renderMathMultiline(text) : fallback;
  return `<div class="rounded-2xl border px-3 py-2.5 text-sm leading-6 ${palette[tone] || palette.slate} ${className}">${html}</div>`;
}

function buildSoalLivePreviewHtml(soal = {}) {
  const tipe = soal.tipe || 'pg';
  const poin = Number(soal.poin) || 1;
  const pertanyaan = renderMathPreview(String(soal.pertanyaan || '').trim()) || '<span class="text-slate-400">Pertanyaan akan muncul di sini.</span>';

  const renderAnswerArea = () => {
    if (tipe === 'pg') {
      const opsi = Array.isArray(soal.opsi) ? soal.opsi.filter((item) => String(item || '').trim()) : [];
      return opsi.length
        ? `<div class="space-y-2 text-xs">${opsi.map((opsiText, index) => {
            const letter = String.fromCharCode(65 + index);
            const isCorrect = String(soal.jawaban_benar || '').toUpperCase() === letter;
            return `<div class="rounded-2xl border ${isCorrect ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/70'} px-3 py-2 text-slate-600"><span class="${isCorrect ? 'font-bold text-emerald-600' : ''}">${letter}) ${renderMathPreview(opsiText)}</span></div>`;
          }).join('')}</div>`
        : '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">Opsi jawaban akan muncul setelah diisi.</div>';
    }

    if (tipe === 'bs') {
      return `<div class="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-700">Jawaban: ${String(soal.jawaban_benar || 'benar').toLowerCase() === 'benar' ? '✓ Benar' : '✕ Salah'}</div>`;
    }

    if (tipe === 'isian') {
      return `<div class="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-700">Jawaban: ${renderMathPreview(String(soal.jawaban_benar || '').trim()) || '<span class="text-emerald-500/70">Belum diisi</span>'}</div>`;
    }

    if (tipe === 'menjodohkan') {
      const pasangan = Array.isArray(soal.pasangan) ? soal.pasangan.filter((item) => String(item?.kiri || '').trim() || String(item?.kanan || '').trim()) : [];
      return pasangan.length
        ? `<div class="space-y-2 text-xs">${pasangan.map((pair) => `<div class="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-slate-600">${renderMathPreview(pair.kiri || '')} → ${renderMathPreview(pair.kanan || '')}</div>`).join('')}</div>`
        : '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">Pasangan kiri dan kanan akan muncul di sini.</div>';
    }

    return `<div class="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">Rubrik: ${String(soal.rubrik || '').trim() || '(opsional)'}</div>`;
  };

  return `
    <div class="rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-4">
      <div class="mb-3 flex items-start justify-between gap-3">
        <span class="text-sm font-semibold text-slate-900">Preview Soal</span>
        <span class="text-xs text-slate-500">${poin} poin</span>
      </div>
      <div class="mb-3 text-sm leading-6 text-slate-800">${pertanyaan}</div>
      ${renderAnswerArea()}
    </div>
  `;
}

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────

const db = () => window.firebaseDb || null;

async function fsGet(collection, id) {
  if (!db()) return null;
  try {
    const snap = await db().collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch { return null; }
}

async function fsQuery(collection, filters = [], options = {}) {
  if (!db()) return [];
  try {
    let q = db().collection(collection);
    filters.forEach(({ field, op, value }) => { q = q.where(field, op || '==', value); });
    if (options.orderBy) q = q.orderBy(options.orderBy, options.orderDirection || 'desc');
    if (Number(options.limit) > 0) q = q.limit(Number(options.limit));
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function fsSave(collection, data, id = null) {
  if (!db()) return data;
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

async function fsDelete(collection, id) {
  if (!db()) return;
  try { await db().collection(collection).doc(id).delete(); } catch { /* ignore */ }
}

function sanitizeFirestorePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined)
  );
}

async function saveStrictDocument(collection, payload, id = null) {
  const cleanPayload = sanitizeFirestorePayload(payload);
  const saved = await saveDocument(collection, cleanPayload, id);
  if (!saved) {
    throw new Error(`Gagal menyimpan dokumen ${collection}.`);
  }
  return saved;
}

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────

async function loadPaket(force = false) {
  const local = readLocal(LS_PAKET).filter((p) => p.guru_id === state.guruId);
  if (!db()) { state.paketList = local; return; }
  // Optimasi read: lewati query bila data masih segar (kecuali dipaksa refresh).
  if (!force && state.loadedForGuru === state.guruId && state.paketLoadedAt && (Date.now() - state.paketLoadedAt) < PAKET_SESI_CACHE_TTL_MS) {
    return;
  }
  try {
    const remote = await fsQuery(COLLECTION_PAKET, [{ field: 'guru_id', value: state.guruId }]);
    const merged = mergeById(remote, local);
    writeLocal(LS_PAKET, merged);
    state.paketList = merged.filter((p) => p.guru_id === state.guruId);
    state.paketLoadedAt = Date.now();
    state.loadedForGuru = state.guruId;
  } catch {
    state.paketList = local;
  }
}

async function loadSesi(force = false) {
  const local = readLocal(LS_SESI).filter((s) => s.guru_id === state.guruId);
  if (!db()) { state.sesiList = local; return; }
  // Optimasi read: lewati query bila data masih segar (kecuali dipaksa refresh).
  if (!force && state.loadedForGuru === state.guruId && state.sesiLoadedAt && (Date.now() - state.sesiLoadedAt) < PAKET_SESI_CACHE_TTL_MS) {
    return;
  }
  try {
    const remote = await fsQuery(COLLECTION_SESI, [{ field: 'guru_id', value: state.guruId }]);
    const merged = mergeById(remote, local);
    writeLocal(LS_SESI, merged);
    state.sesiList = merged.filter((s) => s.guru_id === state.guruId);
    state.sesiLoadedAt = Date.now();
    state.loadedForGuru = state.guruId;
  } catch {
    state.sesiList = local;
  }
}

async function loadJawabanForSesi(sesiId) {
  if (state.jawabanCache[sesiId]) return state.jawabanCache[sesiId];
  if (!db()) { state.jawabanCache[sesiId] = []; return []; }
  try {
    const docs = await fsQuery(COLLECTION_JAWABAN, [{ field: 'sesi_id', value: sesiId }]);
    state.jawabanCache[sesiId] = docs;
    return docs;
  } catch { return []; }
}

function mergeById(primary, secondary) {
  const map = new Map();
  [...secondary, ...primary].forEach((item) => {
    if (item?.id) map.set(item.id, { ...map.get(item.id), ...item });
  });
  return Array.from(map.values());
}

// ─── SAVE / DELETE ACTIONS ────────────────────────────────────────────────────

function upsertStateList(listKey, saved) {
  if (!saved?.id) return;
  const list = state[listKey];
  const index = list.findIndex((item) => item.id === saved.id);
  if (index >= 0) list[index] = { ...list[index], ...saved };
  else list.push(saved);
}

async function savePaket(data) {
  const now = new Date().toISOString();
  const payload = { ...data, guru_id: state.guruId, guru_nama: state.guruNama, updated_at: now };
  if (!payload.created_at) payload.created_at = now;
  const saved = await fsSave(COLLECTION_PAKET, payload, payload.id);
  upsertLocal(LS_PAKET, saved);
  // Optimasi read: perbarui state di memori alih-alih membaca ulang seluruh
  // koleksi paket dari Firestore setiap kali menyimpan.
  upsertStateList('paketList', saved);
  state.paketLoadedAt = Date.now();
}

async function removePaket(paketId) {
  await fsDelete(COLLECTION_PAKET, paketId);
  deleteLocal(LS_PAKET, paketId);
  state.paketList = state.paketList.filter((p) => p.id !== paketId);
}

async function saveSesi(data) {
  const now = new Date().toISOString();
  const payload = { ...data, guru_id: state.guruId, guru_nama: state.guruNama, updated_at: now };
  if (!payload.created_at) payload.created_at = now;
  const saved = await fsSave(COLLECTION_SESI, payload, payload.id);
  upsertLocal(LS_SESI, saved);
  // Optimasi read: perbarui state di memori alih-alih membaca ulang seluruh
  // koleksi sesi dari Firestore setiap kali menyimpan.
  upsertStateList('sesiList', saved);
  state.sesiLoadedAt = Date.now();
}

async function removeSesi(sesiId) {
  const sesi = state.sesiList.find((item) => item.id === sesiId);
  if (sesi && !['selesai', 'diarsipkan'].includes(sesi.status)) {
    throw new Error('Sesi hanya bisa dihapus setelah selesai atau diarsipkan.');
  }

  const jawabanList = await loadJawabanForSesi(sesiId);
  await Promise.all(jawabanList.map((item) => fsDelete(COLLECTION_JAWABAN, item.id)));
  await fsDelete(COLLECTION_KUIZ_NILAI_FINAL, `kuiz_nilai_${sesiId}`);
  await fsDelete(COLLECTION_SESI, sesiId);
  writeLocal(LS_JAWABAN, readLocal(LS_JAWABAN).filter((item) => item.sesi_id !== sesiId));
  deleteLocal(LS_SESI, sesiId);
  delete state.jawabanCache[sesiId];
  state.sesiList = state.sesiList.filter((s) => s.id !== sesiId);
  if (state.hasilSesiId === sesiId) state.hasilSesiId = null;
  if (state.monitorSesiId === sesiId) state.monitorSesiId = null;
}

async function changeSesiStatus(sesiId, newStatus) {
  const sesi = state.sesiList.find((s) => s.id === sesiId);
  if (!sesi) return;
  const paket = state.paketList.find((p) => p.id === sesi.paket_id);
  const updated = {
    ...sesi,
    status: newStatus,
    paket_judul: paket?.judul || sesi.paket_judul || '',
    acak_soal: paket?.acak_soal ?? sesi.acak_soal ?? false,
    acak_opsi: paket?.acak_opsi ?? sesi.acak_opsi ?? false,
    soal_snapshot: Array.isArray(paket?.soal) ? paket.soal : (sesi.soal_snapshot || []),
    updated_at: new Date().toISOString(),
  };
  await fsSave(COLLECTION_SESI, updated, sesiId);
  upsertLocal(LS_SESI, updated);
  state.sesiList = state.sesiList.map((s) => s.id === sesiId ? updated : s);
}

async function changeSesiGroupStatus(eventGroupId, newStatus, allowedStatuses = null) {
  const groupSessions = state.sesiList.filter((item) => item.event_group_id === eventGroupId);
  if (!groupSessions.length) return 0;
  const eligible = groupSessions.filter((item) => {
    if (item.status === newStatus) return false;
    if (Array.isArray(allowedStatuses) && allowedStatuses.length) {
      return allowedStatuses.includes(item.status);
    }
    return true;
  });
  await Promise.all(eligible.map((item) => changeSesiStatus(item.id, newStatus)));
  return eligible.length;
}

async function updateSesiGroupDraft(eventGroupId, changes) {
  const groupSessions = state.sesiList.filter((item) => item.event_group_id === eventGroupId && item.status === 'draft');
  if (!groupSessions.length) return 0;
  const now = new Date().toISOString();
  const nextSessions = groupSessions.map((item) => ({
    ...item,
    ...changes,
    updated_at: now,
  }));
  await Promise.all(nextSessions.map((item) => fsSave(COLLECTION_SESI, item, item.id)));
  nextSessions.forEach((item) => upsertLocal(LS_SESI, item));
  state.sesiList = state.sesiList.map((item) => nextSessions.find((updated) => updated.id === item.id) || item);
  return nextSessions.length;
}

async function removeSesiGroup(eventGroupId) {
  const groupSessions = state.sesiList.filter((item) => item.event_group_id === eventGroupId);
  if (!groupSessions.length) return 0;
  const blocked = groupSessions.find((item) => !['selesai', 'diarsipkan'].includes(item.status));
  if (blocked) {
    throw new Error('Batch hanya bisa dihapus jika semua sesi sudah selesai atau diarsipkan.');
  }
  await Promise.all(groupSessions.map((item) => removeSesi(item.id)));
  return groupSessions.length;
}

async function saveEssayGrading(jawabanId, nilaiManual, komentar, sesiId, paket) {
  if (!db()) return;
  try {
    const jawabanDoc = (await loadJawabanForSesi(sesiId)).find((j) => j.id === jawabanId);
    const { nilaiAkhir, total, maxTotal } = hitungSkorJawaban(paket, jawabanDoc?.jawaban || {}, nilaiManual);

    await db().collection(COLLECTION_JAWABAN).doc(jawabanId).set({
      nilai_manual: nilaiManual,
      komentar_guru: komentar,
      essay_graded: true,
      graded_at: new Date().toISOString(),
      nilai_akhir: nilaiAkhir,
      skor: total,
      skor_max: maxTotal,
    }, { merge: true });
    delete state.jawabanCache[sesiId];
    if (state.hasilSesiId && state.hasilSesiId !== sesiId) delete state.jawabanCache[state.hasilSesiId];
  } catch (e) {
    console.warn('saveEssayGrading error', e);
  }
}

async function resetPelanggaranSiswa(sesiId, jawabanId) {
  const sesi = state.sesiList.find((item) => item.id === sesiId);
  const jawabanList = await loadJawabanForSesi(sesiId);
  const jawaban = jawabanList.find((item) => item.id === jawabanId);
  if (!jawaban || !sesi) return false;

  const updated = {
    ...jawaban,
    submitted_at: null,
    submitted_by_security: false,
    pelanggaran_count: 0,
    pelanggaran_log: [],
    last_violation_at: null,
    last_violation_type: null,
    toleransi_pelanggaran: Number(sesi.toleransi_pelanggaran || jawaban.toleransi_pelanggaran || 0),
    reset_count: Number(jawaban.reset_count || 0) + 1,
    started_at: new Date().toISOString(),
    essay_graded: false,
  };

  await fsSave(COLLECTION_JAWABAN, updated, jawabanId);
  delete state.jawabanCache[sesiId];
  return true;
}

function normalizeImportKey(text, fallback = 'item') {
  const raw = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return raw || fallback;
}

function getDefaultKuizImportLabel(sesi, paket) {
  return String(paket?.judul || sesi?.paket_judul || 'Kuis').trim() || 'Kuis';
}

function getDefaultKuizBabName() {
  return 'Nilai Kuis';
}

function resolveAssignmentForSesi(sesi) {
  if (!sesi) return null;
  return state.assignments.find((assignment) => assignment.id === sesi.assignment_id)
    || state.assignments.find((assignment) => assignment.kelas_id === sesi.kelas_id && assignment.mapel_id === sesi.mapel_id)
    || null;
}

async function buildKuizNilaiPayload(sesiId) {
  const sesi = state.sesiList.find((s) => s.id === sesiId);
  if (!sesi) return null;
  const jawaban = await loadJawabanForSesi(sesiId);
  const paket = state.paketList.find((p) => p.id === sesi.paket_id);
  if (!paket) return null;
  const assignment = resolveAssignmentForSesi(sesi);

  const nilaiData = jawaban
    .filter((j) => j.submitted_at)
    .map((j) => {
      const { nilaiAkhir } = hitungSkorJawaban(paket, j.jawaban || {}, j.nilai_manual || {});
      return { siswa_id: j.siswa_id, siswa_nama: j.siswa_nama, nilai: nilaiAkhir };
    });

  const payload = {
    id: `kuiz_nilai_${sesiId}`,
    sesi_id: sesiId,
    assignment_id: assignment?.id || sesi.assignment_id || '',
    paket_judul: paket.judul,
    kelas_id: sesi.kelas_id,
    mapel_id: paket.mapel_id,
    mapel_nama: paket.mapel_nama,
    guru_id: state.guruId,
    tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
    semester_id: state.context?.semester_aktif,
    nilai_list: nilaiData,
    created_at: new Date().toISOString(),
  };

  return {
    sesi,
    paket,
    assignment,
    jawaban,
    nilaiData,
    payload,
  };
}

async function loadPenilaianTargets(assignment) {
  if (!assignment) {
    return { babs: [], tugasMap: {}, uhColumns: [] };
  }

  const baseFilters = [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
  ];

  const [babs, tugasDocs, uhColumns] = await Promise.all([
    fsQuery(COLLECTION_BAB, baseFilters),
    fsQuery(COLLECTION_TUGAS_BAB, baseFilters),
    fsQuery(COLLECTION_UH_KOLOM, baseFilters),
  ]);

  const normalizedBabs = [...babs].sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0));
  const tugasMap = tugasDocs.reduce((acc, item) => {
    const babId = item.bab_id || item.id;
    if (!acc[babId]) acc[babId] = [];
    acc[babId].push(item);
    acc[babId].sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0));
    return acc;
  }, {});
  const normalizedUhColumns = [...uhColumns].sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0));

  return {
    babs: normalizedBabs,
    tugasMap,
    uhColumns: normalizedUhColumns,
  };
}

async function loadKuizSyncHistory(sesiId) {
  const docs = await fsQuery(COLLECTION_KUIZ_NILAI_FINAL, [{ field: 'sesi_id', value: sesiId }]);
  const snapshot = docs[0];
  if (!snapshot) return [];

  const history = Array.isArray(snapshot.sync_history) ? snapshot.sync_history : [];
  if (history.length) {
    return history
      .sort((a, b) => new Date(b.synced_at || b.created_at || 0) - new Date(a.synced_at || a.created_at || 0))
      .slice(0, 5);
  }

  if (snapshot.last_sync_at || snapshot.last_sync_summary) {
    return [{
      synced_at: snapshot.last_sync_at || snapshot.updated_at || snapshot.created_at,
      overwrite_mode: 'skip',
      destinations: snapshot.last_sync_destinations || [],
      summary: snapshot.last_sync_summary || {},
    }];
  }

  return [];
}

function renderKuizSyncHistory(history = []) {
  if (!history.length) {
    return '<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Belum ada riwayat kirim nilai dari sesi ini.</div>';
  }

  return `
    <div class="space-y-2">
      ${history.map((item) => {
        const tujuan = Array.isArray(item.destinations) && item.destinations.length ? item.destinations.join(', ').toUpperCase() : '-';
        const detail = Object.entries(item.summary || {})
          .map(([key, value]) => `${key.toUpperCase()}: ${value.saved || 0} tersimpan${value.skipped ? `, ${value.skipped} dilewati` : ''}`)
          .join(' • ');
        return `
          <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-semibold text-slate-800">${tujuan}</p>
              <span class="text-xs text-slate-400">${formatDateTime(item.synced_at || item.created_at)}</span>
            </div>
            <p class="mt-1 text-xs text-slate-500">Mode: ${item.overwrite_mode === 'replace' ? 'Timpa nilai lama' : 'Lewati nilai yang sudah ada'}</p>
            <p class="mt-1 text-xs text-slate-600">${detail || 'Tidak ada detail.'}</p>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildKirimPenilaianForm(model) {
  const { paket, sesi, assignment, nilaiData, targets, history } = model;
  const defaultLabel = getDefaultKuizImportLabel(sesi, paket);
  const babOptions = targets.babs.map((bab) => `<option value="${bab.bab_id || bab.id}">${bab.bab_nama || bab.nama || 'BAB'}</option>`).join('');
  const uhOptions = targets.uhColumns.map((col) => `<option value="${col.uh_id || col.id}">${col.uh_nama || col.nama || 'UH'}</option>`).join('');
  const firstBabId = targets.babs[0]?.bab_id || targets.babs[0]?.id || '__new__';
  const firstBabTasks = firstBabId !== '__new__' ? (targets.tugasMap[firstBabId] || []) : [];
  const tugasOptions = firstBabTasks.map((task) => `<option value="${task.tugas_id || task.id}">${task.tugas_nama || task.nama || 'Tugas'}</option>`).join('');

  return `
    <form id="form-kirim-penilaian" class="space-y-4" data-tugas-map="${encodeURIComponent(JSON.stringify(targets.tugasMap || {}))}">
      <div class="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Paket Ujian</p>
            <p class="mt-0.5 text-sm font-semibold text-slate-900">${paket?.judul || '-'}</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kelas</p>
            <p class="mt-0.5 text-sm font-semibold text-slate-900">${sesi?.kelas_nama || '-'}</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Nilai Siap Kirim</p>
            <p class="mt-0.5 text-sm font-semibold text-slate-900">${nilaiData.length} siswa</p>
          </div>
        </div>
        <p class="mt-2 text-xs text-slate-500">Pengajaran: ${assignment?.kelas_nama || sesi?.kelas_nama || '-'} • ${assignment?.mapel_nama || paket?.mapel_nama || '-'}</p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">Tujuan Kirim Nilai</p>
            <p class="text-xs text-slate-500 mt-0.5">Pilih satu atau beberapa format penilaian.</p>
          </div>
          <select name="overwrite_mode" id="sync-overwrite-mode" class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
            <option value="skip">Lewati nilai yang sudah ada</option>
            <option value="replace">Timpa nilai lama</option>
          </select>
        </div>

        <div class="mt-3 grid gap-2.5">
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/40 transition">
            <input type="checkbox" name="destinations" value="tugas" class="mt-0.5 h-4 w-4 rounded accent-indigo-600">
            <div class="flex-1">
              <p class="text-sm font-semibold text-slate-900">Nilai Tugas</p>
              <p class="text-[11px] text-slate-500 leading-relaxed">Masuk ke tab Nilai Tugas. Sistem bisa membuat BAB dan tugas ujian otomatis bila belum ada.</p>
            </div>
          </label>

          <div id="sync-section-tugas" class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <div class="grid gap-2.5 sm:grid-cols-2">
              <label class="block text-xs text-slate-700">
                <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">BAB Tujuan</span>
                <select name="tugas_bab_id" id="sync-tugas-bab-id" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                  <option value="__new__">Buat / pakai BAB "${getDefaultKuizBabName()}"</option>
                  ${babOptions}
                </select>
              </label>
              <label class="block text-xs text-slate-700">
                <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nama BAB Baru</span>
                <input type="text" name="tugas_bab_name" id="sync-tugas-bab-name" value="${getDefaultKuizBabName()}" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              </label>
              <label class="block text-xs text-slate-700 sm:col-span-2">
                <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tugas Yang Sudah Ada</span>
                <select name="tugas_existing_id" id="sync-tugas-existing-id" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                  <option value="__new__">Buat tugas baru</option>
                  ${tugasOptions}
                </select>
              </label>
              <label class="block text-xs text-slate-700 sm:col-span-2">
                <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nama Tugas / Kolom Nilai</span>
                <input type="text" name="tugas_name" id="sync-tugas-name" value="${defaultLabel}" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              </label>
            </div>
          </div>

          <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 cursor-pointer hover:border-sky-200 hover:bg-sky-50/40 transition">
            <input type="checkbox" name="destinations" value="uh" class="mt-0.5 h-4 w-4 rounded accent-sky-600">
            <div class="flex-1">
              <p class="text-sm font-semibold text-slate-900">Ulangan Harian</p>
              <p class="text-[11px] text-slate-500 leading-relaxed">Masuk ke tab UH dan terbaca sebagai nilai murni pada kolom yang dipilih.</p>
            </div>
          </label>

          <div id="sync-section-uh" class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <div class="grid gap-2.5 sm:grid-cols-2">
              <label class="block text-xs text-slate-700">
                <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Kolom UH</span>
                <select name="uh_column_id" id="sync-uh-column-id" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                  <option value="__new__">Buat kolom UH baru</option>
                  ${uhOptions}
                </select>
              </label>
              <label class="block text-xs text-slate-700">
                <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nama Kolom Baru</span>
                <input type="text" name="uh_column_name" id="sync-uh-column-name" value="${defaultLabel}" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              </label>
            </div>
          </div>

          <label class="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 cursor-pointer hover:border-violet-200 hover:bg-violet-50/40 transition">
            <input type="checkbox" name="destinations" value="pts" class="mt-0.5 h-4 w-4 rounded accent-violet-600">
            <div class="flex-1">
              <p class="text-sm font-semibold text-slate-900">PTS</p>
              <p class="text-[11px] text-slate-500 leading-relaxed">Mengisi kolom PTS bagian nilai murni. Cocok jika ujian ini diperlakukan sebagai tes PTS.</p>
            </div>
          </label>

          <div id="sync-section-pts" class="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <label class="block text-xs text-slate-700">
              <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Slot Nilai PTS</span>
              <select name="pts_tipe" id="sync-pts-tipe" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                <option value="murni">PTS Murni</option>
                <option value="remidi">PTS Remidi</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">Riwayat Kirim</p>
            <p class="text-xs text-slate-500 mt-0.5">5 impor terakhir dari sesi ini.</p>
          </div>
        </div>
        <div class="mt-3">${renderKuizSyncHistory(history)}</div>
      </div>

      <div class="flex flex-wrap justify-end gap-2.5">
        <button type="button" id="btn-sync-cancel" class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Batal</button>
        <button type="submit" id="btn-sync-submit" class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition">
          <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          Kirim ke Penilaian
        </button>
      </div>
    </form>
  `;
}

async function ensureImportBab(assignment, babId, babName) {
  const allBabs = await fsQuery(COLLECTION_BAB, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
  ]);

  if (babId && babId !== '__new__') {
    const existing = allBabs.find((item) => (item.bab_id || item.id) === babId);
    if (existing) return existing;
  }

  const finalName = String(babName || getDefaultKuizBabName()).trim() || getDefaultKuizBabName();
  const existingByName = allBabs.find((item) => String(item.bab_nama || item.nama || '').trim().toLowerCase() === finalName.toLowerCase());
  if (existingByName) return existingByName;

  const nextOrder = allBabs.reduce((max, item) => Math.max(max, Number(item.urutan || 0)), 0) + 1;
  const finalId = `bab_${assignment.id}_${normalizeImportKey(finalName, 'kuiz')}`;
  const payload = {
    id: finalId,
    bab_id: finalId,
    nama: finalName,
    bab_nama: finalName,
    urutan: nextOrder,
    pengajaran_id: assignment.id,
    guru_id: state.guruId,
    kelas_id: assignment.kelas_id,
    mapel_id: assignment.mapel_id,
    tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
    semester_id: state.context?.semester_aktif,
    created_at: new Date().toISOString(),
  };
  await saveStrictDocument(COLLECTION_BAB, payload, finalId);
  return payload;
}

async function ensureImportTugas(assignment, babId, tugasName) {
  const docs = await fsQuery(COLLECTION_TUGAS_BAB, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
  ]);
  const finalBabId = babId;
  const finalName = String(tugasName || getDefaultKuizBabName()).trim() || getDefaultKuizBabName();
  const existing = docs.find((item) => (item.bab_id === finalBabId) && String(item.tugas_nama || item.nama || '').trim().toLowerCase() === finalName.toLowerCase());
  if (existing) return existing;

  const tugasInBab = docs.filter((item) => item.bab_id === finalBabId);
  const nextOrder = tugasInBab.reduce((max, item) => Math.max(max, Number(item.urutan || 0)), 0) + 1;
  const finalId = `tugas_${assignment.id}_${normalizeImportKey(finalBabId, 'bab')}_${normalizeImportKey(finalName, 'kuiz')}`;
  const payload = {
    id: finalId,
    tugas_id: finalId,
    nama: finalName,
    tugas_nama: finalName,
    bab_id: finalBabId,
    urutan: nextOrder,
    pengajaran_id: assignment.id,
    guru_id: state.guruId,
    kelas_id: assignment.kelas_id,
    mapel_id: assignment.mapel_id,
    tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
    semester_id: state.context?.semester_aktif,
    created_at: new Date().toISOString(),
  };
  await saveStrictDocument(COLLECTION_TUGAS_BAB, payload, finalId);
  return payload;
}

async function getExistingImportTugas(assignment, babId, tugasId) {
  if (!assignment || !babId || !tugasId || tugasId === '__new__') return null;
  const docs = await fsQuery(COLLECTION_TUGAS_BAB, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
  ]);
  return docs.find((item) => (item.bab_id === babId) && ((item.tugas_id || item.id) === tugasId)) || null;
}

async function ensureImportUhColumn(assignment, columnId, columnName) {
  const docs = await fsQuery(COLLECTION_UH_KOLOM, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
  ]);

  if (columnId && columnId !== '__new__') {
    const existingById = docs.find((item) => (item.uh_id || item.id) === columnId);
    if (existingById) return existingById;
  }

  const finalName = String(columnName || 'UH Kuis').trim() || 'UH Kuis';
  const existingByName = docs.find((item) => String(item.uh_nama || item.nama || '').trim().toLowerCase() === finalName.toLowerCase());
  if (existingByName) return existingByName;

  const nextOrder = docs.reduce((max, item) => Math.max(max, Number(item.urutan || 0)), 0) + 1;
  const uhId = `uh_${normalizeImportKey(finalName, 'kuiz')}`;
  const docId = `${assignment.id}_${uhId}`;
  const payload = {
    id: docId,
    uh_id: uhId,
    nama: finalName,
    uh_nama: finalName,
    urutan: nextOrder,
    pengajaran_id: assignment.id,
    guru_id: state.guruId,
    kelas_id: assignment.kelas_id,
    mapel_id: assignment.mapel_id,
    tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
    semester_id: state.context?.semester_aktif,
    created_at: new Date().toISOString(),
  };
  await saveStrictDocument(COLLECTION_UH_KOLOM, payload, docId);
  return payload;
}

function shouldWriteImportedNilai(existingValue, overwriteMode) {
  if (overwriteMode === 'replace') return true;
  return existingValue === undefined || existingValue === null || existingValue === '';
}

function normalizeStudentIdentity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

async function resolveNilaiImportRows(snapshot) {
  const members = await getClassMembers(state.context, snapshot.sesi.kelas_id);
  const memberById = new Map();
  const memberByName = new Map();

  members.forEach((member) => {
    const idKey = normalizeStudentIdentity(member.siswa_id || member.id);
    const nameKey = normalizeStudentIdentity(member.siswa_nama || member.nama);
    if (idKey) memberById.set(idKey, member);
    if (nameKey && !memberByName.has(nameKey)) memberByName.set(nameKey, member);
  });

  return snapshot.nilaiData.map((item) => {
    const directMatch = memberById.get(normalizeStudentIdentity(item.siswa_id));
    const nameMatch = memberByName.get(normalizeStudentIdentity(item.siswa_nama));
    const targetMember = directMatch || nameMatch || null;
    return {
      ...item,
      source_siswa_id: item.siswa_id,
      siswa_id: targetMember?.siswa_id || targetMember?.id || item.siswa_id,
      siswa_nama: targetMember?.siswa_nama || targetMember?.nama || item.siswa_nama,
      rosterMatched: Boolean(targetMember),
    };
  });
}

async function syncKuizToNilaiTugas(snapshot, config) {
  const { assignment } = snapshot;
  const nilaiRows = await resolveNilaiImportRows(snapshot);
  const bab = await ensureImportBab(assignment, config.babId, config.babName);
  const existingTugas = await getExistingImportTugas(assignment, bab.bab_id || bab.id, config.tugasId);
  const tugas = existingTugas || await ensureImportTugas(assignment, bab.bab_id || bab.id, config.tugasName);
  const existingDocs = await fsQuery(COLLECTION_NILAI_TUGAS, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
    { field: 'bab_id', value: bab.bab_id || bab.id },
    { field: 'tugas_id', value: tugas.tugas_id || tugas.id },
  ]);
  const existingMap = new Map(existingDocs.map((item) => [item.siswa_id, item.nilai]));
  let saved = 0;
  let skipped = 0;

  for (const item of nilaiRows) {
    if (!shouldWriteImportedNilai(existingMap.get(item.siswa_id), config.overwriteMode)) {
      skipped += 1;
      continue;
    }
    const docId = `${assignment.id}_${bab.bab_id || bab.id}_${tugas.tugas_id || tugas.id}_${item.siswa_id}`;
    await saveStrictDocument(COLLECTION_NILAI_TUGAS, {
      tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
      semester_id: state.context?.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: state.guruId,
      kelas_id: assignment.kelas_id,
      mapel_id: assignment.mapel_id,
      siswa_id: item.siswa_id,
      bab_id: bab.bab_id || bab.id,
      tugas_id: tugas.tugas_id || tugas.id,
      nilai: Number(item.nilai || 0),
      sumber_nilai: 'kuiz',
      sumber_sesi_id: snapshot.sesi.id,
      sumber_paket_id: snapshot.paket.id,
      sumber_paket_judul: snapshot.paket.judul,
      imported_from_kuiz: true,
      imported_at: new Date().toISOString(),
    }, docId);
    saved += 1;
  }

  return {
    saved,
    skipped,
    target_label: `${bab.bab_nama || bab.nama || 'BAB'} / ${tugas.tugas_nama || tugas.nama || 'Tugas'}`,
  };
}

async function syncKuizToUh(snapshot, config) {
  const { assignment } = snapshot;
  const nilaiRows = await resolveNilaiImportRows(snapshot);
  const column = await ensureImportUhColumn(assignment, config.columnId, config.columnName);
  const columnId = column.uh_id || column.id;
  const existingDocs = await fsQuery(COLLECTION_NILAI_UJIAN, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
    { field: 'jenis_nilai', value: 'ulangan_harian' },
  ]);
  const existingMap = new Map(existingDocs.map((item) => [`${item.siswa_id}_${item.tipe || ''}`, item.nilai]));
  let saved = 0;
  let skipped = 0;

  for (const item of nilaiRows) {
    const tipe = `${columnId}_murni`;
    if (!shouldWriteImportedNilai(existingMap.get(`${item.siswa_id}_${tipe}`), config.overwriteMode)) {
      skipped += 1;
      continue;
    }
    const docId = `${assignment.id}_${item.siswa_id}_ulangan_harian_${tipe}`;
    await saveStrictDocument(COLLECTION_NILAI_UJIAN, {
      tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
      semester_id: state.context?.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: state.guruId,
      kelas_id: assignment.kelas_id,
      mapel_id: assignment.mapel_id,
      siswa_id: item.siswa_id,
      jenis_nilai: 'ulangan_harian',
      tipe,
      nilai: Number(item.nilai || 0),
      sumber_nilai: 'kuiz',
      sumber_sesi_id: snapshot.sesi.id,
      sumber_paket_id: snapshot.paket.id,
      sumber_paket_judul: snapshot.paket.judul,
      imported_from_kuiz: true,
      imported_at: new Date().toISOString(),
    }, docId);
    saved += 1;
  }

  return {
    saved,
    skipped,
    target_label: column.uh_nama || column.nama || 'UH',
  };
}

async function syncKuizToPts(snapshot, config) {
  const { assignment } = snapshot;
  const nilaiRows = await resolveNilaiImportRows(snapshot);
  const existingDocs = await fsQuery(COLLECTION_NILAI_UJIAN, [
    { field: 'tahun_ajaran_id', value: state.context?.tahun_ajaran_aktif },
    { field: 'semester_id', value: state.context?.semester_aktif },
    { field: 'pengajaran_id', value: assignment.id },
    { field: 'jenis_nilai', value: 'pts' },
  ]);
  const existingMap = new Map(existingDocs.map((item) => [`${item.siswa_id}_${item.tipe || 'murni'}`, item.nilai]));
  let saved = 0;
  let skipped = 0;
  const tipe = config.tipe === 'remidi' ? 'remidi' : 'murni';

  for (const item of nilaiRows) {
    if (!shouldWriteImportedNilai(existingMap.get(`${item.siswa_id}_${tipe}`) ?? existingMap.get(`${item.siswa_id}_`), config.overwriteMode)) {
      skipped += 1;
      continue;
    }
    const docId = `${assignment.id}_${item.siswa_id}_pts_${tipe}`;
    await saveStrictDocument(COLLECTION_NILAI_UJIAN, {
      tahun_ajaran_id: state.context?.tahun_ajaran_aktif,
      semester_id: state.context?.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: state.guruId,
      kelas_id: assignment.kelas_id,
      mapel_id: assignment.mapel_id,
      siswa_id: item.siswa_id,
      jenis_nilai: 'pts',
      tipe,
      nilai: Number(item.nilai || 0),
      sumber_nilai: 'kuiz',
      sumber_sesi_id: snapshot.sesi.id,
      sumber_paket_id: snapshot.paket.id,
      sumber_paket_judul: snapshot.paket.judul,
      imported_from_kuiz: true,
      imported_at: new Date().toISOString(),
    }, docId);
    saved += 1;
  }

  return {
    saved,
    skipped,
    target_label: `PTS / ${tipe === 'remidi' ? 'Remidi' : 'Murni'}`,
  };
}

async function kirimKePenilaian(sesiId, config = {}) {
  if (!db()) throw new Error('Koneksi database tidak tersedia.');
  const snapshot = await buildKuizNilaiPayload(sesiId);
  if (!snapshot?.sesi || !snapshot?.paket) throw new Error('Data sesi atau paket tidak ditemukan.');
  if (!snapshot.assignment) throw new Error('Pengajaran tujuan tidak ditemukan untuk sesi ini.');
  if (!snapshot.nilaiData.length) throw new Error('Belum ada nilai submit yang bisa dikirim.');

  await saveStrictDocument(COLLECTION_KUIZ_NILAI_FINAL, snapshot.payload, snapshot.payload.id);

  const destinations = Array.isArray(config.destinations) ? config.destinations.filter(Boolean) : [];
  if (!destinations.length) throw new Error('Pilih minimal satu tujuan kirim nilai.');

  const summary = {};

  if (destinations.includes('tugas')) {
    summary.tugas = await syncKuizToNilaiTugas(snapshot, {
      overwriteMode: config.overwriteMode,
      babId: config.tugas?.babId,
      babName: config.tugas?.babName,
      tugasId: config.tugas?.tugasId,
      tugasName: config.tugas?.tugasName,
    });
  }

  if (destinations.includes('uh')) {
    summary.uh = await syncKuizToUh(snapshot, {
      overwriteMode: config.overwriteMode,
      columnId: config.uh?.columnId,
      columnName: config.uh?.columnName,
    });
  }

  if (destinations.includes('pts')) {
    summary.pts = await syncKuizToPts(snapshot, {
      overwriteMode: config.overwriteMode,
      tipe: config.pts?.tipe,
    });
  }

  const logPayload = {
    id: generateId('kuiz_sync'),
    sesi_id: snapshot.sesi.id,
    snapshot_id: snapshot.payload.id,
    assignment_id: snapshot.assignment.id,
    paket_id: snapshot.paket.id,
    paket_judul: snapshot.paket.judul,
    kelas_id: snapshot.sesi.kelas_id,
    kelas_nama: snapshot.sesi.kelas_nama,
    overwrite_mode: config.overwriteMode,
    destinations,
    summary,
    synced_at: new Date().toISOString(),
  };
  const previousHistory = Array.isArray(snapshot.payload.sync_history) ? snapshot.payload.sync_history : [];
  const nextHistory = [logPayload, ...previousHistory]
    .sort((a, b) => new Date(b.synced_at || b.created_at || 0) - new Date(a.synced_at || a.created_at || 0))
    .slice(0, 5);
  await saveStrictDocument(COLLECTION_KUIZ_NILAI_FINAL, {
    ...snapshot.payload,
    last_sync_at: logPayload.synced_at,
    last_sync_destinations: destinations,
    last_sync_summary: summary,
    sync_history: nextHistory,
  }, snapshot.payload.id);

  return {
    total: snapshot.nilaiData.length,
    summary,
    destinations,
  };
}

async function openModalKirimKePenilaian(sesiId) {
  const snapshot = await buildKuizNilaiPayload(sesiId);
  if (!snapshot?.sesi || !snapshot?.paket) {
    showNotif('Data sesi atau paket tidak ditemukan.', 'error');
    return;
  }
  if (!snapshot.assignment) {
    showNotif('Pengajaran tujuan untuk sesi ini tidak ditemukan.', 'error');
    return;
  }
  const [targets, history] = await Promise.all([
    loadPenilaianTargets(snapshot.assignment),
    loadKuizSyncHistory(sesiId),
  ]);

  showModal(buildKirimPenilaianForm({
    ...snapshot,
    targets,
    history,
  }), { title: 'Kirim Nilai ke Penilaian', wide: true });

  const form = document.getElementById('form-kirim-penilaian');
  const cancelBtn = document.getElementById('btn-sync-cancel');
  const tugasSection = document.getElementById('sync-section-tugas');
  const uhSection = document.getElementById('sync-section-uh');
  const ptsSection = document.getElementById('sync-section-pts');
  const babSelect = document.getElementById('sync-tugas-bab-id');
  const babNameInput = document.getElementById('sync-tugas-bab-name');
  const tugasSelect = document.getElementById('sync-tugas-existing-id');
  const tugasNameInput = document.getElementById('sync-tugas-name');
  const uhSelect = document.getElementById('sync-uh-column-id');
  const uhNameInput = document.getElementById('sync-uh-column-name');
  const tugasMap = JSON.parse(decodeURIComponent(form.dataset.tugasMap || '%7B%7D'));

  const syncSectionState = () => {
    const checked = new Set(Array.from(form.querySelectorAll('input[name="destinations"]:checked')).map((input) => input.value));
    tugasSection.style.display = checked.has('tugas') ? '' : 'none';
    uhSection.style.display = checked.has('uh') ? '' : 'none';
    ptsSection.style.display = checked.has('pts') ? '' : 'none';
  };

  const renderTugasOptions = () => {
    const selectedBabId = babSelect.value;
    const tugasItems = selectedBabId && selectedBabId !== '__new__' ? (tugasMap[selectedBabId] || []) : [];
    tugasSelect.innerHTML = ['<option value="__new__">Buat tugas baru</option>', ...tugasItems.map((task) => `<option value="${task.tugas_id || task.id}">${task.tugas_nama || task.nama || 'Tugas'}</option>`)].join('');
    syncTugasMode();
  };

  const syncBabMode = () => {
    babNameInput.disabled = babSelect.value !== '__new__';
    babNameInput.classList.toggle('bg-slate-100', babNameInput.disabled);
    renderTugasOptions();
  };

  const syncTugasMode = () => {
    tugasNameInput.disabled = tugasSelect.value !== '__new__';
    tugasNameInput.classList.toggle('bg-slate-100', tugasNameInput.disabled);
  };

  const syncUhMode = () => {
    uhNameInput.disabled = uhSelect.value !== '__new__';
    uhNameInput.classList.toggle('bg-slate-100', uhNameInput.disabled);
  };

  form.querySelectorAll('input[name="destinations"]').forEach((input) => input.addEventListener('change', syncSectionState));
  babSelect?.addEventListener('change', syncBabMode);
  tugasSelect?.addEventListener('change', syncTugasMode);
  uhSelect?.addEventListener('change', syncUhMode);
  syncSectionState();
  renderTugasOptions();
  syncBabMode();
  syncTugasMode();
  syncUhMode();

  cancelBtn?.addEventListener('click', closeModal);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = document.getElementById('btn-sync-submit');
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4 animate-spin stroke-current" fill="none" stroke-width="2"><path d="M12 3a9 9 0 1 0 9 9"/></svg> Mengirim...';

    const fd = new FormData(form);
    const destinations = fd.getAll('destinations').filter(Boolean);

    try {
      const result = await kirimKePenilaian(sesiId, {
        destinations,
        overwriteMode: fd.get('overwrite_mode') || 'skip',
        tugas: {
          babId: fd.get('tugas_bab_id') || '__new__',
          babName: fd.get('tugas_bab_name') || getDefaultKuizBabName(),
          tugasId: fd.get('tugas_existing_id') || '__new__',
          tugasName: fd.get('tugas_name') || getDefaultKuizImportLabel(snapshot.sesi, snapshot.paket),
        },
        uh: {
          columnId: fd.get('uh_column_id') || '__new__',
          columnName: fd.get('uh_column_name') || getDefaultKuizImportLabel(snapshot.sesi, snapshot.paket),
        },
        pts: {
          tipe: fd.get('pts_tipe') || 'murni',
        },
      });
      closeModal();
      const detail = Object.entries(result.summary)
        .map(([key, value]) => `${key.toUpperCase()} ${value.saved || 0}`)
        .join(' • ');
      showNotif(`Berhasil kirim ${result.total} nilai. ${detail}`);
    } catch (error) {
      showNotif(error?.message || 'Gagal mengirim nilai ke penilaian.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  });

  await fsSave('kuiz_nilai_final', payload, payload.id);
  return nilaiData.length;
}

async function getSesiParticipants(sesi, jawaban = []) {
  const members = sesi?.kelas_id ? await getClassMembers(state.context, sesi.kelas_id) : [];
  const participantsMap = new Map();

  members.forEach((member) => {
    const key = member.siswa_id || member.id;
    if (!key) return;
    participantsMap.set(key, {
      siswa_id: key,
      siswa_nama: member.siswa_nama || member.nama || '-',
      nomor_absen: member.nomor_absen || '',
      kelas_id: member.kelas_id || sesi?.kelas_id || '',
      jawabanDoc: null,
      from: 'member',
    });
  });

  jawaban.forEach((item) => {
    const key = item.siswa_id || item.id;
    if (!key) return;
    participantsMap.set(key, {
      ...participantsMap.get(key),
      siswa_id: key,
      siswa_nama: item.siswa_nama || participantsMap.get(key)?.siswa_nama || '-',
      nomor_absen: participantsMap.get(key)?.nomor_absen || '',
      kelas_id: item.kelas_id || participantsMap.get(key)?.kelas_id || sesi?.kelas_id || '',
      jawabanDoc: item,
      from: participantsMap.has(key) ? 'merged' : 'jawaban',
    });
  });

  return Array.from(participantsMap.values()).sort((a, b) => {
    const byName = String(a.siswa_nama || '').localeCompare(String(b.siswa_nama || ''), 'id', { sensitivity: 'base' });
    if (byName !== 0) return byName;
    const nomorA = Number(a.nomor_absen || 0);
    const nomorB = Number(b.nomor_absen || 0);
    return nomorA - nomorB;
  });
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────

function showNotif(msg, type = 'success') {
  const existing = document.getElementById('kuiz-notif');
  if (existing) existing.remove();
  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-slate-800 text-white',
  };
  const el = document.createElement('div');
  el.id = 'kuiz-notif';
  el.className = `fixed top-5 right-5 z-[9999] rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl transition-all ${colors[type] || colors.info}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── MODAL SYSTEM ─────────────────────────────────────────────────────────────

function showModal(html, opts = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'kuiz-modal-overlay';
  overlay.className = 'fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4';
  overlay.innerHTML = `
    <div id="kuiz-modal-box" class="relative w-full ${opts.wide ? 'max-w-4xl' : opts.narrow ? 'max-w-md' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-2xl">
      <div class="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-[28px] border-b border-slate-100 bg-white px-6 py-4">
        <p class="font-semibold text-slate-900">${opts.title || ''}</p>
        <button id="kuiz-modal-close" class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
          <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="p-6">${html}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('kuiz-modal-close')?.addEventListener('click', closeModal);
  if (!opts.noBackdrop) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  }
}

function closeModal() {
  document.getElementById('kuiz-modal-overlay')?.remove();
}

// ─── TAB RENDERER ─────────────────────────────────────────────────────────────

function getTabTheme(tabId) {
  const themes = {
    bank: {
      active: 'border-amber-200 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_12px_30px_rgba(249,115,22,0.28)] ring-1 ring-amber-200/70',
      idle: 'border-transparent bg-white/70 text-slate-600 hover:border-amber-100 hover:bg-amber-50 hover:text-amber-700',
      icon: 'bg-white/20 text-white',
      iconIdle: 'bg-amber-100 text-amber-700',
    },
    sesi: {
      active: 'border-sky-200 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-[0_12px_30px_rgba(14,165,233,0.28)] ring-1 ring-sky-200/70',
      idle: 'border-transparent bg-white/70 text-slate-600 hover:border-sky-100 hover:bg-sky-50 hover:text-sky-700',
      icon: 'bg-white/20 text-white',
      iconIdle: 'bg-sky-100 text-sky-700',
    },
    monitor: {
      active: 'border-rose-200 bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-[0_12px_30px_rgba(244,63,94,0.28)] ring-1 ring-rose-200/70',
      idle: 'border-transparent bg-white/70 text-slate-600 hover:border-rose-100 hover:bg-rose-50 hover:text-rose-700',
      icon: 'bg-white/20 text-white',
      iconIdle: 'bg-rose-100 text-rose-700',
    },
    hasil: {
      active: 'border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_12px_30px_rgba(16,185,129,0.28)] ring-1 ring-emerald-200/70',
      idle: 'border-transparent bg-white/70 text-slate-600 hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700',
      icon: 'bg-white/20 text-white',
      iconIdle: 'bg-emerald-100 text-emerald-700',
    },
  };
  return themes[tabId] || themes.bank;
}

function getTabButtonClasses(tabId, active) {
  const theme = getTabTheme(tabId);
  return `tab-btn group flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-200 ${active ? `${theme.active} -translate-y-0.5` : theme.idle}`;
}

function getTabIconClasses(tabId, active) {
  const theme = getTabTheme(tabId);
  return `inline-flex h-8 w-8 items-center justify-center rounded-xl transition ${active ? theme.icon : theme.iconIdle}`;
}

function renderTabs() {
  const tabs = [
    { id: 'bank', label: 'Buat Soal', icon: '<path d="M12 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8z"/><polyline points="12 2 12 8 18 8"/>' },
    { id: 'sesi', label: 'Kelola Sesi', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { id: 'monitor', label: 'Monitoring Live', icon: '<path d="M3 12h4l3 7 4-14 3 7h4"/><path d="M3 5h18"/>' },
    { id: 'hasil', label: 'Rekap Hasil', icon: '<path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5"/><circle cx="5" cy="19" r="1.2" fill="currentColor"/><circle cx="12" cy="6" r="1.2" fill="currentColor"/><circle cx="19" cy="13" r="1.2" fill="currentColor"/>' },
  ];
  return `
    <div class="grid grid-cols-2 gap-2 rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-2 lg:grid-cols-4">
      ${tabs.map((t) => `
        <button type="button" data-tab="${t.id}" class="${getTabButtonClasses(t.id, state.tab === t.id)}">
          <span class="${getTabIconClasses(t.id, state.tab === t.id)}">
            <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current shrink-0" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>
          </span>
          <span class="truncate">${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function groupSesiItems(list) {
  const groupedMap = new Map();
  list.forEach((sesi) => {
    const key = sesi.event_group_id || `single:${sesi.id}`;
    if (!groupedMap.has(key)) groupedMap.set(key, []);
    groupedMap.get(key).push(sesi);
  });

  return Array.from(groupedMap.entries())
    .map(([key, sessions]) => ({
      key,
      sessions: sessions.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
      updated_at: sessions.reduce((latest, item) => latest > String(item.updated_at || '') ? latest : String(item.updated_at || ''), ''),
    }))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

// ─── TAB: BUAT SOAL ───────────────────────────────────────────────────────────

function renderTabBank() {
  const list = state.paketList.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Buat Soal</p>
           <h3 class="text-2xl font-semibold text-slate-900">Paket Ujian Saya</h3>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" id="btn-generate-soal-baru" class="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-purple-700 hover:to-indigo-700">
            <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2"><path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z"/></svg>
            Buat Soal AI
          </button>
          <button type="button" id="btn-buat-paket" class="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">
            <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Buat Paket
          </button>
        </div>
      </div>

      ${list.length === 0 ? `
        <div class="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <p class="text-sm font-semibold text-slate-500">Belum ada paket soal</p>
          <p class="mt-1 text-sm text-slate-400">Mulai cepat dengan membuat soal otomatis memakai AI, atau buat paket kosong.</p>
          <button type="button" id="btn-generate-soal-empty" class="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-purple-700 hover:to-indigo-700">
            <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2"><path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z"/></svg>
            Buat Soal dengan AI
          </button>
        </div>
      ` : `
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          ${list.map((p) => renderPaketCard(p)).join('')}
        </div>
      `}
    </div>
  `;
}

function renderPaketCard(p) {
  const maxPoin = hitungMaxPoin(p);
  const soalCount = (p.soal || []).length;
  const accentColors = ['from-indigo-500 to-purple-500', 'from-emerald-500 to-cyan-500', 'from-orange-500 to-amber-500', 'from-rose-500 to-pink-500', 'from-sky-500 to-blue-500'];
  const accent = accentColors[Math.abs(p.id?.charCodeAt(0) || 0) % accentColors.length];
  const firstQuestion = p.soal?.[0]?.pertanyaan || '';

  return `
    <div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition flex flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-lg font-bold text-white shadow">${(p.judul || 'P').charAt(0).toUpperCase()}</div>
        <div class="flex gap-1.5 flex-wrap justify-end">
          ${p.acak_soal ? '<span class="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">Acak</span>' : ''}
          ${(p.soal || []).some((s) => s.tipe === 'essay') ? '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Essay</span>' : ''}
        </div>
      </div>
      <div class="flex-1">
        <p class="font-semibold text-slate-900">${p.judul || 'Tanpa Judul'}</p>
        <p class="mt-1 text-xs text-slate-500">Relasi kelas dan mata pelajaran ditentukan saat membuat sesi.</p>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-5 text-slate-700 max-h-20 overflow-hidden">
          ${renderMathSnippet(firstQuestion, '<span class="text-slate-400">Belum ada soal pada paket ini.</span>')}
        </div>
      </div>
      <div class="flex gap-3 rounded-2xl bg-slate-50 p-3">
        <div class="flex-1 text-center">
          <p class="text-xl font-semibold text-slate-900">${soalCount}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Soal</p>
        </div>
        <div class="w-px bg-slate-200"></div>
        <div class="flex-1 text-center">
          <p class="text-xl font-semibold text-slate-900">${maxPoin}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Poin</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" data-action="edit-soal" data-paket-id="${p.id}" class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">Edit Soal</button>
        <button type="button" data-action="generate-soal" data-paket-id="${p.id}" class="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:from-purple-700 hover:to-indigo-700">✨ Soal AI</button>
        <button type="button" data-action="buat-sesi-dari-paket" data-paket-id="${p.id}" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Buat Sesi</button>
        <button type="button" data-action="edit-paket" data-paket-id="${p.id}" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Edit Paket</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" data-action="duplikat-paket" data-paket-id="${p.id}" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Duplikat</button>
        <button type="button" data-action="hapus-paket" data-paket-id="${p.id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100">Hapus Paket</button>
      </div>
    </div>
  `;
}

// ─── MODAL: GENERATE SOAL DENGAN AI ────────────────────────────────────────────

function buildGenerateSoalForm(paket) {
  const isBaru = !paket;
  const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
  const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5';
  return `
    <form id="form-gen-soal" class="space-y-4">
      <div class="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 text-xs leading-5 text-indigo-900">
        Isi konteks materi, lalu AI menyusun soal otomatis dalam format yang siap dipakai. Anda selalu bisa memeriksa hasilnya sebelum menyimpan.
      </div>

      ${isBaru ? `
        <div>
          <label class="${labelClass}">Judul Paket Baru</label>
          <input id="gen-judul" type="text" placeholder="Contoh: UH Bab 3 – Persamaan Linear" class="${inputClass}"/>
        </div>
      ` : `
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          Soal akan ditambahkan ke paket: <span class="font-semibold text-slate-900">${paket.judul || 'Tanpa Judul'}</span>
          ${(paket.soal || []).length ? `<span class="text-slate-400"> (sudah ada ${(paket.soal || []).length} soal)</span>` : ''}
        </div>
      `}

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="${labelClass}">Mata Pelajaran</label>
          <input id="gen-mapel" type="text" placeholder="Contoh: Matematika" class="${inputClass}"/>
        </div>
        <div>
          <label class="${labelClass}">Kelas / Jenjang</label>
          <input id="gen-kelas" type="text" placeholder="Contoh: Kelas XI SMA" class="${inputClass}"/>
        </div>
      </div>

      <div>
        <label class="${labelClass}">Materi / Topik <span class="text-rose-500">*</span></label>
        <textarea id="gen-materi" rows="2" placeholder="Contoh: Turunan fungsi aljabar dan penerapannya" class="${inputClass} resize-none"></textarea>
      </div>

      <div class="grid gap-3 sm:grid-cols-4">
        <div>
          <label class="${labelClass}">Jumlah</label>
          <input id="gen-jumlah" type="number" min="1" max="30" value="5" class="${inputClass}"/>
        </div>
        <div>
          <label class="${labelClass}">Tipe Soal</label>
          <select id="gen-tipe" class="${inputClass}">
            <option value="pg" selected>Pilihan Ganda</option>
            <option value="campuran">Campuran</option>
            <option value="bs">Benar / Salah</option>
            <option value="isian">Isian Singkat</option>
            <option value="essay">Essay / Uraian</option>
            <option value="menjodohkan">Menjodohkan</option>
          </select>
        </div>
        <div>
          <label class="${labelClass}">Kesulitan</label>
          <select id="gen-kesulitan" class="${inputClass}">
            <option value="mudah">Mudah</option>
            <option value="sedang" selected>Sedang</option>
            <option value="sulit">Sulit</option>
            <option value="hots">HOTS</option>
            <option value="campuran">Campuran</option>
          </select>
        </div>
        <div id="gen-opsi-wrap">
          <label class="${labelClass}">Jumlah Opsi</label>
          <input id="gen-jumlah-opsi" type="number" min="2" max="6" value="4" class="${inputClass}"/>
        </div>
      </div>

      <div class="flex flex-wrap gap-4">
        <label class="inline-flex items-center gap-2 text-sm text-slate-700">
          <input id="gen-pembahasan" type="checkbox" class="h-4 w-4 rounded accent-indigo-600"/>
          Sertakan pembahasan / kunci
        </label>
        <label class="inline-flex items-center gap-2 text-sm text-slate-700">
          <input id="gen-latex" type="checkbox" class="h-4 w-4 rounded accent-indigo-600"/>
          Materi memuat rumus matematis
        </label>
      </div>

      <div>
        <label class="${labelClass}">Instruksi Tambahan (opsional)</label>
        <textarea id="gen-instruksi" rows="2" placeholder="Contoh: fokus pada soal cerita, hindari soal hafalan" class="${inputClass} resize-none"></textarea>
      </div>

      <div id="gen-status" class="hidden rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"></div>

      <div id="gen-result" class="hidden space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-2xl bg-indigo-50 border border-indigo-200 p-3 text-center">
            <p class="text-xl font-bold text-indigo-900" id="gen-stat-count">0</p>
            <p class="text-[11px] text-indigo-700">Soal</p>
          </div>
          <div class="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-center">
            <p class="text-sm font-bold text-emerald-900" id="gen-stat-types">-</p>
            <p class="text-[11px] text-emerald-700">Tipe</p>
          </div>
          <div class="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center">
            <p class="text-xl font-bold text-amber-900" id="gen-stat-poin">0</p>
            <p class="text-[11px] text-amber-700">Total Poin</p>
          </div>
        </div>
        <div class="max-h-[300px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3" id="gen-preview"></div>
      </div>

      <div class="flex flex-wrap gap-3 pt-2">
        <button type="button" id="btn-gen-cancel" class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Tutup</button>
        ${paket ? `<button type="button" id="btn-gen-manual" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Tempel Manual</button>` : ''}
        <button type="button" id="btn-gen-run" class="flex-1 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold text-white hover:from-purple-700 hover:to-indigo-700 transition">✨ Generate</button>
        <button type="button" id="btn-gen-save" class="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled>Tambah ke Paket</button>
      </div>
    </form>
  `;
}

function openModalGenerateSoal(paketId = null) {
  const paket = paketId ? state.paketList.find((p) => p.id === paketId) : null;
  if (paketId && !paket) return;
  state.genPaketId = paketId;
  state.genSoal = [];
  state.genAbort = null;

  showModal(buildGenerateSoalForm(paket), {
    title: paket ? `Buat Soal AI: ${paket.judul || ''}` : 'Buat Soal dengan AI',
    wide: true,
  });
  attachGenerateSoalListeners(paketId);
}

function attachGenerateSoalListeners(paketId) {
  const runBtn = document.getElementById('btn-gen-run');
  const saveBtn = document.getElementById('btn-gen-save');
  const cancelBtn = document.getElementById('btn-gen-cancel');
  const manualBtn = document.getElementById('btn-gen-manual');
  const tipeSelect = document.getElementById('gen-tipe');
  const opsiWrap = document.getElementById('gen-opsi-wrap');
  const statusEl = document.getElementById('gen-status');
  const resultEl = document.getElementById('gen-result');
  const previewEl = document.getElementById('gen-preview');

  const syncOpsiVisibility = () => {
    const tipe = tipeSelect?.value || 'pg';
    if (opsiWrap) opsiWrap.style.display = (tipe === 'pg' || tipe === 'campuran') ? '' : 'none';
  };
  tipeSelect?.addEventListener('change', syncOpsiVisibility);
  syncOpsiVisibility();

  const setStatus = (html, tone = 'info') => {
    if (!statusEl) return;
    const tones = {
      info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
      error: 'border-rose-200 bg-rose-50 text-rose-700',
      success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
    statusEl.className = `rounded-2xl border px-4 py-3 text-sm ${tones[tone] || tones.info}`;
    statusEl.innerHTML = html;
    statusEl.classList.remove('hidden');
  };

  const collectInput = () => ({
    mapel: document.getElementById('gen-mapel')?.value?.trim() || '',
    kelas: document.getElementById('gen-kelas')?.value?.trim() || '',
    materi: document.getElementById('gen-materi')?.value?.trim() || '',
    jumlah: Number(document.getElementById('gen-jumlah')?.value) || 5,
    tipe: tipeSelect?.value || 'pg',
    kesulitan: document.getElementById('gen-kesulitan')?.value || 'sedang',
    jumlahOpsi: Number(document.getElementById('gen-jumlah-opsi')?.value) || 4,
    pembahasan: document.getElementById('gen-pembahasan')?.checked || false,
    latex: document.getElementById('gen-latex')?.checked || false,
    instruksi: document.getElementById('gen-instruksi')?.value?.trim() || '',
  });

  const setRunningUi = (running) => {
    if (!runBtn) return;
    if (running) {
      runBtn.dataset.mode = 'stop';
      runBtn.textContent = '■ Hentikan';
    } else {
      runBtn.dataset.mode = 'run';
      runBtn.textContent = state.genSoal.length ? '✨ Generate Ulang' : '✨ Generate';
    }
    if (saveBtn) saveBtn.disabled = running || !state.genSoal.length;
  };

  const runGenerate = async () => {
    const input = collectInput();
    if (!input.mapel && !input.materi) {
      setStatus('Isi minimal <strong>Mata Pelajaran</strong> atau <strong>Materi/Topik</strong> dulu.', 'error');
      return;
    }

    state.genSoal = [];
    if (saveBtn) saveBtn.disabled = true;
    resultEl?.classList.add('hidden');
    setStatus('AI sedang menyusun soal… <span id="gen-progress" class="font-semibold">0</span> karakter diterima.');

    const controller = new AbortController();
    state.genAbort = controller;
    setRunningUi(true);
    let charCount = 0;

    try {
      await streamGenerateSoal({
        input,
        signal: controller.signal,
        onDelta: (chunk) => {
          charCount += chunk.length;
          const p = document.getElementById('gen-progress');
          if (p) p.textContent = String(charCount);
        },
        onSoal: async (payload) => {
          const result = parseJsonBulkSoal(JSON.stringify(payload));
          if (result.error) {
            setStatus(`Hasil AI tidak dapat dibaca: ${result.error}`, 'error');
            return;
          }
          state.genSoal = result.soal || [];
          state.genPaketJudul = payload.paket_judul || '';
          if (!state.genSoal.length) {
            setStatus('AI tidak menghasilkan soal. Coba ubah materi atau instruksi.', 'error');
            return;
          }
          await ensureKaTeXReady();
          if (previewEl) previewEl.innerHTML = buildPreviewHtml(state.genSoal);
          document.getElementById('gen-stat-count').textContent = String(state.genSoal.length);
          document.getElementById('gen-stat-types').textContent = [...new Set(state.genSoal.map((s) => TIPE_SOAL[s.tipe] || s.tipe))].join(', ');
          document.getElementById('gen-stat-poin').textContent = String(state.genSoal.reduce((sum, s) => sum + (Number(s.poin) || 0), 0));
          resultEl?.classList.remove('hidden');
          if (saveBtn) saveBtn.disabled = false;
          setStatus(`Selesai — ${state.genSoal.length} soal siap. Periksa lalu klik <strong>Tambah ke Paket</strong>.`, 'success');
          // Prefill judul paket baru bila kosong.
          const judulEl = document.getElementById('gen-judul');
          if (judulEl && !judulEl.value.trim() && state.genPaketJudul) judulEl.value = state.genPaketJudul;
        },
        onError: (err) => {
          if (err?.code === 'aborted') { setStatus('Generate dihentikan.', 'info'); return; }
          setStatus(err?.message || 'Gagal menghasilkan soal.', 'error');
        },
      });
    } catch {
      /* error sudah ditangani via onError */
    } finally {
      state.genAbort = null;
      setRunningUi(false);
    }
  };

  runBtn?.addEventListener('click', () => {
    if (runBtn.dataset.mode === 'stop') {
      state.genAbort?.abort();
      return;
    }
    runGenerate();
  });

  saveBtn?.addEventListener('click', async () => {
    if (!state.genSoal.length) return;
    saveBtn.disabled = true;

    let targetPaket = paketId ? state.paketList.find((p) => p.id === paketId) : null;
    if (targetPaket) {
      targetPaket.soal = [...(targetPaket.soal || []), ...state.genSoal];
      await savePaket(targetPaket);
    } else {
      const judul = (document.getElementById('gen-judul')?.value?.trim())
        || state.genPaketJudul
        || `Paket AI ${formatDateTime(new Date().toISOString())}`;
      await savePaket({
        id: generateId('paket'),
        judul,
        assignment_id: '',
        mapel_id: '',
        mapel_nama: '',
        kelas_id: '',
        kelas_nama: '',
        acak_soal: false,
        acak_opsi: false,
        soal: [...state.genSoal],
      });
    }

    const total = state.genSoal.length;
    state.genSoal = [];
    closeModal();
    rerender();
    showNotif(`✓ ${total} soal AI berhasil ${paketId ? 'ditambahkan' : 'dibuat'}.`, 'success');
  });

  manualBtn?.addEventListener('click', () => {
    closeModal();
    openModalImportSoal(paketId);
  });

  cancelBtn?.addEventListener('click', () => {
    state.genAbort?.abort();
    closeModal();
  });
}

// ─── MODAL: IMPORT SOAL DARI AI ────────────────────────────────────────────────

function openModalImportSoal(paketId) {
  state.importingPaketId = paketId;
  const paket = state.paketList.find((p) => p.id === paketId);
  if (!paket) return;
  
  showModal(buildImportForm(), { title: `Import Soal ke: ${paket.judul}`, wide: true });
  attachImportFormListeners();
}

function buildImportForm() {
  return `
    <div class="space-y-4">
      <!-- Format Tabs -->
      <div class="flex gap-2 rounded-xl bg-slate-100 p-1">
        <button type="button" class="format-tab flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${state.importFormat === 'markdown' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}" data-format="markdown">
          <svg class="inline h-4 w-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16M2 20h20"/></svg>
          Paste Markdown
        </button>
        <button type="button" class="format-tab flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${state.importFormat === 'json' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}" data-format="json">
          <svg class="inline h-4 w-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M12 3v18"/></svg>
          JSON Bulk
        </button>
      </div>

      <!-- Markdown Format -->
      <div id="format-markdown" class="${state.importFormat === 'markdown' ? '' : 'hidden'} space-y-3">
        <div class="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p id="ai-preset-title" class="text-xs font-semibold uppercase tracking-[0.18em] text-blue-900">AI Matematika</p>
              <p class="mt-1 text-sm font-semibold text-blue-950">Cara menghasilkan soal dari AI</p>
            </div>
            <span class="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700">Markdown</span>
          </div>
          <div class="grid gap-2 text-xs text-blue-900 sm:grid-cols-3">
            <div id="ai-step-copy" class="rounded-2xl border border-blue-100 bg-white/80 px-3 py-2.5">1. Copy preset Matematika.</div>
            <div class="rounded-2xl border border-blue-100 bg-white/80 px-3 py-2.5">2. Tempel ke AI, lalu jalankan tanpa tambahan format lain.</div>
            <div class="rounded-2xl border border-blue-100 bg-white/80 px-3 py-2.5">3. Paste hasil AI di bawah, lalu tekan Preview.</div>
          </div>
          <details class="group rounded-2xl border border-blue-100 bg-white/80 p-3">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-blue-950">
              <span id="ai-preset-summary">Preset Matematika</span>
              <span class="text-xs text-blue-700 transition group-open:rotate-180">⌄</span>
            </summary>
            <div class="mt-3 space-y-3">
              <label class="block space-y-1.5">
                <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-900">Preset</span>
                <select id="ai-preset-type" class="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  <option value="matematika" selected>Matematika</option>
                  <option value="umum">Mapel Umum</option>
                  <option value="sains">IPA/Sains</option>
                </select>
              </label>
              <label class="block space-y-1.5">
                <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-900">Materi kuis</span>
                <input id="math-quiz-material" type="text" value="${DEFAULT_AI_MATH_MATERI}" placeholder="Contoh: limit fungsi aljabar"
                  class="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </label>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p id="ai-copy-caption" class="text-[11px] text-blue-800">Siap disalin untuk ChatGPT, Claude, atau AI lain.</p>
                <button type="button" id="btn-copy-math-prompt" class="rounded-xl border border-blue-200 bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">Copy</button>
              </div>
              <textarea id="math-ai-prompt" rows="18" readonly class="w-full rounded-2xl border border-blue-100 bg-slate-950 px-4 py-3 text-[11px] leading-5 text-slate-100 focus:outline-none resize-none">${buildAiMathPrompt()}</textarea>
            </div>
          </details>
        </div>
        <textarea id="markdown-input" rows="12" placeholder="Paste hasil AI di sini, lalu tekan Preview."
          class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"></textarea>
      </div>

      <!-- JSON Format -->
      <div id="format-json" class="${state.importFormat === 'json' ? '' : 'hidden'} space-y-3">
        <div class="rounded-xl bg-purple-50 border border-purple-200 p-4 space-y-3">
          <div>
            <p class="text-xs font-semibold text-purple-900">📌 Format JSON</p>
            <p class="mt-1 text-xs text-purple-800">Contoh:</p>
            <pre class="mt-1.5 text-[10px] text-purple-800 overflow-x-auto bg-white p-2 rounded border border-purple-100"><code>{
  "format": "kuiz_bulk_v1",
  "paket_judul": "UH Bab 5",
  "soal": [
    {
      "tipe": "pg",
      "pertanyaan": "$2x + 5 = 13$",
      "opsi": ["$x=3$", "$x=4$", "$x=5$"],
      "jawaban_benar": "B",
      "poin": 1
    }
  ]
}</code></pre>
          </div>
          
          <details class="cursor-pointer">
            <summary class="text-xs font-semibold text-purple-900 hover:text-purple-700">🔧 Field yang Didukung</summary>
            <div class="mt-2 text-[11px] text-purple-800 space-y-1 bg-white p-2 rounded border border-purple-100">
              <p><strong>Wajib:</strong> format, soal[]</p>
              <p><strong>Per soal:</strong> tipe, pertanyaan, jawaban_benar, poin</p>
              <p><strong>Opsional:</strong> opsi[], pasangan[], rubrik</p>
              <p class="mt-2 text-[10px]">Tipe yang didukung: pg, bs, isian, menjodohkan, essay</p>
            </div>
          </details>
        </div>
        <textarea id="json-input" rows="12" placeholder="Paste JSON soal di sini..."
          class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"></textarea>
      </div>

      <!-- Preview Section -->
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 max-h-[300px] overflow-y-auto">
        <p class="text-xs font-semibold text-slate-500 mb-3">PREVIEW</p>
        <div id="import-preview" class="text-sm text-slate-600">
          <p class="text-slate-400">Soal akan ditampilkan di sini setelah parse</p>
        </div>
      </div>

      <!-- Stats -->
      <div id="import-stats" class="grid grid-cols-3 gap-3 hidden">
        <div class="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-center">
          <p class="text-xl font-bold text-indigo-900" id="stat-count">0</p>
          <p class="text-xs text-indigo-700">Soal Terdeteksi</p>
        </div>
        <div class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
          <p class="text-xl font-bold text-emerald-900" id="stat-types">-</p>
          <p class="text-xs text-emerald-700">Tipe</p>
        </div>
        <div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
          <p class="text-xl font-bold text-amber-900" id="stat-poin">0</p>
          <p class="text-xs text-amber-700">Total Poin</p>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex gap-3 pt-4">
        <button type="button" id="btn-import-cancel" class="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Batal</button>
        <button type="button" id="btn-import-preview" class="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">Preview</button>
        <button type="button" id="btn-import-save" class="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled>Simpan Soal</button>
      </div>
    </div>
  `;
}

function attachImportFormListeners() {
  const formatTabs = document.querySelectorAll('.format-tab');
  const markdownSection = document.getElementById('format-markdown');
  const jsonSection = document.getElementById('format-json');
  const previewBtn = document.getElementById('btn-import-preview');
  const saveBtn = document.getElementById('btn-import-save');
  const cancelBtn = document.getElementById('btn-import-cancel');
  const markdownInput = document.getElementById('markdown-input');
  const jsonInput = document.getElementById('json-input');
  const copyMathPromptBtn = document.getElementById('btn-copy-math-prompt');
  const mathPromptInput = document.getElementById('math-ai-prompt');
  const mathQuizMaterialInput = document.getElementById('math-quiz-material');
  const aiPresetTypeSelect = document.getElementById('ai-preset-type');
  const aiPresetTitle = document.getElementById('ai-preset-title');
  const aiPresetSummary = document.getElementById('ai-preset-summary');
  const aiStepCopy = document.getElementById('ai-step-copy');
  const aiCopyCaption = document.getElementById('ai-copy-caption');
  
  let parsedSoal = [];

  function getCurrentPresetConfig() {
    return getAiPresetConfig(aiPresetTypeSelect?.value || DEFAULT_AI_PRESET);
  }

  function syncPresetMeta(resetMateri = false) {
    const config = getCurrentPresetConfig();
    if (aiPresetTitle) aiPresetTitle.textContent = config.infoTitle;
    if (aiPresetSummary) aiPresetSummary.textContent = config.label;
    if (aiStepCopy) aiStepCopy.textContent = `1. ${config.stepLabel}`;
    if (aiCopyCaption) aiCopyCaption.textContent = 'Siap disalin untuk ChatGPT, Claude, atau AI lain.';
    if (mathQuizMaterialInput) {
      mathQuizMaterialInput.placeholder = config.materiPlaceholder;
      if (resetMateri || !String(mathQuizMaterialInput.value || '').trim()) {
        mathQuizMaterialInput.value = config.defaultMateri;
      }
    }
  }

  function syncMathPromptPreview() {
    if (!mathPromptInput) return;
    const config = getCurrentPresetConfig();
    mathPromptInput.value = config.buildPrompt(mathQuizMaterialInput?.value);
  }

  aiPresetTypeSelect?.addEventListener('change', () => {
    syncPresetMeta(true);
    syncMathPromptPreview();
  });
  mathQuizMaterialInput?.addEventListener('input', syncMathPromptPreview);
  syncPresetMeta();
  syncMathPromptPreview();

  copyMathPromptBtn?.addEventListener('click', async () => {
    const config = getCurrentPresetConfig();
    const promptText = mathPromptInput?.value || config.buildPrompt(mathQuizMaterialInput?.value);
    try {
      await navigator.clipboard.writeText(promptText);
      showNotif(config.copyNotif);
    } catch {
      mathPromptInput?.focus();
      mathPromptInput?.select();
      showNotif('Clipboard tidak tersedia. Prompt sudah dipilih, salin manual.', 'info');
    }
  });

  // Format tabs
  formatTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const format = tab.dataset.format;
      state.importFormat = format;
      formatTabs.forEach((t) => t.classList.toggle('bg-white shadow-sm', t.dataset.format === format).classList.toggle('text-slate-600', t.dataset.format !== format));
      markdownSection.classList.toggle('hidden', format !== 'markdown');
      jsonSection.classList.toggle('hidden', format !== 'json');
      document.getElementById('import-preview').innerHTML = '<p class="text-slate-400">Soal akan ditampilkan di sini setelah parse</p>';
      document.getElementById('import-stats').classList.add('hidden');
      saveBtn.disabled = true;
      parsedSoal = [];
    });
  });

  // Preview button
  previewBtn?.addEventListener('click', async () => {
    parsedSoal = [];
    const inputText = state.importFormat === 'markdown' ? markdownInput.value : jsonInput.value;
    
    if (!inputText.trim()) {
      alert('Silakan paste soal terlebih dahulu');
      return;
    }

    if (state.importFormat === 'markdown') {
      parsedSoal = parseMarkdownSoal(inputText);
    } else {
      const result = parseJsonBulkSoal(inputText);
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }
      parsedSoal = result.soal || [];
    }

    if (parsedSoal.length === 0) {
      alert('Tidak ada soal yang terdeteksi. Periksa format Anda.');
      return;
    }

    const previewEl = document.getElementById('import-preview');
    if (previewEl) {
      previewEl.innerHTML = '<p class="text-slate-400">Menyiapkan preview matematika…</p>';
    }

    const katexReady = await ensureKaTeXReady();

    // Show preview
    const previewHtml = buildPreviewHtml(parsedSoal);
    if (previewEl) {
      previewEl.innerHTML = previewHtml + (!katexReady ? '<div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Preview dimuat tanpa renderer LaTeX. Periksa koneksi CDN atau refresh halaman.</div>' : '');
    }

    // Show stats
    const stats = document.getElementById('import-stats');
    stats.classList.remove('hidden');
    document.getElementById('stat-count').textContent = parsedSoal.length;
    document.getElementById('stat-types').textContent = [...new Set(parsedSoal.map(s => s.tipe))].join(', ');
    document.getElementById('stat-poin').textContent = parsedSoal.reduce((sum, s) => sum + (s.poin || 1), 0);

    // Enable save
    saveBtn.disabled = false;
  });

  // Save button
  saveBtn?.addEventListener('click', async () => {
    if (!parsedSoal.length) return;
    
    const paket = state.paketList.find((p) => p.id === state.importingPaketId);
    if (!paket) return;

    paket.soal = [...(paket.soal || []), ...parsedSoal];
    await savePaket(paket);
    
    closeModal();
    showNotif(`✓ ${parsedSoal.length} soal berhasil diimport`, 'success');
    rerender();
  });

  // Cancel button
  cancelBtn?.addEventListener('click', closeModal);
}

// ─── MODAL: BUAT/EDIT PAKET ───────────────────────────────────────────────────

function openModalPaket(paket = null) {
  const isEdit = !!paket;

  showModal(`
    <form id="form-paket" class="space-y-5">
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Judul Paket</label>
        <input name="judul" value="${paket?.judul || ''}" required placeholder="Contoh: UH Bab 3 – Persamaan Linear"
          class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"/>
      </div>
      <div class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Paket soal bersifat netral. Kelas dan mata pelajaran akan dipilih saat membuat sesi kuiz.
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" name="acak_soal" ${paket?.acak_soal ? 'checked' : ''} class="h-4 w-4 rounded accent-indigo-600"/>
          <div>
            <p class="text-sm font-semibold text-slate-800">Acak Urutan Soal</p>
            <p class="text-xs text-slate-500">Per siswa, soal diacak</p>
          </div>
        </label>
        <label class="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" name="acak_opsi" ${paket?.acak_opsi ? 'checked' : ''} class="h-4 w-4 rounded accent-indigo-600"/>
          <div>
            <p class="text-sm font-semibold text-slate-800">Acak Opsi PG</p>
            <p class="text-xs text-slate-500">Opsi pilihan ganda diacak</p>
          </div>
        </label>
      </div>
      <div class="flex gap-3 pt-2">
        <button type="button" id="btn-modal-cancel" class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Batal</button>
        <button type="submit" class="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">${isEdit ? 'Simpan' : 'Buat Paket'}</button>
      </div>
    </form>
  `, { title: isEdit ? 'Edit Paket Soal' : 'Buat Paket Soal Baru', narrow: true });

  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-paket')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      id: paket?.id || generateId('paket'),
      judul: fd.get('judul').trim(),
      assignment_id: '',
      mapel_id: '',
      mapel_nama: '',
      kelas_id: '',
      kelas_nama: '',
      acak_soal: fd.get('acak_soal') === 'on',
      acak_opsi: fd.get('acak_opsi') === 'on',
      soal: paket?.soal || [],
    };
    closeModal();
    await savePaket(data);
    rerender();
    showNotif(isEdit ? 'Paket berhasil diperbarui.' : 'Paket berhasil dibuat.');
  });
}

// ─── MODAL: EDITOR SOAL ───────────────────────────────────────────────────────

function openModalEditorSoal(paketId) {
  const paket = state.paketList.find((p) => p.id === paketId);
  if (!paket) return;
  state.editingSoalPaketId = paketId;

  const soalList = (paket.soal || []).map((s, i) => renderSoalRow(s, i)).join('');

  showModal(`
    <div class="space-y-4">
      <div class="rounded-2xl bg-slate-50 p-4 border border-slate-200">
        <p class="text-sm font-semibold text-slate-800">${paket.judul}</p>
        <p class="text-xs text-slate-500 mt-0.5">Relasi kelas dan mata pelajaran ditentukan saat membuat sesi • ${(paket.soal || []).length} soal</p>
      </div>
      <div id="soal-list-container" class="space-y-2">
        ${soalList || '<p class="text-sm text-slate-500 text-center py-4">Belum ada soal. Tambahkan soal pertama.</p>'}
      </div>
      <button type="button" id="btn-tambah-soal" class="w-full rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">
        + Tambah Soal
      </button>
    </div>
  `, { title: `Editor Soal: ${paket.judul}`, wide: true });

  document.getElementById('btn-tambah-soal')?.addEventListener('click', () => openModalSoalItem(paketId, null));

  document.querySelectorAll('[data-soal-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.soalAction;
      const soalId = btn.dataset.soalId;
      if (action === 'edit') openModalSoalItem(paketId, soalId);
      if (action === 'hapus') hapusSoal(paketId, soalId);
      if (action === 'up') moveSoal(paketId, soalId, -1);
      if (action === 'down') moveSoal(paketId, soalId, 1);
    });
  });
}

function renderSoalRow(s, i) {
  const tipeBadgeColors = {
    pg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    bs: 'bg-sky-50 text-sky-700 border-sky-200',
    isian: 'bg-teal-50 text-teal-700 border-teal-200',
    menjodohkan: 'bg-purple-50 text-purple-700 border-purple-200',
    essay: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const badgeCls = tipeBadgeColors[s.tipe] || 'bg-slate-100 text-slate-600 border-slate-200';
  const previewHtml = renderMathSnippet(s.pertanyaan);

  return `
    <div class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div class="flex flex-col items-center gap-1">
            <button data-soal-action="up" data-soal-id="${s.id}" class="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 text-xs transition">↑</button>
            <span class="text-xs font-bold text-slate-400">${i + 1}</span>
            <button data-soal-action="down" data-soal-id="${s.id}" class="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 text-xs transition">↓</button>
          </div>
          <span class="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeCls}">${TIPE_SOAL[s.tipe] || s.tipe}</span>
          <div class="flex-1 min-w-0 overflow-hidden rounded-xl bg-slate-50/80 px-3 py-2 text-sm leading-6 text-slate-700 max-h-[96px]">${previewHtml}</div>
        </div>
        <div class="flex items-center justify-between gap-2 sm:shrink-0 sm:justify-end">
          <span class="text-xs font-semibold text-slate-500">${s.poin || 1} poin</span>
          <div class="flex gap-2 shrink-0">
            <button data-soal-action="edit" data-soal-id="${s.id}" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">Edit</button>
            <button data-soal-action="hapus" data-soal-id="${s.id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Hapus</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── MODAL: TAMBAH/EDIT SOAL ITEM ─────────────────────────────────────────────

function openModalSoalItem(paketId, soalId) {
  const paket = state.paketList.find((p) => p.id === paketId);
  if (!paket) return;
  const soal = soalId ? (paket.soal || []).find((s) => s.id === soalId) : null;
  const isEdit = !!soal;

  showModal(buildSoalForm(soal), { title: isEdit ? 'Edit Soal' : 'Tambah Soal', wide: true });
  attachSoalFormListeners(paketId, soal);
}

function buildSoalForm(soal = null) {
  const tipeOptions = Object.entries(TIPE_SOAL).map(([k, v]) =>
    `<option value="${k}" ${soal?.tipe === k ? 'selected' : ''}>${v}</option>`
  ).join('');

  const opsiPg = soal?.tipe === 'pg' ? soal.opsi || ['', '', '', ''] : ['', '', '', ''];
  const opsiHtml = opsiPg.map((o, i) => `
    <div class="flex items-center gap-2">
      <label class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 cursor-pointer has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-600 border-slate-200">
        <input type="radio" name="jawaban_benar_pg" value="${String.fromCharCode(65 + i)}" ${soal?.jawaban_benar === String.fromCharCode(65 + i) ? 'checked' : ''} class="sr-only"/>
        <span class="text-xs font-bold has-[:checked]:text-white text-slate-500">${String.fromCharCode(65 + i)}</span>
      </label>
      <input type="text" name="opsi_${i}" value="${o}" placeholder="Opsi ${String.fromCharCode(65 + i)}"
        class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"/>
    </div>
  `).join('');

  const pasanganHtml = (soal?.tipe === 'menjodohkan' ? soal.pasangan || [] : []).map((pair, i) => `
    <div class="pasangan-row flex items-center gap-2">
      <input type="text" name="pasangan_kiri_${i}" value="${pair.kiri}" placeholder="Kiri"
        class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
      <span class="text-slate-400">→</span>
      <input type="text" name="pasangan_kanan_${i}" value="${pair.kanan}" placeholder="Kanan"
        class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
      <button type="button" class="btn-hapus-pasangan rounded-xl border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100">✕</button>
    </div>
  `).join('');

  return `
    <form id="form-soal" class="space-y-5">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Tipe Soal</label>
          <select name="tipe" id="soal-tipe-select" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            ${tipeOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Poin</label>
          <input type="number" name="poin" value="${soal?.poin || 1}" min="1" max="100"
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] xl:items-start">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Pertanyaan</label>
          <textarea name="pertanyaan" rows="4" required placeholder="Tulis pertanyaan di sini…"
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100">${soal?.pertanyaan || ''}</textarea>
          <div class="mt-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] leading-5 text-slate-500">
            Gunakan <strong>$...$</strong> untuk rumus inline, <strong>$$...$$</strong> untuk rumus besar, contoh: <strong>$x^2+3x-10$</strong> atau <strong>$$\frac{x^2+5x+6}{x+2}$$</strong>.
          </div>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between gap-3">
            <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</label>
            <span class="text-[11px] text-slate-400">LaTeX dirender otomatis</span>
          </div>
          <div id="soal-live-preview">${buildSoalLivePreviewHtml({
            tipe: soal?.tipe || 'pg',
            pertanyaan: soal?.pertanyaan || '',
            poin: soal?.poin || 1,
            jawaban_benar: soal?.jawaban_benar || '',
            opsi: soal?.opsi || ['', '', '', ''],
            pasangan: soal?.pasangan || [],
            rubrik: soal?.rubrik || '',
          })}</div>
        </div>
      </div>

      <!-- PG Fields -->
      <div id="fields-pg" class="${soal?.tipe !== 'pg' && soal ? 'hidden' : ''} space-y-3">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Pilihan Jawaban (klik huruf = jawaban benar)</label>
        <div id="opsi-container" class="space-y-2">${opsiHtml}</div>
        <button type="button" id="btn-tambah-opsi" class="text-xs font-semibold text-indigo-600 hover:underline">+ Tambah Opsi</button>
      </div>

      <!-- BS Fields -->
      <div id="fields-bs" class="${soal?.tipe !== 'bs' ? 'hidden' : ''} space-y-3">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Jawaban Benar</label>
        <div class="flex gap-3">
          <label class="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 cursor-pointer py-3 transition has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 border-slate-200 hover:bg-slate-50">
            <input type="radio" name="jawaban_bs" value="benar" ${soal?.jawaban_benar === 'benar' ? 'checked' : ''} class="sr-only"/>
            <span class="text-sm font-semibold text-slate-800">✓ Benar</span>
          </label>
          <label class="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 cursor-pointer py-3 transition has-[:checked]:border-red-500 has-[:checked]:bg-red-50 border-slate-200 hover:bg-slate-50">
            <input type="radio" name="jawaban_bs" value="salah" ${soal?.jawaban_benar === 'salah' ? 'checked' : ''} class="sr-only"/>
            <span class="text-sm font-semibold text-slate-800">✕ Salah</span>
          </label>
        </div>
      </div>

      <!-- Isian Fields -->
      <div id="fields-isian" class="${soal?.tipe !== 'isian' ? 'hidden' : ''} space-y-3">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Jawaban Benar</label>
        <input type="text" name="jawaban_isian" value="${soal?.tipe === 'isian' ? soal.jawaban_benar || '' : ''}" placeholder="Jawaban yang benar (case-insensitive)"
          class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
      </div>

      <!-- Menjodohkan Fields -->
      <div id="fields-menjodohkan" class="${soal?.tipe !== 'menjodohkan' ? 'hidden' : ''} space-y-3">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500">Pasangan (kiri → kanan)</label>
        <div id="pasangan-container" class="space-y-2">${pasanganHtml}</div>
        <button type="button" id="btn-tambah-pasangan" class="text-xs font-semibold text-indigo-600 hover:underline">+ Tambah Pasangan</button>
      </div>

      <!-- Essay Fields -->
      <div id="fields-essay" class="${soal?.tipe !== 'essay' ? 'hidden' : ''} space-y-3">
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Rubrik Penilaian (opsional)</label>
        <textarea name="rubrik" rows="2" placeholder="Kriteria penilaian untuk essay ini…"
          class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm resize-none focus:border-indigo-400 focus:outline-none">${soal?.rubrik || ''}</textarea>
      </div>

      <div class="flex gap-3 pt-2">
        <button type="button" id="btn-soal-cancel" class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Batal</button>
        <button type="submit" class="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">${soal ? 'Simpan' : 'Tambah Soal'}</button>
      </div>
    </form>
  `;
}

function attachSoalFormListeners(paketId, soal) {
  const formEl = document.getElementById('form-soal');
  const tipeSelect = document.getElementById('soal-tipe-select');
  const fieldSections = { pg: 'fields-pg', bs: 'fields-bs', isian: 'fields-isian', menjodohkan: 'fields-menjodohkan', essay: 'fields-essay' };

  function updateSoalLivePreview() {
    if (!formEl) return;
    const previewEl = document.getElementById('soal-live-preview');
    if (!previewEl) return;

    const tipe = tipeSelect?.value || 'pg';
    const fd = new FormData(formEl);
    const draft = {
      tipe,
      pertanyaan: String(fd.get('pertanyaan') || '').trim(),
      poin: Number(fd.get('poin')) || 1,
      jawaban_benar: '',
      opsi: [],
      pasangan: [],
      rubrik: String(fd.get('rubrik') || '').trim(),
    };

    if (tipe === 'pg') {
      let i = 0;
      while (fd.get(`opsi_${i}`) !== null) {
        draft.opsi.push(String(fd.get(`opsi_${i}`) || '').trim());
        i++;
      }
      draft.jawaban_benar = String(fd.get('jawaban_benar_pg') || 'A');
    } else if (tipe === 'bs') {
      draft.jawaban_benar = String(fd.get('jawaban_bs') || 'benar');
    } else if (tipe === 'isian') {
      draft.jawaban_benar = String(fd.get('jawaban_isian') || '').trim();
    } else if (tipe === 'menjodohkan') {
      document.querySelectorAll('.pasangan-row').forEach((row) => {
        const kiri = String(row.querySelector('[name^="pasangan_kiri"]')?.value || '').trim();
        const kanan = String(row.querySelector('[name^="pasangan_kanan"]')?.value || '').trim();
        draft.pasangan.push({ kiri, kanan });
      });
    }

    previewEl.innerHTML = buildSoalLivePreviewHtml(draft);
  }

  function updateFieldVisibility() {
    const val = tipeSelect?.value;
    Object.entries(fieldSections).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', k !== val);
    });
    updateSoalLivePreview();
  }
  tipeSelect?.addEventListener('change', updateFieldVisibility);
  updateFieldVisibility();

  // Add PG option
  let opsiCount = soal?.tipe === 'pg' ? (soal.opsi || ['', '', '', '']).length : 4;
  document.getElementById('btn-tambah-opsi')?.addEventListener('click', () => {
    if (opsiCount >= 5) return;
    const container = document.getElementById('opsi-container');
    const letter = String.fromCharCode(65 + opsiCount);
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2';
    div.innerHTML = `
      <label class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 cursor-pointer has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-600 border-slate-200">
        <input type="radio" name="jawaban_benar_pg" value="${letter}" class="sr-only"/>
        <span class="text-xs font-bold text-slate-500">${letter}</span>
      </label>
      <input type="text" name="opsi_${opsiCount}" placeholder="Opsi ${letter}"
        class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"/>
    `;
    container?.appendChild(div);
    opsiCount++;
    updateSoalLivePreview();
  });

  // Add pasangan
  let pasanganCount = soal?.tipe === 'menjodohkan' ? (soal.pasangan || []).length : 0;
  document.getElementById('btn-tambah-pasangan')?.addEventListener('click', () => {
    const container = document.getElementById('pasangan-container');
    const i = pasanganCount;
    const div = document.createElement('div');
    div.className = 'pasangan-row flex items-center gap-2';
    div.innerHTML = `
      <input type="text" name="pasangan_kiri_${i}" placeholder="Kiri" class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
      <span class="text-slate-400">→</span>
      <input type="text" name="pasangan_kanan_${i}" placeholder="Kanan" class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
      <button type="button" class="btn-hapus-pasangan rounded-xl border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-600 hover:bg-red-100">✕</button>
    `;
    container?.appendChild(div);
    pasanganCount++;
    attachHapusPasangan();
    updateSoalLivePreview();
  });

  function attachHapusPasangan() {
    document.querySelectorAll('.btn-hapus-pasangan').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.btn-hapus-pasangan').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.pasangan-row')?.remove();
        updateSoalLivePreview();
      });
    });
  }
  attachHapusPasangan();

  formEl?.addEventListener('input', updateSoalLivePreview);
  formEl?.addEventListener('change', updateSoalLivePreview);
  updateSoalLivePreview();

  document.getElementById('btn-soal-cancel')?.addEventListener('click', () => openModalEditorSoal(paketId));

  document.getElementById('form-soal')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tipe = fd.get('tipe');
    const data = {
      id: soal?.id || generateId('soal'),
      tipe,
      pertanyaan: fd.get('pertanyaan').trim(),
      poin: Number(fd.get('poin')) || 1,
    };

    if (tipe === 'pg') {
      const opsi = [];
      let i = 0;
      while (fd.get(`opsi_${i}`) !== null) { opsi.push(fd.get(`opsi_${i}`)); i++; }
      data.opsi = opsi;
      data.jawaban_benar = fd.get('jawaban_benar_pg') || 'A';
    } else if (tipe === 'bs') {
      data.jawaban_benar = fd.get('jawaban_bs') || 'benar';
    } else if (tipe === 'isian') {
      data.jawaban_benar = fd.get('jawaban_isian').trim();
    } else if (tipe === 'menjodohkan') {
      const pasangan = [];
      document.querySelectorAll('.pasangan-row').forEach((row) => {
        const kiri = row.querySelector('[name^="pasangan_kiri"]')?.value.trim();
        const kanan = row.querySelector('[name^="pasangan_kanan"]')?.value.trim();
        if (kiri && kanan) pasangan.push({ kiri, kanan });
      });
      data.pasangan = pasangan;
    } else if (tipe === 'essay') {
      data.rubrik = fd.get('rubrik').trim();
    }

    const paket = state.paketList.find((p) => p.id === paketId);
    if (!paket) return;
    const soalList = [...(paket.soal || [])];
    const idx = soalList.findIndex((s) => s.id === data.id);
    if (idx >= 0) soalList[idx] = data;
    else soalList.push(data);
    await savePaket({ ...paket, soal: soalList });
    openModalEditorSoal(paketId);
    showNotif('Soal berhasil disimpan.');
  });
}

async function hapusSoal(paketId, soalId) {
  const paket = state.paketList.find((p) => p.id === paketId);
  if (!paket) return;
  const soalList = (paket.soal || []).filter((s) => s.id !== soalId);
  await savePaket({ ...paket, soal: soalList });
  openModalEditorSoal(paketId);
  showNotif('Soal dihapus.');
}

async function moveSoal(paketId, soalId, dir) {
  const paket = state.paketList.find((p) => p.id === paketId);
  if (!paket) return;
  const soalList = [...(paket.soal || [])];
  const idx = soalList.findIndex((s) => s.id === soalId);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= soalList.length) return;
  [soalList[idx], soalList[newIdx]] = [soalList[newIdx], soalList[idx]];
  await savePaket({ ...paket, soal: soalList });
  openModalEditorSoal(paketId);
}

// ─── TAB: KELOLA SESI ─────────────────────────────────────────────────────────

function renderTabSesi() {
  const filters = ['semua', 'draft', 'aktif', 'selesai', 'diarsipkan'];
  const filterPills = filters.map((f) => `
    <button type="button" data-filter="${f}" class="filter-pill rounded-full border px-3 py-1.5 text-xs font-semibold transition ${state.activeFilter === f ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}">
      ${f.charAt(0).toUpperCase() + f.slice(1)}
    </button>
  `).join('');

  const filtered = state.sesiList
    .filter((s) => state.activeFilter === 'semua' || s.status === state.activeFilter)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const displayItems = groupSesiItems(filtered);

  return `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Kelola Sesi</p>
           <h3 class="text-2xl font-semibold text-slate-900">Sesi Ujian Saya</h3>
        </div>
        <button type="button" id="btn-buat-sesi" class="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700">
          <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Buat Sesi
        </button>
      </div>
      <div class="flex flex-wrap gap-2">${filterPills}</div>
      ${displayItems.length === 0 ? `
        <div class="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <p class="text-sm text-slate-500">Tidak ada sesi dengan filter ini.</p>
        </div>
      ` : `
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          ${displayItems.map((item) => item.sessions.length > 1 ? renderSesiGroupCard(item.sessions) : renderSesiCard(item.sessions[0])).join('')}
        </div>
      `}
    </div>
  `;
}

function renderMonitorSingleCard(s) {
  const paket = state.paketList.find((p) => p.id === s.paket_id);
  const jawabanList = state.jawabanCache[s.id] || [];
  const submitted = jawabanList.filter((j) => j.submitted_at).length;
  const inProgress = jawabanList.filter((j) => j.started_at && !j.submitted_at).length;
  const violations = jawabanList.reduce((sum, item) => sum + Number(item.pelanggaran_count || 0), 0);

  return `
    <div class="rounded-[24px] border border-amber-200 bg-white p-5 shadow-sm flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900 truncate">${paket?.judul || s.paket_judul || 'Sesi Aktif'}</p>
          <p class="mt-0.5 text-xs text-slate-500">${s.kelas_nama || s.kelas_id || '-'} • ${s.mapel_nama || paket?.mapel_nama || '-'}</p>
        </div>
        <span class="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Aktif</span>
      </div>
      <div class="grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
        <div>
          <p class="text-base font-semibold text-slate-900">${s.durasi_menit || 60}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Menit</p>
        </div>
        <div>
          <p class="text-base font-semibold text-amber-600">${inProgress}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Berjalan</p>
        </div>
        <div>
          <p class="text-base font-semibold text-emerald-600">${submitted}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submit</p>
        </div>
        <div>
          <p class="text-base font-semibold text-rose-600">${violations}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pelanggaran</p>
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        ${s.waktu_mulai ? `<p>Mulai: <strong class="text-slate-800">${formatDateTime(s.waktu_mulai)}</strong></p>` : '<p>Mulai: <strong class="text-slate-800">Manual</strong></p>'}
        <p class="mt-1">Kode akses: <strong class="text-slate-800">${s.kode_akses || '-'}</strong></p>
      </div>
      <div class="flex gap-2">
        <button data-action="monitor-sesi" data-sesi-id="${s.id}" class="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition">Monitor Live</button>
        <button data-action="selesaikan-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Selesaikan</button>
      </div>
    </div>
  `;
}

function renderMonitorGroupCard(sessions) {
  const primary = sessions[0];
  const paket = state.paketList.find((p) => p.id === primary.paket_id);
  const classes = sessions.map((item) => item.kelas_nama || item.kelas_id || '-').filter(Boolean).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
  const totalSubmitted = sessions.reduce((sum, item) => sum + (state.jawabanCache[item.id] || []).filter((jawaban) => jawaban.submitted_at).length, 0);
  const totalInProgress = sessions.reduce((sum, item) => sum + (state.jawabanCache[item.id] || []).filter((jawaban) => jawaban.started_at && !jawaban.submitted_at).length, 0);
  const totalViolations = sessions.reduce((sum, item) => sum + (state.jawabanCache[item.id] || []).reduce((subtotal, jawaban) => subtotal + Number(jawaban.pelanggaran_count || 0), 0), 0);

  return `
    <div class="rounded-[24px] border border-amber-200 bg-white p-5 shadow-sm flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900 truncate">${paket?.judul || primary.paket_judul || 'Batch Sesi Aktif'}</p>
          <p class="mt-0.5 text-xs text-slate-500">${primary.mapel_nama || paket?.mapel_nama || '-'} • ${sessions.length} kelas aktif</p>
        </div>
        <span class="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Batch Aktif</span>
      </div>
      <div class="grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
        <div>
          <p class="text-base font-semibold text-slate-900">${sessions.length}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Kelas</p>
        </div>
        <div>
          <p class="text-base font-semibold text-amber-600">${totalInProgress}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Berjalan</p>
        </div>
        <div>
          <p class="text-base font-semibold text-emerald-600">${totalSubmitted}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Submit</p>
        </div>
        <div>
          <p class="text-base font-semibold text-rose-600">${totalViolations}</p>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pelanggaran</p>
        </div>
      </div>
      <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p><strong>${primary.event_group_label || 'Batch ujian bersama'}</strong></p>
        <p class="mt-1">Kelas aktif: ${classes.join(', ')}</p>
        <p class="mt-1">Kode akses: <strong>${primary.kode_akses || '-'}</strong></p>
      </div>
      <div class="flex gap-2">
        <button data-action="kelola-grup-sesi" data-event-group-id="${primary.event_group_id}" class="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition">Kelola Monitoring</button>
        <button data-action="selesaikan-grup-sesi" data-event-group-id="${primary.event_group_id}" class="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Selesaikan Batch</button>
      </div>
    </div>
  `;
}

function renderTabMonitor() {
  const activeSessions = state.sesiList
    .filter((s) => s.status === 'aktif')
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const displayItems = groupSesiItems(activeSessions);

  const totalSubmitted = activeSessions.reduce((sum, sesi) => sum + (state.jawabanCache[sesi.id] || []).filter((item) => item.submitted_at).length, 0);
  const totalInProgress = activeSessions.reduce((sum, sesi) => sum + (state.jawabanCache[sesi.id] || []).filter((item) => item.started_at && !item.submitted_at).length, 0);
  const totalViolations = activeSessions.reduce((sum, sesi) => sum + (state.jawabanCache[sesi.id] || []).reduce((subtotal, item) => subtotal + Number(item.pelanggaran_count || 0), 0), 0);

  return `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Monitoring Live</p>
          <h3 class="text-2xl font-semibold text-slate-900">Sesi Yang Sedang Berjalan</h3>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Sesi Aktif</p>
          <p class="mt-2 text-3xl font-semibold text-slate-900">${activeSessions.length}</p>
        </div>
        <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Batch / Kartu</p>
          <p class="mt-2 text-3xl font-semibold text-slate-900">${displayItems.length}</p>
        </div>
        <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Sedang Mengerjakan</p>
          <p class="mt-2 text-3xl font-semibold text-amber-600">${totalInProgress}</p>
        </div>
        <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs uppercase tracking-[0.18em] text-slate-500">Pelanggaran Tercatat</p>
          <p class="mt-2 text-3xl font-semibold text-rose-600">${totalViolations}</p>
          <p class="mt-1 text-xs text-slate-400">${totalSubmitted} siswa sudah submit</p>
        </div>
      </div>
      ${displayItems.length === 0 ? `
        <div class="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <p class="text-sm font-semibold text-slate-500">Belum ada sesi aktif untuk dimonitor.</p>
        </div>
      ` : `
        <div class="grid gap-4 md:grid-cols-2">
          ${displayItems.map((item) => item.sessions.length > 1 ? renderMonitorGroupCard(item.sessions) : renderMonitorSingleCard(item.sessions[0])).join('')}
        </div>
      `}
    </div>
  `;
}

function renderSesiScheduleInfo(sesi, tone = 'slate') {
  const startLabel = sesi?.waktu_mulai ? formatDateTime(sesi.waktu_mulai) : 'Manual';
  const endLabel = sesi?.waktu_selesai ? formatDateTime(sesi.waktu_selesai) : 'Mengikuti durasi';
  const toneClasses = {
    sky: 'border-sky-200 bg-sky-50/85 text-sky-900',
    amber: 'border-amber-200 bg-amber-50/85 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50/85 text-emerald-900',
    violet: 'border-violet-200 bg-violet-50/85 text-violet-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return `
    <div class="rounded-[16px] border px-3 py-2 text-[11px] leading-5 ${toneClasses[tone] || toneClasses.slate}">
      <div class="flex flex-wrap gap-x-3 gap-y-0.5">
        <p>Mulai: <strong>${startLabel}</strong></p>
        <p>Berakhir: <strong>${endLabel}</strong></p>
      </div>
    </div>
  `;
}

function getSesiCardTone(status) {
  const themes = {
    draft: {
      accentClass: 'from-sky-600 via-cyan-500 to-teal-400',
      glowClass: 'bg-cyan-200/70',
      badgeClass: 'border-white/25 bg-white/14 text-white',
      chipClass: 'border-sky-100 bg-sky-50 text-sky-700',
      metricCardClass: 'border-sky-100 bg-sky-50/80',
      metricValueClass: 'text-sky-950',
      metricLabelClass: 'text-sky-700/70',
      infoPanelClass: 'border-sky-200 bg-sky-50/85 text-sky-900',
      scheduleTone: 'sky',
      actionNeutralClass: 'border-sky-100 bg-white text-sky-800 hover:bg-sky-50',
      motif: 'Siap disusun',
      surfaceBorderClass: 'border-sky-300 ring-1 ring-sky-100/90',
    },
    aktif: {
      accentClass: 'from-amber-500 via-orange-500 to-rose-400',
      glowClass: 'bg-amber-200/70',
      badgeClass: 'border-white/25 bg-white/14 text-white',
      chipClass: 'border-amber-100 bg-amber-50 text-amber-700',
      metricCardClass: 'border-amber-100 bg-amber-50/80',
      metricValueClass: 'text-amber-950',
      metricLabelClass: 'text-amber-700/70',
      infoPanelClass: 'border-amber-200 bg-amber-50/85 text-amber-900',
      scheduleTone: 'amber',
      actionNeutralClass: 'border-amber-100 bg-white text-amber-800 hover:bg-amber-50',
      motif: 'Sedang berlangsung',
      surfaceBorderClass: 'border-amber-300 ring-1 ring-amber-100/90',
    },
    selesai: {
      accentClass: 'from-emerald-600 via-teal-500 to-cyan-400',
      glowClass: 'bg-emerald-200/70',
      badgeClass: 'border-white/25 bg-white/14 text-white',
      chipClass: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      metricCardClass: 'border-emerald-100 bg-emerald-50/80',
      metricValueClass: 'text-emerald-950',
      metricLabelClass: 'text-emerald-700/70',
      infoPanelClass: 'border-emerald-200 bg-emerald-50/85 text-emerald-900',
      scheduleTone: 'emerald',
      actionNeutralClass: 'border-emerald-100 bg-white text-emerald-800 hover:bg-emerald-50',
      motif: 'Sesi selesai',
      surfaceBorderClass: 'border-emerald-300 ring-1 ring-emerald-100/90',
    },
    diarsipkan: {
      accentClass: 'from-violet-600 via-fuchsia-500 to-indigo-400',
      glowClass: 'bg-violet-200/70',
      badgeClass: 'border-white/25 bg-white/14 text-white',
      chipClass: 'border-violet-100 bg-violet-50 text-violet-700',
      metricCardClass: 'border-violet-100 bg-violet-50/80',
      metricValueClass: 'text-violet-950',
      metricLabelClass: 'text-violet-700/70',
      infoPanelClass: 'border-violet-200 bg-violet-50/85 text-violet-900',
      scheduleTone: 'violet',
      actionNeutralClass: 'border-violet-100 bg-white text-violet-800 hover:bg-violet-50',
      motif: 'Tersimpan di arsip',
      surfaceBorderClass: 'border-violet-300 ring-1 ring-violet-100/90',
    },
    mixed: {
      accentClass: 'from-indigo-600 via-sky-500 to-cyan-400',
      glowClass: 'bg-sky-200/70',
      badgeClass: 'border-white/25 bg-white/14 text-white',
      chipClass: 'border-indigo-100 bg-indigo-50 text-indigo-700',
      metricCardClass: 'border-indigo-100 bg-indigo-50/80',
      metricValueClass: 'text-indigo-950',
      metricLabelClass: 'text-indigo-700/70',
      infoPanelClass: 'border-indigo-200 bg-indigo-50/85 text-indigo-900',
      scheduleTone: 'sky',
      actionNeutralClass: 'border-indigo-100 bg-white text-indigo-800 hover:bg-indigo-50',
      motif: 'Multi kelas',
      surfaceBorderClass: 'border-indigo-300 ring-1 ring-indigo-100/90',
    },
  };

  return themes[status] || themes.draft;
}

function renderSesiGroupCard(sessions) {
  const primary = sessions[0];
  const paket = state.paketList.find((p) => p.id === primary.paket_id);
  const classes = sessions.map((item) => item.kelas_nama || item.kelas_id || '-').filter(Boolean).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
  const totalSubmitted = sessions.reduce((sum, item) => sum + (state.jawabanCache[item.id] || []).filter((jawaban) => jawaban.submitted_at).length, 0);
  const totalJawaban = sessions.reduce((sum, item) => sum + (state.jawabanCache[item.id] || []).length, 0);
  const statusCounts = sessions.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const allDraft = sessions.every((item) => item.status === 'draft');
  const anyActive = sessions.some((item) => item.status === 'aktif');
  const allArchived = sessions.every((item) => item.status === 'diarsipkan');
  const allCompleted = sessions.every((item) => item.status === 'selesai');
  const allFinished = sessions.every((item) => ['selesai', 'diarsipkan'].includes(item.status));
  const canArchiveGroup = sessions.some((item) => item.status === 'selesai') && sessions.every((item) => ['selesai', 'diarsipkan'].includes(item.status));
  const canDeleteGroup = sessions.every((item) => ['selesai', 'diarsipkan'].includes(item.status));
  const badge = allDraft
    ? getStatusSesiBadge('draft')
    : anyActive
      ? getStatusSesiBadge('aktif')
      : allArchived
        ? getStatusSesiBadge('diarsipkan')
        : allCompleted
        ? getStatusSesiBadge('selesai')
        : allFinished
          ? { label: 'Selesai / Arsip', cls: 'border-slate-200 bg-slate-100 text-slate-700' }
          : { label: 'Campuran', cls: 'border-amber-200 bg-amber-50 text-amber-700' };
  const toneKey = allDraft ? 'draft' : anyActive ? 'aktif' : allArchived ? 'diarsipkan' : allFinished ? 'selesai' : 'mixed';
  const tone = getSesiCardTone(toneKey);

  return `
    <div class="overflow-hidden rounded-[22px] border ${tone.surfaceBorderClass} bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.11)]">
      <div class="relative h-[120px] bg-gradient-to-br ${tone.accentClass} p-3 text-white">
        <div class="absolute right-3 top-3 h-14 w-14 rounded-full bg-white/10 blur-2xl"></div>
        <div class="absolute bottom-3 right-3 h-14 w-14 rounded-full ${tone.glowClass} blur-2xl"></div>
        <div class="relative flex h-full flex-col justify-end gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.badgeClass}">${badge.label} • ${tone.motif}</span>
            <span class="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.badgeClass}">Batch ${sessions.length} Kelas</span>
          </div>
          <div>
            <p class="line-clamp-2 text-[15px] font-semibold leading-snug text-white">${paket?.judul || primary.paket_judul || 'Batch Ujian'}</p>
            <p class="mt-0.5 text-[11px] text-white/80">${primary.mapel_nama || paket?.mapel_nama || '-'} • ${primary.event_group_label || 'Batch ujian bersama'}</p>
          </div>
        </div>
      </div>
      <div class="space-y-2 p-3">
      <div class="grid grid-cols-3 gap-1.5">
        <div>
          <div class="rounded-[18px] border ${tone.metricCardClass} px-2.5 py-2.5 text-center">
            <p class="text-sm font-semibold ${tone.metricValueClass}">${sessions.length}</p>
            <p class="text-[9px] font-semibold uppercase tracking-wide ${tone.metricLabelClass}">Kelas</p>
          </div>
        </div>
        <div>
          <div class="rounded-[18px] border ${tone.metricCardClass} px-2.5 py-2.5 text-center">
            <p class="text-sm font-semibold ${tone.metricValueClass}">${primary.durasi_menit || 60} mnt</p>
            <p class="text-[9px] font-semibold uppercase tracking-wide ${tone.metricLabelClass}">Durasi</p>
          </div>
        </div>
        <div>
          <div class="rounded-[18px] border ${tone.metricCardClass} px-2.5 py-2.5 text-center">
            <p class="text-sm font-semibold ${tone.metricValueClass}">${totalSubmitted}/${totalJawaban}</p>
            <p class="text-[9px] font-semibold uppercase tracking-wide ${tone.metricLabelClass}">Submit</p>
          </div>
        </div>
      </div>
      <div class="rounded-[16px] border px-3 py-2 text-[11px] leading-5 ${tone.infoPanelClass}">
        <p><strong>${primary.event_group_label || 'Batch ujian bersama'}</strong></p>
        <p>Kelas: ${classes.join(', ')}</p>
        <p>Kode akses: <strong>${primary.kode_akses || '-'}</strong></p>
        <p>Status: Draft ${statusCounts.draft || 0} • Aktif ${statusCounts.aktif || 0} • Selesai ${statusCounts.selesai || 0} • Arsip ${statusCounts.diarsipkan || 0}</p>
      </div>
      ${renderSesiScheduleInfo(primary, tone.scheduleTone)}
      <div class="flex flex-wrap gap-2">
        ${allDraft ? `<button data-action="edit-grup-sesi" data-event-group-id="${primary.event_group_id}" class="flex-1 rounded-xl border py-2 text-[11px] font-semibold transition ${tone.actionNeutralClass}">Edit Batch</button>` : ''}
        ${allDraft ? `<button data-action="aktivasi-grup-sesi" data-event-group-id="${primary.event_group_id}" class="flex-1 rounded-xl bg-emerald-600 py-2 text-[11px] font-semibold text-white hover:bg-emerald-700 transition">Aktifkan Semua Kelas</button>` : ''}
        ${anyActive ? `<button data-action="selesaikan-grup-sesi" data-event-group-id="${primary.event_group_id}" class="flex-1 rounded-xl bg-blue-600 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 transition">Selesaikan Semua Kelas</button>` : ''}
        ${canArchiveGroup ? `<button data-action="arsipkan-grup-sesi" data-event-group-id="${primary.event_group_id}" class="flex-1 rounded-xl border py-2 text-[11px] font-semibold transition ${tone.actionNeutralClass}">Arsipkan Batch</button>` : ''}
        <button data-action="kelola-grup-sesi" data-event-group-id="${primary.event_group_id}" class="flex-1 rounded-xl border py-2 text-[11px] font-semibold transition ${tone.actionNeutralClass}">Kelola Kelas</button>
        ${canDeleteGroup ? `<button data-action="hapus-grup-sesi" data-event-group-id="${primary.event_group_id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition">Hapus Batch</button>` : ''}
      </div>
      </div>
    </div>
  `;
}

function openModalEditGroupSesi(eventGroupId) {
  const sessions = state.sesiList.filter((item) => item.event_group_id === eventGroupId).sort((a, b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || ''), 'id', { sensitivity: 'base' }));
  const draftSessions = sessions.filter((item) => item.status === 'draft');
  const primary = draftSessions[0] || sessions[0];
  if (!primary || !draftSessions.length) {
    showNotif('Batch hanya bisa diedit saat semua sesi masih draft.', 'error');
    return;
  }

  const paketOptions = state.paketList.map((p) => `<option value="${p.id}" ${primary.paket_id === p.id ? 'selected' : ''}>${p.judul}</option>`).join('');
  showModal(`
    <form id="form-edit-grup-sesi" class="space-y-5">
      <div class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <p><strong>${primary.event_group_label || 'Batch ujian bersama'}</strong></p>
        <p class="mt-1">Perubahan ini akan diterapkan ke ${draftSessions.length} sesi draft dalam batch.</p>
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Paket Soal</label>
        <select name="paket_id" required class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <option value="">-- Pilih Paket --</option>
          ${paketOptions}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Durasi (menit)</label>
          <input type="number" name="durasi_menit" value="${primary.durasi_menit || 60}" min="1" max="300" required class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Kode Akses</label>
          <input type="text" name="kode_akses" value="${primary.kode_akses || ''}" maxlength="8" placeholder="Opsional" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono uppercase focus:border-indigo-400 focus:outline-none"/>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Waktu Mulai (opsional)</label>
          <input type="datetime-local" name="waktu_mulai" value="${formatDateTimeInput(primary.waktu_mulai)}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Waktu Selesai (opsional)</label>
          <input type="datetime-local" name="waktu_selesai" value="${formatDateTimeInput(primary.waktu_selesai)}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Toleransi Pelanggaran</label>
        <input type="number" name="toleransi_pelanggaran" value="${primary.toleransi_pelanggaran ?? 1}" min="0" max="10" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
      </div>
      <label class="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
        <input type="checkbox" name="nilai_dipublish" ${primary.nilai_dipublish ? 'checked' : ''} class="h-4 w-4 rounded accent-indigo-600"/>
        <div>
          <p class="text-sm font-semibold text-slate-800">Publikasi Hasil ke Siswa</p>
          <p class="text-xs text-slate-500">Terapkan untuk semua sesi draft dalam batch ini</p>
        </div>
      </label>
      <div class="flex gap-3 pt-2">
        <button type="button" id="btn-edit-grup-cancel" class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Batal</button>
        <button type="submit" class="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">Simpan Batch</button>
      </div>
    </form>
  `, { title: 'Edit Batch Ujian', wide: true });

  document.getElementById('btn-edit-grup-cancel')?.addEventListener('click', closeModal);
  document.getElementById('form-edit-grup-sesi')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const paketId = fd.get('paket_id');
    const paket = state.paketList.find((item) => item.id === paketId);
    const changes = {
      paket_id: paketId,
      paket_judul: paket?.judul || primary.paket_judul || '',
      acak_soal: paket?.acak_soal ?? primary.acak_soal ?? false,
      acak_opsi: paket?.acak_opsi ?? primary.acak_opsi ?? false,
      soal_snapshot: Array.isArray(paket?.soal) ? paket.soal : (primary.soal_snapshot || []),
      durasi_menit: Number(fd.get('durasi_menit')) || 60,
      kode_akses: String(fd.get('kode_akses') || '').trim().toUpperCase(),
      waktu_mulai: fd.get('waktu_mulai') ? new Date(fd.get('waktu_mulai')).toISOString() : '',
      waktu_selesai: fd.get('waktu_selesai') ? new Date(fd.get('waktu_selesai')).toISOString() : '',
      toleransi_pelanggaran: Math.max(0, Number(fd.get('toleransi_pelanggaran')) || 0),
      nilai_dipublish: fd.get('nilai_dipublish') === 'on',
    };
    closeModal();
    const totalUpdated = await updateSesiGroupDraft(eventGroupId, changes);
    rerender();
    showNotif(`${totalUpdated} sesi draft dalam batch berhasil diperbarui.`);
  });
}

function openModalGroupSesi(eventGroupId) {
  const sessions = state.sesiList
    .filter((item) => item.event_group_id === eventGroupId)
    .sort((a, b) => String(a.kelas_nama || a.kelas_id || '').localeCompare(String(b.kelas_nama || b.kelas_id || ''), 'id', { sensitivity: 'base' }));
  if (!sessions.length) return;

  showModal(`
    <div class="space-y-3">
      ${sessions.map((s) => {
        const badge = getStatusSesiBadge(s.status);
        return `
          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-slate-900">${s.kelas_nama || s.kelas_id || '-'}</p>
                <p class="mt-1 text-xs text-slate-500">${s.mapel_nama || '-'}${s.waktu_mulai ? ` • ${formatDateTime(s.waktu_mulai)}` : ''}</p>
              </div>
              <span class="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${badge.cls}">${badge.label}</span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              ${s.status === 'draft' ? `<button type="button" data-action="edit-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Edit</button>` : ''}
              ${s.status === 'draft' ? `<button type="button" data-action="aktivasi-sesi" data-sesi-id="${s.id}" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition">Aktifkan</button>` : ''}
              ${s.status === 'aktif' ? `<button type="button" data-action="monitor-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Monitor</button>` : ''}
              ${['selesai', 'diarsipkan'].includes(s.status) ? `<button type="button" data-action="lihat-hasil" data-sesi-id="${s.id}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Lihat Hasil</button>` : ''}
              ${s.status === 'selesai' ? `<button type="button" data-action="arsipkan-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Arsipkan</button>` : ''}
              ${['selesai', 'diarsipkan'].includes(s.status) ? `<button type="button" data-action="hapus-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Hapus</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `, { title: sessions[0].event_group_label || 'Kelola Batch Ujian', wide: true });

  document.querySelectorAll('[data-action="aktivasi-sesi"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await changeSesiStatus(btn.dataset.sesiId, 'aktif');
      closeModal();
      if (state.tab === 'monitor') {
        const activeSessions = state.sesiList.filter((sesi) => sesi.status === 'aktif');
        await Promise.all(activeSessions.map((sesi) => loadJawabanForSesi(sesi.id)));
      }
      rerender();
      showNotif('Sesi diaktifkan.');
    });
  });
  document.querySelectorAll('[data-action="edit-sesi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sesi = state.sesiList.find((item) => item.id === btn.dataset.sesiId);
      if (!sesi) return;
      closeModal();
      openModalSesi(sesi);
    });
  });
  document.querySelectorAll('[data-action="monitor-sesi"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal();
      openModalMonitor(btn.dataset.sesiId);
    });
  });
  document.querySelectorAll('[data-action="lihat-hasil"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      closeModal();
      state.tab = 'hasil';
      state.hasilSesiId = btn.dataset.sesiId;
      rerender();
      await loadAndRenderHasil(btn.dataset.sesiId);
    });
  });
  document.querySelectorAll('[data-action="arsipkan-sesi"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await changeSesiStatus(btn.dataset.sesiId, 'diarsipkan');
      closeModal();
      rerender();
      showNotif('Sesi diarsipkan.', 'info');
    });
  });
  document.querySelectorAll('[data-action="hapus-sesi"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus sesi ini beserta jawaban dan rekap nilainya? Tindakan ini tidak dapat dibatalkan.')) return;
      try {
        await removeSesi(btn.dataset.sesiId);
        closeModal();
        rerender();
        showNotif('Sesi berhasil dihapus.', 'info');
      } catch (error) {
        showNotif(error?.message || 'Sesi tidak bisa dihapus.', 'error');
      }
    });
  });
}

function renderSesiCard(s) {
  const paket = state.paketList.find((p) => p.id === s.paket_id);
  const badge = getStatusSesiBadge(s.status);
  const tone = getSesiCardTone(s.status);
  const jawabanList = state.jawabanCache[s.id] || [];
  const submitted = jawabanList.filter((j) => j.submitted_at).length;
  const total = jawabanList.length;
  const batchDraftCount = s.event_group_id ? state.sesiList.filter((item) => item.event_group_id === s.event_group_id && item.status === 'draft').length : 0;
  const canBatchActivate = s.status === 'draft' && batchDraftCount > 1;

  const actionButtons = {
    draft: `
      <button data-action="aktivasi-sesi" data-sesi-id="${s.id}" class="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition">Aktifkan</button>
      ${canBatchActivate ? `<button data-action="aktivasi-grup-sesi" data-event-group-id="${s.event_group_id}" class="flex-1 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition">Aktifkan Semua Kelas</button>` : ''}
      <button data-action="edit-sesi" data-sesi-id="${s.id}" class="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Edit</button>
      <button data-action="hapus-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Hapus</button>
    `,
    aktif: `
      <button data-action="selesaikan-sesi" data-sesi-id="${s.id}" class="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition">Selesaikan</button>
      <button data-action="monitor-sesi" data-sesi-id="${s.id}" class="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Monitor Live</button>
    `,
    selesai: `
      <button data-action="lihat-hasil" data-sesi-id="${s.id}" class="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition">Lihat Hasil</button>
      <button data-action="arsipkan-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">Arsipkan</button>
      <button data-action="hapus-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Hapus</button>
    `,
    diarsipkan: `
      <button data-action="lihat-hasil" data-sesi-id="${s.id}" class="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Lihat Hasil</button>
      <button data-action="hapus-sesi" data-sesi-id="${s.id}" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Hapus</button>
    `,
  };

  return `
    <div class="overflow-hidden rounded-[22px] border ${tone.surfaceBorderClass} bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.11)]">
      <div class="relative h-[120px] bg-gradient-to-br ${tone.accentClass} p-3 text-white">
        <div class="absolute right-3 top-3 h-14 w-14 rounded-full bg-white/10 blur-2xl"></div>
        <div class="absolute bottom-3 right-3 h-14 w-14 rounded-full ${tone.glowClass} blur-2xl"></div>
        <div class="relative flex h-full flex-col justify-end gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.badgeClass}">${badge.label} • ${tone.motif}</span>
            <span class="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.badgeClass}">${s.kelas_nama || s.kelas_id || '-'}</span>
          </div>
          <div>
            <p class="line-clamp-2 text-[15px] font-semibold leading-snug text-white">${paket?.judul || 'Paket tidak ditemukan'}</p>
            <p class="mt-0.5 text-[11px] text-white/80">${paket?.mapel_nama || '-'} • ${s.durasi_menit || 60} menit</p>
          </div>
        </div>
      </div>
      <div class="space-y-2 p-3">
      <div class="grid grid-cols-3 gap-1.5">
        <div>
          <div class="rounded-[18px] border ${tone.metricCardClass} px-2.5 py-2.5 text-center">
            <p class="text-sm font-semibold ${tone.metricValueClass}">${s.durasi_menit || 60} mnt</p>
            <p class="text-[9px] font-semibold uppercase tracking-wide ${tone.metricLabelClass}">Durasi</p>
          </div>
        </div>
        <div>
          <div class="rounded-[18px] border ${tone.metricCardClass} px-2.5 py-2.5 text-center">
            <p class="text-sm font-semibold ${tone.metricValueClass}">${(paket?.soal || []).length}</p>
            <p class="text-[9px] font-semibold uppercase tracking-wide ${tone.metricLabelClass}">Soal</p>
          </div>
        </div>
        <div>
          <div class="rounded-[18px] border ${tone.metricCardClass} px-2.5 py-2.5 text-center">
            <p class="text-sm font-semibold ${tone.metricValueClass}">${submitted}/${total}</p>
            <p class="text-[9px] font-semibold uppercase tracking-wide ${tone.metricLabelClass}">Submit</p>
          </div>
        </div>
      </div>
      <div class="rounded-[16px] border px-3 py-2 text-[11px] leading-5 ${tone.infoPanelClass}">
        ${s.event_group_id ? `<p>Batch: <strong>${s.event_group_label || s.event_group_id}</strong>${batchDraftCount > 1 ? ` • ${batchDraftCount} draft` : ''}</p>` : ''}
        <p>Kode akses: <strong>${s.kode_akses || '-'}</strong></p>
      </div>
      ${renderSesiScheduleInfo(s, tone.scheduleTone)}
      <div class="flex flex-wrap gap-2">${actionButtons[s.status] || ''}</div>
      </div>
    </div>
  `;
}

// ─── MODAL: BUAT/EDIT SESI ────────────────────────────────────────────────────

function openModalSesi(sesi = null, prefilledPaketId = null) {
  const isEdit = !!sesi;
  const selectedPaket = state.paketList.find((p) => p.id === (sesi?.paket_id || prefilledPaketId)) || null;
  const paketOptions = state.paketList.map((p) => {
    const sel = (sesi?.paket_id === p.id) || (!sesi && prefilledPaketId === p.id);
    return `<option value="${p.id}" ${sel ? 'selected' : ''}>${p.judul}</option>`;
  }).join('');

  const kode = sesi?.kode_akses || '';

  const getEligibleAssignments = (paketId) => {
    const list = state.assignments;
    const unique = new Map();
    list.forEach((item) => {
      const key = item.id || `${item.kelas_id}_${item.mapel_id}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    return Array.from(unique.values()).sort((a, b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || ''), 'id', { sensitivity: 'base' }));
  };

  const renderAssignmentTargets = (paketId) => {
    if (isEdit) return '';
    const options = getEligibleAssignments(paketId);
    if (!options.length) {
      return '<p class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Belum ada relasi mengajar yang bisa dipilih untuk paket ini.</p>';
    }
    return `
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Target Distribusi</label>
          <p class="text-xs text-slate-500">Pilih relasi kelas dan mata pelajaran yang akan menerima kuiz ini. Sistem akan membuat satu sesi terpisah untuk tiap target.</p>
        </div>
        <div class="grid gap-2 md:grid-cols-2">
          ${options.map((item) => `
            <label class="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" name="assignment_ids" value="${item.id}" class="mt-1 h-4 w-4 rounded accent-indigo-600"/>
              <div>
                <p class="text-sm font-semibold text-slate-800">${item.kelas_nama || item.kelas_id || '-'}</p>
                <p class="text-xs text-slate-500">${item.mapel_nama || '-'}${item.assignment_label ? ` • ${item.assignment_label}` : ''}</p>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  };

  const initialPaketId = sesi?.paket_id || prefilledPaketId || state.paketList[0]?.id || '';

  showModal(`
    <form id="form-sesi" class="space-y-5">
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Paket Soal</label>
        ${selectedPaket && !isEdit ? `
          <input type="hidden" name="paket_id" value="${selectedPaket.id}" />
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p class="text-sm font-semibold text-slate-900">${selectedPaket.judul || 'Paket Soal'}</p>
            <p class="mt-1 text-xs text-slate-500">Dipilih dari Buat Soal. Target kelas ditentukan di bawah.</p>
          </div>
        ` : `
          <select name="paket_id" id="form-sesi-paket" required class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <option value="">-- Pilih Paket --</option>
            ${paketOptions}
          </select>
        `}
      </div>
      ${!isEdit ? `<div id="assignment-target-container">${renderAssignmentTargets(initialPaketId)}</div>` : ''}
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Durasi (menit)</label>
          <input type="number" name="durasi_menit" value="${sesi?.durasi_menit || 60}" min="1" max="300" required
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Kode Akses</label>
          <div class="flex gap-2">
            <input type="text" name="kode_akses" id="input-kode-akses" value="${kode}" maxlength="8" placeholder="Opsional"
              class="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-mono uppercase focus:border-indigo-400 focus:outline-none"/>
            <button type="button" id="btn-gen-kode" class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">Acak</button>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Waktu Mulai (opsional)</label>
          <input type="datetime-local" name="waktu_mulai" value="${formatDateTimeInput(sesi?.waktu_mulai)}"
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Waktu Selesai (opsional)</label>
          <input type="datetime-local" name="waktu_selesai" value="${formatDateTimeInput(sesi?.waktu_selesai)}"
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Toleransi Pelanggaran</label>
        <input type="number" name="toleransi_pelanggaran" value="${sesi?.toleransi_pelanggaran ?? 1}" min="0" max="10"
          class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none"/>
        <p class="mt-1 text-xs text-slate-500">0 = langsung auto-submit. 1 = satu kali peringatan, pelanggaran berikutnya auto-submit.</p>
      </div>
      <label class="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
        <input type="checkbox" name="nilai_dipublish" ${sesi?.nilai_dipublish ? 'checked' : ''} class="h-4 w-4 rounded accent-indigo-600"/>
        <div>
          <p class="text-sm font-semibold text-slate-800">Publikasi Hasil ke Siswa</p>
          <p class="text-xs text-slate-500">Siswa dapat melihat jawaban benar dan nilai setelah selesai</p>
        </div>
      </label>
      <div class="flex gap-3 pt-2">
        <button type="button" id="btn-sesi-cancel" class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Batal</button>
        <button type="submit" class="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">${isEdit ? 'Simpan' : 'Buat Sesi'}</button>
      </div>
    </form>
  `, { title: isEdit ? 'Edit Sesi Ujian' : 'Buat Sesi Ujian Baru' });

  document.getElementById('btn-sesi-cancel')?.addEventListener('click', closeModal);
  document.getElementById('btn-gen-kode')?.addEventListener('click', () => {
    const el = document.getElementById('input-kode-akses');
    if (el) el.value = generateAccessCode();
  });
  document.getElementById('form-sesi-paket')?.addEventListener('change', (event) => {
    if (isEdit) return;
    const container = document.getElementById('assignment-target-container');
    if (!container) return;
    container.innerHTML = renderAssignmentTargets(event.target.value);
  });

  document.getElementById('form-sesi')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const paketId = fd.get('paket_id');
    const paket = state.paketList.find((p) => p.id === paketId);
    const baseData = {
      paket_id: paketId,
      paket_judul: paket?.judul || sesi?.paket_judul || '',
      mapel_id: paket?.mapel_id || sesi?.mapel_id || '',
      mapel_nama: paket?.mapel_nama || sesi?.mapel_nama || '',
      tahun_ajaran_id: state.context?.tahun_ajaran_aktif || sesi?.tahun_ajaran_id || '',
      semester_id: state.context?.semester_aktif || sesi?.semester_id || '',
      acak_soal: paket?.acak_soal ?? sesi?.acak_soal ?? false,
      acak_opsi: paket?.acak_opsi ?? sesi?.acak_opsi ?? false,
      soal_snapshot: Array.isArray(paket?.soal) ? paket.soal : (sesi?.soal_snapshot || []),
      toleransi_pelanggaran: Math.max(0, Number(fd.get('toleransi_pelanggaran')) || 0),
      durasi_menit: Number(fd.get('durasi_menit')) || 60,
      kode_akses: fd.get('kode_akses').trim().toUpperCase(),
      waktu_mulai: fd.get('waktu_mulai') ? new Date(fd.get('waktu_mulai')).toISOString() : '',
      waktu_selesai: fd.get('waktu_selesai') ? new Date(fd.get('waktu_selesai')).toISOString() : '',
      nilai_dipublish: fd.get('nilai_dipublish') === 'on',
      status: sesi?.status || 'draft',
    };

    if (isEdit) {
      const data = {
        id: sesi?.id || generateId('sesi'),
        assignment_id: sesi?.assignment_id || '',
        kelas_id: sesi?.kelas_id || '',
        kelas_nama: sesi?.kelas_nama || '',
        mapel_id: sesi?.mapel_id || '',
        mapel_nama: sesi?.mapel_nama || '',
        ...baseData,
      };
      closeModal();
      await saveSesi(data);
      rerender();
      showNotif('Sesi diperbarui.');
      return;
    }

    const selectedAssignmentIds = fd.getAll('assignment_ids').filter(Boolean);
    const eligibleAssignments = getEligibleAssignments(paketId);
    const chosenAssignments = eligibleAssignments.filter((item) => selectedAssignmentIds.includes(item.id));
    if (!chosenAssignments.length) {
      showNotif('Pilih minimal satu kelas target.', 'error');
      return;
    }

    const eventGroupId = generateId('event_group');
    closeModal();
    await Promise.all(chosenAssignments.map((assignment) => saveSesi({
      id: generateId('sesi'),
      assignment_id: assignment.id || '',
      kelas_id: assignment.kelas_id || '',
      kelas_nama: assignment.kelas_nama || '',
      mapel_id: assignment.mapel_id || '',
      mapel_nama: assignment.mapel_nama || '',
      event_group_id: eventGroupId,
        event_group_label: `${paket?.judul || 'Ujian'} • ${baseData.waktu_mulai ? formatDateTime(baseData.waktu_mulai) : 'Multi Kelas'}`,
      ...baseData,
    })));
    rerender();
    showNotif(`Berhasil membuat ${chosenAssignments.length} sesi untuk kelas terpilih.`);
  });
}

// ─── MODAL: LIVE MONITOR ──────────────────────────────────────────────────────

async function openModalMonitor(sesiId) {
  state.monitorSesiId = sesiId;
  state.monitorTab = 'hasil';
  const sesi = state.sesiList.find((s) => s.id === sesiId);
  const paket = state.paketList.find((p) => p.id === sesi?.paket_id);

  showModal(`
    <div id="monitor-content" class="space-y-4">
      <div class="text-center py-8 text-slate-500 text-sm">Memuat data…</div>
    </div>
  `, { title: `Monitor: ${paket?.judul || sesiId}`, wide: true });

  await refreshMonitor(sesiId);
}

async function refreshMonitor(sesiId) {
  delete state.jawabanCache[sesiId];
  const jawaban = await loadJawabanForSesi(sesiId);
  const sesi = state.sesiList.find((s) => s.id === sesiId);
  const paket = state.paketList.find((p) => p.id === sesi?.paket_id);
  const participants = await getSesiParticipants(sesi, jawaban);

  const submitted = jawaban.filter((j) => j.submitted_at).length;
  const inProgress = jawaban.filter((j) => j.started_at && !j.submitted_at).length;
  const totalPelanggaran = jawaban.reduce((sum, item) => sum + Number(item.pelanggaran_count || 0), 0);

  const formatPelanggaranType = (type) => {
    const map = {
      security: 'Keamanan',
      visibility: 'Pindah Tab',
      blur: 'Fokus Hilang',
      fullscreen: 'Keluar Fullscreen',
    };
    return map[type] || type || '-';
  };

  const rows = participants.map((m, idx) => {
    const j = m.jawabanDoc || jawaban.find((jw) => jw.siswa_id === m.siswa_id);
    let statusBadge = '<span class="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Belum Mulai</span>';
    let skor = '-';
    if (j?.submitted_at) {
      statusBadge = '<span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Selesai</span>';
      if (paket) {
        const r = hitungSkorJawaban(paket, j.jawaban || {}, j.nilai_manual || {});
        skor = `${r.nilaiAkhir}/100 <span class="text-slate-400 font-normal">(${r.total}/${r.maxTotal} poin)</span>`;
      }
    } else if (j?.started_at) {
      statusBadge = '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Sedang Mengerjakan</span>';
    }
    return `
      <tr class="border-b border-slate-100">
        <td class="py-3 pr-3 text-sm font-medium text-slate-800">${idx + 1}</td>
        <td class="py-3 pr-3 text-sm text-slate-700">${m.siswa_nama || '-'}</td>
        <td class="py-3 pr-3">${statusBadge}</td>
        <td class="py-3 text-sm font-semibold text-slate-800 text-right">${skor}</td>
      </tr>
    `;
  }).join('');

  const violationRows = participants
    .map((m) => {
    const j = m.jawabanDoc || jawaban.find((jw) => jw.siswa_id === m.siswa_id);
    const count = Number(j?.pelanggaran_count || 0);
    const tolerance = Number(sesi?.toleransi_pelanggaran || j?.toleransi_pelanggaran || 0);
    const latest = Array.isArray(j?.pelanggaran_log) && j.pelanggaran_log.length ? j.pelanggaran_log[j.pelanggaran_log.length - 1] : null;
    const status = j?.submitted_by_security
      ? '<span class="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Auto-submit</span>'
      : count > 0
        ? '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Tercatat</span>'
        : '<span class="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Aman</span>';
    const hasViolation = count > 0 || Boolean(j?.submitted_by_security) || (Array.isArray(j?.pelanggaran_log) && j.pelanggaran_log.length > 0);
    const canReset = !!j && hasViolation;
    return `
      <tr class="border-b border-slate-100">
        <td class="py-3 pr-3 text-sm text-slate-700">${m.siswa_nama || '-'}</td>
        <td class="py-3 pr-3 text-sm font-semibold text-slate-800">${count}</td>
        <td class="py-3 pr-3 text-sm text-slate-600">${tolerance}</td>
        <td class="py-3 pr-3">${status}</td>
        <td class="py-3 pr-3 text-xs text-slate-600">${latest ? `${formatPelanggaranType(latest.type)} • ${formatDateTime(latest.at)}<br><span class="text-[11px] text-slate-500">${latest.reason || ''}</span>` : '-'}</td>
        <td class="py-3 text-right">${canReset ? `<button type="button" data-action="reset-pelanggaran" data-jawaban-id="${j.id}" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition">Reset Kesempatan</button>` : '<span class="text-xs text-slate-400">-</span>'}</td>
      </tr>
    `;
  })
    .filter((row, index) => {
      const participant = participants[index];
      const j = participant?.jawabanDoc;
      return Boolean(j && (Number(j.pelanggaran_count || 0) > 0 || j.submitted_by_security || (Array.isArray(j.pelanggaran_log) && j.pelanggaran_log.length > 0)));
    })
    .join('');

  const content = document.getElementById('monitor-content');
  if (!content) return;
  content.innerHTML = `
    <div class="grid grid-cols-4 gap-3 rounded-2xl bg-slate-50 p-4">
      <div class="text-center"><p class="text-2xl font-semibold text-slate-900">${participants.length}</p><p class="text-xs text-slate-500 mt-1">Total Siswa</p></div>
      <div class="text-center"><p class="text-2xl font-semibold text-amber-600">${inProgress}</p><p class="text-xs text-slate-500 mt-1">Sedang Mengerjakan</p></div>
      <div class="text-center"><p class="text-2xl font-semibold text-emerald-600">${submitted}</p><p class="text-xs text-slate-500 mt-1">Selesai</p></div>
      <div class="text-center"><p class="text-2xl font-semibold text-rose-600">${totalPelanggaran}</p><p class="text-xs text-slate-500 mt-1">Pelanggaran</p></div>
    </div>
    <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Toleransi pelanggaran sesi ini: <strong>${Number(sesi?.toleransi_pelanggaran || 0)}</strong> per siswa.
    </div>
    <div class="flex gap-2">
      <button id="btn-refresh-monitor" class="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">↻ Refresh</button>
      <button id="btn-paksa-selesai" class="flex-1 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition">Paksa Selesaikan</button>
    </div>
    <div class="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
      <button type="button" data-monitor-tab="hasil" class="rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${state.monitorTab === 'hasil' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}">Tabel Hasil</button>
      <button type="button" data-monitor-tab="pelanggaran" class="rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${state.monitorTab === 'pelanggaran' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}">Tabel Pelanggaran</button>
    </div>
    <div class="overflow-x-auto ${state.monitorTab === 'hasil' ? '' : 'hidden'}" data-monitor-panel="hasil">
      <table class="w-full">
        <thead><tr class="border-b-2 border-slate-200">
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">No</th>
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nama</th>
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
          <th class="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Nilai (/100)</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="py-4 text-center text-sm text-slate-500">Tidak ada data anggota kelas.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-slate-200 p-4 ${state.monitorTab === 'pelanggaran' ? '' : 'hidden'}" data-monitor-panel="pelanggaran">
      <p class="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Live Pelanggaran</p>
      <table class="w-full">
        <thead><tr class="border-b-2 border-slate-200">
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nama</th>
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Count</th>
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Toleransi</th>
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
          <th class="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Terakhir</th>
          <th class="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
        </tr></thead>
        <tbody>${violationRows || '<tr><td colspan="6" class="py-4 text-center text-sm text-slate-500">Belum ada log pelanggaran.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll('[data-monitor-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.monitorTab = btn.dataset.monitorTab || 'hasil';
      refreshMonitor(sesiId);
    });
  });
  document.getElementById('btn-refresh-monitor')?.addEventListener('click', () => refreshMonitor(sesiId));
  document.getElementById('btn-paksa-selesai')?.addEventListener('click', async () => {
    if (!confirm('Paksa selesaikan semua siswa yang masih mengerjakan?')) return;
    await changeSesiStatus(sesiId, 'selesai');
    closeModal();
    rerender();
    showNotif('Sesi diselesaikan paksa.');
  });
  document.querySelectorAll('[data-action="reset-pelanggaran"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const jawabanId = btn.dataset.jawabanId;
      if (!jawabanId) return;
      if (!confirm('Reset pelanggaran siswa ini dan berikan kesempatan ulang?')) return;
      const ok = await resetPelanggaranSiswa(sesiId, jawabanId);
      if (!ok) {
        showNotif('Gagal mereset pelanggaran siswa.', 'error');
        return;
      }
      await refreshMonitor(sesiId);
      showNotif('Kesempatan ulang berhasil diberikan.');
    });
  });
}

// ─── TAB: REKAP HASIL ─────────────────────────────────────────────────────────

function renderTabHasil() {
  const selesaiSesi = state.sesiList.filter((s) => ['selesai', 'diarsipkan'].includes(s.status));
  const sesiOptions = selesaiSesi.map((s) => {
    const p = state.paketList.find((x) => x.id === s.paket_id);
    return `<option value="${s.id}" ${state.hasilSesiId === s.id ? 'selected' : ''}>${p?.judul || 'Paket'} — ${s.kelas_nama || '-'} (${formatDateTime(s.updated_at).split(',')[0]})</option>`;
  }).join('');

  return `
    <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Rekap Hasil</p>
           <h3 class="text-2xl font-semibold text-slate-900">Analitik Ujian</h3>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Pilih Sesi</label>
        <select id="hasil-sesi-select" class="w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <option value="">-- Pilih Sesi --</option>
          ${sesiOptions}
        </select>
      </div>
      <div id="hasil-content">
        ${state.hasilSesiId ? '<div class="text-center py-8 text-slate-500 text-sm">Memuat hasil…</div>' : `
          <div class="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <p class="text-sm text-slate-500">Pilih sesi untuk melihat rekap hasil.</p>
          </div>
        `}
      </div>
    </div>
  `;
}

async function loadAndRenderHasil(sesiId) {
  state.hasilSesiId = sesiId;
  const content = document.getElementById('hasil-content');
  if (!content) return;
  content.innerHTML = '<div class="text-center py-8 text-slate-500 text-sm">Memuat hasil…</div>';

  const sesi = state.sesiList.find((s) => s.id === sesiId);
  const paket = state.paketList.find((p) => p.id === sesi?.paket_id);
  if (!sesi || !paket) { content.innerHTML = '<p class="text-sm text-red-500">Data sesi atau paket tidak ditemukan.</p>'; return; }

  delete state.jawabanCache[sesiId];
  const jawaban = await loadJawabanForSesi(sesiId);
  const participants = await getSesiParticipants(sesi, jawaban);
  const submitted = jawaban.filter((j) => j.submitted_at);

  const scored = submitted.map((j) => {
    const r = hitungSkorJawaban(paket, j.jawaban || {}, j.nilai_manual || {});
    return { ...j, ...r };
  });
  const scoredMap = new Map(scored.map((item) => [item.siswa_id, item]));

  const nilaiList = scored.map((s) => s.nilaiAkhir);
  const avg = nilaiList.length > 0 ? Math.round(nilaiList.reduce((a, b) => a + b, 0) / nilaiList.length) : 0;
  const highest = nilaiList.length > 0 ? Math.max(...nilaiList) : 0;
  const lowest = nilaiList.length > 0 ? Math.min(...nilaiList) : 0;
  const essayPerlu = hasEssayPerluKoreksi(paket, jawaban);

  const stats = hitungStatistikSoal(paket, submitted);

  // Score distribution
  const ranges = [[0, 59], [60, 69], [70, 79], [80, 89], [90, 100]];
  const distData = ranges.map(([lo, hi]) => ({
    label: `${lo}–${hi}`,
    count: scored.filter((s) => s.nilaiAkhir >= lo && s.nilaiAkhir <= hi).length,
  }));
  const maxCount = Math.max(...distData.map((d) => d.count), 1);

  const rows = participants.map((participant, i) => {
    const jawabanDoc = participant.jawabanDoc;
    const nilaiItem = jawabanDoc?.siswa_id ? scoredMap.get(jawabanDoc.siswa_id) : null;
    const durasi = jawabanDoc?.started_at && jawabanDoc?.submitted_at
      ? Math.round((new Date(jawabanDoc.submitted_at) - new Date(jawabanDoc.started_at)) / 60000) + ' mnt'
      : jawabanDoc?.started_at ? 'Berjalan' : '-';
    const essayBadge = essayPerlu && jawabanDoc?.submitted_at && !jawabanDoc?.essay_graded
      ? '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Perlu Koreksi</span>'
      : '';
    const statusLabel = jawabanDoc?.submitted_at
      ? formatDateTime(jawabanDoc.submitted_at)
      : jawabanDoc?.started_at
        ? 'Sedang mengerjakan'
        : 'Belum mulai';
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
        <td class="py-3 pr-3 text-sm text-slate-500">${i + 1}</td>
        <td class="py-3 pr-3 text-sm font-medium text-slate-900">${participant.siswa_nama || '-'}</td>
        <td class="py-3 pr-3 text-sm text-slate-700">${nilaiItem ? `${nilaiItem.total}/${nilaiItem.maxTotal} poin` : '-'}</td>
        <td class="py-3 pr-3">
          ${nilaiItem
            ? `<span class="inline-block rounded-full px-3 py-1 text-sm font-bold ${nilaiItem.nilaiAkhir >= 75 ? 'bg-emerald-50 text-emerald-700' : nilaiItem.nilaiAkhir >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}">${nilaiItem.nilaiAkhir}/100</span>`
            : '<span class="inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">-</span>'}
        </td>
        <td class="py-3 pr-3 text-sm text-slate-500">${durasi}</td>
        <td class="py-3 pr-3 text-sm text-slate-500">${statusLabel}</td>
        <td class="py-3">${essayBadge}</td>
        <td class="py-3">
          ${jawabanDoc?.id
            ? `<button data-action="koreksi-essay" data-jawaban-id="${jawabanDoc.id}" class="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Detail</button>`
            : '<span class="text-xs text-slate-300">-</span>'}
        </td>
      </tr>
    `;
  }).join('');

  const soalStats = (paket.soal || []).map((s, i) => {
    const st = stats[s.id] || {};
    const pct = st.persen_benar ?? null;
    const barColor = pct === null ? 'bg-slate-300' : pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
    const pctLabel = pct === null ? '-' : `${pct}%`;
    return `
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
        <div class="flex items-start gap-3">
          <span class="mt-1 w-6 shrink-0 text-center text-xs font-bold text-slate-400">${i + 1}</span>
          <div class="flex-1 min-w-0">${renderGuruMathBlock(s.pertanyaan, { tone: 'slate', className: 'text-xs leading-5 max-h-[80px] overflow-hidden' })}</div>
          <span class="mt-1 w-8 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-center text-slate-600 border-slate-200 bg-white">${TIPE_SOAL[s.tipe]?.charAt(0) || '?'}</span>
        </div>
        <div class="mt-3 flex items-center gap-3 pl-9">
          <div class="flex-1">
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-2 rounded-full ${barColor} transition-all" style="width: ${pct ?? 0}%"></div>
          </div>
          </div>
          <span class="w-8 shrink-0 text-right text-xs font-semibold ${pct === null ? 'text-slate-400' : pct >= 70 ? 'text-emerald-600' : 'text-red-600'}">${pctLabel}</span>
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <div class="space-y-5">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-[20px] border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p class="text-2xl font-semibold text-slate-900">${submitted.length}</p>
          <p class="text-xs text-slate-500 mt-1">Peserta Submit</p>
        </div>
        <div class="rounded-[20px] border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p class="text-2xl font-semibold text-slate-900">${avg}<span class="text-base text-slate-400">/100</span></p>
          <p class="text-xs text-slate-500 mt-1">Rata-rata Nilai</p>
        </div>
        <div class="rounded-[20px] border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p class="text-2xl font-semibold text-emerald-600">${highest}<span class="text-base text-emerald-400">/100</span></p>
          <p class="text-xs text-slate-500 mt-1">Nilai Tertinggi</p>
        </div>
        <div class="rounded-[20px] border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p class="text-2xl font-semibold ${lowest < 60 ? 'text-red-600' : 'text-slate-900'}">${lowest}<span class="text-base ${lowest < 60 ? 'text-red-400' : 'text-slate-400'}">/100</span></p>
          <p class="text-xs text-slate-500 mt-1">Nilai Terendah</p>
        </div>
      </div>

      ${essayPerlu ? `
        <div class="rounded-[20px] border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
          <svg viewBox="0 0 24 24" class="h-5 w-5 text-amber-600 shrink-0 stroke-current" fill="none" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <p class="text-sm font-semibold text-amber-800">Ada soal essay yang belum dikoreksi. Klik "Detail" pada baris siswa untuk mengoreksi.</p>
        </div>
      ` : ''}

      <div class="flex flex-wrap gap-2">
        <button id="btn-refresh-hasil" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
          <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="1.8"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
          Refresh
        </button>
        <button id="btn-export-csv" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
          <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export CSV
        </button>
        <button id="btn-kirim-penilaian" class="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
          <svg viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="1.8"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          Kirim ke Penilaian
        </button>
      </div>

      <div class="rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div class="px-5 py-4 border-b border-slate-100">
          <p class="text-sm font-semibold text-slate-700">Rekap Per Siswa</p>
        </div>
        <table class="w-full">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">No</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nama</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Skor (X/Y)</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Nilai (/100)</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Durasi</th>
              <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Submit</th>
              <th class="px-5 py-3"></th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            ${rows || '<tr><td colspan="8" class="py-8 text-center text-sm text-slate-500">Belum ada siswa yang submit.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm font-semibold text-slate-700 mb-4">Distribusi Nilai</p>
        <div class="flex items-end gap-3 h-24">
          ${distData.map((d) => `
            <div class="flex flex-1 flex-col items-center gap-1">
              <span class="text-xs font-semibold text-slate-600">${d.count}</span>
              <div class="w-full rounded-t-lg bg-indigo-500 transition-all" style="height: ${d.count > 0 ? Math.round((d.count / maxCount) * 72) : 4}px"></div>
              <span class="text-[10px] text-slate-400">${d.label}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-sm font-semibold text-slate-700 mb-4">Statistik Per Soal</p>
        <div class="space-y-3">${soalStats || '<p class="text-sm text-slate-500">Tidak ada soal.</p>'}</div>
      </div>
    </div>
  `;

  document.getElementById('btn-refresh-hasil')?.addEventListener('click', () => {
    if (state.hasilSesiId) loadAndRenderHasil(state.hasilSesiId);
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const csvRows = [['No', 'Nama Siswa', 'Skor', 'Nilai Akhir', 'Durasi (mnt)', 'Status / Submit']];
    participants.forEach((participant, i) => {
      const jawabanDoc = participant.jawabanDoc;
      const nilaiItem = jawabanDoc?.siswa_id ? scoredMap.get(jawabanDoc.siswa_id) : null;
      const dur = jawabanDoc?.started_at && jawabanDoc?.submitted_at
        ? Math.round((new Date(jawabanDoc.submitted_at) - new Date(jawabanDoc.started_at)) / 60000)
        : '';
      const status = jawabanDoc?.submitted_at
        ? formatDateTime(jawabanDoc.submitted_at)
        : jawabanDoc?.started_at
          ? 'Sedang mengerjakan'
          : 'Belum mulai';
      csvRows.push([i + 1, participant.siswa_nama || '-', nilaiItem ? `${nilaiItem.total}/${nilaiItem.maxTotal}` : '-', nilaiItem?.nilaiAkhir ?? '-', dur, status]);
    });
    exportToCSV(csvRows, `kuiz_${sesi.id}_hasil.csv`);
  });

  document.getElementById('btn-kirim-penilaian')?.addEventListener('click', async () => {
    await openModalKirimKePenilaian(sesiId);
  });

  document.querySelectorAll('[data-action="koreksi-essay"]').forEach((btn) => {
    btn.addEventListener('click', () => openModalKoreksiEssay(btn.dataset.jawabanId, sesiId));
  });
}

// ─── MODAL: KOREKSI ESSAY ─────────────────────────────────────────────────────

async function openModalKoreksiEssay(jawabanId, sesiId) {
  const jawaban = (state.jawabanCache[sesiId] || []).find((j) => j.id === jawabanId);
  if (!jawaban) return;
  const sesi = state.sesiList.find((s) => s.id === sesiId);
  const paket = state.paketList.find((p) => p.id === sesi?.paket_id);
  if (!paket) return;

  const essaySoal = (paket.soal || []).filter((s) => s.tipe === 'essay');

  const essayForms = essaySoal.map((s, i) => {
    const jawabanSiswa = jawaban.jawaban?.[s.id] || '-';
    const nilaiSaat = jawaban.nilai_manual?.[s.id] ?? '';
    return `
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 mr-2">Soal ${i + 1} — Essay</span>
            <span class="text-xs text-slate-500">Maks: ${s.poin || 10} poin</span>
          </div>
        </div>
        ${renderGuruMathBlock(s.pertanyaan || '', { tone: 'indigo', className: 'font-medium' })}
        ${s.rubrik ? renderGuruMathBlock(s.rubrik, { tone: 'slate', className: 'text-xs leading-5' }) : ''}
        <div class="rounded-xl border border-slate-200 bg-white p-3">
          <p class="text-xs font-semibold text-slate-400 mb-1">Jawaban Siswa</p>
          ${renderGuruMathBlock(jawabanSiswa, { tone: 'amber' })}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Nilai (0–${s.poin || 10})</label>
            <input type="number" class="essay-nilai-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              data-soal-id="${s.id}" data-max="${s.poin || 10}" min="0" max="${s.poin || 10}" value="${nilaiSaat}" placeholder="0"/>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Komentar</label>
            <input type="text" class="essay-komentar-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              data-soal-id="${s.id}" value="${jawaban.komentar_guru?.[s.id] || ''}" placeholder="Komentar (opsional)"/>
          </div>
        </div>
      </div>
    `;
  }).join('');

  showModal(`
    <div class="space-y-4">
      <div class="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
        <p class="text-sm font-semibold text-indigo-900">${jawaban.siswa_nama || 'Siswa'}</p>
        <p class="text-xs text-indigo-600">Submit: ${formatDateTime(jawaban.submitted_at)}</p>
      </div>
      ${essayForms.length === 0 ? '<p class="text-sm text-slate-500 text-center py-4">Tidak ada soal essay pada paket ini.</p>' : essayForms}
      <div class="flex gap-3 pt-2">
        <button type="button" id="btn-essay-cancel" class="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Batal</button>
        <button type="button" id="btn-essay-save" class="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition">Simpan Penilaian</button>
      </div>
    </div>
  `, { title: `Koreksi Essay: ${jawaban.siswa_nama}`, wide: true });

  document.getElementById('btn-essay-cancel')?.addEventListener('click', closeModal);
  document.getElementById('btn-essay-save')?.addEventListener('click', async () => {
    const nilaiManual = { ...(jawaban.nilai_manual || {}) };
    const komentarGuru = { ...(jawaban.komentar_guru || {}) };
    document.querySelectorAll('.essay-nilai-input').forEach((inp) => {
      const soalId = inp.dataset.soalId;
      const max = Number(inp.dataset.max);
      nilaiManual[soalId] = Math.min(Number(inp.value) || 0, max);
    });
    document.querySelectorAll('.essay-komentar-input').forEach((inp) => {
      komentarGuru[inp.dataset.soalId] = inp.value.trim();
    });
    await saveEssayGrading(jawabanId, nilaiManual, komentarGuru, sesiId, paket);
    closeModal();
    showNotif('Penilaian essay disimpan.');
    await loadAndRenderHasil(sesiId);
  });
}

// ─── PAGE RENDER ──────────────────────────────────────────────────────────────

function rerender() {
  const box = document.getElementById('kuiz-tab-content');
  if (!box) return;
  if (state.tab === 'bank') box.innerHTML = renderTabBank();
  else if (state.tab === 'sesi') box.innerHTML = renderTabSesi();
  else if (state.tab === 'monitor') box.innerHTML = renderTabMonitor();
  else if (state.tab === 'hasil') box.innerHTML = renderTabHasil();
  attachTabContentListeners();
}

function attachTabContentListeners() {
  // Tab filter pills
  document.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeFilter = btn.dataset.filter;
      rerender();
    });
  });

  // Buat Soal actions
  document.getElementById('btn-buat-paket')?.addEventListener('click', () => openModalPaket());
  document.getElementById('btn-generate-soal-baru')?.addEventListener('click', () => openModalGenerateSoal(null));
  document.getElementById('btn-generate-soal-empty')?.addEventListener('click', () => openModalGenerateSoal(null));

  document.querySelectorAll('[data-action]').forEach((btn) => {
    const action = btn.dataset.action;
    const paketId = btn.dataset.paketId;
    const sesiId = btn.dataset.sesiId;

    if (action === 'edit-paket') btn.addEventListener('click', () => openModalPaket(state.paketList.find((p) => p.id === paketId)));
    if (action === 'edit-soal') btn.addEventListener('click', () => openModalEditorSoal(paketId));
    if (action === 'import-soal') btn.addEventListener('click', () => openModalImportSoal(paketId));
    if (action === 'generate-soal') btn.addEventListener('click', () => openModalGenerateSoal(paketId));
    if (action === 'buat-sesi-dari-paket') btn.addEventListener('click', () => {
      state.tab = 'sesi';
      rerender();
      openModalSesi(null, paketId);
    });
    if (action === 'duplikat-paket') btn.addEventListener('click', async () => {
      const paket = state.paketList.find((p) => p.id === paketId);
      if (!paket) return;
      const dup = { ...paket, id: generateId('paket'), judul: `Salinan: ${paket.judul}`, created_at: '', updated_at: '' };
      await savePaket(dup);
      rerender();
      showNotif('Paket berhasil diduplikat.');
    });
    if (action === 'hapus-paket') btn.addEventListener('click', async () => {
      if (!confirm('Hapus paket ini? Tindakan tidak dapat dibatalkan.')) return;
      await removePaket(paketId);
      rerender();
      showNotif('Paket dihapus.', 'info');
    });

    // Sesi actions
    if (action === 'edit-sesi') btn.addEventListener('click', () => openModalSesi(state.sesiList.find((s) => s.id === sesiId)));
    if (action === 'aktivasi-sesi') btn.addEventListener('click', async () => {
      await changeSesiStatus(sesiId, 'aktif');
      rerender();
      showNotif('Sesi diaktifkan. Siswa kini bisa mengerjakan.');
    });
    if (action === 'aktivasi-grup-sesi') btn.addEventListener('click', async () => {
      const eventGroupId = btn.dataset.eventGroupId;
      if (!eventGroupId) return;
      if (!confirm('Aktifkan semua sesi draft pada batch ujian bersama ini?')) return;
      const totalActivated = await changeSesiGroupStatus(eventGroupId, 'aktif', ['draft']);
      rerender();
      showNotif(`${totalActivated} sesi pada batch berhasil diaktifkan.`);
    });
    if (action === 'edit-grup-sesi') btn.addEventListener('click', () => {
      const eventGroupId = btn.dataset.eventGroupId;
      if (!eventGroupId) return;
      openModalEditGroupSesi(eventGroupId);
    });
    if (action === 'selesaikan-grup-sesi') btn.addEventListener('click', async () => {
      const eventGroupId = btn.dataset.eventGroupId;
      if (!eventGroupId) return;
      if (!confirm('Selesaikan semua sesi aktif pada batch ini?')) return;
      const totalFinished = await changeSesiGroupStatus(eventGroupId, 'selesai', ['aktif']);
      rerender();
      showNotif(`${totalFinished} sesi pada batch berhasil diselesaikan.`);
    });
    if (action === 'kelola-grup-sesi') btn.addEventListener('click', () => {
      const eventGroupId = btn.dataset.eventGroupId;
      if (!eventGroupId) return;
      openModalGroupSesi(eventGroupId);
    });
    if (action === 'arsipkan-grup-sesi') btn.addEventListener('click', async () => {
      const eventGroupId = btn.dataset.eventGroupId;
      if (!eventGroupId) return;
      if (!confirm('Arsipkan semua sesi selesai pada batch ini?')) return;
      const totalArchived = await changeSesiGroupStatus(eventGroupId, 'diarsipkan', ['selesai']);
      rerender();
      showNotif(`${totalArchived} sesi pada batch berhasil diarsipkan.`, 'info');
    });
    if (action === 'hapus-grup-sesi') btn.addEventListener('click', async () => {
      const eventGroupId = btn.dataset.eventGroupId;
      if (!eventGroupId) return;
      if (!confirm('Hapus seluruh sesi pada batch ini beserta jawaban dan rekap nilainya? Tindakan ini tidak dapat dibatalkan.')) return;
      try {
        const totalDeleted = await removeSesiGroup(eventGroupId);
        rerender();
        showNotif(`${totalDeleted} sesi dalam batch berhasil dihapus.`, 'info');
      } catch (error) {
        showNotif(error?.message || 'Batch tidak bisa dihapus.', 'error');
      }
    });
    if (action === 'selesaikan-sesi') btn.addEventListener('click', async () => {
      if (!confirm('Selesaikan sesi ini? Siswa tidak bisa mengerjakan lagi.')) return;
      await changeSesiStatus(sesiId, 'selesai');
      rerender();
      showNotif('Sesi diselesaikan.');
    });
    if (action === 'arsipkan-sesi') btn.addEventListener('click', async () => {
      await changeSesiStatus(sesiId, 'diarsipkan');
      rerender();
      showNotif('Sesi diarsipkan.', 'info');
    });
    if (action === 'hapus-sesi') btn.addEventListener('click', async () => {
      if (!confirm('Hapus sesi selesai ini beserta jawaban dan rekap nilainya? Tindakan ini tidak dapat dibatalkan.')) return;
      try {
        await removeSesi(sesiId);
        rerender();
        showNotif('Sesi selesai berhasil dihapus.', 'info');
      } catch (error) {
        showNotif(error?.message || 'Sesi tidak bisa dihapus.', 'error');
      }
    });
    if (action === 'monitor-sesi') btn.addEventListener('click', () => openModalMonitor(sesiId));
    if (action === 'lihat-hasil') btn.addEventListener('click', async () => {
      state.tab = 'hasil';
      state.hasilSesiId = sesiId;
      rerender();
      await loadAndRenderHasil(sesiId);
    });
    if (action === 'koreksi-essay') btn.addEventListener('click', () => openModalKoreksiEssay(btn.dataset.jawabanId, state.hasilSesiId));
  });

  // Buat Sesi
  document.getElementById('btn-buat-sesi')?.addEventListener('click', () => openModalSesi());

  // Hasil sesi select
  document.getElementById('hasil-sesi-select')?.addEventListener('change', async (e) => {
    const sesiId = e.target.value;
    if (sesiId) await loadAndRenderHasil(sesiId);
  });

  // Pre-load hasil jika hasilSesiId sudah ada
  if (state.tab === 'hasil' && state.hasilSesiId) {
    loadAndRenderHasil(state.hasilSesiId);
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export async function renderGuruKuizPage(container) {
  container.innerHTML = renderLayout('Ujian Pro', '<div id="kuiz-loading" class="py-20 text-center text-slate-500 text-sm">Memuat modul ujian…</div>');
  await ensureKaTeXReady();

  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  state.guruId = session?.user?.username || '';
  state.guruNama = session?.user?.nama || '';
  state.context = context;

  state.assignments = state.guruId
    ? await getTeachingAssignmentsForUser(context, state.guruId)
    : await getActiveTeachingAssignments(context);

  await Promise.all([loadPaket(), loadSesi()]);

  // Jawaban dimuat saat monitor/hasil dibuka, bukan saat halaman pertama tampil.

  const html = renderLayout('Ujian Pro', `
    <div class="space-y-5">
      <section class="overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 px-5 py-4 text-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-200">Ujian Pro</p>
            <h2 class="text-xl font-semibold tracking-tight">Kelola kuiz, analitik, dan nilai dari satu panel</h2>
            <p class="text-xs leading-5 text-indigo-50/80">Buat paket soal, jadwalkan sesi, monitor langsung, dan kirim hasil ke rapor.</p>
          </div>
          <div class="grid grid-cols-3 gap-2 xl:min-w-[420px]">
            <div class="rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <p class="text-[10px] uppercase tracking-[0.18em] text-indigo-100">Paket</p>
              <p class="mt-1 text-2xl font-semibold">${state.paketList.length}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <p class="text-[10px] uppercase tracking-[0.18em] text-indigo-100">Aktif</p>
              <p class="mt-1 text-2xl font-semibold">${state.sesiList.filter((s) => s.status === 'aktif').length}</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
              <p class="text-[10px] uppercase tracking-[0.18em] text-indigo-100">Mengajar</p>
              <p class="mt-1 text-2xl font-semibold">${state.assignments.length}</p>
            </div>
          </div>
        </div>
      </section>

      ${renderTabs()}

      <div id="kuiz-tab-content" class="min-h-[300px]">
        ${renderTabBank()}
      </div>
    </div>
  `);

  container.innerHTML = html;

  // Setup logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        const active = b.dataset.tab === state.tab;
        b.className = getTabButtonClasses(b.dataset.tab, active);
        const iconWrap = b.querySelector('span');
        if (iconWrap) iconWrap.className = getTabIconClasses(b.dataset.tab, active);
      });
      rerender();
    });
  });

  attachTabContentListeners();
}
