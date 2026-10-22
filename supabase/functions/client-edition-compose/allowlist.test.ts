import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CallClaudeOptions, CallClaudeResult } from "../_shared/claude.ts";
import { composeRequest, type Db, type PlateSourceRow } from "./lib.ts";
import { allowedFacts, type EditorialFacts } from "./prompts.ts";

const PROJECT = "0b7d3c1e-0000-4000-8000-000000000003";

// The editorial facts as a careless envelope might carry them: an address,
// the household, prices, notes, a project named for the family, a drawing
// sheet, a board, and the studio's own name and town.
function facts(showMakers: boolean): EditorialFacts {
  const asset = (id: string, sourceKind: string) => ({
    id,
    sha256: `${id}-sha`,
    sourceKind,
    width: 3000,
    height: 2000,
    ground: "scene",
    caption: { what: "Walnut sofa", whose: "Larch & Fern Studio", when: "2026-10" },
    perceivedPromptVersion: null,
  });
  return {
    project: {
      id: PROJECT,
      name: "Smith Residence",
      phase: "procurement",
      targetDate: "2027-03-01",
      showMakers,
      studio: { id: "studio-1", name: "Larch & Fern Studio", town: "Wexford" },
      site_address: "14 Larkspur Lane",
      household: [{ firstName: "Eloise" }, { firstName: "Theodore" }],
      budget: 48000,
      project_notes: "Gate code 4471; dog in the yard",
    },
    rooms: [{
      id: "r1",
      name: "Living room",
      anchor: "room-r1",
      scanAssetIds: ["a-scan"],
      items: [
        {
          id: "i1",
          nameAsSigned: "Walnut sofa",
          category: "Seating",
          status: "in production",
          makerName: "Kettle Joinery",
          madeIn: "Vermont",
          material: "walnut",
          finish: "oiled",
          dimensions: "84 x 36 x 30 in",
          descriptionAsSigned: "Three-seat sofa in oiled walnut.",
          assetIds: ["a-sofa"],
          unitPrice: 4200,
          sku: "KJ-SOFA-84",
          notes: "Client asked for a discount",
        },
        { id: "i2", nameAsSigned: "Linen chair", assetIds: ["a-chair"] },
      ],
    }],
    assets: [asset("a-sofa", "upload"), asset("a-chair", "upload"), asset("a-scan", "scan"), asset("a-sheet", "sheet"), asset("a-board", "board")],
    palette: [{ hex: "#556B2F", brand: "Farrow", name: "Moss" }],
    sheets: [{ id: "s1", title: "Electrical plan for the Smiths", assetId: "a-sheet" }],
    boards: [{ id: "b1", name: "Eloise's palette board", assetId: "a-board" }],
  } as unknown as EditorialFacts;
}

const row = (assetId: string, kind: string, url: string, table: string): PlateSourceRow => ({
  project_id: PROJECT,
  source_kind: kind,
  source_ref: { table, id: `${assetId}-src` },
  source_url: url,
  asset_id: assetId,
});

const SOURCES = [
  row("a-sofa", "upload", "https://maker.example/sofa.jpg", "project_ffe_item_images"),
  row("a-chair", "upload", "https://maker.example/chair.jpg", "project_ffe_item_images"),
  row("a-scan", "scan", "scans/living/scan1.jpg", "room_scan_images"),
  row("a-sheet", "sheet", "https://drawings.example/smith-electrical.pdf", "project_sheets"),
  row("a-board", "board", "https://boards.example/eloise-board.jpg", "project_boards"),
];

const FORBIDDEN = [
  "Smith", "Residence", "Larkspur", "Eloise", "Theodore", "4200", "48000", "4471", "Gate code", "discount",
  "KJ-SOFA", "Electrical plan", "palette board", "Larch", "Fern", "Wexford", "drawings.example", "boards.example",
  "site_address", "household", "project_notes", "unitPrice", "budget",
];

function fakeDb(source: EditorialFacts): Db {
  return {
    rpc(fn) {
      const data: Record<string, unknown> = {
        get_project_editorial_facts: structuredClone(source),
        begin_client_edition: "edition-1",
        client_plate_source_owned: true,
      };
      return Promise.resolve({ data: data[fn] ?? null, error: null });
    },
    approvedEdition: () => Promise.resolve({ data: null, error: null }),
    plateSources: (_project, ids) => Promise.resolve({ data: SOURCES.filter((r) => ids.includes(r.asset_id)), error: null }),
    sign: (bucket, path) => Promise.resolve(`https://signed.example/${bucket}/${path}?token=t`),
  };
}

const ok = (value: unknown): CallClaudeResult => ({
  ok: true,
  response: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value) }], usage: { input_tokens: 1, output_tokens: 1 } },
  usd: 0.01,
  model: "claude-sonnet-5-5",
});

type Content = { type: string; text?: string; source?: { url: string } }[];
const content = (opts: CallClaudeOptions) => (opts.params.messages as { content: Content }[])[0].content;

// Answers whatever is asked, so every call the composition makes is made.
function answer(opts: CallClaudeOptions): CallClaudeResult {
  const blocks = content(opts);
  if (opts.role === "perceive") {
    const count = blocks.filter((b) => b.type === "image").length;
    return ok({ images: Array.from({ length: count }, (_, index) => ({ index, subject_box: [0.1, 0.1, 0.6, 0.6], focal: [0.4, 0.4], flags: [], alt: "A sofa." })) });
  }
  if (opts.role === "judge") return ok({ ok: true, term: null });
  if (blocks.some((b) => b.type === "image")) return ok({ hero: { index: 0, why: "Calm." }, held: [] });
  const asked = JSON.parse(blocks[0].text!).chapters as { key: string }[];
  return ok({
    chapters: asked.map(({ key }) => ({ key, headline: "On its way", standing: "It is being made." })),
    doorstep: { standing: "Pieces are being made." },
    notice: "The page now opens on the sofa; everything else is where it was.",
  });
}

async function requestBodies(showMakers: boolean, privacyLive: boolean) {
  const calls: CallClaudeOptions[] = [];
  const claude = (opts: CallClaudeOptions) => {
    calls.push(opts);
    return Promise.resolve(answer(opts));
  };
  const request = { id: "req-1", project_id: PROJECT, lease_token: "lease-1" };
  await composeRequest(request, { db: fakeDb(facts(showMakers)), claude, privacyLive, supabaseUrl: "https://project.supabase.co" });
  return { roles: calls.map((c) => c.role), bodies: calls.map((c) => JSON.stringify(c.params)) };
}

for (const privacyLive of [false, true]) {
  Deno.test(`no request body carries a fact outside the allowlist (CLIENT_PRIVACY_PAGE_LIVE ${privacyLive})`, async () => {
    const { roles, bodies } = await requestBodies(false, privacyLive);
    assertEquals(roles, ["perceive", "draft", "draft", "judge"]);
    for (const body of bodies) {
      for (const term of FORBIDDEN) assert(!body.includes(term), `"${term}" reached a request`);
      assert(!body.includes("Kettle") && !body.includes("Vermont"), "maker and origin are hidden when makers are not shown");
    }
    const scanSent = bodies.some((body) => body.includes("signed.example/room-scans"));
    assertEquals(scanSent, privacyLive, "a scan of her home reaches a model only once the privacy page is live");
  });
}

Deno.test("maker and origin travel only when the studio shows makers", async () => {
  const { bodies } = await requestBodies(true, false);
  assert(bodies.some((body) => body.includes("Kettle Joinery") && body.includes("Vermont")));
  for (const body of bodies) for (const term of FORBIDDEN) assert(!body.includes(term), `"${term}" reached a request`);
});

Deno.test("the allowlist, field by field", () => {
  assertEquals(allowedFacts(facts(true)), {
    project: { phase: "procurement", targetDate: "2027-03-01" },
    rooms: [{
      name: "Living room",
      items: [
        {
          nameAsSigned: "Walnut sofa",
          category: "Seating",
          status: "in production",
          makerName: "Kettle Joinery",
          madeIn: "Vermont",
          material: "walnut",
          finish: "oiled",
          dimensions: "84 x 36 x 30 in",
          descriptionAsSigned: "Three-seat sofa in oiled walnut.",
        },
        { nameAsSigned: "Linen chair", category: null, status: null, makerName: null, madeIn: null, material: null, finish: null, dimensions: null, descriptionAsSigned: null },
      ],
    }],
    palette: [{ name: "Moss" }],
  });
  const hidden = allowedFacts(facts(false)).rooms[0].items[0];
  assertEquals(["makerName" in hidden, "madeIn" in hidden], [false, false]);
});
