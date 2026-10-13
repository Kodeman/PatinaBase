import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OutboundDraft } from "../outbound-send.ts";
import { afterSend, repairSentInvoiceReminder, renderEmail, renderInvoiceReminderEmail, stampInvoiceReminderCadence } from "./invoice_reminder.ts";

function invoiceAdmin(updates: Array<{ id: string; values: Record<string, unknown> }>): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "invoices") throw new Error(`Unexpected table ${table}`);
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, id: string) {
              if (column !== "id") throw new Error(`Unexpected filter ${column}`);
              updates.push({ id, values });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

Deno.test("a sent reminder repairs a missed stamp and advances the next cron stage", async () => {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const admin = invoiceAdmin(updates);
  const sentAt = "2026-10-12T15:00:00.000Z";

  const repaired = await repairSentInvoiceReminder(
    admin,
    { status: "sent", sent_at: sentAt },
    "invoice-1",
    1,
  );

  assertEquals(repaired, true);
  assertEquals(updates, [{
    id: "invoice-1",
    values: { reminder_count: 2, last_reminder_at: sentAt },
  }]);
  // The next cron selection reads reminder_count=2, the next stage after stage 1.
  assertEquals(updates[0].values.reminder_count, 2);
});

Deno.test("stamping the same stage twice is idempotent", async () => {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const admin = invoiceAdmin(updates);
  const sentAt = "2026-10-12T15:00:00.000Z";

  await stampInvoiceReminderCadence(admin, "invoice-1", 1, sentAt);
  await stampInvoiceReminderCadence(admin, "invoice-1", 1, sentAt);

  assertEquals(updates.map(({ values }) => values), [
    { reminder_count: 2, last_reminder_at: sentAt },
    { reminder_count: 2, last_reminder_at: sentAt },
  ]);
});

Deno.test("rendered invoice reminder email contains no automated wording", async () => {
  const rendered = await renderInvoiceReminderEmail({
    admin: {} as SupabaseClient,
    draft: {
      id: "draft-1",
      organization_id: "studio-1",
      project_id: null,
      kind: "invoice_reminder",
      channel: "email",
      recipient_kind: "client",
      to_contact_id: null,
      to_client_id: null,
      to_party_id: null,
      to_address: "client@example.test",
      subject: "Reminder from Studio",
      body: "A reminder from Studio about your invoice.",
      payload: { step: 1, pay_url: "https://client.example.test/pay", studio_name: "Studio" },
      ref_type: "invoice",
      ref_id: "invoice-1",
      status: "awaiting_review",
      sent_by: null,
    },
  });

  assertMatch(rendered.html, /Reminder from Studio/);
  assertEquals(/automat/i.test(`${rendered.html}\n${rendered.text}`), false);
});

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
  };
  const draft = {
    id: "draft-1", organization_id: "studio-1", project_id: "project-1", kind: "invoice_reminder",
    channel: "email", recipient_kind: "client", to_contact_id: null, to_client_id: "client-1",
    to_party_id: null, to_address: "client@example.com", subject: "Reminder", body: "Reminder body",
    payload: {
      invoice_id: "invoice-1", step: 0, invoice_number: "INV-1", balance_cents: 12500,
      due_date: "2026-11-01", project_id: "project-1", client_user_id: "client-1", for_clause: " for Lake House",
    }, ref_type: "invoice", ref_id: "invoice-1", status: "sending", sent_by: null,
  };
  await afterSend({ admin, draft, messageId: "mail-1", authority } as never);
  assertEquals(calls.some((call) => call.kind === "invoices.update" && (call.args as Record<string, unknown>).reminder_count === 1), true);
  assertEquals(calls.some((call) => call.kind === "notify_client_attention" && (call.args as Record<string, unknown>).p_authority === authority), true);
});
