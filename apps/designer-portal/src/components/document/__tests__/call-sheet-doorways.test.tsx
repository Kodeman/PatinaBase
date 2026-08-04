/**
 * Wave 3 doorways — the Call Sheet's wiring into the Document's navigation
 * (registry.tsx, command-bar.tsx, letterhead-instruments.tsx). Three things,
 * per the slice:
 *   1. The registry entry's shape — document-scoped, sheet-weight, the right
 *      aliases (pure data, no mocking).
 *   2. The ⌘K "This surface" row — present with a project document in hand
 *      and the flag on; absent without one (registry precedent:
 *      drafting-room-here).
 *   3. The letterhead instrument — present with the flag on, byte-absent
 *      (not merely hidden) with it off.
 */
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { STUDIO_LEDGERS } from '@/lib/document/registry';
import type { ProjectRosterRow } from '@patina/supabase';

// ── next/navigation — pathname is controlled per test; overrides the global
//    jest.setup.js mock for this file only. ──────────────────────────────
const mockPathname = jest.fn(() => '/desk');
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

// ── The Desk's engagement data — command-bar's only source for "a project
//    document is in hand". A plain hook mock is far lighter than the real
//    document_state supabase read. ─────────────────────────────────────
const mockDeskData = jest.fn(() => ({ folders: [] as unknown[], chips: [] as unknown[] }));
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ data: mockDeskData() }),
}));

// ── @patina/supabase — the union of what command-bar.tsx and
//    letterhead-instruments.tsx each pull from the package. ──────────────
const mockUseProjectRoster = jest.fn();
jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: () => ({ data: [] }),
  useRecentBoards: () => ({ data: [] }),
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
  useProjectV2: () => ({ data: undefined }),
  useProjectRoster: (...args: unknown[]) => mockUseProjectRoster(...args),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { email: 'leah@example.com' }, signOut: jest.fn() }),
}));

// ── The one flag both surfaces gate on. ───────────────────────────────────
let mockCallSheetFlag = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'call-sheet'
      ? { value: mockCallSheetFlag, isLoading: false }
      : { value: false, isLoading: false },
}));

// ── command-bar.tsx's other doorway openers — stubbed so mounting the
//    palette doesn't pull in the account sheet, invoice composer, Post,
//    feedback, draft-proposal picker, the Engine, or the Strata Mark's own
//    rendering. None of these are exercised by the assertions below. ─────
jest.mock('../account/account-sheet', () => ({ openAccount: jest.fn() }));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('../feedback/feedback-sheet', () => ({ openFeedbackSheet: jest.fn() }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('../rooms/drafting/draft-proposal-opener', () => ({
  openDraftProposalPicker: jest.fn(),
}));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../engine/engine-results', () => ({ EngineResults: () => null }));

// ── letterhead-instruments.tsx's other siblings — stubbed for the same
//    reason (mirror scans, the client mirror, the mobile primary action). ─
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('../client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));

// Imported AFTER the jest.mock calls above (hoisting makes the ordering here
// cosmetic, but it keeps the file honest about what's real vs stubbed).
import { CommandBar } from '../command-bar';
import { LetterheadInstruments } from '../letterhead-instruments';

function rosterRow(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: `r-${Math.random().toString(36).slice(2)}`,
    source: 'party',
    project_id: 'proj-1',
    kind: 'sub',
    display_name: 'Someone',
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: null,
    show_to_client: false,
    has_active_field_link: false,
    sms_consent_status: 'not_asked',
    updated_at: null,
    ...over,
  };
}

// A minimal document_state row — only the fields the code paths under test
// actually read (folderTab, fillStateForDesk's active_section, the
// engagement/project id match). Cast through `any` like the page's own
// `AnyRecord` — this fixture is deliberately not the full 40-column shape.
function deskRow(over: Record<string, unknown> = {}) {
  return {
    engagement_kind: 'project',
    engagement_id: 'eng-1',
    project_id: 'proj-1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Ellsworth',
    title: 'Ellsworth Residence',
    project_status: 'active',
    current_phase: 'procurement',
    active_section: 'project',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  mockCallSheetFlag = true;
  mockPathname.mockReturnValue('/desk');
  mockDeskData.mockReturnValue({ folders: [], chips: [] });
  mockUseProjectRoster.mockReset();
  mockUseProjectRoster.mockReturnValue({ data: [] });
});

// ============================================================================
// 1. The registry entry
// ============================================================================

describe('registry.tsx — the call-sheet entry', () => {
  it('is document-scoped, sheet-weight, and carries the expected aliases', () => {
    const entry = STUDIO_LEDGERS.find((l) => l.key === 'call-sheet');
    expect(entry).toBeDefined();
    expect(entry?.scope).toBe('document');
    expect(entry?.weight).toBe('sheet');
    expect(entry?.kind).toBe('ledger');
    expect(entry?.aliases).toEqual(
      expect.arrayContaining(['call sheet', 'roster', 'crew', 'team', 'parties', 'who']),
    );
    // Every registry entry must declare a help doorway (surface-key-parity
    // test enforces this globally); pinned here too since it's this entry's
    // own addition. Its own key — NOT `coordination` (court-bar.tsx's
    // ball-in-court panel already owns that one).
    expect(entry?.help?.surfaceKey).toBe('designer-portal/document/call-sheet');
  });

  it('is excluded from the global ledgers a scope filter would treat as "everywhere"', () => {
    const globalLedgers = STUDIO_LEDGERS.filter((l) => l.scope === 'global');
    expect(globalLedgers.find((l) => l.key === 'call-sheet')).toBeUndefined();
  });
});

// ============================================================================
// 2. The ⌘K command bar
// ============================================================================

describe('command-bar — the "This surface" call sheet row', () => {
  async function openPalette() {
    await act(async () => {
      window.dispatchEvent(new CustomEvent('document:open-command-bar'));
    });
  }

  it('is absent without a project document in hand, even with the flag on', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    render(<CommandBar />);
    await openPalette();

    expect(screen.queryByText('Open the call sheet')).not.toBeInTheDocument();
  });

  it('is absent with a project document in hand when the flag is off', async () => {
    mockCallSheetFlag = false;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    render(<CommandBar />);
    await openPalette();

    expect(screen.queryByText('Open the call sheet')).not.toBeInTheDocument();
  });

  it('appears in "This surface" with a project document in hand and the flag on', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    render(<CommandBar />);
    await openPalette();

    expect(screen.getByText('This surface')).toBeInTheDocument();
    expect(screen.getByText('Open the call sheet')).toBeInTheDocument();
  });

  it('never lists the call sheet in the unfiltered "Rooms & ledgers" group', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    render(<CommandBar />);
    await openPalette();

    const ledgersGroup = screen.getByText('Rooms & ledgers').closest('div');
    expect(ledgersGroup).not.toBeNull();
    expect(
      ledgersGroup!.parentElement?.textContent ?? '',
    ).not.toMatch(/Call sheet/);
  });
});

// ============================================================================
// 3. The letterhead instrument
// ============================================================================

describe('letterhead-instruments — the Call Sheet instrument', () => {
  function renderInstruments() {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <LetterheadInstruments
          projectId="proj-1"
          clientProfileId={null}
          clientName="The Ellsworths"
        />
      </QueryClientProvider>,
    );
  }

  it('renders "Call sheet · N" (with a terracotta ON PAPER tail) when the flag is on', () => {
    mockCallSheetFlag = true;
    mockUseProjectRoster.mockReturnValue({
      data: [rosterRow(), rosterRow({ has_active_field_link: true }), rosterRow()],
    });

    const { baseElement } = renderInstruments();

    // Queried by the stable action key (not getByText): the button's own
    // textContent concatenates the label with the aria-hidden trailing tail,
    // so a text-content query would ambiguously match both the label span
    // and its wrapper — this is the robust form call-sheet.test.tsx's own
    // action-region assertions already use.
    const button = baseElement.querySelector('[data-action-key="open-call-sheet"]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Call sheet · 3');
    // Two of the three rows above are on-paper only (no profile_id, no field
    // link) — the terracotta tail states that count.
    expect(button!.textContent).toContain('· 2 ON PAPER');
  });

  it('omits the ON PAPER tail when nobody is on-paper-only', () => {
    mockCallSheetFlag = true;
    mockUseProjectRoster.mockReturnValue({
      data: [rosterRow({ profile_id: 'p-1' })],
    });

    const { baseElement } = renderInstruments();

    const button = baseElement.querySelector('[data-action-key="open-call-sheet"]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('Call sheet · 1');
  });

  it('is byte-absent — not merely hidden — when the flag is off', () => {
    mockCallSheetFlag = false;
    mockUseProjectRoster.mockReturnValue({ data: [rosterRow(), rosterRow()] });

    const { baseElement } = renderInstruments();

    expect(screen.queryByText(/Call sheet/)).not.toBeInTheDocument();
    expect(baseElement.querySelector('[data-action-key="open-call-sheet"]')).toBeNull();
    // The roster query the instrument would have needed is never even
    // requested — the row isn't mounted at all, not just rendered null.
    expect(mockUseProjectRoster).not.toHaveBeenCalled();
  });
});
