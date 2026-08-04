/**
 * P1-6 — "Compare across a group" in the decision option builder.
 *
 * A configured piece linked to an option can fan out into sibling options, one
 * per ticked value of ONE option group. The siblings must derive their names,
 * prices and deltas from the maker's own numbers, and each must persist its own
 * `selection_snapshot` so the decision carries the same selection vocabulary the
 * picker and the spec book speak.
 *
 * Chromium-pinned + serial: publishes decisions as the single seeded designer.
 *
 * RUN THIS SUITE AS: `pnpm --filter @patina/designer-portal test:e2e:library`
 * — chromium-only, `--workers=1`. `playwright.config.ts` is `fullyParallel`, so a
 * plain `playwright test` puts these spec files in separate workers, racing one
 * local database as one designer. Serial-within-file does not cover that.
 */
import { test, expect } from '../fixtures/auth';
import {
  RESOLVED_SUPABASE_URL,
  authorVariantSchema,
  designerAndClientIds,
  getDecisionOptionsByTitle,
  seedProductIn,
  seedProjectIn,
  seedScope,
  stamp,
  teardownScope,
  trackDecision,
} from './fixtures';

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Single-actor walk — the seeded designer publishes decisions; parallel browsers race the same rows.',
);
test.describe.configure({ mode: 'serial' });

// Next dev compiles the document/spec-book routes on first hit, and whichever
// spec runs first pays that cost inside its own timeout. The shared 60s default
// is not enough for a cold server, so give these walks headroom.
test.beforeEach(() => test.setTimeout(120_000));

const RUN = stamp();
const CONFIGURABLE = `E2E Compare Bed ${RUN}`;

// Rows are recorded as they are created, so a half-finished beforeAll still
// tears down cleanly.
const scope = seedScope();
const TITLE = trackDecision(scope, `E2E compare across group ${RUN}`);

let projectId: string;

test.beforeAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`[library-configuration] service-role client resolved → ${RESOLVED_SUPABASE_URL}`);

  const { designerId, clientId } = designerAndClientIds();
  projectId = await seedProjectIn(scope, `E2E Compare ${RUN}`, designerId, clientId);
  const productId = await seedProductIn(scope, {
    name: CONFIGURABLE,
    ownerUserId: designerId,
  });
  authorVariantSchema(designerId, productId);
});

test.afterAll(() => teardownScope(scope));

test('generates priced sibling options across one group and persists each snapshot', async ({
  authenticatedPage: page,
}) => {
  await page.goto(`/doc/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '+ New open item' }).click();
  await page.getByPlaceholder('e.g. Which pendant for the entry?').fill(TITLE);

  // ── Link + configure the source option (Oak → resolved retail 305000c) ──
  await page.getByTestId('option-0-choose-product').click();
  const modal = page.getByTestId('product-picker-modal');
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder('Search your library and the catalog…').fill(CONFIGURABLE);
  await page
    .getByTestId('product-picker-result')
    .filter({ hasText: CONFIGURABLE })
    .click();

  const pane = page.getByTestId('picker-configure-step');
  await expect(pane).toBeVisible();
  await pane.getByText('Oak', { exact: true }).click();
  await expect(pane.getByRole('status')).toHaveText('Ready for a project');
  await page.getByRole('button', { name: 'Add configured piece' }).click();
  await expect(page.getByTestId('option-0-name')).toHaveValue(`${CONFIGURABLE} — Oak`);

  // ── Compare across the Material group ──
  await page.getByTestId('option-0-compare-group').click();
  const panel = page.getByTestId('option-0-compare-panel');
  await expect(panel).toBeVisible();

  // The option's OWN value starts ticked — it is the thing being compared
  // against. Leave it ticked and add the two alternatives; checkbox inputs sit
  // under their label text, so click the label as a designer does.
  await expect(panel.getByRole('checkbox', { name: 'Oak' })).toBeChecked();
  await panel.getByText('Walnut', { exact: true }).click();
  await panel.getByText('Boucle', { exact: true }).click();
  await expect(panel.getByRole('checkbox', { name: 'Oak' })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: 'Walnut' })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: 'Boucle' })).toBeChecked();

  await panel.getByTestId('option-0-compare-generate').click();

  // Oak is ticked but NOT regenerated — the source card already is Oak. Two new
  // siblings land immediately after it, in the maker's value order, anchored to
  // Oak: price = 305000 + valueDelta − oakDelta(−15000) → Walnut 3200, Boucle
  // 3450. Those are exactly the maker's own resolved variant prices.
  await expect(page.getByTestId('option-1-name')).toHaveValue(`${CONFIGURABLE} — Walnut`);
  await expect(page.getByTestId('option-1-price')).toHaveValue('3200');
  await expect(page.getByTestId('option-2-name')).toHaveValue(`${CONFIGURABLE} — Boucle`);
  await expect(page.getByTestId('option-2-price')).toHaveValue('3450');
  // No third sibling: option 3 is still the composer's own pristine second
  // option (library-first CTA, no fields), not a regenerated Oak.
  await expect(page.getByTestId('option-3-choose-product')).toBeVisible();
  await expect(page.getByTestId('option-3-name')).toHaveCount(0);
  // Deltas are RETAIL — the movement in the price beside them, never trade.
  // Boucle: 25000 − (−15000) = +$400.
  await expect(page.getByTestId('option-2-cost-delta')).toHaveValue('+400');
  await expect(page.getByTestId('option-1-cost-delta')).toHaveValue('+150');

  await page.locator('[data-action-key="publish-coordination-item"]').click();

  // Every persisted option carries its OWN selection snapshot in the shared
  // vocabulary — that is what makes the decision feed the spec later.
  await expect
    .poll(
      async () => {
        const options = await getDecisionOptionsByTitle(TITLE);
        if (options.length === 0) return null;
        return options
          .map((o) => ({
            name: o.name,
            labels: (o.selection_snapshot as Array<{ valueLabel?: string }> | null)?.map(
              (s) => s.valueLabel,
            ),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      { timeout: 20_000, message: 'sibling options persisted with selection snapshots' },
    )
    .toEqual([
      { name: `${CONFIGURABLE} — Boucle`, labels: ['Boucle'] },
      { name: `${CONFIGURABLE} — Oak`, labels: ['Oak'] },
      { name: `${CONFIGURABLE} — Walnut`, labels: ['Walnut'] },
    ]);
});
