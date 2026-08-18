# Splat — Room View's fourth projection

Rendered Room v2, W2 · PROPOSAL §4 "One viewer substrate"

Plan is the measured drawing. Orbit is the synthetic diagram. Mesh is the scan's own
geometry. **Splat is the room as photographed** — a Gaussian-splat radiance field
trained from the walk's posed keyframes, seen and never measured against.

What is in this directory today: the data seam, the mode gate, and the stage with its
quiet states. What is not: the WebGL canvas. This document records why, with the
evidence, so the next person does not re-run the evaluation.

---

## Renderer evaluation

Two MIT candidates were named in the brief; a third came up during the evaluation.
All three were checked against the real published packages, not their marketing.

### (a) Spark — `@sparkjsdev/spark` · **the right renderer, blocked**

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
| **WASM** | Yes (Rust splat decode/LOD) — but **inlined as a `data:application/wasm;base64,…` URI inside the JS**. There is no separate `.wasm` file to serve and no `setDecoderPath` equivalent, so **the `public/three/` vendoring pattern does not apply and nothing needs to be committed.** This is strictly better than Draco/Basis for our CSP: there is no second request to allow. |
| Disposal | `SplatMesh.dispose()` frees its packed buffers; `SparkRenderer.dispose()` frees the renderer's. (Open upstream issue [#237] reports memory not always dropping — worth watching when the canvas lands.) |
| Render loop | Splat sorting is async. The quick-start uses `setAnimationLoop`, but on-demand works: `await spark.update({ scene, camera })` before each `renderer.render(...)`. That is one `await` inside our existing `invalidate()` coalescer. |
| Packaging | ESM + CJS, ships its own `.d.ts`, no `window`/`document` at module scope |

**The blocker, and it is hard:**

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

**Conclusion: the entire MIT Gaussian-splat ecosystem post-dates three 0.159.** There
is no renderer choice that unblocks this; the three.js version is the blocker.

---

## What unblocks the canvas

`apps/designer-portal` must move to **three ≥ 0.180** (`three` + `@types/three`).
That is one line each, and the room-view code itself is ready for it — Orbit and Mesh
use only bedrock APIs (`BoxGeometry`, `LineSegments`, `PerspectiveCamera`,
`WebGLRenderer`, `GLTFLoader`/`DRACOLoader`/`KTX2Loader`), nothing removed between
0.159 and 0.180, and `WebGLRenderer._useLegacyLights` is already `false` in 0.159 so
the Mesh light rig does not change value.

**But the bump does not land alone, which is why this lane did not take it.** It was
attempted and reverted. `pnpm --filter @patina/designer-portal type-check` fails with
12 errors, all in the legacy react-three-fiber viewer at
`src/components/rooms/viewer/` (`ElevationCamera.tsx`, `FloorPlanCamera.tsx`,
`WalkthroughControls.tsx`, `RoomModel.tsx`) — `@react-three/fiber@8` and
`@react-three/drei@9` resolve their own `@types/three`, and with two copies in the
tree every `Vector3`/`Matrix4`/`OrthographicCamera` crossing the boundary is a
different type. That stack is the one PROPOSAL §4 says to **"remove or guard"**; it is
still live-referenced (`components/document/overlays/scan-viewer-sheet.tsx` lazily
imports `RoomScanViewer`), so retiring it is a product decision belonging to that
item, not a side effect of adding a projection.

**Sequence: retire/guard the r3f viewer → bump three to ≥0.180 → re-vendor the
Draco/Basis decoders per `public/three/README.md`'s own recipe → add
`@sparkjsdev/spark` at an exact pin → write `splat-canvas.tsx`.**

## What `splat-canvas.tsx` will be

A near-copy of `model/model-canvas.tsx` — the same StrictMode-safe imperative shape,
reached only through `dynamic(() => import('./splat-canvas'), { ssr:false })` from
`splat-stage.tsx` so Spark lands in a chunk that loads on the first Splat mount and
never on a Plan-only visit. Four differences, all known now:

1. **No lights.** A splat carries its own radiance; `model-scene.ts`'s hemisphere +
   key rig would be meaningless here. The scene is the `SparkRenderer`, the
   `SplatMesh`, and the cream background, nothing else.
2. **A `SparkRenderer` in the scene**, constructed from our own `WebGLRenderer` and
   added before the `SplatMesh`.
3. **An `await` inside `invalidate()`** — `await spark.update({ scene, camera })`
   before `gl.render(...)`, because sorting is async. The rAF coalescer stays; only
   the frame body becomes a promise.
4. **Library-owned disposal.** Teardown calls `splatMesh.dispose()` and
   `spark.dispose()` in place of `model-scene.ts`'s geometry/material/texture walk —
   a splat holds packed GPU buffers, not three resources. The `cancelled` late-arrival
   guard from `model-canvas.tsx` carries over unchanged and must dispose the same way.

Camera framing reuses `orbit/controls.ts`'s `frameRoom` exactly as `model-scene.ts`'s
`frameModel` does — the radius band is a pure ratio of the plan diagonal, so a
metre-scaled splat frames like a metre-scaled GLB with one piece of control math.

## Driving it before then

`/fixtures/splat/room-fixture.ply` is a committed, deterministic 360-gaussian fixture
(see its README). With the canvas in place:

```
http://localhost:3000/room/<scanId>?splatUrl=/fixtures/splat/room-fixture.ply
```

Today that override reaches the stage and the stage says the viewer is not in this
build — which is true, and is the whole design of the states in `splat-stage.tsx`.

## The data seam

`useSplatUrl` (`packages/supabase/src/hooks/use-splat-url.ts`) is the only thing that
knows where a splat lives. Its header carries the full W2 read-path contract:
`room_files.artifacts.splat` → `media_objects` → `scan_media_read` → a typed
`/v1/scan/*` route → a capability URL on R2, with the reason each rung is not
reachable yet. The portal never parses the `artifacts` jsonb itself, and when the read
path lands, `url` starts arriving with no change to any component here.

[#237]: https://github.com/sparkjsdev/spark/issues/237
