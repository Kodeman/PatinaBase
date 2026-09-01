#!/usr/bin/env bash
#
# repo-gc.sh — safe repo garbage collector for the patina-merged monorepo.
#
# Codifies the manual sweep we've been doing by hand: retire stale agent
# git worktrees (see .agents/skills/patina-parallel-work) and clear
# rebuildable build-artifact directories in the main checkout. Defaults to
# a DRY RUN — nothing is removed, branches are never touched, and node
# processes currently using an artifact dir make that dir untouchable
# regardless of mode.
#
# Usage:
#   scripts/repo-gc.sh                        # dry run — report only
#   scripts/repo-gc.sh --apply                # actually remove what's reported
#   scripts/repo-gc.sh --ignore-generated-dirt   # see below
#   scripts/repo-gc.sh --help
#
# Section 1 — worktree sweep:
#   `git worktree list --porcelain` is parsed for every LINKED worktree
#   (the main checkout is always skipped, never a candidate). A worktree is
#   "removable" when:
#     clean  = `git status --porcelain` is empty in the worktree
#     merged = the worktree's HEAD is an ancestor of local `main`
#     pushed = its branch exists at refs/remotes/origin/<branch> AND the
#              worktree's HEAD is an ancestor of that remote branch
#   removable := clean && (merged || pushed). Anything else is kept and
#   printed with a reason: dirty N files / unpushed-unmerged / detached-unmerged.
#
#   --ignore-generated-dirt treats a worktree as clean when its ONLY dirty
#   paths match `*/src/generated/prisma-client/*` — historical worktrees
#   predate untracking these generated files. Off by default: opt in only
#   when you know that's the sole reason a worktree looks dirty.
#
#   In --apply mode, cleanliness is re-checked immediately before removal
#   (state can change between scan and apply); if `git worktree remove`
#   still refuses on a worktree we just confirmed clean, the refusal can
#   only be gitignored junk (or a stale lock) — retried once with --force.
#   `git worktree prune -v` runs at the end. Branches are NEVER deleted —
#   the script prints a hint pointing at `git branch --merged main`.
#
# Section 2 — build-artifact clean (main checkout only):
#   Candidates: apps/*/.next, apps/*/.open-next, apps/mobile/Patina/build,
#   apps/mobile/Capture/.build, <root>/.build, packages/*/storybook-static,
#   and any .turbo directory outside node_modules/ and registered worktrees.
#   Skipped automatically (with a printed reason) if a matching dev/build
#   process is running:
#     - `next dev`/`next-server` running  -> .next/.open-next left alone
#     - `xcodebuild` running              -> Xcode/SwiftPM build dirs left alone
#   node_modules, .venv, .serena, and any path git tracks a file under are
#   never candidates, full stop. du -sh is reported for every candidate;
#   --apply is the only mode that actually rm -rf's them.
#
# Exit status is 0 whenever the sweep itself completes, including "nothing
# to do" — this is a report/cleanup tool, not a CI gate.
#
set -euo pipefail

APPLY=0
IGNORE_GENERATED_DIRT=0
EXTERNAL_ROOT=""

usage() {
  cat <<'EOF'
Usage: scripts/repo-gc.sh [--apply] [--ignore-generated-dirt] [--external-root PATH] [--help]

Dry run by default: reports removable worktrees and build-artifact
directories without touching anything. Pass --apply to actually remove them.

Options:
  --apply                  Remove what section 1/2 report as removable.
                            Without it, this is purely a report.
  --ignore-generated-dirt   Treat a worktree as clean when its only dirty
                            paths are under */src/generated/prisma-client/*
                            (pre-existing generated-file drift). Off by default.
  --external-root PATH      Allowed Herdr worktree root. Defaults to the local
                            git config patina.worktreeRoot, then ~/Code/.herdr-worktrees.
  -h, --help                Show this help and exit.

Never touches: the main checkout (not a removal candidate, ever), branches
(only worktrees are removed — see `git branch --merged main` for prunable
branches), node_modules/.venv/.serena, or any git-tracked path.
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --ignore-generated-dirt) IGNORE_GENERATED_DIRT=1 ;;
    --external-root)
      shift
      [[ "$#" -gt 0 ]] || { echo "repo-gc.sh: --external-root requires a path" >&2; exit 2; }
      EXTERNAL_ROOT="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "repo-gc.sh: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Resolve + guard the repo root. Resolved from the SCRIPT's own location (not
# the caller's cwd) so `some/other/repo/$ scripts/../patina-merged/scripts/repo-gc.sh`
# style invocations can't accidentally operate on the wrong tree.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! REPO_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "repo-gc.sh: $SCRIPT_DIR is not inside a git repo — refusing to run" >&2
  exit 1
fi

if [[ ! -f "$REPO_ROOT/package.json" ]] || ! grep -q '"name": "patina-monorepo"' "$REPO_ROOT/package.json"; then
  echo "repo-gc.sh: $REPO_ROOT does not look like the patina-monorepo repo (package.json name mismatch) — refusing to run" >&2
  exit 1
fi

# Must be running from the MAIN checkout, not a linked worktree: in a linked
# worktree --show-toplevel returns the worktree's own path, which would make
# every guard below compare REPO_ROOT against itself and never skip anything.
GIT_DIR_RESOLVED="$(cd "$(git -C "$REPO_ROOT" rev-parse --git-dir)" && pwd)"
GIT_COMMON_DIR_RESOLVED="$(cd "$(git -C "$REPO_ROOT" rev-parse --git-common-dir)" && pwd)"
if [[ "$GIT_DIR_RESOLVED" != "$GIT_COMMON_DIR_RESOLVED" ]]; then
  echo "repo-gc.sh: this looks like a linked worktree, not the main checkout — refusing to run" >&2
  echo "  run this script from the main checkout instead" >&2
  exit 1
fi

cd "$REPO_ROOT"

REPO_NAME="$(basename "$REPO_ROOT")"
if [[ -z "$EXTERNAL_ROOT" ]]; then
  EXTERNAL_ROOT="$(git config --local --get patina.worktreeRoot || true)"
fi
if [[ -z "$EXTERNAL_ROOT" ]]; then
  EXTERNAL_ROOT="$HOME/Code/.herdr-worktrees"
fi
case "$EXTERNAL_ROOT" in
  "~/"*) EXTERNAL_ROOT="$HOME/${EXTERNAL_ROOT#~/}" ;;
esac
HERDR_REPO_ROOT="$EXTERNAL_ROOT/$REPO_NAME"

# True only for a path that exists, resolves under REPO_ROOT, and is not
# REPO_ROOT itself. Every destructive action is gated on this.
under_repo_root() {
  local resolved
  resolved="$(cd "$1" 2>/dev/null && pwd)" || return 1
  [[ "$resolved" == "$REPO_ROOT"/* && "$resolved" != "$REPO_ROOT" ]]
}

under_managed_worktree_root() {
  local resolved herdr_resolved=""
  resolved="$(cd "$1" 2>/dev/null && pwd)" || return 1
  if [[ -d "$HERDR_REPO_ROOT" ]]; then
    herdr_resolved="$(cd "$HERDR_REPO_ROOT" && pwd)"
  fi
  [[ "$resolved" == "$REPO_ROOT"/* && "$resolved" != "$REPO_ROOT" ]] || \
    [[ -n "$herdr_resolved" && "$resolved" == "$herdr_resolved"/* ]]
}

human_kb() {
  awk -v kb="${1:-0}" 'BEGIN {
    if (kb >= 1048576) printf "%.1fG", kb / 1048576;
    else if (kb >= 1024) printf "%.1fM", kb / 1024;
    else printf "%dK", kb;
  }'
}

MODE_LABEL="DRY RUN"
[[ "$APPLY" -eq 1 ]] && MODE_LABEL="APPLY"
echo "== repo-gc: $MODE_LABEL =="
echo "repo root: $REPO_ROOT"
echo "herdr root: $HERDR_REPO_ROOT"
echo

# =============================================================================
# Section 1 — worktree sweep
# =============================================================================
echo "--- section 1: worktree sweep ---"

if ! git fetch origin; then
  echo "warning: 'git fetch origin' failed — continuing with possibly-stale remote refs" >&2
fi

WT_PATH=()
WT_HEAD=()
WT_BRANCH=()

# Parse `git worktree list --porcelain`: blank-line-separated blocks, each
# starting with a `worktree <path>` line, then `HEAD <sha>`, then either
# `branch refs/heads/<name>` or a bare `detached` line.
parse_worktrees() {
  local path="" head="" branch="" line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "$line" ]]; then
      if [[ -n "$path" ]]; then
        WT_PATH+=("$path"); WT_HEAD+=("$head"); WT_BRANCH+=("$branch")
      fi
      path=""; head=""; branch=""
      continue
    fi
    case "$line" in
      "worktree "*) path="${line#worktree }" ;;
      "HEAD "*) head="${line#HEAD }" ;;
      "branch "*) branch="${line#branch refs/heads/}" ;;
      "detached") branch="" ;;
    esac
  done < <(git worktree list --porcelain)
  if [[ -n "$path" ]]; then
    WT_PATH+=("$path"); WT_HEAD+=("$head"); WT_BRANCH+=("$branch")
  fi
}
parse_worktrees

REMOVABLE_WT=()
KEPT_WT_COUNT=0
LINKED_WT_COUNT=0

for i in "${!WT_PATH[@]}"; do
  wt_path="${WT_PATH[$i]}"
  wt_head="${WT_HEAD[$i]}"
  wt_branch="${WT_BRANCH[$i]}"

  wt_real="$(cd "$wt_path" 2>/dev/null && pwd || true)"
  if [[ -z "$wt_real" ]]; then
    echo "  ! $wt_path — registered but missing on disk; 'git worktree prune -v' below will clear it"
    continue
  fi
  if [[ "$wt_real" == "$REPO_ROOT" ]]; then
    continue # main checkout — never a candidate
  fi
  if ! under_managed_worktree_root "$wt_real"; then
    echo "  ! $wt_real — outside the repo and configured Herdr roots; refusing to consider it"
    continue
  fi

  LINKED_WT_COUNT=$((LINKED_WT_COUNT + 1))
  branch_label="${wt_branch:-<detached>}"

  raw_status="$(git -C "$wt_real" status --porcelain)"
  effective_status="$raw_status"
  ignored_note=""
  if [[ "$IGNORE_GENERATED_DIRT" -eq 1 && -n "$raw_status" ]]; then
    effective_status="$(printf '%s\n' "$raw_status" | grep -v '/src/generated/prisma-client/' || true)"
    if [[ -z "$effective_status" ]]; then
      raw_count="$(printf '%s\n' "$raw_status" | grep -c . || true)"
      ignored_note=" (${raw_count} generated-dirt path(s) ignored via --ignore-generated-dirt)"
    fi
  fi
  dirty_count=0
  if [[ -n "$effective_status" ]]; then
    dirty_count="$(printf '%s\n' "$effective_status" | grep -c . || true)"
  fi
  is_clean=0
  [[ "$dirty_count" -eq 0 ]] && is_clean=1

  is_merged=0
  if git merge-base --is-ancestor "$wt_head" main 2>/dev/null; then
    is_merged=1
  fi

  is_pushed=0
  if [[ -n "$wt_branch" ]] && git show-ref --verify --quiet "refs/remotes/origin/$wt_branch"; then
    if git merge-base --is-ancestor "$wt_head" "refs/remotes/origin/$wt_branch" 2>/dev/null; then
      is_pushed=1
    fi
  fi

  if [[ "$is_clean" -eq 1 && ( "$is_merged" -eq 1 || "$is_pushed" -eq 1 ) ]]; then
    reasons=()
    [[ "$is_merged" -eq 1 ]] && reasons+=("merged into main")
    [[ "$is_pushed" -eq 1 ]] && reasons+=("pushed to origin/$wt_branch")
    why="$(IFS=', '; echo "${reasons[*]}")"
    echo "  removable: $wt_real  [branch: $branch_label] — ${why}${ignored_note}"
    REMOVABLE_WT+=("$wt_real")
  else
    if [[ "$is_clean" -eq 0 ]]; then
      reason="dirty ${dirty_count} file(s)"
    elif [[ -z "$wt_branch" ]]; then
      reason="detached-unmerged"
    else
      reason="unpushed-unmerged"
    fi
    echo "  kept:      $wt_real  [branch: $branch_label] — ${reason}"
    KEPT_WT_COUNT=$((KEPT_WT_COUNT + 1))
  fi
done

if [[ "$LINKED_WT_COUNT" -eq 0 ]]; then
  echo "  no linked worktrees found"
fi

if [[ "$APPLY" -eq 1 && "${#REMOVABLE_WT[@]}" -gt 0 ]]; then
  echo
  echo "  applying removals:"
  for wt in "${REMOVABLE_WT[@]}"; do
    if ! under_managed_worktree_root "$wt"; then
      echo "    refusing to remove $wt — outside the configured cleanup roots" >&2
      continue
    fi
    recheck="$(git -C "$wt" status --porcelain)"
    if [[ "$IGNORE_GENERATED_DIRT" -eq 1 && -n "$recheck" ]]; then
      recheck="$(printf '%s\n' "$recheck" | grep -v '/src/generated/prisma-client/' || true)"
    fi
    if [[ -n "$recheck" ]]; then
      echo "    skip (dirtied since scan): $wt" >&2
      continue
    fi
    echo "    removing: $wt"
    if git worktree remove "$wt"; then
      :
    else
      # Cleanliness was just reconfirmed above, so a refusal here can only be
      # gitignored junk (or a stale lock) — safe to force through.
      echo "    refused — retrying with --force (status was clean)"
      git worktree remove --force "$wt"
    fi
  done
  echo "  pruning stale worktree registrations:"
  git worktree prune -v
fi

echo "  hint: worktrees are never deleted with their branch attached — 'git branch --merged main' lists branches now safe to delete"
echo

# =============================================================================
# Section 2 — build-artifact clean (main checkout only)
# =============================================================================
echo "--- section 2: build-artifact clean ---"

shopt -s nullglob

skip_next=0
if pgrep -f "next dev|next-server" >/dev/null 2>&1; then
  skip_next=1
  echo "  skip: a 'next dev'/'next-server' process is running — leaving .next/.open-next in place"
fi

skip_xcode=0
if pgrep -f xcodebuild >/dev/null 2>&1; then
  skip_xcode=1
  echo "  skip: xcodebuild is running — leaving Xcode/SwiftPM build dirs in place"
fi

CANDIDATES=()

add_candidates() {
  local p
  for p in "$@"; do
    # Explicit if, not `[[ -d "$p" ]] && ...`: when this is the LAST arg and
    # its dir is absent, a bare `&&` list's exit status (1) becomes this
    # function's return status, and set -e kills the whole script at the
    # (untested) call site — silently, right after section 2's header prints.
    if [[ -d "$p" ]]; then
      CANDIDATES+=("$p")
    fi
  done
}

if [[ "$skip_next" -eq 0 ]]; then
  add_candidates apps/*/.next apps/*/.open-next
fi

if [[ "$skip_xcode" -eq 0 ]]; then
  add_candidates apps/mobile/Patina/build apps/mobile/Capture/.build .build
fi

add_candidates packages/*/storybook-static

# .turbo dirs anywhere in the tree, excluding node_modules/ and worktrees —
# `find` rather than a glob since .turbo can nest at arbitrary depth. Agent
# Legacy nested worktrees may remain in old clones. Pruning on the `worktrees`
# basename prevents this main-checkout artifact scan from entering them.
while IFS= read -r -d '' d; do
  CANDIDATES+=("$d")
done < <(find "$REPO_ROOT" \
           -type d \( -name node_modules -o -name worktrees \) -prune \
           -o -type d -name .turbo -print0)

is_protected_path() {
  case "$1" in
    */node_modules|*/node_modules/*) return 0 ;;
    */.venv|*/.venv/*) return 0 ;;
    */.serena|*/.serena/*) return 0 ;;
  esac
  return 1
}

has_tracked_files() {
  local hits
  hits="$(git -C "$REPO_ROOT" ls-files -- "$1" 2>/dev/null | head -1 || true)"
  [[ -n "$hits" ]]
}

FINAL_TARGETS=()

# Plain linear-search dedup, not `declare -A`: the system /usr/bin/env bash on
# macOS is still 3.2 (no associative arrays) and this script must run under it.
#
# Also note the `"${ARR[@]+"${ARR[@]}"}"` shape used on every `for x in ...`
# below instead of plain `"${ARR[@]}"`: under bash 3.2 (fixed in 4.4+),
# expanding an EMPTY array's `[@]` elements throws "unbound variable" under
# `set -u`, even though `${#ARR[@]}` (length) and `${!ARR[@]}` (indices) on
# the same empty array are both fine. This bit us for real: CANDIDATES is
# routinely empty (no stale build artifacts to sweep).
is_new_target() {
  local needle="$1" existing
  for existing in "${FINAL_TARGETS[@]+"${FINAL_TARGETS[@]}"}"; do
    if [[ "$existing" == "$needle" ]]; then
      return 1
    fi
  done
  return 0
}

for t in "${CANDIDATES[@]+"${CANDIDATES[@]}"}"; do
  real="$(cd "$t" 2>/dev/null && pwd || true)"
  [[ -z "$real" ]] && continue
  if ! is_new_target "$real"; then
    continue
  fi

  if ! under_repo_root "$real"; then
    echo "  ! $real resolves outside the repo root — skipping" >&2
    continue
  fi
  if is_protected_path "$real"; then
    echo "  ! $real is a protected path (node_modules/.venv/.serena) — skipping" >&2
    continue
  fi
  if has_tracked_files "$real"; then
    echo "  ! $real contains git-tracked file(s) — skipping" >&2
    continue
  fi
  FINAL_TARGETS+=("$real")
done

TOTAL_KB=0
for t in "${FINAL_TARGETS[@]+"${FINAL_TARGETS[@]}"}"; do
  kb="$(du -sk "$t" 2>/dev/null | cut -f1)"
  kb="${kb:-0}"
  TOTAL_KB=$((TOTAL_KB + kb))
  sz="$(human_kb "$kb")"
  if [[ "$APPLY" -eq 1 ]]; then
    echo "  removing (${sz}): $t"
    rm -rf -- "$t"
  else
    echo "  would remove (${sz}): $t"
  fi
done

if [[ "${#FINAL_TARGETS[@]}" -eq 0 ]]; then
  echo "  no build-artifact directories found"
fi

echo

# =============================================================================
# Summary
# =============================================================================
echo "=== summary ($MODE_LABEL) ==="
echo "worktrees:     ${#REMOVABLE_WT[@]} removable, ${KEPT_WT_COUNT} kept"
echo "artifact dirs: ${#FINAL_TARGETS[@]}"
echo "estimated size: $(human_kb "$TOTAL_KB")"
if [[ "$APPLY" -eq 0 ]]; then
  echo "(dry run — pass --apply to actually remove any of the above)"
fi

exit 0
