'use client';

/**
 * The Studio Drawer (D8, spec v1.2 §8): a quiet fixed strip at the bottom
 * edge — part of the desk, never the paper. Five ledger books + the
 * right-aligned "In hand today" readout (live, D9). Discipline: no badges,
 * no unread counts, no pulsing — the readout is the designer's own day,
 * not a notification.
 *
 * D14 — two weights. Most books are SHEETS (pull, glance, put back; the
 * document stays mounted). The Library is a ROOM (R39): a place you walk into,
 * marked with a doorway affordance (a Strata spine-tick + "↗"). Opening a
 * room-weight book NAVIGATES into the Room (which puts the held document down
 * through the normal flow); opening a sheet-weight book slides a DocSheet over
 * whatever is in hand. This routing is centralized here — the drawer owns the
 * open-ledger event — so ⌘K and the mobile drawer get it for free.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DocSheet } from './overlays/doc-sheet';
import { OrdersLedger } from './orders-ledger';
import { HoursLedger } from './hours-ledger';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { fmtMinutes } from '@/lib/document/time-derivation';
import { isRoomPath, rememberRoomOrigin } from '@/lib/document/room-origin';
import type { OpenLedgerContext } from './command-bar';

const LEDGERS = [
  { key: 'library', name: 'Library', spine: 'var(--color-clay)', weight: 'room', href: '/library' },
  { key: 'orders', name: 'Orders', spine: 'var(--color-dusty-blue)', weight: 'sheet' },
  { key: 'accounts', name: 'Accounts', spine: 'var(--color-sage)', weight: 'sheet' },
  { key: 'people', name: 'People', spine: 'var(--color-terracotta)', weight: 'sheet' },
  { key: 'hours', name: 'Hours', spine: 'var(--color-mocha)', weight: 'sheet' },
] as const;

type Ledger = (typeof LEDGERS)[number];
type LedgerKey = Ledger['key'];

/** The doorway spine-tick (D14): three diminishing clay lines marking a
 *  room-weight book — "a place you walk into", distinct from a sheet's bar. */
function DoorwayTick() {
  return (
    <span aria-hidden className="inline-flex flex-col gap-[2px]">
      <i className="block h-[2px] w-[15px] rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
      <i className="block h-[2px] w-[7px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
    </span>
  );
}

export function StudioDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const [openLedger, setOpenLedger] = useState<LedgerKey | null>(null);
  const [ordersContext, setOrdersContext] = useState<OpenLedgerContext | null>(null);
  const open = LEDGERS.find((l) => l.key === openLedger) ?? null;
  const { inHandToday } = useDocumentTime();

  /** Walk into a Room: stash the surface we're leaving, then navigate. The
   *  prior document unmounts and puts itself down (timer chains out). */
  const enterRoom = (href: string) => {
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
      setOrdersContext(match.key === 'orders' ? context : null);
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
        className="fixed inset-x-0 bottom-0 z-40 hidden items-center gap-2 overflow-x-auto border-t border-[rgba(250,247,242,0.14)] bg-[var(--color-charcoal)] px-4 py-[0.55rem] min-[980px]:flex sm:px-6"
      >
        <span className="mr-1.5 whitespace-nowrap font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[rgba(250,247,242,0.3)]">
          Studio
        </span>
        {LEDGERS.map((ledger) => {
          const isRoom = ledger.weight === 'room';
          const here = isRoom && isRoomPath(pathname ?? '');
          return (
            <button
              key={ledger.key}
              type="button"
              aria-current={here ? 'page' : undefined}
              onClick={() => (isRoom ? enterRoom(ledger.href) : setOpenLedger(ledger.key))}
              className={`inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-[4px] border px-3 py-[0.4rem] transition-colors duration-150 ${
                here
                  ? 'border-[rgba(196,165,123,0.45)] bg-[rgba(196,165,123,0.12)]'
                  : 'border-[rgba(250,247,242,0.12)] bg-[rgba(250,247,242,0.06)] hover:border-[rgba(196,165,123,0.45)]'
              }`}
            >
              {isRoom ? (
                <DoorwayTick />
              ) : (
                <span
                  aria-hidden
                  className="h-[15px] w-[3px] rounded-[1px]"
                  style={{ background: ledger.spine }}
                />
              )}
              <span
                className={`font-heading text-[11px] font-medium ${
                  here ? 'text-[var(--color-off-white)]' : 'text-[rgba(250,247,242,0.85)]'
                }`}
              >
                {ledger.name}
              </span>
              {isRoom && !here && (
                <span aria-hidden className="font-mono text-[10px] text-[var(--color-clay)] opacity-70">
                  ↗
                </span>
              )}
              {here && (
                <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--color-clay)]">
                  · here
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenLedger('hours')}
          className="ml-auto inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-[4px] border border-transparent px-3 py-[0.4rem] hover:border-[rgba(196,165,123,0.35)]"
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[rgba(250,247,242,0.35)]">
            In hand today
          </span>
          <span className="font-heading text-[13px] italic text-[var(--color-clay)]">
            {inHandToday > 0 ? fmtMinutes(inHandToday) : '—'}
          </span>
        </button>
      </nav>

      {/* Sheet-weight ledgers only — the Library (room) never opens here. */}
      <DocSheet
        open={open !== null && open.weight === 'sheet'}
        onClose={() => setOpenLedger(null)}
        title={open?.name ?? ''}
      >
        {open?.key === 'orders' && (
          <OrdersLedger onClose={() => setOpenLedger(null)} initialContext={ordersContext} />
        )}
        {open?.key === 'hours' && <HoursLedger />}
        {open && open.key !== 'orders' && open.key !== 'hours' && open.weight === 'sheet' && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center gap-3">
              <span
                aria-hidden
                className="h-[18px] w-[3px] rounded-[1px]"
                style={{ background: open.spine }}
              />
              <h2 className="font-heading text-xl text-[var(--color-pearl)]">{open.name}</h2>
            </div>
            <p className="text-[13px] leading-relaxed text-[rgba(250,247,242,0.55)]">
              This ledger arrives in a later slice. The drawer and its sheets are in place so
              the desk feels whole; the {open.name} book itself is still being bound.
            </p>
          </div>
        )}
      </DocSheet>
    </>
  );
}
