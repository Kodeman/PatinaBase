import path from 'path';
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import {
  getDesignerId,
  readProfile,
  setCreatedAt,
  clearHelpState,
  setTourCompleted,
  waitForTourRecord,
} from '../helpers/help-state';

/**
 * The Desk Walkthrough (R97) — the desk-first intro tour.
 *
 * Prereqs (house pattern, playwright.config.ts):
 *   · Local Supabase up + seeded (designer@patina.dev / password123).
 *   · `pnpm dev` on :3000. No flag override needed — the R21 dissolve (I109)
 *     retired `the-document-pilot`; the Document is unconditional.
 *
 * These three tests mutate ONE shared row (profiles for the seed designer), so
 * they run serially and each establishes its own DB precondition. The suite
 * restores the designer's original created_at + an empty help_state on teardown.
 *
 * Copy note: with no Sanity content published locally, the WelcomeModal renders
 * its PACKAGE-default CTA labels ("Take the tour" / "Skip for now") — the R97
 * "Take the walkthrough" / "Explore on my own" wording is CMS-authored. We
 * therefore drive the modal by its stable data-testids, not by button text.
 * Likewise step 6's final CTA falls back to the package default "Done" (the
 * ratified "To work" label is CMS-only), so we click it by its `tour-complete`
 * testid.
 */

// One shared actor → serialize; each test sets its own precondition.
test.describe.configure({ mode: 'serial' });

const SHOT_DIR = path.resolve(
  process.cwd(),
  '../../docs/design/the-document/screenshots/help-walkthrough',
);
const shot = (page: AuthenticatedPage, name: string) =>
  page.screenshot({ path: path.join(SHOT_DIR, name) });

// A future timestamp strictly after DESK_WALKTHROUGH_SHIP_DATE (2026-07-11Z) so
// the gate treats the designer as a fresh signup. NB: NOW() (2026-07-10) still
// PREDATES the placeholder ship date, so we cannot use it to exercise the
// auto-modal path — we pin an explicit post-ship date instead.
const FRESH_SIGNUP_CREATED_AT = '2026-07-12T00:00:00Z';

/** A timestamp strictly BEFORE the ship date, so the gate takes the "existing
 *  designer" branch (offer note, no auto-modal). This is pinned rather than
 *  read off the seed: the seeded designer's `profiles.created_at` is the row's
 *  own insert time, which on a freshly reset database is NOW() — after the
 *  placeholder ship date, not before it. The test that needs an existing
 *  designer must therefore state that precondition itself. */
const EXISTING_DESIGNER_CREATED_AT = '2026-07-08T00:00:00Z';

/** The DESK HEADER's own "Find anything" act. The Studio Drawer prints a second
 *  door with the same visible words (C-AP-05), so this is scoped to the desk
 *  head's action region and matched on the exact accessible name — a bare
 *  /Find anything/i now resolves two controls on /desk. */
const findAnything = (page: AuthenticatedPage) =>
  page
    .locator('[role="group"][data-action-region="desk-head"]')
    .getByRole('button', { name: 'Find anything', exact: true });

/** Go to /desk and wait for the desk chrome (the "Find anything" affordance is
 *  always present) — steadier than networkidle against realtime sockets. */
async function gotoDesk(page: AuthenticatedPage, search = ''): Promise<void> {
  await page.goto(`/desk${search}`, { waitUntil: 'domcontentloaded' });
  await expect(findAnything(page)).toBeVisible({
    timeout: 30_000,
  });
}

/** Open the ⌘K command palette via the (idempotent) "Find anything" affordance,
 *  retrying until it appears — the CommandBar listener can lag a cold compile. */
async function openPalette(page: AuthenticatedPage) {
  const palette = page.getByRole('dialog', { name: 'Command bar' });
  const affordance = findAnything(page);
  await expect(async () => {
    await affordance.click();
    await expect(palette).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  return palette;
}

/** Advance the six-step coachmark tour from step 1 through completion. */
async function walkAllSixSteps(page: AuthenticatedPage): Promise<void> {
  for (let n = 1; n <= 5; n++) {
    await expect(page.getByText(`Step ${n} of 6`)).toBeVisible({ timeout: 10_000 });
    if (n === 4) await shot(page, 'step-4-drawer.png');
    await page.getByTestId('tour-next').click();
  }
  await expect(page.getByText('Step 6 of 6')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('tour-complete').click();
  // The tour is gone once complete() fires.
  await expect(page.getByText('Step 6 of 6')).toHaveCount(0);
}

test.describe('The Desk Walkthrough (R97)', () => {
  let designerId: string;
  let originalCreatedAt: string;

  test.beforeAll(async () => {
    designerId = await getDesignerId();
    originalCreatedAt = (await readProfile(designerId)).created_at;
  });

  test.afterAll(async () => {
    // Restore the original created_at and leave help_state empty.
    await setCreatedAt(designerId, originalCreatedAt);
    await clearHelpState(designerId);
  });

  test('existing designer — no modal, the offer note starts the tour, it completes and persists', async ({
    authenticatedPage: page,
  }) => {
    // Existing designer: created_at < ship date. Pinned by the test, not
    // inherited from the seed (see EXISTING_DESIGNER_CREATED_AT).
    await setCreatedAt(designerId, EXISTING_DESIGNER_CREATED_AT);
    await clearHelpState(designerId);

    await gotoDesk(page);

    // No auto welcome modal for an existing designer.
    await expect(page.getByTestId('welcome-modal-content')).toHaveCount(0);

    // The quiet R94 offer note IS present, and its named act starts the tour.
    await expect(page.getByText('New desk, same studio', { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /six quick stops/i }).click();

    // Step 1 — heading "The Desk" (the coachmark's accessible name).
    await expect(page.getByRole('dialog', { name: 'The Desk' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Step 1 of 6')).toBeVisible();
    await shot(page, 'step-1-desk.png');

    // Advance all six steps; step 6 CTA (testid tour-complete) completes it.
    await walkAllSixSteps(page);

    // Completion persisted cross-device (profiles.help_state).
    const rec = await waitForTourRecord(designerId, (r) => r?.completed === true);
    expect(rec?.completed).toBe(true);

    // Reload → no modal, and the offer note is gone (state persisted).
    await gotoDesk(page);
    await expect(page.getByTestId('welcome-modal-content')).toHaveCount(0);
    await expect(page.getByText('New desk, same studio', { exact: false })).toHaveCount(0);
  });

  test('new signup — welcome modal; "explore" dismisses durably; then the walkthrough completes', async ({
    authenticatedPage: page,
  }) => {
    // Fresh-signup path: created_at ≥ ship date.
    await setCreatedAt(designerId, FRESH_SIGNUP_CREATED_AT);
    await clearHelpState(designerId);

    await gotoDesk(page);

    // The auto WelcomeModal ("This is your Desk").
    await expect(page.getByTestId('welcome-modal-content')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('This is your Desk')).toBeVisible();
    await shot(page, 'welcome-modal.png');

    // "Explore on my own" (secondary CTA) closes the modal.
    await page.getByTestId('welcome-modal-secondary').click();
    await expect(page.getByTestId('welcome-modal-content')).toHaveCount(0);

    // Declining wrote abandoned@0 (the durable, cross-device welcome-shown marker).
    const declined = await waitForTourRecord(designerId, (r) => r?.abandoned === true);
    expect(declined?.abandoned).toBe(true);
    expect(declined?.atStep ?? 0).toBe(0);

    // Reload → the modal stays gone.
    await gotoDesk(page);
    await expect(page.getByTestId('welcome-modal-content')).toHaveCount(0);

    // Clear help_state once more → the modal returns → "Take the walkthrough".
    await clearHelpState(designerId);
    await gotoDesk(page);
    await expect(page.getByTestId('welcome-modal-content')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('welcome-modal-primary').click();

    // Six steps → complete.
    await expect(page.getByRole('dialog', { name: 'The Desk' })).toBeVisible({ timeout: 10_000 });
    await walkAllSixSteps(page);

    const rec = await waitForTourRecord(designerId, (r) => r?.completed === true);
    expect(rec?.completed).toBe(true);
  });

  test('replay — ⌘K row and ?tour= param restart at step 1 regardless of completed state', async ({
    authenticatedPage: page,
  }) => {
    // Existing designer (no auto-modal) with a COMPLETED record — replay must
    // ignore the one-shot guard. Same pinned precondition as the first test.
    await setCreatedAt(designerId, EXISTING_DESIGNER_CREATED_AT);
    await setTourCompleted(designerId);

    await gotoDesk(page);
    await expect(page.getByTestId('welcome-modal-content')).toHaveCount(0);

    // ⌘K → "walkthrough" → the replay row.
    const palette = await openPalette(page);
    await palette.getByRole('textbox').fill('walkthrough');
    await palette.getByText('Take the walkthrough', { exact: true }).click();

    // Restarts at step 1 even though the record says completed.
    await expect(page.getByRole('dialog', { name: 'The Desk' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Step 1 of 6')).toBeVisible();

    // Leave the tour without completing it (skip).
    await page.getByTestId('tour-skip').click();
    await expect(page.getByText('Step 1 of 6')).toHaveCount(0);

    // Direct entry: /desk?tour=desk-walkthrough restarts too.
    await setTourCompleted(designerId);
    await gotoDesk(page, '?tour=desk-walkthrough');
    await expect(page.getByRole('dialog', { name: 'The Desk' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Step 1 of 6')).toBeVisible();
  });
});
