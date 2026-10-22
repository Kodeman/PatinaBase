import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CallClaudeOptions, CallClaudeResult } from "../_shared/claude.ts";
import { composeRequest, type Db, deterministicHeadlines } from "./lib.ts";
import { ERROR_RULES, lintText, NORMALIZE, WARNING_RULES } from "./lint.ts";
import type { EditorialFacts } from "./prompts.ts";

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
  ];
  for (const [text, rule, term] of hits) assertEquals(lintText(text), { rule, term }, text);
  for (const clean of ["The walnut sofa is in the workshop.", "It arrives in March!", "Said and done."]) {
    assertEquals(lintText(clean), null, clean);
  }
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
  const db: Db = {
    rpc(fn, args) {
      if (fn === "finish_client_edition") finished.push(args!);
      const data: Record<string, unknown> = { get_project_editorial_facts: structuredClone(FACTS), begin_client_edition: "edition-1" };
      return Promise.resolve({ data: data[fn] ?? null, error: null });
    },
    approvedEdition: () => Promise.resolve({ data: null, error: null }),
    plateSources: () => Promise.resolve({ data: [], error: null }),
    sign: () => Promise.reject(new Error("nothing to sign")),
  };
  return { db, finished };
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
  await composeRequest(REQUEST, { db, claude, privacyLive: false, supabaseUrl: "https://project.supabase.co" });
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
