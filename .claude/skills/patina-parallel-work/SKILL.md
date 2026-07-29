---
name: patina-parallel-work
description: Use when dispatching subagents that will run git against this repo, running multiple concurrent Claude Code sessions on the same clone, planning wave or multi-branch delivery, creating or retiring git worktrees, minting Supabase migrations on parallel branches, or about to git add/commit while another agent may be active. Symptoms: unexpected files in git status, a commit touching paths you didn't intend, migration-number collisions, or not knowing which checkout you're in.
---
# Parallel Work: Worktrees, Concurrent Sessions, Commit Hygiene

Last verified: 2026-07-09 (main @ c4de810d, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when

Use when:
- Dispatching 2+ subagents that will run `git` against this repo
- Running multiple concurrent Claude Code sessions against the same clone
- Planning a wave/slice/multi-branch delivery program
- Creating, using, or retiring a git worktree
- Two or more branches are minting Supabase migrations concurrently
- About to `git add`/`git commit` and another agent or session may be active

Don't use when:
- Solo work, single session, main checkout, nothing else running — just follow root `CLAUDE.md` commit conventions
- You need the mechanics of migration numbering itself — patina-db-migrations
- You need local Supabase/dev-server startup steps — patina-local-dev
- You're verifying an iOS build/device claim — patina-ios-verification

## Procedure

1. **Orient before touching git.** Run `git rev-parse --show-toplevel`. If concurrent agents may be active and this prints the main repo path (not a `.claude/worktrees/...` path), stop — create/enter a worktree first. Never run git in the shared checkout while another session might too.
2. **If the session model is Fable**: per root `CLAUDE.md` ("Using Fable"), Fable plans, orchestrates, and does the adversarial review — it does not execute directly. Dispatch Sonnet/Opus subagents to do the actual git/file work, each with an explicit scope, an assigned worktree, and a pathspec list; Fable reviews their output, then returns to the user or sends them further instructions.
3. **Create a worktree per concurrent agent**, named `agent-<id>` so `.gitignore`'s `.claude/worktrees/agent-*/` rule covers it automatically:
   ```
   git worktree add .claude/worktrees/agent-<id> -b <program>/<wave-or-slice>
   ```
   A worktree named anything else is NOT auto-ignored and surfaces in `git status` — the exact precondition behind a real 286-file contamination commit (`c40a259a`, quarantined as tag `rescue/foreign-tree-c40a259a`, confirmed never merged to main via `git merge-base --is-ancestor`).
4. **Bootstrap the worktree** before building or type-checking anything in it — workspace packages resolve to compiled `dist/`, and a fresh worktree has none:
   ```
   pnpm install
   pnpm turbo build --filter=<pkg>...
   ```
5. **Claim exclusive ownership of shared local state** for the wave: one agent runs `supabase db reset`/seeds; one agent per dev-server port (designer 3000, admin 3001, client 3002, manufacturer 3003, media 3014, orders 3015, projects 3016 — cross-ref patina-local-dev). Parallel resets/seeds or port collisions corrupt each other's runs.
6. **Mint migration numbers as provisional.** Re-check the integration target's current tip immediately before merge, not when the branch was created — numbers collide repeatedly across parallel branches (`git log --oneline --all --grep=renumber -i` shows the fix history — six-plus incidents, not a one-off).
7. **Commit with pathspec restriction, always.** Stage and commit only the explicit paths you touched — never `git add -A` / `git add .`. The tree carries untracked landmines (`infra/.env.bak-*`, `deno.lock`, `.build/`, `.serena/`, stray docs) and, at last check, dozens of other agents' stale worktrees under `.claude/worktrees/`.
8. **Follow the branch/merge conventions already in use**: Conventional Commits (`type(scope): summary`); programs decompose into `<program>/<wave-or-slice>` branches, optionally through a `*-integration` branch, into `main`; slice merges use lowercase `merge(scope): summary` commit messages; real merges are the norm here, squash is the exception; no revert culture — fix forward; commit bodies explain *why* plus verification evidence, not just *what*.
9. **Never trust "is this merged?" from memory, branch existence, or a PR title.** Confirm with:
   ```
   git merge-base --is-ancestor <branch> main
   ```
   Two prior "not merged" notes in project memory were wrong — both branches were already on `main`.
10. **Clean up when done — mandatory, not optional.** The orchestrator MUST remove each agent worktree at task end, whether its work merged or was abandoned — don't leave it sitting "for later." Once a branch is confirmed merged, remove the worktree and delete the branch (see Commands); an abandoned worktree gets removed regardless of branch status. Use `scripts/repo-gc.sh` (dry-run by default; `--apply` to execute) to sweep any stragglers that slip through this discipline. Left unchecked these pile up fast: a 2026-07-29 sweep found 185 accumulated worktrees under `.claude/worktrees/`, consuming tens of GB in duplicated `node_modules`/`.next`/`.build` — 82 were removable outright. This policy exists to prevent that recurring.
11. **End of task**: group changes into logical Conventional Commits and push to `origin`, including feature branches — not just `main`.

## Commands

```bash
# Orient — run this first, always
git rev-parse --show-toplevel

# Create an isolated worktree (name MUST start with agent- to be gitignored)
git worktree add .claude/worktrees/agent-<id> -b <program>/<wave-or-slice>

# List currently registered worktrees; `locked` entries need unlocking first
git worktree list

# Bootstrap a fresh worktree before building/type-checking anything in it
pnpm install
pnpm turbo build --filter=<pkg1>... --filter=<pkg2>...

# Pathspec-restricted staging + commit — never `git add -A` / `git add .`
git add path/one path/two
git commit -m "feat(scope): summary" -- path/one path/two

# Confirm a branch is actually merged — don't trust existence or notes
git merge-base --is-ancestor <branch> main && echo MERGED || echo NOT-MERGED

# Audit migration-renumbering history (context on how often this bites)
git log --oneline --all --grep=renumber -i

# Retire a finished worktree
git worktree unlock .claude/worktrees/agent-<id>   # only if `locked` in `git worktree list`
git worktree remove .claude/worktrees/agent-<id>
git branch -d <branch>                             # only after confirming it's merged

# Sweep stragglers across the whole repo — dry run reports only, --apply removes
scripts/repo-gc.sh
scripts/repo-gc.sh --apply

# Push everything, not just main
git push origin <branch>
git push origin main
```

## Quality bar

- Every commit's file list matches its message — no surprise paths, confirmed by re-reading `git show --stat` before considering the commit done.
- No git command runs in the shared main checkout while another agent/session might also be running one there.
- Migration numbers are reconciled against the integration target's tip immediately before merge, not assumed from when the branch was created.
- Mergedness claims are backed by `git merge-base --is-ancestor` output, never by memory, branch existence, or a title.
- Worktrees and branches are retired once merged, not left to accumulate.

## Verification checklist

- [ ] `git rev-parse --show-toplevel` matches your assigned worktree, not the main checkout
- [ ] `git status` immediately before `git add` shows only paths you intend to touch
- [ ] Staged/committed with explicit pathspecs, not `-A`/`.`
- [ ] Migration number(s) re-checked against the current integration-target tip
- [ ] Shared local state (DB reset/seed, dev-server ports) had a single declared owner
- [ ] `git merge-base --is-ancestor <branch> main` run for every "is this merged?" claim, output pasted
- [ ] Worktree removed and branch deleted if the work is confirmed merged
- [ ] Pushed to `origin`, feature branches included

## Common mistakes

| Situation | Wrong move | Right move |
|---|---|---|
| Subagent needs to run git | Run it in the main checkout because it's "just a quick fix" | Assign a worktree first; verify with `git rev-parse --show-toplevel` |
| Naming a new worktree | Free-form name, e.g. `.claude/worktrees/my-fix/` | Prefix `agent-<id>` so `.gitignore`'s `agent-*/` rule covers it |
| Committing after a long session | `git add -A` / `git add .` | `git add <explicit paths>`, then `git commit -- <explicit paths>` |
| New migration on a feature branch | Assume the number picked at branch-creation time is final | Re-check the target tip right before merge; renumber on collision |
| First build in a fresh worktree | Run `pnpm build`/`type-check` immediately | `pnpm install` then `pnpm turbo build --filter=<pkgs>...` first |
| Checking whether a branch shipped | Trust a memory note or that the branch still exists | `git merge-base --is-ancestor <branch> main` |
| Two agents in one wave both need the local DB | Each runs its own `supabase db reset` | One agent owns reset/seed for the whole wave |
| A worktree's work is done | Leave it on disk | `git worktree remove` (unlock first if `locked`) + delete the branch; run `scripts/repo-gc.sh` to sweep any stragglers that already piled up |

## Report back

State, with evidence: (1) which worktree you worked in — paste `git rev-parse --show-toplevel`; (2) exactly what you staged/committed — paste `git status` and `git diff --stat` from before the commit, not a description; (3) for every "is this merged" claim, the `git merge-base --is-ancestor` output; (4) any migration numbers you minted and whether you re-checked them against the target tip before merge; (5) worktree/branch cleanup performed, or explicitly deferred with a reason. Never assert "pushed" or "merged" without the command output that proves it.
