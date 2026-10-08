#!/usr/bin/env node
/**
 * build.mjs - inline the six US-20 specimens and the walk screenshots into the
 * founder deck. Adapted from artifacts/document-running-a-job-2026-10-07/deck/build.mjs.
 *
 * Reads deck/src/index.html and writes deck/index.html, one self-contained page:
 *   - every {{WALK:<file>.jpg}} becomes a data:image/jpeg;base64 URI read from
 *     ../walk/<file>.jpg. A missing file stops the build.
 *   - every {{SPECIMEN_*}} token becomes the HTML-escaped specimen, for a
 *     double-quoted srcdoc attribute. Each token must appear exactly as many times
 *     as SPECIMENS below says, and every iframe that uses it must be named for a
 *     frame (name="frame-a4") that the specimen carries as data-frame="frame-a4".
 *
 * The build stops with exit 1 and a named reason when:
 *   - a specimen's last non-empty line is not exactly <!-- SPECIMEN COMPLETE -->;
 *   - a token count or a frame name is wrong;
 *   - any {{...}} token is left in the output;
 *   - the output is over 16 MB.
 *
 * The bootstrap (inserted just after the specimen's charset meta):
 *   - hides the specimen's frame bar (#bar, .bar) with CSS, as a fallback;
 *   - turns the iframe's name (frame-a4) into "#frame-a4&nobar" before the
 *     specimen's DOMContentLoaded runs, so the frame switcher shows one frame;
 *   - posts { deckSpecH } to the parent whenever the body's height changes, so the
 *     deck can size each frame to its content.
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
  specimen('{{SPECIMEN_A_1440}}', 11, 'proposed-a-1440.html'),
  specimen('{{SPECIMEN_A_390}}', 8, 'proposed-a-390.html'),
  specimen('{{SPECIMEN_B_1440}}', 3, 'proposed-b-1440.html'),
  specimen('{{SPECIMEN_B_390}}', 1, 'proposed-b-390.html'),
  specimen('{{SPECIMEN_C_1440}}', 3, 'proposed-c-1440.html'),
  specimen('{{SPECIMEN_C_390}}', 1, 'proposed-c-390.html'),
];

const WALK_TOKEN = /\{\{WALK:([A-Za-z0-9._-]+\.jpg)\}\}/g;
const IFRAME = /<iframe\b[^>]*>/g;

const BOOTSTRAP = '<style>.bar,#bar{display:none !important}</style>'
  + '<script>(function(){'
  + 'try{var m=/frame-[a-z0-9]+/.exec(window.name||"");if(m){location.hash=m[0]+"&nobar";}}catch(e){}'
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
  for (const re of [/<meta\s+charset=[^>]*>/i, /<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i]) {
    const m = re.exec(html);
    if (m) {
      const at = m.index + m[0].length;
      return html.slice(0, at) + BOOTSTRAP + html.slice(at);
    }
  }
  return BOOTSTRAP + html;
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
  let out = src
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`)
    .replace(WALK_TOKEN, (_, name) => uris.get(name));
  console.log(`{{WALK:*}} -> ${names.length} screenshot(s) inlined, ${(src.match(WALK_TOKEN) || []).length} use(s)`);

  for (const spec of SPECIMENS) {
    const body = wrap(bodies.get(spec.token));
    out = out.split(spec.token).join(escapeAttr(body));
    console.log(`${spec.token} -> ${spec.uses} frame(s) (${Buffer.byteLength(body, 'utf8')} bytes each)`);
  }

  const left = out.match(/\{\{[A-Z][A-Za-z0-9_:. -]{0,80}\}\}/);
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
