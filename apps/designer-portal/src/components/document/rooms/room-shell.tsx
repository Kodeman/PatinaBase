'use client';

/**
 * RoomShell — the reusable Rooms physics (R39 / D14). A Room is a full-screen
 * paper workplace you walk INTO (not a Sheet you pull). This shell carries the
 * physics once so the second Room is nearly free:
 *
 *  · full-bleed paper (D12) with the document's paper grain; zero shadows (D4).
 *  · the Drawer (D8), the LogStrip, and ⌘K persist — they live in the
 *    (document) layout, above this shell; a Room route mounts inside it.
 *  · ENTERING a Room puts the held document down: navigating here unmounts
 *    /doc/[id], whose useHoldDocument cleanup chains the timer out through the
 *    log offer (R39 reuse #5). The Room itself holds nothing (studio-wide).
 *  · LEAVING returns you to wherever you were — the stashed origin (room-origin),
 *    re-mounting the prior document (which picks the timer back up).
 *  · reduced-motion safe: the enter raise and the "putting down" veil both fall
 *    back to a plain fade / immediate navigation.
 *
 * Look/feel authority: patina-library-room-prototype.html (ported as intent).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentAction } from '@/components/document/document-action';
import { suppressNextArrival } from '@/lib/arrival/nav';
import {
  clearRoomOrigin,
  originLabel,
  readRoomOrigin,
} from '@/lib/document/room-origin';

const PAPER_GRAIN =
  'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,115,85,0.01) 3px, rgba(139,115,85,0.01) 4px)';

export function RoomShell({
  title,
  count,
  countAtEveryWidth = false,
  action,
  actionAtEveryWidth = false,
  topLevel = false,
  heading,
  measure = 'mx-auto max-w-[976px] px-4 sm:px-6',
  backTo,
  backLabel,
  children,
}: {
  /** The Room's name: the Header line's `.t-d2` heading (e.g. "Resource
   *  library"), and the words on the put-down veil. */
  title: string;
  /** A richer heading in place of the plain title (Drafting's eyebrow and
   *  proposal title); it must carry the page's one h1. `null` prints no
   *  title: the page's own body carries the h1 (a product record). */
  heading?: ReactNode;
  /** The Header line's container classes: the Room's own content column, so
   *  the title sits on the same edge as the page below it. */
  measure?: string;
  /** A top-level Room, reached from the dock (Measured rooms, the Library,
   *  Studio contacts), has no back act (uplift.md (b)6). Esc still leaves. */
  topLevel?: boolean;
  /** The acts show at every width. By default they show from 1180 px, where
   *  the Room's mobile primary act does not already carry them. */
  actionAtEveryWidth?: boolean;
  /** A quiet count beside the title (e.g. "336 pieces"). */
  count?: string;
  /**
   * CR7-1 — PRINT THE COUNT AT EVERY WIDTH.
   *
   * The count is `hidden … sm:inline` by default, so below Tailwind's 640px it
   * computes to `display:none`. That is right for a Room whose count is decor;
   * it is wrong for the People Room, whose head fact SPEC §5.1 #1 fixes as the
   * heading AND, beside it, "N people · N firms" — the one number the
   * `people_directory` v4 rebuild exists to make honest, read on a job site.
   * Opt in rather than dropping `hidden` for all nine Rooms; the head row then
   * wraps instead of widening, so a narrow screen never scrolls sideways.
   */
  countAtEveryWidth?: boolean;
  /** The Room's acts, at the right of the Header line. */
  action?: React.ReactNode;
  /** A nested Room (one reached FROM another Room, e.g. Compose from the
   *  Library) overrides the stashed origin so leaving returns to its parent —
   *  the single-slot origin holds the surface BEFORE the parent Room. When set,
   *  leaving navigates here and does NOT clear the origin (the parent still uses
   *  it). */
  backTo?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // sessionStorage is client-only; default to the Desk for the first paint so
  // SSR and hydration agree, then resolve the real origin after mount.
  const [origin, setOrigin] = useState('/desk');
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    setOrigin(readRoomOrigin());
  }, []);

  // Cancel a pending put-down if the Room unmounts first (browser Back, a
  // redirect) — otherwise the stale router.push fires after we've navigated.
  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  const leave = useCallback(() => {
    setLeaving((already) => {
      if (already) return already;
      // A nested Room returns to its parent (backTo) and leaves the stashed
      // origin intact; a top-level Room returns to — and clears — the origin.
      const dest = backTo ?? readRoomOrigin();
      const go = () => {
        if (!backTo) clearRoomOrigin();
        // US-14 — back onto the paper the Room was opened from: a return, not an arrival.
        if (dest.startsWith('/doc/')) suppressNextArrival(dest);
        router.push(dest);
      };
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        go();
        return true; // navigate immediately; no veil — keep the guard latched
      }
      // Hold the "putting down" veil briefly, then return to origin.
      leaveTimer.current = window.setTimeout(go, 380);
      return true;
    });
  }, [router, backTo]);

  // Esc leaves the Room — but only after deeper overlays (the log strip and any
  // open sheet stop the event in the capture / document phase first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leave]);

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--doc-paper)] motion-safe:animate-[doc-raise_300ms_var(--ease-editorial)] motion-reduce:animate-[doc-fade_200ms_ease-out]">
      {/* Paper grain at the threshold of perception (matches the open document). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: PAPER_GRAIN }}
      />

      {/* The house Header line (US-28 walk-fix; uplift.md (b)6): one row on
          --paper at the Room's own measure, the back act when nested, the
          `.t-d2` title, the acts at the right, then the double rule. It wraps,
          never truncates. The S1 classes (`.hline`, `.rule-strong`); the old
          white band (leave · ornament · mono title) is retired. */}
      <div className={`relative z-10 w-full ${measure}`}>
        <header className="hline" data-room-header-line>
          <div className="hline-l">
            {/* The way out is a word, not a box (I107): a tertiary act. A
                top-level Room, reached from the dock, carries none; Esc still
                leaves. */}
            {!topLevel && (
              <DocumentAction
                actionKey="room-leave"
                surfaceKey="room"
                regionKey="room-header-line"
                variant="tertiary"
                leading="←"
                wrap
                onClick={leave}
              >
                {backLabel ?? originLabel(origin)}
              </DocumentAction>
            )}
            {/* The Room's name is the page's ONE heading (QA-8). */}
            {heading !== undefined ? (
              heading
            ) : (
              <h1 className="t-d2 m-0 text-[var(--text-primary)]">{title}</h1>
            )}
            {count && (
              <span
                data-room-count
                className={`t-meta text-[var(--text-muted)] ${
                  countAtEveryWidth ? 'inline' : 'hidden sm:inline'
                }`}
              >
                {count}
              </span>
            )}
          </div>
          {action && (
            <div
              className={actionAtEveryWidth ? 'hline-r' : 'hline-r room-acts-wide'}
            >
              {action}
            </div>
          )}
        </header>
        <div className="rule-strong" role="presentation" />
      </div>

      {/* The paper itself. Bottom padding clears the fixed Drawer + log strip. */}
      <div data-spotlight-frame className="relative z-10 flex-1 pb-[96px] min-[1180px]:pb-[84px]">
        {children}
      </div>

      {/* The poetic put-down on leaving (reduced-motion → immediate navigation). */}
      {/* CR11-10: the veil is paper. It was a second live region on every Room
          that carries its own announcer, and the navigation that follows it is
          the announcement. */}
      {leaving && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(28,26,24,0.4)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[rgba(250,247,242,0.7)]">
            Putting {title} down…
          </span>
        </div>
      )}
    </div>
  );
}
