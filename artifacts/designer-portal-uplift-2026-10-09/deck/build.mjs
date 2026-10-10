#!/usr/bin/env node
/**
 * build.mjs - inline the six US-24 specimens and the walk screenshots into the
 * founder deck. Adapted from artifacts/pieces-building-room-2026-10-08/deck/build.mjs.
 *
 * Reads deck/src/index.html and writes deck/index.html, one self-contained page:
 *   - every <img src="{{WALK:<file>.jpg}}"> is inlined from ../walk/<file>.jpg,
 *     once per file: the first use carries the data:image/jpeg;base64 URI, and
 *     every later use carries only data-walk="<file>.jpg", which the deck's
 *     script fills from the first. A missing file, or a token outside an img
 *     src, stops the build.
 *   - every {{SPECIMEN_*}} token becomes the HTML-escaped specimen, for a
 *     double-quoted srcdoc attribute. Each token must appear exactly as many times
 *     as SPECIMENS below says, and every iframe that uses it must be named for a
 *     frame (name="frame-b4") that the specimen carries as data-frame="frame-b4".
 *
 * The build stops with exit 1 and a named reason when:
 *   - the source, a specimen or a walk screenshot is missing;
 *   - a specimen's last non-empty line is not exactly <!-- SPECIMEN COMPLETE -->;
 *   - a token count or a frame name is wrong;
 *   - the deck's visible copy says "AI";
 *   - any {{...}} token is left in the output;
 *   - the output is over 16 MB.
 *
 * The bootstrap (inserted just after the specimen's charset meta):
 *   - hides the specimen's frame bar (#bar, .bar) with CSS, as a fallback;
 *   - turns the iframe's name (frame-b4) into "#frame-b4&nobar&nobefore" before the
 *     specimen's DOMContentLoaded runs, so the specimen shows one frame and its
 *     "What changed" notes. The deck prints today's screenshot itself, inlined;
 *   - posts { deckSpecH } to the parent whenever the body's height changes, so the
 *     deck can size each frame to its content.
 *
 * Each specimen's own today figure points at ../walk/<file>.jpg, which cannot
 * resolve inside a srcdoc frame once the deck is published. The build renames
 * those src attributes to data-walk-src so the hidden figure fetches nothing.
 *
 *   node deck/build.mjs
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(HERE, 'src', 'index.html');
const OUT = join(HERE, 'index.html');
const WALK = join(ROOT, 'walk');

const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const LIMIT = 16 * 1024 * 1024;

const specimen = (token, uses, name) => ({ token, uses, name, file: join(ROOT, 'specimens', name) });
const SPECIMENS = [
  specimen('{{SPECIMEN_A_1440}}', 4, 'proposed-a-1440.html'),
  specimen('{{SPECIMEN_A_390}}', 1, 'proposed-a-390.html'),
  specimen('{{SPECIMEN_B_1440}}', 7, 'proposed-b-1440.html'),
  specimen('{{SPECIMEN_B_390}}', 2, 'proposed-b-390.html'),
  specimen('{{SPECIMEN_C_1440}}', 3, 'proposed-c-1440.html'),
  specimen('{{SPECIMEN_C_390}}', 1, 'proposed-c-390.html'),
];

const WALK_TOKEN = /\{\{WALK:([A-Za-z0-9._-]+\.jpg)\}\}/g;
const WALK_SRC = /(<img\s[^>]*?)src="\{\{WALK:([A-Za-z0-9._-]+\.jpg)\}\}"/g;
const IFRAME = /<iframe\b[^>]*>/g;

const BOOTSTRAP = '<style>.bar,#bar{display:none !important}</style>'
  + '<script>(function(){'
  + 'try{var m=/frame-[a-z0-9]+/.exec(window.name||"");if(m){location.hash=m[0]+"&nobar&nobefore";}}catch(e){}'
  + 'var last=0;function send(){try{var b=document.body;if(!b)return;'
  + 'var h=Math.ceil(Math.max(b.scrollHeight,b.getBoundingClientRect().height));'
  + 'if(h&&Math.abs(h-last)>1){last=h;parent.postMessage({deckSpecH:h},"*");}}catch(e){}}'
  + 'function later(){setTimeout(send,60);setTimeout(send,400);}'
  + 'document.addEventListener("DOMContentLoaded",function(){send();'
  + 'try{if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}}catch(e){}});'
  + 'window.addEventListener("load",later);window.addEventListener("hashchange",later);'
  + 'window.addEventListener("message",later);'
  + '})();</script>';

function fail(message) {
  console.error(`build.mjs: ${message}`);
  console.error('build.mjs: nothing was written.');
  process.exit(1);
}

/**
 * Escape a full HTML document for a double-quoted attribute. Non-ASCII becomes
 * numeric references, so the srcdoc survives whatever encoding the host reads.
 */
function escapeAttr(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);
}

/** Put the bootstrap just after the charset meta; failing that inside <head>, <html>, or at the top. */
function wrap(html) {
  const quiet = html.replace(/\ssrc="\.\.\/walk\//g, ' data-walk-src="../walk/');
  for (const re of [/<meta\s+charset=[^>]*>/i, /<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i]) {
    const m = re.exec(quiet);
    if (m) {
      const at = m.index + m[0].length;
      return quiet.slice(0, at) + BOOTSTRAP + quiet.slice(at);
    }
  }
  return BOOTSTRAP + quiet;
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function readComplete(spec) {
  if (!(await exists(spec.file))) fail(`${spec.name} does not exist at ${spec.file}.`);
  const text = await readFile(spec.file, 'utf8');
  const last = text.trimEnd().split('\n').at(-1).trim();
  if (last !== SENTINEL) {
    fail(`${spec.name} is not complete. Its last non-empty line reads ${JSON.stringify(last.slice(0, 80))}; the build requires exactly ${JSON.stringify(SENTINEL)}.`);
  }
  return text;
}

async function main() {
  if (!(await exists(SRC))) fail(`the deck source does not exist at ${SRC}.`);
  const src = await readFile(SRC, 'utf8');
  if (!src.startsWith('<title>')) fail('deck/src/index.html must start with <title>.');
  if (/<\/?(html|head|body)[\s>]/i.test(src) || /<!doctype/i.test(src)) {
    fail('deck/src/index.html must not carry its own doctype, html, head or body tags.');
  }

  // The page has no charset meta of its own, so every non-ASCII character in the
  // deck's markup becomes a numeric reference below. That is only safe outside
  // <script> and <style>, so those must be ASCII already.
  for (const m of src.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const bad = /[^\x00-\x7f]/.exec(m[2]);
    if (bad) fail(`a <${m[1]}> block carries the non-ASCII character ${JSON.stringify(bad[0])}; escape it.`);
  }

  // Visible copy says "Designer-Taught Intelligence", never "AI" (BRIEF section 2).
  const copy = src.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
  const ai = /\bAI\b/.exec(copy);
  if (ai) fail(`the deck's copy says "AI" near ${JSON.stringify(copy.slice(Math.max(0, ai.index - 40), ai.index + 40))}.`);

  // Counts first, so a miscount names itself before any file is read.
  for (const spec of SPECIMENS) {
    const uses = src.split(spec.token).length - 1;
    if (uses !== spec.uses) fail(`${spec.token} appears ${uses} time(s) in ${SRC}; the deck expects exactly ${spec.uses}.`);
  }

  // Every frame a deck iframe names must exist in the specimen it loads.
  const bodies = new Map();
  for (const spec of SPECIMENS) bodies.set(spec.token, await readComplete(spec));
  for (const tag of src.match(IFRAME) || []) {
    const token = /srcdoc="(\{\{SPECIMEN_[A-Z0-9_]+\}\})"/.exec(tag);
    if (!token) continue;
    const name = /\sname="(frame-[a-z0-9]+)"/.exec(tag);
    if (!name) fail(`an iframe using ${token[1]} has no name="frame-…".`);
    const body = bodies.get(token[1]);
    if (body === undefined) fail(`unknown specimen token ${token[1]}.`);
    if (!body.includes(`data-frame="${name[1]}"`)) fail(`${name[1]} is not a frame in the specimen behind ${token[1]}.`);
  }

  // Walk screenshots.
  const names = [...new Set([...src.matchAll(WALK_TOKEN)].map((m) => m[1]))];
  const missing = [];
  for (const name of names) if (!(await exists(join(WALK, name)))) missing.push(name);
  if (missing.length) fail(`walk screenshot(s) missing from ${WALK}: ${missing.join(', ')}.`);
  const uris = new Map();
  for (const name of names) {
    uris.set(name, `data:image/jpeg;base64,${(await readFile(join(WALK, name))).toString('base64')}`);
  }
  // Each screenshot is inlined once. Its first <img> carries the data URI; every
  // later use carries only data-walk="<file>", and the deck's script copies the
  // src across, so a screenshot shown on four sheets costs its bytes once.
  const uses = (src.match(WALK_TOKEN) || []).length;
  const srcUses = (src.match(WALK_SRC) || []).length;
  if (srcUses !== uses) fail(`${uses - srcUses} {{WALK:*}} token(s) sit outside an <img src="...">; the build inlines screenshots only as an img src.`);
  const seen = new Set();
  let out = src
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`)
    .replace(WALK_SRC, (_, head, name) => {
      if (seen.has(name)) return `${head}data-walk="${name}"`;
      seen.add(name);
      return `${head}src="${uris.get(name)}" data-walk="${name}"`;
    });
  console.log(`{{WALK:*}} -> ${names.length} screenshot(s) inlined once each, ${uses} use(s)`);

  for (const spec of SPECIMENS) {
    const body = wrap(bodies.get(spec.token));
    out = out.split(spec.token).join(escapeAttr(body));
    console.log(`${spec.token} -> ${spec.uses} frame(s) (${Buffer.byteLength(body, 'utf8')} bytes each)`);
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
