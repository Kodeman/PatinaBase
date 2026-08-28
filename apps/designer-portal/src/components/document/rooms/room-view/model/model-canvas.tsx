'use client';

/**
 * ModelCanvas — the WebGL surface for the Mesh projection (Rendered Room v2, P1).
 *
 * A direct sibling of `orbit/orbit-canvas.tsx`, and deliberately the same shape, because
 * that shape is the React-19-safe one: plain three.js (react-three-fiber@8 reads a React
 * internal removed in 19 — it is banned here, I71), reached ONLY through
 * `model-stage.tsx`'s `dynamic(() => import('./model-canvas'), { ssr:false })`, with the
 * <canvas> created imperatively inside the effect so StrictMode's double-invoke gets a
 * fresh context each mount, an ON-DEMAND render loop rather than a perpetual rAF, and a
 * cleanup that detaches controls, disposes the scene, disposes the renderer, and forces
 * the GPU context loss.
 *
 * What differs from Orbit is only what is being drawn: the scan's real GLB, pulled with a
 * `GLTFLoader` carrying a `DRACOLoader` (geometry) and a `KTX2Loader` (basis textures).
 * Both decoders are served from this app's own `public/three/` — never a CDN; see
 * `public/three/README.md` for provenance and the refresh recipe.
 *
 * The load is asynchronous, so the effect's teardown has to be able to run BEFORE the GLB
 * arrives: `cancelled` makes a late arrival dispose itself instead of attaching to a dead
 * renderer. Camera controls are Orbit's own `createOrbitController` — one piece of
 * interaction math for both projections.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { createOrbitController, type OrbitController } from '../orbit/controls';
import {
  buildModelScene,
  clipPlanes,
  disposeObject3D,
  CREAM,
  type BuiltModelScene,
} from './model-scene';

/** Local decoder/transcoder roots (public/three/…). Never a CDN. */
const DRACO_DECODER_PATH = '/three/draco/';
const KTX2_TRANSCODER_PATH = '/three/basis/';

const FOV_DEG = 38;
const CANVAS_HEIGHT = 560;

type CanvasStatus = 'loading' | 'ready' | 'error' | 'webgl-failed';

export interface ModelCanvasProps {
  /** Signed, fetchable GLB URL. */
  modelUrl: string;
}

export default function ModelCanvas({ modelUrl }: ModelCanvasProps) {
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
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

    const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
    const ktx2 = new KTX2Loader().setTranscoderPath(KTX2_TRANSCODER_PATH).detectSupport(gl);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.setKTX2Loader(ktx2);

    // Everything below is populated only once the GLB lands; teardown may run first.
    let cancelled = false;
    let built: BuiltModelScene | null = null;
    let controller: OrbitController | null = null;
    let observer: ResizeObserver | null = null;
    let rafId = 0;

    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) {
          // Arrived after unmount — free it rather than attaching to a dead renderer.
          disposeObject3D(gltf.scene);
          return;
        }

        built = buildModelScene(gltf.scene);
        const { scene, framing } = built;
        const { near, far } = clipPlanes(framing);
        const camera = new THREE.PerspectiveCamera(FOV_DEG, 16 / 9, near, far);

        const render = () => {
          const p = controller!.position;
          const t = controller!.target;
          camera.position.set(p.x, p.y, p.z);
          camera.lookAt(t.x, t.y, t.z);
          gl.render(scene, camera);
        };

        // Coalesce a burst of control/resize events into one frame — on-demand,
        // not a loop (the Orbit rule).
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
        render();
        setStatus('ready');
      },
      undefined,
      () => {
        if (!cancelled) setStatus('error');
      },
    );

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      controller?.detach();
      built?.dispose();
      draco.dispose();
      ktx2.dispose();
      gl.dispose();
      // Release the GPU context immediately (not all builds expose this).
      gl.forceContextLoss?.();
      canvas.remove();
    };
  }, [modelUrl]);

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
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
              Bringing the mesh up…
            </p>
          </div>
        )}
      </div>
      {!live && (
        <div className="flex h-[560px] w-full items-center justify-center px-6 text-center">
          <p className="text-[12px] italic text-[var(--text-muted)]">
            {status === 'webgl-failed'
              ? 'This device can’t render Mesh — Plan carries the measurements.'
              : 'The scan’s mesh couldn’t be loaded — Plan carries the measurements.'}
          </p>
        </div>
      )}
    </>
  );
}
