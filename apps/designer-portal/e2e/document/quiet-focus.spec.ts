import { test, expect, type AuthenticatedPage } from '../fixtures/auth';

const SENT_PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';

async function expectNoHorizontalOverflow(page: AuthenticatedPage) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe('Quiet Work focused rooms', () => {
  test('Library keeps one omnibox, one shelf, and one secondary add entrance', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/library', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-library-omnibox]')).toHaveCount(1);
    await expect(page.locator('[data-library-lens]')).toHaveCount(3);
    await expect(page.locator('[data-library-shelf]')).toHaveCount(1);
    await expect(page.locator('[data-library-shelf]')).toHaveAttribute(
      'data-library-shelf',
      'personal',
    );

    await page.getByRole('tab', { name: /Studio/ }).click();
    await expect(page.locator('[data-library-shelf]')).toHaveAttribute(
      'data-library-shelf',
      'studio',
    );

    const add = page.locator('[data-library-add-trigger]');
    await add.click();
    const options = page.locator('[data-library-add-options]');
    await expect(options).toBeVisible();
    await expect(options.getByRole('button', { name: 'Compose a piece' })).toBeVisible();
    await expect(options.getByRole('button', { name: 'Import a list' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(options).toBeHidden();
    await expect(add).toBeFocused();

    await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });

  test('Drafting keeps one facet in hand and stages client copy by width', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/drafting/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect
      .poll(() => page.locator('button[aria-expanded="true"]:visible').count())
      .toBeGreaterThanOrEqual(1);
    const payments = page.getByRole('button', { name: /Payments/i }).first();
    await payments.click();
    await expect(payments).toHaveAttribute('aria-expanded', 'true');

    const preview = page.getByRole('button', {
      name: 'Preview client copy',
    });
    await expect(preview).toBeVisible();
    await preview.click();
    const dialog = page.getByRole('dialog', { name: 'Client copy preview' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(preview).toBeFocused();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(preview).toBeHidden();
    await expect(page.getByText("The client's copy · live")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
