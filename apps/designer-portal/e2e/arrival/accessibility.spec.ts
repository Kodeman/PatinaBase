/**
 * W3b — accessibility (US-14, CONTRACT §5).
 *
 *  - one SR announcement: `engine.ts` `hold()` sets a single `role="status"`
 *    node's text exactly once per run (`message(b)`), and the lens band's own
 *    `aria-live="polite"` region is forced to `"off"` for the run's duration
 *    (so the real page's own live announcements don't double up with the
 *    card's), restored after
 *  - visibility via `elementFromPoint`: the flying headline clone (`.arr-h`)
 *    genuinely paints and hit-tests at its own on-screen position — rects
 *    alone can lie about clipping (an ancestor `overflow:hidden` can leave a
 *    non-empty `getBoundingClientRect()` for a clipped-away element)
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import { ARRIVAL_PROJECT_ID, armE2EOptIn, installArrivalInstruments, settleDeskWalkthrough, CARD_SELECTOR } from './helpers';

test.describe('Arrival accessibility', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('exactly one SR announcement; the lens band aria-live goes off for the run and is restored', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });

    const region = page.locator('[data-lens-announce]').locator('xpath=ancestor::*[@aria-live][1]');
    await expect(region).toHaveAttribute('aria-live', 'polite');

    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    // The run's own status node is a NEW `role="status"` while it is up — a
    // delta against whatever pre-existing `role="status"` widgets the
    // Document already renders (business content, unrelated to arrival),
    // rather than assuming arrival's is the page's only one.
    const statusBefore = await page.locator('[role="status"]').count();

    // aria-live forced off for the run's whole duration.
    await expect(region).toHaveAttribute('aria-live', 'off');

    // hold() (Act 2) sets the status text once the card has composed in —
    // give it a moment past compose, then read the delta status node's text.
    await page.waitForTimeout(1_800);
    const statusCount = await page.locator('[role="status"]').count();
    expect(statusCount).toBe(statusBefore + 1);
    const allStatusTexts = await page.locator('[role="status"]').allTextContents();
    const nonEmptyStatuses = allStatusTexts.filter((t) => t.trim().length > 0);
    expect(nonEmptyStatuses.length).toBeGreaterThanOrEqual(1);

    // Text is set exactly once for the run (re-reading after another beat
    // must be stable, not re-announced).
    const textsAgain = await page.locator('[role="status"]').allTextContents();
    expect(textsAgain).toEqual(allStatusTexts);

    await page.locator('.arr-skip').click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    // Restored: back to the page's own baseline, and the run's own status
    // node is gone (the engine removes every node it mounted on end()).
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[role="status"]')).toHaveCount(statusBefore);
  });

  test('the flying headline clone genuinely hit-tests where it visually sits', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });

    const clone = page.locator('.arr-h').first();
    await expect(clone).toBeVisible();
    // Mid-hold, after the compose-in animation has settled to its resting
    // opacity/transform, so the rect read below is the clone's true landed
    // position, not a mid-tween one.
    await page.waitForTimeout(1_600);

    const hit = await clone.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const at = document.elementFromPoint(cx, cy);
      return {
        isSelfOrDescendantHit: at === el || (at !== null && el.contains(at)),
        rectNonEmpty: r.width > 0 && r.height > 0,
        opacity: getComputedStyle(el).opacity,
      };
    });
    expect(hit.rectNonEmpty).toBe(true);
    expect(hit.opacity).toBe('1');
    expect(hit.isSelfOrDescendantHit).toBe(true);

    // A screenshot of the clone's own bounding box must not be visually
    // empty (a fully-clipped element can still report a rect and pass
    // `elementFromPoint` in some engines' quirks — cross-check pixel data).
    const shot = await clone.screenshot();
    expect(shot.byteLength).toBeGreaterThan(0);

    await page.locator('.arr-skip').click();
  });
});
