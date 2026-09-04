'use client';

import { useEffect, useState } from 'react';

/* ── THE RETURN FROM THE TILL ────────────────────────────────────────────────
   Stripe hands the browser back to the house with a handful of params on the
   address. The house reads them once, says the one sentence they carry, and
   strikes them out — a refresh must never replay a payment's receipt.

   Read ONCE per page load, at module scope: the letterbox and the road both
   want the answer, and whichever effect ran first would otherwise clean the
   address out from under the other. The first caller consumes and cleans; every
   caller after it is served the same answer. ──────────────────────────────── */

export type CheckoutOutcome = 'settled' | 'unchanged';

export interface CheckoutReturn {
  outcome: CheckoutOutcome;
  /** The invoice taken to the till, when the return names one. */
  invoiceId: string | null;
  /** The direct order taken to the till, when the return names one. */
  orderId: string | null;
}

/** Everything the till adds to the address, struck out on the way in. */
const TILL_PARAMS = [
  'checkout',
  'session_id',
  'checkout_attempt_id',
  'payment_id',
  'invoice',
  'order',
] as const;

/**
 * `?checkout=success` settles; `cancel` and `cancelled` both mean nothing
 * changed (the edge function writes the long spelling, the plan the short one).
 * Anything else is not a return at all.
 */
export function readCheckoutReturn(search: string): CheckoutReturn | null {
  const params = new URLSearchParams(search);
  const checkout = params.get('checkout');
  if (checkout !== 'success' && checkout !== 'cancel' && checkout !== 'cancelled') return null;
  return {
    outcome: checkout === 'success' ? 'settled' : 'unchanged',
    invoiceId: params.get('invoice'),
    orderId: params.get('order'),
  };
}

/** The same address with the till's params struck out and `hash` set. */
export function cleanedCheckoutUrl(href: string, hash: string): string {
  const url = new URL(href, 'http://threshold.invalid');
  for (const key of TILL_PARAMS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${hash}`;
}

let consumed = false;
let consumedValue: CheckoutReturn | null = null;

/**
 * The return, read and cleaned once. Callers after the first get the same
 * answer without a second history entry.
 */
export function consumeCheckoutReturn(): CheckoutReturn | null {
  if (consumed) return consumedValue;
  consumed = true;
  if (typeof window === 'undefined') return null;
  consumedValue = readCheckoutReturn(window.location.search);
  if (consumedValue) {
    window.history.replaceState(
      {},
      '',
      cleanedCheckoutUrl(window.location.href, consumedValue.orderId ? '#road' : '#letterbox'),
    );
  }
  return consumedValue;
}

/** Test seam: a fresh page load, in a module that only ever reads once. */
export function resetCheckoutReturn(): void {
  consumed = false;
  consumedValue = null;
}

/** The return, after hydration — never during SSR, where there is no address. */
export function useCheckoutReturn(): CheckoutReturn | null {
  const [received, setReceived] = useState<CheckoutReturn | null>(null);
  useEffect(() => {
    // Reading the browser's return address is a synchronization with an
    // external system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceived(consumeCheckoutReturn());
  }, []);
  return received;
}
