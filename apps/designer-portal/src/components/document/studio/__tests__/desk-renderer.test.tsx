/**
 * WP-01.8 — the Desk page mounts exactly one body for the renderer latch:
 * nothing but Today's quiet frames while it is pending, the legacy Desk when
 * it resolves legacy (the renderer-off path), the round-8 studio when it
 * resolves round 8. Never both.
 */
import { render, screen } from '@testing-library/react';

const mockRenderer = { current: { renderer: 'pending' } as { renderer: string; source?: string } };
const mockRound8Props = jest.fn();

jest.mock('@/hooks/use-paper-renderer', () => ({
  usePaperRenderer: () => mockRenderer.current,
}));
// Keep React.lazy and Suspense real; only the loaded body is stubbed.
jest.mock('@/components/document/studio/round8-desk', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockRound8Props(props);
    return <div data-testid="round8-desk" />;
  },
}));
jest.mock('@/components/document/frame/legacy-desk-body', () => ({
  LegacyDeskBody: () => <div data-testid="legacy-desk" />,
}));
jest.mock('@/components/loading', () => ({
  useLoadingRegister: () => false,
  DeskTodaySkeleton: () => <div data-testid="desk-skeleton" />,
}));

// Everything else the Desk page reads, inert (recent-boards-strip.test.tsx's set).
jest.mock('@patina/supabase', () => ({
  useRecentBoards: () => ({ data: [], isPending: false }),
  useStudioUnbilledTime: () => ({ data: [], isPending: false }),
  useRunningTimer: () => ({ data: undefined, isPending: false }),
  useProfile: () => ({ data: undefined }),
  useOrganizations: () => ({ data: [{ id: 'studio-1', type: 'design_studio', name: 'Middle West Studio' }] }),
  useOrganizationMembers: () => ({ data: [] }),
  useProjectLeads: () => ({ data: new Map(), isSuccess: true }),
  useNeedStates: () => ({ data: new Map() }),
  useTeammateActed: () => ({ data: new Map(), isSuccess: true }),
  useBoardsReactionRollup: () => ({ data: undefined, isPending: false }),
}));
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: {
      folders: [],
      chips: [],
      live: [{ engagement_id: 'eng-1', project_id: 'proj-1', title: 'Holloway Den', active_section: 'project' }],
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Leah' } }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/use-viewer-studio', () => ({ useViewerStudio: () => ({ isSettled: true }) }));
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false, isLoading: false }) }));
jest.mock('@/hooks/use-teaching-note', () => ({
  useReturnNote: () => ({ note: null, bind: null, sinceLine: null, decided: true }),
}));
jest.mock('@/components/document/command-bar', () => ({
  openCommandBar: jest.fn(),
  captureLeadPending: { value: false },
  openProjectPending: { value: false },
}));
jest.mock('@/lib/analytics/document-events', () => ({ documentEvents: { deskRendered: jest.fn() } }));
jest.mock('@/components/document/margin-note', () => ({ MarginNote: () => null }));
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  START_DESK_WALKTHROUGH_EVENT: 'document:start-desk-walkthrough',
  clearDeskWalkthroughLater: jest.fn(),
  useDeskWalkthroughOffer: () => false,
  useSuppressDeskFirstTouch: () => false,
}));
jest.mock('@/components/document/arrival/arrival-mount', () => ({ useArrivalWaiting: () => false }));
jest.mock('@/lib/help-system/use-document-surface', () => ({ useDocumentSurface: jest.fn() }));

import DeskPage from '../../../../app/(document)/desk/page';
import { resetDeskVisit } from '@/components/document/desk-arbiter';

beforeEach(() => {
  resetDeskVisit();
  mockRound8Props.mockClear();
});

describe('desk/page.tsx — one body per renderer decision', () => {
  it('mounts neither body while the latch is pending', () => {
    mockRenderer.current = { renderer: 'pending' };
    render(<DeskPage />);
    expect(screen.getByTestId('desk-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-desk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('round8-desk')).not.toBeInTheDocument();
  });

  it('mounts the legacy Desk, and only it, when the renderer is off (legacy)', () => {
    mockRenderer.current = { renderer: 'legacy', source: 'override' };
    render(<DeskPage />);
    expect(screen.getByTestId('legacy-desk')).toBeInTheDocument();
    expect(screen.queryByTestId('round8-desk')).not.toBeInTheDocument();
    expect(mockRound8Props).not.toHaveBeenCalled();
  });

  it('mounts the round-8 studio, and only it, on the same reads when the renderer is round 8', async () => {
    mockRenderer.current = { renderer: 'round8', source: 'override' };
    render(<DeskPage />);
    expect(await screen.findByTestId('round8-desk')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-desk')).not.toBeInTheDocument();
    const props = mockRound8Props.mock.calls.at(-1)![0];
    expect(props.studioName).toBe('Middle West Studio');
    expect(props.live).toEqual([expect.objectContaining({ engagement_id: 'eng-1' })]);
    expect(props.roster.groups.flatMap((group: { lines: unknown[] }) => group.lines)).toHaveLength(1);
    expect(typeof props.holdPlace).toBe('function');
  });
});
