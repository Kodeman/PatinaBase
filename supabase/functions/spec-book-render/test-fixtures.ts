import type { FrozenSnapshot } from "./render-model.ts";

export function frozenSnapshot(
  overrides: Partial<FrozenSnapshot> = {},
): FrozenSnapshot {
  return {
    contractVersion: 1,
    book: {
      id: "10000000-0000-4000-8000-000000000001",
      title: "Middlewest Residence Spec Book",
    },
    project: {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Maple Residence",
      clientName: "Avery Client",
    },
    template: {
      name: "Residential",
      version: 1,
      branding: {
        studioName: "Middlewest Studio",
        primaryColor: "#2C2926",
      },
      audience_profiles: {
        client: {
          allow: [
            "identity",
            "selection",
            "dimensions",
            "quantity",
            "selectedMedia",
            "clientPrice",
            "clientNotes",
            "care",
            "warranty",
          ],
        },
        vendor: {
          allow: [
            "identity",
            "selection",
            "dimensions",
            "quantity",
            "selectedMedia",
            "vendorNotes",
          ],
        },
        installer: {
          allow: [
            "identity",
            "location",
            "selection",
            "dimensions",
            "quantity",
            "selectedMedia",
            "installNotes",
          ],
        },
        internal: { allow: ["*"] },
        care: { allow: ["identity", "selectedMedia", "care", "warranty"] },
      },
      layout_settings: { paper: "letter", marginInches: 0.5 },
    },
    chapters: [
      {
        id: "living",
        projectRoomId: "room-living",
        title: "Living Room",
        position: 1,
      },
      {
        id: "bedroom",
        projectRoomId: "room-bedroom",
        title: "Primary Bedroom",
        position: 2,
      },
    ],
    items: [
      {
        ffeItemId: "item-b",
        documentCode: "PB-201",
        name: "Console",
        itemType: "fixed",
        room: { id: "room-bedroom", name: "Primary Bedroom" },
        quantity: 1,
        selectedMedia: [{
          url: "https://images.example.test/console.jpg",
          alt: "Console",
        }],
        selection: {
          finish: {
            value: "Ebonized oak",
            source: "project_override",
            verifiedAt: "2026-07-30T15:05:00Z",
          },
          material: { value: "Oak", source: "product_master" },
          dimensions: { value: "60 × 18 × 30 in", source: "product_master" },
          exactLocation: { value: "West wall", source: "project_override" },
        },
        notes: {
          client: "Approved at design review.",
          trade: "Match approved control sample.",
          install: "Center on wall and level.",
          private: "PRIVATE-ONLY discount exception",
          procurement: "PROCUREMENT-ONLY hold until deposit",
          care: "Dust with a soft cloth",
          warranty: "Two years",
        },
        pricing: {
          clientPriceCents: 12345,
          tradePriceCents: 8000,
          markupPercent: 1.54,
        },
        vendor: {
          name: "Example Workshop",
          sku: "EW-600",
          internalContact: "INTERNAL-CONTACT jordan@example.test",
        },
        contentHash: "hash-b",
      },
      {
        ffeItemId: "item-a",
        documentCode: "LR-101",
        name: "Lounge Chair",
        itemType: "fixed",
        room: { id: "room-living", name: "Living Room" },
        quantity: 2,
        selectedMedia: [],
        selection: { finish: { value: "Natural walnut" } },
        contentHash: "hash-a",
      },
    ],
    allowances: [
      {
        ffeItemId: "allowance-1",
        documentCode: "LR-102",
        name: "Decorative Lighting Allowance",
        itemType: "allowance",
        room: { id: "room-living", name: "Living Room" },
        quantity: 1,
        pricing: { clientPriceCents: 200000 },
        contentHash: "hash-allowance",
      },
    ],
    tbd: [
      {
        ffeItemId: "tbd-1",
        documentCode: "PB-202",
        name: "Bedside Sconce",
        itemType: "tbd",
        room: { id: "room-bedroom", name: "Primary Bedroom" },
        quantity: 2,
        contentHash: "hash-tbd",
      },
    ],
    audiences: ["client", "vendor", "installer", "internal", "care"],
    issue: { type: "full", reason: null, baseRevisionId: null },
    ...overrides,
  };
}

// A frozen configuration envelope in the shape 00403 emits: labels, variant,
// components and dimensions alongside pricing the client must never see.
export function configuredFurniture(
  overrides: {
    woodLabel?: string;
    priceBump?: number;
    comDetails?: Record<string, unknown>;
  } = {},
) {
  const { woodLabel = "Walnut", priceBump = 0, comDetails } = overrides;
  return {
    id: "40000000-0000-4000-8000-000000000002",
    snapshot: {
      productId: "50000000-0000-4000-8000-000000000001",
      productName: "Ellsworth Sectional",
      configurationMode: "configured",
      pricingStrategy: "delta",
      schemaRevision: 1,
      variant: {
        id: "60000000-0000-4000-8000-000000000001",
        code: "96-lc",
        name: '96" Left Chaise',
        sku: "ELL-96-LC",
        vendorSku: "VND-ELL-96-LC",
        retailPriceCents: 1_240_000 + priceBump,
        tradePriceCents: 868_000 + priceBump,
        leadTimeWeeks: 14,
      },
      selections: [
        {
          optionGroupId: "70000000-0000-4000-8000-000000000001",
          optionValueId: "80000000-0000-4000-8000-000000000001",
          groupCode: "wood",
          valueCode: woodLabel.toLowerCase().replace(/\s+/g, "-"),
          groupName: "Wood",
          valueLabel: woodLabel,
          retailPriceDeltaCents: 42_000 + priceBump,
          tradePriceDeltaCents: 29_400 + priceBump,
          leadTimeDeltaWeeks: 2,
          allowsCom: true,
        },
        {
          optionGroupId: "70000000-0000-4000-8000-000000000002",
          optionValueId: "80000000-0000-4000-8000-000000000002",
          groupCode: "leather",
          valueCode: "chestnut",
          groupName: "Leather",
          valueLabel: "Chestnut",
          retailPriceDeltaCents: 0,
          tradePriceDeltaCents: 0,
          leadTimeDeltaWeeks: 0,
          allowsCom: false,
        },
      ],
      components: [
        {
          componentId: "90000000-0000-4000-8000-000000000001",
          code: "left-chaise",
          name: "Left arm chaise",
          quantity: 1,
          handedness: "left",
          retailPriceCents: 620_000 + priceBump,
          tradePriceCents: 434_000 + priceBump,
          leadTimeWeeks: 14,
        },
        {
          componentId: "90000000-0000-4000-8000-000000000002",
          code: "armless-loveseat",
          name: "Armless loveseat",
          quantity: 2,
          handedness: null,
          retailPriceCents: 310_000 + priceBump,
          tradePriceCents: 217_000 + priceBump,
          leadTimeWeeks: 14,
        },
      ],
      retailPriceCents: 1_282_000 + priceBump,
      tradePriceCents: 897_400 + priceBump,
      leadTimeWeeks: 16,
      dimensions: { width: 96, depth: 40, height: 31, unit: "in" },
      capturedAt: "2026-08-02T12:00:00.000Z",
      ...(comDetails ? { comDetails } : {}),
    },
    snapshotHash: `cfg-${woodLabel}-${priceBump}`,
    lockedAt: "2026-08-02T12:05:00.000Z",
  };
}
