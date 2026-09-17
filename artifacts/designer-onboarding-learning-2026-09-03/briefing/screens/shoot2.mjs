// Second pass — fixes for 08 (help panel), 12 (Orders via the Ledgers popover),
// 09b (spine rail dump), plus a project-document spine and a probe of the
// bottom-right badge. Same run instructions as shoot.mjs.
import { chromium } from '/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = 'http://localhost:3000';
const log = [];
const labels = {};
const note = (k, v) => { log.push(`${k}: ${v}`); console.log(`${k}: ${v}`); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); note(name, 'captured'); };
const settle = (page, ms = 1500) => page.waitForTimeout(ms);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
async function step(name, fn) { try { await fn(); } catch (e) { note(name, `FAILED — ${String(e.message || e).split('\n')[0]}`); try { await shot(page, `${name}-FAILED`); } catch {} } }

await step('login', async () => {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'networkidle' });
  await settle(page, 2000);
  await page.getByRole('button', { name: /Use email and password instead/i }).click();
  await page.locator('input[type=email]').fill('designer@patina.dev');
  await page.locator('input[type=password]').fill('password123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForURL(/\/desk/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 3000);
});

// probe the bottom corners (the "N" badge + the bottom-right emoji)

// 08 — help panel
await step('08-help-panel', async () => {
  await page.keyboard.press('Meta+k');
  await settle(page, 1200);
  await page.keyboard.type('Help');
  await settle(page, 1000);
  await page.getByText(/about this surface/i).first().click();
  await settle(page, 3000);
  labels.helpPanel = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('[role=dialog], [role=complementary], aside, [data-testid*="help"]')].filter(e => e.getBoundingClientRect().width > 200);
    return cands.map(e => ({ tag: e.tagName, aria: e.getAttribute('aria-label'), tid: e.getAttribute('data-testid'), text: e.innerText.slice(0, 2500) }));
  });
  await shot(page, '08-help-panel');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 05c / 12 — Ledgers popover, then Orders
await step('12-orders-sheet', async () => {
  const drawer = page.locator('nav[aria-label="Studio drawer"]');
  await page.keyboard.press('Escape'); await settle(page, 500); await drawer.getByRole('button', { name: /^Ledgers/i }).first().click();
  await settle(page, 1200);
  labels.ledgersPopover = await page.locator('[aria-label="Ledgers"]').first().innerText().catch(() => null);
  await shot(page, '05c-ledgers-popover');
  await page.locator('[aria-label="Ledgers"]').getByRole('button', { name: /^Orders/i }).first().click();
  await settle(page, 3500);
  labels.ordersSheet = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(e => e.innerText.slice(0, 2000)));
  await shot(page, '12-orders-sheet');
  await page.keyboard.press('Escape');
  await settle(page, 800);
});

// 09b — spine rail on the first document; 09c — a project document's spine


fs.writeFileSync(path.join(OUT, 'labels3.json'), JSON.stringify(labels, null, 2));
fs.writeFileSync(path.join(OUT, 'shoot3.log'), log.join('\n') + '\n');
await browser.close();
