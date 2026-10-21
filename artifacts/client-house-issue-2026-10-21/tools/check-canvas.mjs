#!/usr/bin/env node
// Done-oracle for The House Issue canvas (port of the US-44 check-canvas oracle).
// Usage: node check-canvas.mjs [--only Main,Empty-Issue]
// Checks canvas.json shape, each listed board's .dc.html format rules,
// required literal copy, banned words, plate captions, shadows, red, and img alt.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'canvas', 'project');
const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim().replace(/\.dc\.html$/, '')) : null;
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

const ARRIVAL = [
  'Pay invoices, review approvals, and follow your project here.',
  'Invoices',
  'Approvals',
  'Progress',
  'Updates',
  'Documents',
  'Contact Maren Holt',
  'Six invoices are open; $600.00 is past due. One edition awaits your approval.',
];
const COLOPHON = 'Prepared by Birchwood Studio · Sent through Patina';
const APPROVE = 'Approve this edition · $7,480.00';
const CHIP = 'Concept · not installed';
// Eyebrows carry the spec's literal chapter heads (ruling A7); matched case-insensitively because they render uppercase.
const EYEBROWS = ['01 · Elm Street House · Procurement', '02 · Invoices', '03 · Approvals', '04 · The house', '05 · Living room', '08 · Progress', '09 · Updates', '11 · Documents and contact'];
const REQUIRED = {
  Main: [...ARRIVAL, ...EYEBROWS, '10 · Earlier', APPROVE, CHIP, COLOPHON],
  'Issue-Cover-Desktop': [...ARRIVAL, ...EYEBROWS, COLOPHON],
  'Approval-Pair': [APPROVE],
  'Living-Room-Band': [CHIP],
  'Empty-Issue': [COLOPHON, 'photograph to follow'],
  'Press-Band-Designer': ['A new edition is ready'],
};

// Banned in copy, case-insensitive. Word-like terms match standalone only.
const BANNED_WORDS = ['AI', 'Claude', 'Anthropic', 'model', 'engine', 'generated', 'curated', 'luxury', 'seamless', 'elevated', 'bespoke'];
const BANNED_LITERAL = ['01 / ', '%'];
// The catalogue caption (ruling 3: "Walnut sideboard, the same model · from Harmon Bench Works' catalogue · photographed 2025")
// names furniture, not a software model; it is the one phrase exempt from the "model" ban.
const ALLOWED_PHRASES = ['Walnut sideboard, the same model'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const SHADOW_BOARD = 'Plate-Grammar';

// Copy = the board minus the logic script, <style> blocks, style="…" attributes and the font <link>;
// CSS lengths may use % and are not "percentages" shown to the homeowner.
const copyOf = (src) =>
  norm(src)
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/\sstyle="[^"]*"/g, ' ')
    .replace(/<link\b[^>]*>/g, ' ');

const isRed = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  else h = h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return r >= 0xc0 && g + b <= 0x60;
};

const indexPath = join(root, 'canvas.json');
let index = null;
if (!existsSync(indexPath)) fail('canvas.json', 'missing');
else {
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (e) {
    fail('canvas.json', `invalid JSON: ${e.message}`);
  }
}
if (index) {
  if (index.v !== 3) fail('canvas.json', 'v must be 3');
  if (!index.createdOnFiles || index.createdOnFiles.v !== 1 || !index.createdOnFiles.at) fail('canvas.json', 'createdOnFiles {v:1,at} missing');
  const keys = Object.keys(index.boards || {});
  const order = index.order || [];
  if (keys.length !== order.length || keys.some((k) => !order.includes(k)) || new Set(order).size !== order.length) fail('canvas.json', 'order must list exactly the boards keys, once each');
  if (!keys.includes('Main.dc.html')) fail('canvas.json', 'Main.dc.html entry missing');
  if (order[0] !== 'Main.dc.html') fail('canvas.json', 'order must start with Main.dc.html');
  const files = existsSync(root) ? readdirSync(root).filter((f) => f.endsWith('.dc.html')) : [];
  for (const f of files) if (!keys.includes(f)) fail('canvas.json', `${f} exists on disk but is not listed in boards`);
  for (const [file, frame] of Object.entries(index.boards || {})) {
    if (frame.expand !== undefined && file !== 'Issue-Cover-Desktop.dc.html') fail('canvas.json', `${file}: expand is only for the desktop page board`);
  }
  if ((index.boards || {})['Issue-Cover-Desktop.dc.html'] && index.boards['Issue-Cover-Desktop.dc.html'].expand !== 'fill') fail('canvas.json', 'Issue-Cover-Desktop.dc.html needs expand "fill"');
  for (const [id, n] of Object.entries(index.notes || {})) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number' || typeof n.text !== 'string') fail('canvas.json', `note ${id} needs x,y,text`);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail('canvas.json', `note id ${id} invalid`);
    if (n.fill && !['gray', 'red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink'].includes(n.fill)) fail('canvas.json', `note ${id} fill ${n.fill} invalid`);
  }
}

const boards = index ? Object.entries(index.boards || {}) : [];
for (const [file, frame] of boards) {
  const stem = file.replace(/\.dc\.html$/, '');
  if (only && !only.includes(stem)) continue;
  const where = file;
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(where, 'file missing');
    continue;
  }
  if (!(frame.w >= 40 && frame.w <= 8000 && frame.h >= 40 && frame.h <= 8000)) fail(where, 'w/h out of 40–8000');
  const src = readFileSync(p, 'utf8');
  if (!src.includes('<script src="./support.js"></script>')) fail(where, 'support.js head line missing or altered');
  if (!/<x-dc>[\s\S]*<\/x-dc>/.test(src)) fail(where, '<x-dc> block missing');
  if (!/<script type="text\/x-dc" data-dc-script/.test(src)) fail(where, 'data-dc-script block missing');
  if (!/class Component extends DCLogic/.test(src)) fail(where, 'class Component extends DCLogic missing');
  if (/\b(import|export)\s/.test((src.match(/data-dc-script[\s\S]*?<\/script>/) || [''])[0].replace(/data-props='[^']*'/, ''))) fail(where, 'import/export in logic script');
  const props = src.match(/data-props='([^']*)'/);
  if (!props) fail(where, "data-props='…' missing");
  else {
    try {
      const decoded = props[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const pv = JSON.parse(decoded).$preview;
      if (!pv) fail(where, '$preview missing');
      else if (pv.width !== frame.w || pv.height !== frame.h) fail(where, `$preview ${pv.width}x${pv.height} ≠ canvas ${frame.w}x${frame.h}`);
    } catch (e) {
      fail(where, `data-props not JSON: ${e.message}`);
    }
  }
  if (/\{\{[^}]*[+!()?:<>=][^}]*\}\}/.test(src)) fail(where, 'expression inside {{ }} (holes are dotted lookups only)');
  if (/style="[^"]*var\(--/.test(src)) fail(where, 'CSS var() in inline style; use literal values');
  if (/<(iframe|object|embed)\b/i.test(src)) fail(where, 'iframe/object/embed not allowed');
  if (/innerHTML|appendChild/.test(src)) fail(where, 'script-built UI not allowed');
  if (EMOJI.test(src)) fail(where, 'emoji found');

  const markup = src.replace(/<script[\s\S]*?<\/script>/g, '');
  const tags = markup.match(/<[a-zA-Z][\w-]*(?:\s+[^\s=>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s*\/?>/g) || [];
  const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`)) || [])[1];
  const ids = new Set(tags.map((t) => attr(t, 'id')).filter((v) => v && !v.includes('{{')));
  for (const tag of tags) {
    const href = attr(tag, 'href');
    if (href && href.startsWith('#') && !href.includes('{{') && !ids.has(href.slice(1))) fail(where, `href="${href}" names no id on this board`);
    const controls = attr(tag, 'aria-controls');
    if (controls && !controls.includes('{{')) for (const c of controls.split(/\s+/).filter(Boolean)) if (!ids.has(c)) fail(where, `aria-controls="${c}" names no id on this board`);
    if (attr(tag, 'aria-expanded') !== undefined && controls === undefined) fail(where, `aria-expanded without aria-controls: ${tag.slice(0, 80)}`);
    if (/^<img\b/i.test(tag)) {
      const alt = attr(tag, 'alt');
      if (alt === undefined || !alt.trim()) fail(where, `<img> without non-empty alt: ${tag.slice(0, 80)}`);
    }
  }

  // Every figure carries a figcaption of exactly three segments, what · whose · when (ruling 3);
  // qualifications sit outside the triplet on a second line with no " · ".
  const figures = markup.match(/<figure\b[\s\S]*?<\/figure>/g) || [];
  const figureOpens = (markup.match(/<figure\b/g) || []).length;
  if (figureOpens !== figures.length) fail(where, `unbalanced <figure> markup (${figureOpens} opened, ${figures.length} closed)`);
  for (const fig of figures) {
    const cap = fig.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/);
    if (!cap) {
      fail(where, `<figure> without <figcaption>: ${fig.slice(0, 80)}`);
      continue;
    }
    const text = norm(cap[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
    if ((text.match(/ · /g) || []).length !== 2) fail(where, `figcaption must be exactly what · whose · when: "${text.trim().slice(0, 80)}"`);
  }

  // Banned words and literals, in copy.
  let copy = copyOf(src);
  for (const ok of ALLOWED_PHRASES) copy = copy.split(ok).join(' ');
  for (const w of BANNED_WORDS) if (new RegExp(`(^|[^A-Za-z0-9])${w}([^A-Za-z0-9]|$)`, 'i').test(copy)) fail(where, `banned word in copy: "${w}"`);
  for (const s of BANNED_LITERAL) if (copy.includes(s)) fail(where, `banned string in copy: "${s}"`);

  // Shadows only on the labelled C1 alternative; no red anywhere.
  if (stem !== SHADOW_BOARD && /box-shadow\s*:/i.test(src)) fail(where, 'box-shadow outside Plate-Grammar');
  for (const hex of src.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    if (![4, 5, 7, 9].includes(hex.length)) continue;
    if (isRed(hex)) fail(where, `red colour ${hex}`);
  }
  if (/\b(red|crimson|firebrick|tomato)\b\s*[;"]/i.test(markup.replace(/>[^<]*</g, '><'))) fail(where, 'named red colour in styles');

  // Required copy is matched on the rendered words, so a clause wrapped in its own link still counts.
  const text = norm(markup.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
  for (const s of REQUIRED[stem] || []) if (!text.toLowerCase().includes(norm(s).toLowerCase())) fail(where, `required copy missing: "${s}"`);
}

if (only) for (const s of only) if (!boards.some(([f]) => f === `${s}.dc.html`)) fail(`${s}.dc.html`, 'not listed in canvas.json boards');

if (errors.length) {
  console.error(`check-canvas: FAIL (${errors.length})\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('check-canvas: ok');
