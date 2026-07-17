import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Back of House · Exception Desk & Settlement (S7, spec §5.5/§8) — the S7
// accepts-when as UI tests. Chromium-only (--project=chromium). SERIAL: shares
// the seeded S7 fixtures (a damage exception on Brooks, a settle-ready delivered
// PO on Calloway) and mutates state (opens/resolves its own exceptions).
//
// Requires the seeded local stack: `supabase db reset` → functions serve →
// `pnpm seed:fulfillment` → `psql -f scripts/seed-fulfillment-fixtures.sql` →
// `psql -f scripts/seed-fulfillment-exceptions.sql`, and
// NEXT_PUBLIC_ENABLE_FULFILLMENT=true in apps/admin-portal/.env.local.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

const ADMIN_EMAIL = 'admin@patina.dev';
const ADMIN_PASSWORD = 'password123';

async function signInAsAdmin(page: Page) {
  await page.goto('/auth/signin');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('button:has-text("Sign in with email")').first().click();
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/auth/signin'), { timeout: 20000 });
}

test.beforeEach(async ({ page }) => {
  await signInAsAdmin(page);
});

test('the exception desk lists case files, clock-dominant', async ({ page }) => {
  await page.goto('/fulfillment/exceptions');
  await expect(page.getByTestId('exceptions-list')).toBeVisible({ timeout: 15000 });
  const rows = page.getByTestId('exception-row');
  await expect(rows.first()).toBeVisible();
  // the seeded damage (Brooks) and substitution (pending Leah) are present
  await expect(page.getByTestId('exceptions-list')).toContainText('Damage');
  await expect(page.getByTestId('exceptions-list')).toContainText('Substitution');
});

test('a damage case file shows the clock, evidence, and the ledger consequence in mono BEFORE commit', async ({ page }) => {
  await page.goto('/fulfillment/exceptions');
  await expect(page.getByTestId('exceptions-list')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="exception-row"]', { hasText: 'Damage' }).first().click();

  await expect(page.getByTestId('case-file')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('exception-clock-hero')).toBeVisible();
  await expect(page.getByTestId('evidence-grid')).toBeVisible();
  await expect(page.getByTestId('resolution-paths')).toBeVisible();

  // select a damage path + enter an amount → the mono consequence renders, with
  // real Dr/Cr postings, BEFORE any commit
  await page.getByTestId('respath-damage_client_credit').click();
  await page.getByTestId('respath-amount').fill('340');
  const mono = page.getByTestId('mono-consequence');
  await expect(mono).toBeVisible();
  await expect(mono).toContainText('Ledger consequence · before commit');
  await expect(mono).toContainText('Dr');
  await expect(mono).toContainText('Cr');
  // did NOT commit — the exception is still open (preserved for the screenshot)
  await expect(page.getByTestId('case-file')).toHaveAttribute('data-status', 'open');
});

test('the queue `x` key opens exception creation, and a damage path resolves', async ({ page }) => {
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });

  // `x` opens the create drawer on the selected row
  await page.keyboard.press('x');
  await expect(page.getByTestId('open-exception-drawer')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('open-exception-type-damage').click();
  await page.getByTestId('open-exception-submit').click();

  // lands on the new case file
  await page.waitForURL((u) => /\/fulfillment\/exceptions\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 15000 });
  await expect(page.getByTestId('case-file')).toBeVisible();

  // resolve via the vendor-claim path: amount → mono preview → cause code → commit
  await page.getByTestId('respath-damage_vendor_claim').click();
  await page.getByTestId('respath-amount').fill('500');
  await expect(page.getByTestId('mono-consequence')).toContainText('Dr');
  await page.getByTestId('respath-cause-code').selectOption('concealed_damage');
  await Promise.all([
    page.waitForURL((u) => u.pathname === '/fulfillment/exceptions', { timeout: 15000 }),
    page.getByTestId('respath-commit').click(),
  ]);
  await expect(page.getByTestId('exceptions-list')).toBeVisible();
});

test('settlement: $34 auto-accepts; a beyond-tolerance variance demands a typed reason', async ({ page }) => {
  // reach the delivered PO composer via the Calloway order workbench
  await page.goto('/fulfillment');
  await expect(page.getByTestId('queue-bands')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-testid="queue-row"]', { hasText: 'Calloway' }).first().click();
  await expect(page.getByTestId('workbench-root')).toBeVisible({ timeout: 15000 });
  await page.locator('a[href*="/fulfillment/pos/"]').first().click();
  await expect(page.getByTestId('composer-root')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('composer-settle-open').click();
  await expect(page.getByTestId('settle-dialog')).toBeVisible();

  // the dialog seeds the invoice to the PO value (variance $0). Read it, add $34.
  const invoice = page.getByTestId('settle-invoice');
  await expect(async () => {
    const v = await invoice.inputValue();
    expect(Number(v)).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });
  const base = Number(await invoice.inputValue());
  await invoice.fill((base + 34).toFixed(2));

  // in tolerance → auto-accept: variance shows, commit enabled, NO reason field
  await expect(page.getByTestId('settle-variance')).toContainText('+$34.00');
  await expect(page.getByTestId('settle-status')).toContainText('in tolerance');
  await expect(page.getByTestId('settle-reason-field')).toHaveCount(0);
  await expect(page.getByTestId('settle-commit')).toBeEnabled();

  // beyond tolerance → a typed reason is REQUIRED (commit disabled until entered)
  await invoice.fill((base + 5000).toFixed(2));
  await expect(page.getByTestId('settle-status')).toContainText('beyond tolerance');
  await expect(page.getByTestId('settle-reason-field')).toBeVisible();
  await expect(page.getByTestId('settle-commit')).toBeDisabled();
  await page.getByTestId('settle-reason').fill('vendor freight surcharge dispute');
  await expect(page.getByTestId('settle-commit')).toBeEnabled();
});
