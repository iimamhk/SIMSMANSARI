/**
 * Generator dokumen Word (.docx) asli dari data RPM.
 * Menggunakan JSZip untuk membuat paket OOXML.
 * Mendukung: judul, heading, paragraf, tabel, daftar (bullet/number),
 * tebal/miring, serta rumus matematika LaTeX -> OMML.
 */

import { latexToOmml } from './math-omml.js';

const ns = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  wpi: 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
  wne: 'http://schemas.microsoft.com/office/word/2010/wordml',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordmlShape',
};

function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlEscapeAttr(s) {
  return escXml(s).replace(/\r?\n/g, '&#xA;');
}

function el(name, attrs = {}, children = '') {
  let attrsStr = '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null && v !== '') {
      attrsStr += ` ${k}="${xmlEscapeAttr(v)}"`;
    }
  }
  const close = children ? '' : '/';
  let childStr = children;
  if (Array.isArray(children)) {
    childStr = children.join('');
  }
  return childStr
    ? `<${name}${attrsStr}>${childStr}</${name}>`
    : `<${name}${attrsStr}${close}>`;
}

// --- Numbering definitions for bullet and numbered lists ---
const NUMBERING_XML = el('w:numbering', { 'xmlns:w': ns.w }, [
  el('w:abstractNum', { 'w:abstractNumId': '0' }, [
    el('w:lvl', { 'w:ilvl': '0' }, [
      el('w:start', { 'w:val': '1' }),
      el('w:numFmt', { 'w:val': 'bullet' }),
      el('w:lvlText', { 'w:val': '•' }),
      el('w:lvlJc', { 'w:val': 'left' }),
      el('w:pPr', [
        el('w:ind', { 'w:left': '720', 'w:hanging': '360' }),
      ]),
    ]),
    el('w:lvl', { 'w:ilvl': '1' }, [
      el('w:start', { 'w:val': '1' }),
      el('w:numFmt', { 'w:val': 'bullet' }),
      el('w:lvlText', { 'w:val': '-' }),
      el('w:lvlJc', { 'w:val': 'left' }),
      el('w:pPr', [
        el('w:ind', { 'w:left': '1440', 'w:hanging': '360' }),
      ]),
    ]),
  ]),
  el('w:abstractNum', { 'w:abstractNumId': '1' }, [
    el('w:lvl', { 'w:ilvl': '0' }, [
      el('w:start', { 'w:val': '1' }),
      el('w:numFmt', { 'w:val': 'decimal' }),
      el('w:lvlText', { 'w:val': '%1.' }),
      el('w:lvlJc', { 'w:val': 'left' }),
      el('w:pPr', [
        el('w:ind', { 'w:left': '720', 'w:hanging': '360' }),
      ]),
    ]),
    el('w:lvl', { 'w:ilvl': '1' }, [
      el('w:start', { 'w:val': '1' }),
      el('w:numFmt', { 'w:val': 'lowerLetter' }),
      el('w:lvlText', { 'w:val': '%1.' }),
      el('w:lvlJc', { 'w:val': 'left' }),
      el('w:pPr', [
        el('w:ind', { 'w:left': '1440', 'w:hanging': '360' }),
      ]),
    ]),
  ]),
  el('w:num', { 'w:numId': '1' }, [
    el('w:abstractNumId', { 'w:val': '0' }),
  ]),
  el('w:num', { 'w:numId': '2' }, [
    el('w:abstractNumId', { 'w:val': '1' }),
  ]),
]);

function buildNumberingXml() {
  return NUMBERING_XML;
}

// --- Styles ---
function buildStylesXml() {
  return el('w:styles', { 'xmlns:w': ns.w }, [
    el('w:docDefaults', {}, [
      el('w:rPrDefault', {}, [
        el('w:rPr', {}, [
          el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman', 'w:cs': 'Times New Roman' }),
          el('w:sz', { 'w:val': '24' }),
          el('w:szCs', { 'w:val': '24' }),
        ]),
      ]),
    ]),
    el('w:latentStyles', {
      'w:count': '156',
    }),
    el('w:style', { 'w:type': 'paragraph', 'w:styleId': 'Normal', 'w:default': '1' }, [
      el('w:name', { 'w:val': 'Normal' }),
      el('w:qFormat', {}),
    ]),
  ]);
}

// --- Document settings ---
function buildDocSettingsXml() {
  return el('w:settings', { 'xmlns:w': ns.w }, [
    el('w:docGrid', { 'w:linePitch': '360' }),
  ]);
}

// --- Core properties ---
function buildCoreProps(title) {
  const now = new Date().toISOString();
  return el('cp:coreProperties', {
    'xmlns:cp': 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
    'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    'xmlns:dcterms': 'http://purl.org/dc/terms/',
    'xmlns:dcmitype': 'http://purl.org/dc/dcmitype/',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  }, [
    el('dc:title', escXml(title)),
    el('dc:creator', 'SIM SMANSARI'),
    el('cp:lastModifiedBy', 'SIM SMANSARI'),
    el('dcterms:created', { 'xsi:type': 'dcterms:W3CDTF' }, now),
    el('dcterms:modified', { 'xsi:type': 'dcterms:W3CDTF' }, now),
  ]);
}

// --- App properties ---
function buildAppProps() {
  return el('Properties', {
    'xmlns': 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
    'xmlns:vt': 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'
  }, [
    el('Application', 'Microsoft Word'),
    el('DocSecurity', '0'),
    el('ScaleCrop', 'false'),
    el('HeadingPairs', el('vt:vector', { 'vt:size': '2', 'baseType': 'variant' }, [
      el('vt:variant', el('vt:lpstr', 'Rencana Pembelajaran Mendalam')),
      el('vt:variant', el('vt:i4', '1')),
    ])),
    el('TitlesOfParts', el('vt:vector', { 'vt:size': '1', 'baseType': 'lpstr' }, [
      el('vt:lpstr', 'RPM')
    ])),
    el('Company', 'SIM SMANSARI'),
    el('LinksUpToDate', 'false'),
    el('SharedDoc', 'false'),
    el('HyperlinksChanged', 'false'),
    el('AppVersion', '16.0300'),
  ]);
}

// --- Convert markdown line to OOXML w:r elements (inline) ---
function inlineToOmml(text) {
  const parts = [];
  let pos = 0;
  let match;
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(pos, match.index);
    if (before) {
      parts.push(escapeRun(before));
    }
    const math = match[0];
    if (math.startsWith('$$') && math.endsWith('$$')) {
      const inner = math.slice(2, -2).trim();
      const omml = latexToOmml(inner);
      parts.push(omml);
    } else if (math.startsWith('$') && math.endsWith('$')) {
      const inner = math.slice(1, -1).trim();
      const omml = latexToOmml(inner);
      parts.push(omml);
    }
    pos = match.index + match.length;
  }
  if (pos < text.length) {
    const rest = text.slice(pos);
    if (rest) {
      parts.push(escapeRun(rest));
    }
  }
  return parts.join('');
}

function escapeRun(text) {
  const parts = [];
  let pos = 0;
  let stack = [];
  const len = text.length;
  while (pos < len) {
    if (text[pos] === '*' && pos + 1 < len && text[pos + 1] === '*') {
      if (stack.length && stack[stack.length - 1] === 'bold') {
        parts.push('</w:r>');
        stack.pop();
        pos += 2;
      } else {
        if (stack.length) parts.push('</w:r>');
        parts.push('<w:r><w:rPr><w:b/></w:rPr><w:t>');
        stack.push('bold');
        pos += 2;
      }
    } else if (text[pos] === '*') {
      if (stack.length && stack[stack.length - 1] === 'italic') {
        parts.push('</w:r>');
        stack.pop();
        pos += 1;
      } else {
        if (stack.length) parts.push('</w:r>');
        parts.push('<w:r><w:rPr><w:i/></w:rPr><w:t>');
        stack.push('italic');
        pos += 1;
      }
    } else {
      const ch = text[pos];
      if (ch === '<') {
        parts.push('&lt;');
      } else if (ch === '>') {
        parts.push('&gt;');
      } else if (ch === '&') {
        parts.push('&amp;');
      } else {
        parts.push(ch);
      }
      pos += 1;
    }
  }
  while (stack.length) {
    parts.push('</w:r>');
    stack.pop();
  }
  const joined = parts.join('');
  if (!joined) return '<w:r><w:t></w:t></w:r>';
  if (!joined.startsWith('<w:r>')) {
    return `<w:r><w:t>${joined}</w:t></w:r>`;
  }
  return joined;
}

function markdownToOoxmlParagraphs(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  const lines = markdown.split('\n').map(l => l.replace(/\r/g, ''));
  let i = 0;
  const paragraphs = [];

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') { i++; continue; }

    if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
      const tableRows = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l === '' || !l.startsWith('|') || !l.endsWith('|')) break;
        const content = l.slice(1, -1);
        const cells = content.split('|').map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      paragraphs.push(buildTableXml(tableRows));
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().slice(2).trim();
        const p = paragraphFromRuns([inlineToOmml(itemText)], { indentLeft: '720', indentFirstLine: '-360' });
        const pWithNum = p.replace('<w:p>', '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="720" w:firstLine="-360"/></w:pPr>');
        listItems.push(pWithNum);
        i++;
      }
      paragraphs.push(listItems.join(''));
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+[.)]\s+/, '');
        const p = paragraphFromRuns([inlineToOmml(itemText)], { indentLeft: '720', indentFirstLine: '-360' });
        const pWithNum = p.replace('<w:p>', '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr><w:ind w:left="720" w:firstLine="-360"/></w:pPr>');
        listItems.push(pWithNum);
        i++;
      }
      paragraphs.push(listItems.join(''));
      continue;
    }

    paragraphs.push(paragraphFromRuns([inlineToOmml(line)]));
    i++;
  }
  return paragraphs.join('');
}

function buildTableXml(rows, options = {}) {
  const { noBorder = false, hasHeader = false } = options;
  const borderSz = noBorder ? '0' : '4';
  const insideHSz = noBorder ? '0' : '4';
  const insideVSz = noBorder ? '0' : '4';

  const cellsXml = (rows || []).map((row, rowIdx) => {
    const isHeaderRow = hasHeader && rowIdx === 0;
    const cells = (row || []).map(cell => {
      const cellText = typeof cell === 'string' ? cell : (cell && cell.text) || '';
      const isHeader = isHeaderRow || (cell && cell.isHeader);

      const tcPrChildren = [
        el('w:tcW', { 'w:w': '0', 'w:type': 'dxa' }),
        el('w:tcMar', [
          el('w:top', { 'w:w': '120', 'w:type': 'dxa' }),
          el('w:left', { 'w:w': '120', 'w:type': 'dxa' }),
          el('w:bottom', { 'w:w': '120', 'w:type': 'dxa' }),
          el('w:right', { 'w:w': '120', 'w:type': 'dxa' }),
        ]),
        isHeader ? el('w:shd', { 'w:fill': 'F3F4F6', 'w:val': 'clear' }) : '',
      ];

      if (!noBorder) {
        tcPrChildren.push(el('w:tcBorders', [
          el('w:top', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
          el('w:left', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
          el('w:bottom', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
          el('w:right', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
        ]));
      }

      const cellContent = markdownToOoxmlParagraphs(cellText);
      return el('w:tc', {}, el('w:tcPr', {}, tcPrChildren.filter(Boolean).join('')) + cellContent);
    }).join('');

    return el('w:tr', {}, cells);
  }).join('');

  const tblBorders = noBorder ? '' : el('w:tblBorders', [
    el('w:top', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
    el('w:left', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
    el('w:bottom', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
    el('w:right', { 'w:val': 'single', 'w:sz': borderSz, 'w:space': '0', 'w:color': 'auto' }),
    el('w:insideH', { 'w:val': 'single', 'w:sz': insideHSz, 'w:space': '0', 'w:color': 'auto' }),
    el('w:insideV', { 'w:val': 'single', 'w:sz': insideVSz, 'w:space': '0', 'w:color': 'auto' }),
  ]);

  const numCols = (rows && rows[0]) ? rows[0].length : 0;

  return el('w:tbl', {}, [
    el('w:tblPr', [
      el('w:tblW', { 'w:w': '0', 'w:type': 'auto' }),
      tblBorders,
    ]),
    el('w:tblGrid', [...Array(numCols)].map(() => el('w:gridCol', { 'w:w': '2080' })).join('')),
    cellsXml,
  ]);
}

function buildSectionHeader(title) {
  return paragraphFromRuns([
    textRun(title.toUpperCase(), [
      el('w:rPr', [
        el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
        el('w:b', {}),
        el('w:sz', { 'w:val': '24' }),
        el('w:szCs', { 'w:val': '24' }),
      ]),
    ]),
  ], {
    shading: 'E5E5E5',
    border: { top: '000000', bottom: '000000', left: '000000', right: '000000', sz: '4' },
    spaceBefore: '200',
    spaceAfter: '200',
  });
}

// Override paragraphFromRuns to support extraProps
function textRun(text, rPr = []) {
  return `<w:r>${rPr.join('')}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
}

function paragraphFromRuns(runs, props = {}) {
  let pPr = '';
  if (props.align) pPr += `<w:jc w:val="${props.align}"/>`;
  if (props.indentLeft) pPr += `<w:ind w:left="${props.indentLeft}"/>`;
  if (props.indentRight) pPr += `<w:ind w:right="${props.indentRight}"/>`;
  if (props.indentFirstLine) pPr += `<w:ind w:firstLine="${props.indentFirstLine}"/>`;
  if (props.spaceBefore) pPr += `<w:spacing w:before="${props.spaceBefore}"/>`;
  if (props.spaceAfter) pPr += `<w:spacing w:after="${props.spaceAfter}"/>`;
  if (props.lineRule) pPr += `<w:spacing w:line="${props.lineValue}" w:lineRule="${props.lineRule}"/>`;
  if (props.keepNext) pPr += `<w:keepNext/>`;
  if (props.keepLines) pPr += `<w:keepLines/>`;
  if (props.pageBreakBefore) pPr += `<w:pageBreakBefore/>`;
  if (props.outlineLvl !== undefined) pPr += `<w:outlineLvl w:val="${props.outlineLvl}"/>`;
  if (props.shading) pPr += `<w:shd w:fill="${props.shading}" w:val="clear"/>`;
  if (props.border) {
    pPr += `<w:pBdr>`;
    if (props.border.top) pPr += `<w:top w:val="single" w:sz="${props.border.sz || '4'}" w:space="0" w:color="${props.border.top}"/>`;
    if (props.border.bottom) pPr += `<w:bottom w:val="single" w:sz="${props.border.sz || '4'}" w:space="0" w:color="${props.border.bottom}"/>`;
    if (props.border.left) pPr += `<w:left w:val="single" w:sz="${props.border.sz || '4'}" w:space="0" w:color="${props.border.left}"/>`;
    if (props.border.right) pPr += `<w:right w:val="single" w:sz="${props.border.sz || '4'}" w:space="0" w:color="${props.border.right}"/>`;
    pPr += `</w:pBdr>`;
  }
  const pPrTag = pPr ? `<w:pPr>${pPr}</w:pPr>` : '';
  const children = Array.isArray(runs) ? runs.join('') : runs;
  return `<w:p>${pPrTag}${children}</w:p>`;
}

function buildIdentityTable(meta) {
  const rows = [
    ['Satuan Pendidikan', ':', meta.namaSekolah || ''],
    ['Kelas / Fase', ':', `${meta.kelas || ''} / ${meta.fase || ''}`],
    ['Mata Pelajaran', ':', meta.mapel || ''],
    ['Semester', ':', meta.semester || ''],
    ['Guru Pengampu', ':', meta.namaGuru || ''],
    ['Tahun Ajaran', ':', meta.tahunPelajaran || ''],
    ['Alokasi Waktu', ':', meta.totalWaktu ? `${meta.totalWaktu} JP (${meta.alokasiWaktu || ''})` : (meta.alokasiWaktu || '')],
  ].filter(r => r[2]);

  if (!rows.length) return '';

  const cellsXml = rows.map(row => {
    return el('w:tr', {}, [
      el('w:tc', {}, [
        el('w:tcPr', [
          el('w:tcW', { 'w:w': '3500', 'w:type': 'dxa' }),
          el('w:tcMar', [
            el('w:top', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:left', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:bottom', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:right', { 'w:w': '120', 'w:type': 'dxa' }),
          ]),
        ]),
        el('w:p', {}, el('w:r', [
          el('w:rPr', [
            el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
            el('w:sz', { 'w:val': '24' }),
            el('w:szCs', { 'w:val': '24' }),
          ]),
          el('w:t', escXml(row[0])),
        ])),
      ]),
      el('w:tc', {}, [
        el('w:tcPr', [
          el('w:tcW', { 'w:w': '400', 'w:type': 'dxa' }),
          el('w:tcMar', [
            el('w:top', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:left', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:bottom', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:right', { 'w:w': '120', 'w:type': 'dxa' }),
          ]),
        ]),
        el('w:p', {}, el('w:r', [
          el('w:rPr', [
            el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
            el('w:sz', { 'w:val': '24' }),
            el('w:szCs', { 'w:val': '24' }),
          ]),
          el('w:t', escXml(row[1])),
        ])),
      ]),
      el('w:tc', {}, [
        el('w:tcPr', [
          el('w:tcW', { 'w:w': '6880', 'w:type': 'dxa' }),
          el('w:tcMar', [
            el('w:top', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:left', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:bottom', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:right', { 'w:w': '120', 'w:type': 'dxa' }),
          ]),
        ]),
        el('w:p', {}, el('w:r', [
          el('w:rPr', [
            el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
            el('w:sz', { 'w:val': '24' }),
            el('w:szCs', { 'w:val': '24' }),
          ]),
          el('w:t', escXml(row[2])),
        ])),
      ]),
    ].join(''));
  }).join('');

  return el('w:tbl', {}, [
    el('w:tblPr', [
      el('w:tblW', { 'w:w': '10000', 'w:type': 'dxa' }),
    ]),
    el('w:tblGrid', [
      el('w:gridCol', { 'w:w': '3500' }),
      el('w:gridCol', { 'w:w': '400' }),
      el('w:gridCol', { 'w:w': '6880' }),
    ].join('')),
    cellsXml,
  ]);
}

function formatDateIndonesian(isoDate, kabupaten) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  const year = parts[0];
  const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
  const day = parts[2] ? parseInt(parts[2], 10) : 1;
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const loc = kabupaten ? `${kabupaten}, ` : '';
  return `${loc}${day} ${months[month] || ''} ${year}`;
}

function buildSignatureTable(meta) {
  const rows = [
    ['Mengetahui,', formatDateIndonesian(meta.tanggalPengesahan, meta.kabupaten)],
    ['Kepala Sekolah', 'Guru Mata Pelajaran'],
    ['', ''],
    [meta.namaKepala || '', meta.namaGuru || ''],
    [meta.nipKepala ? `NIP. ${meta.nipKepala}` : '', meta.nipGuru ? `NIP. ${meta.nipGuru}` : ''],
  ];

  const cellsXml = rows.map(row => {
    return el('w:tr', {}, [
      el('w:tc', {}, [
        el('w:tcPr', [
          el('w:tcW', { 'w:w': '5000', 'w:type': 'dxa' }),
          el('w:tcMar', [
            el('w:top', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:left', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:bottom', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:right', { 'w:w': '120', 'w:type': 'dxa' }),
          ]),
        ]),
        el('w:p', {}, el('w:r', [
          el('w:rPr', [
            el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
            el('w:sz', { 'w:val': '24' }),
            el('w:szCs', { 'w:val': '24' }),
          ]),
          el('w:t', escXml(row[0])),
        ])),
      ]),
      el('w:tc', {}, [
        el('w:tcPr', [
          el('w:tcW', { 'w:w': '5000', 'w:type': 'dxa' }),
          el('w:tcMar', [
            el('w:top', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:left', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:bottom', { 'w:w': '120', 'w:type': 'dxa' }),
            el('w:right', { 'w:w': '120', 'w:type': 'dxa' }),
          ]),
        ]),
        el('w:p', {}, el('w:r', [
          el('w:rPr', [
            el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
            el('w:sz', { 'w:val': '24' }),
            el('w:szCs', { 'w:val': '24' }),
          ]),
          el('w:t', escXml(row[1])),
        ])),
      ]),
    ].join(''));
  }).join('');

  return el('w:tbl', {}, [
    el('w:tblPr', [
      el('w:tblW', { 'w:w': '10000', 'w:type': 'dxa' }),
    ]),
    el('w:tblGrid', [
      el('w:gridCol', { 'w:w': '5000' }),
      el('w:gridCol', { 'w:w': '5000' }),
    ].join('')),
    cellsXml,
  ]);
}

function buildDocumentXml(meta, sections) {
  let body = '';

  body += paragraphFromRuns([
    textRun('RENCANA PEMBELAJARAN MENDALAM (RPM)', [
      el('w:rPr', [
        el('w:rFonts', { 'w:ascii': 'Times New Roman', 'w:hAnsi': 'Times New Roman' }),
        el('w:b', {}),
        el('w:sz', { 'w:val': '32' }),
        el('w:szCs', { 'w:val': '32' }),
      ]),
    ]),
  ], {
    align: 'center',
    spaceAfter: '200',
  });

  body += buildIdentityTable(meta);

  for (const sec of sections) {
    const isPengesahan = sec.title.toLowerCase().includes('pengesahan');
    const isIdentitas = sec.title.toLowerCase().includes('identitas rpm');
    if (isIdentitas) continue;
    body += buildSectionHeader(sec.title);

    if (isPengesahan) {
      body += buildSignatureTable(meta);
    } else {
      body += markdownToOoxmlParagraphs(sec.content);
    }
  }

  return el('w:document', {
    'xmlns:w': ns.w,
    'xmlns:r': ns.r,
    'xmlns:m': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'xmlns:w14': ns.w14,
    'xmlns:w15': ns.w15,
    'xmlns:wp': ns.wp,
  }, el('w:body', {}, body + el('w:sectPr', {}, [
    el('w:pgSz', { 'w:w': '12240', 'w:h': '15840' }),
    el('w:pgMar', { 'w:top': '1440', 'w:right': '1440', 'w:bottom': '1440', 'w:left': '1440', 'w:header': '720', 'w:footer': '720', 'w:gutter': '0' }),
    el('w:cols', { 'w:space': '720' }),
    el('w:docGrid', { 'w:linePitch': '360' }),
  ])));
}

// --- Main entry ---
export async function buildDocxFromRpm(data) {
  const title = data.title || 'Rencana Pembelajaran Mendalam';
  const sections = data.sections || [];
  const meta = data.meta || {};
  // Build parts
  const docPropsCore = buildCoreProps(title);
  const docPropsApp = buildAppProps();
  const docSettings = buildDocSettingsXml();
  const numbering = buildNumberingXml();
  const styles = buildStylesXml();
  const documentXml = buildDocumentXml(meta, sections);

  const relsRels = el('Relationships', {
    'xmlns': 'http://schemas.openxmlformats.org/package/2006/relationships'
  }, [
    el('Relationship', { 'Id': 'rId1', 'Type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument', 'Target': 'word/document.xml' }),
    el('Relationship', { 'Id': 'rId2', 'Type': 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'Target': 'docProps/core.xml' }),
    el('Relationship', { 'Id': 'rId3', 'Type': 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/extended-properties', 'Target': 'docProps/app.xml' }),
  ]);

  const docRelations = el('Relationships', {
    'xmlns': 'http://schemas.openxmlformats.org/package/2006/relationships'
  }, [
    el('Relationship', { 'Id': 'rId1', 'Type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', 'Target': 'styles.xml' }),
    el('Relationship', { 'Id': 'rId2', 'Type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering', 'Target': 'numbering.xml' }),
    el('Relationship', { 'Id': 'rId3', 'Type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', 'Target': 'settings.xml' }),
  ]);

  const contentTypes = el('Types', {
    'xmlns': 'http://schemas.openxmlformats.org/package/2006/content-types'
  }, [
    el('Default', { 'Extension': 'rels', 'ContentType': 'application/vnd.openxmlformats-package.relationships+xml' }),
    el('Default', { 'Extension': 'xml', 'ContentType': 'application/xml' }),
    el('Default', { 'Extension': 'png', 'ContentType': 'image/png' }),
    el('Override', { 'PartName': '/word/document.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' }),
    el('Override', { 'PartName': '/word/styles.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml' }),
    el('Override', { 'PartName': '/word/numbering.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml' }),
    el('Override', { 'PartName': '/word/settings.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml' }),
    el('Override', { 'PartName': '/docProps/core.xml', 'ContentType': 'application/vnd.openxmlformats-package.core-properties+xml' }),
    el('Override', { 'PartName': '/docProps/app.xml', 'ContentType': 'application/vnd.openxmlformats-package.extended-properties+xml' }),
  ]);

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', relsRels);
  zip.file('word/_rels/document.xml.rels', docRelations);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', styles);
  zip.file('word/numbering.xml', numbering);
  zip.file('docProps/core.xml', docPropsCore);
  zip.file('docProps/app.xml', docPropsApp);
  zip.file('word/settings.xml', docSettings);

  const content = await zip.generateAsync({ type: 'blob' });
  return new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
