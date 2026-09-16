# W2 — lane A (DB) adversarial review, round 9

**clean = false — ONE MAJOR**, and it is the brief's second blocker/major trigger **literally**: *one*
account, *no* ownership transfer, *no* confederate, *no* consent-free seat, *no* rate rewritten in
somebody else's studio. A designer **LEAVES her employer** — one `DELETE` on her own
`organization_members` row, the shipped `Members can leave` policy — and HT-3-b's OWNED tier opens
under her employer's legacy project: her next hour on that project came back
**99900 / studio_member / 199800** where the employer's own card had priced it **26000 / 52000**, and
the employer's owner then read **0** of the project's hours and **could not repair it** (probe C,
measured 1/1 through RLS; the `status = 'removed'` variant of the same statement measured identically
as probe D2).

Besides it: **two new MINORs and one new note** (a member can stall her employer's repair act; the narrow
edge of case (l2); and two of the program's own gate files are green only on the right side of UTC
midnight — W2-R9-04, measured on both sides), plus ten carried items, each re-checked.

**Round 8's MAJOR is genuinely discharged, measured independently on a fresh fixture AND by
installation.** With `00615`'s guard installed, her rewrite of her employer OWNER's open row is
re-authored to her and her 120-minute hour answers `NULL / none / NULL` (resolver and classifier
agreeing). With `00598`'s guard body reinstalled by hand in the same transaction, the identical probe
returns `99900 / studio_member / 199800` with the owner still named as author. So the statement in
`00615` is what closes it, and the closure is not fixture-shaped (probe A, probes A1→A3; negative
control re-run of the same file).

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **nine** commits,
`c71db49d9` → … → `53daba3e3` → **`ef4cc2d57`** (round 8's fix; HEAD == `hour-tracking/server` ==
`origin/hour-tracking/server`, tracked tree clean). Round 8's delta is **four** files — `00615` (+211),
`supabase/seed/00-legacy-grants.sql` (+6), `time_rate_resolution_test.sql` (+187),
`studio_member_rates_test.sql` (+138) — and I read every line of it, re-derived both grafts
mechanically (see below), and re-read `00606`'s stamp bounds (a)–(e), `00598`'s policies and guards,
`00599`'s resolver, `set_project_studio_id` (head `00563`) in full, `guard_org_membership_changes`,
`close_prior_studio_member_rate`, `guard_studio_member_rate_insert`, the live
`organization_members`/`organizations`/`studio_member_rates` policy sets, `rulings.md` (HT-3-e and
HT-3-e(4) verbatim) and `plan-v2.md` §0/§3/§W5–W7. Lane B is phase 2; its absence is not counted.

**Graft integrity (patina-db-migrations step 2), re-derived rather than trusted.** A mechanical diff of
the function bodies, not of the files:

| function | source body | diff against `00615` |
|---|---|---|
| `resolve_time_rate_cents` | `00599` (grep winner; sole definition) | **+26 / −0** — the HT-3-e(2) clause and its comment, nothing else |
| `guard_studio_member_rate_history` | `00598` (grep winner; sole definition) | **+26 / −0** — the HT-3-e(4) stamp and its comment, nothing else |

Both lineage banners are present and name the right source. The trigger
`aaa_guard_studio_member_rate_history_trg` is not recreated and is still the only `BEFORE UPDATE`
guard that sorts before `close_prior_studio_member_rate_trg` (live `pg_trigger`: `tgtype` 19 =
BEFORE/ROW/UPDATE for the guard and `set_updated_at`, 7 = BEFORE/ROW/INSERT for the insert guard and the
ladder).

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`, exit 0, zero `ERROR`/`FAIL` in the log; ledger tail `…00604, 00605, 00606, 00607, 00615` |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` (`time_rate_resolution_test` with case (ah) among them) — **at 2026-09-12 23:4x UTC**. A re-run at **00:2x UTC** reds `time_rate_resolution_test` (`FAIL ag3`): see **W2-R9-04**, a clock-dependent gate, not a regression |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`. All six **pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`); five abort inside `_countersign_design_services_agreement_impl`. W2 touches no agreement path |
| `run-sql-tests.sh -d …/supabase/tests/rls …` (all 30) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` (`FAIL 3b`), `studio_titles_test.sql` (`FAIL f`), both **pre-existing and documented** (`:114-115`). `studio_member_rates_test` (case (l)), `time_entry_studio_stamp_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio`, `00584_studio_comember_rls_sweep` all **PASS** — **at 2026-09-12 23:5x UTC**. A re-run at **00:2x UTC** also reds `time_entry_studio_stamp_test` (`FAIL s8d`): **W2-R9-04** |
| `pnpm --filter @patina/supabase type-check` | **clean** (exit 0, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (exit 0, full route table). Two `Attempted import error: 'ErrorBoundary' …` warnings are pre-existing — W2 touches no admin-portal file |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 scripts/generate-legacy-grants.py` → `git diff --quiet supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + **2625** replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --quiet database.types.ts` | **CLEAN** |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R4-08**. **Ninth round** |
| migration-number sweep over every local + remote ref and all worktrees | `00604`–`00607` and `00615` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `hour-tracking/edge`. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the nine commits; round 8's commit touches exactly the four intended files; Conventional Commits (`fix(time): W2-R8-01 — …`) |
| live object probe after the clean reset (step 7) | `guard_studio_member_rate_history`: HT-3-e(4) marker **t**, `NEW.created_by := (select auth.uid())` **t**, SECURITY **INVOKER** t, trigger binding **1**. `resolve_time_rate_cents`: HT-3-e(2) clause **t**, `public.organization_members` read **3×** |
| write-path sweep on `studio_member_rates` | the ONLY function body in any schema that writes the table is `close_prior_studio_member_rate()` (DEFINER, owner postgres, **no** EXECUTE for anon/authenticated/service_role); **zero** views reference the table; the only authenticated-executable function that mentions it at all is `stamp_project_pricing_studio`. Table grants: `authenticated` SELECT/INSERT/UPDATE, **no DELETE**, and there is **no DELETE policy**. So the guard has no bypass |

---

## Findings

### W2-R9-01 · MAJOR · confidence HIGH · NEW (measured 1/1 through RLS as the actor, two independent statement forms; the brief's second trigger, literally)

**HT-3-b's pricing studio is RECOMPUTED on every hour for a legacy project whose `studio_id` is NULL,
and the designer can EMPTY her own employer tier with ONE statement. The owned tier then opens, and
HT-3-e(2)'s OWNER exemption prices the number she wrote for herself — on her former employer's
project, at her former employer's client. There is no statement the employer can make, before or
after, that pins the column.**

*Location:* `supabase/migrations/00615_self_authored_rate_requires_ownership.sql:449-458` (the owner
exemption) on top of `00599`/`00615`'s two-tier derivation (`00615:219-250`: employer tier
`role <> 'owner'`, owned tier only when the employer tier is empty), reached because
`supabase/migrations/00606_time_entries_studio_read_narrow.sql:596-599` — bound **(c)**, *"only where
the derivation is silent"* — **refuses the stamp while the derivation is answering**, and
`set_project_studio_id`'s authenticated arm admits `TG_OP = 'INSERT'` only, so the column cannot be
written by hand either. The statement she uses is the shipped `Members can leave` policy on
`public.organization_members` (`DELETE … USING (user_id = auth.uid() AND role <> 'owner')`), or — as an
`admin` — `Org admins can update members` on her own row.

*Measured, probe C — the ordinary legacy shape, no manoeuvre. Her project was created before she held a
seat anywhere (the only way `studio_id` is NULL — `00602` stamps it the moment a tier answers), she was
then hired as a plain `member` of ONE employer, which priced her 26000 arm's length:*

```
C0  project column = NULL · derived pricing studio = the EMPLOYER · she owns 1 workspace (00295's)
C1  her 120-minute hour, honest baseline            = 26000 / studio_member / 52000
C2  she writes her OWN 99900 in her OWN workspace   → INSERT SUCCEEDS (she is its owner)
C2b the employer tries to pin the column IN TIME    → REFUSED 22023 "a studio already prices this
                                                      project's hours — there is nothing to repair"
C3  she DELETES her own employer seat               → 1 row
C4  derived pricing studio is now HER WORKSPACE
C4b her next 120-minute hour                       = 99900 / studio_member / 199800   ← THE TAKING
C4c the earlier hour still reads 26000             (written rows do not move)
C5  the employer's OWNER now reads 0 of the project's 2 hours; she reads 2
C6  the employer's repair act                       → REFUSED 42501 (she holds no seat there any more)
C7  the employer's OTHER legacy project, which it could never stamp either
                                                   = 99900 / studio_member / 199800
D1  the employer's owner tries `UPDATE projects SET studio_id = …` by hand
                                                   → REFUSED P0001 studio_id_not_designer_studio
D2b the `admin` variant: she sets her OWN seat `status = 'removed'` → 1 row
D2c her next hour                                  = 99900 / studio_member / 199800
```

*Why MAJOR and not a note.* The brief's own wording: *"lets a SINGLE account with no ownership transfer
move its own resolved rate to a number it set."* One account. No ownership transfer. No confederate. No
consent-free seat. Three authenticated statements (write the rate, leave, log the hour), in any order,
and the money is hers. It is expressly **outside** HT-3-e(3)'s accepted residual, which buys its
exposure with *"a SECOND account"* and *"transfers ownership of her provisioned workspace to it"* — this
needs neither. It is also outside residue (i) of HT-3-e(1), which is about an outsider seating a victim.
And HT-3-e(4)'s own closure makes the shape cleaner, not dirtier: she no longer has to touch her
employer's card at all.

*What it is NOT.* It is not a defect in round 8's fix, and it is not new code. The mechanism is W1's
ruled derivation (`00599`, already merged to `hour-tracking/integration`), W2's `00615` owner exemption,
and a pre-existing membership policy. I am reporting it at the W2 gate because `00615` is W2's file, the
exemption is the leg that prices, and the act that could have closed it (`stamp_project_pricing_studio`
bound (c)) is W2's too.

*Why the obvious bounds do not work, each checked:*
- **A rate-authorship test** cannot help: the row is in a studio she genuinely OWNS, which is exactly
  what HT-3-e(2) exempts, and HT-3-c's sole proprietor needs that exemption.
- **Refusing the owned tier outright** breaks HT-3-a arm (a) and HT-3-c — every real one-person studio.
- **Letting the employer pre-stamp** is refused today by bound (c) by design (*"where HT-3-b answers, the
  owner already reads these hours and this function must not re-price them"*) — and that reasoning is
  exactly what assumes the answer cannot change.
- **Bounding the DELETE** is a People-room ruling, not a pricing one, and the `status = 'removed'`
  variant needs no DELETE at all.

*The candidate closures (the orchestrator's call, not mine), in the order I would put them:*
1. **Pin the answer when it is unambiguous.** Relax bound (c) from a refusal to a **confirm** where
   `p_studio_id` equals `project_pricing_studio_id(p_project_id)`: the owner/admin of the studio the
   derivation already names may stamp it, which writes down what was already true and makes the column
   immune to a later seat change. Costs nobody anything (it names the studio that is already pricing),
   is one `IF` in `00606`, and gives the employer a real remedy before the fact. Needs a ruling because
   HT-3-c arm (a) calls a stamp *final*.
2. **At the resolver:** the owned tier is not reached for a project whose **`created_by` is not the
   designer** (here the employer's owner created it) — i.e. a project somebody else opened for her is
   never priced by a studio she owns. Narrow, schema-answerable today, and it leaves the genuine sole
   proprietor (who creates her own projects) untouched. Needs a ruling; it also does nothing for a
   legacy project she created herself while employed.
3. **A seat-history bound** (the owned tier is refused while the designer held an employer seat in the
   span the hour falls in) — the schema cannot answer it today (`organization_members` rows are
   DELETED, not closed), so it is a data-model change, not a bound.
4. **Ruling-only:** accept it as a second residual on HT-3-e(3)'s footing, on the ground that a departed
   designer's own studio pricing her own hours is correct and the employer's remedy is to reassign the
   lead. If that is the answer, the suite must say so — a case like (q)/(r), loudly labelled — because
   **nothing in the tree measures it in either direction today**, and lane B needs a sentence for the
   owner whose project's pricing studio changed without anybody stamping anything.

### W2-R9-02 · MINOR · confidence HIGH · NEW (a capability REGRESSION against round 8, created by HT-3-e(4) meeting HT-3-e(1)'s arm's-length leg)

**A member can now DENY her employer the repair act for her own legacy projects with one statement: she
rewrites her own open rate row, HT-3-e(4) re-authors it to her, and `00606`'s employer arm — which asks
for a row in that studio *"that somebody other than she wrote"* — then finds none, so the stamp is
refused to the studio's owner and admins as well as to her.**

*Location:* `00606:467-479` (the EXISTS over `studio_member_rates` with `created_by <> user_id`) reading
a column `00615:583-588` now moves.

*Measured, probe A on the honest employer (same fixture as the discharge probe):*

```
A2  she rewrites the owner's open row 26000 → 99900  → row re-authored to her (the fix working)
A4  HER stamp of her other legacy project             → REFUSED 42501 "this studio holds no rate … that
                                                        somebody other than she wrote"
A5  the EMPLOYER OWNER's stamp of the same project    → REFUSED 42501, the same message
A6  the owner corrects the number in place (27000)    → row re-authored to HIM; her hour prices 27000
A11 the OWNER's stamp, retried                        → SUCCEEDED; A11b her hour there = 27000
```

With `00598`'s guard reinstalled, A4 and A5 both **SUCCEED** — so this refusal is new this round.

*Severity.* It contradicts no ruling (HT-3-e(1)'s ORDER is already *"the studio prices her first, then
repairs the project"*), it moves no money to her (the hour is `'none'`, HT-26's "rate pending"), and it
is recoverable in **one** owner statement (A6 → A11). It is a denial she can repeat, and an honest
studio whose card holds exactly one row — the common case for a studio that has priced a hire once —
will meet it with no message that explains what happened. *Fix:* either a sentence in lane B's copy and
`rulings.md`, or make the leg accept a row **closed** by somebody else (it already accepts closed rows —
W2-R8-05 — so the narrower repair is to ask for a row *whose history* contains an arm's-length author,
which her rewrite cannot erase because closed rows are frozen outright).

### W2-R9-03 · note — ruling owed · confidence HIGH · NEW (the narrow edge of case (l2))

**HT-3-e(4) is keyed on the number MOVING (`IS DISTINCT FROM`), which case (l2) asserts as correct — so
an owner who AGREES with the number his member just wrote cannot re-author the row by re-saving the same
number through a bare `PATCH`: authorship stays hers and the hour stays `'none'`.** The shipped portal
path is not affected (`useSetStudioMemberRate`, `use-studio-member-rates.ts:101-113`, upserts
`created_by: userId`, so a blur-save at the same number does re-author). Measured as the `l2`/A6
pair. *Fix:* nothing in the DB — but if any later caller PATCHes `hourly_rate_cents` alone, it must also
send `created_by`, and that is worth one line in `00615`'s COMMENT or the hook's doc block.

### W2-R9-04 · MINOR · confidence HIGH · NEW (two of the program's own green gates are clock-dependent — measured on both sides of UTC midnight)

**`time_rate_resolution_test.sql` case (ag3) and `time_entry_studio_stamp_test.sql` case (s8d) — the two
legs that assert HT-3-e(2)'s REPAIR ("once the studio writes its own row the hour prices again") — date
the repair row with `CURRENT_DATE` (the SESSION time zone) while the hour they then log is
`NOW() - INTERVAL '1 hour'` and the resolver anchors the rate span in **UTC** (W1-R1-11,
`00615:425-430`). In the first hour after UTC midnight those two dates disagree, the repair row does not
cover the hour, the leg answers `'none'`, and both files go RED.**

*Measured, same database, same commit, nothing else changed:*

```
23:4x UTC  billing 7/7 · rls 28/30 (the two documented)          ← the gate table above
00:2x UTC  billing 6/7  FAIL ag3 "…the hour prices again…; got NULL / none"
           rls     27/30 FAIL s8d (the same sentence, the employer's owner half)
00:2x UTC, session TZ = America/Chicago (CURRENT_DATE = 2026-09-12, the hour's UTC date)
           both files GREEN again, 0 errors
```

The TZ leg is the proof of mechanism and the proof that my probes left nothing behind: identical DB
state, only `CURRENT_DATE`'s answer moved. `scripts/run-sql-tests.sh` sets no time zone, so it inherits
the server's `UTC` — i.e. the red window is real for anyone running the gate between 00:00 and 01:00 UTC
(wider for any case that pairs `effective_from = CURRENT_DATE` with a larger `NOW() -` offset; these
files use offsets up to 9 hours elsewhere).

*Good news, checked rather than assumed: there is NO product face.* The shipped writer is UTC-anchored
too — `useSetStudioMemberRate` sends `effective_from: new Date().toISOString().slice(0,10)`
(`use-studio-member-rates.ts:52,107`), which is the **UTC** date, and the column default is
`CURRENT_DATE` evaluated on a UTC server. So a studio's blur-save and the resolver agree in production;
it is the SQL fixtures that are in the session's time zone.

*Fix:* one expression in each case — `(NOW() AT TIME ZONE 'UTC')::date` (or `CURRENT_DATE - 1`) in place
of `CURRENT_DATE` for the repair row's `effective_from`, or pin the probe hour to
`date_trunc('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '12 hours'`. Worth doing because these two legs
are the cases that prove HT-3-e(2) costs an honest studio only one rate row — the assertion the ruling's
own residue (ii) rests on — and a gate that is green by the clock is the false-green class
`patina-verification` exists for.

### W2-R8-01 · DISCHARGED · confidence HIGH (verified independently and by installation)

Re-measured on a fresh fixture (probe A, ids `d9090000-…`), not on the suite's: the rate's own SUBJECT
(an `admin` of an honest employer that priced her 26000) rewrites the OWNER's open row to 99900,
`created_by` now reads **her**, and her 120-minute hour answers `NULL / none / NULL` with the resolver
agreeing. Negative control in the same transaction with `00598`'s guard body reinstalled:
`99900 / studio_member / 199800`, author still the owner. The three bounds the fix claims all hold:
`postgres` writes take the early return (the ladder's own `effective_to` UPDATE is unchanged and the
suites are green), a number-less UPDATE leaves authorship standing (`l2`), and a forge plus a rate change
still RAISES (`l3`). Case (l) is green in every run. Case (ah) was green in the pre-midnight run and green
again in the post-midnight `America/Chicago` run that clears W2-R9-04; in the post-midnight UTC run the
file aborts at **(ag3)**, which sits before (ah), so (ah) was not reached there — the clock-dependent legs
are (ag3) and (s8d), not (ah) or (l).

### Carried — each re-checked this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R8-02** (employer arm admits a consent-free outsider) | note — ruling owed · HIGH | **Live, code unchanged.** Ruled as residue (i) of HT-3-e; closure is HT-3-b arm (c)'s owed consent door. By the brief's discipline a ruled residue is a note, and it stays the heaviest of them |
| **W2-R8-03** (the owner exemption is a LIVE-seat test) | MINOR · HIGH | **Live, code unchanged** — and probe C is its mirror image with money attached: the same live-seat reading that drops a founder-turned-partner to `'none'` is what hands a departed hire her own number. Worth ruling once, for both directions |
| **W2-R8-04** (number bookkeeping) | MINOR · HIGH | **Live, verified in the file.** `plan-v2.md:25` still reads *"W5 none (`00615` reserved)"* and `:708` *"`00615` is reserved … and is left unused"*, while `rulings.md` records `00615` as spent by W2 and *"W5 mints from `00616`"* — and `00616` **is used**, by W6's `time_entry_activity_travel` (`plan-v2.md` §W6). The only genuinely unspent number in the plan is W6's `00617`. Two plan lines and one sentence |
| **W2-R8-05** (the arm's-length leg bounds an order, not an actor) | MINOR · MEDIUM | **Live, code unchanged**, and W2-R9-02 adds a second fact about it: the leg is satisfiable by the stamping caller in the same session, accepts a CLOSED/expired row, and is now **destroyable by the rate's subject**. One sentence in `00606`'s banner and COMMENT |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Partially discharged.** The new `DO $guardpostcondition$` block opens with an explicit *"SPELLING HEURISTIC, not a proof of behaviour"* note (the complaint answered). The **resolver** block in the same file still carries the two occurrence counts (`public.studio_member_rates` = 1, `public.organization_members` = 3) over `pg_get_functiondef` output with no such label — a later hand who so much as names either table in a comment inside that body reds the migration |
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live, re-run** — red at `:171`; the W2 re-registration at `:545-548` is never reached, so §0.17's discharge is asserted by no green gate. W1's; ruling owed. **Ninth round of asking** |
| **W2-R6-06** (the member infers a teammate's rate) | note — ruling owed · HIGH | **Live, re-measured** (probe B5): `project_hours_total` answers the rostered plain member, the lead designer, the studio owner and the studio admin **identically** — `210 / 180 / 140000`. She knows her own 40000 and her own 60 minutes, so `(140000 − 40000) / (180 − 60) × 60 = 50000` is the designer's confidential rate, exactly. Rule whether `amount_cents` is owner/admin-only. Lane B inherits it |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured** (probe B8): an invoiced row's `duration_minutes` → `P0001 … only notes (and detaching the invoice) may change`; `billable` → the same raise; `DELETE` → `P0001 … cannot be deleted`; the row survives at 60 minutes; **`notes` rewritten by the studio owner → NO RAISE** |
| **W2-R2-09** (the audit trigger has no `WHEN`) | MINOR · HIGH | **Live, re-measured** (probe B7): one ordinary owner adjust wrote **exactly one** row — `time_entry.updated`, actor = the owner, `organization_id` = the pricing studio, `old_values` and `new_values` both present, `updated_by` stamped, 120 → 150 min with the rate re-derived (50000 / 125000). The trigger still has no `WHEN`, so a plain member's self-edit writes one too |
| **W2-R2-05/06/07/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | MINOR/NOTE | Live, unchanged — round 8 touched none of those files |
| `W2-impl.md` findings 2–5 | acknowledged | unchanged |

### The brief's read/refusal probes, re-measured (probe B, every call through RLS as the named actor)

| probe | result |
|---|---|
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** — she reads **1 of 4** entry rows (her own); **0** of the designer's 3, so `notes` and `hourly_rate_cents` are unreachable; **0** rows of the designer's `studio_member_rates`; **1** `time_entry_ledger` row. Her own entry's `hourly_rate_cents` rewrite → `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`; an UPDATE of her own open rate row → **0 rows** under RLS, value unchanged; her own rate-card INSERT → `42501 new row violates row-level security policy` |
| `project_hours_total` per role | rostered member **210/180/140000** · lead designer **210/180/140000** · studio owner **210/180/140000** · studio admin **210/180/140000** · `guest` co-member **42501 `the caller is not on this project`** · outsider **42501**, same message (W2-R6-06 above) |
| the rollup never returns notes | **confirmed on the TYPE and on the rows.** `studio_hours_rollup(uuid,date,date,text,uuid,uuid) → TABLE(bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes)`; `project_hours_total(uuid) → TABLE(minutes, billable_minutes, amount_cents)`; `time_entry_ledger` has **27** columns and **none** is `notes`. Buckets per role: owner **2**, rostered member **1** (her own), outsider **0 rows, no raise** |
| the audit trigger on an owner adjust | **exactly one** row, 0 → 1, as tabulated in W2-R2-09 above |
| owner/admin writes cannot touch invoiced rows | **confirmed** — duration, `billable` and DELETE all raise; only `notes` passes (W2-R2-13) |
| r7's P1/P3/P7/P8 shapes under HT-3-e | **P1 repaired** (probe A1: the honest admin-designer's own stamp of her ambiguous-tier legacy project SUCCEEDS). **P7 repaired** (A11: the employer's owner repairs the rest of the book, and her hour there prices at the employer's number) — with W2-R9-02's caveat that she can stall it. **P8's INSERT form → `'none'`** (A10). **P8's UPDATE form → `'none'`** (A2/A3 — round 8's MAJOR closed). **P3's ownership-transfer form** is HT-3-e(3), ruled. **And a fourth shape nobody had named: probe C** |

### Doors I checked and found SHUT (so the orchestrator knows what the MAJOR is not)

| attempt (all as her, one account) | result |
|---|---|
| stamp the workspace she OWNS while she holds an employer seat | **42501** bound (e) — *"a studio prices this project's hours only from inside its designer's own tier"* (probe A7), still refused after she writes herself a rate there (A8b) |
| promote herself to `owner` of the employer | **P0001 `owner_promotion_requires_owner`** (A9) |
| `deactivate` the employer ORGANIZATION to empty her tier without leaving | **P0001 `organization_admin_column_protected`** (probe E2) |
| INSERT her own high row at the employer and have it price | **`'none'`** / the employer's covering row still prices (A10) |
| a DEFINER or view bypass of the rate guard | none exists — write-path sweep above |
| an honest correction by an actor with **no `profiles` row** (the new stamp writes an FK column) | **0 rows** under RLS, no raise, the row and its author unchanged (probe E1) — the FK hazard does not materialise |

---

## Pre-existing failures, listed separately as the brief asks

**Eight**, none of them W2's, identical to the r1–r8 baseline, all in `supabase/tests/KNOWN_FAILURES.md`:
six in `commercial` (`:69`, `:97-101`) and two in `rls` (`:114-115`). One still touches this program's
mechanism: `studio_titles_test.sql` `FAIL f` — *"demoting the sole active owner should raise
`last_owner_protected`"* — is the `guard_org_membership_changes` arm that would stand in the way of the
ownership moves HT-3-e(3) accepts. Any closure leaning on ownership hygiene must know that guard is
already not firing on this stack. (It is **not** the door W2-R9-01 uses: that one is the ordinary
member-leave policy, and `last_owner_protected` has nothing to say about a non-owner seat.)

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding.
- `pnpm --filter @patina/designer-portal test` / `lint`, and the `DATA_MODE=live` e2e line — outside the
  brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R9-01 over HTTP.** Every statement it needs is an ordinary `authenticated` write the RLS policies
  admit (`Members can leave` DELETE, `Org admins can update members` UPDATE, the rate INSERT, the time
  entry INSERT) and `authenticated` holds the table grants, but I drove them through `psql` with the
  session's JWT claims set, not through PostgREST.
- **W2-R9-01 against the live portal UI.** Whether the designer portal exposes a "leave studio" control
  today is unchecked; the policy and the grant are the evidence that the API path exists.
- **Concurrency and volume.** No two-simultaneous-stamp race; no measurement of W2-R2-06's per-row
  DEFINER policy call.
- **No prod anything.** Every command ran against `127.0.0.1:54422`; nothing was pushed to Strata; W1's
  constraint stands (`00599`/`00601` must not reach Strata ahead of `00606`/`00615`, and `00615` now
  carries two rules). **The Strata population of `projects.studio_id IS NULL`** — now additionally split
  by whether the designer's lead projects were created by somebody else — is **still uncounted**. It
  sizes W2-R9-01, W2-R8-02 and HT-3-e(3), and it is one read-only query. **Ninth round of asking.**
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched. Every
  probe script lives in the session scratchpad and ends in `ROLLBACK`; no probe fixture survives on the
  stack — the `billing` and `rls` suites were re-run **after** every probe and the only new reds are
  W2-R9-04's two clock-dependent cases, which go green again on the same database the moment the session
  time zone agrees with the hour's UTC date.
- **Whether W2-R9-01 is in scope for W2 at all.** Its mechanism spans W1's merged resolver, W2's `00615`
  exemption and a pre-existing membership policy; I have reported it at this gate because W2 owns two of
  the three legs, but which wave (or which ruling) should carry it is the orchestrator's call, not mine.
