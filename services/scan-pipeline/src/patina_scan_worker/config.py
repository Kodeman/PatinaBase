"""Runtime settings for the scan-pipeline worker.

Everything about a worker — its readable identity prefix, which stages it runs,
cadence, concurrency, GPU posture, and its one credential — comes from the
environment (an ``EnvironmentFile``, ``/etc/patina/scan-worker.env``). This is
what makes a cloud burst worker a config change, not a code change (design §3,
R108.4/R109.1).

Mirrors services/aesthete-inference/app/config.py: a frozen dataclass built by
``settings_from_env()``; the three required values have no default — the worker
refuses to start without them (the ``INFERENCE_TOKEN`` precedent).
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass, field

# The full set of stages this codebase knows about (design §2.1, §10). The P1
# CPU stages ingest/solve/drawings are implemented; the P2 stages refine/fuse/
# splat/present are DECLARED here so a box can advertise them (STAGES=…,splat)
# and `doctor` can gate on them, ahead of their handlers landing (items 4–7).
# A worker claiming a declared-but-unregistered stage parks that task cleanly
# (worker.process_one). Therefore item-3 readiness may advertise the GPU stages
# only inside a controlled empty-queue preflight window, followed by an immediate
# service stop. Production workers must not leave them listed until their item
# 4–7 handlers register.
# A worker's STAGES must be a subset of these.
KNOWN_STAGES: tuple[str, ...] = (
    "ingest", "solve", "drawings",       # P1 (implemented)
    "refine", "fuse", "splat", "present"  # P2 (items 4–7; refine/fuse/splat are GPU)
)

# The GPU-bearing stages (design §10.2/§10.3/§10.5). `doctor` makes its GPU
# checks REQUIRED (not warn-only) whenever a worker's STAGES intersect this set,
# and the GPU systemd unit variant + `install.sh --gpu` exist for exactly these.
GPU_STAGES: frozenset[str] = frozenset({"refine", "fuse", "splat"})

# task_type namespace — one type per stage (design §2.1).
TASK_TYPE_PREFIX = "scan_pipeline."

# The DEFAULT stays CPU-only: a box opts into GPU stages explicitly (STAGES=…),
# so an un-tuned/CPU worker never advertises a GPU task type.
DEFAULT_STAGES = "ingest,solve,drawings"

# W3-C: the pluggable storage transport (storage_backend.py). "supabase" is
# the only value that ships today's behavior; "r2" opts a worker into the
# boto3/R2 backend. `_VALID_STORAGE_SHADOW_TARGETS` is the dual-write cutover
# rung (storage_shadow.py) — unset (None) is the only value that ships today's
# behavior there too.
_VALID_STORAGE_BACKENDS: frozenset[str] = frozenset({"supabase", "r2"})
_VALID_STORAGE_SHADOW_TARGETS: frozenset[str] = frozenset({"r2"})

_VISIBILITY_TIMEOUT_RE = re.compile(
    r"^(?P<amount>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)$",
    re.IGNORECASE,
)
_VISIBILITY_TIMEOUT_FACTORS = {
    "s": 1.0,
    "sec": 1.0,
    "secs": 1.0,
    "second": 1.0,
    "seconds": 1.0,
    "m": 60.0,
    "min": 60.0,
    "mins": 60.0,
    "minute": 60.0,
    "minutes": 60.0,
    "h": 3600.0,
    "hr": 3600.0,
    "hrs": 3600.0,
    "hour": 3600.0,
    "hours": 3600.0,
}


class ConfigError(RuntimeError):
    """Raised when the environment is incomplete or invalid — the worker
    refuses to start rather than run half-configured."""


def _parse_visibility_timeout(raw: str) -> float:
    """Normalize the deliberately narrow lease interval grammar to seconds.

    PostgreSQL accepts a much broader interval language, but the worker must
    convert the exact claim interval into a monotonic deadline. Restricting the
    environment contract to positive seconds/minutes/hours prevents the client
    and database from assigning different meanings to an ambiguous interval.
    """

    match = _VISIBILITY_TIMEOUT_RE.fullmatch(raw.strip())
    if match is None:
        raise ConfigError(
            "VISIBILITY_TIMEOUT must be one positive seconds/minutes/hours "
            f"interval, got {raw!r}"
        )
    amount = float(match.group("amount"))
    factor = _VISIBILITY_TIMEOUT_FACTORS[match.group("unit").lower()]
    seconds = amount * factor
    if not math.isfinite(seconds) or seconds <= 0:
        raise ConfigError(
            f"VISIBILITY_TIMEOUT must resolve to positive finite seconds, got {raw!r}"
        )
    return seconds


@dataclass(frozen=True)
class Settings:
    # ── identity / behaviour (design §3) ────────────────────────────────────
    # Readable prefix only. QueueClient appends a UUID for every claim batch.
    worker_id: str
    supabase_url: str
    service_role_key: str
    stages: tuple[str, ...] = KNOWN_STAGES
    poll_seconds: int = 5
    max_concurrent: int = 2
    gpu: str = "auto"                       # 'auto' | 'off'
    # 60 min: a 500 MB bundle on a slow link can outrun a shorter lease and get
    # re-claimed mid-download (M1). The lost-race guard (queue.py) covers the
    # rare overrun; this default keeps it rare.
    visibility_timeout: str = "60 minutes"  # SQL interval literal
    max_attempts: int = 5
    room_scans_bucket: str = "room-scans"
    work_dir: str = "/var/lib/patina/scan-work"
    retention_hours: int = 48
    http_timeout_s: float = 30.0
    log_level: str = "info"

    # ── storage backend / cutover (W3-C, storage_backend.py) ────────────────
    # "supabase" is a no-op default — SCAN_STORAGE_BACKEND unset changes
    # nothing about the worker's runtime behavior. "r2" is not wired into
    # worker.py's Context.storage yet (that stays StorageClient, pinned by
    # refine_publisher's isinstance check); it exists for callers that build a
    # backend directly via storage_backend.build_storage_backend, ahead of the
    # originals-cutover wave doing that wiring for real.
    storage_backend: str = "supabase"
    # SCAN_STORAGE_SHADOW: None (default) disables dual-write; "r2" mirrors
    # every upload through the primary backend to R2 (storage_shadow.py), best
    # effort, never able to fail the primary write.
    storage_shadow: str | None = None
    # SCAN_STORAGE_SHADOW_LEDGER_PATH: unset falls back to
    # {work_dir}/shadow-storage-ledger.jsonl — see
    # effective_storage_shadow_ledger_path below.
    storage_shadow_ledger_path: str | None = None
    # SCAN_STORAGE_R2_*: required only when storage_backend == "r2" or
    # storage_shadow == "r2" (enforced in settings_from_env). Empty strings are
    # the "unset" sentinel so Settings stays a plain frozen dataclass.
    r2_endpoint: str = ""
    r2_bucket: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    # ── credential posture (W3-C investigation) ─────────────────────────────
    # `service_role_key` remains the Supabase Storage credential for
    # SupabaseStorageBackend. Storage authorizes via RLS on `storage.objects`,
    # keyed off the CALLER's JWT claims and the object key's path segments
    # (00077's {folder}/{userId}/{roomId}/… policy) — and this worker
    # legitimately touches every scan's owner, not one fixed identity, so
    # narrowing it needs either (a) a dedicated `scan_worker` auth identity
    # plus RLS policies recognizing it across every owner's objects (new
    # schema — out of this lane's rails; W3-A owns the one migration number
    # this wave gets), or (b) Supabase's newer secret/publishable API keys,
    # which are project-wide capabilities, not bucket- or path-scoped, so they
    # narrow nothing here. Neither is clean today, so the default stays
    # service-role, same as before this wave. SCAN_WORKER_STORAGE_TOKEN, if
    # set, overrides `service_role_key` on SupabaseStorageBackend's bearer/
    # apikey headers only (build_storage_backend, when it owns the session) —
    # so a future narrower credential is a config change, not a code change.
    # Retiring the service-role default is the R2-cutover wave's job
    # (DELIVERY-PLAN W3), the same precedent as the `scan_worker` Postgres
    # role in that document's R2.
    storage_token: str | None = None

    # Derived: the fully-qualified task types this worker claims.
    task_types: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        # Keep the PostgreSQL interval and monotonic duration one source of
        # truth even for direct construction/dataclasses.replace in tests or
        # future callers outside settings_from_env().
        _parse_visibility_timeout(self.visibility_timeout)

    @property
    def visibility_timeout_seconds(self) -> float:
        return _parse_visibility_timeout(self.visibility_timeout)

    @property
    def effective_storage_shadow_ledger_path(self) -> str:
        """``storage_shadow_ledger_path`` if set, else a default derived from
        ``work_dir`` — computed rather than stored so a later
        ``dataclasses.replace(settings, work_dir=...)`` keeps the two in
        lockstep without also needing to replace the ledger path."""
        if self.storage_shadow_ledger_path:
            return self.storage_shadow_ledger_path
        return os.path.join(self.work_dir, "shadow-storage-ledger.jsonl")

    def with_task_types(self) -> "Settings":
        tts = tuple(f"{TASK_TYPE_PREFIX}{s}" for s in self.stages)
        return _replace(self, task_types=tts)


def _replace(s: Settings, **kw) -> Settings:
    # dataclasses.replace but tolerant of the frozen field ordering.
    from dataclasses import replace

    return replace(s, **kw)


def _parse_stages(raw: str | None) -> tuple[str, ...]:
    if raw is None or raw.strip() == "":
        raw = DEFAULT_STAGES
    stages = tuple(s.strip() for s in raw.split(",") if s.strip())
    if not stages:
        raise ConfigError("STAGES resolved to an empty set")
    unknown = [s for s in stages if s not in KNOWN_STAGES]
    if unknown:
        raise ConfigError(
            f"STAGES contains unknown stage(s) {unknown}; known: {list(KNOWN_STAGES)}"
        )
    return stages


def settings_from_env(env: dict[str, str] | None = None) -> Settings:
    """Build (and validate) Settings from the process environment.

    Raises ConfigError on any missing required value or malformed field, so a
    misconfigured unit fails fast at start / at ``doctor`` rather than midway
    through a claim loop.
    """
    src = os.environ if env is None else env

    def req(name: str) -> str:
        val = src.get(name, "").strip()
        if not val:
            raise ConfigError(
                f"{name} is required and unset — the scan-pipeline worker refuses "
                f"to start without it. See services/scan-pipeline/README.md and "
                f"/etc/patina/scan-worker.env."
            )
        return val

    # Read required first so the error names the first missing var deterministically.
    worker_id = req("WORKER_ID")
    supabase_url = req("SUPABASE_URL").rstrip("/")
    service_role_key = req("SUPABASE_SERVICE_ROLE_KEY")

    gpu = (src.get("GPU") or "auto").strip().lower()
    if gpu not in ("auto", "off"):
        raise ConfigError(f"GPU must be 'auto' or 'off', got {gpu!r}")

    log_level = (src.get("LOG_LEVEL") or "info").strip().lower()

    # _int/_float read from os.environ; when an explicit env dict is passed, mirror
    # it into a temporary lookup by reading via src.get through small shims.
    def _int_src(name: str, default: int) -> int:
        raw = src.get(name)
        if raw is None or str(raw).strip() == "":
            return default
        try:
            return int(raw)
        except ValueError as exc:
            raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc

    def _float_src(name: str, default: float) -> float:
        raw = src.get(name)
        if raw is None or str(raw).strip() == "":
            return default
        try:
            return float(raw)
        except ValueError as exc:
            raise ConfigError(f"{name} must be a number, got {raw!r}") from exc

    visibility_timeout = (src.get("VISIBILITY_TIMEOUT") or "60 minutes").strip()

    storage_backend = (src.get("SCAN_STORAGE_BACKEND") or "supabase").strip().lower()
    if storage_backend not in _VALID_STORAGE_BACKENDS:
        raise ConfigError(
            f"SCAN_STORAGE_BACKEND must be one of {sorted(_VALID_STORAGE_BACKENDS)}, "
            f"got {storage_backend!r}"
        )

    storage_shadow_raw = (src.get("SCAN_STORAGE_SHADOW") or "").strip().lower()
    storage_shadow = storage_shadow_raw or None
    if (
        storage_shadow is not None
        and storage_shadow not in _VALID_STORAGE_SHADOW_TARGETS
    ):
        raise ConfigError(
            f"SCAN_STORAGE_SHADOW must be one of "
            f"{sorted(_VALID_STORAGE_SHADOW_TARGETS)} or unset, got {storage_shadow_raw!r}"
        )
    if storage_shadow is not None and storage_shadow == storage_backend:
        raise ConfigError(
            f"SCAN_STORAGE_SHADOW ({storage_shadow!r}) must differ from "
            f"SCAN_STORAGE_BACKEND ({storage_backend!r}) — shadowing a backend "
            f"to itself is not a cutover rehearsal"
        )

    storage_shadow_ledger_path = (
        src.get("SCAN_STORAGE_SHADOW_LEDGER_PATH") or ""
    ).strip() or None

    r2_endpoint = (src.get("SCAN_STORAGE_R2_ENDPOINT") or "").strip()
    r2_bucket = (src.get("SCAN_STORAGE_R2_BUCKET") or "").strip()
    r2_access_key_id = (src.get("SCAN_STORAGE_R2_ACCESS_KEY_ID") or "").strip()
    r2_secret_access_key = (src.get("SCAN_STORAGE_R2_SECRET_ACCESS_KEY") or "").strip()

    if storage_backend == "r2" or storage_shadow == "r2":
        missing_r2 = [
            name
            for name, value in (
                ("SCAN_STORAGE_R2_ENDPOINT", r2_endpoint),
                ("SCAN_STORAGE_R2_BUCKET", r2_bucket),
                ("SCAN_STORAGE_R2_ACCESS_KEY_ID", r2_access_key_id),
                ("SCAN_STORAGE_R2_SECRET_ACCESS_KEY", r2_secret_access_key),
            )
            if not value
        ]
        if missing_r2:
            raise ConfigError(
                f"{', '.join(missing_r2)} required when SCAN_STORAGE_BACKEND=r2 "
                f"or SCAN_STORAGE_SHADOW=r2"
            )

    storage_token = (src.get("SCAN_WORKER_STORAGE_TOKEN") or "").strip() or None

    s = Settings(
        worker_id=worker_id,
        supabase_url=supabase_url,
        service_role_key=service_role_key,
        stages=_parse_stages(src.get("STAGES")),
        poll_seconds=_int_src("POLL_SECONDS", 5),
        max_concurrent=_int_src("MAX_CONCURRENT", 2),
        gpu=gpu,
        visibility_timeout=visibility_timeout,
        max_attempts=_int_src("MAX_ATTEMPTS", 5),
        room_scans_bucket=(src.get("ROOM_SCANS_BUCKET") or "room-scans").strip(),
        work_dir=(src.get("WORK_DIR") or "/var/lib/patina/scan-work").strip(),
        retention_hours=_int_src("RETENTION_HOURS", 48),
        http_timeout_s=_float_src("HTTP_TIMEOUT_S", 30.0),
        log_level=log_level,
        storage_backend=storage_backend,
        storage_shadow=storage_shadow,
        storage_shadow_ledger_path=storage_shadow_ledger_path,
        r2_endpoint=r2_endpoint,
        r2_bucket=r2_bucket,
        r2_access_key_id=r2_access_key_id,
        r2_secret_access_key=r2_secret_access_key,
        storage_token=storage_token,
    )
    if s.max_concurrent < 1:
        raise ConfigError(f"MAX_CONCURRENT must be >= 1, got {s.max_concurrent}")
    if s.poll_seconds < 0:
        raise ConfigError(f"POLL_SECONDS must be >= 0, got {s.poll_seconds}")
    return s.with_task_types()
