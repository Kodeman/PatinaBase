'use client';

/**
 * DocPaperSheet — a centered paper sheet sibling to DocSheet (R3 dialog
 * semantics). The Discovery call checklist (R66) is a paper artifact, not a
 * charcoal ledger, so it gets a centered cream panel with an ink hairline
 * border. Same minimal dialog behaviour as DocSheet: Esc, backdrop dismiss,
 * focus in on open / restored on close, zero shadows (D4).
 *
 * Navigation invariant (§3): an overlay, never a route — the surface beneath
 * must not unmount.
 */

import { useEffect, useRef } from 'react';

export function DocPaperSheet({
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

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-5 sm:p-16">
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(20,18,16,0.5)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-[560px] rounded-[5px] border border-[var(--color-rule-strong,#D8CCB8)] bg-[var(--doc-paper)] px-7 pb-8 pt-6 outline-none motion-safe:animate-[doc-fade_200ms_ease-out]"
      >
        {children}
      </div>
    </div>
  );
}
