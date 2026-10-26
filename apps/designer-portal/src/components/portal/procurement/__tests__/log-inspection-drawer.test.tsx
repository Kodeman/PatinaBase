import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogInspectionDrawer } from '../log-inspection-drawer';

let mockRows: any[];
const mockComplete = jest.fn();
jest.mock('@patina/supabase', () => ({
  useReceivingInspections: () => ({ data: mockRows, isLoading: false }),
  useCreateReceivingInspection: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCompleteReceivingInspection: () => ({ mutateAsync: mockComplete, isPending: false }),
  useRetryReceivingFollowUp: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePoShipments: () => ({ data: [], isLoading: false }),
  useProcurementItems: () => ({ data: [{ id: 'line', name: 'Chair', quantity: 4, received_quantity: 2, project_id: 'job' }], isLoading: false }),
  useProjectRecordedStudio: () => ({ data: 'studio' }),
  useOrganizationMembers: () => ({ data: [] }),
  useStudioLocations: () => ({ data: [] }),
  useUser: () => ({ user: { id: 'designer' } }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectRooms: () => ({ data: [] }),
  useFfePlacementReceipts: () => ({ data: {} }),
}));
jest.mock('@/components/document/line-unfold/claim-clock', () => ({ ClaimClockLine: () => null }));
jest.mock('@/components/portal/toast-provider', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: true }) }));
jest.mock('@/lib/analytics/procurement-events', () => ({ procurementEvents: {} }));

it.each(['missing', 'completed'])('retains the opened receipt snapshot and draft when its native row is %s', (state) => {
  const original = { id: 'opened-receipt', outcome: null, notes: '', receiving_inspection_lines: [{ ffe_item_id: 'line', quantity_received: 2, received_quantity: 2 }] };
  mockRows = [original]; mockComplete.mockClear();
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'receipt-key' });
  const paper = () => <QueryClientProvider client={new QueryClient()}><LogInspectionDrawer open onOpenChange={jest.fn()} purchaseOrderId="po" inspectionId="opened-receipt" projectId="job" projectName="Cedar" poLabel="PO" vendorName="Maker" /></QueryClientProvider>;
  const view = render(paper());
  const notes = screen.getByRole('textbox', { name: /notes/i });
  fireEvent.change(notes, { target: { value: 'Keep my draft' } });
  mockRows = state === 'missing' ? [] : [{ ...original, outcome: 'clean', notes: 'Another actor completed this' }];
  view.rerender(paper());
  expect(notes).toHaveValue('Keep my draft');
  expect(screen.getByLabelText('Received quantity for Chair')).toHaveValue(2);
  expect(screen.getByLabelText('Received quantity for Chair')).toHaveAttribute('readonly');
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('This receipt changed');
  expect(screen.getByRole('button', { name: 'Complete inspection' })).toBeDisabled();
  expect(mockComplete).not.toHaveBeenCalled();
});
