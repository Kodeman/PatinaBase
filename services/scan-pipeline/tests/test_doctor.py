"""doctor reports without raising, even when DB/Storage are unreachable."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.doctor import (
    _colmap_command_set_ok,
    _gsplat_cuda_ok,
    _nvcc_ok,
    _open3d_cuda_ok,
    _torch_cuda_ok,
    run_checks,
)

# Point at an unroutable host so DB/Storage probes fail fast but doctor still
# returns a report (a red line, never an exception).
UNREACHABLE = {
    "WORKER_ID": "test-doctor",
    "SUPABASE_URL": "http://127.0.0.1:9",  # discard port — connection refused
    "SUPABASE_SERVICE_ROLE_KEY": "svc",
    "GPU": "off",
    "HTTP_TIMEOUT_S": "1",
    "WORK_DIR": "/tmp",
}


@pytest.fixture(autouse=True)
def _isolate_doctor_tests_from_host_gpu_stack(monkeypatch, tmp_path):
    """No run_checks test may depend on the developer machine's GPU/packages.

    Direct helper tests below call their already-imported function objects, so
    they still exercise the real implementations with explicit fakes.
    """
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (False, "forced-absent"))
    monkeypatch.setattr("patina_scan_worker.doctor._colmap_command_set_ok",
                        lambda: (True, "COLMAP command set ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._nvcc_ok",
                        lambda: (True, "nvcc 11.8 ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._torch_cuda_ok",
                        lambda: (True, "torch CUDA ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._open3d_cuda_ok",
                        lambda: (True, "Open3D CUDA ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._gsplat_cuda_ok",
                        lambda: (True, "gsplat CUDA ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._python_module_ok",
                        lambda name: (True, f"{name} ready"))
    for var, sub in (
        ("XDG_CONFIG_HOME", "config"), ("XDG_CACHE_HOME", "cache"),
        ("XDG_DATA_HOME", "data"), ("XDG_STATE_HOME", "state"),
        ("TORCH_HOME", "torch"), ("CUDA_CACHE_PATH", "cuda"),
        ("TORCH_EXTENSIONS_DIR", "torch-extensions"),
    ):
        monkeypatch.setenv(var, str(tmp_path / sub))


def _all_xdg_writable(tmp_path, monkeypatch):
    for var, sub in (("XDG_CONFIG_HOME", "config"), ("XDG_CACHE_HOME", "cache"),
                     ("XDG_DATA_HOME", "data"), ("XDG_STATE_HOME", "state")):
        monkeypatch.setenv(var, str(tmp_path / sub))


def test_doctor_reports_all_checks_without_raising(tmp_path, monkeypatch):
    _all_xdg_writable(tmp_path, monkeypatch)
    settings = settings_from_env(UNREACHABLE)
    checks = run_checks(settings)
    names = {c.name for c in checks}
    assert names == {"env", "db", "storage", "gpu", "disk", "xdg"}

    by_name = {c.name: c for c in checks}
    # env always green (settings_from_env already validated it)
    assert by_name["env"].ok
    # GPU=off is green (dormant in P1), never a failure
    assert by_name["gpu"].ok
    # DB + Storage unreachable → FAIL, but reported, not raised
    assert not by_name["db"].ok
    assert not by_name["storage"].ok
    # disk on /tmp reports (ok or warn), never raises
    assert by_name["disk"] is not None
    # all four XDG dirs writable → OK
    assert by_name["xdg"].ok


def test_doctor_xdg_check_catches_unwritable_cache(tmp_path, monkeypatch):
    # config/data/state writable, but XDG_CACHE_HOME under an existing FILE
    # (NotADirectory on makedirs) — the second EACCES incident. The xdg check
    # goes RED and NAMES the failing var (would have caught it preflight).
    _all_xdg_writable(tmp_path, monkeypatch)
    blocker = tmp_path / "afile"
    blocker.write_text("x")
    monkeypatch.setenv("XDG_CACHE_HOME", str(blocker / "cache"))
    xdg = {c.name: c for c in run_checks(settings_from_env(UNREACHABLE))}["xdg"]
    assert xdg.ok is False and xdg.warn is False
    assert "XDG_CACHE_HOME" in xdg.detail


def test_gpu_absent_is_warning_not_failure(monkeypatch):
    # auto GPU on a CPU box (no GPU stage in STAGES) without nvidia-smi is a
    # WARNING (warn=True, ok=False), so it doesn't turn doctor red.
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (False, "forced-absent"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto"})
    checks = {c.name: c for c in run_checks(settings)}
    gpu = checks["gpu"]
    assert gpu.ok is False and gpu.warn is True


# ── item 3: GPU-required gating ──────────────────────────────────────────────

def test_gpu_absent_is_FAILURE_when_a_gpu_stage_is_listed(monkeypatch):
    # A worker that advertises a GPU stage (fuse) MUST have a GPU — a missing one
    # is RED (ok=False, warn=False), not a warning. Force nvidia-smi absent so the
    # test is host-independent.
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (False, "forced-absent"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,fuse"})
    gpu = {c.name: c for c in run_checks(settings)}["gpu"]
    assert gpu.ok is False and gpu.warn is False
    assert "required by STAGES" in gpu.detail


def test_gpu_off_with_a_gpu_stage_is_flagged_contradiction():
    # GPU=off while STAGES lists a GPU stage cannot run those stages — RED.
    settings = settings_from_env({**UNREACHABLE, "GPU": "off", "STAGES": "ingest,splat"})
    checks = {c.name: c for c in run_checks(settings)}
    assert checks["gpu"].ok is False and checks["gpu"].warn is False
    assert "GPU=off" in checks["gpu"].detail
    # the off-branch never runs a torch probe
    assert "torch-cuda" not in checks


def test_torch_cuda_check_appears_only_for_splat(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (True, "present"))
    monkeypatch.setattr("patina_scan_worker.doctor._torch_cuda_ok",
                        lambda: (False, "forced-torch-failure"))
    monkeypatch.setattr("patina_scan_worker.doctor._nvcc_ok",
                        lambda: (True, "nvcc ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._python_module_ok",
                        lambda name: (True, f"{name} ready"))
    # splat enabled → a deterministic torch-cuda line exists and is RED.
    with_splat = {c.name: c for c in run_checks(
        settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,splat"}))}
    assert "torch-cuda" in with_splat
    assert with_splat["torch-cuda"].ok is False and with_splat["torch-cuda"].warn is False
    # fuse (GPU, non-torch) enabled but NOT splat → no torch-cuda line.
    without_splat = {c.name: c for c in run_checks(
        settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,fuse"}))}
    assert "torch-cuda" not in without_splat


def test_readiness_checks_are_scoped_to_the_enabled_gpu_stage(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (True, "present"))
    monkeypatch.setattr("patina_scan_worker.doctor._colmap_command_set_ok",
                        lambda: (True, "COLMAP command set ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._nvcc_ok",
                        lambda: (True, "nvcc ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._torch_cuda_ok",
                        lambda: (True, "torch ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._open3d_cuda_ok",
                        lambda: (True, "Open3D CUDA ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._gsplat_cuda_ok",
                        lambda: (True, "gsplat CUDA ready"))
    monkeypatch.setattr("patina_scan_worker.doctor._python_module_ok",
                        lambda name: (True, f"{name} ready"))

    def names(stages):
        settings = settings_from_env({
            **UNREACHABLE, "GPU": "auto", "STAGES": f"ingest,{stages}",
        })
        return {c.name for c in run_checks(settings)}

    refine = names("refine")
    assert {"colmap", "pycolmap"} <= refine
    assert {"open3d", "trimesh", "nvcc", "torch-cuda", "gsplat"}.isdisjoint(refine)

    fuse = names("fuse")
    assert {"open3d-cuda", "trimesh"} <= fuse
    assert {"colmap", "pycolmap", "nvcc", "torch-cuda", "gsplat-cuda"}.isdisjoint(fuse)

    splat = names("splat")
    assert {"nvcc", "torch-cuda", "gsplat-cuda"} <= splat
    assert {"colmap", "pycolmap", "open3d-cuda", "trimesh"}.isdisjoint(splat)


def test_open3d_cuda_failure_is_red_only_for_fuse(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (True, "present"))
    monkeypatch.setattr("patina_scan_worker.doctor._open3d_cuda_ok",
                        lambda: (False, "CPU-only wheel"))
    fuse = {c.name: c for c in run_checks(settings_from_env({
        **UNREACHABLE, "GPU": "auto", "STAGES": "fuse",
    }))}
    assert fuse["open3d-cuda"].ok is False
    assert fuse["open3d-cuda"].warn is False
    refine = {c.name for c in run_checks(settings_from_env({
        **UNREACHABLE, "GPU": "auto", "STAGES": "refine",
    }))}
    assert "open3d-cuda" not in refine


def test_gsplat_cuda_failure_is_red_only_for_splat(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor._gpu_present",
                        lambda: (True, "present"))
    monkeypatch.setattr("patina_scan_worker.doctor._gsplat_cuda_ok",
                        lambda: (False, "backend unavailable"))
    splat = {c.name: c for c in run_checks(settings_from_env({
        **UNREACHABLE, "GPU": "auto", "STAGES": "splat",
    }))}
    assert splat["gsplat-cuda"].ok is False
    assert splat["gsplat-cuda"].warn is False
    fuse = {c.name for c in run_checks(settings_from_env({
        **UNREACHABLE, "GPU": "auto", "STAGES": "fuse",
    }))}
    assert "gsplat-cuda" not in fuse


def test_colmap_probe_requires_known_pose_and_fallback_commands(monkeypatch):
    commands = """COLMAP 4.0.2 -- Structure-from-Motion and Multi-View Stereo
      (Commit d927f7e5 on 2026-06-25 with CUDA)
      feature_extractor
      sequential_matcher
      exhaustive_matcher
      point_triangulator
      bundle_adjuster
      pose_prior_mapper
      global_mapper
    """
    monkeypatch.setattr("patina_scan_worker.doctor.shutil.which",
                        lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr("patina_scan_worker.doctor.subprocess.run",
                        lambda *_args, **_kwargs: SimpleNamespace(
                            returncode=0, stdout=commands, stderr="",
                        ))
    ok, detail = _colmap_command_set_ok()
    assert ok is True
    assert "global_mapper=available" in detail


def test_colmap_probe_names_missing_required_commands(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor.shutil.which",
                        lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr("patina_scan_worker.doctor.subprocess.run",
                        lambda *_args, **_kwargs: SimpleNamespace(
                            returncode=0,
                            stdout=(
                                "COLMAP 4.0.2 -- Structure-from-Motion\n"
                                "(Commit d927f7e5 with CUDA)\nfeature_extractor"
                            ),
                            stderr="",
                        ))
    ok, detail = _colmap_command_set_ok()
    assert ok is False
    assert "point_triangulator" in detail and "pose_prior_mapper" in detail


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("COLMAP 4.1.1 -- local build (with CUDA)", "4.0.2"),
        ("COLMAP 4.0.2-dev -- local build (with CUDA)", "4.0.2"),
        ("COLMAP 4.0.2+local -- local build (with CUDA)", "4.0.2"),
        ("COLMAP 4.0.2.1 -- local build (with CUDA)", "4.0.2"),
        ("COLMAP 4.0.2 -- local build (without CUDA)", "CUDA"),
    ],
)
def test_colmap_probe_rejects_wrong_version_or_cpu_build(monkeypatch, header, expected):
    commands = " ".join((
        "feature_extractor", "sequential_matcher", "exhaustive_matcher",
        "point_triangulator", "bundle_adjuster", "pose_prior_mapper",
    ))
    monkeypatch.setattr(
        "patina_scan_worker.doctor.shutil.which", lambda name: f"/usr/bin/{name}"
    )
    monkeypatch.setattr(
        "patina_scan_worker.doctor.subprocess.run",
        lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0, stdout=f"{header}\n{commands}", stderr="",
        ),
    )
    ok, detail = _colmap_command_set_ok()
    assert ok is False
    assert expected in detail


def test_nvcc_probe_requires_cuda_11_8_toolkit(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor.shutil.which",
                        lambda name: f"/usr/local/cuda/bin/{name}")
    monkeypatch.setattr("patina_scan_worker.doctor.subprocess.run",
                        lambda *_args, **_kwargs: SimpleNamespace(
                            returncode=0,
                            stdout="Cuda compilation tools, release 11.8, V11.8.89",
                            stderr="",
                        ))
    ok, detail = _nvcc_ok()
    assert ok is True and "11.8" in detail


def test_nvcc_probe_rejects_mismatched_toolkit(monkeypatch):
    monkeypatch.setattr("patina_scan_worker.doctor.shutil.which",
                        lambda name: f"/usr/local/cuda/bin/{name}")
    monkeypatch.setattr("patina_scan_worker.doctor.subprocess.run",
                        lambda *_args, **_kwargs: SimpleNamespace(
                            returncode=0,
                            stdout="Cuda compilation tools, release 12.4, V12.4.131",
                            stderr="",
                        ))
    ok, detail = _nvcc_ok()
    assert ok is False
    assert "11.8" in detail and "12.4" in detail


def test_xdg_probe_adds_torch_and_cuda_caches_when_gpu_required(tmp_path, monkeypatch):
    _all_xdg_writable(tmp_path, monkeypatch)
    monkeypatch.setenv("TORCH_HOME", str(tmp_path / "torch"))
    monkeypatch.setenv("CUDA_CACHE_PATH", str(tmp_path / "nv"))
    monkeypatch.setenv("TORCH_EXTENSIONS_DIR", str(tmp_path / "torch-extensions"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,splat"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is True
    # 4 XDG + hub + CUDA kernel + torch JIT extension caches = 7 surfaces.
    assert "7" in xdg.detail and "torch" in xdg.detail and "jit" in xdg.detail


def test_xdg_probe_catches_unwritable_cuda_cache(tmp_path, monkeypatch):
    _all_xdg_writable(tmp_path, monkeypatch)
    monkeypatch.setenv("TORCH_HOME", str(tmp_path / "torch"))
    monkeypatch.setenv("TORCH_EXTENSIONS_DIR", str(tmp_path / "torch-extensions"))
    blocker = tmp_path / "blockfile"
    blocker.write_text("x")
    # CUDA_CACHE_PATH under an existing FILE → NotADirectory on makedirs.
    monkeypatch.setenv("CUDA_CACHE_PATH", str(blocker / "nv"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,splat"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is False and xdg.warn is False
    assert "CUDA_CACHE_PATH" in xdg.detail


def test_xdg_probe_catches_unwritable_torch_extensions_cache(tmp_path, monkeypatch):
    _all_xdg_writable(tmp_path, monkeypatch)
    monkeypatch.setenv("TORCH_HOME", str(tmp_path / "torch"))
    monkeypatch.setenv("CUDA_CACHE_PATH", str(tmp_path / "nv"))
    blocker = tmp_path / "blockfile"
    blocker.write_text("x")
    monkeypatch.setenv("TORCH_EXTENSIONS_DIR", str(blocker / "extensions"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "splat"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is False and xdg.warn is False
    assert "TORCH_EXTENSIONS_DIR" in xdg.detail


def test_cpu_worker_probes_only_four_xdg_dirs(tmp_path, monkeypatch):
    # no GPU stage → torch/CUDA caches are NOT probed (a CPU box has neither).
    _all_xdg_writable(tmp_path, monkeypatch)
    settings = settings_from_env({**UNREACHABLE, "STAGES": "ingest,solve,drawings"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is True and "4" in xdg.detail and "torch" not in xdg.detail


def test_cpu_worker_does_not_import_open3d(monkeypatch):
    # Keep the real helper wired in, then make any attempted lazy import fatal.
    # With no fuse stage, run_checks must never enter the helper at all.
    monkeypatch.setattr(
        "patina_scan_worker.doctor._open3d_cuda_ok", _open3d_cuda_ok,
    )

    def fail_open3d_import(module_name):
        if module_name == "open3d":
            pytest.fail("CPU-only doctor unexpectedly imported Open3D")
        raise AssertionError(f"unexpected module import: {module_name}")

    monkeypatch.setattr(
        "patina_scan_worker.doctor.importlib.import_module", fail_open3d_import,
    )
    checks = run_checks(settings_from_env({
        **UNREACHABLE,
        "STAGES": "ingest,solve,drawings",
    }))
    assert "open3d-cuda" not in {check.name for check in checks}


class _FakeTensor:
    def __add__(self, _other):
        return self

    def item(self):
        return 2


class _FakeCuda:
    def __init__(self, arches=("sm_75",)):
        self._arches = list(arches)
        self.synchronized = False

    def is_available(self):
        return True

    def device_count(self):
        return 1

    def get_device_name(self, _index):
        return "GeForce RTX 2080 Ti"

    def get_device_capability(self, _index):
        return (7, 5)

    def get_arch_list(self):
        return self._arches

    def synchronize(self):
        self.synchronized = True


def _fake_torch(arches=("sm_75",), runtime="11.8"):
    cuda = _FakeCuda(arches)
    return SimpleNamespace(
        __version__="2.4.0+cu118",
        version=SimpleNamespace(cuda=runtime),
        cuda=cuda,
        ones=lambda *_args, **kwargs: (
            _FakeTensor() if kwargs.get("device") == "cuda" else None
        ),
    )


def test_torch_cuda_probe_requires_sm75_and_executes_a_real_cuda_operation(monkeypatch):
    fake = _fake_torch()
    monkeypatch.setitem(sys.modules, "torch", fake)
    ok, detail = _torch_cuda_ok()
    assert ok is True
    assert "sm_75" in detail and "CUDA op OK" in detail
    assert fake.cuda.synchronized is True


def test_torch_cuda_probe_rejects_a_wheel_without_sm75(monkeypatch):
    monkeypatch.setitem(sys.modules, "torch", _fake_torch(("sm_80", "sm_86")))
    ok, detail = _torch_cuda_ok()
    assert ok is False
    assert "sm_75" in detail


def test_torch_cuda_probe_rejects_a_non_cu118_runtime(monkeypatch):
    monkeypatch.setitem(sys.modules, "torch", _fake_torch(runtime="12.4"))
    ok, detail = _torch_cuda_ok()
    assert ok is False
    assert "runtime" in detail.lower()
    assert "11.8" in detail and "12.4" in detail


class _FakeOpen3DInputTensor:
    def __init__(self, state):
        self._state = state

    def __add__(self, other):
        self._state.calls.append(("add", other is self))
        if self._state.kernel_error is not None:
            raise self._state.kernel_error
        return _FakeOpen3DResultTensor(self._state)


class _FakeOpen3DResultTensor:
    def __init__(self, state):
        self._state = state

    def cpu(self):
        self._state.calls.append(("cpu",))
        if self._state.copy_error is not None:
            raise self._state.copy_error
        return _FakeOpen3DCPUTensor(self._state)


class _FakeOpen3DCPUTensor:
    def __init__(self, state):
        self._state = state

    def numpy(self):
        self._state.calls.append(("numpy",))
        return SimpleNamespace(tolist=lambda: self._state.result)


def _fake_open3d(
    *, version="0.19.0", available=True, count=1, top_level=False,
    allocation_error=None, kernel_error=None, copy_error=None, result=None,
):
    cuda = SimpleNamespace(
        is_available=lambda: available,
        device_count=lambda: count,
    )
    state = SimpleNamespace(
        calls=[],
        allocation_error=allocation_error,
        kernel_error=kernel_error,
        copy_error=copy_error,
        result=[2.0] if result is None else result,
    )

    def device(name):
        state.calls.append(("device", name))
        return name

    def tensor(values, *, dtype, device):
        state.calls.append(("tensor", values, dtype, device))
        if state.allocation_error is not None:
            raise state.allocation_error
        return _FakeOpen3DInputTensor(state)

    core = SimpleNamespace(
        Device=device,
        Dtype=SimpleNamespace(Float32="Float32"),
        Tensor=tensor,
    )
    module = SimpleNamespace(__version__=version, core=core, probe_state=state)
    if top_level:
        module.cuda = cuda
    else:
        core.cuda = cuda
    return module


@pytest.mark.parametrize("version", ["0.18.0", "0.19.0"])
def test_open3d_cuda_probe_accepts_the_supported_core_cuda_api(monkeypatch, version):
    fake = _fake_open3d(version=version)
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is True
    assert "1 device" in detail and version in detail and "CUDA op OK" in detail
    assert fake.probe_state.calls == [
        ("device", "CUDA:0"),
        ("tensor", [1.0], "Float32", "CUDA:0"),
        ("add", True),
        ("cpu",),
        ("numpy",),
    ]


def test_open3d_cuda_probe_accepts_the_newer_top_level_cuda_api(monkeypatch):
    fake = _fake_open3d(top_level=True)
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is True
    assert "CUDA ready" in detail and ("cpu",) in fake.probe_state.calls


def test_open3d_cuda_probe_ignores_an_incomplete_top_level_namespace(monkeypatch):
    """Real CUDA wheels expose both namespaces, but only core.cuda owns the probes."""
    fake = _fake_open3d()
    fake.cuda = SimpleNamespace()
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is True
    assert "CUDA ready" in detail and ("cpu",) in fake.probe_state.calls


def test_open3d_cuda_probe_reports_tensor_allocation_failure(monkeypatch):
    fake = _fake_open3d(
        allocation_error=RuntimeError("CUDA out of memory during allocation"),
    )
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is False
    assert "allocation" in detail.lower()
    assert "RuntimeError" in detail and "out of memory" in detail


def test_open3d_cuda_probe_reports_tensor_addition_failure(monkeypatch):
    fake = _fake_open3d(
        kernel_error=RuntimeError("no kernel image is available"),
    )
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is False
    assert "addition" in detail.lower()
    assert "RuntimeError" in detail and "no kernel image" in detail


def test_open3d_cuda_probe_reports_cpu_copy_failure(monkeypatch):
    fake = _fake_open3d(
        copy_error=RuntimeError("CUDA device-side assert triggered"),
    )
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is False
    assert "copy to CPU" in detail
    assert "RuntimeError" in detail and "device-side assert" in detail


def test_open3d_cuda_probe_rejects_invalid_addition_result(monkeypatch):
    fake = _fake_open3d(result=[1.0])
    monkeypatch.setitem(sys.modules, "open3d", fake)
    ok, detail = _open3d_cuda_ok()
    assert ok is False
    assert "returned [1.0]" in detail
    assert "expected [2.0]" in detail


def test_open3d_cuda_probe_rejects_a_cpu_only_wheel(monkeypatch):
    monkeypatch.setitem(sys.modules, "open3d", _fake_open3d(available=False, count=0))
    ok, detail = _open3d_cuda_ok()
    assert ok is False
    assert "CPU-only" in detail


def test_open3d_cuda_probe_rejects_zero_devices_even_if_available(monkeypatch):
    monkeypatch.setitem(sys.modules, "open3d", _fake_open3d(available=True, count=0))
    ok, detail = _open3d_cuda_ok()
    assert ok is False
    assert "device_count" in detail


class _FakeCudaOutput:
    is_cuda = True

    def __init__(self, shape, *, finite=True, maximum=1.0):
        self.shape = shape
        self.finite = finite
        self.maximum = maximum

    def numel(self):
        result = 1
        for size in self.shape:
            result *= size
        return result

    def max(self):
        return SimpleNamespace(item=lambda: self.maximum)


class _FakeGsplatTorch:
    float32 = "float32"

    def __init__(self):
        self.cuda = SimpleNamespace(synchronize=lambda: None)

    @staticmethod
    def tensor(value, **_kwargs):
        return value

    @staticmethod
    def isfinite(value):
        return SimpleNamespace(
            all=lambda: SimpleNamespace(item=lambda: value.finite)
        )


def test_gsplat_probe_executes_public_cuda_rasterization(monkeypatch):
    called = {}

    def rasterization(*args, **kwargs):
        called["args"] = args
        called["kwargs"] = kwargs
        return (
            _FakeCudaOutput((1, 16, 16, 3)),
            _FakeCudaOutput((1, 16, 16, 1)),
            {},
        )

    monkeypatch.setitem(sys.modules, "torch", _FakeGsplatTorch())
    monkeypatch.setitem(sys.modules, "gsplat", SimpleNamespace(
        __version__="1.5.3", rasterization=rasterization,
    ))
    ok, detail = _gsplat_cuda_ok()
    assert ok is True
    assert called["kwargs"]["width"] == 16
    assert called["kwargs"]["height"] == 16
    assert called["kwargs"]["packed"] is False
    assert "rasterization CUDA op OK" in detail


def test_gsplat_probe_reports_backend_or_jit_failure(monkeypatch):
    def rasterization(*_args, **_kwargs):
        raise RuntimeError("no kernel image is available")

    monkeypatch.setitem(sys.modules, "torch", _FakeGsplatTorch())
    monkeypatch.setitem(sys.modules, "gsplat", SimpleNamespace(
        __version__="1.5.3", rasterization=rasterization,
    ))
    ok, detail = _gsplat_cuda_ok()
    assert ok is False
    assert "RuntimeError" in detail
    assert "no kernel image" in detail


def test_gsplat_probe_rejects_wrong_public_output_shapes(monkeypatch):
    monkeypatch.setitem(sys.modules, "torch", _FakeGsplatTorch())
    monkeypatch.setitem(sys.modules, "gsplat", SimpleNamespace(
        __version__="1.5.3",
        rasterization=lambda **_kwargs: (
            _FakeCudaOutput((16, 16, 3)),
            _FakeCudaOutput((1, 16, 16, 1)),
            {},
        ),
    ))
    ok, detail = _gsplat_cuda_ok()
    assert ok is False
    assert "shape" in detail
    assert "(1, 16, 16, 3)" in detail


def test_gsplat_probe_rejects_nonfinite_output(monkeypatch):
    monkeypatch.setitem(sys.modules, "torch", _FakeGsplatTorch())
    monkeypatch.setitem(sys.modules, "gsplat", SimpleNamespace(
        __version__="1.5.3",
        rasterization=lambda **_kwargs: (
            _FakeCudaOutput((1, 16, 16, 3), finite=False),
            _FakeCudaOutput((1, 16, 16, 1)),
            {},
        ),
    ))
    ok, detail = _gsplat_cuda_ok()
    assert ok is False
    assert "non-finite" in detail


def test_gsplat_probe_requires_positive_rendered_alpha(monkeypatch):
    monkeypatch.setitem(sys.modules, "torch", _FakeGsplatTorch())
    monkeypatch.setitem(sys.modules, "gsplat", SimpleNamespace(
        __version__="1.5.3",
        rasterization=lambda **_kwargs: (
            _FakeCudaOutput((1, 16, 16, 3)),
            _FakeCudaOutput((1, 16, 16, 1), maximum=0.0),
            {},
        ),
    ))
    ok, detail = _gsplat_cuda_ok()
    assert ok is False
    assert "positive alpha" in detail
