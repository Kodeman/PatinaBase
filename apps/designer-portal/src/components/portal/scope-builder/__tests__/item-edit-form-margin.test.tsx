/**
 * SQ-440 (F5, R1): the inline edit form's trade unit price beside the client
 * price is the margin. A member who may not see margin gets an empty input
 * ("Unchanged") and the save carries unit_price only when she typed one.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ItemEditForm } from '../ffe-schedule-builder';

const mockCanSeeMargin = jest.fn(() => false);
jest.mock('@/hooks/use-can-see-margin', () => ({
  useCanSeeMargin: () => mockCanSeeMargin(),
}));

const mockMutate = jest.fn();
jest.mock('@/hooks/use-proposals', () => ({
  useAddProposalItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateProposalItem: () => ({ mutate: mockMutate, isPending: false }),
  useRemoveProposalItem: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-spec-fields', () => ({
  useSpecFieldDefs: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-drafting-facet-invalidation', () => ({
  useDraftingFacetInvalidation: () => () => Promise.resolve(),
}));

jest.mock('@/lib/analytics', () => ({ proposalEvents: { itemAdded: jest.fn() } }));

jest.mock('@patina/supabase', () => ({
  useProposalScopeRooms: () => ({ data: [] }),
  useFFECategories: () => ({ data: [] }),
  useConsumeCapture: () => ({ mutate: jest.fn(), isPending: false }),
  useReorderProposalItems: () => ({ mutate: jest.fn() }),
  useReorderProposalScopeRooms: () => ({ mutate: jest.fn() }),
  createBrowserClient: () => ({}),
}));

// The real card and capture inbox pull ESM chains into jest.
jest.mock('@/components/portal/ffe/ffe-item-card', () => ({ FFEItemCard: () => null }));
jest.mock('@/components/portal/ffe/add-ffe-item-controls', () => ({
  AddFFEItemControls: () => null,
}));
jest.mock('@/components/portal/proposals/capture-inbox', () => ({
  CaptureInbox: () => null,
  parseCaptureDraggableId: () => null,
}));
jest.mock('@/components/portal/scope-builder/spec-fields-manager', () => ({
  SpecFieldsManager: () => null,
}));
jest.mock('@/components/portal/scope-builder/financial-lens', () => ({
  FinancialLensPanel: () => null,
}));

const ITEM = {
  id: 'item-1',
  name: 'Lounge chair',
  description: null,
  quantity: 2,
  unit_price: 120000,
  unit_sell_price: 180000,
  markup_percent: 50,
  line_total_cents: 360000,
  notes: null,
  internal_notes: null,
  category: null,
  vendor_name: null,
  position: 0,
  scope_room_id: null,
  product_id: null,
  image_url: null,
  item_type: 'fixed' as const,
  budget_min_cents: null,
  budget_max_cents: null,
  ffe_category: null,
  doc_code: null,
  lead_time_weeks: null,
  custom_fields: null,
};

function renderForm() {
  render(
    <ItemEditForm
      item={ITEM}
      proposalId="proposal-1"
      rooms={[]}
      categories={[]}
      onDone={jest.fn()}
    />,
  );
  return screen.getByPlaceholderText(/^(0|Unchanged)$/) as HTMLInputElement;
}

function savedUpdates(): Record<string, unknown> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(mockMutate).toHaveBeenCalledTimes(1);
  return mockMutate.mock.calls[0][0].updates;
}

beforeEach(() => {
  mockMutate.mockReset();
  mockCanSeeMargin.mockReturnValue(false);
});

describe('ItemEditForm · trade unit price under R1', () => {
  it('opens empty with "Unchanged" for a member who may not see margin, and saves no unit_price', () => {
    const price = renderForm();
    expect(price.value).toBe('');
    expect(price.placeholder).toBe('Unchanged');
    expect(screen.queryByDisplayValue('1200')).not.toBeInTheDocument();

    const updates = savedUpdates();
    expect(updates).not.toHaveProperty('unit_price');
    expect(updates.quantity).toBe(2);
  });

  it('still lets that member set the price, and sends what she typed', () => {
    const price = renderForm();
    fireEvent.change(price, { target: { value: '950' } });
    expect(savedUpdates().unit_price).toBe(95000);
  });

  it('pre-fills the trade price for a viewer who may see margin', () => {
    mockCanSeeMargin.mockReturnValue(true);
    const price = renderForm();
    expect(price.value).toBe('1200');
    expect(price.placeholder).toBe('0');
    fireEvent.change(price, { target: { value: '1300' } });
    expect(savedUpdates().unit_price).toBe(130000);
  });
});
