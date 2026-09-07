import { chromium } from '/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
import fs from 'node:fs';

export const SHOTS =
  '/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w1/web-walk-shots-r1';
export const HERE =
  '/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w1/web-walk';

const WELCOME_SHOWN_KEY =
  'help-system.welcome-shown.first-project-walkthrough';

export async function browser() {
  return chromium.launch({ headless: true });
}

export async function ctx(b, { storageState, width = 1280, height = 900 } = {}) {
  const c = await b.newContext({
    viewport: { width, height },
    storageState: storageState && fs.existsSync(storageState) ? storageState : undefined,
  });
  await c.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {}
  }, WELCOME_SHOWN_KEY);
  return c;
}

export async function signInDesigner(page, base, email, password = 'password123') {
  await page.goto(`${base}/auth/signin?callbackUrl=%2Fdesk`, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/auth/signin')) return;
  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 60000 });
  // The dev server hydrates late; a click before hydration is swallowed.
  for (let i = 0; i < 30; i++) {
    if (await page.locator('input[type="password"]').count()) break;
    await disclosure.first().click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.locator('input[type="password"]').first().waitFor({ timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(
    /\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized|portal)/,
    { timeout: 90000 },
  );
}

export async function shot(page, name) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  [shot] ${p}`);
  return p;
}

export function log(...a) {
  console.log(...a);
}
