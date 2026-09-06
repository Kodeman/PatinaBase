/**
 * "I'm mailing you a check." — the body of invoice-check-intent, lifted so the
 * guest rail (invoice-link-checkout, 00574) shares it byte for byte.
 *
 * Deliberately NOT done here:
 *   • no invoice_payments row — a stated intention is not money. Writing a
 *     pending row would corrupt the balance, the A/R cadence, and earnings.
 *   • no invoice status change — the invoice stays sent / partially_paid.
 *   • no Stripe anything.
 *
 * Idempotency: a designer notification_log row of type 'invoice_check_intent'
 * for this invoice within the last 24h short-circuits to alreadyNotified. A
 * double-clicked button, a refresh, or an honest second thought the same day
 * costs the designer exactly one notice. Both the in_app row written here and
 * the email row sendCompliantEmail writes carry the type, so either closes the
 * window — and it bounds guest-triggered designer email on the link rail.
 *
 * The caller has already proved the invoice is payable (sent / partially_paid,
 * balance > 0) and that the actor may speak for it.
 */

// deno-lint-ignore-file no-explicit-any

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from './send-email.ts';
import { buildCheckIntentEmail } from './invoice-emails.ts';
import { invoiceDeskName, invoiceSubjectName } from './invoice-subject.ts';

/** How long one stated intent suppresses a repeat notice. */
export const CHECK_INTENT_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const CHECK_INTENT_NOTIFICATION_TYPE = 'invoice_check_intent';

export interface CheckIntentInvoice {
  id: string;
  designer_id: string;
  client_id: string | null;
  // NULL on a studio invoice — an invoice drawn for a household with no house.
  project_id: string | null;
  studio_id: string | null;
  title: string | null;
  invoice_number: string | null;
  status: string;
  currency: string;
  total_cents: number;
  amount_paid_cents: number;
  project: { id: string; name: string; client_id: string | null } | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: {
    id: string;
    full_name: string | null;
    business_name: string | null;
    email: string | null;
  } | null;
}

/** The PostgREST select that loads a CheckIntentInvoice. */
export const CHECK_INTENT_INVOICE_SELECT = `
      id, designer_id, client_id, project_id, studio_id, title, invoice_number, status,
      currency, total_cents, amount_paid_cents,
      project:projects!invoices_project_id_fkey(id, name, client_id),
      client:profiles!invoices_client_id_fkey(id, full_name, email),
      designer:profiles!invoices_designer_id_fkey(id, full_name, business_name, email)
    `;

export type CheckIntentOutcome =
  | {
      ok: true;
      invoiceId: string;
      alreadyNotified: boolean;
      emailSent: boolean;
      suppressed: boolean;
    }
  | { ok: false; error: 'notification_failed'; detail: string };

export interface CheckIntentNoticeRow {
  user_id: string;
  type: string;
  channel: 'in_app';
  status: 'delivered';
  template_id: 'invoice-check-intent';
  metadata: Record<string, unknown>;
}

export interface CheckIntentEmailSend {
  to: string;
  subject: string;
  html: string;
  userId: string;
  metadata: Record<string, unknown>;
}

/** The three side effects, injectable so the core unit-tests offline. */
export interface CheckIntentDeps {
  /** True when a notice exists inside the window; null when the read failed. */
  priorNoticeExists(designerId: string, invoiceId: string, sinceIso: string): Promise<boolean | null>;
  insertNotice(row: CheckIntentNoticeRow): Promise<{ error: { message: string } | null }>;
  sendDesignerEmail(
    send: CheckIntentEmailSend
  ): Promise<{ success?: boolean; suppressed?: boolean; error?: unknown }>;
  now?: () => number;
}

/** The production wiring: notification_log through the service client, email through the chokepoint. */
export function checkIntentDepsFor(admin: SupabaseClient): CheckIntentDeps {
  return {
    async priorNoticeExists(designerId, invoiceId, sinceIso) {
      const { data, error } = await admin
        .from('notification_log')
        .select('id')
        .eq('user_id', designerId)
        .eq('type', CHECK_INTENT_NOTIFICATION_TYPE)
        .gte('created_at', sinceIso)
        .filter('metadata->>invoice_id', 'eq', invoiceId)
        .limit(1);
      if (error) {
        console.error('invoice-check-intent: idempotency read failed', error);
        return null;
      }
      return (data ?? []).length > 0;
    },
    async insertNotice(row) {
      const { error } = await admin.from('notification_log').insert(row);
      return { error: error ? { message: error.message } : null };
    },
    async sendDesignerEmail(send) {
      return await sendCompliantEmail(admin, {
        to: send.to,
        subject: send.subject,
        html: send.html,
        userId: send.userId,
        notificationType: CHECK_INTENT_NOTIFICATION_TYPE,
        category: 'operational',
        templateId: 'invoice-check-intent',
        metadata: send.metadata,
      });
    },
  };
}

export async function runInvoiceCheckIntent(
  invoice: CheckIntentInvoice,
  opts: {
    designerPortalUrl: string;
    deps: CheckIntentDeps;
    /**
     * The guest/link rail's resolved display name (F14) — the household
     * profile's name, else the designer's email-only roster name. The payer
     * rail leaves this unset; invoice.client already names the payer there.
     */
    clientDisplayName?: string | null;
  }
): Promise<CheckIntentOutcome> {
  const { deps } = opts;
  const now = deps.now ?? Date.now;
  const balanceCents = (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0);

  const invoiceNumber = invoice.invoice_number ?? 'Invoice';
  const projectName = invoiceSubjectName(invoice, null);
  // The designer's own line must lead with something; her letter's "for …"
  // clause simply closes early when the invoice names nothing.
  const deskName = invoiceDeskName(invoice);
  const clientName =
    opts.clientDisplayName?.trim() || invoice.client?.full_name?.trim() || 'Your client';
  const designerName =
    invoice.designer?.full_name?.trim() || invoice.designer?.business_name?.trim() || null;
  const folioUrl = `${opts.designerPortalUrl}/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`;

  // ── Idempotency ────────────────────────────────────────────────────────
  // Anchored on the designer's own notification history rather than a new
  // table: the notice IS the artifact, so its existence is the fact worth
  // checking. A read failure must not double-notify OR block the client: fall
  // through and send. A duplicate notice is a smaller harm than a silent dead
  // end.
  const since = new Date(now() - CHECK_INTENT_IDEMPOTENCY_WINDOW_MS).toISOString();
  const prior = await deps.priorNoticeExists(invoice.designer_id, invoice.id, since);
  if (prior === true) {
    return {
      ok: true,
      invoiceId: invoice.id,
      alreadyNotified: true,
      emailSent: false,
      suppressed: false,
    };
  }

  // ── The in-app notice (the artifact the designer actually sees) ────────
  // Written FIRST and fail-closed: if this row doesn't land, the client is told
  // the message didn't get through and can try again. The email below is the
  // nicety, not the record.
  const subject = `A check is on the way — ${invoiceNumber}`;
  const balanceLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: invoice.currency || 'USD',
  }).format(balanceCents / 100);

  const { error: notifyErr } = await deps.insertNotice({
    user_id: invoice.designer_id,
    type: CHECK_INTENT_NOTIFICATION_TYPE,
    channel: 'in_app',
    status: 'delivered',
    template_id: 'invoice-check-intent',
    metadata: {
      invoice_id: invoice.id,
      project_id: invoice.project_id,
      amount_cents: balanceCents,
      subject,
      message: `${deskName}: ${clientName} is mailing a check for ${balanceLabel} toward ${invoiceNumber}. Record it when it arrives.`,
      deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
    },
  });
  if (notifyErr) {
    console.error('invoice-check-intent: notification insert failed', notifyErr);
    return { ok: false, error: 'notification_failed', detail: notifyErr.message };
  }

  // ── The email (best effort) ────────────────────────────────────────────
  // A missing designer email, a suppressed address, or a Resend outage must not
  // turn into an error for the client, who has already been told their designer
  // knows — the in_app row above makes that true.
  let emailSent = false;
  let suppressed = false;
  const designerEmail = invoice.designer?.email ?? null;
  if (designerEmail) {
    try {
      const rendered = buildCheckIntentEmail({
        invoiceNumber,
        projectName,
        designerName,
        clientName,
        balanceCents,
        portalUrl: folioUrl,
        currency: invoice.currency,
      });
      const sendResult = await deps.sendDesignerEmail({
        to: designerEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: invoice.designer_id,
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          amount_cents: balanceCents,
          subject: rendered.subject,
          message: `${clientName} is mailing a check for ${balanceLabel} toward ${invoiceNumber}.`,
          deep_link: `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`,
        },
      });
      emailSent = sendResult.success === true;
      suppressed = sendResult.suppressed === true;
      if (!emailSent && !suppressed) {
        console.error('invoice-check-intent: designer email failed', sendResult.error);
      }
    } catch (err) {
      // e.g. RESEND_API_KEY missing locally without EMAIL_DEV_MODE.
      console.error(
        'invoice-check-intent: designer email threw',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn('invoice-check-intent: designer has no email', invoice.designer_id);
  }

  return {
    ok: true,
    invoiceId: invoice.id,
    alreadyNotified: false,
    emailSent,
    suppressed,
  };
}
