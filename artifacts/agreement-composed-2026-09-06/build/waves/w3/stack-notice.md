# Stack ownership — agreement-w3

**As of 2026-09-07**, the program `agreement-composed` Wave 3 ("The Agreement, Composed" — turnkey) owns the shared local Supabase stack (`supabase status --workdir /Users/kody/Code/patina-merged`).

- Verified up at start of Wave 3 steward setup. `supabase_edge_runtime_supabase` and `supabase_pooler_supabase` show as "Stopped services" in `supabase status` output — DB/API/Studio/Auth/Storage/Realtime are running; this matches the state left by the Wave 2 steward and is not a Wave 3 change.
- `supabase_migrations.schema_migrations` head at start of Wave 3: `00577` (`00575_agreement_parts`, `00576_agreement_library`, `00577_agreement_fee_schedules` — the top three by version), i.e. exactly Wave 2's shipped head. No reset was performed to get here.
- Wave 3 lanes (backend, designer, client, edge, sub) do **NOT** reset or seed this shared stack during the build. Each lane validates its own migration/RLS/RPC work against a **scratch database** (see `env.md` → "Scratch-DB recipe"), not against this shared instance.
- Only the **integration steward** for Wave 3 resets or re-seeds the shared local stack, at merge/integration time.
- Do not run `supabase db reset`, `supabase stop`, or any destructive command against this stack from a lane worktree during the build phase.

Next owner: the Wave 3 integration steward, at integration time.

---

## Handover — the Wave 3 integration steward now owns this stack (2026-09-07)

The build phase is over. The **Wave 3 integration steward** has taken the shared
local Supabase stack (`supabase status --workdir /Users/kody/Code/patina-merged`)
and is about to `supabase db reset` it against the integration worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
(branch `agreement/w3-integration`), which carries all five lanes merged plus
migrations `00578_design_build_kind.sql` and `00579_trade_agreements.sql`.

- Ledger head **before** this reset: `00577` (Wave 2's shipped head — unchanged
  since the Wave 3 steward-setup reading recorded above).
- Ledger head **after** this reset: `00579`.
- The reset replays every migration from zero plus the seeds wired into
  `[db.seed]`, so **any un-migrated local state on this stack is destroyed**.
  Nothing in the Wave 3 build depended on such state: every lane validated on a
  scratch database per `env.md`.
- `project_id = "supabase"` is identical in the main checkout's `config.toml` and
  the integration worktree's, so a reset run with
  `--workdir <integration worktree>` targets these same containers while
  replaying the **integration branch's** migration tree. That is deliberate.

**Do not** run `supabase db reset`, `supabase stop`, or any destructive command
against this stack from a lane worktree from here on. Ask the integration
steward, or take the stack over explicitly by appending to this file.

Next owner: whoever runs the Wave 3 walk. The walk boot recipe (both portals,
the two-flag override, seeded accounts) is in `walk-env.md` beside this file.

---

## Reset — close-out fixes R40–R47 (2026-09-07, close-out agent)

The close-out pass (rulings R40–R47) edited `00578_design_build_kind.sql` in
place — `compose_agreement_consent` (R40), `_agreement_schedule_of_values` /
`_validate_pricing_basis_payload` / `send_commercial_document` (R43), and a
pinned `search_path` on nine functions (R45). Both migrations are still
unapplied on Strata, so editing in place is the correct remediation.

**`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration` was run once, after those edits, and this stack now carries them.**

- Ledger head after the reset: `00579` (probed:
  `select version from supabase_migrations.schema_migrations order by version desc limit 3` →
  `00579, 00578, 00577`).
- Probed after the reset, not inferred: no `public._agreement*` or
  `public._validate*` function has a null `proconfig` (R45 landed).
- `supabase/seed/00-legacy-grants.sql` was regenerated with
  `python3 scripts/generate-legacy-grants.py` **before** the reset —
  "baseline + 2568 replayed statements", `git diff --stat` empty, so no grant
  moved in this pass — and it replayed clean as the first seed of that reset.
- Iteration before the reset used a **scratch clone** (`patina_w3fix`) made with
  `pg_dump --no-owner -Fc` + serial `pg_restore --no-owner` per the round-3
  correction to `env.md`'s recipe (818 public FKs on the clone; the piped
  `pg_dump | psql` recipe silently drops every constraint under libpq 18.4).
  The scratch DB was dropped before the reset.
- A `pnpm dev` client-portal server was started on :3002 to run the two
  Playwright specs the rulings name, and stopped afterwards. Nothing else was
  left running.

Next owner: unchanged — whoever runs the Wave 3 walk.
