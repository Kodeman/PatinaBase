/**
 * Orbit controls — pure-math + listener-lifecycle tests (W3-T6). No three.js, no WebGL:
 * framing, clamping, and spherical placement are plain arithmetic, and the controller's
 * attach/detach is exercised against a jsdom canvas element.
 */

import {
  clamp,
  createOrbitController,
  frameRoom,
  sphericalPosition,
  type CameraFraming,
} from '../controls';

describe('clamp', () => {
  it('passes values inside the band and clamps outside it', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(20, 0, 10)).toBe(10);
  });
});

describe('sphericalPosition', () => {
  it('places the eye on the sphere around the target (prototype placeCamera math)', () => {
    // azimuth 0, polar π/2, r 10 → straight out along +x
    const a = sphericalPosition({ x: 0, y: 0, z: 0 }, 0, Math.PI / 2, 10);
    expect(a.x).toBeCloseTo(10, 6);
    expect(a.y).toBeCloseTo(0, 6);
    expect(a.z).toBeCloseTo(0, 6);

    // azimuth π/2, polar π/2, r 10 → along +z
    const b = sphericalPosition({ x: 0, y: 0, z: 0 }, Math.PI / 2, Math.PI / 2, 10);
    expect(b.x).toBeCloseTo(0, 6);
    expect(b.y).toBeCloseTo(0, 6);
    expect(b.z).toBeCloseTo(10, 6);
  });

  it('is offset by the target', () => {
    const p = sphericalPosition({ x: 5, y: 2, z: -1 }, 0, Math.PI / 2, 4);
    expect(p.x).toBeCloseTo(9, 6);
    expect(p.y).toBeCloseTo(2, 6);
    expect(p.z).toBeCloseTo(-1, 6);
  });
});

describe('frameRoom', () => {
  it('keeps the prototype angles and derives ~32 radius for a 19×14 room', () => {
    const f = frameRoom(19, 14);
    expect(f.azimuth).toBeCloseTo(0.82, 6);
    expect(f.polar).toBeCloseTo(1.08, 6);
    // 1.35 × √(19²+14²) ≈ 31.86, matching the prototype's hardcoded 32
    expect(f.radius).toBeCloseTo(31.86, 1);
    expect(f.radius).toBeGreaterThan(30);
    expect(f.radius).toBeLessThan(34);
  });

  it('targets the room centre at eye height', () => {
    const f = frameRoom(19, 14);
    expect(f.target).toEqual({ x: 9.5, y: 2.2, z: 7 });
  });

  it('brackets the radius with sane, room-relative clamp bounds', () => {
    const f = frameRoom(19, 14);
    expect(f.minRadius).toBeLessThan(f.radius);
    expect(f.maxRadius).toBeGreaterThan(f.radius);
    expect(f.minPolar).toBeCloseTo(0.35, 6);
    expect(f.maxPolar).toBeCloseTo(1.45, 6);
  });

  it('never produces NaN for a degenerate room', () => {
    const f = frameRoom(0, 0);
    expect(Number.isFinite(f.radius)).toBe(true);
    expect(Number.isFinite(f.target.x)).toBe(true);
  });
});

describe('createOrbitController', () => {
  function framing(): CameraFraming {
    return frameRoom(19, 14);
  }

  it('seeds position from the framing before any interaction', () => {
    const canvas = document.createElement('canvas');
    const f = framing();
    const ctrl = createOrbitController(canvas, f, () => {});
    const expected = sphericalPosition(f.target, f.azimuth, f.polar, f.radius);
    expect(ctrl.position.x).toBeCloseTo(expected.x, 6);
    expect(ctrl.position.y).toBeCloseTo(expected.y, 6);
    expect(ctrl.position.z).toBeCloseTo(expected.z, 6);
    expect(ctrl.target).toEqual(f.target);
    ctrl.detach();
  });

  it('detach() removes every listener it attached', () => {
    const canvas = document.createElement('canvas');
    const canvasOff = jest.spyOn(canvas, 'removeEventListener');
    const winOff = jest.spyOn(window, 'removeEventListener');

    const ctrl = createOrbitController(canvas, framing(), () => {});
    ctrl.detach();

    expect(canvasOff).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(canvasOff).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(winOff).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(winOff).toHaveBeenCalledWith('pointerup', expect.any(Function));

    canvasOff.mockRestore();
    winOff.mockRestore();
  });
});
