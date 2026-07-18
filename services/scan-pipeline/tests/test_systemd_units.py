"""item 3 — systemd unit + GPU drop-in lint (local, no systemd required).

`systemd-analyze verify` is the box-side lint; here we do the host-independent
half: every [Service] directive is a real systemd key (catches typos like
DevceAllow), and the GPU drop-in grants the nvidia nodes, keeps devices visible,
and confines torch/CUDA/JIT caches under the base unit's already-RW .cache.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "patina-scan-worker.service"
GPU = ROOT / "patina-scan-worker.gpu.conf"

# The systemd [Service] directives this project uses. A key outside this set in a
# unit file is almost always a typo (systemd would silently ignore it).
KNOWN_SERVICE_KEYS = {
    "Type", "User", "Group", "EnvironmentFile", "Environment", "ExecStartPre", "ExecStart",
    "TimeoutStartSec",
    "Restart", "RestartSec", "NoNewPrivileges", "ProtectSystem", "ProtectHome",
    "PrivateTmp", "PrivateDevices", "DeviceAllow", "ReadWritePaths",
    "StandardOutput", "StandardError", "SyslogIdentifier",
}


def _service_kv(path: Path) -> list[tuple[str, str]]:
    """Return (key, value) pairs under [Service], preserving duplicates (systemd
    list directives repeat the key). Ignores comments/blank lines/other sections."""
    section = None
    out: list[tuple[str, str]] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if section == "Service" and "=" in line:
            k, v = line.split("=", 1)
            out.append((k.strip(), v.strip()))
    return out


def test_base_and_dropin_use_only_known_service_keys():
    for path in (BASE, GPU):
        for key, _ in _service_kv(path):
            assert key in KNOWN_SERVICE_KEYS, f"{path.name}: unknown [Service] key {key!r}"


def test_dropin_grants_nvidia_and_keeps_devices_visible():
    kv = _service_kv(GPU)
    device_allow = [v for k, v in kv if k == "DeviceAllow"]
    # systemd does not expand globs in device-node path specifications. The
    # accepted box has one 2080 Ti, so enumerate its compute/control nodes.
    assert device_allow == [
        "/dev/nvidia0 rw",
        "/dev/nvidiactl rw",
        "/dev/nvidia-uvm rw",
        "/dev/nvidia-uvm-tools rw",
        "/dev/nvidia-modeset rw",
    ]
    assert not any("*" in value for value in device_allow)
    # PrivateDevices MUST be off, or a private /dev would hide the nvidia nodes.
    priv = [v for k, v in kv if k == "PrivateDevices"]
    assert priv == ["false"], priv


def test_dropin_confines_torch_and_cuda_caches_under_base_rw_cache():
    # The base unit lists APP_DIR/.cache in ReadWritePaths; the GPU cache env must
    # point INSIDE it so ProtectSystem=strict doesn't EACCES the JIT cache.
    base_rw = " ".join(v for k, v in _service_kv(BASE) if k == "ReadWritePaths")
    assert "/opt/patina/scan-pipeline/.cache" in base_rw
    env = {v.split("=", 1)[0]: v.split("=", 1)[1]
           for k, v in _service_kv(GPU) if k == "Environment"}
    assert env["TORCH_HOME"].startswith("/opt/patina/scan-pipeline/.cache")
    assert env["CUDA_CACHE_PATH"].startswith("/opt/patina/scan-pipeline/.cache")
    assert env["TORCH_EXTENSIONS_DIR"].startswith("/opt/patina/scan-pipeline/.cache")


def test_worker_runs_doctor_as_exec_start_pre_in_the_real_service_context():
    kv = _service_kv(BASE)
    preflight = [v for k, v in kv if k == "ExecStartPre"]
    assert preflight == [
        "/opt/patina/scan-pipeline/.venv/bin/patina-scan-worker doctor"
    ]
    # ExecStartPre inherits User/Group, EnvironmentFile, Environment, sandbox,
    # DeviceAllow and ReadWritePaths from the same service invocation.
    assert ("User", "patina") in kv
    assert ("Group", "patina") in kv
    assert ("EnvironmentFile", "/etc/patina/scan-worker.env") in kv
    assert ("ProtectSystem", "strict") in kv
    assert ("ProtectHome", "true") in kv
    assert ("PrivateTmp", "true") in kv
    assert ("TimeoutStartSec", "180") in kv


def test_dropin_is_purely_additive():
    # A drop-in must not redefine the base ExecStart/User etc. — it only ADDS the
    # GPU device policy + cache env (Environment/DeviceAllow/PrivateDevices).
    added_keys = {k for k, _ in _service_kv(GPU)}
    assert added_keys <= {"DeviceAllow", "PrivateDevices", "Environment"}, added_keys
