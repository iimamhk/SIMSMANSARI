/**
 * Utilitas render Markdown dan ekspor dokumen (Word / PDF).
 * Menggunakan library global dari CDN: marked, DOMPurify, html2canvas, jsPDF.
 */

export function renderMarkdown(markdown) {
  const raw = String(markdown || '');
  if (!raw.trim()) return '';

  let html = raw;
  try {
    if (window.marked && typeof window.marked.parse === 'function') {
      html = window.marked.parse(raw);
    }
  } catch (error) {
    console.warn('Gagal merender markdown:', error);
  }

  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    html = window.DOMPurify.sanitize(html, {
      ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn'],
      ADD_ATTR: ['encoding', 'aria-hidden', 'style'],
    });
  }

  return html;
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
