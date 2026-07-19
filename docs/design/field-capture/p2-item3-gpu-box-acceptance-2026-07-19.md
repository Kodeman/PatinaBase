# P2 item 3 — DeskDev GPU box acceptance

**Date:** 2026-07-19  
**Host:** `DeskDev` / worker prefix `DeskDevProcess-1`  
**Scope:** dependency and sandbox qualification only; no GPU-stage queue claim,
business-table write, Storage write, or scan processing.

## Verdict

P2 item 3's real-box dependency gate passed. The doctor-only systemd twin ran
with temporary `STAGES=refine,fuse,splat` under the worker's installed GPU
sandbox and completed both cold- and warm-cache passes. The queue worker stayed
inactive and its persistent stage list remained the safe CPU set.

This closes package/runtime qualification for the GPU toolchain. It does **not**
qualify P2 item 4's exact PyCOLMAP database/model APIs, GPU-SIFT reconstruction
fixture, Field/Core Image raster mapping, Refine handler, or scan `95266be1`.

## Host and toolchain evidence

- Ubuntu 24.04.3 LTS; RTX 2080 Ti (`sm_75`), driver `580.159.03`.
- Managed CUDA toolkit: `/usr/local/cuda-11.8`, `nvcc` 11.8.89.
- Existing `/usr/bin/nvcc` remained CUDA 12.0; the worker/doctor GPU drop-ins
  select CUDA 11.8 explicitly.
- GCC/G++ 11.5, CMake 3.28.3, Ninja 1.11.1.
- A standalone CUDA 11.8 compile/runtime smoke returned:
  `CUDA_SMOKE_OK device=NVIDIA GeForce RTX 2080 Ti value=118`.
- COLMAP 4.0.2, commit `d927f7e`, built with CUDA and installed under
  `/opt/colmap/4.0.2`; retained build evidence is at
  `/mnt/ada-data/Patina/.patina-builds/patina-colmap-4.0.2-1000`.
- The installer verified `feature_extractor`, `sequential_matcher`,
  `exhaustive_matcher`, `point_triangulator`, `bundle_adjuster`, and
  `pose_prior_mapper` before activation.

## Doctor evidence

The acceptance used a root-only `/run` copy of the persistent environment and a
doctor-only `EnvironmentFile=` reset. It selected GCC/G++ 11, CUDA 11.8 runtime
libraries, `TORCH_CUDA_ARCH_LIST=7.5`, and a four-job Ninja cap. It never exposed
the temporary GPU stages to `patina-scan-worker.service`.

### Cold cache

Every required line was green:

- environment, Strata RPC, `room-scans` Storage, and RTX 2080 Ti visibility;
- COLMAP 4.0.2 CUDA command surface and `pycolmap==4.0.2`;
- Open3D 0.19.0 CUDA device plus real tensor operation;
- trimesh 4.12.2;
- `/usr/local/cuda-11.8/bin/nvcc` reporting 11.8;
- torch 2.4.1+cu118 on `sm_75` plus real CUDA operation;
- gsplat 1.5.3 public CUDA rasterization; and
- all seven XDG/torch/CUDA/JIT cache paths writable in the systemd sandbox.

The first gsplat extension setup reported 130.11 seconds. systemd reported
8 minutes 3.176 seconds of aggregate CPU consumption for the cold doctor; that
is CPU accounting, not a wall-clock reconstruction result.

### Warm cache

The second doctor repeated the complete green check set. systemd reported
7.383 seconds of CPU consumption, proving the cached gsplat path was materially
faster. The acceptance cleanup completed and the final worker posture was
`inactive`.

## Production queue preflight

A read-only Strata query checked `public.agent_tasks` for
`scan_pipeline.refine`, `scan_pipeline.fuse`, and `scan_pipeline.splat` in
`queued`, `running`, or `failed` state. It returned zero rows. No production row
was changed.

## Code closeout

Remote `main` commit `14b01e89` hardens the emitted and documented acceptance
packet with the exact temporary JIT environment, per-run journal cursors,
pre-existing runtime-drop-in rejection, doctor quiescence checks, root-only
secret handling, and fail-safe worker-posture restoration. Focused acceptance
tests passed 7/7; the preceding complete evidence was 94 installer tests and
310 scan-pipeline tests. An independent adversarial review found no remaining
blocker.

## Remaining gates

1. Keep persistent GPU stages disabled and unregistered.
2. Qualify exact COLMAP/PyCOLMAP 4.0.2 database/model calls and GPU SIFT on a
   deterministic multiview fixture.
3. Prove the physical Field/Core Image HEIC raster mapping and Linux
   materializer on a real Pro-line iPhone fixture.
4. Only then build and locally prove the lease-aware Refine handler; do not run
   `95266be1` through production DB/Storage before its local-scratch gate.

