import { fireEvent, render, screen } from '@testing-library/react';

/**
 * F58 — the paper and the spine's spec-book shelf over ONE row, at one moment.
 * Both consumers are rendered from the same fixture through the same mocked
 * fetch, so a word that drifts on either surface fails here.
 */

let mockItems: Record<string, unknown>[] = [];
let mockPlacements: Record<string, unknown>[] = [];

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
  useProjectRoomPlacements: () => ({ data: [] }),
  useProjectPalettes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
  useProjectPoCostLines: () => ({ data: [] }),
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
  }),
  useProjectRoomPlacements: () => ({ data: mockPlacements }),
  useProjectOwnedBoards: () => ({ data: [], isLoading: false }),
  useFfeInvoiceCoverage: () => ({ data: {} }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
}));

jest.mock('../../schedule/add-to-project-sheet', () => ({
  AddToProjectSheet: () => null,
  openAddToProject: jest.fn(),
}));

jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: rooms }),
  useAddDocumentRoom: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { budget: (id: string) => ['working-budget', id] },
  useProjectInstruments: () => ({ data: [] }),
  useTradeScopes: () => ({ data: [], isPending: false }),
  useProjectBillingAuthority: () => ({
    data: { state: 'active', agreementId: 'agreement-1' },
  }),
  useWorkingBudget: () => ({ isLoading: false, data: null }),
  useReleaseForAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePublishBudgetCheckpoint: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useOverrideBudgetCheckpoint: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

// Deliberately NOT the real labels: STAGE_CONFIG names the stage a line can be
// moved TO, and after F58 no stamp borrows its word. A label leaking from here
// into either surface is the regression this suite exists to catch.
jest.mock('@/components/portal/ffe/stages', () => ({
  STAGE_CONFIG: new Proxy(
    {},
    {
      get: (_target, key: string) => ({
        key,
        label: `STAGE_CONFIG:${key}`,
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

import { SpecBookLeaf } from '../spec-book-leaf';
import { FFESection } from '../../ffe-section';
import {
  deriveLineStamp,
  lineStageInputFromRow,
  lineStampLabel,
} from '@/lib/document/stamp-derivation';
import { __setDensityForTest } from '@/hooks/use-lens-density';

const rooms = [{ id: 'room-1', name: 'Living', budget_cents: 0 }];

/** The F58 line itself — one row, whichever lifecycle state it is in. */
const line = (over: Record<string, unknown> = {}) => ({
  id: 'line-1',
  name: 'Custom Walnut Sectional — 3 pc',
  quantity: 1,
  status: 'delivered',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 680_000,
  // No line total: the shelf prints the value and the money in one span, and
  // the assertions below want the word on its own.
  line_total_cents: null,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Living' },
  received_quantity: 1,
  ...over,
});

const renderLeaf = () =>
  render(<SpecBookLeaf projectId="project-1" rooms={rooms} />);

// US-21 Q14 — the paper opens on room rows; Living unfolds to its lines.
const renderPaper = () => {
  const view = render(
    <FFESection projectId="project-1" projectName="Chen" mode="project" />,
  );
  const room = view.container.querySelector<HTMLButtonElement>(
    '[data-pieces-room="room-1"] button[aria-expanded="false"]',
  );
  if (room) fireEvent.click(room);
  return view;
};

/** One row per lifecycle state, with the word the ruling gives it. */
const STATES: { state: string; row: Record<string, unknown>; word: string }[] =
  [
    {
      state: 'arrived, awaiting inspection',
      row: { status: 'delivered', received_quantity: null },
      word: 'Delivered',
    },
    {
      state: 'inspected in full',
      row: { status: 'delivered', quantity: 2, received_quantity: 2 },
      word: 'Received',
    },
    {
      state: 'inspected short',
      row: { status: 'delivered', quantity: 3, received_quantity: 1 },
      word: 'Partial',
    },
    {
      state: 'open claim',
      row: {
        status: 'delivered',
        quantity: 2,
        received_quantity: 2,
        item_claims: [{ state: 'drafted' }],
      },
      word: 'Damaged',
    },
    {
      state: 'in production',
      row: { status: 'production', received_quantity: null },
      word: 'In production',
    },
    {
      state: 'ordered',
      row: { status: 'ordered', received_quantity: null },
      word: 'Released to maker',
    },
    // US-21 D1: before an order the word is the stage (a3, a4). SPECIFIED
    // never prints.
    {
      state: 'a name with no product and no maker (a3)',
      row: { status: 'specified', received_quantity: null },
      word: 'Placeholder',
    },
    {
      state: 'a custom piece with a maker and no price (a4)',
      row: {
        status: 'specified',
        received_quantity: null,
        vendor_name: 'Hollis Millwork',
        unit_price_cents: 0,
      },
      word: 'Specced',
    },
    {
      state: 'a product, a quantity and a client price (a3)',
      row: { status: 'specified', received_quantity: null, product_id: 'product-1' },
      word: 'Ready',
    },
    {
      state: 'blocked on a pending decision',
      row: {
        status: 'specified',
        received_quantity: null,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: null },
      },
      word: 'Decision due',
    },
  ];


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

describe('F58 — one line, one word, on the paper and on the shelf', () => {
  it.each(STATES)('$state reads $word in both places', ({ row, word }) => {
    mockItems = [line(row)];

    const leaf = renderLeaf();
    expect(screen.getByText(word)).toBeInTheDocument();
    leaf.unmount();

    const paper = renderPaper();
    expect(screen.getByText(word)).toBeInTheDocument();
    paper.unmount();
  });

  it.each(STATES)(
    '$state prints exactly what the shared derivation says',
    ({ row, word }) => {
      const r = line(row);
      expect(
        lineStampLabel(
          deriveLineStamp({ ...r, stage: lineStageInputFromRow(r) } as never, null).kind,
        ),
      ).toBe(word);
    },
  );

  it('SPECIFIED never prints on either surface', () => {
    mockItems = [line({ status: 'specified', received_quantity: null })];
    const leaf = renderLeaf();
    expect(screen.queryByText('Specified')).not.toBeInTheDocument();
    leaf.unmount();
    renderPaper();
    expect(screen.queryByText('Specified')).not.toBeInTheDocument();
  });
});

describe('US-21 D1 — labor, and the placeholder count', () => {
  const piece = line({
    id: 'piece-1',
    name: 'Manila Hemp wallpaper',
    status: 'specified',
    received_quantity: null,
    product_id: 'product-1',
    vendor_id: 'vendor-1',
    quantity: 9,
    unit_price_cents: 23_000,
  });
  const install = line({
    id: 'labor-1',
    name: 'Install, wallpaper hanger',
    status: 'specified',
    received_quantity: null,
    vendor_id: 'vendor-2',
    quantity: 9,
    unit_price_cents: 8_500,
    line_kind: 'labor',
    link_kind: 'labor',
    parent_ffe_item_id: 'piece-1',
  });

  it('a labor line reads LABOR beside its stage word, ready with its ready piece', () => {
    mockItems = [piece, install];
    const leaf = renderLeaf();
    expect(screen.getByText('Labor · Ready')).toBeInTheDocument();
    leaf.unmount();

    renderPaper();
    // One LABOR stamp, beside the labor line's READY; the piece reads READY alone.
    expect(screen.getAllByText('Labor')).toHaveLength(1);
    expect(screen.getAllByText('Ready')).toHaveLength(2);
  });

  it('a labor line under a piece with no price stays specced', () => {
    mockItems = [{ ...piece, unit_price_cents: 0 }, install];
    renderLeaf();
    expect(screen.getByText('Labor · Specced')).toBeInTheDocument();
  });

  it('counts exactly the lines it stamps PLACEHOLDER — not a custom line with a maker, not a trade line', () => {
    mockItems = [
      line({ id: 'ph-1', name: 'Countertop', status: 'specified', received_quantity: null }),
      line({
        id: 'cab-1',
        name: 'Custom cabinet',
        status: 'specified',
        received_quantity: null,
        vendor_name: 'Hollis Millwork',
        unit_price_cents: 0,
      }),
      line({
        id: 'trade-1',
        name: 'Tile setting',
        status: 'specified',
        received_quantity: null,
        trade_scope_document_id: 'pcd-1',
      }),
      piece,
    ];
    renderPaper();
    expect(screen.getAllByText('Placeholder')).toHaveLength(1);
    expect(screen.getAllByText(/\b1 placeholder\b/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\b[2-9] placeholders\b/)).not.toBeInTheDocument();
  });
});

describe('the shelf leaf stopped printing the raw column', () => {
  it('never prints the enum word for a line the machine calls `delivered`', () => {
    mockItems = [line({ status: 'delivered', quantity: 2, received_quantity: 2 })];
    renderLeaf();

    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.queryByText('delivered')).not.toBeInTheDocument();
  });

  it('reads the derived vocabulary the raw column has no word for', () => {
    mockItems = [
      line({
        status: 'specified',
        received_quantity: null,
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-06-14' },
      }),
    ];
    renderLeaf();

    // The date rides the paper's stamp, never the shelf's one-line value.
    expect(screen.getByText('Decision due')).toBeInTheDocument();
  });

  it('borrows no goods word for a trade line whose scope it cannot resolve', () => {
    mockItems = [
      line({
        status: 'approved',
        received_quantity: null,
        trade_scope_document_id: 'pcd-1',
      }),
    ];
    renderLeaf();

    expect(
      screen.getByText('Custom Walnut Sectional — 3 pc'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(screen.queryByText('Engaged')).not.toBeInTheDocument();
  });

  it('takes no label from STAGE_CONFIG', () => {
    mockItems = [line({ status: 'ordered', received_quantity: null })];
    renderLeaf();

    expect(screen.getByText('Released to maker')).toBeInTheDocument();
    expect(screen.queryByText(/STAGE_CONFIG:/)).not.toBeInTheDocument();
  });
});

describe('US-21 T-32 — the unit and the also-in line on the shelf', () => {
  const fourRooms = [
    { id: 'room-hall', name: 'Hall', budget_cents: 0 },
    { id: 'room-1', name: 'Living Room', budget_cents: 0 },
    { id: 'room-dining', name: 'Dining', budget_cents: 0 },
    { id: 'room-kitchen', name: 'Kitchen', budget_cents: 0 },
  ];
  const placed = (roomId: string, quantity: number, sortOrder: number) => ({
    id: `pl-${roomId}`,
    ffeItemId: 'oak-1',
    projectRoomId: roomId,
    quantity,
    areaNote: null,
    sortOrder,
  });

  afterEach(() => {
    mockPlacements = [];
  });

  it('prints the oak floor once, in its primary room, with its unit and the others named under it', () => {
    mockItems = [
      line({
        id: 'oak-1',
        name: 'White oak floor, satin Bona finish',
        status: 'specified',
        received_quantity: null,
        quantity: 913,
        unit: 'sq_ft',
        line_total_cents: 1_049_500,
      }),
    ];
    mockPlacements = [
      placed('room-hall', 120, 0),
      placed('room-1', 320, 1),
      placed('room-dining', 210, 2),
      placed('room-kitchen', 180, 3),
    ];
    render(<SpecBookLeaf projectId="project-1" rooms={fourRooms} />);

    expect(screen.getAllByText('White oak floor, satin Bona finish')).toHaveLength(1);
    expect(
      screen.getByText('ALSO IN HALL · DINING · KITCHEN · 320 SQ FT HERE'),
    ).toBeInTheDocument();
    expect(screen.getByText(/913 sq ft · \$10,495$/)).toBeInTheDocument();
  });

  it('a line in one room and counted in each prints exactly as before', () => {
    mockItems = [line({ status: 'ordered', received_quantity: null, line_total_cents: 680_000 })];
    mockPlacements = [{ ...placed('room-1', 1, 0), ffeItemId: 'line-1' }];
    renderLeaf();

    expect(screen.queryByText(/ALSO IN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ each/)).not.toBeInTheDocument();
    expect(screen.getByText(/Released to maker/).textContent).toBe(
      'Released to maker$6,800',
    );
  });
});
