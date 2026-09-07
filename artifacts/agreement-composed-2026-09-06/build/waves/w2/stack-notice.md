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

---

## 2026-09-07 — the close-out fix agent takes the stack (R31–R37)

The Wave 2 **close-out fix agent** is now the sole writer of the shared local stack at
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, from the same worktree
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`, branch
`agreement/w2-integration`).

R31–R37 change `00576`, `00577`, `scripts/generate-legacy-grants.py` and the generated
`supabase/seed/00-legacy-grants.sql`, so **the stack is reset from this worktree after every
one of those changes** — `supabase db reset --workdir <this worktree>`. Each reset is logged
below as it is run.

**Nobody else may write this stack until this notice is superseded.**

- Reset 1 — after R31 (the restored arities, the per-function grants generator).
- Reset 2 — after R32/R33/R34/R36 (00576 + 00577 edits and the new `the-client-page.sql` fixture).
- Reset 3 — after R37 (the `patina.deposit` key/kind fix in 00576 and the keepsake renderer in 00577). This is the reset every gate below was measured on.

---

## 2026-09-07 — the RE-GATE reviewer takes the stack (re-gate 2 of Wave 2)

The Wave 2 **re-gate reviewer** now holds the shared local stack at
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, from the same worktree
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`, branch
`agreement/w2-integration`, head `dc8ecf9a0`).

**No migration and no seed file was changed by this reviewer.** `scripts/generate-legacy-grants.py`
was run once, purely to test whether the committed `supabase/seed/00-legacy-grants.sql`
is current (it is not — see finding W2RG-01 in `integration-regate-2.md`), and the
regenerated file was immediately reverted with `git checkout --`. The working tree is clean.

Every reset below is `supabase db reset --workdir <this worktree>`, replaying every migration
through `00577` and all 36 seed files, clean, no errors:

- Reset A — the baseline the ruling/object probes were measured on (`schema_migrations` head
  `00577`; 24/24 function bodies in 00576/00577 matched `pg_proc`; the 00511 ACL manifest probe
  and the eight-surviving-tuple probe were run here).
- Reset B — before `scripts/run-sql-tests.sh`, so the order-sensitive `rls/project_notes_test.sql`
  was measured on a first run. Result: 164 total, 143 green, 21 expected-fail, **0 unexpected**.
- Reset C — before the full client Playwright run (`npx playwright test --workers=1`).
- Reset D — before the targeted composed-agreement e2e re-run (the signing touchpoint mutates
  the seeded fixture, so it needs a fresh stack to run twice).
- Reset E — final, after all gates, so the stack is left clean at head `00577` for whoever
  reads next. `select max(version) from supabase_migrations.schema_migrations` → `00577`.

The client dev server this reviewer started on `:3002` (with
`NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true`, the local anon key
and the local service-role key from `supabase status -o env`) has been stopped; port 3002
is free.

## 2026-09-07 — the RE-GATE 2 FIX agent takes the stack

The re-gate-2 fix agent holds the shared local stack at
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, from the same worktree
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`, branch
`agreement/w2-integration`), fixing W2RG-01 through W2RG-05.

**Two tracked SQL artifacts changed, so the stack was reset:**

- `supabase/seed/00-legacy-grants.sql` — regenerated by the fixed
  `scripts/generate-legacy-grants.py` (W2RG-01, W2RG-02). 2 498 replayed statements,
  was 2 459.
- `supabase/migrations/00577_agreement_fee_schedules.sql` — edited IN PLACE
  (unapplied on Strata): `compose_agreement_consent` now takes one part per money
  variant (W2RG-05). No new migration number was minted; the banner lineage is
  unchanged because the function is first created in this file.

**One reset, after both edits:**
`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`,
unsandboxed — every migration through `00577` and all 36 seed files, clean, no errors.
The stack is left at that state: `schema_migrations` head `00577`, the regenerated seed
replayed, the fixed composer live.

Anyone taking the stack next inherits this branch's `00575`/`00576`/`00577` and the
regenerated grants seed. No dev server was started; port 3002 was not used.

## 2026-09-07 — the WALK-FIX agent (round 1) — THE STACK WAS NOT TOUCHED

The walk-fix agent worked from the same worktree
(`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`, branch
`agreement/w2-integration`), fixing W-01 through W-04, and changed **no migration, no
seed, and no SQL of any kind** — the four fixes are TypeScript in
`apps/designer-portal` and `apps/client-portal` only.

**No `supabase db reset` was run. No SQL suite was run. No query was issued against
the stack at all.** It still stands exactly as the re-gate-2 fix agent left it:
`schema_migrations` head `00577`, the regenerated grants seed replayed, this branch's
`00575`/`00576`/`00577` applied.

No dev server was started; ports 3000 and 3002 were not used.
