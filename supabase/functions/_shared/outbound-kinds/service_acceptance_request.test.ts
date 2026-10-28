import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OutboundDraft } from "../outbound-send.ts";
import { outboundKinds } from "./index.ts";
import { renderEmail } from "./service_acceptance_request.ts";

const draft: OutboundDraft = {
  id: "draft",
  organization_id: "studio",
  project_id: "project",
  kind: "service_acceptance_request",
  channel: "email",
  recipient_kind: "client",
  to_contact_id: null,
  to_client_id: "client",
  to_party_id: null,
  to_address: "client@example.test",
  subject: "Review the agreed services",
  body: "Please review the scope.\nWe are here for questions.",
  payload: { requestId: "untrusted-payload-id" },
  ref_type: "service_acceptance_request",
  ref_id: "request",
  status: "awaiting_review",
  sent_by: null,
};
function signer(overrides: Record<string, unknown>) {
  return {
    profile_id: null,
    household_person_id: null,
    status: "active",
    required: true,
    ...overrides,
  };
}
function admin(
  overrides: Record<string, unknown> = {},
  error: unknown = null,
): SupabaseClient {
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          assertEquals(column, "id");
          assertEquals(value, table === "projects" ? "project" : "request");
          return query;
        },
        single: () =>
          Promise.resolve({
            data: table === "projects" ? { name: "Oak & <House>" } : {
              id: "request",
              project_id: "project",
              service_acceptance_signers: [
                signer({ profile_id: "client" }),
                signer({ profile_id: "partner" }),
                signer({ household_person_id: "card" }),
              ],
              ...overrides,
            },
            error,
          }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
Deno.test("registered service acceptance renderer links the bound request, escapes project, preserves draft and has no afterSend", async () => {
  const previous = Deno.env.get("CLIENT_PORTAL_URL");
  Deno.env.set("CLIENT_PORTAL_URL", "https://client.example.test/");
  try {
    assertEquals(
      outboundKinds.service_acceptance_request.renderEmail,
      renderEmail,
    );
    assertEquals(outboundKinds.service_acceptance_request.afterSend, undefined);
    const result = await renderEmail({ admin: admin(), draft });
    assertStringIncludes(
      result.html,
      "https://client.example.test/acceptance/request",
    );
    assertStringIncludes(
      result.text!,
      "https://client.example.test/acceptance/request",
    );
    assertEquals(result.html.includes("untrusted-payload-id"), false);
    assertStringIncludes(result.html, "Oak &amp; &lt;House&gt;");
    assertStringIncludes(
      result.html,
      "Please review the scope.<br>We are here for questions.",
    );
    assertStringIncludes(
      result.text!,
      "review and accept the agreed service scope",
    );
    assertEquals(/\b(sign|signature|e-signature)\b/i.test(result.text!), false);
    assertEquals(/[$£€]|\b\d+(?:\.\d{2})\b/.test(result.text!), false);
  } finally {
    if (previous === undefined) Deno.env.delete("CLIENT_PORTAL_URL");
    else Deno.env.set("CLIENT_PORTAL_URL", previous);
  }
});
Deno.test("service acceptance renderer refuses inconsistent request/draft/project binding", async () => {
  for (
    const overrides of [
      { project_id: "other" },
      { id: "other" },
      { service_acceptance_signers: [] },
      { service_acceptance_signers: null },
    ]
  ) {
    await assertRejects(
      () => renderEmail({ admin: admin(overrides), draft }),
      Error,
      "draft binding differs",
    );
  }
  await assertRejects(
    () =>
      renderEmail({
        admin: admin(),
        draft: { ...draft, ref_type: "review_request" },
      }),
    Error,
    "reference missing",
  );
  await assertRejects(
    () => renderEmail({ admin: admin({}, new Error("read failed")), draft }),
    Error,
    "read failed",
  );
});
Deno.test("service acceptance renderer sends each active required signer's sibling draft (00891)", async () => {
  const partner = await renderEmail({
    admin: admin(),
    draft: { ...draft, id: "sibling", to_client_id: "partner" },
  });
  assertEquals(partner.userId, "partner");
  assertStringIncludes(partner.text!, "/acceptance/request");
  const card = await renderEmail({
    admin: admin(),
    draft: {
      ...draft,
      id: "card-draft",
      to_contact_id: "card",
      to_client_id: null,
    },
  });
  assertEquals(card.userId, undefined);
  // A household card linked to a portal profile carries both recipients.
  const linkedCard = await renderEmail({
    admin: admin(),
    draft: { ...draft, to_contact_id: "card", to_client_id: "card-profile" },
  });
  assertEquals(linkedCard.userId, "card-profile");
});
Deno.test("service acceptance renderer refuses a foreign draft on the request (draft binding differs)", async () => {
  const foreign: {
    draft?: OutboundDraft;
    overrides?: Record<string, unknown>;
  }[] = [
    // Not a signer of this request.
    { draft: { ...draft, to_client_id: "stranger" } },
    { draft: { ...draft, to_client_id: null } },
    { draft: { ...draft, to_contact_id: "other-card", to_client_id: null } },
    // A profile signer's id does not cover a draft addressed to another card.
    { draft: { ...draft, to_contact_id: "other-card" } },
    // Same request and recipient, but another kind or project.
    { draft: { ...draft, kind: "review_request" } },
    { draft: { ...draft, project_id: "other" } },
    // The recipient was a signer, but is replaced or optional.
    {
      overrides: {
        service_acceptance_signers: [
          signer({ profile_id: "client", status: "replaced" }),
        ],
      },
    },
    {
      overrides: {
        service_acceptance_signers: [
          signer({ profile_id: "client", required: false }),
        ],
      },
    },
  ];
  for (const { draft: candidate = draft, overrides = {} } of foreign) {
    await assertRejects(
      () => renderEmail({ admin: admin(overrides), draft: candidate }),
      Error,
      "draft binding differs",
    );
  }
});
