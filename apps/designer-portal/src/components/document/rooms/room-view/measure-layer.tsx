'use client';

/**
 * MeasureLayer — SVG content for PlanStage's `measureLayer` seam (Room View
 * program, W2-T4). Renders inside plan-stage's `<g data-measure-layer-seam>`
 * — the SAME viewBox and feet→px transform (PLAN_STAGE_SCALE/PLAN_STAGE_PAD)
 * every base primitive uses — so a measured point lands exactly where the
 * pointer clicked.
 *
 * Look/feel authority: room-view-prototype.html's `.measureline` (dashed
 * stroke) and the endpoint dot drawn on every click (`r:3.4`, ink fill).
 * The label deliberately does NOT reuse the prototype's plain `.measurelabel`
 * text — the task ruling is an ink CHIP "like the dimchip family" (PlanStage's
 * existing hover dimchip: ink background, off-white mono text, rounded 3px).
 * A `<foreignObject>` carries that HTML chip inside the SVG so it gets real
 * box padding/auto-width instead of hand-measured SVG text.
 *
 * Pointer-events isolation (package accept 2.3, "armed-mode clicks don't
 * fight hover targets"): while capturing (armed/point), a transparent rect
 * covering the full viewBox is the LAST child painted into the stage's
 * `<svg>` (plan-stage.tsx renders `measureLayer` after the primitives), so
 * SVG hit-testing gives it every pointer event before it reaches a wall/ghost
 * underneath. That single rect does two jobs at once: it swallows clicks
 * (routing them to `onPoint` instead of a primitive's hitHandlers) AND it
 * swallows hover (a primitive's `onMouseMove` — which is what raises
 * PlanStage's dimchip — never fires, because the rect occludes it). No
 * explicit "suppress hover chips" branch is needed anywhere else; it falls
 * out of SVG paint order. The rect is removed once complete, so ordinary
 * hover resumes alongside the now-visible measurement.
 */

import type { MouseEvent as ReactMouseEvent } from 'react';
import { ftIn, type Pt } from '@/lib/room-view/geometry';
import { PLAN_STAGE_PAD, PLAN_STAGE_SCALE } from './plan-stage';
import type { MeasureState } from './use-measure';

export interface MeasureLayerProps {
  state: MeasureState;
  viewBoxWidth: number;
  viewBoxHeight: number;
  onPoint: (svg: SVGSVGElement, clientX: number, clientY: number) => void;
}

function px(ft: number): number {
  return ft * PLAN_STAGE_SCALE + PLAN_STAGE_PAD;
}

export function MeasureLayer({ state, viewBoxWidth, viewBoxHeight, onPoint }: MeasureLayerProps) {
  if (state.phase === 'idle') return null;

  const capturing = state.phase === 'armed' || state.phase === 'point';

  const handleClick = (e: ReactMouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (svg) onPoint(svg, e.clientX, e.clientY);
  };

  return (
    <>
      {capturing && (
        <rect
          x={0}
          y={0}
          width={viewBoxWidth}
          height={viewBoxHeight}
          fill="transparent"
          className="cursor-crosshair"
          onClick={handleClick}
        />
      )}

      {state.phase === 'point' && <EndpointDot p={state.a} />}

      {state.phase === 'complete' && (
        <>
          <line
            x1={px(state.a.x)}
            y1={px(state.a.z)}
            x2={px(state.b.x)}
            y2={px(state.b.z)}
            stroke="var(--color-charcoal)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
          />
          <EndpointDot p={state.a} />
          <EndpointDot p={state.b} />
          <MeasureChip a={state.a} b={state.b} distanceFt={state.distanceFt} />
        </>
      )}
    </>
  );
}

function EndpointDot({ p }: { p: Pt }) {
  return <circle cx={px(p.x)} cy={px(p.z)} r={3.4} fill="var(--color-charcoal)" />;
}

/** The measurement label, positioned at the segment's midpoint like the
 *  prototype's `.measurelabel` — an ink chip (dimchip family) rather than
 *  bare text, carried in a `<foreignObject>` for real box sizing. */
function MeasureChip({ a, b, distanceFt }: { a: Pt; b: Pt; distanceFt: number }) {
  const midX = (px(a.x) + px(b.x)) / 2;
  const midY = (px(a.z) + px(b.z)) / 2;

  return (
    <foreignObject x={midX + 8} y={midY - 22} width={130} height={28} style={{ overflow: 'visible' }}>
      {/* React resets the DOM namespace to HTML for foreignObject children
       *  (it special-cases this in its namespace-propagation logic), so this
       *  div is created via createElement, not createElementNS — no xmlns
       *  attribute needed or accepted on React's HTMLDivElement typing. */}
      <div className="pointer-events-none inline-block whitespace-nowrap rounded-[3px] bg-[var(--color-charcoal)] px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-[var(--color-off-white)]">
        {ftIn(distanceFt)}
      </div>
    </foreignObject>
  );
}
