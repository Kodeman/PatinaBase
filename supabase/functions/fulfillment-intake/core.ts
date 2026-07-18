// fulfillment-intake/core.ts — normalize a captured PaymentIntent into the
// fulfillment_intake_order RPC payload and call it. Two entry paths share ONE
// core (§3, R1.1): worker path (claim fulfillment_intake tasks → re-fetch PI
// fresh) and seed path (inline fabricated PI, livemode:false). The fork is only
// WHICH object is normalized; normalize→RPC is identical.
//
// Idempotency: enforced in SQL (fulfillment_intake_order ON CONFLICT
// (stripe_payment_intent_id) DO NOTHING → returns the existing order_id and
// writes nothing further). This wrapper never dedupes client-side — every call
// delegates straight to the RPC, so a re-delivered PaymentIntent (or a
// re-posted seed payload) is a pure no-op that returns the SAME order_id it
// returned the first time.
import { claimAgentTasks, completeAgentTask, type RpcClient } from '../_shared/agent-queue.ts';

export interface IntakeDeps {
  supabase: RpcClient & { rpc: RpcClient['rpc'] };
  // worker path only: re-fetch a PI fresh from Stripe by id
  fetchPaymentIntent?(id: string): Promise<Record<string, unknown>>;
  now(): Date;
  worker?: string;
}

/** Map a Stripe PI (+ its metadata cart) to the fulfillment_intake_order payload. */
export function normalizeIntakePayload(pi: Record<string, unknown>): Record<string, unknown> {
  const md = (pi.metadata ?? {}) as Record<string, string>;
  // metadata carries JSON-encoded cart + attribution (BOH intake contract §3).
  const lines = md.lines ? JSON.parse(md.lines) : [];
  return {
    payment_intent: { id: pi.id, livemode: pi.livemode ?? false },
    client: {
      name: md.client_name ?? 'Unknown Client',
      email: md.client_email ?? null,
      profile_id: md.client_profile_id ?? null,
    },
    designer: {
      profile_id: md.designer_profile_id ?? null,
      designer_client_id: md.designer_client_id ?? null,
      attribution: md.designer_attribution ? JSON.parse(md.designer_attribution) : null,
    },
    ship_to: md.ship_to ? JSON.parse(md.ship_to) : null,
    totals: {
      captured_total_cents: Number(md.captured_total_cents ?? pi.amount ?? 0),
      product_subtotal_cents: Number(md.product_subtotal_cents ?? 0),
      freight_charged_cents: Number(md.freight_charged_cents ?? 0),
      tax_cents: Number(md.tax_cents ?? 0),
    },
    lines,
  };
}

/** Seed path: accept an inline fabricated PI object directly. */
export async function intakeInlinePI(
  deps: IntakeDeps,
  pi: Record<string, unknown>,
  actor = 'seed',
): Promise<string> {
  const payload = normalizeIntakePayload(pi);
  const res = await deps.supabase.rpc('fulfillment_intake_order', { p_payload: payload, p_actor: actor });
  if (res.error) throw new Error(res.error.message);
  return res.data as string;
}

/** Worker path: claim fulfillment_intake tasks, re-fetch each PI, call the RPC, complete the task. */
export async function runIntakeWorker(deps: IntakeDeps): Promise<{ processed: number; failed: number }> {
  const worker = deps.worker ?? 'fulfillment-intake';
  const tasks = await claimAgentTasks(deps.supabase, {
    taskTypes: ['fulfillment_intake'],
    batch: 20,
    worker,
    visibilityTimeout: '60 seconds',
  });
  let processed = 0,
    failed = 0;
  for (const t of tasks) {
    try {
      const piId = (t.payload as Record<string, unknown>).payment_intent_id as string;
      if (!deps.fetchPaymentIntent) throw new Error('worker path requires fetchPaymentIntent');
      const pi = await deps.fetchPaymentIntent(piId);
      // Idempotent: if this PI already produced an order (redelivery, or a
      // retried task after a partial prior failure), the RPC returns the
      // SAME order_id and writes nothing further — this branch is a no-op.
      const orderId = await intakeInlinePI(deps, pi, worker);
      await completeAgentTask(deps.supabase, {
        id: t.id,
        outcome: 'done',
        artifacts: { order_id: orderId },
        actor: worker,
      });
      processed++;
    } catch (err) {
      await completeAgentTask(deps.supabase, {
        id: t.id,
        outcome: 'failed',
        error: String(err),
        actor: worker,
      });
      failed++;
    }
  }
  return { processed, failed };
}
