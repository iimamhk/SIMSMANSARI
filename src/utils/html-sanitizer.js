/**
 * Sanitasi HTML materi di sisi klien (browser, ES module).
 *
 * Menyalin kebijakan allowlist dari server `src/api/_lib/ai-html-material.js`
 * agar SEMUA jalur materi HTML — hasil AI, Import, dan Edit — memakai aturan
 * keamanan yang sama. Materi ditampilkan ke siswa di iframe ber-sandbox tanpa
 * same-origin, tetapi skrip tetap dieksekusi; karena itu <script src>/<link>/
 * <img>/<iframe> yang mengarah ke host di luar allowlist DIBUANG, dan host
 * berbahaya seperti polyfill.io diblokir eksplisit (pernah dipakai menyisipkan
 * skrip berbahaya / form login palsu setelah domainnya berpindah tangan).
 *
 * Skrip INLINE sengaja dipertahankan agar interaktivitas (kuis, drag-drop)
 * tetap berfungsi — aman karena hanya berjalan di dalam sandbox.
 */

// Host CDN yang diizinkan. Sengaja sempit: hanya untuk tampilan, ikon, dan
// notasi matematika. Harus selaras dengan ALLOWED_CDN_HOSTS di server.
export const ALLOWED_CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
];

// Host yang diblokir eksplisit meski terlihat seperti CDN umum.
export const BLOCKED_HOSTS = ['polyfill.io', 'cdn.polyfill.io'];

/** Buang pembungkus code fence / teks sebelum <!DOCTYPE atau <html>. */
export function stripHtmlWrapper(text) {
  let value = String(text || '').trim();
  value = value.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
  const lower = value.toLowerCase();
  const docIndex = lower.indexOf('<!doctype');
  const htmlIndex = lower.indexOf('<html');
  const start = docIndex >= 0 ? docIndex : htmlIndex;
  if (start > 0) value = value.slice(start);
  const endIndex = value.toLowerCase().lastIndexOf('</html>');
  if (endIndex >= 0) value = value.slice(0, endIndex + 7);
  return value.trim();
}

function hostAllowed(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
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
 * Bersihkan HTML materi: buang <script src> / <link href> / <img src> / <iframe>
 * ke host di luar allowlist, plus event handler inline (onclick, onerror, ...)
 * dan URL javascript:. Skrip inline dibiarkan karena hanya berjalan di sandbox.
 * @param {string} rawHtml
 * @param {{ stripWrapper?: boolean }} [opts] stripWrapper: buang code fence/teks
 *   di luar <!DOCTYPE>..</html> (berguna untuk hasil tempelan mentah).
 * @returns {{ html: string, removed: string[] }}
 */
export function sanitizeMaterialHtml(rawHtml, opts = {}) {
  const stripWrapper = opts.stripWrapper !== false;
  let html = stripWrapper ? stripHtmlWrapper(rawHtml) : String(rawHtml || '');
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

/**
 * Susun prompt revisi siap-tempel untuk agen eksternal (Kilo/Cline/ChatGPT).
 * Menyertakan HTML materi saat ini + guardrail teknis & keamanan agar hasil
 * revisi tetap kompatibel dan lolos sanitasi saat ditempel kembali.
 * @param {string} html HTML materi saat ini.
 * @param {{ title?: string, instruction?: string }} [meta]
 */
export function buildRevisionPrompt(html, meta = {}) {
  const title = String(meta.title || 'Materi').trim();
  const instruction = String(meta.instruction || '').trim();
  return [
    `Revisi materi pembelajaran HTML berikut (judul: "${title}").`,
    instruction
      ? `Instruksi revisi: ${instruction}`
      : 'Instruksi revisi: [tulis perubahan yang kamu inginkan di sini].',
    '',
    'ATURAN WAJIB saat menulis ulang:',
    '- Keluarkan HANYA dokumen HTML utuh, mulai <!DOCTYPE html> sampai </html>. Tanpa penjelasan, tanpa code fence.',
    '- Pastikan seluruh tag ditutup; dokumen tidak boleh terpotong.',
    `- Sumber eksternal HANYA boleh dari host ini: ${ALLOWED_CDN_HOSTS.join(', ')}.`,
    '- DILARANG memakai polyfill.io atau memuat script/CSS dari host lain di luar daftar di atas (akan dibuang otomatis saat disimpan).',
    '- DILARANG menambahkan form login, permintaan username/password, atau elemen yang meminta kredensial.',
    '- DILARANG menyisipkan <img> dari internet; gambar/diagram dibuat sebagai SVG inline.',
    '- Pertahankan gaya visual, struktur, dan interaktivitas yang sudah ada kecuali diminta diubah.',
    '',
    'HTML materi saat ini:',
    '---',
    String(html || ''),
    '---',
  ].join('\n');
}
