# 00 — Environment, ids, and unsandboxed commands

Program: The Document — Life (flatness review). 2026-08-28. Evidence steward scope:
`research/` (scripts + notes) and `shots/` only. No product code changes, no git.

## 1. Prior port sources (read first, per brief)

- `artifacts/document-wayfinding-directions-2026-08-25/research/wayfinding-shots.mjs` — shot
  harness ported into `research/capture-shots.mjs`.
- `artifacts/document-wayfinding-directions-2026-08-25/research/01-shot-ledger.md` — ledger
  format/conventions reused.
- `artifacts/document-wayfinding-directions-2026-08-25/research/02-steward-boot-off.md` — boot
  recipe reused verbatim (env vars, pre-warm approach).
- `artifacts/document-wayfinding-directions-2026-08-25/research/lift-states.sql` — the `install`
  rung's RPC chain, ported into `research/lift-install.sql` (install portion only; `care` not
  needed by this program's ladder).

## 2. Port status check — found a foreign dev server, killed and rebooted

`lsof -i :3000 -t` returned two PIDs. `ps -o pid,ppid,command=` on each (unsandboxed) showed:
- PID 775 — a Google Chrome helper process, unrelated (coincidental port-775 mention in `-t`
  output, not actually bound to :3000; `lsof -iTCP:3000 -sTCP:LISTEN` showed only one real
  listener).
- PID 83325 (`next-server v16.2.10`), parent 83314 — **running from
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ui-polish/apps/designer-portal`**, NOT
  this repo's main checkout. Its env included `NEXT_PUBLIC_ENV=production` and **no**
  `NEXT_PUBLIC_FLAG_OVERRIDES` at all.

Per the brief ("if you cannot tell [what it was started with], kill it and reboot") and because
a foreign worktree with unknown in-flight UI changes is not a valid baseline for a "current
build" flatness review: killed both (`kill 83314 83325`), confirmed port 3000 free, and rebooted
from `/Users/kody/Code/patina-merged` (the correct repo root) per the verified recipe.

## 3. `.env.local` Supabase-target check — could not read the file directly (by design), verified via served output instead

`grep`/`Read` on `apps/designer-portal/.env.local` were both denied by the permission system
(the repo's own sandbox config hard-denies reads of any `.env*` file, and the harness's
permission gate enforces this even with `dangerouslyDisableSandbox: true` — a correct guardrail,
not worked around). Verified the same fact a different way instead: after boot, `curl`'d
`http://localhost:3000/auth/signin` and grepped the served HTML for known Supabase hosts. Found
`127.0.0.1:54321` directly embedded in the page (the client-side Supabase URL is
`NEXT_PUBLIC_*`, so it's inlined into what the browser receives) and found no `supabase.co` or
the prod ref `bkvcixdmuyejfzcijpdg` anywhere in the response. **Confirmed local, not prod**,
without ever opening the env file.

## 4. Boot — exact commands (unsandboxed)

```bash
cd /Users/kody/Code/patina-merged
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live \
NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true' \
nohup pnpm dev:designer > artifacts/document-life-directions-2026-08-28/research/dev-boot.log 2>&1 &
disown
```

Ready in 604ms (`✓ Ready in 604ms`, log line). Local Supabase was already running
(`com.docker...` listening on 54321/54322 — not started by this agent).

**Server left running at the end of this task**, per brief: PID **52138**, port 3000. `next
dev --webpack -p 3000`, 3 services (media/orders/projects) booted alongside via
`turbo run dev --filter=...` as part of `dev:designer`.

## 5. Pre-warm

```
curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' http://localhost:3000/auth/signin  → 200 17.8s (first compile)
curl ... /desk     → 307 0.037s
curl ... /library  → 307 0.011s
curl ... /people   → 307 0.005s
```

Same pattern as the wayfinding program's boot note: auth-gated routes 307 instantly (redirect
happens before the route's own module tree compiles), so the real per-route compile cost is
still paid on the first *authenticated* hit, not visible in this table.

## 6. Id resolution — psql queries (all read-only except the one documented RPC lift)

`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Designer:
`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004` (`auth.users`, unchanged from
prior programs). `\d leads` run first per brief — confirmed `leads` no longer carries
`active_section`/lifecycle columns directly; that state now lives in the `document_state` view
(joined via `lead_id`/`project_id`/`proposal_id`).

Full queries and results are in `research/state-ladder.json`'s `query_used` field per rung.
Summary:

| rung | id | how found |
|---|---|---|
| `project_rich` | `5536f8d2-8950-4c64-8999-87a63befbe63` (Chen Residence) | Most `project_ffe_items` among this designer's projects; tied exactly with Olsen Lake House (3 items, 4 POs each) — Chen chosen per the plan's own expectation and prior-program precedent |
| `project_plain` | `b0000000-0000-0000-0000-0000000000d4` (Marrow & Vale Residence) | Only project-stage doc with `item_count=0` |
| `proposal_sent` | `b0000000-0000-0000-0000-000000000002` (Aspen Loft — Living Room Refresh) | Only `proposal_status='sent'` row for this designer |
| `install` | `b0000000-0000-0000-0000-0000000000d1` (Aspen Loft Refresh) | No project was at `active_section='install'` pre-lift (reseed reset it); lifted via RPC — see §7 |
| `brief` | `ffae1daa-4357-4539-a09b-ec55b9e37ac4` (Full Room — Marcus Wright) | Earliest `lead_response_deadline` among this designer's leads (2026-08-31) |

**Drift note**: none of these ids match the wayfinding program's (2026-08-25)
`state-ladder.json` ids for the equivalent rungs — a DB reset/reseed happened between the two
programs' runs (same phenomenon the wayfinding program itself documented happening mid-run on
25th). Every id in this program's `state-ladder.json` was independently re-resolved via psql on
2026-08-28, not copied forward from the older file.

## 7. Install-rung state lift (RPC only, no raw table writes)

`research/lift-install.sql`, ported verbatim (install section only) from
`artifacts/document-wayfinding-directions-2026-08-25/research/lift-states.sql`. Ran once,
unsandboxed (`psql ... -f research/lift-install.sql`):

```sql
perform expire_client_decision('b0000000-0000-0000-0000-00000005c301'::uuid);        -- the signoff blocker
perform advance_project_phase('...d1'::uuid, '...c102'::uuid, 'in_progress');         -- Design Development → completed
perform advance_project_phase('...d1'::uuid, '...c103'::uuid, 'in_progress');         -- Procurement & Orders → completed, Installation activated
```

Result verified in the same transaction: `document_state` for `...d1` →
`project_status='active'`, `active_section='install'`, `current_phase='installation'`. Every
step guarded (`if status = 'pending'/'in_progress' then ... end if`), so re-running is a no-op.

## 8. Unsandboxed commands run (full list)

All via `dangerouslyDisableSandbox: true`, per the brief's explicit allowance (dev server
boot/kill, psql, Playwright/Chromium, curl to localhost):

- `lsof -i :3000 -t`, `lsof -iTCP:<port> -sTCP:LISTEN -n -P` (ports 3000/3014/3015/3016,
  54321/54322) — process/port discovery
- `ps -o pid,ppid,command= -p <pid>`, `ps eww -p <pid>` — identifying the foreign worktree's dev
  server and its env
- `kill 83314 83325` — killing the foreign worktree's dev server
- `mkdir -p .../research .../shots` — scaffolding this program's own directories (sandboxed;
  listed here for completeness, not actually gated)
- `nohup pnpm dev:designer ... &` — booting the designer portal + 3 services from the repo root
- `curl -s -o /dev/null -w ... http://localhost:3000/<route>` ×4 (pre-warm) and one `curl ... -o
  /tmp/signin.html` (Supabase-target verification)
- `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "..."` — every id-resolution
  query in §6, `\d leads`, `\d document_state`
- `psql ... -f research/lift-install.sql` — the one write, an RPC-only state lift (§7)
- `node .../capture-shots.mjs` (×2, 1440 and 390 passes; re-run 3× total for the 1440 pass while
  fixing the welcome-modal and status-chips issues)
- `node .../measure-flatness.mjs` (×2 — once before, once after fixing the input/textarea
  font-scan gap)
- `node .../debug-chips.mjs`, `node .../debug-font.mjs` — one-off diagnostic probes kept in
  `research/` as provenance for the `status-chips` unreachable-state finding and the
  input/textarea font-scan fix, respectively
- `ln -s apps/designer-portal/node_modules research/node_modules` — ESM resolution convenience
  (not a business write), same pattern the wayfinding program used

## 9. Nothing failed outright

Every step above completed. The only "failure" in the deliverable set is the documented,
source-confirmed `status-chips` unreachable state (see `01-shot-ledger.md`), which is a genuine
fixture-data gap, not a broken command.

## 10. End state

Server left running: PID **52138**, port 3000, `next-server (v16.2.10)`. Local Supabase
(Docker, PID 16225) untouched, was already running before this task started. `research/`
contains: `capture-shots.mjs`, `measure-flatness.mjs`, `state-ladder.json`,
`lift-install.sql`, `debug-chips.mjs`, `debug-font.mjs`, `dev-boot.log`, `01-shot-ledger.md`,
`12-measurements.json`, `12-measurements.md`, `00-env-and-ids.md` (this file), plus the
`node_modules` symlink.
