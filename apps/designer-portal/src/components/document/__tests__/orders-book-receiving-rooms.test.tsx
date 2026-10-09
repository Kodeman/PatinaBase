/**
 * US-21 T-54 (D7 phase 3, case 2) — Receiving asks which rooms a delivery
 * covers. Inspect on the Receiving book opens the inspection drawer; a line
 * placed in two or more rooms shows its rooms, pre-filled in placement order
 * (500 of the oak floor → Hall 120, Living 320, Dining 60), editable, adding
 * up to the delivery. A single-room line shows no prompt. The rooms ride the
 * receipt as `placements` (00756).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivingBookPage } from '../orders-book-receiving';

const mutateAsync = jest.fn();
let earlierReceipts: Record<string, number> = {};

const PROJECT = 'olsen';
const items = [
  {
    id: 'oak',
    name: 'White oak floor',
    quantity: 913,
    unit: 'sq_ft',
    received_quantity: 0,
    project_id: PROJECT,
  },
  { id: 'runner', name: 'Hall runner', quantity: 3, unit: 'each', received_quantity: 0, project_id: PROJECT },
];
const rooms = [
  { id: 'r-hall', name: 'Hall' },
  { id: 'r-living', name: 'Living' },
  { id: 'r-dining', name: 'Dining' },
  { id: 'r-kitchen', name: 'Kitchen' },
];
const placement = (id: string, ffeItemId: string, projectRoomId: string, quantity: number, sortOrder: number) => ({
  id,
  ffeItemId,
  projectRoomId,
  quantity,
  areaNote: null,
  sortOrder,
});
// Out of order on purpose: the prompt reads them in placement order.
const placements = [
  placement('pl-kitchen', 'oak', 'r-kitchen', 210, 3),
  placement('pl-hall', 'oak', 'r-hall', 120, 0),
  placement('pl-dining', 'oak', 'r-dining', 180, 2),
  placement('pl-living', 'oak', 'r-living', 320, 1),
  placement('pl-runner', 'runner', 'r-hall', 3, 0),
];

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: () => ({
    data: [
      {
        id: 'po-1',
        status: 'delivered',
        po_number: 'PO-1042',
        project_id: 'olsen',
        delivered_date: '2026-10-07',
        vendor: { id: 'v-1', name: 'Ellsworth Mill' },
        project: { id: 'olsen', name: 'Olsen' },
      },
    ],
    isLoading: false,
  }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReceivingInspections: () => ({ data: [], isLoading: false }),
  useDamageClaims: () => ({ data: [], isLoading: false }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateReceivingInspection: () => ({ mutateAsync, isPending: false }),
  useProcurementItems: () => ({ data: items, isLoading: false }),
  useProjectRoomPlacements: () => ({ data: placements, isLoading: false }),
  useProjectRooms: () => ({ data: rooms, isLoading: false }),
  useFfePlacementReceipts: (ids: string[]) => ({
    data: ids.length > 0 ? earlierReceipts : undefined,
    isLoading: false,
  }),
}));
jest.mock('../line-unfold/claim-clock', () => ({ ClaimClockLine: () => null }));
jest.mock('@/lib/document/ledger-summary', () => ({ receivingFrontMatter: () => [] }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
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

function openReceiving() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReceivingBookPage projectId={PROJECT} onOpenDocument={jest.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
}

const receive = (name: string, count: number) =>
  fireEvent.change(screen.getByLabelText(`Received quantity for ${name}`), {
    target: { value: String(count) },
  });
const share = (room: string) =>
  screen.getByLabelText(`${room} share of White oak floor`) as HTMLInputElement;
const prompt = () => screen.getByRole('group', { name: 'Which rooms does it cover?' });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Log inspection' }));

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ inspection: { id: 'insp-1' }, damageClaimCreated: false });
  earlierReceipts = {};
});

describe('T-54 — Receiving asks which rooms a delivery covers', () => {
  it('500 of 913 pre-fills Hall 120, Living 320, Dining 60 in placement order', () => {
    openReceiving();
    receive('White oak floor', 500);

    const fields = within(prompt()).getAllByRole('spinbutton') as HTMLInputElement[];
    expect(fields.map((field) => field.getAttribute('aria-label'))).toEqual([
      'Hall share of White oak floor',
      'Living share of White oak floor',
      'Dining share of White oak floor',
      'Kitchen share of White oak floor',
    ]);
    expect(fields.map((field) => field.value)).toEqual(['120', '320', '60', '0']);
    expect(within(prompt()).getByText('500 of 500 sq ft in rooms')).toBeInTheDocument();
  });

  it('a single-room line shows no prompt', () => {
    openReceiving();
    expect(screen.getAllByRole('group', { name: 'Which rooms does it cover?' })).toHaveLength(1);
    expect(screen.queryByLabelText('Hall share of Hall runner')).not.toBeInTheDocument();
  });

  it('edits ride the receipt as placements, adding up to the delivery', async () => {
    openReceiving();
    receive('White oak floor', 500);
    fireEvent.change(share('Living'), { target: { value: '300' } });
    fireEvent.change(share('Kitchen'), { target: { value: '20' } });
    expect(within(prompt()).getByText('500 of 500 sq ft in rooms')).toBeInTheDocument();

    submit();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const [oak, runner] = mutateAsync.mock.calls[0][0].items;
    expect(oak).toMatchObject({
      ffeItemId: 'oak',
      receivedQuantity: 500,
      placements: [
        { placementId: 'pl-hall', quantity: 120 },
        { placementId: 'pl-living', quantity: 300 },
        { placementId: 'pl-dining', quantity: 60 },
        { placementId: 'pl-kitchen', quantity: 20 },
      ],
    });
    expect(runner).not.toHaveProperty('placements');
  });

  it('rooms that do not add up to the delivery hold the receipt', () => {
    openReceiving();
    receive('White oak floor', 500);
    fireEvent.change(share('Dining'), { target: { value: '40' } });

    expect(
      within(prompt()).getByText('The rooms add up to 480; this delivery brought 500 to place.'),
    ).toBeInTheDocument();
    submit();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText('White oak floor: The rooms add up to 480; this delivery brought 500 to place.'),
    ).toBeInTheDocument();
  });

  it('a later delivery fills what each room still lacks', () => {
    // The first 500 went Hall 120, Living 320, Dining 60.
    items[0].received_quantity = 500;
    earlierReceipts = { 'pl-hall': 120, 'pl-living': 320, 'pl-dining': 60 };
    try {
      openReceiving();
      receive('White oak floor', 800);
      expect((within(prompt()).getAllByRole('spinbutton') as HTMLInputElement[]).map((f) => f.value)).toEqual([
        '0',
        '0',
        '120',
        '180',
      ]);
      expect(within(prompt()).getByText('300 of 300 sq ft in rooms')).toBeInTheDocument();
    } finally {
      items[0].received_quantity = 0;
    }
  });
});
