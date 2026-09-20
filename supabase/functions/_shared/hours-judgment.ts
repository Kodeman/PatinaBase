// _shared/hours-judgment.ts — a typed judgment (TypeSafe System One / Jev) over
// a free-text answer to the evening's hours ask, for the bodies HOURS_REPLY's
// number grammar cannot read ("about 6 and a half").
//
// Shape copied from _shared/field-parse.ts: the client is injectable
// (fetchImpl + getEnv) so the gate logic tests with a stubbed transport and no
// network, and every failure answers with a value rather than throwing.
//
// SELECT, NEVER GENERATE. The hours a caller acts on come from
// findHourCandidates' own normalization of the span the model SELECTED; no
// number is ever read out of the model's reply. A model that cannot produce
// digits cannot invent an hour.
//
// STATE CARRIES NO IDENTITY (US-6, Kody 2026-09-20). The message body, the ask's
// own words, the visit's task title and the frozen ask-day are the whole of what
// leaves this rail. No phone number, no party or studio name, no row id.

/** A span of the body that could be a number of hours, and what it normalizes to. */
export interface HourCandidate {
  span: string;
  hours: number;
}

export interface HoursJudgmentInput {
  body: string;
  askText: string;
  taskTitle: string;
  askDay: string;
  openPrompts: Array<{ code: string; label: string }>;
}

export interface HoursJudgmentDeps {
  fetchImpl?: typeof fetch;
  getEnv?: (key: string) => string | undefined;
  model?: string;
  timeoutMs?: number;
}

export type HoursDeferReason =
  | "no_key"
  | "http"
  | "timeout"
  | "malformed"
  | "no_candidates"
  | "intent"
  | "multi_day"
  | "low_confidence"
  | "out_of_range";

export type HoursJudgment =
  | { kind: "hours"; hours: number; promptCode: string | null; confidence: number }
  | { kind: "defer"; reason: HoursDeferReason };

/**
 * The lowest min-confidence an hours reading may act on. Initial value; SQ-133's
 * live eval tunes it to the lowest threshold with zero wrong acts on the
 * labelled set.
 */
export const HOURS_JUDGMENT_MIN_CONFIDENCE = 0.7;

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 4000;
const API_KEY = "TYPESAFE_API_KEY";

/** A day nobody worked, and the longest day this rail takes on a text alone. */
const HOURS_MIN = 0;
const HOURS_MAX = 16;

/** The multi-day probability at or above which one number cannot be one day's hours. */
const MULTI_DAY_CUT = 0.5;

const NO_SPAN = "none_of_these";
const UNCLEAR_PROMPT = "unclear";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16,
};

const WORD_ALTERNATION = Object.keys(NUMBER_WORDS).join("|");

/** A numeral or a number word, as the compound patterns read their leading half. */
function leadingNumber(token: string): number {
  const word = NUMBER_WORDS[token.toLowerCase()];
  return word ?? Number(token);
}

interface CandidatePattern {
  re: RegExp;
  value: (match: RegExpExecArray) => number;
}

// Over-recall on purpose (TypeSafe's pre-parsed value extraction cookbook): every
// number-shaped span in the body becomes a candidate, and the model decides which
// one — if any — is the hours worked. Ordering here does not decide precedence;
// overlap is resolved below by longest span, so "6 and a half" keeps its whole
// span and never also offers a bare "6" the model could pick instead.
const PATTERNS: CandidatePattern[] = [
  {
    re: new RegExp(`\\b(\\d{1,2}|${WORD_ALTERNATION})\\s+and\\s+(?:an?\\s+)?half\\b`, "gi"),
    value: (m) => leadingNumber(m[1]) + 0.5,
  },
  {
    re: new RegExp(`\\b(\\d{1,2}|${WORD_ALTERNATION})[\\s-]+1\\s*/\\s*2\\b`, "gi"),
    value: (m) => leadingNumber(m[1]) + 0.5,
  },
  { re: /\b(\d{1,2})[.,](\d{1,2})\b/g, value: (m) => Number(`${m[1]}.${m[2]}`) },
  { re: /\b1\s*\/\s*2\b/g, value: () => 0.5 },
  { re: new RegExp(`\\b(${WORD_ALTERNATION})\\b`, "gi"), value: (m) => NUMBER_WORDS[m[1].toLowerCase()] },
  { re: /\bhalf\b/gi, value: () => 0.5 },
  { re: /\b(\d{1,2})\b/g, value: (m) => Number(m[1]) },
];

/**
 * Every span of `body` that could be a number of hours, left-to-right, with the
 * value code reads out of it. Deliberately generous: a span here is a candidate,
 * not a claim, and nothing is filtered for plausibility or range — the selection
 * and the range check both happen after the model has chosen.
 */
export function findHourCandidates(body: string): HourCandidate[] {
  const text = body ?? "";
  const found: Array<{ start: number; end: number; span: string; hours: number }> = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(text)) !== null) {
      const hours = pattern.value(match);
      if (Number.isFinite(hours)) {
        found.push({ start: match.index, end: match.index + match[0].length, span: match[0], hours });
      }
      // A zero-length match would spin forever; no pattern here can produce one,
      // but exec's lastIndex is shared state and cheap to keep honest.
      if (match[0].length === 0) pattern.re.lastIndex++;
    }
  }
  // Longest span wins its stretch of the body, so a compound reading is never
  // offered alongside the bare numeral inside it.
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const taken: Array<{ start: number; end: number }> = [];
  const seen = new Set<string>();
  const candidates: HourCandidate[] = [];
  for (const item of found) {
    if (taken.some((range) => item.start < range.end && range.start < item.end)) continue;
    taken.push({ start: item.start, end: item.end });
    // The model picks a span by its text, so two identical spans are one option.
    const key = item.span.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ span: item.span, hours: item.hours });
  }
  return candidates;
}

function buildQuestions(
  candidates: HourCandidate[],
  openPrompts: HoursJudgmentInput["openPrompts"],
): Record<string, unknown> {
  const spanOptions: Record<string, string> = {};
  for (const candidate of candidates) {
    spanOptions[candidate.span] = `The texter means this span of \`message\` as the number of hours they worked on \`ask.day\`.`;
  }
  spanOptions[NO_SPAN] =
    "None of these spans is the number of hours worked — the numbers mean something else (a time of day, a unit number, a count of days), or the texter gave no hours at all.";

  const questions: Record<string, unknown> = {
    intent: {
      type: "choice",
      instructions:
        "`ask.text` is a text message this rail sent asking how many hours were worked on `ask.day` at the job named by `ask.task_title`. `message` is the reply. What is the reply doing?",
      criteria: {
        reports_hours: "Stating how long they worked on `ask.day`, in any wording.",
        did_not_work: "Saying they did not work on `ask.day` at all — no show, cancelled, rained off.",
        question_or_confused: "Asking something back, or saying they do not know what the ask is about.",
        other_topic: "Talking about something other than hours worked — scheduling, materials, a problem on site.",
        none: "None of the above fits the reply.",
      },
    },
    hours_span: {
      type: "choice",
      instructions:
        "`candidates` lists every number-shaped span found in `message`. Which single span is the number of HOURS WORKED on `ask.day`? Choose the span exactly as listed; choose the no-match option rather than forcing one.",
      criteria: spanOptions,
    },
    multi_day: {
      type: "noul",
      instructions:
        "Does `message` report hours for MORE THAN ONE day, rather than only for `ask.day`?",
      criteria: {
        "true": "It covers two or more days — for example naming several days, or a per-day figure across days.",
        "false": "It reports a single day's hours, or no hours at all.",
      },
    },
  };

  // One question open means nothing to disambiguate; asking would only add a
  // confidence that can only lower the minimum.
  if (openPrompts.length > 1) {
    const promptOptions: Record<string, string> = {};
    for (const prompt of openPrompts) {
      promptOptions[prompt.code] = `The reply answers the hours ask for: ${prompt.label}`;
    }
    promptOptions[UNCLEAR_PROMPT] =
      "`message` does not say which of the open asks it answers.";
    questions.which_prompt = {
      type: "choice",
      instructions:
        "`open_prompts` lists the hours asks still open for this texter. Which one does `message` answer?",
      criteria: promptOptions,
    };
  }
  return questions;
}

function choiceAnswer(
  answers: Record<string, unknown>,
  id: string,
): { choice: string; confidence: number } | null {
  const answer = answers[id] as { choice?: unknown; confidence?: unknown } | undefined;
  if (!answer || typeof answer.choice !== "string" || typeof answer.confidence !== "number") return null;
  if (!Number.isFinite(answer.confidence)) return null;
  return { choice: answer.choice, confidence: answer.confidence };
}

function noulAnswer(answers: Record<string, unknown>, id: string): number | null {
  const answer = answers[id] as { noul?: unknown } | undefined;
  if (!answer || typeof answer.noul !== "number" || !Number.isFinite(answer.noul)) return null;
  return answer.noul;
}

/**
 * Read a free-text reply to an open hours ask.
 *
 * Answers `{kind:"hours"}` only when the model says the reply reports hours for
 * the one day asked about, names a candidate span as the number, and every
 * choice it made is at least HOURS_JUDGMENT_MIN_CONFIDENCE confident — and only
 * when the span's own normalized value is a number of hours a day can hold.
 * Everything else, including every transport and shape failure, answers
 * `{kind:"defer"}` with the reason. This function never throws.
 */
export async function judgeHoursReply(
  input: HoursJudgmentInput,
  deps: HoursJudgmentDeps = {},
): Promise<HoursJudgment> {
  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = getEnv(API_KEY);
  if (!apiKey) return { kind: "defer", reason: "no_key" };

  const candidates = findHourCandidates(input.body);
  // Nothing to select from is an answer code already has: no request is made.
  if (candidates.length === 0) return { kind: "defer", reason: "no_candidates" };

  const state = {
    message: input.body,
    ask: { text: input.askText, task_title: input.taskTitle, day: input.askDay },
    candidates: candidates.map((candidate) => candidate.span),
    open_prompts: input.openPrompts.map((prompt) => ({ code: prompt.code, label: prompt.label })),
  };
  const asksWhichPrompt = input.openPrompts.length > 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  // A reply that is not JSON at all is a malformed answer, not a transport
  // failure: an empty payload falls into the shape check below and says so.
  let payload: { answers?: unknown } = {};
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: deps.model ?? DEFAULT_MODEL,
        state,
        questions: buildQuestions(candidates, input.openPrompts),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("hours-judgment: TypeSafe error", res.status);
      return { kind: "defer", reason: "http" };
    }
    payload = await res.json().catch(() => ({}));
  } catch (err) {
    const aborted = controller.signal.aborted || (err as { name?: string })?.name === "AbortError";
    console.error("hours-judgment: call failed", aborted ? "timeout" : String(err));
    return { kind: "defer", reason: aborted ? "timeout" : "http" };
  } finally {
    clearTimeout(timer);
  }

  const answers = payload?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { kind: "defer", reason: "malformed" };
  }
  const bag = answers as Record<string, unknown>;

  const intent = choiceAnswer(bag, "intent");
  const span = choiceAnswer(bag, "hours_span");
  const multiDay = noulAnswer(bag, "multi_day");
  const whichPrompt = asksWhichPrompt ? choiceAnswer(bag, "which_prompt") : null;
  if (!intent || !span || multiDay === null || (asksWhichPrompt && !whichPrompt)) {
    return { kind: "defer", reason: "malformed" };
  }

  if (intent.choice !== "reports_hours") return { kind: "defer", reason: "intent" };
  if (multiDay >= MULTI_DAY_CUT) return { kind: "defer", reason: "multi_day" };
  if (span.choice === NO_SPAN) return { kind: "defer", reason: "no_candidates" };

  // The value is the CODE's normalization of the span the model named. A choice
  // that is not one of the spans we offered is not a selection at all.
  const chosen = candidates.find((candidate) => candidate.span === span.choice);
  if (!chosen) return { kind: "defer", reason: "malformed" };

  const confidences = [intent.confidence, span.confidence];
  if (whichPrompt) confidences.push(whichPrompt.confidence);
  const confidence = Math.min(...confidences);
  if (confidence < HOURS_JUDGMENT_MIN_CONFIDENCE) return { kind: "defer", reason: "low_confidence" };

  if (chosen.hours <= HOURS_MIN || chosen.hours > HOURS_MAX) {
    return { kind: "defer", reason: "out_of_range" };
  }

  const promptCode = asksWhichPrompt
    ? (whichPrompt!.choice === UNCLEAR_PROMPT
      ? null
      : input.openPrompts.find((prompt) => prompt.code === whichPrompt!.choice)?.code ?? null)
    : input.openPrompts[0]?.code ?? null;

  return { kind: "hours", hours: chosen.hours, promptCode, confidence };
}
