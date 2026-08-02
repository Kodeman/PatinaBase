import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  PieceConfigurationWorkspace,
  selectionKey,
  type AuthoritativeConfigurationResolution,
} from "./piece-configuration-workspace";
import type {
  FlatPieceConfigurationSource,
  PieceConfigurationDefinitionView,
  PieceConfigurationSelectionView,
} from "./piece-configuration-model";

jest.mock("@/lib/analytics/library-configuration-events", () => ({
  libraryConfigurationEvents: {
    started: jest.fn(),
    optionSelected: jest.fn(),
    componentChanged: jest.fn(),
    definitionSaved: jest.fn(),
    saved: jest.fn(),
    placementOpened: jest.fn(),
  },
}));

const bed: FlatPieceConfigurationSource = {
  id: "bed-1",
  name: "Turned Oak Bed",
  configurationMode: "variant",
  sku: "BED",
  priceRetailCents: 200000,
  priceTradeCents: 120000,
  leadTimeWeeks: 8,
};

const bedDefinition: PieceConfigurationDefinitionView = {
  productId: bed.id,
  mode: "variant",
  revision: 3,
  optionGroups: [
    {
      id: "size",
      name: "Size",
      required: true,
      values: [
        { id: "queen", label: "Queen" },
        { id: "king", label: "King" },
      ],
    },
  ],
  variants: [
    {
      id: "bed-q",
      name: "Queen",
      sku: "BED-Q",
      optionValueIds: ["queen"],
      retailPriceCents: 240000,
      tradePriceCents: 150000,
      leadTimeWeeks: 9,
      dimensions: { width: "64 in", length: "86 in" },
    },
    {
      id: "bed-k",
      name: "King",
      sku: "BED-K",
      optionValueIds: ["king"],
      retailPriceCents: 280000,
      tradePriceCents: 175000,
      leadTimeWeeks: 10,
      dimensions: { width: "80 in", length: "86 in" },
    },
  ],
  components: [],
  rules: [],
};

function authoritative(
  selection: PieceConfigurationSelectionView,
  overrides: Partial<AuthoritativeConfigurationResolution> = {},
): AuthoritativeConfigurationResolution {
  return {
    selectionKey: selectionKey(selection),
    valid: true,
    complete: true,
    errors: [],
    warnings: [],
    retailPriceCents: 240000,
    tradePriceCents: 150000,
    leadTimeWeeks: 9,
    dimensions: { width: "64 in", length: "86 in" },
    matchedVariant: { id: "bed-q", sku: "BED-Q" },
    snapshot: { schemaRevision: 3 },
    ...overrides,
  };
}

describe("PieceConfigurationWorkspace", () => {
  it("resolves a finite bed size to its exact SKU, dimensions, and price", () => {
    render(
      <PieceConfigurationWorkspace
        piece={bed}
        definition={bedDefinition}
        readOnly
        authoritativeResolution={authoritative({
          optionValueIds: ["queen"],
          components: [],
        })}
        onPlace={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Queen/i }));

    expect(screen.getByText("$2,400")).toBeInTheDocument();
    expect(screen.getByText("BED-Q")).toBeInTheDocument();
    expect(screen.getByText(/Width 64 in · Length 86 in/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeEnabled();
  });

  it("composes sectional parts, requires handedness, and prices the assembly without the family base", () => {
    const sectional: FlatPieceConfigurationSource = {
      id: "sectional-1",
      name: "Hearth Sectional",
      configurationMode: "configured",
      priceRetailCents: 100000,
      leadTimeWeeks: 8,
    };
    const definition: PieceConfigurationDefinitionView = {
      productId: sectional.id,
      mode: "configured",
      revision: 2,
      pricingStrategy: "component_sum",
      optionGroups: [],
      variants: [],
      rules: [],
      components: [
        {
          id: "chaise",
          name: "Chaise end",
          sku: "CHAISE",
          retailPriceCents: 180000,
          minQuantity: 0,
          maxQuantity: 1,
          defaultQuantity: 0,
          handedness: "either",
        },
        {
          id: "armless",
          name: "Armless seat",
          sku: "ARMLESS",
          retailPriceCents: 90000,
          minQuantity: 0,
          maxQuantity: 4,
          defaultQuantity: 0,
          handedness: "none",
        },
      ],
    };

    render(
      <PieceConfigurationWorkspace
        piece={sectional}
        definition={definition}
        readOnly
        authoritativeResolution={authoritative(
          {
            optionValueIds: [],
            components: [
              { componentId: "chaise", quantity: 1, handedness: "right" },
              { componentId: "armless", quantity: 2, handedness: null },
            ],
          },
          {
            retailPriceCents: 360000,
            tradePriceCents: null,
            leadTimeWeeks: 8,
            dimensions: null,
            matchedVariant: null,
          },
        )}
        onPlace={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add one Chaise end" }));
    expect(
      screen.getByText("Chaise end needs a left or right side."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Chaise end handedness" }),
      { target: { value: "right" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add one Armless seat" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add one Armless seat" }),
    );

    expect(screen.getByText("$3,600")).toBeInTheDocument();
    expect(screen.queryByText("$4,600")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeEnabled();
  });

  it("blocks an incompatible table material and finish until the choice is corrected", () => {
    const table: FlatPieceConfigurationSource = {
      id: "table-1",
      name: "Workshop Table",
      configurationMode: "configured",
      priceRetailCents: 300000,
      leadTimeWeeks: 10,
    };
    const definition: PieceConfigurationDefinitionView = {
      productId: table.id,
      mode: "configured",
      revision: 5,
      optionGroups: [
        {
          id: "material",
          name: "Material",
          required: true,
          values: [
            { id: "oak", label: "White oak" },
            {
              id: "walnut",
              label: "Walnut",
              retailPriceDeltaCents: 45000,
              leadTimeDeltaWeeks: 2,
            },
          ],
        },
        {
          id: "finish",
          name: "Finish",
          required: true,
          values: [
            { id: "oil", label: "Hand-rubbed oil" },
            { id: "whitewash", label: "Whitewash" },
          ],
        },
      ],
      variants: [],
      components: [],
      rules: [
        {
          id: "walnut-whitewash",
          kind: "excludes",
          sourceValueId: "walnut",
          targetValueId: "whitewash",
          message: "Walnut is not offered with the whitewash finish.",
        },
      ],
    };

    render(
      <PieceConfigurationWorkspace
        piece={table}
        definition={definition}
        readOnly
        authoritativeResolution={authoritative(
          {
            optionValueIds: ["walnut", "oil"],
            components: [],
          },
          {
            retailPriceCents: 345000,
            tradePriceCents: null,
            leadTimeWeeks: 12,
            dimensions: null,
            matchedVariant: null,
          },
        )}
        onPlace={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Walnut/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Whitewash/i }));

    expect(
      screen.getByText("Walnut is not offered with the whitewash finish."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Hand-rubbed oil/i }));

    expect(
      screen.queryByText("Walnut is not offered with the whitewash finish."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("$3,450")).toBeInTheDocument();
    expect(screen.getByText("12 weeks")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeEnabled();
  });

  it("requires fresh server confirmation, evaluates defaults, saves incomplete work, and places by saved id", async () => {
    const onEvaluate = jest.fn();
    const onSaveConfiguration = jest
      .fn()
      .mockResolvedValue({ id: "saved-bed-1" });
    const onPlace = jest.fn().mockResolvedValue(undefined);
    const targetSelection = { optionValueIds: ["queen"], components: [] };

    const { rerender } = render(
      <PieceConfigurationWorkspace
        piece={bed}
        definition={bedDefinition}
        readOnly
        onEvaluate={onEvaluate}
        onSaveConfiguration={onSaveConfiguration}
        onPlace={onPlace}
      />,
    );

    expect(onEvaluate).toHaveBeenCalledWith({
      optionValueIds: [],
      components: [],
    });
    expect(
      screen.getByRole("button", { name: "Save for later" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save for later" }));
    await waitFor(() => expect(onSaveConfiguration).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("radio", { name: /Queen/i }));
    expect(
      screen.getByRole("button", { name: "Add configured piece" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Waiting for maker-rule check"),
    ).toBeInTheDocument();

    rerender(
      <PieceConfigurationWorkspace
        piece={bed}
        definition={bedDefinition}
        readOnly
        authoritativeResolution={authoritative(targetSelection)}
        onEvaluate={onEvaluate}
        onSaveConfiguration={onSaveConfiguration}
        onPlace={onPlace}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add configured piece" }),
    );
    await waitFor(() =>
      expect(onPlace).toHaveBeenCalledWith(
        "saved-bed-1",
        expect.objectContaining({ valid: true, complete: true }),
        { schemaRevision: 3 },
      ),
    );
  });
});
