/**
 * US-19 F1 / R28 — the Order cell's PO reference is a real control that does
 * what `Open the order` does, so ⌘K's landing has a control to put focus on.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockOpenLedger = jest.fn();
jest.mock('../command-bar', () => ({
  openLedger: (...args: unknown[]) => mockOpenLedger(...args),
}));
jest.mock('../buying/ack-check', () => ({
  AckRecord: () => null,
  usePoAckSummary: () => ({ state: null, copy: null }),
}));
jest.mock('../purchases/purchase-fact', () => ({ PurchaseFact: () => null }));
jest.mock('../line-unfold/change-order', () => ({ ChangeOrderAct: () => null }));
jest.mock('@/components/portal/procurement/order-paper/riders', () => ({ PoRiders: () => null }));
jest.mock('../buying/draft-review', () => ({ PurchaseOrderDrafts: () => null }));

import { OrderCell } from '../line-unfold/order-cell';

const item = { id: 'line-sectional', vendor_name: 'Woodward & Sons' };

beforeEach(() => mockOpenLedger.mockClear());

describe('OrderCell — the PO is the Open the order control (R28)', () => {
  it('prints the PO as a focusable control that opens the order', async () => {
    render(
      <OrderCell
        item={item}
        po={{ id: 'po-188', po_number: 'WS-188', status: 'sent' }}
        reasons={[]}
        projectId="proj-chen"
      />,
    );
    const control = screen.getByRole('button', { name: 'Open the order, PO WS-188' });
    expect(control).toHaveTextContent('WS-188');
    expect(control).toHaveAttribute('data-po-control');
    control.focus();
    expect(control).toHaveFocus();

    fireEvent.click(control);
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'ledger',
        projectId: 'proj-chen',
        purchaseOrderId: 'po-188',
      }),
    );
  });

  it('prints no control before the line is ordered', () => {
    render(<OrderCell item={item} po={null} reasons={[]} projectId="proj-chen" />);
    expect(screen.getByText('Not yet ordered')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
