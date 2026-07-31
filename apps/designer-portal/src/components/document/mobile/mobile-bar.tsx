'use client';

/**
 * The phone's single thumb-edge owner. Context sits at the left, the current
 * forward act occupies the centre, and every secondary doorway lives in More.
 * A time-log offer temporarily replaces this bar instead of stacking above it.
 */

import { useEffect, useRef, useState } from 'react';
import { Ellipsis, MessageSquareText, TimerReset } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  useUnreadInboxCount,
  useProcurementUnreadCount,
  useUnseenShipped,
} from '@patina/supabase';
import { ALL_STUDIO_SURFACES } from '@/lib/document/registry';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { fmtElapsedQuiet, fmtMinutes } from '@/lib/document/time-derivation';
import { DocumentAction } from '../document-action';
import { openFeedbackSheet } from '../feedback/feedback-sheet';
import { openPost } from '../overlays/post-sheet';
import { useMobileShell } from './mobile-shell';
import { useHydrated } from '@/hooks/use-hydrated';

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
  if (!pathname || pathname === '/desk') return 'The Desk';
  if (pathname.startsWith('/library')) return 'The Library';
  if (pathname.startsWith('/people')) return 'The People Room';
  if (pathname.startsWith('/rooms') || pathname.startsWith('/room/'))
    return 'The Rooms';
  if (pathname.startsWith('/drafting')) return 'Drafting';
  if (pathname.startsWith('/compose')) return 'Composing';
  return 'The Studio';
}

const MENU_ITEM =
  'flex min-h-11 w-full items-center gap-3 border-b border-[rgba(250,247,242,0.1)] px-3 py-2 text-left text-[var(--color-pearl)] last:border-b-0 hover:bg-[rgba(250,247,242,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-clay)]';

export function MobileBar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { activeDoc, sheet, primaryAction, openSpine, openTimer, openDrawer } =
    useMobileShell();
  const { inHandToday, running, paused, elapsedSeconds, offer } =
    useDocumentTime();
  const { data: unreadInbox = 0 } = useUnreadInboxCount();
  const { data: unreadProcurement = 0 } = useProcurementUnreadCount();
  const { data: unseenFeedback } = useUnseenShipped();
  const unread = unreadInbox + unreadProcurement;
  const hasUnseenFeedback = hydrated && (unseenFeedback?.length ?? 0) > 0;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  const inDocument = pathname?.startsWith('/doc/') && activeDoc !== null;
  const activeSection = activeDoc?.sections.find((s) => s.state === 'active');
  const context = inDocument
    ? (activeSection?.label ?? 'Document')
    : surfaceLabel(pathname);

  useEffect(() => {
    if (!moreOpen) return;
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
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (sheet || offer) setMoreOpen(false);
  }, [offer, sheet]);

  // The log offer becomes the edge owner while it is actionable.
  if (offer) return null;

  const closeThen = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  const primaryShared = primaryAction
    ? {
        actionKey: primaryAction.actionKey,
        surfaceKey: primaryAction.surfaceKey,
        regionKey: primaryAction.regionKey,
        variant: 'primary' as const,
        presentation: 'mobile_dock' as const,
        disabled: primaryAction.disabled,
        loading: primaryAction.loading,
        loadingLabel: primaryAction.loading
          ? `${primaryAction.label}…`
          : undefined,
        className:
          'min-h-11 w-full min-w-0 !text-[var(--color-off-white)] [&_.da-label]:max-w-[9rem] [&_.da-label]:truncate',
        children: primaryAction.label,
      }
    : null;

  return (
    <nav
      aria-label="Document bar"
      data-testid="mobile-bar"
      data-mobile-edge-owner="document-bar"
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-[64px] items-center gap-2 border-t border-[rgba(250,247,242,0.16)] bg-[var(--color-charcoal)] px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 min-[1180px]:hidden"
    >
      {inDocument ? (
        <button
          type="button"
          onClick={openSpine}
          aria-label={`Open sections, current section ${context}`}
          className="flex min-h-11 min-w-0 flex-[1_1_0] items-center gap-2 rounded-[4px] px-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          {STRATA}
          <span className="min-w-0">
            <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.58)]">
              In this document
            </span>
            <span className="block truncate font-heading text-[14px] font-medium text-[rgba(250,247,242,0.9)]">
              {context}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-[1_1_0] items-center gap-2 px-1.5">
          {STRATA}
          <span className="min-w-0">
            <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.58)]">
              In the studio
            </span>
            <span className="block truncate font-heading text-[14px] font-medium text-[rgba(250,247,242,0.9)]">
              {context}
            </span>
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-[1.15_1_0] items-center justify-center">
        {primaryAction && primaryShared ? (
          primaryAction.target.kind === 'href' ? (
            <DocumentAction
              {...primaryShared}
              href={primaryAction.target.href}
            />
          ) : (
            <DocumentAction
              {...primaryShared}
              onClick={primaryAction.target.onPress}
            />
          )
        ) : (
          <span className="min-w-0 text-center">
            <span className="block font-mono text-[12px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.58)]">
              {running && !paused ? 'In hand' : 'Today'}
            </span>
            <span className="block truncate font-heading text-[14px] italic text-[var(--color-clay)]">
              {running || paused
                ? fmtElapsedQuiet(elapsedSeconds)
                : inHandToday > 0
                  ? fmtMinutes(inHandToday)
                  : 'Hands free'}
            </span>
          </span>
        )}
      </div>

      <button
        ref={moreButtonRef}
        type="button"
        aria-label="More studio actions"
        aria-expanded={moreOpen}
        aria-controls="mobile-studio-menu"
        onClick={() => setMoreOpen((open) => !open)}
        className="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-[4px] text-[rgba(250,247,242,0.76)] hover:text-[var(--color-pearl)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
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
          className="absolute bottom-[calc(100%+8px)] right-3 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-[6px] border border-[rgba(250,247,242,0.2)] bg-[var(--color-charcoal)]"
        >
          <button
            ref={firstMenuItemRef}
            type="button"
            onClick={() => closeThen(openTimer)}
            className={MENU_ITEM}
          >
            <TimerReset
              className="h-4 w-4 text-[var(--color-clay)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px]">Time in hand</span>
              <span className="block font-mono text-[12px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.58)]">
                {fmtElapsedQuiet(elapsedSeconds)} · review or adjust
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => closeThen(openPost)}
            className={MENU_ITEM}
          >
            <THE_POST.icon
              className="h-4 w-4 text-[var(--color-clay)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-[14px]">{THE_POST.label}</span>
            {unread > 0 && (
              <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--color-clay)]">
                {unread} new
              </span>
            )}
          </button>
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
            <span className="text-[14px]">Studio books</span>
          </button>
          <button
            type="button"
            onClick={() => closeThen(openFeedbackSheet)}
            className={MENU_ITEM}
          >
            <MessageSquareText
              className="h-4 w-4 text-[var(--color-clay)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="text-[14px]">Leave a note</span>
            {hasUnseenFeedback && (
              <span className="ml-auto font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--color-clay)]">
                Shipped
              </span>
            )}
          </button>
        </div>
      )}
    </nav>
  );
}
