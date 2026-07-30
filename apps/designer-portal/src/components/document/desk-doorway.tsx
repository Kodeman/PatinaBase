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
 *
 * Mechanics, deliberately boring:
 *  · It dispatches the SAME CustomEvents every in-app surface already uses —
 *    `document:open-ledger` (studio-drawer.tsx owns the listener and the
 *    room-vs-sheet routing), `document:open-post`, `document:open-account`.
 *    No second opening mechanism exists, so ⌘K and a cold URL can never drift.
 *  · It must mount AFTER StudioDrawer / PostSheet / AccountSheet in the layout
 *    JSX: React runs effects in mount order, so those listeners have to attach
 *    before this one fires or the event lands on nothing.
 *  · It fires at most once per mount (`firedRef`) and only on /desk.
 *  · Unknown book / page / account values are ignored in silence — a stale link
 *    lands the designer on a plain Desk rather than an error.
 *  · Stripping is surgical: only the doorway keys are deleted, so an unrelated
 *    param riding along (e.g. the PO checkout return's `po=`) survives the
 *    replace instead of being swallowed.
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

/** Every key this component consumes — and therefore the only keys it erases. */
const DOORWAY_KEYS = [
  'book',
  'page',
  'vendorId',
  'projectId',
  'invoiceId',
  'account',
] as const;

function DeskDoorwayInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (pathname !== '/desk') return;

    const present = DOORWAY_KEYS.some((k) => params.get(k) !== null);
    if (!present) return;
    firedRef.current = true;

    const book = params.get('book')?.toLowerCase() ?? null;
    const account = params.get('account')?.toLowerCase() ?? null;

    if (book && book in BOOK_PAGES) {
      const key = book as Book;
      if (key === 'post') {
        // The Post is its own sheet (post-sheet.tsx), not a drawer ledger —
        // it takes no context and opens onto the Record by its own rule.
        openPost();
      } else {
        const allowed: readonly string[] = BOOK_PAGES[key];
        const page = params.get('page')?.toLowerCase() ?? null;
        const context: OpenLedgerContext = {};
        if (page && allowed.includes(page)) context.page = page;
        const vendorId = params.get('vendorId');
        const projectId = params.get('projectId');
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

    // Erase only what we consumed; anything else on the URL rides along.
    const rest = new URLSearchParams(params.toString());
    for (const k of DOORWAY_KEYS) rest.delete(k);
    const qs = rest.toString();
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
