'use client';

/**
 * Rule boundary handle — the draggable phase boundary on the line (C6 · R100
 * "Editing: the ripple", Slice 04 T7). Prototype: the Ripple slide's charcoal
 * `.ma-tick` at the internal boundary — `width:2px;background:var(--charcoal);
 * cursor:ew-resize`.
 *
 * A single internal boundary (one chain edge U→D) rendered as a 2px charcoal
 * tick with an `ew-resize` cursor. Dragging it edits the UPSTREAM phase's
 * DURATION — the parent maps the pointer x to a snapped day and calls
 * `ripple.begin`/`ripple.update` (the `phase-duration` kind). This component
 * owns only the POINTER MECHANICS: pointer capture, `touch-action: none`, a
 * small movement threshold (so a stray click never opens a no-op session), and
 * reporting the pointer's fractional x within the track. It never touches the
 * scale or the ripple — the parent does the date math (keeps this dumb and the
 * math pure + tested in schedule-rule-derivation).
 *
 * Refuse (a `locked` boundary — the downstream phase is anchored): pointerdown
 * shows a transient terracotta nudge naming both the wall and the way through
 * ("{name} is anchored — unpin to move it, or select the bar and press Enter to
 * resize it") with a brief firm wobble (Web Animations, reduced-motion-guarded)
 * and begins NOTHING — no capture, no session. `suppressRefuse` (the ripple
 * session is already active) silences the nudge cleanly.
 *
 * Session PERSISTS on pointerup — the preview stays; the confirm strip commits
 * or reverts (batch 4). This component does nothing on release but drop capture.
 *
 * KEYBOARD: drag is pointer-only BY DESIGN (a boundary is a spatial gesture).
 * The keyboard path to the same edit is the spine's inline duration field
 * (batch 4) — so this handle is `aria-hidden` (skipped by AT / tab order),
 * never a focus trap. Zero shadows (D4): the tick IS the affordance.
 */

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { clientXToPct } from '@/lib/document/schedule-rule-derivation';

/** px of pointer travel before a press becomes a drag — below it, a press is a
 *  no-op (a boundary has no tap action; this only guards accidental clicks). */
const DRAG_THRESHOLD_PX = 3;

export interface RuleBoundaryHandleProps {
  /** Committed x% of the boundary (the upstream phase's resolved END). */
  xPct: number;
  pinned: boolean;
  /** Downstream phase anchored ⇒ the boundary refuses (nudge, no session). */
  locked: boolean;
  /** The downstream phase's name — the refuse nudge's `{name}`. */
  refuseName: string;
  /** The ripple session is already active ⇒ suppress the refuse nudge cleanly. */
  suppressRefuse: boolean;
  /** The positioned track element — the % coordinate space a drag reads against. */
  trackRef: RefObject<HTMLElement | null>;
  /** Fired once when a drag begins (past threshold), with the pointer's x%. */
  onDragBegin: (xPct: number) => void;
  /** Fired on every subsequent frame, with the pointer's x%. */
  onDragFrame: (xPct: number) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function RuleBoundaryHandle({
  xPct,
  pinned,
  locked,
  refuseName,
  suppressRefuse,
  trackRef,
  onDragBegin,
  onDragFrame,
}: RuleBoundaryHandleProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, begun: false, startX: 0 });
  const [nudging, setNudging] = useState(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const showNudge = () => {
    if (suppressRefuse) return; // a session is in flight — no refuse chatter
    setNudging(true);
    const el = elRef.current;
    if (el && typeof el.animate === 'function' && !prefersReducedMotion()) {
      el.animate(
        [
          { transform: 'translateX(-2px)' },
          { transform: 'translateX(2px)' },
          { transform: 'translateX(-1px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 200, easing: 'ease-out' },
      );
    }
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudging(false), 1600);
  };

  const pctFromClientX = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return clientXToPct(clientX, rect);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (locked) {
      showNudge(); // refuse: no capture, no session — the anchor holds
      return;
    }
    drag.current = { down: true, begun: false, startX: e.clientX };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer already released — ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.down) return;
    const pct = pctFromClientX(e.clientX);
    if (pct == null) return;
    if (!drag.current.begun) {
      if (Math.abs(e.clientX - drag.current.startX) < DRAG_THRESHOLD_PX) return;
      drag.current.begun = true;
      onDragBegin(pct);
      return;
    }
    onDragFrame(pct);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.down) return;
    drag.current.down = false;
    drag.current.begun = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    // Session PERSISTS — the preview stays until the confirm strip acts (batch 4).
  };

  // Geometry — the resting canvas centers the line at y≈70 (tick band 62..78);
  // the pin collapses it to ~22px (tick band 4..16). The hit area is wider than
  // the 2px ink for a comfortable grab; the visible bar stays 2px.
  const g = pinned
    ? { hitTop: 3, hitHeight: 14, barTop: 4, barHeight: 12, labelTop: -13 }
    : { hitTop: 60, hitHeight: 20, barTop: 62, barHeight: 16, labelTop: 44 };

  return (
    <div
      ref={elRef}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="pointer-events-auto absolute z-[2]"
      style={{
        left: `${xPct}%`,
        top: g.hitTop,
        height: g.hitHeight,
        width: 12,
        marginLeft: -6, // 12px hit area centered on the boundary x
        cursor: locked ? 'not-allowed' : 'ew-resize',
        touchAction: 'none',
      }}
    >
      {/* the visible 2px charcoal tick, centered in the 12px hit area so its ink
          sits exactly on the boundary x (left = (12−2)/2 = 5). */}
      <span
        className="absolute"
        style={{
          left: 5,
          top: g.barTop - g.hitTop,
          width: 2,
          height: g.barHeight,
          background: 'var(--color-charcoal)',
        }}
      />
      {nudging && !pinned && (
        // The refusal now names the way THROUGH, not just the wall (B3 review):
        // a locked boundary still refuses the drag, but the phase's bar carries
        // the duration on the keyboard. The sentence is long enough to overrun
        // the rule's right edge, so a boundary past the MIDPOINT grows the label
        // LEFTWARD. RuleLabelRow flips at 66 for its own short phase names; this
        // sentence is roughly twice their length, so it has to turn earlier —
        // between 50 and 66 a right-growing label still overruns. It can't
        // collide with the ghost labels below: the nudge is suppressed whenever
        // a session is live, and the ghosts only exist while one is.
        <span
          className="absolute whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]"
          style={xPct > 50 ? { right: 8, top: g.labelTop } : { left: 8, top: g.labelTop }}
        >
          {refuseName} is anchored — unpin to move it, or select the bar and press Enter to
          resize it
        </span>
      )}
    </div>
  );
}
