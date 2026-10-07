import { fireEvent, render, screen, within } from '@testing-library/react';

let mockItems: Record<string, unknown>[] = [];
let mockExceptions: Record<string, unknown>[] = [];

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
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
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
  useCanSeeStudioMargin: () => ({ data: true }),
  useUnresolvedProcurementExceptions: () => ({ data: mockExceptions }),
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
  design_disposition: 'selected',
  project_room_id: 'room-living',
  room: { id: 'room-living', name: 'Living room' },
  received_quantity: null,
  vendor_id: null,
  vendor_name: null,
  purchase_order_id: null,
  purchase_order: null,
};

const ITEMS: Record<string, unknown>[] = [
  {
    ...base,
    id: 'sofa',
    name: 'Sofa',
    status: 'production',
    vendor_id: 'v-hale',
    vendor_name: 'Hale Upholstery',
    unit_price_cents: 972_000,
    purchase_order_id: 'po-1042',
    purchase_order: {
      id: 'po-1042',
      vendor_id: 'v-hale',
      po_number: 'PO-1042',
      status: 'in_production',
      sent_at: '2026-10-03',
      acknowledged_at: '2026-10-04',
    },
  },
  {
    ...base,
    id: 'rug',
    name: 'Wool rug',
    status: 'approved',
    vendor_id: 'v-ardent',
    vendor_name: 'Ardent Rug',
    unit_price_cents: 400_000,
  },
  {
    ...base,
    id: 'chairs',
    name: 'Reading chairs',
    status: 'approved',
    quantity: 2,
    unit_price_cents: 120_000,
  },
  {
    ...base,
    id: 'lamp',
    name: 'Floor lamp',
    status: 'approved',
    vendor_id: 'v-visual',
    vendor_name: 'Visual Comfort',
  },
];

const section = <FFESection projectId="project-1" projectName="Kochaver" mode="project" />;
const nextActButton = () => screen.getByRole('button', { name: 'Read by next act' });
const groupHeads = () =>
  Array.from(document.querySelectorAll('[data-next-act-group]')).map((tr) => tr.textContent);

describe('FF&E section · read by next act (C-33)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockItems = ITEMS;
    mockExceptions = [];
  });

  it('offers next act as the third reading and groups the lines by what each waits on', () => {
    render(section);
    expect(
      screen.getAllByRole('button', { name: /^Read by / }).map((b) => b.textContent),
    ).toEqual(['room', 'maker', 'next act']);

    fireEvent.click(nextActButton());

    expect(nextActButton()).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', { name: /read by next act/i });
    // Empty groups (To send, Shipped, Installed …) print nothing.
    expect(groupHeads()).toEqual([
      'Needs a maker · 1',
      'Needs a client price · 1',
      'Ready to order · 1',
      'In production · 1',
    ]);
    const cols = within(table.querySelector('thead')!)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(cols).toEqual(['Line', 'Qty', 'Maker', 'State']);
    const rug = within(table).getByRole('button', { name: 'Wool rug' }).closest('tr')!;
    expect(within(rug).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Wool rugLiving room',
      '1',
      'Ardent Rug',
      'Approved',
    ]);
  });

  it('prints no group head at all for a group with no line', () => {
    mockItems = [ITEMS[1]];
    render(section);
    fireEvent.click(nextActButton());
    expect(groupHeads()).toEqual(['Ready to order · 1']);
    expect(screen.queryByText(/Needs a maker/)).toBeNull();
  });

  it('unfolds a line in place', () => {
    render(section);
    fireEvent.click(nextActButton());
    const sofa = screen.getByRole('button', { name: 'Sofa' });
    fireEvent.click(sofa);
    expect(sofa).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('line-unfold')).toHaveTextContent('Sofa unfolded');
  });

  it('keeps the open unfold mounted when its line moves to another group', () => {
    const { rerender } = render(section);
    fireEvent.click(nextActButton());
    fireEvent.click(screen.getByRole('button', { name: 'Wool rug' }));
    const unfold = screen.getByTestId('line-unfold');

    // The rug is ordered: it leaves "Ready to order" for "To send".
    mockItems = ITEMS.map((item) =>
      item.id === 'rug'
        ? {
            ...item,
            purchase_order_id: 'po-9',
            purchase_order: {
              id: 'po-9',
              vendor_id: 'v-ardent',
              po_number: 'PO-9',
              status: 'draft',
              sent_at: null,
            },
          }
        : item,
    );
    rerender(<FFESection projectId="project-1" projectName="Kochaver" mode="project" />);

    expect(groupHeads()).toContain('To send · 1');
    expect(groupHeads()).not.toContain('Ready to order · 1');
    expect(screen.getByTestId('line-unfold')).toBe(unfold);
  });

  it('holds the room reading while choosing what is installed', () => {
    mockItems = [...ITEMS, { ...base, id: 'bench', name: 'Bench', status: 'delivered' }];
    render(section);
    fireEvent.click(nextActButton());
    fireEvent.click(screen.getByRole('button', { name: /choose what.s installed/i }));
    expect(screen.queryByRole('table', { name: /read by next act/i })).toBeNull();
    expect(nextActButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('groups a shipped and damaged row under Claim open, not Shipped (T4 G6)', () => {
    mockItems = [
      {
        ...base,
        id: 'console',
        name: 'Console table',
        status: 'shipped',
        vendor_id: 'v-hale',
        vendor_name: 'Hale Upholstery',
        purchase_order_id: 'po-1042',
        purchase_order: {
          id: 'po-1042',
          vendor_id: 'v-hale',
          po_number: 'PO-1042',
          status: 'shipped',
          sent_at: '2026-10-03',
          acknowledged_at: '2026-10-04',
        },
      },
    ];
    mockExceptions = [
      {
        id: 'exc-1',
        status: 'open',
        type: 'damage',
        ffe_item_id: 'console',
        purchase_order_id: 'po-1042',
      },
    ];
    render(section);
    fireEvent.click(nextActButton());
    expect(groupHeads()).toEqual(['Claim open · 1']);
    expect(groupHeads()).not.toContain('Shipped · 1');
  });
});

