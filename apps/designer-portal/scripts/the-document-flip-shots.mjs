/**
 * THE FLIP acceptance (R21/R22). With the-document-pilot graduated (flag on):
 *   · /portal resolves to /desk (the flip); other zone routes stay reachable.
 *   · R22 awareness tier: a sent-unopened-1-day proposal renders as an
 *     In-motion CHIP (tappable, state-carrying), not a needs-your-hand folder;
 *     it promotes to a folder at 2 days.
 *
 *   node scripts/the-document-flip-shots.mjs
 *
 * Requires: worktree dev server on :3100 with FLAG_OVERRIDES the-document-pilot:true.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-6/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });

await page.goto(`${BASE}/auth/signin`);
await page.click('text=/sign in with email/i');
try {
  await page.waitForSelector('input[type="password"]', { timeout: 15_000 });
} catch {
  await page.click('[data-testid="auth-mode-toggle"]');
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
}
await page.fill('input[type="email"]', 'designer@patina.dev');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal**', { timeout: 60_000 });

// ── THE FLIP: the portal root resolves to the Desk ──
await page.goto(`${BASE}/portal`);
await page.waitForURL('**/desk', { timeout: 30_000 });
if (!page.url().endsWith('/desk')) throw new Error(`/portal did not flip to /desk (at ${page.url()})`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 30_000 });
console.log('✓ THE FLIP: /portal resolves to /desk');

// ── A zone route stays URL-reachable (no flip, no break) ──
await page.goto(`${BASE}/portal/procurement/by-vendor`);
await page.waitForLoadState('domcontentloaded');
if (page.url().endsWith('/desk')) throw new Error('zone route should stay reachable, not flip');
console.log('✓ zone routes stay URL-reachable (procurement loaded, no flip)');

// ── R22: the sent-unopened-1d proposal is an In-motion CHIP, not a folder ──
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 30_000 });
await page.waitForTimeout(700);
// The "In motion" region holds the chip; the chip carries "sent, unopened 1d"
// and is a link (tappable), and it must NOT appear as a CLAIM/SENT folder need.
const chip = page.locator('li a', { hasText: /sent, unopened 1d/ });
await chip.waitFor({ timeout: 15_000 });
const chipHref = await chip.getAttribute('href');
if (!chipHref?.startsWith('/doc/')) throw new Error('R22 chip is not a tappable document link');
// And it is not urgency-outlined / not in a folder need line:
if (await page.locator('text=/Sent .* — not yet opened/').count())
  throw new Error('sent-1d still rendered as a folder need (R22 violated)');
await page.screenshot({ path: `${OUT}flip-desk-r22.png`, fullPage: true });
console.log('✓ R22: sent-unopened-1d is an In-motion chip (tappable), not a needs-your-hand folder');

await browser.close();
console.log('done');
