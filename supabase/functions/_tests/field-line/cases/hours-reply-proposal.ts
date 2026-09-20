import { inboundFixture } from "../inbound-fixture.ts";
import { jsonObject, readField } from "./helpers.ts";
import type { GateAssertion, GateCase } from "../types.ts";

const SITE_ADDRESS = "1421 Williamson St, Madison";
/** What a truthful receipt for 6.5 hours on this fixture's site begins with. */
const RECEIPT_HEAD = `Got it — 6.5 hours at ${SITE_ADDRESS}.`;

type Row = Record<string, unknown>;

interface FiledEffect {
  type?: unknown;
  hours?: unknown;
  target?: { kind?: unknown; id?: unknown };
}

/** The effect an apply_field_effect call was handed. */
function filed(entry: Row | undefined): FiledEffect | null {
  return entry ? jsonObject<FiledEffect>(entry.p_effect, "filed effect") : null;
}

function hoursEffects(entries: Row[]): FiledEffect[] {
  return entries.map(filed).filter((e): e is FiledEffect =>
    e?.type === "report_hours"
  );
}

/** One proposal, for these hours, about the visit's own task — and no more. */
function isOneProposal(entries: Row[], hours: number): boolean {
  const proposals = hoursEffects(entries);
  if (proposals.length !== 1) return false;
  const only = proposals[0];
  return only.hours === hours && only.target?.kind === "task" &&
    only.target?.id === "task-a";
}

function firstReply(result: { replies?: Array<{ message: string }> }): string {
  return result.replies?.[0]?.message ?? "";
}

/**
 * The fixture world every scenario below starts from: the shared handset, its
 * two studios, and a street for the receipt to name.
 */
function replyWorld(effectError?: unknown) {
  const fixture = inboundFixture(effectError);
  fixture.h.fake._data.projects.find((p) => p.id === "project-a")!
    .site_address = SITE_ADDRESS;
  return fixture;
}

/** An evening's hours question, as 00653 issues one: NO stored proposal. */
function hoursAsk(
  fixture: ReturnType<typeof replyWorld>,
  id: string,
  shortCode: string,
): Row {
  return fixture.prompt({
    id,
    kind: "report_hours",
    short_code: shortCode,
    proposed_effect: null,
  });
}

/**
 * A single-seat handset holding a fresh numbered digest menu — the world a bare
 * number went to before this phase existed. Built by answering a real reference
 * first, because that is what creates the conversation context the menu is read
 * off; the menu is then written onto that row.
 */
async function menuWorld() {
  const fixture = replyWorld();
  const { h } = fixture;
  // One seat, so the pre-existing path under test is the menu and not the
  // multi-project chooser.
  h.fake._data.project_parties = h.fake._data.project_parties.slice(0, 1);
  fixture.prompt();
  await h.processInbound({ Body: "HERE 17", MessageSid: "SMmenuWarmup" });
  const context = h.fake._data.sms_conversation_context.find((c) =>
    c.project_id === "project-a"
  )!;
  context.state_context = {
    menu: [{ n: 2, id: "task-a", kind: "task", project_id: "project-a" }],
    menu_created_at: h.clock.toISOString(),
  };
  return { ...fixture, before: fixture.effects.length };
}

/**
 * A NUMBER IS AN ANSWER ONLY WHERE SOMETHING ASKED FOR ONE (clauses S7, S1).
 *
 * S7 — the grammar and the words that come back. A reference picks its own
 *      question, two digits or three (R3 BLOCKING-1: 00639 hands out 100-999
 *      once a busy handset has spent 10-99); one open question needs no
 *      reference; a number nobody can book gets the range back and the question
 *      stays open; a bare number with NO hours question open goes exactly where
 *      it went before, to the digest menu; and no failure anywhere on this path
 *      produces a "Got it" for hours that were not filed.
 * S1 — what is filed: one {type:'report_hours', target:{kind:'task'}, hours}
 *      per question, from the REPLY's own effect (the prompt carries no stored
 *      proposal), and a question already answered files nothing a second time.
 *
 * What a proposal then becomes — a field_time_reports row that can never write
 * project_time_entries without an explicit, member-checked attribution — is
 * SQL, and is proven in supabase/tests/field/field_time_reports_test.sql.
 */
export const hoursReplyProposal: GateCase = {
  id: "hours-reply-proposal",
  phase: 3,
  clauses: ["S7", "S1"],
  async run(): Promise<GateAssertion[]> {
    const assertions: GateAssertion[] = [];

    // ── A reference picks its own question (two digits) ────────────────────
    const coded = replyWorld();
    hoursAsk(coded, "hours-21", "21");
    hoursAsk(coded, "hours-22", "22");
    const codedResult = await coded.h.processInbound({
      Body: "6.5 21",
      MessageSid: "SMhoursCoded",
    });
    const codedOk = codedResult.disposition === "ref_applied" &&
      isOneProposal(coded.effects, 6.5) &&
      firstReply(codedResult).startsWith(RECEIPT_HEAD) &&
      firstReply(codedResult).endsWith("will confirm.") &&
      coded.h.fake._data.sms_prompts.find((p) => p.id === "hours-21")!
          .answered_at !== null &&
      coded.h.fake._data.sms_prompts.find((p) => p.id === "hours-22")!
          .answered_at === null;

    // ── One open question needs no reference ──────────────────────────────
    const bare = replyWorld();
    hoursAsk(bare, "hours-30", "30");
    // An open question of another kind beside it: the codeless door counts
    // hours asks, not open prompts.
    bare.prompt({ id: "day-of-31", kind: "day_of", short_code: "31" });
    const bareResult = await bare.h.processInbound({
      Body: "6.5",
      MessageSid: "SMhoursBare",
    });
    const bareOk = bareResult.disposition === "ref_applied" &&
      isOneProposal(bare.effects, 6.5) &&
      firstReply(bareResult).startsWith(RECEIPT_HEAD) &&
      bare.h.fake._data.sms_prompts.find((p) => p.id === "hours-30")!
          .answered_at !== null &&
      bare.h.fake._data.sms_prompts.find((p) => p.id === "day-of-31")!
          .answered_at === null;

    // ── A three-digit reference, on the handset that earned one ───────────
    const wide = replyWorld();
    hoursAsk(wide, "hours-12", "12");
    hoursAsk(wide, "hours-121", "121");
    const wideResult = await wide.h.processInbound({
      Body: "6.5 121",
      MessageSid: "SMhours121",
    });
    const wideOk = wideResult.disposition === "ref_applied" &&
      isOneProposal(wide.effects, 6.5) &&
      wide.h.fake._data.sms_prompts.find((p) => p.id === "hours-121")!
          .answered_at !== null &&
      // Not read as "12" with a stray digit, and not answered against the
      // other open question.
      wide.h.fake._data.sms_prompts.find((p) => p.id === "hours-12")!
          .answered_at === null;

    // ── A number nobody can book ──────────────────────────────────────────
    const over = replyWorld();
    hoursAsk(over, "hours-41", "41");
    const overResult = await over.h.processInbound({
      Body: "17",
      MessageSid: "SMhoursOver",
    });
    const overOk = overResult.disposition === "hours_out_of_range" &&
      firstReply(overResult).includes("between 0 and 16") &&
      firstReply(overResult).includes("Ref 41") &&
      !firstReply(overResult).includes("Got it") &&
      hoursEffects(over.effects).length === 0 &&
      // The crew's day is not lost to an unusable number.
      over.h.fake._data.sms_prompts.find((p) => p.id === "hours-41")!
          .answered_at === null;

    // ── Asked once, answered once ─────────────────────────────────────────
    const once = replyWorld();
    hoursAsk(once, "hours-50", "50");
    const answered = await once.h.processInbound({
      Body: "6.5",
      MessageSid: "SMhoursOnce",
    });
    const replayed = await once.h.processInbound({
      Body: "6.5",
      MessageSid: "SMhoursOnce",
    });
    const again = await once.h.processInbound({
      Body: "7",
      MessageSid: "SMhoursTwice",
    });
    const onceOk = answered.disposition === "ref_applied" &&
      // The carrier's retry of the SAME message replays the answer it already
      // earned rather than proposing the hours a second time. (Its receipt is
      // the rail's generic replay wording, not a fresh hours sentence — the
      // pre-existing behaviour of every prompt kind, unchanged here.)
      replayed.disposition === "ref_applied" &&
      // A NEW number afterwards finds nothing asking for hours and goes back to
      // the ordinary path for this two-seat handset.
      again.disposition === "project_chooser" &&
      // One proposal for this question, whatever else the later numbers did.
      isOneProposal(once.effects, 6.5) &&
      once.h.fake._data.sms_prompts.filter((p) =>
          p.kind === "report_hours" && p.answered_at !== null
        ).length === 1;

    // ── A bare number with nothing asking for hours ───────────────────────
    const menu = await menuWorld();
    const menuResult = await menu.h.processInbound({
      Body: "2",
      MessageSid: "SMmenuTwo",
    });
    const menuFiled = filed(menu.effects[menu.before]);
    const menuOk = menuResult.disposition === "menu_applied" &&
      menu.effects.length === menu.before + 1 &&
      menuFiled?.type === "mark_done" &&
      menuFiled?.target?.kind === "task" &&
      menuFiled?.target?.id === "task-a" &&
      hoursEffects(menu.effects).length === 0;

    // The same handset, the same menu, the same body — with tonight's hours
    // question open, which is the ONLY thing that makes a number hours.
    const asked = await menuWorld();
    hoursAsk(asked, "hours-60", "60");
    const askedResult = await asked.h.processInbound({
      Body: "2",
      MessageSid: "SMaskedTwo",
    });
    const askedFiled = filed(asked.effects[asked.before]);
    const askedOk = askedResult.disposition === "ref_applied" &&
      askedFiled?.type === "report_hours" && askedFiled?.hours === 2 &&
      // The menu item was not closed by a number that meant hours.
      asked.effects.slice(asked.before).every((e) =>
        filed(e)?.type !== "mark_done"
      );

    // ── Nothing that fails says the hours were filed ──────────────────────
    const rolledBack = replyWorld({
      code: "P0001",
      message: "fixture rolled-back database exception",
    });
    hoursAsk(rolledBack, "hours-70", "70");
    const failedResult = await rolledBack.h.processInbound({
      Body: "6.5",
      MessageSid: "SMhoursFailed",
    });
    const failedOk = failedResult.disposition === "effect_failed" &&
      firstReply(failedResult).includes("didn't save") &&
      !firstReply(failedResult).includes("Got it") &&
      rolledBack.h.fake._data.sms_prompts.find((p) => p.id === "hours-70")!
          .answered_at === null;

    // The apply LANDED and the work after it did not. The receipt has to say
    // the hours were saved and that a person is needed — never "Got it", which
    // would promise a confirmation nobody was told to make.
    const halfway = replyWorld();
    hoursAsk(halfway, "hours-80", "80");
    hoursAsk(halfway, "hours-81", "81");
    await halfway.h.processInbound({ Body: "6.5 80", MessageSid: "SMhalfOk" });
    const context = halfway.h.fake._data.sms_conversation_context.find((c) =>
      c.project_id === "project-a"
    )!;
    halfway.h.fake._failUpdateIds!.add(String(context.id));
    const halfResult = await halfway.h.processInbound({
      Body: "7 81",
      MessageSid: "SMhalfBroken",
    });
    const halfOk = halfResult.disposition === "prompt_followup_failed" &&
      firstReply(halfResult).includes(
        "was saved, but the follow-up needs attention",
      ) &&
      !firstReply(halfResult).includes("Got it") &&
      halfResult.effectApplied === true &&
      hoursEffects(halfway.effects).length === 2;

    // ── S7 ────────────────────────────────────────────────────────────────
    const s7 = codedOk && bareOk && wideOk && overOk && menuOk && askedOk &&
      failedOk && halfOk;
    assertions.push({
      caseId: "hours-reply-proposal",
      clause: "S7",
      status: s7 ? "pass" : "fail",
      reason: s7
        ? `"6.5 21" answered Ref 21 and left Ref 22 open, "6.5" answered the one open hours question beside an open day-of card, "6.5 121" answered the three-digit Ref and not Ref 12, "17" got "a number between 0 and 16 — Ref 41" with the question left open, a bare "2" with nothing asking for hours closed digest item 2 exactly as before while the same "2" with a question open filed 2 hours, a rolled-back apply said it didn't save, and an apply whose follow-up failed said the hours were saved and need attention — no "Got it" on either`
        : `coded=${codedOk} (${codedResult.disposition}) bare=${bareOk} (${bareResult.disposition}) threeDigit=${wideOk} (${wideResult.disposition}) range=${overOk} (${overResult.disposition}: ${
          JSON.stringify(firstReply(overResult))
        }) menu=${menuOk} (${menuResult.disposition}: ${
          JSON.stringify(menuFiled)
        }) asked=${askedOk} (${askedResult.disposition}: ${
          JSON.stringify(askedFiled)
        }) rolledBack=${failedOk} (${failedResult.disposition}: ${
          JSON.stringify(firstReply(failedResult))
        }) followUp=${halfOk} (${halfResult.disposition}: ${
          JSON.stringify(firstReply(halfResult))
        })`,
    });

    // ── S1 ────────────────────────────────────────────────────────────────
    const proposalShape = hoursEffects(coded.effects)[0];
    const noStoredProposal = [coded, bare, wide, over, once].every((w) =>
      w.h.fake._data.sms_prompts.filter((p) => p.kind === "report_hours")
        .every((p) => readField(p, "proposed_effect") === null)
    );
    const appliedSource = coded.effects.every((e) => e.p_source === "sms") &&
      hoursEffects(coded.effects).length === 1 &&
      coded.effects[0].p_party_id === "party-a";
    const s1 = noStoredProposal && appliedSource && onceOk &&
      proposalShape?.type === "report_hours" &&
      proposalShape?.hours === 6.5 &&
      proposalShape?.target?.kind === "task" &&
      proposalShape?.target?.id === "task-a";
    assertions.push({
      caseId: "hours-reply-proposal",
      clause: "S1",
      status: s1 ? "pass" : "fail",
      reason: s1
        ? `every hours question carries a NULL proposed_effect and the hours arrive in the reply: one {type:'report_hours', target:{kind:'task', id:'task-a'}, hours:6.5} filed for party-a from source 'sms', and a question already answered filed nothing again — the repeated SID replayed the same receipt and a later number found nothing to answer`
        : `storedProposal=${noStoredProposal} source=${appliedSource} once=${onceOk} (${answered.disposition}/${replayed.disposition}/${again.disposition}, hours effects=${
          hoursEffects(once.effects).length
        }) shape=${JSON.stringify(proposalShape)}`,
    });

    return assertions;
  },
};
