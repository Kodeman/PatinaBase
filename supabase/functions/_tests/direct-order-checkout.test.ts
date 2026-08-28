// Offline unit tests for the direct-order Checkout branch and its settle
// effects (00540 / Daily Return W5).
//
// Two modules, both pure or fake-backed, so the money path is provable without
// a running stack, a signed webhook, or a real Stripe key — which matters here
// more than usual: the local STRIPE_SECRET_KEY is a 32-character placeholder,
// so no live Checkout can be opened at all and these tests plus the pgTAP suite
// are what "the purchase works" rests on until Kody supplies a real sk_test_.
//
// Run:
//   deno test --no-check -A --config supabase/functions/deno.json \
//     supabase/functions/_tests/direct-order-checkout.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFakeSupabase } from './fake-supabase.ts';
import {
  buildDirectOrderIntakeMetadata,
  directOrderFreightCents,
  directOrderSessionExtras,
  parseTaxShippingConfig,
  productSubtotalCents,
  type DirectOrderFacts,
} from '../create-checkout-session/direct-order.ts';
import {
  directOrderIntakeTotals,
  directOrderTotalsFromPaymentIntent,
  directOrderTotalsFromSession,
  fulfillmentIntakeIdempotencyKey,
  runDirectOrderSettleEffects,
  type SettleRpcClient,
} from '../stripe-webhook/direct-order-settle.ts';

const ORDER_ID = 'd0000000-0000-0000-0000-00000000000a';
const CLIENT_ID = 'c0000000-0000-0000-0000-00000000000b';
const DESIGNER_ID = 'e0000000-0000-0000-0000-00000000000c';
const PROJECT_ID = 'b0000000-0000-0000-0000-00000000000d';
const PRODUCT_ID = 'a0000000-0000-0000-0000-00000000000e';

/** A $4,200 piece, quantity 1, no freight. */
function baseOrder(over: Partial<DirectOrderFacts> = {}): DirectOrderFacts {
  return {
    id: ORDER_ID,
    client_id: CLIENT_ID,
    product_id: PRODUCT_ID,
    product_name: 'Heirloom Oak Dining Table',
    quantity: 1,
    unit_price_cents: 420000,
    amount_cents: 420000,
    designer_id: null,
    project_id: null,
    ...over,
  };
}

// ─── the freight fold ────────────────────────────────────────────────────────

Deno.test('freight is the remainder of the snapshotted total, not a column', () => {
  assertEquals(directOrderFreightCents(baseOrder()), 0);

  // create_direct_order folded an 18000-cent flat freight in ONCE, on top of
  // 2 × 420000. Freight is per delivery, not per unit.
  const freighted = baseOrder({ quantity: 2, amount_cents: 420000 * 2 + 18000 });
  assertEquals(productSubtotalCents(freighted), 840000);
  assertEquals(directOrderFreightCents(freighted), 18000);
});

Deno.test('a pre-00540 order (no fold) reports no freight rather than a negative', () => {
  // Defensive: if amount_cents ever came back below the line total, the answer
  // is 0, never a negative Checkout line.
  const odd = baseOrder({ quantity: 2, amount_cents: 100 });
  assertEquals(directOrderFreightCents(odd), 0);
});

// ─── the tax / shipping config gate ──────────────────────────────────────────

Deno.test('parseTaxShippingConfig fails closed on everything but an explicit true', () => {
  for (const value of [null, undefined, {}, { enabled: false }, { enabled: 'true' }, 'nope', 7]) {
    assertEquals(
      parseTaxShippingConfig(value),
      { enabled: false, shippingRateIds: [] },
      `expected OFF for ${JSON.stringify(value)}`,
    );
  }
});

Deno.test('parseTaxShippingConfig reads dashboard rate ids, and only strings', () => {
  assertEquals(parseTaxShippingConfig({ enabled: true }), { enabled: true, shippingRateIds: [] });
  assertEquals(
    parseTaxShippingConfig({ enabled: true, shipping_rate_ids: ['shr_1', '', 42, null, 'shr_2'] }),
    { enabled: true, shippingRateIds: ['shr_1', 'shr_2'] },
  );
});

// ─── the session's optional parts ────────────────────────────────────────────

Deno.test('flag OFF: no automatic_tax, no shipping options — the sheet says so', () => {
  const extras = directOrderSessionExtras({
    order: baseOrder({ quantity: 2, amount_cents: 420000 * 2 + 18000 }),
    currency: 'usd',
    taxShipping: { enabled: false, shippingRateIds: ['shr_ignored'] },
  });

  assertEquals(extras.automaticTax, undefined);
  assertEquals(extras.shippingOptions, undefined);

  // …but the folded freight still bills, as its own visible line.
  assertEquals(extras.additionalLineItems?.length, 1);
  assertEquals(extras.additionalLineItems?.[0], {
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: 18000,
      product_data: { name: 'Delivery' },
    },
  });
});

Deno.test('flag ON: automatic_tax and the configured rates, and nothing invented', () => {
  const withRates = directOrderSessionExtras({
    order: baseOrder(),
    currency: 'usd',
    taxShipping: { enabled: true, shippingRateIds: ['shr_std', 'shr_white_glove'] },
  });
  assertEquals(withRates.automaticTax, { enabled: true });
  assertEquals(withRates.shippingOptions, [
    { shipping_rate: 'shr_std' },
    { shipping_rate: 'shr_white_glove' },
  ]);
  // no freight on this order, so no Delivery line
  assertEquals(withRates.additionalLineItems, undefined);

  // Enabled with no configured rate: tax is added, shipping is NOT invented.
  const noRates = directOrderSessionExtras({
    order: baseOrder(),
    currency: 'usd',
    taxShipping: { enabled: true, shippingRateIds: [] },
  });
  assertEquals(noRates.automaticTax, { enabled: true });
  assertEquals(noRates.shippingOptions, undefined);
});

// ─── the fulfillment-intake metadata contract ────────────────────────────────

Deno.test('PI metadata satisfies normalizeIntakePayload, uncredited case', () => {
  const md = buildDirectOrderIntakeMetadata({
    order: baseOrder({ quantity: 2, amount_cents: 420000 * 2 + 18000 }),
    clientName: 'Ruth Calder',
    clientEmail: 'ruth@example.invalid',
    designerClientId: null,
  });

  assertEquals(md.payable_type, 'direct_order');
  assertEquals(md.direct_order_id, ORDER_ID);
  assertEquals(md.client_profile_id, CLIENT_ID);
  assertEquals(md.client_name, 'Ruth Calder');
  assertEquals(md.client_email, 'ruth@example.invalid');
  assertEquals(md.product_subtotal_cents, '840000');
  assertEquals(md.freight_charged_cents, '18000');
  assertEquals(md.tax_cents, '0');

  // No designer resolved ⇒ nothing claimed about one.
  assertEquals(md.designer_profile_id, undefined);
  assertEquals(md.designer_attribution, undefined);
  assertEquals(md.designer_client_id, undefined);

  // captured_total_cents is deliberately absent: normalizeIntakePayload falls
  // back to pi.amount, which is what Stripe actually took.
  assertEquals(md.captured_total_cents, undefined);
  // ship_to likewise — the address is collected inside the session, after this.
  assertEquals(md.ship_to, undefined);

  const lines = JSON.parse(md.lines);
  assertEquals(lines, [
    {
      product_id: PRODUCT_ID,
      item_name: 'Heirloom Oak Dining Table',
      qty: 2,
      unit_price_cents: 420000,
    },
  ]);
});

Deno.test('PI metadata carries the attribution when one resolved', () => {
  const md = buildDirectOrderIntakeMetadata({
    order: baseOrder({ designer_id: DESIGNER_ID, project_id: PROJECT_ID }),
    clientName: null,
    clientEmail: null,
    designerClientId: 'dc000000-0000-0000-0000-00000000000f',
  });

  assertEquals(md.designer_profile_id, DESIGNER_ID);
  assertEquals(md.designer_client_id, 'dc000000-0000-0000-0000-00000000000f');
  // No commission_rate. fulfillment_intake_order files this whole sub-object as
  // fulfillment_orders.designer_attribution (00353:87) and 00540's client policy
  // hands the buyer her own order row — so a rate here is a rate she reads, and
  // direction B §5 discloses that a commission exists, never its size.
  const attribution = JSON.parse(md.designer_attribution);
  assertEquals(attribution, {
    source: 'direct_order',
    direct_order_id: ORDER_ID,
    project_id: PROJECT_ID,
  });
  assert(
    !('commission_rate' in attribution),
    'the buyer must not read her designer\'s rate off her own order',
  );
  assert(
    !JSON.stringify(md).includes('commission'),
    'and no metadata key may carry it either',
  );

  // A missing buyer profile must not block a payment — the intake RPC defaults
  // the name too, and this mirrors it rather than throwing.
  assertEquals(md.client_name, 'Unknown Client');
  assertEquals(md.client_email, undefined);
});

Deno.test('PI metadata stays inside Stripe’s 50-key / 500-char caps', () => {
  const md = buildDirectOrderIntakeMetadata({
    order: baseOrder({ designer_id: DESIGNER_ID, project_id: PROJECT_ID }),
    clientName: 'A'.repeat(80),
    clientEmail: 'b'.repeat(60) + '@example.invalid',
    designerClientId: 'dc000000-0000-0000-0000-00000000000f',
  });
  assert(Object.keys(md).length <= 50, `too many metadata keys: ${Object.keys(md).length}`);
  for (const [k, v] of Object.entries(md)) {
    assert(v.length <= 500, `metadata value ${k} is ${v.length} chars, over Stripe's 500 cap`);
  }
});

// ─── the intake split ────────────────────────────────────────────────────────
//
// The one property that matters: subtotal + freight + tax MUST equal captured.
// fulfillment_orders carries chk_fulfillment_captured_identity (00360:428) and
// posts a T1 ledger entry of the same shape behind it, so a split that does not
// sum is refused at the INSERT and takes the whole intake with it — no order
// row, no "where is it", and a task that fails identically on every retry.
// supabase/tests/commercial/fulfillment_intake_ledger_balance_test.sql proves
// the database really does refuse it; these prove we never hand it one.

function assertBalanced(t: ReturnType<typeof directOrderIntakeTotals>) {
  assertEquals(
    t.product_subtotal_cents + t.freight_charged_cents + t.tax_cents,
    t.captured_total_cents,
    `unbalanced split: ${JSON.stringify(t)}`,
  );
  assert(t.product_subtotal_cents >= 0, 'subtotal may never go negative');
}

Deno.test('flag OFF: the split is exactly what the order snapshotted', () => {
  const totals = directOrderTotalsFromSession(
    { quantity: 2, unit_price_cents: 420000, amount_cents: 420000 * 2 + 18000 },
    { amount_total: 858000, total_details: { amount_tax: 0, amount_shipping: 0 } },
  );
  assertEquals(totals, {
    captured_total_cents: 858000,
    product_subtotal_cents: 840000,
    freight_charged_cents: 18000,
    tax_cents: 0,
  });
  assertBalanced(totals);
});

Deno.test('flag ON: Stripe Tax and a shipping rate land in their own buckets', () => {
  // 420000 piece + 18000 folded Delivery = 438000 amount_subtotal; Stripe adds
  // 33200 of tax and a 9500 shipping rate on top.
  const totals = directOrderTotalsFromSession(
    { quantity: 1, unit_price_cents: 420000, amount_cents: 438000 },
    { amount_total: 480700, total_details: { amount_tax: 33200, amount_shipping: 9500 } },
  );
  assertEquals(totals, {
    captured_total_cents: 480700,
    product_subtotal_cents: 420000,
    freight_charged_cents: 27500,   // 18000 folded + 9500 Stripe rate
    tax_cents: 33200,
  });
  assertBalanced(totals);
});

Deno.test('flag ON, the OLD metadata split is what this replaces', () => {
  // What buildDirectOrderIntakeMetadata alone would have said: captured falls
  // back to pi.amount (tax included), tax hardcoded 0. It does not sum, and the
  // intake would abort on chk_fulfillment_captured_identity.
  const stale = { captured: 480700, subtotal: 420000, freight: 18000, tax: 0 };
  assert(
    stale.subtotal + stale.freight + stale.tax !== stale.captured,
    'this is the split the fix exists to stop producing',
  );
});

Deno.test('PaymentIntent-only settle: the remainder is booked as tax, never as piece', () => {
  const totals = directOrderTotalsFromPaymentIntent(
    { quantity: 1, unit_price_cents: 420000, amount_cents: 438000 },
    { amount: 471200, amount_received: 471200 },
  );
  assertEquals(totals.product_subtotal_cents, 420000);
  assertEquals(totals.freight_charged_cents, 18000);
  assertEquals(totals.tax_cents, 33200);
  assertBalanced(totals);
});

Deno.test('the split is balanced by construction, even on nonsense input', () => {
  // A captured total BELOW the snapshot (impossible without a coupon we never
  // set, but the ledger does not care why): freight and tax are clamped inside
  // it rather than driving the subtotal negative.
  const low = directOrderIntakeTotals({
    capturedTotalCents: 5000,
    pieceSubtotalCents: 420000,
    foldedFreightCents: 18000,
    taxCents: 33200,
  });
  assertBalanced(low);

  for (const captured of [0, -1, 1, 999999999]) {
    assertBalanced(directOrderIntakeTotals({
      capturedTotalCents: captured,
      pieceSubtotalCents: 420000,
      foldedFreightCents: 18000,
    }));
  }
});

// ─── the settle effects ──────────────────────────────────────────────────────

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

/** A fake that records every RPC and can be told to fail a named one. */
function rpcRecorder(opts: { fail?: string; throwOn?: string } = {}) {
  const calls: RpcCall[] = [];
  const client: SettleRpcClient = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (opts.throwOn === name) throw new Error(`boom in ${name}`);
      if (opts.fail === name) {
        return Promise.resolve({ data: null, error: { message: `${name} exploded` } });
      }
      return Promise.resolve({
        data: name === 'settle_direct_order_attribution'
          ? { credited: true, thread_message: true }
          : { id: 'task-1' },
        error: null,
      });
    },
  };
  return { client, calls };
}

Deno.test('settle credits attribution and enqueues intake, in that order', async () => {
  const { client, calls } = rpcRecorder();
  const out = await runDirectOrderSettleEffects(client, ORDER_ID, 'pi_test_123');

  assertEquals(calls.map((c) => c.name), [
    'settle_direct_order_attribution',
    'enqueue_agent_task',
  ]);
  assertEquals(calls[0].args, { p_order_id: ORDER_ID });
  assertEquals(calls[1].args.p_task_type, 'fulfillment_intake');
  assertEquals(calls[1].args.p_payload, { payment_intent_id: 'pi_test_123' });
  assertEquals(calls[1].args.p_entity_type, 'direct_order');
  assertEquals(calls[1].args.p_entity_id, ORDER_ID);

  // The bare PI id: the pre-existing BOH producer keys on the same value, so
  // two producers for one PaymentIntent can never make two orders.
  assertEquals(calls[1].args.p_idempotency_key, 'pi_test_123');
  assertEquals(fulfillmentIntakeIdempotencyKey('pi_test_123'), 'pi_test_123');
  assertEquals(calls[1].args.p_on_conflict, 'ignore');

  assertEquals(out.intakeEnqueued, true);
  assertEquals(out.attribution, { credited: true, thread_message: true });
  assertEquals(out.problems, []);
});

Deno.test('the settled split rides the task payload, where the worker reads it', async () => {
  const { client, calls } = rpcRecorder();
  const totals = directOrderTotalsFromSession(
    { quantity: 1, unit_price_cents: 420000, amount_cents: 438000 },
    { amount_total: 471200, total_details: { amount_tax: 33200, amount_shipping: 0 } },
  );
  await runDirectOrderSettleEffects(client, ORDER_ID, 'pi_test_123', totals);

  // On the task, not back onto the PaymentIntent: a Stripe write can fail and
  // this cannot, and the metadata was stamped before Checkout ran anyway.
  assertEquals(calls[1].args.p_payload, {
    payment_intent_id: 'pi_test_123',
    totals: {
      captured_total_cents: 471200,
      product_subtotal_cents: 420000,
      freight_charged_cents: 18000,
      tax_cents: 33200,
    },
  });
});

Deno.test('a failed credit still enqueues the intake, and never throws', async () => {
  const { client, calls } = rpcRecorder({ fail: 'settle_direct_order_attribution' });
  const out = await runDirectOrderSettleEffects(client, ORDER_ID, 'pi_test_123');

  // The client still gets her "where is it" even when the designer's credit
  // failed — one missed effect must not cascade into two.
  assertEquals(calls.length, 2);
  assertEquals(out.intakeEnqueued, true);
  assertEquals(out.attribution, null);
  assertEquals(out.problems.length, 1);
  assert(out.problems[0].includes('attribution settle failed'));
});

Deno.test('a thrown RPC is captured, not propagated — the settle must not retry', async () => {
  const { client } = rpcRecorder({ throwOn: 'enqueue_agent_task' });
  const out = await runDirectOrderSettleEffects(client, ORDER_ID, 'pi_test_123');

  // If this threw, Stripe would redeliver an event whose money is already
  // settled and whose payable row has already flipped.
  assertEquals(out.intakeEnqueued, false);
  assertEquals(out.problems.length, 1);
  assert(out.problems[0].includes('enqueue threw'));
});

Deno.test('no PaymentIntent: the credit still runs, the intake is skipped loudly', async () => {
  const { client, calls } = rpcRecorder();
  const out = await runDirectOrderSettleEffects(client, ORDER_ID, null);

  assertEquals(calls.map((c) => c.name), ['settle_direct_order_attribution']);
  assertEquals(out.intakeEnqueued, false);
  assertEquals(out.problems.length, 1);
  assert(out.problems[0].includes('no payment intent'));
});

Deno.test('the effects are safe to re-run: the RPCs, not this module, dedupe', async () => {
  // The webhook only reaches here on markDirectOrderPaid's guarded flip, which
  // is true exactly once. This proves the module adds no client-side dedupe of
  // its own that could mask a genuine second settle — it delegates, twice over,
  // to the earnings partial unique index and to enqueue_agent_task's key.
  const store = { agent_tasks: [] as Record<string, unknown>[] };
  const fake = createFakeSupabase(store);
  const calls: RpcCall[] = [];
  const client: SettleRpcClient = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'enqueue_agent_task') {
        const key = args.p_idempotency_key as string;
        const existing = store.agent_tasks.find((t) => t.idempotency_key === key);
        if (!existing) {
          store.agent_tasks.push({ id: `task-${store.agent_tasks.length + 1}`, idempotency_key: key });
        }
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: { credited: calls.length === 1 }, error: null });
    },
  };
  void fake;

  await runDirectOrderSettleEffects(client, ORDER_ID, 'pi_replay');
  await runDirectOrderSettleEffects(client, ORDER_ID, 'pi_replay');

  assertEquals(calls.filter((c) => c.name === 'enqueue_agent_task').length, 2);
  assertEquals(store.agent_tasks.length, 1, 'one intake task per PaymentIntent');
});
