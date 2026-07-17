'use client';

/**
 * OrbitCanvas — the WebGL surface for the Orbit projection (W3-T6; R107 §3, I71).
 *
 * Plain three.js only — NEVER statically imported by the shell. It is reached solely
 * through `orbit-stage.tsx`'s `dynamic(() => import('./orbit-canvas'), { ssr:false })`, so
 * three + the scene builder are code-split into a chunk that loads on the FIRST Orbit
 * click and never on a Plan-only visit (the package accept line).
 *
 * The <canvas> is created IMPERATIVELY inside the effect (not rendered in JSX) and torn
 * down in cleanup. That survives React's StrictMode double-invoke in dev: each mount gets
 * a fresh canvas, so the first cleanup's `forceContextLoss()` can't poison the second
 * mount's context (a JSX canvas reused across the remount fails to reacquire WebGL and
 * would wrongly trip the fallback).
 *
 * Rendering is ON-DEMAND: the prototype's perpetual rAF loop was a demo convenience, not
 * intent. We render once on mount, then only when the controls change or the wrapper
 * resizes — each such event schedules a single coalesced frame. Unmount tears everything
 * down: controls detached, scene disposed, renderer disposed, WebGL context released.
 *
 * Photo frustum markers (W3-T7, I76): the clustered photo poses ride in as a SEPARATE
 * group (photo-marker-objects.ts) added to the scene — `buildScene` stays geometry-pure
 * (composition, not modification). Because the scene's WebGL context must stay stable
 * (an orbit angle survives), markers live in their OWN effect keyed on `photoPoses`, so
 * photos arriving after the canvas mounts add/replace the group without tearing the
 * context down. A pointer press that RELEASES within ~5px of where it went down is a
 * click (not an orbit-drag): we raycast the invisible hit spheres and open that photo.
 * Hover over a marker flips the cursor to a pointer (raycast on move, throttled). No 3D
 * tooltip in v1 — the peek chip is the Plan tick's job.
 *
 * If WebGL context creation fails (locked-down device, blocked GPU), we swap in a quiet
 * line rather than throw — Plan still carries the measurements.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { overallDims, type RoomGeometry } from '@/lib/room-view/geometry';
import { buildScene } from './scene';
import { createOrbitController, frameRoom, type OrbitController } from './controls';
import {
  buildPhotoMarkers,
  pickPhotoIndex,
  pointerMovedWithin,
  type BuiltPhotoMarkers,
  type OrbitPhotoPose,
} from './photo-marker-objects';

const CREAM = 0xfaf7f2;
const FOV_DEG = 38;
const NEAR = 0.1;
const FAR = 400;
const CANVAS_HEIGHT = 560;

/** Click-vs-drag gate: a press that travels < this many px before release opens
 *  the photo; anything more was an orbit-drag. */
const CLICK_SLOP_PX = 5;
/** Hover raycast throttle — one pick per this many ms of pointer travel. */
const HOVER_THROTTLE_MS = 40;

export interface OrbitCanvasProps {
  geometry: RoomGeometry;
  /** Clustered photo poses → one frustum wedge each. Empty / omitted = no markers. */
  photoPoses?: OrbitPhotoPose[];
  /** Opens the viewer at the clicked wedge's ORIGINAL-array photo index. */
  onPhotoClick?: (index: number) => void;
}

export default function OrbitCanvas({ geometry, photoPoses, onPhotoClick }: OrbitCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // Cross-effect handles: the marker effect (keyed on photoPoses) reaches the live
  // scene/camera/invalidate the main effect owns, and the pointer handlers (attached
  // in the main effect) read the current markers + latest click callback.
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const invalidateRef = useRef<() => void>(() => {});
  const markersRef = useRef<BuiltPhotoMarkers | null>(null);
  const onPhotoClickRef = useRef(onPhotoClick);
  onPhotoClickRef.current = onPhotoClick;

  // ——— main effect: renderer + scene + controls + pointer→raycast plumbing ———
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Fresh canvas per mount (StrictMode-safe — see file header).
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full cursor-grab active:cursor-grabbing';
    canvas.style.touchAction = 'none';
    wrap.appendChild(canvas);
    canvasRef.current = canvas;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      if (!renderer.getContext()) throw new Error('no webgl context');
    } catch {
      renderer?.dispose?.();
      canvas.remove();
      canvasRef.current = null;
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(CREAM, 1);

    const { scene, dispose } = buildScene(geometry);
    sceneRef.current = scene;
    const { w, d } = overallDims(geometry);
    const framing = frameRoom(w, d);
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, NEAR, FAR);
    cameraRef.current = camera;

    let controller: OrbitController;
    let rafId = 0;

    const render = () => {
      const p = controller.position;
      const t = controller.target;
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(t.x, t.y, t.z);
      renderer!.render(scene, camera);
    };

    // Coalesce a burst of control/resize events into one frame — on-demand, not a loop.
    const invalidate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        render();
      });
    };
    invalidateRef.current = invalidate;

    const resize = () => {
      const cw = wrap.clientWidth || 1;
      const ch = wrap.clientHeight || 1;
      renderer!.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    };

    controller = createOrbitController(canvas, framing, invalidate);

    // ——— photo-marker pointer plumbing ———
    const raycaster = new THREE.Raycaster();
    let downX = 0;
    let downY = 0;
    let pressed = false;
    let lastHover = 0;
    let hoveredPhoto: number | null = null;

    // Pointer NDC (−1..1) from a client point over the canvas.
    const ndc = (clientX: number, clientY: number): THREE.Vector2 => {
      const rect = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
    };

    const pickAt = (clientX: number, clientY: number): number | null => {
      const markers = markersRef.current;
      if (!markers || markers.markerMeshes.length === 0) return null;
      // Raycasting reads world matrices; keep them fresh independent of when the
      // last frame ran (a hover can fire before the first post-add render).
      scene.updateMatrixWorld();
      raycaster.setFromCamera(ndc(clientX, clientY), camera);
      return pickPhotoIndex(raycaster, markers.markerMeshes.map((m) => m.mesh));
    };

    const onMarkerDown = (e: PointerEvent) => {
      pressed = true;
      downX = e.clientX;
      downY = e.clientY;
    };

    const onMarkerUp = (e: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      // Only a near-stationary press counts as a click — a drag orbited the room.
      if (!pointerMovedWithin(downX, downY, e.clientX, e.clientY, CLICK_SLOP_PX)) return;
      const idx = pickAt(e.clientX, e.clientY);
      if (idx != null) onPhotoClickRef.current?.(idx);
    };

    const onMarkerMove = (e: PointerEvent) => {
      // Skip hover picks mid-drag and throttle the raycast to pointer travel.
      if (pressed) return;
      const now = e.timeStamp || performance.now();
      if (now - lastHover < HOVER_THROTTLE_MS) return;
      lastHover = now;
      const idx = pickAt(e.clientX, e.clientY);
      canvas.style.cursor = idx != null ? 'pointer' : '';
      if (idx !== hoveredPhoto) {
        hoveredPhoto = idx;
        invalidate(); // on-demand: markers changed interaction state
      }
    };

    canvas.addEventListener('pointerdown', onMarkerDown);
    canvas.addEventListener('pointerup', onMarkerUp);
    canvas.addEventListener('pointermove', onMarkerMove);

    const ro = new ResizeObserver(() => {
      resize();
      invalidate();
    });
    ro.observe(wrap);

    resize();
    render();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onMarkerDown);
      canvas.removeEventListener('pointerup', onMarkerUp);
      canvas.removeEventListener('pointermove', onMarkerMove);
      controller.detach();
      dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      canvasRef.current = null;
      invalidateRef.current = () => {};
      renderer!.dispose();
      // Release the GPU context immediately (not all builds expose this).
      renderer!.forceContextLoss?.();
      canvas.remove();
    };
  }, [geometry]);

  // ——— marker effect: (re)build the frustum group when the poses change ———
  // Keyed on `geometry` too so a scene rebuild re-adds markers to the NEW scene.
  // Kept OUT of the main effect so photos arriving after mount don't tear down the
  // WebGL context (and the user's orbit angle) just to draw a wedge.
  useEffect(() => {
    const scene = sceneRef.current;
    const poses = photoPoses ?? [];
    if (!scene || poses.length === 0) {
      markersRef.current = null;
      return;
    }
    const markers = buildPhotoMarkers(poses);
    scene.add(markers.group);
    markersRef.current = markers;
    invalidateRef.current();

    return () => {
      markers.group.parent?.remove(markers.group);
      markers.dispose();
      if (markersRef.current === markers) markersRef.current = null;
      invalidateRef.current();
    };
  }, [geometry, photoPoses]);

  return (
    <>
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ height: CANVAS_HEIGHT, display: failed ? 'none' : undefined }}
      />
      {failed && (
        <div className="flex h-[560px] w-full items-center justify-center px-6 text-center">
          <p className="text-[12px] italic text-[var(--text-muted)]">
            This device can’t render Orbit — Plan carries the measurements.
          </p>
        </div>
      )}
    </>
  );
}
