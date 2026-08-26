/**
 * J-01 — the boards destination that did not exist. Below 1440 the ticket's
 * `Boards` row had nowhere to go: the list lived only inside the ≥1440 shelf
 * leaf, which force-closes at that width. These cases pin the page that now
 * answers it — this project's boards, the act that starts one, and the return.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => '/doc/eng-1/boards',
}));

const mockEngagement = jest.fn();
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => mockEngagement(),
}));

const mockLive = jest.fn();
const mockFrozen = jest.fn();
jest.mock('@patina/supabase', () => ({
  useProjectOwnedBoards: () => mockLive(),
  useProjectBoards: () => mockFrozen(),
}));

jest.mock('@/components/portal/scope-builder/boards-builder', () => ({
  BoardsBuilder: ({ projectId }: { projectId: string }) => (
    <div data-testid="boards-builder">{projectId}</div>
  ),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { ProjectBoardsView } from './project-boards-view';
import ProjectBoardsPage from '@/app/(document)/doc/[id]/boards/page';

function engagement(over: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    data: {
      kind: 'engagement',
      row: {
        engagement_kind: 'project',
        engagement_id: 'eng-1',
        project_id: 'proj-1',
        title: 'Vandersteen residence',
        active_section: 'project',
        ...over,
      },
    },
  };
}

beforeEach(() => {
  mockReplace.mockClear();
  mockEngagement.mockReturnValue(engagement());
  mockLive.mockReturnValue({
    isLoading: false,
    data: [
      { id: 'b1', name: 'Living room, warm', item_count: 7, status: 'active' },
      { id: 'b2', name: 'Retired', item_count: 2, status: 'archived' },
    ],
  });
  mockFrozen.mockReturnValue({
    isLoading: false,
    data: [{ id: 'f1', name: 'Signed direction', items: [{}, {}, {}] }],
  });
});

describe('the boards page', () => {
  it('lists this project’s boards, working and signed', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Boards' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Living room, warm/ }),
    ).toHaveAttribute('href', expect.stringContaining('/board/b1'));
    expect(screen.getByText('7 pieces · open room')).toBeInTheDocument();
    expect(screen.getByText('Signed direction', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Frozen at signing · 3 pieces/)).toBeInTheDocument();
    // An archived board is not a board this project is composing from.
    expect(screen.queryByText('Retired')).toBeNull();
  });

  it('returns by the document’s full name (SP-14)', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(
      screen.getByRole('link', { name: '← Vandersteen residence' }),
    ).toHaveAttribute('href', '/doc/eng-1');
  });

  it('starts a board in flow, and on the act the sheet already fires (F30)', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.queryByTestId('boards-builder')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start a board' }));
    expect(screen.getByTestId('boards-builder')).toHaveTextContent('proj-1');
  });

  it('opens the same builder when the Add-to-project sheet asks for a board', () => {
    render(<ProjectBoardsView routeId="eng-1" />);

    act(() => {
      window.dispatchEvent(new CustomEvent('document:new-project-board'));
    });

    expect(screen.getByTestId('boards-builder')).toBeInTheDocument();
  });

  it('says so plainly when there are none', () => {
    mockLive.mockReturnValue({ isLoading: false, data: [] });
    mockFrozen.mockReturnValue({ isLoading: false, data: [] });

    render(<ProjectBoardsView routeId="eng-1" />);

    expect(screen.getAllByText('No boards yet · start one').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Start a board' })).toBeInTheDocument();
  });

  it('carries a moved identity to the boards page, not to the document', async () => {
    mockEngagement.mockReturnValue({
      isLoading: false,
      data: { kind: 'redirect', projectId: 'proj-9' },
    });

    render(<ProjectBoardsView routeId="prop-1" />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/doc/proj-9/boards'),
    );
  });

  it('offers the same act on install and care, where the ticket also mounts', () => {
    mockEngagement.mockReturnValue(engagement({ active_section: 'install' }));
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(
      screen.getByRole('button', { name: 'Start a board' }),
    ).toBeInTheDocument();
  });

  it('sends a proposal’s boards to the Drafting Room instead of dead-ending', () => {
    // ⌘K offers ONE Boards door on every document (F62). On a proposal the
    // project id is null, and the boards that exist are the Drafting Room's.
    mockEngagement.mockReturnValue(
      engagement({
        engagement_kind: 'proposal',
        project_id: null,
        proposal_id: 'prop-9',
      }),
    );
    render(<ProjectBoardsView routeId="eng-1" />);

    expect(
      screen.getByRole('link', { name: 'Open the Drafting Room →' }),
    ).toHaveAttribute('href', '/drafting/prop-9');
    expect(
      screen.getByText(
        'This paper is still a proposal — its boards are in the Drafting Room.',
      ),
    ).toBeInTheDocument();
  });

  it('says the plain thing when there is no proposal either', () => {
    mockEngagement.mockReturnValue(
      engagement({ engagement_kind: 'proposal', project_id: null }),
    );
    render(<ProjectBoardsView routeId="eng-1" />);
    expect(screen.queryByRole('link', { name: /Drafting Room/ })).toBeNull();
    expect(
      screen.getByText(
        'This paper has no project yet — the boards open when one does.',
      ),
    ).toBeInTheDocument();
  });

  it('is what /doc/[id]/boards renders', async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ProjectBoardsPage params={Promise.resolve({ id: 'eng-1' })} />
        </Suspense>,
      );
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Boards' }),
    ).toBeInTheDocument();
  });
});
