import type { ChatMessage, MaterialGenerationInput, RpmGenerationInput } from '../types/index.js';

const KEDALAMAN_LABEL: Record<string, string> = {
  pengenalan: 'Pengenalan (konsep dasar, mudah dipahami siswa)',
  menengah: 'Menengah (konsep lengkap dengan contoh kontekstual)',
  mendalam: 'Mendalam (berpikir kritis, HOTS, analisis mendalam)',
  advanced: 'Advanced (integrasi lintas topik, aplikasi nyata)',
};

const TAMPILAN_LABEL: Record<string, string> = {
  modern: 'modern dengan tipografi bersih',
  premium: 'premium dengan aksen warna elegan',
  interaktif: 'interaktif (daftar isi, pertanyaan refleksi, kuis mini)',
  bersih: 'bersih dan fokus tanpa elemen berlebih',
  multitab: 'tersusun rapi dalam beberapa bagian/topik',
  ilustratif: 'kaya ilustrasi dan diagram bila relevan',
  ringkas: 'ringkas namun padat informasi',
};

const SYSTEM_CONTENT = [
  'Kamu bertindak sebagai penulis buku dan materi digital pembelajaran berpengalaman selama 15 tahun, sekaligus pedagog guru senior Kurikulum Merdeka Indonesia.',
  'Tugasmu menyusun materi pembelajaran lengkap dalam bahasa Indonesia yang kaya isi, enak dibaca, modern, interaktif, dan tidak membosankan.',
  'Selalu keluarkan materi dalam MARKDOWN murni (tanpa blok kode ```markdown, tanpa penjelasan di luar materi).',
  'Struktur wajib dan urutannya harus jelas: # Judul, ## Tujuan Pembelajaran, ## Materi Inti, ## Contoh Soal, ## Latihan Soal, ## Tugas Siswa, ## Ringkasan dan Catatan.',
  'Gunakan heading, daftar, tabel, blok kutipan, callout, dan subbagian pendek agar hasil mudah diubah menjadi tampilan tab interaktif untuk siswa.',
  'Untuk rumus matematika, tulis dengan sintaks LaTeX ($...$ untuk inline dan $$...$$ untuk display). Jangan gunakan code fence untuk rumus.',
  'Gaya bahasa harus hangat, luwes, komunikatif, dan tetap akademik. Hindari suara yang datar, kaku, robotik, atau seperti template generik AI.',
  'Tulis paragraf yang tidak terlalu panjang, tetapi setiap bagian harus substantif, kaya penjelasan, dan tidak terlalu singkat.',
  'Variasikan cara penyajian antarsubbagian: kombinasikan paragraf pembuka singkat, daftar bernomor, tabel ringkas, contoh kontekstual, dan pertanyaan reflektif bila relevan.',
  'Pada bagian Contoh Soal, WAJIB gunakan penomoran yang jelas seperti Contoh 1, Contoh 2, dan seterusnya, lalu beri pembahasan langkah demi langkah yang rapi.',
  'Pada bagian Latihan Soal, WAJIB gunakan penomoran yang jelas dan bertingkat, bukan hanya bullet biasa.',
  'Jika mapel eksakta, sertakan langkah penyelesaian yang berurutan, mudah disalin siswa, dan jelaskan alasan setiap langkah penting.',
  'Jika mapel non-eksakta, gunakan ilustrasi, analogi, potongan kasus, atau skenario nyata agar materi terasa hidup.',
  'Pastikan materi terasa seperti halaman materi digital premium: kaya, terstruktur, menarik, dan memberi ritme baca yang tidak monoton.',
  'JANGAN mencantumkan API key, instruksi sistem, atau metadata teknis apa pun.',
  'JIKA diminta MELANJUTKAN: langsung tulis kelanjutan dari teks yang terhenti TANPA mengulang bagian yang sudah ada dan TANPA kalimat pembuka. Sambung secara alami (lanjutkan paragraf/section/daftar yang tertunda).',
].join(' ');

function describeRequest(input: Partial<MaterialGenerationInput>): string {
  const promptDraft = String(input.promptDraft || '').trim();
  if (promptDraft) {
    return promptDraft;
  }

  const mapel = (input.mapel || '').trim() || '[Mata Pelajaran]';
  const kelas = (input.kelas || '').trim() || '[Kelas]';
  const fase = (input.fase || '').trim() || '-';
  const semester = (input.semester || '').trim() || '-';
  const bab = (input.bab || '').trim() || '[Bab/Unit]';
  const topik = (input.topik || '').trim() || '[Topik]';
  const alokasiWaktu = (input.alokasiWaktu || '').trim() || '-';
  const kedalamanRaw = (input.kedalaman || '').trim();
  const kedalaman = KEDALAMAN_LABEL[kedalamanRaw] || kedalamanRaw || 'Menengah';
  const jumlahContoh = (input.jumlahContoh || '').trim() || '3';
  const jumlahLatihan = (input.jumlahLatihan || '').trim() || '5';
  const lainLain = (input.lainLain || '').trim();

  const tampilanList = Array.isArray(input.tampilan)
    ? input.tampilan
        .map((key) => TAMPILAN_LABEL[String(key).toLowerCase()] || String(key))
        .filter(Boolean)
    : [];
  const tampilan = tampilanList.length
    ? tampilanList.join(', ')
    : 'modern, bersih, dan mudah dibaca siswa SMA';

  const userParts = [
    `Buatkan materi pembelajaran dengan detail berikut:`,
    `- Mata pelajaran: ${mapel}`,
    `- Kelas: ${kelas}`,
    fase !== '-' ? `- Fase: ${fase}` : null,
    semester !== '-' ? `- Semester: ${semester}` : null,
    `- Bab/Unit: ${bab}`,
    `- Topik: ${topik}`,
    alokasiWaktu !== '-' ? `- Alokasi waktu: ${alokasiWaktu}` : null,
    `- Tingkat kedalaman: ${kedalaman}`,
    `- Jumlah contoh: ${jumlahContoh}`,
    `- Jumlah latihan soal: ${jumlahLatihan}`,
    `- Tampilan yang diinginkan: ${tampilan}`,
    lainLain ? `- Catatan tambahan guru: ${lainLain}` : null,
    '',
    'Ketentuan hasil yang wajib diikuti:',
    '- Tulis output dalam markdown siap render, tanpa pembuka atau penutup tambahan.',
    '- Gunakan heading H2 persis untuk bagian utama ini: Tujuan Pembelajaran, Materi Inti, Contoh Soal, Latihan Soal, Tugas Siswa, Ringkasan dan Catatan.',
    '- Pada bagian Materi Inti, pecah lagi menjadi subbagian pendek dengan heading H3 dan gaya penyajian yang bervariasi agar tidak monoton.',
    '- Awali setiap bagian utama dengan pengantar singkat yang hidup dan natural, bukan kalimat formal yang kaku.',
    '- Pada bagian Contoh Soal, gunakan penomoran eksplisit seperti Contoh 1, Contoh 2, dan seterusnya, lalu berikan pembahasan langkah demi langkah yang rapi.',
    `- Pada bagian Latihan Soal, berikan minimal ${jumlahLatihan} butir latihan yang jelas, bertingkat, dan bernomor urut.`,
    '- Pada bagian Tugas Siswa, berikan tugas mandiri atau refleksi yang bisa langsung dikerjakan.',
    '- Buat isi setiap bagian cukup kaya: jangan terlalu singkat, jangan sekadar definisi satu paragraf lalu selesai.',
    '- Sisipkan contoh kontekstual, analogi, atau ilustrasi nyata agar siswa merasa materi dekat dengan kehidupan mereka.',
    '- Jika sesuai, gunakan tabel ringkas atau blok sorotan untuk memperjelas ringkasan konsep, miskonsepsi umum, atau langkah penting.',
    '- Jika materi memuat rumus, pastikan rumus valid dalam LaTeX kompleks sekalipun.',
    '- Hindari tabel yang terlalu lebar dan hindari paragraf yang terlalu panjang.',
  ].filter(Boolean);

  return userParts.join('\n');
}

/**
 * Membangun pesan untuk generate baru.
 * Prompt engineering ditempatkan di sisi server agar konsisten dan tidak bocor ke frontend.
 */
export function buildMessages(input: Partial<MaterialGenerationInput>): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
  ];
}

/**
 * Membangun pesan untuk MELANJUTKAN generate yang terhenti.
 * Mengirimkan hasil parsial sebagai pesan assistant dan meminta model
 * menyambungnya secara langsung tanpa mengulang.
 */
export function buildContinuationMessages(
  input: Partial<MaterialGenerationInput>,
  partial: string,
): ChatMessage[] {
  const continuationInstruction =
    'Teks materi sebelumnya terpotong. LANJUTKAN menulis materi dari tempat terakhir tersebut. ' +
    'Aturan: jangan ulangi bagian yang sudah ada, jangan beri kalimat pembuka/apologi, langsung sambung paragraf atau section berikutnya secara alami. ' +
    'Pertahankan format MARKDOWN dan gaya yang sama. Selesaikan seluruh bagian yang belum tuntas (contoh, latihan soal, ringkasan/refleksi).';

  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
    { role: 'assistant', content: partial },
    { role: 'user', content: continuationInstruction },
  ];
}

export function buildRevisionMessages(
  input: Partial<MaterialGenerationInput>,
  currentContent: string,
  revisionInstruction: string,
  revisionMode?: string,
): ChatMessage[] {
  const normalizedMode = String(revisionMode || '').trim().toLowerCase();
  const modeGuidance = {
    concise: [
      'Fokus revisi: buat materi lebih ringkas tanpa menghilangkan isi inti.',
      'Pangkas kalimat berulang, pembuka yang terlalu panjang, dan penjelasan yang tidak menambah makna.',
      'Pertahankan struktur utama, istilah penting, contoh yang kuat, dan alur belajar.',
      'Target akhir harus terasa lebih padat, lebih mudah dipindai, dan lebih cepat dipelajari.',
    ].join(' '),
    engaging: [
      'Fokus revisi: buat materi lebih menarik, hangat, dan hidup.',
      'Perkuat variasi kalimat, gunakan pengantar yang memancing rasa ingin tahu, dan tambahkan kaitan dengan situasi nyata siswa.',
      'Utamakan peningkatan daya tarik baca tanpa membongkar struktur besar yang sudah rapi.',
    ].join(' '),
    exercise: [
      'Fokus revisi: tambahkan latihan yang lebih kaya dan terstruktur.',
      'Perluas bagian latihan soal dengan penomoran yang jelas, variasi tingkat kesulitan, dan instruksi yang mudah dipahami.',
      'Jika latihan sudah ada, pertahankan yang bagus lalu lengkapi agar lebih menantang dan relevan.',
    ].join(' '),
    analogy: [
      'Fokus revisi: tambahkan analogi, ilustrasi, atau perbandingan kontekstual untuk konsep yang abstrak.',
      'Sisipkan analogi pada bagian yang paling sulit dipahami tanpa membuat materi menjadi bertele-tele.',
      'Pastikan analogi tetap akurat secara akademik dan dekat dengan pengalaman siswa.',
    ].join(' '),
    premium: [
      'Fokus revisi: perkuat nuansa premium, modern, dan interaktif pada penyajian materi.',
      'Rapikan struktur, tambahkan callout atau penekanan isi yang elegan, dan buat transisi antarbab terasa lebih halus.',
      'Tetap jaga materi mudah dibaca dan tidak berubah menjadi dekoratif berlebihan.',
    ].join(' '),
  }[normalizedMode] || '';

  const revisionPrompt = [
    'Perbarui materi berikut sesuai instruksi revisi guru.',
    'Keluarkan hasil akhir lengkap dalam MARKDOWN utuh.',
    'Pertahankan sebanyak mungkin isi, struktur, dan bagian yang sudah bagus.',
    'Hanya ubah bagian yang relevan dengan instruksi revisi.',
    'Jangan menulis ulang seluruh materi dengan gaya yang benar-benar berbeda kecuali memang diminta.',
    'Saat merevisi, pertahankan gaya penulisan yang kaya, hidup, modern, dan tidak kaku.',
    'Pastikan heading utama tetap rapi dan rumus LaTeX tetap valid.',
    'Jika instruksi revisi bersifat lokal, prioritaskan penyempurnaan bagian terkait dan biarkan bagian lain tetap stabil.',
    modeGuidance,
    `Instruksi revisi guru: ${revisionInstruction}`,
  ].filter(Boolean).join(' ');

  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
    { role: 'assistant', content: currentContent },
    { role: 'user', content: revisionPrompt },
  ];
}

// ===================== PROMPT RPM (Rencana Pembelajaran Mendalam) =====================

const RPM_SECTION_ORDER = [
  'Identitas RPM',
  'Identifikasi Murid',
  'Analisis Materi',
  'Desain Pembelajaran',
  'Pengalaman Belajar',
  'Asesmen Pembelajaran',
  'Rubrik Penilaian',
  'Lembar Kerja Murid (LKM)',
  'Pengesahan',
];

const RPM_SYSTEM_CONTENT = [
  'Kamu adalah pedagog guru senior Kurikulum Merdeka Indonesia yang ahli menyusun Rencana Pembelajaran Mendalam (RPM).',
  'Tugasmu menyusun dokumen RPM lengkap, profesional, dan siap dicetak dalam bahasa Indonesia.',
  'Selalu keluarkan hasil dalam MARKDOWN murni (tanpa blok kode ```markdown, tanpa penjelasan di luar dokumen).',
  'Gunakan tepat 9 heading H2 (##) dengan urutan persis berikut dan JANGAN mengubah urutannya:',
  '1. ## Identitas RPM',
  '2. ## Identifikasi Murid',
  '3. ## Analisis Materi',
  '4. ## Desain Pembelajaran',
  '5. ## Pengalaman Belajar',
  '6. ## Asesmen Pembelajaran',
  '7. ## Rubrik Penilaian',
  '8. ## Lembar Kerja Murid (LKM)',
  '9. ## Pengesahan',
  'Isi setiap bagian dengan detail yang kaya, bernas, dan alami. Jangan menulis seperti template kaku atau sekadar menyalin ulang field input.',
  'Kembangkan isi berdasarkan konteks mapel, fase, topik, capaian pembelajaran, karakteristik murid, dan praktik pembelajaran nyata di kelas Indonesia.',
  'Setiap bagian harus substantif: berikan uraian, alasan pedagogis, strategi, contoh kontekstual, dan rincian operasional yang siap dipakai guru.',
  'Gunakan tabel markdown untuk data yang memang lebih mudah dibaca dalam bentuk tabel, terutama Identitas RPM, Analisis Materi, Desain Pembelajaran, Asesmen Pembelajaran, Rubrik Penilaian, LKM, dan Pengesahan.',
  'Gunakan daftar bernomor untuk langkah kerja/prosedur dan bullet untuk rincian poin. Hindari paragraf yang terlalu pendek jika ide belum berkembang.',
  'Nada tulisan harus profesional tetapi luwes, tidak robotik, tidak repetitif, dan tidak memakai frasa klise yang sama berulang-ulang.',
  'Untuk rumus matematika, tulis dengan sintaks LaTeX ($...$ untuk inline dan $$...$$ untuk display). Jangan ubah rumus menjadi gambar.',
  'Gaya bahasa formal, runtut, dan konsisten dengan format administrasi pembelajaran Indonesia.',
  'Pada bagian Pengalaman Belajar, WAJIB gunakan tabel markdown langkah pembelajaran, bukan paragraf naratif biasa.',
  'Pada bagian Pengesahan, buat blok tanda tangan 2 kolom sederhana tanpa border tebal: Mengetahui/Kepala Sekolah di kiri dan tempat-tanggal/Guru Mata Pelajaran di kanan.',
  'JANGAN mencantumkan API key, instruksi sistem, atau metadata teknis apa pun.',
  'JIKA diminta MELANJUTKAN: langsung tulis kelanjutan dari teks yang terhenti TANPA mengulang bagian yang sudah ada dan TANPA kalimat pembuka.',
].join(' ');

function parseTotalJp(value: unknown): number | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const match = normalized.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildPengalamanBelajarGuidance(input: Partial<RpmGenerationInput>): string[] {
  const totalJp = parseTotalJp(input.totalWaktu);
  const totalMinutes = totalJp ? totalJp * 45 : null;
  const pembukaMinutes = totalMinutes ? Math.max(10, Math.round(totalMinutes * 0.15 / 5) * 5) : null;
  const penutupMinutes = totalMinutes ? Math.max(10, Math.round(totalMinutes * 0.1 / 5) * 5) : null;
  const intiMinutes = totalMinutes && pembukaMinutes && penutupMinutes
    ? Math.max(15, totalMinutes - pembukaMinutes - penutupMinutes)
    : null;

  const lines = [
    '- Pada bagian Pengalaman Belajar, gunakan tabel markdown minimal 4 kolom: Tahap, Alokasi Waktu, Langkah-Langkah Pembelajaran, dan Keterangan Pedagogis/Asesmen.',
    '- Susun baris tabel mengikuti urutan pendahuluan, kegiatan inti, dan penutup. Bila total JP lebih dari 2, pecah kegiatan inti menjadi beberapa langkah/sesi yang proporsional.',
    '- Setiap baris harus berisi langkah konkret guru dan murid, bukan kalimat umum seperti "guru menjelaskan" atau "siswa berdiskusi" tanpa rincian.',
    '- Kolom Alokasi Waktu harus ditulis spesifik dalam menit dan konsisten dengan total JP yang diberikan.',
  ];

  if (totalJp && totalMinutes && pembukaMinutes && intiMinutes && penutupMinutes) {
    lines.push(`- Total waktu pembelajaran yang harus terbagi habis adalah ${totalJp} JP = ${totalMinutes} menit.`);
    lines.push(`- Gunakan pembagian waktu yang realistis dengan acuan: pendahuluan sekitar ${pembukaMinutes} menit, kegiatan inti sekitar ${intiMinutes} menit, dan penutup sekitar ${penutupMinutes} menit.`);
  } else if (totalJp && totalMinutes) {
    lines.push(`- Total waktu pembelajaran yang harus terbagi habis adalah ${totalJp} JP = ${totalMinutes} menit.`);
  }

  return lines;
}

function describeRpmRequest(input: Partial<RpmGenerationInput>): string {
  const f = input || {};
  const list = (arr?: string[]) => (Array.isArray(arr) && arr.length ? arr.join(', ') : 'Biarkan AI menentukan yang paling sesuai');
  const pengalamanBelajarGuidance = buildPengalamanBelajarGuidance(f);
  return [
    'Buatkan Rencana Pembelajaran Mendalam (RPM) dengan detail berikut:',
    `- Nama Sekolah: ${f.namaSekolah || '-'}`,
    `- Jenjang: ${f.jenjang || '-'}`,
    `- Kelas: ${f.kelas || '-'}`,
    `- Semester: ${f.semester || '-'}`,
    `- Fase: ${f.fase || '-'}`,
    `- Mata Pelajaran: ${f.mapel || '-'}`,
    `- Topik Pembelajaran: ${f.topik || '-'}`,
    `- Capaian Pembelajaran: ${f.capaian || '-'}`,
    `- Tahun Pelajaran: ${f.tahunPelajaran || '-'}`,
    `- Total Waktu: ${f.totalWaktu || '-'} JP`,
    `- Alokasi Waktu: ${f.alokasiWaktu || '-'}`,
    `- Model Pembelajaran: ${f.modelPembelajaran || 'Biarkan AI memilih yang paling sesuai'}`,
    `- Metode Pembelajaran: ${list(f.metode)}`,
    `- Media Pembelajaran: ${list(f.media)}`,
    `- Sumber Belajar: ${f.sumberBelajar || '-'}`,
    `- Dimensi Profil Lulusan: ${list(f.dimensi)}`,
    `- Kabupaten/Kota: ${f.kabupaten || '-'}`,
    `- Tanggal Pengesahan: ${f.tanggalPengesahan || '-'}`,
    `- Nama Guru: ${f.namaGuru || '-'}`,
    `- NIP Guru: ${f.nipGuru || '-'}`,
    `- Nama Kepala Sekolah: ${f.namaKepala || '-'}`,
    `- NIP Kepala Sekolah: ${f.nipKepala || '-'}`,
    `- Karakteristik Murid: ${f.karakteristik || '-'}`,
    `- Instruksi Tambahan Guru: ${f.instruksiTambahan || '-'}`,
    '',
    'Ketentuan hasil yang wajib diikuti:',
    '- Tulis output dalam markdown siap render, tanpa pembuka atau penutup tambahan.',
    '- Gunakan heading H2 (##) PERSIS untuk 9 bagian utama dengan urutan: ' + RPM_SECTION_ORDER.join(', ') + '.',
    '- Urutan bagian tidak boleh diubah.',
    '- Jangan sekadar mengulang data input. Kembangkan menjadi dokumen RPM yang matang, realistis, dan siap dipakai mengajar.',
    '- Panjangkan isi secara wajar: setiap section minimal memuat 2 sampai 4 subbagian atau butir penting kecuali Identitas RPM dan Pengesahan.',
    '- Pada bagian Identitas RPM, gunakan tabel 3 kolom seperti dokumen sekolah: kolom label, kolom titik dua, dan kolom isi.',
    '- Pada bagian Identifikasi Murid, jelaskan kesiapan awal, variasi kemampuan, kebutuhan belajar, potensi miskonsepsi, dan dukungan diferensiasi yang relevan.',
    '- Pada bagian Analisis Materi, gunakan tabel 2 kolom dengan header Aspek dan Uraian.',
    '- Pada bagian Desain Pembelajaran, gunakan tabel yang rapi dan padat untuk tujuan, aktivitas guru, aktivitas murid, media, asesmen formatif, dan diferensiasi.',
    ...pengalamanBelajarGuidance,
    '- Pada bagian Asesmen Pembelajaran, jelaskan asesmen diagnostik, formatif, dan sumatif beserta teknik, instrumen, indikator, dan bentuk umpan balik.',
    '- Pada bagian Rubrik Penilaian, gunakan tabel 5 kolom: Aspek Penilaian, Skor 4 (Sangat Baik), Skor 3 (Baik), Skor 2 (Cukup), Skor 1 (Perlu Bimbingan).',
    '- Pada bagian Lembar Kerja Murid (LKM), sediakan aktivitas/skenario kerja yang utuh: tujuan, alat-bahan bila perlu, petunjuk, langkah kerja, pertanyaan pemantik, dan ruang refleksi.',
    '- Pada bagian Pengesahan, tampilkan blok tanda tangan 2 kolom sederhana tanpa border tebal: Mengetahui/Kepala Sekolah di kiri dan tempat-tanggal/Guru Mata Pelajaran di kanan.',
    '- Jaga ritme spasi seperti dokumen resmi sekolah: judul singkat, jarak antarbagian satu blok, dan tabel lebih dominan daripada paragraf dekoratif.',
    '- Jika mapel memungkinkan, masukkan contoh kontekstual yang dekat dengan kehidupan siswa agar isi tidak kaku.',
    '- Jika materi memuat rumus, pastikan rumus valid dalam LaTeX kompleks sekalipun.',
  ].join('\n');
}

export function buildRpmMessages(input: Partial<RpmGenerationInput>): ChatMessage[] {
  return [
    { role: 'system', content: RPM_SYSTEM_CONTENT },
    { role: 'user', content: describeRpmRequest(input) },
  ];
}

export function buildRpmContinuationMessages(input: Partial<RpmGenerationInput>, partial: string): ChatMessage[] {
  const continuationInstruction =
    'Teks RPM sebelumnya terpotong. LANJUTKAN menulis dokumen dari tempat terakhir tersebut. ' +
    'Aturan: jangan ulangi bagian yang sudah ada, jangan beri kalimat pembuka/apologi, langsung sambung section berikutnya secara alami. ' +
    'Pertahankan format MARKDOWN, urutan 9 heading H2, dan gaya yang sama hingga seluruh dokumen selesai.';
  return [
    { role: 'system', content: RPM_SYSTEM_CONTENT },
    { role: 'user', content: describeRpmRequest(input) },
    { role: 'assistant', content: partial },
    { role: 'user', content: continuationInstruction },
  ];
}

export function buildRpmSectionMessages(
  input: Partial<RpmGenerationInput>,
  sectionTitle: string,
  context: string,
  currentSection: string,
): ChatMessage[] {
  const revisionPrompt = [
    `Perbarui SATU bagian RPM, yaitu: "${sectionTitle}".`,
    'Gunakan konteks dokumen berikut sebagai acuan agar selaras dengan bagian lain:',
    context || '(tidak ada konteks tambahan)',
    '',
    `Isi saat ini dari bagian "${sectionTitle}":`,
    currentSection || '(kosong)',
    '',
    'Instruksi:',
    '- Keluarkan HANYA isi bagian tersebut (TANPA heading ## dan tanpa kalimat pembuka).',
    '- Pastikan isi lengkap, kaya, alami, dan konsisten dengan data RPM serta bagian lain.',
    '- Jangan hanya memadatkan isi lama; kembangkan agar lebih operasional dan lebih siap dipakai guru.',
    '- Gunakan tabel, daftar bernomor, atau bullet bila relevan, terutama bila bagian tersebut memerlukan struktur data dan pola tabel sekolah.',
    sectionTitle.toLowerCase() === 'pengalaman belajar'
      ? buildPengalamanBelajarGuidance(input).join('\n')
      : null,
    '- Untuk rumus matematika, tetap gunakan LaTeX ($...$ atau $$...$$).',
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: RPM_SYSTEM_CONTENT },
    { role: 'user', content: describeRpmRequest(input) },
    { role: 'user', content: revisionPrompt },
  ];
}

