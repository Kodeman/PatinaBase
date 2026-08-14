'use client';

/**
 * Rule phase bar — the Drafting Line (B1/B2). The Rule stops being a read-only
 * minimap with two point handles and becomes a direct-manipulation phase-date
 * editor: one bar per placed main-lane phase, dragged BODY to move the phase,
 * dragged RIGHT EDGE to lengthen or shorten it.
 *
 * Two gestures, two ripple edits — no new `RipplePendingEdit` kind, no RPC or
 * serializer change:
 *   · body   → `phase-anchor` at the bar's new START. ONE kind covers both
 *              semantics: an unanchored phase GAINS an anchor at the day it was
 *              dropped on; an anchored phase's anchor MOVES there.
 *   · edge   → `phase-duration`, via the same `boundaryDurationDays` a boundary
 *              handle uses. Rendered ONLY where no `RuleBoundaryHandle` already
 *              owns that end (`hasInternalEndBoundary`), so the two affordances
 *              never stack on one tick.
 * The parent owns `ripple.begin`/`ripple.update` exactly as it does for the
 * boundary handles; this component owns the gesture and hands over already-
 * computed edit VALUES (the date math is `schedule-rule-derivation`'s — this
 * file performs no epoch arithmetic of its own).
 *
 * Session PERSISTS on pointerup and after a keyboard nudge — the confirm strip
 * commits or reverts. Esc is deliberately NOT handled here: the strip's global
 * document-keydown revert owns it, and nothing below stops that event.
 *
 * R102 — no hover-revealed affordances. Both marks are PERMANENT: a faint clay
 * underlay band the width of the phase (the bar is visible before you reach for
 * it) and, where the end is resizable, a 2px charcoal grip tick standing on it.
 * Nothing appears on hover; only the cursor changes (grab → grabbing).
 *
 * KEYBOARD (B2) — the accessibility path to the same two edits, since the bar is
 * a spatial gesture and typed phase-date entry is going away. The bar root is a
 * `role="slider"`: ←/→ nudge ±1 day, Shift+←/→ ±7, Enter toggles MOVE ⇄ RESIZE
 * (RESIZE offered only where the end is resizable), and a small always-visible
 * mode label shows which set of arrows you are holding. Nudges accumulate off
 * the STAGED value while this bar owns the session and fall back to the
 * committed value the moment it doesn't (a commit or an Esc revert), so the
 * announced value can never drift from the truth.
 *
 * Zero shadows (D4) — the focus ring is a real outline. No animation, so there
 * is nothing here for `prefersReducedMotion` to guard.
 */

import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  barMoveStartEpoch,
  barNudgeEpochDay,
  boundaryDurationDays,
  clientXToPct,
  type RuleBar,
} from '@/lib/document/schedule-rule-derivation';
import { isoFromEpochDay } from '@patina/utils';
import { fmtDay } from '@/lib/document/format';

/** px of pointer travel before a press becomes a drag — matches the boundary
 *  handle / diamond so every drag surface on the Rule has one feel. */
const DRAG_THRESHOLD_PX = 3;

/** Shift+arrow = a week. */
const NUDGE_DAYS = 1;
const NUDGE_DAYS_SHIFT = 7;

type BarMode = 'move' | 'resize';

/** The bar's live values — the committed ones, or the staged ones while this
 *  bar owns the pending edit. */
interface BarValue {
  startEpoch: number;
  durationDays: number;
}

export interface RulePhaseBarProps {
  bar: RuleBar;
  pinned: boolean;
  /** The positioned track element — the % coordinate space a drag reads against. */
  trackRef: RefObject<HTMLElement | null>;
  /** x% → the epoch day it names, in the Rule's committed scale (the parent
   *  holds the scale; the bar never sees it). */
  xToDay: (xPct: number) => number;
  /** The pending ripple edit targets THIS phase ⇒ a nudge updates the session
   *  and accumulates off the staged value; otherwise it begins a new one. */
  sessionOwned: boolean;
  /** MOVE → the phase's new START epoch day (the parent anchors it there). */
  onMoveBegin: (startEpoch: number) => void;
  onMoveFrame: (startEpoch: number) => void;
  /** RESIZE → the phase's new duration in whole days (≥ 1). */
  onResizeBegin: (durationDays: number) => void;
  onResizeFrame: (durationDays: number) => void;
}

export function RulePhaseBar({
  bar,
  pinned,
  trackRef,
  xToDay,
  sessionOwned,
  onMoveBegin,
  onMoveFrame,
  onResizeBegin,
  onResizeFrame,
}: RulePhaseBarProps) {
  const drag = useRef({ down: false, begun: false, mode: 'move' as BarMode, startX: 0, grabOffsetDays: 0 });
  const [dragPreview, setDragPreview] = useState<BarValue | null>(null);
  const [staged, setStaged] = useState<BarValue | null>(null);
  const [mode, setMode] = useState<BarMode>('move');
  const [focused, setFocused] = useState(false);

  const canResize = !bar.hasInternalEndBoundary;
  const effectiveMode: BarMode = mode === 'resize' && !canResize ? 'move' : mode;

  // The value the keyboard nudges from and the label announces: staged while
  // this bar owns the pending edit, committed the moment it doesn't (commit,
  // revert, or another surface taking the session over).
  const value: BarValue =
    sessionOwned && staged != null
      ? staged
      : { startEpoch: bar.startEpoch, durationDays: bar.durationDays };

  const pctFromClientX = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return clientXToPct(clientX, rect);
  };

  const beginPointer = (e: ReactPointerEvent<HTMLElement>, gestureMode: BarMode) => {
    drag.current = { down: true, begun: false, mode: gestureMode, startX: e.clientX, grabOffsetDays: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer already released — ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current.down) return;
    const pct = pctFromClientX(e.clientX);
    if (pct == null) return;
    const day = xToDay(pct);

    const isResize = drag.current.mode === 'resize';

    if (!drag.current.begun) {
      if (Math.abs(e.clientX - drag.current.startX) < DRAG_THRESHOLD_PX) return;
      drag.current.begun = true;
      // The offset the pointer holds INTO the bar — the same subtraction that
      // later yields the new start, so the bar slides under the cursor rather
      // than snapping its start to it.
      drag.current.grabOffsetDays = barMoveStartEpoch(bar.startEpoch, day);
      if (isResize) {
        const durationDays = boundaryDurationDays(bar.startEpoch, day);
        setDragPreview({ startEpoch: bar.startEpoch, durationDays });
        onResizeBegin(durationDays);
      } else {
        const startEpoch = barMoveStartEpoch(drag.current.grabOffsetDays, day);
        setDragPreview({ startEpoch, durationDays: bar.durationDays });
        onMoveBegin(startEpoch);
      }
      return;
    }

    if (isResize) {
      const durationDays = boundaryDurationDays(bar.startEpoch, day);
      setDragPreview({ startEpoch: bar.startEpoch, durationDays });
      onResizeFrame(durationDays);
      return;
    }

    const startEpoch = barMoveStartEpoch(drag.current.grabOffsetDays, day);
    setDragPreview({ startEpoch, durationDays: bar.durationDays });
    onMoveFrame(startEpoch);
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current.down) return;
    drag.current.down = false;
    drag.current.begun = false;
    setDragPreview(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    // Session PERSISTS — the confirm strip commits or reverts it.
  };

  // Only ONE edit is ever pending (R100), so staging one dimension drops any
  // pending edit of the other — the untouched dimension therefore always
  // re-reads the COMMITTED bar, never a stale staged value from the old kind.
  const nudge = (deltaDays: number) => {
    if (effectiveMode === 'resize') {
      // The nudged END, run through the SAME clamp a boundary drag applies.
      const durationDays = boundaryDurationDays(
        bar.startEpoch,
        barNudgeEpochDay(bar.startEpoch, value.durationDays + deltaDays),
      );
      setStaged({ startEpoch: bar.startEpoch, durationDays });
      if (sessionOwned) onResizeFrame(durationDays);
      else onResizeBegin(durationDays);
      return;
    }
    const startEpoch = barNudgeEpochDay(value.startEpoch, deltaDays);
    setStaged({ startEpoch, durationDays: bar.durationDays });
    if (sessionOwned) onMoveFrame(startEpoch);
    else onMoveBegin(startEpoch);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Esc is NOT handled here on purpose — the confirm strip's global revert
    // owns it, and this handler stops nothing.
    if (e.key === 'Enter') {
      if (!canResize) return;
      e.preventDefault();
      setMode((m) => (m === 'move' ? 'resize' : 'move'));
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const magnitude = e.shiftKey ? NUDGE_DAYS_SHIFT : NUDGE_DAYS;
    nudge(e.key === 'ArrowLeft' ? -magnitude : magnitude);
  };

  // Geometry — the resting canvas centers the line at y≈70 (the boundary
  // handle's band is 62..78); the pin collapses it to ~22px (band 4..16).
  const g = pinned
    ? { top: 4, height: 12, tipTop: 0, modeTop: 0 }
    : { top: 62, height: 16, tipTop: 44, modeTop: 80 };

  const shown = dragPreview ?? value;
  const startIso = isoFromEpochDay(shown.startEpoch);
  const endIso = isoFromEpochDay(barNudgeEpochDay(shown.startEpoch, shown.durationDays));

  const valueText = `${bar.name}: starts ${startIso ? fmtDay(startIso) : '—'}, ${
    shown.durationDays
  } days — ${effectiveMode === 'resize' ? 'RESIZE' : 'MOVE'} mode`;

  return (
    <>
      {/* the bar body — move gesture + the keyboard slider. z-[1]: above the
          decorative track, BELOW the boundary handles (z-[2]) and diamonds
          (z-[3]) so both stay grabbable where they overlap a bar. */}
      <div
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuenow={effectiveMode === 'resize' ? shown.durationDays : shown.startEpoch}
        aria-valuetext={valueText}
        onPointerDown={(e) => beginPointer(e, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="pointer-events-auto absolute z-[1] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-charcoal)]"
        style={{
          left: `${bar.leftPct}%`,
          width: `${Math.max(0, bar.widthPct)}%`,
          top: g.top,
          height: g.height,
          cursor: dragPreview != null ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        {/* PERMANENT faint clay underlay — the bar is a standing mark, never a
            hover reveal (R102). */}
        <span
          className="absolute inset-0"
          style={{ background: 'var(--color-clay)', opacity: 0.1 }}
        />

        {!pinned && focused && (
          <span
            className="absolute whitespace-nowrap font-mono text-[0.54rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]"
            style={{ left: 0, top: g.modeTop - g.top }}
          >
            {effectiveMode === 'resize' ? 'Resize' : 'Move'}
          </span>
        )}

        {!pinned && dragPreview != null && startIso && endIso && (
          <span
            className="absolute whitespace-nowrap font-mono text-[0.54rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]"
            style={{ left: 0, top: g.tipTop - g.top }}
          >
            {fmtDay(startIso)} — {fmtDay(endIso)} · {shown.durationDays}d
          </span>
        )}
      </div>

      {/* PERMANENT 2px charcoal grip on a resizable end — a sibling, not a
          child, so its press never doubles as a body (move) press. */}
      {canResize && (
        <div
          aria-hidden
          onPointerDown={(e) => beginPointer(e, 'resize')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="pointer-events-auto absolute z-[1]"
          style={{
            left: `${bar.leftPct + bar.widthPct}%`,
            top: g.top,
            height: g.height,
            width: 10,
            marginLeft: -5, // 10px hit area centered on the bar's end
            cursor: 'ew-resize',
            touchAction: 'none',
          }}
        >
          <span
            className="absolute"
            style={{ left: 4, top: 0, width: 2, height: g.height, background: 'var(--color-charcoal)' }}
          />
        </div>
      )}
    </>
  );
}
