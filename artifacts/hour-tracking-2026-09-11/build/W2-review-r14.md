# W2 — lane A (DB) adversarial review, round 14 · HT-3-g AMENDED (a)(b)(c)

**clean = false — ONE MAJOR.**

Part **(a)**, the ROSTER KEY, is real and not vacuous: remove it from both copies of the statement and the
billing suite reds at `j1` with the taking reproduced (I measured that independently, then restored the
file). Part **(b)**, the REMEDY ARM, is the problem. The arm the amendment ordered is, as written, a
**one-statement taking that needs no seat, no transfer and no second party, on every project a designer
leads that already names a studio** — and the party it displaces has no way back at all, not even the
remedy path the amendment names for forms S and H. Measured 1/1 in my own fixture with a negative
control in the same fixture: her hour moves from an honest employer's arm's-length `26000` to the
`77700` she wrote for herself, the employer reads 0 rows, `42501` on the total, `22023` on the repair,
`42501` on the reassign, and **0** audit rows of the overwrite that took it. The fix pass reported the
width (its point 2, case (m) m6–m8) and declined to narrow it on a guess, which was right; under the
brief's discipline (c) the manoeuvre is word-for-word the blocker/major clause, so I grade it MAJOR and
leave the re-grade to the orchestrator.

Besides the MAJOR: **one MINOR that falsifies part (a)'s stated rationale** (the roster key reads a
table the project's own lead designer may clear in ONE statement — no seat touched), **one MINOR
spelling-gate instance**, **two new notes**, **three round-13 findings discharged and verified rather
than trusted**, and the carried set re-measured.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **twenty** commits,
`c71db49d9` → … → `217107400` → `e9d340eca` → `fccb69abd` → **`5e5ff6a88`** (HEAD == `hour-tracking/server`,
tracked tree clean). Round 13's delta is **six** files in three commits — `00620` (+351/−…), `00606`
(+290/−…), `billing/legacy_project_studio_stamp_test.sql` (+846/−…),
`rls/time_entry_studio_stamp_test.sql` (+59/−…), `seed/00-legacy-grants.sql` (+6),
`database.types.ts` (+8) — read line by line. Also read in full: `00620` entire (banner, both
predicates, the statement, the NOTICE, all asserts, all postconditions); `00606`'s
`stamp_project_pricing_studio` body and all of its postconditions; the installed bodies of
`designer_tier_pricing_studio`, `set_project_studio_id` (00563), `fc_provision_studio_on_designer`,
`_provision_studio`; every policy on `project_time_entries`, `project_team_members`, `organizations`,
`organization_members`, `audit_logs`; `plan-v2.md` §0 and §3; `rulings.md` (HT-1, HT-3-c, HT-3-e,
HT-3-g incl. both amendments, HT-10, HT-10-a, HT-36, HT-38); `W2-review-r13.md` and `W2-fix-r13.md`
entire. Lane B is phase 2; its absence is not counted.

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean, through `00620`** — exit 0; `Applying migration 00604…, 00605…, 00606…, 00607…, 00615…, 00620…`; all 27 seed files; `Finished supabase db reset on branch main.` then `{"target":"local","version":"","message":"Reset local database."}`. Every `DO` postcondition block in `00606`/`00615`/`00620` ran (they RAISE on failure) |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` — `legacy_project_studio_stamp_test.sql` PASS, `time_rate_resolution_test.sql` PASS, `time_entry_ledger_test.sql` PASS, `time_claim_atomicity_test.sql` PASS, `time_unbilled_view_repair_test.sql` PASS, plus the three invoice files |
| `run-sql-tests.sh -d …/tests/commercial …` | **10 green / 16, 6 unexpected — all pre-existing and documented** (listed below) |
| `run-sql-tests.sh -d …/tests/rls …` | **28 green / 30, 2 unexpected — both pre-existing and documented.** `time_entry_studio_stamp_test.sql` PASS, `project_hours_total_test.sql` PASS, `studio_hours_rollup_test.sql` PASS, `time_entry_admin_write_test.sql` PASS, `studio_member_rates_test.sql` PASS, `time_entry_auto_roster_test.sql` PASS |
| billing + rls again with `PGTZ=America/Chicago` | **billing 8/8 · rls 28/30 — byte-identical summaries, the same two unexpected files.** W2-R9-04 stays closed |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **exit 0**, full route table |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 ./scripts/generate-legacy-grants.py` **from the worktree** → `git status` | **CLEAN** — `baseline + 2632 replayed statements`, no diff. (W2-R10-06's trap re-avoided: invoked as `./scripts/…` from the lane's own `--workdir`, never the main checkout's copy) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **CLEAN**, exit 0 |
| negative control — the roster key removed from **both** copies of 00620's statement in `legacy_project_studio_stamp_test.sql` (2 replacements) | **ERROR: FAIL j1 (THE ROSTER KEY)** — part (a) is **not vacuous**, measured independently. File restored; `git diff --stat` on it is empty |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's; **fifteenth round of asking** |
| migration-number sweep over **every** local and remote ref | `00604`–`00607` + `00615` + `00620` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `hour-tracking/edge`; the peer people-room program holds `00621`–`00627`; `00608`–`00613` and `00616`–`00619` exist on no ref. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the twenty commits (`git log … -- supabase/config.toml` = 0); the three round-13 commits touch exactly the six intended files; Conventional Commits (`fix(time):` ×2, `test(time):`) |
| the live migration's end state | `projects` **6** · `studio_id IS NULL` **5** · NULL rows whose designer's tier answers at all **0** · left by the roster key **0** · left by the author key **0**. So `00620`'s postcondition (a) holds as an end-state query after seeds, and the 5 residual NULLs are rows the tier rule answers nothing for — not rows a key left |
| probe hygiene | every probe transaction ended in `ROLLBACK`; after all of them the `projects` table holds **0** rows matching my fixture prefixes (`c714…`, `c724…`, `c734…`, `c744…`, `c754…`, `c764…`, `c774…`) and the billing suite re-ran **8/8** identical |

---

## Findings

### W2-R14-01 · MAJOR · confidence HIGH · NEW (HT-3-g AMENDED (b)'s remedy arm, measured 1/1 with a negative control in the same fixture)

**The remedy arm admits ANY designer who owns a studio to re-point ANY project she leads that already
names a studio, at the studio she owns, in ONE statement — no seat touched, nothing transferred, no
second party, on a project she did not create — after which HT-3-e(2)'s owner exemption prices her hours
at the number she wrote for herself, and NO party can undo it, the displaced studio included. It is not
even a partial remedy for the forms it was ordered to remedy: the displaced studio's `reassign_project_lead`
is refused and its stamp is refused, exactly as in forms S and H.**

*Location.* `supabase/migrations/00606_time_entries_studio_read_narrow.sql` `:589-592`
(`v_caller_is_designer := (v_actor = v_designer_id)`), `:593-605` (`v_caller_owns_named`), `:618`
(`v_remedy := v_caller_is_designer AND v_caller_owns_named AND v_existing IS NOT NULL`), `:665-671`
(bound (b) yields), `:719` (bound (c) bypassed), `:786` (bound (d) bypassed), `:804-808` (the write),
`:820-836` (the audit row).

#### Measured, my own fixture, through RLS as the named actor

Fixture: honest employer E (active `design_studio`, owner OE), designer D holding ONE active `member`
seat at E with E's arm's-length `26000` card authored by OE; D also OWNS workspace W with her own
self-authored `77700`; project P, `designer_id` = D, **`created_by` = OE** (she did not open it),
`studio_id` = E — the state every project created since `00602` is in.

```
P1.0  the project names E
P1.1  her 120-minute hour                        = 26000 / studio_member / 52000   ← the control
P1.2  ONE statement: stamp_project_pricing_studio(P, W)   → returned W, no error
P1.3  the project now names W
P1.4  her next 120-minute hour                   = 77700 / studio_member / 155400
P1.5  P-4: the first hour keeps its 26000
P1.6  E's OWNER reads 0 of the 2 hours   ·  P1.6b  0 time_entry_ledger rows
P1.7  E's OWNER's project_hours_total     → 42501 "the caller is not on this project"
P1.8  E's OWNER's repair                  → 22023 "this project already names a studio"
P1.9  E's OWNER reads 0 of the restamp audit rows   (P1.9b: the row exists, organization_id = W)
P1.10 her own studio's rollup: 1 project bucket
P1.11 HER SEATS ARE UNCHANGED — 2 active, the employer seat still present
```

*And the remedy the amendment names, measured in a second fixture with a canonical
`designer_clients` pair so the call is reachable at all:*

```
P6.1  she takes it in one statement
P6.2  E's OWNER calling reassign_project_lead(P, D, OE)
        → 42501 "lead reassignment requires the current lead or an exact-studio owner/admin …"
P6.3  E's OWNER's stamp                   → 22023
```

*Four facts the fix report does not state, each measured.*

1. **(b) is not a remedy for the shape (b) itself creates.** `reassign_project_lead` (00399) is pinned
   to the project's CURRENT `studio_id` — which after this taking is W — so the employer cannot become
   the lead and cannot reach the arm. The fix report measured that refusal for forms S and H (k3/l8) and
   reported it as a partial remedy; it is the SAME refusal here, and here there is no prior state in
   which the employer could have acted, because the project was hers the whole time. The arm therefore
   hands the taker a route strictly **cheaper** than forms S/H (which at least cost her a seat) and
   gives the victim nothing.
2. **The `v_existing IS NOT NULL` conjunct — the one bound the fix pass added beyond the ruling's words —
   is vacuous in production.** It restricts the arm to already-stamped projects; `00602`'s INSERT stamp
   fills that column on every project created since, and `W2-fix-r12.md` §9's own Strata sizing reports
   `studio_id IS NULL = 0` there. On this stack the 5 NULL rows all answer tier `'none'`, so they are
   unreachable by the arm either way. The conjunct genuinely preserves form A's closure (I re-measured
   it, see W2-R14-01's regression table below) — but only over a population that is empty where it
   matters.
3. **The population is Patina's ordinary onboarding path, not an exotic one.**
   `fc_provision_studio_on_designer` takes its early exit only for a user who already holds SOME
   `organization_members` row; otherwise `_provision_studio` creates an **active `design_studio`** and
   inserts her as **`owner`**. So a designer who signs up alone and is later hired keeps that workspace
   for ever and satisfies `v_caller_owns_named` for it permanently. What bounds the arm is only that she
   must own a studio: `authenticated` holds **no INSERT privilege on `public.organizations`** and no
   DEFINER function reachable by `authenticated` inserts one (both probed), so a designer who owns
   nothing cannot manufacture one.
4. **The displaced studio cannot read the one trace.** The overwrite writes
   `project.pricing_studio_restamped` with `organization_id = v_written` — the NEW studio.
   `audit_logs`' only SELECT policies are `Org admins can view org audit logs`
   (`organization_id` match + owner/admin) and `Users can view their audit logs` (`user_id` match), so
   the row is readable by the taker and by her own studio and **by nobody else** (P1.9 = 0 against
   P1.9b = 1). Case (m)'s `m7` — "the one trace of it is the audit row" — is true only for the party
   that does not need it. See W2-R14-03.

*Why MAJOR, stated so the orchestrator can re-grade rather than re-derive.* The brief's discipline (c)
reserves blocker/major for "a ONE-account manoeuvre that touches no seat, transfers nothing, uses no
second party, and still moves that account's own resolved rate on a project it did not create to a
number it set." Every clause is satisfied literally and was measured: one account (D), one statement
(P1.2), no seat touched (P1.11), nothing transferred, no second party, a project she did not create
(`created_by` = OE), and her resolved rate moved from 26000 to the 77700 she authored (P1.1 → P1.4). It
is not a residual by (c)'s definition, so the residual-note grade is not available to it.

*Closures, ranked, so the orchestrator can choose rather than re-derive (I am not the implementer).*

1. **Key the arm on the project's BOOK, not on the caller** — which is the amendment's own sentence
   ("the narrowing it needs is a fact about the project's BOOK at that call site, not a fact about the
   caller"). The cheapest such fact is the OLD studio: admit the overwrite only where the studio being
   replaced does **not** employ the project's designer (no active non-guest `role <> 'owner'` seat for
   her there). The employer-recovery shape survives intact — after a form-S/H taking the old studio is
   the taker's own WORKSPACE, in which the new lead holds no employer seat — and case (m)'s shape dies,
   because an honest employer does hold exactly that seat.
2. **Require that the old studio never priced her** — no `studio_member_rates` row for the designer in
   the OLD studio authored by anybody but her. Same outcome by a different fact, and it reuses bound
   (d)'s existing predicate (one studio argument changed), so it is the smallest diff.
3. **Drop the arm and give the displaced studio an explicit UNPIN act** bounded to the OLD studio's
   owner/admin — the unpin HT-3-b arm (c) already owes, and the only direction in which the victim gets
   a hand of her own rather than depending on the taker's.
4. **Ruling-only**, keeping case (m) as a passing, loudly-labelled assertion where it is. If this is
   chosen, the fact to record is not the one the amendment priced: the arm reaches **every** project,
   the victim has **no** path, and the trace is invisible to her.

*Regressions re-measured in the same round, all holding* (independent fixture, through RLS):

| shape | result |
|---|---|
| FORM A — she owns the studio, leads the project, the column is **NULL** | **REFUSED `42501`** ("a studio prices this project's hours only from inside the tier that EMPLOYS its designer…"), and it wrote nothing |
| the EMPLOYER arm on a NULL column (the honest repair) | **SUCCEEDS** |
| a plain `member` naming her employer | **REFUSED `42501`** (bound (a): only an owner or admin of the studio named) |
| the hire naming a studio she does not own | **REFUSED `42501`** |
| an ADMIN (not owner) of her own studio, who IS the lead, on a stamped project | **REFUSED `22023`** |
| an OWNER of the studio named who is NOT the lead, on a stamped project | **REFUSED `22023`** |
| naming the studio the project already names | **no-op `RETURN`**, no raise |

### W2-R14-02 · MINOR · confidence HIGH · NEW — part (a)'s stated rationale is false: the roster key reads a table the project's own lead designer may clear in ONE statement, touching no seat

`public.project_roster_books_elsewhere` reads `public.project_team_members`. The policy
`Lead designers manage team members` (00177) is **`polcmd = '*'`** — ALL commands — on
`EXISTS (SELECT 1 FROM projects p WHERE p.id = project_team_members.project_id AND p.designer_id = auth.uid())`.
So the project's own lead designer may rewrite or delete **every** roster row on her project, and one
statement does the whole roster at once. Measured:

```
P2.2  author key FALSE (her own hand opened it) · roster key TRUE  ← case (j-i)'s shape exactly
P2.3  ONE UPDATE by the lead designer: SET removed_at = NOW() WHERE project_id = P   → 1 row
P2.4  roster key now FALSE                                          ← no seat touched
P2.5  restored (removed_at = NULL) → roster key TRUE again
P2.6  ONE DELETE by the lead designer                               → 1 row, roster key FALSE
P2.7  00620's statement verbatim then stamps her owned studio
P2.5b authenticated calling the predicate itself → 42501 permission denied   (the REVOKE holds)
```

`00620`'s own `COMMENT` says the roster "cannot go quiet without touching those people's seats one at a
time", and `W2-fix-r13.md` §1 says "she cannot move [it] without touching their seats one at a time".
Both are false in the same way round 13 showed the author key to be false: the key asks about a fact
inside the manoeuvre's own hand. The difference from W2-R13-01 is that clearing a roster is **not** a
seat act, so form S's *realistic* population — the one part (a) was ordered to close — costs two
statements rather than one (clear the roster; then leave her own employer seat), and only the second is
a seat act. **Graded MINOR, not MAJOR, because under discipline (c) the complete manoeuvre still
requires an account to leave its own seat, which makes it a residual**; and its remedy path under (b)
recovers the money only with the taker's own hand (measured, P6.2/P6.3). What is worth the orchestrator's
attention is that the premise the closure was chosen on does not hold, and the preferred-closure ranking
of round 13 rested on it.

Also measured — the new key's surface is the same shape as the key it was added to reinforce. Against
an owned-tier answer, `project_roster_books_elsewhere` is **FALSE on five of the six standings a roster
member can hold**, plus two more shapes:

| roster member's standing | roster key |
|---|---|
| active, non-guest seat in an active `design_studio` the designer does not own | **TRUE** ← the only shape it blocks |
| `guest` seat there | false |
| seat there with `status = 'removed'` | false |
| seat in a **`suspended`** studio | false |
| seat in a non-`design_studio` org (`manufacturer`) | false |
| seat only in a studio the designer OWNS | false *(the Leah shape, correctly kept)* |
| seated nowhere | false |
| the roster row is soft-removed (`removed_at` set) | false |
| the roster member IS the designer | false |

### W2-R14-03 · note · confidence HIGH · NEW — the overwrite's audit row is invisible to the studio it displaced

`00606:820-836` writes `organization_id = v_written` on both actions. On a **restamp** the party that
needs the row is the studio losing the project, and `audit_logs`' two SELECT policies give it nothing
(measured: displaced owner 0 rows, the row present). Cheapest repair: on a restamp write
`organization_id = v_existing` (the displaced studio) — the new studio already sees the project itself —
or write two rows, one per `organization_id`, under the same action. Until then lane B has no fact it
can show the displaced studio, and the copy obligation the fix report records for lane B is not
satisfiable from the audit trail at all.

### W2-R14-04 · MINOR · confidence HIGH · NEW (W2-R8-06 class, a fresh instance in the round-13 delta)

`00620`'s postcondition **(b3)** pins the roster key by source with

```
prosrc LIKE '%designer_owner_seat.role           = ''owner''%'
```

— **eleven literal spaces**, copied out of the predicate's alignment. Probed on the installed body: the
eleven-space form matches (`t`), the single-space form does not (`f`). So a reformat of the predicate
(an alignment change, a rename, any formatter) reds the whole migration while saying nothing about the
question the key asks, and a hand who keeps the spacing while changing the semantics passes. Round 13
fixed exactly this class at `00606` by case-folding five legs; the same treatment is owed here. Cheapest
repair: `regexp_replace(prosrc, '\s+', ' ', 'g') LIKE '%designer_owner_seat.role = ''owner''%'`, the
shape `00606`'s policy-qual asserts already use. The other two legs of (b3) (`roster.removed_at IS NULL`,
`roster.user_id IS DISTINCT FROM p_designer_id`) carry single spaces and are fine.

### W2-R14-05 · note · confidence HIGH · NEW — the two keys are applied by `00620` and not by `00602`'s INSERT-time stamp

`set_project_studio_id_owned` (00602/00603) writes the same tier rule at INSERT with **neither** key.
Measured harmless today and recorded rather than claimed: `00563`'s authenticated INSERT arm admits only
`NEW.created_by = auth.uid()`, so the author key would be false by construction on that path, and a
project has no roster at the instant it is inserted, so the roster key would be false too. It is
recorded because the asymmetry is invisible in the code: a later path that inserts a project on somebody
else's behalf, or that seeds a roster in the same statement, gets the owned tier with no key at all.

---

## The brief's read/refusal probes, re-measured (every call through RLS as the named actor)

| probe | result |
|---|---|
| **forms S and H** | RESIDUAL under discipline (c) — each needs an account to leave or remove a seat. Asserted as passing, loudly-labelled cases (k) and (l), and the suite is green. **Remedy, measured: it does NOT recover for the displaced studio acting alone** — `reassign_project_lead` refuses its owner `42501` because the function is pinned to the project's current `studio_id` (re-measured independently, P6.2); the stamp half recovers completely once the employer's owner IS the lead, which requires the taker's own hand. So the residual recovers **only with the taker's cooperation**, or once `reassign_project_lead` learns to follow a project's book rather than its current column |
| **the roster key on every shape in the r13 matrix** (tier × roster, `00620`'s statement run verbatim) | one employer + foreign roster → **stamped `employer`** (the tier is unkeyed by roster, as ruled) · two employers → left NULL (tier) · one owned + CLEAN roster → **stamped `owned`** · one owned + FOREIGN roster → **left NULL** ← the only shape the key blocks · seatless → left NULL (tier) · two owned → left NULL (tier). Plus the nine roster-member standings in W2-R14-02's table |
| **the remedy arm's refusals** | the seven rows of W2-R14-01's regression table — form A on a NULL column `42501`, a bound-(a) failure `42501`, an ADMIN-not-OWNER `22023`, an OWNER-not-LEAD `22023`, the same-studio no-op |
| **every earlier shape for regressions** | the whole rounds-4–11 sweep is `supabase/tests/rls/time_entry_studio_stamp_test.sql` (4054 lines, cases (u) (v) (q) (s) (t) (z) (al) (am)) — **PASS**, and PASS again under `PGTZ=America/Chicago`. Independently re-measured here: form A, the plain-member standing refusal, the non-owner-of-the-named-studio refusal, the employer arm on a NULL column, the re-point refusal, the same-studio no-op. The one that still **succeeds** is the HT-3-f(4) consent-free outsider (carried) |
| **a plain rostered member reading a teammate's row / notes / rate columns** | **refused** — she reads **1 of 2** entry rows (her own) and **0** of the lead's, so the lead's `notes` and `hourly_rate_cents` are unreachable; **1** `time_entry_ledger` row; **0** rows of the lead's `studio_member_rates` |
| **`project_hours_total` per role** | owner **180/180/140000** · admin **180/180/140000** · lead designer **180/180/140000** · rostered member **180/180/140000** · non-rostered studio co-member **`42501` "the caller is not on this project"** · outsider **`42501`**. (W2-R6-06 live: she knows her own 60/40000, so `(140000−40000)/(180−60)×60 = 50000` is the lead's rate exactly) |
| **the rollup never returns notes** | **confirmed on the signature, the view and the rows.** `studio_hours_rollup`'s parameters matching `note` = **0**; `time_entry_ledger` columns matching `note` = **0**; `prosecdef = f` (INVOKER, HT-38). Buckets per role: owner **2**, rostered member **1**, non-rostered co-member **0**, outsider **0**; a sixth `p_group_by` literal raises **`22023`** |
| **the audit trigger** | one ordinary admin adjust → `audit_logs` **0 → 1**, exactly one row: `time_entry.updated`, `organization_id` = the pricing studio, `user_id` = the admin, `old_values` **and** `new_values` present, `updated_by` = the admin. `old_values` carries `notes` (W2-R2-09, carried) |
| **owner/admin writes cannot touch invoiced rows** | **confirmed for both roles** — `duration_minutes` UPDATE `P0001`, `DELETE` `P0001`, for the owner and the admin alike. Only `notes` passes (NO RAISE, 1 row) for both — W2-R2-13, carried |
| **the two new predicates' reachability** | `project_author_books_elsewhere` and `project_roster_books_elsewhere` are both `prosecdef = t`, `provolatile = s`, `proacl = {postgres=X/postgres}` — **no role holds EXECUTE**; an `authenticated` call returns `42501 permission denied` (measured). `designer_tier_pricing_studio` the same. Neither is named by `resolve_time_rate_cents` or `project_pricing_studio_id` (postconditions (c)/(c2), and I re-read both installed bodies: `designer_tier_pricing_studio` reads only `organizations`/`organization_members`, never `projects`, so the NOTICE's post-statement per-key counts cannot disagree with the statement's own) |

## Discharged this round, verified rather than trusted

| id | how it was verified | state |
|---|---|---|
| **W2-R13-02** (the ship cannot see what the key let through) | `00620`'s NOTICE reports **five** numbers — `stamped-employer` / `stamped-owned` (returned by the statement's own `RETURNING tiered.tier`, not re-derived) and `left-null-ambiguous` / `left-null-roster-key` / `left-null-author-key`. The three `left-*` buckets are mutually exclusive by construction and I checked the algebra: `ambiguous` ⇒ `answer.studio_id IS NULL`, while both key buckets require `tier = 'owned'` ⇒ non-NULL; `roster` requires the key TRUE, `author` requires it FALSE. Two arithmetic asserts guard it (`v_stamped = employer + owned`; `v_null_after >= the three`), plus `v_null_after = v_null_before - v_stamped` and the P-4 entry/rate-sum assert. `g1a`/`g1b` require both tiers to appear, and my probe 7 exhibited both | **CLOSED** |
| **W2-R13-04** (the `(am)` mis-citation in `00620`) | `00620:89-94` now names leg **(e)** / `FAIL g5` and records the wrong citation and its correction in place. The file's case letters are `a b c d e f g h j k l m` — confirmed by enumerating every `FAIL <letter><digit>` in it — and it has no `(am)` | **CLOSED** |
| **W2-R13-05** (the case-sensitive postcondition) | all five legs are now `lower(prosrc) NOT LIKE`, and the body was reworded: probed on the installed body, `lower(prosrc) LIKE '%sibling%'` = **f** and `prosrc LIKE '%sibling%'` = **f** — the gate is genuinely silent on the word, not merely case-folded. The removal itself is still real (I re-read the installed body: no sibling `studio_member_rates` read, no `projects` sibling EXISTS, exactly one actor-vs-designer comparison and it is the remedy arm's equality) | **CLOSED** |
| **part (a)'s non-vacuity** | removing `project_roster_books_elsewhere` from **both** copies of the statement in the test reds at `j1` with the taking reproduced; file restored, `git diff` empty. The roster key is doing real work on the shape it fixtures | **CONFIRMED independently** |
| **both keys stand, and (a) adds population rather than restating (b)** | case (j-i)'s row has `author key = FALSE` and `roster key = TRUE` (re-measured on my own fixture, P2.2) — a row the round-12 key alone would have stamped. And case (h)'s row is the converse. So neither key subsumes the other | **CONFIRMED** |
| **the ACL seed and the types** | regenerated from the **worktree's own copy** (2632 statements, one more than round 12 — the roster key's REVOKE) → no diff; `db:generate` → `git diff --exit-code` clean. Every wave migration carrying a top-level GRANT/REVOKE re-listed by grep (`00600`–`00607`, `00615`, `00620`), not from a fixed list (§0.20) | **CLOSED** |
| **P-4 across the round-13 delta** | the migration's own `DO` block counts `project_time_entries` and sums `hourly_rate_cents` before and after and raises on movement (ran clean at replay); P1.5 re-measured it across a remedy-arm overwrite — the hour already priced keeps its 26000 | **HOLDS** |
| **`00563` not weakened** | `set_project_studio_id` exists, is ENABLED, and its `prosrc` still carries `studio_id_not_designer_studio`; postcondition (d) asserts both. The remedy arm's overwrite passes the guard's owner-executed arm legitimately (her owner seat satisfies both the actor-seat and the lead-seat legs) — measured, not assumed | **HOLDS** |

## Carried — each re-measured this round

| id | severity · confidence | state |
|---|---|---|
| **W2-R13-01** (the author key is a fact inside her own hand) | — | **Discharged as written** — part (a) landed and is non-vacuous. **Superseded in two directions:** W2-R14-02 shows the new key is one statement thinner than its rationale claims, and W2-R14-01 shows the remedy ordered to price the residuals opened a cheaper taking than either form |
| **HT-3-f(4) / W2-R10-02 / W2-R13-03** (the consent-free outsider) | note — ruling owed · HIGH | Live, code unchanged. (b) discharges the owed UNPIN **for a victim who owns a studio** (case (z) `z7` now a recovery, green). Still owed: HT-3-b arm (c)'s consent door, and an unpin for a victim who owns none. Note that (b) discharges it by the very width W2-R14-01 is about — the same statement |
| **HT-3-e(3)** (a second account she transfers the workspace to) | note — residual, ruled · HIGH | Live, code unchanged; two accounts, so outside (c)'s blocker clause. Now strictly redundant: W2-R14-01 reaches the same money in one statement with one account |
| **W2-R8-03** (the stamp's seat test is a LIVE-seat test) | MINOR · HIGH | Live; HT-3-g cost note (ii). Re-measured as the `42501` a former employer meets after the hire has left |
| **W2-R8-05 / W2-R12-04 / W2-R13-06** (bound (d) sequences the repair) | MINOR · MEDIUM | Live. The remedy arm now bypasses bound (d) in the one shape where it was unsatisfiable — which is also what makes W2-R14-01's overwrite need no rate card in the old studio's favour. Lane B still owes the refusal worded as *"price her first"* |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Live — W2-R14-04 is the fresh instance.** `00606`'s five legs were case-folded; `00620`'s new (b3) leg introduced an 11-space literal in the same pass |
| **W2-R4-08 (= W2-R2-10)** | MINOR · HIGH | **Live, re-run — red at `:171`**, so `00606`'s §0.17 re-registration is asserted by no green gate. W1's; ruling owed. **Fifteenth round of asking** |
| **W2-R6-06** (a member infers a teammate's rate from the project total) | note — ruling owed · HIGH | **Live, re-measured per role** — owner, admin, lead and plain rostered member all get `180 / 180 / 140000`; the arithmetic above recovers the lead's 50000 exactly. Rule whether `amount_cents` is owner/admin-only |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured per role** — `duration_minutes` and `DELETE` raise `P0001` for owner and admin alike; **`notes` rewritten by either → NO RAISE, 1 row** |
| **W2-R2-09** (the audit trigger has no `WHEN`; `old_values` carries `notes`) | MINOR · HIGH | **Live, re-measured** — one ordinary adjust wrote exactly one row, `old_values ? 'notes'` = t |
| **W2-R2-07** (no caller assert on `project_pricing_studio_id`) | MINOR · HIGH | **Live, re-measured** — a freshly created authenticated stranger reads **0** project rows through RLS and `public.project_pricing_studio_id(<that id>)` returns **the studio's uuid**. §0.16 deviation |
| **`Designers manage their project time entries`** (00177, ALL, no `user_id` leg) | note · HIGH | Live, §0.17-untouched. The lead designer reads and may adjust or delete a colleague's row, notes included — HT-10's "members read own rows" does not reach her |
| **W2-R10-09 / W2-R10-10 / W2-R2-05/06/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | note / MINOR | Live; round 13 touched none of those objects |

## HT-3-g's cost notes, re-measured

| note | measured |
|---|---|
| **(i)** an ambiguous or empty tier prices `'none'`; with no employer seat no party may stamp | **holds** — two employers → `NULL/none`; seatless → `NULL/none`; two owned → `NULL/none`; `00620` left all three alone (probe 7) |
| **(ii)** the seat test is a LIVE-seat test | **holds** |
| **(iii)** the HT-3-f(2) principal's self-repair is withdrawn; `00620` hands her the studio instead | **holds** — leg (e)/`g5`, green |
| **(iv)** no hour is re-rated in either direction (P-4) | **holds** — the migration's own assert, plus P1.5 across a remedy overwrite |
| **(v)** a project whose author has since taken a seat elsewhere is left NULL | **holds**, and the NOTICE now counts it separately (`left-null-author-key`) |
| **(a)'s new cost** — a project whose live roster carries another studio's people is left NULL | **holds**, counted as `left-null-roster-key`. Note the roster includes anybody on it: a client or a trade who happens to hold a seat in an unrelated active `design_studio` leaves the row at `'none'` too |

---

## Pre-existing failures, listed separately as the brief asks

**Eight**, none of them W2's, all documented in `supabase/tests/KNOWN_FAILURES.md`: six in `commercial`
(the countersign/grant family — `authorized_schedule`, `design_services_authority`,
`design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`, each aborting on
`design services agreement … not found or access denied` or `failed canonical project provenance`) and
two in `rls` (`design_requests_test.sql` `FAIL 3b`, `studio_titles_test.sql` `FAIL f`). A ninth,
`commercial/direct_order_attribution_test.sql`, is clock-dependent (documented window 00:00–02:00 UTC)
and **passed** in both of this round's runs. The runner's default `-k` points at a per-directory
`KNOWN_FAILURES.md` that does not exist, so it counts all of them as "unexpected"; the plan's gate line
passes `-k` explicitly.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171`. Not in this round's gate list, not touched, ruling owed.

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. Its carried copy obligations grew by one:
  W2-R14-03 means the displaced studio has no readable fact at all, so lane B cannot show it one from
  the audit trail as the fix report assumes.
- **The twenty commits' TypeScript beyond round 13's delta.** Round 13 touched TypeScript only through
  the generated `database.types.ts` (+8, regenerated clean here). `use-time-tracking.ts` and
  `hooks/index.ts` are r1–r8's; I re-ran their gates, not their diffs.
- **`pnpm --filter @patina/designer-portal test` / `lint`, and any `DATA_MODE=live` e2e line** — outside
  the brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R14-01 over HTTP.** Every statement it needs is an ordinary `authenticated` call the grants and
  policies admit (the `rpc('stamp_project_pricing_studio')` call, the two entry INSERTs, the rate
  INSERT), but I drove them through `psql` with the session's JWT claims set, not through PostgREST.
- **Strata.** I touched no prod anything and did not run the sizing query against it. `W2-fix-r12.md`
  §9's reported `studio_id IS NULL = 0` is its measurement, not mine — but it is load-bearing for
  W2-R14-01 fact 2, so it should be re-read before the push. Note both of `00620`'s predicates are
  defined by `00620` itself, so the amended sizing query can only run after the migration applies; the
  NOTICE reports the same five numbers inside the push's own transaction.
- **Concurrency and volume.** No two-simultaneous-stamp race on the remedy arm's `(studio_id IS NULL OR
  v_remedy)` write (the re-read `RETURNING` is the argument, not a measurement, and for the remedy arm
  the race it guarded against is now the arm's own outcome); no measurement of W2-R2-06's per-row
  DEFINER policy call.
- **Whether W2-R14-01 is a defect or the amendment's intent.** The amendment's text anticipates the
  width and declines to narrow it; the fix pass reported it rather than guessing. Both readings are set
  out with the measurements that separate them, and with the one fact neither the ruling nor the fix
  pass states — that the arm's victim has no path of her own, so (b) is not a remedy in the direction it
  was ordered for. Applying the brief's discipline literally, I grade it MAJOR.
- I staged and committed nothing. `supabase/config.toml` remains skip-worktree'd and untouched. Every
  probe script lives in the session scratchpad and ends in `ROLLBACK`; the one file I edited (the test's
  two copies of the statement, for the negative control) was restored and `git diff` on it is empty;
  after all probes the billing suite re-ran **8/8** identical.
