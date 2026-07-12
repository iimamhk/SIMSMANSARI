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

export interface AiProfileConfig {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  models: string[];
  isDefault?: boolean;
}

function sanitizeProfileId(value: string, fallback: string): string {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  return cleaned || fallback;
}

function parseModelList(value: unknown, fallbackModel: string): string[] {
  const fromArray = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const merged = [...fromArray, String(fallbackModel || '').trim()].filter(Boolean);
  return Array.from(new Set(merged));
}

function parseAiProfiles(): AiProfileConfig[] {
  const defaultProfile: AiProfileConfig = {
    id: 'default',
    label: getEnv('AI_DEFAULT_LABEL', 'Default AI'),
    apiKey: getFirstEnv(['IAMHC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']),
    baseUrl: getFirstEnv(['IAMHC_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL'], 'https://api.iamhc.cn/v1').replace(/\/$/, ''),
    model: getFirstEnv(['IAMHC_MODEL', 'GROQ_MODEL', 'OPENAI_MODEL'], 'gpt-4o-mini'),
    models: parseModelList([], getFirstEnv(['IAMHC_MODEL', 'GROQ_MODEL', 'OPENAI_MODEL'], 'gpt-4o-mini')),
    isDefault: true,
  };

  const raw = getEnv('AI_MODEL_PROFILES');
  if (!raw) return [defaultProfile];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [defaultProfile];

    const customProfiles = parsed
      .map<AiProfileConfig | null>((entry, index) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : '';
        const apiKeyEnv = typeof record.apiKeyEnv === 'string' ? getEnv(record.apiKeyEnv) : '';
        const resolvedApiKey = apiKey || apiKeyEnv;
        const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim().replace(/\/$/, '') : '';
        const model = typeof record.model === 'string' ? record.model.trim() : '';
        if (!resolvedApiKey || !baseUrl || !model) return null;
        const models = parseModelList(record.models, model);
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
          models,
          isDefault: record.isDefault === true,
        };
      })
      .filter((profile): profile is AiProfileConfig => profile !== null);

    if (!customProfiles.length) return [defaultProfile];

    const hasDefault = customProfiles.some((profile) => profile.isDefault);
    if (!hasDefault) {
      customProfiles[0] = { ...customProfiles[0], isDefault: true };
    }
    return customProfiles;
  } catch {
    return [defaultProfile];
  }
}

/**
 * Konfigurasi aplikasi yang dibaca dari .env.
 * CATATAN KEAMANAN: API key hanya dibaca di sini (server) dan tidak pernah
 * dikirim ke frontend atau disertakan dalam respons apa pun.
 */
const aiProfiles = parseAiProfiles();
const defaultAiProfile = aiProfiles.find((profile) => profile.isDefault) || aiProfiles[0];

export const env = {
  apiKey: defaultAiProfile?.apiKey || '',
  baseUrl: defaultAiProfile?.baseUrl || 'https://api.iamhc.cn/v1',
  model: defaultAiProfile?.model || 'gpt-4o-mini',
  aiProfiles,
  defaultAiProfileId: defaultAiProfile?.id || 'default',
  allowedOrigins: getEnv('ALLOWED_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  rateLimitMax: getNumberEnv('RATE_LIMIT_MAX', 20),
  rateLimitWindowMs: getNumberEnv('RATE_LIMIT_WINDOW_MS', 900000),
  port: getNumberEnv('PORT', 3000),
  isProduction: getEnv('NODE_ENV', 'development') === 'production',
} as const;

export function resolveAiProfile(profileId?: string): AiProfileConfig {
  const normalized = typeof profileId === 'string' ? profileId.trim() : '';
  return env.aiProfiles.find((profile) => profile.id === normalized) || env.aiProfiles[0];
}

export function getAiProfileModelCandidates(profileId?: string, preferredModel?: string): string[] {
  const profile = resolveAiProfile(profileId);
  const preferred = typeof preferredModel === 'string' ? preferredModel.trim() : '';
  const candidates = [
    preferred,
    profile.model,
    ...(Array.isArray(profile.models) ? profile.models : []),
  ]
    .map((model) => String(model || '').trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

export function getAiFallbackProfiles(profileId?: string): AiProfileConfig[] {
  const primary = resolveAiProfile(profileId);
  return [
    primary,
    ...env.aiProfiles.filter((profile) => profile.id !== primary.id),
  ];
}

export function getPublicAiProfiles() {
  return env.aiProfiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    model: profile.model,
    models: profile.models,
    baseUrl: profile.baseUrl,
    isDefault: Boolean(profile.isDefault),
  }));
}

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
