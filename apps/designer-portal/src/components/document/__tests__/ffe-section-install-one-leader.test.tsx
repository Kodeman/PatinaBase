/**
 * US-19 FR4 Fix 10 (`one-voice`) — Cedar's Install region has one leader: the
 * reading line's act. The title row's `Bill N uninvoiced` prints tertiary and
 * the empty states' `Add the first task` and `+ File` print secondary beside
 * it. Flag off, the region prints as it did.
 */
import { render, screen } from '@testing-library/react';

let mockOneVoice = true;
let mockItems: Record<string, unknown>[] = [];

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (flag: string) => ({
    value: flag === 'ask-the-paper' ? true : flag === 'one-voice' ? mockOneVoice : false,
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

// The reading's own act as the one-voice Install row prints it (primary, held
// when no maker is recorded); its weight is proven in ask-maker-sheet.test.tsx.
jest.mock('@/components/document/overlays/ask-maker-sheet', () => ({
  InstallReadingLine: () => (
    <button
      type="button"
      data-action-key="install-reading-act"
      data-action-variant="primary"
      className="da-primary"
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
// The empty states print the weight the region hands them; the components'
// own rendering of that weight is proven in work-block-empty-act.test.tsx and
// folio-strip.test.tsx.
jest.mock('@/components/document/work-block', () => ({
  WorkBlock: ({ emptyActVariant = 'primary' }: { emptyActVariant?: string }) => (
    <button type="button" className={`da-${emptyActVariant}`}>
      Add the first task
    </button>
  ),
}));
jest.mock('@/components/document/folio-strip', () => ({
  FolioStrip: ({ fileActVariant = 'primary' }: { fileActVariant?: string }) => (
    <button type="button" className={`da-${fileActVariant}`}>
      + File
    </button>
  ),
}));
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

/** Cedar Lane's pieces, priced and uninvoiced, one not here. */
const line = (id: string, name: string, status: string) => ({
  id,
  name,
  quantity: 1,
  status,
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 120_000,
  line_total_cents: 120_000,
  project_room_id: 'room-study',
  room: { id: 'room-study', name: 'Study' },
  received_quantity: null,
  vendor_name: null,
  purchase_order: null,
});

const renderRegion = (sectionKey: 'install' | 'care' = 'install') =>
  render(
    <FFESection
      projectId="project-1"
      projectName="Cedar Lane"
      mode="install"
      sectionKey={sectionKey}
    />,
  );

const variantOf = (name: string) => screen.getByRole('button', { name }).className;

beforeEach(() => {
  mockOneVoice = true;
  mockItems = [
    line('line-table', 'Side table', 'production'),
    line('line-shelving', 'Walnut shelving', 'delivered'),
    line('line-light', 'Brass picture light', 'ordered'),
    line('line-rug', 'Rug', 'delivered'),
  ];
});

describe('One leader in the Install region (FR4 Fix 10, one-voice)', () => {
  it("the reading line's act is the region's only primary", () => {
    renderRegion();
    const section = document.getElementById('project-ffe') as HTMLElement;
    const primaries = section.querySelectorAll('.da-primary');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveAttribute('data-action-key', 'install-reading-act');
  });

  it('the title row prints Bill N uninvoiced tertiary', () => {
    renderRegion();
    const bill = document.querySelector('[data-action-key="bill-project-ffe"]');
    expect(bill).toHaveTextContent('Bill 4 uninvoiced');
    expect(bill).toHaveAttribute('data-action-variant', 'tertiary');
  });

  it('the empty states print Add the first task and + File secondary', () => {
    renderRegion();
    expect(variantOf('Add the first task')).toBe('da-secondary');
    expect(variantOf('+ File')).toBe('da-secondary');
  });

  it('Record a change stays secondary beside the leader', () => {
    renderRegion();
    expect(
      document.querySelector('[data-action-key="record-a-change-install-head"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
  });
});

describe('Flag off, the Install region prints as it did', () => {
  it('Bill stays secondary and the empty states stay primary', () => {
    mockOneVoice = false;
    renderRegion();
    expect(
      document.querySelector('[data-action-key="bill-project-ffe"]'),
    ).toHaveAttribute('data-action-variant', 'secondary');
    expect(variantOf('Add the first task')).toBe('da-primary');
    expect(variantOf('+ File')).toBe('da-primary');
  });
});
