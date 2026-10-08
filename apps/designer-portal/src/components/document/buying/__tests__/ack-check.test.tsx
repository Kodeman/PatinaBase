/**
 * C-27 (D1-06): the acknowledgment check — the prefill, the agrees / differs
 * word and its signed money delta, the log_po_acknowledgment_v2 payload, the
 * PO stamp's copy, and the R8 routing of an accepted difference.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockLog = jest.fn();
const mockResolve = jest.fn();
const mockState: {
  basis: Record<string, unknown> | undefined;
  acks: Record<string, unknown>[];
  costLines: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
} = { basis: undefined, acks: [], costLines: [], quotes: [] };

jest.mock('@patina/supabase', () => ({
  isChangeOrderRequired: (error: { message?: unknown } | null) =>
    typeof error?.message === 'string' && error.message.startsWith('change_order_required'),
  poAckBasisKey: (id: string) => ['buying-phase2', 'ack-basis', id],
  useLogPoAcknowledgment: () => ({ mutateAsync: mockLog, isPending: false }),
  useResolveAckLine: () => ({ mutateAsync: mockResolve, isPending: false }),
  usePoAckBasis: () => ({ data: mockState.basis, isLoading: false, isError: false }),
  usePoAcknowledgments: (id: string | null) => ({ data: id ? mockState.acks : undefined }),
  usePoCostLines: () => ({ data: mockState.costLines }),
  useVendorQuotes: () => ({ data: mockState.quotes }),
  useProcurementDrafts: () => ({ data: [] }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));
jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: { poAcknowledgmentLogged: jest.fn() },
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
// The Order cell's other tenants have their own suites.
jest.mock('@/components/portal/procurement/order-paper/riders', () => ({ PoRiders: () => null }));
jest.mock('../../line-unfold/change-order', () => ({
  ChangeOrderAct: ({ open }: { open?: boolean }) =>
    open ? <div data-testid="po-change-sheet" /> : null,
}));

import {
  ackPayload,
  ackRows,
  ackStampCopy,
  ackStateOf,
  moneyDelta,
  prefill,
  rowAgreement,
  rowDelta,
  type AckBasis,
} from '../ack-check-model';
import { AckCheckForm, AckRecord } from '../ack-check';
import { OrderCell } from '../../line-unfold/order-cell';
import { fmtDay } from '@/lib/document/format';

const BASIS: AckBasis = {
  vendorId: 'vendor-hale',
  projectId: 'project-1',
  requestedShipOn: '2026-10-20',
  freightCents: 42000,
  lines: [
    {
      id: 'sofa',
      name: 'Sofa, COM',
      quantity: 1,
      trade_price_cents: 648000,
      unit_price_cents: 972000,
      spec: { sku: 'HU-TA96', finish: 'Ebonized oak', color_fabric: null },
      product: { sku: 'HU-OLD', finish: 'Natural' },
    },
    {
      id: 'ottoman',
      name: 'Ottoman',
      quantity: 2,
      trade_price_cents: null,
      unit_price_cents: 192000,
      spec: null,
      product: { sku: null, finish: 'Ebonized oak' },
    },
  ],
};

const QUOTES = [
  {
    id: 'q-old',
    vendor_id: 'vendor-hale',
    superseded_by: 'q-new',
    freight_estimate_cents: 30000,
    vendor_quote_lines: [{ ffe_item_id: 'sofa', unit_trade_cents: 600000 }],
  },
  {
    id: 'q-new',
    vendor_id: 'vendor-hale',
    superseded_by: null,
    quote_ref: 'Q-5528',
    valid_until: null,
    freight_estimate_cents: 40000,
    vendor_quote_lines: [{ ffe_item_id: 'sofa', unit_trade_cents: 640000, lead_time_weeks: null, applied_at: null }],
  },
];

beforeEach(() => {
  mockLog.mockReset().mockResolvedValue({ id: 'ack-1', purchase_order_id: 'po-1' });
  mockResolve.mockReset().mockResolvedValue({});
  mockState.basis = { ...BASIS, freightCents: undefined };
  mockState.acks = [];
  mockState.costLines = [{ kind: 'freight', estimate_cents: 42000 }];
  mockState.quotes = [];
  mockOneVoice = false;
});

describe('prefill', () => {
  it('pre-fills THEY CONFIRMED with every PO value po-send prints, spec before product', () => {
    const rows = ackRows(BASIS);
    expect(rows.map((r) => r.key)).toEqual([
      'sofa:qty',
      'sofa:unit_price',
      'sofa:sku',
      'sofa:finish',
      'ottoman:qty',
      'ottoman:unit_price',
      'ottoman:finish',
      'ship_date',
      'freight',
    ]);
    expect(prefill(rows)).toMatchObject({
      'sofa:unit_price': '6480.00',
      'sofa:sku': 'HU-TA96',
      'sofa:finish': 'Ebonized oak',
      // No trade price: the unit price is what po-send prints.
      'ottoman:unit_price': '1920.00',
      'ottoman:finish': 'Ebonized oak',
      ship_date: '2026-10-20',
      freight: '420.00',
    });
  });

  it("reads QUOTED from the maker's live quote, never a superseded one", () => {
    const rows = ackRows(BASIS, QUOTES as never);
    expect(rows.find((r) => r.key === 'sofa:unit_price')?.quoted).toBe('6400.00');
    expect(rows.find((r) => r.key === 'ottoman:unit_price')?.quoted).toBeNull();
    expect(rows.find((r) => r.key === 'freight')?.quoted).toBe('400.00');
  });
});

describe('agrees, differs and the money delta', () => {
  const rows = ackRows(BASIS);
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it('compares text trimmed, single-spaced and case-folded, and numbers as numbers', () => {
    expect(rowAgreement(row('sofa:finish'), '  ebonized   OAK ')).toBe('agrees');
    expect(rowAgreement(row('sofa:finish'), 'Walnut')).toBe('differs');
    expect(rowAgreement(row('sofa:unit_price'), '$6,480')).toBe('agrees');
    expect(rowAgreement(row('ottoman:qty'), '3')).toBe('differs');
  });

  it('signs the delta in money for price, quantity and freight', () => {
    // Price: per unit × the ordered quantity (2 ottomans, +$60.00 each).
    expect(rowDelta(row('ottoman:unit_price'), '1980.00')).toBe(12000);
    // Quantity: the count × the unit price.
    expect(rowDelta(row('ottoman:qty'), '1')).toBe(-192000);
    expect(rowDelta(row('freight'), '465')).toBe(4500);
    expect(rowDelta(row('sofa:finish'), 'Walnut')).toBeNull();
    // Stored values (cents) read the same way on the record.
    expect(moneyDelta('unit_price', '192000', '198000', { qty: 2, unitCents: 192000 }, 'stored')).toBe(12000);
  });

  it('shows "differs · +$120.00" in the form once a value is typed over', () => {
    mockState.basis = { ...BASIS, freightCents: undefined };
    render(<AckCheckForm purchaseOrderId="po-1" />);
    const ottomanPrice = screen.getByRole('textbox', { name: 'Ottoman · price, they confirmed' });
    expect(ottomanPrice).toHaveValue('1920.00');
    expect(within(screen.getByTestId('ack-row-ottoman:unit_price')).getByTestId('ack-row-word')).toHaveTextContent('agrees');
    fireEvent.change(ottomanPrice, { target: { value: '1980.00' } });
    expect(within(screen.getByTestId('ack-row-ottoman:unit_price')).getByTestId('ack-row-word')).toHaveTextContent(
      'differs · +$120.00',
    );
    expect(screen.getByTestId('ack-check-summary')).toHaveTextContent(
      '1 difference. Silence on a wrong acknowledgment counts as accepting it.',
    );
  });
});

describe('the v2 payload', () => {
  it('sends the header keys and every stated value, cents and counts as numbers', () => {
    const rows = ackRows(BASIS);
    const values = { ...prefill(rows), 'ottoman:unit_price': '1,980', 'sofa:finish': ' Walnut ', 'sofa:sku': '' };
    const { ack, lines } = ackPayload(rows, values, { vendorOrderRef: ' H-55102 ', confirmedEta: '2026-10-24' });
    expect(ack).toEqual({
      vendorOrderRef: 'H-55102',
      confirmedEta: '2026-10-24',
      shipDate: '2026-10-20',
      freightCents: 42000,
    });
    expect(lines).toEqual([
      { ffeItemId: 'sofa', field: 'qty', ackValue: 1 },
      { ffeItemId: 'sofa', field: 'unit_price', ackValue: 648000 },
      // A blanked value sends nothing; the PO stands.
      { ffeItemId: 'sofa', field: 'finish', ackValue: 'Walnut' },
      { ffeItemId: 'ottoman', field: 'qty', ackValue: 2 },
      { ffeItemId: 'ottoman', field: 'unit_price', ackValue: 198000 },
      { ffeItemId: 'ottoman', field: 'finish', ackValue: 'Ebonized oak' },
    ]);
  });

  it('logs through v2 from the form, with the project for cache invalidation', async () => {
    render(<AckCheckForm purchaseOrderId="po-1" vendorPoNumber="H-55102" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Sofa, COM · finish, they confirmed' }), {
      target: { value: 'Walnut' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log it with 1 difference' }));
    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    const call = mockLog.mock.calls[0][0];
    expect(call.purchaseOrderId).toBe('po-1');
    expect(call.projectId).toBe('project-1');
    expect(call.ack).toMatchObject({ vendorOrderRef: 'H-55102', shipDate: '2026-10-20', freightCents: 42000 });
    expect(call.lines).toContainEqual({ ffeItemId: 'sofa', field: 'finish', ackValue: 'Walnut' });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Acknowledged — 1 difference. A reply to the maker is drafted for your review',
    );
  });

  it('offers the one-click clean log when everything agrees', async () => {
    render(<AckCheckForm purchaseOrderId="po-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Everything agrees — log it' }));
    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Acknowledged — everything agreed.');
  });
});

describe('the PO stamp', () => {
  it('reads "Acknowledged · 1 difference" in terracotta until resolved', () => {
    expect(ackStampCopy('discrepancy', 1)).toEqual({ label: 'Acknowledged · 1 difference', differs: true });
    expect(ackStampCopy('discrepancy', 3)).toEqual({ label: 'Acknowledged · 3 differences', differs: true });
    expect(ackStampCopy('resolved')).toEqual({ label: 'Acknowledged · differences resolved', differs: false });
    expect(ackStampCopy('clean')).toEqual({ label: 'Acknowledged · everything agreed', differs: false });
    expect(ackStampCopy('none')).toBeNull();
  });

  it('derives the state from the latest acknowledgment as po_ack_state_for does', () => {
    expect(ackStateOf([{ verdict: 'match' }, { verdict: 'disputed' }])).toBe('discrepancy');
    expect(ackStateOf([{ verdict: 'match' }, { verdict: 'accepted' }])).toBe('resolved');
    expect(ackStateOf([{ verdict: 'match' }])).toBe('clean');
  });
});

const DIFFERING_ACK = {
  id: 'ack-1',
  vendor_order_ref: 'H-55102',
  po_ack_lines: [
    { id: 'line-price', ffe_item_id: 'ottoman', field: 'unit_price', po_value: '192000', ack_value: '198000', verdict: 'mismatch' },
    { id: 'line-finish', ffe_item_id: 'sofa', field: 'finish', po_value: 'Ebonized oak', ack_value: 'Walnut', verdict: 'mismatch' },
    { id: 'line-qty', ffe_item_id: 'sofa', field: 'qty', po_value: '1', ack_value: '1', verdict: 'match' },
  ],
};

describe('resolving a difference', () => {
  beforeEach(() => {
    mockState.acks = [DIFFERING_ACK];
  });

  it('reads each line agrees / differs with the signed delta', () => {
    render(<AckRecord purchaseOrderId="po-1" projectId="project-1" />);
    expect(screen.getByTestId('ack-line-line-price')).toHaveTextContent('differs · +$120.00');
    expect(screen.getByTestId('ack-line-line-qty')).toHaveTextContent('agrees');
  });

  it('disputes through resolve_ack_line and points at the drafted reply', async () => {
    render(<AckRecord purchaseOrderId="po-1" projectId="project-1" />);
    const finish = screen.getByTestId('ack-line-line-finish');
    fireEvent.click(within(finish).getByRole('button', { name: 'Dispute' }));
    await waitFor(() =>
      expect(mockResolve).toHaveBeenCalledWith({
        lineId: 'line-finish',
        verdict: 'disputed',
        purchaseOrderId: 'po-1',
        projectId: 'project-1',
      }),
    );
    expect(await within(finish).findByRole('status')).toHaveTextContent('The reply to the maker is drafted for your review');
  });

  it('routes an R8 refusal of an accepted price to the change order', async () => {
    mockResolve.mockRejectedValueOnce({
      message:
        'change_order_required: the line sits on a executed authorization; a price change is a change order the client re-approves',
    });
    const onStartChange = jest.fn();
    render(<AckRecord purchaseOrderId="po-1" projectId="project-1" onStartChange={onStartChange} />);
    const price = screen.getByTestId('ack-line-line-price');
    fireEvent.click(within(price).getByRole('button', { name: 'Accept theirs' }));
    const routed = await within(price).findByTestId('ack-change-order');
    expect(routed).toHaveTextContent('a price change is a change order the client re-approves');
    fireEvent.click(within(routed).getByRole('button', { name: 'Start a change →' }));
    expect(onStartChange).toHaveBeenCalledTimes(1);
  });

  it('opens the C-21 change order from the Order cell on an R8 refusal', async () => {
    mockResolve.mockRejectedValueOnce({ message: 'change_order_required: a quantity change goes through a purchase order change order' });
    render(
      <OrderCell
        item={{ id: 'ottoman', vendor_name: 'Hale', vendor_id: 'vendor-hale' }}
        po={{
          id: 'po-1',
          po_number: 'PO-1042',
          status: 'confirmed',
          sent_at: '2026-10-07T12:00:00Z',
          acknowledged_at: '2026-10-09T12:00:00Z',
          is_patina_catalog: false,
        }}
        reasons={[]}
        projectId="project-1"
        canChange
      />,
    );
    expect(screen.getByTestId('po-ack-stamp')).toHaveTextContent('Acknowledged · 2 differences');
    expect(screen.queryByTestId('po-change-sheet')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('ack-line-line-price')).getByRole('button', { name: 'Accept theirs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start a change →' }));
    expect(screen.getByTestId('po-change-sheet')).toBeInTheDocument();
  });
});

describe('F9-2 — the acknowledgment inside the Order cell wraps at 390', () => {
  beforeEach(() => {
    mockState.acks = [DIFFERING_ACK];
  });

  const parts = () => {
    const record = screen.getByTestId('ack-record');
    const finish = screen.getByTestId('ack-line-line-finish');
    return {
      table: within(record).getByRole('table'),
      rowLabel: within(finish).getByRole('rowheader'),
      verdict: within(finish).getByText(/^differs/),
      decisions: within(finish).getByRole('button', { name: 'Dispute' }).parentElement as HTMLElement,
      door: screen.getByRole('button', { name: 'They corrected it — log the new acknowledgment' }),
    };
  };

  it('inCell drops the 22rem floor and wraps the verdict, row label and door', () => {
    render(<AckRecord purchaseOrderId="po-1" projectId="project-1" inCell />);
    const { table, rowLabel, verdict, decisions, door } = parts();
    expect(table).toHaveClass('w-full', 'min-w-0');
    expect(table.className).not.toContain('22rem');
    expect(rowLabel).toHaveClass('min-w-0', 'break-words');
    expect(verdict).not.toHaveClass('whitespace-nowrap');
    expect(decisions).toHaveClass('flex', 'flex-wrap');
    expect(door).toHaveClass('whitespace-normal', 'text-left');
    expect(door).not.toHaveClass('whitespace-nowrap');
  });

  it('the default (the ledger, the resend paper) renders as today', () => {
    render(<AckRecord purchaseOrderId="po-1" projectId="project-1" />);
    const { table, rowLabel, verdict, decisions, door } = parts();
    expect(table).toHaveClass('w-full', 'min-w-[22rem]');
    expect(table).not.toHaveClass('min-w-0');
    expect(rowLabel.className).toBe('py-1 pr-2 align-top font-normal');
    expect(verdict).toHaveClass('whitespace-nowrap');
    expect(decisions).toHaveClass('flex', 'flex-wrap');
    expect(door).toHaveClass('whitespace-nowrap');
    expect(door).not.toHaveClass('whitespace-normal');
    expect(door).not.toHaveClass('text-left');
  });

  it('the Order cell hosts it inCell', () => {
    render(
      <OrderCell
        item={{ id: 'ottoman', vendor_name: 'Hale', vendor_id: 'vendor-hale' }}
        po={{
          id: 'po-1',
          po_number: 'PO-1042',
          status: 'confirmed',
          sent_at: '2026-10-07T12:00:00Z',
          acknowledged_at: '2026-10-09T12:00:00Z',
          is_patina_catalog: false,
        }}
        reasons={[]}
        projectId="project-1"
        canChange
      />,
    );
    const { table, door } = parts();
    expect(table.className).not.toContain('22rem');
    expect(door).toHaveClass('whitespace-normal', 'text-left');
  });
});

describe('US-19 F6-9 (D17, one-voice) — the acknowledgment form behind a door', () => {
  beforeEach(() => {
    mockOneVoice = true;
  });

  const SENT = '2026-10-01T12:00:00Z';
  const openDoor = () => {
    render(<AckCheckForm purchaseOrderId="po-1" sentAt={SENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log what they confirmed' }));
  };

  it('an unacknowledged PO prints the fact and one door, and no input until it is pressed', async () => {
    render(<AckCheckForm purchaseOrderId="po-1" sentAt={SENT} />);
    expect(screen.getByTestId('ack-check-door')).toHaveTextContent(
      `sent to the maker ${fmtDay(SENT)} · awaiting acknowledgment`,
    );
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByTestId('ack-check')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log what they confirmed' }));
    const theirOrder = screen.getByRole('textbox', { name: 'Their order №' });
    await waitFor(() => expect(document.activeElement).toBe(theirOrder));
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
  });

  it('marks read "as ordered" until a value differs, with the order’s own summary and act', () => {
    openDoor();
    const word = () =>
      within(screen.getByTestId('ack-row-ottoman:unit_price')).getByTestId('ack-row-word');
    expect(word()).toHaveTextContent('as ordered');
    expect(screen.getAllByTestId('ack-row-word').map((el) => el.textContent)).toEqual(
      screen.getAllByTestId('ack-row-word').map(() => 'as ordered'),
    );
    expect(screen.getByTestId('ack-check-summary')).toHaveTextContent('Nothing differs from the order.');
    expect(screen.getByRole('button', { name: 'Log it — confirmed as ordered' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Ottoman · price, they confirmed' }), {
      target: { value: '1980.00' },
    });
    expect(word()).toHaveTextContent('differs · +$120.00');
    expect(screen.getByRole('button', { name: 'Log it with 1 difference' })).toBeInTheDocument();
  });

  it('Esc on the form is Cancel: it closes, takes the key, and focus goes back to the door', async () => {
    openDoor();
    const theirOrder = screen.getByRole('textbox', { name: 'Their order №' });
    const notTaken = fireEvent.keyDown(theirOrder, { key: 'Escape' });
    expect(notTaken).toBe(false);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Log what they confirmed' }),
      ),
    );
  });

  it('keeps the after-log note', async () => {
    openDoor();
    fireEvent.click(screen.getByRole('button', { name: 'Log it — confirmed as ordered' }));
    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Acknowledged — everything agreed.');
  });

  it('a corrected acknowledgment (one already on file) opens straight into the form', () => {
    mockState.acks = [DIFFERING_ACK];
    render(<AckCheckForm purchaseOrderId="po-1" sentAt={SENT} />);
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Their order №' })).toBeInTheDocument();
  });

  it('door={false} (F7-8: the host is the door) mounts the inputs at once, focused on Their order №', async () => {
    render(<AckCheckForm purchaseOrderId="po-1" sentAt={SENT} door={false} />);
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log what they confirmed' })).not.toBeInTheDocument();
    const theirOrder = screen.getByRole('textbox', { name: 'Their order №' });
    expect(screen.getByTestId('ack-check')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(theirOrder));
  });

  it('the Order cell says the order went to the maker (F6-8)', () => {
    render(
      <OrderCell
        item={{ id: 'ottoman', vendor_name: 'Hale', vendor_id: 'vendor-hale' }}
        po={{ id: 'po-1', po_number: 'PO-1042', status: 'sent', sent_at: SENT, acknowledged_at: null }}
        reasons={[]}
      />,
    );
    expect(screen.getByTestId('line-po-cell')).toHaveTextContent(
      `sent to the maker ${fmtDay(SENT)} · awaiting acknowledgment`,
    );
  });
});

describe('flag off — the form stands open as today', () => {
  const SENT = '2026-10-01T12:00:00Z';

  it('prints no door and the form’s own words', () => {
    render(<AckCheckForm purchaseOrderId="po-1" sentAt={SENT} />);
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Everything agrees — log it' })).toBeInTheDocument();
    expect(screen.getByTestId('ack-check-summary')).toHaveTextContent('Everything agrees.');
  });

  it('door={false} changes nothing with the flag off — no door, no focus taken', () => {
    render(<AckCheckForm purchaseOrderId="po-1" sentAt={SENT} door={false} />);
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Their order №' }));
  });

  it('the Order cell keeps vendor', () => {
    render(
      <OrderCell
        item={{ id: 'ottoman', vendor_name: 'Hale', vendor_id: 'vendor-hale' }}
        po={{ id: 'po-1', po_number: 'PO-1042', status: 'sent', sent_at: SENT, acknowledged_at: null }}
        reasons={[]}
      />,
    );
    expect(screen.getByTestId('line-po-cell')).toHaveTextContent(
      `sent to vendor ${fmtDay(SENT)} · awaiting acknowledgment`,
    );
  });
});
