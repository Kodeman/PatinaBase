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
readonly SOURCE_URL=https://github.com/colmap/colmap.git
readonly CUDA_ROOT=/usr/local/cuda-11.8
readonly NVCC=/usr/local/cuda-11.8/bin/nvcc
readonly CC_11=/usr/bin/gcc-11
readonly CXX_11=/usr/bin/g++-11
readonly COLMAP_PREFIX=/opt/colmap/4.0.2
readonly COLMAP_LINK=/usr/local/bin/colmap
readonly EXPECTED_HEADER="COLMAP 4.0.2 -- Structure-from-Motion and Multi-View Stereo"
readonly EXPECTED_BUILD="(Commit d927f7e on 2026-03-18 with CUDA)"
readonly WORK_DIR="/var/tmp/patina-colmap-4.0.2-${EUID}"
readonly LOG_FILE="$WORK_DIR/install.log"
readonly LOCK_FILE="$WORK_DIR/install.lock"
readonly MIN_FREE_KIB=$((30 * 1024 * 1024))

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
)

ACKNOWLEDGE_NOBLE_EXPERIMENT=0
VERIFY_ONLY=0
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
    '  --verify-only  Verify the installed prefix/link without changing state.' \
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

verify_installed_contract() {
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
  printf '%s\n' "$EXPECTED_HEADER" "$EXPECTED_BUILD"
  for command in "${REQUIRED_COMMANDS[@]}"; do
    printf '[OK] command %s\n' "$command"
  done
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
  shift
done

[[ "$JOBS" =~ ^[1-9][0-9]*$ ]] || die "--jobs requires a positive integer"

if [ "$EUID" -eq 0 ]; then
  die "run this installer as a normal sudo-capable user, not root"
fi

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
[ -x "$NVCC" ] || die "missing executable $NVCC"
"$NVCC" --version | grep -Eq 'release 11\.8,' ||
  die "$NVCC is not CUDA 11.8"
command -v nvidia-smi >/dev/null 2>&1 || die "nvidia-smi not found"
command -v sudo >/dev/null 2>&1 || die "sudo not found"
command -v flock >/dev/null 2>&1 || die "flock not found"

if [ -L "$WORK_DIR" ]; then
  die "refusing symlinked build directory: $WORK_DIR"
fi
if [ -e "$WORK_DIR" ]; then
  [ -d "$WORK_DIR" ] || die "build path is not a directory: $WORK_DIR"
  [ "$(stat -c '%u' "$WORK_DIR")" = "$EUID" ] ||
    die "build directory is not owned by uid $EUID: $WORK_DIR"
  work_mode="$(stat -c '%a' "$WORK_DIR")"
  (( (8#$work_mode & 0022) == 0 )) ||
    die "build directory is group/world writable: $WORK_DIR"
else
  mkdir -m 0700 -- "$WORK_DIR"
fi
[ ! -L "$LOCK_FILE" ] || die "refusing symlinked lock file: $LOCK_FILE"
if [ -e "$LOCK_FILE" ]; then
  [ -f "$LOCK_FILE" ] || die "lock path is not a regular file: $LOCK_FILE"
  [ "$(stat -c '%u' "$LOCK_FILE")" = "$EUID" ] ||
    die "lock file is not owned by uid $EUID: $LOCK_FILE"
  [ "$(stat -c '%h' "$LOCK_FILE")" = 1 ] ||
    die "lock file has multiple hard links: $LOCK_FILE"
  lock_mode="$(stat -c '%a' "$LOCK_FILE")"
  (( (8#$lock_mode & 0022) == 0 )) ||
    die "lock file is group/world writable: $LOCK_FILE"
fi
exec 9>>"$LOCK_FILE"
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
[ "$available_kib" -ge "$MIN_FREE_KIB" ] ||
  die "$WORK_DIR needs at least 30 GiB free for a resumable COLMAP build"

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

phase "installed artifact verification"
verify_installed_contract
printf '\nCOLMAP %s installation complete.\nEvidence retained at %s\n' \
  "$COLMAP_VERSION" "$WORK_DIR"
