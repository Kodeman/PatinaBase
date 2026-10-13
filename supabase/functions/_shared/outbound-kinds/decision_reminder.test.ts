import { assert, assertMatch, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderEmail as renderReminder } from "./decision_reminder.ts";
import { renderEmail as renderOverdue } from "./decision_overdue.ts";
import type { OutboundDraft } from "../outbound-send.ts";

function fakeAdmin(): SupabaseClient {
  const admin = {
    rpc: async () => ({ data: [{ studio_id: "studio", name: "Studio", source: "studio" }], error: null }),
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.maybeSingle = async () => ({
        data: table === "profiles" ? { email: "designer@example.test", full_name: "Ada Designer", city: null } : null,
        error: null,
      });
      return query;
    },
  };
  return admin as unknown as SupabaseClient;
}

const draft = (kind: "decision_reminder" | "decision_overdue"): OutboundDraft => ({
  id: "draft", organization_id: "studio", project_id: "project", kind, channel: "email",
  recipient_kind: "client", to_contact_id: null, to_client_id: "client", to_party_id: null,
  to_address: "client@example.test", subject: "Edited subject", body: "Designer-edited message",
  payload: { designer_id: "designer", recipient_id: "client", recipient_name: "Lee" },
  ref_type: "client_decision", ref_id: "decision", status: "awaiting_review", sent_by: null,
});

Deno.test("decision reminder renderer uses edited draft and includes CTA and reply-to", async () => {
  const email = await renderReminder({ admin: fakeAdmin(), draft: draft("decision_reminder") });
  assertMatch(email.html, /class="ink2"[^>]*>Designer-edited message<\/p>/);
  assertStringIncludes(email.html, "Review this decision");
  assertStringIncludes(email.html, "Ada, Studio");
  assert(email.replyTo === "designer@example.test");
});

Deno.test("decision overdue renderer uses edited draft and includes CTA and reply-to", async () => {
  const email = await renderOverdue({ admin: fakeAdmin(), draft: draft("decision_overdue") });
  assertMatch(email.html, /class="ink2"[^>]*>Designer-edited message<\/p>/);
  assertStringIncludes(email.html, "Review this decision");
  assertStringIncludes(email.html, "Ada, Studio");
  assert(email.replyTo === "designer@example.test");
});
