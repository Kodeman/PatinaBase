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
    `^\\${selector}\\s*\\{([^}]*)\\}`,
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

  it('opens a movement on the double rule by default', () => {
    // S1: the mockup draws NONE of the eleven other call sites (mood boards,
    // care, schedule, money, the approval document), so the default has to be
    // the rank they already had. `mid` is opt-in, at a site someone looked at.
    const { container } = render(<RegionRule />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveClass('doc-rule-strong');
    expect(rule).not.toHaveClass('doc-rule-mid');
    expect(rule).toHaveAttribute('data-rule-weight', 'strong');
  });

  it('draws the default at the pre-R126 .doc-region-rule recipe, exactly', () => {
    // The geometry, not just the class name: a 6px box, a 2px charcoal top and
    // a 1px rgba(44,41,38,.18) bottom. If the default is ever retuned, the
    // eleven unreviewed surfaces shift with it — so the recipe is pinned to the
    // one they were drawing before this direction touched them.
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

  it('takes the 1.5px charcoal rule where a caller asks for it', () => {
    const { container } = render(<RegionRule weight="mid" />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveClass('doc-rule-mid');
    expect(rule).not.toHaveClass('doc-rule-strong');
    expect(rule).toHaveAttribute('data-rule-weight', 'mid');
  });

  it('takes a caller class alongside its own', () => {
    const { container } = render(<RegionRule className="mt-6" />);
    expect(container.firstElementChild).toHaveClass('doc-rule-strong', 'mt-6');
  });
});
