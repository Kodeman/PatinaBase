// Offline unit tests for stripe-event-processor/core.ts (WP-2.1).
//
// Exercises the escalation table (processStripeEventTask) and the run loop
// (runProcessor) against the in-memory fake-supabase harness + an injected
// fake Stripe re-fetch. No live stack, no network. Run:
//   deno test --no-check -A --config supabase/functions/deno.json \
//     supabase/functions/_tests/stripe-event-processor.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.ts';
import {
  processStripeEventTask,
  runProcessor,
  type AgentTask,
  type EvalResult,
  type ProcessorDeps,
  type ProcessorSupabase,
  type StripeObject,
} from '../stripe-event-processor/core.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTask(payload: Record<string, unknown>, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: crypto.randomUUID(),
    task_type: 'stripe_event',
    status: 'running',
    payload,
    artifacts: {},
    ...overrides,
  } as unknown as AgentTask;
}

/** fetch that returns objects from a keyed map (by object id). */
function fetchFrom(objects: Record<string, StripeObject>): ProcessorDeps['fetchStripeObject'] {
  // deno-lint-ignore require-await
  return async (_type: string | null, id: string | null) => {
    if (id && objects[id]) return objects[id];
    throw new Error(`fake fetch: no object for ${id}`);
  };
}

function depsFor(sb: FakeSupabase, fetchStripeObject: ProcessorDeps['fetchStripeObject']): ProcessorDeps {
  return {
    supabase: sb as unknown as ProcessorSupabase,
    fetchStripeObject,
    now: () => new Date('2026-07-12T00:00:00Z'),
  };
}

function checkByName(r: EvalResult, name: string) {
  return r.artifacts.checks.find((c) => c.name === name);
}

// ─── escalation matrix ─────────────────────────────────────────────────────────

Deno.test('dispute.created → awaiting_review (confidence 0.5, every state needs ack)', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'dp_1', object: 'dispute', status: 'needs_response', reason: 'fraudulent', amount: 5000, currency: 'usd', charge: 'ch_1', payment_intent: 'pi_1' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ dp_1: obj })),
    makeTask({ event_type: 'charge.dispute.created', object_id: 'dp_1', object_type: 'dispute' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(r.confidence, 0.5);
  assertEquals(checkByName(r, 'dispute_requires_human_ack')?.pass, false);
  assertEquals((r.artifacts.stripe as Record<string, unknown>).charge, 'ch_1');
});

Deno.test('dispute.closed (won) → still awaiting_review', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'dp_2', object: 'dispute', status: 'won', charge: 'ch_2', payment_intent: 'pi_2' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ dp_2: obj })),
    makeTask({ event_type: 'charge.dispute.closed', object_id: 'dp_2', object_type: 'dispute' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
});

Deno.test('radar.early_fraud_warning.created → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'efw_1', object: 'radar.early_fraud_warning', charge: 'ch_3', fraud_type: 'made_with_stolen_card' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ efw_1: obj })),
    makeTask({ event_type: 'radar.early_fraud_warning.created', object_id: 'efw_1', object_type: 'radar.early_fraud_warning' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'no_fraud_warning')?.pass, false);
});

Deno.test('payout.paid → done (snapshots amount + arrival_date)', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'po_1', object: 'payout', amount: 10000, currency: 'usd', status: 'paid', arrival_date: 1_800_000_000 };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ po_1: obj })),
    makeTask({ event_type: 'payout.paid', object_id: 'po_1', object_type: 'payout' }),
  );
  assertEquals(r.outcome, 'done');
  assertEquals(r.confidence, 0.95);
  assertEquals((r.artifacts.stripe as Record<string, unknown>).arrival_date, 1_800_000_000);
});

Deno.test('payout.failed → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'po_2', object: 'payout', amount: 10000, status: 'failed', failure_code: 'account_closed', failure_message: 'The bank account has been closed' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ po_2: obj })),
    makeTask({ event_type: 'payout.failed', object_id: 'po_2', object_type: 'payout' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
});

Deno.test('balance.available → done (snapshot; fetched by type, no id)', async () => {
  const sb = createFakeSupabase();
  // The balance object has no id — index.ts's fetchStripeObject('balance', …)
  // calls stripe.balance.retrieve() ignoring the id, so the fake does the same.
  const obj: StripeObject = { object: 'balance', available: [{ amount: 50000, currency: 'usd' }], pending: [] };
  const r = await processStripeEventTask(
    { supabase: sb as unknown as ProcessorSupabase, fetchStripeObject: () => Promise.resolve(obj), now: () => new Date() },
    makeTask({ event_type: 'balance.available', object_id: null, object_type: 'balance' }),
  );
  assertEquals(r.outcome, 'done');
  assertEquals(checkByName(r, 'balance_snapshot')?.pass, true);
});

Deno.test('partial refund → awaiting_review (v2)', async () => {
  const sb = createFakeSupabase({
    invoice_payments: [{ id: 'ip_1', stripe_payment_intent_id: 'pi_r1', amount_cents: 10000, status: 'succeeded' }],
  });
  const obj: StripeObject = { id: 'ch_r1', object: 'charge', payment_intent: 'pi_r1', amount: 10000, amount_captured: 10000, amount_refunded: 4000, refunded: false };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ ch_r1: obj })),
    makeTask({ event_type: 'charge.refunded', object_id: 'ch_r1', object_type: 'charge' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'refund_full_or_none')?.pass, false);
});

Deno.test('full refund with complete reversal → done', async () => {
  const sb = createFakeSupabase({
    invoice_payments: [{ id: 'ip_2', stripe_payment_intent_id: 'pi_r2', amount_cents: 10000, status: 'refunded' }],
    designer_earnings: [{ id: 'de_1', reverses_invoice_payment_id: 'ip_2', net_amount: -10000, status: 'confirmed' }],
  });
  const obj: StripeObject = { id: 'ch_r2', object: 'charge', payment_intent: 'pi_r2', amount: 10000, amount_captured: 10000, amount_refunded: 10000, refunded: true };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ ch_r2: obj })),
    makeTask({ event_type: 'charge.refunded', object_id: 'ch_r2', object_type: 'charge' }),
  );
  assertEquals(r.outcome, 'done');
  assertEquals(checkByName(r, 'payable_refunded')?.pass, true);
  assertEquals(checkByName(r, 'contra_earnings_present')?.pass, true);
});

Deno.test('full refund WITHOUT contra earnings → awaiting_review', async () => {
  const sb = createFakeSupabase({
    invoice_payments: [{ id: 'ip_3', stripe_payment_intent_id: 'pi_r3', amount_cents: 10000, status: 'refunded' }],
    designer_earnings: [],
  });
  const obj: StripeObject = { id: 'ch_r3', object: 'charge', payment_intent: 'pi_r3', amount: 10000, amount_captured: 10000, amount_refunded: 10000, refunded: true };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ ch_r3: obj })),
    makeTask({ event_type: 'charge.refunded', object_id: 'ch_r3', object_type: 'charge' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'contra_earnings_present')?.pass, false);
});

Deno.test('orphan charge.succeeded (no payable) → awaiting_review', async () => {
  const sb = createFakeSupabase({ invoice_payments: [], po_payments: [], direct_orders: [] });
  const obj: StripeObject = { id: 'ch_o1', object: 'charge', payment_intent: 'pi_orphan', amount: 5000, currency: 'usd' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ ch_o1: obj })),
    makeTask({ event_type: 'charge.succeeded', object_id: 'ch_o1', object_type: 'charge' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'payable_match')?.pass, false);
});

Deno.test('charge.succeeded matching a settled payable → done', async () => {
  const sb = createFakeSupabase({
    invoice_payments: [{ id: 'ip_s1', stripe_payment_intent_id: 'pi_s1', amount_cents: 7000, status: 'succeeded' }],
  });
  const obj: StripeObject = { id: 'ch_s1', object: 'charge', payment_intent: 'pi_s1', amount: 7000, currency: 'usd' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ ch_s1: obj })),
    makeTask({ event_type: 'charge.succeeded', object_id: 'ch_s1', object_type: 'charge' }),
  );
  assertEquals(r.outcome, 'done');
  assertEquals(checkByName(r, 'amount_match')?.pass, true);
});

Deno.test('charge.succeeded with amount mismatch → awaiting_review', async () => {
  const sb = createFakeSupabase({
    invoice_payments: [{ id: 'ip_m1', stripe_payment_intent_id: 'pi_m1', amount_cents: 7000, status: 'succeeded' }],
  });
  const obj: StripeObject = { id: 'ch_m1', object: 'charge', payment_intent: 'pi_m1', amount: 6000, currency: 'usd' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ ch_m1: obj })),
    makeTask({ event_type: 'charge.succeeded', object_id: 'ch_m1', object_type: 'charge' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'amount_match')?.pass, false);
});

Deno.test('payment_intent.succeeded consistent with settled payable → done', async () => {
  const sb = createFakeSupabase({
    po_payments: [{ id: 'pop_1', stripe_payment_intent_id: 'pi_pi1', amount_cents: 25000, state: 'paid' }],
  });
  const obj: StripeObject = { id: 'pi_pi1', object: 'payment_intent', amount: 25000, currency: 'usd', status: 'succeeded' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ pi_pi1: obj })),
    makeTask({ event_type: 'payment_intent.succeeded', object_id: 'pi_pi1', object_type: 'payment_intent' }),
  );
  assertEquals(r.outcome, 'done');
});

Deno.test('application_fee.created within take band (16%) → done', async () => {
  const sb = createFakeSupabase();
  const fee: StripeObject = { id: 'fee_1', object: 'application_fee', amount: 1600, charge: 'ch_fee1' };
  const charge: StripeObject = { id: 'ch_fee1', object: 'charge', amount: 10000 };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ fee_1: fee, ch_fee1: charge })),
    makeTask({ event_type: 'application_fee.created', object_id: 'fee_1', object_type: 'application_fee' }),
  );
  assertEquals(r.outcome, 'done');
  assertEquals(checkByName(r, 'take_rate_in_band')?.pass, true);
});

Deno.test('application_fee.created outside take band (25%) → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const fee: StripeObject = { id: 'fee_2', object: 'application_fee', amount: 2500, charge: 'ch_fee2' };
  const charge: StripeObject = { id: 'ch_fee2', object: 'charge', amount: 10000 };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ fee_2: fee, ch_fee2: charge })),
    makeTask({ event_type: 'application_fee.created', object_id: 'fee_2', object_type: 'application_fee' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'take_rate_in_band')?.pass, false);
});

Deno.test('application_fee.refunded → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const fee: StripeObject = { id: 'fee_3', object: 'application_fee', amount: 1600, amount_refunded: 1600, charge: 'ch_fee3' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ fee_3: fee })),
    makeTask({ event_type: 'application_fee.refunded', object_id: 'fee_3', object_type: 'application_fee' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
});

Deno.test('account.updated clean → done', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'acct_1', object: 'account', charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: null } };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ acct_1: obj })),
    makeTask({ event_type: 'account.updated', object_id: 'acct_1', object_type: 'account' }),
  );
  assertEquals(r.outcome, 'done');
});

Deno.test('account.updated with requirements.currently_due → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'acct_2', object: 'account', charges_enabled: true, payouts_enabled: true, requirements: { currently_due: ['external_account'], disabled_reason: null } };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ acct_2: obj })),
    makeTask({ event_type: 'account.updated', object_id: 'acct_2', object_type: 'account' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'requirements_currently_due_empty')?.pass, false);
});

Deno.test('account.updated with disablement → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'acct_3', object: 'account', charges_enabled: false, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: 'requirements.past_due' } };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ acct_3: obj })),
    makeTask({ event_type: 'account.updated', object_id: 'acct_3', object_type: 'account' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
});

Deno.test('account.application.deauthorized → awaiting_review (no fetch needed)', async () => {
  const sb = createFakeSupabase();
  // object_type 'application' is NOT fetchable → reconciled from identifiers.
  const r = await processStripeEventTask(
    { supabase: sb as unknown as ProcessorSupabase, fetchStripeObject: () => Promise.reject(new Error('should not fetch')), now: () => new Date() },
    makeTask({ event_type: 'account.application.deauthorized', object_id: 'ca_1', object_type: 'application', account: 'acct_x' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'account_authorized')?.pass, false);
});

Deno.test('transfer.reversed → awaiting_review', async () => {
  const sb = createFakeSupabase();
  const obj: StripeObject = { id: 'tr_1', object: 'transfer', amount: 5000, amount_reversed: 5000 };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ tr_1: obj })),
    makeTask({ event_type: 'transfer.reversed', object_id: 'tr_1', object_type: 'transfer' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
});

Deno.test('transfer.created with no matching designer_payouts row → awaiting_review', async () => {
  const sb = createFakeSupabase({ designer_payouts: [] });
  const obj: StripeObject = { id: 'tr_2', object: 'transfer', amount: 5000, destination: 'acct_d' };
  const r = await processStripeEventTask(
    depsFor(sb, fetchFrom({ tr_2: obj })),
    makeTask({ event_type: 'transfer.created', object_id: 'tr_2', object_type: 'transfer' }),
  );
  assertEquals(r.outcome, 'awaiting_review');
  assertEquals(checkByName(r, 'designer_payout_match')?.pass, false);
});

Deno.test('transient fetch error on a done-eligible event rethrows (→ failed non-fatal upstream)', async () => {
  const sb = createFakeSupabase();
  let threw = false;
  try {
    await processStripeEventTask(
      { supabase: sb as unknown as ProcessorSupabase, fetchStripeObject: () => Promise.reject(new Error('stripe 503')), now: () => new Date() },
      makeTask({ event_type: 'charge.succeeded', object_id: 'ch_boom', object_type: 'charge' }),
    );
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes('503'));
  }
  assert(threw, 'expected a transient fetch error to rethrow');
});

// ─── run loop + generic passthrough + job_runs ──────────────────────────────────

Deno.test('runProcessor: stripe_event + payment_discrepancy passthrough, job_runs recorded', async () => {
  const payoutObj: StripeObject = { id: 'po_run', object: 'payout', amount: 12000, currency: 'usd', status: 'paid', arrival_date: 1 };
  const tasks: AgentTask[] = [
    makeTask({ event_type: 'payout.paid', object_id: 'po_run', object_type: 'payout' }, { task_type: 'stripe_event' }),
    // pre-formed evidence from W2.3: no event_type in payload.
    makeTask(
      { discrepancy: 'ledger vs stripe mismatch', invoice_id: 'inv_9', delta_cents: 250 },
      { task_type: 'payment_discrepancy' },
    ),
  ];
  const completions: Array<Record<string, unknown>> = [];
  const sb = createFakeSupabase(
    {},
    {
      claim_agent_tasks: () => ({ data: tasks, error: null }),
      complete_agent_task: (args) => {
        completions.push(args);
        return { data: null, error: null };
      },
    },
  );

  const summary = await runProcessor({
    supabase: sb as unknown as ProcessorSupabase,
    fetchStripeObject: fetchFrom({ po_run: payoutObj }),
    now: () => new Date('2026-07-12T06:00:00Z'),
  });

  assertEquals(summary.status, 'succeeded');
  assertEquals(summary.claimed, 2);
  assertEquals(summary.done, 1);
  assertEquals(summary.passthrough, 1);
  assertEquals(summary.failed, 0);

  // The payout.paid task completed 'done'.
  const doneCall = completions.find((c) => c.p_outcome === 'done');
  assert(doneCall, 'expected a done completion');
  // The passthrough completed 'awaiting_review' with the payload as evidence.
  const passCall = completions.find((c) => c.p_outcome === 'awaiting_review');
  assert(passCall, 'expected an awaiting_review completion');
  const passArtifacts = passCall!.p_artifacts as Record<string, unknown>;
  assertEquals(passArtifacts.passthrough, true);
  assertEquals(passArtifacts.source_task_type, 'payment_discrepancy');

  // A job_runs row was written and finished 'succeeded' with counts.
  const runs = sb._data['job_runs'] ?? [];
  assertEquals(runs.length, 1);
  assertEquals(runs[0].status, 'succeeded');
  const detail = runs[0].detail as Record<string, unknown>;
  assertEquals(detail.done, 1);
  assertEquals(detail.passthrough, 1);
});

Deno.test('runProcessor: a stale completion is a benign lease loss and is not retried as failed', async () => {
  const task = makeTask(
    { discrepancy: 'stale worker evidence' },
    { task_type: 'payment_discrepancy' },
  );
  let completionCalls = 0;
  const sb = createFakeSupabase(
    {},
    {
      claim_agent_tasks: () => ({ data: [task], error: null }),
      complete_agent_task: () => {
        completionCalls++;
        return {
          data: null,
          error: {
            message:
              `complete_agent_task: lease ownership rejected for task ${task.id} ` +
              '(locked_by stripe-event-processor:new, p_actor stripe-event-processor:old)',
          },
        };
      },
    },
  );

  const summary = await runProcessor({
    supabase: sb as unknown as ProcessorSupabase,
    fetchStripeObject: fetchFrom({}),
    now: () => new Date('2026-07-12T06:00:00Z'),
    worker: 'stripe-event-processor:old',
  });

  assertEquals(summary.status, 'succeeded');
  assertEquals(summary.claimed, 1);
  assertEquals(summary.passthrough, 0);
  assertEquals(summary.failed, 0);
  assertEquals(summary.error, null);
  assertEquals(completionCalls, 1, 'must not retry completion as a failed outcome after losing the lease');
});
