import { fireEvent, render, screen } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockTradeScopes: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };
let mockCoverage: Record<string, { coverage: string }> = {};

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
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
    isLoading: false,
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
jest.mock('../../mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../line-unfold', () => ({ LineUnfold: () => null }));

import { FFESection } from '../../ffe-section';
import { RoomLensProvider } from '../../room-lens-context';

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

describe('FF&E project-mode region head', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
    mockCoverage = {};
  });

  /** A line with a piece behind it, already on an invoice — no exception. */
  const settled = (over: Record<string, unknown> = {}) =>
    line({ product_id: 'product-1', ...over });

  it('inks exactly one ledger entry — Add a line, when nothing on the spread is an exception', () => {
    mockItems = [settled()];
    mockCoverage = { 'line-1': { coverage: 'invoiced' } };
    renderProject();
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Add a line');
  });

  it('elects the sharpest exception instead — F34, one inked leader still', () => {
    // The fixture line carries no piece and no invoice: two exceptions, and
    // the unspecified one is the sharper of the pair.
    renderProject();
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Spec the 1 unspecified');
    expect(
      screen.getByRole('button', { name: /Bill 1 uninvoiced line/ }),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });

  it('elects the damage claim over both, and names the act FILE THE CLAIM', () => {
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
    expect(inked[0]).toHaveTextContent('File the claim');
  });

  it('reads Pieces, with the FF&E schedule named in its sub-line (C20)', () => {
    renderProject();
    expect(screen.getByRole('heading', { name: 'Pieces' })).toBeInTheDocument();
    expect(
      screen.getByText(/the FF&E schedule, by room/),
    ).toBeInTheDocument();
  });

  it('prints the worst two exceptions on line two, sharpest first', () => {
    mockItems = [line({ id: 'ffe-1' }), line({ id: 'ffe-2' })];
    renderProject();
    const head = document.querySelector('[data-region-head="ffe"]');
    expect(head).toHaveTextContent('2 unspecified · 2 uninvoiced');
  });

  it('inks Release for authorization instead, once canRelease holds', () => {
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
    renderProject();
    const inked = document.querySelectorAll('[data-action-variant="inked"]');
    expect(inked).toHaveLength(1);
    expect(inked[0]).toHaveTextContent('Release for authorization');
    // Add a line survives, demoted rather than dropped. Scoped by action key,
    // not text — SP-09 gave the per-room add-line act the same words.
    expect(
      document.querySelector('[data-action-key="open-add-to-project"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
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

  it('counts the Throughout group so lines in no room are never "0"', () => {
    // Every line unassigned to a room: the body prints ONE group (Throughout),
    // and the head has to say so rather than counting rooms it does not have.
    mockRooms = [];
    mockItems = [
      line({ id: 'ffe-1', project_room_id: null, room: null }),
      line({ id: 'ffe-2', project_room_id: null, room: null }),
    ];
    renderProject();
    expect(
      screen.getByText('the FF&E schedule, by room · 1 group · 2 lines'),
    ).toBeInTheDocument();
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

// W2 — the room heading itself is the room lens's press target (the same
// contract job-ticket.tsx's room chip already carries).
describe('FF&E room heading — the room lens press target', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [line()];
    mockInstruments = [];
    mockTradeScopes = [];
    mockAuthority = { data: null };
    mockCoverage = {};
  });

  const renderProjectInLens = (projectId = 'project-1') =>
    render(
      <RoomLensProvider>
        <FFESection projectId={projectId} projectName="Ellsworth" mode="project" />
      </RoomLensProvider>,
    );

  it('carries data-room-chip and flips aria-pressed on press, taking the room in hand', () => {
    renderProjectInLens();
    const heading = screen.getByRole('button', { name: /Primary bedroom/ });
    expect(heading).toHaveAttribute('data-room-chip', 'room-1');
    expect(heading).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(heading);
    expect(heading).toHaveAttribute('aria-pressed', 'false');
  });

  it('never turns "Throughout" — a heading with no room behind it — into a press target', () => {
    mockItems = [line(), line({ id: 'line-2', project_room_id: null })];
    renderProjectInLens();
    const throughoutHeading = screen.getByText('Throughout');
    expect(throughoutHeading.closest('button')).toBeNull();
    expect(
      document.querySelector('[data-room-chip="undefined"]'),
    ).not.toBeInTheDocument();
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
