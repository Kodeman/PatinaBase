#!/usr/bin/env node
// Inline the local-walk JPEGs into the authored deck, following the prior deck's source/build/output seam.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const imageDir = join(here, 'img');
const output = join(here, 'index.html');

try {
  const source = await readFile(join(here, 'src', 'index.html'), 'utf8');
  const names = (await readdir(imageDir)).filter(name => name.endsWith('.jpg')).sort();
  let imageBytes = 0;
  const images = new Map();
  for (const name of names) {
    const file = join(imageDir, name);
    imageBytes += (await stat(file)).size;
    images.set(name, `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`);
  }
  if (imageBytes > 6_000_000) throw new Error(`JPEG collection is ${imageBytes} bytes; limit is 6 MB.`);
  const built = source.replace(/\{\{IMG:([^}]+)\}\}/g, (_token, name) => {
    if (!images.has(name)) throw new Error(`Missing image: ${name}`);
    return images.get(name);
  });
  if (/\{\{[^}]+\}\}/.test(built)) throw new Error('Unresolved build placeholder.');
  const bytes = Buffer.byteLength(built);
  if (bytes >= 16_000_000) throw new Error(`Built deck is ${bytes} bytes; must be below 16 MB.`);
  await writeFile(output, built);
  console.log(`Built 18 sheets; ${names.length} JPEGs (${imageBytes} bytes); self-contained HTML ${bytes} bytes.`);
} catch (error) {
  console.error(`build.mjs: ${error.message}`);
  process.exitCode = 1;
}
