// Offline unit tests for the stripe-webhook reconciliation emission (WP-2.1):
// supabase/functions/stripe-webhook/reconcile-emit.ts.
//
// Covers the enqueueStripeEventTask payload contract (IDENTIFIERS ONLY — never
// object state), priority mapping, idempotency, throw-on-failure (which is what
// makes the call-site's reconcile-ONLY branch release the claim + 500), and the
// two Sets that drive the call-site's failure-semantics split (money-path →
// swallow, reconcile-only → throw). Run:
//   deno test --no-check -A --config supabase/functions/deno.json \
//     supabase/functions/_tests/stripe-webhook-emit.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  RECONCILE_EVENT_TYPES,
  MONEY_PATH_TYPES,
  reconcileEventPriority,
  enqueueStripeEventTask,
} from '../stripe-webhook/reconcile-emit.ts';

// A minimal RpcClient stand-in that records enqueue_agent_task calls.
function recordingClient(opts: { fail?: boolean } = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    // deno-lint-ignore require-await
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args: args ?? {} });
      if (opts.fail) return { data: null, error: { message: 'enqueue boom' } };
      return { data: { id: 'task_1', ...(args ?? {}) }, error: null };
    },
  };
  return { client, calls };
}

// deno-lint-ignore no-explicit-any
function makeEvent(type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}): any {
  return {
    id: `evt_${type.replace(/[^a-z]/gi, '')}`,
    object: 'event',
    type,
    livemode: false,
    account: null,
    data: { object },
    ...extra,
  };
}

Deno.test('enqueueStripeEventTask: payload is IDENTIFIERS ONLY (no object state)', async () => {
  const { client, calls } = recordingClient();
  const event = makeEvent('charge.dispute.created', {
    id: 'dp_1',
    object: 'dispute',
    status: 'needs_response',
    amount: 5000,
    evidence: { secret: 'do-not-copy' },
  }, { id: 'evt_dispute_1', livemode: true, account: 'acct_9' });

  // enqueueStripeEventTask casts its admin arg → RpcClient internally, so our
  // recording client (which exposes .rpc) drives the real enqueue path.
  await enqueueStripeEventTask(client as unknown as Parameters<typeof enqueueStripeEventTask>[0], event);

  const call = calls.at(-1)!;
  assertEquals(call.fn, 'enqueue_agent_task');
  assertEquals(call.args.p_task_type, 'stripe_event');
  assertEquals(call.args.p_idempotency_key, 'evt_dispute_1');
  assertEquals(call.args.p_on_conflict, 'ignore');
  assertEquals(call.args.p_source, 'stripe-webhook');
  assertEquals(call.args.p_actor, 'stripe-webhook');

  const payload = call.args.p_payload as Record<string, unknown>;
  assertEquals(payload.event_type, 'charge.dispute.created');
  assertEquals(payload.object_id, 'dp_1');
  assertEquals(payload.object_type, 'dispute');
  assertEquals(payload.livemode, true);
  assertEquals(payload.account, 'acct_9');
  // The object's mutable state must NOT be copied.
  assert(!('status' in payload), 'payload must not carry object status');
  assert(!('amount' in payload), 'payload must not carry object amount');
  assert(!('evidence' in payload), 'payload must not carry object evidence');
  assertEquals(Object.keys(payload).sort(), ['account', 'event_type', 'livemode', 'object_id', 'object_type']);
});

Deno.test('enqueueStripeEventTask: run_after is ~now+120s', async () => {
  const { client, calls } = recordingClient();
  const before = Date.now();
  await enqueueStripeEventTask(client as unknown as Parameters<typeof enqueueStripeEventTask>[0], makeEvent('payout.paid', { id: 'po_1', object: 'payout' }));
  const runAfter = new Date(calls.at(-1)!.args.p_run_after as string).getTime();
  const deltaMs = runAfter - before;
  assert(deltaMs >= 115_000 && deltaMs <= 130_000, `run_after ~120s off, got ${deltaMs}ms`);
});

Deno.test('enqueueStripeEventTask: propagates (throws) when the enqueue RPC errors', async () => {
  const { client } = recordingClient({ fail: true });
  let threw = false;
  try {
    await enqueueStripeEventTask(client as unknown as Parameters<typeof enqueueStripeEventTask>[0], makeEvent('charge.dispute.created', { id: 'dp_x', object: 'dispute' }));
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes('boom'));
  }
  assert(threw, 'a failed enqueue must throw so the reconcile-only call site releases the claim + 500s');
});

Deno.test('priority: disputes + fraud = 1', () => {
  for (const t of ['charge.dispute.created', 'charge.dispute.closed', 'charge.dispute.funds_withdrawn', 'radar.early_fraud_warning.created']) {
    assertEquals(reconcileEventPriority(t), 1, t);
  }
});

Deno.test('priority: money-loss signals = 2', () => {
  for (const t of ['payout.failed', 'account.application.deauthorized', 'transfer.reversed', 'application_fee.refunded']) {
    assertEquals(reconcileEventPriority(t), 2, t);
  }
});

Deno.test('priority: routine = 3', () => {
  for (const t of ['payout.paid', 'charge.succeeded', 'payment_intent.succeeded', 'balance.available', 'account.updated', 'transfer.created', 'application_fee.created']) {
    assertEquals(reconcileEventPriority(t), 3, t);
  }
});

Deno.test('semantics-split routing: money-path types are the six switch cases (→ swallow)', () => {
  const expected = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.refunded',
  ].sort();
  assertEquals([...MONEY_PATH_TYPES].sort(), expected);
  // The three money-path types that ALSO reconcile → call site swallows on emit failure.
  for (const t of ['payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded']) {
    assert(RECONCILE_EVENT_TYPES.has(t) && MONEY_PATH_TYPES.has(t), `${t} should be reconcile ∩ money-path (swallow)`);
  }
});

Deno.test('semantics-split routing: reconcile-only types are NOT money-path (→ throw)', () => {
  for (const t of ['charge.dispute.created', 'radar.early_fraud_warning.created', 'payout.paid', 'payout.failed', 'account.updated', 'transfer.created', 'application_fee.created', 'balance.available', 'charge.succeeded']) {
    assert(RECONCILE_EVENT_TYPES.has(t), `${t} must be reconciled`);
    assert(!MONEY_PATH_TYPES.has(t), `${t} must be reconcile-only (throw on emit failure)`);
  }
  // checkout.session.* are money-path but NOT reconciled (no reconcile task at all).
  for (const t of ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed']) {
    assert(!RECONCILE_EVENT_TYPES.has(t), `${t} should not enqueue a reconcile task`);
  }
});
