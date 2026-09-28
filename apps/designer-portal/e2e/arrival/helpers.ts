/**
 * W3b — shared driving instruments for the arrival lane (US-14, CONTRACT §5).
 *
 * Not a `*.spec.ts` file itself (Playwright's default `testMatch` ignores it),
 * mirroring `e2e/helpers/*` for the rest of the suite.
 */
import type { Page, Route } from '@playwright/test';
import { psqlRun } from '../helpers/psql';
import { WORKFLOW_GATE_PROJECT_ID } from '../helpers/workflow-gate-fixture';

/** designer@patina.dev (dev-accounts.sql) — the seeded actor every arrival spec
 *  drives as, matching desk-claims.spec.ts / arrival-arc.spec.ts. */
export const SEEDED_DESIGNER = 'a0000000-0000-0000-0000-000000000004';

/** The workflow-gate fixture's project: its `overdue` gate gives this designer's
 *  Desk a claim card, so this id is both a `/doc/{id}` route AND a
 *  `[data-claim-card]`/`#roster-line-{id}` row on the Desk. */
export const ARRIVAL_PROJECT_ID = WORKFLOW_GATE_PROJECT_ID;

/** sessionStorage key the gate reads to opt a real Chromium/WebKit run out of
 *  the `navigator.webdriver` decline (types.ts `KEYS.E2E`, CONTRACT §3 "Test
 *  seam"). Every spec in this lane arms it before its first navigation, except
 *  the one spec that exists to prove the un-opted-in decline. */
const E2E_OPT_IN_SCRIPT = `
  try { window.sessionStorage.setItem('pl-arrive-e2e', '1'); } catch (e) {}
`;

/**
 * Arms the e2e opt-in for every navigation this page makes from here on
 * (Playwright's `addInitScript` re-runs on every subsequent document, not
 * retroactively on whatever is already loaded — call this before the
 * navigation whose arrival you want to observe, which for the
 * `authenticatedPage` fixture is EVERY navigation in the test body: the
 * fixture's own sign-in redirect to `/desk` already happened before the test
 * started).
 */
export async function armE2EOptIn(page: Page): Promise<void> {
  await page.addInitScript(E2E_OPT_IN_SCRIPT);
}

/**
 * Installs three window-level instruments used across this lane, all via one
 * `addInitScript` so they exist before ANY of the app's own bootstrap code
 * runs (arrival's own listeners included):
 *
 *  - `window.__arrivalEndedEvents`: every `patina:arrival-ended` CustomEvent
 *    this document has seen, in order, each `{ detail, atMs }`. EVENT_ENDED
 *    fires on `window` (types.ts) exactly once per entry (CONTRACT §4b) — the
 *    lane's own falsifier for "exactly one" is reading this array's length.
 *  - `window.__phEvents`: every call this document has seen through
 *    `window.posthog.capture` (the actual channel `documentEvents.arrivalEnded`
 *    rides — src/lib/analytics/document-events.ts). Installed as a property
 *    descriptor on `window` itself so it survives `posthog.init()` assigning
 *    `window.posthog = posthog` AFTER this script has already run (the
 *    descriptor wraps whatever object gets assigned, not the object present
 *    at parse time).
 *  - `window.__markArrivalCalls`: incremented by a `fetch`/`XMLHttpRequest`
 *    tap is unnecessary — the lane reads this over the network layer instead
 *    (see `countMarkArrivalCalls`), so this instrument is left as a documented
 *    no-op placeholder rather than a second, redundant counting path.
 */
export async function installArrivalInstruments(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __arrivalEndedEvents?: Array<{ detail: unknown; atMs: number }>;
      __phEvents?: Array<{ event: string; properties: Record<string, unknown> | undefined }>;
      posthog?: { capture?: (...args: unknown[]) => unknown };
    };
    w.__arrivalEndedEvents = [];
    w.__phEvents = [];
    window.addEventListener('patina:arrival-ended', (e: Event) => {
      w.__arrivalEndedEvents!.push({
        detail: (e as CustomEvent).detail,
        atMs: Date.now(),
      });
    });

    // window.posthog is assigned exactly once, from initPostHog() (posthog.ts),
    // only when NEXT_PUBLIC_POSTHOG_KEY was present at BUILD time. A property
    // descriptor here observes that assignment whenever/if it happens and
    // wraps .capture so every call is recorded, regardless of asignment order.
    let _posthog: typeof w.posthog;
    Object.defineProperty(window, 'posthog', {
      configurable: true,
      get() {
        return _posthog;
      },
      set(value: typeof w.posthog) {
        _posthog = value;
        if (value && typeof value.capture === 'function') {
          const original = value.capture.bind(value);
          value.capture = (...args: unknown[]) => {
            const [event, properties] = args as [string, Record<string, unknown> | undefined];
            w.__phEvents!.push({ event, properties });
            return original(...args);
          };
        }
      },
    });
  });
}

/** Every `patina:arrival-ended` CustomEvent detail seen so far, in order. */
export async function arrivalEndedEvents(
  page: Page,
): Promise<Array<{ surface: string; how: string; cause?: string }>> {
  return page.evaluate(
    () =>
      (
        (
          window as unknown as {
            __arrivalEndedEvents?: Array<{ detail: unknown }>;
          }
        ).__arrivalEndedEvents ?? []
      ).map((e) => e.detail as { surface: string; how: string; cause?: string }),
  );
}

/** Every posthog.capture call seen so far (only ever non-empty in a build
 *  where NEXT_PUBLIC_POSTHOG_KEY was set — see arrival-lane.md "telemetry"). */
export async function posthogCaptures(
  page: Page,
): Promise<Array<{ event: string; properties: Record<string, unknown> | undefined }>> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __phEvents?: Array<{ event: string; properties: Record<string, unknown> | undefined }>;
        }
      ).__phEvents ?? [],
  );
}

/** Whether this build ever assigns `window.posthog` at all — the observable
 *  symptom of NEXT_PUBLIC_POSTHOG_KEY being absent at build time (posthog.ts
 *  `initPostHog()` returns before `window.posthog = posthog` when the key is
 *  empty). Polls briefly because `initPostHog()` itself runs from an effect,
 *  not synchronously at parse time. */
export async function analyticsEverInitializes(page: Page, waitMs = 2_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => typeof (window as unknown as { posthog?: unknown }).posthog !== 'undefined',
      undefined,
      { timeout: waitMs },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Counts POSTs to the `mark_arrival` RPC (mark-arrival.ts — fire-and-forget,
 * unconditional, fires on EVERY entry's end per CONTRACT §4b "written once per
 * entry on EVERY end"). This is the lane's build-environment-independent
 * proxy for "the report() funnel fired exactly once": unlike PostHog capture,
 * it is not gated behind an analytics key, so it is observable in this build
 * regardless of the POSTHOG_KEY gap documented in arrival-lane.md.
 */
export function countMarkArrivalCalls(page: Page): { get(): number } {
  let count = 0;
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    if (/\/rest\/v1\/rpc\/mark_arrival(\?|$)/.test(req.url())) count += 1;
  });
  return { get: () => count };
}

/** The card layer the engine mounts (`arrival.css` `.arr-card`). */
export const CARD_SELECTOR = '.arr-card';
/** The Skip control (`engine.ts` — `make('button', 'arr-skip', 'Skip arrival')`). */
export const SKIP_SELECTOR = '.arr-skip';

/** Settles the seeded designer's Desk Walkthrough so `WelcomeModal` is not
 *  `busy()` (host.ts `dialogOnScreen()`) — the same write desk-claims.spec.ts's
 *  beforeAll makes, for the same reason: the auth fixture's localStorage flag
 *  only covers help-system's OWN key, and the Desk gate additionally reads the
 *  persisted `profiles.help_state` record. */
export function settleDeskWalkthrough(designerId: string = SEEDED_DESIGNER): void {
  psqlRun(
    `UPDATE public.profiles
        SET help_state = jsonb_set(
          coalesce(help_state, '{}'::jsonb),
          '{tours,desk-walkthrough}',
          '{"completed": true}'::jsonb,
          true
        )
      WHERE id = '${designerId}'::uuid`,
  );
}

/**
 * A `page.route` handler that delays matching Supabase REST/RPC requests by
 * `delayMs` before letting them through untouched — used by the cold-load
 * lanes (CONTRACT §4b "delay `**\/rest/v1/projects*` and `**\/rest/v1/proposals*`
 * INDIVIDUALLY", the staggered Desk reads). Each matched request still
 * completes with the REAL server's response; only its arrival is deferred.
 */
export function delayedRoute(delayMs: number) {
  return async (route: Route): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  };
}
