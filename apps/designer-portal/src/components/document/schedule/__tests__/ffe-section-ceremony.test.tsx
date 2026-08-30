import { fireEvent, render, screen, within } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockTradeScopes: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };
let mockItemsLoading = false;
let mockItemsError = false;
const mockItemsRefetch = jest.fn();
let mockReadinessLoading = false;
let mockReadinessError = false;
const mockReadinessRefetch = jest.fn();

/* R127 W4 — the lens's fourth fold voice. With no lens attached (the page
   attaches it) a stop renders QUIET, so every claim below about the region's
   body states which density it is making the claim at. `full` is the default
   here because these suites were written against the full body. */
let mockLensDensity: 'full' | null = 'full';
jest.mock('@/hooks/use-lens-density', () => ({
  useLensDensityStore: () => mockLensDensity,
}));
beforeEach(() => {
  mockLensDensity = 'full';
});

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
    isLoading: mockItemsLoading,
    isError: mockItemsError,
    refetch: mockItemsRefetch,
  }),
  useProjectFfeReadiness: () => ({
    data: mockReadinessError
      ? undefined
      : mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
    isLoading: mockReadinessLoading,
    isError: mockReadinessError,
    refetch: mockReadinessRefetch,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useCreateNamedProjectNeed: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('../add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: mockTradeScopes }),
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
jest.mock('../../line-unfold', () => ({
  LineUnfold: ({ onIncludeInRelease }: { onIncludeInRelease: () => void }) => (
    <button onClick={onIncludeInRelease}>Include in the next release</button>
  ),
}));

import { FFESection } from '../../ffe-section';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1230000,
  line_total_cents: 1230000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
  ...over,
});

const renderSection = () =>
  render(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);

describe('the schedule ceremony', () => {
  beforeEach(() => {
    mockItemsLoading = false;
    mockItemsError = false;
    mockItemsRefetch.mockReset();
    mockReadinessLoading = false;
    mockReadinessError = false;
    mockReadinessRefetch.mockReset();
    mockRooms = [
      { id: 'room-1', name: 'Primary bedroom', budget_cents: 0 },
      { id: 'room-2', name: 'Living', budget_cents: 0 },
    ];
    mockItems = [
      item(),
      item({
        id: 'line-2',
        name: 'Roman shades, six windows',
        line_total_cents: 390000,
        unit_price_cents: 390000,
      }),
      item({
        id: 'line-3',
        name: 'Console table',
        project_room_id: 'room-2',
        room: { id: 'room-2', name: 'Living' },
        unit_price_cents: null,
        line_total_cents: null,
      }),
    ];
    mockInstruments = [
      {
        number: 2,
        state: 'executed',
        depositPaid: true,
        items: [{ sourceFfeItemId: 'line-2', clientLineTotalCents: 390000 }],
      },
    ];
    mockTradeScopes = [];
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
  });

  it('distinguishes loading, error, and a successful empty schedule', () => {
    mockItems = [];
    mockItemsLoading = true;
    const loading = renderSection();
    expect(screen.getByText('Reading the schedule')).toBeVisible();
    expect(screen.queryByText('Build the FF&E schedule')).not.toBeInTheDocument();
    loading.unmount();

    mockItemsLoading = false;
    mockItemsError = true;
    const failed = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockItemsRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Build the FF&E schedule')).not.toBeInTheDocument();
    failed.unmount();

    mockItemsError = false;
    renderSection();
    // R127 OD-10 (W3-L5). A settled, genuinely empty schedule USED to default
    // its region to folded (the seam read "N rooms · no lines yet"), so the
    // guided empty state in the body had to be unfolded to. `ffe` is a STOP
    // key now — a derived default quiets it, never folds it — so the guided
    // empty state is already on the paper, with no seam standing in front of
    // it. The claim is unchanged: a successful empty schedule GUIDES.
    expect(screen.queryByRole('button', { name: /unfold/i })).not.toBeInTheDocument();
    expect(screen.getByText('Build the FF&E schedule')).toBeVisible();
  });

  it('says so when readiness cannot be read, instead of silently holding every line', () => {
    mockReadinessError = true;
    renderSection();
    expect(
      screen.getByText(/Release readiness could not be read/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockReadinessRefetch).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    ).toBeDisabled();
    expect(screen.getAllByText('specification not ready').length).toBeGreaterThan(0);
  });

  it('wears the second stamp beside the logistics one', () => {
    renderSection();
    expect(screen.getByText('Authorized · A2')).toBeInTheDocument();
    expect(
      screen.getAllByLabelText('Not yet released for authorization'),
    ).toHaveLength(2);
  });

  it('tells each room what it has released and what it has not', () => {
    renderSection();
    expect(
      screen.getByText(/\$3,900 released · \$12,300 not yet/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$0 released · \$0 not yet/)).toBeInTheDocument();
  });

  it('offers the head act on a project with billing authority', () => {
    renderSection();
    expect(
      screen.getByRole('button', { name: /release for authorization/i }),
    ).toBeInTheDocument();
  });

  it('withholds the head act when no agreement stands behind the project', () => {
    mockAuthority = { data: null };
    renderSection();
    expect(
      screen.queryByRole('button', { name: /release for authorization/i }),
    ).not.toBeInTheDocument();
  });

  it('disables the head act and explains itself when canRelease holds but no line is eligible', () => {
    // Every line blocked — eligibility() returns false for all of them —
    // while billing authority (canRelease) is still active.
    mockItems = [
      item({ blocked: true }),
      item({
        id: 'line-2',
        name: 'Roman shades, six windows',
        blocked: true,
      }),
      item({
        id: 'line-3',
        name: 'Console table',
        project_room_id: 'room-2',
        room: { id: 'room-2', name: 'Living' },
        blocked: true,
      }),
    ];
    mockInstruments = [];
    renderSection();

    const button = screen.getByRole('button', {
      name: /release for authorization/i,
    });
    expect(button).toBeDisabled();
    expect(
      screen.getByText('No lines are currently eligible for release.'),
    ).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText('Choose what to release')).not.toBeInTheDocument();
  });

  it('leaves the head act enabled with no explanatory text when at least one line is eligible', () => {
    renderSection();
    const button = screen.getByRole('button', {
      name: /release for authorization/i,
    });
    expect(button).toBeEnabled();
    expect(
      screen.queryByText('No lines are currently eligible for release.'),
    ).not.toBeInTheDocument();
  });

  it('turns the schedule into a selection surface', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    expect(screen.getByText('Choose what to release')).toBeInTheDocument();
    expect(
      screen.getByText(/Tick the lines the client is being asked to authorize/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /put back · esc/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    ).toBeEnabled();
  });

  it('says why a line cannot go, and refuses to tick it', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Roman shades, six windows in this release',
      }),
    ).toBeDisabled();
    expect(screen.getByText('in authorization № 2')).toBeInTheDocument();
    expect(screen.getByText('no price — resolve to release')).toBeInTheDocument();
  });

  it('ticks a whole room from its header, and counts what it holds', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include every eligible line in Primary bedroom',
      }),
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    ).toBeChecked();
    const bar = screen.getByTestId('composition-bar');
    expect(bar).toHaveTextContent('1 line · 1 room · $12,300');
  });

  it('counts a partial room honestly in the header', () => {
    mockItems = [
      item(),
      item({ id: 'line-4', name: 'Bedside lamps, pair', line_total_cents: 230000 }),
    ];
    mockInstruments = [];
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    );
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('puts the ceremony back on Esc, with nothing created', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Choose what to release')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composition-bar')).not.toBeInTheDocument();
    expect(screen.getByText('Pieces')).toBeInTheDocument();
  });

  it('opens the review sheet from the bar', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /review & release/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText(/Authorization № 3/),
    ).toBeInTheDocument();
  });

  it('releases an allowance at its ceiling, not its (lower) line total — the bar and the review sheet both show the ceiling', () => {
    mockItems = [
      item({
        id: 'line-6',
        name: 'Art allowance',
        item_type: 'allowance',
        unit_price_cents: 200000,
        line_total_cents: 200000,
        budget_max_cents: 400000,
      }),
    ];
    mockInstruments = [];
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /release for authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include Art allowance in this release',
      }),
    );

    const bar = screen.getByTestId('composition-bar');
    expect(bar).toHaveTextContent('1 line · 1 room · $4,000');
    expect(bar).not.toHaveTextContent('$2,000');

    fireEvent.click(screen.getByRole('button', { name: /review & release/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('$4,000').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('$2,000')).not.toBeInTheDocument();
  });

  it('carries a quiet Add a line under every room', () => {
    // SP-09 gave the region-head ledger act the same words ('Add a line'), so
    // the per-room add is scoped by its own action key rather than by text.
    renderSection();
    const roomAddLines = document.querySelectorAll(
      '[data-action-key="open-add-schedule-line"]',
    );
    expect(roomAddLines).toHaveLength(2);
    fireEvent.click(roomAddLines[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Line name')).toBeInTheDocument();
  });

  it('lets a line join the next release from its unfold', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /Walnut bed, king/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /include in the next release/i }),
    );
    expect(screen.getByText('Choose what to release')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    ).toBeChecked();
  });
});
