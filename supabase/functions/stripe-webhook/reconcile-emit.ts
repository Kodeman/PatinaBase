// stripe-webhook/reconcile-emit.ts — Agent OS reconciliation emission (WP-2.1).
//
// The constants + enqueue helper the stripe-webhook uses to fan reconcile-worthy
// Stripe events onto the public.agent_tasks queue (00297), so the
// stripe-event-processor can reconcile them against internal state and surface
// discrepancies in the founder's Mission Control inbox.
//
// This lives in its OWN module (not inline in index.ts) so it unit-tests offline
// — index.ts calls Deno.serve at top level and therefore can't be imported by a
// test, the same reason the repo splits core.ts/index.ts (field-daily,
// cowork-intake-bridge). index.ts imports these three symbols and invokes
// enqueueStripeEventTask from a single call site after the money-path switch.
//
// Contract (Stripe is at-least-once + unordered): the task payload carries ONLY
// identifiers (event type + object id/type + livemode + connected account).
// NEVER the object's state — the processor re-fetches it fresh from Stripe.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Stripe from 'npm:stripe@17';
import { enqueueAgentTask, type RpcClient } from '../_shared/agent-queue.ts';

// Events we reconcile: the money-path types the switch already settles, PLUS the
// Connect / dispute / payout / fraud events that have no money-path handler and
// exist only to be reconciled.
export const RECONCILE_EVENT_TYPES = new Set<string>([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.succeeded',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'radar.early_fraud_warning.created',
  'payout.paid',
  'payout.failed',
  'account.updated',
  'account.application.deauthorized',
  'transfer.created',
  'transfer.reversed',
  'application_fee.created',
  'application_fee.refunded',
  'balance.available',
]);

// The six event types the switch in index.ts already settles onto a payable row.
// For these the reconcile enqueue is best-effort (see index.ts's call-site
// failure split): the payable flip + any receipt already committed, so a queue
// hiccup must NEVER release the idempotency claim and replay the event.
export const MONEY_PATH_TYPES = new Set<string>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
]);

// Priority: disputes + fraud warnings are most urgent (1); money-loss signals
// next (2); everything else routine (3). 1 = highest (00297).
export function reconcileEventPriority(eventType: string): number {
  if (eventType.startsWith('charge.dispute.') || eventType.startsWith('radar.')) return 1;
  if (
    eventType === 'payout.failed' ||
    eventType === 'account.application.deauthorized' ||
    eventType === 'transfer.reversed' ||
    eventType === 'application_fee.refunded'
  ) {
    return 2;
  }
  return 3;
}

// Enqueue a 'stripe_event' reconcile task, idempotent on the Stripe event id.
// run_after is now+120s so any money-path row flip has settled before the
// processor re-fetches. Payload is IDENTIFIERS ONLY — never the object's state.
export async function enqueueStripeEventTask(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const obj = event.data.object as { id?: string; object?: string };
  const objectId = obj?.id ?? null;
  const objectType = obj?.object ?? null;
  await enqueueAgentTask(admin as unknown as RpcClient, {
    taskType: 'stripe_event',
    idempotencyKey: event.id,
    onConflict: 'ignore',
    source: 'stripe-webhook',
    actor: 'stripe-webhook',
    summary: `${event.type} ${objectId ?? ''}`.trim(),
    priority: reconcileEventPriority(event.type),
    runAfter: new Date(Date.now() + 120_000).toISOString(),
    payload: {
      event_type: event.type,
      object_id: objectId,
      object_type: objectType,
      livemode: event.livemode,
      account: event.account ?? null,
    },
  });
}
