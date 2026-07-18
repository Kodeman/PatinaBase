"""doctor reports without raising, even when DB/Storage are unreachable."""

from __future__ import annotations

from patina_scan_worker.config import settings_from_env
from patina_scan_worker.doctor import run_checks

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


def test_gpu_absent_is_warning_not_failure():
    # auto GPU on a CPU box (no GPU stage in STAGES) without nvidia-smi is a
    # WARNING (warn=True, ok=False), so it doesn't turn doctor red.
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto"})
    checks = {c.name: c for c in run_checks(settings)}
    gpu = checks["gpu"]
    if not gpu.ok:
        assert gpu.warn is True


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
    # splat enabled → a torch-cuda line exists (RED here: torch isn't installed).
    with_splat = {c.name: c for c in run_checks(
        settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,splat"}))}
    assert "torch-cuda" in with_splat
    assert with_splat["torch-cuda"].ok is False and with_splat["torch-cuda"].warn is False
    # fuse (GPU, non-torch) enabled but NOT splat → no torch-cuda line.
    without_splat = {c.name: c for c in run_checks(
        settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,fuse"}))}
    assert "torch-cuda" not in without_splat


def test_xdg_probe_adds_torch_and_cuda_caches_when_gpu_required(tmp_path, monkeypatch):
    _all_xdg_writable(tmp_path, monkeypatch)
    monkeypatch.setenv("TORCH_HOME", str(tmp_path / "torch"))
    monkeypatch.setenv("CUDA_CACHE_PATH", str(tmp_path / "nv"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,splat"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is True
    # 4 XDG + TORCH_HOME + CUDA_CACHE_PATH = 6 surfaces, labelled with torch/cuda.
    assert "6" in xdg.detail and "torch" in xdg.detail


def test_xdg_probe_catches_unwritable_cuda_cache(tmp_path, monkeypatch):
    _all_xdg_writable(tmp_path, monkeypatch)
    monkeypatch.setenv("TORCH_HOME", str(tmp_path / "torch"))
    blocker = tmp_path / "blockfile"
    blocker.write_text("x")
    # CUDA_CACHE_PATH under an existing FILE → NotADirectory on makedirs.
    monkeypatch.setenv("CUDA_CACHE_PATH", str(blocker / "nv"))
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto", "STAGES": "ingest,splat"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is False and xdg.warn is False
    assert "CUDA_CACHE_PATH" in xdg.detail


def test_cpu_worker_probes_only_four_xdg_dirs(tmp_path, monkeypatch):
    # no GPU stage → torch/CUDA caches are NOT probed (a CPU box has neither).
    _all_xdg_writable(tmp_path, monkeypatch)
    settings = settings_from_env({**UNREACHABLE, "STAGES": "ingest,solve,drawings"})
    xdg = {c.name: c for c in run_checks(settings)}["xdg"]
    assert xdg.ok is True and "4" in xdg.detail and "torch" not in xdg.detail
