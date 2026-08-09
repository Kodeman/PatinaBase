---
name: patina-parallel-work
description: Use when running concurrent Patina agents, creating or retiring Herdr worktrees, planning multi-branch delivery, minting migrations on parallel branches, or committing while another agent may be active.
---

# Patina Parallel Work

Herdr is the sole worktree control plane. This skill prevents checkout collisions, shared-runtime corruption, migration-number conflicts, and stale worktree accumulation.

## Rules

1. Orient with `git rev-parse --show-toplevel`. Writers must be in a linked checkout under the configured Herdr root, never the canonical `main` checkout.
2. Create/open/remove worktrees through Herdr. Do not use `git worktree add`, Claude `--worktree`, Codex-managed worktrees, or nested `.claude/.codex` worktree directories.
3. Branches use `ai/<issue>-<slug>` from current `origin/main`. Maximum active lanes are two writers plus one serialized runtime/review lane.
4. One writer owns each checkout. Every task packet names the worktree, permitted paths, acceptance criteria, prohibited actions, shared-state owner, and exact verification gates.
5. Serialize the lockfile, migrations, generated DB types, root configuration, CI, infrastructure, agent policy, and skills. Migrations remain provisional until reconciled against the integration tip.
6. Only the runtime/review lane owns Docker, Supabase, resets/seeds, fixed ports, interactive QA, and candidate review.
7. Bootstrap writers with `scripts/bootstrap-worktree.sh`. Do not share `node_modules` or start the shared runtime there.
8. Stage and commit explicit paths only. Never use `git add -A` or `git add .`.
9. The reviewer uses a separate context, reports findings with severity/confidence/evidence, and does not edit the writer's checkout.
10. Push/PR/merge requires approval. After merge, prove ancestry, remove the checkout through Herdr, delete the merged branch, and run the repository garbage collector in dry-run mode.

## Commands

```bash
# Create a Herdr worktree grouped under the canonical Patina workspace.
herdr worktree create \
  --cwd /Users/kody/Code/patina-merged \
  --branch ai/<issue>-<slug> \
  --base origin/main \
  --label '<issue>: <short label>' \
  --no-focus

# Bootstrap from inside the new checkout.
scripts/bootstrap-worktree.sh

# Verify location and explicit changes.
git rev-parse --show-toplevel
git status --short
git diff --stat

# Explicit staging/commit.
git add path/one path/two
git commit -m 'feat(scope): summary' -- path/one path/two

# Prove merged state before cleanup.
git merge-base --is-ancestor <branch> main

# Inspect Herdr worktrees and remove the grouped workspace after merge.
herdr worktree list --cwd /Users/kody/Code/patina-merged
herdr worktree remove --workspace <workspace-id>

# Recovery and garbage collection are non-destructive by default.
scripts/worktree-recovery-manifest.sh
scripts/repo-gc.sh
```

## Verification checklist

- [ ] The writer is in the assigned Herdr worktree, not canonical `main`.
- [ ] Its paths do not overlap another writer or a serialized hotspot.
- [ ] The shared runtime has one owner and portal URLs are localhost before mutation.
- [ ] Migration numbers were rechecked immediately before integration.
- [ ] Only explicit paths were staged and committed.
- [ ] Review happened in a separate findings-only context.
- [ ] Push/PR approval and required gates completed.
- [ ] Ancestry was proven and the checkout retired after merge.

## Report back

Report the worktree path, exact changed/committed paths, commands and outcomes, anything not verified, migration reconciliation if applicable, and cleanup performed. Never claim pushed or merged without command evidence.
