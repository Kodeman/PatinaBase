/**
 * W3 round 8 — the wait gesture in a real browser (US-14, CONTRACT §4e "The round-7 change gets a
 * real-browser proof"; arrival-mount.tsx `waitGesture` / `closeGesture`).
 *
 * On touch hardware her swipe's `pointerdown` comes before its `touchmove`: the pointerdown ends
 * the Desk's ready wait (`busy`), and the put-down row's landing waits for that press to tell. A
 * move or a `pointercancel` (the browser took it for a pan) is her scroll — the row never lands;
 * a lift is a tap — the row lands once the Desk is ready.
 *
 * Both tests put a Document down onto the Desk with Escape (the Document's own put-down,
 * page.tsx — the spine's "Put down document" link is desktop-only), which writes `pl-from-doc`
 * at the Desk's commit as put-down.spec.ts's link does. The Desk has not briefed this visit (the
 * fixture's sign-in landing declined `webdriver`), so its entry waits under `arr-pre`; the Desk's
 * gating reads are held back 3 s (touch-tap.spec.ts's pattern) so the gesture lands inside the
 * wait. The swipe is Chromium's own synthesized touch scroll (CDP `Input.synthesizeScrollGesture`,
 * `gestureSourceType: 'touch'`): touchstart → touchmove → pointercancel through the real input
 * pipeline, and the compositor scrolls the page. `hasTouch` projects only (`mobile-chrome`, a
 * Chromium engine — CDP is Chromium's).
 */
import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { seedWorkflowGateFixture, WORKFLOW_GATE_PROJECT_ID } from '../helpers/workflow-gate-fixture';
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

const ROW = `roster-line-${WORKFLOW_GATE_PROJECT_ID}`;
const DESK_READY = '[data-arrival="desk"][data-arrival-ready]';
const CONTROLS = 'a[href], button, [role="button"], input, select, textarea, summary, label';

/** Every element `scrollIntoView` was called on, and the pointer/touch inputs the window saw. */
async function installProbes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __scrollIntoViewCalls: string[]; __inputs: string[] };
    w.__scrollIntoViewCalls = [];
    w.__inputs = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoViewSpy(
      this: Element,
      ...args: Parameters<typeof orig>
    ) {
      w.__scrollIntoViewCalls.push(this.id || this.tagName);
      return orig.apply(this, args);
    };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchmove']) {
      window.addEventListener(
        type,
        (e) => {
          const name = type === 'touchmove' ? type : `${type}:${(e as PointerEvent).pointerType}`;
          if (w.__inputs[w.__inputs.length - 1] !== name) w.__inputs.push(name);
        },
        { capture: true, passive: true },
      );
    }
  });
}

async function scrollIntoViewCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __scrollIntoViewCalls?: string[] }).__scrollIntoViewCalls ?? [],
  );
}

async function inputs(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __inputs?: string[] }).__inputs ?? []);
}

async function deskEnds(page: Page) {
  return (await arrivalEndedEvents(page)).filter((e) => e.surface === 'desk');
}

/**
 * The Document plays and is skipped to rest; then Escape puts it down onto the Desk, whose
 * arrival waits with its root rendered and hidden. Returns once the root is there under `arr-pre`.
 */
async function putDownIntoTheWait(page: Page): Promise<void> {
  await armE2EOptIn(page);
  await installArrivalInstruments(page);
  await installProbes(page);

  await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
  await page.locator(SKIP_SELECTOR).click();
  await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
  await expect(page.locator('html.arr-on')).toHaveCount(0);
  // From here on, only the Desk's own inputs: the Skip click above was a mouse press.
  await page.evaluate(() => {
    (window as unknown as { __inputs: string[] }).__inputs = [];
  });

  for (const pattern of [
    '**/rest/v1/rpc/studio_boards_overview*',
    '**/rest/v1/project_unbilled_time*',
    '**/rest/v1/proposal_boards*',
    '**/rest/v1/project_notes*',
  ]) {
    await page.route(pattern, delayedRoute(3_000));
  }

  await page.keyboard.press('Escape');
  await page.waitForURL(/\/desk$/);
  await page.waitForFunction(
    () =>
      document.documentElement.classList.contains('arr-pre') &&
      !!document.querySelector('[data-arrival="desk"]'),
    undefined,
    { timeout: 20_000, polling: 16 },
  );
}

/** The centre of a line of the hidden Desk root that is no control, clear of the MobileBar. */
async function quietSpot(page: Page): Promise<{ x: number; y: number; label: string } | null> {
  return page.evaluate((controls) => {
    const host = document.querySelector('[data-arrival="desk"]');
    if (!host) return null;
    const bar = document.querySelector('[data-testid="mobile-bar"]')?.getBoundingClientRect();
    const candidates = [
      ...Array.from(host.querySelectorAll<HTMLElement>('[data-part~="head"]')),
      ...Array.from(host.querySelectorAll<HTMLElement>('h1, h2, p')),
    ];
    for (const el of candidates) {
      if (el.closest(controls)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 8) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 1 || y < 1 || x > window.innerWidth - 1 || y > window.innerHeight - 1) continue;
      if (bar && y >= bar.top - 4) continue;
      const at = document.elementFromPoint(x, y);
      if (!at || at.closest(controls) || !(at === el || el.contains(at))) continue;
      return { x, y, label: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"` };
    }
    return null;
  }, CONTROLS);
}

test.describe('The wait gesture on a touch screen', () => {
  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  test.skip(({ hasTouch }) => !hasTouch, 'a touch-screen gesture needs a hasTouch project');

  test('a swipe during the wait is her scroll: busy, the row never lands, the page stays where she left it', async ({
    authenticatedPage: page,
  }) => {
    await putDownIntoTheWait(page);
    const y0 = await page.evaluate(() => window.scrollY);

    const view = page.viewportSize()!;
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(view.width / 2),
        y: Math.round(view.height / 2),
        yDistance: -300,
        gestureSourceType: 'touch',
        speed: 800,
      });
    } finally {
      await cdp.detach();
    }
    const y1 = await page.evaluate(() => window.scrollY);
    const seen = await inputs(page);
    test.info().annotations.push(
      { type: 'inputs', description: seen.join(' → ') },
      { type: 'scrollY', description: `before ${y0}, after the swipe ${y1}` },
    );

    expect(seen[0], 'the swipe begins as a touch press').toBe('pointerdown:touch');
    expect(seen, 'the browser took the press for a pan').toContain('touchmove');
    expect(y1, 'her swipe scrolled the page').toBeGreaterThan(y0);
    await expect(page.locator('html.arr-pre')).toHaveCount(0);

    // The Desk becomes ready after its held reads land; a landing would run one frame later.
    await page.waitForSelector(DESK_READY, { timeout: 15_000 });
    await page.waitForTimeout(1_000);

    expect(await deskEnds(page)).toEqual([{ surface: 'desk', how: 'declined', cause: 'busy' }]);
    expect(await scrollIntoViewCalls(page)).not.toContain(ROW);
    const y2 = await page.evaluate(() => window.scrollY);
    test.info().annotations.push({ type: 'scrollY at rest', description: String(y2) });
    expect(Math.abs(y2 - y1), 'the page stays where her swipe left it').toBeLessThanOrEqual(4);

    // The ordinary Desk.
    expect(page.url()).toMatch(/\/desk$/);
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
    await expect(page.locator('html.arr-pre, html.arr-on')).toHaveCount(0);
    await expect(page.locator('[data-arrival="desk"]')).toBeVisible();
  });

  test('a tap during the wait declines busy, and the row lands once the Desk is ready', async ({
    authenticatedPage: page,
  }) => {
    await putDownIntoTheWait(page);
    const spot = await quietSpot(page);
    expect(spot, 'a line of the hidden Desk root that is no control').not.toBeNull();
    test.info().annotations.push({ type: 'tapped', description: spot!.label });
    expect(
      await page.evaluate(() => document.documentElement.classList.contains('arr-pre')),
      'the tap lands while the root is still hidden',
    ).toBe(true);

    await page.touchscreen.tap(spot!.x, spot!.y);
    await expect(page.locator('html.arr-pre')).toHaveCount(0, { timeout: 2_000 });
    const seen = await inputs(page);
    test.info().annotations.push({ type: 'inputs', description: seen.join(' → ') });
    expect(seen).toEqual(['pointerdown:touch', 'pointerup:touch']);

    await page.waitForSelector(DESK_READY, { timeout: 15_000 });
    await page.waitForFunction(
      (row) =>
        ((window as unknown as { __scrollIntoViewCalls?: string[] }).__scrollIntoViewCalls ?? []).includes(row),
      ROW,
      { timeout: 5_000 },
    );
    expect(await deskEnds(page)).toEqual([{ surface: 'desk', how: 'declined', cause: 'busy' }]);
    await expect(page.locator(`#${ROW}`)).toBeInViewport();
    await expect(page.locator(CARD_SELECTOR)).toHaveCount(0);
  });
});
