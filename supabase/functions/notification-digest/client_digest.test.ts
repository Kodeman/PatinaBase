import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { OutboundDraft } from "../_shared/outbound-send.ts";
import { renderEmail } from "../_shared/outbound-kinds/client_digest.ts";

Deno.test("client digest email uses edited body, CTA, and studio reply-to", async () => {
  const draft = {
    id: "draft-1",
    organization_id: "studio-1",
    project_id: null,
    kind: "client_digest",
    channel: "email",
    recipient_kind: "client",
    to_contact_id: null,
    to_client_id: "client-1",
    to_party_id: null,
    to_address: "client@example.test",
    subject: "Edited digest subject",
    body: "Designer-edited reminder\nSecond line",
    payload: {
      user_id: "client-1",
      reply_to: "designer@example.test",
      client_portal_url: "https://client.example.test",
      digest_period: "daily",
    },
    ref_type: "client",
    ref_id: "client-1",
    status: "awaiting_review",
    sent_by: null,
  } as OutboundDraft;

  const rendered = await renderEmail({ admin: {} as never, draft });
  assertStringIncludes(rendered.text ?? "", "Edited digest subject");
  assertStringIncludes(rendered.html, "Designer-edited reminder");
  assertStringIncludes(rendered.html, "Open Patina");
  assertStringIncludes(rendered.html, "https://client.example.test");
  assertEquals(rendered.replyTo, "designer@example.test");
  assert(rendered.text?.includes("Second line"));
});
