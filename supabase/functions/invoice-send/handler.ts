// invoice-send's request flow (see index.ts for the function's contract). The
// clients and the two outward calls are injected so the flow is testable; the
// shared helpers that only read through `admin` are used as they are.

// deno-lint-ignore-file no-explicit-any

import type { ComplianceSendOptions, ComplianceSendResult } from '../_shared/send-email.ts';
import type { notifyClientAttention } from '../_shared/client-attention.ts';
import {
  buildInvoiceOverdueNoticeEmail,
  buildInvoiceSentEmail,
} from '../_shared/invoice-emails.ts';
import {
  resolveStudioIdentity,
  studioCobrand,
  studioDisplayName,
} from '../_shared/studio-identity.ts';
import {
  invoiceBrandingRef,
  invoiceForClause,
  invoiceSubjectName,
} from '../_shared/invoice-subject.ts';
import { invoiceLetterMustHold, letterPortalUrl } from '../_shared/invoice-links.ts';
import { newestDesignerClient } from './recipient.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface InvoiceSendDeps {
  /** The caller behind this Authorization header, or null when it can't be confirmed. */
  getCallerUser(authorization: string): Promise<{ id: string } | null>;
  /** A client that acts AS the caller (her JWT): the capability check and the issue. */
  callerClient(authorization: string): any;
  /** The service-role client: reads, the link and the sent_at stamp — never the issue. */
  admin: any;
  sendCompliantEmail(admin: any, options: ComplianceSendOptions): Promise<ComplianceSendResult>;
  notifyClientAttention: typeof notifyClientAttention;
  clientPortalUrl: string;
}

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
  due_date: string | null;
  sent_at: string | null;
  project: { id: string; name: string; client_id: string | null } | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  designer: {
    id: string;
    full_name: string | null;
    business_name: string | null;
    email: string | null;
  } | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function createInvoiceSendHandler(deps: InvoiceSendDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    let invoiceId: string | undefined;
    let personalMessage: string | undefined;
    let sendType: 'sent' | 'reminder' = 'sent';
    let issueFirst = false;
    try {
      const body = await req.json();
      invoiceId = body?.invoiceId;
      personalMessage = typeof body?.message === 'string' ? body.message : undefined;
      if (body?.type === 'reminder') sendType = 'reminder';
      issueFirst = body?.issue === true;
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    if (!invoiceId) {
      return json({ error: 'invoiceId_required' }, 400);
    }
    // A reminder chases an open receivable; there is nothing to issue.
    if (issueFirst && sendType === 'reminder') {
      return json({ error: 'invalid_body' }, 400);
    }

    const authorization = req.headers.get('Authorization');
    const caller = authorization ? await deps.getCallerUser(authorization) : null;
    if (!authorization || !caller) {
      return json({ error: 'unauthorized' }, 401);
    }

    const callerClient = deps.callerClient(authorization);
    const { data: canManage, error: capabilityErr } = await callerClient.rpc('can_manage_invoice', {
      p_invoice_id: invoiceId,
    });
    if (capabilityErr) {
      console.error('invoice-send: capability check failed', capabilityErr);
      return json({ error: 'authorization_failed' }, 500);
    }
    if (canManage !== true) {
      return json({ error: 'invoice_not_found' }, 404);
    }

    const admin = deps.admin;

    const { data, error } = await admin
      .from('invoices')
      .select(
        `
      id, designer_id, client_id, project_id, studio_id, title, invoice_number, status,
      total_cents, amount_paid_cents, currency, due_date, sent_at,
      project:projects!invoices_project_id_fkey(id, name, client_id),
      client:profiles!invoices_client_id_fkey(id, full_name, email),
      designer:profiles!invoices_designer_id_fkey(id, full_name, business_name, email)
    `
      )
      .eq('id', invoiceId)
      .maybeSingle();

    if (error) {
      console.error('invoice-send: lookup failed', error);
      return json({ error: 'lookup_failed', detail: error.message }, 500);
    }
    let invoice = data as unknown as InvoiceRow | null;
    // Not-found collapses to 404. Capability was already checked using the
    // caller JWT, not the service role.
    if (!invoice) {
      return json({ error: 'invoice_not_found' }, 404);
    }
    if (invoice.status === 'draft' && !issueFirst) {
      return json(
        {
          error: 'invoice_not_issued',
          detail: 'Issue the invoice before sending.',
        },
        409
      );
    }
    // Issue-first sends a draft and nothing else: an issued invoice was
    // already sent by whoever issued it, and its next letter is a Resend.
    if (issueFirst && invoice.status !== 'draft') {
      return json(
        {
          error: 'invoice_not_draft',
          detail: 'This invoice was already issued.',
        },
        409
      );
    }
    if (invoice.status === 'void') {
      return json(
        {
          error: 'invoice_void',
          detail: 'A voided invoice cannot be sent.',
        },
        409
      );
    }
    // Manual reminders only make sense on a live receivable.
    if (sendType === 'reminder' && invoice.status !== 'sent' && invoice.status !== 'partially_paid') {
      return json(
        {
          error: 'invoice_not_open',
          detail: 'Reminders can only be sent on open (sent or partially paid) invoices.',
        },
        409
      );
    }

    // ── A letter is not sent into a payment in flight (W4 r6 MAJOR-1) ──────
    //
    // `ensure_invoice_link` refuses to mint while a Checkout is in flight, and
    // for 24 hours after an attempt whose return rode `/pay/return/<nonce>`
    // finalized — minting would kill the address the payer is standing on or
    // returning to. `letterPortalUrl` then falls back to the signed-in
    // letterbox, which is no use to the account-less payer this rail exists for.
    // So the letter HOLDS rather than shipping a second-best address: someone
    // who is paying this invoice right now is not someone to write to.
    //
    // THE QUESTION IS ASKED OF THE GUARD ITSELF (R-BZ, W4 r10 MAJOR-1). This
    // used to re-list three of the guard's states here, which is how the rail
    // came to disagree with it the moment a fourth leg was added: a declined
    // card let the letter through, carrying the signed-in address.
    // `invoice_letter_must_hold` IS the guard's own predicate, so the two cannot
    // drift again. 00636 §6's sweep closes a `processing` row that never
    // resolves after 10 days, so this can never hold forever.
    const letterHold = await invoiceLetterMustHold(admin, invoiceId);
    if (!letterHold.readable) {
      // Fail closed: an unreadable predicate cannot tell us the client is
      // mid-payment, and sending anyway is the outcome this guard exists to stop.
      console.error('invoice-send: checkout-attempt check failed', invoiceId);
      return json(
        {
          error: 'checkout_attempt_check_failed',
          detail: 'Patina could not check whether this invoice is being paid right now. Try again.',
        },
        503
      );
    }
    if (letterHold.hold) {
      console.log('invoice-send: held — invoice is mid-payment or just settled', invoiceId);
      return json(
        {
          error: 'checkout_in_flight',
          detail:
            'the client is paying this invoice right now, so Patina held the letter rather than replace the address they are standing on. Send it once the payment lands or falls through.',
        },
        409
      );
    }

    // ── Resolve recipient ──────────────────────────────────────────────────
    // Prefer the signed-up client profile (enables suppression / preferences /
    // in-app inbox); fall back to designer_clients.client_email for clients who
    // have not signed up yet (mirrors decision-reminders / expire-decisions).
    const clientUserId = invoice.client_id ?? invoice.project?.client_id ?? null;

    let recipientEmail: string | null = invoice.client?.email ?? null;
    let recipientName: string | null = invoice.client?.full_name ?? null;

    if (!recipientEmail && clientUserId && clientUserId !== invoice.client_id) {
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', clientUserId)
        .maybeSingle();
      // A failed read is an unknown preferred address, not an absent one: it
      // never falls back to an older one, and nothing issues.
      if (profileError) {
        console.error('invoice-send: recipient lookup failed', invoiceId, profileError.message);
        return json({ error: 'lookup_failed' }, 500);
      }
      recipientEmail = (profile as any)?.email ?? null;
      recipientName = (profile as any)?.full_name ?? recipientName;
    }

    if (!recipientEmail && clientUserId) {
      const { row: dc, error: dcError } = await newestDesignerClient(
        admin,
        invoice.designer_id,
        clientUserId
      );
      if (dcError) {
        console.error('invoice-send: recipient lookup failed', invoiceId, dcError.message);
        return json({ error: 'lookup_failed' }, 500);
      }
      recipientEmail = dc?.client_email ?? null;
      recipientName = recipientName ?? dc?.client_name ?? null;
    }

    if (!recipientEmail) {
      console.warn('invoice-send: no recipient email for invoice', invoiceId);
      return json({ error: 'no_recipient' }, 422);
    }

    // ── Issue-first (K10): the draft issues only to the address just found ──
    // Issuing is irreversible, so the recipient is resolved above, in this same
    // request, before it; the letter below goes to that same address. The
    // issue runs AS the caller — issue_invoice is granted to authenticated
    // only, and its own guards are the caller's.
    if (issueFirst) {
      const { data: issued, error: issueErr } = await callerClient.rpc('issue_invoice', {
        p_invoice_id: invoiceId,
        p_due_date: null,
      });
      if (issueErr || !issued) {
        console.error('invoice-send: issue failed', invoiceId, issueErr?.message);
        // An error is not proof the issue rolled back: it may have committed
        // and lost its reply. Only a re-read still showing a draft says not
        // issued. Issued, it may be another send's issue, whose letter went,
        // so invoice_not_draft's rule holds: no letter, the next is a Resend.
        const { data: after, error: rereadErr } = await admin
          .from('invoices')
          .select('status, invoice_number')
          .eq('id', invoiceId)
          .maybeSingle();
        if (rereadErr || !after) {
          console.error('invoice-send: issue outcome unread', invoiceId, rereadErr?.message);
          return json({ error: 'issue_unknown', detail: issueErr?.message }, 503);
        }
        if (after.status !== 'draft') {
          return json(
            { error: 'issued_unsent', issued: true, invoiceNumber: after.invoice_number ?? null },
            409
          );
        }
        return json({ error: 'issue_failed', detail: issueErr?.message }, 409);
      }
      // The issued row (number, totals, due date, sent_at); its joins are unchanged.
      invoice = {
        ...invoice,
        ...(issued as Partial<InvoiceRow>),
        project: invoice.project,
        client: invoice.client,
        designer: invoice.designer,
      };
    }
    // What a refusal after this point owes the caller: the draft is issued now.
    const issuedNow = issueFirst
      ? { issued: true, invoiceNumber: invoice.invoice_number ?? null }
      : {};

    // ── Build + send the email ─────────────────────────────────────────────
    const designerName =
      invoice.designer?.full_name?.trim() ||
      invoice.designer?.business_name?.trim() ||
      'Your designer';
    // Studio co-brand (Designer Studios): the invoice's own studio resolves the
    // brand — a studio invoice has no project to read it from, and a two-studio
    // designer's primary studio would be the wrong letterhead. Subject/in-app lead
    // with the studio; email prose stays the individual designer's name.
    const identity = await resolveStudioIdentity(admin, invoiceBrandingRef(invoice));
    const senderName = studioDisplayName(identity, designerName);
    const cobrand = studioCobrand(identity);
    // null, not a stand-in phrase: a letter with nothing to name drops its
    // "for …" clause rather than telling the client it is "for your studio".
    const projectName = invoiceSubjectName(invoice, null);
    const forClause = invoiceForClause(invoice);
    const studioInvoice = !invoice.project_id;
    const invoiceNumber = invoice.invoice_number ?? 'Invoice';
    // K1: the letter carries the invoice's own address — `/pay/<token>` opens
    // for anyone holding it, signed in or not. A null (draft, void, a Checkout
    // standing on the current address, or a failed mint) falls back to the
    // signed-in `/?invoice=<id>` letterbox — a page that exists, which
    // `/invoices/<id>` is not (W4 r6 MAJOR-1).
    // metadata.deep_link below stays `/invoices/<id>`: it routes the iOS inbox
    // by id (I2), so the emailed link and the in-app row land differently.
    const portalUrl = await letterPortalUrl(admin, deps.clientPortalUrl, invoice.id);

    // type 'reminder' renders the overdue-notice template (manual nudge from the
    // A/R page) without touching the automated cadence counters; default 'sent'
    // is the original invoice_sent announcement.
    const rendered =
      sendType === 'reminder'
        ? buildInvoiceOverdueNoticeEmail({
            invoiceNumber,
            projectName,
            designerName,
            clientName: recipientName,
            balanceCents: Math.max((invoice.total_cents || 0) - (invoice.amount_paid_cents || 0), 0),
            dueDate: invoice.due_date,
            portalUrl,
            currency: invoice.currency,
            studioName: cobrand.studioName,
            studioLogoUrl: cobrand.studioLogoUrl,
            studioInvoice,
          })
        : buildInvoiceSentEmail({
            invoiceNumber,
            projectName,
            designerName,
            senderName,
            clientName: recipientName,
            totalCents: invoice.total_cents,
            dueDate: invoice.due_date,
            portalUrl,
            personalMessage,
            currency: invoice.currency,
            studioName: cobrand.studioName,
            studioLogoUrl: cobrand.studioLogoUrl,
            studioInvoice,
          });

    let sendResult;
    try {
      sendResult = await deps.sendCompliantEmail(admin, {
        authority: { kind: 'designer', userId: caller.id },
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        // A question about an invoice belongs with the designer who sent it.
        replyTo: invoice.designer?.email ?? undefined,
        userId: clientUserId ?? undefined,
        notificationType: sendType === 'reminder' ? 'invoice_reminder' : 'invoice_sent',
        category: 'operational',
        templateId: sendType === 'reminder' ? 'invoice-reminder-manual' : 'invoice-sent',
        ref: { type: 'invoice', id: invoice.id },
        // The studio this letter is from, so an account-less recipient's out
        // touch is filed in the sending studio's own book and nowhere else
        // (W4 r1 B-2).
        organizationId: identity?.studioId ?? invoice.studio_id ?? undefined,
        // subject/message/deep_link double as the in-app inbox rendering (the
        // client portal surfaces this notification_log row — see header note).
        metadata: {
          invoice_id: invoice.id,
          project_id: invoice.project_id,
          subject: rendered.subject,
          message:
            sendType === 'reminder'
              ? `${senderName} sent a reminder about invoice ${invoiceNumber}${forClause}.`
              : `${senderName} sent invoice ${invoiceNumber}${forClause}.`,
          deep_link: `/invoices/${invoice.id}`,
        },
      });
    } catch (err) {
      // e.g. RESEND_API_KEY missing and EMAIL_DEV_MODE not set locally.
      const detail = err instanceof Error ? err.message : 'unknown send error';
      console.error('invoice-send: send threw', detail);
      return json({ error: 'send_failed', detail, ...issuedNow }, 502);
    }

    if (!sendResult.success && !sendResult.suppressed) {
      console.error('invoice-send: send failed', sendResult.error);
      return json({ error: 'send_failed', detail: sendResult.error, ...issuedNow }, 502);
    }

    // ── The client's bell (SP-08) ──────────────────────────────────────────
    // sendCompliantEmail writes a channel='email' notification_log row, which the
    // client PORTAL's inbox surfaces. The iOS bell filters channel in (in_app,
    // push), so an invoice has never reached it. 00534 writes both, de-duplicated
    // on the invoice id so a resend refreshes one line. Best-effort throughout:
    // the invoice has already been sent and nothing here may change that.
    if (sendType === 'sent' && clientUserId) {
      const dueLine = invoice.due_date
        // timeZone: 'UTC' is load-bearing (review minor 6). due_date is a DATE,
        // which new Date() parses as UTC midnight; formatted in a runtime behind
        // UTC that prints the PREVIOUS day, and a due date off by one is a money
        // fact stated wrongly.
        ? ` It's due ${new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}.`
        : '';
      const attention = await deps.notifyClientAttention(admin, {
        userId: clientUserId,
        entityType: 'invoice',
        entityId: invoice.id,
        title: 'An invoice is ready',
        body: `${senderName} sent invoice ${invoiceNumber}${forClause}.${dueLine}`,
        authority: { kind: 'designer', userId: caller.id },
        metadata: {
          project_id: invoice.project_id,
          amount_cents: invoice.total_cents,
          due_date: invoice.due_date,
        },
      });
      if (!attention.ok) {
        console.warn('invoice-send: client attention not delivered', attention.error);
      }
    }

    // ── Stamp sent_at if missing ───────────────────────────────────────────
    // issue_invoice stamps sent_at at issue time, so this is normally a no-op;
    // it backstops rows that reached an issued status without a stamp. Manual
    // reminders never stamp — they aren't the send event.
    let stampedSentAt = false;
    if (sendType === 'sent' && !invoice.sent_at) {
      const { error: stampErr } = await admin
        .from('invoices')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', invoice.id)
        .is('sent_at', null);
      if (stampErr) {
        console.error('invoice-send: failed to stamp sent_at', stampErr);
      } else {
        stampedSentAt = true;
      }
    }

    return json({
      ok: true,
      invoiceId: invoice.id,
      recipient: recipientEmail,
      emailSent: sendResult.success === true,
      suppressed: sendResult.suppressed === true,
      logId: sendResult.logId ?? null,
      providerId: sendResult.id ?? null,
      stampedSentAt,
      ...issuedNow,
    });
  };
}
