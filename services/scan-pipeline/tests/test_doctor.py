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
    # auto GPU on a box without nvidia-smi is a WARNING (warn=True, ok=False),
    # so it doesn't turn doctor red in P1.
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto"})
    checks = {c.name: c for c in run_checks(settings)}
    gpu = checks["gpu"]
    if not gpu.ok:
        assert gpu.warn is True
