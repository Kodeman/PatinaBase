# W2 — lane A (DB) fix pass, round 4

**Every round-4 finding with a concrete action is applied**: the MAJOR (W2-R4-01) and the two notes it
was ruled with (W2-R4-02, W2-R4-03) under **HT-3-d**, all six MINORs (W2-R4-04 … W2-R4-09, with the
exception noted below for R4-08, which the report itself assigns to W1), and the three NOTEs
(W2-R4-10 … W2-R4-12) to the extent each names one. Nothing was skipped as wrong.

Scope: `supabase/migrations/00606_…` (section 4 rewritten to the single tier-bound arm, its banner, its
COMMENT, its postconditions), `supabase/migrations/00605_…` (one function redefinition + banner +
postconditions), `supabase/migrations/00607_…` (two comments), `supabase/tests/rls/time_entry_studio_stamp_test.sql`
(four new cases, four reshaped, new fixtures), `supabase/tests/rls/time_entry_admin_write_test.sql` (one
new case). **No new migration number**: `00604`–`00607` are unapplied on Strata and unmerged, so the
edit is in place at the plan's numbers (`patina-db-migrations` step 8). No column, no policy, no grant
and no signature changed — the ACL seed and `database.types.ts` regenerate **clean** (both proved
below).

---

## HT-3-d — the ruling, as implemented

```
stamp_project_pricing_studio(p_project_id, p_studio_id) may name ONLY a studio inside the project
DESIGNER's HT-3-b tier at call time — the EMPLOYER tier (her active, non-guest seats with
role <> 'owner') while that tier is non-empty, otherwise the OWNED tier (role = 'owner') — and the
caller must be an OWNER or ADMIN of the studio being named.
```

The body is now one arm. Bound (e) is no longer inside `IF v_designer_id = v_actor`: the tier is a
property of **(this project's designer, `p_studio_id`)** and is tested for every caller. Being the
project's designer is no longer standing in itself.

**What that closes, each re-measured on this program's stack rather than taken from the report:**

| finding | before | after |
|---|---|---|
| **W2-R4-01** (MAJOR) — the confederate | designer seats a second account `admin` in the workspace `00295` provisions for her, that account stamps → **SUCCEEDS**, next hour `99900 / studio_member` | both her own stamp and the confederate's refused `42501 … only from inside its designer's own tier … (HT-3-d)`; column stays NULL; her next hour stays `NULL / none` |
| **W2-R4-02** (note) — the member chooses | a designer seated a plain `member` in two employer studios stamps **either** one, permanently | refused `42501 … only an owner or admin of the studio being named may name it` on both; the repair is the studio's (case (p1), and (f1)/(l3b)) |
| **W2-R4-03** (note) — the owned tier | the owned branch was justified as HT-3-c's sole proprietor but bounded only by the ACTOR being the designer | bounded by the tier for every caller: a studio she owns prices her **only** where she holds no employer seat at all (case (o3)). **Residue, asserted rather than hidden** — see below |

**Two things the implementation adds to the ruling's text, reported rather than assumed:**

1. **The W2-R3-01 `created_by` sibling leg is RETAINED**, as the second half of standing where the
   caller is not the designer herself. HT-3-d's tier bound cannot reach that BLOCKER: the tier is keyed
   on `organization_members`, and an outsider who owns any organization writes the victim designer a
   seat in her own org with one consent-free INSERT (`Org owners can insert members`) — which puts her
   org **inside** the employer tier. I re-measured this: with the sibling's `created_by` leg deleted and
   everything else as shipped, case (k) fails `NO RAISE (returned …a3)` — the attacker takes the
   project again. So the ruling's "there is no other arm" is implemented as *one* arm with *two*
   conjuncts, not as "owner/admin of the named studio" alone. If the orchestrator intends the sibling
   leg gone, cases (d) and (k) must be re-ruled first, because they measure a permanent theft.

   > **CORRECTED IN ROUND 5 (W2-R5-02 — measured).** The sentence above presented this leg as
   > closing the consent-door class. It does not. It closes the class only against an **unwilling
   > victim**: it bounds what an attacker can forge *about a designer who is not helping him*, and
   > bounds nothing about a designer who **is**, because she authors the sibling herself with one
   > INSERT naming his studio (00563's authenticated INSERT arm admits any studio she belongs to,
   > and his consent-free seat made her belong). Measured end to end as case **(r)** of
   > `time_entry_studio_stamp_test.sql`: honest employer pricing the project correctly → confederate
   > opens W2-R2-04's consent door and writes her 99900 → she authors the sibling → her own stamp
   > refused 42501, **his succeeds** → her hours price 99900 → he DELETEs the seat and the project
   > *still* prices from his org, a later hour *still* prices 99900, and he *still* reads every hour
   > of the employer's work. So W2-R2-04's door is **irreversible through the stamp**. The ruled
   > closure is the OWED HT-3-b arm (c) consent door; round 5 pins the shape as a passing assertion
   > rather than guessing a new rule.
2. **The owned tier's residue is pinned as a passing assertion, not a comment.** Where she holds no
   employer seat and owns TWO active studios, both candidates are in her tier, so she may still name
   the `00295` workspace whose rate card she writes (and the other studio's admin then reads none of
   that work). HT-3-d permits it; case **(o6)** asserts it with a message saying that a failure there is
   a **ruling change, not a regression**. That way the next ruling moves a test instead of producing a
   surprise.

Also in section (4), from the MINORs: the act now **writes one `audit_logs` row**
(`project.pricing_studio_stamped`, organization = the studio written, old/new values — W2-R4-05) and
**returns the studio the UPDATE actually wrote** (`RETURNING studio_id INTO v_written`, raising when the
column was filled while the call was deciding — W2-R4-06).

### Bound order, and why it did not move

Standing is still read FIRST, before finality (b) and "already priced" (c). Reordering would have let
any authenticated caller tell "this project id exists and is already stamped" (22023) from "exists,
unstamped, not yours" (42501) — an enumeration oracle the function deliberately does not offer. The two
cases that used to reach 22023 through the old designer arm were given actors **with** standing instead
(case (e): the studio's owner, with a sibling added to the fixture; case (p4): the other employer's
admin, who has full standing and is refused 22023 by finality). Case (i) now asserts the standing
refusal explicitly and points at (p4) for the finality one.

---

## Every other finding

| id | action |
|---|---|
| **W2-R4-04** MINOR | `00606`'s banner sentence rewritten: sections (1)-(3) (three policy statements) revert on their own; **section (4) is not part of that revert**, and dropping it would delete the only path by which a project that reached 'none' can name a studio again. The old "THIS IS THE ONLY CHANGE IN THIS MIGRATION" is gone. The function was **not** moved to a W3 number: it is the repair 00606's own narrowing promises, and splitting them makes the precondition (P-3) harder to state, not easier. |
| **W2-R4-05** MINOR | one `audit_logs` INSERT inside the function (DEFINER, so §0.18's no-INSERT-policy problem does not arise). Asserted by case **(n5)** — exactly one row, naming the actor and the studio written — and pinned by a `00606` postcondition. |
| **W2-R4-06** MINOR | `UPDATE … RETURNING studio_id INTO v_written`; returns `v_written`; raises `22023` when it is NULL. Pinned by a postcondition. |
| **W2-R4-07** MINOR | `guard_commercial_time_entry_derived_fields` redefined in `00605` (lineage **00412 → 00600 → 00605**, body copied verbatim from 00600's, one refusal grafted on): a caller-supplied `updated_by` on INSERT now raises `23514 time entry trace is server-derived`. New case **(j)** of `time_entry_admin_write_test.sql` measures the forgery refused, the row absent, and an ordinary INSERT still landing with `updated_by` NULL. Two postconditions: the new refusal is present, and 00600's own two lists are intact. |
| **W2-R4-08** MINOR | **Not fixed here, and not suppressed.** The report assigns the fix to W1 ("resolve the `:171` expectation per W2-R2-19"), and W2-R2-19 is a ruling the orchestrator owes, not an implementation. I re-ran the gate for the record: `tests/edge_api -f public_rpc_authorization_contract` is still **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`), so the re-registered VALUES row at `:548` is still never reached and §0.17's discharge is still asserted by no green gate. I deliberately did **not** add the file to `KNOWN_FAILURES.md`: the runner's bullet parser would suppress it, and this is a live, unruled disagreement rather than documented residue. It belongs in the program's gate list the moment `:171` is ruled. |
| **W2-R4-09** MINOR | `00607`'s false claim deleted. The comment now says what is true: the `project_id IS NULL` leg is a **fail-safe**, the `scoped` CTE's `ledger.studio_id = p_studio_id` filter makes a project-less row unreachable in this rollup, and **W4 MUST edit this function** (and the CTE) when `project_time_entries.studio_id` lands (W4 `00611`). |
| **W2-R4-10** NOTE | No DB action named, and none taken: it is `audit_logs`' own two SELECT policies and may be what HT-23 intends. Carried forward to lane B — **do not build a "history of this hour" affordance for the author**; she reads 0 rows of her own edit's trace while her studio's owner reads it. |
| **W2-R4-11** NOTE | No DB change needed ("if lane B maps it"). Carried forward: an owner/admin moving an hour onto a project in a studio she does not administer is refused by the rate resolver with a message about rates (`42501 resolve_time_rate_cents: only a studio owner or admin may resolve another member's rate`). Lane B's adjust form must not surface it verbatim. |
| **W2-R4-12** NOTE | Stated in `00607` beside the FILTER it concerns: `billable_*` and `internal_minutes` can count the same row, while `total_minutes` counts it once, so a bucket may read `total 60 / billable 60 / internal 60` — **lane B must not derive the internal group by subtraction.** |
| round-3 carries W2-R3-03/04/05 | all three are now applied (they are R4-05 / R4-04 / R4-06). |
| W2-R3-06 · W2-R2-03 … W2-R2-19 | untouched by design, except where a round-4 finding restated one (R4-07 = R2-08, R4-08 = R2-10, R4-09 = R2-16). W2-R3-06's tie-break question is partly answered by HT-3-d — the racers are now studio owners/admins rather than the member — and case (p) pins "either employer, once, first stamp wins, silently". |

---

## The four test cases the brief asked for, and proof they have teeth

`supabase/tests/rls/time_entry_studio_stamp_test.sql` grows from (a)–(l) to **(a)–(p), sixteen cases**;
`time_entry_admin_write_test.sql` from (a)–(i) to (a)–(j).

| case | what it measures |
|---|---|
| **(m)** | **the r4 confederate manoeuvre**, through RLS, with BOTH of its preconditions asserted to SUCCEED so the case cannot go vacuous: the consent-free `admin` seat INSERT (`m2`) and her own named-studio sibling project in the workspace (`m3` — which CLEARS the retained W2-R3-01 leg, so the refusal can only be the tier). Her own stamp refused (`m5`), the confederate's refused (`m6`), the column still NULL (`m7`), and her next hour still `NULL / none` (`m8`). |
| **(n)** | an **employer's ADMIN** stamps the employer → the designer's next hour prices at the employer's `25000 / studio_member` (`n4`), HT-3-a step 1 answers with it (`n3`), and the act leaves exactly one audit row (`n5`). |
| **(o)** | a designer with **no employer seat** and two owned studios is priced by neither (`o1`), stamps one she owns (`o3`), and her next hour prices from the studio she NAMED — `30000`, not the `99900` she wrote herself (`o4`); the other principal reads the work (`o5`); and the residue is asserted (`o6`). |
| **(p)** | **two employers**: the designer (a plain member of both) may stamp neither (`p1`), Stamp Six's admin stamps Stamp Six (`p2`), Stamp Seven's admin stamps Stamp Seven on her other project (`p3` — *either* employer), and the stamp is **final**: the same admin, with full standing, is refused **22023** on the project Stamp Six took (`p4`). |

**Negative controls — four bodies installed by hand on this stack, the suite run against each, then the
shipped body restored and re-verified (16/16):**

| function body installed | result |
|---|---|
| HT-3-d's tier bound **gated on the actor** (round 3's shape grafted onto the new standing) | `ERROR: FAIL m6 (W2-R4-01, THE MAJOR OF ROUND 4) … got NO RAISE (returned <her workspace>)` — the confederate stamps again. **This is the control that proves (m) measures the finding and not something else.** |
| the **round-3 body** verbatim (`git show HEAD:…00606…`) | `ERROR: FAIL f1 (HT-3-d, and W2-R4-02) … got NO RAISE (returned …a2)` — the plain-member designer stamps her employer again |
| the tier bound's `CASE` replaced by `true` (tier deleted) | `ERROR: FAIL l3 (W2-R3-02, THE MAJOR) … got NO RAISE (returned <her workspace>)` |
| the sibling's `created_by` leg deleted | `ERROR: FAIL k4 (W2-R3-01, THE BLOCKER) … got NO RAISE (returned …a3)` |
| the shipped body | all sixteen cases `passed` |

One fixture correction worth recording: `(o)`'s two-owner studio could not be built as a **co-owned**
one. `guard_org_membership_changes` (00484) admits an `owner` INSERT without an owner-actor only into an
org with **no** memberships at all (`owner_insert_requires_owner`), so the second owner row is refused
for a postgres fixture. The case seats the second principal as **`admin`** instead — which preserves
everything the case needs (she is the owner, the owned tier is ambiguous, another principal reads the
studio's hours) and is the shape that is actually reachable in the product.

---

## Gates (every one the brief names, re-run verbatim after the final edit)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, every `DO $postcondition$` passed (00605 now has two more, 00606 four rewritten/added) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected** — the identical W1/r1/r2/r3/r4 baseline. All six abort in the design-services-agreement path and all six are the documented ones (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`): `authorized_schedule :308`, `design_services_authority :177`, `executed_on_paper :214`, `trade_rfq :154`, `trade_scope :196` (all `design services agreement … not found or access denied`) and `design_services_gap_hardening :194` (`legacy release blocked by the wrong guard: 'schedule line … not ready for authorization: ["designDisposition"]'` — the OTHER message its own KNOWN_FAILURES entry records, so the family is unchanged). W2 touches no agreement path. As in round 4, passing `-k` did not convert them to expected-fail from the repo root. |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -H 127.0.0.1 -p 54422` (**all**) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` and `studio_titles_test.sql`, both documented at `supabase/tests/KNOWN_FAILURES.md:114-115`, both pre-existing and unrelated. The three `time_entry_*` files, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio.test` and `00584_studio_comember_rls_sweep.test` are all green. |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate; full route table printed) |
| `python3 scripts/generate-legacy-grants.py` + `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 replayed statements — no GRANT/REVOKE moved) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (no signature, column or view shape changed) |
| beyond the brief: `tests/edge_api -f public_rpc_authorization_contract` | **RED at `:171`**, unchanged — W1's, W2-R4-08, ruling owed (see the table above) |

All against API 54421 / Postgres `127.0.0.1:54422` (`project_id "patina-hours"`). The shared 54321/54322
stack was never touched. **Nothing was pushed to Strata; no prod anything.** `supabase/config.toml`
stays skip-worktree'd, untouched and in no commit.

## Program rules re-checked against this diff

No flag (`grep -iE 'feature_flag|useFeatureFlag|posthog'` over the added lines: nothing). No backfill —
the stamp still writes one project's column, only when a caller asks, only where it is NULL, and the
only other DML added is the act's own `audit_logs` row. Additive only: no column, type, NOT NULL,
default, index or policy in this pass. The client-supplied-rate discard is strengthened, not weakened
(`updated_by` joins the refused set). The invoiced-entry lock is untouched. No running-timer index
change. No rollup return-shape change, so `notes` still cannot appear in one. The 00484 quartet's four
names, commands, role sets and permissive flags are untouched (`00606`'s postconditions (b)/(c) re-assert
them on every reset). Migrations stay at the plan's numbers; `00605` now carries a lineage line for the
one function it redefines.

## What I did not do

- **Lane B** (phase 2) — nothing in `hours-ledger.tsx`, the lens, the band, the Desk card, the copy deck
  or the Sanity article. Two notes above are addressed TO lane B rather than fixed here (R4-10, R4-11,
  R4-12).
- **W2-R4-08's actual fix** — W1's, and gated on the W2-R2-19 ruling. The gate was run and reported;
  the file was deliberately not added to `KNOWN_FAILURES.md`.
- **No concurrency or volume measurement.** W2-R4-06's fix is read-the-row-count, not a lock; two
  simultaneous stamps were not raced, and W2-R2-06's per-row DEFINER cost was not measured.
- **No portal caller for the stamp** — there still is none (grep: the function appears only in
  `00605`/`00606`, the generated seed, the generated types and the two test files). Whoever builds one
  must hand it an owner/admin actor, not the designer.
- **The Strata population of `projects.studio_id IS NULL` is still uncounted** — the reviewer's standing
  request, fourth round of asking. It is the exact population HT-3-d, W2-R2-02, W2-R2-04 and the
  residue above all turn on, and it should be one read-only count before any deploy decision.
