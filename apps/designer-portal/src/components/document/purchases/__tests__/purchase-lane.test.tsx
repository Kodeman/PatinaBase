import { fireEvent, render, screen } from '@testing-library/react';
import { PurchaseChoices } from '../purchase-choices';
import { PurchaseArrival } from '../purchase-arrival';

const mockDrawer = jest.fn();
let mockReceipts: any[] = [];
let mockLoading = false;
jest.mock('@patina/supabase', () => ({
  useReceivingInspections: () => ({ data: mockReceipts, isLoading: mockLoading }),
}));
jest.mock('../purchase-record-form', () => ({ PurchaseRecordForm: ({ initialLine }: any) => <p>Record for {initialLine.id}</p> }));
jest.mock('../../line-unfold/record-payment', () => ({ RecordPaymentForm: ({ purchaseOrderId }: any) => <p>Payment for {purchaseOrderId}</p> }));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: (props: any) => { mockDrawer(props); return props.open ? <p>Shared receiving</p> : null; },
}));
jest.mock('../../line-unfold/install-act', () => ({ InstallAct: () => <button>Mark installed</button> }));

const item = { id: 'line-1', name: 'Oak table', quantity: 2, status: 'ordered', received_quantity: 0 };
const purchase = { id: 'purchase-1', status: 'recorded', payee_name: 'Madison dealer' } as any;
const arrival = (over = {}) => render(<PurchaseArrival item={{ ...item, ...over }} purchase={purchase} projectId="project-1" projectName="Cedar house" canEdit />);

beforeEach(() => { mockReceipts = []; mockLoading = false; });

describe('external-purchase lane', () => {
  it('renders three distinct buying choices and states their consequences', () => {
    const prepare = jest.fn();
    render(<PurchaseChoices projectId="project-1" item={item} canPrepare canRecord purchaseOrderId={null} isPatinaCatalog={false} onPrepare={prepare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare a PO' }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Nothing is sent until you press Send/)).toBeInTheDocument();
    expect(screen.getByText('Nothing will be sent or ordered.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record a payment' })).toBeDisabled();
    expect(screen.getByText(/Records money paid against an existing PO, not another purchase/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record a purchase already made' }));
    expect(screen.getByText('Record for line-1')).toBeInTheDocument();
  });

  it.each(['Picked up', 'Delivered'])('a recorded purchase proceeds to pickup and arrival, linked as %s', (method) => {
    arrival();
    expect(screen.queryByText(/Log the ack|Mark in production/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Arrange pickup or delivery' }));
    fireEvent.click(screen.getByRole('radio', { name: method }));
    fireEvent.click(screen.getByRole('button', { name: 'Record arrival' }));
    expect(screen.getByText('Shared receiving')).toBeInTheDocument();
    expect(mockDrawer).toHaveBeenLastCalledWith(expect.objectContaining({
      open: true, purchaseOrderId: null, studioPurchaseId: 'purchase-1',
      arrivalMethod: method === 'Picked up' ? 'picked_up' : 'delivered',
      receiptItems: [expect.objectContaining({ ffeItemId: 'line-1', quantity: 2 })],
    }));
  });

  it('does not treat a pending physical receipt as inspected or offer a duplicate arrival', () => {
    mockReceipts = [{ id: 'receipt-pending', inspection_pending: true, outcome: null }];
    arrival({ received_quantity: 2, status: 'delivered' });
    expect(screen.getByRole('status')).toHaveTextContent('inspection pending');
    expect(screen.queryByRole('button', { name: 'Mark installed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arrange pickup or delivery' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Complete inspection' }));
    expect(mockDrawer).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, inspectionId: 'receipt-pending', studioPurchaseId: 'purchase-1' }));
  });

  it('records a payment against the existing PO rather than creating another purchase', () => {
    render(<PurchaseChoices projectId="project-1" item={item} canPrepare={false} canRecord={false} purchaseOrderId="po-existing" isPatinaCatalog={false} onPrepare={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record a payment' }));
    expect(screen.getByText('Payment for po-existing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare a PO' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record a purchase already made' })).toBeDisabled();
  });

  it('keeps read-only and damaged arrivals from offering installation or editing', () => {
    mockReceipts = [{ id: 'receipt-damaged', inspection_pending: false, outcome: 'damaged' }];
    render(<PurchaseArrival item={{ ...item, received_quantity: 2, status: 'delivered' }} purchase={purchase} projectId="project-1" projectName="Cedar house" canEdit={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Review its condition');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers installation only after a complete clean inspected arrival', () => {
    mockReceipts = [{ inspection_pending: false, outcome: 'clean' }];
    arrival({ received_quantity: 2, status: 'delivered' });
    expect(screen.getByRole('button', { name: 'Mark installed' })).toBeInTheDocument();
  });
});
