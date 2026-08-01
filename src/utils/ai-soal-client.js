/**
 * Klien frontend untuk endpoint AI Generate Soal (/api/ai/generate-soal).
 * Streaming SSE: delta (progres mentah), soal (payload JSON tervalidasi),
 * done, error.
 */

import { getApiBase, MaterialGenerationError } from './ai-client.js';

export { MaterialGenerationError as SoalGenerationError };

/**
 * @param {object} params
 * @param {object} params.input - field form (mapel, kelas, materi, jumlah, tipe, kesulitan, pembahasan, instruksi, ...)
 * @param {AbortSignal} [params.signal]
 * @param {(delta:string)=>void} [params.onDelta]
 * @param {(payload:object, meta:object)=>void} [params.onSoal]
 * @param {(meta:object)=>void} [params.onDone]
 * @param {(err:MaterialGenerationError)=>void} [params.onError]
 */
export async function streamGenerateSoal({ input, signal, onDelta, onSoal, onDone, onError }) {
  let response;
  try {
    response = await fetch(`${getApiBase()}/api/ai/generate-soal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, stream: true }),
      signal,
    });
  } catch (err) {
    const isAbort = err && err.name === 'AbortError';
    const error = new MaterialGenerationError(
      isAbort ? 'Permintaan dibatalkan.' : 'Tidak dapat menghubungi server AI.',
      isAbort ? 'aborted' : 'network_error'
    );
    onError?.(error);
    throw error;
  }

  if (!response.ok) {
    let message = 'Gagal meminta soal ke server.';
    let code = 'http_error';
    try {
      const data = await response.json();
      message = data.error || message;
      code = data.code || code;
    } catch { /* abaikan */ }
    const error = new MaterialGenerationError(message, code);
    onError?.(error);
    throw error;
  }

  await consumeSse(response, { onDelta, onSoal, onDone, onError });
}

async function consumeSse(response, { onDelta, onSoal, onDone, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let dataLines = [];
  let receivedSoal = false;
  let receivedError = null;

  const flush = () => {
    const raw = dataLines.join('\n').trim();
    dataLines = [];
    if (!raw) { currentEvent = 'message'; return; }
    try {
      const payload = JSON.parse(raw);
      if (currentEvent === 'delta' && typeof payload.content === 'string') {
        onDelta?.(payload.content);
      } else if (currentEvent === 'soal') {
        receivedSoal = Boolean(payload.payload);
        onSoal?.(payload.payload, payload);
      } else if (currentEvent === 'done') {
        onDone?.(payload);
      } else if (currentEvent === 'error') {
        receivedError = new MaterialGenerationError(payload.error || 'Kesalahan generate.', payload.code || 'generation_failed');
        onError?.(receivedError);
      }
    } catch { /* abaikan baris tidak valid */ }
    currentEvent = 'message';
  };

  const consumeLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith(':')) return;
    if (line === '') { flush(); return; }
    if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(consumeLine);
  }
  if (buffer) consumeLine(buffer);
  flush();

  if (receivedError) throw receivedError;
  if (!receivedSoal) {
    const error = new MaterialGenerationError('AI belum mengirim soal yang lengkap. Coba generate ulang.', 'empty_soal');
    onError?.(error);
    throw error;
  }
}
