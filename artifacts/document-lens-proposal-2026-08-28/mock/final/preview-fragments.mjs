import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(process.cwd(), '..', '..');
const FRAGDIR = path.join(ROOT, 'mock', 'fragments');
const KIT = fs.readFileSync(path.join(ROOT, 'mock', 'kit.css'), 'utf8');
const LENS = fs.readFileSync(path.join(ROOT, 'mock', 'lens.css'), 'utf8');
const OUT = path.join(process.cwd(), 'shots-crop');
fs.mkdirSync(OUT, { recursive: true });

const names = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

for (const name of names) {
  const frag = fs.readFileSync(path.join(FRAGDIR, name + '.html'), 'utf8');
  const m = frag.match(/width:\s*(\d+)px;\s*height:\s*(\d+)px/);
  const w = m ? Number(m[1]) : 800;
  const h = m ? Number(m[2]) : 600;
  const html = `<!doctype html><html><head><meta charset="utf8"><style>${KIT}\n${LENS}\nbody{margin:0;background:#ccc;}</style></head><body>${frag}</body></html>`;
  await page.setViewportSize({ width: Math.max(w + 40, 400), height: h + 80 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  const el = await page.$('.mock-frame');
  await el.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}

await browser.close();
