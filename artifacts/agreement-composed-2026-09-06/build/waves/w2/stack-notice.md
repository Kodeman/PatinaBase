# Local Supabase stack ownership — agreement-w2

Written 2026-09-07 by the Wave 2 steward, before any lane work begins.

**This program (`agreement-w2` — "The Agreement, Composed", Wave 2: the Library) now owns
the local Supabase stack** at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
(API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`).

- Confirmed status: `supabase status --workdir /Users/kody/Code/patina-merged` — API/DB/Studio
  services up (`supabase_edge_runtime_supabase` and `supabase_pooler_supabase` were reported
  stopped at the time of this check; core Postgres/API/Auth/Storage/Studio were reachable).
- Confirmed migration ledger head: `select version from supabase_migrations.schema_migrations
  order by version desc limit 3` → `00575`, `00574`, `00573`. This matches Wave 1 fully applied
  (`00575_agreement_parts.sql` is the newest file on disk and in the ledger).

**Rules for the three Wave 2 lanes (backend, designer, client) during the build:**

- Do **NOT** run `supabase db reset`, `supabase stop`, or any other command that mutates or
  tears down this shared local stack.
- Each lane validates its own migration/RPC work against a **scratch database**
  (`patina_w1`, or lane-specific scratch DBs cloned from `postgres` via `pg_dump | psql`), never
  against this shared stack. See `env.md` in this same directory for the exact scratch-DB
  recipe.
- Only the **integration steward** (the agent that merges the three Wave 2 lanes) resets the
  shared local stack, and only after all three lanes have landed their migrations for
  integration testing.

If you are a lane agent reading this and you believe you need to touch the shared stack
directly (reset, stop, or apply a migration against `54322` outside your scratch DB), stop and
escalate — that is out of scope for a lane and reserved for the integration steward.

---

## 2026-09-07 — the integration steward takes the stack

All three Wave 2 lanes have landed. The **agreement-w2 integration steward** is now the
sole writer of the shared local stack at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
- Branch: `agreement/w2-integration` (base = `main` @ `8bc8bcc4d`)
- About to run **`supabase db reset`** from that worktree, replaying every migration through
  `00577_agreement_fee_schedules.sql` plus the regenerated `supabase/seed/00-legacy-grants.sql`.

**Nobody else may write this stack until this notice is superseded.** A concurrent
`supabase db reset`, `supabase stop`, or scratch-DB create/drop against `54322` while the
integration gates run will corrupt the run and, per the "shared local Supabase: last reset
wins" lesson, silently hand a different program's schema to whoever reads next.

Scratch databases created by the lanes (`patina_w1`, `patina_base`, `patina_final`,
`patina_w2r3`) are reported dropped by their owners; the reset re-creates only `postgres`.
