/**
 * Klien frontend untuk endpoint generate materi JSON (/api/ai/generate-material-json).
 * Streaming SSE: delta (progres mentah), material (JSON tervalidasi), done, error.
 */

import { getApiBase, MaterialGenerationError } from './ai-client.js';

export { MaterialGenerationError };

/**
 * @param {object} params
 * @param {object} params.input - field form (mapel, kelas, bab, topik, fitur, dll)
 * @param {string} [params.revisionInstruction]
 * @param {string} [params.currentJson]
 * @param {AbortSignal} [params.signal]
 * @param {(delta:string)=>void} [params.onDelta]
 * @param {(material:object, meta:object)=>void} [params.onMaterial]
 * @param {(err:MaterialGenerationError)=>void} [params.onError]
 */
export async function streamGenerateMaterialJson({
  input,
  revisionInstruction,
  currentJson,
  signal,
  onDelta,
  onMaterial,
  onError,
}) {
  const body = { input, stream: true };
  if (revisionInstruction && revisionInstruction.trim()) body.revisionInstruction = revisionInstruction.trim();
  if (currentJson && currentJson.trim()) body.currentJson = currentJson.trim();

  let response;
  try {
    response = await fetch(`${getApiBase()}/api/ai/generate-material-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    let message = 'Gagal meminta materi ke server.';
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

  await consumeSse(response, { onDelta, onMaterial, onError });
}

async function consumeSse(response, { onDelta, onMaterial, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let dataLines = [];

  const flush = () => {
    const raw = dataLines.join('\n').trim();
    dataLines = [];
    if (!raw) { currentEvent = 'message'; return; }
    try {
      const payload = JSON.parse(raw);
      if (currentEvent === 'delta' && typeof payload.content === 'string') {
        onDelta?.(payload.content);
      } else if (currentEvent === 'material') {
        onMaterial?.(payload.material, payload);
      } else if (currentEvent === 'error') {
        onError?.(new MaterialGenerationError(payload.error || 'Kesalahan generate.', payload.code || 'generation_failed'));
      }
    } catch { /* abaikan baris tidak valid */ }
    currentEvent = 'message';
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line === '') { flush(); continue; }
      if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
  }
  flush();
}
