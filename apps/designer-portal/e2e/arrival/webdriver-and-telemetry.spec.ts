/**
 * W3b — the webdriver decline, the Supabase origin probe, and telemetry
 * (US-14, CONTRACT §5).
 *
 *  - webdriver decline without opt-in: every Playwright-driven browser sets
 *    `navigator.webdriver = true`; without `pl-arrive-e2e` armed, gate.ts
 *    declines `cause:'webdriver'` — this is the ONE spec in the lane that
 *    must NOT call `armE2EOptIn`
 *  - `window.__PATINA_SUPABASE_ORIGIN` is the loopback Supabase URL, proving
 *    this build/run is talking to local Supabase, not Strata
 *  - telemetry: `documentEvents.arrivalEnded` rides `posthog.capture` only
 *    when `NEXT_PUBLIC_POSTHOG_KEY` was present at BUILD time — this build
 *    has none (confirmed: `grep -rl "phc_" .next/static` is empty), so
 *    `window.posthog` is never assigned and no capture can be observed here.
 *    That is a build-environment fact, not an arrival defect — reported as
 *    such in arrival-lane.md. This spec still proves the report() funnel
 *    itself fires exactly once per entry via a build-independent channel:
 *    the `mark_arrival` RPC (mark-arrival.ts — fire-and-forget, unconditional,
 *    fires on every entry's end per CONTRACT §4b), counted over the network.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import {
  ARRIVAL_PROJECT_ID,
  armE2EOptIn,
  installArrivalInstruments,
  arrivalEndedEvents,
  posthogCaptures,
  analyticsEverInitializes,
  countMarkArrivalCalls,
  settleDeskWalkthrough,
  CARD_SELECTOR,
  SKIP_SELECTOR,
} from './helpers';

test.describe('Webdriver decline, origin probe, telemetry', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('without the e2e opt-in, a real automated browser declines webdriver', async ({
    authenticatedPage: page,
  }) => {
    // Deliberately NOT calling armE2EOptIn — this is the one spec in the
    // lane proving the un-opted-in path.
    await installArrivalInstruments(page);
    const isWebdriver = await page.evaluate(() => navigator.webdriver);
    expect(isWebdriver).toBe(true);

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'desk', how: 'declined', cause: 'webdriver' });
  });

  test('window.__PATINA_SUPABASE_ORIGIN is loopback', async ({ authenticatedPage: page }) => {
    await armE2EOptIn(page);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    const origin = await page.evaluate(
      () => (window as unknown as { __PATINA_SUPABASE_ORIGIN?: string }).__PATINA_SUPABASE_ORIGIN,
    );
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test('telemetry: the report() funnel fires exactly once per entry (mark_arrival RPC), posthog capture observed if this build ever initializes it', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    // The Document entry's own anchor. The fixture's /desk entry, still in its
    // ready wait when goto leaves it, ends on pagehide and writes its own
    // anchor (CONTRACT §4b: once per entry, on every end).
    const markArrivalCalls = countMarkArrivalCalls(page, 'document');

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    // mark-arrival.ts's RPC call is fire-and-forget over the network; give it
    // a beat past the UI-visible end to land.
    await page.waitForTimeout(500);

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'document', how: 'skip' });
    // The build-independent proxy: exactly one report() funnel firing.
    expect(markArrivalCalls.get()).toBe(1);

    const analyticsUp = await analyticsEverInitializes(page, 1_500);
    const captures = await posthogCaptures(page);
    test.info().annotations.push({
      type: 'telemetry-build-gap',
      description: `NEXT_PUBLIC_POSTHOG_KEY absent in this build — window.posthog initializes: ${analyticsUp}, captures observed: ${captures.length}. See arrival-lane.md "telemetry".`,
    });
    if (analyticsUp) {
      // If a future build DOES carry a PostHog key, hold it to the literal
      // contract: exactly one arrival_ended capture, and only the documented
      // keys.
      const arrivalCaptures = captures.filter((c) => c.event === 'arrival_ended');
      expect(arrivalCaptures).toHaveLength(1);
      const props = arrivalCaptures[0].properties ?? {};
      const allowedKeys = new Set(['surface', 'how', 'cause']);
      for (const key of Object.keys(props)) expect(allowedKeys.has(key)).toBe(true);
      expect(props.surface).toBe('document');
      expect(props.how).toBe('skip');
      expect(props.cause).toBeUndefined();
    } else {
      expect(captures).toHaveLength(0);
    }
  });
});
