// Wave 3b — what D7's two utilities actually buy at 390, measured on one build.
// Surgery: strip `min-w-0` and `overflow-wrap:anywhere` from every roster name
// (the pre-D7 shape) and re-measure; then restore.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/artifacts/portal-polish-build-2026-09-08/waves/w3b/renders';
const BASE = 'http://localhost:3000';
const K = 'help-system.welcome-shown.first-project-walkthrough';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.addInitScript((k) => {
  try {
    localStorage.setItem(k, '1');
  } catch {}
}, K);
await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, { waitUntil: 'domcontentloaded' });
await page
  .getByRole('button', { name: /sign in with email|use email and password instead/i })
  .first()
  .click();
await page.getByLabel(/email/i).first().fill('designer@patina.dev');
await page.getByLabel(/password/i).first().fill('password123');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL(/\/desk/, { timeout: 90000 });
await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[data-testid="desk-roster"]', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
const skip = page.getByRole('button', { name: /skip for now/i });
if (await skip.count()) {
  await skip.first().click();
  await page.waitForTimeout(900);
}

const out = await page.evaluate(() => {
  const W = () => document.documentElement.scrollWidth;
  const names = [...document.querySelectorAll('[data-roster-name]')];
  const shipped = { doc: W(), longest: 0 };
  for (const n of names) shipped.longest = Math.max(shipped.longest, Math.round(n.getBoundingClientRect().width));

  // pre-D7 shape
  for (const n of names) {
    n.style.minWidth = 'auto';
    n.style.overflowWrap = 'normal';
    n.style.wordBreak = 'normal';
  }
  const preD7 = { doc: W(), longest: 0 };
  for (const n of names) preD7.longest = Math.max(preD7.longest, Math.round(n.getBoundingClientRect().width));

  // restore
  for (const n of names) {
    n.style.minWidth = '';
    n.style.overflowWrap = '';
    n.style.wordBreak = '';
  }

  // and what a min-w-0 on the sibling state sentence would do instead —
  // the residual contributor this wave found
  const sentences = [...document.querySelectorAll('[data-roster-line] p.doc-type-body')];
  for (const p of sentences) p.style.overflowWrap = 'anywhere';
  const withSentenceWrap = { doc: W(), sentences: sentences.length };
  for (const p of sentences) p.style.overflowWrap = '';

  const restored = { doc: W() };
  return { shipped, preD7, withSentenceWrap, restored, nameCount: names.length };
});

fs.writeFileSync(`${OUT}/d7-effect-390.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
