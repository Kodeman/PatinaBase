/**
 * W3b — Desk surface plays (US-14, CONTRACT §5).
 *
 *  - a hard Desk entry plays
 *  - a cold Desk (delayed `**\/rest/v1/**`) shows chrome (header + "Find
 *    anything") immediately, never mounts the card before `host.ready()`,
 *    then plays once the delayed reads land
 *  - a Desk visited straight after a Document (ORC:1123) still plays — the
 *    Desk-shown gate is per-surface, a Document visit does not consume it
 *  - the setup-whisper coexistence case (owner Desk, incomplete setup) is a
 *    runtime capability probe: `studio-workspaces` is not in this build's
 *    baked `NEXT_PUBLIC_FLAG_OVERRIDES` (confirmed via
 *    `grep -rho "[a-z-]+:(true|false)(,[a-z-]+:(true|false))*" .next/static`),
 *    so the whisper can never mount here without a rebuild this piece was
 *    told not to force. The test still proves the negative honestly rather
 *    than skip silently: it asserts the flag is off, then asserts the Desk
 *    still plays (the coexistence claim the flag WOULD need to be true to
 *    fully exercise) and records the gap in arrival-lane.md.
 *  - the staggered Desk reads case: engagements answer immediately, the rest
 *    of the Desk's own reads land 1.5-3s apart individually — the run must
 *    either play cleanly once everything has landed, or decline `hidden`/
 *    `late`, but never `mutation` (a late read repainting the roster while
 *    the card is up would be a foreign mutation).
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

test.describe('Desk plays', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('a hard Desk entry plays the card, then rests', async ({ authenticatedPage: page }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    // The auth fixture's own sign-in redirect already committed a SOFT /desk
    // entry (its hard-loaded document was /auth/signin). A second, real
    // navigation to /desk is the hard entry under test (nav.ts `hard =
    // nav === null || toPathname(nav.name) === pathname`, true for THIS load).
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });

    await expect(page.locator(CARD_SELECTOR)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-arrival="desk"][data-arr-played]')).toHaveCount(1);
    // Chrome stays interactive under the card (arrival.css `[data-arr]` is the
    // only pointer-events exemption while `arr-on:not(.arr-asm)`) — Skip is
    // itself `data-arr` and is the fastest, most deterministic way to close
    // the run out in a test.
    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'desk', how: 'skip' });
  });

  test('a cold Desk shows chrome immediately, plays once delayed reads land, and never hides chrome', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.route('**/rest/v1/**', delayedRoute(3_000));

    const nav = page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await nav;

    // Chrome (header + the "Find anything" affordance) renders unconditionally
    // — desk/page.tsx's <header> is above the isLoading/isError branch — so it
    // must be visible well before the delayed reads land.
    const findAnything = page.getByRole('button', { name: /find anything/i });
    await expect(findAnything).toBeVisible({ timeout: 2_000 });

    // The card must not mount before `host.ready()` (arrival-run.tsx
    // `maybeBegin` gates on it) — with every REST read 3s out, the roster's
    // own gating reads (unbilledTimeRead, reactionRollupRead, etc., desk
    // page.tsx `arrivalReady`) cannot have settled yet.
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    // Chrome must still be there, never hidden by the wait.
    await expect(findAnything).toBeVisible();
    await expect(page.locator('[data-tour-anchor="desk-greeting"]')).toBeVisible();

    // Once the delayed reads land the card plays.
    await expect(page.locator(CARD_SELECTOR)).toBeVisible({ timeout: 8_000 });
    await expect(findAnything).toBeVisible();

    await page.locator(SKIP_SELECTOR).click();
    const events = await arrivalEndedEvents(page);
    expect(events.at(-1)).toMatchObject({ surface: 'desk', how: 'skip' });
  });

  test('Desk after a Document-first visit still plays (ORC:1123)', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);

    // Visit the Document FIRST — a fresh hard entry there.
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SKIP_SELECTOR).click();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    // Now go to the Desk (a fresh hard load, not the "put down" client nav —
    // this isolates the Desk-shown gate from the put-down's own roster-land
    // behavior, covered separately in put-down.spec.ts).
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR)).toBeVisible({ timeout: 20_000 });

    const events = await arrivalEndedEvents(page);
    // The Document's own decline/play is event #1; the Desk's play has not
    // ended yet (still on card) — assert the Document's own entry did not
    // consume the Desk's gate (no 'desk-shown' decline was recorded for the
    // Desk surface at any point in this session).
    expect(events.every((e) => !(e.surface === 'desk' && e.cause === 'desk-shown'))).toBe(true);
  });

  test('setup-whisper coexistence: studio-workspaces is off in this build, so the Desk still plays untouched', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR)).toBeVisible({ timeout: 20_000 });

    // host.busy() would need `studio-workspaces` ON (useStudioSetupWhisperEligible)
    // to mount an `aside[role="note"]` and exercise real coexistence; that flag
    // is not in this build's NEXT_PUBLIC_FLAG_OVERRIDES
    // (procurement-workspace-pilot, the-document-pilot, client-invite-letter
    // only — confirmed via the build's own static chunks) and cannot change
    // without a rebuild this piece must not force. This assertion is the
    // honest negative: the whisper is absent, and the Desk plays regardless.
    await expect(page.locator('aside[role="note"]')).toHaveCount(0);
    await page.locator(SKIP_SELECTOR).click();
    const events = await arrivalEndedEvents(page);
    expect(events.at(-1)).toMatchObject({ surface: 'desk', how: 'skip' });
  });

  test('staggered Desk reads: plays clean once landed, or declines hidden/late — never mutation', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);

    // Engagements (the roster's own primary read) answer at once; the rest of
    // the Desk's gating reads land individually, staggered 1.5-3s apart
    // (CONTRACT §4b "the staggered Desk reads").
    const STAGGERED = [
      { pattern: '**/rest/v1/rpc/studio_boards_overview*', delayMs: 1_500 },
      { pattern: '**/rest/v1/project_unbilled_time*', delayMs: 2_000 },
      { pattern: '**/rest/v1/proposal_boards*', delayMs: 2_500 },
      { pattern: '**/rest/v1/project_notes*', delayMs: 3_000 },
    ];
    for (const { pattern, delayMs } of STAGGERED) {
      await page.route(pattern, delayedRoute(delayMs));
    }

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });

    // Give every staggered read time to land, then give the run its own
    // ready-wait budget on top.
    await page.waitForTimeout(3_200);
    const cardOrRest = await Promise.race([
      page.locator(CARD_SELECTOR).waitFor({ state: 'visible', timeout: 9_000 }).then(() => 'played' as const),
      page
        .waitForFunction(
          () =>
            (window as unknown as { __arrivalEndedEvents?: unknown[] }).__arrivalEndedEvents
              ?.length,
          undefined,
          { timeout: 9_000 },
        )
        .then(() => 'ended' as const)
        .catch(() => 'neither' as const),
    ]);
    expect(cardOrRest).not.toBe('neither');

    if (cardOrRest === 'played') {
      await page.locator(SKIP_SELECTOR).click();
    }
    const events = await arrivalEndedEvents(page);
    const deskEvents = events.filter((e) => e.surface === 'desk');
    expect(deskEvents.length).toBeGreaterThan(0);
    for (const e of deskEvents) {
      expect(e.cause).not.toBe('mutation');
      if (e.how === 'declined') {
        expect(['hidden', 'late']).toContain(e.cause);
      }
    }
  });
});
