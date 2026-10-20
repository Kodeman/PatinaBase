import { act, fireEvent, render, screen, within } from '@testing-library/react';

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
const mockRelease = jest.fn();
const mockSend = jest.fn();
const mockPreviewReads = jest.fn();
let mockPreviewError = false;
let mockBudget: any = null;

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

// US-21 Q14 — the overview never branches on `one-voice` or `ask-the-paper`;
// both are pinned ON, as they stand in production.
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'one-voice' || flag === 'ask-the-paper',
    isLoading: false,
  }),
}));

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
  inboxKeys: { unreadCount: () => ['inbox', 'unread-count'] },
  procurementUnreadCountKey: () => ['procurement-unread-count'],
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
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
  // C-24: the add sheet's "This piece takes COM" links the fabric line.
  useLinkFfePair: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  useRetryProposalSend: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useProjectPurchasingAgreement: () => ({ data: { state: 'missing', evidence: null }, isPending: false, isError: false }),
  useRecordProjectSignedAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: mockTradeScopes }),
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => ({ isLoading: false, data: mockBudget }),
  useReleaseForAuthorization: () => ({ mutateAsync: mockRelease, isPending: false }),
  useFurnishingsAuthorizationPreview: (proposalId: string, projectId: string) => { mockPreviewReads(proposalId, projectId); return { data: undefined, isPending: false, isFetching: false, isError: mockPreviewError, refetch: jest.fn() }; },
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: mockSend,
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
jest.mock('../../line-unfold', () => ({
  LineUnfold: ({ onIncludeInRelease }: { onIncludeInRelease: () => void }) => (
    <button onClick={onIncludeInRelease}>Include in the next release</button>
  ),
}));

import { FFESection } from '../../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

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

/** US-21 Q14 — the region opens on room rows; a room unfolds to its lines. */
const unfold = (roomKey: string) => {
  const room = document.querySelector<HTMLButtonElement>(
    `[data-pieces-room="${roomKey}"] button[aria-expanded="false"]`,
  );
  if (room) fireEvent.click(room);
};


// D-B49 — the FF&E/schedule region ROOTS now own the work reads (they moved out
// of `WorkBlock`/`CoordinationWork`, which mount only in a promoted body, so a
// promotion no longer fetches). This suite mounts the region with no
// QueryClientProvider — every other data hook it uses is mocked the same way —
// so these three have to be mocked too or the root throws "No QueryClient set".
jest.mock('@/hooks/use-section-work', () => {
  const actual = jest.requireActual('@/hooks/use-section-work');
  const idle = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
  return {
    ...actual,
    useSectionTasks: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
    useSectionGates: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
    useSectionLoggedMinutes: () => ({ data: 0 }),
    useCreateSectionTask: () => idle,
    useToggleSectionTask: () => idle,
    useRequestSectionGate: () => idle,
  };
});

describe('the schedule ceremony', () => {
  beforeEach(() => {
    mockRelease.mockReset().mockResolvedValue({ proposalId: 'saved-1', documentId: 'document-1' });
    mockSend.mockReset();
    mockPreviewError = false;
    mockBudget = null;
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
    // R127 OD-10 (W3-L5): a settled empty schedule is never folded behind a
    // seam. US-21 Q14: it prints its rooms as rows, each with its own Add a
    // line; the retired guided empty state no longer stands.
    expect(screen.queryByRole('button', { name: /unfold/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Build the FF&E schedule')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-pieces-room]')).toHaveLength(2);
    expect(screen.getAllByText('0 lines · 0 placeholders')).toHaveLength(2);
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
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
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
    unfold('room-1');
    expect(screen.getByText('Authorized · A2')).toBeInTheDocument();
    expect(
      screen.getAllByLabelText('Not yet released for authorization'),
    ).toHaveLength(1);
    unfold('room-2');
    expect(
      screen.getAllByLabelText('Not yet released for authorization'),
    ).toHaveLength(1);
    expect(screen.queryByText('Authorized · A2')).not.toBeInTheDocument();
  });

  it('prints each room its row figure, not the retired released · not yet tally', () => {
    renderSection();
    const bedroom = document.querySelector<HTMLElement>('[data-pieces-room="room-1"]')!;
    expect(within(bedroom).getByText('~$16,200')).toBeInTheDocument();
    expect(screen.queryByText(/released · .* not yet/)).not.toBeInTheDocument();
  });

  it('offers the head act on a project with billing authority', () => {
    renderSection();
    expect(
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
    ).toBeInTheDocument();
  });

  it('holds the head act, and says why, when no agreement stands behind the project', () => {
    mockAuthority = { data: null };
    renderSection();
    const button = screen.getByRole('button', { name: /prepare purchasing authorization/i });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('A signed agreement is required before purchasing authorization.'),
    ).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByText('Choose what to release')).not.toBeInTheDocument();
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
      name: /prepare purchasing authorization/i,
    });
    // 0a-8 — held with its reason, not natively disabled.
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    expect(
      screen.getByText('No selections are ready for purchasing authorization yet.'),
    ).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText('Choose what to release')).not.toBeInTheDocument();
  });

  it('leaves the head act enabled with no explanatory text when at least one line is eligible', () => {
    renderSection();
    const button = screen.getByRole('button', {
      name: /prepare purchasing authorization/i,
    });
    expect(button).toBeEnabled();
    expect(
      screen.queryByText('No selections are ready for purchasing authorization yet.'),
    ).not.toBeInTheDocument();
  });

  it('turns the schedule into a selection surface', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
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
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
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
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
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
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    );
    // `one-voice` (F3-20): a count of what is ticked, never `N of M`.
    expect(screen.getByText('1 ticked')).toBeInTheDocument();
  });

  it('puts the ceremony back on Esc, with nothing created', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Include Walnut bed, king in this release',
      }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Choose what to release')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composition-bar')).not.toBeInTheDocument();
    expect(screen.getByText('FF&E selections')).toBeInTheDocument();
  });

  it('opens the review sheet from the bar', () => {
    renderSection();
    fireEvent.click(
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
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
      screen.getByRole('button', { name: /prepare purchasing authorization/i }),
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
    // SP-09 gave the region-head ledger act the same words ('Add room selection'), so
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
    unfold('room-1');
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


describe('saved preview at the actual ceremony owner', () => {
  beforeEach(() => {
    mockItemsLoading = false; mockItemsError = false; mockReadinessLoading = false; mockReadinessError = false;
    mockRooms = [{ id: 'room-1', name: 'Primary bedroom', budget_cents: 0 }];
    mockItems = [item()]; mockInstruments = []; mockTradeScopes = [];
    mockAuthority = { data: { state: 'active', agreementId: 'agreement-1' } };
    mockBudget = { version: { id: 'version-1', lines: [{ roomId: 'room-1', scheduledCents: 1230000 }] }, checkpoint: { id: 'checkpoint-1', state: 'acknowledged' } };
    mockRelease.mockReset().mockResolvedValue({ proposalId: 'saved-1', documentId: 'document-1' });
    mockSend.mockReset(); mockPreviewError = true;
  });
  const review = () => {
    fireEvent.click(screen.getByRole('button', { name: /prepare purchasing authorization/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Walnut bed, king in this release' }));
    fireEvent.click(screen.getByRole('button', { name: /Review & release/i }));
  };
  const closeSaved = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/Draft saved. Nothing has been sent/)).not.toBeInTheDocument();
  };
  it('reopens the exact saved preview after owner unmount and read failure with one creation and no Send', async () => {
    renderSection(); review();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    expect(screen.getByText(/saved preview could not be loaded/)).toBeVisible();
    closeSaved();
    fireEvent.click(screen.getByRole('button', { name: /Review & release/i }));
    expect(screen.queryByRole('button', { name: 'Save draft & preview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText(/saved preview could not be loaded/)).toBeVisible();
    expect(mockPreviewReads).toHaveBeenLastCalledWith('saved-1', 'project-1');
    expect(mockRelease).toHaveBeenCalledTimes(1); expect(mockSend).not.toHaveBeenCalled();
  });
  it.each(['Escape', 'Close'])('retains the exact deferred saved ID after %s dismisses the child', async (dismissal) => {
    let resolve!: (value: unknown) => void;
    mockRelease.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    renderSection(); review();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
    if (dismissal === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await act(async () => { resolve({ proposalId: 'deferred-exact', documentId: 'document-1' }); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Review & release/i }));
    expect(screen.queryByRole('button', { name: 'Save draft & preview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(mockPreviewReads).toHaveBeenLastCalledWith('deferred-exact', 'project-1');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('does not attach a pending old-project save to the new project owner', async () => {
    let resolve!: (value: unknown) => void;
    mockRelease.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { rerender } = renderSection(); review();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
    rerender(<FFESection projectId="project-2" projectName="Other" mode="project" />);
    await act(async () => { resolve({ proposalId: 'old-project-draft' }); });
    review();
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeVisible();
    expect(mockPreviewReads).not.toHaveBeenCalledWith('old-project-draft', 'project-2');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
  it('leaves selection available after a dismissed pending save fails', async () => {
    let reject!: (error: Error) => void;
    mockRelease.mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; }));
    renderSection(); review();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => { reject(new Error('Save failed')); });
    fireEvent.click(screen.getByRole('button', { name: /Review & release/i }));
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeVisible();
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('recovers a completed save after the whole owner unmounts only from persisted instruments', async () => {
    let resolve!: (value: unknown) => void;
    mockRelease.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const owner = renderSection(); review();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
    owner.unmount();
    await act(async () => { resolve({ proposalId: 'persisted-after-unmount' }); });
    mockInstruments = [{ proposalId: 'persisted-after-unmount', number: 4, state: 'draft',
      items: [{ sourceFfeItemId: 'line-1', clientLineTotalCents: 1230000 }] }];
    renderSection(); unfold('room-1');
    expect(screen.getByText('Draft · A4')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prepare purchasing authorization/i })).toHaveAttribute('aria-disabled', 'true');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('clears project-bound saved identity when switching projects', async () => {
    const { rerender } = renderSection(); review();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    rerender(<FFESection projectId="project-2" projectName="Other project" mode="project" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    review();
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeVisible();
    expect(mockRelease).toHaveBeenCalledTimes(1); expect(mockSend).not.toHaveBeenCalled();
  });
  it('can prepare a new identity after the saved authorization is explicitly voided', async () => {
    const { rerender } = renderSection(); review();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    closeSaved();
    mockInstruments = [{ proposalId: 'saved-1', number: 1, state: 'voided', items: [] }];
    mockRelease.mockResolvedValueOnce({ proposalId: 'saved-2', documentId: 'document-2' });
    rerender(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);
    fireEvent.click(screen.getByRole('button', { name: /Review & release/i }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' })); });
    expect(mockRelease).toHaveBeenCalledTimes(2); expect(mockSend).not.toHaveBeenCalled();
  });
});
