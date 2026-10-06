#!/usr/bin/env node
/**
 * build.mjs - inline the three buying specimens into the deck.
 *
 * Reads deck/src/index.html, reads today-1440, proposed-1440 and proposed-390,
 * HTML-escapes each for a double-quoted srcdoc attribute, substitutes every
 * occurrence of its placeholder and writes deck/index.html. Each placeholder must
 * appear exactly as many times as the deck has frames for it (3, 6, 3); any other
 * count stops the build with exit 1.
 *
 * A specimen is accepted only when its last non-empty line is exactly
 *   <!-- specimen-complete -->
 * Anything else stops the build with exit 1 and a message naming the file.
 *
 * The bootstrap (inserted just after the specimen's charset meta):
 *   - hides the specimen's state bar (.bar, #bar, .statebar, #statebar) with CSS,
 *     because the specimen's own goto() rewrites the hash and drops nobar;
 *   - turns the iframe's name (the deck sets it to a state token) into
 *     "#state-x&nobar" before the specimen's DOMContentLoaded runs;
 *   - posts { deckSpecH } to the parent whenever the body's height changes, so the
 *     deck can size each frame to the state it shows.
 *
 *   node .../deck/build.mjs
 *   node .../deck/build.mjs --placeholder    # build before the specimens exist
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(HERE, 'src', 'index.html');
const OUT = join(HERE, 'index.html');

const SENTINEL = '<!-- specimen-complete -->';
const PLACEHOLDER = process.argv.slice(2).includes('--placeholder');

const SPECIMENS = [
  { token: '{{SPECIMEN_TODAY_1440}}', frames: 3, file: join(ROOT, 'specimens', 'today-1440.html'), name: 'today-1440.html' },
  { token: '{{SPECIMEN_PROPOSED_1440}}', frames: 6, file: join(ROOT, 'specimens', 'proposed-1440.html'), name: 'proposed-1440.html' },
  { token: '{{SPECIMEN_PROPOSED_390}}', frames: 3, file: join(ROOT, 'specimens', 'proposed-390.html'), name: 'proposed-390.html' },
];

const BOOTSTRAP = '<style>.bar,#bar,.statebar,#statebar{display:none !important}</style>'
  + '<script>(function(){'
  + 'try{var m=/state-[a-z]+/.exec(window.name||"");if(m){location.hash=m[0]+"&nobar";}}catch(e){}'
  + 'var last=0;function send(){try{var b=document.body;if(!b)return;'
  + 'var h=Math.ceil(Math.max(b.scrollHeight,b.getBoundingClientRect().height));'
  + 'if(h&&Math.abs(h-last)>1){last=h;parent.postMessage({deckSpecH:h},"*");}}catch(e){}}'
  + 'function later(){setTimeout(send,60);setTimeout(send,400);}'
  + 'document.addEventListener("DOMContentLoaded",function(){send();'
  + 'try{if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}}catch(e){}});'
  + 'window.addEventListener("load",later);window.addEventListener("hashchange",later);'
  + 'window.addEventListener("message",later);'
  + '})();</script>';

/** Escape a full HTML document for use as the value of a double-quoted attribute. */
function escapeAttr(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

async function readComplete(spec) {
  try {
    await stat(spec.file);
  } catch {
    fail(`${spec.name} does not exist at ${spec.file}.`);
  }
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
  let out = src;

  // Check every count before reading any specimen, so a miscount names itself first.
  for (const spec of SPECIMENS) {
    const slots = src.split(spec.token).length - 1;
    if (slots !== spec.frames) {
      fail(`${spec.token} appears ${slots} time(s) in ${SRC}; the deck expects exactly ${spec.frames}.`);
    }
  }

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
