import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clientFixture } from "../client-fixture.ts";
import type { GateAssertion, GateCase } from "../types.ts";

/**
 * THE LIST MOVED WHILE THE TEXT WAS IN HER POCKET (US-3 P14, clause S1).
 *
 * The studio swaps an option an hour after the ask goes out. Her "YES 31" is
 * written against a list that no longer exists, and the one thing that must
 * never happen is that it lands on the new one: she would have approved a sofa
 * she never saw. 00651 binds the reference to the version it was issued at and
 * refuses the apply as `stale_version`; the rail's job is to believe it, tell
 * her the truth in her own words, leave both the batch and the reference open,
 * and hand the thread to the person who changed the list.
 *
 * The SQL side of this race — the version predicate inside apply_client_effect,
 * and the bump trigger that moves it — is proven against a real Postgres in
 * supabase/tests/field/apply_client_effect_test.sql. What is measured HERE is
 * what the rail does with the refusal.
 */
export const clientVersionRace: GateCase = {
  id: "client-version-race",
  phase: 2,
  clauses: ["S1", "P14"],
  async run(): Promise<GateAssertion[]> {
    const f = clientFixture();
    const batch = f.batch();
    const ask = f.ask();
    // The swap, after the text: one more option, so the batch is re-versioned.
    batch.version = 2;
    batch.presented_snapshot = { room_id: "room-1", decisions: [{ id: "dec-1", option_id: "opt-2" }] };

    const res = await f.inbound("YES 31", "SMraceGate");
    assertEquals(res.disposition, "client_stale_version");
    assertEquals(res.effectApplied ?? false, false, "nothing was applied");
    assertEquals(f.h.fake._data.client_decisions[0].status, "pending", "and no option was chosen for her");
    assertEquals(f.h.fake._data.client_decisions[0].selected_by ?? null, null);
    assertEquals(batch.closed_at, null, "the ask is still open");
    assertEquals(ask.answered_at ?? null, null, "and her reference is still hers to use");
    assertEquals(f.h.fake._data.decision_events.length, 0, "nothing was written down as decided");

    const reply = String(res.replies?.[0]?.message ?? "");
    assert(/changed/i.test(reply), `she is told what happened: "${reply}"`);
    assert(!/confirmed|saved|got it/i.test(reply), `and never that it worked: "${reply}"`);
    assert(!/version|stale|42501|23514/i.test(reply), `in her words, not ours: "${reply}"`);

    const stamp = (f.h.fake._data.sms_messages ?? [])
      .find((row) => row.twilio_sid === "SMraceGate")!;
    assertEquals(stamp.needs_review, true, "the studio is handed the thread");
    assertEquals(stamp.owner_user_id, "studio-a", "and the handoff has an owner, not a queue");
    const parsed = stamp.parsed_intent as Record<string, unknown>;
    assertEquals(parsed.refusal, "stale_version");
    assertEquals((parsed.current as Record<string, unknown>).current_version, 2);

    // And the way out is the studio re-presenting: a reference issued AT the new
    // version answers the new list. Nothing about the race is a dead end.
    const fresh = f.ask({ id: "prompt-c2", short_code: "32", version: 2 });
    const second = await f.inbound("YES 32", "SMraceGate2");
    assertEquals(second.disposition, "client_selection_approved");
    assertEquals(f.h.fake._data.client_decisions[0].status, "responded");
    assertEquals(fresh.answered_at, f.h.clock.toISOString());
    assertEquals(batch.closed_at, f.h.clock.toISOString(), "and the ask closes once");
    return this.clauses.map((clause) => ({
      caseId: this.id,
      clause,
      status: "pass" as const,
      reason:
        "A reply written against a re-versioned list applies nothing, keeps the batch and the reference open, tells her plainly that the list changed, and hands the thread to the studio with an owner; a reference re-issued at the new version then answers it.",
    }));
  },
};
