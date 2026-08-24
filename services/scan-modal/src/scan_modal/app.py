"""Modal app: the `verify` function, the W2 stubs, and the spawn endpoint.

DELIVERY-PLAN R1 — Modal is a spawn target, never a poller and never a second
queue. `agent_tasks` stays the single queue of record; a billing-guarded edge
dispatcher claims tasks and POSTs them here, and this endpoint `.spawn()`s and
returns 202. Modal web endpoints are hard-capped at 150 s, so a stage that runs
minutes has to spawn rather than run inline behind the response.

Import-safety: `modal` and `fastapi` live in the Modal image, not in the unit
test environment. Everything above the `if modal is not None:` block — the auth
check, the payload contract, the dispatch decision — is plain Python that tests
exercise with the Modal layer faked.
"""

from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Any, Callable

from . import SPLAT_CACHE_MOUNT

__all__ = [
    "AUTH_SECRET_NAME",
    "TASK_FUNCTIONS",
    "check_bearer_token",
    "parse_spawn_body",
    "handle_spawn",
]

# ── deployment constants ────────────────────────────────────────────────────

APP_NAME = "patina-scan"
PYTHON_VERSION = "3.11"

# Modal Secret holding SCAN_MODAL_AUTH_TOKEN — the dispatcher's bearer token.
AUTH_SECRET_NAME = "scan-modal-auth"
AUTH_TOKEN_ENV = "SCAN_MODAL_AUTH_TOKEN"
# Modal Secret holding SCAN_WORKER_DSN (the scan_worker LOGIN role; R2 of the plan).
DB_SECRET_NAME = "scan-worker-db"

# Modal Secret for R2. It must carry ALL FOUR of these keys:
#
#   R2_ENDPOINT             https://<account_id>.r2.cloudflarestorage.com
#   R2_ACCESS_KEY_ID        R2 API token id
#   R2_SECRET_ACCESS_KEY    R2 API token secret
#   R2_ARTIFACTS_BUCKET     patina-staging-media-artifacts-us (staging)
#
# The BUCKET is the one that gets missed at provisioning, because the first three
# read as "the credential" and the fourth reads as configuration. It is neither
# defaulted nor hard-coded on purpose (`io/r2.artifacts_bucket()` raises without
# it): the staging and production buckets differ by one word, and a literal
# fallback is how a staging run ends up writing production artifacts. A missing
# value fails the task at upload time with `R2_ARTIFACTS_BUCKET is not set` —
# after the GPU has already been paid for, which is the cost of getting this
# wrong and the reason it is written down here.
R2_SECRET_NAME = "scan-r2"

VERIFY_TIMEOUT_SECONDS = 1800
# MEASURED, not planned. The plan's "10–25 minutes on an L4" was written before
# anything had run; W2 timed the real fixture (42 frames at 1440×1920) at 48.8
# ms/iter at step 4,550 and 119.2 ms/iter at step 7,470 — iteration cost more
# than doubles as densification proceeds, and 30,000 iterations extrapolates to
# ~55 minutes. 3600 s left no headroom at all for the download/transcode head
# and the export/compress tail, so a run that trained successfully would still
# have been killed. 7200 s is ~55 min of training plus the tail plus slack, and
# is still a hard ceiling on a wedged run. This number, `TRAIN_TIMEOUT_S` in
# splat_job, and the dispatcher's per-type visibility timeout are ONE budget in
# three places and move together — see W2-EVIDENCE.md §4 C.
SPLAT_TIMEOUT_SECONDS = 7200
RENDERS_TIMEOUT_SECONDS = 1800

# The SPZ converter, built from source in `_SPLAT_IMAGE` (see the image recipe
# below for why the crates.io/PyPI routes do not work). The commit is the
# v3.0.0 tag of github.com/nianticlabs/spz, pinned as a SHA because a tag can
# move and this is the provenance of a binary that touches every artifact.
SPZ_SOURCE_REPO = "https://github.com/nianticlabs/spz.git"
SPZ_SOURCE_TAG = "v3.0.0"
SPZ_SOURCE_COMMIT = "5bf2945de1a003cee07133b1e495fe9c6ffdc7e7"
SPZ_BINARY_PATH = "/usr/local/bin/ply_to_spz"

# The converter the pipeline actually calls. The stock CLI above has no version
# flag and therefore writes SPZ format version 4 (ZSTD streams, no outer gzip);
# `@sparkjsdev/spark` 2.1.0 — the portal's reader, and the newest published —
# gunzips every file and rejects any header version outside 1–3, so a v4
# artifact is unreadable in the viewer and 2.1.0 has no upgrade to reach for.
# `tools/ply_to_spz_v3.cpp` is the same 20 lines with `pack_options.version = 3`,
# built against the same pinned library. W2-EVIDENCE.md §10b fault 2.
SPZ_V3_BINARY_PATH = "/usr/local/bin/ply_to_spz_v3"

# Repo-owned sources copied into the image: the v3 CLI and the build-time proof
# that it writes v3. Resolved from this file rather than the process CWD so
# `modal deploy` works from anywhere in the monorepo.
_SCAN_MODAL_TOOLS = Path(__file__).resolve().parents[2] / "tools"
_SPZ_V3_SOURCE_IN_IMAGE = "/opt/patina-spz/ply_to_spz_v3.cpp"
_SPZ_SMOKE_IN_IMAGE = "/opt/patina-spz/spz_v3_smoke.py"

SPLAT_GPU = "L4"
RENDERS_GPU = "L40S"

# The preemption-resume Volume. `splat` keeps its whole job-keyed workspace
# here — transcoded frames, transforms.json, and nerfstudio's checkpoints — so a
# preempted run resumes instead of restarting. See jobs/splat_job.py.
#
# SPLAT_CACHE_MOUNT is imported from the package root rather than restated: this
# module mounts the Volume there and splat_job builds its workspace under it, and
# two literals that must agree are one literal that will eventually not.
SPLAT_CACHE_VOLUME = "patina-scan-splat-cache"

# taskType (as it appears in agent_tasks) → the Modal function that serves it.
TASK_FUNCTIONS: dict[str, str] = {
    "scan_pipeline.verify": "verify",
    "scan_pipeline.splat": "splat",
    "scan_pipeline.renders": "renders",
}

# `leaseToken` is required, not optional. It is the per-invocation claim owner
# 00490's wrappers check `agent_tasks.locked_by` against before ANY write, so a
# job spawned without one could not write its outcome at all — better to refuse
# the dispatch with a 400 than to burn a GPU on work that cannot be recorded.
# The canonical example of this body is
# supabase/functions/dispatch-scan-modal/contract.json; tests/test_contract.py
# holds both sides to it.
_REQUIRED_FIELDS = ("taskId", "leaseToken", "scanId", "roomFileId", "roomFileVersion", "taskType")


# ── the pure dispatch seam ──────────────────────────────────────────────────

def check_bearer_token(headers: dict[str, str], expected: str | None) -> tuple[bool, str]:
    """Constant-time bearer check. Returns (ok, reason)."""
    if not expected:
        return False, "auth_not_configured"
    lookup = {k.lower(): v for k, v in headers.items()}
    supplied = lookup.get("authorization") or ""
    scheme, _, token = supplied.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False, "missing_bearer"
    if not hmac.compare_digest(token.strip(), expected):
        return False, "bad_token"
    return True, "ok"


def parse_spawn_body(body: Any) -> tuple[dict[str, Any] | None, str]:
    """Validate the dispatch message. Returns (payload, reason)."""
    if not isinstance(body, dict):
        return None, "body_not_object"
    missing = [f for f in _REQUIRED_FIELDS if body.get(f) in (None, "")]
    if missing:
        return None, f"missing_fields:{','.join(missing)}"
    inputs = body.get("inputs")
    if inputs is not None and not isinstance(inputs, dict):
        return None, "inputs_not_object"
    return (
        {
            "taskId": body["taskId"],
            "leaseToken": body["leaseToken"],
            "scanId": body["scanId"],
            "roomFileId": body["roomFileId"],
            "roomFileVersion": body["roomFileVersion"],
            "taskType": body["taskType"],
            "traceId": body.get("traceId"),
            "inputs": inputs or {},
        },
        "ok",
    )


def resolve_function_name(task_type: Any) -> str | None:
    """Map a taskType to a Modal function name, tolerating the bare stage name."""
    if not isinstance(task_type, str):
        return None
    key = task_type if task_type in TASK_FUNCTIONS else f"scan_pipeline.{task_type}"
    return TASK_FUNCTIONS.get(key)


def handle_spawn(
    headers: dict[str, str],
    body: Any,
    spawner: Callable[[str, dict[str, Any]], Any],
    expected_token: str | None = None,
) -> tuple[int, dict[str, Any]]:
    """Authorize, validate, spawn. Returns (http_status, json_body).

    `spawner` takes (function_name, payload) — the Modal layer in production, a
    fake in tests.
    """
    token = expected_token if expected_token is not None else os.environ.get(AUTH_TOKEN_ENV)
    ok, reason = check_bearer_token(headers, token)
    if not ok:
        # A missing secret is a deploy fault, not a caller fault, and must not
        # read as "your token is wrong".
        status = 503 if reason == "auth_not_configured" else 401
        return status, {"spawned": False, "error": reason}

    payload, reason = parse_spawn_body(body)
    if payload is None:
        return 400, {"spawned": False, "error": reason}

    function_name = resolve_function_name(payload["taskType"])
    if function_name is None:
        return 400, {"spawned": False, "error": "unknown_task_type", "taskType": payload["taskType"]}

    spawner(function_name, payload)
    return 202, {"spawned": True, "taskId": payload["taskId"]}


# ── the Modal layer ─────────────────────────────────────────────────────────

try:
    import modal
except ImportError:  # unit tests, and any environment without the Modal client
    modal = None  # type: ignore[assignment]

if modal is not None:
    _VERIFY_IMAGE = (
        modal.Image.debian_slim(python_version=PYTHON_VERSION)
        # Open3D links against GL/OpenMP/X11 even for headless CPU segmentation.
        .apt_install("libgl1", "libgomp1", "libx11-6")
        .pip_install(
            "open3d>=0.18",
            "numpy>=1.26",
            "psycopg[binary]>=3.1",
            "boto3>=1.34",
            "httpx>=0.24,<1.0",
        )
        .add_local_python_source("scan_modal")
    )

    # ── splat: CUDA + nerfstudio(splatfacto)/gsplat + the SPZ tooling ────────
    #
    # A *devel* CUDA base, not runtime: gsplat compiles its CUDA kernels at
    # install/first-use and needs nvcc and the headers. This is the image the
    # plan warns costs real engineering time — "there is no Modal template for
    # Gaussian splatting" — and the pins are recorded in pyproject.toml's
    # [project.optional-dependencies] comments alongside the date they were
    # researched.
    _SPLAT_IMAGE = (
        modal.Image.from_registry(
            "nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python=PYTHON_VERSION
        )
        .apt_install(
            "git", "build-essential", "curl", "ffmpeg",
            # Open3D/OpenCV transitive loaders nerfstudio pulls in.
            "libgl1", "libglib2.0-0", "libsm6", "libxext6",
            # clang/cmake/ninja for the two nerfstudio HARD deps (no extras
            # marker excludes them) that build native extensions on install:
            # `fpsample` (scikit-build-core + CMake + pybind11, imported
            # unconditionally by nerfstudio's full_images_datamanager.py — the
            # datamanager splatfacto's own config wires up, so it loads at
            # `ns-train` startup regardless of method) and `pyliblzfse`
            # (viser's Record3D loader; plain distutils Extension, pulled in
            # transitively by viser==0.2.7 with no Linux wheel on PyPI, so it
            # always builds from sdist here). Root cause verified 2026-08-18
            # against a live build: Modal's `add_python` provisions a
            # python-build-standalone CPython built with clang, so
            # `sysconfig`'s baked-in CC is clang — distutils (pyliblzfse) and
            # CMake's Python-aware compiler detection (fpsample) both go
            # looking for `clang`, not `gcc`, and fail with "can't find a C++
            # compiler" when it isn't on PATH. A same-recipe repro against
            # apt's own (gcc-built) python3.11 builds both cleanly, isolating
            # the failure to the interpreter's compiler, not the extension
            # code. `build-essential` stays too: nvcc wants a gcc/g++ host
            # compiler for gsplat's CUDA kernels, a different toolchain need.
            "clang", "cmake", "ninja-build",
        )
        .pip_install(
            "torch==2.5.1", "torchvision==0.20.1",
            extra_index_url="https://download.pytorch.org/whl/cu124",
        )
        # Rust BEFORE the nerfstudio/spz pip layer, not after. The PyPI `spz`
        # Python package (installed below, for load/build) has no cp311 wheel
        # — only cp313 and an sdist — and its sdist build-backend is
        # `maturin` (a Rust/pyo3 extension). With no `cargo` on PATH yet,
        # maturin's own toolchain bootstrap hung silently for 20+ minutes
        # against a live build (2026-08-18) — plausibly it reaching out for a
        # Rust toolchain over a network Modal's build sandbox doesn't clear
        # fast, if at all, rather than failing fast the way a plain
        # "cargo: not found" would. Installing rustup here, and putting
        # `/root/.cargo/bin` on PATH for just this build stage, means
        # maturin finds a real cargo immediately instead of guessing at one.
        .run_commands(
            "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs "
            "| sh -s -- -y --profile minimal"
        )
        .env({"PATH": "/root/.cargo/bin:/usr/local/bin:/usr/local/nvidia/bin:"
                      "/usr/local/cuda/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"})
        .pip_install(
            # nerfstudio 1.1.5 pins gsplat==1.4.0 exactly (pip's resolver
            # refuses 1.5.3 as a ResolutionImpossible conflict — verified
            # 2026-08-18 against a live build). Follow nerfstudio's pin
            # rather than PyPI's newest gsplat.
            "gsplat==1.4.0",
            "nerfstudio==1.1.5",
            # HEIC decode for the captured photos (PosedPhotoService writes
            # image/heic); PIL cannot read them without this opener.
            "pillow-heif>=0.18",
            "psycopg[binary]>=3.1",
            "boto3>=1.34",
            "httpx>=0.24,<1.0",
            "spz>=0.0.1",
        )
        # ── the SPZ compressor: Niantic's own C++, built from a pinned tag ────
        #
        # The crates.io route this layer used to take does not work and cannot
        # be made to work. `cargo install spz --version 0.0.5` succeeds and puts
        # a binary on PATH whose ENTIRE command surface is `spz info` — there is
        # no `convert`, and 0.0.6 dropped the binary target altogether. The PyPI
        # `spz` wheel installed in the pip layer above is not a fallback either:
        # no cp311 wheel, and the maturin-built sdist does not import. So the
        # image shipped with no PLY→SPZ path at all, and every splat run would
        # have trained for tens of minutes and then failed at compression
        # (W2-EVIDENCE.md §4 B). Both are left installed above rather than
        # excised because removing them would invalidate the torch/nerfstudio
        # layers and force a full multi-hour rebuild to delete something inert.
        #
        # github.com/nianticlabs/spz is the REFERENCE implementation — the one
        # the format is defined by — and it ships three CLI tools behind
        # `SPZ_BUILD_TOOLS` (default ON): ply_to_spz, spz_to_ply, spz_info.
        # Only the first is installed here; the other two are dead weight in a
        # write-only stage.
        #
        # Pinned to the v3.0.0 tag BY COMMIT, and the SHA is asserted after the
        # checkout: a tag is a movable ref, and "we built the tag" is not the
        # same claim as "we built these bytes". zlib/zstd come from apt so
        # CMake's find_package succeeds — left to itself it FetchContents both
        # from the network at build time, which is a second set of downloads
        # that can fail on a day the image has to rebuild. The apt-get runs
        # HERE, in this layer, rather than in the image's `apt_install` call for
        # the same cache reason as above.
        #
        # THE VERSION PIN, AND WHY IT IS A SECOND BINARY RATHER THAN A PATCH.
        # `cli_tools/src/ply_to_spz.cpp` builds a default `spz::PackOptions`,
        # whose `version` is `LATEST_SPZ_HEADER_VERSION` = 4 at this commit, and
        # exposes no flag to change it. Version 4 is a different container, not
        # a variant: `saveSpz` writes a 32-byte plaintext NGSP header plus ZSTD
        # streams, where versions 1–3 take the `o.version <
        # MIN_ZSTD_SPZ_HEADER_VERSION` branch and gzip a 16-byte legacy header
        # plus one stream. Spark 2.1.0 reads only the latter. So the pipeline
        # builds its own 20-line CLI (`tools/ply_to_spz_v3.cpp`, repo-owned)
        # that sets `pack_options.version = 3` against this same library.
        #
        # Appended to the pinned CMakeLists rather than vendored as a separate
        # project so the tool links exactly what `ply_to_spz` links — zlib and
        # zstd reach it transitively through the static `spz` target, and
        # nothing here has to guess at link flags that CMake already resolved.
        # The append happens AFTER the SHA assertion above, so "we built these
        # bytes" still describes every upstream file.
        .add_local_file(
            str(_SCAN_MODAL_TOOLS / "ply_to_spz_v3.cpp"), _SPZ_V3_SOURCE_IN_IMAGE, copy=True
        )
        .add_local_file(
            str(_SCAN_MODAL_TOOLS / "spz_v3_smoke.py"), _SPZ_SMOKE_IN_IMAGE, copy=True
        )
        .run_commands(
            "apt-get update && apt-get install -y --no-install-recommends "
            "zlib1g-dev libzstd-dev && rm -rf /var/lib/apt/lists/*",
            "git clone https://github.com/nianticlabs/spz.git /opt/spz-src",
            f"git -C /opt/spz-src checkout {SPZ_SOURCE_COMMIT}",
            f'test "$(git -C /opt/spz-src rev-parse HEAD)" = "{SPZ_SOURCE_COMMIT}"',
            "printf '%s\\n' "
            f"'add_executable(ply_to_spz_v3 {_SPZ_V3_SOURCE_IN_IMAGE})' "
            "'target_link_libraries(ply_to_spz_v3 PRIVATE spz)' "
            "'target_include_directories(ply_to_spz_v3 PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)' "
            ">> /opt/spz-src/CMakeLists.txt",
            "cmake -S /opt/spz-src -B /opt/spz-src/build -DCMAKE_BUILD_TYPE=Release "
            "-DSPZ_BUILD_TOOLS=ON -DBUILD_TESTING=OFF",
            "cmake --build /opt/spz-src/build --target ply_to_spz ply_to_spz_v3 -j $(nproc)",
            f"install -m 0755 /opt/spz-src/build/ply_to_spz {SPZ_BINARY_PATH}",
            f"install -m 0755 /opt/spz-src/build/ply_to_spz_v3 {SPZ_V3_BINARY_PATH}",
            # Proves the binaries run in THIS image, at image-build time rather
            # than after an L4 has been paid for. argc < 3 prints the usage line
            # and exits 1, so a zero exit here would mean something unexpected.
            f"{SPZ_BINARY_PATH} 2>&1 | grep -q 'Usage: ply_to_spz'",
            f"{SPZ_V3_BINARY_PATH} 2>&1 | grep -q 'Usage: ply_to_spz_v3'",
            # And proves the OUTPUT, which is the claim that actually matters:
            # a real conversion of a real (tiny) splat PLY, asserted to be a
            # gzip container whose decompressed header carries magic NGSP and
            # format version 3 — plus the contrast assertion that the stock CLI
            # still writes plaintext v4, so the v3 result is measuring our flag
            # and not a library default. See tools/spz_v3_smoke.py.
            f"python -u {_SPZ_SMOKE_IN_IMAGE} "
            f"--v3-binary {SPZ_V3_BINARY_PATH} --stock-binary {SPZ_BINARY_PATH}",
            "rm -rf /opt/spz-src/build",
        )
        # Final runtime PATH: cargo drops out again. Nothing at runtime needs
        # `rustc`/`cargo` themselves — only the `spz` BINARY they built,
        # which `--root /usr/local` already placed in /usr/local/bin, already
        # on this PATH.
        .env({"PATH": "/usr/local/bin:/usr/local/nvidia/bin:/usr/local/cuda/bin:"
                      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"})
        # COLMAP for the optional pose-prior seed (`config.poseRefine: colmap`,
        # jobs/colmap_refine.py). Ubuntu 22.04's package is a CPU-capable build;
        # the pre-step drives it with `--Sift*.use_gpu 0` because a headless L4
        # has no GL context for GPU SIFT and CPU SIFT on ~42 frames is minutes.
        # Inert unless a task opts in. Appended as a LATE layer ON PURPOSE: put
        # in the early apt_install it would invalidate the torch/nerfstudio/spz
        # layers and force the multi-hour rebuild those layers' comments warn
        # about; here it is one cheap layer on top of them.
        .apt_install("colmap")
        .add_local_python_source("scan_modal")
    )

    # ── renders: Modal's published Blender pattern ───────────────────────────
    # The `bpy` wheel rather than a Blender install, with the X libraries its
    # headless startup still links against. bpy 4.5.x is the LTS line and is
    # built for CPython 3.11, which is why PYTHON_VERSION is pinned there.
    _RENDERS_IMAGE = (
        modal.Image.debian_slim(python_version=PYTHON_VERSION)
        # libgl1/libegl1 beyond Modal's published pair: the bpy wheel links
        # libGL/libEGL at IMPORT time even headless, and debian_slim ships
        # neither. Without them `import bpy` dies with
        # "libGL.so.1: cannot open shared object file" — the classic
        # bpy-in-a-container failure, and one that only shows up on the L40S.
        .apt_install("xorg", "libxkbcommon0", "libgl1", "libegl1")
        .pip_install(
            "bpy==4.5.0",
            "psycopg[binary]>=3.1",
            "boto3>=1.34",
            "httpx>=0.24,<1.0",
        )
        .add_local_python_source("scan_modal")
    )

    _ENDPOINT_IMAGE = (
        modal.Image.debian_slim(python_version=PYTHON_VERSION)
        .pip_install("fastapi[standard]")
        .add_local_python_source("scan_modal")
    )

    app = modal.App(APP_NAME)

    _splat_cache = modal.Volume.from_name(SPLAT_CACHE_VOLUME, create_if_missing=True)

    @app.function(
        image=_VERIFY_IMAGE,
        # No gpu kwarg by design: Open3D's segment_plane is CPU-backed even
        # through the tensor API, so a GPU here would bill for nothing.
        timeout=VERIFY_TIMEOUT_SECONDS,
        secrets=[modal.Secret.from_name(DB_SECRET_NAME)],
    )
    def verify(payload: dict) -> dict:
        from .jobs.verify_job import run_verify

        return run_verify(payload)

    @app.function(
        image=_SPLAT_IMAGE,
        gpu=SPLAT_GPU,
        timeout=SPLAT_TIMEOUT_SECONDS,
        volumes={SPLAT_CACHE_MOUNT: _splat_cache},
        # Preemption tolerance, cheaply: a preempted run is retried, finds its
        # checkpoint on the Volume under the same job key, and resumes rather
        # than paying for the first N thousand iterations twice. A retry whose
        # lease has since expired is refused with P0403 at its first ledger
        # write and exits clean, so this cannot double-write.
        retries=modal.Retries(max_retries=2, initial_delay=10.0),
        secrets=[modal.Secret.from_name(DB_SECRET_NAME), modal.Secret.from_name(R2_SECRET_NAME)],
    )
    def splat(payload: dict) -> dict:
        from .jobs.splat_job import run_splat

        # `commit` is what makes the checkpoint survive the container, not just
        # the process — an uncommitted Volume write is lost on preemption.
        return run_splat(payload, checkpoint_commit=_splat_cache.commit)

    @app.function(
        image=_RENDERS_IMAGE,
        gpu=RENDERS_GPU,
        timeout=RENDERS_TIMEOUT_SECONDS,
        secrets=[modal.Secret.from_name(DB_SECRET_NAME), modal.Secret.from_name(R2_SECRET_NAME)],
    )
    def renders(payload: dict) -> dict:
        from .jobs.renders_job import run_renders

        return run_renders(payload)

    _FUNCTIONS = {"verify": verify, "splat": splat, "renders": renders}

    def _spawn_modal_function(function_name: str, payload: dict) -> Any:
        return _FUNCTIONS[function_name].spawn(payload)

    # FastAPI decides "inject the Request" vs "bind a query parameter" from the
    # ANNOTATION alone. Left unannotated, `request` was read as a REQUIRED QUERY
    # PARAM, so every dispatch POST returned 422 before the bearer check ever
    # ran. The name is bound defensively because fastapi lives only in
    # _ENDPOINT_IMAGE — the verify/splat/renders images import this module too,
    # and never touch `spawn`. `from __future__ import annotations` makes the
    # annotation a string resolved against these module globals in-container.
    try:
        from fastapi import Request as _FastAPIRequest
    except ImportError:  # verify image, and the unit-test environment
        _FastAPIRequest = Any  # type: ignore[misc,assignment]

    @app.function(
        image=_ENDPOINT_IMAGE,
        secrets=[modal.Secret.from_name(AUTH_SECRET_NAME)],
    )
    @modal.fastapi_endpoint(method="POST")
    async def spawn(request: _FastAPIRequest):
        from fastapi.responses import JSONResponse

        try:
            body = await request.json()
        except Exception:
            body = None
        status, content = handle_spawn(
            headers=dict(request.headers),
            body=body,
            spawner=_spawn_modal_function,
        )
        return JSONResponse(status_code=status, content=content)
