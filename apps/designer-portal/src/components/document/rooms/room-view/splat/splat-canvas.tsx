'use client';

/**
 * SplatCanvas — the WebGL surface for the Splat projection (Rendered Room v2, W2).
 *
 * A direct sibling of `model/model-canvas.tsx`, and deliberately the same shape, because
 * that shape is the React-19-safe one: plain three.js (react-three-fiber@8 reads a React
 * internal removed in 19 — banned here, I71, and its last consumer was deleted in this
 * same wave), reached ONLY through `splat-stage.tsx`'s
 * `dynamic(() => import('./splat-canvas'), { ssr:false })`, with the <canvas> created
 * imperatively inside the effect so StrictMode's double-invoke gets a fresh context each
 * mount, an ON-DEMAND render loop rather than a perpetual rAF, and a cleanup that
 * detaches controls, hands the splat back to the library, disposes the renderer, and
 * forces the GPU context loss.
 *
 * `@sparkjsdev/spark` is imported at this module's top level ON PURPOSE: this module is
 * the dynamic chunk, so a static import here is what keeps Spark — and the ~MB of Rust
 * splat-decode WASM it inlines as a data: URI — out of every Plan-, Orbit-, and
 * Mesh-only visit. `splat/__tests__/splat-chunk-boundary.test.ts` holds that line.
 *
 * FOUR THINGS DIFFER FROM `model-canvas.tsx`, all of them Spark's nature:
 *
 * 1. **No lights and no loader.** Spark's `SplatMesh` fetches and decodes its own URL —
 *    there is no GLTFLoader, no DRACOLoader, no KTX2Loader, and nothing to vendor into
 *    `public/three/`: Spark's WASM ships inlined in its JS, so it makes no second
 *    request. `initialized` is the promise that stands in for the loader's callback.
 * 2. **A `SparkRenderer` in the scene**, built from our own `WebGLRenderer`. Its
 *    `onDirty` callback is wired straight into `invalidate()` — that is how an
 *    on-demand loop learns that an async sort or LOD update finished and the frame it
 *    drew is now stale. Without it, a still camera would show a mis-sorted splat.
 * 3. **The frame body is a promise.** Splat sorting is async, so
 *    `await spark.update({ scene, camera })` precedes `gl.render(...)`. The rAF
 *    coalescer stays exactly as Orbit and Mesh have it; what is added is a serializer
 *    (`rendering`/`pending`) so two overlapping `update()` calls can never interleave,
 *    and a `cancelled` re-check after the await, because teardown can land mid-frame
 *    and `gl.render` on a disposed context is a hard error.
 * 4. **`antialias: false`.** Spark's own guidance: WebGL MSAA does nothing for Gaussian
 *    splatting (the primitives are already soft) and costs real frame time. Mesh keeps
 *    antialiasing because its hard mesh edges need it.
 *
 * Camera controls are Orbit's own `createOrbitController` — `controls.ts` is deliberately
 * three-free plain `{x,y,z}` math, so all four projections share one piece of interaction
 * math with no adaptation.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { createOrbitController, type OrbitController } from '../orbit/controls';
import { clipPlanes } from '../model/model-scene';
import {
  buildSplatScene,
  disposeSplatParts,
  CREAM,
  type BuiltSplatScene,
} from './splat-scene';

const FOV_DEG = 38;
const CANVAS_HEIGHT = 560;

type CanvasStatus = 'loading' | 'ready' | 'error' | 'webgl-failed';

export interface SplatCanvasProps {
  /** A fetchable splat URL — `.ply`, `.spz`, `.splat`, `.ksplat`, `.sog`. */
  splatUrl: string;
}

export default function SplatCanvas({ splatUrl }: SplatCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<CanvasStatus>('loading');

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    setStatus('loading');

    // Fresh canvas per mount (StrictMode-safe — see orbit-canvas.tsx's header).
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full cursor-grab active:cursor-grabbing';
    canvas.style.touchAction = 'none';
    wrap.appendChild(canvas);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      if (!renderer.getContext()) throw new Error('no webgl context');
    } catch {
      renderer?.dispose?.();
      canvas.remove();
      setStatus('webgl-failed');
      return;
    }

    const gl = renderer;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gl.setClearColor(CREAM, 1);
    gl.outputColorSpace = THREE.SRGBColorSpace;

    // Teardown may run before the splat lands, or in the middle of an async sort.
    let cancelled = false;
    let built: BuiltSplatScene | null = null;
    let controller: OrbitController | null = null;
    let observer: ResizeObserver | null = null;
    let rafId = 0;
    let rendering = false;
    let pending = false;
    let renderFrame: (() => Promise<void>) | null = null;

    // Declared before the Spark parts so `onDirty` can close over it.
    const invalidate = () => {
      if (cancelled || rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        void frame();
      });
    };

    // Serialize frames: `spark.update()` is async, and two in flight at once would
    // sort against each other. A request that arrives mid-frame re-invalidates after.
    const frame = async () => {
      if (!renderFrame) return;
      if (rendering) {
        pending = true;
        return;
      }
      rendering = true;
      try {
        await renderFrame();
      } finally {
        rendering = false;
        if (pending) {
          pending = false;
          invalidate();
        }
      }
    };

    let spark: SparkRenderer | null = null;
    let splatMesh: SplatMesh | null = null;
    try {
      spark = new SparkRenderer({ renderer: gl, onDirty: invalidate });
      splatMesh = new SplatMesh({ url: splatUrl });
    } catch {
      disposeSplatParts({ spark: spark ?? undefined, splatMesh: splatMesh ?? undefined });
      gl.dispose();
      gl.forceContextLoss?.();
      canvas.remove();
      setStatus('error');
      return;
    }

    const parts = { spark, splatMesh };

    splatMesh.initialized
      .then(() => {
        if (cancelled) {
          // Arrived after unmount — free it rather than attaching to a dead renderer.
          disposeSplatParts(parts);
          return;
        }

        built = buildSplatScene(parts, splatMesh!.getBoundingBox());
        const { scene, framing } = built;
        const { near, far } = clipPlanes(framing);
        const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, near, far);

        renderFrame = async () => {
          const p = controller!.position;
          const t = controller!.target;
          camera.position.set(p.x, p.y, p.z);
          camera.lookAt(t.x, t.y, t.z);
          // The async half: Spark sorts the gaussians back-to-front for THIS camera
          // before the draw. Skipping the await would draw last frame's order.
          await spark!.update({ scene, camera });
          if (cancelled) return;
          gl.render(scene, camera);
        };

        const resize = () => {
          const cw = wrap.clientWidth || 1;
          const ch = wrap.clientHeight || 1;
          gl.setSize(cw, ch, false);
          camera.aspect = cw / ch;
          camera.updateProjectionMatrix();
        };

        controller = createOrbitController(canvas, framing, invalidate);
        observer = new ResizeObserver(() => {
          resize();
          invalidate();
        });
        observer.observe(wrap);

        resize();
        void frame();
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        disposeSplatParts(parts);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      controller?.detach();
      // `built.dispose()` is `disposeSplatParts` + `scene.clear()`; before the splat
      // lands there is no scene, so the parts are freed directly.
      if (built) built.dispose();
      else disposeSplatParts(parts);
      gl.dispose();
      // Release the GPU context immediately (not all builds expose this).
      gl.forceContextLoss?.();
      canvas.remove();
    };
  }, [splatUrl]);

  const live = status === 'loading' || status === 'ready';

  return (
    <>
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ height: CANVAS_HEIGHT, display: live ? undefined : 'none' }}
      >
        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
              Bringing the walkthrough up…
            </p>
          </div>
        )}
      </div>
      {!live && (
        <div className="flex h-[560px] w-full items-center justify-center px-6 text-center">
          <p className="text-[12px] italic text-[var(--text-muted)]">
            {status === 'webgl-failed'
              ? 'This device can’t render Splat — Mesh and Plan carry the room.'
              : 'The walkthrough couldn’t be loaded — Mesh and Plan carry the room.'}
          </p>
        </div>
      )}
    </>
  );
}
