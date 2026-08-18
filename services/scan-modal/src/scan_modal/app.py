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

SPLAT_GPU = "L4"
RENDERS_GPU = "L40S"

_W2_MARKER = "[W2] not implemented — Rendered Room v2 DELIVERY-PLAN W2"

# taskType (as it appears in agent_tasks) → the Modal function that serves it.
TASK_FUNCTIONS: dict[str, str] = {
    "scan_pipeline.verify": "verify",
    "scan_pipeline.splat": "splat",
    "scan_pipeline.renders": "renders",
}

_REQUIRED_FIELDS = ("taskId", "scanId", "roomFileId", "roomFileVersion", "taskType")


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

    _ENDPOINT_IMAGE = (
        modal.Image.debian_slim(python_version=PYTHON_VERSION)
        .pip_install("fastapi[standard]")
        .add_local_python_source("scan_modal")
    )

    app = modal.App(APP_NAME)

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
        image=_VERIFY_IMAGE,
        gpu=SPLAT_GPU,
        secrets=[modal.Secret.from_name(DB_SECRET_NAME), modal.Secret.from_name(R2_SECRET_NAME)],
    )
    def splat(payload: dict) -> dict:
        raise NotImplementedError(f"{_W2_MARKER}: splat (splatfacto → SPZ on {SPLAT_GPU})")

    @app.function(
        image=_VERIFY_IMAGE,
        gpu=RENDERS_GPU,
        secrets=[modal.Secret.from_name(DB_SECRET_NAME), modal.Secret.from_name(R2_SECRET_NAME)],
    )
    def renders(payload: dict) -> dict:
        raise NotImplementedError(f"{_W2_MARKER}: renders (Cycles via bpy on {RENDERS_GPU})")

    _FUNCTIONS = {"verify": verify, "splat": splat, "renders": renders}

    def _spawn_modal_function(function_name: str, payload: dict) -> Any:
        return _FUNCTIONS[function_name].spawn(payload)

    @app.function(
        image=_ENDPOINT_IMAGE,
        secrets=[modal.Secret.from_name(AUTH_SECRET_NAME)],
    )
    @modal.fastapi_endpoint(method="POST")
    async def spawn(request):  # noqa: ANN001 — fastapi.Request, resolved in-image
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
