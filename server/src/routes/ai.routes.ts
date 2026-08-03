import { Router, type Request, type Response } from 'express';
import { env, getAiFallbackProfiles, getPublicAiProfiles, resolveAiProfile } from '../config/env.js';
import { AiServiceError } from '../types/index.js';
import { buildMessages, buildContinuationMessages, buildRevisionMessages, buildRpmMessages, buildRpmContinuationMessages, buildRpmSectionMessages, buildPptMessages, buildPptContinuationMessages } from '../services/prompt.js';
import { streamChatCompletions, testUpstreamConnection } from '../services/openai-compatible-client.js';
import { sanitizeMaterialInput, sanitizeRpmInput, sanitizePptInput, parseGenerationOptions } from '../middleware/validate.js';

export const aiRouter = Router();

function sendSseComment(res: Response, comment: string) {
  res.write(`: ${comment}\n\n`);
}

function sendSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Mengalirkan hasil chat AI ke klien sebagai Server-Sent Events.
 * Menangani abort, pemutusan di tengah jalan, dan error layanan AI.
 */
async function streamChatToSse(messages: Parameters<typeof streamChatCompletions>[0], res: Response, opts: { temperature?: number; maxTokens?: number; profileId?: string; model?: string } = {}) {
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  const fallbackProfiles = getAiFallbackProfiles(opts.profileId);
  let hasStreamed = false;
  let lastError: unknown = null;
  let activeProfile = resolveAiProfile(opts.profileId);
  let activeModel = opts.model || activeProfile.model || env.model;
  let requestedModel = opts.model || activeProfile.model || env.model;
  let modelFallbackUsed = false;

  for (let index = 0; index < fallbackProfiles.length; index += 1) {
    const profile = fallbackProfiles[index];
    activeProfile = profile;
    if (index > 0) {
      requestedModel = opts.model || profile.model || env.model;
      activeModel = requestedModel;
    }
    try {
      if (index > 0) {
        sendSseComment(res, `fallback:${profile.id}`);
      }
      for await (const delta of streamChatCompletions(messages, {
        profileId: profile.id,
        model: opts.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: abortController.signal,
        onModelSelected: (model) => {
          activeModel = model;
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
        profileId: profile.id,
        fallbackUsed: index > 0,
        modelFallbackUsed,
      });
      res.end();
      return;
    } catch (error) {
      lastError = error;
      const isRateLimited = error instanceof AiServiceError && error.code === 'rate_limited';
      const canFallback = isRateLimited && !hasStreamed && index < fallbackProfiles.length - 1;
      if (canFallback) {
        console.warn(`[AI fallback] Profil ${profile.id} terkena limit kuota, mencoba profil berikutnya.`);
        continue;
      }
      break;
    }
  }

  const error = lastError;
  const errAny = error as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (!(error instanceof AiServiceError)) {
    console.warn('[AI generate error]', errAny?.name, '|', errAny?.message, '| cause:', errAny?.cause?.code || errAny?.cause?.message);
  }
  let message: string;
  let code: string;
  if (error instanceof AiServiceError) {
    if (error.code === 'rate_limited' && !hasStreamed && fallbackProfiles.length > 1) {
      message = 'Semua profil AI yang tersedia sedang terkena limit kuota. Coba profil lain, tunggu beberapa saat, atau ganti provider.';
      code = 'all_profiles_rate_limited';
    } else {
      message = error.message;
      code = error.code;
    }
  } else if (hasStreamed) {
    message = 'Koneksi ke layanan AI terputus di tengah jalan. Hasil sebagian sudah ada di editor — Anda dapat Simpan atau klik Generate untuk mencoba lagi.';
    code = 'stream_interrupted';
  } else {
    message = 'Gagal memulai generate. Periksa koneksi ke layanan AI.';
    code = 'generation_failed';
  }
  sendSseEvent(res, 'error', {
    error: message,
    code,
    profileId: activeProfile.id,
  });
  res.end();
}

aiRouter.post('/generate-material', async (req: Request, res: Response) => {
  let input;
  try {
    input = sanitizeMaterialInput(req.body?.input ?? req.body);
  } catch (error) {
    if (error instanceof AiServiceError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    res.status(400).json({ error: 'Payload tidak valid.', code: 'invalid_payload' });
    return;
  }

  const { stream, temperature, maxTokens } = parseGenerationOptions(req.body);
  const profileId = typeof req.body?.profileId === 'string' ? req.body.profileId.slice(0, 100).trim() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.slice(0, 200).trim() : '';

  const partialRaw = typeof req.body?.partial === 'string' ? req.body.partial.slice(0, 20000).trim() : '';
  const revisionInstruction = typeof req.body?.revisionInstruction === 'string'
    ? req.body.revisionInstruction.slice(0, 4000).trim()
    : '';
  const currentContent = typeof req.body?.currentContent === 'string'
    ? req.body.currentContent.slice(0, 50000).trim()
    : '';
  const revisionMode = typeof req.body?.revisionMode === 'string' ? req.body.revisionMode.slice(0, 100).trim() : '';
  const messages = revisionInstruction && currentContent
    ? buildRevisionMessages(input, currentContent, revisionInstruction, revisionMode)
    : partialRaw
      ? buildContinuationMessages(input, partialRaw)
      : buildMessages(input);

  if (!stream) {
    res.status(400).json({
      error: 'Hanya mode streaming yang didukung pada endpoint ini.',
      code: 'stream_required',
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  sendSseComment(res, 'mulai');
  await streamChatToSse(messages, res, { temperature, maxTokens, profileId, model });
});

aiRouter.post('/generate-rpm', async (req: Request, res: Response) => {
  let input;
  try {
    input = sanitizeRpmInput(req.body?.input ?? req.body);
  } catch (error) {
    if (error instanceof AiServiceError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    res.status(400).json({ error: 'Payload tidak valid.', code: 'invalid_payload' });
    return;
  }

  const { stream, temperature, maxTokens: reqMaxTokens } = parseGenerationOptions(req.body);
  const profileId = typeof req.body?.profileId === 'string' ? req.body.profileId.slice(0, 100).trim() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.slice(0, 200).trim() : '';

  const sectionTitle = typeof req.body?.sectionTitle === 'string' ? req.body.sectionTitle.slice(0, 200).trim() : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.slice(0, 20000).trim() : '';
  const currentSection = typeof req.body?.currentSection === 'string' ? req.body.currentSection.slice(0, 8000).trim() : '';
  const partial = typeof req.body?.partial === 'string' ? req.body.partial.slice(0, 20000).trim() : '';

  // Regenerasi satu section tidak perlu token sebanyak generate penuh.
  const maxTokens = sectionTitle ? Math.min(reqMaxTokens || 3000, 3000) : Math.min(reqMaxTokens || 8000, 8000);

  const messages = sectionTitle
    ? buildRpmSectionMessages(input, sectionTitle, context, currentSection)
    : partial
      ? buildRpmContinuationMessages(input, partial)
      : buildRpmMessages(input);

  if (!stream) {
    res.status(400).json({
      error: 'Hanya mode streaming yang didukung pada endpoint ini.',
      code: 'stream_required',
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  sendSseComment(res, 'mulai');
  await streamChatToSse(messages, res, { temperature, maxTokens, profileId, model });
});

aiRouter.post('/generate-ppt', async (req: Request, res: Response) => {
  let input;
  try {
    input = sanitizePptInput(req.body?.input ?? req.body);
  } catch (error) {
    if (error instanceof AiServiceError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    res.status(400).json({ error: 'Payload tidak valid.', code: 'invalid_payload' });
    return;
  }

  const { stream, temperature, maxTokens: reqMaxTokens } = parseGenerationOptions(req.body);
  const profileId = typeof req.body?.profileId === 'string' ? req.body.profileId.slice(0, 100).trim() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.slice(0, 200).trim() : '';
  const partial = typeof req.body?.partial === 'string' ? req.body.partial.slice(0, 20000).trim() : '';
  const maxTokens = Math.min(reqMaxTokens || 6000, 8000);

  const messages = partial
    ? buildPptContinuationMessages(input, partial)
    : buildPptMessages(input);

  if (!stream) {
    res.status(400).json({
      error: 'Hanya mode streaming yang didukung pada endpoint ini.',
      code: 'stream_required',
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  sendSseComment(res, 'mulai');
  await streamChatToSse(messages, res, { temperature, maxTokens, profileId, model });
});

aiRouter.get('/model-options', (_req: Request, res: Response) => {
  res.status(200).json({
    profiles: getPublicAiProfiles(),
    defaultProfileId: env.defaultAiProfileId,
  });
});

aiRouter.get('/test-connection', async (req: Request, res: Response) => {
  const profileId = typeof req.query?.profileId === 'string' ? req.query.profileId.slice(0, 100).trim() : '';
  const model = typeof req.query?.model === 'string' ? req.query.model.slice(0, 200).trim() : '';
  const result = await testUpstreamConnection({ profileId, model });
  res.status(200).json(result);
});
