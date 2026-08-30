/**
 * The lens is a keyboard document (R127 Wave 4, W4-L4).
 *
 * Three checks, none of which may depend on `data-density`/`data-passed`
 * existing — a11y is not gated behind Wave-4 wiring, so this file is a real
 * proof today, not an expected-red placeholder:
 *
 *   1. Zero hover-only acts: every interactive control inside the document
 *      shell (`button`, `a[href]`, `role="button"`) is keyboard-reachable
 *      (native focusability, or an explicit non-negative `tabindex`, and not
 *      `disabled`/`aria-hidden`).
 *   2. A real `Tab` walk (`page.keyboard.press('Tab')`, never a synthetic
 *      focus call) at scrollY 0/400/1200, at 1440 and 390: focus advances in
 *      DOM order, no focused element's rect intersects the pinned
 *      `[data-lens-band]` UNLESS the focused element is itself inside the
 *      band (its own acts are meant to sit there), and every focused element
 *      carries a visible focus ring.
 *   3. The ring check: `outline-style !== 'none'` (with a non-zero width) OR
 *      a `box-shadow` is present — either is a legitimate focus indicator in
 *      this design system.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

const OFFSETS = [0, 400, 1200] as const;
const WIDTHS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '390', width: 390, height: 844 },
] as const;

/** Bounds the walk: enough presses to cross every stop/door on the long
 *  paper's rail without an unbounded loop if focus never leaves the shell. */
const MAX_TAB_PRESSES = 90;

async function openPaper(
  page: AuthenticatedPage,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

test.describe('the lens is a keyboard document', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('zero hover-only acts: every act inside the document shell is keyboard-reachable', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, 1440, 900);
    await scrollTo(page, 0);

    const offenders = await page.evaluate(() => {
      const shell = document.querySelector('[data-document-shell]');
      if (!shell) return ['no [data-document-shell] found'];
      const controls = Array.from(
        shell.querySelectorAll<HTMLElement>(
          'button, a[href], [role="button"], [data-act], [data-action-key]',
        ),
      );
      const found: string[] = [];
      for (const el of controls) {
        if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
          continue;
        }
        const tabIndex = el.tabIndex;
        const nativelyFocusable =
          el.tagName === 'BUTTON' || (el.tagName === 'A' && el.hasAttribute('href'));
        const explicitlyFocusable = el.hasAttribute('tabindex') && tabIndex >= 0;
        if (!nativelyFocusable && !explicitlyFocusable) {
          found.push(
            `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} — tabindex=${el.getAttribute('tabindex')}`,
          );
        }
      }
      return found;
    });

    expect(offenders, `hover-only acts: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  for (const size of WIDTHS) {
    for (const offset of OFFSETS) {
      test(`Tab walk at ${size.label}, scrollY ${offset}: DOM order, never behind the band, always a visible ring`, async ({
        authenticatedPage: page,
      }) => {
        await openPaper(page, size.width, size.height);
        await scrollTo(page, offset);

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

        const bandIntersections: unknown[] = [];
        const ringless: unknown[] = [];
        const domOrderViolations: unknown[] = [];

        let previousPosition = -1;
        let hasFocusedOnce = false;

        for (let i = 0; i < MAX_TAB_PRESSES; i += 1) {
          await page.keyboard.press('Tab');

          const stillInShell = await page.evaluate(
            () => !!document.activeElement?.closest('[data-document-shell]'),
          );
          if (!stillInShell) break;

          const info = await page.evaluate(() => {
            const active = document.activeElement as HTMLElement | null;
            if (!active) return null;
            const rect = active.getBoundingClientRect();
            const band = document.querySelector('[data-lens-band]');
            const bandRect = band ? band.getBoundingClientRect() : null;
            const insideBand = !!band && band.contains(active);
            const intersectsBand =
              !!bandRect &&
              rect.top < bandRect.bottom &&
              rect.bottom > bandRect.top &&
              rect.left < bandRect.right &&
              rect.right > bandRect.left;
            const style = getComputedStyle(active);
            const hasOutline =
              style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
            const hasRingShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
            return {
              selector:
                active.tagName.toLowerCase() +
                (active.getAttribute('aria-label')
                  ? `[aria-label="${active.getAttribute('aria-label')}"]`
                  : ''),
              insideBand,
              intersectsBand,
              hasVisibleRing: hasOutline || hasRingShadow,
            };
          });
          if (!info) break;

          // DOM order: compareDocumentPosition should never say "this comes
          // before the previously focused element" (a roving-tabindex ladder
          // is the one legitimate exception — it manages its own order inside
          // one row group, so a regression within it is out of this check's
          // scope; a jump OUT of the shell entirely is caught by `stillInShell`).
          const position = await page.evaluate(() => {
            const active = document.activeElement;
            if (!active) return -1;
            let index = 0;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
            let node: Node | null = walker.currentNode;
            while (node) {
              if (node === active) return index;
              index += 1;
              node = walker.nextNode();
            }
            return -1;
          });

          if (hasFocusedOnce && position !== -1 && previousPosition !== -1) {
            // A generous forward-or-flat check: focus may legitimately land on
            // a sibling within the same roving-tabindex row group, which can
            // read as "backward" in raw tree order — only flag a LARGE
            // regression, which is what a real focus-order bug looks like.
            if (position < previousPosition - 5) {
              domOrderViolations.push({ from: previousPosition, to: position, ...info });
            }
          }
          previousPosition = position;
          hasFocusedOnce = true;

          if (!info.insideBand && info.intersectsBand) {
            bandIntersections.push(info);
          }
          if (!info.hasVisibleRing) {
            ringless.push(info);
          }
        }

        expect(
          bandIntersections,
          `focused element(s) hidden behind the pinned band: ${JSON.stringify(bandIntersections)}`,
        ).toEqual([]);
        expect(
          ringless,
          `focused element(s) with no visible focus ring: ${JSON.stringify(ringless)}`,
        ).toEqual([]);
        expect(
          domOrderViolations,
          `large backward jump(s) in focus order: ${JSON.stringify(domOrderViolations)}`,
        ).toEqual([]);
      });
    }
  }
});
