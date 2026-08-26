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
 *              handle uses. Offered wherever `barCanResize` says the bar owns
 *              its end — i.e. no boundary handle stands there, or one does but
 *              is LOCKED and therefore refuses every drag (without that second
 *              case the phase's duration would be editable by nothing at all).
 * Nothing here follows the cursor: the committed bar holds its ground while the
 * terracotta ghost layer carries the preview, exactly as a boundary-handle drag
 * does. The parent owns `ripple.begin`/`ripple.update`; this component owns the
 * gesture and hands over already-computed edit VALUES (the date math is
 * `schedule-rule-derivation`'s — this file performs no epoch arithmetic).
 *
 * SESSION OWNERSHIP. At most one edit is ever pending, and any surface may
 * begin one — including the Spine, on this very phase. A bar therefore may
 * only `update()` a session it can PROVE is its own: `barOwnsSession` requires
 * the live session to be rule-originated AND to still carry this bar's last
 * emitted values. Anything else (a spine-origin session, another rule surface's
 * edit, a session cleared and re-begun elsewhere) reads as not-ours and the
 * next gesture BEGINS a fresh one off the committed values. Begin replacing a
 * pending foreign session is the Rule's existing behavior (the boundary handles
 * do the same); silently updating into one is what this prevents.
 *
 * That proof, and the staged value it guards, CANNOT live in this component.
 * The Rule renders its pinned and unpinned surfaces as a ternary, so scrolling
 * past the pin threshold unmounts and remounts every bar — while the session it
 * authored lives on in the provider. Instance-local state would be wiped by that
 * scroll and the next gesture would silently Begin off stale committed values,
 * discarding the accumulated edit. So the store is LIFTED into ScheduleRule
 * (which does not remount across the pin flip) and reached through the
 * `getBarEdit`/`setBarEdit` accessors; this component keeps the logic and owns
 * none of the memory.
 *
 * Session PERSISTS on pointerup and after a keyboard nudge — the confirm strip
 * commits or reverts. Esc is deliberately NOT handled here: the strip's global
 * document-keydown revert owns it, and nothing below stops that event.
 *
 * R102 — no hover-revealed affordances. Both marks are PERMANENT: a faint clay
 * underlay band the width of the phase (the bar is visible before you reach for
 * it) and, where the bar owns its end, a 2px charcoal grip tick standing on it.
 * Nothing appears on hover; only the cursor changes (grab → grabbing).
 *
 * KEYBOARD (B2) — the accessibility path to the same two edits, since the bar is
 * a spatial gesture and typed phase-date entry is going away. The bar root is a
 * `role="slider"`: ←/→ nudge ±1 day, Shift+←/→ ±7, Enter toggles MOVE ⇄ RESIZE
 * (RESIZE offered only where the bar owns its end), and a small always-visible
 * mode label shows which set of arrows you are holding. `aria-valuemin`/`max`
 * follow the mode — the scale's epoch domain when moving, 1…domain-span days
 * when resizing — and every staged value is clamped into that same domain, so
 * the announced range is the range the gesture can actually reach.
 *
 * Zero shadows (D4) — the focus ring is a real outline. No animation, so there
 * is nothing here for `prefersReducedMotion` to guard.
 */

import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  barCanResize,
  barMoveStartEpoch,
  barNudgeEpochDay,
  boundaryDurationDays,
  clampBarEpochDay,
  clientXToPct,
  type RuleBar,
} from '@/lib/document/schedule-rule-derivation';
import { isoFromEpochDay } from '@patina/utils';
import { fmtDay } from '@/lib/document/format';
import type { RippleSession } from './schedule-ripple-context';

/** px of pointer travel before a press becomes a drag — matches the boundary
 *  handle / diamond so every drag surface on the Rule has one feel. */
const DRAG_THRESHOLD_PX = 3;

/** Shift+arrow = a week. */
const NUDGE_DAYS = 1;
const NUDGE_DAYS_SHIFT = 7;

type BarMode = 'move' | 'resize';

/** The bar's live values — the committed ones, or the staged ones while this
 *  bar owns the pending edit. */
export interface BarValue {
  startEpoch: number;
  durationDays: number;
}

/** What a bar last handed the parent — the proof of session ownership. */
export type Emission =
  | { kind: 'phase-anchor'; anchorDate: string }
  | { kind: 'phase-duration'; durationDays: number };

/** One phase's entry in the lifted store: the ownership proof and the value
 *  that proof guards. Held by ScheduleRule so it outlives the pin remount. */
export interface BarEditState {
  emitted: Emission;
  staged: BarValue;
}

/**
 * Is `session` the one whose author emitted `emitted` for `phaseId`? Origin must
 * be 'rule' (a spine-originated edit is never a bar's, whatever phase it names)
 * and the session's edit must still carry that phase id and those exact values.
 * A cleared, committed, or taken-over session fails. Exported so ScheduleRule's
 * store pruner and the bar itself share ONE definition of ownership rather than
 * two that could drift.
 */
export function barOwnsSession(
  session: RippleSession | null,
  phaseId: string,
  emitted: Emission | null | undefined,
): boolean {
  if (session == null || emitted == null || session.origin !== 'rule') return false;
  const live = session.edit;
  if (emitted.kind === 'phase-anchor') {
    return (
      live.kind === 'phase-anchor' && live.phaseId === phaseId && live.anchorDate === emitted.anchorDate
    );
  }
  return (
    live.kind === 'phase-duration' &&
    live.phaseId === phaseId &&
    live.durationDays === emitted.durationDays
  );
}

export interface RulePhaseBarProps {
  bar: RuleBar;
  pinned: boolean;
  /** The positioned track element — the % coordinate space a drag reads against. */
  trackRef: RefObject<HTMLElement | null>;
  /** x% → the epoch day it names, in the Rule's committed scale (the parent
   *  holds the scale; the bar never sees it). */
  xToDay: (xPct: number) => number;
  /** The scale's padded epoch domain — the slider's announced range AND the
   *  clamp every staged value passes through. */
  domainMinEpoch: number;
  domainMaxEpoch: number;
  /** The ONE pending ripple session, verbatim. The bar decides for itself
   *  whether it is the session's author — see `barOwnsSession`. */
  session: RippleSession | null;
  /** The LIFTED ownership + staged store, keyed by phase id. It lives in
   *  ScheduleRule so a pin remount can't wipe it mid-edit; this component holds
   *  no memory of its own. */
  getBarEdit: (phaseId: string) => BarEditState | null;
  setBarEdit: (phaseId: string, next: BarEditState | null) => void;
  /** Hands the slider element up so the Rule can focus this bar when the Spine
   *  arms an edit ("Edit dates" → the instrument). */
  registerRoot?: (el: HTMLDivElement | null) => void;
  /** The drafting strip places each bar inside its own LANE, so it supplies the
   *  geometry rather than letting the bar pick between the two single-track
   *  bands. Omitted ⇒ the compact rule's own pinned/resting geometry. */
  laneGeometry?: { top: number; height: number; tipTop: number; modeTop: number };
  /** The ENGAGED bar — the one the strip's header line speaks for. It wears the
   *  deck's live-bar treatment (a solid clay fill inside an aged-oak edge)
   *  instead of the faint standing underlay every other bar carries. */
  emphasis?: boolean;
  /** Override `barCanResize`. The strip passes `true`: a lane per phase means
   *  every bar owns its own right edge, so no boundary handle shares it and the
   *  internal-boundary constraint that gated resizing on the single track does
   *  not apply. (The locked-downstream rule is untouched — a resize still emits
   *  `phase-duration` and `anchorViolation` still governs the commit.) */
  resizable?: boolean;
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
  domainMinEpoch,
  domainMaxEpoch,
  session,
  getBarEdit,
  setBarEdit,
  registerRoot,
  laneGeometry,
  emphasis = false,
  resizable,
  onMoveBegin,
  onMoveFrame,
  onResizeBegin,
  onResizeFrame,
}: RulePhaseBarProps) {
  const drag = useRef({ down: false, begun: false, mode: 'move' as BarMode, startX: 0, grabOffsetDays: 0 });
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<BarMode>('move');
  const [focused, setFocused] = useState(false);

  const canResize = resizable ?? barCanResize(bar);
  const effectiveMode: BarMode = mode === 'resize' && !canResize ? 'move' : mode;

  // Ownership and the staged value both come from the lifted store — a fresh
  // instance after the pin remount picks the edit up exactly where the previous
  // one left it, because neither ever lived here.
  const entry = getBarEdit(bar.id);
  const owned = barOwnsSession(session, bar.id, entry?.emitted);

  // The value a nudge counts from and the label announces: the staged one only
  // while this bar owns the live session, the committed one the instant it
  // doesn't (a commit, an Esc revert, or any other surface taking over).
  const committed: BarValue = { startEpoch: bar.startEpoch, durationDays: bar.durationDays };
  const value: BarValue = owned && entry != null ? entry.staged : committed;

  // The inline readout: live through a pointer drag, and equally through the
  // keyboard's staged edit, so a sighted keyboard user reads the same dates a
  // dragging one does.
  const previewing = dragging || owned;

  const emitMove = (startEpoch: number) => {
    const anchorDate = isoFromEpochDay(startEpoch);
    if (anchorDate == null) return; // unreachable for a finite epoch day
    if (owned) onMoveFrame(startEpoch);
    else onMoveBegin(startEpoch);
    setBarEdit(bar.id, {
      emitted: { kind: 'phase-anchor', anchorDate },
      // Only ONE edit is ever pending, so staging an anchor drops any pending
      // duration edit — the untouched dimension re-reads COMMITTED.
      staged: { startEpoch, durationDays: committed.durationDays },
    });
  };

  const emitResize = (durationDays: number) => {
    if (owned) onResizeFrame(durationDays);
    else onResizeBegin(durationDays);
    setBarEdit(bar.id, {
      emitted: { kind: 'phase-duration', durationDays },
      staged: { startEpoch: committed.startEpoch, durationDays },
    });
  };

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

    if (!drag.current.begun) {
      if (Math.abs(e.clientX - drag.current.startX) < DRAG_THRESHOLD_PX) return;
      drag.current.begun = true;
      setDragging(true);
      // The offset the pointer holds INTO the bar — the same subtraction that
      // later yields the new start, so a grab in the bar's middle moves by the
      // distance dragged rather than snapping the start onto the cursor.
      drag.current.grabOffsetDays = barMoveStartEpoch(bar.startEpoch, day);
    }

    if (drag.current.mode === 'resize') {
      emitResize(boundaryDurationDays(bar.startEpoch, day));
      return;
    }
    // `day` is already domain-clamped by xToEpochDay; the grab-offset
    // subtraction can carry the START back outside it, so clamp again.
    emitMove(clampBarEpochDay(barMoveStartEpoch(drag.current.grabOffsetDays, day), domainMinEpoch, domainMaxEpoch));
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current.down) return;
    drag.current.down = false;
    drag.current.begun = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    // Session PERSISTS — the confirm strip commits or reverts it.
  };

  const nudge = (deltaDays: number) => {
    if (effectiveMode === 'resize') {
      // The nudged END — clamped to the domain, then run through the SAME ≥1
      // clamp a boundary drag applies.
      const end = clampBarEpochDay(
        barNudgeEpochDay(bar.startEpoch, value.durationDays + deltaDays),
        domainMinEpoch,
        domainMaxEpoch,
      );
      emitResize(boundaryDurationDays(bar.startEpoch, end));
      return;
    }
    emitMove(clampBarEpochDay(barNudgeEpochDay(value.startEpoch, deltaDays), domainMinEpoch, domainMaxEpoch));
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
  const g =
    laneGeometry ??
    (pinned
      ? { top: 4, height: 12, tipTop: 0, modeTop: 0 }
      : { top: 62, height: 16, tipTop: 44, modeTop: 80 });
  // In a lane the two labels share one narrow band, so the drag readout takes
  // precedence over the mode label; on the single track their tops differ and
  // both can show as before.
  const modeLabelVisible = focused && (laneGeometry == null || !previewing);

  const startIso = isoFromEpochDay(value.startEpoch);
  const endIso = isoFromEpochDay(barNudgeEpochDay(value.startEpoch, value.durationDays));

  const resizing = effectiveMode === 'resize';
  const valueText = `${bar.name}: starts ${startIso ? fmtDay(startIso) : '—'}, ${
    value.durationDays
  } days — ${resizing ? 'RESIZE' : 'MOVE'} mode`;

  return (
    <>
      {/* the bar body — move gesture + the keyboard slider. z-[1]: above the
          decorative track, BELOW the boundary handles (z-[2]) and diamonds
          (z-[3]) so both stay grabbable where they overlap a bar. */}
      <div
        ref={registerRoot}
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuemin={resizing ? 1 : domainMinEpoch}
        aria-valuemax={resizing ? barMoveStartEpoch(domainMinEpoch, domainMaxEpoch) : domainMaxEpoch}
        aria-valuenow={resizing ? value.durationDays : value.startEpoch}
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
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        {/* PERMANENT clay fill — the bar is a standing mark, never a hover
            reveal (R102). The engaged bar reads solid inside an aged-oak edge
            (the deck's live bar); the rest stay a faint underlay. */}
        <span
          className="absolute inset-0"
          style={
            emphasis
              ? { background: 'var(--color-clay)', border: '1px solid var(--color-aged-oak)' }
              : { background: 'var(--color-clay)', opacity: 0.18 }
          }
        />

        {!pinned && modeLabelVisible && (
          <span
            className="absolute whitespace-nowrap font-mono text-[0.54rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]"
            style={{ left: 0, top: g.modeTop - g.top }}
          >
            {resizing ? 'Resize' : 'Move'}
          </span>
        )}

        {!pinned && previewing && startIso && endIso && (
          <span
            className="absolute whitespace-nowrap font-mono text-[0.54rem] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]"
            style={{ left: 0, top: g.tipTop - g.top }}
          >
            {fmtDay(startIso)} — {fmtDay(endIso)} · {value.durationDays}d
          </span>
        )}
      </div>

      {/* PERMANENT 2px charcoal grip on an end this bar owns — a sibling, not a
          child, so its press never doubles as a body (move) press. Where the end
          carries a LOCKED boundary handle the grip is pixel-coincident with, and
          hit-tested under, that handle (z-[2]) — so a pointer drag there still
          meets the handle's refusal and the keyboard stays the way through. */}
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
