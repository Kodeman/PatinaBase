import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { CLIENT_PHONE, clientFixture } from "../client-fixture.ts";
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

function cards(f: Fixture): string[] {
  return wiresTo(f, CLIENT_PHONE).filter((body) => body.includes("delivery for"));
}

function picks(f: Fixture): Array<Record<string, unknown>> {
  return (f.h.fake._data.sms_prompts ?? []).filter((row) => row.kind === "window_pick");
}

/**
 * THE DELIVERY WINDOW, ASKED ONCE (US-3 P23, clause S5).
 *
 * A truck is coming and the studio has written down two windows it could come
 * in. The homeowner is the only person who knows which one she can be home for,
 * and the cheapest way to ask her is the phone already in her hand: one card,
 * the two windows in the studio's own words, C for neither, and a reference to
 * answer with.
 *
 * WHAT THIS CASE OBSERVES is the sending half — the row that makes the question
 * answerable, and the words that reach her:
 *   · ONE sms_prompts row of kind `window_pick`, naming the DELIVERY (its
 *     subject_kind/subject_id), with a short code and an expiry that cannot
 *     outlive the later window she was offered;
 *   · the real sms_window_pick body on the wire, carrying both labels, the
 *     reference, the way out, and NO link — there is nothing to read here, only
 *     something to say, which is why this is the one client card that mints no
 *     capability at dispatch;
 *   · nothing recorded: asking is not an answer, so delivery_availability is
 *     still empty and the receiver's "the goods are here" is untouched;
 *   · one card per delivery however often the cron runs, and nothing at all
 *     below phase 2.
 *
 * WHAT IT IS NOT EVIDENCE ABOUT. Her reply (client-reply-authority's, through
 * apply_client_effect) and the pace guard: the fixture models no
 * sms_claim_party_budget, and that gate fails open by design, so her list of
 * picks goes in the same tick as this card. The budget is
 * budget-fold-to-digest's evidence, on its own RPC model.
 */
export const clientWindowPickIssued: GateCase = {
  id: "client-window-pick-issued",
  phase: 2,
  clauses: ["S5", "P23"],
  async run(): Promise<GateAssertion[]> {
    const f = clientFixture();
    const truck = f.delivery();
    const first = await f.h.daily();
    assertEquals(first.client_window_picks_sent, 1, "the delivery is asked about");

    // THE ROW THE ANSWER BINDS TO.
    assertEquals(picks(f).length, 1, "one reference for one delivery");
    const prompt = picks(f)[0];
    assertEquals(prompt.subject_id, truck.subjectId, "and it names the delivery, not the day");
    assertEquals(prompt.party_id, "party-c", "asked of the one person who knows");
    assertEquals(prompt.project_id, "project-a");
    assertEquals(prompt.answered_at ?? null, null, "and nothing has been answered yet");
    assert(String(prompt.short_code ?? ""), "she has something short to reply with");
    // Midnight after the later window, Chicago: an answer that lands once both
    // windows have gone is a note, not availability.
    assertEquals(
      prompt.expires_at,
      "2026-11-06T06:00:00.000Z",
      `the card cannot outlive the windows it offers: ${JSON.stringify(prompt.expires_at)}`,
    );

    // THE WORDS THAT REACHED HER.
    assertEquals(cards(f).length, 1, "one card");
    const card = cards(f)[0];
    assert(card.includes("delivery for Living room sofa"), `it says what is coming: "${card}"`);
    assert(
      card.includes("Reply A (Nov 3 2-4), B (Nov 5 morning), or C for neither"),
      `both windows in the studio's own words, and a real third answer: "${card}"`,
    );
    assert(card.includes(`Ref ${prompt.short_code}`), `and her reference: "${card}"`);
    assert(card.includes("STOP to opt out"), `with the way out: "${card}"`);
    assert(!card.includes("http"), `and no door, because there is nothing to open: "${card}"`);
    // A capability is minted at dispatch for the texts that CARRY one, and this
    // card is not one of them: her list of picks went in the same tick and that
    // is what the one mint belongs to.
    const doors = wiresTo(f, CLIENT_PHONE).filter((body) => body.includes("/auth/invite/"));
    assertEquals(f.mints, doors.length, "nothing is minted for a text with no door in it");
    assertEquals(
      doors.some((body) => body.includes("delivery for")),
      false,
      "and the delivery card is not one of them",
    );

    // ASKING IS NOT AN ANSWER.
    assertEquals(f.h.fake._data.delivery_availability.length, 0, "she has not said anything yet");
    assertEquals(
      (f.h.fake._data.sms_messages ?? []).filter((row) =>
        row.template_key === "sms_delivery_confirm"
      ).length,
      0,
      "and the crew's delivery confirm is a different question, still unasked",
    );

    // THE CRON RUNS EVERY HOUR. It asks about this truck once.
    const second = await f.h.daily();
    assertEquals(second.client_window_picks_sent, 0);
    assertEquals(picks(f).length, 1, "no second reference for the same delivery");
    assertEquals(cards(f).length, 1, "and no second card");

    // BELOW PHASE 2 there is no client rail at all: not a card, not a row.
    const early = clientFixture({ env: { FIELD_LINE_PHASE: "1" } });
    early.delivery();
    const off = await early.h.daily();
    assertEquals(off.client_window_picks_sent, 0);
    assertEquals(picks(early).length, 0, "nothing is written");
    assertEquals(wiresTo(early, CLIENT_PHONE).length, 0, "and nothing is sent");

    const reason =
      "The cron asks the homeowner about a delivery with two proposed windows on the record exactly once: one window_pick prompt naming the delivery, expiring no later than midnight after the second window, and one sms_window_pick card carrying both labels in the studio's own words, C for neither, her reference and the opt-out line, with no link in it and nothing minted for it. Nothing is recorded by the asking, a second tick adds neither a reference nor a card, and below phase 2 nothing is written or sent.";
    return this.clauses.map((clause) => ({
      caseId: this.id,
      clause,
      status: "pass" as const,
      reason,
    }));
  },
};
