import { chromium } from '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';

const WT =
  '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration/artifacts/client-approval-experience-2026-09-03/build/waves/w3';

export const SHOTS = `${WT}/web-walk-shots-r3`;
export const BASE = 'http://localhost:3002';
export const USER = 'client@patina.dev';
export const PASS = 'password123';
export const SOLO = 'client-solo@patina.dev';
export const PROJECT = 'b0000000-0000-0000-0000-0000000000d1';

/* Round 3 fixtures. The stack was RESET by the fix round, so every id below is
   freshly minted and read back out of `list_my_project_decision_reviews`. */
export const IDS = {
  predecessor: '61924513-a58d-42f0-96d3-cf9f25583e85', // approved, e-sig + name, superseded
  successor: '6e29e2b8-b5a6-4d87-b885-01287babb781', // the leaf, pending
  g3approved: 'c442666e-250f-42d3-a10e-9457b39c7831', // approved, NULL method, NULL name
  g2pending: 'af48ac4a-e522-417e-98c7-d09735b5dbee', // the one the walk RETURNS
  g6overdue: '3351d8a6-ea6b-415e-9a2e-ccdc73513384', // past its date
  g8returned: 'be7f9461-f06c-4e9b-956a-2bcf90734aab', // changes_requested, NULL method
  fifth: '644b3058-78c3-4f36-aa2d-c11992940ff5', // the one the walk APPROVES
  signedProposal: 'b0000000-0000-0000-0000-0000000cd003',
  doorProposal: 'b0000000-0000-0000-0000-0000000cd004',
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
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/**
 * axe-core out of the repo's own pnpm store, injected into the page.
 */
export async function axe(page, resultTypes = ['violations']) {
  const src =
    '/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration/node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js';
  await page.addScriptTag({ path: src });
  return page.evaluate(
    async (types) => window.axe.run(document, { resultTypes: types }),
    resultTypes,
  );
}
