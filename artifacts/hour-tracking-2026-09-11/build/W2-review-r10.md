# W2 — lane A (DB) adversarial review, round 10

**clean = false — ONE MAJOR.** It is the brief's second blocker/major trigger **literally**, and it is
created by HT-3-f(1) itself: *one* account, *no* seat left or removed, *no* ownership transfer, *no*
confederate, *no* consent-free seat, *no* rate written in anybody else's studio. A designer who owns
the workspace `00295` provisioned for her **pins that workspace onto her own legacy project with one
statement** — the CONFIRM HT-3-f(1) just opened — and then an honest employer hires her. Her hour on
the pinned project came back **99900 / studio_member / 199800** where the control twin in the same
fixture at the same moment came back **26000 / studio_member / 52000**; the employer read **0** of the
pinned project's hours against **1** of the twin's; and **nothing can undo it** (bound (b)). Negative
control by installation, same transaction: with bound (c) restored to the pre-round-9 flat refusal the
pin is REFUSED and the identical hour prices **26000 / 52000**.

Besides it: **five new MINORs and four notes**, plus the carried set, each re-checked. Two of the new
MINORs are widenings HT-3-f itself produced (residue (i) becomes irreversible; an honest principal's
legacy project silently unprices and her own admin can neither see it nor repair it); three are gate
hygiene (two new ordering postconditions are vacuous; a NINTH undocumented clock-dependent failure in
the suites this gate runs; the grants-seed generator writes to the wrong checkout).

**Round 9's MAJOR (W2-R9-01) is genuinely discharged, measured on a fresh fixture AND by
installation.** With HT-3-f(2) installed, probe C (the shipped `Members can leave` DELETE) and probe
D2 (`status = 'removed'`) both answer `NULL / none / NULL` on her former employer's legacy project.
With `owned_tier_prices_project(...)` surgically removed from the resolver and the callable form — and
**nothing else changed**, HT-3-e(2) left in place — the identical probe returns
`99900 / studio_member / 199800`. So the shared body is what closes it, and the closure is not
fixture-shaped.

**W2-R9-02, W2-R9-03 and W2-R9-04 are discharged.** Measured: the displaced author survives a chain of
rewrites, is unnameable on INSERT and unwritable on UPDATE, the OWNER's stamp succeeds where round 9
measured 42501, and her hour still prices `'none'` (the column is standing, not pricing). The two gate
files are green at 01:0x UTC **and** under `America/Chicago` **and** under `Etc/GMT+12`, where
`CURRENT_DATE` lags the UTC date of `NOW()` by a full day — the exact hazard, simulated rather than
waited for.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **ten** commits,
`c71db49d9` → … → `ef4cc2d57` → **`abd25e835`** (round 9's fix; HEAD == `hour-tracking/server` ==
`origin/hour-tracking/server`, tracked tree clean). Round 9's delta is **six** files — `00606` (+176),
`00615` (+624), `database.types.ts` (+21), `00-legacy-grants.sql` (+30),
`billing/time_rate_resolution_test.sql` (+371), `rls/time_entry_studio_stamp_test.sql` (+453) — and I
read every line of it, re-derived all five grafts mechanically, read `00606`'s bounds (a)–(e) in full,
`00563`'s qualification arms and its `v_lead_has_designer_role` gate, `00295`'s provisioning guard,
`00412`'s invoicing guard, `rulings.md` (HT-3-a/b/c/d/e/e(4)/f verbatim, plus W2-R9-02/03/04) and
`plan-v2.md` §0/§3/§W5–W7. Lane B is phase 2; its absence is not counted.

**Graft integrity (patina-db-migrations step 2), re-derived rather than trusted.** Grep winners
confirmed independently (`CREATE OR REPLACE FUNCTION[^(]*<name>` over `supabase/migrations/*.sql |
sort | tail -1`): `00599`, `00603`, `00604`, `00598`, `00598`. A mechanical diff of the **function
bodies**, not the files:

| function | source body (grep winner) | diff against `00615` |
|---|---|---|
| `resolve_time_rate_cents` | `00599` | **+40 / −3** — HT-3-e(2)'s clause (round 8), HT-3-f(2)'s condition, `project.created_by` added to the existing SELECT. Nothing else |
| `project_pricing_studio_id` | `00604` | **+13 / −3** — the same column, the `IF NOT owned_tier_prices_project … RETURN NULL`, and two comment lines. Nothing else |
| `set_project_studio_id_owned` | `00603` (**not** `00602`, which `00603` superseded) | **+9 / −3** — one condition on the OWNED tier's `ELSIF`; the three removed lines are comment text re-pointed from "the banner" to "00603's banner" (cosmetic, and correct — the banner is no longer in this file) |
| `guard_studio_member_rate_history` | `00598` | **+44 / −0** — HT-3-e(4)'s stamp (round 8), W2-R9-02's `original_created_by` assignment, and that column joining the identity-freeze list |
| `guard_studio_member_rate_insert` | `00598` | **+6 / −0** — one `NEW.original_created_by := NULL` discard |

Every lineage banner names the right source. No trigger is recreated; live `pg_tgtype`:
`zzz_set_project_studio_id_owned_trg` = 7 (BEFORE/ROW/**INSERT only**, P-4),
`aaa_guard_studio_member_rate_insert_trg` = 7, `aaa_guard_studio_member_rate_history_trg` = 19
(BEFORE/ROW/UPDATE) and still sorting before `close_prior_studio_member_rate_trg`.

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`, exit 0; the only `error`-matching line in the log is the filename `00458_sms_message_error_capture.sql`; ledger tail `…00604, 00605, 00606, 00607, 00615` |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` (cases (ai) and (aj) among them) |
| `run-sql-tests.sh -d …/tests/commercial …` | **9 green / 16, 7 unexpected.** SIX are pre-existing and documented (`KNOWN_FAILURES.md:69, :97-101`). The **SEVENTH — `direct_order_attribution_test.sql` — is NOT documented anywhere** and is clock-dependent: see **W2-R10-05**. It is not W2's file (absent from the branch diff) |
| `run-sql-tests.sh -d …/tests/rls …` (all 30) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` (`FAIL 3b`), `studio_titles_test.sql` (`FAIL f`), both pre-existing and documented (`:114-115`). `time_entry_studio_stamp_test` (with (e), (w), (x)), `studio_member_rates_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio`, `00584_studio_comember_rls_sweep` all **PASS** |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (exit 0, full route table) |

**W2-R9-04, closed — proved three ways, not by re-running at a lucky hour.** Same database, same
commit, nothing else changed:

```
session TZ = UTC (the server default; run-sql-tests.sh sets none)
           billing 7/7 · rls 28/30 (the two documented)
session TZ = America/Chicago        billing 7/7 · rls 28/30   (identical)
session TZ = Etc/GMT+12             billing 7/7 · rls 28/30   (identical)
  — and in THAT session CURRENT_DATE = 2026-09-12 while (NOW() AT TIME ZONE 'UTC')::date
    = 2026-09-13, i.e. the red window round 9 measured, simulated deliberately.
```

Construction checked as well as behaviour: **zero live bare `CURRENT_DATE`** remains in either file
(the two remaining occurrences are inside the banner paragraphs that explain the fix), 50 + 28
occurrences of `(NOW() AT TIME ZONE 'UTC')::date`, and the two repair rows that must cover a
`NOW()`-anchored hour are dated `- 1`.

Run beyond the brief's list:

| Command | Result |
|---|---|
| `./scripts/generate-legacy-grants.py` **from the worktree** → `git diff --exit-code …/00-legacy-grants.sql` | **CLEAN** (baseline + **2630** replayed statements). ⚠ see **W2-R10-06** — the main checkout's copy of the script writes the main checkout's seed (2572), not this one |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **CLEAN** |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R4-08**. **Tenth round** |
| migration-number sweep over `--all` refs and every worktree | `00604`–`00607` and `00615` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `hour-tracking/edge`; `00616`/`00617` unused anywhere. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the ten commits; round 9's commit touches exactly the six intended files; Conventional Commits (`fix(time): W2-R9 — HT-3-f`) |
| live object probe after the clean reset (step 7) | `owned_tier_prices_project`: **INVOKER**, **IMMUTABLE**, `search_path` pinned, EXECUTE held by **none** of anon/authenticated/service_role. All **three** derivations call it (resolver, callable form, INSERT stamp) — verified in the installed `prosrc`, not in the file. Bound (c) is a confirm; bound (a2) reads `original_created_by`; the history guard keeps the displaced author; the INSERT guard discards it |
| `original_created_by` | `uuid`, nullable, **0 rows carry a value** after a full reset + seeds (P-4, no backfill). Exactly **three** functions in any schema mention it (`guard_studio_member_rate_history`, `guard_studio_member_rate_insert`, `stamp_project_pricing_studio`); **zero** views reference `studio_member_rates`; table grants `authenticated` = SELECT/INSERT/UPDATE, **no DELETE** |
| `projects.created_by` nullability | **NOT NULL** — measured (an INSERT of NULL raises `23502`). So HT-3-f(2) cannot be dodged with an authorless project, and `owned_tier_prices_project`'s two NULL legs are defensive only (**W2-R10-08**) |

---

## Findings

### W2-R10-01 · MAJOR · confidence HIGH · NEW (measured 1/1 through RLS, with a control in the same fixture and a negative control by installation; the brief's second trigger, literally)

**HT-3-f(1)'s CONFIRM is available to the DESIGNER herself, not only to an employer. One statement
pins the workspace she owns onto her own legacy project while her employer tier is empty — and
because the column is then FINAL (bound (b), HT-3-c), her hours on that project price at the number
she wrote for herself for ever, including after an honest employer hires her and prices her
arm's-length. Her employer cannot read those hours and cannot undo the pin.**

*Location:* `supabase/migrations/00606_time_entries_studio_read_narrow.sql:609-615` (bound (c), the
confirm) reached past bound (a) (`:450`, she is the OWNER of the studio named), bound (a2)'s owned-tier
arm (`:553-567`, whose sibling leg is **skipped outright when `v_actor = v_designer_id`**), bound (d)
and bound (e) (the OWNED tier, admissible because her employer tier is empty at call time).

*Measured — probe D, every write through RLS as her, no manoeuvre but the pin itself:*

```
D0  two identical legacy projects she CREATED herself; she owns workspace W (00295's)
    and holds NO employer seat. derived(e1) = W, derived(e2) = W
D1  ONE statement: stamp_project_pricing_studio(e1, W)      → SUCCEEDS, wrote W
D2  an honest employer (Leah) hires her as a plain `member` and has priced her 26000
    derived(e1, pinned)   = W          derived(e2, unpinned) = Leah's studio
D3  her 120-minute hour on the PINNED project     = 99900 / studio_member / 199800
D4  CONTROL, same fixture, same moment, unpinned   = 26000 / studio_member /  52000
D5  Leah reads 0 of the pinned project's hours; 1 of the unpinned twin's
D6  Leah's attempt to re-point it → REFUSED 22023 "this project already names a studio"
```

*Negative control, same transaction, bound (c) restored to its pre-round-9 flat refusal and nothing
else changed:*

```
D1  → REFUSED 22023 "a studio already prices this project's hours — there is nothing to repair"
D3  → 26000 / studio_member / 52000   (identical to D4; Leah reads 1 of 1)
```

*Why MAJOR, stated so the orchestrator can re-grade rather than re-derive.* The brief's wording: *"a
manoeuvre by ONE account that neither leaves/removes its own studio seat nor transfers ownership and
still moves its own resolved rate to a number it set."* One account. No seat left or removed — she
never held an employer seat when she acted. No ownership transfer. No confederate. No consent-free
seat. One statement, and the 99900 is hers permanently against an employer's 26000 that the control
twin proves would otherwise have applied.

*The counter-argument, because it is strong and the orchestrator should weigh it.* At the **moment of
the pin** the number was already hers: HT-3-a arm (a) and HT-3-c arm (a) RULE that a sole proprietor
prices her own work, and HT-3-f(3) accepts exactly this project (self-created, her own workspace) as a
residual. So the pin does not *move* a present price; it *freezes* a price the rulings already call
correct, and it is the same capability HT-3-c arm (a) already gives her at project **creation** (name
your own workspace, final thereafter). Read that way this is correct-as-built and the finding is a
ruling, not a defect. **What is certainly wrong either way is HT-3-f(1)'s own justification** —
*"It costs nobody anything (it names the studio that is already pricing these hours and already reading
them) and it gives the employer a real remedy BEFORE the fact"* — which is measurably false: it costs
the FUTURE employer the whole of the work, and the "remedy" is equally an instrument in the hand of the
person being priced. Nothing in the tree measures it: case (w) measures the pin in the **employer's**
hand on HT-3-f(3)'s shape and asserts the good outcome; the inverse — the **designer's** hand, the same
shape — is unasserted in either direction.

*Candidate closures (the orchestrator's call, not mine), in the order I would put them:*
1. **Bound the confirm to a caller who is not the project's designer.** `v_actor <> v_designer_id` on
   the confirm arm only (a NULL derivation keeps today's behaviour, so HT-3-a's remedy for a genuine
   sole proprietor whose project reached `'none'` is untouched). One `AND`. Costs an honest sole
   proprietor nothing she has today: her project already prices from her workspace without a pin.
2. **Bound the confirm to the EMPLOYER tier** — confirm only where `v_named_is_employer_seat`. That is
   exactly the population HT-3-f(1) was ruled for (W2-R9-01's employer), and it refuses the owned-tier
   confirm outright. Stronger than (1), and it removes **W2-R10-02** at the same time.
3. **Ruling-only:** record it as a third residual on HT-3-f(3)'s footing — *a designer may pin her own
   legacy book before taking employment, and that pin survives employment* — in which case the suite
   must say so, because a `w`-shaped case asserted in the **designer's** hand is the only thing that
   will stop the next round re-finding it.

### W2-R10-02 · MINOR · confidence HIGH · NEW (HT-3-f(1) widens HT-3-e residue (i) / W2-R8-02 from REVERSIBLE to IRREVERSIBLE)

**The consent-free outsider could not reach bound (c) before round 9: his own seat made the victim's
employer tier answer, and a flat refusal fired. The CONFIRM is exactly the door that opens for him.
After he pins his own org, the victim's removal of the bogus seat no longer undoes anything.**

*Measured, probe E, three authenticated statements of his and one of hers:*

```
E0  the victim owns workspace V and created her legacy project; derived = V
E1  he seats her in HIS org consent-free (`Org owners can insert members`)      → 1 row
E2  he writes HER rate there, 99900, under his own id (arm's-length by the test)
E3  derived = HIS org
E4  his stamp_project_pricing_studio(her project, his org)  → SUCCEEDS, wrote his org
E5  she DELETES the bogus seat (`Members can leave`)        → 1 row; derived STILL his org
E6  her next 120-minute hour                  = 99900 / studio_member / 199800
                                                (her own studio had priced her 28000)
E7  he still reads 1 of her hours, with his seat gone
E8  she cannot repair it → 22023 "this project already names a studio"
```

*Negative control, bound (c) restored to the flat refusal, nothing else changed:*

```
E4  → REFUSED 22023         E5  derived reverts to V
E6  → 28000 / studio_member / 56000        E7  he reads 0 of her hours
```

*Severity.* Per the brief's discipline this is a second party, so it is graded as a widening of an
already-ruled residue rather than as the one-account trigger. It contradicts no operative rule — but it
falsifies the same justification sentence W2-R10-01 does, and it changes residue (i)'s cost: the owed
consent door (HT-3-b arm (c)) was the closure, and a consent door closes the **future** while a pin
already taken stays taken. If the pin ships as ruled, residue (i)'s closure now needs a way **back**
(an unpin, or an owner-initiated re-derivation) that the program does not have and `set_project_studio_id`
forbids by design. Closure 2 of W2-R10-01 (confirm only in the employer tier) removes this finding
entirely, because the outsider's seat is an employer-tier seat — so it would have to be closure 1.

### W2-R10-03 · MINOR · confidence HIGH · NEW (HT-3-f(2)'s cost to an HONEST studio, both halves, with no manoeuvre at all — and nothing in the suite measures the shape)

**A studio principal who leads a legacy `studio_id IS NULL` project her ASSISTANT opened for her now
prices `'none'`, her own studio's ADMIN reads none of those hours and cannot repair them, and the only
person who can is the principal herself.**

*Location:* `00615`'s three grafts (`owned_tier_prices_project(created_by, designer_id)`) plus
`00606`'s owner/admin read policy and `project_hours_total`, both of which key on the now-NULL
derivation; plus bound (a2)'s owned-tier sibling leg at `00606:553-567`.

*Measured, probe I — an ordinary studio, every write through RLS, no attacker and no manoeuvre:*

```
I0  derived(her legacy project) = NULL        [before HT-3-f(2): her own studio]
I1  her own 120-minute hour            = NULL / none      (her studio had priced her 31000)
I2  her studio's ADMIN reads 0 of the hours, 0 time_entry_ledger rows
I2c project_hours_total as that admin  → 42501 "the caller is not on this project"
I3  the ADMIN's repair → 42501 "this studio holds no project that this project's
                                designer both leads and created"
```

*and the repair that does exist, measured separately (probe A):* the principal **herself** stamps her
own studio (the owned-tier sibling leg is skipped for `v_actor = v_designer_id`) and her next hour
prices `31000 / studio_member / 62000`. So HT-3-f(2)'s ruled sentence — *"part (1)'s pin or HT-3-a's
stamp is the repair"* — **holds**, which is why this is MINOR and not a contradiction. Independently
confirmed in the reverse direction: with HT-3-f(2) surgically removed the same hour prices
`31000 / studio_member / 62000` with no stamp at all.

*Why it still matters.* This is the same family as **W2-R7-01**, which round 7 rated MAJOR for refusing
the population the act exists for; it is narrower (it needs a designer with no employer seat, i.e. a
principal, and a project somebody in her own studio opened for her) but it is silent in both
directions: the money becomes HT-26's "rate pending" with no event, and the one colleague who could
notice is the one the read policy now excludes. *Fix:* nothing in the DB is required — but (a) the
suite should carry this shape as a case, in `billing/time_rate_resolution_test.sql` beside (ai)/(aj),
because every existing case uses a hire **with** an employer seat or a self-created project and the next
hand who widens or narrows HT-3-f(2) will not know this arm exists; (b) lane B owes the principal a
sentence and her admin an explanation for an empty project lens; and (c) the **Strata count** of
`projects.studio_id IS NULL` split by `created_by = designer_id` — now a two-column read, still
uncounted after **ten** rounds of asking — is what says whether this is one test project or a studio's
book.

### W2-R10-04 · MINOR · confidence HIGH · NEW (two of the three new ordering postconditions are vacuous — W2-R8-06's class, and the file's own banner claims otherwise)

**`00615`'s HT-3-f postcondition block pins "the EMPLOYER tier is still read before the OWNED tier"
for the callable form and the INSERT stamp with `position('v_employer_studios' in …) <
position('v_owned_studios' in …)` — and in both bodies the first occurrence of each name is in the
DECLARE block, so the assert is satisfied by DECLARATION ORDER and says nothing about which tier the
body consults.**

*Measured against the installed bodies:*

```
callable form: 1st 'v_employer_studios' at 554, 1st 'v_owned_studios' at 581
               both inside "… v_employer_studios uuid[]; v_owned_studios uuid[]; begin …"
INSERT stamp:  409 and 436 — the same two declarations
```

The resolver's own copy of this assert, added in the same pass, **is** correctly anchored
(`position('INTO v_employer_studios' …)` → 4305 < 5401 < 5731, and its `v_src` is deliberately
un-lowercased so the uppercase `INTO` literal matches). `W2-fix-r9.md`'s "Reported, not assumed" item 4
describes exactly that care — *"the positions are of the tier READS (`INTO …`), not of the
declarations"* — and `00615`'s comment repeats it, but only one of the three asserts got it. *Fix:* two
literals, `'into v_employer_studios'` / `'into v_owned_studios'` (the two blocks' source is lowercased,
so lowercase them). Carried alongside the other standing instance of this class: the callable form's
`v_org_reads = 2` counts occurrences of `organization_members` in source text **including comments**,
so a later hand who so much as names the table in a comment inside that body reds the migration.

### W2-R10-05 · MINOR · confidence HIGH · NEW (a NINTH unexpected failure in the suites this gate runs — undocumented, and the same clock-dependence W2-R9-04 swept out of two files)

**`supabase/tests/commercial/direct_order_attribution_test.sql` fails at `:488` — *"two roster
designers on one day must file the order uncredited"* — for any run between **00:00 and 02:00 UTC**. It
is not in `supabase/tests/KNOWN_FAILURES.md`, and it is not W2's file.**

*Mechanism, measured:* the tie fixture writes two `designer_clients` rows at `NOW() - INTERVAL '2
hours'` and `NOW() - INTERVAL '1 hour'` (`:120-122`) and the attribution rule groups them by **day**. In
the first two hours after UTC midnight the two timestamps fall on different dates, the tie dissolves,
and the newer row credits a designer where the assert requires none.

```
01:0x UTC, session TZ = UTC                  → FAIL at :488, got da000000-…-00d2
01:0x UTC, session TZ = America/Chicago       → the file passes, 0 errors, ROLLBACK
```

*Why it is reported here even though W2 did not write it.* Both `W2-review-r9.md` and `W2-fix-r9.md`
assert the baseline as *"Eight, none of them W2's, identical to the r1–r9 baseline, all in
`supabase/tests/KNOWN_FAILURES.md`"* and *"six in commercial"*. Measured this round it is **nine**, and
the ninth is undocumented — so the gate's own definition of "expected" is wrong, and the next round
will either re-find it or (worse) wave it through as "one of the documented ones". W2-R9-04 swept two
files; this is the third, in a directory the W2 gate runs. *Fix:* either document it in
`KNOWN_FAILURES.md` with the window named, or give it the same one-expression treatment the two W2 files
got (`NOW() - INTERVAL '26 hours'` / `'25 hours'`, or date both rows off
`(NOW() AT TIME ZONE 'UTC')::date`). Not W2's code either way — it is the program's gate definition.

### W2-R10-06 · MINOR · confidence HIGH · NEW (gate hygiene: the grants-seed generator regenerates the checkout it LIVES in)

**`scripts/generate-legacy-grants.py` resolves the repo root from its own path, so running the main
checkout's copy while reviewing a worktree rewrites the MAIN checkout's seed and reports the wrong
count.** Measured: `python3 /Users/kody/Code/patina-merged/scripts/generate-legacy-grants.py` →
*"wrote /Users/kody/Code/patina-merged/supabase/seed/00-legacy-grants.sql — baseline + **2572**
replayed statements"* (main has none of `00604`–`00615`); `python3
…/.codex/worktrees/agent-server/scripts/generate-legacy-grants.py` → *"wrote
…/.codex/worktrees/agent-server/supabase/seed/00-legacy-grants.sql — baseline + **2630**"*, which is
the number `W2-fix-r9.md` reports and which diffs clean. **No damage done** — the main checkout's file
was already byte-identical to what the script produces there (`git diff` on that path: empty; I ran
nothing else in the main checkout). *Fix:* one line in the program's gate list — always invoke the
WORKTREE's copy (`./scripts/generate-legacy-grants.py` from `--workdir`), never the absolute main-checkout
path. The hazard is silent in the dangerous direction: an agent that runs the main copy sees a CLEAN
diff there and concludes the worktree's seed is regenerated when it is not.

### W2-R10-07 · note · confidence HIGH · NEW (a capability RESTORED this round that case (x) does not measure)

W2-R9-02's `original_created_by` restores the arm's-length standing to **both** parties, not only to the
employer. Measured (probe F): after the admin-designer rewrites her employer's only rate row for her in
place, **her own** stamp of her legacy project now SUCCEEDS (round 9's probe A measured it refused
42501 at A4), as does the OWNER's (A5's refusal, which is what W2-R9-02 was for). That is correct under
HT-3-d — an `admin` of an honest employer is inside the employer tier and is an owner-or-admin of the
studio named, and W2-R6-01 rated refusing her a MAJOR — and no money moves to her: her hour on the
repaired project still prices `NULL / none / NULL` (HT-3-e(2) reads the CURRENT author). Recorded only
because case (x)'s six legs assert the owner's half (x2) and x6's pricing, and not hers; if a later hand
narrows the leg, x2 will not tell them they also removed a caller HT-3-d admits.

### W2-R10-08 · note · confidence HIGH · NEW (`projects.created_by` is NOT NULL — recorded so nobody "fixes" the defensive legs)

`owned_tier_prices_project` guards `p_created_by IS NOT NULL AND p_designer_id IS NOT NULL`. Measured:
an INSERT of a project with `created_by = NULL` raises `23502 null value in column "created_by" …
violates not-null constraint`, so there is no authorless-project path around HT-3-f(2) and those two
legs are belt-and-braces, not live arms. Worth one clause in the function's COMMENT, because a reader
who assumes they are live will conclude (wrongly) that a legacy seed row can reach `'none'` through a
NULL author.

### W2-R10-09 · note — residual · confidence HIGH (HT-3-f(3), re-measured on a fresh fixture)

Re-confirmed independently of case (aj): a legacy project the designer CREATED herself, after she
deletes her own employer seat, prices `99900 / studio_member / 199800` from the workspace she owns
(probe P1-4, and probe C's C0/C3). Ruled as a residual 2026-09-12 and asserted as passing in (aj).
Graded a note per the brief.

### W2-R10-10 · note · confidence MEDIUM · NEW (the employer's durable standing is destroyable by deleting a profile)

`studio_member_rates.original_created_by uuid REFERENCES profiles(id) **ON DELETE SET NULL**`. Where a
studio's only rate row for a designer has been rewritten by her, the employer's arm's-length standing
now lives in that one column — and deleting the displaced author's `profiles` row NULLs it, which
restores exactly the refusal W2-R9-02 removed. `created_by` carries the same FK shape (00598), so this
is consistent rather than novel, and a studio that deletes its owner's profile has larger problems.
Recorded, not asked to be fixed.

### Carried — each re-checked this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R8-02** (the employer arm admits a consent-free outsider — HT-3-e residue (i)) | note — ruling owed · HIGH | **Live, code unchanged**, and **W2-R10-02 adds a fact to it**: the taking is now irreversible. Still the heaviest of the notes |
| **W2-R8-03** (the owner exemption is a LIVE-seat test) | MINOR · HIGH | **Live, code unchanged.** W2-R10-01 is its third face: the same live-seat reading that drops a founder-turned-partner to `'none'` is what lets a pre-employment pin keep her own number |
| **W2-R8-04** (number bookkeeping) | MINOR · HIGH | **Live, and now a SHIP-NOTE hazard.** `plan-v2.md:25` still reads *"W5 none (`00615` reserved)"* and `:708` *"`00615` is reserved by charter §3 and is **left unused** — say so in the ship note"*, while `rulings.md` records `00615` as spent by W2 and *"W5 mints from `00616`"* — and `plan-v2.md` §W6 **uses `00616`** for `time_entry_activity_travel`. So the two documents now prescribe a collision, and the plan instructs the ship note to state something false. The only genuinely unspent number is `00617` (`plan-v2.md:771`). Two plan lines and one ruling sentence |
| **W2-R8-05** (the arm's-length leg bounds an order, not an actor) | MINOR · MEDIUM | **Partly answered.** W2-R9-02 made the leg undestroyable by the subject; it is still satisfiable by the stamping caller in the same session and still accepts a CLOSED row. One sentence in `00606`'s banner and COMMENT |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Live, and it grew — see W2-R10-04.** Two new vacuous ordering asserts; the resolver's occurrence counts and the callable form's `v_org_reads = 2` still count tokens over source text including comments |
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live, re-run** — red at `:171`; W2's re-registration at `:545-548` is never reached, so §0.17's discharge is asserted by no green gate. W1's; ruling owed. **Tenth round of asking** |
| **W2-R6-06** (a member infers a teammate's rate) | note — ruling owed · HIGH | **Live, re-measured** (probe G): `project_hours_total` answers the rostered plain member, the lead designer, the studio owner and the studio admin **identically** — `180 / 180 / 140000`. She knows her own 60 minutes and her own 40000, so `(140000 − 40000) / (180 − 60) × 60 = 50000` is the designer's confidential rate, exactly. Rule whether `amount_cents` is owner/admin-only. Lane B inherits it |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured** (probe H, with a real draft invoice): an invoiced row's `duration_minutes`, `billable` and `DELETE` all raise `P0001 … is attached to invoice …`; the row survives at 120 minutes; **`notes` rewritten by the studio owner → NO RAISE** |
| **W2-R2-09** (the audit trigger has no `WHEN`) | MINOR · HIGH | **Live, re-measured** (probe H): one ordinary owner adjust wrote **exactly one** `audit_logs` row — `organization_id` = the pricing studio, `user_id` = the owner, `old_values` and `new_values` both present, and the row re-derived `40000 / studio_member / 60000` at 90 minutes. The trigger still has no `WHEN`, so a plain member's self-edit writes one too |
| **W2-R9-03** (the `IS DISTINCT FROM` key) | recorded · HIGH | **Discharged as asked** — the COMMENT line is in `00615`'s `guard_studio_member_rate_history` and names the obligation (a caller that PATCHes `hourly_rate_cents` alone must also send `created_by`). No DB change, as ruled |
| **W2-R2-05/06/07/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | MINOR/NOTE | Live, unchanged — round 9 touched none of those files |
| `W2-impl.md` findings 2–5 | acknowledged | unchanged |

### The brief's read/refusal probes, re-measured (probe G/H, every call through RLS as the named actor)

| probe | result |
|---|---|
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** — she reads **1 of 2** entry rows on the project (her own); **0** of the designer's, so `notes` and `hourly_rate_cents` are unreachable; **0** rows of the designer's `studio_member_rates`; **1** `time_entry_ledger` row. Her own entry's `hourly_rate_cents` rewrite → `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived` |
| `project_hours_total` per role | rostered member **180/180/140000** · lead designer **180/180/140000** · studio owner **180/180/140000** · studio admin **180/180/140000** · `guest` co-member **42501 `the caller is not on this project`** · outsider **42501**, same message (W2-R6-06 above) |
| the rollup never returns notes | **confirmed on the signature and on the rows.** `studio_hours_rollup(uuid,date,date,text,uuid,uuid)` out names are exactly `bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes`; `project_hours_total(uuid)` → `minutes, billable_minutes, amount_cents`; `time_entry_ledger` has **zero** columns named `notes`. Buckets per role: owner **3**, rostered member **1** (her own). `studio_hours_rollup` is **SECURITY INVOKER** (HT-38) |
| the audit trigger on an owner adjust | **exactly one** row, 0 → 1, as tabulated in W2-R2-09 above |
| owner/admin writes cannot touch invoiced rows | **confirmed** — duration, `billable` and DELETE all raise; only `notes` passes (W2-R2-13) |
| r9's probes A, C, D1, D2 under HT-3-f | **A repaired and widened** (probe F: the owner's stamp SUCCEEDS, and so does hers — W2-R10-07; her hour still `'none'`). **C closed** (probe P1/B5: `NULL / none / NULL`, and `99900/199800` again the moment HT-3-f(2) is removed). **D1 unchanged** (`UPDATE projects SET studio_id` by hand → `P0001 studio_id_not_designer_studio`). **D2 closed** (case (ai) ai5c; re-measured through the same resolver path). **And two shapes nobody had named: probe D (W2-R10-01) and probe E (W2-R10-02)** |
| r7/r8 shapes, for regressions | **P1 still repaired** (probe A3: the honest caller's own stamp of her ambiguous/empty-tier legacy project succeeds). **P7 still repaired** (probe F3: the employer's owner repairs the book and her hour there prices at the employer's number once the studio writes a new row). **P8's UPDATE form still `'none'`** (probe F4). **HT-3-e(3)'s transfer form** unchanged, ruled |

### Doors I checked and found SHUT

| attempt | result |
|---|---|
| she names `original_created_by` by hand on her own row | **23514 `studio member rate identity is immutable`** (probe F5) |
| she walks the employer off the row with a CHAIN of rewrites | **kept once** — after a second rewrite `original_created_by` is still the OWNER (probe F6) |
| she manufactures the standing by sending the column on INSERT | **discarded to NULL** (probe F7) |
| an employer's plain `member` stamps the studio | **42501** bound (a) — *"only an owner or admin of the studio being named may name it"* (probe A3b) |
| the pin naming a studio OTHER than the one pricing the work | **refused** — bound (a) speaks first for a studio she does not administer (probe B3); the confirm's own refusal arm is reachable only for a caller who administers a second candidate |
| the confirm re-pointing an already-stamped project | **22023 `this project already names a studio`** — bound (b) runs BEFORE bound (c), so HT-3-c's finality is not relaxed (probes B2 idempotent, D6, E8) |
| a DEFINER, view or grant bypass of `original_created_by` | none — three functions mention it, zero views read the table, `authenticated` holds no DELETE |

---

## Pre-existing failures, listed separately as the brief asks

**Nine**, none of them W2's. **Eight** are in `supabase/tests/KNOWN_FAILURES.md`: six in `commercial`
(`:69`, `:97-101`) and two in `rls` (`:114-115`). The **ninth**,
`commercial/direct_order_attribution_test.sql`, is **undocumented and clock-dependent** — see
**W2-R10-05**.

One of the documented eight still touches this program's mechanism: `rls/studio_titles_test.sql`
`FAIL f` — *"demoting the sole active owner should raise `last_owner_protected`"* — is the
`guard_org_membership_changes` arm that would stand in the way of the ownership moves HT-3-e(3)
accepts. Any closure leaning on ownership hygiene must know that guard is already not firing on this
stack. It is **not** a door W2-R10-01 or W2-R10-02 uses: the first needs no seat change at all, and the
second is the ordinary member-leave policy, about which `last_owner_protected` has nothing to say.

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding.
- **The nine commits' TypeScript beyond round 9's delta.** Round 9 touched only
  `packages/supabase/src/database.types.ts` on that side (21 generated lines: `original_created_by` in
  Row/Insert/Update plus its FK). `packages/supabase/src/hooks/use-time-tracking.ts` and
  `hooks/index.ts` are r1–r8's and were reviewed there; I re-ran their gates, not their diffs.
- `pnpm --filter @patina/designer-portal test` / `lint`, and any `DATA_MODE=live` e2e line — outside the
  brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R10-01 and W2-R10-02 over HTTP.** Every statement they need is an ordinary `authenticated` call
  the policies and grants admit (`stamp_project_pricing_studio` is GRANTed to `authenticated`;
  `Org owners can insert members`; `Members can leave`; the rate INSERT; the time-entry INSERT), but I
  drove them through `psql` with the session's JWT claims set, not through PostgREST.
- **Against the live portal UI.** Whether the designer portal exposes a "pin the pricing studio" control
  today is unchecked; the GRANT and the policies are the evidence that the API path exists.
- **Concurrency and volume.** No two-simultaneous-stamp race (bound (b) plus the trigger's independent
  re-validation is the argument, not a measurement); no measurement of W2-R2-06's per-row DEFINER policy
  call.
- **No prod anything.** Every command ran against `127.0.0.1:54422`; nothing was pushed to Strata; W1's
  constraint stands (`00599`/`00601` must not reach Strata ahead of `00606`/`00615`, and `00615` now
  carries three rules). **The Strata population of `projects.studio_id IS NULL`, split by whether
  `created_by = designer_id`**, is **still uncounted**. It sizes W2-R10-01, W2-R10-03, W2-R8-02 and
  HT-3-f(3), and it is one read-only two-column query. **Tenth round of asking.**
- I staged and committed nothing. `supabase/config.toml` remains skip-worktree'd and untouched. Every
  probe script lives in the session scratchpad and ends in `ROLLBACK`; the two negative controls
  installed their reverted bodies **inside** those transactions, and the live `prosrc` markers were
  re-checked afterwards (all seven present). The `billing`, `rls` and `commercial` suites were re-run
  **after** every probe and returned byte-identical summaries to the pre-probe run. The one write I made
  outside a transaction was `generate-legacy-grants.py` in the main checkout (W2-R10-06) — it produced
  no change to that file, and I ran no git command there.
- **Whether W2-R10-01 is a defect or a ruling.** Both readings are set out above with the measurement
  that separates them; which one applies is the orchestrator's call, not mine.
