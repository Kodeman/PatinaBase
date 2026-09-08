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

---

## Reset — re-gate 2 (2026-09-07, independent re-gate reviewer)

The re-gate reviewer took the stack and ran
`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
**twice**. No migration and no seed file was edited in this pass — both resets
replay the same tree the close-out left; the second exists only to hand the walk
a clean stack.

1. **First reset**, before any probe. Finished clean. Ledger head probed after:
   `00579, 00578, 00577` (533 rows). Everything in
   `integration-regate-2.md` §0–§3 was measured on this replay.
2. **Second reset**, after the gates. Finished clean, same head. It exists
   because the two client Playwright runs leave real fixture rows behind — after
   them the stack carried 4 `studio_trade_agreements` and 2 `design_build`
   proposals, which a walk should not meet. Probed after: both counts are `0`.

Other notes for the next owner:

- `python3 scripts/generate-legacy-grants.py` was re-run: "baseline + 2568
  replayed statements", `git diff` on `supabase/seed/00-legacy-grants.sql`
  **empty**. No grant moved in this pass either.
- Every probe transaction was `BEGIN … ROLLBACK`, so nothing this reviewer
  probed survives on the stack.
- A scratch clone `patina_regate2` was made with `pg_dump --no-owner -Fc` +
  `pg_restore --no-owner` (813 of the source's 818 public FKs restored; the five
  that did not are `engagement_events_user_id_fkey`, both `invoice_links_*`,
  `organization_members_user_id_fkey`, `user_roles_user_id_fkey` — all
  cross-schema references `pg_restore` skipped along with 57 default-privilege
  statements it lacked rights for). It was used only to confirm that
  `pg_stat_get_function_calls` is invisible inside an open transaction, and was
  **dropped** before the gates. Worth knowing: the corrected recipe in `env.md`
  is not a perfect clone either.
- A `pnpm dev` client-portal server ran on :3002 with the three-flag override
  for the e2e gate and was stopped; :3002 confirmed clear afterwards.

Next owner: unchanged — whoever runs the Wave 3 walk. The stack is at `00579`,
freshly reset, with no e2e or probe residue.
