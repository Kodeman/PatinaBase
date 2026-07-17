"""``patina-scan-worker doctor`` — preflight (design §6).

Prints one line per check and exits non-zero on any RED. Touches nothing in the
queue. Run last by install.sh and after any env change.

Checks:
  * env completeness — required vars present; STAGES known; GPU legal.
  * DB reachability — agent_queue_stats() returns (proves the service-role key
    authenticates and the RPCs are reachable over 443).
  * Storage reachability — a list against room-scans succeeds.
  * GPU visibility — reports a CUDA device; in P1 a red GPU line is a WARNING,
    not a failure (no P1 stage uses it).
  * Disk headroom — free space in WORK_DIR vs MAX_CONCURRENT × ~1.5 GB.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass

from .config import ConfigError, Settings, settings_from_env
from .http import build_session
from .queue import QueueClient
from .storage import StorageClient

GB = 1024 ** 3
PER_JOB_HEADROOM = int(1.5 * GB)


@dataclass
class Check:
    name: str
    ok: bool
    warn: bool
    detail: str

    @property
    def mark(self) -> str:
        if self.ok:
            return "OK  "
        return "WARN" if self.warn else "FAIL"


def _gpu_present() -> tuple[bool, str]:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return False, "nvidia-smi not found (expected on a CPU-only P1 box)"
    try:
        out = subprocess.run(
            [exe, "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"nvidia-smi failed: {exc}"
    if out.returncode != 0:
        return False, f"nvidia-smi rc={out.returncode}: {out.stderr.strip()[:120]}"
    line = out.stdout.strip().splitlines()[0] if out.stdout.strip() else "?"
    return True, line


def run_checks(settings: Settings) -> list[Check]:
    checks: list[Check] = []

    # env completeness is already proven by settings_from_env succeeding.
    checks.append(Check(
        "env", True, False,
        f"worker_id={settings.worker_id} stages={','.join(settings.stages)} "
        f"gpu={settings.gpu} bucket={settings.room_scans_bucket}",
    ))

    session = build_session(settings)

    # DB reachability
    try:
        stats = QueueClient(session, settings).stats()
        checks.append(Check("db", True, False, f"agent_queue_stats -> {len(stats or [])} status group(s)"))
    except Exception as exc:  # noqa: BLE001 — doctor reports, never raises
        checks.append(Check("db", False, False, f"agent_queue_stats failed: {exc}"))

    # Storage reachability
    try:
        ok = StorageClient(session, settings).list_reachable()
        checks.append(Check(
            "storage", ok, False,
            "room-scans list OK" if ok else "room-scans list failed",
        ))
    except Exception as exc:  # noqa: BLE001
        checks.append(Check("storage", False, False, f"storage probe failed: {exc}"))

    # GPU visibility — informational in P1
    if settings.gpu == "off":
        checks.append(Check("gpu", True, False, "GPU=off (dormant in P1)"))
    else:
        present, detail = _gpu_present()
        # A missing GPU is a WARNING in P1 (no stage uses it), never a failure.
        checks.append(Check("gpu", present, warn=not present, detail=detail))

    # Disk headroom
    import os

    probe_dir = settings.work_dir
    while probe_dir and not os.path.isdir(probe_dir):
        parent = os.path.dirname(probe_dir)
        if parent == probe_dir:
            break
        probe_dir = parent
    try:
        free = shutil.disk_usage(probe_dir or "/").free
        need = settings.max_concurrent * PER_JOB_HEADROOM
        ok = free >= need
        checks.append(Check(
            "disk", ok, warn=not ok,
            detail=f"{free // GB} GiB free at {probe_dir}, need ~{need // GB} GiB "
                   f"({settings.max_concurrent} × 1.5 GiB)",
        ))
    except OSError as exc:
        checks.append(Check("disk", False, True, f"disk_usage failed: {exc}"))

    return checks


def doctor() -> int:
    """Entry point for the ``doctor`` subcommand. Returns a process exit code."""
    try:
        settings = settings_from_env()
    except ConfigError as exc:
        print(f"FAIL env: {exc}")
        return 2

    checks = run_checks(settings)
    red = False
    for c in checks:
        print(f"[{c.mark}] {c.name:8s} {c.detail}")
        if not c.ok and not c.warn:
            red = True
    print("doctor: " + ("FAIL (see above)" if red else "OK"))
    return 1 if red else 0
