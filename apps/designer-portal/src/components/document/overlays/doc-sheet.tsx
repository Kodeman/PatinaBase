'use client';

/**
 * DocSheet — the first Doc* overlay wrapper (R3). Ledger sheets slide up
 * over whatever the designer is holding (D8): max 72vh, charcoal, hairline
 * top border, zero shadows (D4). Built without design-system overlay
 * primitives (DECISIONS.md I5): minimal dialog semantics — Esc, backdrop
 * dismiss, focus in on open / restored on close.
 *
 * Navigation invariant (§3): an overlay, never a route — the surface
 * beneath must not unmount.
 */

import { useEffect, useRef } from 'react';

export function DocSheet({
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
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(0,0,0,0.35)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto border-t border-[rgba(250,247,242,0.14)] bg-[var(--color-charcoal)] px-6 pb-10 pt-6 outline-none motion-safe:animate-[doc-sheet-up_250ms_var(--ease-editorial)]"
      >
        {children}
      </div>
    </div>
  );
}
