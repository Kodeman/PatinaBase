'use client';

/**
 * The Desk Doorways (R21 dissolve) — the URL surface for the sheets that have
 * no route of their own.
 *
 * The dissolve retired `/portal/*`. Its money/time/post/settings zones did not
 * move to new routes: they became SHEETS over the Desk (the Orders book, the
 * Accounts book, Hours, the Post, the Account sheet). A sheet has no address,
 * so every outside link that used to name one of those zones — an email, a
 * Stripe return URL, a bookmark, a permanent redirect from the old zone tree —
 * needs a way to say "land on the Desk with THIS book open".
 *
 * That way is a query param on /desk, consumed exactly once and then erased:
 *
 *   /desk?book=orders   [&page=ledger|week|receiving|vendors]
 *                       [&vendorId=…] [&projectId=…]
 *   /desk?book=accounts  [&page=ledger|receivables|earnings] [&invoiceId=…]
 *   /desk?book=hours
 *   /desk?book=post
 *   /desk?account=profile|notifications|security|devices|studio
 *   /desk?authorization=…&projectId=…
 *        — opens that authorization's actionable project document.
 *   /desk?book=orders&po=…&checkout=success|cancelled&session_id=…
 *        — the Stripe Checkout return (create-checkout-session builds it).
 *
 * Mechanics, deliberately boring:
 *  · It dispatches the SAME CustomEvents every in-app surface already uses —
 *    `document:open-ledger` (studio-drawer.tsx owns the listener and the
 *    room-vs-sheet routing), `document:open-post`, `document:open-account`.
 *    No second opening mechanism exists, so ⌘K and a cold URL can never drift.
 *  · It must mount AFTER StudioDrawer / PostSheet / AccountSheet in the layout
 *    JSX: React runs effects in mount order, so those listeners have to attach
 *    before this one fires or the event lands on nothing.
 *  · It fires ONCE PER DISTINCT DOORWAY QUERY, not once per mount. The
 *    (document) layout never unmounts, and in-app soft navigations to doorway
 *    URLs are real (a Post row, the order-assistant's step-coverage link), so a
 *    mount-scoped latch would answer the first link of a session and silently
 *    swallow every one after it. `consumedRef` remembers the exact query string
 *    it last consumed; a doorway-bearing query that differs fires again.
 *  · Unknown book / page / account values are ignored in silence — a stale link
 *    lands the designer on a plain Desk rather than an error.
 *  · Stripping is TOTAL, not surgical: the URL is reduced to /desk (keeping only
 *    `tour`, the walkthrough replay param, which is not a doorway and belongs to
 *    the Desk itself). Every other param on a doorway URL has already been read
 *    by the time we get here — including the checkout return's `checkout` /
 *    `session_id` / `po`, which nothing downstream reads at all. The reason to
 *    take the whole query rather than delete known keys is address hygiene: a
 *    doorway is a one-shot instruction, and once it has been carried out the
 *    Desk's address should read `/desk`, so a refresh, a bookmark, or a shared
 *    link shows the Desk's own state instead of re-firing someone else's
 *    arrival. (Next's `redirects()` does NOT append unmatched params to the
 *    destination — `appendParamsToQuery` is false for redirects, true only for
 *    rewrites — so there is no redirect-appended junk to defend against.)
 */

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { openLedger, type OpenLedgerContext } from './command-bar';
import {
  ACCOUNT_PAGES,
  openAccountPage,
  type AccountPage,
} from './account/account-sheet';
import { openPost } from './overlays/post-sheet';
import { DESK_WALKTHROUGH_REPLAY_PARAM } from './help/desk-walkthrough-gate';

/** The books a doorway can open, with the page set each one validates. The
 *  Library, People and Rooms are ROOMS with real routes — they are never
 *  addressed through a book param. */
const BOOK_PAGES = {
  orders: ['ledger', 'week', 'receiving', 'vendors'],
  accounts: ['ledger', 'receivables', 'earnings'],
  hours: [],
  post: [],
} as const satisfies Record<string, readonly string[]>;

type Book = keyof typeof BOOK_PAGES;

/** Every key that makes a URL a DOORWAY — the presence of any one of these is
 *  what arms this component. `po`/`checkout`/`session_id` are here because the
 *  Stripe Checkout return is a doorway too: it wants the Orders book open. */
const DOORWAY_KEYS = [
  'book',
  'page',
  'vendorId',
  'projectId',
  'invoiceId',
  'authorization',
  'account',
  'checkout',
  'session_id',
  'po',
] as const;

/** The only param the Desk keeps after a doorway fires: the walkthrough replay
 *  key, which is the Desk's own address, not a doorway. Imported from the gate
 *  that reads it, so the two cannot drift apart. */
const KEPT_KEYS = [DESK_WALKTHROUGH_REPLAY_PARAM] as const;

function DeskDoorwayInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The doorway query this component last consumed. NOT a boolean latch: the
  // (document) layout never unmounts, so a boolean would answer one link per
  // session and eat every soft navigation after it.
  const consumedRef = useRef<string | null>(null);

  useEffect(() => {
    // Off the Desk, or on a Desk with no doorway on it: RE-ARM. This is the
    // other half of the repeat-firing fix — the latch has to forget, or the
    // second click on the same doorway link (a Post row read twice, a coverage
    // link followed twice) would be swallowed as a duplicate.
    if (pathname !== '/desk') {
      consumedRef.current = null;
      return;
    }

    const present = DOORWAY_KEYS.some((k) => params.get(k) !== null);
    if (!present) {
      consumedRef.current = null;
      return;
    }
    // Guarding on the exact query (not a boolean) keeps the effect idempotent
    // across the re-renders between the dispatch and the router.replace landing,
    // without blocking a genuinely new doorway.
    const signature = params.toString();
    if (consumedRef.current === signature) return;
    consumedRef.current = signature;

    const book = params.get('book')?.toLowerCase() ?? null;
    const account = params.get('account')?.toLowerCase() ?? null;
    const checkout = params.get('checkout')?.toLowerCase() ?? null;
    const authorization = params.get('authorization');
    const projectId = params.get('projectId');

    if (authorization && projectId) {
      const destination = new URLSearchParams({
        authorization,
        from: 'desk',
      });
      router.replace(
        `/doc/${encodeURIComponent(projectId)}?${destination.toString()}`,
      );
      return;
    }

    if (book && book in BOOK_PAGES) {
      const key = book as Book;
      if (key === 'post') {
        // The Post is its own sheet (post-sheet.tsx), not a drawer ledger —
        // it takes no context and opens onto the Record by its own rule.
        openPost();
      } else {
        const allowed: readonly string[] = BOOK_PAGES[key];
        const requested = params.get('page')?.toLowerCase() ?? null;
        // A Stripe Checkout return on the Orders book lands on the LEDGER: the
        // designer just paid (or backed out of) one PO's payment, and the ledger
        // is the page that shows a PO's payment state on load. (An explicit
        // &page= still wins — a hand-built link means what it says.)
        const page =
          requested ??
          (checkout && key === 'orders' ? 'ledger' : null);
        const context: OpenLedgerContext = {};
        if (page && allowed.includes(page)) context.page = page;
        const vendorId = params.get('vendorId');
        const invoiceId = params.get('invoiceId');
        if (vendorId) context.vendorId = vendorId;
        if (projectId) context.projectId = projectId;
        if (invoiceId) context.invoiceId = invoiceId;
        openLedger(
          key,
          Object.keys(context).length > 0 ? context : undefined,
        );
      }
    } else if (account) {
      // An unknown page still opens the sheet (on Profile) — the designer
      // asked for their account, and the sheet's own listener defaults.
      const page = ACCOUNT_PAGES.includes(account as AccountPage)
        ? (account as AccountPage)
        : 'profile';
      openAccountPage(page);
    }

    // Strip the address back down to /desk. Only `tour` survives — every other
    // param on a doorway URL was consumed above, and a spent instruction has no
    // business in the designer's address bar or history.
    const rest = new URLSearchParams();
    for (const k of KEPT_KEYS) {
      const value = params.get(k);
      if (value !== null) rest.set(k, value);
    }
    const qs = rest.toString();
    // The replace changes the query, so this effect re-runs — the stripped URL
    // carries no doorway key, so the `present` guard above ends the pass (and
    // re-arms for the next doorway).
    router.replace(qs ? `/desk?${qs}` : '/desk');
  }, [pathname, params, router]);

  return null;
}

export function DeskDoorway() {
  return (
    <Suspense fallback={null}>
      <DeskDoorwayInner />
    </Suspense>
  );
}
