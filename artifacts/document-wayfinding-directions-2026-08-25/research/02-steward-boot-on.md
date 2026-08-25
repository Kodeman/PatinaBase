# E2 — Dev-server steward: BOOT-ON

Program: The Document — Wayfinding Review. Run 2026-08-25.

## Sandbox note (why unsandboxed)

Per the brief, boot/kill commands run with `dangerouslyDisableSandbox: true`. Reason
(matches `00-env-and-seeds.md`): inside the sandbox, `turbo`'s internal git-status scan hits
the outer permission layer's `.env*` deny rule (`EPERM: operation not permitted` on
`apps/client-portal/.env.local`) and exits 1 before spawning anything; separately, `next dev`
inside the sandbox floods `Watchpack Error (watcher): Error: EMFILE: too many open files` and
never serves `/desk`. Both are sandbox artifacts (a filesystem deny rule and a file-descriptor
cap on the sandboxed process), not code/config problems, so this agent's boot/kill/env-clear
commands ran unsandboxed. All read-only inspection (curl, grep, ps for verification) stayed
sandboxed except where noted (process-env introspection via `ps eww` needed
`dangerouslyDisableSandbox` too — the sandboxed `ps`/`pgrep` returned
`sysmond service not found` / `Cannot get process list`).

## Path taken: `pnpm dev:designer` (turbo), unsandboxed — worked on the first real attempt

1. **Ports check** — `lsof -i :3000/:3014/:3015/:3016` all empty at start. No fallback needed.
2. **First boot** (unsandboxed):
   ```
   cd /Users/kody/Code/patina-merged
   NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
   NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true,worktable:true' \
   nohup pnpm dev:designer > artifacts/document-wayfinding-directions-2026-08-25/research/dev-boot-on.log 2>&1 &
   ```
   `/desk` returned `307` in ~16s. No EMFILE in the log at all (unsandboxed avoided the
   fd-cap that blocked the earlier sandboxed attempt in `00-env-and-seeds.md`). All 4 ports
   came up listening; `/v1/health` (orders 3015, projects 3016) and `/health` (media 3014)
   all returned healthy JSON.
3. **Stale-cache problem found and fixed.** Step-5 flag verification (below) turned up that
   the compiled bundle for `doc/[id]` contained the literal string `"room-file:true"` —
   **not** the full override string I'd passed. This is a stale `.next` build artifact from
   an earlier session/value (this checkout already had a `.next` directory with hashed chunk
   filenames before I ever started a server this turn). Next's dev persistent cache can skip
   recompiling a `'use client'` module whose `process.env.NEXT_PUBLIC_*` inlining depends on
   env values it doesn't know changed. **Fix**: killed the server
   (`pkill -f "turbo run dev --filter=@patina/designer-portal"`, unsandboxed; confirmed all 4
   ports free), removed the stale artifacts (`rm -rf apps/designer-portal/.next`, unsandboxed
   — a generated build directory, not source under review), and rebooted with the identical
   command above. This is the only file-tree mutation under `apps/` this agent made, and it's
   a build-cache deletion, not an edit to reviewed code.
4. **Second (final) boot** — same command, fresh `.next`. `/desk` → `307` at ~30s. Re-ran the
   full pre-warm table (below) to force fresh compiles. No EMFILE. Final process check: all 4
   ports still listening, `/desk` still `307` after a 5s settle.

## PIDs / ports / logs (final, running set)

| port | role | PID(s) |
|---|---|---|
| 3000 | designer-portal (`next-server` + `next dev` driver) | 89747 (next-server), 89701 (next dev) |
| 3014 | media service | 90104 |
| 3015 | orders service | (turbo child under 88843/88821, not directly listed by lsof owner name) |
| 3016 | projects service | 90034 |

Top-level turbo driver: PID 88843 (`turbo run dev --filter=@patina/designer-portal
--filter=@patina/orders --filter=@patina/media --filter=@patina/projects`), parent 88821.

Log: `artifacts/document-wayfinding-directions-2026-08-25/research/dev-boot-on.log`
(contains both the killed first attempt and the final successful boot, in order — first
attempt has no EMFILE either, it was only replaced because of the stale-flag-cache issue,
not a boot failure).

## `.env.local` load confirmation

Log line present: `@patina/designer-portal:dev: - Environments: .env.local, .env` — Next
loaded the portal's real `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` etc.; the two inline vars (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE`,
`NEXT_PUBLIC_FLAG_OVERRIDES`) came from process env, which Next.js prioritizes over `.env.local`
per its documented precedence order.

## Pre-warm table (final run, post cache-clear)

All unauthenticated — 307 → `/auth/signin?callbackUrl=...` is expected and by design (per
brief: "the point is the compile"). `/auth/signin` itself renders 200 (first full page
compile, ~14s cold).

| path | status | elapsed |
|---|---|---|
| /desk | 307 | 565ms |
| /auth/signin | 200 | 14324ms |
| /library | 307 | 107ms |
| /people | 307 | 84ms |
| /rooms | 307 | 96ms |
| /help | 307 | 87ms |
| /doc/67b836e8-9167-4f39-b25d-39270d412a3f (project_rich, Chen Residence) | 307 | 69ms |
| /doc/b0000000-0000-0000-0000-000000000002 (proposal_sent, Aspen Loft) | 307 | 57ms |
| /doc/b0000000-0000-0000-0000-0000000000d1 (install, Aspen Loft) | 307 | 92ms |
| /doc/b0000000-0000-0000-0000-0000000000d3 (care, Birch Hollow) | 307 | 86ms |
| /doc/6d18a14c-eedd-4f04-a029-34bcc1a3d749 (brief, Full Room lead) | 307 | 203ms |
| /doc/d0c10000-0000-0000-0000-0000000000a2 (discovery, The Ashfords) | 307 | 93ms |
| /doc/d0c10000-0000-0000-0000-0000000000b2 (direction, Elena Marlowe) | 307 | 81ms |
| /doc/67b836e8-.../plans | 307 | 68ms |
| /doc/67b836e8-.../spec-book | 307 | 88ms |
| /drafting/d0c10000-0000-0000-0000-0000000000b2 | 307 | 182ms |
| /room/b0000000-0000-0000-0000-0000000d2c0a | 307 | 191ms |

Every path is a `hbci`/listening 307 redirect to sign-in (auth middleware runs before any
nested route segment compiles), matching the pre-existing project_plain target
(`/doc/b0000000-0000-0000-0000-0000000000d4`, not separately probed but same auth gate
applies) — the middleware gate means the *nested* page components (where the feature-flag
hooks live) are not compiled by an unauthenticated hit; only the shared root layout is. This
matters for the flag-proof section below.

## Flag-override proof

**Process-level proof (solid):** `ps eww -p 89747 89701 88843 88821` (unsandboxed — the
sandboxed `ps`/`pgrep` are blocked entirely: `sysmond service not found` /
`Cannot get process list`) shows, verbatim, on every relevant PID:

```
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
NEXT_PUBLIC_FLAG_OVERRIDES=call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true,worktable:true
```

This confirms the exact override string, including `worktable:true`, reached the running
`next-server` and `next dev` processes.

**Bundle-level proof (not obtainable by this agent):** the brief's suggested check
(`grep -rl "worktable:true" apps/designer-portal/.next/static`) requires the client bundle
that reads `process.env.NEXT_PUBLIC_FLAG_OVERRIDES` (in `use-feature-flag.ts`, a `'use
client'` module) to have actually compiled. That only happens when an authenticated request
reaches a page that imports it — every route this steward can reach unauthenticated redirects
via middleware before that module is required. I do not hold a designer session, and
fabricating one is outside this agent's scope (shot/probe agents own authenticated
verification). **Stating this rather than guessing**, per the brief's own instruction: I have
strong process-env proof the override is correct and live in the server process, but no
compiled-bundle grep proof — that will only be obtainable once a downstream agent
authenticates and hits a flagged page, at which point the same
`grep -rl "worktable:true" apps/designer-portal/.next` check will resolve it definitively (or
a later pre-warm agent that holds a session cookie could hit those pages directly).

One concrete finding along the way: the *first* boot's `.next` directory (present in this
checkout before this turn) had a stale compiled chunk containing only `"room-file:true"` —
proof that a stale build cache can silently serve an old flag-override value. I cleared it
(`rm -rf apps/designer-portal/.next`) and rebooted; downstream agents should be aware that if
they ever see an unexpected flag state, a stale `.next` cache from a differently-flagged
prior boot is a real, observed failure mode in this repo, not hypothetical.

## Services status

| service | port | health path | result |
|---|---|---|---|
| designer-portal | 3000 | /desk (auth-gated) | 307, confirms alive |
| orders | 3015 | /v1/health (NestJS `setGlobalPrefix('v1')`, `@Controller('health')`) | `{"status":"healthy","database":"connected"}` |
| media | 3014 | /health (no global prefix) | `{"status":"ok"}` |
| projects | 3016 | /v1/health | `{"status":"ok"}` |

Redis (`ECONNREFUSED 127.0.0.1:6379`) errors appear repeatedly in orders/projects logs —
`docker compose up -d` (Redis/MinIO/Mailhog) was not started as part of this boot mandate
(not in the brief's steps). This did **not** prevent either service from reporting healthy
over HTTP; Redis appears to back an optional cache/queue path, not the health check itself.
Flagging in case a downstream agent hits a Redis-dependent feature (e.g. rate limiting,
session cache) and sees odd behavior — the fix would be `docker compose up -d` from repo
root, which is outside this steward turn's instructed scope.

## Elapsed

- First boot → `/desk` ready: ~16s.
- Cache clear + second boot → `/desk` ready: ~30s.
- Total steward turn: ~15 min including the stale-cache investigation.

## Leave-running confirmation

Not killed. Final check after a 5s settle: `lsof -i :3000` shows `next-server` (PID 89747)
still LISTEN; `curl /desk` → `307`. All 4 ports (3000/3014/3015/3016) confirmed listening.
Everything is left running for the orchestrator's downstream shot/probe agents; this steward
will be re-invoked in KILL mode to tear down.
