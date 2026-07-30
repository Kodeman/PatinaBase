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
