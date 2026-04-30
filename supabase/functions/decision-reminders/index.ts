// Supabase Edge Function: decision-reminders
//
// Runs daily (scheduled by pg_cron in migration 00092). Finds pending
// decisions whose due_date is within the next 48 hours and that have not
// yet been reminded, sends a reminder email via Resend, and stamps
// reminder_sent_at on the row.
//
// SMS escalation (PRD line 120 final clause) is intentionally deferred
// pending Twilio integration.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_ADDRESS = Deno.env.get('RESEND_FROM') ?? 'hello@patina.cloud';

interface DecisionWithClient {
  id: string;
  title: string;
  due_date: string;
  reminder_sent_at: string | null;
  designer_client: {
    client_email: string | null;
    client_name: string | null;
    client: { full_name: string | null; email: string | null } | null;
  } | null;
}

async function sendReminder(decision: DecisionWithClient): Promise<boolean> {
  const recipient =
    decision.designer_client?.client?.email ??
    decision.designer_client?.client_email;

  if (!recipient) {
    console.warn('decision-reminders: skipping decision', decision.id, '— no recipient');
    return false;
  }

  const recipientName =
    decision.designer_client?.client?.full_name ??
    decision.designer_client?.client_name ??
    'there';

  const dueAt = new Date(decision.due_date);
  const hoursLeft = Math.max(
    0,
    Math.round((dueAt.getTime() - Date.now()) / (1000 * 60 * 60)),
  );

  const subject = `Reminder: "${decision.title}" needs your decision`;
  const html = `
    <p>Hi ${escapeHtml(recipientName)},</p>
    <p>Your designer is waiting on a decision: <strong>${escapeHtml(decision.title)}</strong>.</p>
    <p>It's due in approximately <strong>${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}</strong>.</p>
    <p>Open your Patina dashboard to review the options and pick one.</p>
    <p>— Patina</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: recipient,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('decision-reminders: Resend failed', res.status, text);
    return false;
  }
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const horizon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('client_decisions')
    .select(`
      id, title, due_date, reminder_sent_at,
      designer_client:designer_clients(
        client_email,
        client_name,
        client:profiles!client_id(full_name, email)
      )
    `)
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .not('due_date', 'is', null)
    .gte('due_date', now)
    .lte('due_date', horizon);

  if (error) {
    console.error('decision-reminders: query failed', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const decisions = (data ?? []) as unknown as DecisionWithClient[];
  let sent = 0;
  for (const d of decisions) {
    const ok = await sendReminder(d);
    if (ok) {
      const { error: updateErr } = await supabase
        .from('client_decisions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', d.id);
      if (updateErr) {
        console.error('decision-reminders: failed to stamp', d.id, updateErr);
      } else {
        sent++;
      }
    }
  }

  return new Response(
    JSON.stringify({ scanned: decisions.length, sent }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
