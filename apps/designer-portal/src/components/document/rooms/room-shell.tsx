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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StrataMark } from '@/components/document/strata-mark';
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
  action,
  backTo,
  backLabel,
  children,
}: {
  /** The Room's name, shown small + mono in the head (e.g. "The Library"). */
  title: string;
  /** A quiet count beside the title (e.g. "336 pieces"). */
  count?: string;
  /** The Room's single head action (e.g. the Capture button). */
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

      {/* The thin band that frames a Room: leave · ident · one action. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--doc-ink-border)] bg-[rgba(252,250,246,0.85)] px-4 py-3 backdrop-blur-sm sm:px-6">
        <button
          type="button"
          onClick={leave}
          className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-[4px] border border-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] transition-colors hover:border-[var(--doc-ink-border)] hover:text-[var(--color-mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          <span aria-hidden>←</span> {backLabel ?? originLabel(origin)}
        </button>

        <div className="mx-auto flex items-center gap-2.5">
          <StrataMark state="active" size="sm" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-aged-oak)]">
            {title}
          </span>
          {count && (
            <span className="font-mono text-[10px] tracking-[0.04em] text-[var(--color-aged-oak)] opacity-70">
              · {count}
            </span>
          )}
        </div>

        <div className="ml-auto shrink-0">{action}</div>
      </header>

      {/* The paper itself. Bottom padding clears the fixed Drawer + log strip. */}
      <div className="relative z-10 flex-1 pb-[120px] min-[980px]:pb-[108px]">
        {children}
      </div>

      {/* The poetic put-down on leaving (reduced-motion → immediate navigation). */}
      {leaving && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(28,26,24,0.4)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[rgba(250,247,242,0.7)]">
            Putting {title} down…
          </span>
        </div>
      )}
    </div>
  );
}
