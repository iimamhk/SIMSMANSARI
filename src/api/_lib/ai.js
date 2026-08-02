const DEFAULT_BASE_URL = 'https://api.iamhc.cn/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_RATE_LIMIT_MAX = 20;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 900000;
// Batas waktu INAKTIVITAS ke layanan AI (di-reset tiap chunk token diterima),
// bukan batas total generate. Dinaikkan 3x dari 120s karena model "thinking"
// bisa berpikir lama sebelum token pertama muncul, terutama pada materi mode
// HTML yang menulis satu dokumen utuh.
const DEFAULT_TIMEOUT_MS = 360000;
// Materi mode HTML premium membutuhkan output panjang (satu dokumen utuh),
// jauh di atas kebutuhan mode JSON terstruktur.
const MAX_TOKENS_CAP = 32000;

let aiConfigModule = null;
function loadAiConfigModule() {
  if (aiConfigModule) return aiConfigModule;
  try {
    aiConfigModule = require('./ai-config');
  } catch {
    aiConfigModule = null;
  }
  return aiConfigModule;
}

function sanitizeProfileId(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  return cleaned || fallback;
}

function parseModelList(value, fallbackModel) {
  const fromArray = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const merged = [...fromArray, String(fallbackModel || '').trim()].filter(Boolean);
  return Array.from(new Set(merged));
}

function parseAiProfiles() {
  const defaultModel = getFirstEnv(['IAMHC_MODEL', 'GROQ_MODEL', 'OPENAI_MODEL'], DEFAULT_MODEL);
  const defaultProfile = {
    id: 'default',
    label: getEnv('AI_DEFAULT_LABEL', 'Default AI'),
    apiKey: getFirstEnv(['IAMHC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']),
    baseUrl: getFirstEnv(['IAMHC_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL'], DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: defaultModel,
    models: parseModelList([], defaultModel),
    isDefault: true,
  };

  const raw = getEnv('AI_MODEL_PROFILES');
  if (!raw) return [defaultProfile];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [defaultProfile];

    const customProfiles = parsed
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry;
        const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
        const apiKeyEnv = typeof record.apiKeyEnv === 'string' ? getEnv(record.apiKeyEnv) : '';
        const resolvedApiKey = apiKey || apiKeyEnv;
        const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim().replace(/\/$/, '') : '';
        const model = typeof record.model === 'string' ? record.model.trim() : '';
        if (!resolvedApiKey || !baseUrl || !model) return null;
        const label = typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : `AI Profile ${index + 1}`;
        const id = sanitizeProfileId(typeof record.id === 'string' ? record.id : label, `profile-${index + 1}`);
        return {
          id,
          label,
          apiKey: resolvedApiKey,
          baseUrl,
          model,
          models: parseModelList(record.models, model),
          isDefault: record.isDefault === true,
        };
      })
      .filter(Boolean);

    if (!customProfiles.length) return [defaultProfile];
    if (!customProfiles.some((profile) => profile.isDefault)) {
      customProfiles[0] = { ...customProfiles[0], isDefault: true };
    }
    return customProfiles;
  } catch {
    return [defaultProfile];
  }
}

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
  'Kamu bertindak sebagai penulis buku dan materi digital pembelajaran berpengalaman selama 15 tahun, sekaligus pedagog guru senior Kurikulum Merdeka Indonesia.',
  'Tugasmu menyusun materi pembelajaran lengkap dalam bahasa Indonesia yang kaya isi, enak dibaca, modern, interaktif, dan tidak membosankan.',
  'Selalu keluarkan materi dalam MARKDOWN murni (tanpa blok kode ```markdown, tanpa penjelasan di luar materi).',
  'Struktur wajib dan urutannya harus jelas: # Judul, ## Tujuan Pembelajaran, ## Materi Inti, ## Contoh Soal, ## Latihan Soal, ## Tugas Siswa, ## Ringkasan dan Catatan.',
  'Gunakan heading, daftar, tabel, blok kutipan, callout, dan subbagian pendek agar hasil mudah diubah menjadi tampilan tab interaktif untuk siswa.',
  'Untuk rumus matematika, tulis dengan sintaks LaTeX ($...$ untuk inline dan $$...$$ untuk display). Jangan gunakan code fence untuk rumus.',
  'Gaya bahasa harus hangat, luwes, komunikatif, dan tetap akademik. Hindari suara yang datar, kaku, robotik, atau seperti template generik AI.',
  'Tulis paragraf yang tidak terlalu panjang, tetapi setiap bagian harus substantif, kaya penjelasan, dan tidak terlalu singkat.',
  'Variasikan cara penyajian antarsubbagian: kombinasikan paragraf pembuka singkat, daftar bernomor, tabel ringkas, contoh kontekstual, dan pertanyaan reflektif bila relevan.',
  'Pada bagian Contoh Soal, WAJIB gunakan penomoran yang jelas seperti Contoh 1, Contoh 2, dan seterusnya, lalu beri pembahasan langkah demi langkah yang rapi.',
  'Pada bagian Latihan Soal, WAJIB gunakan penomoran yang jelas dan bertingkat, bukan hanya bullet biasa.',
  'Jika mapel eksakta, sertakan langkah penyelesaian yang berurutan, mudah disalin siswa, dan jelaskan alasan setiap langkah penting.',
  'Jika mapel non-eksakta, gunakan ilustrasi, analogi, potongan kasus, atau skenario nyata agar materi terasa hidup.',
  'Pastikan materi terasa seperti halaman materi digital premium: kaya, terstruktur, menarik, dan memberi ritme baca yang tidak monoton.',
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
  const aiProfiles = parseAiProfiles();
  const defaultAiProfile = aiProfiles.find((profile) => profile.isDefault) || aiProfiles[0];
  const apiKey = defaultAiProfile?.apiKey || '';
  const baseUrl = defaultAiProfile?.baseUrl || DEFAULT_BASE_URL;
  const model = defaultAiProfile?.model || DEFAULT_MODEL;

  return {
    apiKey,
    baseUrl,
    model,
    aiProfiles,
    defaultAiProfileId: defaultAiProfile?.id || 'default',
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
      hasAiModelProfiles: Boolean(getEnv('AI_MODEL_PROFILES')),
    },
  };
}

function resolveAiProfile(profileId) {
  const env = getConfig();
  const normalized = typeof profileId === 'string' ? profileId.trim() : '';
  return env.aiProfiles.find((profile) => profile.id === normalized) || env.aiProfiles[0];
}

/**
 * Resolusi profil efektif secara async: prioritaskan konfigurasi yang disimpan
 * admin di Firestore (settings/ai). Bila kosong/tidak aktif, fallback ke profil
 * env. Mengembalikan objek profil dengan bentuk yang sama seperti resolveAiProfile.
 */
async function resolveEffectiveProfile(profileId) {
  const aiConfig = loadAiConfigModule();
  if (aiConfig && typeof aiConfig.readStoredConfig === 'function') {
    try {
      const stored = await aiConfig.readStoredConfig();
      if (stored && stored.apiKey && stored.baseUrl && stored.model) {
        return {
          id: 'firestore',
          label: 'AI (Konfigurasi Admin)',
          apiKey: stored.apiKey,
          baseUrl: stored.baseUrl,
          model: stored.model,
          models: Array.isArray(stored.models) && stored.models.length ? stored.models : [stored.model],
          isDefault: true,
        };
      }
    } catch (error) {
      console.warn('Fallback ke profil env:', error?.message || error);
    }
  }
  return resolveAiProfile(profileId);
}

function getAiProfileModelCandidates(profileId, preferredModel, profileOverride) {
  const profile = profileOverride || resolveAiProfile(profileId);
  const preferred = typeof preferredModel === 'string' ? preferredModel.trim() : '';
  const candidates = [preferred, profile.model, ...(Array.isArray(profile.models) ? profile.models : [])]
    .map((model) => String(model || '').trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function getAiFallbackProfiles(profileId) {
  const env = getConfig();
  const primary = resolveAiProfile(profileId);
  return [primary, ...env.aiProfiles.filter((profile) => profile.id !== primary.id)];
}

function getPublicAiProfiles() {
  const env = getConfig();
  return env.aiProfiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    model: profile.model,
    models: profile.models,
    baseUrl: profile.baseUrl,
    isDefault: Boolean(profile.isDefault),
  }));
}

function setCorsHeaders(req, res) {
  const { allowedOrigins } = getConfig();
  const requestOrigin = String(req.headers.origin || '').trim();
  const isLocalDevelopmentOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  const isAllowed = requestOrigin && (
    !allowedOrigins.length
    || allowedOrigins.includes(requestOrigin)
    || isLocalDevelopmentOrigin
  );

  // Jangan mengirim origin lain sebagai fallback: browser akan menolak respons
  // dan konfigurasi CORS dapat tanpa sengaja mengizinkan origin yang salah.
  if (isAllowed) res.setHeader('Access-Control-Allow-Origin', requestOrigin);
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
    '- Pada bagian Materi Inti, pecah lagi menjadi subbagian pendek dengan heading H3 dan gaya penyajian yang bervariasi agar tidak monoton.',
    '- Awali setiap bagian utama dengan pengantar singkat yang hidup dan natural, bukan kalimat formal yang kaku.',
    '- Pada bagian Contoh Soal, gunakan penomoran eksplisit seperti Contoh 1, Contoh 2, dan seterusnya, lalu berikan pembahasan langkah demi langkah yang rapi.',
    `- Pada bagian Latihan Soal, berikan minimal ${jumlahLatihan} butir latihan yang jelas, bertingkat, dan bernomor urut.`,
    '- Pada bagian Tugas Siswa, berikan tugas mandiri atau refleksi yang bisa langsung dikerjakan.',
    '- Buat isi setiap bagian cukup kaya: jangan terlalu singkat, jangan sekadar definisi satu paragraf lalu selesai.',
    '- Sisipkan contoh kontekstual, analogi, atau ilustrasi nyata agar siswa merasa materi dekat dengan kehidupan mereka.',
    '- Jika sesuai, gunakan tabel ringkas atau blok sorotan untuk memperjelas ringkasan konsep, miskonsepsi umum, atau langkah penting.',
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

function buildRevisionMessages(input, currentContent, revisionInstruction, revisionMode) {
  const normalizedMode = String(revisionMode || '').trim().toLowerCase();
  const modeGuidance = {
    concise: 'Fokus revisi: buat materi lebih ringkas tanpa menghilangkan isi inti. Pangkas kalimat berulang, pembuka yang terlalu panjang, dan penjelasan yang tidak menambah makna. Pertahankan struktur utama, istilah penting, contoh yang kuat, dan alur belajar. Target akhir harus terasa lebih padat, lebih mudah dipindai, dan lebih cepat dipelajari.',
    engaging: 'Fokus revisi: buat materi lebih menarik, hangat, dan hidup. Perkuat variasi kalimat, gunakan pengantar yang memancing rasa ingin tahu, dan tambahkan kaitan dengan situasi nyata siswa. Utamakan peningkatan daya tarik baca tanpa membongkar struktur besar yang sudah rapi.',
    exercise: 'Fokus revisi: tambahkan latihan yang lebih kaya dan terstruktur. Perluas bagian latihan soal dengan penomoran yang jelas, variasi tingkat kesulitan, dan instruksi yang mudah dipahami. Jika latihan sudah ada, pertahankan yang bagus lalu lengkapi agar lebih menantang dan relevan.',
    analogy: 'Fokus revisi: tambahkan analogi, ilustrasi, atau perbandingan kontekstual untuk konsep yang abstrak. Sisipkan analogi pada bagian yang paling sulit dipahami tanpa membuat materi menjadi bertele-tele. Pastikan analogi tetap akurat secara akademik dan dekat dengan pengalaman siswa.',
    premium: 'Fokus revisi: perkuat nuansa premium, modern, dan interaktif pada penyajian materi. Rapikan struktur, tambahkan callout atau penekanan isi yang elegan, dan buat transisi antarbab terasa lebih halus. Tetap jaga materi mudah dibaca dan tidak berubah menjadi dekoratif berlebihan.',
  }[normalizedMode] || '';

  const revisionPrompt = [
    'Perbarui materi berikut sesuai instruksi revisi guru.',
    'Keluarkan hasil akhir lengkap dalam MARKDOWN utuh.',
    'Pertahankan sebanyak mungkin isi, struktur, dan bagian yang sudah bagus.',
    'Hanya ubah bagian yang relevan dengan instruksi revisi.',
    'Jangan menulis ulang seluruh materi dengan gaya yang benar-benar berbeda kecuali memang diminta.',
    'Saat merevisi, pertahankan gaya penulisan yang kaya, hidup, modern, dan tidak kaku.',
    'Pastikan heading utama tetap rapi dan rumus LaTeX tetap valid.',
    'Jika instruksi revisi bersifat lokal, prioritaskan penyempurnaan bagian terkait dan biarkan bagian lain tetap stabil.',
    modeGuidance,
    `Instruksi revisi guru: ${revisionInstruction}`,
  ].filter(Boolean).join(' ');

  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
    { role: 'assistant', content: currentContent },
    { role: 'user', content: revisionPrompt },
  ];
}

function withTimeout(signal, ms) {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(new Error('AI upstream timeout')), ms);

  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
    // Reset timer inaktivitas: dipanggil tiap chunk token diterima agar generasi
    // yang lambat tetapi masih mengalir tidak dibunuh oleh batas waktu tetap.
    reset: () => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(new Error('AI upstream timeout')), ms);
    },
  };
}

function clampTokens(value) {
  const fallback = 4000;
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_TOKENS_CAP);
}

async function* streamSingleChatCompletion(profile, model, messages, options = {}) {
  if (!profile?.apiKey) {
    throw new AiServiceError('Layanan AI belum dikonfigurasi (API key kosong).', 503, 'not_configured');
  }

  const temperature = Number.isFinite(options.temperature)
    ? Math.min(Math.max(Number(options.temperature), 0), 1.5)
    : 0.7;
  const maxTokens = clampTokens(options.maxTokens);
  const url = `${profile.baseUrl}/chat/completions`;
  const { signal, clear, reset } = withTimeout(options.signal, DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey}`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: !options.forceNonStream,
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
        let chunk;
        try {
          chunk = await reader.read();
        } catch (readError) {
          // Koneksi terputus di tengah stream — hentikan tanpa error fatal
          // agar pemanggil dapat menyelamatkan konten parsial.
          break;
        }
        const { done, value } = chunk;
        if (done) break;
        // Token diterima → reset timer inaktivitas agar batas 120s hanya berlaku
        // saat stream benar-benar macet, bukan saat generasi hanya lambat.
        reset();
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
            const choice = parsed.choices?.[0];
            const delta = choice?.delta?.content;
            const reasoning = choice?.delta?.reasoning_content;
            if (delta) yield delta;
            else if (reasoning && options.includeReasoning !== false) yield reasoning;
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
      reset();
      fullBody += new TextDecoder().decode(chunk.value);
      chunk = await reader.read();
    }
    try {
      const parsed = JSON.parse(fullBody);
      const msg = parsed.choices?.[0]?.message ?? {};
      const content = msg.content ?? '';
      if (content) {
        yield content;
      } else if (msg.reasoning_content && options.includeReasoning !== false) {
        yield msg.reasoning_content;
      } else if (parsed.error) {
        const errMsg = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message || JSON.stringify(parsed.error));
        console.warn('[AI upstream JSON error]', errMsg.slice(0, 300));
        throw new AiServiceError(`Layanan AI menolak: ${errMsg.slice(0, 200)}`, 502, 'upstream_error');
      } else if (parsed.choices?.[0]?.delta?.content) {
        yield parsed.choices[0].delta.content;
      }
    } catch (parseError) {
      if (parseError instanceof AiServiceError) throw parseError;
      if (fullBody.trim()) {
        console.warn('[AI upstream non-JSON body]', fullBody.slice(0, 300));
        yield fullBody;
      }
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

async function* streamChatCompletions(messages, options = {}) {
  const profile = options.resolvedProfile || resolveAiProfile(options.profileId);
  const candidates = getAiProfileModelCandidates(profile.id, options.model || profile.model, options.resolvedProfile || null);
  if (!candidates.length) {
    throw new AiServiceError('Model AI belum dikonfigurasi.', 503, 'not_configured');
  }

  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      if (typeof options.onModelSelected === 'function') {
        options.onModelSelected(candidate);
      }
      if (index > 0 && typeof options.onModelFallback === 'function') {
        options.onModelFallback(candidates[index - 1], candidate);
      }
      yield* streamSingleChatCompletion(profile, candidate, messages, options);
      return;
    } catch (error) {
      lastError = error;
      const canRetryWithNextModel = error instanceof AiServiceError
        && error.code === 'rate_limited'
        && index < candidates.length - 1;
      if (canRetryWithNextModel) continue;
      throw error;
    }
  }

  throw lastError || new AiServiceError('Gagal memulai generate. Periksa koneksi ke layanan AI.', 502, 'generation_failed');
}

async function testUpstreamConnection(options = {}) {
  const profile = options.overrideProfile || resolveAiProfile(options.profileId);
  if (!profile?.apiKey || profile.apiKey === 'sk-xxxxxxxxxxxxxxxx') {
    return { ok: false, model: profile?.model || DEFAULT_MODEL, error: 'API key belum dikonfigurasi di server.', code: 'not_configured' };
  }

  try {
    let received = false;
    let activeModel = options.model || profile.model;
    let modelFallbackUsed = false;
    // Untuk tes koneksi, pakai non-stream agar lebih reliable dengan provider
    // yang mungkin tidak mendukung SSE dengan benar.
    const testOptions = { maxTokens: 256, temperature: 0, isTest: true, forceNonStream: true };
    for await (const _delta of streamChatCompletions([{ role: 'user', content: 'Balas dengan kata: OK' }], {
      profileId: profile.id,
      resolvedProfile: options.overrideProfile || null,
      model: options.model || profile.model,
      ...testOptions,
      onModelSelected: (model) => {
        activeModel = model;
      },
      onModelFallback: (_fromModel, toModel) => {
        modelFallbackUsed = true;
        activeModel = toModel;
      },
    })) {
      received = true;
      break;
    }
    if (!received) {
      return { ok: false, model: activeModel, profileId: profile.id, modelFallbackUsed, baseUrl: profile.baseUrl, error: `Layanan AI merespons tanpa konten. Periksa model "${activeModel}" tersedia di ${profile.baseUrl} dan API key valid.`, code: 'empty_response' };
    }
    return { ok: received, model: activeModel, profileId: profile.id, modelFallbackUsed };
  } catch (error) {
    if (error instanceof AiServiceError) {
      return { ok: false, model: profile.model, profileId: profile.id, baseUrl: profile.baseUrl, error: error.message, code: error.code };
    }
    return { ok: false, model: profile.model, profileId: profile.id, baseUrl: profile.baseUrl, error: error?.message || 'Tidak dapat menghubungi layanan AI.', code: 'upstream_unreachable' };
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
  getAiFallbackProfiles,
  getAiProfileModelCandidates,
  getConfig,
  getPublicAiProfiles,
  handleOptions,
  parseGenerationOptions,
  parseJsonBody,
  resolveAiProfile,
  resolveEffectiveProfile,
  sanitizeMaterialInput,
  sendJson,
  sendSseComment,
  sendSseEvent,
  streamChatCompletions,
  testUpstreamConnection,
  writeSseHeaders,
};
