import { render, screen } from '@testing-library/react';
import { MarginItem } from './margin-item';
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

  it('claims no unfold state when it cannot unfold', () => {
    render(<MarginItem row={row({ kind: 'time' })} open={false} />);

    const toggle = screen.getByRole('button', { name: /Weekly pulse/ });
    expect(toggle).not.toHaveAttribute('aria-expanded');
    expect(toggle).toBeDisabled();
  });
});
