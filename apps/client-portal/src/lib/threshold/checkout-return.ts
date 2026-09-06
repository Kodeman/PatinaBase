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

/**
 * The same address with `paramsToStrip` struck out and `hash` set. Defaults
 * to every till param, `?invoice=`/`?order=` included — the return's own
 * cleanup. A narrower list lets a caller strip only the return's own params
 * while leaving `?invoice=`/`?order=` for someone else to read.
 */
export function cleanedCheckoutUrl(
  href: string,
  hash: string,
  paramsToStrip: readonly string[] = TILL_PARAMS,
): string {
  const url = new URL(href, 'http://threshold.invalid');
  for (const key of paramsToStrip) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${hash}`;
}

let consumed = false;
let consumedValue: CheckoutReturn | null = null;

/**
 * The return, read and cleaned once. Callers after the first get the same
 * answer without a second history entry.
 *
 * `hash` is the fragment the cleaned address keeps. The house has two sections
 * a receipt can belong to, so it defaults to choosing between them exactly as
 * it always has. `/pay/<token>` is one sheet with no sections and no anchor to
 * name, and passes `''`.
 */
export function consumeCheckoutReturn(hash?: string): CheckoutReturn | null {
  if (consumed) return consumedValue;
  consumed = true;
  if (typeof window === 'undefined') return null;
  consumedValue = readCheckoutReturn(window.location.search);
  if (consumedValue) {
    window.history.replaceState(
      {},
      '',
      cleanedCheckoutUrl(
        window.location.href,
        hash ?? (consumedValue.orderId ? '#road' : '#letterbox'),
      ),
    );
  }
  return consumedValue;
}

/* ── A LETTER NAMED ON THE ADDRESS ───────────────────────────────────────────
   `/invoices/<id>` still goes out in the studio's mail — the Patina iOS app
   claims it — and the middleware folds it to `/#letterbox?invoice=<id>`. The
   letterbox holds ONE letter, chosen by due date, so without this the client
   who followed a link about invoice B reads invoice A and is never told which
   she is looking at. The named letter stands in the slot instead.

   Read once and struck out, the same way the till's return is: a param left on
   the address would keep re-choosing the letter across every later navigation.
   ─────────────────────────────────────────────────────────────────────────── */

let namedConsumed = false;
let namedValue: string | null = null;

export function consumeNamedInvoice(): string | null {
  if (namedConsumed) return namedValue;
  namedConsumed = true;
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  // A return from the till owns `?invoice=` while it is being read; the
  // receipt, not the slot, is what that address is about.
  if (params.get('checkout')) return null;
  const id = params.get('invoice');
  if (!id) return null;
  namedValue = id;
  window.history.replaceState(
    {},
    '',
    cleanedCheckoutUrl(window.location.href, window.location.hash || '#letterbox'),
  );
  return namedValue;
}

/** The named letter, after hydration — never during SSR. */
export function useNamedInvoice(): string | null {
  const [named, setNamed] = useState<string | null>(null);
  useEffect(() => {
    // Reading the browser's address is a synchronization with an external
    // system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNamed(consumeNamedInvoice());
  }, []);
  return named;
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
  namedConsumed = false;
  namedValue = null;
}

/** The return, after hydration — never during SSR, where there is no address. */
export function useCheckoutReturn(hash?: string): CheckoutReturn | null {
  const [received, setReceived] = useState<CheckoutReturn | null>(null);
  useEffect(() => {
    // Reading the browser's return address is a synchronization with an
    // external system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceived(consumeCheckoutReturn(hash));
    // The hash names the cleaned address once, on the first read; a later
    // change to it has nothing left to clean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
   words.

   `confirmed` is final and never un-said. `unconfirmed` is NOT: it means "not
   yet", and a row that settles later — an ACH debit clearing days after the
   poll gave up — still hardens into `confirmed` on the next read. The one
   direction refused is confirmed → anything else, which would un-say a
   payment the client has already been told about. ────────────────────────── */

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

/* ── A RETURN NOBODY IS READING (W3b) ────────────────────────────────────────
   The letterbox stopped consuming `?checkout=` when settle-in-place moved to
   `/pay/<token>`; only `RoadOrders` reads it now, and `RoadOrders` mounts
   only where there are direct orders. A household with a studio invoice and
   no orders — the `LetterboxDoor` path, and `Threshold` whenever the road has
   none — has nothing left that strikes a stale return off the address, so a
   `?checkout=success&session_id=…` from an old mail or a shared link would
   otherwise linger in the bar, and in anything the client copies, for the
   rest of the SPA session.

   This does NOT restore a receipt: it only keeps the address honest. It
   leaves `?invoice=`/`?order=` alone — those name a letter or a road record
   on their own, independently of any return — so only the return's own four
   params are struck. ─────────────────────────────────────────────────────── */

const RETURN_ONLY_PARAMS = ['checkout', 'session_id', 'checkout_attempt_id', 'payment_id'] as const;

/** Strike a stale return's own params, once, when one is present. A no-op on
 * an address with no `?checkout=` — a plain `?invoice=` link is untouched. */
export function stripStaleTillParams(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.get('checkout')) return;
  window.history.replaceState(
    {},
    '',
    cleanedCheckoutUrl(window.location.href, window.location.hash || '', RETURN_ONLY_PARAMS),
  );
}

/**
 * `stripStaleTillParams`, on mount, only when `enabled`. Pass `false` where a
 * `RoadOrders` (or any other `useCheckoutReturn` consumer) is mounted
 * alongside — it reads and cleans the return's params itself, and racing it
 * would strip `checkout` before it gets a chance to recognise the return.
 */
export function useStripStaleTillParams(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    stripStaleTillParams();
  }, [enabled]);
}
