/**
 * W3b — failure injection and the mutation guard (US-14, CONTRACT §5 P5,
 * B7-B9).
 *
 *  - P5: a foreign mutation mid-hold ends the run with `how:'mutation'` and
 *    leaves no inline override on the real headline the engine hid while its
 *    clone flew (`engine.ts` `hide(H)` / `end()`'s `saved` restoration)
 *  - B7: `arrival.css`'s own sentinel rule is stripped from the network
 *    response (not blocked wholesale — the rest of the page's styling must
 *    stay intact so the "ordinary page" it falls back to is the real one,
 *    not a broken one) → `cause:'sentinel'`
 *  - B8: `document.fonts.load` is patched to a promise that never resolves →
 *    `loadFaces()`'s own 600ms internal timeout still fires → `cause:'fonts'`
 *  - B9: `--arr-ok` is overridden to `0` via an inline style set before any
 *    app script runs (highest specificity, independent of B7's network
 *    vector) → `cause:'sentinel'`
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import {
  ARRIVAL_PROJECT_ID,
  armE2EOptIn,
  installArrivalInstruments,
  arrivalEndedEvents,
  settleDeskWalkthrough,
  CARD_SELECTOR,
} from './helpers';

test.describe('Arrival failure injection', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test('P5: a foreign mid-hold mutation ends the run and leaves no inline override on the real headline', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    // `hide(H)` (engine.ts) sets the real headline's inline `opacity`/
    // `transition` at compose start — on this route that lands well within
    // one `domcontentloaded`-to-next-script-line gap (the fixture's own
    // earlier /desk visit already warms data/fonts), so there is no reliable
    // pre-run vantage point from test script timing to snapshot a "before"
    // value; a read here already carries the override, every time. The
    // headline never carries any inline style outside the engine's own
    // touch (a plain server-rendered job-name line, Tailwind classes only),
    // so the falsifier is the restored value's own content, not equality to
    // an uncapturable snapshot.
    const headline = page.locator('[data-part~="headline"]').first();
    await expect(page.locator(CARD_SELECTOR)).toBeVisible({ timeout: 20_000 });

    // Well past compose into hold (Act 2) — the card is still up (HOLD_MS is
    // 10s) so this lands mid-hold, not mid-compose.
    await page.waitForTimeout(1_800);
    await expect(page.locator(CARD_SELECTOR)).toBeVisible();

    // A foreign body-level mutation — the `mb` MutationObserver in engine.ts
    // `watch()` declines on any added/removed node under `document.body`
    // that does not itself carry `data-arr`.
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.textContent = 'w3b-mutation-probe';
      probe.setAttribute('data-w3b-mutation-probe', '');
      document.body.appendChild(probe);
    });

    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0, { timeout: 3_000 });
    const styleAfter = await headline.getAttribute('style');
    // `hide(H)` had set inline `opacity`/`transition`; `end()`'s restoration
    // must return the real headline to its pre-run baseline — empty, since
    // nothing else in this markup sets an inline style on it — with no
    // leftover engine-authored override surviving the decline.
    expect(styleAfter ?? '').toBe('');
    expect(styleAfter ?? '').not.toContain('opacity: 0');
    expect(styleAfter ?? '').not.toContain('transition: none');

    await page.evaluate(() => {
      document.querySelector('[data-w3b-mutation-probe]')?.remove();
    });

    const events = await arrivalEndedEvents(page);
    expect(events.at(-1)).toMatchObject({ surface: 'desk', how: 'mutation' });
  });

  test('B7: arrival.css served with its sentinel rule stripped declines sentinel, ordinary page shows', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.route('**/*.css', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      // Strip only the sentinel declaration (`--arr-ok:1` /
      // `--arr-ok: 1`, whitespace-tolerant) — the rest of the page's real
      // stylesheet is served untouched, so "the ordinary page" this decline
      // falls back to is genuinely the real, styled page. `route.fetch()`
      // already decodes any content-encoding, so fulfilling with just
      // `contentType` (not the raw response headers, which would still claim
      // e.g. `content-encoding: gzip` on this now-plain-text body) avoids the
      // browser trying to gunzip an already-decoded payload.
      const stripped = body.replace(/--arr-ok\s*:\s*1\s*;?/g, '');
      await route.fulfill({
        status: response.status(),
        contentType: response.headers()['content-type'] ?? 'text/css',
        body: stripped,
      });
    });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    await expect(page.locator('[data-arrival="desk"]')).toBeVisible();

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'desk', how: 'declined', cause: 'sentinel' });
  });

  test('B8: document.fonts.load never resolving declines fonts after its own budget', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.addInitScript(() => {
      const fonts = document.fonts as unknown as { load: (f: string) => Promise<FontFace[]> };
      if (fonts) fonts.load = () => new Promise<FontFace[]>(() => {});
    });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    // BUDGET.FONTS_MS is 600ms internal to loadFaces(); give the ready-wait
    // plus that budget comfortable headroom.
    await page.waitForTimeout(2_500);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'desk', how: 'declined', cause: 'fonts' });
  });

  test('B9: --arr-ok overridden to 0 via inline style declines sentinel', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await page.addInitScript(() => {
      // Runs before any of the page's own scripts (and before hydration);
      // an inline style on `html` outranks the `:root{--arr-ok:1}` stylesheet
      // rule regardless of load order. An init script can run before the
      // parser has created `<html>`, so it waits for the element.
      const zero = (el: HTMLElement) => el.style.setProperty('--arr-ok', '0');
      if (document.documentElement) {
        zero(document.documentElement);
        return;
      }
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        observer.disconnect();
        zero(document.documentElement);
      }).observe(document, { childList: true });
    });

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    await expect(page.locator('[data-arrival="desk"]')).toBeVisible();

    const events = await arrivalEndedEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ surface: 'desk', how: 'declined', cause: 'sentinel' });
  });
});
