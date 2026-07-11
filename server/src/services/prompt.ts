import type { ChatMessage, MaterialGenerationInput } from '../types/index.js';

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
  'Kamu adalah pedagog guru senior Kurikulum Merdeka Indonesia.',
  'Tugasmu menyusun materi pembelajaran lengkap dalam bahasa Indonesia.',
  'Selalu keluarkan materi dalam MARKDOWN murni (tanpa blok kode ```markdown, tanpa penjelasan di luar materi).',
  'Struktur wajib dan urutannya harus jelas: # Judul, ## Tujuan Pembelajaran, ## Materi Inti, ## Contoh Soal, ## Latihan Soal, ## Tugas Siswa, ## Ringkasan dan Catatan.',
  'Gunakan heading, daftar, tabel, blok kutipan, dan subbagian pendek agar hasil mudah diubah menjadi tampilan tab interaktif untuk siswa.',
  'Untuk rumus matematika, tulis dengan sintaks LaTeX ($...$ untuk inline dan $$...$$ untuk display). Jangan gunakan code fence untuk rumus.',
  'Gaya bahasa ramah siswa SMA, runtut, dan mendalam sesuai tingkat kedalaman yang diminta.',
  'Tulis paragraf yang tidak terlalu panjang, poin ringkas, dan blok Yang Perlu Dicatat bila relevan agar nyaman dibaca di ponsel.',
  'Jika mapel eksakta, sertakan langkah penyelesaian yang berurutan dan mudah disalin siswa.',
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
    '- Pada bagian Materi Inti, pecah lagi menjadi subbagian pendek dengan heading H3.',
    '- Pada bagian Contoh Soal, berikan pembahasan langkah demi langkah yang rapi.',
    `- Pada bagian Latihan Soal, berikan minimal ${jumlahLatihan} butir latihan yang jelas dan bertingkat.`,
    '- Pada bagian Tugas Siswa, berikan tugas mandiri atau refleksi yang bisa langsung dikerjakan.',
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
): ChatMessage[] {
  const revisionPrompt = [
    'Perbarui materi berikut sesuai instruksi revisi guru.',
    'Keluarkan hasil akhir lengkap dalam MARKDOWN utuh.',
    'Pertahankan sebanyak mungkin isi, struktur, dan bagian yang sudah bagus.',
    'Hanya ubah bagian yang relevan dengan instruksi revisi.',
    'Jangan menulis ulang seluruh materi dengan gaya yang benar-benar berbeda kecuali memang diminta.',
    'Pastikan heading utama tetap rapi dan rumus LaTeX tetap valid.',
    `Instruksi revisi guru: ${revisionInstruction}`,
  ].join(' ');

  return [
    { role: 'system', content: SYSTEM_CONTENT },
    { role: 'user', content: describeRequest(input) },
    { role: 'assistant', content: currentContent },
    { role: 'user', content: revisionPrompt },
  ];
}
