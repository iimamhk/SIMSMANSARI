// ============================================================================
// image-local.js
// Ubah berkas gambar dari perangkat menjadi data URL (base64) yang ringkas,
// TANPA memerlukan Firebase Storage. Gambar diperkecil via canvas agar muat
// dengan aman di dokumen Firestore (batas 1 MB per dokumen).
//
// Dipakai untuk logo branding: hasilnya bisa langsung dipasang ke <img src>
// dan disimpan di pengaturan lobi sehingga tampil untuk semua pengunjung.
// ============================================================================

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const MAX_INPUT_BYTES = 8 * 1024 * 1024;   // batas berkas masukan 8 MB
const MAX_OUTPUT_BYTES = 700 * 1024;       // hasil akhir wajib < ~700 KB (aman utk Firestore)

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
    img.src = dataUrl;
  });
}

/**
 * Konversi File gambar menjadi data URL yang sudah diperkecil.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {number} [options.maxSize] Sisi terpanjang maksimum (px). Default 256.
 * @param {number} [options.quality] Kualitas kompresi 0-1. Default 0.85.
 * @returns {Promise<{dataUrl:string, bytes:number, width:number, height:number}>}
 */
export async function fileToLogoDataUrl(file, options = {}) {
  if (!(file instanceof File)) throw new Error('Berkas tidak valid.');
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Format tidak didukung. Gunakan PNG, JPG, WEBP, SVG, atau GIF.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Ukuran berkas melebihi 8 MB. Pilih gambar yang lebih kecil.');
  }

  const rawDataUrl = await readAsDataUrl(file);

  // SVG & GIF: simpan apa adanya (SVG tak perlu resize; GIF beranimasi rusak bila di-canvas).
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    const bytes = Math.ceil((rawDataUrl.length * 3) / 4);
    if (bytes > MAX_OUTPUT_BYTES) {
      throw new Error('Berkas terlalu besar untuk disimpan. Perkecil gambar (disarankan < 300 KB).');
    }
    return { dataUrl: rawDataUrl, bytes, width: 0, height: 0 };
  }

  const maxSize = Math.max(48, Math.min(Number(options.maxSize) || 256, 1024));
  const quality = Math.max(0.5, Math.min(Number(options.quality) || 0.85, 1));
  const img = await loadImage(rawDataUrl);

  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || maxSize) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || maxSize) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Peramban tidak mendukung pemrosesan gambar.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Utamakan WEBP (lebih kecil); fallback PNG bila tak didukung.
  let out = '';
  try { out = canvas.toDataURL('image/webp', quality); } catch { out = ''; }
  if (!out || out.indexOf('data:image/webp') !== 0) {
    out = canvas.toDataURL('image/png');
  }

  let bytes = Math.ceil((out.length * 3) / 4);
  // Bila masih besar, turunkan kualitas bertahap.
  let q = quality;
  while (bytes > MAX_OUTPUT_BYTES && q > 0.5) {
    q -= 0.15;
    try { out = canvas.toDataURL('image/webp', q); } catch { break; }
    bytes = Math.ceil((out.length * 3) / 4);
  }
  if (bytes > MAX_OUTPUT_BYTES) {
    throw new Error('Gambar terlalu detail untuk disimpan lokal. Coba logo yang lebih sederhana.');
  }

  return { dataUrl: out, bytes, width, height };
}
