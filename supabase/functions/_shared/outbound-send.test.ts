import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendOutboundDraft } from "./outbound-send.ts";
import { renderEmail } from "./outbound-kinds/review_request.ts";
import type { OutboundDraft } from "./outbound-send.ts";

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

Deno.test("review request renderEmail preserves edits and structured delivery fields", async () => {
  const draft = {
    id: "draft-3", organization_id: "studio-1", project_id: "project-1", kind: "review_request",
    channel: "email", recipient_kind: "client", to_contact_id: null, to_client_id: "client-1",
    to_party_id: null, to_address: "client@example.com", subject: "Edited subject", body: "Edited message body",
    payload: {
      doorstep_url: "https://client.example.com/project/project-1/doorstep",
      project_name: "Lake House", designer_given_name: "Ari", studio_name: "North Studio",
      cobrand_studio_name: "North Studio", studio_logo_url: "https://example.com/logo.png",
      signature_city: "Portland", designer_email: "ari@example.com", client_user_id: "client-profile-1",
    }, ref_type: "project", ref_id: "project-1", status: "sending", sent_by: null,
  } as OutboundDraft;
  const rendered = await renderEmail({ admin: {} as never, draft });
  assertEquals(rendered.html.includes("Edited message body"), true);
  assertEquals(rendered.html.includes("Share Your Experience"), true);
  assertEquals(rendered.html.includes("Portland"), true);
  assertEquals(rendered.replyTo, "ari@example.com");
  assertEquals(rendered.userId, "client-profile-1");
  assertEquals(rendered.from, Deno.env.get("RESEND_FROM") ?? "hello@patina.cloud");
});

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
