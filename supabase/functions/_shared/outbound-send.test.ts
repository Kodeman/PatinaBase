import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendOutboundDraft } from "./outbound-send.ts";

function fakeAdmin(results: Array<{ data?: unknown; error?: { message: string } | null }>) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      rpc: async (name: string) => {
        calls.push(name);
        return results.shift() ?? { data: null, error: null };
      },
    } as never,
  };
}

Deno.test("sendOutboundDraft maps terminal claim statuses to not_sendable", async () => {
  for (const status of ["expired", "superseded", "discarded"]) {
    const admin = fakeAdmin([{ data: null, error: { message: `claim_outbound_draft_for_send: draft is ${status}` } }]);
    assertEquals(await sendOutboundDraft(admin.client, "draft-1", { kind: "designer", userId: "user-1" }), {
      id: "draft-1", ok: false, error: "not_sendable",
    });
    assertEquals(admin.calls, ["claim_outbound_draft_for_send"]);
  }
});

Deno.test("sendOutboundDraft releases a claim when the claimed row is invalid", async () => {
  const admin = fakeAdmin([
    { data: { id: "draft-2", status: "sending", channel: "email", to_address: null, subject: "Hello" }, error: null },
    { data: null, error: null },
  ]);
  const result = await sendOutboundDraft(admin.client, "draft-2", { kind: "designer", userId: "user-1" });
  assertEquals(result.ok, false);
  assertEquals(admin.calls, ["claim_outbound_draft_for_send", "release_outbound_draft_claim"]);
});
