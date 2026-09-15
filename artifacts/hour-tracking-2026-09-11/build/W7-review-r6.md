# W7 — adversarial review, round 6

**Not clean.** One **major**, seven **notes** new this round; plus round 5's three minors and seven notes, **all re-confirmed open** (only `W7-R5-01` was in the fix brief), and round 4's seventeen carried findings unchanged.

`W7-R5-01` is **CLOSED**, and I closed it by **my own independent measurement** rather than by reading `W7-fix-r5.md`: a separate harness, built in this context from the app's own `tailwind.config.ts` compiled against `globals.css` and `galley.css` copied verbatim, reproduces the fix report's numbers to a tenth and confirms the shape. **Every gate the brief names was run in this context and is green** against the documented baselines.

The one major is the **other** role picker. The fix round repaired the composer's card and left the studio-defaults card — the second surface this wave converted from free text to a `<Select>` — measured here in its real container chain at **390: a 120px picker with a 68.5px text box**, which clips four of its five strings including the unchosen prompt. Round 5 carried it as a NOTE (`W7-R4-28`) at a figure it said it had **not** reproduced in the account page's own container. Reproduced now, it is the same defect class the fix round just called major on the sibling surface.

**Branch** `hour-tracking/portal` @ `337564357`, fourteen commits ahead of `origin/hour-tracking/integration` @ `fd28a9542`; `hour-tracking/portal == origin/hour-tracking/portal`. Worktree **clean** (checked outside the sandbox — a sandboxed `git status` reports eight `.env.example` files it may not read). `supabase/config.toml` untouched on this branch.

---

## Gates — run in this context, verbatim, on the isolated stack (`patina-hours`, 127.0.0.1:54422)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **clean, exit 0.** `00618`, `00619`, `00620` applied; "Finished supabase db reset"; zero lines matching `error`/`fail`/`rollback` in 606 lines of log once the filename `00458_sms_message_error_capture.sql` is excluded |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green, 0 unexpected.** `time_entry_ledger_test.sql` (HT-13-a case (f)) and `time_rate_resolution_test.sql` (HT-41 case (al)) both PASS |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H …` | **10 green / 16, 6 unexpected — all six named in `supabase/tests/KNOWN_FAILURES.md`.** Run at **02:22 UTC**, *outside* `direct_order_attribution_test.sql`'s documented 00:00–02:00 window, which is why it is six here and seven in round 5. `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` **green with their W7 asserts.** I re-ran all six individually and read each abort: **two of the six fail for a reason the ledger does not record** — `design_services_gap_hardening_test.sql` (**W7-R5-09**, re-confirmed) and `trade_rfq_test.sql` (**W7-R6-02**, new) |
| `run-sql-tests.sh -d …/supabase/tests/rls -H …` | **29 green / 31, 2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`). `internal_time_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_hours_total_test` all PASS |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, exit 0) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --filter @patina/designer-portal test -- document-time-provider time-capture-date command-bar-log-time hours-ledger-add-row hours-ledger-scope part-editor-role-picker part-editor readiness agreement-defaults-card use-time-tracking-authority agreement-composer` | **18 suites / 357 tests, all pass** |
| `pnpm --filter @patina/designer-portal test` (full) | **581 suites / 7 440 tests pass**, 1 snapshot, 0 failures, 26.2 s — the `waitFor` flake `fix-r4` reported did **not** reproduce here |
| `pnpm --filter @patina/supabase test` | **102 files / 1 259 tests pass, 12 skipped** — where `use-time-tracking.test.ts`'s four W7-R4-07 cases actually run; the designer jest pattern does not reach them |
| `pnpm --filter @patina/designer-portal lint` | **0 errors, 201 warnings** — identical count to rounds 2–5, all pre-existing "Unused eslint-disable directive" |
| `pnpm --filter @patina/admin-portal build` | **exit 0, compiled successfully** (§0.24 type-integrity gate) |
| `SUPABASE_DB_URL=…:54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **regenerated, diff clean** (§0.19) |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's own** copy) → `git diff --exit-code seed/00-legacy-grants.sql` | **regenerated, diff clean** — 2 648 statements (§0.20). §0.20's grep names 14 files under `006*`; `00618` and `00620` are among them |
| migration-number sweep across **every** ref (`git log --all --diff-filter=A`) | `00618` / `00619` / `00620` held by hour tracking alone; `00617` exists on no ref (**W7-R5-10**, open); the peer program starts at `00621` |
| worktree / commit hygiene | clean; fourteen Conventional-Commit subjects; `config.toml` never staged; no `git add -A` residue |

---

## Probes the brief names — each run here, not read off a fix report

| Probe | Verdict |
|---|---|
| **a five-role card can be trimmed and sent** | **PASS.** `RateCardEditor` carries a per-row `Remove` (`part-editor.tsx:519-528`); `rateCardForSave` (`account-studio-page.tsx:105-134`) trims the studio card to four on save. Six picker cases cover it, including "takes the last row off the card rather than stranding a one-row blocker". Residuals: **W7-R5-02**, **W7-R5-04**, **W7-R6-03** |
| **a two-role card binds and resolves** | **PASS.** `time_rate_resolution_test.sql` case (al) green in the 9/9 billing run — a bound lead card prices AND binds; a new hire at `rate_source='authority'`; a legacy label-only card still resolves; two bound roles decided by the member's own `rate_role` pick (HT-41) |
| **`_project_agreement_terms` refuses a bad rosterRole** | **PASS — probed directly through the function** on the reset stack, against a draft proposal (`b3900000-…-0002`; the guard `guard_commercial_authored_child` refuses a non-draft first, so a non-draft probe proves nothing — an earlier attempt of mine caught exactly that false positive). Four cases: `principal_designer` → *"Principal designer is not a role the studio roster carries"*; `lead_designer` twice → *"the rate card prices lead_designer twice"*; four bound roles written; a legacy label-only card written with `roster_role` NULL |
| **a date-only entry lands at noon UTC and the ledger names the same day** | **PASS.** `startedAtFromDateValue` returns `Date.UTC(y, m-1, d, 12, 0, 0, 0)` and is the **only** helper both date-only doors reach (grepped: `hours-ledger.tsx:574`, `log-time-sheet.tsx:210`, plus the two `backdated` reads). SQL case (f) asserts the ledger day **and** the local calendar day at `Pacific/Midway` (−11) and `Pacific/Noumea` (+11); the jest file pins noon UTC from both ends of the day, a leap day, a year boundary and the `now` fallback. `rulings.md:20` carries the HT-13-a row dated 2026-09-13. Residuals: **W7-R5-05/-06/-07**, **W7-R6-06** |
| **the disclosure shows exactly once incl. across an errored read** | **PASS.** `useTimeAutostartPreference` returns `disclosureRead = query.isSuccess`; `AutostartBand`'s `undisclosed` reads `stampKnown`, not `settled`; the fallback band correctly keeps `settled` because it is gated on `optedOut`, which fails closed. Walked end to end: a failed read ⇒ no sentence, no stamp, no analytics — and the clock still opens. Two provider cases green; the analytics emitter is additionally per-session latched (`autostartDisclosedSeen`) |
| **an opted-out member never gets a `timer_auto` from `hold()` OR `resume()`** | **PASS.** Both call `autostartDeclined()` — started outside the serialised lane, awaited inside, `retry: false`, failing closed to `false`; `autostartDeclined` is in both dep arrays. The walk-the-path case (decline → `startManually` → `pause` → `resume`) asserts no timer AND the one-tap band back on the page; the negative control asserts a member who never declined still resumes on `timer_auto`. The floating promise cannot reject (the helper catches), so holding it across `enqueue` is safe |
| **an internal hour refreshes the studio view** | **PASS.** `invalidateStudioTime` covers `timeKeys.all`, `studioUnbilled()` and the `weekEntries()` prefix; all three mutations call it on the project-less branch and `invalidateProjectTime` calls it too. The prefix genuinely matches the Hours sheet's live key — verified against `queryKey: ["document-hours-week", weekOffset, lensProjectId]` at `hours-ledger.tsx:258`. Four vitest cases green |
| **every changed control reachable at 390 and 1440** | **FAILS on one control** — the studio-defaults role picker, **W7-R6-01**, measured. The composer's picker now **passes** (see below) |

---

## Round-5 findings — disposition

| r5 finding | Sev | Verdict this round |
|---|---|---|
| **W7-R5-01** composer's role picker loses half its measure at 390 | MAJOR | **CLOSED — verified by independent measurement, not by reading the fix.** See the table below. `fix-r5`'s correction of the review's container is **right**: the row sits in `.g-fold`, one box inside `.g-paper`, whose 1px border + 24px `--module` leave **308px** at 390, not 358 (`galley.css:282-288`; `.g-fold` at `:343-347` adds no horizontal padding). My harness reproduces `fix-r5`'s figures to a tenth |
| **W7-R5-02** `Remove` does not re-index `sortOrder`; `+ Add a role` seeds `sortOrder: roles.length` | MINOR | **OPEN, re-confirmed by reading.** `part-editor.tsx:526` still writes `roles.filter((_, i) => i !== index)` with no re-index; `:544` still seeds `sortOrder: roles.length`. `[A0 B1 C2 D3]` → Remove B → `+ Add a role` → `[A0 C2 D3 E3]`. Not in the fix brief |
| **W7-R5-03** the `Remove` act is 30px against §A's 44px floor | MINOR | **OPEN, re-measured here: 30.2px** at 390, 1024 and 1440. Not in the fix brief. Now joined by a **sixth** deviation (W7-R6-05) |
| **W7-R5-04** the studio-defaults trim drops by position, not bindability, and says nothing | MINOR | **OPEN, re-confirmed.** `rateCardForSave` still `.slice(0, ROSTER_RATE_ROLES.length)` after a blank-name filter. Not in the fix brief |
| **W7-R5-05** HT-13-a closes the divergence for date-only hours only | NOTE — ruled residual | **OPEN.** `hours-ledger.tsx` still groups the `mine` scope by the member's LOCAL day and every other scope by the fact view's UTC `day`. Ruled residual, not a defect; one ship-report line |
| **W7-R5-06** UTC+12/+13 studios fall outside the ruled band | NOTE — ruling scope | **OPEN.** Arithmetic unchanged; both pins probe exactly UTC−11 / UTC+11 |
| **W7-R5-07** noon-UTC filing can store a future `started_at` | NOTE | **OPEN.** Re-probed: `project_time_entries` carries nine CHECKs, **none** on `started_at` |
| **W7-R5-08** the studio trim depends on the W7-R4-04 dirty-check bug | NOTE | **OPEN.** `agreementDefaultsDirty` still compares `JSON.stringify(rateCardForSave(...))` against the unmapped stored card |
| **W7-R5-09** one documented commercial failure fails for a different reason | NOTE | **OPEN, re-measured.** `design_services_gap_hardening_test.sql` aborts at **`:194`**, *"legacy release blocked by the wrong guard … ["designDisposition"]"*; `KNOWN_FAILURES.md:100` records `:128`, *"failed canonical project provenance"*, and calls `:194` "Previously" |
| **W7-R5-10** `00617` exists nowhere | NOTE | **OPEN, re-swept across every ref.** …`00616`, **gap**, `00618`, `00619`, `00620`, then the peer's `00621` |
| **W7-R5-11** a new comment cites a line that moved | NOTE | **OPEN.** `use-time-tracking.ts:59-61` still cites `hours-ledger.tsx:239`; the query is at `:258`. The key itself is correct |

### The composer's picker, re-measured independently

Harness built in this context: the app's own `tailwind.config.ts` (content repointed at my markup only), compiled by `tailwindcss 3.4.19` against the portal's `src/app/globals.css`, plus `galley.css` copied **verbatim** (not transcribed), the real DOM chain `.g-page > .g-room > .g-paper > .g-part > .g-fold`, and the `Select`/`Input` class strings read out of `components/ui/controls/`. Playwright chromium 1.58.2.

| viewport | `.g-fold` | role `<select>` | its text box | rate | row height | overflow-x |
|---|---|---|---|---|---|---|
| **390** | 308.0 | **308.0** | **256.5** | 140 | 99.4 (two lines) | 390 / 390 — none |
| **768** | 614.0 | 372.4 | 320.9 | 140 | 42.9 | 768 / 768 — none |
| **1024** | 614.0 | 372.4 | 320.9 | 140 | 42.9 | 1024 / 1024 — none |
| **1440** | 670.0 | 428.4 | 376.9 | 140 | 42.9 | 1440 / 1440 — none |

Label ruler, same font, same size: `Support designer` **104.1** · `Lead designer` **86.2** · `Choose a role` **84.1** · `Bookkeeper` **73.9** · `Vendor` **44.2**. At 390 the text box is **2.5×** the longest label. There is no cliff at the breakpoint: the galley's own `@media (max-width: 767px)` and Tailwind's default `md` (`min-width: 768px`, no `screens` key in `tailwind.config.ts`) are the same line, and 768 measures the three-column shape with 320.9px of box. `wrapperClassName` is a real prop on the app-local `Select` (applied to the wrapping `<span>`, which is the grid item) — `col-span-2 md:col-span-1` lands where it is meant to.

---

## Findings — new this round

### W7-R6-01 · MAJOR · confidence HIGH (**measured**, the account sheet's own container chain) — the studio-defaults role picker clips four of its five strings at 390, and the fix round repaired only its sibling

This wave converted **two** free-text role fields to the enum picker. `fix-r5` measured and repaired the composer's. The studio's — `account-studio-page.tsx:1151-1194`, Account → Studio → Agreement defaults, the card `materialize_standard_parts` seeds **every** new agreement from — was left at round 4's shape and has never been measured in its own container.

Container chain, read out of the source: `.doc-sheet-layer` pads `max(1rem, safe-area)` each side (`globals.css:1890-1894`), the panel is `w-full max-w-[640px]` with a 1px border and `px-6` below `sm` (`doc-sheet.tsx:377-379`), then `mx-auto max-w-xl` (`account-sheet.tsx:171`), then `max-w-md`. At 390 that is **308px** of measure, and the row is `grid-cols-[minmax(0,1fr)_120px_auto] gap-2`.

Measured (same harness, same method as the composer table above):

| viewport | row | role `<select>` | its text box | rate `<input>` | `Remove` | overflow-x |
|---|---|---|---|---|---|---|
| **390** | 298.0 | **120.0** | **68.5** | 120 | 42 × **18** | 390 / 390 — none |
| **1440** | 504.0 | 326.0 | 274.5 | 120 | 42 × **18** | 1440 / 1440 — none |

Against the label ruler, at 390 the closed picker fits **one** of its five strings:

| string | width | fits in 68.5px? |
|---|---|---|
| `Support designer` | 104.1 | **no** |
| `Lead designer` | 86.2 | **no** |
| `Choose a role` | 84.1 | **no** |
| `Bookkeeper` | 73.9 | **no** |
| `Vendor` | 44.2 | yes |

So at 390 the unchosen state reads roughly "Choose a r…" and a bound lead reads "Lead desig…", on the control HT-4 exists to introduce, at a width the program's hard rules require every changed control to be verified at. Nothing overflows and the native option list still shows full labels when opened, which is the argument for MINOR; I file it **major** for the same reason round 5 filed the composer's at major — a changed control, at a required width, whose label is unreadable — and because the fix round has just demonstrated that this class is fixable in one line. This **supersedes `W7-R4-28`**, which recorded 111px in a generic container and said outright it had not reproduced the account page's own; the real figure is 120px / **68.5px of text box**.

**Fix, smallest honest shape, mirroring the one just shipped next door:** let the row stack below `sm` (the same line `doc-sheet` already changes its own padding on) — `grid-cols-[120px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_120px_auto]` with `wrapperClassName="col-span-2 sm:col-span-1"` on the `Select`. That returns the picker to ~308px there and costs the wide widths nothing.

---

### W7-R6-02 · NOTE · confidence HIGH (measured, each of the six re-run individually) — a **second** documented commercial failure fails for a reason the ledger does not record

`trade_rfq_test.sql` aborts this run at **`:154`**, `design services agreement d9300000-… not found or access denied`. `KNOWN_FAILURES.md:69` records its reason as `mint role refusal: 'permission denied for function mint_trade_rfq_token'` — an ACL question in a different part of the file entirely, reached only if the run gets that far.

Nothing on this branch touches the countersign path, so this is baseline drift in someone else's domain, exactly like **W7-R5-09**. Recorded because round 5 named one such file and this makes **two of six**: "all documented" is true **by file name** for six of six, and by **reason** for only four. A ship report that says "the commercial baseline is unchanged" should say which sense it means.

---

### W7-R6-03 · NOTE · confidence HIGH (code read + `part.required` probed in the DB) — a rate card emptied row by row passes readiness in silence, and the act that empties it is new this wave

Every rate-card rule in `assessAgreementReadiness` (`readiness.ts:306-331`) is guarded on the array being non-empty: R-7 by `roles.length > 0 &&`, `ZERO_RATE_BLOCKER` and `BLANK_ROLE_BLOCKER` by `.some(…)` (false on `[]`), `UNBOUND_ROLE_BLOCKER` by `roles.length > 0 &&`. The one rule that would catch an empty schedule — `!scheduleValueIsSet(part)` at `:299` — runs only `if (part.required)`, and the standard rate-card part is **not** required: `PATINA_STANDARD_AGREEMENT_PARTS` declares `patina.role_rates … required: false`, and I probed the live row (`SELECT part_key, variant, required FROM proposal_agreement_parts WHERE variant='rate_card'` → `f`).

So a card taken to zero rows sends with the readiness panel silent, `proposal_service_rates` empty, `project_billing_authority_rates` empty after countersign, and every hour on the project at `rate_source='none'`, `pending_authorization` — the stranding HT-4 exists to close.

**Honest framing, and why this is a note rather than a major:** a zero-row card was **already** reachable before this wave — `materialize_standard_parts` seeds `'[]'` for a studio that has never written Agreement defaults (`00618:2030-2056`) — and the room already offers `removePart` for the whole part, which is the deliberate way to say "this agreement has no hourly rates". Round 4's `Remove` adds a **second, quieter** door to the same state, and there is a green test that intends it (`part-editor-role-picker.test.tsx:216`, "takes the last row off the card rather than stranding a one-row blocker"). The gap is pre-existing; its reachability is not.

---

### W7-R6-04 · NOTE · confidence HIGH (grepped the component) — the studio half of HT-4 ships behind the pre-existing `agreement-parts` flag, and round 5's rulings table named the wrong flag

`account-studio-page.tsx:198` reads `useFeatureFlag('agreement-parts')`, and the whole Agreement-defaults card — the rate card, the picker, `+ Add a role`, `rateCardForSave`'s trim and the new help sentence — sits inside `{agreementPartsOn && …}` at `:1134`. **P-5 still holds**: this wave adds no flag, gates nothing new, and the flag is pre-existing and untouched. But round 5's Rulings check recorded *"`account-studio-page.tsx`'s `studio-workspaces` flag is pre-existing and untouched"* — that is a different flag, and the one that actually gates a changed control is `agreement-parts`. One line for the ship report: **a studio the `agreement-parts` flag has not reached gets no studio-defaults picker at all**, and its default card goes on seeding free-text labels until it does.

---

### W7-R6-05 · NOTE · confidence HIGH (**measured**) — the studio page's own `Remove` is 40 × 18px, a sixth open §A deviation and the smallest of them

Measured at both widths in the chain above: **42px cell, 40 × 18px button** — a bare `<button className="text-[12px] …">` (`account-studio-page.tsx:1227`), pre-existing, less than half §A's 44px floor and smaller than the composer's 30px (**W7-R5-03**). It sits beside a `+ Add a role` of the same shape. Recorded so the §A tally is six, not five, and so a fix for W7-R5-03 does not stop at the composer the way the fix for W7-R5-01 did.

---

### W7-R6-06 · NOTE · confidence HIGH (arithmetic) — HT-13-a moves the "backdated" mark by up to twelve hours

Both date-only doors compute the quiet 30-day "backdated" mark from the same noon-UTC instant: `Date.now() - new Date(startedAtFromDateValue(date)).getTime() > 30 days` (`hours-ledger.tsx:1382`, `log-time-sheet.tsx:197`). Before HT-13-a the instant carried the member's local time of day, so the mark flipped on the day's own boundary; now it flips at noon UTC, up to twelve hours either side of the day the member would reckon as the thirtieth. A cosmetic residual of the ruling, on the one day of the month where it can be seen at all; one line, no change asked.

---

### W7-R6-07 · NOTE · confidence HIGH — a test's name says the opposite of its assert

`part-editor-role-picker.test.tsx:226`, *"offers no Remove while the card is read-only"*, asserts `expect(screen.getByRole("button", { name: "Remove role 1" })).toBeDisabled()`. The act **is** offered — disabled, which is the room's grammar and matches `ListEditor`. The behaviour is right and the name is wrong; a later hand reading the name alone will look for an act that is not absent.

---

## Carried from round 4 — re-confirmed open, none addressed

`fix-r5` scoped itself to the single finding the brief named. Each below is unchanged at `337564357`.

| # | Sev | Re-checked this round |
|---|---|---|
| **W7-R4-02** | NOTE | Superseded in substance by **W7-R6-01**: "every changed control is reachable at 390 and 1440" is now true of the composer and not of the studio page |
| **W7-R4-03** | NOTE | Six this round, seven inside the 00:00–02:00 UTC window. The window's own file (`direct_order_attribution_test.sql`) passed at 02:22. Now also **W7-R5-09** and **W7-R6-02** |
| **W7-R4-04** | NOTE | `agreementDefaultsDirty` unchanged; see **W7-R5-08** |
| **W7-R4-06** | MINOR | `00618:622-627` unchanged — only an ABSENT or JSON-null `hourlyRateCents` raises; `_agreement_assert_cents` accepts `0` |
| **W7-R4-16** | NOTE — ruling owed | The standing 94px fallback strip at 390. Unchanged |
| **W7-R4-17** | MINOR | `hours-ledger.tsx:1245` — the `— internal —` band is still `font-mono text-[11px] uppercase tracking-[0.07em]`. Unchanged |
| **W7-R4-18** | MINOR — ruling owed | `account-profile-page.tsx:175-225` — the opt-out `<label>` carries no min-height; the block still carries `text-[15px]`, `text-[11.5px]`, `text-[13px]`. Unchanged |
| **W7-R4-19** | MINOR — ruling owed | `useInternalTimeStudio` (`use-viewer-studio.ts:85-101`) still returns `candidates[0]`; a two-studio member cannot choose. Unchanged |
| **W7-R4-20** | MINOR — ruling owed | Already-countersigned authorities go on stranding; deviation 1 stated only in `00618`'s banner. Unchanged |
| **W7-R4-21** | MINOR — ruling owed | `time_autostart_opt_out` readable by studio-mates; HT-35 is silent on privacy. Unchanged |
| **W7-R4-22** | NOTE | `UNBOUND_ROLE_BLOCKER` + `ZERO_RATE_BLOCKER` hold `send` on every in-flight legacy draft on ship day. One line for the ship report, one for Leah |
| **W7-R4-23** | NOTE — ruling owed | `part-kinds.ts:427-431` still promises label and role "move independently"; the composer has no text input for `roleName` |
| **W7-R4-24** | NOTE | `00618` still carries two sections numbered `(6)` |
| **W7-R4-25** | NOTE | The defaults card still saves a bound role at $0; the refusal arrives one surface later |
| **W7-R4-26** | NOTE | `design_services_authority_test.sql` FAILED again, at `:177`, before its first authority assert; case (al) lives in the green billing file. Correct call |
| **W7-R4-27** | NOTE | `@patina/types` is dist-resolved, `dist/` gitignored, `infra/deploy-portal.sh` rebuilds dists. No action |
| **W7-R4-28** | NOTE | **SUPERSEDED by W7-R6-01** — reproduced in the account sheet's real container at 120px / 68.5px, and re-filed as a major |

---

## Rulings check

| Ruling | Verdict |
|---|---|
| **HT-4** (enum binding, no free text) | **delivered** on every door — composer, studio defaults, both seeds, `upsert_agreement_parts` **and** `_project_agreement_terms` (both probed), both pricing legs, the countersign carry, and a send-blocking sentence; escapable on a card already composed. Open: **W7-R6-01** (the studio picker at 390), **W7-R6-04** (flag reach), W7-R4-20, W7-R5-02/-03/-04, W7-R6-03/-05 |
| **HT-41** (two-role card, the member picks) | **delivered** — case (al1)–(al4) green in the 9/9 billing run |
| **HT-13 / HT-13-a** | **delivered and recorded** — `rulings.md:20` dated 2026-09-13; one SQL case (billing (f), both edges of the band) and one jest case (`time-capture-date.test.ts`), exactly as the orchestrator instructed; no studio timezone column added. Residuals: W7-R5-05/-06/-07, **W7-R6-06** |
| **HT-35** | **delivered** — per member, cross-device, on `profiles`, default ON, disclosed once and surviving an errored read, opt-out on her own profile, falling back to a one-tap start on the same clock, honoured at `hold` **and** `resume`; two emitters landed in `document-events.ts`. Open: W7-R4-16, W7-R4-18, W7-R4-21 |
| **HT-15** (W4's portal half) | **delivered** at both desk doors, in the `— internal —` group and in the scope row's "Studio time"; the ⌘K door is measured by five cases; an internal hour invalidates the studio reads. Open: W7-R4-19 |
| **HT-11 / HT-26 / HT-36 / §0.23** | respected, unchanged |
| **HT-39** | correctly untouched — `useUpdatePhaseEstimates` present, no migration minted, `00620` spent by W2 |
| **P-5** (no flags) | **holds** — this wave adds no `useFeatureFlag`, no PostHog gate, no `ComingSoon`. The one flag touching a changed control is the pre-existing `agreement-parts` (**W7-R6-04** corrects round 5's naming) |
| **P-4** (no backfill, no hour re-priced) | **holds** — the normalisation touches `proposal_service_rates` and `studio_agreement_defaults` only, unambiguous rows only, with a postcondition asserting no `project_billing_authority_rates` row was written |
| **§0.12** (invoiced lock untouched) | **holds** — nothing on this branch touches `guard_invoiced_time_entry` |
| **§0.19 / §0.20** | **holds** — both regenerated from the worktree's own copies this round, proven by `git diff --exit-code` |
| **§8 Done-when** | **met.** A default two-role bound card prices a new hire at `rate_source='authority'` (case (al2)); a legacy label-only card still prices (al3); `grep -rn "Principal designer" apps/designer-portal/src packages` returns **comments and test fixtures only** — no production default seed anywhere |
| **House sheet §A** | **six deviations, all open**: the 43px `<Select>` (a shared control), the 21px/42px opt-out row, the profile block's three inline font sizes (W7-R4-18), the ledger band's inline font size (W7-R4-17), the composer's 30px `Remove` (W7-R5-03), and the studio page's 18px `Remove` (**W7-R6-05**) |

---

## What I did NOT verify

- **No signed-in browser walk.** The 390/768/1024/1440 evidence is a CSS-accurate harness in headless Chromium: the app's own `tailwind.config.ts` compiled by its own `tailwindcss 3.4.19` against `src/app/globals.css`, `galley.css` **copied verbatim** (not transcribed, which is where round 5's container went wrong), the real DOM chains, and the controls' real class strings. It measures **layout**; React behaviour in the live room is covered by the jsdom suites. The harness lives in the session scratchpad; nothing was written into the repo, no dev server started, ports 3000/3002 never touched.
- **Times, not Inter.** `--font-body` resolves to `var(--font-inter)`, injected by the Next font loader, so outside the app the declaration is invalid at computed-value time and every figure above is in the fallback face. Inter is the wider face, so every clip I report is a **floor** and every headroom a **ceiling**. The composer's 2.5× headroom survives the swap; the studio picker's 68.5px box does not come close either way.
- **The `Remove` button widths in my harness are approximations** (74.6px composer, 40px studio) because I did not reproduce `type-btn-text` and the design-system Button's full class string. `fix-r5` measured 83.6px for the composer's. This shifts the picker's column by a few px at the wide widths and **not at all** at 390, where the picker spans both columns (composer) or the rate column is fixed (studio). Heights — 30.2px and 18px — are computed from the real padding and line-height and are not affected.
- **No e2e.** `playwright.config.ts` hard-pins `webServer` to port 3000 and the shared stack on 54321 — both forbidden to this lane.
- **Prod not touched.** `00618`–`00620` exist only locally and on lane branches. I did not read Strata's `studio_agreement_defaults` rate-card row counts, which is the reachability question behind W7-R5-04, or its already-countersigned authority count, which is the exposure behind W7-R4-20.
- **W7-R5-02 was not driven.** I read both handlers and the projection's `sortOrder` handling; I did not compose a card, remove a middle row, add a fifth and read back `proposal_service_rates`.
- **The two documented RLS failures** were matched by name and count, not chased to their messages. Of the six commercial failures I **did** re-run all six individually and read each abort — which is how W7-R6-02 surfaced.
- **iOS untouched** (correctly — W7 carries none). HT-13-a's third named door, the Field sheet when backdated, still files at the device's local time of day; that is W6's lane.
