# W7 — adversarial review, round 1

**Reviewer** separate context · **Branch under review** `hour-tracking/portal` @ `b6c0c1dc0`
**Base** `origin/hour-tracking/integration` @ `fd28a9542` · **Stack** `patina-hours`, Postgres `127.0.0.1:54422`
**Commits reviewed** `2e7567e61` · `513d7cbd3` · `3f7df185d` · `b6c0c1dc0` (4 commits, 22 files, +4224 / −125)

**NOT CLEAN.** 1 blocker: none. 1 major, 11 minor, 3 notes. Nothing in the gate set is red; every gate the brief names was re-run in this context and reproduces the impl's numbers exactly. The major is a live stranding path that survives 00618 by a door the plan's (stale) file cite did not name.

---

## What I could not refute

Each of these I attacked directly and it held.

| Claim | How it was tested | Result |
|---|---|---|
| A two-role rate card binds and resolves without free text | case (al1/al2/al4) inserts through RLS as the actor (`SET LOCAL ROLE authenticated` + jwt claims); I re-ran the suite and independently diffed the two pricing legs | holds. `rate.roster_role = v_role` in the resolver (`00618:1194`) and `rate.roster_role = v_team_role` in the classifier's card PICK (`:1619`), symmetric, with the legacy label leg kept and gated on `roster_role IS NULL` in both — so a bound card and a label-collision card cannot both answer |
| The countersign carry snapshots the role | `agreement_fee_schedules_test.sql` asserts it end-to-end through the live rail (`upsert_agreement_parts` → send → sign → countersign), plus `snapshot.roster_role IS DISTINCT FROM source.roster_role` ⇒ NOT EXISTS. Suite green. I confirmed the eight `INSERT INTO project_billing_authority_rates` sites are one lineage | holds. `00619` is one delta on one INSERT (diffed mechanically against `00578`: 8 added lines, 2 removed, both the INSERT's column list and its SELECT) |
| The default label no longer strands **in the drafting room** | `part-kinds.ts:116` seeds `{roles: []}`; `+ Add a role` now seeds the first unused enum value; `grep "Principal designer"` finds no non-test source outside comments and `account-studio-page.tsx`'s placeholder | holds **for the drafting room**. Does NOT hold for the studio-defaults path — see W7-R1-01 |
| An internal entry can never be billable and never reaches an invoice | measured 1/1 on the isolated stack through the shipped RPC as the actor: `log_time(project NULL, billable false)` → `billable=f billing_state=nonbillable rate_source=none amount=0`; `log_time(..., billable true)` → **42501 refused**; `UPDATE … SET billable=true` → **42501 refused**; `project_unbilled_time` count **0**; `claim_time_entries` returns **0 rows**; `invoice_id` stays NULL | holds, at the DB, not at the UI |
| The opt-out really stops auto-start | 7 new provider cases mock `fetchTimeAutostartPreference` at module level, so `autostartDeclined()`'s `qc.fetchQuery` reads the mocked answer; `hold` awaits it **before** `automaticBillableIntent` and after the `pausedRef` check, then re-checks `heldRef` | holds for `hold`. One ungated auto-start path remains — see W7-R1-06 |
| The disclosure shows once per member | stamped on RENDER via `.update(…).eq('id',me).is('time_autostart_disclosed_at', null)` — idempotent server-side; `stamped` ref blocks a second mutate per mount; a per-session `autostartDisclosedSeen` flag dedups the event | holds on the happy path. Degrades on a read error — see W7-R1-10 |
| HT-35's columns are the member's own | measured through RLS: member B sets her own `time_autostart_opt_out` (UPDATE 1); the same statement aimed at member A's row updates **0 rows**; A's value stays `false` | holds |
| Grafts are their heads' bodies + the named delta only | mechanical `difflib` of each function body against its grep-winner head: `_countersign_…_impl` 00578 → +8/−2 · `resolve_time_rate_cents` 00615 → +29/−0 · `classify_project_time_entry_authority` 00613 → +33/−1 (the one removal is an `IF` reshaped to add `v_rate.id IS NULL AND`) · `_project_agreement_terms` 00575 → +7/−2 · `upsert_agreement_parts` 00578 → +30/−0 | holds. No stale-body revert |
| ACLs survive the redefinitions | live `pg_proc.proacl`: `resolve_time_rate_cents` = postgres,service_role (still trigger-path-only, W1-R7-04) · `upsert_agreement_parts` = +authenticated · `_project_agreement_terms` / `classify_…` = postgres only | holds |

---

## Gates — re-run in this context, verbatim

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **clean**, exit 0; 00618 + 00619 applied, every postcondition passed |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green, 0 unexpected** |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | 10 green / 16, **6 unexpected — the documented six** (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`), each named in `supabase/tests/KNOWN_FAILURES.md:97-101`. `agreement_fee_schedules_test.sql` green **with** its new asserts |
| `run-sql-tests.sh -d …/supabase/tests/rls …` | 29 green / 31, **2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`; `KNOWN_FAILURES.md:115-116`) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **580 suites / 7401 tests, all pass** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (all pre-existing "unused eslint-disable") |
| `pnpm --filter @patina/admin-portal build` | compiled successfully |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test` | **151 suites / 2475 tests, all pass** |
| `pnpm db:generate` → `git diff` `database.types.ts` | regenerated against the reset stack: **no drift** |
| `python3 ./scripts/generate-legacy-grants.py` (worktree's own copy, §0.20) | 2646 statements, **seed diff clean** |

> Note on the runner: `expected-fail: 0` in every summary is the runner failing to match `supabase/tests/KNOWN_FAILURES.md` when invoked with `-d <worktree>/supabase/tests/<suite>` and no `-k` (it looks for `<dir>/KNOWN_FAILURES.md`, which does not exist; the real file is one level up). I matched all eight by name by hand. Not W7's doing — the plan's own gate lines have the same shape.

**Commit hygiene:** clean. `supabase/config.toml` never staged; no `.next`, no `next-env.d.ts`, no `.env` in the diff; four Conventional-Commit `feat(time):` commits with coherent, honest bodies (the 513d7cbd3 body states outright that plan §8's `service-agreement-drafting-room.tsx:238` no longer exists). Migration numbers `00618`/`00619` are unique across **every** ref (`git log --all` over `0061*`/`0062*`: peer holds 00621+; 00617 unminted by W6).

---

## Findings

### W7-R1-01 · MAJOR · confidence HIGH (measured 1/1) — the two-role default card still strands, through the studio Agreement defaults

`§8`'s Done-when #1 is *"A default two-role rate card created by the drafting room prices a new hire's entry with `rate_source='authority'`."* It is false for the default card a studio actually configures.

The plan's named default (`service-agreement-drafting-room.tsx:238`) does not exist — that file is 70 lines on `origin/main` too, and the templates now seed `{roles: []}`, so the drafting room's own default is fixed. But the **server-side** seed is `materialize_standard_parts` (`00575`), and when a fresh design-services draft has no rates it falls to `v_rate_card := COALESCE(v_defaults.rate_card, '[]')` — `studio_agreement_defaults.rate_card`, written by `account-studio-page.tsx:1108-1119`, which **still carries the free-text role `<Input>` and the placeholder `"Principal designer"`** and has no `rosterRole` at all. Nothing else stops it: `readiness.ts:267-282` asks only that a role have a non-blank `roleName` and a rate, never that it carry a binding, so such a card passes readiness, sends, signs and countersigns unbound.

Measured on this stack (`/tmp/claude/w7-probe.sql`, through RLS as the rostered support designer, a signed two-card authority labelled "Principal designer" 26000 / "Associate" 11000, both `roster_role` NULL — exactly what a two-role studio-defaults card materialises):

```
probe                            | hourly_rate_cents | rated_amount_cents | rate_source | rate_role        | billing_state         | authority_rate_id
PROBE-A label-only default card  |                   |                    | none        | support_designer | pending_authorization |
```

That is defect #2, unchanged, on the live default path. (One label-only card does not strand — the classifier's single-card fallback prices it. It takes **two**, which is exactly the card §8's Done-when names.)

The impl discloses this under "Deliberately NOT done" and asks for a ruling. I do not think a ruling is what it needs: the plan item *"the shipped default `roleName: 'Principal designer'` goes; the default seed becomes `roster_role: 'lead_designer'`"* is a wave item whose surface moved, not a new question.

**Fix:** put the same `ROSTER_RATE_ROLES` picker on the studio Agreement-defaults rate card (`account-studio-page.tsx`, incl. the `roleName: ''` add-row at `:1169`), carry `rosterRole` through `studio_agreement_defaults.rate_card` and through `materialize_standard_parts`'s projection, normalise the existing `studio_agreement_defaults.rate_card` labels the way 00618 normalises `proposal_service_rates`, and add a readiness blocker for a rate row with no binding. A cheaper partial fix that closes the *money* half alone: the readiness blocker.

---

### W7-R1-02 · MINOR · confidence HIGH — `materialize_standard_parts` drops the binding on the way back into the editor

`00618` grafts `rosterRole` through four bodies. The fifth body in the same jsonb contract, `materialize_standard_parts` (`00575`), projects `proposal_service_rates` into the rate-card part payload as `{roleName, hourlyRateCents, sortOrder, effectiveAt}` — **no `rosterRole`**. Any re-seed from bound rates therefore hands the editor an unbound card; the picker shows the label as the unchosen state and the next save writes `roster_role` NULL back onto rows that carried a binding.

Live exposure today is narrow — the function early-returns when any part exists, and `clone_proposal` (00399) copies neither rates nor parts — so it needs bound rates plus absent parts. Worth closing with the same one-line delta the other four bodies got, so the next hand that deletes and re-seeds parts does not silently un-bind a signed studio's card.

---

### W7-R1-03 · MINOR · confidence HIGH — HT-35's two bands were never measured at 390 or 1440

The impl's measurement table carries one HT-35 row: *"HT-35 opt-out on the profile page | x=442 | x=46, page overflow 0px"*. The **disclosure band** and the **opt-out fallback band** — both new, both carrying an act (`Understood`, `Start the clock`) — appear in neither column. The brief's rule is every new or changed control at both widths.

I did not re-drive the browser, so this is an evidence gap, not a proven defect: both acts carry `min-h-11`, the band is `flex flex-wrap … max-w-[1180px] px-4`, and it wraps, so I expect it to pass. It has not been shown to.

Worth saying in the same breath: the band mounts as the **first child of `DocumentTimeProvider`**, i.e. above the whole document shell inside `.document-route-shell` — so for an opted-out member it takes a permanent strip above every document page's own chrome, on every open, undismissible. That placement is a design call nobody has ruled.

---

### W7-R1-04 · MINOR — ruling owed · confidence HIGH — the opt-out control is a ~21px target, and its height was not measured

`account-profile-page.tsx`'s new control is `<input type="checkbox" className="mt-[3px] h-4 w-4">` inside `<label className="flex max-w-md items-start gap-2.5">` with a `text-[13px] leading-relaxed` span. The label has no `min-height`, so the pointer target is roughly **21px tall** — generous horizontally, well under the house sheet's 44px floor (`SPEC.md:175-176`) vertically, and hardest to hit at 390 where it matters most.

The impl raised the 43px `<Select>` as owed note 3 ("if the house sheet's 44px floor is to be read as covering form controls as well as acts"). This is the same question and the larger miss by 22px, and it was not raised at all. It wants the same ruling, and probably a `min-h-11` on the label regardless of how the ruling lands.

---

### W7-R1-05 · MINOR · confidence HIGH — the new `— internal —` band uses an inline font size where the identical band beside it uses the type scale

`hours-ledger.tsx:1226` (new): `font-mono text-[11px] uppercase tracking-[0.07em]`.
`hours-ledger.tsx:1597` (W2's, same words, same band): `t-head`.

`.t-head` is `font-meta / 11px / .08em / uppercase` (`globals.css:2016`). So the new band is an inline font-size utility against the hard rule, and it will not match its sibling: different family token and `.07em` against `.08em`. One class change closes it.

---

### W7-R1-06 · MINOR · confidence HIGH — `resume()` is the one auto-start path the opt-out does not gate

`document-time-provider.tsx:538-565` starts a timer with `source: 'timer_auto'` and never consults the preference. `hold` was gated; `resume` was not.

No member gets a clock she declined: `resume` is only rendered when `paused` (`mobile-sheets.tsx:1228-1231`), and an opted-out member can only reach `paused` by first using `startManually`. So the consequence is narrower — her resumed hour is stamped `timer_auto`, a provenance she opted out of, and the next hand to add a `resume` affordance elsewhere inherits an ungated auto-start. Either gate it the way `hold` is, or make it `timer_manual` when `optedOut`.

---

### W7-R1-07 · MINOR · confidence HIGH — the ⌘K studio-time door has no test, and the spec says it does

`command-bar-log-time.test.tsx` gains a `useOrganizations` mock and `let mockStudios: … = []` with the comment *"the internal-door case seats her."* `mockStudios` is **never reassigned** and there is no internal-door case in the file. So the ⌘K "Studio time — no document" option, its held pill, its `projectId: null / studioId / source:'internal'` payload and its `valid` gate are covered by nothing but the live browser pass. The Hours add row got three proper cases; the ⌘K door got a comment. Either add the case the comment promises or delete the comment.

---

### W7-R1-08 · MINOR — ruling owed · confidence HIGH — a member in two studios cannot say which one her internal hour belongs to

`use-viewer-studio.ts` `useInternalTimeStudio` filters to `type === 'design_studio' && role !== 'guest'`, sorts by name then id, and returns `candidates[0]`. A member seated in two design studios gets the alphabetically-first one, silently, on both doors, and the option reads only "Studio time — no document". Her admin hour lands on a studio she did not name and whose owner/admin can then read it (`internal_time_owner_admin_read`, 00612).

The determinism is deliberate and correct as far as it goes (the comment says so). Which studio, when there is more than one, is a question nobody has answered. Cheapest honest shapes: name the studio in the option's label, or offer one option per studio.

---

### W7-R1-09 · MINOR · confidence MEDIUM — auto-start now waits behind a second network read with a ~7s worst case

`hold` awaits `autostartDeclined()` — `qc.fetchQuery(timeAutostartKeys.preference)` → `auth.getUser()` + a `profiles` select — **before** `automaticBillableIntent`, inside the serialised `enqueue` chain. The portal's default query retry (`lib/react-query.ts:179-193`) retries network errors 3× with 1s/2s/4s backoff, so a flaky read delays the automatic timer by up to ~7 seconds and holds every queued act behind it. Before W7 only the authority read gated the start.

The failure *direction* is right (`catch → false`, auto-start stands). The latency is new. §0.22 protects the zero-tap path; its letter is about required fields on the stop payload, so this is not a breach — but it is the zero-tap path getting slower, and it was not named. A short race (`Promise.race` with a ~1s fallback to `false`) or `retry: false` on this one query would close it.

---

### W7-R1-10 · MINOR · confidence HIGH — an errored preference read re-serves the one-time disclosure

`useTimeAutostartPreference` sets `isSettled: query.isSuccess || query.isError` and, on error, reports `optedOut: false, disclosedAt: null`. The band's gate is `held && settled && !optedOut && disclosedAt === null`, so a transient read failure shows the one-time sentence to a member who has already read it, and fires `time_autostart_disclosed` again. Server-side the re-stamp is harmless (`.is('time_autostart_disclosed_at', null)`), but "appears once and never again" is the ruling's own test and the event count stops answering the column's question. Gate the band on `query.isSuccess`, not on `isSettled`.

Related and smaller: if the stamp mutation fails, `stamped.current = true` blocks any retry for the rest of the mount and there is no error surface — the band just stands.

---

### W7-R1-11 · MINOR · confidence HIGH — the studio/member/project DETAIL ledger does not group internal hours, though the commit says it does

`3f7df185d`'s body: *"In the ledger the studio's own hours stand under their own `— internal —` band, never folded in among a client's."* True of the mine-scope list (`:1224-1250`) and of W2's rollup band (`:1595`). Not true of `ScopeEntryRow` (`:1744`), which renders every scoped row in one list and only relabels an internal one "Studio time". Same row then prints `priced by <studio name>` (`:1818`) for an hour nothing priced — `row.studio_id` is set on an internal hour, so the "no pricing studio" arm never fires and the line claims a pricing that does not exist.

Provenance itself is safe: `timeRateProvenance` (`authority-hours.ts:152`) returns `nonbillable` before it can return `pending`, so no false "rate pending" and no spurious `time_rate_unresolved` from the scoped rows. I checked that specifically.

---

### W7-R1-12 · NOTE · confidence HIGH — `upsert_design_services_draft` is a second, unvalidated door onto `roster_role`

`00578:1645` `upsert_design_services_draft` calls `_project_agreement_terms(p_proposal_id, p_terms, p_rates, false)` with caller-supplied `p_rates`, and `_project_agreement_terms` now writes `roster_role` from `v_rate->>'rosterRole'`. It carries **neither** of the two checks 00618 grafted into `upsert_agreement_parts` — the four-value validation (the column CHECK still bounds it, at a 23514 rather than the room's sentence) and, the one that matters, **no one-rate-per-role check**, so two cards could share a binding and strand the hour at `count(*) = 2` exactly as HT-4 describes.

Unreachable today: its only portal caller `useSaveServiceAgreement` (`use-commercial-documents.ts:466`) has no call site outside a test mock (the seven-facet room was deleted), and it sends no `rosterRole`. Record it so the next hand that revives that door does not revive the defect with it.

---

### W7-R1-13 · NOTE — `rosterRoleLabel` (`part-kinds.ts:442`) is exported and has no caller anywhere. Dead on arrival.

### W7-R1-14 · NOTE — `SOURCE_LABEL` (`hours-ledger.tsx:101-105`) has no `'internal'` key, so an internal row's metadata line prints the raw `internal` beside "no document · non-billable". Readable, redundant. (`command_bar` and `field_manual` have the same pre-existing gap — W3's and W6's, not W7's.)

### W7-R1-15 · NOTE — plan §8's portal cites were stale at authoring: `service-agreement-drafting-room.tsx:234-241` / `:238` does not exist on `origin/main` either (the file is 70 lines). The impl named this in its commit body and its report. Recorded so the ship report does not read §8's Done-when #3 (`grep "Principal designer"`) as proof the default is fixed — it is not, per W7-R1-01.

---

## Rulings check

| Ruling | Verdict |
|---|---|
| **HT-4** (enum binding, no free text) | delivered at the drafting room and through the whole signed rail; **not** delivered at the studio-defaults seed (W7-R1-01) |
| **HT-41** (two-role card, the member picks) | delivered — al4 measures the pick deciding the BOUND card; `(rate_source, rate_role)` pair recorded |
| **HT-11** (billable explicit at every surface) | respected: internal is the one path where the pill says the answer rather than asking, because 00610's CHECK makes it the only answer. The reason is printed |
| **HT-26** (never a blank; "rate pending" a fact) | respected, and correctly suppressed for internal, where a pending alarm would have no answer |
| **HT-35** | delivered: per member, cross-device, default on, disclosed once, falls back to a one-tap manual start that opens the SAME clock as `timer_manual`. Gaps are W7-R1-03/04/06/10 — none of them contradicts the ruling |
| **HT-15** (W4's portal half) | delivered at both desk doors; the studio choice for a multi-studio member is unruled (W7-R1-08) |
| **HT-39** | correctly untouched — `useUpdatePhaseEstimates` still present, no migration minted |
| **P-5** (no flags) | holds — no `useFeatureFlag`, no `ComingSoon`, nothing gated |
| **P-4** (no backfill) | holds — the 00618 normalisation touches `proposal_service_rates` only, unambiguous rows only, and a postcondition asserts no snapshot row was written. No `project_time_entries` row re-priced |
| **§0.12** (invoiced lock untouched) | holds — no wave file touches `guard_invoiced_time_entry` |
| **HT-36** (notes never in a rollup) | untouched by this wave |
| **Vision §4/§6** | no dashboard, no tab, no badge, no colour state, no per-second motion, no daily nudge. The opt-out fallback band is an affordance, not a nudge — though see W7-R1-03 on its placement |
| **House sheet §A** | two deviations: the 43px `<Select>` (impl-disclosed) and the ~21px checkbox (W7-R1-04); one inline font-size in new code (W7-R1-05) |

## What I did NOT verify

- **No browser pass.** I did not start a dev server; every 390/1440 figure in `W7-impl.md` is the impl's own, unreplicated. W7-R1-03 and W7-R1-04 are read off the CSS, not measured on screen.
- **No e2e.** `playwright.config.ts` hard-pins port 3000 and `:54321` — both forbidden to this lane, as the impl said.
- **Prod not touched.** Nothing was pushed to Strata; `00618`/`00619` exist only locally and on the lane branch.
- **iOS untouched** (correctly — W7 carries none).
- The six commercial and two rls failures were matched to `KNOWN_FAILURES.md` **by name**, not by cause; I did not confirm each still fails for its documented reason.
