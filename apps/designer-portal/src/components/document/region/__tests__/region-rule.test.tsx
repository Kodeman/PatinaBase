import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@testing-library/react';
import { RegionRule } from '../region-rule';

const GLOBALS_CSS = join(__dirname, '../../../../app/globals.css');

/** `--x: value` from the :root block, so a recipe spelled through a token is
 *  compared on what it PAINTS rather than on how it is spelled. */
function resolveVars(css: string, value: string): string {
  let resolved = value;
  for (let hop = 0; hop < 8 && resolved.includes('var('); hop += 1) {
    resolved = resolved.replace(/var\((--[a-z0-9-]+)\)/g, (whole, name: string) => {
      const declaration = new RegExp(`^\\s*\\${name}\\s*:\\s*([^;]+);`, 'm').exec(css);
      return declaration ? declaration[1]!.trim() : whole;
    });
  }
  return resolved;
}

/** The declarations of one class in globals.css, whitespace-normalised and
 *  var-resolved, so the two recipes are compared on what they paint. */
function ruleBody(css: string, selector: string): string {
  const match = new RegExp(
    `^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  ).exec(css);
  if (!match) throw new Error(`${selector} is not declared in globals.css`);
  return match[1]!
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => resolveVars(css, line).replace(/\s+/g, ' '))
    .sort()
    .join('; ');
}

describe('RegionRule', () => {
  it('is presentational and hidden from the accessibility tree', () => {
    const { container } = render(<RegionRule />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveAttribute('aria-hidden', 'true');
    expect(rule).toHaveAttribute('role', 'presentation');
    expect(rule.textContent).toBe('');
  });

  it('is a Section by default: draws nothing at the head, and marks its region to close', () => {
    // US-28 S7 (uplift.md area 2): each region is a Section that CLOSES on its
    // own rule; the next region opens on that close, so the head draws
    // nothing. The default moves from `strong` to `mid` with intent: the
    // specimens now draw every region (approvals, schedule, money, mood boards,
    // care, prework) and none opens on a double rule.
    const { container } = render(<RegionRule />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveAttribute('data-rule-weight', 'mid');
    expect(rule).toHaveAttribute('data-region-rule');
    expect(rule).not.toHaveClass('doc-rule-strong');
    // The head is not the close: the old mid line at the head is gone.
    expect(rule).not.toHaveClass('doc-rule-mid');
    expect(rule.getAttribute('class')).toBeNull();
  });

  it('closes every region on the paper on a hairline with 48px below, at full measure (US-43 R3)', () => {
    // The close is drawn on the region the mark sits in, scoped to the paper,
    // so the Desk's own double rule (outside [data-document-paper]) is not a
    // region and closes nothing. Space groups; the charcoal --rule-mid close
    // is gone, so no charcoal edge sits within 48px above a double rule.
    const css = readFileSync(GLOBALS_CSS, 'utf8');
    const block = css.slice(css.indexOf('/* US-28 S7 document */'));
    expect(block).not.toBe(css);
    expect(ruleBody(block, '[data-document-paper] :has(> [data-region-rule])')).toBe(
      // Read inside the S7 block alone, so the close is pinned to the token
      // it spends rather than to a literal.
      [
        'border-bottom: 1px solid var(--hairline-strong)',
        'margin-bottom: 48px',
        'padding-bottom: 24px',
      ].join('; '),
    );
  });

  it('opens a movement on the double rule where a caller asks for it, and still closes', () => {
    const { container } = render(<RegionRule weight="strong" />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveClass('doc-rule-strong');
    expect(rule).toHaveAttribute('data-rule-weight', 'strong');
    expect(rule).toHaveAttribute('data-region-rule');
  });

  it('draws the movement rule at the pre-R126 .doc-region-rule recipe, exactly', () => {
    // The geometry, not just the class name: a 6px box, a 2px charcoal top and
    // a 1px rgba(44,41,38,.18) bottom — the rule a movement opens on.
    const css = readFileSync(GLOBALS_CSS, 'utf8');
    expect(ruleBody(css, '.doc-rule-strong')).toBe(
      ruleBody(css, '.doc-region-rule'),
    );
    expect(ruleBody(css, '.doc-rule-strong')).toBe(
      [
        'border-bottom: 1px solid rgba(44, 41, 38, 0.18)',
        'border-top: 2px solid #2C2926',
        'height: 6px',
      ].join('; '),
    );
  });

  it('takes a caller class alongside its own', () => {
    const { container } = render(<RegionRule weight="strong" className="mt-6" />);
    expect(container.firstElementChild).toHaveClass('doc-rule-strong', 'mt-6');
    const { container: plain } = render(<RegionRule className="mt-0" />);
    expect(plain.firstElementChild).toHaveClass('mt-0');
  });
});
