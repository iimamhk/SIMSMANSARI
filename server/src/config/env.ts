import dotenv from 'dotenv';

dotenv.config();

function getEnv(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : String(value).trim();
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
  apiKey: getEnv('IAMHC_API_KEY'),
  baseUrl: getEnv('IAMHC_BASE_URL', 'https://api.iamhc.cn/v1').replace(/\/$/, ''),
  model: getEnv('IAMHC_MODEL', 'gpt-4o-mini'),
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
    errors.push('IAMHC_API_KEY belum dikonfigurasi di file .env');
  }
  if (!env.baseUrl) {
    errors.push('IAMHC_BASE_URL belum dikonfigurasi di file .env');
  }
  return errors;
}
