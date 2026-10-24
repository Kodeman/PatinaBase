import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  findBanned,
  type ModelAnswer,
  readAnswer,
  readJudgement,
  validateHero,
  validatePerception,
  validateWords,
} from "./validate.ts";

const answer = (value: unknown, stop_reason = "end_turn"): ModelAnswer => ({
  stop_reason,
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
});

function rejects(result: { ok: boolean; reason?: string }, reason: string) {
  assertEquals(result.ok, false, `expected a rejection: ${reason}`);
  assertEquals(result.reason, reason);
}

Deno.test("readAnswer rejects a refusal, a max_tokens truncation, no JSON and bad JSON", () => {
  rejects(readAnswer(answer({ ok: 1 }, "refusal")), "refusal");
  rejects(readAnswer(answer({ ok: 1 }, "max_tokens")), "truncated");
  rejects(readAnswer(answer("no object here")), "no JSON object");
  rejects(readAnswer(answer("{not json}")), "unparseable JSON");
  rejects(readAnswer(answer("} backwards {")), "no JSON object");
  assertEquals(readAnswer(answer('Here it is: {"a": 1} done.')), { ok: true, value: { a: 1 } });
});

Deno.test("any banned string anywhere in an answer rejects it, naming the words", () => {
  const banned = [
    ["Shaped by AI.", "AI"],
    ["Picked by A.I. for you.", "A.I"],
    ["A sofa chosen by ai.", "ai"],
    ["Cl\u200Baude picked it.", "Claude"],
    ["A carefully curated room.", "curated"],
    ["Artificial  intelligence chose this.", "Artificial  intelligence"],
    ["A generated view.", "generated"],
    ["Image of a sofa.", "Image of"],
    ["Claude picked it.", "Claude"],
    ["Written with Anthropic tools.", "Anthropic"],
    ["GPT-6 wrote it.", "GPT-6"],
    ["Sonnet 5.5 says so.", "Sonnet 5"],
  ];
  for (const [text, term] of banned) {
    const result = readAnswer(answer({ deep: { list: ["fine", text] } }));
    assertEquals(result.ok, false, text);
    if (!result.ok) assertEquals([result.reason, result.term], ["banned words", term]);
  }
  for (const clean of ["The Opus side table.", "A haiku bench by the window.", "Said and done.", "Regenerated oak? No: reclaimed oak.", "The chair is in Maine."]) {
    assertEquals(findBanned(clean), null, clean);
  }
});

const image = (overrides: Record<string, unknown> = {}) => ({
  index: 0,
  subject_box: [0.1, 0.1, 0.5, 0.5],
  focal: [0.3, 0.3],
  flags: ["people"],
  alt: "A walnut sofa under a window.",
  ...overrides,
});

Deno.test("A1 perception: every reject rule", () => {
  const cases: [unknown, string][] = [
    [{ images: [] }, "images is not a list"],
    [{ images: "x" }, "images is not a list"],
    [{ images: [image(), image({ index: 1 }), image({ index: 2 })] }, "images is not a list"],
    [{ images: [image({ index: 2 })] }, "image index is out of range"],
    [{ images: [image({ index: 0.5 })] }, "image index is out of range"],
    [{ images: [image(), image()] }, "image index repeats"],
    [{ images: [image({ subject_box: [0.1, 0.1, 0.5] })] }, "subject_box is not four numbers"],
    [{ images: [image({ subject_box: [0.6, 0.1, 0.5, 0.5] })] }, "subject_box is outside the frame"],
    [{ images: [image({ subject_box: [-0.1, 0.1, 0.5, 0.5] })] }, "subject_box is outside the frame"],
    [{ images: [image({ subject_box: [0.1, 0.1, 0.2, 0.2], focal: [0.2, 0.2] })] }, "subject_box is under 5% of the frame"],
    [{ images: [image({ focal: [0.9, 0.9] })] }, "focal is outside the subject box"],
    [{ images: [image({ focal: [0.3] })] }, "focal is not two numbers"],
    [{ images: [image({ flags: ["blurry"] })] }, "unknown flag"],
    [{ images: [image({ alt: " " })] }, "alt is empty or over 125 characters"],
    [{ images: [image({ alt: "x".repeat(126) })] }, "alt is empty or over 125 characters"],
  ];
  for (const [value, reason] of cases) rejects(validatePerception(answer(value), 2), reason);
  const ok = validatePerception(answer({ images: [image({ index: 1 }), image({ flags: [] })] }), 2);
  assert(ok.ok);
  assertEquals(ok.value[0], { index: 1, subjectBox: [0.1, 0.1, 0.5, 0.5], focal: [0.3, 0.3], flags: ["people"], alt: "A walnut sofa under a window." });
});

Deno.test("A2 hero pick: an index outside the candidates, a long why or a bad held list is rejected", () => {
  const cases: [unknown, string][] = [
    [{ held: [] }, "hero is missing"],
    [{ hero: { index: 3, why: "x" } }, "hero index is outside the candidates"],
    [{ hero: { index: -1, why: "x" } }, "hero index is outside the candidates"],
    [{ hero: { index: 0, why: "x".repeat(141) } }, "why is empty or over 140 characters"],
    [{ hero: { index: 0, why: "x" }, held: [1, 2, 1] }, "held is not a list of at most two"],
    [{ hero: { index: 0, why: "x" }, held: [7] }, "held index is outside the candidates"],
    [{ hero: { index: 0, why: "x" }, held: [0] }, "held repeats an index"],
  ];
  for (const [value, reason] of cases) rejects(validateHero(answer(value), 3), reason);
  assertEquals(validateHero(answer({ hero: { index: 2, why: " Calm. " }, held: [0, 1] }), 3), {
    ok: true,
    value: { index: 2, why: "Calm.", held: [0, 1] },
  });
});

const KEYS = ["cover", "house", "room-1"];
const words = (overrides: Record<string, unknown> = {}) => ({
  chapters: KEYS.map((key) => ({ key, headline: key === "cover" ? "The rooms, as drawn" : `The ${key}`, standing: "It stands." })),
  doorstep: { standing: "Under way." },
  notice: "The page now opens on the sofa; everything else is where it was.",
  ...overrides,
});

Deno.test("B words: keys, lengths, doorstep and notice", () => {
  const chapter = (overrides: Record<string, unknown>) => [...words().chapters.slice(0, 2), { key: "room-1", headline: "The room", standing: "s", ...overrides }];
  const cases: [unknown, string][] = [
    [words({ chapters: words().chapters.slice(0, 2) }), "chapters do not match the keys asked for"],
    [words({ chapters: chapter({ key: "room-9" }) }), "unknown chapter key"],
    [words({ chapters: [...words().chapters.slice(0, 2), words().chapters[0]] }), "a chapter key repeats"],
    [words({ chapters: chapter({ headline: "x".repeat(61) }) }), "headline is empty or over 60 characters"],
    [words({ chapters: chapter({ standing: "x".repeat(161) }) }), "standing is empty or over 160 characters"],
    [words({ doorstep: {} }), "doorstep standing is empty or over 160 characters"],
    [words({ doorstep: { standing: "x".repeat(161) } }), "doorstep standing is empty or over 160 characters"],
    [words({ notice: "x".repeat(201) }), "notice is empty or over 200 characters"],
  ];
  for (const [value, reason] of cases) rejects(validateWords(answer(value), KEYS), reason);
  const ok = validateWords(answer(words({ chapters: [...words().chapters].reverse() })), KEYS);
  assert(ok.ok);
  assertEquals(ok.value.chapters.map((c) => c.key), KEYS);
});

Deno.test("F9: alt text and the hero's why pass the same normalized lint as the words", () => {
  for (const [alt, term] of [["A sofa chosen by ai.", "ai"], ["A carefully curated room.", "curated"], ["Cl\u200Baude framed this sofa.", "Claude"]]) {
    const read = validatePerception(answer({ images: [image({ alt })] }), 1);
    assertEquals(read.ok, false, alt);
    if (!read.ok) assertEquals([read.reason, read.term], ["banned words", term]);
  }
  const why = validateHero(answer({ hero: { index: 0, why: "A seamless pick by ai." } }), 1);
  assertEquals(why.ok, false);
  if (!why.ok) assertEquals(why.reason, "banned words");
});

Deno.test("F17: a maker or item called Claude is a name; the word alone is still attribution", () => {
  const names = ["Claude Rattan chair", "Anthropic Mill"];
  const named = validatePerception(answer({ images: [image({ alt: "The Claude Rattan chair by the window.", flags: [] })] }), 1, names);
  assert(named.ok, "an allowlisted item name passes");
  assertEquals(named.value[0].alt, "The Claude Rattan chair by the window.");
  const words = { chapters: [{ key: "cover", headline: "The Anthropic Mill sofa", standing: "It is in the workshop." }], doorstep: { standing: "Under way." }, notice: "New." };
  assert(validateWords(answer(words), ["cover"], names).ok, "an allowlisted maker name passes");
  const bare = validatePerception(answer({ images: [image({ alt: "The Claude Rattan chair; Claude chose it." })] }), 1, names);
  assertEquals(bare.ok, false);
  if (!bare.ok) assertEquals(bare.term, "Claude");
  assertEquals(findBanned("The Claude Rattan chair."), "Claude", "without the names it is attribution");
});

Deno.test("F8: the judge's answer is clean, a hit, or unavailable; only ok:true with no term is clean", () => {
  assertEquals(readJudgement(answer({ ok: true, term: null })), { verdict: "clean" });
  assertEquals(readJudgement(answer({ ok: true })), { verdict: "clean" });
  assertEquals(readJudgement(answer({ ok: false, term: "state of the art" })), { verdict: "hit", term: "state of the art" });
  assertEquals(readJudgement(answer({ ok: false })), { verdict: "hit", term: "the flagged wording" });
  for (const unread of [answer("nonsense"), answer({ verdict: "fine" }), answer({ ok: "yes" }), answer({ ok: true, term: "curated" }), answer({ ok: true, term: null }, "max_tokens"), answer({ ok: false, term: "AI" }, "refusal")]) {
    assertEquals(readJudgement(unread), { verdict: "unavailable" }, JSON.stringify(unread));
  }
});

Deno.test("Gallery wording: band and menu boundaries and one short standing sentence", () => {
  const check = (headline: string, key = "cover", standing = "It stands.") =>
    validateWords(answer({ ...words(), chapters: [{ key, headline, standing }] }), [key]);
  for (const headline of ["The sofa waits", "The sofa is on its way", "abcdefghijklm abcdefghijklmn abcdefghijk"]) {
    assert(check(headline).ok, headline);
  }
  for (const headline of ["The sofa", "The sofa is now on its way", "abcdefghijklmno abcdefghijklmno abcdefghijk"]) {
    assertEquals(check(headline).ok, false, headline);
  }
  for (const headline of ["Living room", "The living room linen"]) assert(check(headline, "room-1").ok);
  for (const headline of ["Living", "The living room and linen"]) assertEquals(check(headline, "room-1").ok, false);
  assert(check("The sofa waits", "cover", Array(25).fill("we").join(" ") + ".").ok);
  assertEquals(check("The sofa waits", "cover", Array(26).fill("we").join(" ") + ".").ok, false);
  assertEquals(check("The sofa waits", "cover", "It stands. It waits.").ok, false);
  assert(check("  The  sofa\twaits  ").ok, "word counting follows whitespace, not empty tokens");
});
