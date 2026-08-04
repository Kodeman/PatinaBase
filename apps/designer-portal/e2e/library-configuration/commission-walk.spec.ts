/**
 * P1-4/custom mode — the commission branch of the picker's configure step.
 *
 * ── SCOPE, AND WHY IT STOPS WHERE IT DOES ──────────────────────────────────
 * A custom-commission piece is never specified inside the picker: scope, revisions
 * and pricing belong to the piece room, so the picker shows an interstitial
 * instead of the configuration workspace. THAT branch is what this spec drives,
 * because it is the part reachable from a seeded product alone.
 *
 * The deeper leg — "Start commission" → draft revision 1 → submitted → quoted →
 * client_review → approved → issued — is NOT driven here. It is not a selector
 * problem: the commission workspace hangs off a SAVED `product_configurations`
 * row, which only exists after a real project placement (project → room → FF&E
 * line → piece room placement), and `save_product_configuration` writes the
 * configuration columns on `project_ffe_specs` through the gated
 * `patina.configuration_spec_workflow` context. Standing that chain up through
 * the UI is several minutes of walking per run and would make this spec the
 * slowest and most brittle in the suite for coverage that already exists.
 *
 * COMPENSATING COVERAGE: the full revision lifecycle is asserted at the SQL
 * layer in `supabase/tests/library/product_configuration_test.sql` — 48
 * assertions across `create_custom_commission_revision`,
 * `transition_custom_commission_revision` (incl. the rejected price-free quote,
 * the premature-approval rejection, and the issued terminal state),
 * `record_custom_commission_milestone`, and revision forking/superseding. That
 * file now runs from the repo root as `pnpm test:library-config`.
 *
 * Chromium-pinned + serial, as with the sibling specs.
 *
 * RUN THIS SUITE AS: `pnpm --filter @patina/designer-portal test:e2e:library`
 * — chromium-only, `--workers=1`. `playwright.config.ts` is `fullyParallel`, so a
 * plain `playwright test` puts these spec files in separate workers, racing one
 * local database as one designer. Serial-within-file does not cover that.
 */
import { test, expect } from '../fixtures/auth';
import {
  RESOLVED_SUPABASE_URL,
  authorCustomSchema,
  designerAndClientIds,
  seedProductIn,
  seedProjectIn,
  seedScope,
  stamp,
  teardownScope,
  trackDecision,
} from './fixtures';

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Single-actor walk — parallel browsers race the same seeded designer.',
);
test.describe.configure({ mode: 'serial' });

// Next dev compiles the document/spec-book routes on first hit, and whichever
// spec runs first pays that cost inside its own timeout. The shared 60s default
// is not enough for a cold server, so give these walks headroom.
test.beforeEach(() => test.setTimeout(120_000));

const RUN = stamp();
const CUSTOM = `E2E Commission Table ${RUN}`;

// Rows are recorded as they are created, so a half-finished beforeAll still
// tears down cleanly. The composer is never published here, so the title is
// tracked only belt-and-braces — deleting a title that never landed is a no-op.
const scope = seedScope();
const TITLE = trackDecision(scope, `E2E commission pick ${RUN}`);

let projectId: string;

test.beforeAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`[library-configuration] service-role client resolved → ${RESOLVED_SUPABASE_URL}`);

  const { designerId, clientId } = designerAndClientIds();
  projectId = await seedProjectIn(scope, `E2E Commission ${RUN}`, designerId, clientId);
  const productId = await seedProductIn(scope, { name: CUSTOM, ownerUserId: designerId });
  // 'custom' mode carries no option groups or variants by construction.
  authorCustomSchema(designerId, productId);
});

test.afterAll(() => teardownScope(scope));

test('a custom piece offers the piece-room interstitial instead of a configuration pane', async ({
  authenticatedPage: page,
}) => {
  await page.goto(`/doc/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '+ New open item' }).click();
  await page.getByPlaceholder('e.g. Which pendant for the entry?').fill(TITLE);

  await page.getByTestId('option-0-choose-product').click();
  const modal = page.getByTestId('product-picker-modal');
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder('Search your library and the catalog…').fill(CUSTOM);
  await page.getByTestId('product-picker-result').filter({ hasText: CUSTOM }).click();

  // Custom mode still STOPS on the configure step — but shows the interstitial.
  await expect(page.getByTestId('picker-configure-step')).toBeVisible();
  const interstitial = page.getByTestId('picker-configure-custom');
  await expect(interstitial).toBeVisible();
  await expect(
    interstitial.getByText(
      'Custom commission — scope, revisions, and pricing are set in the piece room.',
    ),
  ).toBeVisible();

  // Both exits are offered: the piece room, or take it unconfigured for now.
  await expect(page.getByTestId('picker-configure-open-piece-room')).toBeVisible();
  await expect(page.getByTestId('picker-configure-add-unconfigured')).toBeVisible();

  // The picker never fabricates a specification for a commission.
  await page.getByTestId('picker-configure-add-unconfigured').click();
  await expect(modal).toBeHidden();
  await expect(page.getByTestId('option-0-name')).toHaveValue(CUSTOM);
  await expect(page.getByTestId('option-0-configuration-pending')).toBeVisible();

  // A commission is not comparable — the group-compare affordance must stay off.
  await expect(page.getByTestId('option-0-compare-group')).toHaveCount(0);
});
