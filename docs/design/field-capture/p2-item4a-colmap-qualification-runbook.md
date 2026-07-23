# P2 Item 4A — COLMAP 4.0.2 qualification runbook

This is the non-mutating box/API qualification required by
`p2-item4-colmap-adapter-spike-2026-07-18.md`. It creates only a deterministic
synthetic fixture, a local SQLite database, sparse models, bounded logs, and a
receipt beneath an operator-selected scratch directory. It does not import or
call the Patina task queue, Strata, or Storage, and it does not register the
`refine` stage.

## Preconditions

- The Item 3 cold and warm GPU doctor runs both passed.
- The queue worker is stopped.
- The installed source contains
  `patina_scan_worker/colmap_qualification.py` and the shared exact engine seam
  `patina_scan_worker/refine_engine.py`.
- `/usr/local/bin/colmap` resolves to the pinned CUDA-enabled COLMAP 4.0.2
  installation, and `/usr/local/cuda-11.8/bin/nvcc` remains the isolated
  toolkit selected for the worker.
- `/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75` passes its
  manifest/hash/wheel-metadata checks, and the installed PyCOLMAP provenance is
  the direct local artifact (never the ordinary CPU-only PyPI wheel).

Install the current root-owned source snapshot while preserving the inactive
worker posture, then verify it stayed stopped:

```bash
test "$(systemctl is-active patina-scan-worker || true)" = inactive
sudo /opt/patina/scan-pipeline-source/install.sh --gpu --upgrade
test "$(systemctl is-active patina-scan-worker || true)" = inactive
test -f /opt/patina/scan-pipeline/.venv/lib/python3.*/site-packages/patina_scan_worker/colmap_qualification.py
test -f /opt/patina/scan-pipeline/.venv/lib/python3.*/site-packages/patina_scan_worker/refine_engine.py
```

The final `test -f` intentionally expands only the interpreter-version
directory under the root-owned installed venv. If more than one match appears,
inspect the release rather than guessing which interpreter is active.

## Run the qualification

Choose a new evidence directory. The harness refuses a symlink, a file, or a
non-empty directory, so it cannot blend a new receipt with stale evidence.
DeskDev's `v1` CPU-wheel failure, `v2` guided-match-accounting failure, and
passing `v3` receipt are immutable evidence: never delete, rename, empty, or
overwrite them. The accepted v3 receipt is recorded in
`p2-item4a-colmap-qualification-2026-07-22.md`. Any deliberate rerun starts at
the next unused suffix (`v4` or later). Do not source
`/etc/patina/scan-worker.env`; this command needs no Supabase credential.

```bash
item4a_parent=/var/lib/patina/scan-work/qualification
item4a_output=$item4a_parent/item4a-colmap-4.0.2-v4

sudo install -d -o patina -g patina -m 0700 \
  /var/lib/patina/scan-work/tmp "$item4a_parent"
sudo test ! -e "$item4a_output"

sudo -u patina env -i \
  HOME=/var/lib/patina \
  PATH=/opt/patina/scan-pipeline/.venv/bin:/usr/local/cuda-11.8/bin:/usr/local/bin:/usr/bin:/bin \
  CUDA_HOME=/usr/local/cuda-11.8 \
  CUDA_VISIBLE_DEVICES=0 \
  LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64 \
  TMPDIR=/var/lib/patina/scan-work/tmp \
  XDG_CONFIG_HOME=/opt/patina/scan-pipeline/.config \
  XDG_CACHE_HOME=/opt/patina/scan-pipeline/.cache \
  XDG_DATA_HOME=/opt/patina/scan-pipeline/.data \
  XDG_STATE_HOME=/opt/patina/scan-pipeline/.state \
  PYTHONUNBUFFERED=1 \
  /opt/patina/scan-pipeline/.venv/bin/python -m \
    patina_scan_worker.colmap_qualification \
    --output-dir "$item4a_output" \
    --colmap /usr/local/bin/colmap \
    --nvcc /usr/local/cuda-11.8/bin/nvcc \
    --nvidia-smi /usr/bin/nvidia-smi \
    --gpu-index 0

printf '%s\n' '-- worker remains stopped'
systemctl is-active patina-scan-worker || true
```

The harness applies qualification policy around the same exact PyCOLMAP 4.0.2
implementation a future Refine handler will import from
`patina_scan_worker.refine_engine`. It requests CUDA SIFT in
`CameraMode.PER_IMAGE`, rewrites each generated camera to the fixture's PINHOLE
intrinsics without changing image or camera IDs, matches only its explicit pair
file, constructs a registered known-pose seed with trivial rigs/frames, then
runs the pinned CLI's `point_triangulator` and a `bundle_adjuster` compatibility
probe. Because COLMAP 4.0.2's bundle-adjuster CLI can return zero even when its
solver fails, the authoritative adjustment is run through
`pycolmap.create_default_bundle_adjuster` and must report a usable solution with
positive residual count. The harness separately writes and reopens one
non-identity full `[R|t]` pose control and records expected/actual
`cam_from_world`; that control is not triangulated, so the primary synthetic
image geometry remains identity-oriented. It reopens each operational sparse
model to verify the database image/camera ID join, full pose shape, and exact
PINHOLE intrinsics, and verifies every seed pose and camera center. Every CLI
and binding log retained in the evidence directory is a hard-capped 64 KiB tail.

## Read the receipt

A successful run prints one JSON line ending in `"status": "passed"` and
publishes the receipt last:

```bash
item4a_receipt=$item4a_output/colmap-qualification-receipt-v1.json
sudo -u patina /opt/patina/scan-pipeline/.venv/bin/python -m json.tool \
  "$item4a_receipt"
```

The receipt uses canonical JSON, has no explicit wall-clock field, and does not
embed the selected output-directory path. It records the exact CLI/binding
versions, an intentional mismatch negative control, binary plus harness and
shared-engine source hashes,
GPU/driver/toolkit evidence, deterministic fixture and pair hashes, GPU SIFT
counts, before/after database IDs and intrinsics, verified pair counts,
seed/triangulated/adjusted model manifests, affirmative binding-solver evidence,
and the validated bounded-log inventory. Each retained raw log's SHA-256 and
size are bound into the receipt so later replacement or truncation is visible.

`payloadSha256` is an integrity digest of this specific empirical run, not a
cross-run reproducibility token. GPU keypoint/match/point counts and generated
COLMAP model/database bytes may legitimately differ across otherwise passing
GPU, driver, or library runs. COLMAP glog timestamps and elapsed-time lines also
make raw-log hashes run-specific. The fixture bytes, pair file, schema, sorting,
and configured random seeds are deterministic; the full real-host receipt is
not promised to be byte-identical across runs.

Pass requires all of the following in the receipt:

- CLI and binding both equal `4.0.2`, and the `0.0.0` binding negative control
  is rejected as `REFINE_ENGINE_VERSION_MISMATCH`;
- `toolchain.pycolmap.hasCuda` is true and every image has at least 40 GPU SIFT
  keypoints with an equal descriptor count;
- every camera rewrite says `idsPreserved: true`, `modelAfter: PINHOLE`, and
  carries the exact fixture dimensions and four parameters;
- every emitted explicit pair confirms guided matching and has at least 15
  initial putative matches plus 15 final guided geometry correspondences;
  these are independent database populations, so the guided count may exceed
  the initial count;
- seed, triangulated, and adjusted models retain the same image ID/name/camera
  ID join, full finite `cam_from_world`, and exact PINHOLE intrinsics; the
  operational seed preserves every exact input pose and camera center; the
  separate non-identity pose control has equal expected/actual 3×4 matrices;
  and the two post-triangulation models contain at least 20 points;
- the CLI bundle-adjuster compatibility probe writes a model, while the
  authoritative PyCOLMAP solver reports `usable: true`, a non-failure
  termination type, and a positive residual count; and
- every command and PyCOLMAP log is no larger than 65,536 bytes.

On failure the process exits 2 with a stable error code and does not publish a
receipt. Keep the scratch directory and bounded logs for diagnosis; choose a
new output directory for the next attempt instead of deleting or overwriting
the failed evidence.

## What this does not qualify

A passing receipt closes only the exact CLI/binding/API/GPU tiny-fixture gate.
It does not prove the real Field/Core Image HEIC raster convention, real-room
overlap or refinement improvement, runtime/VRAM on scan `95266be1`, any
queue/storage handler behavior, or the Fuse/Splat/Present join. Keep the worker
stopped and `refine` unregistered until those separate gates pass.
