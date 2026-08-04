import type {
  ProductConfigurationDefinition,
  SavedProductConfiguration,
} from "@patina/types";
import {
  comDetailsToView,
  comDetailsViewToInput,
  configurationDefinitionToView,
  configurationDraftToSaveInput,
  configurationViewToUpsertInput,
  pieceRoomConfigurationRows,
  savedConfigurationToView,
} from "./piece-configuration-adapter";
import { EMPTY_COM_DETAILS } from "./piece-configuration-model";

const productId = "10000000-0000-4000-8000-000000000001";
const groupId = "10000000-0000-4000-8000-000000000002";
const activeValueId = "10000000-0000-4000-8000-000000000003";
const inactiveValueId = "10000000-0000-4000-8000-000000000004";
const activeComponentId = "10000000-0000-4000-8000-000000000005";
const inactiveComponentId = "10000000-0000-4000-8000-000000000006";

const definition = {
  productId,
  productName: "Field Sectional",
  mode: "configured",
  pricingStrategy: "component_sum",
  revision: 4,
  optionGroups: [
    {
      id: groupId,
      productId,
      code: "upholstery",
      name: "Upholstery",
      selectionType: "single",
      required: true,
      minSelections: 1,
      maxSelections: 1,
      position: 0,
      values: [
        {
          id: activeValueId,
          groupId,
          code: "linen",
          label: "Oatmeal linen",
          retailPriceDeltaCents: 0,
          tradePriceDeltaCents: 0,
          leadTimeDeltaWeeks: 0,
          metadata: {},
          position: 0,
          isActive: true,
        },
        {
          id: inactiveValueId,
          groupId,
          code: "velvet-old",
          label: "Archived velvet",
          retailPriceDeltaCents: 10_000,
          tradePriceDeltaCents: 6_000,
          leadTimeDeltaWeeks: 1,
          metadata: { archivedReason: "mill discontinued" },
          position: 1,
          isActive: false,
        },
      ],
    },
  ],
  variants: [],
  components: [
    {
      id: activeComponentId,
      productId,
      code: "seat",
      name: "Armless seat",
      componentType: "module",
      handedness: "none",
      minQuantity: 0,
      maxQuantity: 4,
      defaultQuantity: 0,
      retailPriceCents: 90_000,
      tradePriceCents: 60_000,
      leadTimeWeeks: 8,
      metadata: {},
      position: 0,
      isActive: true,
    },
    {
      id: inactiveComponentId,
      productId,
      code: "corner-old",
      name: "Archived corner",
      componentType: "module",
      handedness: "none",
      minQuantity: 0,
      maxQuantity: 1,
      defaultQuantity: 0,
      retailPriceCents: 110_000,
      tradePriceCents: 72_000,
      leadTimeWeeks: 8,
      metadata: { archivedReason: "replaced" },
      position: 1,
      isActive: false,
    },
  ],
  rules: [],
} satisfies ProductConfigurationDefinition;

describe("piece configuration adapter integrity", () => {
  it("preserves inactive option values and components during an authoring round trip", () => {
    const view = configurationDefinitionToView(definition, {
      id: productId,
      name: "Field Sectional",
    });

    expect(view.optionGroups[0].values).toHaveLength(2);
    expect(view.components).toHaveLength(2);

    const input = configurationViewToUpsertInput(view, definition);
    expect(input.optionGroups[0].values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: inactiveValueId, isActive: false }),
      ]),
    );
    expect(input.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: inactiveComponentId, isActive: false }),
      ]),
    );
  });

  it("drops structures that are incompatible with the selected offering mode", () => {
    const configured = configurationDefinitionToView(definition, {
      id: productId,
      name: "Field Sectional",
    });
    const input = configurationViewToUpsertInput(
      { ...configured, mode: "standard" },
      definition,
    );

    expect(input).toMatchObject({
      mode: "standard",
      pricingStrategy: "base_plus_adjustments",
      optionGroups: [],
      variants: [],
      components: [],
      rules: [],
    });
  });

  it("loads persisted option UUIDs rather than evaluator codes", () => {
    const saved = {
      id: "20000000-0000-4000-8000-000000000001",
      version: 3,
      schemaRevision: 3,
      status: "saved",
      name: "Living room approval",
      evaluation: {
        normalizedSelection: { upholstery: ["linen"] },
        componentQuantities: { [activeComponentId]: 2 },
      },
      snapshot: {
        selections: [{ optionValueId: activeValueId }],
        components: [
          {
            componentId: activeComponentId,
            quantity: 2,
            handedness: null,
          },
        ],
      },
    } as unknown as SavedProductConfiguration;

    expect(savedConfigurationToView(saved)).toMatchObject({
      id: saved.id,
      version: 3,
      selection: {
        optionValueIds: [activeValueId],
        components: [
          {
            componentId: activeComponentId,
            quantity: 2,
            handedness: null,
          },
        ],
      },
    });
    expect(savedConfigurationToView(saved, 4).sourceChanged).toBe(true);
  });

  it("translates first-save variant temp ids into stable option codes", () => {
    const input = configurationViewToUpsertInput({
      productId,
      mode: "variant",
      revision: 1,
      optionGroups: [
        {
          id: "draft-group-size",
          code: "size",
          name: "Size",
          required: true,
          selectionType: "single",
          values: [
            {
              id: "draft-value-queen",
              code: "queen",
              label: "Queen",
            },
          ],
        },
      ],
      variants: [
        {
          id: "draft-variant-queen",
          name: "Queen",
          sku: "BED-Q",
          optionValueIds: ["draft-value-queen"],
        },
      ],
      components: [],
      rules: [],
    });

    expect(input.variants[0].optionValueIds).toEqual(["size:queen"]);
  });

  it("round-trips the COM flag and the maker's requirements through authoring", () => {
    const comDefinition = {
      ...definition,
      optionGroups: [
        {
          ...definition.optionGroups[0],
          values: [
            {
              ...definition.optionGroups[0].values[0],
              allowsCom: true,
              comRequirements: {
                yardage: "14 yds",
                notes: "Railroaded",
                // A key this editor never shows — it must survive an edit.
                backing: "knit",
              },
            },
            definition.optionGroups[0].values[1],
          ],
        },
      ],
    } as unknown as ProductConfigurationDefinition;

    const view = configurationDefinitionToView(comDefinition, {
      id: productId,
      name: "Field Sectional",
    });
    expect(view.optionGroups[0].values[0]).toMatchObject({
      allowsCom: true,
      comRequirements: { yardage: "14 yds", notes: "Railroaded" },
    });
    expect(view.optionGroups[0].values[1].allowsCom).toBe(false);

    const edited = {
      ...view,
      optionGroups: [
        {
          ...view.optionGroups[0],
          values: [
            {
              ...view.optionGroups[0].values[0],
              comRequirements: { yardage: "18 yds", notes: "Railroaded" },
            },
            view.optionGroups[0].values[1],
          ],
        },
      ],
    };
    const input = configurationViewToUpsertInput(edited, comDefinition);
    expect(input.optionGroups[0].values[0]).toMatchObject({
      allowsCom: true,
      comRequirements: {
        yardage: "18 yds",
        notes: "Railroaded",
        backing: "knit",
      },
    });
    expect(input.optionGroups[0].values[1]).toMatchObject({
      allowsCom: false,
      comRequirements: {},
    });
  });

  it("narrows the COM form to the wire shape and restores it from a snapshot", () => {
    expect(comDetailsViewToInput(EMPTY_COM_DETAILS)).toBeNull();
    expect(
      comDetailsViewToInput({
        ...EMPTY_COM_DETAILS,
        optionValueId: activeValueId,
        fabricName: "  Belgian Linen 12  ",
        mill: "Rogers & Goffigon",
        yardage: "14",
        railroaded: true,
        secondLeadTimeWeeks: "4",
      }),
    ).toEqual({
      optionValueId: activeValueId,
      fabricName: "Belgian Linen 12",
      mill: "Rogers & Goffigon",
      yardage: "14",
      railroaded: true,
      secondLeadTimeWeeks: 4,
    });

    expect(
      comDetailsToView({
        optionValueId: activeValueId,
        fabricName: "Mohair Velvet",
        yardage: 18,
        railroaded: false,
      }),
    ).toMatchObject({
      optionValueId: activeValueId,
      fabricName: "Mohair Velvet",
      yardage: "18",
      railroaded: false,
      notes: "",
    });
    expect(comDetailsToView(null)).toBeNull();
    expect(comDetailsToView({})).toBeNull();
  });

  it("carries the COM fabric into the save input, but never on a standard piece", () => {
    const view = configurationDefinitionToView(definition, {
      id: productId,
      name: "Field Sectional",
    });
    const draft = {
      name: null,
      notes: null,
      customRequirements: null,
      selection: { optionValueIds: [activeValueId], components: [] },
      comDetails: {
        ...EMPTY_COM_DETAILS,
        optionValueId: activeValueId,
        fabricName: "Belgian Linen 12",
      },
    };

    expect(
      configurationDraftToSaveInput({
        piece: { id: productId, name: "Field Sectional" },
        definition: view,
        draft,
      }).comDetails,
    ).toEqual({
      optionValueId: activeValueId,
      fabricName: "Belgian Linen 12",
    });

    expect(
      configurationDraftToSaveInput({
        piece: { id: productId, name: "Field Sectional" },
        definition: { ...view, mode: "standard" },
        draft,
      }).comDetails,
    ).toBeUndefined();
  });

  it("reopens a saved specification with its COM fabric still filled in", () => {
    const saved = {
      id: "20000000-0000-4000-8000-000000000009",
      version: 2,
      schemaRevision: 4,
      status: "saved",
      name: "Living room COM",
      snapshot: {
        selections: [{ optionValueId: activeValueId }],
        components: [],
        comDetails: {
          optionValueId: activeValueId,
          fabricName: "Belgian Linen 12",
          mill: "Rogers & Goffigon",
          railroaded: true,
        },
      },
    } as unknown as SavedProductConfiguration;

    expect(savedConfigurationToView(saved).comDetails).toMatchObject({
      optionValueId: activeValueId,
      fabricName: "Belgian Linen 12",
      mill: "Rogers & Goffigon",
      railroaded: true,
    });
  });

  it("hides bound project copies except for the exact line being revised", () => {
    const reusable = {
      id: "reusable-configuration",
      projectId: null,
    } as unknown as SavedProductConfiguration;
    const projectCopy = {
      id: "project-copy",
      projectId: "project-1",
      ffeItemId: "ffe-1",
    } as unknown as SavedProductConfiguration;

    expect(pieceRoomConfigurationRows([reusable, projectCopy])).toEqual([
      reusable,
    ]);
    expect(
      pieceRoomConfigurationRows([reusable, projectCopy], projectCopy),
    ).toEqual([reusable, projectCopy]);
  });
});
