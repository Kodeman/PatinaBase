/**
 * US-19 FR1 (design-review-1 §3) — the Install head and its rows:
 *   F13 / R12 — the leading state word is the row's only stamp; the
 *               procurement status joins the detail line as text.
 *   F15 / R32 — the reading's act is the head's only scored act; `Bill N
 *               uninvoiced` is plain.
 *   R40       — on an all-here Install spread the task block is named
 *               `The punch list`, so `Open the punch list` lands on its name.
 */
import { render, screen, within } from '@testing-library/react';

let mockAskThePaper = true;
let mockItems: Record<string, unknown>[] = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'ask-the-paper' ? mockAskThePaper : false,
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

jest.mock('@/components/document/buying/install-manifest', () => ({
  InstallManifest: () => null,
}));

// The reading's own act, as the Install head's leader prints it (inked).
jest.mock('@/components/document/overlays/ask-maker-sheet', () => ({
  InstallReadingLine: () => (
    <button
      type="button"
      data-action-key="install-reading-act"
      data-action-variant="inked"
      className="da-inked"
    >
      Ask the maker for a date
    </button>
  ),
}));

jest.mock('@patina/supabase', () => ({
  useProcurementDrafts: () => ({ data: [] }),
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
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('@/components/document/schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: [] }),
  useTradeScopes: () => ({ data: [], isPending: false }),
  useProjectBillingAuthority: () => ({ data: null }),
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

jest.mock('@/components/document/accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
// The block's own heading is proven in work-block-punch-photo.test.tsx; here
// only the name the region hands it is read.
jest.mock('@/components/document/work-block', () => ({
  WorkBlock: ({ heading }: { heading?: string }) => (
    <div data-testid="work-block" data-heading={heading ?? ''} />
  ),
}));
jest.mock('@/components/document/folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/components/document/strata-mark', () => ({ StrataMark: () => null }));
jest.mock('@/components/document/strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('@/components/document/line-unfold', () => ({ LineUnfold: () => null }));

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

import { FFESection } from '@/components/document/ffe-section';

/** Cedar Lane's chair: in production, not here. */
const chair = {
  id: 'line-chair',
  name: 'Reading chair',
  quantity: 1,
  status: 'production',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 310_000,
  line_total_cents: 310_000,
  project_room_id: 'room-study',
  room: { id: 'room-study', name: 'Study' },
  received_quantity: null,
  vendor_name: 'Fixture Metalworks',
  purchase_order: { id: 'po-1', po_number: 'FM-2026-014', status: 'confirmed' },
};

const renderInstall = () =>
  render(
    <FFESection
      projectId="project-1"
      projectName="Cedar Lane"
      mode="install"
      sectionKey="install"
    />,
  );

beforeEach(() => {
  mockAskThePaper = true;
  mockItems = [chair];
});

describe('One stamp per Install row (F13, R12)', () => {
  it('prints the state word as the only stamp and the procurement status in the detail line', () => {
    renderInstall();
    const row = document.getElementById('ffe-selection-line-chair') as HTMLElement;

    expect(within(row).getByText('Not here')).toHaveAttribute('data-install-state', 'not-here');
    expect(
      within(row).getByText('Fixture Metalworks · Study · In production'),
    ).toBeInTheDocument();
    // No second stamp: the status prints nowhere on its own.
    expect(within(row).queryByText('In production')).not.toBeInTheDocument();
  });
});

describe('One leader on the Install head (F15, R32)', () => {
  it('Bill N uninvoiced is plain, so the reading act is the only scored act', () => {
    renderInstall();
    const section = document.getElementById('project-ffe') as HTMLElement;

    expect(
      section.querySelector('[data-action-key="bill-project-ffe"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
    expect(section.querySelectorAll('.da-inked, .da-primary')).toHaveLength(1);
    // Spec book stays a link.
    expect(screen.getByRole('link', { name: 'Spec book →' })).toBeInTheDocument();
  });
});

describe('The punch list heading (R40)', () => {
  it('names the task block The punch list when everything is here', () => {
    mockItems = [{ ...chair, status: 'delivered' }];
    renderInstall();
    expect(screen.getByTestId('work-block')).toHaveAttribute('data-heading', 'The punch list');
  });

  it('keeps the block its own name while a piece is not here', () => {
    renderInstall();
    expect(screen.getByTestId('work-block')).toHaveAttribute('data-heading', '');
  });

  it('keeps the block its own name with ask-the-paper off', () => {
    mockAskThePaper = false;
    mockItems = [{ ...chair, status: 'delivered' }];
    renderInstall();
    expect(screen.getByTestId('work-block')).toHaveAttribute('data-heading', '');
  });
});
