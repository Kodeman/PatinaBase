# W2 — lane A (DB) adversarial review, round 2

**clean = false** — two MAJOR. (clean = zero blocker/major. No blocker. Round 1's only blocker, **B1**, is
discharged on the surface it was written against and measurably **not** discharged on a second surface the fix
did not move — finding **W2-R2-01** — and the fix's own accepted trade turns out to have no repair path in the
product — **W2-R2-02**. Everything else is minor or "note — ruling owed", per the brief's severity discipline.)

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = two commits, `c71db49d9`
(W2 lane A) + `9f80b0c09` (the B1 fix). Every line of `00604`–`00607`, the hook diff, the re-registered
contract row, the regenerated seed and types, the four new test files, `W2-impl.md`, `W2-review-r1.md`,
`W2-fix-r1.md`. Lane B (scope lens, `hours-ledger.tsx`, HT-35 band/opt-out, Desk card, `desk-doorway.tsx`,
copy deck, Sanity article, `hours-ledger-scope.test.tsx`, `e2e/document/hours.spec.ts`) is phase 2; its
absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — API 54421, Postgres `127.0.0.1:54422`, `project_id "patina-hours"`.
The shared 54321/54322 stack was never touched. No prod anything; nothing was pushed to Strata.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.` All four migrations replayed; every `DO $postcondition$` passed (incl. the fix's new impersonated fail-closed assert) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected-fail (incl. `time_entry_ledger_test.sql`, and W1's `time_rate_resolution_test.sql` unchanged) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected-fail as the brief invokes it** — identical to W1's and round 1's baseline; all six abort inside `_countersign_design_services_agreement_impl` (`design services agreement … not found or access denied`). Re-run from the worktree with `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (all six documented at `KNOWN_FAILURES.md:97-101`). Unchanged by W2 |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **2 green / 2** (`time_entry_admin_write_test.sql` incl. the fix's case (i), `time_entry_auto_roster_test.sql`) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 green / 2** (`project_hours_total_test.sql`, `studio_hours_rollup_test.sql`) |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | clean |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate; route table printed) |

Run beyond the brief's list, because the narrowing is cross-cutting:

| Command | Result |
|---|---|
| whole `tests/rls` with `-k supabase/tests/KNOWN_FAILURES.md` | **27 green + 2 documented = 29 / 29**, 0 unexpected (`00563_proposal_signing_multi_studio.test.sql`, `project_roster_test.sql`, `studio_member_rates_test.sql`, `people_directory_scope_test.sql` all green) |
| whole `tests/document` / `tests/field` / `tests/security` (same `-k`) | **17/17 · 6/6 · 1/1**, 0 unexpected |
| `tests/edge_api` | **3 green / 8**. Four reds are documented local-image EVENT 3 residuals (`KNOWN_FAILURES.md:35-56`: `catalog_roles_test`, `catalog_roles_remote_conformance_test`, `platform_acl_compatibility_test`, plus the negative test which needs `-v HOST -v PORT`). The fifth, `public_rpc_authorization_contract_test.sql`, aborts at `:171` — finding **W2-R2-10** (carried m6) |
| `python3 …/agent-server/scripts/generate-legacy-grants.py` then `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** after regeneration (baseline + 2621 replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm --dir …/agent-server db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** after regeneration |
| commit hygiene — `git show --stat` ×2, `git status --porcelain`, `git ls-files -v \| grep '^S'` | 13 files then 3 files, all intended; working tree clean; `supabase/config.toml` skip-worktree'd and in neither commit; `origin/hour-tracking/server == HEAD` |
| migration-number sweep across every local head + remote ref (`git ls-tree` per ref over `006(0[4-9]\|1[0-9]\|20)_`) | `00604–00607` on `hour-tracking/server` only; the sole other number in the band is lane D's `00614_time_nudges_cron.sql` on `hour-tracking/edge`. **No collision** |

## Program-rule sweep (each checked against the diff and the live DB, not assumed)

- **no flag** — `grep -Ei 'feature_flag|useFeatureFlag|posthog|ComingSoon'` over `0060[4-7]*.sql`: nothing.
- **no backfill** — no `UPDATE`/`INSERT` DML against `project_time_entries` in any of the four files (`ADD COLUMN IF NOT EXISTS updated_by` lands NULL; P-4 intact).
- **additive only** — the table gains one nullable column, nothing else; no type change, no NOT NULL, no default.
- **client-supplied `hourly_rate_cents`** — W2 adds no rate-writing path; W1's discard still measured live (a fixture INSERT carrying `rated_amount_cents = 50000` came back re-rated by the classifier).
- **invoiced lock untouched** — `guard_invoiced_time_entry` still present (00605 postcondition + `pg_trigger`); case (g) of the admin-write test proves it raises for the owner; no file re-creates or routes around it.
- **running-timer slot** — no `CREATE INDEX`/`DROP INDEX` anywhere in the four files; `uniq_project_time_entries_running_timer` untouched; `studio_hours_rollup` and `project_hours_total` both exclude `duration_minutes IS NULL`.
- **notes never in a rollup return** — measured on the TYPE: `studio_hours_rollup` → `TABLE(bucket_key text, bucket_label text, member_id uuid, member_name text, entry_count integer, total_minutes integer, billable_minutes integer, billable_cents bigint, internal_minutes integer)`; `project_hours_total` → `TABLE(minutes integer, billable_minutes integer, amount_cents bigint)`. The ledger view carries no `notes` column either.
- **DEFINER contract (§0.16)** — `audit_time_entry_change` REVOKEd from PUBLIC/anon/authenticated/service_role; `project_pricing_studio_id` + `project_hours_total` REVOKEd from PUBLIC/anon, GRANTed to authenticated; `studio_hours_rollup` is INVOKER (HT-38); `anon` holds nothing on `time_entry_ledger` (`relacl = {postgres,authenticated,service_role}`, `has_table_privilege('public',…)` = f). All pin `SET search_path`. Two deviations: no caller assert on `project_pricing_studio_id` (**W2-R2-07**, carried m2), no `SET search_path` on the new INVOKER `stamp_time_entry_updated_by` (**W2-R2-18**).
- **no RLS policy keyed on `projects.studio_id`** — the three new policies key on `is_org_admin_or_owner(project_pricing_studio_id(project_id))`. This is the §0.13 question the fix argues deliberately, and the fail-closed direction is measured inside 00605 under an impersonated real actor. I accept the reading: the prohibition exists because a legacy NULL **widens**, and here NULL resolves to `is_org_admin_or_owner(NULL)` = false. It does, however, have a consequence the banner states as repairable and which is not — **W2-R2-02**.
- **§0.8 both-places guard list** — W2 adds no derived money column; `updated_by` is in neither list, which is the hole in **W2-R2-08**.
- **00484 registration contract** — the quartet keeps all four names, commands, role sets, permissive flags and postgres ownership (00606 postconditions (b)/(c) + `pg_policy`); the three write quals are byte-identical; the re-registered VALUES row at `public_rpc_authorization_contract_test.sql:548` is character-for-character the live qual. 00484's own DO block asserts the qual byte-wise and passes at its own replay point (it runs before 00606). The device is right; the file it lives in is red before it reaches that row — **W2-R2-10**.
- **HT-3-a/b** — re-measured independently of the implementer's test on five shapes: one employer + one owned → employer; two employers → NULL; owned only → owned; guest/suspended/manufacturer seats → NULL; studio NAMED on an ambiguous-tier designer → the named studio (HT-3-c arm (a)).

## Discharge of round 1

| Round-1 finding | Status |
|---|---|
| **B1 · BLOCKER** (self-grantable owner/admin read + UPDATE + DELETE) | **Discharged on the stamped-project surface, measured.** Fresh fixture, every write through RLS: attacker owning only her own org seats the victim project's designer in it (`INSERT 0 1`, consent-free), and still reads **0** rows, cannot UPDATE, cannot DELETE, and `project_pricing_studio_id` still answers the real studio. **Not** discharged on two others: the DEFINER aggregate (**W2-R2-01**) and the legacy NULL-studio sole-proprietor arm, which now includes DELETE (**W2-R2-04**). And the fix's accepted trade has no repair path (**W2-R2-02**) |
| m1–m7, n1–n6 | Deliberately untouched by `W2-fix-r1.md`. All re-verified as still live and carried below with their round-1 ids named |

---

## Findings

### W2-R2-01 · MAJOR · confidence HIGH (measured end to end)
**The B1 fix moved the three policies but not `project_hours_total`'s third standing leg, which is the same
self-grantable predicate — so one consent-free `organization_members` INSERT still buys a stranger a project's
whole minutes and billable money.**

*Location:* `supabase/migrations/00607_studio_hours_rollup.sql:181-189` (the third `EXISTS` of the standing
assert), justified at `:168-173`.

*Why it is live:* the leg is *"an owner/admin of **any** studio the project's designer actively belongs to"* —
verbatim the predicate `9f80b0c09` deleted from `time_entries_owner_admin_read/_update/_delete` because
`Org owners can insert members` (00484-registered, `WITH CHECK (is_org_admin_or_owner(organization_id) AND
role <> 'owner')`, no consent gate, `status` DEFAULT `'active'`) lets the attacker author that set. The
comment's justification — *"each of them can already sum these rows with a plain SELECT … (00177:136-137 and
00606's `time_entries_owner_admin_read`)"* — was true when round 1 accepted it as `W2-impl.md` finding 4 and
is **false after the fix**: the read policy now keys on the pricing studio, so this leg admits a strictly
wider set than any SELECT policy grants.

*Measured (fresh fixture, every write through RLS; the project NAMES its studio, so HT-3-a step 1 answers and
the W1 pricing residue is excluded by construction):*

```
attacker A owns only her own org S_A; project P (designer D, studio_id = S_R), one 120-min billable hour
at D's studio rate 25000 → rated 50000.
as A, before:  SELECT … project_hours_total(P)  → refused, insufficient_privilege          (correct)
as A:          INSERT INTO organization_members (user_id, organization_id, role)
                 VALUES (D, S_A, 'member');                                    -- INSERT 0 1
as A, after:   rows of P she can SELECT               = 0      (the B1 fix holds for rows)
               project_pricing_studio_id(P)           = S_R    (step 1, unmoved)
               project_hours_total(P)                 = minutes 120 | billable 120 | amount_cents 50000   ← LEAK
```

*Why major, not a note:* HT-10-a's ruled text is *"one small SECURITY DEFINER `project_hours_total(p_project_id)`
… asserting `is_project_team_member`"*, and HT-10's is *"Members read own rows plus aggregates on rostered
projects"* — a non-member getting aggregates on a non-rostered project, by her own unilateral act, contradicts
both. It needs **no new ruling**: the fix is the predicate the orchestrator already chose in round 1.

*Exact fix* — replace the third leg with the same key the three policies now use:

```sql
    OR public.is_org_admin_or_owner(public.project_pricing_studio_id(p_project_id))
```

*Verified:* with that one leg substituted (in a rolled-back transaction), the shipped per-role suite
`supabase/tests/rls/project_hours_total_test.sql` stays **green on every case** — (a) rostered member still
gets 210/180/50000 while reading 3 of 4 rows, (b) the plain-member designer, (c) owner **and** admin still get
210, (d)(e)(f) unrostered co-member / guest / other studio's owner still `42501`, (g) shape + DEFINER, (h)
running excluded — and the leak above closes (`AFTER: refused — no leak`). Add a case to that file in the
shape of `time_entry_admin_write_test.sql` case (i): the seat INSERT succeeds, the total stays refused.

### W2-R2-02 · MAJOR · confidence HIGH (measured)
**The B1 fix's accepted trade has no repair path: no authenticated caller can stamp `projects.studio_id`, so
the owner/admin studio read HT-10 grants is now permanently absent on every legacy NULL-studio project and
every ambiguous-designer-tier project.**

*Location:* `00605:55-58` and `00606:49-51` (both banners: *"loses her studio read **until she stamps the
project**"*), resting on HT-3-a's ruled sentence *"The owner fixes 'none' by stamping `projects.studio_id`"*.

*Measured:* a studio owner who is also the project's designer, on her own legacy `studio_id IS NULL` project:

```
as her, through RLS:  UPDATE projects SET studio_id = <her studio> WHERE id = <P>
  → REFUSED  P0001 studio_id_not_designer_studio   (set_project_studio_id, live head 00563)
  → projects.studio_id still NULL
```

`set_project_studio_id`'s authenticated arm raises unless `TG_OP = 'INSERT'` (live `prosrc` lines 49-72), so
the column is immutable for every `authenticated` session after the row exists — designer, studio owner and
admin alike. And there is no second path: no function in `public` writes `projects.studio_id` except
`set_project_studio_id` itself and `reassign_project_lead` (which *requires* a non-NULL `studio_id`:
`IF v_studio_id IS NULL … RAISE`), and `grep` over `apps/*/src` and `packages/supabase/src` finds no
`projects` write touching the column at all. Measured consequence, same fixture as **W2-R2-04**: on a legacy
NULL-studio project the author reads her own hour and **nobody else in the studio reads any of it** — not
through `project_time_entries`, not through `project_unbilled_time` (so the invoice composer is empty), not
through `time_entry_ledger`, not through `studio_hours_rollup`.

*Why major, not a note:* HT-10 in force grants the owner/admin the studio read; as shipped it is withheld on a
whole population of projects with no act available to her, which is a contradiction rather than a trade, and
the banners assert the opposite. Fixing it does **not** require a new ruling — it requires implementing the
remedy HT-3-a's ruled text already names.

*Exact fix (either, stated so the orchestrator can choose):*
(a) ship the stamp as a small owner/admin RPC in a new migration — `public.stamp_project_pricing_studio(
p_project_id uuid, p_studio_id uuid)`, SECURITY DEFINER, `SET search_path`, REVOKE from PUBLIC/anon, GRANT to
authenticated, asserting **both** `public.is_org_admin_or_owner(p_studio_id)` **and** 00563's own bound (the
project's `designer_id` holds an `active`, non-`guest` seat in `p_studio_id`, and `organizations.type =
'design_studio' AND status = 'active'`), writing the column as the definer so `set_project_studio_id`'s
authenticated arm is not reached — plus a per-role SQL case (owner stamps; plain member refused; a studio the
designer does not belong to refused); **or** (b) rule explicitly that an unstamped project's hours are
owner-invisible until a migration stamps them, and correct both banners (they currently promise a repair that
does not exist).

### W2-R2-03 · note — ruling owed · confidence HIGH (measured)
**HT-3-c arm (a) was ruled on the basis that *"W2's composer and the studio settings page are where a
suspicious `studio_member_rates` row is seen"*. After the B1 fix the employer studio's owner sees nothing at
all on such a project.**

*Measured (the program's own customer shape; every write through RLS, no attacker, no manoeuvre):* Leah owns
`S`; her hire `H` is `admin` of `S` and owner of the workspace `W` that 00295 provisioned at her designer
grant; Leah prices `H` at 20000 in `S`, `H` prices herself 99900 in `W`; `H` creates the project naming `W`
(HT-3-c arm (a), allowed by 00563) and logs two hours:

```
the hour:                       99900 / 199800 / studio_member / authorized
project_pricing_studio_id(P)  = W
as Leah (owner of S):  projects visible = 1   (she can open the Document)
                       project_time_entries = 0 · project_unbilled_time = 0 · time_entry_ledger = 0
                       UPDATE projects SET studio_id = S  → REFUSED studio_id_not_designer_studio
```

So the composer shows her nothing, the Hours sheet shows her nothing, and she cannot re-stamp the project. The
only people who can see the self-set 99900 are `H` (as the project's designer) and the owner/admin of `W`
(= `H`). Before the fix, Leah could read it through the plan's original predicate. *Question for Kody:* does
HT-3-c arm (a) stand with its mitigation sentence struck (nobody but the hire sees the row), does arm (b)
land (a refusal arm in `00602` when the named studio is merely owned by a designer who also holds an employer
seat), or does the **read** policy grow a second leg for employer-studio admins — which re-opens B1's read arm
through the consent-free seat unless HT-3-b arm (c)'s consent door lands first? No code change until ruled;
`ac2` of `time_rate_resolution_test.sql` and 00605/00606's banners move with the answer.

### W2-R2-04 · note — ruling owed · confidence HIGH (measured)
**The residue `W2-fix-r1.md` calls *"coextensive with that one W1 residue"* is measurably wider than W1's: it
now includes **DELETE** of another studio's hours, which no policy permitted before W2.**

*Location:* `00605:63-71` (the banner's residue paragraph) and `00605:202-209` (`time_entries_owner_admin_delete`).

*Measured (fresh fixture, every write through RLS):* sole-proprietor designer `D` (owner of her own studio, no
employer seat anywhere) on a legacy `projects.studio_id IS NULL` project; attacker `A` owns only her own org:

```
as A, before:  rows of D's project she can read = 0
as A:          INSERT INTO organization_members (user_id, organization_id, role) VALUES (D, S_A, 'member');
as A, after:   rows = 1, notes = 'solo note' readable, project_pricing_studio_id(P) = S_A
as A:          DELETE FROM project_time_entries WHERE project_id = P;   → "attacker deleted 1 row(s)"
```

Pre-W2 the delete policies were own-row only (`Team can delete their own time entries`,
`time_entries_studio_delete_own`) plus `Designers manage their project time entries`; an outsider could not
delete. So W1's pinned residue is the *vector*, not the *capability* — destruction of a studio's billing
evidence by an unrelated party is new in W2. *Question for Kody:* accept it as the cost of HT-3-b's employer
tier until arm (c)'s consent door lands; or key the three policies on **step 1 alone** (`projects.studio_id`),
which closes it outright and costs every legacy NULL-studio owner her read — i.e. **W2-R2-02**'s population,
which is why the two findings should be ruled together; or land arm (c). I did **not** add a test asserting
the leak as expected behaviour.

### W2-R2-05 · MINOR · confidence HIGH (measured)
**Three shipped per-project aggregate readouts silently under-report after 00606, and one of them documents
the opposite in its own comment.** HT-10-a's repair gives back the project *total*; these three need a
*per-phase* split, which `project_hours_total` cannot provide.

*Location:* `packages/supabase/src/hooks/use-time-tracking.ts:263-279` (`fetchTimeSummary`, live caller
`apps/designer-portal/src/hooks/use-projects.ts:481`), `apps/designer-portal/src/hooks/use-section-work.ts:229-247`
(`useSectionLoggedMinutes`, R23 work-head), `apps/designer-portal/src/hooks/use-project-lifecycle.ts:124-143`
(`usePhaseActualMinutes`, R80 — its comment reads *"RLS scopes rows to the project's designer/team"*, now false
for a team member).

*Measured:* a project with 180 completed minutes in one phase across two rostered members; the same query the
three hooks issue, as a rostered plain member: `design_development | 60` against the truth `180`. The
Document's phase-actuals column, the work-head meta and the phase-estimates fold therefore show a rostered
member one third of the project's logged effort with no indication that rows are missing.

*Fix:* name the three in the W2 report and pick one of — (i) have them call `project_hours_total` where a total
suffices and label the rest "your hours" rather than the project's; (ii) extend HT-10-a's DEFINER repair with
a phase breakdown (`project_hours_by_phase(p_project_id)` returning `phase_key, minutes` only — no names, no
notes, no rates, same standing assert); (iii) rule that a plain member sees only her own phase actuals. (ii)
is the smallest honest answer and needs no new ruling if the orchestrator reads HT-10's *"plus aggregates on
rostered projects"* as covering it.

### W2-R2-06 · MINOR · confidence HIGH (measured) — round 1's m4, now on the policy path too
**The pricing rule is a per-row plpgsql SECURITY DEFINER call inside an RLS policy *and* inside the ledger
view, so it runs on every row any authenticated caller scans.**

*Location:* `00604:184` (the view's `studio_id`), `00605:191-208` + `00606:121-125` (the three policies),
consumed by `00607:85`.

*Measured* on a synthetic 3000-entry / 10-project studio (triggers off for the fixture only, `ANALYZE`d):

```
SELECT count(*) FROM project_time_entries         as postgres (no RLS)     0.787 ms
SELECT count(*) FROM project_time_entries         as the studio owner     42.515 ms     (~54×)
SELECT count(*) FROM studio_hours_rollup(S, …)    as the studio owner    731.371 ms
```

`EXPLAIN` confirms the shape: `Filter: (… OR is_org_admin_or_owner(project_pricing_studio_id(project_id), …) OR …)`
— unindexable, and each evaluation runs up to three further queries. Extrapolated, a 30k-entry studio's sheet
load is seconds. *Fix:* when W4 lands the trigger-validated `project_time_entries.studio_id` (§0.13), have the
view select the column and the policies key on it, keeping the function for the trigger that fills it; until
then say the cost in 00604's banner and have lane B pass the `limit` `useTimeEntryLedger` already accepts
(it sends none by default).

### W2-R2-07 · MINOR · confidence HIGH (code; measured in round 1) — carried m2, now hotter
**`project_pricing_studio_id` is a GRANTed SECURITY DEFINER function with no caller assert, and it is now an
RLS policy key as well as a view column.** `00604:99-157` (no assert; the choice argued at `:49-54`). Any
authenticated caller who guesses a project uuid learns which organization employs its designer, for a project
they cannot read. Round 1's fix still applies verbatim and still preserves the banner's reasoning — **return
NULL, never RAISE** (a RAISE inside a `security_invoker` view predicate aborts the whole ledger read, and now
also an RLS policy evaluation):

```sql
IF auth.uid() IS NOT NULL AND NOT (
     COALESCE(public.is_project_team_member(p_project_id), false)
     OR v_designer_id IS NOT DISTINCT FROM auth.uid()
     OR COALESCE(public.is_studio_comember(v_designer_id), false)
) THEN RETURN NULL; END IF;
```
placed after step 1's SELECT. **Caution the fix must respect:** the policies call this function, so any leg
added here narrows the owner/admin read too — `is_studio_comember(v_designer_id)` covers an owner/admin of the
pricing studio in every shape I measured, but the change must be re-run against `time_entry_admin_write_test.sql`
and `studio_hours_rollup_test.sql`, not reasoned about.

### W2-R2-08 · MINOR · confidence HIGH (re-measured) — carried m1
**`updated_by` is forgeable on INSERT, so HT-23's trace is attestable only for UPDATEs.** `00605:99-122`
(`stamp_time_entry_updated_by`, BEFORE **UPDATE** only) and `00605:90-97` (the column is in neither of the
guard's two lists — §0.8's both-places rule). Re-measured: as the author, a plain rostered member,
`INSERT INTO project_time_entries (…, updated_by) VALUES (…, '<the studio owner's id>')` succeeds and the row
reads `updated_by = <the owner>` on a row nobody has ever edited, making the column's own COMMENT false and a
"last touched by" readout name an innocent person. *Fix:* add an INSERT arm (`IF TG_OP = 'INSERT' THEN
NEW.updated_by := NULL; RETURN NEW; END IF;`) in a follow-up migration, **or** the §0.8-shaped answer —
`updated_by` into `00600`'s INSERT discard set and into the guard's `BEFORE UPDATE OF` column list.

### W2-R2-09 · MINOR · confidence HIGH (measured) — carried m5
**The audit trigger fires on every UPDATE, not on adjusts.** `00605:183-185` (`AFTER UPDATE OR DELETE … FOR
EACH ROW`, no `WHEN`). Measured: a plain member starting and stopping her own timer writes **one** full
`old_values`/`new_values` pair; `claim_time_entries` is an UPDATE per entry, so a 40-line invoice writes 40
rows, and each classifier re-rate another. HT-23 asks that edits leave a trace; as built `audit_logs` becomes
the busiest table in the product and the admin adjusts the ruling cares about are buried. *Fix (shape):* gate
the insert on `TG_OP = 'DELETE' OR auth.uid() IS DISTINCT FROM OLD.user_id OR (OLD.duration_minutes,
OLD.started_at, OLD.billable, OLD.notes) IS DISTINCT FROM (NEW…)`. Whether a member's own timer stop deserves
a row is a ruling, so it is stated rather than chosen.

### W2-R2-10 · MINOR · confidence HIGH (measured) — carried m6
**The 00484 re-registration 00606's banner leans on is still never executed, and the file is still in no
gate list and no KNOWN_FAILURES entry.** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql`
aborts at `:171` — `ERROR: 00511 must not auto-derive a studio for a non-designer lead` (W1's
`00602`/`00603` stamp, `W2-impl.md` finding 1) — 377 lines above the edited VALUES row at `:548`. I verified
by hand that the registered string is byte-identical to the live qual, so the content is right and the device
is inert. The file is absent from `supabase/tests/KNOWN_FAILURES.md` (the other four edge_api reds are
documented there), so nothing distinguishes it from a fresh regression. *Fix:* add
`scripts/run-sql-tests.sh -d supabase/tests/edge_api -f public_rpc_authorization_contract` to the program's
gate list, and either rule W1's `00603` question or list the file in `KNOWN_FAILURES.md` with the line number
and the owed ruling.

### W2-R2-11 · MINOR · confidence HIGH — carried m7
**An orphaned query key for the deleted hook survives.** `apps/designer-portal/src/lib/react-query.ts:309` —
`studioReport: (period: string) => [...queryKeys.time.all, 'studio-report', period]`. `useStudioTimeReport`
and `timeKeys.studioReport` are gone (grep confirms the only remaining mention anywhere is a comment at
`use-time-tracking.ts:704`); this line is dead code that reads as a live surface. *Fix:* delete the line;
designer-portal `type-check` is the gate.

### W2-R2-12 · NOTE · confidence HIGH — carried n1
**00604's second profiles postcondition still cannot fail.** `00604:256-257` —
`ASSERT v_flat NOT LIKE '% join profiles%' OR v_flat LIKE '%left join profiles%'` is true under both spellings
and also passes if an INNER `JOIN profiles` were added beside a LEFT one. *Fix:* count the joins —
`ASSERT (SELECT count(*) FROM regexp_matches(v_flat,'join (public\.)?profiles','g')) = 1` beside the existing
LEFT assert.

### W2-R2-13 · NOTE — ruling owed · confidence HIGH (measured in round 1) — carried n2
**An owner/admin may rewrite the `notes` of an invoiced entry.** That is `guard_invoiced_time_entry`'s own
design (its message says only notes and detaching the invoice may change) and W2 weakens nothing, but W2 is
the wave that hands the owner the keys. *Question:* once an hour is invoiced, is its narrative frozen too?
No code change until ruled; §0.12 forbids touching the lock on a guess.

### W2-R2-14 · NOTE — ruling owed · confidence HIGH — carried n3 (narrowed by the fix)
**An audit row with `organization_id = NULL` is readable only by its actor.** `00605:151` stamps the pricing
studio; `Org admins can view org audit logs` requires `organization_id IS NOT NULL`, and the only other policy
is `Users can view their audit logs`. After the B1 fix the population narrows to exactly the projects of
**W2-R2-02** (no pricing studio ⇒ only the project's designer can edit at all), so the trace of her edit is
visible to her alone. *Question:* should the trace fall back to a second organization leg when no studio prices
the work? Round 1's second half (a multi-studio designer's acting admin differing from the stamped studio) is
dissolved by the fix.

### W2-R2-15 · NOTE · confidence HIGH — carried n4
**`resolved_rate_cents` coalesces a missing rate to `0`,** `00604:204`, which is what a genuine zero looks
like. HT-26 wants "rate pending", never a blank and presumably never a confident `$0.00`. `rate_source` is on
the view so lane B *can* distinguish; either drop the COALESCE (leave NULL and coalesce only inside the money
expression) or say in the view's COMMENT that `rate_source` is the only honest test. Worth settling before
lane B renders the column.

### W2-R2-16 · NOTE · confidence HIGH — carried m3
**`internal_minutes`' `project_id IS NULL` leg is dead and 00607's "W4 needs no edit here" is false.**
`00607:134-135` against `00607:85` (`WHERE ledger.studio_id = p_studio_id`) and `00604:100-102`
(`IF p_project_id IS NULL THEN RETURN NULL`): a project-less row gets `studio_id = NULL`, and `NULL =
p_studio_id` is never true, so the scope filter drops it before the FILTER sees it. (`project_id` is still
`NOT NULL` today — measured — which is why this lands in W4.) *Fix:* delete the leg and the banner sentence
now so W4 inherits an honest TODO, or make the scope clause read the row's own studio once W4 adds the column.

### W2-R2-17 · NOTE · confidence HIGH — carried n6
**Hook types are narrower than the view.** `TimeEntryLedgerRow.project_id: string` and `user_id: string` are
non-nullable (hand-written, not generated) while the view emits a NULL `project_id` the moment W4 lands
project-less internal time. One-line change now (`project_id: string | null`) saves a W4 type break.

### W2-R2-18 · NOTE · confidence MEDIUM
**The new INVOKER trigger function does not pin `search_path`.** `00605:99-111` —
`stamp_time_entry_updated_by` has `proconfig = NULL`, while the nearest sibling in the same trigger family,
`guard_commercial_time_entry_derived_fields`, is also INVOKER and **does** pin `search_path=public, pg_temp`
(only 00177's `guard_invoiced_time_entry` does not). Low risk as written — the body resolves nothing but
`auth.uid()`, which is schema-qualified — but the convention is worth keeping. *Fix:* add
`SET search_path = public, pg_temp` in the same follow-up migration as **W2-R2-08**.

### W2-R2-19 · NOTE · confidence HIGH (reproduced, not diagnosed)
**`W2-impl.md` finding 1 stands unchanged and is still W1's.** I reproduced the red (`:171`, above) and agree
it is not W2's work: W2 adds no trigger on `projects`. It is, however, exactly why **W2-R2-10** matters — the
signed RPC/policy contract is unguarded for every remaining wave while that file is red and unlisted.

---

## What I did not verify

- **Lane B, entirely** — no scope lens, no `hours-ledger.tsx` change, no HT-35 band or opt-out, no Desk card,
  no `desk-doorway.tsx`, no copy deck, no Sanity article, no `hours-ledger-scope.test.tsx`, no
  `e2e/document/hours.spec.ts`. Phase 2, by scope, not a finding.
- `pnpm --filter @patina/designer-portal test`, `… lint`, and plan §3's
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live … e2e/document/hours.spec.ts` line — outside my brief's gate
  list and all three lane-B-shaped. I did confirm by grep that nothing outside the deleted hook references
  `useStudioTimeReport` / `StudioTimeReport` / `StudioProjectRollup` / `StudioTimeEntry`, and that
  `isInvoiceEligibleTimeEntry`, `studioPeriodStartISO` and `StudioPeriod` all still have live callers.
- **No prod anything.** Nothing was pushed to Strata; every command ran against 54422. W1's constraint stands:
  W1 must not reach Strata ahead of 00606. I did not measure how many Strata projects carry a NULL
  `studio_id` — the population **W2-R2-02** and **W2-R2-04** turn on. Worth one read-only count before the
  single deploy.
- **Concurrency and volume.** No two-simultaneous-adjust test; the numbers in **W2-R2-06** come from one
  synthetic 3000-row fixture on this machine, not from a production-shaped workload.
- `supabase/config.toml` untouched and still skip-worktree'd; I staged and committed nothing.
