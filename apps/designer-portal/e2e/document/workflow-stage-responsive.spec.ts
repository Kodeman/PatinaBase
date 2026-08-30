import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { settle } from '../helpers/lens';
import { PRE_WORK_ID } from './lens-fixtures';

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

// W5-L2 — the pre-work spreads (OD-2) get the same responsive proof the
// project document already has: at every desktop/tablet/mobile tier the
// spread's own regions mount in the index's order, each with a head, and the
// rail prints the same stops the paper does. `…d6` (a sent, unopened
// proposal with no project behind it) is the seed's only fixed-id pre-work
// paper, so every case below reads its proposal spread — the order OD-2
// states for it is `proposal → scope → vision → investment → record`
// (re-parented under W5-R2 item 1).
const PROPOSAL_SPREAD_ORDER = ['proposal', 'scope', 'vision', 'investment', 'record'];
/** `DOCUMENT_INDEX_LABELS` (`document-index.ts`), restated — e2e cannot
 *  import the app's TS module (the same rule `lens-density.spec.ts` states
 *  for `LENS_LOOKAHEAD_PX`). Read by the mobile Sections sheet's own rows,
 *  which print the label, never the key. */
const PROPOSAL_SPREAD_LABELS = [
  'The proposal',
  'Scope & engagement',
  'Design vision',
  'The investment',
  'The record',
];

const TIERS = [
  { label: '1440 (full)', width: 1440, height: 900 },
  { label: '1280 (narrow)', width: 1280, height: 900 },
  { label: '390 (mobile)', width: 390, height: 844 },
] as const;

for (const tier of TIERS) {
  test(`the pre-work proposal spread (…d6) mounts its regions in order, each with a head, at ${tier.label}`, async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.goto(`/doc/${PRE_WORK_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    // The paper's own regions, scoped to `[data-document-paper]` — the same
    // attribute name is reused by the rail's ladder rows, so an unscoped
    // query would double-count (the C2 defect this file deliberately avoids).
    const paperKeys = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-document-paper] [data-index-region]'),
      ).map((el) => el.getAttribute('data-index-region')),
    );
    expect(paperKeys).toEqual(PROPOSAL_SPREAD_ORDER);

    for (const key of PROPOSAL_SPREAD_ORDER) {
      const head = page.locator(
        `[data-document-paper] [data-index-region="${key}"] [data-region-head]`,
      );
      await expect(head, `"${key}" has no [data-region-head]`).toHaveCount(1);
    }

    await expectNoHorizontalOverflow(page);
  });

  test(`the rail prints the same stops, in the same order, at ${tier.label}`, async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: tier.width, height: tier.height });
    await page.goto(`/doc/${PRE_WORK_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    if (tier.width < 1180) {
      // Below 1180 the rail lives in the mobile Sections sheet
      // (`mobile-sheets.tsx`'s `spine` kind, `paperRegionsForSection` under
      // the same names, no `[data-lens-ladder]`/`[data-index-region]` of its
      // own) rather than `LensLadder` — read its row labels instead.
      await page.getByRole('button', { name: /Open sections/ }).click();
      const dialog = page.getByRole('dialog', {
        name: 'Sections of this document',
      });
      await expect(dialog).toBeVisible();
      const rowLabels = await dialog
        .locator('ul li button > span:first-child')
        .allTextContents();
      expect(rowLabels.map((t) => t.trim())).toEqual(PROPOSAL_SPREAD_LABELS);
      return;
    }

    const railKeys = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('[data-lens-ladder] [data-index-region]'),
      ).map((el) => el.getAttribute('data-index-region')),
    );
    expect(railKeys).toEqual(PROPOSAL_SPREAD_ORDER);
  });
}
