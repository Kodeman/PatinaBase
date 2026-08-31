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
import { render, screen } from '@testing-library/react';

let mockCallSheetFlag = true;
const mockOrgs = jest.fn();
const mockMembers = jest.fn();
const mockProjects = jest.fn();
const mockContacts = jest.fn();
// D5 — the recents strip returns to the Desk; its own query needs a mock so
// the real component (not stubbed here — see B2-L2's "one population" test
// below) can resolve without throwing.
const mockRecentBoards = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { display_name: 'Leah Warner' } }),
  useOrganizations: () => ({ data: mockOrgs() }),
  useOrganizationMembers: () => ({ data: mockMembers() }),
  useProjects: () => ({ data: mockProjects() }),
  useStudioContacts: (...args: unknown[]) => ({ data: mockContacts(...args) }),
  useRecentBoards: (...args: unknown[]) => mockRecentBoards(...args),
  // Desk rollup line (board-paths W2b #3) — no boards behind any bucket in
  // this suite's fixtures, so the strip renders nothing.
  useBoardsReactionRollup: () => ({
    data: { awaitingReaction: [], reactionsIn: [], approvedPipeline: [], capped: false },
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: { folders: [], chips: [], live: [] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Leah' } }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'call-sheet'
      ? { value: mockCallSheetFlag, isLoading: false }
      : // studio-workspaces — the whisper's own gate, always on here.
        { value: true, isLoading: false },
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
jest.mock('@/components/document/margin-note', () => ({ MarginNote: () => null }));
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  START_DESK_WALKTHROUGH_EVENT: 'document:start-desk-walkthrough',
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
  mockCallSheetFlag = true;
  mockOrgs.mockReturnValue([studio()]);
  // Own title set; nobody else on the crew (one open step).
  mockMembers.mockReturnValue([{ user_id: 'me', job_title: 'Principal' }]);
  mockProjects.mockReturnValue([{ id: 'proj-1' }]);
  mockContacts.mockReturnValue([]);
  mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe('Desk — the studio setup whisper counts the rolodex', () => {
  it('falls silent once the rolodex is seeded and one step is left', () => {
    mockContacts.mockReturnValue([{ id: 'c-1' }, { id: 'c-2' }]);
    render(<DeskPage />);
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });

  it('falls silent once the owner skipped the seed review', () => {
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

  it('reads the rolodex only behind the call-sheet flag, exactly as the Studio page does', () => {
    mockCallSheetFlag = false;
    mockContacts.mockReturnValue([{ id: 'c-1' }]);
    render(<DeskPage />);
    // Flag off: the rolodex step falls back to un-seeded on BOTH surfaces, so
    // the whisper is still the truthful reading of the checklist.
    expect(screen.getByText(WHISPER)).toBeInTheDocument();
    // …and the contacts query is never even asked for an organization.
    expect(mockContacts).toHaveBeenCalledWith(null);
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
