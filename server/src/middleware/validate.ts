import type { MaterialGenerationInput } from '../types/index.js';
import { AiServiceError } from '../types/index.js';

const MAX_FIELD_LENGTH = 2000;
const MAX_TEXTAREA_LENGTH = 4000;
const MAX_PROMPT_LENGTH = 12000;
const ALLOWED_TAMPILAN = [
  'modern',
  'premium',
  'interaktif',
  'bersih',
  'multitab',
  'ilustratif',
  'ringkas',
];

const FIELD_LIMITS: Record<keyof MaterialGenerationInput, number> = {
  mapel: MAX_FIELD_LENGTH,
  kelas: MAX_FIELD_LENGTH,
  fase: MAX_FIELD_LENGTH,
  semester: MAX_FIELD_LENGTH,
  bab: MAX_FIELD_LENGTH,
  topik: MAX_FIELD_LENGTH,
  alokasiWaktu: MAX_FIELD_LENGTH,
  kedalaman: 64,
  jumlahContoh: 16,
  jumlahLatihan: 16,
  lainLain: MAX_TEXTAREA_LENGTH,
  promptDraft: MAX_PROMPT_LENGTH,
  tampilan: 0,
};

function asString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

/**
 * Memvalidasi dan membersihkan payload dari frontend.
 * Hanya meneruskan field yang diizinkan ke layanan AI.
 */
export function sanitizeMaterialInput(raw: unknown): MaterialGenerationInput {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }

  const data = raw as Record<string, unknown>;
  const input: MaterialGenerationInput = {
    mapel: asString(data.mapel, FIELD_LIMITS.mapel),
    kelas: asString(data.kelas, FIELD_LIMITS.kelas),
    fase: asString(data.fase, FIELD_LIMITS.fase),
    semester: asString(data.semester, FIELD_LIMITS.semester),
    bab: asString(data.bab, FIELD_LIMITS.bab),
    topik: asString(data.topik, FIELD_LIMITS.topik),
    alokasiWaktu: asString(data.alokasiWaktu, FIELD_LIMITS.alokasiWaktu),
    kedalaman: asString(data.kedalaman, FIELD_LIMITS.kedalaman),
    jumlahContoh: asString(data.jumlahContoh, FIELD_LIMITS.jumlahContoh),
    jumlahLatihan: asString(data.jumlahLatihan, FIELD_LIMITS.jumlahLatihan),
    lainLain: asString(data.lainLain, FIELD_LIMITS.lainLain),
    promptDraft: asString(data.promptDraft, FIELD_LIMITS.promptDraft),
    tampilan: [],
  };

  if (Array.isArray(data.tampilan)) {
    input.tampilan = data.tampilan
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.toLowerCase())
      .filter((item) => ALLOWED_TAMPILAN.includes(item))
      .slice(0, ALLOWED_TAMPILAN.length);
  }

  if (!input.mapel && !input.topik) {
    throw new AiServiceError('Minimal isi Mata Pelajaran atau Topik.', 400, 'missing_required');
  }

  return input;
}

export function parseGenerationOptions(raw: unknown) {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const stream = data.stream === true || data.stream === 'true';

  const temperature =
    typeof data.temperature === 'number' && Number.isFinite(data.temperature)
      ? Math.min(Math.max(data.temperature, 0), 1.5)
      : undefined;

  let maxTokens: number | undefined;
  if (typeof data.maxTokens === 'number' && Number.isFinite(data.maxTokens)) {
    maxTokens = Math.min(Math.max(Math.floor(data.maxTokens), 256), 8000);
  }

  return { stream, temperature, maxTokens };
}
