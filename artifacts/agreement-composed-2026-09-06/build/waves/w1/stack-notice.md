# Local Supabase stack ownership — agreement-w1

Date: 2026-09-06

**This program (agreement-w1 — "The Agreement, Composed", Wave 1) now owns the
shared local Supabase stack for the duration of this build.**

- The stack was found already running at migration head `00574` (confirmed via
  `select version from supabase_migrations.schema_migrations order by version
  desc limit 3` → `00574, 00573, 00572`). It was **not reset** by this steward.
- All three Wave 1 lanes (`agreement/w1-backend`, `agreement/w1-designer`,
  `agreement/w1-client`) validate their new migration (`00575_agreement_parts.sql`
  and any Wave-1-only follow-ons) against **their own scratch database**
  (`patina_w1`), never against the shared `postgres` database on 54322. See
  `env.md` in this directory for the scratch-DB recipe.
- No lane may run `supabase db reset` or `supabase stop`/`start` against the
  shared stack during this build. The shared stack stays exactly as found
  (head `00574`) until the integration steward resets it to bring Wave 1's
  migration in for real.
- **The integration steward owns the next reset.** When Wave 1 lanes are ready
  to integrate, the integration steward resets the shared local stack (picking
  up `00575_agreement_parts.sql` for real, replaying seeds), not any individual
  lane.

---

## Integration steward reset — 2026-09-06

**The integration steward is taking the stack now.** Wave 1's three lanes are
merged onto `agreement/w1-integration` in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(merge commits `488391a8c` backend → `e98964d20` designer → `679f08773` client).

- Stack state immediately before this reset: running, head `00574`
  (`select version from supabase_migrations.schema_migrations order by version
  desc limit 3` → `00574, 00573, 00572`), `supabase_edge_runtime_supabase` and
  `supabase_pooler_supabase` stopped — exactly as `env.md` recorded it.
- `supabase db reset` is being run from the **integration worktree** so the
  replay picks up `00575_agreement_parts.sql` and the regenerated
  `supabase/seed/00-legacy-grants.sql`. Expected head after the reset: `00575`.
- **No other agent may reset, seed, stop, or start the shared stack from this
  point on.** Scratch-DB validation (`patina_w1*`) is finished; every remaining
  Wave 1 gate runs against the shared `postgres` database.
- The stack is left running at head `00575` for the designer/client walk — see
  `walk-env.md` in this directory for the boot recipe.

---

## Integration steward reset — round 2, 2026-09-06 (after lane rounds 4–5)

The three lanes advanced past the heads the first integration merged (backend
round 4, designer's independent-review fixes, client rounds 4–5). The integration
branch has therefore been re-merged onto the current `origin/main` tip
`3a9472f92`, and **the steward is taking the stack again**.

- Stack state immediately before this reset: running, head `00575` — the body
  left by the first integration reset, which is now stale relative to the
  backend lane's round-4 edits to `00575_agreement_parts.sql` (`+515 / −…` on
  that file since). This is exactly the drift `env.md` and the backend round-4
  review warned about.
- `supabase db reset` is run from the **integration worktree**
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`, so
  the replay picks up the round-4 body of `00575_agreement_parts.sql` and the
  regenerated `supabase/seed/00-legacy-grants.sql`. Expected head after the
  reset: `00575`.
- No scratch databases remain (`select datname from pg_database where datname
  like 'patina%'` → 0 rows); every lane's `patina_w1*` scratch DB was dropped.
- **No other agent may reset, seed, stop, or start the shared stack from this
  point on.** Every remaining Wave 1 gate runs against the shared `postgres`
  database on 54322.
- The stack is left running at head `00575` for the designer/client walk — see
  `walk-env.md` in this directory for the boot recipe.

---

## Close-out fix lane reset — 2026-09-07

**The close-out fix lane (R22–R29) took the stack twice, and owns it now.**
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`,
branch `agreement/w1-integration`, head at the start
`f1b0c31f16b1228de24cac55078b96a2a03538ba`.

The rulings changed `supabase/migrations/00575_agreement_parts.sql` (R22's fee
predicate and its four call sites, R25's `composed` key on the client bundle,
R28's seeding rule) and `supabase/seed/the-client-page.sql` (R26's composed
fixture), so the stack HAD to be reset — an unreset stack would have carried
the pre-R22 bodies while the file on disk said otherwise, exactly the drift the
round-2 entry above warns about.

- **Reset 1** (mid-lane, to validate the edits):
  `supabase db reset --workdir <this worktree>` → "Finished supabase db reset on
  branch main", head `00575 / 00574 / 00573`.
- **Reset 2** (the gate run, at the final tree): same command, same result. The
  composed fixture was probed out of the database rather than inferred —
  `proposal_agreement_parts` for `b0000000-…cb01` returns the seven parts in
  position order, the proposal reads `accepted / executed / design_services`,
  and `get_client_commercial_document_bundle` answers
  `composed: true` with those seven titles.
- `python3 scripts/generate-legacy-grants.py` was re-run (R22 adds one REVOKE);
  the regenerated seed is committed and replays 2233 statements.
- **No other agent may reset, seed, stop, or start the shared stack.** The
  stack is left running at head `00575`, now carrying the close-out bodies and
  the composed agreement the client e2e reads.

---

## Re-gate 2 — 2026-09-07 · read only, NO RESET

The close-out re-gate (head `fb811e603`) **did not reset, seed, stop or start
the stack.** It did not need to: every one of the 19 `CREATE OR REPLACE
FUNCTION` bodies in `00575_agreement_parts.sql` was compared against
`pg_proc.prosrc` and all 19 matched, and the R22/R25/R28 markers were read out
of the catalog rather than the file. The composed seed fixture is present
(`select count(*) from proposal_agreement_parts` → 7).

Everything the re-gate wrote to the database ran inside a transaction that ended
`ROLLBACK` — the probe file, the no-terms-row probe, the R28 seeding probe and
the TRUNCATE reachability probe. No scratch database was created. A client dev
server was run on `:3002` for the e2e and stopped afterwards.

The stack is left exactly as found: running, head `00575`, close-out bodies.

---

## Re-gate 2 fixes — 2026-09-07 · RESET, because 00575 changed

The re-gate-2 fix lane (from head `66649d189`) **did reset the shared stack**,
and says so here because it had to: F6 adds `TRUNCATE` to the R17(c) revoke in
`supabase/migrations/00575_agreement_parts.sql`, which is a grant change, so the
migration was edited in place (still unapplied on Strata, whose head is `00574`)
and the ACL seed regenerated.

- `python3 scripts/generate-legacy-grants.py` — the regenerated
  `supabase/seed/00-legacy-grants.sql` replays 2233 statements; the only diff is
  the two projection-table REVOKEs now carrying `TRUNCATE`.
- `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
  (unsandboxed) → "Finished supabase db reset on branch main"; head afterwards
  `00575 / 00574 / 00573`.
- Probed rather than inferred:
  `has_table_privilege('authenticated','public.proposal_service_terms','TRUNCATE')`
  → `f` (and `f` for `proposal_service_rates`), `SELECT` still `t`. The composed
  seed fixture is back — `proposal_agreement_parts` holds the same seven parts
  in position order (Services · Deliverables · Exclusions · Role rates ·
  Ceiling · Billing cadence · Terms), none of them a deposit, so the client e2e
  assertion is unmoved by F2.
- The R28-amended edit is a comment on the cadence seed line only — no body
  changed, no behaviour moved.

---

## Reset — walk fixes, round 1 (2026-09-07)

**The walk-fix lane reset the shared stack, and says so here because it had to:**
B1, M3 and M4 all change `supabase/migrations/00575_agreement_parts.sql`, and M4
adds a `REVOKE` (the new `_record_paper_client_signature_impl` body), so the
migration was edited in place — still unapplied on Strata, whose head is
`00574` — and the ACL seed regenerated.

- `python3 scripts/generate-legacy-grants.py` — regenerated
  `supabase/seed/00-legacy-grants.sql`, baseline + **2234** replayed statements;
  the only diff against the re-gate-2 seed is the one added `REVOKE ALL ON
  FUNCTION public._record_paper_client_signature_impl(uuid, text, date, uuid)`.
  Re-run after the reset: byte-identical, no further diff.
- `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
  (unsandboxed) → "Finished supabase db reset on branch main."; 33 seed files
  replayed.
- Probed rather than inferred: `agreement_parts_test.sql` PASS 39 asserts from
  the catalog that all four doors carry `_agreement_requires_rate_card`
  (`_issue_design_services_agreement_on_paper`,
  `_record_paper_client_signature_impl`,
  `_sign_design_services_agreement_authorized`, `send_commercial_document`) —
  it was three of four before this reset. The composed client-page fixture is
  back and unmoved (the e2e's seven parts still stand).

**No other agent may reset, seed, stop, or start the shared stack.** It is left
running at head `00575`, carrying the walk-fix bodies.

---

This notice exists per the parallel-work discipline in
`.claude/skills/patina-parallel-work` and the shared-stack lesson in project
memory (`feedback_shared_local_supabase_stack_last_reset_wins.md`): concurrent
resets/seeds against one shared Postgres instance corrupt each other's runs.
