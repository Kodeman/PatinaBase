import { render, screen } from '@testing-library/react';
import { MARGIN_KIND_INK, MarginItem } from './margin-item';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

const row = (overrides: Partial<MarginItemRow> = {}) =>
  ({
    kind: 'pulse',
    item_id: 'pulse-1',
    title: 'Weekly pulse',
    detail: 'Draft ready to send',
    anchor_kind: 'letterhead',
    anchor_id: null,
    created_at: '2026-08-10T12:00:00Z',
    ...overrides,
  }) as unknown as MarginItemRow;

describe('MarginItem', () => {
  it('publishes its unfold state so a caller can tell open from closed', () => {
    const { rerender } = render(
      <MarginItem row={row()} open={false} onToggle={jest.fn()} targetId="document-pulse-control-desktop">
        <p>Pulse body</p>
      </MarginItem>,
    );

    const toggle = screen.getByRole('button', { name: /Weekly pulse/ });
    expect(toggle).toHaveAttribute('id', 'document-pulse-control-desktop');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <MarginItem row={row()} open onToggle={jest.fn()} targetId="document-pulse-control-desktop">
        <p>Pulse body</p>
      </MarginItem>,
    );

    expect(screen.getByRole('button', { name: /Weekly pulse/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Pulse body')).toBeInTheDocument();
  });

  it('is a Card off the paper — one stock, the card edge, no shadow', () => {
    // US-28 S1 (V20 U-Q12) retired the one --elevation-sheet token it wore;
    // US-28 S7 makes it a Card (L2): --paper-doc, 1px --card-edge, 2px radius.
    const { container } = render(<MarginItem row={row()} open={false} />);

    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass(
      'bg-[var(--paper-doc)]',
      'border-[var(--card-edge)]',
      'rounded-[2px]',
    );
    expect(chip).not.toHaveClass('doc-elevated');
    expect(chip.className).not.toMatch(/shadow/);
    expect(chip.getAttribute('style') ?? '').not.toMatch(/shadow/);
  });

  it('prints its kind as an ink word, with no pigment edge (V20 U-Q13)', () => {
    const { container } = render(<MarginItem row={row({ kind: 'money' } as Partial<MarginItemRow>)} open={false} />);

    const chip = container.firstElementChild as HTMLElement;
    expect(chip.getAttribute('style') ?? '').not.toMatch(/border-left/);
    // jsdom drops a var() colour from the inline style, so the ink is pinned
    // at the one constant every kind is printed in.
    expect(MARGIN_KIND_INK).toBe('var(--text-primary)');
  });

  it('prints where it is anchored — beside a region, or about the whole job', () => {
    // RF-03: `margin_items` only ever resolves a `line` anchor to an FF&E line
    // (00197), so a line anchor prints the Pieces region by name; a section or
    // letterhead anchor is about the document itself.
    const { rerender } = render(<MarginItem row={row()} open={false} />);
    expect(
      document.querySelector('[data-margin-anchor-line]'),
    ).toHaveTextContent('ABOUT THE WHOLE JOB');

    rerender(
      <MarginItem
        row={row({ anchor_kind: 'section', anchor_id: null })}
        open={false}
      />,
    );
    expect(
      document.querySelector('[data-margin-anchor-line]'),
    ).toHaveTextContent('ABOUT THE WHOLE JOB');

    rerender(
      <MarginItem
        row={row({ anchor_kind: 'line', anchor_id: 'ffe-1' })}
        open={false}
      />,
    );
    const anchor = document.querySelector('[data-margin-anchor-line]')!;
    expect(anchor).toHaveTextContent('BESIDE PIECES');
    // The rail's register: muted mono, never a pigment that fails on stock.
    expect(anchor).toHaveClass(
      'font-mono',
      'text-[11px]',
      'text-[var(--text-muted)]',
    );
  });

  it('claims no unfold state when no onToggle makes it expandable', () => {
    // Expandability is decided by the presence of onToggle, not by the row's
    // kind — MarginRail withholds it (only) for `time` rows, but the component
    // knows nothing about that.
    const { rerender } = render(<MarginItem row={row()} open={false} />);

    const toggle = screen.getByRole('button', { name: /Weekly pulse/ });
    expect(toggle).not.toHaveAttribute('aria-expanded');
    expect(toggle).toBeDisabled();

    // Same row kind, now given an onToggle: it becomes an expandable control.
    rerender(<MarginItem row={row()} open={false} onToggle={jest.fn()} />);

    const expandable = screen.getByRole('button', { name: /Weekly pulse/ });
    expect(expandable).toHaveAttribute('aria-expanded', 'false');
    expect(expandable).not.toBeDisabled();
  });
});
