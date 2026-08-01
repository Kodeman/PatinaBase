import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SendSheet } from '../send-sheet';

const mockSend = jest.fn();
const mockUpdate = jest.fn();
const mockInvalidate = jest.fn();
const mockUseProposalMirrorData = jest.fn();
const mockUseDraftingState = jest.fn();
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
  return {
    data: {
      totalCents: 1_320_000,
      milestones,
      paymentSchedule: { storedAmountsMatch: true },
    },
    isLoading: false,
    isFetching: false,
    error: null,
  };
}

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ _emailDispatched: true });
  mockUpdate.mockReset();
  mockInvalidate.mockReset();
  mockInvalidate.mockResolvedValue(undefined);
  mockUseDraftingState.mockReset();
  mockPaymentMutationsPending = 0;
  mockUseDraftingState.mockReturnValue({
    gaps: [],
    isLoading: false,
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
});
