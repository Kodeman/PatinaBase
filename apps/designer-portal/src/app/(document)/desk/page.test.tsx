/**
 * The Desk's studio-setup whisper (U7) and the count behind it.
 *
 * The whisper is a live derivation — `owner && openCount >= 2` — over the same
 * `deriveSetupSteps` the Account sheet's Studio page renders as a checklist.
 * The Desk was calling it WITHOUT `contactsCount` / `seedSkipped`, so the
 * rolodex row read permanently open here: the whisper ran one step ahead of
 * the checklist it sends you to, and could never fall silent on a studio whose
 * only remaining step was the rolodex. This spec pins the two counts together.
 *
 * Everything the Desk renders besides the whisper is stubbed — this file is
 * about one derivation's inputs, not the Desk's composition.
 */
import { act, render, screen } from '@testing-library/react';

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
  | 'answered'
  | 'rollup'
  | 'boards'
  | 'studio'
  | 'unbilled'
  | 'line'
  | null = null;

jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { display_name: 'Leah Warner' } }),
  useOrganizations: () => ({ data: mockOrgs() }),
  useOrganizationMembers: () => ({ data: mockMembers() }),
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

/** The Desk read's settled shape; US-14's route-root cases vary it. */
const settledDeskRead = () => ({
  data: { folders: [], chips: [], live: [] } as Record<string, unknown> | undefined,
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

// The roster's day's line reads project_notes; this suite mounts no
// QueryClient, so the read is stubbed like every other Desk feed here.
jest.mock('@/hooks/use-answered-notes', () => ({
  useAnsweredNotes: () =>
    mockPendingRead === 'answered'
      ? { data: undefined, isPending: true }
      : { data: [], isPending: false },
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-viewer-studio', () => ({
  useViewerStudio: () => ({
    organizations: [],
    studio: null,
    candidates: [],
    selectStudio: jest.fn(),
    isOwnerOrAdmin: false,
    isSettled: mockPendingRead !== 'studio',
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  // studio-workspaces — the whisper's own gate, always on here. `call-sheet`
  // is retired (rulings §6) and no longer read anywhere on this page.
  useFeatureFlag: () => ({ value: true, isLoading: false }),
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
jest.mock('@/components/document/overlays/capture-lead-sheet', () => ({
  CaptureLeadSheet: () => null,
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
  mockOrgs.mockReturnValue([studio()]);
  // Own title set; nobody else on the crew (one open step).
  mockMembers.mockReturnValue([{ user_id: 'me', job_title: 'Principal' }]);
  mockProjects.mockReturnValue([{ id: 'proj-1' }]);
  mockContacts.mockReturnValue([]);
  mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
});

/** A crew member who has already accepted and opened a document — both the
 *  crew-invited and first-hire-opened rows read done off this one row, so
 *  the "falls silent" cases below isolate the rolodex step they're actually
 *  testing. */
const HIRE_ARRIVED = {
  user_id: 'hire-1',
  status: 'active',
  first_document_opened_at: '2026-01-05T00:00:00Z',
};

describe('Desk — the studio setup whisper counts the rolodex', () => {
  it('falls silent once the rolodex is seeded and one step is left', () => {
    mockMembers.mockReturnValue([
      { user_id: 'me', job_title: 'Principal' },
      HIRE_ARRIVED,
    ]);
    mockContacts.mockReturnValue([{ id: 'c-1' }, { id: 'c-2' }]);
    render(<DeskPage />);
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });

  it('falls silent once the owner skipped the seed review', () => {
    mockMembers.mockReturnValue([
      { user_id: 'me', job_title: 'Principal' },
      HIRE_ARRIVED,
    ]);
    mockOrgs.mockReturnValue([
      studio({ rolodex_seed_skipped_at: '2026-08-01T00:00:00Z' }),
    ]);
    render(<DeskPage />);
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });

  it('still whispers while the rolodex is genuinely un-seeded', () => {
    render(<DeskPage />);
    expect(screen.getByText(WHISPER)).toBeInTheDocument();
  });

  it('reads the rolodex for the studio, with no flag in the way', () => {
    // The `call-sheet` flag is retired (rulings §6): the rolodex step reads
    // real data for every studio, on this surface and on the Studio page both.
    mockContacts.mockReturnValue([{ id: 'c-1' }]);
    render(<DeskPage />);
    expect(mockContacts).toHaveBeenCalledWith('org-1');
  });

  it('never whispers at a member — they cannot act on the checklist', () => {
    mockOrgs.mockReturnValue([studio({ membership: { role: 'member' } })]);
    render(<DeskPage />);
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });
});

describe('Desk — capture-lead affordance (A9)', () => {
  it('registers no mobile-dock primary action; the header CTA is the only on-screen "Capture a lead"', () => {
    render(<DeskPage />);
    expect(useMobilePrimaryAction).not.toHaveBeenCalled();
    expect(screen.getAllByText('Capture a lead')).toHaveLength(1);
  });
});

describe('Desk — header acts print their sub-labels (F24)', () => {
  it('prints the registry sub-label under each header act', () => {
    render(<DeskPage />);
    expect(screen.getByText('begin a Brief')).toBeInTheDocument();
    expect(screen.getByText('no proposal needed')).toBeInTheDocument();
  });
});

describe('Desk — the roster is the Desk’s one population (B2-L2)', () => {
  it('prints the stage-grouped roster', () => {
    render(<DeskPage />);
    expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    expect(
      screen.getByText('Every job · 0 live · 0 overdue'),
    ).toBeInTheDocument();
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
    ['the answered notes', 'answered'],
    ['the boards rollup', 'rollup'],
    ['the recent boards', 'boards'],
    ['the viewer studio', 'studio'],
    ['the unbilled time', 'unbilled'],
    ['the day’s line pick', 'line'],
  ] as const)('holds ready while %s read is pending', (_read, pending) => {
    mockPendingRead = pending;
    const { container } = render(<DeskPage />);
    expect(main(container).getAttribute('data-arrival')).toBe('desk');
    expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
  });

  it('marks the date line as head — the landing focus, never the greeting', () => {
    const { container } = render(<DeskPage />);
    const heads = container.querySelectorAll<HTMLElement>('[data-part~="head"]');
    expect(heads).toHaveLength(1);
    const head = heads[0];
    expect(head.tagName).toBe('P');
    expect(head.closest('h1')).toBeNull();
    expect(head.closest('main')).toHaveAttribute('data-arrival', 'desk');
    expect(head.textContent).toMatch(/^[A-Z]+ · [0-9A-Z ]+$/);
    expect(head.tabIndex).toBe(-1);
    head.focus();
    expect(head).toHaveFocus();
  });

  // Post-ship patch 1 — while the Desk's wait is armed the skeleton stands
  // until ready: the route root first appears already ready.
  describe('while its arrival wait is armed', () => {
    const skeleton = (container: HTMLElement) =>
      container.querySelector('[data-tour-anchor="desk-needs-your-hand"][aria-hidden]');
    const armWait = (path = '/desk') => act(() => setArrivalWaiting(jest.fn(), path));
    afterEach(() => act(() => setArrivalWaiting(null)));

    it('not ready: no route root, the skeleton marked held, and no roster until ready', () => {
      mockPendingRead = 'answered';
      armWait();
      const { container, rerender } = render(<DeskPage />);
      expect(main(container).hasAttribute('data-arrival')).toBe(false);
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(false);
      // Her press here would print the roster under her finger: its click is swallowed.
      expect(main(container).getAttribute('data-arrival-held')).toBe('desk');
      expect(skeleton(container)).not.toBeNull();
      expect(screen.queryByTestId('desk-roster')).toBeNull();

      mockPendingRead = null;
      rerender(<DeskPage />);
      expect(main(container).getAttribute('data-arrival')).toBe('desk');
      expect(main(container).hasAttribute('data-arrival-ready')).toBe(true);
      expect(main(container).hasAttribute('data-arrival-held')).toBe(false);
      expect(skeleton(container)).toBeNull();
      expect(screen.getByTestId('desk-roster')).toBeInTheDocument();
    });

    it('with no read in hand yet the skeleton is not marked held: a press there cannot print the roster', () => {
      mockDeskRead = { ...settledDeskRead(), data: undefined, isLoading: true, isSuccess: false };
      armWait();
      const { container } = render(<DeskPage />);
      expect(skeleton(container)).not.toBeNull();
      expect(main(container).hasAttribute('data-arrival')).toBe(false);
      expect(main(container).hasAttribute('data-arrival-held')).toBe(false);
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
      expect(main(container).hasAttribute('data-arrival-held')).toBe(false);
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
      expect(main(errored.container).hasAttribute('data-arrival-held')).toBe(false);
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
