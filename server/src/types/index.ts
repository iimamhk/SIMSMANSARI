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
  partial?: string;
  currentContent?: string;
  revisionInstruction?: string;
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
