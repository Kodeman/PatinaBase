/**
 * US-21 T-7a (F1): a Pieces row prints `Not priced` where `priceWord` calls
 * the line unpriced (a $0 line with no product that is not an allowance),
 * never `$0`. A priced line prints its money; an allowance prints its
 * allowance.
 */
import { render, screen } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];

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

// C-34: the install manifest reads its own hooks; this suite is about the table.
jest.mock('@/components/document/buying/install-manifest', () => ({ InstallManifest: () => null }));

jest.mock('@patina/supabase', () => ({
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: mockItems, isLoading: false, isError: false, refetch: jest.fn() }),
  useProjectFfeReadiness: () => ({
    data: mockItems.map((item) => ({ selectionId: item.id, ready: true, missingFields: [] })),
  }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
}));

jest.mock('../schedule/add-to-project-sheet', () => ({
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

jest.mock('../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../line-unfold', () => ({ LineUnfold: () => null }));

// R127/W4 — this suite mounts a region on its own, with no page to attach the
// lens (OD-15 attaches `useLensDensity` in `page.tsx`), so nothing ever
// promotes and every stop would render its quiet form: a head, a count line
// and one leader, with the body these cases are about absent. The mock is the
// lens saying `full`, which is what a reader who has reached this region sees.
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

import { FFESection } from '../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

const renderSection = (mode: 'project' | 'install' = 'project') =>
  render(<FFESection projectId="project-1" projectName="Ellsworth" mode={mode} />);

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

const line = (over: Record<string, unknown>) => ({
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  product_id: null,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
  ...over,
});

const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('T-7a — the Pieces row prints Not priced, never $0', () => {
  beforeEach(() => {
    mockItems = [
      line({
        id: 'rough',
        name: 'Rough banquette',
        unit_price_cents: 0,
        line_total_cents: 0,
      }),
      line({
        id: 'priced',
        name: 'Walnut bed',
        product_id: 'p-1',
        unit_price_cents: 1_230_000,
        line_total_cents: 1_230_000,
      }),
      line({
        id: 'allowance',
        name: 'Dining chairs allowance',
        item_type: 'allowance',
        unit_price_cents: 0,
        line_total_cents: 0,
        budget_max_cents: 480_000,
      }),
    ];
  });

  it('prints Not priced on a $0 line with no product that is not an allowance', () => {
    renderSection();
    const row = rowOf('Rough banquette');
    expect(row).toHaveTextContent('Not priced');
    expect(row).not.toHaveTextContent('$0');
  });

  it('prints a priced line’s money', () => {
    renderSection();
    const row = rowOf('Walnut bed');
    expect(row).toHaveTextContent('$12,300');
    expect(row).not.toHaveTextContent('Not priced');
  });

  it('prints an allowance’s allowance, not Not priced or $0', () => {
    renderSection();
    const row = rowOf('Dining chairs allowance');
    expect(row).toHaveTextContent('$4,800');
    expect(row).not.toHaveTextContent('Not priced');
    expect(row).not.toHaveTextContent(/\$0(?![\d,])/);
  });
});
