import { act, fireEvent, render, screen } from '@testing-library/react';
import { MoodBoardRoom } from '../board-room-shell';
import { TesterSlot } from '@/components/tester/tester-slot';
import { TesterWidget } from '@/components/tester/tester-widget';
import { resetProposalAutosaveRegistryForTests } from '@/lib/proposal-autosave-registry';

/**
 * SQ-865 F1 — the board room covers the page and sheds both docks, so the
 * TESTER mark stands in the room's own Header line: an in-flow act in the
 * header's wrapping row, never a fixed tag the room's z-40 layer buries.
 * The real room renders here; only its data, its canvas and its child
 * sheets are stood in for.
 */

const mockBoard = {
  id: 'board-1',
  proposal_id: null,
  project_id: 'project-1',
  name: 'Living room',
  scope_room_id: null,
  cover_image_url: null,
  canvas_width: 1200,
  canvas_height: 800,
  background_color: '#FAF8F5',
  sort_order: 0,
  sections: [],
  status: 'active',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  items: [],
};
const mockProject = { id: 'project-1', name: 'Hale house', proposal_id: null };
const mockNone: never[] = [];
const mockMutation = { mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/board/board-1',
}));

jest.mock('@patina/design-system', () => ({
  ...jest.requireActual('@patina/design-system'),
  BoardRoomCanvas: () => <div data-testid="edit-canvas" />,
  BoardComposition: () => <div data-testid="present-composition" />,
}));

jest.mock('@patina/supabase', () => ({
  useBoard: () => ({ data: mockBoard, isLoading: false, error: null }),
  useSaveBoardLayout: () => mockMutation,
  useUpsertBoard: () => ({ mutateAsync: jest.fn().mockResolvedValue(mockBoard) }),
  useApplyBoardRoomState: () => mockMutation,
  usePlaceProductInProjectV2: () => mockMutation,
  useProject: () => ({ data: mockProject }),
  useProposal: () => ({ data: undefined }),
  useProposalScheduleItems: () => ({ data: mockNone }),
  useAddProposalItem: () => mockMutation,
  useBoardItemFeedbackByBoard: () => ({ data: mockNone }),
  useBoardItemDirectionsByBoard: () => ({ data: mockNone }),
  countUnresolvedDirectionsByItem: () => new Map(),
  useUnseenShipped: () => ({ data: mockNone }),
  useCreateFeedback: () => mockMutation,
}));

jest.mock('@/components/mood-board/board-add-rail', () => ({
  BoardAddRail: () => null,
  uploadFilesAsBoardItems: jest.fn(),
}));
jest.mock('@/components/mood-board/board-approved-pins-panel', () => ({ BoardApprovedPinsPanel: () => null }));
jest.mock('@/components/mood-board/board-deck-import-sheet', () => ({ BoardDeckImportSheet: () => null }));
jest.mock('@/components/mood-board/board-promote-all-panel', () => ({ BoardPromoteAllPanel: () => null }));
jest.mock('@/components/mood-board/board-deck-import-ledger', () => ({
  BoardDeckImportLedger: () => null,
  DeckPieceActs: () => null,
}));
jest.mock('@/components/mood-board/board-room-inspector', () => ({ BoardRoomInspector: () => null }));
jest.mock('@/components/mood-board/board-room-sections-menu', () => ({ BoardRoomSectionsMenu: () => null }));
jest.mock('@/components/mood-board/board-share-dialog', () => ({ BoardShareDialog: () => null }));
jest.mock('@/components/mood-board/board-export-dialog', () => ({ BoardExportDialog: () => null }));
jest.mock('@/components/mood-board/board-template-dialog', () => ({ BoardTemplateDialog: () => null }));

jest.mock('@/hooks/use-mood-board-url-unfurl', () => ({ useMoodBoardUrlUnfurl: () => mockMutation }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'tester-notes', isLoading: false }),
}));
jest.mock('@/hooks/use-board-deck-import-layout', () => ({
  ...jest.requireActual('@/hooks/use-board-deck-import-layout'),
  useBoardDeckImportLayout: () => ({ progress: null, layOut: jest.fn() }),
}));
jest.mock('@/hooks/use-board-deck-import-review', () => ({
  ...jest.requireActual('@/hooks/use-board-deck-import-review'),
  useBoardDeckImportReview: () => ({ deckImport: null, items: mockNone, products: mockNone }),
  useDeckImportDecisions: () => ({}),
}));

jest.mock('@/lib/document/feedback', () => ({
  ...jest.requireActual('@/lib/document/feedback'),
  captureScreenshot: () => Promise.resolve(null),
}));
jest.mock('@/components/document/feedback/feedback-ledger', () => ({ FeedbackLedger: () => null }));

afterEach(() => {
  resetProposalAutosaveRegistryForTests();
});

function renderRoom() {
  return render(
    <>
      {/* A dock slot left mounted beneath the room must not win the mark. */}
      <nav aria-label="Document bar">
        <TesterSlot kind="bar" />
      </nav>
      <MoodBoardRoom owner={{ kind: 'project', id: 'project-1' }} boardId="board-1" />
      <TesterWidget />
    </>,
  );
}

describe('the board room keeps the TESTER mark reachable (SQ-865 F1)', () => {
  it('stands the mark in the room’s Header line, an in-flow act beside Share', async () => {
    renderRoom();
    const room = await screen.findByRole('main', { name: 'Living room design board workspace' });
    const mark = screen.getByRole('button', { name: /TESTER/i });

    expect(mark).toHaveAttribute('data-tester-mark', 'dock');
    expect(mark).not.toHaveClass('fixed');
    expect(mark.parentElement).toHaveAttribute('data-tester-slot', 'board');
    // Inside the room's own layer, in the header's act row, after Share.
    expect(room).toContainElement(mark);
    const row = mark.closest('.br-hline-r');
    expect(row?.closest('header')).toHaveClass('br-head');
    const acts = Array.from(row!.querySelectorAll('button'));
    expect(acts.indexOf(mark)).toBe(acts.indexOf(screen.getByRole('button', { name: 'Share design board' })) + 1);
    expect(screen.getByRole('navigation', { name: 'Document bar' })).not.toContainElement(mark);
  });

  it('opens the capture form from the room’s mark', async () => {
    renderRoom();
    await screen.findByRole('main', { name: 'Living room design board workspace' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /TESTER/i }));
    });
    expect(screen.getByRole('region', { name: 'Tester notes' })).toBeInTheDocument();
  });
});
