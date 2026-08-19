# Splat fixture (dev + test)

`room-fixture.ply` is a tiny Gaussian-splat file used to drive Room View's Splat
projection without a trained artifact, a Room File, or the W2 read path:

```
http://localhost:3000/room/<scanId>?splatUrl=/fixtures/splat/room-fixture.ply
```

The `?splatUrl=` override is dev-only and same-origin-only — `process.env.NODE_ENV`
folds it to a constant `null` in the production bundle, so this file is inert in prod
(see `src/components/document/rooms/room-view/splat/dev-splat-url.ts`).

## Provenance

Generated, not downloaded. Nothing here came from a third party.

| Property | Value |
|---|---|
| Generator | `apps/designer-portal/scripts/make-splat-fixture.mjs` |
| Format | 3DGS convention, `format binary_little_endian 1.0` |
| Vertex properties | `x y z · nx ny nz · f_dc_0..2 · opacity · scale_0..2 · rot_0..3` |
| Gaussians | 360 (6 room surfaces × 60) |
| Size | 24,978 bytes |
| sha256 | `16560222fd86a29ba13ab06404a9bcfa59280922c529005e52f456c695bdf06c` |

The point set comes from a fixed-seed LCG, so `node scripts/make-splat-fixture.mjs`
reproduces those bytes exactly. The sha256 above is a real regression signal, and
`splat/__tests__/splat-fixture.test.ts` asserts both the header contract and the hash.

## Why this property layout

It is the layout the original 3D Gaussian Splatting implementation (Kerbl et al.)
writes and that every splat renderer reads — positions raw, opacity stored as a
logit, scales stored as logs, rotation as a `wxyz` quaternion, colour as the DC term
of a spherical-harmonics expansion (`colour = 0.5 + 0.28209479177387814 · f_dc`). The
`nx/ny/nz` normals are unused by 3DGS and present only because the convention keeps
them.
