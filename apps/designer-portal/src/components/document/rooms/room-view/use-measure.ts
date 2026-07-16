'use client';

/**
 * useMeasure — the two-point measure tool's state machine + screen→feet
 * coordinate math (Room View program, W2-T4; package accept 2.3: "click
 * twice → dashed line + feet-and-inches label; clearable; distance within 1″
 * of geometry truth at any zoom").
 *
 * Four phases, one direction at a time:
 *   idle → armed ("Measure" clicked) → point (first click placed) → complete
 *   (second click placed — line + label). `clear()` and Escape both return
 *   to idle; calling `arm()` from ANY phase (including complete) jumps
 *   straight to armed, discarding whatever was there — "re-arming clears
 *   prior". A stray stage click while idle or complete is a no-op: only the
 *   toolrow's Measure button (arm) or Clear/Escape change phase then.
 *
 * Coordinate math is ported from the design authority's `svgPoint()`
 * (docs/design/the-document/room-view-prototype.html): a pointer event's
 * CLIENT (screen) coordinates go through the target SVG's own
 * `getScreenCTM()` inverse — the only correct way to undo CSS scale,
 * container width, and devicePixelRatio in ONE step — before landing in the
 * same feet-space every plan primitive is drawn in (subtract PAD, divide by
 * SCALE — the inverse of plan-stage.tsx's `px()`). Never derive feet from
 * clientX/clientY and a getBoundingClientRect() ratio: that drifts under
 * zoom because it assumes the CSS box and the SVG viewBox scale identically,
 * which getScreenCTM() guarantees and a manual ratio does not.
 *
 * Distance is `dist()` — geometry.ts's Math.hypot in FEET, the same
 * function every wall-length hover tip already resolves through. Rounding
 * to the nearest inch happens ONLY at display time, via `ftIn()` — the
 * measure state itself always carries the exact float.
 */

import { useCallback, useEffect, useReducer } from 'react';
import { dist, type Pt } from '@/lib/room-view/geometry';
import { PLAN_STAGE_PAD, PLAN_STAGE_SCALE } from './plan-stage';

// ————————————————————————————————————————————————————————————————
// State machine (pure — testable without React)
// ————————————————————————————————————————————————————————————————

export type MeasureState =
  | { phase: 'idle' }
  | { phase: 'armed' }
  | { phase: 'point'; a: Pt }
  | { phase: 'complete'; a: Pt; b: Pt; distanceFt: number };

export type MeasureAction = { type: 'arm' } | { type: 'point'; point: Pt } | { type: 'reset' };

export const MEASURE_IDLE: MeasureState = { phase: 'idle' };

export function measureReducer(state: MeasureState, action: MeasureAction): MeasureState {
  switch (action.type) {
    case 'arm':
      // Re-arming clears prior: ANY phase → armed, discarding points/line.
      return { phase: 'armed' };

    case 'reset':
      return MEASURE_IDLE;

    case 'point':
      if (state.phase === 'armed') return { phase: 'point', a: action.point };
      if (state.phase === 'point') {
        return {
          phase: 'complete',
          a: state.a,
          b: action.point,
          distanceFt: dist(state.a.x, state.a.z, action.point.x, action.point.z),
        };
      }
      return state; // idle/complete — stray click, ignored

    default:
      return state;
  }
}

// ————————————————————————————————————————————————————————————————
// Screen → feet coordinate math
// ————————————————————————————————————————————————————————————————

/**
 * Converts a pointer/mouse event's CLIENT (screen) coordinates into FEET in
 * the room's coordinate space, via the target SVG's own screen CTM — ported
 * from the prototype's `svgPoint()`. `scale`/`pad` must match whatever
 * transform positioned the primitives being measured against
 * (PLAN_STAGE_SCALE/PLAN_STAGE_PAD in production; overridable for tests).
 * Returns null only when the SVG has no CTM yet (unmounted / zero-size) —
 * callers should treat that as "ignore this click" rather than fabricate a
 * point.
 */
export function screenPointToFeet(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  scale: number = PLAN_STAGE_SCALE,
  pad: number = PLAN_STAGE_PAD,
): Pt | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const userPt = pt.matrixTransform(ctm.inverse());
  return { x: (userPt.x - pad) / scale, z: (userPt.y - pad) / scale };
}

// ————————————————————————————————————————————————————————————————
// Hook
// ————————————————————————————————————————————————————————————————

export interface UseMeasureResult {
  state: MeasureState;
  /** Arms (idle→armed) or re-arms (any other phase→armed, clearing prior). */
  arm: () => void;
  /** Registers a click's screen coordinates as the next point. No-op unless
   *  armed or mid-first-point. */
  addPoint: (svg: SVGSVGElement, clientX: number, clientY: number) => void;
  /** Returns to idle, discarding any in-progress or completed measurement. */
  clear: () => void;
}

export function useMeasure(): UseMeasureResult {
  const [state, dispatch] = useReducer(measureReducer, MEASURE_IDLE);

  const arm = useCallback(() => dispatch({ type: 'arm' }), []);
  const clear = useCallback(() => dispatch({ type: 'reset' }), []);
  const addPoint = useCallback((svg: SVGSVGElement, clientX: number, clientY: number) => {
    const point = screenPointToFeet(svg, clientX, clientY);
    if (point) dispatch({ type: 'point', point });
  }, []);

  // Escape cancels — armed/point/complete all collapse to idle. The
  // listener only lives while there's something to cancel, and it listens
  // in the CAPTURE phase + stopPropagation — RoomShell has its own bubble-
  // phase window Escape listener that leaves the room entirely ("Esc leaves
  // the Room — but only after deeper overlays... stop the event in the
  // capture / document phase first", room-shell.tsx), and this tool is
  // exactly that kind of deeper overlay: without capture + stopPropagation,
  // Escape while armed would BOTH cancel the measurement AND navigate away
  // from the room, since both listeners sit on `window` for the same event.
  useEffect(() => {
    if (state.phase === 'idle') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dispatch({ type: 'reset' });
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [state.phase]);

  return { state, arm, addPoint, clear };
}
