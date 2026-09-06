import { chromium } from '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';

export const SHOTS =
  '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w3/web-walk-shots-r2';
export const BASE = 'http://localhost:3002';
export const USER = 'client@patina.dev';
export const PASS = 'password123';
export const SOLO = 'client-solo@patina.dev';
export const PROJECT = 'b0000000-0000-0000-0000-0000000000d1';

export const IDS = {
  predecessor: '57d7fad9-1e9f-40ed-8ccb-257d443a5b7e',
  successor: 'aee67ead-656f-4ce7-beaf-a42840b8e7a3',
  g3approved: '104e94dc-d23f-4200-9984-24cf40fa758d',
  g2pending: 'a3a4ae27-08fc-4025-a4a6-765aa90b3fce',
  g6overdue: 'f5e6c6ad-95dd-4cbb-861d-f6bfd77c3361',
  g8returned: 'eb18b8ad-c610-49f2-9a88-5d7afd81c277',
  signedProposal: 'b0000000-0000-0000-0000-0000000cd003',
};

export async function open({ width = 1280, height = 1100, motion = 'no-preference' } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 220));
  });
  return { browser, ctx, page };
}

export async function signIn(page, user = USER) {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
  const disclosure = page
    .getByRole('button', { name: /sign in with email|use email and password instead/i })
    .first();
  const password = page.getByLabel(/password/i).first();
  const deadline = Date.now() + 180000;
  for (;;) {
    try {
      await disclosure.waitFor({ state: 'visible', timeout: 40000 });
      await disclosure.click();
      await password.waitFor({ state: 'visible', timeout: 6000 });
      break;
    } catch (e) {
      if (Date.now() > deadline) throw e;
    }
  }
  await page.getByLabel(/email/i).first().fill(user);
  await password.fill(PASS);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 90000 });
}

export async function settle(page) {
  await page.getByTestId('doorplate').first().waitFor({ state: 'visible', timeout: 90000 });
  const deadline = Date.now() + 90000;
  for (;;) {
    if ((await page.getByTestId('threshold-hold').count()) === 0) return;
    if (Date.now() > deadline) throw new Error('threshold-hold never cleared');
    await page.waitForTimeout(250);
  }
}

export async function openHouse(page, hash = '') {
  await page.goto(`${BASE}/projects/${PROJECT}${hash}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

export async function shot(page, name, full = false) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: full });
  return p;
}

export function t(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export async function css(loc, prop) {
  return loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

export async function holdPress(page, loc, ms) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for hold target');
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
