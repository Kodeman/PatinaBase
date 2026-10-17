// Supabase Edge Function: invoice-send
//
// Invoicing Wave 2. Invoked by useSendInvoice after issue_invoice (Issue &
// Send) or standalone (Resend). The caller must have the same studio capability
// as generate/issue/void: invoice owner or active non-guest co-member.
//
// Flow:
//   1. Auth: resolve the caller from the Authorization header.
//   2. Prove can_manage_invoice through a caller-JWT Supabase client, then load
//      the invoice (service role) + joins and require issued (not draft/void).
//   2b. Hold the letter whenever invoice_letter_must_hold says so (a Checkout
//      in flight, or the 24h return window after one whose return rode the
//      nonce): 00636 will not mint a fresh address under a payer, and a letter
//      with no address is not worth sending (409 checkout_in_flight, W4 r6
//      MAJOR-1 / r10 MAJOR-1, R-BZ).
//   3. Resolve the recipient: invoice.client_id → project.client_id profile,
//      falling back to designer_clients.client_email for not-yet-signed-up
//      clients (mirrors decision-reminders).
//   3b. Issue-first (`issue: true`, K10): a DRAFT is issued here — through the
//      caller-JWT client, never the service role — only once step 3 found an
//      address, and the letter goes to that same address. No address is 422
//      no_recipient with the draft untouched. A failed issue is re-read:
//      issued is 409 issued_unsent (`issued: true`, no letter); still a draft
//      is 409 issue_failed only when issue_invoice refused with its SQLSTATE;
//      still a draft after a lost reply, or an unreadable re-read, is 503
//      issue_unknown.
//   4. Send the invoice_sent email through the shared sendCompliantEmail
//      chokepoint (category operational → suppression check, rate cap,
//      unsubscribe headers, notification_log).
//      ▸ In-app notification (v1 decision): the notification_log row written
//        by sendCompliantEmail IS the in-app notification — the client
//        portal's inbox surfaces non-transactional email-channel rows, and
//        metadata.subject / message / deep_link below drive its rendering +
//        click-through. No separate dispatch needed; a dedicated spine RPC
//        (decision-notifications style) can replace this in a later wave.
//   5. Stamp invoices.sent_at if null (issue_invoice normally stamps it; this
//      covers resend-after-anomaly paths).
//
// Body: { invoiceId: string, message?: string, type?: 'sent' | 'reminder', issue?: boolean }
//   message = personal note; type defaults to 'sent'.
//   type 'reminder' = designer-initiated manual nudge from the A/R page: it
//   renders the overdue-notice template instead of invoice_sent, requires a
//   live receivable (sent/partially_paid), and does NOT touch reminder_count /
//   last_reminder_at / sent_at — the automated invoice-reminders cadence is
//   unaffected by manual nudges.
//   issue = true sends a draft (and only a draft) by issuing it first, see 3b.
//   A response after the issue carries `issued: true` and `invoiceNumber`,
//   including a send_failed one.
// Returns counts/ids JSON like sibling functions. The flow is handler.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendCompliantEmail } from '../_shared/send-email.ts';
import { notifyClientAttention } from '../_shared/client-attention.ts';
import { createInvoiceSendHandler } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';

Deno.serve(
  createInvoiceSendHandler({
    async getCallerUser(authorization) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return data.user ?? null;
    },
    callerClient: (authorization) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authorization } },
      }),
    admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    sendCompliantEmail,
    notifyClientAttention,
    clientPortalUrl: CLIENT_PORTAL_URL,
  })
);
