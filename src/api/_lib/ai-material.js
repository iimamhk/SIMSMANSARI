/**
 * Skema materi terstruktur (JSON), pembangun prompt, dan validasi.
 *
 * Filosofi: AI mengeluarkan JSON terstruktur (bukan markdown mentah) sehingga
 * renderer web/PDF dapat membangun tampilan premium yang konsisten, interaktif
 * (isian, drag-drop, kuis), dan rumus matematika tervalidasi sempurna.
 */

// ---------------------------------------------------------------------------
// Konstanta skema
// ---------------------------------------------------------------------------

const SECTION_TYPES = [
  'hook',          // pembuka pemancing rasa ingin tahu
  'objective',     // tujuan pembelajaran (array poin)
  'concept',       // bagian konsep dengan gaya penyajian bervariasi
  'highlight',     // callout penting/perhatian/info
  'example',       // contoh soal bernomor + pembahasan langkah
  'exercise',      // latihan interaktif (fill_blank / multiple_choice / drag_drop / essay)
  'group_activity',// tugas kelompok
  'assignment',    // tugas individu
  'summary',       // rangkuman
  'reflection',    // refleksi
];

const CONCEPT_VARIANTS = ['narasi', 'definisi', 'tabel', 'kasus', 'perbandingan', 'langkah'];
const HIGHLIGHT_KINDS = ['penting', 'miskonsepsi', 'info', 'perhatian'];
const EXERCISE_KINDS = ['fill_blank', 'multiple_choice', 'drag_drop', 'essay'];

const KEDALAMAN_GUIDE = {
  pengenalan: 'Fokus pemahaman konsep dasar. Bahasa paling sederhana, banyak contoh konkret, hindari istilah teknis berat tanpa penjelasan.',
  menengah: 'Konsep lengkap dengan contoh kontekstual dan variasi soal. Seimbang antara pemahaman dan penerapan.',
  hots: 'Berorientasi HOTS: soal analisis, evaluasi, dan pemecahan masalah non-rutin. Minimal setengah latihan menuntut penalaran, bukan hafalan.',
};

const GAYA_GUIDE = {
  hangat: 'Bahasa hangat, akrab, dan menyemangati. Gunakan sapaan "kamu", pertanyaan retoris, dan contoh dekat kehidupan siswa.',
  formal: 'Bahasa formal, akademik, dan presisi. Struktur kalimat baku, istilah ilmiah tepat, tetap mudah diikuti.',
  santai: 'Bahasa santai seperti mentor yang ngobrol. Ringan, kadang humor tipis, tapi tetap informatif dan tidak berlebihan.',
  memotivasi: 'Bahasa memotivasi dan energik. Tekankan bahwa siswa mampu, kaitkan materi dengan cita-cita dan keberhasilan.',
};

const FEATURE_LABEL = {
  contoh: 'contoh soal bertahap',
  highlight: 'highlight penting',
  fill_blank: 'latihan isian (melengkapi jawaban)',
  drag_drop: 'latihan drag & drop (mencocokkan pasangan)',
  kuis: 'mini kuis pilihan ganda',
  tugas_kelompok: 'tugas kelompok',
  aktivitas: 'aktivitas diskusi / proyek bersama',
};

// ---------------------------------------------------------------------------
// Pembangun prompt
// ---------------------------------------------------------------------------

function schemaDescription() {
  return [
    'Keluarkan HANYA satu objek JSON valid (tanpa markdown, tanpa code fence, tanpa teks di luar JSON).',
    'Bentuk JSON:',
    '{',
    '  "title": string,',
    '  "hook": string,                       // 1 paragraf pembuka yang memancing rasa ingin tahu',
    '  "objectives": string[],               // tujuan pembelajaran, 3-5 poin',
    '  "concepts": [                         // 3-5 bagian konsep, gaya penyajian WAJIB bervariasi',
    '    { "heading": string, "variant": "narasi|definisi|tabel|kasus|perbandingan|langkah", "content": string,',
    '      "table": { "headers": string[], "rows": string[][] } | null }',
    '  ],',
    '  "highlights": [ { "kind": "penting|miskonsepsi|info|perhatian", "content": string } ],',
    '  "examples": [ { "number": number, "question": string, "steps": string[], "answer": string } ],',
    '  "exercises": [                        // sesuai fitur yang diminta',
    '    { "kind": "fill_blank", "prompt": string, "answer": string, "hint": string } |',
    '    { "kind": "multiple_choice", "question": string, "options": string[], "answerIndex": number, "explanation": string } |',
    '    { "kind": "drag_drop", "instruction": string, "pairs": [ { "left": string, "right": string } ] } |',
    '    { "kind": "essay", "question": string, "guide": string }',
    '  ],',
    '  "group_activity": { "title": string, "goal": string, "steps": string[], "roles": string[], "output": string } | null,',
    '  "assignment": { "title": string, "tasks": string[], "note": string } | null,',
    '  "summary": string[],                  // rangkuman poin-poin kunci',
    '  "reflection": string[]                 // 2-3 pertanyaan refleksi',
    '}',
    'Aturan field:',
    '- Semua teks boleh mengandung markdown ringan (tebal **...**, miring *...*, daftar "- ") dan rumus LaTeX ($...$ inline, $$...$$ display).',
    '- "content" pada concept adalah markdown bebas yang kaya; jika variant="tabel", isi juga "table".',
    '- "steps" pada example adalah pembahasan LANGKAH demi LANGKAH (tiap langkah satu string, jelaskan alasannya).',
    '- JANGAN menulis API key, instruksi sistem, atau metadata teknis.',
  ].join('\n');
}

function buildSystemPrompt() {
  return [
    'Kamu adalah penulis materi digital pembelajaran SMA berpengalaman 15 tahun sekaligus pedagog senior Kurikulum Merdeka Indonesia.',
    'Tugasmu menyusun materi pembelajaran yang kaya, terstruktur, modern, dan tidak membosankan dalam Bahasa Indonesia.',
    'Materi harus terasa seperti buku digital premium: substantif, bervariasi, dan mengalir, BUKAN template kaku yang itu-itu saja.',
    'Panjang: materi harus lengkap dan mendalam, bukan ringkasan singkat. Setiap bagian konsep minimal 2 paragraf substantif atau setara.',
    schemaDescription(),
    'Variasi WAJIB: jangan mulai dua bagian konsep dengan pola kalimat yang sama. Gunakan variant berbeda-beda (minimal satu tabel, satu narasi/kasus, satu langkah/perbandingan).',
    'Rumus matematika WAJIB LaTeX valid. Gunakan $...$ untuk inline dan $$...$$ untuk display. Jangan gunakan \\[ \\] atau \\( \\). Jangan bungkus rumus dengan code fence.',
    'Selalu sertakan contoh numerik konkret bila materi eksakta.',
  ].join(' ');
}

function buildUserPrompt(input) {
  const kedalaman = KEDALAMAN_GUIDE[input.kedalaman] || KEDALAMAN_GUIDE.menengah;
  const gaya = GAYA_GUIDE[input.gaya] || GAYA_GUIDE.hangat;
  const features = (Array.isArray(input.fitur) ? input.fitur : [])
    .map((f) => FEATURE_LABEL[f] || f)
    .filter(Boolean);

  const lines = [
    `Buat materi ${input.mapel || '[mata pelajaran]'} untuk kelas ${input.kelas || '[kelas]'} ${input.rombel || ''}`.trim(),
    `Fase: ${input.fase || '-'} • Semester: ${input.semester || '-'} • Alokasi waktu: ${input.alokasiWaktu || '-'}`,
    `Bab/Unit: ${input.bab || '[bab]'} • Topik utama: ${input.topik || '[topik]'}`,
    `Tingkat kedalaman: ${input.kedalaman || 'menengah'} — ${kedalaman}`,
    `Gaya bahasa: ${input.gaya || 'hangat'} — ${gaya}`,
  ];

  if (input.jumlahContoh) lines.push(`Jumlah contoh soal: sekitar ${input.jumlahContoh}, bernomor, pembahasan langkah demi langkah.`);
  if (features.length) lines.push(`Fitur yang WAJIB ada: ${features.join(', ')}.`);
  if (input.fitur?.includes('tugas_kelompok')) {
    lines.push('Isi "group_activity": aktivitas 3-4 siswa dengan langkah jelas, pembagian peran, dan produk/hasil akhir yang terukur.');
  }
  if (input.fitur?.includes('aktivitas')) {
    lines.push('Sertakan aktivitas bersama (diskusi terpimpin / mini proyek) yang melibatkan seluruh kelas, pada group_activity atau assignment.');
  }
  if (input.lainLain) lines.push(`Catatan tambahan dari guru: ${input.lainLain}`);

  lines.push('Hasilkan JSON lengkap sesuai skema. Pastikan semua bagian terisi kaya dan tidak ada yang kosong.');
  return lines.filter(Boolean).join('\n');
}

function buildRevisionPrompt(input, currentJson, instruction) {
  return [
    'Berikut materi pembelajaran dalam format JSON:',
    '---MULAI---',
    currentJson,
    '---SELESAI---',
    'Revisi materi di atas sesuai instruksi guru berikut, lalu keluarkan kembali JSON LENGKAP yang sudah direvisi.',
    'Aturan revisi ketat:',
    '- Ubah HANYA bagian yang relevan dengan instruksi. Pertahankan struktur JSON, semua field, dan bagian lain apa adanya.',
    '- Jangan hapus konten yang tidak diminta untuk dihapus.',
    '- Jaga agar JSON tetap valid dan rumus LaTeX tetap benar.',
    '- Keluarkan HANYA JSON valid, tanpa teks tambahan apa pun.',
    `Instruksi revisi guru: ${instruction}`,
  ].join('\n');
}

function buildRepairMessages(input, partialText) {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(input) },
    { role: 'assistant', content: String(partialText || '').slice(0, 100000) },
    {
      role: 'user',
      content: [
        'Output sebelumnya terpotong atau tidak valid. Bangun ulang menjadi SATU objek JSON LENGKAP sesuai skema di atas.',
        'Pertahankan isi yang masih dapat dibaca, lengkapi bagian yang hilang, dan pastikan semua tanda kurung serta string JSON tertutup.',
        'Jangan keluarkan markdown, code fence, komentar, alasan, atau teks apa pun di luar objek JSON.',
      ].join(' '),
    },
  ];
}

// ---------------------------------------------------------------------------
// Mode PATCH (Tahap 2): edit bertarget tanpa menulis ulang seluruh materi
// ---------------------------------------------------------------------------

// Field array yang boleh diubah per-item.
const ARRAY_FIELDS = ['objectives', 'concepts', 'highlights', 'examples', 'exercises', 'summary', 'reflection'];
// Field skalar/objek yang boleh diganti utuh.
const SCALAR_FIELDS = ['title', 'hook', 'group_activity', 'assignment'];

/** Ringkasan singkat satu item array untuk membantu AI menunjuk indeks. */
function summarizeItem(field, item) {
  const clip = (s, n = 60) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  if (item == null) return '(kosong)';
  if (typeof item === 'string') return clip(item, 70);
  if (field === 'concepts') return `${clip(item.heading, 40)} [${item.variant || 'narasi'}]`;
  if (field === 'highlights') return `${item.kind || 'info'}: ${clip(item.content, 50)}`;
  if (field === 'examples') return `No.${item.number ?? '?'} ${clip(item.question, 45)}`;
  if (field === 'exercises') {
    const label = item.question || item.prompt || item.instruction || '';
    return `${item.kind || 'exercise'}: ${clip(label, 45)}`;
  }
  return clip(JSON.stringify(item), 60);
}

/**
 * Bangun "peta" materi ringkas: nama field + indeks + label tiap item.
 * Dipakai agar AI dapat menunjuk operasi patch secara tepat tanpa melihat JSON penuh.
 */
function buildMaterialOutline(material) {
  const safe = normalizeMaterial(material) || {};
  const lines = [];
  lines.push(`title: ${summarizeItem('title', safe.title)}`);
  lines.push(`hook: ${safe.hook ? summarizeItem('hook', safe.hook) : '(kosong)'}`);
  ARRAY_FIELDS.forEach((field) => {
    const arr = Array.isArray(safe[field]) ? safe[field] : [];
    lines.push(`${field} (${arr.length} item):`);
    arr.forEach((item, i) => lines.push(`  [${i}] ${summarizeItem(field, item)}`));
  });
  lines.push(`group_activity: ${safe.group_activity ? 'ada' : 'kosong'}`);
  lines.push(`assignment: ${safe.assignment ? 'ada' : 'kosong'}`);
  return lines.join('\n');
}

function buildPatchSystemPrompt() {
  return [
    'Kamu adalah editor materi pembelajaran SMA yang teliti. Kamu menyunting materi berformat JSON secara BERTARGET.',
    'Kamu TIDAK menulis ulang seluruh materi. Kamu hanya mengeluarkan daftar OPERASI perubahan minimal yang diperlukan.',
    'Keluarkan HANYA satu objek JSON valid (tanpa markdown, tanpa code fence, tanpa teks lain) dengan bentuk:',
    '{',
    '  "summary": string,            // ringkasan 1 kalimat Bahasa Indonesia tentang perubahan yang kamu lakukan',
    '  "ops": [                       // urut; diterapkan berurutan',
    '    { "op": "set_field", "field": "title|hook|group_activity|assignment", "value": <nilai baru> },',
    '    { "op": "set_array", "field": "objectives|summary|reflection", "value": string[] },',
    '    { "op": "replace_item", "field": "concepts|highlights|examples|exercises|objectives|summary|reflection", "index": number, "value": <item baru> },',
    '    { "op": "insert_item", "field": <sama>, "index": number|null, "value": <item baru> },  // index null = tambah di akhir',
    '    { "op": "delete_item", "field": <sama>, "index": number }',
    '  ]',
    '}',
    'Aturan item harus sesuai skema materi:',
    '- concepts item: { "heading": string, "variant": "narasi|definisi|tabel|kasus|perbandingan|langkah", "content": string(markdown+LaTeX), "table": {headers,rows}|null }',
    '- highlights item: { "kind": "penting|miskonsepsi|info|perhatian", "content": string }',
    '- examples item: { "number": number, "question": string, "steps": string[], "answer": string }',
    '- exercises item: salah satu dari { kind:"fill_blank", prompt, answer, hint } | { kind:"multiple_choice", question, options[], answerIndex, explanation } | { kind:"drag_drop", instruction, pairs[{left,right}] } | { kind:"essay", question, guide }',
    '- objectives/summary/reflection item: string',
    'Ketentuan penting:',
    '- Ubah HANYA yang diminta guru. Jangan menyentuh bagian lain.',
    '- Gunakan indeks yang tepat sesuai PETA MATERI yang diberikan.',
    '- Rumus matematika WAJIB LaTeX valid ($...$ inline, $$...$$ display). Jangan pakai \\( \\) atau \\[ \\].',
    '- Jika instruksi tidak mungkin/ tidak jelas, kembalikan "ops": [] dan jelaskan di "summary".',
    '- Jangan mengeluarkan apa pun selain objek JSON.',
  ].join('\n');
}

function buildPatchPrompt(material, instruction) {
  return [
    'PETA MATERI saat ini (field, indeks, ringkasan tiap item):',
    '---PETA MULAI---',
    buildMaterialOutline(material),
    '---PETA SELESAI---',
    'Isi lengkap materi (JSON) sebagai rujukan konten:',
    '---JSON MULAI---',
    JSON.stringify(material),
    '---JSON SELESAI---',
    `Instruksi guru: ${instruction}`,
    'Keluarkan objek JSON berisi "summary" dan "ops" sesuai aturan. Operasi harus seminimal mungkin namun memenuhi instruksi.',
  ].join('\n');
}

/** Ekstrak { summary, ops } dari teks keluaran AI (toleran pembungkus). */
function extractPatch(text) {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object') return null;
  const ops = Array.isArray(parsed.ops) ? parsed.ops : null;
  if (!ops) return null;
  return { summary: typeof parsed.summary === 'string' ? parsed.summary : '', ops };
}

function clampIndex(index, length, allowEnd = false) {
  const max = allowEnd ? length : length - 1;
  const n = Number.isInteger(index) ? index : (allowEnd ? length : -1);
  if (n < 0) return allowEnd ? length : -1;
  if (n > max) return max;
  return n;
}

/** Indeks valid untuk mengubah/menghapus item yang benar-benar ada (tanpa clamp). */
function exactIndex(index, length) {
  return Number.isInteger(index) && index >= 0 && index < length ? index : -1;
}

/**
 * Terapkan daftar operasi patch ke materi (menghasilkan objek BARU, tidak mengubah input).
 * @returns {{ material: object, applied: number, skipped: string[] }}
 */
function applyPatchOperations(material, ops) {
  const base = normalizeMaterial(material) || {};
  const next = JSON.parse(JSON.stringify(base));
  const skipped = [];
  let applied = 0;
  const list = Array.isArray(ops) ? ops : [];

  for (const op of list) {
    if (!op || typeof op !== 'object') { skipped.push('operasi tidak valid'); continue; }
    const field = String(op.field || '');
    try {
      if (op.op === 'set_field') {
        if (!SCALAR_FIELDS.includes(field)) { skipped.push(`field skalar tak dikenal: ${field}`); continue; }
        next[field] = op.value;
        applied += 1;
      } else if (op.op === 'set_array') {
        if (!['objectives', 'summary', 'reflection'].includes(field)) { skipped.push(`set_array tak diizinkan untuk: ${field}`); continue; }
        if (!Array.isArray(op.value)) { skipped.push(`nilai set_array bukan array: ${field}`); continue; }
        next[field] = op.value.filter((s) => typeof s === 'string');
        applied += 1;
      } else if (op.op === 'replace_item') {
        if (!ARRAY_FIELDS.includes(field)) { skipped.push(`array tak dikenal: ${field}`); continue; }
        if (!Array.isArray(next[field])) next[field] = [];
        const idx = exactIndex(op.index, next[field].length);
        if (idx < 0) { skipped.push(`indeks di luar jangkauan untuk ${field}`); continue; }
        next[field][idx] = op.value;
        applied += 1;
      } else if (op.op === 'insert_item') {
        if (!ARRAY_FIELDS.includes(field)) { skipped.push(`array tak dikenal: ${field}`); continue; }
        if (!Array.isArray(next[field])) next[field] = [];
        const idx = clampIndex(op.index == null ? next[field].length : op.index, next[field].length, true);
        next[field].splice(idx, 0, op.value);
        applied += 1;
      } else if (op.op === 'delete_item') {
        if (!ARRAY_FIELDS.includes(field)) { skipped.push(`array tak dikenal: ${field}`); continue; }
        if (!Array.isArray(next[field])) { skipped.push(`bukan array: ${field}`); continue; }
        const idx = exactIndex(op.index, next[field].length);
        if (idx < 0) { skipped.push(`indeks di luar jangkauan untuk ${field}`); continue; }
        next[field].splice(idx, 1);
        applied += 1;
      } else {
        skipped.push(`op tak dikenal: ${op.op}`);
      }
    } catch (e) {
      skipped.push(`gagal menerapkan op ${op.op} pada ${field}`);
    }
  }

  return { material: normalizeMaterial(next), applied, skipped };
}

// ---------------------------------------------------------------------------
// Validasi & perbaikan JSON
// ---------------------------------------------------------------------------

/** Ekstrak objek JSON pertama dari teks (toleran terhadap teks pembungkus). */
function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  // Buang code fence bila ada.
  const unfenced = raw.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch { /* lanjut */ }
  // Cari blok { ... } terluar.
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1) return null;
  const candidate = end > start ? unfenced.slice(start, end + 1) : unfenced.slice(start);
  try {
    return JSON.parse(candidate);
  } catch { /* lanjut */ }
  // Auto-repair: tutup kurung kurawal/string yang belum tertutup (stream terputus).
  const repaired = repairPartialJson(candidate);
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function repairPartialJson(text) {
  let s = String(text || '');
  // Track stack bracket untuk mengetahui apa yang perlu ditutup.
  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  // Tutup string yang masih terbuka.
  if (inString) s += '"';
  // Tutup bracket dalam urutan terbalik.
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    s += (stack[i] === '{') ? '}' : ']';
  }
  // Buang koma trailing sebelum tutup.
  s = s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  return s;
}

function validateLatexBalance(text) {
  const issues = [];
  const value = String(text || '');
  const braceBalance = (value.match(/\{/g) || []).length - (value.match(/\}/g) || []).length;
  if (braceBalance !== 0) issues.push('Kurung kurawal LaTeX tidak seimbang.');
  // Deteksi delimiter display yang tidak ditutup.
  const displayCount = (value.match(/\$\$/g) || []).length;
  if (displayCount % 2 !== 0) issues.push('Delimiter $$ tidak berpasangan.');
  return issues;
}

function walkStrings(node, visit) {
  if (typeof node === 'string') return visit(node);
  if (Array.isArray(node)) return node.map((item) => walkStrings(item, visit));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = walkStrings(value, visit);
    return out;
  }
  return node;
}

function collectLatexIssues(material) {
  const issues = [];
  walkStrings(material, (text) => {
    validateLatexBalance(text).forEach((issue) => issues.push(issue));
    return text;
  });
  return Array.from(new Set(issues));
}

/** Normalisasi struktur: pastikan field wajib ada dan bertipe benar. */
function normalizeMaterial(material) {
  if (!material || typeof material !== 'object') return null;
  const safe = { ...material };
  safe.title = typeof safe.title === 'string' && safe.title.trim() ? safe.title.trim() : 'Materi Pembelajaran';
  safe.hook = typeof safe.hook === 'string' ? safe.hook : '';
  safe.objectives = Array.isArray(safe.objectives) ? safe.objectives.filter((s) => typeof s === 'string') : [];
  safe.concepts = Array.isArray(safe.concepts) ? safe.concepts.filter((c) => c && typeof c === 'object') : [];
  safe.highlights = Array.isArray(safe.highlights) ? safe.highlights.filter((c) => c && typeof c === 'object') : [];
  safe.examples = Array.isArray(safe.examples) ? safe.examples.filter((c) => c && typeof c === 'object') : [];
  safe.exercises = Array.isArray(safe.exercises) ? safe.exercises.filter((c) => c && typeof c === 'object') : [];
  safe.group_activity = safe.group_activity && typeof safe.group_activity === 'object' ? safe.group_activity : null;
  safe.assignment = safe.assignment && typeof safe.assignment === 'object' ? safe.assignment : null;
  safe.summary = Array.isArray(safe.summary) ? safe.summary.filter((s) => typeof s === 'string') : [];
  safe.reflection = Array.isArray(safe.reflection) ? safe.reflection.filter((s) => typeof s === 'string') : [];
  return safe;
}

/**
 * Validasi materi. Mengembalikan { ok, material, issues }.
 * Material sudah dinormalisasi bila parse berhasil.
 */
function validateMaterial(rawText) {
  const parsed = extractJson(rawText);
  if (!parsed) {
    return { ok: false, material: null, issues: ['Output bukan JSON valid.'] };
  }
  const material = normalizeMaterial(parsed);
  if (!material) {
    return { ok: false, material: null, issues: ['Struktur materi tidak valid.'] };
  }
  const issues = [];
  if (material.objectives.length < 1) issues.push('Tujuan pembelajaran kosong.');
  if (material.concepts.length < 3) issues.push('Materi membutuhkan minimal tiga bagian konsep.');
  if (material.examples.length < 1) issues.push('Contoh soal kosong.');
  if (material.exercises.length < 1) issues.push('Latihan soal kosong.');
  if (material.summary.length < 1) issues.push('Rangkuman kosong.');
  if (material.reflection.length < 1) issues.push('Refleksi kosong.');
  material.concepts.forEach((concept, index) => {
    if (typeof concept.heading !== 'string' || !concept.heading.trim()) issues.push(`Judul konsep ${index + 1} kosong.`);
    if (typeof concept.content !== 'string' || !concept.content.trim()) issues.push(`Isi konsep ${index + 1} kosong.`);
  });
  const latexIssues = collectLatexIssues(material);
  issues.push(...latexIssues);
  return { ok: issues.length === 0, material, issues };
}

module.exports = {
  CONCEPT_VARIANTS,
  EXERCISE_KINDS,
  FEATURE_LABEL,
  GAYA_GUIDE,
  HIGHLIGHT_KINDS,
  KEDALAMAN_GUIDE,
  SECTION_TYPES,
  applyPatchOperations,
  buildMaterialOutline,
  buildPatchPrompt,
  buildPatchSystemPrompt,
  buildRevisionPrompt,
  buildRepairMessages,
  buildSystemPrompt,
  buildUserPrompt,
  collectLatexIssues,
  extractJson,
  extractPatch,
  normalizeMaterial,
  validateMaterial,
  validateLatexBalance,
};
