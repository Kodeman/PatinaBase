// stripe-webhook/direct-order-settle.ts — what a settled direct order owes the
// rest of the platform (00540 / Daily Return W5, rulings Q5 and Q6).
//
// Split out of index.ts for the same reason fulfillment-intake has a core.ts:
// this is money and it should be provable offline, without a running stack, a
// signed webhook, or a Stripe key. index.ts supplies the client and calls this
// once, off the same guarded flip the receipt emails ride.

/** Just enough of a Supabase client to call an RPC. */
export interface SettleRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface SettleEffectsResult {
  /** settle_direct_order_attribution's jsonb receipt, when the call succeeded. */
  attribution: unknown | null;
  /** True when a fulfillment_intake task was enqueued without error. */
  intakeEnqueued: boolean;
  /** Human-readable reasons anything was skipped or failed. Never thrown. */
  problems: string[];
}

/**
 * The idempotency key an intake task is claimed under: the bare PaymentIntent
 * id, and it must stay bare.
 *
 * There is a SECOND fulfillment_intake producer in this function — the BOH
 * branch on payment_intent.succeeded, gated on `pi.metadata.patina_order ===
 * 'boh_v1'` — and it keys on `pi.id`. Nothing sets that flag today and a direct
 * order deliberately does not, but sharing the key means that even if both
 * producers ever fired for one PaymentIntent, the second is a no-op instead of
 * a duplicate order. A prefixed key would have made two.
 */
export function fulfillmentIntakeIdempotencyKey(paymentIntentId: string): string {
  return paymentIntentId;
}

/**
 * Two effects, in this order:
 *
 *   1. `settle_direct_order_attribution` (00540) — credits designer_earnings
 *      once (partial unique index on order_id) and posts the system message
 *      into the project thread. One RPC because both are one transaction, and
 *      because rpc_start_project_thread demands an auth.uid() the service-role
 *      webhook does not have.
 *   2. `enqueue_agent_task('fulfillment_intake', { payment_intent_id })` — the
 *      piece joins the rail that ships it, which is the whole of "where is it".
 *      NOTHING in the repo enqueued this before 00540: the worker
 *      (fulfillment-intake/core.ts) and the cron (00354) were both built and
 *      both waiting on a producer that did not exist.
 *
 * NEVER THROWS, and that is deliberate rather than lazy. Both effects hang off
 * markDirectOrderPaid's guarded flip, which returns true exactly once — so a
 * failure here means work was missed, not work that should be retried, and
 * throwing would make Stripe redeliver an event whose money is already settled
 * and whose payable state has already moved. Failures are returned and logged
 * loudly instead, exactly as sendDirectOrderPaidEmails does.
 *
 * Idempotent at both ends anyway: the earnings index makes the credit
 * once-only, and fulfillment_intake_order dedupes on stripe_payment_intent_id
 * (00353) on top of enqueue_agent_task's own idempotency key.
 */
export async function runDirectOrderSettleEffects(
  admin: SettleRpcClient,
  orderId: string,
  paymentIntentId: string | null,
): Promise<SettleEffectsResult> {
  const result: SettleEffectsResult = {
    attribution: null,
    intakeEnqueued: false,
    problems: [],
  };

  try {
    const { data, error } = await admin.rpc('settle_direct_order_attribution', {
      p_order_id: orderId,
    });
    if (error) {
      result.problems.push(`attribution settle failed: ${error.message}`);
    } else {
      result.attribution = data;
    }
  } catch (err) {
    result.problems.push(`attribution settle threw: ${String(err)}`);
  }

  if (!paymentIntentId) {
    // Real only on a PI-less settle path. Loud, because it costs the client the
    // "where is it" screen the whole of Q6 exists to give her.
    result.problems.push('no payment intent on the settled order — fulfillment_intake not enqueued');
    return result;
  }

  try {
    const { error } = await admin.rpc('enqueue_agent_task', {
      p_task_type: 'fulfillment_intake',
      p_payload: { payment_intent_id: paymentIntentId },
      p_source: 'stripe-webhook',
      p_entity_type: 'direct_order',
      p_entity_id: orderId,
      p_idempotency_key: fulfillmentIntakeIdempotencyKey(paymentIntentId),
      p_on_conflict: 'ignore',
      p_priority: 2,
      p_summary: `Direct order ${orderId} settled — intake onto the fulfillment rail`,
      p_actor: 'stripe-webhook',
    });
    if (error) {
      result.problems.push(`fulfillment_intake enqueue failed: ${error.message}`);
    } else {
      result.intakeEnqueued = true;
    }
  } catch (err) {
    result.problems.push(`fulfillment_intake enqueue threw: ${String(err)}`);
  }

  return result;
}
