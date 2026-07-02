'use client';

/**
 * The Studio Drawer (D8, spec v1.2 §8; Desk light restyle): a quiet fixed strip
 * at the bottom edge — part of the desk, never the paper. Now a white 60px bar
 * with a hairline top border. Left: the Patina wordmark (home) + a breadcrumb.
 * Center: the five room doors. Right: the in-hand readout, a notification bell,
 * and the identity nameplate. Discipline holds: no shouty badges, no pulsing —
 * the bell's clay dot is awareness, not a count.
 *
 * D14 — two weights. Most books are SHEETS (pull, glance, put back; the
 * document stays mounted). The Library and People are ROOMS (R39/R50): places
 * you walk into. Opening a room-weight book NAVIGATES into the Room (which puts
 * the held document down through the normal flow); opening a sheet-weight book
 * slides a DocSheet over whatever is in hand. This routing is centralized here —
 * the drawer owns the open-ledger event — so ⌘K and the mobile drawer get it
 * for free.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, Package, Receipt, Users, Clock, Bell } from 'lucide-react';
import { useUnreadInboxCount } from '@patina/supabase';
import { DocSheet } from './overlays/doc-sheet';
import { OrdersLedger } from './orders-ledger';
import { AccountsBook } from './accounts/accounts-book';
import { HoursLedger } from './hours-ledger';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { fmtMinutes } from '@/lib/document/time-derivation';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { AccountNameplate } from './account/account-nameplate';
import type { OpenLedgerContext } from './command-bar';

const LEDGERS = [
  { key: 'library', name: 'Library', icon: BookOpen, weight: 'room', href: '/library' },
  { key: 'orders', name: 'Orders', icon: Package, weight: 'sheet' },
  { key: 'accounts', name: 'Accounts', icon: Receipt, weight: 'sheet' },
  { key: 'people', name: 'People', icon: Users, weight: 'room', href: '/people' },
  { key: 'hours', name: 'Hours', icon: Clock, weight: 'sheet' },
] as const;

type Ledger = (typeof LEDGERS)[number];
type LedgerKey = Ledger['key'];

/** A quiet breadcrumb for the current surface; the Desk needs none — the
 *  wordmark is the home affordance. */
function breadcrumbFor(pathname: string | null): string | null {
  if (!pathname || pathname === '/desk') return null;
  if (pathname.startsWith('/library')) return 'Library';
  if (pathname.startsWith('/people')) return 'People';
  if (pathname.startsWith('/drafting') || pathname.startsWith('/compose')) return 'Drafting';
  if (pathname.startsWith('/doc')) return 'Document';
  return null;
}

export function StudioDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const [openLedger, setOpenLedger] = useState<LedgerKey | null>(null);
  // Pre-addressing context for whichever sheet opens (Orders: vendor/page;
  // Accounts: receivables page + invoiceId). Each book reads only its own keys.
  const [sheetContext, setSheetContext] = useState<OpenLedgerContext | null>(null);
  const open = LEDGERS.find((l) => l.key === openLedger) ?? null;
  const { inHandToday } = useDocumentTime();
  const { data: unread = 0 } = useUnreadInboxCount();
  const breadcrumb = breadcrumbFor(pathname);
  const holding = (pathname ?? '').startsWith('/doc/');

  /** Walk into a Room: stash the surface we're leaving, then navigate. The
   *  prior document unmounts and puts itself down (timer chains out). A no-op
   *  when we're already in that Room (no redundant push / remount / refetch). */
  const enterRoom = (href: string) => {
    if (pathname === href) return;
    rememberRoomOrigin(pathname);
    router.push(href);
  };

  // ⌘K and other surfaces open a ledger by name through this event. A
  // room-weight ledger walks in; a sheet-weight ledger opens its sheet.
  // R28/R29: the detail may carry pre-addressing context ({ name, context }).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<string | { name: string; context?: OpenLedgerContext }>)
        .detail;
      const name = typeof detail === 'string' ? detail : detail.name;
      const context = typeof detail === 'string' ? null : (detail.context ?? null);
      const match = LEDGERS.find((l) => l.key === name);
      if (!match) return;
      if (match.weight === 'room') {
        enterRoom(match.href);
        return;
      }
      setSheetContext(context);
      setOpenLedger(match.key);
    };
    window.addEventListener('document:open-ledger', onOpen);
    return () => window.removeEventListener('document:open-ledger', onOpen);
    // enterRoom closes over pathname/router; re-bind when the surface changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* The unified mobile bar (D13) replaces this nav below 980px. */}
      <nav
        aria-label="Studio drawer"
        className="fixed inset-x-0 bottom-0 z-40 hidden h-[60px] grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-[22px] min-[980px]:grid"
      >
        {/* Left — the studio wordmark (home) + a quiet breadcrumb. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/desk"
            className="shrink-0 rounded-[3px] font-heading text-[15px] font-medium uppercase tracking-[0.2em] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            Patina
          </Link>
          {breadcrumb && (
            <>
              <span aria-hidden className="text-[var(--border-default)]">
                /
              </span>
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {breadcrumb}
              </span>
            </>
          )}
        </div>

        {/* Center — the room doors. */}
        <div className="flex items-center gap-0.5">
          {LEDGERS.map((ledger) => {
            const Icon = ledger.icon;
            const here =
              ledger.weight === 'room'
                ? (pathname ?? '') === ledger.href ||
                  (pathname ?? '').startsWith(`${ledger.href}/`)
                : openLedger === ledger.key;
            return (
              <button
                key={ledger.key}
                type="button"
                aria-current={here ? 'page' : undefined}
                onClick={() =>
                  ledger.weight === 'room'
                    ? enterRoom(ledger.href)
                    : (setSheetContext(null), setOpenLedger(ledger.key))
                }
                className={`relative inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-[0.82rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)] ${
                  here
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} aria-hidden />
                <span>{ledger.name}</span>
                {here && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-clay)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right — in-hand state, notifications, identity. */}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              setSheetContext(null);
              setOpenLedger('hours');
            }}
            aria-label="Hours"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] px-2 py-1.5 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)]"
          >
            {holding && inHandToday > 0 ? (
              <>
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  In hand today
                </span>
                <span className="font-heading text-[13px] italic text-[var(--color-clay)]">
                  {fmtMinutes(inHandToday)}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Hands free
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/portal/inbox')}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-[3px] text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)]"
          >
            <Bell className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full bg-[var(--color-clay)]"
              />
            )}
          </button>

          <AccountNameplate />
        </div>
      </nav>

      {/* Sheet-weight ledgers only — the Library (room) never opens here. */}
      <DocSheet
        open={open !== null && open.weight === 'sheet'}
        onClose={() => setOpenLedger(null)}
        title={open?.name ?? ''}
      >
        {open?.key === 'orders' && (
          <OrdersLedger onClose={() => setOpenLedger(null)} initialContext={sheetContext} />
        )}
        {open?.key === 'accounts' && (
          <AccountsBook onClose={() => setOpenLedger(null)} initialContext={sheetContext} />
        )}
        {open?.key === 'hours' && <HoursLedger initialContext={sheetContext} />}
        {/* All sheet-weight ledgers (orders/accounts/hours) are bound; People is
            a Room (R50), so no generic placeholder branch remains. */}
      </DocSheet>
    </>
  );
}
