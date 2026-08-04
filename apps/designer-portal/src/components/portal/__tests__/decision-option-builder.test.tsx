import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

// A variant piece the library tab can offer, so the picker's configure step
// (P0-2) can be walked end to end from inside the builder.
let mockLayerRows: Array<Record<string, unknown>> = [];

const optionValue = (overrides: Record<string, unknown>) => ({
  groupId: 'group-size',
  description: null,
  swatch: null,
  media: [],
  retailPriceDeltaCents: 0,
  tradePriceDeltaCents: 0,
  leadTimeDeltaWeeks: 0,
  allowsCom: false,
  metadata: {},
  position: 0,
  isActive: true,
  ...overrides,
});

const mockDefinition = {
  productId: 'bed-1',
  productName: 'Ledge Bed',
  mode: 'variant',
  pricingStrategy: 'base_plus_adjustments',
  revision: 2,
  baseRetailPriceCents: 400000,
  baseTradePriceCents: 240000,
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
        optionValue({
          id: 'value-king',
          code: 'king',
          label: 'King',
          retailPriceDeltaCents: 40000,
          tradePriceDeltaCents: 24000,
          leadTimeDeltaWeeks: 2,
          position: 0,
        }),
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

/**
 * P1-6 — a family with a real group to compare across (three sizes) plus a
 * second group, so "pick ONE group" has something to be wrong about.
 */
const mockCompareDefinition = {
  ...mockDefinition,
  optionGroups: [
    {
      ...mockDefinition.optionGroups[0],
      values: [
        optionValue({
          id: 'value-king',
          code: 'king',
          label: 'King',
          retailPriceDeltaCents: 40000,
          tradePriceDeltaCents: 24000,
          leadTimeDeltaWeeks: 2,
          position: 0,
        }),
        optionValue({
          id: 'value-queen',
          code: 'queen',
          label: 'Queen',
          retailPriceDeltaCents: 10000,
          tradePriceDeltaCents: 6000,
          leadTimeDeltaWeeks: 0,
          position: 1,
          swatch: { url: 'https://cdn.test/queen-swatch.jpg' },
        }),
        optionValue({
          id: 'value-cal-king',
          code: 'cal_king',
          label: 'California King',
          retailPriceDeltaCents: 55000,
          tradePriceDeltaCents: 33000,
          leadTimeDeltaWeeks: 3,
          position: 2,
        }),
      ],
    },
    {
      id: 'group-finish',
      productId: 'bed-1',
      code: 'finish',
      name: 'Finish',
      description: null,
      selectionType: 'single',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      position: 1,
      values: [
        optionValue({
          id: 'value-walnut',
          groupId: 'group-finish',
          code: 'walnut',
          label: 'Walnut',
          position: 0,
        }),
        optionValue({
          id: 'value-oak',
          groupId: 'group-finish',
          code: 'oak',
          label: 'Oak',
          retailPriceDeltaCents: 5000,
          tradePriceDeltaCents: 3000,
          leadTimeDeltaWeeks: 1,
          position: 1,
        }),
      ],
    },
  ],
};

/** Which definition `useProductConfigurationDefinition` answers with. */
let mockActiveDefinition: Record<string, unknown> = mockDefinition;

/** The product row the builder probes for a hydrated option's mode. */
let mockProductRow: Record<string, unknown> = {
  id: 'bed-1',
  name: 'Ledge Bed',
  configuration_mode: 'variant',
  price_retail: 400000,
  price_trade: 240000,
  lead_time_weeks: 10,
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

/**
 * W2-A — a made-to-configure body whose one group is COM-capable, so the
 * configure step offers "Specify the fabric now" and the pick can carry
 * `comDetails` out of the picker.
 */
const mockComDefinition = {
  ...mockDefinition,
  mode: 'configured',
  variants: [],
  optionGroups: [
    {
      ...mockDefinition.optionGroups[0],
      id: 'group-fabric',
      code: 'fabric',
      name: 'Fabric',
      values: [
        optionValue({
          id: 'value-com',
          groupId: 'group-fabric',
          code: 'com',
          label: "Customer's Own Material",
          allowsCom: true,
          comRequirements: { yardage: '14 yds' },
          position: 0,
        }),
      ],
    },
  ],
};

/** What the evaluate RPC answers with, per chosen value id. */
const MOCK_VALUE_SNAPSHOTS: Record<string, Record<string, unknown>> = {
  'value-king': mockSelectionSnapshot[0],
  'value-com': {
    optionGroupId: 'group-fabric',
    optionValueId: 'value-com',
    groupCode: 'fabric',
    valueCode: 'com',
    groupName: 'Fabric',
    valueLabel: "Customer's Own Material",
    retailPriceDeltaCents: 0,
    tradePriceDeltaCents: 0,
    leadTimeDeltaWeeks: 0,
    allowsCom: true,
  },
};

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
  useProduct: (id: string) => ({
    data: id ? mockProductRow : undefined,
    isLoading: false,
    error: null,
  }),
  useProductConfigurationDefinition: () => ({ data: mockActiveDefinition, isLoading: false }),
  useEvaluateProductConfiguration: () => ({
    isPending: false,
    mutateAsync: async (input: { optionValueIds: string[] }) => {
      const selections = input.optionValueIds
        .map((id) => MOCK_VALUE_SNAPSHOTS[id])
        .filter(Boolean);
      const complete = selections.length > 0;
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
          selections,
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
  comDetailsNote,
  optionValueToInput,
  parsePriceToCents,
  type DecisionOptionValue,
} from '../decision-option-builder';
import {
  buildComparisonSiblings,
  deriveBaseSelections,
} from '../decision-compare-across-group';

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

// ─────────────────────────────────────────────────────────────────────────────
// W2-A — the COM fabric the designer specified in the picker has no column on a
// decision option. It must not evaporate at the boundary: it lands in the
// designer note, where the client card shows it and the designer can edit it.
// ─────────────────────────────────────────────────────────────────────────────

describe('comDetailsNote', () => {
  it('reads as one line a human can act on', () => {
    expect(
      comDetailsNote({
        fabricName: 'Belgian Linen 12',
        mill: 'Rogers & Goffigon',
        yardage: 14,
      }),
    ).toBe('COM: Belgian Linen 12 — Rogers & Goffigon · 14 yds');
  });

  it('prints only the parts the designer actually gave', () => {
    expect(comDetailsNote({ fabricName: 'Belgian Linen 12' })).toBe(
      'COM: Belgian Linen 12',
    );
    expect(comDetailsNote({ mill: 'Rogers & Goffigon' })).toBe(
      'COM: Rogers & Goffigon',
    );
    expect(comDetailsNote({ yardage: '14' })).toBe('COM: 14 yds');
    expect(comDetailsNote({ fabricName: 'Belgian Linen 12', yardage: 14 })).toBe(
      'COM: Belgian Linen 12 · 14 yds',
    );
  });

  it('says nothing when there is nothing to say', () => {
    expect(comDetailsNote(null)).toBeNull();
    expect(comDetailsNote(undefined)).toBeNull();
    expect(comDetailsNote({})).toBeNull();
    expect(comDetailsNote({ fabricName: '   ', mill: null, yardage: '' })).toBeNull();
    // A COM row that only carries its own option id is not a fabric spec.
    expect(comDetailsNote({ optionValueId: 'value-com' })).toBeNull();
  });
});

describe('DecisionOptionBuilder — COM picks', () => {
  beforeEach(() => {
    mockActiveDefinition = mockComDefinition;
    mockProductRow = {
      id: 'bed-1',
      name: 'Ledge Bed',
      configuration_mode: 'configured',
      price_retail: 400000,
    };
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
        configuration_mode: 'configured',
        configuration_summary: null,
        layer: 'personal',
        owner_user_id: 'user-1',
        studio_id: null,
        created_at: '2026-08-01T00:00:00Z',
      },
    ];
  });

  afterEach(() => {
    mockActiveDefinition = mockDefinition;
    mockLayerRows = [];
    mockProductRow = { id: 'bed-1', name: 'Ledge Bed', configuration_mode: 'variant' };
  });

  /** Walk the picker to a confirmed COM specification and return the patch. */
  const pickWithCom = async (
    value: DecisionOptionValue,
  ): Promise<DecisionOptionValue> => {
    const onChange = jest.fn();
    render(<DecisionOptionBuilder index={0} value={value} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('option-0-choose-product'));
    fireEvent.click(screen.getAllByTestId('product-picker-result')[0]);
    await act(async () => {});

    fireEvent.click(
      await screen.findByRole('radio', { name: /Customer's Own Material/ }),
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole('checkbox', { name: 'Specify the fabric now' }));
    fireEvent.change(screen.getByLabelText('Fabric'), {
      target: { value: 'Belgian Linen 12' },
    });
    fireEvent.change(screen.getByLabelText('Mill'), {
      target: { value: 'Rogers & Goffigon' },
    });

    const confirm = await screen.findByRole('button', { name: 'Add configured piece' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    return onChange.mock.calls.at(-1)![0] as DecisionOptionValue;
  };

  it('carries the specified fabric onto the option as a readable note', async () => {
    const patched = await pickWithCom(baseValue({ manualMode: false }));
    expect(patched.designerNote).toBe('COM: Belgian Linen 12 — Rogers & Goffigon');
  });

  it('appends to the note the designer already wrote rather than replacing it', async () => {
    const patched = await pickWithCom(
      baseValue({ manualMode: false, designerNote: 'Client asked for softer arms.' }),
    );
    expect(patched.designerNote).toBe(
      'Client asked for softer arms.\nCOM: Belgian Linen 12 — Rogers & Goffigon',
    );
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

// ─────────────────────────────────────────────────────────────────────────────
// P1-6 — "Compare across a group". One family, one group, N sibling cards, each
// carrying the full selection snapshot with that group's entry swapped.
// ─────────────────────────────────────────────────────────────────────────────

/** A linked option already specified to Ledge Bed · King at its resolved price. */
const specifiedOption = (overrides: Partial<DecisionOptionValue> = {}) =>
  baseValue({
    productId: 'bed-1',
    name: 'Ledge Bed — King',
    price: '4400',
    quantity: '2',
    manualMode: false,
    configurationMode: 'variant',
    configurationSelections: mockSelectionSnapshot,
    ...overrides,
  });

describe('buildComparisonSiblings', () => {
  const generate = (
    source: DecisionOptionValue,
    valueIds: string[],
    definition: Record<string, unknown> = mockCompareDefinition,
  ) =>
    buildComparisonSiblings({
      source,
      // The hook's shape is the RPC contract; the test fixture mirrors it.
      definition: definition as never,
      groupId: 'group-size',
      valueIds,
      basePriceCents: parsePriceToCents(source.price),
    });

  it('produces one sibling per compared value, minus the option’s own', () => {
    // King is what the source option already IS — its card stands for it, so a
    // second King card would put the same piece in front of the client twice.
    const siblings = generate(specifiedOption(), [
      'value-king',
      'value-queen',
      'value-cal-king',
    ]);
    expect(siblings.map((o) => o.name)).toEqual([
      'Ledge Bed — Queen',
      'Ledge Bed — California King',
    ]);
  });

  it('generates nothing when only the option’s own value is ticked', () => {
    expect(generate(specifiedOption(), ['value-king'])).toEqual([]);
  });

  it('leaves the source option untouched — it keeps the recommendation', () => {
    const source = specifiedOption({ isRecommended: true, designerNote: 'Leah’s pick' });
    const siblings = generate(source, ['value-king', 'value-queen']);
    // The generator returns siblings only; the source object is never mutated,
    // and no sibling claims the baseline's recommendation from it.
    expect(source.isRecommended).toBe(true);
    expect(source.designerNote).toBe('Leah’s pick');
    expect(siblings.some((o) => o.isRecommended)).toBe(false);
  });

  it('prices each sibling off the resolved price, net of the baseline delta', () => {
    const siblings = generate(specifiedOption(), [
      'value-king',
      'value-queen',
      'value-cal-king',
    ]);
    // 440000 base; Queen swaps King's 40000 delta for a 10000 one, Cal King for 55000.
    expect(siblings.map((o) => o.price)).toEqual(['4100', '4550']);
  });

  it('measures cost deltas in RETAIL, matching the price beside them', () => {
    const siblings = generate(specifiedOption(), [
      'value-king',
      'value-queen',
      'value-cal-king',
    ]);
    // Retail deltas 10000 / 55000 against King's 40000 — NOT the trade deltas
    // (6000 / 33000 against 24000), which would leak the studio's own cost.
    expect(siblings.map((o) => o.costDelta)).toEqual(['-300', '+150']);
    // …and each one is exactly the movement in its own price: 4400 → 4100 / 4550.
    expect(siblings.map((o) => o.leadTimeDelta)).toEqual(['-14', '+7']);
  });

  it('never lets a trade delta reach a client-facing field', () => {
    const siblings = generate(specifiedOption(), ['value-queen', 'value-cal-king']);
    // Trade would have read -180 / +90; retail reads -300 / +150.
    expect(siblings.map((o) => o.costDelta)).not.toContain('-180');
    expect(siblings.map((o) => o.costDelta)).not.toContain('+90');
  });

  it('carries the full snapshot with only the compared group swapped', () => {
    const [queen] = generate(specifiedOption(), ['value-king', 'value-queen']);
    expect(queen.configurationSelections).toEqual([
      {
        optionGroupId: 'group-size',
        optionValueId: 'value-queen',
        groupCode: 'size',
        valueCode: 'queen',
        groupName: 'Size',
        valueLabel: 'Queen',
        retailPriceDeltaCents: 10000,
        tradePriceDeltaCents: 6000,
        leadTimeDeltaWeeks: 0,
        allowsCom: false,
      },
    ]);
    // A generated sibling is intent, never a configuration of record.
    expect(queen.savedConfigurationId).toBeUndefined();
    expect(queen.configurationPending).toBe(false);
  });

  it('keeps the option link, layer and quantity, and takes the value swatch as the image', () => {
    const [queen] = generate(specifiedOption({ imageUrl: 'https://cdn.test/bed.jpg' }), [
      'value-king',
      'value-queen',
    ]);
    expect(queen.productId).toBe('bed-1');
    expect(queen.quantity).toBe('2');
    expect(queen.imageUrl).toBe('https://cdn.test/queen-swatch.jpg');
  });

  it('falls back to the option image when the value has no swatch', () => {
    const [, calKing] = generate(specifiedOption({ imageUrl: 'https://cdn.test/bed.jpg' }), [
      'value-queen',
      'value-cal-king',
    ]);
    expect(calKing.imageUrl).toBe('https://cdn.test/bed.jpg');
  });

  it('anchors the baseline to the option’s own value even when it is unticked', () => {
    // Unticking King says "do not write a King card" — it does not move the
    // reference the other cards are measured from. The math is the same whether
    // King is ticked or not.
    const ticked = generate(specifiedOption(), [
      'value-king',
      'value-queen',
      'value-cal-king',
    ]);
    const unticked = generate(specifiedOption(), ['value-queen', 'value-cal-king']);
    expect(unticked.map((o) => [o.name, o.price, o.costDelta, o.leadTimeDelta])).toEqual(
      ticked.map((o) => [o.name, o.price, o.costDelta, o.leadTimeDelta]),
    );
    expect(unticked.map((o) => o.price)).toEqual(['4100', '4550']);
    expect(unticked.map((o) => o.costDelta)).toEqual(['-300', '+150']);
    // Nothing here is the baseline, so nothing steals the recommendation.
    expect(unticked.some((o) => o.isRecommended)).toBe(false);
  });

  it('falls back to the base configuration for a group the snapshot never spoke to', () => {
    // The option is specified to a Size but says nothing about Finish, so the
    // Finish comparison anchors to the piece's base finish (Walnut, delta 0) —
    // not to whichever value happened to be ticked first.
    const siblings = buildComparisonSiblings({
      source: specifiedOption(),
      definition: mockCompareDefinition as never,
      groupId: 'group-finish',
      valueIds: ['value-oak'],
      basePriceCents: 440000,
    });
    expect(siblings.map((o) => o.name)).toEqual(['Ledge Bed — Oak']);
    // Oak retail delta 5000 against Walnut's 0 — not '' (which is what an
    // Oak-as-its-own-baseline reading would produce).
    expect(siblings[0].costDelta).toBe('+50');
    expect(siblings[0].price).toBe('4450');
    expect(siblings[0].isRecommended).toBe(false);
  });

  it('falls back to the first compared value when nothing anchors the group', () => {
    // An optional group with no default: neither the option nor the piece's base
    // configuration names a value, so the first compared value holds the line.
    const optionalGroupDefinition = {
      ...mockCompareDefinition,
      variants: [],
      optionGroups: [
        { ...mockCompareDefinition.optionGroups[0], required: false },
        mockCompareDefinition.optionGroups[1],
      ],
    };
    const siblings = generate(
      specifiedOption({ configurationSelections: undefined }),
      ['value-queen', 'value-cal-king'],
      optionalGroupDefinition,
    );
    expect(siblings[0].name).toBe('Ledge Bed — Queen');
    expect(siblings[0].isRecommended).toBe(true);
    expect(siblings[0].costDelta).toBe('');
    // Cal King now reads against Queen, in retail: 55000 − 10000, (3 − 0) weeks.
    expect(siblings[1].costDelta).toBe('+450');
    expect(siblings[1].leadTimeDelta).toBe('+21');
  });

  it('returns nothing when no value was compared or the group is unknown', () => {
    expect(generate(specifiedOption(), [])).toEqual([]);
    expect(
      buildComparisonSiblings({
        source: specifiedOption(),
        definition: mockCompareDefinition as never,
        groupId: 'group-nope',
        valueIds: ['value-queen'],
      }),
    ).toEqual([]);
  });

  describe('with no stashed selection (Decide later, or a legacy option)', () => {
    const unresolved = () =>
      specifiedOption({
        name: 'Ledge Bed',
        price: '4000',
        configurationSelections: undefined,
        configurationPending: true,
      });

    it('derives the base configuration from the definition', () => {
      expect(deriveBaseSelections(mockCompareDefinition as never)).toEqual([
        expect.objectContaining({ groupCode: 'size', valueCode: 'king' }),
        expect.objectContaining({ groupCode: 'finish', valueCode: 'walnut' }),
      ]);
    });

    it('still generates siblings, keeping the untouched groups in place', () => {
      const siblings = generate(unresolved(), ['value-queen', 'value-cal-king']);
      expect(siblings.map((o) => o.name)).toEqual([
        'Ledge Bed — Queen',
        'Ledge Bed — California King',
      ]);
      expect(siblings[0].configurationSelections).toEqual([
        expect.objectContaining({ groupCode: 'size', valueCode: 'queen' }),
        expect.objectContaining({ groupCode: 'finish', valueCode: 'walnut' }),
      ]);
      // Anchored to the BASE configuration (King, 40000) — the same reference
      // the panel says it is working from. 400000 + 10000 − 40000 = 370000.
      expect(siblings.map((o) => o.price)).toEqual(['3700', '4150']);
      expect(siblings[0].configurationPending).toBe(false);
    });

    it('regenerates the base value freely — the source is not it', () => {
      // Nothing to duplicate: the option carries no specification, so a King
      // card is new content (it pins a spec the option never had).
      const siblings = generate(unresolved(), ['value-king', 'value-queen']);
      expect(siblings.map((o) => o.name)).toEqual([
        'Ledge Bed — King',
        'Ledge Bed — Queen',
      ]);
      // …and the base value, being the baseline, carries the recommendation.
      expect(siblings.filter((o) => o.isRecommended).map((o) => o.name)).toEqual([
        'Ledge Bed — King',
      ]);
    });
  });

  it('feeds the decision RPC through optionValueToInput', () => {
    const [queen] = generate(specifiedOption(), ['value-king', 'value-queen']);
    const input = optionValueToInput(queen);
    expect(input).toMatchObject({
      name: 'Ledge Bed — Queen',
      productId: 'bed-1',
      price: 410000,
      quantity: 2,
      // Retail-derived: 10000 − 40000. The trade reading (6000 − 24000 = −18000)
      // must never reach the row the client card is drawn from.
      costDeltaCents: -30000,
      leadTimeDaysDelta: -14,
      configurationId: undefined,
    });
    expect(input.selectionSnapshot).toEqual([
      expect.objectContaining({ optionValueId: 'value-queen' }),
    ]);
  });
});

describe('DecisionOptionBuilder — compare across a group', () => {
  beforeEach(() => {
    mockActiveDefinition = mockCompareDefinition;
  });

  afterEach(() => {
    mockActiveDefinition = mockDefinition;
    mockProductRow = { id: 'bed-1', name: 'Ledge Bed', configuration_mode: 'variant' };
  });

  const renderBuilder = (
    value: DecisionOptionValue,
    onGenerateSiblings?: (siblings: DecisionOptionValue[]) => void,
  ) =>
    render(
      <DecisionOptionBuilder
        index={0}
        value={value}
        onChange={jest.fn()}
        onGenerateSiblings={onGenerateSiblings}
      />,
    );

  it('offers the affordance on a linked variant piece', () => {
    renderBuilder(specifiedOption(), jest.fn());
    expect(screen.getByTestId('option-0-compare-group')).toBeInTheDocument();
  });

  it('reads the mode off the product row for a hydrated option', () => {
    renderBuilder(specifiedOption({ configurationMode: undefined }), jest.fn());
    expect(screen.getByTestId('option-0-compare-group')).toBeInTheDocument();
  });

  it.each(['standard', 'custom'] as const)('hides the affordance on a %s piece', (mode) => {
    renderBuilder(specifiedOption({ configurationMode: mode }), jest.fn());
    expect(screen.queryByTestId('option-0-compare-group')).not.toBeInTheDocument();
  });

  it('hides the affordance when the product row says standard', () => {
    mockProductRow = { id: 'bed-1', name: 'Ledge Bed', configuration_mode: 'standard' };
    renderBuilder(specifiedOption({ configurationMode: undefined }), jest.fn());
    expect(screen.queryByTestId('option-0-compare-group')).not.toBeInTheDocument();
  });

  it('hides the affordance when nobody owns the options array', () => {
    renderBuilder(specifiedOption());
    expect(screen.queryByTestId('option-0-compare-group')).not.toBeInTheDocument();
  });

  it('hides the affordance on a manual option', () => {
    renderBuilder(baseValue({ name: 'Linen', manualMode: true }), jest.fn());
    expect(screen.queryByTestId('option-0-compare-group')).not.toBeInTheDocument();
  });

  it('generates the ticked siblings and closes the panel', () => {
    const onGenerateSiblings = jest.fn();
    renderBuilder(specifiedOption(), onGenerateSiblings);

    fireEvent.click(screen.getByTestId('option-0-compare-group'));
    expect(screen.getByTestId('option-0-compare-panel')).toBeInTheDocument();

    // The option's own value starts ticked — it is what the others are read
    // against — but it is never written back out as a card of its own.
    expect(screen.getByRole('checkbox', { name: 'King' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Queen' }));
    fireEvent.click(screen.getByTestId('option-0-compare-generate'));

    expect(onGenerateSiblings).toHaveBeenCalledTimes(1);
    const siblings = onGenerateSiblings.mock.calls[0][0] as DecisionOptionValue[];
    expect(siblings.map((o) => o.name)).toEqual(['Ledge Bed — Queen']);
    expect(screen.queryByTestId('option-0-compare-panel')).not.toBeInTheDocument();
  });

  it('cannot generate when the only ticked value is the option’s own', () => {
    renderBuilder(specifiedOption(), jest.fn());
    fireEvent.click(screen.getByTestId('option-0-compare-group'));
    // King alone is ticked by default, and King is this very card.
    expect(screen.getByTestId('option-0-compare-generate')).toBeDisabled();
    expect(screen.getByText('Pick a value beside this one')).toBeInTheDocument();
  });

  it('compares across the group the designer picks, not the default one', () => {
    const onGenerateSiblings = jest.fn();
    renderBuilder(specifiedOption(), onGenerateSiblings);

    fireEvent.click(screen.getByTestId('option-0-compare-group'));
    fireEvent.click(screen.getByRole('radio', { name: 'Finish' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Walnut' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Oak' }));
    fireEvent.click(screen.getByTestId('option-0-compare-generate'));

    const siblings = onGenerateSiblings.mock.calls[0][0] as DecisionOptionValue[];
    expect(siblings.map((o) => o.name)).toEqual([
      'Ledge Bed — Walnut',
      'Ledge Bed — Oak',
    ]);
    // The size the option was specified to survives the finish comparison.
    expect(siblings[1].configurationSelections).toEqual([
      expect.objectContaining({ valueCode: 'king' }),
      expect.objectContaining({ valueCode: 'oak' }),
    ]);
  });

  it('says so when it is working from the piece’s base configuration', () => {
    renderBuilder(
      specifiedOption({ configurationSelections: undefined, configurationPending: true }),
      jest.fn(),
    );
    fireEvent.click(screen.getByTestId('option-0-compare-group'));
    expect(screen.getByTestId('option-0-compare-base-note')).toBeInTheDocument();
  });

  it('does not say so when the option already carries a specification', () => {
    renderBuilder(specifiedOption(), jest.fn());
    fireEvent.click(screen.getByTestId('option-0-compare-group'));
    expect(screen.queryByTestId('option-0-compare-base-note')).not.toBeInTheDocument();
  });

  it('cannot generate with nothing ticked', () => {
    renderBuilder(
      specifiedOption({ configurationSelections: undefined }),
      jest.fn(),
    );
    fireEvent.click(screen.getByTestId('option-0-compare-group'));
    expect(screen.getByTestId('option-0-compare-generate')).toBeDisabled();
  });
});
