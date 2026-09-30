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
import { ARRIVAL_PROJECT_ID, armE2EOptIn, installArrivalInstruments, settleDeskWalkthrough, topmostAtCentre, waitForHold, CARD_SELECTOR } from './helpers';

/** The engine's one announcement node (engine.ts `start()`). */
const ENGINE_STATUS = '.arr-vh[role="status"]';

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
    // The run's own `role="status"` node mounts at compose start (engine.ts
    // `start()`, on <body>), not at hold(), so the baseline is read HERE,
    // before the card is visible. It is a set of nodes, not a count, and
    // only nodes outside the route root: at this point the paper is held
    // (`data-arrival-held`), and its SectionLoadingLine `role="status"`
    // nodes unmount before ready, so a whole-page count raced them
    // (CONTRACT §4h round 6). The paper's own status nodes are business
    // content; the run's announcement is whatever the run adds outside it.
    const baseline = await page.evaluate((sel) => {
      const w = window as unknown as { __srBaseline?: Set<Element> };
      w.__srBaseline = new Set(
        Array.from(document.querySelectorAll('[role="status"]')).filter(
          (el) => !el.closest('[data-arrival],[data-arrival-held]'),
        ),
      );
      return { engine: document.querySelectorAll(sel).length };
    }, ENGINE_STATUS);
    expect(baseline.engine, 'the baseline was read after the run mounted its node').toBe(0);
    // Every `role="status"` node outside the route root that was not there
    // at baseline, with whether it is the engine's own.
    const added = () =>
      page.evaluate((sel) => {
        const w = window as unknown as { __srBaseline?: Set<Element> };
        return Array.from(document.querySelectorAll('[role="status"]'))
          .filter((el) => !el.closest('[data-arrival],[data-arrival-held]') && !w.__srBaseline!.has(el))
          .map((el) => ({ engine: el.matches(sel), text: (el.textContent ?? '').trim() }));
      }, ENGINE_STATUS);

    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });

    // aria-live forced off for the run's whole duration.
    await expect(region).toHaveAttribute('aria-live', 'off');

    // hold() (Act 2) sets the status text once the card has composed in —
    // give it a moment past compose, then read what the run added.
    await page.waitForTimeout(1_800);
    const during = await added();
    expect(during, JSON.stringify(during)).toHaveLength(1);
    expect(during[0].engine, JSON.stringify(during)).toBe(true);
    expect(during[0].text.length).toBeGreaterThan(0);

    // Text is set exactly once for the run (re-reading after another beat
    // must be stable, not re-announced).
    expect(await added()).toEqual(during);

    await page.locator('.arr-skip').click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    // Restored: the run's own status node is gone (the engine removes every
    // node it mounted on end()), and nothing the run added outside the
    // route root is left.
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator(ENGINE_STATUS)).toHaveCount(0);
    await expect.poll(added).toEqual([]);
  });

  test('the flying headline clone genuinely hit-tests where it visually sits', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });

    const clone = page.locator(CARD_SELECTOR);
    await expect(clone).toBeVisible();
    // Mid-hold, after the compose-in animation has settled to its resting
    // opacity/transform, so the rect read below is the clone's true landed
    // position, not a mid-tween one.
    await waitForHold(page);

    const hit = await topmostAtCentre(page, CARD_SELECTOR);
    expect(hit.rectNonEmpty).toBe(true);
    expect(hit.opacity).toBe('1');
    expect(hit.own, hit.hit).toBe(true);

    // A screenshot of the clone's own bounding box must not be visually
    // empty (a fully-clipped element can still report a rect and pass
    // `elementFromPoint` in some engines' quirks — cross-check pixel data).
    const shot = await clone.screenshot();
    expect(shot.byteLength).toBeGreaterThan(0);

    await page.locator('.arr-skip').click();
  });
});
