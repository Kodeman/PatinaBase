'use client';

/**
 * SQ-778 N2 — the current assignment's hand-off on the project file. It shows
 * in both states: unread with "Mark read", read without it, and it stays until
 * the job is handed on again. It is not a margin note, so nothing makes it
 * recede. The Day Sheet's "Read the note" opens the job at `#hand-off`, and
 * the note scrolls into view and takes focus.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { HANDOFF_NOTE_ANCHOR } from '@/lib/document/desk-scope';

export function HandoffNote({
  read,
  pending = false,
  failed = false,
  onMarkRead,
  children,
}: {
  read: boolean;
  pending?: boolean;
  /** SQ-777 F2 — the last Mark read failed; said here, never in a toast. */
  failed?: boolean;
  onMarkRead: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.location.hash !== `#${HANDOFF_NOTE_ANCHOR}`) return;
    ref.current?.scrollIntoView?.({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={ref}
      id={HANDOFF_NOTE_ANCHOR}
      tabIndex={-1}
      aria-labelledby="hand-off-label"
      data-handoff-note={read ? 'read' : 'unread'}
      className="mt-[var(--doc-region-gap)] border-l-2 border-[var(--color-dusty-blue)] px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
    >
      <p id="hand-off-label" className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Hand-off
      </p>
      <p className="mt-1 doc-type-body text-[var(--text-primary)] [overflow-wrap:anywhere]">{children}</p>
      {!read && (
        <button
          type="button"
          onClick={onMarkRead}
          disabled={pending}
          className="mt-2 min-h-11 font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--text-primary)] underline underline-offset-4 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
        >
          Mark read
        </button>
      )}
      {!read && failed && (
        <p role="alert" className="mt-1 doc-type-body text-[var(--text-primary)]">
          Couldn’t mark it read. Try again.
        </p>
      )}
    </section>
  );
}
