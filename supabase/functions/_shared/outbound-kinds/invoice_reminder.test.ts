import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { afterSend, renderEmail } from "./invoice_reminder.ts";
import type { OutboundDraft } from "../outbound-send.ts";

const authority = { kind: "designer", userId: "designer-1", draftId: "draft-1" } as const;

Deno.test("invoice reminder renderer honors edited content and keeps its pay CTA", async () => {
  const draft = {
    id: "draft-1", organization_id: "studio-1", project_id: "project-1", kind: "invoice_reminder",
    channel: "email", recipient_kind: "client", to_contact_id: null, to_client_id: "client-1",
    to_party_id: null, to_address: "client@example.com", subject: "Edited reminder", body: "Designer-edited reminder text",
    payload: {
      invoice_id: "invoice-1", step: 0, pay_url: "https://client.example.com/pay/token",
      invoice_number: "INV-1", balance_cents: 12500, due_date: "2026-11-01", currency: "USD",
      designer_name: "Ari", designer_email: "ari@example.com", client_user_id: "client-1",
      studio_name: "North Studio", studio_invoice: false,
    }, ref_type: "invoice", ref_id: "invoice-1", status: "sending", sent_by: null,
  } as OutboundDraft;
  const rendered = await renderEmail({ admin: {} as never, draft });
  assertEquals(rendered.html.includes("Designer-edited reminder text"), true);
  assertEquals(rendered.html.includes("View &amp; pay invoice"), true);
  assertEquals(rendered.html.includes("https://client.example.com/pay/token"), true);
  assertEquals(rendered.replyTo, "ari@example.com");
});

Deno.test("invoice reminder afterSend stamps cadence and sends first-step attention with authority", async () => {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const admin = {
    from(table: string) {
      return {
        update(values: unknown) {
          calls.push({ kind: `${table}.update`, args: values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert(values: unknown) {
          calls.push({ kind: `${table}.insert`, args: values });
          return Promise.resolve({ error: null });
        },
      };
    },
    rpc(name: string, args: unknown) {
      calls.push({ kind: name, args });
      return Promise.resolve({ error: null });
    },
  } as never;
  const draft = {
    id: "draft-1", organization_id: "studio-1", project_id: "project-1", kind: "invoice_reminder",
    channel: "email", recipient_kind: "client", to_contact_id: null, to_client_id: "client-1",
    to_party_id: null, to_address: "client@example.com", subject: "Reminder", body: "Reminder body",
    payload: {
      invoice_id: "invoice-1", step: 0, invoice_number: "INV-1", balance_cents: 12500,
      due_date: "2026-11-01", project_id: "project-1", client_user_id: "client-1", for_clause: " for Lake House",
    }, ref_type: "invoice", ref_id: "invoice-1", status: "sending", sent_by: null,
  } as OutboundDraft;
  await afterSend({ admin, draft, messageId: "mail-1", authority } as never);
  assertEquals(calls.some((call) => call.kind === "invoices.update" && (call.args as Record<string, unknown>).reminder_count === 1), true);
  assertEquals(calls.some((call) => call.kind === "notify_client_attention" && (call.args as Record<string, unknown>).p_authority === authority), true);
});
