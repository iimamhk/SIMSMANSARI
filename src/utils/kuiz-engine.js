// ============================================================================
// KUIZ ENGINE — Core utilities, scoring, and storage helpers
// ============================================================================

export const TIPE_SOAL = {
  pg: 'Pilihan Ganda',
  bs: 'Benar / Salah',
  isian: 'Isian Singkat',
  menjodohkan: 'Menjodohkan',
  essay: 'Essay',
};

export const STATUS_SESI = {
  draft: 'Draft',
  aktif: 'Aktif',
  selesai: 'Selesai',
  diarsipkan: 'Diarsipkan',
};

export const COLLECTION_PAKET = 'kuiz_paket';
export const COLLECTION_SESI = 'kuiz_sesi';
export const COLLECTION_JAWABAN = 'kuiz_jawaban';
export const LS_PAKET = 'simguru_kuiz_paket';
export const LS_SESI = 'simguru_kuiz_sesi';
export const LS_JAWABAN = 'simguru_kuiz_jawaban';

let katexReadyPromise = null;

export async function ensureKaTeXReady() {
  const katexLib = globalThis.katex;
  if (katexLib?.renderToString) {
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  if (!document.querySelector('link[data-katex-runtime="true"]') && !document.querySelector('link[href*="katex.min.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
    link.setAttribute('data-katex-runtime', 'true');
    document.head.appendChild(link);
  }

  if (!katexReadyPromise) {
    katexReadyPromise = new Promise((resolve) => {
      const existingScript = document.querySelector('script[data-katex-runtime="true"], script[src*="katex.min.js"]');

      const finish = () => resolve(Boolean(globalThis.katex?.renderToString));

      if (existingScript) {
        if (globalThis.katex?.renderToString) {
          finish();
          return;
        }
        existingScript.addEventListener('load', finish, { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
      script.async = true;
      script.setAttribute('data-katex-runtime', 'true');
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(script);
    }).finally(() => {
      if (!globalThis.katex?.renderToString) {
        katexReadyPromise = null;
      }
    });
  }

  return katexReadyPromise;
}

// ─── ID & CODE GENERATORS ────────────────────────────────────────────────────

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateAccessCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ─── FORMATTERS ──────────────────────────────────────────────────────────────

export function formatDateTime(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '-'; }
}

export function formatDateTimeInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatElapsed(startIso) {
  if (!startIso) return '-';
  const sec = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} mnt ${s} dtk`;
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

export function hitungMaxPoin(paket) {
  return (paket.soal || []).reduce((sum, s) => {
    return sum + (Number(s.poin) || (s.tipe === 'essay' ? 10 : 1));
  }, 0);
}

export function hitungSkorJawaban(paket, jawabanMap, nilaiManualMap = {}) {
  let total = 0;
  const maxTotal = hitungMaxPoin(paket);
  const detail = {};

  (paket.soal || []).forEach((soal) => {
    const jawaban = jawabanMap?.[soal.id];
    const max = Number(soal.poin) || (soal.tipe === 'essay' ? 10 : 1);
    let poin = 0;

    switch (soal.tipe) {
      case 'pg':
      case 'bs':
      case 'isian':
        if (jawaban && String(jawaban).trim().toLowerCase() === String(soal.jawaban_benar || '').trim().toLowerCase()) {
          poin = max;
        }
        break;
      case 'menjodohkan': {
        const pasangan = soal.pasangan || [];
        if (pasangan.length > 0 && jawaban && typeof jawaban === 'object') {
          const perPair = max / pasangan.length;
          pasangan.forEach((pair) => {
            if (String(jawaban[pair.kiri] || '').trim().toLowerCase() === String(pair.kanan || '').trim().toLowerCase()) {
              poin += perPair;
            }
          });
          poin = Math.round(poin * 100) / 100;
        }
        break;
      }
      case 'essay':
        poin = Math.min(Number(nilaiManualMap?.[soal.id] || 0), max);
        break;
    }

    total += poin;
    const benar = poin > 0 && soal.tipe !== 'essay';
    detail[soal.id] = { poin, max, jawaban, tipe: soal.tipe, benar };
  });

  const totalBulat = Math.round(total * 100) / 100;
  const nilaiAkhir = maxTotal > 0 ? Math.round((totalBulat / maxTotal) * 100) : 0;
  return { total: totalBulat, maxTotal, nilaiAkhir, detail };
}

export function hitungStatistikSoal(paket, allJawaban) {
  const stats = {};
  (paket.soal || []).forEach((soal) => {
    const answers = allJawaban
      .map((j) => j.jawaban?.[soal.id])
      .filter((a) => a !== undefined && a !== null && a !== '');

    let correct = 0;
    if (['pg', 'bs', 'isian'].includes(soal.tipe)) {
      correct = answers.filter(
        (a) => String(a || '').trim().toLowerCase() === String(soal.jawaban_benar || '').trim().toLowerCase()
      ).length;
    }

    stats[soal.id] = {
      total_jawaban: answers.length,
      total_benar: correct,
      persen_benar: answers.length > 0 ? Math.round((correct / answers.length) * 100) : null,
    };
  });
  return stats;
}

export function hasEssayPerluKoreksi(paket, allJawaban) {
  const hasEssay = (paket.soal || []).some((s) => s.tipe === 'essay');
  if (!hasEssay) return false;
  return allJawaban.some((j) => j.submitted_at && !j.essay_graded);
}

// ─── STATUS HELPERS ───────────────────────────────────────────────────────────

export function getStatusSesiBadge(status) {
  const map = {
    draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    aktif: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    selesai: { label: 'Selesai', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    diarsipkan: { label: 'Diarsipkan', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
  };
  return map[status] || map.draft;
}

export function isSesiMasihBisa(sesi) {
  if (sesi.status !== 'aktif') return false;
  const now = Date.now();
  if (sesi.waktu_mulai && new Date(sesi.waktu_mulai).getTime() > now) return false;
  if (sesi.waktu_selesai && new Date(sesi.waktu_selesai).getTime() < now) return false;
  return true;
}

export function hitungSisaWaktu(sesi, startedAt) {
  const durasi = Number(sesi.durasi_menit || 60) * 60;
  if (!startedAt) return durasi;
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return Math.max(0, durasi - elapsed);
}

export function shuffleArray(arr, seed = 0) {
  const result = [...arr];
  let s = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────────────────────

export function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

export function writeLocal(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

export function upsertLocal(key, item) {
  const list = readLocal(key);
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...item };
  else list.push(item);
  writeLocal(key, list);
}

export function deleteLocal(key, id) {
  writeLocal(key, readLocal(key).filter((x) => x.id !== id));
}

// ─── DRAFT AUTOSAVE ──────────────────────────────────────────────────────────

export function getDraftKey(sesiId, siswaId) {
  return `simguru_kuiz_draft_${sesiId}_${siswaId}`;
}

export function saveDraft(sesiId, siswaId, data) {
  try { localStorage.setItem(getDraftKey(sesiId, siswaId), JSON.stringify({ ...data, saved_at: new Date().toISOString() })); } catch { /* quota */ }
}

export function loadDraft(sesiId, siswaId) {
  try { return JSON.parse(localStorage.getItem(getDraftKey(sesiId, siswaId)) || 'null'); } catch { return null; }
}

export function clearDraft(sesiId, siswaId) {
  localStorage.removeItem(getDraftKey(sesiId, siswaId));
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

export function exportToCSV(rows, filename) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── AI IMPORT PARSERS ────────────────────────────────────────────────────────

/**
 * Parse Markdown format: **Soal 1 (PG)** ... **Soal 2 (Isian)** ...
 * Supports LaTeX: $..$ inline, $$..$$ display
 */
export function parseMarkdownSoal(text) {
  if (!text?.trim()) return [];
  
  const soalBlocks = text.split(/(?:^|\n)(?:\*\*)?(?:Soal \d+|##+ )/i).slice(1);
  const soalList = [];

  const normalizeHeadingType = (rawType = '') => {
    const value = String(rawType || '').trim().toLowerCase();
    if (!value) return '';
    if (/(^|\b)(pg|pilihan ganda|multiple choice)(\b|$)/i.test(value)) return 'pg';
    if (/(^|\b)(isian|isian singkat|short answer)(\b|$)/i.test(value)) return 'isian';
    if (/(^|\b)(essay|esai)(\b|$)/i.test(value)) return 'essay';
    if (/(^|\b)(bs|benar\s*\/\s*salah|benar salah|true false)(\b|$)/i.test(value)) return 'bs';
    if (/(^|\b)(menjodohkan|matching)(\b|$)/i.test(value)) return 'menjodohkan';
    return '';
  };
  
  soalBlocks.forEach((block) => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l && l !== '---');
    if (lines.length < 2) return;
    
    // Detect tipe dari content
    let tipe = 'pg';
    let pertanyaan = '';
    let opsi = [];
    let jawaban_benar = '';
    let pasangan = [];
    let poin = 1;

    const headingMatch = lines[0]?.match(/^\(([^)]+)\)\*{0,2}$/i);
    const headingType = normalizeHeadingType(headingMatch?.[1] || '');
    if (headingType) {
      tipe = headingType;
      lines.shift();
    }

    if (!lines.length) {
      return;
    }
    
    let currentSection = 'pertanyaan';
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Extract jawaban from "Jawaban: X" or "Jawaban: text"
      if (/^Jawaban:/i.test(line)) {
        jawaban_benar = line.replace(/^Jawaban:\s*/i, '').trim();
        i++;
        continue;
      }
      
      // Extract poin from "Poin: 2" or "Poin: 2 poin"
      if (/^Poin:/i.test(line)) {
        const match = line.match(/\d+/);
        if (match) poin = parseInt(match[0]);
        i++;
        continue;
      }
      
      // Detect pilihan (A) B) C) etc
      if (/^[A-E]\)\s*/.test(line)) {
        currentSection = 'pilihan';
        if (tipe === 'pg') {
          opsi.push(line.replace(/^[A-E]\)\s*/, '').trim());
        }
        i++;
        continue;
      }
      
      // Detect pasangan format: "Kiri → Kanan" or "Kiri -> Kanan"
      if (/→|->|➜/.test(line)) {
        const [kiri, kanan] = line.split(/→|->|➜/).map(s => s.trim());
        if (kiri && kanan) {
          tipe = 'menjodohkan';
          pasangan.push({ kiri, kanan });
        }
        i++;
        continue;
      }
      
      // If we see multiple opsi, likely PG
      if (opsi.length >= 2) tipe = 'pg';
      if (pasangan.length >= 1) tipe = 'menjodohkan';
      
      // Pertanyaan is first non-empty line not starting with A-E or Jawaban
      if (currentSection === 'pertanyaan' && !/^[A-E]\)/.test(line) && !/^Jawaban:/i.test(line)) {
        pertanyaan += (pertanyaan ? ' ' : '') + line;
      }
      
      i++;
    }
    
    if (!pertanyaan) pertanyaan = lines[0];
    
    // Auto-detect type: if essay-like text OR poin > 2 OR "essay" mentioned
    if (pertanyaan.toLowerCase().includes('essay') || jawaban_benar.toLowerCase().includes('essay')) {
      tipe = 'essay';
    } else if (opsi.length >= 2) {
      tipe = 'pg';
      jawaban_benar = jawaban_benar.toUpperCase() || 'A';
    } else if (jawaban_benar.toLowerCase() === 'benar' || jawaban_benar.toLowerCase() === 'salah') {
      tipe = 'bs';
    } else if (pasangan.length > 0) {
      tipe = 'menjodohkan';
    } else {
      tipe = 'isian';
    }
    
    // Normalize LaTeX in all fields
    const normalizedPertanyaan = normalizeLaTeX(pertanyaan.trim());
    const normalizedJawaban = normalizeLaTeX(jawaban_benar.trim());
    const normalizedOpsi = opsi.map(o => normalizeLaTeX(o));
    const normalizedPasangan = pasangan.map(p => ({
      kiri: normalizeLaTeX(p.kiri),
      kanan: normalizeLaTeX(p.kanan),
    }));
    
    const soal = {
      id: generateId('soal'),
      tipe,
      pertanyaan: normalizedPertanyaan,
      poin: Math.max(1, Math.min(100, poin)),
      jawaban_benar: normalizedJawaban || 'A',
    };
    
    if (tipe === 'pg') soal.opsi = normalizedOpsi.length >= 2 ? normalizedOpsi : ['', '', '', ''];
    if (tipe === 'menjodohkan') soal.pasangan = normalizedPasangan.length > 0 ? normalizedPasangan : [];
    
    soalList.push(soal);
  });
  
  return soalList;
}

/**
 * Parse JSON format from AI bulk export
 * Expected schema: { format: "kuiz_bulk_v1", paket_judul: "...", soal: [...] }
 */
export function parseJsonBulkSoal(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (!data.soal || !Array.isArray(data.soal)) return { error: 'Format invalid: field "soal" tidak ditemukan atau bukan array' };
    
    const soalList = data.soal.map((s) => ({
      id: generateId('soal'),
      tipe: s.tipe || 'pg',
      pertanyaan: normalizeLaTeX(s.pertanyaan || ''),
      poin: Math.max(1, Math.min(100, parseInt(s.poin) || 1)),
      jawaban_benar: normalizeLaTeX(s.jawaban_benar || 'A'),
      opsi: (s.opsi || []).filter(o => o).map(o => normalizeLaTeX(o)),
      pasangan: (s.pasangan || []).filter(p => p.kiri && p.kanan).map(p => ({
        kiri: normalizeLaTeX(p.kiri),
        kanan: normalizeLaTeX(p.kanan),
      })),
      rubrik: s.rubrik || '',
      pembahasan: normalizeLaTeX(s.pembahasan || ''),
    })).filter(s => s.pertanyaan);
    
    return { success: true, paket_judul: data.paket_judul, soal: soalList };
  } catch (e) {
    return { error: `Error parsing JSON: ${e.message}` };
  }
}

/**
 * Render LaTeX formula to HTML using KaTeX
 * Converts $..$ to inline and $$..$$ to display math
 */
/**
 * Normalize LaTeX formula dari berbagai format ChatGPT/AI
 * Converts \[...\], \(...\), $$...$$ to $...$ atau $$...$$ untuk KaTeX
 */
function normalizeLaTeX(text) {
  if (!text) return text;
  
  // Unescape double backslashes (\\int -> \int)
  let normalized = text.replace(/\\\\/g, '\\');
  
  // Convert \[...\] (display) to $$...$$
  normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => `$$${String(formula || '').trim()}$$`);
  
  // Convert \(...\) (inline) to $...$
  normalized = normalized.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => `$${String(formula || '').trim()}$`);
  
  return normalized;
}

export function renderMathPreview(text) {
  if (!text) return text;
  const katexLib = globalThis.katex;
  if (!katexLib?.renderToString) return text;
  
  // Normalize format dulu
  let html = normalizeLaTeX(text);
  
  // Display math $$..$$ (must be before inline)
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    try {
      // Clean formula
      formula = formula.trim();
      const rendered = katexLib.renderToString(formula, { displayMode: true, throwOnError: false });
      return `<div class="math-display my-2 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-4 sm:py-3">${rendered}</div>`;
    } catch (e) { 
      console.warn('KaTeX render error:', e);
      return match; 
    }
  });
  
  // Inline math $..$
  html = html.replace(/\$(?!\$)([^$]+?)\$(?!\$)/g, (match, formula) => {
    try {
      // Clean formula
      formula = formula.trim();
      const rendered = katexLib.renderToString(formula, { displayMode: false, throwOnError: false });
      return `<span class="math-inline inline-flex max-w-full items-center align-middle text-slate-900">${rendered}</span>`;
    } catch (e) { 
      console.warn('KaTeX render error:', e);
      return match; 
    }
  });
  
  return html;
}

/**
 * Build preview HTML from parsed soal array
 */
export function buildPreviewHtml(soalList) {
  if (!soalList.length) return '<p class="text-slate-500 text-sm">Tidak ada soal terdeteksi</p>';
  
  return soalList.map((s, idx) => `
    <div class="mb-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div class="mb-3 flex items-start justify-between gap-3">
        <span class="font-semibold text-sm text-slate-900">Soal ${idx + 1} (${TIPE_SOAL[s.tipe]})</span>
        <span class="text-xs text-slate-500">${s.poin} poin</span>
      </div>
      <div class="mb-3 text-sm leading-6 text-slate-800">${renderMathPreview(s.pertanyaan)}</div>
      ${s.tipe === 'pg' ? `
        <div class="space-y-2 text-xs">
          ${(s.opsi || []).map((o, i) => `
            <div class="rounded-2xl border ${String.fromCharCode(65 + i) === s.jawaban_benar ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/70'} px-3 py-2 text-slate-600">
              <span class="${String.fromCharCode(65 + i) === s.jawaban_benar ? 'font-bold text-emerald-600' : ''}">${String.fromCharCode(65 + i)}) ${renderMathPreview(o)}</span>
            </div>
          `).join('')}
        </div>
      ` : s.tipe === 'menjodohkan' ? `
        <div class="space-y-2 text-xs">
          ${(s.pasangan || []).map(p => `
            <div class="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-slate-600">${renderMathPreview(p.kiri)} → ${renderMathPreview(p.kanan)}</div>
          `).join('')}
        </div>
      ` : s.tipe === 'isian' ? `
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-600">Jawaban: ${renderMathPreview(s.jawaban_benar)}</div>
      ` : s.tipe === 'bs' ? `
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-600">Jawaban: ${s.jawaban_benar === 'benar' ? '✓ Benar' : '✕ Salah'}</div>
      ` : `
        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-500">Essay - Rubrik: ${s.rubrik || '(tidak ada)'}</div>
      `}
      ${s.pembahasan ? `
        <div class="mt-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700"><span class="font-semibold">Pembahasan:</span> ${renderMathPreview(s.pembahasan)}</div>
      ` : ''}
    </div>
  `).join('');
}
