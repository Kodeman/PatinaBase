'use client';

/**
 * FolioPopover — the anchored paper panel the Calendar Folio opens in.
 *
 * The CALLER renders this inside a `relative` wrapper and owns whether it is
 * mounted at all. The panel itself is PORTALED to <body> and positioned
 * `fixed` from that wrapper's rect: an inline `absolute` panel was clipped to
 * ribbons by the first `overflow` ancestor it met on a plain fold section
 * (Kody's live walk — the discovery Timeline fields showed bare grid rows with
 * the header, presets and SET cut away). A date panel must render above
 * everything, so it leaves the flow entirely; the caller's markup is unchanged
 * because the anchor is found from a hidden marker left at the old position.
 *
 * No `role="dialog"` — the schedule confirm strip defers its Esc to
 * `document.querySelector('[role="dialog"]')`, so a date panel wearing that
 * role would silently disable the strip's revert for as long as it is open.
 * Portaling costs the DocSheet focus trap, which can no longer reach the panel
 * by subtree — doc-sheet.tsx therefore trades its scope for the popover's
 * while one is open (`topDismissiblePopover`).
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

import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';

/** Mounted panels, oldest first. Only the last one answers Esc. */
const openPanels: symbol[] = [];

/** Clear of DocSheet (z-50), RoomSheet (z-55) and PaperFolioSheet (z-[60]):
 *  a date panel opened from a field inside any of them sits above it. */
const PANEL_Z = 70;

/** The gap between the anchor's edge and the panel. */
const GAP = 6;

/** Viewport margin the panel is never pushed past. */
const EDGE = 8;

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
  const markerRef = useRef<HTMLSpanElement>(null);

  // The anchor is the caller's `relative` wrapper — the element the panel used
  // to be positioned inside. The marker stays behind at that spot purely to
  // name it, so no caller has to pass a ref it didn't need before.
  const anchorOf = () => markerRef.current?.parentElement ?? null;

  // Positioning is imperative on purpose: writing top/left into React state
  // would re-render on every scroll frame, and the panel's size is an input to
  // its own placement.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const place = () => {
      const panel = panelRef.current;
      const anchor = anchorOf();
      if (!panel || !anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;

      const roomBelow = window.innerHeight - rect.bottom - GAP;
      const roomAbove = rect.top - GAP;
      const above = height > roomBelow && roomAbove > roomBelow;

      const top = above ? Math.max(EDGE, rect.top - GAP - height) : rect.bottom + GAP;
      const wanted = align === 'end' ? rect.right - width : rect.left;
      const left = Math.max(EDGE, Math.min(wanted, window.innerWidth - width - EDGE));

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      panel.dataset.folioPlacement = above ? 'above' : 'below';
    };

    place();

    // Capture, so a scroll in ANY ancestor container moves the panel with its
    // field — a fixed panel left behind by a scrolled anchor is worse than one
    // that never opened.
    let frame: number | null = null;
    const onViewportChange = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        place();
      });
    };
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [align]);

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
      const target = e.target as Node;
      // "Inside" is now two places: the portaled panel, and the anchor the
      // panel belongs to — a press on the trigger is the caller's own toggle to
      // answer, never a dismissal that also swallows its click.
      // A press inside also disarms any stale shield from a previous dismissal.
      if (!panel || panel.contains(target) || anchorOf()?.contains(target)) {
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

  if (typeof document === 'undefined') return null;

  return (
    <>
      {/* Stays at the caller's position so the anchor can be found. */}
      <span ref={markerRef} aria-hidden className="hidden" />
      {createPortal(
        <div
          ref={panelRef}
          tabIndex={-1}
          aria-label={ariaLabel}
      // The marker `topDismissiblePopover()` reads. It is how a surface with
      // its own document-CAPTURE Esc (margin-rail's compact sheet) defers to an
      // open panel: that listener is registered before this one and therefore
      // runs first, so the stack below cannot stop it — only the guard can.
          data-dismissible-popover=""
          data-folio-placement="below"
          style={{ zIndex: PANEL_Z }}
          className={[
            'fixed rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] outline-none',
            className ?? '',
          ].join(' ')}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
