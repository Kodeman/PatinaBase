// Supabase Edge Function: invoice-reminders
//
// DELIBERATELY EXEMPT FROM reminder_cadence. Unlike proposal-nudge and the
// decision-reminders spine — both gated by decision-notify.ts's
// CADENCE_ELIGIBLE_KINDS check against the client's reminder_cadence
// preference, with deferred sends picked up by notification-digest/index.ts
// — the A/R reminders sent below always go out immediately, on every run,
// with no digest-deferral path at all.
//
// Ruling: payment prompts are financially consequential. Deferring an
// overdue-invoice or final-notice email by up to a day to satisfy a client's
// "daily summary" reminder_cadence preference would directly hurt
// collections. This is a deliberate product decision, not a gap — do not
// wire this function into reminder_cadence (or otherwise make A/R reminders
// digest-eligible) without a new product ruling superseding this one.
//
// Runs daily (scheduled by pg_cron in migration 00181, 15:00 UTC). Direct
// mirror of decision-reminders: service-role client, scan, send, stamp, JSON
// summary.
//
// A/R reminder cadence (offsets vs invoices.due_date, indexed by
// invoices.reminder_count):
//
//   reminder_count 0 → due_date − 3   upcoming-due nudge
//   reminder_count 1 → due_date + 1   overdue notice (+ designer in-app row)
//   reminder_count 2 → due_date + 7   second notice
//   reminder_count 3 → due_date + 14  final notice → stamp ar_flagged_at +
//                                     designer escalation email/in-app row
//
// Send when today >= due_date + offsets[reminder_count]. On a successful send
// reminder_count++ and last_reminder_at = now. ONE client email per invoice
// per run, max — a long-lapsed invoice catches up one stage per day instead
// of burst-sending every missed stage (decision-reminders semantics).
//
// Unsent rows (suppressed / rate-capped / no recipient) stay UNSTAMPED so the
// next run retries once the gate clears — also decision-reminders semantics.
//
// Once ar_flagged_at is stamped the invoice leaves the scan entirely (the
// `ar_flagged_at IS NULL` guard): automated client emails stop and follow-up
// becomes a human job, surfaced on the designer A/R page
// (/desk?book=accounts&page=receivables). Recording a payment flips status to
// partially_paid/paid via apply_invoice_payment_effects, which also ends the
// cadence for paid invoices (status guard).
//
// Recipient resolution mirrors invoice-send: invoice.client_id profile →
// project.client_id profile → designer_clients.client_email fallback.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { notifyClientAttention } from '../_shared/client-attention.ts';
import {
  buildInvoiceArEscalationEmail,
  buildInvoiceFinalNoticeEmail,
  buildInvoiceOverdueNoticeEmail,
  buildInvoiceSecondNoticeEmail,
  buildInvoiceUpcomingReminderEmail,
  type InvoiceReminderEmailParams,
  type RenderedInvoiceEmail,
} from '../_shared/invoice-emails.ts';
import { resolveStudioIdentity, studioCobrand } from '../_shared/studio-identity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
const DESIGNER_PORTAL_URL = Deno.env.get('DESIGNER_PORTAL_URL') ?? 'https://app.patina.cloud';

/** Day offsets vs due_date, indexed by reminder_count. */
const REMINDER_OFFSET_DAYS = [-3, 1, 7, 14];

const STAGE_BUILDERS: Array<(p: InvoiceReminderEmailParams) => RenderedInvoiceEmail> = [
  buildInvoiceUpcomingReminderEmail,
  buildInvoiceOverdueNoticeEmail,
  buildInvoiceSecondNoticeEmail,
  buildInvoiceFinalNoticeEmail,
];

const STAGE_TEMPLATE_IDS = [
  'invoice-reminder-upcoming',
  'invoice-reminder-overdue',
  'invoice-reminder-second-notice',
  'invoice-reminder-final-notice',
];

interface InvoiceRow {
  id: string;
  designer_id: string;
  client_id: string | null;
  project_id: string;
  invoice_number: string | null;
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  currency: string;
  due_date: string; // DATE — scan excludes NULL
  reminder_count: number;
  last_reminder_at: string | null;
  project: { id: string; name: string; client_id: string | null } | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: {
    id: string;
    full_name: string | null;
    business_name: string | null;
    email: string | null;
  } | null;
}

/** Whole days from due_date (DATE) to today, UTC-pinned. Negative = not yet due. */
function daysPastDue(dueDate: string, now: Date): number {
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - due) / 86_400_000);
}

/**
 * Recipient resolution — same chain as invoice-send: invoice.client profile →
 * project.client_id profile → designer_clients.client_email fallback.
 */
async function resolveRecipient(admin: any, invoice: InvoiceRow) {
  const clientUserId = invoice.client_id ?? invoice.project?.client_id ?? null;

  let recipientEmail: string | null = invoice.client?.email ?? null;
  let recipientName: string | null = invoice.client?.full_name ?? null;

  if (!recipientEmail && clientUserId && clientUserId !== invoice.client_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', clientUserId)
      .maybeSingle();
    recipientEmail = (profile as any)?.email ?? null;
    recipientName = (profile as any)?.full_name ?? recipientName;
  }

  if (!recipientEmail && clientUserId) {
    const { data: dc } = await admin
      .from('designer_clients')
      .select('client_email, client_name')
      .eq('designer_id', invoice.designer_id)
      .eq('client_id', clientUserId)
      .maybeSingle();
    recipientEmail = (dc as any)?.client_email ?? null;
    recipientName = recipientName ?? (dc as any)?.client_name ?? null;
  }

  return { clientUserId, recipientEmail, recipientName };
}

/**
 * Escalation leg: stamp ar_flagged_at (kills future client emails even if the
 * designer email below hiccups), then email the designer + write an in-app
 * notification_log row. Idempotence comes from the ar_flagged_at IS NULL scan
 * guard — once stamped, the invoice never re-enters this function.
 */
async function escalateToDesigner(
  admin: any,
  invoice: InvoiceRow,
  recipientName: string | null,
  overdueDays: number,
): Promise<{ flagged: boolean; designerEmailSent: boolean }> {
  const nowIso = new Date().toISOString();

  const { error: flagErr } = await admin
    .from('invoices')
    .update({ ar_flagged_at: nowIso })
    .eq('id', invoice.id)
    .is('ar_flagged_at', null);
  if (flagErr) {
    console.error('invoice-reminders: failed to stamp ar_flagged_at', invoice.id, flagErr);
    // Don't escalate off an unflagged row — the next run will retry the flag.
    return { flagged: false, designerEmailSent: false };
  }

  const invoiceNumber = invoice.invoice_number ?? 'Invoice';
  const projectName = invoice.project?.name ?? 'your project';
  const balanceCents = Math.max(
    (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0),
    0,
  );
  const designerName =
    invoice.designer?.full_name?.trim() || invoice.designer?.business_name?.trim() || null;
  const arUrl = `${DESIGNER_PORTAL_URL}/desk?book=accounts&page=receivables`;
  const subjectLine = `${invoiceNumber} is ${overdueDays}+ days overdue — automated reminders exhausted`;

  // In-app visibility row for the designer (the portal inbox surfaces
  // notification_log rows; metadata.subject/message/deep_link drive rendering).
  const { error: logErr } = await admin.from('notification_log').insert({
    user_id: invoice.designer_id,
    type: 'invoice_ar_flagged',
    channel: 'in_app',
    status: 'delivered',
    template_id: 'invoice-ar-flagged',
    metadata: {
      invoice_id: invoice.id,
      project_id: invoice.project_id,
      subject: subjectLine,
      message: `Invoice ${invoiceNumber} for ${projectName} is ${overdueDays}+ days overdue. Automated reminders are exhausted — it needs direct follow-up.`,
      deep_link: '/desk?book=accounts&page=receivables',
    },
  });
  if (logErr) {
    console.error('invoice-reminders: failed to write escalation in-app row', invoice.id, logErr);
  }

  let designerEmailSent = false;
  const designerEmail = invoice.designer?.email ?? null;
  if (designerEmail) {
    const rendered = buildInvoiceArEscalationEmail({
      invoiceNumber,
      projectName,
      clientName: recipientName,
      designerName,
      balanceCents,
      dueDate: invoice.due_date,
      daysOverdue: overdueDays,
      arUrl,
      currency: invoice.currency,
    });
    try {
      const result = await sendCompliantEmail(admin, {
        to: designerEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: invoice.designer_id,
        notificationType: 'invoice_ar_flagged',
        category: 'operational',
        templateId: 'invoice-ar-escalation',
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          subject: rendered.subject,
          deep_link: '/desk?book=accounts&page=receivables',
        },
      });
      designerEmailSent = result.success === true;
      if (!result.success && !result.suppressed) {
        console.error('invoice-reminders: escalation email failed', invoice.id, result.error);
      }
    } catch (err) {
      console.error('invoice-reminders: escalation email threw', invoice.id, err);
    }
  } else {
    console.warn('invoice-reminders: no designer email for escalation', invoice.id);
  }

  return { flagged: true, designerEmailSent };
}

Deno.serve(async (_req: Request) => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  // Scan: open receivables with a due date that have not been A/R-flagged.
  const { data, error } = await admin
    .from('invoices')
    .select(
      `
      id, designer_id, client_id, project_id, invoice_number, status,
      total_cents, amount_paid_cents, currency, due_date,
      reminder_count, last_reminder_at,
      project:projects!invoices_project_id_fkey(id, name, client_id),
      client:profiles!invoices_client_id_fkey(id, full_name, email),
      designer:profiles!invoices_designer_id_fkey(id, full_name, business_name, email)
    `,
    )
    .in('status', ['sent', 'partially_paid'])
    .not('due_date', 'is', null)
    .is('ar_flagged_at', null);

  if (error) {
    console.error('invoice-reminders: query failed', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const invoices = (data ?? []) as unknown as InvoiceRow[];
  let sent = 0;
  let escalated = 0;
  let notDue = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const stage = invoice.reminder_count;
    const overdueDays = daysPastDue(invoice.due_date, now);

    // Recovery path: the cadence is exhausted (4 reminders out) but the flag
    // never landed — e.g. the stamp UPDATE failed last run. Escalate without
    // another client email.
    if (stage >= REMINDER_OFFSET_DAYS.length) {
      const { recipientName } = await resolveRecipient(admin, invoice);
      const { flagged } = await escalateToDesigner(admin, invoice, recipientName, overdueDays);
      if (flagged) escalated++;
      else skipped++;
      continue;
    }

    // Cadence gate: today must have reached due_date + offsets[stage].
    if (overdueDays < REMINDER_OFFSET_DAYS[stage]) {
      notDue++;
      continue;
    }

    const { clientUserId, recipientEmail, recipientName } = await resolveRecipient(
      admin,
      invoice,
    );

    if (!recipientEmail) {
      // No address anywhere in the chain — leave unstamped so a later run can
      // retry once the client record gains an email.
      skipped++;
      console.warn('invoice-reminders: no recipient email for invoice', invoice.id);
      continue;
    }

    const invoiceNumber = invoice.invoice_number ?? 'Invoice';
    const projectName = invoice.project?.name ?? 'your project';
    const designerName =
      invoice.designer?.full_name?.trim() ||
      invoice.designer?.business_name?.trim() ||
      'Your designer';
    const balanceCents = Math.max(
      (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0),
      0,
    );

    // Studio co-brand (Designer Studios): the invoice's project resolves the
    // studio brand for the client-facing reminder shell.
    const identity = await resolveStudioIdentity(admin, {
      projectId: invoice.project_id,
      designerId: invoice.designer_id,
    });
    const cobrand = studioCobrand(identity);

    const rendered = STAGE_BUILDERS[stage]({
      invoiceNumber,
      projectName,
      designerName,
      clientName: recipientName,
      balanceCents,
      dueDate: invoice.due_date,
      portalUrl: `${CLIENT_PORTAL_URL}/invoices/${invoice.id}`,
      currency: invoice.currency,
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
    });

    let sendResult;
    try {
      sendResult = await sendCompliantEmail(admin, {
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: clientUserId ?? undefined,
        notificationType: 'invoice_reminder',
        category: 'operational',
        templateId: STAGE_TEMPLATE_IDS[stage],
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          reminder_stage: stage,
          subject: rendered.subject,
          message: `Reminder ${stage + 1} of ${REMINDER_OFFSET_DAYS.length}: invoice ${invoiceNumber} for ${projectName}.`,
          deep_link: `/invoices/${invoice.id}`,
        },
      });
    } catch (err) {
      console.error('invoice-reminders: send threw', invoice.id, err);
      skipped++;
      continue;
    }

    if (!sendResult.success) {
      // Suppressed / rate-capped / provider failure — leave the row unstamped
      // so the next run retries this stage (decision-reminders semantics).
      skipped++;
      if (sendResult.error && sendResult.error !== 'email_suppressed') {
        console.warn('invoice-reminders: send failed', invoice.id, sendResult.error);
      }
      continue;
    }

    sent++;

    // Stamp progress: this stage is done; the next run evaluates stage+1.
    const { error: stampErr } = await admin
      .from('invoices')
      .update({
        reminder_count: stage + 1,
        last_reminder_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);
    if (stampErr) {
      console.error('invoice-reminders: failed to stamp reminder', invoice.id, stampErr);
      // Don't escalate off an unstamped row — without the stamp the invoice
      // would re-send this stage next run, so flagging now could double-fire.
      continue;
    }

    // The client's bell, FIRST STAGE ONLY (SP-08). Stage 0 is the due-3
    // upcoming-due nudge; the later three stages are a dunning cadence and do
    // not earn a push each. The in-app row de-duplicates on the invoice id
    // anyway, so a later stage could only refresh a line the client has already
    // been shown. Best-effort — the email has already gone.
    if (stage === 0 && clientUserId) {
      const attention = await notifyClientAttention(admin, {
        userId: clientUserId,
        entityType: 'invoice',
        entityId: invoice.id,
        title: 'An invoice is coming due',
        body: `Invoice ${invoiceNumber} for ${projectName} is due soon.`,
        metadata: {
          project_id: invoice.project_id,
          amount_cents: invoice.total_cents,
          due_date: invoice.due_date,
          reminder_stage: stage,
        },
      });
      if (!attention.ok) {
        console.warn('invoice-reminders: client attention not delivered', invoice.id, attention.error);
      }
    }

    // At the +1 overdue notice, give the DESIGNER in-app visibility that a
    // receivable has gone past due (email cadence stays client-only here).
    if (stage === 1) {
      const { error: logErr } = await admin.from('notification_log').insert({
        user_id: invoice.designer_id,
        type: 'invoice_overdue',
        channel: 'in_app',
        status: 'delivered',
        template_id: 'invoice-overdue-designer',
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          subject: `Invoice ${invoiceNumber} is past due`,
          message: `Invoice ${invoiceNumber} for ${projectName} is past due. An automated overdue notice was sent to the client.`,
          deep_link: '/desk?book=accounts&page=receivables',
        },
      });
      if (logErr) {
        console.error('invoice-reminders: failed to write overdue in-app row', invoice.id, logErr);
      }
    }

    // Final notice just went out → exhausted: flag for A/R + tell the designer.
    if (stage === REMINDER_OFFSET_DAYS.length - 1) {
      const { flagged } = await escalateToDesigner(admin, invoice, recipientName, overdueDays);
      if (flagged) escalated++;
    }
  }

  return new Response(
    JSON.stringify({ scanned: invoices.length, sent, escalated, notDue, skipped }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
