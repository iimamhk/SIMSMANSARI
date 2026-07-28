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
  if (!material.concepts.length) issues.push('Bagian konsep kosong.');
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
  buildRevisionPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  collectLatexIssues,
  extractJson,
  normalizeMaterial,
  validateMaterial,
  validateLatexBalance,
};
