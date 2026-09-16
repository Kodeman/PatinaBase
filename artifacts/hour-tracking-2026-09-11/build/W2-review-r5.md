# W2 — lane A (DB) adversarial review, round 5

**clean = false** — two **MAJOR**s, both measured end to end on this program's stack, both the same
shape: HT-3-d bounds the stamp by the project designer's EMPLOYER tier, and **the designer can put a
studio she controls into that tier herself**, through two ordinary product paths the ruling's text does
not contemplate. Round 4's three findings are otherwise discharged exactly as ruled — the r4
confederate manoeuvre is refused on both legs and the hour stays `'none'` (re-measured
independently), the plain-member designer can no longer choose her employer, and the owned tier is
bounded for every caller — and **all six minors landed**, each re-measured rather than read off
`W2-fix-r4.md`. Everything else this round is MINOR or NOTE per the brief's severity discipline.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **five** commits,
`c71db49d9` → `9f80b0c09` → `3d36ffb6e` → `7e6701490` → **`7d0ffb910`** (round 4's fix; HEAD ==
`origin/hour-tracking/server`). Every line of the round-4 diff (`00605` +118, `00606` ±431, `00607`
+18, `time_entry_studio_stamp_test.sql` +678, `time_entry_admin_write_test.sql` +53), the whole of
`00604`–`00607` as they now stand, `00563`'s `set_project_studio_id`, `00603`'s
`set_project_studio_id_owned`, `00604`'s `project_pricing_studio_id`, `transfer_studio_ownership`
(`00484:463`), the `organization_members` policy set, `studio_member_rates`' policies and guards, the
hook diff, the regenerated seed and types, `W2-impl.md`, `W2-review-r4.md`, `W2-fix-r4.md`. Lane B is
phase 2; its absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — API 54421, Postgres `127.0.0.1:54422`, `project_id
"patina-hours"`. The shared 54321/54322 stack was never touched. Nothing was pushed to Strata; no prod
anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; `00604`–`00607` replayed, every `DO $postcondition$` passed |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected** — the identical W1/r1–r4 baseline: `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`, all aborting in `_countersign_design_services_agreement_impl` (`design services agreement … not found or access denied`). All six documented verbatim at `supabase/tests/KNOWN_FAILURES.md:97-101` (+`:69`). W2 touches no agreement path. The `-k` allowlist still does not normalise from the repo root, so they print as "unexpected" |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -H 127.0.0.1 -p 54422` (**all 30**) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` (`FAIL 3b: expected no_scans`) and `studio_titles_test.sql` (`FAIL f: … last_owner_protected`), both documented at `KNOWN_FAILURES.md:114-115`, both pre-existing and unrelated. `time_entry_studio_stamp_test` (16 cases), `time_entry_admin_write_test` (10 cases), `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio.test`, `00584_studio_comember_rls_sweep.test` all green |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output, exit 0) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | clean (exit 0) |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds**, exit 0 (the repo's strictest gate; full route table printed) |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 …/scripts/generate-legacy-grants.py` → `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** |
| `tests/edge_api -f public_rpc_authorization_contract` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R4-08**, still absent from `KNOWN_FAILURES.md` |
| migration-number sweep across **every** local and remote ref (`git ls-tree` per ref over `supabase/migrations/006*`) | `00604`–`00607` exist only on `hour-tracking/server`; the only other number in the band anywhere is lane D's `00614` on `hour-tracking/edge`; `origin/main` head is `00591`. **No collision** |
| commit hygiene — `git status --porcelain`, `git ls-files -v \| grep '^S'`, `git log … -- supabase/config.toml`, `git diff --name-only` over the range | working tree clean; `supabase/config.toml` skip-worktree'd and in **none** of the five commits; 14 files in the range, all intended; Conventional Commits throughout |
| function shapes, live `pg_proc` | `project_pricing_studio_id`, `stamp_project_pricing_studio`, `project_hours_total`, `audit_time_entry_change` all `prosecdef = t` with `search_path` pinned; `studio_hours_rollup` INVOKER with `search_path` pinned (HT-38); `stamp_time_entry_updated_by` INVOKER with `proconfig = NULL` (**W2-R2-18**, carried) |
| grafted body check (`patina-db-migrations` step 2) | `grep -rln 'CREATE OR REPLACE FUNCTION[^(]*guard_commercial_time_entry_derived_fields'` → `00412`, `00600`, **`00605`**; diffed `00600`'s body against `00605`'s: **one grafted hunk only** (the `NEW.updated_by IS NOT NULL` refusal). Nothing from 00600 was lost |

---

## Discharge of round 4

| Round-4 finding | Status |
|---|---|
| **W2-R4-01 · MAJOR** (the confederate seated `admin` in her own workspace) | **The manoeuvre is discharged; the property it stood for is not.** Re-measured independently (probe P1, fresh fixture, every write through RLS): her consent-free `admin` seat INSERT succeeds, her 99900 rate in the workspace succeeds, her own named-studio sibling succeeds, and then **both** her own stamp and the confederate's are refused `42501 … only from inside its designer's own tier … (HT-3-d)`, the column stays NULL and her next hour stays `NULL / none`. The tier bound is genuinely a property of `(the designer, p_studio_id)` — `prosrc` carries no `IF v_designer_id = v_actor THEN` and a postcondition refuses one. **But** HT-3-d's operative consequence (*"a designer naming her own workspace while she has any employer is refused"*, and *"a member can only push the outcome toward 'none'"*) is still measurably false by two other routes — **W2-R5-01** and **W2-R5-02** below |
| **W2-R4-02 · note → ruled** (the member chooses which employer takes the hours) | **DISCHARGED, measured.** A designer seated a plain `member` is refused `42501 … only an owner or admin of the studio being named may name it` on the studio she names (probe R2-5), and shipped case (f)/(p1) assert it for both employers |
| **W2-R4-03 · note → ruled** (the owned tier bounded only by the actor) | **Implemented as ruled.** The tier test runs for every caller; the owned branch is reachable only where the employer tier is empty. The two-owned-studio residue HT-3-d explicitly permits is asserted as case (o6) with a message saying a failure there is a ruling change — correct handling |
| W2-R4-04 / 05 / 06 / 07 / 09 / 12 (MINORs + the stated NOTE) | **all landed**, each re-verified — see the table below |
| W2-R4-08 (contract test red) | **not fixed, correctly**: it is W1's, gated on the W2-R2-19 ruling. I re-ran it: still red at `:171`. The implementer's decision **not** to add it to `KNOWN_FAILURES.md` is right — it is an unruled disagreement, not documented residue |
| W2-R4-10 / W2-R4-11 | carried to lane B with no DB change, as the findings themselves asked |

### The minors, each re-measured

| id | verification |
|---|---|
| **W2-R4-04** | `00606:97-110` now reads *"WHAT REVERTS, AND WHAT DOES NOT"* — sections (1)-(3) revert on their own, section (4) is explicitly not part of that revert. The old "THIS IS THE ONLY CHANGE IN THIS MIGRATION" is gone. (But see **W2-R5-03**: a different sentence in the same section is now false) |
| **W2-R4-05** | measured (probe E-3): one `audit_logs` row, `action = project.pricing_studio_stamped`, `organization_id` = the studio written, `user_id` = the actor, `old_values = {"studio_id": null}`, `new_values = {"studio_id": "<a1>"}`. Pinned by a `prosrc` postcondition |
| **W2-R4-06** | `RETURNING studio_id INTO v_written` + `RETURN v_written` present and pinned; measured: the first stamp returns the studio, a retry of the same studio is a silent no-op (E-1). Concurrency itself not raced (see *What I did not verify*) |
| **W2-R4-07** | measured (E-4/E-5): `INSERT … updated_by = <the owner's id>` as the author is now refused `23514 time entry edit trace is server-derived`; an ordinary INSERT lands with `updated_by` NULL and the correct `25000` rate. The graft from `00600` is verbatim (diffed above). *Note:* `W2-fix-r4.md` quotes the message as `'time entry trace is server-derived'`; the shipped text is `'time entry **edit** trace is server-derived'` — cosmetic |
| **W2-R4-09** | `00607`'s false "W4 needs no edit to this function" claim is deleted and replaced with the truth (the `scoped` CTE's `ledger.studio_id = p_studio_id` filter makes a project-less row unreachable; **W4 MUST edit this function**) |
| **W2-R4-12** | stated in `00607` beside the FILTER: `billable_*` and `internal_minutes` can count the same row while `total_minutes` counts it once — lane B must not derive the internal group by subtraction |

---

## Findings

### W2-R5-01 · MAJOR · confidence HIGH (measured 1/1 end to end, this stack, every write through RLS as the actor)

**HT-3-d's tier is a role test, and the designer can change her own role in the workspace she controls.
One consent-free seat plus `transfer_studio_ownership` demotes her own `00295` workspace seat from
`owner` to `admin` — `role <> 'owner'`, so the workspace is now inside her EMPLOYER tier — and she
then stamps it HERSELF and prices her own hours at the number she wrote there. No confederate has to
act; the second account performs no statement at all.**

*Location:* `supabase/migrations/00606_time_entries_studio_read_narrow.sql:~390-425` (bound (e)'s
`v_designer_has_employer_seat` + the `CASE WHEN … THEN designer_seat.role <> 'owner' ELSE
designer_seat.role = 'owner' END` tier test) together with `public.transfer_studio_ownership`
(`00484:463`, SECURITY DEFINER, `has_function_privilege('authenticated', …, 'EXECUTE') = t`), which
promotes the target and **demotes `auth.uid()` to `'admin'`** in the same call.

*Why the bound does not hold:* the tier is keyed on `organization_members.role`, and the stamp's
standing test is `is_org_admin_or_owner(p_studio_id)` — which `'admin'` satisfies. So a seat that is
`'admin'` is simultaneously (i) inside the employer tier and (ii) full standing to stamp and to write
`studio_member_rates` (`studio_member_rates_admin_insert` asks only `is_org_admin_or_owner(studio_id)`,
with no bar on writing one's own rate). `transfer_studio_ownership` is exactly the statement that moves
her from the one role the tier excludes into the one role that satisfies both. And both steps are live
product affordances: `apps/designer-portal/src/components/document/account/account-studio-page.tsx:1554`
renders **"Make owner"** beside every member of her own studio.

*Measured (fresh fixture; she is an ordinary hire — a plain `member` of her employer `a1`, owner of the
workspace `a2` that `00295` provisions at a designer grant; one legacy `studio_id IS NULL` project):*

```
R1-0 BASELINE project_pricing_studio_id(legacy) = a1      ← the honest employer WAS pricing it
as the DESIGNER, through RLS, two statements:
  INSERT organization_members (any user id, her workspace a2, 'admin')  → OK   (consent-free)
  transfer_studio_ownership(a2, that user)                              → OK
R1-3 her own seat in her own workspace is now:  admin     ← the tier now contains a2
R1-4 project_pricing_studio_id(legacy) = NULL             ← she MANUFACTURED the 'none' precondition
  INSERT studio_member_rates (a2, herself, 99900)                       → OK   (she is its admin)
R1-6 >>> HER OWN stamp of HER OWN workspace:    NO RAISE (returned a2)  ← the bypass
R1-7 >>> her next hour:   99900 / studio_member / rated 199800
R1-8 >>> the honest employer a1 now reads 0 rows; project_hours_total → 42501
```

*Why major:* it is the brief's second clause verbatim — a member moves her own resolved rate to a
number she set — and it contradicts HT-3-d's stated consequence (*"a designer naming her own workspace
while she has any employer is refused"*) with the designer as the **sole actor**. It is also strictly
worse than every earlier round's version of this finding: the project was being priced **correctly by
her employer** at baseline, so the stamp does not repair `'none'`, it *creates* it and then takes the
work; bound (b) makes the result final; and the employer loses the HT-10 read the whole of `00606`
exists to give her.

*Control, in the same fixture (probe C):* the same move does **not** reach the resolver for a studio
principal — with two candidate studios `00563` fails closed (`P0001 studio_id_not_designer_studio`) on
an unnamed project INSERT, and a project that NAMED a studio keeps it. So the exposure is exactly the
**unstamped / legacy `studio_id IS NULL`** population — the population four rounds have now asked to be
counted on Strata before any deploy decision.

*Candidate closures (all ruling-shaped; I am not guessing one):* (i) refuse a `p_studio_id` in which the
project's designer is herself `is_org_admin_or_owner` **whenever the subject of the hours is that same
designer** — the narrowest code-only bound, and it leaves shipped cases (f)(g)(n)(p) untouched but
re-breaks case (o) (HT-3-c's sole proprietor stamps a studio she owns); (ii) require the named studio's
`studio_member_rates` row for her to have been authored by somebody other than her
(`created_by <> designer`) — new rule, moves (o); (iii) close the cause: `transfer_studio_ownership`
self-demotion, or the consent-free `organization_members` INSERT (HT-3-b arm **(c)**, already OWED);
(iv) evaluate the tier at a time the subject cannot move (e.g. seats that predate the project), which is
a new ruling. **Nothing in the shipped code can be called wrong against HT-3-d's letter** — the
workspace genuinely is an employer-tier seat at call time — so this is the ruling's definition meeting
a path it did not contemplate, and the orchestrator has to pick.

### W2-R5-02 · MAJOR · confidence HIGH (measured 1/1 end to end, through RLS, with the cause then removed)

**The retained `created_by` sibling leg is the bound `W2-fix-r4.md` §note 1 says makes the tier safe
against a consent-free seat. It is safe only against an UNWILLING victim. When the designer is the one
gaming, she supplies the sibling herself: a confederate's own org seats her consent-free, she creates a
project naming that org, the confederate stamps, and her hours price at the confederate's 99900 —
irreversibly, and still irreversibly after the seat is deleted again.**

*Location:* `00606`'s bound (a2) (`sibling.designer_id = v_designer_id AND sibling.created_by =
v_designer_id`) and the `W2-fix-r4.md` claim *"HT-3-d's tier bound cannot reach that BLOCKER … an
outsider who owns any organization writes the victim designer a seat in her own org with one
consent-free INSERT"* — true as stated, but the leg it justifies is satisfiable by the designer in one
statement.

*Measured:*

```
R2-0 BASELINE project_pricing_studio_id(legacy) = a3      ← the honest employer WAS pricing it
as the CONFEDERATE (owner of her own org a4), through RLS:
  INSERT organization_members (the designer, a4, 'member')              → OK  (consent-free)
  INSERT studio_member_rates  (a4, the designer, 99900)                 → OK
R2-3 project_pricing_studio_id(legacy) = NULL                           ← tier now ambiguous
as the DESIGNER:
  INSERT projects (designer = her, created_by = her, studio_id = a4)     → OK  ← clears bound (a2)
  stamp_project_pricing_studio(legacy, a4)   → 42501 (she is a plain member — bound (a) holds)
as the CONFEDERATE:
R2-6 >>> stamp_project_pricing_studio(legacy, a4)  → NO RAISE (returned a4)
R2-7 >>> the designer's next hour:  99900 / studio_member / rated 199800
R2-8 >>> the honest employer a3 reads 0 rows; project_hours_total → 42501
then the cause is REMOVED — the confederate DELETEs the designer's seat in a4:
R2-9  the project still prices from a4
R2-10 a LATER hour still prices 99900 / studio_member
R2-11 the confederate still reads 2 rows of the employer's work
```

*Why major rather than "note — ruling owed":* same second clause (a member's resolved rate becomes a
number an account she controls set), and the closure is an **already-owed** ruling (HT-3-b arm (c)'s
consent door), not a new one. Two things make it worth its own id rather than folding into
**W2-R2-04**: (a) R2-04 was reversible by removing the seat, and this is measurably **not** — the stamp
survives the seat; (b) `W2-fix-r4.md` presents the retained leg as the answer to this exact class, and
it is not. *If the orchestrator reads "closure depends on arm (c)" as making this a note, it
re-grades cleanly to `note — ruling owed` and `clean` then turns on **W2-R5-01** alone.*

### W2-R5-03 · MINOR · confidence HIGH (code, measured consequence)

**`00606`'s banner and `COMMENT` both say the act "repairs `'none'`, it does not move money" and that
bound (c) admits it "only where the derivation is silent" — and bound (c) is caller-manufacturable, so
both sentences are false as shipped.** In W2-R5-01 and W2-R5-02 the project was priced by an honest
employer at baseline; one statement by the designer (or by any org owner) made the tier ambiguous, and
the stamp then moved the money permanently. The postcondition that pins this
(`prosrc LIKE '%project_pricing_studio_id(p_project_id) IS NOT NULL%'` — *"it repairs 'none', it does
not move money"*) asserts the check, which is real, but the claim it carries is not. *Fix:* whatever
the orchestrator rules on W2-R5-01/02, the banner, the `COMMENT` and that postcondition's message must
say that bound (c) reads the tier **at call time** and that the tier is caller-movable, so the next hand
does not rely on the stronger sentence.

### W2-R5-04 · NOTE · confidence HIGH (measured)

**The stamp is a weak existence oracle on project ids.** The designer/`studio_id` lookup happens before
any standing test, so a caller passing a studio she owns gets `this project cannot be stamped` for an id
that does not exist and a *different* 42501 (`this studio holds no project that this project's designer
both leads and created`, or the tier message) for one that does (measured, E-2). The bound ORDER was
chosen deliberately in round 4 to avoid a *stamped-vs-unstamped* oracle and that goal is met; this one
is project-existence only, against unguessable UUIDs. Stated, not a change request.

### W2-R5-05 · NOTE · confidence HIGH (measured)

**The invoiced-entry lock is intact under the new owner/admin write policies, and an invoiced row's
`notes` are still rewritable.** Measured as the studio owner on an invoiced row: `UPDATE … duration_minutes`
→ `P0001 … attached to invoice … cannot change`; `DELETE` → `P0001 … cannot be deleted`;
`UPDATE … notes` → **NO RAISE**. That is `guard_invoiced_time_entry`'s own column list (§0.12 forbids
touching it on a guess) and is **W2-R2-13** carried unchanged, re-measured here through the *new*
policy rather than the author path.

---

## The brief's probes, each measured independently of the shipped tests

| probe | result |
|---|---|
| the r4 confederate manoeuvre | **refused, both legs** (`42501 … (HT-3-d)`), column stays NULL, her hour stays `NULL / none`; all three preconditions asserted to succeed first so the probe is not vacuous |
| a designer with employers naming her workspace | **refused** `42501 … one she OWNS only where she holds none (HT-3-d)` — *unless* she first demotes her own seat there (**W2-R5-01**) |
| an employer admin stamping | **succeeds**, and the designer's next hour prices `25000 / studio_member / 50000` from the EMPLOYER's card (HT-3-d test case 2) |
| a plain rostered member reading a teammate's row / notes / rate | **refused** — she reads **1 of 2** rows on a project she is rostered to (her own), **0** rows of the teammate's, `notes` and `hourly_rate_cents` unreachable, **1** ledger row, **0** rows of the designer's `studio_member_rates`, and **0** rows on a project she is not rostered to |
| `project_hours_total` per role | rostered plain member **ALLOWED** `180 / 180 / 65000` (the whole project, of which she reads 1 row) · studio owner **ALLOWED** 180 · the project's designer **ALLOWED** 180 · an outsider **42501** |
| the rollup never returns notes | **measured on the TYPE**: `studio_hours_rollup → TABLE(bucket_key text, bucket_label text, member_id uuid, member_name text, entry_count integer, total_minutes integer, billable_minutes integer, billable_cents bigint, internal_minutes integer)`; `project_hours_total → TABLE(minutes integer, billable_minutes integer, amount_cents bigint)`; **0** `%note%` columns on `time_entry_ledger`. Per role: owner 2 member buckets · plain member 1 unscoped (her own) · aiming `p_user_id` at the designer **0** · a sixth `p_group_by` literal raises **22023** |
| the audit trigger on an admin adjust | **one** row, `action time_entry.updated`, actor = the admin, `organization_id` = the pricing studio, `old_values` **and** `new_values` present, `updated_by` = the admin |
| owner/admin write cannot touch invoiced rows | **confirmed** (W2-R5-05) |

---

## Carried from rounds 2–4 — each re-checked this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live.** `tests/edge_api -f public_rpc_authorization_contract` red at `:171`; the re-registered VALUES row at `:548` is never reached, so §0.17's discharge is still asserted by no green gate. W1's, ruling owed (W2-R2-19) |
| **W2-R3-06 · W2-R2-03 · W2-R2-04** | note — ruling owed · HIGH | Live. W2-R5-02 is W2-R2-04 made **irreversible**; rule them with HT-3-b arm (c) |
| **W2-R2-05** | MINOR · HIGH | Live — `fetchTimeSummary` / `useSectionLoggedMinutes` / `usePhaseActualMinutes` untouched by the diff; a rostered member still under-counts per phase |
| **W2-R2-06** | MINOR · HIGH | Live — `project_pricing_studio_id` is a per-row plpgsql DEFINER call inside three RLS policies and the view; `useTimeEntryLedger` still has no default `limit`. No performance measurement this round either |
| **W2-R2-07** | MINOR · HIGH | Live — `00604`'s helper has no caller assert and is now called from five places; any authenticated caller learns any project's pricing studio |
| **W2-R2-09** | MINOR · HIGH | Live — the audit trigger has no `WHEN`; one ordinary self-edit by a plain member writes a full row |
| **W2-R2-11** | MINOR · HIGH | Live — `apps/designer-portal/src/lib/react-query.ts:309` still defines `studioReport` for the deleted hook; no other live reference to the deleted symbols |
| **W2-R2-12** | NOTE · HIGH | Live — `00604`'s second profiles assert is still a tautology |
| **W2-R2-13** | note — ruling owed · HIGH | Live, re-measured through the new owner policy (**W2-R5-05**) |
| **W2-R2-14 / W2-R4-10** | note — ruling owed · HIGH | Live — the author reads none of her own edit's trace; her studio's owner does. Carried to lane B, correctly |
| **W2-R2-15 · W2-R2-17** | NOTE · HIGH | Live — `00604` coalesces a missing rate to `0` (lane B must read `rate_source`); `TimeEntryLedgerRow.project_id`/`user_id` non-nullable in TS against a LEFT JOIN |
| **W2-R2-18** | NOTE · MEDIUM | Live — `stamp_time_entry_updated_by` has `proconfig = NULL`; INVOKER, touches only `auth.uid()` and `NEW` |
| **W2-R4-11 · W2-R4-12** | NOTE | Carried to lane B as stated; `00607` now says the second one in the file |
| `W2-impl.md` findings 2–5 | acknowledged | three asserted-equivalent bodies of the pricing rule; the project designer's own read of a colleague's rate (`Designers manage their project time entries`, live, pinned as case (f4)); `project_hours_total`'s three legs; the admin/resolver key divergence |

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. No `hours-ledger.tsx`, no lens, no HT-35 band
  or opt-out, no Desk card, no `desk-doorway.tsx`, no copy deck, no Sanity article, no
  `hours-ledger-scope.test.tsx`, no `e2e/document/hours.spec.ts`.
- `pnpm --filter @patina/designer-portal test` / `lint` and the `DATA_MODE=live` e2e line — outside the
  brief's gate list and lane-B-shaped.
- **Concurrency and volume.** No two-simultaneous-stamp race (W2-R4-06's fix is read-the-row-count, not
  a lock); no performance measurement of W2-R2-06's per-row DEFINER policy call.
- **The implementer's four negative controls** (installing alternate function bodies) — I did not
  re-install them; instead I verified case (m)'s three preconditions are asserted to SUCCEED, which is
  what makes it non-vacuous, and I measured the finding's outcome directly.
- **Whether W2-R5-01's route is reachable through the portal end to end.** I measured it in SQL through
  RLS as the actor and confirmed both product affordances exist (`account-studio-page.tsx:1554`
  "Make owner"; member add on the same page); I did not drive the UI.
- **No prod anything.** Every command ran against `127.0.0.1:54422`. Nothing was pushed to Strata. W1's
  constraint stands (W1 must not reach Strata ahead of `00606`). **The Strata population of
  `projects.studio_id IS NULL` is still uncounted** — it is the exact and only population W2-R5-01,
  W2-R5-02, W2-R2-02, W2-R2-04 and HT-3-d's residue turn on, and it should be one read-only count before
  any deploy decision. **Fifth round of asking.**
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched. My probe
  scripts live in the session scratchpad, not in the repo.
