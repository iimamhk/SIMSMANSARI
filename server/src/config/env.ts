import dotenv from 'dotenv';

dotenv.config();

function getEnv(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function getFirstEnv(keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = getEnv(key);
    if (value) return value;
  }
  return fallback;
}

function getNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Konfigurasi aplikasi yang dibaca dari .env.
 * CATATAN KEAMANAN: API key hanya dibaca di sini (server) dan tidak pernah
 * dikirim ke frontend atau disertakan dalam respons apa pun.
 */
export const env = {
  apiKey: getFirstEnv(['IAMHC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']),
  baseUrl: getFirstEnv(['IAMHC_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL'], 'https://api.iamhc.cn/v1').replace(/\/$/, ''),
  model: getFirstEnv(['IAMHC_MODEL', 'GROQ_MODEL', 'OPENAI_MODEL'], 'gpt-4o-mini'),
  allowedOrigins: getEnv('ALLOWED_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  rateLimitMax: getNumberEnv('RATE_LIMIT_MAX', 20),
  rateLimitWindowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', 900000),
  port: getNumberEnv('PORT', 3000),
  isProduction: getEnv('NODE_ENV', 'development') === 'production',
} as const;

export function validateServerConfig(): string[] {
  const errors: string[] = [];
  if (!env.apiKey || env.apiKey === 'sk-xxxxxxxxxxxxxxxx') {
    errors.push('API key AI belum dikonfigurasi di file .env (IAMHC_API_KEY / GROQ_API_KEY / OPENAI_API_KEY)');
  }
  if (!env.baseUrl) {
    errors.push('Base URL AI belum dikonfigurasi di file .env (IAMHC_BASE_URL / GROQ_BASE_URL / OPENAI_BASE_URL)');
  }
  return errors;
}
