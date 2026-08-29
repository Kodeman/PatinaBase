'use client';

/**
 * The Studio Drawer (D8, spec v1.2 §8; Desk light restyle): a quiet fixed strip
 * at the bottom edge — part of the desk, never the paper. Now a white 60px bar
 * with a hairline top border. Left: the Patina wordmark (home) + a breadcrumb.
 * Center: the three Rooms stay named while sheet-weight ledgers gather behind
 * one recent-first Studio-books doorway. Right: the in-hand readout, a quiet
 * notification doorway, and identity. No shouty badges or pulsing.
 *
 * D14 — two weights. Most books are SHEETS (pull, glance, put back; the
 * document stays mounted). Library, People, and Rooms are ROOMS (R39/R50):
 * places you walk into. Opening a room-weight book NAVIGATES into the Room (which puts
 * the held document down through the normal flow); opening a sheet-weight book
 * slides a DocSheet over whatever is in hand. This routing is centralized here —
 * the drawer owns the open-ledger event — so ⌘K and the mobile drawer get it
 * for free.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpenText,
  MessageSquareText,
  Search,
  type LucideIcon,
} from 'lucide-react';
import {
  useUnreadInboxCount,
  useProcurementUnreadCount,
  useUnseenShipped,
} from '@patina/supabase';
import { ALL_STUDIO_SURFACES } from '@/lib/document/registry';
import { useSheetSurfaceKey } from '@/lib/help-system/use-sheet-surface-key';
import { documentEvents } from '@/lib/analytics/document-events';
import { DocSheet } from './overlays/doc-sheet';
import { PostSheet, openPost } from './overlays/post-sheet';
import { OrdersLedger } from './orders-ledger';
import { AccountsBook } from './accounts/accounts-book';
import { HoursLedger } from './hours-ledger';
import { FeedbackLedger } from './feedback/feedback-ledger';
import { openFeedbackSheet } from './feedback/feedback-sheet';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { fmtMinutes } from '@/lib/document/time-derivation';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { AccountNameplate } from './account/account-nameplate';
import { openCommandBar, type OpenLedgerContext } from './command-bar';
import { useHydrated } from '@/hooks/use-hydrated';

/** R93/R107 — the six doors, sourced from the Studio Surface Registry: label,
 *  icon, and weight all come from one place now, so a rename or re-icon
 *  there changes the drawer (and ⌘K, and Contents) together. Only display
 *  order and each room's href stay this component's concern — the registry
 *  is deliberately route-agnostic (see its file doc). */
function findSurface(key: string) {
  const surface = ALL_STUDIO_SURFACES.find((s) => s.key === key);
  if (!surface)
    throw new Error(`Studio Drawer: the registry is missing "${key}"`);
  return surface;
}

type LedgerKey =
  | 'library'
  | 'orders'
  | 'accounts'
  | 'people'
  | 'rooms'
  | 'hours';

interface Ledger {
  key: LedgerKey;
  name: string;
  icon: LucideIcon;
  weight: 'room' | 'sheet';
  href?: string;
}

// Room-weight doors need a route; the registry doesn't carry one on purpose.
const DOOR_HREF: Partial<Record<LedgerKey, string>> = {
  library: '/library',
  people: '/people',
  rooms: '/rooms',
};

const LEDGERS: Ledger[] = (
  ['library', 'orders', 'accounts', 'people', 'rooms', 'hours'] as const
).map((key) => {
  const surface = findSurface(key);
  return {
    key,
    name: surface.label,
    icon: surface.icon,
    weight: surface.weight === 'room' ? 'room' : ('sheet' as const),
    href: DOOR_HREF[key],
  };
});

// The Post (F6) shares the registry's canonical name + icon even though the
// bell isn't a door in the row — the two can never drift apart this way.
const THE_POST = findSurface('the-post');

// Feedback isn't a Studio Surface (R93/R95 — it's a reachable sheet, not a
// labelled doorway): it keeps its own small meta for the sheet title/variant,
// exactly as it did before the registry existed.
const FEEDBACK_SHEET = {
  key: 'feedback' as const,
  name: 'Feedback',
  weight: 'sheet' as const,
};

type SheetKey = LedgerKey | typeof FEEDBACK_SHEET.key;

const ROOM_DOORS = LEDGERS.filter((ledger) => ledger.weight === 'room');
const STUDIO_BOOKS = LEDGERS.filter((ledger) => ledger.weight === 'sheet');
const RECENT_BOOK_KEY = 'patina.document.recentStudioBook';

/** A quiet breadcrumb for the current surface; the Desk needs none — the
 *  wordmark is the home affordance. */
function breadcrumbFor(pathname: string | null): string | null {
  if (!pathname || pathname === '/desk') return null;
  if (pathname.startsWith('/library')) return 'Library';
  if (pathname.startsWith('/people')) return 'People';
  if (pathname.startsWith('/rooms') || pathname.startsWith('/room/'))
    return 'Rooms';
  if (pathname.startsWith('/drafting') || pathname.startsWith('/compose'))
    return 'Drafting';
  if (pathname.startsWith('/doc')) return 'Document';
  return null;
}

export function StudioDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const [openLedger, setOpenLedger] = useState<SheetKey | null>(null);
  const [booksOpen, setBooksOpen] = useState(false);
  const [recentBook, setRecentBook] = useState<SheetKey | null>(null);
  // F11 — only a sheet opened from the books menu may restore focus to the
  // books toggle; one opened by ⌘K, the margin rail, the mobile dock or the
  // /desk?book= doorway must not drag focus down into the drawer.
  const [openedFromBooksMenu, setOpenedFromBooksMenu] = useState(false);
  const booksButtonRef = useRef<HTMLButtonElement>(null);
  const booksMenuRef = useRef<HTMLDivElement>(null);
  const firstBookRef = useRef<HTMLButtonElement>(null);
  // Pre-addressing context for whichever sheet opens (Orders: vendor/page;
  // Accounts: receivables page + invoiceId). Each book reads only its own keys.
  const [sheetContext, setSheetContext] = useState<OpenLedgerContext | null>(
    null,
  );
  const openDoor = LEDGERS.find((l) => l.key === openLedger) ?? null;
  const open = openLedger === FEEDBACK_SHEET.key ? FEEDBACK_SHEET : openDoor;
  const { inHandToday } = useDocumentTime();
  // The Post's Record merges the inbox + procurement feeds, so the bell's
  // awareness dot must read both unreads or it would lie about the sheet.
  const { data: unreadInbox = 0 } = useUnreadInboxCount();
  const { data: unreadProcurement = 0 } = useProcurementUnreadCount();
  const { data: unseenFeedback } = useUnseenShipped();
  const unread = unreadInbox + unreadProcurement;
  const hasUnseenFeedback = hydrated && (unseenFeedback?.length ?? 0) > 0;
  const breadcrumb = breadcrumbFor(pathname);
  const holding = (pathname ?? '').startsWith('/doc/');
  const orderedBooks = recentBook
    ? [
        ...STUDIO_BOOKS.filter((book) => book.key === recentBook),
        ...STUDIO_BOOKS.filter((book) => book.key !== recentBook),
      ]
    : STUDIO_BOOKS;

  // help-desk Wave 1 — an open ledger sheet scopes the contextual help panel
  // to its own surface key (sheets never change the pathname); close restores
  // the surface underneath. Non-ledger sheets (feedback) restore too.
  useSheetSurfaceKey(openLedger);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        RECENT_BOOK_KEY,
      ) as SheetKey | null;
      if (saved && STUDIO_BOOKS.some((book) => book.key === saved)) {
        setRecentBook(saved);
      }
    } catch {
      // A blocked storage partition only loses recency; every book remains.
    }
  }, []);

  useEffect(() => {
    if (!booksOpen) return;
    firstBookRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !booksMenuRef.current?.contains(target) &&
        !booksButtonRef.current?.contains(target)
      ) {
        setBooksOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setBooksOpen(false);
      booksButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [booksOpen]);

  const rememberBook = (key: SheetKey) => {
    setRecentBook(key);
    try {
      window.localStorage.setItem(RECENT_BOOK_KEY, key);
    } catch {
      // Keep in-session recency even when persistence is unavailable.
    }
  };

  const openBook = (
    key: SheetKey,
    context: OpenLedgerContext | null = null,
    { fromBooksMenu = false }: { fromBooksMenu?: boolean } = {},
  ) => {
    setBooksOpen(false);
    setSheetContext(context);
    setOpenLedger(key);
    setOpenedFromBooksMenu(fromBooksMenu);
    rememberBook(key);
  };

  /** Walk into a Room: stash the surface we're leaving, then navigate. The
   *  prior document unmounts and puts itself down (timer chains out). A no-op
   *  when we're already in that Room (no redundant push / remount / refetch).
   *  `source` is only passed by the drawer's own buttons (F6/wayfinding) — the
   *  generic open-ledger event below is shared with ⌘K and other surfaces that
   *  don't (yet) carry their own source through the event, so it stays silent
   *  rather than mislabeling their opens as the drawer's. */
  const enterRoom = (href: string, key: string, source?: 'drawer') => {
    if (pathname === href) return;
    if (source) documentEvents.wayfinding.roomEntered({ key, source });
    rememberRoomOrigin(pathname);
    router.push(href);
  };

  // ⌘K and other surfaces open a ledger by name through this event. A
  // room-weight ledger walks in; a sheet-weight ledger opens its sheet.
  // R28/R29: the detail may carry pre-addressing context ({ name, context }).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (
        e as CustomEvent<string | { name: string; context?: OpenLedgerContext }>
      ).detail;
      const name = typeof detail === 'string' ? detail : detail.name;
      const context =
        typeof detail === 'string' ? null : (detail.context ?? null);
      if (name === FEEDBACK_SHEET.key) {
        setBooksOpen(false);
        setSheetContext(context);
        setOpenLedger(FEEDBACK_SHEET.key);
        setOpenedFromBooksMenu(false);
        return;
      }
      const match = LEDGERS.find((l) => l.key === name);
      if (!match) return;
      if (match.weight === 'room') {
        enterRoom(match.href!, match.key);
        return;
      }
      openBook(match.key, context);
    };
    window.addEventListener('document:open-ledger', onOpen);
    return () => window.removeEventListener('document:open-ledger', onOpen);
    // enterRoom closes over pathname/router; re-bind when the surface changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* The unified mobile bar owns the edge until the full drawer can breathe. */}
      <nav
        aria-label="Studio drawer"
        data-tour-anchor="studio-drawer"
        className="doc-elevated fixed inset-x-0 bottom-0 z-40 hidden h-[60px] grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-[22px] min-[1180px]:grid"
      >
        {/* Left — the studio wordmark (home) + a quiet breadcrumb. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/desk"
            className="inline-flex min-h-11 shrink-0 items-center rounded-[3px] font-heading text-[15px] font-medium uppercase tracking-[0.2em] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            Patina
          </Link>
          {breadcrumb && (
            <>
              <span aria-hidden className="text-[var(--border-default)]">
                /
              </span>
              <span className="truncate font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {breadcrumb}
              </span>
            </>
          )}
        </div>

        {/* Center — Rooms stay named; sheets gather behind one doorway. */}
        <div className="flex items-center gap-0.5">
          {ROOM_DOORS.map((ledger) => {
            const Icon = ledger.icon;
            const here =
              (pathname ?? '') === ledger.href ||
              (pathname ?? '').startsWith(`${ledger.href}/`) ||
              (ledger.key === 'rooms' && (pathname ?? '').startsWith('/room/'));
            return (
              <button
                key={ledger.key}
                type="button"
                aria-current={here ? 'page' : undefined}
                onClick={() => {
                  documentEvents.wayfinding.doorOpened({
                    key: ledger.key,
                    weight: 'room',
                    source: 'drawer',
                  });
                  enterRoom(ledger.href!, ledger.key, 'drawer');
                }}
                className={`relative inline-flex min-h-11 items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)] ${
                  here
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Icon
                  className="h-[15px] w-[15px] shrink-0"
                  strokeWidth={1.5}
                  aria-hidden
                />
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

          <div className="relative">
            <button
              ref={booksButtonRef}
              type="button"
              data-studio-books-doorway
              aria-expanded={booksOpen}
              aria-controls="studio-books-menu"
              onClick={() => setBooksOpen((open) => !open)}
              className={`relative inline-flex min-h-11 items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)] ${
                openLedger
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <BookOpenText
                className="h-[15px] w-[15px]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span>Ledgers</span>
              <span
                aria-hidden
                className="font-mono text-[12px] text-[var(--text-muted)]"
              >
                {booksOpen ? '↓' : '↑'}
              </span>
              {openLedger && (
                <span
                  aria-hidden
                  className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-clay)]"
                />
              )}
            </button>

            {booksOpen && (
              <div
                ref={booksMenuRef}
                id="studio-books-menu"
                role="group"
                aria-label="Ledgers"
                className="absolute bottom-[calc(100%+8px)] left-1/2 w-[260px] -translate-x-1/2 overflow-hidden rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)]"
              >
                <div className="border-b border-[var(--border-default)] px-3 py-2">
                  <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    Ledgers · sheets
                  </span>
                </div>
                {orderedBooks.map((book, index) => {
                  const Icon = book.icon;
                  const here = openLedger === book.key;
                  const recent = recentBook === book.key;
                  return (
                    <button
                      ref={index === 0 ? firstBookRef : undefined}
                      key={book.key}
                      type="button"
                      aria-current={here ? 'page' : undefined}
                      onClick={() => {
                        documentEvents.wayfinding.doorOpened({
                          key: book.key,
                          weight: 'sheet',
                          source: 'drawer',
                        });
                        openBook(book.key, null, { fromBooksMenu: true });
                      }}
                      className="flex min-h-11 w-full items-center gap-3 border-b border-[var(--border-default)] px-3 py-2 text-left text-[var(--text-body)] last:border-b-0 hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-clay)]"
                    >
                      <Icon
                        className="h-4 w-4 text-[var(--color-aged-oak)]"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 text-[14px] text-[var(--text-primary)]">
                        {book.name}
                      </span>
                      {recent && (
                        <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                          Recent
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setBooksOpen(false);
                    openFeedbackSheet();
                  }}
                  className="flex min-h-11 w-full items-center gap-3 border-t border-[var(--color-clay)] px-3 py-2 text-left text-[var(--text-body)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-clay)]"
                >
                  <MessageSquareText
                    className="h-4 w-4 text-[var(--color-clay-ink)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="text-[14px] text-[var(--text-primary)]">
                    Leave a note
                  </span>
                  {hasUnseenFeedback && (
                    <span className="ml-auto font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
                      Shipped
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* C-AP-05 — the register gets a printed door, so reaching a
              document-scoped surface at 1280 is two acts and neither is
              recalling a chord. */}
          <button
            type="button"
            onClick={() => openCommandBar()}
            /* The Desk header carries its own "Find anything" tertiary act, so
               on /desk two controls stood in the tree under one accessible
               name. The words on the paper are the ruled ones and do not move;
               the name says which door this is. */
            aria-label="Find anything (⌘K), from the studio drawer"
            className="relative inline-flex min-h-11 items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-[14px] text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)]"
          >
            <Search className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} aria-hidden />
            {/* F03 — at 1280 the drawer's centre and right zones overprint.
                The words go first: below 1440 the door is the glyph and the
                chord, and the accessible name above still carries "Find
                anything (⌘K)". */}
            <span className="hidden min-[1440px]:inline">Find anything</span>
            <span className="rounded-[3px] border border-[var(--border-default)] px-1.5 py-px font-mono text-[12px] text-[var(--text-muted)]">
              ⌘K
            </span>
          </button>
        </div>

        {/* Right — in-hand state, notifications, identity. */}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <span className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-2 py-1.5">
            {holding && inHandToday > 0 ? (
              <>
                <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  In hand today
                </span>
                <span className="font-heading text-[14px] italic text-[var(--color-clay-ink)]">
                  {fmtMinutes(inHandToday)}
                </span>
              </>
            ) : (
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Hands free
              </span>
            )}
          </span>

          {/* F6 — named, not just aria-labelled: a visible DM-mono uppercase
              tracked label matching the drawer's other readouts. D8 holds:
              the unread affordance stays the quiet clay dot, never a count. */}
          <button
            type="button"
            onClick={() => {
              documentEvents.wayfinding.doorOpened({
                key: THE_POST.key,
                weight: THE_POST.weight === 'room' ? 'room' : 'sheet',
                source: 'drawer',
              });
              openPost();
            }}
            aria-label={
              unread > 0
                ? `${THE_POST.label}, ${unread} unread`
                : THE_POST.label
            }
            className="relative inline-flex min-h-11 items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay)]"
          >
            <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <THE_POST.icon
                className="h-4 w-4"
                strokeWidth={1.5}
                aria-hidden
              />
              {unread > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-clay)]"
                />
              )}
            </span>
            <span className="font-mono text-[12px] uppercase tracking-[0.08em]">
              {THE_POST.label}
            </span>
          </button>

          <AccountNameplate />
        </div>
      </nav>

      {/* Sheet-weight ledgers only — room-weight doors (Library, People, Rooms)
          never open here. */}
      <DocSheet
        open={open !== null && open.weight === 'sheet'}
        onClose={() => setOpenLedger(null)}
        title={open?.name ?? ''}
        variant={open?.key === 'feedback' ? 'center' : 'sheet'}
        wide={
          open?.key === 'orders' ||
          open?.key === 'accounts' ||
          open?.key === 'hours'
        }
        // SP-13/F46 — Orders and Accounts render their own dialog-owned
        // DocSheetHead with a working close; DocSheet must not print a second
        // one above it. Hours and Feedback pass no onClose to their heads, so
        // DocSheet's own close is the single copy for those two.
        headOwnedByChild={open?.key === 'orders' || open?.key === 'accounts'}
        // F11 — a books-menu row unmounts the moment it opens a sheet, so the
        // still-mounted books toggle is where focus belongs on close.
        fallbackFocusRef={openedFromBooksMenu ? booksButtonRef : undefined}
      >
        {open?.key === 'orders' && (
          <OrdersLedger
            onClose={() => setOpenLedger(null)}
            initialContext={sheetContext}
          />
        )}
        {open?.key === 'accounts' && (
          <AccountsBook
            onClose={() => setOpenLedger(null)}
            initialContext={sheetContext}
          />
        )}
        {open?.key === 'hours' && <HoursLedger initialContext={sheetContext} />}
        {open?.key === 'feedback' && <FeedbackLedger />}
        {/* All sheet-weight ledgers (orders/accounts/hours) are bound; People
            and Rooms are Rooms (R50/R107), so no generic placeholder branch
            remains. */}
      </DocSheet>

      {/* R82 — the Post: what the bell opens. A Drawer-weight charcoal sheet
          (Letters · the Record), a peer of the ledger sheets. Owns its own open
          state + the `document:open-post` listener (so ⌘K and the mobile bar
          reach it for free), exactly like the Account sheet. */}
      <PostSheet />
    </>
  );
}
