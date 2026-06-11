/**
 * Slice 1 review screenshots (workstream CLAUDE.md: desktop ≥1280 + ~390px
 * of each new surface). One-off helper, not part of any build.
 *
 *   node scripts/the-document-slice1-shots.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-1/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });

// Sign in as the seeded designer (page defaults to magic-link mode —
// toggle to password mode if the password field isn't already shown)
await page.goto('http://localhost:3000/auth/signin');
await page.click('text=/sign in with email/i');
try {
  await page.waitForSelector('input[type="password"]', { timeout: 2500 });
} catch {
  await page.click('[data-testid="auth-mode-toggle"]');
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
}
await page.fill('input[type="email"]', 'designer@patina.dev');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal**', { timeout: 30_000 });

// The Desk — desktop
await page.goto('http://localhost:3000/desk');
await page.waitForSelector('article', { timeout: 30_000 });
await page.waitForTimeout(800); // settle entrance/transition
await page.screenshot({ path: `${OUT}desk-desktop.png`, fullPage: true });

// Ledger sheet stub (DocSheet) open
await page.click('nav[aria-label="Studio drawer"] >> text=Orders');
await page.waitForSelector('[role="dialog"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}desk-ledger-sheet.png`, fullPage: false });
await page.keyboard.press('Escape');

// The Desk — mobile width
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}desk-mobile.png`, fullPage: true });

await browser.close();
console.log(`Saved 3 screenshots to ${OUT}`);
