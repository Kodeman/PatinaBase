/**
 * US-31 B5a — the ready-to-send sheet. Staged messages group by who they
 * reach (Clients · Vendors · Trades, a trade's texts as one "Today's texts"
 * group, procurement letters under Vendors); checked rows go together through
 * useSendOutboundDrafts, opened or not, and each row says how its send went.
 * A seat that may not send (Q11) sees and edits, never sends.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReadyToSendSheet } from '../ready-to-send-sheet';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const mockSend = jest.fn();
const mockUpdate = jest.fn();
const mockDiscard = jest.fn();
const mockRecheck = jest.fn();
let mockCanSend = true;
let mockReady = true;
let mockStudioMembers: Array<{ user_id: string; role: string }> = [];
const mockRefetchMembers = jest.fn();

const row = (over: Record<string, unknown>) => ({
  id: 'x',
  project_id: 'p1',
  organization_id: 'studio-1',
  kind: 'invoice_reminder',
  channel: 'email',
  recipient_kind: 'client',
  status: 'awaiting_review',
  to_address: 'greta@whitfield.test',
  subject: 'Invoice 1001',
  body: 'A reminder about invoice 1001.',
  created_at: '2026-10-13T08:00:00Z',
  updated_at: '2026-10-13T08:00:00Z',
  claimed_at: null,
  ref_type: 'invoice',
  ref_id: 'invoice-1001',
  last_send_outcome: null,
  ...over,
});

const OUTBOUND = [
  row({ id: 'out-client' }),
  row({ id: 'out-vendor', kind: 'delivery_confirm', recipient_kind: 'vendor', to_address: 'ship@hale.test', created_at: '2026-10-13T08:01:00Z' }),
  row({ id: 'out-text-1', kind: 'trade_day_of', channel: 'sms', recipient_kind: 'trade', to_address: '+15550101', subject: null, body: 'Tomorrow 8am at Whitfield.', created_at: '2026-10-13T08:02:00Z' }),
  row({ id: 'out-text-2', kind: 'trade_day_of', channel: 'sms', recipient_kind: 'trade', to_address: '+15550102', subject: null, body: 'Tomorrow 9am at Whitfield.', created_at: '2026-10-13T08:03:00Z' }),
  row({ id: 'out-sent', status: 'sent', created_at: '2026-10-13T07:00:00Z' }),
];
let mockOutbound = OUTBOUND;

jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useOrganizationMembers: () => ({ data: mockStudioMembers, isSuccess: true, refetch: mockRefetchMembers }),
  useOutboundDrafts: () => ({ data: mockOutbound, isLoading: false, isError: false }),
  useProcurementDrafts: () => ({
    data: [{ id: 'letter-1', kind: 'ack_chase', status: 'awaiting_review', to_email: 'orders@hale.test', subject: 'PO 1042', body: 'Hello' }],
  }),
  useSendOutboundDrafts: () => ({ mutateAsync: mockSend, isPending: false }),
  useUpdateOutboundDraft: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDiscardOutboundDraft: () => ({ mutateAsync: mockDiscard, isPending: false }),
}));

jest.mock('../../buying/draft-review', () => ({
  DraftReview: ({ draft }: { draft: { id: string } }) => (
    <div data-testid="procurement-draft-review">{draft.id}</div>
  ),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

jest.mock('../../acts/act-viewer', () => ({
  useActViewer: () => ({
    ready: mockReady,
    canSend: mockCanSend,
    leadFirstName: mockCanSend ? null : 'Leah',
    handoff: null,
    recheck: mockRecheck,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanSend = true;
  mockReady = true;
  mockStudioMembers = [];
  mockOutbound = OUTBOUND;
  mockRefetchMembers.mockResolvedValue({ data: [], isError: false });
  mockRecheck.mockResolvedValue(true);
  mockSend.mockResolvedValue({ results: [] });
  mockUpdate.mockResolvedValue({});
});

const group = (key: string) =>
  document.querySelector(`[data-outbound-group="${key}"]`) as HTMLElement;
const batchButton = () => screen.getByRole('button', { name: /^Send the \d+ checked$/ });

describe('ReadyToSendSheet', () => {
  it('shows the loading lead reason while the lead is unresolved', () => {
    mockReady = false;
    mockCanSend = false;
    render(<ReadyToSendSheet projectId="p1" />);
    const row = document.querySelector('[data-outbound-row="out-client"]')!;
    fireEvent.click(within(row).getByRole('button', { name: /Invoice reminder/ }));
    expect(within(row).getByText('Loading who leads this project…')).toBeInTheDocument();
    const send = within(row).getByRole('button', { name: 'Send' });
    expect(document.getElementById(send.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Loading who leads this project…',
    );
  });

  it('groups staged messages as Clients · Vendors · Trades, texts together', () => {
    render(<ReadyToSendSheet projectId="p1" />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Clients', 'Vendors', 'Trades']);

    expect(within(group('client')).getByText('Invoice reminder')).toBeInTheDocument();
    expect(within(group('vendor')).getByText('Delivery confirmation')).toBeInTheDocument();
    // Procurement letters ride under Vendors with their own review.
    expect(within(group('vendor')).getByTestId('procurement-draft-review')).toHaveTextContent('letter-1');
    // A trade's texts read as one group.
    expect(within(group('trade')).getByText("Today's texts (2)")).toBeInTheDocument();
    expect(within(group('trade')).getAllByText('Day-of text to the trade')).toHaveLength(2);
    // A sent message this sheet did not send is not on it.
    expect(document.querySelector('[data-outbound-row="out-sent"]')).toBeNull();
    expect(batchButton()).toHaveTextContent('Send the 0 checked');
  });

  it('lists only studio-level drafts and holds sending for owner/admin roles', () => {
    mockOutbound = [
      row({ id: 'studio-outbound', project_id: null }),
      row({ id: 'other-studio-outbound', project_id: null, organization_id: 'studio-2' }),
      row({ id: 'project-outbound', project_id: 'p1' }),
    ];
    render(<ReadyToSendSheet studioId="studio-1" />);
    expect(document.querySelector('[data-outbound-row="studio-outbound"]')).toBeInTheDocument();
    expect(document.querySelector('[data-outbound-row="other-studio-outbound"]')).toBeNull();
    expect(document.querySelector('[data-outbound-row="project-outbound"]')).toBeNull();
    expect(screen.getByText('Only an owner or admin can send studio-level messages.')).toBeInTheDocument();
    expect(batchButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('allows a studio owner to send a studio-level draft after rechecking the seat', async () => {
    mockOutbound = [
      row({ id: 'studio-outbound', project_id: null }),
      row({ id: 'other-studio-outbound', project_id: null, organization_id: 'studio-2' }),
    ];
    mockStudioMembers = [{ user_id: 'user-1', role: 'owner' }];
    mockRefetchMembers.mockResolvedValue({
      data: [{ user_id: 'user-1', role: 'owner' }],
      isError: false,
    });
    mockSend.mockResolvedValue({ results: [{ id: 'studio-outbound', ok: true }] });
    render(<ReadyToSendSheet studioId="studio-1" />);
    expect(document.querySelector('[data-outbound-row="other-studio-outbound"]')).toBeNull();
    const currentDraftRow = document.querySelector('[data-outbound-row="studio-outbound"]')!;
    fireEvent.click(within(currentDraftRow).getByRole('checkbox'));
    fireEvent.click(batchButton());
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith(['studio-outbound']));
    expect(mockRefetchMembers).toHaveBeenCalled();
  });

  it('holds a stalled sending draft without a recorded outcome after reload', () => {
    mockOutbound = [
      row({
        id: 'stalled-outbound',
        status: 'sending',
        claimed_at: new Date(Date.now() - 11 * 60_000).toISOString(),
        updated_at: new Date(Date.now() - 11 * 60_000).toISOString(),
      }),
    ];
    render(<ReadyToSendSheet projectId="p1" />);
    fireEvent.click(within(group('client')).getByRole('button', { name: /Invoice reminder/ }));
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument();
    expect(screen.getByText(/Check its recorded send outcome/)).toBeVisible();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends the checked rows, opened or not, and says how each went', async () => {
    mockSend.mockResolvedValue({
      results: [
        { id: 'out-client', ok: true },
        { id: 'out-text-1', ok: false, error: 'The number has opted out' },
      ],
    });
    render(<ReadyToSendSheet projectId="p1" />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Check Invoice reminder to greta/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Check Day-of text to the trade to \+15550101/ }));
    expect(batchButton()).toHaveTextContent('Send the 2 checked');

    fireEvent.click(batchButton());
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockRecheck).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(['out-client', 'out-text-1']);

    const sent = document.querySelector('[data-outbound-row="out-client"]') as HTMLElement;
    await waitFor(() => expect(within(sent).getByText('Sent')).toBeInTheDocument());
    const refused = document.querySelector('[data-outbound-row="out-text-1"]') as HTMLElement;
    expect(within(refused).getByText('Held — check outcome')).toBeInTheDocument();
    expect(within(refused).getByRole('alert')).toHaveTextContent(
      'Check its recorded send outcome before sending again.',
    );
    fireEvent.click(within(refused).getByRole('button', { name: /Day-of text/ }));
    expect(within(refused).getByText('Send held: The number has opted out.')).toBeVisible();
    expect(within(refused).getByRole('checkbox')).toBeDisabled();
    expect(batchButton()).toHaveTextContent('Send the 0 checked');
  });

  it('checks every text with the group control', () => {
    render(<ReadyToSendSheet projectId="p1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: "Check all of today's texts" }));
    expect(batchButton()).toHaveTextContent('Send the 2 checked');
  });

  it('saves an opened edit before it sends', async () => {
    mockSend.mockResolvedValue({ results: [{ id: 'out-client', ok: true }] });
    render(<ReadyToSendSheet projectId="p1" />);
    fireEvent.click(within(group('client')).getByRole('button', { name: /Invoice reminder/ }));
    fireEvent.change(screen.getByLabelText('Correspondence'), { target: { value: 'Edited reminder.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith(['out-client']));
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'out-client', subject: 'Invoice 1001', body: 'Edited reminder.' });
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]!);
  });

  it('sends nothing when the lead changed since the sheet opened', async () => {
    mockRecheck.mockResolvedValue(false);
    render(<ReadyToSendSheet projectId="p1" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Check Invoice reminder to greta/ }));
    fireEvent.click(batchButton());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Who leads this project changed'),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('holds Send and the batch for a seat that is not the lead (Q11)', async () => {
    mockCanSend = false;
    render(<ReadyToSendSheet projectId="p1" />);
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
    expect(batchButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Leah sees this first.')).toBeInTheDocument();
    fireEvent.click(batchButton());

    // She can open, read and edit, and saves her edit for the lead.
    fireEvent.click(within(group('client')).getByRole('button', { name: /Invoice reminder/ }));
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(send);
    fireEvent.change(screen.getByLabelText('Correspondence'), { target: { value: 'Softer wording.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the draft for Leah' }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ id: 'out-client', subject: 'Invoice 1001', body: 'Softer wording.' }),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
