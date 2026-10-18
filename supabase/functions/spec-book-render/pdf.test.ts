// deno-lint-ignore-file no-import-prefix

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import { buildAudienceRenderModel, sha256Hex } from "./render-model.ts";
import { buildPagePlan, renderSpecBookPdf, selectionRows } from "./pdf.ts";
import {
  configuredFurniture,
  frozenSnapshot,
  piecesItems,
} from "./test-fixtures.ts";

const context = {
  revisionNumber: 1,
  createdAt: "2026-07-30T15:05:00.000Z",
} as const;

async function extractedText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => "str" in item ? item.str : "")
        .join(" "),
    );
  }
  await pdf.destroy();
  return pages.join("\n");
}

Deno.test("page plan paginates contents and assigns stable chapter page numbers", async () => {
  const chapters = Array.from({ length: 40 }, (_, index) => ({
    id: `room-${index}`,
    name: `Room ${String(index).padStart(2, "0")}`,
    position: index,
  }));
  const items = chapters.map((chapter, index) => ({
    id: `item-${index}`,
    chapterId: chapter.id,
    position: 0,
    documentCode: `R-${index}`,
    name: `Selection ${index}`,
    contentHash: `hash-${index}`,
  }));
  const model = await buildAudienceRenderModel(
    frozenSnapshot({ chapters, items, allowances: [], tbd: [] }),
    "client",
    context,
  );
  const plan = buildPagePlan(model);
  const contents = plan.filter((entry) => entry.kind === "contents");
  assertEquals(contents.length, 2);
  assertEquals(contents[0].pageNumber, 2);
  assertEquals(contents[1].pageNumber, 3);
  const firstChapter = plan.find((entry) => entry.kind === "chapter");
  assertEquals(firstChapter?.pageNumber, 4);
  const lastChapter = plan.filter((entry) => entry.kind === "chapter").at(-1);
  assertEquals(lastChapter?.pageNumber, 82);
});

Deno.test("client chapter dividers say Category, Room or Chapter (00767, SQ-842 F9)", async () => {
  // As _prepare_spec_book_issue_00403 freezes them (00380:1558): a trade
  // chapter has no room and the 'trade' page template; a room chapter has a
  // room; a chapter the studio made by hand has neither.
  const chapters = [
    {
      id: "trade-lighting",
      projectRoomId: null,
      title: "Lighting",
      position: 30,
      pageTemplate: "trade",
    },
    {
      id: "room-hall",
      projectRoomId: "room-hall",
      title: "Hall",
      position: 40,
      pageTemplate: "room",
    },
    {
      id: "studio-owners",
      projectRoomId: null,
      title: "Owners selections",
      position: 50,
      pageTemplate: "room",
    },
  ];
  const items = [
    ...chapters.map((chapter, index) => ({
      id: `item-${index}`,
      chapterId: chapter.id,
      position: 0,
      documentCode: `C-${index}`,
      name: `Selection ${index}`,
      contentHash: `hash-${index}`,
    })),
    {
      id: "item-unfiled",
      position: 0,
      documentCode: "C-9",
      name: "Unfiled selection",
      contentHash: "hash-unfiled",
    },
  ];
  const model = await buildAudienceRenderModel(
    frozenSnapshot({ chapters, items, allowances: [], tbd: [] }),
    "client",
    context,
  );
  assertEquals(
    model.chapters.map((chapter) => [chapter.id, chapter.kind]),
    [
      ["trade-lighting", "trade"],
      ["room-hall", "room"],
      ["studio-owners", "chapter"],
    ],
  );
  const dividers = buildPagePlan(model).flatMap((entry) =>
    entry.kind === "chapter" ? [[entry.eyebrow, entry.name]] : []
  );
  assertEquals(dividers, [
    ["Category", "Lighting"],
    ["Room", "Hall"],
    ["Chapter", "Owners selections"],
    ["Chapter", "Unassigned"],
  ]);

  // The eyebrow prints upper case and letter-spaced ("C A T E G O R Y").
  const text = (await extractedText(await renderSpecBookPdf(model)))
    .replace(/\s+/g, "");
  assert(
    text.includes("CATEGORYLighting"),
    "a client trade divider prints Category",
  );
  assert(text.includes("ROOMHall"), "a room divider keeps Room");
  assert(
    text.includes("CHAPTEROwnersselections"),
    "a hand-made divider prints Chapter",
  );
  assert(!text.includes("ROOMLighting"), "a trade divider never prints Room");
});

Deno.test("empty book still receives a deterministic contents page", async () => {
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      chapters: [],
      items: [],
      allowances: [],
      tbd: [],
    }),
    "client",
    context,
  );
  assertEquals(buildPagePlan(model).map((entry) => entry.kind), [
    "cover",
    "contents",
  ]);
});

Deno.test("missing image renders a readable fallback and stable PDF checksum", async () => {
  const model = await buildAudienceRenderModel(
    frozenSnapshot(),
    "client",
    context,
  );
  const first = await renderSpecBookPdf(model);
  const second = await renderSpecBookPdf(model);
  assertEquals(first.slice(0, 5), new TextEncoder().encode("%PDF-"));
  assertEquals(await sha256Hex(first), await sha256Hex(second));
  const text = await extractedText(first);
  assert(text.includes("Image unavailable"));
  assert(text.includes("Contents"));
  assert(text.includes("Living Room"));
});

Deno.test("extracted external PDFs contain no private cost contact or procurement values", async () => {
  const forbidden = [
    "PRIVATE-ONLY",
    "PROCUREMENT-ONLY",
    "INTERNAL-CONTACT",
    "8000",
    "1.54",
  ];
  for (const audience of ["client", "vendor", "installer", "care"] as const) {
    const model = await buildAudienceRenderModel(
      frozenSnapshot(),
      audience,
      context,
    );
    const text = await extractedText(await renderSpecBookPdf(model));
    for (const marker of forbidden) {
      assertEquals(
        text.includes(marker),
        false,
        `${audience} PDF leaked ${marker}`,
      );
    }
  }
});

Deno.test("client PDF strips money keys and humanises numeric own extras", async () => {
  const source = frozenSnapshot();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: {
          dimensions: {
            value: {
              width: 60,
              unit: "in",
              cost: 850,
              retail: 1200,
              mystery: 999,
            },
          },
        },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  for (const forbidden of ["Cost", "Retail", "850", "1200"]) {
    assertEquals(
      text.includes(forbidden),
      false,
      `client PDF exposed ${forbidden}`,
    );
  }
  assert(text.includes("W 60 in"));
  assert(text.includes("Mystery 999"));
  assertEquals(text.includes("Mystery 999 in"), false);
});

Deno.test("client PDF omits boolean selection values", async () => {
  const source = frozenSnapshot();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: {
          sku: { na: false, value: false },
          dimensions: { na: false, value: false },
          material: { na: false, value: false },
          finish: { na: false, value: true },
        },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  for (
    const forbidden of [
      "false",
      "true",
      "sku",
      "dimensions",
      "material",
      "finish",
    ]
  ) {
    assertEquals(
      text.toLowerCase().includes(forbidden),
      false,
      `boolean row ${forbidden}`,
    );
  }
});

Deno.test("client PDF uses weight units separately from length units", async () => {
  const source = frozenSnapshot();
  const dimensions = { width: 60, weight: 75, unit: "in", weight_unit: "lb" };
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: { dimensions: { value: dimensions } },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("Weight 75 lb"), "weight uses its own unit");
  assertEquals(text.includes("Weight 75 in"), false);
  assert(text.includes("W 60 in"));
  const bareModel = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: {
          dimensions: { value: { width: 60, weight: 75, unit: "in" } },
        },
      }],
    }),
    "client",
    context,
  );
  const bareText = await extractedText(await renderSpecBookPdf(bareModel));
  assert(bareText.includes("Weight 75"));
  assertEquals(bareText.includes("Weight 75 in"), false);
});

Deno.test("client PDF configuration fallback formats diameter and seat height with units", async () => {
  const source = frozenSnapshot();
  const baseConfiguration = configuredFurniture();
  const configuration = {
    ...baseConfiguration,
    snapshot: {
      ...baseConfiguration.snapshot,
      dimensions: { diameter: 42, seatHeight: 18, unit: "in" },
    },
  };
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{ ...source.items[1], configuration }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("Dia 42 in"));
  assert(text.includes("Seat H 18 in"));
});

Deno.test("R1: vendor installer and client PDFs omit money-like dimension extras", async () => {
  const source = frozenSnapshot();
  const snapshot = frozenSnapshot({
    items: [{
      ...source.items[0],
      selection: {
        dimensions: {
          value: {
            width: 60,
            cost: 850,
            retail: 1200,
            unit_cost: 750,
            totalAmount: 1950,
            privateNotes: 4321,
            unit: "in",
          },
        },
      },
    }],
  });
  for (const audience of ["vendor", "installer", "client"] as const) {
    const model = await buildAudienceRenderModel(snapshot, audience, context);
    const text = await extractedText(await renderSpecBookPdf(model));
    assert(text.includes("W 60 in"), `${audience} lost its width`);
    for (
      const money of [
        "Cost 850",
        "Retail 1200",
        "Unit Cost 750",
        "Total Amount 1950",
        "Private Notes 4321",
      ]
    ) {
      assertEquals(text.includes(money), false, `${audience} printed ${money}`);
    }
  }
});

Deno.test("R2: client Issue drops forbidden configuration dimension keys", async () => {
  const source = frozenSnapshot();
  const base = configuredFurniture();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[1],
        configuration: {
          ...base,
          snapshot: {
            ...base.snapshot,
            dimensions: {
              width: 60,
              unit: "in",
              privateNotes: "internal instruction",
            },
          },
        },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("W 60 in"));
  assertEquals(text.includes("internal instruction"), false);
  assertEquals(JSON.stringify(model).includes("privateNotes"), false);
});

Deno.test("R3: bare selection dimension strings print verbatim in the PDF", async () => {
  const source = frozenSnapshot();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: { dimensions: "60 × 18 × 30 in" },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.replace(/\s+/g, " ").includes("60 × 18 × 30 in"), text);
  assertEquals(
    selectionRows(model.items[0].selection).find(([key]) =>
      key === "dimensions"
    ),
    ["dimensions", "60 × 18 × 30 in"],
  );
});

Deno.test("R5: numeric unknown dimensions print without length units", async () => {
  const source = frozenSnapshot();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: {
          dimensions: { value: { count: 4, angle: 90, unit: "in" } },
        },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("Count 4 · Angle 90"));
  assertEquals(text.includes("Count 4 in"), false);
  assertEquals(text.includes("Angle 90 in"), false);
});

Deno.test("R6: PDF prints weight before other known lengths", async () => {
  const source = frozenSnapshot();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: {
          dimensions: {
            value: { thickness: 2, weight: 30, unit: "in", weightUnit: "lb" },
          },
        },
      }],
    }),
    "client",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("Weight 30 lb · Thickness 2 in"));
});

Deno.test("client PDF prints the configuration selections without any pricing", async () => {
  const source = frozenSnapshot();
  const configured = frozenSnapshot({
    items: [
      {
        ...source.items[0],
        configuration: configuredFurniture({
          comDetails: {
            optionValueId: "80000000-0000-4000-8000-000000000001",
            fabricName: "Highland Linen 12",
            mill: "Rogers Mill",
            shipTo: "Receiving dock four",
            sidemark: "MAPLE / CONSOLE",
          },
        }),
      },
      { ...source.items[1], configuration: configuredFurniture() },
    ],
  });

  const client = await buildAudienceRenderModel(configured, "client", context);
  const text = await extractedText(await renderSpecBookPdf(client));
  const consolePage = text.split("\n").find((page) => page.includes("PB-201"))!;
  assert(consolePage.includes("SELECTIONS"));
  assert(consolePage.includes("Variant"));
  assert(consolePage.includes("Left Chaise"));
  assert(consolePage.includes("Wood"));
  assert(consolePage.includes("Walnut"));
  assert(consolePage.includes("Leather"));
  assert(consolePage.includes("Chestnut"));
  assert(consolePage.includes("Left arm chaise · Armless loveseat ×2"));
  assert(consolePage.includes("COM fabric"));
  assert(consolePage.includes("Highland Linen 12"));
  // The frozen spec already prints its own Dimensions field on this sheet.
  assert(consolePage.includes("60 × 18 × 30"));
  assertEquals(consolePage.includes("96 × 40 × 31"), false);
  // …and a sheet without one falls back to the configuration's dimensions.
  const loungePage = text.split("\n").find((page) => page.includes("LR-101"))!;
  assert(loungePage.includes("Dimensions"));
  assert(loungePage.includes("W 96 × D 40 × H 31 in"));
  for (
    const marker of [
      "1240000",
      "868000",
      "12,400",
      "Rogers Mill",
      "Receiving dock four",
      "MAPLE / CONSOLE",
    ]
  ) {
    assertEquals(
      text.includes(marker),
      false,
      `client PDF leaked ${marker}`,
    );
  }

  for (const audience of ["vendor", "installer", "care"] as const) {
    const model = await buildAudienceRenderModel(configured, audience, context);
    const audienceText = await extractedText(await renderSpecBookPdf(model));
    assertEquals(
      audienceText.includes("Walnut"),
      false,
      `${audience} PDF leaked the configuration selections`,
    );
    assertEquals(
      audienceText.includes("Highland Linen 12"),
      false,
      `${audience} PDF leaked the COM fabric`,
    );
  }
});

Deno.test("internal PDF contains frozen private and procurement commentary", async () => {
  const model = await buildAudienceRenderModel(
    frozenSnapshot(),
    "internal",
    context,
  );
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("PRIVATE-ONLY"));
  assert(text.includes("PROCUREMENT-ONLY"));
  assert(text.includes("INTERNAL-CONTACT"));
});

// SQ-212: hashes taken from main @ d0254134a (pre-change) rendering the same
// all-USD fixture. Spec Book renders are deterministic, so no bytes are masked.
Deno.test("all-USD spec book PDFs are byte-for-byte the pre-SQ-212 output", async () => {
  for (
    const [audience, expected] of [
      [
        "client",
        "df4c2aeff0d042b829a4152659f1465dcc061ab81f453e69d04ede12387961d5",
      ],
      [
        "internal",
        "6ae9bf36a80b9979d710d04af27dbb59538bcf646b9141f424bf7f2cd4d60288",
      ],
    ] as const
  ) {
    const model = await buildAudienceRenderModel(
      frozenSnapshot(),
      audience,
      context,
    );
    assertEquals(await sha256Hex(await renderSpecBookPdf(model)), expected);
  }
});

Deno.test("a frozen non-USD client price prints in its own currency", async () => {
  const source = frozenSnapshot();
  const snapshot = frozenSnapshot({
    items: source.items.map((item) =>
      item.pricing && typeof item.pricing === "object"
        ? { ...item, pricing: { ...item.pricing, currency: "eur" } }
        : item
    ),
  });
  const model = await buildAudienceRenderModel(snapshot, "client", context);
  const priced = model.items.find((item) =>
    item.commercial.clientPriceCents === 12345
  );
  assertEquals(priced?.commercial.currency, "EUR");
  const text = await extractedText(await renderSpecBookPdf(model));
  assert(text.includes("€123.45"), text);
  assertEquals(text.includes("$123.45"), false);
  // The currency rides with the price; it is not printed as its own row.
  assertEquals(text.includes("currency"), false);
});

Deno.test("the item page prints the unit, the need label above the name, LABOR and ALSO IN (T-32)", async () => {
  const base = frozenSnapshot();
  const snapshot = frozenSnapshot({
    items: [...base.items, ...piecesItems()],
  });
  const model = await buildAudienceRenderModel(snapshot, "installer", context);
  const pages = (await extractedText(await renderSpecBookPdf(model))).split(
    "\n",
  );
  const oakPage = pages.find((page) => page.includes("LR-110"))!;
  assert(oakPage, "the oak floor has its page");
  const need = oakPage.indexOf("Main floor");
  const name = oakPage.indexOf("White oak floor, satin Bona finish");
  const alsoIn = oakPage.indexOf(
    "ALSO IN HALL · DINING · KITCHEN · 320 SQ FT HERE",
  );
  assert(need >= 0 && name > need, oakPage);
  assert(alsoIn > name, oakPage);
  assert(oakPage.includes("Quantity 913 sq ft"), oakPage);

  const laborPage = pages.find((page) => page.includes("LR-111"))!;
  assert(laborPage.includes("LABOR"), laborPage);
  assert(laborPage.includes("Quantity 913 sq ft"), laborPage);

  // A line in its default state prints as it always has.
  const chairPage = pages.find((page) => page.includes("LR-101"))!;
  assert(chairPage.includes("Quantity 2"), chairPage);
  assertEquals(chairPage.includes("ALSO IN"), false);
  assertEquals(chairPage.includes("LABOR"), false);
});

// ─── T-60g: primes (follow-up from T-60c F13) ────────────────────────────────

Deno.test("T-60g: a prime in an item name reaches the PDF as feet and inches, not 2/3", async () => {
  const source = frozenSnapshot();
  const name = "Runner, 2′6″ × 10′";
  const snapshot = frozenSnapshot({
    items: [{ ...source.items[0], name }, source.items[1]],
  });
  const model = await buildAudienceRenderModel(snapshot, "client", context);
  const pages = (await extractedText(await renderSpecBookPdf(model))).split(
    "\n",
  );
  const page = pages.find((p) => p.includes("PB-201"))!;
  assert(page, "the runner has its page");
  assert(page.includes(`Runner, 2'6" × 10'`), page);
  assertEquals(page.includes("Runner, 2263"), false);
});

async function clientDimensionPage(
  dimensions: unknown,
  configuration: unknown = undefined,
): Promise<string> {
  const source = frozenSnapshot();
  const model = await buildAudienceRenderModel(
    frozenSnapshot({
      items: [{
        ...source.items[0],
        selection: { dimensions: { value: dimensions } },
        ...(configuration ? { configuration } : {}),
      }],
    }),
    "client",
    context,
  );
  return await extractedText(await renderSpecBookPdf(model));
}

Deno.test("F1: PDF orders axes then known and own numeric dimensions", async () => {
  const text = await clientDimensionPage({
    extra_depth: "9",
    legHeight: 17,
    diameter: 42,
    height: 31,
    width: 60,
    depth: 40,
    unit: "in",
    ignored: true,
  });
  assert(
    text.replace(/\s+/g, " ").includes(
      "W 60 × D 40 × H 31 in · Dia 42 in · Leg H 17 in · Extra Depth 9",
    ),
    text,
  );
  assertEquals(text.includes("Ignored"), false);
});

Deno.test("F2: PDF strips configuration dimension cost before privacy scan", async () => {
  const config = configuredFurniture();
  let text = "";
  let failure: unknown = null;
  try {
    text = await clientDimensionPage(null, {
      ...config,
      snapshot: {
        ...config.snapshot,
        dimensions: { width: 60, unit: "in", cost: 850 },
      },
    });
  } catch (error) {
    failure = error;
  }
  assertEquals(
    failure,
    null,
    "client Issue accepts stripped configuration money",
  );
  assert(text.includes("W 60 in"), text);
  assertEquals(text.includes("850"), false);
  assertEquals(text.includes("Cost"), false);
});

Deno.test("F3: unit-only selection does not suppress configuration dimensions", async () => {
  const config = configuredFurniture();
  const text = await clientDimensionPage({ unit: "cm" }, {
    ...config,
    snapshot: {
      ...config.snapshot,
      dimensions: { width: 60, unit: "in" },
    },
  });
  assert(text.includes("W 60 in"), text);
  assertEquals(text.includes("cm"), false);
});

Deno.test("F4: PDF accepts uppercase and separator variants of axes", async () => {
  const text = await clientDimensionPage({
    Width: 60,
    width: 65,
    DEPTH: 40,
    seat_height: 18,
    seatHeight: 19,
    unit: "in",
  });
  assert(text.includes("W 60 × D 40 in · Seat H 18 in"), text);
  assertEquals(text.includes("W 65"), false);
  assertEquals(text.includes("Seat H 19"), false);
});

Deno.test("F5: inherited constructor is not a PDF dimension", async () => {
  const dimensions = Object.create({ constructor: 9, width: 999 }) as Record<
    string,
    unknown
  >;
  dimensions.height = 31;
  const rows = selectionRows({ dimensions: { value: dimensions } });
  assertEquals(rows[0]?.[1], "H 31");
  assertEquals(
    selectionRows({ dimensions: { value: { constructor: 7 } } })[0]?.[1],
    "Constructor 7",
  );
  const text = await clientDimensionPage(dimensions);
  assertEquals(text.includes("Constructor 9"), false);
  assertEquals(text.includes("W 999"), false);
});

Deno.test("F7: nested non-string N/A reason prints plain N/A", async () => {
  const text = await clientDimensionPage({ na: true, naReason: true });
  assert(text.includes("N/A"), text);
  assertEquals(text.includes("true"), false);
});

Deno.test("F8: dimension arrays join only object measurements", async () => {
  const text = await clientDimensionPage([
    { width: 60, unit: "in" },
    false,
    { diameter: "42", unit: "cm" },
    "other",
  ]);
  assert(text.includes("W 60 in / Dia 42 cm"), text);
  assertEquals(text.includes("other"), false);
});
