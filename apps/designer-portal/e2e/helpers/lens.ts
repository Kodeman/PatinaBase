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

/** The document has stopped moving, as far as it is able to say so. */
export async function settle(page: Page): Promise<void> {
  await twoFrames(page);
  const publishes = await page.evaluate(
    (sel) => Boolean(document.querySelector(sel)?.hasAttribute('data-lens-settled')),
    SHELL,
  );
  if (!publishes) return;
  await page.waitForFunction(
    (sel) =>
      document.querySelector(sel)?.getAttribute('data-lens-settled') === 'true',
    SHELL,
    { timeout: 15_000 },
  );
  await twoFrames(page);
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
