/**
 * Endpoint AI Generate Soal.
 *
 * Menerima parameter form guru, meminta AI menghasilkan soal dalam JSON
 * "kuiz_bulk_v1", memvalidasi ringan di server, lalu mengirim hasil final pada
 * event SSE "soal". Delta token tetap dialirkan agar frontend bisa menampilkan
 * progres. Normalisasi penuh (id, LaTeX, clamp poin) dilakukan di frontend via
 * parseJsonBulkSoal sehingga hasil identik dengan importer manual.
 */

const {
  AiServiceError,
  applyRateLimit,
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
  sanitizeSoalInput,
  buildMessages,
  buildRepairMessages,
  validateSoalOutput,
} = require('../_lib/ai-soal');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  let input;
  let options;
  try {
    applyRateLimit(req, res);
    const body = parseJsonBody(req);
    input = sanitizeSoalInput(body.input ?? body);
    options = parseGenerationOptions(body);
  } catch (error) {
    const statusCode = error?.statusCode || (error instanceof AiServiceError ? error.statusCode : 400);
    sendJson(req, res, statusCode, {
      error: error?.message || 'Payload tidak valid.',
      code: error?.code || 'invalid_payload',
    });
    return;
  }

  if (!options.stream) {
    sendJson(req, res, 400, { error: 'Hanya mode streaming yang didukung pada endpoint ini.', code: 'stream_required' });
    return;
  }

  writeSseHeaders(req, res);
  sendSseComment(res, 'mulai');

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  // Estimasi token: makin banyak soal makin besar. ~600 token/soal + margin.
  const estimated = Math.min(1500 + input.jumlah * 700, 12000);
  const maxTokens = options.maxTokens ?? estimated;

  try {
    const profile = await resolveEffectiveProfile('');
    let activeModel = profile.model;

    const collect = async (messages) => {
      let output = '';
      for await (const delta of streamChatCompletions(messages, {
        profileId: profile.id,
        resolvedProfile: profile,
        model: profile.model,
        temperature: options.temperature ?? 0.6,
        maxTokens,
        includeReasoning: false,
        signal: abortController.signal,
        onModelSelected: (m) => { activeModel = m; },
      })) {
        if (!delta) continue;
        output += delta;
        sendSseEvent(res, 'delta', { content: delta });
      }
      return output;
    };

    let fullText = await collect(buildMessages(input));
    let validation = validateSoalOutput(fullText);

    // Satu kali perbaikan bila JSON belum valid.
    if (validation.error && fullText.length > 40) {
      sendSseComment(res, 'memperbaiki struktur JSON');
      try {
        const repaired = await collect(buildRepairMessages(input, fullText));
        const repairedValidation = validateSoalOutput(repaired);
        if (!repairedValidation.error) validation = repairedValidation;
      } catch (repairError) {
        console.warn('[AI generate-soal repair failed]', repairError?.message || repairError);
      }
    }

    if (validation.error || !validation.payload) {
      sendSseEvent(res, 'error', {
        error: `AI belum menghasilkan soal yang valid (${validation.error || 'format tidak dikenali'}). Coba lagi atau ubah instruksi.`,
        code: 'invalid_structure',
      });
      res.end();
      return;
    }

    sendSseEvent(res, 'soal', {
      payload: validation.payload,
      count: validation.count,
      model: activeModel,
      profileId: profile.id,
    });
    sendSseEvent(res, 'done', { model: activeModel, profileId: profile.id });
    res.end();
  } catch (error) {
    if (error && /abort/i.test(String(error.message || ''))) {
      if (!res.writableEnded) res.end();
      return;
    }
    let message = 'Gagal menghasilkan soal. Periksa koneksi ke layanan AI.';
    let code = 'generation_failed';
    if (error instanceof AiServiceError) {
      message = error.message;
      code = error.code;
    } else {
      console.warn('[AI generate-soal error]', error?.name, '|', error?.message);
    }
    sendSseEvent(res, 'error', { error: message, code });
    res.end();
  }
};
