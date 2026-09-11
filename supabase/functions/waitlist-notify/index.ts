// waitlist-notify — internal new-lead alert.
//
// Fired by the AFTER INSERT trigger on public.waitlist (migration 00259) via
// invoke_edge_function, which passes `{ record: <the waitlist row> }`. Sends a
// plain admin notification email to LEAD_NOTIFY_TO through the one send
// chokepoint. There is no Patina user on the receiving end, so no userId is
// passed: the send skips the suppression/rate policy and writes no
// notification_log row, exactly as the old direct call did.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderBrandedShell, heading } from '../_shared/branded-email.ts';
import { sendCompliantEmail } from '../_shared/send-email.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM_ADDRESS =
  Deno.env.get('RESEND_FROM_TRANSACTIONAL') ||
  Deno.env.get('RESEND_FROM') ||
  'Patina <hello@patina.cloud>';
const NOTIFY_TO = Deno.env.get('LEAD_NOTIFY_TO') || 'kody.kochaver@gmail.com';

function esc(v: unknown): string {
  return String(v ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({}));
    const row = body?.record ?? body ?? {};
    const email = row.email;
    if (!email) {
      return new Response(JSON.stringify({ error: 'record.email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!RESEND_API_KEY) {
      console.warn('[waitlist-notify] RESEND_API_KEY not set — skipping send for', email);
      return new Response(JSON.stringify({ skipped: 'no RESEND_API_KEY' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // createClient throws on an empty key, which would turn a missing secret
    // into a 500 on a path that has no user to check anything against anyway.
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[waitlist-notify] service-role client unavailable — skipping send for', email);
      return new Response(JSON.stringify({ skipped: 'no service-role client' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows: [string, unknown][] = [
      ['Email', email],
      ['Role', row.role],
      ['Source', row.source],
      ['Signup page', row.signup_page],
      ['CTA', row.cta_text],
      ['Channel', row.channel],
      ['UTM source', row.utm_source],
      ['UTM medium', row.utm_medium],
      ['UTM campaign', row.utm_campaign],
      ['Referrer', row.referrer],
    ];
    const tableRows = rows
      .map(
        ([k, v]) =>
          `<tr>` +
          `<td style="padding:7px 18px 7px 0; font-family:'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Courier New', monospace; font-size:11px; font-weight:500; letter-spacing:0.06em; text-transform:uppercase; color:#8C8578; border-bottom:1px solid #E6DDCC; vertical-align:top; white-space:nowrap;">${esc(k)}</td>` +
          `<td style="padding:7px 0; font-family:'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:14px; line-height:1.5; color:#1F1B16; border-bottom:1px solid #E6DDCC;"><strong style="font-weight:600;">${esc(v)}</strong></td>` +
          `</tr>`,
      )
      .join('');
    const html = renderBrandedShell({
      title: `New waitlist signup: ${email}`,
      preview: `New waitlist signup: ${email}`,
      eyebrow: 'Waitlist',
      body:
        heading('New waitlist signup') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:4px 0 8px;">${tableRows}</table>`,
    });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const result = await sendCompliantEmail(admin, {
      to: NOTIFY_TO,
      subject: `New waitlist signup: ${email}`,
      html,
      from: FROM_ADDRESS,
      replyTo: email,
      category: 'transactional',
      notificationType: 'waitlist_lead_alert',
      templateId: 'waitlist-lead-alert',
      metadata: {
        waitlist_email: email,
        role: row.role ?? null,
        source: row.source ?? null,
      },
    });

    if (!result.success) {
      console.error('[waitlist-notify] send failed', result.error);
      return new Response(JSON.stringify({ error: 'resend failed', detail: result.error }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ sent: true, to: NOTIFY_TO }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[waitlist-notify] error', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
