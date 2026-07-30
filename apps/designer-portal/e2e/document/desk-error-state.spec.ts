import path from 'path';
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { getDesignerId, setTourCompleted } from '../helpers/help-state';

/**
 * Arrival Arc Phase 0 (DECISIONS.md I64) — the Desk's whole-desk error state.
 *
 * Prereqs (house pattern, playwright.config.ts): local Supabase up + seeded
 * (designer@patina.dev / password123). No flag override needed — the Document
 * is unconditional since the R21 dissolve (I109) retired `the-document-pilot`.
 *
 * Chromium-pinned: these tests intercept network routes rather than mutate a
 * shared DB row, so cross-browser correctness isn't the concern here — the
 * 20-load loop in particular is expensive, and there is no shared-actor race
 * to prove out across engines.
 *
 * The Desk Walkthrough's auto-modal (R97, desk-walkthrough.tsx) fires for any
 * designer created after its ship date with no completed-tour record — it
 * renders a <dialog> that makes the rest of the page inert, which swallows
 * our error-state assertions if left alone. Mark the tour completed up front
 * (help-state.ts refuses to run against anything but the local stack).
 */
test.describe.configure({ mode: 'serial' });

const SHOT_DIR = path.resolve(
  '/private/tmp/claude-501/-Users-kody-Code-patina-merged/7f4ef141-35f6-45fe-adf8-33cf5f23db13/scratchpad/desk-screenshots',
);
const shot = (page: AuthenticatedPage, name: string) =>
  page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });

test.beforeAll(async () => {
  const id = await getDesignerId();
  await setTourCompleted(id);
});

test.beforeEach(async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'single-browser sweep is enough here');
  await page.setViewportSize({ width: 1280, height: 900 });
});

test.describe('Desk — whole-desk error state', () => {
  test('a forced document_state failure shows one coherent error surface; retry recovers', async ({
    authenticatedPage: page,
  }) => {
    let forceFail = true;
    await page.route('**/rest/v1/document_state**', (route) => {
      if (!forceFail) return route.continue();
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'forced failure (e2e desk-error-state.spec.ts)' }),
      });
    });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });

    // The single coherent error surface. Scoped by testid — the app also has
    // an always-present (usually empty) toast live region with role="alert",
    // so a bare role query is ambiguous.
    const errorState = page.getByTestId('desk-error-state');
    await expect(errorState).toBeVisible({ timeout: 20_000 });
    await expect(errorState.getByText('The desk could not be read.')).toBeVisible();
    const retry = errorState.getByRole('button', { name: /try again/i });
    await expect(retry).toBeVisible();

    // No half-desk: none of the healthy/quiet-desk surfaces coexist with the
    // error banner — this is exactly the bug the whole-desk error state fixes.
    await expect(page.getByText('Nothing needs your hand.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Needs your hand' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'In motion' })).toHaveCount(0);
    await expect(page.getByText('This is your Desk.')).toHaveCount(0);

    await shot(page, 'desk-forced-error.png');

    // Un-intercept and retry — the desk should render a real, complete state.
    forceFail = false;
    await retry.click();

    await expect(errorState).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Needs your hand' })).toBeVisible({
      timeout: 20_000,
    });

    await shot(page, 'desk-normal-after-retry.png');
  });

  test('20 consecutive desk loads each reach a complete state with zero half-states', async ({
    authenticatedPage: page,
  }) => {
    const RUNS = 20;
    for (let i = 1; i <= RUNS; i++) {
      await page.goto('/desk', { waitUntil: 'domcontentloaded' });

      // Every load resolves to exactly one of: the folders grid, or the
      // empty-state line — never neither, never both, and never the error
      // surface (this loop runs against the real local stack, no interception).
      const needsHand = page.getByRole('heading', { name: 'Needs your hand' });
      await expect(needsHand).toBeVisible({ timeout: 20_000 });

      const emptyLine = page.getByText('Nothing needs your hand. The work is in motion.');
      const folderCards = page.locator('[data-tour-anchor="desk-folio"]');

      // Poll past the transient loading-skeleton window rather than snapshot
      // immediately after domcontentloaded — the read is async.
      await expect(async () => {
        const hasEmptyLine = (await emptyLine.count()) > 0;
        const hasFolders = (await folderCards.count()) > 0;
        expect(
          hasEmptyLine !== hasFolders,
          `run ${i}: expected exactly one of [empty-state line, folder cards], got empty=${hasEmptyLine} folders=${hasFolders}`,
        ).toBe(true);
      }).toPass({ timeout: 20_000 });

      // No half-state: the error surface must never appear on an unforced load.
      await expect(page.getByTestId('desk-error-state')).toHaveCount(0);

      // When there ARE chips, In motion must render too (never silently
      // dropped) — when there are none, the section is simply absent, which
      // is not itself a half-state.
      const inMotionHeading = page.getByRole('heading', { name: 'In motion' });
      const chipItems = page.locator('section[aria-labelledby="in-motion"] li');
      if ((await inMotionHeading.count()) > 0) {
        await expect(chipItems.first()).toBeVisible();
      }
    }
  });
});
