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

/**
 * A fresh page load, in a module that only ever reads once.
 *
 * @internal Test seam. Nothing on the surface may call this: it re-arms the
 * latch, and a second read of a consumed address would replay a receipt.
 */
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

/* ── CONFIRMING THE RETURN ───────────────────────────────────────────────────
   A return URL says only that Checkout handed the browser back. It is not
   evidence that money moved: ACH is the preferred method and settles in 3–5
   business days, and a client can reach `?checkout=success` by typing it.

   So the house waits for its own row to say so. While it waits it says it is
   waiting, and after `CONFIRM_POLL_TIMEOUT_MS` it says plainly that nothing is
   confirmed yet — the two sentences the invoice detail page said, in its own
   words. Nothing here ever reverses: `confirming` hardens into `confirmed` or
   into `unconfirmed`, and neither one un-says a payment. ─────────────────── */

export const CONFIRM_POLL_INTERVAL_MS = 3_000;
export const CONFIRM_POLL_TIMEOUT_MS = 30_000;

export type ConfirmState = 'confirming' | 'confirmed' | 'unconfirmed';

/**
 * @param active   a settled return naming a row THIS surface is rendering
 * @param settled  that row itself says the money landed
 * @param onRefetch the surface's own re-read, polled while waiting
 */
export function useCheckoutConfirmation(
  active: boolean,
  settled: boolean,
  onRefetch?: () => void | Promise<unknown>,
): ConfirmState | null {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!active || settled) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= CONFIRM_POLL_TIMEOUT_MS) {
        setTimedOut(true);
        clearInterval(timer);
        return;
      }
      void onRefetch?.();
    }, CONFIRM_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, settled, onRefetch]);

  if (!active) return null;
  if (settled) return 'confirmed';
  return timedOut ? 'unconfirmed' : 'confirming';
}

/**
 * Bring the anchor the till returned to into view, once. `replaceState` sets
 * the fragment without ever scrolling to it, and the letterbox sits well below
 * the first viewport — the receipt would otherwise be off-screen with nothing
 * to say it exists.
 */
export function revealReturnAnchor(element: HTMLElement | null): void {
  if (!element || typeof element.scrollIntoView !== 'function') return;
  const still =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true;
  element.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
}
