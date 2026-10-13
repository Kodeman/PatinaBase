import { notifyClientAttention } from "../client-attention.ts";
import { buildInvoiceArEscalationEmail } from "../invoice-emails.ts";
import {
  ctaButton,
  escapeHtml,
  muted,
  paragraph,
  portalBaseFor,
  renderBrandedShell,
  spacer,
} from "../branded-email.ts";
import { sendCompliantEmail } from "../send-email.ts";
import type { SendAuthority } from "../send-authority.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { OutboundDraft } from "../outbound-send.ts";
import type { OutboundKindContext, OutboundEmailRender } from "./types.ts";

const FROM_ADDRESS = Deno.env.get("RESEND_FROM") ?? "hello@patina.cloud";
const CTA_LABELS = ["View & pay invoice", "Pay invoice", "Pay invoice now", "Pay invoice immediately"];

function value(payload: Record<string, unknown>, key: string): string | null {
  const result = payload[key];
  return typeof result === "string" ? result : null;
}

function numberValue(payload: Record<string, unknown>, key: string): number {
  const result = payload[key];
  return typeof result === "number" ? result : 0;
}

export async function renderInvoiceReminderEmail({ draft }: { admin: SupabaseClient; draft: OutboundDraft }): Promise<OutboundEmailRender> {
  const payload = draft.payload;
  const stage = numberValue(payload, "step");
  const payUrl = value(payload, "pay_url") ?? `${portalBaseFor("client")}/?invoice=${encodeURIComponent(draft.ref_id)}`;
  const body = escapeHtml(draft.body).replace(/\n/g, "<br>");
  const linkFallback = muted(`Can&rsquo;t click the button? Copy this link into your browser:<br><a href="${escapeHtml(payUrl)}" style="color:#4E7A66; text-decoration:underline; word-break:break-all;">${escapeHtml(payUrl)}</a>`);
  const html = renderBrandedShell({
    title: draft.subject ?? "Invoice reminder",
    audience: "client",
    preview: draft.body,
    eyebrow: stage === 0 ? "Payment due" : "Invoice",
    studioName: value(payload, "studio_name") ?? undefined,
    studioLogoUrl: value(payload, "studio_logo_url") ?? undefined,
    footerLinks: payload.studio_invoice === true ? [
      { label: "Your page", href: portalBaseFor("client") },
      { label: "Email preferences", href: `${portalBaseFor("client")}/preferences` },
    ] : undefined,
    body: [paragraph(body), spacer(6), ctaButton(payUrl, CTA_LABELS[stage] ?? "Pay invoice"), spacer(10), linkFallback].join(""),
  });
  return {
    html,
    text: draft.body,
    replyTo: value(payload, "designer_email") ?? undefined,
    from: FROM_ADDRESS,
    userId: value(payload, "client_user_id") ?? undefined,
  };
}

function authorityFrom(ctx: OutboundKindContext): SendAuthority {
  return (ctx as OutboundKindContext & { authority: SendAuthority }).authority;
}

export async function stampInvoiceReminderCadence(
  admin: SupabaseClient,
  invoiceId: string,
  stage: number,
  sentAt: string,
): Promise<void> {
  const { error } = await admin.from("invoices").update({
    reminder_count: stage + 1,
    last_reminder_at: sentAt,
  }).eq("id", invoiceId).lt("reminder_count", stage + 1);
  if (error) console.error("invoice reminder send stamp failed", invoiceId, error);
}

export async function repairSentInvoiceReminder(
  admin: SupabaseClient,
  draft: { status: string; sent_at: string | null },
  invoiceId: string,
  stage: number,
): Promise<boolean> {
  if (draft.status !== "sent" || !draft.sent_at) return false;
  await stampInvoiceReminderCadence(admin, invoiceId, stage, draft.sent_at);
  return true;
}

export async function afterSendInvoiceReminder(ctx: OutboundKindContext): Promise<void> {
  const { admin, draft } = ctx;
  const payload = draft.payload;
  const stage = numberValue(payload, "step");
  if (draft.delivered_at) {
    await stampInvoiceReminderCadence(admin, draft.ref_id, stage, draft.delivered_at);
  }

  if (stage === 0) {
    const clientId = value(payload, "client_user_id");
    if (clientId) {
      const attention = await notifyClientAttention(admin, {
        userId: clientId,
        entityType: "invoice",
        entityId: draft.ref_id,
        title: "An invoice is coming due",
        body: `Invoice ${value(payload, "invoice_number") ?? "Invoice"}${value(payload, "for_clause") ?? ""} is due soon.`,
        authority: authorityFrom(ctx),
        metadata: {
          project_id: value(payload, "project_id"),
          amount_cents: numberValue(payload, "balance_cents"),
          due_date: value(payload, "due_date"),
          reminder_stage: stage,
          // 00785: one client push per outbound draft, however often this hook runs.
          idempotency_key: `outbound-draft-${draft.id}`,
        },
      });
      if (!attention.ok) console.warn("invoice reminder client attention failed", draft.ref_id, attention.error);
    }
  }

  if (stage === 1) {
    const { error } = await admin.from("notification_log").insert({
      user_id: value(payload, "designer_id"), type: "invoice_overdue", channel: "in_app", status: "delivered",
      template_id: "invoice-overdue-designer",
      metadata: {
        invoice_id: draft.ref_id, project_id: value(payload, "project_id"),
        subject: `Invoice ${value(payload, "invoice_number") ?? "Invoice"} is past due`,
        message: `Invoice ${value(payload, "invoice_number") ?? "Invoice"}${value(payload, "for_clause") ?? ""} is past due. A reminder from ${value(payload, "studio_name") ?? "the studio"} was sent to the client.`,
        deep_link: "/desk?book=accounts&page=receivables",
      },
    });
    if (error) console.error("invoice overdue designer notice failed", draft.ref_id, error);
  }

  if (stage === 3) await escalateInvoiceToDesigner(ctx);
}

async function escalateInvoiceToDesigner({ admin, draft }: OutboundKindContext): Promise<void> {
  const payload = draft.payload;
  const { error: flagError } = await admin.from("invoices").update({ ar_flagged_at: new Date().toISOString() })
    .eq("id", draft.ref_id).is("ar_flagged_at", null);
  if (flagError) {
    console.error("invoice reminder A/R flag failed", draft.ref_id, flagError);
    return;
  }
  const designerId = value(payload, "designer_id");
  const invoiceNumber = value(payload, "invoice_number") ?? "Invoice";
  const daysOverdue = Math.max(0, Math.floor((Date.now() - Date.parse(`${value(payload, "due_date")}T00:00:00Z`)) / 86_400_000));
  const arUrl = `${(Deno.env.get("DESIGNER_PORTAL_URL") ?? "https://app.patina.cloud").replace(/\/$/, "")}/desk?book=accounts&page=receivables`;
  if (designerId) {
    const { error } = await admin.from("notification_log").insert({
      user_id: designerId, type: "invoice_ar_flagged", channel: "in_app", status: "delivered",
      template_id: "invoice-ar-flagged",
      metadata: {
        invoice_id: draft.ref_id, project_id: value(payload, "project_id"),
        subject: `${invoiceNumber} is ${daysOverdue}+ days overdue — reminders exhausted`,
        message: `Invoice ${invoiceNumber}${value(payload, "for_clause") ?? ""} is ${daysOverdue}+ days overdue. The reminders are complete — it needs direct follow-up.`,
        deep_link: "/desk?book=accounts&page=receivables",
      },
    });
    if (error) console.error("invoice A/R escalation notice failed", draft.ref_id, error);
  }
  const designerEmail = value(payload, "designer_email");
  if (!designerEmail) return;
  const rendered = buildInvoiceArEscalationEmail({
    invoiceNumber,
    projectName: value(payload, "project_name"),
    clientName: value(payload, "client_name"),
    designerName: value(payload, "designer_name"),
    balanceCents: numberValue(payload, "balance_cents"),
    dueDate: value(payload, "due_date"),
    daysOverdue,
    arUrl,
    currency: value(payload, "currency") ?? undefined,
  });
  try {
    const result = await sendCompliantEmail(admin, {
      authority: { kind: "exempt", reason: "internal" },
      to: designerEmail, subject: rendered.subject, html: rendered.html,
      userId: designerId ?? undefined, notificationType: "invoice_ar_flagged",
      category: "operational", templateId: "invoice-ar-escalation",
      // One escalation email per outbound draft, however often this hook runs.
      idempotencyKey: `invoice-ar-escalation-${draft.id}`,
      metadata: { invoice_id: draft.ref_id, project_id: value(payload, "project_id"), subject: rendered.subject, deep_link: "/desk?book=accounts&page=receivables" },
    });
    if (!result.success && !result.suppressed) console.error("invoice A/R escalation email failed", draft.ref_id, result.error);
  } catch (error) {
    console.error("invoice A/R escalation email threw", draft.ref_id, error);
  }
}

export async function renderEmail(ctx: { admin: SupabaseClient; draft: OutboundDraft }): Promise<OutboundEmailRender> {
  return renderInvoiceReminderEmail(ctx);
}

export async function afterSend(ctx: OutboundKindContext): Promise<void> {
  await afterSendInvoiceReminder(ctx);
}
