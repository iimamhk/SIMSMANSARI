/**
 * Konverter LaTeX sederhana -> OMML (Office Math) untuk dokumen Word.
 * Mendukung: pecahan, pangkat, akar, integral, sigma, limit, vektor,
 * logaritma, fungsi trigonometri, notasi himpunan, matriks/determinan,
 * huruf yunani, dan operator matematika umum.
 * Hasil berupa XML di dalam <m:oMath>...</m:oMath>.
 */

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'lg', 'exp', 'deg', 'arg', 'det', 'dim', 'ker', 'gcd', 'lcm',
]);

const SYMBOLS = {
  'cdot': '·', 'times': '×', 'div': '÷', 'pm': '±', 'mp': '∓',
  'leq': '≤', 'le': '≤', 'geq': '≥', 'ge': '≥', 'neq': '≠', 'ne': '≠',
  'approx': '≈', 'equiv': '≡', 'sim': '∼', 'cong': '≅', 'propto': '∝',
  'to': '→', 'rightarrow': '→', 'leftarrow': '←', 'leftrightarrow': '↔',
  'Rightarrow': '⇒', 'Leftarrow': '⇐', 'iff': '⇔', 'mapsto': '↦',
  'infty': '∞', 'partial': '∂', 'nabla': '∇', 'angle': '∠', 'perp': '⊥',
  'parallel': '∥', 'prime': '′', 'circ': '∘', 'oplus': '⊕', 'otimes': '⊗',
  'forall': '∀', 'exists': '∃', 'nexists': '∄', 'in': '∈', 'notin': '∉',
  'subset': '⊂', 'subseteq': '⊆', 'supset': '⊃', 'supseteq': '⊇',
  'cup': '∪', 'cap': '∩', 'emptyset': '∅', 'varnothing': '∅', 'setminus': '∖',
'langle': '⟨', 'rangle': '⟩', 'quad': ' ', 'qquad': '  ', 'ldots': '…',
'cdots': '⋯', 'vdots': '⋮', 'ddots': '⋱', 'dots': '…',
  'angle': '∠', 'triangle': '△', 'square': '□', 'star': '⋆', 'ast': '∗',
  'neg': '¬', 'wedge': '∧', 'vee': '∨', 'oplus': '⊕', 'otimes': '⊗',
  'to': '→', 'rfloor': '⌋', 'lfloor': '⌊', 'rfloor2': '⌋', 'cdot': '·',
};

function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function identRun(text) {
  return `<m:r><m:t>${esc(text)}</m:t></m:r>`;
}

function plainRun(text) {
  return `<m:r><m:rPr><m:sty>m:plain</m:sty></m:rPr><m:t>${esc(text)}</m:t></m:r>`;
}

function boldRun(text) {
  return `<m:r><m:rPr><m:sty>m:bold</m:sty></m:rPr><m:t>${esc(text)}</m:t></m:r>`;
}

function spaceRun() {
  return '<m:r><m:t xml:space="preserve"> </m:t></m:r>';
}

function opRun(text) {
  return `${spaceRun()}${plainRun(text)}${spaceRun()}`;
}

function elem(children) {
  return `<m:e>${children}</m:e>`;
}

// Tokenizer
function tokenize(input) {
  const tokens = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (ch === '\\') {
      let j = i + 1;
      let name = '';
      while (j < n && /[a-zA-Z]/.test(input[j])) {
        name += input[j];
        j += 1;
      }
      if (name) {
        tokens.push({ t: 'cmd', v: name });
        i = j;
        continue;
      }
      // escaped char
      const escChar = input[i + 1];
      tokens.push({ t: 'char', v: escChar });
      i += 2;
      continue;
    }
    if ('{}^_&'.includes(ch) || '()[]'.includes(ch)) {
      tokens.push({ t: 'sym', v: ch });
      i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    tokens.push({ t: 'char', v: ch });
    i += 1;
  }
  return tokens;
}

function parse(tokens, start, stop) {
  let idx = start;
  let out = '';

  function peek() {
    return tokens[idx];
  }
  function next() {
    return tokens[idx++];
  }

  function parseTerm() {
    const tok = peek();
    if (!tok) return '';
    if (tok.t === 'sym' && (tok.v === '}' || tok.v === ']' || tok.v === '&' || (stop && stop.includes(tok.v)))) {
      return '';
    }
    if (tok.t === 'sym' && tok.v === '{') {
      next();
      const inner = parse(tokens, idx, '}');
      // consume closing
      if (peek() && peek().t === 'sym' && peek().v === '}') next();
      return inner;
    }
    if (tok.t === 'sym' && (tok.v === '(' || tok.v === '[')) {
      const open = next().v;
      const close = open === '(' ? ')' : ']';
      const inner = parse(tokens, idx, close);
      if (peek() && peek().t === 'sym' && peek().v === close) next();
      return `${plainRun(open)}${inner}${plainRun(close)}`;
    }
    if (tok.t === 'cmd') {
      return parseCommand();
    }
    // plain char
    next();
    if (/[0-9]/.test(tok.v)) return plainRun(tok.v);
    if (/[a-zA-Z]/.test(tok.v)) return identRun(tok.v);
    // operator / symbol
    return plainRun(tok.v);
  }

  function parseCommand() {
    const cmd = next();
    const name = cmd.v;
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
      const num = parseSingleArg();
      const den = parseSingleArg();
      return `<m:f><m:fPr/><m:num>${elem(num)}</m:num><m:den>${elem(den)}</m:den></m:f>`;
    }
    if (name === 'sqrt') {
      // optional degree [n]
      let deg = '';
      if (peek() && peek().t === 'sym' && peek().v === '[') {
        next();
        deg = parse(tokens, idx, ']');
        if (peek() && peek().t === 'sym' && peek().v === ']') next();
      }
      const body = parseSingleArg();
      return `<m:rad><m:radPr/>${deg ? `<m:deg>${elem(deg)}</m:deg>` : ''}<m:e>${body}</m:e></m:rad>`;
    }
    if (name === 'int' || name === 'iint' || name === 'oiint' || name === 'oint' || name === 'iiint') {
      const chr = { int: '∫', iint: '∬', iiint: '∭', oiint: '∯', oint: '∮' }[name] || '∫';
      return nary(chr, parseSingleArg());
    }
    if (name === 'sum' || name === 'prod' || name === 'coprod' || name === 'bigcup' || name === 'bigcap' || name === 'bigoplus' || name === 'bigotimes') {
      const chr = { sum: '∑', prod: '∏', coprod: '∐', bigcup: '⋃', bigcap: '⋂', bigoplus: '⊕', bigotimes: '⊗' }[name] || '∑';
      return nary(chr, parseSingleArg());
    }
    if (name === 'lim') {
      return nary('lim', parseSingleArg(), true);
    }
    if (name === 'vec') {
      const body = parseSingleArg();
      return `<m:acc><m:accPr><m:chr>→</m:chr><m:ctrlPr/></m:accPr><m:e>${body}</m:e></m:acc>`;
    }
    if (name === 'bar') {
      const body = parseSingleArg();
      return `<m:acc><m:accPr><m:chr>¯</m:chr><m:ctrlPr/></m:accPr><m:e>${body}</m:e></m:acc>`;
    }
    if (name === 'hat') {
      const body = parseSingleArg();
      return `<m:acc><m:accPr><m:chr>^</m:chr><m:ctrlPr/></m:accPr><m:e>${body}</m:e></m:acc>`;
    }
    if (name === 'mathbf' || name === 'boldsymbol' || name === 'vec' === false) {
      const body = parseSingleArgText();
      return boldRun(body);
    }
    if (name === 'text' || name === 'mathrm' || name === 'textrm' || name === 'operatorname') {
      return plainRun(parseSingleArgText());
    }
    if (name === 'left' || name === 'right') {
      // delimiter: skip, parse next as group/paren
      return parseTerm();
    }
    if (name === 'begin') {
      return parseEnvironment();
    }
    if (name === 'end') {
      // consume arg
      parseSingleArgText();
      return '';
    }
    if (GREEK[name]) {
      return identRun(GREEK[name]);
    }
    if (SYMBOLS[name]) {
      const s = SYMBOLS[name];
      if (s.trim() === '') return spaceRun();
      return opRun(s);
    }
    // unknown command: emit literal backslash name as text
    return plainRun('\\' + name);
  }

  function parseSingleArg() {
    // skip leading spaces
    while (peek() && peek().t === 'char' && peek().v === ' ') next();
    if (peek() && peek().t === 'sym' && peek().v === '{') {
      next();
      const inner = parse(tokens, idx, '}');
      if (peek() && peek().t === 'sym' && peek().v === '}') next();
      return inner;
    }
    // single token (command/char/sym group)
    return parseTerm();
  }

  function parseSingleArgText() {
    while (peek() && peek().t === 'char' && peek().v === ' ') next();
    if (peek() && peek().t === 'sym' && peek().v === '{') {
      next();
      let buf = '';
      const inner = parse(tokens, idx, '}');
      if (peek() && peek().t === 'sym' && peek().v === '}') next();
      return stripTags(inner);
    }
    const tk = peek();
    if (!tk) return '';
    next();
    return tk.v || '';
  }

  function parseEnvironment() {
    // \begin{X}  -> consume {X}
    const envName = parseSingleArgText();
    // Capture raw LaTeX body until \end
    let rawBody = '';
    while (peek() && !(peek().t === 'cmd' && peek().v === 'end')) {
      const tk = peek();
      if (tk.t === 'cmd') {
        rawBody += '\\' + tk.v;
      } else if (tk.t === 'sym') {
        rawBody += tk.v;
      } else if (tk.t === 'char') {
        rawBody += tk.v;
      }
      next();
    }
    // consume \end and its arg
    if (peek() && peek().t === 'cmd' && peek().v === 'end') {
      next();
      parseSingleArgText();
    }
    return latexMatrixToOmml(envName, rawBody);
  }

  function nary(chr, body, isText) {
    let sub = '';
    let sup = '';
    const top = peek();
    if (top && top.t === 'sym' && top.v === '_') {
      next();
      sub = `<m:sub>${elem(parseSingleArg())}</m:sub>`;
    }
    const top2 = peek();
    if (top2 && top2.t === 'sym' && top2.v === '^') {
      next();
      sup = `<m:sup>${elem(parseSingleArg())}</m:sup>`;
    }
    const chrXml = isText
      ? `<m:chr>${plainRun(chr)}</m:chr>`
      : `<m:chr>${esc(chr)}</m:chr>`;
    return `<m:nary><m:naryPr>${chrXml}<m:limLoc>undOvr</m:limLoc><m:ctrlPr/></m:naryPr>${sub}${sup}<m:e>${body}</m:e></m:nary>`;
  }

  while (idx < tokens.length) {
    const tok = peek();
    if (!tok) break;
    if (tok.t === 'sym' && (tok.v === '}' || tok.v === ']' || tok.v === '&' || (stop && stop.includes(tok.v)))) {
      break;
    }
    if (tok.t === 'cmd' && tok.v === 'end') {
      break;
    }
    const base = parseTerm();
    if (!base) {
      // advance to avoid infinite loop
      next();
      continue;
    }
    let result = base;
    // scripts
    let didSup = false;
    let didSub = false;
    let supXml = '';
    let subXml = '';
    const t1 = peek();
    if (t1 && t1.t === 'sym' && t1.v === '^') {
      next();
      supXml = `<m:sup>${elem(parseSingleArg())}</m:sup>`;
      didSup = true;
    }
    const t2 = peek();
    if (t2 && t2.t === 'sym' && t2.v === '_') {
      next();
      subXml = `<m:sub>${elem(parseSingleArg())}</m:sub>`;
      didSub = true;
    }
    if (didSup && didSub) {
      result = `<m:subSup><m:e>${base}</m:e>${subXml}${supXml}</m:subSup>`;
    } else if (didSup) {
      result = `<m:sup><m:e>${base}</m:e>${supXml}</m:sup>`;
    } else if (didSub) {
      result = `<m:sub><m:e>${base}</m:e>${subXml}</m:sub>`;
    }
    out += result;
  }

  return out;
}

function stripTags(xml) {
  // crude: remove xml tags, keep text
  return String(xml).replace(/<[^>]+>/g, '');
}

function buildMatrix(envName, content) {
  // content is omml xml of the inner region; we need raw text to split.
  // Instead parse inner again as latex text: convert omml back is hard.
  // Simpler: we already have OMML; but for matrices we need row/cell split.
  // So re-parse the inner latex by slicing original string is not available here.
  // Fallback: wrap inner OMML in a delimiter with no grid.
  const openChr = { pmatrix: '(', bmatrix: '[', Bmatrix: '{', vmatrix: '|', Vmatrix: '‖', matrix: '' }[envName] || '';
  const closeChr = { pmatrix: ')', bmatrix: ']', Bmatrix: '}', vmatrix: '|', Vmatrix: '‖', matrix: '' }[envName] || '';
  if (openChr === '' && closeChr === '') {
    return `<m:d><m:dPr><m:ctrlPr/></m:dPr><m:e>${content}</m:e></m:d>`;
  }
  return `<m:d><m:dPr><m:begChr>${esc(openChr)}</m:begChr><m:endChr>${esc(closeChr)}</m:endChr><m:ctrlPr/></m:dPr><m:e>${content}</m:e></m:d>`;
}

/** Parse matrix content that was captured as OMML: we re-tokenize the original latex. */
// Because parse() returns OMML, we instead provide a dedicated matrix parser that
// takes raw latex text (used by the caller before converting to OMML).
export function latexMatrixToOmml(envName, latexBody) {
  const rows = latexBody.split('\\\\').map((r) => r.trim()).filter((r) => r.length);
  const grid = rows.map((r) => r.split('&').map((c) => c.trim()));
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const body = grid
    .map((cells) => {
      const cellXml = cells
        .map((c) => `<m:e>${latexToOmmlInner(c)}</m:e>`)
        .join('');
      return `<m:mr>${cellXml}</m:mr>`;
    })
    .join('');
  const matrix = `<m:m><m:mPr><m:mcCount>${cols}</m:mcCount><m:plcHide>0</m:plcHide></m:mPr>${body}</m:m>`;
  const openChr = { pmatrix: '(', bmatrix: '[', Bmatrix: '{', vmatrix: '|', Vmatrix: '‖', matrix: '' }[envName] || '';
  const closeChr = { pmatrix: ')', bmatrix: ']', Bmatrix: '}', vmatrix: '|', Vmatrix: '‖', matrix: '' }[envName] || '';
  if (!openChr && !closeChr) {
    return `<m:d><m:dPr><m:ctrlPr/></m:dPr><m:e>${matrix}</m:e></m:d>`;
  }
  return `<m:d><m:dPr><m:begChr>${esc(openChr)}</m:begChr><m:endChr>${esc(closeChr)}</m:endChr><m:ctrlPr/></m:dPr><m:e>${matrix}</m:e></m:d>`;
}

export function latexToOmmlInner(latex) {
  try {
    const tokens = tokenize(latex);
    const xml = parse(tokens, 0, null);
    return xml || plainRun(latex.trim() || '?');
  } catch (error) {
    return plainRun(String(latex || '').trim() || '?');
  }
}

export function latexToOmml(latex) {
  const inner = latexToOmmlInner(latex);
  return `<m:oMath>${inner}</m:oMath>`;
}
