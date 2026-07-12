export interface MaterialGenerationInput {
  mapel: string;
  kelas: string;
  fase: string;
  semester: string;
  bab: string;
  topik: string;
  alokasiWaktu: string;
  kedalaman: string;
  jumlahContoh: string;
  jumlahLatihan: string;
  lainLain: string;
  promptDraft: string;
  tampilan: string[];
}

export interface GenerateMaterialRequest {
  input: Partial<MaterialGenerationInput>;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  profileId?: string;
  model?: string;
  partial?: string;
  currentContent?: string;
  revisionInstruction?: string;
  revisionMode?: string;
}

export interface RpmGenerationInput {
  namaSekolah: string;
  jenjang: string;
  kelas: string;
  semester: string;
  fase: string;
  mapel: string;
  topik: string;
  capaian: string;
  tahunPelajaran: string;
  totalWaktu: string;
  alokasiWaktu: string;
  modelPembelajaran: string;
  metode: string[];
  media: string[];
  sumberBelajar: string;
  dimensi: string[];
  kabupaten: string;
  tanggalPengesahan: string;
  namaGuru: string;
  nipGuru: string;
  namaKepala: string;
  nipKepala: string;
  karakteristik: string;
  instruksiTambahan: string;
}

export interface GenerateRpmRequest {
  input: Partial<RpmGenerationInput>;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  profileId?: string;
  model?: string;
  sectionTitle?: string;
  context?: string;
  currentSection?: string;
  partial?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateMaterialResult {
  content: string;
  model: string;
  finishReason: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
}

export class AiServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'ai_error') {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
