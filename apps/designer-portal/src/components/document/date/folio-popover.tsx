'use client';

/**
 * FolioPopover — the anchored paper panel the Calendar Folio opens in.
 *
 * The house anchored-popover pattern (title-picker): the CALLER renders this
 * inside a `relative` wrapper and owns whether it is mounted at all. No portal
 * — a DocSheet traps focus, and a portalled panel would land outside the trap.
 * No `role="dialog"` — the schedule confirm strip defers its Esc to
 * `document.querySelector('[role="dialog"]')`, so a date panel wearing that
 * role would silently disable the strip's revert for as long as it is open.
 *
 * Both dismiss handlers listen in the CAPTURE phase on `document` and
 * stopPropagation: DocSheet and the confirm strip listen on `document` too,
 * and between two listeners on the same node only a capture-phase stop gets
 * there first. Consequence worth knowing: an Esc pressed inside the panel is
 * consumed here, so a nested FolioCalendar's own `onCancel` never sees it —
 * inside a popover, Esc means "close the popover" and the caller wires the
 * rest to `onClose`.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

export interface FolioPopoverProps {
  /** Outside pointerdown or Esc — the caller unmounts/hides the panel. */
  onClose: () => void;
  /** Which edge of the anchor the panel hangs from. */
  align?: 'start' | 'end';
  /** Focused on close, so dismissal returns the caret to the opener. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  'aria-label': string;
  children: ReactNode;
  className?: string;
}

export function FolioPopover({
  onClose,
  align = 'start',
  returnFocusRef,
  'aria-label': ariaLabel,
  children,
  className,
}: FolioPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof window === 'undefined') return;
    const rect = panel.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > window.innerHeight) setPlacement('above');
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel || panel.contains(e.target as Node)) return;
      e.stopPropagation();
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  // Read the ref at unmount time, not at effect setup: the opener may not have
  // mounted its own ref yet when the panel first renders.
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;
  useEffect(
    () => () => {
      returnRef.current?.current?.focus();
    },
    [],
  );

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      aria-label={ariaLabel}
      data-folio-placement={placement}
      className={[
        'absolute z-20 rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] outline-none',
        align === 'end' ? 'right-0' : 'left-0',
        placement === 'above' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
