import { chromium } from '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-integration/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';

export const SHOTS =
  '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
export const BASE = 'http://localhost:3002';
export const USER = 'client@patina.dev';
export const PASS = 'password123';

export async function open({ width = 1280, height = 1000, motion = 'no-preference' } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200));
  });
  return { browser, ctx, page };
}

export const PROJECT = 'b0000000-0000-0000-0000-0000000000d1';

export async function signIn(page) {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
  const disclosure = page
    .getByRole('button', { name: /sign in with email|use email and password instead/i })
    .first();
  const password = page.getByLabel(/password/i).first();
  const deadline = Date.now() + 120000;
  for (;;) {
    try {
      await disclosure.waitFor({ state: 'visible', timeout: 30000 });
      await disclosure.click();
      await password.waitFor({ state: 'visible', timeout: 5000 });
      break;
    } catch (e) {
      if (Date.now() > deadline) throw e;
    }
  }
  await page.getByLabel(/email/i).first().fill(USER);
  await password.fill(PASS);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 60000 });
}

export async function settle(page) {
  await page.getByTestId('doorplate').first().waitFor({ state: 'visible', timeout: 60000 });
  const deadline = Date.now() + 90000;
  for (;;) {
    if ((await page.getByTestId('threshold-hold').count()) === 0) return;
    if (Date.now() > deadline) throw new Error('threshold-hold never cleared');
    await page.waitForTimeout(250);
  }
}

export async function openHouse(page) {
  await page.goto(`${BASE}/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

export async function shot(page, name) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

export async function fullShot(page, name) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

export function t(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/** The ask whose question starts with `q`. */
export function askBy(page, q) {
  return page.locator('[data-testid="doorstep-approval"]').filter({
    has: page.locator(`[data-testid="approval-question"]:has-text("${q}")`),
  }).first();
}

export async function css(loc, prop) {
  return loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

/** Press and hold a button with a real pointer for `ms`. */
export async function holdPress(page, loc, ms) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for hold target');
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
