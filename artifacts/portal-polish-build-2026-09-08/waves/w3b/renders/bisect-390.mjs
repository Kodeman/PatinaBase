// Wave 3b — bisect the residual 390 overflow to a single element.
// Method: walk the roster's subtree top-down; at each level hide one child at a
// time and re-measure documentElement.scrollWidth. The child whose removal
// drops it to 390 is on the path to the offender; recurse into it.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT =
  '/Users/kody/Code/patina-merged/artifacts/portal-polish-build-2026-09-08/waves/w3b/renders';
const BASE = 'http://localhost:3000';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';

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
}, WELCOME_SHOWN_KEY);
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

const result = await page.evaluate(() => {
  const W = () => document.documentElement.scrollWidth;
  const base = W();
  const trail = [];
  let node = document.querySelector('[data-testid="desk-roster"]');
  if (!node) return { base, trail, note: 'no roster' };

  const describe = (el) => ({
    tag: el.tagName,
    cls: String(el.className).slice(0, 140),
    text: (el.textContent || '').trim().slice(0, 60),
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
    })(),
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
    minWidth: getComputedStyle(el).minWidth,
    display: getComputedStyle(el).display,
    flexShrink: getComputedStyle(el).flexShrink,
    whiteSpace: getComputedStyle(el).whiteSpace,
    overflowWrap: getComputedStyle(el).overflowWrap,
  });

  for (let depth = 0; depth < 14; depth++) {
    const kids = [...node.children];
    if (kids.length === 0) break;
    let culprit = null;
    for (const k of kids) {
      const prev = k.style.display;
      k.style.display = 'none';
      const after = W();
      k.style.display = prev;
      if (after < base) {
        culprit = k;
        trail.push({ depth, dropsTo: after, ...describe(k) });
        break;
      }
    }
    if (!culprit) {
      trail.push({ depth, note: 'no single child accounts for it', parent: describe(node) });
      break;
    }
    node = culprit;
  }
  return { base, trail };
});

fs.writeFileSync(`${OUT}/bisect-390.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
