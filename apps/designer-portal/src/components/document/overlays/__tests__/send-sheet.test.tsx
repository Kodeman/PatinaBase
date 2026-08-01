import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SendSheet } from '../send-sheet';
import { useBufferedAutosave } from '@/hooks/use-buffered-autosave';
import {
  registerProposalAutosave,
  resetProposalAutosaveRegistryForTests,
} from '@/lib/proposal-autosave-registry';

const mockSend = jest.fn();
const mockRetry = jest.fn();
const mockUpdate = jest.fn();
const mockInvalidate = jest.fn();
const mockUseProposalMirrorData = jest.fn();
const mockUseDraftingState = jest.fn();
const mockRefreshDrafting = jest.fn();
let mockPendingProposalMutation: {
  options: { mutationKey: string[] };
  state: { variables: Record<string, unknown> };
} | null = null;
let mockProposal: Record<string, unknown>;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  useIsMutating: ({ predicate }: { predicate: (mutation: unknown) => boolean }) =>
    (mockPendingProposalMutation && predicate(mockPendingProposalMutation)
      ? 1
      : 0),
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({
    data: mockProposal,
  }),
  useProposalVersions: () => ({ data: [] }),
  useSendProposal: () => ({ mutateAsync: mockSend, isPending: false }),
  useRetryProposalSend: () => ({
    mutateAsync: mockRetry,
    isPending: false,
  }),
  useUpdateProposal: () => ({ mutate: mockUpdate, isPending: false }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: (...args: unknown[]) => mockUseDraftingState(...args),
}));

jest.mock('@/hooks/use-clients', () => ({
  useClient: () => ({ data: null, isLoading: false }),
  useInviteAndLinkClient: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/components/document/drafting/proposal-mirror', () => ({
  useProposalMirrorData: (...args: unknown[]) =>
    mockUseProposalMirrorData(...args),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

jest.mock('@/components/portal/toast-provider', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { sent: jest.fn() },
}));

jest.mock('../doc-sheet', () => ({
  DocSheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

jest.mock('../../document-action', () => ({
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DocumentAction: ({
    children,
    loading,
    loadingLabel,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    loading?: boolean;
    loadingLabel?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {loading ? loadingLabel : children}
    </button>
  ),
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
    refetch: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

function SendBarrierHarness({
  save,
}: {
  save: (key: string, patch: { revision_limit: number }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const autosave = useBufferedAutosave<
    string,
    { revision_limit: number }
  >({
    proposalId: 'proposal-1',
    delay: 60_000,
    save,
  });

  return (
    <>
      <button
        type="button"
        onClick={() =>
          autosave.queue('phase-1', { revision_limit: 3 })
        }
      >
        Queue phase revision
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open send sheet
      </button>
      <SendSheet
        proposalId="proposal-1"
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

beforeEach(() => {
  mockProposal = {
    id: 'proposal-1',
    title: 'Lakeshore library & lounge',
    version: 1,
    status: 'draft',
    sent_at: null,
    proposal_send_dispatch_id: null,
    total_amount: 1_320_000,
    client_id: 'client-1',
    client: {
      id: 'client-1',
      full_name: 'Harper Vale',
      email: 'harper@example.com',
    },
    items: [],
  };
  mockSend.mockReset();
  mockSend.mockResolvedValue({
    _emailDispatched: true,
    _emailDeliveryState: 'delivered',
    _emailRetryable: false,
  });
  mockRetry.mockReset();
  mockRetry.mockResolvedValue({
    _emailDispatched: true,
    _emailDeliveryState: 'delivered',
    _emailRetryable: false,
  });
  mockUpdate.mockReset();
  mockInvalidate.mockReset();
  mockInvalidate.mockResolvedValue(undefined);
  mockUseDraftingState.mockReset();
  mockRefreshDrafting.mockReset();
  mockRefreshDrafting.mockResolvedValue({
    facets: {},
    state: 'Ready to send',
    gaps: [],
  });
  mockPendingProposalMutation = null;
  mockUseDraftingState.mockReturnValue({
    gaps: [],
    isLoading: false,
    isFetching: false,
    refresh: mockRefreshDrafting,
  });
  mockUseProposalMirrorData.mockReset();
});

afterEach(() => resetProposalAutosaveRegistryForTests());

describe('SendSheet canonical client-copy validation', () => {
  it('flushes a debounced proposal edit before opening review and sending', async () => {
    const reviewedMirror = mirror([
      {
        id: 'deposit',
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    ]);
    const freshData = {
      ...reviewedMirror.data,
      sendSnapshot: {
        ...reviewedMirror.data.sendSnapshot,
        scheduleFingerprint: 'after-phase-autosave',
      },
    };
    const order: string[] = [];
    let persisted = false;
    reviewedMirror.refetch.mockImplementation(async () => {
      order.push('refetch');
      return {
        data: persisted ? freshData : reviewedMirror.data,
        error: null,
      };
    });
    mockUseProposalMirrorData.mockReturnValue(reviewedMirror);
    const save = jest.fn(async () => {
      order.push('save');
      persisted = true;
    });

    render(<SendBarrierHarness save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Queue phase revision' }));
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open send sheet' }));

    const send = await screen.findByRole('button', { name: 'Send proposal' });
    await waitFor(() => expect(send).toBeEnabled());
    expect(
      screen.queryByRole('button', { name: /different address/i }),
    ).not.toBeInTheDocument();
    expect(order.slice(0, 2)).toEqual(['save', 'refetch']);

    fireEvent.click(send);
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ expectedSnapshot: freshData.sendSnapshot }),
    );
  });

  it('fails closed when a debounced proposal edit cannot be saved', async () => {
    const reviewedMirror = mirror([
      {
        id: 'deposit',
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    ]);
    mockUseProposalMirrorData.mockReturnValue(reviewedMirror);
    const save = jest.fn().mockRejectedValue(new Error('phase save failed'));

    render(<SendBarrierHarness save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Queue phase revision' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open send sheet' }));

    expect(await screen.findByText(/phase save failed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(reviewedMirror.refetch).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('retries review when the autosave registry changes clean-to-clean during the mirror read', async () => {
    const reviewedMirror = mirror([
      {
        id: 'deposit',
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    ]);
    const freshData = {
      ...reviewedMirror.data,
      sendSnapshot: {
        ...reviewedMirror.data.sendSnapshot,
        scheduleFingerprint: 'after-clean-registry-change',
      },
    };
    const registration = registerProposalAutosave('proposal-1', {
      getSnapshot: () => ({ dirty: false, flushing: false, error: null }),
      flush: async () => {},
    });
    reviewedMirror.refetch
      .mockImplementationOnce(async () => {
        registration.notify();
        return { data: reviewedMirror.data, error: null };
      })
      .mockResolvedValue({ data: freshData, error: null });
    mockUseProposalMirrorData.mockReturnValue(reviewedMirror);

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    const send = screen.getByRole('button', { name: 'Send proposal' });
    await waitFor(() => expect(send).toBeEnabled());
    expect(reviewedMirror.refetch).toHaveBeenCalledTimes(2);

    fireEvent.click(send);
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ expectedSnapshot: freshData.sendSnapshot }),
    );
  });

  it('blocks the exact New Milestone 0%/$0 client payload', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'milestone-1',
          label: 'New Milestone',
          percentage: 0,
          amount_cents: 0,
        },
      ]),
    );

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(await screen.findByText('Not safe to send yet')).toBeInTheDocument();
    expect(screen.getByText(/must total 100%/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('requires an explicit acknowledgement before sending an incomplete draft', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockUseDraftingState.mockReturnValue({
      gaps: ['mood boards'],
      isLoading: false,
      isFetching: false,
      refresh: mockRefreshDrafting,
    });
    mockRefreshDrafting.mockResolvedValue({
      facets: {},
      state: 'Drafting',
      gaps: ['mood boards'],
    });

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    const send = screen.getByRole('button', { name: 'Send proposal' });
    expect(
      await screen.findByText('Still missing: mood boards.'),
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    );
    await waitFor(() => expect(send).toBeEnabled());

    fireEvent.click(send);
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  });

  it('blocks send while a payment edit is still being persisted', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockPendingProposalMutation = {
      options: { mutationKey: ['proposal-payment-schedule'] },
      state: { variables: { proposalId: 'proposal-1' } },
    };

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(
      screen.getByText(/Checking the latest client preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('blocks send while any client-copy child write is pending', () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockPendingProposalMutation = {
      options: { mutationKey: ['proposal-client-copy'] },
      state: { variables: { proposalId: 'proposal-1' } },
    };

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Checking the latest client preview/i),
    ).toBeInTheDocument();
  });

  it('keeps send blocked while cached complete client data is refetching', async () => {
    const cachedMirror = mirror([
      {
        id: 'deposit',
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    ]);
    mockUseProposalMirrorData.mockReturnValue(cachedMirror);

    const { rerender } = render(
      <SendSheet proposalId="proposal-1" open onClose={jest.fn()} />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send proposal' }),
      ).toBeEnabled(),
    );

    mockUseProposalMirrorData.mockReturnValue({
      ...cachedMirror,
      isFetching: true,
    });
    rerender(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    const send = screen.getByRole('button', { name: 'Send proposal' });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('keeps send blocked while canonical drafting gaps are refetching', () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockUseDraftingState.mockReturnValue({
      gaps: [],
      isLoading: false,
      isFetching: true,
      refresh: mockRefreshDrafting,
    });

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Checking the latest client preview/i),
    ).toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('fails closed when a canonical drafting facet cannot be read', () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockUseDraftingState.mockReturnValue({
      gaps: [],
      isLoading: false,
      isFetching: false,
      error: new Error('proposal items unavailable'),
      refresh: mockRefreshDrafting,
    });

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /proposal readiness could not be verified/i,
    );
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /different address/i }),
    ).not.toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('resets incomplete acknowledgement when the missing-part fingerprint changes', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockUseDraftingState.mockReturnValue({
      gaps: ['mood boards'],
      isLoading: false,
      isFetching: false,
      refresh: mockRefreshDrafting,
    });
    mockRefreshDrafting.mockResolvedValue({
      facets: {},
      state: 'Drafting',
      gaps: ['mood boards'],
    });

    const { rerender } = render(
      <SendSheet proposalId="proposal-1" open onClose={jest.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    );
    expect(screen.getByRole('button', { name: 'Send proposal' })).toBeEnabled();

    mockUseDraftingState.mockReturnValue({
      gaps: ['mood boards', 'change-order terms'],
      isLoading: false,
      isFetching: false,
      refresh: mockRefreshDrafting,
    });
    rerender(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send proposal' }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    ).not.toBeChecked();
  });

  it('refreshes drafting gaps immediately before send and blocks on a newly found gap', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    const send = screen.getByRole('button', { name: 'Send proposal' });
    await waitFor(() => expect(send).toBeEnabled());
    mockRefreshDrafting.mockResolvedValueOnce({
      facets: {},
      state: 'Drafting',
      gaps: ['change-order terms'],
    });

    fireEvent.click(send);

    await waitFor(() => expect(mockRefreshDrafting).toHaveBeenCalledTimes(2));
    expect(mockSend).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Still missing: change-order terms.'),
    ).toBeInTheDocument();
  });

  it('requires a second explicit send when the refreshed mirror token changed', async () => {
    const reviewedMirror = mirror([
      {
        id: 'deposit',
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    ]);
    const refreshedData = {
      ...reviewedMirror.data,
      sendSnapshot: {
        ...reviewedMirror.data.sendSnapshot,
        scheduleFingerprint: 'schedule-fingerprint-v2',
      },
    };
    reviewedMirror.refetch
      .mockResolvedValueOnce({
        data: reviewedMirror.data,
        error: null,
      })
      .mockResolvedValue({
        data: refreshedData,
        error: null,
      });
    mockUseProposalMirrorData.mockReturnValue(reviewedMirror);
    mockUseDraftingState.mockReturnValue({
      gaps: ['mood boards'],
      isLoading: false,
      isFetching: false,
      refresh: mockRefreshDrafting,
    });
    mockRefreshDrafting.mockResolvedValue({
      facets: {},
      state: 'Drafting',
      gaps: ['mood boards'],
    });

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send proposal' }));

    expect(
      await screen.findByText(/client copy changed during the final check/i),
    ).toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
    expect(
      screen.getByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    ).not.toBeChecked();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send proposal' }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ expectedSnapshot: refreshedData.sendSnapshot }),
    );
  });

  it('keeps a retry path when business send commits but edge invocation is pending', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockSend.mockResolvedValueOnce({
      sent_at: '2026-07-31T12:01:00.000Z',
      proposal_send_dispatch_id: 'dispatch-1',
      _emailDispatched: false,
      _emailDeliveryState: 'pending',
      _emailRetryable: true,
    });
    const onClose = jest.fn();

    render(<SendSheet proposalId="proposal-1" open onClose={onClose} />);
    const send = screen.getByRole('button', { name: 'Send proposal' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    expect(
      await screen.findByText(/email is queued but has not been dispatched/i),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry email delivery' }),
    );

    await waitFor(() =>
      expect(mockRetry).toHaveBeenCalledWith({
        proposalId: 'proposal-1',
        dispatchId: 'dispatch-1',
        sentAt: '2026-07-31T12:01:00.000Z',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not offer a provider resend after the safe retry window ends', async () => {
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );
    mockSend.mockResolvedValueOnce({
      sent_at: '2026-07-31T12:01:00.000Z',
      proposal_send_dispatch_id: 'dispatch-1',
      _emailDispatched: false,
      _emailDeliveryState: 'ambiguous',
      _emailRetryable: false,
    });

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);
    const send = screen.getByRole('button', { name: 'Send proposal' });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    expect(
      await screen.findByText(/safe email retry window has ended/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /retry email delivery/i }),
    ).not.toBeInTheDocument();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('reopens an already-sent proposal on its immutable email retry tuple', async () => {
    mockProposal = {
      ...mockProposal,
      status: 'sent',
      sent_at: '2026-07-31T12:01:00.000Z',
      proposal_send_dispatch_id: 'dispatch-1',
    };
    mockUseProposalMirrorData.mockReturnValue(
      mirror([
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 1_320_000,
        },
      ]),
    );

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(
      await screen.findByRole('button', { name: 'Retry email delivery' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Send proposal' }),
    ).not.toBeInTheDocument();
  });
});
