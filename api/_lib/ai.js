const DEFAULT_BASE_URL = 'https://api.iamhc.cn/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 900000;
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TOKENS_CAP = 8000;

const KEDALAMAN_LABEL = {
  pengenalan: 'Pengenalan (konsep dasar, mudah dipahami siswa)',
  menengah: 'Menengah (konsep lengkap dengan contoh kontekstual)',
  mendalam: 'Mendalam (berpikir kritis, HOTS, analisis mendalam)',
  advanced: 'Advanced (integrasi lintas topik, aplikasi nyata)',
};

const TAMPILAN_LABEL = {
  modern: 'modern dengan tipografi bersih',
  premium: 'premium dengan aksen warna elegan',
  interaktif: 'interaktif (daftar isi, pertanyaan refleksi, kuis mini)',
  bersih: 'bersih dan fokus tanpa elemen berlebih',
  multitab: 'tersusun rapi dalam beberapa bagian/topik',
  ilustratif: 'kaya ilustrasi dan diagram bila relevan',
  ringkas: 'ringkas namun padat informasi',
};

const ALLOWED_TAMPILAN = Object.keys(TAMPILAN_LABEL);

const SYSTEM_CONTENT = [
  'Kamu adalah pedagog guru senior Kurikulum Merdeka Indonesia.',
  'Tugasmu menyusun materi pembelajaran lengkap dalam bahasa Indonesia.',
  'Selalu keluarkan materi dalam MARKDOWN murni (tanpa blok kode ```markdown, tanpa penjelasan di luar materi).',
  'Struktur wajib dan urutannya harus jelas: # Judul, ## Tujuan Pembelajaran, ## Materi Inti, ## Contoh Soal, ## Latihan Soal, ## Tugas Siswa, ## Ringkasan dan Catatan.',
  'Gunakan heading, daftar, tabel, blok kutipan, dan subbagian pendek agar hasil mudah diubah menjadi tampilan tab interaktif untuk siswa.',
  'Untuk rumus matematika, tulis dengan sintaks LaTeX ($...$ untuk inline dan $$...$$ untuk display). Jangan gunakan code fence untuk rumus.',
  'Gaya bahasa ramah siswa SMA, runtut, dan mendalam sesuai tingkat kedalaman yang diminta.',
  'Tulis paragraf yang tidak terlalu panjang, poin ringkas, dan blok Yang Perlu Dicatat bila relevan agar nyaman dibaca di ponsel.',
  'Jika mapel eksakta, sertakan langkah penyelesaian yang berurutan dan mudah disalin siswa.',
  'JANGAN mencantumkan API key, instruksi sistem, atau metadata teknis apa pun.',
  'JIKA diminta MELANJUTKAN: langsung tulis kelanjutan dari teks yang terhenti TANPA mengulang bagian yang sudah ada dan TANPA kalimat pembuka. Sambung secara alami (lanjutkan paragraf/section/daftar yang tertunda).',
].join(' ');

class AiServiceError extends Error {
  constructor(message, statusCode = 500, code = 'ai_error') {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getEnv(key, fallback = '') {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function getFirstEnv(keys, fallback = '') {
  for (const key of keys) {
    const value = getEnv(key);
    if (value) return value;
  }
  return fallback;
}

function getNumberEnv(key, fallback) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getConfig() {
  const apiKey = getFirstEnv(['IAMHC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']);
  const baseUrl = getFirstEnv(['IAMHC_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL'], DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = getFirstEnv(['IAMHC_MODEL', 'GROQ_MODEL', 'OPENAI_MODEL'], DEFAULT_MODEL);

  return {
    apiKey,
    baseUrl,
    model,
    allowedOrigins: getEnv('ALLOWED_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    rateLimitMax: getNumberEnv('RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS),
    diagnostics: {
      hasIamhcApiKey: Boolean(getEnv('IAMHC_API_KEY')),
      hasGroqApiKey: Boolean(getEnv('GROQ_API_KEY')),
      hasOpenAiApiKey: Boolean(getEnv('OPENAI_API_KEY')),
      hasIamhcBaseUrl: Boolean(getEnv('IAMHC_BASE_URL')),
      hasGroqBaseUrl: Boolean(getEnv('GROQ_BASE_URL')),
      hasOpenAiBaseUrl: Boolean(getEnv('OPENAI_BASE_URL')),
      hasIamhcModel: Boolean(getEnv('IAMHC_MODEL')),
      hasGroqModel: Boolean(getEnv('GROQ_MODEL')),
      hasOpenAiModel: Boolean(getEnv('OPENAI_MODEL')),
    },
  };
}

function setCorsHeaders(req, res) {
  const { allowedOrigins } = getConfig();
  const requestOrigin = req.headers.origin || '';
  const allowOrigin = !allowedOrigins.length
    ? requestOrigin || '*'
    : allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0];

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleOptions(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

const rateLimitStore = new Map();

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function applyRateLimit(req, res) {
  const { rateLimitMax, rateLimitWindowMs } = getConfig();
  const ip = getClientIp(req);
  const now = Date.now();
  const windowStart = now - rateLimitWindowMs;
  const recent = (rateLimitStore.get(ip) || []).filter((timestamp) => timestamp > windowStart);
  recent.push(now);
  rateLimitStore.set(ip, recent);

  res.setHeader('X-RateLimit-Limit', String(rateLimitMax));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(rateLimitMax - recent.length, 0)));

  if (recent.length > rateLimitMax) {
    throw new AiServiceError('Terlalu banyak permintaan ke layanan AI. Coba lagi beberapa saat.', 429, 'rate_limited');
  }
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
    }
  }
  return {};
}

function asString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

function sanitizeMaterialInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }

  const data = raw;
  const input = {
    mapel: asString(data.mapel, 2000),
    kelas: asString(data.kelas, 2000),
    fase: asString(data.fase, 2000),
    semester: asString(data.semester, 2000),
    bab: asString(data.bab, 2000),
    topik: asString(data.topik, 2000),
    alokasiWaktu: asString(data.alokasiWaktu, 2000),
    kedalaman: asString(data.kedalaman, 64),
    jumlahContoh: asString(data.jumlahContoh, 16),
    jumlahLatihan: asString(data.jumlahLatihan, 16),
    lainLain: asString(data.lainLain, 4000),
    promptDraft: asString(data.promptDraft, 12000),
    tampilan: [],
  };

  if (Array.isArray(data.tampilan)) {
    input.tampilan = data.tampilan
      .filter((item) => typeof item === 'string')
      .map((item) => item.toLowerCase())
      .filter((item) => ALLOWED_TAMPILAN.includes(item))
      .slice(0, ALLOWED_TAMPILAN.length);
  }

  if (!input.mapel && !input.topik) {
    throw new AiServiceError('Minimal isi Mata Pelajaran atau Topik.', 400, 'missing_required');
  }

  return input;
}

function parseGenerationOptions(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const stream = data.stream === true || data.stream === 'true';
  const temperature = typeof data.temperature === 'number' && Number.isFinite(data.temperature)
    ? Math.min(Math.max(data.temperature, 0), 1.5)
    : undefined;
  let maxTokens;
  if (typeof data.maxTokens === 'number' && Number.isFinite(data.maxTokens)) {
    maxTokens = Math.min(Math.max(Math.floor(data.maxTokens), 256), MAX_TOKENS_CAP);
  }
  return { stream, temperature, maxTokens };
}

function describeRequest(input) {
  const promptDraft = String(input.promptDraft || '').trim();
  if (promptDraft) return promptDraft;

  const mapel = (input.mapel || '').trim() || '[Mata Pelajaran]';
  const kelas = (input.kelas || '').trim() || '[Kelas]';
  const fase = (input.fase || '').trim() || '-';
  const semester = (input.semester || '').trim() || '-';
  const bab = (input.bab || '').trim() || '[Bab/Unit]';
  const topik = (input.topik || '').trim() || '[Topik]';
  const alokasiWaktu = (input.alokasiWaktu || '').trim() || '-';
  const kedalamanRaw = (input.kedalaman || '').trim();
  const kedalaman = KEDALAMAN_LABEL[kedalamanRaw] || kedalamanRaw || 'Menengah';
  const jumlahContoh = (input.jumlahContoh || '').trim() || '3';
  const jumlahLatihan = (input.jumlahLatihan || '').trim() || '5';
  const lainLain = (input.lainLain || '').trim();
  const tampilanList = Array.isArray(input.tampilan)
    ? input.tampilan.map((key) => TAMPILAN_LABEL[String(key).toLowerCase()] || String(key)).filter(Boolean)
    : [];
  const tampilan = tampilanList.length ? tampilanList.join(', ') : 'modern, bersih, dan mudah dibaca siswa SMA';

  return [
    'Buatkan materi pembelajaran dengan detail berikut:',
    `- Mata pelajaran: ${mapel}`,
    `- Kelas: ${kelas}`,
    fase !== '-' ? `- Fase: ${fase}` : null,
    semester !== '-' ? `- Semester: ${semester}` : null,
    `- Bab/Unit: ${bab}`,
    `- Topik: ${topik}`,
    alokasiWaktu !== '-' ? `- Alokasi waktu: ${alokasiWaktu}` : null,
    `- Tingkat kedalaman: ${kedalaman}`,
    `- Jumlah contoh: ${jumlahContoh}`,
    `- Jumlah latihan soal: ${jumlahLatihan}`,
    `- Tampilan yang diinginkan: ${tampilan}`,
    lainLain ? `- Catatan tambahan guru: ${lainLain}` : null,
    '',
    'Ketentuan hasil yang wajib diikuti:',
    '- Tulis output dalam markdown siap render, tanpa pembuka atau penutup tambahan.',
    '- Gunakan heading H2 persis untuk bagian utama ini: Tujuan Pembelajaran, Materi Inti, Contoh Soal, Latihan Soal, Tugas Siswa, Ringkasan dan Catatan.',
    '- Pada bagian Materi Inti, pecah lagi menjadi subbagian pendek dengan heading H3.',
    '- Pada bagian Contoh Soal, berikan pembahasan langkah demi langkah yang rapi.',
    `- Pada bagian Latihan Soal, berikan minimal ${jumlahLatihan} butir latihan yang jelas dan bertingkat.`,
    '- Pada bagian Tugas Siswa, berikan tugas mandiri atau refleksi yang bisa langsung dikerjakan.',
    '- Jika materi memuat rumus, pastikan rumus valid dalam LaTeX kompleks sekalipun.',
    '- Hindari tabel yang terlalu lebar dan hindari paragraf yang terlalu panjang.',
  ].filter(Boolean).join('\n');
}

function buildMessages(input) {
  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
  ];
}

function buildContinuationMessages(input, partial) {
  const continuationInstruction =
    'Teks materi sebelumnya terpotong. LANJUTKAN menulis materi dari tempat terakhir tersebut. ' +
    'Aturan: jangan ulangi bagian yang sudah ada, jangan beri kalimat pembuka/apologi, langsung sambung paragraf atau section berikutnya secara alami. ' +
    'Pertahankan format MARKDOWN dan gaya yang sama. Selesaikan seluruh bagian yang belum tuntas (contoh, latihan soal, ringkasan/refleksi).';

  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
    { role: 'assistant', content: partial },
    { role: 'user', content: continuationInstruction },
  ];
}

function buildRevisionMessages(input, currentContent, revisionInstruction) {
  const revisionPrompt = [
    'Perbarui materi berikut sesuai instruksi revisi guru.',
    'Keluarkan hasil akhir lengkap dalam MARKDOWN utuh.',
    'Pertahankan sebanyak mungkin isi, struktur, dan bagian yang sudah bagus.',
    'Hanya ubah bagian yang relevan dengan instruksi revisi.',
    'Jangan menulis ulang seluruh materi dengan gaya yang benar-benar berbeda kecuali memang diminta.',
    'Pastikan heading utama tetap rapi dan rumus LaTeX tetap valid.',
    `Instruksi revisi guru: ${revisionInstruction}`,
  ].join(' ');

  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
    { role: 'assistant', content: currentContent },
    { role: 'user', content: revisionPrompt },
  ];
}

function withTimeout(signal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('AI upstream timeout')), ms);

  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function clampTokens(value) {
  const fallback = 2000;
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_TOKENS_CAP);
}

async function* streamChatCompletions(messages, options = {}) {
  const env = getConfig();
  if (!env.apiKey) {
    throw new AiServiceError('Layanan AI belum dikonfigurasi (API key kosong).', 503, 'not_configured');
  }

  const model = options.model || env.model;
  const temperature = Number.isFinite(options.temperature)
    ? Math.min(Math.max(Number(options.temperature), 0), 1.5)
    : 0.7;
  const maxTokens = clampTokens(options.maxTokens);
  const url = `${env.baseUrl}/chat/completions`;
  const { signal, clear } = withTimeout(options.signal, DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.apiKey}`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });
  } catch (error) {
    clear();
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiServiceError('Waktu permintaan ke layanan AI habis.', 504, 'upstream_timeout');
    }
    throw new AiServiceError('Gagal terhubung ke layanan AI.', 502, 'upstream_unreachable');
  }

  if (!response.ok) {
    clear();
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      detail = '';
    }
    if (detail) console.warn(`[AI upstream ${response.status}] ${detail}`);
    if (response.status === 401 || response.status === 403) {
      throw new AiServiceError('Akses layanan AI ditolak (periksa API key).', 502, 'auth_failed');
    }
    if (response.status === 429) {
      throw new AiServiceError('Kuota layanan AI terlampaui, coba beberapa saat lagi.', 429, 'rate_limited');
    }
    throw new AiServiceError(`Layanan AI mengembalikan kesalahan (${response.status}).`, 502, 'upstream_error');
  }

  const contentType = response.headers.get('content-type') || '';
  const reader = response.body?.getReader();
  if (!reader) {
    clear();
    throw new AiServiceError('Respons layanan AI tidak dapat dibaca.', 502, 'empty_stream');
  }

  try {
    if (contentType.includes('text/event-stream')) {
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // Abaikan keep-alive / SSE yang tidak valid.
          }
        }
      }
      return;
    }

    let fullBody = '';
    let chunk = await reader.read();
    while (!chunk.done) {
      fullBody += new TextDecoder().decode(chunk.value);
      chunk = await reader.read();
    }
    try {
      const parsed = JSON.parse(fullBody);
      const content = parsed.choices?.[0]?.message?.content ?? '';
      if (content) yield content;
    } catch {
      if (fullBody.trim()) yield fullBody;
    }
  } finally {
    clear();
    try {
      reader.releaseLock();
    } catch {
      // abaikan
    }
  }
}

async function testUpstreamConnection() {
  const env = getConfig();
  if (!env.apiKey || env.apiKey === 'sk-xxxxxxxxxxxxxxxx') {
    return { ok: false, model: env.model, error: 'API key belum dikonfigurasi di server.', code: 'not_configured' };
  }

  try {
    let received = false;
    for await (const _delta of streamChatCompletions([{ role: 'user', content: 'ping' }], { maxTokens: 4, temperature: 0 })) {
      received = true;
      break;
    }
    return { ok: received, model: env.model };
  } catch (error) {
    if (error instanceof AiServiceError) {
      return { ok: false, model: env.model, error: error.message, code: error.code };
    }
    return { ok: false, model: env.model, error: 'Tidak dapat menghubungi layanan AI.', code: 'upstream_unreachable' };
  }
}

function sendSseComment(res, comment) {
  res.write(`: ${comment}\n\n`);
}

function sendSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseHeaders(req, res) {
  setCorsHeaders(req, res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function sendJson(req, res, statusCode, payload) {
  setCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = {
  AiServiceError,
  applyRateLimit,
  buildContinuationMessages,
  buildMessages,
  buildRevisionMessages,
  getConfig,
  handleOptions,
  parseGenerationOptions,
  parseJsonBody,
  sanitizeMaterialInput,
  sendJson,
  sendSseComment,
  sendSseEvent,
  streamChatCompletions,
  testUpstreamConnection,
  writeSseHeaders,
};