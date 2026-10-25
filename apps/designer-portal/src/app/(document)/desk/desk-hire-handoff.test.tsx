/**
 * The hire's hand-off on the Desk (US-25 fix-now 16, N4). The invite note
 * (00560/00561) no longer prints once as a Desk margin line; it lives on the
 * job it is about until read. Each unread hand-off — a job the signed-in seat
 * now leads that someone else led before — rides the Day Sheet as a line like
 * any other need, its act opening that job (slice 4).
 *
 * Everything else the Desk mounts is stubbed — this file is about the hand-off
 * line's gating and wording, not the Desk's composition.
 */
import { render, screen, within } from '@testing-library/react';

// Help surfaces are outside this suite; PostSheet reaches the ESM help barrel.
jest.mock('@/lib/help-system/use-sheet-surface-key', () => ({
  useSheetSurfaceKey: () => {},
}));

let mockTeammatePersonaFlag = { value: true, isLoading: false };
let mockOneVoice = false;
const mockLeads = jest.fn();
const mockNeedStates = jest.fn();
const mockLive = jest.fn();
const mockOrgs = jest.fn();
const mockMembers = jest.fn();
const mockProjects = jest.fn();
const mockContacts = jest.fn();
const mockRecentBoards = jest.fn();

jest.mock('@patina/supabase', () => ({
  // US-49 — the Desk card's edition line (desk-job-card.test.tsx covers it).
  useClientEditions: () => ({ data: undefined }),
  useProfile: () => ({ data: { display_name: 'Leah Warner' } }),
  useOrganizations: () => ({ data: mockOrgs() }),
  useOrganizationMembers: () => ({ data: mockMembers() }),
  useProjectLeads: () => ({ data: mockLeads() }),
  useNeedStates: () => ({ data: mockNeedStates() }),
  useTeammateActed: () => ({ data: new Map() }),
  useSetNeedState: () => ({ mutate: jest.fn(), isPending: false }),
  useProjects: () => ({ data: mockProjects() }),
  useStudioContacts: (...args: unknown[]) => ({ data: mockContacts(...args) }),
  useRecentBoards: (...args: unknown[]) => mockRecentBoards(...args),
  useStudioUnbilledTime: () => ({ data: [], isLoading: false, isError: false, isPending: false }),
  useRunningTimer: () => ({ data: undefined, isPending: false }),
  useBoardsReactionRollup: () => ({
    data: { awaitingReaction: [], reactionsIn: [], approvedPipeline: [], capped: false },
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/hooks/use-paper-renderer', () => ({
  usePaperRenderer: () => ({ renderer: 'legacy', source: 'override' }),
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({
    data: { folders: [], chips: [], live: mockLive() },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'hire-1', name: 'Jamie' } }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

// US-14 — the Desk's arrival ready mark reads the viewer's studio (settled here).
jest.mock('@/hooks/use-viewer-studio', () => ({
  useViewerStudio: () => ({
    organizations: [],
    studio: null,
    candidates: [],
    selectStudio: jest.fn(),
    isOwnerOrAdmin: false,
    isSettled: true,
  }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'onboarding-teammate-persona'
      ? mockTeammatePersonaFlag
      : { value: name === 'one-voice' && mockOneVoice, isLoading: false },
}));

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
    wayfinding: { marginNote: jest.fn() },
  },
}));
jest.mock('@/components/document/desk-contents', () => ({ DeskContents: () => null }));
jest.mock('@/components/document/margin-note', () => ({
  // Prop-capturing stub — this file asserts on WHETHER and WHAT the hire-handoff
  // note renders, not MarginNote's own once-only/dismiss mechanics (covered by
  // margin-note.test.tsx).
  MarginNote: ({
    noteKey,
    children,
  }: {
    noteKey: string;
    children: React.ReactNode;
  }) => <div data-testid={`margin-note-${noteKey}`}>{children}</div>,
  hasMarginNoteBeenSeen: () => false,
}));
// The Desk arbiter's teaching slot (return teaching): nothing to teach here.
jest.mock('@/hooks/use-teaching-note', () => ({
  useReturnNote: () => ({ note: null, bind: null, sinceLine: null, decided: true }),
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
jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

import DeskPage from './page';
import { resetDeskVisit } from '@/components/document/desk-arbiter';

function studio(over: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    type: 'design_studio',
    created_at: '2026-01-01T00:00:00Z',
    rolodex_seed_skipped_at: null,
    membership: { role: 'member' },
    ...over,
  };
}

const OWNER = {
  user_id: 'owner-1',
  status: 'active',
  job_title: 'Principal',
  invited_by: null,
  handoff_note: null,
  profiles: { full_name: 'Leah Warner', display_name: 'Leah' },
};

const HIRE_WITH_NOTE = {
  user_id: 'hire-1',
  status: 'active',
  job_title: null,
  invited_by: 'owner-1',
  handoff_note: "start with the Olsen lake house — the brief's written",
  profiles: { full_name: 'Jamie Rivera', display_name: 'Jamie' },
};

const HIRE_NO_NOTE = {
  ...HIRE_WITH_NOTE,
  handoff_note: null,
};

const HANDED_OFF = new Map([
  ['project-olsen', {
    leadUserId: 'hire-1',
    leadName: 'Jamie Rivera',
    previousLeadUserId: 'owner-1',
    previousLeadName: 'Leah',
    assignedAt: '2026-10-05T15:00:00.000Z',
  }],
]);

beforeEach(() => {
  // Each test is a fresh Desk visit for the arbiter.
  resetDeskVisit();
  mockTeammatePersonaFlag = { value: true, isLoading: false };
  mockOneVoice = false;
  mockOrgs.mockReturnValue([studio()]);
  mockMembers.mockReturnValue([OWNER, HIRE_WITH_NOTE]);
  mockProjects.mockReturnValue([]);
  mockContacts.mockReturnValue([]);
  mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
  mockLeads.mockReturnValue(HANDED_OFF);
  mockNeedStates.mockReturnValue(new Map());
  mockLive.mockReturnValue([
    { engagement_id: 'eng-olsen', project_id: 'project-olsen', title: 'Olsen Lake House' },
  ]);
});

const handoffLine = () =>
  document.querySelector<HTMLElement>('[data-day-sheet-line="handoff:project-olsen"]');

describe('Desk — the hire\'s hand-off', () => {
  it('no longer prints the invite note as a Desk margin line', () => {
    render(<DeskPage />);
    expect(screen.queryByTestId('margin-note-hire-handoff')).not.toBeInTheDocument();
  });

  it('puts an unread hand-off on the Day Sheet, its act opening the job and naming the note', () => {
    render(<DeskPage />);
    const line = handoffLine()!;
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent(/^Leah handed you Olsen Lake House/);
    expect(line).toHaveTextContent("Read Leah's note");
    const act = within(line).getByRole('link', { name: /Olsen Lake House/ });
    // SQ-778 N2 — the act lands on the note itself.
    expect(act).toHaveAttribute('href', '/doc/project-olsen#hand-off');
    expect(act).toHaveTextContent('Read the note');
    // A hand-off is read, not put off: it carries no "Not today".
    expect(within(line).queryByText('Not today')).not.toBeInTheDocument();
  });

  it('does not promise the note on a job someone other than its writer handed her (SQ-778 N3)', () => {
    mockLeads.mockReturnValue(new Map([
      ['project-olsen', { ...HANDED_OFF.get('project-olsen')!, previousLeadUserId: 'member-2', previousLeadName: 'Sam' }],
    ]));
    render(<DeskPage />);
    const line = handoffLine()!;
    expect(line).toHaveTextContent(/^Sam handed you Olsen Lake House/);
    expect(line).not.toHaveTextContent('note');
    expect(within(line).getByRole('link', { name: /Olsen Lake House/ })).toHaveTextContent('Open project file');
  });

  it.each([false, true])(
    'does not promise a note when the hire\'s invite carried none (one-voice %s)',
    (oneVoice) => {
      mockOneVoice = oneVoice;
      mockMembers.mockReturnValue([OWNER, HIRE_NO_NOTE]);
      render(<DeskPage />);
      const line = handoffLine()!;
      expect(line).toHaveTextContent(/^Leah handed you Olsen Lake House/);
      expect(line).not.toHaveTextContent('note');
    },
  );

  it('drops the hand-off once it is marked read', () => {
    mockNeedStates.mockReturnValue(
      new Map([['handoff:project-olsen', { actedAt: '2026-10-06T12:00:00.000Z' }]]),
    );
    render(<DeskPage />);
    expect(handoffLine()).toBeNull();
  });

  it('puts no hand-off on the sheet for a seat that leads no handed-off job', () => {
    mockLeads.mockReturnValue(new Map());
    render(<DeskPage />);
    expect(handoffLine()).toBeNull();
  });
});
