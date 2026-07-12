/**
 * Klien frontend untuk endpoint AI backend.
 * Semua permintaan AI harus melewati backend Express; tidak ada API key
 * di sisi klien. Mendukung streaming via Server-Sent Events.
 */

export function getApiBase() {
  const base = typeof window !== 'undefined' ? window.__SIM_BACKEND_URL__ : '';
  if (!base) return '';
  return String(base).replace(/\/+$/, '');
}

export class MaterialGenerationError extends Error {
  constructor(message, code = 'generation_failed') {
    super(message);
    this.name = 'MaterialGenerationError';
    this.code = code;
  }
}

function buildRequestBody({ input, temperature, maxTokens, partial, currentContent, revisionInstruction, revisionMode, profileId, model }) {
  const body = { input, stream: true };
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens)) body.maxTokens = maxTokens;
  if (typeof partial === 'string' && partial.trim()) body.partial = partial;
  if (typeof currentContent === 'string' && currentContent.trim()) body.currentContent = currentContent;
  if (typeof revisionInstruction === 'string' && revisionInstruction.trim()) body.revisionInstruction = revisionInstruction;
  if (typeof revisionMode === 'string' && revisionMode.trim()) body.revisionMode = revisionMode;
  if (typeof profileId === 'string' && profileId.trim()) body.profileId = profileId.trim();
  if (typeof model === 'string' && model.trim()) body.model = model.trim();
  return body;
}

/**
 * Mengalirkan hasil generate materi dari backend.
 * @param {object} params
 * @param {object} params.input
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @param {AbortSignal} [params.signal]
 * @param {(chunk: string) => void} params.onDelta
 * @param {(payload: {model: string}) => void} [params.onDone]
 * @param {(err: MaterialGenerationError) => void} [params.onError]
 * @returns {Promise<string>} teks lengkap yang dihasilkan
 */
export async function streamGenerateMaterial({
  input,
  temperature,
  maxTokens,
  profileId,
  model,
  partial,
  currentContent,
  revisionInstruction,
  revisionMode,
  signal,
  onDelta,
  onDone,
  onError,
}) {
  let response;
  try {
    response = await fetch(`${getApiBase()}/api/ai/generate-material`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody({ input, temperature, maxTokens, profileId, model, partial, currentContent, revisionInstruction, revisionMode })),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const aborted = new MaterialGenerationError('Permintaan dibatalkan.', 'aborted');
      onError?.(aborted);
      throw aborted;
    }
    const networkError = new MaterialGenerationError('Tidak dapat menghubungi server AI.', 'network_error');
    onError?.(networkError);
    throw networkError;
  }

  if (!response.ok) {
    let message = 'Gagal meminta materi ke server.';
    let code = 'http_error';
    try {
      const data = await response.json();
      message = data.error || message;
      code = data.code || code;
    } catch {
      /* abaikan */
    }
    const httpError = new MaterialGenerationError(message, code);
    onError?.(httpError);
    throw httpError;
  }

  const contentType = response.headers.get('content-type') || '';
  const full = { text: '' };

  if (contentType.includes('text/event-stream')) {
    await consumeSse(response, full, onDelta, onDone, onError);
  } else {
    try {
      const data = await response.json();
      const content = data.content || '';
      full.text = content;
      onDelta?.(content);
      onDone?.({ model: data.model || '', profileId: data.profileId || '', requestedModel: data.requestedModel || '', fallbackUsed: Boolean(data.fallbackUsed), modelFallbackUsed: Boolean(data.modelFallbackUsed) });
    } catch (err) {
      const parseError = new MaterialGenerationError('Respons server tidak dapat dibaca.', 'parse_error');
      onError?.(parseError);
      throw parseError;
    }
  }

  return full.text;
}

async function consumeSse(response, full, onDelta, onDone, onError) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let dataLines = [];

  const flushEvent = () => {
    const raw = dataLines.join('\n').trim();
    dataLines = [];
    if (!raw) {
      currentEvent = 'message';
      return;
    }
    try {
      const payload = JSON.parse(raw);
      if (currentEvent === 'delta' && typeof payload.content === 'string') {
        full.text += payload.content;
        onDelta?.(payload.content);
      } else if (currentEvent === 'done') {
        onDone?.({ model: payload.model || '', profileId: payload.profileId || '', requestedModel: payload.requestedModel || '', fallbackUsed: Boolean(payload.fallbackUsed), modelFallbackUsed: Boolean(payload.modelFallbackUsed) });
      } else if (currentEvent === 'error') {
        const error = new MaterialGenerationError(payload.error || 'Kesalahan saat generate.', payload.code || 'generation_failed');
        onError?.(error);
      }
    } catch {
      /* abaikan baris tidak valid */
    }
    currentEvent = 'message';
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith(':')) continue; // komentar SSE
      if (line === '') {
        flushEvent();
        continue;
      }
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
  }
  flushEvent();
}
