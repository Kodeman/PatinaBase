import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SendSheet } from '../send-sheet';

const mockSend = jest.fn();
const mockUpdate = jest.fn();
const mockInvalidate = jest.fn();
const mockUseProposalMirrorData = jest.fn();
const mockUseDraftingState = jest.fn();
const mockRefreshDrafting = jest.fn();
let mockPaymentMutationsPending = 0;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  useIsMutating: () => mockPaymentMutationsPending,
}));

jest.mock('@/hooks/use-proposals', () => ({
  useProposal: () => ({
    data: {
      id: 'proposal-1',
      title: 'Lakeshore library & lounge',
      version: 1,
      total_amount: 1_320_000,
      client_id: 'client-1',
      client: {
        id: 'client-1',
        full_name: 'Harper Vale',
        email: 'harper@example.com',
      },
      items: [],
    },
  }),
  useProposalVersions: () => ({ data: [] }),
  useSendProposal: () => ({ mutateAsync: mockSend, isPending: false }),
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

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ _emailDispatched: true });
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
  mockPaymentMutationsPending = 0;
  mockUseDraftingState.mockReturnValue({
    gaps: [],
    isLoading: false,
    isFetching: false,
    refresh: mockRefreshDrafting,
  });
  mockUseProposalMirrorData.mockReset();
});

describe('SendSheet canonical client-copy validation', () => {
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
    await waitFor(() => expect(send).toBeDisabled());
    expect(screen.getByText('Still missing: mood boards.')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', {
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
    mockPaymentMutationsPending = 1;

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    expect(
      screen.getByText(/Checking the latest client preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeDisabled();
    expect(mockSend).not.toHaveBeenCalled();
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
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeEnabled();

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

    const { rerender } = render(
      <SendSheet proposalId="proposal-1" open onClose={jest.fn()} />,
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the missing parts/i,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Send proposal' }),
    ).toBeEnabled();

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
    mockRefreshDrafting.mockResolvedValueOnce({
      facets: {},
      state: 'Drafting',
      gaps: ['change-order terms'],
    });

    render(<SendSheet proposalId="proposal-1" open onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send proposal' }));

    await waitFor(() => expect(mockRefreshDrafting).toHaveBeenCalledTimes(1));
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
    reviewedMirror.refetch.mockResolvedValue({
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
      screen.getByRole('checkbox', {
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
});
