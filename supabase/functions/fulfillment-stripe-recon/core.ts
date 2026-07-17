// fulfillment-stripe-recon/core.ts — pull Stripe balance transactions since the
// cursor and upsert them into the append-only public.stripe_balance_transactions
// mirror via the stripe_balance_tx_ingest RPC (00361), which advances the
// stripe_recon_cursor. ledger_stripe_recon_v then reconciles ledger account 1000
// (T1 capture debits + T4 refund credits) against the ACTUAL balance
// transactions, and fulfillment_queue_v pins any order with a nonzero delta to
// Needs Action Now (R2.3, spec §8).
//
// Two entry paths share ONE ingest core (mirrors fulfillment-intake's seed_pi
// pattern):
//   • cron/API path — pull balance transactions from Stripe (STRIPE_SECRET_KEY),
//     resolving each txn's PI from its expanded source charge, page by page.
//   • fixture path  — an inline { fixture_transactions: [...] } array drives the
//     SAME normalize→ingest code path with NO live key, so local tests and the
//     recon .assert.sql exercise the real RPC + cursor + view without Stripe.
//
// Graceful skip (apns-send posture, O1 analogue): with STRIPE_SECRET_KEY unset
// AND no fixtures, the fn does NOT error — it returns { skipped:
// 'stripe_not_configured' } and the shell marks the job_run 'skipped'. So BOH
// ships end-to-end today and the recon closes the moment the key is provisioned.

import type { RpcClient } from '../_shared/agent-queue.ts';

/** The normalized shape the ingest RPC (00361) consumes. `created` may be an
 *  ISO string or a Stripe unix epoch — the RPC accepts either. */
export interface NormalizedBalanceTxn {
  id: string;
  type: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  currency: string;
  created: string | number;
  source_id: string | null;
  payment_intent_id: string | null;
  payout_id: string | null;
  raw?: Record<string, unknown>;
}

/** The slice of a Stripe balance-transaction object this fn reads (API shape). */
export interface RawStripeBalanceTxn {
  id: string;
  type?: string;
  amount?: number;
  fee?: number;
  net?: number;
  currency?: string;
  created?: number; // unix seconds
  source?: string | { id?: string; payment_intent?: string | null } | null;
  [k: string]: unknown;
}

export interface ReconDeps {
  supabase: RpcClient;
  /** Pull raw Stripe balance transactions created strictly after `sinceEpoch`
   *  (unix seconds, null = all). Omitted/undefined ⇒ not configured (skip). */
  fetchBalanceTransactions?: (sinceEpoch: number | null) => Promise<RawStripeBalanceTxn[]>;
  now: () => Date;
}

/** Resolve a balance transaction's PI from its (expanded) source charge/refund. */
export function resolvePaymentIntentId(src: RawStripeBalanceTxn['source']): string | null {
  if (!src || typeof src === 'string') return null;
  const pi = src.payment_intent;
  return typeof pi === 'string' ? pi : null;
}

export function sourceId(src: RawStripeBalanceTxn['source']): string | null {
  if (!src) return null;
  return typeof src === 'string' ? src : (src.id ?? null);
}

/** Map a raw Stripe balance transaction (with an EXPANDED source) to our shape. */
export function normalizeBalanceTxn(bt: RawStripeBalanceTxn): NormalizedBalanceTxn {
  return {
    id: bt.id,
    type: bt.type ?? 'unknown',
    amount_cents: Number(bt.amount ?? 0),
    fee_cents: Number(bt.fee ?? 0),
    net_cents: Number(bt.net ?? 0),
    currency: bt.currency ?? 'usd',
    created: Number(bt.created ?? 0),
    source_id: sourceId(bt.source),
    payment_intent_id: resolvePaymentIntentId(bt.source),
    payout_id: null,
    raw: bt as unknown as Record<string, unknown>,
  };
}

/** Shared tail: hand a normalized batch to the append-only ingest RPC (00361). */
export async function ingestBalanceTxns(
  deps: ReconDeps,
  txns: NormalizedBalanceTxn[],
  cursor: string | null,
): Promise<{ ingested: number; cursor: string | null }> {
  const res = await deps.supabase.rpc('stripe_balance_tx_ingest', {
    p_txns: txns,
    p_cursor: cursor,
  });
  if (res.error) throw new Error(res.error.message);
  const out = (res.data ?? {}) as { ingested?: number; cursor?: string | null };
  return { ingested: Number(out.ingested ?? 0), cursor: out.cursor ?? null };
}

interface ReconResult {
  ingested?: number;
  cursor?: string | null;
  skipped?: string;
  source?: 'fixture' | 'stripe';
}

/** Read the 1-row sync cursor's last_created (unix seconds), or null. */
async function readCursorEpoch(deps: ReconDeps): Promise<number | null> {
  const res = await deps.supabase.rpc('stripe_recon_cursor_epoch', {});
  if (res.error) return null; // cursor helper absent ⇒ full pull
  const v = res.data as number | null;
  return v == null ? null : Number(v);
}

/**
 * Orchestrate one reconciliation sync.
 *  - fixture mode (body.fixture_transactions present) → normalize-passthrough +
 *    ingest, no Stripe call, no key needed (the test/assert path).
 *  - API mode → pull pages since the cursor, normalize, ingest.
 *  - not configured (no fetch fn, no fixtures) → graceful skip.
 */
export async function runStripeRecon(
  deps: ReconDeps,
  body: { fixture_transactions?: NormalizedBalanceTxn[]; cursor?: string | null } = {},
): Promise<ReconResult> {
  if (Array.isArray(body.fixture_transactions)) {
    const { ingested, cursor } = await ingestBalanceTxns(
      deps,
      body.fixture_transactions,
      body.cursor ?? null,
    );
    return { ingested, cursor, source: 'fixture' };
  }

  if (!deps.fetchBalanceTransactions) {
    console.log('[fulfillment-stripe-recon] STRIPE_SECRET_KEY not configured; skipping pull');
    return { skipped: 'stripe_not_configured' };
  }

  const since = await readCursorEpoch(deps);
  const raw = await deps.fetchBalanceTransactions(since);
  const txns = raw.map(normalizeBalanceTxn);
  const newestCreated = txns.reduce<number>((m, t) => Math.max(m, Number(t.created) || 0), 0);
  const cursorId = newestCreated ? String(newestCreated) : null;
  const { ingested } = await ingestBalanceTxns(deps, txns, cursorId);
  return { ingested, cursor: cursorId, source: 'stripe' };
}

/** Real Stripe pull: page balance transactions created after `sinceEpoch`,
 *  expanding each source so the PI resolves. Plain fetch (no SDK) with the
 *  secret key, matching stripe-event-processor's lightweight posture. */
export async function fetchBalanceTransactionsFromStripe(
  secretKey: string,
  sinceEpoch: number | null,
  fetchImpl: typeof fetch = fetch,
): Promise<RawStripeBalanceTxn[]> {
  const out: RawStripeBalanceTxn[] = [];
  let startingAfter: string | null = null;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams();
    params.set('limit', '100');
    params.append('expand[]', 'data.source');
    if (sinceEpoch) params.set('created[gt]', String(sinceEpoch));
    if (startingAfter) params.set('starting_after', startingAfter);
    const res = await fetchImpl(`https://api.stripe.com/v1/balance_transactions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) throw new Error(`stripe balance_transactions ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { data: RawStripeBalanceTxn[]; has_more: boolean };
    out.push(...(body.data ?? []));
    if (!body.has_more || (body.data?.length ?? 0) === 0) break;
    startingAfter = body.data[body.data.length - 1].id;
  }
  return out;
}
