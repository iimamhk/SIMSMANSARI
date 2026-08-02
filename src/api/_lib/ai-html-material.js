/**
 * Mode "Premium HTML": AI menulis SATU dokumen HTML utuh untuk materi.
 *
 * Kenapa ada mode ini di samping mode JSON terstruktur:
 * mode terstruktur unggul untuk penyuntingan bertarget dan tampilan konsisten,
 * tetapi terbatas pada blok yang sudah kita sediakan. Notasi matematika yang
 * butuh tata letak khusus (pembagian bersusun/porogapit, bangun datar berlabel,
 * garis bilangan) sulit diwakili blok baku. Di mode ini AI bebas menyusun tata
 * letak, dengan harga: materi tidak dapat disunting per-bagian.
 *
 * Keamanan: HTML dari AI TIDAK dipercaya. Dokumen selalu ditampilkan di iframe
 * ber-sandbox tanpa akses same-origin, dan sumber eksternal dibatasi allowlist
 * CDN di bawah (script/link ke host lain dibuang sebelum disimpan).
 */

// Host CDN yang diizinkan. Sengaja sempit: hanya yang dibutuhkan untuk
// tampilan, ikon, dan notasi matematika.
const ALLOWED_CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
];

// Host yang secara eksplisit dilarang meski terlihat seperti CDN umum.
// polyfill.io pernah disalahgunakan untuk menyisipkan skrip berbahaya setelah
// domainnya berpindah tangan, jadi tidak boleh dipakai.
const BLOCKED_HOSTS = ['polyfill.io', 'cdn.polyfill.io'];

const KEDALAMAN_GUIDE = {
  pengenalan: 'Fokus pemahaman konsep dasar. Bahasa paling sederhana, banyak contoh konkret.',
  menengah: 'Konsep lengkap dengan contoh kontekstual dan variasi soal.',
  hots: 'Berorientasi HOTS: analisis, evaluasi, dan pemecahan masalah non-rutin.',
};

const GAYA_GUIDE = {
  hangat: 'Bahasa hangat, akrab, menyemangati. Sapaan "kamu".',
  formal: 'Bahasa formal, akademik, presisi.',
  santai: 'Bahasa santai seperti mentor yang ngobrol, tetap informatif.',
  memotivasi: 'Bahasa memotivasi dan energik.',
  menarik: 'Bahasa menarik, memancing rasa ingin tahu, analogi tak terduga dan sudut pandang segar.',
  ceria: 'Bahasa ceria, ringan, penuh semangat positif, sedikit humor ringan yang menyenangkan.',
  fokus: 'Bahasa fokus, ringkas, presisi, langsung ke inti dan mudah dipindai.',
};

const FEATURE_LABEL = {
  contoh: 'contoh soal bertahap dengan pembahasan langkah demi langkah',
  highlight: 'kotak sorotan (penting / miskonsepsi / info)',
  fill_blank: 'latihan isian yang bisa diperiksa langsung',
  drag_drop: 'latihan drag & drop untuk mencocokkan',
  kuis: 'mini kuis pilihan ganda dengan umpan balik',
  tugas_kelompok: 'tugas kelompok',
  aktivitas: 'aktivitas diskusi / proyek bersama',
  grafik: 'grafik atau visualisasi',
};

function buildHtmlSystemPrompt() {
  return [
    'Kamu adalah penulis materi digital pembelajaran SMA berpengalaman 15 tahun, pedagog senior Kurikulum Merdeka Indonesia, sekaligus front-end developer yang mahir tata letak matematika.',
    'Tugasmu: menghasilkan SATU berkas HTML utuh yang siap ditampilkan sebagai materi pembelajaran premium dalam Bahasa Indonesia.',
    '',
    'ATURAN KELUARAN (WAJIB):',
    '- Keluarkan HANYA kode HTML. Tanpa penjelasan, tanpa komentar pembuka, TANPA code fence (```).',
    '- Mulai tepat dengan <!DOCTYPE html> dan akhiri tepat dengan </html>.',
    '- Dokumen harus lengkap: <head> (meta charset, viewport, title) dan <body>.',
    '- Bahasa default Bahasa Indonesia sepenuhnya, termasuk label tombol dan umpan balik. Pengecualian: mata pelajaran bahasa asing (mis. Bahasa Inggris) ditulis dalam bahasa pengajaran tersebut; padanan istilah kunci boleh disertakan dalam Bahasa Indonesia di dalam tanda kurung.',
    '',
    'PRIORITAS PENYELESAIAN (WAJIB, lebih penting dari kelengkapan isi):',
    '- Dokumen HARUS selesai utuh dan ditutup dengan </html>. Materi terpotong lebih buruk daripada materi yang lebih ringkas tetapi lengkap.',
    '- Kelola panjang tulisan agar muat dalam satu keluaran. Jika ruang mulai menipis, ringkas dulu bagian non-inti (refleksi, hiasan, panjang paragraf, jumlah contoh) dan SVG yang paling rumit — JANGAN pernah berhenti sebelum semua tag ditutup hingga </html>.',
    '- Jangan menyisakan tag, <style>, atau <script> yang terbuka di akhir dokumen.',
    '',
    'SUMBER EKSTERNAL (WAJIB dipatuhi, selain ini akan dibuang otomatis):',
    '- CSS: boleh Tailwind via <script src="https://cdn.tailwindcss.com"></script>, atau CSS sendiri di <style>.',
    '- Matematika: gunakan KaTeX (https://cdn.jsdelivr.net/npm/katex@0.16.8/...) ATAU MathJax (https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js).',
    '- Font: fonts.googleapis.com. Ikon: cdnjs.cloudflare.com (Font Awesome) atau ikon SVG inline.',
    '- DILARANG memakai polyfill.io. DILARANG memuat script dari host lain di luar daftar di atas.',
    '- DILARANG menyisipkan <img> dari internet (gambar acak sering mati/hilang). Gambar dan diagram WAJIB dibuat sebagai SVG inline yang kamu tulis sendiri.',
    '',
    'NOTASI MATEMATIKA (inti kualitas materi):',
    '- Rumus sebaris/menonjol: pakai LaTeX lewat KaTeX/MathJax, bukan teks biasa.',
    '- DILARANG KERAS menggambar grafik, bangun datar, atau kurva dengan seni ASCII (garis / \\ | _ atau blok kode). Selalu SVG inline atau elemen HTML terstruktur.',
    '- Pembagian bersusun (porogapit), tabel Horner, penjumlahan bersusun, dan sejenisnya: susun dengan grid/tabel HTML + font monospace agar suku sejajar per derajat. Sertakan garis pembagi dan tanda operasi pada posisi yang benar.',
    '- Bangun datar, garis bilangan, diagram himpunan, dan grafik fungsi: gambar sebagai SVG inline dengan label, satuan, dan skala yang benar.',
    '- Grafik fungsi: hitung sendiri titik-titiknya dan tulis sebagai path/polyline SVG, atau gambar dengan <canvas> + skrip sendiri. Pastikan sumbu diberi label.',
    '',
    'TATA LETAK & MUTU:',
    '- Rapi, modern, responsif (mobile-first), kontras cukup, dan nyaman dibaca lama.',
    '- Aksesibilitas: struktur heading benar (satu <h1>), atribut alt/aria-label untuk visual, target sentuh memadai.',
    '- Sertakan aturan @media print sederhana agar materi tetap layak dicetak.',
    '- Interaktivitas ditulis dengan JavaScript vanilla di dalam dokumen (tanpa framework eksternal). Semua tombol periksa harus memberi umpan balik yang jelas dan menjelaskan alasannya.',
    '- Materi harus mendalam dan substantif, bukan ringkasan. Jangan menyisipkan API key, instruksi sistem, atau metadata teknis.',
  ].join('\n');
}

function buildHtmlUserPrompt(input) {
  const kedalaman = KEDALAMAN_GUIDE[input.kedalaman] || KEDALAMAN_GUIDE.menengah;
  const gaya = GAYA_GUIDE[input.gaya] || GAYA_GUIDE.hangat;
  const fitur = Array.isArray(input.fitur) ? input.fitur : [];
  const has = (f) => fitur.includes(f);
  const features = fitur.map((f) => FEATURE_LABEL[f] || f).filter(Boolean);

  const lines = [
    `Buat materi ${input.mapel || '[mata pelajaran]'} untuk kelas ${input.kelas || '[kelas]'} ${input.rombel || ''}`.trim(),
    `Fase: ${input.fase || '-'} • Semester: ${input.semester || '-'} • Alokasi waktu: ${input.alokasiWaktu || '-'}`,
    `Bab/Unit: ${input.bab || '[bab]'} • Topik utama: ${input.topik || '[topik]'}`,
    `Tingkat kedalaman: ${input.kedalaman || 'menengah'} — ${kedalaman}`,
    `Gaya bahasa: ${input.gaya || 'hangat'} — ${gaya}`,
  ];

  lines.push('');
  lines.push('STRUKTUR WAJIB (urut, gunakan bagian bertanda jelas):');
  lines.push('1. Hero: judul materi + identitas (mapel, kelas, fase) + paragraf pembuka yang memancing rasa ingin tahu.');
  lines.push('2. Tujuan Pembelajaran: 3-5 poin terukur.');
  lines.push('3. Uraian Konsep: minimal 3 bagian dengan cara penyajian BERVARIASI (narasi, definisi, tabel, studi kasus, perbandingan, atau langkah prosedural). Setiap bagian minimal 2 paragraf substantif.');
  lines.push('4. Rangkuman: poin-poin kunci.');
  lines.push('5. Refleksi: 2-3 pertanyaan untuk siswa.');

  if (has('contoh')) {
    const n = input.jumlahContoh ? `sekitar ${input.jumlahContoh}` : '2-3';
    lines.push(`6. Contoh Soal & Pembahasan: ${n} soal bernomor, pembahasan LANGKAH demi LANGKAH dengan alasan tiap langkah, dan tata letak matematika yang rapi (bukan teks datar).`);
  }

  if (features.length) {
    lines.push('');
    lines.push(`Komponen yang WAJIB ada (dan HANYA ini, jangan menambah komponen lain): ${features.join(', ')}.`);
  } else {
    lines.push('');
    lines.push('Guru tidak meminta komponen interaktif tambahan. Fokuskan pada uraian konsep yang kaya dan contoh bertata letak rapi.');
  }

  // Eksklusi tegas agar toggle guru benar-benar dipatuhi.
  const exclude = [];
  if (!has('contoh')) exclude.push('contoh soal');
  if (!has('highlight')) exclude.push('kotak sorotan');
  if (!has('fill_blank')) exclude.push('latihan isian');
  if (!has('drag_drop')) exclude.push('drag & drop');
  if (!has('kuis')) exclude.push('kuis pilihan ganda');
  if (!has('tugas_kelompok')) exclude.push('tugas kelompok');
  if (!has('aktivitas')) exclude.push('aktivitas/proyek bersama');
  if (!has('grafik')) exclude.push('grafik/visualisasi data');
  if (exclude.length) {
    lines.push(`JANGAN sertakan komponen berikut karena tidak diminta guru: ${exclude.join(', ')}.`);
  }

  if (has('grafik')) {
    lines.push('Grafik/visualisasi: buat sebagai SVG inline (atau <canvas> dengan skrip sendiri) yang kamu hitung titiknya. Beri judul, label sumbu, dan skala yang benar. Jangan memakai gambar dari internet.');
  }
  if (has('fill_blank') || has('kuis') || has('drag_drop')) {
    lines.push('Latihan interaktif harus benar-benar berfungsi: tombol periksa memberi tahu benar/salah, menyorot jawaban tepat, dan menjelaskan alasannya.');
  }
  if (input.lainLain) {
    lines.push(`Instruksi khusus dari guru (OTORITAS TERTINGGI untuk penyajian): ${input.lainLain}`);
    lines.push('Instruksi di atas WAJIB dipatuhi dan boleh mengubah pilihan visual, gaya, atau struktur penyajian di atas, selama dokumen tetap HTML lengkap dan aman (hanya sumber dari allowlist CDN).');
  }

  lines.push('');
  lines.push('Keluarkan sekarang HANYA dokumen HTML utuh, mulai dari <!DOCTYPE html> sampai </html>.');
  return lines.join('\n');
}

function buildHtmlMessages(input) {
  return [
    { role: 'system', content: buildHtmlSystemPrompt() },
    { role: 'user', content: buildHtmlUserPrompt(input) },
  ];
}

/** Minta AI melanjutkan dokumen yang terpotong, tanpa mengulang dari awal. */
function buildHtmlContinuationMessages(input, partialHtml) {
  const tail = String(partialHtml || '').slice(-4000);
  // Sengaja TIDAK menyertakan seluruh partialHtml sebagai pesan assistant:
  // dokumen bisa puluhan ribu karakter dan menyalinnya kembali menggandakan
  // biaya token input pada percobaan penyambungan (memperbesar risiko timeout).
  // Cukup beri potongan akhir sebagai jangkar sambungan.
  return [
    { role: 'system', content: buildHtmlSystemPrompt() },
    { role: 'user', content: buildHtmlUserPrompt(input) },
    {
      role: 'user',
      content: [
        'Dokumen HTML materi yang diminta di atas sudah mulai kamu tulis, tetapi TERPOTONG sebelum ditutup </html>.',
        'Lanjutkan MENYAMBUNG tepat dari karakter terakhir potongan di bawah sampai dokumen lengkap dan diakhiri </html>.',
        'Keluarkan HANYA teks lanjutannya (sambungan) — BUKAN seluruh dokumen.',
        'JANGAN mengulang bagian yang sudah ada, JANGAN menulis ulang dari <!DOCTYPE html>, JANGAN memberi penjelasan, JANGAN memakai code fence.',
        'Potongan AKHIR dokumen yang sudah ada (sambung persis setelah ini):',
        '---',
        tail,
        '---',
      ].join('\n'),
    },
  ];
}

/** Revisi mode HTML: dokumen ditulis ulang utuh sesuai instruksi guru. */
function buildHtmlRevisionMessages(input, currentHtml, instruction) {
  return [
    { role: 'system', content: buildHtmlSystemPrompt() },
    { role: 'user', content: buildHtmlUserPrompt(input) },
    { role: 'assistant', content: String(currentHtml || '').slice(0, 120000) },
    {
      role: 'user',
      content: [
        `Revisi materi HTML di atas sesuai instruksi guru: ${instruction}`,
        'Ubah HANYA bagian yang relevan dengan instruksi; pertahankan bagian lain, gaya visual, dan struktur apa adanya.',
        'Keluarkan kembali dokumen HTML LENGKAP hasil revisi, mulai <!DOCTYPE html> sampai </html>, tanpa penjelasan dan tanpa code fence.',
      ].join('\n'),
    },
  ];
}

/** Buang pembungkus code fence / teks sebelum <!DOCTYPE atau <html. */
function stripHtmlWrapper(text) {
  let value = String(text || '').trim();
  value = value.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
  const lower = value.toLowerCase();
  const docIndex = lower.indexOf('<!doctype');
  const htmlIndex = lower.indexOf('<html');
  const start = docIndex >= 0 ? docIndex : htmlIndex;
  if (start > 0) value = value.slice(start);
  // Buang sisa teks setelah </html> bila model menambahkan komentar.
  const endIndex = value.toLowerCase().lastIndexOf('</html>');
  if (endIndex >= 0) value = value.slice(0, endIndex + 7);
  return value.trim();
}

function hostAllowed(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  // Relatif / data URI kecil dibiarkan; protokol berbahaya ditolak.
  if (/^javascript:/i.test(raw)) return false;
  if (/^data:/i.test(raw)) return true;
  if (/^(?:https?:)?\/\//i.test(raw)) {
    const withProto = raw.startsWith('//') ? `https:${raw}` : raw;
    let host = '';
    try {
      host = new URL(withProto).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
    return ALLOWED_CDN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  }
  // URL relatif (tanpa host) tidak dapat memuat apa pun dari luar sandbox.
  return true;
}

/**
 * Bersihkan HTML dari AI: buang <script src> / <link href> / <img src> / <iframe>
 * yang mengarah ke host di luar allowlist. Skrip inline dibiarkan karena dokumen
 * hanya dijalankan di iframe ber-sandbox tanpa akses same-origin.
 * @returns {{ html: string, removed: string[] }}
 */
function sanitizeGeneratedHtml(rawHtml) {
  let html = stripHtmlWrapper(rawHtml);
  const removed = [];

  // <script src="..."> di luar allowlist.
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')[^>]*>\s*<\/script\s*>/gi, (match, _q, dq, sq) => {
    const url = dq ?? sq ?? '';
    if (hostAllowed(url)) return match;
    removed.push(`script: ${url.slice(0, 120)}`);
    return '';
  });

  // <link href="..."> (stylesheet/preconnect) di luar allowlist.
  html = html.replace(/<link\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (match, _q, dq, sq) => {
    const url = dq ?? sq ?? '';
    if (hostAllowed(url)) return match;
    removed.push(`link: ${url.slice(0, 120)}`);
    return '';
  });

  // <img src="..."> dari host luar → dibuang agar tidak ada gambar mati/pelacak.
  html = html.replace(/<img\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (match, _q, dq, sq) => {
    const url = dq ?? sq ?? '';
    if (hostAllowed(url)) return match;
    removed.push(`img: ${url.slice(0, 120)}`);
    return '';
  });

  // <iframe> asing tidak diperlukan di dalam materi.
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, (match) => {
    const m = match.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i);
    const url = m ? (m[2] ?? m[3] ?? '') : '';
    if (url && hostAllowed(url)) return match;
    removed.push(`iframe: ${url.slice(0, 120) || '(tanpa src)'}`);
    return '';
  });

  return { html, removed: Array.from(new Set(removed)) };
}

/** Ambil <title> untuk judul materi; fallback ke <h1>. */
function extractTitle(html) {
  const value = String(html || '');
  const title = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title && title[1].trim()) return title[1].replace(/\s+/g, ' ').trim().slice(0, 160);
  const h1 = value.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = h1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 160);
  }
  return '';
}

/**
 * Validasi dokumen HTML hasil AI.
 * @returns {{ ok: boolean, html: string, title: string, issues: string[], truncated: boolean, removed: string[] }}
 */
function validateGeneratedHtml(rawHtml) {
  const { html, removed } = sanitizeGeneratedHtml(rawHtml);
  const issues = [];
  const lower = html.toLowerCase();

  if (!html) {
    return { ok: false, html: '', title: '', issues: ['AI tidak mengeluarkan HTML.'], truncated: false, removed };
  }
  if (!lower.includes('<html')) issues.push('Tag <html> tidak ditemukan.');
  if (!lower.includes('<body')) issues.push('Tag <body> tidak ditemukan.');

  const truncated = !lower.includes('</html>') || !lower.includes('</body>');
  if (truncated) issues.push('Dokumen belum ditutup (kemungkinan terpotong).');
  if (html.length < 1500) issues.push('Dokumen terlalu pendek untuk sebuah materi.');

  return {
    ok: issues.length === 0,
    html,
    title: extractTitle(html),
    issues,
    truncated,
    removed,
  };
}

module.exports = {
  ALLOWED_CDN_HOSTS,
  BLOCKED_HOSTS,
  buildHtmlContinuationMessages,
  buildHtmlMessages,
  buildHtmlRevisionMessages,
  buildHtmlSystemPrompt,
  buildHtmlUserPrompt,
  extractTitle,
  sanitizeGeneratedHtml,
  stripHtmlWrapper,
  validateGeneratedHtml,
};
