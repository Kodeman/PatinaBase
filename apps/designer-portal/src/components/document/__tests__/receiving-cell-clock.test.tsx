import { render, screen } from '@testing-library/react';
import { ReceivingCell } from '../line-unfold/receiving-cell';

jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({ LogInspectionDrawer: () => null }));
jest.mock('../buying/draft-review', () => ({ PurchaseOrderDrafts: () => null }));
jest.mock('../line-unfold/claim-clock', () => ({
  ClaimClockLine: ({ receivingInspectionId }: { receivingInspectionId?: string | null }) =>
    <p data-testid="receipt-clock">{receivingInspectionId ?? 'purchase-order'}</p>,
}));

const item = { purchase_order: { id: 'po-1', delivered_date: '2026-10-01' } };

it('prints one clock per drafted receipt, not per claim', () => {
  render(<ReceivingCell item={item} stampKind="damaged" openClaims={[
    { id: 'claim-1', state: 'drafted', receiving_inspection_id: 'receipt-1' },
    { id: 'claim-2', state: 'drafted', receiving_inspection_id: 'receipt-1' },
    { id: 'claim-3', state: 'drafted', receiving_inspection_id: 'receipt-2' },
    { id: 'claim-4', state: 'vendor_notified', receiving_inspection_id: 'receipt-3' },
  ]} />);
  expect(screen.getAllByTestId('receipt-clock').map(el => el.textContent)).toEqual(['receipt-1', 'receipt-2']);
});

it('keeps one PO fallback clock for unlinked drafted claims', () => {
  render(<ReceivingCell item={item} stampKind="damaged" openClaims={[
    { id: 'claim-1', state: 'drafted' },
    { id: 'claim-2', state: 'drafted', receiving_inspection_id: null },
  ]} />);
  expect(screen.getAllByTestId('receipt-clock').map(el => el.textContent)).toEqual(['purchase-order']);
});
