'use client';

/**
 * Rule diamond — one milestone stamp on the line (C6 · R99, Slice 02; drag
 * added Slice 04 T7). Prototype: `.ma-di.signed/.due/.ahead` in
 * the-document-schedule-master-direction.html; pinned size from `.pin-rule .dd`.
 *
 * The diamond is a MINIMAP control AND (Slice 04) a drag handle. As a control
 * it stays a real focusable `<button>` (aria-labelled) that reveals the
 * milestone's phase in the spine — the KEYBOARD + tap path, unchanged. When
 * `draggable` (a ripple provider is present — batch 4), a POINTER drag past a
 * small movement threshold slides the milestone instead: the parent maps the
 * pointer x to a snapped day and edits `milestone-offset` (offset from the host
 * phase END). Below the threshold it stays a tap → the existing reveal fires.
 * An ANCHORED milestone HOLDS its date: a drag refuses (transient terracotta
 * nudge, no session); a tap still reveals. `suppressRefuse` (a session already
 * in flight) silences the nudge. Session PERSISTS on pointerup (batch 4 acts).
 *
 * Stamp palette matches the spine's milestone row exactly: signed sage · due
 * golden with a terracotta ring · upcoming hollow aged-oak · slipped terracotta.
 * `pinned` shrinks 8px → 6px. The ring is a real CSS outline (never a
 * box-shadow — D4). When `draggable` is false the component is byte-identical to
 * its Slice-02 self (no pointer handlers) — the pre-provider default.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { MilestoneStatus } from '@patina/utils';
import { clientXToPct } from '@/lib/document/schedule-rule-derivation';

const DRAG_THRESHOLD_PX = 3;

export interface RuleDiamondProps {
  xPct: number;
  status: MilestoneStatus;
  /** The milestone's display name — the button's accessible label. */
  label: string;
  pinned: boolean;
  /** The drafting strip places diamonds inside their phase's lane; omitted ⇒
   *  the compact rule's own single-track y. */
  topPx?: number;
  onClick: () => void;
  /** A ripple provider is present ⇒ enable the pointer drag (batch 4). When
   *  false the diamond is a pure reveal button (Slice-02 behavior, unchanged). */
  draggable?: boolean;
  /** Anchored milestones HOLD — a drag refuses (nudge); a tap still reveals. */
  anchored?: boolean;
  /** The host phase's resolved END epoch day — the offset base. `null` ⇒ the
   *  milestone can't be slid (no end to offset from); a drag refuses. */
  phaseEndEpoch?: number | null;
  /** A session is already active ⇒ suppress the refuse nudge cleanly. */
  suppressRefuse?: boolean;
  /** The positioned track element — the % coordinate space a drag reads against. */
  trackRef?: RefObject<HTMLElement | null>;
  onDragBegin?: (xPct: number) => void;
  onDragFrame?: (xPct: number) => void;
}

/** The stamp face per derived status (`.ma-di` + the spine row's slipped). */
const FACE: Record<MilestoneStatus, CSSProperties> = {
  signed: { background: 'var(--color-sage)' },
  due: {
    background: 'var(--color-golden-hour)',
    outline: '1.5px solid var(--color-terracotta)',
    outlineOffset: '1px',
  },
  upcoming: {
    background: 'var(--color-off-white)',
    border: '1.5px solid var(--color-aged-oak)',
  },
  slipped: { background: 'var(--color-terracotta)' },
};

export function RuleDiamond({
  xPct,
  status,
  label,
  pinned,
  topPx,
  onClick,
  draggable = false,
  anchored = false,
  phaseEndEpoch = null,
  suppressRefuse = false,
  trackRef,
  onDragBegin,
  onDragFrame,
}: RuleDiamondProps) {
  const size = pinned ? 6 : 8;
  const top = topPx ?? (pinned ? 8.5 : 65);

  const drag = useRef({ down: false, begun: false, dragged: false, startX: 0 });
  const [nudging, setNudging] = useState(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSlide = draggable && !anchored && phaseEndEpoch != null && trackRef != null;

  useEffect(
    () => () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const showNudge = () => {
    if (suppressRefuse) return;
    setNudging(true);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudging(false), 1600);
  };

  const pctFromClientX = (clientX: number): number | null => {
    const rect = trackRef?.current?.getBoundingClientRect();
    if (!rect) return null;
    return clientXToPct(clientX, rect);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggable) return;
    drag.current = { down: true, begun: false, dragged: false, startX: e.clientX };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.down) return;
    if (Math.abs(e.clientX - drag.current.startX) < DRAG_THRESHOLD_PX) return;
    // Past the threshold — this gesture is a DRAG, not a tap: mark it so the
    // trailing click never reveals.
    if (!drag.current.dragged) {
      drag.current.dragged = true;
      if (!canSlide) {
        showNudge(); // anchored / no host end — the milestone holds; no session
        return;
      }
    }
    if (!canSlide) return;
    const pct = pctFromClientX(e.clientX);
    if (pct == null) return;
    if (!drag.current.begun) {
      drag.current.begun = true;
      onDragBegin?.(pct);
      return;
    }
    onDragFrame?.(pct);
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.down) return;
    drag.current.down = false;
    drag.current.begun = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    // Session PERSISTS — batch 4's strip commits or reverts.
  };

  const handleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    // A completed drag suppresses the reveal (the click that trails pointerup).
    if (drag.current.dragged) {
      drag.current.dragged = false;
      e.preventDefault();
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? endDrag : undefined}
      onPointerCancel={draggable ? endDrag : undefined}
      aria-label={`${label} — reveal in the schedule`}
      // z-[3]: interactive controls sit above the decorative layers (track /
      // today / thread — all z-auto AND pointer-events-none; ghost layer z-[1],
      // pointer-events-none). ABOVE the boundary handle (z-[2]) specifically so
      // a milestone sitting EXACTLY at a phase boundary (offset 0, at the phase
      // end) isn't occluded by the handle's 12px hit area — the diamond stays
      // tappable (reveal) and draggable (slide). The handle's wider hit area
      // still overhangs the ±4px diamond on both sides, so the boundary itself
      // stays grabbable too (S4-3 carried-forward fix).
      className="absolute z-[3] rotate-45 cursor-pointer p-0"
      style={{
        left: `${xPct}%`,
        top,
        width: size,
        height: size,
        marginLeft: -(size / 2),
        touchAction: draggable ? 'none' : undefined,
        ...FACE[status],
      }}
    >
      {nudging && !pinned && (
        // counter-rotate: the button is rotate-45, the text must read upright.
        <span
          className="absolute whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)] -rotate-45"
          style={{ left: 8, top: 8 }}
        >
          {label} is anchored — unpin to move it
        </span>
      )}
    </button>
  );
}
