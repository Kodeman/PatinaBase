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
 * Both dismiss handlers listen in the CAPTURE phase on `document`: DocSheet and
 * the confirm strip listen on `document` too, and between two listeners on the
 * same node only a capture-phase stop gets there first. Consequence worth
 * knowing: an Esc pressed inside the panel is consumed here, so a nested
 * FolioCalendar's own `onCancel` never sees it — inside a popover, Esc means
 * "close the popover" and the caller wires the rest to `onClose`.
 *
 * Esc closes ONE panel: `stopPropagation` cannot silence a sibling listener on
 * the same node, so every mounted panel would otherwise answer the same key.
 * Instances therefore take a number on a module-level stack; only the top of
 * the stack acts, and it calls `stopImmediatePropagation` so the panels beneath
 * it (and DocSheet below them) never hear the key at all.
 *
 * An outside pointerdown dismisses and NOTHING ELSE (orchestrator ruling): the
 * click that follows it is swallowed by a one-shot shield, so the press that
 * closes a Folio can never also fire the control it landed on — the schedule's
 * "HOLD THE WINDOW" hazard, where a dismissing click commits a ceremony.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

/** Mounted panels, oldest first. Only the last one answers Esc. */
const openPanels: symbol[] = [];

/** How long the click shield waits for the click that may never come (a
 *  pointerdown with no matching click — a drag, a lifted finger elsewhere). */
const SHIELD_TTL_MS = 400;

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

  // The stack position is owned by mount/unmount alone — a re-registered
  // listener (a caller whose onClose identity changed) must not promote this
  // panel over one that opened after it.
  const idRef = useRef<symbol | null>(null);
  if (idRef.current == null) idRef.current = Symbol('folio-popover');

  useEffect(() => {
    const id = idRef.current as symbol;
    openPanels.push(id);
    return () => {
      const at = openPanels.indexOf(id);
      if (at !== -1) openPanels.splice(at, 1);
    };
  }, []);

  useEffect(() => {
    const id = idRef.current as symbol;

    let shield: ((e: MouseEvent) => void) | null = null;
    let shieldTimer: ReturnType<typeof setTimeout> | null = null;

    const disarmShield = () => {
      if (shield) {
        document.removeEventListener('click', shield, true);
        shield = null;
      }
      if (shieldTimer != null) {
        clearTimeout(shieldTimer);
        shieldTimer = null;
      }
    };

    const armShield = () => {
      disarmShield();
      shield = (e: MouseEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        disarmShield();
      };
      document.addEventListener('click', shield, true);
      shieldTimer = setTimeout(disarmShield, SHIELD_TTL_MS);
    };

    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current;
      // A press inside disarms any stale shield from a previous dismissal —
      // nothing inside the panel should ever be swallowed.
      if (!panel || panel.contains(e.target as Node)) {
        disarmShield();
        return;
      }
      e.stopPropagation();
      armShield();
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openPanels[openPanels.length - 1] !== id) return;
      e.stopImmediatePropagation();
      onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      disarmShield();
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
