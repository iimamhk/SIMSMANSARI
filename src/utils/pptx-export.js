/**
 * Generator presentasi PowerPoint (.pptx) di sisi klien.
 * Menggunakan pustaka PptxGenJS (dimuat via CDN sebagai global `PptxGenJS`).
 *
 * Alur:
 *   markdown hasil AI  ->  parseSlidesFromMarkdown()  ->  deck slide  ->  exportToPptx()
 *
 * Kontrak markdown yang diharapkan dari AI:
 *   # Judul Presentasi
 *   Subjudul singkat (opsional, satu baris)
 *
 *   ## Judul Slide 1
 *   - poin penting
 *   - poin penting
 *   > Catatan: catatan pembicara opsional
 *
 *   ## Judul Slide 2
 *   ...
 */

/**
 * Palet tema presentasi. `bg` latar slide, `title` warna judul,
 * `accent` bilah aksen, `text` warna isi, `band` warna teks di atas aksen.
 * Semua warna HEX tanpa tanda pagar (format PptxGenJS).
 */
export const PPT_THEMES = {
  profesional: { label: 'Profesional (Biru)', bg: 'FFFFFF', title: '1E3A8A', accent: '2563EB', text: '1E293B', band: 'FFFFFF', muted: '64748B' },
  energik: { label: 'Energik (Oranye)', bg: 'FFFFFF', title: 'B91C1C', accent: 'F97316', text: '1F2937', band: 'FFFFFF', muted: '6B7280' },
  segar: { label: 'Segar (Hijau)', bg: 'FFFFFF', title: '065F46', accent: '059669', text: '14342B', band: 'FFFFFF', muted: '4B5563' },
  ungu: { label: 'Kreatif (Ungu)', bg: 'FFFFFF', title: '5B21B6', accent: '7C3AED', text: '2E1065', band: 'FFFFFF', muted: '6B7280' },
  gelap: { label: 'Elegan (Gelap)', bg: '0F172A', title: '38BDF8', accent: '0EA5E9', text: 'E2E8F0', band: 'F8FAFC', muted: '94A3B8' },
  kalem: { label: 'Kalem (Teal)', bg: 'F8FAFC', title: '0F766E', accent: '14B8A6', text: '134E4A', band: 'FFFFFF', muted: '64748B' },
};

export const DEFAULT_THEME = 'profesional';

function resolveTheme(name) {
  return PPT_THEMES[String(name || '').toLowerCase()] || PPT_THEMES[DEFAULT_THEME];
}

/** Bersihkan penanda markdown inline sederhana agar rapi di slide. */
function stripInline(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s+$/, '')
    .trim();
}

function isBulletLine(line) {
  return /^\s*[-*+•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
}

function bulletLevel(line) {
  const match = line.match(/^(\s*)/);
  const indent = match ? match[1].replace(/\t/g, '  ').length : 0;
  return indent >= 2 ? 1 : 0;
}

function cleanBullet(line) {
  return stripInline(line.replace(/^\s*[-*+•]\s+/, '').replace(/^\s*\d+[.)]\s+/, ''));
}

/**
 * Ubah markdown menjadi daftar slide terstruktur.
 * @param {string} markdown
 * @returns {{ kind:'title'|'content', title:string, subtitle?:string, items?:Array<{text:string,level:number,bullet:boolean}>, note?:string }[]}
 */
export function parseSlidesFromMarkdown(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');

  const slides = [];
  let title = null; // slide judul
  let current = null; // slide konten aktif
  const subtitleParts = [];

  const flush = () => {
    if (current) {
      slides.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    // Judul presentasi (H1) -> slide judul, hanya yang pertama dipakai.
    if (/^#\s+/.test(trimmed) && !/^##/.test(trimmed)) {
      flush();
      if (!title) title = { kind: 'title', title: stripInline(trimmed), subtitle: '' };
      continue;
    }

    // Judul slide (H2) -> mulai slide konten baru.
    if (/^##\s+/.test(trimmed) && !/^###/.test(trimmed)) {
      flush();
      current = { kind: 'content', title: stripInline(trimmed), items: [], note: '' };
      continue;
    }

    if (!trimmed) continue;

    // Catatan pembicara.
    if (/^>\s*/.test(trimmed)) {
      const noteText = stripInline(trimmed.replace(/^>\s*/, '').replace(/^catatan\s*:?\s*/i, ''));
      if (current && noteText) current.note = current.note ? `${current.note}\n${noteText}` : noteText;
      continue;
    }

    if (!current) {
      // Baris sebelum slide konten pertama = subjudul presentasi.
      if (!/^#{1,6}\s+/.test(trimmed)) subtitleParts.push(stripInline(trimmed));
      continue;
    }

    // Subheading (H3) di dalam slide -> poin penekanan.
    if (/^###\s+/.test(trimmed)) {
      current.items.push({ text: stripInline(trimmed), level: 0, bullet: false });
      continue;
    }

    if (isBulletLine(line)) {
      const bulletText = cleanBullet(line);
      if (bulletText) current.items.push({ text: bulletText, level: bulletLevel(line), bullet: true });
      continue;
    }

    // Paragraf biasa -> baris teks tanpa bullet (penekanan).
    const paragraph = stripInline(trimmed);
    if (paragraph) current.items.push({ text: paragraph, level: 0, bullet: false });
  }

  flush();

  if (title) {
    if (!title.subtitle && subtitleParts.length) title.subtitle = subtitleParts.filter(Boolean).join(' — ');
    slides.unshift(title);
  }

  return slides;
}

function ensureLibrary() {
  const Ctor = typeof window !== 'undefined' ? window.PptxGenJS : undefined;
  if (typeof Ctor !== 'function') {
    throw new Error('Pustaka PptxGenJS belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
  }
  return Ctor;
}

function sanitizeFileName(name) {
  const base = String(name || 'Presentasi').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'Presentasi').slice(0, 120);
}

/**
 * Bangun dan unduh file .pptx dari daftar slide.
 * @param {string} fileName nama file tanpa ekstensi
 * @param {ReturnType<typeof parseSlidesFromMarkdown>} slides
 * @param {{ theme?:string, footer?:string, author?:string }} [opts]
 */
export async function exportToPptx(fileName, slides, opts = {}) {
  const PptxGenJS = ensureLibrary();
  const list = Array.isArray(slides) ? slides.filter(Boolean) : [];
  if (!list.length) throw new Error('Belum ada slide untuk diekspor.');

  const theme = resolveTheme(opts.theme);
  const footer = String(opts.footer || '').trim();

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'SIM_WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'SIM_WIDE';
  pptx.author = String(opts.author || 'SIM SMANSARI');
  pptx.company = footer || 'SIM SMANSARI';
  pptx.title = sanitizeFileName(fileName);

  const W = 13.333;
  const H = 7.5;

  let slideNo = 0;
  const totalContent = list.filter((s) => s.kind !== 'title').length;

  for (const item of list) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.bg };

    if (item.kind === 'title') {
      // Bilah aksen bawah sebagai bingkai judul.
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 1.9, w: W, h: 1.9, fill: { color: theme.accent }, line: { color: theme.accent } });
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 2.0, w: 1.1, h: 0.16, fill: { color: theme.accent }, line: { color: theme.accent } });
      slide.addText(String(item.title || 'Presentasi'), {
        x: 0.9, y: 2.3, w: W - 1.8, h: 1.9,
        fontSize: 40, bold: true, color: theme.title, align: 'left', valign: 'top', fontFace: 'Calibri',
      });
      if (item.subtitle) {
        slide.addText(String(item.subtitle), {
          x: 0.92, y: 4.15, w: W - 1.8, h: 1.2,
          fontSize: 20, color: theme.muted, align: 'left', valign: 'top', fontFace: 'Calibri',
        });
      }
      if (footer) {
        slide.addText(footer, {
          x: 0.9, y: H - 1.35, w: W - 1.8, h: 0.9,
          fontSize: 16, color: theme.band, align: 'left', valign: 'middle', fontFace: 'Calibri',
        });
      }
      continue;
    }

    slideNo += 1;

    // Bilah judul atas.
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.15, fill: { color: theme.accent }, line: { color: theme.accent } });
    slide.addText(String(item.title || `Slide ${slideNo}`), {
      x: 0.55, y: 0, w: W - 2.2, h: 1.15,
      fontSize: 24, bold: true, color: theme.band, align: 'left', valign: 'middle', fontFace: 'Calibri',
    });

    // Isi slide sebagai teks berbutir.
    const items = Array.isArray(item.items) ? item.items : [];
    if (items.length) {
      const textRuns = items.map((it, idx) => ({
        text: String(it.text || ''),
        options: {
          bullet: it.bullet ? { indent: 16 } : false,
          indentLevel: it.level || 0,
          fontSize: it.bullet ? 18 : 20,
          bold: !it.bullet,
          color: theme.text,
          breakLine: true,
          paraSpaceAfter: idx === items.length - 1 ? 0 : 8,
        },
      }));
      slide.addText(textRuns, {
        x: 0.7, y: 1.45, w: W - 1.4, h: H - 2.1,
        align: 'left', valign: 'top', fontFace: 'Calibri', fit: 'shrink',
      });
    }

    // Footer + nomor slide.
    if (footer) {
      slide.addText(footer, { x: 0.55, y: H - 0.5, w: W - 2.0, h: 0.4, fontSize: 10, color: theme.muted, align: 'left', valign: 'middle', fontFace: 'Calibri' });
    }
    slide.addText(`${slideNo} / ${totalContent}`, { x: W - 1.7, y: H - 0.5, w: 1.3, h: 0.4, fontSize: 10, color: theme.muted, align: 'right', valign: 'middle', fontFace: 'Calibri' });

    if (item.note) slide.addNotes(String(item.note));
  }

  const data = await pptx.write({ outputType: 'arraybuffer' });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFileName(fileName)}.pptx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
