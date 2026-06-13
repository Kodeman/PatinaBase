'use client';

/**
 * RoomSheet — a PAPER sheet that slides up over a Room (R39/D14). Distinct from
 * the charcoal ledger DocSheet: inside a Room the sheet is a document part
 * (capture, deep analysis), so it wears paper, not charcoal. Same minimal
 * dialog semantics as DocSheet — Esc, backdrop dismiss, focus in/restore, zero
 * shadows (D4). The Room beneath never unmounts (D1).
 */

import { useEffect, useRef } from 'react';

export function RoomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus capture/restore — keyed on `open` ALONE, so a new `onClose` identity
  // mid-open (the caller re-renders with an inline arrow) doesn't bounce focus
  // out to the opener and back into the panel.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Esc closes — re-registers when `onClose` changes identity.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55]">
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(28,26,24,0.5)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[16px] border-t border-[var(--doc-ink-border)] bg-[var(--doc-paper)] outline-none motion-safe:animate-[doc-sheet-up_300ms_var(--ease-editorial)]"
      >
        <div
          aria-hidden
          className="mx-auto mb-1 mt-2.5 h-[4px] w-[38px] rounded-full bg-[var(--color-pearl)]"
        />
        <div className="mx-auto max-w-[920px] px-6 pb-8 pt-2 sm:px-9">{children}</div>
      </div>
    </div>
  );
}
