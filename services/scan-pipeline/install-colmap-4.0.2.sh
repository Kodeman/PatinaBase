#!/bin/bash -p
# Build the pinned DeskDev COLMAP pilot without changing the global CUDA
# selection. Run as a normal sudo-capable user, never as root.
set -Eeuo pipefail
umask 077
readonly INSTALL_SECURE_PATH=/usr/sbin:/usr/bin:/sbin:/bin
PATH="$INSTALL_SECURE_PATH"
export PATH
unset BASH_ENV ENV
CDPATH=
IFS=$' \t\n'

readonly COLMAP_VERSION=4.0.2
readonly EXPECTED_COMMIT=d927f7e518fc20afa33390712c4cc20d85b730b8
readonly EXPECTED_SOURCE_TREE=9c381aea43304df66df991183563b659c2f712fa
readonly EXPECTED_PYPROJECT_SHA256=60b1cedf70be21acc3b8e33455f4f0d482e380c1c9cab65f8598613695be5fc5
readonly EXPECTED_PYTHON_CMAKE_SHA256=d6881e9110f221cbb0e725d1ff837f0a573e9e310c83447ff3bfcf9bc1c0adaa
readonly SOURCE_DATE_EPOCH=1773829775
readonly SOURCE_URL=https://github.com/colmap/colmap.git
readonly CUDA_ROOT=/usr/local/cuda-11.8
readonly NVCC=/usr/local/cuda-11.8/bin/nvcc
readonly CC_11=/usr/bin/gcc-11
readonly CXX_11=/usr/bin/g++-11
readonly COLMAP_PREFIX=/opt/colmap/4.0.2
readonly COLMAP_LINK=/usr/local/bin/colmap
readonly PYCOLMAP_PYTHON=/usr/bin/python3
readonly PYCOLMAP_PYTHON_TAG=cp312-cp312
readonly PYCOLMAP_BUILD_TAG=1patinacu118sm75
readonly PYCOLMAP_ARTIFACT_PARENT=/opt/patina/scan-pipeline-artifacts
readonly PYCOLMAP_ARTIFACT_DIR=/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75
readonly PYCOLMAP_WHEEL_NAME=pycolmap-4.0.2-1patinacu118sm75-cp312-cp312-linux_x86_64.whl
readonly EXPECTED_HEADER="COLMAP 4.0.2 -- Structure-from-Motion and Multi-View Stereo"
readonly EXPECTED_BUILD="(Commit d927f7e on 2026-03-18 with CUDA)"
readonly DEFAULT_WORK_DIR="/var/tmp/patina-colmap-4.0.2-${EUID}"
readonly GLOBAL_LOCK_FILE="/var/tmp/patina-colmap-4.0.2-${EUID}.global.lock"
readonly MIN_FREE_KIB=$((30 * 1024 * 1024))
readonly RESUME_MIN_FREE_KIB=$((8 * 1024 * 1024))
readonly SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_PARENT="${SCRIPT_PATH%/*}"
if [ "$SCRIPT_PARENT" = "$SCRIPT_PATH" ]; then
  SCRIPT_PARENT=.
fi
readonly SCRIPT_PARENT
readonly SCRIPT_DIR="$(builtin cd -P -- "$SCRIPT_PARENT" && builtin pwd -P)"
readonly PATH_GUARD="$SCRIPT_DIR/install-path-guard.py"
readonly PYCOLMAP_BUILD_REQUIREMENTS="$SCRIPT_DIR/pycolmap-build-requirements.txt"
readonly PYCOLMAP_SMOKE="$SCRIPT_DIR/src/patina_scan_worker/pycolmap_cuda_smoke.py"

readonly REQUIRED_COMMANDS=(
  feature_extractor
  sequential_matcher
  exhaustive_matcher
  point_triangulator
  bundle_adjuster
  pose_prior_mapper
)

readonly APT_PACKAGES=(
  ca-certificates
  git
  cmake
  ninja-build
  build-essential
  gcc-11
  g++-11
  pkg-config
  libboost-program-options-dev
  libboost-graph-dev
  libboost-system-dev
  libeigen3-dev
  libopenimageio-dev
  openimageio-tools
  libmetis-dev
  libgoogle-glog-dev
  libsqlite3-dev
  libglew-dev
  libgl-dev
  libceres-dev
  libsuitesparse-dev
  libopenblas-openmp-dev
  python3-dev
  python3-venv
  binutils
  patchelf
  unzip
)

ACKNOWLEDGE_NOBLE_EXPERIMENT=0
VERIFY_ONLY=0
SHOW_HELP=0
CUSTOM_WORK_DIR=0
WORK_DIR="$DEFAULT_WORK_DIR"
JOBS=4

usage() {
  printf '%s\n' \
    'Usage: ./install-colmap-4.0.2.sh [options]' \
    '' \
    'Build and install the exact DeskDev COLMAP 4.0.2 CUDA pilot.' \
    'The script must run as a normal sudo-capable user.' \
    '' \
    'Options:' \
    '  --acknowledge-experimental-ubuntu-24.04' \
    '      Required for a build. CUDA 11.8 does not officially support Noble.' \
    '  --jobs N       Ninja parallelism (default: 4).' \
    '  --work-dir PATH' \
    '      Build/resume in PATH (must end in patina-colmap-4.0.2-<uid>).' \
    '      Parent must be canonical, operator-owned mode 0700; noexec is rejected.' \
    '  --verify-only  Verify native COLMAP + the PyCOLMAP CUDA artifact.' \
    '  -h, --help     Show this help.' \
    '' \
    "Resumable build state: $WORK_DIR" \
    "Append-only run log:   $LOG_FILE"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

phase() {
  printf '\n[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

verify_colmap_binary() {
  local executable="$1"
  local output first_line second_line command

  [ -x "$executable" ] || return 1
  output="$("$executable" -h 2>&1)" || return 1
  first_line="$(printf '%s\n' "$output" | sed -n '1p')"
  second_line="$(printf '%s\n' "$output" | sed -n '2p')"
  [ "$first_line" = "$EXPECTED_HEADER" ] || return 1
  [ "$second_line" = "$EXPECTED_BUILD" ] || return 1

  for command in "${REQUIRED_COMMANDS[@]}"; do
    printf '%s\n' "$output" | grep -Fxq "  $command" || return 1
    "$executable" "$command" -h >/dev/null 2>&1 || return 1
  done
}

verify_dynamic_links() {
  local executable="$1"
  local output

  output="$(ldd "$executable" 2>&1)" ||
    die "could not inspect shared libraries for $executable: $output"
  if printf '%s\n' "$output" | grep -F 'not found'; then
    die "$executable has unresolved shared libraries"
  fi
}

verify_root_owned_tree() {
  local root="$1"
  local bad_path

  [ -d "$root" ] || die "missing installed tree: $root"
  bad_path="$(
    find "$root" \( ! -user root -o ! -group root -o -perm /022 -o -perm /7000 \
      -o \( -type d ! -perm -0555 \) -o \( -type f ! -perm -0444 \) \) \
      -print -quit
  )"
  [ -z "$bad_path" ] ||
    die "installed COLMAP tree is not immutable root-owned content: $bad_path"
  [ -f "$root/bin/colmap" ] ||
    die "installed COLMAP command is not a regular file: $root/bin/colmap"
  [ "$(stat -c '%a' "$root/bin/colmap")" = 755 ] ||
    die "installed COLMAP command is not mode 0755: $root/bin/colmap"
}

verify_privileged_directory() {
  local directory="$1"
  local mode

  [ ! -L "$directory" ] || die "privileged directory is a symlink: $directory"
  [ -d "$directory" ] || die "missing privileged directory: $directory"
  [ "$(stat -c '%u:%g' "$directory")" = 0:0 ] ||
    die "privileged directory is not root-owned: $directory"
  mode="$(stat -c '%a' "$directory")"
  (( (8#$mode & 0022) == 0 )) ||
    die "privileged directory is group/world writable: $directory"
}

validate_pycolmap_artifact() {
  local anchor="$1"
  local uid="$2"
  local gid="$3"
  local artifact_dir="$4"

  [ -x "$PYCOLMAP_PYTHON" ] || die "missing executable $PYCOLMAP_PYTHON"
  [ -f "$PATH_GUARD" ] || die "missing artifact validator $PATH_GUARD"
  "$PYCOLMAP_PYTHON" -I -S "$PATH_GUARD" \
    --anchor "$anchor" \
    --trusted-uid "$uid" \
    --trusted-gid "$gid" \
    validate-pycolmap-artifact \
    --artifact-dir "$artifact_dir" \
    --expected-python-tag "$PYCOLMAP_PYTHON_TAG"
}

verify_pycolmap_python_abi() {
  local abi

  [ -x "$PYCOLMAP_PYTHON" ] || die "missing executable $PYCOLMAP_PYTHON"
  abi="$("$PYCOLMAP_PYTHON" -I -c \
    'import platform, struct, sys, sysconfig; v=f"cp{sys.version_info.major}{sys.version_info.minor}"; print("{}-{}:{}:{}:{}".format(v, v, sysconfig.get_config_var("SOABI"), platform.machine(), struct.calcsize("P")*8))')"
  [ "$abi" = "cp312-cp312:cpython-312-x86_64-linux-gnu:x86_64:64" ] ||
    die "$PYCOLMAP_PYTHON has unqualified ABI $abi"
}

validate_work_dir_argument() {
  if [ "$CUSTOM_WORK_DIR" -eq 1 ]; then
    [[ "$WORK_DIR" = /* ]] ||
      die "--work-dir must be an absolute path"
    [ "$WORK_DIR" != / ] ||
      die "dangerous work directory: refusing filesystem root"
    [ "${WORK_DIR##*/}" = "patina-colmap-4.0.2-${EUID}" ] ||
      die "dangerous work directory: custom leaf must be patina-colmap-4.0.2-${EUID}"
    case "$WORK_DIR" in
      *$'\n'*|*$'\r'*|*$'\t'*)
        die "dangerous work directory: control characters are not allowed"
        ;;
    esac
  fi
}

prepare_work_dir() {
  local parent parent_mode resolved mount_target mount_options work_mode

  if [ "$CUSTOM_WORK_DIR" -eq 1 ]; then
    parent="${WORK_DIR%/*}"
    [ -n "$parent" ] || parent=/
    [ ! -L "$parent" ] ||
      die "custom work-directory parent is a symlink: $parent"
    [ -d "$parent" ] ||
      die "precreate custom work-directory parent mode 0700: $parent"
    resolved="$(realpath -e -- "$parent")" ||
      die "cannot resolve custom work-directory parent: $parent"
    [ "$resolved" = "$parent" ] ||
      die "custom work-directory parent must be an absolute canonical path: $parent"
    [ "$(stat -c '%u' "$parent")" = "$EUID" ] ||
      die "custom work-directory parent is not owned by uid $EUID: $parent"
    parent_mode="$(stat -c '%a' "$parent")"
    [ "$parent_mode" = 700 ] ||
      die "custom work-directory parent must be mode 0700: $parent"
  fi

  if [ -L "$WORK_DIR" ]; then
    die "refusing symlinked build directory: $WORK_DIR"
  fi
  if [ -e "$WORK_DIR" ]; then
    [ -d "$WORK_DIR" ] || die "build path is not a directory: $WORK_DIR"
  else
    mkdir -m 0700 -- "$WORK_DIR" ||
      die "could not securely create build directory: $WORK_DIR"
  fi

  resolved="$(realpath -e -- "$WORK_DIR")" ||
    die "cannot resolve build directory: $WORK_DIR"
  [ "$resolved" = "$WORK_DIR" ] ||
    die "work directory must be an absolute canonical path without symlinks: $WORK_DIR"
  [ "$(stat -c '%u' "$WORK_DIR")" = "$EUID" ] ||
    die "build directory is not owned by uid $EUID: $WORK_DIR"
  work_mode="$(stat -c '%a' "$WORK_DIR")"
  (( (8#$work_mode & 0022) == 0 )) ||
    die "build directory is group/world writable: $WORK_DIR"

  mount_target="$(findmnt -n -o TARGET --target "$WORK_DIR")" ||
    die "cannot resolve filesystem mount for $WORK_DIR"
  [ "$mount_target" != "$WORK_DIR" ] ||
    die "work directory must be below the filesystem mount point: $WORK_DIR"
  mount_options="$(findmnt -n -o OPTIONS --target "$WORK_DIR")" ||
    die "cannot inspect filesystem options for $WORK_DIR"
  case ",$mount_options," in
    *,noexec,*)
      die "work-directory filesystem is mounted noexec: $WORK_DIR"
      ;;
  esac
}

validate_lock_file() {
  local lock_file="$1"
  local lock_name="$2"
  local lock_mode

  [ ! -L "$lock_file" ] || die "refusing symlinked $lock_name: $lock_file"
  if [ -e "$lock_file" ]; then
    [ -f "$lock_file" ] || die "$lock_name is not a regular file: $lock_file"
    [ "$(stat -c '%u' "$lock_file")" = "$EUID" ] ||
      die "$lock_name is not owned by uid $EUID: $lock_file"
    [ "$(stat -c '%h' "$lock_file")" = 1 ] ||
      die "$lock_name has multiple hard links: $lock_file"
    lock_mode="$(stat -c '%a' "$lock_file")"
    (( (8#$lock_mode & 0022) == 0 )) ||
      die "$lock_name is group/world writable: $lock_file"
  fi
}

verify_installed_contract() {
  verify_pycolmap_python_abi
  verify_privileged_directory /opt
  verify_privileged_directory /opt/colmap
  verify_privileged_directory /usr/local
  verify_privileged_directory /usr/local/bin
  verify_colmap_binary "$COLMAP_PREFIX/bin/colmap" ||
    die "$COLMAP_PREFIX already exists but failed exact verification"
  [ -L "$COLMAP_LINK" ] ||
    die "$COLMAP_LINK is not a symlink to the versioned install"
  [ "$(readlink -f -- "$COLMAP_LINK")" = "$COLMAP_PREFIX/bin/colmap" ] ||
    die "$COLMAP_LINK does not resolve to $COLMAP_PREFIX/bin/colmap"
  [ "$(stat -c '%U:%G' "$COLMAP_PREFIX/bin/colmap")" = root:root ] ||
    die "installed COLMAP binary is not root-owned"
  verify_root_owned_tree "$COLMAP_PREFIX"
  verify_dynamic_links "$COLMAP_PREFIX/bin/colmap"
  validate_pycolmap_artifact / 0 0 "$PYCOLMAP_ARTIFACT_DIR" >/dev/null ||
    die "$PYCOLMAP_ARTIFACT_DIR failed manifest/hash/ownership verification"
  printf '%s\n' "$EXPECTED_HEADER" "$EXPECTED_BUILD"
  for command in "${REQUIRED_COMMANDS[@]}"; do
    printf '[OK] command %s\n' "$command"
  done
  printf '[OK] PyCOLMAP 4.0.2 CUDA 11.8 sm_75 artifact\n'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --acknowledge-experimental-ubuntu-24.04)
      ACKNOWLEDGE_NOBLE_EXPERIMENT=1
      ;;
    --verify-only)
      VERIFY_ONLY=1
      ;;
    --jobs)
      [ "$#" -ge 2 ] || die "--jobs requires a positive integer"
      JOBS="$2"
      shift
      ;;
    --work-dir)
      [ "$#" -ge 2 ] || die "--work-dir requires an absolute path"
      WORK_DIR="$2"
      CUSTOM_WORK_DIR=1
      shift
      ;;
    -h|--help)
      SHOW_HELP=1
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
  shift
done

readonly WORK_DIR
readonly LOG_FILE="$WORK_DIR/install.log"
readonly LOCK_FILE="$WORK_DIR/install.lock"

[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || die "--jobs requires a positive integer"

if [ "$SHOW_HELP" -eq 1 ]; then
  usage
  exit 0
fi

if [ "$EUID" -eq 0 ]; then
  die "run this installer as a normal sudo-capable user, not root"
fi

validate_work_dir_argument

if [ "$VERIFY_ONLY" -eq 1 ]; then
  verify_installed_contract
  exit 0
fi

[ "$ACKNOWLEDGE_NOBLE_EXPERIMENT" -eq 1 ] || {
  usage >&2
  die "explicit Ubuntu 24.04 experimental acknowledgement is required"
}

# Required /etc/os-release contract: VERSION_ID="24.04".
grep -Eq '^VERSION_ID="?24\.04"?$' /etc/os-release ||
  die "this experimental installer is restricted to Ubuntu 24.04"
[ "$(dpkg --print-architecture)" = amd64 ] || die "amd64 host required"
[ -f "$PYCOLMAP_BUILD_REQUIREMENTS" ] ||
  die "missing $PYCOLMAP_BUILD_REQUIREMENTS"
[ -f "$PYCOLMAP_SMOKE" ] || die "missing $PYCOLMAP_SMOKE"
verify_pycolmap_python_abi
[ -x "$NVCC" ] || die "missing executable $NVCC"
"$NVCC" --version | grep -Eq 'release 11\.8,' ||
  die "$NVCC is not CUDA 11.8"
command -v nvidia-smi >/dev/null 2>&1 || die "nvidia-smi not found"
command -v sudo >/dev/null 2>&1 || die "sudo not found"
command -v flock >/dev/null 2>&1 || die "flock not found"
command -v realpath >/dev/null 2>&1 || die "realpath not found"
command -v findmnt >/dev/null 2>&1 || die "findmnt not found"

validate_lock_file "$GLOBAL_LOCK_FILE" "global installer lock"
exec 8>>"$GLOBAL_LOCK_FILE"
validate_lock_file "$GLOBAL_LOCK_FILE" "global installer lock"
flock -n 8 || die "another COLMAP installer is active for uid $EUID"

prepare_work_dir
validate_lock_file "$LOCK_FILE" "work-directory lock"
exec 9>>"$LOCK_FILE"
validate_lock_file "$LOCK_FILE" "work-directory lock"
flock -n 9 || die "another COLMAP installer is using $WORK_DIR"
[ ! -L "$LOG_FILE" ] || die "refusing symlinked log file: $LOG_FILE"
touch "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

on_exit() {
  local status="$?"
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    printf '\nBuild state and logs retained after failure:\n  %s\n  %s\n' \
      "$WORK_DIR" "$LOG_FILE" >&2
  fi
  exit "$status"
}
trap on_exit EXIT

available_kib="$(df -Pk "$WORK_DIR" | awk 'NR == 2 {print $4}')"
[[ "$available_kib" =~ ^[0-9]+$ ]] ||
  die "could not determine free space at $WORK_DIR"
required_free_kib="$MIN_FREE_KIB"
required_free_label="30 GiB"
if [ -x "$WORK_DIR/build/src/colmap/exe/colmap" ]; then
  required_free_kib="$RESUME_MIN_FREE_KIB"
  required_free_label="8 GiB for the retained native build + binding resume"
fi
[ "$available_kib" -ge "$required_free_kib" ] ||
  die "$WORK_DIR needs at least $required_free_label free for a resumable COLMAP build"

phase "host and package preflight"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
sudo -v
sudo apt-get update
for package in "${APT_PACKAGES[@]}"; do
  apt-cache show "$package" >/dev/null 2>&1 ||
    die "Ubuntu package unavailable: $package (ensure Noble universe is enabled)"
done
sudo apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}"
sudo install -d -o root -g root -m 0755 /usr/include/opencv4

[ -x "$CC_11" ] || die "missing $CC_11 after dependency install"
[ -x "$CXX_11" ] || die "missing $CXX_11 after dependency install"
"$CC_11" -dumpfullversion -dumpversion | grep -Eq '^11(\.|$)' ||
  die "$CC_11 is not GCC 11"
"$CXX_11" -dumpfullversion -dumpversion | grep -Eq '^11(\.|$)' ||
  die "$CXX_11 is not G++ 11"

phase "CUDA 11.8 / GCC 11 / sm_75 compile-and-run gate"
readonly PROBE_DIR="$WORK_DIR/cuda-probe"
readonly PROBE_SOURCE="$PROBE_DIR/probe.cu"
readonly PROBE_BINARY="$PROBE_DIR/probe"
mkdir -p -- "$PROBE_DIR"
printf '%s\n' \
  '#include <cuda_runtime.h>' \
  '#include <cstdio>' \
  '__global__ void increment(int* value) { *value += 1; }' \
  'int main() {' \
  '  int count = 0;' \
  '  int target = -1;' \
  '  cudaError_t status = cudaGetDeviceCount(&count);' \
  '  if (status != cudaSuccess) {' \
  '    std::fprintf(stderr, "cudaGetDeviceCount: %s\n", cudaGetErrorString(status));' \
  '    return 1;' \
  '  }' \
  '  for (int index = 0; index < count; ++index) {' \
  '    cudaDeviceProp properties{};' \
  '    status = cudaGetDeviceProperties(&properties, index);' \
  '    if (status != cudaSuccess) return 2;' \
  '    std::printf("gpu[%d]=%s cc=%d.%d\n", index, properties.name,' \
  '                properties.major, properties.minor);' \
  '    if (properties.major == 7 && properties.minor == 5) target = index;' \
  '  }' \
  '  if (target < 0) {' \
  '    std::fprintf(stderr, "no visible sm_75 device\n");' \
  '    return 3;' \
  '  }' \
  '  status = cudaSetDevice(target);' \
  '  if (status != cudaSuccess) return 4;' \
  '  int value = 41;' \
  '  int* device_value = nullptr;' \
  '  status = cudaMalloc(reinterpret_cast<void**>(&device_value), sizeof(int));' \
  '  if (status != cudaSuccess) return 5;' \
  '  status = cudaMemcpy(device_value, &value, sizeof(int), cudaMemcpyHostToDevice);' \
  '  if (status != cudaSuccess) return 6;' \
  '  increment<<<1, 1>>>(device_value);' \
  '  status = cudaGetLastError();' \
  '  if (status != cudaSuccess) return 7;' \
  '  status = cudaDeviceSynchronize();' \
  '  if (status != cudaSuccess) return 8;' \
  '  status = cudaMemcpy(&value, device_value, sizeof(int), cudaMemcpyDeviceToHost);' \
  '  if (status != cudaSuccess) return 9;' \
  '  status = cudaFree(device_value);' \
  '  if (status != cudaSuccess) return 10;' \
  '  if (value != 42) return 11;' \
  '  std::printf("sm_75 CUDA kernel result=%d\n", value);' \
  '  return 0;' \
  '}' > "$PROBE_SOURCE"
"$NVCC" -ccbin "$CXX_11" -std=c++17 -arch=sm_75 \
  "$PROBE_SOURCE" -o "$PROBE_BINARY"
"$PROBE_BINARY"

phase "fetch and verify exact COLMAP source"
readonly SOURCE_DIR="$WORK_DIR/source"
readonly BUILD_DIR="$WORK_DIR/build"
if [ ! -e "$SOURCE_DIR" ]; then
  mkdir -- "$SOURCE_DIR"
  git -C "$SOURCE_DIR" init
  git -C "$SOURCE_DIR" remote add origin "$SOURCE_URL"
elif [ ! -d "$SOURCE_DIR/.git" ]; then
  die "existing source path is not a Git repository: $SOURCE_DIR"
fi
[ "$(git -C "$SOURCE_DIR" remote get-url origin)" = "$SOURCE_URL" ] ||
  die "unexpected COLMAP source remote in $SOURCE_DIR"
git -C "$SOURCE_DIR" diff --quiet || die "tracked COLMAP source is modified"
git -C "$SOURCE_DIR" diff --cached --quiet || die "COLMAP index is modified"
git -C "$SOURCE_DIR" fetch --depth=1 origin \
  refs/tags/4.0.2:refs/tags/4.0.2
[ "$(git -C "$SOURCE_DIR" rev-parse 'refs/tags/4.0.2^{commit}')" = "$EXPECTED_COMMIT" ] ||
  die "COLMAP tag does not peel to $EXPECTED_COMMIT"
git -C "$SOURCE_DIR" -c advice.detachedHead=false checkout --detach "$EXPECTED_COMMIT"
[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$EXPECTED_COMMIT" ] ||
  die "COLMAP tag did not resolve to $EXPECTED_COMMIT"
[ "$(git -C "$SOURCE_DIR" rev-parse 'HEAD^{tree}')" = "$EXPECTED_SOURCE_TREE" ] ||
  die "COLMAP source tree does not match $EXPECTED_SOURCE_TREE"
[ "$(sha256sum "$SOURCE_DIR/pyproject.toml" | awk '{print $1}')" = "$EXPECTED_PYPROJECT_SHA256" ] ||
  die "COLMAP pyproject.toml hash mismatch"
[ "$(sha256sum "$SOURCE_DIR/python/CMakeLists.txt" | awk '{print $1}')" = "$EXPECTED_PYTHON_CMAKE_SHA256" ] ||
  die "COLMAP python/CMakeLists.txt hash mismatch"
[ -z "$(git -C "$SOURCE_DIR" status --porcelain --untracked-files=all)" ] ||
  die "COLMAP source checkout contains tracked or untracked changes"

phase "configure COLMAP $COLMAP_VERSION (reuses $BUILD_DIR when present)"
export PATH="$CUDA_ROOT/bin:$INSTALL_SECURE_PATH"
export CC="$CC_11"
export CXX="$CXX_11"
export CUDACXX="$NVCC"
export CUDAHOSTCXX="$CXX_11"

cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" -GNinja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$COLMAP_PREFIX" \
  -DCMAKE_C_COMPILER=/usr/bin/gcc-11 \
  -DCMAKE_CXX_COMPILER=/usr/bin/g++-11 \
  -DCMAKE_CUDA_COMPILER=/usr/local/cuda-11.8/bin/nvcc \
  -DCMAKE_CUDA_HOST_COMPILER=/usr/bin/g++-11 \
  -DCUDAToolkit_ROOT=/usr/local/cuda-11.8 \
  -DCMAKE_CUDA_ARCHITECTURES=75 \
  -DCMAKE_INSTALL_RPATH=/usr/local/cuda-11.8/lib64 \
  -DGIT_COMMIT_ID=d927f7e \
  -DGIT_COMMIT_DATE=2026-03-18 \
  -DBLA_VENDOR=OpenBLAS \
  -DCUDA_ENABLED=ON \
  -DGUI_ENABLED=OFF \
  -DOPENGL_ENABLED=OFF \
  -DONNX_ENABLED=OFF \
  -DCGAL_ENABLED=OFF \
  -DLSD_ENABLED=OFF \
  -DDOWNLOAD_ENABLED=OFF \
  -DTESTS_ENABLED=OFF \
  -DBENCHMARK_ENABLED=OFF \
  -DUNINSTALL_ENABLED=OFF \
  -DCCACHE_ENABLED=OFF \
  -DIPO_ENABLED=OFF \
  -DFETCH_POSELIB=ON \
  -DFETCH_FAISS=ON \
  -DFETCH_ONNX=OFF \
  -DBUILD_SHARED_LIBS=OFF

grep -Eq '^CMAKE_CUDA_COMPILER:[^=]+=/usr/local/cuda-11\.8/bin/nvcc$' \
  "$BUILD_DIR/CMakeCache.txt" || die "CMake selected the wrong CUDA compiler"
grep -Eq '^CMAKE_CUDA_HOST_COMPILER:[^=]+=/usr/bin/g\+\+-11$' \
  "$BUILD_DIR/CMakeCache.txt" || die "CMake selected the wrong CUDA host compiler"
grep -Eq '^CMAKE_CUDA_ARCHITECTURES:[^=]+=75$' "$BUILD_DIR/CMakeCache.txt" ||
  die "CMake did not retain sm_75"
grep -Fxq 'CUDA_ENABLED:BOOL=ON' "$BUILD_DIR/CMakeCache.txt" ||
  die "COLMAP silently disabled CUDA"

phase "build COLMAP with $JOBS parallel jobs"
cmake --build "$BUILD_DIR" --parallel "$JOBS"
readonly BUILT_COLMAP="$BUILD_DIR/src/colmap/exe/colmap"
verify_dynamic_links "$BUILT_COLMAP"
verify_colmap_binary "$BUILT_COLMAP" ||
  die "built COLMAP failed exact version/CUDA/command verification"

phase "install immutable versioned prefix"
verify_privileged_directory /opt
if [ -e /opt/colmap ] || [ -L /opt/colmap ]; then
  verify_privileged_directory /opt/colmap
fi
if sudo test -e "$COLMAP_PREFIX" || sudo test -L "$COLMAP_PREFIX"; then
  verify_colmap_binary "$COLMAP_PREFIX/bin/colmap" ||
    die "$COLMAP_PREFIX already exists but failed exact verification"
  verify_root_owned_tree "$COLMAP_PREFIX"
  printf 'Reusing previously verified %s\n' "$COLMAP_PREFIX"
else
  readonly INSTALL_STAGE_ROOT="$(mktemp -d -- "$WORK_DIR/install-root.XXXXXXXXXX")"
  readonly STAGED_PREFIX="$INSTALL_STAGE_ROOT$COLMAP_PREFIX"
  readonly ROOT_CANDIDATE="/opt/colmap/.4.0.2.candidate-${EUID}"

  # CMake install scripts remain unprivileged. Root only copies a checked tree;
  # it never evaluates user-owned CMake or executes the staged binary.
  (umask 022; DESTDIR="$INSTALL_STAGE_ROOT" cmake --install "$BUILD_DIR")
  verify_colmap_binary "$STAGED_PREFIX/bin/colmap" ||
    die "staged COLMAP failed exact version/CUDA/command verification"
  [ -z "$(find "$STAGED_PREFIX" -type l -print -quit)" ] ||
    die "staged COLMAP unexpectedly contains a symlink"
  [ -z "$(find "$STAGED_PREFIX" ! -type d ! -type f -print -quit)" ] ||
    die "staged COLMAP unexpectedly contains a non-file artifact"

  if [ ! -d /opt/colmap ]; then
    sudo install -d -o root -g root -m 0755 /opt/colmap
  fi
  verify_privileged_directory /opt/colmap
  if sudo test -e "$ROOT_CANDIDATE" || sudo test -L "$ROOT_CANDIDATE"; then
    die "incomplete root candidate retained at $ROOT_CANDIDATE; inspect it before retrying"
  fi
  sudo install -d -o root -g root -m 0755 "$ROOT_CANDIDATE"
  sudo cp -a --no-preserve=ownership -- "$STAGED_PREFIX/." "$ROOT_CANDIDATE/"
  sudo chown -R root:root "$ROOT_CANDIDATE"
  sudo find "$ROOT_CANDIDATE" -type d -exec chmod 0755 {} +
  sudo find "$ROOT_CANDIDATE" -type f -perm /111 -exec chmod 0755 {} +
  sudo find "$ROOT_CANDIDATE" -type f ! -perm /111 -exec chmod 0644 {} +
  verify_colmap_binary "$ROOT_CANDIDATE/bin/colmap" ||
    die "root candidate failed exact version/CUDA/command verification"
  verify_root_owned_tree "$ROOT_CANDIDATE"
  if sudo test -e "$COLMAP_PREFIX" || sudo test -L "$COLMAP_PREFIX"; then
    die "$COLMAP_PREFIX appeared while the candidate was being installed"
  fi
  sudo mv -T -- "$ROOT_CANDIDATE" "$COLMAP_PREFIX"
fi

phase "expose guarded /usr/local/bin command"
verify_privileged_directory /usr/local
if [ ! -e /usr/local/bin ] && [ ! -L /usr/local/bin ]; then
  sudo install -d -o root -g root -m 0755 /usr/local/bin
fi
verify_privileged_directory /usr/local/bin
if [ -L "$COLMAP_LINK" ]; then
  [ "$(readlink -f -- "$COLMAP_LINK")" = "$COLMAP_PREFIX/bin/colmap" ] ||
    die "refusing to replace existing $COLMAP_LINK"
elif [ -e "$COLMAP_LINK" ]; then
  die "refusing to replace existing $COLMAP_LINK"
else
  sudo ln -s -- "$COLMAP_PREFIX/bin/colmap" "$COLMAP_LINK"
fi

phase "build and qualify PyCOLMAP $COLMAP_VERSION CUDA artifact"
if [ -e "$PYCOLMAP_ARTIFACT_DIR" ] || [ -L "$PYCOLMAP_ARTIFACT_DIR" ]; then
  validate_pycolmap_artifact / 0 0 "$PYCOLMAP_ARTIFACT_DIR" >/dev/null ||
    die "existing $PYCOLMAP_ARTIFACT_DIR is invalid; refusing to replace it"
  printf 'Reusing previously verified %s\n' "$PYCOLMAP_ARTIFACT_DIR"
else
  readonly PYCOLMAP_BUILD_DIR="$WORK_DIR/pycolmap-build"
  PYCOLMAP_BUILD_VENV="$(mktemp -d -- "$WORK_DIR/pycolmap-build-venv.XXXXXXXXXX")" ||
    die "could not create a fresh PyCOLMAP build venv"
  readonly PYCOLMAP_BUILD_VENV
  "$PYCOLMAP_PYTHON" -I -m venv "$PYCOLMAP_BUILD_VENV"
  readonly PYCOLMAP_BUILD_HOME="$WORK_DIR/pycolmap-build-home"
  readonly PYCOLMAP_BUILD_TMP="$WORK_DIR/pycolmap-build-tmp"
  mkdir -p -- "$PYCOLMAP_BUILD_HOME" "$PYCOLMAP_BUILD_TMP"

  /usr/bin/env -i \
    HOME="$PYCOLMAP_BUILD_HOME" TMPDIR="$PYCOLMAP_BUILD_TMP" \
    PATH="$PYCOLMAP_BUILD_VENV/bin:$CUDA_ROOT/bin:$INSTALL_SECURE_PATH" \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC PIP_CONFIG_FILE=/dev/null \
    "$PYCOLMAP_BUILD_VENV/bin/python" -I -m pip \
      --isolated --disable-pip-version-check install \
      --no-cache-dir --only-binary=:all: --require-hashes \
      -r "$PYCOLMAP_BUILD_REQUIREMENTS"

  readonly WHEEL_OUTPUT_DIR="$(mktemp -d -- "$WORK_DIR/pycolmap-wheel.XXXXXXXXXX")"
  readonly PYCOLMAP_CMAKE_ARGS="-Dcolmap_DIR=$COLMAP_PREFIX/share/colmap -DCMAKE_PREFIX_PATH=$COLMAP_PREFIX -DCMAKE_C_COMPILER=$CC_11 -DCMAKE_CXX_COMPILER=$CXX_11 -DCMAKE_CUDA_COMPILER=$NVCC -DCMAKE_CUDA_HOST_COMPILER=$CXX_11 -DCUDAToolkit_ROOT=$CUDA_ROOT -DCMAKE_CUDA_ARCHITECTURES=75 -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -DCMAKE_BUILD_RPATH=$CUDA_ROOT/lib64 -DCMAKE_INSTALL_RPATH=$CUDA_ROOT/lib64 -DCMAKE_INSTALL_RPATH_USE_LINK_PATH=FALSE -DGENERATE_STUBS=OFF -DCCACHE_ENABLED=OFF"
  /usr/bin/env -i \
    HOME="$PYCOLMAP_BUILD_HOME" TMPDIR="$PYCOLMAP_BUILD_TMP" \
    PATH="$PYCOLMAP_BUILD_VENV/bin:$CUDA_ROOT/bin:$INSTALL_SECURE_PATH" \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC PIP_CONFIG_FILE=/dev/null \
    SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" PYTHONHASHSEED=0 \
    CC="$CC_11" CXX="$CXX_11" CUDACXX="$NVCC" CUDAHOSTCXX="$CXX_11" \
    CUDA_HOME="$CUDA_ROOT" LD_LIBRARY_PATH="$CUDA_ROOT/lib64" \
    CMAKE_GENERATOR=Ninja CMAKE_BUILD_PARALLEL_LEVEL="$JOBS" \
    SKBUILD_BUILD_DIR="$PYCOLMAP_BUILD_DIR" CMAKE_ARGS="$PYCOLMAP_CMAKE_ARGS" \
    "$PYCOLMAP_BUILD_VENV/bin/python" -I -m pip \
      --isolated --disable-pip-version-check wheel \
      --no-cache-dir --no-build-isolation --no-deps \
      --config-settings="wheel.build-tag=$PYCOLMAP_BUILD_TAG" \
      --wheel-dir "$WHEEL_OUTPUT_DIR" "$SOURCE_DIR"

  readonly BUILT_PYCOLMAP_WHEEL="$WHEEL_OUTPUT_DIR/$PYCOLMAP_WHEEL_NAME"
  [ -f "$BUILT_PYCOLMAP_WHEEL" ] ||
    die "PyCOLMAP build did not produce exact wheel $PYCOLMAP_WHEEL_NAME"
  [ "$(find "$WHEEL_OUTPUT_DIR" -maxdepth 1 -type f -name '*.whl' | wc -l)" -eq 1 ] ||
    die "PyCOLMAP build produced an unexpected wheel set"
  unzip -t "$BUILT_PYCOLMAP_WHEEL" >/dev/null || die "built PyCOLMAP wheel is corrupt"
  QUALIFIED_WHEEL_SHA256="$(sha256sum "$BUILT_PYCOLMAP_WHEEL" | awk '{print $1}')" ||
    die "could not hash the built PyCOLMAP wheel"
  [[ "$QUALIFIED_WHEEL_SHA256" =~ ^[0-9a-f]{64}$ ]] ||
    die "built PyCOLMAP wheel SHA-256 is invalid"
  readonly QUALIFIED_WHEEL_SHA256
  readonly QUALIFIED_WHEEL_REQUIREMENT="pycolmap @ file://$BUILT_PYCOLMAP_WHEEL#sha256=$QUALIFIED_WHEEL_SHA256"
  grep -Eq '^CMAKE_CUDA_COMPILER:[^=]+=/usr/local/cuda-11\.8/bin/nvcc$' \
    "$PYCOLMAP_BUILD_DIR/CMakeCache.txt" ||
    die "PyCOLMAP CMake selected the wrong CUDA compiler"
  grep -Eq '^CMAKE_CUDA_ARCHITECTURES:[^=]+=75$' \
    "$PYCOLMAP_BUILD_DIR/CMakeCache.txt" ||
    die "PyCOLMAP CMake did not retain sm_75"
  grep -Fxq 'CMAKE_INSTALL_RPATH_USE_LINK_PATH:BOOL=FALSE' \
    "$PYCOLMAP_BUILD_DIR/CMakeCache.txt" ||
    die "PyCOLMAP CMake enabled implicit link-path RPATHs"
  grep -Fq 'COLMAP_CUDA_ENABLED' "$PYCOLMAP_BUILD_DIR/compile_commands.json" ||
    die "PyCOLMAP compile commands do not enable COLMAP CUDA"

  /usr/bin/env -i \
    HOME="$PYCOLMAP_BUILD_HOME" TMPDIR="$PYCOLMAP_BUILD_TMP" \
    PATH="$PYCOLMAP_BUILD_VENV/bin:$CUDA_ROOT/bin:$INSTALL_SECURE_PATH" \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC PIP_CONFIG_FILE=/dev/null \
    "$PYCOLMAP_BUILD_VENV/bin/python" -I -m pip \
      --isolated --disable-pip-version-check install \
      --no-index --no-deps --no-cache-dir --force-reinstall \
      "$QUALIFIED_WHEEL_REQUIREMENT"
  PYCOLMAP_EXTENSION="$(
    "$PYCOLMAP_BUILD_VENV/bin/python" -I -c \
      'import pycolmap._core as core; print(core.__file__)'
  )" || die "could not locate installed PyCOLMAP extension"
  readonly PYCOLMAP_EXTENSION
  [ -f "$PYCOLMAP_EXTENSION" ] || die "installed PyCOLMAP extension is missing"
  extension_links="$(ldd "$PYCOLMAP_EXTENSION" 2>&1)" ||
    die "ldd failed for $PYCOLMAP_EXTENSION: $extension_links"
  if printf '%s\n' "$extension_links" | grep -F 'not found'; then
    die "PyCOLMAP extension has unresolved shared libraries"
  fi
  if printf '%s\n' "$extension_links" | grep -E \
    "${WORK_DIR//\//\\/}|cuda-12|lib(cuda|cudart)[^[:space:]]*\\.so\\.12"; then
    die "PyCOLMAP extension links a build path or CUDA 12"
  fi
  extension_dynamic="$(readelf -d "$PYCOLMAP_EXTENSION" 2>&1)" ||
    die "readelf failed for $PYCOLMAP_EXTENSION: $extension_dynamic"
  if printf '%s\n' "$extension_dynamic" | grep -E \
    "${WORK_DIR//\//\\/}|cuda-12|lib(cuda|cudart)[^[:space:]]*\\.so\\.12"; then
    die "PyCOLMAP extension embeds a build path or CUDA 12"
  fi
  extension_rpath="$(patchelf --print-rpath "$PYCOLMAP_EXTENSION")" ||
    die "could not inspect PyCOLMAP extension RPATH"
  case ":$extension_rpath:" in
    *":$CUDA_ROOT/lib64:"*) ;;
    *) die "PyCOLMAP extension RPATH omits $CUDA_ROOT/lib64" ;;
  esac

  readonly PYCOLMAP_SMOKE_HOME="$WORK_DIR/pycolmap-smoke-home"
  mkdir -p -- "$PYCOLMAP_SMOKE_HOME"
  PYCOLMAP_SMOKE_JSON="$(
    /usr/bin/timeout 90 /usr/bin/env -i \
      HOME="$PYCOLMAP_SMOKE_HOME" \
      PATH="$PYCOLMAP_BUILD_VENV/bin:$CUDA_ROOT/bin:$INSTALL_SECURE_PATH" \
      CUDA_HOME="$CUDA_ROOT" \
      LD_LIBRARY_PATH="$CUDA_ROOT/lib64" \
      "$PYCOLMAP_BUILD_VENV/bin/python" -I "$PYCOLMAP_SMOKE" \
        --expected-prefix "$PYCOLMAP_BUILD_VENV"
  )" || die "bounded PyCOLMAP CUDA SIFT qualification failed"
  readonly PYCOLMAP_SMOKE_JSON
  printf '%s\n' "$PYCOLMAP_SMOKE_JSON"
  [ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$EXPECTED_COMMIT" ] ||
    die "COLMAP source HEAD changed during PyCOLMAP build"
  [ "$(git -C "$SOURCE_DIR" rev-parse 'HEAD^{tree}')" = "$EXPECTED_SOURCE_TREE" ] ||
    die "COLMAP source tree changed during PyCOLMAP build"
  [ -z "$(git -C "$SOURCE_DIR" status --porcelain --untracked-files=all)" ] ||
    die "COLMAP source was mutated by the PyCOLMAP build backend"

  readonly ARTIFACT_CANDIDATE="$(mktemp -d -- "$WORK_DIR/pycolmap-artifact.XXXXXXXXXX")"
  install -m 0600 "$BUILT_PYCOLMAP_WHEEL" \
    "$ARTIFACT_CANDIDATE/$PYCOLMAP_WHEEL_NAME"
  "$PYCOLMAP_PYTHON" -I -S - \
    "$ARTIFACT_CANDIDATE/$PYCOLMAP_WHEEL_NAME" \
    "$ARTIFACT_CANDIDATE/artifact.json" \
    "$PYCOLMAP_SMOKE_JSON" "$QUALIFIED_WHEEL_SHA256" <<'PY'
import hashlib
import json
import os
import sys

wheel, destination, smoke_json, expected_digest = sys.argv[1:]
with open(wheel, "rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
if digest != expected_digest:
    raise SystemExit("qualified PyCOLMAP wheel changed before artifact staging")
smoke = json.loads(smoke_json)
manifest = {
    "artifact": "pycolmap-4.0.2-cuda118-sm75",
    "colmapBuild": smoke["colmap_build"],
    "cudaArchitecture": "75",
    "cudaDeviceCount": smoke["cuda_devices"],
    "cudaVersion": "11.8",
    "gpuSiftKeypoints": smoke["keypoints"],
    "hasCuda": smoke["has_cuda"],
    "pythonTag": "cp312-cp312",
    "schemaVersion": 1,
    "sourceCmakeSha256": "d6881e9110f221cbb0e725d1ff837f0a573e9e310c83447ff3bfcf9bc1c0adaa",
    "sourceCommit": "d927f7e518fc20afa33390712c4cc20d85b730b8",
    "sourcePyprojectSha256": "60b1cedf70be21acc3b8e33455f4f0d482e380c1c9cab65f8598613695be5fc5",
    "sourceTree": "9c381aea43304df66df991183563b659c2f712fa",
    "wheelFile": os.path.basename(wheel),
    "wheelSha256": digest,
    "wheelSizeBytes": os.stat(wheel).st_size,
}
with open(destination, "x", encoding="utf-8", newline="\n") as stream:
    stream.write(json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n")
PY
  validate_pycolmap_artifact "$WORK_DIR" "$EUID" "$(id -g)" \
    "$ARTIFACT_CANDIDATE" >/dev/null ||
    die "operator PyCOLMAP artifact candidate failed verification"
  [ "$(sha256sum "$ARTIFACT_CANDIDATE/$PYCOLMAP_WHEEL_NAME" | awk '{print $1}')" = "$QUALIFIED_WHEEL_SHA256" ] ||
    die "artifact candidate wheel differs from the qualified wheel"
  QUALIFIED_MANIFEST_SHA256="$(sha256sum "$ARTIFACT_CANDIDATE/artifact.json" | awk '{print $1}')" ||
    die "could not hash the validated PyCOLMAP manifest"
  readonly QUALIFIED_MANIFEST_SHA256

  verify_privileged_directory /opt
  if [ ! -e /opt/patina ] && [ ! -L /opt/patina ]; then
    sudo install -d -o root -g root -m 0755 /opt/patina
  fi
  verify_privileged_directory /opt/patina
  if [ ! -e "$PYCOLMAP_ARTIFACT_PARENT" ] && [ ! -L "$PYCOLMAP_ARTIFACT_PARENT" ]; then
    sudo install -d -o root -g root -m 0755 "$PYCOLMAP_ARTIFACT_PARENT"
  fi
  verify_privileged_directory "$PYCOLMAP_ARTIFACT_PARENT"
  readonly ROOT_ARTIFACT_CANDIDATE="$PYCOLMAP_ARTIFACT_PARENT/.pycolmap-4.0.2-candidate-${EUID}"
  if sudo test -e "$ROOT_ARTIFACT_CANDIDATE" || sudo test -L "$ROOT_ARTIFACT_CANDIDATE"; then
    die "incomplete root artifact candidate retained at $ROOT_ARTIFACT_CANDIDATE"
  fi
  sudo install -d -o root -g root -m 0755 "$ROOT_ARTIFACT_CANDIDATE"
  sudo install -o root -g root -m 0644 \
    "$ARTIFACT_CANDIDATE/artifact.json" \
    "$ROOT_ARTIFACT_CANDIDATE/artifact.json"
  sudo install -o root -g root -m 0644 \
    "$ARTIFACT_CANDIDATE/$PYCOLMAP_WHEEL_NAME" \
    "$ROOT_ARTIFACT_CANDIDATE/$PYCOLMAP_WHEEL_NAME"
  validate_pycolmap_artifact / 0 0 "$ROOT_ARTIFACT_CANDIDATE" >/dev/null ||
    die "root PyCOLMAP artifact candidate failed verification"
  [ "$(sha256sum "$ROOT_ARTIFACT_CANDIDATE/$PYCOLMAP_WHEEL_NAME" | awk '{print $1}')" = "$QUALIFIED_WHEEL_SHA256" ] ||
    die "root artifact wheel differs from the qualified wheel"
  [ "$(sha256sum "$ROOT_ARTIFACT_CANDIDATE/artifact.json" | awk '{print $1}')" = "$QUALIFIED_MANIFEST_SHA256" ] ||
    die "root artifact manifest differs from the validated candidate"
  if sudo test -e "$PYCOLMAP_ARTIFACT_DIR" || sudo test -L "$PYCOLMAP_ARTIFACT_DIR"; then
    die "$PYCOLMAP_ARTIFACT_DIR appeared while publishing the candidate"
  fi
  sudo mv -T -- "$ROOT_ARTIFACT_CANDIDATE" "$PYCOLMAP_ARTIFACT_DIR"
fi

phase "installed artifact verification"
verify_installed_contract
printf '\nCOLMAP %s installation complete.\nEvidence retained at %s\n' \
  "$COLMAP_VERSION" "$WORK_DIR"
