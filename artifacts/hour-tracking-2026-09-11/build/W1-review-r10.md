# W1 — adversarial review, round 10

**clean = false**

Two MAJOR findings are charged to lane A: one NEW and measured this round (**W1-R10-01** — HT-3-a
step 1 reads a caller-supplied column, so a plain-member designer picks the studio that prices her
own client-billed hour), one **carried unfixed for the fourth round** (**W1-R10-02** = r9's
W1-R9-02, the date-blind rate-preference key, re-measured 2/2 with a negative control). A third
MAJOR (**W1-R10-03**, the read half of W1-R9-01) is routed to W2's `00606` by the HT-10-a amendment
and is **not** charged to lane A, but it is a hard precondition on the program's single deploy.

**Reviewed** `hour-tracking/server` @ `7b3742732` (worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`), 14 commits / 16 files /
+6388 −11 against `origin/hour-tracking/integration` (head `00597`). Scope: **lane A DB only**;
lane B is phase 2 and is not counted. Every migration read line by line; every probe runs through
RLS as the named actor inside a transaction that is rolled back.

---

## Discharge of round 9's blocker/major findings

| r9 finding | r9 severity | disposition verified this round |
|---|---|---|
| **W1-R9-01** — a plain-member designer mints a priced row for any colleague / repoints her own row at one | MAJOR | **WRITE HALF DISCHARGED.** Independently re-measured 4/4 with two controls (below). No bypass found across four write shapes. |
| **W1-R9-01, read half** | (recorded as an HT-10-a amendment) | **NOT BUILT — W2's `00606`.** Re-measured open this round: see **W1-R10-03**. |
| **W1-R9-02** — the rate-preference key ignores the date span, in `00599` and in `00602` | MAJOR | **NOT FIXED** (the fix pass says it was out of its brief). Re-measured 2/2 with a negative control: see **W1-R10-02**. |
| **§W1-R9-00 / HT-3-b** | blocker-class governance | unchanged; `rulings.md` carries it as OWED and cases (aa)/(aa5)/(aa6) pin it. Not charged. Partly **superseded in scope** by W1-R10-01, which HT-3-b's candidate fix (c) does not reach. |
| W1-R9-03 … -15 | MINOR / NOTE | **all carried unchanged.** `git show 7b3742732` is +270/−0 over two files and touches only `00601`'s delta-1a block, two postconditions, and test case (ab) — so every region those findings name is byte-identical. |

### W1-R9-01's write half — re-measured independently (probe `probe_r10d.sql`)

Fixture built from scratch, all writes through RLS as the actor named: studio `S`; an owner; a
**snoop** seated `member` of `S` *before* her `studio_designer` grant (so `00295` leaves her owning
no workspace — asserted, 0); a **subject** seated `member` and priced **15000** by the owner on
HT-3's own surface. The snoop creates her own project aimed at `S` (permitted — see W1-R10-01).

```
precondition: snoop owns 0 studios                                        (want 0)
F1 control : snoop reads 0 rows of the subject's rate row                 (want 0) — RLS denies her
F4         : INSERT an entry naming the subject    → REFUSED 42501 "a time entry is logged by the person who worked the hour"
F5         : log her own, then UPDATE user_id      → REFUSED 42501  (same)
F5b  NEW   : UPDATE user_id + duration_minutes in ONE statement → REFUSED 42501
F5c  NEW   : repoint a NON-BILLABLE (rate-less) row             → REFUSED 42501
F6 control : designer corrects the teammate's OWN duration 60→90 → ALLOWED, duration now 90   (W1-R1-05 intact)
F6 residue : the teammate's own row still reads 15000 / studio_member, and the snoop CAN READ IT  → W1-R10-03
```

F5b and F5c are bypass shapes r9's fix pass did not report; both are refused. The refusal is in
`00601:237-246`, gated on `auth.uid()` (not `current_user`, which is `postgres` inside a DEFINER
function), exempting only `is_org_admin_or_owner(projects.studio_id)`, and pinned by two
postconditions at `00601:589-594`. No DB rail writes `project_time_entries` (`grep` over
`supabase/migrations/*.sql`: zero `INSERT INTO … project_time_entries`), so the new refusal cannot
break a server path.

---

## Findings

### W1-R10-01 · MAJOR (blocker-class; governance **and** a missing pin) · confidence HIGH (measured 1/1, two controls in the same fixture) · HT-3-a step 1 reads a CALLER-SUPPLIED column: a plain-member designer picks the studio that prices her own client-billed hour, and `00602`'s ownership-only stamp never runs

**Where.** `00599:289-292` + `:329-347` (step 1 is `projects.studio_id`, read before the
ownership-only fallback) and `00602:94-96` (`IF NEW.studio_id IS NOT NULL … RETURN NEW` — the stamp
is skipped the moment the caller supplies the column). The permission that makes the column
caller-chosen is `set_project_studio_id` (00317 → 00511 → **00563**), whose authenticated-INSERT arm
requires only that the **actor** hold an `active`, non-`guest` membership of the named studio —
`membership.role <> 'guest'`, **never `= 'owner'`** (read from `pg_get_functiondef`, lines 52-75 of
the live body).

HT-3-a's ruled text, `00599:121-126` and `00602:47-53` all justify trusting step 1 on the ground
that *"00317's anti-aiming guard … refuses a user-context write that points a project at a studio
its lead designer does not actively belong to, which is what makes the column trustworthy as a
pricing key"*. That is true and **insufficient**: the guard constrains the column to the set of
studios the designer belongs to, and says nothing about **which** member of that set she names. As
a *visibility* guard that is enough. As a *pricing* key it hands the choice to the one actor whose
rate is being set.

**Measured** (`probe_r10a.sql`, every write through RLS as the actor named, rolled back). Leah owns
studio `S` and seats her designer hire a **plain `member`**; the hire received her `studio_designer`
role before she was seated, so `00295` gave her the one-person workspace she OWNS — the ordinary
self-signup order, no attacker, no extra account, no forged column:

```
precondition : hire owns workspace W; hire is a plain `member` of S
Leah prices her in S at 20000 (through RLS, on HT-3's own surface)
She prices HERSELF in W  at 99900 (through RLS — is_org_admin_or_owner(W) admits her, 00295 made her owner)

LEG1 control : INSERT project with studio_id NULL   → REFUSED P0001 studio_id_not_designer_studio
               (two candidate studios, 00563's ambiguity arm needs a proposal-activation context)
LEG2 ATTACK  : INSERT project with studio_id = W    → ALLOWED, projects.studio_id = W
LEG3 control : INSERT project with studio_id = S    → ALLOWED, projects.studio_id = S

her hour on the W-aimed project : rate=99900 src=studio_member amount=199800 state=authorized
  project_unbilled_time          : resolved_rate_cents=99900  amount_cents=199800   ($1,998.00)
her hour on the S-aimed project : rate=20000 src=studio_member amount=40000          ($400.00)
```

LEG1 matters as much as LEG2: because a NULL aim **raises** for any designer with more than one
candidate studio, supplying the column is the only way she can create a project directly at all —
the product pushes her onto the very surface that is unguarded.

**Why this is not HT-3-b.** HT-3-b (OWED) is about **step 2's** candidate set when
`projects.studio_id` is NULL, and its only proposed closure — answer (c), consent on seating, then
widen step 2 to active non-guest membership — leaves step 1 byte-identical. After HT-3-b lands,
`projects.studio_id = W` still prices at 99900. HT-3-b's arm A reaches the same number *by
accident*; this reaches it *by choice*, repeatably, and survives the fix.

**The same lever runs in the other direction.** On the W-aimed project she is the project designer,
so `Lead designers manage team members` lets her roster a colleague; his hour then resolves
`'none' / $0` out of W, although his employer priced him in `S` — the arm-B write-down, on demand.
And because she is `is_org_admin_or_owner(W)`, `00601`'s delta-1a exemption opens on that project
too (no new rate leak — tier 2 only reads W, whose rates are hers — but the narrowing W1-R9-01
bought is self-disarming on any project its author aimed at her own workspace).

**Nothing pins this.** Case **(z)** (`time_rate_resolution_test.sql`) asserts step 1 is final but
inserts its project **as `postgres`** with a designer who OWNS both studios — it never exercises the
authenticated aim. Case **(aa)** covers only the NULL path. So the single most consequential
property of the ruled design — that the project's column is not the subject's to choose — is
untested.

**Exact fix.**
1. **Required this round, whichever way it is ruled:** add a case to
   `supabase/tests/billing/time_rate_resolution_test.sql` that performs the project INSERT
   **through RLS as a plain-member designer with an explicit `studio_id` pointing at a workspace she
   owns**, and asserts today's `99900 / studio_member / 199800 / authorized` plus the
   `project_unbilled_time` pair, with every failure message naming the ruling and the value the
   assert takes when it lands — the shape cases (aa) and (c4) already use. Add the LEG3 negative
   control in the same fixture. Add one sentence to `00599`'s step-1 comment and to `00602`'s banner
   retracting *"which is what makes the column trustworthy as a pricing key"* and replacing it with
   what was measured: the guard bounds the column to studios the designer belongs to and does not
   choose among them.
2. **Ruling owed — propose `HT-3-c`** (beside HT-3-a/HT-3-b), with the two candidate answers stated
   so neither is inferred from code: **(a)** accept it — the project's named studio prices the hour
   even when its designer named it, and W2's composer is where a suspicious `studio_member` row is
   caught; **(b)** require the named studio to be one the project's designer actively **owns**
   whenever she owns any, implemented as a refusal in `00602` (a BEFORE INSERT validation arm beside
   the stamp, not an edit to `set_project_studio_id` — `patina-db-migrations` step 2) — which is
   exactly HT-3-b's question for the employee case and therefore must not ship unruled.
   Do **not** patch this in a fix round.

---

### W1-R10-02 · MAJOR · confidence HIGH (re-measured 2/2 with a negative control; **4th round open**) · the rate-preference key ignores the date span, so a studio that cannot price today outranks one that can — and `00602` writes that answer into the project for ever

**Where.** `00599:339-343` and `00602:107-111` — both
`ORDER BY EXISTS (SELECT 1 FROM studio_member_rates priced WHERE priced.studio_id = studio.id AND
priced.user_id = …) DESC` with **no `effective_from` / `effective_to` legs**, while tier 2 at
`00599:520-522` correctly requires the span to cover `p_at`.

**Measured** (`probe_r10b.sql`, all rate writes through RLS as the owner; rolled back). A designer
owns two active studios. The **older** owner seat's studio `A` holds only a `CURRENT_DATE + 30`
scheduled raise (an ordinary future rate — `00598` accepts it, it refuses only a hand-set
`effective_to`); the **newer** studio `B` holds the live 19000.

```
LEG1  00602's stamp          → A   (the studio that cannot price today)
LEG1  the hour on it         → rate=NULL src=none amount=NULL state=authorized   (expected 19000 / 38000)
LEG1  project_unbilled_time  → resolved_rate_cents=0  amount_cents=0
         ↑ billable, authorized, un-invoiced: this is what the invoice composer prints and what
           claim_time_entries invoice-locks — a $0 lock, not a display nit
LEG2  the same, with studio_id blanked as postgres so 00599 step 2 runs in isolation
                             → rate=NULL src=none                                (identical)
LEG3  control: give A a live rate too → rate=11000 src=studio_member  (the older seat wins legitimately)
```

Two things r9's text did not separate, and they matter for exposure: the **`00602` half** only bites
in postgres/migration/seed context (for authenticated and service_role inserts `00563` raises rather
than leaving the column NULL — see NOTE 5), but the **`00599` step-2 half** bites on **every legacy
`studio_id IS NULL` project**, which on Strata is the pre-00563 population. Needing a designer with
two active owner seats keeps it narrow (an owner row cannot be created through RLS — `Org owners can
insert members` carries `role <> 'owner'`), but it is not hypothetical and the fix carries no risk.

**Exact fix** (r8's and r9's, unchanged and still correct) — give the preference the tier-2 span in
**both** places:

```sql
ORDER BY EXISTS (
           SELECT 1 FROM public.studio_member_rates AS priced
           WHERE priced.studio_id = studio.id
             AND priced.user_id   = p_user_id
             AND priced.effective_from <= (p_at AT TIME ZONE 'UTC')::date
             AND (priced.effective_to IS NULL
                  OR priced.effective_to >= (p_at AT TIME ZONE 'UTC')::date)
         ) DESC,
```

and the `CURRENT_DATE` form of the same at `00602:107-111`. Add a `00599` postcondition requiring
`effective_from` **inside** the `ORDER BY EXISTS` (so a later graft cannot drop the span again), and
`probe_r10b.sql`'s LEG1 + LEG3 as a case.

---

### W1-R10-03 · MAJOR · confidence HIGH (measured) · routed to W2's `00606` by the HT-10-a amendment — **not charged to lane A**, but a hard precondition on the single deploy

W1 is the first wave to write a **per-person** studio rate onto `project_time_entries`
(`hourly_rate_cents` + `rate_source`), and that table carries two reads with no `user_id` leg —
measured live in `pg_policies` this round:

```
Team can view their project time entries | SELECT | is_project_team_member(project_id)
time_entries_studio_read                 | SELECT | EXISTS(projects p WHERE p.id = … AND is_studio_comember(p.designer_id))
```

Measured in `probe_r10d.sql` leg F6: a plain-member designer reads **0 rows** of a colleague's
`studio_member_rates` row (RLS denies her) and the **identical `15000 / studio_member`** off that
colleague's own hours row. The write half is closed; the confidential number is still readable by
the whole studio. `00606` (W2) must narrow **both** policies, per HT-10-a as amended
2026-09-12. Because P-3 ships the program once after W7, the concrete requirement is: **W1 must not
reach Strata ahead of `00606`.** Say so in the deploy chain, not only in a ruling.

---

### W1-R10-04 · MINOR · confidence HIGH (code-read + measured) · case (z)'s stated justification for trusting step 1 is factually wrong, and it is the justification a later reader will lean on

`supabase/tests/billing/time_rate_resolution_test.sql`, case (z)'s comment: *"The project names R8
Named Studio explicitly (**the shape every project created by the portal's own create path
carries**)."* `useCreateProject` (`packages/supabase/src/hooks/use-projects.ts:49-78`) sends neither
`studio_id` **nor** `designer_id`; `projects.designer_id` has no column default (measured in
`information_schema.columns`), and `00563`'s authenticated arm raises unless
`NEW.designer_id = auth.uid()` — so that path cannot create a project at all today, let alone one
carrying an explicit studio. The real surface for an explicit `studio_id` is a direct PostgREST
insert, which is W1-R10-01.

**Exact fix:** replace the parenthetical with *"the shape a direct PostgREST insert may carry — see
HT-3-c"*, and cross-reference the new case from W1-R10-01 fix item 1.

---

### W1-R10-05 · MINOR · carried unchanged (r9 W1-R9-03) · a scheduled future raise closes today's row, after which the shipped blur-save can never correct today's rate, and the future row cannot be withdrawn

`00598:197-212`, `:242-245`, `use-studio-member-rates.ts:100-111`. Region byte-identical after the
round-9 commit. Fix as r9 stated: either make `useSetStudioMemberRate` target the row **covering**
today, or rule that a future-dated row may be withdrawn by its author while
`effective_from > CURRENT_DATE` (one arm in `guard_studio_member_rate_history` + a DELETE policy
restricted to that predicate, which also closes W1-R8-10). No test exercises a future
`effective_from` at all.

### W1-R10-06 · MINOR · carried unchanged (r9 W1-R9-04) · delta 4 stamps a `rate_role` that did not price the hour

`00601:262-264` assigns `v_rate_role`; `00599:483` and `:503` (the two single-card fallback returns)
hand back the member's own pick while a card of a different `role_name` supplies the cents. Fix:
return the card's normalized `role_name`, or `NULL` — never `v_role` — on both fallback returns, and
add the fixture as a case. Done-when #5 is currently satisfied in the one way `00601:255-261`'s own
rationale forbids.

### W1-R10-07 · MINOR · carried unchanged (r9 W1-R9-05) · a pre-`00600` BOUND row's NULL provenance is relabelled `'authority'` by an ordinary duration correction

`00601:476` (`NEW.rate_source := 'authority';`) sits outside both the `v_is_bound` handling
(`:470-474`) and delta 5's preservation block (`:278-284`). `00600`'s own column comment defines NULL
as "a row written before 00600", so the row stops reading as legacy while keeping a number no current
card justifies. Fix: stamp `'authority'` only when `v_is_bound` is false **or**
`OLD.rate_source IS NOT NULL`; add a bound-legacy-row case.

### W1-R10-08 · MINOR · carried unchanged (r9 W1-R9-06) · `00598` still justifies its `created_by` actor-check by a key round 8 DELETED from `00599`

`00598:71-86`, `:277-295` and the postcondition message at `:450` call `created_by` *"00599's
arm's-length key"*; `00599:652-654` now **raises** if `arms_length` reappears. Keep the check, restate
its rationale as authorship provenance alone.

### W1-R10-09 · MINOR · carried unchanged (r9 W1-R9-07) · the member chooses among the studio's historical rates by choosing the date, and an UNBOUND row is silently re-priced when its date moves

`00599:452`, `:520-522`; `00601:278-284`; `started_at` is in `aac_`'s watched list. `useUpdateTimeEntry`
already accepts `started_at` in its typed `updates`. Fix as r9: one line beside HT-13 ruling whether a
date edit re-prices an unbound row or keeps its snapshot, pin today's behaviour meanwhile, and — if
it goes the other way — one extra leg in delta 5's condition.

### W1-R10-10 · MINOR · carried unchanged (r9 W1-R9-11, **5th round**) · `00598`'s trigger-ordering postcondition compares two string literals — and `00602` now does it correctly, so the wave is internally inconsistent

`00598:436`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg'`
is constant-folded and can only fail if someone edits the literals. `00602:164` does the same check
**correctly**, comparing two `tgname` values read from `pg_trigger`, and says so in its own comment
(W1-R7-07). Fix: apply `00602`'s form in `00598` — read both `tgname`s from `pg_trigger` and compare
the values.

### W1-R10-11 · MINOR · carried unchanged (r9 W1-R9-10) · `00598`'s W1-R7-03 postconditions are whitespace-sensitive

`00598:460-461` matches `'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'` with three
literal spaces against `pg_get_functiondef` output; any reformat of the guard body fails the replay
with a message about a protection that is in fact present. Fix: `\s+` between the tokens (and the
same at `:456-457`).

### W1-R10-12 · MINOR · carried unchanged (r9 W1-R9-15) · the invoiced-entry lock's frozen list does not carry W1's new derived columns

`guard_invoiced_time_entry` (read live) freezes `project_id, phase_key, task_id, user_id, started_at,
duration_minutes, billable, hourly_rate_cents` and has **no postgres exemption** — but not
`rate_source`, `rate_role` (new) nor `rated_amount_cents`, `billing_state` (pre-existing). A caller
cannot reach them (`aab_` raises for every non-postgres actor), so the residue is that a future
**postgres-context rail** could rewrite an invoiced row's provenance and amount silently. §0.12
forbids touching the lock, so this is an owed decision, not a fix-round edit: record it beside
HT-6-a/HT-6-b.

---

## NOTEs

1. **`service_role` still holds EXECUTE on `resolve_time_rate_cents`** (carried r9 W1-R9-08).
   Measured: `PUBLIC=f anon=f authenticated=f service_role=t`; the three sibling DEFINER functions in
   this wave (`close_prior_studio_member_rate`, `set_project_studio_id_owned`,
   `classify_project_time_entry_authority`) are `f` for all four. Inside a service_role call
   `auth.uid()` is NULL, so all three asserts bypass and any member's rate is readable for any
   project — no escalation (service_role reads `studio_member_rates` directly anyway), but
   `00599:577-587`'s postcondition asserts only `anon` and `authenticated`. Fix: add `service_role`
   to the REVOKE and to the postcondition, or say in the banner why it is kept.
2. **Plan-v2 §2 is stale in four places**, including the block the brief calls "the exact signature":
   it still shows `GRANT EXECUTE … TO authenticated` (shipped: REVOKEd, W1-R7-04) and still lists
   `00602` as UNUSED (shipped: the HT-3-a stamp). The deviations are ratified in-file; the plan is
   not. (carried r9 W1-R9-09)
3. **§0.20's fixed migration list** vs. the grep rule (carried r9 W1-R9-14). Measured this round:
   `python3 scripts/generate-legacy-grants.py` → `git status --porcelain` on
   `supabase/seed/00-legacy-grants.sql` is **empty**, and the seed does carry `00602`'s REVOKE under
   an `00602_projects_studio_id_on_insert.sql` comment (line 15705). The obligation is discharged;
   only the plan's list is wrong.
4. **`00602` changed a shipped test's fixture rather than a shipped behaviour.**
   `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql` gains
   `UPDATE public.projects SET studio_id = NULL WHERE designer_id = … AND client_id = …` to restore
   the shape section 2 was written against. Documented honestly in the test and in `00602`'s banner,
   and the section still exercises `00317`'s order — but a reader should know that the only
   behaviour `00602` measurably changed on this stack was seed/migration-context project inserts.
5. **`00602` is inert on every live creation path**, which makes HT-3-a's *"so (1) becomes the normal
   path"* satisfied vacuously (extends r9 W1-R9-13). Read from the live `set_project_studio_id`:
   for `authenticated` the column is filled by its own one-candidate discovery or the activation
   bridge, and the fail-closed check raises if it is still NULL; for `service_role` the same check
   raises. `00602`'s stamp therefore only ever fires under the `session_user = 'postgres'` bypass —
   confirmed by `probe_r10b.sql` LEG1 (postgres insert, 2 candidates, `00563` left NULL, `zzz_`
   stamped). The trigger is correct and correctly ordered; it simply does less than the ruling's
   sentence implies.
6. **The owner/admin exemption in `00601` delta 1a is dead on a NULL-`studio_id` project** — there is
   no column to be an owner of, so `is_org_admin_or_owner(NULL)` → false → refused. On Strata that is
   the legacy population. Admitted in the r9 fix report; no case exercises it.
7. **The brief's `commercial` invocation omits `-k`** and therefore reports 6 unexpected failures.
   Measured this round: an **absolute** `-k` path does **not** work either — `run-sql-tests.sh`
   matches `KNOWN_FAILURES.md` entries against paths relative to the invocation directory. Run from
   the worktree with a relative `-k` and it is **16/16, 0 unexpected**. Recorded so round 11 does not
   re-derive it.
8. **Lane B is absent** (phase 2, W1-R4-03): Done-when #3's live-mode render half and Done-when #5's
   *printed* role remain unverifiable. Both DB halves are verified below.

---

## Hypotheses tested and REFUTED this round (recorded so round 11 does not re-spend them)

- **Can a third party aim someone else's project?** No. `set_project_studio_id`'s authenticated arm
  admits `TG_OP = 'INSERT'` with `designer_id = created_by = auth.uid()` only; a direct authenticated
  **UPDATE** of `studio_id` hits `IF TG_OP <> 'INSERT' … RAISE` and is refused. A consent-free seat
  into an attacker's org only turns the designer's NULL-aim insert into a raise (the pre-existing
  W1-R8-12 denial-of-service), never into the attacker's studio.
- **Can a plain member self-seat a roster role to claim a better signed card?** No.
  `project_team_members` has exactly one write policy, `Lead designers manage team members`
  (`projects.designer_id = auth.uid()`); the other two are SELECTs. `00601` delta 1's
  `rate_role = 'lead_designer'` arm additionally requires `projects.designer_id = NEW.user_id`.
- **Can a member create an organization to become an owner somewhere?** No. `organizations` has
  **no INSERT policy** (measured: two SELECTs and `Org admins can update organization`), and
  `Org owners can insert members` carries `role <> 'owner'`.
- **Does the delta-1a exemption open a new pay-rate read?** No. Tier 2 reads only `v_studio_id`
  = the project's studio; to be exempt she must already be its owner/admin, and
  `studio_member_rates_read_self_or_admin` already gives her those rows.
- **Does `project_unbilled_time` re-resolve the rate (so a backdated studio rate could rewrite
  already-logged money)?** No — read from `pg_get_viewdef`: it reads the entry's own
  `hourly_rate_cents` / `rated_amount_cents` snapshot.
- **Can a caller dodge `aab_` by editing a derived column alongside an unwatched one?** No —
  `BEFORE UPDATE OF` fires on the SET list, and all three refusals fired (probe `probe_r10c.sql`).
- **Does any DEFINER rail insert `project_time_entries` (which delta 1a would now break)?** No —
  zero `INSERT INTO … project_time_entries` anywhere in `supabase/migrations/*.sql`.

---

## Program-rule compliance (each checked, not assumed)

| rule | verdict | evidence |
|---|---|---|
| §0.1 additive to `project_time_entries` | PASS | two `ADD COLUMN IF NOT EXISTS`; one new table; no new hours surface |
| §0.2 hand-numbered, no collision | PASS | `00598`–`00602`; integration head `00597`; enumerated across **every** ref — peer holds `00592-00594` and `00621-00622`; `00598-00602` exist on this branch alone |
| §0.3 banner / idempotent / RLS in the same file | PASS | all five carry banners + lineage; `ENABLE ROW LEVEL SECURITY` + 3 policies inside `00598` |
| §0.4 redefine from the grep winner | PASS | `00600` grafts `guard_…_derived_fields` from `00412` (only prior body); `00601` grafts the classifier from `00578`, lineage `00412 → 00575 → 00578 → 00601`, and four postconditions pin 00578/00575's invariants by their exact raise text |
| §0.5 no flags | PASS | zero `useFeatureFlag` / posthog / `ComingSoon` in the diff |
| §0.6 / P-4 no backfill | PASS | the only top-level DML in the five files is the close-ladder `UPDATE` **inside** `00598`'s trigger function; `00602` is BEFORE INSERT with a postcondition refusing an UPDATE event |
| §0.7 client rate discarded, on every kind | PASS | measured: `99999` on a non-services project with `change_order_terms.hourly_rate_cents = 17500` stored as **15000 / studio_member / 30000 / authorized** |
| §0.7c two refusals + two discards | PASS | `rate_source` and `rated_amount_cents` on INSERT → `23514`; `hourly_rate_cents` and `billing_state` silently replaced |
| §0.8 guard list in BOTH places | PASS | `aab_` `BEFORE UPDATE OF … rate_source, rate_role` + the same two in the `IS DISTINCT FROM` chain; `aac_` carries `rate_role`; three postconditions in `00600` |
| §0.9 / §0.10 rollup INVOKER, no notes | N/A | W1 adds no rollup function |
| §0.11 one running-timer slot | PASS | `uniq_project_time_entries_running_timer ON (user_id) WHERE duration_minutes IS NULL` read live, unchanged; no migration in the diff names it |
| §0.12 invoiced lock untouched | PASS (with W1-R10-12) | `guard_invoiced_time_entry` body unchanged; `00600` postcondition asserts it is still installed |
| §0.13 no RLS policy keyed on `projects.studio_id` | PASS | no new policy on `project_time_entries` or `projects`; `studio_member_rates`' three policies key on its **own** `studio_id` via `is_org_admin_or_owner` |
| §0.14 only `is_org_admin_or_owner` | PASS | zero new `user_is_org_member` call sites |
| §0.15 `organization_members.role` / `member_role` | PASS | `subject.role <> 'guest'`, `owner_seat.role = 'owner'` |
| §0.16 / 00484 DEFINER contract | PASS (NOTE 1) | all four DEFINERs pin `search_path = public, pg_temp`; `PUBLIC/anon/authenticated` revoked on every one; `extensions.gen_random_uuid()` and `pg_catalog.pg_trigger_depth()` schema-qualified |
| §0.17 the 00484 quartet immutable | PASS | all four read live with their registered quals; `00484`'s assert replayed clean |
| §0.19 / §0.20 generated files | PASS | both regenerate to an empty diff (below) |
| §0.21 hook names | PASS | new module only; no rename, no default export |
| §0.22 zero-tap path | PASS | `rateRole?` is optional; no required field added to `CreateTimeEntryInput` |

**Plan items, signature-exact:** `00598` table/columns/UNIQUE/CHECK + the three policy **names**
(`studio_member_rates_read_self_or_admin`, `_admin_insert`, `_admin_update`) and the asserted
`count(*) = 3` with no DELETE policy; `00599`'s signature
`(uuid, uuid, timestamptz, text) RETURNS TABLE (cents integer, source text, role text)`, `STABLE`,
`SECURITY DEFINER` — **one ratified deviation**: `authenticated` is REVOKEd, not GRANTed (W1-R7-04;
plan stale, NOTE 2); `00600`'s two columns with their exact CHECK sets; `00601`'s five deltas plus
delta 1a; `00602` repurposed per HT-3-a; `00603` unused and absent.

---

## Gates re-run (this reviewer, clean stack, project `patina-hours`, `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean**, exit 0 — `00598`…`00602` applied, every postcondition replayed, 27 seeds loaded, `Finished supabase db reset` |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | 10 green / **6 unexpected-fail** as the brief invokes it; from the worktree with `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (the same six pre-existing files, each documented at `KNOWN_FAILURES.md:97-101,69` with the identical abort strings). See NOTE 7. |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry …` | **1 / 1 green** |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate …` | **1 / 1 green** — `time_rate_resolution_test.sql`, cases (a)–(ab) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates …` | **1 / 1 green** |
| *beyond the brief:* the whole `rls` directory with `-k` | **26 / 26** — 24 green + 2 documented pre-existing (`design_requests_test.sql`, `studio_titles_test.sql`, `KNOWN_FAILURES.md:114-115`) |
| `python3 …/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** (baseline + 2610 replayed statements, byte-identical) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir … db:generate` → `git diff --exit-code -- packages/supabase/src/database.types.ts` | **exit 0** |
| `pnpm --dir … --filter @patina/supabase type-check` | exit **0** |
| `pnpm --dir … --filter @patina/designer-portal type-check` | exit **0** |
| `pnpm --dir … --filter @patina/admin-portal build` | exit **0** |
| *beyond the brief:* `pnpm --filter @patina/supabase test` | **101 files / 1251 passed**, 12 skipped |
| *beyond the brief:* `pnpm --filter @patina/designer-portal test -- src/hooks/__tests__/use-time-tracking-authority.test.tsx` | **1 suite / 3 tests passed** |

---

## Done-when, SQL-probed through RLS as the roles the tests name

| # | claim | result |
|---|---|---|
| 1 | `commercial` green unchanged; `billing` + `rls` green | **PASS** (table above; the six commercial reds are pre-existing and documented) |
| 2 | `INSERT … (hourly_rate_cents) VALUES (99999)` as `authenticated` on a **non-services** project stores the resolver's value | **PASS** — stored `15000 / studio_member / 30000 / authorized`, with `change_order_terms.hourly_rate_cents = 17500` on the project proving the legacy leg is cut |
| 3 | a rate typed on the studio surface appears on the next entry with `rate_source='studio_member'` | **DB half PASS** (the owner's 15000 written through RLS priced the member's next entry); render half unverifiable — lane B absent |
| 4 | a new hire's services entry carries non-NULL rate + amount and `pending_authorization`, and is **not** promotable | **PASS via the suite** — `time_rate_resolution_test.sql` cases (c)/(c4) green, (c4) asserting 0 promotable rows with a message naming HT-6-b |
| 5 | a two-role member's row records the role she picked | **DB half PASS** — two roster roles, `rate_role='bookkeeper'` supplied → stored `bookkeeper`, rate `15000`; a role she does **not** hold → `23514`. See W1-R10-06 for the case where the stamped role is not the one that priced the hour. Printed half unverifiable — lane B absent. |
| — | §0.8 immutability on a classified row | **PASS** — `rate_source`, `rate_role`, `hourly_rate_cents` UPDATEs all `23514` |
| — | the resolver is unreachable as an RPC | **PASS** — direct call as `authenticated` → `42501 permission denied for function resolve_time_rate_cents` |

---

## Commit hygiene

14 commits, Conventional Commits throughout, explicit pathspecs only. `git show --stat` on every
commit shows no stray file: no `.env*`, no `supabase/config.toml` (still `S` in `git ls-files -v`
and in **zero** commits — `git diff --name-only origin/hour-tracking/integration..hour-tracking/server
| grep -c config.toml` → `0`), no artifacts, no lockfile churn. The two commits that add a top-level
`REVOKE` (`b39ba9ec2`, `7867b3088`) each carry the regenerated `supabase/seed/00-legacy-grants.sql`
in the same commit. Nothing was run in the main checkout; every git and pnpm invocation used
`-C` / `--dir` against the worktree.

## Not verified

- **Nothing on Strata** — no `db push`, no prod probe, no count of live designers holding two active
  owner seats (which would size W1-R10-02) or of studios whose lead designer is not their owner
  (W1-R10-01 / HT-3-b).
- **Lane B** — every portal file in plan-v2 §2 below the first two is still absent (phase 2).
- **Concurrency** — no two-session race of delta 1a's refusal against a concurrent `user_id` edit, and
  no race on `close_prior_studio_member_rate` against `uniq_studio_member_rates_open`.
- **`00601`'s retainer / ceiling arms** — exercised only by the six `commercial` files that abort
  pre-authority; `time_rate_resolution_test.sql` is the only real gate for the classifier, as
  plan-v2 §2 records.
- **Designer-portal lint** was not run (it is the one resolvable ESLint config in the repo, but the
  diff touches no designer-portal source other than a test file).
