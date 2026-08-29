/**
 * CLS — the lens promotes with zero layout shift (R127 Wave 4, W4-L4).
 *
 * THE FALSIFIABLE SENTENCE (technical-design.md §6 sentence (c)): the
 * `layout-shift` PerformanceObserver entry type reports a cumulative score
 * of exactly 0 over a 30-step settled scroll, under BOTH motion registers.
 * OD-12's quiet reserve is the mechanism this proves: a region promoted from
 * `quiet` to `full` never shrinks below its own reserved height, so nothing
 * above or below it ever shifts.
 *
 * CHROMIUM ONLY (test-strategy, technical-design.md §6): `layout-shift` is a
 * Chromium-only `PerformanceObserver` entry type — Safari and Firefox do not
 * implement it, so there is no cross-engine form of this test to write.
 *
 * PRE-WAVE-4 REALITY: nothing on this branch promotes anything yet (no
 * `data-density`), so this test is really measuring "does scrolling the
 * static long paper itself shift layout" — it should read 0 today for the
 * same reason it must read 0 once the observer is wired: nothing may ever
 * move above the point already read. The number is printed on every run.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  '`layout-shift` is a Chromium-only PerformanceObserver entry type (technical-design.md §6, "test strategy"); there is no webkit or firefox form of this assertion',
);

const STEPS = 30;
/** Deep enough on the long paper to promote several quiet regions. */
const TOTAL_SCROLL = 2400;

async function measureCLS(
  page: AuthenticatedPage,
  reducedMotion: 'reduce' | 'no-preference',
): Promise<number> {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
  await scrollTo(page, 0);

  await page.evaluate(() => {
    const win = window as unknown as { __clsEntries: number[] };
    win.__clsEntries = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = (entry as unknown as { value: number }).value;
        win.__clsEntries.push(value);
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
  });

  const step = TOTAL_SCROLL / STEPS;
  for (let i = 1; i <= STEPS; i += 1) {
    await scrollTo(page, Math.round(step * i));
  }

  const entries: number[] = await page.evaluate(
    () => (window as unknown as { __clsEntries?: number[] }).__clsEntries ?? [],
  );
  return entries.reduce((sum, value) => sum + value, 0);
}

test.describe('CLS — zero layout shift over a settled scroll (falsifiable sentence (c))', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('no-preference: cumulative layout shift is 0 over a 30-step settled scroll', async ({
    authenticatedPage: page,
  }) => {
    const cls = await measureCLS(page, 'no-preference');
    console.log(`CLS (no-preference, ${STEPS} steps, ${TOTAL_SCROLL}px): ${cls}`);
    expect(cls).toBe(0);
  });

  test('reduced motion: cumulative layout shift is 0 over a 30-step settled scroll', async ({
    authenticatedPage: page,
  }) => {
    const cls = await measureCLS(page, 'reduce');
    console.log(`CLS (reduce, ${STEPS} steps, ${TOTAL_SCROLL}px): ${cls}`);
    expect(cls).toBe(0);
  });
});
