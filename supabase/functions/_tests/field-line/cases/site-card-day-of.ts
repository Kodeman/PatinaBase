import { inboundFixture } from "../inbound-fixture.ts";
import type { GateAssertion, GateCase } from "../types.ts";

// 6:00pm CDT the evening before — the hour the site card is due.
const EVENING_BEFORE = new Date("2026-10-31T23:00:00.000Z");
// 8:00am CST on the visit day — the morning ask, after the fall-back.
const VISIT_MORNING = new Date("2026-11-01T14:00:00.000Z");
const VISIT_DAY = "2026-11-01";

const COMPLIANCE_LINE =
  "Msg&data rates may apply. Reply HELP for help, STOP to opt out.";

/** GSM 03.38. Two segments is 306 septets; an extension character costs two. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "\f^{}\\[~]|€";

function gsm7Septets(text: string): number | null {
  let septets = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) septets += 1;
    else if (GSM7_EXTENDED.includes(ch)) septets += 2;
    else return null;
  }
  return septets;
}

function bodies(requests: Array<{ url: string; init?: RequestInit }>): string[] {
  return requests
    .filter((r) => r.url.includes("/Messages.json"))
    .map((r) => new URLSearchParams(String(r.init?.body ?? "")).get("Body") ?? "");
}

/**
 * The two cards a crew actually acts on (clauses S1, S3), end to end: the site
 * card the evening before, the ask the morning of, and the four words that come
 * back. A sub standing at a locked gate at 7am does not open a web page; they
 * text the number that texted them, in the words that were printed on the card.
 *
 * S1 — each card issues ONE prompt, bound at issuance to the visit's own task
 *      and the visit's own day, and the words that come back consume exactly
 *      that prompt. The morning ask coexists with an open digest prompt on the
 *      same number, which is the ordinary case: the trade word binds to the
 *      trade question, and yesterday's card is expired by then.
 * S3 — every reply is a FIELD REPORT and none of them says goods were received:
 *      arrival, a delay in minutes, a not-ok condition, a departure. No
 *      confirm_delivery, no purchase-order target, nothing receiving-shaped. And
 *      the copy is GSM-7 inside two segments and carries the compliance line.
 *
 * The SQL door these replies go through (sms_prompt_reply_verb's trade branch
 * and sms_apply_prompt's matrix) is proven in
 * supabase/tests/field/sms_trade_prompts_test.sql; the fixture's apply model is
 * deliberately permissive so that what is measured HERE is the effect the
 * pipeline builds from the words.
 */
export const siteCardDayOf: GateCase = {
  id: "site-card-day-of",
  phase: 1,
  clauses: ["S1", "S3"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];
    const { h, effects } = inboundFixture(undefined, EVENING_BEFORE, {
      FIELD_LINE_PHASE: "1",
    });
    const party = h.fake._data.project_parties.find((p) => p.id === "party-a")!;
    party.on_site_from = VISIT_DAY;
    party.on_site_to = VISIT_DAY;
    h.fake._data.projects.find((p) => p.id === "project-a")!.site_address =
      "1421 Williamson St, Madison";
    h.fake._data.project_site_access_cards = [{
      project_id: "project-a",
      site_hours: "7-11am",
      site_notes: "Gate is on Ash St, park inside",
      emergency_lines: ["608-555-0134"],
    }];
    h.fake._data.comms_threads = [{
      id: "thread-a",
      project_id: "project-a",
      kind: "project",
      created_by: "studio-a",
      created_at: "2026-09-01T00:00:00.000Z",
    }];

    // ── The evening before ────────────────────────────────────────────────
    const evening = await h.daily();
    const card = bodies(h.provider.requests).find((b) => b.includes("tomorrow"));
    const cardPrompt = (h.fake._data.sms_prompts ?? []).find((p) =>
      p.kind === "site_card"
    );

    // ── The morning of ────────────────────────────────────────────────────
    h.advanceTo(VISIT_MORNING);
    const morning = await h.daily();
    const ask = bodies(h.provider.requests).find((b) =>
      b.includes("ON MY WAY")
    );
    const askPrompt = (h.fake._data.sms_prompts ?? []).find((p) =>
      p.kind === "day_of"
    );
    const openNow = (h.fake._data.sms_prompts ?? []).filter((p) =>
      !p.answered_at && String(p.expires_at) > h.clock.toISOString()
    );
    const post = (h.fake._data.comms_messages ?? []);

    // ── The words that come back ──────────────────────────────────────────
    const reply = async (body: string, sid: string) => {
      const before = effects.length;
      const result = await h.processInbound({ Body: body, MessageSid: sid });
      return { result, filed: effects.slice(before) };
    };
    const arrival = await reply("ON MY WAY", "SMonMyWay");
    // Re-open the same question for each word: one inbound answers one prompt,
    // and what is being measured is the reading of the words, not re-issuance.
    const reopen = () => {
      for (const p of h.fake._data.sms_prompts) {
        if (p.kind === "day_of") {
          p.answered_at = null;
          p.consumed_sid = null;
        }
      }
    };
    reopen();
    const late = await reply("LATE 20", "SMlate20");
    reopen();
    const problem = await reply("PROBLEM gate is locked", "SMproblem");
    reopen();
    const done = await reply("DONE", "SMdone");

    const filedTypes = [arrival, late, problem, done]
      .map((r) => String((r.filed[0]?.p_effect as { type?: string })?.type ?? "none"));
    const lateEffect = late.filed[0]?.p_effect as
      { note?: string; new_date?: string | null } | undefined;
    const problemEffect = problem.filed[0]?.p_effect as
      { condition?: { ok?: boolean; note?: string } } | undefined;

    // ── S1 ────────────────────────────────────────────────────────────────
    const s1 = evening.site_cards_sent === 1 && evening.day_of_sent === 0 &&
      morning.day_of_sent === 1 && morning.site_cards_sent === 0 &&
      !!cardPrompt && cardPrompt.subject_id === "task-a" &&
      cardPrompt.version === 20261101 &&
      !!askPrompt && askPrompt.subject_id === "task-a" &&
      askPrompt.version === 20261101 &&
      // Yesterday's card has expired; the digest prompt has not, and the ask is
      // the only OPEN TRADE prompt on the number.
      String(cardPrompt.expires_at) <= h.clock.toISOString() &&
      openNow.length > 1 &&
      openNow.filter((p) => ["site_card", "day_of"].includes(String(p.kind))).length === 1 &&
      [arrival, late, problem, done].every((r) =>
        r.result.disposition === "ref_applied" && r.filed.length === 1 &&
        (r.filed[0].p_effect as { target?: { id?: string } }).target?.id === "task-a"
      );
    assertions.push({
      caseId: "site-card-day-of",
      clause: "S1",
      status: s1 ? "pass" : "fail",
      reason: s1
        ? `the evening run issued one site card and the morning run one ask, both bound to task-a on day ${VISIT_DAY}; the expired card left exactly one open trade prompt beside an open digest prompt, and all four trade words consumed that one`
        : `expected 1 site card then 1 ask, both bound to task-a/20261101, one open trade prompt, four applied replies; got evening=${JSON.stringify({ cards: evening.site_cards_sent, asks: evening.day_of_sent })} morning=${JSON.stringify({ cards: morning.site_cards_sent, asks: morning.day_of_sent })} cardPrompt=${JSON.stringify(cardPrompt && { subject: cardPrompt.subject_id, v: cardPrompt.version, exp: cardPrompt.expires_at })} askPrompt=${JSON.stringify(askPrompt && { subject: askPrompt.subject_id, v: askPrompt.version })} open=${openNow.length} trade=${openNow.filter((p) => ["site_card", "day_of"].includes(String(p.kind))).length} dispositions=${[arrival, late, problem, done].map((r) => r.result.disposition).join(",")}`,
    });

    // ── S3 ────────────────────────────────────────────────────────────────
    const cardSeptets = card ? gsm7Septets(card) : null;
    const askSeptets = ask ? gsm7Septets(ask) : null;
    const copyOk = !!card && !!ask &&
      cardSeptets !== null && cardSeptets <= 306 &&
      askSeptets !== null && askSeptets <= 306 &&
      card.startsWith("Studio A") && ask.startsWith("Studio A") &&
      card.endsWith(COMPLIANCE_LINE) && ask.endsWith(COMPLIANCE_LINE) &&
      card.includes("1421 Williamson St, Madison") &&
      card.includes("Gate is on Ash St, park inside") &&
      card.includes("608-555-0134") && card.includes("7-11am") &&
      card.includes("Reply HERE on arrival, LATE 20 if delayed, PROBLEM") &&
      !/\b(platform|portal|dashboard|account)\b/i.test(card + ask) &&
      !/\bAI\b/.test(card + ask);
    const reportsOnly = filedTypes.join(",") ===
      "report_arrival,report_delay,report_condition,report_departure" &&
      // Nothing receiving-shaped anywhere: no goods were received by saying any
      // of these words.
      effects.every((e) => {
        const effect = e.p_effect as
          { type?: string; target?: { kind?: string } } | undefined;
        return effect?.type !== "confirm_delivery" &&
          effect?.target?.kind !== "purchase_order";
      }) &&
      (lateEffect?.note ?? "").includes("20 minutes") &&
      !lateEffect?.new_date &&
      problemEffect?.condition?.ok === false &&
      problemEffect?.condition?.note === "gate is locked";
    // The client's copy of "crew on the way" is a portal post, not a text.
    const postedOnce = post.length === 1 && post[0].thread_id === "thread-a" &&
      post[0].system === true && post[0].sender_id === null &&
      morning.crew_posts === 1 &&
      !bodies(h.provider.requests).some((b) => b.includes("Crew on the way"));
    const s3 = copyOk && reportsOnly && postedOnce;
    assertions.push({
      caseId: "site-card-day-of",
      clause: "S3",
      status: s3 ? "pass" : "fail",
      reason: s3
        ? `both cards are GSM-7 inside two segments (${cardSeptets}, ${askSeptets} septets), lead with the studio, carry the address/window/access note/phone and end with the compliance line; the four words file arrival, a 20-minute delay with no new date, a not-ok condition and a departure — no delivery confirm, no purchase-order target — and "crew on the way" is one system post on the project thread and no text`
        : `copy=${copyOk} (card ${cardSeptets} septets, ask ${askSeptets}) reports=${reportsOnly} (${filedTypes.join(",")}, late note=${JSON.stringify(lateEffect?.note)} newDate=${JSON.stringify(lateEffect?.new_date)}, condition=${JSON.stringify(problemEffect?.condition)}) post=${postedOnce} (${post.length} posts, crew_posts=${morning.crew_posts})`,
    });

    return assertions;
  },
};
