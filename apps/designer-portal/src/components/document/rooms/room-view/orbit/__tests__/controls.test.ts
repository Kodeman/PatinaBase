/**
 * Orbit controls — pure-math + listener-lifecycle tests (W3-T6). No three.js, no WebGL:
 * framing, clamping, and spherical placement are plain arithmetic, and the controller's
 * attach/detach is exercised against a jsdom canvas element.
 */

import {
  clamp,
  createOrbitController,
  frameRoom,
  normalizedWheelDelta,
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

  describe('wheel zoom', () => {
    /** Recover the live radius from the controller's position (both share `target`). */
    function radiusOf(ctrl: ReturnType<typeof createOrbitController>, f: CameraFraming): number {
      const dx = ctrl.position.x - f.target.x;
      const dy = ctrl.position.y - f.target.y;
      const dz = ctrl.position.z - f.target.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    it('is multiplicative — the same notch is the same fractional step at any radius', () => {
      const smallRoom = frameRoom(1, 1); // small plan diagonal → small starting radius
      const bigRoom = frameRoom(19, 14); // the prototype's own 19×14, radius ≈ 32

      const canvasA = document.createElement('canvas');
      const ctrlA = createOrbitController(canvasA, smallRoom, () => {});
      const r0A = radiusOf(ctrlA, smallRoom);
      canvasA.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
      const r1A = radiusOf(ctrlA, smallRoom);

      const canvasB = document.createElement('canvas');
      const ctrlB = createOrbitController(canvasB, bigRoom, () => {});
      const r0B = radiusOf(ctrlB, bigRoom);
      canvasB.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
      const r1B = radiusOf(ctrlB, bigRoom);

      // Same RATIO regardless of the room's absolute scale — an additive step would
      // fail this (a fixed-unit step is a huge fraction of a small radius, a tiny
      // fraction of a large one).
      expect(r1A / r0A).toBeCloseTo(r1B / r0B, 6);
      // ~exp(100 × 0.0015) ≈ 1.16 — one mouse notch, a ~15% step.
      expect(r1A / r0A).toBeCloseTo(Math.exp(100 * 0.0015), 6);

      ctrlA.detach();
      ctrlB.detach();
    });

    it('a small trackpad tick is a small fractional step, not a jump', () => {
      const canvas = document.createElement('canvas');
      const f = frameRoom(19, 14);
      const ctrl = createOrbitController(canvas, f, () => {});
      const r0 = radiusOf(ctrl, f);
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, cancelable: true }));
      const r1 = radiusOf(ctrl, f);
      expect(r1 / r0).toBeCloseTo(Math.exp(3 * 0.0015), 6); // ≈ ×1.0045, a ~0.5% step
      ctrl.detach();
    });

    it('zooming in (negative deltaY) shrinks the radius; out grows it', () => {
      const canvas = document.createElement('canvas');
      const f = frameRoom(19, 14);
      const ctrl = createOrbitController(canvas, f, () => {});
      const start = radiusOf(ctrl, f);

      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -50, cancelable: true }));
      expect(radiusOf(ctrl, f)).toBeLessThan(start);

      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 50, cancelable: true }));
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 50, cancelable: true }));
      expect(radiusOf(ctrl, f)).toBeGreaterThan(start);
      ctrl.detach();
    });

    it('clamps at minRadius — repeated zoom-in never crosses it', () => {
      const canvas = document.createElement('canvas');
      const f = frameRoom(19, 14);
      const ctrl = createOrbitController(canvas, f, () => {});
      for (let i = 0; i < 500; i += 1) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
      }
      expect(radiusOf(ctrl, f)).toBeCloseTo(f.minRadius, 6);
      ctrl.detach();
    });

    it('clamps at maxRadius — repeated zoom-out never crosses it', () => {
      const canvas = document.createElement('canvas');
      const f = frameRoom(19, 14);
      const ctrl = createOrbitController(canvas, f, () => {});
      for (let i = 0; i < 500; i += 1) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
      }
      expect(radiusOf(ctrl, f)).toBeCloseTo(f.maxRadius, 6);
      ctrl.detach();
    });

    it('calls preventDefault so the page never scrolls under the canvas', () => {
      const canvas = document.createElement('canvas');
      const ctrl = createOrbitController(canvas, frameRoom(19, 14), () => {});
      const event = new WheelEvent('wheel', { deltaY: 10, cancelable: true });
      const preventDefault = jest.spyOn(event, 'preventDefault');
      canvas.dispatchEvent(event);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      ctrl.detach();
    });

    it('normalizes Firefox line deltas to the same pixel scale before zooming', () => {
      const canvas = document.createElement('canvas');
      const f = frameRoom(19, 14);
      const ctrl = createOrbitController(canvas, f, () => {});
      const r0 = radiusOf(ctrl, f);

      // deltaMode 1 (DOM_DELTA_LINE): one "line" of 3 ≈ 48 px — a real Firefox tick.
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true }));
      const r1 = radiusOf(ctrl, f);
      expect(r1 / r0).toBeCloseTo(Math.exp(3 * 16 * 0.0015), 6);
      ctrl.detach();
    });

    it('a pixel-mode delta and an equivalent line-mode delta produce the same zoom', () => {
      const f = frameRoom(19, 14);

      const pixelCanvas = document.createElement('canvas');
      const pixelCtrl = createOrbitController(pixelCanvas, f, () => {});
      pixelCanvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 48, deltaMode: 0, cancelable: true }),
      );
      const pixelRadius = radiusOf(pixelCtrl, f);

      const lineCanvas = document.createElement('canvas');
      const lineCtrl = createOrbitController(lineCanvas, f, () => {});
      lineCanvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true }),
      );
      const lineRadius = radiusOf(lineCtrl, f);

      expect(lineRadius).toBeCloseTo(pixelRadius, 6);
      pixelCtrl.detach();
      lineCtrl.detach();
    });
  });
});

describe('normalizedWheelDelta', () => {
  it('passes pixel-mode deltas through unchanged', () => {
    expect(normalizedWheelDelta({ deltaY: 100, deltaMode: 0 })).toBe(100);
  });

  it('scales line-mode deltas by the standard line height (16px)', () => {
    expect(normalizedWheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(48);
  });

  it('preserves sign — a negative (zoom-in) delta stays negative', () => {
    expect(normalizedWheelDelta({ deltaY: -3, deltaMode: 1 })).toBe(-48);
  });
});
