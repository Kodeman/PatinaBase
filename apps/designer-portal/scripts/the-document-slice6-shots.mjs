/**
 * Slice 6 (increment 1) review screenshots + scripted acceptance:
 *   - the breath: the active spine marker carries .doc-breath; nothing else does
 *   - idle annotation (D10): a timer with a long idle gap annotates "~N quiet
 *     minutes" on the strip and writes idle_seconds; the number is unchanged
 *   - ⌘K command bar: opens, lists documents with fill-state marks + ledgers,
 *     navigates to a document, opens a ledger
 *   - interruption settings (D2): opens from ⌘K, ships all-off, a toggle persists
 * One-off helper.
 *
 *   node scripts/the-document-slice6-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations through 00201,
 * `the-document-local-seed.sql` run.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-6/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';
const DESIGNER = 'a0000000-0000-0000-0000-000000000004';

const psql = (sql) =>
  execSync('docker exec -i supabase_db_supabase psql -U postgres -d postgres -At', { input: sql })
    .toString()
    .trim();

psql(`delete from project_time_entries where user_id = '${DESIGNER}';
      delete from designer_interruption_rules where designer_id = '${DESIGNER}';`);

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

const waitFor = async (label, fn, timeoutMs = 8000) => {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

// ── A · the breath (R15): exactly the active spine marker animates ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
const WHITFIELD_URL = page.url();
await page.waitForSelector('aside[aria-label="Document spine"]', { timeout: 30_000 });
const breathing = await page.locator('aside[aria-label="Document spine"] .doc-breath').count();
if (breathing !== 1) throw new Error(`expected exactly 1 breathing marker, found ${breathing}`);
// Nothing on the Desk breathes.
await page.goto(`${BASE}/desk`);
await page.waitForSelector('a[href^="/doc/"]', { timeout: 30_000 });
if (await page.locator('.doc-breath').count())
  throw new Error('the Desk must never move — found a breathing element');
console.log('✓ the breath: exactly the active spine marker animates; nothing on the Desk moves');

// ── B · ⌘K command bar: documents (fill-state) + ledgers + navigate ──
await page.keyboard.press('Meta+k');
await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
// fill-state marks render in the rows (the StrataMark ghost tracks)
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}command-bar.png`, fullPage: false });
await page.fill('input[aria-label="Find anything"]', 'Whitfield');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await waitFor('navigated to a document', async () => page.url().includes('/doc/'));
console.log('✓ ⌘K: filtered to a document and navigated to it');

// open a ledger from ⌘K
await page.keyboard.press('Meta+k');
await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
await page.fill('input[aria-label="Find anything"]', 'Hours');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForSelector('text=/this week/', { timeout: 15_000 });
console.log('✓ ⌘K: opened the Hours ledger by name');
await page.keyboard.press('Escape');

// ── C · interruption settings (D2): opens from ⌘K, ships all-off, toggles ──
await page.keyboard.press('Meta+k');
await page.waitForSelector('[role="dialog"][aria-label="Command bar"]', { timeout: 10_000 });
await page.fill('input[aria-label="Find anything"]', 'Interrupt');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForSelector('text=/nothing breaks through unless you say so/i', { timeout: 15_000 });
const switches = page.locator('[role="switch"]');
const n = await switches.count();
if (n !== 6) throw new Error(`expected 6 interruption switches, found ${n}`);
for (let i = 0; i < n; i++) {
  if ((await switches.nth(i).getAttribute('aria-checked')) !== 'false')
    throw new Error('an interruption shipped enabled — D2 says zero');
}
await page.screenshot({ path: `${OUT}interruptions.png`, fullPage: false });
await switches.nth(0).click(); // turn Decisions on
await waitFor('rule persisted', async () => {
  return (
    psql(
      `select count(*) from designer_interruption_rules where designer_id='${DESIGNER}' and kind='decision' and enabled;`,
    ) === '1'
  );
});
console.log('✓ interruptions: ships all-off (6 switches), a toggle persists');
await page.keyboard.press('Escape');

// ── D · idle annotation (D10): a long idle gap annotates, never trims ──
await page.goto(WHITFIELD_URL);
await page.waitForSelector('aside[aria-label="Document spine"] >> text=/In hand/', {
  timeout: 30_000,
});
await waitFor('timer running', async () => {
  return (
    psql(
      `select count(*) from project_time_entries where user_id='${DESIGNER}' and duration_minutes is null;`,
    ) === '1'
  );
});
// Simulate a 40-minute window with a single big idle gap: back-date started_at,
// and there are no activity pings during the headless wait → the whole window
// reads as idle. (The provider seeds pings at start + now; the gap between is
// > threshold.)
psql(
  `update project_time_entries set started_at = now() - interval '40 minutes' where user_id='${DESIGNER}' and duration_minutes is null;`,
);
await page.keyboard.press('Escape'); // put down → log strip
await page.waitForSelector('[aria-label="Log time offer"] >> text=/was in hand for/', {
  timeout: 15_000,
});
await page.waitForSelector('[aria-label="Log time offer"] >> text=/quiet minutes/', {
  timeout: 10_000,
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}log-strip-idle.png`, fullPage: false });
const offered = await page.locator('[aria-label="Minutes to log"]').inputValue();
await page.click('[aria-label="Log time offer"] >> text=/^Log$/');
await waitFor('logged with idle_seconds, duration intact', async () => {
  const row = psql(
    `select duration_minutes || '|' || coalesce(idle_seconds::text,'-')
       from project_time_entries where user_id='${DESIGNER}' and duration_minutes is not null;`,
  );
  const [dur, idle] = row.split('|');
  return dur === offered && Number(idle) > 60 * 8;
});
console.log(`✓ idle annotation: ${offered} min logged unchanged, idle_seconds recorded (not trimmed)`);

await browser.close();
console.log(`Saved screenshots to ${OUT}`);
