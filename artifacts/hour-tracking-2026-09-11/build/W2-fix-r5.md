# W2 — lane A (DB) fix pass, round 5

Two findings, both MAJOR/HIGH, both **ruling-shaped by the reviewer's own instruction**. What round 5
lands:

| finding | state after this pass |
|---|---|
| **W2-R5-01** | **reproduced 1/1 on this stack, then CLOSED in its measured form** (the designer as the SOLE actor) by a new bound **(e2)** in `00606`. Its accomplice half is **still open**, and is now a passing, loudly-labelled assertion (case (q) q8–q11) instead of an undiscovered hole. |
| **W2-R5-02** | **reproduced 1/1 and NOT closed** — the closure the reviewer names is the OWED HT-3-b arm (c) consent door. Pinned as case (r), and `W2-fix-r4.md` note 1 corrected as the finding asks. |
| both | every banner / `COMMENT` / postcondition sentence claiming the act cannot move money is **gone**, replaced by what is measured. That was the one unconditional imperative in W2-R5-01's FIX. |

Scope: `supabase/migrations/00606_time_entries_studio_read_narrow.sql` (one bound added, banner + `COMMENT`
+ two postconditions rewritten, one postcondition added), `supabase/tests/rls/time_entry_studio_stamp_test.sql`
(two new cases (q), (r) with fixtures; header index rewritten; case (e)'s index line corrected), and
`artifacts/.../W2-fix-r4.md` note 1. **No new migration number** — `00604`–`00607` are unapplied on
Strata and unmerged, so the edit is in place at the plan's numbers (`patina-db-migrations` step 8). No
column, type, index, policy, grant or signature changed: the ACL seed and `database.types.ts` both
regenerate **clean** (proved below).

---

## W2-R5-01 — reproduced, and what was done about it

### Reproduced first, before any edit

The finding was re-measured on this program's stack (`127.0.0.1:54422`), through RLS, as new case **(q)**
run against the round-4 body. Every step of the manoeuvre is an asserted precondition, so the case cannot
go vacuous:

| assertion | measured against the round-4 body |
|---|---|
| q1 — baseline pricing | `Stamp Quiet` (the honest employer) — **the project was priced CORRECTLY** |
| q2 — baseline hour | `25000 / studio_member` |
| q3 — consent-free `admin` seat INSERT | **SUCCEEDS** (`Org owners can insert members`) |
| q4 — `transfer_studio_ownership(workspace, that account)` | **SUCCEEDS**, and her own row is left at role **`admin`** (00484:524-536 demotes `auth.uid()`) |
| q5 — her own sibling project naming the workspace | **SUCCEEDS** (clears bound (a2)'s `created_by` leg) |
| q6 — pricing after two statements | **NULL** — she MANUFACTURED the `'none'` this act exists to repair |
| **q7 — her own stamp** | **`NO RAISE (returned <her workspace>)`** — the stamp SUCCEEDED |

So the finding is exact, including the part that makes it worse than round 4's: the act did not repair
`'none'`, it **created** `'none'` on a project an honest employer was pricing correctly, and then took
the work permanently (bound (b)).

### What landed: bound (e2)

```
while the project's DESIGNER holds any employer seat, SHE may not name a studio she herself administers
```

Five lines of `EXISTS`, placed after bound (e) and before the write. It is candidate **(i)** from the
finding, and it is gated on the designer being the **actor**.

**Why gated on the actor, when round 4 moved bound (e) off the actor for good reasons — measured, not
reasoned.** Written as a property of (the designer, `p_studio_id`) and applied to every caller, the
refusal was installed on this stack and the suite run: **case (n) aborts** with the new message, and
(g)/(h) never run. The reason is in the round-4 fixture and is entirely ordinary — `Stamp Designer` is an
**`admin` of her honest employer**. Under the broad form the employer's own ADMIN and its OWNER can no
longer repair her legacy project, no other studio is in her tier, and the project is `'none'` **for ever
with no act available to anybody** — which is precisely the harm W2-R2-02 found and section (4) exists to
end. At call time an `admin` seat at an honest employer and an `admin` seat in a workspace she handed to
a confederate a second ago are **the same shape**; only *when* the role was written separates them, and
that is candidate **(iv)**, a new rule. So the broad form is a regression, not a narrowing, and the
narrow form is what shipped.

**What (e2) therefore does NOT reach, and this is stated in the migration, the `COMMENT`, the
postcondition and the test.** HT-3-d has two operative consequences. The first — *"a designer naming her
own workspace while she has any employer is refused"* — is now **true**. The second — *"a confederate she
seats as admin in her workspace is refused for the same reason (the workspace is not in the tier)"* — is
**still false** after the demotion, because the workspace genuinely *is* in the tier then and bound (e)
cannot tell it from an employer. Measured as case (q) q8–q11 against the **shipped** body:

| q8 | the account she handed the title to **stamps the workspace — SUCCEEDS** |
| q9 | the column is written, permanently (bound (b)) |
| q10 | her next hour prices **`99900 / studio_member / 199800` rated**, not the employer's 25000 |
| q11 | the honest employer's OWNER reads **0 rows** of her own studio's work, and cannot re-stamp |

Each of those four is a **passing** assertion whose message says *"NOT A REGRESSION IF IT FAILS — a ruling
closed the accomplice door; rewrite q8-q11 to assert 42501"*. That is the round-4 `(o6)` pattern, used
here so that the ruling moves a test instead of producing a surprise in a sixth round.

### The decision still owed to the orchestrator

Nothing shipped contradicts HT-3-d's letter, and nothing here guesses a rule. What closes q8–q11 (and
case (r)) is one of:

| candidate | what it costs, measured or named |
|---|---|
| **(iii)** HT-3-b arm (c)'s consent door (already OWED) | closes case (r) and W2-R2-04's neighbours. **Does NOT close q8–q11** — the seat exploited there is her OWN 00295 seat, which no consent gate would have held back. |
| **(iv)** evaluate the tier (and bound (a2)'s sibling) over seats/projects **predating the target project** | the only thing that actually separates the honest `admin` seat from the manufactured one. Closes q8–q11 **and** case (r) in one move. A new rule, and it changes what a *new* studio can repair. |
| **(ii)** require the designer's `studio_member_rates` row in `p_studio_id` to be authored by somebody else | closes the sole-actor and the confederate form where she wrote her own number; **moves case (o6)**; and denies the repair outright to a designer who legitimately authored her own rate row as a studio admin. Still falls to an accomplice writing the row for her. |
| **(i)-broad** the designer-property form of (e2) | **measured to break cases (n) and (g)/(h)** — see above. Not a candidate without a ruling that accepts permanent `'none'` for admin-designers. |

Until one lands, **this act moves money for a designer with one accomplice account**, and the exposure is
exactly the `projects.studio_id IS NULL` population on Strata — still uncounted, fifth round of asking.

---

## W2-R5-02 — reproduced, pinned, not closed

Measured 1/1 as new case **(r)**, against the shipped body, every step through RLS:

| assertion | measured |
|---|---|
| r1/r2 — baseline | the honest employer `Stamp Rosewood` prices the project; her hour is `25000 / studio_member` |
| r3 — the consent-free seat in the confederate's own org | **SUCCEEDS** (W2-R2-04's door) |
| r4 — pricing after it | **NULL** — the door manufactured bound (c)'s precondition |
| r5 — **SHE** inserts a project naming his org | **SUCCEEDS** — 00563's authenticated INSERT arm admits any studio she belongs to, so bound (a2)'s `created_by` sibling is something a **willing** designer authors herself |
| r6 — her own stamp | correctly refused **42501** (plain member, bound (a)) |
| **r7 — HIS stamp** | **SUCCEEDS** |
| r8 — her next hour | **`99900 / studio_member`** |
| r9 — he DELETEs the seat (the cause) | **SUCCEEDS** |
| r10 — pricing with the cause gone | **still his org** — bound (b) is final, no honest party can re-stamp |
| r11 — an hour logged AFTER the seat was removed | **still `99900 / studio_member`** |
| r12 — his read | **3 rows**, every hour of the honest employer's project |

So W2-R2-04's consent door is **irreversible through the stamp**, which is what round 4 ruled must not
survive. r7, r8, r10, r11 and r12 are passing assertions labelled *"NOT A REGRESSION IF IT FAILS — the
owed HT-3-b arm (c) consent door landed; rewrite r7 to 42501"*.

**`W2-fix-r4.md` note 1 is corrected**, as the finding asks, with a blockquote saying plainly that the
`created_by` leg closes the class only against an **unwilling** victim: it bounds what an attacker can
forge about a designer who is not helping him, and bounds nothing about one who is. The migration's own
"ONE LEG OF ROUND 3 IS RETAINED" paragraph carries the same correction, and so does the `COMMENT`.

**Grading, in the reviewer's own terms:** the reviewer offers that "closure depends on an owed ruling"
re-grades this as a note rather than a major. On that reading round 5 is clean except for W2-R5-01's
accomplice half, which is the same class and the same owed ruling.

---

## Every sentence that claimed the act cannot move money

| site | before | after |
|---|---|---|
| `00606` postcondition on bound (c) | *"it repairs 'none', it does not move money"* | the bound "keeps the act pointed at 'none' … **is NOT a claim that the act cannot move money**", naming W2-R5-01, W2-R5-02 and the two pinned cases |
| `00606` banner, round-4 paragraph | *"Under HT-3-d that workspace is refused to EVERY caller while she holds an employer seat"* | an `AMENDED IN ROUND 5` section: that was FALSE as written and measured so; the mechanism (a role test she can write); the two shapes still open; the named candidates; and the uncounted Strata population |
| `00606` banner, "ONE LEG OF ROUND 3 IS RETAINED" | presented `created_by` as closing the consent-door class | `CORRECTED IN ROUND 5` — safe against an unwilling victim only |
| `00606` `COMMENT ON FUNCTION` | the `created_by` leg as the closure; no mention of role authorship | both corrections, plus **"THIS ACT CAN STILL MOVE MONEY for a designer with one accomplice account"** and where the two cases live |
| test header, case (e) index line | *"this repairs 'none', it does not move money"* | *"NOT a guarantee that the act cannot move money: see (q) and (r), where 'none' is MANUFACTURED on a correctly-priced project"* |

One new postcondition pins (e2) by source, and its message records **both** deliberate scopes (the OWNED
arm untouched; the actor gate) with the measured reason each must not be widened without a ruling.

---

## Negative controls — three bodies installed by hand, the suite run against each, the shipped body then restored and re-verified

| body installed | result |
|---|---|
| (e2) disabled (`IF false AND …`), everything else as shipped | `ERROR: FAIL q7 (W2-R5-01, THE MAJOR OF ROUND 5) … got NO RAISE (returned <her workspace>)` — **this is the control that proves (q) measures the finding** |
| (e2) as a **designer-property** bound for every caller (candidate (i) broad) | `ERROR: stamp_project_pricing_studio: a designer may not name a studio she herself administers …` aborting **case (n)** at `:671` — the honest employer's own ADMIN refused; (g)/(h) never reached |
| the round-4 body (no (e2)) — measured before any edit | q1–q6 all passed, **q7 `NO RAISE`**: the manoeuvre reproduced end to end |
| the shipped body | **16/16 cases** `passed` / `recorded` |

## Gates

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, every `DO $postcondition$` passed (00606 now has one more) |
| object-level probe after that reset (`pg_proc.prosrc LIKE '%IF v_actor = v_designer_id AND v_designer_has_employer_seat%'`) | **present** — the shipped body came from the migration replay, not from my psql control runs (`patina-db-migrations` step 7) |
| `run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` (**all**) | **28 green / 30, 2 unexpected** — `design_requests_test.sql`, `studio_titles_test.sql`, both documented (`supabase/tests/rls/KNOWN_FAILURES.md:114-115`), both pre-existing and unrelated. Identical to the r1–r4 baseline. The three `time_entry_*` files, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio.test` and `00584_studio_comember_rls_sweep.test` are green. |
| `run-sql-tests.sh -d …/supabase/tests/billing …` | **7 green / 7**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — the identical W1/r1–r4 baseline, all six in the design-services-agreement path and all six documented (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`). W2 touches no agreement path. |
| `python3 scripts/generate-legacy-grants.py` + `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 replayed statements — no GRANT/REVOKE moved) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (no signature, column or view shape changed) |

All against Postgres `127.0.0.1:54422` (`project_id "patina-hours"`). The shared 54321/54322 stack was
never touched. **Nothing was pushed to Strata; no prod anything.** `supabase/config.toml` stays
skip-worktree'd, untouched and in no commit. The commit touches exactly two files.

| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/manufacturer-portal type-check` | clean |
| `git push origin hour-tracking/server` | **landed** — `7d0ffb910..d7a240259`. The pre-push hook's affected verification printed one `Affected verification has advisory failures.` line (advisory, non-blocking) and the background capture retained only its last 8 lines, so the failing workspace is not named; the three type-checks above were then re-run by hand and are clean, and the diff is two SQL files with `database.types.ts` proved byte-identical, so no TS input moved. `pnpm --filter @patina/admin-portal build` (the repo's strictest gate) was **not** re-run this round. |

The TS gates cannot have moved on their own evidence — the diff is two SQL files — but they were run
rather than asserted.

## Program rules re-checked against this diff

No flag. No backfill — the stamp still writes one project's column, only when a caller asks, only where
it is NULL. Additive only: no column, type, NOT NULL, default, index or policy. The invoiced-entry lock
untouched. No rollup return-shape change, so `notes` still cannot appear in one. The 00484 quartet's four
names, commands, role sets and permissive flags untouched (00606's postconditions (b)/(c) re-assert them
on every reset). `set_project_studio_id` is not redefined. Migrations stay at the plan's numbers.

## What I did not do

- **I did not pick the orchestrator's ruling.** W2-R5-01's FIX says "Ruling-shaped; do not guess". Bound
  (e2) implements HT-3-d's own **first** operative sentence, in the narrowest form that regresses nothing
  (the broad form's regression is measured above). HT-3-d's **second** sentence, and W2-R5-02, need one of
  candidates (ii)/(iii)/(iv) and are pinned, not guessed.
- **Nothing in lane B.** No portal caller for the stamp exists yet (grep: the function appears only in
  `00605`/`00606`, the generated seed, the generated types and the two test files). Whoever builds one must
  hand it an owner/admin actor who is **not** the project's designer.
- **No concurrency or volume measurement.** Two simultaneous stamps were not raced.
- **`transfer_studio_ownership` was not touched**, and neither was the consent-free
  `organization_members` INSERT (candidate (iii)) — both are the cause, both are other waves' rulings.
- **The Strata `projects.studio_id IS NULL` count is still not taken** — fifth round of asking. It is one
  read-only query and it sizes every residue above.
