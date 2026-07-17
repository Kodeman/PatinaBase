// Offline unit tests for fulfillment-stripe-recon/core.ts (S6, R2.3).
//
// Exercises the two entry paths that share ONE ingest core: the fixture path
// (inline fixture_transactions, no live key — the recon .assert.sql / local
// path) and the API path (pull since the cursor, normalize, ingest), plus the
// graceful not-configured skip and the raw→normalized mapping (source charge →
// resolved payment_intent_id). The DB-side recon MATH (zero-delta then an
// injected mismatch surfacing in fulfillment_queue_v.needs_action_now) is proven
// in supabase/functions/_tests/fulfillment_ledger_walk.assert.sql (L16–L18);
// this suite proves the edge-fn core drives the ingest RPC + cursor correctly.
// Run:
//   deno test --no-check -A --node-modules-dir=auto \
//     supabase/functions/_tests/fulfillment-stripe-recon.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFakeSupabase } from './fake-supabase.ts';
import {
  normalizeBalanceTxn,
  resolvePaymentIntentId,
  runStripeRecon,
  sourceId,
  type NormalizedBalanceTxn,
  type RawStripeBalanceTxn,
  type ReconDeps,
} from '../fulfillment-stripe-recon/core.ts';

const now = () => new Date('2026-07-17T12:00:00Z');

/** Records every stripe_balance_tx_ingest call so tests can assert on the batch. */
function ingestRecorder() {
  const calls: Array<{ txns: unknown[]; cursor: unknown }> = [];
  const handlers = {
    stripe_balance_tx_ingest: (args: Record<string, unknown>) => {
      const txns = (args.p_txns as unknown[]) ?? [];
      calls.push({ txns, cursor: args.p_cursor });
      return { data: { ingested: txns.length, cursor: args.p_cursor }, error: null };
    },
    stripe_recon_cursor_epoch: () => ({ data: null as number | null, error: null }),
  };
  return { calls, handlers };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

Deno.test('sourceId / resolvePaymentIntentId: string source vs expanded charge', () => {
  assertEquals(sourceId('ch_123'), 'ch_123');
  assertEquals(resolvePaymentIntentId('ch_123'), null); // unexpanded → no PI
  assertEquals(sourceId({ id: 'ch_9', payment_intent: 'pi_9' }), 'ch_9');
  assertEquals(resolvePaymentIntentId({ id: 'ch_9', payment_intent: 'pi_9' }), 'pi_9');
  assertEquals(resolvePaymentIntentId(null), null);
});

Deno.test('normalizeBalanceTxn: maps API shape → ingest shape, resolves PI from source', () => {
  const raw: RawStripeBalanceTxn = {
    id: 'txn_1',
    type: 'charge',
    amount: 413000,
    fee: 12000,
    net: 401000,
    currency: 'usd',
    created: 1_752_000_000,
    source: { id: 'ch_1', payment_intent: 'pi_boh_seed_1' },
  };
  const n = normalizeBalanceTxn(raw);
  assertEquals(n.id, 'txn_1');
  assertEquals(n.amount_cents, 413000);
  assertEquals(n.fee_cents, 12000);
  assertEquals(n.net_cents, 401000);
  assertEquals(n.source_id, 'ch_1');
  assertEquals(n.payment_intent_id, 'pi_boh_seed_1');
  assertEquals(n.created, 1_752_000_000);
});

// ─── fixture path ──────────────────────────────────────────────────────────────

Deno.test('runStripeRecon: fixture path ingests the inline batch, no Stripe call', async () => {
  const { calls, handlers } = ingestRecorder();
  const sb = createFakeSupabase({}, handlers);
  const deps: ReconDeps = { supabase: sb as unknown as ReconDeps['supabase'], now };
  // NB: no fetchBalanceTransactions wired — fixture path must not need it.

  const fixtures: NormalizedBalanceTxn[] = [
    { id: 'txn_a', type: 'charge', amount_cents: 413000, fee_cents: 0, net_cents: 413000,
      currency: 'usd', created: '1752000000', source_id: 'ch_a', payment_intent_id: 'pi_boh_s6_walk_a', payout_id: null },
    { id: 'txn_b', type: 'refund', amount_cents: -53000, fee_cents: 0, net_cents: -53000,
      currency: 'usd', created: '1752000000', source_id: 're_b', payment_intent_id: 'pi_boh_s6_walk_a', payout_id: null },
  ];
  const res = await runStripeRecon(deps, { fixture_transactions: fixtures });
  assertEquals(res.source, 'fixture');
  assertEquals(res.ingested, 2);
  assertEquals(calls.length, 1);
  assertEquals((calls[0].txns as unknown[]).length, 2);
});

// ─── not configured → graceful skip ─────────────────────────────────────────────

Deno.test('runStripeRecon: no fixtures + no fetch fn → skips, never calls ingest', async () => {
  const { calls, handlers } = ingestRecorder();
  const sb = createFakeSupabase({}, handlers);
  const deps: ReconDeps = { supabase: sb as unknown as ReconDeps['supabase'], now };

  const res = await runStripeRecon(deps, {});
  assertEquals(res.skipped, 'stripe_not_configured');
  assertEquals(calls.length, 0, 'ingest must not run when unconfigured');
});

// ─── API path: reads cursor, pulls since, normalizes, ingests ───────────────────

Deno.test('runStripeRecon: API path reads cursor → fetch(since) → normalize → ingest', async () => {
  const { calls, handlers } = ingestRecorder();
  // cursor helper returns an epoch → fetch must be called with exactly it
  handlers.stripe_recon_cursor_epoch = () => ({ data: 1_751_000_000 as number | null, error: null });
  const sb = createFakeSupabase({}, handlers);

  let sawSince: number | null = -1;
  const fetchBalanceTransactions = (since: number | null) => {
    sawSince = since;
    const raw: RawStripeBalanceTxn[] = [
      { id: 'txn_x', type: 'charge', amount: 140000, fee: 4000, net: 136000, currency: 'usd',
        created: 1_752_100_000, source: { id: 'ch_x', payment_intent: 'pi_boh_s6_walk_c' } },
    ];
    return Promise.resolve(raw);
  };
  const deps: ReconDeps = {
    supabase: sb as unknown as ReconDeps['supabase'],
    fetchBalanceTransactions,
    now,
  };

  const res = await runStripeRecon(deps, {});
  assertEquals(res.source, 'stripe');
  assertEquals(sawSince, 1_751_000_000, 'fetch called with the cursor epoch');
  assertEquals(res.ingested, 1);
  assertEquals(calls.length, 1);
  const sent = (calls[0].txns as NormalizedBalanceTxn[])[0];
  assertEquals(sent.payment_intent_id, 'pi_boh_s6_walk_c', 'PI resolved from expanded source');
  assertEquals(sent.amount_cents, 140000);
  // cursor advances to the newest created seen
  assertEquals(calls[0].cursor, '1752100000');
});

// ─── idempotent re-run: same batch, ingest RPC dedups (DB) — core is a passthrough ─

Deno.test('runStripeRecon: re-running the same fixture batch is a clean passthrough', async () => {
  const { calls, handlers } = ingestRecorder();
  const sb = createFakeSupabase({}, handlers);
  const deps: ReconDeps = { supabase: sb as unknown as ReconDeps['supabase'], now };
  const fixtures: NormalizedBalanceTxn[] = [
    { id: 'txn_dup', type: 'charge', amount_cents: 100, fee_cents: 0, net_cents: 100,
      currency: 'usd', created: '1752000000', source_id: 'ch_dup', payment_intent_id: 'pi_dup', payout_id: null },
  ];
  await runStripeRecon(deps, { fixture_transactions: fixtures });
  await runStripeRecon(deps, { fixture_transactions: fixtures });
  assertEquals(calls.length, 2, 'both runs hit ingest; DB ON CONFLICT DO NOTHING makes the 2nd a no-op');
  assert(calls.every((c) => (c.txns as unknown[]).length === 1));
});
