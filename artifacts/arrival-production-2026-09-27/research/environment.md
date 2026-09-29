# Environment Readiness — Project Arrival Production Build

Recon date: 2026-09-27. Read-only probes against `/Users/kody/Code/patina-merged` on this Mac. No git/supabase writes, no installs, no dev servers, no deploys were run. `.env*` files were not read (sandbox-denied; not retried).

## Readiness table

| Item | State | What must happen before the build wave |
|---|---|---|
| Node | `v24.12.0` (`node -v`) | None — repo requires node ≥20; satisfied. |
| pnpm | `9.0.0` exact match to `package.json` `packageManager: "pnpm@9.0.0"` (confirmed in `/Users/kody/Code/patina-merged/package.json`) | None. |
| corepack | `corepack status` is not a valid subcommand on this corepack (`corepack -v` → `0.34.5`); `corepack status` errored with "Unknown Syntax Error". | Not confirmed whether corepack is actively pinning pnpm; `packageManager` field is present so corepack-aware installs should self-pin. No action required unless a worktree's corepack disagrees — check with `corepack -v` there. |
| Local Supabase stack | `supabase --workdir ... status` failed: `error: Unknown: FileSystem.readFile (/Users/kody/Code/patina-merged/supabase/.env.local)` — the CLI itself could not read its own local env file in this sandboxed shell. API/Studio URLs **not confirmed**. However, `lsof -nP -iTCP:54321 -iTCP:54322 -sTCP:LISTEN` shows both ports LISTENing under `com.docke...` (Docker-proxied), so the local stack (API on 54321, DB on 54322) does appear to be up. | An agent with normal (non-recon) permissions should re-run `supabase --workdir /Users/kody/Code/patina-merged status` and confirm API URL is `http://127.0.0.1:54321` and Studio is `http://127.0.0.1:54323` before treating local as ready. |
| Docker daemon reachability | `docker ps` failed twice: `permission denied while trying to connect to the docker API at unix:///Users/kody/.docker/run/docker.sock`. This looks like a real socket-permission issue in this shell, not sandbox-file-deny noise (the sandbox report format for denials is different). Ports 54321/54322 are held by a process named `com.docke...`, so Docker itself is running — this session's shell simply cannot query it. | Integration agent should verify `docker ps` succeeds in its own shell before assuming container state; if it also gets `permission denied`, check `/Users/kody/.docker/run/docker.sock` ownership/group or whether Docker Desktop needs a restart. |
| pnpm install state | `ls node_modules/.pnpm | wc -l` → `3405` entries. Looks fully installed. | None expected; a worktree still needs its own `pnpm install` (workspace hoisting is not shared automatically across worktrees unless using a shared store — see bootstrap sequence below). |
| Designer-portal previous build | `apps/designer-portal/.next` exists with `BUILD_ID`, `build-manifest.json`, `app-path-routes-manifest.json` — a prior build is present (`du -sh` → 2.9G). | Stale; a fresh `deploy-portal.sh` run or `turbo build` will regenerate. Not a blocker, just note disk cost. |
| Workspace package dists | `packages/supabase/dist`, `packages/utils/dist`, `packages/types/dist` all present with compiled `.js`/`.d.ts` files. | Per CLAUDE.md, `infra/deploy-portal.sh` rebuilds these first regardless — do not rely on the existing dist being current; a stale dist previously shipped `TypeError: proposalTierVisibility is not a function` to prod. |
| Playwright browsers (cache) | `~/Library/Caches/ms-playwright` contains `chromium-1200`, `chromium-1208`, `chromium_headless_shell-1200/1208`, `firefox-1509`, `webkit-2248`, plus a `b` entry. Multiple versions cached. | None expected for e2e runs, but confirm the *pinned* version in `apps/designer-portal`'s `package.json`/lockfile matches one of the cached builds. |
| Playwright CLI (project-local) | `npx --no-install playwright --version` from `apps/designer-portal` → `Version 1.58.2`. Installed and resolvable without a network install. | None. |
| Disk (`/`) | `df -h /` → `926Gi` total, **`13Gi` used**, `49Gi` available, 21% capacity(!). Note the columns: used=13Gi but capacity 21% and avail 49Gi don't add to total cleanly (APFS shared-container accounting) — treat `49Gi available` as the operative number. | 49 GiB free is tight given worktrees run 15G+ each (see below) plus `.next` builds (~3G each) and node_modules (~3.7G if not sharing a pnpm store). Memory file already flags a prior disk-exhaustion incident (`feedback_worktree_build_cache_disk_exhaustion.md`, DISK FULL 2026-09-25 from `.build`/DerivedData hitting 183 GB). Run `df -h /` again immediately before spinning up any new worktree, and budget conservatively — likely room for only 2-3 more full worktrees at current 49Gi. |
| Git worktrees | `git -C ... worktree list | wc -l` → **114** worktrees registered. Ten newest (by listing order, not confirmed chronological) include 7 under `/Users/kody/.claude/sidequest/worktrees/patina-merged-5f06cee3/agent-*` and 3 legacy ones directly under `/Users/kody/Code/patina-merged/.codex/worktrees/` (`agent-client-material`, `agent-inv-w3b`, `agent-people-build`). | 114 is a large number; per **patina-parallel-work**, stragglers should be swept with `scripts/repo-gc.sh` (dry-run first) before adding more. Not run here (write action, out of scope for recon). |
| `.codex/worktrees` directory | Contains 5 entries: `agent-client-material`, `agent-ff-w1-l1f`, `agent-inv-w3b`, `agent-people-build`, `agent-tester-notes`. Only 3 of these show up in the `git worktree list` output above (client-material, inv-w3b, people-build) — `agent-ff-w1-l1f` and `agent-tester-notes` appear in the directory but were not among the git-registered worktrees seen. **Not confirmed** whether those two are stale/orphaned dirs or simply outside the "10 newest" window shown. | Integration agent should run the full (unfiltered) `git worktree list` and reconcile against `.codex/worktrees/*` before reusing any of these paths, and should NOT create a new worktree at a path git doesn't know about. |
| Worktree disk cost (measured) | `du -sh /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build` → **15G** for one existing worktree (includes its own `node_modules`, `.next`, build artifacts). | Budget ~15G per worktree unless it shares a pnpm store and skips building every app. With 49Gi free, that is room for roughly 2-3 such worktrees before the disk is at risk — matches the memory-file warning about DerivedData/build-cache exhaustion. |
| Repo `.git` size | `du -sh .git` → 2.6G. | Informational; not a blocker. |
| Recent commits | `git log --oneline -3`: `7dbd203bc test(design): B11 reads the reduced-motion card layer...`, `8bd0d1d7f fix(design): arrival v3 review fixes...`, `4b8000f88 test(design): real-Chromium lane for the arrival oracle (SQ-343)`. Confirms the arrival/motion work (SQ-335/336/342/343) is already landed on `main`, matching MEMORY.md's note that main `1a9c54787` was pushed for the motion-concepts deck (though that specific SHA is not in this 3-commit window — **not confirmed** whether `1a9c54787` is an ancestor of `7dbd203bc`). | Integration agent should `git log --oneline -20` to confirm the arrival/document work referenced in the task (SQ-335 Reyes, SQ-336 Whitfield, SQ-342/343 fixes) is fully merged before starting the portal-integration build, and should check whether any of it needs to be superseded vs. built on top of. |
| Supabase migrations head | `ls supabase/migrations | sort | tail -5`: `00671_create_direct_order_open_order_reuse.sql`, `00672_teaching_note_state.sql`, `00673_teaching_signals.sql`, `00674_help_state_merge.sql`, and one **stray timestamp-named** file `20260910152111_create_contact_messages.sql` sorting after the hand-numbered ones (lexicographic sort puts `2026...` after `00674` since `2` > `0`). This confirms CLAUDE.md's warning about timestamp-named strays vs. the hand-numbered `NNNNN_slug.sql` convention. | Current numbering head is **00674**; the next migration (if the flag-gated arrival feature needs any schema/flag row) should be **00675**, coordinated with any other concurrent session per `feedback_shared_local_postgres_across_sessions.md`. The `_pending` dir contains `00106_drop_client_messages.sql` — a queued/held migration, not part of the applied sequence; leave it alone unless the task specifically concerns it. |
| Dev ports 3000/3001/3002 | `lsof -nP -iTCP:3000 -iTCP:3001 -iTCP:3002 -sTCP:LISTEN` returned nothing (exit 1, no listeners) — no dev servers currently bound to designer-portal (3000), admin-portal (3001), or client-portal (3002). | Ports are free; a `pnpm dev:minimal` or similar can bind 3000 without conflict. |
| Local DB/API ports 54321/54322 | Both LISTENing, owned by a `com.docke...` process (Docker-proxied Supabase containers). | Consistent with "local stack likely running" above. |
| Designer portal's Supabase target (local vs prod) | **Not confirmed.** `.env`/`.env.local` reads are sandbox-denied and were not retried. The SessionStart-hook-convention check (`node scripts/hooks/core.mjs --help`) failed outright: `error: Unknown: FileSystem.readFile (/Users/kody/Code/patina-merged/supabase/.env.local)` — the hook script itself tried to read that env file and hit the same sandbox deny, so it produced no usable `--help` output. | An agent with permission to read `.env.local` (or the hook's own safe env-echo, if one exists) must confirm `NEXT_PUBLIC_SUPABASE_URL` before any local action that could be destructive. MEMORY.md flags this file has pointed at Strata prod before — treat as unverified/potentially prod until checked. |
| `PATINA_ALLOW_LOCAL_PROD_DEPLOY` | Checked via `${VAR+x}` (value never echoed) → **NOT SET** in this shell's environment. | Fine as-is; this is a safety gate for prod-from-local actions and should stay unset unless a deploy step explicitly requires it. |
| Cloudflare (`wrangler`) auth | `npx --no-install wrangler whoami` from `apps/designer-portal` → `⛅️ wrangler 4.107.0`, plus a proxy-env warning. The actual account name line was **not confirmed** — the captured output (`head -5`) only surfaced the version banner and the proxy warning, not an account/email line; whoami may need interactive/browser auth or the account line scrolled past the 5-line head. | Integration/deploy agent should re-run `npx wrangler whoami` without truncating output to get the actual authenticated account before running `./infra/deploy-portal.sh`. |
| Supabase CLI project link | `cat supabase/.temp/project-ref` → `bkvcixdmuyejfzcijpdg` — this **is** Strata, the production Supabase project ref per CLAUDE.md/AGENTS.md. | Confirms the CLI is link-configured toward prod Strata. This is expected/normal for a CLI-linked repo (migrations/functions deploy target), but it is a reminder that `supabase db push` / `supabase functions deploy` from this checkout point at production — never run those for a feature-flagged UI-only change unless a migration is actually needed, and never as part of "just trying the flag locally." |

## Bring-up commands for the integration agent

All commands use absolute paths; `cd` is never chained with `&&` across separate Bash calls per the no-persistent-cwd rule — each `cd` below is wrapped in its own `sh -c '...'` invocation as the task specified.

**1. Confirm local stack and disk before starting:**
```
df -h /
supabase --workdir /Users/kody/Code/patina-merged status
docker ps --format '{{.Names}}'
```

**2. Create/enter the worktree** (per patina-parallel-work — a dedicated worktree, not the shared main checkout):
```
git -C /Users/kody/Code/patina-merged worktree add <worktree-path> -b <branch-name>
```

**3. Bootstrap the worktree (install, then targeted builds):**
```
sh -c 'cd <worktree-path> && pnpm install'
sh -c 'cd <worktree-path> && pnpm turbo build --filter=@patina/designer-portal^...'
sh -c 'cd <worktree-path> && pnpm turbo build --filter=@patina/api-client'
sh -c 'cd <worktree-path> && pnpm turbo build --filter=@patina/aesthete-quiz'
```
(The `^...` filter builds every dependency of designer-portal but not designer-portal itself; `@patina/api-client` and `@patina/aesthete-quiz` are called out explicitly per project memory because turbo's dependency graph has previously not picked them up automatically for this portal — confirm this is still true for the current graph rather than assuming, since this recon did not verify that gap directly.)

**4. Local dev verification (never bare `pnpm dev`):**
```
sh -c 'cd <worktree-path> && pnpm dev:minimal'
```

**5. Portal build/deploy (only the sanctioned path):**
```
sh -c 'cd <worktree-path> && ./infra/deploy-portal.sh designer-portal'
```

**6. Disk estimate per worktree:** ~15G measured on an existing comparable worktree (`agent-people-build`, full node_modules + `.next` present). With 49Gi currently free on `/`, budget for roughly 2-3 concurrent worktrees at that size before disk risk reappears — the same failure mode already hit this repo once (2026-09-25 DISK FULL incident, `.build`/DerivedData). Run `df -h /` before and after each worktree's install/build step.

## Gaps / not confirmed
- Actual Supabase API/Studio URLs (CLI status call failed on its own env-file read in this sandbox).
- Whether the designer portal's own `.env.local` points at local or prod Strata (file read denied).
- The wrangler-authenticated account name (output truncated before the account line appeared).
- Whether `agent-ff-w1-l1f` and `agent-tester-notes` under `.codex/worktrees` are live/registered or orphaned (not present in the git worktree listing sample captured).
- Whether commit `1a9c54787` (referenced in MEMORY.md as the pushed motion-concepts main SHA) is an ancestor of the current `main` HEAD `7dbd203bc` — only the last 3 commits were inspected.
- Whether corepack is actually pinning/enforcing pnpm 9.0.0 in fresh worktrees (`corepack status` is not a valid subcommand on the installed 0.34.5 corepack; `packageManager` field presence is a proxy signal only).
- Root cause of `docker ps` permission-denied (socket permission vs. some other issue) — Docker itself appears up (ports 54321/54322 held), so this is likely a shell/session-specific socket-access gap rather than Docker being down.
