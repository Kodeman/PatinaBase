import { chromium } from '/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration/apps/client-portal/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const SHOTS =
  '/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w3/web-walk-shots-r1';

export const DESIGNER = 'http://localhost:3000';
export const CLIENT = 'http://localhost:3002';

export const HERE =
  '/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w3/web-walk';

export async function launch({ width = 1280, height = 900, state = null } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(state ? { storageState: state } : {}),
  });
  ctx.setDefaultTimeout(30000);
  return { browser, ctx };
}

/** Sign in with retries, then persist storage state for later scripts. */
export async function signInPersist(page, ctx, base, email, statePath) {
  for (let i = 0; i < 3; i += 1) {
    try {
      await signIn(page, base, email);
      await page.waitForTimeout(3000);
      if (!page.url().includes('/auth/')) break;
    } catch {
      /* retry */
    }
  }
  await ctx.storageState({ path: statePath });
  return page.url();
}

export async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

export async function signIn(page, base, email, password = 'password123', dest = '') {
  const q = dest ? `?callbackUrl=${encodeURIComponent(dest)}` : '';
  await page.goto(`${base}/auth/signin${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const pw = page.locator('input[type="password"]').first();
  for (let i = 0; i < 5 && (await pw.count()) === 0; i += 1) {
    await page.getByRole('button', { name: /Use email and password instead/i }).click();
    await page.waitForTimeout(900);
  }
  await pw.waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('input[type="email"]').first().fill(email);
  await pw.fill(password);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  await page.waitForTimeout(7000);
  return page.url();
}

/** The desk shows a welcome modal on a fresh profile; clear it before clicking. */
export async function dismissOverlays(page) {
  for (let i = 0; i < 4; i += 1) {
    const overlay = page.locator('[data-testid="welcome-modal-overlay"]');
    if ((await overlay.count()) === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(400);
}

export async function textOf(page) {
  return page.evaluate(() => document.body.innerText);
}
