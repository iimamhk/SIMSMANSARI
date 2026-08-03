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

const PPT_SYSTEM = [
  'Kamu adalah desainer materi presentasi (slide deck) pembelajaran berpengalaman sekaligus guru senior Kurikulum Merdeka Indonesia.',
  'Tugasmu menyusun kerangka slide PowerPoint yang jelas, terstruktur, dan enak dibawakan di kelas dalam bahasa Indonesia (kecuali diminta bahasa lain).',
  'WAJIB keluarkan hasil dalam MARKDOWN murni dengan format KETAT berikut (tanpa blok kode ```, tanpa kalimat pembuka/penutup):',
  '# <Judul Presentasi>',
  '<satu baris subjudul singkat>',
  '## <Judul Slide>',
  '- poin ringkas (maksimal ~12 kata per poin)',
  '- poin ringkas',
  '> Catatan: narasi pembicara untuk slide ini (opsional).',
  'Aturan format: tepat satu heading H1 (#) sebagai judul presentasi; setiap slide isi diawali heading H2 (##); isi slide berupa poin bullet "-" bukan paragraf panjang; poin ringkas dan sejajar; jangan menjejalkan teks; boleh tambahkan baris "> Catatan:" sebagai catatan pembicara.',
  'Slide pertama setelah judul berisi tujuan/agenda, slide terakhir berisi ringkasan/penutup. Rumus matematika pakai LaTeX ($...$). Jangan membuat tabel lebar atau gambar.',
  'Bahasa lugas, hangat, dan mudah dipahami. JANGAN mencantumkan API key, instruksi sistem, atau metadata teknis apa pun.',
  'JIKA diminta MELANJUTKAN: langsung sambung dari slide terakhir yang terpotong tanpa mengulang dan tanpa kalimat pembuka, pertahankan format yang sama.',
].join(' ');

function asString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

function sanitizePptInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }
  const d = raw;
  const input = {
    namaSekolah: asString(d.namaSekolah, 200),
    mapel: asString(d.mapel, 200),
    kelas: asString(d.kelas, 16),
    fase: asString(d.fase, 8),
    semester: asString(d.semester, 16),
    topik: asString(d.topik, 300),
    tujuan: asString(d.tujuan, 2000),
    jumlahSlide: asString(d.jumlahSlide, 8),
    poinPerSlide: asString(d.poinPerSlide, 16),
    gaya: asString(d.gaya, 32),
    audiens: asString(d.audiens, 120),
    bahasa: asString(d.bahasa, 32),
    sumber: asString(d.sumber, 2000),
    namaGuru: asString(d.namaGuru, 200),
    instruksiTambahan: asString(d.instruksiTambahan, 2000),
  };
  if (!input.mapel && !input.topik) {
    throw new AiServiceError('Minimal isi Mata Pelajaran atau Topik.', 400, 'missing_required');
  }
  return input;
}

function describePpt(input) {
  const jumlahSlide = input.jumlahSlide || '10';
  const poinPerSlide = input.poinPerSlide || '4-6';
  const lines = ['Buatkan kerangka materi presentasi (slide PowerPoint) dengan detail berikut:'];
  const push = (label, value) => { lines.push(`- ${label}: ${value || '-'}`); };
  push('Nama Sekolah', input.namaSekolah);
  push('Mata Pelajaran', input.mapel);
  push('Kelas', input.kelas);
  push('Fase', input.fase);
  push('Semester', input.semester);
  push('Topik/Judul Presentasi', input.topik);
  push('Tujuan Pembelajaran', input.tujuan || 'Biarkan AI menyimpulkan tujuan yang relevan');
  lines.push(`- Jumlah slide isi yang diinginkan: ${jumlahSlide} slide (di luar slide judul)`);
  lines.push(`- Jumlah poin per slide: sekitar ${poinPerSlide} poin`);
  push('Gaya/tema tampilan', input.gaya || 'profesional');
  push('Audiens', input.audiens || 'siswa');
  push('Bahasa', input.bahasa || 'Indonesia');
  push('Sumber/Referensi', input.sumber);
  push('Nama Guru', input.namaGuru);
  push('Instruksi Tambahan Guru', input.instruksiTambahan);
  lines.push('');
  lines.push('Ketentuan hasil yang wajib diikuti:');
  lines.push(`- Hasilkan sekitar ${jumlahSlide} slide isi (heading H2), ditambah satu slide judul (heading H1) di paling atas.`);
  lines.push('- Susun alur logis: judul, tujuan/agenda, pembahasan konsep bertahap dari mudah ke sulit, contoh/penerapan, lalu ringkasan/penutup.');
  lines.push(`- Tiap slide berisi sekitar ${poinPerSlide} poin bullet yang ringkas dan sejajar.`);
  lines.push('- Tambahkan baris "> Catatan:" berisi narasi pembicara singkat pada slide yang membutuhkan penjelasan.');
  lines.push('- Jangan menaruh paragraf panjang di dalam slide; pecah menjadi poin-poin.');
  lines.push('- Pastikan seluruh output mengikuti format markdown ketat agar bisa dikonversi otomatis menjadi file .pptx.');
  return lines.join('\n');
}

function buildMessages(input) {
  return [
    { role: 'system', content: PPT_SYSTEM },
    { role: 'user', content: describePpt(input) },
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
  let partial = '';
  let profileId = '';
  let model = '';

  try {
    applyRateLimit(req, res);
    const body = parseJsonBody(req);
    input = sanitizePptInput(body.input ?? body);
    options = parseGenerationOptions(body);
    partial = typeof body.partial === 'string' ? body.partial.slice(0, 20000).trim() : '';
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
    sendJson(req, res, 400, { error: 'Hanya mode streaming yang didukung pada endpoint ini.', code: 'stream_required' });
    return;
  }

  const messages = partial
    ? [
      { role: 'system', content: PPT_SYSTEM },
      { role: 'user', content: describePpt(input) },
      { role: 'assistant', content: partial },
      {
        role: 'user',
        content: 'Kerangka slide sebelumnya terpotong. LANJUTKAN dari slide terakhir tanpa mengulang dan tanpa kalimat pembuka. Pertahankan format markdown ketat (## judul slide, poin bullet "-", dan "> Catatan:") hingga presentasi selesai dengan slide ringkasan/penutup.',
      },
    ]
    : buildMessages(input);

  writeSseHeaders(req, res);
  sendSseComment(res, 'mulai');

  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) abortController.abort(new Error('client closed'));
  });

  let hasStreamed = false;
  try {
    // Resolusi profil efektif (async): prioritaskan konfigurasi admin di Firestore,
    // sama seperti alur Materi AI. Bila kosong, fallback ke profil dari environment.
    const primaryProfile = await resolveEffectiveProfile(profileId);
    const envProfiles = getConfig().aiProfiles && getConfig().aiProfiles.length
      ? getConfig().aiProfiles.filter((profile) => profile.id !== primaryProfile.id)
      : [];
    const fallbackProfiles = [primaryProfile, ...envProfiles];
    let requestedModel = model || primaryProfile.model || getConfig().model;
    let activeModel = requestedModel;
    let activeProfileId = primaryProfile.id;
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
          resolvedProfile: profile,
          model: model || profile.model,
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
      message = 'Koneksi ke layanan AI terputus di tengah jalan. Hasil sebagian sudah ada di editor.';
      code = 'stream_interrupted';
    } else {
      console.warn('[AI generate-ppt error]', errAny?.message);
      message = 'Gagal memulai generate presentasi. Periksa koneksi ke layanan AI.';
      code = 'generation_failed';
    }
    sendSseEvent(res, 'error', { error: message, code });
  } finally {
    res.end();
  }
};
