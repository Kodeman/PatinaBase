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

  // The default 5s expect timeout is shorter than a Next dev cold-compile of
  // the /doc route, so waiting on paint fails on "Picking up…" whenever the
  // suite runs alongside other Document specs and the dev server is under load
  // (the same reason playwright.config.ts lifts the per-test timeout to 60s).
  // Gate on the shell, which always paints, rather than on a region that may
  // legitimately have nothing to say.
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });

  const workflow = page.locator('[data-workflow-document]');
  // Attached, not visible. The seeded project's phases carry no
  // `canonical_stage_key` and no `workflow_track`, so every active phase is
  // unclassified: `deriveSectionStageLine` returns a model with no sub-label,
  // no track bands and no provenance (R113 — an unclassified band is not an
  // error), and `SectionStageLine` renders a <section> whose only child is an
  // sr-only <h3>. That box is zero-height, which Playwright reports as hidden.
  // Demanding visibility here would assert a fact about the seed, not about
  // the reflow this test is named for.
  await expect(workflow).toBeAttached({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const bounds = await workflow.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      // An empty line measures 0 by 0 — trivially true, and the page-level
      // assertion below is what actually holds the line at 320px either way.
      return bounds.scrollWidth <= bounds.clientWidth;
    })
    .toBe(true);
  await expectNoHorizontalOverflow(page);
});
