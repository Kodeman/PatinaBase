import { fireEvent, render, screen, within } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockCanSeeMargin: boolean | undefined = true;
const mockCanSeeMarginArg = jest.fn();

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
  useProjectFfeReadiness: () => ({ data: [], isLoading: false, isError: false }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  useRecordFfeInstalled: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectV2: () => ({ data: { id: 'project-1', studio_id: 'studio-1' } }),
  useCanSeeStudioMargin: (org: string | null) => {
    mockCanSeeMarginArg(org);
    return { data: mockCanSeeMargin };
  },
}));

jest.mock('../../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [{ id: 'room-living', name: 'Living room', budget_cents: 0 }] }),
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

jest.mock('../../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
jest.mock('../../rooms/concept-render-upload', () => ({ ConceptRenderUpload: () => null }));
jest.mock('../../line-unfold', () => ({
  LineUnfold: ({ item }: { item: { name: string } }) => (
    <div data-testid="line-unfold">{item.name} unfolded</div>
  ),
}));

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

import { FFESection } from '../../ffe-section';
import { __setDensityForTest } from '@/hooks/use-lens-density';

// With no lens attached a stop renders quiet; these claims are about the full body.
beforeEach(() => {
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

const base = {
  quantity: 1,
  blocked: false,
  item_type: 'fixed',
  project_room_id: 'room-living',
  room: { id: 'room-living', name: 'Living room' },
  received_quantity: null,
  vendor_id: null,
  vendor_name: null,
  purchase_order_id: null,
  purchase_order: null,
};

const ITEMS = [
  {
    ...base,
    id: 'sofa',
    name: 'Sofa',
    status: 'production',
    vendor_id: 'v-hale',
    vendor_name: 'Hale Upholstery',
    trade_price_cents: 648_000,
    unit_price_cents: 972_000,
    line_total_cents: 972_000,
    purchase_order_id: 'po-1042',
    purchase_order: {
      id: 'po-1042',
      vendor_id: 'v-hale',
      po_number: 'PO-1042',
      status: 'in_production',
      sent_at: '2026-10-03',
      acknowledged_at: '2026-10-04',
      confirmed_eta: '2026-11-14',
    },
  },
  {
    ...base,
    id: 'rug',
    name: 'Wool rug',
    status: 'approved',
    vendor_id: 'v-ardent',
    vendor_name: 'Ardent Rug',
    trade_price_cents: 435_000,
    unit_price_cents: 400_000,
    line_total_cents: 400_000,
  },
  {
    ...base,
    id: 'chairs',
    name: 'Reading chairs',
    status: 'delivered',
    quantity: 2,
    unit_price_cents: 120_000,
    line_total_cents: 240_000,
  },
];

const renderProject = () =>
  render(<FFESection projectId="project-1" projectName="Kochaver" mode="project" />);

const makerButton = () => screen.getByRole('button', { name: 'Read by maker' });

describe('FF&E section · read by maker (C-15)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockItems = ITEMS;
    mockCanSeeMargin = true;
    mockCanSeeMarginArg.mockClear();
  });

  it('opens read by room and turns to read by maker from the lens', () => {
    renderProject();
    expect(screen.getByRole('button', { name: 'Read by room' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('table', { name: /read by maker/i })).toBeNull();

    fireEvent.click(makerButton());

    expect(makerButton()).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', { name: /read by maker/i });
    const heads = within(table).getAllByRole('rowheader').map((h) => h.textContent);
    expect(heads).toEqual(['Hale Upholstery', 'Ardent Rug', 'No maker yet · 1']);
    expect(
      screen.getByText('Two makers · $10,830 trade · one line needs a maker'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'PO-1042 · sent 3 October · acknowledged · in production · arrives ~14 November',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Not yet ordered')).toBeInTheDocument();
  });

  it('shows trade cost, and client price with markup when the studio lets this seat see margin', () => {
    renderProject();
    fireEvent.click(makerButton());
    expect(mockCanSeeMarginArg).toHaveBeenCalledWith('studio-1');
    const table = screen.getByRole('table', { name: /read by maker/i });
    const cols = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(cols).toEqual(['Line', 'Qty', 'Trade cost', 'Client price', 'Markup', 'State']);

    const rug = within(table).getByRole('button', { name: 'Wool rug' }).closest('tr')!;
    const cells = within(rug).getAllByRole('cell').map((c) => c.textContent);
    // R5: client price under trade reads as a plain negative markup.
    expect(cells.slice(1)).toEqual(['1', '$4,350', '$4,000', '−8%', 'Approved']);
  });

  it('keeps client price and markup away when the seat cannot see margin', () => {
    mockCanSeeMargin = false;
    renderProject();
    fireEvent.click(makerButton());
    const table = screen.getByRole('table', { name: /read by maker/i });
    const cols = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(cols).toEqual(['Line', 'Qty', 'Trade cost', 'State']);
    expect(within(table).queryByText('$9,720')).toBeNull();
    expect(within(table).getByText('$6,480')).toBeInTheDocument();
  });

  it('unfolds a line in place', () => {
    renderProject();
    fireEvent.click(makerButton());
    const sofa = screen.getByRole('button', { name: 'Sofa' });
    fireEvent.click(sofa);
    expect(sofa).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('line-unfold')).toHaveTextContent('Sofa unfolded');
  });

  it('holds the room reading while choosing what is installed, and says why (P0-5 ticks keep working)', () => {
    renderProject();
    fireEvent.click(makerButton());
    fireEvent.click(screen.getByRole('button', { name: /choose what.s installed/i }));

    expect(screen.queryByRole('table', { name: /read by maker/i })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Mark Reading chairs installed' })).toBeEnabled();
    expect(makerButton()).toHaveAttribute('aria-disabled', 'true');
    expect(makerButton()).toHaveAccessibleDescription('finish choosing what’s installed first');
  });
});
