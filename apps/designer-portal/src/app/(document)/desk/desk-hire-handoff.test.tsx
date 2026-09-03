/**
 * The hire-handoff margin note (L8, 00561): the owner's optional line,
 * written on the invite, rendered once on the new hire's Desk as
 * `MarginNote noteKey="hire-handoff"` — "From {owner first name}: {note}".
 * Reads the signed-in member's OWN organization_members row for the note,
 * and resolves the owner's first name against that row's `invited_by`
 * within the same studioMembers roster. Behind `onboarding-teammate-persona`
 * (W2) — flag off (or loading) must never render it.
 *
 * Everything else the Desk mounts is stubbed — this file is about the one
 * note's gating and inputs, not the Desk's composition.
 */
import { render, screen } from '@testing-library/react';

let mockTeammatePersonaFlag = { value: true, isLoading: false };
const mockOrgs = jest.fn();
const mockMembers = jest.fn();
const mockProjects = jest.fn();
const mockContacts = jest.fn();
const mockRecentBoards = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProfile: () => ({ data: { display_name: 'Leah Warner' } }),
  useOrganizations: () => ({ data: mockOrgs() }),
  useOrganizationMembers: () => ({ data: mockMembers() }),
  useProjects: () => ({ data: mockProjects() }),
  useStudioContacts: (...args: unknown[]) => ({ data: mockContacts(...args) }),
  useRecentBoards: (...args: unknown[]) => mockRecentBoards(...args),
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
  useAuth: () => ({ user: { id: 'hire-1', name: 'Jamie' } }),
}));

jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'onboarding-teammate-persona'
      ? mockTeammatePersonaFlag
      : { value: false, isLoading: false },
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

beforeEach(() => {
  mockTeammatePersonaFlag = { value: true, isLoading: false };
  mockOrgs.mockReturnValue([studio()]);
  mockMembers.mockReturnValue([OWNER, HIRE_WITH_NOTE]);
  mockProjects.mockReturnValue([]);
  mockContacts.mockReturnValue([]);
  mockRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe('Desk — hire-handoff margin note (L8)', () => {
  it('renders "From {owner first name}: {note}" for a hire whose own row carries a note', () => {
    render(<DeskPage />);
    const note = screen.getByTestId('margin-note-hire-handoff');
    expect(note).toHaveTextContent(
      "From Leah: start with the Olsen lake house — the brief's written",
    );
  });

  it('renders nothing when the signed-in member has no handoff note', () => {
    mockMembers.mockReturnValue([OWNER, HIRE_NO_NOTE]);
    render(<DeskPage />);
    expect(
      screen.queryByTestId('margin-note-hire-handoff'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing behind the flag when off', () => {
    mockTeammatePersonaFlag = { value: false, isLoading: false };
    render(<DeskPage />);
    expect(
      screen.queryByTestId('margin-note-hire-handoff'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing while the flag is still loading', () => {
    mockTeammatePersonaFlag = { value: false, isLoading: true };
    render(<DeskPage />);
    expect(
      screen.queryByTestId('margin-note-hire-handoff'),
    ).not.toBeInTheDocument();
  });
});
