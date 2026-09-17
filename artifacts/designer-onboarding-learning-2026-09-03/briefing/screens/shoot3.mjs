// Third pass — shot 06 with the dev server relaunched under
// NEXT_PUBLIC_FLAG_OVERRIDES='studio-workspaces:true' (the Account sheet's
// Studio page and its setup checklist sit behind that flag). Same run
// instructions as shoot.mjs.
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
page.setDefaultTimeout(20000);
async function step(name, fn) { try { await fn(); } catch (e) { note(name, `FAILED — ${String(e.message || e).split('\n')[0]}`); try { await shot(page, `${name}-FAILED`); } catch {} } }

await step('login', async () => {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'networkidle', timeout: 120000 });
  await settle(page, 2000);
  await page.getByRole('button', { name: /Use email and password instead/i }).click();
  await page.locator('input[type=email]').fill('designer@patina.dev');
  await page.locator('input[type=password]').fill('password123');
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForURL(/\/desk/, { timeout: 90000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 4000);
});

await step('02b-desk-flag-on', async () => {
  labels.deskFlagOnText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  await shot(page, '02b-desk-studio-flag-on');
});

await step('06-account-studio-setup', async () => {
  await page.getByRole('button', { name: /Account and settings/i }).first().click();
  await settle(page, 2500);
  const sheet = page.locator('[role=dialog]').last();
  labels.accountSheetTabs = await sheet.locator('button, a').evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  await shot(page, '06a-account-sheet');
  const studioTab = sheet.getByRole('button', { name: /^Studio$/i }).first();
  if (!(await studioTab.count())) throw new Error('no Studio page button in the Account sheet even with the override');
  await studioTab.click();
  await settle(page, 3000);
  labels.accountStudioPage = await sheet.innerText();
  await shot(page, '06-account-studio-setup');
  await page.keyboard.press('Escape');
});

fs.writeFileSync(path.join(OUT, 'labels4.json'), JSON.stringify(labels, null, 2));
fs.writeFileSync(path.join(OUT, 'shoot4.log'), log.join('\n') + '\n');
await browser.close();
