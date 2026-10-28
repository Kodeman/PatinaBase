import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SendSheet } from '../send-sheet';

// The real DocSheet: its initial focus lands in a frame after open, so each
// press waits for it before the spotlight moves focus to the fixer.
const mockUseProposalMirrorData = jest.fn();
const mockUseDraftingState = jest.fn();
let mockProposal: Record<string, unknown>;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useIsMutating: () => 0,
}));
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
}));
jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({ data: mockProposal, isError: false, error: null }),
  useProposalVersions: () => ({ data: [] }),
  useSendProposal: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRetryProposalSend: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProposalSendDispatchStatus: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useUpdateProposal: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: (...args: unknown[]) => mockUseDraftingState(...args),
}));
jest.mock('@/hooks/use-clients', () => ({
  useClient: () => ({ data: null, isLoading: false }),
  useInviteAndLinkClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false, isLoading: false }) }));
jest.mock('@/components/document/drafting/proposal-mirror', () => ({
  useProposalMirrorData: (...args: unknown[]) => mockUseProposalMirrorData(...args),
}));
jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => <button type="button">Choose client</button>,
}));
jest.mock('@/components/portal/toast-provider', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/hooks/use-teaching-note', () => ({ useTeachingNoteFor: () => ({ note: null, bind: null }) }));
jest.mock('@/lib/analytics', () => ({ proposalEvents: { sent: jest.fn() } }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

function mirror(milestones: Array<Record<string, unknown>>) {
  const data = {
    totalCents: 1_320_000,
    milestones,
    paymentSchedule: { storedAmountsMatch: true },
    sendSnapshot: {
      proposalUpdatedAt: '2026-07-31T12:00:00.000Z',
      proposalTotalAmount: 1_320_000,
      scheduleFingerprint: 'schedule-fingerprint-v1',
    },
  };
  return {
    data,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(async () => ({ data, error: null })),
  };
}
const PAID_IN_FULL = [{ id: 'deposit', label: 'Project deposit', percentage: 100, amount_cents: 1_320_000 }];
const EMPTY_MILESTONE = [{ id: 'milestone-1', label: 'New Milestone', percentage: 0, amount_cents: 0 }];

beforeEach(() => {
  mockProposal = {
    id: 'proposal-1', title: 'Lakeshore library', version: 1, status: 'draft',
    sent_at: null, proposal_send_dispatch_id: null, total_amount: 1_320_000,
    client_id: 'client-1', client: { id: 'client-1', full_name: 'Harper Vale', email: 'harper@example.com' },
    items: [],
  };
  mockUseProposalMirrorData.mockReturnValue(mirror(PAID_IN_FULL));
  mockUseDraftingState.mockReturnValue({
    gaps: [], isLoading: false, isFetching: false, refresh: async () => ({ facets: {}, gaps: [] }),
  });
});

function renderSheet() {
  return render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);
}

/** Settle DocSheet's own initial focus, then press the held Send. */
async function pressHeldSend() {
  const panel = await screen.findByRole('dialog', { name: 'Send proposal' });
  await waitFor(() => expect(panel).toHaveFocus());
  const send = screen.getByRole('button', { name: 'Send proposal' });
  await waitFor(() => expect(send).toHaveAttribute('aria-disabled', 'true'));
  fireEvent.click(send);
  await screen.findByText(/needs? attention/i);
}

function expectLive(...els: HTMLElement[]) {
  for (const el of els) expect(el.closest('[inert]')).toBeNull();
}

describe('SendSheet spotlight windows its fix regions (real DocSheet)', () => {
  it('windows the Link-a-client banner, its control live and focused', async () => {
    mockProposal.client_id = null;
    mockProposal.client = null;
    renderSheet();
    await pressHeldSend();

    const control = screen.getByRole('button', { name: 'Choose client' });
    const label = screen.getByText('Link a client to send');
    expectLive(control, label);
    await waitFor(() => expect(control).toHaveFocus());
  });

  it('windows the CC label, input and error, the input focused', async () => {
    renderSheet();
    const input = await screen.findByRole('textbox', { name: 'CC (optional)' });
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    await pressHeldSend();

    expectLive(input, screen.getByText('CC (optional)'), screen.getByText('Enter a valid CC email address before sending.'));
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('windows the acknowledgement label, warnings and reason, the checkbox focused', async () => {
    mockUseDraftingState.mockReturnValue({
      gaps: ['mood boards'], isLoading: false, isFetching: false,
      refresh: async () => ({ facets: {}, gaps: ['mood boards'] }),
    });
    renderSheet();
    const checkbox = await screen.findByRole('checkbox', { name: /I reviewed the missing parts/i });
    await pressHeldSend();

    expectLive(
      checkbox,
      screen.getByText('I reviewed the missing parts and still want to send this version.'),
      screen.getByText('This draft is incomplete'),
      document.getElementById('send-sheet-ack-hold-reason')!,
    );
    await waitFor(() => expect(checkbox).toHaveFocus());
  });

  it('keeps the blockers listed once the CC is corrected, never "All set."', async () => {
    mockUseProposalMirrorData.mockReturnValue(mirror(EMPTY_MILESTONE));
    renderSheet();
    const input = await screen.findByRole('textbox', { name: 'CC (optional)' });
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    await pressHeldSend();
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: 'partner@example.com' } });
    await waitFor(() =>
      expect(screen.queryByText('Enter a valid CC email address before sending.')).toBeNull(),
    );
    expect(document.querySelector('[data-hold-spotlight-window="send-sheet-blockers-hold"]')).toBeInTheDocument();
    expectLive(screen.getByText('Not safe to send yet'));
    expect(screen.getByText(/needs? attention/i)).toBeInTheDocument();
    expect(screen.queryByText('All set.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send proposal' })).toHaveAttribute('aria-disabled', 'true');
  });
});
