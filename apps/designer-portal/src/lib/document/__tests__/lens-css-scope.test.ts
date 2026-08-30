/**
 * R127 / W4-C1 — `[data-index-region]` is a TWO-PLACE attribute, and only one
 * of the two places may be styled.
 *
 * C-4 puts `data-index-region` on the rail ladder's stops (`spine/lens-ladder
 * .tsx`, both the pressable `<button>` and the unmounted `<div role="text">`)
 * as well as on the paper's region roots. The rail is a descendant of
 * `[data-document-shell]`, so any rule scoped to the shell reaches the ladder
 * too. That is how the OD-12 reserve leaked: `[data-document-shell]
 * [data-index-region] { min-block-size: var(--doc-quiet-reserve, 68px) }` gave
 * every ladder stop a 68px floor, which blows OD-14's derived segment floors
 * (45/45/112/60/45/29) past the 336px track at 1440.
 *
 * No stylelint config exists in this repo (see `shadow-gate.test.ts`), so this
 * suite is the only thing that can hold the scope. The rule: every selector in
 * globals.css that mentions `[data-index-region]` is prefixed by
 * `[data-document-paper]`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GLOBALS_CSS = join(__dirname, '../../../app/globals.css');

/** Strip `/* … *\/` comments so a selector quoted inside prose is not read as
 *  a rule. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every selector list in the sheet, paired with its 1-based line number in
 *  the ORIGINAL text (comments blanked, not removed, so lines still line up). */
function selectors(css: string): Array<{ line: number; selector: string }> {
  const blanked = css.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  const out: Array<{ line: number; selector: string }> = [];
  const rule = /([^{}();]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(blanked)) !== null) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    out.push({
      line: blanked.slice(0, match.index).split('\n').length,
      selector: selector.replace(/\s+/g, ' '),
    });
  }
  return out;
}

describe('R127 W4-C1 — the lens reserve never reaches the rail', () => {
  const css = readFileSync(GLOBALS_CSS, 'utf8');

  it('scopes every [data-index-region] rule to [data-document-paper]', () => {
    const offenders = selectors(css)
      .filter(({ selector }) => selector.includes('[data-index-region]'))
      .filter(({ selector }) => {
        // Every comma-separated arm must carry the paper ahead of the region
        // attribute — a shell-scoped or unscoped arm is the leak.
        return selector
          .split(',')
          .map((arm) => arm.trim())
          .filter((arm) => arm.includes('[data-index-region]'))
          .some((arm) => {
            const paper = arm.indexOf('[data-document-paper]');
            return paper < 0 || paper > arm.indexOf('[data-index-region]');
          });
      })
      .map(({ line, selector }) => `globals.css:${line} — ${selector}`);

    expect(offenders).toEqual([]);
  });

  it('finds the rules it is guarding (the gate is not vacuous)', () => {
    const guarded = selectors(css).filter(({ selector }) =>
      selector.includes('[data-index-region]'),
    );
    // The scroll-margin landing rule and the OD-12 reserve — two since D-B33
    // retired the OD-4 `@supports` block, never zero.
    expect(guarded.length).toBeGreaterThanOrEqual(2);
  });

  it('never scopes a [data-index-region] rule to the shell', () => {
    expect(withoutComments(css)).not.toMatch(
      /\[data-document-shell\][^{};]*\[data-index-region\]/,
    );
  });

  it('declares no content-visibility anywhere (D-B33)', () => {
    // OD-4's `content-visibility: auto` on `[data-passed]` measured CLS 0.8658
    // against a gate of exactly 0 (D-B29) and was deleted by OD-4's own
    // pre-agreed failure move. The property toggling is the shift, so a future
    // reader who reinstates it without a new ruling turns the gate red — this
    // says so before the browser has to.
    expect(withoutComments(css)).not.toMatch(/content-visibility\s*:/);
  });

  it('keeps the passed reserve token declared, unspent, for the OD-4 candidate', () => {
    // W4-C8's finding survives the deletion: whoever takes the candidate up
    // must not spend `--doc-quiet-reserve`, which every region root shadows on
    // itself — the same element a `[data-passed]` rule would match.
    expect(css).toContain('--doc-passed-reserve:');
  });
});
