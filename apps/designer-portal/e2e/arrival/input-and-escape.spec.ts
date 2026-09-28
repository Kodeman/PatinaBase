/**
 * W3b — input handling (US-14, CONTRACT §5, engine.ts "Acts 1-2 advance and
 * swallow; Skip alone rests; Act 3 never cancels").
 *
 *  - Escape mid-hold (Act 2) only advances (`how:'escape'`) — it never
 *    navigates, the page stays on /doc
 *  - Escape during the ready wait (`html.arr-pre`, before any run exists) is
 *    swallowed at capture (arrival-mount.tsx `onKeyDown`:
 *    `e.stopImmediatePropagation()` for Escape specifically) — proven by a
 *    bubble-phase probe on `window` that never sees the event — and still
 *    halts the wait (any key does)
 *  - a chrome click and the `t` / `?` / `g`,`l` bare-key shortcuts in Acts
 *    1-2 only advance the run (`engine.ts` `early()` branch —
 *    `stopImmediatePropagation()` before the page's own handlers run) — no
 *    overlay (⌘K, a dialog) ever opens
 *  - Skip goes straight to rest, not through the remaining hold
 *  - input during the ready wait (a wheel tick while `html.arr-pre` is set)
 *    halts the wait, shows the ordinary page, starts no run, and produces
 *    exactly one `arrival_ended` with `{how:'declined', cause:'busy'}`
 *    (CONTRACT §4b)
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import {
  ARRIVAL_PROJECT_ID,
  armE2EOptIn,
  installArrivalInstruments,
  arrivalEndedEvents,
  settleDeskWalkthrough,
  delayedRoute,
  CARD_SELECTOR,
  SKIP_SELECTOR,
} from './helpers';

/** Records every `keydown` this document's `window` sees at BUBBLE phase.
 *  arrival-mount.tsx's own listener is registered on `window` with
 *  `{capture:true}`; its `stopImmediatePropagation()` for Escape during the
 *  ready wait stops the event before it ever reaches ANY bubble-phase
 *  listener on any node, this one included — so an empty array after
 *  pressing Escape is the falsifier for "swallowed". */
async function installBubbleProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __bubbledKeys: string[] }).__bubbledKeys = [];
    window.addEventListener('keydown', (e) => {
      (window as unknown as { __bubbledKeys: string[] }).__bubbledKeys.push(e.key);
    });
  });
}

async function bubbledKeys(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __bubbledKeys?: string[] }).__bubbledKeys ?? []);
}

test.describe('Arrival input handling', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('Escape mid-hold only advances — no navigation away from /doc', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });

    const urlBefore = page.url();
    await page.keyboard.press('Escape');
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0, { timeout: 5_000 });
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    expect(events.at(-1)).toMatchObject({ surface: 'document', how: 'escape' });
  });

  test('Escape during the ready wait is swallowed at capture, and still halts the wait', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await installBubbleProbe(page);
    await page.route('**/rest/v1/**', delayedRoute(3_000));

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html.arr-pre')).toHaveCount(1, { timeout: 2_000 });

    await page.keyboard.press('Escape');

    // Swallowed: no bubble-phase window listener (including this test's own)
    // ever received it.
    expect(await bubbledKeys(page)).not.toContain('Escape');
    // Still halts: arr-pre clears, the card never mounts, one busy decline.
    await expect(page.locator('html.arr-pre')).toHaveCount(0, { timeout: 2_000 });
    await page.waitForTimeout(3_500); // let the still-in-flight delayed reads land harmlessly
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'document', how: 'declined', cause: 'busy' });
  });

  test('a chrome click and t/?/g,l bare-key shortcuts in Acts 1-2 only advance — no overlay opens', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);

    // Chrome click: a point almost certainly outside the card/act/skip hit
    // areas (top-left corner) — `page.mouse.click` dispatches at raw
    // coordinates rather than resolving a locator's own hit target, which
    // matters here since `arr-on:not(.arr-asm) body{pointer-events:none}`
    // makes ordinary chrome unclickable at the CSS layer; the window-capture
    // listener still sees the event regardless of what it resolves to.
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.mouse.click(10, 10);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    let events = await arrivalEndedEvents(page);
    expect(events.at(-1)).toMatchObject({ surface: 'document', how: 'input' });

    for (const keys of [['t'], ['?'], ['g', 'l']]) {
      await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
      for (const key of keys) await page.keyboard.press(key);
      await expect(page.locator(CARD_SELECTOR)).toHaveCount(0, { timeout: 5_000 });
      // Neither ⌘K nor any other dialog opened from the shortcut leaking through.
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
      events = await arrivalEndedEvents(page);
      expect(events.at(-1)).toMatchObject({ surface: 'document', how: 'input' });
    }
  });

  test('Skip goes straight to rest, not through the remaining hold', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });

    const t0 = Date.now();
    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0, { timeout: 3_000 });
    const elapsedMs = Date.now() - t0;
    // BUDGET.HOLD_MS is 10s; resting inside 3s proves Skip did not wait it out.
    expect(elapsedMs).toBeLessThan(3_000);

    const events = await arrivalEndedEvents(page);
    expect(events.at(-1)).toMatchObject({ surface: 'document', how: 'skip' });
  });

  test('input during the ready wait halts it, shows the ordinary page, starts no run', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.route('**/rest/v1/**', delayedRoute(3_000));

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html.arr-pre')).toHaveCount(1, { timeout: 2_000 });

    await page.mouse.wheel(0, 12);

    await expect(page.locator('html.arr-pre')).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    // the ordinary page: the Document's own root chrome is live (checked via
    // `data-arrival="document"` rather than the spine's "Put down" link,
    // which is desktop-only — `min-[1180px]:block` — and this assertion must
    // hold on the phone-viewport `mobile-chrome` project too).
    await expect(page.locator('[data-arrival="document"]')).toBeVisible({ timeout: 2_000 });

    await page.waitForTimeout(3_500); // let the delayed reads land — no late run must start
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'document', how: 'declined', cause: 'busy' });
  });
});
