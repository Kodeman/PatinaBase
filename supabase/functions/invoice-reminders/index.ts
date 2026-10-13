// Supabase Edge Function: invoice-reminders
//
// V22: invoice reminders are composed as outbound drafts. They are sent only
// by designer action or the studio's explicit per-kind schedule setting.
//
// Runs daily (scheduled by pg_cron in migration 00181, 15:00 UTC). It keeps the
// existing selection and escalation cadence while staging client reminders.
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
import { sendOutboundDraft } from '../_shared/outbound-send.ts';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { repairSentInvoiceReminder } from '../_shared/outbound-kinds/invoice_reminder.ts';
import {
  buildInvoiceArEscalationEmail,
  buildInvoiceFinalNoticeEmail,
  buildInvoiceOverdueNoticeEmail,
  buildInvoiceSecondNoticeEmail,
  buildInvoiceUpcomingReminderEmail,
  formatInvoiceEmailDate,
  type InvoiceReminderEmailParams,
  type RenderedInvoiceEmail,
} from '../_shared/invoice-emails.ts';
import { resolveStudioIdentity, studioCobrand } from '../_shared/studio-identity.ts';
import {
  invoiceBrandingRef,
  invoiceForClause,
  invoiceSubjectName,
} from '../_shared/invoice-subject.ts';
import { invoiceLettersMustHold, letterPortalUrl } from '../_shared/invoice-links.ts';

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

interface InvoiceRow {
  id: string;
  designer_id: string;
  client_id: string | null;
  // NULL on a studio invoice — an invoice drawn for a household with no house.
  project_id: string | null;
  studio_id: string | null;
  title: string | null;
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

async function isClientSuppressed(admin: any, clientUserId: string | null): Promise<boolean> {
  if (!clientUserId) return false;
  const { data, error } = await admin
    .from('profiles')
    .select('email_suppressed')
    .eq('id', clientUserId)
    .maybeSingle();
  if (error) throw error;
  return data?.email_suppressed === true;
}

function reminderBody(stage: number, params: InvoiceReminderEmailParams): string {
  const greeting = `Hi ${params.clientName?.trim() || 'there'},`;
  const invoice = params.invoiceNumber;
  const designer = params.designerName;
  const project = params.projectName ? ` for ${params.projectName}` : '';
  const due = formatInvoiceEmailDate(params.dueDate) ?? '';
  const facts = [
    `Invoice: ${params.invoiceNumber}`,
    `Balance due: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: params.currency ?? 'USD' }).format(params.balanceCents / 100)}`,
    due ? `Due date: ${due}` : '',
  ].filter(Boolean).join('\n');
  const messages = [
    `Just a friendly reminder that ${designer}’s invoice${project} is coming due.\n\n${facts}\n\nIf you’ve already arranged payment, you can disregard this note.`,
    `Invoice ${invoice} from ${designer}${project} is still open.\n\n${facts}\n\nWhen you have a moment, please settle the balance so the work can carry on without interruption.\n\nIf payment is already on its way, thank you — no further action is needed.`,
    `This is a second notice that invoice ${invoice} from ${designer}${project} is still open, a week on from its due date.\n\n${facts}\n\nPlease arrange payment promptly. If something about this invoice looks off, reply to this email or reach out to ${designer} directly so it can be sorted out.`,
    `This is the final reminder for invoice ${invoice} from ${designer}${project}, now two weeks on from its due date.\n\n${facts}\n\nImmediate payment is required. The outstanding balance has been flagged for direct follow-up by ${designer}, and continued non-payment may pause work already under way.`,
  ];
  return `${greeting}\n\n${messages[stage]}`;
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
  const projectName = invoiceSubjectName(invoice, null);
  const forClause = invoiceForClause(invoice);
  const balanceCents = Math.max(
    (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0),
    0,
  );
  const designerName =
    invoice.designer?.full_name?.trim() || invoice.designer?.business_name?.trim() || null;
  const arUrl = `${DESIGNER_PORTAL_URL}/desk?book=accounts&page=receivables`;
  const subjectLine = `${invoiceNumber} is ${overdueDays}+ days overdue — reminders exhausted`;

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
      message: `Invoice ${invoiceNumber}${forClause} is ${overdueDays}+ days overdue. The reminders are complete — it needs direct follow-up.`,
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
        authority: { kind: 'exempt', reason: 'internal' },
        to: designerEmail,
        subject: rendered.subject,
        html: rendered.html,
        userId: invoice.designer_id,
        notificationType: 'invoice_ar_flagged',
        category: 'operational',
        templateId: 'invoice-ar-escalation',
        // No `ref`: this is a notice TO the studio about the invoice, not the
        // invoice's delivery record. The A/R page reads the latest row per
        // invoice, so a delivered escalation would mask a bounced client copy.
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
      id, designer_id, client_id, project_id, studio_id, title, invoice_number, status,
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

  // AN INVOICE MID-PAYMENT IS NOT DUNNED (W4 r6 MAJOR-1).
  //
  // `ensure_invoice_link` answers NULL while a Checkout is in flight, and for
  // 24 hours after an attempt whose return rode `/pay/return/<nonce>`
  // finalized, rather than pulling the address out from under the payer. A
  // reminder built on that NULL carries the signed-in fallback instead of a
  // pay address. Holding the letter is the honest answer: someone who is
  // paying this invoice right now — or who just watched a card decline and is
  // about to retry from the address in their inbox — is not someone to chase.
  // They re-enter the scan when the window closes.
  //
  // THE SCAN ASKS THE GUARD ITSELF (R-BZ, W4 r10 MAJOR-1). Re-listing three of
  // its states here is how this rail came to disagree with it: a declined card
  // was dunned inside the day, with the letterbox address, to an account-less
  // payer. `invoice_letters_must_hold` is that one predicate, batched.
  const heldInvoiceIds = new Set<string>();
  for (let i = 0; i < invoices.length; i += 200) {
    const ids = invoices.slice(i, i + 200).map((row) => row.id);
    const { held, readable } = await invoiceLettersMustHold(admin, ids);
    if (!readable) {
      // Fail closed for the whole pass: an unread predicate cannot tell us
      // which invoices are mid-payment, and the cron comes back in an hour.
      console.error('invoice-reminders: checkout-attempt scan failed');
      return new Response(
        JSON.stringify({ error: 'checkout_attempt_scan_failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    for (const id of held) heldInvoiceIds.add(id);
  }

  if (heldInvoiceIds.size > 0) {
    // One line, naming why: these ids are not "skipped", they are being paid.
    console.log(
      'invoice-reminders: holding — mid-payment or inside the return window (invoice_letter_must_hold)',
      [...heldInvoiceIds].join(','),
    );
  }

  let sentCount = 0;
  let drafted = 0;
  let escalated = 0;
  let notDue = 0;
  let skipped = 0;
  let heldMidPayment = 0;

  for (const invoice of invoices) {
    if (heldInvoiceIds.has(invoice.id)) {
      heldMidPayment++;
      continue;
    }

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
    try {
      if (await isClientSuppressed(admin, clientUserId)) {
        skipped++;
        continue;
      }
    } catch (err) {
      skipped++;
      console.warn('invoice-reminders: client suppression lookup failed', invoice.id, err);
      continue;
    }

    const invoiceNumber = invoice.invoice_number ?? 'Invoice';
    // null, not a stand-in phrase: a rung with nothing to name drops its
    // "for …" clause rather than saying "for your studio" to the client.
    const projectName = invoiceSubjectName(invoice, null);
    const forClause = invoiceForClause(invoice);
    const designerName =
      invoice.designer?.full_name?.trim() ||
      invoice.designer?.business_name?.trim() ||
      'Your designer';
    const balanceCents = Math.max(
      (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0),
      0,
    );

    // Studio co-brand (Designer Studios): the invoice's own studio resolves the
    // brand for the client-facing reminder shell — a studio invoice has no
    // project to read it from, and a two-studio designer's primary studio would
    // be the wrong letterhead.
    const identity = await resolveStudioIdentity(admin, invoiceBrandingRef(invoice));
    const cobrand = studioCobrand(identity);

    // K1: the reminder carries the invoice's own address — `/pay/<token>`
    // opens for anyone holding it, signed in or not. A null (draft, void, or a
    // failed mint) falls back to the signed-in `/?invoice=<id>` letterbox — a
    // page that exists, which `/invoices/<id>` is not (W4 r6 MAJOR-1). The one
    // null this scan would otherwise meet routinely, a Checkout standing on
    // the address, is held above instead of written to. The link is re-asked
    // per letter and never cached, so a Regenerate is honored by the next
    // reminder. metadata.deep_link below stays `/invoices/<id>`: it routes the
    // iOS inbox by id (I2).
    const portalUrl = await letterPortalUrl(admin, CLIENT_PORTAL_URL, invoice.id);

    const rendered = STAGE_BUILDERS[stage]({
      invoiceNumber,
      projectName,
      designerName,
      clientName: recipientName,
      balanceCents,
      dueDate: invoice.due_date,
      portalUrl,
      currency: invoice.currency,
      studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
      studioInvoice: !invoice.project_id,
    });

    const outboundKind = stage < 2 ? 'invoice_reminder' : 'invoice_overdue';
    const draftBody = reminderBody(stage, {
      invoiceNumber, projectName, studioInvoice: !invoice.project_id, designerName,
      clientName: recipientName, balanceCents, dueDate: invoice.due_date,
      portalUrl, currency: invoice.currency, studioName: cobrand.studioName,
      studioLogoUrl: cobrand.studioLogoUrl,
    });
    const payload = {
      invoice_id: invoice.id, step: stage, project_id: invoice.project_id,
      invoice_number: invoiceNumber, balance_cents: balanceCents,
      due_date: invoice.due_date, currency: invoice.currency, pay_url: portalUrl,
      client_name: recipientName, client_user_id: clientUserId,
      designer_name: designerName, designer_id: invoice.designer_id,
      designer_email: invoice.designer?.email ?? null,
      project_name: projectName, for_clause: forClause,
      studio_name: cobrand.studioName ?? null, studio_logo_url: cobrand.studioLogoUrl ?? null,
      studio_invoice: !invoice.project_id,
    };
    const { data: draftId, error: composeError } = await admin.rpc('compose_outbound_draft', {
      p_kind: outboundKind,
      p_org: identity?.studioId ?? invoice.studio_id,
      p_project: invoice.project_id,
      p_channel: 'email',
      p_recipient_kind: 'client',
      p_to: { client_id: clientUserId, address: recipientEmail },
      p_subject: rendered.subject,
      p_body: draftBody,
      p_payload: payload,
      p_ref_type: 'invoice',
      p_ref_id: invoice.id,
      p_dedupe_key: 'invoice:' + invoice.id + ':reminder:' + stage,
      p_due_at: null,
      p_expires_at: null,
      p_composed_by: 'system',
    });
    if (composeError || !draftId) {
      skipped++;
      console.error('invoice-reminders: draft composition failed', invoice.id, composeError);
      continue;
    }

    const { data: composedDraft, error: draftLookupError } = await admin
      .from('outbound_drafts')
      .select('status, sent_at')
      .eq('id', draftId)
      .maybeSingle();
    if (draftLookupError || !composedDraft) {
      skipped++;
      console.error('invoice-reminders: composed draft lookup failed', invoice.id, draftLookupError);
      continue;
    }
    if (await repairSentInvoiceReminder(admin, composedDraft, invoice.id, stage)) {
      // The provider already accepted this exact stage on an earlier run.
      // Repair a missed cadence stamp and let the next cron run select the next stage.
      continue;
    }

    // The RPC supersedes drafts of the same kind; cadence moves across kinds
    // at +7, so retire the prior invoice reminder explicitly as well.
    const { error: supersedeError } = await admin.from('outbound_drafts')
      .update({ status: 'superseded' })
      .eq('ref_type', 'invoice')
      .eq('ref_id', invoice.id)
      .in('kind', ['invoice_reminder', 'invoice_overdue'])
      .eq('status', 'awaiting_review')
      .neq('id', draftId);
    if (supersedeError) {
      skipped++;
      console.error('invoice-reminders: older draft supersession failed', invoice.id, supersedeError);
      continue;
    }

    const { data: mode, error: modeError } = await admin.rpc('studio_outbound_mode', {
      p_studio: identity?.studioId ?? invoice.studio_id,
      p_kind: outboundKind,
    });
    const { data: reviewActive, error: rolloutError } = await admin.rpc('outbound_review_active', {
      p_studio: identity?.studioId ?? invoice.studio_id,
    });
    if (modeError || rolloutError) {
      skipped++;
      console.error('invoice-reminders: outbound mode lookup failed', invoice.id, modeError ?? rolloutError);
      continue;
    }
    if (mode === 'scheduled' || !reviewActive) {
      const sent = await sendOutboundDraft(admin, draftId, {
        kind: 'studio_schedule',
        studioId: (identity?.studioId ?? invoice.studio_id)!,
        outboundKind,
      });
      if (!sent.ok) {
        skipped++;
        console.warn('invoice-reminders: scheduled draft send failed', invoice.id, sent.error);
        continue;
      }
      sentCount++;
    } else {
      drafted++;
    }

  }

  return new Response(
    JSON.stringify({ scanned: invoices.length, sent: sentCount, drafted, escalated, notDue, skipped, heldMidPayment }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
