import { render } from '@testing-library/react';
import type { RoomGeometry } from '@/lib/room-view/geometry';
import { M_TO_FT, type PhotoProvenance } from '@/lib/room-view/photo-poses';
import {
  buildPhotoMarkers,
  planBounds,
  PhotoMarkers,
  type MarkerPhoto,
} from '../photo-markers';

// Identity provenance: a plan target (px,pz) is world (px/3.28084, y, pz/3.28084).
const IDENTITY: PhotoProvenance = { originYawDeg: 0, originOffsetM: { x: 0, z: 0 } };

/** Row-major identity-orientation camera transform at world (tx,ty,tz). */
function identityCam(tx: number, ty: number, tz: number): number[] {
  return [1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1];
}

/** A posed photo landing at plan (px,pz) under IDENTITY provenance. */
function photoAtPlan(px: number, pz: number, capturedAt: string): MarkerPhoto {
  return {
    camera_transform: identityCam(px / M_TO_FT, 1.5, pz / M_TO_FT),
    captured_at: capturedAt,
    signedThumbUrl: `thumb-${px}-${pz}`,
    signedImageUrl: `img-${px}-${pz}`,
  };
}

/** A 14×14 square-floor room. */
function squareRoom(): RoomGeometry {
  return {
    width: 14,
    depth: 14,
    wallH: 8,
    thick: 0.45,
    walls: [],
    windows: [],
    doors: [],
    openings: [],
    objects: [],
    floor: [
      { x: 0, z: 0 },
      { x: 14, z: 0 },
      { x: 14, z: 14 },
      { x: 0, z: 14 },
    ],
  };
}

describe('planBounds', () => {
  it('uses the floor polygon bbox when present', () => {
    expect(planBounds(squareRoom())).toEqual({ minX: 0, maxX: 14, minZ: 0, maxZ: 14 });
  });

  it('falls back to [0,width]×[0,depth] with no floor', () => {
    const g = { ...squareRoom(), floor: [] };
    expect(planBounds(g)).toEqual({ minX: 0, maxX: 14, minZ: 0, maxZ: 14 });
  });
});

describe('buildPhotoMarkers — poses → markers', () => {
  const bounds = planBounds(squareRoom());

  it('returns [] when provenance is null (layer degrades silently)', () => {
    const photos = [photoAtPlan(3, 3, '2026-07-16T10:00:00Z')];
    expect(buildPhotoMarkers(photos, null, bounds)).toEqual([]);
  });

  it('returns [] when not a single pose resolves', () => {
    const photos: MarkerPhoto[] = [
      { camera_transform: null, captured_at: 't', signedThumbUrl: null, signedImageUrl: null },
      { camera_transform: [1, 2, 3], captured_at: 't', signedThumbUrl: null, signedImageUrl: null },
    ];
    expect(buildPhotoMarkers(photos, IDENTITY, bounds)).toEqual([]);
  });

  it('clusters a near-pair and leaves singletons — 3 markers from 4 photos', () => {
    const photos = [
      photoAtPlan(3, 3, '2026-07-16T10:00:00Z'), // 0
      photoAtPlan(3.4, 3.2, '2026-07-16T10:00:05Z'), // 1 — ~0.45 ft from 0 → clusters
      photoAtPlan(10, 10, '2026-07-16T10:01:00Z'), // 2
      photoAtPlan(2, 12, '2026-07-16T10:02:00Z'), // 3
    ];
    const markers = buildPhotoMarkers(photos, IDENTITY, bounds);
    expect(markers).toHaveLength(3);

    const counts = markers.map((m) => m.count).sort((a, b) => b - a);
    expect(counts).toEqual([2, 1, 1]);

    const pair = markers.find((m) => m.count === 2)!;
    // Photo 0 is earliest → representative; both indices are members.
    expect(pair.representativeIndex).toBe(0);
    expect(pair.memberIndices).toEqual([0, 1]);
    expect(pair.offPlan).toBe(false);
    // Representative pose lands (near) plan (3,3).
    expect(pair.x).toBeCloseTo(3, 4);
    expect(pair.z).toBeCloseTo(3, 4);
  });

  it('clamps an off-plan pose to the floor bbox and flags it', () => {
    const photos = [
      photoAtPlan(7, 7, '2026-07-16T10:00:00Z'), // inside
      photoAtPlan(20, 20, '2026-07-16T10:01:00Z'), // outside 14+2 margin → off-plan
    ];
    const markers = buildPhotoMarkers(photos, IDENTITY, bounds);
    expect(markers).toHaveLength(2);

    const off = markers.find((m) => m.offPlan)!;
    expect(off).toBeTruthy();
    // Clamped to the bbox edge (14,14), not left at (20,20).
    expect(off.x).toBeCloseTo(14, 4);
    expect(off.z).toBeCloseTo(14, 4);

    const on = markers.find((m) => !m.offPlan)!;
    expect(on.x).toBeCloseTo(7, 4);
    expect(on.z).toBeCloseTo(7, 4);
  });

  it('a pose just inside the +2 ft margin is NOT off-plan', () => {
    const photos = [photoAtPlan(15, 7, '2026-07-16T10:00:00Z')]; // 15 < 14+2
    const markers = buildPhotoMarkers(photos, IDENTITY, bounds);
    expect(markers).toHaveLength(1);
    expect(markers[0].offPlan).toBe(false);
    expect(markers[0].x).toBeCloseTo(15, 4);
  });
});

describe('PhotoMarkers — SVG rendering', () => {
  it('renders one hit group per marker and none when empty', () => {
    const { container, rerender } = render(
      <svg>
        <PhotoMarkers geometry={squareRoom()} photos={[]} provenance={IDENTITY} onOpen={() => {}} />
      </svg>,
    );
    expect(container.querySelectorAll('[data-photo-marker]')).toHaveLength(0);

    const photos = [
      photoAtPlan(3, 3, '2026-07-16T10:00:00Z'),
      photoAtPlan(3.4, 3.2, '2026-07-16T10:00:05Z'),
      photoAtPlan(10, 10, '2026-07-16T10:01:00Z'),
    ];
    rerender(
      <svg>
        <PhotoMarkers geometry={squareRoom()} photos={photos} provenance={IDENTITY} onOpen={() => {}} />
      </svg>,
    );
    // 2 markers (one is the clustered pair).
    expect(container.querySelectorAll('[data-photo-marker]')).toHaveLength(2);
  });

  it('renders nothing when provenance is null', () => {
    const photos = [photoAtPlan(3, 3, '2026-07-16T10:00:00Z')];
    const { container } = render(
      <svg>
        <PhotoMarkers geometry={squareRoom()} photos={photos} provenance={null} onOpen={() => {}} />
      </svg>,
    );
    expect(container.querySelectorAll('[data-photo-marker]')).toHaveLength(0);
  });
});
