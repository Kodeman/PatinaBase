// Deno test for the stripe-webhook pure helpers (P2c — ACH bank payments,
// async settlement). Run: deno test supabase/functions/stripe-webhook/lib.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.
// Network-touching behavior (signature verification, Supabase writes, email)
// is exercised by the local `supabase functions serve` smoke flow via
// scripts/dev/sign-stripe-event.mjs, not here.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { decideSessionCompletedAction, sessionIds } from './lib.ts';
import type Stripe from 'npm:stripe@17';

// ─── sessionIds ───────────────────────────────────────────────────────────────

function fakeSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    payment_intent: null,
    metadata: {},
    ...overrides,
  } as Stripe.Checkout.Session;
}

Deno.test('sessionIds reads the session id straight through', () => {
  const ids = sessionIds(fakeSession({ id: 'cs_test_abc' }));
  assertEquals(ids.sessionId, 'cs_test_abc');
});

Deno.test('sessionIds unwraps a string payment_intent', () => {
  const ids = sessionIds(fakeSession({ payment_intent: 'pi_123' }));
  assertEquals(ids.paymentIntentId, 'pi_123');
});

Deno.test('sessionIds unwraps an expanded payment_intent object', () => {
  const ids = sessionIds(
    fakeSession({ payment_intent: { id: 'pi_456' } as Stripe.PaymentIntent })
  );
  assertEquals(ids.paymentIntentId, 'pi_456');
});

Deno.test('sessionIds returns null paymentIntentId when absent', () => {
  const ids = sessionIds(fakeSession({ payment_intent: null }));
  assertEquals(ids.paymentIntentId, null);
});

Deno.test('sessionIds reads invoiceId from metadata.invoice_id', () => {
  const ids = sessionIds(fakeSession({ metadata: { invoice_id: 'inv-789' } }));
  assertEquals(ids.invoiceId, 'inv-789');
});

Deno.test('sessionIds returns null invoiceId when metadata is missing invoice_id', () => {
  assertEquals(sessionIds(fakeSession({ metadata: {} })).invoiceId, null);
  assertEquals(sessionIds(fakeSession({ metadata: null })).invoiceId, null);
});

// ─── decideSessionCompletedAction — the async-settlement dedupe ──────────────
//
// checkout.session.completed fires for BOTH card (instant) and ACH (async)
// payments. The dedupe this function encodes: only ever settle a payment row
// here when payment_status is 'paid' — an ACH session completes with
// 'unpaid' and must wait for async_payment_succeeded/failed instead.

Deno.test('settles on payment_status paid regardless of payment_intent state (card, instant)', () => {
  assertEquals(decideSessionCompletedAction('paid', 'pi_1', false), { kind: 'settle' });
  assertEquals(decideSessionCompletedAction('paid', 'pi_1', true), { kind: 'settle' });
  assertEquals(decideSessionCompletedAction('paid', null, false), { kind: 'settle' });
});

Deno.test('stamps the payment intent (does not settle) when unpaid with a fresh PI (ACH initiated)', () => {
  assertEquals(decideSessionCompletedAction('unpaid', 'pi_ach_1', false), {
    kind: 'stamp_payment_intent',
  });
});

Deno.test('is a no-op when unpaid and the row already has a payment intent (idempotent retry)', () => {
  assertEquals(decideSessionCompletedAction('unpaid', 'pi_ach_1', true), { kind: 'noop' });
});

Deno.test('is a no-op when unpaid with no payment intent to stamp yet', () => {
  assertEquals(decideSessionCompletedAction('unpaid', null, false), { kind: 'noop' });
});

Deno.test('no_payment_required (non-paid) does not settle, mirroring the unpaid branch', () => {
  assertEquals(decideSessionCompletedAction('no_payment_required', 'pi_1', false), {
    kind: 'stamp_payment_intent',
  });
  assertEquals(decideSessionCompletedAction('no_payment_required', null, false), { kind: 'noop' });
});
