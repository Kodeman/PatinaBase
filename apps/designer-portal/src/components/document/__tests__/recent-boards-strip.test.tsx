/**
 * IA-17 — `RecentBoardsStrip` gains a `compact` variant for the Desk's
 * boards rail (desk/page.tsx, ≥1280px). The full strip's existing behaviour
 * (D5 — `desk/page.test.tsx`) must stay unchanged when `compact` is absent;
 * `compact` renders at most three boards, a 92px cover, and name plus
 * relative time only — no room/owner line, no verdict summary.
 */
import { render, screen } from '@testing-library/react';

const mockRecentBoards = jest.fn();

jest.mock('@patina/supabase', () => ({
  useRecentBoards: (...args: unknown[]) => mockRecentBoards(...args),
  // The remaining exports are only exercised by the DeskPage-level describe
  // block below (the grid/rail wiring) — inert defaults, nothing under test
  // there reads them.
  useProfile: () => ({ data: undefined }),
  useOrganizations: () => ({ data: undefined }),
  useOrganizationMembers: () => ({ data: undefined }),
  useProjects: () => ({ data: undefined }),
  useStudioContacts: () => ({ data: undefined }),
  useBoardsReactionRollup: () => ({
    data: { awaitingReaction: [], reactionsIn: [], approvedPipeline: [], capped: false },
    isLoading: false,
    isError: false,
  }),
}));

// ── The DeskPage-level describe block below only. ─────────────────────────
// Same shape as desk/page.test.tsx's stub set (that file is D3's regression
// witness, not this lane's to edit) — everything the Desk mounts besides the
// grid/rail wiring under test here is inert.
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: { folders: [], chips: [], live: [] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
// The roster's day's line reads project_notes; this suite mounts no
// QueryClient, so the read is stubbed like every other Desk feed here.
jest.mock('@/hooks/use-answered-notes', () => ({
  useAnsweredNotes: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Leah' } }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('@/components/document/command-bar', () => ({
  openCommandBar: jest.fn(),
  captureLeadPending: { value: false },
  openProjectPending: { value: false },
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { deskRendered: jest.fn(), actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/components/document/desk-contents', () => ({ DeskContents: () => null }));
jest.mock('@/components/document/margin-note', () => ({ MarginNote: () => null }));
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  START_DESK_WALKTHROUGH_EVENT: 'document:start-desk-walkthrough',
  clearDeskWalkthroughLater: jest.fn(),
  useDeskWalkthroughOffer: () => false,
  useSuppressDeskFirstTouch: () => false,
}));
jest.mock('@/components/document/overlays/capture-lead-sheet', () => ({
  CaptureLeadSheet: () => null,
}));
jest.mock('@/components/document/overlays/open-project-sheet', () => ({
  OpenProjectSheet: () => null,
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({ useDocumentSurface: jest.fn() }));
jest.mock('@/components/document/account/account-sheet', () => ({ openAccountPage: jest.fn() }));
jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

function board(over: Record<string, unknown> = {}) {
  return {
    id: 'board-1',
    name: 'Living room direction',
    owner: { kind: 'project', id: 'project-1' },
    ownerName: 'Lake House project',
    roomName: 'Living room',
    coverImageUrl: null,
    coverFallbackUrls: [],
    verdictCounts: { approved: 2, rejected: 0, comment: 1, total: 3 },
    updatedAt: '2026-08-30T00:00:00Z',
    ...over,
  };
}

import { RecentBoardsStrip } from '../recent-boards-strip';
import DeskPage from '../../../app/(document)/desk/page';

beforeEach(() => {
  mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe('RecentBoardsStrip — the full strip (unchanged below 1280)', () => {
  it('renders nothing once the query resolves empty', () => {
    const { container } = render(<RecentBoardsStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints "Recent boards" with the room/owner line and the verdict summary', () => {
    mockRecentBoards.mockReturnValue({
      data: [board()],
      isLoading: false,
      isError: false,
    });
    render(<RecentBoardsStrip />);

    expect(screen.getByText('Recent boards')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open mood board Living room direction' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Living room')).toBeInTheDocument();
    // Every board asked useRecentBoards for the same limit — the compact
    // variant slices client-side, it never asks for fewer.
    expect(mockRecentBoards).toHaveBeenCalledWith(8);
  });
});

describe('RecentBoardsStrip — the compact rail (IA-17, ≥1280px)', () => {
  it('renders nothing once the query resolves empty, same as the full strip', () => {
    const { container } = render(<RecentBoardsStrip compact />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders at most three boards at a 92px cover, capped from a longer list', () => {
    mockRecentBoards.mockReturnValue({
      data: [
        board({ id: 'b1', name: 'Cedar Lane Study' }),
        board({ id: 'b2', name: 'Halvorsen townhouse' }),
        board({ id: 'b3', name: 'Reinhardt lake house' }),
        board({ id: 'b4', name: 'A fifth board that must not print' }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<RecentBoardsStrip compact />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(
      screen.queryByText('A fifth board that must not print'),
    ).not.toBeInTheDocument();

    const covers = document.querySelectorAll('.h-\\[92px\\].w-\\[92px\\]');
    expect(covers).toHaveLength(3);
  });

  it('prints the board name and relative time only — no room/owner line, no verdict summary', () => {
    mockRecentBoards.mockReturnValue({
      data: [board({ name: 'Cedar Lane Study' })],
      isLoading: false,
      isError: false,
    });
    render(<RecentBoardsStrip compact />);

    expect(
      screen.getByRole('link', { name: 'Open mood board Cedar Lane Study' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cedar Lane Study')).toBeInTheDocument();
    // The full strip's room/owner subtitle and verdict summary are absent.
    expect(screen.queryByText('Living room')).not.toBeInTheDocument();
    expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
  });

  it('labels the rail heading "Boards", distinct from the full strip’s "Recent boards"', () => {
    mockRecentBoards.mockReturnValue({
      data: [board()],
      isLoading: false,
      isError: false,
    });
    render(<RecentBoardsStrip compact />);

    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.queryByText('Recent boards')).not.toBeInTheDocument();
  });

  it('still asks useRecentBoards(8) — the variant slices client-side, it never asks for fewer', () => {
    mockRecentBoards.mockReturnValue({
      data: [board()],
      isLoading: false,
      isError: false,
    });
    render(<RecentBoardsStrip compact />);
    expect(mockRecentBoards).toHaveBeenCalledWith(8);
  });
});

/** Swaps window.matchMedia's `matches` for the '(min-width: 1280px)' query
 *  desk/page.tsx reads to decide the grid/rail split. */
function mockWideDesk(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

describe('desk/page.tsx — the boards rail beside the roster head (IA-17)', () => {
  it('renders the rail only at ≥1280px; below it, the full strip stays where it was', () => {
    mockRecentBoards.mockReturnValue({
      data: [board({ name: 'Cedar Lane Study' })],
      isLoading: false,
      isError: false,
    });

    mockWideDesk(false);
    const { unmount } = render(<DeskPage />);
    expect(screen.getByText('Recent boards')).toBeInTheDocument();
    expect(screen.queryByText('Boards')).not.toBeInTheDocument();
    expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    unmount();

    mockWideDesk(true);
    render(<DeskPage />);
    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.queryByText('Recent boards')).not.toBeInTheDocument();
    expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
  });

  it('keeps the roster column minmax(0,1fr) in the ≥1280 grid — no min-width overflow', () => {
    mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockWideDesk(true);
    const { container } = render(<DeskPage />);

    const grid = container.querySelector('[class*="grid-cols-"]');
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain('minmax(0,1fr)_260px');
  });
});
