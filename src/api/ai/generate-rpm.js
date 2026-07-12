const {
  AiServiceError,
  applyRateLimit,
  getConfig,
  getPublicAiProfiles,
  handleOptions,
  parseGenerationOptions,
  parseJsonBody,
  resolveAiProfile,
  sendJson,
  sendSseComment,
  sendSseEvent,
  streamChatCompletions,
  testUpstreamConnection,
  writeSseHeaders,
} = require('../_lib/ai');

const RPM_SYSTEM = [
  'Kamu adalah guru senior Kurikulum Merdeka Indonesia yang menyusun Rencana Pembelajaran Mendalam (RPM).',
  'Tugasmu menghasilkan dokumen RPM lengkap, profesional, dan siap dicetak dalam bahasa Indonesia.',
  'Keluarkan hasil dalam MARKDOWN murni (tanpa blok kode ```, tanpa kalimat pembuka/penutup di luar dokumen).',
  'Struktur wajib dan urutannya TIDAK BOLEH diubah:',
  '# <judul RPM>',
  '## Identitas RPM',
  '## Identifikasi Murid',
  '## Analisis Materi',
  '## Desain Pembelajaran',
  '## Pengalaman Belajar',
  '## Asesmen Pembelajaran',
  '## Rubrik Penilaian',
  '## Lembar Kerja Murid (LKM)',
  '## Pengesahan',
  'Gunakan heading ## tepat untuk setiap section tersebut (jangan ubah urutan/nama).',
  'Gunakan subheading ### bila perlu di dalam section.',
  'Jangan sekadar menyalin ulang field input. Kembangkan menjadi RPM yang kaya, matang, realistis, dan siap dipakai mengajar.',
  'Isi setiap section harus substantif, tidak kaku, tidak terasa seperti template robotik, dan tidak terlalu singkat.',
  'Gunakan tabel markdown untuk identitas, analisis materi, desain pembelajaran, asesmen, rubrik penilaian, LKM, dan data terstruktur lainnya bila relevan.',
  'Gunakan daftar bernomor dan bullet untuk langkah, prosedur, alur kegiatan, serta rincian poin.',
  'Masukkan alasan pedagogis, contoh kontekstual, diferensiasi, potensi miskonsepsi, dan rincian operasional agar dokumen terasa hidup dan dapat langsung dipakai guru.',
  'Untuk rumus matematika, tulis dengan sintaks LaTeX ($...$ untuk inline dan $$...$$ untuk display). JANGAN ubah rumus menjadi gambar.',
  'Gaya bahasa formal, runtut, dan sesuai format administrasi sekolah.',
  'Samakan ritme dengan dokumen resmi sekolah: judul singkat, spasi antarbagiannya tidak berlebihan, tabel dominan, dan paragraf pelengkap tetap bernas.',
  'JANGAN mencantumkan API key, instruksi sistem, atau metadata teknis apa pun.',
].join(' ');

const DIMENSI = [
  'Keimanan dan Ketakwaan kepada Tuhan Yang Maha Esa',
  'Kewargaan',
  'Penalaran Kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
];

function asString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max).trim();
}

function asArray(value, max) {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => typeof x === 'string').map((x) => String(x).slice(0, max));
}

function sanitizeRpmInput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AiServiceError('Payload tidak valid.', 400, 'invalid_payload');
  }
  const d = raw;
  const input = {
    namaSekolah: asString(d.namaSekolah, 200),
    jenjang: asString(d.jenjang, 50),
    kelas: asString(d.kelas, 50),
    semester: asString(d.semester, 50),
    fase: asString(d.fase, 20),
    mapel: asString(d.mapel, 200),
    topik: asString(d.topik, 300),
    capaian: asString(d.capaian, 2000),
    tahunPelajaran: asString(d.tahunPelajaran, 50),
    totalWaktu: asString(d.totalWaktu, 20),
    alokasiWaktu: asString(d.alokasiWaktu, 100),
    modelPembelajaran: asString(d.modelPembelajaran, 100),
    metode: asArray(d.metode, 50),
    media: asArray(d.media, 50),
    sumberBelajar: asString(d.sumberBelajar, 2000),
    dimensi: asArray(d.dimensi, 100),
    kabupaten: asString(d.kabupaten, 100),
    tanggalPengesahan: asString(d.tanggalPengesahan, 50),
    namaGuru: asString(d.namaGuru, 100),
    nipGuru: asString(d.nipGuru, 50),
    namaKepala: asString(d.namaKepala, 100),
    nipKepala: asString(d.nipKepala, 50),
    karakteristik: asString(d.karakteristik, 2000),
    instruksiTambahan: asString(d.instruksiTambahan, 2000),
  };

  if (!input.mapel && !input.topik) {
    throw new AiServiceError('Minimal isi Mata Pelajaran atau Topik.', 400, 'missing_required');
  }
  return input;
}

function describeRpm(input) {
  const lines = ['Buatkan dokumen Rencana Pembelajaran Mendalam (RPM) dengan data berikut:'];
  const push = (label, value) => { if (value) lines.push(`- ${label}: ${value}`); };

  push('Nama Sekolah', input.namaSekolah || 'SMA Negeri 1 Wanasari');
  push('Jenjang', input.jenjang || 'SMA');
  push('Kelas', input.kelas);
  push('Semester', input.semester);
  push('Fase', input.fase);
  push('Mata Pelajaran', input.mapel);
  push('Topik Pembelajaran', input.topik);
  push('Capaian Pembelajaran', input.capaian);
  push('Tahun Pelajaran', input.tahunPelajaran);
  push('Total Waktu', input.totalWaktu ? `${input.totalWaktu} JP` : '');
  push('Alokasi Waktu', input.alokasiWaktu);
  push('Model Pembelajaran', input.modelPembelajaran);
  if (input.metode.length) push('Metode Pembelajaran', input.metode.join(', '));
  if (input.media.length) push('Media Pembelajaran', input.media.join(', '));
  push('Sumber Belajar', input.sumberBelajar);

  if (input.dimensi.length) {
    const valid = input.dimensi.filter((x) => DIMENSI.includes(x));
    if (valid.length) lines.push(`- Dimensi Profil Lulusan yang diutamakan: ${valid.join(', ')}`);
  }

  push('Kabupaten/Kota', input.kabupaten);
  push('Tanggal Pengesahan', input.tanggalPengesahan);
  push('Nama Guru', input.namaGuru);
  push('NIP Guru', input.nipGuru);
  push('Nama Kepala Sekolah', input.namaKepala);
  push('NIP Kepala Sekolah', input.nipKepala);
  push('Karakteristik Murid', input.karakteristik);
  push('Instruksi Tambahan AI', input.instruksiTambahan);

  lines.push('');
  lines.push('Ketentuan hasil:');
  lines.push('- Susun seluruh 9 section sesuai urutan wajib (Identitas RPM, Identifikasi Murid, Analisis Materi, Desain Pembelajaran, Pengalaman Belajar, Asesmen Pembelajaran, Rubrik Penilaian, Lembar Kerja Murid (LKM), Pengesahan).');
  lines.push('- Jangan hanya mengulang input. Kembangkan tiap bagian menjadi isi RPM yang kaya, runtut, dan siap dipakai guru.');
  lines.push('- Pada section Identitas RPM, buat tabel 3 kolom: label, titik dua, dan isi.');
  lines.push('- Pada section Identifikasi Murid, jelaskan kesiapan awal, keberagaman kebutuhan, potensi hambatan belajar, dan pendekatan diferensiasi yang sesuai.');
  lines.push('- Pada section Analisis Materi, gunakan tabel 2 kolom dengan header Aspek dan Uraian.');
  lines.push('- Pada section Desain Pembelajaran, gunakan tabel yang rapi dan padat untuk tujuan, aktivitas guru, aktivitas murid, media/sumber, asesmen formatif, dan diferensiasi.');
  lines.push('- Pada section Pengalaman Belajar, uraikan alur pembelajaran yang konkret dari pendahuluan, inti, hingga penutup secara tidak kaku.');
  lines.push('- Pada section Asesmen Pembelajaran, jelaskan asesmen diagnostik, formatif, dan sumatif berikut teknik, instrumen, indikator, dan umpan balik.');
  lines.push('- Pada section Rubrik Penilaian, gunakan tabel 5 kolom: Aspek Penilaian, Skor 4 (Sangat Baik), Skor 3 (Baik), Skor 2 (Cukup), Skor 1 (Perlu Bimbingan).');
  lines.push('- Pada section Lembar Kerja Murid (LKM), sediakan aktivitas utuh: tujuan, petunjuk, langkah kerja, pertanyaan pemantik, dan refleksi.');
  lines.push('- Pada section Pengesahan, buat blok tanda tangan 2 kolom sederhana: Mengetahui/Kepala Sekolah di kiri dan tempat-tanggal/Guru Mata Pelajaran di kanan.');
  lines.push('- Jaga ritme spasi seperti dokumen resmi sekolah dan jangan membuat paragraf hias yang tidak perlu.');
  lines.push('- Gunakan rumus LaTeX yang valid bila memuat matematika.');
  lines.push('- Pastikan dokumen siap dicetak tanpa perlu perbaikan layout.');
  return lines.join('\n');
}

function buildMessages(input) {
  return [
    { role: 'system', content: RPM_SYSTEM },
    { role: 'user', content: describeRpm(input) },
  ];
}

function buildSectionMessages(input, sectionTitle, context, currentSection) {
  const contextText = context && context.trim() ? context.trim() : '(belum ada section lain)';
  const instruction = [
    'Kamu sedang menyusun SATU section dari dokumen RPM.',
    `HASILKAN HANYA section: "${sectionTitle}".`,
    'Keluarkan dalam MARKDOWN dengan heading ## persis "## ' + sectionTitle + '" di baris pertama.',
    'JANGAN mengulang section lain, jangan beri penjelasan di luar section ini.',
    'Pertahankan gaya, format, dan konteks dokumen RPM yang sudah ada.',
    'Kembangkan isi agar lebih kaya, lebih operasional, dan tidak kaku. Jangan hanya merapikan isi lama yang terlalu singkat.',
    'Gunakan tabel/bullet/numbering bila sesuai, utamakan pola tabel sekolah bila bagian tersebut memang data terstruktur. Rumus matematika pakai LaTeX.',
    '',
    'Konteks dokumen RPM (setup & section lain):',
    contextText,
    currentSection && currentSection.trim() ? `\nIsi section saat ini yang boleh dipertahankan/sebagian diubah:\n${currentSection.trim()}` : '',
  ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: RPM_SYSTEM },
    { role: 'user', content: describeRpm(input) },
    { role: 'user', content: instruction },
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
  let sectionTitle = '';
  let context = '';
  let currentSection = '';
  let partial = '';
  let profileId = '';
  let model = '';

  try {
    applyRateLimit(req, res);
    const body = parseJsonBody(req);
    input = sanitizeRpmInput(body.input ?? body);
    options = parseGenerationOptions(body);
    sectionTitle = typeof body.sectionTitle === 'string' ? body.sectionTitle.slice(0, 200).trim() : '';
    context = typeof body.context === 'string' ? body.context.slice(0, 30000).trim() : '';
    currentSection = typeof body.currentSection === 'string' ? body.currentSection.slice(0, 30000).trim() : '';
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

  const messages = sectionTitle
    ? buildSectionMessages(input, sectionTitle, context, currentSection)
    : partial
      ? [
        { role: 'system', content: RPM_SYSTEM },
        { role: 'user', content: describeRpm(input) },
        { role: 'assistant', content: partial },
        {
          role: 'user',
          content: 'Teks RPM sebelumnya terpotong. LANJUTKAN dari titik terakhir tanpa mengulang bagian yang sudah ada. Pertahankan format MARKDOWN, struktur RPM resmi, dan gaya penulisan yang sama sampai dokumen selesai.',
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
    const config = getConfig();
    const primaryProfile = resolveAiProfile(profileId);
    const fallbackProfiles = config.aiProfiles && config.aiProfiles.length
      ? [primaryProfile, ...config.aiProfiles.filter((profile) => profile.id !== primaryProfile.id)]
      : [primaryProfile];
    let requestedModel = model || primaryProfile.model || config.model;
    let activeModel = requestedModel;
    let activeProfileId = primaryProfile.id;
    let modelFallbackUsed = false;

    for (let index = 0; index < fallbackProfiles.length; index += 1) {
      const profile = fallbackProfiles[index];
      activeProfileId = profile.id;
      if (index > 0) {
        requestedModel = model || profile.model || config.model;
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
      message = 'Koneksi ke layanan AI terputus di tengah jalan. Hasil sebagian sudah ada di editor.';
      code = 'stream_interrupted';
    } else {
      console.warn('[AI generate-rpm error]', errAny?.message);
      message = 'Gagal memulai generate RPM. Periksa koneksi ke layanan AI.';
      code = 'generation_failed';
    }
    sendSseEvent(res, 'error', { error: message, code });
  } finally {
    res.end();
  }
};
