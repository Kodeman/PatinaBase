// stripe-event-processor/core.ts — reconcile queued Stripe events against
// internal state (WP-2.1). All orchestration + the escalation table live here
// behind injectable deps so they unit-test offline; index.ts is only the
// service-role client + real Stripe SDK wiring + serve() shell, exactly as
// field-daily/core.ts and cowork-intake-bridge/core.ts are to their shells.
//
// Guardrail (Agent OS): the internal ledger is the source of truth — we
// reconcile TOWARD it and NEVER auto-resolve a money-touching discrepancy.
// Anything that isn't provably clean lands awaiting_review for a human.
//
// Run flow (per invocation):
//   1. claim up to 20 tasks of type stripe_event | payment_discrepancy |
//      damage_claim_escalation (FOR UPDATE SKIP LOCKED, 60s visibility).
//   2. task WITHOUT payload.event_type → a pre-formed evidence task from W2.3
//      (payment_discrepancy / damage_claim_escalation): pass its payload
//      straight through to awaiting_review, no Stripe fetch.
//   3. stripe_event task → re-fetch the object fresh from Stripe (never trust
//      the delivered state — Stripe is at-least-once + unordered), resolve the
//      internal payable by stripe_payment_intent_id (mirroring the webhook),
//      run the escalation table, and complete done | awaiting_review with an
//      EvidencePack the Mission Control inbox can render without re-querying
//      Stripe.
//   4. transient Stripe/API error → complete failed non-fatal (Postgres backs
//      it off; 00297 §5.3).
//   5. one job_runs row per invocation, counts by outcome.

import {
  claimAgentTasks,
  completeAgentTaskIfOwned,
  createLeaseOwner,
  type AgentTask,
  type RpcClient,
} from '../_shared/agent-queue.ts';

// Re-export so callers/tests can name the claimed-task type from this module.
export type { AgentTask } from '../_shared/agent-queue.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

export const WORKER = 'stripe-event-processor';
export const CLAIM_TYPES = ['stripe_event', 'payment_discrepancy', 'damage_claim_escalation'];
export const CLAIM_BATCH = 20;
export const VISIBILITY = '60 seconds';
/** Contracted marketplace take-rate band (15–18%). Outside → escalate. */
export const TAKE_BAND = { min: 0.15, max: 0.18 } as const;
/** Confidence stamped on the completed task. */
const CONFIDENCE_CLEAN = 0.95;
const CONFIDENCE_ESCALATE = 0.5;

// Stripe object types this processor knows how to re-fetch. Anything else
// (e.g. account.application.deauthorized's 'application' object) is reconciled
// from the enqueued identifiers alone.
const FETCHABLE_OBJECT_TYPES = new Set([
  'charge',
  'payment_intent',
  'dispute',
  'payout',
  'transfer',
  'application_fee',
  'fee_refund',
  'account',
  'radar.early_fraud_warning',
  'balance',
]);

// Events that ALWAYS escalate regardless of what the re-fetch shows — a human
// acknowledges every one. For these a fetch failure is non-fatal (we escalate
// with the identifiers we have) rather than a transient retry.
const ALWAYS_ESCALATE = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'radar.early_fraud_warning.created',
  'payout.failed',
  'account.application.deauthorized',
  'transfer.reversed',
  'application_fee.refunded',
]);

// ─── Injected surface ───────────────────────────────────────────────────────

interface SupabaseResult {
  data: unknown;
  error: { message: string } | null;
}

interface TableQuery {
  select(cols?: string): TableQuery;
  eq(col: string, val: unknown): TableQuery;
  order(col: string, opts?: { ascending?: boolean }): TableQuery;
  limit(n: number): TableQuery;
  insert(values: unknown): TableQuery;
  update(values: unknown): TableQuery;
  maybeSingle(): PromiseLike<SupabaseResult>;
  single(): PromiseLike<SupabaseResult>;
  then<R1 = SupabaseResult, R2 = never>(
    onfulfilled?: ((v: SupabaseResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2>;
}

export interface ProcessorSupabase extends RpcClient {
  from(table: string): TableQuery;
}

export type StripeObject = Record<string, unknown>;

export interface ProcessorDeps {
  supabase: ProcessorSupabase;
  /** Re-fetch a Stripe object by type + id (index.ts wires the real SDK). */
  fetchStripeObject(objectType: string | null, objectId: string | null): Promise<StripeObject>;
  now(): Date;
  /** Full, unique lease identity. Tests may inject one; production generates it. */
  worker?: string;
}

// ─── Evidence shapes ──────────────────────────────────────────────────────────

export interface EvidenceCheck {
  name: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
}

export interface InternalPayable {
  table: 'invoice_payments' | 'po_payments' | 'direct_orders';
  id: string;
  status: string;
  amount_cents: number | null;
  currency: string | null;
}

export interface EvidencePack {
  stripe: Record<string, unknown>;
  internal: InternalPayable | null;
  checks: EvidenceCheck[];
  verdict: string;
}

export interface EvalResult {
  outcome: 'done' | 'awaiting_review';
  confidence: number;
  artifacts: EvidencePack;
}

export type ProcessorOutcome = 'done' | 'awaiting_review' | 'failed' | 'passthrough';

export interface ProcessorSummary {
  status: 'succeeded' | 'failed';
  claimed: number;
  done: number;
  awaiting_review: number;
  failed: number;
  passthrough: number;
  error: string | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function strId(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
    return (v as { id: string }).id;
  }
  return null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function done(artifacts: EvidencePack): EvalResult {
  return { outcome: 'done', confidence: CONFIDENCE_CLEAN, artifacts };
}
function escalate(artifacts: EvidencePack): EvalResult {
  return { outcome: 'awaiting_review', confidence: CONFIDENCE_ESCALATE, artifacts };
}

function isSettled(p: InternalPayable): boolean {
  if (p.table === 'invoice_payments') return p.status === 'succeeded';
  return p.status === 'paid'; // po_payments.state / direct_orders.status
}
function isRefunded(p: InternalPayable): boolean {
  return p.status === 'refunded';
}

// ─── Internal payable resolution (mirrors the webhook: PI id → 3 tables) ─────

async function resolvePayable(
  sb: ProcessorSupabase,
  paymentIntentId: string | null,
): Promise<InternalPayable | null> {
  if (!paymentIntentId) return null;

  const inv = await sb
    .from('invoice_payments')
    .select('id, amount_cents, status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (inv.error) throw new Error(`invoice_payments lookup failed: ${inv.error.message}`);
  if (inv.data) {
    const r = inv.data as Record<string, unknown>;
    return {
      table: 'invoice_payments',
      id: String(r.id),
      status: String(r.status),
      amount_cents: num(r.amount_cents),
      currency: null, // currency lives on the invoice, not the payment row
    };
  }

  const po = await sb
    .from('po_payments')
    .select('id, amount_cents, state')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (po.error) throw new Error(`po_payments lookup failed: ${po.error.message}`);
  if (po.data) {
    const r = po.data as Record<string, unknown>;
    return {
      table: 'po_payments',
      id: String(r.id),
      status: String(r.state),
      amount_cents: num(r.amount_cents),
      currency: null,
    };
  }

  const dir = await sb
    .from('direct_orders')
    .select('id, amount_cents, status, currency')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (dir.error) throw new Error(`direct_orders lookup failed: ${dir.error.message}`);
  if (dir.data) {
    const r = dir.data as Record<string, unknown>;
    return {
      table: 'direct_orders',
      id: String(r.id),
      status: String(r.status),
      amount_cents: num(r.amount_cents),
      currency: r.currency == null ? null : String(r.currency),
    };
  }

  return null;
}

/** The PI id to reconcile against, derived from the re-fetched object. */
function paymentIntentIdOf(objectType: string | null, obj: StripeObject | null): string | null {
  if (!obj) return null;
  switch (objectType) {
    case 'payment_intent':
      return strId(obj.id);
    case 'charge':
    case 'dispute':
      return strId(obj.payment_intent);
    default:
      return null;
  }
}

// ─── Amount / currency consistency checks ─────────────────────────────────────

function amountCheck(stripeAmount: number | null, internal: InternalPayable): EvidenceCheck {
  return {
    name: 'amount_match',
    pass: stripeAmount != null && internal.amount_cents != null && stripeAmount === internal.amount_cents,
    expected: internal.amount_cents,
    actual: stripeAmount,
  };
}

function currencyCheck(stripeCurrency: unknown, internal: InternalPayable): EvidenceCheck {
  // Only direct_orders carries a currency column; treat the others as N/A-pass.
  if (internal.currency == null) {
    return { name: 'currency_match', pass: true, expected: 'n/a', actual: stripeCurrency ?? null };
  }
  const a = String(stripeCurrency ?? '').toLowerCase();
  const b = String(internal.currency).toLowerCase();
  return { name: 'currency_match', pass: a === b, expected: b, actual: a };
}

// ─── The escalation table ─────────────────────────────────────────────────────

export async function evaluateEvent(
  deps: ProcessorDeps,
  eventType: string,
  objectType: string | null,
  objectId: string | null,
  primary: StripeObject | null,
  identifiers: Record<string, unknown>,
): Promise<EvalResult> {
  const sb = deps.supabase;
  const obj = primary ?? {};

  // ── Disputes: EVERY state (incl. closed-won) needs a human ack ────────────
  if (eventType.startsWith('charge.dispute.')) {
    const pi = strId(obj.payment_intent);
    const internal = await resolvePayable(sb, pi);
    const stripeEvidence = {
      id: strId(obj.id) ?? objectId,
      status: obj.status ?? null,
      reason: obj.reason ?? null,
      amount: num(obj.amount),
      currency: obj.currency ?? null,
      charge: strId(obj.charge),
      payment_intent: pi,
    };
    return escalate({
      stripe: stripeEvidence,
      internal,
      checks: [
        { name: 'dispute_requires_human_ack', pass: false, expected: 'no dispute', actual: obj.status ?? eventType },
      ],
      verdict: `Dispute ${obj.status ?? ''} on charge ${strId(obj.charge) ?? '?'} (${eventType}) — human acknowledgement required.`,
    });
  }

  // ── Early fraud warning ───────────────────────────────────────────────────
  if (eventType === 'radar.early_fraud_warning.created') {
    return escalate({
      stripe: {
        id: strId(obj.id) ?? objectId,
        charge: strId(obj.charge),
        fraud_type: obj.fraud_type ?? null,
        actionable: obj.actionable ?? null,
      },
      internal: await resolvePayable(sb, strId(obj.payment_intent)),
      checks: [{ name: 'no_fraud_warning', pass: false, expected: 'none', actual: obj.fraud_type ?? 'fraud_warning' }],
      verdict: `Early fraud warning (${obj.fraud_type ?? 'unknown'}) on charge ${strId(obj.charge) ?? '?'} — review required.`,
    });
  }

  // ── Payouts ───────────────────────────────────────────────────────────────
  if (eventType === 'payout.failed') {
    return escalate({
      stripe: {
        id: strId(obj.id) ?? objectId,
        amount: num(obj.amount),
        currency: obj.currency ?? null,
        status: obj.status ?? 'failed',
        failure_code: obj.failure_code ?? null,
        failure_message: obj.failure_message ?? null,
      },
      internal: null,
      checks: [{ name: 'payout_paid', pass: false, expected: 'paid', actual: obj.status ?? 'failed' }],
      verdict: `Payout ${strId(obj.id) ?? objectId} failed (${obj.failure_message ?? obj.failure_code ?? 'unknown'}).`,
    });
  }
  if (eventType === 'payout.paid') {
    return done({
      stripe: {
        id: strId(obj.id) ?? objectId,
        amount: num(obj.amount),
        currency: obj.currency ?? null,
        status: obj.status ?? null,
        arrival_date: obj.arrival_date ?? null,
      },
      internal: null,
      checks: [{ name: 'payout_paid', pass: true, expected: 'paid', actual: obj.status ?? 'paid' }],
      verdict: `Payout ${strId(obj.id) ?? objectId} paid (${num(obj.amount) ?? '?'} ${String(obj.currency ?? '')}).`,
    });
  }

  // ── Balance snapshot ──────────────────────────────────────────────────────
  if (eventType === 'balance.available') {
    return done({
      stripe: { object: 'balance', available: obj.available ?? null, pending: obj.pending ?? null },
      internal: null,
      checks: [{ name: 'balance_snapshot', pass: true, expected: 'snapshot', actual: 'available' }],
      verdict: 'Balance available snapshot recorded.',
    });
  }

  // ── Connect account ───────────────────────────────────────────────────────
  if (eventType === 'account.application.deauthorized') {
    return escalate({
      stripe: { id: strId(obj.id) ?? objectId ?? (identifiers.account as string) ?? null, deauthorized: true },
      internal: null,
      checks: [{ name: 'account_authorized', pass: false, expected: 'authorized', actual: 'deauthorized' }],
      verdict: `Connected account ${(identifiers.account as string) ?? strId(obj.id) ?? '?'} deauthorized — reconnect required.`,
    });
  }
  if (eventType === 'account.updated') {
    const req = (obj.requirements ?? {}) as { currently_due?: string[]; disabled_reason?: string | null };
    const currentlyDue = Array.isArray(req.currently_due) ? req.currently_due : [];
    const chargesEnabled = obj.charges_enabled !== false;
    const payoutsEnabled = obj.payouts_enabled !== false;
    const disabled = !chargesEnabled || !payoutsEnabled || (req.disabled_reason != null && req.disabled_reason !== '');
    const dueNonEmpty = currentlyDue.length > 0;
    const checks: EvidenceCheck[] = [
      { name: 'charges_enabled', pass: chargesEnabled, expected: true, actual: obj.charges_enabled ?? null },
      { name: 'payouts_enabled', pass: payoutsEnabled, expected: true, actual: obj.payouts_enabled ?? null },
      { name: 'requirements_currently_due_empty', pass: !dueNonEmpty, expected: [], actual: currentlyDue },
    ];
    const stripe = {
      id: strId(obj.id) ?? objectId,
      charges_enabled: obj.charges_enabled ?? null,
      payouts_enabled: obj.payouts_enabled ?? null,
      disabled_reason: req.disabled_reason ?? null,
      currently_due: currentlyDue,
    };
    if (disabled || dueNonEmpty) {
      return escalate({
        stripe,
        internal: null,
        checks,
        verdict: `Connected account ${strId(obj.id) ?? '?'} needs attention${disabled ? ' (disabled)' : ''}${dueNonEmpty ? ` (${currentlyDue.length} requirement(s) due)` : ''}.`,
      });
    }
    return done({
      stripe,
      internal: null,
      checks,
      verdict: `Connected account ${strId(obj.id) ?? '?'} update clean (charges + payouts enabled, no requirements due).`,
    });
  }

  // ── Transfers (no designer_payouts rows exist yet → transfer.created escalates) ──
  if (eventType === 'transfer.reversed') {
    return escalate({
      stripe: { id: strId(obj.id) ?? objectId, amount: num(obj.amount), amount_reversed: num(obj.amount_reversed) },
      internal: null,
      checks: [{ name: 'transfer_intact', pass: false, expected: 'not reversed', actual: 'reversed' }],
      verdict: `Transfer ${strId(obj.id) ?? objectId} reversed — review.`,
    });
  }
  if (eventType === 'transfer.created') {
    const transferId = strId(obj.id) ?? objectId;
    const match = await sb
      .from('designer_payouts')
      .select('id, amount, status')
      .eq('payment_reference', transferId)
      .maybeSingle();
    if (match.error) throw new Error(`designer_payouts lookup failed: ${match.error.message}`);
    if (!match.data) {
      return escalate({
        stripe: { id: transferId, amount: num(obj.amount), destination: strId(obj.destination) },
        internal: null,
        checks: [{ name: 'designer_payout_match', pass: false, expected: 'matching designer_payouts row', actual: 'none' }],
        verdict: `Transfer ${transferId} has no matching designer_payouts row — cannot auto-reconcile.`,
      });
    }
    const row = match.data as Record<string, unknown>;
    const amtMatch = num(obj.amount) === num(row.amount);
    return (amtMatch ? done : escalate)({
      stripe: { id: transferId, amount: num(obj.amount) },
      internal: { table: 'direct_orders', id: String(row.id), status: String(row.status), amount_cents: num(row.amount), currency: null },
      checks: [{ name: 'designer_payout_amount_match', pass: amtMatch, expected: num(row.amount), actual: num(obj.amount) }],
      verdict: amtMatch
        ? `Transfer ${transferId} matches designer_payouts ${String(row.id)}.`
        : `Transfer ${transferId} amount disagrees with designer_payouts ${String(row.id)}.`,
    });
  }

  // ── Application fees ──────────────────────────────────────────────────────
  if (eventType === 'application_fee.refunded') {
    return escalate({
      stripe: { id: strId(obj.id) ?? objectId, amount: num(obj.amount), amount_refunded: num(obj.amount_refunded) },
      internal: null,
      checks: [{ name: 'application_fee_intact', pass: false, expected: 'not refunded', actual: 'refunded' }],
      verdict: `Application fee ${strId(obj.id) ?? objectId} refunded — review take-rate impact.`,
    });
  }
  if (eventType === 'application_fee.created') {
    const feeAmount = num(obj.amount);
    const chargeId = strId(obj.charge);
    let chargeAmount: number | null = null;
    if (chargeId) {
      const charge = await deps.fetchStripeObject('charge', chargeId);
      chargeAmount = num(charge.amount);
    }
    const stripe = { id: strId(obj.id) ?? objectId, amount: feeAmount, charge: chargeId, charge_amount: chargeAmount };
    if (feeAmount == null || chargeAmount == null || chargeAmount <= 0) {
      return escalate({
        stripe,
        internal: null,
        checks: [{ name: 'take_rate_in_band', pass: false, expected: `${TAKE_BAND.min}-${TAKE_BAND.max}`, actual: 'charge amount unavailable' }],
        verdict: `Application fee ${strId(obj.id) ?? objectId}: cannot verify take band (charge amount unavailable).`,
      });
    }
    const rate = feeAmount / chargeAmount;
    const inBand = rate >= TAKE_BAND.min && rate <= TAKE_BAND.max;
    const check: EvidenceCheck = {
      name: 'take_rate_in_band',
      pass: inBand,
      expected: `${TAKE_BAND.min}-${TAKE_BAND.max}`,
      actual: Number(rate.toFixed(4)),
    };
    return (inBand ? done : escalate)({
      stripe,
      internal: null,
      checks: [check],
      verdict: `Application fee ${strId(obj.id) ?? objectId}: take ${(rate * 100).toFixed(1)}% ${inBand ? 'within' : 'OUTSIDE'} the ${TAKE_BAND.min * 100}-${TAKE_BAND.max * 100}% band.`,
    });
  }

  // ── charge.succeeded — must match a settled payable ───────────────────────
  if (eventType === 'charge.succeeded') {
    const pi = strId(obj.payment_intent);
    const internal = await resolvePayable(sb, pi);
    const stripe = { id: strId(obj.id) ?? objectId, amount: num(obj.amount), currency: obj.currency ?? null, payment_intent: pi };
    if (!internal) {
      return escalate({
        stripe,
        internal: null,
        checks: [{ name: 'payable_match', pass: false, expected: 'matching payable', actual: 'none (orphan charge)' }],
        verdict: `Charge ${strId(obj.id) ?? objectId} succeeded but no internal payable matched PI ${pi ?? '?'} (orphan).`,
      });
    }
    const settled = isSettled(internal);
    const amt = amountCheck(num(obj.amount), internal);
    const cur = currencyCheck(obj.currency, internal);
    const settledCheck: EvidenceCheck = { name: 'payable_settled', pass: settled, expected: 'settled', actual: internal.status };
    const clean = settled && amt.pass && cur.pass;
    return (clean ? done : escalate)({
      stripe,
      internal,
      checks: [{ name: 'payable_match', pass: true, expected: 'matching payable', actual: `${internal.table} ${internal.id}` }, settledCheck, amt, cur],
      verdict: clean
        ? `Charge ${strId(obj.id) ?? objectId} matches settled ${internal.table} ${internal.id}.`
        : `Charge ${strId(obj.id) ?? objectId} inconsistent with ${internal.table} ${internal.id} (settled=${settled}, amount=${amt.pass}, currency=${cur.pass}).`,
    });
  }

  // ── payment_intent.succeeded / .payment_failed — consistency ──────────────
  if (eventType === 'payment_intent.succeeded' || eventType === 'payment_intent.payment_failed') {
    const pi = strId(obj.id) ?? objectId;
    const internal = await resolvePayable(sb, pi);
    const stripe = { id: pi, amount: num(obj.amount), currency: obj.currency ?? null, status: obj.status ?? null };
    if (!internal) {
      return escalate({
        stripe,
        internal: null,
        checks: [{ name: 'payable_match', pass: false, expected: 'matching payable', actual: 'none (orphan PI)' }],
        verdict: `PaymentIntent ${pi} (${eventType}) has no matching internal payable (orphan).`,
      });
    }
    if (eventType === 'payment_intent.succeeded') {
      const settled = isSettled(internal);
      const amt = amountCheck(num(obj.amount), internal);
      const clean = settled && amt.pass;
      return (clean ? done : escalate)({
        stripe,
        internal,
        checks: [{ name: 'payable_settled', pass: settled, expected: 'settled', actual: internal.status }, amt],
        verdict: clean
          ? `PI ${pi} succeeded; ${internal.table} ${internal.id} settled & consistent.`
          : `PI ${pi} succeeded but ${internal.table} ${internal.id} is ${internal.status} / amount match=${amt.pass}.`,
      });
    }
    // payment_failed: the payable must NOT be settled.
    const notSettled = !isSettled(internal);
    return (notSettled ? done : escalate)({
      stripe,
      internal,
      checks: [{ name: 'payable_not_settled', pass: notSettled, expected: 'not settled', actual: internal.status }],
      verdict: notSettled
        ? `PI ${pi} failed; ${internal.table} ${internal.id} correctly not settled (${internal.status}).`
        : `PI ${pi} failed but ${internal.table} ${internal.id} is settled (${internal.status}) — inconsistent.`,
    });
  }

  // ── charge.refunded — partial escalates; full must be fully reversed ──────
  if (eventType === 'charge.refunded') {
    const pi = strId(obj.payment_intent);
    const internal = await resolvePayable(sb, pi);
    const captured = num(obj.amount_captured) ?? num(obj.amount) ?? 0;
    const refunded = num(obj.amount_refunded) ?? 0;
    const fullFlag = obj.refunded === true;
    const partial = !fullFlag && captured > 0 && refunded < captured;
    const stripe = {
      id: strId(obj.id) ?? objectId,
      payment_intent: pi,
      amount_captured: captured,
      amount_refunded: refunded,
      refunded: fullFlag,
    };
    if (!internal) {
      return escalate({
        stripe,
        internal: null,
        checks: [{ name: 'payable_match', pass: false, expected: 'matching payable', actual: 'none (orphan refund)' }],
        verdict: `Refund on charge ${strId(obj.id) ?? objectId} matched no payable for PI ${pi ?? '?'} (orphan).`,
      });
    }
    if (partial) {
      return escalate({
        stripe,
        internal,
        checks: [{ name: 'refund_full_or_none', pass: false, expected: 'full or none', actual: `${refunded}/${captured}` }],
        verdict: `Partial refund ${refunded}/${captured} on ${internal.table} ${internal.id} — manual reconciliation (partial accounting is v2).`,
      });
    }
    // FULL refund → verify the internal reversal completed.
    const reversed = isRefunded(internal);
    const checks: EvidenceCheck[] = [
      { name: 'payable_refunded', pass: reversed, expected: 'refunded', actual: internal.status },
    ];
    let contraPresent = true;
    if (internal.table === 'invoice_payments') {
      const contra = await sb
        .from('designer_earnings')
        .select('id, net_amount, status')
        .eq('reverses_invoice_payment_id', internal.id)
        .maybeSingle();
      if (contra.error) throw new Error(`designer_earnings lookup failed: ${contra.error.message}`);
      contraPresent = !!contra.data;
      checks.push({ name: 'contra_earnings_present', pass: contraPresent, expected: 'reversal row', actual: contraPresent ? 'present' : 'missing' });
    }
    const clean = reversed && contraPresent;
    return (clean ? done : escalate)({
      stripe,
      internal,
      checks,
      verdict: clean
        ? `Full refund on ${internal.table} ${internal.id} fully reversed internally.`
        : `Full refund on ${internal.table} ${internal.id} not fully reversed (refunded=${reversed}, contra=${contraPresent}).`,
    });
  }

  // ── Unknown reconcile type — escalate rather than silently pass ───────────
  return escalate({
    stripe: { object_type: objectType, object_id: objectId },
    internal: null,
    checks: [{ name: 'known_event_type', pass: false, expected: 'a reconcilable event type', actual: eventType }],
    verdict: `Unhandled stripe_event type ${eventType} — routed to review.`,
  });
}

// ─── Per-task orchestration ───────────────────────────────────────────────────

export async function processStripeEventTask(deps: ProcessorDeps, task: AgentTask): Promise<EvalResult> {
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const eventType = String(payload.event_type);
  const objectId = (payload.object_id as string | null) ?? null;
  const objectType = (payload.object_type as string | null) ?? null;

  const alwaysEscalate = ALWAYS_ESCALATE.has(eventType);

  let primary: StripeObject | null = null;
  if (FETCHABLE_OBJECT_TYPES.has(objectType ?? '')) {
    try {
      primary = await deps.fetchStripeObject(objectType, objectId);
    } catch (err) {
      if (alwaysEscalate) {
        // Escalate anyway with the identifiers we have — enrichment failed but
        // this event always needs a human regardless of the object's state.
        primary = null;
      } else {
        // Transient Stripe/API error on a done-eligible event: rethrow so the
        // run loop parks it failed non-fatal (Postgres backs it off).
        throw err;
      }
    }
  }

  return await evaluateEvent(deps, eventType, objectType, objectId, primary, payload);
}

// ─── job_runs bookkeeping ─────────────────────────────────────────────────────

async function insertJobRun(deps: ProcessorDeps, startedAt: string): Promise<string | number | null> {
  const { data, error } = await deps.supabase
    .from('job_runs')
    .insert({ job_name: WORKER, status: 'running', started_at: startedAt })
    .select('id')
    .single();
  if (error) throw new Error(`job_runs insert failed: ${error.message}`);
  return (data as { id?: string | number } | null)?.id ?? null;
}

async function finishJobRun(
  deps: ProcessorDeps,
  id: string | number | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (id == null) return;
  await deps.supabase.from('job_runs').update(patch).eq('id', id);
}

// ─── The run ──────────────────────────────────────────────────────────────────

export async function runProcessor(deps: ProcessorDeps): Promise<ProcessorSummary> {
  const worker = deps.worker ?? createLeaseOwner(WORKER);
  const startedAt = deps.now().toISOString();
  const runId = await insertJobRun(deps, startedAt);

  const counts = { claimed: 0, done: 0, awaiting_review: 0, failed: 0, passthrough: 0 };
  let status: 'succeeded' | 'failed' = 'succeeded';
  let errorText: string | null = null;

  try {
    const tasks = await claimAgentTasks(deps.supabase, {
      taskTypes: CLAIM_TYPES,
      batch: CLAIM_BATCH,
      worker,
      visibilityTimeout: VISIBILITY,
    });
    counts.claimed = tasks.length;

    for (const task of tasks) {
      try {
        const payload = (task.payload ?? {}) as Record<string, unknown>;
        // Pre-formed evidence task (payment_discrepancy / damage_claim_escalation,
        // arriving in W2.3): no event_type → pass the payload through to review.
        if (payload.event_type == null) {
          const completed = await completeAgentTaskIfOwned(deps.supabase, {
            id: task.id,
            outcome: 'awaiting_review',
            artifacts: { passthrough: true, source_task_type: task.task_type, evidence: payload },
            actor: worker,
          });
          if (!completed) {
            console.warn('stripe-event-processor: lease lost before passthrough completion', task.id, worker);
            continue;
          }
          counts.passthrough++;
          continue;
        }

        const result = await processStripeEventTask(deps, task);
        const completed = await completeAgentTaskIfOwned(deps.supabase, {
          id: task.id,
          outcome: result.outcome,
          artifacts: result.artifacts as unknown as Record<string, unknown>,
          confidence: result.confidence,
          actor: worker,
        });
        if (!completed) {
          console.warn('stripe-event-processor: lease lost before completion', task.id, worker);
          continue;
        }
        if (result.outcome === 'done') counts.done++;
        else counts.awaiting_review++;
      } catch (taskErr) {
        // Transient error for this task → failed non-fatal (backoff). One bad
        // task never sinks the batch.
        const message = (taskErr as Error)?.message ?? String(taskErr);
        try {
          const completed = await completeAgentTaskIfOwned(deps.supabase, {
            id: task.id,
            outcome: 'failed',
            fatal: false,
            error: message,
            actor: worker,
          });
          if (!completed) {
            console.warn('stripe-event-processor: lease lost before failed completion', task.id, worker);
            continue;
          }
        } catch (completeErr) {
          console.error('stripe-event-processor: failed to mark task failed', task.id, completeErr);
        }
        counts.failed++;
      }
    }
  } catch (runErr) {
    status = 'failed';
    errorText = (runErr as Error)?.message ?? String(runErr);
  }

  await finishJobRun(deps, runId, {
    status,
    finished_at: deps.now().toISOString(),
    detail: counts,
    error: errorText,
  });

  return { status, ...counts, error: errorText };
}
