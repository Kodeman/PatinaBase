/**
 * W3 fix — a tap never clicks through (US-14, CONTRACT §3 "Chrome in Acts 1–2 is inert", §4b
 * "A press during the wait … is swallowed once").
 *
 * On a touch screen the tap's `click` is its own input task after the `pointerup`, so a swallow
 * released on a 0 ms timer at `pointerup` lets that click land on the control under her finger.
 * The taps below:
 *
 *  - in Act 2 (the hold), on a control: the tap advances the run and the control never sees a click
 *  - during the ready wait, on a page held unmarked until ready (post-ship patch 1): on the Desk's
 *    skeleton, or on the Document's "Picking up…" over its hidden paper, the tap ends the wait and
 *    the page shown in its place never sees the tap's click
 *  - in Act 2, on the act (B4): the act is activated exactly once and nothing else sees a click —
 *    a tap's click is hit-tested after the act has gone home, so the run forwards the activation
 *
 * A click that reaches the page is read by a `document` capture listener (it runs after the
 * arrival's own window-capture listener, so a click the arrival swallowed never reaches it).
 *
 * The phone's click latency: a phone delivers the tap's click after its touchend is acknowledged
 * and the gesture recognised, hit-tested where the finger was at that moment. Headless Chromium's
 * scheduler runs that click ahead of a due 0 ms timer whenever a frame is pending, which it always
 * is while the arrival animates, so the race never shows here. The probe therefore holds each
 * trusted click at the window capture (installed before the app's listeners) and re-dispatches it
 * 50 ms later on `elementFromPoint` at the same point, as the device's hit test would. The act
 * test needs no latency: the act has gone home before any tap's click. `hasTouch` projects only
 * (`mobile-chrome`): `page.touchscreen` needs a touch context.
 */
import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import {
  ARRIVAL_PROJECT_ID,
  armE2EOptIn,
  installArrivalInstruments,
  arrivalEndedEvents,
  settleDeskWalkthrough,
  delayedRoute,
  waitForHold,
  CARD_SELECTOR,
} from './helpers';

const CONTROLS = 'a[href], button:not([disabled]), [role="button"], input, select, textarea, summary, label';

interface PageClick {
  tag: string;
  text: string;
  control: boolean;
  act: boolean;
}

/** Every click that reached the page below the window capture, with what it landed on; and the
 *  phone's click latency. */
async function installPageClickProbe(page: Page): Promise<void> {
  await page.addInitScript((controls) => {
    const w = window as unknown as { __pageClicks: PageClick[]; __tapClicks: number };
    w.__pageClicks = [];
    w.__tapClicks = 0;
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target instanceof Element ? e.target : null;
        const act = !!t?.closest('[data-part~="act"]');
        const control = !!t?.closest(controls);
        w.__pageClicks.push({
          tag: t ? t.tagName.toLowerCase() : String(e.target),
          text: (t?.closest(controls)?.textContent ?? '').trim().slice(0, 60),
          control,
          act,
        });
        // Keep the page where it is if a stray click does get through: the assertion reports it.
        if (control && !act) e.preventDefault();
      },
      true,
    );
    window.addEventListener(
      'click',
      (e) => {
        if (!e.isTrusted) return;
        w.__tapClicks += 1;
        e.stopImmediatePropagation();
        e.preventDefault();
        const { clientX: x, clientY: y } = e;
        window.setTimeout(() => {
          const at = document.elementFromPoint(x, y) ?? document.documentElement;
          at.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true, cancelable: true, composed: true, view: window, detail: 1, button: 0, clientX: x, clientY: y,
            }),
          );
        }, 50);
      },
      true,
    );
  }, CONTROLS);
}

async function pageClicks(page: Page): Promise<PageClick[]> {
  return page.evaluate(() => (window as unknown as { __pageClicks?: PageClick[] }).__pageClicks ?? []);
}

/** The taps' own (trusted) clicks the probe held: an empty `pageClicks` means a swallow only if
 *  the tap made a click at all. */
async function tapClicks(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __tapClicks?: number }).__tapClicks ?? 0);
}

/**
 * The centre of the first control inside `root` that would take a hit there if nothing were inert:
 * inside the viewport, clear of the act, Skip and the MobileBar, and topmost at its centre.
 */
async function controlUnderRoot(
  page: Page,
  root: string,
): Promise<{ x: number; y: number; label: string } | null> {
  return page.evaluate(
    ({ root, controls }) => {
      const host = document.querySelector(root);
      if (!host) return null;
      const avoid = [
        ...Array.from(document.querySelectorAll('[data-part~="act"], .arr-skip, [data-testid="mobile-bar"]')),
      ].map((el) => el.getBoundingClientRect());
      const inside = (r: DOMRect, x: number, y: number) =>
        x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
      const probe = document.createElement('style');
      probe.textContent = ':is(:root, #arr-hit-probe) *{pointer-events:auto!important}';
      document.head.appendChild(probe);
      try {
        for (const el of Array.from(host.querySelectorAll<HTMLElement>(controls))) {
          if (el.closest('[data-arr], [data-part~="act"]')) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (x < 1 || y < 1 || x > window.innerWidth - 1 || y > window.innerHeight - 1) continue;
          if (avoid.some((a) => inside(a, x, y))) continue;
          const at = document.elementFromPoint(x, y);
          if (!at || !(at === el || el.contains(at))) continue;
          return { x, y, label: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"` };
        }
        return null;
      } finally {
        probe.remove();
      }
    },
    { root, controls: CONTROLS },
  );
}

test.describe('A tap never clicks through', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test.skip(({ hasTouch }) => !hasTouch, 'a touch-screen tap needs a hasTouch project');

  test('a tap on a control in Act 2 advances the run and the control never sees a click', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await installPageClickProbe(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await waitForHold(page);

    const target = await controlUnderRoot(page, '[data-arrival="document"]');
    expect(target, 'a control of the Document lies under the card in the hold').not.toBeNull();
    test.info().annotations.push({ type: 'tapped', description: target!.label });

    await page.touchscreen.tap(target!.x, target!.y);

    await expect
      .poll(async () => (await arrivalEndedEvents(page)).filter((e) => e.surface === 'document').at(-1)?.how, {
        timeout: 10_000,
      })
      .toBe('input');
    await page.waitForTimeout(500);
    expect((await pageClicks(page)).filter((c) => c.control)).toEqual([]);
    expect(page.url()).toMatch(new RegExp(`/doc/${ARRIVAL_PROJECT_ID}$`));
  });

  // Post-ship patch 1 — a hard Desk entry now holds its skeleton (no route root) until ready, with
  // the roster's read already in hand: the tap ends the wait, the roster prints in the skeleton's
  // place before the tap's click is hit-tested, and that click is swallowed.
  test('a tap on the held Desk skeleton ends the wait, and the roster printed under her finger sees no click', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await installPageClickProbe(page);
    // The roster's own read answers at once; the Desk's other gating reads hold its ready mark back
    // (the staggered-reads patterns, play-desk.spec.ts), so the Desk stands held.
    for (const pattern of [
      '**/rest/v1/rpc/studio_boards_overview*',
      '**/rest/v1/project_unbilled_time*',
      '**/rest/v1/proposal_boards*',
      '**/rest/v1/project_notes*',
    ]) {
      await page.route(pattern, delayedRoute(3_000));
    }

    await page.goto('/desk', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains('arr-pre') &&
        !!document.querySelector('main[data-arrival-held="desk"]'),
      undefined,
      { timeout: 20_000, polling: 16 },
    );
    const spot = await page.evaluate(() => {
      const skeleton = document.querySelector(
        'main[data-arrival-held="desk"] [data-tour-anchor="desk-needs-your-hand"][aria-hidden]',
      );
      if (!skeleton) return null;
      const r = skeleton.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    expect(spot, 'the held Desk shows its skeleton').not.toBeNull();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.classList.contains('arr-pre') &&
          !document.querySelector('[data-arrival="desk"]'),
      ),
      'the tap lands while the Desk is still held',
    ).toBe(true);

    await page.touchscreen.tap(spot!.x, spot!.y);

    await expect(page.locator('html.arr-pre')).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator('[data-arrival="desk"]')).toHaveCount(1);
    await page.waitForTimeout(800);
    const under = await page.evaluate(
      ({ x, y, controls }) => {
        const control = document.elementFromPoint(x, y)?.closest(controls);
        return control ? `${control.tagName.toLowerCase()} "${(control.textContent ?? '').trim().slice(0, 40)}"` : 'no control';
      },
      { ...spot!, controls: CONTROLS },
    );
    test.info().annotations.push({ type: 'under her finger once the roster printed', description: under });
    expect(await tapClicks(page), 'the tap made its click').toBe(1);
    expect(await pageClicks(page), 'the tap’s click was swallowed').toEqual([]);
    expect(page.url()).toMatch(/\/desk$/);
    const events = await arrivalEndedEvents(page);
    expect(events).toEqual([{ surface: 'desk', how: 'declined', cause: 'busy' }]);
  });

  // Post-ship patch 1 — the Document holds its whole paper mounted, unmarked and hidden, behind
  // "Picking up…" until ready: a tap on that line ends the wait, the paper shows in place before the
  // tap's click is hit-tested, and that click is swallowed.
  test('a tap on the Document’s "Picking up…" ends the wait, and the paper shown under her finger sees no click', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await installPageClickProbe(page);
    // The row resolves at once; the ticket's plan read (usePlanRoom) holds the ready mark back.
    await page.route('**/rest/v1/plan_sheets*', delayedRoute(4_000));

    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains('arr-pre') &&
        !!document.querySelector('[data-arrival-held="document"]'),
      undefined,
      { timeout: 20_000, polling: 16 },
    );
    const line = page.getByText('Picking up…');
    await expect(line).toHaveCount(1);
    const box = await line.boundingBox();
    expect(box, 'the held Document shows its loading line').not.toBeNull();
    const spot = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    expect(
      await page.evaluate(
        () =>
          document.documentElement.classList.contains('arr-pre') &&
          !document.querySelector('[data-arrival="document"]'),
      ),
      'the tap lands while the paper is still held',
    ).toBe(true);

    await page.touchscreen.tap(spot.x, spot.y);

    await expect(page.locator('html.arr-pre')).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator('[data-arrival="document"]')).toHaveCount(1);
    await page.waitForTimeout(800);
    const under = await page.evaluate(
      ({ x, y, controls }) => {
        const control = document.elementFromPoint(x, y)?.closest(controls);
        return control ? `${control.tagName.toLowerCase()} "${(control.textContent ?? '').trim().slice(0, 40)}"` : 'no control';
      },
      { ...spot, controls: CONTROLS },
    );
    test.info().annotations.push({ type: 'under her finger once the paper showed', description: under });
    expect(await tapClicks(page), 'the tap made its click').toBe(1);
    expect(await pageClicks(page), 'the tap’s click was swallowed').toEqual([]);
    expect(page.url()).toMatch(new RegExp(`/doc/${ARRIVAL_PROJECT_ID}$`));
    const events = await arrivalEndedEvents(page);
    expect(events).toEqual([{ surface: 'document', how: 'declined', cause: 'busy' }]);
  });

  test('B4 on touch: a tap on the act in the hold activates it exactly once, and nothing else sees a click', async ({
    authenticatedPage: page,
  }) => {
    await armE2EOptIn(page);
    await installArrivalInstruments(page);
    await installPageClickProbe(page);
    await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
    await waitForHold(page);

    const act = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-arrival="document"] [data-part~="act"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    expect(act, 'the seeded Document has a band act').not.toBeNull();

    await page.touchscreen.tap(act!.x, act!.y);

    await expect
      .poll(async () => (await arrivalEndedEvents(page)).filter((e) => e.surface === 'document').at(-1)?.how, {
        timeout: 10_000,
      })
      .toBe('input');
    await page.waitForTimeout(800);
    const clicks = await pageClicks(page);
    expect(clicks.filter((c) => !c.act), 'no click lands beside the act').toEqual([]);
    expect(clicks.filter((c) => c.act), 'the act is activated exactly once').toHaveLength(1);
  });
});
