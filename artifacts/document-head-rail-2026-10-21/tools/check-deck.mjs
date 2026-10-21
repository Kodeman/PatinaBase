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

// 11. Size.
const LIMIT = 2.5 * 1024 * 1024;
if (bytes >= LIMIT) fail(`file is ${bytes} bytes; limit is ${LIMIT}`);

if (failures.length) {
  console.error(`check-deck: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-deck: ok (${slides.length} slides, ${heads.length} head specimens, ${rails.length} rail specimens, ${bytes} bytes)`);
