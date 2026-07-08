// Supabase Edge Function: expire-decisions
//
// Manual trigger (or cron-invoked) variant of the SQL job in 00092.
// Useful for ad-hoc backfills and as a safety net if pg_cron is paused.
//
// Two responsibilities (Decision Framework Wave 2 · Territory T2 · PT-D-2-T2-2):
//
//   1. OVERDUE-ON-LAPSE — for every still-pending decision whose due_date has
//      passed, fire decision_overdue through the notification center: the
//      frozen spine RPC notify_decision_overdue (idempotent in-app row) plus an
//      email via the shared chokepoint, respecting preferences. The
//      (decision_id, kind) unique index + a notification_log lookup keep this
//      idempotent across re-runs, so a decision is announced overdue exactly
//      once even though it stays pending across multiple daily runs.
//
//   2. EXPIRE — sets status = 'expired' on pending decisions whose due_date
//      passed more than 7 days ago (unchanged from the original behaviour and
//      the inline SQL in 00092).
//
// Ordering note: overdue notifications are sent BEFORE the expire UPDATE so a
// decision that crosses the 7-day cutoff on the same run still gets its single
// overdue notice while it is observably "overdue" rather than already expired.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deliverDecisionNotification } from '../_shared/decision-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface OverdueDecision {
  id: string;
  title: string;
  due_date: string;
  designer_client: {
    client_id: string | null;
    client_email: string | null;
    client_name: string | null;
    client: { id: string | null; full_name: string | null; email: string | null } | null;
  } | null;
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ─── 1. OVERDUE-ON-LAPSE notifications ──────────────────────────────────
  // Every pending decision whose due_date is now in the past has lapsed.
  // deliverDecisionNotification is idempotent, so re-running is safe.
  const { data: overdueRows, error: overdueErr } = await supabase
    .from('client_decisions')
    .select(`
      id, title, due_date,
      designer_client:designer_clients(
        client_id,
        client_email,
        client_name,
        client:profiles!client_id(id, full_name, email)
      )
    `)
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', now);

  let overdueNotified = 0;
  if (overdueErr) {
    console.error('expire-decisions: overdue query failed', overdueErr);
  } else {
    const overdue = (overdueRows ?? []) as unknown as OverdueDecision[];
    for (const d of overdue) {
      const dc = d.designer_client;
      const recipientUserId = dc?.client?.id ?? dc?.client_id ?? null;
      const recipientEmail = dc?.client?.email ?? dc?.client_email ?? null;
      const recipientName = dc?.client?.full_name ?? dc?.client_name ?? null;

      const result = await deliverDecisionNotification(
        supabase,
        'decision_overdue',
        { id: d.id, title: d.title, dueDate: d.due_date },
        { userId: recipientUserId, email: recipientEmail, name: recipientName },
      );
      if (result.emailSent || result.inAppOk) overdueNotified++;
      if (
        result.emailSkipped &&
        result.reason &&
        result.reason !== 'already_sent' &&
        result.reason !== 'cadence_digest'
      ) {
        console.warn('expire-decisions: overdue email skipped', d.id, result.reason);
      }
    }
  }

  // ─── 2. EXPIRE decisions past the 7-day grace ───────────────────────────
  const { data, error } = await supabase
    .from('client_decisions')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', cutoff)
    .select('id');

  if (error) {
    console.error('expire-decisions: failed', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      overdue_notified: overdueNotified,
      expired: (data ?? []).length,
      ids: (data ?? []).map((d: any) => d.id),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
