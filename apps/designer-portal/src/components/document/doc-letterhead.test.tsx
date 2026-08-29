/**
 * The letterhead, after Wave 1 (D-6). The room in hand left for the rail head,
 * which prints `IN HAND · <ROOM>` and carries `Put down` (C-1). The letterhead
 * still ACCEPTS the two props — page.tsx passes them until W1-L4 rewires it —
 * but prints nothing from them, so the room is named once, on the rail.
 *
 * Wave 3 (R127): it sheds foot and takes the instruments' ledger into its own
 * column at ≥1180.
 *
 * W3-R4 (D-B26 as amended): the ledger's `auto` track was taking the width the
 * 40px title needed, and the title is an <input> — it clipped rather than
 * wrapped. The title now owns row 1 across BOTH tracks; the chip, the vitals
 * and the ledger share row 2, the ledger inside a BOUNDED
 * `minmax(18rem,24rem)`. jsdom evaluates no media queries, so the two-tier
 * contract is asserted on the source classes, the idiom region-head's own grid
 * tests use.
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

  it('prints the title at 32px on a phone and the Life Review’s 40px from sm, and closes on the mid rule', () => {
    const { container } = render(
      <DocLetterhead title="Vandersteen residence" vitals="Procurement" />,
    );
    const title = screen.getByRole('heading', { name: 'Vandersteen residence' });
    expect(title).toHaveClass(
      'font-heading',
      'text-[32px]',
      'sm:text-[40px]',
      'tracking-[-0.015em]',
      'text-[var(--text-primary)]',
    );
    const header = container.querySelector('header')!;
    expect(header).toHaveClass('doc-rule-mid');
    expect(header.className).not.toMatch(/border-b\b/);
    // W3-R4 — the pads as lengths, because the route root is 18px and a
    // spacing unit there is not the number the budget was measured in.
    expect(header).toHaveClass('pt-[14px]', 'pb-[18px]');
    expect(header.className).not.toMatch(/\bpb-[45]\b/);
  });

  it('gives the title its own row across both tracks, so the input is never starved (W3-R4)', () => {
    const { container } = render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
        client={<span data-testid="household">The Vandersteens</span>}
      />,
    );

    const grid = container.querySelector('header > .grid')!;
    // The two-track template: a left track that may collapse to zero and a
    // BOUNDED right one, so the ledger can no longer take the measure.
    expect(grid).toHaveClass(
      'grid-cols-1',
      'min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]',
    );
    expect(grid.className).not.toMatch(/min-\[1180px\]:grid-cols-\[1fr_auto\]/);
    // Gaps as lengths (18px root), not spacing units.
    expect(grid).toHaveClass('gap-x-[1.5rem]', 'gap-y-[0.5rem]');

    const titleBlock = screen.getByRole('heading', {
      name: 'Vandersteen residence',
    }).parentElement!;
    expect(Array.from(grid.children).indexOf(titleBlock)).toBe(0);
    expect(titleBlock).toHaveClass('min-w-0', 'min-[1180px]:col-span-2');

    // Row 2 left — the household chip and the vitals, below the title.
    const leftCell = screen.getByTestId('household').parentElement!;
    expect(Array.from(grid.children).indexOf(leftCell)).toBe(1);
    expect(leftCell).toHaveClass('min-w-0');
  });

  it('takes the instruments ledger into the row-2 right column at ≥1180 (W3)', () => {
    const { container } = render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement"
        instruments={<span data-testid="ledger">Message</span>}
      />,
    );

    const ledger = screen.getByTestId('ledger');
    expect(ledger).toBeVisible();
    // Inside the letterhead itself — not a row below it.
    expect(container.querySelector('header')!.contains(ledger)).toBe(true);
    // Third child: the title's row, the vitals cell, then the ledger — so at
    // ≥1180 it is the right-hand track of row 2, and below 1180 the single
    // column stacks it under the vitals, where the row mounted before.
    const grid = ledger.closest('.grid')!;
    expect(Array.from(grid.children).indexOf(ledger.parentElement!)).toBe(2);
    expect(ledger.parentElement).toHaveClass(
      'min-w-0',
      'min-[1180px]:justify-self-end',
    );
    // D-B20 — mounted at every width; no class removes it at one.
    expect(ledger.parentElement!.className).not.toMatch(/\bhidden\b/);
  });

  it('prints nothing for the ledger column when there are no instruments', () => {
    const { container } = render(
      <DocLetterhead title="Vandersteen residence" vitals="Procurement" />,
    );

    // The title's row and the vitals cell — and no third child.
    const grid = container.querySelector('header > .grid')!;
    expect(grid.children).toHaveLength(2);
  });

  it('keeps the lg mark, the household slot and the vitals it is given, on one measured row', () => {
    render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals="Procurement & Orders"
        client={<span data-testid="household">The Vandersteens</span>}
      />,
    );

    expect(screen.getByTestId('household')).toBeVisible();
    const vitals = screen.getByText('Procurement & Orders');
    expect(vitals).toBeVisible();
    // The e2e measures this element's height against the one-row budget.
    expect(vitals).toHaveAttribute('data-letterhead-vitals');
    expect(vitals).toHaveClass(
      'whitespace-nowrap',
      'overflow-hidden',
      'text-ellipsis',
    );
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
