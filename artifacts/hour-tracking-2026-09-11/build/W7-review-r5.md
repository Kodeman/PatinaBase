# W7 — adversarial review, round 5

**Not clean.** One **major**, three **minors**, seven **notes**, all new this round; plus the seventeen findings round 4 deferred, re-confirmed open. **Every one of round 4's eleven named fixes is closed, and each was verified independently** — three of them by probing the live function through RLS on the reset stack rather than by reading the fix report. **Every gate the brief names was run in this context and is green** against the documented baselines.

The major and two of the minors are all one thing: **the `Remove` control round 4 added to the composer's rate card was never measured**, and fix-r4 said so in its own "What I did NOT verify" ("That is a static argument, not a measurement"). Measured here at 390 in the galley's real container, the third grid column takes **half the role picker's width** and clips three of the four role names; the same act also ships at 30px against §A's 44px floor and removes a row without re-indexing `sortOrder`.

**Branch** `hour-tracking/portal` @ `1626d6430`, thirteen commits ahead of `origin/hour-tracking/integration` @ `fd28a9542`, `hour-tracking/portal == origin/hour-tracking/portal`. Worktree **clean** at the end of this review (checked outside the sandbox — a sandboxed `git diff` reports eight `.env.example` files as deleted purely because it may not read them). `supabase/config.toml` never staged.

---

## Gates — run in this context, verbatim, on the isolated stack (`patina-hours`, 127.0.0.1:54422)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **clean, exit 0.** `00618` and `00619` applied; "Finished supabase db reset"; the only line matching `error` in 1 100 lines of log is the filename `00458_sms_message_error_capture.sql` |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green, 0 unexpected.** `time_entry_ledger_test.sql` (HT-13-a case (f)) and `time_rate_resolution_test.sql` (case (al)) both PASS |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H …` | **9 green / 16, 7 unexpected — all seven named in `supabase/tests/KNOWN_FAILURES.md`.** Run at **01:55 UTC**, inside `direct_order_attribution_test.sql`'s documented 00:00–02:00 window (`KNOWN_FAILURES.md:114`), so seven is this window's baseline, not six. `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` **green with their W7 asserts.** One of the seven fails for a different reason than documented — W7-R5-09 |
| `run-sql-tests.sh -d …/supabase/tests/rls -H …` | **29 green / 31, 2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`). `internal_time_test`, `time_entry_admin_write_test`, `time_entry_studio_stamp_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_hours_total_test` all PASS |
| `pnpm --dir …/agent-portal --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal test -- document-time-provider time-capture-date command-bar-log-time hours-ledger-add-row hours-ledger-scope part-editor-role-picker part-editor readiness agreement-defaults-card use-time-tracking` | **13 suites / 284 tests, all pass** (`discovery-readiness`, `readiness-turnkey`, `time-capture-date`, `readiness-voice`, `readiness`, `use-time-tracking-authority`, `part-editor-role-picker`, `part-editor`, `hours-ledger-add-row`, `agreement-defaults-card`, `hours-ledger-scope`, `document-time-provider`, `command-bar-log-time`) |
| `pnpm --dir …/agent-portal --filter @patina/supabase test` | **102 files / 1259 tests pass, 12 skipped** — this is where `use-time-tracking.test.ts` (W7-R4-07's four new cases) actually runs; the designer jest pattern does not reach it |
| `pnpm --dir …/agent-portal --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — identical count to rounds 2–4, all pre-existing "Unused eslint-disable directive" |
| `pnpm --dir …/agent-portal --filter @patina/admin-portal build` | **✓ Compiled successfully in 19.4s** (§0.24 type-integrity gate) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir …/agent-portal db:generate` → `git diff --exit-code database.types.ts` | **regenerated, diff clean** (§0.19) |
| `python3 …/agent-portal/scripts/generate-legacy-grants.py` → `git diff --exit-code seed/00-legacy-grants.sql` | **regenerated, diff clean** — 2 648 statements (§0.20) |
| migration-number collision sweep across every local + remote ref | `00618` / `00619` held by `hour-tracking/portal` alone |
| worktree / commit hygiene | clean; thirteen Conventional-Commit subjects; `config.toml` unstaged; no `git add -A` residue |

---

## Round-4 fixes — each verified independently

| r4 finding | Verdict | How it was verified here |
|---|---|---|
| **W7-R4-01** MAJOR (five-row card unsendable, no way out) | **CLOSED — and it introduced three new findings.** `RateCardEditor` gains a per-row `Remove` (`part-editor.tsx:512-522`) in `ListEditor`'s grammar; `rateCardForSave` slices the studio card to `ROSTER_RATE_ROLES.length`. Six picker cases + one defaults case, all green | read end to end; both new acts **measured** at 390/1024/1440 — see **W7-R5-01/-02/-03/-04** |
| **W7-R4-05 / HT-13-a** MAJOR, ruling-gated | **CLOSED.** `startedAtFromDateValue` returns `Date.UTC(y, m-1, d, 12, 0, 0, 0)`; it is the only helper both date-only doors reach (grepped: `hours-ledger.tsx:574`, `log-time-sheet.tsx:210`, plus the two `backdated` reads). SQL case (f) and the jest file exist and pass. `rulings.md:20` carries the **HT-13-a** row, dated 2026-09-13, naming both pins. The stale "KNOWN, UNRULED" comment is replaced | ruling row read; helper read; case (f) and `time-capture-date.test.ts` read and run; residuals recorded as **W7-R5-05/-06/-07** |
| **W7-R4-09** (two error paths re-serve the sentence) | **CLOSED.** `useTimeAutostartPreference` returns `disclosureRead = query.isSuccess`; `AutostartBand`'s `undisclosed` reads `stampKnown`, not `settled`; `useMarkTimeAutostartDisclosed` gains `retry: 2`. The fallback band correctly keeps `settled` (it is gated on `optedOut`, which fails closed) | walked the whole band: a failed read leaves `undisclosed` false, so no stamp, no analytics, no sentence — and the clock still opens. Two provider cases green |
| **W7-R4-10** (`resume` ignored the opt-out) | **CLOSED.** `resume()` asks `autostartDeclined()` before `automaticBillableIntent`; `autostartDeclined` joined the dep array. Walk-the-path case (decline → `startManually` → `pause` → `resume`) asserts no timer AND the one-tap band back on the page; negative control asserts a member who never declined still resumes on `timer_auto` | read `resume` + `hold` side by side; both cases green |
| **W7-R4-11** (retry ladder in front of the clock) | **CLOSED.** `retry: false` on the `fetchQuery`; the read now starts *before* `enqueue(...)` in both `hold` and `resume` and is awaited inside. Safe because `autostartDeclined` catches and fails closed, so the floating promise cannot reject | read both call sites; dep arrays correct |
| **W7-R4-15** (`_project_agreement_terms`'s unguarded door) | **CLOSED — and PROBED through the function on the reset stack.** Bad role → `check_violation`, *"Principal designer is not a role the studio roster carries"*; the same role twice → *"the rate card prices lead_designer twice"*; a good card writes `Principal designer=lead_designer \| Associate=NULL \| Bkpr=bookkeeper`. Section banner corrected to "Two deltas" | direct `PERFORM public._project_agreement_terms(...)` under `app.agreement_projection`, three cases |
| **W7-R4-07** (an internal hour invalidates nothing) | **CLOSED.** `invalidateStudioTime` covers `timeKeys.all`, `studioUnbilled()` and a new `weekEntries()` prefix; `invalidateProjectTime` calls it; all three mutations call it on the project-less branch. The prefix genuinely matches the Hours sheet's key — `["document-hours-week", weekOffset, lensProjectId]` | read the key at `hours-ledger.tsx:258` against `timeKeys.weekEntries()`; four vitest cases green in the 1 259-test run |
| **W7-R4-12** (raw enum in the ledger) | **CLOSED.** All nine of `00595`'s values are in `SOURCE_LABEL`; `command_bar` and `internal` both read "typed" | read; probed the CHECK — `project_time_entries_source_ck` carries exactly those nine |
| **W7-R4-13** (label collision) | **CLOSED on both pickers.** `labelTakenElsewhere` / `agreementLabelTakenElsewhere`; a legacy row may still bind to the role its own label names (the conversion path). One case per picker, plus the negative | read both; cases green |
| **W7-R4-14** (dead export) | **CLOSED.** `rosterRoleLabel` deleted; re-grepped `apps` + `packages`: no reference |
| **W7-R4-08** (the ⌘K door asserted by a comment) | **CLOSED.** `mockStudios` assigned and reset in `beforeEach`; five cases drive the internal door — offered only to a studio member, the write's seven fields including the **noon-UTC `startedAt`**, the disabled pill with its printed reason, no roster sentence and no role chip, and the act enabling without an authority read. The `useMyRateRoles` mock now honours its argument | read the whole block; suite green |

---

## Findings — new this round

### W7-R5-01 · MAJOR · confidence HIGH (**measured**, headless Chromium, the galley's own container) — the composer's role picker loses half its width at 390 and clips three of its four role names

Round 4 changed the rate-card row from `grid-cols-[minmax(0,1fr)_140px]` to `grid-cols-[minmax(0,1fr)_140px_auto]` to seat the new `Remove`. `fix-r4` states plainly that it "did not put a ruler on it". Measured, against the real container chain (`.g-room` → `.g-paper`, transcribed from `galley.css:18-59`: a 720px galley column at ≥1248, 664px at 768–1247, `100% − 32px` below 768) and the app's own compiled `layout.css`:

| width | row | role `<select>` | its text box | rate `<input>` | `Remove` | page overflow-x |
|---|---|---|---|---|---|---|
| **1440** | x=360 w=720 | w=**469** | 418 | w=140 | 84 × **30** | 1440 / 1440 — 0 |
| **1024** | x=180 w=664 | w=**413** | 362 | w=140 | 84 × **30** | 1024 / 1024 — 0 |
| **390** | x=16 w=358 | w=**107** | **56** | w=140 | 84 × **30** | 390 / 390 — 0 |

The same row **without** the third column (the shape at `d516a5658`) measures **205px** at 390 and **567px** at 1440. So the act costs the picker **98px at every width**, which is half of it at 390.

The four option labels and the empty-state prompt, measured in the same font at the same size:

| string | width | fits in 56px? |
|---|---|---|
| `Support designer` | 104px | **no** |
| `Lead designer` | 86px | **no** |
| `Choose a role` | 84px | **no** |
| `Bookkeeper` | 74px | **no** |
| `Vendor` | 44px | yes |

So at 390 the closed picker shows roughly the first half of every label but one, and the unchosen state reads "Choose a" — on the one control HT-4 exists to introduce, at the width the program's hard rules require every changed control to be verified at. Nothing overflows and nothing is unreachable, which is why a reasonable synthesis could take this to MINOR; I file it as major because it is a **regression** in a changed control, at a required width, that the fix round declared unmeasured. It is the same defect class round 4 recorded as a NOTE for the studio picker (W7-R4-28, 111px) — created now on the composer side, and worse.

**Fix, smallest honest shape:** let the row stack below the galley's own 768px breakpoint — `grid-cols-[minmax(0,1fr)_140px_auto] max-[767px]:grid-cols-[minmax(0,1fr)_auto]` with the rate on its own line, or put `Remove` on a line of its own at 390. Either returns the picker to ~205px there.

---

### W7-R5-02 · MINOR · confidence HIGH (code read end to end; not driven) — `Remove` does not re-index `sortOrder`, and `+ Add a role` seeds `sortOrder: roles.length`, so the two together can price one card with two rows at the same position

`part-editor.tsx:517` writes `roles.filter((_, rowIndex) => rowIndex !== index)` — the row goes, the surviving rows keep their old `sortOrder`. `+ Add a role` (`:530-536`) seeds `sortOrder: roles.length`.

Card `[A(0) B(1) C(2) D(3)]` → Remove B → `[A(0) C(2) D(3)]` → `+ Add a role` → **`[A(0) C(2) D(3) E(3)]`**. `upsert_agreement_parts` stores `sortOrder` as given (`COALESCE((v_rate->>'sortOrder')::integer, 0)`, 00618's projection loop), the table has no uniqueness on it, and every reader orders by `sort_order` — including `materialize_standard_parts`'s re-seed and the client-facing projection. Two rows tie, and the rate card the homeowner reads can come back in a different order between two reads of the same signed paper.

**Newly reachable**: before round 4 rows could only be appended, so `sortOrder` was always its index. The studio-defaults side is immune — `rateCardForSave` re-indexes on save — so this is the composer only.

**Fix:** `write(roles.filter(…).map((role, i) => ({ ...role, sortOrder: i })))`, or seed the new row at `max(sortOrder) + 1`.

---

### W7-R5-03 · MINOR · confidence HIGH (**measured**) — the new `Remove` act is 30px tall, below §A's 44px floor, at both widths

Measured **84 × 30px** at 390, 1024 and 1440 (`Button variant="ghost" size="sm"` = `py-[0.45rem]` + `text-[0.78rem]` over `.type-btn-text`'s `line-height: 1` → 7.2 + 12.48 + 7.2 ≈ 27, rendered 30).

It matches its neighbours exactly — `+ Add a role` is 108 × 30 and `ListEditor`'s own Remove is the same `Button`, both pre-existing — so this is the room's grammar, not a departure from it. But round 4's ruling check recorded *"both acts this wave added — `Understood` and `Start the clock` — measure 50px, above the floor"*, and that sentence no longer covers every act the wave added. This is a **fifth** open §A deviation beside the 43px `<Select>`, the 21px/42px opt-out row and the two inline-font-size blocks (W7-R4-17, -18).

---

### W7-R5-04 · MINOR · confidence MEDIUM (code read; not driven) — the studio-defaults trim drops rows by position rather than by bindability, and says nothing

`rateCardForSave` (`account-studio-page.tsx:116-134`) filters blank names, then `.slice(0, ROSTER_RATE_ROLES.length)`. Two consequences:

1. **It drops the tail, not the unbindable row.** A legacy card whose first four rows are unbound free text and whose fifth is the only one carrying a `rosterRole` loses the bound row and keeps four that hold the send. Bindability, not array position, is what makes a row the surplus one.
2. **The row vanishes with nothing said.** `handleSaveAgreementDefaults`'s `onSuccess` re-seeds `agreementForm` from the persisted (trimmed) card, so the fifth row disappears from the page on Save; no sentence anywhere names a four-role cap — the help paragraph at `:1254-1258` speaks only about binding and about rates above zero. `fix-r4` argued the Save being *offered* rather than greyed out is what keeps the trim honest; being offered is not the same as being explained.

The studio card does have its own per-row `Remove` (`:1215-1228`, pre-existing), which is the studio's real escape — so the trim is belt-and-braces, and dropping it entirely is also a defensible answer.

---

### W7-R5-05 · NOTE — ruling owed · confidence HIGH (code read + the shipped comment) — HT-13-a closes the two-days-for-one-hour divergence for date-only entries only; every timer hour still carries it

`hours-ledger.tsx` renders the **`mine`** scope grouped by the member's **LOCAL** day (`:483` `new Date().toDateString()`, `:485`, `:1213`) and the member / project / studio scopes by the fact view's **UTC** `day` (`:1829`, `time_entry_ledger.day = (started_at AT TIME ZONE 'UTC')::date`). Noon-UTC filing makes those agree for a *date-only* hour. A `timer_auto` / `timer_manual` hour carries a real instant, so from 19:00 CDT onward the same hour still reads **Sep 1** in her own Hours list and **Sep 2** in the scope lens, the CSV and the statement — the original W7-R3-02 shape, on the doors HT-13-a does not name.

HT-13-a's own text declines a studio timezone column, so this is a **ruled residual, not a defect**. Recorded because the shipped comment at `time-capture.tsx:282-300` and the `rulings.md` row both read as though the whole divergence is closed, and the ship report should not inherit that reading.

---

### W7-R5-06 · NOTE — ruling scope · confidence HIGH (arithmetic; the band is the ruling's own) — UTC+12/+13 studios fall outside HT-13-a's band and get the divergence back

The ruling fixes the band at **UTC−11 … UTC+11**, and both pins probe exactly those edges (`Pacific/Midway` / `Pacific/Noumea` in case (f) and in `time-capture-date.test.ts`). `Pacific/Auckland` is UTC+12 (+13 in DST) and `Pacific/Apia` is +13: noon UTC on the named day is **00:00–01:00 the next local day** there, so a New Zealand studio's local Hours list and the UTC ledger day differ by one for **every** date-only entry — the exact thing the ruling closes for the US. Inside the ruling as written; named so the band is a decision on record rather than an assumption.

---

### W7-R5-07 · NOTE · confidence HIGH (probed the constraints; not driven) — noon-UTC filing can store `started_at` in the future, and the authority window is asked against it in both directions

`fix-r4` disclosed one direction: an authority whose `effective_at` is later than noon UTC on the day named no longer prices a hour typed for that day (`classify_project_time_entry_authority` filters `effective_at <= NEW.started_at`). The other direction is not disclosed and is the same mechanism:

- **"Today" can now be in the future.** For a studio at UTC+11 logging at 08:00 local, "today" at noon UTC is ~23 h ahead of `now()`; for a US studio before 12:00 UTC it is up to ~11 h ahead. Probed: `project_time_entries` carries **no** constraint refusing a future `started_at` (`\d public.project_time_entries` — nine CHECKs, none on `started_at`), so nothing raises.
- **A rate not yet in effect can price it**, since `effective_at <= started_at` is satisfied early, and **an authority that ENDS earlier today can fail to cover it**, since `ended_at > started_at` is not (`00575:2092-2093`, `00412:2490-2491`).

Narrow (the auto-timer uses server `now()` and is unaffected), arrives from the ruling rather than from a defect, and belongs in the same ship-report line as the disclosed half.

---

### W7-R5-08 · NOTE · confidence HIGH — the studio-card trim currently depends on a bug, and the two must be picked up together

`agreementDefaultsDirty` (`:669-672`) compares `JSON.stringify(rateCardForSave(form.rateCard))` against `JSON.stringify(agreementDefaults.rateCard)`. The stored card comes back through `use-studio-agreement-defaults.ts:63` **unmapped**, and jsonb normalises object keys by length-then-bytewise, so the stored order is `{roleName, sortOrder, rosterRole, hourlyRateCents}` while the mapper builds `{roleName, hourlyRateCents, sortOrder, rosterRole}` — the card reads **dirty whenever it holds one row** (W7-R4-04, pre-existing). That is precisely what makes W7-R4-01's trim reachable: Save is enabled beside the fifth row. Whoever repairs W7-R4-04 with a canonical-order comparison must keep the five-row card reading dirty, or the fifth row survives for ever and the trim never fires. `fix-r4` named this dependency; recorded here as a standing constraint so it does not travel alone.

---

### W7-R5-09 · NOTE · confidence HIGH (measured) — one of the seven documented commercial failures fails for a different reason than the ledger records

`design_services_gap_hardening_test.sql` aborted this run at **`:194`**, `legacy release blocked by the wrong guard: 'schedule line … is not ready for authorization: ["designDisposition"]'`. `supabase/tests/KNOWN_FAILURES.md:100` records its 2026-09-11 shape as **`:128`**, `proposal d6300000-… failed canonical project provenance`, and calls the `:194` shape "Previously". So the file is failing in its older mode again.

Nothing on this branch touches `_create_furnishings_authorization_from_schedule_impl` or that readiness gate, so this is baseline drift in someone else's domain, not a W7 regression — but "all seven documented" is true **by file name** and not **by reason**, and a ship report should say so. (The other six were matched by name; `direct_order_attribution_test.sql` was matched by name *and* by its documented clock window against the measured 01:55 UTC.)

---

### W7-R5-10 · NOTE · confidence HIGH (grepped every ref) — `00617` exists nowhere, so this branch's sequence has a hole in front of its own two migrations

`git log --all --diff-filter=A -- 'supabase/migrations/00617*'` returns nothing. The branch runs …`00616_time_entry_activity_travel.sql`, **gap**, `00618`, `00619`, `00620`. If W6's iOS lane later mints `00617` and it reaches Strata **after** `00618`/`00619` are applied, `supabase db push` meets an out-of-order local migration. Name the intended prod order at integration, or have the W6 lane mint above `00620`.

---

### W7-R5-11 · NOTE · confidence HIGH — a new comment cites a line that moved

`timeKeys.weekEntries`'s doc comment (`use-time-tracking.ts:59-61`) cites `hours-ledger.tsx:239`; the query it mirrors is at `:258`. The key itself is correct — verified against the live `queryKey: ["document-hours-week", weekOffset, lensProjectId]`.

---

## Carried from round 4 — re-confirmed open, none addressed

`fix-r4` scoped itself to the twelve the brief named and deferred the rest. Each below is unchanged on the branch at `1626d6430`.

| # | Sev | Re-checked this round |
|---|---|---|
| **W7-R4-02** | NOTE | Measurement only, and it passed. Nothing to do — but see **W7-R5-01**: its "every changed control is reachable at 390 and 1440" no longer covers the controls round 4 itself changed |
| **W7-R4-03** | NOTE | Confirmed: seven, not six, measured at 01:55 UTC. One line for the ship report. Now also **W7-R5-09** |
| **W7-R4-04** | NOTE | Re-read `:644` / `:669-672` and `use-studio-agreement-defaults.ts:63` — unchanged, pre-existing. See **W7-R5-08** |
| **W7-R4-06** | MINOR | Re-read `00618:622-627`: only an ABSENT or JSON-null `hourlyRateCents` raises; `_agreement_assert_cents` accepts `0`. A bound card at $0 still wins tier 1 and is invoice-frozen at $0. Unchanged |
| **W7-R4-16** | NOTE — ruling owed | The standing 94px fallback strip at 390. Placement question, not a defect. Unchanged |
| **W7-R4-17** | MINOR | Re-read `hours-ledger.tsx:1245`: the `— internal —` band is still `font-mono text-[11px] uppercase tracking-[0.07em]` beside a `t-head` sibling. Unchanged |
| **W7-R4-18** | MINOR — ruling owed | Re-read `account-profile-page.tsx:175-225`: the opt-out `<label>` carries no min-height, and the block still carries `text-[15px]`, `text-[11.5px]`, `text-[13px]`. Unchanged |
| **W7-R4-19** | MINOR — ruling owed | `useInternalTimeStudio` (`use-viewer-studio.ts:85-101`) still returns `candidates[0]` after a name-then-id sort; a two-studio member cannot choose. Unchanged |
| **W7-R4-20** | MINOR — ruling owed | Already-countersigned authorities go on stranding; deviation 1 (signed paper is not renormalised) is correct and stated only in `00618`'s banner. Unchanged |
| **W7-R4-21** | MINOR — ruling owed | **Re-probed as the actor on the reset stack**: studio-mate `a0000000-…-0003` reads `a0000000-…-0004`'s profile — **1 row, `time_autostart_opt_out = t`**. Writes correctly own-row only (**0 rows affected**). Column defaults re-probed: `time_autostart_opt_out NOT NULL DEFAULT false`, `time_autostart_disclosed_at` nullable. HT-35 is silent on privacy |
| **W7-R4-22** | NOTE | `UNBOUND_ROLE_BLOCKER` + `ZERO_RATE_BLOCKER` hold `send` on every in-flight legacy draft on ship day. One ship-report line, one line for Leah. Unchanged |
| **W7-R4-23** | NOTE — ruling owed | `part-kinds.ts:420-431` still promises label and role "move independently"; `RateCardEditor` has no text input for `roleName` at all, so the composer cannot rename. Unchanged |
| **W7-R4-24** | NOTE | Confirmed by grep: `00618` carries two sections numbered `(6)` — `classify_project_time_entry_authority` at `:1447` and `materialize_standard_parts` at `:1869` |
| **W7-R4-25** | NOTE | The defaults card still saves a bound role at $0; the refusal arrives one surface later. Interacts with W7-R4-06. Unchanged |
| **W7-R4-26** | NOTE | `design_services_authority_test.sql` FAILED again this round before its first authority assert; case (al) lives in `billing/time_rate_resolution_test.sql`, which is green. Correct call |
| **W7-R4-27** | NOTE | `@patina/types` is dist-resolved and `dist/` is gitignored; `infra/deploy-portal.sh` rebuilds dists. No action |
| **W7-R4-28** | NOTE | The studio-defaults picker at 390. Its row shape is unchanged by round 4 (`minmax(0,1fr) 120px auto`, Remove already present). In a generic 358px row it measures 176px — but I did **not** reproduce the account page's own container, so round 4's 111px stands as the number of record. Either way it is superseded in severity by the composer's measured 107px (**W7-R5-01**) |

---

## Rulings check

| Ruling | Verdict |
|---|---|
| **HT-4** (enum binding, no free text) | **delivered** on every door — composer, studio defaults, both seeds, both save doors (`upsert_agreement_parts` **and**, now, `_project_agreement_terms`, probed), both pricing legs, the countersign carry, and a send-blocking sentence. Escapable on a card already composed (Remove). Open: W7-R4-20 (countersigned authorities), W7-R5-01/-02/-03/-04 (the escape's own shape) |
| **HT-41** (two-role card, the member picks) | **delivered** — `time_rate_resolution_test.sql` case (al) green in the 9/9 billing run: (al1) a bound lead card prices and **binds**; (al2) the new hire at 11000/22000/`authority`/`authorized`; (al3) a legacy label-only card still resolves; (al4) two bound roles, neither label matching, the member's pick decides the bound card |
| **HT-13 / HT-13-a** | **HT-13-a delivered and recorded.** `rulings.md:20`, dated 2026-09-13; one SQL case (billing case (f), both edges of the band) and one jest case (`time-capture-date.test.ts`, noon UTC from both ends of the day, a leap day, a year boundary, the `now` fallback), exactly as the orchestrator instructed. No studio timezone column added. Residuals: **W7-R5-05** (timer hours), **W7-R5-06** (UTC+12/+13), **W7-R5-07** (future `started_at`) |
| **HT-35** | **delivered**: per member, cross-device, on `profiles`, default ON (probed `NOT NULL DEFAULT false` on the opt-OUT), disclosed once and now **surviving an errored read**, opt-out on her own profile, falling back to a one-tap start on the same clock, and the opt-out honoured at `hold` **and** `resume`. Open: W7-R4-16 (standing strip), W7-R4-18 (21px row), W7-R4-21 (readable by studio-mates) |
| **HT-15** (W4's portal half) | **delivered** at both desk doors and in the `— internal —` group; the ⌘K door is now **measured** (five cases) rather than asserted by a comment, and an internal hour now invalidates the studio reads. Open: W7-R4-19 (multi-studio choice) |
| **HT-11 / HT-26 / HT-36 / §0.23** | respected, unchanged from round 4's reading |
| **HT-39** | correctly untouched — `useUpdatePhaseEstimates` present, no migration minted, `00620` spent by W2 |
| **P-5** (no flags) | **holds** — `grep -rn "useFeatureFlag\|ComingSoon"` finds nothing this wave gates; `account-studio-page.tsx`'s `studio-workspaces` flag is pre-existing and untouched |
| **P-4** (no backfill, no hour re-priced) | **holds** — the normalisation touches `proposal_service_rates` and `studio_agreement_defaults` only, unambiguous rows only, with a postcondition asserting no `project_billing_authority_rates` row was written; no `project_time_entries` row is read or re-priced |
| **§0.12** (invoiced lock untouched) | **holds** — nothing on this branch touches `guard_invoiced_time_entry` |
| **§0.19 / §0.20** | **holds** — both regenerate clean from the worktree's own copies, proven by `git diff --exit-code` |
| **§8 Done-when** | met: a default two-role bound card prices a new hire at `rate_source='authority'` (case (al2)); a legacy label-only card still prices (al3); `grep -rn "Principal designer" apps/designer-portal/src packages` returns **comments only** — no production default seed anywhere (`service-agreement-drafting-room.tsx` no longer carries a rate seed at all; the Galley superseded it) |
| **House sheet §A** | **five deviations, all open**: the 43px `<Select>` (impl-disclosed, a shared control), the 21px/42px opt-out row, the profile block's three inline font sizes (W7-R4-18), the ledger band's inline font size (W7-R4-17), and — new — the 30px `Remove` (**W7-R5-03**) |

---

## What I did NOT verify

- **No signed-in browser walk.** The 390/1024/1440 evidence is a CSS-accurate harness in headless Chromium loading the portal's own compiled `layout.css` (375 KB) with the galley's container rules transcribed from `galley.css:18-59` and the components' markup copied verbatim. It measures **layout**, which is what the rule is about; React behaviour in the live room is covered by the jsdom suites. The harness lives in the session scratchpad; nothing was written into the repo and no dev server was started (ports 3000/3002 never touched, nothing left listening).
- **No e2e.** `apps/designer-portal/playwright.config.ts` hard-pins `webServer` to port 3000 and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` — the peer program's port and the shared stack, both forbidden to this lane.
- **Prod not touched.** `00618` / `00619` exist only locally and on the lane branch. I did not read Strata's `studio_agreement_defaults` rate-card row counts, which is the reachability question behind W7-R5-04 and the exposure behind W7-R4-20.
- **W7-R5-01's container is transcribed, not the live DOM.** The galley's own stylesheet is not in the compiled `layout.css` (it is the room's chunk), so I reproduced its three breakpoint rules by hand. The **delta** — the third column costs the picker 98px at every width — is container-independent and exact; the absolute 107px depends on my transcription being right.
- **W7-R5-02 was not driven.** I read the two handlers and the projection's `sortOrder` handling; I did not compose a card, remove a middle row, add a fifth and read back `proposal_service_rates`.
- **The other six documented commercial failures and both documented RLS failures** were matched to `KNOWN_FAILURES.md` by name and count. I chased only the seventh (`direct_order_attribution_test.sql`, by its clock window) and `design_services_gap_hardening_test.sql` (which is why W7-R5-09 exists); I did not confirm each of the remaining six still fails for its own documented reason.
- **The full designer suite was not run** — only the thirteen suites the brief's pattern reaches (284 tests). `fix-r4` reported 581 suites / 7 440 tests with one unreproduced `waitFor` flake; I neither reproduced nor cleared that flake.
- **iOS untouched** (correctly — W7 carries none). HT-13-a's third named door, the Field sheet when backdated, still files at the device's local time of day; it is W6's lane and this program cannot reach it.
