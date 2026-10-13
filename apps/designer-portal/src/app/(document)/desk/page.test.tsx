/**
 * The Desk's composition: the Day Sheet over the line roster (US-25 slice 4),
 * the setup whisper gone to the Account sheet's checklist, the header acts,
 * and the US-14 arrival marks on the route root.
 *
 * Everything the Desk mounts besides those is stubbed.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

const mockOrgs = jest.fn();
const mockMembers = jest.fn();
const mockProjects = jest.fn();
const mockContacts = jest.fn();
// D5 — the recents strip returns to the Desk; its own query needs a mock so
// the real component (not stubbed here — see B2-L2's "one population" test
// below) can resolve without throwing.
const mockRecentBoards = jest.fn();
/** US-14 — the read after the roster that is still pending, if any. */
let mockPendingRead:
  | 'rollup'
  | 'boards'
  | 'studio'
  | 'members'
  | 'unbilled'
  | 'line'
  | null = null;
let mockMemberLineFlags = true;
let mockViewerStudioId: string | null = null;
let mockLeadsRead = true;
/** R14 — the teammates' facts read; a case swaps in a real, rejecting query. */
const answeredFacts = () => ({ data: new Map(), isSuccess: true });
let mockTeammateActed: (organizationId: string) => unknown = answeredFacts;

jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { display_name: 'Leah Warner' } }),
  useOrganizations: () => ({ data: mockOrgs() }),
  // TanStack v5's shapes: a disabled query (no studio id) with no data is
  // `isPending` but not `isLoading`.
  useOrganizationMembers: (organizationId: string) =>
    !organizationId
      ? { data: undefined, isLoading: false, isPending: true }
      : mockPendingRead === 'members'
        ? { data: undefined, isLoading: true, isPending: true }
        : { data: mockMembers(), isLoading: false, isPending: false },
  useProjectLeads: () => ({ data: new Map(), isSuccess: mockLeadsRead }),
  useNeedStates: () => ({ data: new Map() }),
  useTeammateActed: (organizationId: string) => mockTeammateActed(organizationId),
  useSetNeedState: () => ({ mutate: jest.fn(), isPending: false }),
  useProjects: () => ({ data: mockProjects() }),
  useStudioContacts: (...args: unknown[]) => ({ data: mockContacts(...args) }),
  useRecentBoards: (...args: unknown[]) =>
    mockPendingRead === 'boards'
      ? { data: undefined, isLoading: true, isError: false, isPending: true }
      : mockRecentBoards(...args),
  // DeskContents is stubbed below; the Desk reads this only for its ready mark.
  useStudioUnbilledTime: () =>
    mockPendingRead === 'unbilled'
      ? { data: undefined, isLoading: true, isError: false, isPending: true }
      : { data: [], isLoading: false, isError: false, isPending: false },
  // Desk rollup line (board-paths W2b #3) — no boards behind any bucket in
  // this suite's fixtures, so the strip renders nothing.
  useBoardsReactionRollup: () =>
    mockPendingRead === 'rollup'
      ? { data: undefined, isLoading: true, isError: false, isPending: true }
      : {
          data: { awaitingReaction: [], reactionsIn: [], approvedPipeline: [], capped: false },
          isLoading: false,
          isError: false,
          isPending: false,
        },
}));

/** One live job at rest: an empty studio prints its own sentence instead. */
const LIVE = [{ engagement_id: 'eng-1', project_id: 'proj-1', title: 'Holloway Den', active_section: 'project' }];

/** The Desk read's settled shape; US-14's route-root cases vary it. */
const settledDeskRead = () => ({
  data: { folders: [], chips: [], live: LIVE } as Record<string, unknown> | undefined,
  isLoading: false,
  isError: false,
  isSuccess: true,
  isPlaceholderData: false,
  refetch: jest.fn(),
});
let mockDeskRead = settledDeskRead();
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => mockDeskRead,
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Leah' } }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-viewer-studio', () => ({
  useViewerStudio: () => ({
    organizations: [],
    studio: mockViewerStudioId ? { id: mockViewerStudioId } : null,
    candidates: [],
    selectStudio: jest.fn(),
    isOwnerOrAdmin: false,
    isSettled: mockPendingRead !== 'studio',
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  // studio-workspaces — the whisper's own gate, always on here. `call-sheet`
  // is retired (rulings §6) and no longer read anywhere on this page.
  // The two flags whose lines read the studio members are variable: with
  // either on (the setup whisper's `studio-workspaces`, the hire-handoff's
  // `onboarding-teammate-persona`), the Desk's line pick waits on that read.
  useFeatureFlag: (key: string) => ({
    value:
      key === 'studio-workspaces' || key === 'onboarding-teammate-persona'
        ? mockMemberLineFlags
        : true,
    isLoading: false,
  }),
}));

// ── Everything else the Desk mounts. ──────────────────────────────────────
jest.mock('@/components/document/command-bar', () => ({
  openCommandBar: jest.fn(),
  captureLeadPending: { value: false },
  openProjectPending: { value: false },
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    deskRendered: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));
jest.mock('@/components/document/desk-contents', () => ({ DeskContents: () => null }));
jest.mock('@/components/document/margin-note', () => ({
  MarginNote: () => null,
  hasMarginNoteBeenSeen: () => false,
}));
// The Desk arbiter's teaching slot (return teaching): nothing to teach here.
jest.mock('@/hooks/use-teaching-note', () => ({
  useReturnNote: () => ({
    note: null,
    bind: null,
    sinceLine: null,
    decided: mockPendingRead !== 'line',
  }),
}));
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  START_DESK_WALKTHROUGH_EVENT: 'document:start-desk-walkthrough',
  clearDeskWalkthroughLater: jest.fn(),
  useDeskWalkthroughOffer: () => false,
  useSuppressDeskFirstTouch: () => false,
}));
// U-Q7 — the sheet's close-back is the Desk's to answer; the test plays it.
let mockCaptured: ((lead: { id: string; name: string }) => void) | undefined;
jest.mock('@/components/document/overlays/capture-lead-sheet', () => ({
  CaptureLeadSheet: ({ onCreated }: { onCreated?: (lead: { id: string; name: string }) => void }) => {
    mockCaptured = onCreated;
    return null;
  },
}));
jest.mock('@/components/document/overlays/open-project-sheet', () => ({
  OpenProjectSheet: () => null,
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));
jest.mock('@/components/document/account/account-sheet', () => ({
  openAccountPage: jest.fn(),
}));
// A9: the Desk no longer registers a mobile-dock primary action for
// capture-lead (mobile-bar falls back to its documented "In hand / Today"
// glance instead) — kept mocked here purely as a regression witness below.
jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

import DeskPage from './page';
import { resetDeskVisit } from '@/components/document/desk-arbiter';
import { setArrivalWaiting } from '@/components/document/arrival/arrival-mount';
import { useMobilePrimaryAction } from '@/components/document/mobile/mobile-shell';

const WHISPER = 'The studio isn’t fully set up.';

/** A studio with exactly ONE open step besides the rolodex (no crew yet). */
function studio(over: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    type: 'design_studio',
    created_at: '2026-01-01T00:00:00Z',
    rolodex_seed_skipped_at: null,
    membership: { role: 'owner' },
    ...over,
  };
}

beforeEach(() => {
  // Each test is a fresh Desk visit for the arbiter.
  resetDeskVisit();
  mockDeskRead = settledDeskRead();
  mockPendingRead = null;
  mockViewerStudioId = null;
  mockLeadsRead = true;
  mockTeammateActed = answeredFacts;
  mockMemberLineFlags = true;
  mockOrgs.mockReturnValue([studio()]);
  // Own title set; nobody else on the crew (one open step).
  mockMembers.mockReturnValue([{ user_id: 'me', job_title: 'Principal' }]);
  mockProjects.mockReturnValue([{ id: 'proj-1' }]);
  mockContacts.mockReturnValue([]);
  mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe('Desk — the setup whisper left for the Account sheet (US-25 slice 4)', () => {
  it('never whispers on the Desk, even at an owner whose studio is not set up', () => {
    render(<DeskPage />);
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });

  it('never whispers at a member either', () => {
    mockOrgs.mockReturnValue([studio({ membership: { role: 'member' } })]);
    render(<DeskPage />);
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });
});

describe('Desk — the Day Sheet heads the Desk (US-25 slice 4)', () => {
  it('says nothing needs her, once, when every feed answered and no job needs her', () => {
    render(<DeskPage />);
    expect(screen.getByTestId('day-sheet')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing needs you today.')).toHaveLength(1);
  });

  it('an empty studio says so under the eyebrow, with no cards or groups (D3 (c))', () => {
    mockDeskRead = { ...settledDeskRead(), data: { folders: [], chips: [], live: [] } };
    render(<DeskPage />);
    expect(
      screen.getByText('No project files yet. Record an inquiry or create a project file to begin.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('day-sheet')).toBeNull();
    expect(screen.queryByTestId('desk-roster')).toBeNull();
  });

  it('never says nothing needs her while a feed is unread (fix-now 6)', () => {
    mockDeskRead = {
      ...settledDeskRead(),
      data: { folders: [], chips: [], live: LIVE, unreadFeeds: ['purchase orders'] },
    };
    render(<DeskPage />);
    expect(screen.queryByText(/Nothing (more )?needs you today\./)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('day-sheet')).getByText('Not checked: purchase orders.')).toBeInTheDocument();
  });

  it('never says nothing needs her while her studio’s project leads are unread (SQ-751 F5)', () => {
    mockViewerStudioId = 'studio-1';
    mockLeadsRead = false;
    render(<DeskPage />);
    expect(screen.queryByText(/Nothing (more )?needs you today\./)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('day-sheet')).getByText('Not checked: project leads.')).toBeInTheDocument();
  });

  it('says nothing needs her once her studio’s project leads answer (SQ-751 F5)', () => {
    mockViewerStudioId = 'studio-1';
    render(<DeskPage />);
    expect(screen.getAllByText('Nothing needs you today.')).toHaveLength(1);
  });

  describe('teammates’ acts unread (R14)', () => {
    // The hook's own shape (useTeammateActed): the RPC's error throws out of
    // the query, which TanStack holds as `error` with no data.
    const useRejectedFactsRpc = (organizationId: string) =>
      useQuery({
        queryKey: ['need-state-facts', organizationId],
        queryFn: async (): Promise<Map<string, unknown>> => {
          throw { code: '42501', message: 'permission denied for function studio_need_state_facts' };
        },
        retry: false,
      });
    const renderDesk = (client: QueryClient) =>
      render(
        <QueryClientProvider client={client}>
          <DeskPage />
        </QueryClientProvider>,
      );
    const toStudio = () => act(() => screen.getByRole('button', { name: 'The studio’s' }).click());
    afterEach(() => window.localStorage.removeItem('patina.desk.scope.me'));

    it('the studio’s scope says they were not checked when studio_need_state_facts is rejected', async () => {
      mockTeammateActed = useRejectedFactsRpc;
      const client = new QueryClient();
      renderDesk(client);
      toStudio();
      await waitFor(() => expect(client.getQueryState(['need-state-facts', 'org-1'])?.status).toBe('error'));
      expect(within(screen.getByTestId('day-sheet')).getByText('Not checked: teammates’ acts.')).toBeInTheDocument();
      expect(screen.queryByText(/Nothing (more )?needs you today\./)).not.toBeInTheDocument();
      client.clear();
    });

    it('says so while the facts are still pending, and drops it once they answer', () => {
      mockTeammateActed = () => ({ data: undefined, isSuccess: false, isPending: true });
      const { rerender } = render(<DeskPage />);
      toStudio();
      expect(within(screen.getByTestId('day-sheet')).getByText('Not checked: teammates’ acts.')).toBeInTheDocument();
      mockTeammateActed = answeredFacts;
      rerender(<DeskPage />);
      expect(screen.queryByText('Not checked: teammates’ acts.')).not.toBeInTheDocument();
      expect(screen.getAllByText('Nothing needs you today.')).toHaveLength(1);
    });

    it('Mine reads no teammate’s act, so a rejected read leaves it unqualified', async () => {
      mockTeammateActed = useRejectedFactsRpc;
      const client = new QueryClient();
      renderDesk(client);
      await waitFor(() => expect(client.getQueryState(['need-state-facts', 'org-1'])?.status).toBe('error'));
      expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText('Not checked: teammates’ acts.')).not.toBeInTheDocument();
      expect(screen.getAllByText('Nothing needs you today.')).toHaveLength(1);
      client.clear();
    });
  });

  it('opens on Mine and holds the scope per person', () => {
    render(<DeskPage />);
    const mine = screen.getByRole('button', { name: 'Mine' });
    const studioScope = screen.getByRole('button', { name: 'The studio’s' });
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    act(() => studioScope.click());
    expect(studioScope).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('patina.desk.scope.me')).toBe('studio');
    window.localStorage.removeItem('patina.desk.scope.me');
  });
});

describe('Desk — Record an inquiry closes onto the Desk (U-Q7)', () => {
  it('prints the visit line above the ledger, with the brief one act away', () => {
    render(<DeskPage />);
    expect(document.querySelector('[data-desk-visit]')).toBeNull();
    act(() => mockCaptured?.({ id: 'lead-ainsley', name: 'Ainsley Moore' }));
    const visit = document.querySelector<HTMLElement>('[data-desk-visit]')!;
    expect(visit).toHaveTextContent('Ainsley Moore recorded · just now · Open the brief');
    expect(visit).toHaveAttribute('role', 'status');
    expect(visit.closest('[data-testid="desk-roster"]')).not.toBeNull();
    const open = within(visit).getByRole('link', { name: 'Open the brief — Ainsley Moore' });
    expect(open).toHaveAttribute('href', '/doc/lead-ainsley');
    expect(open).toHaveAttribute('data-action-variant', 'tertiary');
  });
});

describe('Desk — capture-lead affordance (A9)', () => {
  it('registers no mobile-dock primary action; the header CTA is the only on-screen "Record an inquiry"', () => {
    render(<DeskPage />);
    expect(useMobilePrimaryAction).not.toHaveBeenCalled();
    // SQ-778 N8 — Direction C header acts (C-0015, C-0017).
    expect(screen.getAllByText('Record an inquiry')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Create a project file/ })).toBeInTheDocument();
    expect(screen.queryByText(/Capture a lead|Open a project/)).toBeNull();
  });
});

describe('Desk — one header line (US-28 S0 F1)', () => {
  it('prints no sub-labels under the header acts; ⌘K and Desk Contents keep those words', () => {
    render(<DeskPage />);
    expect(screen.queryByText('Create an inquiry brief')).toBeNull();
    expect(screen.queryByText('Direct project setup')).toBeNull();
  });

  it('sets both creates as secondary acts: no filled act on the Desk', () => {
    const { container } = render(<DeskPage />);
    const head = container.querySelector<HTMLElement>('[data-action-region="desk-head"]')!;
    expect(head.querySelector('[data-action-variant="primary"], [data-action-variant="inked"]')).toBeNull();
    for (const key of ['capture-lead', 'open-project']) {
      expect(head.querySelector(`[data-action-key="${key}"]`)).toHaveAttribute(
        'data-action-variant',
        'secondary',
      );
    }
    expect(head.querySelector('[data-action-key="find-anything"]')).toHaveAttribute(
      'data-action-variant',
      'tertiary',
    );
  });

  it('keeps the date out of the header: it moved to Today’s eyebrow (U-Q3)', () => {
    const { container } = render(<DeskPage />);
    const header = container.querySelector('header')!;
    expect(header.querySelector('[data-part]')).toBeNull();
    expect(header.textContent).not.toMatch(/Today|October|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
    // The double rule opens the day under the header (F2).
    expect(header.nextElementSibling).toHaveClass('doc-rule-strong');
  });

  it('at 390 sets two rows: the greeting with Find, then the creates, so focus follows the eye', () => {
    const { container } = render(<DeskPage />);
    const header = container.querySelector('header')!;
    const order = Array.from(header.querySelectorAll<HTMLElement>('h1, [data-action-key]')).map(
      (el) => el.getAttribute('data-action-key') ?? el.tagName,
    );
    expect(order).toEqual(['H1', 'find-anything', 'capture-lead', 'open-project', 'find-anything']);
    // The first Find stands only below 600px; the second only above it.
    const [narrowFind, , , wideFind] = Array.from(header.querySelectorAll<HTMLElement>('[data-action-key]'));
    expect(narrowFind.closest('[role="group"][data-action-region]')).toHaveClass('min-[600px]:hidden');
    expect(narrowFind).toHaveAccessibleName('Find anything');
    expect(wideFind).toHaveClass('max-[599px]:hidden');
    expect(wideFind).toHaveAttribute('data-tour-anchor', 'desk-find-anything');
    // The creates take the second row; each name stays whole (2.5.3).
    const creates = header.querySelector('[data-action-region="desk-head"]')!;
    expect(creates).toHaveClass('max-[599px]:basis-full');
    expect(screen.getByRole('button', { name: 'Record an inquiry' })).toHaveTextContent('Inquiry');
    expect(screen.getByRole('button', { name: 'Create a project file' })).toHaveTextContent('Project');
    for (const short of ['Inquiry', 'Project']) {
      expect(within(creates as HTMLElement).getByText(short)).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

describe('Desk — Back keeps the place (US-28 S0 F6)', () => {
  const PLACE = 'patina.desk.place';
  let scrollTo: jest.Mock;
  const spies: jest.SpyInstance[] = [];
  const spy = <T extends jest.SpyInstance>(made: T): T => {
    spies.push(made);
    return made;
  };
  const back = () => {
    window.history.pushState({}, '', '/desk');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  };
  beforeEach(() => {
    window.sessionStorage.clear();
    scrollTo = jest.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  });
  afterEach(() => {
    spies.splice(0).forEach((made) => made.mockRestore());
    window.history.pushState({}, '', '/');
  });

  it('holds the offset in this tab when she leaves the Desk', () => {
    const { unmount } = render(<DeskPage />);
    // jsdom keeps scrollY as a plain value.
    Object.defineProperty(window, 'scrollY', { value: 1873, configurable: true });
    try {
      unmount();
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    }
    expect(JSON.parse(window.sessionStorage.getItem(PLACE)!)).toEqual({ y: 1873, anchor: null });
  });

  it('puts the offset back when Back lands on the Desk', () => {
    window.sessionStorage.setItem(PLACE, JSON.stringify({ y: 400, anchor: null }));
    spy(jest.spyOn(document.documentElement, 'scrollHeight', 'get')).mockReturnValue(4624);
    back();
    render(<DeskPage />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'auto' });
  });

  it('leaves a fresh entry to the arrival: no restore without a history traversal', () => {
    window.sessionStorage.setItem(PLACE, JSON.stringify({ y: 400, anchor: null }));
    render(<DeskPage />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('lands on the pressed row when the held offset no longer fits the page', () => {
    window.sessionStorage.setItem(PLACE, JSON.stringify({ y: 9000, anchor: 'roster-line-e1' }));
    const row = document.createElement('li');
    row.id = 'roster-line-e1';
    row.scrollIntoView = jest.fn();
    document.body.appendChild(row);
    back();
    render(<DeskPage />);
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(scrollTo).not.toHaveBeenCalled();
    row.remove();
  });

  it('waits for a roster still filling in, and puts the offset back once the page holds it', () => {
    window.sessionStorage.setItem(PLACE, JSON.stringify({ y: 821, anchor: 'roster-line-late' }));
    let grew: (() => void) | null = null;
    const disconnect = jest.fn();
    const Observer = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(callback: () => void) {
        grew = callback;
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;
    const height = spy(jest.spyOn(document.documentElement, 'scrollHeight', 'get')).mockReturnValue(1096);
    try {
      back();
      render(<DeskPage />);
      // The page cannot hold 821 yet and the row is not there: no clamped jump.
      expect(scrollTo).not.toHaveBeenCalled();
      height.mockReturnValue(5225);
      act(() => grew!());
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ top: 821, behavior: 'auto' });
      expect(disconnect).toHaveBeenCalled();
    } finally {
      global.ResizeObserver = Observer;
    }
  });

  it('stands down quietly when storage is unavailable', () => {
    spy(jest.spyOn(Storage.prototype, 'getItem')).mockImplementation(() => {
      throw new Error('denied');
    });
    spy(jest.spyOn(Storage.prototype, 'setItem')).mockImplementation(() => {
      throw new Error('denied');
    });
    back();
    const { unmount } = render(<DeskPage />);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });
});

describe('Desk — the roster is the Desk’s one population (B2-L2)', () => {
  it('prints the ledger under Today, and retires the workload head (US-28 S3)', () => {
    render(<DeskPage />);
    const sheet = screen.getByTestId('day-sheet');
    const roster = screen.getByTestId('desk-roster');
    expect(sheet.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Studio workload|By team member|The work is in motion/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ live/)).not.toBeInTheDocument();
  });

  it('no longer prints the four-up folio grid or The studio today', () => {
    const { container } = render(<DeskPage />);
    expect(container.querySelector('#needs-your-hand-folios')).toBeNull();
    expect(screen.queryByText('Needs your hand')).not.toBeInTheDocument();
    expect(screen.queryByText('The studio today')).not.toBeInTheDocument();
    expect(container.querySelector('#studio-pulse')).toBeNull();
  });
});

describe('Desk — D5 the recents strip returns beside the roster', () => {
  it('stays absent when there is nothing recent, same as an empty roster', () => {
    const { container } = render(<DeskPage />);
    expect(screen.queryByText('Recent boards')).not.toBeInTheDocument();
    expect(container.querySelector('#recent-mood-boards')).toBeNull();
  });

  it('prints the strip below the roster once a recent board exists', () => {
    mockRecentBoards.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'board-1',
          name: 'Living room direction',
          owner: { kind: 'project', id: 'project-1' },
          ownerName: 'Lake House project',
          roomName: 'Living room',
          coverImageUrl: null,
          coverFallbackUrls: [],
          verdictCounts: { approved: 0, rejected: 0, comment: 0, total: 0 },
          updatedAt: '2026-08-30T00:00:00Z',
        },
      ],
    });

    render(<DeskPage />);

    expect(screen.getByText('Recent boards')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open mood board Living room direction' }),
    ).toBeInTheDocument();
    // The roster still stands as the Desk's own population — the strip is a
    // second, quiet doorway beside it, not a replacement for it (B2-L2).
    expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
  });
});

describe('Desk — US-14 arrival marks on the route root (inert)', () => {
  const main = (container: HTMLElement) => container.querySelector('main')!;

  it.each([
    ['the first settled read', {}, 'desk', true],
    ['placeholder data', { isPlaceholderData: true }, 'desk', false],
    ['the skeleton', { data: undefined, isLoading: true, isSuccess: false }, null, false],
    ['the error state', { isError: true, isSuccess: false }, null, false],
  ] as const)('on %s: data-arrival=%s, ready=%s', (_state, over, root, ready) => {
    mockDeskRead = { ...settledDeskRead(), ...over };
    const { container } = render(<DeskPage />);
    expect(main(container).getAttribute('data-arrival')).toBe(root);
    expect(main(container).hasAttribute('data-arrival-ready')).toBe(ready);
  });

  it.each([
    ['the boards rollup', 'rollup'],
    ['the recent boards', 'boards'],
    ['the viewer studio', 'studio'],
    ['the studio members', 'members'],
    ['the unbilled time', 'unbilled'],
    ['the day’s line pick', 'line'],
  ] as const)('holds ready while %s read is pending', (_read, pending) => {
    mockPendingRead = pending;
    const { container } = render(<DeskPage />);
    expect(main(container).getAttribute('data-arrival')).toBe('desk');
    expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
  });

  // Round 5 — the members print the roster's "By person" facet inside the
  // root; an answer landing after the card shows cut a played run `mutation`.
  // The flags of the two lines that read the members are off here, as on the
  // lane: with either on, the line pick waits on the same read.
  it('holds ready while the studio members are in flight, and marks it once they settle', () => {
    mockMemberLineFlags = false;
    mockPendingRead = 'members';
    const { container, rerender } = render(<DeskPage />);
    expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);

    mockPendingRead = null;
    rerender(<DeskPage />);
    expect(main(container).hasAttribute('data-arrival-ready')).toBe(true);
  });

  it('with no studio the disabled members read does not hold ready', () => {
    mockMemberLineFlags = false;
    mockOrgs.mockReturnValue([]);
    const { container } = render(<DeskPage />);
    expect(main(container).getAttribute('data-arrival')).toBe('desk');
    expect(main(container).hasAttribute('data-arrival-ready')).toBe(true);
  });

  it('marks Today’s eyebrow date as head — the landing focus, never the greeting (U-Q3)', () => {
    const { container } = render(<DeskPage />);
    const heads = container.querySelectorAll<HTMLElement>('[data-part~="head"]');
    expect(heads).toHaveLength(1);
    const head = heads[0];
    expect(head.closest('h1')).toBeNull();
    expect(head.closest('[data-testid="day-sheet"]')).not.toBeNull();
    expect(head.closest('main')).toHaveAttribute('data-arrival', 'desk');
    expect(head.textContent).toMatch(/^[A-Z][a-z]+ \d{1,2} [A-Z][a-z]+ · Today$/);
    expect(head.tabIndex).toBe(-1);
    head.focus();
    expect(head).toHaveFocus();
  });

  // Post-ship patch 1 — while the Desk's wait is armed the skeleton stands
  // until ready: the route root first appears already ready.
  describe('while its arrival wait is armed', () => {
    const skeleton = (container: HTMLElement) =>
      container.querySelector('[data-tour-anchor="desk-needs-your-hand"][aria-busy="true"]');
    const held = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-arrival-held]');
    const armWait = (path = '/desk') => act(() => setArrivalWaiting(jest.fn(), path));
    afterEach(() => act(() => setArrivalWaiting(null)));

    it('not ready: no route root, the skeleton marked held, and no roster until ready', () => {
      mockPendingRead = 'rollup';
      armWait();
      const { container, rerender } = render(<DeskPage />);
      expect(main(container).hasAttribute('data-arrival')).toBe(false);
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
      // Her press on the skeleton would print the roster under her finger: its
      // click is swallowed. Only the block the roster replaces is marked, so the
      // header's acts stay live chrome (round 4).
      expect(main(container).hasAttribute('data-arrival-held')).toBe(false);
      expect(held(container)?.getAttribute('data-arrival-held')).toBe('desk');
      expect(held(container)).toContainElement(skeleton(container) as HTMLElement);
      expect(held(container)).not.toContainElement(
        screen.getByRole('button', { name: /Record an inquiry/ }),
      );
      expect(skeleton(container)).not.toBeNull();
      expect(screen.queryByTestId('desk-roster')).toBeNull();

      mockPendingRead = null;
      rerender(<DeskPage />);
      expect(main(container).getAttribute('data-arrival')).toBe('desk');
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(true);
      expect(held(container)).toBeNull();
      expect(skeleton(container)).toBeNull();
      expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    });

    it('with no read in hand yet the skeleton is not marked held: a press there cannot print the roster', () => {
      mockDeskRead = { ...settledDeskRead(), data: undefined, isLoading: true, isSuccess: false };
      armWait();
      const { container } = render(<DeskPage />);
      expect(skeleton(container)).not.toBeNull();
      expect(main(container).hasAttribute('data-arrival')).toBe(false);
      expect(held(container)).toBeNull();
    });

    it('ready: the root appears carrying data-arrival-ready', () => {
      armWait();
      const { container } = render(<DeskPage />);
      expect(main(container).getAttribute('data-arrival')).toBe('desk');
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(true);
      expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    });

    it('the wait ending before ready shows the root as it stands', () => {
      mockPendingRead = 'rollup';
      armWait();
      const { container } = render(<DeskPage />);
      expect(main(container).hasAttribute('data-arrival')).toBe(false);

      act(() => setArrivalWaiting(null));
      expect(main(container).getAttribute('data-arrival')).toBe('desk');
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
      expect(held(container)).toBeNull();
      expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    });

    it('a root already shown is never taken back (a warm entry, or ready dropping)', () => {
      mockPendingRead = 'unbilled';
      const { container, rerender } = render(<DeskPage />);
      expect(main(container).getAttribute('data-arrival')).toBe('desk');

      armWait();
      rerender(<DeskPage />);
      expect(main(container).getAttribute('data-arrival')).toBe('desk');
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
      expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    });

    it('the error state is never held, and another path’s wait holds nothing here', () => {
      mockDeskRead = { ...settledDeskRead(), isError: true, isSuccess: false };
      armWait();
      const errored = render(<DeskPage />);
      expect(screen.getByTestId('desk-error-state')).toBeInTheDocument();
      expect(held(errored.container)).toBeNull();
      errored.unmount();

      mockDeskRead = settledDeskRead();
      mockPendingRead = 'boards';
      armWait('/doc/e1');
      const { container } = render(<DeskPage />);
      expect(main(container).getAttribute('data-arrival')).toBe('desk');
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
    });
  });
});
