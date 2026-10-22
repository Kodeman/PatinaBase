import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CallClaudeOptions, CallClaudeResult } from "../_shared/claude.ts";
import {
  composeRequest,
  type CurrentEdition,
  type Db,
  type DbError,
  type DbResult,
  deterministicHeadlines,
  type EditionRequest,
  type PlateSourceRow,
  privacyPageLive,
  runBatch,
  runStatus,
  sourceHash,
} from "./lib.ts";
import type { EditorialFacts, FactsRoom } from "./prompts.ts";

const PROJECT = "0b7d3c1e-0000-4000-8000-000000000001";
const REQUEST: EditionRequest = { id: "req-1", project_id: PROJECT, lease_token: "lease-1" };

const asset = (id: string, sourceKind: string, width: number, height: number, extra: Record<string, unknown> = {}) => ({
  id,
  sha256: `${id}-sha`,
  sourceKind,
  width,
  height,
  ground: "scene",
  focal: null,
  subjectBox: null,
  alt: null,
  caption: { what: `${id} what`, whose: "Studio", when: "2026-10" },
  perceivedPromptVersion: null,
  focalOrigin: null,
  ...extra,
});

function facts(): EditorialFacts {
  return {
    project: { id: PROJECT, name: "Hillside", phase: "procurement", targetDate: "2027-03-01", showMakers: true, studio: { id: "studio-1" } },
    rooms: [
      {
        id: "r1",
        name: "Living room",
        anchor: "room-r1",
        conceptAssetId: "a-concept",
        scanAssetIds: ["a-scan"],
        items: [
          { id: "i1", nameAsSigned: "Walnut sofa", status: "in production", assetIds: ["a-sofa", "a-sofa-maker"] },
          { id: "i2", nameAsSigned: "Oak table", status: "ordered", assetIds: ["a-table"] },
        ],
      },
      { id: "r2", name: "Dining room", anchor: "room-r2", items: [{ id: "i3", nameAsSigned: "Marble table", assetIds: ["a-marble"] }] },
    ],
    assets: [
      asset("a-sofa", "upload", 3000, 2000),
      asset("a-table", "upload", 2400, 1600, { focalOrigin: "designer" }),
      asset("a-sofa-maker", "maker", 2000, 1500, { ground: "white" }),
      asset("a-marble", "upload", 800, 600, { perceivedPromptVersion: "e1" }),
      asset("a-concept", "concept", 2400, 1600),
      asset("a-scan", "scan", 2600, 1800),
      asset("a-sheet", "sheet", 3000, 2000, { ground: "drawing" }),
      asset("a-board", "board", 2000, 1400),
    ],
    palette: [{ name: "Moss" }],
  } as EditorialFacts;
}

const source = (assetId: string, kind: string, url: string, table = "project_ffe_item_images"): PlateSourceRow => ({
  project_id: PROJECT,
  source_kind: kind,
  source_ref: { table, id: `${assetId}-src` },
  source_url: url,
  asset_id: assetId,
});

const SOURCES: PlateSourceRow[] = [
  source("a-sofa", "upload", "https://maker.example/sofa.jpg"),
  source("a-table", "upload", "https://maker.example/table.jpg"),
  source("a-sofa-maker", "maker", "https://maker.example/sofa-white.jpg"),
  source("a-marble", "upload", "marble.jpg"),
  source("a-concept", "concept", "https://renders.example/living.jpg", "project_rooms"),
  source("a-scan", "scan", "scans/living/scan1.jpg", "room_scan_images"),
  source("a-sheet", "sheet", "https://drawings.example/plan.pdf", "project_sheets"),
  source("a-board", "board", "https://boards.example/board.jpg", "project_boards"),
];

const SCAN_URL = "https://signed.example/room-scans/scans/living/scan1.jpg?token=t";

interface DbOptions {
  facts?: EditorialFacts;
  current?: CurrentEdition | null;
  beginError?: DbError;
  finishError?: DbError;
  requests?: EditionRequest[];
}

function fakeDb(options: DbOptions = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  // Facts are cloned per read: a composition writes perception onto them.
  const replies: Record<string, () => DbResult<unknown>> = {
    claim_client_edition_requests: () => ({ data: options.requests ?? [REQUEST], error: null }),
    get_project_editorial_facts: () => ({ data: structuredClone(options.facts ?? facts()), error: null }),
    begin_client_edition: () => (options.beginError ? { data: null, error: options.beginError } : { data: "edition-1", error: null }),
    client_plate_source_owned: () => ({ data: true, error: null }),
    finish_client_edition: () => ({ data: null, error: options.finishError ?? null }),
  };
  const db: Db = {
    rpc(fn, args) {
      calls.push({ fn, args });
      const reply = replies[fn];
      return Promise.resolve(reply ? reply() : { data: null, error: null });
    },
    approvedEdition: () => Promise.resolve({ data: options.current ?? null, error: null }),
    plateSources: (_project, ids) => Promise.resolve({ data: SOURCES.filter((row) => ids.includes(row.asset_id)), error: null }),
    sign: (bucket, path) => Promise.resolve(`https://signed.example/${bucket}/${path}?token=t`),
  };
  const called = (fn: string) => calls.filter((call) => call.fn === fn);
  return { db, calls, called };
}

function ok(value: unknown, usd = 0.01, model = "claude-sonnet-5-5"): CallClaudeResult {
  return {
    ok: true,
    response: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value) }], usage: { input_tokens: 10, output_tokens: 10 } },
    usd,
    model,
  };
}

type Step = CallClaudeResult | ((opts: CallClaudeOptions) => CallClaudeResult);

function fakeClaude(script: Record<string, Step[]>) {
  const calls: CallClaudeOptions[] = [];
  const claude = (opts: CallClaudeOptions) => {
    calls.push(opts);
    const next = script[opts.role]?.shift();
    if (!next) throw new Error(`unscripted ${opts.role} call`);
    return Promise.resolve(typeof next === "function" ? next(opts) : next);
  };
  return { claude, calls };
}

/** The image addresses a request carries, in order. */
function imageUrls(opts: CallClaudeOptions): string[] {
  const messages = opts.params.messages as { content: { type: string; source?: { url: string } }[] }[];
  return messages.flatMap((message) => message.content.filter((block) => block.type === "image").map((block) => block.source!.url));
}

const perceiveAll: Step = (opts) =>
  ok({
    images: imageUrls(opts).map((_, index) => ({ index, subject_box: [0.1, 0.1, 0.6, 0.6], focal: [0.4, 0.4], flags: [], alt: `A walnut piece, view ${index}` })),
  });

const WORDS = {
  chapters: [
    { key: "cover", headline: "The living room is on its way", standing: "The walnut sofa is in the workshop." },
    { key: "house", headline: "Two rooms, read from the front door", standing: "The living room leads." },
    { key: "room-1", headline: "Walnut and oak", standing: "The sofa and table are under way." },
    { key: "room-2", headline: "A marble table", standing: "The table is chosen." },
    { key: "progress", headline: "In the workshop, then here", standing: "Pieces are being made." },
  ],
  doorstep: { standing: "The living room is being made." },
  notice: "The page now opens on the oak table; everything else is where it was.",
};

const judgeOk = ok({ ok: true, term: null }, 0.001, "claude-haiku-5-5");

function deps(db: Db, claude: (opts: CallClaudeOptions) => Promise<CallClaudeResult>, privacyLive = false) {
  return { db, claude, privacyLive, supabaseUrl: "https://project.supabase.co" };
}

function finishArgs(called: (fn: string) => { args?: Record<string, unknown> }[]) {
  const finish = called("finish_client_edition");
  assertEquals(finish.length, 1);
  return finish[0].args!;
}

Deno.test("full edition: A1 on sendable unperceived pictures, A2 inside the top tier, B words, judge, finish", async () => {
  const { db, called } = fakeDb();
  const { claude, calls } = fakeClaude({
    perceive: [perceiveAll],
    draft: [ok({ hero: { index: 1, why: "The table reads the room." }, held: [0] }), ok(WORDS)],
    judge: [judgeOk],
  });
  const outcome = await composeRequest(REQUEST, deps(db, claude));

  assertEquals(outcome.result, "composed");
  assertEquals(calls.map((c) => c.role), ["perceive", "draft", "draft", "judge"]);
  for (const call of calls) {
    assertEquals(call.feature, "client-edition-compose");
    assertEquals(call.promptVersion, "e1");
    assertEquals(call.studioId, "studio-1");
    const system = call.params.system as { cache_control?: unknown }[];
    assertEquals(system[0].cache_control, { type: "ephemeral" });
  }
  // A1: not the designer-placed table, not the perceived marble, not the scan (privacy page not live), never the sheet or board.
  assertEquals(imageUrls(calls[0]), [
    "https://maker.example/sofa.jpg",
    "https://maker.example/sofa-white.jpg",
    "https://renders.example/living.jpg",
  ]);
  assertEquals(called("record_plate_perception").map((c) => [c.args!.p_asset_id, c.args!.p_prompt_version]), [
    ["a-sofa", "e1"],
    ["a-sofa-maker", "e1"],
    ["a-concept", "e1"],
  ]);
  // A2: top tier (studio) candidates that can be sent, in rank order.
  assertEquals(imageUrls(calls[1]), ["https://maker.example/sofa.jpg", "https://maker.example/table.jpg"]);

  const args = finishArgs(called);
  assertEquals(args.p_lease_token, "lease-1");
  assertEquals([args.p_status, args.p_kind, args.p_prompt_version, args.p_model], ["awaiting_review", "full", "e1", "claude-sonnet-5-5"]);
  assertEquals(args.p_cost_usd, 0.031);
  const composition = args.p_composition as Record<string, unknown>;
  assertEquals(composition.sourceHash, await sourceHash(facts()));
  assertEquals(composition.voice, "model");
  assertEquals(composition.hero, { assetId: "a-table", why: "The table reads the room." });
  assertEquals((composition.chapters as { key: string }[]).map((c) => c.key), ["cover", "house", "room-r1", "room-r2", "progress"]);
  assertEquals(composition.notice, WORDS.notice);
  assertEquals(args.p_images, [
    { asset_id: "a-table", plate_role: "hero", crop_key: "none", rank: 0, chapter_key: "cover", alt: null, caption_what: "a-table what", caption_whose: "Studio", caption_when: "2026-10" },
    { asset_id: "a-sofa", plate_role: "held", crop_key: "none", rank: 1, chapter_key: "room-r1", alt: "A walnut piece, view 0", caption_what: "a-sofa what", caption_whose: "Studio", caption_when: "2026-10" },
  ]);
});

Deno.test("privacy page live: the scan reaches A1 and A2 through the ownership check and a signed address", async () => {
  const { db, called } = fakeDb();
  const { claude, calls } = fakeClaude({
    perceive: [perceiveAll],
    draft: [ok({ hero: { index: 1, why: "The measured room." }, held: [] }), ok(WORDS)],
    judge: [judgeOk],
  });
  await composeRequest(REQUEST, deps(db, claude, true));

  assert(imageUrls(calls[0]).includes(SCAN_URL));
  assertEquals(imageUrls(calls[1]), ["https://maker.example/sofa.jpg", SCAN_URL, "https://maker.example/table.jpg"]);
  assertEquals(called("client_plate_source_owned").length, 1);
  assertEquals((finishArgs(called).p_composition as { hero: unknown }).hero, { assetId: "a-scan", why: "The measured room." });
  for (const call of calls) {
    const body = JSON.stringify(call.params);
    assert(!body.includes("drawings.example") && !body.includes("boards.example"), "sheets and boards are never sent");
  }
});

Deno.test("privacyPageLive reads CLIENT_PRIVACY_PAGE_LIVE: only the string 'true' turns it on", () => {
  const before = Deno.env.get("CLIENT_PRIVACY_PAGE_LIVE");
  try {
    Deno.env.delete("CLIENT_PRIVACY_PAGE_LIVE");
    assertEquals(privacyPageLive(), false);
    Deno.env.set("CLIENT_PRIVACY_PAGE_LIVE", "1");
    assertEquals(privacyPageLive(), false);
    Deno.env.set("CLIENT_PRIVACY_PAGE_LIVE", "true");
    assertEquals(privacyPageLive(), true);
  } finally {
    if (before === undefined) Deno.env.delete("CLIENT_PRIVACY_PAGE_LIVE");
    else Deno.env.set("CLIENT_PRIVACY_PAGE_LIVE", before);
  }
});

function approved(composition: Record<string, unknown>, hash: string | null, assets: { sha256: string }[]): CurrentEdition {
  return { id: "edition-0", source_hash: hash, composition, facts: { assets } };
}

Deno.test("plates only: words byte-identical to the approved edition publish without review", async () => {
  const keyed = WORDS.chapters.map((c) => ({ ...c, key: c.key === "room-1" ? "room-r1" : c.key === "room-2" ? "room-r2" : c.key }));
  const current = approved({ chapters: keyed, doorstep: WORDS.doorstep, notice: WORDS.notice, hero: { assetId: "a-sofa" } }, "old-hash", [{ sha256: "a-sofa-sha" }]);
  const { db, called } = fakeDb({ current });
  const { claude, calls } = fakeClaude({
    perceive: [perceiveAll],
    draft: [ok({ hero: { index: 1, why: "The table." }, held: [] }), ok(WORDS)],
    judge: [judgeOk],
  });
  await composeRequest(REQUEST, deps(db, claude));

  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["approved", "plates_only"]);
  // B was shown the approved words, rekeyed by position, never by room id.
  const body = JSON.parse((calls[2].params.messages as { content: { text: string }[] }[])[0].content[0].text);
  assertEquals(body.current.chapters.map((c: { key: string }) => c.key), ["cover", "house", "room-1", "room-2", "progress"]);
  assertEquals(body.opening, { now: "Oak table, Living room", before: "Walnut sofa, Living room" });
});

Deno.test("a changed word makes a full edition that waits for review", async () => {
  const current = approved({ chapters: [], doorstep: { standing: "Older." }, notice: "Older." }, "old-hash", []);
  const { db, called } = fakeDb({ current });
  const { claude } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS)], judge: [judgeOk] });
  await composeRequest(REQUEST, deps(db, claude));
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["awaiting_review", "full"]);
});

Deno.test("skip unchanged: same source hash and the same pictures close the request without an edition", async () => {
  const fixture = facts();
  const current = approved({}, await sourceHash(fixture), fixture.assets.map((a) => ({ sha256: a.sha256 })).reverse());
  const { db, called } = fakeDb({ current });
  const { claude, calls } = fakeClaude({});
  const outcome = await composeRequest(REQUEST, deps(db, claude));

  assertEquals([outcome.result, outcome.reason], ["skipped", "unchanged"]);
  assertEquals(calls.length, 0);
  assertEquals(called("begin_client_edition").length, 0);
  assertEquals(called("close_client_edition_request")[0].args, { p_request_id: "req-1", p_lease_token: "lease-1", p_reason: "unchanged" });
});

Deno.test("same hash but a new picture still composes", async () => {
  const fixture = facts();
  const current = approved({}, await sourceHash(fixture), [{ sha256: "a-sofa-sha" }]);
  const { db, called } = fakeDb({ current });
  const { claude } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS)], judge: [judgeOk] });
  assertEquals((await composeRequest(REQUEST, deps(db, claude))).result, "composed");
  assertEquals(called("begin_client_edition").length, 1);
});

Deno.test("A2 naming a picture outside the candidates falls back to the code pick in rank order", async () => {
  const { db, called } = fakeDb();
  const { claude } = fakeClaude({
    perceive: [perceiveAll],
    draft: [ok({ hero: { index: 5, why: "Out of range." }, held: [0] }), ok(WORDS)],
    judge: [judgeOk],
  });
  await composeRequest(REQUEST, deps(db, claude));
  const args = finishArgs(called);
  assertEquals((args.p_composition as { hero: unknown }).hero, { assetId: "a-sofa", why: null });
  assertEquals((args.p_images as unknown[]).length, 1);
});

Deno.test("two editions today: the begin RAISE closes the request with its reason and nothing is composed", async () => {
  const { db, called } = fakeDb({ beginError: { message: "client_edition_daily_limit: two editions today", code: "P0001" } });
  const { claude, calls } = fakeClaude({});
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals([outcome.result, outcome.reason], ["skipped", "daily_limit"]);
  assertEquals(calls.length, 0);
  assertEquals(called("close_client_edition_request")[0].args!.p_reason, "daily_limit");
  assertEquals(called("finish_client_edition").length, 0);
});

Deno.test("a denied call stops composition: the edition finishes failed with the spend so far", async () => {
  const { db, called } = fakeDb();
  const denied: CallClaudeResult = { ok: false, denied: "budget", reason: null, resetsAt: null };
  const { claude } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), denied] });
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals(outcome.result, "failed");
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_error, args.p_cost_usd], ["failed", "claude budget", 0.02]);
});

Deno.test("a refused finish counts the request as failed, keeping the spend", async () => {
  const { db } = fakeDb({ finishError: { message: "lease lost" } });
  const { claude } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS)], judge: [judgeOk] });
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals([outcome.result, outcome.reason, outcome.usd], ["failed", "finish failed", 0.031]);
});

Deno.test("runBatch claims five, composes in turn, and sums the cost", async () => {
  const second = { ...REQUEST, id: "req-2", lease_token: "lease-2" };
  const { db, called } = fakeDb({ requests: [REQUEST, second] });
  const { claude } = fakeClaude({
    perceive: [perceiveAll, perceiveAll],
    draft: [ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS), ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS)],
    judge: [judgeOk, judgeOk],
  });
  const summary = await runBatch(deps(db, claude));
  assertEquals(called("claim_client_edition_requests")[0].args, { p_limit: 5 });
  assertEquals([summary.claimed, summary.composed, summary.skipped, summary.failed], [2, 2, 0, 0]);
  assertEquals(summary.cost_usd, 0.062);
  assertEquals(runStatus(summary), { status: "succeeded", error: null });
  assertEquals(runStatus({ ...summary, claimed: 0 }).status, "skipped");
  assertEquals(runStatus({ ...summary, failed: 2 }).status, "failed");
});

// The Phase 1 rule lives in apps/client-portal/src/lib/editorial/chapters.ts.
// These expectations were produced by running that file; a change to either
// copy must change this fixture.
const item = (nameAsSigned: string, status: string | null = null) => ({ id: nameAsSigned, nameAsSigned, status, assetIds: [] });
const room = (id: string, name: string, items: ReturnType<typeof item>[]): FactsRoom => ({ id, name, anchor: `room-${id}`, items });
const HEADLINE_FIXTURE: { phase: string; rooms: FactsRoom[]; expected: string[] }[] = [
  {
    phase: "procurement",
    rooms: [
      room("a", "Living room", [item("Walnut and linen sofa"), item("Oak side table"), item("Brass floor lamp", "in production")]),
      room("b", "Dining room", [item("Marble dining table"), item("Cane chair")]),
    ],
    expected: ["The living room is on its way", "Two rooms, read from the front door", "Walnut, linen and oak", "Marble and cane", "In production, then on the truck, then here"],
  },
  {
    phase: "procurement",
    rooms: [room("c", "Study", [item("Desk", "delivered")])],
    expected: ["The pieces are on their way", "One room, read from the front door", "Study", "In production, then on the truck, then here"],
  },
  {
    phase: "installation",
    rooms: [room("d", "Bedroom", [item("Bouclé chair"), item("Boucle ottoman"), item("Velvet headboard"), item("Steel bed frame")])],
    expected: ["The rooms are going in", "One room, read from the front door", "Bouclé, velvet and steel", "In production, then on the truck, then here"],
  },
  { phase: "final_walkthrough", rooms: [], expected: ["The house, as finished", "No rooms, read from the front door", "In production, then on the truck, then here"] },
  {
    phase: "design_development",
    rooms: Array.from({ length: 11 }, (_, i) => room(`r${i}`, `Room ${i}`, [])),
    expected: ["The rooms, as drawn", "The rooms, read from the front door", ...Array.from({ length: 11 }, (_, i) => `Room ${i}`), "In production, then on the truck, then here"],
  },
];

Deno.test("deterministic headlines match the client portal's Phase 1 rule (shared fixture)", () => {
  for (const { phase, rooms, expected } of HEADLINE_FIXTURE) {
    const headlines = deterministicHeadlines({ project: { id: "p", name: "P", phase }, rooms, assets: [] });
    assertEquals(headlines.map((h) => h.headline), expected);
    assertEquals(headlines.slice(2, 2 + rooms.length).map((h) => h.key), rooms.map((r) => r.anchor));
  }
});
