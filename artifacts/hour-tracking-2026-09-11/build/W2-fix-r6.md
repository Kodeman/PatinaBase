# W2 — lane A (DB) fix pass, round 6

Two findings, both MAJOR/HIGH, and they pull in opposite directions: **W2-R6-01** says bound **(e2)**
refuses a caller HT-3-d admits, and **W2-R6-02** says (e2) does not deliver the sentence it was written
for. Round 6 resolves that by **reversing (e2)** — which is the reviewer's option 3 without its second
half — and by replacing round 5's *"one candidate closes it"* framing with the **measurements that
eliminate every candidate available at this call site**, so the ruling the program owes is now a
*specific* rule rather than a menu.

| finding | state after this pass |
|---|---|
| **W2-R6-01** | **reproduced 1/1 on a fresh fixture (probe P1), then CLOSED by reversing bound (e2).** The honest shape is now a shipped case **(s)**, measured to FAIL under the round-5 body (negative control installed by hand) and to pass under the shipped one. |
| **W2-R6-02** | **re-measured and NOT closed — it cannot be closed here, and round 6 proves that rather than asserting it.** Three new measurements kill candidate (ii) at this call site, kill the "her own workspace" framing entirely, and leave exactly one closure: a rule at the RATE, which is a W1 resolver ruling. Both open halves are PASSING, loudly-labelled assertions — case (q) q7 **and** q8, now on separate projects so neither is a retry of the other. |
| **W2-R6-04 / W2-R6-05** | **dissolved by the same change.** (e2) was the actor gate the postcondition's string match failed to see and the owner of the unreachable `'owner'` arm. The postcondition is rewritten to speak only for bound (e), and a NEW postcondition owns HT-3-d's *"There is no other arm"* by forbidding any refusal gated on the caller being the designer. |

Scope: `supabase/migrations/00606_time_entries_studio_read_narrow.sql` (one bound deleted; banner,
`COMMENT` and two postconditions rewritten; one postcondition added; one removed) and
`supabase/tests/rls/time_entry_studio_stamp_test.sql` (new case **(s)** with its own fixture; case (q)
rewritten around a second legacy project; header index rewritten). **No new migration number** — `00604`–
`00607` are unapplied on Strata and unmerged, so the edit is in place at the plan's numbers
(`patina-db-migrations` step 8). No column, type, index, policy, grant or signature moved: the ACL seed
and `database.types.ts` both regenerate **clean** (proved below).

---

## W2-R6-01 — reproduced first, on my own fixture, before any edit

Probe **P1**, every write through RLS as the named actor, ordinary shapes only — no confederate, no
demotion, no consent-free seat, and (asserted) **no workspace of her own**, because her designer role is
granted after her seats so `00295` takes its early exit. She is an `admin` of employer one and a plain
`member` of employer two, so HT-3-b's employer tier is AMBIGUOUS and the project is honestly `'none'`.
Employer one holds **no** project she created.

| step | measured against the round-5 (shipped) body |
|---|---|
| P1-0 | baseline pricing studio = **NULL** — HT-3-a step 3's `'none'`, honestly arrived at |
| P1-1 | her hour = **NULL / none** |
| P1-2 | **HER** stamp of the employer she ADMINS → **42501** *"a designer may not name a studio she herself administers while she holds an employer seat … (HT-3-d, W2-R5-01)"* |
| P1-3 | the **EMPLOYER'S OWNER** stamp → **42501** *"this studio holds no project that this project's designer both leads and created"* |
| P1-4 | column = **NULL** — nobody can repair it |

The finding is exact, including its sharpest point: (e2) is the **last** bound before the write, so P1-2's
message proves every earlier bound passed — without (e2) her stamp writes the column.

### Why the fix is reversal and not ratification

Three grounds, each measured rather than argued:

1. **HT-3-d admits her expressly.** The ruling authorises two bounds — the designer's HT-3-b tier, and
   owner-or-admin of the studio named — and says *"There is no other arm"*. An `admin` seat at an honest
   employer is `role <> 'owner'`, i.e. inside the employer tier, and its holder is an owner-or-admin of
   the studio she names. The ruling's two closing sentences are about **her own workspace**; (e2) refused
   a studio that is not hers. The orchestrator's own required case list for HT-3-d ("an employer's admin
   stamps the employer → the hour prices from the employer"; "with two employers, either employer's admin
   may stamp their own studio") is satisfied by this caller and was refused by (e2).
2. **It denied HT-3-a's ruled remedy to an ordinary studio.** P1-2 + P1-3 = no act available to anybody.
   The only escape measured (P1-5/P1-6 in the review, re-measured here) is *"INSERT a spurious project
   naming your employer so your employer may repair your other project"*, and `(a2)`'s sibling
   requirement is not in HT-3-d at all — it is round 3's retained anti-takeover leg, which stands in for
   the owed consent door.
3. **It bought nothing structural.** The manoeuvre (e2) was written for needs a **second account by
   construction**: `transfer_studio_ownership` refuses `p_new_owner = auth.uid()` and requires an
   already-**active** member, and she cannot demote herself any other way (`Members can leave` and `Org
   admins can update members` both exclude `role = 'owner'`, and `guard_org_membership_changes` preserves
   the last owner). With that account in hand the account she hands the title to simply makes the call —
   case (q) q8, which was already green under the round-5 body, and review round 6's P2-8. **(e2) moved
   the manoeuvre by one statement and one session, not by one accomplice.**

So (e2) was a pure cost: it fired on exactly one class of caller — *the designer as an `admin` of the
studio she names* — and that class contains both the honest admin-designer (refused, wrongly) and the
laundered workspace (reachable anyway, through the confederate). Under ONE account the workspace can
never enter the employer tier at all, and bound (e) alone refuses it; (e2) never protected a one-account
shape.

### What landed

- **Bound (e2) deleted.** The site keeps a labelled comment block recording what it was, the three
  measurements, and — in prose, not code — the exact IF to restore if HT-3-d is amended to ratify it. The
  prose is deliberate: a postcondition now reads `pg_proc.prosrc` and forbids an actor-gated refusal, so
  a literal restore snippet in the body would break the file's own gate. Two older in-body comments that
  quoted the round-3 spelling were reworded for the same reason.
- **New case (s)** — the honest admin-designer, end to end through RLS: `s0` she owns no studio; `s1` the
  tier is ambiguous and pricing is NULL; `s2` her hour files `'none'`; `s3` **the employer's OWNER is
  refused 42501** (bound (a2), recorded rather than hidden — it is why (e2) left the shape unrepairable);
  `s4` **HER stamp SUCCEEDS**; `s5` `project_pricing_studio_id` answers the employer; `s6` her next hour
  prices at the EMPLOYER's 26000, **authored by the employer's owner** — naming a studio is not naming a
  rate; `s7` the employer's OWNER reads both hours and gets `project_hours_total`. `s4`'s failure message
  says plainly that a failure means an actor-gated refusal came back and needs an amendment to HT-3-d.
- **Postconditions**: the tier assert's matcher no longer keys on one operand order of one `IF`
  (W2-R6-04) and its message now speaks only for bound (e); a new assert forbids `v_actor =
  v_designer_id` / `v_designer_id = v_actor` anywhere in the body, with bound (a2)'s **inequality**
  explicitly exempted and named; the (e2) assert is gone.

---

## W2-R6-02 — re-measured, not closed, and the candidate list is now one item long

Round 5 offered candidates (ii) rate-card authorship, (iii) the owed consent door, (iv) a temporal bound.
Round 6 measured three things that remove all three **at this call site**:

| probe | measured (fresh fixtures, every write through RLS as the actor) |
|---|---|
| **P2** — candidate (ii) is vacuous HERE | the laundering with the rate written **after** the stamp: she seats a confederate `admin` in her 00295 workspace, `transfer_studio_ownership` leaves her own row at `'admin'` (P2-2), the workspace holds **0** `studio_member_rates` rows for her at stamp time (P2-3), the confederate's stamp **succeeds** (P2-4), and only then does she write her own 99900 — her next hour comes back **99900 / studio_member / 199800** (P2-5). A stamp-time test of "who authored her rate row" therefore passes **vacuously** and closes nothing. |
| **P3** — "her own workspace" is the wrong frame | she owns **no** studio at all (designer role after her seat, 00295 early exit) and her single honest employer prices her at 25000 (P3-1). An accomplice who owns his own org seats her `'admin'` there (consent-free), **SHE** writes her own 99900 in **his** org (`'admin'` satisfies `studio_member_rates_admin_insert`), she authors the `created_by` sibling herself, and **he** stamps (P3-3). Her next hour: **99900 / studio_member / 199800** (P3-4). No ownership transfer, no workspace of hers, nothing for `organizations.created_by` or the tier's role test to see. |
| candidate (iv), by inspection of the live schema | the tier's only temporal witness is `organization_members.updated_at`, set by `update_org_members_updated_at` on **every** UPDATE — so a People-room edit to `job_title` / `handoff_note` would silently strip an honest employer of the repair, while `created_at` and `joined_at` are caller-suppliable on INSERT (W1-R12-01's own finding) and do not move at all when `transfer_studio_ownership` rewrites the role. Not built, and not recommended without a ruling that accepts that cost. |

**What remains, stated in the migration, the `COMMENT`, case (q) and the ruling sheet:** the only closure
measured to work is a rule at the **RATE**, not at the studio — *a `studio_member_rates` row whose
`created_by` is its own `user_id` prices an hour only where that person is the named studio's **OWNER***.
It leaves HT-3-a arm (a)'s and HT-3-c's sole proprietor untouched (there she IS the owner), it is
immune to the ordering P2 exploits (it is read when the hour is priced, not when the studio is named),
and it does not care which studio or whose workspace is involved, which is what P3 shows a closure must
not care about. It is a **W1 resolver rule** (`00599`/`00601`), it changes money resolution for every
studio, and W2 did not guess it. It also does **not** close the cooperating pair where the **accomplice**
writes the number — that is case (r) and the already-owed HT-3-b arm (c) class — but it does close the
brief's own MAJOR criterion: *a member moving her own resolved rate to a number **she** set*.

### Case (q), rewritten so both halves are measurements

Round 5's (q) asserted her stamp refused and the confederate's permitted on the **same** project. With
(e2) gone her stamp writes the column, which would have made q8 a no-op retry (bound (b) returns the
same studio). So (q)'s fixture now carries **two** legacy projects, both asserted priced CORRECTLY by the
honest employer at baseline (q1, q1b):

| assertion | measured against the shipped round-6 body |
|---|---|
| q3/q4/q5/q6 | the consent-free `admin` seat SUCCEEDS; `transfer_studio_ownership` leaves her own row `'admin'`; her own sibling project in the workspace SUCCEEDS; pricing falls to **NULL** — she MANUFACTURED the `'none'` the act exists to repair |
| **q7** | **HER** stamp of the workspace — **SUCCEEDS** (RESIDUE, labelled *"NOT A REGRESSION IF IT FAILS"*) |
| q7b | the column is written, permanently (bound (b)) |
| **q8** | the **CONFEDERATE'S** stamp of the **second** project — **SUCCEEDS** (the half (e2) never reached, and the reason it bought nothing) |
| q9 | that column is written too |
| q10 | her next hour: **99900 / studio_member / 199800** instead of the employer's 25000 |
| q11 | the honest employer's OWNER reads **0** rows across BOTH projects, and can re-stamp neither |

Every one of those is a **passing** assertion whose message names what a closure makes it take. Case (r)
is unchanged and still green.

---

## Negative controls — the round-5 body installed by hand, the suite run against it, the shipped body restored by replay

| body installed | result |
|---|---|
| the round-5 body (bound (e2) re-inserted by hand, message changed to `CONTROL round-5 (e2)`) | **case (s) ABORTS** at `s4`'s call with the control message — this is the control that proves case (s) measures W2-R6-01 |
| the same body, suite run unmodified | `FAIL q7 … got NO RAISE (returned <her workspace>)` — the control that proves q7 measures which body is installed |
| the shipped body, restored by **`supabase db reset`** (not by my psql runs) | `pg_proc.prosrc`: `no_actor_gate = t`, `is_org_admin_or_owner(p_studio_id) = t`, `sibling.created_by = v_designer_id = t`; suite **17/17** cases `passed` / `recorded` |

## Gates

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, every `DO $postcondition$` passed (00606 has one fewer assert and one more) |
| object-level probe after that reset (`patina-db-migrations` step 7) | the replayed body has **no** actor-gated refusal and still carries the standing and `created_by` legs |
| `run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` (**all**) | **28 green / 30, 2 unexpected** — `design_requests_test.sql`, `studio_titles_test.sql`, both pre-existing, both documented (`supabase/tests/rls/KNOWN_FAILURES.md:114-115`), identical to the r1–r5 baseline. `time_entry_studio_stamp_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `00563_proposal_signing_multi_studio.test` and `00584_studio_comember_rls_sweep.test` all green |
| `run-sql-tests.sh -d …/supabase/tests/billing …` | **7 green / 7**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — the identical W1/r1–r5 baseline, all six in the design-services-agreement path, all documented (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`). W2 touches no agreement path |
| `python3 scripts/generate-legacy-grants.py` + `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 replayed statements — no GRANT/REVOKE moved) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** (no signature, column or view shape changed) |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |

All against Postgres `127.0.0.1:54422` (`project_id "patina-hours"`). The shared 54322 stack was never
touched. **Nothing was pushed to Strata; no prod anything.** `supabase/config.toml` stays
skip-worktree'd, untouched and in no commit. The commit touches exactly two files.

## Program rules re-checked against this diff

No flag. No backfill — the stamp still writes one project's column, only when a caller asks, only where
it is NULL. Additive only: no column, type, NOT NULL, default, index or policy; the only behavioural
delta is **one refusal removed**. The invoiced-entry lock untouched. No rollup return-shape change, so
`notes` still cannot appear in one. The 00484 quartet's four names, commands, role sets and permissive
flags untouched (00606's postconditions (b)/(c) re-assert them on every reset). `set_project_studio_id`
is not redefined. Migrations stay at the plan's numbers.

## What the orchestrator owes, and what it costs either way

1. **The rate-authorship rule above** (or a knowing acceptance of W2-R6-02). It is a W1 resolver edit, it
   closes the *"a number SHE set"* class on every path, and it does not close the accomplice-written-rate
   class.
2. **HT-3-b arm (c)'s consent door** — still owed, still does not reach case (q) (her own 00295 seat, and
   she is the consenting party) and, measured in P3, does not reach a designer who *cooperates* either:
   she would simply activate the seat aimed at her.
3. **Or: ratify (e2)** — amend HT-3-d to record a third refusal and accept that an admin-designer's
   ambiguous-tier project is repairable only through a colleague plus a sibling project. The restore is
   one IF (prose at its site in `00606`), case (s), and one postcondition. Round 6 recommends against it
   on the measurements above, but it is one edit in either direction.
4. **The Strata `projects.studio_id IS NULL` count** — sixth round of asking. One read-only query, and it
   sizes every residue in this file.

## What I did not do

- **I did not invent a pricing key.** Candidates (ii) and (iv) were measured, reported and left
  unbuilt; neither was installed "to be safe".
- **I did not touch `transfer_studio_ownership`, the consent-free `organization_members` INSERT,
  `studio_member_rates`' policies, or `00599`/`00601`.** All four are the cause of W2-R6-02 and all four
  are other waves' or other rulings' property.
- **W2-R6-03 / W2-R6-06 / W2-R6-07 were not actioned** — the brief named only R6-01 and R6-02. R6-06
  (`project_hours_total`'s `amount_cents` invertible by subtraction) is HT-10-a's own prescription and
  needs a ruling; R6-07 (`reassign_project_lead` can move `designer_id`, i.e. the gate's own operand) is
  moot now that no actor gate exists.
- **No concurrency or volume measurement.** Two simultaneous stamps were not raced.
- **No lane B.** Still no portal caller for the stamp (it appears only in `00605`/`00606`, the generated
  seed, the generated types and the test).
