# W2 — lane A (DB) fix pass, round 13 · HT-3-g AMENDED (a)(b)(c)

**Branch** `hour-tracking/server`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`.
**Stack** this program's own: Postgres `127.0.0.1:54422`. The shared `54322` stack was never touched;
nothing reached Strata. `supabase/config.toml` is still `S` (skip-worktree) and in none of the commits.

**What landed:** the orchestrator's HT-3-g amendment in full — part **(a)** the ROSTER KEY in `00620`,
part **(b)** the REMEDY ARM in `00606`, part **(c)** the residual discipline, recorded in `rulings.md`
with the residual rows tabled — plus W2-R13-02 (the NOTICE's counts), W2-R13-04 (the `(am)`
mis-citation) and W2-R13-05 (the case-sensitive postcondition). Five files, all gates green.

**Three things the orchestrator must read before the next round**, each measured rather than argued:

1. **(b)'s reassign leg does NOT recover for the employer acting alone.** `reassign_project_lead`
   (`00399`) is pinned to the project's CURRENT `studio_id` and requires BOTH leads seated there —
   after a form-S/H taking that is the taker's own workspace, so the employer's owner is refused
   `42501` (cases k3/l8). The stamp half recovers completely once she IS the lead. So the residual
   recovers **with the taker's own hand**, not without it.
2. **(b) is wider than its purpose, and the width is a door.** As written it admits any designer who
   owns a studio to re-point any already-stamped project she LEADS at the studio she owns, where
   HT-3-e(2)'s owner exemption prices her own number: W2-R11-01 form A with the power to overwrite,
   one statement, no seat touched, no second party. Measured as a PASSING, loudly-labelled assertion
   (case (m) m6-m8: an honest studio's 24000 becomes her own 88800). Not narrowed on a guess.
3. **(b) buys something nobody asked for: HT-3-f(4)'s victim now has a way back.** Case (z)'s `z7`
   asserted for twelve rounds that she could not repair the consent-free outsider's stamp. She can
   now. `z7` is rewritten from a refusal to a recovery.

---

## 1 · HT-3-g AMENDED (a) — the ROSTER KEY (`00620`)

New object: `public.project_roster_books_elsewhere(p_project_id, p_designer_id, p_studio_id)` →
`boolean`. TRUE where some user on the project's **live** `project_team_members` roster **other than
the designer** holds an active, non-guest seat in an active `design_studio` the designer does **not
own**. `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`,
`REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`, with a `COMMENT` carrying the ruling.

Spelling decisions, each for a stated reason:

| leg | why |
|---|---|
| `roster.removed_at IS NULL` | that is the roster; a member taken off the project is not on it, and it is the same leg `is_project_team_member` (00484) reads |
| `roster.user_id IS DISTINCT FROM p_designer_id` | her own seats are what the tier rule already answered |
| `other_studio.id IS DISTINCT FROM p_studio_id` | the studio being written is not "elsewhere" |
| `NOT EXISTS (designer owner seat in other_studio)` | the ruling says *"a studio the designer does NOT own"*, and it is what keeps the Leah shape when an assistant holds a second seat inside a principal's own group |
| SECURITY DEFINER | an INVOKER read of `project_team_members`/`organization_members` returns a partial set, and a partial read here fails **OPEN** — it answers false, and false is what stamps the row |

**BOTH keys stand; the owned tier must pass both.** The author key (round 12) reaches a row the roster
key does not — an EMPTY roster whose author books elsewhere, which is case (h)'s own fixture — so
replacing it would re-open exactly what round 12 closed. The employer tier is keyed on neither.
`g10`/`g10b` (author key) and `j1`/`j1b` (roster key) are now two independent measurements, and `j1c`
asserts the author key is FALSE on `j1`'s row, i.e. that (a) adds population rather than restating (b).

**What the roster key closes:** form S's *realistic* population — a studio's client work with that
studio's people on the roster. Those rows can no longer be taken by one statement of hers, because the
fact the key reads is other people's seats, which she cannot move without touching them one at a time.
**What it does not close:** forms S (empty roster, seatless author) and H (she removes the author's
seat, and both keys read that one seat) — residuals under (c), tabled in `rulings.md`.

### W2-R13-02 — the counts

`00620`'s statement now RETURNS the tier that wrote each row (`WITH tiered … , stamped AS (UPDATE …
RETURNING project.id, tiered.tier)`), so the split is a fact about rows actually written rather than a
second query that re-asks the rule afterwards. The NOTICE reports **five** numbers — the four the
amendment names plus round 12's own cost-note (v) number, which the ruling in force requires counted
separately:

```
stamped-employer · stamped-owned · left-null-ambiguous · left-null-roster-key · left-null-author-key
```

The three `left-*` buckets are mutually exclusive by construction, in that order (ambiguous → roster →
author, the author bucket requiring the roster key to have passed). Two new asserts guard the
arithmetic: `v_stamped = v_stamped_employer + v_stamped_owned`, and the `left-*` sum never exceeding
`v_null_after` (the remainder being rows with no lead designer, which the migration never considers).
The test measures the split too (`g1a`, `g1b` — both tiers must appear, or the ship reads an untested
number in one direction).

### Postconditions added to `00620`

`(a)` the end-state/idempotence predicate now carries **both** keys. `(b3)` the roster key exists, is
`prosecdef`, asks the ruling's question by source (`removed_at IS NULL`, `IS DISTINCT FROM
p_designer_id`, the owner-seat EXISTS), and no role holds EXECUTE. `(c2)` extended: neither
`resolve_time_rate_cents` nor `project_pricing_studio_id` may name it — *"a roster is edited by a lead
designer on an ordinary afternoon (00177's `Lead designers manage team members` policy), so read at
pricing time it would be the most movable lever in the program."*

---

## 2 · HT-3-g AMENDED (b) — the REMEDY ARM (`00606`)

```
v_caller_is_designer := (v_actor = v_designer_id);
v_caller_owns_named  := EXISTS (active OWNER seat for v_actor in p_studio_id,
                                in an active design_studio);
v_remedy := v_caller_is_designer AND v_caller_owns_named AND v_existing IS NOT NULL;
```

It reaches exactly three bounds, and relaxes nothing else:

| bound | before | after |
|---|---|---|
| (a) owner-or-admin of the studio named | unchanged | unchanged — the arm's owner seat satisfies it, it is not skipped |
| (b) a stamped project is final | absolute `22023` | **yields to the remedy arm only** |
| (c) the employer-seat tier | absolute | bypassed **by the arm only** — an employer's own owner holds `role = 'owner'`, which that tier excludes by definition, so the arm would be unreachable behind it |
| (d) HT-3-e(1)'s arm's-length rate | unconditional | bypassed **by the arm only** — unsatisfiable in the shape the arm exists for: the caller is the designer and the studio is her own, so every rate row for her there carries her own id |
| (f) the write | `studio_id IS NULL` | `(studio_id IS NULL OR v_remedy)` |
| (g) the audit row | one action, `old_values.studio_id = NULL` | `project.pricing_studio_stamped` on a first stamp, **`project.pricing_studio_restamped`** on an overwrite, carrying the **OLD** and the NEW studio |

### The one judgment call: `v_existing IS NOT NULL`

The amendment's subject is *"an employer recovers a **taken** project"* and its mechanism is *"may
OVERWRITE a stamped column"*. On a column that is still NULL, HT-3-g(3)'s "DESIGNERS NEVER STAMP … no
owned-tier arm, no designer arm" is unamended and in force — and it is the ruling that closed
W2-R11-01 forms A and G. **Measured, not assumed:** without this conjunct the arm repeals that closure
as a side effect and `supabase/tests/billing/time_rate_resolution_test.sql` case **(aj5)** goes red
(that is how the conjunct was found — the first run of the billing suite failed at `aj5` with
`SQLSTATE P0001`, 00563's own guard being the only thing that happened to refuse the write in that
fixture, which is too fragile a place to leave a ruling). So the arm is bounded to the shape the
amendment names. **If the orchestrator means the arm to reach unstamped projects too, it is one
conjunct and `aj5`/`ak5` move with it.**

### Postconditions rewritten in `00606`

- **The "NO DESIGNER ARM" assert is amended, not deleted.** It now counts the actor-vs-designer
  comparisons with a case-insensitive regex and demands **exactly one**, spelled as the remedy arm's
  own equality, with the INEQUALITY spelling still forbidden outright in both directions (round 3's
  skip stays dead; round 5's (e2) cannot return as a second comparison).
- **A new assert pins the arm's shape by source:** the `v_remedy` assignment including its
  `v_existing IS NOT NULL` conjunct, `owner_seat.role = 'owner'`, the three sites it reaches, the
  `restamped` action, and its position (after the designer/studio load, before the finality bound).
  Its message names the failure mode: *"an `is_org_admin_or_owner` spelling here instead of the owner
  seat would hand every ADMIN of any studio the power to re-point a project that studio had no part
  in."*
- `organization_members` read count **1 → 2** (the designer's employer seat, the caller's owner seat),
  with the message saying which is which and that it was one through round 12.
- The two `IF NOT v_named_is_employer_seat THEN` literals became `IF NOT (v_named_is_employer_seat OR
  v_remedy) THEN` in both the shape assert and the ordering assert.

### W2-R13-05 (= W2-R12-05, not discharged until now)

`prosrc NOT LIKE '%sibling%'` passed on capitalisation alone (the body said `SIBLING`). Fixed in
**both** directions: every leg of that gate is now `lower(prosrc) NOT LIKE` (all five:
`designer_seat.role = 'owner'`, `v_designer_has_employer_seat`, `sibling`,
`project_pricing_studio_id`, `v_derived`), **and** the two in-body comments that carried the word were
reworded ("Round 3's `created_by` same-book leg"), so the gate is genuinely silent on the word rather
than merely case-folded. Verified by the migration applying clean with the case-folded gate in place —
which it could not have done before the rewording.

---

## 3 · W2-R13-04 — the `(am)` mis-citation in `00620`

`00620:89-91` cited *"case (am) of legacy_project_studio_stamp_test.sql"*. That file has no `(am)`;
the honest-principal shape is leg **(e)** (`FAIL e1`) plus `FAIL g5`, and `(am)` lives in
`supabase/tests/rls/time_entry_studio_stamp_test.sql` measuring W2-R11-01 form G. Corrected, with the
wrong citation and its correction both recorded in place, because the banner is what the next hand
reads to find the measurement.

## 4 · The other findings, each with what was done

| id | action |
|---|---|
| **W2-R13-01** MAJOR | the amendment, above. Forms S and H now PASSING, loudly-labelled residuals with their remedy measured; the roster key closes the realistic population; the remedy arm is the way back |
| **W2-R13-02** note | five counts, per tier and per key, returned by the statement itself; two arithmetic asserts; `g1a`/`g1b` |
| **W2-R13-03** note (HT-3-f(4) widened) | no code change to the seat door (HT-3-b arm (c) is the People-room program's) — but its **consequence changed again, for the better**: (b) gives the victim a one-statement way back where she owns a studio. Case (z) `z7` rewritten from refusal to recovery, with `z7a` the audit row, `z7b` her own 28000 returning, `z7c` P-4. Recorded in `rulings.md` as the part of the owed UNPIN that (b) discharges; the consent door and an unpin for a victim who owns NO studio are still owed |
| **W2-R13-04** note | the citation, above |
| **W2-R13-05** note | the case-insensitive gate plus the reworded body, above |
| **W2-R13-06** cost note (bound (d) sequences the repair) | no code change — the reading stands, and the remedy arm now bypasses bound (d) in the one shape where it was unsatisfiable. Lane B still owes the refusal worded as *"price her first"* rather than as a permission error (phase 2) |
| **W2-R8-06** carried MINOR (postconditions are spelling gates) | discharged at the named instance and across the whole assert it lived in (five legs case-folded) |
| **W2-R4-08 (= W2-R2-10)** | untouched — W1's, ruling owed, not in this brief's gate list. Fifteenth round of asking |
| every other carried note (W2-R2-07/09/13, W2-R5-05, W2-R6-06, `Designers manage their project time entries`, W2-R10-09/10, …) | untouched — each is "ruling owed" with no concrete action available to a fix pass |

---

## 5 · Tests

### `supabase/tests/billing/legacy_project_studio_stamp_test.sql`

New fixtures, all inserted the only way the legacy shape arises — **projects before any seat or
designer role exists**, so 00563's one-candidate discovery and 00602/00603's INSERT stamp find nothing.
Owner rows come first in each studio (`guard_org_membership_changes` admits an owner INSERT only into
an organization with no members yet). Form S's author is deliberately given **no designer role**: a
seatless hand with the role would be provisioned a workspace by 00295 and stop being seatless, which
would make the author key TRUE and leave form S measuring nothing.

| case | what it measures |
|---|---|
| **(j-i)** `j1`, `j1a`, `j1b`, `j1c` | the roster key's own shape: her own hand opened it (author key silent), a support designer on its live roster answers to a studio she does not own → left NULL, with the tier still answering (so it is the key) and the author key measured FALSE (so it is a row the round-12 key alone would have stamped) |
| **(j-ii)** `j2`, `j2a` | the Leah shape: a sole proprietor whose own assistant opened her project and sits on its roster IS stamped to her own studio |
| **(j)** `j3` | the ownership clause, probed directly (no stamp can exhibit it): a roster member seated only in a studio the designer OWNS leaves the key FALSE |
| **(k)** `k1`-`k8` | FORM S end to end: the residual (both keys measured false), her hour at 99900, the employer's owner REFUSED the reassign (`42501`), the cooperative reassign, the remedy stamp OVERWRITING, the `restamped` audit row with both studios, P-4 on the hour already priced, and her next hour back at the employer's 26000 |
| **(l)** `l0`-`l12` | FORM H: the control measured in the same fixture (tier = employer, both keys TRUE), the two statements through RLS (`Org admins can update members`, then probe D2), both keys FALSE, the taking, the money, the same remedy and the same refused reassign — plus `l5`, which states the ROSTER KEY'S OWN LIMIT outright: it reads the same seat the author key reads, so it cannot reach form H by construction |
| **(m)** `m0`-`m9` | the remedy arm's surface: refused `22023` to a designer who is only an ADMIN of the studio she names; refused `22023` to an OWNER who is not the project's lead; **ADMITTED** on an honest studio's stamped project, with the audit row and the money (24000 → her own 88800) and P-4 |
| **(g)** `g1a`, `g1b` | the per-tier counts |
| **(h)** `h1`, `h5`, `h6` | the end-state predicate now carries both keys; the roster key exists on the live stack and no authenticated caller holds EXECUTE |

Both statement copies in the file (the main run and the idempotence re-run) were updated to the
amended predicate and the `RETURNING` form, so the file still copies the migration's statement rather
than paraphrasing it.

### `supabase/tests/rls/time_entry_studio_stamp_test.sql`

Case **(z)** `z7` rewritten: the victim's repair now SUCCEEDS, `z7a` asserts the `restamped` audit row
with both studios, `z7b` her next hour back at her own 28000, `z7c` P-4 on the hour the outsider
priced. The case's closing NOTICE was rewritten to say what is still owed (the consent door, and an
unpin for a victim who owns no studio).

---

## 6 · Gates, verbatim, pasted

| command | result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean, through `00620`** — `Applying migration 00606_time_entries_studio_read_narrow.sql…`, `Applying migration 00620_legacy_project_studio_stamp.sql…`, all 27 seed files, `Finished supabase db reset on branch main.`, `{"target":"local","version":"","message":"Reset local database."}`. Every `DO` postcondition block in `00606`/`00615`/`00620` ran (they RAISE on failure) |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` (`legacy_project_studio_stamp_test.sql` PASS, `time_rate_resolution_test.sql` PASS, `time_entry_ledger_test.sql` PASS) |
| `run-sql-tests.sh -d …/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected — all pre-existing and documented** (below) |
| `run-sql-tests.sh -d …/tests/rls -H 127.0.0.1 -p 54422` | **28 green / 30, 2 unexpected — both pre-existing and documented** (below). `time_entry_studio_stamp_test.sql` PASS, `project_hours_total_test.sql` PASS, `studio_hours_rollup_test.sql` PASS, `time_entry_admin_write_test.sql` PASS, `studio_member_rates_test.sql` PASS, `time_entry_auto_roster_test.sql` PASS, `00584_studio_comember_rls_sweep` PASS |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** — `tsc --noEmit`, exit 0 |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, exit 0 |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **exit 0**, full route table |

Run beyond the list:

| command | result |
|---|---|
| `python3 ./scripts/generate-legacy-grants.py` **from the worktree** | `baseline + 2632 replayed statements` (2631 before this pass; the one new statement is the roster key's REVOKE). Seed committed. Re-run after the commit: no further diff |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` | `database.types.ts` **+8 lines** — the roster predicate's `Functions` entry, committed. (`project_author_books_elsewhere` is absent from the generated types in both passes; the generator omits it, and the REVOKE is why) |
| the live migration's end state on this stack | `projects` 6 · `studio_id IS NULL` **5** · NULL rows whose designer's tier answers **at all** = **0** · left by the roster key **0** · left by the author key **0**. So the five residual NULLs are rows the tier rule answers nothing for, and `00620`'s postcondition (a) holds as an end-state query after seeds |

### Pre-existing failures, listed separately

**Eight**, none of them W2's, all in `supabase/tests/KNOWN_FAILURES.md`: six in `commercial`
(`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`,
`executed_on_paper`, `trade_rfq`, `trade_scope` — the countersign/grant family) and two in `rls`
(`design_requests_test.sql` `FAIL 3b`, `studio_titles_test.sql` `FAIL f`).
`commercial/direct_order_attribution_test.sql` (clock-dependent, documented window 00:00-02:00 UTC)
**passed** in this run. Still red and still W1's: `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql`
at `:171` — not in this brief's gate list, not touched, ruling owed.

---

## 7 · Commits

Three, Conventional Commits, explicit pathspecs, `supabase/config.toml` in none of them:

1. `fix(time): 00620 roster key on the owned tier, per-tier and per-key counts` — `00620`, the
   regenerated ACL seed, `database.types.ts`
2. `fix(time): 00606 remedy arm for a stamped pricing studio` — `00606`
3. `test(time): forms S and H as residuals, the roster key, and the remedy arm's surface` —
   both test files

## 8 · Before the push to Strata

The sizing query in `W2-fix-r12.md` §9 must be re-read immediately before the push and now needs the
roster key, because the population `00620` will stamp on the owned tier is exactly "tier answers
`owned` AND the author books nowhere AND the roster books nowhere":

```sql
SELECT count(*)                                                                    AS null_studio,
       count(*) FILTER (WHERE a.tier = 'employer')                                 AS stamped_employer,
       count(*) FILTER (WHERE a.tier = 'owned'
         AND NOT public.project_author_books_elsewhere(p.created_by, a.studio_id)
         AND NOT public.project_roster_books_elsewhere(p.id, p.designer_id, a.studio_id))
                                                                                   AS stamped_owned,
       count(*) FILTER (WHERE a.studio_id IS NULL)                                 AS left_ambiguous,
       count(*) FILTER (WHERE a.tier = 'owned'
         AND public.project_roster_books_elsewhere(p.id, p.designer_id, a.studio_id))
                                                                                   AS left_roster_key,
       count(*) FILTER (WHERE a.tier = 'owned'
         AND NOT public.project_roster_books_elsewhere(p.id, p.designer_id, a.studio_id)
         AND public.project_author_books_elsewhere(p.created_by, a.studio_id))      AS left_author_key
FROM public.projects AS p
CROSS JOIN LATERAL public.designer_tier_pricing_studio(p.designer_id) AS a
WHERE p.studio_id IS NULL AND p.designer_id IS NOT NULL;
```

Both predicates are defined **by `00620` itself**, so on Strata this query can only be run **after**
the migration has applied — which is the honest sequence anyway: the NOTICE reports the same five
numbers at apply time, inside the transaction, and `db push` prints it.

## 9 · What I did not do

- **Lane B** — phase 2. Its copy obligations grew by two: the displaced studio needs a visible fact
  when a project's hours leave it (the `restamped` audit row is the only trace today), and W2-R13-06's
  *"price her first"* wording is still owed.
- **`reassign_project_lead` (00399) was NOT touched.** Widening it so an employer can follow its own
  book rather than the project's current column is what would make (b)'s remedy reachable unaided, and
  it is a merged function outside this brief. Reported, not done.
- **The amendment's width was NOT narrowed** (point 2 at the top). The only bound added beyond the
  ruling's words is `v_existing IS NOT NULL`, and that one is forced by HT-3-g(3) and by `aj5`.
- **Strata** — nothing reached prod; no `db push`, no sizing query against it.
- **No lint, no e2e, no `@patina/designer-portal test`** — outside the brief's gate list.
