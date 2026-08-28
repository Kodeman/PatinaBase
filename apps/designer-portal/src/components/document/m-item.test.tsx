/**
 * R126 — the margin chip as a lifted piece of the sheet: the paper ground and
 * the ink border on the rail's deeper stock, plus the one elevation token
 * (ruled site 1 of 3). The dark tone (the Orders book) takes none of it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { MItem } from './m-item';

const SOURCE = readFileSync(join(__dirname, 'm-item.tsx'), 'utf8');

const ACCENT = { border: 'var(--color-dusty-blue)', label: 'var(--color-dusty-blue)' };

describe('MItem', () => {
  it('lifts the paper chip off the rail stock', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} />,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass(
      'doc-elevated',
      'border-[var(--doc-ink-border)]',
      'bg-[var(--doc-paper)]',
      'rounded-[4px]',
    );
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

  it('leaves the dark tone unlifted', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} tone="dark" />,
    );
    expect(container.firstElementChild).not.toHaveClass('doc-elevated');
  });

  it('writes no shadow literal (D4 — elevation only via doc-elevated)', () => {
    const { container } = render(
      <MItem kindLine="Vendor · Aug 13" title="Crate has landed" accent={ACCENT} />,
    );
    const classes = (container.firstElementChild as HTMLElement).className;
    expect(classes.replace(/doc-elevated/g, '')).not.toMatch(/shadow/);
  });
});
