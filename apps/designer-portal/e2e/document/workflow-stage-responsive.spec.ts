import { test, expect, type AuthenticatedPage } from '../fixtures/auth';

const SEEDED_PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';

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

test('workflow document reflows at 320px without horizontal overflow', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/doc/${SEEDED_PROJECT_ID}`, {
    waitUntil: 'domcontentloaded',
  });

  const workflow = page.locator('[data-workflow-document]');
  await expect(workflow).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await workflow.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      return bounds.scrollWidth <= bounds.clientWidth;
    })
    .toBe(true);
  await expectNoHorizontalOverflow(page);
});
