/**
 * Orbit scene builder — pure unit tests (W3-T6). three constructs geometry/material in
 * jsdom without any WebGL context, so the SHAPE of the scene is fully assertable here:
 * mesh/line counts, the honesty rules (dashed only on the low-conf run), the split-run
 * arithmetic, the opening-as-gap invariant, and clean disposal.
 */

import * as THREE from 'three';
import { buildScene, solidRuns } from '../scene';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';
import type { RoomGeometry } from '@/lib/room-view/geometry';

type Tagged = THREE.Object3D & { userData: Record<string, unknown> };

const meshes = (scene: THREE.Scene) => scene.children.filter((c) => c.type === 'Mesh') as Tagged[];
const lines = (scene: THREE.Scene) => scene.children.filter((c) => c.type === 'LineSegments') as Tagged[];
const byRole = (objs: Tagged[], role: string) => objs.filter((o) => o.userData.role === role);
const onWall = (objs: Tagged[], wallIndex: number) => objs.filter((o) => o.userData.wallIndex === wallIndex);

describe('solidRuns', () => {
  it('splits a wall with two openings into three solid runs (before/between/after)', () => {
    // west wall of the fixture: two windows at 2.5–6.5 and 8.5–12.5 on a 14 ft wall
    expect(solidRuns(14, [[2.5, 6.5], [8.5, 12.5]])).toEqual([
      [0, 2.5],
      [6.5, 8.5],
      [12.5, 14],
    ]);
  });

  it('returns the whole wall when there are no openings', () => {
    expect(solidRuns(13, [])).toEqual([[0, 13]]);
  });

  it('merges overlapping openings and clamps out-of-range spans', () => {
    expect(solidRuns(10, [[2, 5], [4, 7]])).toEqual([[0, 2], [7, 10]]);
    expect(solidRuns(10, [[-3, 2], [8, 20]])).toEqual([[2, 8]]);
  });

  it('yields no runs for a degenerate wall length', () => {
    expect(solidRuns(0, [])).toEqual([]);
    expect(solidRuns(-4, [[1, 2]])).toEqual([]);
  });
});

describe('buildScene — the prototype fixture', () => {
  let room: RoomGeometry;

  beforeEach(() => {
    room = prototypeRoom();
  });

  it('builds the expected mesh + line counts', () => {
    // Derivation (5 walls):
    //   floor           1 mesh + 1 line
    //   wall0 N-w (13)  no openings → 1 solid                → 1 mesh + 1 line
    //   wall1 N-e (6)   low-conf, no openings → 1 solid      → 1 mesh + 1 line (dashed)
    //   wall2 E  (14)   opening h=null → 2 solid, no header  → 2 mesh + 2 line
    //   wall3 S  (19)   door → 2 solid + 1 header            → 3 mesh + 3 line
    //   wall4 W  (14)   2 windows → 3 solid + 2 sill + 2 header (7) + 2 frame + 2 cross (4 line)
    //                                                        → 7 mesh + 11 line
    //   ghosts (5)                                           → 5 mesh + 5 line
    //   totals: 20 mesh, 24 line
    const { scene } = buildScene(room);
    expect(meshes(scene)).toHaveLength(20);
    expect(lines(scene)).toHaveLength(24);
  });

  it('draws a dashed (LineDashedMaterial) edge ONLY on the low-confidence run', () => {
    const { scene } = buildScene(room);
    const dashed = lines(scene).filter(
      (l) => (l as THREE.LineSegments).material instanceof THREE.LineDashedMaterial,
    );
    expect(dashed).toHaveLength(1);
    // ...and it belongs to wall index 1 (the low-conf North-east run).
    expect(dashed[0].userData.wallIndex).toBe(1);
    expect(dashed[0].userData.role).toBe('wall-solid-edge');
  });

  it('renders one ghost volume per detected object', () => {
    const { scene } = buildScene(room);
    expect(byRole(meshes(scene), 'ghost')).toHaveLength(room.objects.length);
    expect(byRole(lines(scene), 'ghost-edge')).toHaveLength(room.objects.length);
  });

  it('splits a two-window wall into 3 solid + 2 sill + 2 header boxes', () => {
    const { scene } = buildScene(room);
    const wall4 = onWall(meshes(scene), 4);
    expect(byRole(wall4, 'wall-solid')).toHaveLength(3);
    expect(byRole(wall4, 'wall-sill')).toHaveLength(2);
    expect(byRole(wall4, 'wall-header')).toHaveLength(2);
    // plus its two windows' frame + cross outlines
    expect(byRole(onWall(lines(scene), 4), 'window-frame')).toHaveLength(2);
    expect(byRole(onWall(lines(scene), 4), 'window-cross')).toHaveLength(2);
  });

  it('leaves a real gap for a pass-through opening (no box in its span below h)', () => {
    const { scene } = buildScene(room);
    // wall2 (east) carries one h=null opening 4→7; expect two solids and nothing else.
    const wall2 = onWall(meshes(scene), 2);
    expect(wall2).toHaveLength(2);
    expect(byRole(wall2, 'wall-solid')).toHaveLength(2);
    expect(byRole(wall2, 'wall-header')).toHaveLength(0);
    expect(byRole(wall2, 'wall-sill')).toHaveLength(0);
    // the opening's mid-span (5.5 ft) is covered by NO solid run
    const covers5point5 = wall2.some((m) => {
      const [a, b] = m.userData.span as [number, number];
      return a <= 5.5 && 5.5 <= b;
    });
    expect(covers5point5).toBe(false);
  });

  it('positions the floor as a single mesh + its edge outline', () => {
    const { scene } = buildScene(room);
    expect(byRole(meshes(scene), 'floor')).toHaveLength(1);
    expect(byRole(lines(scene), 'floor-edge')).toHaveLength(1);
  });
});

describe('buildScene — disposal', () => {
  it('empties the scene and disposes every geometry + material', () => {
    const geoSpy = jest.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const matSpy = jest.spyOn(THREE.Material.prototype, 'dispose');

    const { scene, dispose } = buildScene(prototypeRoom());
    expect(scene.children.length).toBeGreaterThan(0);

    dispose();

    expect(scene.children).toHaveLength(0);
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();

    geoSpy.mockRestore();
    matSpy.mockRestore();
  });
});
