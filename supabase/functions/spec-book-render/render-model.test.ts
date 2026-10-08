// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  alsoInText,
  buildAudienceRenderModel,
  canonicalStringify,
  MAX_RENDER_ITEMS,
  quantityText,
  RenderModelError,
  sha256Hex,
  SPEC_BOOK_AUDIENCES,
} from "./render-model.ts";
import {
  configuredFurniture,
  frozenSnapshot,
  piecesItems,
} from "./test-fixtures.ts";

const context = {
  revisionNumber: 1,
  createdAt: "2026-07-30T15:05:00.000Z",
} as const;

function furnitureConfiguration(
  retailPriceCents: number,
  tradePriceCents: number,
) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    snapshot: {
      mode: "custom",
      evaluation: {
        retailPriceCents,
        tradePriceCents,
      },
      customCommission: {
        quote: {
          retailPriceCents,
          tradePriceCents,
          leadTimeWeeks: 14,
        },
      },
    },
    snapshotHash: `configuration-${retailPriceCents}-${tradePriceCents}`,
    lockedAt: "2026-07-30T15:05:00.000Z",
  };
}

Deno.test("audience allow-lists remove private procurement and cost fields", async () => {
  const forbiddenKeys = [
    "tradepricecents",
    "markup",
    "privatenotes",
    "internalvendorcontact",
    "procurementcommentary",
  ];
  for (
    const audience of SPEC_BOOK_AUDIENCES.filter((entry) =>
      entry !== "internal"
    )
  ) {
    const model = await buildAudienceRenderModel(
      frozenSnapshot(),
      audience,
      context,
    );
    const serialized = JSON.stringify(model).toLowerCase().replaceAll("_", "");
    for (const forbidden of forbiddenKeys) {
      assertEquals(
        serialized.includes(forbidden),
        false,
        `${audience} leaked ${forbidden}`,
      );
    }
    assertEquals(serialized.includes("private-only"), false);
    assertEquals(serialized.includes("procurement-only"), false);
    assertEquals(serialized.includes("internal-contact"), false);
  }
});

Deno.test("client receives deliberate client price while other external audiences do not", async () => {
  const client = await buildAudienceRenderModel(
    frozenSnapshot(),
    "client",
    context,
  );
  const vendor = await buildAudienceRenderModel(
    frozenSnapshot(),
    "vendor",
    context,
  );
  const installer = await buildAudienceRenderModel(
    frozenSnapshot(),
    "installer",
    context,
  );
  const care = await buildAudienceRenderModel(
    frozenSnapshot(),
    "care",
    context,
  );

  assertEquals(client.items[1].commercial.clientPriceCents, 12345);
  assertEquals(vendor.items[1].commercial, {});
  assertEquals(installer.items[1].commercial, {});
  assertEquals(care.items[1].commercial, {});
  assertEquals(vendor.allowances, []);
  assertEquals(installer.tbd, []);
  assertEquals(vendor.items[1].notes.vendor, "Match approved control sample.");
  assertEquals(installer.items[1].notes.install, "Center on wall and level.");
  assertEquals(care.items[1].selection.care, "Dust with a soft cloth");
});

Deno.test("internal edition keeps the complete frozen item", async () => {
  const model = await buildAudienceRenderModel(
    frozenSnapshot(),
    "internal",
    context,
  );
  const consoleItem = model.items.find((item) => item.id === "item-b")!;
  assertEquals(
    (consoleItem.raw?.pricing as Record<string, unknown>).tradePriceCents,
    8000,
  );
  assertEquals(consoleItem.notes.private, "PRIVATE-ONLY discount exception");
  assertEquals(
    consoleItem.vendor.internalContact,
    "INTERNAL-CONTACT jordan@example.test",
  );
});

Deno.test("furniture configuration reaches the client edition as labels only", async () => {
  const source = frozenSnapshot();
  const configuration = configuredFurniture();
  const snapshot = frozenSnapshot({
    items: [{ ...source.items[0], configuration }, source.items[1]],
  });

  const client = await buildAudienceRenderModel(snapshot, "client", context);
  const configured = client.items.find((item) => item.id === "item-b")!;
  assertEquals(configured.configuration, {
    selections: [
      { group: "Wood", value: "Walnut" },
      { group: "Leather", value: "Chestnut" },
    ],
    variantName: '96" Left Chaise',
    components: [
      { name: "Left arm chaise", quantity: 1 },
      { name: "Armless loveseat", quantity: 2 },
    ],
    dimensions: { width: 96, depth: 40, height: 31, unit: "in" },
  });
  assertEquals(
    client.items.find((item) => item.id === "item-a")?.configuration,
    undefined,
  );

  const clientSerialized = JSON.stringify(client);
  for (
    const forbidden of [
      '"retailPriceCents"',
      '"tradePriceCents"',
      '"retailPriceDeltaCents"',
      '"tradePriceDeltaCents"',
      '"markup"',
      '"snapshot"',
      '"snapshotHash"',
      '"lockedAt"',
      '"vendorSku"',
      '"capturedAt"',
      '"mill"',
      '"shipTo"',
      '"sidemark"',
      "1240000",
      "868000",
    ]
  ) {
    assertEquals(
      clientSerialized.includes(forbidden),
      false,
      `client leaked ${forbidden}`,
    );
  }

  for (const audience of ["vendor", "installer", "care"] as const) {
    const model = await buildAudienceRenderModel(snapshot, audience, context);
    assertEquals(
      JSON.stringify(model).includes("configuration"),
      false,
      `${audience} leaked the configuration snapshot`,
    );
  }

  const internal = await buildAudienceRenderModel(
    snapshot,
    "internal",
    context,
  );
  const consoleItem = internal.items.find((item) => item.id === "item-b")!;
  assertEquals(consoleItem.raw?.configuration, configuration);
  assertEquals(consoleItem.configuration, undefined);
});

Deno.test("custom-commission configuration exposes no client summary or pricing", async () => {
  const source = frozenSnapshot();
  const configuration = furnitureConfiguration(4_120_000, 3_184_000);
  const snapshot = frozenSnapshot({
    items: [{ ...source.items[0], configuration }, source.items[1]],
  });

  for (const audience of ["client", "vendor", "installer", "care"] as const) {
    const model = await buildAudienceRenderModel(snapshot, audience, context);
    const serialized = JSON.stringify(model);
    assertEquals(
      serialized.includes('"retailPriceCents"'),
      false,
      `${audience} leaked configuration retail pricing`,
    );
    assertEquals(
      serialized.includes('"tradePriceCents"'),
      false,
      `${audience} leaked configuration trade pricing`,
    );
  }
  const client = await buildAudienceRenderModel(snapshot, "client", context);
  assertEquals(
    client.items.find((item) => item.id === "item-b")?.configuration,
    undefined,
  );
});

Deno.test("client configuration summary keeps the COM fabric and drops vendor operations", async () => {
  const source = frozenSnapshot();
  const configuration = configuredFurniture({
    comDetails: {
      optionValueId: "80000000-0000-4000-8000-000000000001",
      fabricName: "Highland Linen 12",
      mill: "Rogers Mill",
      pattern: "Chalk",
      yardage: 18.5,
      railroaded: true,
      shipTo: "Receiving dock four",
      sidemark: "MAPLE / CONSOLE",
      secondLeadTimeWeeks: 6,
      notes: "Reserve from stock",
    },
  });
  const snapshot = frozenSnapshot({
    items: [{ ...source.items[0], configuration }, source.items[1]],
  });

  const client = await buildAudienceRenderModel(snapshot, "client", context);
  const configured = client.items.find((item) => item.id === "item-b")!;
  assertEquals(configured.configuration?.comFabric, "Highland Linen 12");

  const serialized = JSON.stringify(client);
  for (
    const forbidden of [
      '"mill"',
      '"shipTo"',
      '"sidemark"',
      '"yardage"',
      '"railroaded"',
      '"secondLeadTimeWeeks"',
      "Rogers Mill",
      "Receiving dock four",
      "MAPLE / CONSOLE",
      "Reserve from stock",
    ]
  ) {
    assertEquals(
      serialized.includes(forbidden),
      false,
      `client leaked ${forbidden}`,
    );
  }

  for (const audience of ["vendor", "installer", "care"] as const) {
    const model = await buildAudienceRenderModel(snapshot, audience, context);
    assertEquals(
      JSON.stringify(model).includes("Highland Linen 12"),
      false,
      `${audience} leaked the COM fabric`,
    );
  }
});

Deno.test("items sort deterministically by chapter, position, then id", async () => {
  const model = await buildAudienceRenderModel(
    frozenSnapshot(),
    "client",
    context,
  );
  assertEquals(model.items.map((item) => item.id), ["item-a", "item-b"]);
  assertEquals(model.items.map((item) => item.chapterId), [
    "living",
    "bedroom",
  ]);
  assertEquals(model.items.map((item) => item.roomName), [
    "Living Room",
    "Primary Bedroom",
  ]);
  const one = canonicalStringify(model);
  const two = canonicalStringify(
    await buildAudienceRenderModel(frozenSnapshot(), "client", context),
  );
  assertEquals(one, two);
  assertEquals(await sha256Hex(one), await sha256Hex(two));
});

Deno.test("addendum includes only added and changed current items plus removed ledger rows", async () => {
  const base = frozenSnapshot();
  const current = frozenSnapshot({
    issue: {
      type: "addendum",
      reason: "Finish revision",
      baseRevisionId: "30000000-0000-4000-8000-000000000001",
    },
    items: [
      {
        ...base.items[0],
        selection: {
          ...(base.items[0].selection as Record<string, unknown>),
          finish: { value: "Oxidized oak" },
        },
        contentHash: "hash-b-revised",
      },
      {
        id: "item-c",
        chapterId: "living",
        position: 3,
        documentCode: "LR-103",
        name: "Floor Lamp",
        contentHash: "hash-c",
      },
    ],
    allowances: [{
      ...base.allowances[0],
      pricing: { clientPriceCents: 250000 },
      contentHash: "hash-allowance-revised",
    }],
    tbd: [],
  });
  const model = await buildAudienceRenderModel(
    current,
    "client",
    { ...context, revisionNumber: 2, issueType: "addendum" },
    base,
  );

  assertEquals(model.items.map((item) => item.id), ["item-c", "item-b"]);
  assertEquals(model.allowances.map((item) => item.id), ["allowance-1"]);
  assertEquals(model.tbd, []);
  assertEquals(model.changes, [
    {
      id: "item-a",
      documentCode: "LR-101",
      name: "Lounge Chair",
      kind: "removed",
    },
    {
      id: "allowance-1",
      documentCode: "LR-102",
      name: "Decorative Lighting Allowance",
      kind: "changed",
    },
    { id: "item-c", documentCode: "LR-103", name: "Floor Lamp", kind: "added" },
    { id: "item-b", documentCode: "PB-201", name: "Console", kind: "changed" },
    {
      id: "tbd-1",
      documentCode: "PB-202",
      name: "Bedside Sconce",
      kind: "removed",
    },
  ]);
});

Deno.test("external addenda ignore private-only changes and expose audience-safe hashes", async () => {
  const base = frozenSnapshot();
  const currentItem = {
    ...base.items[0],
    notes: {
      ...(base.items[0].notes as Record<string, unknown>),
      private: "PRIVATE-ONLY revised discount exception",
      procurement: "PROCUREMENT-ONLY revised deposit instruction",
    },
    pricing: {
      ...(base.items[0].pricing as Record<string, unknown>),
      tradePriceCents: 7654,
      markupPercent: 1.61,
    },
    vendor: {
      ...(base.items[0].vendor as Record<string, unknown>),
      internalContact: "INTERNAL-CONTACT revised@example.test",
    },
    contentHash: "hash-b-private-revised",
  };
  const current = frozenSnapshot({
    issue: {
      type: "addendum",
      reason: "Internal procurement update",
      baseRevisionId: "30000000-0000-4000-8000-000000000001",
    },
    items: [currentItem, base.items[1]],
  });

  const [baseClient, clientAddendum, internalAddendum] = await Promise.all([
    buildAudienceRenderModel(base, "client", context),
    buildAudienceRenderModel(
      current,
      "client",
      { ...context, revisionNumber: 2, issueType: "addendum" },
      base,
    ),
    buildAudienceRenderModel(
      current,
      "internal",
      { ...context, revisionNumber: 2, issueType: "addendum" },
      base,
    ),
  ]);

  assertEquals(clientAddendum.items, []);
  assertEquals(clientAddendum.changes, []);
  assertEquals(
    baseClient.items.find((item) => item.id === "item-b")?.contentHash,
    (
      await buildAudienceRenderModel(
        current,
        "client",
        { ...context, revisionNumber: 2, issueType: "full" },
      )
    ).items.find((item) => item.id === "item-b")?.contentHash,
  );
  assertEquals(internalAddendum.items.map((item) => item.id), ["item-b"]);
  assertEquals(internalAddendum.changes, [{
    id: "item-b",
    documentCode: "PB-201",
    name: "Console",
    kind: "changed",
  }]);
});

Deno.test("configuration pricing-only changes create an internal addendum change only", async () => {
  const source = frozenSnapshot();
  const base = frozenSnapshot({
    items: [{
      ...source.items[0],
      configuration: furnitureConfiguration(4_120_000, 3_184_000),
      contentHash: "hash-b-configuration-pricing-v1",
    }, source.items[1]],
  });
  const current = frozenSnapshot({
    issue: {
      type: "addendum",
      reason: "Configuration quote update",
      baseRevisionId: "30000000-0000-4000-8000-000000000001",
    },
    items: [{
      ...source.items[0],
      configuration: furnitureConfiguration(4_260_000, 3_275_000),
      contentHash: "hash-b-configuration-pricing-v2",
    }, source.items[1]],
  });
  const addendumContext = {
    ...context,
    revisionNumber: 2,
    issueType: "addendum",
  } as const;

  for (const audience of ["client", "vendor", "installer", "care"] as const) {
    const addendum = await buildAudienceRenderModel(
      current,
      audience,
      addendumContext,
      base,
    );
    assertEquals(addendum.items, [], `${audience} received a pricing addendum`);
    assertEquals(
      addendum.changes,
      [],
      `${audience} received a pricing change ledger entry`,
    );
  }

  const internal = await buildAudienceRenderModel(
    current,
    "internal",
    addendumContext,
    base,
  );
  assertEquals(internal.items.map((item) => item.id), ["item-b"]);
  assertEquals(internal.changes, [{
    id: "item-b",
    documentCode: "PB-201",
    name: "Console",
    kind: "changed",
  }]);
});

Deno.test("labelled configuration price moves leave every client hash untouched", async () => {
  const source = frozenSnapshot();
  const base = frozenSnapshot({
    items: [{
      ...source.items[0],
      configuration: configuredFurniture(),
      contentHash: "hash-b-configuration-labelled-v1",
    }, source.items[1]],
  });
  const current = frozenSnapshot({
    issue: {
      type: "addendum",
      reason: "Vendor price increase",
      baseRevisionId: "30000000-0000-4000-8000-000000000001",
    },
    items: [{
      ...source.items[0],
      configuration: configuredFurniture({ priceBump: 55_000 }),
      contentHash: "hash-b-configuration-labelled-v2",
    }, source.items[1]],
  });
  const addendumContext = {
    ...context,
    revisionNumber: 2,
    issueType: "addendum",
  } as const;

  for (const audience of ["client", "vendor", "installer", "care"] as const) {
    const addendum = await buildAudienceRenderModel(
      current,
      audience,
      addendumContext,
      base,
    );
    assertEquals(addendum.items, [], `${audience} received a pricing addendum`);
    assertEquals(
      addendum.changes,
      [],
      `${audience} received a pricing change ledger entry`,
    );
  }

  const [baseClient, currentClient] = await Promise.all([
    buildAudienceRenderModel(base, "client", context),
    buildAudienceRenderModel(current, "client", {
      ...context,
      revisionNumber: 2,
      issueType: "full",
    }),
  ]);
  assertEquals(
    baseClient.items.find((item) => item.id === "item-b")?.contentHash,
    currentClient.items.find((item) => item.id === "item-b")?.contentHash,
  );
});

Deno.test("a configuration selection-label change reaches the client addendum", async () => {
  const source = frozenSnapshot();
  const base = frozenSnapshot({
    items: [{
      ...source.items[0],
      configuration: configuredFurniture(),
      contentHash: "hash-b-configuration-label-v1",
    }, source.items[1]],
  });
  const current = frozenSnapshot({
    issue: {
      type: "addendum",
      reason: "Wood revision",
      baseRevisionId: "30000000-0000-4000-8000-000000000001",
    },
    items: [{
      ...source.items[0],
      configuration: configuredFurniture({ woodLabel: "White oak" }),
      contentHash: "hash-b-configuration-label-v2",
    }, source.items[1]],
  });

  const addendum = await buildAudienceRenderModel(
    current,
    "client",
    { ...context, revisionNumber: 2, issueType: "addendum" },
    base,
  );
  assertEquals(addendum.items.map((item) => item.id), ["item-b"]);
  assertEquals(addendum.changes, [{
    id: "item-b",
    documentCode: "PB-201",
    name: "Console",
    kind: "changed",
  }]);
  assertEquals(addendum.items[0].configuration?.selections[0], {
    group: "Wood",
    value: "White oak",
  });
});

Deno.test("a client profile that withholds selection also withholds the summary", async () => {
  const source = frozenSnapshot();
  const template = source.template as Record<string, unknown>;
  const profiles = template.audience_profiles as Record<string, unknown>;
  const snapshot = frozenSnapshot({
    template: {
      ...template,
      audience_profiles: {
        ...profiles,
        client: { allow: ["identity", "quantity", "selectedMedia"] },
      },
    },
    items: [
      { ...source.items[0], configuration: configuredFurniture() },
      source.items[1],
    ],
  });

  const client = await buildAudienceRenderModel(snapshot, "client", context);
  assertEquals(
    client.items.find((item) => item.id === "item-b")?.configuration,
    undefined,
  );
  assertEquals(JSON.stringify(client).includes("Walnut"), false);
});

Deno.test("snapshot limits and requested-audience boundary fail closed", async () => {
  const tooMany = Array.from({ length: MAX_RENDER_ITEMS + 1 }, (_, index) => ({
    id: `item-${index}`,
    name: `Item ${index}`,
  }));
  await assertRejects(
    () =>
      buildAudienceRenderModel(
        frozenSnapshot({ items: tooMany, allowances: [], tbd: [] }),
        "client",
        context,
      ),
    RenderModelError,
    "exceeds",
  );
  await assertRejects(
    () =>
      buildAudienceRenderModel(
        frozenSnapshot({ audiences: ["internal"] }),
        "client",
        context,
      ),
    RenderModelError,
    "was not frozen",
  );
});

// ── US-21 T-32: unit, need label, labor and rooms (00735's keys) ────────────

function piecesBook() {
  const base = frozenSnapshot();
  return frozenSnapshot({ items: [...base.items, ...piecesItems()] });
}

Deno.test("a placed line prints its unit, need label and also-in line; labor is marked", async () => {
  const model = await buildAudienceRenderModel(
    piecesBook(),
    "internal",
    context,
  );
  const oak = model.items.find((item) => item.id === "item-oak")!;
  const labor = model.items.find((item) => item.id === "item-oak-install")!;

  assertEquals(oak.quantity, 913);
  assertEquals(oak.unit, "sq_ft");
  assertEquals(quantityText(oak.quantity!, oak.unit), "913 sq ft");
  assertEquals(oak.needLabel, "Main floor");
  assertEquals(oak.name, "White oak floor, satin Bona finish");
  assertEquals(oak.lineKind, undefined);
  assertEquals(oak.roomName, "Living Room");
  assertEquals(oak.placements, [
    { roomName: "Hall", quantity: 120 },
    { roomName: "Living Room", quantity: 320 },
    { roomName: "Dining", quantity: 210, areaNote: "to the bay" },
    { roomName: "Kitchen", quantity: 180 },
  ]);
  assertEquals(
    alsoInText(oak),
    "ALSO IN HALL · DINING · KITCHEN · 320 SQ FT HERE",
  );
  // Read from another room, the share and that room's area note follow.
  assertEquals(
    alsoInText({ ...oak, roomName: "Dining" }),
    "ALSO IN HALL · LIVING ROOM · KITCHEN · 210 SQ FT HERE · TO THE BAY",
  );

  assertEquals(labor.lineKind, "labor");
  assertEquals(quantityText(labor.quantity!, labor.unit), "913 sq ft");
  assertEquals(labor.placements, undefined);
  assertEquals(alsoInText(labor), null);
});

Deno.test("each edition carries only the piece keys its allow-list admits", async () => {
  const snapshot = piecesBook();
  const read = async (audience: (typeof SPEC_BOOK_AUDIENCES)[number]) => {
    const model = await buildAudienceRenderModel(snapshot, audience, context);
    return {
      oak: model.items.find((item) => item.id === "item-oak")!,
      labor: model.items.find((item) => item.id === "item-oak-install")!,
    };
  };

  const client = await read("client");
  assertEquals(client.oak.unit, "sq_ft");
  assertEquals(client.oak.placements?.length, 4);
  assertEquals(client.oak.needLabel, undefined);
  assertEquals(client.labor.lineKind, "labor");

  const vendor = await read("vendor");
  assertEquals(vendor.oak.unit, "sq_ft");
  assertEquals(vendor.oak.needLabel, undefined);

  const installer = await read("installer");
  assertEquals(installer.oak.needLabel, "Main floor");
  assertEquals(installer.oak.placements?.length, 4);

  // The care edition prints no quantity, so no unit and no room shares.
  const care = await read("care");
  assertEquals(care.oak.quantity, null);
  assertEquals(care.oak.unit, undefined);
  assertEquals(care.oak.placements, undefined);
  assertEquals(care.oak.needLabel, undefined);
  assertEquals(care.labor.lineKind, "labor");

  // A parent id never reaches an external edition.
  for (const audience of ["client", "vendor", "installer", "care"] as const) {
    const model = await buildAudienceRenderModel(snapshot, audience, context);
    assertEquals(JSON.stringify(model).includes("parentFfeItemId"), false);
  }
});

Deno.test("default-valued piece keys leave every edition exactly as before", async () => {
  const base = frozenSnapshot();
  // A line as it would read if 00735's NULLIFs let its defaults through.
  const spelledOut = frozenSnapshot({
    items: base.items.map((item) => ({
      ...item,
      unit: "each",
      lineKind: "goods",
      needLabel: item.name,
      placements: [{
        roomName: (item.room as { name: string }).name,
        quantity: item.quantity,
      }],
    })),
  });
  for (const audience of SPEC_BOOK_AUDIENCES) {
    const before = await buildAudienceRenderModel(base, audience, context);
    const after = await buildAudienceRenderModel(spelledOut, audience, context);
    for (const item of after.items) {
      for (const key of ["unit", "needLabel", "lineKind", "placements"]) {
        assertEquals(key in item, false, `${audience} ${item.id} has ${key}`);
      }
      assertEquals(alsoInText(item), null);
    }
    if (audience === "internal") continue; // internal keeps the raw item
    assertEquals(canonicalStringify(after), canonicalStringify(before));
  }
});
