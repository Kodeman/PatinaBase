/**
 * US-19 FR3 F3-22 (517-4, 517-1; `one-voice`): the Movement cell carries one
 * status line for the line's date request in every state, in the Desk's
 * words — held or awaiting, sending, sent — and a held Send's `Add an address`
 * lands on the vendor's terms with focus on the Orders email.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dayMonth } from '@/lib/document/dates';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockDrafts: { data: Record<string, unknown>[] } = { data: [] };
const mockDraftStatuses = jest.fn();
jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useProcurementDrafts: (_projectId: string, statuses: readonly string[]) => {
    mockDraftStatuses(statuses);
    return { data: mockDrafts.data };
  },
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
jest.mock('../date-text-input', () => ({
  DateTextInput: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
}));
const mockOpenLedger = jest.fn();
jest.mock('../command-bar', () => ({
  openLedger: (...args: unknown[]) => mockOpenLedger(...args),
}));
let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'one-voice' && mockOneVoice,
    isLoading: false,
  }),
}));

import { MovementCell } from '../line-unfold/movement-cell';

const ASK = {
  id: 'ask-1',
  kind: 'maker_eta_request',
  status: 'awaiting_review',
  purchase_order_id: null,
  ffe_item_id: 'line-1',
  to_email: 'orders@hewn.test',
  subject: 'Arrival date: Walnut console',
  body: 'Hello,\n\nWhen will it arrive?',
  created_at: '2026-10-07T15:00:00Z',
  sent_at: null,
};
const LINE = { id: 'line-1', vendor_name: 'Hewn', vendor_id: 'vendor-hewn' };

const renderCell = (item: Record<string, unknown>) =>
  render(
    <MovementCell
      item={{ status: 'approved', eta: null, ...item }}
      po={null}
      projectId="proj-1"
      poStatus={null}
      showAdvance={false}
      onAdvanced={jest.fn()}
    />,
  );

const statusLine = () => screen.getByTestId('line-date-request-status');

beforeEach(() => {
  mockDrafts.data = [];
  mockOneVoice = true;
  mockOpenLedger.mockReset();
  mockDraftStatuses.mockReset();
});

describe('MovementCell date request status line (F3-22, 517-4)', () => {
  it('awaiting review: Date request to {maker} drafted — not sent.', () => {
    mockDrafts.data = [ASK];
    renderCell(LINE);
    expect(statusLine()).toHaveTextContent('Date request to Hewn drafted — not sent.');
    expect(screen.getByTestId('draft-review')).toBeInTheDocument();
    // A sent request stands for its studio day, so the read carries sent.
    expect(mockDraftStatuses).toHaveBeenCalledWith(['awaiting_review', 'sending', 'sent']);
  });

  it('held (no address): the same line, the reason beneath the held Send, and the repair lands on terms', async () => {
    mockDrafts.data = [{ ...ASK, to_email: null }];
    renderCell(LINE);
    expect(statusLine()).toHaveTextContent('Date request to Hewn drafted — not sent.');
    expect(screen.queryByText('Date request drafted · no address')).toBeNull();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription('No address on file for Hewn.');

    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'vendors',
        vendorId: 'vendor-hewn',
        vendorPage: 'terms',
        focus: 'orders-email',
      }),
    );
  });

  it('a brand-only maker (no vendor record) is named, and Add an address lands on the maker selector', () => {
    const land = jest.fn();
    window.addEventListener('document:focus-ffe-line', land);
    mockDrafts.data = [{ ...ASK, to_email: null }];
    renderCell({ id: 'line-1', vendor_name: null, vendor_id: null, product: { brand: 'Fixture Metalworks' } });
    expect(statusLine()).toHaveTextContent('Date request to Fixture Metalworks drafted — not sent.');
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    expect((land.mock.calls[0][0] as CustomEvent).detail).toEqual({ itemId: 'line-1', cell: 'maker' });
    expect(mockOpenLedger).not.toHaveBeenCalled();
    window.removeEventListener('document:focus-ffe-line', land);
  });

  it('sending: Sending…', () => {
    mockDrafts.data = [{ ...ASK, status: 'sending', updated_at: new Date().toISOString() }];
    renderCell(LINE);
    expect(statusLine()).toHaveTextContent(/^Sending…$/);
    expect(screen.getByTestId('draft-review')).toBeInTheDocument();
  });

  it('sent this studio day: Asked {day} · sent, and no review left to take', () => {
    const sentAt = new Date().toISOString();
    mockDrafts.data = [{ ...ASK, status: 'sent', sent_at: sentAt }];
    renderCell(LINE);
    expect(statusLine()).toHaveTextContent(`Asked ${dayMonth(sentAt)} · sent`);
    expect(screen.queryByTestId('draft-review')).toBeNull();
  });

  it('flag off: today\'s cell, byte for byte', () => {
    mockOneVoice = false;
    mockDrafts.data = [{ ...ASK, to_email: null }];
    renderCell(LINE);
    expect(screen.queryByTestId('line-date-request-status')).toBeNull();
    expect(screen.getByText('Date request drafted · no address')).toBeInTheDocument();
    expect(mockDraftStatuses).toHaveBeenCalledWith(['awaiting_review', 'sending']);
  });
});
