#!/usr/bin/env node
/**
 * build.mjs - assemble the US-33 findings document into one self-contained page.
 * Pattern adapted from artifacts/designer-portal-uplift-2026-10-09/deck/build.mjs.
 *
 * Reads doc/src/index.html and writes doc/index.html:
 *   - every <iframe ... data-spec="<file>.html" data-frames="frame-a frame-b" srcdoc="{{SPEC}}">
 *     gets a srcdoc built from ../specimens/<file>.html: the specimen's own <head>
 *     (tokens, fonts, styles), only the named frames (cut at the specimen's
 *     <!-- frame:ID --> ... <!-- /frame:ID --> markers), and the specimen's own
 *     scripts. A small bootstrap hides the specimen chrome, applies the embed
 *     polish below, shows the light or dark copy of a frame pair to match the
 *     reader's theme, and posts its height to the parent.
 *   - every <img src="{{SHOT:<file>.jpg}}"> is inlined from ../baseline/screens/.
 *
 * Embed polish (the SQ-961 orchestrator notes, applied to the embedded copies only;
 * the specimens themselves are unchanged):
 *   (a) action strips lay their six stages out three to a row above 900 px, so the
 *       task text no longer squeezes into narrow columns at 1440;
 *   (b) waterfall lanes keep 44 px on the right, so the last axis tick and the
 *       right-hand value labels are not clipped.
 *
 * The build stops with exit 1 and a named reason when:
 *   - the source, a specimen or a screenshot is missing;
 *   - a specimen's last non-empty line is not <!-- SPECIMEN COMPLETE -->;
 *   - an iframe names a frame its specimen does not carry;
 *   - the visible copy says "AI", or uses a gendered pronoun for a studio member;
 *   - any {{...}} token is left in the output;
 *   - the output is over 16 MB.
 *
 *   node artifacts/portal-responsiveness-2026-10-14/doc/build.mjs
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(HERE, 'src', 'index.html');
const OUT = join(HERE, 'index.html');
const SPECIMENS = join(ROOT, 'specimens');
const SCREENS = join(ROOT, 'baseline', 'screens');

const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const LIMIT = 16 * 1024 * 1024;

const IFRAME = /<iframe\b[^>]*\bsrcdoc="\{\{SPEC\}\}"[^>]*>/g;
const SHOT_SRC = /(<img\s[^>]*?)src="\{\{SHOT:([A-Za-z0-9._-]+\.jpg)\}\}"/g;

const EMBED_CSS = [
  '.intro,.gobar{display:none!important}',
  'html,body{background:var(--paper)}',
  '.wrap{padding:0 0 2px!important;margin:0!important;max-width:none!important}',
  '.frame{margin:0 0 28px!important}',
  '.frame:last-of-type{margin-bottom:0!important}',
  '.fnote{display:block}',
  '@media (min-width:1000px){.vp.v1440{zoom:.66}}',
  '@media (max-width:700px){.vp.v1440{zoom:.3}}',
  '@media (min-width:430px){.vp.v390{zoom:1}}',
  // (a) action strips: three stages to a row above 900 px.
  '@media (min-width:901px){.stages{grid-template-columns:repeat(3,minmax(0,1fr))!important}}',
  // (b) waterfalls: room on the right for the last tick and the value labels.
  '.lanes{padding-right:44px}',
].join('');

// Shown only where the iframe carries both copies of a light/dark frame pair.
const PAIR_CSS = '@media (prefers-color-scheme: dark){[data-frame$="-light"]{display:none!important}}'
  + '@media not all and (prefers-color-scheme: dark){[data-frame$="-dark"]{display:none!important}}';

const BOOTSTRAP = '<script>(function(){var last=0;function send(){try{var d=document.documentElement;'
  + 'var h=Math.ceil(Math.max(d.scrollHeight,document.body?document.body.scrollHeight:0));'
  + 'if(h&&Math.abs(h-last)>1){last=h;parent.postMessage({us33SpecH:h},"*");}}catch(e){}}'
  + 'addEventListener("DOMContentLoaded",function(){send();try{new ResizeObserver(send).observe(document.documentElement);}catch(e){}});'
  + 'addEventListener("load",function(){send();setTimeout(send,300);setTimeout(send,1200);});'
  + 'addEventListener("message",function(){setTimeout(function(){last=0;send();},60);});})();</script>';

function fail(message) {
  console.error(`build.mjs: ${message}`);
  console.error('build.mjs: nothing was written.');
  process.exit(1);
}

/** Escape a full HTML document for a double-quoted attribute; non-ASCII becomes numeric references. */
function escapeAttr(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

const specimenCache = new Map();
async function specimen(name) {
  if (specimenCache.has(name)) return specimenCache.get(name);
  const file = join(SPECIMENS, name);
  if (!/^[a-z0-9-]+\.html$/.test(name) || !(await exists(file))) fail(`specimen ${name} does not exist at ${file}.`);
  const text = await readFile(file, 'utf8');
  const lastLine = text.trimEnd().split('\n').at(-1).trim();
  if (lastLine !== SENTINEL) fail(`${name} is not complete; its last line is ${JSON.stringify(lastLine.slice(0, 80))}.`);
  const head = /<head>([\s\S]*?)<\/head>/i.exec(text);
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(text);
  if (!head || !body) fail(`${name} has no <head> or <body>.`);
  const scripts = [...body[1].matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
  const parsed = { text, head: head[1], scripts };
  specimenCache.set(name, parsed);
  return parsed;
}

function cutFrame(spec, name, id) {
  const open = `<!-- frame:${id} -->`;
  const close = `<!-- /frame:${id} -->`;
  const a = spec.text.indexOf(open);
  const b = spec.text.indexOf(close);
  if (a < 0 || b < a) fail(`${id} is not a frame in ${name}.`);
  return spec.text.slice(a, b + close.length);
}

async function embed(tag) {
  const file = /\sdata-spec="([^"]+)"/.exec(tag);
  const frames = /\sdata-frames="([^"]+)"/.exec(tag);
  if (!file || !frames) fail(`an iframe with srcdoc="{{SPEC}}" lacks data-spec or data-frames: ${tag.slice(0, 160)}`);
  const ids = frames[1].trim().split(/\s+/);
  const spec = await specimen(file[1]);
  const cut = ids.map((id) => cutFrame(spec, file[1], id)).join('\n');
  const paired = ids.some((id) => id.endsWith('-light')) && ids.some((id) => id.endsWith('-dark'));
  const css = `<style>${EMBED_CSS}${paired ? PAIR_CSS : ''}</style>`;
  const doc = '<!doctype html><html lang="en"><head>'
    + spec.head + css + BOOTSTRAP
    + '</head><body class="embed"><div class="wrap">' + cut + '</div>'
    + spec.scripts.join('\n') + '</body></html>';
  return { html: tag.replace('srcdoc="{{SPEC}}"', `srcdoc="${escapeAttr(doc)}"`), bytes: Buffer.byteLength(doc, 'utf8'), ids };
}

async function main() {
  if (!(await exists(SRC))) fail(`the source does not exist at ${SRC}.`);
  const src = await readFile(SRC, 'utf8');
  if (!src.startsWith('<title>')) fail('doc/src/index.html must start with <title>.');
  if (/<\/?(html|head|body)[\s>]/i.test(src) || /<!doctype/i.test(src)) {
    fail('doc/src/index.html must not carry its own doctype, html, head or body tags.');
  }
  for (const m of src.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const bad = /[^\x00-\x7f]/.exec(m[2]);
    if (bad) fail(`a <${m[1]}> block carries the non-ASCII character ${JSON.stringify(bad[0])}; escape it.`);
  }

  // Copy rules (BRIEF.md: never "AI"; neutral pronouns for Leah, the hire and the studio member).
  const copy = src.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ');
  const ai = /\bAI\b/.exec(copy);
  if (ai) fail(`the copy says "AI" near ${JSON.stringify(copy.slice(Math.max(0, ai.index - 40), ai.index + 40))}.`);
  const pron = /\b(she|her|hers|herself|he|him|his|himself)\b/i.exec(copy);
  if (pron) fail(`the copy uses a gendered pronoun near ${JSON.stringify(copy.slice(Math.max(0, pron.index - 50), pron.index + 30))}.`);

  // Screenshots: inlined as data URIs, once per use (each is used once).
  const shots = [...src.matchAll(SHOT_SRC)].map((m) => m[2]);
  const shotTokens = (src.match(/\{\{SHOT:[^}]*\}\}/g) || []).length;
  if (shotTokens !== shots.length) fail(`${shotTokens - shots.length} {{SHOT:*}} token(s) sit outside an <img src="...">.`);
  const uris = new Map();
  for (const name of new Set(shots)) {
    const file = join(SCREENS, name);
    if (!(await exists(file))) fail(`screenshot ${name} is missing from ${SCREENS}.`);
    uris.set(name, `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`);
  }

  let out = src.replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);
  out = out.replace(SHOT_SRC, (_, head, name) => `${head}src="${uris.get(name)}"`);
  console.log(`{{SHOT:*}} -> ${uris.size} screenshot(s) inlined`);

  const tags = out.match(IFRAME) || [];
  if (!tags.length) fail('the source embeds no specimen frames.');
  for (const tag of tags) {
    const built = await embed(tag);
    out = out.replace(tag, () => built.html);
    console.log(`specimen ${/data-spec="([^"]+)"/.exec(tag)[1]} -> ${built.ids.join(', ')} (${built.bytes} bytes)`);
  }

  const left = out.match(/\{\{[^{}]{0,120}\}\}/);
  if (left) fail(`an unreplaced token is left in the output: ${left[0]}`);

  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > LIMIT) fail(`built page is ${bytes} bytes, over the 16 MB limit.`);
  await writeFile(OUT, out, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`built size: ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
