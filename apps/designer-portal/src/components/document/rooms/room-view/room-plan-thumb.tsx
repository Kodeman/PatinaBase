/**
 * RoomPlanThumb — the roster card's mini-plan (R107 §1, prototype scene 01's
 * `.mini`). A pure, stroke-only sketch of the room's real geometry: the wall
 * outline plus window ticks, quiet enough to sit inside a card without
 * competing with the client's name.
 *
 * Deliberately NOT drawn here (confirmed against scene 01 — every one of its
 * four roster minis renders a plain closed outline, no door gap, no swing,
 * even though every room in the mock clearly has a door):
 *   - doors / openings — no gap, no leaf, no arc;
 *   - detected furniture ghosts — three of the four prototype minis DO sketch
 *     unlabeled furniture silhouettes, but always axis-aligned. Real geometry
 *     carries `rotationDeg` (RoomPlan oriented boxes — confirmed non-zero on
 *     the seeded exemplar scan's chairs), and the prototype's simplified mini
 *     treatment has no rotated-ghost convention to port. Skipping ghosts here
 *     is a documented judgment call, not an oversight — see the roster's
 *     handoff notes ("thumbnails skip ghosts entirely — wall-only").
 *   - dimension labels, hover tips, low-confidence dashing — all facts-rail /
 *     interactive-Plan concerns (Phase 2.2), not this quiet index thumbnail.
 *
 * This component owns the single feet -> pixel transform (a fixed 190x140
 * viewBox, matching the prototype's mini exactly) — planPrimitives/geometry.ts
 * never touch pixels, per their module contracts.
 */

import { planPrimitives, type PlanPrimitive } from '@/lib/room-view/plan-primitives';
import { overallDims, type RoomGeometry } from '@/lib/room-view/geometry';

const VIEW_W = 190;
const VIEW_H = 140;
const PAD = 16;

export function RoomPlanThumb({ geometry }: { geometry: RoomGeometry | null }) {
  if (!geometry) {
    return (
      <div
        className="flex aspect-[19/14] w-full items-center justify-center rounded-[2px] border border-dashed border-[var(--doc-ink-border)]"
        data-testid="room-plan-thumb-placeholder"
      >
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] opacity-60">
          Awaiting drawing
        </span>
      </div>
    );
  }

  const { w, d } = overallDims(geometry);
  const availW = VIEW_W - PAD * 2;
  const availH = VIEW_H - PAD * 2;
  const scale = w > 0 && d > 0 ? Math.min(availW / w, availH / d) : 1;
  const offsetX = PAD + Math.max(0, (availW - w * scale) / 2);
  const offsetY = PAD + Math.max(0, (availH - d * scale) / 2);
  const px = (x: number) => x * scale + offsetX;
  const pz = (z: number) => z * scale + offsetY;

  const primitives = planPrimitives(geometry, { hideObjects: true });

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="block h-auto w-full"
      role="img"
      aria-label="Room plan sketch"
    >
      {/* Wall strips, stroke-only (no fill) — the mini reads as a sketch, not
          the filled Plan. Each wall keeps its own opacity so a low-confidence
          run stays honest (I73a) even at thumbnail scale, without the dashed
          treatment (illegible this small — a quieter version of the same
          honesty signal). */}
      {primitives.filter(isWallStrip).map((wall) => (
        <polygon
          key={`wall-${wall.wallIndex}`}
          points={rectPoints(wall.rect, px, pz)}
          fill="none"
          stroke="var(--color-aged-oak)"
          strokeWidth={1.1}
          strokeLinejoin="round"
          opacity={wall.lowConf ? 0.5 : 1}
        />
      ))}

      {/* Window ticks — the same triple-line glass motif as the full Plan,
          just scaled into this transform. */}
      {primitives.filter(isWindowLines).flatMap((win) =>
        win.lines.map((seg, i) => (
          <line
            key={`win-${win.windowIndex}-${i}`}
            x1={px(seg.x1)}
            y1={pz(seg.z1)}
            x2={px(seg.x2)}
            y2={pz(seg.z2)}
            stroke="var(--color-aged-oak)"
            strokeWidth={1}
          />
        )),
      )}
    </svg>
  );
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
