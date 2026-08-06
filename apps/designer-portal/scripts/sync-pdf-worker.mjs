#!/usr/bin/env node
/**
 * Copy pdfjs' worker into public/ so the Plan Room's Light Table can load it
 * from a same-origin path (a strict CSP forbids a CDN, and the worker cannot be
 * bundled by webpack without losing its own module graph).
 *
 * The copy is GENERATED, never committed — public/vendor/ is gitignored and
 * this script runs on predev and prebuild.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const require = createRequire(import.meta.url);

const source = join(
  dirname(require.resolve('pdfjs-dist/package.json')),
  'build',
  'pdf.worker.min.mjs',
);
const target = join(app, 'public', 'vendor', 'pdfjs', 'pdf.worker.min.mjs');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
process.stdout.write(`sync-pdf-worker: ${target}\n`);
