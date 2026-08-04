/**
 * P2-9 — the structured dimensions editor in the spec-book SelectionEditor.
 *
 * The editor replaced a raw JSON textarea. Its load-bearing promise is that
 * editing W/D/H/unit through the structured control NEVER drops the keys the
 * field captured but the control doesn't know about — so a legacy/captured key
 * seeded onto the row must survive a structured edit and round-trip to Postgres.
 *
 * Chromium-pinned: `ensure_project_spec_book` provisions one book per project on
 * first load; parallel browser projects race that singleton as the same designer.
 *
 * RUN THIS SUITE AS: `pnpm --filter @patina/designer-portal test:e2e:library`
 * — chromium-only, `--workers=1`. `playwright.config.ts` is `fullyParallel`, so a
 * plain `playwright test` puts these spec files in separate workers, racing one
 * local database as one designer. Serial-within-file does not cover that.
 */
import { test, expect } from '../fixtures/auth';
import {
  RESOLVED_SUPABASE_URL,
  designerAndClientIds,
  getSpec,
  seedFfeItem,
  seedProjectIn,
  seedScope,
  setSpecDimensions,
  stamp,
  teardownScope,
} from './fixtures';

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Single-actor walk — parallel browsers race the project spec book as the same designer.',
);
test.describe.configure({ mode: 'serial' });

// Next dev compiles the document/spec-book routes on first hit, and whichever
// spec runs first pays that cost inside its own timeout. The shared 60s default
// is not enough for a cold server, so give these walks headroom.
test.beforeEach(() => test.setTimeout(120_000));

const RUN = stamp();
const ITEM_NAME = `E2E Spec Sofa ${RUN}`;
/** A key the structured control knows nothing about — the preservation subject. */
const LEGACY_DIMENSIONS = { seatHeight: '18 in' };

// The project is recorded the moment it exists; the FF&E line and its spec row
// cascade with it, so a beforeAll that dies after the insert still cleans up.
const scope = seedScope();

let projectId: string;
let ffeItemId: string;

test.beforeAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`[library-configuration] service-role client resolved → ${RESOLVED_SUPABASE_URL}`);

  const { designerId, clientId } = designerAndClientIds();
  projectId = await seedProjectIn(scope, `E2E Spec Book ${RUN}`, designerId, clientId);
  // `trg_spec_book_attach_ffe_line` creates the project_ffe_specs row for us.
  ffeItemId = await seedFfeItem(projectId, ITEM_NAME);
  await setSpecDimensions(ffeItemId, LEGACY_DIMENSIONS);
});

test.afterAll(() => teardownScope(scope));

test('the structured editor writes W/D/H/unit and preserves unknown captured keys', async ({
  authenticatedPage: page,
}) => {
  await page.goto(`/doc/${projectId}/spec-book`, { waitUntil: 'domcontentloaded' });

  // The workbench auto-selects the first item, so the editor mounts unprompted.
  await expect(page.getByRole('navigation', { name: 'Spec book workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Workbench' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The unknown key is surfaced, not silently carried.
  await expect(page.getByText('+1 captured field preserved')).toBeVisible();

  await page.getByLabel('width', { exact: true }).fill('72');
  await page.getByLabel('depth', { exact: true }).fill('38');
  await page.getByLabel('height', { exact: true }).fill('30');
  await page.getByLabel('unit', { exact: true }).selectOption('in');

  // Dispatch the click straight at the button. The fixed Studio drawer (60px,
  // z-40) overlays the bottom of the editor aside, and a plain click — even
  // `{ force: true }`, which only skips the actionability CHECK and still clicks
  // at coordinates — lands on the drawer instead, silently doing nothing.
  await page.getByRole('button', { name: 'Save selection' }).dispatchEvent('click');

  // Poll the row FIRST — it is the authoritative evidence, and the mutation
  // lands well after any network-idle signal on a cold dev server.
  await expect
    .poll(async () => (await getSpec(ffeItemId)).selected_dimensions, {
      timeout: 30_000,
      message: 'project_ffe_specs.selected_dimensions after a structured edit',
    })
    .toEqual({
      width: '72',
      depth: '38',
      height: '30',
      unit: 'in',
      // The whole point: the control spread the existing object rather than
      // replacing it, so the captured key it never rendered still survives.
      seatHeight: '18 in',
    });

  // ...and the re-rendered control, now fed by the refetched row, still reports
  // the unknown key. (The transient "Selection saved." banner is NOT asserted:
  // the post-save refetch clears that state, so it is not durably observable.)
  await expect(page.getByText('+1 captured field preserved')).toBeVisible();
  await expect(page.getByLabel('width', { exact: true })).toHaveValue('72');
  await expect(page.getByLabel('unit', { exact: true })).toHaveValue('in');
});

test('the raw JSON escape hatch stays available beside the structured control', async ({
  authenticatedPage: page,
}) => {
  await page.goto(`/doc/${projectId}/spec-book`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Spec book workspace' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit raw JSON' }).click();
  // Toggling to raw swaps the affordance rather than losing the structured path.
  await expect(page.getByRole('button', { name: 'Use structured editor' })).toBeVisible();
  await expect(page.getByLabel('width', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Use structured editor' }).click();
  await expect(page.getByLabel('width', { exact: true })).toBeVisible();
});
