/**
 * R126 — the Orders-book vendor thread's card: the paper ground and the ink
 * border, and NO elevation. The one elevation token is spent at three sites,
 * and this is not one of them — the rail chip (margin-item.tsx) is.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { MItem } from './m-item';

const SOURCE = readFileSync(join(__dirname, 'm-item.tsx'), 'utf8');

const ACCENT = { border: 'var(--color-dusty-blue)', label: 'var(--color-dusty-blue)' };

describe('MItem', () => {
  it('prints the paper card on the sheet, unlifted', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} />,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass(
      'border-[var(--doc-ink-border)]',
      'bg-[var(--doc-paper)]',
      'rounded-[4px]',
    );
    expect(chip).not.toHaveClass('doc-elevated');
  });

  it('prints the kind line mono at 11px', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} />,
    );
    const kindLine = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === 'Vendor · Aug 13',
    )!;
    expect(kindLine).toHaveClass('font-mono', 'text-[11px]');
  });

  it('paints the studio’s own hand in clay-ink, not the base pigment', () => {
    // jsdom drops `var()` inline styles, so the token is read at the source.
    expect(SOURCE).toContain("ownVoice ? 'var(--color-clay-ink)' : accent.label");
  });

  it('leaves the dark tone unlifted too', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} tone="dark" />,
    );
    expect(container.firstElementChild).not.toHaveClass('doc-elevated');
  });

  it('writes no shadow of any kind (D4)', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} />,
    );
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(
      /shadow/,
    );
  });
});
