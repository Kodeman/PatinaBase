import { fireEvent, render, screen } from '@testing-library/react';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { NeedActSheetProvider, useNeedActSheet } from '../need-act-sheet';

const mockPreview = jest.fn();
jest.mock('../../po-preview', () => ({ PoPreview: (props: unknown) => { mockPreview(props); return <p>Existing PO preview</p>; } }));
jest.mock('@patina/supabase', () => ({ usePurchaseOrders: () => ({ data: [{
  id: 'po-1', vendor: { name: 'Hewn', orders_email: 'orders@hewn.example' },
}] }) }));
jest.mock('../../overlays/doc-sheet', () => ({ DocSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('../../outbound/ready-to-send-sheet', () => ({ ReadyToSendSheet: () => null }));
jest.mock('../record-payment-sheet', () => ({ RecordPaymentSheet: () => null }));
jest.mock('../act-sheets', () => ({ InvoiceReminderSheet: () => null, PoChaseSheet: () => null, ProposalFollowUpSheet: () => null, ReleaseOrderSheet: () => null }));

function Buyer() {
  const sheet = useNeedActSheet();
  return <button onClick={() => sheet.open({ projectId: 'project-1', need: {
    kind: 'po_unsent', releasedOrder: true, recordId: 'po-1',
  } } as DeskNeed)}>Review and send</button>;
}
it('opens the existing PoPreview for the buyer’s released PO, never a send mutation', () => {
  render(<NeedActSheetProvider><Buyer /></NeedActSheetProvider>);
  expect(mockPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
  expect(screen.getByText('Existing PO preview')).toBeInTheDocument();
  expect(mockPreview).toHaveBeenCalledWith(expect.objectContaining({
    open: true, purchaseOrderId: 'po-1', vendorName: 'Hewn', vendorEmailHint: 'orders@hewn.example',
  }));
});
