// Wave 3b — anatomy of the roster row that still overflows at 390.
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
  const rows = [...document.querySelectorAll('li')].filter((li) => li.scrollWidth > li.clientWidth);
  const anat = rows.slice(0, 4).map((li) => ({
    text: (li.textContent || '').trim().slice(0, 70),
    scrollW: li.scrollWidth,
    clientW: li.clientWidth,
    kids: [...li.children].map((c) => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        tag: c.tagName,
        text: (c.textContent || '').trim().slice(0, 44),
        l: Math.round(r.left),
        rt: Math.round(r.right),
        w: Math.round(r.width),
        scrollW: c.scrollWidth,
        minWidth: cs.minWidth,
        flex: `${cs.flexGrow} ${cs.flexShrink} ${cs.flexBasis}`,
        whiteSpace: cs.whiteSpace,
        overflowWrap: cs.overflowWrap,
        cls: String(c.className).slice(0, 110),
      };
    }),
  }));

  // which single child, hidden, brings the LI's own scrollWidth back inside
  const cures = [];
  for (const li of rows.slice(0, 2)) {
    for (const c of [...li.children]) {
      const prev = c.style.display;
      c.style.display = 'none';
      cures.push({
        row: (li.textContent || '').trim().slice(0, 40),
        hid: (c.textContent || '').trim().slice(0, 34) || c.tagName,
        liScrollW: li.scrollWidth,
        docScrollW: document.documentElement.scrollWidth,
      });
      c.style.display = prev;
    }
  }
  return { overflowingRows: rows.length, anat, cures };
});

fs.writeFileSync(`${OUT}/row-anatomy-390.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
