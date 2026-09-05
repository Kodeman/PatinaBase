# Studio invoices — Wave 1 worktrees

Prepared 2026-09-05 by the PREPARE steward. Base = `origin/main` tip `36b4b539e1f2cb732fb722d84edfe758d6b4008a` (fetched and verified against origin; no drift from the expected tip named in the brief).

## Worktrees

| Purpose | Path | Branch | Base sha |
|---|---|---|---|
| Integration (merge target for W1 lanes) | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration` | `studio-invoices/integration` | `36b4b539e` |
| W1 — DB (migration + SQL tests) | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db` | `studio-invoices/w1-db` | `36b4b539e` |
| W1 — Edge functions | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge` | `studio-invoices/w1-edge` | `36b4b539e` |

All three worktrees are freshly created off the same base commit, each `git worktree add ... -b <branch> 36b4b539e`. `git worktree list` (run after creation) shows all three registered at `36b4b539e`.

## Bootstrap status

Each worktree: bare `cd <wt>` then `pnpm install` (unsandboxed — proxy auth requires it) then `pnpm turbo build --filter=@patina/utils --filter=@patina/types --filter=@patina/api-routes --filter=@patina/shared`.

- **agent-si-integration**: `pnpm install` → `Done in 12.4s`. Turbo build → `4 successful, 4 total, Cached: 4 cached, 4 total — FULL TURBO` (utils, types, api-routes cache-hit; auth rebuilt as a dependency).
- **agent-si-db**: `pnpm install` → `Done in 11.3s`. Turbo build → `4 successful, 4 total — FULL TURBO`.
- **agent-si-edge**: `pnpm install` → `Done in 11.9s`. Turbo build → `4 successful, 4 total — FULL TURBO`.

**Note on `@patina/shared`**: it has no `build` script in `package.json` (only `type-check`/`lint`/`test`), so turbo silently skips it per the documented CLAUDE.md behavior ("turbo silently SKIPS workspaces lacking the script"). This is expected, not a bootstrap failure — confirmed by inspecting `packages/shared/package.json`.

## Local Supabase stack

`supabase --workdir /Users/kody/Code/patina-merged status` (read-only, unsandboxed):
- DB/API/Studio/Storage/Mailpit all report live URLs (`DB_URL`, `API_URL`, `STUDIO_URL` at `:54323`, `STORAGE_S3_URL`, `MAILPIT_URL`).
- One line: `Stopped services: [supabase_pooler_supabase]` — the connection pooler is down; core Postgres/Auth/Realtime/Storage/Studio are up. Not touched by this steward (no `db reset`/`start`/`stop` run — those are stack-owner-only per the brief).

## Migration numbering

`ls .../agent-si-integration/supabase/migrations | tail -2` → `00567_scope_vocabulary_full_house_custom.sql`, `00568_decision_first_notice_dispatch.sql` (plus a `_pending/` directory, unrelated — holds an older staged file, not a numbered migration). **The base ends cleanly at 00568.** No `00569` or `00570` exists on `main` or on either studio-invoices branch.

**Advisory (not a blocker on this base):** two other concurrent, unmerged programs have each independently minted a *different* `00569`:
- `approvals/w2-backend` → `00569_approval_why_viewer_role_and_receipt.sql` (plus a follow-up commit widening it)
- `approvals/w2-iosc` → `00569_stage2_outcome_signature_payload.sql`

Neither is on `main` yet, so they don't collide with `studio-invoices/w1-db` today. But per `patina-parallel-work` (mint migration numbers as provisional; re-check the integration target's tip immediately before merge, not at branch-creation time), the db lane (`agent-si-db`) should re-run `ls supabase/migrations | tail` against `main`'s current tip right before merging W1 — if either approvals branch has landed by then, the studio-invoices migration must renumber past whichever `00569` (or `00570`) is now on main.

## Program docs

- `plan.md` — the approved plan, copied verbatim from `/Users/kody/.claude/plans/middle-west-studio-would-snazzy-whisper.md`.
- `rulings.md` — S1–S12 adopted as recommended (Kody, 2026-09-05).
- `waves/{w1,w2,walk,ship}/` — empty, ready for each wave's agents to populate.
