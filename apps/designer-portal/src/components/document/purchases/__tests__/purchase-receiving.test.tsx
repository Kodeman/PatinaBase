import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PurchaseArrival } from '../purchase-arrival';

const mockCreate = jest.fn();
const mockComplete = jest.fn();
let mockReceipts: any[] = [];
jest.mock('@patina/supabase', () => ({
  useReceivingInspections: () => ({ data: mockReceipts, isLoading: false }),
  useCreateReceivingInspection: () => ({ mutateAsync: mockCreate, isPending: false }),
  useCompleteReceivingInspection: () => ({ mutateAsync: mockComplete, isPending: false }),
  useRetryReceivingFollowUp: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePoShipments: () => ({ data: [] }),
  useProjectRecordedStudio: () => ({ data: 'studio-1' }),
  useOrganizationMembers: () => ({ data: [{ user_id: 'member-1', status: 'active', profiles: { full_name: 'Morgan' } }] }),
  useStudioLocations: () => ({ data: [{ id: 'location-1', label: 'Warehouse' }] }),
  useUser: () => ({ user: { id: 'member-1' } }),
  useProcurementItems: () => ({ data: [] }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectRooms: () => ({ data: [] }),
  useFfePlacementReceipts: () => ({ data: undefined }),
}));
jest.mock('../../line-unfold/install-act', () => ({ InstallAct: () => null }));
jest.mock('../../line-unfold/claim-clock', () => ({ ClaimClockLine: () => null }));
jest.mock('@/components/portal/toast-provider', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/analytics/procurement-events', () => ({ procurementEvents: { inspectionLogged: jest.fn(), damageClaimCreated: jest.fn() } }));
jest.mock('framer-motion', () => {
  const R = require('react');
  return {
    AnimatePresence: ({ children }: any) => children,
    motion: { div: R.forwardRef(({ initial, animate, exit, transition, children, ...rest }: any, ref: any) => <div ref={ref} {...rest}>{children}</div>) },
  };
});

const item = { id: 'line-1', name: 'Oak table', quantity: 2, status: 'ordered', received_quantity: 0 };
const purchase = { id: 'purchase-1', payee_name: 'Madison dealer', status: 'recorded' } as any;
const renderArrival = (over = {}) => render(<PurchaseArrival item={{ ...item, ...over }} purchase={purchase} projectId="project-1" projectName="Cedar house" canEdit />);
beforeEach(() => {
  mockReceipts = [];
  mockCreate.mockReset().mockResolvedValue({ inspection: { id: 'receipt-1', outcome: 'clean' }, damageClaimCreated: false });
  mockComplete.mockReset().mockResolvedValue({ inspection: { id: 'receipt-pending', outcome: 'clean' }, damageClaimCreated: false });
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'receipt-key-1' });
});

it.each(['Picked up', 'Delivered'])('links a %s purchase arrival through the real shared receiving drawer', async (method) => {
  renderArrival();
  fireEvent.click(screen.getByRole('button', { name: 'Arrange pickup or delivery' }));
  fireEvent.click(screen.getByRole('radio', { name: method }));
  fireEvent.click(screen.getByRole('button', { name: 'Record arrival' }));
  fireEvent.change(screen.getByLabelText('Opened and checked?'), { target: { value: 'yes' } });
  fireEvent.change(screen.getByLabelText('Arrival location'), { target: { value: 'location-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    purchaseOrderId: null, studioPurchaseId: 'purchase-1', arrivalMethod: method === 'Picked up' ? 'picked_up' : 'delivered',
    items: [expect.objectContaining({ ffeItemId: 'line-1', receivedQuantity: 2, condition: 'good' })],
  }));
  expect(mockComplete).not.toHaveBeenCalled();
});

it('completes the pending purchase receipt using its snapshot without receiving quantities twice', async () => {
  mockReceipts = [{ id: 'receipt-pending', outcome: null, receiving_inspection_lines: [
    { ffe_item_id: 'line-1', received_quantity: 1, quantity_received: 1 },
  ] }];
  renderArrival({ received_quantity: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Complete inspection' }));
  expect(screen.getByLabelText('Received quantity for Oak table')).toHaveValue(1);
  expect(screen.getByLabelText('Received quantity for Oak table')).toHaveAttribute('readonly');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Complete inspection' }));
  await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
  expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
    inspectionId: 'receipt-pending', outcome: 'clean',
    items: [expect.objectContaining({ ffeItemId: 'line-1', receivedQuantity: 1 })],
  }));
  expect(mockCreate).not.toHaveBeenCalled();
});
