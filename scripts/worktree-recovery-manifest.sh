#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_ROOT="${PATINA_RECOVERY_DIR:-$HOME/.local/share/patina/worktree-recovery}/$STAMP"
mkdir -p "$OUTPUT_ROOT/patches"

MANIFEST="$OUTPUT_ROOT/manifest.tsv"
printf 'path\tbranch\thead\tdirty_paths\tmerged_into_main\tpushed_to_origin\n' > "$MANIFEST"

while IFS= read -r worktree_path; do
  [[ -d "$worktree_path" ]] || continue
  branch="$(git -C "$worktree_path" symbolic-ref --short -q HEAD || printf 'DETACHED')"
  head_sha="$(git -C "$worktree_path" rev-parse HEAD)"
  dirty_count="$(git -C "$worktree_path" status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
  merged=no
  pushed=no
  git -C "$REPO_ROOT" merge-base --is-ancestor "$head_sha" main 2>/dev/null && merged=yes
  if [[ "$branch" != DETACHED ]] && git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -C "$REPO_ROOT" merge-base --is-ancestor "$head_sha" "origin/$branch" 2>/dev/null && pushed=yes
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$worktree_path" "$branch" "$head_sha" "$dirty_count" "$merged" "$pushed" >> "$MANIFEST"
  if [[ "$dirty_count" -gt 0 ]]; then
    safe_name="$(printf '%s' "$branch-$head_sha" | tr '/ :' '---' | cut -c1-120)"
    git -C "$worktree_path" diff --binary > "$OUTPUT_ROOT/patches/$safe_name.patch"
    git -C "$worktree_path" status --short --untracked-files=all > "$OUTPUT_ROOT/patches/$safe_name.status"
  fi
done < <(git -C "$REPO_ROOT" worktree list --porcelain | sed -n 's/^worktree //p')

chmod -R go-rwx "$OUTPUT_ROOT"
printf 'worktree-recovery-manifest: wrote restricted report to %s\n' "$OUTPUT_ROOT"
