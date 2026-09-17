// Deno tests for the deterministic half of _shared/field-parse.ts — the four
// Field Line delivery answers (contract S3, migration 00641) that must never
// depend on a model, and the things that must never be mistaken for them.
//
// Run: deno test --no-check -A --config supabase/functions/deno.json \
//        supabase/functions/_shared/field-parse.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type FieldParseInput,
  type FieldParseResult,
  normalizeParse,
  parseFieldMessage,
  parseFieldMessageDeterministic,
} from "./field-parse.ts";
import {
  buildDigestMenu,
  DIGEST_MENU_MAX_SEPTETS,
} from "../field-daily/core.ts";

// A Thursday, so "thursday morning" resolves to the day they texted and
// "tue 2-4" resolves forward to the 22nd.
const TODAY = "2026-09-17";

function parse(body: string) {
  return parseFieldMessageDeterministic({ body, today: TODAY });
}

// ── The four intents ────────────────────────────────────────────────────────

Deno.test("availability: a day with a time window", () => {
  const got = parse("Tue 2-4");
  assert(got, "'Tue 2-4' should be recognised");
  assertEquals(got.intent, "confirm_availability");
  assertEquals(got.availability?.date, "2026-09-22");
  assertEquals(got.availability?.window, "2-4");
  // new_date carries the same day so today's buildEffect already forwards it.
  assertEquals(got.new_date, "2026-09-22");
  assert(got.confidence >= 0.8, "a certain parse sits in the high bucket");
});

Deno.test("availability: a day with a daypart, and a rule with no day", () => {
  const daypart = parse("Thursday morning");
  assert(daypart, "'Thursday morning' should be recognised");
  assertEquals(daypart.intent, "confirm_availability");
  assertEquals(daypart.availability?.date, TODAY);
  assertEquals(daypart.availability?.window, "morning");

  const rule = parse("any weekday after 1");
  assert(rule, "'any weekday after 1' should be recognised");
  assertEquals(rule.intent, "confirm_availability");
  assertEquals(rule.availability?.date, null);
  assertEquals(rule.availability?.window, "weekdays after 1");
});

Deno.test("arrival: here, arrived, delivered, dropped off", () => {
  for (const body of ["here", "Arrived", "delivered", "Dropped off", "we're here"]) {
    const got = parse(body);
    assert(got, `'${body}' should be recognised`);
    assertEquals(got.intent, "report_arrival", `'${body}' is an arrival`);
    // Arrival says nothing about the goods.
    assertEquals(got.condition, undefined);
  }
});

Deno.test("condition: damage is not ok, and plain ok is", () => {
  for (const body of ["damaged", "scratched", "missing 1"]) {
    const got = parse(body);
    assert(got, `'${body}' should be recognised`);
    assertEquals(got.intent, "report_condition");
    assertEquals(got.condition?.ok, false, `'${body}' is not ok`);
    assertEquals(got.condition?.note, body);
  }
  for (const body of ["ok", "good", "no damage"]) {
    const got = parse(body);
    assert(got, `'${body}' should be recognised`);
    assertEquals(got.intent, "report_condition");
    assertEquals(got.condition?.ok, true, `'${body}' is ok`);
  }
});

Deno.test("negated participles report a clean condition only when their remainder is clean", () => {
  for (const body of [
    "not damaged", "nothing damaged", "nothing broken", "not scratched",
    "nothing is damaged", "isn't damaged", "isnt damaged", "wasn't broken",
    "wasnt broken", "aren't damaged", "arent damaged", "never damaged",
  ]) {
    const got = parse(body);
    assertEquals(got?.intent, "report_condition", body);
    assertEquals(got?.condition?.ok, true, `${body} is a clean condition`);
  }
  assertEquals(parse("not damaged but missing a chair")?.condition?.ok, false);
  assertEquals(parse("not damaged, no good"), null);
  assertEquals(parse("not damaged?"), null);
});

Deno.test("departure: leaving, done for today", () => {
  for (const body of ["leaving", "Done for today", "packing up"]) {
    const got = parse(body);
    assert(got, `'${body}' should be recognised`);
    assertEquals(got.intent, "report_departure");
  }
});

// ── The ambiguous ones stay ambiguous ───────────────────────────────────────
// Each of these looks like one of the four and is not. Returning null sends
// them down the model path and, failing that, to needs_review — which is where
// an uncertain field text belongs.

Deno.test("ambiguous: a greeting is not a condition or a window", () => {
  assertEquals(parse("good morning"), null);
});

Deno.test("ambiguous: a hedge is not an availability answer", () => {
  assertEquals(parse("maybe tomorrow?"), null);
});

Deno.test("ambiguous: 'here' inside a sentence is not an arrival", () => {
  assertEquals(parse("here is the invoice for the tile"), null);
});

Deno.test("ambiguous: a question about a day is not an answer about a day", () => {
  assertEquals(parse("can we do thursday?"), null);
});

// ── The numeric channel belongs to the menu, the chooser and the ref (S1) ───

Deno.test("a bare number is never an intent", () => {
  for (const body of ["2", "17", " 7 "]) {
    assertEquals(parse(body), null, `'${body}' belongs to the menu/chooser`);
  }
  // `<VERB> NN` is ref resolution, not a field report.
  assertEquals(parse("DONE 1"), null);
  assertEquals(parse("ok 42"), null);
  // ... but a count in a damage report is not a ref.
  const missing = parse("missing 2");
  assert(missing, "'missing 2' is a condition report, not a ref reply");
  assertEquals(missing.intent, "report_condition");
  assertEquals(missing.condition?.ok, false);
});

// ── The SQ-36 regressions ───────────────────────────────────────────────────
// Three of the four defects that review SQ-36 reproduced against candidate
// ad27e846 (the fourth, the digest budget, is in _tests/field-line-copy.test.ts).
// R1-R4 are the reviewer's own assertions, verbatim but for the import path.

Deno.test("R1 missing goods must never become a clean condition", () => {
  const got = parse("no damage but missing a chair");
  assert(got?.condition?.ok !== true, JSON.stringify(got));
});

Deno.test("R2 digit-led menu channel must not become a delivery intent", () => {
  assertEquals(parse("2 damaged"), null);
});

Deno.test("R4 invalid clock ranges must remain uncertain", () => {
  assertEquals(parse("Tue 99-99"), null);
});

// The same three defects, in the other shapes they arrive in.

Deno.test("a negation is not proof of a clean report", () => {
  for (
    const body of [
      "no damage but missing a chair",
      "no damage but one box short",
      "if there is no damage i will sign",
      "no damage yet",
      "no issues but not all here",
    ]
  ) {
    const got = parse(body);
    assert(
      got === null || got.condition?.ok === false,
      `'${body}' must not read as a clean delivery: ${JSON.stringify(got)}`,
    );
  }
  // Explicitly null, not a damage call: the sentence is the model's to read.
  assertEquals(parse("no damage yet"), null);
  assertEquals(parse("if there is no damage i will sign"), null);

  // Missing goods with nobody denying it is a condition report, and not ok.
  for (const body of ["missing a chair", "one box short", "not all here"]) {
    const got = parse(body);
    assert(got, `'${body}' should be recognised`);
    assertEquals(got.intent, "report_condition");
    assertEquals(got.condition?.ok, false, `'${body}' is not ok`);
  }
  // A clean call with nothing but filler after it still lands.
  const clean = parse("no damage, all unwrapped");
  assert(clean, "'no damage, all unwrapped' should be recognised");
  assertEquals(clean.condition?.ok, true);
});

Deno.test("anything that opens with a number belongs to the menu (S1)", () => {
  for (const body of ["2 damaged", "10 no damage", "3 tue 2-4", "7 here"]) {
    assertEquals(parse(body), null, `'${body}' is the menu's, not ours`);
  }
});

Deno.test("a window has to be a clock", () => {
  for (const body of ["Tue 99-99", "tue 25-26", "tue 4-2pm", "tue after 99", "tue 2:75-4"]) {
    assertEquals(parse(body), null, `'${body}' is not a window`);
  }
  // The clocks that ARE clocks keep working, including the backwards-looking
  // "11-2", which is the one shape a bare range may run down in.
  for (const [body, window] of [
    ["tue 2-4", "2-4"],
    ["tue 11-2", "11-2"],
    ["tue 2-4pm", "2-4pm"],
    ["tue 9am-5pm", "9am-5pm"],
    ["tue after 1", "after 1"],
  ]) {
    const got = parse(body);
    assert(got, `'${body}' should be recognised`);
    assertEquals(got.intent, "confirm_availability");
    assertEquals(got.availability?.window, window);
  }
});

// ── The model path is untouched ─────────────────────────────────────────────
// SQ-36's property test: normalizeParse still coerces every pre-Field-Line
// intent and trust boundary exactly as it did before the deterministic layer
// existed. `baselineNormalize` is the pre-00641 body, copied in.

function baselineNormalize(
  raw: Record<string, unknown>,
  input: FieldParseInput,
): FieldParseResult {
  const intents = [
    "mark_done", "report_delay", "flag_blocker", "punch_report",
    "confirm_delivery", "note", "question", "unclear",
  ];
  const intent = intents.includes(raw.intent as string)
    ? (raw.intent as FieldParseResult["intent"])
    : "unclear";

  let target: FieldParseResult["target_ref"] = null;
  const rawTarget = raw.target_ref as { kind?: string; id?: string } | null | undefined;
  if (rawTarget && rawTarget.id && (rawTarget.kind === "task" || rawTarget.kind === "coordination")) {
    const known = input.openItems.find((it) => it.id === rawTarget.id && it.kind === rawTarget.kind);
    if (known) target = { kind: rawTarget.kind, id: rawTarget.id };
  }

  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0;

  return {
    intent,
    target_ref: target,
    new_date: typeof raw.new_date === "string" && raw.new_date ? raw.new_date : null,
    note: typeof raw.note === "string" ? raw.note : "",
    confidence,
  };
}

Deno.test("legacy normalizeParse behavior preserved for all old intents and trust-boundary coercions", () => {
  const input: FieldParseInput = {
    body: "done",
    today: TODAY,
    openItems: [{ id: "t1", kind: "task", title: "Task", project_name: "P", due: null }],
    recentMessages: [],
  };
  for (
    const intent of [
      "mark_done", "report_delay", "flag_blocker", "punch_report",
      "confirm_delivery", "note", "question", "unclear", "bogus",
    ]
  ) {
    for (const confidence of [-1, 0, 0.49, 0.5, 0.79, 0.8, 1, 2, "1"]) {
      for (const id of ["t1", "foreign"]) {
        const raw = {
          intent,
          confidence,
          target_ref: { kind: "task", id },
          note: "done",
          new_date: "2026-09-18",
        };
        assertEquals(normalizeParse(raw, input), baselineNormalize(raw, input));
      }
    }
  }
});

// ── The wiring: no model, no network ────────────────────────────────────────

Deno.test("parseFieldMessage answers a delivery text without calling the API", async () => {
  let calls = 0;
  const fetchImpl = ((..._args: unknown[]) => {
    calls++;
    return Promise.reject(new Error("the deterministic layer must not call out"));
  }) as unknown as typeof fetch;

  const got = await parseFieldMessage(
    { body: "here", openItems: [], recentMessages: [], today: TODAY },
    { fetchImpl, getEnv: () => "an-api-key-that-must-not-be-used" },
  );
  assertEquals(got.intent, "report_arrival");
  assertEquals(calls, 0, "no request should have been made");
});


// ── SQ-40/SQ-41 delta probes ───────────────────────────────────────────────
// Review SQ-40's full probe set is kept here with relative imports so it runs
// against this candidate instead of the review worktree.

Deno.test("SQ-41 negated positive remainders return null", () => {
  for (const body of [
    "no damage, no good",
    "no damage, everything is no good",
    "no damage, looks good? no",
    "no damage and not good",
    "no damage, nope",
    "no damage but no",
  ]) {
    assertEquals(parse(body), null, `'${body}' must be read by the model`);
  }
});

Deno.test("SQ-41 whole-segment clean remainders remain clean", () => {
  for (const body of [
    "no damage, everything good",
    "no damage, all unwrapped",
    "no damage. all good",
  ]) {
    assertEquals(parse(body)?.condition?.ok, true, `'${body}' remains clean`);
  }
});

for (const body of [
  "no damage but missing a chair",
  "no damage but one box short",
  "no damage yet",
  "if there is no damage i will sign",
  "no issues except the leg",
  "no damage. 2 boxes short",
  "undamaged but wrong colour",
  "no damage, no good",
  "no damage, everything is no good",
  "no damage, looks good? no",
]) Deno.test(`SQ-40 not clean: ${body}`, () => {
  const got = parse(body);
  assert(got?.condition?.ok !== true, JSON.stringify(got));
});

Deno.test("SQ-40 clean filler and unnegated missing goods", () => {
  assertEquals(parse("no damage, all unwrapped")?.condition?.ok, true);
  assertEquals(parse("missing a chair")?.condition?.ok, false);
});

for (const body of [
  "2 damaged", "10 no damage", "3 tue 2-4", "1) done", "2.", "OK 12",
  "DONE 12", "YES 12", "NO 12", "DELAY 12", "CONFIRM 12", "PUNCH 123",
]) Deno.test(`SQ-40 reserved channel: ${body}`, () => assertEquals(parse(body), null));

for (const body of [
  "Tue 99-99", "tue 25-26", "tue 4-2pm", "after 99", "tue after 99",
  "tue 13am-2pm", "tue 2:60-4", "before 0", "tue 4pm-2pm",
  "tue 2pm-1am", "tue 12pm-11am", "tue 10:60-11", "tue 24-25",
  "tue 12am-12am",
]) Deno.test(`SQ-40 invalid/uncertain clock: ${body}`, () => assertEquals(parse(body), null));

for (const body of [
  "tue 12-1", "tue 11-2", "tue 2-4", "tue 12am-1am", "tue 12pm-1pm",
  "tue 11am-12pm", "tue 0-1", "tue 23-23:59",
]) Deno.test(`SQ-40 valid clock: ${body}`, () =>
  assertEquals(parse(body)?.intent, "confirm_availability")
);

Deno.test("SQ-40 here still arrives", () =>
  assertEquals(parse("here")?.intent, "report_arrival")
);

const septets = (value: string) => Array.from(value).reduce(
  (count, character) => count + ("^{}\\[~]|€".includes(character) ? 2 : 1),
  0,
);

Deno.test("SQ-40 digest matrix: extension titles, labels, item counts, visible entries", () => {
  assertEquals(DIGEST_MENU_MAX_SEPTETS, 42);
  for (const count of [1, 2, 3, 9, 10, 99, 100]) {
    for (const title of ["I".repeat(40), "[".repeat(20), "A", "A ^ B"]) {
      for (const due of [null, TODAY, "2026-09-01", "2026-09-25"]) {
        const items = Array.from({ length: count }, (_, index) => ({
          id: `t${index}`,
          kind: "task" as const,
          title,
          project_id: "p",
          due,
        }));
        const got = buildDigestMenu(items, TODAY);
        assert(septets(got.menuText) <= 42, JSON.stringify(got));
        assert(!got.menuText.includes("…"));
        const visible = [...got.menuText.replace(/\([^)]*\)/g, "").matchAll(/(?:^| )(\d+)\) /g)]
          .map((match) => +match[1]);
        assertEquals(got.entries.map((entry) => entry.n), visible);
        assert(got.entries.length > 0);
        for (const entry of got.entries) assertEquals(entry.id, items[entry.n - 1].id);
        if (got.entries.length < count) assert(got.menuText.endsWith(`+${count - got.entries.length} more`));
      }
    }
  }
});

Deno.test("SQ-40 actual digest single extension-name max renders <=306 septets", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/00641_field_line_effects_templates.sql", import.meta.url),
  );
  const quote = String.fromCharCode(39);
  const closing = sql.match(new RegExp(`v_closing\\s+CONSTANT\\s+text\\s*:=\\s*${quote}([^${quote}]+)${quote}`))![1];
  const template = sql.match(
    new RegExp(`\\(${quote}sms_daily_digest${quote},\\s*${quote}[^${quote}]+${quote},\\s*${quote}([^${quote}]+)${quote}`),
  )![1] + " " + closing;
  const menu = buildDigestMenu(
    [{ id: "1", kind: "task", title: "I".repeat(40), project_id: "p", due: TODAY }],
    TODAY,
  );
  const params: Record<string, string> = {
    studio_name: "[".repeat(12),
    project_name: "P".repeat(24),
    menu: menu.menuText,
    link: "https://client.patina.cloud/field/" + "a".repeat(64),
  };
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? "");
  assertEquals(septets(rendered), 306);
});
