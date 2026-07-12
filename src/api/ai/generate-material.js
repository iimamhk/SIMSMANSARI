const {
  AiServiceError,
  applyRateLimit,
  buildContinuationMessages,
  buildMessages,
  buildRevisionMessages,
  getConfig,
  handleOptions,
  parseGenerationOptions,
  parseJsonBody,
  resolveAiProfile,
  sanitizeMaterialInput,
  sendJson,
  sendSseComment,
  sendSseEvent,
  streamChatCompletions,
  writeSseHeaders,
} = require('../_lib/ai');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  let input;
  let options;
  let partialRaw = '';
  let revisionInstruction = '';
  let currentContent = '';
  let revisionMode = '';
  let profileId = '';
  let model = '';

  try {
    applyRateLimit(req, res);
    const body = parseJsonBody(req);
    input = sanitizeMaterialInput(body.input ?? body);
    options = parseGenerationOptions(body);
    partialRaw = typeof body.partial === 'string' ? body.partial.slice(0, 20000).trim() : '';
    revisionInstruction = typeof body.revisionInstruction === 'string' ? body.revisionInstruction.slice(0, 4000).trim() : '';
    currentContent = typeof body.currentContent === 'string' ? body.currentContent.slice(0, 50000).trim() : '';
    revisionMode = typeof body.revisionMode === 'string' ? body.revisionMode.slice(0, 100).trim() : '';
    profileId = typeof body.profileId === 'string' ? body.profileId.slice(0, 100).trim() : '';
    model = typeof body.model === 'string' ? body.model.slice(0, 200).trim() : '';
  } catch (error) {
    if (error instanceof AiServiceError) {
      sendJson(req, res, error.statusCode, { error: error.message, code: error.code });
      return;
    }
    sendJson(req, res, 400, { error: 'Payload tidak valid.', code: 'invalid_payload' });
    return;
  }

  if (!options.stream) {
    sendJson(req, res, 400, {
      error: 'Hanya mode streaming yang didukung pada endpoint ini.',
      code: 'stream_required',
    });
    return;
  }

  const messages = revisionInstruction && currentContent
    ? buildRevisionMessages(input, currentContent, revisionInstruction, revisionMode)
    : partialRaw
      ? buildContinuationMessages(input, partialRaw)
      : buildMessages(input);

  writeSseHeaders(req, res);
  sendSseComment(res, 'mulai');

  let hasStreamed = false;
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  try {
    const fallbackProfiles = getConfig().aiProfiles && getConfig().aiProfiles.length
      ? [resolveAiProfile(profileId), ...getConfig().aiProfiles.filter((profile) => profile.id !== resolveAiProfile(profileId).id)]
      : [resolveAiProfile(profileId)];
    let requestedModel = model || resolveAiProfile(profileId).model || getConfig().model;
    let activeModel = requestedModel;
    let activeProfileId = resolveAiProfile(profileId).id;
    let modelFallbackUsed = false;

    for (let index = 0; index < fallbackProfiles.length; index += 1) {
      const profile = fallbackProfiles[index];
      activeProfileId = profile.id;
      if (index > 0) {
        requestedModel = model || profile.model || getConfig().model;
        activeModel = requestedModel;
        sendSseComment(res, `fallback:${profile.id}`);
      }
      try {
        for await (const delta of streamChatCompletions(messages, {
          profileId: profile.id,
          model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          signal: abortController.signal,
          onModelSelected: (selectedModel) => {
            activeModel = selectedModel;
          },
          onModelFallback: (fromModel, toModel) => {
            modelFallbackUsed = true;
            activeModel = toModel;
            sendSseComment(res, `model-fallback:${fromModel}->${toModel}`);
          },
        })) {
          if (!delta) continue;
          hasStreamed = true;
          sendSseEvent(res, 'delta', { content: delta });
        }

        sendSseEvent(res, 'done', {
          model: activeModel,
          requestedModel,
          profileId: activeProfileId,
          fallbackUsed: index > 0,
          modelFallbackUsed,
        });
        res.end();
        return;
      } catch (error) {
        const canFallback = error instanceof AiServiceError && error.code === 'rate_limited' && !hasStreamed && index < fallbackProfiles.length - 1;
        if (canFallback) continue;
        throw error;
      }
    }
  } catch (error) {
    const errAny = error || {};
    let message;
    let code;

    if (error instanceof AiServiceError) {
      message = error.message;
      code = error.code;
    } else if (hasStreamed) {
      message = 'Koneksi ke layanan AI terputus di tengah jalan. Hasil sebagian sudah ada di editor — Anda dapat Simpan atau klik Generate untuk mencoba lagi.';
      code = 'stream_interrupted';
    } else {
      console.warn('[AI generate error]', errAny?.name, '|', errAny?.message, '| cause:', errAny?.cause?.code || errAny?.cause?.message);
      message = 'Gagal memulai generate materi. Periksa koneksi ke layanan AI.';
      code = 'generation_failed';
    }
    sendSseEvent(res, 'error', { error: message, code });
  } finally {
    res.end();
  }
};