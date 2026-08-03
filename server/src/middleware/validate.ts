import type { MaterialGenerationInput, RpmGenerationInput, PptGenerationInput } from '../types/index.js';
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

const RPM_TEXT = 2000;
const RPM_LONG = 4000;
const RPM_ARR_ITEM = 200;
const RPM_ARR_MAX = 24;

function asRpmString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}

function asRpmStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, max).trim())
    .filter(Boolean)
    .slice(0, RPM_ARR_MAX);
}

/**
 * Memvalidasi dan membersihkan payload RPM dari frontend.
 */
export function sanitizeRpmInput(raw: unknown): RpmGenerationInput {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }
  const data = raw as Record<string, unknown>;

  const input: RpmGenerationInput = {
    namaSekolah: asRpmString(data.namaSekolah, RPM_TEXT),
    jenjang: asRpmString(data.jenjang, 16),
    kelas: asRpmString(data.kelas, 16),
    semester: asRpmString(data.semester, 16),
    fase: asRpmString(data.fase, 8),
    mapel: asRpmString(data.mapel, RPM_TEXT),
    topik: asRpmString(data.topik, RPM_TEXT),
    capaian: asRpmString(data.capaian, RPM_LONG),
    tahunPelajaran: asRpmString(data.tahunPelajaran, 32),
    totalWaktu: asRpmString(data.totalWaktu, 16),
    alokasiWaktu: asRpmString(data.alokasiWaktu, 32),
    modelPembelajaran: asRpmString(data.modelPembelajaran, RPM_TEXT),
    metode: asRpmStringArray(data.metode, RPM_ARR_ITEM),
    media: asRpmStringArray(data.media, RPM_ARR_ITEM),
    sumberBelajar: asRpmString(data.sumberBelajar, RPM_LONG),
    dimensi: asRpmStringArray(data.dimensi, 200),
    kabupaten: asRpmString(data.kabupaten, RPM_TEXT),
    tanggalPengesahan: asRpmString(data.tanggalPengesahan, 32),
    namaGuru: asRpmString(data.namaGuru, RPM_TEXT),
    nipGuru: asRpmString(data.nipGuru, 64),
    namaKepala: asRpmString(data.namaKepala, RPM_TEXT),
    nipKepala: asRpmString(data.nipKepala, 64),
    karakteristik: asRpmString(data.karakteristik, RPM_LONG),
    instruksiTambahan: asRpmString(data.instruksiTambahan, RPM_LONG),
  };

  if (!input.mapel && !input.topik) {
    throw new AiServiceError('Minimal isi Mata Pelajaran atau Topik.', 400, 'missing_required');
  }

  return input;
}

/**
 * Memvalidasi dan membersihkan payload PPT (materi presentasi) dari frontend.
 */
export function sanitizePptInput(raw: unknown): PptGenerationInput {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }
  const data = raw as Record<string, unknown>;

  const input: PptGenerationInput = {
    namaSekolah: asRpmString(data.namaSekolah, RPM_TEXT),
    mapel: asRpmString(data.mapel, RPM_TEXT),
    kelas: asRpmString(data.kelas, 16),
    fase: asRpmString(data.fase, 8),
    semester: asRpmString(data.semester, 16),
    topik: asRpmString(data.topik, RPM_TEXT),
    tujuan: asRpmString(data.tujuan, RPM_LONG),
    jumlahSlide: asRpmString(data.jumlahSlide, 8),
    poinPerSlide: asRpmString(data.poinPerSlide, 16),
    gaya: asRpmString(data.gaya, 32),
    audiens: asRpmString(data.audiens, 120),
    bahasa: asRpmString(data.bahasa, 32),
    sumber: asRpmString(data.sumber, RPM_LONG),
    namaGuru: asRpmString(data.namaGuru, RPM_TEXT),
    instruksiTambahan: asRpmString(data.instruksiTambahan, RPM_LONG),
  };

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
