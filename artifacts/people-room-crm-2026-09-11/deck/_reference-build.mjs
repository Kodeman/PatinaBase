#!/usr/bin/env node
/**
 * build.mjs - inline the three specimens into the deck.
 *
 * Reads deck/src/index.html, waits for the three specimen files to be COMPLETE,
 * HTML-escapes each for an attribute value, substitutes every occurrence of its
 * placeholder, and writes deck/index.html.
 *
 * A specimen is complete when the file exists AND its last non-empty line is
 * exactly `<!-- specimen-complete -->`. The builders write that sentinel last.
 * Polls every 30s for up to 120 minutes, then builds with whatever is ready and
 * puts a visible "specimen pending" page in any slot still unfinished.
 *
 *   node artifacts/agreement-room-2026-09-10/deck/build.mjs
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
const POLL_MS = 30_000;
const DEADLINE_MS = 120 * 60 * 1000;

const SPECIMENS = [
  { token: '{{SPECIMEN_D}}', file: join(ROOT, 'specimens', 'direction-1.html'), name: 'D - the galley' },
  { token: '{{SPECIMEN_A}}', file: join(ROOT, 'specimens', 'direction-2.html'), name: 'A - the paper is the page' },
  { token: '{{SPECIMEN_B}}', file: join(ROOT, 'specimens', 'direction-3.html'), name: 'B - builder as overlay' },
];

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...args) => console.log(`[${stamp()}]`, ...args);

/** Escape a full HTML document for use as the value of a double-quoted attribute. */
function escapeAttr(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A visible placeholder page for a specimen that never completed. */
function pendingPage(name) {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Specimen pending - ${name}</title>`,
    '<style>',
    'html{color-scheme:light dark}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'background:#FAF7F2;color:#2C2926;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
    'font-size:14px;line-height:1.6;letter-spacing:.06em;text-align:center;padding:48px}',
    '@media (prefers-color-scheme:dark){body{background:#2A2622;color:#F2EDE6}}',
    'p{margin:0 0 12px;max-width:46ch}',
    '.h{text-transform:uppercase;font-size:11px;letter-spacing:.1em;opacity:.7}',
    '</style></head><body><div>',
    '<p class="h">Specimen pending</p>',
    `<p>${name} did not finish building before the deck was assembled.</p>`,
    '<p class="h">Rebuild the deck once the specimen lands</p>',
    '</div></body></html>',
  ].join('');
}

async function readIfComplete(file) {
  try {
    await stat(file);
  } catch {
    return null;
  }
  const text = await readFile(file, 'utf8');
  const lines = text.split('\n');
  let last = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '') {
      last = lines[i].trim();
      break;
    }
  }
  return last === SENTINEL ? text : null;
}

async function main() {
  const src = await readFile(SRC, 'utf8');
  const started = Date.now();
  const bodies = new Map();

  for (;;) {
    for (const spec of SPECIMENS) {
      if (bodies.has(spec.token)) continue;
      const text = await readIfComplete(spec.file);
      if (text) {
        bodies.set(spec.token, text);
        log(`complete: ${spec.name} (${Buffer.byteLength(text, 'utf8')} bytes)`);
      }
    }
    if (bodies.size === SPECIMENS.length) break;
    const waited = Date.now() - started;
    if (waited >= DEADLINE_MS) {
      log(`deadline reached after ${Math.round(waited / 60000)} minutes; building with what is ready`);
      break;
    }
    const missing = SPECIMENS.filter((s) => !bodies.has(s.token)).map((s) => s.name);
    log(`waiting on: ${missing.join(' | ')} (${Math.round(waited / 60000)}m elapsed)`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  let out = src;
  const pending = [];
  for (const spec of SPECIMENS) {
    const body = bodies.get(spec.token);
    if (!body) pending.push(spec.name);
    const payload = escapeAttr(body ?? pendingPage(spec.name));
    const before = out.split(spec.token).length - 1;
    out = out.split(spec.token).join(payload);
    log(`${spec.token} -> ${before} slot(s)${body ? '' : ' [PENDING PLACEHOLDER]'}`);
  }

  await writeFile(OUT, out, 'utf8');

  const outBytes = Buffer.byteLength(out, 'utf8');
  const srcBytes = Buffer.byteLength(src, 'utf8');
  const payloadBytes = outBytes - srcBytes
    + SPECIMENS.reduce((n, s) => n + (src.split(s.token).length - 1) * Buffer.byteLength(s.token, 'utf8'), 0);
  log(`wrote ${OUT}`);
  log(`built size: ${outBytes} bytes (${(outBytes / 1024).toFixed(1)} KB)`);
  log(`srcdoc payloads: ${payloadBytes} bytes (${(payloadBytes / 1024).toFixed(1)} KB)`);
  log(`deck without payloads: ${outBytes - payloadBytes} bytes (${((outBytes - payloadBytes) / 1024).toFixed(1)} KB)`);
  if (pending.length) {
    log(`PENDING: ${pending.join(' | ')} - rebuild once they land`);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
