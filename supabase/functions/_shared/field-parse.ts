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
  | "unclear";

export interface FieldParseResult {
  intent: FieldIntent;
  target_ref: { kind: "task" | "coordination"; id: string } | null;
  new_date: string | null; // ISO date (YYYY-MM-DD)
  note: string;
  confidence: number; // 0..1
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
  const intents: FieldIntent[] = [
    "mark_done", "report_delay", "flag_blocker", "punch_report",
    "confirm_delivery", "note", "question", "unclear",
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
