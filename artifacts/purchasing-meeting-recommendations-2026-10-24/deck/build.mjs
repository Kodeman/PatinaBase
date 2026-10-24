#!/usr/bin/env node
// Inline the local-walk JPEGs into the authored deck (same source/build/output seam as the US-50 deck).
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const imageDir = join(here, 'img');
const output = join(here, 'index.html');
const JPEG_LIMIT = 5_000_000;
const OUTPUT_LIMIT = 16_000_000;

try {
  const source = await readFile(join(here, 'src', 'index.html'), 'utf8');
  const names = (await readdir(imageDir)).filter((name) => name.endsWith('.jpg')).sort();
  let imageBytes = 0;
  const images = new Map();
  for (const name of names) {
    const file = join(imageDir, name);
    imageBytes += (await stat(file)).size;
    images.set(name, `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`);
  }
  if (imageBytes > JPEG_LIMIT) throw new Error(`JPEG set is ${imageBytes} bytes; limit is 5 MB.`);
  const used = new Set();
  const built = source.replace(/\{\{IMG:([^}]+)\}\}/g, (_token, name) => {
    if (!images.has(name)) throw new Error(`Missing image: ${name}`);
    used.add(name);
    return images.get(name);
  });
  if (/\{\{[^}]*\}\}/.test(built)) throw new Error('Unresolved build placeholder.');
  const unused = names.filter((name) => !used.has(name));
  if (unused.length) console.warn(`build.mjs: unused JPEGs in img/: ${unused.join(', ')}`);
  const bytes = Buffer.byteLength(built);
  if (bytes >= OUTPUT_LIMIT) throw new Error(`Built deck is ${bytes} bytes; must be below 16 MB.`);
  const sheets = (built.match(/<section class="sheet"/g) || []).length;
  const frames = (built.match(/class="frame" data-frame=/g) || []).length;
  await writeFile(output, built);
  console.log(`Built ${sheets} sheets, ${frames} mockup frames; ${used.size} JPEGs (${imageBytes} bytes); self-contained HTML ${bytes} bytes.`);
} catch (error) {
  console.error(`build.mjs: ${error.message}`);
  process.exitCode = 1;
}
