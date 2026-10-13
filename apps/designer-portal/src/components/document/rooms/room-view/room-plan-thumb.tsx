/**
 * RoomPlanThumb — the plate in a room Card's plate slot (US-28 S10a; uplift.md
 * (c) area 3; A10 plate and caption). The plate is a mat edged in 1px
 * --card-edge (`.plate`, the S1 block): no dashed box, no fill, one edge.
 *
 * Drawn: a pure, stroke-only sketch of the room's real geometry, the wall
 * outline plus window ticks, in ink.
 * Undrawn: the A10 silhouette, a faint outline in the room's proportions with
 * a door swing and two hatch lines. The plate carries no word; the Card's
 * caption prints the ink word AWAITING DRAWING beside it, so the state never
 * rests on the drawing alone.
 *
 * Deliberately NOT drawn on a drawn plate:
 *   - doors / openings — no gap, no leaf, no arc;
 *   - detected furniture ghosts — real geometry carries `rotationDeg`, and the
 *     thumbnail has no rotated-ghost convention; walls only;
 *   - dimension labels, hover tips, low-confidence dashing — Plan concerns.
 *
 * This component owns the single feet -> pixel transform (a fixed 300x200
 * viewBox, the plate's 3:2) — planPrimitives/geometry.ts never touch pixels.
 */

import { planPrimitives, type PlanPrimitive } from '@/lib/room-view/plan-primitives';
import { overallDims, type RoomGeometry } from '@/lib/room-view/geometry';

const VIEW_W = 300;
const VIEW_H = 200;
const PAD = 22;

export function RoomPlanThumb({
  geometry,
  dims = null,
  label,
}: {
  geometry: RoomGeometry | null;
  /** The scan's overall size in feet, for the undrawn silhouette's proportions. */
  dims?: { w: number; d: number } | null;
  /** What the plate shows, for assistive technology. */
  label: string;
}) {
  if (!geometry) {
    return (
      <span
        className="plate"
        role="img"
        aria-label={label}
        data-testid="room-plan-thumb-placeholder"
      >
        <Silhouette dims={dims} />
      </span>
    );
  }

  const { w, d } = overallDims(geometry);
  const { scale, offsetX, offsetY } = fit(w, d);
  const px = (x: number) => x * scale + offsetX;
  const pz = (z: number) => z * scale + offsetY;

  const primitives = planPrimitives(geometry, { hideObjects: true });

  return (
    <span className="plate" role="img" aria-label={label} data-testid="room-plan-thumb">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" focusable="false">
        {/* Wall strips, stroke-only. Each wall keeps its own opacity so a
            low-confidence run stays honest (I73a) at thumbnail scale. */}
        {primitives.filter(isWallStrip).map((wall) => (
          <polygon
            key={`wall-${wall.wallIndex}`}
            points={rectPoints(wall.rect, px, pz)}
            className="room-pl-wall"
            opacity={wall.lowConf ? 0.5 : 1}
          />
        ))}

        {/* Window ticks — the full Plan's glass motif, in this transform. */}
        {primitives.filter(isWindowLines).flatMap((win) =>
          win.lines.map((seg, i) => (
            <line
              key={`win-${win.windowIndex}-${i}`}
              x1={px(seg.x1)}
              y1={pz(seg.z1)}
              x2={px(seg.x2)}
              y2={pz(seg.z2)}
              className="room-pl-thin"
            />
          )),
        )}
      </svg>
    </span>
  );
}

/** The A10 silhouette: the room's proportions when the scan has them, a
 *  quiet 3:4 room when it does not. Never a dimension, never a word. */
function Silhouette({ dims }: { dims: { w: number; d: number } | null }) {
  const w = dims && dims.w > 0 ? dims.w : 3;
  const d = dims && dims.d > 0 ? dims.d : 4;
  const { scale, offsetX, offsetY } = fit(w, d);
  const x0 = offsetX;
  const z0 = offsetY;
  const x1 = x0 + w * scale;
  const z1 = z0 + d * scale;
  const door = Math.min(x1 - x0, z1 - z0) * 0.27;
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" focusable="false">
      <path className="room-pl-sil" d={`M${x0} ${z0}H${x1}V${z1}H${x0}Z`} />
      <path className="room-pl-sil" d={`M${x1 - door - 6} ${z1}a${door} ${door} 0 0 1 ${door} ${-door}`} />
      <path
        className="room-pl-hatch"
        d={`M${x0 + 8} ${z0 + 10}h${(x1 - x0) * 0.4}M${x0 + 8} ${z0 + 18}h${(x1 - x0) * 0.28}`}
      />
    </svg>
  );
}

function fit(w: number, d: number) {
  const availW = VIEW_W - PAD * 2;
  const availH = VIEW_H - PAD * 2;
  const scale = w > 0 && d > 0 ? Math.min(availW / w, availH / d) : 1;
  return {
    scale,
    offsetX: PAD + Math.max(0, (availW - w * scale) / 2),
    offsetY: PAD + Math.max(0, (availH - d * scale) / 2),
  };
}

function isWallStrip(p: PlanPrimitive): p is Extract<PlanPrimitive, { kind: 'wallStrip' }> {
  return p.kind === 'wallStrip';
}

function isWindowLines(p: PlanPrimitive): p is Extract<PlanPrimitive, { kind: 'windowLines' }> {
  return p.kind === 'windowLines';
}

function rectPoints(
  rect: { cx: number; cz: number; w: number; d: number; angleDeg: number },
  px: (x: number) => number,
  pz: (z: number) => number,
): string {
  const a = (rect.angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  const corner = (lx: number, lz: number) => {
    const x = rect.cx + lx * cos - lz * sin;
    const z = rect.cz + lx * sin + lz * cos;
    return `${px(x)},${pz(z)}`;
  };
  return [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)].join(' ');
}
