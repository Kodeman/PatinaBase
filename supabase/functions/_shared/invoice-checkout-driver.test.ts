import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { InvoiceCheckoutAttempt } from './invoice-checkout-core.ts';
import { InvoiceCheckoutIntegrityError } from './invoice-checkout-core.ts';
import {
  invoiceCheckoutErrorResponse,
  invoiceCheckoutReturnBase,
  invoiceSessionMetadata,
  mapInvoiceAttempt,
  type InvoiceCheckoutTarget,
} from './invoice-checkout-driver.ts';

const NONCE = 'b'.repeat(64);

function attempt(overrides: Partial<InvoiceCheckoutAttempt> = {}): InvoiceCheckoutAttempt {
  return {
    attemptId: 'attempt-1',
    paymentId: 'payment-1',
    invoiceId: 'invoice-1',
    payerId: 'client-1',
    invoiceLinkId: null,
    returnNonce: null,
    stripeCustomerId: 'cus_client_1',
    amountCents: 12_500,
    surchargeCents: 0,
    paymentMethod: null,
    currency: 'usd',
    state: 'claimed',
    stripeIdempotencyKey: 'invoice-checkout:attempt-1',
    stripeCheckoutSessionId: null,
    supersededSessionId: null,
    ...overrides,
  };
}

// ── invoiceSessionMetadata — the exact key set per rail (M6) ─────────────────
// One identity per rail (F5 ruling): the signed-in rail claims as the payer,
// the guest rail always as the link. The driver never chooses — its caller does.

Deno.test('driver metadata: a legacy payer attempt stamps today\'s keys and nothing else', () => {
  assertEquals(invoiceSessionMetadata(attempt()), {
    payable_type: 'invoice',
    invoice_id: 'invoice-1',
    checkout_attempt_id: 'attempt-1',
    payer_id: 'client-1',
  });
});

Deno.test('driver metadata: a rail-bound payer attempt adds payment_method + surcharge_cents', () => {
  assertEquals(invoiceSessionMetadata(attempt({ paymentMethod: 'card', surchargeCents: 375 })), {
    payable_type: 'invoice',
    invoice_id: 'invoice-1',
    checkout_attempt_id: 'attempt-1',
    payer_id: 'client-1',
    payment_method: 'card',
    surcharge_cents: '375',
  });
});

Deno.test('driver metadata: a link attempt stamps invoice_link_id, no payer_id key, no surcharge_cents', () => {
  const metadata = invoiceSessionMetadata(
    attempt({ payerId: null, invoiceLinkId: 'link-1', paymentMethod: 'us_bank_account', surchargeCents: 80 })
  );
  assertEquals(metadata, {
    payable_type: 'invoice',
    invoice_id: 'invoice-1',
    checkout_attempt_id: 'attempt-1',
    invoice_link_id: 'link-1',
    payment_method: 'us_bank_account',
  });
  assertEquals('payer_id' in metadata, false);
  for (const value of Object.values(metadata)) assertEquals(value === 'null', false);
});

// ── mapInvoiceAttempt — the discriminated union (M1) ─────────────────────────

function claimEcho(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: 'attempt-1',
    payment_id: 'payment-1',
    invoice_id: 'invoice-1',
    payer_id: 'client-1',
    invoice_link_id: null,
    return_nonce: NONCE,
    stripe_customer_id: 'cus_client_1',
    amount_cents: 12_500,
    surcharge_cents: 0,
    payment_method: null,
    currency: 'usd',
    state: 'claimed',
    stripe_idempotency_key: 'invoice-checkout:attempt-1',
    stripe_checkout_session_id: null,
    superseded_session_id: null,
    ...overrides,
  };
}

Deno.test('driver claim: a payer echo and a link echo both map; neither or both identities throw', () => {
  const payer = mapInvoiceAttempt(claimEcho());
  assertEquals(payer.payerId, 'client-1');
  assertEquals(payer.invoiceLinkId, null);
  assertEquals(payer.returnNonce, NONCE);

  const link = mapInvoiceAttempt(claimEcho({ payer_id: null, invoice_link_id: 'link-1' }));
  assertEquals(link.payerId, null);
  assertEquals(link.invoiceLinkId, 'link-1');

  for (const bad of [
    { payer_id: null, invoice_link_id: null },
    { payer_id: 'client-1', invoice_link_id: 'link-1' },
    { payer_id: '', invoice_link_id: '' },
  ]) {
    assertThrows(() => mapInvoiceAttempt(claimEcho(bad)), Error, 'invalid invoice Checkout claim');
  }
});

Deno.test('driver claim: a pre-00574 echo without a nonce maps with returnNonce null', () => {
  assertEquals(mapInvoiceAttempt(claimEcho({ return_nonce: null })).returnNonce, null);
  const noKey = claimEcho();
  delete (noKey as Record<string, unknown>).return_nonce;
  assertEquals(mapInvoiceAttempt(noKey).returnNonce, null);
});

// ── invoiceCheckoutReturnBase — the nonce address and its M7 fallback ────────

const target: InvoiceCheckoutTarget = {
  invoiceId: 'invoice-1',
  lineItemName: 'Invoice INV-1',
  successUrl: 'https://client.test/projects/p?invoice=i&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox',
  cancelUrl: 'https://client.test/projects/p?invoice=i&checkout=cancelled#letterbox',
  processingDetail: 'processing',
  nonceReturnOrigin: 'https://client.test',
};

Deno.test('driver return: the nonce address when both the nonce and the origin exist', () => {
  const claimed = attempt({ returnNonce: NONCE });
  assertEquals(
    invoiceCheckoutReturnBase(claimed, target, 'success'),
    `https://client.test/pay/return/${NONCE}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  );
  assertEquals(
    invoiceCheckoutReturnBase(claimed, target, 'cancelled'),
    `https://client.test/pay/return/${NONCE}?checkout=cancelled`
  );
});

Deno.test('driver return: falls back to today\'s address when the nonce or the origin is missing (M7)', () => {
  assertEquals(invoiceCheckoutReturnBase(attempt(), target, 'success'), target.successUrl);
  assertEquals(
    invoiceCheckoutReturnBase(attempt({ returnNonce: NONCE }), { ...target, nonceReturnOrigin: null }, 'cancelled'),
    target.cancelUrl
  );
});

// ── invoiceCheckoutErrorResponse — the shared error table ────────────────────

async function mapped(error: unknown, lastAttempt: InvoiceCheckoutAttempt | null = null) {
  const response = invoiceCheckoutErrorResponse(
    error,
    (body, status = 200) => new Response(JSON.stringify(body), { status }),
    'test',
    lastAttempt,
    'A bank transfer is already processing.'
  );
  return { status: response.status, body: await response.json() };
}

Deno.test('driver errors: DB vocabulary maps to the same statuses on both rails', async () => {
  assertEquals(await mapped(new Error('invoice_checkout_payer_not_allowed')), {
    status: 404,
    body: { error: 'invoice_not_found' },
  });
  assertEquals(await mapped(new Error('invoice_not_found')), {
    status: 404,
    body: { error: 'invoice_not_found' },
  });
  // Review F1: a different actor met money in flight.
  assertEquals(await mapped(new Error('invoice_checkout_in_progress')), {
    status: 409,
    body: { error: 'payment_processing', detail: 'A bank transfer is already processing.' },
  });
  assertEquals((await mapped(new Error('invoice_checkout_customer_mismatch'))).body.error, 'checkout_payer_mismatch');
  assertEquals((await mapped(new Error('invoice_checkout_attempt_payer_mismatch'))).status, 409);
  assertEquals((await mapped(new Error('invoice_checkout_not_payable:paid'))).body.error, 'invoice_not_payable');
  assertEquals((await mapped(new Error('invoice_checkout_nothing_due'))).status, 409);
  assertEquals((await mapped(new Error('invoice_checkout_bad_payment_method:paypal'))).status, 400);
  assertEquals((await mapped(new Error('invoice_checkout_reconciliation_required'))).body.error, 'payment_reconciliation_required');
  assertEquals(
    (await mapped(new InvoiceCheckoutIntegrityError('checkout_persistence_failed', 'db down'))).status,
    500
  );
  assertEquals(
    (await mapped(new InvoiceCheckoutIntegrityError('checkout_session_unavailable', 'stripe down'))).status,
    502
  );
  assertEquals((await mapped(new Error('something else'))).body.error, 'checkout_claim_failed');
});

Deno.test('driver errors: the last claim\'s fields ride along once a claim exists', async () => {
  const { body } = await mapped(new Error('invoice_checkout_not_payable:paid'), attempt({ paymentMethod: 'card', surchargeCents: 375 }));
  assertEquals(body.checkout_attempt_id, 'attempt-1');
  assertEquals(body.payment_id, 'payment-1');
  assertEquals(body.surcharge_cents, 375);
});
