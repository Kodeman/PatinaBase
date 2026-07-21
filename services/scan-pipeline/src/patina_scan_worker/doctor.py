"""``patina-scan-worker doctor`` — preflight (design §6).

Prints one line per check and exits non-zero on any RED. Touches nothing in the
queue. The systemd unit runs it as ExecStartPre before the worker can claim.

Checks:
  * env completeness — required vars present; STAGES known; GPU legal.
  * DB reachability — agent_queue_stats() returns (proves the service-role key
    authenticates and the RPCs are reachable over 443).
  * Storage reachability — a list against room-scans succeeds.
  * GPU — nvidia-smi plus stage-scoped runtime checks. refine requires COLMAP's
    known-pose/fallback command set + pycolmap; fuse requires an Open3D CUDA
    build/device + trimesh; splat requires nvcc + torch's CUDA 11.8 runtime
    (sm_75 wheel + a real device op) + a public gsplat CUDA rasterization. These
    are RED only when the corresponding GPU stage is listed; CPU-only installs
    do not import or require them.
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
    version_match = re.search(
        r"(?m)^\s*COLMAP\s+(\S+)\s+--(?:\s|$)", combined, re.IGNORECASE,
    )
    if version_match is None or version_match.group(1) != "4.0.2":
        return False, "COLMAP CLI must report exact pilot version 4.0.2 in colmap -h"
    if re.search(r"\bwith\s+CUDA\b", combined, re.IGNORECASE) is None:
        return False, "COLMAP 4.0.2 must report a CUDA-enabled build in colmap -h"
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
        "COLMAP 4.0.2 CUDA known-pose/fallback command set ready; "
        f"global_mapper={global_mapper}"
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
        return False, (
            f"{exe} reports CUDA {release}; cu118/gsplat requires 11.8"
        )
    return True, f"{exe} reports CUDA {release}; ready"


def _python_module_ok(module_name: str) -> tuple[bool, str]:
    """Import one stage-extra module lazily so CPU-only workers remain lean."""
    try:
        module = importlib.import_module(module_name)
    except Exception as exc:  # noqa: BLE001 — doctor reports import/link errors
        return False, f"{module_name} not importable ({exc.__class__.__name__}: {exc})"
    version = getattr(module, "__version__", None)
    return True, f"{module_name} import OK" + (f" ({version})" if version else "")


def _pycolmap_cuda_ok() -> tuple[bool, str]:
    """Require the exact CUDA-enabled PyCOLMAP pilot binding.

    A normal ``pycolmap==4.0.2`` PyPI wheel is CPU-only.  Version parity alone
    therefore cannot prove that refine will execute on this GPU box.
    """
    try:
        pycolmap = importlib.import_module("pycolmap")
    except Exception as exc:  # noqa: BLE001 — report native-link/import errors
        return False, f"pycolmap not importable ({exc.__class__.__name__}: {exc})"

    if getattr(pycolmap, "__version__", None) != "4.0.2":
        return False, "pycolmap must report exact pilot version 4.0.2"
    if getattr(pycolmap, "COLMAP_version", None) != "COLMAP 4.0.2":
        return False, "pycolmap COLMAP_version must be exactly 'COLMAP 4.0.2'"
    expected_build = "Commit d927f7e on 2026-03-18 with CUDA"
    if getattr(pycolmap, "COLMAP_build", None) != expected_build:
        return False, f"pycolmap build must be exactly '{expected_build}'"
    has_cuda = getattr(pycolmap, "has_cuda", None)
    if type(has_cuda) is not bool:  # noqa: E721 — bool, not truthy int/proxy
        return False, "pycolmap has_cuda must be a bool"
    if not has_cuda:
        return False, "pycolmap has_cuda is false (CPU-only binding)"
    get_device_count = getattr(pycolmap, "get_num_cuda_devices", None)
    if not callable(get_device_count):
        return False, "pycolmap CUDA build omitted get_num_cuda_devices()"
    try:
        count = int(get_device_count())
    except Exception as exc:  # noqa: BLE001
        return False, f"pycolmap CUDA device probe failed ({exc.__class__.__name__}: {exc})"
    if count < 1:
        return False, "pycolmap CUDA build cannot see a CUDA device"
    return True, f"pycolmap 4.0.2 CUDA ready ({count} device(s); {expected_build})"


def _open3d_cuda_ok() -> tuple[bool, str]:
    """Require the fuse runtime to be a CUDA-capable Open3D build.

    Open3D 0.18/0.19 expose the probe under ``open3d.core.cuda`` while newer
    builds also expose ``open3d.cuda``. Support both public layouts because the
    package constraint intentionally spans the two release lines. Availability
    alone is insufficient: allocate on CUDA:0, execute a tensor addition, and
    copy the exact result back through the public CPU/NumPy APIs.
    """
    try:
        open3d = importlib.import_module("open3d")
    except Exception as exc:  # noqa: BLE001 — report native-link/import errors
        return False, f"open3d not importable ({exc.__class__.__name__}: {exc})"

    # Real 0.18/0.19 CUDA wheels expose both namespaces: ``open3d.cuda`` is a
    # package namespace, while the availability bindings live under
    # ``open3d.core.cuda``. Prefer the binding location and accept either only
    # when it exposes the complete public probe API.
    core_cuda_api = getattr(getattr(open3d, "core", None), "cuda", None)
    top_level_cuda_api = getattr(open3d, "cuda", None)
    cuda_api = next(
        (
            candidate
            for candidate in (core_cuda_api, top_level_cuda_api)
            if callable(getattr(candidate, "is_available", None))
            and callable(getattr(candidate, "device_count", None))
        ),
        None,
    )
    if cuda_api is None:
        return False, (
            "open3d has no CUDA availability API; install the full CUDA-enabled "
            "Open3D wheel/build (not open3d-cpu)"
        )

    try:
        if not cuda_api.is_available():
            return False, (
                f"open3d {getattr(open3d, '__version__', '?')} is CPU-only or "
                "cannot see a compatible CUDA device"
            )
        count = int(cuda_api.device_count())
        if count < 1:
            return False, "open3d CUDA is_available() passed but device_count() returned 0"
    except Exception as exc:  # noqa: BLE001
        return False, f"open3d CUDA probe raised {exc.__class__.__name__}: {exc}"

    core_api = getattr(open3d, "core", None)
    tensor_type = getattr(core_api, "Tensor", None)
    device_type = getattr(core_api, "Device", None)
    dtype = getattr(getattr(core_api, "Dtype", None), "Float32", None)
    if tensor_type is None or device_type is None or dtype is None:
        return False, (
            "open3d CUDA is available but the public core Tensor/Device/Float32 "
            "API required for the runtime probe is missing"
        )

    try:
        device = device_type("CUDA:0")
        operand = tensor_type([1.0], dtype=dtype, device=device)
    except Exception as exc:  # noqa: BLE001
        return False, (
            "open3d CUDA tensor allocation on CUDA:0 failed "
            f"({exc.__class__.__name__}: {exc})"
        )

    try:
        result = operand + operand
    except Exception as exc:  # noqa: BLE001
        return False, (
            "open3d CUDA tensor addition kernel failed "
            f"({exc.__class__.__name__}: {exc})"
        )

    try:
        cpu_result = result.cpu()
    except Exception as exc:  # noqa: BLE001
        return False, (
            "open3d CUDA tensor result copy to CPU failed "
            f"({exc.__class__.__name__}: {exc})"
        )

    try:
        values = cpu_result.numpy().tolist()
    except Exception as exc:  # noqa: BLE001
        return False, (
            "open3d CUDA tensor CPU result validation failed "
            f"({exc.__class__.__name__}: {exc})"
        )
    if values != [2.0]:
        return False, (
            f"open3d CUDA tensor addition returned {values!r}, expected [2.0]"
        )

    return True, (
        f"open3d {getattr(open3d, '__version__', '?')} CUDA ready "
        f"({count} device(s); CUDA op OK)"
    )


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
        runtime = getattr(getattr(torch, "version", None), "cuda", None)
        if runtime != "11.8":
            return False, (
                f"torch {torch.__version__} reports CUDA runtime {runtime!r}; "
                "splat requires the cu118 (CUDA 11.8) runtime"
            )
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


def _gsplat_cuda_ok() -> tuple[bool, str]:
    """Run gsplat's public rasterizer on one CUDA gaussian.

    Import-only checks miss an unavailable extension backend and a failed first
    JIT build. This deliberately invokes the documented public
    ``gsplat.rasterization`` API on a tiny 16×16 image. The first invocation may
    compile the extension; the systemd startup timeout is sized accordingly.
    """
    try:
        torch = importlib.import_module("torch")
        gsplat = importlib.import_module("gsplat")
        rasterization = getattr(gsplat, "rasterization")
    except Exception as exc:  # noqa: BLE001
        return False, (
            f"gsplat runtime not importable ({exc.__class__.__name__}: {exc})"
        )

    tensor_args = {"device": "cuda", "dtype": torch.float32}
    try:
        render_colors, render_alphas, _meta = rasterization(
            means=torch.tensor([[0.0, 0.0, 2.0]], **tensor_args),
            quats=torch.tensor([[1.0, 0.0, 0.0, 0.0]], **tensor_args),
            scales=torch.tensor([[0.25, 0.25, 0.25]], **tensor_args),
            opacities=torch.tensor([0.9], **tensor_args),
            colors=torch.tensor([[1.0, 0.25, 0.0]], **tensor_args),
            viewmats=torch.tensor(
                [[[1.0, 0.0, 0.0, 0.0],
                  [0.0, 1.0, 0.0, 0.0],
                  [0.0, 0.0, 1.0, 0.0],
                  [0.0, 0.0, 0.0, 1.0]]],
                **tensor_args,
            ),
            Ks=torch.tensor(
                [[[12.0, 0.0, 8.0],
                  [0.0, 12.0, 8.0],
                  [0.0, 0.0, 1.0]]],
                **tensor_args,
            ),
            width=16,
            height=16,
            packed=False,
        )
        torch.cuda.synchronize()
        if not getattr(render_colors, "is_cuda", False):
            return False, "gsplat rasterization returned colors on CPU"
        if not getattr(render_alphas, "is_cuda", False):
            return False, "gsplat rasterization returned alpha on CPU"
        if render_colors.numel() < 1 or render_alphas.numel() < 1:
            return False, "gsplat rasterization returned empty outputs"
        expected_colors = (1, 16, 16, 3)
        expected_alphas = (1, 16, 16, 1)
        if tuple(render_colors.shape) != expected_colors:
            return False, (
                f"gsplat color output shape {tuple(render_colors.shape)!r}; "
                f"expected {expected_colors!r}"
            )
        if tuple(render_alphas.shape) != expected_alphas:
            return False, (
                f"gsplat alpha output shape {tuple(render_alphas.shape)!r}; "
                f"expected {expected_alphas!r}"
            )
        if not bool(torch.isfinite(render_colors).all().item()):
            return False, "gsplat color output contains non-finite values"
        if not bool(torch.isfinite(render_alphas).all().item()):
            return False, "gsplat alpha output contains non-finite values"
        if float(render_alphas.max().item()) <= 0.0:
            return False, "gsplat rasterization produced no positive alpha"
    except Exception as exc:  # noqa: BLE001 — surface backend/JIT failures
        return False, (
            f"gsplat rasterization CUDA probe raised {exc.__class__.__name__}: {exc}"
        )

    return True, (
        f"gsplat {getattr(gsplat, '__version__', '?')} public rasterization CUDA op OK"
    )


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
            ok, pdetail = _pycolmap_cuda_ok()
            checks.append(Check("pycolmap", ok, warn=False, detail=pdetail))
        if fuse_enabled:
            ok, odetail = _open3d_cuda_ok()
            checks.append(Check("open3d-cuda", ok, warn=False, detail=odetail))
            ok, mdetail = _python_module_ok("trimesh")
            checks.append(Check("trimesh", ok, warn=False, detail=mdetail))
        if splat_enabled:
            ok, ndetail = _nvcc_ok()
            checks.append(Check("nvcc", ok, warn=False, detail=ndetail))
            ok, tdetail = _torch_cuda_ok()
            checks.append(Check("torch-cuda", ok, warn=False, detail=tdetail))
            ok, gdetail = _gsplat_cuda_ok()
            checks.append(Check("gsplat-cuda", ok, warn=False, detail=gdetail))

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
