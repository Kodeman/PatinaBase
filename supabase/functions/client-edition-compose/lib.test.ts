import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FakeTime } from "https://deno.land/std@0.224.0/testing/time.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { callClaude, type CallClaudeOptions, type CallClaudeResult, LEDGER_SETTLE_MS, type LlmLedgerPort } from "../_shared/claude.ts";
import {
  composeRequest,
  type CurrentEdition,
  type Db,
  type DbError,
  type DbResult,
  deterministicHeadlines,
  meetsHero,
  type EditionOverrides,
  type EditionRequest,
  privacyPageLive,
  runBatch,
  runStatus,
  sleepFor,
  sourceHash,
} from "./lib.ts";
import { PROMPT_VERSION, type EditorialFacts, type FactsRoom } from "./prompts.ts";
import { headlineFault } from "./validate.ts";

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
  crops: { piece: { rect: [0, 0, width, height], widths: [256, 512, 768] } },
  alt: null,
  caption: { what: `${id} what`, whose: "Studio", when: "2026-10" },
  perceivedPromptVersion: null,
  focalOrigin: null,
  perceivedAlt: null,
  perceivedFlags: [],
  ...extra,
});

function facts(): EditorialFacts {
  return {
    project: {
      id: PROJECT,
      name: "Hillside",
      phase: "procurement",
      targetDate: "2027-03-01",
      showMakers: true,
      studio: { id: "studio-1", name: "Larch Studio", town: "Wexford" },
    },
    rooms: [
      {
        id: "r1",
        name: "Living room",
        anchor: "room-r1",
        conceptAssetId: "a-concept",
        scanAssetIds: ["a-scan"],
        items: [
          { id: "i1", nameAsSigned: "Walnut sofa", status: "in production", makerName: "Kettle Joinery", assetIds: ["a-sofa", "a-sofa-maker"] },
          { id: "i2", nameAsSigned: "Oak table", status: "ordered", assetIds: ["a-table"] },
        ],
      },
      { id: "r2", name: "Dining room", anchor: "room-r2", items: [{ id: "i3", nameAsSigned: "Marble table", assetIds: ["a-marble"] }] },
    ],
    assets: [
      asset("a-sofa", "upload", 3000, 2000),
      // Portrait: meets the hero floors and the held floor (0.46, 780×1696).
      asset("a-table", "upload", 1800, 2400, { focalOrigin: "designer" }),
      asset("a-sofa-maker", "maker", 2000, 1500, { ground: "white" }),
      asset("a-marble", "upload", 800, 600, { perceivedPromptVersion: "e1" }),
      asset("a-concept", "concept", 2400, 1600),
      asset("a-scan", "scan", 2600, 1800),
      asset("a-sheet", "sheet", 3000, 2000, { ground: "drawing" }),
      asset("a-board", "board", 2000, 1400),
    ],
    palette: [{ hex: "#556B2F", brand: "Farrow", name: "Moss" }],
    boards: [],
    sheets: [],
  } as unknown as EditorialFacts;
}

interface Row {
  id: string;
  asset_id: string;
  source_kind: string;
  status: string;
}

let rowCount = 0;
/** Ids rise in the order rows are made, so a later row sorts after an earlier one. */
const row = (asset_id: string, source_kind: string, status = "done"): Row => ({
  id: `p-${String(rowCount++).padStart(6, "0")}`,
  asset_id,
  source_kind,
  status,
});

const ROWS: Row[] = [
  row("a-sofa", "upload"),
  row("a-table", "upload"),
  row("a-sofa-maker", "maker"),
  row("a-marble", "upload"),
  row("a-concept", "concept"),
  row("a-scan", "scan"),
  row("a-sheet", "sheet"),
  row("a-board", "board"),
];

/** A clock that moves only when a bounded wait runs out or a slow call answers. */
function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    sleep: (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          time += ms;
          resolve();
        }, 1);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      }),
    /** Answers after `ms` on this clock (a few real milliseconds), unless `signal` aborts it first. */
    slow<T>(ms: number, reply: () => T, signal?: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          time += ms;
          try {
            resolve(reply());
          } catch (cause) {
            reject(cause);
          }
        }, 20);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
    },
  };
}

type Clock = ReturnType<typeof fakeClock>;

/** A wait that never runs out: nothing here is slow unless a clock says so. */
const waitForAbort = (_ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

/** PostgREST's max_rows (supabase/config.toml): no one select returns more. */
const MAX_ROWS = 1_000;

interface DbOptions {
  facts?: EditorialFacts;
  current?: CurrentEdition | null;
  rows?: Row[];
  beginError?: DbError;
  closeError?: DbError;
  /** How many finish_client_edition calls return this error before one succeeds. */
  finishError?: { error: DbError; times: number };
  /** How many finish_client_edition calls throw before one succeeds (true: every one). */
  finishThrows?: boolean | number;
  /** How many finish_client_edition calls land, then throw as if their answer were lost. */
  ackLost?: number;
  /** Errors for successive claims (null: that claim succeeds; "throw": that claim throws). */
  claimErrors?: (DbError | "throw" | null)[];
  requests?: EditionRequest[];
  /** Rows the first provenance page counts beyond those any page returns. */
  uncounted?: number;
  /** The project's item lines and vendor records (id → name): the makers-off name set. */
  makers?: { lines: { id: string; vendor_id: string | null; vendor_name: string | null }[]; vendors: Record<string, string> };
  /** Calls (an rpc name, or "provenance") that answer only after `ms` on `clock`, unless their window aborts them. */
  slow?: { clock: Clock; ms: number; fns: string[] };
}

function fakeDb(options: DbOptions = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const queue = [...(options.requests ?? [REQUEST])];
  let finishErrors = options.finishError?.times ?? 0;
  let finishThrows = options.finishThrows === true ? Infinity : Number(options.finishThrows ?? 0);
  let ackLost = options.ackLost ?? 0;
  let editionStatus = "drafting";
  const replies: Record<string, (args?: Record<string, unknown>) => DbResult<unknown>> = {
    claim_client_edition_requests: (args) => {
      const error = options.claimErrors?.shift() ?? null;
      if (error === "throw") throw new Error("connection reset");
      const claimed = error ? [] : queue.splice(0, Number(args?.p_limit ?? 1));
      return { data: claimed.length ? claimed : null, error };
    },
    get_project_editorial_facts: () => ({ data: structuredClone(options.facts ?? facts()), error: null }),
    begin_client_edition: () => (options.beginError ? { data: null, error: options.beginError } : { data: "edition-1", error: null }),
    close_client_edition_request: () => ({ data: null, error: options.closeError ?? null }),
    client_plate_source_owned: () => ({ data: true, error: null }),
    finish_client_edition: (args) => {
      if (finishThrows-- > 0) throw new Error("connection reset");
      if (finishErrors-- > 0) return { data: null, error: options.finishError!.error };
      editionStatus = String(args?.p_status);
      if (ackLost-- > 0) throw new Error("connection reset after the write");
      return { data: null, error: null };
    },
  };
  const rows = options.rows ?? ROWS;
  const named = (ids: string[]) => rows.filter((r) => ids.includes(r.asset_id));
  const answer = <T>(fn: string, reply: () => T, signal?: AbortSignal): Promise<T> => {
    if (options.slow?.fns.includes(fn)) return options.slow.clock.slow(options.slow.ms, reply, signal);
    try {
      return Promise.resolve(reply());
    } catch (cause) {
      return Promise.reject(cause);
    }
  };
  const page = (ids: string[], after: string | null, limit: number) => {
    const all = named(ids).sort((a, b) => (a.id < b.id ? -1 : 1));
    const rows = all.filter((r) => after === null || r.id > after).slice(0, Math.min(limit, MAX_ROWS));
    const total = after === null ? all.length + (options.uncounted ?? 0) : null;
    return { data: { rows: rows.map(({ id, asset_id, source_kind }) => ({ id, asset_id, source_kind })), total }, error: null };
  };
  const db = {
    rpc(fn: string, args?: Record<string, unknown>, signal?: AbortSignal) {
      calls.push({ fn, args });
      return answer(fn, () => replies[fn]?.(args) ?? { data: null, error: null }, signal);
    },
    approvedEdition: () => Promise.resolve({ data: options.current ?? null, error: null }),
    provenancePage: (_project: string, ids: string[], after: string | null, limit: number, signal?: AbortSignal) =>
      answer("provenance", () => page(ids, after, limit), signal),
    makerLines: (_project: string, after: string | null, limit: number, signal?: AbortSignal) => {
      calls.push({ fn: "makerLines", args: { after } });
      return answer("makers", () => {
        const all = [...(options.makers?.lines ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
        const lines = all.filter((line) => after === null || line.id > after).slice(0, Math.min(limit, MAX_ROWS));
        return { data: { rows: lines, total: after === null ? all.length : null }, error: null };
      }, signal);
    },
    vendorNames: (ids: string[]) => Promise.resolve({ data: ids.flatMap((id) => options.makers?.vendors[id] ?? []), error: null }),
    editionStatus: () => Promise.resolve({ data: editionStatus, error: null }),
    // e5bdbaf4's port, kept so each negative control fails there by assertion:
    // one select, cut at max_rows as the server cuts it.
    provenance: (_project: string, ids: string[]) =>
      answer("provenance", () => ({ data: named(ids).slice(0, MAX_ROWS).map(({ asset_id, source_kind }) => ({ asset_id, source_kind })), error: null })),
    // ad32ba43's port, kept so each negative control fails there by assertion:
    // its adapter read only done rows, each with the address it was copied from.
    plateSources: (_project: string, ids: string[]) =>
      Promise.resolve({
        data: named(ids).filter((r) => r.status === "done").map((r) => ({
          project_id: PROJECT,
          source_kind: r.source_kind,
          source_ref: { table: "project_ffe_item_images", id: `${r.asset_id}-src` },
          source_url: `https://cdn.example/${r.asset_id}-sha.jpg`,
          asset_id: r.asset_id,
        })),
        error: null,
      }),
    sign: (bucket: string, path: string) => Promise.resolve(`https://signed.example/${bucket}/${path}`),
  };
  const called = (fn: string) => calls.filter((call) => call.fn === fn);
  return { db: db as Db, calls, called };
}

const encoder = new TextEncoder();

/** A WebP-tagged payload naming the path it was read from, so a test can tell which plate a model saw. */
function webp(text: string): Uint8Array<ArrayBuffer> {
  const body = encoder.encode(text);
  const bytes = new Uint8Array(12 + body.length);
  bytes.set(encoder.encode("RIFF"));
  bytes.set(encoder.encode("WEBP"), 8);
  bytes.set(body, 12);
  return bytes;
}

function fakeMedia(missing: string[] = []) {
  const paths: string[] = [];
  const media = (path: string) => {
    paths.push(path);
    const served = !missing.some((id) => path.includes(`/${id}-sha/`));
    return Promise.resolve(served ? new Response(webp(path), { headers: { "content-type": "image/webp" } }) : new Response(null, { status: 404 }));
  };
  return { media, paths };
}

type Block = { type: string; text?: string; source?: { type: string; media_type?: string; data?: string; url?: string } };

function blocks(opts: CallClaudeOptions): Block[] {
  return (opts.params.messages as { content: Block[] }[]).flatMap((message) => message.content);
}

/** The assets a request shows, in order (from the rendition's path; on ad32ba43, from the address). */
function shown(opts: CallClaudeOptions): string[] {
  return blocks(opts).filter((block) => block.type === "image").map((block) => {
    const text = block.source?.data ? atob(block.source.data).slice(12) : block.source?.url ?? "";
    return /\/(a-[a-z-]+)-sha[./]/.exec(text)?.[1] ?? text;
  });
}

function ok(value: unknown, usd = 0.01, model = "claude-sonnet-5-5"): CallClaudeResult {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { ok: true, response: { stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }, usd, model };
}

type Step = CallClaudeResult | ((opts: CallClaudeOptions) => CallClaudeResult);

function fakeClaude(script: Record<string, Step[]>, tick?: () => void) {
  const calls: CallClaudeOptions[] = [];
  const claude = (opts: CallClaudeOptions) => {
    calls.push(opts);
    tick?.();
    const next = script[opts.role]?.shift();
    if (!next) throw new Error(`unscripted ${opts.role} call`);
    return Promise.resolve(typeof next === "function" ? next(opts) : next);
  };
  return { claude, calls };
}

const perceptionOf = (ids: string[]) => ({
  images: ids.map((_, index) => ({ index, subject_box: [0.4, 0.3, 0.2, 0.3], focal: [0.4, 0.4], flags: [], alt: `A walnut piece, view ${index}` })),
});

const perceiveAll: Step = (opts) => ok(perceptionOf(shown(opts)));

const WORDS = {
  chapters: [
    { key: "cover", headline: "The sofa is on its way", standing: "The walnut sofa is in the workshop." },
    { key: "house", headline: "The house", standing: "The living room leads." },
    { key: "room-1", headline: "Walnut and oak", standing: "The sofa and table are under way." },
    { key: "room-2", headline: "A marble table", standing: "The table is chosen." },
    { key: "progress", headline: "In the workshop", standing: "Pieces are being made." },
  ],
  doorstep: { standing: "The living room is being made." },
  notice: "The page now opens on the walnut sofa; everything else is where it was.",
};

/** WORDS as a composition stores them: rooms keyed by anchor. */
const ANCHORED = WORDS.chapters.map((c) => ({ ...c, key: ({ "room-1": "room-r1", "room-2": "room-r2" } as Record<string, string>)[c.key] ?? c.key }));

const judgeOk = ok({ ok: true, term: null }, 0.001, "claude-haiku-5-5");

/** Answers whatever is asked, so every call a composition makes is made. */
function respond(answers: { hero?: unknown; words?: unknown; perceive?: (ids: string[]) => unknown } = {}) {
  const hero = answers.hero ?? { hero: { index: 0, why: "Calm." }, held: [] };
  const words = answers.words ?? WORDS;
  const perceive = answers.perceive ?? perceptionOf;
  return (opts: CallClaudeOptions): CallClaudeResult => {
    const ids = shown(opts);
    if (opts.role === "perceive") return ok(perceive(ids));
    if (opts.role === "judge") return judgeOk;
    return ok(ids.length ? hero : words);
  };
}

function claudeOf(answer: (opts: CallClaudeOptions) => CallClaudeResult) {
  const calls: CallClaudeOptions[] = [];
  const claude = (opts: CallClaudeOptions) => {
    calls.push(opts);
    return Promise.resolve(answer(opts));
  };
  return { claude, calls };
}

interface DepsOptions {
  privacyLive?: boolean;
  media?: (path: string) => Promise<Response>;
  now?: () => number;
  deadline?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

function deps(db: Db, claude: (opts: CallClaudeOptions) => Promise<CallClaudeResult>, options: DepsOptions = {}) {
  // supabaseUrl is ad32ba43's port, kept for the negative controls.
  const legacy = { supabaseUrl: "https://project.supabase.co" };
  return {
    ...legacy,
    db,
    claude,
    privacyLive: options.privacyLive ?? false,
    media: options.media ?? fakeMedia().media,
    now: options.now ?? (() => 0),
    deadline: options.deadline ?? 120_000,
    sleep: options.sleep ?? waitForAbort,
  };
}

function finishArgs(called: (fn: string) => { args?: Record<string, unknown> }[]) {
  const finish = called("finish_client_edition");
  assertEquals(finish.length, 1);
  return finish[0].args!;
}

const composition = (args: Record<string, unknown>) =>
  args.p_composition as Record<string, unknown> & { hero: { assetId: string; why: string | null } | null };
const wordsCall = (calls: CallClaudeOptions[]) => calls.find((call) => call.role === "draft" && shown(call).length === 0)!;
const wordsBody = (calls: CallClaudeOptions[]) => JSON.parse(blocks(wordsCall(calls))[0].text!);

function approved(composition: Record<string, unknown>, hash: string | null, frozen: unknown, overrides: EditionOverrides | null = null): CurrentEdition {
  return { id: "edition-0", source_hash: hash, composition, facts: frozen, overrides };
}

Deno.test("full edition: A1 on sendable unperceived pictures, A2 inside the top tier, B words, judge, finish", async () => {
  const { db, called } = fakeDb();
  const { claude, calls } = fakeClaude({
    perceive: [perceiveAll],
    draft: [ok({ hero: { index: 0, why: "The sofa reads the room." }, held: [1] }), ok(WORDS)],
    judge: [judgeOk],
  });
  const outcome = await composeRequest(REQUEST, deps(db, claude));

  assertEquals(outcome.result, "composed");
  assertEquals(calls.map((c) => c.role), ["perceive", "draft", "draft", "judge"]);
  for (const call of calls) {
    assertEquals(call.feature, "client-edition-compose");
    assertEquals(call.promptVersion, PROMPT_VERSION);
    assertEquals(call.studioId, "studio-1");
    assert(call.timeoutMs <= 60_000);
    const system = call.params.system as { cache_control?: unknown }[];
    assertEquals(system[0].cache_control, { type: "ephemeral" });
  }
  // A1: every unperceived sendable picture, the designer-framed table included; never
  // the perceived marble, the scan (privacy page not live), the sheet or the board.
  assertEquals(shown(calls[0]), ["a-sofa", "a-table", "a-sofa-maker", "a-concept"]);
  assertEquals(called("record_plate_perception").map((c) => c.args!.p_asset_id), ["a-sofa", "a-table", "a-sofa-maker", "a-concept"]);
  // A2: top tier (studio) candidates that can be sent, in rank order.
  assertEquals(shown(calls[1]), ["a-sofa", "a-table"]);

  const args = finishArgs(called);
  assertEquals(args.p_lease_token, "lease-1");
  assertEquals([args.p_status, args.p_kind, args.p_prompt_version, args.p_model], ["awaiting_review", "full", PROMPT_VERSION, "claude-sonnet-5-5"]);
  assertEquals(args.p_cost_usd, 0.031);
  assertEquals(args.p_facts, facts(), "the facts are frozen as read");
  const written = composition(args);
  assertEquals(written.sourceHash, await sourceHash(facts()));
  assertEquals(written.voice, "model");
  assertEquals(written.hero, { assetId: "a-sofa", why: "The sofa reads the room." });
  assertEquals(written.held, ["a-table"]);
  assertEquals((written.chapters as { key: string }[]).map((c) => c.key), ["cover", "house", "room-r1", "room-r2", "progress"]);
  assertEquals(written.notice, WORDS.notice);
  assertEquals(args.p_images, [
    { asset_id: "a-sofa", plate_role: "hero", crop_key: "none", rank: 0, chapter_key: "cover", alt: "A walnut piece, view 0", caption_what: "a-sofa what", caption_whose: "Studio", caption_when: "2026-10" },
    { asset_id: "a-table", plate_role: "held", crop_key: "none", rank: 1, chapter_key: "room-r1", alt: "A walnut piece, view 1", caption_what: "a-table what", caption_whose: "Studio", caption_when: "2026-10" },
  ]);
});

Deno.test("F12: models see each plate's stored rendition as base64 WebP; one the media worker cannot serve is dropped alone", async () => {
  const { db } = fakeDb();
  const { media, paths } = fakeMedia(["a-sofa-maker"]);
  const { claude, calls } = claudeOf(respond());
  await composeRequest(REQUEST, deps(db, claude, { media }));

  assertEquals(shown(calls[0]), ["a-sofa", "a-table", "a-concept"]);
  for (const call of calls) {
    for (const block of blocks(call).filter((b) => b.type === "image")) {
      assertEquals([block.source?.type, block.source?.media_type], ["base64", "image/webp"]);
    }
    const body = JSON.stringify(call.params);
    for (const leak of ["http", ".jpg", "/plates/", "-sha"]) assert(!body.includes(leak), `"${leak}" reached a ${call.role} request`);
  }
  assert(paths.includes(`/plates/${PROJECT}/a-sofa-sha/piece-768.webp`), "perception reads the larger rendition");
  assert(paths.includes(`/plates/${PROJECT}/a-sofa-sha/piece-512.webp`), "the hero pick reads the smaller one");
});

Deno.test("privacy page live: the scan reaches A1 and A2 as its rendition", async () => {
  const { db, called } = fakeDb();
  const { claude, calls } = fakeClaude({
    perceive: [perceiveAll],
    draft: [ok({ hero: { index: 1, why: "The measured room." }, held: [] }), ok(WORDS)],
    judge: [judgeOk],
  });
  await composeRequest(REQUEST, deps(db, claude, { privacyLive: true }));

  assert(shown(calls[0]).includes("a-scan"));
  assertEquals(shown(calls[1]), ["a-sofa", "a-scan", "a-table"]);
  assertEquals(composition(finishArgs(called)).hero, { assetId: "a-scan", why: "The measured room." });
  for (const call of calls) assert(!shown(call).includes("a-sheet") && !shown(call).includes("a-board"), "sheets and boards are never sent");
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

Deno.test("F1: provenance in any status, or none at all, keeps a picture from every model and from the hero", async () => {
  const fixture = facts();
  fixture.assets.unshift(asset("a-orphan", "upload", 4000, 2600) as EditorialFacts["assets"][number]);
  fixture.rooms[0].items[0].assetIds = ["a-orphan", "a-sofa", "a-sofa-maker"];
  // The sofa's bytes also came from a drawing sheet, whose request is queued for a recrop.
  const rows = [...ROWS, row("a-sofa", "sheet", "queued")];
  for (const privacyLive of [false, true]) {
    const { db, called } = fakeDb({ facts: fixture, rows });
    const { claude, calls } = claudeOf(respond());
    await composeRequest(REQUEST, deps(db, claude, { privacyLive }));
    for (const call of calls) {
      assert(!shown(call).includes("a-sofa"), "a picture with sheet provenance is never sent");
      assert(!shown(call).includes("a-orphan"), "a picture with no provenance is never sent");
    }
    const hero = composition(finishArgs(called)).hero?.assetId;
    assert(hero && !["a-sofa", "a-orphan"].includes(hero), `hero ${hero}`);
  }
});

Deno.test("F2: once the studio stops showing makers, Call B gets no earlier words that could name one", async () => {
  const fixture = facts();
  fixture.project.showMakers = false;
  const current = approved({
    chapters: [{ key: "cover", headline: "Kettle Joinery is making the sofa", standing: "Kettle Joinery has it in hand." }],
    doorstep: { standing: "Kettle Joinery is at work." },
    notice: "Kettle Joinery started.",
    hero: { assetId: "a-sofa" },
  }, "old-hash", fixture);
  const { db } = fakeDb({ facts: fixture, current });
  const { claude, calls } = claudeOf(respond());
  await composeRequest(REQUEST, deps(db, claude));

  assertEquals(wordsBody(calls).current, null);
  for (const call of calls) assert(!JSON.stringify(call.params).includes("Kettle"), `a maker reached a ${call.role} request`);
});

Deno.test("F4: a flagged picture, flagged before or now, is never the hero, held or offered to A2", async () => {
  const before = facts();
  Object.assign(before.assets[0], { perceivedPromptVersion: "e1", perceivedFlags: ["people"] });
  const flaggedNow = (ids: string[]) => ({
    images: ids.map((id, index) => ({ index, subject_box: [0.4, 0.3, 0.2, 0.3], focal: [0.4, 0.4], flags: id === "a-table" ? ["watermark"] : [], alt: "A piece." })),
  });
  for (const [fixture, flagged] of [[before, "a-sofa"], [facts(), "a-table"]] as const) {
    const { db, called } = fakeDb({ facts: fixture });
    const { claude, calls } = claudeOf(respond({ perceive: flaggedNow, hero: { hero: { index: 0, why: "Calm." }, held: [1] } }));
    await composeRequest(REQUEST, deps(db, claude));
    for (const call of calls.filter((c) => c.role === "draft")) assert(!shown(call).includes(flagged), `A2 was offered ${flagged}`);
    const written = composition(finishArgs(called));
    assert(written.hero?.assetId !== flagged, `${flagged} opened the page`);
    assert(!(written.held as string[]).includes(flagged), `${flagged} was held`);
  }
});

Deno.test("F5: a close the database refuses leaves the request unsettled, after one retry", async () => {
  const fixture = facts();
  const current = approved({ chapters: ANCHORED }, await sourceHash(fixture), fixture);
  const { db, called } = fakeDb({ current, closeError: { message: "not leased under this token" } });
  const { claude } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals(outcome.result, "unsettled");
  assertEquals(called("close_client_edition_request").length, 2);
});

Deno.test("F5: a refused finish is retried, then recorded failed with the spend rather than left drafting", async () => {
  const { db, called } = fakeDb({ finishError: { error: { message: "lease lost" }, times: 2 } });
  const { claude } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  const finishes = called("finish_client_edition").map((c) => c.args!);
  assertEquals(finishes.length, 3);
  assertEquals([finishes[2].p_status, finishes[2].p_error, finishes[2].p_cost_usd], ["failed", "finish refused: lease lost", 0.031]);
  assertEquals([outcome.result, outcome.reason, outcome.usd], ["failed", "finish refused: lease lost", 0.031]);
});

Deno.test("F5: a finish that throws keeps the request's spend in the run", async () => {
  const { db } = fakeDb({ finishThrows: true });
  const { claude } = claudeOf(respond());
  const summary = await runBatch(deps(db, claude));
  assertEquals([summary.claimed, summary.unsettled, summary.cost_usd], [1, 1, 0.031]);
  assertEquals(summary.outcomes[0].result, "unsettled");
});

Deno.test("F6: one request at a time, only while a whole edition fits in the run's budget", async () => {
  let now = 0;
  const second = { ...REQUEST, id: "req-2", lease_token: "lease-2" };
  const third = { ...REQUEST, id: "req-3", lease_token: "lease-3" };
  const { db, called } = fakeDb({ requests: [REQUEST, second, third] });
  // Every model call takes 20 seconds.
  const { claude, calls } = claudeOf((opts) => {
    now += 20_000;
    return respond()(opts);
  });
  const summary = await runBatch(deps(db, claude, { now: () => now, deadline: 120_000 }));

  assertEquals(called("claim_client_edition_requests")[0].args, { p_limit: 1 });
  assertEquals(summary.claimed, 1, "the second request is left queued once less than an edition's time remains");
  assert(calls.length > 0);
});

Deno.test("F6: a call that would not leave room for the words is not made; the claim lease bounds the edition", async () => {
  const start = Date.parse("2026-10-21T12:00:00Z");
  // The lease ends 105 s in: the edition stops 30 s before it, at 75 s, well inside the run's 120 s.
  const request = { ...REQUEST, lease_expires_at: new Date(start + 105_000).toISOString() };
  const { db, called } = fakeDb();
  const { claude, calls } = claudeOf(respond());
  const outcome = await composeRequest(request, deps(db, claude, { now: () => start, deadline: start + 120_000 }));

  assertEquals(outcome.result, "composed");
  assertEquals(calls.map((c) => c.role), ["draft", "judge"], "no time for perception or the hero pick");
  assertEquals(calls[0].timeoutMs, 44_000, "B keeps 15 s for the judge, 6 s for its ledger and 10 s for the finish");
  assertEquals(called("record_plate_perception").length, 0);
});

Deno.test("F7: unchanged is judged on every frozen fact; a palette colour or a new picture order composes", async () => {
  const fixture = facts();
  const hash = await sourceHash(fixture);
  const skipped = async (read: EditorialFacts) => {
    const { db, called } = fakeDb({ facts: read, current: approved({ chapters: ANCHORED }, hash, fixture) });
    const { claude } = claudeOf(respond());
    await composeRequest(REQUEST, deps(db, claude));
    return called("begin_client_edition").length === 0;
  };
  assert(await skipped(facts()), "nothing changed");

  const recoloured = facts() as EditorialFacts & { palette: { hex: string }[] };
  recoloured.palette[0].hex = "#1B1B1B";
  assert(!(await skipped(recoloured)), "a palette colour under the same name");

  const reordered = facts();
  reordered.rooms[0].items[0].assetIds = ["a-sofa-maker", "a-sofa"];
  assert(!(await skipped(reordered)), "the same pictures in a new order");

  const live = facts();
  Object.assign(live.assets[0], { focal: [0.2, 0.2], subjectBox: [0, 0, 1, 1] });
  assert(await skipped(live), "the reader reads framing live");

  const flagged = facts();
  Object.assign(flagged.assets[0], { perceivedFlags: ["people"] });
  assert(!(await skipped(flagged)), "a flag-only change: the reader does not re-check held pictures");
});

Deno.test("skip unchanged closes the request without an edition", async () => {
  const fixture = facts();
  const current = approved({ chapters: ANCHORED }, await sourceHash(fixture), fixture);
  const { db, called } = fakeDb({ current });
  const { claude, calls } = fakeClaude({});
  const outcome = await composeRequest(REQUEST, deps(db, claude));

  assertEquals([outcome.result, outcome.reason], ["skipped", "unchanged"]);
  assertEquals(calls.length, 0);
  assertEquals(called("begin_client_edition").length, 0);
  assertEquals(called("close_client_edition_request")[0].args, { p_request_id: "req-1", p_lease_token: "lease-1", p_reason: "unchanged" });
});

Deno.test("F8: a judge that is unavailable twice leaves the deterministic headlines", async () => {
  const refused: CallClaudeResult = { ...ok({ ok: true, term: null }), response: { stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 1 } } } as CallClaudeResult;
  const { db, called } = fakeDb();
  const { claude, calls } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS)], judge: [refused, ok("no verdict here")] });
  await composeRequest(REQUEST, deps(db, claude));
  assertEquals(calls.filter((c) => c.role === "judge").length, 2);
  assertEquals(composition(finishArgs(called)).voice, "deterministic");
});

Deno.test("F8: an unavailable judge is asked once more; a clean second answer keeps the model's words", async () => {
  const { db, called } = fakeDb();
  const { claude } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), ok(WORDS)], judge: [ok({ verdict: "fine" }), judgeOk] });
  await composeRequest(REQUEST, deps(db, claude));
  assertEquals(composition(finishArgs(called)).voice, "model");
});

Deno.test("F10: the model's frame is sent on the grid the recrop uses; a designer's frame is never sent", async () => {
  const { db, called } = fakeDb();
  const frames = (ids: string[]) => ({
    images: ids.map((_, index) => ({ index, subject_box: [0.5, 0.1, 0.5000000005, 0.5], focal: [0.75, 0.30004], flags: [], alt: "A piece." })),
  });
  const { claude } = claudeOf(respond({ perceive: frames }));
  await composeRequest(REQUEST, deps(db, claude));
  const recorded = new Map(called("record_plate_perception").map((c) => [c.args!.p_asset_id, c.args!]));
  assertEquals([recorded.get("a-sofa")!.p_subject_box, recorded.get("a-sofa")!.p_focal], [[0.5, 0.1, 0.5, 0.5], [0.75, 0.3]]);
  const table = recorded.get("a-table");
  assert(table, "a designer-framed picture is still perceived for flags and alt");
  assertEquals([table.p_subject_box, table.p_focal, table.p_flags, table.p_alt], [null, null, [], "A piece."]);
});

Deno.test("F11: an image row keeps the alt an earlier perception wrote, unless the lint now refuses it", async () => {
  const fixture = facts();
  Object.assign(fixture.assets[0], { perceivedPromptVersion: "e1", perceivedAlt: "A walnut sofa under the bay window.", alt: "Walnut sofa, Studio" });
  Object.assign(fixture.assets[1], { perceivedPromptVersion: "e1", perceivedAlt: "A curated oak table.", alt: "Oak table, Studio" });
  const { db, called } = fakeDb({ facts: fixture });
  const { claude } = claudeOf(respond({ hero: { hero: { index: 0, why: "Calm." }, held: [1] } }));
  await composeRequest(REQUEST, deps(db, claude));
  const rows = finishArgs(called).p_images as { asset_id: string; alt: string }[];
  assertEquals(rows.map((r) => [r.asset_id, r.alt]), [["a-sofa", "A walnut sofa under the bay window."], ["a-table", "Oak table, Studio"]]);
});

Deno.test("F13: a held choice below the held floor is dropped", async () => {
  const { db, called } = fakeDb();
  // The 3000×2000 sofa meets the hero floors, but its 0.46 crop keeps under half the frame.
  const { claude } = claudeOf(respond({ hero: { hero: { index: 1, why: "The table." }, held: [0] } }));
  await composeRequest(REQUEST, deps(db, claude));
  const args = finishArgs(called);
  assertEquals([composition(args).hero?.assetId, composition(args).held], ["a-table", []]);
  assertEquals((args.p_images as unknown[]).length, 1);
});

Deno.test("F14: Call B keeps the designer's corrected words; the same words then publish plates only with the overrides kept", async () => {
  const fixture = facts();
  const overrides = { chapters: { cover: { headline: "The sofa, in the workshop" }, house: { headline: null } } };
  const current = approved({ chapters: ANCHORED, doorstep: WORDS.doorstep, notice: WORDS.notice, hero: { assetId: "a-table" } }, "old-hash", fixture, overrides);
  const corrected = { ...WORDS, chapters: WORDS.chapters.map((c) => (c.key === "cover" ? { ...c, headline: "The sofa, in the workshop" } : c)) };
  const { db, called } = fakeDb({ current });
  const { claude, calls } = claudeOf(respond({ words: corrected }));
  await composeRequest(REQUEST, deps(db, claude));

  const body = wordsBody(calls);
  assertEquals(body.current.chapters.map((c: { headline: string }) => c.headline).slice(0, 2), ["The sofa, in the workshop", WORDS.chapters[1].headline]);
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["approved", "plates_only"]);
  // The approved edition's own words, so finish_client_edition finds them unchanged and carries the overrides.
  assertEquals((composition(args).chapters as { headline: string }[])[0].headline, WORDS.chapters[0].headline);
});

Deno.test("closing: matching studio corrections stay in the full draft instead of reverting to raw prose", async () => {
  const captured = { ...facts(), closing: true };
  captured.project.phase = "final_walkthrough";
  const overrides = { chapters: { cover: { headline: "The sofa, in the workshop" }, house: { headline: null } } };
  const current = approved({ chapters: ANCHORED, doorstep: WORDS.doorstep, notice: WORDS.notice, hero: { assetId: "a-table" } }, "old-hash", captured, overrides);
  const corrected = { ...WORDS, chapters: WORDS.chapters.map((c) => (c.key === "cover" ? { ...c, headline: "The sofa, in the workshop" } : c)) };
  const { db, called } = fakeDb({ current });
  const { claude, calls } = claudeOf(respond({ words: corrected }));
  await composeRequest({ ...REQUEST, closing: true, closing_facts: captured }, deps(db, claude));

  assertEquals(wordsBody(calls).current.chapters[0].headline, "The sofa, in the workshop");
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["awaiting_review", "full"]);
  assertEquals((composition(args).chapters as { headline: string }[])[0].headline, "The sofa, in the workshop");
});

Deno.test("F15: plates only compares chapters by key and the doorstep, never the notice", async () => {
  const fixture = facts();
  const shuffled = [...ANCHORED].reverse();
  const current = approved({ chapters: shuffled, doorstep: WORDS.doorstep, notice: "An older notice.", hero: { assetId: "a-table" } }, "old-hash", fixture);
  const { db, called } = fakeDb({ current });
  const { claude, calls } = claudeOf(respond());
  await composeRequest(REQUEST, deps(db, claude));

  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["approved", "plates_only"]);
  assertEquals(composition(args).notice, WORDS.notice);
  // B was shown the approved words, rekeyed by position, never by room id.
  assertEquals(wordsBody(calls).current.chapters.map((c: { key: string }) => c.key), ["progress", "room-2", "room-1", "house", "cover"]);
  assertEquals(wordsBody(calls).opening, { now: "Walnut sofa, Living room", before: "Oak table, Living room" });
});

Deno.test("a changed word makes a full edition that waits for review", async () => {
  const current = approved({ chapters: ANCHORED, doorstep: { standing: "Older." }, notice: "Older." }, "old-hash", facts());
  const { db, called } = fakeDb({ current });
  const { claude } = claudeOf(respond());
  await composeRequest(REQUEST, deps(db, claude));
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["awaiting_review", "full"]);
});

Deno.test("F18: a failed call's billed usage counts toward the edition's cost", async () => {
  const billed: CallClaudeResult = { ok: false, error: "overloaded", status: 529, errorType: "overloaded_error", transient: true, usd: 0.02 };
  const { db, called } = fakeDb();
  const { claude } = fakeClaude({ perceive: [perceiveAll], draft: [ok({ hero: { index: 0, why: "Sofa." } }), billed] });
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_cost_usd], ["failed", 0.04]);
  assertEquals(outcome.usd, 0.04);
});

Deno.test("A2 naming a picture outside the candidates falls back to the code pick in rank order", async () => {
  const { db, called } = fakeDb();
  const { claude } = claudeOf(respond({ hero: { hero: { index: 5, why: "Out of range." }, held: [0] } }));
  await composeRequest(REQUEST, deps(db, claude));
  const args = finishArgs(called);
  assertEquals(composition(args).hero, { assetId: "a-sofa", why: null });
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

Deno.test("a refused claim: the first fails the run; a later one ends the batch with what it has", async () => {
  const refused = { message: "permission denied for claim" };
  const first = fakeDb({ claimErrors: [refused] });
  await assertRejects(() => runBatch(deps(first.db, claudeOf(respond()).claude)), Error, "claim failed: permission denied for claim");
  const second = { ...REQUEST, id: "req-2", lease_token: "lease-2" };
  const later = fakeDb({ requests: [REQUEST, second], claimErrors: [null, refused] });
  const summary = await runBatch(deps(later.db, claudeOf(respond()).claude));
  assertEquals([summary.claimed, summary.composed], [1, 1]);
  assertEquals(later.called("claim_client_edition_requests").length, 2);
});

Deno.test("runBatch composes requests in turn and sums the cost", async () => {
  const second = { ...REQUEST, id: "req-2", lease_token: "lease-2" };
  const { db } = fakeDb({ requests: [REQUEST, second] });
  const { claude } = claudeOf(respond());
  const summary = await runBatch(deps(db, claude));
  assertEquals([summary.claimed, summary.composed, summary.skipped, summary.failed, summary.unsettled], [2, 2, 0, 0, 0]);
  assertEquals(summary.cost_usd, 0.062);
  assertEquals(runStatus(summary), { status: "succeeded", error: null });
  assertEquals(runStatus({ ...summary, claimed: 0 }).status, "skipped");
  assertEquals(runStatus({ ...summary, composed: 0, failed: 1, unsettled: 1 }).status, "failed");
});

// ── SQ-1649 repairs ────────────────────────────────────────────────────────

Deno.test("N1: a sheet row past the first thousand keeps the picture from every model and from the hero", async () => {
  // A thousand recrops of the sofa's upload, then the drawing sheet its bytes also came from.
  const rows = [...ROWS, ...Array.from({ length: 1_000 }, () => row("a-sofa", "upload")), row("a-sofa", "sheet")];
  for (const privacyLive of [false, true]) {
    const { db, called } = fakeDb({ rows });
    const { claude, calls } = claudeOf(respond());
    await composeRequest(REQUEST, deps(db, claude, { privacyLive }));
    for (const call of calls) assert(!shown(call).includes("a-sofa"), `${call.role} was shown the sofa`);
    assert(composition(finishArgs(called)).hero?.assetId !== "a-sofa", "the sofa opened the page");
  }
});

Deno.test("N1: provenance that reads fewer rows than it counted fails the edition before any picture is sent", async () => {
  const { db, called } = fakeDb({ uncounted: 1 });
  const { claude, calls } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude, { privacyLive: true }));
  assertEquals(calls.length, 0, "no model was asked anything");
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_error], ["failed", "provenance: read 8 of 9 rows"]);
  assertEquals(outcome.result, "failed");
});

/** Makers off: the facts carry no makerName, so the names come from the job's lines and vendor records. */
const JOB_MAKERS = {
  lines: [
    { id: "l1", vendor_id: "v1", vendor_name: null },
    { id: "l2", vendor_id: null, vendor_name: " Bramble & Co " },
  ],
  vendors: { v1: "Kettle Joinery" } as Record<string, string>,
};

/** Facts read while the studio hides makers, with alts perceived while it showed them. */
function makersHidden(): EditorialFacts {
  const fixture = facts();
  fixture.project.showMakers = false;
  for (const room of fixture.rooms) for (const item of room.items) item.makerName = null;
  const set = (id: string, fields: Record<string, unknown>) => Object.assign(fixture.assets.find((a) => a.id === id)!, fields);
  // The facts' own alt is built from the masked caption.
  set("a-sofa", { perceivedPromptVersion: "e1", perceivedAlt: "A Kettle Joinery walnut sofa under the bay window.", alt: "Walnut sofa · Larch Studio · studio photograph" });
  set("a-scan", { perceivedPromptVersion: "e1", perceivedAlt: "The kettle joinery sofa in the bay of the living room.", alt: "Living room · Larch Studio · room scan" });
  // A caption whose what names a maker: its alt is rebuilt with the name taken out.
  set("a-concept", {
    perceivedPromptVersion: "e1",
    perceivedAlt: "A Bramble & Co armchair by the window.",
    caption: { what: "Bramble & Co armchair", whose: "Larch Studio", when: null },
    alt: "Bramble & Co armchair · Larch Studio · concept render, not installed",
  });
  return fixture;
}

const namesJobMaker = (value: unknown) => /kettle joinery|bramble & co/i.test(JSON.stringify(value));
const imageAlts = (args: Record<string, unknown>) => (args.p_images as { asset_id: string; alt: string }[]).map((r) => [r.asset_id, r.alt]);
const factAlts = (args: Record<string, unknown>) =>
  new Map((args.p_facts as EditorialFacts).assets.map((a) => [a.id, [a.alt ?? null, a.perceivedAlt ?? null]]));

Deno.test("N2: with makers hidden, no alt naming a maker of the job reaches the page or its facts, whatever the kind", async () => {
  // Upload: the sofa opens the page; every kind's alt is checked in p_facts.
  {
    const { db, called } = fakeDb({ facts: makersHidden(), makers: JOB_MAKERS });
    const { claude } = claudeOf(respond());
    await composeRequest(REQUEST, deps(db, claude));
    const args = finishArgs(called);
    assertEquals(imageAlts(args), [["a-sofa", "Walnut sofa · Larch Studio · studio photograph"]]);
    const alts = factAlts(args);
    assertEquals(alts.get("a-sofa"), ["Walnut sofa · Larch Studio · studio photograph", null]);
    assertEquals(alts.get("a-scan"), ["Living room · Larch Studio · room scan", null]);
    assertEquals(alts.get("a-concept"), ["armchair · Larch Studio · concept render, not installed", null]);
    assert(!namesJobMaker([args.p_images, args.p_composition, [...alts.values()]]), "the hidden maker is named");
  }
  // Scan: its stored perceived alt named the maker; the scan opens the page.
  {
    const { db, called } = fakeDb({ facts: makersHidden(), makers: JOB_MAKERS });
    const { claude } = claudeOf((opts) => {
      const ids = shown(opts);
      if (opts.role === "draft" && ids.length) return ok({ hero: { index: ids.indexOf("a-scan"), why: "Calm." }, held: [] });
      return respond()(opts);
    });
    await composeRequest(REQUEST, deps(db, claude, { privacyLive: true }));
    const args = finishArgs(called);
    assertEquals(imageAlts(args), [["a-scan", "Living room · Larch Studio · room scan"]]);
    assert(!namesJobMaker([args.p_images, [...factAlts(args).values()]]), "the hidden maker is named");
  }
  // Installed: perceived this run, with an alt naming the maker.
  {
    const fixture = makersHidden();
    fixture.assets.push(asset("a-installed", "installed", 3000, 2000, {
      caption: { what: "Walnut sofa", whose: "Larch Studio", when: null },
      alt: "Walnut sofa · Larch Studio · installed photograph",
    }) as never);
    const { db, called } = fakeDb({ facts: fixture, makers: JOB_MAKERS, rows: [...ROWS, row("a-installed", "installed")] });
    const { claude } = claudeOf(respond({
      perceive: (ids) => ({
        images: ids.map((id, index) => ({
          index,
          subject_box: [0.4, 0.3, 0.2, 0.3],
          focal: [0.4, 0.4],
          flags: [],
          alt: id === "a-installed" ? "The Kettle Joinery sofa, installed in the bay." : `A walnut piece, view ${index}`,
        })),
      }),
    }));
    await composeRequest(REQUEST, deps(db, claude, { privacyLive: true }));
    const args = finishArgs(called);
    assert(called("record_plate_perception").some((call) => call.args?.p_asset_id === "a-installed"), "the installed picture was perceived");
    assertEquals(imageAlts(args), [["a-installed", "Walnut sofa · Larch Studio · installed photograph"]]);
    assert(!namesJobMaker([args.p_images, [...factAlts(args).values()]]), "the hidden maker is named");
  }
});

Deno.test("N2: with makers shown, alts naming the maker are kept and no maker names are read", async () => {
  const fixture = facts();
  Object.assign(fixture.assets[0], { perceivedPromptVersion: "e1", perceivedAlt: "A Kettle Joinery walnut sofa under the bay window." });
  const { db, called } = fakeDb({ facts: fixture, makers: JOB_MAKERS });
  const { claude } = claudeOf(respond());
  await composeRequest(REQUEST, deps(db, claude));
  assertEquals(imageAlts(finishArgs(called)), [["a-sofa", "A Kettle Joinery walnut sofa under the bay window."]]);
  assertEquals(called("makerLines").length, 0);
});

Deno.test("N2: a maker-name read that fails leaves the request for the sweep, and nothing is composed", async () => {
  const clock = fakeClock();
  const { db, called } = fakeDb({ facts: makersHidden(), makers: JOB_MAKERS, slow: { clock, ms: 200_000, fns: ["makers"] } });
  const { claude, calls } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude, { now: clock.now, sleep: clock.sleep }));
  assertEquals([outcome.result, outcome.reason, outcome.editionId], ["unsettled", "makers: no answer in time", null]);
  assertEquals([calls.length, called("begin_client_edition").length], [0, 0]);
});

Deno.test("R2: a ledger that never settles keeps every paid answer and its cost, and the edition lands in budget", async () => {
  const time = new FakeTime(0);
  try {
    const paid: number[] = [];
    const ledger: LlmLedgerPort = {
      reserve: () => Promise.resolve({ granted: true, reason: null, usageId: 7 }),
      // Never answers and never looks at its signal.
      settle: () => new Promise<void>(() => {}),
    };
    const clientOptions = { apiKey: "test-key", log: () => {}, capture: async () => {} };
    const model = respond();
    const claude = async (opts: CallClaudeOptions) => {
      const reply = model(opts);
      if (!reply.ok) throw new Error("unscripted");
      const result = await callClaude({ ...opts, ledger, caller: () => Promise.resolve(reply.response), clientOptions });
      if (result.ok) paid.push(result.usd);
      return result;
    };
    const { db, called } = fakeDb();
    let settledAt: number | null = null;
    const pending = composeRequest(REQUEST, deps(db, claude, { now: () => Date.now(), sleep: sleepFor, deadline: 120_000 }))
      .then((outcome) => {
        settledAt = Date.now();
        return outcome;
      });
    while (settledAt === null && Date.now() < 130_000) await time.tickAsync(1_000);
    assert(settledAt !== null && settledAt <= 120_000, `the edition settled at ${settledAt}`);
    const outcome = await pending;
    const args = finishArgs(called);
    assertEquals([outcome.result, args.p_status, composition(args).voice], ["composed", "awaiting_review", "model"]);
    assert(paid.length >= 3 && paid.every((usd) => usd > 0), `paid answers: ${paid}`);
    const total = Number(paid.reduce((sum, usd) => sum + usd, 0).toFixed(6));
    assertEquals([args.p_cost_usd, outcome.usd], [total, total]);
  } finally {
    time.restore();
  }
});

/** A job with nothing to look at: Call B's words are its only model call. */
function wordsOnly(): EditorialFacts {
  return { ...facts(), rooms: [], assets: [], palette: [] } as EditorialFacts;
}

/**
 * The Messages API under the real SDK: each request is answered, and paid for,
 * one second before the timeout the SDK declares for it (X-Stainless-Timeout),
 * the slowest answer the SDK still takes; a request cancelled first gets none.
 */
function lastSecondApi(stopReason: string, text: string) {
  const answered: number[] = [];
  const message = (model: unknown) => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 100 },
  });
  const api = stub(globalThis, "fetch", (_input: string | URL | Request, init?: RequestInit) => {
    const seconds = Number(new Headers(init?.headers).get("x-stainless-timeout"));
    const { model } = JSON.parse(String(init?.body));
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        answered.push(Date.now());
        resolve(new Response(JSON.stringify(message(model)), { status: 200, headers: { "content-type": "application/json" } }));
      }, seconds * 1_000 - 1_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(init.signal!.reason);
      }, { once: true });
    });
  });
  return { api, answered };
}

interface Made {
  started: number;
  ended: number;
  timeoutMs: number;
  result: CallClaudeResult;
}

/** callClaude over the real SDK, with a reservation that takes 4 s and a settle that never answers. */
function slowLedgerClaude(made: Made[]) {
  const ledger: LlmLedgerPort = {
    reserve: () => new Promise((resolve) => setTimeout(() => resolve({ granted: true, reason: null, usageId: 7 }), 4_000)),
    // Never answers and never looks at its signal.
    settle: () => new Promise<void>(() => {}),
  };
  const clientOptions = { apiKey: "test-key", log: () => {}, capture: async () => {} };
  return async (opts: CallClaudeOptions) => {
    const started = Date.now();
    const result = await callClaude({ ...opts, ledger, clientOptions });
    made.push({ started, ended: Date.now(), timeoutMs: opts.timeoutMs, result });
    return result;
  };
}

/** One request composed on FakeTime over a 120 s run: its outcome, finish args, calls and when it settled. */
async function composeOnFakeTime(time: FakeTime) {
  const made: Made[] = [];
  const { db, called } = fakeDb({ facts: wordsOnly() });
  let settledAt: number | null = null;
  const pending = composeRequest(REQUEST, deps(db, slowLedgerClaude(made), { now: () => Date.now(), sleep: sleepFor, deadline: 120_000 }))
    .then((outcome) => {
      settledAt = Date.now();
      return outcome;
    });
  while (settledAt === null && Date.now() < 130_000) await time.tickAsync(1_000);
  return { outcome: await pending, args: finishArgs(called), made, settledAt: settledAt as number | null };
}

Deno.test("R2: a reservation that takes 4 s, a paid answer in the model's last second and a settle that never answers keep the answer's cost", async () => {
  const time = new FakeTime(0);
  const { api, answered } = lastSecondApi("end_turn", "{}");
  try {
    const { outcome, args, made, settledAt } = await composeOnFakeTime(time);
    assertEquals([outcome.usd, args.p_cost_usd], [0.0012, 0.0012], "Already-paid response usd must reach edition accounting");
    assertEquals(made.length, 1);
    const [call] = made;
    assert(call.result.ok, "callClaude did not return the paid answer");
    assertEquals(call.result.usd, 0.0012);
    assert(answered[0] <= call.started + call.timeoutMs, `the model answered at ${answered[0]} ms, after the window that started with the reservation`);
    assert(call.ended <= call.started + call.timeoutMs + LEDGER_SETTLE_MS, `callClaude returned at ${call.ended} ms`);
    assertEquals(outcome.result, "composed");
    assert(settledAt !== null && settledAt <= 120_000, `the edition settled at ${settledAt}`);
  } finally {
    api.restore();
    time.restore();
  }
});

Deno.test("R2: a billed failure after a 4 s reservation (a refusal or a truncation in the model's last second) still records its cost", async () => {
  for (const stopReason of ["refusal", "max_tokens"]) {
    const time = new FakeTime(0);
    const { api } = lastSecondApi(stopReason, JSON.stringify(WORDS));
    try {
      const { outcome, args, made, settledAt } = await composeOnFakeTime(time);
      assertEquals([outcome.usd, args.p_cost_usd], [0.0012, 0.0012], `${stopReason}: the charged usd must reach the edition`);
      assertEquals(made.map(({ result }) => result.ok && result.response.stop_reason), [stopReason]);
      assertEquals(composition(args).voice, "deterministic", `${stopReason}: the billed answer's words were used`);
      assert(settledAt !== null && settledAt <= 120_000, `${stopReason}: the edition settled at ${settledAt}`);
    } finally {
      api.restore();
      time.restore();
    }
  }
});

Deno.test("N3: a provenance read that never answers is abandoned in its window; the run ends in budget with the edition failed", async () => {
  const clock = fakeClock();
  const { db, called } = fakeDb({ slow: { clock, ms: 200_000, fns: ["provenance"] } });
  const { claude, calls } = claudeOf(respond());
  const summary = await runBatch(deps(db, claude, { now: clock.now, sleep: clock.sleep, deadline: 120_000 }));
  assert(clock.now() <= 120_000, `the run ended at ${clock.now()} ms`);
  assertEquals(calls.length, 0, "no model was asked anything");
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_error], ["failed", "provenance: no answer in time"]);
  assertEquals(summary.outcomes, [{ request_id: "req-1", edition_id: "edition-1", result: "failed", reason: "provenance: no answer in time" }]);
});

Deno.test("N3: a ledger that never answers a reservation holds no call past its window; the run ends in budget with the edition failed", async () => {
  const clock = fakeClock();
  const handed: (AbortSignal | undefined)[] = [];
  const ledger: LlmLedgerPort = {
    reserve: (_feature, _studio, _user, _usd, _role, _version, signal?: AbortSignal) => {
      handed.push(signal);
      return clock.slow(200_000, () => ({ granted: true, reason: null, usageId: 7 }), signal);
    },
    settle: () => Promise.resolve(),
  };
  const response = { stop_reason: "end_turn", content: [{ type: "text", text: "{}" }], usage: { input_tokens: 10, output_tokens: 10 } };
  const clientOptions = { apiKey: "test-key", log: () => {}, capture: async () => {} };
  const claude = (opts: CallClaudeOptions) => callClaude({ ...opts, ledger, caller: () => Promise.resolve(response), clientOptions });
  const { db, called } = fakeDb();
  const summary = await runBatch(deps(db, claude, { now: clock.now, sleep: clock.sleep, deadline: 120_000 }));
  assert(clock.now() <= 120_000, `the run ended at ${clock.now()} ms`);
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_error], ["failed", "words: no answer in time"]);
  assertEquals([summary.failed, summary.outcomes[0].edition_id], [1, "edition-1"]);
  assert(handed.length > 0 && handed.every((signal) => signal?.aborted), "every reservation was handed a signal that aborted");
});

Deno.test("N4: a finish that throws is retried, and the edition settles", async () => {
  const { db, called } = fakeDb({ finishThrows: 1 });
  const { claude } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals([outcome.result, outcome.editionId, outcome.usd], ["composed", "edition-1", 0.031]);
  assertEquals(called("finish_client_edition").map((c) => c.args!.p_status), ["awaiting_review", "awaiting_review"]);
});

Deno.test("N4: a finish that landed although its answer was lost is reconciled from the edition, never resent", async () => {
  const { db, called } = fakeDb({ ackLost: 1 });
  const { claude } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals([outcome.result, outcome.editionId, outcome.usd], ["composed", "edition-1", 0.031]);
  assertEquals(called("finish_client_edition").length, 1);
});

Deno.test("N4: a finish that never answers ends by the deadline with the edition, its spend and the sweep that recovers it", async () => {
  const clock = fakeClock();
  const { db, called } = fakeDb({ slow: { clock, ms: 200_000, fns: ["finish_client_edition"] } });
  const { claude } = claudeOf(respond());
  const summary = await runBatch(deps(db, claude, { now: clock.now, sleep: clock.sleep, deadline: 120_000 }));
  assert(clock.now() <= 120_000, `the run ended at ${clock.now()} ms`);
  assertEquals([summary.unsettled, summary.cost_usd, summary.outcomes[0].edition_id], [1, 0.031, "edition-1"]);
  const reason = summary.outcomes[0].reason ?? "";
  assert(reason.includes("sweep fails drafting edition edition-1") && reason.includes("bounded recovery") && reason.includes("closed/frozen, consecutive-failure cap, or an active request") && reason.includes("next edition request"), reason);
  assertEquals(called("finish_client_edition").map((c) => c.args!.p_status), ["awaiting_review", "awaiting_review", "failed"]);
});

Deno.test("N5: a later claim that throws ends the batch with what it has", async () => {
  const second = { ...REQUEST, id: "req-2", lease_token: "lease-2" };
  const { db, called } = fakeDb({ requests: [REQUEST, second], claimErrors: [null, "throw"] });
  const summary = await runBatch(deps(db, claudeOf(respond()).claude)).catch((error: Error) => error);
  assert(!(summary instanceof Error), `the batch was lost: ${summary}`);
  assertEquals([summary.claimed, summary.composed, summary.cost_usd], [1, 1, 0.031]);
  assertEquals(called("claim_client_edition_requests").length, 2);
});

Deno.test("N6: an approved held picture newly flagged composes again, and is not held again", async () => {
  const fixture = facts();
  const current = approved({ chapters: ANCHORED, hero: { assetId: "a-sofa", why: null }, held: ["a-table"] }, await sourceHash(fixture), fixture);
  const read = facts();
  Object.assign(read.assets[1], { perceivedPromptVersion: "e1", perceivedFlags: ["people"] });
  const { db, called } = fakeDb({ facts: read, current });
  const { claude } = claudeOf(respond({ hero: { hero: { index: 0, why: "Calm." }, held: [1] } }));
  await composeRequest(REQUEST, deps(db, claude));
  assertEquals(called("begin_client_edition").length, 1, "a flag-only change is not unchanged");
  const written = composition(finishArgs(called));
  assert(written.hero?.assetId !== "a-table" && !(written.held as string[]).includes("a-table"), "the flagged table was selected again");
});

Deno.test("N6: the frozen facts carry the flags this run recorded, so the next run finds nothing changed", async () => {
  const flagSofa = (ids: string[]) => ({
    images: ids.map((id, index) => ({ index, subject_box: [0.4, 0.3, 0.2, 0.3], focal: [0.4, 0.4], flags: id === "a-sofa" ? ["text_overlay"] : [], alt: "A piece." })),
  });
  const first = fakeDb();
  await composeRequest(REQUEST, deps(first.db, claudeOf(respond({ perceive: flagSofa })).claude));
  const args = finishArgs(first.called);
  const frozen = args.p_facts as EditorialFacts;
  assertEquals(frozen.assets.find((a) => a.id === "a-sofa")!.perceivedFlags, ["text_overlay"]);
  const stored = facts();
  Object.assign(stored.assets[0], { perceivedPromptVersion: "e1", perceivedFlags: ["text_overlay"], perceivedAlt: "A piece." });
  const second = fakeDb({ facts: stored, current: approved(composition(args), await sourceHash(stored), frozen) });
  await composeRequest(REQUEST, deps(second.db, claudeOf(respond()).claude));
  assertEquals(second.called("begin_client_edition").length, 0, "the run's own flags are not a change");
});

// Gallery fallback copy is intentionally shorter than the historical client page.
const item = (nameAsSigned: string, status: string | null = null) => ({ id: nameAsSigned, nameAsSigned, status, assetIds: [] });
const room = (id: string, name: string, items: ReturnType<typeof item>[]): FactsRoom => ({ id, name, anchor: `room-${id}`, items });
const HEADLINE_FIXTURE: { phase: string; rooms: FactsRoom[]; expected: string[] }[] = [
  {
    phase: "procurement",
    rooms: [
      room("a", "Living room", [item("Walnut and linen sofa"), item("Oak side table"), item("Brass floor lamp", "in production")]),
      room("b", "Dining room", [item("Marble dining table"), item("Cane chair")]),
    ],
    expected: ["The pieces are on their way", "The house", "Living room", "Dining room", "On the way"],
  },
  {
    phase: "procurement",
    rooms: [room("c", "Study", [item("Desk", "delivered")])],
    expected: ["The pieces are on their way", "The house", "The study", "On the way"],
  },
  {
    phase: "installation",
    rooms: [room("d", "Bedroom", [item("Bouclé chair"), item("Boucle ottoman"), item("Velvet headboard"), item("Steel bed frame")])],
    expected: ["The rooms are going in", "The house", "The bedroom", "On the way"],
  },
  { phase: "final_walkthrough", rooms: [], expected: ["The house, as finished", "The house", "On the way"] },
  {
    phase: "design_development",
    rooms: Array.from({ length: 11 }, (_, i) => room(`r${i}`, `Room ${i}`, [])),
    expected: ["The rooms, as drawn", "The house", ...Array.from({ length: 11 }, (_, i) => `Room ${i}`), "On the way"],
  },
];

Deno.test("Gallery deterministic headlines meet band and menu limits for every phase", () => {
  for (const { phase, rooms, expected } of HEADLINE_FIXTURE) {
    const headlines = deterministicHeadlines({ project: { id: "p", name: "P", phase }, rooms, assets: [] });
    assertEquals(headlines.map((h) => h.headline), expected);
    for (const h of headlines) assertEquals(headlineFault(h.headline, h.key === "cover"), null);
    assertEquals(headlines.slice(2, 2 + rooms.length).map((h) => h.key), rooms.map((r) => r.anchor));
  }
});

Deno.test("closing: captured allowlisted facts compose once for review despite unchanged prose, without closed-plate perception", async () => {
  const captured = { ...facts(), closing: true, portfolio_snapshot: { description: "PRIVATE-CLOSE-DESCRIPTION", value_cents: 987654321 } };
  captured.project.phase = "final_walkthrough";
  captured.rooms[0].items[0].material = "Captured walnut";
  const live = facts();
  live.rooms[0].items[0].material = "LIVE-CHANGED-MATERIAL";
  const current = approved({ chapters: ANCHORED, doorstep: WORDS.doorstep }, await sourceHash(captured), captured);
  const { db, called } = fakeDb({ facts: live, current });
  const { claude, calls } = claudeOf(respond());
  const outcome = await composeRequest({ ...REQUEST, closing: true, closing_facts: captured }, deps(db, claude));
  assertEquals(outcome.result, "composed");
  assertEquals(called("get_project_editorial_facts").length, 0);
  assertEquals(called("begin_client_edition").length, 1);
  assertEquals(called("close_client_edition_request").length, 0);
  assertEquals(called("record_plate_perception").length, 0);
  assertEquals(calls.filter((call) => call.role === "perceive").length, 0);
  const args = finishArgs(called);
  assertEquals([args.p_status, args.p_kind], ["awaiting_review", "full"]);
  assertEquals((args.p_facts as typeof captured).portfolio_snapshot, captured.portfolio_snapshot);
  const prompts = JSON.stringify(calls);
  assert(prompts.includes("Captured walnut"));
  assert(prompts.includes("final_walkthrough"));
  for (const privateValue of ["PRIVATE-CLOSE-DESCRIPTION", "987654321", "portfolio_snapshot", "LIVE-CHANGED-MATERIAL"]) {
    assert(!prompts.includes(privateValue), privateValue + " must not reach a prompt");
  }
});

Deno.test("closing: missing or mismatched captured facts fail closed, never read live facts or open a draft", async () => {
  for (const closing_facts of [undefined, {}, { ...facts(), closing: true }, { ...facts(), closing: true, project: { id: "another-project", phase: "final_walkthrough" } }]) {
    const { db, called } = fakeDb();
    const { claude, calls } = fakeClaude({});
    const outcome = await composeRequest({ ...REQUEST, closing: true, closing_facts }, deps(db, claude));
    assertEquals(outcome.result, "unsettled");
    assertEquals(outcome.reason, "closing request has no captured editorial facts");
    assertEquals(called("get_project_editorial_facts").length, 0);
    assertEquals(called("begin_client_edition").length, 0);
    assertEquals(calls.length, 0);
  }
});

Deno.test("Gallery hero: scene, native dimensions and subject fit in both viewport crops", () => {
  const photo = asset("gallery", "upload", 2000, 1200, { subjectBox: [0.4, 0.35, 0.2, 0.3] });
  assert(meetsHero(photo), "boundary landscape with a phone-safe subject qualifies despite discarding over half the frame");
  assert(meetsHero({ ...photo, width: 1200, height: 2000 }), "boundary portrait holds the desktop crop");
  for (const change of [
    { width: 1999 }, { height: 1199 }, { width: 0 },
    { ground: "white" }, { ground: "drawing" }, { ground: null }, { sourceKind: "concept" },
    { subjectBox: [0.1, 0.35, 0.3, 0.3] },
    { width: 1200, height: 2000, subjectBox: [0.4, 0.1, 0.2, 0.5] },
  ]) assertEquals(meetsHero({ ...photo, ...change }), false, JSON.stringify(change));
});

Deno.test("Gallery hero-less edition finishes with paint card, no image rows and no hero call", async () => {
  const fixture = facts();
  fixture.assets = fixture.assets.map(a => ({ ...a, ground: "white" }));
  const { db, called } = fakeDb({ facts: fixture });
  const { claude, calls } = claudeOf(respond());
  const outcome = await composeRequest(REQUEST, deps(db, claude));
  assertEquals(outcome.result, "composed");
  const args = finishArgs(called);
  assertEquals([composition(args).hero, composition(args).held, args.p_images], [null, [], []]);
  assertEquals(composition(args).voice, "model");
  assertEquals(calls.filter(c => c.role === "draft" && shown(c).length > 0).length, 0);
  assertEquals(wordsBody(calls).opening.now, "the paint card");
});

Deno.test("Gallery limit miss regenerates once and keeps a corrected second draft", async () => {
  const tooLong = { ...WORDS, chapters: WORDS.chapters.map(c => c.key === "cover" ? { ...c, headline: "The living room is on its way" } : c) };
  const { db, called } = fakeDb();
  const responses = [tooLong, WORDS];
  const base = respond();
  const { claude, calls } = claudeOf(opts => opts.role === "draft" && !shown(opts).length ? ok(responses.shift()) : base(opts));
  await composeRequest(REQUEST, deps(db, claude));
  assertEquals(calls.filter(c => c.role === "draft" && !shown(c).length).length, 2, "a limit miss earns exactly one regeneration");
  assertEquals(composition(finishArgs(called)).voice, "model");
  assertEquals(composition(finishArgs(called)).chapters, ANCHORED);
});

Deno.test("Gallery second limit miss falls back to bounded deterministic headlines", async () => {
  const tooLong = { ...WORDS, chapters: WORDS.chapters.map(c => ({ ...c, standing: Array(26).fill("we").join(" ") + "." })) };
  const { db, called } = fakeDb();
  const { claude, calls } = claudeOf(respond({ words: tooLong }));
  await composeRequest(REQUEST, deps(db, claude));
  assertEquals(calls.filter(c => c.role === "draft" && !shown(c).length).length, 2);
  const draft = composition(finishArgs(called));
  assertEquals(draft.voice, "deterministic");
  assertEquals(draft.chapters, deterministicHeadlines(facts()).map(c => ({ ...c, standing: null })));
});

Deno.test("Gallery fallback handles long, empty and forbidden room names without overlong copy", () => {
  for (const name of ["", "A very long room name with an annex", "x".repeat(80), "The curated room", "Study", "Living room"]) {
    const fixture = facts();
    fixture.rooms[0].name = name;
    const headlines = deterministicHeadlines(fixture);
    for (const c of headlines) assertEquals(headlineFault(c.headline, c.key === "cover"), null, name);
    assert(!headlines.some(c => /curated/i.test(c.headline)));
  }
});

Deno.test("Gallery prompt e2 states the new limits while retaining the voice rules", async () => {
  const { db } = fakeDb();
  const { claude, calls } = claudeOf(respond());
  await composeRequest(REQUEST, deps(db, claude));
  const system = JSON.stringify(wordsCall(calls).params.system);
  assertEquals(PROMPT_VERSION, "e2");
  for (const text of ["3–6 words", "40 characters", "2–4 word chapter name", "25 words", "No counts", "No money", "AI", "Lexicon.", "meets these Gallery limits"]) {
    assert(system.includes(text), text);
  }
});
