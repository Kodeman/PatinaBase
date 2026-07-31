import { test, expect, type AuthenticatedPage } from '../fixtures/auth';

const SENT_PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';

test.describe.configure({ mode: 'serial' });

async function openDocument(page: AuthenticatedPage, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('[data-document-shell]')).toBeVisible();
}

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

test.describe('Quiet Work responsive document shell', () => {
  test('1024px protects one paper canvas and one mobile edge', async ({
    authenticatedPage: page,
  }) => {
    await openDocument(page, 1024);

    await expect(page.getByTestId('mobile-bar')).toBeVisible();
    await expect(page.locator('[data-mobile-edge-owner]')).toHaveCount(1);
    await expect(page.locator('[data-document-spine]')).toBeHidden();
    await expect(page.locator('[data-margin-trigger]')).toBeHidden();
    await expect(page.locator('[data-margin-panel]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('1280px uses the compact spine and an on-demand margin', async ({
    authenticatedPage: page,
  }) => {
    await openDocument(page, 1280);

    await expect(page.getByTestId('mobile-bar')).toBeHidden();
    const spine = page.locator('[data-document-spine]');
    await expect(spine).toBeVisible();
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(55);
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 1000)
      .toBeLessThanOrEqual(57);

    const trigger = page.locator('[data-margin-trigger]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const margin = page.locator('[data-margin-panel]');
    await expect(margin).toHaveAttribute('role', 'dialog');
    await expect(margin).toHaveAttribute('data-margin-mode', 'sheet');
    await expect(page.locator('[data-margin-close]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(margin).toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });

  test('1440px restores the full labelled spine and settled margin rail', async ({
    authenticatedPage: page,
  }) => {
    await openDocument(page, 1440);

    await expect(page.getByTestId('mobile-bar')).toBeHidden();
    const spine = page.locator('[data-document-spine]');
    await expect(spine).toBeVisible();
    await expect
      .poll(async () => (await spine.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(199);
    await expect(page.locator('[data-margin-trigger]')).toBeHidden();
    const margin = page.locator('[data-margin-panel]');
    await expect(margin).toBeVisible();
    await expect(margin).toHaveAttribute('data-margin-mode', 'rail');
    await expect(margin).toHaveAttribute('aria-hidden', 'false');
    await expectNoHorizontalOverflow(page);
  });
});
