/**
 * Helper untuk endpoint AI Generate Soal (/api/ai/generate-soal).
 *
 * Bertugas:
 *  - Membersihkan input form guru.
 *  - Menyusun prompt agar AI mengeluarkan JSON soal berformat "kuiz_bulk_v1"
 *    (skema yang sama dengan importer manual di frontend / parseJsonBulkSoal).
 *  - Mengekstrak + memvalidasi JSON dari keluaran model (ringan; normalisasi
 *    penuh tetap dilakukan di frontend via parseJsonBulkSoal agar satu sumber).
 *
 * Sengaja dibuat mandiri (tanpa dependensi ke ai-material) agar mudah
 * dikembangkan dan diuji terpisah.
 */

const TIPE_ALLOWED = ['pg', 'bs', 'isian', 'menjodohkan', 'essay', 'campuran'];
const KESULITAN_ALLOWED = ['mudah', 'sedang', 'sulit', 'hots', 'campuran'];

const TIPE_LABEL = {
  pg: 'Pilihan Ganda (opsi A-E, satu jawaban benar)',
  bs: 'Benar / Salah',
  isian: 'Isian Singkat',
  menjodohkan: 'Menjodohkan (pasangan kiri-kanan)',
  essay: 'Uraian / Essay (dinilai manual dengan rubrik)',
  campuran: 'Campuran beberapa tipe soal',
};

const KESULITAN_LABEL = {
  mudah: 'mudah (mengingat & memahami konsep dasar)',
  sedang: 'sedang (menerapkan konsep pada situasi umum)',
  sulit: 'sulit (analisis dan pemecahan masalah bertingkat)',
  hots: 'HOTS (menganalisis, mengevaluasi, dan mencipta)',
  campuran: 'campuran dari mudah, sedang, hingga sulit secara berimbang',
};

function asString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

function asInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Normalisasi input form generate soal.
 * Wajib: minimal salah satu dari `mapel` atau `materi`.
 */
function sanitizeSoalInput(raw) {
  if (!raw || typeof raw !== 'object') {
    const err = new Error('Payload tidak valid.');
    err.statusCode = 400;
    err.code = 'invalid_payload';
    throw err;
  }
  const d = raw;
  const tipeRaw = asString(d.tipe, 20).toLowerCase();
  const kesulitanRaw = asString(d.kesulitan, 20).toLowerCase();
  const input = {
    mapel: asString(d.mapel, 200),
    kelas: asString(d.kelas, 60),
    jenjang: asString(d.jenjang, 60),
    materi: asString(d.materi, 500),
    jumlah: asInt(d.jumlah, 5, 1, 30),
    tipe: TIPE_ALLOWED.includes(tipeRaw) ? tipeRaw : 'pg',
    kesulitan: KESULITAN_ALLOWED.includes(kesulitanRaw) ? kesulitanRaw : 'sedang',
    jumlahOpsi: asInt(d.jumlahOpsi, 4, 2, 6),
    poin: asInt(d.poin, 0, 0, 100),
    pembahasan: d.pembahasan === true || d.pembahasan === 'true',
    latex: d.latex === true || d.latex === 'true',
    instruksi: asString(d.instruksi, 2000),
  };

  if (!input.mapel && !input.materi) {
    const err = new Error('Minimal isi Mata Pelajaran atau Materi/Topik.');
    err.statusCode = 400;
    err.code = 'missing_required';
    throw err;
  }
  return input;
}

function buildSystemPrompt() {
  return [
    'Kamu adalah guru senior Indonesia yang ahli menyusun butir soal ujian yang valid, jelas, dan bebas ambiguitas.',
    'Tugasmu menghasilkan sekumpulan soal dan HANYA mengeluarkan satu objek JSON yang valid (UTF-8), tanpa teks lain.',
    'JANGAN membungkus dengan blok kode markdown (tanpa ```), tanpa kalimat pembuka atau penutup, tanpa komentar.',
    '',
    'Skema JSON wajib:',
    '{',
    '  "format": "kuiz_bulk_v1",',
    '  "paket_judul": "<judul singkat paket soal>",',
    '  "soal": [ <butir soal> ]',
    '}',
    '',
    'Aturan setiap butir soal berdasarkan "tipe":',
    '- "pg" (pilihan ganda): sertakan "opsi" berupa array teks pilihan, dan "jawaban_benar" berupa HURUF kapital ("A","B","C",...) yang menunjuk indeks opsi (A=opsi ke-1). Jangan menaruh huruf di dalam teks opsi.',
    '- "bs" (benar/salah): "jawaban_benar" bernilai persis "benar" atau "salah". Tanpa "opsi".',
    '- "isian" (isian singkat): "jawaban_benar" berupa teks jawaban singkat (akan dicek tanpa memperhatikan huruf besar/kecil). Buat jawaban yang tidak bermakna ganda.',
    '- "menjodohkan": sertakan "pasangan" berupa array objek {"kiri":"...","kanan":"..."} minimal 3 pasang.',
    '- "essay" (uraian): sertakan "rubrik" berisi poin-poin penilaian dan kunci jawaban ideal. Tanpa "opsi".',
    '',
    'Field umum tiap soal: "tipe", "pertanyaan" (wajib, tidak boleh kosong), "poin" (bilangan bulat).',
    'Rumus/simbol matematika WAJIB ditulis dalam LaTeX: $...$ untuk inline dan $$...$$ untuk display. Jangan gunakan gambar atau HTML.',
    'Gunakan bahasa Indonesia yang baku, ringkas, dan sesuai jenjang siswa. Distraktor pilihan ganda harus logis dan sebanding.',
    'Pastikan jumlah soal tepat sesuai permintaan dan setiap "jawaban_benar" benar secara faktual/hitungan.',
  ].join('\n');
}

function buildUserPrompt(input) {
  const lines = ['Buatkan soal dengan ketentuan berikut:'];
  const push = (label, value) => { if (value) lines.push(`- ${label}: ${value}`); };

  push('Mata pelajaran', input.mapel);
  push('Jenjang', input.jenjang);
  push('Kelas', input.kelas);
  push('Materi/Topik', input.materi);
  lines.push(`- Jumlah soal: ${input.jumlah}`);
  lines.push(`- Tipe soal: ${TIPE_LABEL[input.tipe] || input.tipe}`);
  if (input.tipe === 'pg') {
    lines.push(`- Jumlah opsi untuk pilihan ganda: ${input.jumlahOpsi}`);
  }
  lines.push(`- Tingkat kesulitan: ${KESULITAN_LABEL[input.kesulitan] || input.kesulitan}`);
  if (input.poin > 0) {
    lines.push(`- Poin default per soal: ${input.poin}`);
  }
  if (input.latex) {
    lines.push('- Materi memuat rumus/simbol matematis: gunakan LaTeX yang valid dan rapi.');
  }
  if (input.pembahasan) {
    lines.push('- Sertakan field tambahan "pembahasan" pada SETIAP soal berisi penjelasan/langkah jawaban yang ringkas dan jelas (dalam LaTeX bila perlu).');
  }
  if (input.instruksi) {
    lines.push(`- Instruksi tambahan dari guru: ${input.instruksi}`);
  }

  lines.push('');
  lines.push('Keluarkan HANYA objek JSON sesuai skema. Pastikan JSON valid dan dapat langsung di-parse.');
  return lines.join('\n');
}

function buildMessages(input) {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(input) },
  ];
}

/**
 * Pesan perbaikan: minta model mengubah keluaran sebelumnya menjadi JSON valid
 * sesuai skema, tanpa mengubah substansi soal.
 */
function buildRepairMessages(input, brokenOutput) {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(input) },
    { role: 'assistant', content: brokenOutput.slice(0, 12000) },
    {
      role: 'user',
      content: 'Keluaran sebelumnya bukan JSON valid sesuai skema. Perbaiki menjadi SATU objek JSON valid (format "kuiz_bulk_v1") tanpa teks lain, tanpa blok kode, dan pertahankan isi soal yang sudah baik.',
    },
  ];
}

/** Ambil kandidat JSON dari teks bebas (buang code fence & teks pinggir). */
function extractJson(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text.trim();
  // Buang code fence ```json ... ```
  cleaned = cleaned.replace(/```(?:json)?/gi, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  // Pilih struktur terluar berdasarkan karakter pembuka yang muncul lebih dulu.
  const startsWithArray = firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace);
  if (startsWithArray) {
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket > firstBracket) return cleaned.slice(firstBracket, lastBracket + 1);
  }
  if (firstBrace >= 0) {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > firstBrace) return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

/**
 * Validasi ringan keluaran model. Mengembalikan { payload, count } bila valid,
 * atau { error } bila tidak. Normalisasi rinci tetap di frontend.
 */
function validateSoalOutput(text) {
  const jsonText = extractJson(text);
  if (!jsonText) return { error: 'Keluaran kosong.' };
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { error: `JSON tidak valid: ${e.message}` };
  }

  let soal = [];
  let judul = '';
  if (Array.isArray(parsed)) {
    soal = parsed;
  } else if (parsed && typeof parsed === 'object') {
    judul = typeof parsed.paket_judul === 'string' ? parsed.paket_judul : '';
    soal = Array.isArray(parsed.soal) ? parsed.soal : [];
  }

  const cleanSoal = soal.filter((s) => s && typeof s === 'object' && String(s.pertanyaan || '').trim());
  if (!cleanSoal.length) {
    return { error: 'Tidak ada butir soal dengan pertanyaan yang valid.' };
  }

  const payload = {
    format: 'kuiz_bulk_v1',
    paket_judul: judul,
    soal: cleanSoal,
  };
  return { payload, count: cleanSoal.length };
}

module.exports = {
  TIPE_ALLOWED,
  KESULITAN_ALLOWED,
  sanitizeSoalInput,
  buildSystemPrompt,
  buildUserPrompt,
  buildMessages,
  buildRepairMessages,
  extractJson,
  validateSoalOutput,
};
