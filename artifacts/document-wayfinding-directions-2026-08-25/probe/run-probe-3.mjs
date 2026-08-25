import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:3000';
const IDS = {
  project_rich: '2992a486-b2bd-4139-9e51-33ed1621c59c',
};
const TEST_EMAIL = 'designer@patina.dev';
const TEST_PASSWORD = 'password123';
const WELCOME_SHOWN_KEY = 'help-system.welcome-shown.first-project-walkthrough';
const results = {};

async function hideDevOverlays(page) {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-e2e-hide-dev-overlays', '');
      style.textContent = '.tsqd-open-btn-container, .tsqd-main-panel { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
    else inject();
  });
}
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await hideDevOverlays(page);
  await signIn(page);
  await page.goto(`${BASE}/doc/${IDS.project_rich}`, { waitUntil: 'networkidle' });

  // find the "MORE" trigger precisely
  results.moreCandidates = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button')).filter(el => /more/i.test(el.textContent || ''));
    return els.map(el => ({ text: el.textContent?.trim(), rect: el.getBoundingClientRect() }));
  });
  const moreBtn = page.locator('button', { hasText: /^\s*···\s*MORE\s*$|MORE/i }).last();
  await moreBtn.click({ timeout: 5000 }).catch(e => results.moreClickErr = String(e));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'p3-more-menu.png'), fullPage: false });
  results.moreMenuText = await page.evaluate(() => document.body.innerText);

  // search affordance anywhere?
  results.searchAffordance = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    return all.filter(el => /find|search|⌘|command/i.test(el.textContent || '') || /find|search/i.test(el.getAttribute('aria-label') || ''))
      .map(el => el.textContent?.trim() || el.getAttribute('aria-label'));
  });

  writeFileSync(path.join(OUT, 'probe3-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE p3');
})();
