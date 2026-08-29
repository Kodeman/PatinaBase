/**
 * The Life Review, FF&E lines (artifacts/document-life-directions-2026-08-28
 * /mock/final/FINAL.md §1-§2): a 48px thumbnail (or a rail-stock slot) at the
 * start of each line, the hover wash toned to the line's own state, and the
 * stamp rendered `variant="filled"` with the mapped tone. Mirrors the mock
 * pattern in ffe-section-spec-details-link.test.tsx.
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

jest.mock('@patina/supabase', () => ({
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
jest.mock('../mobile/mobile-margin-chips', () => ({
  MobileMarginChips: () => null,
}));
jest.mock('../work-block', () => ({ WorkBlock: () => null }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../strata-mini-rule', () => ({ StrataMiniRule: () => null }));
// LineUnfold itself is out of this lane's ownership; stubbed so the test
// exercises only what ffe-section.tsx renders around it.
jest.mock('../line-unfold', () => ({ LineUnfold: () => null }));

// Lane 1 (`stamp.tsx`, sibling branch `document-life/stamp`) owns the real
// `variant`/`tone` props. Capture what ffe-section.tsx passes through the
// typed-cast wrapper so this lane's contract is verified independent of
// whether Lane 1 has merged yet.
const stampCalls: Array<{ label: string; color: string; ink?: string; variant?: string; tone?: string }> = [];
jest.mock('../stamp', () => ({
  Stamp: (props: { label: string; color: string; ink?: string; variant?: string; tone?: string }) => {
    stampCalls.push(props);
    return (
      <span data-testid="stamp" data-variant={props.variant} data-tone={props.tone}>
        {props.label}
      </span>
    );
  },
}));

import { FFESection } from '../ffe-section';

const renderSection = (highlightId?: string | null) =>
  render(
    <FFESection projectId="project-1" projectName="Ellsworth" mode="project" highlightId={highlightId} />,
  );

const baseFurnishing = {
  id: 'line-1',
  name: 'Walnut bed, king',
  quantity: 1,
  status: 'ordered',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 1_230_000,
  line_total_cents: 1_230_000,
  project_room_id: 'room-1',
  room: { id: 'room-1', name: 'Primary bedroom' },
  received_quantity: null,
};

beforeEach(() => {
  stampCalls.length = 0;
});

describe('FF&E thumbnails', () => {
  it('renders a 48px product image when the joined product has one', () => {
    mockItems = [
      { ...baseFurnishing, product: { id: 'p1', name: 'Bed', images: ['https://cdn.patina.cloud/bed.jpg'], brand: 'Sturdy Oak' } },
    ];
    renderSection();
    const found = document.querySelector('img');
    expect(found).toBeTruthy();
    expect(found).toHaveAttribute('src', 'https://cdn.patina.cloud/bed.jpg');
    expect(found).toHaveAttribute('alt', '');
    expect(found).toHaveAttribute('loading', 'lazy');
    expect(found?.className).toContain('object-cover');
  });

  it('renders a rail-stock slot with no image when the line has no product image', () => {
    mockItems = [{ ...baseFurnishing, product: null }];
    renderSection();
    expect(document.querySelector('img')).not.toBeInTheDocument();
    const slot = document.querySelector('[aria-hidden="true"].bg-\\[var\\(--doc-rail-stock\\)\\]');
    expect(slot).toBeTruthy();
  });

  it('treats an empty images array the same as no product', () => {
    mockItems = [{ ...baseFurnishing, product: { id: 'p1', name: 'Bed', images: [], brand: 'Sturdy Oak' } }];
    renderSection();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });
});

describe('FF&E hover wash', () => {
  it('wears has-wash + a clay row-wash for an ordinary (ordered) line', () => {
    mockItems = [{ ...baseFurnishing, status: 'ordered' }];
    renderSection();
    const li = document.querySelector('li.has-wash');
    expect(li).toBeTruthy();
    const wash = li?.querySelector(':scope > .row-wash');
    expect(wash).toBeTruthy();
    expect((wash as HTMLElement).style.getPropertyValue('--wash')).toBe('var(--wash-clay)');
  });

  it('wears a golden row-wash for a decision-due line', () => {
    mockItems = [
      {
        ...baseFurnishing,
        status: 'specified',
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-09-01' },
      },
    ];
    renderSection();
    const wash = document.querySelector('.row-wash') as HTMLElement | null;
    expect(wash).toBeTruthy();
    expect(wash?.style.getPropertyValue('--wash')).toBe('var(--wash-golden)');
  });

  it('wears a terracotta row-wash for a damaged/claim line', () => {
    mockItems = [
      { ...baseFurnishing, status: 'delivered', item_claims: [{ state: 'drafted' }] },
    ];
    renderSection();
    const wash = document.querySelector('.row-wash') as HTMLElement | null;
    expect(wash).toBeTruthy();
    expect(wash?.style.getPropertyValue('--wash')).toBe('var(--wash-terracotta)');
  });
});

describe('FF&E line fill classes', () => {
  it('drops the old decision-due 5% fill and the old hover class', () => {
    mockItems = [
      {
        ...baseFurnishing,
        status: 'specified',
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-09-01' },
      },
    ];
    renderSection();
    const row = screen.getByRole('button', { name: /Walnut bed, king/ });
    expect(row.className).not.toContain('rgba(232,197,71,0.05)');
    expect(row.className).not.toContain('hover:bg-[rgba(196,165,123,0.04)]');
  });

  it('keeps the anchored-highlight fill for the highlighted line', () => {
    mockItems = [{ ...baseFurnishing }];
    renderSection('line-1');
    const row = screen.getByRole('button', { name: /Walnut bed, king/ });
    expect(row.className).toContain('bg-[rgba(196,165,123,0.08)]');
  });
});

describe('FF&E region rule', () => {
  it('opens Pieces on the double rule, the one strong rule the mockup draws', () => {
    mockItems = [{ ...baseFurnishing }];
    renderSection();
    const rule = document.querySelector('[data-rule-weight]');
    expect(rule).toHaveAttribute('data-rule-weight', 'strong');
    expect(rule).toHaveClass('doc-rule-strong');
  });
});

describe('FF&E stamp — filled variant + tone', () => {
  it.each(['ordered', 'production', 'shipped'])(
    'maps a %s line to tone="ordered" — money committed, goods still coming',
    (status) => {
      mockItems = [{ ...baseFurnishing, status }];
      renderSection();
      expect(stampCalls).toHaveLength(1);
      expect(stampCalls[0].variant).toBe('filled');
      expect(stampCalls[0].tone).toBe('ordered');
    },
  );

  it.each([
    ['delivered', { status: 'delivered' }],
    ['installed', { status: 'installed' }],
    ['received', { status: 'delivered', quantity: 1, received_quantity: 1 }],
  ])('maps a %s line to tone="delivered" — arrived, not on order', (_name, patch) => {
    // S5: these three used to wear ORDERED's clay plate, so a designer
    // scanning Pieces for what was still on order read arrived goods as
    // outstanding. Sage is their own pigment now.
    mockItems = [{ ...baseFurnishing, ...(patch as Record<string, unknown>) }];
    renderSection();
    expect(stampCalls).toHaveLength(1);
    expect(stampCalls[0].variant).toBe('filled');
    expect(stampCalls[0].tone).toBe('delivered');
  });

  it.each(['specified', 'quoted', 'approved'])(
    'leaves a %s line on the OUTLINE — a fill it has no ruled recipe for is not invented',
    (status) => {
      mockItems = [{ ...baseFurnishing, status }];
      renderSection();
      expect(stampCalls).toHaveLength(1);
      expect(stampCalls[0].variant).toBeUndefined();
      expect(stampCalls[0].tone).toBeUndefined();
    },
  );

  it('maps a decision-due line to tone="decision"', () => {
    mockItems = [
      {
        ...baseFurnishing,
        status: 'specified',
        blocked: true,
        blocking_decision: { status: 'pending', due_date: '2026-09-01' },
      },
    ];
    renderSection();
    expect(stampCalls).toHaveLength(1);
    expect(stampCalls[0].variant).toBe('filled');
    expect(stampCalls[0].tone).toBe('decision');
  });

  it('maps a damaged/claim line to tone="damaged"', () => {
    mockItems = [
      { ...baseFurnishing, status: 'delivered', item_claims: [{ state: 'drafted' }] },
    ];
    renderSection();
    expect(stampCalls).toHaveLength(1);
    expect(stampCalls[0].variant).toBe('filled');
    expect(stampCalls[0].tone).toBe('damaged');
  });

  it('still passes today\'s color/ink so the outline fallback renders if variant is ignored', () => {
    mockItems = [{ ...baseFurnishing, status: 'ordered' }];
    renderSection();
    expect(stampCalls[0].color).toBeTruthy();
  });
});
