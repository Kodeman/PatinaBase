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
 * The four numbers fulfillment_orders is filed with — and the reason this is a
 * function and not four lines at the call site.
 *
 * `fulfillment_orders` carries `chk_fulfillment_captured_identity` (00360:428):
 * `captured_total = product_subtotal + freight_charged + tax`. Behind it,
 * `fulfillment_intake_order` posts a T1 ledger entry of the same shape
 * (`Dr 1000 = Cr 4000 + Cr 4100 + Cr 2100`, 00352:178-186) whose balance is a
 * deferred constraint trigger. A split that does not sum is refused at the
 * INSERT and aborts the ENTIRE intake transaction: no fulfillment_orders row,
 * no lines, no "where is it", and a fulfillment_intake task that fails
 * identically on every retry until it parks.
 *
 * The old metadata split could not sum once tax or a shipping rate was on the
 * session, because it was written before Checkout ran. So this reconstructs the
 * split from what was actually captured, and it is BALANCED BY CONSTRUCTION:
 * subtotal is whatever is left after tax and freight, and both are clamped
 * inside the captured total. There is no input that makes the four numbers
 * disagree, which is the only property the ledger cares about.
 */
export interface IntakeTotals {
  captured_total_cents: number;
  product_subtotal_cents: number;
  freight_charged_cents: number;
  tax_cents: number;
}

const nonNegativeInt = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function directOrderIntakeTotals(args: {
  /** What Stripe actually took: session.amount_total, else pi.amount. */
  capturedTotalCents: number;
  /** quantity × unit_price_cents on the direct_orders row. */
  pieceSubtotalCents: number;
  /** The flat freight create_direct_order folded into amount_cents. */
  foldedFreightCents: number;
  /**
   * session.total_details.amount_tax. Omit on a PaymentIntent-only settle: a
   * PI carries no breakdown, so everything above piece + freight is booked as
   * tax rather than silently inflating the piece.
   */
  taxCents?: number | null;
  /** session.total_details.amount_shipping — a Stripe shipping rate, if any. */
  shippingCents?: number | null;
}): IntakeTotals {
  const captured = nonNegativeInt(args.capturedTotalCents);
  const piece = nonNegativeInt(args.pieceSubtotalCents);
  const folded = nonNegativeInt(args.foldedFreightCents);

  const inferredTax =
    args.taxCents === undefined || args.taxCents === null
      ? captured - piece - folded
      : args.taxCents;

  const tax = Math.min(nonNegativeInt(inferredTax), captured);
  const freight = Math.min(folded + nonNegativeInt(args.shippingCents), captured - tax);

  return {
    captured_total_cents: captured,
    product_subtotal_cents: captured - tax - freight,
    freight_charged_cents: freight,
    tax_cents: tax,
  };
}

/** The snapshot half of a direct_orders row the totals are reconstructed from. */
export interface SettledOrderAmounts {
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
}

const pieceAndFreight = (order: SettledOrderAmounts) => {
  const piece = order.quantity * order.unit_price_cents;
  return { piece, folded: Math.max(0, order.amount_cents - piece) };
};

/**
 * Totals off a settled Checkout session — the authoritative path, and the one
 * every session-backed settle takes. `amount_subtotal` is the line-item sum
 * (piece + the folded Delivery line); tax and any Stripe shipping rate sit
 * outside it in `total_details`.
 */
export function directOrderTotalsFromSession(
  order: SettledOrderAmounts,
  session: {
    amount_total?: number | null;
    total_details?: { amount_tax?: number | null; amount_shipping?: number | null } | null;
  },
): IntakeTotals {
  const { piece, folded } = pieceAndFreight(order);
  return directOrderIntakeTotals({
    capturedTotalCents: session.amount_total ?? order.amount_cents,
    pieceSubtotalCents: piece,
    foldedFreightCents: folded,
    taxCents: session.total_details?.amount_tax ?? 0,
    shippingCents: session.total_details?.amount_shipping ?? 0,
  });
}

/**
 * Totals off a PaymentIntent alone — the belt-and-suspenders settle, reached
 * only when the session event never arrived. A PI carries no tax breakdown, so
 * anything above piece + folded freight is booked as tax rather than inflating
 * the piece. Stated rather than hidden: it keeps the ledger balanced and keeps
 * the overstatement in the account an operator would look in.
 */
export function directOrderTotalsFromPaymentIntent(
  order: SettledOrderAmounts,
  pi: { amount?: number | null; amount_received?: number | null },
): IntakeTotals {
  const { piece, folded } = pieceAndFreight(order);
  return directOrderIntakeTotals({
    capturedTotalCents: pi.amount_received || pi.amount || order.amount_cents,
    pieceSubtotalCents: piece,
    foldedFreightCents: folded,
  });
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
  totals?: IntakeTotals,
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
      // `totals` overrides the PI metadata's provisional split at intake. It is
      // written here rather than back onto the PaymentIntent because a Stripe
      // write can fail and this cannot, and because the numbers are ours: the
      // metadata was stamped before Checkout ran and cannot know what Stripe
      // Tax or a shipping rate added.
      p_payload: totals
        ? { payment_intent_id: paymentIntentId, totals }
        : { payment_intent_id: paymentIntentId },
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
