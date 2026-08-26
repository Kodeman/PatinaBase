# 02 — Steward boot (BOOT-OFF mode)

Program: The Document — Wayfinding Review. Run 2026-08-25, following on from `00-env-and-seeds.md`.

## Path taken: `pnpm dev:designer` (turbo), NOT the build+start fallback

The research note in `00-env-and-seeds.md` reported turbo failing inside the *reviewer's*
sandbox because its git-status scan hit the `.env*` permission-deny rule, and reported
`next dev` alone hanging forever behind an `EMFILE: too many open files` watcher flood.
**Neither problem reproduced for this agent.** This agent's boot/kill commands run with
`dangerouslyDisableSandbox: true` per its brief (justified: the prior run's two failures
were sandbox-caused — a filesystem deny rule and a file-descriptor cap — not code or config
problems). Unsandboxed, turbo started cleanly and the designer-portal dev server reached a
ready state in 334ms with **zero** `EMFILE` occurrences over the full run (`grep -c EMFILE`
→ `0`, vs. 17 in the earlier sandboxed attempt's log). No fallback to `next build`/`next
start` was needed.

## Exact commands

```bash
cd /Users/kody/Code/patina-merged
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true' \
nohup pnpm dev:designer > artifacts/document-wayfinding-directions-2026-08-25/research/dev-boot-off.log 2>&1 &
disown
```

`dev:designer` = `turbo run dev --filter=@patina/designer-portal --filter=@patina/orders
--filter=@patina/media --filter=@patina/projects` (confirmed from the log), so all 3
services boot alongside the portal. The portal's own dev script inside that is `next dev
--webpack -p 3000` (confirmed in the log). `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` was
confirmed as the right var name against `apps/designer-portal/src/lib/mock-data.ts:3`
before boot.

Before boot, checked port 3000/3014/3015/3016 free (sandboxed `lsof -i :<port>`, one call
per port) — all four empty, no kill needed.

## PIDs / ports (all confirmed live at end of run via `lsof -i :<port> -t`)

| port | service | PID |
|---|---|---|
| 3000 | designer-portal (`next dev --webpack`) | 36975 |
| 3014 | media (`nest start --watch`) | 37228 |
| 3015 | orders (`nest start --watch`) | 37179 |
| 3016 | projects (`nest start --watch`) | 37202 |

## Log paths

- `artifacts/document-wayfinding-directions-2026-08-25/research/dev-boot-off.log` — full
  turbo/portal/services combined stdout+stderr (no separate start-log needed; the
  build+start fallback was not used).

## `.env.local` load confirmation

Log line 41: `@patina/designer-portal:dev: - Environments: .env.local, .env` — Next did
load `.env.local` this time (unlike the reviewer's sandboxed run, where it hit `EPERM` on
the same file). The two inline vars (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE`,
`NEXT_PUBLIC_FLAG_OVERRIDES`) still take precedence over any conflicting value in
`.env.local` per Next's standard env precedence (process env > `.env.local` > `.env`).

Log line 42: `✓ Ready in 334ms`.

## Pre-warm table

`curl -s -o /dev/null -w '%{http_code} %{time_total}'` against each target (full results in
`research/prewarm-results.txt`):

| route | status | time |
|---|---|---|
| `/desk` | 307 | 0.0045s |
| `/auth/signin` | 200 | 21.5s (first real compile) |
| `/library` | 307 | 0.0065s |
| `/people` | 307 | 0.0044s |
| `/rooms` | 307 | 0.0040s |
| `/help` | 307 | 0.0043s |
| `/doc/67b836e8…` (project_rich) | 307 | 0.0045s |
| `/doc/b0…002` (proposal_sent) | 307 | 0.0036s |
| `/doc/b0…d1` (install) | 307 | 0.0041s |
| `/doc/b0…d3` (care) | 307 | 0.0047s |
| `/doc/6d18a14c…` (brief) | 307 | 0.0046s |
| `/doc/d0c10000…a2` (discovery) | 307 | 0.0038s |
| `/doc/d0c10000…b2` (direction) | 307 | 0.0035s |
| `/doc/67b836e8…/plans` | 307 | 0.0039s |
| `/doc/67b836e8…/spec-book` | 307 | 0.0035s |
| `/drafting/d0c10000…b2` | 307 | 0.0036s |
| `/room/b0…d2c0a` | 307 | 0.0036s |

**Note for downstream shot/probe agents**: every `/doc/*`, `/drafting/*`, `/room/*`,
`/library`, `/people`, `/rooms`, `/help`, and `/desk` request came back as an instant
(<10ms) 307 redirect to sign-in — these are auth-gated routes and the middleware/route
guard redirects **before** the route's own module tree compiles server-side. Only
`/auth/signin` did a real first compile (21.5s, one-time). **This means the pre-warm did
NOT force-compile the protected pages** — an authenticated agent hitting them for the first
time should still expect a real (if now-warmed-dependency) compile delay on first load, not
instant response. Flagging this so no probe agent is surprised by a slow first authenticated
hit despite this pre-warm table showing fast numbers.

## Flag-override proof: INCONCLUSIVE — cannot prove via bundle grep, reporting honestly

Attempted the prescribed check: `grep -rl "studio-workspaces:true"
apps/designer-portal/.next/static` → **no match**. Investigated why rather than accepting a
silent negative:

1. All files under `.next/static` and `.next/server` predate this boot (mtime `04:38`, this
   boot started `~11:57` — confirmed via `find … -newermt`), and **zero files anywhere
   under `.next/` were modified during this boot**, including after hitting `/auth/signin`
   (which did take a real 21.5s compile). Conclusion: `next dev --webpack` in this
   environment serves compiled dev chunks from an **in-memory filesystem**, not disk — so
   grepping `.next/static` on disk against a live dev server is structurally the wrong
   check; it can only ever show stale prior-run (or prior prod-build) artifacts.
2. Fetched the live in-memory chunks directly over HTTP instead (`curl
   http://localhost:3000/_next/static/chunks/…`) — the chunks reachable from the one page
   that did compile (`/auth/signin`) don't reference `NEXT_PUBLIC_FLAG_OVERRIDES` at all
   (that page doesn't gate on any flag), so this proved nothing either.
3. Every route that **would** exercise the flag-parsing hook (`use-feature-flag.ts`,
   confirmed via source read to parse `process.env.NEXT_PUBLIC_FLAG_OVERRIDES` with format
   `flag-a:true,flag-b:false` — matches what was set) is behind the 307 auth redirect
   described above, so its module tree never compiled server- or client-side in this run.
   I did not attempt to authenticate to force that compile — out of scope for a boot step.

**What I can state with confidence, and what I can't:**
- Confirmed (source read): the running code's flag-check function reads
  `process.env.NEXT_PUBLIC_FLAG_OVERRIDES` directly at call time via a `key:value,...`
  parse that matches exactly what was passed.
- Confirmed: that exact env var was set inline on the shell command that spawned the very
  `pnpm dev:designer` → `next dev --webpack -p 3000` process now listening on 36975 (this
  agent's own command, not inferred).
- **Not proven**: no artifact — grepped file, live HTTP chunk, or log line — was found in
  this run that shows the literal override string reaching a compiled module. The
  prescribed grep command in the brief returns no matches for a structural reason (in-memory
  dev serving), not because the override is absent. Downstream agents needing to actually
  confirm a flag-gated surface renders should treat this as **unverified pending an
  authenticated request**, not as passing.

## Services health

| port | service | path tried | status |
|---|---|---|---|
| 3014 | media | `/health` | 200 |
| 3015 | orders | `/health` → 404, then `/v1/health` (global prefix `v1`, confirmed in `services/orders/src/main.ts`) | 200 |
| 3016 | projects | `/v1/health` (same global-prefix pattern, confirmed in `services/projects/src/main.ts`) | 200 |

All 3 services logged `Nest application successfully started` (orders/projects @ 11:57:57,
media @ 11:57:58). **Caveat**: Redis (`127.0.0.1:6379`) is not running — `lsof -i :6379`
empty, and both orders and projects logged repeated `Redis Client Error:
ECONNREFUSED` throughout startup and after. This did not prevent either service from
reaching `Nest application successfully started` or answering `/health` 200, so it's
recorded as a caveat, not a blocker — but any downstream check that depends on
Redis-backed functionality (queues, caching) in orders/projects will fail. `docker compose
up -d` was not run — out of scope for this boot step, not requested.

## Elapsed

Boot command issued → `/desk` returning 307 (ready): **16s** (first poll interval hit,
well inside the 8-minute budget). Total steward turn including pre-warm and health checks:
~4 minutes.

## End state — everything left running, not killed

```
port 3000 → PID 36975 (next-server v16.2.10)
port 3014 → PID 37228 (media, nest)
port 3015 → PID 37179 (orders, nest)
port 3016 → PID 37202 (projects, nest)
```

Confirmed alive after a 5s settle + final `/desk` check (307) at the very end of this turn.
Nothing was killed. This agent will be called again in KILL mode to tear down.
