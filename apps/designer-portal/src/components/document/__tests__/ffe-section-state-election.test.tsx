/**
 * US-43 R4 — the FF&E head names the work's state in one sentence and leads
 * with the one act that state asks for (`electFfeLeader`), across the pilot's
 * four states: priced, a missing price, with the client, and held. And the
 * rooms: a one-room job opens its room by default.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockRooms: Record<string, unknown>[] = [];
let mockInstruments: Record<string, unknown>[] = [];
let mockAuthority: { data: unknown } = { data: null };

// Job places have their own suite (destinations/__tests__).
jest.mock('@/components/document/destinations/use-job-places', () => ({
  useJobPlaces: () => ({
    organizationId: null,
    locations: [],
    jobLocationIds: new Set(),
    jobPlaces: [],
    studioAddress: undefined,
    siteAddress: null,
    isLoading: false,
    isError: false,
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

// US-21 CONTRACT §3.8 rule 4 — `one-voice` and `ask-the-paper` ship on.
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

jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  inboxKeys: { unreadCount: () => ['inbox', 'unread-count'] },
  procurementUnreadCountKey: () => ['procurement-unread-count'],
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useInstallWindow: () => ({ data: null, isSuccess: true }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
    isLoading: false,
    isError: false,
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: mockRooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useProjectPurchasingAgreement: () => ({ data: { state: 'missing', evidence: null } }),
  useRecordProjectSignedAgreement: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: mockInstruments }),
  useTradeScopes: () => ({ data: [], isPending: false }),
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendFurnishingsAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
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

jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../line-unfold', () => ({ LineUnfold: () => null }));

// D-B49 — the region root owns the work reads; no QueryClientProvider here.
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

import { FFESection } from '../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

/** A chosen, priced piece in the primary bedroom, not yet released. */
const priced = (over: Record<string, unknown> = {}) => ({
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  product_id: 'product-1',
  unit_price_cents: 330_600,
  line_total_cents: 330_600,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Bed' },
  received_quantity: null,
  ...over,
});

const ACTIVE_AGREEMENT = { data: { state: 'active', agreementId: 'agreement-1' } };

const head = () => document.querySelector('[data-region-head="ffe"]') as HTMLElement;
const leads = () => head().querySelectorAll('[data-action-variant="primary"]');
const renderProject = () =>
  render(<FFESection projectId="project-1" projectName="Ellsworth" mode="project" />);

beforeEach(() => {
  window.localStorage.clear();
  __setDensityForTest('full');
  mockRooms = [{ id: 'room-1', name: 'Bed', budget_cents: 0 }];
  mockItems = [priced(), priced({ id: 'line-2', name: 'Linen headboard' })];
  mockInstruments = [];
  mockAuthority = ACTIVE_AGREEMENT;
});
afterEach(() => {
  __setDensityForTest(undefined);
});

describe('US-43 R4 — the FF&E head elects its lead from the work’s state', () => {
  it('priced: leads with the release ceremony, saying nothing is released', () => {
    renderProject();
    expect(head()).toHaveTextContent('Purchasing authorization is ready to prepare.');
    expect(leads()).toHaveLength(1);
    const lead = leads()[0];
    expect(lead).toHaveAttribute('data-action-key', 'release-for-authorization');
    expect(lead).toHaveTextContent('Prepare purchasing authorization');
    // The lead opens the existing release ceremony: the lines take ticks.
    fireEvent.click(lead);
    expect(
      screen.getByRole('checkbox', { name: 'Include Walnut bed, king in this release' }),
    ).toBeInTheDocument();
  });

  it('missing price: with nothing to release, leads to the Build room’s price lens', () => {
    mockItems = [priced({ unit_price_cents: null, line_total_cents: null })];
    renderProject();
    expect(head()).toHaveTextContent('One selection still needs a confirmed price.');
    expect(leads()).toHaveLength(1);
    const lead = leads()[0];
    expect(lead).toHaveAttribute('data-action-key', 'ffe-lead-price');
    expect(lead).toHaveTextContent('Add the missing price');
    expect(lead).toHaveAttribute('href', '/doc/project-1/pieces?lens=price');
  });

  it('a priced line ready to release still outranks a missing price', () => {
    mockItems = [priced(), priced({ id: 'line-2', unit_price_cents: null, line_total_cents: null })];
    renderProject();
    expect(leads()).toHaveLength(1);
    expect(leads()[0]).toHaveAttribute('data-action-key', 'release-for-authorization');
    expect(head().querySelector('[data-action-key="ffe-lead-price"]')).toBeNull();
  });

  it('waiting: names the client’s turn and elects no lead, with no bill or send cue', () => {
    mockInstruments = [
      {
        number: 1,
        state: 'sent',
        items: [{ sourceFfeItemId: 'line-1' }, { sourceFfeItemId: 'line-2' }],
      },
    ];
    renderProject();
    expect(head()).toHaveTextContent('2 selections are with the client for purchasing approval.');
    expect(leads()).toHaveLength(0);
    expect(head().querySelector('[data-action-key="bill-project-ffe"]')).toBeNull();
    expect(head().querySelector('[data-action-key="work-the-pieces"]')).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
  });

  it('held: a release held by its prerequisite elects no lead and keeps its reason', () => {
    mockAuthority = { data: null };
    renderProject();
    expect(head()).toHaveTextContent('Purchasing authorization is held.');
    expect(leads()).toHaveLength(0);
    const release = screen.getByRole('button', { name: 'Prepare purchasing authorization' });
    expect(release).toHaveAttribute('data-action-variant', 'secondary');
    expect(release).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('A signed agreement is required before purchasing authorization.'),
    ).toBeInTheDocument();
  });

  it('keeps the quiet tools in order behind whichever lead stands', () => {
    renderProject();
    const keys = Array.from(head().querySelectorAll('[data-action-key]'))
      .map((el) => el.getAttribute('data-action-key'))
      .filter((key) => key !== 'ffe-fold');
    expect(keys).toEqual([
      'release-for-authorization',
      'work-the-pieces',
      'open-add-to-project',
      'ffe-more',
    ]);
    expect(screen.getByRole('link', { name: /Edit pieces & purchasing/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add items' })).toBeInTheDocument();
  });
});

describe('US-43 F-C — the head’s spec lead and its More (SQ-1506 F2, F7, F8)', () => {
  const placeholder = (over: Record<string, unknown> = {}) =>
    priced({
      id: 'line-placeholder',
      name: 'Dining chairs',
      product_id: null,
      unit_price_cents: null,
      line_total_cents: null,
      ...over,
    });
  /** Both priced lines are with the client, so nothing above the spec rung stands. */
  const withTheClient = () => {
    mockInstruments = [
      { number: 1, state: 'sent', items: [{ sourceFfeItemId: 'line-1' }, { sourceFfeItemId: 'line-2' }] },
    ];
  };

  it('F2: collapsed More exposes none of its acts, and opening it does', () => {
    renderProject();
    const more = screen.getByRole('button', { name: /^More/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Record a selection change', hidden: true }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open specification book', hidden: true })).toBeNull();
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Record a selection change' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open specification book' })).toBeInTheDocument();
  });

  it('F7: a custom vendor line before a genuine placeholder — the spec lead lands on the placeholder', async () => {
    withTheClient();
    mockItems = [
      priced(),
      priced({ id: 'line-2', name: 'Linen headboard' }),
      priced({
        id: 'line-custom',
        name: 'Custom banquette',
        product_id: null,
        vendor_name: 'Hollis Millwork',
        unit_price_cents: null,
        line_total_cents: null,
      }),
      placeholder(),
    ];
    renderProject();
    expect(leads()).toHaveLength(1);
    const lead = leads()[0];
    expect(lead).toHaveAttribute('data-action-key', 'ffe-lead-spec');
    expect(lead).toHaveTextContent('Fill the 1 placeholder');
    fireEvent.click(lead);
    await waitFor(() =>
      expect(document.getElementById('ffe-selection-line-placeholder')).toContainElement(
        document.activeElement as HTMLElement,
      ),
    );
    expect(document.getElementById('ffe-selection-line-custom')).not.toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it.each([['superseded'], ['not_selected']])(
    'F8: a %s placeholder elects no spec lead',
    (disposition) => {
      withTheClient();
      mockItems = [
        priced(),
        priced({ id: 'line-2', name: 'Linen headboard' }),
        placeholder({ design_disposition: disposition }),
      ];
      renderProject();
      expect(head().querySelector('[data-action-key="ffe-lead-spec"]')).toBeNull();
      expect(head()).toHaveTextContent(
        '2 selections are with the client for purchasing approval.',
      );
      expect(leads()).toHaveLength(0);
    },
  );
});

describe('US-43 R4 — rooms on the FF&E overview', () => {
  const roomToggle = (name: string) => screen.getByRole('button', { name });

  it('opens a single-room job’s room by default, with its acts inside', () => {
    renderProject();
    const bed = roomToggle('Bed');
    expect(bed).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(bed.getAttribute('aria-controls')!)!;
    expect(body).toHaveTextContent('Walnut bed, king');
    expect(body.querySelector('[data-action-key="open-add-schedule-line"]')).toHaveTextContent(
      'Add room selection',
    );
  });

  it('leaves every room closed when the job has more than one', () => {
    mockRooms = [...mockRooms, { id: 'room-2', name: 'Living', budget_cents: 0 }];
    mockItems = [
      priced(),
      priced({ id: 'line-2', name: 'Sofa', project_room_id: 'room-2', room: { id: 'room-2', name: 'Living' } }),
    ];
    renderProject();
    expect(roomToggle('Bed')).toHaveAttribute('aria-expanded', 'false');
    expect(roomToggle('Living')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Walnut bed, king')).not.toBeInTheDocument();
  });
});
