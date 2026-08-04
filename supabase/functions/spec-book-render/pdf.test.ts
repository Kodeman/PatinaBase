// deno-lint-ignore-file no-import-prefix

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import { buildAudienceRenderModel, sha256Hex } from "./render-model.ts";
import { buildPagePlan, renderSpecBookPdf } from "./pdf.ts";
import { configuredFurniture, frozenSnapshot } from "./test-fixtures.ts";

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
  assert(loungePage.includes("96 × 40 × 31"));
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
