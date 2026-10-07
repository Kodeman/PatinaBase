#!/usr/bin/env node
/**
 * build.mjs - inline the six running-a-job specimens and the walk screenshots
 * into the founder deck. Adapted from
 * artifacts/procurement-buying-review-2026-10-05/deck/build.mjs.
 *
 * Reads deck/src/index.html and writes deck/index.html, one self-contained page:
 *   - every {{WALK:<file>.jpg}} becomes a data:image/jpeg;base64 URI read from
 *     ../walk/<file>.jpg. A missing file stops the build with exit 1.
 *   - every {{SPECIMEN_*}} placeholder becomes the HTML-escaped specimen, for a
 *     double-quoted srcdoc attribute. Each placeholder must appear exactly as many
 *     times as the deck has frames for it (3, 2, 2, 2, 3, 2); any other count
 *     stops the build with exit 1.
 *
 * A specimen is accepted only when its last non-empty line is exactly
 *   <!-- specimen-complete -->
 * Anything else stops the build with exit 1 and a message naming the file.
 *
 * The bootstrap (inserted just after the specimen's charset meta):
 *   - hides the specimen's frame bar (.bar, #bar, .framebar, #framebar) with CSS,
 *     as a fallback to the nobar hash token;
 *   - turns the iframe's name (the deck sets it to a frame token, frame-a1) into
 *     "#frame-a1&nobar" before the specimen's DOMContentLoaded runs;
 *   - posts { deckSpecH } to the parent whenever the body's height changes, so the
 *     deck can size each frame to the content it shows.
 *
 *   node .../deck/build.mjs
 *   node .../deck/build.mjs --placeholder    # build before the specimens exist;
 *                                            # walk images still inline
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

const SENTINEL = '<!-- specimen-complete -->';
const PLACEHOLDER = process.argv.slice(2).includes('--placeholder');

const specimen = (token, frames, name) => ({ token, frames, name, file: join(ROOT, 'specimens', name) });
const SPECIMENS = [
  specimen('{{SPECIMEN_A_1440}}', 3, 'proposed-a-1440.html'),
  specimen('{{SPECIMEN_A_390}}', 2, 'proposed-a-390.html'),
  specimen('{{SPECIMEN_B_1440}}', 2, 'proposed-b-1440.html'),
  specimen('{{SPECIMEN_B_390}}', 2, 'proposed-b-390.html'),
  specimen('{{SPECIMEN_C_1440}}', 3, 'proposed-c-1440.html'),
  specimen('{{SPECIMEN_C_390}}', 2, 'proposed-c-390.html'),
];

const WALK_TOKEN = /\{\{WALK:([A-Za-z0-9._-]+\.jpg)\}\}/g;

const BOOTSTRAP = '<style>.bar,#bar,.framebar,#framebar{display:none !important}</style>'
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

/**
 * Escape a full HTML document for use as the value of a double-quoted attribute.
 * Non-ASCII characters become numeric references, so the srcdoc survives whatever
 * encoding the host page is read in (the deck carries no charset meta of its own).
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

function pendingPage(name) {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Specimen pending</title>',
    '<style>html{color-scheme:light dark}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'background:#FAF7F2;color:#2C2926;font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:48px;text-align:center}',
    '@media (prefers-color-scheme:dark){body{background:#2A2622;color:#F2EDE6}}</style></head>',
    `<body><p>${name} has not been written yet. Rebuild the deck once it lands.</p></body></html>`,
  ].join('');
}

function fail(message) {
  console.error(`build.mjs: ${message}`);
  console.error('build.mjs: nothing was written. Run with --placeholder to build the deck without the specimens.');
  process.exit(1);
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function readComplete(spec) {
  if (!(await exists(spec.file))) fail(`${spec.name} does not exist at ${spec.file}.`);
  const text = await readFile(spec.file, 'utf8');
  const lines = text.split('\n');
  let last = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '') { last = lines[i].trim(); break; }
  }
  if (last !== SENTINEL) {
    fail(`${spec.name} is not complete. Its last non-empty line reads ${JSON.stringify(last)}; the build requires exactly ${JSON.stringify(SENTINEL)}.`);
  }
  return text;
}

async function main() {
  const src = await readFile(SRC, 'utf8');

  // Check every count before reading any specimen, so a miscount names itself first.
  for (const spec of SPECIMENS) {
    const slots = src.split(spec.token).length - 1;
    if (slots !== spec.frames) {
      fail(`${spec.token} appears ${slots} time(s) in ${SRC}; the deck expects exactly ${spec.frames}.`);
    }
  }

  // Walk screenshots: every referenced file must exist, in either mode.
  const names = [...new Set([...src.matchAll(WALK_TOKEN)].map((m) => m[1]))];
  const missing = [];
  for (const name of names) if (!(await exists(join(WALK, name)))) missing.push(name);
  if (missing.length) fail(`walk screenshot(s) missing from ${WALK}: ${missing.join(', ')}.`);
  const uris = new Map();
  for (const name of names) {
    uris.set(name, `data:image/jpeg;base64,${(await readFile(join(WALK, name))).toString('base64')}`);
  }
  let out = src.replace(WALK_TOKEN, (_, name) => uris.get(name));
  if (/\{\{WALK:[^}]*\}\}/.test(out)) fail('a malformed {{WALK:...}} placeholder is left in the output (only <name>.jpg is allowed).');
  console.log(`{{WALK:*}} -> ${names.length} screenshot(s) inlined, ${(src.match(WALK_TOKEN) || []).length} use(s)`);

  for (const spec of SPECIMENS) {
    const body = PLACEHOLDER ? pendingPage(spec.name) : wrap(await readComplete(spec));
    out = out.split(spec.token).join(escapeAttr(body));
    console.log(`${spec.token} -> ${spec.frames} frame(s)`
      + (PLACEHOLDER ? ' [placeholder]' : ` (${Buffer.byteLength(body, 'utf8')} bytes each)`));
  }

  if (/\{\{SPECIMEN_[A-Z0-9_]+\}\}/.test(out)) fail('an unknown {{SPECIMEN_*}} placeholder is left in the output.');

  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > 16 * 1024 * 1024) fail(`built page is ${bytes} bytes, over the 16 MB limit.`);
  await writeFile(OUT, out, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`built size: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
