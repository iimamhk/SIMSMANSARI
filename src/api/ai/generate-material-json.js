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
  buildRepairMessages,
  buildSystemPrompt,
  buildUserPrompt,
  buildPatchSystemPrompt,
  buildPatchPrompt,
  applyPatchOperations,
  extractPatch,
  extractJson,
  normalizeMaterial,
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

/**
 * Mode PATCH: minta AI mengeluarkan daftar operasi edit bertarget, terapkan ke
 * materi saat ini, validasi ulang, lalu kirim event "patch" (ringkasan operasi)
 * dan "material" (materi final). Jika patch gagal/invalid, fallback ke revisi
 * penuh agar guru tetap mendapat hasil.
 */
async function handlePatchMode(req, res, { currentJson, editInstruction, options }) {
  writeSseHeaders(req, res);
  sendSseComment(res, 'mulai-edit');

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  // Materi sumber harus valid untuk dapat di-patch.
  const baseMaterial = normalizeMaterial(extractJson(currentJson));
  if (!baseMaterial) {
    sendSseEvent(res, 'error', { error: 'Materi saat ini tidak dapat dibaca untuk disunting.', code: 'invalid_current' });
    res.end();
    return;
  }

  try {
    const profile = await resolveEffectiveProfile('');
    let activeModel = profile.model;

    const messages = [
      { role: 'system', content: buildPatchSystemPrompt() },
      { role: 'user', content: buildPatchPrompt(baseMaterial, editInstruction) },
    ];

    let output = '';
    for await (const delta of streamChatCompletions(messages, {
      profileId: profile.id,
      resolvedProfile: profile,
      model: profile.model,
      temperature: options.temperature ?? 0.4, // lebih rendah agar patуh presisi
      maxTokens: options.maxTokens ?? 4000,
      includeReasoning: false,
      signal: abortController.signal,
      onModelSelected: (m) => { activeModel = m; },
    })) {
      if (!delta) continue;
      output += delta;
      sendSseEvent(res, 'delta', { content: delta });
    }

    const patch = extractPatch(output);
    if (!patch || !Array.isArray(patch.ops)) {
      // Fallback: perlakukan sebagai revisi penuh.
      await runFullRevisionFallback(res, { baseMaterial, editInstruction, profile, options, abortController, activeModel });
      return;
    }

    if (patch.ops.length === 0) {
      // AI menilai tak ada perubahan yang bisa dilakukan.
      sendSseEvent(res, 'patch', { summary: patch.summary || 'Tidak ada perubahan diterapkan.', applied: 0, skipped: [], ops: [] });
      sendSseEvent(res, 'material', { material: baseMaterial, issues: [], model: activeModel, profileId: profile.id, patched: true, applied: 0 });
      sendSseEvent(res, 'done', { model: activeModel, profileId: profile.id });
      res.end();
      return;
    }

    const { material: patched, applied, skipped } = applyPatchOperations(baseMaterial, patch.ops);
    const validation = validateMaterial(JSON.stringify(patched));

    // Jika hasil patch merusak struktur, jangan diterapkan — fallback revisi penuh.
    if (!validation.material || validation.issues.length > 0) {
      await runFullRevisionFallback(res, { baseMaterial, editInstruction, profile, options, abortController, activeModel });
      return;
    }

    sendSseEvent(res, 'patch', {
      summary: patch.summary || `${applied} perubahan diterapkan.`,
      applied,
      skipped,
      ops: patch.ops,
    });
    sendSseEvent(res, 'material', {
      material: validation.material,
      issues: validation.issues,
      model: activeModel,
      profileId: profile.id,
      patched: true,
      applied,
    });
    sendSseEvent(res, 'done', { model: activeModel, profileId: profile.id });
    res.end();
  } catch (error) {
    if (error && /abort/i.test(String(error.message || ''))) {
      if (!res.writableEnded) res.end();
      return;
    }
    let message = 'Gagal menyunting materi. Coba lagi.';
    let code = 'edit_failed';
    if (error instanceof AiServiceError) { message = error.message; code = error.code; }
    else console.warn('[AI patch error]', error?.name, '|', error?.message);
    sendSseEvent(res, 'error', { error: message, code });
    res.end();
  }
}

/** Fallback: minta AI merevisi materi penuh (dipakai bila patch gagal). */
async function runFullRevisionFallback(res, { baseMaterial, editInstruction, profile, options, abortController, activeModel }) {
  sendSseComment(res, 'fallback-revisi-penuh');
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildRevisionPrompt({}, JSON.stringify(baseMaterial), editInstruction) },
  ];
  let output = '';
  for await (const delta of streamChatCompletions(messages, {
    profileId: profile.id,
    resolvedProfile: profile,
    model: profile.model,
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 10000,
    includeReasoning: false,
    signal: abortController.signal,
  })) {
    if (!delta) continue;
    output += delta;
    sendSseEvent(res, 'delta', { content: delta });
  }
  const validation = validateMaterial(output);
  if (!validation.material || validation.issues.length > 0) {
    sendSseEvent(res, 'error', { error: 'Perubahan tidak dapat diterapkan dengan aman. Coba instruksi yang lebih spesifik.', code: 'edit_invalid' });
    res.end();
    return;
  }
  sendSseEvent(res, 'patch', { summary: 'Materi diperbarui menyeluruh sesuai permintaan.', applied: -1, skipped: [], ops: [] });
  sendSseEvent(res, 'material', {
    material: validation.material,
    issues: validation.issues,
    model: activeModel || profile.model,
    profileId: profile.id,
    patched: false,
  });
  sendSseEvent(res, 'done', { model: activeModel || profile.model, profileId: profile.id });
  res.end();
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  // Delegasi ke generator soal bila body menandai kind: 'soal'. Ini sengaja
  // dilakukan agar fitur AI Generate Soal berbagi fungsi serverless & resolusi
  // profil AI admin yang sama dengan AI Materi (tanpa menambah fungsi baru,
  // menjaga jumlah fungsi tetap di bawah batas plan Vercel).
  try {
    const peek = parseJsonBody(req);
    if (peek && peek.kind === 'soal') {
      return require('./generate-soal.js')(req, res);
    }
  } catch {
    // Abaikan; lanjut ke alur generate materi normal di bawah.
  }

  let input;
  let options;
  let revisionInstruction = '';
  let currentJson = '';
  let editInstruction = '';

  try {
    applyRateLimit(req, res);
    const body = parseJsonBody(req);
    input = sanitizeInput(body.input ?? body);
    options = parseGenerationOptions(body);
    revisionInstruction = asString(body.revisionInstruction, 2000);
    editInstruction = asString(body.editInstruction, 2000);
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

  // --- MODE PATCH (Tahap 2): edit bertarget berbasis operasi ---
  // Aktif bila ada editInstruction + currentJson. AI hanya mengembalikan daftar
  // operasi minimal; server menerapkannya lalu memvalidasi ulang materi.
  if (editInstruction && currentJson) {
    await handlePatchMode(req, res, { currentJson, editInstruction, options });
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
    let firstStreamError = null;

    const collectMaterialText = async (promptMessages, onPartial) => {
      let output = '';
      for await (const delta of streamChatCompletions(promptMessages, {
        profileId: profile.id,
        resolvedProfile: profile,
        model: profile.model,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 10000,
        // Reasoning token dari beberapa provider bukan bagian dari JSON materi.
        includeReasoning: false,
        signal: abortController.signal,
        onModelSelected: (selectedModel) => {
          activeModel = selectedModel;
        },
      })) {
        if (!delta) continue;
        output += delta;
        onPartial?.(output);
        sendSseEvent(res, 'delta', { content: delta });
      }
      return output;
    };

    try {
      fullText = await collectMaterialText(messages, (partial) => { fullText = partial; });
    } catch (streamError) {
      // Stream terputus di tengah — respons akan dipulihkan satu kali di bawah.
      firstStreamError = streamError;
      if (fullText.length > 80) {
        streamInterrupted = true;
        console.warn('[AI stream interrupted, attempting partial recovery]', streamError?.message);
      } else {
        throw streamError;
      }
    }

    // Contoh & latihan hanya divalidasi wajib bila guru memintanya lewat "fitur".
    const fiturSel = Array.isArray(input.fitur) ? input.fitur : [];
    const validateOpts = {
      requireExamples: fiturSel.includes('contoh'),
      requireExercises: fiturSel.some((f) => ['fill_blank', 'drag_drop', 'kuis'].includes(f)),
    };
    let validation = validateMaterial(fullText, validateOpts);
    const shouldRepair = !validation.material || validation.issues.length > 0 || streamInterrupted;
    if (shouldRepair && fullText.length > 80) {
      try {
        sendSseComment(res, 'memperbaiki struktur JSON');
        const repairedText = await collectMaterialText(buildRepairMessages(input, fullText));
        const repairedValidation = validateMaterial(repairedText, validateOpts);
        if (repairedValidation.material && repairedValidation.issues.length === 0) {
          validation = repairedValidation;
          streamInterrupted = false;
        } else if (firstStreamError && !validation.material) {
          validation = repairedValidation;
        }
      } catch (repairError) {
        console.warn('[AI JSON repair failed]', repairError?.message || repairError);
      }
    }

    if (!validation.material || validation.issues.length > 0) {
      const hint = streamInterrupted
        ? 'Koneksi terputus saat AI sedang menulis. Materi belum lengkap — coba generate ulang, atau gunakan model yang lebih cepat.'
        : `AI tidak menghasilkan struktur materi yang valid${validation.issues.length ? ` (${validation.issues[0]})` : ''}. Coba generate ulang.`;
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
