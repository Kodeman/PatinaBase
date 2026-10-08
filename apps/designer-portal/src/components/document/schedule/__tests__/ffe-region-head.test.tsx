import { act, fireEvent, render, screen } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockTradeScopes: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };
let mockCoverage: Record<string, { coverage: string }> = {};
let mockReadinessLoading = false;

/* R127 W4 — the lens's fourth fold voice. With no lens attached (the page
   attaches it) a stop renders QUIET, so every claim below about the region's
   body states which density it is making the claim at. `full` is the default
   here because these suites were written against the full body. */
// W4-C9 — the real `useLensDensityStore` runs here, driven through the store's
// own test setter. A `jest.mock` of the module replaced a two-slot hook with a
// zero-slot arrow, so a conditional call could never be detected from this
// suite; C-8 asks for exactly that guard.
beforeEach(() => {
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

// US-21 CONTRACT §3.8 rule 4 — `one-voice` and `ask-the-paper` ship on for
// everyone, so the region renders here in its shipped state.
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' || flag === 'ask-the-paper',
    isLoading: false,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// C-34: the install manifest reads its own hooks; this suite is about the table.
jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  useProjectRoomPlacements: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  // Install mode's one leader (`one-voice`) reads the install window.
  useInstallWindow: () => ({ data: null, isSuccess: true }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({
    data: mockItems,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({
      selectionId: item.id,
      ready: true,
      missingFields: [],
    })),
    isLoading: mockReadinessLoading,
    isError: false,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: mockCoverage }),
}));

const openAddToProject = jest.fn();
jest.mock('../add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: (...args: unknown[]) => openAddToProject(...args),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: mockTradeScopes, isPending: false }),
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePublishBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOverrideBudgetCheckpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/portal/ffe/stages', () => ({
  STAGE_CONFIG: new Proxy(
    {},
    {
      get: (_target, key: string) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        color: 'var(--text-muted)',
      }),
    },
  ),
}));

jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../line-unfold', () => ({ LineUnfold: () => null }));

import { FFESection } from '../../ffe-section';
import { RoomLensProvider } from '../../room-lens-context';
import { __setDensityForTest } from '@/hooks/use-lens-density';
import { regionBoxSignature } from '../../region/region-box-signature';

/** A furnishing the studio still has to release. */
const line = (over: Record<string, unknown> = {}) => ({
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1_230_000,
  line_total_cents: 1_230_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
  ...over,
});

const renderProject = (projectId = 'project-1') =>
  render(
    <FFESection projectId={projectId} projectName="Ellsworth" mode="project" />,
  );

const renderInstall = (projectId = 'project-1') =>
  render(
    <FFESection projectId={projectId} projectName="Ellsworth" mode="install" />,
  );


// D-B49 — the FF&E/schedule region ROOTS now own the work reads (they moved out
// of `WorkBlock`/`CoordinationWork`, which mount only in a promoted body, so a
// promotion no longer fetches). This suite mounts the region with no
// QueryClientProvider — every other data hook it uses is mocked the same way —
// so these three have to be mocked too or the root throws "No QueryClient set".
const sectionWorkCalls = { tasks: 0, gates: 0, logged: 0 };
jest.mock('@/hooks/use-section-work', () => {
  const actual = jest.requireActual('@/hooks/use-section-work');
  const idle = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
  return {
    ...actual,
    useSectionTasks: (projectId: string | null) => {
      if (projectId) sectionWorkCalls.tasks += 1;
      return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    },
    useSectionGates: (projectId: string | null) => {
      if (projectId) sectionWorkCalls.gates += 1;
      return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
    },
    useSectionLoggedMinutes: (projectId: string | null) => {
      if (projectId) sectionWorkCalls.logged += 1;
      return { data: 0 };
    },
    useCreateSectionTask: () => idle,
    useToggleSectionTask: () => idle,
    useRequestSectionGate: () => idle,
  };
});

describe('FF&E project-mode region head', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
    mockCoverage = {};
    mockReadinessLoading = false;
  });

  /** A line with a piece behind it, already on an invoice — no exception. */
  const settled = (over: Record<string, unknown> = {}) =>
    line({ product_id: 'product-1', ...over });
  const head = () => document.querySelector('[data-region-head="ffe"]') as HTMLElement;

  it('inks exactly one ledger entry — Work the pieces, to the Build room', () => {
    mockItems = [settled()];
    mockCoverage = { 'line-1': { coverage: 'invoiced' } };
    renderProject();
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Work the pieces');
    expect(inked[0]).toHaveAttribute('data-action-key', 'work-the-pieces');
    expect(inked[0]).toHaveAttribute('href', '/doc/project-1/pieces?lens=rough');
  });

  it('US-21 Q14 — prints Work the pieces, Add to the job, Release, Record a change, in that order', () => {
    renderProject();
    const keys = Array.from(head().querySelectorAll('[data-action-key]'))
      .map((el) => el.getAttribute('data-action-key'))
      .filter((key) => key !== 'ffe-fold');
    expect(keys).toEqual([
      'work-the-pieces',
      'open-add-to-project',
      'release-for-authorization',
      'record-a-change-pieces-head',
    ]);
    expect(screen.getByRole('button', { name: 'Fold ↑' })).toBeInTheDocument();
  });

  it('US-21 fix-now #3 — the head adds to the job; the room act stays Add a line', () => {
    mockItems = [settled()];
    mockCoverage = { 'line-1': { coverage: 'invoiced' } };
    renderProject();
    const add = document.querySelector('[data-action-key="open-add-to-project"]');
    expect(add).toHaveTextContent('Add to the job');
    expect(add).not.toHaveTextContent('Add a line');
    const roomAct = document.querySelector('[data-action-key="open-add-schedule-line"]');
    expect(roomAct).toHaveTextContent('Add a line');
    fireEvent.click(add as HTMLElement);
    expect(openAddToProject).toHaveBeenCalledWith('section');
  });

  it('US-21 Q14 — line two counts the stages: placeholders, specced, ready, nothing released', () => {
    mockItems = [
      line({ id: 'ffe-1' }),
      line({ id: 'ffe-2' }),
      line({ id: 'ffe-3', vendor_name: 'Hollis Millwork', unit_price_cents: 0 }),
      settled({ id: 'ffe-4' }),
      line({ id: 'ffe-5', removed_at: '2026-10-01T00:00:00Z' }),
    ];
    renderProject();
    expect(head()).toHaveTextContent('by room · 1 room · 4 lines');
    expect(head()).toHaveTextContent('2 placeholders · 1 specced · 1 ready · nothing released');
    expect(head()).not.toHaveTextContent(/unspecified/i);
  });

  it('US-21 Q14 — retires the elected leader: no Fill, Spec, Bill or File the claim act', () => {
    render(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        needs={[
          {
            kind: 'damage_claim',
            text: 'PO-2026-0418 has an open damage claim',
            actionLabel: 'Review the claim',
            stamp: { label: 'CLAIM OPEN', color: 'var(--color-terracotta)' },
            urgent: false,
          },
        ]}
      />,
    );
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Work the pieces');
    for (const retired of [
      'open-spec-book',
      'bill-project-ffe',
      'file-ffe-claim',
      'chase-ffe-po',
    ]) {
      expect(document.querySelectorAll(`[data-action-key="${retired}"]`)).toHaveLength(0);
    }
    expect(screen.queryByText(/uninvoiced/)).not.toBeInTheDocument();
    // The claim still stands on line two, beside the stage sentence.
    expect(head()).toHaveTextContent('1 placeholder · nothing released · 1 open damage claim');
  });

  it('US-21 fix-now #2 — the unassigned group reads Not in a room yet', () => {
    mockItems = [
      settled(),
      line({ id: 'ffe-2', project_room_id: null, room: null, assignment_scope: 'unassigned' }),
    ];
    renderProject();
    expect(screen.getByText('Not in a room yet')).toBeInTheDocument();
    expect(screen.queryByText('Unsorted')).not.toBeInTheDocument();
  });

  it('US-21 Q14 — holds Release for authorization, never inked, with its reason', () => {
    renderProject();
    const release = screen.getByRole('button', { name: 'Release for authorization' });
    expect(release).toHaveAttribute('data-action-variant', 'secondary');
    expect(release).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('No signed agreement stands behind the job yet.'),
    ).toBeInTheDocument();
  });

  it('prints Release for authorization pressable, still not inked, once canRelease holds', () => {
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
    renderProject();
    const release = screen.getByRole('button', { name: 'Release for authorization' });
    expect(release).toHaveAttribute('data-action-variant', 'secondary');
    expect(release).not.toHaveAttribute('aria-disabled', 'true');
    expect(document.querySelectorAll('[data-action-variant="inked"]')).toHaveLength(1);
  });

  it('arrives OPEN when the schedule has settled empty — the default quiets a stop, it never folds it', () => {
    // R127 OD-10 (W3-L5). This case read "renders the fold seam by default
    // when the schedule has settled empty". `ffe` is a STOP key, so a derived
    // default is DENSITY now, not a fold: an empty schedule arrives open and
    // quiet, with its head and its count line on the paper rather than a seam.
    mockItems = [];
    renderProject();

    expect(document.querySelector('[data-fold-seam]')).toBeNull();
    expect(document.querySelector('[data-region-head]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Pieces' })).toBeInTheDocument();
  });

  it('renders the fold seam with its summary when she folded it herself', () => {
    // The seam's own claim — its summary line — kept whole under the one cause
    // a stop can still have (OD-10).
    mockItems = [];
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    renderProject();
    expect(
      screen.getByText('1 group · no lines yet', { exact: false }),
    ).toBeInTheDocument();
  });

  it('counts the job’s rooms, and prints the lines in no room under Throughout', () => {
    mockRooms = [];
    mockItems = [
      line({ id: 'ffe-1', project_room_id: null, room: null }),
      line({ id: 'ffe-2', project_room_id: null, room: null }),
    ];
    renderProject();
    expect(screen.getByText('by room · 0 rooms · 2 lines')).toBeInTheDocument();
    const throughout = document.querySelector('[data-pieces-room="throughout"]');
    expect(throughout).toHaveTextContent('Throughout');
    expect(throughout).toHaveTextContent('2 lines · 2 placeholders');
  });

  it('counts one line and one room in the singular (walk D15)', () => {
    mockItems = [line({ id: 'ffe-1' })];
    renderProject();
    expect(screen.getByText('by room · 1 room · 1 line')).toBeInTheDocument();
  });

  it('opens from the seam back to the full head, round-trip', () => {
    mockItems = [];
    // The fold she made herself is the only seam a stop can wear (OD-10).
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    renderProject();
    fireEvent.click(screen.getByRole('button', { name: /unfold/i }));
    expect(
      screen.getByRole('heading', { name: 'Pieces' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fold ↑' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fold ↑' }));
    expect(
      screen.queryByRole('heading', { name: 'Pieces' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/unfold/i)).toBeInTheDocument();
  });

  it('leaves install mode rendering its own head, no RegionHead at all', () => {
    renderInstall();
    expect(screen.getByRole('heading', { name: 'Install' })).toBeInTheDocument();
    // RegionHead's fold control never appears in install mode.
    expect(
      screen.queryByRole('button', { name: 'Fold ↑' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/unfold/i)).not.toBeInTheDocument();
  });
});

// W2 — the room heading was the room lens's press target. US-21 Q14: on the
// overview the room's name unfolds the room; the lens press stands only on the
// ceremony's headings, which never turn it while bulk-selecting.
describe('FF&E room rows — the name unfolds the room', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
    mockCoverage = {};
    mockReadinessLoading = false;
  });

  const renderProjectInLens = (projectId = 'project-1') =>
    render(
      <RoomLensProvider>
        <FFESection projectId={projectId} projectName="Ellsworth" mode="project" />
      </RoomLensProvider>,
    );

  it('unfolds the room to its lines, and is no room-lens press target', () => {
    renderProjectInLens();
    const name = screen.getByRole('button', { name: 'Primary bedroom' });
    expect(name).toHaveAttribute('aria-expanded', 'false');
    expect(name).not.toHaveAttribute('data-room-chip');
    expect(document.querySelector('[data-room-chip]')).toBeNull();
    expect(screen.queryByText('Walnut bed, king')).not.toBeInTheDocument();

    fireEvent.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Walnut bed, king')).toBeInTheDocument();

    fireEvent.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Walnut bed, king')).not.toBeInTheDocument();
  });

  it('does not toggle the room lens while bulk-selecting — the tri-state tick owns the press instead', () => {
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
    renderProjectInLens();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    // In selecting mode the heading's press target is the tri-state tick, not
    // the room lens — "Primary bedroom" prints as plain text, not a button.
    const heading = screen.getByText('Primary bedroom');
    expect(heading.closest('button')).toBeNull();
  });
});

/**
 * R127 W4 (L-4, OD-12, OD-13) — the quiet body. Until the lens reaches this
 * stop, Pieces prints its head, one count line, one leader and one state line;
 * the schedule itself is not on the paper. `__setDensityForTest(null)` is the lens
 * with nothing to say, which is exactly what the page renders 2,000px ahead.
 */
describe('FF&E quiet body — the lens has not reached this stop', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
    mockCoverage = {};
    mockReadinessLoading = false;
    // W4 close replaced the lane's `mockLensDensity` variable with the real
    // store; `null` is still "the lens has nothing to say".
    act(() => {
      __setDensityForTest(null);
    });
  });

  it('prints the head, one count line and the state line — and no lines', () => {
    mockItems = [
      line({ id: 'ffe-1' }),
      line({ id: 'ffe-2', project_room_id: null, room: null }),
    ];
    renderProject();

    expect(screen.getByRole('heading', { name: 'Pieces' })).toBeInTheDocument();
    // W4-R1: the count line IS the head's status line.
    const head = document.querySelector('[data-region-head="ffe"]')!;
    expect(head).toHaveTextContent('2 lines · 1 room');
    expect(
      document.querySelectorAll('[data-region-count-line]'),
    ).toHaveLength(0);
    // The head's own acts are the only acts (mockup governs what prints).
    expect(
      screen.queryByRole('button', { name: /See the lines/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '2 lines · not yet on the paper · press Pieces on the index to open',
      ),
    ).toHaveClass('sr-only');

    // The schedule is not on the paper: no line, no room head, no Throughout.
    expect(screen.queryByText('Walnut bed, king')).not.toBeInTheDocument();
    expect(screen.queryByText('Primary bedroom')).not.toBeInTheDocument();
    expect(screen.queryByText('Throughout')).not.toBeInTheDocument();
  });

  it('F3 — prints its leader alone: every overflow act is NOT rendered at quiet', () => {
    mockItems = [line({ id: 'ffe-1' })];
    renderProject();

    const head = document.querySelector('[data-region-head="ffe"]')!;
    // US-21 Q14: entry 0 is Work the pieces; Add to the job and the release
    // are overflow.
    expect(head).toContainElement(
      screen.getByRole('link', { name: /Work the pieces/ }),
    );
    // Not rendered, not hidden: `DocumentActionGroup`'s one-leader guard and
    // `action-visibility.spec.ts` both COUNT `[data-action-key]` nodes, so an
    // `aria-hidden` copy would still be one of them.
    for (const key of [
      'open-add-to-project',
      'release-for-authorization',
      'file-ffe-claim',
      'chase-ffe-po',
    ]) {
      expect(
        document.querySelectorAll(`[data-action-key="${key}"]`),
      ).toHaveLength(0);
    }
    // The ledger prints its leader beside the head's own Fold control, with
    // the named act Record a change (F2-18, `one-voice` shipped on).
    const acts = Array.from(
      head.querySelectorAll('[data-action-key]'),
    ).map((el) => el.getAttribute('data-action-key'));
    expect(acts.filter((key) => key !== 'ffe-fold')).toEqual([
      'work-the-pieces',
      'record-a-change-pieces-head',
    ]);
  });

  it('names the damage the paper holds, and prints nothing where it holds none', () => {
    render(
      <FFESection
        projectId="project-1"
        projectName="Ellsworth"
        mode="project"
        needs={[
          {
            kind: 'damage_claim',
            text: 'PO-2026-0418 has an open damage claim',
            actionLabel: 'Review the claim',
            stamp: { label: 'CLAIM OPEN', color: 'var(--color-terracotta)' },
            urgent: false,
          },
        ]}
      />,
    );
    expect(
      document.querySelector('[data-region-head="ffe"]'),
    ).toHaveTextContent('1 line · 1 room · 1 damaged');

    renderProject();
    const heads = document.querySelectorAll('[data-region-head="ffe"]');
    expect(heads[heads.length - 1]).toHaveTextContent('1 line · 1 room');
    expect(heads[heads.length - 1]).not.toHaveTextContent('damaged');
  });

  it('publishes its density and its reserve on the index root (OD-12)', () => {
    // The fixture line carries neither a piece nor an invoice, so the head
    // prints standing exceptions and takes the taller reserve.
    renderProject();
    const root = document.querySelector<HTMLElement>('[data-index-region="ffe"]');
    expect(root).toHaveAttribute('data-density', 'quiet');
    expect(root!.style.getPropertyValue('--doc-quiet-reserve')).toBe(
      'var(--doc-quiet-reserve-exc)',
    );
  });

  it('takes the taller reserve on a settled job too: line two always counts the stages (US-21 Q14)', () => {
    mockItems = [line({ product_id: 'product-1' })];
    mockCoverage = { 'line-1': { coverage: 'invoiced' } };
    renderProject();
    const root = document.querySelector<HTMLElement>('[data-index-region="ffe"]');
    expect(root!.style.getPropertyValue('--doc-quiet-reserve')).toBe(
      'var(--doc-quiet-reserve-exc)',
    );
    expect(document.querySelector('[data-region-head="ffe"]')).toHaveTextContent(
      '1 ready · nothing released',
    );
  });

  it('keeps the same head element when the lens promotes it to full', () => {
    const { rerender } = renderProject();
    const head = document.querySelector('[data-region-head="ffe"]');
    // H5 — the root's OUTER box may not depend on its density.
    const quietBox = regionBoxSignature(
      document.querySelector('[data-index-region="ffe"]'),
    );
    const heading = screen.getByRole('heading', { name: 'Pieces' });

    act(() => {
      __setDensityForTest('full');
    });
    rerender(
      <FFESection projectId="project-1" projectName="Ellsworth" mode="project" />,
    );

    expect(document.querySelector('[data-region-head="ffe"]')).toBe(head);
    expect(screen.getByRole('heading', { name: 'Pieces' })).toBe(heading);
    expect(
      document.querySelector('[data-index-region="ffe"]'),
    ).toHaveAttribute('data-density', 'full');
    expect(
      screen.queryByText(/not yet on the paper/),
    ).not.toBeInTheDocument();
    // US-21 Q14: the full body is the room rows; the room unfolds to its lines.
    expect(screen.getByRole('button', { name: 'Primary bedroom' })).toBeInTheDocument();
    // The same outer box on the other side of the promotion: same
    // margins, same border, same reserve, same rules. A stop that grew a
    // top margin on promotion would move every root below it.
    expect(
      regionBoxSignature(
        document.querySelector('[data-index-region="ffe"]'),
      ),
    ).toBe(quietBox);
  });

  it('lets the fold she made outrank the lens, whatever the lens says', () => {
    window.localStorage.setItem('patina:doc-fold:project-1:ffe', '1');
    act(() => {
      __setDensityForTest('full');
    });
    renderProject();

    expect(document.querySelector('[data-fold-seam]')).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Pieces' }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-index-region="ffe"]'),
    ).toHaveAttribute('data-density', 'full');
  });

  it('leaves install mode full — its head has no quiet form to stand in', () => {
    renderInstall();
    expect(
      document.querySelector('[data-index-region="ffe"]'),
    ).toHaveAttribute('data-density', 'full');
    expect(screen.getByText('Walnut bed, king')).toBeInTheDocument();
    expect(screen.queryByText('Quiet — opens as you read')).not.toBeInTheDocument();
  });

  // D-B39/W5-R3 — the readiness pulse prints as the last inline child of the
  // head's own status line (`ffeStatus`), never as a separate row that would
  // move `money` when it unmounts (the original defect: FF&E's readiness
  // fan-out resolving collapsed the region 24px, moving every root below it).
  it('prints the readiness pulse inline in the head\'s status line — the count line\'s text and the head\'s box are unchanged (D-B39/W5-R3)', () => {
    mockReadinessLoading = true;
    const { rerender } = renderProject();

    const head = document.querySelector('[data-region-head="ffe"]') as HTMLElement;
    expect(head).not.toBeNull();
    const statusLine = () => head.querySelector('h2 + p') as HTMLElement;
    const visibleText = (p: HTMLElement) => {
      const clone = p.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only, [aria-hidden]').forEach((el) => el.remove());
      return clone.textContent?.trim();
    };

    const classesLoading = head.className;
    const textLoading = visibleText(statusLine());
    // The sr-only label is present while it loads — the a11y half of the bar.
    expect(screen.getByText('Checking readiness')).toBeInTheDocument();
    // No separate loading row exists anywhere else on the region — it is
    // exactly one inline pulse, inside the head.
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);

    mockReadinessLoading = false;
    rerender(
      <FFESection projectId="project-1" projectName="Ellsworth" mode="project" />,
    );

    const classesLoaded = head.className;
    const textLoaded = visibleText(statusLine());

    // The count line's own text never changes across the transition — only
    // the pulse (and its sr-only label) mounts and unmounts.
    expect(textLoaded).toBe(textLoading);
    // The head's own box (its class list — no `region-box-signature` helper
    // exists on this base, so class-list equality is the fallback the
    // coordinator named) is identical whether the bar is mounted or not.
    expect(classesLoaded).toBe(classesLoading);
    expect(screen.queryByText('Checking readiness')).not.toBeInTheDocument();
  });
});

/**
 * D-B49 — a region's data hooks live at its ROOT, and the root is mounted at
 * every density. The FF&E work reads used to sit inside `WorkBlock`, which
 * mounts only in the promoted body, so the lens's own promotion refetched them
 * (all three carry the default `staleTime: 0`) — a promotion that fetches,
 * which `lens-contrast.spec.ts:183` forbids.
 *
 * The falsifier is a COUNT, not a presence: the reads must happen at quiet as
 * well as at full, and the same number of times, or the promotion is still
 * what triggers them.
 */
describe('D-B49 — the FF&E region root owns the work reads at every density', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
    mockCoverage = {};
    mockReadinessLoading = false;
    sectionWorkCalls.tasks = 0;
    sectionWorkCalls.gates = 0;
    sectionWorkCalls.logged = 0;
  });

  it('US-21 Q14 — reads no work on the project spread, quiet or full: Tasks retire there', () => {
    act(() => {
      __setDensityForTest(null);
    });
    render(
      <FFESection projectId="project-1" projectName="Ellsworth" mode="project" sectionKey="project" />,
    );
    act(() => {
      __setDensityForTest('full');
    });
    expect(sectionWorkCalls).toEqual({ tasks: 0, gates: 0, logged: 0 });
  });

  it('reads tasks, gates and logged minutes at the install root', () => {
    render(
      <FFESection projectId="project-1" projectName="Ellsworth" mode="install" sectionKey="install" />,
    );
    expect(sectionWorkCalls.tasks).toBeGreaterThan(0);
    expect(sectionWorkCalls.gates).toBeGreaterThan(0);
    expect(sectionWorkCalls.logged).toBeGreaterThan(0);
  });
});
