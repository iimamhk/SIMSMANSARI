import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { AiServiceError } from '../types/index.js';
import { buildMessages, buildContinuationMessages, buildRevisionMessages } from '../services/prompt.js';
import { streamChatCompletions, testUpstreamConnection } from '../services/openai-compatible-client.js';
import { sanitizeMaterialInput, parseGenerationOptions } from '../middleware/validate.js';

export const aiRouter = Router();

function sendSseComment(res: Response, comment: string) {
  res.write(`: ${comment}\n\n`);
}

function sendSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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

  const partialRaw = typeof req.body?.partial === 'string' ? req.body.partial.slice(0, 20000).trim() : '';
  const revisionInstruction = typeof req.body?.revisionInstruction === 'string'
    ? req.body.revisionInstruction.slice(0, 4000).trim()
    : '';
  const currentContent = typeof req.body?.currentContent === 'string'
    ? req.body.currentContent.slice(0, 50000).trim()
    : '';
  const messages = revisionInstruction && currentContent
    ? buildRevisionMessages(input, currentContent, revisionInstruction)
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

  const abortController = new AbortController();
  // Hentikan generate hanya jika klien benar-benar memutuskan koneksi,
  // bukan saat body request selesai dibaca (req 'close' memicu terlalu awal).
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  let hasStreamed = false;
  try {
    for await (const delta of streamChatCompletions(messages, {
      temperature,
      maxTokens,
      signal: abortController.signal,
    })) {
      if (!delta) continue;
      hasStreamed = true;
      sendSseEvent(res, 'delta', { content: delta });
    }

    sendSseEvent(res, 'done', { model: env.model });
  } catch (error) {
    const errAny = error as { name?: string; message?: string; cause?: { code?: string; message?: string } };
    if (!(error instanceof AiServiceError)) {
      console.warn('[AI generate error]', errAny?.name, '|', errAny?.message, '| cause:', errAny?.cause?.code || errAny?.cause?.message);
    }
    let message: string;
    let code: string;
    if (error instanceof AiServiceError) {
      message = error.message;
      code = error.code;
    } else if (hasStreamed) {
      // Stream terputus di tengah jalan; hasil sebagian sudah di editor klien.
      message = 'Koneksi ke layanan AI terputus di tengah jalan. Hasil sebagian sudah ada di editor — Anda dapat Simpan atau klik Generate untuk mencoba lagi.';
      code = 'stream_interrupted';
    } else {
      message = 'Gagal memulai generate materi. Periksa koneksi ke layanan AI.';
      code = 'generation_failed';
    }
    // Jangan pernah menyertakan API key di pesan error.
    sendSseEvent(res, 'error', { error: message, code });
  } finally {
    res.end();
  }
});

aiRouter.get('/test-connection', async (_req: Request, res: Response) => {
  const result = await testUpstreamConnection();
  res.status(200).json(result);
});
