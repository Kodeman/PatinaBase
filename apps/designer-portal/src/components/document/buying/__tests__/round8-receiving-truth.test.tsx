import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivingBookPage } from '../../orders-book-receiving';
import { ReceivingCell } from '../../line-unfold/receiving-cell';
import { PurchaseArrival } from '../../purchases/purchase-arrival';

const po = { id: 'po-original', status: 'delivered', po_number: 'P02-ORIGINAL', project_id: 'job', vendor: { id: 'maker', name: 'Fictional maker' }, project: { id: 'job', name: 'Cedar' }, receiving_items: [{ quantity: 4, received_quantity: 1 }] };
const line = { id: 'line-original', project_id: 'job', name: 'Oak chair', quantity: 4, received_quantity: 1, status: 'ordered', purchase_order: po };
let mockOrders: any;
let mockInspections: any;
let mockClaims: any;
const mockCreate = jest.fn();
const mockRetry = jest.fn();
const mockComplete = jest.fn();
const mockFollowUp = jest.fn();
jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: () => mockOrders,
  useReceivingInspections: () => mockInspections,
  useDamageClaims: ({ state }: any) => state === 'drafted' ? mockClaims : { data: [], isLoading: false },
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn() }),
  useCreateReceivingInspection: () => ({ mutateAsync: mockCreate, isPending: false }),
  useCompleteReceivingInspection: () => ({ mutateAsync: mockComplete, isPending: false }),
  useRetryReceivingFollowUp: () => ({ mutateAsync: mockFollowUp, isPending: false }),
  useProcurementItems: () => ({ data: [line], isLoading: false }),
  usePoShipments: () => ({ data: [], isLoading: false }),
  useProjectRecordedStudio: () => ({ data: 'studio' }),
  useOrganizationMembers: () => ({ data: [] }),
  useStudioLocations: () => ({ data: [{ id: 'warehouse', label: 'Warehouse' }] }),
  useUser: () => ({ user: { id: 'designer' } }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectRooms: () => ({ data: [] }),
  useFfePlacementReceipts: () => ({ data: {} }),
}));
jest.mock('../exception-overlay', () => ({ ReceivingExceptions: () => <p>Native exception paths</p>, TrackClaimAct: () => null }));
jest.mock('../draft-review', () => ({ PurchaseOrderDrafts: () => null }));
jest.mock('../../line-unfold/claim-clock', () => ({ ClaimClockLine: () => null }));
jest.mock('../../line-unfold/install-act', () => ({ InstallAct: () => null }));
jest.mock('@/lib/document/ledger-summary', () => ({ receivingFrontMatter: () => [] }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: true }) }));
jest.mock('@/components/portal/toast-provider', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/analytics/procurement-events', () => ({ procurementEvents: { inspectionLogged: jest.fn(), damageClaimCreated: jest.fn() } }));

function book() {
  return <QueryClientProvider client={new QueryClient()}><ReceivingBookPage projectId="job" onOpenDocument={jest.fn()} /></QueryClientProvider>;
}
function openReceipt() {
  fireEvent.click(screen.getByRole('button', { name: 'Receive a delivery' }));
  fireEvent.change(screen.getByLabelText('Opened and checked?'), { target: { value: 'yes' } });
  fireEvent.change(screen.getByLabelText('Arrival location'), { target: { value: 'warehouse' } });
}
beforeEach(() => {
  mockOrders = { data: [po], isLoading: false, refetch: mockRetry };
  mockInspections = { data: [], isLoading: false };
  mockClaims = { data: [], isLoading: false };
  mockCreate.mockReset().mockResolvedValue({ inspection: { id: 'receipt-original' } });
  mockRetry.mockReset();
  mockComplete.mockReset().mockResolvedValue({ inspection: { id: 'receipt-pending', outcome: 'clean' } });
  mockFollowUp.mockReset().mockResolvedValue({});
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'receipt-key' });
});

it('partial delivery stays receivable on the original PO even after a clean inspection', () => {
  mockInspections.data = [{ id: 'first-delivery', outcome: 'clean', purchase_order: po }];
  render(book());
  expect(screen.getByRole('button', { name: 'Receive a delivery' })).toBeInTheDocument();
  expect(screen.getByText(/P02-ORIGINAL/)).toBeInTheDocument();
});

it('received count includes only this project and the last 30 days', () => {
  mockInspections.data = [
    { id: 'recent', outcome: 'clean', received_on: new Date().toISOString(), purchase_order: po },
    { id: 'old', outcome: 'clean', received_on: '2020-01-01', purchase_order: po },
    { id: 'other-project', outcome: 'clean', received_on: new Date().toISOString(), purchase_order: { ...po, project_id: 'other-job' } },
  ];
  render(book());
  const figure = screen.getByText('Received · last 30 days').parentElement!;
  expect(within(figure).getByText('1')).toBeInTheDocument();
});

it('pending receipt returns to its actual clicked completion opener', async () => {
  mockInspections.data = [{ id: 'pending', outcome: null, received_on: '2026-10-25', purchase_order: po, receiving_inspection_lines: [] }];
  render(book());
  const opener = screen.getByRole('button', { name: 'Complete inspection' });
  fireEvent.click(opener);
  within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }).focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(opener).toHaveFocus());
});

it.each(['book', 'line', 'purchase'])('%s paper returns to the actual clicked opener without prefocus', async (surface) => {
  if (surface === 'book') render(book());
  else if (surface === 'line') render(<ReceivingCell item={line} stampKind="ordered" openClaims={[]} />);
  else render(<PurchaseArrival item={line} purchase={{ id: 'purchase-original', payee_name: 'Dealer' } as any} projectId="job" projectName="Cedar" canEdit />);
  if (surface === 'purchase') fireEvent.click(screen.getByRole('button', { name: 'Arrange pickup or delivery' }));
  const opener = screen.getByRole('button', { name: surface === 'purchase' ? 'Record arrival' : 'Receive a delivery' });
  expect(document.body).toHaveFocus();
  fireEvent.click(opener);
  screen.getByRole('button', { name: 'Cancel' }).focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});

it('a partial damaged delivery sends original PO and line IDs, not an external event', async () => {
  render(book());
  openReceipt();
  fireEvent.change(screen.getByLabelText('Received quantity for Oak chair'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Condition of Oak chair'), { target: { value: 'damaged' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrderId: 'po-original', projectId: 'job', outcome: 'damaged', damagedFfeItemIds: ['line-original'], items: [expect.objectContaining({ ffeItemId: 'line-original', receivedQuantity: 2, condition: 'damaged' })] }));
});

it('a failed receipt keeps the current quantity and condition for retry', async () => {
  mockCreate.mockRejectedValueOnce(new Error('Receipt refused'));
  render(book()); openReceipt();
  fireEvent.change(screen.getByLabelText('Received quantity for Oak chair'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Condition of Oak chair'), { target: { value: 'damaged' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
  await screen.findByText('Receipt refused');
  expect(screen.getByLabelText('Received quantity for Oak chair')).toHaveValue(2);
  expect(screen.getByLabelText('Condition of Oak chair')).toHaveValue('damaged');
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
  expect(mockCreate.mock.calls[1][0]).toEqual(mockCreate.mock.calls[0][0]);
});

it('pending completion keeps the receipt snapshot and never receives twice', async () => {
  mockInspections.data = [{ id: 'receipt-pending', outcome: null, received_on: '2026-10-25', purchase_order: po, receiving_inspection_lines: [{ ffe_item_id: line.id, quantity_received: 1, received_quantity: 1 }] }];
  render(book());
  fireEvent.click(screen.getByRole('button', { name: 'Complete inspection' }));
  expect(screen.getByLabelText('Received quantity for Oak chair')).toHaveAttribute('readonly');
  fireEvent.click(screen.getAllByRole('button', { name: 'Complete inspection' }).at(-1)!);
  await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ inspectionId: 'receipt-pending', items: [expect.objectContaining({ ffeItemId: line.id, receivedQuantity: 1 })] })));
  expect(mockCreate).not.toHaveBeenCalled();
});

it('an external event without a native PO never offers a receiving inspection', () => {
  render(<ReceivingCell item={{ ...line, purchase_order: null, external_fulfilment_id: 'external', events: [{ kind: 'received' }] }} stampKind="ordered" openClaims={[]} />);
  expect(screen.queryByRole('button', { name: 'Receive a delivery' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('cold read refusal never prints empty receiving or claim counts', () => {
  mockOrders = { data: undefined, error: new Error('offline'), isLoading: false, refetch: mockRetry };
  render(book());
  expect(screen.getByRole('alert')).toHaveTextContent('counts are unavailable');
  expect(screen.queryByText('No deliveries awaiting receipt.')).not.toBeInTheDocument();
  expect(screen.queryByText('Open claims')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry receiving records' }));
  expect(mockRetry).toHaveBeenCalledTimes(1);
});

it('warm read refusal retains the mounted receipt and entered condition', () => {
  const view = render(book()); openReceipt();
  fireEvent.change(screen.getByLabelText('Condition of Oak chair'), { target: { value: 'damaged' } });
  const dialog = screen.getByRole('dialog');
  mockOrders = { ...mockOrders, error: new Error('offline') };
  view.rerender(book());
  expect(screen.getByRole('alert')).toHaveTextContent('Previously loaded records');
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(screen.getByLabelText('Condition of Oak chair')).toHaveValue('damaged');
});
