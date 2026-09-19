import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { CLIENT_PHONE, CLIENT_ROOM, clientFixture } from "../client-fixture.ts";
import { CLIENT_SMS_TEMPLATES, flushDeferredMessages, sendClientSms } from "../../../_shared/sms.ts";
import type { GateAssertion, GateCase } from "../types.ts";

type Fixture = ReturnType<typeof clientFixture>;

/** What actually went down the wire to a number, in order. */
function wiresTo(f: Fixture, to: string): string[] {
  return f.h.provider.requests
    .filter((r) => r.url.includes("/Messages.json"))
    .map((r) => new URLSearchParams(String(r.init?.body ?? "")))
    .filter((p) => p.get("To") === to)
    .map((p) => p.get("Body") ?? "");
}

function depsOf(f: Fixture, overrides: Record<string, string> = {}) {
  return {
    getEnv: (key: string) => key in overrides ? overrides[key] : f.h.env(key),
    fetchImpl: f.h.provider.fetch,
    // Read through, so advanceTo() moves the clock these deps see.
    get now() {
      return f.h.clock;
    },
  };
}

function pass(id: string, clauses: string[], reason: string): GateAssertion[] {
  return clauses.map((clause) => ({ caseId: id, clause, status: "pass" as const, reason }));
}

/**
 * ONE ASK A DAY, ONE NUDGE, THEN QUIET (US-3 P24, clause S5).
 *
 * A homeowner is not a crew: she did not sign up for a work rail, and the whole
 * bargain of texting her at all is that it stays rare. So the cron may present
 * at most one list of picks per client per local day, may nudge an unanswered
 * list exactly once after three days, and then must stop talking — no second
 * list on top of an open one, no daily reminder, no new reference for a nudge.
 */
export const clientOneAskADay: GateCase = {
  id: "client-one-ask-a-day",
  phase: 2,
  clauses: ["S5", "P24"],
  async run(): Promise<GateAssertion[]> {
    const f = clientFixture();
    const first = await f.h.daily();
    assertEquals(first.client_batches_sent, 1);
    const asks = () =>
      (f.h.fake._data.sms_prompts ?? []).filter((row) => row.kind === "selection_batch");
    assertEquals(asks().length, 1, "one reference");
    assertEquals(f.h.fake._data.client_decision_batches.length, 1, "one list");
    const body = wiresTo(f, CLIENT_PHONE);
    assertEquals(body.length, 1, "and one text");
    assert(
      body[0].includes(`Reply YES ${asks()[0].short_code}`),
      `the text prints the reference she answers with: "${body[0]}"`,
    );
    assert(body[0].includes(CLIENT_ROOM), `and the room she can picture: "${body[0]}"`);
    assert(body[0].includes("STOP to opt out"), `with the way out: "${body[0]}"`);
    assert(
      body[0].includes("/auth/invite/"),
      `and her own capability, minted at dispatch: "${body[0]}"`,
    );

    // The cron runs every hour. It gets one ask out of the day.
    const second = await f.h.daily();
    assertEquals(second.client_batches_sent, 0);
    assertEquals(second.client_reminders_sent, 0);
    assertEquals(wiresTo(f, CLIENT_PHONE).length, 1, "she is asked once between two sunrises");
    assertEquals(f.h.fake._data.client_decision_batches.length, 1, "and never a second list at once");
    assertEquals(asks().length, 1, "and no second reference is burned");

    // Three days later, one nudge — on the reference she already holds.
    const later = clientFixture({ now: new Date("2026-11-04T15:00:00.000Z") });
    const open = later.batch({
      presented_at: "2026-11-01T14:00:00.000Z",
      presented_local_day: "2026-11-01",
    });
    const held = later.ask({ expires_at: "2026-11-08T14:00:00.000Z" });
    const nudge = await later.h.daily();
    assertEquals(nudge.client_reminders_sent, 1);
    assertEquals(nudge.client_batches_sent, 0, "a nudge is not a new ask");
    const nudged = wiresTo(later, CLIENT_PHONE);
    assertEquals(nudged.length, 1);
    assert(
      nudged[0].includes(`Reply YES ${held.short_code}`),
      `the nudge points at the reference she was given: "${nudged[0]}"`,
    );
    assertEquals(
      (later.h.fake._data.sms_prompts ?? []).filter((row) => row.kind === "selection_batch").length,
      1,
      "so no second reference is minted for it",
    );
    assertEquals(open.reminder_sent_at, later.h.clock.toISOString(), "and the nudge is spent");

    // And then quiet, however long she takes.
    for (const at of ["2026-11-05T15:00:00.000Z", "2026-11-09T15:00:00.000Z"]) {
      later.h.advanceTo(new Date(at));
      const quiet = await later.h.daily();
      assertEquals(quiet.client_reminders_sent, 0, `${at}: the rail has stopped talking`);
      assertEquals(quiet.client_batches_sent, 0, `${at}: and opens no second list`);
      assertEquals(wiresTo(later, CLIENT_PHONE).length, 1, `${at}: nothing more went out`);
    }
    return pass(
      this.id,
      this.clauses,
      "The cron presents one list per client per local day with one reference and one text, repeats neither on a second tick, nudges an unanswered list once at three days on the reference she already holds, and is silent after that.",
    );
  },
};

/**
 * THE CHECKBOX IS THE AUTHORITY (US-3 P24, clause S2). Her number may be texted
 * only because the studio wrote down that she said yes, HOW she said it and WHO
 * recorded it. An unchecked kickoff box is not a maybe: nothing goes out.
 */
export const clientConsentBoundary: GateCase = {
  id: "client-consent-boundary",
  phase: 2,
  clauses: ["S2", "P24"],
  async run(): Promise<GateAssertion[]> {
    const letter = (f: Fixture) =>
      sendClientSms(f.h.fake as never, {
        partyId: "party-c",
        projectId: "project-a",
        templateKey: "sms_client_first_letter",
        clientInvitationId: "inv-c",
        dedupeKey: "client_first_letter:inv-c",
        vars: { project_name: "Ash House" },
      }, depsOf(f));
    const her = (f: Fixture) =>
      f.h.fake._data.studio_channel_consent.find((row) => row.channel_value === CLIENT_PHONE)!;

    // UNCHECKED: there is no record at all. The rail refuses, in the same voice
    // it refuses an opt-out with, because "we never asked" and "she said no" are
    // the same answer to the question "may we text her".
    const unchecked = clientFixture();
    unchecked.h.fake._data.studio_channel_consent = unchecked.h.fake._data.studio_channel_consent
      .filter((row) => row.channel_value !== CLIENT_PHONE);
    const never = await letter(unchecked);
    assertEquals(never.sent, false);
    assertEquals(never.reason, "opted_out");
    assertEquals(wiresTo(unchecked, CLIENT_PHONE).length, 0);
    assertEquals(unchecked.mints, 0, "and no capability is minted for a text that cannot go");

    // CHECKED BUT UNWITNESSED: a pending record with no source and no recorder
    // is a row nobody can stand behind, so it carries nothing.
    const unwitnessed = clientFixture();
    delete her(unwitnessed).source;
    delete her(unwitnessed).recorded_by;
    const thin = await letter(unwitnessed);
    assertEquals(thin.sent, false);
    assertEquals(thin.reason, "consent_evidence_required");
    assertEquals(wiresTo(unwitnessed, CLIENT_PHONE).length, 0);

    // REFUSED: she said no. Nothing reopens that but her own START.
    const refused = clientFixture();
    her(refused).status = "opted_out";
    const no = await letter(refused);
    assertEquals(no.sent, false);
    assertEquals(no.reason, "opted_out");
    assertEquals(wiresTo(refused, CLIENT_PHONE).length, 0);

    // CHECKED, WITH THE EVIDENCE: the box was ticked at kickoff, the record says
    // how and by whom, and the first letter goes.
    const checked = clientFixture();
    const sent = await letter(checked);
    assertEquals(sent.sent, true, `the kickoff record carries it: ${JSON.stringify(sent)}`);
    const wire = wiresTo(checked, CLIENT_PHONE);
    assertEquals(wire.length, 1);
    assert(wire[0].includes("/auth/invite/"), `and it carries her own door: "${wire[0]}"`);
    assert(wire[0].includes("STOP to opt out"), `and the way out of it: "${wire[0]}"`);
    return pass(
      this.id,
      this.clauses,
      "A kickoff record with its source and recorder is the only thing that lets a client text leave: no record, a record with no evidence and an opt-out each refuse with nothing sent and no capability minted, while the recorded yes sends her letter with the link and the opt-out line.",
    );
  },
};

/**
 * THE SWITCH THAT STOPS HER RAIL (US-3 P24, clause S2). Consent is hers; the
 * campaign approval is the carrier's and the studio's. Until
 * FIELD_LINE_CAMPAIGN_APPROVED is exactly "1", no client-kind text leaves — not
 * a new one, and not one that was stored overnight before the flag went down.
 */
export const clientCampaignApproval: GateCase = {
  id: "client-campaign-approval",
  phase: 2,
  clauses: ["S2", "P24"],
  async run(): Promise<GateAssertion[]> {
    const off = clientFixture({ env: { FIELD_LINE_CAMPAIGN_APPROVED: "" } });
    for (const templateKey of CLIENT_SMS_TEMPLATES) {
      const res = await sendClientSms(off.h.fake as never, {
        partyId: "party-c",
        projectId: "project-a",
        templateKey,
        clientInvitationId: "inv-c",
        dedupeKey: `flag-off:${templateKey}`,
        vars: { project_name: "Ash House" },
      }, depsOf(off));
      assertEquals(res.sent, false, templateKey);
      assertEquals(res.reason, "campaign_not_approved", templateKey);
    }
    assertEquals(wiresTo(off, CLIENT_PHONE).length, 0, "nothing reached her");
    assertEquals(off.mints, 0, "nothing was minted for her");
    assertEquals(
      (off.h.fake._data.sms_messages ?? []).filter((row) => row.party_id === "party-c").length,
      0,
      "and no row was written to retry later",
    );

    // The flag is hers alone: the crew's rail is unaffected by it.
    const trade = await off.h.send({
      partyId: "party-a",
      templateKey: "sms_daily_digest",
      vars: { studio_name: "Studio A", menu: "1) Install mantel Ref 20 Reply DONE 1" },
    });
    assertEquals(trade.sent, true, `the trade rail does not answer to this flag: ${JSON.stringify(trade)}`);

    // And a letter stored by quiet hours while the flag was up does not escape
    // in the morning if it has come down: the flag is asked again at the flush,
    // and the row waits with the reason on it (contract P13).
    const overnight = clientFixture({ now: new Date("2026-11-02T10:00:00.000Z") });
    const stored = await sendClientSms(overnight.h.fake as never, {
      partyId: "party-c",
      projectId: "project-a",
      templateKey: "sms_client_first_letter",
      clientInvitationId: "inv-c",
      dedupeKey: "client_first_letter:inv-c",
      vars: { project_name: "Ash House" },
    }, depsOf(overnight));
    assert(stored.deferred, `4am is quiet: ${JSON.stringify(stored)}`);
    assertEquals(overnight.mints, 0, "and nothing is minted overnight");
    overnight.h.advanceTo(new Date("2026-11-02T18:00:00.000Z"));
    const held = await flushDeferredMessages(
      overnight.h.fake as never,
      depsOf(overnight, { FIELD_LINE_CAMPAIGN_APPROVED: "0" }),
    );
    assertEquals(held.flushed, 0, "the flag came down overnight, so nothing flushes");
    const row = (overnight.h.fake._data.sms_messages ?? [])
      .find((r) => r.template_key === "sms_client_first_letter")!;
    assertEquals(row.twilio_status, "deferred", "the row keeps its place");
    assertEquals(row.error_message, "campaign_not_approved", "and says why it is still there");
    assertEquals(wiresTo(overnight, CLIENT_PHONE).length, 0);

    const resumed = await flushDeferredMessages(overnight.h.fake as never, depsOf(overnight));
    assertEquals(resumed.flushed, 1, "and with the flag back up, it goes");
    assertEquals(wiresTo(overnight, CLIENT_PHONE).length, 1);
    return pass(
      this.id,
      this.clauses,
      "With FIELD_LINE_CAMPAIGN_APPROVED unset every client template is refused with nothing sent, nothing minted and no row left to retry, while the trade rail is unaffected; a letter deferred by quiet hours is re-asked at the flush and waits with campaign_not_approved until the flag is back up.",
    );
  },
};
