# W2 — lane A (DB) adversarial review, round 11

**clean = false — ONE MAJOR.** The round-10 amendment gates the arm the manoeuvre does not use.
HT-3-f(1) AMENDED bounds the **CONFIRM** arm of `stamp_project_pricing_studio` to the employer tier;
it leaves the **plain HT-3-a STAMP arm** (the one that fires when the derivation is silent) completely
unbounded for the project's own designer — bound (a2)'s owned-tier sibling leg is *skipped outright*
when `v_actor = v_designer_id`. And **HT-3-f(2) is precisely what makes the derivation silent** for the
population that matters: a legacy project the designer did **not** author now derives `NULL`, so bound
(c) never speaks and she writes her own workspace in by hand. Measured 1/1 through RLS, with a control
twin in the same fixture, a negative control by omission, and a counterfactual by installation:

* **Form A — no seat change of any kind (the brief's second trigger, literally).** She owns the `00295`
  workspace, holds **no** employer seat, and her legacy book contains a project her assistant opened.
  **ONE statement** — `stamp_project_pricing_studio(project, her workspace)` — succeeds, bound (b) makes
  the column FINAL, and after an honest employer hires her and prices her 26000 her hour on that project
  comes back **99900 / studio_member / 199800** against the twin's **26000 / studio_member / 52000**; the
  employer reads **0** of the pinned project's hours against **1** of the twin's and cannot undo it.
  One account. No seat left or removed. No ownership transfer. No confederate. No consent-free seat.
* **Form G — round 9's W2-R9-01 outcome, reconstituted in TWO ordinary statements.** Her *former
  employer's own* legacy project: the shipped `Members can leave` DELETE on her own seat (HT-3-f(2)
  then correctly answers `NULL / none / NULL` — the closure holds), then the stamp of her own workspace
  onto that project — **SUCCEEDS** — and her next hour is **99900 / studio_member / 199800** where the
  employer's card priced it 26000. The employer's owner reads **0** and is refused the repair on *both*
  the stamped project and its unstamped twin (`42501`, the owned-tier sibling leg). W2-R9-01's measured
  end state — her number, the employer reading nothing, nothing able to pin it — is back.

Besides it: **two new notes and one new discharge note**, plus the carried set, each re-measured. Four
of round 10's five MINORs are discharged and verified on the installed bodies (W2-R10-04, W2-R10-05,
W2-R10-06, W2-R10-08); W2-R10-02 and W2-R10-03 are recorded as ruled and now carry passing, loudly
labelled cases.

**Round 10's MAJOR (W2-R10-01) is discharged *on the arm it named*, and only there.** The confirm in the
designer's hand on her own workspace is refused with the pre-round-9 sentence (`22023`, measured
independently of case (y)), and the employer's remedy is intact. What the closure did not do is close the
money shape, because the shape relocated: closure (2) was chosen over closure (1) (`v_actor <>
v_designer_id`), and closure (1) is the one that also covers the stamp arm.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **eleven** commits,
`c71db49d9` → … → `abd25e835` → **`4ca12439d`** (round 10's fix; HEAD == `hour-tracking/server` ==
`origin/hour-tracking/server`, tracked tree clean). Round 10's delta is **five** files — `00606`
(+125/−9), `00615` (+29/−7), `rls/time_entry_studio_stamp_test.sql` (+393/−7),
`billing/time_rate_resolution_test.sql` (+168), `tests/KNOWN_FAILURES.md` (+1) — read line by line. Also
read in full: `00606`'s bounds (a), (a1), (a2), (b), (c), (d), (e) and the reversed (e2); `00615`'s
`owned_tier_prices_project` and its three grafts; `00412`'s `guard_time_entry_invoice_authority` and
`classify_project_time_entry_authority`; every policy on `organization_members` and
`project_time_entries`; `rulings.md` (HT-1, HT-3, HT-3-a…f, HT-3-f(1) AMENDED, HT-3-f(4), HT-3-f(2) COST
NOTE, HT-10, HT-10-a, HT-36, HT-38 verbatim); `plan-v2.md` §0/§3/§W5–W6; cases (ak), (y), (x) in the
suites. Lane B is phase 2; its absence is not counted.

**Graft / shape integrity, probed on the installed objects rather than the files.**
`stamp_project_pricing_studio` = SECURITY DEFINER, `search_path=public, pg_temp`, EXECUTE held by
`authenticated` + `service_role`, **not** `anon`. `owned_tier_prices_project` = INVOKER, IMMUTABLE,
search_path pinned, EXECUTE held by **none** of anon/authenticated/service_role. `studio_hours_rollup`
= **SECURITY INVOKER** (HT-38), EXECUTE `authenticated` only. The audit trigger is
`zzzz_audit_time_entry_change_trg AFTER DELETE OR UPDATE … FOR EACH ROW` — **still no `WHEN`**
(W2-R2-09, carried). `time_entries_studio_read` survives **narrowed** to `user_id = auth.uid() AND …`
and `Team can view their project time entries` to `user_id = auth.uid() AND is_project_team_member(…)`
— HT-10-a's two-policy narrowing, as amended, is what is installed.

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.` then `{"target":"local","version":"","message":"Reset local database."}`; both migrations' postcondition `DO` blocks ran (they RAISE on failure) |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` (`time_rate_resolution_test.sql` PASS, case (ak) among its notices) |
| `run-sql-tests.sh -d …/tests/commercial …` | **9 green / 16, 7 unexpected — all pre-existing, none W2's.** Six are the documented countersign/grant family; the seventh is `direct_order_attribution_test.sql`, now **documented** (W2-R10-05 discharged) and failing in this run only because it fell at **01:48 UTC**, inside its recorded window |
| `run-sql-tests.sh -d …/tests/rls …` (all 30) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` (`FAIL 3b`), `studio_titles_test.sql` (`FAIL f`), both pre-existing and documented. `time_entry_studio_stamp_test.sql` PASS (cases (e), (w), (x) with x7/x8, (y), (z)); `studio_hours_rollup_test`, `project_hours_total_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio`, `00584_studio_comember_rls_sweep` all PASS |
| the billing + rls suites again with `PGTZ=America/Chicago` | **billing 7/7 · rls 28/30 — byte-identical summaries.** W2-R9-04 stays closed |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --filter @patina/admin-portal build` | **succeeds**, exit **0**, full route table |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 ./scripts/generate-legacy-grants.py` **from the worktree** → `git diff` | **CLEAN** — baseline + **2630** replayed statements, empty diff (W2-R10-06's rule followed; nothing run in the main checkout this round) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **CLEAN**, exit 0 |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's; **eleventh round** (W2-R4-08) |
| `direct_order_attribution_test.sql` under `PGTZ=America/Chicago` at 01:58 UTC | **0 errors** — the documented clock window confirmed, not inherited |
| migration-number sweep over every worktree | `00604`–`00607` + `00615` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `agent-edge`; the peer people-room program is at `00621`–`00627`; `00616`/`00617` unused anywhere. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the eleven commits (`git log … -- supabase/config.toml` = 0); round 10's commit touches exactly the five intended files; Conventional Commits (`fix(time): W2-R10 — the confirm belongs to the employer`) |
| postcondition non-vacuity, on the installed bodies | **W2-R10-04 discharged.** callable form: `into v_employer_studios`@**1341** < `into v_owned_studios`@**2456**, while the bare-name DECLARE sits at **399** — the assert now measures the tier READS. INSERT stamp: **1010** < **2807**, DECLARE at **251**. `public\.organization_members` count = **2**. Bound (c)'s new gate: literal present, and `derivation read < gate < '(d) 00563''s own bound'` both **t** |

---

## Findings

### W2-R11-01 · MAJOR · confidence HIGH · NEW (measured 1/1 through RLS, control twin in the same fixture, negative control by omission, counterfactual by installation; the brief's second trigger literally in form A, and a contradiction of HT-3-f(2)'s own closure sentence in form G)

**HT-3-f(1) AMENDED bounds the CONFIRM arm. The manoeuvre uses the STAMP arm. A designer who owns a
workspace and holds no employer seat may name that workspace on any legacy project she did not author —
one statement, no preconditions she does not already have — after which bound (b) makes the column FINAL
and her hours there price at the number she wrote for herself for ever, including against a later honest
employer who prices her arm's-length and who then reads none of the work. HT-3-f(2), ruled this same day
to close W2-R9-01, is the rule that opens the door: it is what pushes the derivation to `NULL`, and the
CONFIRM bound only ever fires where the derivation is NOT null.**

*Location.* `supabase/migrations/00606_time_entries_studio_read_narrow.sql`:
bound (a2)'s owned-tier arm at **`:573-588`** — `IF v_actor <> v_designer_id AND NOT EXISTS (… sibling …)`,
so when the caller **is** the designer there is no second-half standing test at all; bound (c)'s amended
confirm gate at **`:652-678`**, reached only under `IF v_derived IS NOT NULL`; bound (e)'s owned-tier arm
at **`:719-741`**, which admits any studio she owns. With `00615`'s
`owned_tier_prices_project(created_by, designer_id)` making `v_derived` NULL for every legacy project whose
author is not its designer.

*Form A — probe A, every write through RLS as her, no seat change of any kind:*

```
A0  two identical legacy projects she did NOT author (her assistant opened them);
    she owns workspace W, holds NO employer seat; her own 99900 in W
    derived(P1) = NULL        derived(P2) = NULL        [HT-3-f(2)]
A1  ONE statement: stamp_project_pricing_studio(P1, W)   → SUCCEEDS, wrote W
A2  an honest employer hires her as a plain `member` and prices her 26000
    derived(P1, pinned) = W            derived(P2, twin) = the employer
A3  her 120-minute hour on the PINNED project    = 99900 / studio_member / 199800
A4  CONTROL, same fixture, same moment, twin     = 26000 / studio_member /  52000
A5  the employer's owner reads 0 of the pinned project's hours; 1 of the twin's
A6  the employer's owner re-pointing it → REFUSED 22023 "this project already names a studio"
```

*Negative control by omission (fresh fixture, identical but for A1 never being called):*

```
B3  her hour on P1, unpinned  = 26000 / studio_member / 52000
B4  and the employer's owner reads 1 of them
```

*The asymmetry the amendment created, in the same control fixture:*

```
B0  derived(a project she AUTHORED) = W            derived(a project she did NOT) = NULL
B1  her stamp of the project she AUTHORED → REFUSED 22023
    "a studio already prices this project's hours — there is nothing to repair"   ← case (y)
```

So the amendment refuses her on the one shape where the derivation answers, and admits her on every shape
where HT-3-f(2) silenced it.

*Counterfactual by installation — HT-3-f(2) is the door (same transaction,
`owned_tier_prices_project` replaced by `SELECT true`, nothing else changed):*

```
E0  derived(the other-authored legacy project) = W     (the pre-HT-3-f(2) answer)
E1  her stamp → REFUSED 22023 "a studio already prices this project's hours —
                               there is nothing to repair"
```

*Form G — probe G, the former employer's own project, TWO ordinary authenticated statements:*

```
G0  baseline: derived(P1) = the employer's studio — it prices her 26000, honestly
G1  statement one: `Members can leave` DELETE on her own seat → 1 row
    derived(P1) = NULL                     ← HT-3-f(2) HOLDS, W2-R9-01's closure works
G2  statement two: stamp_project_pricing_studio(P1, HER workspace)  → SUCCEEDS
    P1.studio_id = her workspace, and bound (b) makes it final
G3  her 120-minute hour on the stamped project = 99900 / studio_member / 199800
G4  CONTROL, the unstamped twin               = NULL  / none          / NULL
G5  the employer's OWNER reads 0 of the stamped project's hours
G6  the employer's OWNER repairing P1      → REFUSED 42501 (owned-tier sibling leg)
G7  the employer's OWNER claiming the twin → REFUSED 42501 (same leg)
```

*Why MAJOR, stated so the orchestrator can re-grade rather than re-derive.*

1. **Form A satisfies the brief's second trigger word for word.** *"a ONE-account manoeuvre with no seat
   left/removed, no ownership transfer, no confederate, and no consent-free seat by a second party, that
   moves the account's own resolved rate to a number it set."* One account; she never held an employer
   seat and removed nothing; no transfer; the project's author did nothing for her and is not a
   confederate; no seat was created at all. Her resolved rate moves from `none` — and from the 26000 the
   negative control proves would otherwise have applied — to the 99900 she wrote, permanently.
2. **Form G contradicts a ruling in force.** HT-3-f(2)'s ruled text closes W2-R9-01 with: *"where the
   employer tier is empty for such a project the answer is `'none'` (HT-26's "rate pending") and part
   (1)'s pin or HT-3-a's stamp is the repair."* Measured: the answer **is** `'none'` (G1, G4 — the closure
   is real), and **HT-3-a's stamp, the repair the ruling names, is available to exactly one party: her**
   (G6/G7 measure the employer refused on both projects, because once she has left, bound (d)'s seat test
   refuses the employer its own studio and bound (e) refuses it everything else). The named repair is the
   taking. W2-R9-01's full end state returns.
3. **HT-3-f(1) AMENDED's own operative sentence is falsified.** *"HT-3-c's finality at project CREATION is
   unchanged: she still names her own workspace on a project she is creating; **what she may not do is
   FREEZE a legacy project's derivation afterwards**."* A1 and G2 are exactly that freeze, afterwards, on a
   legacy project, by her.
4. **And HT-3-f(1)'s justification sentence stays false in her hand** — round 10 measured *"it costs nobody
   anything … and it gives the employer a real remedy BEFORE the fact"* false for the confirm; it is false
   for the stamp too, and worse, because the stamp has no employer-tier bound at all.

*The counter-argument, because it is strong and the orchestrator should weigh it.* **HT-3-f(2) COST NOTE
RULES this act.** It says, of the honest principal whose assistant opened her project: *"the principal
herself stamps her own studio (the owned-tier sibling leg is skipped where `v_actor = v_designer_id`) and
her next hour prices 31000 / studio_member / 62000. **No DB change.**"* Case (ak) ak5/ak6 assert exactly
A1/A3 and call them the repair. So form A is, statement for statement, a **ruled** act; what is unruled is
its **permanence against a party who arrives later**, which the cost note did not consider and which case
(ak) does not assert in either direction. Read that way this is a ruling, not a defect — but the ruling it
needs is one nobody has made, and both the AMENDED sentence in (3) and HT-3-f(2)'s own closure sentence in
(2) read the other way today.

*Nothing in the tree measures it, in either direction.* Case **(y)** uses `created_by = designer_id` (its
own comment says so: *"She created it herself, which is HT-3-f(3)'s residual and the shape HT-3-f(2) does
not reach, so the derivation WILL name her workspace and bound (c) is what speaks"*) — the one shape the
hole does not use. Case **(w)** measures the pin in the **employer's** hand. Case **(ak)** measures the
stamp succeeding and stops before any employer exists. So the suite's green is compatible with both forms.

*Candidate closures (the orchestrator's call, not mine), in the order I would put them:*

1. **Apply HT-3-f(2)'s own key to the stamp, not only to the derivation** — in the owned tier, refuse
   unless `projects.created_by = v_designer_id`. One predicate, already written and already shared
   (`owned_tier_prices_project`). **Cost, stated plainly: it removes HT-3-f(2) COST NOTE's ruled repair
   (ak5) and re-opens W2-R10-03 as a contradiction** — the honest principal's assistant-opened book then
   has no repair at all and prices `'none'` for ever. That trade is a ruling.
2. **Round 10's closure (1), now applied to both arms** — `v_actor <> v_designer_id` on the owned-tier
   stamp as well as the confirm: the designer never names her own workspace on a project she is not
   creating; a colleague does. Keeps the act alive for the principal's studio (her **admin** performs it)
   at the price of also satisfying bound (a2)'s owned-tier sibling leg, which ak4 measured refusing that
   admin `42501` — so it needs that leg relaxed for an owner/admin of a studio the designer owns, and that
   relaxation is itself the W2-R3-01 outsider door the leg was built for. Two rulings, not one.
3. **Make the owned-tier self-stamp NON-FINAL** — let a later employer's arrival re-derive a column the
   designer wrote for herself, keeping HT-3-c's finality for a column an arm's-length party wrote. This is
   the only closure that costs the honest principal nothing, and it is the largest: `set_project_studio_id`
   forbids re-pointing by design, and it needs the **owner-initiated UNPIN act HT-3-f(4) already records as
   owed**. Worth noting that HT-3-f(4)'s owed unpin is the same missing instrument in both findings.
4. **Ruling-only** — record form A as a fourth residual on HT-3-f(3)'s footing and form G as the statement
   of what W2-R9-01's closure actually bought (one extra statement, not closure), in which case the suite
   **must** carry both shapes asserted as PASSING and loudly labelled, because a green suite that asserts
   neither will let the next round re-find them or, worse, wave them through.

*What the "visibility" remedy does and does not do here.* HT-3-e(3) and HT-3-f(3) both answer their
residuals with *"the pricing studio is a column of `time_entry_ledger` and the owner's project lens shows
it"*. Measured in both forms: the only party who can see the pinned studio is the party who wrote it (A5,
G5 — the wronged employer reads **0** rows, so it has no lens on this project at all). Visibility is not a
remedy where the read follows the pinned studio.

### W2-R11-02 · note · confidence HIGH · NEW (the suite's silence is what will carry W2-R11-01 into integration)

Independent of whether W2-R11-01 is re-graded, the coverage gap is its own defect and one the program has
paid for before (W2-R7-01 and W2-R6-01 were both found in populations no case touched). Three cases sit
next to this shape and none of them measures it:

| case | shape | what it asserts | what it leaves open |
|---|---|---|---|
| (y) | `created_by = designer_id`, derivation answers | her confirm REFUSED | the other-authored shape, where the derivation is NULL |
| (w) | `created_by = designer_id`, the pin in the **employer's** hand | the good outcome | the same pin in **her** hand |
| (ak) | `created_by <> designer_id`, her stamp | it SUCCEEDS — the ruled repair | what that success is worth once an employer exists |

*Fix, whichever way W2-R11-01 is ruled:* one case with the other-authored legacy project **and** the
employer twin in the same fixture — `ak7`/`ak8` beside (ak) is the cheapest home, because (ak)'s fixture
already has the shape and needs only a second project and a later hire. If the closure is ruling-only, the
case asserts the 99900 and the employer's 0 as PASSING and loudly labelled (the (z) pattern). If a closure
lands, the same case asserts the refusal and ak5 moves.

### W2-R11-03 · note · confidence HIGH · NEW (the amended confirm closes the owned tier to EVERY caller, which is wider than the amendment's own reasoning)

The gate is `IF NOT v_named_is_employer_seat THEN RAISE`, a property of *(the designer, the studio named)*
— not of the actor. So the owned-tier confirm is now refused to a sole proprietor's honest **partner-admin**
as well as to the designer herself. The amendment's justification addresses only the designer (*"It costs
an honest sole proprietor nothing she has today"*), and that is true of her; nobody measured the colleague.
Recorded, not asked to be fixed: (i) the act is pointed at `'none'` by construction, so a derivation that
already answers needs no colleague, and (ii) making it actor-shaped is what round 3's bound (e) did and
round 4 rated a MAJOR for (the designer can author the actor). Worth one clause in the banner so a later
hand does not "restore" it as a widening.

### Discharged this round, verified rather than trusted

| id | How it was verified | State |
|---|---|---|
| **W2-R10-01** | probe B1 on a fresh fixture: her confirm of her own workspace → `22023`, and `SQLERRM` carries the pre-round-9 sentence (so it is bound (c)'s owned-tier arm and not a standing refusal in the same clothes); the employer's remedy still works (case (e)/(w)/x7 green) | **closed on the CONFIRM arm.** The money shape relocated to the stamp arm — W2-R11-01 |
| **W2-R10-04** | `position()` probed on the **installed** bodies: `into v_employer_studios` at 1341/1010 against the bare-name DECLAREs at 399/251; `public\.organization_members` count = 2 | **CLOSED.** The asserts now measure the tier reads, not declaration order |
| **W2-R10-05** | the file fails at **01:48 UTC** (inside the window) and passes with **0 errors** under `PGTZ=America/Chicago` at 01:58 UTC; `KNOWN_FAILURES.md:114` names the window, the line, the mechanism and the one-expression repair | **CLOSED as documentation.** The gate's "expected" set is now right; the file is still not this program's |
| **W2-R10-06** | `./scripts/generate-legacy-grants.py` run from the worktree → 2630 statements, empty diff; `plan-v2.md` §0.20 now carries the rule with the measurement | **CLOSED.** Note: the four per-wave gate lines (`:153`, `:292`, `:435`, `:569`) still read `python3 scripts/generate-legacy-grants.py` — relative, so correct from `--workdir`, but not the `./` spelling §0.20 prescribes. Cosmetic |
| **W2-R10-08** | the `COMMENT` on `owned_tier_prices_project` carries the W2-R10-08 clause; `projects.created_by` re-measured NOT NULL | **CLOSED** |
| **W2-R8-04** | `plan-v2.md:25`, `:708`, `:771` all now say `00615` is SPENT BY W2, W5 mints nothing, `00616–00617` are W6's, `00617` is the only unspent number; `rulings.md` matches | **CLOSED** |
| **W2-R9-02/03/04** | the rls + billing suites green under UTC **and** `America/Chicago`; `original_created_by` still the displaced author after a chain of rewrites (case (x) green) | **Still closed** |

### Carried — each re-measured this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R10-02** (= HT-3-f(4), the consent-free outsider's pin, now irreversible) | note — ruling owed · HIGH | **RECORDED as ruled**, and case **(z)** asserts the taking as PASSING with the owed consent door and the owed UNPIN named in its messages. Still the heaviest note — and **W2-R11-01 closure (3) is the same owed unpin** |
| **W2-R10-03** (= HT-3-f(2)'s cost to an honest principal) | note — minor cost · HIGH | **RECORDED as ruled**, case **(ak)** added as asked, ak1–ak6b re-verified green. **Lane B still owes** the principal a sentence and her admin an explanation for an empty project lens |
| **W2-R8-02** (the employer arm admits a consent-free outsider) | note — ruling owed · HIGH | Live, code unchanged; subsumed into HT-3-f(4) |
| **W2-R8-03** (the owner exemption is a LIVE-seat test) | MINOR · HIGH | Live, code unchanged. **W2-R11-01 form G is its fourth face**: the same live-seat reading that re-opens her owned tier is what makes her the only party who can stamp |
| **W2-R8-05** (the arm's-length leg bounds an order, not an actor) | MINOR · MEDIUM | Live. Still satisfiable by the stamping caller in the same session; still accepts a CLOSED row |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Shrunk, not gone.** The two ordering asserts are fixed and the `v_org_reads` count is now schema-qualified; the remaining asserts are still `prosrc LIKE`/`position()` heuristics over source text. The behaviour is carried by (ai)/(aj)/(ak) and (e)/(w)/(x)/(y)/(z) |
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live, re-run** — red at `:171`, so W2's re-registration at `:545-548` is never reached and §0.17's discharge is asserted by no green gate. W1's; ruling owed. **Eleventh round of asking** |
| **W2-R6-06** (a member infers a teammate's rate) | note — ruling owed · HIGH | **Live, re-measured:** `project_hours_total` answers the rostered plain member, the lead designer, the studio owner and the studio admin **identically** — `180 / 180 / 140000`. She knows her own 60 minutes and her own 40000, so `(140000 − 40000)/(180 − 60) × 60 = 50000` is the lead's confidential rate, exactly. Rule whether `amount_cents` is owner/admin-only. Lane B inherits it |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured per role on a real draft invoice:** an invoiced row's `duration_minutes`, `billable` and `DELETE` all raise `P0001 … is attached to invoice …` for the **owner and the admin alike**; the row survives at 120 minutes; **`notes` rewritten by either → NO RAISE, 1 row** |
| **W2-R2-09** (the audit trigger has no `WHEN`) | MINOR · HIGH | **Live, re-measured two ways:** `pg_get_triggerdef` shows `AFTER DELETE OR UPDATE … FOR EACH ROW` with no `WHEN`; one ordinary owner adjust wrote **exactly one** `audit_logs` row (`time_entry.updated`, `organization_id` = the pricing studio, `user_id` = the owner, `old_values` **and** `new_values` present, `updated_by` = the owner, the row re-derived `50000 / studio_member / 75000` at 90 minutes) |
| **W2-R10-07** (the capability restored to both parties) | note · HIGH | Discharged as asked — legs **x7/x8** added to case (x) |
| **W2-R10-09** (HT-3-f(3)) / **W2-R10-10** (`ON DELETE SET NULL`) | note — residual · HIGH / MEDIUM | Live, ruled / recorded. Unchanged |
| **W2-R2-05/06/07/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | MINOR/NOTE | Live, unchanged — round 10 touched none of those files |
| `W2-impl.md` findings 2–5 | acknowledged | unchanged |

### The brief's read/refusal probes, re-measured (every call through RLS as the named actor)

| probe | result |
|---|---|
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** — she reads **1 of 2** entry rows on the project (her own) and **0** of the lead's, so `notes` and `hourly_rate_cents` are unreachable; **0** rows of the lead's `studio_member_rates`; **1** `time_entry_ledger` row. Her own row's `hourly_rate_cents` rewrite → `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`. Her UPDATE and DELETE of the lead's row each touch **0** rows; an **admin**'s adjust of that same unbilled row touches **1** |
| `project_hours_total` per role | owner **180/180/140000** · admin **180/180/140000** · lead designer **180/180/140000** · rostered member **180/180/140000** · `guest` co-member **42501 `the caller is not on this project`** · outsider **42501**, same message (W2-R6-06) |
| the rollup never returns notes | **confirmed on the signature, the rows and the view.** `studio_hours_rollup`'s OUT names are exactly `bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes` — **0** named `notes`; `time_entry_ledger` has **0** columns named `notes`; `studio_hours_rollup` is **SECURITY INVOKER**. Buckets per role: owner **2**, rostered member **1** (her own), the member passing the lead's `p_user_id` **0**, a cross-studio outsider **0**; a sixth `p_group_by` literal raises **22023** |
| the audit trigger on an owner adjust | **exactly one** row, 0 → 1, as tabulated in W2-R2-09 above |
| owner/admin writes cannot touch invoiced rows | **confirmed for both roles** — duration, `billable` and DELETE all raise `P0001`; only `notes` passes (W2-R2-13) |
| r10's probes **D**, **E**, **I** under the amendment | **D closed** (her confirm refused, pre-round-9 message — case (y), re-measured independently as B1). **E recorded as HT-3-f(4)** and asserted passing in case (z). **I recorded as HT-3-f(2)'s cost** and asserted in case (ak), ak1–ak6b green |
| r9's probes **A** / **C** / **D2** | **A repaired and widened** (case (x), x2 + x7/x8 green). **C closed at the derivation** — re-measured end to end on a fresh fixture: her `Members can leave` DELETE → 1 row, derived `NULL`, her next hour `NULL / NULL`. **But see W2-R11-01 form G**: one further ordinary statement restores C's original outcome in full. **D2** (`status = 'removed'`) is the same door reached by an admin's UPDATE and inherits the same continuation |
| r7/r8 shapes, for regressions | `time_entry_studio_stamp_test.sql` PASS with cases (e), (f), (i), (l), (m), (n), (o), (p), (q) q7–q15, (r), (s), (t), (u), (v), (w), (x), (y), (z) — P1, P7, P8 and HT-3-e(3)'s transfer form all still behave as ruled |

### Doors I checked and found SHUT

| attempt | result |
|---|---|
| she demotes her own `owner` seat to `admin` (to put her own workspace in her EMPLOYER tier and open the confirm arm) | **0 rows, no raise** — `Org admins can update members`' `USING` excludes `role = 'owner'`. `studio_titles_test`'s documented `FAIL f` is this silence: the test expects `last_owner_protected` and gets a no-op, so the row is unchanged (`role` still `owner`) and the door is shut notwithstanding the red file |
| she adds a **second**, `member` seat for herself in her own org (same effect, without losing the owner row) | **23505** `duplicate key value violates unique constraint "organization_members_user_id_organization_id_key"` |
| she deletes her own `owner` seat | **0 rows, no raise** — `Members can leave` excludes `role = 'owner'` |
| the confirm gate satisfied vacuously (a gate above the derivation read, or below bound (d)) | **shut by the new postcondition**, and both position comparisons probed `t` on the installed body |
| the confirm re-pointing an already-stamped project | **22023 `this project already names a studio`** — bound (b) runs before bound (c) (A6, G-form re-measured) |
| `anon` reaching `stamp_project_pricing_studio` or `studio_hours_rollup` | **no EXECUTE** on either |
| `owned_tier_prices_project` reachable by a caller | **no EXECUTE** for anon / authenticated / service_role; INVOKER, IMMUTABLE, search_path pinned |

---

## Pre-existing failures, listed separately as the brief asks

**Nine**, none of them W2's, **all nine now documented** in `supabase/tests/KNOWN_FAILURES.md`: six in
`commercial` (the countersign/grant family — `authorized_schedule`, `design_services_authority`,
`design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`), the **seventh**
`commercial/direct_order_attribution_test.sql` (clock-dependent, `:114`, documented this pass — W2-R10-05
discharged; it fails in this run because the run fell at 01:48 UTC and passes under `America/Chicago` in
the same minute), and two in `rls` (`design_requests_test.sql` `FAIL 3b`, `studio_titles_test.sql`
`FAIL f`). The runner's default `-k` points at a per-directory `KNOWN_FAILURES.md` that does not exist, so
it counts all of them as "unexpected"; the plan's own gate line passes `-k` explicitly.

`rls/studio_titles_test.sql` `FAIL f` is the one that touches this program's mechanism, and this round
**re-measured what it does and does not mean**: the demotion it expects to raise is instead silently
filtered by RLS to 0 rows, so the sole-owner seat is in fact protected and the self-demotion route into the
employer tier is shut. The file is red for the wrong reason, not for a missing guard.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171` (W2-R4-08 / W2-R2-10). Not in this round's gate list, not touched, ruling owed. **Eleventh round of
asking.**

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. Its two carried copy obligations (the
  principal's sentence, her admin's empty project lens) and W2-R6-06's inherited ruling are unchanged.
- **The eleven commits' TypeScript beyond round 10's delta.** Round 10 touched **no** TypeScript at all
  (five files: two migrations, two SQL test files, one markdown). `packages/supabase/src/hooks/use-time-tracking.ts`
  and `hooks/index.ts` are r1–r8's and were reviewed there; I re-ran their gates, not their diffs.
- **`pnpm --filter @patina/designer-portal test` / `lint`, and any `DATA_MODE=live` e2e line** — outside
  the brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R11-01 over HTTP.** Every statement both forms need is an ordinary `authenticated` call the
  policies and grants admit (`stamp_project_pricing_studio` is GRANTed to `authenticated`; `Members can
  leave`; the project/time-entry/rate INSERTs), but I drove them through `psql` with the session's JWT
  claims set, not through PostgREST.
- **Against the live portal UI.** Whether the designer portal exposes a "name the pricing studio" control
  today is unchecked; the GRANT and the policies are the evidence that the API path exists.
- **Concurrency and volume.** No two-simultaneous-stamp race (bound (b) plus the trigger's independent
  re-validation is the argument, not a measurement); no measurement of W2-R2-06's per-row DEFINER policy
  call.
- **Whether W2-R11-01 is a defect or a ruling.** Both readings are set out above with the measurements
  that separate them — form A is a ruled act (HT-3-f(2) COST NOTE) whose permanence is unruled; form G
  contradicts HT-3-f(2)'s own closure sentence. Which applies is the orchestrator's call, not mine.
- **No prod anything.** Every command ran against `127.0.0.1:54422`; nothing was pushed to Strata. W1's
  ordering constraint stands: `00599`/`00601` must not reach Strata ahead of `00606`/`00615`, and `00615`
  now carries three rules. **The Strata population of `projects.studio_id IS NULL`, split by whether
  `created_by = designer_id`**, is **still uncounted** — and after this round it is no longer only a
  sizing question: the split **is** the line between HT-3-f(2)'s ruled repair and W2-R11-01's taking. One
  read-only two-column query. **Twelfth round of asking.**
- I staged and committed nothing. `supabase/config.toml` remains skip-worktree'd and untouched. Every
  probe script lives in the session scratchpad and ends in `ROLLBACK`; the counterfactual installed its
  replaced body **inside** such a transaction, and the live `prosrc` markers were re-checked afterwards
  (`owned_tier_prices_project` back to the `p_created_by = p_designer_id` body, bound (c)'s gate literal
  present). The `billing`, `rls` and `commercial` suites were re-run **after** every probe and returned
  byte-identical summaries to the pre-probe run.
