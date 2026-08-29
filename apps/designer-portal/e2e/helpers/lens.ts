/**
 * The lens's e2e waits (R127 Wave 3, W3-L5).
 *
 * Every geometric claim the lens makes — the band's declared 56px, SC1's first
 * head, SC2's band bottom, the landing clearance — is a claim about the page
 * AFTER it has stopped moving. The document publishes exactly that:
 * `[data-document-shell][data-lens-settled="true"]`, written imperatively by
 * the density rAF (OD-3, §3) once velocity has been under 40px/frame for
 * 120ms.
 *
 * Until Wave 4 attaches that observer the attribute does not exist, and its
 * ABSENCE is not "unsettled" — it is "nothing publishes settling yet". So the
 * wait is: two animation frames always (the browser has laid out and painted),
 * then, only where the shell actually carries the attribute, wait for it to
 * read `true`.
 *
 * There is no `waitForTimeout` in this module, deliberately: a fixed sleep
 * either makes the suite slow or makes it lie, and both were how the earlier
 * document specs went flaky (`e2e-baseline.md` §4).
 */
import type { Page } from '@playwright/test';

const SHELL = '[data-document-shell]';

/** One layout + one paint. `requestAnimationFrame` twice is the shortest wait
 *  that guarantees the style the second frame reads is the one the first
 *  frame's write produced. */
export async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * The document has stopped moving, as far as it is able to say so.
 *
 * (W4-L4 extension.) Three tiers, tried in order, because the density
 * observer that will eventually own both signals is a Wave-4 lane this file
 * does not implement:
 *   1. `[data-document-shell][data-lens-settled="true"]` — the DOM's own
 *      attribute (OD-3, §3), cheapest to read, correct once the density rAF
 *      exists.
 *   2. `window.__lensSettled?.()` — the Promise form §3 says is "exposed
 *      unconditionally" once the observer attaches; a second path to the
 *      same fact for a caller that reads the window before the attribute
 *      exists, or for a build where the attribute write and the promise
 *      resolution race.
 *   3. Neither publisher exists yet (pre-Wave-4 code, or a page with no
 *      lens): the two frames already awaited above are the whole wait — the
 *      original W3-L5 behaviour, unchanged.
 */
export async function settle(page: Page): Promise<void> {
  await twoFrames(page);

  const publishesAttr = await page.evaluate(
    (sel) => Boolean(document.querySelector(sel)?.hasAttribute('data-lens-settled')),
    SHELL,
  );
  if (publishesAttr) {
    await page.waitForFunction(
      (sel) =>
        document.querySelector(sel)?.getAttribute('data-lens-settled') === 'true',
      SHELL,
      { timeout: 15_000 },
    );
    await twoFrames(page);
    return;
  }

  const hasSettledFn = await page.evaluate(
    () => typeof (window as unknown as { __lensSettled?: unknown }).__lensSettled === 'function',
  );
  if (hasSettledFn) {
    await page.evaluate(() =>
      (window as unknown as { __lensSettled: () => Promise<true> }).__lensSettled(),
    );
    await twoFrames(page);
    return;
  }
}

/** Put the window at `y` and wait for the document to settle there. */
export async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await settle(page);
}

/**
 * Walk to `target` in 40px steps, settling at each — the reader's own pace, and
 * the only way to exercise the lens's velocity gate without asserting against a
 * scroll the engine coalesced into one jump.
 */
export async function scrollSteps(
  page: Page,
  target: number,
  step = 40,
): Promise<void> {
  const from = await page.evaluate(() => window.scrollY);
  const direction = target >= from ? 1 : -1;
  const stepCount = Math.floor(Math.abs(target - from) / step);
  for (let i = 1; i <= stepCount; i += 1) {
    await scrollTo(page, from + direction * step * i);
  }
  await scrollTo(page, target);
}

/**
 * The rail's own budget instrument (W4-L4, `lens-rail-budget.spec.ts`).
 *
 * `labels` is every distinct VISIBLE label on `[data-document-spine]` —
 * never a value or count line beside it — so the gate ("3 fixed head labels
 * + one per stop + one 'Filed with this job' + one per door") can compare an
 * EMPIRICAL count against its own formula rather than trust a hand-typed
 * ceiling a later wave could silently grow past. `stops` and `doors` are
 * read from the same DOM the labels came from, so the formula and the
 * measurement can never drift apart.
 *
 * Deliberately excluded: the "Put down document" exit link (studio chrome,
 * not a map of the paper), every ladder VALUE span (the fact beside a
 * stop's name — `region-head.tsx`'s own printed figures are the paper's,
 * not the rail's, per SP-08), and room sub-rungs (`[data-room-chip]`,
 * Override 2) — the rail budget's own formula is "stops + doors", never
 * rooms, and a room held open must not move this gate.
 */
export interface RailCensus {
  labels: string[];
  stops: number;
  doors: number;
}

export async function railCensus(page: Page): Promise<RailCensus> {
  return page.evaluate(() => {
    const spine = document.querySelector('[data-document-spine]');
    if (!spine) return { labels: [], stops: 0, doors: 0 };

    const labels: string[] = [];
    const push = (el: Element | null | undefined) => {
      const text = el?.textContent?.replace(/\s+/g, ' ').trim();
      if (text) labels.push(text);
    };

    // Head furniture: the household line, then the stage phrase's own
    // top/bottom spans (doc-spine.tsx) — one to three labels, never a value.
    const head = spine.querySelector('[data-spine-head]');
    push(
      head?.querySelector(
        ':scope > p:first-of-type:not([data-spine-stage-phrase]):not([data-spine-room-in-hand])',
      ),
    );
    head
      ?.querySelectorAll('[data-spine-stage-phrase] > span')
      .forEach((span) => push(span));

    // The ladder: one label per stop — the NAME span only (`lens-ladder.tsx`'s
    // `body` fragment always renders the name as its first child, mounted or
    // not), never the value/count line beside it.
    const ladder = spine.querySelector('[data-lens-ladder]');
    ladder
      ?.querySelectorAll('[data-index-region] > span:first-child')
      .forEach((span) => push(span));
    const stops = ladder?.querySelectorAll('[data-index-region]').length ?? 0;

    // "Filed with this job" — the doors' own head line, always rendered
    // (even with zero doors, OD-8): the first `<p>` of the ladder's OTHER
    // top-level div (the track carries `[data-lens-track]`).
    push(ladder?.querySelector(':scope > div:not([data-lens-track]) > p:first-child'));

    // The doors themselves, one label each.
    ladder?.querySelectorAll('[data-ladder-door]').forEach((door) => push(door));
    const doors = ladder?.querySelectorAll('[data-ladder-door]').length ?? 0;

    return { labels, stops, doors };
  });
}

/**
 * D-B21's instrument for falsifiable sentence (d): every distinct text
 * string whose nearest painted ancestor has computed `opacity > 0`,
 * `visibility: visible` and `display !== 'none'` — never a check of opacity
 * itself, because the yielded phrase is `opacity: 0` under EITHER motion
 * register and must stay excluded from the set under both (deviations.md
 * D-B21: "opacity itself is never the assertion").
 *
 * Scoped to `root` (default `[data-document-shell]`) so a caller can compare
 * just the band, just the rail, or the whole shell between motion registers
 * at the same scroll offset.
 */
export async function visibleWordSet(
  page: Page,
  root = '[data-document-shell]',
): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const rootEl = document.querySelector(rootSelector);
    if (!rootEl) return [];

    const isPainted = (el: Element): boolean => {
      let node: Element | null = el;
      while (node) {
        const style = getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) <= 0
        ) {
          return false;
        }
        node = node.parentElement;
      }
      return true;
    };

    const words: string[] = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (text && parent && isPainted(parent)) {
        words.push(text);
      }
      node = walker.nextNode();
    }
    return words;
  }, root);
}
