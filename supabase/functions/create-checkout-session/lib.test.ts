// Deno test for the create-checkout-session pure helpers (P2c — ACH bank
// payments). Run: deno test supabase/functions/create-checkout-session/lib.test.ts
//
// Tests ./lib.ts directly — importing ./index.ts would boot Deno.serve.
// Network-touching behavior (auth, Stripe API, Supabase) is exercised by the
// local `supabase functions serve` smoke flow, not here.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildCheckoutSessionParams, checkoutInvoiceLabel } from './lib.ts';

const BASE_INPUT = {
  customerId: 'cus_123',
  invoiceId: 'a1b2c3d4-0000-0000-0000-000000000000',
  invoiceNumber: 'INV-0042',
  projectName: 'Walker Residence',
  currency: 'USD',
  amountDueCents: 350_000,
  clientPortalUrl: 'https://client.patina.cloud',
};

// ─── checkoutInvoiceLabel ─────────────────────────────────────────────────────

Deno.test('checkoutInvoiceLabel uses the invoice number and project name', () => {
  assertEquals(
    checkoutInvoiceLabel({
      invoiceId: BASE_INPUT.invoiceId,
      invoiceNumber: 'INV-0042',
      projectName: 'Walker Residence',
    }),
    'Invoice INV-0042 — Walker Residence'
  );
});

Deno.test('checkoutInvoiceLabel falls back to a short id and generic project name', () => {
  assertEquals(
    checkoutInvoiceLabel({
      invoiceId: 'a1b2c3d4-0000-0000-0000-000000000000',
      invoiceNumber: null,
      projectName: null,
    }),
    'Invoice a1b2c3d4 — Patina project'
  );
});

// ─── buildCheckoutSessionParams — payment methods (ACH) ──────────────────────

Deno.test('buildCheckoutSessionParams offers card before us_bank_account', () => {
  const params = buildCheckoutSessionParams(BASE_INPUT);
  assertEquals(params.payment_method_types, ['card', 'us_bank_account']);
});

Deno.test('buildCheckoutSessionParams enables automatic ACH verification', () => {
  const params = buildCheckoutSessionParams(BASE_INPUT);
  assertEquals(params.payment_method_options?.us_bank_account?.verification_method, 'automatic');
});

Deno.test('buildCheckoutSessionParams is a one-time payment for the given customer', () => {
  const params = buildCheckoutSessionParams(BASE_INPUT);
  assertEquals(params.mode, 'payment');
  assertEquals(params.customer, 'cus_123');
});

// ─── buildCheckoutSessionParams — line item ──────────────────────────────────

Deno.test('buildCheckoutSessionParams prices the line item at amountDueCents in lowercased currency', () => {
  const params = buildCheckoutSessionParams(BASE_INPUT);
  const line = params.line_items?.[0];
  assertEquals(line?.quantity, 1);
  assertEquals(line?.price_data?.currency, 'usd');
  assertEquals(line?.price_data?.unit_amount, 350_000);
  assertEquals(line?.price_data?.product_data?.name, 'Invoice INV-0042 — Walker Residence');
});

Deno.test('buildCheckoutSessionParams defaults a blank currency to USD', () => {
  const params = buildCheckoutSessionParams({ ...BASE_INPUT, currency: '' });
  assertEquals(params.line_items?.[0]?.price_data?.currency, 'usd');
});

// ─── buildCheckoutSessionParams — metadata + redirects ───────────────────────

Deno.test('buildCheckoutSessionParams stamps invoice_id on both session and payment intent metadata', () => {
  const params = buildCheckoutSessionParams(BASE_INPUT);
  assertEquals(params.metadata, { invoice_id: BASE_INPUT.invoiceId });
  assertEquals(params.payment_intent_data?.metadata, { invoice_id: BASE_INPUT.invoiceId });
});

Deno.test('buildCheckoutSessionParams builds success/cancel URLs off the client portal origin', () => {
  const params = buildCheckoutSessionParams(BASE_INPUT);
  assertEquals(
    params.success_url,
    `https://client.patina.cloud/invoices/${BASE_INPUT.invoiceId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  );
  assertEquals(
    params.cancel_url,
    `https://client.patina.cloud/invoices/${BASE_INPUT.invoiceId}?checkout=cancelled`
  );
});
