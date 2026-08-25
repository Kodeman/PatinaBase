import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:3000';
const projectRich = '2992a486-b2bd-4139-9e51-33ed1621c59c';
const TEST_EMAIL = 'designer@patina.dev';
const TEST_PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';
const results = {};
async function signIn(page) {
  await page.addInitScript((key) => { try { window.localStorage.setItem(key, '1'); } catch {} }, WELCOME_SHOWN_KEY);
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, { timeout: 30_000, waitUntil: 'networkidle' });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', { name: /sign in with email|use email and password instead/i });
  await disclosure.first().waitFor({ state: 'visible', timeout: 15_000 });
  await disclosure.first().click();
  const emailInput = page.getByLabel(/email/i).first();
  await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);
  await page.getByLabel(/password/i).first().fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/, { timeout: 60_000 });
}
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await signIn(page);
  await page.goto(`${BASE}/doc/${projectRich}`, { waitUntil: 'networkidle' });
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(200);
  const scrollAfterManualScroll = await page.evaluate(() => window.scrollY);
  await page.getByText('Studio books', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Orders$/i }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'p4-orders-open-from-scrolled-doc.png') });
  // click Receiving tab
  const recvTab = page.getByText('RECEIVING', { exact: true }).or(page.getByRole('tab', { name: /receiving/i }));
  await recvTab.first().click().catch(e => results.recvClickErr = String(e));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'p4-receiving-tab.png') });
  results.receivingTabText = await page.evaluate(() => document.body.innerText).catch(() => null);
  // close sheet, check doc scroll position restored
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const scrollAfterClose = await page.evaluate(() => window.scrollY);
  results.scroll = { scrollBefore, scrollAfterManualScroll, scrollAfterClose };
  await page.screenshot({ path: path.join(OUT, 'p4-after-close-scroll-check.png') });
  writeFileSync(path.join(OUT, 'probe4-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE p4');
})();
