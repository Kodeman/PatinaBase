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
 *
 * Every failure path below is quiet by design, and all five land on the same line. That
 * makes a deployed-only failure unreadable, so each one also records its scrubbed shape
 * through `fail(stage, err)`; `?splatDebug=1` is what shows it. See `splat-debug.ts` for
 * why that flag survives the production build when `?splatUrl=` does not.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { createOrbitController, type OrbitController } from '../orbit/controls';
import { clipPlanes } from '../model/model-scene';
import {
  buildSplatScene,
  disposeSplatParts,
  orientBounds,
  defaultSplatOrientation,
  CREAM,
  type BuiltSplatScene,
} from './splat-scene';
import {
  describeSplatFailure,
  splatDebugEnabled,
  useSplatDebug,
  type SplatFailure,
  type SplatFailureStage,
} from './splat-debug';

const FOV_DEG = 38;
const CANVAS_HEIGHT = 560;

type CanvasStatus = 'loading' | 'ready' | 'error' | 'webgl-failed';

export interface SplatCanvasProps {
  /** A fetchable splat URL — `.ply`, `.spz`, `.splat`, `.ksplat`, `.sog`. */
  splatUrl: string;
  /**
   * How the mesh must be rotated to land in three.js's Y-up frame — see
   * `splat-scene.ts`'s ORIENTATION section. Optional escape hatch for a caller that
   * knows better than `defaultSplatOrientation`'s URL-based guess (tests, a future
   * per-source override); every real caller today omits it and gets the guess, which
   * is identity for the committed `/fixtures/…` dev fixture and `SPLAT_ORIENTATION`
   * for everything else (today's dev `?splatUrl=` overrides included, and the
   * resolved R2 capability URL once the read path lands).
   */
  orientation?: THREE.Quaternion;
}

export default function SplatCanvas({ splatUrl, orientation }: SplatCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<CanvasStatus>('loading');
  /**
   * The scrubbed shape of whatever went wrong, recorded on every failure path and
   * rendered only under `?splatDebug=1`. Recorded unconditionally because the flag
   * resolves after mount and a failure can precede it — and because holding two
   * scrubbed strings costs nothing.
   */
  const [failure, setFailure] = useState<SplatFailure | null>(null);
  const debug = useSplatDebug();

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    setStatus('loading');
    setFailure(null);

    // Read directly rather than depending on `debug`: the hook's value flips after
    // mount, and taking it as a dependency would tear down and rebuild the whole
    // WebGL context the moment the flag resolved.
    const debugging = splatDebugEnabled(window.location.search);

    // Same reasoning for `orientation`: every real caller omits the prop, so this
    // resolves from `splatUrl` (already a dependency) via `defaultSplatOrientation`.
    // Depending on the prop itself would tear down and rebuild the whole WebGL
    // context on a caller that passes a fresh `Quaternion` literal each render.
    const meshOrientation = orientation ?? defaultSplatOrientation(splatUrl);

    const fail = (stage: SplatFailureStage, err: unknown) => {
      const described = describeSplatFailure(stage, err);
      setFailure(described);
      if (debugging) {
        // Scrubbed strings only — the raw error can carry the capability URL's
        // SigV4 query, and the console is the one place a screenshot would keep it.
        console.error(
          `[splat:${described.stage}] ${described.message}`,
          described.stack ?? '',
        );
      }
    };

    // Fresh canvas per mount (StrictMode-safe — see orbit-canvas.tsx's header).
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full cursor-grab active:cursor-grabbing';
    canvas.style.touchAction = 'none';
    wrap.appendChild(canvas);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      if (!renderer.getContext()) throw new Error('no webgl context');
    } catch (err) {
      renderer?.dispose?.();
      canvas.remove();
      fail('webgl', err);
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
        runFrame();
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

    /**
     * The only place a frame is started, and the only place its promise is handled.
     * A rejected sort is not exceptional — unmounting mid-sort disposes the parts
     * `spark.update()` is still holding, and the library rejects when it resumes on
     * freed state. After teardown that is expected and must stay silent (a bare
     * `void frame()` would surface it as an unhandledrejection, and a setState here
     * would be on an unmounted component); before teardown it is a real failure and
     * belongs in the same quiet state a failed load lands in.
     */
    const runFrame = () => {
      frame().catch((err: unknown) => {
        if (cancelled) return;
        fail('frame', err);
        setStatus('error');
      });
    };

    let spark: SparkRenderer | null = null;
    let splatMesh: SplatMesh | null = null;
    try {
      spark = new SparkRenderer({ renderer: gl, onDirty: invalidate });
      splatMesh = new SplatMesh({ url: splatUrl });
    } catch (err) {
      // Which of the two threw is the first fork in the diagnosis, and `spark`
      // being set already answers it without splitting the try.
      fail(spark ? 'splat-mesh' : 'spark-renderer', err);
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

        // Orient BEFORE measuring: `getBoundingBox()` returns mesh-LOCAL bounds (the
        // library never sees the object's own transform), so setting the quaternion
        // here has no effect on what it returns — the box still has to be rotated by
        // hand (`orientBounds`) to describe what the mesh will actually look like once
        // its quaternion is applied at render time. Both must happen: the quaternion
        // for the visual, `orientBounds` for the framing that measures it.
        splatMesh!.quaternion.copy(meshOrientation);
        const localBox = splatMesh!.getBoundingBox();
        const bounds = orientBounds(localBox, meshOrientation);

        built = buildSplatScene(parts, bounds);
        const { scene, framing } = built;
        const { near: rawNear, far } = clipPlanes(framing);
        // Interior framing's `minRadius` (as low as 0.15 m) drives `clipPlanes`' raw
        // `minRadius / 100` formula to ~0.0015 — a near plane that close z-fights
        // against anything at typical room scale. 0.05 is close enough to never clip
        // the camera itself at these radii, far enough to leave real depth precision.
        const near = Math.max(rawNear, 0.05);
        const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, near, far);

        renderFrame = async () => {
          const p = controller!.position;
          const t = controller!.target;
          camera.position.set(p.x, p.y, p.z);
          camera.lookAt(t.x, t.y, t.z);
          // The async half: Spark sorts the gaussians back-to-front for THIS camera
          // before the draw. Skipping the await would draw last frame's order.
          try {
            await spark!.update({ scene, camera });
          } catch (err) {
            // Teardown during the sort freed the buffers this call resumes on, so
            // the library throwing here is the expected shape of unmounting
            // mid-frame, not a fault. Anything else is real and propagates.
            if (cancelled) return;
            throw err;
          }
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
        runFrame();
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        fail('initialize', err);
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
    // `debug` and `orientation` are deliberately excluded — see their own comments
    // above for why depending on either would tear down and rebuild the WebGL
    // context for no correctness benefit (no real caller ever passes `orientation`,
    // and `debug`'s raw window read already sidesteps needing it as a dependency).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="flex h-[560px] w-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[12px] italic text-[var(--text-muted)]">
            {status === 'webgl-failed'
              ? 'This device can’t render Splat — Mesh and Plan carry the room.'
              : 'The walkthrough couldn’t be loaded — Mesh and Plan carry the room.'}
          </p>
          {debug && failure && (
            <pre
              data-testid="splat-debug"
              className="max-h-[380px] max-w-full overflow-auto whitespace-pre-wrap break-all border border-[var(--doc-ink-border)] px-3 py-2 text-left font-mono text-[10px] leading-[1.5] text-[var(--color-aged-oak)]"
            >
              {failure.stage}: {failure.message}
              {failure.stack ? `\n${failure.stack}` : ''}
            </pre>
          )}
        </div>
      )}
    </>
  );
}
