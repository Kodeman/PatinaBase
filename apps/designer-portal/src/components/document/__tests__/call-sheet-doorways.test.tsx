/**
 * Wave 3 doorways — the Call Sheet's wiring into the Document's navigation
 * (registry.tsx, command-bar.tsx, letterhead-instruments.tsx). Four things,
 * per the slice (plus its w1 ⌘K leak fix):
 *   1. The registry entry's shape — document-scoped, sheet-weight, the right
 *      aliases (pure data, no mocking).
 *   2. The ⌘K "This surface" row — present with a project document in hand
 *      and the flag on; absent without one (registry precedent:
 *      drafting-room-here).
 *   3. The letterhead instrument — present with the flag on, byte-absent
 *      (not merely hidden) with it off.
 *   5. The ticket's `People` row (B1/B2) — the same gate. The spine's "The
 *      shelves" block is deleted, so the fourth doorway is the ticket row: it
 *      opens the roster sheet with the flag on, and with the flag off it names
 *      the absence instead of offering a door into nothing.
 *   4. The ⌘K TYPED-search leak fix — matchSurfaces has no scope/flag check
 *      of its own (registry.tsx stays data-only), so command-bar.tsx's typed
 *      branch must filter document-scoped surfaces itself: typing "roster"
 *      must not surface Call Sheet with the flag off or no project document
 *      in hand (previously a silent no-op click — the sheet only mounts on
 *      /doc/[id]), and must surface it (dispatching the same event as every
 *      other doorway) once both are true. The Drafting Room — the registry's
 *      other document-scoped surface — keeps working under the same filter.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
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
  useDeskEngagements: () => {
    const data = mockDeskData() as unknown as Record<string, unknown[]>;
    if (!data) return { data };
    // Production's `live` is every non-archived row the composition saw, need
    // or no need; a fixture that only states folders and chips is stating the
    // same population through its two derived halves.
    return {
      data: {
        ...data,
        live:
          data.live ??
          [...(data.folders ?? []), ...(data.chips ?? [])].map(
            (entry) => (entry as { row: unknown }).row,
          ),
      },
    };
  },
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
import { JobTicket } from '../job-ticket';
import { deriveTicket, type TicketInput } from '@/lib/document/ticket-derivation';
import type { MoneyLadder, MoneyRung } from '@/lib/document/money-ladder';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

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

    expect(screen.queryByText('Call sheet')).not.toBeInTheDocument();
  });

  it('is absent with a project document in hand when the flag is off', async () => {
    mockCallSheetFlag = false;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    render(<CommandBar />);
    await openPalette();

    expect(screen.queryByText('Call sheet')).not.toBeInTheDocument();
    // A3-L3 — its three siblings are not flag-gated and still stand.
    expect(screen.getByText('Plan room')).toBeInTheDocument();
  });

  it('appears in "This surface" with a project document in hand and the flag on', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    render(<CommandBar />);
    await openPalette();

    expect(screen.getByText('This surface')).toBeInTheDocument();
    expect(screen.getByText('Call sheet')).toBeInTheDocument();
    expect(screen.getByText('this project · who is on the job')).toBeInTheDocument();
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
// 3. The ⌘K TYPED-search leak fix (w1) — matchSurfaces has no scope/flag
//    check of its own; command-bar.tsx's typed branch must apply the same
//    in-hand (+flag, for Call Sheet) gate its "This surface" row above uses.
// ============================================================================

describe('command-bar — typed search respects document scope (⌘K leak fix)', () => {
  async function openPaletteAndType(query: string) {
    render(<CommandBar />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('document:open-command-bar'));
    });
    const input = screen.getByPlaceholderText(/Find a document or a ledger/);
    await act(async () => {
      fireEvent.change(input, { target: { value: query } });
    });
  }

  it('(a) flag off + "roster": no Call sheet row, even with a project document in hand', async () => {
    mockCallSheetFlag = false;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    await openPaletteAndType('roster');

    expect(screen.queryByText('Call sheet')).not.toBeInTheDocument();
  });

  it('(b) flag on + no document in hand + "roster": no Call sheet row', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    await openPaletteAndType('roster');

    expect(screen.queryByText('Call sheet')).not.toBeInTheDocument();
  });

  it('(c) flag on + a document in hand + "roster": the row appears and dispatches document:open-call-sheet', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    const opened = jest.fn();
    window.addEventListener('document:open-call-sheet', opened);

    await openPaletteAndType('roster');

    const row = screen.getByText('Call sheet');
    expect(row).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(row.closest('button')!);
    });

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:open-call-sheet', opened);
  });

  it('also drops the "who" alias for Call sheet without a document in hand', async () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    await openPaletteAndType('who');
    expect(screen.queryByText('Call sheet')).not.toBeInTheDocument();
  });

  it('preserves the Drafting Room\'s working typed search with a draft proposal in hand', async () => {
    mockPathname.mockReturnValue('/doc/prop-1');
    mockDeskData.mockReturnValue({
      folders: [
        {
          row: deskRow({
            engagement_kind: 'proposal',
            engagement_id: 'prop-1',
            proposal_id: 'prop-1',
            proposal_status: 'draft',
          }),
        },
      ],
      chips: [],
    });
    mockPush.mockClear();

    await openPaletteAndType('drafting');

    const row = screen.getByText('Drafting Room');
    await act(async () => {
      fireEvent.click(row.closest('button')!);
    });

    expect(mockPush).toHaveBeenCalledWith('/drafting/prop-1');
  });

  it('hides the Drafting Room from typed search without a draft proposal in hand', async () => {
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    await openPaletteAndType('drafting');

    expect(screen.queryByText('Drafting Room')).not.toBeInTheDocument();
  });

  it('gives \'moodboards\' to the Boards door alone (F62 — three names become one)', async () => {
    mockPathname.mockReturnValue('/doc/prop-1');
    mockDeskData.mockReturnValue({
      folders: [
        {
          row: deskRow({
            engagement_kind: 'proposal',
            engagement_id: 'prop-1',
            proposal_id: 'prop-1',
            proposal_status: 'draft',
          }),
        },
      ],
      chips: [],
    });

    await openPaletteAndType('moodboards');

    // The alias the Drafting Room used to squat on now names one door, and it
    // is not the Drafting Room — even with the draft proposal in hand that
    // would otherwise have offered it.
    expect(screen.queryByText('Drafting Room')).not.toBeInTheDocument();
    expect(screen.getAllByText('Boards')).toHaveLength(1);
  });
});

// ============================================================================
// 4. The letterhead instrument
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


// ============================================================================
// 5. The ticket's `People` row — the fourth doorway (B1/B2)
//    The row is a doorway to the SAME roster sheet the three above open, so it
//    answers to the same flag. The page resolves it through `useFeatureFlag`
//    and threads it into the derivation, exactly as this harness does.
// ============================================================================

describe('the ticket — the People row', () => {
  const rung = (word: string): MoneyRung => ({ cents: null, note: '', word });
  const ticketInput = (callSheetEnabled: boolean): TicketInput => ({
    section: 'project',
    phase: null,
    rooms: { settled: true, list: [] },
    pieces: { settled: true, lines: [] },
    drawings: { settled: true, sheetCount: 0 },
    boards: { settled: true, count: 0 },
    money: {
      settled: true,
      failed: false,
      ladder: {
        budget: rung('budget'),
        plan: rung('plan'),
        authorized: rung('authorized'),
        moved: rung('moved'),
        owed: rung('owed'),
        notDrawn: rung('not drawn'),
      } as MoneyLadder,
      owedDays: null,
      undrawnKind: null,
      owedSince: null,
    },
    dates: { settled: true, schedule: null },
    people: { settled: true, callSheetEnabled, rosterCount: 3 },
  });

  function TicketHarness({ onOpen }: { onOpen?: jest.Mock }) {
    // Mirrors page.tsx: the flag is read once and threaded into the ticket.
    const gate = useFeatureFlag('call-sheet');
    const rows = deriveTicket(ticketInput(gate.value));
    return (
      <JobTicket
        rows={rows}
        seam={{ identity: 'The job · Project', exceptions: 'Nothing overdue' }}
        head={{ subject: 'The job · Project', phase: null }}
        onOpenLeaf={jest.fn()}
        routes={{}}
        onUnfoldRegion={jest.fn()}
        onOpenCallSheet={onOpen ?? jest.fn()}
      />
    );
  }

  it('offers the row as a door with the flag on', () => {
    mockCallSheetFlag = true;
    render(<TicketHarness />);

    expect(screen.getByRole('button', { name: /People/ })).toBeInTheDocument();
    expect(screen.getByText('3 on the roster')).toBeInTheDocument();
  });

  it('names the absence — not an empty roster — when the flag is off', () => {
    mockCallSheetFlag = false;
    render(<TicketHarness />);

    // The row still prints: a row that vanishes at zero cannot be told from a
    // row that failed to load. What it loses is the door.
    expect(screen.queryByRole('button', { name: /People/ })).toBeNull();
    expect(
      screen.getByText("the call sheet isn't turned on for this studio"),
    ).toBeInTheDocument();
  });

  it('reaches the roster sheet — never a leaf — when pressed', () => {
    mockCallSheetFlag = true;
    const onOpen = jest.fn();
    render(<TicketHarness onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /People/ }));
    expect(onOpen).toHaveBeenCalled();
  });
});
