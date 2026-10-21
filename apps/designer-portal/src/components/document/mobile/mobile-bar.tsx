'use client';

/**
 * The phone's single thumb-edge owner. Context sits at the left, the current
 * forward act occupies the centre, and every secondary doorway lives in More.
 * A time-log offer temporarily replaces this bar instead of stacking above it.
 */

import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Search, TimerReset } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useUnreadInboxCount,
  useProcurementUnreadCount,
} from '@patina/supabase';
import {
  ALL_STUDIO_SURFACES,
  PEOPLE_SUB_ROOM_HREF,
  PEOPLE_SUB_ROOM_SURFACES,
  boardsRoutePath,
} from '@/lib/document/registry';
import {
  DOCUMENT_INDEX_LABELS,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { householdDisplayName } from '@/lib/document/act-names';
import { familyLabel } from '@/lib/document/family-label';
import { fmtElapsedQuiet, fmtMinutes } from '@/lib/document/time-derivation';
import { DocumentAction } from '../document-action';
import { publishDockYieldedEdge } from '../lens-band';
import { openPost } from '../overlays/post-sheet';
import { useMobileShell } from './mobile-shell';
import { TesterSlot } from '@/components/tester/tester-slot';

function findSurface(key: string) {
  const surface = ALL_STUDIO_SURFACES.find((s) => s.key === key);
  if (!surface) throw new Error(`Mobile bar: the registry is missing "${key}"`);
  return surface;
}

const THE_POST = findSurface('the-post');

const STRATA = (
  <span aria-hidden className="inline-flex shrink-0 flex-col gap-[2px]">
    <i className="block h-[1.5px] w-[12px] rounded-[1px] bg-[var(--color-clay)]" />
    <i className="block h-[1.5px] w-[9px] rounded-[1px] bg-[var(--color-clay)] opacity-55" />
    <i className="block h-[1.5px] w-[6px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
  </span>
);

function surfaceLabel(pathname: string | null): string {
  if (!pathname || pathname === '/desk') return 'Studio overview';
  if (pathname.startsWith('/library')) return 'Resource library';
  if (pathname.startsWith('/people')) return 'Studio contacts';
  if (pathname.startsWith('/rooms') || pathname.startsWith('/room/'))
    return 'Measured rooms';
  if (pathname.startsWith('/drafting')) return 'Proposal workspace';
  if (pathname.startsWith('/compose')) return 'Compose a piece';
  return 'Studio';
}

/** US-19 D7 / F2-15 — the dock's short place word, where it differs from the
 *  region's name. Every other stop prints its own name. */
const DOCK_PLACE_WORDS: Partial<Record<DocumentIndexKey, string>> = {
  approvals: 'approvals',
};

const MAIL_GROUP_LABEL_ID = 'mobile-more-mail-group';
const PEOPLE_ROOMS_GROUP_LABEL_ID = 'mobile-more-people-rooms-group';
const IN_DOCUMENT_GROUP_LABEL_ID = 'mobile-more-in-document-group';

/** A shelf the spine offers at 1440, as a door the phone can reach: either a
 *  route of its own, or the doorway event the surface already listens on. */
type DocumentDoor =
  | { key: string; label: string; href: string }
  | { key: string; label: string; open: () => void };

// The roster sheet is mounted on the document and listens on the window — the
// same wire the spine's shelf row, the letterhead instrument and the kickoff
// band send on.
function openCallSheet() {
  window.dispatchEvent(
    new CustomEvent('document:open-call-sheet', { detail: { mode: 'sheet' } }),
  );
}

// The register listens on the window too (`openCommandBar`); dispatching keeps
// the whole command bar out of this bar's module graph.
function openRegister() {
  window.dispatchEvent(new CustomEvent('document:open-command-bar'));
}

const MENU_ITEM =
  'flex min-h-11 w-full items-center gap-3 border-b border-[var(--doc-ink-border)] px-3 py-2 text-left text-[var(--text-primary)] last:border-b-0 hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--clay-ink)] disabled:cursor-not-allowed disabled:opacity-50';
/** US-43 — a held row reads muted by colour, never by opacity: `--text-subtle`
 *  is 7.7:1 on More's paper, as its reason beneath it is. */
const MENU_ITEM_HELD = MENU_ITEM.replace('text-[var(--text-primary)]', 'text-[var(--text-subtle)]');

/** OD-11's reserve, and the floor the published height can never go under —
 *  the inset contract the paper was written against. */
const MOBILE_BAR_FLOOR_PX = 72;

export function MobileBar() {
  const pathname = usePathname();
  const {
    activeDoc,
    sheet,
    primaryAction,
    secondaryActions,
    openSpine,
    openTimer,
    openDrawer,
    openMargin,
  } = useMobileShell();
  // US-43 R6 (revises U-Q19 and the US-28 walk-fix filter) — below 600 the
  // dock is the band's Next's one printing; from 600 the band prints it, so
  // the centre leaves it out by CSS display and Next is in the tree once.
  const bandsNext = primaryAction?.regionKey === 'lens-band';
  const { inHandToday, running, paused, elapsedSeconds, offer, offerOwnsEdge } =
    useDocumentTime();
  // Review F5 — when the offer takes the edge this bar is not printed, so the
  // band must print the Next it would otherwise leave to the dock.
  useEffect(() => {
    publishDockYieldedEdge(offerOwnsEdge);
    return () => publishDockYieldedEdge(false);
  }, [offerOwnsEdge]);
  const { data: unreadInbox = 0 } = useUnreadInboxCount();
  const { data: unreadProcurement = 0 } = useProcurementUnreadCount();
  const unread = unreadInbox + unreadProcurement;
  // US-19 D7 — the left zone's household and place word are never clipped.
  const oneVoice = useFeatureFlag('one-voice').value === true;

  const [moreOpen, setMoreOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // A menu row is a button or a link, so the ref is taken by callback.
  const firstMenuItemRef = useRef<HTMLElement | null>(null);
  const setFirstMenuItem = (node: HTMLElement | null) => {
    firstMenuItemRef.current = node;
  };

  const inDocument = pathname?.startsWith('/doc/') && activeDoc !== null;
  const activeSection = activeDoc?.sections.find((s) => s.state === 'active');
  const context = inDocument
    ? (activeSection?.label ?? 'Document')
    : surfaceLabel(pathname);
  // OD-11/A-08: the left zone's second line names the household (not the
  // active section, which `context` above still carries for the studio
  // case); the third line names the current reading stop.
  // US-19 F2-15 (`one-voice`) — a parenthetical is bookkeeping, never printed
  // in the dock: `Elena Marlowe (no-login household)` reads `Elena Marlowe`.
  // FR4 Fix 2 — through `householdDisplayName` and the letterhead's
  // placeholder guard: the seed's `Client User` record reads `the client`.
  const printedName = oneVoice
    ? householdDisplayName(activeDoc?.clientName ?? '').replace(/\s*\([^)]*\)/g, '').trim()
    : '';
  const clientName = oneVoice
    ? printedName && familyLabel(printedName)
    : activeDoc?.clientName;
  // FR6 F6-7 (D14, `one-voice`) — a client-less paper names no household
  // where it printed `the client`: the left prints the place word alone
  // (`At approvals`). A blank name keeps the title, as before.
  const clientless = oneVoice && Boolean(activeDoc?.clientName?.trim()) && !printedName;
  const household = clientless ? '' : clientName || activeDoc?.title || 'Document';
  const readingIndex = activeDoc?.readingIndex ?? null;
  const stopLabel = readingIndex ? DOCUMENT_INDEX_LABELS[readingIndex] : null;
  // D7 — the dock's place word is the short one (`At approvals`); the door's
  // accessible name keeps the region's full name.
  const placeWord =
    oneVoice && readingIndex ? (DOCK_PLACE_WORDS[readingIndex] ?? stopLabel) : stopLabel;

  // F49 — the shelves the spine prints at 1440, as doors a phone can reach.
  // The boards now have a page of their own (B1-L4), so the row that used to
  // be missing here is the fourth door, in the ticket's own order.
  const documentProjectId = inDocument ? (activeDoc?.projectId ?? null) : null;
  // D-B30 — the margin door leads the list, above Plan room. It names the
  // WHOLE margin: W5-R1 widened D-B30's letterhead-only set to everything the
  // sheet lists, so the count is `useMarginSheet`'s, not the retired
  // `useLetterheadMargin`'s (D-B45). It stands whether or not a project is
  // behind the document, unlike the four doors below, which are project-keyed
  // (OD-8).
  //
  // W5-C9 — a door is a way to something. `Margin · 0` opened a sheet that
  // said only "The margin — decisions, messages, and money gather here", and
  // the label churned `Margin · 0` → `Margin · 7` when the query landed,
  // because `page.tsx` publishes 0 while `useMarginItems` is in flight. W5-R1
  // writes the door as `Margin · N`; at N = 0 there is no N to print and
  // nothing behind it, so the door is ABSENT — it appears when the margin
  // does, and never renames itself in front of the reader.
  const marginCount = inDocument ? (activeDoc?.marginCount ?? null) : null;
  // US-19 D7 — acts with a ruled place in More lead it, in their order. The
  // rest keep the shelf's existing place below `Find anything`.
  const visibleSecondary = secondaryActions.filter(
    (action) => action.actionKey !== primaryAction?.actionKey,
  );
  const orderedActions = visibleSecondary.filter((action) => action.order != null);
  const menuSecondaryActions = visibleSecondary.filter(
    (action) => action.order == null,
  );
  // The ordered list carries `Call sheet` itself; one door, never two.
  const callSheetOrdered = orderedActions.some(
    (action) => action.actionKey === 'open-call-sheet',
  );
  const inThisDocument: DocumentDoor[] = [
    ...(marginCount
      ? [{ key: 'margin', label: `Margin · ${marginCount}`, open: openMargin }]
      : []),
    ...(documentProjectId
      ? [
          {
            key: 'planroom',
            label: 'Drawing sets',
            href: `/doc/${documentProjectId}/plans`,
          },
          {
            key: 'specbook',
            label: 'Specification book',
            href: `/doc/${documentProjectId}/spec-book`,
          },
          {
            key: 'boards',
            label: 'Design boards',
            href: boardsRoutePath(documentProjectId),
          },
          ...(callSheetOrdered
            ? []
            : [{ key: 'callsheet', label: 'Project directory', open: openCallSheet }]),
        ]
      : []),
  ];

  useEffect(() => {
    if (!moreOpen) return;
    // F2-5 (`one-voice`) — More scrolls inside the viewport and opens on its
    // first row, whatever it was scrolled to last.
    if (oneVoice && menuRef.current) menuRef.current.scrollTop = 0;
    firstMenuItemRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !moreButtonRef.current?.contains(target)
      ) {
        setMoreOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // F2-8 (`one-voice`) — this Esc is More's alone. The paper puts itself
      // down on a bare Esc (page.tsx, bubbling on the document), and More is
      // a group, not a dialog, so without this the same key that closed More
      // also left the paper for the Desk.
      if (oneVoice) event.stopPropagation();
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };

    // Captured, under `one-voice`, so it runs before the paper's listener.
    const capture = oneVoice;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, capture);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, capture);
    };
  }, [moreOpen, oneVoice]);

  // D-B54 ruled this line STAYS on the bare `offer`: a chain-out is a change
  // of subject whether or not it takes the edge, and an open More menu over
  // it is stale either way. Only the EDGE question reads `offerOwnsEdge`.
  useEffect(() => {
    if (sheet || offer) setMoreOpen(false);
  }, [offer, sheet]);

  // D-B47 — the paper's bottom inset is the bar's own box, not a number that
  // hopes to match it. The bar measured 93px at 390 against a 72px inset (the
  // three-line left zone plus an act whose label wraps by ruling), so the last
  // ~21px of the paper and a landed foot control sat under it. Published on
  // `html` because `--doc-shell-bottom-inset` lives on the shell and
  // `scroll-padding-bottom` is on `html`, which cannot read it. A zero height
  // is the bar not laid out at all — `min-[1180px]:hidden`, or the log offer
  // owning the edge instead — and then the property comes off, so the desktop
  // inset stays exactly what it was.
  const barRendered = !offerOwnsEdge;
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty('--doc-mobile-bar-height');
    const bar = barRef.current;
    if (!bar) {
      clear();
      return clear;
    }
    const publish = () => {
      const height = bar.getBoundingClientRect().height;
      if (height <= 0) {
        clear();
        return;
      }
      root.style.setProperty(
        '--doc-mobile-bar-height',
        `${Math.max(MOBILE_BAR_FLOOR_PX, Math.round(height))}px`,
      );
    };
    publish();
    if (typeof ResizeObserver === 'undefined') return clear;
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [barRendered]);

  // D-B54 — the log offer becomes the edge owner while it is ACTIONABLE, and
  // actionability is the provider's one boolean, not a bare `offer` read. The
  // strip refuses a cross-project offer; a bar that yielded to one anyway left
  // the phone with no bottom chrome at all.
  if (offerOwnsEdge) return null;

  const closeThen = (action: () => void) => {
    // Hand modal focus restoration a stable, still-rendered doorway before the
    // focused menu row unmounts. The opened sheet can now return to More.
    moreButtonRef.current?.focus({ preventScroll: true });
    setMoreOpen(false);
    action();
  };

  const primaryShared = primaryAction
    ? {
        actionKey: primaryAction.actionKey,
        surfaceKey: primaryAction.surfaceKey,
        regionKey: primaryAction.regionKey,
        // US-46 R203 — the band's Next prints as the band's own charcoal
        // plate, full width in the centre; any other centre act stays scored.
        variant: bandsNext ? ('plate' as const) : ('primary' as const),
        presentation: 'mobile_dock' as const,
        disabled: primaryAction.disabled,
        loading: primaryAction.loading,
        loadingLabel: primaryAction.loading
          ? `${primaryAction.label}…`
          : undefined,
        // The act is shortened at its source, never clipped here: the label
        // wraps inside the 44px control rather than losing its last word.
        className:
          'min-h-11 w-full min-w-0 [&_.da-label]:whitespace-normal [&_.da-label]:text-center [&_.da-label]:leading-[15px]',
        children: primaryAction.label,
      }
    : null;

  // OD-11: three lines in the left zone (overline, household, stop) need
  // more than the old two-line 64px reserve — bumped to 72px.
  return (
    <nav
      ref={barRef}
      aria-label="Document bar"
      data-testid="mobile-bar"
      data-mobile-edge-owner="document-bar"
      data-reading-index={readingIndex ?? ''}
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-[72px] items-center gap-2 border-t border-[var(--hairline-strong)] bg-[var(--paper-doc)] px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 min-[1180px]:hidden"
    >
      {/* SQ-856 — the TESTER mark's place, empty for everyone else. */}
      <TesterSlot kind="bar" />
      {inDocument ? (
        <button
          type="button"
          onClick={openSpine}
          // A stable hook for the door, because its accessible NAME is not
          // stable by design: OD-11/A-01 puts the current stop in it, so the
          // name changes on every crossing. A spec that reached the door by
          // name raced the scroll — chromium resolved it and then reported the
          // element detached, webkit never found it at all.
          data-sections-door=""
          aria-label={
            stopLabel ? `Open project contents, at ${stopLabel}` : 'Open project contents'
          }
          className="flex min-h-11 min-w-0 flex-[1_1_0] items-center gap-2 rounded-[4px] px-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]"
        >
          {STRATA}
          <span className="min-w-0">
            <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--text-subtle)]">
              Project file sections
            </span>
            {household && (
              <span
                className="block break-words font-heading text-[14px] font-medium text-[var(--text-primary)]"
              >
                {household}
              </span>
            )}
            {/* PRE-PRINTED and swapped by `visibility`, exactly as A-01 ruled
                — never mounted and unmounted. A line that comes and goes as
                the reading index arrives re-lays the bar under the reader's
                thumb and churns the door's subtree on every crossing. The
                72px reserve above is already sized for three lines.

                SQ-856 (chrome-p6): the bar is the dock's --paper-doc stock
                at every width (US-46 R203), so its accent text is
                `--color-clay-ink` (AA on paper). */}
            <span
              aria-hidden={stopLabel ? undefined : true}
              // Below 600 the stop holds to one line: at 320 a wrap broke the
              // last word into an orphan line. The door's name keeps it whole.
              className={`block break-words font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)] max-[599px]:truncate ${
                stopLabel ? '' : 'invisible'
              }`}
            >
              Section: {placeWord ?? '\u00a0'}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-[1_1_0] items-center gap-2 px-1.5">
          {STRATA}
          <span className="min-w-0">
            <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--text-subtle)]">
              Studio section
            </span>
            {/* F8 — the dock wraps, never truncates ("Studio overview"). */}
            <span className="block break-words font-heading text-[14px] font-medium text-[var(--text-primary)]">
              {context}
            </span>
          </span>
        </div>
      )}

      {/* SQ-856 — with no act the slot collapses, so the section label keeps
          the width the Tester mark and the worded More now take. From 600
          the band's Next is the band's, so its slot collapses the same way. */}
      <div
        className={`flex min-w-0 flex-[1.15_1_0] items-center justify-center empty:hidden ${
          bandsNext ? 'min-[600px]:hidden' : ''
        }`}
      >
        {primaryAction && primaryShared ? (
          primaryAction.target.kind === 'href' ? (
            <DocumentAction
              {...primaryShared}
              href={primaryAction.target.href}
              onClick={primaryAction.onSelected}
            />
          ) : (
            <DocumentAction
              {...primaryShared}
              onClick={() => {
                primaryAction.onSelected?.();
                primaryAction.target.kind === 'press' && primaryAction.target.onPress();
              }}
            />
          )
        ) : null}
      </div>

      <button
        ref={moreButtonRef}
        type="button"
        aria-label="More studio actions"
        aria-expanded={moreOpen}
        aria-controls="mobile-studio-menu"
        onClick={() => setMoreOpen((open) => !open)}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[2px] px-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]"
      >
        <Ellipsis className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        <span className="font-mono text-[12px] uppercase tracking-[0.08em]">
          More
        </span>
      </button>

      {moreOpen && (
        <div
          ref={menuRef}
          id="mobile-studio-menu"
          role="group"
          aria-label="More studio actions"
          data-mobile-more-scroll={oneVoice ? '' : undefined}
          // F2-5 (`one-voice`) — More is a scroll container no taller than the
          // viewport above the dock (less its 8px gap and an 8px top margin):
          // at 949px with `overflow: hidden` its first rows stood above the
          // screen and could not be reached.
          className={`absolute bottom-[calc(100%+8px)] right-3 w-[min(19rem,calc(100vw-1.5rem))] popover ledgers-pop ${
            oneVoice
              ? 'max-h-[calc(100dvh_-_var(--doc-mobile-bar-height,72px)_-_16px)] overflow-y-auto overscroll-contain'
              : 'overflow-hidden'
          }`}
        >
          {orderedActions.map((action, index) => {
            const takeRef = index === 0 ? setFirstMenuItem : undefined;
            if (action.held) {
              // D3 — held, not hidden: it stays in the tab order with its
              // reason beneath and the repair beside it.
              const reasonId = `mobile-held-reason-${action.actionKey}`;
              return (
                <div key={action.actionKey} data-mobile-held-act={action.actionKey}>
                  <button
                    ref={takeRef}
                    type="button"
                    data-mobile-secondary-action
                    data-mobile-secondary-key={action.actionKey}
                    aria-disabled="true"
                    aria-describedby={reasonId}
                    className={`${MENU_ITEM_HELD} cursor-not-allowed !border-b-0`}
                  >
                    <span className="min-w-0 flex-1 text-[14px]">{action.label}</span>
                  </button>
                  <p
                    id={reasonId}
                    className="px-3 pb-1 text-[12px] text-[var(--text-subtle)]"
                  >
                    {action.held.reason}
                  </p>
                  {action.held.repair && (
                    <button
                      type="button"
                      data-mobile-held-repair={action.actionKey}
                      onClick={() => closeThen(action.held!.repair!.onPress)}
                      className={MENU_ITEM}
                    >
                      <span
                        aria-hidden
                        className="inline-flex w-4 items-center justify-center font-mono text-[14px] text-[var(--color-clay-ink)]"
                      >
                        →
                      </span>
                      <span className="min-w-0 flex-1 text-[14px]">
                        {action.held.repair.label}
                      </span>
                    </button>
                  )}
                </div>
              );
            }
            return (
              <button
                key={action.actionKey}
                ref={takeRef}
                type="button"
                data-mobile-secondary-action
                data-mobile-secondary-key={action.actionKey}
                disabled={action.disabled || action.loading}
                aria-busy={action.loading || undefined}
                onClick={() => closeThen(action.onPress)}
                className={MENU_ITEM}
              >
                <span className="min-w-0 flex-1 text-[14px]">
                  {action.label}
                  {action.loading ? '…' : ''}
                </span>
              </button>
            );
          })}
          {inThisDocument.length > 0 && (
            <div role="group" aria-labelledby={IN_DOCUMENT_GROUP_LABEL_ID}>
              <div className="border-b border-[var(--doc-ink-border)] px-3 pt-2">
                <span
                  id={IN_DOCUMENT_GROUP_LABEL_ID}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-subtle)]"
                >
                  In this document
                </span>
              </div>
              {inThisDocument.map((door, index) => {
                const inner = (
                  <>
                    <span
                      aria-hidden
                      className="inline-flex w-4 items-center justify-center font-mono text-[14px] text-[var(--color-clay-ink)]"
                    >
                      →
                    </span>
                    <span className="min-w-0 flex-1 text-[14px]">
                      {door.label}
                    </span>
                  </>
                );
                const takeRef =
                  index === 0 && orderedActions.length === 0
                    ? setFirstMenuItem
                    : undefined;
                return 'href' in door ? (
                  <Link
                    key={door.key}
                    ref={takeRef}
                    href={door.href}
                    data-mobile-document-door={door.key}
                    onClick={() => setMoreOpen(false)}
                    className={MENU_ITEM}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={door.key}
                    ref={takeRef}
                    type="button"
                    data-mobile-document-door={door.key}
                    onClick={() => closeThen(door.open)}
                    className={MENU_ITEM}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          )}
          <button
            ref={
              inThisDocument.length === 0 && orderedActions.length === 0
                ? setFirstMenuItem
                : undefined
            }
            type="button"
            data-mobile-find-anything
            onClick={() => closeThen(openRegister)}
            className={MENU_ITEM}
          >
            <Search
              className="h-4 w-4 text-[var(--color-clay-ink)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-[14px]">Find anything</span>
            <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-subtle)]">
              ⌘K
            </span>
          </button>
          {menuSecondaryActions.map((action) => (
            <button
              key={action.actionKey}
              type="button"
              data-mobile-secondary-action
              data-mobile-secondary-key={action.actionKey}
              disabled={action.disabled || action.loading}
              aria-busy={action.loading || undefined}
              onClick={() => closeThen(action.onPress)}
              className={MENU_ITEM}
            >
              <span
                aria-hidden
                className="inline-flex w-4 items-center justify-center font-mono text-[14px] text-[var(--color-clay-ink)]"
              >
                ↗
              </span>
              <span className="min-w-0 flex-1 text-[14px]">
                {action.label}
                {action.loading ? '…' : ''}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => closeThen(openTimer)}
            className={MENU_ITEM}
          >
            <TimerReset
              className="h-4 w-4 text-[var(--color-clay-ink)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px]">Active session time</span>
              <span className="block font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                {fmtElapsedQuiet(elapsedSeconds)} · review or adjust
              </span>
            </span>
          </button>
          {/* US-28 (Kody, 2026-10-13) — the three rooms that left Studio
              contacts' index, worded, each at its own `?view=` address. */}
          <div role="group" aria-labelledby={PEOPLE_ROOMS_GROUP_LABEL_ID}>
            <div className="border-b border-[var(--doc-ink-border)] px-3 pt-2">
              <span
                id={PEOPLE_ROOMS_GROUP_LABEL_ID}
                className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-subtle)]"
              >
                From Studio contacts
              </span>
            </div>
            {PEOPLE_SUB_ROOM_SURFACES.map((room) => (
              <Link
                key={room.key}
                href={PEOPLE_SUB_ROOM_HREF[room.key]}
                data-mobile-people-room={room.key}
                onClick={() => setMoreOpen(false)}
                className={MENU_ITEM}
              >
                <span
                  aria-hidden
                  className="inline-flex w-4 items-center justify-center font-mono text-[14px] text-[var(--color-clay-ink)]"
                >
                  →
                </span>
                <span className="min-w-0 flex-1 text-[14px]">{room.label}</span>
              </Link>
            ))}
          </div>
          {/* SP-11/F83 — a connecting group label so a first-time reader can
              infer The Post is kin to the letterhead's "Message {Family}" act,
              without merging the two doors or renaming The Post itself. The
              group closes around The Post alone: the rows below it (Ledgers,
              Leave a note) are not mail. */}
          <div role="group" aria-labelledby={MAIL_GROUP_LABEL_ID}>
            <div className="border-b border-[var(--doc-ink-border)] px-3 pt-2">
              <span
                id={MAIL_GROUP_LABEL_ID}
                className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-subtle)]"
              >
                Mail &amp; messages
              </span>
            </div>
            <button
              type="button"
              onClick={() => closeThen(openPost)}
              className={MENU_ITEM}
            >
              <THE_POST.icon
                className="h-4 w-4 text-[var(--color-clay-ink)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-[14px]">
                {THE_POST.label}
              </span>
              {/* SP-15/F47 — state-only, matching the drawer's unlabelled dot;
                  C4 forbids a badge/count here. */}
              {unread > 0 && (
                <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
                  New
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => closeThen(openDrawer)}
            className={MENU_ITEM}
          >
            <span
              aria-hidden
              className="inline-flex w-4 items-center justify-center gap-[2px]"
            >
              <i className="h-4 w-[2px] rounded-[1px] bg-[var(--color-clay)]" />
              <i className="h-4 w-[2px] rounded-[1px] bg-[var(--color-dusty-blue)]" />
              <i className="h-4 w-[2px] rounded-[1px] bg-[var(--color-sage)]" />
            </span>
            <span className="text-[14px]">Ledgers</span>
          </button>
        </div>
      )}
    </nav>
  );
}
