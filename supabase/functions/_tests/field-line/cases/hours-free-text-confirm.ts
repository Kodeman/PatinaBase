import { inboundFixture } from "../inbound-fixture.ts";
import { readField } from "./helpers.ts";
import { hoursShape } from "../../../sms-inbound/pipeline.ts";
import type { GateAssertion, GateCase } from "../types.ts";

/**
 * THE EVENING ASK, ANSWERED IN WORDS (US-6, Kody's 2026-09-20 ruling).
 *
 * "about 6 and a half" answers tonight's hours question and HOURS_REPLY cannot
 * read it. _shared/hours-judgment.ts can, and a confident reading is allowed to
 * do exactly one thing: SAY THE NUMBER BACK AND ASK FOR IT. One templated
 * confirm goes out, the question stays open, nothing is consumed and no effect
 * is built — and the number the confirm prints is the number HOURS_REPLY reads,
 * so agreeing takes the ordinary path this rail has always had.
 *
 * WHY THIS CASE IS AN HONEST ORACLE, WHERE "FREE TEXT FILES HOURS" WOULD NOT BE.
 * sms_apply_prompt re-reads the STORED inbound body (00653:298) and its reply
 * grammar admits, for a report_hours prompt, only the HOURS_REPLY number — a
 * free-text body raises 23514 in production. This fixture does not model that
 * grammar: inbound-fixture.ts:93-94 derives `verb` as the body's first token and
 * uses it only for the proposed_effect / YES-Y-OK guard, so a case asserting
 * "confident free text produces one proposed effect" would pass here and fail in
 * production. THIS DESIGN NEVER SENDS A FREE-TEXT BODY TO sms_apply_prompt: the
 * only body that reaches the apply is the number the crew texts back, which the
 * grammar already accepts. The fixture's missing grammar is therefore not
 * exercised by anything below, and is not standing in for a ruling.
 *
 * S7 — the answer path: one confirm per question, the printed token round-trips
 *      through HOURS_REPLY and books when it comes back, a reference rides the
 *      token exactly when a bare number would be ambiguous, and nothing that
 *      cannot be read confidently changes today's answer.
 * S1 — what is filed: NOTHING, on the judged reading. One proposal per question,
 *      and it arrives with the number — never with the words.
 */

type Row = Record<string, unknown>;

/** The fixture clock's own day, as the daily producer freezes it (YYYYMMDD). */
const ASK_DAY = 20261101;
const DAY_LABEL = "Nov 1";
/** The reading the judgment is asked for: candidates are ["6 and a half"]. */
const OFF_GRAMMAR = "about 6 and a half";
const HOURS = 6.5;
const TYPESAFE_KEY = { TYPESAFE_API_KEY: "field-line-fixture-typesafe-key" };

/** The sentence a judged reading sends, and the three facts it has to carry. */
const CONFIRM = /^Reading that as (\S+) hours? on ([A-Z][a-z]{2} \d{1,2})\. Reply (.+) to file it\.$/;

function world(env: Record<string, string> = TYPESAFE_KEY) {
  return inboundFixture(undefined, undefined, env);
}

/** An evening's hours question, as 00653's producer issues one. */
function hoursAsk(
  fixture: ReturnType<typeof world>,
  id: string,
  shortCode: string,
  overrides: Record<string, unknown> = {},
): Row {
  return fixture.prompt({
    id,
    kind: "report_hours",
    short_code: shortCode,
    proposed_effect: null,
    version: ASK_DAY,
    ...overrides,
  });
}

/** The second seat's own evening, on the same handset. */
function otherSeat(id: string, shortCode: string) {
  return { id, shortCode, overrides: { party_id: "party-b", project_id: "project-b", subject_id: "task-b" } };
}

interface JudgmentStub {
  intent?: string;
  /** The span the model names; by default the first one offered. */
  span?: string;
  confidence?: number;
  multiDay?: number;
  /** What which_prompt answers, when it was asked at all. */
  which?: string;
}

/**
 * TypeSafe's answer, composed from what was actually asked: the span comes from
 * the request's own candidate list, and which_prompt is answered only when the
 * request carried that question — which is the module's own more-than-one rule.
 */
function judged(stub: JudgmentStub = {}) {
  return (request: Row): Response => {
    const state = (request.state ?? {}) as { candidates?: string[] };
    const questions = (request.questions ?? {}) as Row;
    const confidence = stub.confidence ?? 0.95;
    const answers: Row = {
      intent: { choice: stub.intent ?? "reports_hours", confidence },
      hours_span: { choice: stub.span ?? state.candidates?.[0] ?? "none_of_these", confidence },
      multi_day: { noul: stub.multiDay ?? 0.02 },
    };
    if (questions.which_prompt) {
      answers.which_prompt = { choice: stub.which ?? "unclear", confidence };
    }
    return new Response(JSON.stringify({ answers }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function firstReply(result: { replies?: Array<{ message: string }> }): string {
  return result.replies?.[0]?.message ?? "";
}

/** The confirm's three facts, or null when the reply is not one. */
function confirmOf(result: { replies?: Array<{ message: string }> }) {
  const message = firstReply(result);
  const match = message.match(CONFIRM);
  return match ? { message, hours: match[1], day: match[2], token: match[3] } : null;
}

/** One SMS segment of GSM-7, no emoji, nothing a carrier would split. */
function oneSegment(message: string): boolean {
  return message.length > 0 && message.length <= 160 && /^[ -~]+$/.test(message);
}

function hoursEffects(effects: Row[]): Row[] {
  return effects.filter((entry) => readField(entry.p_effect, "type") === "report_hours");
}

function answeredAt(fixture: ReturnType<typeof world>, id: string): unknown {
  return fixture.h.fake._data.sms_prompts.find((p) => p.id === id)!.answered_at;
}

/** The confirms already sent on this conversation, as the loop guard marks them. */
function marked(fixture: ReturnType<typeof world>): string[] {
  return fixture.h.fake._data.sms_conversation_context
    .flatMap((row) => (readField(row.state_context, "hours_confirmed") ?? []) as string[]);
}

export const hoursFreeTextConfirm: GateCase = {
  id: "hours-free-text-confirm",
  phase: 3,
  clauses: ["S7", "S1"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];

    // ── A confident reading says the number back, and files nothing ────────
    const once = world();
    hoursAsk(once, "hours-21", "21");
    once.typesafe.answer = judged();
    const asked = await once.h.processInbound({
      Body: OFF_GRAMMAR,
      MessageSid: "SMhoursWords",
    });
    const confirm = confirmOf(asked);
    // The token the crew is asked to send back is the token HOURS_REPLY reads,
    // and it means what the confirm said it means.
    const round = confirm ? hoursShape(confirm.token) : null;
    const confirmOk = !!confirm && once.typesafe.requests.length === 1 &&
      confirm.hours === "6.5" && confirm.day === DAY_LABEL &&
      confirm.token === "6.5" && oneSegment(confirm.message) &&
      round?.hours === HOURS && round?.code === null &&
      (asked.replies ?? []).length === 1 &&
      // Nothing consumed, nothing filed, the question still standing.
      hoursEffects(once.effects).length === 0 &&
      asked.effectApplied !== true &&
      answeredAt(once, "hours-21") === null &&
      marked(once).includes("hours-21");

    // ── The token comes back, and takes the ordinary path ──────────────────
    const booked = await once.h.processInbound({
      Body: confirm?.token ?? "",
      MessageSid: "SMhoursToken",
    });
    const filed = hoursEffects(once.effects);
    const roundTripOk = booked.disposition === "ref_applied" &&
      filed.length === 1 && readField(filed[0].p_effect, "hours") === HOURS &&
      readField(readField(filed[0].p_effect, "target"), "id") === "task-a" &&
      answeredAt(once, "hours-21") !== null &&
      // The judgment was asked once, about the words — never about the number.
      once.typesafe.requests.length === 1;

    // ── Two evenings open: the reference rides the token ───────────────────
    const two = world();
    hoursAsk(two, "hours-31", "31");
    const second = otherSeat("hours-32", "32");
    hoursAsk(two, second.id, second.shortCode, second.overrides);
    two.typesafe.answer = judged({ which: "32" });
    const picked = await two.h.processInbound({
      Body: OFF_GRAMMAR,
      MessageSid: "SMhoursTwoOpen",
    });
    const pickedConfirm = confirmOf(picked);
    const pickedRound = pickedConfirm ? hoursShape(pickedConfirm.token) : null;
    const twoOpenOk = !!pickedConfirm && pickedConfirm.token === "6.5 Ref 32" &&
      oneSegment(pickedConfirm.message) &&
      pickedRound?.hours === HOURS && pickedRound?.code === "32" &&
      hoursEffects(two.effects).length === 0;
    // The number comes back with the reference the confirm printed, and books
    // against THAT question — the other evening is untouched.
    const pickedBooked = await two.h.processInbound({
      Body: pickedConfirm?.token ?? "",
      MessageSid: "SMhoursTwoToken",
    });
    const twoFiled = hoursEffects(two.effects);
    const twoBookedOk = pickedBooked.disposition === "ref_applied" &&
      twoFiled.length === 1 &&
      readField(readField(twoFiled[0].p_effect, "target"), "id") === "task-b" &&
      answeredAt(two, "hours-32") !== null &&
      answeredAt(two, "hours-31") === null;

    // ── Two evenings open and nothing saying which ─────────────────────────
    // The codeless door's own answer, which is what the same body gets from the
    // number grammar: it asks, and it confirms nothing.
    const unclear = world();
    hoursAsk(unclear, "hours-41", "41");
    const unclearSecond = otherSeat("hours-42", "42");
    hoursAsk(unclear, unclearSecond.id, unclearSecond.shortCode, unclearSecond.overrides);
    unclear.typesafe.answer = judged({ which: "unclear" });
    const clarify = await unclear.h.processInbound({
      Body: OFF_GRAMMAR,
      MessageSid: "SMhoursUnclear",
    });
    const clarifyOk = clarify.disposition === "ref_clarify" &&
      confirmOf(clarify) === null && (clarify.replies ?? []).length === 0 &&
      hoursEffects(unclear.effects).length === 0 &&
      marked(unclear).length === 0 &&
      answeredAt(unclear, "hours-41") === null &&
      answeredAt(unclear, "hours-42") === null;

    // ── Every defer leaves the body on the path it was already on ─────────
    // Which, for an off-grammar body beside one open question, is today's
    // designer handoff. A defer must not invent a reply of its own.
    const defers: Array<{ reason: string; body: string; stub?: JudgmentStub; env?: Record<string, string>; answer?: boolean }> = [
      { reason: "no_key", body: OFF_GRAMMAR, env: {}, answer: false },
      { reason: "no_candidates (nothing number-shaped)", body: "we wrapped up and headed out", answer: false },
      { reason: "no_candidates (none_of_these)", body: OFF_GRAMMAR, stub: { span: "none_of_these" } },
      { reason: "intent", body: OFF_GRAMMAR, stub: { intent: "other_topic" } },
      { reason: "multi_day", body: OFF_GRAMMAR, stub: { multiDay: 0.9 } },
      { reason: "low_confidence", body: OFF_GRAMMAR, stub: { confidence: 0.5 } },
      { reason: "out_of_range", body: "about 18 hours all told" },
      { reason: "malformed", body: OFF_GRAMMAR },
      { reason: "http", body: OFF_GRAMMAR },
      { reason: "timeout", body: OFF_GRAMMAR },
    ];
    const deferReport: string[] = [];
    let defersOk = true;
    for (const [index, item] of defers.entries()) {
      const fixture = world(item.env ?? TYPESAFE_KEY);
      hoursAsk(fixture, "hours-50", "50");
      if (item.reason === "malformed") {
        fixture.typesafe.answer = () => new Response("not json at all", { status: 200 });
      } else if (item.reason === "http") {
        fixture.typesafe.answer = null;
      } else if (item.reason === "timeout") {
        fixture.typesafe.answer = () => {
          const aborted = new Error("fixture abort");
          aborted.name = "AbortError";
          throw aborted;
        };
      } else if (item.answer !== false) {
        fixture.typesafe.answer = judged(item.stub);
      }
      const result = await fixture.h.processInbound({
        Body: item.body,
        MessageSid: `SMhoursDefer${index}`,
      });
      const ok = confirmOf(result) === null &&
        // Today's answer for an unreadable body beside one open question.
        result.disposition === "needs_review" &&
        hoursEffects(fixture.effects).length === 0 &&
        answeredAt(fixture, "hours-50") === null &&
        marked(fixture).length === 0 &&
        // A reason that needs no request must not make one.
        fixture.typesafe.requests.length === (item.answer === false ? 0 : 1);
      if (!ok) {
        defersOk = false;
        deferReport.push(`${item.reason}=${result.disposition}/${JSON.stringify(firstReply(result))}/requests=${fixture.typesafe.requests.length}`);
      }
    }

    // ── One confirm per question, and only one ─────────────────────────────
    const twice = world();
    hoursAsk(twice, "hours-60", "60");
    twice.typesafe.answer = judged();
    const firstAsk = await twice.h.processInbound({
      Body: OFF_GRAMMAR,
      MessageSid: "SMhoursFirstWords",
    });
    const secondAsk = await twice.h.processInbound({
      Body: "make that about 7 and a half",
      MessageSid: "SMhoursSecondWords",
    });
    const loopOk = !!confirmOf(firstAsk) && confirmOf(secondAsk) === null &&
      secondAsk.disposition === "needs_review" &&
      // The second body never reached the judgment at all.
      twice.typesafe.requests.length === 1 &&
      marked(twice).filter((id) => id === "hours-60").length === 1 &&
      hoursEffects(twice.effects).length === 0 &&
      answeredAt(twice, "hours-60") === null;

    // ── NOTHING LEAVES THE RAIL UNLESS A BODY NEEDS READING ────────────────
    // The number grammar reads its own bodies; a handset with no hours question
    // open has nothing to read; and a control word is answered above this rail
    // entirely. None of the three may cost a request.
    const regex = world();
    hoursAsk(regex, "hours-70", "70");
    regex.typesafe.answer = judged();
    const regexHit = await regex.h.processInbound({ Body: "6.5", MessageSid: "SMhoursPlain" });

    const nothingAsked = world();
    nothingAsked.prompt({ id: "day-of-71", kind: "day_of", short_code: "71" });
    nothingAsked.typesafe.answer = judged();
    const unasked = await nothingAsked.h.processInbound({
      Body: OFF_GRAMMAR,
      MessageSid: "SMhoursUnasked",
    });

    const stopped = world();
    hoursAsk(stopped, "hours-72", "72");
    stopped.typesafe.answer = judged();
    const stop = await stopped.h.processInbound({ Body: "STOP", MessageSid: "SMhoursStop" });

    const helped = world();
    hoursAsk(helped, "hours-73", "73");
    helped.typesafe.answer = judged();
    const help = await helped.h.processInbound({ Body: "HELP", MessageSid: "SMhoursHelp" });

    const silentOk = regex.typesafe.requests.length === 0 &&
      regexHit.disposition === "ref_applied" &&
      hoursEffects(regex.effects).length === 1 &&
      nothingAsked.typesafe.requests.length === 0 &&
      unasked.disposition === "needs_review" &&
      stopped.typesafe.requests.length === 0 &&
      helped.typesafe.requests.length === 0;

    // ── WHAT LEAVES, WHEN SOMETHING DOES (Kody 2026-09-20) ─────────────────
    // The body, the ask's own words, the visit's title and the frozen day —
    // never a phone number, a party or studio name, or a row id.
    const wire = JSON.stringify(once.typesafe.requests[0] ?? {});
    const identities = [once.h.sender, once.h.recipient, "Riley", "Studio A", "party-a", "project-a", "prompt-", "hours-21"];
    const leaked = identities.filter((value) => wire.includes(value));
    const privacyOk = leaked.length === 0 && !/\+?\d{10,}/.test(wire) &&
      wire.includes(OFF_GRAMMAR) && wire.includes("Install mantel") && wire.includes("2026-11-01");

    // ── S7 ────────────────────────────────────────────────────────────────
    const s7 = confirmOk && roundTripOk && twoOpenOk && twoBookedOk && clarifyOk &&
      defersOk && loopOk && silentOk && privacyOk;
    assertions.push({
      caseId: "hours-free-text-confirm",
      clause: "S7",
      status: s7 ? "pass" : "fail",
      reason: s7
        ? `"${OFF_GRAMMAR}" beside one open hours question got exactly one confirm — ${JSON.stringify(confirm!.message)} — whose printed token HOURS_REPLY reads back as 6.5 with no reference, and sending that token filed the hours against task-a; with two evenings open the token carried "Ref 32", HOURS_REPLY read the reference back and the number booked against THAT question with Ref 31 left open; two open and nothing saying which asked instead of confirming (ref_clarify); all ten defer reasons left today's designer handoff untouched, and no_key plus a body with nothing number-shaped cost no request at all; a second off-grammar body against the same question earned no second confirm and never reached the judgment; "6.5", an off-grammar body with no hours question open, STOP and HELP each cost zero requests; and the one request that was made carried the body, "Install mantel" and 2026-11-01 with no phone number, name or row id`
        : `confirm=${confirmOk} (${asked.disposition}: ${JSON.stringify(firstReply(asked))}, requests=${once.typesafe.requests.length}) roundTrip=${roundTripOk} (${booked.disposition}, filed=${hoursEffects(once.effects).length}) twoOpen=${twoOpenOk} (${JSON.stringify(firstReply(picked))}) twoBooked=${twoBookedOk} (${pickedBooked.disposition}) clarify=${clarifyOk} (${clarify.disposition}) defers=${defersOk} [${deferReport.join("; ")}] loop=${loopOk} (${secondAsk.disposition}, requests=${twice.typesafe.requests.length}) silent=${silentOk} (regex=${regex.typesafe.requests.length}/${regexHit.disposition}, unasked=${nothingAsked.typesafe.requests.length}/${unasked.disposition}, stop=${stopped.typesafe.requests.length}/${stop.disposition}, help=${helped.typesafe.requests.length}/${help.disposition}) privacy=${privacyOk} (leaked=${JSON.stringify(leaked)})`,
    });

    // ── S1 ────────────────────────────────────────────────────────────────
    // A judged reading files NOTHING. Every proposal on this rail still comes
    // from a number the crew typed, one per question.
    // The worlds where the crew never sent a number: nothing was filed in any
    // of them, whatever the judgment read.
    const judgedFiledNothing = [unclear, twice].every((fixture) =>
      hoursEffects(fixture.effects).length === 0
    );
    const s1 = judgedFiledNothing && confirmOk && roundTripOk && twoBookedOk &&
      hoursEffects(once.effects).length === 1 &&
      hoursEffects(two.effects).length === 1 &&
      once.touches.length > 0;
    assertions.push({
      caseId: "hours-free-text-confirm",
      clause: "S1",
      status: s1 ? "pass" : "fail",
      reason: s1
        ? `no judged reading filed anything: the off-grammar body left the question open with no apply_field_effect call, and the single {type:'report_hours', hours:6.5} proposal in each two-message world was filed by the NUMBER the confirm asked for — one per question, with the ref_clarify and second-body worlds filing nothing at all`
        : `judgedFiledNothing=${judgedFiledNothing} once=${hoursEffects(once.effects).length} two=${hoursEffects(two.effects).length} unclear=${hoursEffects(unclear.effects).length} twice=${hoursEffects(twice.effects).length} touches=${once.touches.length}`,
    });

    return assertions;
  },
};
