#!/usr/bin/env node
// Oracle for the founders' plan page (doc/index.html). Node ESM, no dependencies.
// v2 (SQ-1571) adds decision-card, rulings-ledger, reference-image, public-bucket and cost-table checks.
// Usage from the repo root: node artifacts/client-house-issue-2026-10-21/tools/check-doc.mjs [path]
// The optional path checks another copy (a seeded fixture) instead of doc/index.html.
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docPath = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '../doc/index.html');

let html;
try {
  html = readFileSync(docPath, 'utf8');
} catch (err) {
  console.error(`check-doc: cannot read ${docPath}: ${err.message}`);
  process.exit(1);
}

const problems = [];
const lineOf = (index) => html.slice(0, index).split('\n').length;
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

// Blank a span with spaces, keeping newlines, so every index still points into the source.
const blank = (text) => text.replace(/[^\n]/g, ' ');
const withoutComments = html.replace(/<!--[\s\S]*?-->/g, blank);
const masked = withoutComments.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, blank);

// Named entities this oracle decodes. An entity outside this table is reported rather than
// passed, so nothing the table lacks can hide a banned string.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', excl: '!', num: '#',
  sol: '/', frasl: '⁄', colon: ':', semi: ';', comma: ',', period: '.', lpar: '(', rpar: ')',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•', times: '×',
  divide: '÷', minus: '−', plusmn: '±', le: '≤', ge: '≥', ne: '≠',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔', deg: '°',
  prime: '′', Prime: '″', sect: '§', para: '¶', copy: '©', reg: '®',
  trade: '™', frac12: '½', frac14: '¼', frac34: '¾', shy: '­',
  thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '‍', zwnj: '‌',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü',
  auml: 'ä', ccedil: 'ç', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
};
const ENTITY = /&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]*));?/y;
function decodeAt(source, i, where) {
  ENTITY.lastIndex = i;
  const m = ENTITY.exec(source);
  if (!m) return null;
  if (m[1] || m[2]) {
    const code = parseInt(m[1] || m[2], m[1] ? 16 : 10);
    const ok = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return { text: ok ? String.fromCodePoint(code) : '�', length: m[0].length };
  }
  if (Object.hasOwn(NAMED, m[3])) return { text: NAMED[m[3]], length: m[0].length };
  if (m[0].endsWith(';')) problems.push(`unrecognized entity "${m[0]}" at line ${lineOf(where)}`);
  return null;
}
const decode = (value, where) => {
  let out = '';
  for (let i = 0; i < value.length; ) {
    const hit = value[i] === '&' ? decodeAt(value, i, where) : null;
    if (hit) { out += hit.text; i += hit.length; } else { out += value[i]; i += 1; }
  }
  return out;
};

// Rendered text: tags vanish so cur<span>ated</span> joins into one word; block-level tags
// become a line break so neighbouring cells and paragraphs do not. map[k] is the source index.
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul', 'svg', 'text', 'g']);
const attrTexts = [];
let rendered = '';
const map = [];
for (let i = 0; i < masked.length; ) {
  const ch = masked[i];
  if (ch === '<' && /[A-Za-z\/!?]/.test(masked[i + 1] || '')) {
    const close = masked.indexOf('>', i);
    const tag = masked.slice(i, close < 0 ? masked.length : close + 1);
    const name = (tag.match(/^<\/?([A-Za-z][\w-]*)/) || [])[1]?.toLowerCase();
    for (const a of tag.matchAll(/\s(alt|aria-label|title|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const raw = a[2] ?? a[3] ?? a[4];
      attrTexts.push({ text: decode(raw, i), name: a[1].toLowerCase(), where: i });
    }
    if (name && BLOCK.has(name)) { rendered += '\n'; map.push(i); }
    i += tag.length;
    continue;
  }
  const hit = ch === '&' ? decodeAt(masked, i, i) : null;
  if (hit) {
    for (const c of hit.text) { rendered += c; map.push(i); }
    i += hit.length;
  } else {
    rendered += ch; map.push(i);
    i += 1;
  }
}

const banned = [
  ['curated', /curated/gi], ['luxury', /luxury/gi], ['seamless', /seamless/gi], ['elevated', /elevated/gi],
  ['bespoke', /bespoke/gi], ['disrupt', /disrupt/gi], ['revolutioni', /revolutioni/gi], ['unlock', /unlock/gi],
  ['game-chang', /game-chang/gi], ['ai-powered', /ai-powered/gi], ['gig', /\bgig\b/gi],
];
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[\u{1F1E6}-\u{1F1FF}]|[#*0-9]️?⃣/gu;
const DENOMINATOR = /\b\d{1,2}\s*\/\s*\d{1,2}\b/g;
// "AI" may appear only inside a sentence that states the rule against it.
const RULE_WORDS = [/\bnever\b/i, /\bban/i, /\bforbid/i, /\bdoes not appear\b/i, /\bmay not\b/i, /\bno "AI"/i];
const TERMINATOR = /[.!?\n]/;

function sentenceAround(text, index) {
  let a = index;
  while (a > 0 && !TERMINATOR.test(text[a - 1])) a -= 1;
  let b = index;
  while (b < text.length && !TERMINATOR.test(text[b])) b += 1;
  return text.slice(a, b);
}
const snippet = (text, index, length) => oneLine(text.slice(Math.max(0, index - 30), index + length + 30));

// Scan one text model with every copy rule. at(index) gives the source line for a match.
function scan(text, label, at) {
  for (const [word, pattern] of banned) {
    for (const m of text.matchAll(pattern)) {
      problems.push(`banned lexicon "${word}" in ${label} at line ${at(m.index)}: …${snippet(text, m.index, m[0].length)}…`);
    }
  }
  for (const m of text.matchAll(/!/g)) {
    problems.push(`exclamation point in ${label} at line ${at(m.index)}: …${snippet(text, m.index, 1)}…`);
  }
  for (const m of text.matchAll(/\bAI\b/gi)) {
    const sentence = sentenceAround(text, m.index).replace(/[“”„″]/g, '"');
    if (!RULE_WORDS.some((rule) => rule.test(sentence))) {
      problems.push(`standalone "AI" outside a sentence stating the rule, in ${label} at line ${at(m.index)}: …${oneLine(sentence)}…`);
    }
  }
  for (const m of text.matchAll(EMOJI)) {
    const code = [...m[0]].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ');
    problems.push(`emoji ${code} in ${label} at line ${at(m.index)}`);
  }
  for (const m of text.matchAll(DENOMINATOR)) {
    problems.push(`numeral-over-total "${m[0]}" in ${label} at line ${at(m.index)}`);
  }
}

scan(rendered, 'rendered text', (k) => lineOf(map[k] ?? html.length));
for (const a of attrTexts) scan(a.text, `${a.name} attribute`, () => lineOf(a.where));

// Title: the actual <title> element, comments removed.
const titles = [...withoutComments.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
if (titles.length !== 1) {
  problems.push(`expected exactly one <title> element, found ${titles.length}`);
} else {
  const title = oneLine(decode(titles[0][1], titles[0].index));
  if (title !== 'The House Issue') problems.push(`<title> is "${title}", expected exactly "The House Issue"`);
}

// Dark theme: real CSS rules, comments removed. Both the guarded system rule and the explicit
// dark rule must exist.
const css = [...withoutComments.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
  .map((m) => m[1])
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
function blockAfter(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}
const GUARDED = /:root:not\(\[data-theme=(["'])light\1\]\)\s*\{/;
const EXPLICIT = /(^|[\s,}])\:root\[data-theme=(["'])dark\2\]\s*\{/;
let guarded = false;
for (const m of css.matchAll(/@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/gi)) {
  if (GUARDED.test(blockAfter(css, m.index + m[0].length - 1))) guarded = true;
}
if (!guarded) {
  problems.push('dark theme missing: no @media (prefers-color-scheme: dark) block containing :root:not([data-theme="light"])');
}
if (!EXPLICIT.test(css)) problems.push('dark theme missing: no :root[data-theme="dark"] rule');

// ---- v2 structure checks (SQ-1571) ----
const textOf = (fragment, where) => oneLine(decode(fragment.replace(/<[^>]*>/g, ' '), where));
const firstMatch = (pattern) => withoutComments.match(pattern);

// Decision cards: each expected id exactly once, each with a Recommendation line.
const CARD_IDS = ['c1', 'c2', 'c3', 'q1', 'q2', 'q3', ...Array.from({ length: 8 }, (_, k) => `v2-${k + 1}`)];
const cardCounts = new Map(CARD_IDS.map((id) => [id, 0]));
for (const m of withoutComments.matchAll(/<article\b[^>]*\bclass="[^"]*\bdcard\b[^"]*"[^>]*>([\s\S]*?)<\/article\s*>/gi)) {
  const id = (m[1].match(/<h3\b[^>]*\bid="([^"]+)"/i) || [])[1];
  if (!id || !cardCounts.has(id)) {
    problems.push(`decision card at line ${lineOf(m.index)} has unexpected or missing h3 id "${id ?? ''}"`);
    continue;
  }
  cardCounts.set(id, cardCounts.get(id) + 1);
  if (!/class="rec"[^>]*>\s*<span class="k">\s*Recommendation\b/.test(m[1])) {
    problems.push(`decision card ${id} at line ${lineOf(m.index)} has no Recommendation line`);
  }
}
for (const [id, n] of cardCounts) {
  if (n !== 1) problems.push(`decision card ${id} appears ${n} time(s), expected exactly once`);
}

// Rulings ledger: fifteen rows R-a to R-o, each once, each stating its v2 status.
const LEDGER = Array.from('abcdefghijklmno', (c) => `R-${c}`);
const ledger = firstMatch(/<table\b[^>]*\bid="rulings-ledger"[^>]*>([\s\S]*?)<\/table\s*>/i);
if (!ledger) {
  problems.push('rulings ledger missing: no <table id="rulings-ledger">');
} else {
  const body = (ledger[1].match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/i) || [null, ''])[1];
  const seen = new Map(LEDGER.map((label) => [label, 0]));
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((c) => textOf(c[1], ledger.index));
    const label = cells[0] ?? '';
    if (!seen.has(label)) { problems.push(`rulings ledger has unexpected row label "${label}"`); continue; }
    seen.set(label, seen.get(label) + 1);
    const status = cells.slice(1).join(' ');
    if (!/\bstands\b/.test(status) && !/superseded by v2 §\d+/.test(status)) {
      problems.push(`rulings ledger row ${label} states neither "stands" nor "superseded by v2 §n"`);
    }
  }
  for (const [label, n] of seen) {
    if (n !== 1) problems.push(`rulings ledger lists ${label} ${n} time(s), expected exactly once`);
  }
}

// Inspiration section: exactly three reference images, published files (not data URIs), each 300 KB or less.
const borrowed = firstMatch(/<section\b[^>]*\bid="borrowed"[^>]*>([\s\S]*?)<\/section\s*>/i);
if (!borrowed) {
  problems.push('inspiration section missing: no <section id="borrowed">');
} else {
  const imgs = [...borrowed[1].matchAll(/<img\b[^>]*>/gi)];
  if (imgs.length !== 3) problems.push(`inspiration section embeds ${imgs.length} image(s), expected exactly 3`);
  for (const img of imgs) {
    const src = (img[0].match(/\bsrc\s*=\s*"([^"]*)"/i) || [])[1] ?? '';
    if (!src || /^(data:|[a-z][a-z0-9+.-]*:|\/)/i.test(src)) {
      problems.push(`inspiration image src "${src.slice(0, 40)}" is not a relative published file`);
      continue;
    }
    let size = -1;
    try { size = statSync(resolve(dirname(docPath), src)).size; } catch { /* reported below */ }
    if (size < 0) problems.push(`inspiration image ${src} not found beside the doc`);
    else if (size > 300 * 1024) problems.push(`inspiration image ${src} is ${size} bytes, over 300 KB`);
  }
}

// The public bucket may be named only in a sentence that says plate copies stay private or never go there.
const bucketCheck = (text, label, at) => {
  for (const m of text.matchAll(/project-item-images/g)) {
    if (!/private|never/i.test(sentenceAround(text, m.index))) {
      problems.push(`"project-item-images" in ${label} at line ${at(m.index)} outside a sentence containing "private" or "never"`);
    }
  }
};
bucketCheck(rendered, 'rendered text', (k) => lineOf(map[k] ?? html.length));
for (const a of attrTexts) bucketCheck(a.text, `${a.name} attribute`, () => lineOf(a.where));

// Cost table: v1 and v2 columns side by side.
const cost = firstMatch(/<table\b[^>]*\bid="cost-v1-v2"[^>]*>([\s\S]*?)<\/table\s*>/i);
if (!cost) {
  problems.push('cost table missing: no <table id="cost-v1-v2">');
} else {
  const heads = [...cost[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)].map((h) => textOf(h[1], cost.index));
  for (const col of ['v1', 'v2']) {
    if (!heads.some((h) => new RegExp(`\\b${col}\\b`).test(h))) problems.push(`cost table has no ${col} column`);
  }
}


if (problems.length) {
  console.error(`check-doc: ${problems.length} problem(s) in ${docPath}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('check-doc: ok');
