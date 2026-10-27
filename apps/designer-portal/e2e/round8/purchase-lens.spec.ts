import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';

/**
 * WP-04 C06 — the Purchase lens (ruling 2026-10-27). Under round 8 the
 * unfolded FF&E sheet carries `purchase` as its sixth lens, on its URL
 * contract; the legacy `/doc/[id]/pieces` sheet keeps five lenses and reads
 * `lens=purchase` as its default lens. Read-only: this spec writes nothing.
 */

// F01's full-service job and its living room (f01-fixture.sql).
const JOB = 'f0180000-0000-4000-8000-000000000010';
const LIVING = 'f0180000-0000-4000-8000-000000000011';

const LEGACY_LENSES = [
  'Preliminary selections',
  'Specifications',
  'Pricing',
  'Purchasing authorization',
  'Finish schedule',
];

async function go(page: Page, path: string) {
  // Leave the dev server's page first so no HMR client reloads the tab while
  // the route compiles (paper-frame.spec.ts).
  await page.goto('about:blank');
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
}

function lensBand(page: Page) {
  return page.getByTestId('build-room').getByRole('group', { name: 'Schedule view' }).getByRole('button');
}

test.describe('Purchase lens', () => {
  test('round 8: a lens=purchase address unfolds the Purchasing schedule as the sixth lens', async ({ authenticatedPage: page }) => {
    test.setTimeout(240_000);
    await go(page, `/doc/${JOB}?unfold=pieces&lens=purchase&room=${LIVING}`);
    await expect(page.locator('[data-document-shell][data-arrival-ready]')).toHaveCount(1, { timeout: 60_000 });
    const sheet = page.getByTestId('build-room');
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-paper-renderer="round8"] [data-testid="build-room"]')).toHaveCount(1);

    await expect(lensBand(page)).toHaveText([...LEGACY_LENSES, 'Purchasing']);
    await expect(lensBand(page).last()).toHaveAttribute('aria-pressed', 'true');
    const lens = sheet.getByTestId('purchase-lens');
    await expect(lens).toBeVisible({ timeout: 60_000 });
    await expect(lens.getByRole('table', { name: 'Purchasing' })).toBeVisible();
    await expect(lens.getByRole('region', { name: 'Bought already' })).toBeVisible();
    // Draft-first (V22): no send or order act lives on this lens.
    await expect(lens.getByRole('button', { name: /send|prepare|release/i })).toHaveCount(0);

    // A lens change re-addresses the unfold in place (replaceState,
    // unfold-instrument.tsx `navigate`): no new history entry, so Back leaves
    // the sheet rather than returning to Purchasing.
    const depth = await page.evaluate(() => window.history.length);
    await lensBand(page).filter({ hasText: /^Pricing$/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('lens')).toBe('price');
    expect(await page.evaluate(() => window.history.length)).toBe(depth);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('lens')).not.toBe('purchase');
    await expect(page.getByTestId('purchase-lens')).toHaveCount(0);
  });

  test('legacy route: lens=purchase reads as the default lens, with no sixth tab @renderer-off', async ({ authenticatedPage: page }) => {
    test.setTimeout(240_000);
    await go(page, `/doc/${JOB}/pieces?lens=purchase&room=${LIVING}`);
    const sheet = page.getByTestId('build-room');
    await expect(sheet).toBeVisible({ timeout: 60_000 });
    await expect(lensBand(page)).toHaveText(LEGACY_LENSES);
    await expect(lensBand(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('purchase-lens')).toHaveCount(0);
  });
});
