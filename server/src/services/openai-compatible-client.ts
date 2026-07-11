import type { ChatMessage, GenerateMaterialResult } from '../types/index.js';
import { AiServiceError } from '../types/index.js';
import { env } from '../config/env.js';

interface StreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

interface OpenAiDelta {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TOKENS_CAP = 8000;

function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; clear: () => void } {
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

function clampTokens(value?: number): number {
  const fallback = 2000;
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_TOKENS_CAP);
}

/**
 * Mengalirkan (stream) token hasil dari API OpenAI-compatible.
 * Mengembalikan async generator yang menghasilkan potongan teks.
 * Jika upstream tidak mendukung streaming, hasil tetap dialirkan sebagai
 * satu potongan penuh agar antarmuka frontend seragam.
 */
export async function* streamChatCompletions(
  messages: ChatMessage[],
  options: StreamOptions = {},
): AsyncGenerator<string, void, unknown> {
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

  console.log(`[AI] Calling upstream: ${url} with model ${model}`);
  
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.apiKey}`,
        // Mencegah proxy menyimpan respons yang mungkin berisi data sensitif.
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
    // Hanya dicatat di server log; tidak dikirim ke klien.
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
            const parsed = JSON.parse(data) as OpenAiDelta;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // Abaikan baris SSE yang tidak terparse (mis. komentar / keep-alive).
          }
        }
      }
      return;
    }

    // Fallback: respons JSON non-streaming.
    const text = await reader.read().then((r) => (r.done ? '' : new TextDecoder().decode(r.value))).catch(() => '');
    let fullBody = text;
    try {
      // Baca sisa stream bila ada.
      let chunk = await reader.read();
      while (!chunk.done) {
        fullBody += new TextDecoder().decode(chunk.value);
        chunk = await reader.read();
      }
    } catch {
      /* abaikan */
    }

    try {
      const parsed = JSON.parse(fullBody) as OpenAiCompletion;
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
      /* abaikan */
    }
  }
}

/** Versi non-streaming yang mengembalikan hasil lengkap. */
export async function generateCompletion(
  messages: ChatMessage[],
  options: StreamOptions = {},
): Promise<GenerateMaterialResult> {
  let content = '';
  let usage: GenerateMaterialResult['usage'] = null;

  for await (const delta of streamChatCompletions(messages, { ...options, signal: options.signal })) {
    content += delta;
  }

  // Upaya membaca usage tidak dilakukan pada path ini untuk menyederhanakan;
  // cukup kembalikan hasil teks dan model yang dipakai.
  return {
    content,
    model: options.model || env.model,
    finishReason: content ? 'stop' : null,
    usage,
  };
}

export interface ConnectionTestResult {
  ok: boolean;
  model: string;
  error?: string;
  code?: string;
}

/**
 * Uji koneksi ke layanan AI dengan permintaan sangat kecil (1 token).
 * Digunakan oleh tombol "Tes Koneksi" di frontend. Tidak mengubah state.
 */
export async function testUpstreamConnection(): Promise<ConnectionTestResult> {
  if (!env.apiKey || env.apiKey === 'sk-xxxxxxxxxxxxxxxx') {
    return { ok: false, model: env.model, error: 'API key belum dikonfigurasi di server.', code: 'not_configured' };
  }

  try {
    let received = false;
    for await (const _delta of streamChatCompletions(
      [{ role: 'user', content: 'ping' }],
      { maxTokens: 4, temperature: 0 },
    )) {
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
