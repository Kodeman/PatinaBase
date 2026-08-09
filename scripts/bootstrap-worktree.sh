#!/usr/bin/env bash
set -euo pipefail

REFRESH_ENV=0
SKIP_INSTALL=0
GENERATE_PRISMA=0

usage() {
  printf '%s\n' 'Usage: scripts/bootstrap-worktree.sh [--refresh-env] [--skip-install] [--generate-prisma]'
  printf '%s\n' 'Copies the localhost-only environment profile, validates tool versions, and installs dependencies.'
}

for arg in "$@"; do
  case "$arg" in
    --refresh-env) REFRESH_ENV=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --generate-prisma) GENERATE_PRISMA=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'bootstrap-worktree: unknown argument: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)"
GIT_DIR="$(cd "$REPO_ROOT" && git rev-parse --git-dir)"
GIT_COMMON_DIR="$(cd "$REPO_ROOT" && git rev-parse --git-common-dir)"

if [[ "$GIT_DIR" == "$GIT_COMMON_DIR" ]]; then
  printf '%s\n' 'bootstrap-worktree: refusing to bootstrap the canonical checkout; use a Herdr linked worktree' >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -Fxq "worktree $REPO_ROOT"; then
  printf '%s\n' 'bootstrap-worktree: checkout is not registered with Git' >&2
  exit 1
fi

LOCAL_ENV_DIR="${PATINA_LOCAL_ENV_DIR:-$HOME/.config/patina/env/local}"
MANIFEST="$REPO_ROOT/.worktreeinclude"

if [[ ! -f "$MANIFEST" ]]; then
  printf '%s\n' 'bootstrap-worktree: .worktreeinclude is missing' >&2
  exit 1
fi

copied=0
while IFS= read -r relative_path || [[ -n "$relative_path" ]]; do
  case "$relative_path" in ''|'#'*) continue ;; esac
  source_path="$LOCAL_ENV_DIR/$relative_path"
  destination_path="$REPO_ROOT/$relative_path"
  if [[ ! -f "$source_path" ]]; then
    printf 'bootstrap-worktree: profile file absent, skipped: %s\n' "$relative_path"
    continue
  fi
  if grep -Eq '(https?://[^[:space:]]*\.supabase\.co|DATABASE_URL=[^[:space:]]*@[^/:]*(supabase\.co|pooler\.supabase\.com))' "$source_path"; then
    printf 'bootstrap-worktree: refusing cloud-pointed profile file: %s\n' "$relative_path" >&2
    exit 1
  fi
  if grep -Eq '^DATABASE_URL=' "$source_path" && ! grep -Eq '^DATABASE_URL=.*@(127\.0\.0\.1|localhost)(:|/)' "$source_path"; then
    printf 'bootstrap-worktree: refusing non-local database profile file: %s\n' "$relative_path" >&2
    exit 1
  fi
  if [[ -e "$destination_path" && "$REFRESH_ENV" -ne 1 ]]; then
    printf 'bootstrap-worktree: destination exists, kept: %s\n' "$relative_path"
    continue
  fi
  mkdir -p "$(dirname "$destination_path")"
  cp "$source_path" "$destination_path"
  chmod 600 "$destination_path"
  copied=$((copied + 1))
done < "$MANIFEST"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" -lt 20 ]]; then
  printf 'bootstrap-worktree: Node 20+ required; found %s\n' "$(node --version)" >&2
  exit 1
fi

pnpm_version="$(pnpm --version)"
if [[ "$pnpm_version" != "9.0.0" ]]; then
  printf 'bootstrap-worktree: pnpm 9.0.0 required; found %s\n' "$pnpm_version" >&2
  exit 1
fi

printf 'bootstrap-worktree: environment files copied: %d\n' "$copied"
if [[ "$SKIP_INSTALL" -eq 1 ]]; then
  printf '%s\n' 'bootstrap-worktree: install skipped by request'
  exit 0
fi

cd "$REPO_ROOT"
pnpm install --frozen-lockfile --prefer-offline
if [[ "$GENERATE_PRISMA" -eq 1 ]]; then
  pnpm prisma:generate
fi
printf '%s\n' 'bootstrap-worktree: complete; shared runtime services were not started'
