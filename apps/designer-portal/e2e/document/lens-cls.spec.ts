/**
 * CLS — the lens promotes with zero layout shift (R127 Wave 4, W4-L4/D-B29).
 *
 * THE FALSIFIABLE SENTENCE (technical-design.md §6 sentence (c)): the
 * `layout-shift` PerformanceObserver entry type reports a cumulative score
 * of exactly 0 over a 30-step settled scroll, under BOTH motion registers.
 * OD-12's quiet reserve is the mechanism this proves: a region promoted from
 * `quiet` to `full` never shrinks below its own reserved height, so nothing
 * above or below it ever shifts.
 *
 * D-B29 (amends the first cut of this file): the original instrument
 * installed its observer with `buffered: true` right after `scrollTo(0)`,
 * which REPLAYS every shift since navigation — on `4915583c2` the reported
 * ~0.06 accrued while the paper was still loading (D-B28's probe:
 * `scrollHeight` climbed from 2353 to 10200 during the very scroll being
 * measured), not a movement the lens caused. The fix: observe from the
 * SETTLED s0 only.
 *   1. Precondition: `openPaper → settle → scrollTo(0) → settle → quiet()`
 *      (D-B28's network-quiet helper), then `window.__lensSettled` must
 *      exist (D-B15/D-B19) — asserted up front so a server without W4 code
 *      fails loudly instead of quietly measuring the wrong build. On the
 *      current `:3000` (still serving Wave 3) this is EXPECTED-RED.
 *   2. `await window.__lensSettled()` at s0, THEN a `buffered: false`
 *      observer attaches — nothing earlier is ever replayed into the sum.
 *   3. Entries with `hadRecentInput` are skipped (the web-vitals
 *      convention); a programmatic `window.scrollTo` sets no recent input,
 *      so the filter cannot hide a real lens-caused shift.
 *   4. The gate is `toBe(0)` exactly, never a tolerance: density promotion
 *      happens at/beyond the 240px lookahead line (D-B16, below the
 *      viewport) and the band is sticky and excluded, so true 0 is
 *      reachable by construction — a tolerance would admit a real shift.
 *      A nonzero reading is reported as a bug: each surviving entry names
 *      the scroll STEP it landed on and its `sources[]` (node + rects).
 *   5. Initial-load CLS (navigation → `quiet()`, `buffered: true`) is
 *      measured separately and printed, NEVER gated — paper-loading layout
 *      is pre-existing and outside sentence (c), but the number stays
 *      visible so a regression there cannot hide behind the scroll gate.
 *
 * CHROMIUM ONLY (test-strategy, technical-design.md §6): `layout-shift` is a
 * Chromium-only `PerformanceObserver` entry type — Safari and Firefox do not
 * implement it, so there is no cross-engine form of this test to write.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle, quiet } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  '`layout-shift` is a Chromium-only PerformanceObserver entry type (technical-design.md §6, "test strategy"); there is no webkit or firefox form of this assertion',
);

const STEPS = 30;
/** Deep enough on the long paper to promote several quiet regions. */
const TOTAL_SCROLL = 2400;

interface ClsShift {
  step: number;
  value: number;
  sources: string[];
  chrome: boolean;
}

interface ClsResult {
  initialLoadCls: number;
  /** The PAPER's shift — D-B29's gate, exactly 0. */
  scrollCls: number;
  /** The rail's and the band's own reflow — D-B34: printed, and gated BY CAUSE
   *  rather than by size (see `uncausedChrome`). */
  chromeCls: number;
  shifts: ClsShift[];
  /** D-B34 — chrome entries that landed on a step where neither the reading
   *  stop nor line 2's sentence changed. Chrome may reflow BECAUSE the reader
   *  moved to a new stop or the band turned its sentence; it may not reflow for
   *  any other reason, and an unexplained chrome shift is a real finding. */
  uncausedChrome: ClsShift[];
}

type WindowWithCls = Window & {
  __lensSettled?: () => Promise<true>;
  __initialClsEntries?: number[];
  __initialClsObserver?: PerformanceObserver;
  __scrollClsEntries?: Array<{ value: number; sources: string[]; chrome: boolean }>;
};

async function measureCLS(
  page: AuthenticatedPage,
  reducedMotion: 'reduce' | 'no-preference',
): Promise<ClsResult> {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
  await scrollTo(page, 0);
  await settle(page);

  const hasLensSettled = await page.evaluate(
    () => typeof (window as WindowWithCls).__lensSettled === 'function',
  );
  expect(
    hasLensSettled,
    'window.__lensSettled does not exist on the served build — this instrument requires W4-L1 code (expected-red on a server still serving Wave 3, D-B29)',
  ).toBe(true);

  // buffered:true, installed BEFORE quiet(): measures navigation -> quiet,
  // the initial-load figure D-B29 wants reported, never gated.
  await page.evaluate(() => {
    const win = window as WindowWithCls;
    win.__initialClsEntries = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as unknown as { value: number; hadRecentInput: boolean };
        if (e.hadRecentInput) continue;
        win.__initialClsEntries!.push(e.value);
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
    win.__initialClsObserver = observer;
  });

  await quiet(page);

  const initialLoadCls = await page.evaluate(() => {
    const win = window as WindowWithCls;
    win.__initialClsObserver?.disconnect();
    return (win.__initialClsEntries ?? []).reduce((sum, v) => sum + v, 0);
  });

  await page.evaluate(() => (window as WindowWithCls).__lensSettled!());

  // buffered:false, installed only now: the settled s0 is the origin.
  await page.evaluate(() => {
    const win = window as WindowWithCls;
    win.__scrollClsEntries = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as unknown as {
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{
            node?: Element | null;
            previousRect: DOMRectReadOnly;
            currentRect: DOMRectReadOnly;
          }>;
        };
        if (e.hadRecentInput) continue;
        // W4 item 12 · WHOSE shift. D-B29's 0 is a claim about the PAPER —
        // H5's sentence is "a region above the frame growing from its reserve
        // is the layout shift the design forbids". The rail and the band are
        // chrome that OD-14 requires to change as the reader moves (the
        // current stop's segment carries its room rungs; line 2 names the
        // worst standing exception), and the band's own height is a declared
        // 56px constant, so neither can move a pixel of paper. An entry every
        // one of whose sources is chrome is counted and PRINTED separately
        // rather than folded into the paper's number, where it would make the
        // gate assert the opposite of OD-14.
        // W4-N-02 — chrome is the RAIL or the BAND, named. The earlier form
        // ("anything not inside the paper") swept in the mobile bar, the
        // sheets and every portal, so a sheet opening under the reader would
        // have been excused as chrome. Those are paper-side: they move what she
        // is reading, and they belong in the gated number.
        const isChrome = (node: Element | null | undefined) => {
          if (!node) return false;
          return Boolean(
            node.closest('[data-lens-band]') ||
              node.closest('[data-document-spine]') ||
              node.closest('nav[aria-label="This paper"]'),
          );
        };
        const chrome =
          (e.sources ?? []).length > 0 &&
          (e.sources ?? []).every((s) => isChrome(s.node as Element | null));
        const sources = (e.sources ?? []).map((s) => {
          const node = s.node as HTMLElement | null | undefined;
          const tag = node?.tagName?.toLowerCase() ?? 'unknown';
          const id = node?.id ? `#${node.id}` : '';
          const className =
            node?.className && typeof node.className === 'string'
              ? `.${node.className.trim().split(/\s+/).join('.')}`
              : '';
          return (
            `${tag}${id}${className} — ` +
            `${JSON.stringify(s.previousRect)} -> ${JSON.stringify(s.currentRect)}`
          );
        });
        win.__scrollClsEntries!.push({ value: e.value, sources, chrome });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: false } as PerformanceObserverInit);
  });

  const readCause = () =>
    page.evaluate(() => ({
      stop:
        document
          .querySelector('[data-document-shell]')
          ?.getAttribute('data-reading-index') ?? null,
      sentence:
        document.querySelector('[data-lens-sentence]')?.textContent?.trim() ??
        null,
    }));

  const step = TOTAL_SCROLL / STEPS;
  const countAtStep: number[] = [0];
  // D-B34 — the steps on which the chrome had a REASON to reflow.
  const causeSteps = new Set<number>();
  let lastCause = await readCause();
  for (let i = 1; i <= STEPS; i += 1) {
    await scrollTo(page, Math.round(step * i));
    const cause = await readCause();
    if (cause.stop !== lastCause.stop || cause.sentence !== lastCause.sentence) {
      causeSteps.add(i);
    }
    lastCause = cause;
    const count = await page.evaluate(
      () => (window as WindowWithCls).__scrollClsEntries?.length ?? 0,
    );
    countAtStep[i] = count;
  }

  const rawEntries = await page.evaluate(
    () => (window as WindowWithCls).__scrollClsEntries ?? [],
  );

  const shifts: ClsShift[] = rawEntries.map((entry, index) => {
    let step = STEPS;
    for (let i = 1; i <= STEPS; i += 1) {
      if (index < countAtStep[i]!) {
        step = i;
        break;
      }
    }
    return {
      step,
      value: entry.value,
      sources: entry.sources,
      chrome: entry.chrome,
    };
  });

  const scrollCls = rawEntries
    .filter((entry) => !entry.chrome)
    .reduce((sum, entry) => sum + entry.value, 0);
  const chromeCls = rawEntries
    .filter((entry) => entry.chrome)
    .reduce((sum, entry) => sum + entry.value, 0);
  // A chrome shift on a step where the stop and the sentence both held is
  // chrome moving for no stated reason — not excused.
  const uncausedChrome = shifts.filter(
    (shift) => shift.chrome && !causeSteps.has(shift.step),
  );
  return { initialLoadCls, scrollCls, chromeCls, shifts, uncausedChrome };
}

test.describe('CLS — zero layout shift over a settled scroll (falsifiable sentence (c))', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('no-preference: cumulative layout shift is 0 from the settled s0, over a 30-step scroll', async ({
    authenticatedPage: page,
  }) => {
    const { initialLoadCls, scrollCls, chromeCls, shifts, uncausedChrome } =
      await measureCLS(page, 'no-preference');
    console.log(`CLS (initial load, buffered, navigation -> quiet): ${initialLoadCls}`);
    console.log(`CLS (scroll, unbuffered from settled s0, ${STEPS} steps, ${TOTAL_SCROLL}px): ${scrollCls}`);
    console.log(`CLS (scroll, CHROME only — rail segments + band line 2): ${chromeCls}`);
    const detail = shifts
      .map((s) => `  step ${s.step} (value ${s.value}): ${JSON.stringify(s.sources)}`)
      .join('\n');
    expect(
      scrollCls,
      shifts.length ? `layout shift(s) during the scroll:\n${detail}` : undefined,
    ).toBe(0);
    expect(
      uncausedChrome.map((s) => `step ${s.step}: ${JSON.stringify(s.sources)}`),
      'D-B34 — chrome reflowed on a step where neither the reading stop nor line 2 changed',
    ).toEqual([]);
  });

  test('reduced motion: cumulative layout shift is 0 from the settled s0, over a 30-step scroll', async ({
    authenticatedPage: page,
  }) => {
    const { initialLoadCls, scrollCls, chromeCls, shifts, uncausedChrome } =
      await measureCLS(page, 'reduce');
    console.log(`CLS (initial load, buffered, navigation -> quiet): ${initialLoadCls}`);
    console.log(`CLS (scroll, unbuffered from settled s0, ${STEPS} steps, ${TOTAL_SCROLL}px): ${scrollCls}`);
    console.log(`CLS (scroll, CHROME only — rail segments + band line 2): ${chromeCls}`);
    const detail = shifts
      .map((s) => `  step ${s.step} (value ${s.value}): ${JSON.stringify(s.sources)}`)
      .join('\n');
    expect(
      scrollCls,
      shifts.length ? `layout shift(s) during the scroll:\n${detail}` : undefined,
    ).toBe(0);
    expect(
      uncausedChrome.map((s) => `step ${s.step}: ${JSON.stringify(s.sources)}`),
      'D-B34 — chrome reflowed on a step where neither the reading stop nor line 2 changed',
    ).toEqual([]);
  });
});
