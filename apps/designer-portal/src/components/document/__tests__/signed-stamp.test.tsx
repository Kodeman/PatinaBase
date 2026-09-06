/**
 * P-17 / R13 — the SIGNED stamp on the designer's ground.
 *
 * The eleven-state grammar is four dials and nothing else: border weight,
 * border pigment, word ink, rotation. This pins all four for the terminal
 * state, plus the two refusals the grammar names by hand — no fill, no shadow.
 */
import { render } from '@testing-library/react';

import {
  SignedStamp,
  SIGNED_STAMP_BORDER,
  SIGNED_STAMP_INK,
  SIGNED_STAMP_INNER_RULE,
} from '../signed-stamp';

describe('SignedStamp', () => {
  const stamp = () => {
    const { container } = render(<SignedStamp />);
    const mark = container.querySelector('[data-signed-stamp]');
    if (!mark) throw new Error('no stamp drawn');
    return mark as HTMLElement;
  };

  it('says the one word', () => {
    expect(stamp()).toHaveTextContent('SIGNED');
  });

  it('draws the border and the word in mocha, never sage', () => {
    const mark = stamp();
    expect(mark.style.getPropertyValue('--signed-stamp-border')).toBe(
      SIGNED_STAMP_BORDER,
    );
    expect(mark).toHaveClass('border-[color:var(--signed-stamp-border)]');
    expect(mark).toHaveClass(`text-[${SIGNED_STAMP_INK}]`);
    expect(SIGNED_STAMP_BORDER).toContain('var(--color-mocha)');
    expect(SIGNED_STAMP_INK).toBe('var(--color-mocha)');
    expect(mark.outerHTML).not.toContain('--color-sage');
  });

  it('doubles the rule — a terminal state carries the inner line', () => {
    const mark = stamp();
    expect(mark.style.getPropertyValue('--signed-stamp-rule')).toBe(
      SIGNED_STAMP_INNER_RULE,
    );
    const inner = mark.querySelector('[data-signed-stamp-inner]');
    expect(inner).not.toBeNull();
    expect(inner).toHaveClass('border-[color:var(--signed-stamp-rule)]');
    expect(inner).toHaveClass('inset-[2.5px]');
    expect(inner).toHaveAttribute('aria-hidden', 'true');
  });

  it('is stamped at the ceremony rotation', () => {
    expect(stamp()).toHaveClass('-rotate-[1.1deg]');
  });

  it('carries no fill and no shadow', () => {
    const mark = stamp();
    expect(mark).toHaveClass('bg-transparent');
    expect(mark.className).not.toMatch(/shadow/);
    expect(mark.style.backgroundColor).toBe('');
    expect(mark.style.boxShadow).toBe('');
  });
});
