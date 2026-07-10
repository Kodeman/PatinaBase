'use client';

/**
 * Margin note (R94 — the first-touch primitive). A single pencil-idiom note in
 * the page margin: a Playfair-italic line with an en-dash lead, a narrow
 * measure, a tiny × dismiss, and a DM-mono footnote that states the contract in
 * words — "Appears once · Recedes on use". It is NOT a tour, NOT a coachmark
 * sequence, and carries no step counter (R94 forbids all of those). A note
 * shows at most once per person and recedes permanently the first time it is
 * either dismissed (×) OR its named action fires — whichever comes first — after
 * which it never renders again on any surface.
 *
 * Persistence: localStorage `patina:margin-note:<noteKey>`. SSR-safe — the
 * server and the first client paint render nothing (identical hydration), then
 * the note reveals after mount iff it has not been seen, so a dismissed note
 * never flashes. Every transition (shown / dismissed / acted) is reported
 * through the wayfinding emitter so "notes recede on use" is legible in
 * telemetry, not asserted.
 *
 * The named action is described declaratively by the caller: `actionEvents`
 * lists window CustomEvent names that count as use, and `commandBar` wires the
 * ⌘K gesture (the hotkey OR the "Find anything" affordance) as the action — the
 * one canonical "find anything by name" move the Desk note teaches.
 */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { documentEvents } from '@/lib/analytics/document-events';

const STORAGE_PREFIX = 'patina:margin-note:';

function storageKeyFor(noteKey: string): string {
  return `${STORAGE_PREFIX}${noteKey}`;
}

/** True when this note has already been seen (dismissed or acted). Treats the
 *  server + a disabled/blocked store as "seen" so nothing renders where we
 *  cannot honor the once-only contract. */
function hasSeen(noteKey: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(storageKeyFor(noteKey)) !== null;
  } catch {
    return false;
  }
}

/** Retire a note permanently — writes the once-only marker so it never renders
 *  again on any surface. Exported so the Desk Walkthrough can mark the
 *  `desk-first-touch` note seen on tour completion (the tour taught ⌘K, so the
 *  note has nothing left to teach). Best-effort; never throws. */
export function markMarginNoteSeen(noteKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyFor(noteKey), String(Date.now()));
  } catch {
    /* private mode / storage disabled — best-effort; the note simply reappears
       next visit rather than crashing the surface it sits on. */
  }
}

export interface MarginNoteProps {
  /** Stable identity — the localStorage suffix and the telemetry key. */
  noteKey: string;
  /** The note body, without a leading dash (the primitive supplies the lead). */
  children: React.ReactNode;
  /** The DM-mono footnote; defaults to the R94 idiom. */
  caption?: string;
  /** Window CustomEvent names whose firing counts as the note's named action —
   *  the first one recedes the note as 'acted'. */
  actionEvents?: string[];
  /** When true, opening the ⌘K command bar (the hotkey OR the "Find anything"
   *  affordance) is the named action. */
  commandBar?: boolean;
  /** When true the note renders nothing and does NOT mark itself seen — a
   *  transient hold (e.g. while the Desk Walkthrough modal or tour is on
   *  screen). Lifting it re-reveals the note unless it has since been seen. */
  suppressed?: boolean;
  className?: string;
}

export function MarginNote({
  noteKey,
  children,
  caption = 'Appears once · Recedes on use',
  actionEvents,
  commandBar = false,
  suppressed = false,
  className,
}: MarginNoteProps) {
  const [visible, setVisible] = useState(false);
  // 'shown' fires at most once per mount even as `suppressed` toggles.
  const shownRef = useRef(false);

  // Authoritative visibility: while suppressed OR already seen the note stays
  // down (and marks nothing); otherwise it reveals. Re-runs when `suppressed`
  // flips so a lifted hold re-reveals an unseen note. SSR and the first client
  // paint agree (nothing → nothing) because the effect runs after mount.
  useEffect(() => {
    if (suppressed || hasSeen(noteKey)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (!shownRef.current) {
      shownRef.current = true;
      documentEvents.wayfinding.marginNote({ key: noteKey, action: 'shown' });
    }
  }, [noteKey, suppressed]);

  // Once shown, the first named action recedes the note forever. Listeners are
  // only bound while the note is on screen (and not suppressed), so a note that
  // was never shown (or already dismissed) can never fire a spurious 'acted'.
  useEffect(() => {
    if (!visible || suppressed) return;
    const recede = () => {
      markMarginNoteSeen(noteKey);
      setVisible(false);
      documentEvents.wayfinding.marginNote({ key: noteKey, action: 'acted' });
    };
    const cleanups: Array<() => void> = [];
    for (const name of actionEvents ?? []) {
      window.addEventListener(name, recede);
      cleanups.push(() => window.removeEventListener(name, recede));
    }
    if (commandBar) {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') recede();
      };
      // Capture-phase to observe the ⌘K before the command bar swallows it; we
      // never preventDefault, so the bar still opens.
      window.addEventListener('keydown', onKey, { capture: true });
      window.addEventListener('document:open-command-bar', recede);
      cleanups.push(() => {
        window.removeEventListener('keydown', onKey, { capture: true });
        window.removeEventListener('document:open-command-bar', recede);
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, [visible, suppressed, noteKey, commandBar, actionEvents]);

  if (suppressed || !visible) return null;

  const dismiss = () => {
    markMarginNoteSeen(noteKey);
    setVisible(false);
    documentEvents.wayfinding.marginNote({ key: noteKey, action: 'dismissed' });
  };

  return (
    <aside role="note" className={`flex max-w-[34ch] items-start gap-2 ${className ?? ''}`}>
      <p className="min-w-0 flex-1">
        <span className="font-heading text-[15px] italic leading-[1.55] text-[var(--text-body)]">
          <span aria-hidden className="mr-1 not-italic text-[var(--text-muted)]">
            –
          </span>
          {children}
        </span>
        <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.11em] text-[var(--text-faint)]">
          {caption}
        </span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss note"
        className="mt-[2px] shrink-0 rounded-[3px] p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    </aside>
  );
}
