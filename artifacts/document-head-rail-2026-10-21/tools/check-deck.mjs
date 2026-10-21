#!/usr/bin/env node
// Done-oracle for the US-47 founders' deck. No dependencies.
// Reads ../deck/index.html and exits 1 with a list of failures.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'deck', 'index.html');
const failures = [];
const fail = (msg) => failures.push(msg);

const raw = readFileSync(file, 'utf8');
const bytes = statSync(file).size;

// Embedded images are base64: drop data: URIs so their payload cannot match word or URL checks.
const html = raw.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:stripped');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#183;|&middot;/g, '·');

// 1. Exactly one <h1>.
const h1 = (html.match(/<h1[\s>]/gi) || []).length;
if (h1 !== 1) fail(`expected exactly one <h1>, found ${h1}`);

// 2. At least 17 section.slide elements, each with data-title.
const sectionTags = html.match(/<section\b[^>]*>/gi) || [];
const slides = sectionTags.filter((t) => /\bclass="[^"]*\bslide\b[^"]*"/.test(t));
if (slides.length < 17) fail(`expected at least 17 section.slide elements, found ${slides.length}`);
slides.forEach((t, i) => {
  if (!/\sdata-title="[^"]+"/.test(t)) fail(`slide ${i + 1} has no data-title: ${t.slice(0, 80)}`);
});

// 3. Direction ids.
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const id of ['dir-H-A', 'dir-H-B', 'dir-H-C', 'dir-S-A', 'dir-S-B', 'dir-S-C']) {
  if (!ids.has(id)) fail(`missing id="${id}"`);
}

// Blocks of a figure with a given class, from its opening tag to its </figure>.
function figures(cls) {
  const out = [];
  const re = new RegExp(`<figure\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'gi');
  let m;
  while ((m = re.exec(html))) {
    const end = html.indexOf('</figure>', m.index);
    out.push({ tag: m[0], body: end < 0 ? html.slice(m.index) : html.slice(m.index, end) });
  }
  return out;
}
const buttonTexts = (body) => [...body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
  .map((m) => decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());

// 4. Each head specimen has a section switcher with all five section names.
const SECTIONS = ['FF&E selections', 'Client approvals', 'Project financials', 'Project closeout', 'Project record'];
const heads = figures('head-spec');
if (heads.length < 3) fail(`expected at least 3 head specimens (figure.head-spec), found ${heads.length}`);
heads.forEach(({ tag, body }) => {
  const labels = buttonTexts(body);
  const missing = SECTIONS.filter((s) => !labels.includes(s));
  if (missing.length) fail(`head specimen ${tag.slice(0, 70)} lacks section switcher buttons: ${missing.join(', ')}`);
});

// 5. Each rail specimen has the three states.
const STATES = ['Top of page', 'Mid-scroll on FF&E selections', 'Room in hand'];
const rails = figures('rail-spec');
if (rails.length < 3) fail(`expected at least 3 rail specimens (figure.rail-spec), found ${rails.length}`);
rails.forEach(({ tag, body }) => {
  const labels = buttonTexts(body);
  const missing = STATES.filter((s) => !labels.includes(s));
  if (missing.length) fail(`rail specimen ${tag.slice(0, 70)} lacks state buttons: ${missing.join(', ')}`);
});

// 6. No box-shadow other than "box-shadow: none".
for (const m of html.matchAll(/box-shadow\s*:\s*([^;"}]*)/gi)) {
  if (m[1].trim().toLowerCase() !== 'none') fail(`box-shadow found: ${m[0].slice(0, 60)}`);
}
if (/box-shadow(?!\s*:)/i.test(html)) fail('the word "box-shadow" appears outside a declaration');

// 7. No external URL except Google Fonts.
for (const m of html.matchAll(/https?:\/\/([^\s"'()<>]+)/gi)) {
  const host = m[1].split('/')[0].toLowerCase();
  if (host !== 'fonts.googleapis.com' && host !== 'fonts.gstatic.com') fail(`external URL not allowed: ${m[0].slice(0, 80)}`);
}

// 8. Banned words: "AI" case-sensitive, the rest case-insensitive, whole words.
const aiHits = html.match(/\bAI\b/g) || [];
if (aiHits.length) fail(`banned word "AI" appears ${aiHits.length} time(s)`);
for (const w of ['curated', 'luxury', 'bespoke']) {
  const hits = html.match(new RegExp(`\\b${w}\\b`, 'gi')) || [];
  if (hits.length) fail(`banned word "${w}" appears ${hits.length} time(s)`);
}

// 9. Every aria-controls value in the markup names an existing id (space-separated lists allowed).
// Script bodies are skipped: they build specimen markup from string templates at runtime.
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
for (const m of markup.matchAll(/\saria-controls="([^"]*)"/g)) {
  for (const ref of m[1].split(/\s+/).filter(Boolean)) {
    if (!ids.has(ref)) fail(`aria-controls="${ref}" has no matching id`);
  }
}

// 10. R124: never re-propose the removed index.
if (/thumb\s+index/i.test(html)) fail('"Thumb Index" appears (R124)');

// ── SQ-1560 review regressions (static; the runtime side is a Chromium probe) ──
const css = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i) || [, ''])[1].replace(/\/\*[\s\S]*?\*\//g, '');
const script = (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i) || [, ''])[1];
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const px = (decl, body) => {
  // px, or a unitless 0 ("min-height:0" is the classic way to undo a target)
  const m = body.match(new RegExp(`(?:^|;)\\s*${decl}\\s*:\\s*([0-9.]+)(?:px)?\\s*(?:;|$|!)`, 'i'));
  return m ? parseFloat(m[1]) : null;
};
const fontPx = (body) => {
  const size = px('font-size', body);
  if (size !== null) return size;
  const m = body.match(/(?:^|;)\s*font\s*:[^;]*?([0-9.]+)px/i);
  return m ? parseFloat(m[1]) : null;
};

// 12. F13: no specimen text under 12px. Specimen CSS runs from the portal reconstruction to the end;
// today's replica (.c-*) is exempt because it shows the 11.5px defect on purpose.
const specCss = css.slice(css.indexOf('.pg{'));
if (!specCss.length || !/\.pg\{/.test(css)) fail('specimen CSS block (.pg{) not found');
for (const r of [...specCss.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))) {
  if (r.sel.split(',').every((s) => /\.c-/.test(s))) continue;
  const f = fontPx(r.body);
  if (f !== null && f < 12) fail(`F13: ${r.sel} sets ${f}px text (floor is 12px)`);
}

// 13. F02: every control class gets a real 44px box, and no later rule lowers it.
const CONTROLS = ['.ctl', '.seg button', '.tog', '.outline button', '.a-lead', '.a-tool', '.a-held', '.a-inline',
  '.r-back', '.r-find', '.r-ch', '.r-rung', '.r-chooser', '.r-opt', '.r-door', '.r-kb', '.r-tile', '.mbar-l'];
for (const c of CONTROLS) {
  const own = rules.filter((r) => r.sel.split(',').map((s) => s.trim()).includes(c));
  const mh = own.map((r) => px('min-height', r.body) ?? px('height', r.body)).filter((v) => v !== null);
  if (!mh.length || Math.max(...mh) < 44) fail(`F02: ${c} has no min-height of at least 44px`);
}
const ctlRe = new RegExp(`(${CONTROLS.map((c) => c.replace('.', '\\.').replace(' ', '\\s+')).join('|')})(?![\\w-])`);
for (const r of rules) {
  const mh = px('min-height', r.body);
  if (mh !== null && mh < 44 && ctlRe.test(r.sel)) fail(`F02: ${r.sel} lowers a control's min-height to ${mh}px`);
  if (/\.fold\b/.test(r.sel) && /(^|;)\s*width\s*:\s*44px/.test(r.body) && px('height', r.body) < 44) fail('F02: .fold under 44px');
}

// 14. F03: every fold toggle names the section body; the body carries that id.
const foldTags = [...script.matchAll(/<button\b[^<]*?data-fold[\s\S]*?<\/button>/g)].map((m) => m[0]);
if (foldTags.length < 4) fail(`F03: expected at least 4 fold/Expand button templates, found ${foldTags.length}`);
foldTags.forEach((t) => { if (!/aria-controls|bodyRef\(/.test(t)) fail(`F03: fold toggle without aria-controls: ${t.slice(0, 90)}`); });
if (!/function bodyRef\(uid\)\{[^}]*aria-controls="' \+ uid \+ '-body"/.test(script)) fail('F03: bodyRef must emit aria-controls="<uid>-body"');
if (!/class="body-ghost" id="' \+ uid \+ '-body"/.test(script)) fail('F03: the section body must carry id="<uid>-body"');

// 15. F01: click routing never matches an ancestor by a state attribute the holder also stores.
for (const m of script.matchAll(/closest\(\s*'\[data-(room|fold|ch|launch|why|say|set|squint|disclose)\]'\s*\)/g)) {
  fail(`F01: ancestor match ${m[0]} can hit the state-bearing holder; route by the pressed button`);
}

// 16. F05/F12/F15 copy, F14 ruling.
const text = decode(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
for (const p of ['biggest saving', 'largest saving', 'largest height saving', 'nothing hidden', 'every control is visible', 'every control in view', 'dots or counts', 'dots, counts']) {
  if (text.toLowerCase().includes(p)) fail(`copy: "${p}" contradicts the replica or the ban wording`);
}
if (!/class="rid">R-10</.test(markup)) fail('F14: ruling R-10 (doors are two taps below 1180) missing from the rulings slide');

// 11. Size.
const LIMIT = 2.5 * 1024 * 1024;
if (bytes >= LIMIT) fail(`file is ${bytes} bytes; limit is ${LIMIT}`);

if (failures.length) {
  console.error(`check-deck: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-deck: ok (${slides.length} slides, ${heads.length} head specimens, ${rails.length} rail specimens, ${bytes} bytes)`);
