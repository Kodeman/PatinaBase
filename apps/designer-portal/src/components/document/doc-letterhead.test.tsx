/**
 * The letterhead, after Wave 1 (D-6). The room in hand left for the rail head,
 * which prints `IN HAND · <ROOM>` and carries `Put down` (C-1). The letterhead
 * still ACCEPTS the two props — page.tsx passes them until W1-L4 rewires it —
 * but prints nothing from them, so the room is named once, on the rail.
 */

import { render, screen } from '@testing-library/react';
import { DocLetterhead } from './doc-letterhead';

describe('the letterhead', () => {
  it('prints no room line, even when a room is in hand', () => {
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
      />,
    );

    expect(document.querySelector('[data-in-hand-room]')).toBeNull();
    expect(document.querySelector('[data-release-room]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Put down Living room' }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('In hand');
  });

  it('prints the title at the Life Review’s 40px and closes on the mid rule', () => {
    const { container } = render(
      <DocLetterhead title="Vandersteen residence" vitals="Procurement" />,
    );
    const title = screen.getByRole('heading', { name: 'Vandersteen residence' });
    expect(title).toHaveClass(
      'font-heading',
      'text-[40px]',
      'tracking-[-0.015em]',
      'text-[var(--text-primary)]',
    );
    const header = container.querySelector('header')!;
    expect(header).toHaveClass('doc-rule-mid');
    expect(header.className).not.toMatch(/border-b\b/);
  });

  it('keeps the lg mark, the household slot and the vitals it is given', () => {
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement & Orders"
        client={<span data-testid="household">The Vandersteens</span>}
      />,
    );

    expect(screen.getByTestId('household')).toBeVisible();
    expect(screen.getByText('Procurement & Orders')).toBeVisible();
    expect(document.querySelector('.strata-mark')).not.toBeNull();
  });

  it('carries no shadow (D4)', () => {
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
      />,
    );
    document.querySelectorAll('*').forEach((el) => {
      expect(el.className.toString()).not.toMatch(/shadow/);
    });
  });
});
