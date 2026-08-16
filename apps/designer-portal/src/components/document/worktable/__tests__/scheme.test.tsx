/**
 * The Scheme (W3a) — the loose FF&E scheme on the paper. What it must do:
 * print the proposal's lines through the Drafting Room's own builder; lead an
 * empty scheme with a scored-ink "Add a line" that opens the builder's own add
 * flow in place (never a route away); lift — never hide — a lensed room's
 * lines; and gate no interactive tool behind a width class (doctrine A4).
 *
 * The builder renders REAL here (the lift and the empty lead live inside it);
 * only its data hooks and heavy neighbors are mocked, following
 * drafting-room.test.tsx's pattern.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Scheme } from '../scheme';

const openProductSpy = jest.fn();

let mockItems: any[] = [];
const mockRooms = [
  { id: 'room-living', name: 'Living Room', ffe_categories: null },
  { id: 'room-study', name: 'The Study', ffe_categories: null },
];

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { itemAdded: jest.fn() },
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@patina/supabase', () => ({
  useProposalScopeRooms: () => ({ data: mockRooms }),
  useFFECategories: () => ({ data: [] }),
  useConsumeCapture: () => ({ mutate: jest.fn(), isPending: false }),
  useReorderProposalItems: () => ({ mutate: jest.fn() }),
  useReorderProposalScopeRooms: () => ({ mutate: jest.fn() }),
  useIsStudioOwner: () => ({ isStudioOwner: false }),
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: mockItems, error: null }),
        }),
      }),
    }),
  }),
}));

jest.mock('@/hooks/use-proposals', () => ({
  useAddProposalItem: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useUpdateProposalItem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useRemoveProposalItem: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

jest.mock('@/hooks/use-spec-fields', () => ({
  useSpecFieldDefs: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-drafting-facet-invalidation', () => ({
  useDraftingFacetInvalidation: () => () => Promise.resolve(),
}));

jest.mock('@/components/portal/proposals/capture-inbox', () => ({
  CaptureInbox: () => <div data-testid="capture-inbox" />,
  parseCaptureDraggableId: () => null,
}));

jest.mock('@/components/portal/ffe/add-ffe-item-controls', () => {
  const React = require('react');
  return {
    AddFFEItemControls: React.forwardRef(function MockAddControls(
      _props: unknown,
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        openProduct: openProductSpy,
        openAllowance: jest.fn(),
        openTbd: jest.fn(),
      }));
      return <div data-testid="add-controls" />;
    }),
  };
});

// The real card pulls @patina/help-system's ESM chain into jest — mocked here
// exactly as ffe-schedule-builder.test.tsx does, but keeping name + unfold act.
jest.mock('@/components/portal/ffe/ffe-item-card', () => ({
  FFEItemCard: ({
    name,
    onOpenDetail,
    actions,
  }: {
    name: string;
    onOpenDetail?: () => void;
    actions?: React.ReactNode;
  }) => (
    <div data-line-name={name}>
      {onOpenDetail ? (
        <button type="button" onClick={onOpenDetail}>
          {name}
        </button>
      ) : (
        <span>{name}</span>
      )}
      {actions}
    </div>
  ),
}));

jest.mock('@/components/portal/scope-builder/spec-fields-manager', () => ({
  SpecFieldsManager: () => null,
}));

jest.mock('@/components/portal/scope-builder/financial-lens', () => ({
  FinancialLensPanel: () => null,
}));

jest.mock(
  '@/components/document/rooms/drafting/schedule-line-unfold',
  () => ({
    ScheduleLineUnfold: () => <div data-testid="line-unfold" />,
  }),
);

function line(
  id: string,
  name: string,
  scopeRoomId: string | null,
  position: number,
) {
  return {
    id,
    name,
    description: null,
    quantity: 1,
    unit_price: 100000,
    unit_sell_price: 100000,
    markup_percent: null,
    line_total_cents: 100000,
    notes: null,
    internal_notes: null,
    category: null,
    vendor_name: null,
    position,
    scope_room_id: scopeRoomId,
    product_id: null,
    image_url: null,
    item_type: 'fixed',
    budget_min_cents: null,
    budget_max_cents: null,
    ffe_category: null,
    doc_code: null,
    lead_time_weeks: null,
    custom_fields: null,
  };
}

const THREE_LINES = [
  line('item-lamp', 'Floor lamp', null, 0),
  line('item-sofa', 'A mohair sofa', 'room-living', 1),
  line('item-desk', 'A walnut desk', 'room-study', 2),
];

function renderScheme(props: { roomFilter?: string | null } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Scheme proposalId="proposal-1" {...props} />
    </QueryClientProvider>,
  );
}

/** True when a precedes b in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe('The Scheme', () => {
  it("prints the proposal's lines in the schedule's own order", async () => {
    mockItems = THREE_LINES;
    renderScheme();

    const sofa = await screen.findByText('A mohair sofa');
    const desk = screen.getByText('A walnut desk');
    const lamp = screen.getByText('Floor lamp');

    // Unlensed: unassigned first, then rooms in scope order.
    expect(precedes(lamp, sofa)).toBe(true);
    expect(precedes(sofa, desk)).toBe(true);
  });

  it('leads an empty scheme with a scored-ink "Add a line" acting in place', async () => {
    mockItems = [];
    renderScheme();

    const add = await screen.findByRole('button', { name: /add a line/i });

    // Scored ink (the inked leader), a button — an act in place, not a route.
    expect(add).toHaveAttribute('data-action-variant', 'inked');
    expect(add).not.toHaveAttribute('href');
    expect(add.querySelector('.da-hit')).not.toBeNull();

    // The lead replaces the builder's plain empty sentence.
    expect(screen.queryByText(/No items yet/)).toBeNull();

    await userEvent.click(add);

    // The press opens the builder's OWN creation flow (the add-item picker).
    await waitFor(() => expect(openProductSpy).toHaveBeenCalled());
  });

  it('lifts the lensed room to the front without hiding anything', async () => {
    mockItems = THREE_LINES;
    renderScheme({ roomFilter: 'room-study' });

    const desk = await screen.findByText('A walnut desk');
    // A LIFT, never a hide: every line is still on the paper…
    const sofa = screen.getByText('A mohair sofa');
    const lamp = screen.getByText('Floor lamp');
    // …and the lensed room's line now comes first.
    expect(precedes(desk, lamp)).toBe(true);
    expect(precedes(desk, sofa)).toBe(true);
  });

  it('composes the schedule order untouched when the lens is null', async () => {
    mockItems = THREE_LINES;
    renderScheme({ roomFilter: null });

    const sofa = await screen.findByText('A mohair sofa');
    const lamp = screen.getByText('Floor lamp');
    expect(precedes(lamp, sofa)).toBe(true);
  });

  it('gates no interactive tool behind a width class (doctrine A4)', async () => {
    mockItems = THREE_LINES;
    const { container } = renderScheme();
    await screen.findByText('A mohair sofa');

    const interactive = container.querySelectorAll(
      'button, a, input, select, textarea, [role="button"]',
    );
    expect(interactive.length).toBeGreaterThan(0);
    for (const el of Array.from(interactive)) {
      const cls = el.getAttribute('class') ?? '';
      // No display:none of functionality at any width.
      expect(cls).not.toMatch(/(^|\s)hidden(\s|$)/);
      // No ≥1440 (or any 1440-keyed) gating on a table tool.
      expect(cls).not.toMatch(/1440/);
    }
  });
});
