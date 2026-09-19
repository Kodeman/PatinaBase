import { createFieldLineHarness, type FieldLineHarness } from "../harness.ts";
import type { GateAssertion, GateCase } from "../types.ts";

const AT = new Date("2026-11-01T15:00:00.000Z"); // 9:00am CST, inside the window.

interface ContextRow {
  dead_end_prompt_id: string | null;
  paused_until: string | null;
  owner: string | null;
  handoffs: number;
}

/**
 * 00645's sms_party_prompt_gate, modelled on the same three facts the SQL uses:
 * the pause standing on the conversation, the streak of prompts that went
 * unanswered since the party last replied, and a compare-and-set on the streak's
 * OLDEST prompt id. Row locking and the needs_review write are SQL questions
 * (supabase/tests/field/sms_trade_prompts_test.sql); the exactly-once SHAPE is
 * what this proves the rail is written against.
 */
function gateModel(h: () => FieldLineHarness, ctx: Map<string, ContextRow>) {
  return (args: Record<string, unknown>) => {
    const key = `${args.p_conversation_id}|${args.p_project_id}`;
    const row = ctx.get(key) ??
      { dead_end_prompt_id: null, paused_until: null, owner: null, handoffs: 0 };
    ctx.set(key, row);
    const clock = h().clock.getTime();
    if (row.paused_until && Date.parse(row.paused_until) > clock) {
      return {
        data: {
          allowed: false,
          reason: "paused",
          paused_until: row.paused_until,
          owner_user_id: row.owner,
        },
        error: null,
      };
    }
    const prompts = (h().fake._data.sms_prompts ?? []).filter((p) =>
      p.party_id === args.p_party_id && p.project_id === args.p_project_id
    );
    const lastReply = prompts.filter((p) => p.answered_at)
      .map((p) => String(p.answered_at)).sort().at(-1) ?? "";
    const streak = prompts
      .filter((p) =>
        !p.answered_at && !["optin", "mark_done"].includes(String(p.kind)) &&
        String(p.created_at) > lastReply
      )
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (streak.length < 2) {
      return { data: { allowed: true, unanswered: streak.length }, error: null };
    }
    const oldest = String(streak[0].id);
    let handoff = false;
    if (row.dead_end_prompt_id !== oldest) {
      row.dead_end_prompt_id = oldest;
      row.owner = args.p_project_id === "project-a" ? "studio-a" : "studio-b";
      row.paused_until = new Date(clock + 24 * 3600 * 1000).toISOString();
      row.handoffs += 1;
      handoff = true;
    }
    return {
      data: {
        allowed: false,
        reason: "dead_end",
        handoff,
        unanswered: streak.length,
        prompt_id: oldest,
        paused_until: row.paused_until,
        owner_user_id: row.owner,
      },
      error: null,
    };
  };
}

function wireCount(h: FieldLineHarness): number {
  return h.provider.requests.filter((r) => r.url.includes("/Messages.json"))
    .length;
}

/**
 * A dead end has an owner (clause S4). Two questions a party never answered is
 * not a third question — it is a person who needs a phone call. The rail stops
 * texting them and hands the thread to the project lead, ONCE. Twice is two
 * people each assuming the other has it, which is the same as nobody.
 *
 * S4 — the third ask is refused, exactly one handoff exists for the silence, and
 *      the pause the handoff wrote is what refuses every ask after it. A party
 *      who then replies is not still paused for the same silence: the streak is
 *      measured from their last answer, so answering is what reopens the rail.
 */
export const deadEndHandoff: GateCase = {
  id: "dead-end-handoff",
  phase: 1,
  clauses: ["S4"],
  async run(): Promise<GateAssertion[]> {
    const ctx = new Map<string, ContextRow>();
    let harness: FieldLineHarness;
    harness = createFieldLineHarness({
      now: AT,
      env: { FIELD_LINE_PHASE: "1" },
      rpc: { sms_party_prompt_gate: gateModel(() => harness, ctx) },
    });
    const h = harness;

    const ask = (n: number) =>
      h.send({
        partyId: "party-a",
        templateKey: "sms_daily_digest",
        vars: { menu: `Ask ${n}.` },
        dedupeKey: `ask-${n}`,
        automationPhase: 1,
        cadenceClass: "event",
      });
    const openPrompt = (id: string, createdAt: string) =>
      (h.fake._data.sms_prompts ??= []).push({
        id,
        party_id: "party-a",
        project_id: "project-a",
        kind: "site_card",
        subject_id: "task-a",
        short_code: id.slice(-2),
        version: 20261101,
        expires_at: "2026-11-03T00:00:00.000Z",
        answered_at: null,
        sender_number: h.sender,
        recipient_phone: h.recipient,
        created_at: createdAt,
      });

    // One unanswered ask is a quiet day, not a dead end.
    openPrompt("prompt-51", "2026-10-30T15:00:00.000Z");
    const first = await ask(1);
    const wireAfterFirst = wireCount(h);

    // Two is the silence the gate is looking for.
    openPrompt("prompt-52", "2026-10-31T15:00:00.000Z");
    const second = await ask(2);
    const handoffsAfterSecond = ctx.get(`${first.conversationId}|project-a`)?.handoffs;

    // A third ask finds the same silence already claimed.
    openPrompt("prompt-53", "2026-11-01T14:00:00.000Z");
    const third = await ask(3);
    const state = ctx.get(`${first.conversationId}|project-a`);

    // The party answers the oldest one. The silence is over, and the rail can
    // ask again — the pause was about THIS streak, not about this party forever.
    for (const p of h.fake._data.sms_prompts) {
      if (p.id === "prompt-51") p.answered_at = "2026-11-01T15:30:00.000Z";
    }
    h.advanceTo(new Date("2026-11-02T15:00:00.000Z"));
    ctx.get(`${first.conversationId}|project-a`)!.paused_until = null;
    const fourth = await ask(4);

    const s4 = first.sent === true && wireAfterFirst === 1 &&
      second.sent !== true && second.reason === "dead_end" &&
      third.sent !== true && third.reason === "prompts_paused" &&
      handoffsAfterSecond === 1 && state?.handoffs === 1 &&
      state?.dead_end_prompt_id === "prompt-51" &&
      state?.owner === "studio-a" &&
      wireCount(h) === 2 && fourth.sent === true;

    return [{
      caseId: "dead-end-handoff",
      clause: "S4",
      status: s4 ? "pass" : "fail",
      reason: s4
        ? "one unanswered ask still sends; the second stops the rail and files exactly one owned handoff on the oldest unanswered prompt (studio-a); the third is refused by that handoff's own pause and files nothing; answering reopens the rail"
        : `expected send, dead_end, prompts_paused, then a send after the reply, with exactly one handoff; got first=${first.sent}/${first.reason} second=${second.status}/${second.reason} third=${third.status}/${third.reason} fourth=${fourth.status}/${fourth.reason} handoffs=${state?.handoffs} key=${state?.dead_end_prompt_id} owner=${state?.owner} wire=${wireCount(h)}`,
    }];
  },
};
