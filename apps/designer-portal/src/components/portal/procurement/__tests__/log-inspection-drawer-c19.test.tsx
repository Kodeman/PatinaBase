/**
 * C-19 (US-16 P1-11): the inspection drawer's per-line check-in and desktop
 * photos — the args it hands useCreateReceivingInspection, which routes them
 * to record_project_ffe_inspection (00700).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogInspectionDrawer } from '../log-inspection-drawer';

const mutateAsync = jest.fn();
let items: Array<{ id: string; name: string; quantity: number; project_id?: string }> = [];

jest.mock('@patina/supabase', () => ({
  useCreateReceivingInspection: () => ({ mutateAsync, isPending: false }),
  useProcurementItems: () => ({ data: items, isLoading: false }),
  // T-54 — no line here is placed in several rooms.
  useProjectRoomPlacements: () => ({ data: [], isLoading: false }),
  useProjectRooms: () => ({ data: [], isLoading: false }),
  useFfePlacementReceipts: () => ({ data: undefined, isLoading: false }),
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
  return render(
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
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Log inspection' }));

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ damageClaimCreated: false });
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
      { ffeItemId: 'ffe-2', receivedQuantity: 3, orderedQuantity: 4, condition: 'good', notedOnBol: false },
    ]);
    expect(args.damagedFfeItemIds).toEqual(['ffe-1']);
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
