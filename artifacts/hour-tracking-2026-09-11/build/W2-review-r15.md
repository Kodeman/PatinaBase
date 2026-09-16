# W2 — lane A (DB) adversarial review, round 15 · HT-3-g(b) CORRECTED

**clean = TRUE — zero blocker, zero major.** Six findings: **four MINOR, two notes**, all NEW; the carried
set re-measured; round 14's three graded findings discharged by **negative control on the installed
body**, not trusted.

**W2-R14-01 is closed, and I proved it by mutation rather than by reading the diff.** With
`AND NOT v_replaced_employs_designer` removed from the **installed** body, round 14's one-statement taking
reproduces exactly in my own independent fixture — `NO RAISE`, the column moves, her hour goes
`26000 → 77700`, the restamp row appears — and with the bound in place the same call is `22023`, nothing
written, **0** audit rows. The committed gate reds when the bound is deleted (`FAIL k4b`). The body was then
restored **byte-identically** (`diff -q` against the saved `pg_get_functiondef`) and both suites returned to
baseline. **W2-R14-03 is closed the same way**: the audit-only mutation (`organization_id` back to
`v_written`) reds the suite at `FAIL k6`, and the displaced employer's owner now reads the restamp row
**1 of 1** where round 14 measured **0**.

**What round 15 found instead is that the residual the correction leaves is not the residual the record
describes.** Every residual row in `rulings.md`, `00606`'s `COMMENT`, `00620`'s banner and case (m)'s header
prices the manoeuvre at *her* leaving the employer's seat. Measured, it is cheaper than that in two
directions, neither asserted anywhere: an **ADMIN-designer** needs no deletion at all — ONE `UPDATE` on her
own membership row (`role = 'guest'`, or `status = 'suspended'`) leaves the seat ROW standing and turns the
bound false (W2-R15-02); and a designer the employer **offboards as ordinary housekeeping** pays nothing at
all — her next statement is the whole manoeuvre (W2-R15-01). Both are residuals under discipline (c)
applied literally, because a seat act by *somebody* is a necessary element; I name the one reading that
would move W2-R15-01 to the blocker clause and leave the re-grade to the orchestrator rather than inflate it.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **twenty-three** commits,
`c71db49d9` → … → `5e5ff6a88` → `7948449c7` → `4d783a374` → **`43801309b`** (HEAD == `hour-tracking/server`
== `origin/hour-tracking/server`; tracked tree clean). Round 14's delta is **four** files in three commits —
`00606` (+155/−23), `00620` (+88/−13), `billing/legacy_project_studio_stamp_test.sql` (+… /−…),
`rls/time_entry_studio_stamp_test.sql` (+37) — read line by line. Also read in full: the installed bodies of
`stamp_project_pricing_studio`, `set_project_studio_id` (00563), `guard_organization_admin_columns`,
`guard_org_membership_changes`, `audit_time_entry_change`; every policy on `project_time_entries`,
`organization_members`, `organizations`, `audit_logs`, `project_team_members`; `plan-v2.md` §0 + §3;
`rulings.md` (HT-1, HT-3-c, HT-3-e, HT-3-g incl. both amendments and the correction, the residual table,
HT-10, HT-10-a, HT-36, HT-38); `W2-review-r14.md` and `W2-fix-r14.md` entire. Lane B is phase 2; its absence
is not counted.

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The shared
54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean, through `00620`** — exit 0; `Applying migration 00604…, 00605…, 00606…, 00607…, 00615…, 00620…`; all 27 seed files; `Finished supabase db reset on branch main.` then `{"target":"local","version":"","message":"Reset local database."}`. Every `DO` postcondition block ran (they RAISE on failure), the two new ones included |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` — `legacy_project_studio_stamp_test.sql` PASS, `time_rate_resolution_test.sql` PASS, `time_entry_ledger_test.sql` PASS, `time_claim_atomicity_test.sql` PASS, `time_unbilled_view_repair_test.sql` PASS, plus the three invoice files |
| `run-sql-tests.sh -d …/tests/commercial …` | **10 green / 16, 6 unexpected — all pre-existing and documented** (listed below) |
| `run-sql-tests.sh -d …/tests/rls …` | **28 green / 30, 2 unexpected — both pre-existing and documented.** `time_entry_studio_stamp_test.sql` PASS, `project_hours_total_test.sql` PASS, `studio_hours_rollup_test.sql` PASS, `time_entry_admin_write_test.sql` PASS, `studio_member_rates_test.sql` PASS, `time_entry_auto_roster_test.sql` PASS |
| billing + rls again with `PGTZ=America/Chicago` | **billing 8/8 · rls 28/30 — identical summaries, the same two unexpected files.** W2-R9-04 stays closed |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **exit 0**, full route table |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 ./scripts/generate-legacy-grants.py` **from the worktree** → `git status` | **CLEAN** — `baseline + 2632 replayed statements`, no diff. (W2-R10-06's trap re-avoided: invoked as `./scripts/…` from the lane's own `--workdir`, never the main checkout's copy.) Correct for this pass: round 14 adds no GRANT/REVOKE. Wave migrations carrying a top-level GRANT/REVOKE re-listed by grep, not from a fixed list — `00600`–`00607`, `00615`, `00620` |
| `SUPABASE_DB_URL=…54422 pnpm --dir …/agent-server db:generate` → `git diff --exit-code database.types.ts` | **CLEAN**, exit 0 |
| **negative control by installation (1)** — `AND NOT v_replaced_employs_designer` removed from the **installed** body, asserted non-vacuous | billing suite **reds at `FAIL k4b`** ("got NO RAISE (returned …a6)"); and on my own fixture the round-14 MAJOR reproduces verbatim (`A2` NO RAISE → the project names her workspace, `B6` 88800, `B7` the employer reads the restamp row) |
| **negative control by installation (2)** — the audit `organization_id` put back to `v_written` | billing suite **reds at `FAIL k6`** (W2-R14-03's own leg) |
| restore | `pg_get_functiondef` re-applied; `diff -q` against the saved original = **byte-identical**; billing **8/8** and rls **28/30** again |
| migration-number sweep over **every** local and remote ref | `00604`–`00607` + `00615` + `00620` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `hour-tracking/edge`; `00621` on the peer people-room branch; `00608`–`00613` and `00616`–`00619` on no ref. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the 23 commits (`git log … -- supabase/config.toml` = 0); the three round-14 commits touch exactly the four intended files; Conventional Commits (`fix(time):` ×2, `test(time):`); local == origin |
| the live migration's end state | `projects` **6** · `studio_id IS NULL` **5** · of those, rows whose designer's tier answers at all **0**. `00620`'s postcondition (a) holds as an end-state query after seeds; the five residual NULLs are rows the tier rule answers nothing for |
| probe hygiene | every probe transaction ended in `ROLLBACK`; the only committed changes were the two deliberate body mutations, both reverted and verified byte-identical; after everything both suites are at baseline |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's; **seventeenth round of asking** |

---

## Findings

### W2-R15-01 · MINOR · confidence HIGH · NEW — the cheapest form of what the correction leaves costs the designer NOTHING, because the seat act is the EMPLOYER'S own offboarding

**HT-3-g(b) CORRECTED keys the overwrite on a LIVE employer seat. So the ordinary act of ending an
employment — the employer removing her `organization_members` row, which is hygiene, not a manoeuvre —
converts every project she still leads from "final" into a ONE-statement take, at no cost to her at all.
Measured 1/1 through RLS: her resolved rate on her former employer's own client project moved from the
employer's arm's-length `26000` to the `77700` she wrote for herself; the employer then read 0 of the 2
hours, 0 ledger rows, `42501` on the total, `22023` on the stamp back and `42501` on the reassign.**

*Location.* `supabase/migrations/00606_time_entries_studio_read_narrow.sql:663-679` (the bound reads
`replaced_seat.status = 'active'` — a live-seat test), `:680-683` (`v_remedy`). Recorded residuals:
`rulings.md` §"Residual rows" (every row's *What it takes* column), `00606`'s `COMMENT` ("what she can
still do is LEAVE that seat first"), `00620`'s banner, `legacy_project_studio_stamp_test.sql` case (m)'s
header and `m6e`.

#### Measured, my own fixture, every call through RLS as the named actor

Honest employer E (active `design_studio`, owner OE) · designer D holding ONE active `member` seat at E
with E's arm's-length `26000` card **authored by OE** · D also OWNS workspace W with her self-authored
`77700` · project P: `designer_id` = D, **`created_by` = OE**, `studio_id` = E, a client of the studio's.

```
J0  control — her hour on the studio's client work             = 26000
J1  THE EMPLOYER offboards her (`Org admins can delete members`)  → 1 row   ← ITS statement, not hers
J2  HER ONE STATEMENT  stamp_project_pricing_studio(P, W)       → NO RAISE, returned W
J2b the project now names W
J3  her next hour                                              = 77700   (P-4: the first is still 26000)
J4  the employer's OWNER reads 0 of the 2 hours on her own client's project
J4b …and 1 audit row of the act                                ← W2-R14-03 earning its keep
J5  …her stamp back                                            → 22023
J6  …her reassign                                              → 42501
```

*The remedy, measured rather than argued (discipline (c) requires it).*

```
K1  the CAREFUL employer reassigns the lead BEFORE offboarding   → OK, the lead moves   ← prevention exists
K2  the ORDINARY employer offboards first, then reassigns        → 42501 (she is no longer seated there)
K3  …it RE-SEATS her (`Org owners can insert members`)           → INSERTED
K4  …and the reassign then succeeds                              → OK
```

So the remedy **recovers, but only in the window before she stamps**, and only in two statements the
employer must know to make in that order (re-seat, then reassign). **After she stamps, nothing recovers for
the displaced studio acting alone** — `J5`/`J6`, which is the same owed `reassign_project_lead` ruling as
`k3`/`l8`. What it does get, new in round 14, is a readable trace (`J4b`).

*Why MINOR and not MAJOR, stated so the orchestrator can re-grade rather than re-derive.* Discipline (c)
makes a residual of "a manoeuvre that requires an account to leave/remove any seat", and this manoeuvre
does require one — her employer seat must be gone. The blocker clause requires that the manoeuvre "touches
no seat", and a removed seat is its precondition. On that literal reading it is a residual, so I grade it
MINOR. **The one reading that moves it to the blocker clause** is if (c)'s "an account" was meant as *the
taker's* account: at the call site this is one account, one statement, no seat touched by her, no roster,
nothing transferred, no second party she used, a project she did not create, and her own resolved rate
moved to a number she set — every clause of the blocker sentence, with the seat act performed by the victim
for its own reasons. It is also **asserted nowhere**: case (k)'s departed hire reaches her workspace through
`00620`'s FIRST stamp, not through the remedy arm, so no leg in either suite measures an offboarded hire
*overwriting* an already-stamped project.

*Closures, ranked, so the orchestrator can choose (I am not the implementer).*

1. **Make the test historical rather than live** — admit the overwrite only where the replaced studio never
   held an active non-guest seat for this designer (an `organization_members` row is deleted, so this needs
   a tombstone or an `audit_logs` read; the cheapest honest version is to refuse where the replaced studio
   holds ANY row for her, live or soft-removed, which closes the `status='removed'` half of form H too).
2. **Pin the project instead of the seat** — on offboarding, leave the stamped column final for everyone
   and give the displaced studio the owed UNPIN act. The designer's recourse becomes asking, which is the
   direction HT-3-b arm (c) already owes.
3. **Bound the arm by the project's own party** — refuse the overwrite while the project still carries the
   displaced studio's people on its live roster (`00620`'s roster key, reused at the call site). It does not
   close the shape but it prices it at the roster-clearing statement W2-R14-02 measured.
4. **Ruling-only**, keeping the shape as a loudly-labelled passing assertion. If this is chosen, the fact to
   record is the one the residual table does not say: the seat act can be the *employer's*, in which case
   the taking is free, and the employer's only protection is to reassign before it offboards.

### W2-R15-02 · MINOR · confidence HIGH · NEW — an ADMIN-designer reaches the same end without deleting anything: ONE `UPDATE` on her own membership row, and the seat SURVIVES

`Org admins can update members` is `polcmd = 'w'` on `is_org_admin_or_owner(organization_id) AND role <> 'owner'`
(USING and WITH CHECK alike), and `guard_org_membership_changes` guards only owner-shaped and
identity-shaped changes. So a designer who is an **`admin`** of the studio that stamped her project may
rewrite **her own** row — `role = 'guest'`, or `status = 'suspended'` / `'invited'` / `'removed'` — and every
one of those turns `v_replaced_employs_designer` false. Measured:

```
C0  control — her hour on the employer's stamped project        = 24000
C1  ONE UPDATE: SET role = 'guest' on her own row   → 1 row
    then stamp(P, W)                                 → NO RAISE, returned W
C1b HER EMPLOYER ROW IS STILL THERE — role = guest, status = active   ← nothing was deleted
C2  her next hour                                    = 88800 / studio_member / 177600
C2b P-4: the hour already priced still 24000
C3  the restamp row carries the DISPLACED studio      ·  C3a its owner reads it (1)
C4  the displaced employer reads 0 of the 2 hours · C4b 0 ledger rows · C4c 42501 on the total
C5  …its reassign   → 42501      ·  C5b …its stamp back → 22023
C6  she tries to restore her own admin seat           → 0 rows   ← she cannot; only the employer can
```
The same run with `status = 'suspended'` instead of `role = 'guest'` also succeeds (`STATUS ROUTE`), and the
restore is likewise 0 rows.

**Why it matters even though it is a residual.** It is a residual by (c) (a seat is touched), and it is not
free — `C6` shows she cannot put her own standing back, so she really does give up being an admin there.
What is wrong is the **record**: `00606`'s `COMMENT`, `00620`'s banner's "THE REMEDY" paragraph, case (m)'s
header, `m6e`'s own message and **every row of `rulings.md`'s residual table** describe the cost as *"she
LEAVES the employer's seat (`Members can leave`)"*. For a plain `member` that is exact. For an `admin` —
the shape HT-3-g(3) expressly admits, and the shape case (m)'s own fixture gives her (`…00dc` is an
`admin` seat) — the cost is a row edit that leaves the People room still showing her. This is the same
class of inaccuracy round 14 found in part (a)'s rationale (W2-R14-02): the prose names a narrower act than
the policies admit. Cheapest repair: say "leaves, or takes her own seat out of the employer tier (`role =
'guest'` / `status <> 'active'`, both hers as an admin)" in the four places, and add one passing leg to case
(m) measuring it, so the next hand cannot mistake the surface. Form H's row already records
`status = 'removed'` **for the author's** seat under the same policy — the table simply does not apply the
same observation to her own.

### W2-R15-03 · MINOR · confidence HIGH · NEW — the implementation of the correction is WIDER than the ruling's text by two legs, and their safety rests on a trigger outside this wave

HT-3-g(b) CORRECTED, as given: the overwrite is admitted only where the replaced studio "does not EMPLOY
the designer — **she holds no active non-guest seat with role <> 'owner' there**". The installed predicate
adds two conditions the ruling does not contain (`00606:674-675`):

```sql
AND replaced_studio.type   = 'design_studio'
AND replaced_studio.status = 'active'
```

Where the replaced organization is not an **active `design_studio`**, `v_replaced_employs_designer` is false
**although she does hold exactly the seat the correction names** — so the overwrite is admitted in a state
the ruling forbids.

*Reachability, measured both ways.* A designer cannot reach it herself:

```
B2   an ADMIN of the employer: UPDATE organizations SET status='suspended'  → organization_admin_column_protected
B2c  …SET type='manufacturer'                                              → organization_admin_column_protected
D6   authenticated INSERT INTO organizations                               → 42501 permission denied
D6b  authenticated's table privileges on organizations: SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER (no INSERT)
```

`guard_organization_admin_columns` (a `BEFORE UPDATE` trigger defined **outside this wave**) freezes
`status` and `type` against every caller with a non-NULL `auth.uid()` that is not `service_role`. So through
RLS the two legs are unreachable and the widening is, today, textual only — which is why this is MINOR and
not a contradiction I can demonstrate.

**What is reachable is the platform.** Suspending or deactivating a studio is an ordinary administrative act
(non-payment, review, offboarding a studio), and its side effect is that **every designer that studio
employs may re-point every project it has stamped at her own workspace, one statement each**, with the
studio unable to undo it (`J5`/`J6` apply identically). Nothing in `00606` asserts the trigger it depends on:
postcondition (d) asserts `set_project_studio_id` is still enabled and still carries
`studio_id_not_designer_studio`, but no leg asserts `guard_organization_admin_columns` exists. Cheapest
repairs, either or both: (i) drop the two legs so the predicate asks the ruling's question exactly (a seat
is a seat whatever the org's status), or (ii) keep them and add a postcondition asserting the guard trigger,
plus a recorded ruling that a studio's suspension unpins nothing.

### W2-R15-04 · MINOR · confidence HIGH · NEW (W2-R8-06 class) — the new bound's gate pins six of seven legs, and the leg it omits is the one that guards the recovery

`00606:1256-1279` pins the new predicate with seven whitespace-normalised `LIKE` legs plus a `position()`
test, and its message says *"all seven legs of the predicate plus its POSITION"*. Enumerated against the
body (`00606:669-675`), the legs pinned are `replaced_seat.organization_id`, `replaced_seat.user_id`,
`role <> 'guest'`, `role <> 'owner'`, `replaced_studio.type`, `replaced_studio.status` and the assignment
itself. **`replaced_seat.status = 'active'` (`00606:671`) is not pinned** — confirmed by grep (`0`
occurrences of that text in any `LIKE`) and by probing the installed body.

Consequence of deleting it: a **soft-removed** seat (`status = 'removed'`) would count as employment, so the
arm would refuse the overwrite to a recovering owner whose courtesy seat was soft-removed rather than
deleted — which is exactly form H's own mechanism (`Org admins can update members`, `status = 'removed'`,
per the residual table). The recovery would break with every gate green. One more normalised leg fixes it.

*And the fix report's claim about the sibling pin is only half true.* It says "`00606`'s two remedy-arm pins
were given the same treatment". Read as installed (`00606:1225-1243`), the remedy-arm pin normalises its
**first** leg only; five `prosrc LIKE` legs (`owner_seat.role = 'owner'`, `IF NOT v_remedy THEN`,
`AND (studio_id IS NULL OR v_remedy)`, `IF NOT v_remedy AND NOT EXISTS (`,
`project.pricing_studio_restamped`) and both `position()` probes still ask the body's own spelling. Those
are single-space today, so the gate passes; the class is the carried W2-R8-06 and the honest statement is
"one pin normalised, one partly". Credit where due: a scan of **every** `prosrc` gate in `00604`, `00605`,
`00606`, `00607`, `00615`, `00620` finds **zero** remaining multi-space literals — W2-R14-04's specific
instance is genuinely gone.

### W2-R15-05 · note · confidence HIGH · NEW — W2-R14-03's fix has an inverse cost the record does not state, and the two audit actions now disagree about `organization_id`

Filing the restamp row under the DISPLACED studio makes it readable by the party that needed it (`C3a`,
`m7a`), and that was right. It also makes the act **invisible to the acquiring studio's other owners and
admins**: measured, an `admin` of the new studio who is not the actor reads **0** rows (`C3b`, `B8`). Only
the actor sees it, through `Users can view their audit logs`. The `COMMENT` says "One row, not two" and the
reviewer's cheaper alternative ("or write two rows, one per `organization_id`") was declined — a defensible
call, but the consequence belongs in the record: a studio acquires a project and its own books carry no
trace of the acquisition.

Second half of the same note: the wave now files `organization_id` on two actions about the same work by
**different conventions** — `time_entry.updated` under the studio that **prices** the hour (measured
`F1b`: `org = the pricing studio`), `project.pricing_studio_restamped` under the studio that **lost** it.
Anything that reads `audit_logs` per organization for this family (lane B's owner lens, any later report)
will mix the two. Worth one ruling sentence, or a second row.

### W2-R15-06 · note · confidence HIGH · NEW — the correction makes the form-S/H recovery DEFEASIBLE by the taker

The corrected arm requires the recovering owner to hold **no** employer seat in the workspace at the moment
she stamps (`k4b`/`l8b`), and the seat she must drop is one the taker gave her. The taker may put it back:
measured, the workspace's owner inserting a `member` row for the recovering owner succeeds
(`C7 → INSERTED`, `Org owners can insert members`, no consent gate). So after `k4d` the taker can re-seat
her and the next stamp is `22023` again. **Does the remedy recover? Yes** — she can leave again and stamp,
and nothing stops her doing both in one session — but it is now a race the taker can run indefinitely,
which round 13's arm did not have. It is a second-party manoeuvre, so a note under (c); its real closure is
the same owed `reassign_project_lead` ruling (let the function follow a project's BOOK rather than its
current column), after which the recovering owner needs no courtesy seat at all and the loop has no handle.

---

## Discharged this round, verified rather than trusted

| id | how it was verified | state |
|---|---|---|
| **W2-R14-01** (the one-statement taking) | **negative control by installation, in my own fixture, with the control hour in the same fixture.** Bound removed from the installed body → `A2` NO RAISE, the project names her workspace, `B6` 88800/177600, `B7` the displaced owner reads the restamp row. Bound present → `A2` **22023**, `A2b` the project still names the employer, `A2c` **0** restamp rows. The ADMIN variant of the same call is `22023` too (`B1`). The committed gate reds at `FAIL k4b` with the bound deleted. Body restored byte-identical; billing back to 8/8 | **CLOSED** |
| **W2-R14-03** (the audit row invisible to the displaced studio) | measured both directions: the row carries `organization_id` = the DISPLACED studio (`C3`, `B7b`), its owner reads **1** (`C3a`) where round 14 measured **0**; the audit-only mutation reds the suite at `FAIL k6`. A FIRST stamp still carries the studio written (`E2b`) | **CLOSED** (inverse cost recorded as W2-R15-05) |
| **W2-R14-02** (the roster key narrows, it does not close) | the prose is corrected in three places (`00620`'s banner, the predicate header, the `COMMENT`), and the fact re-measured on my own fixture: **ONE `UPDATE` by the project's own lead soft-removes the whole roster** (`D5` = 1 row). The key is kept and round 14's non-vacuity result is not re-litigated | **CLOSED as prose; the underlying residual stands in the table** |
| **W2-R14-04** (the 11-space postcondition) | `00620`'s (b3) now asks a `regexp_replace(prosrc,'\s+',' ','g')` source on four legs; a scan of every `prosrc` gate in all six wave migrations finds **zero** remaining multi-space literals | **CLOSED**; the residue is W2-R15-04 |
| **W2-R14-05** (the `00602`-vs-`00620` key asymmetry) | recorded in `00620`'s banner with both facts; `00563`'s authenticated INSERT arm re-read (`NEW.created_by = auth.uid()` only) | **CLOSED as recorded** |
| **the ACL seed and the types** | regenerated from the **worktree's own copy** (2632 statements) → no diff; `db:generate` → `git diff --exit-code` clean. Correct: this pass adds no GRANT/REVOKE and changes no public signature | **CLOSED** |
| **P-4 across the round-14 delta** | the migration's own `DO` block counts and sums before/after and raises on movement (ran clean at replay); re-measured across three separate overwrites — `C2b` 24000, `J3` 26000, `m9`'s fixture in the green suite | **HOLDS** |
| **`00563` not weakened** | `set_project_studio_id` exists, is ENABLED, `prosrc` still carries `studio_id_not_designer_studio`; and I measured it **biting**: with a fixture lacking the designer domain role the remedy arm's write is refused `P0001 / studio_id_not_designer_studio`, so the trigger is a live second gate on the stamp's own UPDATE, not a formality | **HOLDS** |

## The brief's read / refusal probes, re-measured (every call through RLS as the named actor)

| probe | result |
|---|---|
| **case (m) under the correction** | **refused `22023`**, nothing written, **0** restamp audit rows, the hour still at the employer's number — measured on the committed fixture (green) and independently on mine (`A2`, `B1`). The residual that follows it is measured three ways: leaving the seat (`m6e`, green), an admin's self-downgrade (`C1`, W2-R15-02) and the employer's own offboarding (`J2`, W2-R15-01) |
| **forms S and H and their remedy** | asserted as passing, loudly-labelled cases (k)/(l), suite green, including the new `k4b`/`k4c`/`k4d` and `l8b`/`l8c`. Re-measured independently: the employer's owner acting alone is refused both halves after a taking (`C5` `42501` reassign, `C5b` `22023` stamp; `J5`/`J6` the same), so the residual recovers **only with the taker's hand or in the window before she stamps** (`K1`–`K4`). The recovery is also defeasible by a re-seat (`C7`, W2-R15-06) |
| **every earlier shape for regressions** | `rls/time_entry_studio_stamp_test.sql` (4 089 lines, cases (u) (v) (q) (s) (t) (z) (al) (am)) **PASS**, and PASS again under `PGTZ=America/Chicago`. Independently re-measured on my own fixtures: **FORM A** (owns the studio, leads it, column NULL) → **`42501`** with the HT-3-g tier message, nothing written (`E1`); the **EMPLOYER ARM on a NULL column** → **succeeds**, audit row under the studio written (`E2`/`E2b`); a **plain member** naming her employer → **`42501`** (`R2`); the **hire naming a studio she does not own** → **`42501`** (`R3`); an **OWNER who is not the lead** on a stamped project → **`22023`** (`R6`); **naming the studio already named** → **no-op `RETURN`**, no raise (`R5`, `R7`). The one that still succeeds is the HT-3-f(4) consent-free outsider (carried), now with round 14's ordering |
| **a plain rostered member reading a teammate's row / notes / rate columns** | **refused** — she reads **1 of 2** entry rows (her own) and **0** of the lead's, so the lead's `notes` and `hourly_rate_cents` are unreachable; **1** `time_entry_ledger` row; **0** rows of the lead's `studio_member_rates` (`D1`–`D1d`) |
| **`project_hours_total` per role** | owner **180/180/140000** · admin **180/180/140000** · lead designer **180/180/140000** · rostered member **180/180/140000** · outsider **`42501` "the caller is not on this project"** (`D2`). W2-R6-06 live: she knows her own 60/40000, so `(140000−40000)/(180−60)×60 = 50000` recovers the lead's rate exactly |
| **the rollup never returns notes** | **confirmed on the signature, the view and the rows.** `studio_hours_rollup` parameters matching `note` = **0**; declared return shape is `bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes` — no `notes`; `time_entry_ledger` columns matching `note` = **0**; `prosecdef = f` (INVOKER, HT-38). Buckets per role: studio owner **1**, the member who logged the hour **1**, outsider **0**; a sixth `p_group_by` literal raises **`22023`** (`D3`, `I1`, `I2`) |
| **the audit trigger** | one ordinary admin adjust → `audit_logs` **0 → 1**, exactly one row: `time_entry.updated`, `organization_id` = the **pricing** studio, `user_id` = the admin, `old_values` **and** `new_values` present, `old_values ? 'notes'` = **t** (`F0`/`F1`/`F1b`; W2-R2-09 carried) |
| **owner/admin writes cannot touch invoiced rows** | **confirmed for both roles, on a row genuinely attached to an invoice** — `duration_minutes` UPDATE **`P0001`**, `DELETE` **`P0001`**, for the studio owner and the admin alike. **`notes` passes** (NO RAISE, 1 row) for both — W2-R2-13, carried (`G1`–`G3`) |
| **the predicates' reachability** | `project_author_books_elsewhere`, `project_roster_books_elsewhere` and `designer_tier_pricing_studio` are all `prosecdef = t` with `proacl = {postgres=X/postgres}` — **no role holds EXECUTE**; an `authenticated` call returns **`42501` permission denied** (`D4`, `D4b`). Neither key is named by `resolve_time_rate_cents` or `project_pricing_studio_id` |

## Carried — each re-measured this round

| id | severity · confidence | state |
|---|---|---|
| **HT-3-f(4) / W2-R10-02 / W2-R13-03** (the consent-free outsider) | note — ruling owed · HIGH | Live, code unchanged; round 14 added the ordering (`z4b` `22023` while his seat lives, `z5` removes it, `z7` recovers, `z7d` audits under his org). Still owed: HT-3-b arm (c)'s consent door, and an unpin for a victim who owns no studio |
| **HT-3-e(3)** (a second account she transfers the workspace to) | note — residual, ruled · HIGH | Live, unchanged; two accounts, outside (c)'s blocker clause. No longer redundant, since W2-R14-01's one-statement route is closed |
| **W2-R8-03** (the stamp's seat test is a LIVE-seat test) | MINOR · HIGH | **Live, and now load-bearing in the other direction** — it is the whole mechanism of W2-R15-01. Round 14 measured it as the `42501` a FORMER employer meets; the overwrite direction is what moves money |
| **W2-R8-05 / W2-R12-04 / W2-R13-06** (bound (d) sequences the repair) | MINOR · MEDIUM | Live. The remedy arm still bypasses bound (d). Lane B still owes the refusal worded as *"price her first"* |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Live — W2-R15-04 is this round's instance.** Round 14 removed the last multi-space literal; five raw single-space legs and two `position()` probes remain in the remedy-arm pin |
| **W2-R4-08 (= W2-R2-10)** | MINOR · HIGH | **Live, re-run — red at `:171`**, so `00606`'s §0.17 re-registration of `Team can view their project time entries` and `time_entries_studio_read` (both recreated with a `user_id = auth.uid()` leg rather than dropped, per plan §3's amended shape) is asserted by no green gate. W1's; ruling owed. **Seventeenth round of asking** |
| **W2-R6-06** (a member infers a teammate's rate from the project total) | note — ruling owed · HIGH | **Live, re-measured per role** (`D2`). Rule whether `amount_cents` is owner/admin-only |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured per role on a real invoice attachment** — `duration_minutes` and `DELETE` `P0001`; **`notes` rewritten by owner or admin → NO RAISE, 1 row** |
| **W2-R2-09** (the audit trigger has no `WHEN`; `old_values` carries `notes`) | MINOR · HIGH | **Live, re-measured** — one ordinary adjust wrote exactly one row, `old_values ? 'notes'` = t |
| **W2-R2-07** (no caller assert on `project_pricing_studio_id`) | MINOR · HIGH | **Live, re-measured** — a stranger reads **0** project rows through RLS and `public.project_pricing_studio_id(<that id>)` returns **the studio's uuid** (`H1`/`H1b`). §0.16 deviation |
| **`Designers manage their project time entries`** (00177, `polcmd = '*'`, no `user_id` leg) | note · HIGH | Live, §0.17-untouched — re-read in `pg_policy`. The lead designer reads and may adjust or delete a colleague's row, notes included; HT-10's "members read own rows" does not reach her |
| **W2-R10-09 / W2-R10-10 / W2-R2-05/06/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | note / MINOR | Live; round 14 touched none of those objects |

## HT-3-g's cost notes, re-measured

| note | measured |
|---|---|
| **(i)** an ambiguous or empty tier prices `'none'`; with no employer seat no party may stamp | **holds** — FORM A refused `42501` (`E1`); the five residual NULL rows on this stack all answer tier nothing |
| **(ii)** the seat test is a LIVE-seat test | **holds, and is now the mechanism of W2-R15-01** |
| **(iii)** the HT-3-f(2) principal's self-repair is withdrawn; `00620` hands her the studio instead | **holds** — leg (e)/`g5`, green |
| **(iv)** no hour is re-rated in either direction (P-4) | **holds** — the migration's own assert plus three independent overwrites (`C2b`, `J3`, `m9`) |
| **(v)** a project whose author has since taken a seat elsewhere is left NULL | **holds**, counted as `left-null-author-key` |
| **(a)'s cost** — a project whose live roster carries another studio's people is left NULL | **holds**, counted as `left-null-roster-key`; the roster is still one `UPDATE` from quiet in the lead's own hand (`D5`) |
| **the correction's cost** (new) | the form-S/H recovery costs one more statement (`k4b`→`k4d`→`k5`, green), HT-3-f(4)'s victim an ordering (`z4b`→`z5`→`z7`, green), and the recovery is defeasible by a re-seat (W2-R15-06) |

---

## Pre-existing failures, listed separately as the brief asks

**Eight**, none of them W2's, all documented in `supabase/tests/KNOWN_FAILURES.md`: six in `commercial`
(the countersign/grant family — `authorized_schedule`, `design_services_authority`,
`design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`, each aborting on
`design services agreement … not found or access denied` or `failed canonical project provenance`) and two
in `rls` (`design_requests_test.sql`, `studio_titles_test.sql`). `commercial/direct_order_attribution_test.sql`
is clock-dependent (documented window) and **passed** in this round's run. The runner's default `-k` points
at a per-directory `KNOWN_FAILURES.md` that does not exist, so it counts all of them as "unexpected"; the
plan's gate line passes `-k` explicitly.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171`. Not in this round's gate list, not touched, ruling owed.

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. Its copy obligations now include W2-R15-05's
  asymmetry: the acquiring studio has no readable fact about its own acquisition, and the two audit actions
  file `organization_id` differently.
- **The 23 commits' TypeScript beyond the generated `database.types.ts`.** Round 14 touched no TypeScript at
  all (four files, all SQL). `use-time-tracking.ts` and `hooks/index.ts` are r1–r8's; I re-ran their gates,
  not their diffs.
- **`pnpm --filter @patina/designer-portal test` / `lint`, and any `DATA_MODE=live` e2e line** — outside the
  brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside designer-portal
  would have meant anything).
- **Everything over HTTP.** Every statement in W2-R15-01/02 is an ordinary `authenticated` call the grants
  and policies admit (the `rpc('stamp_project_pricing_studio')` call, the membership `UPDATE`/`DELETE`, the
  entry `INSERT`s), but I drove them through `psql` with the session's JWT claims set, not through PostgREST.
- **Strata.** No prod anything. The in-place edit of `00606`/`00620` is the right remediation **only while
  they are unapplied there**; the fix report asserts that and I could not check it. `W2-fix-r12.md` §9's
  `studio_id IS NULL = 0` on Strata is likewise its measurement, not mine.
- **Whether `guard_organization_admin_columns` is in force on Strata.** W2-R15-03's whole safety rests on it
  and it is defined outside this wave. Probed live here; assumed, not verified, there.
- **Concurrency and volume.** No two-simultaneous-stamp race on the arm's `(studio_id IS NULL OR v_remedy)`
  write. Note for the record: `v_existing` is read at the top of the function and the new bound is computed
  from it, while the UPDATE carries no `studio_id = v_existing` predicate when `v_remedy` is true — so under
  a concurrent restamp the write can land on a studio the bound was never asked about. Argued, not measured.
  No measurement of W2-R2-06's per-row DEFINER policy call.
- **Whether W2-R15-01 is a defect or the corrected ruling's intended cost.** The correction's sentence
  ("does not EMPLOY", present tense) is satisfied exactly by an offboarded hire, so the ruling admits the
  shape. Both readings are set out with the measurements that separate them and with the grading hinge named.
- I staged and committed nothing. `supabase/config.toml` remains skip-worktree'd and untouched. Every probe
  transaction ended in `ROLLBACK`; the only committed changes were two deliberate mutations of the installed
  `stamp_project_pricing_studio` body, both reverted and verified byte-identical against a saved
  `pg_get_functiondef`, after which billing re-ran **8/8** and rls **28/30**, identical to baseline. No file
  in the worktree was edited.
