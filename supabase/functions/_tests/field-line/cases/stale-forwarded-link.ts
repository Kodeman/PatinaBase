import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { fieldLinkFixture } from "../inbound-fixture.ts";
import type { GateCase } from "../types.ts";

const RAW_TOKEN = /[0-9a-f]{64}/i;

export const staleForwardedLink: GateCase = {
  id: "stale-forwarded-link", phase: 0, clauses: ["S1", "S6"],
  async run() {
    // The same saved text is answered while forwarded/unexpired, and after its
    // URL expires. Link validity never changes the immutable Ref authority.
    for (const stale of [false, true]) {
      const fixture = fieldLinkFixture();
      const { h, prompt, effects } = fixture;
      const party = h.fake._data.project_parties[0];
      party.on_site_to = "2026-11-01";
      const originalEffect = { type: "report_delay", target: { kind: "task", id: "task-a" },
        new_date: "2026-11-04", note: "original proposal" };
      const original = prompt({ kind: "report_delay", proposed_effect: originalEffect });
      const sendDigest = async (menu: string, auditBody?: string) => {
        const result = await h.send({ partyId: "party-a", templateKey: "sms_daily_digest", vars: { menu }, auditBody });
        assertEquals(result.sent, true, "link-bearing text reaches the fixture provider");
        const wire = h.provider.requests.filter((r) => r.url.includes("/Messages.json")).at(-1)!;
        const body = new URLSearchParams(String(wire.init?.body)).get("Body")!;
        const token = body.match(/\/field\/([0-9a-f]{64})/i)?.[1];
        assert(token, "actual shared sender puts a freshly minted token on the wire");
        assert(!RAW_TOKEN.test(String(result.body)), "sender receipt exposes no bearer token");
        return { body, token };
      };
      const old = await sendDigest("Ref 17");
      const rows = h.fake._data.field_link_tokens;
      const oldExpiry = rows[0].expires_at;
      assertEquals(oldExpiry, "2026-11-02T00:00:00.000Z", "link ends after its engagement's last day");
      const open = async (token: string | null) => {
        const before = { mints: fixture.mints, rows: rows.length, sends: h.provider.requests.length,
          messages: h.fake._data.sms_messages.length, effects: effects.length };
        const response = await h.fake.rpc("resolve_field_link", { p_token: token });
        assertEquals(response.error, null);
        assertEquals({ mints: fixture.mints, rows: rows.length, sends: h.provider.requests.length,
          messages: h.fake._data.sms_messages.length, effects: effects.length }, before,
          "opening or refusing a link never mints, sends, files an effect, or invents an SMS receipt");
        assert(!JSON.stringify(response).includes("token_hash"), "resolver never exposes the stored hash");
        assert(!RAW_TOKEN.test(JSON.stringify(response)), "resolver returns no bearer credential");
        return response.data;
      };
      assertEquals((await open(old.token)).party.id, "party-a");

      const latest = prompt({ id: "prompt-new", kind: "report_delay", short_code: "18", version: 2,
        proposed_effect: { ...originalEffect, new_date: "2026-11-06", note: "replacement proposal" } });
      const foreign = prompt({ id: "prompt-b", kind: "report_delay", short_code: "99", version: 9,
        party_id: "party-b", project_id: "project-b", subject_id: "task-b",
        proposed_effect: { ...originalEffect, target: { kind: "task", id: "task-b" }, new_date: "2026-11-09" } });
      party.on_site_to = "2026-11-02";
      h.advanceTo(new Date("2026-11-01T14:01:00.000Z"));
      // Exercise the bare-token auditBody seam too, including SQ-47's underscore boundary.
      const fresh = await sendDigest("Ref 18", `Prior token: _${old.token}_`);
      assertEquals(fixture.mints, 2, "each actual link-bearing dispatch mints once");
      assert(old.token !== fresh.token, "routine mint returns a fresh credential");
      assertEquals(rows[0].expires_at, oldExpiry, "moving the engagement window never extends the prior token");
      assertEquals(rows[1].expires_at, "2026-11-03T00:00:00.000Z");
      for (let attempt = 0; attempt < 2; attempt++) {
        const dto = await open(old.token);
        assertEquals(dto.project.id, "project-a", "repeated post-mint opens preserve the old link's project");
        assertEquals(dto.party.id, "party-a");
      }
      assertEquals(rows[0].last_used_at, h.clock.toISOString(), "open stamps usage without consuming the link");
      assertEquals((await open(fresh.token)).project.id, "project-a");

      if (stale) {
        h.advanceTo(new Date("2026-11-02T00:00:00.000Z"));
        assertEquals(await open(old.token), null, "S6 expired old link is refused at its own immutable expiry");
        assertEquals((await open(fresh.token)).party.id, "party-a", "newer link keeps its own later expiry");
      }
      // Reply grammar is VERB NN, not the forwarded URL/body. Extract NN from
      // the actual old wire copy, as the recipient would, not from the latest prompt.
      const code = old.body.match(/Ref (\d+)/)?.[1];
      assertEquals(code, "17");
      const applied = await h.processInbound({ Body: `YES ${code}`, MessageSid: "SMforwardedOriginal" });
      assertEquals(applied.disposition, "ref_applied");
      assertEquals(effects.length, 1);
      assertEquals(effects[0].p_party_id, "party-a");
      assertEquals(effects[0].p_effect, originalEffect, "S1 forwarded/stale Ref consumes only its original version payload and target");
      const message = h.fake._data.sms_messages.find((m) => m.twilio_sid === "SMforwardedOriginal")!;
      assertEquals(message.project_id, "project-a");
      assertEquals((message.parsed_intent as any).version, 1, "recorded prompt version is not replaced by the latest version");
      assertEquals(latest.answered_at, null);
      assertEquals(foreign.answered_at, null);
      assert(original.answered_at);
      const closed = await h.processInbound({ Body: `YES ${code}`, MessageSid: "SMforwardedClosed" });
      assertEquals(closed.disposition, "ref_closed");
      assert(closed.replies?.[0].message.includes("That one's closed."));
      assert(closed.replies?.[0].message.includes("Latest: Ref 18"));
      assert(!closed.replies?.[0].message.includes("99"));
      assertEquals(effects.length, 1, "S1 a closed forwarded Ref files no effect");
      assertEquals(fixture.mints, 2, "inbound success and closed-ref receipts mint nothing");
      assert(!RAW_TOKEN.test(JSON.stringify([applied.replies, closed.replies])), "inbound receipts contain no token");
      for (const row of h.fake._data.sms_messages) {
        assert(!RAW_TOKEN.test(String(row.body)), "S6 stored SMS bodies redact URL and bare credentials");
      }
      assert(h.fake._data.sms_messages.some((r) => r.body === "Prior token: _[redacted]_"), "bare audit token is actually redacted");
      for (const token of [old.token, fresh.token]) {
        assert(!JSON.stringify(rows).includes(token), "token rows contain hashes, not raw tokens");
      }
      assert(rows.every((r) => /^[0-9a-f]{64}$/.test(String(r.token_hash))));

      // Regeneration is a distinct, explicit act. A different party stays live.
      const other = await h.fake.rpc("create_field_link", { p_party_id: "party-b" });
      const regenerated = await h.fake.rpc("create_field_link", { p_party_id: "party-a", p_revoke_prior: true });
      assertEquals(other.error, null);
      assertEquals(regenerated.error, null);
      assertEquals(await open(old.token), null, "explicit regeneration refuses the old link");
      assertEquals(await open(fresh.token), null, "explicit regeneration revokes every prior active link for this party");
      assertEquals((await open(regenerated.data[0].token)).party.id, "party-a");
      assertEquals((await open(other.data[0].token)).project.id, "project-b", "regeneration does not revoke another party/project");
      assertEquals(await open("not-a-token"), null, "unknown and expired/revoked links have the same leak-free refusal");
      assertEquals(await open(null), null);
    }
    return this.clauses.map((clause) => ({ caseId: this.id, clause, status: "pass" as const,
      reason: clause === "S1"
        ? "Forwarded and expired-link texts retain the original Ref version/party/project; closed Ref replies file nothing and name only the same-project replacement."
        : "Routine dispatch mints fresh hash-only links; repeated old opens work until immutable expiry, explicit regeneration revokes, all opens/refusals mint nothing, and stored bodies/receipts redact credentials (fixture RPC semantics; SQL oracle separate)." }));
  },
};
