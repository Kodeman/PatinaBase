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
  test('keeps drafting bulk actions above persistent bottom chrome', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/drafting/${SENT_PROPOSAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    const ffeFacet = page.getByRole('button', { name: /^FF&E / });
    await expect(async () => {
      if ((await ffeFacet.getAttribute('aria-expanded')) !== 'true') {
        await ffeFacet.click();
      }
      await expect(ffeFacet).toHaveAttribute('aria-expanded', 'true', {
        timeout: 1_000,
      });
    }).toPass({ timeout: 10_000 });

    const firstScheduleItem = page
      .getByRole('checkbox', { name: /^Select / })
      .first();
    await expect(firstScheduleItem).toBeVisible();
    await firstScheduleItem.check();

    const bulkActions = page.getByRole('region', { name: 'Bulk actions' });
    const studioDrawer = page.getByRole('navigation', {
      name: 'Studio drawer',
    });
    await expect(bulkActions).toBeVisible();
    await expect(studioDrawer).toBeVisible();
    await expect
      .poll(async () => {
        const [bulkBox, drawerBox] = await Promise.all([
          bulkActions.boundingBox(),
          studioDrawer.boundingBox(),
        ]);
        return !!bulkBox && !!drawerBox
          ? bulkBox.y + bulkBox.height <= drawerBox.y
          : false;
      })
      .toBe(true);

    await page.setViewportSize({ width: 1024, height: 900 });
    const mobileBar = page.getByTestId('mobile-bar');
    await expect(mobileBar).toBeVisible();
    await expect(studioDrawer).toBeHidden();
    await expect
      .poll(async () => {
        const [bulkBox, mobileBox] = await Promise.all([
          bulkActions.boundingBox(),
          mobileBar.boundingBox(),
        ]);
        return !!bulkBox && !!mobileBox
          ? bulkBox.y + bulkBox.height <= mobileBox.y &&
              bulkBox.x >= 15 &&
              bulkBox.x + bulkBox.width <= 1009
          : false;
      })
      .toBe(true);
  });

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
