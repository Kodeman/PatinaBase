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


def test_doctor_reports_all_checks_without_raising():
    settings = settings_from_env(UNREACHABLE)
    checks = run_checks(settings)
    names = {c.name for c in checks}
    assert names == {"env", "db", "storage", "gpu", "disk"}

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


def test_gpu_absent_is_warning_not_failure():
    # auto GPU on a box without nvidia-smi is a WARNING (warn=True, ok=False),
    # so it doesn't turn doctor red in P1.
    settings = settings_from_env({**UNREACHABLE, "GPU": "auto"})
    checks = {c.name: c for c in run_checks(settings)}
    gpu = checks["gpu"]
    if not gpu.ok:
        assert gpu.warn is True
