// Supabase Edge Function: decision-resolved-notify
//
// Invoked by the AFTER UPDATE trigger on client_decisions (migration 00174)
// when a decision transitions INTO 'responded' — i.e. the client picks an
// option (useSelectDecisionOption) or the designer overrides on their behalf
// (useApplyDecisionOverride).
//
// Decision Framework Wave 2 follow-up · Notifications micro-PR (T2 flag).
//
// The IN-APP resolved row already lands synchronously from the spine RPC
// notify_decision_resolved() (called by those hooks). This function adds the
// EMAIL leg to the owning DESIGNER, routed through the shared notification
// center chokepoint (deliverDecisionNotification → sendCompliantEmail:
// suppression, per-recipient rate cap, RFC-8058 unsubscribe headers,
// notification_log, preference + quiet-hours checks). The shared helper's
// in-app RPC call is idempotent (00173 ON CONFLICT DO NOTHING), so the in-app
// row written by the hook is a no-op here, and the notification_log dedupe keeps
// the email one-per-(decision, kind) across any retries.
//
// Mirrors expire-decisions/index.ts: service-role client, _shared import,
// JSON response.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deliverDecisionNotification } from '../_shared/decision-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ResolvedDecision {
  id: string;
  title: string;
  due_date: string | null;
  designer_id: string | null;
  designer: { id: string | null; full_name: string | null; email: string | null } | null;
}

Deno.serve(async (req: Request) => {
  let decisionId: string | undefined;
  try {
    const body = await req.json();
    decisionId = body?.decision_id;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 });
  }
  if (!decisionId) {
    return new Response(JSON.stringify({ error: 'decision_id_required' }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Look up the decision + the owning designer's profile (full_name + email).
  // client_decisions.designer_id is NOT NULL (00064), but the join is defensive.
  const { data, error } = await supabase
    .from('client_decisions')
    .select(`
      id, title, due_date, designer_id,
      designer:profiles!designer_id(id, full_name, email)
    `)
    .eq('id', decisionId)
    .single();

  if (error || !data) {
    console.error('decision-resolved-notify: lookup failed', decisionId, error);
    return new Response(JSON.stringify({ error: 'decision_not_found' }), { status: 404 });
  }

  const decision = data as unknown as ResolvedDecision;
  const recipientUserId = decision.designer?.id ?? decision.designer_id ?? null;
  const recipientEmail = decision.designer?.email ?? null;
  const recipientName = decision.designer?.full_name ?? null;

  // deliverDecisionNotification: idempotent in-app RPC (no-op since the hook
  // already wrote the row) + the resolved EMAIL via the compliance chokepoint.
  const result = await deliverDecisionNotification(
    supabase,
    'decision_resolved',
    { id: decision.id, title: decision.title, dueDate: decision.due_date },
    { userId: recipientUserId, email: recipientEmail, name: recipientName },
  );

  if (result.emailSkipped && result.reason && result.reason !== 'already_sent') {
    console.warn('decision-resolved-notify: email skipped', decision.id, result.reason);
  }

  return new Response(
    JSON.stringify({
      decision_id: decision.id,
      in_app_ok: result.inAppOk,
      email_sent: result.emailSent,
      email_skipped: result.emailSkipped,
      reason: result.reason ?? null,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
