import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { DraftingRoom } from './drafting-room';
import { useMobilePrimaryAction } from '../../mobile/mobile-shell';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
let mockProposalResult = {
  data: {
    id: 'proposal-1',
    title: 'Whitfield House',
    client_name: 'Sarah Whitfield',
    project_id: 'project-1',
    client_id: 'client-1',
    status: 'draft',
  } as any,
  isLoading: false,
  error: null as Error | null,
  refetch: jest.fn(),
};

const mockDraftingState = {
  facets: {
    rooms: true,
    ffe: true,
    palette: false,
    boards: false,
    phases: true,
    exclusions: false,
    payments: false,
    terms: false,
  },
  summary: {
    rooms: 2,
    ffe: 4,
    palettes: 0,
    boards: 0,
    phases: 2,
    exclusions: 0,
    payments: 0,
    swatches: 0,
    coTerms: false,
  },
  items: [],
  fill: [1, 0.25, 0] as [number, number, number],
  pct: 42,
  state: 'Drafting' as const,
  gaps: ['a palette', 'mood boards', 'exclusions'],
  isLoading: false,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@patina/utils', () => ({
  latestVerdictByLine: () => new Map(),
}));

jest.mock('@patina/supabase', () => ({
  useProposal: () => mockProposalResult,
  useProposalFeedback: () => ({ data: [] }),
  useScopeBuilderSummary: () => ({
    data: { totalFFEEstimateCents: 1000, totalDesignFeeCents: 500 },
  }),
  useUpdateProposalItem: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => mockDraftingState,
  useDraftingWritesPending: () => false,
}));

jest.mock('../room-shell', () => ({
  RoomShell: ({
    action,
    children,
  }: {
    action?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {action}
      {children}
    </>
  ),
}));

jest.mock('../../strata-mark', () => ({
  StrataMark: () => <span data-testid="strata-mark" />,
}));

jest.mock('../../status-chip', () => ({
  StatusChip: ({ label }: { label: string }) => <span>{label}</span>,
}));

jest.mock('../../proposal-share-instrument', () => ({
  ProposalShareInstrument: ({
    mobileSecondary,
  }: {
    mobileSecondary?: boolean;
  }) => (
    <span
      data-testid="proposal-share-instrument"
      data-mobile-secondary={mobileSecondary ? 'true' : 'false'}
    />
  ),
}));

jest.mock('@/lib/document/verdict-chip', () => ({
  verdictChipSpec: () => null,
}));

jest.mock('../../drafting/proposal-mirror', () => ({
  ProposalPreviewRail: ({ clientName }: { clientName?: string }) => (
    <div>Preview for {clientName ?? 'the client'}</div>
  ),
}));

jest.mock('../../overlays/send-sheet', () => ({
  SendSheet: () => null,
}));

jest.mock('@/components/portal/scope-builder/rooms-in-scope', () => ({
  RoomsInScope: () => <div>Rooms editor</div>,
}));
jest.mock('@/components/portal/scope-builder/ffe-schedule-builder', () => ({
  FFEScheduleBuilder: () => <div>FF&amp;E editor</div>,
}));
jest.mock('@/components/portal/scope-builder/palette-builder', () => ({
  PaletteBuilder: () => <div>Palette editor</div>,
}));
jest.mock('@/components/portal/scope-builder/boards-builder', () => ({
  BoardsBuilder: () => <div>Boards editor</div>,
}));
jest.mock('@/components/portal/scope-builder/phase-builder', () => ({
  PhaseBuilder: () => <div>Phases editor</div>,
}));
jest.mock('@/components/portal/scope-builder/exclusions-list', () => ({
  ExclusionsList: () => <div>Exclusions editor</div>,
}));
jest.mock(
  '@/components/portal/scope-builder/payment-milestones-builder',
  () => ({ PaymentMilestonesBuilder: () => <div>Payments editor</div> }),
);
jest.mock(
  '@/components/portal/scope-builder/change-order-terms-editor',
  () => ({ ChangeOrderTermsEditor: () => <div>Terms editor</div> }),
);

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));
jest.mock('@/lib/help-system/document-surface-keys', () => ({
  DOCUMENT_SURFACE_KEYS: { drafting: 'drafting' },
}));
jest.mock('./terms-agreement-body', () => ({
  TermsAgreementBody: () => <div>Agreement body</div>,
}));
jest.mock('./schedule-line-unfold', () => ({
  ScheduleLineUnfold: () => null,
}));
jest.mock('@/components/document/coordination/compose-decision-sheet', () => ({
  ComposeDecisionSheet: () => null,
}));
jest.mock('../../document-action', () => ({
  DocumentAction: ({
    children,
    onClick,
    className,
    actionKey,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    actionKey: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={className}
      data-action-key={actionKey}
    >
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));
jest.mock('@/lib/document/room-origin', () => ({
  clearRoomOrigin: jest.fn(),
  readRoomOrigin: () => '/desk',
}));
jest.mock('@/lib/help-system/open-help', () => ({
  openHelp: jest.fn(),
}));

describe('DraftingRoom quiet deep work', () => {
  beforeEach(() => {
    mockDraftingState.pct = 42;
    mockReplace.mockReset();
    mockProposalResult = {
      data: {
        id: 'proposal-1',
        title: 'Whitfield House',
        client_name: 'Sarah Whitfield',
        project_id: 'project-1',
        client_id: 'client-1',
        status: 'draft',
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    };
    jest.mocked(useMobilePrimaryAction).mockClear();
  });

  it('lands on the first incomplete facet and keeps exactly one facet open', async () => {
    render(<DraftingRoom proposalId="proposal-1" />);

    const rooms = screen.getByRole('button', { name: /Rooms/i });
    const palette = screen.getByRole('button', { name: /Palette/i });
    const payments = screen.getByRole('button', { name: /Payments/i });

    await waitFor(() =>
      expect(palette).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(rooms).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toHaveLength(1);

    fireEvent.click(payments);

    expect(palette).toHaveAttribute('aria-expanded', 'false');
    expect(payments).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toHaveLength(1);
  });

  it('opens the live client copy on demand below the permanent-rail breakpoint', () => {
    render(<DraftingRoom proposalId="proposal-1" />);

    const preview = screen.getByRole('button', {
      name: 'Preview client copy',
    });
    expect(preview).toHaveClass('min-[1440px]:hidden');
    expect(
      screen.queryByRole('dialog', { name: 'Client copy preview' }),
    ).not.toBeInTheDocument();

    fireEvent.click(preview);

    const dialog = screen.getByRole('dialog', {
      name: 'Client copy preview',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(
      within(dialog).getByText('Preview for Sarah Whitfield'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Previewing the copy for Sarah Whitfield.'),
    ).toBeInTheDocument();
  });

  it('publishes Share to mobile More even at 0% when Send is absent', () => {
    mockDraftingState.pct = 0;
    render(<DraftingRoom proposalId="proposal-1" />);

    expect(screen.getByTestId('proposal-share-instrument')).toHaveAttribute(
      'data-mobile-secondary',
      'true',
    );
    expect(
      document.querySelector('[data-action-key="send-proposal"]'),
    ).toBeNull();
    expect(useMobilePrimaryAction).toHaveBeenLastCalledWith(null);
  });

  it('never mounts editors for an issued proposal and redirects to the document', async () => {
    mockProposalResult = {
      ...mockProposalResult,
      data: { ...mockProposalResult.data, status: 'sent' },
    };

    render(<DraftingRoom proposalId="proposal-1" />);

    expect(screen.getByText(/already been issued/i)).toBeInTheDocument();
    expect(screen.queryByText('Rooms editor')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/doc/proposal-1'),
    );
  });

  it('fails closed and retries when draft status cannot be verified', () => {
    const retry = jest.fn();
    mockProposalResult = {
      data: undefined,
      isLoading: false,
      error: new Error('read failed'),
      refetch: retry,
    };

    render(<DraftingRoom proposalId="proposal-1" />);

    expect(screen.getByText(/editing stays closed/i)).toBeInTheDocument();
    expect(screen.queryByText('Rooms editor')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
