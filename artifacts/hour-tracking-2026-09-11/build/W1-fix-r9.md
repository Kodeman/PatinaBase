# W1 — fix pass, round 9

**Branch** `hour-tracking/server` @ `7b3742732` (worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`), one commit on top of
`15744506d`. 2 files, +270 / −0. `supabase/config.toml` still skip-worktree'd (`git ls-files -v` →
`S`) and in no commit.

| finding | severity in r9 | disposition |
|---|---|---|
| **W1-R9-01** the per-person studio rate lands on a table the whole studio reads; a plain-member designer can mint a priced row for any colleague | MAJOR | **FIXED** (write half, W1's), **+ one leg the finding did not name** (below). Read half recorded as an HT-10-a amendment |
| **W1-R9-02** the rate-preference key ignores the date span | MAJOR | **NOT APPLIED — not in this round's brief.** See "Carried" below |
| every MINOR / NOTE, §W1-R9-00 (HT-3-b) | — | out of this brief's scope; unchanged |

---

## W1-R9-01 — fixed, and one statement wider than the finding asked

### What shipped

`supabase/migrations/00601_classifier_rate_resolver.sql` — **delta 1a**, between delta 1 and
delta 2 exactly where the finding placed it:

```sql
IF auth.uid() IS NOT NULL
   AND NEW.user_id IS DISTINCT FROM auth.uid()
   AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
   AND NOT COALESCE(public.is_org_admin_or_owner(
         (SELECT project.studio_id FROM public.projects AS project
           WHERE project.id = NEW.project_id)), false)
THEN
  RAISE EXCEPTION 'a time entry is logged by the person who worked the hour'
    USING ERRCODE = 'insufficient_privilege';
END IF;
```

Two deliberate departures from the finding's sketch, both measured rather than reasoned:

1. **`current_user` is not in the condition — it cannot be.** The sketch's
   `current_user IS DISTINCT FROM 'postgres'` leg would have made the whole guard **inert**:
   `classify_project_time_entry_authority` is `SECURITY DEFINER`, so inside it `current_user` is the
   function's owner (`postgres`) for *every* caller. That is the same measurement this wave already
   records at `00598:63-64` for its own DEFINER guard. The gate is `auth.uid() IS NOT NULL`, which is
   the migration/seed/service bypass `00317:38-39` and all three of `00599`'s asserts use. (Verified:
   with `current_user` in the condition the refusal never fires; without it, it fires — measured
   both ways, see the probe table below.)
2. **The refusal covers the UPDATE that *introduces* another person's `user_id`**, not only INSERT.
   Measured in the same fixture: an INSERT-only refusal leaves the identical enumeration primitive
   open in two statements — log your own hour (which resolves `none` / NULL for an author with no
   studio rate), then `UPDATE … SET user_id = <colleague>`; `user_id` is in `aac_`'s watched list, so
   the classifier re-prices the row, and delta 5's preservation does not fire because
   `OLD.hourly_rate_cents IS NULL`. Result before the fix: `rate=15000 src=studio_member` on a row
   now attributed to a colleague who logged nothing. **W1-R1-05 is untouched** — that finding is a
   designer *correcting* a teammate's existing entry, where `user_id` does not change, so the
   `NEW.user_id IS DISTINCT FROM OLD.user_id` leg never engages.

The owner/admin exemption is keyed on `projects.studio_id` (the finding's own shape). Note for the
record: no shipped RLS policy lets a studio owner who is *not* the project's designer insert a row
for someone else (`time_entries_studio_insert_own` and the 00484 quartet all carry a
`user_id = auth.uid()` leg), so the exemption is reachable today only for a project whose designer
*is* the studio's owner/admin — which is the shape case (ab5) exercises.

Two postconditions were added to `00601` so a later graft cannot drop either write shape: one on the
exception text, one on `TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id`.

### Measured, through RLS, on a production-shaped fixture

Fixture (all writes as the actor named, `SET LOCAL ROLE authenticated` + a `request.jwt.claims`
sub): studio `S` with an owner, a subject seated `member` and priced **15000** by the owner on HT-3's
own surface, and a **designer who is only a plain `member`** of `S` — seated before her
`studio_designer` grant, so `00295` leaves her owning no workspace (asserted). She creates her own
project **stamped with `S`** through RLS, which `00563`'s authenticated arm permits on active
non-guest membership (it is `00602` that insists on an owner seat, and `00602` never fires here).

| leg | before (`15744506d`) | after (`7b3742732`) |
|---|---|---|
| F1 **control** — the snoop reads the subject's row on `studio_member_rates` | **0 rows** (RLS denies her) | 0 rows |
| F4 — she INSERTs an entry naming the subject's `user_id` | **ALLOWED** → `rate=15000 src=studio_member` | **REFUSED** `42501` · *a time entry is logged by the person who worked the hour* |
| F5 — she logs her own hour (`rate=NULL src=none`), then repoints `user_id` at the subject | **ALLOWED** → `rate=15000 src=studio_member` | **REFUSED** `42501`; her row stays hers, `NULL / none` |
| F6 **control** — the designer corrects the subject's own entry (duration 60 → 90) | ALLOWED | **ALLOWED**, duration 90 |

The probe is transaction-wrapped and rolled back; nothing on the stack was modified outside a
rolled-back transaction.

### The case that pins it

`supabase/tests/billing/time_rate_resolution_test.sql` gains **case (ab)** (self-contained fixture,
`…91xx` ids), six asserts:

- `ab0` / `ab0b` preconditions — the snoop owns no studio; the project carries `S` (or tier 2 never
  runs and the case would assert nothing).
- `ab1` **control** — the colleague's rate row is invisible to her on `studio_member_rates` (if this
  ever goes green-by-accident, the rest of the case is measuring the wrong leak).
- `ab2` / `ab2b` — the mint is refused `42501` and leaves no row.
- `ab3` / `ab3b` — the repoint is refused `42501`; her own row stays hers and unpriced.
- `ab4` / `ab4b` **control (W1-R1-05)** — the designer's correction of the teammate's own entry
  still lands (duration 90) and that row is still priced `15000 / studio_member`.
- `ab5` **control** — an owner/admin of the studio that owns the work may still log on a member's
  behalf, priced by that studio.

**Proved non-vacuous:** with `HEAD~1`'s `00601` body re-applied, the case fails —
`ERROR: FAIL ab2 (W1-R9-01): … Got NO RAISE / the insert succeeded` — and passes again once the
fixed body is applied.

### The read half — recorded, not built

`rulings.md` **HT-10-a** now carries an amendment (dated 2026-09-12, W1-R9-01): the narrowing is
**two policies, not one**. HT-10-a's text names only the 00484-registered rostered SELECT policy,
but `project_time_entries` also carries `time_entries_studio_read` (`00316:237-240`,
`is_studio_comember(p.designer_id)`, no `user_id` leg), which grants every active non-guest
co-member every row of every studio project — notes and the per-person rate included. **W2's `00606`
must narrow both**, and its per-role coverage accordingly reads owner/admin · rostered member ·
plain studio co-member · non-member. The amendment carries the measurement (0 rows on the rate
table, the identical 15000 off the hours row) so W2's brief does not have to re-derive it.

---

## Carried, NOT applied

**W1-R9-02** (MAJOR in r9 — step 2's rate-preference `EXISTS` has no `effective_from` /
`effective_to` legs, so a studio that cannot price today outranks one that can and the hour bills
`$0`; the same key is in `00602`, where the answer is written into `projects.studio_id` for ever) was
**not in this round's brief's enumerated fix list** and is therefore untouched. It is a four-line
edit in two places, unchanged from r8's text, at
`00599_resolve_time_rate_cents.sql:339-343` and `00602_projects_studio_id_on_insert.sql:107-111`
(the `00602` form anchors on `CURRENT_DATE`), plus a case and a `00599` postcondition requiring
`effective_from` inside the `ORDER BY EXISTS`. Dispatchable as-is if the orchestrator wants it in
round 10.

Nothing else from r9 was touched: §W1-R9-00 (HT-3-b) is Kody's ruling, and W1-R9-03 … -15 are
MINOR/NOTE.

---

## Gates (clean stack, `127.0.0.1:54422`, project `patina-hours`)

| command | result |
|---|---|
| `npx supabase db reset --workdir <worktree>` | **clean** — `00595`…`00602` + `20260910152111` applied, every postcondition replayed (including the two new ones), all seeds loaded, `Finished supabase db reset` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | 10 green / **6 unexpected-fail** — the brief's invocation, which omits `-k` (§W1-R9-09, unchanged); with `-k supabase/tests/KNOWN_FAILURES.md` it is **16 / 16**, 0 unexpected, the same six pre-existing files dated 2026-09-11 |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry …` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate …` | **1 / 1 green** — (a)–(aa) **+ (ab)**; `All time_rate_resolution assertions passed.` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f studio_member_rates …` | **1 / 1 green** |
| *beyond the brief:* the whole `rls` directory | 24 / 26 — the two reds (`design_requests_test.sql`, `studio_titles_test.sql`) are **pre-existing**, documented at `supabase/tests/KNOWN_FAILURES.md:114-115` with the identical failure strings, and touch nothing in this wave |
| `python3 <worktree>/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical (this change adds no GRANT/REVOKE) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (exit 0) — no schema change in this round |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | exit **0** |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | exit **0** |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | exit **0** |

## Not done / not verified

- **Nothing on Strata.** No `db push`, no prod probe, no count of live studios with more than one
  member (which would size the passive leg of W1-R9-01) — P-3 still ships the program once after W7.
- **W1-R9-02** — see "Carried" above.
- **The read half of W1-R9-01** is W2's `00606`; recorded as an HT-10-a amendment, not built here.
- **Lane B** is still absent (W1-R4-03, deferred to phase 2), so Done-when #3's render half and
  Done-when #5's printed role remain unverifiable at this commit.
- **Concurrency** — no two-session race of the new refusal against a concurrent `user_id` edit.
- The owner/admin exemption on a project whose `studio_id` is **NULL** resolves to "refused" (there
  is no studio column to be an owner of). That is the narrow side of the choice and no shipped
  caller reaches it; it is not exercised by a case.
