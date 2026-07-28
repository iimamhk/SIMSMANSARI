/**
 * Endpoint generate materi dalam format JSON terstruktur.
 *
 * Perbedaan dengan generate-material (markdown): output divalidasi sebagai
 * JSON terstruktur + rumus LaTeX dicek di server sebelum dianggap selesai.
 * Streaming per-token tetap dikirim agar frontend bisa menampilkan progres,
 * sedangkan payload final tervalidasi dikirim pada event "material".
 */

const {
  AiServiceError,
  applyRateLimit,
  getConfig,
  handleOptions,
  parseGenerationOptions,
  parseJsonBody,
  resolveEffectiveProfile,
  sendJson,
  sendSseComment,
  sendSseEvent,
  streamChatCompletions,
  writeSseHeaders,
} = require('../_lib/ai');
const {
  buildRevisionPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  validateMaterial,
} = require('../_lib/ai-material');

function asString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }
  const data = raw;
  const fitur = Array.isArray(data.fitur)
    ? data.fitur.filter((item) => typeof item === 'string').slice(0, 12)
    : [];
  const input = {
    mapel: asString(data.mapel, 200),
    kelas: asString(data.kelas, 50),
    rombel: asString(data.rombel, 50),
    fase: asString(data.fase, 50),
    semester: asString(data.semester, 50),
    bab: asString(data.bab, 200),
    topik: asString(data.topik, 200),
    alokasiWaktu: asString(data.alokasiWaktu, 50),
    kedalaman: asString(data.kedalaman, 50),
    gaya: asString(data.gaya, 50),
    jumlahContoh: asString(data.jumlahContoh, 16),
    lainLain: asString(data.lainLain, 2000),
    fitur,
  };
  if (!input.mapel && !input.topik) {
    throw new AiServiceError('Minimal isi Mata Pelajaran atau Topik.', 400, 'missing_required');
  }
  return input;
}

function buildMessages(input, currentJson, revisionInstruction) {
  if (revisionInstruction && currentJson) {
    return [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildRevisionPrompt(input, currentJson, revisionInstruction) },
    ];
  }
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(input) },
  ];
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  let input;
  let options;
  let revisionInstruction = '';
  let currentJson = '';

  try {
    applyRateLimit(req, res);
    const body = parseJsonBody(req);
    input = sanitizeInput(body.input ?? body);
    options = parseGenerationOptions(body);
    revisionInstruction = asString(body.revisionInstruction, 2000);
    currentJson = typeof body.currentJson === 'string' ? body.currentJson.slice(0, 80000).trim() : '';
  } catch (error) {
    if (error instanceof AiServiceError) {
      sendJson(req, res, error.statusCode, { error: error.message, code: error.code });
      return;
    }
    sendJson(req, res, 400, { error: 'Payload tidak valid.', code: 'invalid_payload' });
    return;
  }

  if (!options.stream) {
    sendJson(req, res, 400, { error: 'Hanya mode streaming yang didukung.', code: 'stream_required' });
    return;
  }

  const messages = buildMessages(input, currentJson, revisionInstruction);

  writeSseHeaders(req, res);
  sendSseComment(res, 'mulai');

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  try {
    const profile = await resolveEffectiveProfile('');
    let fullText = '';
    let activeModel = profile.model;
    let streamInterrupted = false;

    try {
      for await (const delta of streamChatCompletions(messages, {
        profileId: profile.id,
        resolvedProfile: profile,
        model: profile.model,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 8000,
        signal: abortController.signal,
        onModelSelected: (selectedModel) => {
          activeModel = selectedModel;
        },
      })) {
        if (!delta) continue;
        fullText += delta;
        sendSseEvent(res, 'delta', { content: delta });
      }
    } catch (streamError) {
      // Stream terputus di tengah — coba selamatkan konten parsial.
      if (fullText.length > 200) {
        streamInterrupted = true;
        console.warn('[AI stream interrupted, attempting partial recovery]', streamError?.message);
      } else {
        throw streamError;
      }
    }

    // Validasi hasil (lengkap atau parsial).
    const validation = validateMaterial(fullText);
    if (!validation.material) {
      const hint = streamInterrupted
        ? 'Koneksi terputus saat AI sedang menulis. Materi belum lengkap — coba generate ulang, atau gunakan model yang lebih cepat.'
        : 'AI tidak menghasilkan struktur materi yang valid. Coba generate ulang.';
      sendSseEvent(res, 'error', {
        error: hint,
        code: streamInterrupted ? 'stream_interrupted' : 'invalid_structure',
      });
      res.end();
      return;
    }

    sendSseEvent(res, 'material', {
      material: validation.material,
      issues: validation.issues,
      model: activeModel,
      profileId: profile.id,
      partial: streamInterrupted,
    });
    sendSseEvent(res, 'done', { model: activeModel, profileId: profile.id });
    res.end();
  } catch (error) {
    let message = 'Gagal menghasilkan materi. Periksa koneksi ke layanan AI.';
    let code = 'generation_failed';
    if (error instanceof AiServiceError) {
      message = error.message;
      code = error.code;
    } else {
      console.warn('[AI generate-json error]', error?.name, '|', error?.message);
    }
    sendSseEvent(res, 'error', { error: message, code });
    res.end();
  }
};
