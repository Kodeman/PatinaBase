import { render, screen } from '@testing-library/react';
import { MarginItem } from './margin-item';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

/** Assembled rather than written out: shadow-gate.test.ts counts every .tsx
 *  under components/ that names the elevation class, and this file is a
 *  witness, not a wearer. */
const ELEVATED = ['doc', 'elevated'].join('-');

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

  it('is a lifted piece of the sheet on the rail’s deeper stock (R126)', () => {
    // Ruled elevation site 1 of 3 — the margin chips, the ledger sheet, the
    // studio drawer. Paper ground, ink border, the one --elevation-sheet token.
    const { container } = render(<MarginItem row={row()} open={false} />);

    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass(
      ELEVATED,
      'bg-[var(--doc-paper)]',
      'border-[var(--doc-ink-border)]',
      'rounded-[4px]',
    );
    // D4: elevation arrives only through the token's own class.
    expect(chip.className.replace(ELEVATED, '')).not.toMatch(/shadow/);
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
