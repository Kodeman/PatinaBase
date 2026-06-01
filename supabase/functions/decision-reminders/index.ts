// Supabase Edge Function: decision-reminders
//
// Runs daily (scheduled by pg_cron in migration 00092). Finds pending
// decisions whose due_date is within the next 48 hours and that have not
// yet been reminded, then routes a reminder through the NOTIFICATION CENTER
// — the in-app spine RPC (notify_decision_required, idempotent) plus an
// email via the shared sendCompliantEmail chokepoint (suppression, rate cap,
// RFC-8058 unsubscribe headers, notification_log, preference checks) — instead
// of talking straight to Resend.
//
// Decision Framework Wave 2 · Territory T2 · PT-D-2-T2-1 / PT-D-2-T2-2.
//
// reminder_sent_at is still stamped on success so the 48h-window query stays
// the primary dedupe; deliverDecisionNotification adds a second layer (the
// idempotent in-app RPC + a notification_log lookup) so a same-day re-run does
// not double-send even before the stamp lands.
//
// SMS escalation (PRD line 120 final clause) is intentionally deferred
// pending Twilio integration.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deliverDecisionNotification } from '../_shared/decision-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DecisionWithClient {
  id: string;
  title: string;
  due_date: string;
  reminder_sent_at: string | null;
  designer_client: {
    client_id: string | null;
    client_email: string | null;
    client_name: string | null;
    client: { id: string | null; full_name: string | null; email: string | null } | null;
  } | null;
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
        client_id,
        client_email,
        client_name,
        client:profiles!client_id(id, full_name, email)
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
  let inAppOnly = 0;
  let skipped = 0;

  for (const d of decisions) {
    const dc = d.designer_client;
    // Prefer the signed-up client (auth user) so preference checks + in-app
    // notifications resolve; fall back to the direct contact email.
    const recipientUserId = dc?.client?.id ?? dc?.client_id ?? null;
    const recipientEmail = dc?.client?.email ?? dc?.client_email ?? null;
    const recipientName = dc?.client?.full_name ?? dc?.client_name ?? null;

    const result = await deliverDecisionNotification(
      supabase,
      'decision_required',
      { id: d.id, title: d.title, dueDate: d.due_date },
      { userId: recipientUserId, email: recipientEmail, name: recipientName },
    );

    if (result.emailSent) {
      sent++;
      // Stamp reminder_sent_at so the 48h-window query won't re-pick this row.
      const { error: updateErr } = await supabase
        .from('client_decisions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', d.id);
      if (updateErr) {
        console.error('decision-reminders: failed to stamp', d.id, updateErr);
      }
    } else if (result.inAppOk && !recipientEmail) {
      // In-app delivered but no email target — still stamp so we don't churn.
      inAppOnly++;
      await supabase
        .from('client_decisions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', d.id);
    } else {
      // Suppressed / preference-gated / quiet-hours / already-sent — leave the
      // row unstamped so a later run can retry once the gate clears, but log.
      skipped++;
      if (result.reason && result.reason !== 'quiet_hours') {
        console.warn('decision-reminders: skipped', d.id, result.reason);
      }
    }
  }

  return new Response(
    JSON.stringify({ scanned: decisions.length, sent, inAppOnly, skipped }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
