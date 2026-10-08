/**
 * US-19 FR2 (SQ-517): R37's arrival date request sits in the Movement cell of
 * the line it was asked from, and only there (511-R6), PO or none. A request
 * with no address says so and holds its Send (506-2).
 */

import { fireEvent, render, screen, within } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockDrafts: { data: Record<string, unknown>[] } = { data: [] };
jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useProcurementDrafts: () => ({ data: mockDrafts.data }),
  useUpdateProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDiscardProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResendStalledProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetPurchaseOrderTracking: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePoShipments: () => ({ data: [] }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
  folioSignedUrl: jest.fn(),
}));
jest.mock('../../date-text-input', () => ({
  DateTextInput: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
}));
let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));

import { MovementCell } from '../movement-cell';
import { dayMonth } from '@/lib/document/dates';

const ASK = {
  id: 'ask-1',
  kind: 'maker_eta_request',
  status: 'awaiting_review',
  purchase_order_id: 'po-1',
  ffe_item_id: 'line-1',
  to_email: 'orders@hewn.test',
  subject: 'Arrival date: Walnut console',
  body: 'Hello,\n\nWhen will it arrive?',
};

const renderCell = (item: Record<string, unknown>, po: Record<string, unknown> | null) =>
  render(
    <MovementCell
      item={{ status: 'approved', eta: null, ...item }}
      po={po}
      projectId="proj-1"
      poStatus={(po?.status as string) ?? null}
      showAdvance={false}
      onAdvanced={jest.fn()}
    />,
  );

beforeEach(() => {
  mockDrafts.data = [];
  mockOneVoice = false;
});

describe('MovementCell date requests', () => {
  it("511-R6: a PO line shows its own date request, never its sibling's", () => {
    mockDrafts.data = [
      ASK,
      { ...ASK, id: 'ask-sibling', ffe_item_id: 'line-2', subject: 'Arrival date: Oak bench' },
    ];
    renderCell({ id: 'line-1' }, { id: 'po-1', status: 'ordered', confirmed_eta: null });
    const cell = screen.getByTestId('line-movement-cell');
    expect(within(cell).getAllByTestId('draft-review')).toHaveLength(1);
    expect(within(cell).getByLabelText('Subject')).toHaveValue('Arrival date: Walnut console');
  });

  it('a line with no PO shows the date request it was asked from', () => {
    mockDrafts.data = [{ ...ASK, purchase_order_id: null }];
    renderCell({ id: 'line-1' }, null);
    expect(screen.getAllByTestId('draft-review')).toHaveLength(1);
    expect(screen.queryByText('Date request drafted · no address')).toBeNull();
  });

  it('506-2: no address reads "Date request drafted · no address", Send held with the maker named', () => {
    const land = jest.fn();
    window.addEventListener('document:focus-ffe-line', land);
    mockDrafts.data = [{ ...ASK, purchase_order_id: null, to_email: null }];
    renderCell(
      { id: 'line-1', vendor_name: null, vendor_id: null, product: { brand: 'Fixture Metalworks' } },
      null,
    );
    expect(screen.getByText('Date request drafted · no address')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription('No address on file for Fixture Metalworks.');

    // A brand-only maker has no record to keep an address on: the repair
    // lands on the line's maker selector.
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    expect(land).toHaveBeenCalledTimes(1);
    expect((land.mock.calls[0][0] as CustomEvent).detail).toEqual({ itemId: 'line-1', cell: 'maker' });
    window.removeEventListener('document:focus-ffe-line', land);
  });

  it('shows no other kind of draft as a date request', () => {
    mockDrafts.data = [{ ...ASK, kind: 'ack_discrepancy_reply', purchase_order_id: null }];
    renderCell({ id: 'line-1' }, null);
    expect(screen.queryByTestId('draft-review')).toBeNull();
  });
});

// FR4 517-4 (b) — `Asked {day} · sent` stays on the line until a date is
// recorded, not only on the studio day it was sent.
describe('MovementCell asked-for date (one-voice)', () => {
  const DAY_MS = 86_400_000;
  const sentOn = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  const SENT = (at: string, id = 'ask-sent') => ({ ...ASK, id, status: 'sent', created_at: at, sent_at: at });

  beforeEach(() => {
    mockOneVoice = true;
  });

  it('persists across days while no date is recorded', () => {
    const at = sentOn(4);
    mockDrafts.data = [SENT(at)];
    renderCell({ id: 'line-1', purchase_order: null }, null);
    expect(screen.getByTestId('line-date-request-status')).toHaveTextContent(`Asked ${dayMonth(at)} · sent`);
    expect(screen.queryByTestId('draft-review')).toBeNull();
  });

  it('persists while the recorded date has passed, and names the latest send', () => {
    const older = sentOn(9);
    const latest = sentOn(2);
    mockDrafts.data = [SENT(older, 'ask-older'), SENT(latest, 'ask-latest')];
    const past = new Date(Date.now() - 6 * DAY_MS).toISOString().slice(0, 10);
    const po = { id: 'po-1', status: 'ordered', confirmed_eta: past, delivered_date: null };
    renderCell({ id: 'line-1', purchase_order: po }, po);
    expect(screen.getByTestId('line-date-request-status')).toHaveTextContent(
      `Asked ${dayMonth(latest)} · sent`,
    );
  });

  it('stops once a date ahead is recorded', () => {
    mockDrafts.data = [SENT(sentOn(4))];
    const ahead = new Date(Date.now() + 5 * DAY_MS).toISOString().slice(0, 10);
    const po = { id: 'po-1', status: 'ordered', confirmed_eta: ahead, delivered_date: null };
    renderCell({ id: 'line-1', purchase_order: po }, po);
    expect(screen.queryByTestId('line-date-request-status')).toBeNull();
  });

  it('stops once the piece is here', () => {
    mockDrafts.data = [SENT(sentOn(4))];
    renderCell({ id: 'line-1', status: 'delivered', purchase_order: null }, null);
    expect(screen.queryByTestId('line-date-request-status')).toBeNull();
  });

  it('flag off: a send on an earlier studio day is not printed', () => {
    mockOneVoice = false;
    mockDrafts.data = [SENT(sentOn(4))];
    renderCell({ id: 'line-1', purchase_order: null }, null);
    expect(screen.queryByText(/· sent/)).toBeNull();
  });
});

// US-19 FR5 530-3 — the follow-up is its own kind; the cell says which.
describe('MovementCell held follow-up (one-voice)', () => {
  const FOLLOW_UP = {
    ...ASK,
    id: 'follow-1',
    kind: 'maker_follow_up',
    subject: 'NA-2026-077 — following up',
    created_at: '2026-10-07T15:00:00Z',
  };
  const HALLORAN = { id: 'line-1', vendor_name: 'Halloran Joinery', purchase_order: null };

  beforeEach(() => {
    mockOneVoice = true;
  });

  it('prints Follow-up to {maker} drafted — not sent. over its DraftReview, the band’s landing', () => {
    mockDrafts.data = [FOLLOW_UP];
    renderCell(HALLORAN, null);
    expect(screen.getByTestId('line-date-request-status')).toHaveTextContent(
      'Follow-up to Halloran Joinery drafted — not sent.',
    );
    const landing = screen.getByTestId('line-held-maker-note');
    expect(within(landing).getByTestId('draft-review')).toBeInTheDocument();
  });

  it('a held date request keeps its own words', () => {
    mockDrafts.data = [{ ...ASK, created_at: '2026-10-07T15:00:00Z' }];
    renderCell(HALLORAN, null);
    expect(screen.getByTestId('line-date-request-status')).toHaveTextContent(
      'Date request to Halloran Joinery drafted — not sent.',
    );
  });

  it('a sent follow-up reads Followed up {day} · sent', () => {
    const at = '2026-10-03T16:00:00Z';
    mockDrafts.data = [{ ...FOLLOW_UP, status: 'sent', created_at: at, sent_at: at }];
    renderCell(HALLORAN, null);
    expect(screen.getByTestId('line-date-request-status')).toHaveTextContent(
      `Followed up ${dayMonth(at)} · sent`,
    );
  });
});
