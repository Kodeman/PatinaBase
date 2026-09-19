import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clientFixture } from "../client-fixture.ts";
import { CLIENT_LINK_ACTIONS } from "../../../client-invite/lib.ts";
import type { GateAssertion, GateCase } from "../types.ts";

/**
 * THE CAPABILITY IS THE WHOLE IDENTITY (US-3 P23). A homeowner on the field
 * line has a phone number and nothing else: no Patina account, no password, no
 * session. What she is given is one token in one text, and every door it opens
 * — the letter page at CLIENT_PORTAL_URL/auth/invite/<token>, and the reply she
 * texts back — is authorized by that token's own recorded scope.
 *
 * `resolve_client_link` is the only read path a token holder has: the portal
 * page (apps/client-portal/src/app/auth/invite/[token]/page.tsx, tested there)
 * and client-invite's capability accept leg both go through it and nothing else.
 * Its hash-at-rest, its NULL-on-every-miss answer and its RLS are proven
 * against a real Postgres in supabase/tests/field/client_phone_identity_test.sql;
 * what is measured HERE is the answer the callers are built on, offline.
 */

/** The reason lines these four cases publish, one per clause, on success. */
function pass(id: string, clauses: string[], reason: string): GateAssertion[] {
  return clauses.map((clause) => ({ caseId: id, clause, status: "pass" as const, reason }));
}

export const clientPhoneOnlyCapability: GateCase = {
  id: "client-phone-only-capability",
  phase: 2,
  clauses: ["S6", "P23"],
  async run(): Promise<GateAssertion[]> {
    const { h } = clientFixture();
    // She is a phone number on a project and nothing more: no profile, no seat
    // in the studio's org, nothing that could carry a session.
    assert(
      !(h.fake._data.profiles ?? []).some((row) => row.id === "party-c"),
      "the fixture's homeowner has no account, which is the whole point",
    );

    const mint = await h.fake.rpc("create_client_link", {
      p_invitation_id: "inv-c",
      p_actions: [...CLIENT_LINK_ACTIONS],
    });
    const token = String((mint.data as Array<{ token: string }>)[0].token);
    assertEquals(token.length, 64, "one 64-hex credential, generated once");

    const opened = await h.fake.rpc("resolve_client_link", {
      p_token: token,
      p_action: "open",
      p_source: "client_portal",
    });
    const scope = (opened.data as { scope: { actions: string[]; project_id: string } }).scope;
    assertEquals((opened.data as { project_id: string }).project_id, "project-a");
    assertEquals((opened.data as { invitation_id: string }).invitation_id, "inv-c");
    assertEquals(
      (opened.data as { party_id: string }).party_id,
      "party-c",
      "one seat on this project carries her number, so the capability names it",
    );
    assertEquals(scope.project_id, "project-a", "and the scope says so in its own copy");
    assert(scope.actions.includes("approve_selection"), "her picks are hers to approve");

    // The token is the only credential, so a well-formed guess must answer
    // nothing at all — not "revoked", not "expired", not "no such link".
    const forged = await h.fake.rpc("resolve_client_link", { p_token: "d".repeat(64) });
    assertEquals(forged.data, null, "a forged token is no oracle");
    const empty = await h.fake.rpc("resolve_client_link", { p_token: "   " });
    assertEquals(empty.data, null);

    // One letter, one live door: minting superseded the capability she had.
    const live = h.fake._data.client_links.filter((row) => row.status === "active");
    assertEquals(live.length, 1);
    assertEquals(live[0].id, (mint.data as Array<{ id: string }>)[0].id);

    // Every hit is audited, and the audit never carries the credential.
    assertEquals(h.fake._data.client_link_uses.length, 1, "one open, one use row");
    assertEquals(h.fake._data.client_link_uses[0].action, "open");
    assert(
      !JSON.stringify(h.fake._data.client_link_uses).includes(token),
      "the audit trail is not a copy of the key",
    );
    return pass(
      this.id,
      this.clauses,
      "A phone-only homeowner reaches her letter with the texted token alone: it resolves to her project, her seat and her recorded actions, supersedes the capability it replaced, is audited without being copied, and a forged token answers nothing.",
    );
  },
};

export const clientOpenIsNotAccept: GateCase = {
  id: "client-open-is-not-accept",
  phase: 2,
  clauses: ["S2", "S6"],
  async run(): Promise<GateAssertion[]> {
    const { h } = clientFixture();
    const mint = await h.fake.rpc("create_client_link", { p_invitation_id: "inv-c" });
    const token = String((mint.data as Array<{ token: string }>)[0].token);

    const before = JSON.stringify({
      consent: h.fake._data.studio_channel_consent,
      decisions: h.fake._data.client_decisions,
      batches: h.fake._data.client_decision_batches,
      invitations: h.fake._data.client_invitations,
      messages: h.fake._data.sms_messages,
      events: h.fake._data.decision_events,
    });
    // Twice, because a page can be reloaded and a link can be opened from two
    // devices, and neither is an answer to anything.
    await h.fake.rpc("resolve_client_link", { p_token: token, p_action: "open", p_source: "client_portal" });
    await h.fake.rpc("resolve_client_link", { p_token: token, p_action: "open", p_source: "client_portal" });

    const after = JSON.stringify({
      consent: h.fake._data.studio_channel_consent,
      decisions: h.fake._data.client_decisions,
      batches: h.fake._data.client_decision_batches,
      invitations: h.fake._data.client_invitations,
      messages: h.fake._data.sms_messages,
      events: h.fake._data.decision_events,
    });
    assertEquals(after, before, "reading her letter decides nothing");
    assertEquals(
      h.fake._data.client_invitations[0].accepted_at,
      null,
      "opening is not accepting: accepted_at is client-invite's /accept leg, not the page's",
    );
    assertEquals(
      h.fake._data.studio_channel_consent.find((row) => row.channel_value === "+15550102040")?.status,
      "pending",
      "and opening a page is not consenting to a text",
    );
    assertEquals(h.provider.requests.length, 0, "and reading sends nothing");

    // What an open DOES leave: the use row, and the mark that the door was used.
    assertEquals(h.fake._data.client_link_uses.length, 2, "each open is audited");
    assertEquals(
      h.fake._data.client_links.find((row) => row.status === "active")?.last_used_at,
      h.clock.toISOString(),
    );
    // And no second credential: a read never mints.
    assertEquals(
      h.fake._data.client_links.filter((row) => row.status === "active").length,
      1,
      "reading mints nothing",
    );
    return pass(
      this.id,
      this.clauses,
      "Opening the letter is a read: it is audited and stamps last_used_at, and it changes no consent, no decision, no batch, no acceptance, mints no second capability and sends no text.",
    );
  },
};

export const clientReplyAuthority: GateCase = {
  id: "client-reply-authority",
  phase: 2,
  clauses: ["S3", "P14"],
  async run(): Promise<GateAssertion[]> {
    // THE WORDS ARE NOT THE AUTHORITY. "YES 31" from her own phone is refused
    // unless a live capability, on this project, names the effect it asks for.
    const refusals: Array<[string, string, (f: ReturnType<typeof clientFixture>) => void]> = [
      ["the capability does not name the effect", "client_no_capability", (f) => {
        (f.h.fake._data.client_links[0].scope as { actions: string[] }).actions = ["open_letter"];
      }],
      ["the capability speaks for another house", "client_wrong_project", (f) => {
        const link = f.h.fake._data.client_links[0];
        link.project_id = "project-b";
        (link.scope as { project_id: string }).project_id = "project-b";
      }],
      ["the capability was revoked", "client_capability_expired", (f) => {
        f.h.fake._data.client_links[0].status = "revoked";
      }],
    ];
    for (const [why, disposition, breakIt] of refusals) {
      const f = clientFixture();
      const batch = f.batch();
      const ask = f.ask();
      breakIt(f);
      const res = await f.inbound("YES 31", `SMauthority${disposition}`);
      assertEquals(res.disposition, disposition, why);
      assertEquals(res.effectApplied ?? false, false, `${why}: nothing was applied`);
      assertEquals(f.h.fake._data.client_decisions[0].status, "pending", `${why}: her pick is untouched`);
      assertEquals(batch.closed_at, null, `${why}: the ask stays open`);
      assertEquals(ask.answered_at ?? null, null, `${why}: and so does her reference`);
      assertEquals(f.uses.length, 0, `${why}: a refused reply spends no capability`);
      const reply = String(res.replies?.[0]?.message ?? "");
      assert(reply.length > 0, `${why}: she is answered`);
      assert(
        !/42501|capability|scope|SQLSTATE/i.test(reply),
        `${why}: in her words, not the database's — "${reply}"`,
      );
    }

    // And with the capability she was actually given, the same four characters
    // apply — through the capability, which is recorded as having been used.
    const ok = clientFixture();
    ok.batch();
    ok.ask();
    const applied = await ok.inbound("YES 31", "SMauthorityOk");
    assertEquals(applied.disposition, "client_selection_approved");
    assertEquals(ok.h.fake._data.client_decisions[0].status, "responded");
    assertEquals(ok.uses.length, 1, "one capability use, recorded");
    assertEquals(ok.uses[0].link_id, "cl-1", "and it names the capability that authorized it");
    assertEquals(ok.uses[0].action, "apply_client_effect:approve_selection");
    return pass(
      this.id,
      this.clauses,
      "A reply is authorized by the capability, not by the phone or the words: a scope without the effect, another project's capability and a revoked one are each refused with nothing applied and no capability spent, while the capability she holds applies and is recorded as used.",
    );
  },
};

export const clientPaymentBoundary: GateCase = {
  id: "client-payment-boundary",
  phase: 2,
  clauses: ["S3", "P24"],
  async run(): Promise<GateAssertion[]> {
    // NOTHING ON THIS RAIL SPENDS MONEY. A homeowner can say which sofa she
    // likes and when she can take a delivery. Approving an invoice, releasing a
    // deposit or paying anything is not a thing four characters of SMS can do.
    for (const action of CLIENT_LINK_ACTIONS) {
      assert(
        !/pay|invoice|deposit|charge|checkout|card|refund|price|total/i.test(action),
        `a client capability must not name a money action, but names "${action}"`,
      );
    }

    const f = clientFixture();
    f.batch();
    f.ask();
    // Even a capability that has somehow been written a money action cannot use
    // it: the effect vocabulary is closed at the SQL door.
    (f.h.fake._data.client_links[0].scope as { actions: string[] }).actions.push("pay_invoice");
    const paid = await f.h.fake.rpc("apply_client_effect", {
      p_prompt_id: "prompt-c",
      p_effect: "pay_invoice",
      p_payload: { amount: 4200 },
      p_source_sid: "SMpay",
    });
    assertEquals((paid.error as { code: string }).code, "22023", "an unknown effect is refused, not attempted");
    assertEquals(paid.data, null);
    assertEquals(f.uses.length, 0, "and it spends no capability");
    assertEquals(f.h.fake._data.client_decisions[0].status, "pending");

    // The other half of the boundary: a decision that hangs off a signed
    // approval is not askable by text at all, whatever she replies.
    const contracted = clientFixture();
    contracted.batch();
    contracted.ask();
    contracted.h.fake._data.client_decisions[0].approval_contract = "change-order-3";
    const res = await contracted.inbound("YES 31", "SMcontract");
    assertEquals(res.effectApplied ?? false, false);
    assertEquals(contracted.h.fake._data.client_decisions[0].status, "pending");
    assert(
      /follow up|didn't save/i.test(String(res.replies?.[0]?.message ?? "")),
      "she is told a person will follow up, not given a form",
    );

    // And her copy never mentions money, because none of it is about money.
    const clientCopy = (contracted.h.fake._data.email_templates ?? [])
      .filter((row) => String(row.slug).startsWith("sms_client_") ||
        row.slug === "sms_selection_ready" || row.slug === "sms_window_pick");
    assertEquals(clientCopy.length, 3, "the three bodies 00652 seeds");
    for (const row of clientCopy) {
      assert(
        !/\$|price|pay|invoice|deposit|total|cost|fee/i.test(String(row.html_content)),
        `${row.slug} must not talk about money: ${row.html_content}`,
      );
    }
    return pass(
      this.id,
      this.clauses,
      "The rail has no money in it: no client capability action names payment, an invoice-shaped effect is refused by the SQL door even when a scope lists it, a decision behind an approval contract cannot be answered by text, and none of the three client bodies mentions cost.",
    );
  },
};
