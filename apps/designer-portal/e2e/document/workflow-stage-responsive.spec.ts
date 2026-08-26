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

test('the project document holds its measure at 320px', async ({
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
  // Gate on the shell, which always paints.
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });

  // The stage line is asserted as MOUNTED and nothing more, and the test is
  // named for what it actually holds. The seeded project's phases carry no
  // `canonical_stage_key` and no `workflow_track`, so every active phase is
  // unclassified: `deriveSectionStageLine` returns a model with no sub-label,
  // no track bands and no provenance (R113 — an unclassified band is not an
  // error), and `SectionStageLine` renders a <section> whose only child is an
  // sr-only <h3>. A 0×0 box makes every measurement of it trivially true, so
  // measuring it here would pin a fact about the seed, not about reflow —
  // proving the stage line's own reflow needs a seeded classified phase, which
  // this fixture does not have.
  await expect(page.locator('[data-workflow-document]')).toBeAttached({
    timeout: 30_000,
  });
  await expectNoHorizontalOverflow(page);
});
