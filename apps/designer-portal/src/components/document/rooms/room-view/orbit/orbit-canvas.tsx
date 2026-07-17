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
 * If WebGL context creation fails (locked-down device, blocked GPU), we swap in a quiet
 * line rather than throw — Plan still carries the measurements.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { overallDims, type RoomGeometry } from '@/lib/room-view/geometry';
import { buildScene } from './scene';
import { createOrbitController, frameRoom, type OrbitController } from './controls';

const CREAM = 0xfaf7f2;
const FOV_DEG = 38;
const NEAR = 0.1;
const FAR = 400;
const CANVAS_HEIGHT = 560;

export default function OrbitCanvas({ geometry }: { geometry: RoomGeometry }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Fresh canvas per mount (StrictMode-safe — see file header).
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full cursor-grab active:cursor-grabbing';
    canvas.style.touchAction = 'none';
    wrap.appendChild(canvas);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      if (!renderer.getContext()) throw new Error('no webgl context');
    } catch {
      renderer?.dispose?.();
      canvas.remove();
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(CREAM, 1);

    const { scene, dispose } = buildScene(geometry);
    const { w, d } = overallDims(geometry);
    const framing = frameRoom(w, d);
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, NEAR, FAR);

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

    const resize = () => {
      const cw = wrap.clientWidth || 1;
      const ch = wrap.clientHeight || 1;
      renderer!.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    };

    controller = createOrbitController(canvas, framing, invalidate);

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
      controller.detach();
      dispose();
      renderer!.dispose();
      // Release the GPU context immediately (not all builds expose this).
      renderer!.forceContextLoss?.();
      canvas.remove();
    };
  }, [geometry]);

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
