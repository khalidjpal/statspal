// Transforms RotationPal's index.css into a version scoped under `.rotationpal-module`.
// - `:root` becomes `.rotationpal-module`
// - Top-level element/class selectors are prefixed with `.rotationpal-module `
// - `html`, `body`, `#root` are collapsed onto `.rotationpal-module` (no descendant)
// - Selectors inside @media blocks are also prefixed
// - @keyframes blocks are left untouched
// - The three conflicting class names (.empty-state, .game-row, .team-card) are
//   prefix-scoped so they only match inside the module.
//
// Usage: node scripts/scope-rotationpal-css.mjs <input.css> <output.css>

import { readFileSync, writeFileSync } from 'node:fs';

const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: scope-rotationpal-css.mjs <input.css> <output.css>');
  process.exit(1);
}

const src = readFileSync(inPath, 'utf8');
const PREFIX = '.rotationpal-module';

let out = '';
let i = 0;
const n = src.length;

function emitCommentsAndSpaces() {
  while (i < n) {
    const ch = src[i];
    if (ch === '/' && src[i+1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) { out += src.slice(i); i = n; return; }
      out += src.slice(i, end + 2);
      i = end + 2;
    } else if (/\s/.test(ch)) {
      out += ch; i++;
    } else {
      return;
    }
  }
}

function rewriteSelectorList(sel) {
  return sel
    .split(',')
    .map(part => {
      const t = part.trim();
      if (!t) return part;
      if (t === ':root') return PREFIX;
      if (t === 'html' || t === 'body' || t === '#root') return PREFIX;
      return `${PREFIX} ${t}`;
    })
    .join(', ');
}

function parseRules(prefixTopLevel) {
  while (i < n) {
    emitCommentsAndSpaces();
    if (i >= n) return;
    const ch = src[i];
    if (ch === '}') return;

    if (ch === '@') {
      // at-rule: read header until '{' or ';'
      const start = i;
      while (i < n && src[i] !== '{' && src[i] !== ';') i++;
      const header = src.slice(start, i);
      out += header;
      if (src[i] === ';') { out += ';'; i++; continue; }
      // Block-style at-rule
      out += '{';
      i++; // consume '{'
      const isKeyframes = /@(-[a-z]+-)?keyframes\b/i.test(header);
      // Inside keyframes, selectors are percentages — don't prefix
      parseRules(!isKeyframes);
      // consume '}'
      emitCommentsAndSpaces();
      if (src[i] === '}') { out += '}'; i++; }
      continue;
    }

    // Regular rule: read selector list until '{'
    const selStart = i;
    while (i < n && src[i] !== '{' && src[i] !== '}') i++;
    if (src[i] !== '{') {
      // malformed — emit and bail
      out += src.slice(selStart, i);
      continue;
    }
    const rawSel = src.slice(selStart, i);
    const trimmedSel = rawSel.trim();
    const newSel = prefixTopLevel ? rewriteSelectorList(trimmedSel) : trimmedSel;
    // preserve leading whitespace
    const leading = rawSel.match(/^\s*/)[0];
    out += leading + newSel + ' ';
    out += '{';
    i++; // consume '{'
    // Read body up to matching '}'
    const bodyStart = i;
    let depth = 1;
    while (i < n && depth > 0) {
      if (src[i] === '/' && src[i+1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end === -1) { i = n; break; }
        i = end + 2;
        continue;
      }
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
      i++;
    }
    out += src.slice(bodyStart, i);
    if (src[i] === '}') { out += '}'; i++; }
  }
}

parseRules(true);

writeFileSync(outPath, out);
console.log(`Wrote ${out.length} bytes to ${outPath}`);
