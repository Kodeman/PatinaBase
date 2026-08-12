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

test('section stage line reflows at 320px without horizontal overflow', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/doc/${SEEDED_PROJECT_ID}`, {
    waitUntil: 'domcontentloaded',
  });

  const workflow = page.locator('[data-workflow-document]');
  // The default 5s expect timeout is shorter than a Next dev cold-compile of
  // the /doc route, so this fails on "Picking up…" whenever the suite runs
  // alongside other Document specs and the dev server is under load (the same
  // reason playwright.config.ts lifts the per-test timeout to 60s). The reflow
  // assertions below are unchanged — this only waits long enough to make them.
  await expect(workflow).toBeVisible({ timeout: 30_000 });
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
