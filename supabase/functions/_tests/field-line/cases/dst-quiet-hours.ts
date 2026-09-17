import { createFieldLineHarness } from "../harness.ts";
import type { GateAssertion, GateCase } from "../types.ts";

// 1:30am CDT on the night America/Chicago falls back. The zone is still
// UTC-5 at this instant; at 07:00Z it becomes UTC-6 and the local clock
// repeats the 1 o'clock hour.
const DEFER_AT = new Date("2026-11-01T06:30:00.000Z");
// 8:00am CST — when the send window actually opens. It is 7.5 hours after the
// defer, not the 6.5 a fixed UTC offset would have promised.
const WINDOW_OPENS = "2026-11-01T14:00:00.000Z";

const COMPLIANCE_LINE =
  "Msg&data rates may apply. Reply HELP for help, STOP to opt out.";

/** GSM 03.38, the 7-bit alphabet. Anything outside it forces the whole message
 * to UCS-2, which cuts a segment from 160 septets to 70. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Escape-prefixed: two septets each. */
const GSM7_EXTENDED = "\f^{}\\[~]|€";

/** Septets the body costs, or null when it is not GSM-7 at all. */
function gsm7Septets(text: string): number | null {
  let septets = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) septets += 1;
    else if (GSM7_EXTENDED.includes(ch)) septets += 2;
    else return null;
  }
  return septets;
}

function wireBodyOf(init: RequestInit | undefined): string {
  return new URLSearchParams(String(init?.body ?? "")).get("Body") ?? "";
}

const RAW_TOKEN = /[0-9a-f]{64}/i;

/**
 * The ordinary shape of the field rail: a digest written after the crew has
 * gone home, held until morning, and sent with a link. It is written across
 * the fall-back because that is the night the arithmetic everyone reaches for
 * ("now + 6.5 hours") is wrong by exactly one hour — and an hour early is
 * 7am on a Sunday, which is the quiet-hours rule failing quietly.
 *
 * S5 — what a defer promises: a due time, no wire call now, one wire call then.
 * S6 — the token is minted when the text is dialled, and never sits in the row.
 * S8 — the copy that goes out is still GSM-7 and still carries the required
 *      compliance sentence, after a round trip through storage and a re-render.
 */
export const dstQuietHours: GateCase = {
  id: "dst-quiet-hours",
  phase: 0,
  clauses: ["S5", "S6", "S8"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];
    const mints: string[] = [];
    const harness = createFieldLineHarness({
      now: DEFER_AT,
      env: {
        FIELD_LINE_PHASE: "1",
        CLIENT_PORTAL_URL: "https://client.fixture.patina.test",
      },
      rpc: {
        create_field_link: () => {
          const token = (mints.length + 1).toString(16).padStart(64, "a");
          mints.push(token);
          return { data: [{ id: `link-${mints.length}`, token }], error: null };
        },
      },
    });

    const deferred = await harness.send({
      partyId: harness.studios.A.partyId,
      templateKey: "sms_field_link_digest",
      vars: { menu: "Mantel install moved to Tue." },
      automationPhase: 1,
    });
    const wireAtDefer = harness.provider.requests.length;
    const mintsAtDefer = mints.length;
    const atRest = (harness.fake._data.sms_messages ?? []).find((r) =>
      r.twilio_status === "deferred"
    );
    // Snapshot NOW: the flush updates this very row in place, and what the row
    // held while it waited is the whole question.
    const atRestJson = JSON.stringify(atRest ?? {});
    const atRestBody = String(atRest?.body ?? "");

    harness.advanceTo(new Date(WINDOW_OPENS));
    const flushResult = await harness.flush();
    const wire = harness.provider.requests.filter((r) =>
      r.url.includes("/Messages.json")
    );
    const wireBody = wireBodyOf(wire[wire.length - 1]?.init);
    const settled = (harness.fake._data.sms_messages ?? []).find((r) =>
      r.id === atRest?.id
    );

    // ── S5 ────────────────────────────────────────────────────────────────
    const s5 = deferred.deferred === true &&
      deferred.status === "deferred" &&
      deferred.dueAt === WINDOW_OPENS &&
      wireAtDefer === 0 &&
      flushResult.flushed === 1 &&
      wire.length === 1;
    assertions.push({
      caseId: "dst-quiet-hours",
      clause: "S5",
      status: s5 ? "pass" : "fail",
      reason: s5
        ? "a 1:30am CDT defer comes due at 8:00am CST — 7.5h across the fall-back, not the 6.5h a fixed offset promises — and puts exactly one text on the wire, then"
        : `expected deferred with dueAt ${WINDOW_OPENS}, 0 wire calls at defer and 1 at flush; got status=${deferred.status} dueAt=${deferred.dueAt} wireAtDefer=${wireAtDefer} flushed=${flushResult.flushed} wire=${wire.length}`,
    });

    // ── S6 ────────────────────────────────────────────────────────────────
    const restHoldsNoCredential = mintsAtDefer === 0 &&
      !atRestJson.includes("/field/") &&
      !RAW_TOKEN.test(atRestJson) &&
      atRestBody.includes("[link at send]");
    const sentFresh = mints.length === 1 &&
      wireBody.includes(`/field/${mints[0]}`);
    const threadRedacted = !RAW_TOKEN.test(String(settled?.body ?? ""));
    const s6 = restHoldsNoCredential && sentFresh && threadRedacted;
    assertions.push({
      caseId: "dst-quiet-hours",
      clause: "S6",
      status: s6 ? "pass" : "fail",
      reason: s6
        ? "no token existed while the row waited; one was minted at the flush and went out; the stored thread copy kept none of it"
        : `expected a credential-free row (mintsAtDefer=${mintsAtDefer} rest=${restHoldsNoCredential}), a link minted at flush (mints=${mints.length} onWire=${sentFresh}) and a redacted thread copy (${threadRedacted})`,
    });

    // ── S8 ────────────────────────────────────────────────────────────────
    const septets = gsm7Septets(wireBody);
    const s8 = septets !== null && wireBody.includes(COMPLIANCE_LINE);
    assertions.push({
      caseId: "dst-quiet-hours",
      clause: "S8",
      status: s8 ? "pass" : "fail",
      reason: s8
        ? `the copy that went out is GSM-7 (${septets} septets, ${
          septets! <= 160 ? 1 : Math.ceil(septets! / 153)
        } segments) and still carries the compliance sentence verbatim`
        : `expected GSM-7 copy carrying the compliance sentence; septets=${septets} body=${
          JSON.stringify(wireBody.slice(0, 120))
        }`,
    });

    return assertions;
  },
};
