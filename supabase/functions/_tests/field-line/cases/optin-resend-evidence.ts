import { inboundFixture } from "../inbound-fixture.ts";
import { handleSmsDispatch } from "../../../sms-dispatch/handler.ts";
import type { GateAssertion, GateCase } from "../types.ts";

/** The exact bearer shape sms-dispatch decodes for an internal caller. */
const INTERNAL = `Bearer header.${
  btoa(JSON.stringify({ role: "service_role" })).replace(/=+$/, "")
}.signature`;

/** The eight columns 00594's refuse_legacy_consent_write_trg freezes. */
const FROZEN_SEAT_COLUMNS = [
  "sms_consent_status",
  "sms_consented_at",
  "sms_opt_out_at",
  "sms_consent_source",
  "sms_consent_evidence",
  "sms_consent_recorded_at",
  "sms_consent_recorded_by",
  "sms_consent_disclosure_version",
] as const;

/**
 * THE RESEND'S OWN SEND, DRIVEN BY THE PAYLOAD THE RPC ACTUALLY EMITS
 * (contract US-2 P1/P2, migration 00646, SQ-92 finding F1).
 *
 * `resend_party_invite` (00644:434-460) does two things in one transaction: it
 * re-stamps the consent record through `record_channel_invite()` and then hands
 * sms-dispatch this payload —
 *
 *     { partyId, projectId, templateKey: 'sms_optin_invite',
 *       type: 'field_optin_invite', code: <this challenge's short code>,
 *       automationPhase: 1 }
 *
 * — and it has ALREADY spent the challenge's one resend by the time that
 * request leaves. So a send gate that refuses this payload does not merely
 * decline a text: it burns the allowance, holds the 24h floor, and leaves the
 * designer with a "Send again" button that can never work.
 *
 * That is exactly what the gate did. `_shared/sms.ts` proved the invite's
 * evidence off `project_parties.sms_consent_source / _evidence / _recorded_at /
 * _disclosure_version`, and 00594 FREEZES those columns: every write raises
 * `consent_legacy_column_frozen` (SQ-92 probe5-gate2-inputs-unwritable.log), so
 * on any stack past 00594 they are NULL and the gate answered
 * `consent_evidence_required` to every invite ever dispatched.
 *
 * The seat below carries all eight frozen columns NULL — the only shape the
 * live database permits — and the studio's own consent record carries the
 * evidence `record_channel_invite` stamps. The text goes.
 *
 * S2 — the consent gate's evidence half is read off studio_channel_consent and
 *      nowhere else: a NULL-everywhere seat does not refuse the invite, and a
 *      record with no `recorded_by` still does.
 * P2 — the resend's dispatch payload, verbatim, reaches the provider as the
 *      invite text with THIS challenge's code, and answers 202.
 */
export const optinResendEvidence: GateCase = {
  id: "optin-resend-evidence",
  phase: 1,
  clauses: ["S2", "P2"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];
    const { h, prompt } = inboundFixture(undefined, undefined, {
      FIELD_LINE_PHASE: "1",
    });

    // ── The seat as the live database holds it: nothing on the eight ──────
    const seat = h.fake._data.project_parties.find((p) => p.id === "party-a")!;
    for (const column of FROZEN_SEAT_COLUMNS) seat[column] = null;

    // ── The record record_channel_invite() left behind ────────────────────
    const record = h.fake._data.studio_channel_consent.find((r) =>
      r.organization_id === "studio-a"
    )!;
    Object.assign(record, {
      status: "pending",
      refusal_unanswered: false,
      source: "verbal",
      evidence: "Said yes on the phone, 1 Nov",
      recorded_at: "2026-10-31T16:00:00.000Z",
      disclosure_version: "field-sms-v1",
      recorded_by: "studio-a",
    });

    // The challenge the resend re-asks: its short code is what the payload
    // carries, so ensureOptinCode mints nothing and the recipient's `YES NN`
    // still names the row they were first sent.
    const challenge = prompt({
      id: "optin-a",
      kind: "optin",
      subject_id: "party-a",
      short_code: "41",
      version: 2,
      expires_at: "2026-11-08T14:00:00.000Z",
    });

    const dispatch = (overrides: Record<string, unknown> = {}) =>
      handleSmsDispatch(
        new Request("https://fn.test/sms-dispatch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: INTERNAL,
          },
          body: JSON.stringify({
            partyId: "party-a",
            projectId: "project-a",
            templateKey: "sms_optin_invite",
            type: "field_optin_invite",
            code: challenge.short_code,
            automationPhase: 1,
            ...overrides,
          }),
        }),
        {
          supabase: h.fake as never,
          getEnv: h.env,
          fetchImpl: h.provider.fetch,
          now: h.clock,
        },
      );

    const sent = await dispatch();
    const sentBody = await sentBodyOf(sent);
    const providerBody = new URLSearchParams(
      String(
        h.provider.requests.find((r) => r.url.includes("/Messages.json"))
          ?.init?.body ?? "",
      ),
    );

    // ── …and the same payload against a record nobody signed ─────────────
    record.recorded_by = null;
    h.provider.reset();
    const unsigned = await dispatch();
    const unsignedBody = await sentBodyOf(unsigned);
    const unsignedRequests = h.provider.requests.length;

    // ── S2 ────────────────────────────────────────────────────────────────
    const seatIsNull = FROZEN_SEAT_COLUMNS.every((c) => seat[c] === null);
    const s2 = seatIsNull &&
      sent.status === 202 && sentBody.reason === undefined &&
      unsigned.status === 422 &&
      unsignedBody.reason === "consent_evidence_required" &&
      unsignedRequests === 0;
    assertions.push({
      caseId: "optin-resend-evidence",
      clause: "S2",
      status: s2 ? "pass" : "fail",
      reason: s2
        ? "a seat with all eight frozen sms_consent_* columns NULL takes the invite on the RECORD's own source + recorded_by, and the same send is refused consent_evidence_required the moment the record carries no recorded_by — with nothing reaching the provider"
        : `expected 202 then 422/consent_evidence_required with no provider call; seatAllNull=${seatIsNull} sent=${sent.status}/${
          JSON.stringify(sentBody.reason)
        } unsigned=${unsigned.status}/${
          JSON.stringify(unsignedBody.reason)
        } providerCalls=${unsignedRequests}`,
    });

    // ── P2 ────────────────────────────────────────────────────────────────
    const text = providerBody.get("Body") ?? "";
    const p2 = sent.status === 202 && sentBody.sent === true &&
      providerBody.get("To") === h.recipient &&
      text.includes("Studio A") && text.includes("Reply YES") &&
      // ensureOptinCode short-circuits on the payload's own code (handler.ts
      // :191), so the resend re-asks THIS challenge rather than minting a new
      // generation the first ask's `YES NN` could no longer answer.
      (h.fake._data.sms_prompts ?? []).filter((p) => p.kind === "optin")
          .length === 1 &&
      (h.fake._data.sms_prompts ?? []).find((p) => p.kind === "optin")
          ?.short_code === "41";
    assertions.push({
      caseId: "optin-resend-evidence",
      clause: "P2",
      status: p2 ? "pass" : "fail",
      reason: p2
        ? `resend_party_invite's dispatch payload reaches the provider as the invite text for ${h.recipient}, and the challenge it names is the one that was already open — no new generation, no second code`
        : `expected the invite to reach the provider on challenge 41; status=${sent.status} sent=${
          JSON.stringify(sentBody.sent)
        } to=${providerBody.get("To")} body=${JSON.stringify(text)} optinPrompts=${
          JSON.stringify(
            (h.fake._data.sms_prompts ?? []).filter((p) => p.kind === "optin")
              .map((p) => p.short_code),
          )
        }`,
    });

    return assertions;
  },
};

async function sentBodyOf(
  res: Response,
): Promise<{ sent?: boolean; reason?: string }> {
  try {
    return await res.json() as { sent?: boolean; reason?: string };
  } catch {
    return {};
  }
}
