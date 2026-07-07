// waitlist-notify — internal new-lead alert.
//
// Fired by the AFTER INSERT trigger on public.waitlist (migration 00259) via
// invoke_edge_function, which passes `{ record: <the waitlist row> }`. Sends a
// plain admin notification email through Resend to LEAD_NOTIFY_TO. This is an
// internal alert (not a user-facing/compliance email), so it sends directly
// rather than through the compliance mailer.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
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
    const html =
      `<h2 style="font-family:Georgia,serif">New waitlist signup</h2>` +
      `<table style="font-family:-apple-system,Arial,sans-serif;font-size:14px;border-collapse:collapse">` +
      rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:2px 12px 2px 0;color:#888">${esc(k)}</td>` +
            `<td style="padding:2px 0"><strong>${esc(v)}</strong></td></tr>`,
        )
        .join('') +
      `</table>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: NOTIFY_TO,
        reply_to: email,
        subject: `New waitlist signup: ${email}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[waitlist-notify] Resend error', res.status, detail);
      return new Response(JSON.stringify({ error: 'resend failed', status: res.status }), {
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
