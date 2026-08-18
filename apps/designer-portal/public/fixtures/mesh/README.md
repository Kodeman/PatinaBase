# `room-fixture.glb` — the Mesh projection's committed fixture

Rendered Room v2, W2. Sibling of `../splat/room-fixture.ply`, for the same reason:
local dev has no `room_scans` row carrying `model_url_gltf`, so without this there is
no way to see whether `ModelStage` actually draws until a real capture lands — which
made the three.js 0.180 bump unverifiable in the one place it mattered.

## What it is

A room-shaped box, hand-written by `../../../scripts/make-mesh-fixture.mjs`:

| | |
|---|---|
| Size | 4.8 m × 2.6 m × 3.6 m, floor at y = 0 (metres, a RoomPlan GLB's units) |
| Geometry | 8 vertices, 12 triangles, `POSITION` + indices, nothing else |
| Materials | none — glTF's default, so no texture path to resolve |
| Compression | none — no Draco, no KTX2 |
| Size on disk | 760 bytes |

Deliberately plain. Draco and KTX2 are exercised by real scans; what this fixture is
for is the path a three.js version bump puts at risk — `GLTFLoader.parse` →
`buildModelScene` → framing → `WebGLRenderer`. It depends on no toolchain and cannot
drift: `node scripts/make-mesh-fixture.mjs` rewrites it byte-identically.

## Driving it

`ModelStage` has **no dev-override seam** and deliberately did not get one — its URL
comes from `useSignedScanModelUrl`, which passes a non-Supabase URL through untouched.
So a local scan is pointed at the fixture directly:

```sql
update room_scans
   set model_url_gltf = 'http://localhost:3000/fixtures/mesh/room-fixture.glb'
 where id = '<scan-id>';
```

`hasMeshModel` then opens the MESH mode and the canvas loads it. Revert with
`set model_url_gltf = null` when finished — this is a local-database convenience, not
a fixture the app is ever meant to reach on its own.
