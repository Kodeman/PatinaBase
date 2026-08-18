# Splat — Room View's fourth projection

Rendered Room v2, W2 · PROPOSAL §4 "One viewer substrate"

Plan is the measured drawing. Orbit is the synthetic diagram. Mesh is the scan's own
geometry. **Splat is the room as photographed** — a Gaussian-splat radiance field
trained from the walk's posed keyframes, seen and never measured against.

What is in this directory: the data seam, the mode gate, the stage with its quiet
states, and — as of the W2 splat-unblock lane — the WebGL canvas itself, on
`@sparkjsdev/spark`. This document keeps the renderer evaluation that led here, so the
next person does not re-run it, and then records what was actually built.

---

## Renderer evaluation

Two MIT candidates were named in the brief; a third came up during the evaluation.
All three were checked against the real published packages, not their marketing.

### (a) Spark — `@sparkjsdev/spark` · **the right renderer — adopted, pinned at 2.1.0**

Architecturally it is the fit, and nothing found here changes that. Spark renders
splats as ordinary three.js scene objects: `new SparkRenderer({ renderer })` is an
`Object3D` you add to your own `Scene`, and each `new SplatMesh({ url })` is another.
It composes with a canvas we already own rather than replacing it, which means the
imperative-renderer / on-demand-loop / shared-`controls.ts` architecture that Orbit
and Mesh are built on survives intact — `controls.ts` is deliberately three-free plain
`{x,y,z}` math, so it needs no adaptation at all.

Verified against the registry and the published `dist/spark.module.js` (2.1.0):

| | |
|---|---|
| Latest | **2.1.0** (2026-05-18) |
| License | **MIT** |
| Formats | `.spz`, `.ply` (standard + SuperSplat-packed), `.splat`, `.ksplat`, `.sog`, `.zip`, `.rad` — one `SplatLoader` that sniffs magic bytes |
| Runtime deps | `fflate` only |
| **Remote fetches** | **None.** The only `https://` strings in the whole shipped bundle are Wikipedia links inside code comments. It fetches exactly the `url` you hand a `SplatMesh` and nothing else — no CDN, no telemetry. |
| **WASM** | Yes (Rust splat decode/LOD) — but **inlined as a `data:application/wasm;base64,…` URI inside the JS**. There is no separate `.wasm` file to serve and no `setDecoderPath` equivalent, so **the `public/three/` vendoring pattern does not apply and nothing needs to be committed.** ⚠ **The CSP conclusion this table originally drew from that — "there is no second request to allow" — was wrong**, and the browser is what caught it: wasm-bindgen `fetch()`es the data: URI, and a fetch of a data: URL is still governed by `connect-src`. See "The one thing the evaluation got wrong" below. |
| Disposal | `SplatMesh.dispose()` frees its packed buffers; `SparkRenderer.dispose()` frees the renderer's. (Open upstream issue [#237] reports memory not always dropping — worth watching when the canvas lands.) |
| Render loop | Splat sorting is async. The quick-start uses `setAnimationLoop`, but on-demand works: `await spark.update({ scene, camera })` before each `renderer.render(...)`. That is one `await` inside our existing `invalidate()` coalescer. |
| Packaging | ESM + CJS, ships its own `.d.ts`, no `window`/`document` at module scope |

**The blocker, and it was hard — now cleared:**

```
@sparkjsdev/spark@2.1.0   peerDependencies: { "three": ">=0.180.0" }
apps/designer-portal      three: ^0.159.0
```

Not a conservative peer range — a real API dependency. Spark's material uniforms
construct `new THREE.Matrix2()`, and `Matrix2` does not exist in three 0.159:

```
$ grep -o "Matrix2[A-Za-z]*" apps/designer-portal/node_modules/three/build/three.module.js | sort -u
Matrix2fv                    # ← the WebGL uniform setter, not the class

$ grep -o "Matrix2[A-Za-z]*" node_modules/.pnpm/three@0.180.0/node_modules/three/build/three.module.js | sort -u
Matrix2
Matrix2fv
```

So Spark on three 0.159 is a guaranteed `TypeError` on the first `SplatMesh`, not a
degraded render. **No** published Spark version targets 0.159 — the earliest (0.1.0,
June 2025) was already built against three ^0.178.

### (b) PlayCanvas SuperSplat viewer · **declined, as expected**

`playcanvas/supersplat` and `playcanvas/supersplat-viewer` are MIT and good, but they
are **PlayCanvas-engine** artifacts. There is no way to put a SuperSplat into an
existing three.js `Scene`; adopting it means running a second 3D engine beside the one
Orbit and Mesh already use, with its own scene graph, its own renderer, its own camera
math, and no share of `controls.ts`. That breaks the "one viewer substrate" premise
this whole section of the proposal rests on. Declined on architecture, not quality.

### (c) `@mkkellogg/gaussian-splats-3d` · **checked because of (a), also blocked**

Worth checking once Spark turned out to be version-blocked, since it is the other
well-known MIT three.js-native splat renderer. It does not rescue us:

- `peerDependencies: { "three": ">=0.160.0" }` on **every** published version, including
  the 2024 ones — one minor above ours, but still above ours.
- Last release 2025-01-25, so "actively maintained through 2026" does not hold.
- No `.spz` — `.ply` / `.splat` / `.ksplat` only, and `.spz` is what our Modal splat
  stage emits.
- Wants a Web Worker and (for its fast path) `SharedArrayBuffer`, which needs COOP/COEP
  response headers the portal does not send.

**Conclusion at the time: the entire MIT Gaussian-splat ecosystem post-dates three
0.159.** No renderer choice unblocked this; the three.js version was the blocker.

---

## How it was unblocked

Exactly the sequence the evaluation named, in one lane:

1. **The legacy react-three-fiber viewer was retired**, not guarded. `src/components/
   rooms/viewer/` (the whole `RoomScanViewer` stack), the orphaned `room-scan-detail.tsx`,
   and the `react-three-fiber.d.ts` JSX shim are gone; `@react-three/fiber` and
   `@react-three/drei` leave designer-portal's manifest. That stack ran on fiber@8,
   which reads a React internal removed in React 19 — under React 19 it could only
   throw on mount and fall through `scan-viewer-sheet.tsx`'s ErrorBoundary to the
   still, so the sheet now renders that still directly and nothing is lost. It was
   also the sole source of the 12 type errors the bump used to produce: `@react-three/*`
   resolve their own `@types/three`, and with two copies in the tree every
   `Vector3`/`Matrix4`/`OrthographicCamera` crossing the boundary was a different type.
   (client-portal keeps r3f and its error boundary until its own port.)
2. **three + @types/three → 0.180.0, exact pins.** Fallout in the surviving consumers
   was nil, as predicted: `orbit/` and `model/` use only bedrock APIs, nothing removed
   between 0.159 and 0.180, and `_useLegacyLights` was already `false` at 0.159 so the
   Mesh light rig kept its values. `type-check` is clean with no source change.
3. **`public/three/` re-vendored** per its own recipe. The three Draco files came
   across byte-identical to the 0.159 ones; only the two basis transcoders moved.
4. **`@sparkjsdev/spark` pinned at 2.1.0** and `splat-canvas.tsx` written.

## What `splat-canvas.tsx` is

A near-copy of `model/model-canvas.tsx` — the same StrictMode-safe imperative shape,
reached only through `dynamic(() => import('./splat-canvas'), { ssr:false })` from
`splat-stage.tsx`, so Spark lands in a chunk that loads on the first Splat mount and
never on a Plan-, Orbit-, or Mesh-only visit. `__tests__/splat-chunk-boundary.test.ts`
holds that line as a source contract, the way `model/` holds its own.

Four differences from Mesh, all as the evaluation predicted:

1. **No lights.** A splat carries its own radiance; `model-scene.ts`'s hemisphere +
   key rig would only wash it. The scene is the `SparkRenderer`, the `SplatMesh`, and
   the cream background, nothing else — asserted in `splat-scene.test.ts`.
2. **A `SparkRenderer` in the scene**, constructed from our own `WebGLRenderer` and
   added before the `SplatMesh`. Its `onDirty` callback is wired straight into
   `invalidate()`: that is how an on-demand loop learns an async sort or LOD update
   finished and the frame on screen is now stale. Spark's quick-start uses
   `setAnimationLoop` and never needs this; we do.
3. **An `await` inside the frame** — `await spark.update({ scene, camera })` before
   `gl.render(...)`, because sorting is async. The rAF coalescer is unchanged; what is
   added around it is a serializer (`rendering`/`pending`, so two `update()` calls
   cannot interleave) and a `cancelled` re-check after the await, because teardown can
   land mid-frame and `gl.render` on a disposed context is a hard error.
4. **Library-owned disposal.** `disposeSplatParts` calls `splatMesh.dispose()` then
   `spark.dispose()` in place of `model-scene.ts`'s geometry/material/texture walk — a
   splat holds packed GPU buffers, not three resources, so that walk would free
   nothing. Each call is isolated so a throw out of one cannot strand the other
   (upstream [#237] reports disposal not always dropping memory). The `cancelled`
   late-arrival guard from `model-canvas.tsx` carries over and disposes the same way.

One more, small: the `WebGLRenderer` is built with `antialias: false`, per Spark's own
guidance — MSAA does nothing for gaussians (the primitives are already soft) and costs
real frame time. Mesh keeps antialiasing because its hard edges need it.

Camera framing reuses `orbit/controls.ts`'s `frameRoom` exactly as `model-scene.ts`'s
`frameModel` does — the radius band is a pure ratio of the plan diagonal, so a
metre-scaled splat frames like a metre-scaled GLB with one piece of control math.
`frameSplat` takes a `THREE.Box3` rather than an `Object3D` because a `SplatMesh` holds
no three geometry for `Box3.setFromObject` to measure; the bounds come from the library
(`SplatMesh.getBoundingBox()`).

**Nothing was vendored into `public/three/` for Spark, and nothing needs to be.** Its
Rust splat-decode WASM ships inlined as a `data:application/wasm;base64,…` URI inside
the JS, so there is no file to serve and no decoder path to configure.

## The one thing the evaluation got wrong

The evaluation concluded that the inlined WASM meant "no second request, so no CSP
allowance to make." **That is false, and only a browser could have shown it.** The
inlining removes the *file*, not the *fetch*: wasm-bindgen's init does

```js
module_or_path = new URL("data:application/wasm;base64,…");
…
await fetch(module_or_path)
```

and a `fetch()` of a `data:` URL is governed by `connect-src` exactly like any other.
The portal's `connect-src` had no `data:`, so `SplatMesh.staticInitialize()` rejected
with a bare `TypeError: Failed to fetch` — thrown from inside the library, out of
reach of the stage's ErrorBoundary — and the stage sat on "Bringing the walkthrough
up…" forever. Every unit test was green throughout; jsdom has no CSP.

`next.config.js` now carries `data:` in `connect-src` for both environments, with the
reasoning at the directive, and `lib/__tests__/next-config-csp.test.ts` pins it in
both. The grant is narrow: a `data:` URL carries bytes the document already holds, so
it reaches no network origin and is not an exfiltration path.

This is the same class of trap as the `worker-src 'self' blob:` line the Mesh
projection's Draco/KTX2 transcoders needed — a renderer's real request surface not
matching the one its packaging implies.

## Driving it

`/fixtures/splat/room-fixture.ply` is a committed, deterministic 360-gaussian fixture
(see its README):

```
http://localhost:3000/room/<scanId>?splatUrl=/fixtures/splat/room-fixture.ply
```

The override reaches `useSplatUrl` via `dev-splat-url.ts`, which hands the stage a URL,
which mounts the canvas. `NODE_ENV` is inlined at build time, so the guard folds to a
constant `null` in production and the parameter is inert there.

## The data seam

`useSplatUrl` (`packages/supabase/src/hooks/use-splat-url.ts`) is the only thing that
knows where a splat lives. Its header carries the full W2 read-path contract:
`room_files.artifacts.splat` → `media_objects` → `scan_media_read` → a typed
`/v1/scan/*` route → a capability URL on R2, with the reason each rung is not
reachable yet. The portal never parses the `artifacts` jsonb itself, and when the read
path lands, `url` starts arriving with no change to any component here.

[#237]: https://github.com/sparkjsdev/spark/issues/237
