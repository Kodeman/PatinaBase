import { createFieldLineHarness, type FieldLineHarness } from "../harness.ts";
import type { GateAssertion, GateCase } from "../types.ts";

// 9:00am CST on the day America/Chicago falls back — a 25-hour local day, so
// the counters have to reset on the ZONE's midnight and not on a fixed offset.
const DAY_ONE = new Date("2026-11-01T15:00:00.000Z");
// 8:00am CST the next morning: 23 UTC hours later, and a different local day.
const DAY_TWO = new Date("2026-11-02T14:00:00.000Z");

interface BudgetRow {
  day: string | null;
  recurring: number;
  events: number;
}

/**
 * 00645's sms_claim_party_budget, modelled exactly as the SQL spends it: one
 * statement, keyed on (conversation, project), the caller's LOCAL day, a reset
 * when the day changes and a refusal when the cap is already spent. The atomic
 * claim itself — two sessions racing over the last slot — is a lock question and
 * belongs to supabase/tests/field/sms_trade_prompts_test.sql; what this models is
 * the API the TypeScript side is written against.
 */
function budgetModel(store: Map<string, BudgetRow>) {
  return (args: Record<string, unknown>) => {
    const key = `${args.p_conversation_id}|${args.p_project_id}`;
    const day = String(args.p_local_day);
    const cls = String(args.p_class);
    const caps = { recurring: 1, events: 3 };
    const row = store.get(key) ?? { day: null, recurring: 0, events: 0 };
    if (row.day !== day) {
      store.set(key, {
        day,
        recurring: cls === "recurring" ? 1 : 0,
        events: cls === "event" ? 1 : 0,
      });
      return {
        data: { claimed: true, class: cls, local_day: day },
        error: null,
      };
    }
    const used = cls === "recurring" ? row.recurring : row.events;
    const cap = cls === "recurring" ? caps.recurring : caps.events;
    if (used >= cap) {
      return {
        data: { claimed: false, reason: "budget", class: cls, local_day: day },
        error: null,
      };
    }
    if (cls === "recurring") row.recurring += 1;
    else row.events += 1;
    store.set(key, row);
    return { data: { claimed: true, class: cls, local_day: day }, error: null };
  };
}

function wireCount(h: FieldLineHarness): number {
  return h.provider.requests.filter((r) => r.url.includes("/Messages.json"))
    .length;
}

async function event(h: FieldLineHarness, n: number) {
  return await h.send({
    partyId: "party-a",
    templateKey: "sms_daily_digest",
    vars: { menu: `Event ${n}.` },
    dedupeKey: `event-${n}`,
    automationPhase: 1,
    cadenceClass: "event",
  });
}

/**
 * The cadence (clauses S5, S7). A party gets three event texts in a day, and the
 * fourth thing that happens is not a fourth text: it is stored and it reaches
 * them with the next digest. A rail that cannot say "not today" is a rail that
 * texts a sub eleven times on a bad Tuesday, and that is how a number gets
 * reported and a whole studio's SMS dies.
 *
 * S5 — a folded text is a DEFERRED ROW and nothing else: no wire call, a reason
 *      recorded on the row, and the same flush that carries every other waiting
 *      message eventually carries this one.
 * S7 — the budget is spent at DISPATCH, so the flush re-asks it: the fold does
 *      not leak out on the very next flush of the same local day, and when the
 *      zone's day turns over it goes.
 */
export const budgetFoldToDigest: GateCase = {
  id: "budget-fold-to-digest",
  phase: 1,
  clauses: ["S5", "S7"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];
    const store = new Map<string, BudgetRow>();
    const h = createFieldLineHarness({
      now: DAY_ONE,
      env: { FIELD_LINE_PHASE: "1" },
      rpc: { sms_claim_party_budget: budgetModel(store) },
    });

    const spent = [await event(h, 1), await event(h, 2), await event(h, 3)];
    const wireAfterThree = wireCount(h);
    const folded = await event(h, 4);
    const wireAfterFold = wireCount(h);
    const row = (h.fake._data.sms_messages ?? []).find((r) =>
      r.twilio_status === "deferred"
    );

    const s5 = spent.every((r) => r.sent === true) && wireAfterThree === 3 &&
      folded.sent !== true && folded.status === "deferred" &&
      folded.reason === "budget" && wireAfterFold === 3 &&
      !!row && row.error_message === "budget" &&
      (row.recipe as { cadence_class?: string } | null)?.cadence_class === "event" &&
      typeof folded.dueAt === "string" &&
      folded.dueAt.slice(0, 10) === "2026-11-02";
    assertions.push({
      caseId: "budget-fold-to-digest",
      clause: "S5",
      status: s5 ? "pass" : "fail",
      reason: s5
        ? `three event texts went out and the fourth became a stored row reading 'budget', due ${folded.dueAt} — no fourth wire call`
        : `expected 3 sends then a deferred 'budget' row due the next local day; got sent=${
          spent.map((r) => r.sent).join(",")
        } fourth=${folded.status}/${folded.reason} dueAt=${folded.dueAt} wire=${wireAfterFold} rowReason=${row?.error_message}`,
    });

    // Same local day: the flush asks the budget again and is told the same thing.
    const sameDay = await h.flush();
    const wireAfterSameDayFlush = wireCount(h);
    // Read as a value, not a row reference: the store hands back live objects,
    // and the next flush below settles this very one.
    const stillWaiting = String((h.fake._data.sms_messages ?? []).find((r) =>
      r.id === row?.id
    )?.twilio_status);

    // The zone's next day: the counters have reset and the fold goes out.
    h.advanceTo(DAY_TWO);
    const nextDay = await h.flush();
    const wireAfterNextDay = wireCount(h);
    const settled = (h.fake._data.sms_messages ?? []).find((r) =>
      r.id === row?.id
    );

    const s7 = sameDay.flushed === 0 && wireAfterSameDayFlush === 3 &&
      stillWaiting === "deferred" &&
      nextDay.flushed === 1 && wireAfterNextDay === 4 &&
      settled?.twilio_status === "queued" &&
      // And the reset is the ZONE's: 23 UTC hours apart, one local day apart.
      store.get(`${row?.conversation_id}|project-a`)?.day === "2026-11-02";
    assertions.push({
      caseId: "budget-fold-to-digest",
      clause: "S7",
      status: s7 ? "pass" : "fail",
      reason: s7
        ? "a flush on the same local day sent nothing and left the row waiting; the first flush of the next local day — 23 UTC hours later, across the fall-back — sent it once"
        : `expected 0 flushed on the same local day and 1 on the next; got same=${sameDay.flushed} (wire ${wireAfterSameDayFlush}, status ${stillWaiting}) next=${nextDay.flushed} (wire ${wireAfterNextDay}, status ${settled?.twilio_status}) day=${
          store.get(`${row?.conversation_id}|project-a`)?.day
        }`,
    });

    return assertions;
  },
};
