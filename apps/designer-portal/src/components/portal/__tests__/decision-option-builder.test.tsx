import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

// A variant piece the library tab can offer, so the picker's configure step
// (P0-2) can be walked end to end from inside the builder.
let mockLayerRows: Array<Record<string, unknown>> = [];

const mockDefinition = {
  productId: 'bed-1',
  productName: 'Ledge Bed',
  mode: 'variant',
  pricingStrategy: 'base_plus_adjustments',
  revision: 2,
  optionGroups: [
    {
      id: 'group-size',
      productId: 'bed-1',
      code: 'size',
      name: 'Size',
      description: null,
      selectionType: 'single',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      position: 0,
      values: [
        {
          id: 'value-king',
          groupId: 'group-size',
          code: 'king',
          label: 'King',
          description: null,
          swatch: null,
          media: [],
          retailPriceDeltaCents: 40000,
          tradePriceDeltaCents: 24000,
          leadTimeDeltaWeeks: 2,
          metadata: {},
          position: 0,
          isActive: true,
        },
      ],
    },
  ],
  variants: [
    {
      id: 'variant-king',
      productId: 'bed-1',
      code: 'king',
      name: 'Ledge Bed · King',
      sku: 'BED-K',
      vendorSku: null,
      status: 'active',
      retailPriceCents: 440000,
      tradePriceCents: 264000,
      leadTimeWeeks: 12,
      dimensions: null,
      weight: null,
      metadata: {},
      isDefault: false,
      optionValueIds: ['value-king'],
    },
  ],
  components: [],
  rules: [],
};

const mockSelectionSnapshot = [
  {
    optionGroupId: 'group-size',
    optionValueId: 'value-king',
    groupCode: 'size',
    valueCode: 'king',
    groupName: 'Size',
    valueLabel: 'King',
    retailPriceDeltaCents: 40000,
    tradePriceDeltaCents: 24000,
    leadTimeDeltaWeeks: 2,
    allowsCom: false,
  },
];

// The builder renders a ProductPickerModal (and exports a draft-materialize
// hook), so the whole @patina/supabase surface it pulls in must be stubbed.
jest.mock('@patina/supabase', () => ({
  useProducts: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  useLayerProducts: () => ({ data: mockLayerRows, isLoading: false, isError: false }),
  useLayerCounts: () => ({ data: { personal: 0, studio: 0, catalog: 0 } }),
  useCrossLayerSearch: () => ({
    data: {
      byLayer: { personal: [], studio: [], catalog: [] },
      counts: { personal: 0, studio: 0, catalog: 0 },
      total: 0,
    },
    isLoading: false,
    isError: false,
  }),
  useProposalCaptures: () => ({ data: [], isLoading: false, isError: false }),
  useCreateDraftProduct: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCaptureFromUrl: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCaptureProduct: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProduct: () => ({
    data: {
      id: 'bed-1',
      name: 'Ledge Bed',
      configuration_mode: 'variant',
      price_retail: 400000,
      price_trade: 240000,
      lead_time_weeks: 10,
    },
    isLoading: false,
    error: null,
  }),
  useProductConfigurationDefinition: () => ({ data: mockDefinition, isLoading: false }),
  useEvaluateProductConfiguration: () => ({
    isPending: false,
    mutateAsync: async (input: { optionValueIds: string[] }) => {
      const complete = input.optionValueIds.includes('value-king');
      return {
        valid: true,
        complete,
        violations: [],
        warnings: [],
        normalizedSelection: {},
        componentQuantities: {},
        componentState: {},
        matchedVariant: complete ? { id: 'variant-king', sku: 'BED-K' } : null,
        retailPriceCents: complete ? 440000 : null,
        tradePriceCents: complete ? 264000 : null,
        leadTimeWeeks: complete ? 12 : null,
        dimensions: null,
        schemaRevision: 2,
        snapshot: {
          productId: 'bed-1',
          productName: 'Ledge Bed',
          configurationMode: 'variant',
          pricingStrategy: 'base_plus_adjustments',
          schemaRevision: 2,
          variant: complete ? { id: 'variant-king', sku: 'BED-K' } : null,
          selections: complete ? mockSelectionSnapshot : [],
          components: [],
          retailPriceCents: complete ? 440000 : null,
          tradePriceCents: complete ? 264000 : null,
          leadTimeWeeks: complete ? 12 : null,
          dimensions: null,
          capturedAt: '2026-08-02T12:00:00Z',
        },
      };
    },
  }),
}));

import {
  DecisionOptionBuilder,
  optionValueToInput,
  type DecisionOptionValue,
} from '../decision-option-builder';

// Default to the manual-fields view so the field assertions have something to
// read; the library-first State A is exercised explicitly where needed.
function baseValue(overrides: Partial<DecisionOptionValue> = {}): DecisionOptionValue {
  return {
    name: '',
    imageUrl: '',
    designerNote: '',
    isRecommended: false,
    price: '',
    quantity: '',
    costDelta: '',
    leadTimeDelta: '',
    manualMode: true,
    saveAsDraft: true,
    ...overrides,
  };
}

describe('DecisionOptionBuilder', () => {
  it('State A: a pristine option shows the library-first CTA, not the fields', () => {
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={jest.fn()} />
    );
    expect(screen.getByTestId('option-0-choose-product')).toBeInTheDocument();
    expect(screen.queryByTestId('option-0-price')).not.toBeInTheDocument();
  });

  it('opens the product picker when the library CTA is clicked', () => {
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={jest.fn()} />
    );
    fireEvent.click(screen.getByTestId('option-0-choose-product'));
    expect(screen.getByTestId('product-picker-modal')).toBeInTheDocument();
  });

  it('"enter manually" flips the option into manual mode', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('option-0-enter-manually'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ manualMode: true }));
  });

  it('renders all 4 numeric/text inputs plus name, designer note, and recommendation checkbox (manual mode)', () => {
    render(<DecisionOptionBuilder index={0} value={baseValue()} onChange={jest.fn()} />);

    expect(screen.getByTestId('option-0-price')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-quantity')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-cost-delta')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-lead-time-delta')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-name')).toBeInTheDocument();
    expect(screen.getByText(/Designer Note/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /my recommendation/i })).toBeInTheDocument();
  });

  it('calls onChange with the new price string when typing into the price input', () => {
    const onChange = jest.fn();
    render(<DecisionOptionBuilder index={0} value={baseValue()} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('option-0-price'), {
      target: { value: '$1,200.00' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ price: '$1,200.00' }));
  });

  it('calls onChange with the new quantity string when typing into the quantity input', () => {
    const onChange = jest.fn();
    render(<DecisionOptionBuilder index={1} value={baseValue()} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('option-1-quantity'), {
      target: { value: '4' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quantity: '4' }));
  });

  it('toggles isRecommended via the recommendation checkbox', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ isRecommended: false })} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /my recommendation/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isRecommended: true }));
  });

  it('does not render Remove button when onRemove is not provided', () => {
    render(<DecisionOptionBuilder index={0} value={baseValue()} onChange={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('renders Remove button and calls onRemove when clicked', () => {
    const onRemove = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue()} onChange={jest.fn()} onRemove={onRemove} />
    );
    const btn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('State B: a linked option shows Change / Clear-link and hides the save-as-draft toggle', () => {
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue({ productId: 'prod-1', name: 'Linen', manualMode: false })}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('option-0-change-product')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-clear-link')).toBeInTheDocument();
    expect(screen.queryByTestId('option-0-save-as-draft')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-2 — a decision option built from an optioned piece names and prices the
// SPECIFICATION the client is being asked to approve, not the product family.
// ─────────────────────────────────────────────────────────────────────────────

describe('DecisionOptionBuilder — configured picks', () => {
  beforeEach(() => {
    mockLayerRows = [
      {
        id: 'bed-1',
        name: 'Ledge Bed',
        brand: 'Atelier Whitfield',
        price_retail: 400000,
        price_trade: 240000,
        images: [],
        source_url: null,
        status: 'published',
        category: null,
        configuration_mode: 'variant',
        configuration_summary: null,
        layer: 'personal',
        owner_user_id: 'user-1',
        studio_id: null,
        created_at: '2026-08-01T00:00:00Z',
      },
    ];
  });

  afterEach(() => {
    mockLayerRows = [];
  });

  it('names and prices the option from the resolved specification', async () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={onChange} />
    );

    fireEvent.click(screen.getByTestId('option-0-choose-product'));
    fireEvent.click(screen.getAllByTestId('product-picker-result')[0]);
    await act(async () => {});

    fireEvent.click(await screen.findByRole('radio', { name: /King/ }));
    const confirm = await screen.findByRole('button', { name: 'Add configured piece' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'bed-1',
        name: 'Ledge Bed — King',
        // 440000 resolved cents, not the 400000 list price.
        price: '4400',
        configurationPending: false,
        configurationSelections: mockSelectionSnapshot,
      }),
    );
  });

  it('marks a "Decide later" pick as configuration-pending', async () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={onChange} />
    );

    fireEvent.click(screen.getByTestId('option-0-choose-product'));
    fireEvent.click(screen.getAllByTestId('product-picker-result')[0]);
    await act(async () => {});
    fireEvent.click(await screen.findByTestId('picker-configure-skip'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'bed-1',
        // No specification resolved, so the name stays the family name.
        name: 'Ledge Bed',
        configurationPending: true,
        configurationSelections: undefined,
      }),
    );
  });

  it('shows the pending hint on a linked option that skipped configuration', () => {
    render(
      <DecisionOptionBuilder
        index={2}
        value={baseValue({
          productId: 'bed-1',
          name: 'Ledge Bed',
          manualMode: false,
          configurationPending: true,
        })}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('option-2-configuration-pending')).toBeInTheDocument();
    expect(screen.getByText(/Configuration pending/i)).toBeInTheDocument();
  });

  it('does not show the pending hint on a resolved option', () => {
    render(
      <DecisionOptionBuilder
        index={2}
        value={baseValue({
          productId: 'bed-1',
          name: 'Ledge Bed — King',
          manualMode: false,
          configurationSelections: mockSelectionSnapshot,
        })}
        onChange={jest.fn()}
      />
    );
    expect(screen.queryByTestId('option-2-configuration-pending')).not.toBeInTheDocument();
  });
});

describe('optionValueToInput — configuration provenance', () => {
  it('carries the configuration id and selection snapshot to the decision RPC', () => {
    const input = optionValueToInput(
      baseValue({
        name: 'Ledge Bed — King',
        productId: 'bed-1',
        savedConfigurationId: 'config-1',
        configurationSelections: mockSelectionSnapshot,
      }),
    );
    expect(input.configurationId).toBe('config-1');
    expect(input.selectionSnapshot).toEqual(mockSelectionSnapshot);
  });

  it('omits both keys when the option carries no specification', () => {
    const input = optionValueToInput(baseValue({ name: 'Linen', productId: 'prod-1' }));
    expect(input.configurationId).toBeUndefined();
    expect(input.selectionSnapshot).toBeUndefined();
  });
});
