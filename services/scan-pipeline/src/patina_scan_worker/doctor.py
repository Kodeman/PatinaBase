"""``patina-scan-worker doctor`` — preflight (design §6).

Prints one line per check and exits non-zero on any RED. Touches nothing in the
queue. The systemd unit runs it as ExecStartPre before the worker can claim.

Checks:
  * env completeness — required vars present; STAGES known; GPU legal.
  * DB reachability — agent_queue_stats() returns (proves the service-role key
    authenticates and the RPCs are reachable over 443).
  * Storage reachability — a list against room-scans succeeds.
  * GPU — nvidia-smi plus stage-scoped runtime checks. refine requires COLMAP's
    known-pose/fallback command set + pycolmap; fuse requires open3d + trimesh;
    splat requires nvcc + torch CUDA (sm_75 wheel + a real device op) + gsplat.
    These are RED only when the corresponding GPU stage is listed; CPU-only
    installs do not import or require them.
  * Disk headroom — free space in WORK_DIR vs MAX_CONCURRENT × ~1.5 GB.
  * Cache writability — the XDG base dirs, plus TORCH_HOME, CUDA_CACHE_PATH, and
    TORCH_EXTENSIONS_DIR on a GPU box.
"""

from __future__ import annotations

import importlib
import re
import shutil
import subprocess
from dataclasses import dataclass

from .config import GPU_STAGES, ConfigError, Settings, settings_from_env
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
        return False, "nvidia-smi not found on PATH"
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


def _colmap_command_set_ok() -> tuple[bool, str]:
    """Prove the installed COLMAP exposes item 4's known-pose pipeline and
    fallback. `global_mapper` is reported but intentionally not required: it is
    not a full-pose warm start."""
    exe = shutil.which("colmap")
    if not exe:
        return False, "colmap not found on PATH"
    try:
        out = subprocess.run(
            [exe, "-h"], capture_output=True, text=True, timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"COLMAP command-set probe failed: {exc}"
    combined = "\n".join(part for part in (out.stdout, out.stderr) if part)
    if out.returncode != 0:
        first = (
            combined.strip().splitlines()[0][:160]
            if combined.strip() else "no output"
        )
        return False, f"colmap -h rc={out.returncode}: {first}"
    required = (
        "feature_extractor", "sequential_matcher", "exhaustive_matcher",
        "point_triangulator", "bundle_adjuster", "pose_prior_mapper",
    )
    missing = [command for command in required if command not in combined]
    if missing:
        return False, f"COLMAP missing required command(s): {missing}"
    global_mapper = (
        "available" if "global_mapper" in combined else "unavailable (optional)"
    )
    return True, (
        f"COLMAP known-pose/fallback command set ready; global_mapper={global_mapper}"
    )


def _nvcc_ok() -> tuple[bool, str]:
    exe = shutil.which("nvcc")
    if not exe:
        return False, "nvcc not found on PATH (CUDA 11.8 toolkit required)"
    try:
        out = subprocess.run(
            [exe, "--version"], capture_output=True, text=True, timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"nvcc probe failed: {exc}"
    combined = "\n".join(part for part in (out.stdout, out.stderr) if part)
    if out.returncode != 0:
        first = (
            combined.strip().splitlines()[0][:160]
            if combined.strip() else "no output"
        )
        return False, f"nvcc --version rc={out.returncode}: {first}"
    match = re.search(r"\brelease\s+(\d+\.\d+)\b", combined, re.IGNORECASE)
    if not match:
        return False, "nvcc version output did not contain a CUDA release"
    release = match.group(1)
    if release != "11.8":
        return False, f"nvcc reports CUDA {release}; cu118/gsplat requires 11.8"
    return True, f"nvcc CUDA {release} ready"


def _python_module_ok(module_name: str) -> tuple[bool, str]:
    """Import one stage-extra module lazily so CPU-only workers remain lean."""
    try:
        module = importlib.import_module(module_name)
    except Exception as exc:  # noqa: BLE001 — doctor reports import/link errors
        return False, f"{module_name} not importable ({exc.__class__.__name__}: {exc})"
    version = getattr(module, "__version__", None)
    return True, f"{module_name} import OK" + (f" ({version})" if version else "")


def _torch_cuda_ok() -> tuple[bool, str]:
    """Does torch see a usable CUDA device? Required only when STAGES include the
    splat stage (the sole torch/CUDA stage). Imported lazily so a CPU worker that
    never installs `.[splat]` pays nothing and the import failure is a clean
    RED, not a traceback."""
    try:
        import torch  # noqa: PLC0415 — lazy on purpose (GPU-extra-only dep)
    except Exception as exc:  # noqa: BLE001
        return False, (
            f"torch not importable ({exc.__class__.__name__}) — install "
            f"`.[splat]` with the cu118 index (README box-prep)"
        )
    try:
        if not torch.cuda.is_available():
            return False, (
                f"torch {torch.__version__} installed but torch.cuda.is_available() "
                f"is False — driver/CUDA-runtime mismatch (Turing needs a cu118 "
                f"wheel on a CUDA-11.x driver)"
            )
        n = torch.cuda.device_count()
        if n < 1:
            return False, "torch.cuda is available but device_count() returned 0"
        name = torch.cuda.get_device_name(0)
        cap_tuple = torch.cuda.get_device_capability(0)
        cap = ".".join(str(x) for x in cap_tuple)
        arches = list(torch.cuda.get_arch_list())
        if "sm_75" not in arches:
            return False, (
                f"torch {torch.__version__} wheel lacks sm_75 support; "
                f"reported arches={arches}"
            )
        # is_available() can be true while cgroup device access or runtime linkage
        # is broken. Force one allocation/kernel/synchronization through the GPU.
        result = (torch.ones(1, device="cuda") + 1).item()
        torch.cuda.synchronize()
        if result != 2:
            return False, f"CUDA arithmetic probe returned {result!r}, expected 2"
        return True, (
            f"torch {torch.__version__}, cuda {torch.version.cuda} — {n}× {name} "
            f"(sm_{cap.replace('.', '')}; wheel sm_75; CUDA op OK)"
        )
    except Exception as exc:  # noqa: BLE001
        return False, f"torch.cuda probe raised {exc.__class__.__name__}: {exc}"


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

    # GPU visibility — REQUIRED (RED, not warn) when this worker's STAGES include
    # a GPU stage (refine/fuse/splat); warn-only otherwise. A GPU box that lists
    # splat must additionally satisfy torch.cuda.
    enabled_gpu_stages = sorted(set(settings.stages) & GPU_STAGES)
    gpu_required = bool(enabled_gpu_stages)
    refine_enabled = "refine" in settings.stages
    fuse_enabled = "fuse" in settings.stages
    splat_enabled = "splat" in settings.stages
    if settings.gpu == "off":
        if gpu_required:
            # Contradiction: the worker advertises GPU stages but disables the GPU.
            checks.append(Check(
                "gpu", False, False,
                f"GPU=off but STAGES include GPU stage(s) {enabled_gpu_stages} — "
                f"those stages cannot run; set GPU=auto or drop them from STAGES",
            ))
        else:
            checks.append(Check("gpu", True, False, "GPU=off (no GPU stage enabled)"))
    else:
        present, detail = _gpu_present()
        # Missing GPU: RED when a GPU stage is enabled, WARN when it is not.
        checks.append(Check(
            "gpu", present,
            warn=(not present and not gpu_required),
            detail=(f"{detail} [required by STAGES {enabled_gpu_stages}]"
                    if gpu_required else detail),
        ))
        # Stage dependencies stay strictly scoped: a refine-only worker never
        # fails on splat's torch/nvcc stack, and vice versa.
        if refine_enabled:
            ok, cdetail = _colmap_command_set_ok()
            checks.append(Check("colmap", ok, warn=False, detail=cdetail))
            ok, pdetail = _python_module_ok("pycolmap")
            checks.append(Check("pycolmap", ok, warn=False, detail=pdetail))
        if fuse_enabled:
            for module_name in ("open3d", "trimesh"):
                ok, mdetail = _python_module_ok(module_name)
                checks.append(Check(module_name, ok, warn=False, detail=mdetail))
        if splat_enabled:
            ok, ndetail = _nvcc_ok()
            checks.append(Check("nvcc", ok, warn=False, detail=ndetail))
            ok, tdetail = _torch_cuda_ok()
            checks.append(Check("torch-cuda", ok, warn=False, detail=tdetail))
            ok, gdetail = _python_module_ok("gsplat")
            checks.append(Check("gsplat", ok, warn=False, detail=gdetail))

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

    # Cache/config writability — ezdxf (drawings) writes BOTH $XDG_CONFIG_HOME/
    # ezdxf/ AND $XDG_CACHE_HOME/ezdxf/ on use; a root-owned/absent dir EACCESes
    # the drawings stage. On a GPU box, torch/CUDA add MORE write surfaces that
    # are NOT all XDG-derived — CUDA_CACHE_PATH defaults to ~/.nv/ComputeCache,
    # torch hub uses TORCH_HOME, and extension builds use TORCH_EXTENSIONS_DIR.
    # The GPU unit confines every one under APP_DIR; preflight each.
    xdg = [
        ("XDG_CONFIG_HOME", "~/.config"),
        ("XDG_CACHE_HOME", "~/.cache"),
        ("XDG_DATA_HOME", "~/.local/share"),
        ("XDG_STATE_HOME", "~/.local/state"),
    ]
    if gpu_required:
        xdg += [
            # torch hub/model cache (defaults under XDG_CACHE_HOME, but the unit
            # sets it explicitly — probe wherever it points).
            ("TORCH_HOME", "~/.cache/torch"),
            # nvidia JIT/PTX cache — NON-XDG default; the unit redirects it under
            # APP_DIR/.cache so ProtectSystem=strict does not EACCES it.
            ("CUDA_CACHE_PATH", "~/.nv/ComputeCache"),
            # torch C++/CUDA extension builds (including gsplat JIT) default under
            # the platform temp directory unless explicitly confined.
            ("TORCH_EXTENSIONS_DIR", "~/.cache/torch_extensions"),
        ]
    failing: list[str] = []
    for var, default in xdg:
        d = os.environ.get(var) or os.path.expanduser(default)
        try:
            os.makedirs(d, exist_ok=True)
            probe = os.path.join(d, ".patina-doctor-write-test")
            with open(probe, "w") as fh:
                fh.write("ok")
            os.remove(probe)
        except OSError as exc:
            failing.append(f"{var}={d} ({exc.__class__.__name__})")
    surfaces = "config/cache/data/state" + ("/torch/cuda/jit" if gpu_required else "")
    if failing:
        checks.append(Check(
            "xdg", False, False,
            "NOT writable: " + "; ".join(failing) + " — ezdxf (drawings) and/or "
            "torch/CUDA will EACCES; point the var(s) at a writable dir (the "
            "systemd unit does) or re-run install.sh.",
        ))
    else:
        checks.append(Check(
            "xdg", True, False,
            f"all {len(xdg)} cache/config base dirs writable ({surfaces})",
        ))

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
