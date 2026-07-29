#!/bin/bash -p
# install.sh — bring up the Patina scan-pipeline worker natively on a Linux box
# (R109.1: native systemd, no Docker required to operate).
#
# Usage:  sudo ./install.sh [--gpu] [--upgrade]
#
#   --gpu       install the GPU stage extras (.[gpu] = refine+fuse+splat via the
#               PyTorch cu118 index), NVIDIA device preparation, and the same
#               GPU policy on the worker and doctor-only units.
#   --upgrade   build a fresh immutable release. Candidate Python + systemd
#               files are checked while the live worker runs, then units and
#               the .venv symlink activate as one recoverable transaction.
#
# Transaction invariants:
#   1. pip check + import/entrypoint smoke + systemd-analyze verify happen first.
#   2. installed unit contents/presence and the current release are snapshotted.
#   3. only then is an active worker stopped and candidate files atomically moved.
#   4. failed activation restores every unit + release, reloads, and restarts.
#   5. a durable marker lets the next invocation recover power loss/SIGKILL.
set -euo pipefail
# Never inherit a permissive caller umask into root-built Python or systemd
# candidates. The staged release root stays 0700 until dependency validation
# completes, so the live service cannot race-write code that root will import.
umask 077
INSTALL_SECURE_PATH=/usr/sbin:/usr/bin:/sbin:/bin
PATH="$INSTALL_SECURE_PATH"
export PATH
unset BASH_ENV ENV
CDPATH=
IFS=$' \t\n'

GPU=0
UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --gpu)     GPU=1 ;;
    --upgrade) UPGRADE=1 ;;
    -h|--help)
      /usr/bin/sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (see --help)" >&2; exit 2 ;;
  esac
done

APP_DIR=/opt/patina/scan-pipeline
PYCOLMAP_ARTIFACT_DIR=/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75
PYCOLMAP_PYTHON_TAG=cp312-cp312
PYCOLMAP_WHEEL=""
PYCOLMAP_WHEEL_SHA256=""
PYCOLMAP_REQUIREMENT=""
# Stable ZIP-safe wheel epoch: reviewed base commit 517c802e's commit timestamp.
WORKER_SOURCE_DATE_EPOCH=1784655816
WORKER_WHEEL=""
WORKER_WHEEL_SHA256=""
WORKER_REQUIREMENT=""
VENV="$APP_DIR/.venv"
# A venv is not relocatable: console-script shebangs embed the build path. Build
# at an immutable final path, then replace only the stable .venv symlink.
STAGED_VENV=""
PREVIOUS_VENV="$APP_DIR/.venv.previous"
FAILED_VENV="$APP_DIR/.venv.failed"
ETC_DIR=/etc/patina
TRANSACTION_PARENT="$ETC_DIR"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
ENV_FILE="$ETC_DIR/scan-worker.env"
WORK_DIR=/var/lib/patina/scan-work
WORK_PARENT=/var/lib/patina
SYSTEMD_DIR=/etc/systemd/system
UNIT="$SYSTEMD_DIR/patina-scan-worker.service"
DOCTOR_UNIT="$SYSTEMD_DIR/patina-scan-worker-doctor.service"
DROPIN_DIR="$SYSTEMD_DIR/patina-scan-worker.service.d"
DOCTOR_DROPIN_DIR="$SYSTEMD_DIR/patina-scan-worker-doctor.service.d"
NVIDIA_PREPARE_UNIT="$SYSTEMD_DIR/patina-scan-worker-nvidia-prepare.service"
NVIDIA_MODPROBE=/usr/bin/nvidia-modprobe
WORKER_SERVICE=patina-scan-worker
SVC_USER=patina
SOURCE_PATH="${BASH_SOURCE[0]}"
SOURCE_PARENT="${SOURCE_PATH%/*}"
if [ "$SOURCE_PARENT" = "$SOURCE_PATH" ]; then
  SOURCE_PARENT=.
elif [ -z "$SOURCE_PARENT" ]; then
  SOURCE_PARENT=/
fi
SRC_DIR="$(builtin cd -P -- "$SOURCE_PARENT" && builtin pwd -P)"
PYTHON="${PYTHON:-/usr/bin/python3}"
PATH_GUARD_PYTHON=/usr/bin/python3
PATH_GUARD="$SRC_DIR/install-path-guard.py"
RUNUSER=/usr/sbin/runuser
INSTALL_TRUST_ANCHOR=/
INSTALL_TRUSTED_UID=0
INSTALL_TRUSTED_GID=0
# Recovery may be finishing a GPU transaction even when the new invocation did
# not pass --gpu. Keep the complete exact allowlist available until recovery;
# current candidate arrays are narrowed again during staging below.
MANAGED_UNIT_TARGETS=(
  "$UNIT"
  "$DOCTOR_UNIT"
  "$DROPIN_DIR/gpu.conf"
  "$DOCTOR_DROPIN_DIR/gpu.conf"
  "$NVIDIA_PREPARE_UNIT"
)

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: install.sh must run as root (use sudo)." >&2
  exit 2
fi
if [ ! -x "$PATH_GUARD_PYTHON" ]; then
  echo "ERROR: trusted bootstrap Python is unavailable: $PATH_GUARD_PYTHON" >&2
  exit 2
fi

# Bootstrap boundary: the first invocation necessarily trusts the reviewed
# install.sh bytes. Every sibling input must already be in the separate fresh,
# root-owned source snapshot; legacy APP_DIR source is never adopted. Fixed
# isolated Python validates three bootstrap inputs before any is executed.
/usr/bin/env -i HOME=/root PATH="$INSTALL_SECURE_PATH" \
  "$PATH_GUARD_PYTHON" -I -S - "$SRC_DIR" "$APP_DIR" <<'PY'
import os
import stat
import sys

source, app = map(lambda value: os.path.abspath(os.path.normpath(value)), sys.argv[1:3])
trusted_uid = trusted_gid = 0

def require_directory(path, info):
    if stat.S_ISLNK(info.st_mode):
        raise SystemExit(f"ERROR: installer source ancestry contains symlink: {path}")
    if not stat.S_ISDIR(info.st_mode):
        raise SystemExit(f"ERROR: installer source ancestry is not a directory: {path}")
    if info.st_uid != trusted_uid or info.st_gid != trusted_gid:
        raise SystemExit(f"ERROR: installer source ancestry is not root-owned: {path}")
    if stat.S_IMODE(info.st_mode) & 0o022:
        raise SystemExit(f"ERROR: installer source ancestry is group/world writable: {path}")

def validate_ancestry(path):
    components = path.strip(os.sep).split(os.sep) if path != os.sep else []
    current = os.sep
    require_directory(current, os.lstat(current))
    for component in components:
        current = os.path.join(current, component)
        require_directory(current, os.lstat(current))

if source == app:
    raise SystemExit(
        "ERROR: installer source must be staged separately from runtime APP_DIR"
    )
validate_ancestry(source)
source_fd = os.open(
    source,
    os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
)

try:
    for name in ("install.sh", "install-path-guard.py", "install-venv-lib.sh"):
        info = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            raise SystemExit(f"ERROR: installer bootstrap input is not regular: {source}/{name}")
        if info.st_uid != trusted_uid or info.st_gid != trusted_gid:
            raise SystemExit(f"ERROR: installer bootstrap input is not root-owned: {source}/{name}")
        if stat.S_IMODE(info.st_mode) & 0o022:
            raise SystemExit(f"ERROR: installer bootstrap input is group/world writable: {source}/{name}")
        if info.st_nlink != 1:
            raise SystemExit(f"ERROR: installer bootstrap input st_nlink != 1: {source}/{name}")
        fd = os.open(
            name,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=source_fd,
        )
        try:
            opened = os.fstat(fd)
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise SystemExit(f"ERROR: installer bootstrap input changed: {source}/{name}")
        finally:
            os.close(fd)
finally:
    os.close(source_fd)

validate_ancestry(source)
PY

_path_guard() {
  /usr/bin/env -i HOME=/root PATH="$INSTALL_SECURE_PATH" \
    "$PATH_GUARD_PYTHON" -I -S "$PATH_GUARD" \
    --anchor "$INSTALL_TRUST_ANCHOR" \
    --trusted-uid "$INSTALL_TRUSTED_UID" \
    --trusted-gid "$INSTALL_TRUSTED_GID" \
    "$@"
}

_harden_managed_release() {
  _path_guard harden-release --app-dir "$APP_DIR" --path "$1" >/dev/null
}

_run_as_service_user() {
  "$RUNUSER" --user "$SVC_USER" -- \
    /usr/bin/env -i \
      HOME="$APP_DIR" \
      PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
      XDG_CONFIG_HOME="$APP_DIR/.config" \
      XDG_CACHE_HOME="$APP_DIR/.cache" \
      XDG_DATA_HOME="$APP_DIR/.data" \
      XDG_STATE_HOME="$APP_DIR/.state" \
      PYTHONDONTWRITEBYTECODE=1 \
      "$@"
}

if [ ! -f "$PATH_GUARD" ]; then
  echo "ERROR: installer path guard unavailable: $PATH_GUARD" >&2
  exit 2
fi
_path_guard validate-source-tree --source-dir "$SRC_DIR"

# PYTHON is intentionally operator-selectable because Ubuntu 22.04's default
# interpreter can be older than the worker's Python 3.11 floor. Treat that
# environment value as privileged input: require a root-owned executable under
# a symlink-free, non-writable ancestry, then use only its canonical path.
PYTHON="$(_path_guard validate-trusted-executable --path "$PYTHON")"

_run_privileged_python() {
  /usr/bin/env -i HOME=/root PATH="$INSTALL_SECURE_PATH" \
    "$PYTHON" -I -S "$@"
}

_run_candidate_python() {
  local candidate_python="$1"
  shift
  /usr/bin/env -i HOME=/root PATH="$INSTALL_SECURE_PATH" \
    PIP_CONFIG_FILE=/dev/null \
    SOURCE_DATE_EPOCH="$WORKER_SOURCE_DATE_EPOCH" \
    TMPDIR="$TRANSACTION_DIR/build-tmp" \
    "$candidate_python" -I "$@"
}

_compile_field_raster_helper() {
  local candidate_venv="$1"
  local qualified_package_version="$2"
  local qualified_pkg_config_version="$3"
  local qualified_pkg_config_flags_json="$4"
  local candidate_python="$candidate_venv/bin/python"
  local helper_source
  local helper_dir="$candidate_venv/libexec/patina"
  local helper_output="$helper_dir/field-raster-libheif-helper-v2"
  local helper_manifest="$helper_output.manifest.json"
  local compiler
  local pkg_config

  compiler="$(_path_guard validate-trusted-executable --path /usr/bin/cc)"
  pkg_config="$(_path_guard validate-trusted-executable --path /usr/bin/pkg-config)"
  helper_source="$(_run_candidate_python "$candidate_python" -c \
    'from pathlib import Path; import patina_scan_worker; print(Path(patina_scan_worker.__file__).with_name("field_raster_libheif.c"))')"
  install -d -m 0700 "$candidate_venv/libexec" "$helper_dir"
  _run_candidate_python "$candidate_python" - \
    "$compiler" "$pkg_config" "$helper_source" "$helper_output" \
    "$helper_manifest" "$qualified_package_version" \
    "$qualified_pkg_config_version" "$qualified_pkg_config_flags_json" <<'PY'
import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys

from patina_scan_worker.field_raster_qualification import (
    _validated_pkg_config_tokens,
)

compiler = pathlib.Path(sys.argv[1])
pkg_config = pathlib.Path(sys.argv[2])
source = pathlib.Path(sys.argv[3])
output = pathlib.Path(sys.argv[4])
manifest = pathlib.Path(sys.argv[5])
qualified_package_version = sys.argv[6]
qualified_pkg_config_version = sys.argv[7]
qualified_pkg_config_flags = json.loads(sys.argv[8])
expected_source_sha256 = (
    "3b184937b755dc4acca4347ea6dba43dbeb111f090a91cd340e65d214937c626"
)
flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
source_fd = os.open(source, flags)
try:
    before = os.lstat(source)
    opened = os.fstat(source_fd)
    if (
        not stat.S_ISREG(before.st_mode)
        or stat.S_ISLNK(before.st_mode)
        or (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino)
        or before.st_uid != os.geteuid()
        or before.st_gid != os.getegid()
        or before.st_mode & 0o022
        or before.st_nlink != 1
    ):
        raise SystemExit("installed Field raster helper source is untrusted")
    digest = hashlib.sha256()
    while chunk := os.read(source_fd, 1024 * 1024):
        digest.update(chunk)
finally:
    os.close(source_fd)
if digest.hexdigest() != expected_source_sha256:
    raise SystemExit("installed Field raster helper source is not the I92-qualified bytes")
for candidate in (output, manifest):
    if candidate.exists() or candidate.is_symlink():
        raise SystemExit(f"Field raster helper output already exists: {candidate}")

tool_env = {
    "PATH": "/usr/bin:/bin",
    "LANG": "C",
    "LC_ALL": "C",
    "PKG_CONFIG_LIBDIR": (
        "/usr/lib/x86_64-linux-gnu/pkgconfig:"
        "/usr/lib/pkgconfig:/usr/share/pkgconfig"
    ),
}
pkg = subprocess.run(
    [str(pkg_config), "--cflags", "--libs", "libheif"],
    env=tool_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    check=False,
)
if pkg.returncode != 0:
    raise SystemExit("pkg-config could not resolve the qualified system libheif")
pkg_flags = _validated_pkg_config_tokens(pkg.stdout)
if list(pkg_flags) != qualified_pkg_config_flags:
    raise SystemExit("libheif pkg-config flags changed before helper compilation")
base_flags = [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-D_FORTIFY_SOURCE=3",
    "-fstack-protector-strong",
    "-fPIE",
    "-pie",
    "-Wl,-z,relro,-z,now",
    "-x",
    "c",
]
command = [
    str(compiler),
    *base_flags,
    f"/proc/self/fd/{{SOURCE_FD}}",
    "-o",
    str(output),
    *pkg_flags,
]
if not pathlib.Path("/proc/self/fd").is_dir():
    raise SystemExit("Field raster helper compilation requires /proc/self/fd")
compile_source_fd = os.open(source, flags)
try:
    compile_source = os.fstat(compile_source_fd)
    identity = lambda value: (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )
    if identity(compile_source) != identity(opened):
        raise SystemExit("installed Field raster helper source changed before compilation")
    command[command.index(f"/proc/self/fd/{{SOURCE_FD}}")] = (
        f"/proc/self/fd/{compile_source_fd}"
    )
    compiled = subprocess.run(
        command,
        env=tool_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        pass_fds=(compile_source_fd,),
    )
finally:
    os.close(compile_source_fd)
if compiled.returncode != 0:
    detail = compiled.stderr.decode("utf-8", errors="replace")[-4096:]
    raise SystemExit(f"Field raster helper compilation failed: {detail}")
os.chmod(output, 0o755)
helper_fd = os.open(output, flags)
try:
    final = os.lstat(output)
    held = os.fstat(helper_fd)
    if (
        not stat.S_ISREG(final.st_mode)
        or stat.S_ISLNK(final.st_mode)
        or (final.st_dev, final.st_ino) != (held.st_dev, held.st_ino)
        or final.st_uid != os.geteuid()
        or final.st_gid != os.getegid()
        or stat.S_IMODE(final.st_mode) != 0o755
        or final.st_nlink != 1
        or final.st_size <= 0
    ):
        raise SystemExit("compiled Field raster helper is untrusted")
    helper_digest = hashlib.sha256()
    helper_offset = 0
    while chunk := os.pread(helper_fd, 1024 * 1024, helper_offset):
        helper_digest.update(chunk)
        helper_offset += len(chunk)
    os.fsync(helper_fd)
finally:
    os.close(helper_fd)
compiler_probe = subprocess.run(
    [str(compiler), "--version"],
    env=tool_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
)
libheif_probe = subprocess.run(
    [str(pkg_config), "--modversion", "libheif"],
    env=tool_env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
)
if compiler_probe.returncode != 0 or libheif_probe.returncode != 0:
    raise SystemExit("could not record the Field raster helper toolchain")
compiler_version = (
    compiler_probe.stdout.decode("utf-8", errors="strict").splitlines()[0]
)
libheif_version = libheif_probe.stdout.decode("ascii", errors="strict").strip()
if (
    not compiler_version
    or len(compiler_version.encode("utf-8")) > 256
    or not libheif_version
    or len(libheif_version) > 128
    or libheif_version != qualified_pkg_config_version
    or not qualified_package_version
    or len(qualified_package_version) > 128
):
    raise SystemExit("Field raster helper toolchain identity is invalid")
manifest_value = {
    "binarySha256": helper_digest.hexdigest(),
    "compileFlags": base_flags,
    "compilerPath": str(compiler),
    "compilerVersion": compiler_version,
    "libheifPackageVersion": qualified_package_version,
    "libheifPkgConfigVersion": libheif_version,
    "pkgConfigFlags": list(pkg_flags),
    "schema": "patina-field-raster-helper-manifest-v1",
    "sourceSha256": expected_source_sha256,
}
manifest_payload = (
    json.dumps(
        manifest_value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )
    + "\n"
).encode("ascii")
manifest_fd = os.open(
    manifest,
    os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
    0o600,
)
try:
    written = 0
    while written < len(manifest_payload):
        count = os.write(manifest_fd, manifest_payload[written:])
        if count <= 0:
            raise SystemExit("Field raster helper manifest write made no progress")
        written += count
    os.fchmod(manifest_fd, 0o644)
    manifest_stat = os.fstat(manifest_fd)
    if (
        not stat.S_ISREG(manifest_stat.st_mode)
        or manifest_stat.st_uid != os.geteuid()
        or manifest_stat.st_gid != os.getegid()
        or stat.S_IMODE(manifest_stat.st_mode) != 0o644
        or manifest_stat.st_nlink != 1
        or manifest_stat.st_size != len(manifest_payload)
        or manifest_stat.st_size > 4096
    ):
        raise SystemExit("compiled Field raster helper manifest is untrusted")
    os.fsync(manifest_fd)
finally:
    os.close(manifest_fd)
directory_fd = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
}

_validate_direct_wheel_report() {
  local candidate_python="$1"
  local report_path="$2"
  local distribution_name="$3"
  local distribution_version="$4"
  local wheel="$5"
  local expected_hash="$6"
  _run_candidate_python "$candidate_python" - \
    "$report_path" "$distribution_name" "$distribution_version" \
    "$wheel" "$expected_hash" <<'PY'
import json
import pathlib
import sys

report_path = pathlib.Path(sys.argv[1])
expected_name = sys.argv[2]
expected_version = sys.argv[3]
wheel = pathlib.Path(sys.argv[4]).resolve(strict=True)
expected_hash = sys.argv[5]

def canonical_name(value):
    return value.lower().replace("_", "-")

report = json.loads(report_path.read_text(encoding="utf-8"))
records = [
    record
    for record in report.get("install", [])
    if canonical_name(record.get("metadata", {}).get("name", "")) == expected_name
]
if len(records) != 1:
    raise SystemExit(
        f"pip report must contain one {expected_name} record: {records!r}"
    )
record = records[0]
if record.get("requested") is not True or record.get("is_direct") is not True:
    raise SystemExit(f"pip did not treat {expected_name} as direct/requested")
if record.get("metadata", {}).get("version") != expected_version:
    raise SystemExit(f"pip report selected the wrong {expected_name} version")
download = record.get("download_info", {})
if download.get("url") != wheel.as_uri():
    raise SystemExit(
        f"pip report {expected_name} URL mismatch: {download.get('url')!r}"
    )
if download.get("archive_info", {}).get("hashes", {}).get("sha256") != expected_hash:
    raise SystemExit(f"pip report {expected_name} SHA-256 mismatch")
PY
}

# Only now are helper bytes root-owned, non-service-writable, and reached
# through a trusted ancestry.
# shellcheck source=install-venv-lib.sh
. "$SRC_DIR/install-venv-lib.sh"

_recover_on_exit() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -d "$TRANSACTION_DIR" ]; then
    recover_install_transaction || true
  fi
  exit "$status"
}
trap _recover_on_exit EXIT

if [ ! -x "$RUNUSER" ]; then
  echo "ERROR: service-user smoke requires $RUNUSER (util-linux)." >&2
  exit 2
fi

# Recovery metadata is privileged input. Establish a real, root-owned,
# non-group/world-writable parent before reading any prior marker.
_path_guard ensure-trusted-dir --path "$ETC_DIR" --mode 0750

# Recover before evaluating live GPU policy: an interrupted prior transaction
# may have installed only one of its candidate drop-ins.
recover_install_transaction

# Fail closed BEFORE touching apt, users, dirs, venvs, env, or units. Rebuilding
# an existing GPU install without --gpu would retain device policy but omit its
# Python dependencies.
if [ "$UPGRADE" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: refusing to rebuild an existing GPU worker as CPU-only by omission." >&2
  echo "       Re-run with: sudo /opt/patina/scan-pipeline-source/install.sh --gpu --upgrade" >&2
  exit 2
fi
if [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ] && \
   [ ! -f "$DOCTOR_DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: this pre-doctor GPU install needs one explicit --gpu run so both" >&2
  echo "       systemd contexts receive the same transactional GPU policy." >&2
  exit 2
fi

# The GPU prepare unit calls this exact executable as root. Validate it before
# any install-side mutation.
if [ "$GPU" -eq 1 ] && [ ! -x "$NVIDIA_MODPROBE" ]; then
  echo "ERROR: --gpu requires executable $NVIDIA_MODPROBE." >&2
  echo "       Install the NVIDIA driver's nvidia-modprobe package first." >&2
  exit 2
fi
if [ "$GPU" -eq 1 ] && \
   { ! /usr/bin/grep -Eq '^ID=ubuntu$' /etc/os-release || \
     ! /usr/bin/grep -Eq '^VERSION_ID="?24\.04"?$' /etc/os-release; }; then
  echo "ERROR: --gpu Field raster execution is qualified only on Ubuntu 24.04." >&2
  echo "       Use a Noble x86_64 host or complete a new physical qualification." >&2
  exit 2
fi

# The ordinary pycolmap==4.0.2 index wheel is CPU-only. Validate the separately
# built immutable CUDA artifact and the target interpreter ABI before apt,
# users, release creation, or a new activation transaction can change state.
if [ "$GPU" -eq 1 ]; then
  SYSTEM_PYTHON="$(_path_guard validate-trusted-executable --path /usr/bin/python3)"
  if [ "$PYTHON" != "$SYSTEM_PYTHON" ]; then
    echo "ERROR: --gpu requires the artifact ABI interpreter /usr/bin/python3." >&2
    echo "       Unset PYTHON and rerun; alternate Python ABIs are not qualified." >&2
    exit 2
  fi
  PYTHON_ABI="$(_run_privileged_python -c \
    'import platform, struct, sys, sysconfig; v=f"cp{sys.version_info.major}{sys.version_info.minor}"; print("{}-{}:{}:{}:{}".format(v, v, sysconfig.get_config_var("SOABI"), platform.machine(), struct.calcsize("P")*8))')"
  if [ "$PYTHON_ABI" != \
    "cp312-cp312:cpython-312-x86_64-linux-gnu:x86_64:64" ]; then
    echo "ERROR: --gpu artifact requires CPython 3.12 x86_64 ABI; got $PYTHON_ABI" >&2
    exit 2
  fi
  PYCOLMAP_WHEEL="$(_path_guard validate-pycolmap-artifact --artifact-dir "$PYCOLMAP_ARTIFACT_DIR" \
    --expected-python-tag "$PYCOLMAP_PYTHON_TAG")" || {
      echo "ERROR: missing or invalid qualified PyCOLMAP CUDA artifact." >&2
      echo "       Run install-colmap-4.0.2.sh on this box first." >&2
      exit 2
    }
  PYCOLMAP_WHEEL_SHA256="$(/usr/bin/sha256sum "$PYCOLMAP_WHEEL" | /usr/bin/awk '{print $1}')"
  PYCOLMAP_REQUIREMENT="pycolmap @ file://$PYCOLMAP_WHEEL#sha256=$PYCOLMAP_WHEEL_SHA256"
fi

echo "== Patina scan-pipeline worker install (gpu=$GPU upgrade=$UPGRADE) =="
echo "source: $SRC_DIR"

# 0. native libs — cairosvg (PDF sheets, item 11) needs libcairo2
_probe_field_raster_libheif_toolchain() {
  local raster_package
  local raster_package_version
  local raster_pkg_config_flags
  local raster_min_libheif_version=1.17.6-1ubuntu4.6

  for raster_package in \
    build-essential pkg-config zlib1g-dev libheif1 libheif-dev \
    libheif-plugin-libde265; do
    if [ "$(/usr/bin/dpkg-query -W -f='${db:Status-Abbrev}' \
      "$raster_package" 2>/dev/null)" != "ii " ]; then
      echo "ERROR: required Field raster package is not installed: $raster_package" >&2
      echo "       Install the complete Noble toolchain before rerunning --gpu." >&2
      exit 2
    fi
  done
  if [ ! -x /usr/bin/cc ] || [ ! -x /usr/bin/pkg-config ] || \
     ! /usr/bin/env -i \
       PATH=/usr/bin:/bin \
       PKG_CONFIG_LIBDIR=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig \
       /usr/bin/pkg-config --exists libheif; then
    echo "ERROR: the installed Field raster qualification toolchain is incomplete." >&2
    exit 2
  fi

  raster_reference_libheif_version=
  for raster_package in libheif1 libheif-dev libheif-plugin-libde265; do
    raster_package_version="$(/usr/bin/dpkg-query -W -f='${Version}' \
      "$raster_package" 2>/dev/null)"
    if ! /usr/bin/dpkg --compare-versions "$raster_package_version" ge \
      "$raster_min_libheif_version"; then
      echo "ERROR: $raster_package $raster_package_version is older than the" >&2
      echo "       required Noble security revision $raster_min_libheif_version." >&2
      echo "       Run apt-get update, install the listed packages, and rerun." >&2
      exit 2
    fi
    if [ -z "$raster_reference_libheif_version" ]; then
      raster_reference_libheif_version="$raster_package_version"
    elif [ "$raster_package_version" != "$raster_reference_libheif_version" ]; then
      echo "ERROR: Noble libheif runtime/dev/plugin package versions do not match." >&2
      exit 2
    fi
  done

  raster_pkg_config_libheif_version="$(
    /usr/bin/env -i \
      PATH=/usr/bin:/bin \
      PKG_CONFIG_LIBDIR=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig \
      /usr/bin/pkg-config --modversion libheif
  )"
  raster_pkg_config_flags="$(
    /usr/bin/env -i \
      PATH=/usr/bin:/bin \
      PKG_CONFIG_LIBDIR=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig \
      /usr/bin/pkg-config --cflags --libs libheif
  )"
  raster_pkg_config_flags_json="$(
    _run_privileged_python -c \
      'import json,re,shlex,sys; tokens=shlex.split(sys.argv[1],posix=True); allowed=lambda x: x=="-pthread" or re.fullmatch(r"-l[A-Za-z0-9_+.-]+",x) or re.fullmatch(r"-[IL]/[A-Za-z0-9_+.,/@:-]+",x) or re.fullmatch(r"-D[A-Za-z_][A-Za-z0-9_]*(?:=[A-Za-z0-9_+.,-]+)?",x); assert tokens and "-lheif" in tokens and all(allowed(x) for x in tokens); print(json.dumps(tokens,separators=(",",":"),ensure_ascii=True,allow_nan=False))' \
      "$raster_pkg_config_flags"
  )"
  if [[ ! "$raster_reference_libheif_version" =~ ^[0-9A-Za-z.+:~_-]{1,128}$ ]] || \
     [[ ! "$raster_pkg_config_libheif_version" =~ ^[0-9A-Za-z.+:~_-]{1,128}$ ]]; then
    echo "ERROR: the installed Field raster libheif identity is invalid." >&2
    exit 2
  fi
}

if command -v apt-get >/dev/null 2>&1; then
  echo "-- ensuring libcairo2 is present (cairosvg → PDF)"
  apt-get install -y --no-install-recommends libcairo2 >/dev/null 2>&1 || \
    echo "   (could not apt-get libcairo2 — install it manually if PDF rendering fails)"
fi
if [ "$GPU" -eq 1 ] && ! command -v ninja >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1 || \
     ! apt-get install -y --no-install-recommends ninja-build >/dev/null 2>&1; then
    echo "ERROR: --gpu requires Ninja for gsplat's CUDA extension JIT." >&2
    echo "       Install the distro's ninja-build package, then rerun." >&2
    exit 2
  fi
fi
if [ "$GPU" -eq 1 ]; then
  echo "-- validating the preinstalled Field raster C/libheif toolchain"
  _probe_field_raster_libheif_toolchain
  raster_install_libheif_package_version="$raster_reference_libheif_version"
  raster_install_libheif_pkg_config_version="$raster_pkg_config_libheif_version"
  raster_install_pkg_config_flags_json="$raster_pkg_config_flags_json"
  FIELD_RASTER_RELEASE_GUARD_ARGS=(
    --require-field-raster-helper
    --expected-field-raster-libheif-package-version
    "$raster_install_libheif_package_version"
    --expected-field-raster-libheif-pkg-config-version
    "$raster_install_libheif_pkg_config_version"
    --expected-field-raster-pkg-config-flags-json
    "$raster_install_pkg_config_flags_json"
  )
fi
if [ "$GPU" -eq 1 ] && ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "   WARNING: --gpu given but nvidia-smi not found. Install the NVIDIA driver"
  echo "            + CUDA 11.8 toolkit (nvcc, for gsplat's JIT build) first."
fi

# 1. service user + root-owned executable namespace + delegated writable dirs
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  echo "-- creating service user '$SVC_USER'"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
SVC_UID="$(id -u "$SVC_USER")"
SVC_GID="$(id -g "$SVC_USER")"

# /opt/patina and runtime APP_DIR are an executable trust boundary. The
# --adopt-final transition accepts only the final old runtime directory, never
# a symlink or untrusted parent. Source has already been validated separately.
_path_guard ensure-trusted-dir --path "${APP_DIR%/*}" --mode 0755
_path_guard ensure-trusted-dir --path "$APP_DIR" --mode 0755 --adopt-final

# APP_DIR is runtime-only. Atomically replace any legacy co-located installer
# with a root-owned fail-closed stub so an old operational runbook cannot sudo a
# stale service-controlled copy after source moved to its separate trust tree.
_path_guard install-runtime-stub --app-dir "$APP_DIR"
_path_guard ensure-trusted-dir --path "$WORK_PARENT" --mode 0755
_path_guard ensure-owned-dir --app-dir "$WORK_PARENT" --path "$WORK_DIR" \
  --owner-uid "$SVC_UID" --owner-gid "$SVC_GID" --mode 0750
for writable_dir in \
  "$APP_DIR/.config" "$APP_DIR/.cache" "$APP_DIR/.data" "$APP_DIR/.state"; do
  _path_guard ensure-owned-dir --app-dir "$APP_DIR" --path "$writable_dir" \
    --owner-uid "$SVC_UID" --owner-gid "$SVC_GID" --mode 0750
done
if [ "$GPU" -eq 1 ]; then
  for writable_dir in \
    "$APP_DIR/.cache/torch" "$APP_DIR/.cache/nv" \
    "$APP_DIR/.cache/torch_extensions"; do
    _path_guard ensure-owned-dir --app-dir "$APP_DIR" --path "$writable_dir" \
      --owner-uid "$SVC_UID" --owner-gid "$SVC_GID" --mode 0750
  done
fi

# Existing stable/previous symlinks must stay inside the managed immutable
# namespace. They may name a release the active worker is still traversing, so
# validate them without chmod/chown; an insecure live tree fails closed and is
# never transiently made 0700 while the worker remains active.
if [ -L "$VENV" ]; then
  _path_guard validate-release --app-dir "$APP_DIR" --path "$VENV" \
    --stable-link --require-executables >/dev/null
fi
if [ -L "$PREVIOUS_VENV" ]; then
  _path_guard validate-release --app-dir "$APP_DIR" --path "$PREVIOUS_VENV" \
    --stable-link >/dev/null
fi

# A fresh install, explicit upgrade, CPU→GPU conversion, broken link, or legacy
# real-directory .venv builds a clean release. The legacy case is converted once
# during the recoverable activation window.
BUILD_VENV=0
if [ ! -d "$VENV" ] || [ ! -L "$VENV" ] || [ "$UPGRADE" -eq 1 ]; then
  BUILD_VENV=1
elif [ "$GPU" -eq 1 ] && [ ! -f "$DROPIN_DIR/gpu.conf" ]; then
  BUILD_VENV=1
elif [ "$GPU" -eq 1 ]; then
  if ! _path_guard validate-release --app-dir "$APP_DIR" --path "$VENV" \
    --stable-link "${FIELD_RASTER_RELEASE_GUARD_ARGS[@]}" >/dev/null 2>&1; then
    echo "-- existing GPU release helper is missing, invalid, or stale; rebuilding"
    BUILD_VENV=1
  fi
fi
if [ "$BUILD_VENV" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: this GPU install needs --gpu whenever its Python release is rebuilt." >&2
  exit 2
fi

if [ "$BUILD_VENV" -eq 1 ]; then
  # Generate only a high-entropy final name now. prepare_install_transaction
  # durably records it before create-release performs the atomic mkdir.
  STAGED_VENV="$(_path_guard generate-release-path --app-dir "$APP_DIR")"
fi

# From this point, every failure is either cleaned by the EXIT trap or recovered
# from the durable marker by the next invocation.
prepare_install_transaction
CANDIDATE_SYSTEMD_DIR="$TRANSACTION_DIR/candidate-systemd"
install -d "$CANDIDATE_SYSTEMD_DIR"

# 2. immutable Python candidate + dependency/import/entrypoint smoke
SMOKE_VENV="$VENV"
if [ "$BUILD_VENV" -eq 1 ]; then
  _path_guard create-release --app-dir "$APP_DIR" --path "$STAGED_VENV"
  BUILD_SOURCE="$(_prepare_isolated_source_build "$SRC_DIR")"
  install -d -m 0700 "$TRANSACTION_DIR/build-tmp" "$STAGED_VENV/.artifacts"
  echo "-- building staged venv at $STAGED_VENV ($(_run_privileged_python --version 2>&1))"
  _run_privileged_python -m venv "$STAGED_VENV"
  _run_candidate_python "$STAGED_VENV/bin/python" -m pip \
    --isolated --disable-pip-version-check install \
    --no-cache-dir --upgrade pip >/dev/null
  echo "-- build one isolated worker wheel"
  _run_candidate_python "$STAGED_VENV/bin/python" -m pip \
    --isolated --disable-pip-version-check wheel --no-cache-dir --no-deps \
    --wheel-dir "$STAGED_VENV/.artifacts" "$BUILD_SOURCE"
  WORKER_WHEEL_INFO="$(_path_guard validate-worker-wheel \
    --wheel-dir "$STAGED_VENV/.artifacts" --source-dir "$SRC_DIR")"
  IFS=$'\t' read -r WORKER_WHEEL WORKER_WHEEL_SHA256 <<<"$WORKER_WHEEL_INFO"
  if [ -z "$WORKER_WHEEL" ] || \
     [[ ! "$WORKER_WHEEL_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: invalid validated worker wheel identity." >&2
    exit 1
  fi
  if [ "$GPU" -eq 1 ]; then
    WORKER_REQUIREMENT="patina-scan-worker[drawings,gpu] @ file://$WORKER_WHEEL#sha256=$WORKER_WHEEL_SHA256"
    echo "-- pip install qualified local PyCOLMAP + worker wheel[drawings,gpu]"
    _run_candidate_python "$STAGED_VENV/bin/python" -m pip \
      --isolated --disable-pip-version-check install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cu118 \
      --report "$STAGED_VENV/pip-install-report.json" \
      "$PYCOLMAP_REQUIREMENT" "numpy==1.26.4" "$WORKER_REQUIREMENT"
    _validate_direct_wheel_report "$STAGED_VENV/bin/python" \
      "$STAGED_VENV/pip-install-report.json" pycolmap 4.0.2 \
      "$PYCOLMAP_WHEEL" "$PYCOLMAP_WHEEL_SHA256"
  else
    WORKER_REQUIREMENT="patina-scan-worker[drawings] @ file://$WORKER_WHEEL#sha256=$WORKER_WHEEL_SHA256"
    echo "-- pip install worker wheel[drawings] (CPU-only)"
    _run_candidate_python "$STAGED_VENV/bin/python" -m pip \
      --isolated --disable-pip-version-check install --no-cache-dir \
      --report "$STAGED_VENV/pip-install-report.json" \
      "$WORKER_REQUIREMENT"
  fi
  _validate_direct_wheel_report "$STAGED_VENV/bin/python" \
    "$STAGED_VENV/pip-install-report.json" patina-scan-worker 0.1.0 \
    "$WORKER_WHEEL" "$WORKER_WHEEL_SHA256"
  _path_guard validate-source-tree --source-dir "$SRC_DIR"
  _run_candidate_python "$STAGED_VENV/bin/python" -m pip \
    --isolated --disable-pip-version-check check
  if [ "$GPU" -eq 1 ]; then
    echo "-- compiling exact I92-qualified Field raster helper"
    _compile_field_raster_helper \
      "$STAGED_VENV" "$raster_install_libheif_package_version" \
      "$raster_install_libheif_pkg_config_version" \
      "$raster_install_pkg_config_flags_json"
  fi
  _path_guard harden-release --app-dir "$APP_DIR" --path "$STAGED_VENV" >/dev/null
  SMOKE_VENV="$STAGED_VENV"
else
  echo "-- existing venv left untouched (use --upgrade to rebuild from source)"
fi
if [ "$SMOKE_VENV" = "$VENV" ]; then
  if [ "$GPU" -eq 1 ]; then
    _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
      --stable-link --require-executables \
      "${FIELD_RASTER_RELEASE_GUARD_ARGS[@]}" >/dev/null
  else
    _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
      --stable-link --require-executables >/dev/null
  fi
else
  if [ "$GPU" -eq 1 ]; then
    _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
      --require-executables "${FIELD_RASTER_RELEASE_GUARD_ARGS[@]}" >/dev/null
  else
    _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
      --require-executables >/dev/null
  fi
fi
echo "-- smoke-checking package imports and console entrypoint"
_run_as_service_user "$SMOKE_VENV/bin/python" -I -c \
  'import patina_scan_worker; import patina_scan_worker.cli; import patina_scan_worker.doctor; import patina_scan_worker.field_raster_materializer; import patina_scan_worker.field_storage_acquirer; import patina_scan_worker.refine_colmap_backend; import patina_scan_worker.refine_colmap_command; import patina_scan_worker.refine_colmap_manifest; import patina_scan_worker.refine_colmap_toolchain; import patina_scan_worker.refine_evidence_builder; import patina_scan_worker.refine_lifecycle; import patina_scan_worker.refine_materializer; import patina_scan_worker.refine_model_alignment; import patina_scan_worker.refine_native_process; import patina_scan_worker.refine_packet_extractor; import patina_scan_worker.refine_publisher; import patina_scan_worker.refine_runner'
if [ "$GPU" -eq 1 ]; then
  _run_as_service_user /usr/bin/test -x \
    "$SMOKE_VENV/libexec/patina/field-raster-libheif-helper-v2"
  if FIELD_RASTER_HELPER_SMOKE="$(
    _run_as_service_user /usr/bin/timeout 5 \
      "$SMOKE_VENV/libexec/patina/field-raster-libheif-helper-v2" 2>&1
  )"; then
    FIELD_RASTER_HELPER_SMOKE_STATUS=0
  else
    FIELD_RASTER_HELPER_SMOKE_STATUS=$?
  fi
  if [ "$FIELD_RASTER_HELPER_SMOKE_STATUS" -ne 2 ] || \
     [ "$FIELD_RASTER_HELPER_SMOKE" != \
       "usage: field-raster-libheif INPUT.heic OUTPUT.ppm WIDTH HEIGHT" ]; then
    echo "ERROR: Field raster helper no-argument smoke returned" \
      "$FIELD_RASTER_HELPER_SMOKE_STATUS with unexpected output." >&2
    exit 1
  fi
fi
if [ "$BUILD_VENV" -eq 1 ]; then
  echo "-- verifying durable direct worker-wheel provenance"
  _run_as_service_user "$SMOKE_VENV/bin/python" -I - \
    "$SMOKE_VENV" "$WORKER_WHEEL" "$WORKER_WHEEL_SHA256" <<'PY'
import hashlib
import importlib.metadata
import json
import pathlib
import sys

prefix = pathlib.Path(sys.argv[1]).resolve(strict=True)
wheel = pathlib.Path(sys.argv[2]).resolve(strict=True)
expected_hash = sys.argv[3]
wheel.relative_to(prefix)
distribution = importlib.metadata.distribution("patina-scan-worker")
if distribution.version != "0.1.0":
    raise SystemExit(f"unexpected worker distribution version: {distribution.version}")
direct_urls = [
    pathlib.Path(distribution.locate_file(entry))
    for entry in (distribution.files or ())
    if entry.name == "direct_url.json"
]
if len(direct_urls) != 1:
    raise SystemExit(f"expected one worker direct_url.json, got {direct_urls!r}")
direct = json.loads(direct_urls[0].read_text(encoding="utf-8"))
if direct.get("url") != wheel.as_uri():
    raise SystemExit(f"worker direct URL mismatch: {direct.get('url')!r}")
if direct.get("archive_info", {}).get("hashes", {}).get("sha256") != expected_hash:
    raise SystemExit("worker direct_url.json SHA-256 mismatch")
hasher = hashlib.sha256()
with wheel.open("rb") as stream:
    while chunk := stream.read(1024 * 1024):
        hasher.update(chunk)
if hasher.hexdigest() != expected_hash:
    raise SystemExit("durable worker wheel SHA-256 mismatch")
PY
fi
if [ "$GPU" -eq 1 ]; then
  echo "-- verifying direct PyCOLMAP artifact provenance and bounded CUDA SIFT"
  _run_as_service_user "$SMOKE_VENV/bin/python" -I - \
    "$SMOKE_VENV" "$PYCOLMAP_WHEEL" "$PYCOLMAP_WHEEL_SHA256" <<'PY'
import importlib.metadata
import json
import pathlib
import sys

prefix = pathlib.Path(sys.argv[1]).resolve(strict=True)
wheel = pathlib.Path(sys.argv[2]).resolve(strict=True)
expected_hash = sys.argv[3]
distribution = importlib.metadata.distribution("pycolmap")
if distribution.version != "4.0.2":
    raise SystemExit(f"unexpected pycolmap distribution version: {distribution.version}")
direct_urls = [
    pathlib.Path(distribution.locate_file(entry))
    for entry in (distribution.files or ())
    if entry.name == "direct_url.json"
]
if len(direct_urls) != 1:
    raise SystemExit(f"expected one pycolmap direct_url.json, got {direct_urls!r}")
direct = json.loads(direct_urls[0].read_text(encoding="utf-8"))
if direct.get("url") != wheel.as_uri():
    raise SystemExit(f"pycolmap direct URL mismatch: {direct.get('url')!r}")
archive = direct.get("archive_info", {})
hashes = archive.get("hashes", {})
if hashes.get("sha256") != expected_hash:
    raise SystemExit("pycolmap direct_url.json SHA-256 mismatch")
import pycolmap
module = pathlib.Path(pycolmap.__file__).resolve(strict=True)
try:
    module.relative_to(prefix)
except ValueError as exc:
    raise SystemExit(f"pycolmap imported outside candidate release: {module}") from exc
PY
  _run_as_service_user /usr/bin/timeout 90 \
    "$SMOKE_VENV/bin/python" -I -m patina_scan_worker.pycolmap_cuda_smoke \
    --expected-prefix "$SMOKE_VENV"
fi
_run_as_service_user "$SMOKE_VENV/bin/patina-scan-worker" --help >/dev/null

# 3. stage a complete candidate systemd tree. Nothing under /etc/systemd is
# replaced until after verify + the rollback snapshot.
install -m 0644 "$SRC_DIR/patina-scan-worker.service" \
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service"
install -m 0644 "$SRC_DIR/patina-scan-worker-doctor.service" \
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service"

MANAGED_UNIT_TARGETS=("$UNIT" "$DOCTOR_UNIT")
CANDIDATE_UNIT_PATHS=(
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service"
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service"
)
VERIFY_UNITS=(patina-scan-worker.service patina-scan-worker-doctor.service)

if [ "$GPU" -eq 1 ]; then
  install -d \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service.d" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service.d"
  install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service.d/gpu.conf"
  install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service.d/gpu.conf"
  install -m 0644 "$SRC_DIR/patina-scan-worker-nvidia-prepare.service" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-nvidia-prepare.service"
  MANAGED_UNIT_TARGETS+=(
    "$DROPIN_DIR/gpu.conf"
    "$DOCTOR_DROPIN_DIR/gpu.conf"
    "$NVIDIA_PREPARE_UNIT"
  )
  CANDIDATE_UNIT_PATHS+=(
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service.d/gpu.conf"
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service.d/gpu.conf"
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-nvidia-prepare.service"
  )
  VERIFY_UNITS+=(patina-scan-worker-nvidia-prepare.service)
fi

verify_candidate_units() {
  if [ "$(uname -s)" != Linux ]; then
    echo "-- non-Linux authoring host: systemd-analyze verify deferred to target"
    return 0
  fi
  if ! command -v systemd-analyze >/dev/null 2>&1; then
    echo "ERROR: Linux activation requires systemd-analyze verify." >&2
    return 1
  fi
  echo "-- verifying merged candidate systemd units/drop-ins"
  env SYSTEMD_UNIT_PATH="$CANDIDATE_SYSTEMD_DIR:" \
    systemd-analyze verify "${VERIFY_UNITS[@]}"
}
verify_candidate_units

# PID 1 reads EnvironmentFile before dropping to User=patina. Keep the service
# credential root-owned and unreadable by the worker process itself.
if [ ! -f "$ENV_FILE" ]; then
  echo "-- installing env template -> $ENV_FILE (edit URL/key/WORKER_ID/STAGES)"
  install -o root -g root -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"
else
  echo "-- $ENV_FILE exists; leaving it untouched"
fi

# A GPU candidate can take many minutes to build. Re-probe the immutable helper
# ABI immediately before activation so a concurrent package update cannot bind
# an old manifest to a newly loaded libheif.
if [ "$GPU" -eq 1 ]; then
  echo "-- revalidating Field raster libheif identity before activation"
  _probe_field_raster_libheif_toolchain
  if [ "$raster_reference_libheif_version" != \
       "$raster_install_libheif_package_version" ] || \
     [ "$raster_pkg_config_libheif_version" != \
       "$raster_install_libheif_pkg_config_version" ] || \
     [ "$raster_pkg_config_flags_json" != \
       "$raster_install_pkg_config_flags_json" ]; then
    echo "ERROR: the Field raster libheif toolchain changed during installation." >&2
    echo "       Rerun --gpu so a fresh helper is built against the current host." >&2
    exit 2
  fi
  if [ "$SMOKE_VENV" = "$VENV" ]; then
    _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
      --stable-link --require-executables \
      "${FIELD_RASTER_RELEASE_GUARD_ARGS[@]}" >/dev/null
  else
    _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
      --require-executables "${FIELD_RASTER_RELEASE_GUARD_ARGS[@]}" >/dev/null
  fi
fi

# 4. Snapshot installed units + release, then activate the whole candidate as a
# single transaction. Active activation is proven by the worker's ExecStartPre
# doctor; a failure restores units AND release before restarting the old worker.
begin_install_transaction
activate_install_transaction

echo "-- worker unit installed: $UNIT"
echo "-- doctor-only acceptance unit installed: $DOCTOR_UNIT"
if [ "$GPU" -eq 1 ]; then
  echo "-- identical GPU context installed for worker + doctor-only units"
  cat <<EOF

Next (item-3 GPU acceptance; ephemeral doctor override, never the queue worker):
  1. retain the README empty-GPU-queue query as rollout evidence
  2. copy/paste this as one subshell; the persistent worker env is never edited.
     A /run-only doctor drop-in disappears on reboot, so the enabled queue worker
     can boot only with its normal CPU stages. The temporary clone pins DeskDev's
     GCC 11/CUDA 11.8 JIT inputs without changing the host toolchain. If another
     doctor /run *.conf exists, this rejects it without deleting it:

(
  set -eu
  ITEM3_ENV=/run/patina/scan-worker-item3-gpu.env
  ITEM3_DROPIN_DIR=/run/systemd/system/patina-scan-worker-doctor.service.d
  ITEM3_DROPIN=\$ITEM3_DROPIN_DIR/90-item3-gpu-acceptance.conf
  assert_no_item3_runtime_dropins() {
    if [ -L "\$ITEM3_DROPIN_DIR" ] || \
       { [ -e "\$ITEM3_DROPIN_DIR" ] && [ ! -d "\$ITEM3_DROPIN_DIR" ]; }; then
      echo "refusing unsafe doctor /run drop-in directory: \$ITEM3_DROPIN_DIR" >&2
      return 1
    fi
    if [ -d "\$ITEM3_DROPIN_DIR" ]; then
      ITEM3_CONFLICT="\$(sudo /usr/bin/find -P "\$ITEM3_DROPIN_DIR" \
        -mindepth 1 -maxdepth 1 -name '*.conf' -print -quit)"
      if [ -n "\$ITEM3_CONFLICT" ]; then
        echo "refusing pre-existing doctor /run drop-in: \$ITEM3_CONFLICT" >&2
        return 1
      fi
    fi
  }
  if [ -e "\$ITEM3_ENV" ] || [ -L "\$ITEM3_ENV" ]; then
    echo "refusing pre-existing item-3 /run env: \$ITEM3_ENV" >&2
    exit 1
  fi
  assert_no_item3_runtime_dropins
  WORKER_WAS_ACTIVE="\$(systemctl show --property=ActiveState --value $WORKER_SERVICE)"
  case "\$WORKER_WAS_ACTIVE" in
    active|inactive|failed) ;;
    *) echo "refusing transitional worker state: \$WORKER_WAS_ACTIVE" >&2; exit 1 ;;
  esac
  restore_item3_gpu() {
    trap - EXIT INT TERM
    sudo systemctl stop patina-scan-worker-doctor >/dev/null 2>&1 || true
    sudo rm -f -- "\$ITEM3_DROPIN" "\$ITEM3_ENV"
    sudo rmdir "\$ITEM3_DROPIN_DIR" /run/patina 2>/dev/null || true
    sudo systemctl daemon-reload
    if [ "\$WORKER_WAS_ACTIVE" = active ]; then
      sudo systemctl start $WORKER_SERVICE
    fi
  }
  run_item3_doctor() {
    ITEM3_LABEL=\$1
    echo "-- \$ITEM3_LABEL item-3 GPU doctor"
    sudo journalctl --sync
    ITEM3_CURSOR="\$(sudo journalctl -n 1 --show-cursor --no-pager --quiet | \
      sed -n 's/^-- cursor: //p')"
    if [ -z "\$ITEM3_CURSOR" ]; then
      echo "could not capture journal cursor for \$ITEM3_LABEL doctor" >&2
      return 1
    fi
    if sudo systemctl start patina-scan-worker-doctor; then
      ITEM3_DOCTOR_STATUS=0
    else
      ITEM3_DOCTOR_STATUS=\$?
    fi
    sudo journalctl -u patina-scan-worker-doctor \
      --after-cursor="\$ITEM3_CURSOR" --no-pager --full -o cat
    return "\$ITEM3_DOCTOR_STATUS"
  }
  trap restore_item3_gpu EXIT INT TERM
  sudo systemctl stop $WORKER_SERVICE
  sudo systemctl stop patina-scan-worker-doctor
  ITEM3_DOCTOR_STATE="\$(systemctl show --property=ActiveState --value \
    patina-scan-worker-doctor)"
  case "\$ITEM3_DOCTOR_STATE" in
    inactive|failed) ;;
    *) echo "refusing non-quiescent doctor state: \$ITEM3_DOCTOR_STATE" >&2; exit 1 ;;
  esac
  assert_no_item3_runtime_dropins
  sudo install -d -o root -g root -m 0755 /run/patina "\$ITEM3_DROPIN_DIR"
  sudo install -o root -g root -m 0600 "$ENV_FILE" "\$ITEM3_ENV"
  printf '%s\n' \
    '' \
    'STAGES=refine,fuse,splat' \
    'GPU=auto' \
    'CC=/usr/bin/gcc-11' \
    'CXX=/usr/bin/g++-11' \
    'CUDAHOSTCXX=/usr/bin/g++-11' \
    'LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64' \
    'TORCH_CUDA_ARCH_LIST=7.5' \
    'MAX_JOBS=4' | \
    sudo tee -a "\$ITEM3_ENV" >/dev/null
  printf '[Service]\nEnvironmentFile=\nEnvironmentFile=%s\n' "\$ITEM3_ENV" | \
    sudo install -o root -g root -m 0644 /dev/stdin "\$ITEM3_DROPIN"
  sudo systemctl daemon-reload
  run_item3_doctor cold
  run_item3_doctor warm
  restore_item3_gpu
)

  3. require every README GPU line green; the block removes only /run state and
     never exposes temporary GPU stages to the queue worker
EOF
else
  cat <<EOF

Next:
  1. edit $ENV_FILE (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID)
  2. systemctl enable --now patina-scan-worker
  3. systemctl status patina-scan-worker
  4. journalctl -u patina-scan-worker -f
  (GPU worker? re-run: sudo /opt/patina/scan-pipeline-source/install.sh --gpu)
EOF
fi
