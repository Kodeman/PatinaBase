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

  // Captions: decoded, exactly what · whose · when, plus at most one trailing qualifier field
  // (v2: "· placeholder, not job imagery" on a placeholder photograph; "· placeholder composition"
  // on the CSS board collage). A plate holding an uploaded photograph must carry a qualifier.
  const figs = code.match(/<figure\b[\s\S]*?<\/figure>/gi) || [];
  if ((code.match(/<figure\b/gi) || []).length !== figs.length) fail('unbalanced <figure> markup');
  // Arrival boards (Main, Issue-Cover-Desktop) carry the placeholder declaration once, as a canvas
  // note beside the frame, so in-frame photo captions there are the bare three segments.
  const arrival = /^(Main|Issue-Cover-Desktop)\.dc\.html$/.test(file) || /\sdata-arrival-board\b/.test(src);
  for (const fig of figs) {
    const cap = fig.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    if (!cap) { fail(`<figure> without <figcaption>: ${fig.slice(0, 70)}`); continue; }
    const fields = squash(render(cap[1])).split(' · ');
    const qualified = QUALIFIERS.includes(fields[fields.length - 1]);
    const core = qualified ? fields.length - 1 : fields.length;
    if (core !== 3) fail(`figcaption must be exactly what · whose · when (plus one qualifier): "${fields.join(' · ').slice(0, 90)}"`);
    if (arrival && fields[fields.length - 1] === QUALIFIERS[0]) fail(`placeholder suffix in-frame on an arrival board (it lives in the board note): "${fields.join(' · ').slice(0, 90)}"`);
    else if (!arrival && /<img\b[^>]*\ssrc\s*=\s*["']?\/_blob\//i.test(fig) && !qualified) fail(`photo caption must end "· ${QUALIFIERS[0]}": "${fields.join(' · ').slice(0, 90)}"`);
  }

  // Chapter 03 (v2): every frame of the approvals chapter holds the staged consent, the signature
  // field, before its forest act. A frame is a <section> whose text opens on "03 · Approvals" or
  // that carries data-chapter="03".
  for (const sec of sections(code)) {
    if (!(hasAttr(sec.tag, 'data-chapter') && attr(sec.tag, 'data-chapter') === '03') && !squash(render(sec.body)).startsWith('03 · Approvals')) continue;
    const sig = sec.body.search(/<input\b[^>]*\sid\s*=\s*["']sig-name/i);
    const act = sec.body.search(/<button\b[^>]*>\s*Approve this edition/i);
    if (sig < 0) fail(`chapter 03 frame without the signature step (an input id="sig-name…"): ${sec.tag.slice(0, 70)}`);
    else if (act < 0 || act < sig) fail(`chapter 03 frame: the Approve act must follow the signature step: ${sec.tag.slice(0, 70)}`);
  }

  // Chapter order (v2): every list marked data-chapter-order on a board names the same chapters
  // in the same order.
  const orders = [...code.matchAll(/<ol\b[^>]*\sdata-chapter-order\b[^>]*>([\s\S]*?)<\/ol>/gi)].map((m) => [...m[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => squash(render(li[1])).split(' ')[0]).join(' '));
  for (const o of orders.slice(1)) if (o !== orders[0]) fail(`chapter order differs between frames: "${orders[0]}" vs "${o}"`);
}
const QUALIFIERS = ['placeholder, not job imagery', 'placeholder composition'];
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
const BOARD_CAPTION = 'Living room board · Birchwood Studio · 2 June 2026 · placeholder composition';
const SETTLED = 'Approved by June Brennan · 21 October 2026';
const REQUIRED = {
  Main: [...ARRIVAL, ...EYEBROWS, '10 · Earlier', APPROVE, CHIP, COLOPHON, ...GROUPS, 'View invoice', PAY, LINEN, 'Your full name',
    'Type your full name before approving.', 'Edition 4 · approved by Maren · 21 October', ...PAINT, HERO_CAPTION, 'Total outstanding $1,375.00',
    'Living room as measured · photographed by Birchwood Studio · 2 June 2026', 'Lake Cottage, the next issue', 'Harmon Bench Works, Dayton', '22 January 2027'],
  'Issue-Cover-Desktop': [...ARRIVAL, ...EYEBROWS, COLOPHON, ...GROUPS, 'View invoice', PAY, HERO_CAPTION, APPROVE, 'Your full name', 'Portrait template'],
  'Approval-Pair': [APPROVE, LINEN, 'Your full name', 'Send change request', "What you'd like changed", 'Confirm pause',
    "This records that you want to pause and talk it through. It doesn't approve or reject the edition.", 'Edition 2 is approved', SETTLED],
  'Living-Room-Band': [CHIP, ...PAINT, 'Living room as measured · photographed by Birchwood Studio · 2 June 2026'],
  'Plate-Grammar': [LINEN, '1440 × 648', '1248 × 648', '390 × 352', '72svh', 'Held plate', 'Drawing', 'Material run', 'Document cover', 'Concept render', 'Clipping study'],
  'Drawings-and-Materials': [BOARD_CAPTION, 'Sheet A-201, living room elevations', 'notch', 'hairline', 'below'],
  'Phase-Strip': ['nothing moves under Earlier', '02 · Invoices', '09 · Updates'],
  'Press-Band-Designer': ['A new edition is ready', 'placeholder, not job imagery', 'The cover is a drawing until a photograph arrives', '16:10', '0.86'],
  'Type-and-Rhythm': ['INV-2026-017 · $300.00 of $800.00 · due 2 November', '200 percent zoom'],
  'Motion-Storyboard': ['400 ms', '520 ms', 'Reduced motion'],
  'Empty-Issue': [COLOPHON, 'photograph to follow'],
  Credits: [...AUTHORS, 'Cropped from a living-room photograph', 'cropped in layout'],
};
const RETIRED = ['Farrow', 'Benjamin Moore', 'Sherwin', 'Little Greene', 'Pay this invoice', 'kept under Earlier', 'inside 740',
  'Walnut sideboard, in the workshop · photographed by Harmon Bench Works · 15 October 2026', 'Oatmeal performance linen, the sample', 'Due this week', 'Due later'];
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
  if (stem === 'Main' || stem === 'Issue-Cover-Desktop') {
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
    if ((stem === 'Main' || stem === 'Approval-Pair' || name === PAY) && (need < 0 || need < lastAct)) fail(`"${name}" is not preceded by its ${acts[name]} step`);
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
    const labels = (squash(render(group)).match(/placeholder, not job imagery/g) || []).length;
    if (!opts || labels !== opts) fail(`hero picker: ${opts} options but ${labels} "placeholder, not job imagery" labels`);
    // Never the cover: workshop scene (02), samples and grain (03, 08), the catalogue sideboard (01, V2-1)
    // and the concept render (05).
    for (const ineligible of ['8918ba43d43b2ddc8243b2500da76b63', 'c9c72d856094c1848b7601f5abf7c9b7', '09c3628263fd2b19100d211910bc5923',
      '415b92f4b388fc2702b95bf2dab638cb', 'bedee857d00494f6430cb6cf9fc0d7e5']) if (group.includes(ineligible)) fail(`hero picker offers an ineligible source (${ineligible.slice(0, 8)})`);
  }
  if (stem === 'Phase-Strip' && (code.match(/<ol\b[^>]*\sdata-chapter-order\b/gi) || []).length !== 4) fail('each of the four phase frames needs its data-chapter-order list');
  if (stem === 'Main') {
    for (const [n, href] of [['1', '#letterbox'], ['2', '#approvals'], ['3', '#ledger']]) {
      const row = tags.find((g) => /^<a\b/i.test(g) && attr(g, 'data-standing-row') === n);
      if (!row) fail(`standing row ${n} missing (an <a data-standing-row="${n}">)`);
      else if (attr(row, 'href') !== href) fail(`standing row ${n} must link to ${href}`);
    }
    if ((code.match(/<figure\b[^>]*\sdata-hero\b/gi) || []).length !== 1) fail('exactly one hero plate (figure data-hero) required');
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
  if (order[0] !== 'Main.dc.html') fail('order must start with Main.dc.html');
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
  for (const s of ['Below chapter 03 the desktop page matches the Main board one-to-one; not redrawn.', 'Standing row 1', '664', '1440 × 648',
    'Q1', 'C2', 'V2-1', 'V2-2', 'V2-3', 'V2-4', 'V2-5', 'V2-6', 'V2-7', 'V2-8']) if (!notes.includes(s)) fail(`board note missing: "${s}"`);
  if (/first act inside 740/i.test(notes)) fail('board note claims the first act is inside 740px');
  for (const b of ['Main.dc.html', 'Issue-Cover-Desktop.dc.html']) {
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
async function measure(browser, w, load, fail) {
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
      const capSize = [];
      for (const cap of document.querySelectorAll('figcaption')) for (const el of [cap, ...cap.querySelectorAll('*')]) {
        if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 15) capSize.push(`${px}px "${el.textContent.trim().slice(0, 50)}"`);
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
      // v2: the 390 arrival (boards that mark standing rows and a hero plate).
      const arrival = {};
      const row = (k) => document.querySelector(`[data-standing-row="${k}"]`);
      const top0 = document.body.getBoundingClientRect().top;
      if (row('1')) {
        arrival.row1 = row('1').getBoundingClientRect().top - top0;
        arrival.row3 = row('3') ? row('3').getBoundingClientRect().top - top0 : null;
        const tabbable = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, summary, [tabindex]')]
          .filter((el) => el.tabIndex >= 0 && !el.disabled && visible(el));
        const head = document.getElementById('doorplate');
        const after = head ? tabbable.find((el) => head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !head.contains(el)) : null;
        arrival.firstTab = !head ? 'no #doorplate letterhead' : after === row('1') ? null : `"${(after?.textContent || 'nothing').trim().slice(0, 40)}"`;
      }
      const hero = document.querySelector('figure[data-hero]');
      if (hero) {
        const img = hero.querySelector('img');
        arrival.heroH = img ? img.getBoundingClientRect().height : 0;
        const focusable = (el) => el.tabIndex >= 0 || el.closest('a[href], button, [tabindex]:not([tabindex="-1"])');
        arrival.heroFocus = Boolean(focusable(hero) || (img && focusable(img)));
      }
      return { contrast, small, sw: document.documentElement.scrollWidth, capSize, onImage, arrival };
    });
    for (const c of r.contrast) fail(`figcaption contrast ${c} (needs 4.5:1)`);
    for (const s of r.small) fail(`target under 44px: ${s}`);
    if (r.sw > w) fail(`horizontal overflow: scrollWidth ${r.sw} > ${w}`);
    for (const c of r.capSize) fail(`caption under 15px: ${c}`);
    for (const t of r.onImage) fail(`text on photograph pixels: ${t}`);
    const a = r.arrival;
    if (a.row1 !== undefined) {
      if (a.row1 > 620) fail(`standing row 1 top ${Math.round(a.row1)} > 620${a.row1 > 664 ? ' (past the 664 toolbar line)' : ''}`);
      if (a.row3 === null) fail('standing row 3 missing');
      else if (a.row3 > 740) fail(`standing row 3 top ${Math.round(a.row3)} > 740`);
      if (a.firstTab) fail(`first Tab stop after the letterhead is not standing row 1: ${a.firstTab}`);
    }
    if (a.heroH !== undefined) {
      if (w <= 430 && (a.heroH < 340 || a.heroH > 380)) fail(`hero height ${Math.round(a.heroH)} outside 340–380 at ${w}`);
      if (a.heroFocus) fail('hero plate is focusable');
    }
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
  const confirms = srcs.filter(([f]) => /^(Main|Approval-Pair)\.dc\.html$/.test(f)).reduce((n, [, s]) => n + (squash(boardText(s).all).match(/Edition 2 is approved/g) || []).length, 0);
  const credits = srcs.find(([f]) => f === 'Credits.dc.html');
  if (credits) {
    const used = new Set(srcs.filter(([f]) => f !== 'Credits.dc.html').flatMap(([, s]) => [...s.matchAll(/\/_blob\/([0-9a-f]{32})/g)].map((m) => m[1])));
    for (const id of used) if (!credits[1].includes(`/_blob/${id}`)) at('Credits.dc.html')(`placeholder photo /_blob/${id} used on a board but not declared on Credits`);
  }
  if (!only && confirms !== 1) at('Main + Approval-Pair')(`the selected confirmation state must show once, found ${confirms}`);
  let browser;
  try {
    browser = await openBrowser();
    for (const [f, frame] of picked) await measure(browser, frame.w, (page) => page.goto(pathToFileURL(join(root, f)).href), at(`${f} (Chromium)`));
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
  return 0;
}

// ---------- self-test ----------
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
<div id="top" style="width: 400px; min-height: 300px; box-sizing: border-box; padding: 16px; background: #FAF7F2">
<p>A quiet sentence with a <a href="#top" style="color: #3E5145">link inside it</a>.</p>
<a href='#top' style="display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; color: #3E5145">Back to top</a>
<a href="Other.dc.html#here" style="display: inline-flex; align-items: center; min-height: 44px; color: #3E5145">Other board</a>
<button type="button" aria-describedby="note" style="min-height: 48px; padding: 0 16px; background: #3E5145; color: #FFFDF9; border: 0">Continue</button>
<p id="note">Nothing is charged until you confirm.</p>
<div data-c1-alternative style="width: 60px; height: 40px; background: #FCFAF6; box-shadow: 0 2px 8px rgba(44,41,38,.08)"></div>
<figure style="margin: 0; position: relative"><img src="/_blob/0123" width="120" height="80" alt="A walnut sideboard" style="display: block; width: 120px; height: 80px">
<p style="position: absolute; left: 0; top: 60px; margin: 0; padding: 2px 4px; background: #FAF7F2">Tab</p>
<figcaption style="margin: 8px 0 0; font-size: 15px; color: #4E4339">Walnut sideboard · photographed by Harmon Bench Works · 9 October 2026 · placeholder, not job imagery</figcaption></figure>
<figure style="margin: 0"><img src="/_blob/0124" width="120" height="80" alt="The catalogue sideboard" style="display: block; width: 120px; height: 80px">
<figcaption style="margin: 8px 0 0; font-size: 15px; color: #4E4339">Walnut sideboard, the same model · from Harmon Bench Works' catalogue · photographed 2025 · placeholder, not job imagery</figcaption></figure>
<ol data-chapter-order style="margin: 0"><li>02 · Invoices</li><li>03 · Approvals</li></ol>
<ol data-chapter-order style="margin: 0"><li>02 · Invoices</li><li>03 · Approvals</li></ol>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":400,"height":300}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`;
const FRAME = { w: 400, h: 300 };
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
  ['entity-encoded caption separators', (s) => s.replace('Walnut sideboard · photographed', 'Walnut sideboard &middot; oiled &#183; photographed'), /figcaption must be exactly/],
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
  // v2 probes (SQ-1570), one per new check.
  ['fourth caption field that is not a qualifier', (s) => s.replace('9 October 2026 · placeholder, not job imagery', '9 October 2026 · oiled'), /figcaption must be exactly/],
  ['photo caption without its placeholder qualifier', (s) => s.replace("photographed 2025 · placeholder, not job imagery", 'photographed 2025'), /photo caption must end/],
  ['standing row 1 below 620', add(`<header id="doorplate" style="height: 96px"><p style="margin: 0">Letterhead</p></header><div style="height: 560px"></div>
<a data-standing-row="1" href="#top" style="display: block; min-height: 44px; color: #3E5145">Row one</a><a data-standing-row="3" href="#top" style="display: block; min-height: 44px; color: #3E5145">Row three</a>`), /standing row 1 top \d+ > 620/],
  ['standing row 3 below 740', add(`<header id="doorplate" style="height: 96px"><p style="margin: 0">Letterhead</p></header>
<a data-standing-row="1" href="#top" style="display: block; min-height: 44px; color: #3E5145">Row one</a><div style="height: 700px"></div><a data-standing-row="3" href="#top" style="display: block; min-height: 44px; color: #3E5145">Row three</a>`), /standing row 3 top \d+ > 740/],
  ['first Tab stop after the letterhead is not row 1', (s) => s.replace('<div id="top"', `<header id="doorplate" style="height: 96px"><p style="margin: 0">Letterhead</p></header>
<a data-standing-row="1" href="#top" style="display: block; min-height: 44px; color: #3E5145">Row one</a><a data-standing-row="3" href="#top" style="display: block; min-height: 44px; color: #3E5145">Row three</a>
<div id="top"`).replace('<header id="doorplate"', '<a href="#top" style="display: block; min-height: 44px; color: #3E5145">Skip</a><header id="doorplate"').replace('Letterhead</p></header>', 'Letterhead</p></header><button type="button" style="min-height: 48px; min-width: 48px">First</button>'), /first Tab stop after the letterhead is not standing row 1: "First"/],
  ['hero height outside 340–380', add('<figure data-hero style="margin: 0"><img src="/_blob/0126" width="390" height="300" alt="Hero" style="display: block; width: 390px; height: 300px"><figcaption style="font-size: 15px; color: #4E4339">Hero · photographed by Birchwood Studio · 2 June 2026 · placeholder, not job imagery</figcaption></figure>'), /hero height 300 outside 340–380/],
  ['hero plate focusable', add('<figure data-hero style="margin: 0"><a href="#top" style="display: block; color: #3E5145"><img src="/_blob/0127" width="390" height="352" alt="Hero" style="display: block; width: 390px; height: 352px"></a><figcaption style="font-size: 15px; color: #4E4339">Hero · photographed by Birchwood Studio · 2 June 2026 · placeholder, not job imagery</figcaption></figure>'), /hero plate is focusable/],
  ['caption under 15px', (s) => s.replace('font-size: 15px; color: #4E4339">Walnut sideboard ·', 'font-size: 12px; color: #4E4339">Walnut sideboard ·'), /caption under 15px/],
  ['text on photograph pixels', (s) => s.replace('padding: 2px 4px; background: #FAF7F2">Tab', 'padding: 2px 4px">Tab'), /text on photograph pixels: "Tab"/],
  ['translucent tab over a photograph', (s) => s.replace('padding: 2px 4px; background: #FAF7F2">Tab', 'padding: 2px 4px; background: rgba(250, 247, 242, 0.8)">Tab'), /text on photograph pixels: "Tab"/],
  ['data-dimmable on a figure', (s) => s.replace('<figure style="margin: 0; position: relative">', '<figure data-dimmable style="margin: 0; position: relative">'), /data-dimmable on a figure/],
  ['img without width and height', (s) => s.replace('<img src="/_blob/0124" width="120" height="80"', '<img src="/_blob/0124"'), /needs width and height/],
  ['chapter 03 frame without the signature step', add(`<section><p>03 · Approvals</p><button type="button" style="min-height: 48px; background: #3E5145; color: #FFFDF9">Approve this edition · $7,480.00</button></section>`), /chapter 03 frame without the signature step/],
  ['chapter 03 act before the signature step', add(`<section data-chapter="03"><p>The sofa</p><button type="button" style="min-height: 48px; background: #3E5145; color: #FFFDF9">Approve this edition · $7,480.00</button><label for="sig-name-x">Your full name</label><input id="sig-name-x" type="text" style="min-height: 48px"></section>`), /Approve act must follow the signature step/],
  ['placeholder suffix in-frame on an arrival board', (s) => s.replace('<body>', '<body data-arrival-board>'), /placeholder suffix in-frame on an arrival board/],
  ['chapter order differs between frames', (s) => s.replace('<ol data-chapter-order style="margin: 0"><li>02 · Invoices</li><li>03 · Approvals</li></ol>\n</div>', '<ol data-chapter-order style="margin: 0"><li>03 · Approvals</li><li>02 · Invoices</li></ol>\n</div>'), /chapter order differs/],
];
async function selfTest() {
  const other = '<div id="here"></div>';
  const runOne = async (browser, src) => {
    const errs = [];
    const fail = (m) => errs.push(m);
    const ids = boardIdsOf([['Fixture.dc.html', src], ['Other.dc.html', other]]);
    checkBoard('Fixture.dc.html', src, FRAME, ids, fail);
    await measure(browser, FRAME.w, (page) => page.setContent(src), fail);
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
