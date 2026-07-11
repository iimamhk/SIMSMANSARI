/**
 * Utilitas render Markdown dan ekspor dokumen (Word / PDF).
 * Menggunakan library global dari CDN: marked, DOMPurify, html2canvas, jsPDF, KaTeX.
 */

let katexReadyPromise = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bagian';
}

function normalizeSectionBucket(title) {
  const text = String(title || '').trim().toLowerCase();
  if (!text) return 'materi';
  if (/(tujuan|capaian|indikator|kompetensi)/.test(text)) return 'tujuan';
  if (/(contoh|pembahasan)/.test(text)) return 'contoh';
  if (/(latihan|kuis|cek pemahaman|uji pemahaman)/.test(text)) return 'latihan';
  if (/(tugas|evaluasi|asesmen|proyek)/.test(text)) return 'tugas';
  if (/(ringkasan|catatan|refleksi|kesimpulan|glosarium)/.test(text)) return 'catatan';
  return 'materi';
}

function renderMathInHtml(html) {
  if (!window.katex?.renderToString) {
    return html;
  }

  let output = String(html || '');

  output = output.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    try {
      return `<div class="math-display">${window.katex.renderToString(String(formula || '').trim(), {
        displayMode: true,
        throwOnError: false,
        trust: true,
      })}</div>`;
    } catch (error) {
      console.warn('KaTeX display error:', error?.message || error);
      return match;
    }
  });

  output = output.replace(/\$(?!\$)([^$\n]+?)\$(?!\$)/g, (match, formula) => {
    try {
      return `<span class="math-inline">${window.katex.renderToString(String(formula || '').trim(), {
        displayMode: false,
        throwOnError: false,
        trust: true,
      })}</span>`;
    } catch (error) {
      console.warn('KaTeX inline error:', error?.message || error);
      return match;
    }
  });

  return output;
}

function getInteractiveMaterialStyles() {
  return `
    :root { color-scheme: light; --mai-bg:#f8fafc; --mai-card:rgba(255,255,255,0.94); --mai-ink:#0f172a; --mai-muted:#475569; --mai-line:#dbeafe; --mai-brand:#2563eb; --mai-brand-2:#7c3aed; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter,Segoe UI,Arial,sans-serif; background:radial-gradient(circle at top left, rgba(59,130,246,.18), transparent 28%), radial-gradient(circle at top right, rgba(124,58,237,.16), transparent 26%), var(--mai-bg); color:var(--mai-ink); }
    .mai-page { max-width:1100px; margin:0 auto; padding:24px 16px 40px; }
    .mai-reader-shell { display:grid; gap:18px; }
    .mai-hero-card, .mai-section-card, .mai-tabs-card { background:var(--mai-card); border:1px solid rgba(191,219,254,.9); border-radius:24px; box-shadow:0 18px 50px -28px rgba(37,99,235,.28); }
    .mai-hero-card { padding:24px; background:linear-gradient(135deg, rgba(37,99,235,.96), rgba(124,58,237,.92)); color:#fff; }
    .mai-eyebrow { margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:rgba(255,255,255,.76); }
    .mai-hero-card h1 { margin:0; font-size:clamp(1.8rem, 4vw, 2.6rem); line-height:1.1; }
    .mai-subtitle { margin:10px 0 0; color:rgba(255,255,255,.84); }
    .mai-meta-grid { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
    .mai-chip { display:inline-flex; align-items:center; border-radius:999px; padding:7px 12px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.16); font-size:12px; font-weight:700; }
    .mai-section-card, .mai-tabs-card { padding:20px; }
    .mai-tabs-nav { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .mai-tab-btn { border:0; border-radius:999px; padding:10px 14px; background:#e2e8f0; color:#334155; font-weight:700; cursor:pointer; transition:.2s ease; }
    .mai-tab-btn.is-active { background:linear-gradient(135deg, var(--mai-brand), var(--mai-brand-2)); color:#fff; box-shadow:0 12px 28px -18px rgba(37,99,235,.8); }
    .mai-tab-panel, .mai-section-card { line-height:1.7; color:#1e293b; }
    .mai-tab-panel p, .mai-section-card p { margin:.65em 0; }
    .mai-tab-panel ul, .mai-tab-panel ol, .mai-section-card ul, .mai-section-card ol { padding-left:1.25rem; }
    .mai-tab-panel blockquote, .mai-section-card blockquote { margin:1rem 0; padding:12px 16px; border-left:4px solid var(--mai-brand); background:#eff6ff; border-radius:0 16px 16px 0; }
    .mai-tab-panel table, .mai-section-card table { width:100%; border-collapse:collapse; margin:1rem 0; }
    .mai-tab-panel th, .mai-tab-panel td, .mai-section-card th, .mai-section-card td { border:1px solid #cbd5e1; padding:10px 12px; text-align:left; }
    .mai-tab-panel th, .mai-section-card th { background:#eff6ff; }
    .mai-empty-box { border:1px dashed #cbd5e1; background:#f8fafc; border-radius:18px; padding:16px; color:#475569; }
    .math-display { overflow-x:auto; margin:1rem 0; border-radius:18px; padding:14px 16px; background:#f8fafc; border:1px solid #dbeafe; }
    .math-inline { display:inline-flex; max-width:100%; overflow-x:auto; vertical-align:middle; }
    @media (max-width:720px) { .mai-page { padding:16px 12px 28px; } .mai-hero-card, .mai-section-card, .mai-tabs-card { border-radius:20px; } .mai-section-card, .mai-tabs-card { padding:16px; } .mai-tab-btn { width:100%; justify-content:center; } }
  `;
}

function splitMarkdownSections(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const titleMatch = text.match(/^\s*#\s+(.+)$/m);
  const firstHeadingIndex = lines.findIndex((line) => /^#{2,3}\s+/.test(line));
  const titleLineIndex = lines.findIndex((line) => /^\s*#\s+/.test(line));
  const intro = lines.slice(titleLineIndex + 1, firstHeadingIndex > -1 ? firstHeadingIndex : lines.length).join('\n').trim();

  const sections = [];
  let current = { title: '', level: 0, lines: [] };

  lines.forEach((line) => {
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      if (current.title || current.lines.length) {
        sections.push({ ...current, content: current.lines.join('\n').trim() });
      }
      current = { title: heading[2].trim(), level: heading[1].length, lines: [] };
      return;
    }
    current.lines.push(line);
  });

  if (current.title || current.lines.length) {
    sections.push({ ...current, content: current.lines.join('\n').trim() });
  }

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    intro,
    sections: sections.filter((section) => section.title || section.content),
  };
}

function buildPanelMarkup(label, content, emptyMessage) {
  if (String(content || '').trim()) {
    return content;
  }
  return `<div class="mai-empty-box"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(emptyMessage)}</p></div>`;
}

export async function ensureKaTeXReady() {
  if (window.katex?.renderToString) {
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  if (!document.querySelector('link[data-katex-runtime="true"]') && !document.querySelector('link[href*="katex.min.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
    link.setAttribute('data-katex-runtime', 'true');
    document.head.appendChild(link);
  }

  if (!katexReadyPromise) {
    katexReadyPromise = new Promise((resolve) => {
      const existingScript = document.querySelector('script[data-katex-runtime="true"], script[src*="katex.min.js"]');
      const finish = () => resolve(Boolean(window.katex?.renderToString));

      if (existingScript) {
        if (window.katex?.renderToString) {
          finish();
          return;
        }
        existingScript.addEventListener('load', finish, { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
      script.async = true;
      script.setAttribute('data-katex-runtime', 'true');
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(script);
    }).finally(() => {
      if (!window.katex?.renderToString) {
        katexReadyPromise = null;
      }
    });
  }

  return katexReadyPromise;
}

/**
 * Render markdown dengan LaTeX ke HTML.
 * @param {string} markdown - Raw markdown text dengan LaTeX
 * @returns {string} HTML dengan LaTeX ter-render bila KaTeX sudah siap
 */
export function renderMarkdown(markdown) {
  const raw = String(markdown || '');
  if (!raw.trim()) return '';

  let html = raw;
  try {
    if (window.marked && typeof window.marked.parse === 'function') {
      window.marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false,
      });
      html = window.marked.parse(raw);
    }
  } catch (error) {
    console.warn('Gagal merender markdown:', error);
  }

  html = renderMathInHtml(html);

  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    html = window.DOMPurify.sanitize(html, {
      ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'span', 'div', 'mfrac', 'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'msqrt', 'mroot', 'mtext', 'mspace'],
      ADD_ATTR: ['encoding', 'aria-hidden', 'style', 'class', 'xmlns'],
    });
  }

  return html;
}

/**
 * Legacy function - kept for backward compatibility.
 */
export function renderMathInElement() {
  return;
}

export function buildInteractiveMaterialBody({ title, markdown, meta = {} }) {
  const parsed = splitMarkdownSections(markdown);
  const groupId = `mai_${slugify(title || parsed.title)}_${Math.random().toString(36).slice(2, 7)}`;
  const buckets = { tujuan: [], materi: [], contoh: [], latihan: [], tugas: [], catatan: [] };

  if (parsed.intro) {
    buckets.materi.push(renderMarkdown(parsed.intro));
  }

  parsed.sections.forEach((section) => {
    const bucket = normalizeSectionBucket(section.title);
    const headingTag = section.level >= 3 ? 'h3' : 'h2';
    const heading = section.title ? `<${headingTag}>${escapeHtml(section.title)}</${headingTag}>` : '';
    const content = section.content ? renderMarkdown(section.content) : '';
    buckets[bucket].push(`${heading}${content}`);
  });

  const tabs = [
    { key: 'materi', label: 'Materi', content: buckets.materi.join('') },
    { key: 'contoh', label: 'Contoh Soal', content: buckets.contoh.join('') },
    { key: 'latihan', label: 'Latihan', content: buckets.latihan.join('') },
    { key: 'tugas', label: 'Tugas', content: buckets.tugas.join('') },
    { key: 'catatan', label: 'Ringkasan', content: buckets.catatan.join('') || buckets.tujuan.join('') },
  ];

  return `
    <style>${getInteractiveMaterialStyles()}</style>
    <section class="mai-reader-shell" data-mai-tab-group="${groupId}">
      <div class="mai-hero-card">
        <div>
          <p class="mai-eyebrow">Materi Interaktif</p>
          <h1>${escapeHtml(title || parsed.title || 'Materi Pembelajaran')}</h1>
          <p class="mai-subtitle">${escapeHtml(meta.subject || meta.mapel || '-')} • Kelas ${escapeHtml(meta.className || meta.kelas || '-')} • ${escapeHtml(meta.level || meta.fase || '-')}</p>
        </div>
        <div class="mai-meta-grid">
          <span class="mai-chip">Bab: ${escapeHtml(meta.chapter || meta.bab || '-')}</span>
          <span class="mai-chip">Alokasi: ${escapeHtml(meta.meetings || meta.alokasiWaktu || '-')}</span>
          <span class="mai-chip">Multi Tab</span>
          <span class="mai-chip">Rumus Siap</span>
        </div>
      </div>
      <div class="mai-section-card">
        <h2>Tujuan Pembelajaran</h2>
        ${buildPanelMarkup('Tujuan Pembelajaran', buckets.tujuan.join(''), 'AI belum membuat tujuan pembelajaran terpisah. Lengkapi dari editor agar hasil lebih rapi untuk siswa.')}
      </div>
      <div class="mai-tabs-card">
        <div class="mai-tabs-nav" role="tablist" aria-label="Navigasi materi">
          ${tabs.map((tab, index) => `<button type="button" class="mai-tab-btn${index === 0 ? ' is-active' : ''}" data-mai-tab-target="${groupId}_${tab.key}" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>`).join('')}
        </div>
        ${tabs.map((tab, index) => `<section class="mai-tab-panel" data-mai-tab-panel="${groupId}_${tab.key}" ${index === 0 ? '' : 'hidden'}>${buildPanelMarkup(tab.label, tab.content, `Bagian ${tab.label} belum tersedia. Tambahkan dari editor agar materi lengkap.`)}</section>`).join('')}
      </div>
    </section>
  `;
}

export function buildInteractiveMaterialHtml({ title, markdown, meta = {} }) {
  const body = buildInteractiveMaterialBody({ title, markdown, meta });
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || 'Materi Pembelajaran')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
</head>
<body>
<main class="mai-page">${body}</main>
<script>
document.addEventListener('click', function (event) {
  var button = event.target.closest('[data-mai-tab-target]');
  if (!button) return;
  var group = button.closest('[data-mai-tab-group]');
  if (!group) return;
  var target = button.getAttribute('data-mai-tab-target');
  group.querySelectorAll('[data-mai-tab-target]').forEach(function (item) {
    var active = item.getAttribute('data-mai-tab-target') === target;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  group.querySelectorAll('[data-mai-tab-panel]').forEach(function (panel) {
    panel.hidden = panel.getAttribute('data-mai-tab-panel') !== target;
  });
});
</script>
</body>
</html>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name) {
  return (String(name || 'materi').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'materi').slice(0, 80);
}

function buildWordDocument(title, html) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 900px; margin: 32px auto; padding: 0 24px; }
  h1,h2,h3,h4 { color: #111827; margin-top: 1.2em; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
  th { background: #eef2ff; }
  pre { background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 10px; overflow-x: auto; }
  blockquote { border-left: 4px solid #6366f1; margin: 12px 0; padding: 8px 14px; background: #f8fafc; color: #334155; }
  img { max-width: 100%; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

export function exportToWord(title, html) {
  const document = buildWordDocument(title, html);
  const blob = new Blob(['﻿', document], { type: 'application/msword' });
  triggerDownload(blob, `${sanitizeFilename(title)}.doc`);
}

export async function exportToPdf(title, sourceElement) {
  if (!sourceElement) return false;
  if (!window.html2canvas || !window.jspdf) {
    throw new Error('Library ekspor PDF belum dimuat.');
  }

  const canvas = await window.html2canvas(sourceElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  const imgData = canvas.toDataURL('image/png');

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${sanitizeFilename(title)}.pdf`);
  return true;
}

export function extractTitleFromMarkdown(markdown) {
  const match = String(markdown || '').match(/^\s*#\s+(.+)$/m);
  return match ? match[1].trim() : 'Materi Pembelajaran';
}
