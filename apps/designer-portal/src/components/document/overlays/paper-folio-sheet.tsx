'use client';

/**
 * PaperFolioSheet — a centered PAPER sheet that can stack ABOVE a charcoal
 * ledger DocSheet (R74: the Invoice folio opens from Accounts-book rows while
 * the book stays mounted beneath — sheets never unmount the surface below,
 * D1). Three deliberate differences from DocPaperSheet:
 *
 *  1. z-[60] — above DocSheet (z-50) and RoomSheet (z-55).
 *  2. Esc is consumed in the CAPTURE phase on window (the CommandBar pattern)
 *     so the ledger sheet underneath doesn't also close on the same keypress
 *     (DocSheet listens bubble-phase on document).
 *  3. Rendered through a portal onto <body>, so the folio's print stylesheet
 *     can hide every sibling with one selector (R74 Print = the folio itself).
 *
 * Same minimal dialog semantics otherwise: backdrop dismiss, focus in on
 * open / restored on close, zero shadows (D4).
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function PaperFolioSheet({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The composer wants a little more column than the folio. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus capture/restore — keyed on `open` alone (the RoomSheet lesson: a new
  // onClose identity mid-open must not bounce focus out and back).
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Esc closes THIS sheet only — capture phase, stopPropagation, so the
  // bubble-phase Esc handlers of any DocSheet beneath never see the event.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-doc-overlay="paper-folio"
      className="paper-folio-overlay fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-12"
    >
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="paper-folio-backdrop absolute inset-0 h-full w-full cursor-default bg-[rgba(20,18,16,0.55)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`paper-folio-panel relative w-full ${
          wide ? 'max-w-[720px]' : 'max-w-[640px]'
        } rounded-[5px] border border-[var(--color-rule-strong,#D8CCB8)] bg-[var(--doc-paper,#FAF7F2)] px-6 pb-8 pt-6 outline-none motion-safe:animate-[doc-fade_200ms_ease-out] sm:px-9`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
