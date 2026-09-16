# W2 — lane A (DB) adversarial review, round 4

**clean = false** — one **MAJOR**, measured end to end on this program's stack. Round 3's **BLOCKER
(W2-R3-01)** is genuinely discharged — I reproduced both legs of its fix and could not manufacture
ARM 2's standing. Round 3's **MAJOR (W2-R3-02)** is **only half discharged**: bound (e) is gated on
`v_designer_id = v_actor`, and ARM 2 admits *any* owner/admin of the named studio — so the designer
seats a second account she controls as `admin` in the workspace `00295` provisions for her, has that
account perform the stamp, and her next hour prices at the 99900 she wrote for herself, with no
employer able to see the project, the hour or the rate. Measured: the designer's own stamp is refused
`42501`; the confederate's succeeds. Everything else this round is MINOR or "note — ruling owed" per
the brief's severity discipline.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **four** commits,
`c71db49d9` + `9f80b0c09` + `3d36ffb6e` + `7e6701490` (round 3's fix). Every line of `00604`–`00607`,
`00563`'s `set_project_studio_id` body (the trigger the stamp's write meets), `00603`'s
`set_project_studio_id_owned`, `00599`'s tier logic, the 00484 registration block and the
re-registered contract row, the hook diff, the regenerated seed and types, all six test files,
`W2-impl.md`, `W2-review-r3.md`, `W2-fix-r3.md`. Lane B (scope lens, `hours-ledger.tsx`, HT-35
band/opt-out, Desk card, `desk-doorway.tsx`, copy deck, Sanity article,
`hours-ledger-scope.test.tsx`, `e2e/document/hours.spec.ts`) is phase 2; its absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — API 54421, Postgres `127.0.0.1:54422`, `project_id
"patina-hours"`. The shared 54321/54322 stack was never touched. No prod anything; nothing was pushed
to Strata.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, every `DO $postcondition$` passed |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected** — the identical W1/r1/r2/r3 baseline, all six aborting in `_countersign_design_services_agreement_impl` (`design services agreement … not found or access denied`). All six are documented verbatim in `supabase/tests/KNOWN_FAILURES.md:97-101`; W2 touches no agreement path. (Correction to r3's line: passing `-k …/supabase/tests/KNOWN_FAILURES.md` did **not** convert them to expected-fail for me — the runner's path normalisation did not match the allowlist's spellings, so the allowlist is decorative from the repo root. The failures are nonetheless the documented ones.) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **3 green / 3** (`time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test` — now ten cases (a)–(l)) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 green / 2** (`project_hours_total_test`, `studio_hours_rollup_test`) |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | clean |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate; full route table printed) |

Run beyond the brief's list, because the stamp is cross-cutting:

| Command | Result |
|---|---|
| whole `tests/rls` directory | **28 green / 30**; the 2 reds are `design_requests_test.sql` and `studio_titles_test.sql`, both documented at `supabase/tests/KNOWN_FAILURES.md:114-115`. `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio.test` all green |
| `tests/edge_api -f public_rpc_authorization_contract` | **RED** at `:171` (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R2-10**, still absent from `KNOWN_FAILURES.md`. Consequence restated below: the re-registered VALUES row at `:548` is **never reached**, so W2's §0.17 discharge is asserted by no green gate |
| `python3 .../scripts/generate-legacy-grants.py` then `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** after regeneration (baseline + 2623 replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** after regeneration |
| commit hygiene — `git show --stat` ×4, `git status --porcelain`, `git ls-files -v \| grep '^S'` | 13 + 3 + 7 + 3 files, all intended; working tree clean; `supabase/config.toml` skip-worktree'd and in none of the four commits; `HEAD == origin/hour-tracking/server` (`7e6701490`); Conventional Commits throughout |

## Program-rule sweep (each checked against the diff and the live DB)

- **no flag** — `grep -iE 'feature_flag|useFeatureFlag|posthog|ComingSoon'` over the added lines of the whole diff: nothing.
- **no backfill** — the only DML in all four migrations is `00605`'s audit `INSERT` and `00606`'s one-project `UPDATE public.projects … WHERE id = p_project_id AND studio_id IS NULL`. `ADD COLUMN IF NOT EXISTS updated_by` lands NULL.
- **additive only** — one nullable column, no type change, no NOT NULL, no default, no index.
- **client-supplied rate discarded** — measured, through the *new* owner/admin write policy as well as the author path: a member's `INSERT … hourly_rate_cents = 99999` stored **15000 / studio_member / 15000**; an owner's `UPDATE … hourly_rate_cents = 88888, rated_amount_cents = 88888, rate_source = 'studio_member'` was refused `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`; an owner's `UPDATE … duration_minutes = 120` re-derived **15000 / 30000**. The guard's watched-column list and its `IS DISTINCT FROM` chain are the same seven columns in both places (§0.8) — verified against the live `pg_get_triggerdef` and `prosrc`.
- **invoiced lock untouched** — `guard_invoiced_time_entry` present verbatim in `pg_trigger`; no file re-creates or routes around it; case (g) of the admin-write suite green.
- **running-timer slot** — zero index DDL in the diff; `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)` verbatim in `pg_indexes`; both aggregates exclude running rows.
- **notes never in a rollup return** — measured on the TYPE: `studio_hours_rollup(…) → TABLE(bucket_key text, bucket_label text, member_id uuid, member_name text, entry_count integer, total_minutes integer, billable_minutes integer, billable_cents bigint, internal_minutes integer)`; `project_hours_total(uuid) → TABLE(minutes integer, billable_minutes integer, amount_cents bigint)`; `information_schema` shows **0** `%note%` columns on `time_entry_ledger`.
- **DEFINER contract (§0.16)** — `project_pricing_studio_id`, `stamp_project_pricing_studio`, `project_hours_total` all `prosecdef = t` with `search_path` pinned, `anon` without EXECUTE, `authenticated` with it; `audit_time_entry_change` REVOKEd from PUBLIC/anon/authenticated/service_role; `studio_hours_rollup` is INVOKER (`prosecdef = f`, HT-38). Two standing deviations: no caller assert on `project_pricing_studio_id` (**W2-R2-07**), no pinned `search_path` on `stamp_time_entry_updated_by` (**W2-R2-18**).
- **no RLS policy keyed on `projects.studio_id`** — live `pg_policy`: the three new policies key on `is_org_admin_or_owner(project_pricing_studio_id(project_id))`; nothing reads the column.
- **00484 quartet** — live quals: delete/update/insert `((user_id = auth.uid()) AND is_project_team_member(project_id))` byte-identical to 00484's registration; `Team can view their project time entries` now carries the same shape (HT-10-a's ruled narrowing), keeping its name, command `r`, `{authenticated}`, permissive flag and postgres ownership. I read 00484's own DO block: it **does** compare the qual, and it passes only because it runs at its own replay point — so the live-state home really is the contract test, which is the file that is red (**W2-R2-10**). I also confirmed the contract test's RPC expectations are explicit signature lists, not "every granted function", so `stamp_project_pricing_studio` needs no registration there.
- **signatures / numbers at the plan's** — `00604`–`00607`; `studio_hours_rollup`'s identity arguments asserted argument-for-argument (`p_studio_id uuid, p_from date, p_to date, p_group_by text, p_user_id uuid, p_project_id uuid`); `time_entries_owner_admin_{read,update,delete}` present; `time_entries_studio_read` kept by name and narrowed.
- **no regression in the composer's path** — measured: a studio OWNER claimed a **teammate's** unbilled hour through `claim_time_entries` (INVOKER) and the row took the invoice id. That is §0.17's stated precondition for trusting the composer, and HT-22's widening delivers it.

## Discharge of round 3

| Round-3 finding | Status |
|---|---|
| **W2-R3-01 · BLOCKER** (ARM 2 manufacturable via `reassign_project_lead`) | **DISCHARGED, measured independently.** Both legs of the fix hold as claimed: as an authenticated attacker, `UPDATE projects SET created_by = <victim designer>` on her own project is refused `P0001 studio_id_not_designer_studio` (00563 raises on any UPDATE that moves `created_by`, and `created_by` **is** in the trigger's `UPDATE OF` list — verified in `pg_get_triggerdef`), and `INSERT INTO projects (designer_id, created_by) VALUES (<victim>, <victim>)` is refused `P0001` too. `reassign_project_lead` writes `designer_id` only. I could find no path by which an outsider produces a sibling in her own org that the victim designer both leads and created — 00602/00603 stamp a *derived* studio only from a single-candidate tier, and the ambiguity bound (c) requires is exactly what stops that stamp. The shipped source pin (`sibling.created_by = v_designer_id`) is in 00606's postconditions. |
| **W2-R3-02 · MAJOR** (ARM 1 lets the member being priced set her own number) | **NOT DISCHARGED — half closed. See W2-R4-01.** The shipped bound (e) refuses the designer-as-actor route (re-measured: `42501 … a designer may name one of the studios that EMPLOY her…`), but it lives inside `IF v_designer_id = v_actor`, and ARM 2 admits any owner/admin of the named studio. The designer authors that caller. Measured end to end. |
| W2-R3-03 / 04 / 05 (MINOR) · W2-R3-06 (note) | Untouched by design, as `W2-fix-r3.md` states. Each re-read and re-confirmed live below. |
| W2-R2-03 … W2-R2-19 | Untouched by design. Re-checked below; two were re-measured. |

---

## Findings

### W2-R4-01 · MAJOR · confidence HIGH (measured end to end, this stack, every write through RLS as the actor)

**Bound (e) — round 3's fix for W2-R3-02 — is gated on `v_designer_id = v_actor`, and ARM 2 admits
*any* owner/admin of the named studio. The designer authors that caller: she seats a second account
she controls as `admin` in the workspace `00295` provisioned for her (consent-free, `Org owners can
insert members`, `role <> 'owner'` permits `admin`), creates her own ARM 2 sibling in it, and has
that account stamp. From that moment her hours price at the number she wrote for herself, and no
employer can see the project, the hour or the rate.**

*Location:* `supabase/migrations/00606_time_entries_studio_read_narrow.sql:345` (`IF v_designer_id =
v_actor THEN` — the gate that makes bound (e) a property of the ACTOR rather than of the
designer/studio pair), with `:279-297` (ARM 2's standing) and `:359-381` (the tier test that never
runs for a non-designer caller). The same claim appears in `W2-fix-r3.md` §W2-R3-02 (*"The tier bound
refuses `W` on **both** arms, so that pivot is closed without a second rule"*) and in the function's
`COMMENT` at `:402-413`.

*Why the claim is false:* the fix closed the pivot for the designer **as actor**. It did not close it
for an actor the designer can create. `stamp_project_pricing_studio` is GRANTed to `authenticated`
and asks only `is_org_admin_or_owner(p_studio_id)` on ARM 2; the confederate needs **no** role, **no**
designer grant, nothing but the seat the workspace's owner writes for her. 00563's own re-validation
does not help: its `current_user = 'postgres'` branch only requires the actor to share an active
non-guest seat in `NEW.studio_id` with the lead designer, which the confederate does by construction.

*Measured (fresh fixture; the designer's shape is the ordinary one HT-3-b records as its own cost —
designer role first, so 00295 provisions the workspace she OWNS, then two plain `member` employer
seats, which makes the employer tier ambiguous and the legacy project `'none'`):*

```
BASELINE   project_pricing_studio_id(legacy project) = NULL        ('none', HT-3-a step 3)
as the DESIGNER, through RLS:
  INSERT organization_members (confederate, her own workspace W, 'admin')   → 1 row (consent-free)
  INSERT studio_member_rates  (W, herself, 99900)                           → 1 row (she owns W)
  INSERT projects (designer = her, created_by = her, studio_id NAMED = W)    → sibling_studio = W
  hour ONE on the legacy project                                            → rate NULL / 'none'
  stamp_project_pricing_studio(legacy, W)   → REFUSED 42501
        "a designer may name one of the studios that EMPLOY her, not one whose rate card she
         writes — a studio she owns or administers only where she holds no employer seat at all"
as the CONFEDERATE (an `admin` of W, no designer role, nothing else):
  stamp_project_pricing_studio(legacy, W)   → SUCCEEDED                      ← the bypass

AFTER  projects.studio_id = W   project_pricing_studio_id(legacy) = W        (PERMANENT, bound (b))
  hour TWO on the same project  → hourly_rate_cents 99900 · studio_member · rated 199800
  employer-one's OWNER:  reads 0 rows of the legacy project
                         project_hours_total → refused 42501
  the confederate:       reads 2 rows, notes = "hour two", hourly_rate_cents = 99900
```

*Why major:* it is the brief's own second clause — it lets a member move her own resolved rate to a
number she set — and HT-3-b's operative sentence verbatim (*"a member can only push the outcome
toward 'none', never toward a number she set"*). Its consequences are also W2-R3-01's: HT-10's studio
read is permanently removed from the employer that did the work, and bound (b) makes the column
final, so nobody can take it back. It needs no new ruling — the orchestrator has twice chosen that
this outcome must not be reachable. The only prerequisite beyond the ordinary state of a Patina
designer is one additional account, which self-serve signup supplies; no third party has to
cooperate.

*Exact fix — the minimal one that changes no shipped test case:* make the dangerous half of bound (e)
a property of **(the designer, `p_studio_id`)** instead of the actor, by hoisting an owner-seat
refusal above the actor gate at `00606:345`:

```sql
  -- (e0) applies to EVERY caller, because the designer can author the caller
  -- (W2-R4-01): a studio whose rate card she writes as its OWNER may price her
  -- only where she holds no employer seat at all.
  IF v_designer_has_employer_seat AND EXISTS (
       SELECT 1
       FROM public.organization_members AS designer_seat
       WHERE designer_seat.organization_id = p_studio_id
         AND designer_seat.user_id = v_designer_id
         AND designer_seat.status = 'active'
         AND designer_seat.role = 'owner'
     ) THEN
    RAISE EXCEPTION 'stamp_project_pricing_studio: a studio this project''s designer OWNS '
                    'may price her hours only where she holds no employer seat at all'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
```

(`v_designer_has_employer_seat` must be computed before the actor gate rather than inside it.) This
refuses the measured manoeuvre — `W` is a studio she owns and she holds employer seats — and leaves
shipped cases (f), (g), (k) and (l) untouched: case (g)'s designer seat in `a1` is `admin`, not
`owner`. Add a case **(m)** running the manoeuvre above through RLS as the confederate, with `k2`-style
preconditions asserting that the consent-free `admin` seat INSERT and the named-studio sibling INSERT
both **succeed** (so the case cannot go vacuous), and verify it FAILS against the current body.

Stricter alternatives, if the orchestrator prefers: (i) apply the **whole** tier test to
`(v_designer_id, p_studio_id)` regardless of actor — this also refuses the "designer is `admin` of
the employer studio, its owner stamps" shape `W2-fix-r3.md` deliberately accepted as residue, so
shipped case (g)'s fixture would have to change; (ii) drop ARM 2 and land HT-3-b arm (c)'s consent
door, which is the only option that also closes **W2-R2-04** and **W2-R4-02**.

### W2-R4-02 · note — ruling owed · confidence HIGH (code + the (f)/(l4) fixtures)

**ARM 1 lets the MEMBER, not the owner, decide which of her employers permanently owns an unstamped
project's hours and money — and the employer that loses it is never told and cannot undo it.** A
designer with two plain-`member` employer seats has an ambiguous tier, so her legacy project is
`'none'`; bound (e) then *permits* her to stamp either employer (neither seat is owner/admin). She
cannot set the number in either, so this is not W2-R4-01 — but she chooses which studio's rate card
prices the work, which studio's books the billable money lands in, and which studio's owner keeps
HT-10's read. Bound (b) makes the choice final. HT-3-b's ruled remedy is *"The **owner** fixes 'none'
by stamping `projects.studio_id`."*
*Question for Kody:* may the designer herself perform the repair at all, or is ARM 1 only for the
sole-proprietor shape HT-3-c arm (a) describes (so that a designer with employer seats must ask an
owner, i.e. ARM 2 or a consent door)? This is **W2-R3-06** sharpened: R3-06 asked about two owners
racing; this asks whether the member is an eligible actor in the first place. No code change until
ruled.

### W2-R4-03 · note — ruling owed · confidence HIGH (code)

**The owned-tier half of bound (e) (`00606:370-374`, `ELSE designer_seat.role = 'owner'`) is justified
in the banner as HT-3-c arm (a)'s *sole proprietor*, but it does not check that she is one.** A
designer who holds no employer seat and OWNS two active studios — the `00295` workspace plus a real
studio she **co**-owns with someone else — is in the owned tier, so her co-owned studio's project
prices `'none'`, and she may stamp the private workspace and write her own rate there. Her co-owner
then reads nothing: not the project, not the hour, not the rate (the same measurement as W2-R4-01's
"AFTER" block, with the co-owner in the employer's place). HT-3-c arm (a) speaks of a studio *"named
at creation"* and of *"a sole proprietor billing her own studio's client"*; neither clause reaches a
post-hoc stamp by a co-owner. `W2-fix-r3.md` names this arm (b) of the finding and correctly calls it
a ruling rather than an implementation — but the shipped code **assumes the ruling went that way**.
*Question for Kody:* does HT-3-c arm (a) extend (i) to a stamp performed after creation, and (ii) to a
designer who co-owns the studio whose client the project is? If not, the owned-tier branch needs an
"only owner of `p_studio_id`, and `p_studio_id` is her only active studio" bound or the consent door.

### W2-R4-04 · MINOR · confidence HIGH (code, in the same file as the fix)

**`00606:97-98` still reads "THIS IS THE ONLY CHANGE IN THIS MIGRATION (risk 5 of plan-v2 §12): it
reverts without touching the ledger view, the rollup or the lens" — and round 3's fix made section (4)
larger, not smaller.** This is **W2-R3-04** unfixed, and `W2-fix-r3.md` says so outright (*"the
sentence is now more wrong, not less"*). Section (4) is now ~250 lines carrying a public RPC, two
grants, a COMMENT and eight postconditions; reverting 00606 to restore the old reads would also delete
the repair path W2-R2-02 required. *Fix:* correct the sentence (the three policy statements are
revertable; the stamp is not part of that revert), or move `stamp_project_pricing_studio` to its own
number from W3's reserved range and say which side moved.

### W2-R4-05 · MINOR · confidence HIGH (code) — carried W2-R3-03, re-stated because R4-01 raises its stakes

**The stamp is the single most consequential, irreversible, money-moving act this wave adds, and it
writes no `audit_logs` row** (`00606:384-389`: `UPDATE … ; RETURN p_studio_id;`), in the same wave that
audits every time-entry UPDATE and DELETE. After a stamp the project's whole ledger, its
`project_unbilled_time`, its invoice composer and (per `00605:165`) the `organization_id` of every
future audit row follow the new studio, and nothing records who moved it. With W2-R4-01 live, the
actor of record would be the confederate, which is precisely the evidence a studio would need. *Fix:*
one `audit_logs` insert inside the function (`action 'project.pricing_studio_stamped'`,
`resource_type 'project'`, `resource_id p_project_id`, `organization_id = p_studio_id`, old/new
values) — the function is already DEFINER, so §0.18's no-INSERT-policy problem does not arise.

### W2-R4-06 · MINOR · confidence MEDIUM (code) — carried W2-R3-05

**The stamp still reports a success it may not have achieved.** `00606:384-389` never reads the row
count, so under a concurrent stamp (or any path that fills the column between bound (b) and the
UPDATE) it returns `p_studio_id` while the column holds another studio. *Fix:* `UPDATE … RETURNING
studio_id INTO v_written;` and return `v_written`, raising when it is NULL.

### W2-R4-07 · MINOR · confidence HIGH (re-measured) — carried W2-R2-08

**`updated_by` is forgeable on INSERT, so HT-23's trace can be a lie on a row nobody ever edited.**
Measured as the author, a plain member: `INSERT INTO project_time_entries (… updated_by) VALUES (…,
'<the studio owner''s id>')` succeeded and the never-edited row reads `updated_by = <the owner>`. On
UPDATE the stamp trigger (which I verified fires last among the BEFORE UPDATE triggers) overwrites it,
so only the INSERT is open. `updated_by` is in neither of the guard's two lists (§0.8) — a defensible
reading, since it is not a commercial-derived column, but the consequence is a forged trace. *Fix:*
add `NEW.updated_by IS NOT NULL` to `guard_commercial_time_entry_derived_fields`'s INSERT refusal
(beside `rate_source` / `rated_amount_cents`), or NULL it in a BEFORE INSERT stamp.

### W2-R4-08 · MINOR · confidence HIGH (re-measured) — carried W2-R2-10, consequence restated

**The 00484 live-state contract is not asserted by any green gate, so W2's §0.17 discharge is
unverified.** `tests/edge_api/public_rpc_authorization_contract_test.sql` aborts at `:171` (W1's
`00602`/`00603` stamping a studio for a non-designer lead), so the re-registered VALUES row at `:548`
— the single artefact that keeps `Team can view their project time entries`' narrowing a *signed*
expectation rather than silent drift — is **never reached**. The file is still absent from
`supabase/tests/KNOWN_FAILURES.md` and from every wave's gate list. *Fix (W1's, not W2's):* resolve the
`:171` expectation per W2-R2-19, and add `tests/edge_api -f public_rpc_authorization_contract` to this
program's gate list so §0.17's discharge is actually exercised once.

### W2-R4-09 · MINOR · confidence HIGH (code) — carried W2-R2-16, with the banner's wrong claim named

**`00607:139-143`'s `project_id IS NULL` leg of `internal_minutes` is unreachable, and the comment
beside it tells a later wave the opposite.** The `scoped` CTE filters `WHERE ledger.studio_id =
p_studio_id`, and `time_entry_ledger.studio_id` is `project_pricing_studio_id(te.project_id)`, which
returns NULL for a NULL `project_id` (`00604:100-102`) — so W4's project-less internal row can never
enter the rollup, whatever `internal_minutes` filters on. The comment *"W4's project-less row, whose
NULL leg is already here so that W4 needs no edit to this function"* is therefore false and will be
trusted. *Fix:* delete the claim, or give the CTE an `OR (ledger.project_id IS NULL AND <the row's own
studio>)` leg when W4's `project_time_entries.studio_id` column lands (W4 `00611`).

### W2-R4-10 · NOTE · confidence HIGH (measured)

**A member cannot read the trace of her own edit; her studio's owner can.** Measured: after one
ordinary self-edit, the author reads **0** `audit_logs` rows for `resource_type =
'project_time_entries'` while the studio owner reads 2. This is `audit_logs`' own two SELECT policies,
not W2's doing, and it may be exactly what HT-23 intends (a trace *for the studio*). Stated so lane B
does not build a "history of this hour" affordance for the member that silently renders empty.

### W2-R4-11 · NOTE · confidence HIGH (measured)

**An owner/admin's attempt to move an hour onto a project in a studio she does not administer is
refused by the rate resolver, not by the policy, and the message is about rates.** Measured:
`UPDATE project_time_entries SET project_id = <project in another studio>` as the studio owner →
`42501 resolve_time_rate_cents: only a studio owner or admin may resolve another member's rate`. The
direction is correct and fail-closed (the classifier fires before the WITH CHECK can), but a lane-B
adjust form that surfaces this verbatim will tell the user the wrong thing. Cosmetic; no DB change
needed if lane B maps it.

### W2-R4-12 · NOTE · confidence MEDIUM (code)

**`billable_cents`/`billable_minutes` and `internal_minutes` can count the same row.**
`00607:137-143`: the billable filter is `keyed.billable`, the internal filter is `source = 'internal'
OR project_id IS NULL`. A row logged `source = 'internal'` with `billable = true` lands in both, and
`total_minutes` counts it once — so a studio bucket can read `total 60 / billable 60 / internal 60`.
Nothing forbids that row today. Lane B's "`— internal —` group" must not be derived by subtraction.

---

## Carried unchanged from rounds 2–3 — each re-checked this round

| id | Severity · confidence | State this round |
|---|---|---|
| **W2-R3-06** | note — ruling owed · HIGH | Live. Two genuine studios both holding ARM 2 standing, first stamp wins, silently, no tie-break and no notice. Rule it with **W2-R4-02**. |
| **W2-R2-03** | note — ruling owed · HIGH | Live; the stamp cannot give Leah the read on a project already stamped (bound (b) is final). |
| **W2-R2-04** | note — ruling owed · HIGH | Live. The consent-free `organization_members` INSERT still moves a designer's tier (and so an owner's read) without her consent — reversible by removing the seat. **W2-R4-01** is what makes a consequence of that same INSERT *irreversible* again. Rule them together. |
| **W2-R2-05** | MINOR · HIGH | Live; `fetchTimeSummary` / `useSectionLoggedMinutes` / `usePhaseActualMinutes` untouched (confirmed against the diff). A rostered member still sees a per-phase under-count after the narrowing. |
| **W2-R2-06** | MINOR · HIGH | Live; `project_pricing_studio_id` is a per-row plpgsql DEFINER call inside three RLS policies and the ledger view, and `useTimeEntryLedger` still has no default `limit` (verified at the hook). No performance measurement this round. |
| **W2-R2-07** | MINOR · HIGH | Live; `00604:84-158` has no caller assert and the function is now called from five places (three policies, the view, the stamp's bound (c)). Measured: an authenticated member gets a studio id back for a project outside her scope-of-interest; it is an org id, not a rate. |
| **W2-R2-08** | MINOR · HIGH (re-measured) | Live → promoted to its own entry, **W2-R4-07**. |
| **W2-R2-09** | MINOR · HIGH (re-measured) | Live. The audit trigger has no `WHEN`; one ordinary self-edit by a plain member writes a full `old_values`/`new_values` row. |
| **W2-R2-10** | MINOR · HIGH (re-measured) | Live → restated as **W2-R4-08**. |
| **W2-R2-11** | MINOR · HIGH (verified) | Live. `apps/designer-portal/src/lib/react-query.ts:309` still defines `studioReport` for the deleted hook. No other reference to `useStudioTimeReport` / `StudioTimeReport` / `StudioProjectRollup` / `StudioTimeEntry` survives outside comments and one test banner. |
| **W2-R2-12** | NOTE · HIGH | Live. `00604:256-257`'s second profiles assert is still a tautology (`NOT LIKE '% join profiles%' OR LIKE '%left join profiles%'`). |
| **W2-R2-13** | note — ruling owed · HIGH | Live. An owner/admin may still rewrite an invoiced entry's `notes` — `guard_invoiced_time_entry`'s own column list, which §0.12 forbids touching on a guess. |
| **W2-R2-14** | note — ruling owed · HIGH | Live, and re-measured from the other side: where the pricing studio is non-NULL, the audit row is readable by the studio's owner/admins and **not** by the author (**W2-R4-10**); where it is NULL, by the actor alone. |
| **W2-R2-15** | NOTE · HIGH | Live. `00604:204` coalesces a missing rate to `0`, so a `'none'` row prints as $0.00 money. Lane B must read `rate_source`, never the amount, to say "rate pending". |
| **W2-R2-16** | NOTE → MINOR · HIGH | Live → restated as **W2-R4-09** because the banner's claim is load-bearing for W4. |
| **W2-R2-17** | NOTE · HIGH | Live. `TimeEntryLedgerRow.project_id` / `user_id` are non-nullable in TypeScript while the view LEFT JOINs `projects` and W4 adds project-less rows. |
| **W2-R2-18** | NOTE · MEDIUM | Live. `stamp_time_entry_updated_by` has `proconfig = NULL` (no pinned `search_path`); it is INVOKER and touches only `auth.uid()` and `NEW`. |
| **W2-R2-19 / `W2-impl.md` finding 1** | note — ruling owed · HIGH | Live and still W1's: `00602`/`00603` stamp a studio for a non-designer lead, which the shipped contract test forbids at `:171`. It is what keeps **W2-R4-08** red. |
| `W2-impl.md` findings 2–5 | acknowledged, unchanged | Three bodies of the pricing rule (asserted-equivalent, not unified); the designer's own read of a colleague's rate on her own project (`Designers manage their project time entries`, live in `pg_policy`, pinned as shipped behaviour in `studio_hours_rollup_test` case (f4)); `project_hours_total`'s three legs; the admin/resolver key divergence, now closed. |

## Done-when, probed independently (not read off the tests)

- *"Opening a project's lens as the owner shows that house's hours with every member named, not her own"* — **measured.** The owner read two ledger rows: `R4c Designer / 120 min / rate 25000 / amount 50000` and `R4c Mate / 60 min / rate 15000 / amount 15000`, each priced at **her own** rate; `studio_hours_rollup(studio, …, 'member')` returned a bucket per member with the matching money. **Caveat:** on an *unstamped, ambiguous-tier* project she reads 0 until somebody stamps it, and the stamp's standing is **W2-R4-01**.
- *"A plain `member` sees no lens and, after 00606, no studio-mate's row on a non-rostered project"* — **measured.** The mate read **1 of 2** rows on a shared project (her own), **0** of the designer's; aiming `p_user_id` at the designer returned **no bucket**; her unscoped rollup returned exactly **1** bucket. The live quals carry `user_id = auth.uid()` on both SELECT policies.
- *"An admin adjust writes one `audit_logs` row carrying `old_values` and `new_values`; the row's `updated_by` is the admin"* — **measured.** One row, `action time_entry.updated`, actor = the owner, `organization_id` = the pricing studio, both value sets present; `updated_by` = the owner. Forgeable on INSERT (**W2-R4-07**).
- *"`\d+ studio_hours_rollup` shows no `notes` in the return type"* — **measured on the TYPE** for both functions and on `information_schema` for the view.
- HT-10-a's payoff — **measured.** A member who is rostered (00597's auto-roster seat fires on her own INSERT) reads 1 of 2 rows and still gets `project_hours_total = 180 minutes / 65000 cents`, the whole project.
- `/desk?sheet=hours`, the copy deck, the Sanity article, the lens, the disclosure band — **lane B, not reviewed.**

## What I did not verify

- **Lane B, entirely** — phase 2, by scope, not a finding.
- `pnpm --filter @patina/designer-portal test` / `lint` and the `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` e2e line — outside the brief's gate list and lane-B-shaped.
- **Concurrency and volume.** No two-simultaneous-stamp race (W2-R4-06 rests on the code); no performance measurement of W2-R2-06.
- **The ownership-transfer route into W2-R4-01.** I measured the `admin`-seat route only. Whether a designer can also hand a confederate an `owner` seat in her workspace through the ownership-transfer RPC was not tested; it would not change the finding.
- **No prod anything.** Every command ran against `127.0.0.1:54422`. Nothing was pushed to Strata. W1's constraint stands (W1 must not reach Strata ahead of 00606). **The Strata population of `projects.studio_id IS NULL` is still uncounted** — it is the exact population W2-R4-01, W2-R4-02, W2-R4-03, W2-R2-02 and W2-R2-04 all turn on, and it should be one read-only count before any deploy decision. Third round asking.
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched. My probe scripts live in the session scratchpad, not in the repo.
