/**
 * C-19 (US-16 P1-11): the inspection drawer's per-line check-in and desktop
 * photos — the args it hands useCreateReceivingInspection, which routes them
 * to record_project_ffe_inspection (00700).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogInspectionDrawer } from '../log-inspection-drawer';

const mutateAsync = jest.fn();
const mockFollowUp = jest.fn();
let mockShipments: any[] = [];
let items: Array<{ id: string; name: string; quantity: number; project_id?: string }> = [];

jest.mock('@patina/supabase', () => ({
  useCompleteReceivingInspection: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRetryReceivingFollowUp: () => ({ mutateAsync: mockFollowUp, isPending: false }),
  usePoShipments: () => ({ data: mockShipments, isLoading: false }),
  useReceivingInspections: () => ({ data: [], isLoading: false }),
  useProjectRecordedStudio: () => ({ data: 'studio-1' }),
  useOrganizationMembers: () => ({ data: [{ user_id: 'member-1', status: 'active', profiles: { full_name: 'Morgan' } }] }),
  useStudioLocations: () => ({ data: [{ id: 'location-1', label: 'Warehouse' }] }),
  useUser: () => ({ user: { id: 'member-1' } }),
  useCreateReceivingInspection: () => ({ mutateAsync, isPending: false }),
  useProcurementItems: () => ({ data: items, isLoading: false }),
  // T-54 — no line here is placed in several rooms.
  useProjectRoomPlacements: () => ({ data: [], isLoading: false }),
  useProjectRooms: () => ({ data: [], isLoading: false }),
  useFfePlacementReceipts: () => ({ data: undefined, isLoading: false }),
}));

jest.mock('@/components/document/line-unfold/claim-clock', () => ({
  ClaimClockLine: ({ receivingInspectionId }: { receivingInspectionId?: string }) =>
    <p data-testid="saved-receipt-clock">{receivingInspectionId ?? 'purchase-order'}</p>,
}));

jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: { inspectionLogged: jest.fn(), damageClaimCreated: jest.fn() },
}));

jest.mock('framer-motion', () => {
  const R = require('react');
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: () =>
          R.forwardRef(
            (
              {
                children,
                initial: _i,
                animate: _a,
                exit: _e,
                transition: _t,
                ...rest
              }: Record<string, unknown> & { children?: React.ReactNode },
              ref: React.Ref<HTMLDivElement>,
            ) => R.createElement('div', { ref, ...rest }, children),
          ),
      },
    ),
  };
});

const realFetch = global.fetch;
const fetchMock = jest.fn();

// null: the caller names no project.
function renderDrawer(projectId: string | null = '11111111-1111-4111-8111-111111111111') {
  const result = render(
    <LogInspectionDrawer
      open
      onOpenChange={jest.fn()}
      purchaseOrderId="po-1"
      projectId={projectId ?? undefined}
      poLabel="PO-1"
      vendorName="Ellsworth Mill"
      projectName="Maple St"
    />,
  );
  fireEvent.change(screen.getByLabelText('Opened and checked?'), { target: { value: 'yes' } });
  fireEvent.change(screen.getByLabelText('Arrival location'), { target: { value: 'location-1' } });
  return result;
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }));

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ damageClaimCreated: false, inspection: { id: 'inspection-1', outcome: 'clean' } });
  mockFollowUp.mockReset().mockResolvedValue(undefined);
  mockShipments = [];
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'receipt-key-1' });
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
  items = [
    { id: 'ffe-1', name: 'Pendant cluster', quantity: 2 },
    { id: 'ffe-2', name: 'Dining chair', quantity: 4 },
  ];
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('LogInspectionDrawer — C-19 per-line check-in', () => {
  it('sends every line good, unnoted, on a clean receipt with no photos', async () => {
    renderDrawer();
    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseOrderId: 'po-1',
        outcome: 'clean',
        photoAssetIds: [],
        damagedFfeItemIds: undefined,
        items: [
          { ffeItemId: 'ffe-1', receivedQuantity: 2, orderedQuantity: 2, condition: 'good', notedOnBol: false },
          { ffeItemId: 'ffe-2', receivedQuantity: 4, orderedQuantity: 4, condition: 'good', notedOnBol: false },
        ],
      }),
    );
  });

  it('shows the newly saved receipt clock instead of the PO clock', async () => {
    mutateAsync.mockResolvedValue({ damageClaimCreated: true, inspection: { id: 'receipt-new', outcome: 'damaged' } });
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Condition of Pendant cluster'), { target: { value: 'damaged' } });
    submit();
    expect(await screen.findByTestId('saved-receipt-clock')).toHaveTextContent('receipt-new');
  });

  it('a damaged line noted on the BOL suggests Damaged and drafts a claim for that line only', async () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Condition of Pendant cluster'), {
      target: { value: 'damaged' },
    });
    fireEvent.click(screen.getByLabelText('Noted on the BOL'));
    fireEvent.change(screen.getByLabelText('Received quantity for Dining chair'), {
      target: { value: '3' },
    });
    submit();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const args = mutateAsync.mock.calls[0][0];
    expect(args.outcome).toBe('damaged');
    expect(args.items).toEqual([
      { ffeItemId: 'ffe-1', receivedQuantity: 2, orderedQuantity: 2, condition: 'damaged', notedOnBol: true },
      { ffeItemId: 'ffe-2', receivedQuantity: 3, orderedQuantity: 4, condition: 'short', notedOnBol: false },
    ]);
    expect(args.damagedFfeItemIds).toEqual(['ffe-1', 'ffe-2']);
  });

  it('refuses a clean outcome over a line not in good condition, before any write', async () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Condition of Dining chair'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Clean/ }));
    submit();

    expect(
      await screen.findByText('A clean receipt needs every line in good condition.'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('uploads a chosen photo through the media proxy and attaches its asset id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { assetId: 'asset-77' } }),
    });
    const { container } = renderDrawer();
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['jpeg'], 'carton.jpg', { type: 'image/jpeg' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(await screen.findByAltText('carton.jpg')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/api/media/assets', {
      method: 'POST',
      body: expect.any(FormData),
    });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('projectId')).toBe('11111111-1111-4111-8111-111111111111');

    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].photoAssetIds).toEqual(['asset-77']);
  });

  it('shows an upload failure inline and attaches nothing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: 'Photos must be 50 MB or smaller.' } }),
    });
    const { container } = renderDrawer();
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'huge.jpg', { type: 'image/jpeg' })] },
      });
    });
    expect(await screen.findByText('Photos must be 50 MB or smaller.')).toBeInTheDocument();

    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0].photoAssetIds).toEqual([]);
  });

  it("sends the PO's own project with the upload when the caller names none", async () => {
    items = items.map((it) => ({ ...it, project_id: '33333333-3333-4333-8333-333333333333' }));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { assetId: 'asset-78' } }),
    });
    const { container } = renderDrawer(null);
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['jpeg'], 'crate.jpg', { type: 'image/jpeg' })] },
      });
    });
    expect(await screen.findByAltText('crate.jpg')).toBeInTheDocument();
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('projectId')).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('uploads nothing until the PO project is known, and says so', async () => {
    const { container } = renderDrawer(null);
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['jpeg'], 'crate.jpg', { type: 'image/jpeg' })] },
      });
    });
    expect(
      screen.getByText('The order is still loading. Add the photos again in a moment.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe('US-51 receipt standing and follow-up preservation', () => {
  it('pending needs an owner and saves no clean certification', async () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Opened and checked?'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Responsible person'), { target: { value: '' } });
    submit();
    expect(await screen.findByText('Name the person responsible for inspection.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Responsible person'), { target: { value: 'member-1' } });
    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ outcome: null, inspectionPending: true, inspectionOwnerUserId: 'member-1', receiptKey: 'receipt-key-1' })));
  });

  it('a failed photo retry never re-receives the delivery', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'Upload failed' } }) });
    renderDrawer();
    await act(async () => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'box.jpg')] } }));
    submit();
    const retry = await screen.findByRole('button', { name: 'Retry photos' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { assetId: 'photo-1' } }) });
    await act(async () => fireEvent.click(retry));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockFollowUp).toHaveBeenCalledWith(expect.objectContaining({ inspection: expect.objectContaining({ id: 'inspection-1' }), photoAssetIds: ['photo-1'] }));
  });

  it('claim failure retries only the saved inspection follow-up', async () => {
    mutateAsync.mockResolvedValue({ damageClaimCreated: false, claimDraftError: 'unavailable', inspection: { id: 'inspection-1', outcome: 'damaged' } });
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Condition of Pendant cluster'), { target: { value: 'damaged' } });
    submit();
    const retry = await screen.findByRole('button', { name: 'Retry claim draft' });
    await act(async () => fireEvent.click(retry));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockFollowUp).toHaveBeenCalledWith(expect.objectContaining({ retryClaim: true, damagedFfeItemIds: ['ffe-1'] }));
  });

  it('four good chairs on a six-chair order are a clean four-chair shipment, not two short', async () => {
    items = [{ id: 'ffe-1', name: 'Dining chairs with a full wrapping name', quantity: 6 }];
    mockShipments = [{ id: 'shipment-a', carrier: 'Carrier', tracking: 'PRO-1', po_shipment_lines: [{ ffe_item_id: 'ffe-1', qty: 4 }] }];
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Shipment'), { target: { value: 'shipment-a' } });
    expect(screen.getByLabelText('Received quantity for Dining chairs with a full wrapping name')).toHaveValue(4);
    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'clean', poShipmentId: 'shipment-a', items: [expect.objectContaining({ receivedQuantity: 4, condition: 'good' })] })));
  });
});
