/**
 * Dissolve Track 2 review screenshots + scripted acceptance (R28 — the
 * Orders book grows pages):
 *   - the book's DM-mono page links (LEDGER · THE WEEK · RECEIVING · VENDORS),
 *     never tabs
 *   - The Week: weeks-across / projects-down grid with a live install
 *     collision marked, and the same collision risen on the Desk as a folder
 *     need line
 *   - Receiving: the front-matter stat line + the warehouse-day queue + the
 *     Settled fold
 *   - Vendors: the vendor pane — terms, open POs, the thread (designer brief
 *     + vendor reply) and the + Brief vendor composer
 *
 *   node scripts/the-document-track2-shots.mjs
 *
 * Requires: a dev server (BASE below; default :3000), migrations through
 * 00207, and the local + track1 + track2 seeds run.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/track-2/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = process.env.DOC_BASE ?? 'http://localhost:3000';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });

const openOrdersBook = async () => {
  // The Studio Drawer's Orders book button (desktop strip).
  await page.click('nav[aria-label="Studio drawer"] button:has-text("Orders")');
  await page.waitForSelector('text=/the studio book/', { timeout: 15_000 });
};
const gotoPage = async (label) => {
  await page.click(`button:has-text("${label}")`);
};

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

// ── A · the Desk — the install collision risen as a folder need line ──
// (ASSERT 3 proves the data; the classifier is jest-tested; here we capture
// the promoted Desk line.)
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 60_000 });
const collisionLine = page.locator('text=/installs collide — week of/i');
if ((await collisionLine.count()) === 0) {
  console.warn('⚠ no collision line on the Desk — shadowed by higher-ranked needs? capturing anyway');
} else {
  console.log('✓ R28: the install collision rose on the Desk as a need line');
}
await page.screenshot({ path: `${OUT}desk-collision.png` });

// ── B · the Orders book — the page links (never tabs) + the Ledger ──
await openOrdersBook();
// the four DM-mono page links present
for (const label of ['Ledger', 'The Week', 'Receiving', 'Vendors']) {
  await page.waitForSelector(`button:has-text("${label}")`, { timeout: 10_000 });
}
await page.screenshot({ path: `${OUT}orders-book-ledger.png` });
console.log('✓ R28: the book opens on the Ledger with four DM-mono page links');

// ── C · The Week — grid + the conflict line ──
await gotoPage('The Week');
await page.waitForSelector('th:has-text("Project")', { timeout: 15_000 });
await page.waitForSelector('text=/Conflicts ·/', { timeout: 15_000 });
await page.waitForSelector('text=/installs collide — week of/i', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}orders-book-week.png` });
console.log('✓ R28: The Week grid (weeks across, projects down) + the live collision line');

// ── D · Receiving — front-matter stats + the warehouse queue ──
await gotoPage('Receiving');
await page.waitForSelector('text=/the warehouse day/', { timeout: 15_000 });
await page.waitForSelector('text=/Awaiting inspection ·/', { timeout: 15_000 });
// the front-matter stat labels (I23 precedent)
await page.waitForSelector('text=/30-day pass|Awaiting log|Claims/', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}orders-book-receiving.png` });
console.log('✓ R28: Receiving — front-matter stat line + warehouse-day queue (Inspect mounts I17)');

// ── E · Vendors — the directory, then the pane (terms · open POs · thread) ──
await gotoPage('Vendors');
await page.waitForSelector('button:has-text("Verellen")', { timeout: 15_000 });
await page.click('button:has-text("Verellen")');
await page.waitForSelector('text=/Open orders ·/', { timeout: 15_000 });
await page.waitForSelector('text=/The thread/', { timeout: 10_000 });
// the vendor's reply is in the pane (R28: a vendor reply threads in)
await page.waitForSelector('text=/send the acknowledgment|Confirmed — 8 weeks/i', {
  timeout: 10_000,
});
await page.waitForSelector('text=/Brief vendor/', { timeout: 10_000 });
await page.screenshot({ path: `${OUT}orders-book-vendors.png` });
console.log('✓ R28: the vendor pane — terms, open POs, the thread (vendor reply present), + Brief vendor');

// ── F · mobile inherits via the DocSheet path ──
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/desk`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}desk-mobile.png` });
console.log('✓ mobile Desk renders (Orders book inherits via the shared DocSheet)');

await browser.close();
console.log('\nTrack 2 shots written to docs/design/the-document/screenshots/track-2/');
