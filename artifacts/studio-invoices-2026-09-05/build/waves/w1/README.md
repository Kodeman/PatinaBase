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

**Environment note (correct this for later lane agents):** a bare `cd <wt>` in its own Bash call, as the brief instructs, does **not** persist to the next call in this session — verified empirically (`pwd`/`git rev-parse --show-toplevel` after a separate-call `cd` still reported the main checkout). The first bootstrap attempt silently ran `pnpm install`/`pnpm turbo build` in the **main checkout** instead of the worktrees, and a first attempt at the Step-5 commit landed on `main` in the main checkout rather than on `studio-invoices/integration` — caught by checking `node_modules`/`dist` existence per worktree after the fact, and fixed with `git reset --soft HEAD~1` + `git restore --staged` in the main checkout (no destructive op; the base checkout is back at clean `36b4b539e`, matching origin). **Correct pattern for this session: `cd <wt> && <command>` in one Bash call** (not two calls), or `git -C <wt> ...` for git specifically. Every command below was re-run this way and verified against each worktree's own `node_modules`/`dist`.

Each worktree: `cd <wt> && pnpm install` then `cd <wt> && pnpm turbo build --filter=@patina/utils --filter=@patina/types --filter=@patina/api-routes --filter=@patina/shared` (both unsandboxed — proxy auth requires it).

- **agent-si-integration**: `pnpm install` → `Done in 37.8s`. Turbo build → `4 successful, 4 total, Cached: 4 cached, 4 total — FULL TURBO`. Verified: `node_modules/.pnpm` populated; `packages/types/dist/index.d.ts` and `packages/api-routes/dist/index.js` present inside the worktree.
- **agent-si-db**: `pnpm install` → `Done in 59.6s`. Turbo build → `4 successful, 4 total — FULL TURBO`. Verified: `node_modules/.pnpm` populated; `packages/types/dist/aesthete.d.ts` present.
- **agent-si-edge**: `pnpm install` → `Done in 1m 4.2s`. Turbo build → `4 successful, 4 total — FULL TURBO`. Verified: `node_modules/.pnpm` populated; `packages/types/dist/aesthete.d.ts` present.

**Note on `@patina/shared`**: it has no `build` script in `package.json` (only `type-check`/`lint`/`test`), so turbo silently skips it per the documented CLAUDE.md behavior ("turbo silently SKIPS workspaces lacking the script"). This is expected, not a bootstrap failure — confirmed by inspecting `packages/shared/package.json`.

**Note on this `build/` folder's location**: Step 1 writes the program docs directly into the **main checkout** at `/Users/kody/Code/patina-merged/artifacts/studio-invoices-2026-09-05/build/` (that copy is the live, shared one other lane agents should read from — it is gitignored there, untracked, harmless). Step 5's literal `git -C <integration-worktree> add -f <main-checkout-path>` does **not** work as written — worktrees are separate directories sharing only `.git`, and git refuses to add a path outside the worktree's own root (`fatal: ... is outside repository`). Fixed by mirroring the folder into the worktree's own `artifacts/studio-invoices-2026-09-05/build/` before `add -f` + commit. Both copies now exist and are identical; the worktree copy is the one under version control on `studio-invoices/integration`.

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
