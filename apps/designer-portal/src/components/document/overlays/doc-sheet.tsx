'use client';

/**
 * DocSheet — the first Doc* overlay wrapper (R3). Default 'sheet' variant:
 * ledger sheets slide up over whatever the designer is holding (D8): max 72vh,
 * charcoal, hairline top border, zero shadows (D4). Built without design-system
 * overlay primitives (DECISIONS.md I5): minimal dialog semantics — Esc, backdrop
 * dismiss, focus in on open / restored on close.
 *
 * The opt-in 'center' variant is a larger, centered modal (used by the feedback
 * layer): the same dialog semantics, but the panel sits mid-screen with a
 * scale-fade entrance (reuses the doc-raise keyframe) instead of the bottom
 * slide. Depth is border + backdrop contrast — still no shadow (D4).
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
  variant = 'sheet',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 'sheet' | 'center';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus in on open, restore on close. Depends ONLY on `open` — not onClose —
  // so a caller's unstable onClose identity (recreated each render) can't re-run
  // this and steal focus from a field mid-typing (one keystroke re-renders the
  // caller → new onClose → panel.focus() would yank focus out of the input).
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Esc closes. Re-subscribes if onClose changes (harmless — no focus effect).
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

  const centered = variant === 'center';

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className={
        centered
          ? 'pointer-events-auto w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[rgba(250,247,242,0.14)] bg-[var(--color-charcoal)] px-6 py-6 outline-none motion-safe:animate-[doc-raise_220ms_var(--ease-editorial)]'
          : 'absolute inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto border-t border-[rgba(250,247,242,0.14)] bg-[var(--color-charcoal)] px-6 pb-10 pt-6 outline-none motion-safe:animate-[doc-sheet-up_250ms_var(--ease-editorial)]'
      }
    >
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(0,0,0,0.35)]"
      />
      {centered ? (
        // pointer-events-none on the frame lets clicks in the empty margin fall
        // through to the backdrop button (dismiss); the panel re-enables them.
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 sm:p-6">
          {panel}
        </div>
      ) : (
        panel
      )}
    </div>
  );
}
