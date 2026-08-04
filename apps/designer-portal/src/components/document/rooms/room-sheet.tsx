'use client';

/**
 * RoomSheet — a PAPER sheet that slides up over a Room (R39/D14). Distinct from
 * the charcoal ledger DocSheet: inside a Room the sheet is a document part
 * (capture, deep analysis), so it wears paper, not charcoal. Same minimal
 * dialog semantics as DocSheet — Esc, backdrop dismiss, focus in/restore, zero
 * shadows (D4). The Room beneath never unmounts (D1).
 *
 * STACKING (Call Sheet Wave 3). RoomSheet used to sit outside the managed modal
 * stack while binding Escape unconditionally on `document`. A RoomSheet opened
 * over a DocSheet therefore closed BOTH on one Escape: each sheet's own listener
 * fired, and neither asked whether it was the one on top. It now registers with
 * `registerManagedModalDialog` exactly the way DocSheet does, which buys three
 * things:
 *   · Escape is handled only by the topmost rendered modal dialog;
 *   · a covered sheet drops `aria-modal` and goes `inert`, so focus and the
 *     reader stay on the sheet the designer is actually looking at;
 *   · it renders through a portal to `document.body`, because the stack orders
 *     by DOM position — an inline RoomSheet sorts BEFORE DocSheet's portal and
 *     would be mistaken for the covered one. The portal also makes the `fixed`
 *     layer viewport-fixed regardless of any transformed ancestor.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  registerManagedModalDialog,
  topActiveModalDialog,
} from '../overlays/active-dialog';

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
  const [isTopModal, setIsTopModal] = useState(true);

  // Join the managed stack on open, leave it on close/unmount. The callback
  // re-fires for every other member too, so the sheet beneath learns it is
  // covered the moment this one mounts.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    return registerManagedModalDialog(panel, setIsTopModal);
  }, [open]);

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

  // Esc closes — but only when this sheet is the top of the stack, so an Escape
  // over a stacked pair puts back one sheet, not both.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const panel = panelRef.current;
      if (!panel || topActiveModalDialog() !== panel) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[55]"
      data-room-sheet-layer
      data-room-sheet-stack-state={isTopModal ? 'top' : 'covered'}
      aria-hidden={isTopModal ? undefined : true}
      inert={isTopModal ? undefined : true}
    >
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(28,26,24,0.5)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isTopModal ? true : undefined}
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
    </div>,
    document.body,
  );
}
