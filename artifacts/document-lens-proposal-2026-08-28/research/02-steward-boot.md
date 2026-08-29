# 02 — Steward boot recipe

Program: The Smart Lens proposal. Ported from
`artifacts/document-wayfinding-directions-2026-08-25/research/02-steward-boot-off.md`
(WAY's BOOT-OFF run), which found `pnpm dev:designer` under `dangerouslyDisableSandbox: true`
starts cleanly with zero `EMFILE` occurrences — no `next build`/`next start` fallback needed.
This is the recipe for booting the same way for this program; it has not been run yet by this
agent (A0 is scaffold-only, no product code / no dev server). A later research agent runs it and
fills in a run report the way WAY's `02-steward-boot-off.md` did.

## Path to take: `pnpm dev:designer` (turbo), unsandboxed

Boot/kill commands need `dangerouslyDisableSandbox: true` — headless Chromium (for the shot/probe
scripts) cannot claim a mach port inside the sandbox, and turbo's git-status scan can hit the
`.env*` permission-deny rule under the default sandbox.

## Before boot: check the ports are free

```bash
lsof -i :3000 -t
lsof -i :3014 -t
lsof -i :3015 -t
lsof -i :3016 -t
```

Empty output on all four means no kill is needed before boot. A live PID on any of them means a
stale server from an earlier run — confirm with the steward-kill recipe before rebooting rather
than boot on top of it.

## Exact boot command

```bash
cd /Users/kody/Code/patina-merged
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true' \
nohup pnpm dev:designer > artifacts/document-lens-proposal-2026-08-28/research/dev-boot.log 2>&1 &
disown
```

`dev:designer` = `turbo run dev --filter=@patina/designer-portal --filter=@patina/orders
--filter=@patina/media --filter=@patina/projects`, so all 3 retained services boot alongside the
portal. The portal's own dev script inside that is `next dev --webpack -p 3000`.

## The `/desk` poll

Poll `/desk` until it answers (a 307 redirect to sign-in counts as ready — it means the route
guard resolved, not that the page compiled):

```bash
until curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/desk | grep -q '^30[0-9]$'; do
  sleep 2
done
```

Budget: WAY's equivalent boot reached this state in 16s. If it has not answered inside ~8 minutes,
treat the boot as failed and check `research/dev-boot.log` for the actual error rather than
continuing to poll.

## Log path

- `artifacts/document-lens-proposal-2026-08-28/research/dev-boot.log` — full turbo/portal/services
  combined stdout+stderr.

## Specimen note — the rich doc is a fixed seed id; the pre-work doc is not

The rich specimen for this program is **Aspen Loft**, doc id
`b0000000-0000-0000-0000-0000000000d1` — a fixed seed id, safe to hardcode in
`research/state-ladder.json` and any shot/probe script without a lookup.

The pre-work doc has no fixed seed id and **must be resolved via `psql` against
`document_state`** (the same table WAY's ladder work resolved discovery/direction/brief stages
from) — query for a row whose `active_section`/phase corresponds to a pre-work state, confirm it
against the seed data before writing it into `state-ladder.json`, and record the exact query used
in `research/00-env-and-ids.md`'s "commands run unsandboxed" section. Do not guess or reuse a
prior program's id for this rung.

## Services health (check after boot)

| port | service | path to try | expected |
|---|---|---|---|
| 3014 | media | `/health` | 200 |
| 3015 | orders | `/health` → `/v1/health` (global prefix `v1`, `services/orders/src/main.ts`) | 200 |
| 3016 | projects | `/v1/health` (same global-prefix pattern, `services/projects/src/main.ts`) | 200 |

**Caveat carried over from WAY's run**: if `docker compose up -d` was not run, Redis
(`127.0.0.1:6379`) will not be listening and orders/projects will log `Redis Client Error:
ECONNREFUSED` throughout startup. This did not block either service from reaching "Nest
application successfully started" or answering `/health` 200 in WAY's run, so it is a caveat, not
a boot blocker — but any check depending on Redis-backed functionality (queues, caching) will
fail until `docker compose up -d` is run separately.

## End state

Leave the servers running (do not kill after boot) unless a downstream agent's brief says
otherwise — confirm liveness with the same `lsof -i :<port> -t` check used before boot, run again
after a settle period, before handing off.
