# 32 — Steward boot, wave 2 (mode BOOT)

Program: The Document — Wayfinding Review. Run 2026-08-25, following the recipe in
`02-steward-boot-off.md`.

## Pre-boot port check

Sandboxed `lsof -i :<port>`, one call per port, all four returned no rows (exit code 1 /
empty) — nothing to kill:

- 3000: empty
- 3014: empty
- 3015: empty
- 3016: empty

## Boot command (unsandboxed, per brief)

```bash
cd /Users/kody/Code/patina-merged
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true' \
nohup pnpm dev:designer > artifacts/document-wayfinding-directions-2026-08-25/research/dev-w2-boot.log 2>&1 &
disown
```

Issued: `2026-08-25 15:20:43 CDT`. Shell reported the backgrounded launcher PID `18741` (the
`nohup pnpm` wrapper, not the final next-server PID — see table below for the real
listener PIDs from `lsof`).

## Poll results

`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/desk` every 15s:

| time | attempt | code |
|---|---|---|
| 15:20:46 | 1 | 000 (not listening yet) |
| 15:21:02 | 2 | **307** (ready) |

Ready in **~19s** from boot command issued to first successful `/desk` response — well
inside the 8-minute budget.

## Log confirmations

- `dev-w2-boot.log:47` — `@patina/designer-portal:dev: - Environments: .env.local, .env`
  (`.env.local` loaded fine, no `EPERM`; unsandboxed boot per brief).
- `dev-w2-boot.log:48` — `@patina/designer-portal:dev: ✓ Ready in 433ms`.
- `grep -c EMFILE dev-w2-boot.log` → `0` (no file-descriptor exhaustion, consistent with the
  wave-1 boot-off precedent).

## `/auth/signin` real-compile probe

```
curl -s -o /dev/null -w '%{http_code} %{time_total}s' http://localhost:3000/auth/signin
→ 200 10.094727s
```

One-time first compile, ~10s (faster than wave 1's 21.5s, likely warm module cache from the
earlier boot-off run's `.next` build artifacts on disk, though dev serving is in-memory per
wave 1's note — not investigated further here, out of scope for a boot step).

## PIDs / ports (confirmed via `lsof -i :<port> -t`, taken after a 5s settle)

| port | service | PID |
|---|---|---|
| 3000 | designer-portal (`next dev --webpack`) | 19572 |
| 3014 | media (`nest start --watch`) | 19839 |
| 3015 | orders (`nest start --watch`) | 19755 |
| 3016 | projects (`nest start --watch`) | 19771 |

## Final confirmation

Post-settle `/desk` check: **307** (ready, redirect-to-signin as expected — auth-gated
route, matches wave-1 behavior).

## End state — everything left running, not killed

```
port 3000 → PID 19572 (next-server v16.2.10, designer-portal)
port 3014 → PID 19839 (media, nest)
port 3015 → PID 19755 (orders, nest)
port 3016 → PID 19771 (projects, nest)
```

Log: `artifacts/document-wayfinding-directions-2026-08-25/research/dev-w2-boot.log`.

`ready = true` — `/desk` answered 307 well within budget, all 4 ports confirmed alive after
settle. Nothing was killed; this agent expects a later KILL-mode call to tear down.
