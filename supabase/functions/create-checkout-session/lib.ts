// Pure helpers for create-checkout-session — extracted so the Checkout
// session shape (card + ACH bank transfer, amounts, metadata, redirect URLs)
// is testable without booting Deno.serve or touching Stripe/Supabase over
// the network.
// Run: deno test supabase/functions/create-checkout-session/lib.test.ts

import type Stripe from 'npm:stripe@17';

export interface CheckoutInvoiceLabelInput {
  invoiceId: string;
  invoiceNumber: string | null;
  projectName: string | null;
}

/** "Invoice {number} — {project}", falling back to a short id / generic name. */
export function checkoutInvoiceLabel(input: CheckoutInvoiceLabelInput): string {
  const number = input.invoiceNumber ?? input.invoiceId.slice(0, 8);
  const project = input.projectName ?? 'Patina project';
  return `Invoice ${number} — ${project}`;
}

export interface BuildCheckoutSessionParamsInput {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  projectName: string | null;
  currency: string;
  amountDueCents: number;
  clientPortalUrl: string;
}

/**
 * Builds the Stripe Checkout Session create() params for an invoice's
 * remaining balance. Pure — no network calls.
 *
 * Payment methods: card + us_bank_account (ACH), card listed first so it
 * stays the default tab in Checkout. verification_method 'automatic' lets
 * Financial Connections attempt instant bank-account verification before
 * falling back to Stripe's micro-deposit flow.
 */
export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionParamsInput
): Stripe.Checkout.SessionCreateParams {
  const label = checkoutInvoiceLabel(input);
  return {
    mode: 'payment',
    customer: input.customerId,
    payment_method_types: ['card', 'us_bank_account'],
    payment_method_options: {
      us_bank_account: {
        verification_method: 'automatic',
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (input.currency || 'USD').toLowerCase(),
          unit_amount: input.amountDueCents,
          product_data: { name: label },
        },
      },
    ],
    metadata: { invoice_id: input.invoiceId },
    payment_intent_data: { metadata: { invoice_id: input.invoiceId } },
    success_url: `${input.clientPortalUrl}/invoices/${input.invoiceId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.clientPortalUrl}/invoices/${input.invoiceId}?checkout=cancelled`,
  };
}
