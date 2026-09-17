// _shared/field-parse.ts — LLM parse of a freeform field text into a structured
// field effect. Claude haiku via forced tool-use so the model MUST return the
// schema (no prose to parse). Auth/headers/error handling copy companion-message
// (x-api-key + anthropic-version, direct fetch to api.anthropic.com).
//
// The Anthropic client is injectable (fetchImpl + getEnv) so the confidence-gate
// logic in sms-inbound tests with a stubbed parser and no network.

export type FieldIntent =
  | "mark_done"
  | "report_delay"
  | "flag_blocker"
  | "punch_report"
  | "confirm_delivery"
  | "note"
  | "question"
  | "unclear"
  // The Field Line delivery vocabulary (contract S3, migration 00641). These
  // four are recognised WITHOUT the model — see parseFieldMessageDeterministic.
  | "confirm_availability"
  | "report_arrival"
  | "report_condition"
  | "report_departure";

export interface FieldParseResult {
  intent: FieldIntent;
  target_ref: { kind: "task" | "coordination"; id: string } | null;
  new_date: string | null; // ISO date (YYYY-MM-DD)
  note: string;
  confidence: number; // 0..1
  /** confirm_availability: the window they offered, in their own words. */
  availability?: { date: string | null; window: string | null };
  /** report_condition: what they said about the goods. */
  condition?: { ok: boolean; note: string };
}

/** A single open work item, compacted for the model's context. */
export interface OpenItemContext {
  id: string;
  kind: "task" | "coordination";
  title: string;
  project_name: string;
  due: string | null;
}

export interface FieldParseInput {
  body: string;
  openItems: OpenItemContext[];
  recentMessages: { direction: string; body: string }[]; // last ~5
  today: string; // YYYY-MM-DD
  hasMedia?: boolean;
}

export interface FieldParseDeps {
  fetchImpl?: typeof fetch;
  getEnv?: (key: string) => string | undefined;
  model?: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5";

const TOOL_NAME = "record_field_update";

const TOOL = {
  name: TOOL_NAME,
  description:
    "Record the contractor's text as a structured field update against one of " +
    "their open items. Choose the single best intent and, when the text clearly " +
    "refers to one, the target item.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: [
          "mark_done",
          "report_delay",
          "flag_blocker",
          "punch_report",
          "confirm_delivery",
          "note",
          "question",
          "unclear",
        ],
        description:
          "mark_done: finished a task/item. report_delay: needs more time / a new date. " +
          "flag_blocker: can't proceed, needs the designer. punch_report: a defect/punch " +
          "item (often with a photo). confirm_delivery: goods arrived. note: an FYI with no " +
          "action. question: asking the designer something. unclear: can't tell.",
      },
      target_ref: {
        type: ["object", "null"],
        description: "The open item this refers to, or null if none is clearly implicated.",
        properties: {
          kind: { type: "string", enum: ["task", "coordination"] },
          id: { type: "string" },
        },
        required: ["kind", "id"],
      },
      new_date: {
        type: ["string", "null"],
        description: "For report_delay: the new date as YYYY-MM-DD, resolved against today. Else null.",
      },
      note: {
        type: "string",
        description: "A short paraphrase of what the contractor said (for the designer + record).",
      },
      confidence: {
        type: "number",
        description: "0..1 confidence that intent + target_ref are correct.",
      },
    },
    required: ["intent", "note", "confidence"],
  },
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// The deterministic layer (contract S3; migration 00641)
// ═════════════════════════════════════════════════════════════════════════════
// The four delivery answers are short, closed and worth money, so they are NOT
// sent to a model: "here" must mean arrived every single time, and a parse that
// is right 97% of the time is a parse that tells a studio their sofa arrived
// when it did not. Anything this layer is not certain about returns null and
// falls through to the model exactly as before — ambiguity keeps its old route
// to needs_review, it never becomes a confident wrong answer.
//
// The numeric channel is NOT ours (contract S1): a bare number is the digest
// menu or the project chooser, and `<VERB> NN` is a ref reply. Both return null
// here so the pipeline's own branches keep them.

/** Deterministic hits sit in today's high bucket (pipeline.ts:1411, >= 0.8). */
const DETERMINISTIC_CONFIDENCE = 0.9;

const DAY_INDEX: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Words that own the `<VERB> NN` grammar (S1) or the menu. Never an intent. */
const REPLY_VERBS = new Set([
  "done", "ok", "okay", "yes", "y", "no", "n", "got", "confirm", "confirmed",
  "stop", "start", "help", "delay", "delayed", "skip", "punch", "blocked",
]);

const GREETINGS = new Set([
  "good morning", "good afternoon", "good evening", "good day",
  "morning", "afternoon", "evening",
  "hi", "hey", "hello", "yo", "thanks", "thank you", "thx", "ok thanks",
]);

const ARRIVAL_PHRASES = new Set([
  "here", "im here", "i'm here", "we're here", "were here", "we are here",
  "on site", "onsite", "on the site", "at the site", "at the house",
  "arrived", "just arrived", "we arrived", "i arrived", "we have arrived",
  "got here", "just got here", "we just got here",
  "delivered", "just delivered", "its delivered", "it's delivered",
  "all delivered", "delivery is here", "delivery here", "truck is here",
  "truck here", "dropped off", "just dropped off", "dropped it off",
  "dropped everything off", "drop off done",
]);

const DEPARTURE_PHRASES = new Set([
  "leaving", "im leaving", "i'm leaving", "we're leaving", "were leaving",
  "we are leaving", "heading out", "headed out", "taking off", "packing up",
  "packed up", "off site", "offsite", "clocking out", "wrapping up",
  "wrapped up", "out of here", "done for today", "done for the day",
  "all done for today", "all done for the day", "finished for today",
  "that's it for today", "thats it for today", "that's us for today",
  "thats us for today",
]);

const CONDITION_OK_PHRASES = new Set([
  "ok", "okay", "all ok", "all okay", "good", "all good", "looks good",
  "all looks good", "it looks good", "they look good", "fine", "all fine",
  "everything is fine", "everything looks good", "everything is good",
  "no damage", "no issues", "no problems", "undamaged", "in good shape",
]);

const DAMAGE_RE =
  /\b(damaged|damage|scratched|scratch|scratches|broken|broke|cracked|crack|chipped|chip|dented|dent|torn|ripped|stained|soaked|missing \d+|missing one|missing a|missing the|one short|box short|not all here|short \d+|wrong (item|items|colour|color|piece|size|order))\b/;

const NEGATED_DAMAGE_RE =
  /\bno (damage|damages|issues|problems|marks|dents|scratches|breaks)\b/g;

const NEGATED_DAMAGE_PARTICIPLE_RE =
  /\b(not|nothing|nothing is|isn't|isnt|wasn't|wasnt|aren't|arent|never)\s+(damaged|scratched|broken|cracked|chipped|dented|torn|ripped|stained|soaked|missing)\b/g;

/** Language that describes a condition they have NOT seen yet. */
const CONDITIONAL_RE = /\b(if|unless|will|once)\s/;

/**
 * Approved whole remainder segments after a negated-damage phrase. The two
 * multi-word fillers are explicit entries, not a positive-phrase word bag.
 */
const CLEAN_REMAINDER_FILLER_SEGMENTS = new Set([
  "all", "everything", "unwrapped", "here", "fine", "good", "looks good",
  "everything good", "all unwrapped",
]);

const CLEAN_REMAINDER_NEGATION_RE = /\b(?:no|not|never|nothing|nope|none)\b|n['’]t\b/;

/** True when every remainder segment is an approved phrase or filler. */
function isCleanRemainder(remainder: string): boolean {
  const segments = remainder
    .split(/[,.;]+|\band\b/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 0 && segments.every((segment) =>
    CONDITION_OK_PHRASES.has(segment) || CLEAN_REMAINDER_FILLER_SEGMENTS.has(segment)
  );
}

const DAYPARTS = new Set([
  "morning", "afternoon", "evening", "anytime", "any time", "all day",
  "first thing",
]);

const AFFIRMATIONS = new Set([
  "works", "work", "is good", "is fine", "is ok", "is okay", "good", "fine",
  "ok", "okay", "yes", "that works", "works for us", "works for me",
]);

const TIME_RANGE_RE =
  /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|til|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
const AFTER_BEFORE_RE = /^(after|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;

/** A clock only counts when it is a clock: "99", "25" and ":75" are not. */
function isClock(hour: number, minute: number | null, meridiem?: string): boolean {
  if (minute !== null && minute > 59) return false;
  return meridiem ? hour >= 1 && hour <= 12 : hour <= 23;
}

/** Minutes past midnight once am/pm is resolved (bare hours read as written). */
function clockMinutes(hour: number, minute: number | null, meridiem?: string): number {
  let h = hour;
  if (meridiem === "am") h = hour === 12 ? 0 : hour;
  if (meridiem === "pm") h = hour === 12 ? 12 : hour + 12;
  return h * 60 + (minute ?? 0);
}

/** "2-4", "9am-5pm", "11-2" — a range we can defend, or null. */
function timeRangeOf(t: string): string | null {
  const m = t.match(TIME_RANGE_RE);
  if (!m) return null;
  const num = (s: string | undefined) => (s === undefined ? null : parseInt(s, 10));
  const [sh, smin, smer, eh, emin, emer] = [
    parseInt(m[1], 10), num(m[2]), m[3], parseInt(m[4], 10), num(m[5]), m[6],
  ];
  if (!isClock(sh, smin, smer ?? emer) || !isClock(eh, emin, emer ?? smer)) return null;

  if (!smer && !emer) {
    // Nobody wrote am/pm. "2-4" reads forward; "11-2" is the one shape that
    // may run backwards, because both halves are readable on a 12-hour clock.
    const start = clockMinutes(sh, smin);
    const end = clockMinutes(eh, emin);
    if (end > start) return t;
    return start > end && sh <= 12 && eh <= 12 ? t : null;
  }
  // One half said am/pm, so the other half means the same half of the day:
  // "2-4pm" is an afternoon, and "4-2pm" is not a window at all.
  const start = clockMinutes(sh, smin, smer ?? emer);
  const end = clockMinutes(eh, emin, emer ?? smer);
  return end > start ? t : null;
}

/** Their own words for a window, or null when we do not understand them. */
function windowOf(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (DAYPARTS.has(t)) return t;
  const range = timeRangeOf(t);
  if (range) return range;
  const open = t.match(AFTER_BEFORE_RE);
  if (open) {
    const minute = open[3] === undefined ? null : parseInt(open[3], 10);
    return isClock(parseInt(open[2], 10), minute, open[4]) ? t : null;
  }
  return null;
}

function isoUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A day word resolved against the day they texted. Same weekday = today. */
function resolveDay(token: string, today: string): string | null {
  const base = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(base)) return null;
  if (token === "today") return today;
  if (token === "tomorrow" || token === "tmrw" || token === "tmw") {
    return isoUtc(base + 86_400_000);
  }
  const idx = DAY_INDEX[token];
  if (idx === undefined) return null;
  const delta = (idx - new Date(base).getUTCDay() + 7) % 7;
  return isoUtc(base + delta * 86_400_000);
}

/** "Tue 2-4" · "Thursday morning" · "any weekday after 1" — or null. */
function availabilityOf(
  norm: string,
  today: string,
): { date: string | null; window: string | null } | null {
  if (norm.split(" ").length > 6) return null;

  // A rule rather than a day: no date, the rule IS the window.
  const rule = norm.match(
    /^(any weekday|any weekdays|weekdays|any day|any days|most days)(?:\s+(.*))?$/,
  );
  if (rule) {
    const tail = rule[2]?.trim();
    const w = tail ? windowOf(tail) : null;
    if (tail && !w) return null;
    const head = rule[1].startsWith("any day") || rule[1] === "any days"
      ? "any day"
      : rule[1] === "most days"
      ? "most days"
      : "weekdays";
    return { date: null, window: w ? `${head} ${w}` : head };
  }

  const day = norm.match(/^([a-z]+)\s+(.+)$/);
  if (!day) return null;
  const date = resolveDay(day[1], today);
  if (!date) return null;

  const tail = day[2].trim();
  const w = windowOf(tail);
  if (w) return { date, window: w };
  // "thursday works" — a day with no window, but unmistakably an answer.
  if (AFFIRMATIONS.has(tail)) return { date, window: null };
  return null;
}

/**
 * Recognise the four Field Line delivery answers without a model. Returns null
 * for everything else — including everything ambiguous — so the caller falls
 * through to the LLM path and, failing that, to needs_review.
 */
export function parseFieldMessageDeterministic(
  input: { body: string; today: string },
): FieldParseResult | null {
  const raw = (input.body ?? "").trim();
  if (!raw) return null;

  const norm = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!,;:]+$/, "")
    .trim();
  if (!norm) return null;

  // A question is a question, not a report.
  if (norm.endsWith("?")) return null;

  // Contract S1: the numeric channel is the menu's, the chooser's and the
  // ref's. A bare number is never an intent, and neither is `<VERB> NN`.
  if (/^\d{1,3}$/.test(norm)) return null;
  const verbFirst = norm.match(/^([a-z]+) \d{1,3}$/);
  if (verbFirst && REPLY_VERBS.has(verbFirst[1])) return null;
  const verbLast = norm.match(/^\d{1,3} ([a-z]+)$/);
  if (verbLast && REPLY_VERBS.has(verbLast[1])) return null;
  // The whole digit-led channel is reserved, not just the bare number: "2
  // damaged" is menu item 2 reported damaged, "10 no damage" is item 10, and
  // "3 tue 2-4" is item 3's window. The pipeline owns all three — reading the
  // tail here would answer about the wrong item.
  if (/^\d{1,3}\b/.test(norm)) return null;

  if (GREETINGS.has(norm)) return null;

  const note = raw.slice(0, 200);
  const base = {
    target_ref: null,
    new_date: null as string | null,
    note,
    confidence: DETERMINISTIC_CONFIDENCE,
  };

  const bare = norm.replace(/^(now|just|we are|we're|were|i am|i'm|im) /, "");

  if (DEPARTURE_PHRASES.has(norm) || DEPARTURE_PHRASES.has(bare)) {
    return { ...base, intent: "report_departure" };
  }
  if (ARRIVAL_PHRASES.has(norm) || ARRIVAL_PHRASES.has(bare)) {
    return { ...base, intent: "report_arrival" };
  }

  // "if there is no damage i will sign" is a condition they have not inspected
  // yet. A promise is never a report.
  if (CONDITIONAL_RE.test(norm)) return null;

  const withoutNegation = norm
    .replace(NEGATED_DAMAGE_RE, " ")
    .replace(NEGATED_DAMAGE_PARTICIPLE_RE, " ");
  if (
    withoutNegation !== norm &&
    (CLEAN_REMAINDER_NEGATION_RE.test(withoutNegation) || withoutNegation.includes("?"))
  ) {
    return null;
  }
  if (CONDITION_OK_PHRASES.has(norm)) {
    return { ...base, intent: "report_condition", condition: { ok: true, note } };
  }
  if (DAMAGE_RE.test(withoutNegation)) {
    return { ...base, intent: "report_condition", condition: { ok: false, note } };
  }
  if (withoutNegation !== norm && withoutNegation.trim() && !isCleanRemainder(withoutNegation)) {
    // "no damage yet" — the negation was one clause of a sentence, and the
    // rest is uncertain. A matched negation is not proof that the goods are fine.
    return null;
  }
  if (withoutNegation !== norm) {
    // A bare negated participle is the trade's clean report.
    return { ...base, intent: "report_condition", condition: { ok: true, note } };
  }

  const availability = availabilityOf(norm, input.today);
  if (availability) {
    return {
      ...base,
      intent: "confirm_availability",
      new_date: availability.date,
      availability,
    };
  }

  return null;
}

function buildSystemPrompt(input: FieldParseInput): string {
  const items = input.openItems.length === 0
    ? "(none)"
    : input.openItems
      .map(
        (it) =>
          `- [${it.kind}] id=${it.id} · "${it.title}" · project="${it.project_name}"` +
          (it.due ? ` · due=${it.due}` : ""),
      )
      .join("\n");
  const history = input.recentMessages.length === 0
    ? "(none)"
    : input.recentMessages
      .map((m) => `${m.direction === "inbound" ? "them" : "us"}: ${m.body}`)
      .join("\n");

  return [
    "You structure short SMS texts from construction/decor contractors into a field update.",
    `Today is ${input.today}.`,
    input.hasMedia ? "The text arrived WITH one or more photos (MMS)." : "",
    "",
    "Their open items (pick target_ref.id from these exact ids only):",
    items,
    "",
    "Recent conversation:",
    history,
    "",
    "Rules:",
    "- Always call the record_field_update tool.",
    "- Only set target_ref to an id from the list above; if the text doesn't clearly point to one, set it null.",
    "- A photo of a defect with little text is usually punch_report.",
    "- If they ask something or you can't tell, use question/unclear with low confidence.",
    "- Resolve relative dates (e.g. 'Tuesday', 'next week') to a concrete YYYY-MM-DD for report_delay.",
  ].join("\n");
}

/**
 * Parse a field text. Returns a low-confidence `unclear` result on any failure
 * (missing key, network error, malformed tool call) so the caller routes it to
 * designer review rather than acting on garbage.
 */
export async function parseFieldMessage(
  input: FieldParseInput,
  deps: FieldParseDeps = {},
): Promise<FieldParseResult> {
  // The delivery answers are decided here, not by a model — and with no
  // network call at all. Everything the deterministic layer is unsure about
  // returns null and takes the model path below, unchanged.
  const certain = parseFieldMessageDeterministic(input);
  if (certain) return certain;

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = getEnv("CLAUDE_API_KEY");

  const fallback: FieldParseResult = {
    intent: "unclear",
    target_ref: null,
    new_date: null,
    note: input.body?.slice(0, 200) ?? "",
    confidence: 0,
  };
  if (!apiKey) return fallback;

  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: deps.model ?? DEFAULT_MODEL,
        max_tokens: 512,
        system: buildSystemPrompt(input),
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{ role: "user", content: input.body || "(no text)" }],
      }),
    });

    if (!res.ok) {
      console.error("field-parse: Claude API error", res.status, await res.text());
      return fallback;
    }
    const data = await res.json();
    const toolUse = (data.content ?? []).find(
      (b: { type?: string; name?: string }) => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    if (!toolUse?.input) return fallback;

    return normalizeParse(toolUse.input, input);
  } catch (err) {
    console.error("field-parse: call failed", err);
    return fallback;
  }
}

/** Validate + coerce the tool output; drop a target_ref not in the open set. */
export function normalizeParse(
  raw: Record<string, unknown>,
  input: FieldParseInput,
): FieldParseResult {
  // The Field Line names are accepted here but deliberately NOT added to the
  // tool schema above: the model keeps the vocabulary it was tuned on, and the
  // four delivery answers come from the deterministic layer, which cannot
  // confuse "delivered" (arrival) with confirm_delivery (goods received).
  const intents: FieldIntent[] = [
    "mark_done", "report_delay", "flag_blocker", "punch_report",
    "confirm_delivery", "note", "question", "unclear",
    "confirm_availability", "report_arrival", "report_condition",
    "report_departure",
  ];
  const intent = intents.includes(raw.intent as FieldIntent)
    ? (raw.intent as FieldIntent)
    : "unclear";

  let target: FieldParseResult["target_ref"] = null;
  const rawTarget = raw.target_ref as { kind?: string; id?: string } | null | undefined;
  if (rawTarget && rawTarget.id && (rawTarget.kind === "task" || rawTarget.kind === "coordination")) {
    // Only trust an id the model was actually shown.
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
