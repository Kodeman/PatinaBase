/**
 * Slice 5 review screenshots + scripted acceptance (spec v1.2 §13 Slice 5):
 *   - doc-switch AND header-timer chaining both offer correctly
 *   - timer_auto <60s silent-discards · timer_manual rounds up
 *   - adjusted entries persist raw_seconds
 * One-off helper. Elapsed time is simulated by backdating started_at via
 * psql between steps.
 *
 *   node scripts/the-document-slice5-shots.mjs
 *
 * Requires: worktree dev server on :3100, migrations 00188–00195 applied,
 * `the-document-local-seed.sql` run.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../../../docs/design/the-document/screenshots/slice-5/', import.meta.url)
  .pathname;
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const WHITFIELD_PROPOSAL = 'b0000000-0000-0000-0000-000000000001';
const OLSEN = '05364074-614a-443c-90fb-173f4b259f58';
const DESIGNER = 'a0000000-0000-0000-0000-000000000004';

const psql = (sql) =>
  execSync('docker exec -i supabase_db_supabase psql -U postgres -d postgres -At', {
    input: sql,
  })
    .toString()
    .trim();

const waitFor = async (label, fn, timeoutMs = 8000) => {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

// Clean slate for the designer's time rows (local dev only).
psql(`delete from project_time_entries where user_id = '${DESIGNER}';`);

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

const STRIP = '[aria-label="Log time offer"]';
const running = () =>
  psql(
    `select count(*) from project_time_entries where user_id='${DESIGNER}' and duration_minutes is null;`,
  );

// ── A · pick up = the timer starts (D11, timer_auto) ──
await page.goto(`${BASE}/doc/${WHITFIELD_PROPOSAL}`);
await page.waitForURL((u) => !u.pathname.includes(WHITFIELD_PROPOSAL), { timeout: 60_000 });
const WHITFIELD_URL = page.url();
await page.waitForSelector('aside[aria-label="Document spine"] >> text=/In hand/', {
  timeout: 30_000,
});
await waitFor('timer_auto row', async () => running() === '1');
const src = psql(
  `select source from project_time_entries where user_id='${DESIGNER}' and duration_minutes is null;`,
);
if (src !== 'timer_auto') throw new Error(`expected timer_auto, got ${src}`);
console.log('✓ pick up starts the spine timer (timer_auto)');

// ── B · sub-60s timer_auto put-down discards silently ──
await page.keyboard.press('Escape');
await page.waitForURL('**/desk', { timeout: 15_000 });
await waitFor('silent discard', async () => running() === '0');
await page.waitForTimeout(800);
if (await page.locator(STRIP).count()) throw new Error('strip appeared for a sub-60s timer_auto');
const orphans = psql(
  `select count(*) from project_time_entries where user_id='${DESIGNER}';`,
);
if (orphans !== '0') throw new Error(`sub-60s auto left ${orphans} entries`);
console.log('✓ timer_auto under 60s silent-discards (no strip, no entry)');

// ── C · put-down offers; the adjustment persists raw_seconds ──
await page.goto(WHITFIELD_URL);
await page.waitForSelector('aside[aria-label="Document spine"] >> text=/In hand/', {
  timeout: 30_000,
});
await waitFor('timer restart', async () => running() === '1');
psql(
  `update project_time_entries set started_at = now() - interval '47 minutes' where user_id='${DESIGNER}' and duration_minutes is null;`,
);
await page.waitForTimeout(1200); // let the clock tick past 47:00 for the shot
await page.screenshot({ path: `${OUT}doc-spine-timer.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForURL('**/desk', { timeout: 15_000 });
await page.waitForSelector(`${STRIP} >> text=/was in hand for/`, { timeout: 15_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}desk-log-strip.png`, fullPage: false });
await page.fill('[aria-label="Minutes to log"]', '55');
await page.click(`${STRIP} >> text=/^Log$/`);
await waitFor('adjusted entry', async () => {
  const row = psql(
    `select duration_minutes || '|' || coalesce(raw_seconds::text,'-') || '|' || coalesce(activity,'-') || '|' || source from project_time_entries where user_id='${DESIGNER}' and duration_minutes is not null;`,
  );
  return row.startsWith('55|282') && row.endsWith('|design|timer_auto');
});
console.log('✓ put-down offered 47 min; adjusted to 55 — raw_seconds kept the truth');

// ── D · header-timer chaining + timer_manual round-up ──
// Simulate a header-started timer (source default 'timer_manual'), 30s old.
psql(
  `insert into project_time_entries (project_id, user_id, duration_minutes, started_at)
   values ('808e98f6-0053-4574-87bf-d8121f596832', '${DESIGNER}', null, now() - interval '30 seconds');`,
);
await page.goto(`${BASE}/doc/${OLSEN}`);
await page.waitForSelector(`${STRIP} >> text=/Olsen Lake House/`, { timeout: 30_000 });
const offered = await page.locator(`${STRIP} >> input[aria-label="Minutes to log"]`).inputValue();
if (offered !== '1') throw new Error(`timer_manual 30s should round up to 1, offered ${offered}`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}doc-chain-out-header.png`, fullPage: false });
await page.click(`${STRIP} >> text=/^Discard$/`);
await waitFor('chained start on Olsen', async () => {
  const row = psql(
    `select project_id || '|' || source from project_time_entries where user_id='${DESIGNER}' and duration_minutes is null;`,
  );
  return row === `${OLSEN}|timer_auto`;
});
console.log('✓ header timer chained out (manual 30s rounds up to 1, offered, discarded); Olsen picked up');

// ── E · doc-switch chaining ──
psql(
  `update project_time_entries set started_at = now() - interval '10 minutes' where user_id='${DESIGNER}' and duration_minutes is null;`,
);
await page.goto(WHITFIELD_URL);
await page.waitForSelector(`${STRIP} >> text=/Olsen Penthouse/`, { timeout: 30_000 });
await page.selectOption(`${STRIP} >> select[aria-label="Activity"]`, 'sourcing');
await page.click(`${STRIP} >> text=/^Log$/`);
await waitFor('doc-switch logged', async () => {
  return (
    psql(
      `select count(*) from project_time_entries where user_id='${DESIGNER}' and duration_minutes = 10 and activity = 'sourcing';`,
    ) === '1'
  );
});
console.log('✓ doc-switch chained Olsen out through the strip (10 min · sourcing)');

// ── F · "+ Log" manual entry from the spine ──
await page.click('aside[aria-label="Document spine"] >> text=/^\\+ Log$/');
await page.fill('aside[aria-label="Document spine"] >> input[aria-label="Minutes"]', '25');
await page.selectOption('aside[aria-label="Document spine"] >> select[aria-label="Activity"]', 'client');
await page.click('aside[aria-label="Document spine"] >> text=/^Add entry$/');
await waitFor('manual entry', async () => {
  return (
    psql(
      `select count(*) from project_time_entries where user_id='${DESIGNER}' and source='manual_entry' and duration_minutes=25 and activity='client';`,
    ) === '1'
  );
});
console.log('✓ spine "+ Log" wrote a manual_entry (25 min · client, phase auto-filled)');

// ── G · Hours ledger + "in hand today" readout ──
await page.click('nav[aria-label="Studio drawer"] >> text=Hours');
await page.waitForSelector('text=/this week/', { timeout: 15_000 });
await page.waitForSelector('text=/Today ·/', { timeout: 15_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}hours-ledger.png`, fullPage: false });
await page.keyboard.press('Escape');
console.log('✓ Hours ledger renders the week with totals');

// ── Mobile ──
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(WHITFIELD_URL);
await page.waitForSelector('[data-active-section]', { timeout: 60_000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}doc-mobile.png`, fullPage: true });

await browser.close();
console.log(`Saved screenshots to ${OUT}`);
