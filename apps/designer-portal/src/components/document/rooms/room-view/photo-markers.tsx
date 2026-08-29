'use client';

/**
 * PhotoMarkers — the Plan's camera-tick layer (Room View PHOTOS program,
 * W2; I76 "the drawing knows where you stood"). Rendered into PlanStage's
 * `photoLayer` seam — the SAME viewBox + feet→px transform
 * (PLAN_STAGE_SCALE/PLAN_STAGE_PAD) every base primitive uses — so a camera
 * tick lands exactly where the photo was taken relative to the walls already
 * drawn.
 *
 * Paint / suppression: plan-stage.tsx paints `photoLayer` AFTER the base
 * primitives (ticks read above the walls) but BEFORE `measureLayer`. So while
 * the measure tool is capturing (armed/point), its transparent full-viewBox
 * catcher rect — the LAST child painted into the stage `<svg>` — occludes
 * every tick's hit area, and marker hover/click simply never fire. No
 * explicit "suppress while armed" branch is needed here; it falls out of SVG
 * paint order, exactly as the measure layer already suppresses primitive
 * hover chips (measure-layer.tsx's header documents the same mechanism).
 *
 * The geometry — pose projection, proximity clustering, off-plan clamping —
 * is the pure `buildPhotoMarkers` below (no React, no DOM), so the marker set
 * for a fixture is unit-testable without rendering SVG.
 *
 * Off-plan ruling (flagged for design review — see task report): a pose that
 * lands OUTSIDE the floor bbox expanded by 2 ft is CLAMPED to the floor bbox
 * edge and drawn with a distinct "off-plan" treatment (a hollow ring, no
 * heading stroke, quieter) rather than dropped. Rationale: I76's promise is
 * that the drawing knows where you stood; a photographer standing in a
 * doorway or just off the scanned floor is still meaningful, and dropping the
 * tick silently loses the link. The strip and viewer always carry every
 * photo regardless; the tick stays discoverable and honest about being
 * approximate.
 */

import { useMemo, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { RoomScanPhoto } from '@patina/supabase';
import type { RoomGeometry } from '@/lib/room-view/geometry';
import {
  clusterPoses,
  photoPlanPose,
  type PhotoProvenance,
} from '@/lib/room-view/photo-poses';
import { isBrowserDecodableMime } from './photo-viewer';
import { PLAN_STAGE_PAD, PLAN_STAGE_SCALE, planViewBox } from './plan-stage';

// ═══════════════════════════════════════════════════════════════════════════
// Pure marker model (no React / DOM — unit-tested directly)
// ═══════════════════════════════════════════════════════════════════════════

/** The minimum a photo needs to become a marker. RoomScanPhoto is a superset,
 *  so the hook's rows pass straight in; the tests construct just this.
 *
 *  The derivative-lane fields are OPTIONAL — a marker is built from a pose,
 *  and the peek image is a courtesy. A caller that knows nothing about the
 *  preview rung still produces correct markers; it just gets a peek that can
 *  only reach the thumbnail. */
export type MarkerPhoto = {
  camera_transform: number[] | null;
  captured_at: string | null;
  signedThumbUrl: string | null;
  signedImageUrl: string | null;
} & Partial<Pick<RoomScanPhoto, 'signedPreviewUrl' | 'mime_type'>>;

/** Plan-frame bounding box of the drawn floor, feet. */
export interface PlanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PhotoMarker {
  /** DISPLAY position, feet (clamped to the floor bbox when off-plan). */
  x: number;
  z: number;
  /** Representative camera height, feet (world-origin-relative — see
   *  photo-poses.ts). The Plan (2D) ignores it; the Orbit frustum layer
   *  (orbit/photo-marker-objects.ts) reads it to place the wedge apex. */
  y: number;
  /** Heading per photo-poses.ts's convention (0°=+x east, 90°=+z south, CW). */
  headingDeg: number;
  /** Members in this proximity cluster (≥1). */
  count: number;
  /** True when the representative pose fell outside the floor bbox + margin. */
  offPlan: boolean;
  /** Index (into the ORIGINAL photos array) the tick opens the viewer at. */
  representativeIndex: number;
  /** All original-photo indices in the cluster, ascending. */
  memberIndices: number[];
  /** Peek-chip sources, best-for-a-96px-chip first. `previewUrl` is the
   *  1600 px derivative; `imageUrl` is the original and may be undecodable —
   *  `mimeType` is what says so. */
  thumbUrl: string | null;
  previewUrl: string | null;
  imageUrl: string | null;
  mimeType: string | null;
  capturedAt: string | null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Floor bounding box in plan feet: the floor polygon's extent when present,
 *  else the room's overall [0,width]×[0,depth] rectangle. */
export function planBounds(geometry: RoomGeometry): PlanBounds {
  if (geometry.floor && geometry.floor.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of geometry.floor) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    if (Number.isFinite(minX)) return { minX, maxX, minZ, maxZ };
  }
  return { minX: 0, maxX: Math.max(0, geometry.width), minZ: 0, maxZ: Math.max(0, geometry.depth) };
}

export interface BuildPhotoMarkersOptions {
  clusterRadiusFt?: number;
  offPlanMarginFt?: number;
}

/**
 * Project every posed photo into the plan frame, cluster the poses by
 * proximity (earliest capture time is the cluster representative), and clamp
 * off-plan reps to the floor bbox edge. Returns `[]` when there is no
 * provenance or not a single pose resolves — the layer degrades silently.
 */
export function buildPhotoMarkers(
  photos: MarkerPhoto[],
  provenance: PhotoProvenance | null,
  bounds: PlanBounds,
  opts: BuildPhotoMarkersOptions = {},
): PhotoMarker[] {
  if (!provenance) return [];
  const clusterRadiusFt = opts.clusterRadiusFt ?? 1.5;
  const margin = opts.offPlanMarginFt ?? 2;

  const resolvable = photos.flatMap((photo, photoIndex) => {
    const t = photo.camera_transform;
    if (!Array.isArray(t)) return [];
    const pose = photoPlanPose(t, provenance);
    if (!pose) return [];
    return [{ photoIndex, pose, photo }];
  });
  if (resolvable.length === 0) return [];

  // Cluster on the true (unclamped) plan XZ; rank "earliest first" by capture
  // time so the representative is the first photo taken from that spot.
  const clusters = clusterPoses(
    resolvable.map((r) => r.pose),
    clusterRadiusFt,
    (_pose, idx) => resolvable[idx].photo.captured_at ?? '',
  );

  return clusters.map((cluster) => {
    const rep = resolvable[cluster.representativeIndex];
    const { x: rawX, z: rawZ } = rep.pose;
    const offPlan =
      rawX < bounds.minX - margin ||
      rawX > bounds.maxX + margin ||
      rawZ < bounds.minZ - margin ||
      rawZ > bounds.maxZ + margin;
    return {
      x: offPlan ? clamp(rawX, bounds.minX, bounds.maxX) : rawX,
      z: offPlan ? clamp(rawZ, bounds.minZ, bounds.maxZ) : rawZ,
      y: rep.pose.y,
      headingDeg: rep.pose.headingDeg,
      count: cluster.count,
      offPlan,
      representativeIndex: rep.photoIndex,
      memberIndices: cluster.memberIndices
        .map((mi) => resolvable[mi].photoIndex)
        .sort((a, b) => a - b),
      thumbUrl: rep.photo.signedThumbUrl,
      previewUrl: rep.photo.signedPreviewUrl ?? null,
      imageUrl: rep.photo.signedImageUrl,
      mimeType: rep.photo.mime_type ?? null,
      capturedAt: rep.photo.captured_at,
    };
  });
}

/** Mono HH:MM capture-time caption, or null. Time-only (no feet) per the
 *  facts-rail/strip caption vocabulary. */
function timeCaption(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

const TICK_LENGTH_PX = 15;
const HIT_RADIUS_PX = 11;
const PEEK_W = 112;
const PEEK_H = 128;

export interface PhotoMarkersProps {
  geometry: RoomGeometry;
  photos: MarkerPhoto[];
  provenance: PhotoProvenance | null;
  /** Opens the viewer at the given ORIGINAL-array photo index. */
  onOpen: (index: number) => void;
}

export function PhotoMarkers({ geometry, photos, provenance, onOpen }: PhotoMarkersProps) {
  const markers = useMemo(
    () => buildPhotoMarkers(photos, provenance, planBounds(geometry)),
    [photos, provenance, geometry],
  );
  const view = useMemo(() => planViewBox(geometry), [geometry]);
  const [peek, setPeek] = useState<number | null>(null);

  if (markers.length === 0) return null;

  const px = (ft: number) => ft * PLAN_STAGE_SCALE + PLAN_STAGE_PAD;

  return (
    <g data-photo-markers="">
      {markers.map((m, i) => (
        <MarkerTick
          key={i}
          marker={m}
          cx={px(m.x)}
          cy={px(m.z)}
          onOpen={() => onOpen(m.representativeIndex)}
          onPeek={() => setPeek(i)}
          onPeekEnd={() => setPeek((cur) => (cur === i ? null : cur))}
        />
      ))}
      {peek != null && markers[peek] && (
        <PeekChip marker={markers[peek]} cx={px(markers[peek].x)} cy={px(markers[peek].z)} view={view} />
      )}
    </g>
  );
}

interface MarkerTickProps {
  marker: PhotoMarker;
  cx: number;
  cy: number;
  onOpen: () => void;
  onPeek: () => void;
  onPeekEnd: () => void;
}

function MarkerTick({ marker, cx, cy, onOpen, onPeek, onPeekEnd }: MarkerTickProps) {
  const rad = (marker.headingDeg * Math.PI) / 180;
  const ex = cx + TICK_LENGTH_PX * Math.cos(rad);
  const ey = cy + TICK_LENGTH_PX * Math.sin(rad);
  const label = [
    marker.count > 1 ? `${marker.count} photos` : 'photo',
    timeCaption(marker.capturedAt),
    marker.offPlan ? 'off-plan' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${label} — open`}
      data-photo-marker=""
      data-off-plan={marker.offPlan ? '' : undefined}
      className="cursor-pointer outline-none [&:focus-visible_circle:last-of-type]:stroke-[var(--color-clay)]"
      onMouseEnter={onPeek}
      onMouseLeave={onPeekEnd}
      onFocus={onPeek}
      onBlur={onPeekEnd}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {/* invisible hit halo — the tick itself is thin */}
      <circle cx={cx} cy={cy} r={HIT_RADIUS_PX} fill="transparent" />

      {/* heading stroke — omitted for off-plan (clamped) reps: their true
          facing sits outside the frame, so a stroke would mislead */}
      {!marker.offPlan && (
        <line
          x1={cx}
          y1={cy}
          x2={ex}
          y2={ey}
          stroke="var(--color-aged-oak)"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeOpacity={0.8}
        />
      )}

      {marker.count > 1 && (
        <text
          x={cx + 5.5}
          y={cy - 5}
          className="pointer-events-none select-none font-mono"
          style={{ fontSize: 8, letterSpacing: '0.04em', fill: 'var(--color-charcoal)', opacity: 0.7 }}
        >
          {marker.count}
        </text>
      )}

      {/* the camera dot — filled on-plan, a hollow ring off-plan */}
      {marker.offPlan ? (
        <circle
          cx={cx}
          cy={cy}
          r={3}
          fill="var(--doc-sheet-front)"
          stroke="var(--color-aged-oak)"
          strokeWidth={1.3}
          strokeOpacity={0.7}
        />
      ) : (
        <circle cx={cx} cy={cy} r={3.2} fill="var(--color-aged-oak)" fillOpacity={0.92} />
      )}
    </g>
  );
}

/** Hover/focus peek — a paper chip (dimchip family, but paper-bg to carry an
 *  image) with a ~96px thumbnail + mono time caption, in a `<foreignObject>`
 *  so the img gets real box sizing (mirrors measure-layer.tsx's MeasureChip). */
function PeekChip({
  marker,
  cx,
  cy,
  view,
}: {
  marker: PhotoMarker;
  cx: number;
  cy: number;
  view: { width: number; height: number };
}) {
  // 96px chip: the thumbnail is already the right size, the 1600 px preview is
  // the next-best thing, and the original is a last resort only when the
  // browser can actually decode it — a chip must never spend ~237 KB on a HEIC
  // it will fail to draw.
  const src =
    marker.thumbUrl ??
    marker.previewUrl ??
    (isBrowserDecodableMime(marker.mimeType) ? marker.imageUrl : null);
  const caption = timeCaption(marker.capturedAt);
  // Float above the tick, centered; clamp within the stage viewBox.
  const x = clamp(cx - PEEK_W / 2, 4, Math.max(4, view.width - PEEK_W - 4));
  const y = clamp(cy - PEEK_H - 10, 4, Math.max(4, view.height - PEEK_H - 4));

  return (
    <foreignObject
      x={x}
      y={y}
      width={PEEK_W}
      height={PEEK_H}
      style={{ overflow: 'visible', pointerEvents: 'none' }}
    >
      <div className="pointer-events-none w-[104px] rounded-[3px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-front)] p-1.5">
        {src ? (

          <img
            src={src}
            alt=""
            decoding="async"
            className="h-[96px] w-full rounded-[1px] object-cover"
          />
        ) : (
          <div className="flex h-[96px] w-full items-center justify-center rounded-[1px] bg-[var(--color-aged-oak)]/[0.06] font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            no preview
          </div>
        )}
        <div className="mt-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          <span>{marker.count > 1 ? `${marker.count} photos` : 'photo'}</span>
          {caption && <span>{caption}</span>}
        </div>
      </div>
    </foreignObject>
  );
}
