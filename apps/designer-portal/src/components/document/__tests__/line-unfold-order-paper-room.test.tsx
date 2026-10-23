jest.mock('@/components/document/destinations/planned-destination', () => ({ PlannedDestination: () => null }));
/**
 * T-60j F19: ORDER on a line in a room. The line's row carries its room as the
 * PostgREST join `{id, name}`; the order paper takes a room name, so the unfold
 * hands it the name (an object reached generateSidemark's `.split` and crashed).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSetLabel = jest.fn();
const mockOrderPaper = jest.fn();

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('../line-unfold/money-out-cell', () => ({ MoneyOutCell: () => null }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@patina/supabase', () => ({
  useReceivingInspections: () => ({ data: [] }),
  useSetFfeItemLabel: () => ({ mutateAsync: mockSetLabel, isPending: false }),
  itemLabelRefusal: (message: string) => message.includes('already uses') ? message : null,
  useVendorQuotes: () => ({ data: [] }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordFfeInstalled: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendor: () => ({ data: { id: 'vendor-1', name: 'Winfield Workroom' } }),
  useSetFfeLineCommercials: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindVendorMatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendors: () => ({ data: { data: [] } }),
  useProductPrices: () => ({ data: undefined }),
  usePoCostLines: () => ({ data: [] }),
  useUpsertPoCostLine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioIdentity: () => ({ data: undefined }),
  useStudioContacts: () => ({ data: [] }),
  usePoShipments: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  usePoAcknowledgments: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSampleRequests: () => ({ data: [] }),
  useRecordSampleRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMarkSampleReturned: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/components/document/buying/com-piece', () => ({ ComPiece: () => null }));
jest.mock('@/components/portal/procurement/order-paper', () => ({
  OrderPaper: (props: unknown) => {
    mockOrderPaper(props);
    return null;
  },
}));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => null,
}));
jest.mock('../po-preview', () => ({ PoPreview: () => null, LogAckInline: () => null }));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../line-unfold/item-pictures', () => ({ ItemPictures: () => null }));
jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAssignLineRoom: () => ({ mutate: jest.fn() }),
}));

import { LineUnfold } from '../line-unfold';

const item = {
  id: 'line-1',
  doc_code: 'LR-01',
  name: 'Roman shades, six windows',
  quantity: 6,
  status: 'specified',
  item_type: 'fixed',
  product_id: null,
  unit_price_cents: 65000,
  line_total_cents: 390000,
  trade_price_cents: 41000,
  vendor_id: 'vendor-1',
  vendor_name: 'Winfield Workroom',
  design_disposition: 'selected',
  purchase_order_id: null,
  project_room_id: 'room-living',
};

const paperItems = () =>
  (mockOrderPaper.mock.calls.at(-1)?.[0] as { ffeItems: Array<Record<string, unknown>> })
    .ffeItems;

const renderUnfold = (room: unknown) =>
  render(
    <LineUnfold
      item={{ ...item, room }}
      projectId="project-1"
      projectName="Ellsworth"
      onAddNote={jest.fn()}
      onFold={jest.fn()}
    />,
  );

beforeEach(() => {
  mockOrderPaper.mockReset();
  mockSetLabel.mockReset();
});

it('reverts Escape without committing the abandoned draft', async () => {
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  input.focus();
  fireEvent.change(input, { target: { value: 'LR-99' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  fireEvent.blur(input);
  expect(input).toHaveValue('LR-01');
  expect(mockSetLabel).not.toHaveBeenCalled();
});

it('commits a changed label on blur', async () => {
  mockSetLabel.mockResolvedValue({ doc_code: 'LR-03' });
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  fireEvent.change(input, { target: { value: 'LR-03' } });
  fireEvent.blur(input);
  await waitFor(() => expect(mockSetLabel).toHaveBeenCalledWith({
    projectId: 'project-1', itemId: 'line-1', label: 'LR-03',
  }));
});

it('keeps focus after Enter commits the label', async () => {
  mockSetLabel.mockResolvedValue({ doc_code: 'LR-03' });
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  fireEvent.change(input, { target: { value: 'LR-03' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mockSetLabel).toHaveBeenCalled());
  await waitFor(() => expect(input).toHaveFocus());
});

it('keeps the label status region mounted before a refusal', () => {
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('keeps focus and exposes an accessible refusal after Enter', async () => {
  mockSetLabel.mockRejectedValue(new Error('Another item in this job already uses LR-02.'));
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  fireEvent.change(input, { target: { value: 'LR-02' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  const status = await screen.findByRole('status');
  await waitFor(() => expect(input).toHaveFocus());
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAttribute('aria-describedby', status.id);
});

it('leaves focus on the next control when a blur commit resolves', async () => {
  let resolveLabel: (row: { doc_code: string }) => void = () => {};
  mockSetLabel.mockReturnValue(new Promise((resolve) => { resolveLabel = resolve; }));
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  const nextControl = screen.getAllByRole('button')[0];
  input.focus();
  fireEvent.change(input, { target: { value: 'LR-03' } });
  act(() => nextControl.focus());
  expect(mockSetLabel).toHaveBeenCalledTimes(1);
  await act(async () => resolveLabel({ doc_code: 'LR-03' }));
  expect(input).toHaveValue('LR-03');
  expect(input).not.toHaveFocus();
  expect(nextControl).toHaveFocus();
});

it('does not send a refused label again on the next blur', async () => {
  mockSetLabel.mockRejectedValue(new Error('Another item in this job already uses LR-02.'));
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  fireEvent.change(input, { target: { value: 'LR-02' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByText('Another item in this job already uses LR-02.')).toBeInTheDocument();
  fireEvent.blur(input);
  await act(async () => {});
  expect(mockSetLabel).toHaveBeenCalledTimes(1);
});

it('sends one write when Enter and blur land before the first resolves', async () => {
  mockSetLabel.mockReturnValue(new Promise(() => {}));
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  fireEvent.change(input, { target: { value: 'LR-03' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  await act(async () => {});
  expect(mockSetLabel).toHaveBeenCalledTimes(1);
});

it('makes no label write when the selection cannot be edited', async () => {
  const user = userEvent.setup();
  render(<LineUnfold item={{ ...item, room: { id: 'room-living', name: 'Living Room' } }} projectId="project-1" projectName="Ellsworth" onAddNote={jest.fn()} onFold={jest.fn()} canEditSelection={false} />);
  const input = screen.getByRole('textbox', { name: 'Item label' });
  await user.click(input);
  await user.keyboard('9');
  await user.tab();
  expect(input).toHaveValue('LR-01');
  expect(mockSetLabel).not.toHaveBeenCalled();
});

it('shows the per-job label and commits edits through the FFE label writer', async () => {
  mockSetLabel.mockResolvedValue({ doc_code: 'LR-03' });
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  expect(input).toHaveValue('LR-01');
  fireEvent.change(input, { target: { value: 'LR-03' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mockSetLabel).toHaveBeenCalledWith({
    projectId: 'project-1', itemId: 'line-1', label: 'LR-03',
  }));
});

it('shows the duplicate-label refusal on the detail status line', async () => {
  mockSetLabel.mockRejectedValue(new Error('Another item in this job already uses LR-02.'));
  renderUnfold({ id: 'room-living', name: 'Living Room' });
  const input = screen.getByRole('textbox', { name: 'Item label' });
  fireEvent.change(input, { target: { value: 'LR-02' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Another item in this job already uses LR-02.',
  );
});

describe('LineUnfold · the order paper’s room (T-60j F19)', () => {
  it('hands the paper the room name, not the {id, name} join', () => {
    renderUnfold({ id: 'room-living', name: 'Living Room' });
    const [line] = paperItems();
    expect(line.room).toBe('Living Room');
    expect(line.id).toBe('line-1');
    expect(line.trade_price_cents).toBe(41000);
  });

  it('hands no room for a line not in a room', () => {
    renderUnfold(null);
    expect(paperItems()[0].room).toBeUndefined();
  });
});
