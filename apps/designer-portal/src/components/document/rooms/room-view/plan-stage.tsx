'use client';

/**
 * PlanStage — the interactive Plan projection (Room View program, W2-T3;
 * R107 §3/§4). Materializes `planPrimitives(geometry)` into SVG inside a
 * viewBox owned by ONE feet→px transform (`px`, SCALE≈28px/ft + PAD) — this
 * component draws exactly what plan-primitives.ts computes and never does
 * its own geometry math beyond that single transform.
 *
 * Look/feel authority: docs/design/the-document/room-view-prototype.html
 * scene 02's `drawPlan` (L406–458) — double-line walls (lighter+dashed when
 * low-confidence, I73a), window triple-lines, a door leaf with an arc ONLY
 * when the primitive carries one (I73b), a plain gap for pass-through
 * openings, rotated furniture ghosts with their category label, two quiet
 * overall dimension labels. Ported as intent (ROUTE: feet-space primitives →
 * one transform → SVG), not as literal markup.
 *
 * Hover: every primitive with a `.tip` (wallStrip, windowClear, doorClear,
 * openingClear, ghostObject) is a focusable hit area — pointer AND keyboard
 * (tabIndex + aria-label = the tip) — showing one `.dimchip` positioned
 * near the cursor (pointer) or the element (focus), matching the
 * prototype's single ink chip.
 *
 * `measureLayer` is a marked seam for the two-point measure tool (a sibling
 * task) — an extra SVG layer drawn above the base primitives, in the same
 * viewBox/transform. No dead UI ships here: no Measure button, no toolrow.
 */

import { useCallback, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { overallDims, type OrientedRect, type RoomGeometry } from '@/lib/room-view/geometry';
import { planPrimitives, type PlanPrimitive } from '@/lib/room-view/plan-primitives';

/** stagecap's default right-hand copy — overridden while the measure tool is armed. */
const DEFAULT_STAGE_CAP_RIGHT = 'hover for dimensions';

/** px per foot — matches the prototype's SCALE exactly. */
const SCALE = 28;
/** svg padding, px — matches the prototype's PAD exactly (applied on all
 *  four sides here, for a viewBox that generalizes to any room's aspect
 *  ratio; the prototype hand-tuned an asymmetric 640×480 for its one fixture
 *  room — see the task report for this deviation). */
const PAD = 54;

export interface PlanStageProps {
  geometry: RoomGeometry;
  /** Measure-tool seam (a sibling task mounts the two-point measure overlay
   *  here) — rendered as an extra SVG layer above the base primitives. */
  measureLayer?: ReactNode;
  /** stagecap's right-hand copy — the measure tool swaps this to "click two
   *  points" while armed; defaults to "hover for dimensions". */
  stageCapRight?: string;
}

interface DimChipState {
  text: string;
  x: number;
  y: number;
}

export function PlanStage({ geometry, measureLayer, stageCapRight = DEFAULT_STAGE_CAP_RIGHT }: PlanStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<DimChipState | null>(null);

  const primitives = planPrimitives(geometry);
  const { w: roomW, d: roomD } = overallDims(geometry);
  const px = useCallback((ft: number) => ft * SCALE + PAD, []);
  const viewBoxW = Math.max(1, roomW * SCALE + PAD * 2);
  const viewBoxH = Math.max(1, roomD * SCALE + PAD * 2);

  const showChipAtPointer = useCallback(
    (tip: string) => (e: MouseEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      setChip({ text: tip, x: e.clientX - r.left + 14, y: e.clientY - r.top - 8 });
    },
    [],
  );

  const showChipAtElement = useCallback(
    (tip: string) => (e: FocusEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wrapRect = wrap.getBoundingClientRect();
      const elRect = e.currentTarget.getBoundingClientRect();
      setChip({
        text: tip,
        x: elRect.left - wrapRect.left + elRect.width / 2,
        y: elRect.top - wrapRect.top - 8,
      });
    },
    [],
  );

  const hideChip = useCallback(() => setChip(null), []);

  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)]">
      <div ref={wrapRef} className="relative">
        <svg viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} className="block h-auto w-full" role="img" aria-label="Room plan">
          {primitives.map((p, i) => (
            <PrimitiveShape
              // Fixed, deterministic order from planPrimitives() — index is a stable key.
              key={i}
              p={p}
              px={px}
              onHover={showChipAtPointer}
              onFocusShow={showChipAtElement}
              onHide={hideChip}
            />
          ))}
          {measureLayer && <g data-measure-layer-seam="">{measureLayer}</g>}
        </svg>
        {chip && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[3px] bg-[var(--color-charcoal)] px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-[var(--color-off-white)]"
            style={{ left: chip.x, top: chip.y }}
          >
            {chip.text}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--doc-ink-border)] px-3.5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        <span>Plan · drawn from the scan</span>
        <span>{stageCapRight}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-primitive shapes
// ═══════════════════════════════════════════════════════════════════════════

interface RectAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  transform: string;
}

/** A rotated rect centered at its OrientedRect's (cx,cz), sized w×d feet,
 *  drawn by translating to the center in px then rotating — the standard
 *  technique for rotate-about-center without recomputing corner points. */
function rectAttrs(rect: OrientedRect, px: (ft: number) => number): RectAttrs {
  const w = rect.w * SCALE;
  const d = rect.d * SCALE;
  return {
    x: -w / 2,
    y: -d / 2,
    width: w,
    height: d,
    transform: `translate(${px(rect.cx)} ${px(rect.cz)}) rotate(${rect.angleDeg})`,
  };
}

interface HitHandlers {
  tabIndex: 0;
  role: 'img';
  'aria-label': string;
  onMouseMove: (e: MouseEvent) => void;
  onMouseLeave: () => void;
  onFocus: (e: FocusEvent) => void;
  onBlur: () => void;
  className: string;
}

function hitHandlers(
  tip: string,
  onHover: (tip: string) => (e: MouseEvent) => void,
  onFocusShow: (tip: string) => (e: FocusEvent) => void,
  onHide: () => void,
): HitHandlers {
  return {
    tabIndex: 0,
    role: 'img',
    'aria-label': tip,
    onMouseMove: onHover(tip),
    onMouseLeave: onHide,
    onFocus: onFocusShow(tip),
    onBlur: onHide,
    className:
      'cursor-crosshair outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-clay)]',
  };
}

interface ShapeProps {
  p: PlanPrimitive;
  px: (ft: number) => number;
  onHover: (tip: string) => (e: MouseEvent) => void;
  onFocusShow: (tip: string) => (e: FocusEvent) => void;
  onHide: () => void;
}

function PrimitiveShape({ p, px, onHover, onFocusShow, onHide }: ShapeProps) {
  switch (p.kind) {
    case 'floor': {
      const points = p.points.map((pt) => `${px(pt.x)},${px(pt.z)}`).join(' ');
      return <polygon points={points} fill="var(--color-aged-oak)" fillOpacity={0.035} />;
    }

    case 'wallStrip': {
      const attrs = rectAttrs(p.rect, px);
      return (
        <g {...hitHandlers(p.tip, onHover, onFocusShow, onHide)}>
          <rect {...attrs} rx={1} fill="var(--color-aged-oak)" fillOpacity={p.lowConf ? 0.38 : 0.9} />
          {p.lowConf && (
            <rect
              x={attrs.x + 1}
              y={attrs.y + 1}
              width={Math.max(0, attrs.width - 2)}
              height={Math.max(0, attrs.height - 2)}
              transform={attrs.transform}
              fill="none"
              stroke="var(--color-aged-oak)"
              strokeWidth={1.2}
              strokeDasharray="6 4"
              strokeOpacity={0.6}
            />
          )}
        </g>
      );
    }

    case 'windowClear': {
      const attrs = rectAttrs(p.rect, px);
      return <rect {...attrs} fill="var(--doc-sheet-front)" {...hitHandlers(p.tip, onHover, onFocusShow, onHide)} />;
    }

    case 'windowLines': {
      return (
        <>
          {p.lines.map((seg, i) => (
            <line
              key={i}
              x1={px(seg.x1)}
              y1={px(seg.z1)}
              x2={px(seg.x2)}
              y2={px(seg.z2)}
              stroke="var(--color-aged-oak)"
              strokeWidth={1.2}
            />
          ))}
        </>
      );
    }

    case 'doorClear': {
      const attrs = rectAttrs(p.rect, px);
      return <rect {...attrs} fill="var(--doc-sheet-front)" {...hitHandlers(p.tip, onHover, onFocusShow, onHide)} />;
    }

    case 'doorLeaf': {
      return (
        <line
          x1={px(p.line.x1)}
          y1={px(p.line.z1)}
          x2={px(p.line.x2)}
          y2={px(p.line.z2)}
          stroke="var(--color-aged-oak)"
          strokeWidth={1.2}
        />
      );
    }

    case 'doorSwingArc': {
      const r = p.radius * SCALE;
      const d = `M ${px(p.start.x)} ${px(p.start.z)} A ${r} ${r} 0 ${p.largeArcFlag} ${p.sweepFlag} ${px(p.end.x)} ${px(p.end.z)}`;
      return <path d={d} fill="none" stroke="var(--color-aged-oak)" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} />;
    }

    case 'openingClear': {
      const attrs = rectAttrs(p.rect, px);
      return <rect {...attrs} fill="var(--doc-sheet-front)" {...hitHandlers(p.tip, onHover, onFocusShow, onHide)} />;
    }

    case 'ghostObject': {
      const attrs = rectAttrs(p.rect, px);
      return (
        <g {...hitHandlers(p.tip, onHover, onFocusShow, onHide)}>
          <rect
            {...attrs}
            rx={3}
            fill="var(--color-aged-oak)"
            fillOpacity={p.lowConf ? 0.035 : 0.07}
            stroke="var(--color-aged-oak)"
            strokeOpacity={p.lowConf ? 0.3 : 0.55}
            strokeWidth={1.1}
            strokeDasharray={p.lowConf ? '4 3' : undefined}
          />
          <text
            x={px(p.labelAnchor.x)}
            y={px(p.labelAnchor.z) + 3}
            textAnchor="middle"
            className="pointer-events-none select-none font-mono uppercase"
            style={{ fontSize: 9, letterSpacing: '0.12em', fill: 'var(--color-aged-oak)', opacity: 0.75 }}
          >
            {p.cat}
          </text>
        </g>
      );
    }

    case 'dimLabel': {
      const x = px(p.x);
      const z = px(p.z);
      const transform = p.angleDeg !== 0 ? `rotate(${p.angleDeg} ${x} ${z})` : undefined;
      return (
        <text
          x={x}
          y={z}
          transform={transform}
          textAnchor="middle"
          className="pointer-events-none select-none font-mono"
          style={{ fontSize: 11, letterSpacing: '0.05em', fill: 'var(--color-charcoal)', opacity: 0.55 }}
        >
          {p.text}
        </text>
      );
    }

    default:
      return null;
  }
}

/** The stage's feet→px transform (SCALE px/ft, PAD px on all sides) — exported
 *  so a sibling measure-tool task can convert its own click points through the
 *  identical convention rather than re-deriving it. */
export { SCALE as PLAN_STAGE_SCALE, PAD as PLAN_STAGE_PAD };

/** The stage's viewBox size in px, from the SAME geometry→dims→SCALE/PAD
 *  formula the component uses internally — exported so the measure tool's
 *  pointer-events-isolation catcher (a sibling task) can size itself to
 *  cover exactly the visible stage without duplicating this arithmetic. */
export function planViewBox(geometry: RoomGeometry): { width: number; height: number } {
  const { w, d } = overallDims(geometry);
  return { width: Math.max(1, w * SCALE + PAD * 2), height: Math.max(1, d * SCALE + PAD * 2) };
}
