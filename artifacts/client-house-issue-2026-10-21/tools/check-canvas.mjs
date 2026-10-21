#!/usr/bin/env node
// Done-oracle for The House Issue canvas.
// Usage: node check-canvas.mjs [--only Main,Empty-Issue] [--self-test]
// Static checks read each board's decoded rendered text and attribute text (lexicon, emoji,
// percent, denominators, required and retired copy), its colours, shadows, fragment links and
// captions. Browser checks load each board in Chromium (Playwright) at its native width:
// figcaption contrast >= 4.5:1, interactive targets >= 44px, no horizontal overflow.
// v2 (SQ-1570) adds: every <img> carries width and height; no figure is data-dimmable; a photo
// caption ends with its placeholder qualifier; every chapter-03 frame holds the signature step;
// chapter-order lists match; and in Chromium, captions at 15px or more, no text box over an <img>
// box unless an opaque paper/stock ancestor sits between them, and the 390 arrival (standing
// row 1 top at most 620, row 3 top at most 740, hero 340 to 380 tall, hero not focusable, first
// Tab stop after the letterhead is standing row 1).
// v3 (SQ-1573, review SQ-1572): every board's content fits its canvas.json frame height; a
// figcaption's first line is exactly three segments and a qualifier is a separate .plate-note line;
// every arrival frame ([data-arrival-frame]) holds three standing rows in fixed order with their
// zero states, and its chapter anchors run in canonical order; geometry is page-relative to the
// frame's #doorplate (phone: plate 140 to 480, tab cut 44 into it, row 1 <= 620, row 3 <= 740;
// desktop: rows <= 880, headline one line); chapter-03 acts carry data-act-state matching their
// signature field; the Plate-Grammar types follow PLAN section 3 and the hero specimen is 390 x 340.
// Measurements use fallback fonts with remote requests blocked. The 200 percent zoom column on
// Type-and-Rhythm is a drawn specimen: inspected for its rows, never reflowed.
// --self-test seeds bad fixtures in memory and fails unless every probe catches its problem.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = join(toolsDir, '..', 'canvas', 'project');

// ---------- decoding and rendered text ----------
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', excl: '!', num: '#', percnt: '%',
  sol: '/', frasl: '⁄', colon: ':', semi: ';', comma: ',', period: '.', lpar: '(', rpar: ')',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', centerdot: '·', bull: '•', times: '×',
  divide: '÷', minus: '−', plusmn: '±', le: '≤', ge: '≥', ne: '≠',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔', deg: '°',
  prime: '′', Prime: '″', sect: '§', para: '¶', copy: '©', reg: '®',
  trade: '™', frac12: '½', frac14: '¼', frac34: '¾', shy: '­',
  thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '‍', zwnj: '‌',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ouml: 'ö', uuml: 'ü',
  auml: 'ä', ccedil: 'ç', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
};
const ENTITY = /&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]*));?/y;
function decode(value) {
  let out = '';
  for (let i = 0; i < value.length; ) {
    let hit = null;
    if (value[i] === '&') {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(value);
      if (m && (m[1] || m[2])) {
        const code = parseInt(m[1] || m[2], m[1] ? 16 : 10);
        const ok = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
        hit = { text: ok ? String.fromCodePoint(code) : '�', length: m[0].length };
      } else if (m && Object.hasOwn(NAMED, m[3])) hit = { text: NAMED[m[3]], length: m[0].length };
    }
    if (hit) { out += hit.text; i += hit.length; } else { out += value[i]; i += 1; }
  }
  return out;
}
const squash = (s) => s.replace(/[‘’]/g, "'").replace(/[\s\u00a0]+/g, ' ').trim();
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul', 'svg', 'text', 'g',
  'button', 'label', 'input', 'textarea', 'select', 'option', 'img']);
const TEXT_ATTRS = ['alt', 'aria-label', 'title', 'placeholder', 'value'];
const TAG = /<[a-zA-Z][\w-]*(?:\s+[^\s=>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/g;
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3]) : undefined;
};
const hasAttr = (tag, name) => new RegExp(`\\s${name}(?=[\\s=/>])`, 'i').test(tag);
const blankCode = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length)).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (m) => ' '.repeat(m.length));

// Rendered text of a markup fragment: tags vanish (cur<span>ated</span> is one word), block tags break lines.
function render(markup) {
  let out = '';
  for (let i = 0; i < markup.length; ) {
    if (markup[i] === '<' && /[A-Za-z/!?]/.test(markup[i + 1] || '')) {
      const close = markup.indexOf('>', i);
      const tag = markup.slice(i, close < 0 ? markup.length : close + 1);
      const name = (tag.match(/^<\/?([A-Za-z][\w-]*)/) || [])[1];
      if (name && BLOCK.has(name.toLowerCase())) out += '\n';
      i += tag.length;
      continue;
    }
    out += markup[i];
    i += 1;
  }
  return decode(out);
}
// Board text = rendered body (figcaptions blanked, scanned field by field) + attribute texts.
function boardText(src) {
  const code = blankCode(src);
  const body = code.slice(Math.max(0, code.search(/<body\b/i)));
  const captions = [];
  const withoutCaptions = body.replace(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi, (m, inner) => {
    captions.push(render(inner));
    return ' '.repeat(m.length);
  });
  const attrs = [];
  for (const tag of body.match(TAG) || []) for (const a of TEXT_ATTRS) {
    const v = attr(tag, a);
    if (v !== undefined && v.trim()) attrs.push(v);
  }
  return { text: render(withoutCaptions), captions, attrs, all: render(body) + '\n' + attrs.join('\n') };
}

// ---------- copy rules ----------
const LEXICON = ['curated', 'luxury', 'seamless', 'elevated', 'bespoke', 'disrupt', 'disruptive', 'disruption',
  'revolutionize', 'revolutionise', 'revolutionizing', 'unlock', 'unlocks', 'game-changing', 'game changing', 'AI-powered',
  'gig', 'AI', 'A.I.', 'artificial intelligence', 'Claude', 'Anthropic', 'GPT', 'ChatGPT', 'OpenAI', 'Gemini', 'Llama',
  'Opus', 'Sonnet', 'Haiku', 'Fable', 'Codex', 'model', 'models', 'engine', 'generated'];
const CATALOGUE_FIELD = 'Walnut sideboard, the same model';
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[\u{1F1E6}-\u{1F1FF}]|[#*0-9]\uFE0F?\u20E3/u;
const DENOMINATOR = /\b\d{1,2}\s*\/\s*\d{1,2}\b/;
const lexRe = (w) => new RegExp(`(^|[^A-Za-z0-9])${w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&').replace(/ /g, '[\\s-]+')}([^A-Za-z0-9]|$)`, 'i');
const LEX = LEXICON.map((w) => [w, lexRe(w)]);

function copyProblems(chunk, label, fail) {
  for (const [w, re] of LEX) if (re.test(chunk)) fail(`lexicon word "${w}" in ${label}`);
  if (chunk.includes('!')) fail(`exclamation mark in ${label}`);
  if (EMOJI.test(chunk)) fail(`emoji in ${label}`);
  if (chunk.includes('%') || chunk.includes('％')) fail(`percent sign in ${label}`);
  const d = chunk.match(DENOMINATOR);
  if (d) fail(`"NN / NN" denominator "${d[0]}" in ${label}`);
}

// ---------- colour ----------
const NAMED_RED = ['red', 'darkred', 'crimson', 'firebrick', 'tomato', 'indianred', 'orangered', 'maroon', 'brown', 'salmon', 'lightcoral', 'coral', 'deeppink'];
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}
const reddish = ({ h, s, l }) => (h <= 15 || h >= 345) && s >= 0.45 && l >= 0.15 && l <= 0.85;
const num = (v, scale) => (v.trim().endsWith('%') ? (parseFloat(v) / 100) * scale : parseFloat(v));
function colours(css) {
  const out = [];
  for (const m of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    let x = m[1];
    if (![3, 4, 6, 8].includes(x.length)) continue;
    if (x.length <= 4) x = x.slice(0, 3).split('').map((c) => c + c).join('');
    out.push([m[0], hsl(...[0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)))]);
  }
  for (const m of css.matchAll(/rgba?\(\s*([^)]*)\)/gi)) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length >= 3) out.push([m[0], hsl(num(p[0], 255), num(p[1], 255), num(p[2], 255))]);
  }
  for (const m of css.matchAll(/hsla?\(\s*([^)]*)\)/gi)) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length >= 3) out.push([m[0], { h: ((parseFloat(p[0]) % 360) + 360) % 360, s: num(p[1], 1), l: num(p[2], 1) }]);
  }
  for (const m of css.matchAll(new RegExp(`(?:^|[\\s:;,("'])(${NAMED_RED.join('|')})(?=[\\s;,)"'!]|$)`, 'gi'))) out.push([m[1], { h: 0, s: 1, l: 0.5 }]);
  return out;
}

// ---------- static board check ----------
const SUPPORT = '<script src="./support.js"></script>';
const SHADOW = /(box-shadow|text-shadow)\s*:\s*(?!\s*none\b)[^;"']+|filter\s*:[^;"']*drop-shadow/i;
const FOREST = '#3E5145';
function checkBoard(file, src, frame, boardIds, fail) {
  if (!/^<!doctype html>/i.test(src)) fail('must start with <!doctype html>');
  const head = (src.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [])[1];
  if (!head || !head.includes(SUPPORT)) fail('support.js line missing from <head> or altered');
  for (const m of src.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']?([^"'\s>]+)/gi)) if (m[1] !== './support.js') fail(`external script ${m[1]}`);
  if ((src.match(/<x-dc>/g) || []).length !== 1 || (src.match(/<\/x-dc>/g) || []).length !== 1) fail('exactly one <x-dc> block required');
  if (!/<x-dc>\s*<helmet>[\s\S]*<\/helmet>/.test(src)) fail('<helmet> must open the <x-dc> block');
  if (!/<script type="text\/x-dc" data-dc-script/.test(src)) fail('data-dc-script block missing');
  if (!/class Component extends DCLogic/.test(src)) fail('class Component extends DCLogic missing');
  if (/\b(import|export)\s/.test((src.match(/data-dc-script[\s\S]*?<\/script>/) || [''])[0].replace(/data-props='[^']*'/, ''))) fail('import/export in logic script');
  const props = src.match(/data-props='([^']*)'/);
  if (!props) fail("data-props='…' missing");
  else {
    try {
      const pv = JSON.parse(decode(props[1])).$preview;
      if (!pv) fail('$preview missing');
      else if (frame && (pv.width !== frame.w || pv.height !== frame.h)) fail(`$preview ${pv.width}x${pv.height} differs from canvas ${frame.w}x${frame.h}`);
    } catch (e) {
      fail(`data-props not JSON: ${e.message}`);
    }
  }
  if (/\{\{[^}]*[+!()?:<>=][^}]*\}\}/.test(src)) fail('expression inside {{ }} (holes are dotted lookups only)');
  if (/style\s*=\s*["'][^"']*var\(--/.test(src)) fail('CSS var() in inline style; use literal values');
  if (/<(iframe|object|embed)\b/i.test(src)) fail('iframe/object/embed not allowed');
  if (/innerHTML|appendChild/.test(src)) fail('script-built UI not allowed');
  if (/#8B7355/i.test(src)) fail('retired clay link colour #8B7355');

  const code = blankCode(src);
  const tags = code.match(TAG) || [];
  const styleBlocks = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const ids = boardIds.get(file) || new Set();

  // Copy: rendered text with figcaptions blanked, then each caption field, then attribute texts.
  const t = boardText(src);
  copyProblems(t.text, 'rendered text', fail);
  for (const a of t.attrs) copyProblems(a, `attribute text "${a.slice(0, 50)}"`, fail);
  for (const cap of t.captions) for (const field of squash(cap).split(' · ')) {
    if (field === CATALOGUE_FIELD) continue;
    copyProblems(field, `caption field "${field.slice(0, 60)}"`, fail);
  }
  for (const css of styleBlocks.concat(tags.map((g) => attr(g, 'style') || ''))) {
    if (/content\s*:[^;]*(%|\\0*25\b)/i.test(css)) fail('percent sign in CSS content');
  }

  // Colour: no red hue in any declared colour (hex, rgb, hsl, named), in styles or SVG paint.
  const paint = styleBlocks.concat(tags.flatMap((g) => ['style', 'fill', 'stroke', 'stop-color', 'color', 'flood-color'].map((a) => attr(g, a) || '')));
  for (const css of paint) for (const [lit, c] of colours(css)) if (reddish(c)) fail(`red colour ${lit}`);

  // Shadows: only inline, only on the element labelled data-c1-alternative.
  for (const css of styleBlocks) if (SHADOW.test(css)) fail('shadow in a <style> block');
  for (const g of tags) {
    const st = attr(g, 'style') || '';
    if (SHADOW.test(st) && !hasAttr(g, 'data-c1-alternative')) fail(`shadow outside the C1 alternative: ${g.slice(0, 70)}`);
  }

  // References: #frag on this board; Board.dc.html#frag against the listed destination board.
  for (const g of tags) {
    const href = attr(g, 'href');
    if (href !== undefined && !href.includes('{{')) {
      if (href.startsWith('#')) {
        if (!ids.has(href.slice(1))) fail(`href="${href}" names no id on this board`);
      } else {
        const m = href.match(/^(?:\.\/)?([\w-]+\.dc\.html)(?:#(.*))?$/);
        if (m) {
          if (!boardIds.has(m[1])) fail(`href="${href}" names a board not listed in canvas.json`);
          else if (m[2] !== undefined && !boardIds.get(m[1]).has(m[2])) fail(`href="${href}" names no id on ${m[1]}`);
        }
      }
    }
    for (const a of ['aria-controls', 'aria-describedby', 'aria-labelledby', 'for']) {
      const v = attr(g, a);
      if (v === undefined || v.includes('{{') || /^<link\b/i.test(g)) continue;
      for (const id of v.split(/\s+/).filter(Boolean)) if (!ids.has(id)) fail(`${a}="${id}" names no id on this board`);
    }
    if (hasAttr(g, 'aria-expanded') && attr(g, 'aria-controls') === undefined) fail(`aria-expanded without aria-controls: ${g.slice(0, 70)}`);
    if (/^<img\b/i.test(g)) {
      const alt = attr(g, 'alt');
      const s = attr(g, 'src') || '';
      if (alt === undefined) fail(`<img> without alt: ${g.slice(0, 70)}`);
      if (!s.startsWith('/_blob/')) fail(`<img> src must be an uploaded asset (/_blob/…): ${s.slice(0, 60)}`);
      if (!/^\d+$/.test(attr(g, 'width') || '') || !/^\d+$/.test(attr(g, 'height') || '')) fail(`<img> needs width and height attributes: ${g.slice(0, 70)}`);
    }
    if (/^<figure\b/i.test(g) && hasAttr(g, 'data-dimmable')) fail(`data-dimmable on a figure (plates never dim): ${g.slice(0, 70)}`);
    if (/^<a\b/i.test(g)) {
      const color = ((attr(g, 'style') || '').match(/(?:^|;)\s*color\s*:\s*([^;]+)/i) || [])[1];
      if (color && color.trim().toUpperCase() !== FOREST) fail(`link colour ${color.trim()} is not forest ${FOREST}`);
    }
  }

  // Captions (v3, R-v2-7): the first line is exactly what · whose · when. A qualifier is a separate
  // second line, <span|p class="plate-note">, inside the figcaption after that line; never a fourth
  // "·" field, never loose text. Off the arrival boards a plate holding an uploaded photograph
  // carries a placeholder note; on them the notice is a canvas note beside the frame.
  const figs = code.match(/<figure\b[\s\S]*?<\/figure>/gi) || [];
  if ((code.match(/<figure\b/gi) || []).length !== figs.length) fail('unbalanced <figure> markup');
  const arrival = ARRIVAL_BOARDS.test(file) || /\sdata-arrival-board\b/.test(src);
  for (const fig of figs) {
    const cap = fig.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    if (!cap) { fail(`<figure> without <figcaption>: ${fig.slice(0, 70)}`); continue; }
    const notes = [];
    const line = cap[1].replace(/<(span|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, t, at, inner) => {
      if (!/\sclass\s*=\s*["']plate-note["']/i.test(` ${at}`)) return m;
      notes.push(squash(render(inner)));
      return ' ';
    });
    const first = squash(render(line));
    const fields = first.split(' · ');
    if (fields.length !== 3) fail(`figcaption first line must be exactly what · whose · when (a qualifier goes on a .plate-note line): "${first.slice(0, 90)}"`);
    const loose = QUALIFIERS.find((q) => first.toLowerCase().includes(q));
    if (loose) fail(`qualifier "${loose}" in the caption line; it belongs on its own .plate-note line: "${first.slice(0, 90)}"`);
    const noteAt = cap[1].search(/class\s*=\s*["']plate-note/i);
    if (noteAt >= 0 && first !== squash(render(cap[1].slice(0, cap[1].lastIndexOf('<', noteAt))))) fail(`caption text after the .plate-note line: "${first.slice(0, 60)}"`);
    for (const n of notes) if (n.includes(' · ')) fail(`.plate-note is one qualifier, not segments: "${n.slice(0, 60)}"`);
    const placeholderNote = notes.some((n) => QUALIFIERS.includes(n.toLowerCase()));
    if (arrival && notes.some((n) => n.toLowerCase() === QUALIFIERS[0])) fail(`placeholder note in-frame on an arrival board (it lives in the board note): "${first.slice(0, 90)}"`);
    else if (!arrival && /<img\b[^>]*\ssrc\s*=\s*["']?\/_blob\//i.test(fig) && !placeholderNote) fail(`photo caption needs its "Placeholder, not job imagery" .plate-note line: "${first.slice(0, 90)}"`);
  }

  // Chapter 03 (v3): every frame of the approvals chapter holds the signature field before its act,
  // and every Approve act states data-act-state: "ready" only after a signed field and forest-filled;
  // "unavailable" after an empty field, aria-disabled, not forest-filled, with its reason described.
  // A frame is a <section> whose text opens on "03 · Approvals" or that carries data-chapter="03".
  for (const sec of sections(code)) {
    if (!(hasAttr(sec.tag, 'data-chapter') && attr(sec.tag, 'data-chapter') === '03') && !squash(render(sec.body)).startsWith('03 · Approvals')) continue;
    const sig = sec.body.search(/<input\b[^>]*\sid\s*=\s*["']sig-name/i);
    const act = sec.body.search(/<button\b[^>]*>\s*Approve this edition/i);
    if (sig < 0) fail(`chapter 03 frame without the signature step (an input id="sig-name…"): ${sec.tag.slice(0, 70)}`);
    else if (act < 0 || act < sig) fail(`chapter 03 frame: the Approve act must follow the signature step: ${sec.tag.slice(0, 70)}`);
    for (const m of sec.body.matchAll(/<button\b[^>]*>\s*Approve this edition/gi)) {
      const tag = m[0].slice(0, m[0].indexOf('>') + 1);
      const before = sec.body.slice(0, m.index);
      const inputs = [...before.matchAll(/<input\b[^>]*\sid\s*=\s*["']sig-name[^>]*>/gi)];
      const field = inputs.length ? inputs[inputs.length - 1][0] : '';
      const signed = Boolean((attr(field, 'value') || '').trim());
      const state = attr(tag, 'data-act-state');
      const forest = /background:\s*#3E5145/i.test(attr(tag, 'style') || '') || /\sclass\s*=\s*["'][^"']*\bact\b/.test(tag);
      if (!['ready', 'unavailable'].includes(state)) fail(`chapter 03 Approve act needs data-act-state="ready|unavailable": ${tag.slice(0, 70)}`);
      else if (state === 'ready' && (!signed || !forest)) fail(`chapter 03 act is "ready" ${!signed ? 'before its signature field is signed' : 'but not forest-filled'}: ${tag.slice(0, 70)}`);
      else if (state === 'unavailable') {
        const reasonIds = (attr(tag, 'aria-describedby') || '').split(/\s+/).filter(Boolean);
        const reason = reasonIds.map((id) => (sec.body.match(new RegExp(`<p\\b[^>]*\\sid\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)<\\/p>`, 'i')) || [])[1] || '').map((x) => squash(render(x))).join(' ');
        if (signed) fail(`chapter 03 act is "unavailable" after a signed field: ${tag.slice(0, 70)}`);
        if (attr(tag, 'aria-disabled') !== 'true') fail(`chapter 03 unavailable act needs aria-disabled="true": ${tag.slice(0, 70)}`);
        if (forest) fail(`chapter 03 unavailable act must not be forest-filled: ${tag.slice(0, 70)}`);
        if (!reason.includes(UNAVAILABLE_REASON)) fail(`chapter 03 unavailable act must describe its reason "${UNAVAILABLE_REASON}"`);
      }
    }
  }

  // Hero specimen (v3, R-v2 finding 6): a hero drawn at 390 is 390 x 340 and its note gives 360 x 314.
  for (const g of tags) if (/^<img\b/i.test(g) && attr(g, 'data-specimen') === 'hero-390') {
    if (attr(g, 'height') !== '340' || !/(?:^|;)\s*height:\s*340px/.test(attr(g, 'style') || '')) fail(`hero specimen at 390 must be 390 x 340: ${g.slice(0, 80)}`);
    if (!squash(render(code)).includes('360 × 314')) fail('hero specimen note must give "360 × 314" at a 360 screen');
  }

  // Plate grammar (v3, R-v2-4): numbered plate labels follow PLAN section 3, nine types in order;
  // Concept is a state of the room plate and is never numbered.
  const plateLabels = [...code.matchAll(/<p\b[^>]*\sclass\s*=\s*["']fr["'][^>]*>([\s\S]*?)<\/p>/gi)].map((m) => squash(render(m[1])));
  const numbered = plateLabels.map((l) => l.match(/^(\d) · ([^·]+?)\s*(?:·|$)/)).filter(Boolean);
  if (numbered.length) {
    const got = numbered.map((m) => `${m[1]} ${m[2]}`).join(' / ');
    const want = PLATES.map((p, i) => `${i + 1} ${p}`).join(' / ');
    if (got !== want) fail(`numbered plates must be ${want}; found ${got}`);
    if (plateLabels.some((l) => /^\d · Concept/.test(l))) fail('Concept is a state of the room plate, not a numbered plate');
  }

  // Chapter order (v2): every list marked data-chapter-order on a board names the same chapters
  // in the same order.
  const orders = [...code.matchAll(/<ol\b[^>]*\sdata-chapter-order\b[^>]*>([\s\S]*?)<\/ol>/gi)].map((m) => [...m[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => squash(render(li[1])).split(' ')[0]).join(' '));
  for (const o of orders.slice(1)) if (o !== orders[0]) fail(`chapter order differs between frames: "${orders[0]}" vs "${o}"`);
}
const QUALIFIERS = ['placeholder, not job imagery', 'placeholder composition'];
// Arrival boards carry the placeholder declaration once, as a canvas note beside the frame.
const ARRIVAL_BOARDS = /^(Main-A|Main-B|Issue-Cover-Desktop)\.dc\.html$/;
const UNAVAILABLE_REASON = 'Sign first, then hold to approve.';
const PLATES = ['Hero', 'Chapter plate', 'Held plate', 'Drawing / sheet', 'Board', 'Material run', 'Pair', 'Piece', 'Document cover'];
// Canonical chapter anchors (PLAN chapters table); rooms are one or more room-* sections.
const CANON = ['cover', 'doorstep', 'approvals', 'key', 'room', 'road', 'note', 'previously', 'mat'];
const ANCHOR_RE = /<(?:section|li|figure)\b[^>]*\s(?:id|data-anchor)\s*=\s*["'](cover|doorstep|approvals|key|room-[\w-]+|road|note|previously|mat)["']/gi;
const anchorsOf = (code) => [...code.matchAll(ANCHOR_RE)].map((m) => m[1]);
const rankOf = (a) => CANON.indexOf(a.startsWith('room-') ? 'room' : a);
// A whole issue: every canonical chapter once, in order, rooms contiguous and at least one.
function fullOrder(seq) {
  const ranks = seq.map(rankOf);
  const rooms = ranks.filter((r) => r === 4).length;
  const want = [0, 1, 2, 3, ...Array(Math.max(rooms, 1)).fill(4), 5, 6, 7, 8];
  return ranks.join() === want.join() && new Set(seq).size === seq.length;
}
// Standing rows: fixed roles, links and zero states (R-v2-13).
const ROW_HREF = { 1: '#letterbox', 2: '#approvals', 3: '#ledger' };
const ROW_ZERO = { 1: 'Nothing new since your last visit', 2: 'Nothing waiting on you', 3: 'No invoices open' };
const ARRIVAL_FRAMES = { 'Main-A': 1, 'Issue-Cover-Desktop': 1, 'Empty-Issue': 1, 'Phase-Strip': 4, 'Type-and-Rhythm': 1 };
// Balanced <section> blocks (nested sections each reported).
function sections(code) {
  const out = [];
  const re = /<section\b[^>]*>|<\/section\s*>/gi;
  const stack = [];
  for (const m of code.matchAll(re)) {
    if (m[0][1] !== '/') stack.push({ tag: m[0], start: m.index + m[0].length });
    else if (stack.length) { const s = stack.pop(); out.push({ tag: s.tag, body: code.slice(s.start, m.index) }); }
  }
  return out;
}

// ---------- per-board required and retired copy (the SQ-1566 rulings) ----------
// v2: the one-line standing line became three 44px standing rows (contract §1).
const STANDING = ['$600.00 is past due since 25 September.', 'One approval waits: the living room sofa.', 'Six invoices are open, $1,375.00 together.'];
const ARRIVAL = ['Pay invoices, review approvals, and follow your project here.', 'Invoices', 'Approvals', 'Progress', 'Updates',
  'Documents', 'Contact Maren Holt', ...STANDING];
const COLOPHON = 'Prepared by Birchwood Studio · Sent through Patina';
const APPROVE = 'Approve this edition · $7,480.00';
const CHIP = 'Concept · not installed';
const LINEN = "Oatmeal performance linen · maker's sample · 14 October 2026";
const GROUPS = ['Invoices to pay', 'Payments in progress', 'Payment needs review', 'Payment history'];
const PAY = 'Continue to secure payment';
const EYEBROWS = ['01 · Elm Street House · Procurement', '02 · Invoices', '03 · Approvals', '04 · The house', '05 · Living room', '08 · Progress', '09 · Updates', '11 · Documents and contact'];
const PAINT = ['Halvorsen, Morning Oat', 'Larkin Prairie, Pale Birch', 'Halvorsen, Kettle Clay', 'Halvorsen, Bur Oak Green'];
const AUTHORS = ['Tangerineduel', 'Antti Leppänen', 'JohanahoJ', 'Estate Lookup Interiors', 'Mike Duchstein', 'Phadzim', 'ambientCG.com / Lennart Demes', 'Cyril5555',
  'Carol M. Highsmith', 'Stilfehler', 'Frank R. Leslie', 'Cooper Hewitt, Smithsonian Design Museum', 'Terasaface', 'William Warby', 'KaiKemmann', 'Jules Verne Times Two'];
const LICENCES = {
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
};
const HERO_CAPTION = 'Walnut top, planed · Harmon Bench Works · 15 October 2026';
const PLACEHOLDER_NOTE = 'All photographs are placeholders, not job imagery; see Credits';
const BOARD_CAPTION = 'Living room board · Birchwood Studio · 2 June 2026';
const SETTLED = 'Approved by June Brennan · 21 October 2026';
const DUE_TODAY = 'Due today · 21 October 2026';
const REQUIRED = {
  'Main-A': [...ARRIVAL, ...EYEBROWS.slice(0, 5), APPROVE, CHIP, ...GROUPS, 'View invoice', PAY, LINEN, 'Your full name',
    'Type your full name before approving.', ...PAINT, HERO_CAPTION, 'Total outstanding $1,375.00', DUE_TODAY,
    'Living room as measured · photographed by Birchwood Studio · 2 June 2026'],
  'Main-B': ['06 · Study', 'Oak, brass and lime plaster', '07 · Entry', 'One line', ...EYEBROWS.slice(5), '10 · Earlier', COLOPHON,
    'Edition 4 · approved by Maren · 21 October', 'Lake Cottage, the next issue', 'Harmon Bench Works, Dayton', '22 January 2027'],
  'Issue-Cover-Desktop': [...ARRIVAL, ...EYEBROWS, COLOPHON, ...GROUPS, 'View invoice', PAY, HERO_CAPTION, APPROVE, 'Your full name', 'Portrait template', DUE_TODAY],
  'Approval-Pair': [APPROVE, LINEN, 'Your full name', 'Send change request', "What you'd like changed", 'Confirm pause',
    "This records that you want to pause and talk it through. It doesn't approve or reject the edition.", 'Edition 2 is approved', SETTLED],
  'Living-Room-Band': [CHIP, ...PAINT, 'Living room as measured · photographed by Birchwood Studio · 2 June 2026'],
  'Plate-Grammar': [LINEN, '1440 × 648', '1248 × 648', '390 × 340', '360 × 314', '780 × 680', '72svh', 'Held plate', 'Drawing / sheet', 'Material run',
    'Document cover', 'Concept render', 'a state of the room plate', 'Clipping study'],
  'Drawings-and-Materials': [BOARD_CAPTION, 'Placeholder composition', 'Sheet A-201, living room elevations', 'notch', 'hairline', 'below'],
  'Phase-Strip': ['nothing moves under Earlier', '02 · Invoices', '09 · Updates', ROW_ZERO[1], ROW_ZERO[2], ROW_ZERO[3]],
  'Press-Band-Designer': ['A new edition is ready', 'placeholder, not job imagery', 'The cover is a drawing until a photograph arrives', '16:10', '39:34', '780 × 680',
    'Living room, as measured · scan'],
  'Type-and-Rhythm': ['INV-2026-017 · $300.00 of $800.00 · due 2 November', '200 percent zoom', '07 Entry and 10 Earlier open on words'],
  'Motion-Storyboard': ['400 ms', '520 ms', 'Reduced motion'],
  'Empty-Issue': [COLOPHON, 'photograph to follow', 'The plan arrives with the first drawing set', 'Nothing settled yet', UNAVAILABLE_REASON, '900 ms',
    ROW_ZERO[1], ROW_ZERO[3]],
  Credits: [...AUTHORS, 'Cropped from a living-room photograph', 'cropped in layout', 'Living room, as measured · scan'],
};
const RETIRED = ['Farrow', 'Benjamin Moore', 'Sherwin', 'Little Greene', 'Pay this invoice', 'kept under Earlier', 'inside 740',
  'Walnut sideboard, in the workshop · photographed by Harmon Bench Works · 15 October 2026', 'Oatmeal performance linen, the sample', 'Due this week', 'Due later',
  'Due today · 20 October 2026', 'The study, still on the board', 'The entry, nothing ordered yet', '780 × 907', '390 × 352', '360 × 325', '0.86',
  'Every chapter but 02 opens on its plate', 'The living room as measured, Installed room'];
const SETTLES = /\b(settles?|settling|clears?)\b[^.]{0,30}\binvoice\b/i;
const indexOf = (hay, s) => hay.toLowerCase().indexOf(squash(s).toLowerCase());

function checkCopy(stem, src, fail) {
  const t = boardText(src);
  const flat = squash(t.all);
  const tags = blankCode(src).match(TAG) || [];
  for (const s of REQUIRED[stem] || []) if (indexOf(flat, s) < 0) fail(`required copy missing: "${s}"`);
  for (const s of RETIRED) if (indexOf(flat, s) >= 0) fail(`retired copy present: "${s}"`);
  if (SETTLES.test(flat)) fail(`copy claims pressing settles the invoice: "${flat.match(SETTLES)[0]}"`);
  const code = blankCode(src);
  const buttons = [...code.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map((m) => ({ tag: `<button${m[1]}>`, text: squash(render(m[2])) }));
  // F2: four groups in order; one 44px View invoice per invoice row.
  if (stem === 'Main-A' || stem === 'Issue-Cover-Desktop') {
    const at = GROUPS.map((g) => indexOf(flat, g));
    if (at.some((v, i) => i && v <= at[i - 1])) fail(`payment groups out of order: ${GROUPS.join(' / ')}`);
    const rows = buttons.filter((b) => /^View invoice INV-2026-\d{3}$/.test(attr(b.tag, 'aria-label') || ''));
    if (rows.length !== 9) fail(`expected 9 invoice rows with View invoice, found ${rows.length}`);
    for (const b of rows) if (!/min-height:\s*(4[4-9]|[5-9]\d)px/.test(attr(b.tag, 'style') || '')) fail(`View invoice under 44px: ${attr(b.tag, 'aria-label')}`);
  }
  // F3/F4: terminal acts forest-filled 48px, each after its required field or consequence.
  const acts = { [APPROVE]: 'sig-name', 'Send change request': 'change-note', 'Confirm pause': 'pause-consequence', [PAY]: 'pay-consequence' };
  for (const b of buttons) {
    const name = Object.keys(acts).find((k) => b.text.startsWith(k));
    if (!name) continue;
    const st = attr(b.tag, 'style') || '';
    if (!/background:\s*#3E5145/i.test(st) || !/min-height:\s*48px/.test(st)) fail(`"${name}" must be forest-filled at 48px`);
    const pos = code.indexOf(b.tag);
    const before = code.slice(0, pos);
    const lastAct = Math.max(...Object.keys(acts).map((k) => before.lastIndexOf(k)));
    const need = before.lastIndexOf(`id="${acts[name]}`);
    if ((stem === 'Main-A' || stem === 'Approval-Pair' || name === PAY) && (need < 0 || need < lastAct)) fail(`"${name}" is not preceded by its ${acts[name]} step`);
  }
  for (const b of buttons) if (hasAttr(b.tag, 'aria-pressed')) {
    const st = attr(b.tag, 'style') || '';
    const pressed = attr(b.tag, 'aria-pressed') === 'true';
    if (/^(Approve|Request changes|Pause to discuss)$/.test(b.text)) {
      if (!/border:\s*1px solid #3E5145/i.test(st)) fail(`choice "${b.text}" must be a forest outline`);
      if (pressed !== /background:\s*#3E5145/i.test(st)) fail(`choice "${b.text}" must fill forest only when picked`);
    }
  }
  if (stem === 'Press-Band-Designer') {
    const h = code.match(/<h2 id="press-h"[^>]*>([\s\S]*?)<\/h2>/);
    if (!h || squash(render(h[1])) !== 'A new edition is ready') fail('band heading must be exactly "A new edition is ready"');
    const group = (code.match(/aria-labelledby="picker-h"[\s\S]*?<\/ul>/) || [''])[0];
    const opts = (group.match(/<button\b/g) || []).length;
    const labels = (squash(render(group)).match(/placeholder, not job imagery/gi) || []).length;
    if (!opts || labels !== opts) fail(`hero picker: ${opts} options but ${labels} "placeholder, not job imagery" labels`);
    // Never the cover: workshop scene (02), samples and grain (03, 08), the catalogue sideboard (01, V2-1)
    // and the concept render (05).
    for (const ineligible of ['8918ba43d43b2ddc8243b2500da76b63', 'c9c72d856094c1848b7601f5abf7c9b7', '09c3628263fd2b19100d211910bc5923',
      '415b92f4b388fc2702b95bf2dab638cb', 'bedee857d00494f6430cb6cf9fc0d7e5']) if (group.includes(ineligible)) fail(`hero picker offers an ineligible source (${ineligible.slice(0, 8)})`);
  }
  if (stem === 'Phase-Strip' && (code.match(/<ol\b[^>]*\sdata-chapter-order\b/gi) || []).length !== 4) fail('each of the four phase frames needs its data-chapter-order list');
  // R-v2-13: the arrival frames each board must draw (rows, order and geometry are measured in Chromium).
  const frames = (code.match(/\sdata-arrival-frame\s*=/gi) || []).length;
  if (ARRIVAL_FRAMES[stem] !== undefined && frames !== ARRIVAL_FRAMES[stem]) fail(`expected ${ARRIVAL_FRAMES[stem]} arrival frame(s) [data-arrival-frame], found ${frames}`);
  if (['Main-A', 'Issue-Cover-Desktop', 'Empty-Issue'].includes(stem)) {
    if ((code.match(/<figure\b[^>]*\sdata-hero\b/gi) || []).length !== 1) fail('exactly one hero plate (figure data-hero) required');
    if (!/\sdata-arrival-frame\s*=\s*["'](phone|desktop)["']/.test(code)) fail('the arrival frame must be data-arrival-frame="phone" or "desktop"');
  }
  if (stem === 'Empty-Issue') {
    const fig = (code.match(/<figure\b(?:(?!<\/figure>)[\s\S])*Window seat cushion(?:(?!<\/figure>)[\s\S])*<\/figure>/) || [''])[0];
    if (!/aria-label="[^"]*cushion/i.test(fig)) fail('window seat cushion drawing must be labelled as the cushion');
  }
  if (stem === 'Motion-Storyboard') {
    const f400 = (code.match(/>400 ms<\/p>[\s\S]*?<\/li>/) || [''])[0];
    if (!/height: 8px;[^"]*opacity: 0\.\d/.test(f400)) fail('400 ms frame must show the caption partially faded');
  }
  if (stem === 'Credits') {
    for (const [name, url] of Object.entries(LICENCES)) if (src.includes(`>${name}</a>`) && !src.includes(`href="${url}" style`)) fail(`licence ${name} not linked to ${url}`);
    const links = (src.match(/href="https:\/\/commons\.wikimedia\.org\/wiki\/File:/g) || []).length;
    if (links !== 18) fail(`expected 18 source links, found ${links}`);
  }
}

// ---------- canvas.json ----------
function checkIndex(index, files, fail) {
  if (index.v !== 3) fail('v must be 3');
  if (!index.createdOnFiles || index.createdOnFiles.v !== 1 || !index.createdOnFiles.at) fail('createdOnFiles {v:1,at} missing');
  const keys = Object.keys(index.boards || {});
  const order = index.order || [];
  if (keys.length !== order.length || keys.some((k) => !order.includes(k)) || new Set(order).size !== order.length) fail('order must list exactly the boards keys, once each');
  if (order[0] !== 'Main-A.dc.html') fail('order must start with Main-A.dc.html');
  for (const f of files) if (!keys.includes(f)) fail(`${f} exists on disk but is not listed in boards`);
  for (const [file, fr] of Object.entries(index.boards || {})) {
    if (!(fr.w >= 40 && fr.w <= 8000 && fr.h >= 40 && fr.h <= 8000)) fail(`${file}: w/h out of 40–8000`);
    if (fr.expand !== undefined && file !== 'Issue-Cover-Desktop.dc.html') fail(`${file}: expand is only for the desktop page board`);
  }
  if ((index.boards || {})['Issue-Cover-Desktop.dc.html']?.expand !== 'fill') fail('Issue-Cover-Desktop.dc.html needs expand "fill"');
  for (const [id, n] of Object.entries(index.notes || {})) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number' || typeof n.text !== 'string') fail(`note ${id} needs x,y,text`);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail(`note id ${id} invalid`);
    if (n.fill && !['gray', 'red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink'].includes(n.fill)) fail(`note ${id} fill ${n.fill} invalid`);
  }
  const notes = Object.values(index.notes || {}).map((n) => n.text || '').join('\n');
  for (const s of ['Below chapter 03 the desktop page matches the Main-A and Main-B boards one-to-one; not redrawn.', 'Standing row 1', '664', '1440 × 648',
    'Q1', 'C2', 'V2-1', 'V2-2', 'V2-3', 'V2-4', 'V2-5', 'V2-6', 'V2-7', 'V2-8']) if (!notes.includes(s)) fail(`board note missing: "${s}"`);
  if (/first act inside 740/i.test(notes)) fail('board note claims the first act is inside 740px');
  for (const b of ['Main-A.dc.html', 'Main-B.dc.html', 'Issue-Cover-Desktop.dc.html']) {
    const f = (index.boards || {})[b];
    if (!f) continue;
    const near = Object.values(index.notes || {}).some((n) => (n.text || '').includes(PLACEHOLDER_NOTE) && n.y >= f.y - 400 && n.y <= f.y + f.h && (n.x + (n.w || 0) <= f.x || n.x >= f.x + f.w));
    if (!near) fail(`${b}: no note outside the frame saying "${PLACEHOLDER_NOTE}"`);
  }
}

// ---------- browser ----------
function loadChromium() {
  const bases = [join(toolsDir, '..', '..', '..')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: toolsDir, encoding: 'utf8' }).trim();
    bases.push(dirname(common));
  } catch { /* not a git checkout */ }
  for (const base of bases) for (const pkg of ['apps/client-portal', 'apps/designer-portal', 'apps/admin-portal', '.']) {
    try {
      return createRequire(join(base, pkg, 'package.json')).resolve('@playwright/test');
    } catch { /* try the next */ }
  }
  return null;
}
async function openBrowser() {
  const p = loadChromium();
  if (!p) throw new Error('@playwright/test not found (looked in this checkout and the main checkout)');
  const mod = await import(pathToFileURL(p).href);
  return (mod.chromium ?? mod.default.chromium).launch();
}
// One measured arrival frame against R-v2-2, R-v2-13 and the Empty-Issue geometry (#3).
function checkFrame(f, w, fail) {
  const at = `${f.kind} arrival frame "${f.label}"`;
  const roles = f.rows.map((x) => x.n).join(',');
  if (roles !== '1,2,3') fail(`${at}: standing rows must be 1,2,3 in order, found [${roles}]`);
  for (const x of f.rows) {
    if (x.href !== null && ROW_HREF[x.n] && x.href !== ROW_HREF[x.n]) fail(`${at}: standing row ${x.n} must link to ${ROW_HREF[x.n]}, not ${x.href}`);
    for (const [n, zero] of Object.entries(ROW_ZERO)) if (n !== x.n && x.text.includes(zero)) fail(`${at}: "${zero}" is row ${n}'s zero state, shown in row ${x.n}`);
  }
  const ranks = f.anchors.map(rankOf);
  if (ranks.some((v, i) => i && v < ranks[i - 1]) || new Set(f.anchors).size !== f.anchors.length) fail(`${at}: chapter anchors out of canonical order: ${f.anchors.join(' ')}`);
  if (f.kind !== 'phone' && f.kind !== 'desktop') return;
  if (!f.tab) fail(`${at}: no paper tab [data-tab] in the hero plate`);
  else if (f.plate) {
    const cut = f.plate.bottom - f.tab.top;
    if (cut < 40 || cut > 48) fail(`${at}: paper tab cut ${Math.round(cut)} into the plate, not 44`);
  }
  if (!f.head) fail(`${at}: no #doorplate letterhead`);
  if (f.firstTab) fail(`${at}: first Tab stop after the letterhead is not standing row 1: ${f.firstTab}`);
  if (f.heroFocus) fail(`${at}: hero plate is focusable`);
  const row = (n) => f.rows.find((x) => x.n === n);
  if (f.kind === 'phone') {
    const r1 = row('1');
    const r3 = row('3');
    if (r1 && r1.top > 620) fail(`${at}: standing row 1 top ${Math.round(r1.top)} > 620${r1.top > 664 ? ' (past the 664 toolbar line)' : ''}`);
    if (r3 && r3.top > 740) fail(`${at}: standing row 3 top ${Math.round(r3.top)} > 740`);
    if (!f.plate) fail(`${at}: no hero plate`);
    else {
      if (w <= 430 && (f.plate.h < 340 || f.plate.h > 380)) fail(`${at}: hero height ${Math.round(f.plate.h)} outside 340–380 at ${w}`);
      if (Math.abs(f.plate.top - 140) > 2) fail(`${at}: hero plate top ${Math.round(f.plate.top)}, not 140 (purpose sentence 96–140 above it)`);
    }
    if (f.tab && f.tab.h > 120) fail(`${at}: paper tab ${Math.round(f.tab.h)} tall, over 116 (+4)`);
    if (f.capLines > 2) fail(`${at}: hero caption runs ${f.capLines} lines (two at most)`);
  } else {
    for (const x of f.rows) if (x.top > 880) fail(`${at}: standing row ${x.n} top ${Math.round(x.top)} > 880${x.top > 900 ? ' (hard fail past 900)' : ''}`);
    if (f.h2Lines !== undefined && f.h2Lines !== 1) fail(`${at}: tab headline wraps to ${f.h2Lines} lines (one line at 1440)`);
  }
}

async function measure(browser, w, load, fail, h) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  try {
    await page.route('**/*', (r) => (r.request().url().startsWith('file:') || r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await load(page);
    const r = await page.evaluate(() => {
      const rgba = (s) => { const m = s.match(/rgba?\(([^)]*)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
      const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const bgOf = (el) => {
        const stack = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
        let bg = [255, 255, 255, 1];
        for (const c of stack.reverse()) bg = over(c, bg);
        return bg;
      };
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const contrast = [];
      for (const cap of document.querySelectorAll('figcaption')) for (const el of [cap, ...cap.querySelectorAll('*')]) {
        if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const bg = bgOf(el);
        const fg = over(rgba(getComputedStyle(el).color), bg);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05);
        if (ratio < 4.5) contrast.push(`${ratio.toFixed(2)}:1 "${el.textContent.trim().slice(0, 50)}"`);
      }
      const small = [];
      for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [tabindex]:not([tabindex="-1"])')) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        const inline = el.tagName === 'A' && cs.display === 'inline' && [...el.parentElement.childNodes].some((n) => n !== el && n.textContent.trim());
        if (inline) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 44 || r.width < 44) small.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40)}"`);
      }
      // v2: caption size floor (names and dates in captions take the spec's 15px floor).
      // v3: a .plate-note is its own line, 14px or more and no larger than its caption line.
      const capSize = [];
      const noteShape = [];
      for (const cap of document.querySelectorAll('figcaption')) {
        const capPx = parseFloat(getComputedStyle(cap).fontSize);
        for (const el of [cap, ...cap.querySelectorAll('*')]) {
          if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const px = parseFloat(getComputedStyle(el).fontSize);
          const note = el.closest('.plate-note');
          if (px < (note ? 14 : 15)) capSize.push(`${px}px "${el.textContent.trim().slice(0, 50)}"`);
        }
        for (const note of cap.querySelectorAll('.plate-note')) {
          const cs = getComputedStyle(note);
          const px = parseFloat(cs.fontSize);
          if (cs.display !== 'block') noteShape.push(`display ${cs.display} "${note.textContent.trim().slice(0, 40)}"`);
          if (px > capPx) noteShape.push(`${px}px over its ${capPx}px caption line "${note.textContent.trim().slice(0, 40)}"`);
        }
      }
      // v2: no ink on photograph pixels. A text box may cross an <img> box only when an element
      // between the text and their nearest common ancestor is opaque paper, stock or card.
      const PAPER = ['rgb(250, 247, 242)', 'rgb(252, 250, 246)', 'rgb(255, 253, 249)'];
      const imgs = [...document.querySelectorAll('img')].filter(visible).map((img) => [img, img.getBoundingClientRect()]);
      const onImage = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const boxes = [...range.getClientRects()].filter((b) => b.width > 0 && b.height > 0);
        for (const [img, ib] of imgs) {
          const hit = boxes.some((b) => Math.min(b.right, ib.right) - Math.max(b.left, ib.left) > 0.5 && Math.min(b.bottom, ib.bottom) - Math.max(b.top, ib.top) > 0.5);
          if (!hit) continue;
          let shielded = false;
          for (let el = n.parentElement; el && !el.contains(img); el = el.parentElement) {
            const cs = getComputedStyle(el);
            if (PAPER.includes(cs.backgroundColor) && cs.opacity === '1') { shielded = true; break; }
          }
          if (!shielded) onImage.push(`"${n.textContent.trim().slice(0, 40)}" over ${img.getAttribute('src')?.slice(7, 15)}`);
        }
      }
      // v3: arrival frames ([data-arrival-frame]). Every frame: three standing rows, roles 1, 2, 3
      // in DOM order; a linked row goes to its fixed anchor; chapter anchors never run backwards.
      // phone and desktop frames: geometry page-relative to the frame's #doorplate top.
      const CANON = ['cover', 'doorstep', 'approvals', 'key', 'room', 'road', 'note', 'previously', 'mat'];
      const rankOf = (a) => CANON.indexOf(a.startsWith('room-') ? 'room' : a);
      const box = (el) => el.getBoundingClientRect();
      const frames = [];
      for (const fr of document.querySelectorAll('[data-arrival-frame]')) {
        const kind = fr.getAttribute('data-arrival-frame');
        const head = fr.querySelector('#doorplate');
        const top0 = head ? box(head).top : box(fr).top;
        const rows = [...fr.querySelectorAll('[data-standing-row]')].map((el) => ({ n: el.getAttribute('data-standing-row'), href: el.getAttribute('href'), text: el.textContent.trim().replace(/\s+/g, ' '), top: box(el).top - top0 }));
        const anchors = [...fr.querySelectorAll('section[id], [data-anchor]')].map((el) => el.getAttribute('data-anchor') || el.id).filter((a) => rankOf(a) >= 0);
        const f = { kind, head: Boolean(head), rows, anchors, label: (fr.getAttribute('aria-label') || kind).slice(0, 40) };
        if (kind === 'phone' || kind === 'desktop') {
          const hero = fr.querySelector('figure[data-hero]');
          const plate = hero && (hero.querySelector('[data-plate]') || hero.querySelector('img'));
          const tab = hero && hero.querySelector('[data-tab]');
          const cap = hero && hero.querySelector('figcaption');
          if (plate) { const b = box(plate); f.plate = { top: b.top - top0, bottom: b.bottom - top0, h: b.height }; }
          if (tab) { const b = box(tab); f.tab = { top: b.top - top0, bottom: b.bottom - top0, h: b.height }; }
          if (cap) { const cs = getComputedStyle(cap); f.capLines = Math.round(box(cap).height / parseFloat(cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.2 : cs.lineHeight)); }
          const h2 = tab && tab.querySelector('h2');
          if (h2) { const cs = getComputedStyle(h2); f.h2Lines = Math.round(box(h2).height / parseFloat(cs.lineHeight)); }
          const focusable = (el) => el.tabIndex >= 0 || el.closest('a[href], button, [tabindex]:not([tabindex="-1"])');
          f.heroFocus = Boolean(hero && (focusable(hero) || (plate && focusable(plate))));
          const tabbable = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, summary, [tabindex]')]
            .filter((el) => el.tabIndex >= 0 && !el.disabled && visible(el));
          const after = head ? tabbable.find((el) => head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !head.contains(el)) : null;
          const row1 = fr.querySelector('[data-standing-row="1"]');
          f.firstTab = after && after === row1 ? null : `"${(after?.textContent || 'nothing').trim().slice(0, 40)}"`;
        }
        frames.push(f);
      }
      const contentH = Math.ceil(Math.max(document.body.scrollHeight, ...[...document.body.children].map((el) => box(el).bottom + window.scrollY)));
      return { contrast, small, sw: document.documentElement.scrollWidth, capSize, noteShape, onImage, frames, contentH };
    });
    for (const c of r.contrast) fail(`figcaption contrast ${c} (needs 4.5:1)`);
    for (const s of r.small) fail(`target under 44px: ${s}`);
    if (r.sw > w) fail(`horizontal overflow: scrollWidth ${r.sw} > ${w}`);
    if (h && r.contentH > h) fail(`content height ${r.contentH} > frame height ${h} (canvas.json)`);
    for (const c of r.capSize) fail(`caption under its floor (15px; 14px on a .plate-note): ${c}`);
    for (const c of r.noteShape) fail(`.plate-note must be its own line at or under its caption size: ${c}`);
    for (const t of r.onImage) fail(`text on photograph pixels: ${t}`);
    for (const f of r.frames) checkFrame(f, w, fail);
  } finally {
    await page.close();
  }
}

// ---------- run ----------
function boardIdsOf(entries) {
  const map = new Map();
  for (const [file, src] of entries) map.set(file, new Set((blankCode(src).match(TAG) || []).map((g) => attr(g, 'id')).filter((v) => v && !v.includes('{{'))));
  return map;
}

async function main(only) {
  const errors = [];
  const at = (where) => (msg) => errors.push(`${where}: ${msg}`);
  const indexPath = join(root, 'canvas.json');
  let index = null;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (e) {
    at('canvas.json')(`unreadable: ${e.message}`);
  }
  const files = existsSync(root) ? readdirSync(root).filter((f) => f.endsWith('.dc.html')) : [];
  if (index) checkIndex(index, files, at('canvas.json'));
  const boards = index ? Object.entries(index.boards || {}).filter(([f]) => existsSync(join(root, f)) || (at(f)('file missing'), false)) : [];
  const srcs = boards.map(([f]) => [f, readFileSync(join(root, f), 'utf8')]);
  const ids = boardIdsOf(srcs);
  const picked = boards.filter(([f]) => !only || only.includes(f.replace(/\.dc\.html$/, '')));
  if (only) for (const s of only) if (!boards.some(([f]) => f === `${s}.dc.html`)) at(`${s}.dc.html`)('not listed in canvas.json boards');
  for (const [f, frame] of picked) {
    const src = ids && srcs.find(([k]) => k === f)[1];
    checkBoard(f, src, frame, ids, at(f));
    checkCopy(f.replace(/\.dc\.html$/, ''), src, at(f));
  }
  const confirms = srcs.filter(([f]) => /^(Main-A|Main-B|Approval-Pair)\.dc\.html$/.test(f)).reduce((n, [, s]) => n + (squash(boardText(s).all).match(/Edition 2 is approved/g) || []).length, 0);
  const credits = srcs.find(([f]) => f === 'Credits.dc.html');
  if (credits) {
    const used = new Set(srcs.filter(([f]) => f !== 'Credits.dc.html').flatMap(([, s]) => [...s.matchAll(/\/_blob\/([0-9a-f]{32})/g)].map((m) => m[1])));
    for (const id of used) if (!credits[1].includes(`/_blob/${id}`)) at('Credits.dc.html')(`placeholder photo /_blob/${id} used on a board but not declared on Credits`);
  }
  if (!only && confirms !== 1) at('Main + Approval-Pair')(`the selected confirmation state must show once, found ${confirms}`);
  // Chapter order (v3, finding 27e): the canonical sequence of rendered anchors on the whole phone
  // issue (Main-A then Main-B, split after the living room), the Empty Issue, and each phase frame.
  const codeOf = (f) => { const e = srcs.find(([k]) => k === f); return e ? blankCode(e[1]) : null; };
  const a = codeOf('Main-A.dc.html');
  const b = codeOf('Main-B.dc.html');
  if (a && b) {
    const sa = anchorsOf(a);
    const sb = anchorsOf(b);
    if (!fullOrder(sa.concat(sb))) at('Main-A + Main-B')(`chapters out of canonical order: ${sa.concat(sb).join(' ')}`);
    if (sa[sa.length - 1] !== 'room-living' || sb[0] !== 'room-study') at('Main-A + Main-B')(`Main-A must end after the living room and Main-B open on the study: ${sa.slice(-1)} | ${sb[0]}`);
  }
  const empty = codeOf('Empty-Issue.dc.html');
  if (empty && !fullOrder(anchorsOf(empty))) at('Empty-Issue.dc.html')(`chapters out of canonical order (every chapter kept, R-v2-12): ${anchorsOf(empty).join(' ')}`);
  const strip = codeOf('Phase-Strip.dc.html');
  if (strip) for (const fr of strip.split(/(?=<article\b[^>]*\sdata-arrival-frame)/).slice(1)) {
    if (!fullOrder(anchorsOf(fr))) at('Phase-Strip.dc.html')(`phase frame chapters out of canonical order: ${anchorsOf(fr).join(' ')}`);
  }
  let browser;
  try {
    browser = await openBrowser();
    for (const [f, frame] of picked) await measure(browser, frame.w, (page) => page.goto(pathToFileURL(join(root, f)).href), at(`${f} (Chromium)`), frame.h);
  } catch (e) {
    at('Chromium')(`browser checks could not run: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }
  if (errors.length) {
    console.error(`check-canvas: FAIL (${errors.length})\n` + errors.map((e) => `  - ${e}`).join('\n'));
    return 1;
  }
  console.log('check-canvas: ok');
  console.log(`  ${picked.length} boards loaded in Chromium at native width x 900; measurements use fallback fonts with remote images and fonts blocked; the 200 percent zoom column is a drawn specimen, inspected, not reflowed.`);
  return 0;
}

// ---------- self-test ----------
// v3 fixture helpers: a placeholder note line, arrival frames and chapter-03 consent stages.
const NOTE_GOOD = '<span class="plate-note" style="display: block; font-size: 15px">Placeholder, not job imagery</span>';
const rowsOf = (rows) => rows.map(([n, t, href]) => `<a data-standing-row="${n}" href="${href || ROW_HREF[n]}" style="display: flex; align-items: center; min-height: 44px; color: #3E5145">${t}</a>`).join('');
const frameOf = (kind, rows, extra = '') => `<div data-arrival-frame="${kind}" aria-label="Fixture frame">${rowsOf(rows)}${extra}</div>`;
function phone(o = {}) {
  const { before = '', between = '', plateH = 340, focusable = false, purposeH = 44, cut = 44, tabH = 116, caption = 'Hero · Birchwood Studio · 2 June 2026' } = o;
  const img = `<img data-plate src="/_blob/0126" width="360" height="${plateH}" alt="Hero" style="display: block; width: 360px; height: ${plateH}px">`;
  return `<div data-arrival-frame="phone" style="width: 360px"><header id="doorplate" style="height: 96px; margin: 0"><p style="margin: 0">Letterhead</p></header>
<div style="height: ${purposeH}px"></div>${before}
<figure data-hero style="margin: 0; display: grid; grid-template-columns: 360px; grid-template-rows: ${plateH - cut}px ${cut}px auto auto">
<div data-tab style="grid-column: 1; grid-row: 2 / 4; position: relative; z-index: 1; align-self: start; box-sizing: border-box; height: ${tabH}px; width: 280px; background: #FAF7F2"><p style="margin: 0">Tab</p></div>
${focusable ? `<a href="#top" style="grid-column: 1; grid-row: 1 / 3; display: block; color: #3E5145">${img}</a>` : `<div style="grid-column: 1; grid-row: 1 / 3">${img}</div>`}
<figcaption style="grid-row: 4; margin: 8px 0 0; font-size: 15px; line-height: 22px; color: #4E4339">${caption}${NOTE_GOOD}</figcaption></figure>
${rowsOf([['1', 'Row one']])}${between}${rowsOf([['2', 'Row two'], ['3', 'Row three']])}</div>`;
}
const sig03 = ({ value, act, fill = '#3E5145', reason = false }) => `<section data-chapter="03"><label for="sig-name-x">Your full name</label><input id="sig-name-x" type="text"${value ? ` value="${value}"` : ''} style="min-height: 48px"><button type="button" ${act} style="min-height: 48px; background: ${fill}; color: #2C2926; border: 1px solid #3E5145">Approve this edition</button>${reason ? `<p id="why-x">${UNAVAILABLE_REASON}</p>` : ''}</section>`;
const GOOD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fixture</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>body{margin:0;background:#FAF7F2;color:#2C2926}</style>
</helmet>
<div id="top" style="width: 400px; box-sizing: border-box; padding: 16px; background: #FAF7F2">
<p>A quiet sentence with a <a href="#top" style="color: #3E5145">link inside it</a>.</p>
<a href='#top' style="display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; color: #3E5145">Back to top</a>
<a href="Other.dc.html#here" style="display: inline-flex; align-items: center; min-height: 44px; color: #3E5145">Other board</a>
<button type="button" aria-describedby="note" style="min-height: 48px; padding: 0 16px; background: #3E5145; color: #FFFDF9; border: 0">Continue</button>
<p id="note">Nothing is charged until you confirm.</p>
<div data-c1-alternative style="width: 60px; height: 40px; background: #FCFAF6; box-shadow: 0 2px 8px rgba(44,41,38,.08)"></div>
<figure style="margin: 0; position: relative"><img src="/_blob/0123" width="120" height="80" alt="A walnut sideboard" style="display: block; width: 120px; height: 80px">
<p style="position: absolute; left: 0; top: 60px; margin: 0; padding: 2px 4px; background: #FAF7F2">Tab</p>
<figcaption style="margin: 8px 0 0; font-size: 15px; color: #4E4339">Walnut sideboard · photographed by Harmon Bench Works · 9 October 2026${NOTE_GOOD}</figcaption></figure>
<figure style="margin: 0"><img src="/_blob/0124" width="120" height="80" alt="The catalogue sideboard" style="display: block; width: 120px; height: 80px">
<figcaption style="margin: 8px 0 0; font-size: 15px; color: #4E4339">Walnut sideboard, the same model · from Harmon Bench Works' catalogue · photographed 2025${NOTE_GOOD}</figcaption></figure>
<ol data-chapter-order style="margin: 0"><li>02 · Invoices</li><li>03 · Approvals</li></ol>
<ol data-chapter-order style="margin: 0"><li>02 · Invoices</li><li>03 · Approvals</li></ol>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":400,"height":1200}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;
const FRAME = { w: 400, h: 1200 };
const BEFORE_DIV_END = '</div>\n</x-dc>';
const add = (html) => (s) => s.replace(BEFORE_DIV_END, `${html}\n${BEFORE_DIV_END}`);
const PROBES = [
  ['lexicon word in rendered text', add('<p>A curated room.</p>'), /lexicon word "curated"/],
  ['lexicon word split by a tag', add('<p>A cur<span>ated</span> room.</p>'), /lexicon word "curated"/],
  ['entity-encoded lexicon word', add('<p>A cur&#97;ted room.</p>'), /lexicon word "curated"/],
  ['lexicon word in alt text', (s) => s.replace('alt="A walnut sideboard"', 'alt="An AI-powered sideboard"'), /lexicon word "AI-powered"/],
  ['lexicon word in aria-label', add('<button type="button" aria-label="Ask Claude" style="min-height: 48px; min-width: 48px">Ask</button>'), /lexicon word "Claude"/],
  ['lexicon word in title attribute', add('<p title="A seamless finish">Finish</p>'), /lexicon word "seamless"/],
  ['model name', add('<p>Drafted with GPT for you.</p>'), /lexicon word "GPT"/],
  ['exclamation mark', add('<p>Welcome home!</p>'), /exclamation/],
  ['entity-encoded emoji', add('<p>Welcome &#x1F600;</p>'), /emoji/],
  ['literal percent sign', add('<p>Half paid, 50% so far.</p>'), /percent sign in rendered/],
  ['percent in CSS content', (s) => s.replace('</style>', '.x::after{content:"50%"}</style>'), /percent sign in CSS content/],
  ['NN / NN denominator', add('<p>Step 3 / 12</p>'), /denominator/],
  ['catalogue exemption reused outside its field', (s) => s.replace("Walnut sideboard, the same model · from Harmon Bench Works' catalogue", "Walnut sideboard, the same model of sofa · from Harmon Bench Works' catalogue"), /lexicon word "model"/],
  ['catalogue phrase outside a caption', add('<p>Walnut sideboard, the same model</p>'), /lexicon word "model" in rendered/],
  ['entity-encoded caption separators', (s) => s.replace('Walnut sideboard · photographed', 'Walnut sideboard &middot; oiled &#183; photographed'), /figcaption first line must be exactly/],
  ['red hex', add('<p style="color: #C8102E">Overdue</p>'), /red colour #C8102E/],
  ['red rgb()', add('<p style="color: rgb(200, 30, 30)">Overdue</p>'), /red colour rgb/],
  ['red hsl()', add('<p style="color: hsl(355, 80%, 45%)">Overdue</p>'), /red colour hsl/],
  ['named red', add('<p style="color: crimson">Overdue</p>'), /red colour crimson/],
  ['red SVG stroke', add('<svg role="img" aria-label="Mark" width="10" height="10"><path d="M0 0h10" stroke="#E0201C"></path></svg>'), /red colour #E0201C/],
  ['box-shadow off the C1 alternative', add('<div style="box-shadow: 0 1px 4px rgba(0,0,0,.2)"></div>'), /shadow outside the C1 alternative/],
  ['filter drop-shadow', add('<img src="/_blob/0125" alt="Lamp" style="filter: drop-shadow(0 2px 4px #0002)">'), /shadow outside the C1 alternative/],
  ['shadow in a style block', (s) => s.replace('</style>', 'p{text-shadow:0 1px 1px #000}</style>'), /shadow in a <style> block/],
  ['single-quoted dead fragment', add("<a href='#missing' style=\"display: inline-flex; min-height: 44px; min-width: 44px; color: #3E5145\">Gone</a>"), /href="#missing" names no id/],
  ['dead cross-board fragment', add('<a href="Other.dc.html#nowhere" style="display: inline-flex; min-height: 44px; min-width: 44px; color: #3E5145">Gone</a>'), /names no id on Other\.dc\.html/],
  ['unlisted destination board', add('<a href="Ghost.dc.html#here" style="display: inline-flex; min-height: 44px; min-width: 44px; color: #3E5145">Gone</a>'), /board not listed/],
  ['dead aria-describedby', add('<button type="button" aria-describedby="nope" style="min-height: 48px; min-width: 48px">Go</button>'), /aria-describedby="nope"/],
  ['retired clay link', add('<a href="#top" style="display: inline-flex; min-height: 44px; min-width: 44px; color: #8B7355">Clay</a>'), /#8B7355/],
  ['support.js outside head', (s) => s.replace('<script src="./support.js"></script>\n</head>', '</head>\n<script src="./support.js"></script>'), /support\.js line missing/],
  ['external script', (s) => s.replace('</head>', '<script src="https://cdn.example/x.js"></script>\n</head>'), /external script/],
  ['figcaption contrast', (s) => s.replace('font-size: 15px; color: #4E4339">Walnut sideboard ·', 'font-size: 15px; color: #B8B2A8">Walnut sideboard ·'), /figcaption contrast/],
  ['target under 44px', add('<button type="button" style="height: 24px; padding: 0 8px">Tiny</button>'), /target under 44px/],
  ['horizontal overflow', add('<div style="width: 640px; height: 10px"></div>'), /horizontal overflow/],
  // v2 probes (SQ-1570), one per check; v3 (SQ-1573) reshaped for .plate-note lines and arrival frames.
  ['fourth caption field that is not a qualifier', (s) => s.replace('9 October 2026<span class="plate-note"', '9 October 2026 · oiled<span class="plate-note"'), /figcaption first line must be exactly/],
  ['photo caption without its placeholder note', (s) => s.replace(`photographed 2025${NOTE_GOOD}`, 'photographed 2025'), /photo caption needs its "Placeholder, not job imagery" \.plate-note line/],
  ['standing row 1 below 620', add(phone({ before: '<div style="height: 560px"></div>' })), /standing row 1 top \d+ > 620/],
  ['standing row 3 below 740', add(phone({ between: '<div style="height: 700px"></div>' })), /standing row 3 top \d+ > 740/],
  ['first Tab stop after the letterhead is not row 1', add(phone({ before: '<button type="button" style="min-height: 48px; min-width: 48px">First</button>' })), /first Tab stop after the letterhead is not standing row 1: "First"/],
  ['hero height outside 340–380', add(phone({ plateH: 300 })), /hero height 300 outside 340–380/],
  ['hero plate focusable', add(phone({ focusable: true })), /hero plate is focusable/],
  ['caption under 15px', (s) => s.replace('font-size: 15px; color: #4E4339">Walnut sideboard ·', 'font-size: 12px; color: #4E4339">Walnut sideboard ·'), /caption under its floor/],
  ['text on photograph pixels', (s) => s.replace('padding: 2px 4px; background: #FAF7F2">Tab', 'padding: 2px 4px">Tab'), /text on photograph pixels: "Tab"/],
  ['translucent tab over a photograph', (s) => s.replace('padding: 2px 4px; background: #FAF7F2">Tab', 'padding: 2px 4px; background: rgba(250, 247, 242, 0.8)">Tab'), /text on photograph pixels: "Tab"/],
  ['data-dimmable on a figure', (s) => s.replace('<figure style="margin: 0; position: relative">', '<figure data-dimmable style="margin: 0; position: relative">'), /data-dimmable on a figure/],
  ['img without width and height', (s) => s.replace('<img src="/_blob/0124" width="120" height="80"', '<img src="/_blob/0124"'), /needs width and height/],
  ['chapter 03 frame without the signature step', add(`<section><p>03 · Approvals</p><button type="button" data-act-state="ready" style="min-height: 48px; background: #3E5145; color: #FFFDF9">Approve this edition · $7,480.00</button></section>`), /chapter 03 frame without the signature step/],
  ['chapter 03 act before the signature step', add(`<section data-chapter="03"><p>The sofa</p><button type="button" data-act-state="ready" style="min-height: 48px; background: #3E5145; color: #FFFDF9">Approve this edition · $7,480.00</button><label for="sig-name-x">Your full name</label><input id="sig-name-x" type="text" value="June Brennan" style="min-height: 48px"></section>`), /Approve act must follow the signature step/],
  ['placeholder note in-frame on an arrival board', (s) => s.replace('<body>', '<body data-arrival-board>'), /placeholder note in-frame on an arrival board/],
  ['chapter order differs between frames', (s) => s.replace('<ol data-chapter-order style="margin: 0"><li>02 · Invoices</li><li>03 · Approvals</li></ol>\n</div>', '<ol data-chapter-order style="margin: 0"><li>03 · Approvals</li><li>02 · Invoices</li></ol>\n</div>'), /chapter order differs/],
  // v3 probes (SQ-1573), one per new check.
  ['content taller than its canvas frame', add('<div style="height: 1300px"></div>'), /content height \d+ > frame height 1200/],
  ['qualifier as a fourth caption segment', (s) => s.replace(`9 October 2026${NOTE_GOOD}`, '9 October 2026 · placeholder, not job imagery'), /figcaption first line must be exactly/],
  ['qualifier as loose caption text', (s) => s.replace(`9 October 2026${NOTE_GOOD}`, '9 October 2026<br>Placeholder, not job imagery'), /qualifier "placeholder, not job imagery" in the caption line/],
  ['plate-note set inline', (s) => s.replace('<span class="plate-note" style="display: block;', '<span class="plate-note" style="display: inline;'), /\.plate-note must be its own line/],
  ['plate-note carrying segments', (s) => s.replace(`9 October 2026${NOTE_GOOD}`, '9 October 2026<span class="plate-note" style="display: block; font-size: 15px">Placeholder · not job imagery</span>'), /\.plate-note is one qualifier/],
  ['caption text after the plate-note line', (s) => s.replace(`9 October 2026${NOTE_GOOD}`, `9 October 2026${NOTE_GOOD} oiled`), /caption text after the \.plate-note line/],
  ['Approve act without data-act-state', add(sig03({ value: 'June Brennan', act: '' })), /needs data-act-state="ready\|unavailable"/],
  ['ready act before a signed field', add(sig03({ value: '', act: 'data-act-state="ready"' })), /is "ready" before its signature field is signed/],
  ['unavailable act after a signed field', add(sig03({ value: 'June Brennan', act: 'data-act-state="unavailable" aria-disabled="true" aria-describedby="why-x"', fill: '#FAF7F2', reason: true })), /is "unavailable" after a signed field/],
  ['unavailable act without its reason', add(sig03({ value: '', act: 'data-act-state="unavailable" aria-disabled="true"', fill: '#FAF7F2' })), /must describe its reason "Sign first, then hold to approve\."/],
  ['unavailable act that is forest-filled', add(sig03({ value: '', act: 'data-act-state="unavailable" aria-disabled="true" aria-describedby="why-x"', reason: true })), /unavailable act must not be forest-filled/],
  ['hero specimen at 390 × 352', add('<img data-specimen="hero-390" src="/_blob/0130" width="390" height="352" alt="Hero specimen" style="display: block; width: 360px; height: 352px"><p>360 × 325 at a 360 screen.</p>'), /hero specimen at 390 must be 390 x 340/],
  ['hero specimen without its 360 note', add('<img data-specimen="hero-390" src="/_blob/0131" width="390" height="340" alt="Hero specimen" style="display: block; width: 360px; height: 340px">'), /hero specimen note must give "360 × 314"/],
  ['phone hero plate not at 140', add(phone({ purposeH: 0 })), /hero plate top \d+, not 140/],
  ['paper tab not cut 44 into the plate', add(phone({ cut: 20 })), /paper tab cut 20 into the plate, not 44/],
  ['paper tab taller than 116', add(phone({ tabH: 160 })), /paper tab 160 tall, over 116/],
  ['hero caption over two lines', add(phone({ caption: 'A long caption that runs on and on · photographed by Birchwood Studio for the cover of the issue · 2 June 2026, late in the afternoon light' })), /hero caption runs \d lines/],
  ['standing rows out of order', add(frameOf('specimen', [['2', 'Row two'], ['1', 'Row one'], ['3', 'Row three']])), /standing rows must be 1,2,3 in order, found \[2,1,3\]/],
  ['a missing standing row', add(frameOf('specimen', [['1', 'Row one'], ['2', 'Row two']])), /standing rows must be 1,2,3 in order, found \[1,2\]/],
  ['zero state in the wrong row', add(frameOf('specimen', [['1', 'No invoices open.'], ['2', 'Row two'], ['3', 'Row three']])), /"No invoices open" is row 3's zero state, shown in row 1/],
  ['standing row linked to the wrong anchor', add(frameOf('specimen', [['1', 'Row one', '#approvals'], ['2', 'Row two'], ['3', 'Row three']])), /standing row 1 must link to #letterbox, not #approvals/],
  ['chapter anchors out of order in a frame', add(frameOf('specimen', [['1', 'Row one'], ['2', 'Row two'], ['3', 'Row three']], '<ol><li data-anchor="approvals">03</li><li data-anchor="doorstep">02</li></ol>')), /chapter anchors out of canonical order: approvals doorstep/],
  ['desktop standing row below 880', add(`<div data-arrival-frame="desktop"><header id="doorplate" style="height: 96px"><p style="margin: 0">Letterhead</p></header><div style="height: 800px"></div>${rowsOf([['1', 'Row one'], ['2', 'Row two'], ['3', 'Row three']])}</div>`), /standing row 1 top \d+ > 880/],
  ['plate types out of PLAN order', add('<p class="fr">1 · Hero · at size</p><p class="fr">2 · Concept render · a state</p>'), /numbered plates must be 1 Hero \/ 2 Chapter plate/],
];
async function selfTest() {
  const other = '<div id="here"></div>';
  const runOne = async (browser, src) => {
    const errs = [];
    const fail = (m) => errs.push(m);
    const ids = boardIdsOf([['Fixture.dc.html', src], ['Other.dc.html', other]]);
    checkBoard('Fixture.dc.html', src, FRAME, ids, fail);
    await measure(browser, FRAME.w, (page) => page.setContent(src), fail, FRAME.h);
    return errs;
  };
  let browser;
  let missed = 0;
  try {
    browser = await openBrowser();
    const base = await runOne(browser, GOOD);
    if (base.length) {
      console.error('self-test: the clean fixture is not clean:\n' + base.map((e) => `  - ${e}`).join('\n'));
      return 1;
    }
    console.log('self-test: clean fixture passes');
    for (const [name, mutate, expect] of PROBES) {
      const bad = mutate(GOOD);
      if (bad === GOOD) { console.error(`  MISSED ${name}: mutation did not apply`); missed += 1; continue; }
      const errs = await runOne(browser, bad);
      if (errs.some((e) => expect.test(e))) console.log(`  caught  ${name}`);
      else { console.error(`  MISSED  ${name}: ${errs.join(' | ') || 'no error'}`); missed += 1; }
    }
  } catch (e) {
    console.error(`self-test: could not run: ${e.message}`);
    return 1;
  } finally {
    if (browser) await browser.close();
  }
  const caught = PROBES.length - missed;
  if (missed) {
    console.error(`self-test: FAIL, ${caught} of ${PROBES.length} seeded problems caught`);
    return 1;
  }
  console.log(`self-test: ok, ${caught} of ${PROBES.length} seeded problems caught`);
  return 0;
}

const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim().replace(/\.dc\.html$/, '')) : null;
process.exitCode = args.includes('--self-test') ? await selfTest() : await main(only);
