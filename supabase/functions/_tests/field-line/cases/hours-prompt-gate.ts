import { inboundFixture } from "../inbound-fixture.ts";
import { jsonObject, readField } from "./helpers.ts";
import type { GateAssertion, GateCase } from "../types.ts";

// 5:00pm CST on the visit day — the hour the evening ask is due
// (HOURS_PROMPT_LOCAL_MINUTES = 17*60). 2026-11-01 is the day the zone falls
// back, so 23:00 UTC is 17:00 local and not 18:00: the floor is met exactly,
// which is the boundary the contract cares about.
const EVENING = new Date("2026-11-01T23:00:00.000Z");
// 6:00pm CST, the same local day — a second tick of the same evening.
const SECOND_TICK = new Date("2026-11-02T00:00:00.000Z");
const VISIT_DAY = "2026-11-01";
const SITE_ADDRESS = "1421 Williamson St, Madison";
/** A homeowner on the same project, on a handset of her own. */
const CLIENT_PHONE = "+15550002222";

const COMPLIANCE_LINE =
  "Msg&data rates may apply. Reply HELP for help, STOP to opt out.";

/**
 * GSM 03.38. Two segments is 306 septets; an extension character costs two.
 *
 * The same table site-card-day-of.ts measures its two cards with. It is copied
 * rather than imported because that case file belongs to another ticket and
 * exporting from it is outside this ticket's declared scope — the table itself
 * is the GSM standard's, not either file's invention.
 */
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

/**
 * 00653's own copy, read out of 00653 (contract S6). The migration composes the
 * body as `head || ' ' || v_closing` and reads the closing back out of the row
 * 00641 seeded, so the fixture is assembled the same way and no second copy of
 * either literal lives here.
 */
function hoursTemplateRow(): Record<string, unknown> {
  const effects = Deno.readTextFileSync(
    new URL(
      "../../../../migrations/00641_field_line_effects_templates.sql",
      import.meta.url,
    ),
  );
  const closing = effects.match(
    /v_closing\s+CONSTANT\s+text\s*:=\s*'([^']*)'/,
  )![1];
  const hours = Deno.readTextFileSync(
    new URL(
      "../../../../migrations/00653_field_time_reports.sql",
      import.meta.url,
    ),
  );
  const block = hours.slice(
    hours.indexOf("-- <<< FIELD LINE HOURS COPY BLOCK"),
    hours.indexOf("-- >>> FIELD LINE HOURS COPY BLOCK"),
  );
  const tuple = block.match(
    /\(\s*'(sms_[a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)/,
  )!;
  return {
    slug: tuple[1],
    is_active: true,
    html_content: `${tuple[3].replace(/''/g, "'")} ${closing}`,
  };
}

/**
 * One crew on site today with a task of theirs due today, and a homeowner seat
 * beside it holding everything the crew's holds — on site today, an open task
 * due today, a granted consent record on the same studio — except the kind.
 */
function hoursWorld(phase: string) {
  const fixture = inboundFixture(undefined, EVENING, {
    FIELD_LINE_PHASE: phase,
  });
  const { h } = fixture;
  const crew = h.fake._data.project_parties.find((p) => p.id === "party-a")!;
  crew.on_site_from = VISIT_DAY;
  crew.on_site_to = VISIT_DAY;
  h.fake._data.projects.find((p) => p.id === "project-a")!.site_address =
    SITE_ADDRESS;
  h.fake._data.project_parties.push({
    id: "party-client",
    project_id: "project-a",
    phone_e164: CLIENT_PHONE,
    party_kind: "client",
    display_name: "Nora",
    on_site_from: VISIT_DAY,
    on_site_to: VISIT_DAY,
  });
  h.fake._data.studio_channel_consent.push({
    organization_id: "studio-a",
    channel_kind: "sms",
    channel_value: CLIENT_PHONE,
    status: "granted",
    refusal_unanswered: false,
    source: "verbal",
    evidence: "Said yes at the kickoff walkthrough",
    recorded_at: "2026-10-01T00:00:00.000Z",
    disclosure_version: "field-sms-v1",
    recorded_by: "studio-a",
  });
  h.fake._data.project_tasks.push({
    id: "task-client",
    project_id: "project-a",
    owner_party_id: "party-client",
    title: "Pick a pull",
    due_date: VISIT_DAY,
    status: "todo",
  });
  h.fake._data.email_templates.push(hoursTemplateRow());
  return fixture;
}

type Row = Record<string, unknown>;

function hoursAsks(rows: Row[] | undefined): Row[] {
  return (rows ?? []).filter((m) =>
    m.direction === "outbound" && m.template_key === "sms_hours_prompt"
  );
}

function hoursPrompts(rows: Row[] | undefined): Row[] {
  return (rows ?? []).filter((p) => p.kind === "report_hours");
}

/** Every body this fixture's provider actually put on the wire. */
function wireBodies(
  requests: Array<{ url: string; init?: RequestInit }>,
): string[] {
  return requests
    .filter((r) => r.url.includes("/Messages.json"))
    .map((r) =>
      new URLSearchParams(String(r.init?.body ?? "")).get("Body") ?? ""
    );
}

/**
 * THE EVENING'S ONE QUESTION, AND THE SWITCH THAT DECIDES WHETHER IT IS ASKED
 * (clauses S8, S6).
 *
 * S8 — the phase gate is asked BEFORE a row is written, so a phase-2 server
 *      mints no reference and sends no hours ask at all, while the phase-1 rail
 *      on the same tick goes out as usual (the control that says the tick ran).
 *      At phase 3 one crew that was on site today is asked once, about the
 *      visit's own task, declaring automation phase 3; a second tick the same
 *      evening reuses that question and puts nothing on the wire; and the
 *      homeowner beside them is never asked, because a client has no hours to
 *      report.
 * S6 — the words: the studio's own name first, the site the hours are for, the
 *      reference to answer with, the compliance line last, GSM-7 inside two
 *      segments. Read out of the migration's own copy block, never retyped.
 *
 * The SQL door these prompts and replies go through (00653's kind allowlist,
 * daily reuse, numeric verb and apply matrix) is proven in
 * supabase/tests/field/field_time_reports_test.sql; what is measured HERE is
 * what the cron decides and what the provider is handed.
 */
export const hoursPromptGate: GateCase = {
  id: "hours-prompt-gate",
  phase: 3,
  clauses: ["S8", "S6"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];

    // ── The switch down ───────────────────────────────────────────────────
    const off = hoursWorld("2");
    const phase2 = await off.h.daily();
    const phase2Asks = hoursAsks(off.h.fake._data.sms_messages);
    const phase2Prompts = hoursPrompts(off.h.fake._data.sms_prompts);
    const phase2Wire = wireBodies(off.h.provider.requests).filter((b) =>
      b.includes("How many hours")
    );

    // ── The switch up ─────────────────────────────────────────────────────
    const on = hoursWorld("3");
    const first = await on.h.daily();
    const asks = hoursAsks(on.h.fake._data.sms_messages);
    const prompts = hoursPrompts(on.h.fake._data.sms_prompts);
    const ask = asks[0];
    const prompt = prompts[0];
    const body = ask ? String(ask.body) : "";
    const septets = ask ? gsm7Septets(body) : null;
    const recipe = ask?.recipe
      ? jsonObject<{ automation_phase?: unknown }>(ask.recipe, "send recipe")
      : null;

    // ── The same evening, a second tick ───────────────────────────────────
    on.h.advanceTo(SECOND_TICK);
    const second = await on.h.daily();
    const asksAfter = hoursAsks(on.h.fake._data.sms_messages);
    const promptsAfter = hoursPrompts(on.h.fake._data.sms_prompts);

    // ── S8 ────────────────────────────────────────────────────────────────
    const gateHeld = phase2.hoursPromptsSent === 0 &&
      phase2Prompts.length === 0 && phase2Asks.length === 0 &&
      phase2Wire.length === 0 &&
      // The control: the tick itself ran, and only the hours ask was off.
      phase2.day_of_sent === 1;
    const askedOnce = first.hoursPromptsSent === 1 && asks.length === 1 &&
      prompts.length === 1 &&
      prompt.party_id === "party-a" && prompt.subject_id === "task-a" &&
      prompt.version === 20261101 &&
      // Contract S1: no stored proposal — the hours travel in the reply.
      readField(prompt, "proposed_effect") === null &&
      ask.party_id === "party-a" &&
      ask.dedupe_key === `field-hours:party-a:${VISIT_DAY}` &&
      recipe?.automation_phase === 3;
    const askedOnlyOnce = second.hoursPromptsSent === 0 &&
      asksAfter.length === 1 && promptsAfter.length === 1 &&
      promptsAfter[0].id === prompt?.id;
    const clientUntouched =
      prompts.every((p) => p.party_id !== "party-client") &&
      promptsAfter.every((p) => p.party_id !== "party-client") &&
      asksAfter.every((m) => m.party_id !== "party-client") &&
      (on.h.fake._data.sms_messages ?? []).every((m) =>
        m.direction !== "outbound" || m.party_id !== "party-client"
      );
    const s8 = gateHeld && askedOnce && askedOnlyOnce && clientUntouched;
    assertions.push({
      caseId: "hours-prompt-gate",
      clause: "S8",
      status: s8 ? "pass" : "fail",
      reason: s8
        ? `at FIELD_LINE_PHASE=2 the evening tick reserved no reference and sent no hours ask while its phase-1 day-of card went out as usual; at =3 the one consented trade party on site got exactly one ask, bound to task-a on ${VISIT_DAY} (version 20261101, no stored proposal) and declaring automation phase 3; an hour later the same evening reused prompt ${prompt?.id} and put nothing on the wire; the homeowner on the same project was never asked`
        : `gate=${gateHeld} (phase2 sent=${phase2.hoursPromptsSent} prompts=${phase2Prompts.length} asks=${phase2Asks.length} wire=${phase2Wire.length} dayOf=${phase2.day_of_sent}) askedOnce=${askedOnce} (sent=${first.hoursPromptsSent} asks=${asks.length} prompts=${prompts.length} prompt=${
          JSON.stringify(
            prompt &&
              {
                party: prompt.party_id,
                subject: prompt.subject_id,
                v: prompt.version,
                proposed: prompt.proposed_effect ?? null,
              },
          )
        } dedupe=${JSON.stringify(ask?.dedupe_key)} phase=${
          JSON.stringify(recipe?.automation_phase)
        }) second=${askedOnlyOnce} (sent=${second.hoursPromptsSent} asks=${asksAfter.length} prompts=${promptsAfter.length}) client=${clientUntouched}`,
    });

    // ── S6 ────────────────────────────────────────────────────────────────
    const onWire = wireBodies(on.h.provider.requests).filter((b) =>
      b.includes("How many hours")
    );
    const copyOk = !!ask && septets !== null && septets <= 306 &&
      body.startsWith("Studio A:") && body.endsWith(COMPLIANCE_LINE) &&
      body.includes(SITE_ADDRESS) &&
      body.includes(`Ref ${prompt?.short_code}`) &&
      body.includes("Reply with a number, like 6 or 6.5") &&
      !/\b(platform|portal|dashboard|account)\b/i.test(body) &&
      !/\bAI\b/.test(body) &&
      // The words the crew reads are the words the provider was handed.
      onWire.length === 1 && onWire[0] === body;
    assertions.push({
      caseId: "hours-prompt-gate",
      clause: "S6",
      status: copyOk ? "pass" : "fail",
      reason: copyOk
        ? `the ask is GSM-7 inside two segments (${septets} septets of 306), leads with the studio, names ${SITE_ADDRESS} and Ref ${prompt?.short_code}, tells the crew to reply with a number, ends with the compliance line, and is the single body the provider was handed`
        : `septets=${septets} wire=${onWire.length} body=${
          JSON.stringify(body)
        }`,
    });

    return assertions;
  },
};
