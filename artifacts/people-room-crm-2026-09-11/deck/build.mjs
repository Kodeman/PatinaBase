#!/usr/bin/env node
/**
 * build.mjs - inline the two People room specimens into the deck.
 *
 * Reads deck/src/index.html, reads the 1440 and 390 specimens, HTML-escapes each
 * for a double-quoted attribute value, substitutes every occurrence of its
 * placeholder ({{SPECIMEN_1440}} / {{SPECIMEN_390}}) and writes deck/index.html.
 * Each placeholder must appear exactly seven times, once per specimen sheet:
 * Directory, Person card, Company card, Project roster, Bring forward, Add sheet,
 * Site access card. Any other count stops the build with exit 1.
 *
 * A specimen is accepted only when its last non-empty line is exactly
 *   <!-- specimen-complete -->
 * Anything else stops the build with exit 1 and a message naming the file.
 *
 * State and the state bar. SPEC.md section 4 publishes one postMessage shape,
 * { state: 'state-person' }, and nothing else; the nobar token lives only in the
 * hash. A srcdoc document has no hash, so this build wraps each specimen with a
 * bootstrap in its <head>: the bootstrap reads the browsing context's name, which
 * the deck sets to the sheet's state token on the iframe, and turns it into
 * "#state-x&nobar" before the specimen's own DOMContentLoaded handler runs. The
 * deck also posts the state after load, so a specimen that ignores the hash still
 * lands on the right state. That post is why the bootstrap also carries a
 * stylesheet: goto() rewrites the hash to the bare state token and drops nobar,
 * so the bar has to be held down by CSS rather than by the hash.
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

/** Seven specimen sheets carry each width: directory, person, company, roster, pick, add, access. */
const FRAMES_PER_SPECIMEN = 7;

const SPECIMENS = [
  { token: '{{SPECIMEN_1440}}', file: join(ROOT, 'specimens', 'people-room-1440.html'), name: 'people-room-1440.html' },
  { token: '{{SPECIMEN_390}}', file: join(ROOT, 'specimens', 'people-room-390.html'), name: 'people-room-390.html' },
];

/**
 * Read the browsing context name, turn its state token into a hash, suppress the bar.
 *
 * The hash carries nobar only until the deck's postMessage lands: the specimen's
 * own goto() rewrites location.hash to the bare state token, a hashchange fires,
 * and nobar is gone, so the bar came back inside every frame. The stylesheet
 * below settles it for good - it outranks the specimen's own rules and survives
 * every later hash write.
 */
const BOOTSTRAP = '<style>.bar,.statebar,#statebar{display:none !important}</style>'
  + '<script>(function(){try{var m=/state-[a-z]+/.exec(window.name||"");'
  + 'if(m){location.hash=m[0]+"&nobar";}}catch(e){}})();</script>';

/** Escape a full HTML document for use as the value of a double-quoted attribute. */
function escapeAttr(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Put the bootstrap just after the charset declaration, so the charset stays first;
 * failing that, just inside <head>, then just inside <html>, then at the very top.
 */
function wrap(html) {
  const charset = /<meta\s+charset=[^>]*>/i.exec(html);
  if (charset) {
    const at = charset.index + charset[0].length;
    return html.slice(0, at) + BOOTSTRAP + html.slice(at);
  }
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + BOOTSTRAP + html.slice(at);
  }
  const htmlTag = /<html(\s[^>]*)?>/i.exec(html);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + BOOTSTRAP + html.slice(at);
  }
  return BOOTSTRAP + html;
}

/** The stub that stands in for a specimen that has not been written yet. */
function pendingPage(name) {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Specimen pending</title>`,
    '<style>',
    'html{color-scheme:light dark}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'background:#FAF7F2;color:#2C2926;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
    'font-size:13px;line-height:1.6;letter-spacing:.06em;text-align:center;padding:48px}',
    '@media (prefers-color-scheme:dark){body{background:#2A2622;color:#F2EDE6}}',
    'p{margin:0 0 12px;max-width:42ch}',
    '.h{text-transform:uppercase;font-size:11px;letter-spacing:.1em}',
    '</style></head><body><div>',
    '<p class="h">Specimen pending</p>',
    `<p>${name} has not been written yet.</p>`,
    '<p class="h">Rebuild the deck once it lands</p>',
    '</div></body></html>',
  ].join('');
}

/** Read a specimen, refusing anything whose last non-empty line is not the sentinel. */
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
    fail(`${spec.name} is not complete. Its last line reads ${JSON.stringify(last)}, and the build requires exactly ${JSON.stringify(SENTINEL)}.`);
  }
  return text;
}

function fail(message) {
  console.error(`build.mjs: ${message}`);
  console.error('build.mjs: nothing was written. Run with --placeholder to build the deck without the specimens.');
  process.exit(1);
}

async function main() {
  const src = await readFile(SRC, 'utf8');
  let out = src;

  for (const spec of SPECIMENS) {
    const slots = out.split(spec.token).length - 1;
    if (slots === 0) fail(`${spec.token} does not appear in ${SRC}.`);
    if (slots !== FRAMES_PER_SPECIMEN) {
      fail(`${spec.token} appears ${slots} time(s) in ${SRC}, and the deck carries ${FRAMES_PER_SPECIMEN} specimen sheets per width.`);
    }
    const body = PLACEHOLDER ? pendingPage(spec.name) : wrap(await readComplete(spec));
    out = out.split(spec.token).join(escapeAttr(body));
    console.log(
      `${spec.token} -> ${slots} frame(s)`
      + (PLACEHOLDER ? ' [placeholder]' : ` (${Buffer.byteLength(body, 'utf8')} bytes each)`),
    );
  }

  await writeFile(OUT, out, 'utf8');
  const bytes = Buffer.byteLength(out, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`built size: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`);
  if (PLACEHOLDER) console.log('placeholder build: the specimen frames read "specimen pending".');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
