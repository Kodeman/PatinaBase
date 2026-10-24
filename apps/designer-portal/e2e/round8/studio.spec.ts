import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlScalar } from '../helpers/psql';

// WP-01.8 — the round-8 studio on the F01 fixture (f01-fixture.sql), under
// playwright.round8.config.ts's designer-paper-round8 pin. The renderer-off
// path (legacy Desk only) is the desk page's unit test and the default config.
const JOB = 'f0180000-0000-4000-8000-000000000010';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function openStudio(page: Page) {
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });
  const studio = page.locator('[data-studio="round8"]');
  // The first next dev compile of /desk and its round-8 chunk is slow.
  await expect(studio, 'the round-8 studio stands on /desk').toBeVisible({ timeout: 60_000 });
  // The flag override also renders on the server; visible doors can precede
  // hydration and the drawer's listener. Use the Desk's settled read contract.
  await expect(studio, 'the studio has hydrated and settled its reads').toHaveAttribute('data-arrival-ready', '', {
    timeout: 60_000,
  });
  await expect(page.locator('html'), 'arrival has returned interaction to the studio').not.toHaveClass(
    /\barr-(?:pre|on|press)\b/,
    { timeout: 30_000 },
  );
  return studio;
}

test.describe('F01 round-8 studio', () => {
  test.setTimeout(180_000);

  test('mounts the round-8 studio and never the legacy Desk beside it', async ({ authenticatedPage: page }) => {
    const studio = await openStudio(page);
    await expect(studio).toHaveAttribute('data-paper-renderer', 'round8');
    await expect(page.locator('[data-studio-masthead]')).toBeVisible();
    await expect(page.locator('[data-studio-register]')).toBeVisible({ timeout: 30_000 });
    // Legacy Desk markers: its roster, its head and find regions, its day sheet.
    await expect(page.locator('[data-testid="desk-roster"]')).toHaveCount(0);
    await expect(page.locator('[data-action-region="desk-head"]')).toHaveCount(0);
    await expect(page.locator('[data-action-region="desk-find"]')).toHaveCount(0);
    await expect(page.locator('[data-day-sheet-line]')).toHaveCount(0);
    await expect(page.locator('[data-desk-renderer-pending]')).toHaveCount(0);
    await expect(page.locator('main')).toHaveCount(1);
  });

  test('masthead doors open the existing rooms and ledgers', async ({ authenticatedPage: page }) => {
    // Compact widths use the existing mobile More / command access instead.
    await page.setViewportSize({ width: 1440, height: 900 });
    const masthead = page.getByRole('navigation', { name: 'Studio', exact: true });
    const door = (key: string) => page.locator(`[data-studio-door="${key}"]`);

    for (const [key, path] of [
      ['library', '/library'],
      ['people', '/people'],
      ['rooms', '/rooms'],
    ] as const) {
      await openStudio(page);
      await expect(masthead).toBeVisible();
      await door(key).click();
      await expect(page, `${key} door walks into its room`).toHaveURL(new RegExp(`${path}(\\?|$)`), {
        timeout: 60_000,
      });
    }

    for (const [key, sheet] of [
      ['accounts', 'Studio accounts'],
      ['the-post', 'Studio inbox'],
    ] as const) {
      await openStudio(page);
      await door(key).click();
      await expect(
        page.getByRole('dialog', { name: sheet, exact: true }),
        `${key} door opens its ledger sheet over the studio`,
      ).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/desk(\?|$)/);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: sheet, exact: true })).toHaveCount(0);
    }
  });

  test('an attention item opens the F01 job, and Back restores the studio place and focus', async ({
    authenticatedPage: page,
  }) => {
    const name = psqlScalar(`SELECT name FROM public.projects WHERE id = '${JOB}';`);
    expect(name, 'F01 job exists').toBeTruthy();

    // A short window so the studio has room to scroll above the attention list.
    await page.setViewportSize({ width: 1440, height: 560 });
    await openStudio(page);
    const item = page
      .locator('[data-studio-attention-item]')
      .getByRole('link', { name: new RegExp(`^${escapeRegExp(name)} — `) })
      .first();
    await expect(item, "F01's due task is on the attention list").toBeVisible({ timeout: 30_000 });
    await expect(item).toHaveAttribute('href', new RegExp(`^/doc/${JOB}(\\?|$)`));
    const anchorId = await item.getAttribute('id');
    expect(anchorId, 'the attention item names itself for the way back').toMatch(/^studio-attention-/);

    await item.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.min(window.scrollY + 120, room), behavior: 'auto' });
      return window.scrollY;
    });
    expect(y, 'the studio is scrolled before leaving').toBeGreaterThan(0);
    await expect(item).toBeInViewport();

    await Promise.all([
      page.waitForRequest((request) => request.url().includes(`/doc/${JOB}`), { timeout: 60_000 }),
      item.click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`/doc/${JOB}`), { timeout: 60_000 });
    await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 60_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/desk(\?|$)/, { timeout: 30_000 });
    await expect(page.locator('[data-studio="round8"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(`[id="${anchorId}"]`), 'Back returns focus to the item she pressed').toBeFocused({
      timeout: 30_000,
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { message: 'Back restores the studio offset', timeout: 15_000 })
      .toBeGreaterThanOrEqual(y - 2);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(y + 2);
  });
});
