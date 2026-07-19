// Offline unit tests for fulfillment-intake/core.ts (S0, tasks B1/B3).
//
// Exercises normalizeIntakePayload's Stripe-PI→RPC-payload mapping (a mapped
// line and an unmapped/empty-cart line), intakeInlinePI's single-call
// delegation to fulfillment_intake_order, and the worker path's
// claim→fetch→RPC→complete loop — all against the in-memory fake-supabase
// harness. No live stack, no network.
//
// Idempotency itself lives in SQL (fulfillment_intake_order's
// ON CONFLICT (stripe_payment_intent_id) DO NOTHING, 00353) — this suite
// proves the wrapper never dedupes client-side: it always delegates to the
// RPC and simply relays back whatever order id the RPC returns (the fake RPC
// below mimics the real one's idempotency by keying on payment_intent.id, so
// re-delivery yields the SAME id without a second row being invented). Run:
//   deno test --no-check -A --config supabase/functions/deno.json \
//     supabase/functions/_tests/fulfillment-intake.test.ts

import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFakeSupabase } from './fake-supabase.ts';
import { normalizeIntakePayload, intakeInlinePI, runIntakeWorker, type IntakeDeps } from '../fulfillment-intake/core.ts';

// ─── normalizeIntakePayload ──────────────────────────────────────────────────

Deno.test('normalizeIntakePayload: mapped-line PI → correct lines/totals/client/designer shape', () => {
  const pi = {
    id: 'pi_mapped_1',
    livemode: false,
    amount: 11000,
    metadata: {
      client_name: 'Jane Client',
      client_email: 'jane@example.com',
      client_profile_id: 'c0000000-0000-0000-0000-000000000001',
      designer_profile_id: 'd0000000-0000-0000-0000-000000000001',
      designer_client_id: 'dc000000-0000-0000-0000-000000000001',
      designer_attribution: JSON.stringify({ source: 'referral' }),
      ship_to: JSON.stringify({ line1: '1 Main St', city: 'Austin' }),
      captured_total_cents: '11000',
      product_subtotal_cents: '10000',
      freight_charged_cents: '0',
      tax_cents: '1000',
      lines: JSON.stringify([
        { product_id: 'a0000000-0000-0000-0000-000000000001', item_name: 'Sofa', qty: 1, unit_price_cents: 10000 },
      ]),
    },
  };

  const payload = normalizeIntakePayload(pi);

  assertEquals(payload.payment_intent, { id: 'pi_mapped_1', livemode: false });
  assertEquals(payload.client, {
    name: 'Jane Client',
    email: 'jane@example.com',
    profile_id: 'c0000000-0000-0000-0000-000000000001',
  });
  const designer = payload.designer as Record<string, unknown>;
  assertEquals(designer.profile_id, 'd0000000-0000-0000-0000-000000000001');
  assertEquals(designer.designer_client_id, 'dc000000-0000-0000-0000-000000000001');
  assertEquals(designer.attribution, { source: 'referral' });
  assertEquals(payload.ship_to, { line1: '1 Main St', city: 'Austin' });
  assertEquals(payload.totals, {
    captured_total_cents: 11000,
    product_subtotal_cents: 10000,
    freight_charged_cents: 0,
    tax_cents: 1000,
  });
  assertEquals(payload.lines, [
    { product_id: 'a0000000-0000-0000-0000-000000000001', item_name: 'Sofa', qty: 1, unit_price_cents: 10000 },
  ]);
});

Deno.test('normalizeIntakePayload: unmapped/minimal PI (no cart metadata) → safe defaults, empty lines', () => {
  const pi = {
    id: 'pi_unmapped_1',
    livemode: false,
    amount: 5000,
    metadata: {
      captured_total_cents: '5000',
      product_subtotal_cents: '5000',
      freight_charged_cents: '0',
      tax_cents: '0',
    },
  };

  const payload = normalizeIntakePayload(pi);

  assertEquals(payload.client, { name: 'Unknown Client', email: null, profile_id: null });
  assertEquals(payload.designer, { profile_id: null, designer_client_id: null, attribution: null });
  assertEquals(payload.ship_to, null);
  assertEquals(payload.lines, []);
  assertEquals(payload.totals, {
    captured_total_cents: 5000,
    product_subtotal_cents: 5000,
    freight_charged_cents: 0,
    tax_cents: 0,
  });
});

Deno.test('normalizeIntakePayload: falls back to pi.amount when captured_total_cents metadata is absent', () => {
  const pi = { id: 'pi_fallback_1', amount: 4200, metadata: {} };
  const payload = normalizeIntakePayload(pi);
  assertEquals((payload.totals as Record<string, unknown>).captured_total_cents, 4200);
});

Deno.test('normalizeIntakePayload: livemode defaults to false when the PI carries none', () => {
  const pi = { id: 'pi_no_livemode', amount: 100, metadata: {} };
  const payload = normalizeIntakePayload(pi);
  assertEquals(payload.payment_intent, { id: 'pi_no_livemode', livemode: false });
});

// ─── intakeInlinePI ───────────────────────────────────────────────────────────

/** A fake RPC that mimics the real fulfillment_intake_order's idempotency:
 *  same payment_intent.id → same order id, without a second "row" existing. */
function depsWithFakeRpc() {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const ordersByPi = new Map<string, string>();
  const sb = createFakeSupabase(
    {},
    {
      fulfillment_intake_order: (args) => {
        calls.push({ fn: 'fulfillment_intake_order', args });
        const payload = args.p_payload as Record<string, unknown>;
        const piId = (payload.payment_intent as Record<string, unknown>)?.id as string;
        if (ordersByPi.has(piId)) {
          return { data: ordersByPi.get(piId), error: null };
        }
        const orderId = crypto.randomUUID();
        ordersByPi.set(piId, orderId);
        return { data: orderId, error: null };
      },
    },
  );
  const deps: IntakeDeps = {
    supabase: sb as unknown as IntakeDeps['supabase'],
    now: () => new Date('2026-07-16T00:00:00Z'),
  };
  return { deps, calls };
}

function minimalPi(id: string, amount: number) {
  return {
    id,
    amount,
    metadata: {
      captured_total_cents: String(amount),
      product_subtotal_cents: String(amount),
      freight_charged_cents: '0',
      tax_cents: '0',
    },
  };
}

Deno.test('intakeInlinePI: calls fulfillment_intake_order once with the normalized payload; returns its uuid', async () => {
  const { deps, calls } = depsWithFakeRpc();

  const orderId = await intakeInlinePI(deps, minimalPi('pi_once_1', 3000), 'seed');

  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, 'fulfillment_intake_order');
  assertEquals(calls[0].args.p_actor, 'seed');
  const sentPayload = calls[0].args.p_payload as Record<string, unknown>;
  assertEquals((sentPayload.payment_intent as Record<string, unknown>).id, 'pi_once_1');
  assert(typeof orderId === 'string' && orderId.length > 0);
});

Deno.test('intakeInlinePI: defaults actor to "seed" when none given', async () => {
  const { deps, calls } = depsWithFakeRpc();
  await intakeInlinePI(deps, minimalPi('pi_default_actor', 100));
  assertEquals(calls[0].args.p_actor, 'seed');
});

Deno.test('intakeInlinePI: propagates (throws) when the RPC errors', async () => {
  const sb = createFakeSupabase({}, { fulfillment_intake_order: () => ({ data: null, error: { message: 'boom' } }) });
  const deps: IntakeDeps = { supabase: sb as unknown as IntakeDeps['supabase'], now: () => new Date() };
  let threw = false;
  try {
    await intakeInlinePI(deps, minimalPi('pi_err_1', 100), 'seed');
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes('boom'));
  }
  assert(threw, 'a failed RPC call must throw');
});

Deno.test('idempotent re-delivery: two intakeInlinePI calls for the same PI both route through the RPC and return the SAME order id', async () => {
  const { deps, calls } = depsWithFakeRpc();
  const pi = minimalPi('pi_redelivered_1', 7000);

  const first = await intakeInlinePI(deps, pi, 'seed');
  const second = await intakeInlinePI(deps, pi, 'seed');

  // Idempotency is enforced in SQL, NOT client-side: the wrapper must still
  // delegate to the RPC on the second call — no client-side dedup/cache.
  assertEquals(calls.length, 2, 'the wrapper must not dedupe client-side — it always delegates to the RPC');
  assertEquals(first, second, 'redelivery must return the SAME order id the RPC returned the first time');
});

// ─── runIntakeWorker (worker path: claim → fetch → RPC → complete) ──────────

Deno.test('runIntakeWorker: claims fulfillment_intake tasks, re-fetches the PI, calls the RPC, completes done', async () => {
  const claims: Array<Record<string, unknown>> = [];
  const completions: Array<Record<string, unknown>> = [];
  const claimedTasks = [
    {
      id: 'task_1',
      task_type: 'fulfillment_intake',
      status: 'running',
      payload: { payment_intent_id: 'pi_worker_1' },
      artifacts: {},
    },
  ];
  const sb = createFakeSupabase(
    {},
    {
      claim_agent_tasks: (args) => {
        claims.push(args);
        return { data: claimedTasks, error: null };
      },
      complete_agent_task: (args) => {
        completions.push(args);
        return { data: null, error: null };
      },
      fulfillment_intake_order: () => ({ data: 'order-uuid-1', error: null }),
    },
  );
  const fetched: string[] = [];
  const deps: IntakeDeps = {
    supabase: sb as unknown as IntakeDeps['supabase'],
    fetchPaymentIntent: (id) => {
      fetched.push(id);
      return Promise.resolve(minimalPi(id, 9900));
    },
    now: () => new Date(),
    worker: 'fulfillment-intake-test-worker',
  };

  const result = await runIntakeWorker(deps);

  assertEquals(result, { processed: 1, failed: 0 });
  assertEquals(fetched, ['pi_worker_1']);
  assertEquals(claims[0].p_worker, 'fulfillment-intake-test-worker');
  assertEquals(completions.length, 1);
  assertEquals(completions[0].p_outcome, 'done');
  assertEquals(completions[0].p_actor, 'fulfillment-intake-test-worker');
  assertEquals((completions[0].p_artifacts as Record<string, unknown>).order_id, 'order-uuid-1');
});

Deno.test('runIntakeWorker: a task claimed without fetchPaymentIntent wired completes failed, non-fatal to the batch', async () => {
  const completions: Array<Record<string, unknown>> = [];
  const claimedTasks = [
    { id: 'task_2', task_type: 'fulfillment_intake', status: 'running', payload: { payment_intent_id: 'pi_x' }, artifacts: {} },
  ];
  const sb = createFakeSupabase(
    {},
    {
      claim_agent_tasks: () => ({ data: claimedTasks, error: null }),
      complete_agent_task: (args) => {
        completions.push(args);
        return { data: null, error: null };
      },
    },
  );
  const deps: IntakeDeps = {
    supabase: sb as unknown as IntakeDeps['supabase'],
    now: () => new Date(),
    worker: 'fulfillment-intake-failure-worker',
  };

  const result = await runIntakeWorker(deps);

  assertEquals(result, { processed: 0, failed: 1 });
  assertEquals(completions[0].p_outcome, 'failed');
  assertEquals(completions[0].p_actor, 'fulfillment-intake-failure-worker');
});

Deno.test('runIntakeWorker: no claimed tasks → processed/failed both 0, no RPC calls', async () => {
  const sb = createFakeSupabase({}, { claim_agent_tasks: () => ({ data: [], error: null }) });
  const deps: IntakeDeps = { supabase: sb as unknown as IntakeDeps['supabase'], now: () => new Date() };
  const result = await runIntakeWorker(deps);
  assertEquals(result, { processed: 0, failed: 0 });
});

Deno.test('runIntakeWorker: overlapping invocations use distinct base-prefixed lease owners through completion', async () => {
  function invocation(label: string) {
    const claims: Array<Record<string, unknown>> = [];
    const completions: Array<Record<string, unknown>> = [];
    const sb = createFakeSupabase(
      {},
      {
        claim_agent_tasks: (args) => {
          claims.push(args);
          return {
            data: [
              {
                id: `task_${label}`,
                task_type: 'fulfillment_intake',
                status: 'running',
                payload: { payment_intent_id: `pi_${label}` },
                artifacts: {},
              },
            ],
            error: null,
          };
        },
        complete_agent_task: (args) => {
          completions.push(args);
          return { data: null, error: null };
        },
        fulfillment_intake_order: () => ({ data: `order_${label}`, error: null }),
      },
    );
    return {
      claims,
      completions,
      run: () =>
        runIntakeWorker({
          supabase: sb as unknown as IntakeDeps['supabase'],
          fetchPaymentIntent: (id) => Promise.resolve(minimalPi(id, 1000)),
          now: () => new Date(),
        }),
    };
  }

  const first = invocation('first');
  const second = invocation('second');
  await Promise.all([first.run(), second.run()]);

  const firstOwner = first.claims[0].p_worker as string;
  const secondOwner = second.claims[0].p_worker as string;
  assert(firstOwner.startsWith('fulfillment-intake:'));
  assert(secondOwner.startsWith('fulfillment-intake:'));
  assertNotEquals(firstOwner, secondOwner);
  assertEquals(first.completions[0].p_actor, firstOwner);
  assertEquals(second.completions[0].p_actor, secondOwner);
});

Deno.test('runIntakeWorker: a stale completion is a benign lease loss, not a retry or invocation failure', async () => {
  let completionCalls = 0;
  const sb = createFakeSupabase(
    {},
    {
      claim_agent_tasks: () => ({
        data: [
          {
            id: 'task_stale',
            task_type: 'fulfillment_intake',
            status: 'running',
            payload: { payment_intent_id: 'pi_stale' },
            artifacts: {},
          },
        ],
        error: null,
      }),
      fulfillment_intake_order: () => ({ data: 'order_stale', error: null }),
      complete_agent_task: () => {
        completionCalls++;
        return {
          data: null,
          error: {
            message:
              'complete_agent_task: lease ownership rejected for task task_stale (locked_by fulfillment-intake:new, p_actor fulfillment-intake:old)',
          },
        };
      },
    },
  );

  const result = await runIntakeWorker({
    supabase: sb as unknown as IntakeDeps['supabase'],
    fetchPaymentIntent: (id) => Promise.resolve(minimalPi(id, 1000)),
    now: () => new Date(),
    worker: 'fulfillment-intake:old',
  });

  assertEquals(result, { processed: 0, failed: 0 });
  assertEquals(completionCalls, 1, 'must not retry completion as a failed outcome after losing the lease');
});
