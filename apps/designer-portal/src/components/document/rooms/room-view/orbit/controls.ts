/**
 * Room View — Orbit camera framing + drag/wheel controls (W3-T6; R107 §3).
 *
 * A pure-math + thin-DOM port of the prototype's orbit interaction (room-view-prototype.html
 * L574–599). Deliberately three.js-free: framing and placement are plain arithmetic over
 * `{x,y,z}` so they unit-test in jsdom, and `orbit-canvas.tsx` maps the result onto a
 * `THREE.PerspectiveCamera`. Pointer drag → azimuth/polar (polar clamped); wheel → radius
 * (clamped, `preventDefault` so the page doesn't scroll). `detach()` removes every listener.
 *
 * The prototype hardcodes azim 0.82 / polar 1.08 / radius 32 for its one 19×14 room.
 * `frameRoom` keeps the two angles and DERIVES the radius (and its clamp bounds) from the
 * room's plan diagonal, so any room lands at the same camera FEEL — 1.35 × diagonal
 * reproduces ~32 for 19×14 (√(19²+14²) ≈ 23.6).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraFraming {
  /** look-at point: room centre, lifted to ~eye height (prototype's target.y = 2.2 ft) */
  target: Vec3;
  azimuth: number;
  polar: number;
  radius: number;
  minRadius: number;
  maxRadius: number;
  minPolar: number;
  maxPolar: number;
}

// Prototype constants (verbatim), + the derived-radius factors.
const DEFAULT_AZIMUTH = 0.82;
const DEFAULT_POLAR = 1.08;
const MIN_POLAR = 0.35;
const MAX_POLAR = 1.45;
const TARGET_EYE_FT = 2.2;

/** radius ÷ plan-diagonal that reproduces the prototype's 32 for a 19×14 room. */
const RADIUS_FIT = 1.35;
/** clamp band around the fit, relative to the diagonal — generalizes the prototype's
 *  hardcoded [14, 60] (which for 19×14 is ≈ [0.59, 2.54] × diagonal). */
const RADIUS_MIN_FACTOR = 0.6;
const RADIUS_MAX_FACTOR = 2.55;

// Drag / wheel sensitivities (verbatim from the prototype).
const AZIMUTH_SENS = 0.006;
const POLAR_SENS = 0.004;
const WHEEL_SENS = 0.03;

/** Clamp `v` into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Camera position on a sphere around `target` — the prototype's `placeCamera` math:
 *   x = target.x + r·sin(polar)·cos(azimuth)
 *   y = target.y + r·cos(polar)
 *   z = target.z + r·sin(polar)·sin(azimuth)
 */
export function sphericalPosition(target: Vec3, azimuth: number, polar: number, radius: number): Vec3 {
  const sinP = Math.sin(polar);
  return {
    x: target.x + radius * sinP * Math.cos(azimuth),
    y: target.y + radius * Math.cos(polar),
    z: target.z + radius * sinP * Math.sin(azimuth),
  };
}

/** Default framing for a room of the given plan extent (feet). */
export function frameRoom(width: number, depth: number): CameraFraming {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const d = Number.isFinite(depth) && depth > 0 ? depth : 1;
  const diag = Math.hypot(w, d);
  return {
    target: { x: w / 2, y: TARGET_EYE_FT, z: d / 2 },
    azimuth: DEFAULT_AZIMUTH,
    polar: DEFAULT_POLAR,
    radius: RADIUS_FIT * diag,
    minRadius: RADIUS_MIN_FACTOR * diag,
    maxRadius: RADIUS_MAX_FACTOR * diag,
    minPolar: MIN_POLAR,
    maxPolar: MAX_POLAR,
  };
}

export interface OrbitController {
  /** live camera position — mutated in place on every interaction (read after `onChange`). */
  readonly position: Vec3;
  /** the look-at target (room centre); stable for the controller's lifetime. */
  readonly target: Vec3;
  /** remove every listener this controller attached. */
  detach(): void;
}

/**
 * Wire pointer-drag → azimuth/polar and wheel → radius onto `canvas`, recomputing
 * `position` and invoking `onChange` after each change. Pointer move/up bind to `window`
 * (so a drag that leaves the canvas keeps tracking); `detach()` unbinds all four.
 */
export function createOrbitController(
  canvas: HTMLElement,
  framing: CameraFraming,
  onChange: () => void,
): OrbitController {
  let azimuth = framing.azimuth;
  let polar = clamp(framing.polar, framing.minPolar, framing.maxPolar);
  let radius = clamp(framing.radius, framing.minRadius, framing.maxRadius);
  const target: Vec3 = { ...framing.target };
  const position: Vec3 = sphericalPosition(target, azimuth, polar, radius);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const recompute = () => {
    const p = sphericalPosition(target, azimuth, polar, radius);
    position.x = p.x;
    position.y = p.y;
    position.z = p.z;
    onChange();
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    azimuth += (e.clientX - lastX) * AZIMUTH_SENS;
    polar = clamp(polar - (e.clientY - lastY) * POLAR_SENS, framing.minPolar, framing.maxPolar);
    lastX = e.clientX;
    lastY = e.clientY;
    recompute();
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    radius = clamp(radius + e.deltaY * WHEEL_SENS, framing.minRadius, framing.maxRadius);
    recompute();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    position,
    target,
    detach() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
