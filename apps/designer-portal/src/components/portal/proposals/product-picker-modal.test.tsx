import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// ─────────────────────────────────────────────────────────────────────────────
// P0-2 — the picker's configure step.
//
// A picker that emits a variant/configured piece as "the product" hands the
// project something nobody can order. These tests pin the four paths: a
// standard piece still leaves in one click, an optioned piece stops for a
// server-confirmed selection, "Decide later" always escapes, and a custom
// commission is sent to the piece room rather than half-configured here.
//
// @patina/supabase is NOT module-mapped in this app's jest config, so the whole
// module is stubbed with a factory (the decision-option-builder convention).
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_PRODUCT = {
  id: 'bed-1',
  name: 'Ledge Bed',
  brand: 'Atelier Whitfield',
  price_retail: 400000,
  price_trade: 240000,
  lead_time_weeks: 10,
  sku: 'BED',
  dimensions: null,
  materials: null,
  colors: null,
  available_colors: null,
  finish: null,
  configuration_mode: 'variant',
};

const VARIANT_DEFINITION = {
  productId: 'bed-1',
  productName: 'Ledge Bed',
  mode: 'variant',
  pricingStrategy: 'base_plus_adjustments',
  revision: 3,
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
      vendorSku: 'LW-BED-K',
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

/** The row the browse grids hand the picker. */
function layerRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

let mockLayerRows: Array<Record<string, unknown>> = [];
let mockCatalogRows: Array<Record<string, unknown>> = [];
let mockProduct: Record<string, unknown> = VARIANT_PRODUCT;
let mockDefinition: Record<string, unknown> = VARIANT_DEFINITION;

/** A server evaluation that mirrors what 00403/00413 actually return. */
const evaluateMock = jest.fn(
  async (input: { productId: string; optionValueIds: string[] }) => {
    const groups = (mockDefinition.optionGroups ?? []) as Array<
      Record<string, never> & {
        id: string;
        code: string;
        name: string;
        values: Array<{ id: string; code: string; label: string }>;
      }
    >;
    const selections = groups.flatMap((group) =>
      group.values
        .filter((value) => input.optionValueIds.includes(value.id))
        .map((value) => ({
          optionGroupId: group.id,
          optionValueId: value.id,
          groupCode: group.code,
          valueCode: value.code,
          groupName: group.name,
          valueLabel: value.label,
          retailPriceDeltaCents: 40000,
          tradePriceDeltaCents: 24000,
          leadTimeDeltaWeeks: 2,
          allowsCom: false,
        })),
    );
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
      schemaRevision: 3,
      snapshot: {
        productId: 'bed-1',
        productName: 'Ledge Bed',
        configurationMode: 'variant',
        pricingStrategy: 'base_plus_adjustments',
        schemaRevision: 3,
        variant: complete
          ? { id: 'variant-king', sku: 'BED-K', name: 'Ledge Bed · King' }
          : null,
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
);

jest.mock('@patina/supabase', () => ({
  useProducts: () => ({
    data: { data: mockCatalogRows },
    isLoading: false,
    isError: false,
  }),
  useLayerProducts: () => ({ data: mockLayerRows, isLoading: false, isError: false }),
  useLayerCounts: () => ({ data: { personal: 1, studio: 0, catalog: 0 } }),
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
  useProduct: () => ({ data: mockProduct, isLoading: false, error: null }),
  useProductConfigurationDefinition: () => ({
    data: mockDefinition,
    isLoading: false,
  }),
  useEvaluateProductConfiguration: () => ({
    mutateAsync: evaluateMock,
    isPending: false,
  }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
}));

// The factory is hoisted above every const in this file, so the mock object is
// built inside it and grabbed back through the import below.
jest.mock('@/lib/analytics/library-configuration-events', () => ({
  libraryConfigurationEvents: {
    started: jest.fn(),
    optionSelected: jest.fn(),
    componentChanged: jest.fn(),
    definitionSaved: jest.fn(),
    saved: jest.fn(),
    placementOpened: jest.fn(),
    pickerOpened: jest.fn(),
    pickerConfirmed: jest.fn(),
    pickerSkipped: jest.fn(),
  },
}));

import { libraryConfigurationEvents } from '@/lib/analytics/library-configuration-events';
import { ProductPickerModal, type ProductPickResult } from './product-picker-modal';

const analytics = libraryConfigurationEvents as jest.Mocked<
  typeof libraryConfigurationEvents
>;

function openLibraryPicker(props: Record<string, unknown> = {}) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  render(
    <ProductPickerModal
      open
      onClose={onClose}
      onPick={onPick}
      scope="library"
      {...props}
    />,
  );
  return { onPick, onClose };
}

/**
 * Click the first grid tile and let the configure step's mount evaluation
 * settle, so the resulting state lands inside act().
 */
async function pickFirstResult() {
  fireEvent.click(screen.getAllByTestId('product-picker-result')[0]);
  await act(async () => {});
}

function lastPick(onPick: jest.Mock): ProductPickResult {
  return onPick.mock.calls[onPick.mock.calls.length - 1][0] as ProductPickResult;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProduct = VARIANT_PRODUCT;
  mockDefinition = VARIANT_DEFINITION;
  mockLayerRows = [layerRow()];
  mockCatalogRows = [];
});

describe('ProductPickerModal — standard pieces keep the one-click grammar', () => {
  it('emits and closes immediately for a standard catalog piece', async () => {
    mockCatalogRows = [
      {
        id: 'lamp-1',
        name: 'Reading Lamp',
        brand: 'Hale',
        price_retail: 42000,
        price_trade: 25000,
        images: [],
        configuration_mode: 'standard',
        configuration_summary: null,
      },
    ];
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(<ProductPickerModal open onClose={onClose} onPick={onPick} />);

    await pickFirstResult();

    expect(screen.queryByTestId('picker-configure-step')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(lastPick(onPick)).toMatchObject({
      productId: 'lamp-1',
      configurationMode: 'standard',
    });
    expect(lastPick(onPick).configurationSelection).toBeUndefined();
  });

  it('never interrupts a surface that opted out of the configure step', async () => {
    const { onPick, onClose } = openLibraryPicker({ configureStep: false });

    await pickFirstResult();

    expect(screen.queryByTestId('picker-configure-step')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(lastPick(onPick).configurationSelection).toBeUndefined();
  });
});

describe('ProductPickerModal — configure step for optioned pieces', () => {
  it('stops on a variant piece instead of emitting the bare product', async () => {
    const { onPick, onClose } = openLibraryPicker();

    await pickFirstResult();

    expect(screen.getByTestId('picker-configure-step')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(analytics.pickerOpened).toHaveBeenCalledWith('bed-1', 'variant', 'library');
  });

  it('carries the server-confirmed selection out on confirm', async () => {
    const { onPick, onClose } = openLibraryPicker();
    await pickFirstResult();

    fireEvent.click(await screen.findByRole('radio', { name: /King/ }));

    const confirm = await screen.findByRole('button', { name: 'Add configured piece' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    const result = lastPick(onPick);
    expect(result.productId).toBe('bed-1');
    expect(result.configurationSkipped).toBeUndefined();
    expect(result.configurationSelection).toMatchObject({
      savedConfigurationId: null,
      variantId: 'variant-king',
      optionValueIds: ['value-king'],
      retailPriceCents: 440000,
      tradePriceCents: 264000,
      leadTimeWeeks: 12,
      label: 'King',
    });
    // The ONE snapshot vocabulary — picker → decisions → spec → PO.
    expect(result.configurationSelection?.selections[0]).toMatchObject({
      optionGroupId: 'group-size',
      optionValueId: 'value-king',
      groupCode: 'size',
      valueCode: 'king',
      groupName: 'Size',
      valueLabel: 'King',
      retailPriceDeltaCents: 40000,
      tradePriceDeltaCents: 24000,
      leadTimeDeltaWeeks: 2,
    });
    expect(onClose).toHaveBeenCalled();
    expect(analytics.pickerConfirmed).toHaveBeenCalledWith(
      'bed-1',
      'variant',
      'library',
      1,
    );
  });

  it('cannot confirm before the maker rules have resolved a specification', async () => {
    openLibraryPicker();
    await pickFirstResult();

    const confirm = await screen.findByRole('button', { name: 'Add configured piece' });
    expect(confirm).toBeDisabled();
  });

  it('"Decide later" emits the pick marked configuration-pending', async () => {
    const { onPick, onClose } = openLibraryPicker();
    await pickFirstResult();

    fireEvent.click(await screen.findByTestId('picker-configure-skip'));

    const result = lastPick(onPick);
    expect(result.configurationSkipped).toBe(true);
    expect(result.configurationSelection).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
    expect(analytics.pickerSkipped).toHaveBeenCalledWith('bed-1', 'variant', 'library');
  });

  it('the back arrow returns to the grid without emitting', async () => {
    const { onPick, onClose } = openLibraryPicker();
    await pickFirstResult();

    fireEvent.click(await screen.findByTestId('picker-configure-back'));

    expect(screen.queryByTestId('picker-configure-step')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('product-picker-result').length).toBeGreaterThan(0);
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('folds the modal room scope into a confirmed configured pick', async () => {
    const { onPick } = openLibraryPicker({
      rooms: [{ id: 'room-1', name: 'Primary Bedroom' }],
      defaultScopeRoomId: 'room-1',
    });
    await pickFirstResult();

    fireEvent.click(await screen.findByRole('radio', { name: /King/ }));
    const confirm = await screen.findByRole('button', { name: 'Add configured piece' });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(lastPick(onPick).scopeRoomId).toBe('room-1');
  });
});

describe('ProductPickerModal — custom commissions', () => {
  beforeEach(() => {
    mockLayerRows = [layerRow({ id: 'console-1', name: 'Hall Console', configuration_mode: 'custom' })];
    mockProduct = { ...VARIANT_PRODUCT, id: 'console-1', configuration_mode: 'custom' };
  });

  it('sends the designer to the piece room instead of a half-configured spec', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const { onPick } = openLibraryPicker();

    await pickFirstResult();

    expect(await screen.findByTestId('picker-configure-custom')).toBeInTheDocument();
    expect(
      screen.getByText(/Custom commission — scope, revisions, and pricing/),
    ).toBeInTheDocument();
    // No workspace: a commission has no picker-resolvable specification.
    expect(
      screen.queryByRole('button', { name: 'Add configured piece' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('picker-configure-open-piece-room'));
    expect(openSpy).toHaveBeenCalledWith('/library/console-1');
    expect(onPick).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('"Add unconfigured" still lets the commission enter as pending', async () => {
    const { onPick, onClose } = openLibraryPicker();
    await pickFirstResult();

    fireEvent.click(await screen.findByTestId('picker-configure-add-unconfigured'));

    expect(lastPick(onPick)).toMatchObject({
      productId: 'console-1',
      configurationSkipped: true,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
