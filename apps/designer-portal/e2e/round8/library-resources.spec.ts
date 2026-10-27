import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const DESIGNER = 'f0180000-0000-4000-8000-000000000002';
const PRODUCT_NAME = 'SQ-1992 fictional Library reference';

async function openLibrary(page: Page) {
  const studio = page.locator('[data-studio="round8"]');
  await expect(studio).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/);
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  const room = page.locator('[data-library-room]');
  await expect(room).toHaveAttribute('data-paper-renderer', 'round8', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
  // A focusable live filter proves the lazy body has committed and its handlers work.
  const all = room.getByRole('tab', { name: /^All shelves/ });
  // The override server-renders this room; retry the idempotent selection
  // until hydration owns the keyboard handler (visibility alone is too early).
  await expect(async () => {
    await all.focus();
    await all.press('ArrowRight');
    await expect(room.getByRole('tab', { name: /^Personal,/ })).toHaveAttribute('aria-selected', 'true');
  }).toPass({ timeout: 30_000 });
  return room;
}

test.describe('Round-8 Library resources', () => {
  test.setTimeout(180_000);

  test('editorial Library preserves live shelf, capture, reference, import and compose entrances', async ({ authenticatedPage: page }, testInfo) => {
    expect(psqlScalar(`SELECT count(*) FROM products WHERE owner_user_id='${DESIGNER}' AND name='${PRODUCT_NAME}';`)).toBe('0');
    try {
      const room = await openLibrary(page);
      await expect(room.locator('h1')).toHaveText('A library with a point of view.');
      await expect(room.locator('.r8-library-intro')).toContainText('Personal captures, not yet reviewed');
      await expect(room.locator('.r8-library-note')).toContainText('does not approve it, reserve stock or authorize a purchase');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(room.getByRole('searchbox', { name: 'Find a product or ask a sourcing question' })).toBeVisible();

      for (const layer of ['personal', 'studio', 'catalog', 'all']) {
        await room.locator(`[data-library-lens="${layer}"]`).click();
        await expect(room.locator(`[data-library-shelf="${layer}"]`)).toBeVisible();
      }
      const capability = room.getByRole('button', { name: 'Custom commissions', exact: true });
      await capability.click();
      await expect(capability).toHaveAttribute('aria-pressed', 'true');
      await room.getByRole('button', { name: 'All products', exact: true }).click();

      await page.getByRole('button', { name: /^(Capture|Capture a product)$/ }).click();
      const capture = page.getByRole('dialog', { name: 'Capture a product', exact: true });
      await expect(capture).toBeVisible();
      await capture.getByPlaceholder('e.g. Heirloom oak dining table').fill(PRODUCT_NAME);
      await capture.getByRole('button', { name: 'Save to personal library', exact: true }).click();
      await expect(capture).toHaveCount(0);
      await expect.poll(() => psqlScalar(`SELECT count(*) FROM products WHERE owner_user_id='${DESIGNER}' AND name='${PRODUCT_NAME}' AND layer='personal';`)).toBe('1');
      const productId = psqlScalar(`SELECT id FROM products WHERE owner_user_id='${DESIGNER}' AND name='${PRODUCT_NAME}';`);
      console.log('[Library capture readback]', productId, 'personal');
      const reference = room.getByRole('link', { name: `View reference: ${PRODUCT_NAME}`, exact: true });
      await expect(reference).toHaveAttribute('href', `/library/${productId}`);
      await expect(reference).toHaveClass(/r8-library-reference/);
      await reference.scrollIntoViewIfNeeded();
      await reference.focus();
      await expect(reference).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath('library-resources.png'), fullPage: true });
      await reference.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/library/${productId}$`), { timeout: 60_000 });
      await page.goBack();
      await expect(page.locator('[data-library-room]')).toBeVisible();

      await room.getByRole('button', { name: 'Add to library', exact: true }).click();
      await page.getByRole('button', { name: 'Import product list', exact: true }).click();
      const importer = page.getByRole('dialog', { name: 'Import to personal library', exact: true });
      await expect(importer).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(importer).toHaveCount(0);
      await room.getByRole('button', { name: 'Add to library', exact: true }).click();
      const compose = page.getByRole('button', { name: 'Create a product record', exact: true });
      await expect(compose).toBeFocused();
      await compose.press('Enter');
      await expect(page).toHaveURL(/\/compose$/, { timeout: 60_000 });
    } finally {
      // Only this actor's exact fictional capture; never touch another product.
      psqlRun(`DELETE FROM products WHERE owner_user_id='${DESIGNER}' AND name='${PRODUCT_NAME}' AND layer='personal';`);
      expect(psqlScalar(`SELECT count(*) FROM products WHERE owner_user_id='${DESIGNER}' AND name='${PRODUCT_NAME}';`)).toBe('0');
    }
  });
});
