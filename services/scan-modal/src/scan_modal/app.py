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
from typing import Any, Callable

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
# Modal Secret holding R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.
R2_SECRET_NAME = "scan-r2"

VERIFY_TIMEOUT_SECONDS = 1800
# splatfacto is 10–25 minutes on an L4 (plan §4); 3600 s leaves room for the
# download/transcode head and the export/compress tail without letting a wedged
# run bill for an hour more than that.
SPLAT_TIMEOUT_SECONDS = 3600
RENDERS_TIMEOUT_SECONDS = 1800

SPLAT_GPU = "L4"
RENDERS_GPU = "L40S"

# The preemption-resume Volume. `splat` keeps its whole job-keyed workspace
# here — transcoded frames, transforms.json, and nerfstudio's checkpoints — so a
# preempted run resumes instead of restarting. See jobs/splat_job.py.
SPLAT_CACHE_VOLUME = "patina-scan-splat-cache"
SPLAT_CACHE_MOUNT = "/splat-cache"

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
        )
        .pip_install(
            "torch==2.5.1", "torchvision==0.20.1",
            extra_index_url="https://download.pytorch.org/whl/cu124",
        )
        .pip_install(
            "gsplat==1.5.3",
            "nerfstudio==1.1.5",
            # HEIC decode for the captured photos (PosedPhotoService writes
            # image/heic); PIL cannot read them without this opener.
            "pillow-heif>=0.18",
            "psycopg[binary]>=3.1",
            "boto3>=1.34",
            "httpx>=0.24,<1.0",
            "spz>=0.0.1",
        )
        # The SPZ 4 compressor. The PyPI `spz` wheel exposes load/build, not a
        # PLY→SPZ entry point, so the CONVERTER is the Rust CLI. Ubuntu 22.04's
        # packaged cargo is too old for a 2026 crate, hence rustup.
        .run_commands(
            "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs "
            "| sh -s -- -y --profile minimal",
            "/root/.cargo/bin/cargo install spz-cli --root /usr/local",
        )
        .env({"PATH": "/usr/local/bin:/usr/local/nvidia/bin:/usr/local/cuda/bin:"
                      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"})
        .add_local_python_source("scan_modal")
    )

    # ── renders: Modal's published Blender pattern ───────────────────────────
    # The `bpy` wheel rather than a Blender install, with the X libraries its
    # headless startup still links against. bpy 4.5.x is the LTS line and is
    # built for CPython 3.11, which is why PYTHON_VERSION is pinned there.
    _RENDERS_IMAGE = (
        modal.Image.debian_slim(python_version=PYTHON_VERSION)
        .apt_install("xorg", "libxkbcommon0")
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
