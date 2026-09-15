# W2 — lane A (DB) adversarial review, round 7

**clean = false** — **two MAJORs**, and the first of them is **new evidence about an old finding**:
round 6 reversed bound **(e2)** and thereby discharged **one half** of W2-R6-01 — the half where the
project's designer happens to be an `admin` of her employer. The **other half**, bound **(a2)**, is
untouched, and for the designer HT-3-d's own text makes the subject of this act — a **plain `member` of
two employer studios** — it leaves **HT-3-a's ruled remedy available to nobody at all**. I measured it
exhaustively: **24 calls, 4 actors × 3 of her legacy projects × both employers, 24 refusals, every column
still NULL** (probe P7), plus the same shape narrated step by step in probe P1. No case in the shipped
suite covers it. The second MAJOR is **W2-R6-02**, which the implementer openly did not close and which I
re-measured from a fresh fixture: her resolved rate becomes **99900, a number she wrote herself**,
permanently, on two projects an honest employer was pricing at 25000, while that employer reads **0 rows**.

Round 6's other findings are discharged: **W2-R6-04** (the postcondition that read as a promise the
function could not keep) and **W2-R6-05** (the unreachable `'owner'` arm) both dissolve with (e2), verified
against the live `prosrc`; **W2-R6-07** (`reassign_project_lead` moving the gate's own operand) is moot
because no actor gate exists. One new MINOR: the sentences round 6 wrote to replace round 5's false ones
are themselves **measurably false** — *"(e2) bought nothing"* and case (s)'s *"in this one she cannot
author her own rate row without the owner's seat"*. An `admin` satisfies
`studio_member_rates_admin_insert`; measured (P8), an admin-designer at an **honest** employer writes her
own 99900 there, stamps, and her hour comes back **99900 / 199800** where the owner had written 26000 —
with **one account and no manoeuvre**, and refused under round 5's body.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **seven** commits,
`c71db49d9` → `9f80b0c09` → `3d36ffb6e` → `7e6701490` → `7d0ffb910` → `d7a240259` → **`733bcc04c`**
(round 6's fix; HEAD == `hour-tracking/server` == `origin/hour-tracking/server`, tracked tree clean).
Every line of the round-6 delta (`00606` ±, `time_entry_studio_stamp_test.sql` ±; **two files, nothing
else**), the whole of `00604`–`00607` as they now stand, the `project_time_entries` /
`studio_member_rates` policy sets read off `pg_policy`, `guard_org_membership_changes`,
`set_project_studio_id`'s role arms, `is_project_team_member`, the eleven triggers on
`project_time_entries`, the regenerated seed and types, `W2-impl.md`, `W2-review-r6.md`, `W2-fix-r6.md`,
`plan-v2.md` §3, and `rulings.md` (HT-3-a/b/c/d incl. its 2026-09-12 correction, HT-10, HT-10-a, HT-36,
HT-38). Lane B is phase 2; its absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `project_id "patina-hours"`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00601`→`00607` applied in order, every `DO $postcondition$` passed |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`. **All six pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`); five abort inside `_countersign_design_services_agreement_impl` with `design services agreement … not found or access denied`. W2 touches no agreement path |
| `run-sql-tests.sh -d …/supabase/tests/rls …` (**all 30**) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` and `studio_titles_test.sql`, **both pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:114-115`). `time_entry_studio_stamp_test` (now 18 cases incl. the new (s)), `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio.test`, `00584_studio_comember_rls_sweep.test` all green |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output, exit 0) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate; full route table printed) |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 scripts/generate-legacy-grants.py` → `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`). W1's, carried as **W2-R4-08**; the W2 re-registration at `:545-548` is never reached, so §0.17's discharge is asserted by no green gate |
| migration-number sweep over every local and remote ref | `00604`–`00607` exist **only** on `hour-tracking/server` (+ its origin twin). **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the seven commits; 14 files in the range, all intended; round 6's commit touches exactly two; Conventional Commits throughout |
| live function shapes (`pg_proc`) | `stamp_project_pricing_studio`, `project_pricing_studio_id`, `project_hours_total`, `audit_time_entry_change` all `prosecdef = t`, `search_path = public, pg_temp`; `studio_hours_rollup` **INVOKER** with `search_path` pinned (HT-38 ✓); `stamp_time_entry_updated_by` INVOKER, `proconfig = NULL` (**W2-R2-18**, carried) |
| object-level probe that the shipped body came from the replay | `no_actor_gate_eq = t`, `no_actor_gate_eq2 = t`, `a2_inequality_present = t`, `tier_employer_arm = t`, `sibling_leg = t` — i.e. the replayed body carries no actor-equality gate and still carries the tier and `created_by` legs |

---

## Discharge of round 6

| Round-6 finding | Status |
|---|---|
| **W2-R6-01 · MAJOR** (bound (e2) refuses a caller HT-3-d admits; bound (a2) then refuses everybody else) | **HALF discharged.** The **(e2) half is genuinely closed**: the honest `admin`-designer now stamps her own employer (case (s) green; re-measured independently as **P8-2** and **P3-7**), the new postcondition pins "no actor-gated refusal" by source, and the negative control in `W2-fix-r6.md` is real. The **(a2) half is LIVE and I measured it exhaustively** for the shape HT-3-d itself names — a plain `member` of two employers: **W2-R7-01** below. `W2-fix-r6.md` records (a2)'s refusal of the employer's owner as case (s) `s3` but never asks what happens when the designer is *not* an admin, which is the ordinary hire |
| **W2-R6-02 · MAJOR** (her resolved rate becomes 99900, a number she set) | **NOT discharged**, by the implementer's own account, and I re-measured it 1/1 on a fresh fixture — **W2-R7-02** below. The analysis in `W2-fix-r6.md` is **correct on the point it argues**: I verified independently that `organizations` has **no `created_by` column at all** (so the candidate the fix dismissed genuinely does not exist), and that the tier's only temporal witness is `organization_members.updated_at`. The closure is a ruling |
| **W2-R6-03** (case (r), the willing designer's sibling) | carried, `note — ruling owed`, unchanged; case (r) green |
| **W2-R6-04 · MINOR** (the tier postcondition matched one operand order of one `IF`) | **DISCHARGED.** The matcher is now `prosrc NOT LIKE '%WHEN v_actor%' AND NOT LIKE '%WHEN v_designer_id = v_actor%'`, its message says *"its CASE may not branch on the actor"* and *"This assert speaks ONLY for bound (e)"*, and a second assert owns "There is no other arm". Both pass on the replayed body (probed above). Residual brittleness: **W2-R7-04** |
| **W2-R6-05 · NOTE** (unreachable `'owner'` arm in (e2)) | **DISSOLVED** with (e2) — the `designer_standing` block is gone from the body |
| **W2-R6-06** (`project_hours_total.amount_cents` invertible) | correctly not actioned (brief named only R6-01/02); carried and **re-measured exactly** — see below |
| **W2-R6-07 · NOTE** (`reassign_project_lead` moves the gate's operand) | **MOOT**, verified: the body contains no `v_actor = v_designer_id` / `v_designer_id = v_actor` in any form |

### HT-3-d's four required test cases, each measured independently of the shipped suite

| ruling case | my measurement |
|---|---|
| **(1)** the r4 confederate-admin manoeuvre is refused 42501 and the hour stays `'none'` | **confirmed** (P2). Her consent-free `admin` seat (P2-1), her own 99900 rate card (P2-2) and her own named-studio sibling (P2-3) all succeed first, so the probe is not vacuous; then **both** her stamp (P2-4) and the confederate's (P2-5) are refused `42501 … only from inside its designer's own tier … (HT-3-d)`, the column stays NULL (P2-6) and her next hour is `NULL / none` (P2-7) |
| **(2)** an employer's admin/owner stamps the employer → the hour prices from the employer | **confirmed** (P1-8/P1-9: employer one's OWNER stamps, her next hour `26000 / studio_member`; P6-4/P6-7: employer one's ADMIN stamps, hour `25000 / studio_member`) |
| **(3)** a designer with no employer stamps her owned studio → prices from it (HT-3-c) | **confirmed** (P6-0/1/2): two owned studios ⇒ baseline NULL; she stamps one she owns; her next hour `44000 / studio_member` |
| **(4)** with two employers, either employer's admin may stamp their own studio, and the stamp is final | **confirmed** (P6-3…P6-8): employer one's admin stamps project A, employer two's admin stamps project B, each hour prices from its own employer (`25000` / `31000`), and re-pointing A at employer two is refused `22023 … this project already names a studio` |

### The brief's other probes

| probe | result |
|---|---|
| the r4 confederate manoeuvre | **refused** 42501 ×2, hour `none` (P2, above) |
| a designer with employers naming her workspace | **refused** 42501 (P2-4) — `… one she OWNS only where she holds none (HT-3-d)` |
| an employer admin stamping | **succeeds**, money follows (P1-8/9, P6-4/7) |
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** (P4-1): she reads **1 of 3** entry rows on the project she is rostered to (her own), **0** of the designer's 2 rows (so `notes` and `hourly_rate_cents` are unreachable), **0** rows of the designer's `studio_member_rates`, **1** `time_entry_ledger` row, and **0** rows on a sibling project she is not rostered to. Her own `hourly_rate_cents` rewrite → `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`; her own `studio_member_rates` INSERT → `42501` RLS (P4-15/16) |
| `project_hours_total` per role | rostered plain member **ALLOWED** `240 / 240 / 115000` · studio owner **ALLOWED** `240 / 240 / 115000` · outsider **42501** `the caller is not on this project`. HT-10-a's own prescription — and the inversion is exact: the teammate knows her own `40000`, so `115000 − 40000 = 75000` over `240 − 60 = 180` min ⇒ **25000/hour**, the designer's confidential rate (**W2-R6-06**, carried) |
| the rollup never returns notes | **confirmed on the TYPE and on the rows.** `studio_hours_rollup → TABLE(bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes)`; `project_hours_total → TABLE(minutes, billable_minutes, amount_cents)`; `time_entry_ledger` has **no** `notes` column (27 columns, enumerated from `information_schema`). Per role: owner **2** member buckets · rostered plain member **1** (her own) · outsider **0 rows, no raise** (INVOKER + RLS — empty rather than an error, no leak) |
| the audit trigger on an admin adjust | **exactly one** row (0 before → 1 after), `action = time_entry.updated`, actor = the **admin**, `organization_id` = the **pricing studio**, `old_values` **and** `new_values` present, `updated_by` stamped to the admin, duration actually 120 → 150 (P4-8…P4-10b) |
| owner/admin write cannot touch invoiced rows | **confirmed** (P4-11/12/14): owner `UPDATE duration_minutes` → `P0001 … only notes (and detaching the invoice) may change`; `DELETE` → `P0001 … cannot be deleted`; the row survives at 60 min. `UPDATE notes` → **NO RAISE** (W2-R2-13, carried) |

---

## Findings

### W2-R7-01 · MAJOR · confidence HIGH · (= the UNDISCHARGED half of W2-R6-01; measured 24/24 and 1/1, through RLS, as each actor)

**On the shape HT-3-d itself singles out — a designer who is a plain `member` of two employer studios —
bound (a2) refuses every caller who has standing, and bound (a) refuses her, so HT-3-a's ruled remedy
("the owner fixes 'none' by stamping `projects.studio_id`") reaches NOBODY. Round 6 closed this for the
designer who happens to be an `admin`; for the ordinary hire it is exactly as unreachable as it was
under round 5, and it is covered by no test.**

*Location:* `supabase/migrations/00606_time_entries_studio_read_narrow.sql` bound **(a2)**
(`IF v_actor <> v_designer_id AND NOT EXISTS (sibling … studio_id = p_studio_id AND designer_id =
v_designer_id AND created_by = v_designer_id …)`) in combination with bound **(a)**
(`IF NOT is_org_admin_or_owner(p_studio_id)`).

*Why it contradicts rulings in force:* HT-3-d authorises exactly two bounds — the designer's HT-3-b tier,
and *"the caller must be an OWNER or ADMIN of the NAMED studio"* — and says *"There is no other arm."*
(a2) is a third bound, and the ruling's own resolution of **W2-R4-02** says the remedy on this shape is
the studio's: *"a designer seated a plain `member` in two employer studios cannot stamp either. HT-3-a's
ruled sentence is 'the OWNER fixes 'none' by stamping projects.studio_id', and this is it."* Measured,
it is not: (a2) refuses that owner. This is the same argument round 6 used to reverse (e2) — an extra
refusal not in HT-3-d, measured to cost the ruling's own remedy — applied to the extra refusal round 6
kept.

*Measured, probe P1 (ordinary shapes only — no confederate, no demotion, no consent-free seat, and
asserted `0` owner seats held by her, so she owns no workspace). She is a plain `member` of employer one
and employer two, so HT-3-b's employer tier is AMBIGUOUS and the project is honestly `'none'`; employer
one holds no project she created:*

```
P1-00 owner seats held by the designer = 0                ← she owns nothing; no 00295 workspace
P1-0  baseline pricing studio          = NULL             ← HT-3-a step 3's 'none', honestly arrived at
P1-1  her hour                         = NULL / none
P1-2  SHE stamps employer one          → 42501 "only an owner or admin of the studio being named
                                                 may name it"                              (bound a)
P1-3  employer one's OWNER  stamps     → 42501 "this studio holds no project that this project's
                                                 designer both leads and created"         (bound a2)
P1-4  employer one's ADMIN  stamps     → 42501 (same message)                             (bound a2)
P1-5  employer two's OWNER  stamps     → 42501 (same message)                             (bound a2)
P1-6  column after every refusal       = NULL             ← nobody can repair it
P1-7  she INSERTs a junk project naming employer one      → OK   (00563's authenticated arm)
P1-8  employer one's OWNER stamps again                   → returned employer one
P1-9  her next hour                                        = 26000 / studio_member
```

*And the legacy population is worse than P1, because (a2)'s sibling must itself carry a non-NULL
`studio_id`.* A designer whose whole book predates the column has **no** project with
`studio_id = p_studio_id`, whoever created them. Probe **P7** builds exactly that — three legacy projects,
**all `created_by` the designer herself** (what the banner says every real creation path writes), all
`studio_id` NULL — and sweeps **every** actor against **both** employers:

```
P7-0   pricing of the three legacy projects   = NULL / NULL / NULL
P7     24 calls: {she, employer one's owner, employer one's admin, employer two's owner}
       × {L1, L2, L3} × {employer one, employer two}     → 42501, 24 times out of 24
P7-end columns                                 = NULL / NULL / NULL
```

*Honest limits, stated so the orchestrator can size it:*
- It is **not** a permanent dead end. Two escapes exist and I measured both: she INSERTs one fresh project
  naming the employer (P1-7) and the employer's owner then repairs the old one (P1-8) — the same
  *"manufacture a junk project so your employer may fix your other project"* sentence round 6 called *"not
  a sentence the product can say"*; and a **`service_role`** UPDATE of `projects.studio_id` is permitted
  by `set_project_studio_id`'s own arm (measured, probe P5: `service_role UPDATE → OK`), i.e. Patina staff
  running SQL. No portal caller for the stamp exists yet, so today this is a DB-level reachability fact.
- The discharge may be **ruling-only, with no code change**: amend HT-3-d to record (a2) as a third bound
  and accept that an ambiguous-tier plain member's legacy projects are repairable only after she creates
  one project naming the studio. In that case what must change is the **suite** — see W2-R7-06 — and the
  product copy, not the function.
- The alternative, which *is* code: admit an owner/admin caller without a sibling where the designer holds
  an **active, non-guest seat** in the named studio **and** somebody other than the designer authored her
  rate row there. That restores HT-3-a's remedy and keeps W2-R3-01's outsider closed (the outsider's
  consent-free seat cannot produce a rate row she did not write, because she is its `created_by`).
- **Untested either way.** No case in `supabase/tests/rls/time_entry_studio_stamp_test.sql` has a plain
  `member` designer with an employer that holds no sibling. Cases (l), (n), (g)/(h) and (p) all
  deliberately seed a `created_by` sibling; case (s) has one but reaches the remedy through her `admin`
  seat. Round 8 should not be the round that discovers this.

### W2-R7-02 · MAJOR · confidence HIGH (= W2-R6-02 / W2-R5-01's accomplice half; re-measured independently 1/1, fresh fixture, every write through RLS as the actor)

**The designer's resolved rate still becomes 99900 — a number she wrote herself — permanently, on two
projects an honest employer was pricing CORRECTLY, with one second account that performs two statements.
After round 6 BOTH halves land: her own stamp and the confederate's.**

*Location:* bound (e)'s `CASE WHEN v_designer_has_employer_seat THEN designer_seat.role <> 'owner' …` (a
**role** test she can write) together with `public.transfer_studio_ownership` (00484, DEFINER, EXECUTE to
`authenticated`, whose last statement demotes `auth.uid()` to `'admin'`) and
`studio_member_rates_admin_insert` (no self-exclusion — verified on the live policy:
`is_org_admin_or_owner(studio_id) AND created_by = auth.uid() AND EXISTS(subject active non-guest)`).

*Measured, probe P3 — she is an ordinary hire: a plain `member` of ONE honest employer that prices her at
25000, plus the 00295 workspace provisioned at her designer grant. Two legacy projects, both priced
CORRECTLY at baseline:*

```
P3-0   baseline pricing of BOTH legacy projects = the honest employer      ← correct, no manoeuvre
P3-1   consent-free `admin` seat for an account she holds    → OK
P3-2   transfer_studio_ownership(her workspace, that account) → OK
P3-3   her own role in her own workspace                      = admin      ← she wrote her own role
P3-4   pricing of BOTH legacy projects NOW                    = NULL / NULL  ← 'none' MANUFACTURED
P3-5   SHE writes her own 99900 in the workspace (as admin)    → OK
P3-6   SHE authors the created_by sibling (a2's leg)           → OK
P3-7   HER OWN stamp of the workspace                         → NO RAISE   ← refused under round 5
P3-8   the CONFEDERATE's stamp of the SECOND project          → NO RAISE
P3-9   her next hour                                          = 99900 / studio_member / rated 199800
P3-10  the HONEST employer's OWNER reads                      = 0 rows across both projects
```

*Why MAJOR and not `note — ruling owed`:* it is the brief's second trigger **literally** — a member moves
her own resolved rate to a number **she** set — and P4-15/16 confirm every direct door to her own number
is refused (`23514`, `42501`), so the stamp is the door. It is also a contradiction of HT-3-d's own second
closing sentence, which the orchestrator wrote as a statement of what the ruling *does*.

*What I agree with in `W2-fix-r6.md`, verified rather than accepted:* there is no bound available at this
call site. `organizations` has **no `created_by` column** (confirmed on the live schema — the candidate
the fix dismissed does not exist to key on); the tier's only temporal witness is
`organization_members.updated_at`; and a rate-authorship test at stamp time is vacuous because the stamp
succeeds with zero rate rows. So the discharge is the orchestrator's, not the implementer's: the
rate-authorship rule at the **resolver** (*a `studio_member_rates` row whose `created_by` is its own
`user_id` prices an hour only where that person is the named studio's OWNER*), or HT-3-b arm (c)'s consent
door, or a knowing acceptance recorded in HT-3-d. **Note the severity tension in my own brief** — "anything
needing a NEW ruling is a note — ruling owed" versus "a member moving her own resolved rate to a number
she set" — and resolve it in one line if you intend the first clause to dominate; round 6's reviewer
graded it the same way I have.

### W2-R7-03 · MINOR · confidence HIGH (measured 1/1; the replacement for round 5's false sentences is itself false)

**00606's `COMMENT` and banner now say (e2) *"bought nothing"*, and case (s) says of the honest employer
*"in this one she cannot author her own rate row without the owner's seat"*. Both are false: an `admin`
satisfies `studio_member_rates_admin_insert`. With ONE account, no confederate and no manoeuvre, the
case-(s) caller writes her own number into her honest employer's rate card and then stamps that employer —
and round 5's (e2) refused exactly that call.**

*Measured, probe P8 — the case (s) shape exactly, except that she writes her own rate row:*

```
P8-0  baseline pricing (admin of employer one, member of employer two) = NULL   ← honest 'none'
P8-1  SHE writes her OWN 99900 into the HONEST employer's rate card    → OK
P8-2  SHE stamps that employer (case (s)'s arm)                        → NO RAISE (returned employer one)
P8-3  her hour                                  = 99900 / studio_member / rated 199800
                                                  (the employer's OWNER had written 26000)
P8-4  the employer's OWNER reads 2 rate rows for her   ← the 99900 is NOT concealed
P8-5  the employer's OWNER reads 1 hour row of the project
```

*Why MINOR and not a third MAJOR:* the capability is **W1's**, not W2's — `studio_member_rates_admin_insert`
(00598) has no self-exclusion, and the same outcome is reachable on **new** work without the stamp at all
(she names that studio at project creation through 00563's authenticated arm — measured as P1-7, and ruled
acceptable as HT-3-c arm (a)). What the stamp adds is her **legacy** book. And P8-4/P8-5 show the owner
sees both the rate row and the hours, so this is governance inside one studio rather than the
concealment W2-R7-02 is. *What to change here is the words and one assertion*: drop *"bought nothing"* (it
bought this refusal), correct case (s)'s sentence, and add an assertion pinning P8 so the shape is a
measurement rather than a surprise. The underlying self-authored-rate question is **W2-R7-07** below.

### W2-R7-04 · MINOR · confidence HIGH (code; the same brittleness class W2-R6-04 named, in the replacement)

**Both new postconditions are spelling gates on `pg_proc.prosrc`, so a future actor gate written any other
way passes them.** `prosrc NOT LIKE '%v_actor = v_designer_id%' AND NOT LIKE '%v_designer_id = v_actor%'`
(and bound (e)'s `NOT LIKE '%WHEN v_actor%'`) are all matched on one spelling of equality:
`IF v_designer_id IS NOT DISTINCT FROM v_actor`, `IF NOT (v_actor <> v_designer_id)`, or a one-line helper
`designer_is_actor()` all restore the forbidden shape with every assert green. The asserts are still worth
having — they caught round 5's body in the fix's own negative control — but their messages promise a
property they cannot enforce, which is precisely the complaint W2-R6-04 made about the previous spelling.
*Fix:* say in the message that the check is a spelling heuristic, or carry the real property in the suite
(case (s) is already that test) rather than in the banner's promise.

### W2-R7-05 · MINOR · confidence HIGH (documentation accuracy, second round running)

**`W2-fix-r6.md` cites the two `rls` pre-existing failures as documented at
`supabase/tests/rls/KNOWN_FAILURES.md:114-115`. That file does not exist** — `supabase/tests/` has the only
`KNOWN_FAILURES.md` in the tree (verified: no per-directory file under `rls/`, `commercial/` or
`billing/`), and the two entries live at `supabase/tests/KNOWN_FAILURES.md:114-115`. `W2-review-r6.md`
already pointed this out; the wrong path was carried forward. It matters only because the missing
per-directory file is **why** the runner reports eight documented failures as "unexpected", which is the
one thing a later hand will try to fix.

### W2-R7-06 · note — ruling owed · confidence HIGH (the suite now asserts the thing W2-R7-01 says is wrong)

**Case (s)'s `s3` is a PASSING assertion that the honest employer's OWNER must be refused 42501.** It is an
honest record (the comment says so plainly), but it means the suite now enshrines (a2)'s cost as expected
behaviour: if the orchestrator closes W2-R7-01 by relaxing (a2), `s3` fails and must be rewritten, and so
must the banner paragraph that calls (a2) *"the realistic repair … still works"*. Worth deciding
deliberately rather than discovering at the next green run.

### W2-R7-07 · note — ruling owed · confidence HIGH (measured; W1's property, reported here because W2's act now reaches it)

**`studio_member_rates_admin_insert` has no self-exclusion: an `admin` may author her own rate row in any
studio she administers** (`is_org_admin_or_owner(studio_id) AND created_by = auth.uid() AND EXISTS(subject
active non-guest)` — read off `pg_policy`; exercised in P3-5 and P8-1). Combined with HT-3-d's admission of
the admin-designer (case (s)), the same person can set her number and name the studio that uses it. Visible
to that studio's owner, so it is a governance question, not a concealment — but it is the same rule the
W2-R7-02 closure would touch, so rule them together: the rate-authorship rule the implementer names would
resolve both (and P8 shows why it has to be at the rate and not at the studio).

---

## Carried from rounds 2–6 — each re-checked this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live, re-run.** `public_rpc_authorization_contract_test.sql` red at `:171`; the W2 re-registration at `:545-548` (verified present in the diff, with HT-10-a named beside it) is never reached, so §0.17's discharge is asserted by no green gate. W1's; ruling owed (W2-R2-19). Correctly absent from `KNOWN_FAILURES.md` — it is an unruled disagreement, not documented residue |
| **W2-R6-03 · W2-R2-03 · W2-R2-04** | note — ruling owed · HIGH | Live. Case (r) green. Rule with HT-3-b arm (c) |
| **W2-R6-06** | note — ruling owed · HIGH | Live, **re-measured exactly**: `project_hours_total` answers the rostered teammate `240 / 240 / 115000`; `115000 − 40000 = 75000` over 180 min ⇒ the designer's confidential `25000`. HT-10-a's own prescription, so nothing should change on a guess — rule whether `amount_cents` is owner/admin-only. Lane B inherits it |
| **W2-R2-05** | MINOR · HIGH | Live — `fetchTimeSummary` / `useSectionLoggedMinutes` / `usePhaseActualMinutes` untouched; a rostered member still under-counts per phase |
| **W2-R2-06** | MINOR · HIGH | Live — `project_pricing_studio_id` is still a per-row plpgsql DEFINER call inside three RLS policies and the view; `useTimeEntryLedger`'s `limit` is still optional and applied only `if (limit)` (`use-time-tracking.ts:756/761/778`). No performance measurement this round either |
| **W2-R2-07** | MINOR · HIGH | Live — `00604`'s helper still has **no caller assert** (deliberate, documented at `00604:49-54`) and is called from five places; any authenticated caller learns any project's pricing studio |
| **W2-R2-09** | MINOR · HIGH | Live — `zzzz_audit_time_entry_change_trg` is `AFTER DELETE OR UPDATE … FOR EACH ROW` with **no `WHEN`** (read off `pg_trigger`); one ordinary self-edit by a plain member writes a full audit row |
| **W2-R2-11** | MINOR · HIGH | Live — `apps/designer-portal/src/lib/react-query.ts:309` still defines `studioReport` for the deleted hook |
| **W2-R2-12** | NOTE · HIGH | Live — `00604`'s second profiles assert is still a tautology (`NOT LIKE '% join profiles%' OR LIKE '%left join profiles%'`) |
| **W2-R2-13** | note — ruling owed · HIGH | Live, **re-measured** (P4-13/14): an invoiced row's `notes` are rewritable by the studio owner through the new policy, by `guard_invoiced_time_entry`'s own column list (00177:64-74) |
| **W2-R2-14 / W2-R4-10** | note — ruling owed · HIGH | Live — the author reads none of her own edit's trace; her studio's owner does. Lane B |
| **W2-R2-15 · W2-R2-17** | NOTE · HIGH | Live — `00604` coalesces a missing rate to `0`; `TimeEntryLedgerRow.project_id`/`user_id` non-nullable in TS against a LEFT JOIN |
| **W2-R2-18** | NOTE · MEDIUM | Live — `stamp_time_entry_updated_by` INVOKER with `proconfig = NULL` (re-read from `pg_proc`) |
| **W2-R4-11 · W2-R4-12** | NOTE | Carried to lane B as stated |
| **W2-R5-04 · W2-R5-05** | NOTE · HIGH | Live — the weak project-existence oracle (bound at the top answers identically for "no project" and "no lead"); the invoiced lock + rewritable notes |
| `W2-impl.md` findings 2–5 | acknowledged | unchanged |

### Pre-existing failures, listed separately as the brief asks

Eight, none of them W2's, identical to the r1–r6 baseline, all documented in
`supabase/tests/KNOWN_FAILURES.md`: six in `commercial` (`:69`, `:97-101`, five aborting in
`_countersign_design_services_agreement_impl`) and two in `rls` (`:114-115`). One is worth repeating
because it **touches W2-R7-02's mechanism**: `studio_titles_test.sql` `FAIL f` is *"demoting the sole
active owner should raise `last_owner_protected`"* — and `guard_org_membership_changes` is exactly the
guard standing in the way of the ownership move W2-R7-02 exploits. Pre-existing and out of W2's scope, but
any closure leaning on ownership-transfer hygiene must know the guard is already not firing on this stack.

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. No `hours-ledger.tsx`, no lens, no HT-35 band or
  opt-out, no Desk card, no copy deck, no Sanity article, no `hours-ledger-scope.test.tsx`, no
  `e2e/document/hours.spec.ts`.
- `pnpm --filter @patina/designer-portal test` / `lint`, and the `DATA_MODE=live` e2e line — outside the
  brief's gate list and lane-B-shaped. (Per `patina-verification` no lint result outside designer-portal
  would have meant anything anyway.)
- **W2-R7-01's counterfactual by installation.** I did not re-install a relaxed (a2) to watch P1-3
  succeed; I relied on the returned message naming (a2) and on the 24/24 sweep.
- **W2-R6-03 / case (r) end to end** (twelve steps). I verified its two mechanisms independently — the
  consent-free `organization_members` INSERT (P2-1, P3-1) and 00563's authenticated INSERT arm admitting
  any studio she belongs to (P1-7, P2-3, P3-6) — and the shipped case is green.
- **Concurrency and volume.** No two-simultaneous-stamp race (W2-R4-06's fix is read-the-row-count, not a
  lock); no performance measurement of W2-R2-06's per-row DEFINER policy call.
- **The portal.** W2-R7-02's two statements are both live affordances (`account-studio-page.tsx:1554`
  "Make owner"; member add on the same page) — I read the code, I did not drive the UI. No portal caller
  for the stamp exists (it appears only in `00605`/`00606`, the generated seed, the generated types and
  the test), so W2-R7-01's harm is a DB-level reachability fact rather than a broken button today.
- **No prod anything.** Every command ran against `127.0.0.1:54422`. Nothing was pushed to Strata. W1's
  constraint stands (W1 must not reach Strata ahead of `00606`). **The Strata population of
  `projects.studio_id IS NULL`, split by whether the designer's employer tier is ambiguous and whether
  any of her projects carries a non-NULL `studio_id`, is still uncounted** — it sizes W2-R7-01, W2-R7-02,
  W2-R6-03 and HT-3-d's residue, and it is one read-only query. **Seventh round of asking.**
- **A process observation, not a finding:** `artifacts/hour-tracking-2026-09-11/rulings.md` now carries a
  *"CORRECTED 2026-09-12"* amendment to HT-3-d recording the (e2) reversal, while the round-7 brief
  restates HT-3-d's **uncorrected** text (including *"a confederate she seats as `admin` in that workspace
  is refused for the same reason"*). I reviewed against the brief's text and noted where the correction
  already covers a point. Confirm which is in force before round 8 reads either.
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched. My probe
  scripts live in the session scratchpad, not in the repo, and every one ends in `ROLLBACK` — verified: no
  probe fixture survives on the stack.
