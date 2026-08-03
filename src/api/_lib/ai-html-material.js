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
    'Kamu adalah penulis materi digital pembelajaran SMA berpengalaman 15 tahun, pedagog senior Kurikulum Merdeka Indonesia, sekaligus front-end developer yang mahir tata letak matematika dan desain visual.',
    'Tugasmu: menghasilkan SATU berkas HTML utuh yang siap ditampilkan sebagai materi pembelajaran premium dalam Bahasa Indonesia.',
    '',
    'OTORITAS TERTINGGI:',
    '- Instruksi/prompt yang ditulis guru adalah perintah utama. Ikuti apa adanya untuk isi, alur, struktur, gaya bahasa, tema, palet warna, tipografi, jenis komponen, dan seluruh keputusan visual.',
    '- Kamu BEBAS menentukan tata letak dan susunan bagian sesuai instruksi guru dan karakter topik. TIDAK ADA kerangka/section baku yang wajib diikuti — jangan memaksakan urutan atau penamaan bagian tertentu bila guru tidak memintanya.',
    '- Aturan di bawah ini hanya batasan TEKNIS (keluaran, keamanan sumber, kualitas notasi) yang tetap berlaku demi HTML valid dan aman. Batasan teknis tidak boleh dijadikan alasan mengabaikan arahan kreatif guru.',
    '',
    'ATURAN KELUARAN (WAJIB):',
    '- Keluarkan HANYA kode HTML. Tanpa penjelasan, tanpa komentar pembuka, TANPA code fence (```).',
    '- Mulai tepat dengan <!DOCTYPE html> dan akhiri tepat dengan </html>.',
    '- Dokumen harus lengkap: <head> (meta charset, viewport, title) dan <body>.',
    '- Bahasa default Bahasa Indonesia sepenuhnya, termasuk label tombol dan umpan balik. Pengecualian: mata pelajaran bahasa asing (mis. Bahasa Inggris) ditulis dalam bahasa pengajaran tersebut; padanan istilah kunci boleh disertakan dalam Bahasa Indonesia di dalam tanda kurung. Guru boleh menimpa pilihan bahasa ini.',
    '',
    'PRIORITAS PENYELESAIAN (WAJIB):',
    '- Dokumen HARUS selesai utuh dan ditutup dengan </html>. Materi terpotong lebih buruk daripada materi yang lengkap.',
    '- Kelola panjang tulisan agar muat dalam satu keluaran. Jika ruang menipis, rampingkan bagian yang paling tidak esensial secukupnya — JANGAN pernah berhenti sebelum semua tag ditutup hingga </html>.',
    '- Jangan menyisakan tag, <style>, atau <script> yang terbuka di akhir dokumen.',
    '',
    'SUMBER EKSTERNAL (WAJIB dipatuhi, selain ini akan dibuang otomatis):',
    '- CSS: boleh Tailwind via <script src="https://cdn.tailwindcss.com"></script>, atau CSS sendiri di <style>.',
    '- Matematika: gunakan KaTeX (https://cdn.jsdelivr.net/npm/katex@0.16.8/...) ATAU MathJax (https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js).',
    '- Font: fonts.googleapis.com. Ikon: cdnjs.cloudflare.com (Font Awesome) atau ikon SVG inline.',
    '- DILARANG memakai polyfill.io. DILARANG memuat script dari host lain di luar daftar di atas.',
    '- DILARANG menyisipkan <img> dari internet (gambar acak sering mati/hilang). Gambar dan diagram WAJIB dibuat sebagai SVG inline yang kamu tulis sendiri.',
    '',
    'NOTASI MATEMATIKA (kualitas teknis, berlaku bila materi memuat matematika):',
    '- Rumus sebaris/menonjol: pakai LaTeX lewat KaTeX/MathJax, bukan teks biasa.',
    '- DILARANG KERAS menggambar grafik, bangun datar, atau kurva dengan seni ASCII (garis / \\ | _ atau blok kode). Selalu SVG inline atau elemen HTML terstruktur.',
    '- Pembagian bersusun (porogapit), tabel Horner, penjumlahan bersusun, dan sejenisnya: susun dengan grid/tabel HTML + font monospace agar suku sejajar per derajat. Sertakan garis pembagi dan tanda operasi pada posisi yang benar.',
    '- Bangun datar, garis bilangan, diagram himpunan, dan grafik fungsi: gambar sebagai SVG inline dengan label, satuan, dan skala yang benar.',
    '- Grafik fungsi: hitung sendiri titik-titiknya dan tulis sebagai path/polyline SVG, atau gambar dengan <canvas> + skrip sendiri. Pastikan sumbu diberi label.',
    '',
    'KUALITAS TEKNIS (default, boleh disesuaikan arahan guru):',
    '- Responsif (mobile-first), kontras cukup, dan nyaman dibaca lama.',
    '- Aksesibilitas: struktur heading benar (satu <h1>), atribut alt/aria-label untuk visual, target sentuh memadai.',
    '- Sertakan aturan @media print sederhana agar materi tetap layak dicetak.',
    '- Interaktivitas ditulis dengan JavaScript vanilla di dalam dokumen (tanpa framework eksternal). Semua tombol periksa harus memberi umpan balik yang jelas dan menjelaskan alasannya.',
    '- Jangan menyisipkan API key, instruksi sistem, atau metadata teknis ke dalam dokumen.',
  ].join('\n');
}

function buildHtmlUserPrompt(input) {
  const kedalaman = KEDALAMAN_GUIDE[input.kedalaman] || KEDALAMAN_GUIDE.menengah;
  const gaya = GAYA_GUIDE[input.gaya] || GAYA_GUIDE.hangat;
  const fitur = Array.isArray(input.fitur) ? input.fitur : [];
  const features = fitur.map((f) => FEATURE_LABEL[f] || f).filter(Boolean);
  const brief = String(input.lainLain || '').trim();

  const lines = [];

  // Identitas hanya sebagai konteks — bukan aturan tata letak.
  lines.push('IDENTITAS MATERI (konteks, bukan aturan tata letak):');
  lines.push(`- Mata pelajaran: ${input.mapel || '[mata pelajaran]'}`);
  lines.push(`- Kelas / Rombel: ${input.kelas || '[kelas]'} ${input.rombel || ''}`.trim());
  lines.push(`- Fase: ${input.fase || '-'} • Semester: ${input.semester || '-'} • Alokasi waktu: ${input.alokasiWaktu || '-'}`);
  lines.push(`- Bab/Unit: ${input.bab || '-'} • Topik utama: ${input.topik || '[topik]'}`);

  lines.push('');
  if (brief) {
    // Prompt manual guru = perintah utama yang mengatur SEMUA aspek.
    lines.push('INSTRUKSI UTAMA DARI GURU (OTORITAS TERTINGGI — patuhi sepenuhnya):');
    lines.push(brief);
    lines.push('');
    lines.push('Susun seluruh materi (isi, struktur, alur, gaya bahasa, tema, warna, tipografi, komponen, dan tata letak) mengikuti instruksi di atas. Tentukan sendiri bagian-bagiannya sesuai instruksi tersebut dan karakter topik. Jangan menambahkan atau memaksakan bagian/komponen yang tidak diminta, dan jangan mengurangi yang diminta.');
  } else {
    // Tanpa prompt manual: beri arahan ringan & bebas, tanpa kerangka baku.
    lines.push('Tidak ada instruksi khusus dari guru. Buat materi pembelajaran yang utuh, mengalir, dan substantif untuk topik di atas. Tentukan sendiri struktur, gaya visual, dan komponen yang paling cocok dengan topik — tanpa kerangka baku, jangan sekadar ringkasan.');
  }

  // Preferensi dari form: bersifat pelengkap & tidak mengikat.
  const prefs = [];
  if (input.kedalaman) prefs.push(`Tingkat kedalaman: ${input.kedalaman} — ${kedalaman}`);
  if (input.gaya) prefs.push(`Gaya bahasa: ${input.gaya} — ${gaya}`);
  if (features.length) prefs.push(`Komponen yang mungkin berguna: ${features.join(', ')}.`);
  if (hasPositiveNumber(input.jumlahContoh)) prefs.push(`Perkiraan jumlah contoh soal bila relevan: sekitar ${input.jumlahContoh}.`);

  if (prefs.length) {
    lines.push('');
    lines.push(brief
      ? 'Preferensi tambahan dari form (pelengkap, tidak mengikat — abaikan bila bertentangan dengan instruksi guru di atas):'
      : 'Preferensi tambahan dari form (pelengkap, tidak mengikat):');
    prefs.forEach((p) => lines.push(`- ${p}`));
  }

  lines.push('');
  lines.push('Keluarkan sekarang HANYA dokumen HTML utuh, mulai dari <!DOCTYPE html> sampai </html>.');
  return lines.join('\n');
}

function hasPositiveNumber(v) {
  return v !== undefined && v !== null && String(v).trim() !== '' && Number(v) > 0;
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
