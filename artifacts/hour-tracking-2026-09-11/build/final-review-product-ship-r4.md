# Final integration review — PRODUCT + SHIP-READINESS, round 4

**clean = false** — 0 blockers, 2 major (one of them carried and unchanged since round 2; one
raised and closed inside this pass).

Every round-3 finding is dispositioned below against the code that is on the branch now. The
three round-3 majors that were the fixer's to close — **R3-M1** (a drifted stack),
**R3-M2** (two lenses, two dates for one hour) and **R3-m1** (the blank `Member` cell) — are
**CLOSED and measured**, R3-M2 in a browser at the exact hour the finding named. **R3-M3**
(G2, where the push runs from) is carried unchanged and is this round's only genuinely open
major. **R3-M4** (the two PostHog rollout percentages) is, per this round's brief, being read
by the orchestrator **out of band**, so it is recorded as a carried gate and not counted.
One new major is raised — and fixed in this pass: the ship checklist's own post-push probe was
left on the signature HT-13-b replaced, so a *correct* push would have read as a failed one.

Branch `hour-tracking/integration` @ **`5ffe24667`**; `origin/main` (`b88fd4c5`) is an
ancestor (`git merge-base --is-ancestor` → true); worktree clean
(`git status --porcelain` empty; `git ls-files -v | grep ^S` → `supabase/config.toml` only).
Reviewer context separate from every implementer. Stack: the isolated `patina-hours` stack
(`127.0.0.1:54421` / `:54422`), **read as the fixer left it — I did not reset it**. Portal on
**3100** only; 3000/3002 and 54321/54322 never touched. **Zero prod contact of any kind this
round — not even a read-only `supabase migration list --linked`.**

---

## §0 · The stack I was handed — not drifted

The brief says to stop if it looks drifted. It does not.

```
studio_hours_rollup                        → exactly ONE pg_proc row:
  studio_hours_rollup(uuid,timestamp with time zone,timestamp with time zone,
                      text,uuid,uuid,text)
classify_project_time_entry_authority ~ roster_role   → t
resolve_time_rate_cents               ~ roster_role   → t
schema_migrations tail  → 00617 00618 00619 00620 20260910152111
user_roles.granted_at (last reset)      → 2026-09-14 09:41:14 UTC
project_time_entries → 0 rows            studio_member_rates → 0 rows
```

Both `roster_role` probes are **t** — R3-M1's failure mode (a hand `psql -f` of a
lower-numbered file after a reset) has not recurred. `00618`/`00619`/`00620` are the last three
`NNNNN_` versions applied. This is the ship baseline the fixer's second `db reset` produced.

I mutated it for the walk and put it back: one `studio_member_rates` row and one
`project_time_entries` row, both deleted; final state re-verified as **0 entries · 0 rates**.
I re-applied no migration file and ran no `db reset`.

---

## §1 · Gates run in my lens — commands and verbatim outcomes

All `pnpm --filter <pkg> <task>` from `…/.codex/worktrees/agent-integration`; all SQL on
`127.0.0.1:54422`.

| Gate | Command | Result |
|---|---|---|
| designer-portal types (the real gate) | `type-check` | **PASS** — exit 0, no output |
| designer-portal unit, run **alone** (R3-n2) | `test` | **PASS** — `Test Suites: 581 passed, 581 total / Tests: 7452 passed, 7452 total / Snapshots: 1 passed`, 30.3 s. No intermittent red |
| designer-portal lint (the one config that resolves) | `lint` | **PASS** — exit 0, `✖ 202 problems (0 errors, 202 warnings)` |
| client-portal types | `type-check` | **PASS** — exit 0 |
| client-portal unit (coverage floor enforced) | `test` | **PASS** — `Test Suites: 151 passed, 151 total / Tests: 2475 passed` |
| admin-portal build (the repo's strictest gate) | `build` | **PASS** — exit 0, full route manifest |
| `@patina/supabase` types | `type-check` | **PASS** — exit 0 |
| `@patina/supabase` unit | `test` | **PASS** — `Test Files 102 passed (102) / Tests 1259 passed \| 12 skipped` |
| SQL, whole tree (run **twice**, identical) | `./scripts/run-sql-tests.sh -d …/supabase/tests -H 127.0.0.1 -p 54422` | `total 188 · green 162 · expected-fail 23 · **unexpected 3** · effective **185/188**` |
| Edge functions | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/index.test.ts supabase/functions/digest-dispatcher/status.test.ts` | **`ok \| 18 passed \| 0 failed`** (69 ms). No `deno.lock` left at the worktree root |
| `qbo-export` type | `deno check --config supabase/functions/deno.json supabase/functions/qbo-export/index.ts` | **clean**, exit 0 |
| Hours e2e, **flags ON** | `PLAYWRIGHT_DESIGNER_PORT=3100 … NEXT_PUBLIC_FLAG_OVERRIDES='studio-workspaces:true,agreement-parts:true' NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live npx playwright test --config playwright.hours.config.ts e2e/document/hours.spec.ts` | **8 passed** (1.9 m), incl. `[8/8] the studio rate card stands on the Account sheet (HT-3/HT-4)` |
| Hours e2e, **flags absent** | same without `NEXT_PUBLIC_FLAG_OVERRIDES` | **7 passed, 1 skipped** (2.1 m) |
| Generated types | `SUPABASE_DB_URL=…54422 pnpm --dir … db:generate` + `git diff --stat` | **IN SYNC** — empty diff |
| ACL seed | `python3 ./scripts/generate-legacy-grants.py` + `git diff --stat` | **IN SYNC** — "baseline + **2651** replayed statements", empty diff |
| iOS | `apps/mobile/Capture/scripts/capture-gate.sh all` on `.codex/worktrees/agent-ios` @ `35336ba7a` | **PASS** — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`. Simulator only; **never device-verified** |

**The Hours e2e was fix round 3's own named gap** ("`hours-ledger.tsx` DID change, so the Hours
e2e is unre-run, and that is a real gap I am naming rather than papering over"). It is closed:
both runs above are round 4's, on `5ffe24667`, and the one-case difference between them is
P2-M3's proof that an exported `NEXT_PUBLIC_FLAG_OVERRIDES` still reaches the server.

**iOS is exactly the tip's content.** `git diff 35336ba7a..5ffe24667 -- apps/mobile` is
**empty** — `5ffe24667` is the merge of `35336ba7a`, so the gate read what ships.

### The three standing SQL reds

1. `edge_api/catalog_roles_remote_conformance_negative_test.sql` — the file hard-refuses any
   port but 54322; an isolated-stack artifact. Unchanged from rounds 1–3.
2. `proposals/proposal_copy_immutability_test.sql` — column census drifted by `subject`, added
   by `00590` **on `origin/main`**. Unchanged from rounds 1–3.
3. `mood_boards/project_board_share_test.sql` — **new at round 4.** See **R4-m1**: the cause is
   proven and is not this program's.

Round 3's third standing red, `capture_enrichment/target_type_visibility_test.sql`, is now
allowlisted (N-06) and reports EXPECTED-FAIL. The runner also prints *"1 known-failure file(s)
now pass"*: that is `commercial/direct_order_attribution_test.sql`, whose `KNOWN_FAILURES.md`
entry already documents it as failing **only between 00:00 and 02:00 UTC** — see **R4-n6**.

---

## §2 · The walk — America/Chicago, Sunday 21:30, at 1440 and 390

Playwright against the dev server on **3100**, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
both flags forced on, `timezoneId: 'America/Chicago'`, `page.clock.setFixedTime`. Signed in as
`designer@patina.dev`, owner of *Leah Hartwell* and *Local Dev Studio*. Fixture: one
`studio_member_rates` row ($120/hr) and one 90-minute billable `client` hour on *Cedar Lane
Study* (Local Dev Studio) at **`2026-09-14 02:05:00+00`** — i.e. **Sun 13 Sep 2026, 21:05
America/Chicago**, inside the nightly band where the UTC calendar day is already the 14th.
The ledger's own fact columns still read `day = 2026-09-14`, `iso_week = 2026-W38`, exactly as
HT-13-b says they must.

### Scenario A — clock fixed Sun 13 Sep 21:30 CDT (`2026-09-14T02:30Z`), current week

| Surface | What it printed | Verdict |
|---|---|---|
| caption | `Hours · this week` / `THE STUDIO · Local Dev Studio (2 of 2) · THIS WEEK` | ✅ |
| `MINE` day header | **`TODAY`** over `1H 30M · Cedar Lane Study · TIMER · STUDIO RATE · $120/HR · $180` | ✅ Sunday |
| `THE STUDIO · BY PERSON` | `Leah Hartwell · 1H 30M · 1H 30M BILLABLE · $180` | ✅ |
| `THE STUDIO · BY DAY` | **`2026-09-13`** · `1H 30M · 1H 30M BILLABLE · $180` | ✅ **Sunday, not the 14th** |
| `THE STUDIO · BY WEEK` | **`2026-W37`** | ✅ the week the caption names, not W38 |
| `THE STUDIO · THE ENTRIES` | `CEDAR LANE STUDY · **2026-09-13** · CLIENT · STUDIO RATE · $120/HR · $180 · PRICED BY LOCAL DEV STUDIO` | ✅ |
| `EXPORT → CSV` | `patina-hours-studio-2026-09-07.csv`, header unchanged (14 columns, no `Notes`), one row: `"Leah Hartwell","**2026-09-13**","Cedar Lane Study","Nora Ellison","client","Yes","90","120.00","studio_member","lead_designer","180.00","pending_authorization","No",""` | ✅ Date column is Sunday; every field quoted (MS-04) |
| widths | `documentElement.scrollWidth` = **1440** and **390** on every view walked | ✅ |

### Scenario B — clock fixed Mon 14 Sep 09:00 CDT, paged back one week (R3-M2's exact shape)

This is the case round 3 measured as broken.

| Surface | Round 3 | Round 4 |
|---|---|---|
| caption | `WEEK OF SEP 7` | `Hours · week of Sep 7` / `THE STUDIO · Local Dev Studio (2 of 2) · WEEK OF SEP 7` |
| `MINE` day header | `13 SEPTEMBER` | **`13 SEPTEMBER`** |
| `THE STUDIO · BY DAY` | `2026-09-14` — *a day the displayed week does not contain* | **`2026-09-13`** |
| `THE STUDIO · THE ENTRIES` | `… · 2026-09-14 · …` | **`… · 2026-09-13 · …`** |
| CSV Date | `"2026-09-14"` | **`"2026-09-13"`** |

**One hour, one day, every lens, inside a week that contains it.** R3-M2 is closed by
measurement, not by argument.

### Underneath, at the RPC

```
studio_hours_rollup(studio,'2026-09-07 05:00Z','2026-09-14 05:00Z','day')
                                                → 2026-09-14   (default = UTC, unchanged)
… ,'day',     null,null,'America/Chicago')      → 2026-09-13
… ,'iso_week',null,null,'America/Chicago')      → 2026-W37
… ,'day',     null,null,'Not/AZone')            → ERROR  studio_hours_rollup: p_timezone must
                                                  be an IANA time zone name (got Not/AZone)
                                                  [invalid_parameter_value]
```

### The client folio's dated sub-table — Sunday too

Not walked in a browser (the client portal runs on 3002, which this stage may not touch), read
end to end instead, and the chain is closed at every link:

* `invoice-composer.ts:210` is the only production caller of `buildTimeLineDraft`, and it takes
  the default `timeZone` — the **composing studio viewer's own** zone. For our instant that
  writes `date: "2026-09-13"` into `metadata.attribution`, proven by the three new jest cases
  (`America/Chicago` → the 13th; `Asia/Tokyo` on `2026-09-13T23:30Z` → the 14th; and the sort
  key), all inside the 581/7452 pass.
* The pay-link sheet renders the persisted string through `formatShortDate`, whose `Intl`
  formatter pins **`timeZone: "UTC"`** (`invoice-sheet.tsx:97-101`), so `"2026-09-13"` →
  **`13 September`** in *every* homeowner's zone. Measured in node under
  `TZ=America/Chicago`.
* The printed/PDF copy renders it through `@patina/shared`'s `formatInvoiceDate`, which also
  pins `timeZone: 'UTC'` for a bare `YYYY-MM-DD` (`packages/shared/src/invoice/index.ts:101-109`)
  → `Sep 13, 2026`.

`.slice(0, 10)` is gone from `buildTimeLineDraft`, and `grep '\.day\b'` across the designer
portal's document components and lib finds **no remaining user-facing read of the ledger's UTC
`day`** — only the `local_date ?? row.day` fallback in `time-export.ts` and three comments.

---

## §3 · Disposition of every round-3 finding

### Product + ship lens (`final-review-product-ship-r3.md`)

| id | r3 sev | Round-4 verdict | Evidence |
|---|---|---|---|
| **R3-M1** the stack had drifted | major | **CLOSED — verified on arrival, not taken on trust** | The stack I was handed has exactly ONE `studio_hours_rollup` (the seven-argument one), both `roster_role` probes **t**, and `00618–00620` last in `schema_migrations`. `user_roles.granted_at` = `2026-09-14 09:41 UTC`, after the fix round's final commits. I re-applied nothing. |
| **R3-M2** two lenses, two dates | major | **CLOSED by HT-13-b — measured in a browser at the exact hour** | §2, scenario B. `MINE` = `13 SEPTEMBER`, `BY DAY` = `2026-09-13`, `THE ENTRIES` = `2026-09-13`, CSV = `"2026-09-13"`, `BY WEEK` = `2026-W37`. Server side: `00607` takes `p_timezone text DEFAULT 'UTC'` appended last, cuts both buckets on `(scoped.started_at AT TIME ZONE v_zone)`, DROPs the six-argument overload, and carries two new postconditions plus `studio_hours_rollup_test.sql` case (j). Portal side: `viewerTimeZone()` / `localDateOf()` in `time-derivation.ts`, threaded into `ScopeRollup`, `ScopeEntries`/`ScopeEntryRow` and the CSV's per-row `local_date`. |
| **R3-M3** the push runs from neither checkout | major | **NOT CLOSED — carried, re-measured without touching Strata** | See **R4-M1**. |
| **R3-M4** the two PostHog rollouts | major | **NOT CLOSED — dispositioned OUT OF BAND by this round's brief** | See **R4-n1**. Recorded as a hard pre-ship gate with its exact steps in checklist §0b; not counted against `clean`. |
| **R3-m1** blank `Member` cell in the CSV | minor | **FIXED — re-measured** | `time-export.ts:133` is `csvField(row.member_name ?? "Unnamed member")`, the same word `00607`'s rollup has always used. Existing test updated. |
| **R3-m2** `+ Add a role` 69 × 18 | minor | **NOT FIXED — accepted as residual, deliberately** | Carried into checklist §2.6 with the two `Remove` acts and the two pre-existing ones, as one §A pass. See **R4-m3**. |
| **R3-n1** two pre-existing sub-44px acts | note | **Accepted, unchanged** | Swept with R3-m2. |
| **R3-n2** designer suite intermittently red | note | **HONOURED and re-honoured** | Run alone at round 4 too: `581 / 7452`, no red. |
| **R3-n3** stale `isoDate` comment | note | **FIXED** | `hours-ledger.tsx:163-165` now says what is true. |
| **R3-n4** internal-time door has no studio picker | note | **Ruling owed, unchanged** | Carried to Kody's walk (checklist §4.4). |
| **R3-n5** `127.0.0.1:3100` fakes a flag-off reading | note | **Recorded, no action** — and it has a sibling | See **R4-n5**. |
| **R3-n6** rulings owed | note | **P2-n1 CLOSED** (HT-13-b), **HT-10-b RULED**; the rest still owed — see **R4-n7**. |
| **R3-n7 / S-6** `-d <subdir>` loses the allowlist | note | **Not fixed; worked around** | I ran the whole tree with the default `-k`, where the normalization is consistent, and classified every red by hand. |

### Money + security lens, as the fixer dispositioned it (`final-fix-r3.md` §1) — spot-checked

| id | Claim | Round-4 check |
|---|---|---|
| **MS-15 / HT-10-b** | ruled, **zero code change** | ✅ **True.** `grep 'CREATE POLICY.*Designers manage' supabase/migrations/0059*.sql supabase/migrations/006*.sql` is empty — no migration in `00595–00620` redefines the `00177` ALL policy. The live qual is still `EXISTS (… p.designer_id = auth.uid())` with no `user_id` leg, which is exactly what the amended ruling describes. |
| **R3-m1 (money)** | `log_time` refuses `> now() + 26h` | ✅ present in `00608`, with a postcondition (`v_def !~ 'interval ''26 hours'''` raises) and SQL case (f). Both date-only doors carry `max={isoDate(new Date())}`. |
| **R3-m2 (money) / W6-R3-06** | `worthLabel` keys on the rate first | ✅ `FieldHours.swift` → rate → `Billable`/`Awaiting authorization`; `'none'` → `Rate pending`; NULL source, no rate → `Rate not recorded`. `SupabaseFieldHoursService` selects `hourly_rate_cents` under the same `.eq("user_id", userID)` — no new read surface. |
| **W6-R3-07** | closed at its cause | ✅ `FieldLogTimeDraft.endAnchor` + `startedAt` now `private(set)`; `setDuration` walks the START back; `setStartedAt(_:)` drops the anchor and `LogTimeSheet`'s `DatePicker` goes through it. |
| **R3-m5 / MS-10** | `studio_member_rates_admin_update` WITH CHECK mirrors its INSERT sibling | ✅ read in `00598`; `USING` deliberately not narrowed, with the reason in-file. |
| **N-02 / N-13** | `stamp_time_entry_updated_by()` pinned and revoked | ✅ `SET search_path = public, pg_temp` + `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`, the same shape `audit_time_entry_change()` takes in the same file. |
| **N-15** | `TimeEntryFilters` deleted | ✅ gone from `use-time-tracking.ts` and from `hooks/index.ts`, with a pointer to `TimeEntryLedgerParams` in its place. |
| **R3-m4 / MS-09** | `mktemp` rooted in `$TMPDIR` | ✅ in **this branch's** `scripts/run-sql-tests.sh`. The repair reaches the gate only after the merge, as the fixer said. |

---

## §4 · Findings

### BLOCKER

*None.*

### MAJOR

#### R4-M1 · `supabase db push --include-all` still cannot be run from the linked checkout — carried from P2-M1 / R3-M3, unchanged, re-measured today without touching Strata.
*Confidence: high — read off the filesystem. Severity: major — a silent-no-op ship-time hazard. Not a blocker only because checklist §0a now makes it five explicit steps with a self-verifying stop.*

```
ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql | tail -1
  → …/00580_room_concept_render.sql
```

The linked checkout (`supabase/.temp/project-ref` = `bkvcixdmuyejfzcijpdg`) is on stale local
`main` and has no file for **anything after 00580** — not this program's 25, and not
`origin/main`'s own `00581–00591` or `20260910152111`. Run there today,
`db push --include-all` finds nothing to push and **reports success**. The other checkout has
every file and is not linked, and its `config.toml` is the skip-worktree'd isolated-stack one.

This is an instruction with nothing enforcing it, and the failure mode is a green that means
nothing. Round 4 strengthens the instruction rather than closing the finding: checklist **§0a**
is now five numbered steps with exact commands, three counted expectations
(`570` files, `25` in the `00595–00620` block, and the `tail -3` glob), and a hard stop —
`supabase migration list --linked | tr ',' '\n' | grep -c '"local":""'` must be **0** before
the chain runs.

#### R4-M2 · The ship checklist's own post-push probe named the signature HT-13-b deleted, so a CORRECT push would have read as a failed one.
*Confidence: high — read in the artifact, and the live signature measured. Severity: major (a ship gate that fails on correct state). Disposition: **FIXED in this pass**.*

`ship-checklist.md` §1② probe 3 said:

```
--   expect EXACTLY ONE row:
--   studio_hours_rollup(uuid,timestamp with time zone,timestamp with time zone,text,uuid,uuid)
```

HT-13-b appended `p_timezone text DEFAULT 'UTC'` **and dropped that six-argument form**
(`00607`: a defaulted argument makes a surviving overload ambiguous rather than resolved), so
after a correct `db push` the single row on Strata will read
`…,text,uuid,uuid,**text**)`. An operator running the checklist verbatim would have read a
healthy push as a broken one, on the probe the checklist itself calls non-optional — and the
obvious "repairs" from there (re-push, roll back, hand-apply) are the S-4 / R3-M1 failure mode.

Round 3's fix pass updated every *in-repo* reference to the new signature — `00607`'s own
postconditions, `00613`'s two `to_regprocedure` strings, `studio_hours_rollup_test.sql`, the
ACL seed — and left only the checklist behind. Fixed here: probe 3 now names the seven-argument
identity, and a new **probe 3b** asserts the labels are cut on
`(scoped.started_at AT TIME ZONE v_zone)` and that `to_char(scoped.day,` is gone, so the ship
verifies HT-13-b on Strata rather than assuming it.

### MINOR

#### R4-m1 · A third standing SQL red that no artifact names — `mood_boards/project_board_share_test.sql`. The cause is proven and is not this program's, but until it is written down the sweep's "unexpected" count stops meaning anything at ship time.
*Confidence: high — reproduced 3/3 under the runner's own invocation, and the mechanism read in the file. Severity: minor (gate hygiene; no product or money consequence).*

```
supabase/tests/mood_boards/project_board_share_test.sql:899: ERROR:
  the headline must read as a guest's, got: A guest approved Reactable note
```

The assertion wants `'A guest approved Proposal board note'`. The mechanism:
`notification_log.created_at` defaults to **`now()`** — the *transaction* timestamp — the whole
file runs in ONE transaction, and the read is
`… ORDER BY created_at DESC LIMIT 1`. The two guest-reaction rows the file writes (one for
`'Reactable note'` at `:246`, one for `'Proposal board note'` at `:738`) therefore carry
**identical** `created_at`, and which one `LIMIT 1` returns is heap/plan order. Deterministic on
this stack today; it was green at round 3.

Not this program's: `git diff --name-only origin/main..HEAD` is empty for
`supabase/tests/mood_boards/` and for anything touching `notification_log`, and nothing in
`00595–00620` writes a `client_feedback` notification. **Owed:** one `KNOWN_FAILURES.md` line,
or a tie-break (`ORDER BY created_at DESC, id DESC`) in the test. Carried into checklist §2.7.

#### R4-m2 · Checklist §0a's file-listing check expected three names that command never prints.
*Confidence: high — run. Severity: minor. Disposition: **FIXED in this pass**.*

Round 3's §0a said `ls /Users/kody/Code/patina-merged/supabase/migrations | tail -3` should show
`00619_… 00620_… 20260910152111_…`. It does not: `supabase/migrations/` contains a `_pending/`
**directory**, `_` (0x5F) sorts after `2` (0x32), and the bare `ls` therefore prints
`00620_… / 20260910152111_… / _pending`. A ship-time operator sees a mismatch on step one of
the gate that matters most. Fixed by using the `*.sql` glob, and the trap is named in-line.

#### R4-m3 · Four sub-44px acts inside the Hours/Studio surfaces, all still open, all accepted.
*Confidence: high (measured at round 3). Severity: minor. Carried, not re-measured this round.*

`+ Add a role` 69 × 18 (program-new, R3-m2), the two `Remove` acts 18 px / 30 px (W7-R6-05 /
W7-R5-03), and the pre-existing `‹ earlier` 66 × 17 and `Bill week → Accounts` 180 × 28
(R3-n1). One §A pass takes all four; none is money or security. Checklist §2.6.

### NOTE

* **R4-n1 · G1, the two PostHog rollout percentages, is unread and is the orchestrator's out of
  band this round.** Per the brief I did not make a sixth attempt and I do not count it against
  `clean`. What has not changed is the consequence round 2 measured both ways: with
  `studio-workspaces` off the Account sheet carries **no STUDIO tab**, `/desk?account=studio`
  reconciles to Profile in silence, and a studio the rollout has not reached has **no door** to
  set a per-member rate — so every services hour prices `rate_source='none'` and, since MS-01,
  cannot reach an invoice at all. Checklist **§0b** now carries the exact steps (MCP call, UI
  URLs), what to record (enabled / rollout % / cohort) and the decision rule if either is below
  100 %.
* **R4-n2 · HT-10-b is ruled and the code really is untouched.** Verified rather than assumed:
  no migration in `00595–00620` contains a `CREATE`/`DROP`/`ALTER POLICY` for
  `Designers manage their project time entries`, and the live qual on the stack is still the
  bare `projects.designer_id = auth.uid()` EXISTS with no `user_id` leg. `rulings.md`'s amended
  row describes exactly that. Option (b) — the column split plus a definer correction RPC —
  remains owed follow-up, and I have kept it out of the checklist's gate list accordingly.
* **R4-n3 · HT-13-b's folio clause: "at render" (the brief) vs "at compose time" (rulings.md and
  the code).** They agree in substance and it is worth saying why, so nobody reopens it: the
  date is cut in the composing studio viewer's zone and **persisted**, and both renderers pin
  UTC for a bare `YYYY-MM-DD` (`invoice-sheet.tsx`'s `shortDate`, `@patina/shared`'s
  `formatInvoiceDate`), so what the homeowner reads is the studio's day in every viewer zone —
  which is the only honest reading of "at render" for a value the client portal gets no second
  chance at. No legacy exposure: the JSON `patina_time_subtable` payload is new in this program
  (W5), so there is no already-persisted folio carrying a `.slice(0, 10)` date.
* **R4-n4 · The studio lens prints ISO dates where `mine` prints prose.** `THE ENTRIES` and
  `BY DAY` say `2026-09-13` / `2026-W37`; `MINE` says `13 SEPTEMBER`. R3-M2's complaint — two
  *dates* — is gone; what remains is two *spellings* of one date inside one sheet. The shape is
  pre-existing (the studio list printed `row.day` as ISO before HT-13-b, and the bucket labels
  are server-generated strings), so this is not a program regression — but it is the sort of
  thing Leah will read as a seam. No ruling asked for; named so the §A pass can take it if Kody
  wants it.
* **R4-n5 · A second local-dev trap, sibling to R3-n5: a sandboxed `next dev` serves 404 on
  every route while reporting itself ready.** Started inside the agent sandbox, the dev server
  printed `Watchpack Error (watcher): Error: EMFILE: too many open files, watch` a few dozen
  times, then `✓ Ready in 376ms`, and answered **404 for `/` and `/desk`** — the route scan had
  died. Re-run with the sandbox disabled, the same command on the same tree compiled `/` in
  6.9 s and redirected `/desk` → `/auth/signin?callbackUrl=%2Fdesk` correctly. A walk that
  concludes "that route does not exist" or "the flag is off" from a sandboxed dev server should
  be re-run unsandboxed before it is believed. (Together with R3-n5: drive `localhost:3100`, not
  `127.0.0.1:3100`, and start the server outside the sandbox.)
* **R4-n6 · The SQL runner's "1 known-failure file(s) now pass" note is expected, not a
  signal.** It is `commercial/direct_order_attribution_test.sql`, whose `KNOWN_FAILURES.md`
  entry already records that it fails **only between 00:00 and 02:00 UTC**. Both of my sweeps
  ran at ~11:00 UTC. Anyone reading the summary at ship time should not "clean up" that entry.
* **R4-n7 · Rulings still owed, shipping as built:** **P2-n3 / W7-R6-03 / S-9** (an emptied rate
  card passes readiness), **R3-n4** (does the internal-time door need to name its studio for a
  multi-studio owner?), **HT-25-a**, **HT-6-a**, **HT-6-b**. *(P2-n1 is CLOSED by HT-13-b;
  HT-10-b is RULED.)*
* **R4-n8 · No hydration hazard from the new `viewerTimeZone()` read.** It is called during
  render, and a server render would resolve the Worker's zone rather than the browser's — but
  `HoursLedger` mounts only behind `studio-drawer.tsx:577`'s `open?.key === 'hours'`, which is
  set by interaction, so the dated content is never in the SSR HTML. Confirmed empirically:
  `grep -ic hydrat` over both Hours e2e runs' forwarded browser console (16 test executions,
  including the sheet at three widths) returns **0**.
* **R4-n9 · MS-05's eight Strata numbers are still unread**, and this round made zero prod
  contact of any kind. Checklist §1②a is ready.
* **R4-n10 · `run-sql-tests.sh -d <subdir>` still loses the allowlist** (S-6 / R3-n7). I ran the
  whole tree with the default `-k` for exactly that reason and say so in §1.

---

## §5 · What I did NOT verify

* **Strata / prod: untouched.** Not by `db push`, not by `functions deploy`, not by `wrangler`,
  **and not even by a read-only `supabase migration list --linked`** — G2 was re-measured off
  the linked checkout's filesystem instead. MS-05's eight numbers remain unread.
* **The two PostHog rollout percentages remain UNKNOWN to this lens** (R4-n1) — read out of
  band by the orchestrator per the brief.
* **The client folio was not rendered in a browser.** The client portal lives on 3002, which
  this stage may not touch. Proved by code read end to end (three links, all pinned to UTC for a
  bare date) plus the three new jest cases and the 151/151 client-portal pass — not by a
  `/pay/<token>` page.
* **1024 was not walked by hand** — covered by the Hours suite's own passing width case.
* **The `a member` and `this document` lenses were not driven by hand**, and the plain-member
  lens was not re-created this round (round 3 measured it: no lens, no CSV, no repair door,
  `BILL WEEK → ACCOUNTS` `disabled: true`).
* **The unbilled band was not walked with authorized money in it** — `project_unbilled_time`
  needs `billing_state='authorized'`, which needs a signed services agreement I did not
  construct. Covered by the 581/7452 jest pass and by round 3's full read of the changed code.
* **iOS is Simulator-only.** `capture-gate.sh all` green on iOS content identical to the tip; no
  physical device, so every camera/LiDAR/upload/airplane-mode claim in W6 remains **not
  device-verified**. P-6 rules that acceptable; Kody's walk is the closure.
* **`@patina/design-system` vitest: not run** (it hung at round 2; not retried).
* **Lint outside designer-portal was not run**, and would not be trustworthy if it had been —
  designer-portal holds the only flat ESLint config that resolves in this repo.
* **Client-portal e2e not run** (chromium-only suite).
* **I did NOT reset the database.** I read the stack the fixer left, probed it (§0), used it,
  and restored it. Two rows inserted and deleted; final state re-verified **0 entries · 0
  rates**. No migration file was hand-applied.
* **Worktree left clean.** The two walk-only files I wrote
  (`apps/designer-portal/playwright.r4walk.config.ts` and `e2e/r4-walk/`) are deleted, and the
  `next-env.d.ts` line the dev server rewrites was restored. `git status --porcelain` is empty.
  Port 3100 is free; 3000/3002 and 54321/54322 were never touched.
