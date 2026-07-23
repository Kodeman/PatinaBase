# Field Capture P2 Item 4A — DeskDev COLMAP qualification

Date: 2026-07-22

Host: `DeskDev`

Scope: exact COLMAP/PyCOLMAP API and GPU-SIFT fixture only

## Verdict

**PASS.** The third immutable evidence attempt passed the Item 4A synthetic
known-pose qualification:

```text
/var/lib/patina/scan-work/qualification/item4a-colmap-4.0.2-v3/
```

Its manifest-last receipt is:

```text
colmap-qualification-receipt-v1.json
payloadSha256=7d60da6b6f67c864e4584b417ed36c209ceea4aee1b9811441d244574f40f278
```

The operator independently re-read the receipt as raw bytes, proved canonical
JSON byte equality, removed `payloadSha256`, recomputed the canonical payload
digest, and matched the value above. The receipt reports
`schemaVersion=1`, qualification `p2-item4a-colmap-known-pose`, and
`status=passed`.

## Runtime evidence

- COLMAP CLI: `4.0.2`, commit `d927f7e`, built with CUDA.
- PyCOLMAP: `4.0.2`, same COLMAP commit, `has_cuda=True`.
- CUDA toolkit selected for the worker: `11.8`.
- GPU: NVIDIA GeForce RTX 2080 Ti (`sm_75`).
- Driver observed during box qualification: `580.159.03`.
- GPU SIFT feature counts for the five deterministic fixture images:
  `2951`, `2965`, `3024`, `2941`, and `2927`.
- Explicit-pair initial/guided correspondence populations:
  `(1478,1732)`, `(1047,1253)`, `(1671,1918)`, `(1620,1732)`, and
  `(1502,1686)`. Guided correspondence counts may exceed initial putative
  counts because COLMAP stores these as separate database populations.
- The binding bundle-adjustment control converged in 9 iterations over 16,898
  residuals and 6,155 parameters, reducing cost from `0.212218 px` to
  `0.211744 px`.

The harness also proved exact image/camera ID preservation, PINHOLE rewrite,
known-pose seed construction, triangulation, authoritative PyCOLMAP bundle
adjustment, finite model re-open, version mismatch rejection, bounded logs, and
receipt-last publication under the policy in
`p2-item4a-colmap-qualification-runbook.md`.

## Preserved failure evidence

The earlier directories remain immutable and have no pass receipt:

- `item4a-colmap-4.0.2-v1` — installed PyCOLMAP was the CPU-only build
  (`has_cuda=False`).
- `item4a-colmap-4.0.2-v2` — the first CUDA run exposed an invalid qualifier
  assumption that guided correspondences could not exceed initial putative
  matches.

Neither directory was deleted, renamed, emptied, or overwritten. The v3 run
used the corrected accounting contract and a new output directory.

## Safety posture and boundary

The qualification made no queue, Strata, or Storage mutation. After the pass:

```text
patina-scan-worker=inactive
STAGES=ingest,solve,drawings
```

This closes the exact COLMAP 4.0.2/PyCOLMAP 4.0.2 API, CUDA GPU-SIFT, seed,
triangulation, and bundle-adjustment tiny-fixture gate. It does **not** qualify:

- the physical Field/Core Image HEIC-to-raster convention;
- the production materializer;
- real-room overlap or measurable refinement on scan `95266be1`;
- the queue/storage Refine handler;
- Fuse, Splat, mesh-solve, or the four-manifest Present join; or
- production registration or GPU stage activation.

Refine remains unregistered, the persistent worker remains on its CPU stage
set, and DeskDev suspend must be disabled (or the lease clock made
suspend-aware) before any later Refine enablement.
