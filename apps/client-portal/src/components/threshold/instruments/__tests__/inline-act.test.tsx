import { render, screen } from '@testing-library/react';

import { INLINE_ACT_CLASS, InlineAct } from '../inline-act';

describe('InlineAct — a tertiary act inside a sentence', () => {
  it('renders an anchor at its in-page target', () => {
    render(
      <p>
        <InlineAct href="#wall">Finished work</InlineAct> waits for your acceptance.
      </p>,
    );

    const act = screen.getByRole('link', { name: 'Finished work' });
    expect(act).toHaveAttribute('href', '#wall');
    expect(act).toHaveAttribute('data-inline-act', '');
  });

  it('rests on a 1px oak rule, unconditionally', () => {
    expect(INLINE_ACT_CLASS).toContain('border-b-[var(--color-aged-oak)]');
    expect(INLINE_ACT_CLASS).not.toContain('scaleX');
    expect(INLINE_ACT_CLASS).not.toContain('hover:border-b-[var(--color-aged-oak)]');
  });

  it('keeps no control box and no type of its own', () => {
    expect(INLINE_ACT_CLASS).toContain('[font:inherit]');
    expect(INLINE_ACT_CLASS).toContain('[color:inherit]');
    expect(INLINE_ACT_CLASS).not.toMatch(/min-h-/);
    expect(INLINE_ACT_CLASS).not.toMatch(/min-w-/);
  });

  it('carries the house focus ring', () => {
    expect(INLINE_ACT_CLASS).toContain('focus-visible:outline-[var(--color-clay-ink)]');
    expect(INLINE_ACT_CLASS).toContain('focus-visible:outline-offset-2');
  });

  it('forwards the attributes its caller names', () => {
    render(
      <InlineAct href="#road" data-testid="pole-link" aria-label="The road">
        Procurement
      </InlineAct>,
    );

    expect(screen.getByTestId('pole-link')).toHaveAccessibleName('The road');
  });
});
