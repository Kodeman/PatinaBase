/**
 * P0-2 — the product picker's configure step.
 *
 * A variant-mode piece picked from the Library must stop on the configure pane,
 * resolve its specification against the server (`evaluate_product_configuration`),
 * and hand the consuming surface a selection that carries the value label and the
 * RESOLVED price — not the product's list price. "Decide later" must still yield
 * a usable pick, flagged pending. A standard product must never see the pane.
 *
 * Chromium-pinned: the walk publishes decisions as the single seeded designer, so
 * the three browser projects would race the same rows (patina-testing step 11).
 * Serial within the file for the same reason.
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
const CONFIGURABLE = `E2E Config Bed ${RUN}`;
const STANDARD = `E2E Plain Lamp ${RUN}`;

// Every row this file creates is recorded in one scope as it is created, so a
// beforeAll that dies halfway still leaves nothing behind.
const scope = seedScope();
const TITLE_CONFIGURED = trackDecision(scope, `E2E configured pick ${RUN}`);
const TITLE_SKIPPED = trackDecision(scope, `E2E decide later ${RUN}`);
const TITLE_STANDARD = trackDecision(scope, `E2E standard pick ${RUN}`);

let projectId: string;

test.beforeAll(async () => {
  // Proof, in the run log, that every write below lands on the local stack.
  // eslint-disable-next-line no-console
  console.log(`[library-configuration] service-role client resolved → ${RESOLVED_SUPABASE_URL}`);

  const { designerId, clientId } = designerAndClientIds();
  projectId = await seedProjectIn(scope, `E2E Library Config ${RUN}`, designerId, clientId);

  const configurableId = await seedProductIn(scope, {
    name: CONFIGURABLE,
    ownerUserId: designerId,
  });
  authorVariantSchema(designerId, configurableId);

  // No schema call — `configuration_mode` stays at its 'standard' default.
  await seedProductIn(scope, { name: STANDARD, ownerUserId: designerId });
});

test.afterAll(() => teardownScope(scope));

/** Open the Coordination composer on the seeded project and name the decision. */
async function openComposer(page: import('@playwright/test').Page, title: string) {
  await page.goto(`/doc/${projectId}`, { waitUntil: 'domcontentloaded' });
  const newItem = page.getByRole('button', { name: '+ New open item' });
  await expect(newItem).toBeVisible();
  await newItem.click();

  const prompt = page.getByPlaceholder('e.g. Which pendant for the entry?');
  await expect(prompt).toBeVisible();
  await prompt.fill(title);
}

/** Drive option card 0's picker to the seeded product's result row. */
async function pickProduct(page: import('@playwright/test').Page, productName: string) {
  await page.getByTestId('option-0-choose-product').click();

  const modal = page.getByTestId('product-picker-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Add a product' })).toBeVisible();

  await modal.getByPlaceholder('Search your library and the catalog…').fill(productName);

  const result = page.getByTestId('product-picker-result').filter({ hasText: productName });
  await expect(result).toHaveCount(1);
  await result.click();
}

test('a variant piece stops on the configure pane and carries the resolved selection', async ({
  authenticatedPage: page,
}) => {
  await openComposer(page, TITLE_CONFIGURED);
  await pickProduct(page, CONFIGURABLE);

  // The pane replaces the grid rather than closing the modal.
  const pane = page.getByTestId('picker-configure-step');
  await expect(pane).toBeVisible();
  await expect(
    page.getByTestId('product-picker-modal').getByRole('heading', {
      name: 'Choose the specification',
    }),
  ).toBeVisible();

  // Before a choice the piece is incomplete and cannot be placed.
  const confirm = page.getByRole('button', { name: 'Add configured piece' });
  await expect(confirm).toBeDisabled();

  // The radio input sits under its label's text span, which takes the pointer —
  // click the label the way a designer does, then confirm the input took it.
  await pane.getByText('Oak', { exact: true }).click();
  await expect(pane.getByRole('radio', { name: 'Oak' })).toBeChecked();

  // Wait on the AUTHORITATIVE server confirmation, not on the click — the
  // status pill only reads "Ready for a project" once the evaluate RPC has
  // returned a snapshot matching the current selection.
  await expect(pane.getByRole('status')).toHaveText('Ready for a project');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // The emitted option renames itself with the value label and prices at the
  // matched variant's retail (305000c), not the product's list price.
  await expect(page.getByTestId('product-picker-modal')).toBeHidden();
  await expect(page.getByTestId('option-0-name')).toHaveValue(`${CONFIGURABLE} — Oak`);
  await expect(page.getByTestId('option-0-price')).toHaveValue('3050');
  await expect(page.getByTestId('option-0-configuration-pending')).toBeHidden();

  await page.locator('[data-action-key="publish-coordination-item"]').click();

  // The write races network-idle — poll the row instead (patina-testing step 9).
  await expect
    .poll(async () => {
      const options = await getDecisionOptionsByTitle(TITLE_CONFIGURED);
      const configured = options.find((o) => o.name === `${CONFIGURABLE} — Oak`);
      if (!configured) return null;
      return {
        price: configured.price,
        labels: (configured.selection_snapshot as Array<{ valueLabel?: string }> | null)?.map(
          (s) => s.valueLabel,
        ),
      };
    }, { timeout: 20_000, message: 'client_decision_options row carrying the selection snapshot' })
    // `price` persists in CENTS — the resolved variant retail, not the list price.
    .toEqual({ price: 305_000, labels: ['Oak'] });
});

test('"Decide later" yields an unconfigured pick flagged pending', async ({
  authenticatedPage: page,
}) => {
  await openComposer(page, TITLE_SKIPPED);
  await pickProduct(page, CONFIGURABLE);

  await expect(page.getByTestId('picker-configure-step')).toBeVisible();
  await page.getByTestId('picker-configure-skip').click();

  await expect(page.getByTestId('product-picker-modal')).toBeHidden();
  // Unconfigured: the bare product name, no " — value" suffix, plus the hint.
  await expect(page.getByTestId('option-0-name')).toHaveValue(CONFIGURABLE);
  await expect(page.getByTestId('option-0-configuration-pending')).toBeVisible();

  await page.locator('[data-action-key="publish-coordination-item"]').click();

  await expect
    .poll(async () => {
      const options = await getDecisionOptionsByTitle(TITLE_SKIPPED);
      const row = options.find((o) => o.name === CONFIGURABLE);
      return row ? row.selection_snapshot : undefined;
    }, { timeout: 20_000, message: 'skipped pick persists with no selection snapshot' })
    .toBeNull();
});

test('a standard product picks straight through with no configure pane', async ({
  authenticatedPage: page,
}) => {
  await openComposer(page, TITLE_STANDARD);
  await pickProduct(page, STANDARD);

  // The modal closes on the pick itself — the pane must never mount.
  await expect(page.getByTestId('product-picker-modal')).toBeHidden();
  await expect(page.getByTestId('picker-configure-step')).toHaveCount(0);
  await expect(page.getByTestId('option-0-name')).toHaveValue(STANDARD);
  await expect(page.getByTestId('option-0-configuration-pending')).toBeHidden();
});
