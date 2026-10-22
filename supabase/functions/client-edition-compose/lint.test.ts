import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CallClaudeOptions, CallClaudeResult } from "../_shared/claude.ts";
import { composeRequest, type Db, deterministicHeadlines } from "./lib.ts";
import { ERROR_RULES, lintText, NORMALIZE, WARNING_RULES } from "./lint.ts";
import type { EditorialFacts } from "./prompts.ts";
/** No media worker: the lint tests compose without pictures. */
const noMedia = () => Promise.resolve(new Response(null, { status: 404 }));

const RULE_KEYS = ["rule", "pattern", "flags", "homoglyphs", "maxPerPiece"];
const pick = (rule: object) => Object.fromEntries(Object.entries(rule).filter(([key]) => RULE_KEYS.includes(key)));

Deno.test("the copied rules match marketing/canon/lexicon.json", async () => {
  const canon = JSON.parse(await Deno.readTextFile(new URL("../../../marketing/canon/lexicon.json", import.meta.url)));
  assertEquals(NORMALIZE, canon.normalize);
  assertEquals(ERROR_RULES.map(pick), canon.errors.map(pick));
  assertEquals(WARNING_RULES.map(pick), canon.warnings.map(pick));
});

Deno.test("lintText: canon hits, normalized and homoglyph-mapped; one exclamation is allowed", () => {
  const hits: [string, string, string][] = [
    ["A carefully curated room.", "curated", "curated"],
    ["Our cur​ated selection.", "curated", "curated"],
    ["An АI-powered page.", "ai", "AI"],
    ["A seamless install.", "seamless", "seamless"],
    ["It is bespoke.", "bespoke", "bespoke"],
    ["Here! Now!", "exclamations", "!"],
    ["Two weeks to go.", "spelled-quantity", "Two weeks"],
    ["Chosen by ai.", "ai", "ai"],
    ["A generated view.", "generated", "generated"],
    ["An image of the sofa.", "image-of", "image of"],
    ["Claude chose it.", "attribution", "Claude"],
    ["Picked with ChatGPT.", "attribution", "ChatGPT"],
    ["Sonnet 5 wrote this.", "attribution", "Sonnet 5"],
  ];
  for (const [text, rule, term] of hits) assertEquals(lintText(text), { rule, term }, text);
  for (const clean of ["The walnut sofa is in the workshop.", "It arrives in March!", "Said and done."]) {
    assertEquals(lintText(clean), null, clean);
  }
});

Deno.test("lintText: the project's own names are blanked for attribution only", () => {
  const names = ["Claude Rattan chair", "Opus 2 sofa"];
  assertEquals(lintText("The claude rattan chair and the Opus 2 sofa.", names), null);
  assertEquals(lintText("The Opus 2 sofa, as Claude chose.", names), { rule: "attribution", term: "Claude" });
  assertEquals(lintText("A curated Claude Rattan chair.", names), { rule: "curated", term: "curated" });
  assertEquals(lintText("The Opus 2 sofa."), { rule: "attribution", term: "Opus 2" }, "without the names a versioned model name is attribution");
});

Deno.test("lintText: an allowed name is blanked only as a whole name, never inside a vendor's", () => {
  assertEquals(lintText("Written by Gemini.", ["Gem"]), { rule: "attribution", term: "Gemini" });
  assertEquals(lintText("Written by OpenAI.", ["Op"]), { rule: "attribution", term: "OpenAI" });
  assertEquals(lintText("The Gem side table and the Op lamp.", ["Gem", "Op"]), null);
  assertEquals(lintText("The Claude chair beside the Opus 2 sofa.", ["Claude", "Opus 2"]), null);
  assertEquals(lintText("The Opus 20 sofa.", ["Opus 2"]), { rule: "attribution", term: "Opus 2" }, "Opus 20 is not the name Opus 2");
});

// ── Call C inside a composition ────────────────────────────────────────────

const PROJECT = "0b7d3c1e-0000-4000-8000-000000000002";
const REQUEST = { id: "req-1", project_id: PROJECT, lease_token: "lease-1" };
const FACTS = {
  project: { id: PROJECT, name: "P", phase: "installation", showMakers: false, studio: { id: "studio-1" } },
  rooms: [{ id: "r1", name: "Study", anchor: "room-r1", items: [{ id: "i1", nameAsSigned: "Oak desk", assetIds: [] }] }],
  assets: [],
} as EditorialFacts;

function fakeDb() {
  const finished: Record<string, unknown>[] = [];
  const db = {
    rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === "finish_client_edition") finished.push(args!);
      const data: Record<string, unknown> = { get_project_editorial_facts: structuredClone(FACTS), begin_client_edition: "edition-1" };
      return Promise.resolve({ data: data[fn] ?? null, error: null });
    },
    approvedEdition: () => Promise.resolve({ data: null, error: null }),
    provenancePage: () => Promise.resolve({ data: { rows: [], total: 0 }, error: null }),
    editionStatus: () => Promise.resolve({ data: "drafting", error: null }),
    // e5bdbaf4's port, kept so this file loads against it for the negative controls.
    provenance: () => Promise.resolve({ data: [], error: null }),
    // ad32ba43's port, kept so this file loads against it for the negative controls.
    plateSources: () => Promise.resolve({ data: [], error: null }),
    sign: () => Promise.reject(new Error("nothing to sign")),
  };
  return { db: db as Db, finished };
}

const ok = (value: unknown, model = "claude-sonnet-5-5"): CallClaudeResult => ({
  ok: true,
  response: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value) }], usage: { input_tokens: 1, output_tokens: 1 } },
  usd: 0.01,
  model,
});

const words = (standing: string) =>
  ok({
    chapters: ["cover", "house", "room-1", "progress"].map((key) => ({ key, headline: `The ${key}`, standing })),
    doorstep: { standing: "The study is going in." },
    notice: "The page is as it was.",
  });

const judge = (term: string | null) => ok(term ? { ok: false, term } : { ok: true, term: null }, "claude-haiku-5-5");

async function compose(script: Record<string, CallClaudeResult[]>) {
  const { db, finished } = fakeDb();
  const calls: CallClaudeOptions[] = [];
  const claude = (opts: CallClaudeOptions) => {
    calls.push(opts);
    const next = script[opts.role]?.shift();
    if (!next) throw new Error(`unscripted ${opts.role} call`);
    return Promise.resolve(next);
  };
  const legacy = { supabaseUrl: "https://project.supabase.co" };
  const sleep = (_ms: number, signal: AbortSignal) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
  await composeRequest(REQUEST, { ...legacy, db, claude, privacyLive: false, media: noMedia, now: () => 0, deadline: 120_000, sleep });
  const draftTexts = calls.filter((c) => c.role === "draft").map((c) => JSON.stringify(c.params.messages));
  return { calls, draftTexts, composition: finished[0].p_composition as Record<string, unknown> };
}

Deno.test("a lexicon hit regenerates once naming the term; a second hit leaves the deterministic headlines", async () => {
  const { calls, draftTexts, composition } = await compose({
    draft: [words("A curated desk."), words("A seamless install.")],
  });
  assertEquals(calls.map((c) => c.role), ["draft", "draft"]);
  assertEquals(draftTexts[0].includes("An earlier draft used"), false);
  assertEquals(draftTexts[1].includes('An earlier draft used \\"curated\\"'), true);
  assertEquals(composition.voice, "deterministic");
  assertEquals(
    (composition.chapters as { headline: string; standing: null }[]),
    deterministicHeadlines(FACTS).map((c) => ({ ...c, standing: null })),
  );
  assertEquals([composition.notice, (composition.doorstep as { standing: null }).standing], [null, null]);
});

Deno.test("the judge's term earns the one regeneration; a clean second draft keeps the model's words", async () => {
  const { calls, draftTexts, composition } = await compose({
    draft: [words("The desk is the state of the art."), words("The desk is in.")],
    judge: [judge("state of the art"), judge(null)],
  });
  assertEquals(calls.map((c) => c.role), ["draft", "judge", "draft", "judge"]);
  assertEquals(draftTexts[1].includes('An earlier draft used \\"state of the art\\"'), true);
  assertEquals(composition.voice, "model");
  assertEquals((composition.chapters as { key: string; headline: string; standing: string }[])[2], { key: "room-r1", headline: "The room-1", standing: "The desk is in." });
});

Deno.test("a banned word in B's answer is named in the regeneration too", async () => {
  const { draftTexts, composition } = await compose({
    draft: [words("A generated plan."), words("The desk is in.")],
    judge: [judge(null)],
  });
  assertEquals(draftTexts[1].includes('An earlier draft used \\"generated\\"'), true);
  assertEquals(composition.voice, "model");
});

Deno.test("an over-long answer is not regenerated: deterministic headlines at once", async () => {
  const { calls, composition } = await compose({ draft: [words("x".repeat(161))] });
  assertEquals(calls.length, 1);
  assertEquals(composition.voice, "deterministic");
});
