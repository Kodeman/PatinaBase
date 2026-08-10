# Patina AI Development Workflow

Herdr owns Patina worktrees and CLI agent sessions. The canonical checkout stays clean on `main`; implementation happens on external `ai/<issue>-<slug>` worktrees.

## Lane model

- Control: intake, PR integration, and maintenance; no agent edits.
- Implementation A/B: at most two independent writers with disjoint path ownership.
- Runtime/review: shared Docker/Supabase/dev servers, serialized interactive QA, and findings-only review at the candidate SHA.

Never start the shared stack from an implementation worktree. Never use Claude or Codex worktree flags inside a Herdr worktree.

## Task packet

Every task states the outcome, acceptance criteria, permitted paths, shared-state owner, prohibited actions, runtime/data requirements, and exact Patina verification gates. If two tasks touch the lockfile, migrations, generated DB types, root configuration, CI, infrastructure, agent policy, or skills, serialize them.

## Delivery

1. Refresh `origin/main`; create the branch/worktree through Herdr.
2. Initialize the machine profile once with `scripts/init-local-env-profile.sh`, then run `scripts/bootstrap-worktree.sh` in each worktree. Add `--generate-prisma` only after service schema changes or when generated clients are absent.
3. Orient with `git rev-parse --show-toplevel`; confirm the assigned paths.
4. Implement and run the narrowest real gate first.
5. Commit explicit pathspecs using a Conventional Commit.
6. Stop the writer and review the candidate in the runtime/review lane. Reviewers report findings and do not edit.
7. Resolve accepted findings, rerun affected checks, and request approval to push/open the PR.
8. Merge only after required CI and human review. Confirm ancestry, remove the checkout through Herdr, and delete the merged branch.

## Runtime policy

The runtime lane is the sole owner of Docker, Supabase, seeds/resets, fixed ports, and interactive QA. Before any mutation, verify portal environment URLs are localhost/127.0.0.1. App servers are restarted explicitly after a Herdr server or machine restart; only supported agent conversations are expected to restore automatically.

The automatic machine profile contains only the three portal environments generated from local Supabase and the three service environments whose `DATABASE_URL` is explicitly localhost. Extension, studio, edge-function, and third-party credentials require task-specific manual review; never copy production credentials into the shared profile by default.

## Maintenance

- `scripts/worktree-recovery-manifest.sh` creates a restricted, non-destructive inventory.
- `scripts/repo-gc.sh` is dry-run by default. Review its output before `--apply`.
- Upgrade Herdr through Homebrew only when lanes are clean, then verify Claude/Codex integration status and session restore.
