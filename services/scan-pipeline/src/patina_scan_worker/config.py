"""Runtime settings for the scan-pipeline worker.

Everything about a worker — identity, which stages it runs, cadence, concurrency,
GPU posture, and its one credential — comes from the environment (an
``EnvironmentFile``, ``/etc/patina/scan-worker.env``). This is what makes a cloud
burst worker a config change, not a code change (design §3, R108.4/R109.1).

Mirrors services/aesthete-inference/app/config.py: a frozen dataclass built by
``settings_from_env()``; the three required values have no default — the worker
refuses to start without them (the ``INFERENCE_TOKEN`` precedent).
"""

from __future__ import annotations

import os
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


class ConfigError(RuntimeError):
    """Raised when the environment is incomplete or invalid — the worker
    refuses to start rather than run half-configured."""


@dataclass(frozen=True)
class Settings:
    # ── identity / behaviour (design §3) ────────────────────────────────────
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

    # Derived: the fully-qualified task types this worker claims.
    task_types: tuple[str, ...] = field(default_factory=tuple)

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

    s = Settings(
        worker_id=worker_id,
        supabase_url=supabase_url,
        service_role_key=service_role_key,
        stages=_parse_stages(src.get("STAGES")),
        poll_seconds=_int_src("POLL_SECONDS", 5),
        max_concurrent=_int_src("MAX_CONCURRENT", 2),
        gpu=gpu,
        visibility_timeout=(src.get("VISIBILITY_TIMEOUT") or "60 minutes").strip(),
        max_attempts=_int_src("MAX_ATTEMPTS", 5),
        room_scans_bucket=(src.get("ROOM_SCANS_BUCKET") or "room-scans").strip(),
        work_dir=(src.get("WORK_DIR") or "/var/lib/patina/scan-work").strip(),
        retention_hours=_int_src("RETENTION_HOURS", 48),
        http_timeout_s=_float_src("HTTP_TIMEOUT_S", 30.0),
        log_level=log_level,
    )
    if s.max_concurrent < 1:
        raise ConfigError(f"MAX_CONCURRENT must be >= 1, got {s.max_concurrent}")
    if s.poll_seconds < 0:
        raise ConfigError(f"POLL_SECONDS must be >= 0, got {s.poll_seconds}")
    return s.with_task_types()
