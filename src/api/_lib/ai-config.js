/**
 * Konfigurasi AI yang disimpan di Firestore (settings/ai), dengan enkripsi
 * AES-256-GCM untuk API key dan fallback ke profil env bila Firestore kosong.
 *
 * Tujuan: admin dapat mengganti Base URL / API key / Model lewat UI admin
 * tanpa menyunting env Vercel. Hanya satu secret stabil (AI_CONFIG_SECRET)
 * yang diperlukan untuk enkripsi; bila tidak diset, secret diturunkan dari
 * kredensial service account Firebase yang sudah ada.
 *
 * PENTING — KUNCI ENKRIPSI HARUS SAMA DI SEMUA LINGKUNGAN
 * ------------------------------------------------------
 * Nilai terenkripsi ditulis oleh satu lingkungan (biasanya Vercel, lewat panel
 * admin) tetapi bisa perlu dibaca oleh lingkungan lain (GitHub Actions, saat
 * snapshot mingguan mengunggah ke Google Drive). Karena kuncinya diturunkan dari
 * variabel lingkungan, kedua tempat harus menghasilkan kunci yang sama.
 *
 * Dulu `getSecretKey()` hanya mengembalikan SATU kunci, sehingga perbedaan kecil
 * antar lingkungan membuat dekripsi gagal dan hasilnya string kosong — yang lalu
 * tampak seperti "Google Drive belum dikonfigurasi", padahal kredensialnya ada.
 *
 * Sekarang dekripsi MENCOBA beberapa kandidat kunci. Ini tidak melemahkan
 * keamanan: AES-256-GCM memuat authentication tag, jadi kunci yang salah gagal
 * secara pasti dan tidak mungkin menghasilkan teks asal-asalan. Pendekatan yang
 * sama dipakai untuk mendukung rotasi kunci.
 */

const crypto = require('crypto');
const { getFirestore } = require('./firebase-admin');

const CONFIG_COLLECTION = 'settings';
const CONFIG_DOC_ID = 'ai';
const CACHE_TTL_MS = 30000;
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const LEGACY_DEFAULT_SECRET = 'sim-ai-config-default-secret-change-me';

let cache = { at: 0, config: null };

/** Ambil private_key dari FIREBASE_SERVICE_ACCOUNT_JSON bila tersedia. */
function privateKeyFromServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return '';
  try {
    return String(JSON.parse(raw).private_key || '');
  } catch {
    return '';
  }
}

/**
 * Daftar bahan kunci yang mungkin dipakai, diurutkan dari yang paling eksplisit.
 * Kandidat pertama yang ada juga dipakai untuk MENULIS (enkripsi), sehingga nilai
 * baru selalu konsisten dengan lingkungan tempat ia ditulis.
 */
function secretKeyCandidates() {
  const saPrivateKey = privateKeyFromServiceAccount();
  const candidates = [
    process.env.AI_CONFIG_SECRET,
    process.env.FIREBASE_PRIVATE_KEY,
    // Variasi bentuk newline: pada Vercel, FIREBASE_PRIVATE_KEY umumnya disimpan
    // dengan "\n" literal, sedangkan private_key di dalam JSON service account
    // memuat baris baru sungguhan. Keduanya menghasilkan kunci yang berbeda,
    // jadi dua-duanya perlu dicoba.
    saPrivateKey,
    saPrivateKey ? saPrivateKey.replace(/\n/g, '\\n') : '',
    process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    LEGACY_DEFAULT_SECRET,
  ];
  const seen = new Set();
  return candidates
    .filter((value) => typeof value === 'string' && value.length > 0)
    .filter((value) => (seen.has(value) ? false : seen.add(value)))
    .map((value) => crypto.createHash('sha256').update(value).digest());
}

/** Kunci utama, dipakai untuk enkripsi nilai baru. */
function getSecretKey() {
  const [primary] = secretKeyCandidates();
  return primary || crypto.createHash('sha256').update(LEGACY_DEFAULT_SECRET).digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decryptSecret(payload) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 3) return '';
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const data = Buffer.from(parts[2], 'base64');

  for (const key of secretKeyCandidates()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      return dec.toString('utf8');
    } catch {
      // Kunci ini bukan yang dipakai saat mengenkripsi; coba kandidat berikutnya.
      // Tag GCM menjamin kegagalan bersifat pasti, bukan hasil yang salah.
    }
  }
  return '';
}

/**
 * Diagnostik untuk pesan kesalahan: berapa kandidat kunci yang tersedia dan dari
 * sumber apa. TIDAK pernah mengembalikan bahan kunci itu sendiri.
 */
function describeSecretKeySources() {
  const sources = [];
  if (process.env.AI_CONFIG_SECRET) sources.push('AI_CONFIG_SECRET');
  if (process.env.FIREBASE_PRIVATE_KEY) sources.push('FIREBASE_PRIVATE_KEY');
  if (privateKeyFromServiceAccount()) sources.push('private_key dari FIREBASE_SERVICE_ACCOUNT_JSON');
  sources.push('kunci bawaan lama');
  return sources;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function maskTail(value) {
  const tail = String(value || '').trim().slice(-4);
  return tail ? `••••${tail}` : '';
}

/**
 * Baca konfigurasi AI dari Firestore. Mengembalikan null bila tidak ada,
 * koleksi tidak dapat diakses, atau konfigurasi tidak aktif.
 */
async function readStoredConfig({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.config && now - cache.at < CACHE_TTL_MS) {
    return cache.config;
  }

  let config = null;
  try {
    const snapshot = await getFirestore()
      .collection(CONFIG_COLLECTION)
      .doc(CONFIG_DOC_ID)
      .get();
    if (snapshot.exists) {
      const data = snapshot.data() || {};
      const apiKey = data.api_key_enc ? decryptSecret(data.api_key_enc) : '';
      const baseUrl = normalizeBaseUrl(data.base_url);
      const model = String(data.model || '').trim();
      if (data.is_active !== false && apiKey && baseUrl && model) {
        config = {
          source: 'firestore',
          baseUrl,
          apiKey,
          model,
          models: Array.isArray(data.models) && data.models.length ? data.models : [model],
          updatedAt: data.updated_at || '',
          updatedBy: data.updated_by || '',
          keyTail: maskTail(apiKey),
        };
      }
    }
  } catch (error) {
    // Firestore admin belum tentu terkonfigurasi di semua environment; abaikan.
    console.warn('Gagal membaca konfigurasi AI dari Firestore:', error?.message || error);
  }

  cache = { at: now, config };
  return config;
}

/**
 * Simpan konfigurasi AI dari admin. API key dienkripsi sebelum ditulis.
 */
async function writeStoredConfig({ baseUrl, apiKey, model, updatedBy }) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedModel = String(model || '').trim();
  const trimmedKey = String(apiKey || '').trim();

  if (!normalizedBase) throw new Error('Base URL wajib diisi.');
  if (!normalizedModel) throw new Error('Model wajib diisi.');
  if (!trimmedKey) throw new Error('API key wajib diisi.');

  const payload = {
    base_url: normalizedBase,
    model: normalizedModel,
    api_key_enc: encryptSecret(trimmedKey),
    is_active: true,
    updated_at: new Date().toISOString(),
    updated_by: String(updatedBy || '').trim(),
  };

  await getFirestore()
    .collection(CONFIG_COLLECTION)
    .doc(CONFIG_DOC_ID)
    .set(payload, { merge: true });

  cache = { at: 0, config: null };
  return { ok: true, keyTail: maskTail(trimmedKey), updatedAt: payload.updated_at };
}

/**
 * Kembalikan konfigurasi publik (tanpa api_key) untuk ditampilkan di admin.
 */
async function getPublicConfig() {
  const config = await readStoredConfig();
  if (!config) {
    return { configured: false, source: 'env' };
  }
  return {
    configured: true,
    source: 'firestore',
    baseUrl: config.baseUrl,
    model: config.model,
    keyTail: config.keyTail,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  decryptSecret,
  describeSecretKeySources,
  encryptSecret,
  getPublicConfig,
  readStoredConfig,
  writeStoredConfig,
};
