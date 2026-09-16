# W2 — lane A (DB) fix pass, round 7

Two MAJORs, one MINOR, and **one ruling that resolves all three**: HT-3-e, ruled by the orchestrator
2026-09-12 in three parts. Round 7 implements it exactly — the stamp's employer arm in `00606`, the
self-authored-rate rule in a NEW migration **`00615`**, the accepted residual recorded in `rulings.md` —
and measures both directions **by installation**, which is the one thing review round 7 said it had not
done.

| finding | state after this pass |
|---|---|
| **W2-R7-01 · MAJOR** (bound (a2) refuses everybody on the legacy population; HT-3-a's remedy reaches nobody) | **CLOSED by HT-3-e(1).** The second half of standing is now split by tier: an **arm's-length rate** in the employer tier, round 3's `created_by` **sibling** in the owned tier. Measured both ways — with round 6's body installed by hand an employer owner holding an arm's-length rate is refused `42501`; with the shipped body she succeeds. New cases **(u)** (the ordinary hire) and **(v)** (the 24-call sweep, then the whole legacy book repaired) |
| **W2-R7-02 · MAJOR** (her resolved rate becomes a number SHE set) | **CLOSED for the self-authored form by HT-3-e(2)** (`00615`, resolver only). Case (q)'s q7 **and** q8 are now REFUSED — the first time either half has been — her hours file `'none'` instead of 99900, and the honest employer recovers the project. The **accepted residual** (a cooperating account AUTHORS her rate) is HT-3-e(3) and is asserted as passing, loudly labelled, at q13/q14/q15 |
| **W2-R7-03 · MINOR** (round 6's replacement sentences are themselves false) | **FIXED in all four places** — 00606's banner, its `COMMENT`, the bound-(c) postcondition's dead "(e2) closes the sole-actor form", and case (s)'s sentence — and **probe P8 is now an assertion**: case (s) s8/s8b/s8c/s8d, plus `time_rate_resolution_test.sql` case **(ag)** |
| **W2-R7-06 · note** (the suite asserted (a2)'s cost as expected) | **Discharged by the same change** — s3 now asserts the employer owner REPAIRING, on a second legacy project of hers |
| **W2-R7-07 · note** (`studio_member_rates_admin_insert` has no self-exclusion) | **Answered at the RESOLVER, not at the policy** — the policy is W1's and is untouched; s8 asserts the INSERT still succeeds and s8b asserts the number does not price. Rule them together, as the reviewer asked: HT-3-e(2) is that ruling |
| **W2-R7-04 · MINOR** (the postconditions are spelling gates) | **Not actioned** (the brief named HT-3-e). The new postcondition in `00606` and the ten in `00615` are the same class of check, and their messages say what they pin rather than promising enforcement; the real property lives in the cases. Carried |
| **W2-R7-05 · MINOR** (wrong `KNOWN_FAILURES.md` path cited) | **FIXED in this report**: the eight pre-existing failures are documented in **`supabase/tests/KNOWN_FAILURES.md`** (`:69`, `:97-101`, `:114-115`). There is no per-directory file, which is exactly why the runner prints them as "unexpected" |

---

## What landed, file by file

### 1. `supabase/migrations/00606_time_entries_studio_read_narrow.sql` — HT-3-e(1)

* **New bound (a1)**: HT-3-b's two tier facts are computed once, up front —
  `v_designer_has_employer_seat` (moved up from bound (e), which now reads it) and
  `v_named_is_employer_seat` (is the studio NAMED one of her employer seats?).
* **Bound (a2) now branches**:
  * **employer tier** → the studio named must already hold a `studio_member_rates` row for this
    designer that somebody other than she wrote (`created_by IS NOT NULL AND created_by <> v_designer_id`).
    Message: *"this studio holds no rate for this project's designer that somebody other than she wrote,
    so naming it is not yours to do (HT-3-e)"*.
  * **owned tier** → round 3's sibling leg, byte-identical, still gated on `v_actor <> v_designer_id`.
  * **neither** (she holds an employer seat and names a studio she OWNS) → no leg fires; bound (e)'s tier
    refusal is the one that speaks, which is the honest message for that caller.
* Why the employer arm costs an honest studio nothing: a studio with no rate card for her prices her hour
  `'none'` after the stamp anyway, so the stamp would buy it nothing. The one thing it does cost is
  ORDER: the studio prices her first, then repairs the project. Cases (e) and (p) needed exactly that row
  added to their fixtures, and it is the ordinary state of an employer.
* **New postcondition** pinning the split by source (`IF v_designer_has_employer_seat AND
  v_named_is_employer_seat THEN` … `ELSIF NOT v_designer_has_employer_seat THEN`), with a message saying
  why one unconditional leg cannot serve both tiers.
* The standing postcondition now also requires `other_author.created_by <> v_designer_id` beside
  `sibling.created_by = v_designer_id`.
* **W2-R7-03's false sentences**: the banner and `COMMENT` now say what (e2) actually bought (one
  refusal — the one-account admin-designer of probe P8 — reachable with no confederate), name it as the
  refusal that belongs at the rate, and point at `00615`. The bound-(c) postcondition's *"Bound (e2)
  closes the sole-actor form"* is replaced by what actually closes it.
* No column, type, index, policy, grant, signature or return shape moved. One refusal removed (the
  sibling leg in the employer tier), one added (the arm's-length rate).

### 2. `supabase/migrations/00615_self_authored_rate_requires_ownership.sql` — HT-3-e(2) · NEW

* **Number.** `00604`–`00607` are all used, so per the ruling's own instruction the rule lands at
  **`00615`, the W5-reserved number**, and that is recorded here and in `rulings.md`: **`00615` is now
  W2's and W5 mints from `00616`.** `00599`/`00601` are already merged to `hour-tracking/integration`
  (verified with `git -C …/agent-integration log --oneline -- supabase/migrations/00599_…`), so neither
  was edited.
* **Body grafted verbatim.** `grep -rln "CREATE OR REPLACE FUNCTION[^(]*resolve_time_rate_cents"
  supabase/migrations/*.sql | sort | tail -1` names `00599` as the ONLY definition; the body is copied
  from it with **one clause added** inside tier 2's single SELECT:

  ```sql
  AND (
    rate.created_by IS DISTINCT FROM rate.user_id
    OR EXISTS (SELECT 1 FROM public.organization_members AS owner_seat
               WHERE owner_seat.organization_id = v_studio_id
                 AND owner_seat.user_id = rate.user_id
                 AND owner_seat.status = 'active'
                 AND owner_seat.role = 'owner')
  )
  ```

  Lineage banner `00599 → 00615`. Tier 1, the three asserts, the role ladder, the UTC anchor and
  HT-3-b's derivation are byte-identical.
* **The classifier is NOT redefined, and the banner says why**: `classify_project_time_entry_authority`
  reads a rate in exactly one place — `resolve_time_rate_cents`, called once up front (`00601:251`),
  pinned by `00601`'s own postcondition at `:530` — and `studio_member_rates` appears nowhere else in
  its code. `00604`'s view and `00602`/`00603`'s stamp each carry a postcondition forbidding the table by
  name. Redefining a 222-line monolith to change nothing would have been the graft hazard
  `patina-db-migrations` step 2 exists to prevent.
* **Postconditions (10 + 4)**: the clause itself (`rate.created_by IS DISTINCT FROM rate.user_id`), the
  exemption (`owner_seat.role = 'owner'`), that the ownership question is asked of **v_studio_id** and of
  an **active** seat, `studio_member_rates` still read exactly once, `organization_members` read exactly
  **three** times — plus every `00599` property re-asserted on the grafted body (DEFINER, pinned
  search_path, no EXECUTE for anon **or** authenticated, change-order leg cut, `default_hourly_rate_cents`
  absent, the relationship assert, trigger-depth gate, UTC anchor, step 1, the designer's seat key,
  employer-before-owned order, exactly two `ORDER BY`, no date key, tier 3 `'none'`).
* **One `00599` postcondition is deliberately superseded and named**: `00599` asserts
  `organization_members` appears EXACTLY twice ("a third read is a membership question about somebody
  else"). It now appears three times — the third being HT-3-e(2)'s question about the SUBJECT BEING
  PRICED. `00599` is merged and passed against its own body; `00615` supersedes it by number and pins the
  count at three.
* **And it is not W1's deleted "arm's-length key"**: that key CHOSE BETWEEN STUDIOS (preferring a
  candidate studio holding a rate somebody else wrote) and W1-R5-02 measured it buyable with one signup.
  HT-3-e(2) ranks nothing: the studio is settled by HT-3-a/HT-3-b before tier 2 is reached.
* `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` restated (CREATE OR REPLACE keeps the ACL; this is
  belt-and-braces on W1-R7-04) → the generated ACL seed was regenerated.

### 3. `supabase/tests/rls/time_entry_studio_stamp_test.sql` — 20 case blocks (was 18)

| case | change |
|---|---|
| **(u)** NEW — review probe **P1** | The ordinary hire: plain `member` of TWO employers, one legacy project, no sibling anywhere. She is refused (bound (a)); employer one's OWNER, its ADMIN and employer two's OWNER are all refused **before any rate exists** (u4/u5/u6) with the column still NULL (u7); the employer then prices her with ONE row and its ADMIN performs the repair (u8); her next hour prices at the employer's 28000 (u9) and HT-10's read + total reach the owner (u10) |
| **(v)** NEW — review probe **P7** | The population: THREE legacy projects, all `created_by` her, neither studio holding any project that names it (v1). The **24-call sweep** (4 actors × 3 projects × 2 studios) is asserted refused 24/24 with three NULL columns (v2/v3); both studios price her; owner, ADMIN and the OTHER employer then repair one project each (v4/v5/v6); no column is left NULL (v7) and each hour prices from the studio that repaired it (v8/v9) |
| **(t)** NEW — the residual HT-3-e(1) does NOT bound | Runs after (d)/(k) on the same victim project: the W2-R3-01 outsider writes the victim designer's rate row **in her own org under her own id** — arm's-length *to the designer*, which is what the leg tests — and her stamp then SUCCEEDS (t3), the money follows at her number (t5) and the designer's own studio reads none of it (t6). Asserted as PASSING and labelled; closure is the **already-owed HT-3-b arm (c) consent door** |
| **(q)** rewritten | q7 (her stamp) and q8 (the confederate's) now **REFUSED** with the column NULL; q10 her hour files `'none'` instead of 99900/199800; **q11/q12 the honest employer recovers the project and prices her at 25000 again**; then HT-3-e(3)'s residual on two further projects — the cooperating account AUTHORS her rate (q13 its stamp succeeds), SHE stamps the third (q14), her hour prices 99900/199800 (q15), and the honest owner reads 0 rows of the two taken projects (q16). A third legacy project was added to the fixture so no half is a retry |
| **(s)** rewritten | A second legacy project added. **s3 now asserts the employer's OWNER REPAIRING** (was: refused — W2-R7-06); s4–s7 unchanged; **s8/s8b/s8c/s8d are probe P8**: her own 99900 INSERT still succeeds (the capability is W1's), the hour she logs today comes back `'none'`, an hour inside the employer's own span still prices its 26000, and one new owner row prices her at 27500; s9 the owner reads both rate rows |
| **(d)**, **(k)** | messages corrected — the refusal is now the arm's-length-rate leg, and they point at (t) |
| **(e)**, **(p)** | fixtures gained the rate rows HT-3-e(1) asks of an employer (24000 for Stamp Priced in a1; 22000/23000 in a6/a7). Without them (e) would meet a standing refusal before bound (c)'s 22023, and (p)'s admins could not stamp |
| (a)(b)(c)(f)(g)(h)(i)(j)(l)(m)(n)(o)(r) | unchanged and green. (l) and (r) both still measure their takings: (r)'s confederate-authored rate is arm's-length, so his stamp and the 99900 survive — that is HT-3-e(3) and the owed consent door |

### 4. `supabase/tests/billing/time_rate_resolution_test.sql` — case (ag) NEW

Five legs, all through RLS as the named actor: **ag1** her own row in a studio she does not own ⇒ `'none'`
(and the resolver and classifier agree); **ag2** an hour inside the employer's own span still prices at
the employer's 20000 — "the next qualifying row, authored by someone else, prices", and a self-authored
row cannot re-price the history it closed; **ag3** the studio writes one new row and pricing resumes;
**ag4 THE NON-REGRESSION** — the OWNER's own row in the studio she OWNS still prices (HT-3-a arm (a),
HT-3-c's sole proprietor); **ag5** `created_by` NULL (a deleted author — `profiles ON DELETE SET NULL`)
prices, recorded rather than assumed. The file's header sentence *"no … created_by key survives"* is
corrected: `created_by` is now a test OF ONE ROW, never a choice between studios.

### 5. `rulings.md` — HT-3-e recorded

One row after HT-3-d: the question (both MAJORs, with the 24/24 and P8 measurements), the three ruled
parts verbatim, the implementation (00606 + **00615**, the W5-number reservation spent and W5 minting from
00616), the coverage list, the two directions measured by installation, and the **two residues the
implementation reports rather than assumes** — (i) the W2-R3-01 outsider admitted by the employer arm,
(ii) the `'none'` an honest studio sees until it writes a rate row where a member's self-authored row has
closed its own.

---

## Negative controls — both directions, by installation

The reviewer's one listed omission ("W2-R7-01's counterfactual by installation") is closed:

| body installed by hand | measured |
|---|---|
| `00599`'s resolver body (HT-3-e(2) absent) | case **(ag)** aborts at **ag1** with `got 99900 / studio_member / 199800` — exactly round 7's probe P8 number, with one account and one statement |
| round 6's `00606` (`git show HEAD:…00606…`) | a standalone fixture's employer OWNER, holding an arm's-length rate, is refused `42501 … this studio holds no project that this project's designer both leads and created` — W2-R7-01, reproduced |
| the shipped bodies, restored by `supabase db reset` | the same control returns `SUCCEEDED`; case (ag) green; object probe on `pg_proc`: `e2_clause = t`, `owner_exemption = t`, `e1_clause = t`, `owned_sibling = t`, `tier_split = t` |

## Gates

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00615` applied after `00607`, every `DO $postcondition$` passed (00606's 1 new assert, 00615's 14) |
| object probe after that reset (`patina-db-migrations` step 7) | `resolve_time_rate_cents`: HT-3-e(2) clause + owner exemption present. `stamp_project_pricing_studio`: arm's-length leg, owned sibling leg and the tier split all present |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`. **All six pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`); W2 touches no agreement path |
| `run-sql-tests.sh -d …/supabase/tests/rls …` (all 30) | **28 green / 30, 2 unexpected** — `design_requests_test.sql`, `studio_titles_test.sql`, **both pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:114-115`). `time_entry_studio_stamp_test` (now **20** case blocks, was 18) and `time_rate_resolution_test` (now **34**, was 33) both green |
| `python3 scripts/generate-legacy-grants.py` | regenerated (baseline + **2624** replayed statements; +6 lines, `00615`'s REVOKE) — the seed is committed |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (no signature, column or view shape moved) |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (the repo's strictest gate; full route table printed) |

Pre-existing failures, listed separately as the brief asks: **eight**, none of them W2's, identical to the
r1–r7 baseline — six in `commercial`, two in `rls`, all in `supabase/tests/KNOWN_FAILURES.md`. The runner
calls them "unexpected" because it looks for a **per-directory** `KNOWN_FAILURES.md` that does not exist
(W2-R7-05).

All on this program's own stack, Postgres `127.0.0.1:54422` (`project_id "patina-hours"`). The shared
54322 stack was never touched. **Nothing was pushed to Strata; no prod anything.**
`supabase/config.toml` stays skip-worktree'd (`S`), untouched and in no commit.

## Program rules re-checked against this diff

No flag. **No backfill** — `00615` redefines one function body; not one row is written, and the rule is
read when an hour is priced. **Additive only**: no column, type, NOT NULL, default, index or policy; two
function bodies and one REVOKE. The invoiced lock untouched. No rollup return shape changed, so `notes`
still cannot appear in one (`studio_hours_rollup` and `project_hours_total` are not redefined). Grants
seed regenerated. Types regenerated, diff clean, nothing to commit there. Conventional Commits.

## Flagged to the orchestrator (ruling owed, not guessed)

1. **HT-3-e(1) admits the W2-R3-01 outsider.** The employer arm asks whether somebody *other than the
   designer* wrote her rate row; an attacker who seats her consent-free in her own org and writes that row
   herself satisfies it, and her stamp then succeeds in three statements. Case **(t)** measures it.
   Round 3's sibling leg did bound her — and refused every honest employer too (24 of 24), which is why
   the ruling dropped it. **The closure is the already-owed HT-3-b arm (c) consent door**: with seats
   landing `invited`, `status = 'active'` means consent and the manoeuvre has no victim. This is the one
   thing in this pass that a reviewer should weigh, and it is the ruling's own trade rather than an
   implementation choice.
2. **HT-3-e(2)'s worst case is `'none'`, not the employer's number.** 00598's ladder
   (`close_prior_studio_member_rate` + `uniq_studio_member_rates_open`) means exactly one row covers any
   date, so a member's self-authored row CLOSES the studio's own row: today's hour is then "rate pending"
   until the studio writes a new rate (measured s8b/ag1, repaired s8d/ag3). Hours inside the studio's own
   earlier span keep its number (s8c/ag2). The brief anticipated "the owner's row prices"; the ladder makes
   that true for history and `'none'` for the future. Recorded in `rulings.md` as residue (ii).
3. **`created_by` NULL prices** (ag5). The only producer is `profiles ON DELETE SET NULL`; the freeze guard
   (00598:290-293) lets an actor re-stamp `created_by` only with her own id, so it is not a value a member
   can choose. Stated, not silently relied on.
4. **W2-R7-04 stands** — both the new and the old postconditions are spelling gates on `prosrc`; the real
   properties are in the cases.
5. **W2-R6-03 / W2-R6-06 / W2-R2-xx carried** — not in this brief.
6. **The Strata `projects.studio_id IS NULL` count is still uncounted** — eighth round of asking. It sizes
   HT-3-e(1)'s population and HT-3-e(3)'s exposure, and it is one read-only query.

## What I did not do

* **I did not edit `00599` or `00601`.** Both are merged to `hour-tracking/integration`; the rule is a new
  migration, as the ruling instructs.
* **I did not narrow `studio_member_rates_admin_insert`** (W2-R7-07). It is W1's policy and HT-3-e(2)
  answers the question at the resolver; s8 asserts the INSERT still succeeds so the measurement cannot go
  vacuous.
* **I did not touch `transfer_studio_ownership`, the consent-free `organization_members` INSERT,
  `set_project_studio_id`, the rollups or the ledger view.**
* **No lane B** (phase 2). Still no portal caller for the stamp: it appears only in `00605`/`00606`,
  `00615`'s neighbours, the generated seed, the generated types and the tests.
* **No concurrency or volume measurement**; no Strata read; no `supabase db push`.
