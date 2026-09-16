# W7 — adversarial review, round 3

**Reviewer** separate context · **Branch under review** `hour-tracking/portal` @ `4569311af` (= `origin/hour-tracking/portal`, no divergence)
**Base** `origin/hour-tracking/integration` @ `fd28a9542` · **Stack** `patina-hours`, Postgres `127.0.0.1:54422`
**Commits reviewed** `2e7567e61` · `513d7cbd3` · `3f7df185d` · `b6c0c1dc0` · `da4133772` · `4569311af` (6 commits, 31 files, +5355 / −166)
**Round 2 findings:** 1 blocker · 3 major · 15 minor · 6 notes. **Fix round applied three: W7-R2-01, W7-R2-02, W7-R2-03 — all three verified closed here.** The other nineteen were not addressed; each is re-verified against `4569311af` below and carried forward.

**NOT CLEAN. 0 blockers · 2 major · 15 minor · 8 notes.**

Every gate in the brief's list is **green** in this context, including the designer-portal suite, which I ran **inside the failure window the round-2 blocker described** (19:49 CDT / 00:49 UTC) — so the blocker is genuinely closed, not merely out of season.

The two majors are one **new** defect in HT-35's own surfaces (a latched disclosure band that survives the opt-out it invites) and one **pre-existing cross-wave** date defect that the round-2 fix's chosen remedy — pinning the test clock — now hides from the suite for good.

---

## Round-2 fixes — each independently verified

| Finding | Verdict | Evidence I took myself |
|---|---|---|
| **W7-R2-01** (blocker, red test gate) | **FIXED** | `date` at the moment of the run: `Sun Sep 13 19:49:27 CDT 2026` — inside the 19:00→midnight CDT window that produced the failure. `pnpm --filter @patina/designer-portal test` → **580 suites / 7412 tests, all pass**. The pin is real and zone-proof: `PINNED_NOW = new Date('2026-09-13T12:00:00.000Z')` (midday **UTC**) with `doNotFake` covering every timer API but `Date`, in both `command-bar-log-time.test.tsx:130` and `hours-ledger-add-row.test.tsx:143`. No production file changed for it. **See W7-R3-02** for what the pin does *not* close. |
| **W7-R2-02** (major, disclosure flashed) | **FIXED** | `document-time-provider.tsx:800-820`. `showDisclosure = held && !dismissed && (latched \|\| (undisclosed && !stamped.current))`; the stamping effect keys off `undisclosed` and sets `latched` as it stamps, and a second effect drops `latched` when `held` goes false. I walked all four transitions: first render → band + one stamp + one event; stamp round-trips (`disclosedAt` non-null) → `undisclosed` false, `latched` holds it up; `Understood` → `dismissed`, gone; `release()` → `latched` false and `stamped.current` blocks a re-show on the next document in the session. The two regression cases genuinely exercise it (the mocked `markDisclosedMutate` flips `autostartPreference.disclosedAt`, which the seven original cases could not do), and the fix report records a falsifier run. **A new defect rides in on the latch — W7-R3-01.** |
| **W7-R2-03** (major, `$0` bound rate) | **FIXED at the reachable door** | `readiness.ts:147` `ZERO_RATE_BLOCKER`, fired at `:318` as an `else` on R-7. I re-read the branch logic against all four shapes: empty card → silent; all-zero card → R-7 only (no doubling); one priced + one seeded $0 → the new sentence; every role priced → silent. Both seeds (`part-editor.tsx:493-503`, `account-studio-page.tsx:1213-1222`) still write `hourlyRateCents: 0`, so the blocker, not the seed, is what holds it. **Residual confirmed and unchanged:** `upsert_agreement_parts` (`00618:591-595`) still refuses only an *absent or JSON-null* rate and `_agreement_assert_cents` still accepts `0`, so a caller reaching the RPC directly can still park a bound $0 rate. Disclosed in `W7-fix-r2.md`; carried below as **W7-R3-03**. |

---

## Gates — run in this context, verbatim

| Command | Result |
|---|---|
| `npx supabase db reset --workdir …/agent-portal` | **clean, exit 0.** 569 migrations applied, `00618` + `00619` among them, every postcondition passed, no `ERROR`/`FAIL` in the log |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green, 0 unexpected.** `time_rate_resolution_test.sql` green with case (al) |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | 10 green / 16, **6 unexpected — the documented six**, matched by name against `supabase/tests/KNOWN_FAILURES.md` (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`). `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` green **with** their new asserts |
| `run-sql-tests.sh -d …/supabase/tests/rls …` | 29 green / 31, **2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`). `internal_time_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test` all green |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **580 / 580 suites, 7412 / 7412 tests pass** (run at 19:49 CDT — in-window) |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (all pre-existing "unused eslint-disable"; none on a touched file) |
| `pnpm --filter @patina/admin-portal build` | **compiled successfully** — the §0.24 type-integrity gate |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test` | 151 suites / 2475 tests, all pass |
| `pnpm db:generate` → `git diff --exit-code database.types.ts` | regenerated against the reset stack: **clean** (§0.19) |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's own** copy, §0.20) | 2648 statements, **seed diff clean** |
| `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/006*.sql` | 14 files incl. `00618`; `00619` carries none (it is a pure `CREATE OR REPLACE`, ACLs survive) and owes none |

> The runner prints `expected-fail: 0` because `-d <worktree>/supabase/tests/<suite>` makes it look for a per-suite `KNOWN_FAILURES.md` that does not exist (the real file is one level up, `supabase/tests/KNOWN_FAILURES.md`). I matched all eight by name by hand. Not W7's doing; same shape as the plan's own gate lines.

**Commit hygiene: clean.** Six Conventional-Commit messages (`feat(time):` ×4, `fix(time):` ×2). `git diff --name-only origin/hour-tracking/integration..hour-tracking/portal` matches nothing against `config.toml|\.env|next-env|\.next/`. `00618`/`00619` are unique across **every** ref (`git ls-tree` per branch after `git fetch --all --prune`: peer program holds `00621–00629`; `00617` unminted). Branch tip == `origin/hour-tracking/portal`; nothing on integration is unmerged into it.

---

## What I could not refute

| Claim the brief asked me to attack | How | Result |
|---|---|---|
| A two-role rate card binds and resolves **without free text**, through RLS as the actor | `time_rate_resolution_test.sql` case (al1/al1b/al2/al3/al4) re-run green on a fresh reset, and I read both pricing legs independently: resolver tier 1 `rate.roster_role = v_role` (`00618:1288`) and classifier card-PICK `rate.roster_role = v_team_role` (`00618:1713`), symmetric, each with the legacy label leg kept and gated on `roster_role IS NULL` so a bound card and a label-collision card can never both answer | **holds** |
| The countersign carry snapshots the role | `00619:590-592` carries `roster_role` on the one `INSERT INTO public.project_billing_authority_rates`, pinned by the banner assert at `:681-683`; `agreement_fee_schedules_test.sql` green through the live rail (`upsert_agreement_parts` → send → sign → countersign). I verified by grep that all eight historical INSERT sites are redefinitions of one lineage — there is no second door | **holds** |
| The default label no longer strands | composer default is `{roles: []}`; the studio-defaults card is bound (picker + normalisation + `materialize_standard_parts` both arms) and blocked at readiness when unbound; `grep -rn "Principal designer" apps/designer-portal/src packages` returns only comments and fixtures | **holds for every card written from here on.** Not for already-countersigned authorities — W7-R3-09 |
| An internal entry can never be billable and never reaches an invoice | `supabase/tests/rls/internal_time_test.sql` green per role: the `00610` CHECK refuses a billable project-less row; `project_unbilled_time` count 0; `claim_time_entries` returns 0; a direct `SET invoice_id` raises through `aad_guard_time_entry_invoice_authority`. The hook forces `p_billable: false` on the project-less branch (`use-time-tracking.ts:487`) and both doors force it again at the call site | **holds, at the DB and at both doors** |
| The opt-out really stops auto-start (test the provider) | `hold` (`document-time-provider.tsx:462`) awaits `autostartDeclined()` through `qc.fetchQuery` on the same cache entry, after the `pausedRef` check and before `automaticBillableIntent`, re-checking `heldRef` after. Nine provider cases now cover it | **holds for `hold`.** `resume()` remains ungated — W7-R3-11 |
| The disclosure shows exactly once per member | latch verified above; the DB stamp is idempotent server-side (`.eq('id',userId).is('time_autostart_disclosed_at', null)`); a session flag dedups the event | **holds for the happy path.** Two error paths re-serve it — W7-R3-15 |
| Grafts are their heads' bodies + the named delta | five bodies in `00618`, each extracted by line range with a banner naming its delta; postconditions re-assert the deployed shapes; `00619` re-asserts 00578's own invariants including the two shapes `public_sd_hardening_contract_test.sql` pins | **holds. No stale-body revert** |
| §0.19 / §0.20 (types + ACL seed) | both regenerate **clean** from the worktree's own copies, measured above | **holds** |
| Migration numbering, commit hygiene | measured above | **holds** |

---

## Findings

### W7-R3-01 · MAJOR · confidence HIGH (code path read end to end; not driven in a browser) — the latched disclosure band survives the opt-out it invites, so the sentence goes on asserting the behaviour she just declined — and it suppresses the fallback act

This is a **new** defect, introduced by the W7-R2-02 fix.

`AutostartBand` (`document-time-provider.tsx:805`):

```
const showDisclosure = held && !dismissed && (latched || (undisclosed && !stamped.current));
```

`latched` is dropped only by `held` going false (`:817-819`) or by `dismissed`. It is **not** dropped when `optedOut` turns true. And the fallback band is the *next* branch (`:842`), so `showDisclosure` returning first suppresses it.

**The reachable flow is the one the band itself prescribes.** The disclosure reads *"While a document is open, Patina keeps the time for you. You can turn that off on your profile."* `AccountSheet` is mounted once in `apps/designer-portal/src/app/(document)/layout.tsx:112` and opened by a `document:open-account` **event**, not a route change — so she opens her profile as an overlay **over the held document**, `held` stays true, she unticks "Keep the time automatically", and on returning to the page:

1. the band still says Patina is keeping the time for her — which is now false; and
2. if no timer is running at that moment (she stopped the one auto-start opened, or she opts out on a document where auto-start had already been declined for another reason), the *"The clock is yours to start"* band — the one-tap start that HT-35's ruling makes the whole point of the opt-out (*"falls back to one-tap manual start"*) — cannot render, because the stale disclosure occupies the same slot.

She escapes by clicking `Understood` or leaving the document, neither of which she has any reason to connect to the missing start affordance.

**Fix:** one clause — `const showDisclosure = held && !dismissed && !optedOut && (latched || …)`. Worth a provider case: hold, band up, flip `autostartPreference.optedOut` to true, assert the disclosure is gone and "Start the clock" is offered.

---

### W7-R3-02 · MAJOR · confidence HIGH (measured against the live view definition) — an hour logged in the evening carries two different dates depending on which surface reads it, and the W7-R2-01 fix removed the only thing that was surfacing it

Not W7's code. Named here because W7-R2-01's chosen remedy was to **pin the test clock**, which makes the product behaviour permanently invisible to the suite, and because this stage is the last one before the program ships.

- `startedAtFromDateValue` (`components/document/time-capture.tsx:286-296`) copies `now`, moves only the **local** date, keeps the **local** time-of-day, and returns `toISOString()`.
- `public.time_entry_ledger` derives its day as **`(te.started_at AT TIME ZONE 'UTC')::date AS day`** — I read this off the live stack with `pg_get_viewdef`.
- The Hours sheet's own "mine" list groups by **local** date (`hours-ledger.tsx:458`, `new Date(e.started_at).toDateString()`).

So a Chicago designer who types `2026-09-01` at 19:30 CDT stores `2026-09-02T00:30Z`. Her own ledger prints **Sep 1**. The admin's scope lens prints **Sep 2** (`hours-ledger.tsx:1810`, `row.day`). W5's export (`useTimeEntryLedger` at `hours-ledger.tsx:625`) hands the bookkeeper **Sep 2**. `isBackdatedEntry`, the day buckets and any period filter inherit the same shift. The window is every evening from 19:00 CDT (17:00 PDT) onward — ordinary working hours for the customer this program is for.

Attribution, plainly: the view is W2's (`00604`), the helper is W3's, and both round-2 assertions that failed were W3's. But the repair chosen in this stage was a clock pin, and the round-2 finding itself said *"The repair is a W3-file repair landing in this stage."* It was not made. At minimum this owes a line in the ship report and a ruling on which zone the ledger's `day` belongs to (the studio's, almost certainly — `AT TIME ZONE` against a studio timezone column, or storing a date alongside the instant).

---

### W7-R3-03 · MINOR · confidence HIGH — the $0-rate guard is client-side only; the server still admits a bound rate at zero

Carried from the W7-R2-03 fix's own "Residual, named rather than closed", re-measured: `00618:591-595` refuses only an absent or JSON-null `hourlyRateCents`, `_agreement_assert_cents` accepts `0`, and both pricing legs match on `roster_role` without asking for a positive rate. `assessAgreementReadiness` runs in two components only (`agreement-composer.tsx:371`, `service-agreement-instruments.tsx:157`). Matches the posture `UNBOUND_ROLE_BLOCKER` already ships with, so this is a consistency judgement, not a regression — but the money consequence (priced at `rate_source='authority'` / `$0`, frozen by `guard_invoiced_time_entry`, unrepairable after countersign) is worse than the one `UNBOUND_ROLE_BLOCKER` guards. The one-line server shape is named in `W7-fix-r2.md`.

---

### W7-R3-04 · MINOR · confidence HIGH — an internal hour still invalidates no cache at all (was W7-R2-04, unaddressed)

Re-read at `use-time-tracking.ts:487-503`, `:544-546`, `:557-565`: all three mutations now read `onSuccess: (_, {projectId}) => { if (projectId) invalidateProjectTime(...) }`. `invalidateProjectTime` (`:202-213`) is the **only** caller of `timeKeys.all`, and the module's own comment at `:42-44` says W2's three reads (`ledger`, `studioRollup`, `projectHoursTotal`) sit under `timeKeys.all` *precisely* so that blanket invalidation refreshes them. For an internal hour nothing runs, and the new comment ("refetched by their callers") is untrue of the ⌘K path: `log-time-sheet.tsx` closes on success with no refetch. The Hours add row is covered by its own `void refetch()`, and the add row only renders in `scope === "mine"` (`hours-ledger.tsx:1258`) — so the live case is exactly ⌘K with the Hours sheet standing in the studio scope or on the export. **Fix:** invalidate `timeKeys.all` on the project-less branch too.

---

### W7-R3-05 · MINOR · confidence HIGH — the ⌘K studio door is covered by no test, and a comment claims otherwise (was W7-R1-07, unaddressed through two fix rounds)

`command-bar-log-time.test.tsx:48` still declares `let mockStudios: Array<Record<string, unknown>> = []` and never reassigns it; `:47` still promises *"the internal-door case seats her"*; `grep -n 'Studio time|__internal__|internal'` over that file returns **only those two comments**. So the option, the held/disabled pill, the `valid` gate through `Boolean(internalStudio)`, and the `{projectId: null, studioId, billable: false, source: 'internal'}` payload are untested at the ⌘K surface. The stale comment is the part that will mislead — it reads as coverage that exists. (The equivalent hours-ledger cases *were* written, so the gap is one surface, not the feature.)

---

### W7-R3-06 · MINOR · confidence HIGH — a multi-studio member's internal hour silently lands on the alphabetically-first studio (was W7-R1-08 — ruling owed)

`use-viewer-studio.ts` `useInternalTimeStudio` filters to active non-guest `design_studio` memberships, sorts by name then id, and returns `candidates[0]`. The option reads only "Studio time — no document" and names no studio. A member in two design studios has no way to see, let alone choose, which one her admin hour was charged to. Unruled: HT-15's shape was settled without this case.

---

### W7-R3-07 · MINOR · confidence HIGH — the ledger's `— internal —` band uses an inline font-size utility and does not match its own sibling (was W7-R1-05, unaddressed)

`hours-ledger.tsx:1226` is `font-mono text-[11px] uppercase tracking-[0.07em]`; the identical band in the studio rollup at `:1597` is `t-head`. House sheet §A forbids inline font-size utilities outright, and the two bands will not render alike. One token substitution.

---

### W7-R3-08 · MINOR · confidence HIGH — the HT-35 opt-out control is a ~21px pointer target and the block carries two inline font sizes (was W7-R1-04 — ruling owed on the first half)

`account-profile-page.tsx:188-200`: a 16px `<input type="checkbox">` with `mt-[3px]` inside `<label className="flex max-w-md items-start gap-2.5">` whose text span is `text-[13px] leading-relaxed`. The `<label>` does widen the hit area to the whole row (the reviewer-r1 figure of ~21px understates it), but at 1440 with `max-w-md` that row is a single ~21px line and still short of the house sheet's 44px floor. The help paragraph above is `text-[11.5px]` and the heading `text-[15px]` — two more inline font-size utilities, which matches the surrounding file's existing style but not §A. Both are shared-surface questions rather than W7 inventions; the 43px `<Select>` (impl-disclosed) is the same standing question.

---

### W7-R3-09 · MINOR — ruling owed · confidence HIGH — every already-countersigned agreement goes on stranding, and nothing says so (was W7-R2-08)

`00618`'s Deviation 1 (signed paper is not renormalised) is disclosed and defensible. Its consequence is not stated anywhere a studio will read: an authority countersigned from the old default card carries two `project_billing_authority_rates` rows labelled "Principal designer" / "Associate", both `roster_role NULL`. Neither normalize-matches; the single-card fallback needs exactly one card; so every hour on that project goes on pricing `rate_source='none'`, `pending_authorization`, NULL `authority_rate_id`, for ever. The `proposal_service_rates` normalisation cannot reach them (it stamps only labels that already match, which these by definition do not). The repair exists — revise/supersede and pick the roles — but it is a signed-document ceremony and no surface names it. One ship-report sentence, plus a ruling on whether an owner gets an act that re-binds a live authority's rate rows.

---

### W7-R3-10 · MINOR — ruling owed · confidence HIGH (measured on the reset stack) — a member's auto-start preference is readable by her studio-mates (was W7-R2-09)

`pg_policies` for `profiles` SELECT on the reset stack: `profiles_select_self` (`auth.uid() = id`), `profiles_select_counterparty` (`can_view_profile(id)`), `profiles_select_admin` (platform admin), `profiles_select_agent_reader` (`true`). So a studio co-member, any platform admin and `agent_reader` can all read `time_autostart_opt_out`. Writes are correctly own-row only. HT-35 says "per-member opt-out on their own profile" and is silent on privacy; a preference about how closely one is timed is the kind of fact a studio might reasonably want kept.

---

### W7-R3-11 · MINOR · confidence HIGH — `resume()` starts `timer_auto` for a member who declined it (was W7-R1-06)

`document-time-provider.tsx:538-565` has no `autostartDeclined()` check, unlike `hold`. Reachability stays narrow (an opted-out member reaches `paused` only via `startManually` → `pause`), but her resumed hour then carries a provenance she declined, and the same row is what `SOURCE_LABEL` prints back to her as "in hand".

---

### W7-R3-12 · MINOR · confidence HIGH — the opt-out read sits in front of the zero-tap path under the portal's default 3× retry (was W7-R1-09)

`autostartDeclined()` (`:263-274`) does `auth.getUser()` + a `profiles` select through `qc.fetchQuery`, inside the serialised `enqueue`, before `automaticBillableIntent`, with no `retry: false`. The portal's `QueryClient` defaults to 3 retries with 1/2/4s backoff (`lib/react-query.ts:179-193`), so a flaky read puts ~7s in front of D11's pick-up-is-start and everything queued behind it. `automaticBillableIntent` has the same shape and predates W7, so this doubles an existing cost rather than inventing one. `retry: false` on this one fetch is the whole fix — the catch already fails safe.

---

### W7-R3-13 · MINOR · confidence HIGH — an internal row prints the raw enum, and so do `command_bar` and `field_manual` (was W7-R1-14, widened)

`SOURCE_LABEL` (`hours-ledger.tsx:101-105`) carries only `timer_auto`/`timer_manual`/`manual_entry`; `:1988` falls back to `e.source`. So an internal hour's metadata line reads `internal · no document · non-billable`, a ⌘K hour reads `command_bar`, a Field hour reads `field_manual`. Three raw enum values in the designer's own ledger. Trivial to close, and it is the one place the program's new vocabulary reaches a human.

---

### W7-R3-14 · MINOR · confidence HIGH — picking a role can collide with a legacy label and the refusal arrives from the server about a name she never typed (was W7-R2-05)

`upsert_agreement_parts` (`00618:563-567`) still refuses two roles with the same `roleName`. Both pickers disable an option whose **`rosterRole`** is taken, never one whose **label** collides — and picking rewrites the row's `roleName` to the canonical label. A card with a legacy unbound row labelled "Lead designer" plus a second row on which she picks `lead_designer` reaches Save as two identically-named roles and is refused with *"the rate card names Lead designer twice"*. Escapable (bind the legacy row too), but the picker gave no sign.

---

### W7-R3-15 · MINOR · confidence HIGH — two error paths re-serve the one-time sentence (was W7-R1-10, plus one the fix added)

`useTimeAutostartPreference` returns `isSettled = isSuccess || isError` and, on error, `{optedOut:false, disclosedAt:null}` (`use-time-autostart.ts:73-76`). The band gates on `settled && disclosedAt === null`, so a transient read failure re-serves the sentence and re-fires `time_autostart_disclosed` (the session flag dedups within a session, not across them). Second path, new with the latch: `markDisclosed.mutate()` has **no** `onError`, so a failed stamp leaves the column NULL while the band stands latched and she dismisses it — she is told again next session. Neither is dangerous; both defeat "exactly once". The honest shape is `isSettled = isSuccess` for the disclosure gate (fail silent rather than fail loud on a sentence that is supposed to be shown once in a working life).

---

### W7-R3-16 · MINOR · confidence HIGH — `rosterRoleLabel` has no caller (was W7-R1-13)

`part-kinds.ts:446`. Grep over `apps` and `packages` returns the definition alone. Dead export on a new surface.

---

### W7-R3-17 · MINOR · confidence MEDIUM — `_project_agreement_terms` writes `roster_role` with none of the validation `upsert_agreement_parts` got (was W7-R1-12)

`00618:366-368` takes `v_rate->>'rosterRole'` straight into the INSERT. `upsert_design_services_draft` still calls `_project_agreement_terms(…, p_rates, false)` with caller-supplied rates, and that path has neither the four-value sentence nor the one-rate-per-role check. Unreachable today — no live caller sends `rosterRole` down that door — and the column CHECK bounds the value at a 23514 rather than admitting junk. Confidence is medium only on "no live caller", which I verified by grep, not by exercise.

---

### W7-R3-18 · NOTE · confidence HIGH — every in-flight legacy draft agreement becomes unsendable on the day this ships, and only the blocker sentence explains it

`UNBOUND_ROLE_BLOCKER` (every rate must name its roster role) plus `ZERO_RATE_BLOCKER` (every rate above zero) now hold `send` on any draft whose rate card predates the binding — which is every draft in prod at ship time. The remedy is correct and cheap (open the rate card, pick each role), and the two sentences say what to do. But nothing warns a studio mid-composition that a document which was sendable yesterday is not today. One line in the ship report, and a line for Leah.

---

### W7-R3-19 · NOTE · confidence HIGH — the opted-out member carries a permanent strip above every document page, and neither band has been measured at 390 or 1440 (was W7-R1-03, unaddressed through two fix rounds)

Two halves, both still open after three rounds:

- **Placement.** `AutostartBand` mounts as the first child of `DocumentTimeProvider` (`document-time-provider.tsx:745`), above the whole document shell. For a member who declined auto-start and has no timer running, `held && settled && optedOut && !running` is true on **every** document page, so *"The clock is yours to start on this document"* is a permanent strip above the page's own chrome, not an affordance that appears where the thing it describes is happening. Vision §4/§6 forbids badges and nudges; this is neither, but a standing strip is a design question nobody has ruled.
- **Measurement.** Neither band has been measured at 390 or 1440 — not by the impl (its table carries HT-35's profile opt-out row only), not by round 1, not by round 2, and not by me. `W7-fix-r2.md` is explicit that its 390/1440 paragraph is a static audit of unchanged markup. The markup reads safe (`flex flex-wrap items-center justify-between gap-x-4 gap-y-1` inside `mx-auto max-w-[1180px] px-4 py-2`, paragraph `t-body-sm`, act `min-h-11 shrink-0` = 44px, no fixed width, no `min-width`), and I expect it to pass. **Expectation is still not measurement**, and per the brief's own rule a control off-screen at 390 is a major — so this is the one place a major could still be hiding. One minute of Kody's prod walk closes it, and W7-R3-01's fix makes the band stand still long enough to look at.

---

### W7-R3-20 · NOTE — ruling owed · confidence HIGH — picking a role overwrites the studio's own client-facing wording, and the code comment says the opposite (was W7-R2-06)

Both pickers write `roleName: picked.label` alongside `rosterRole` (`part-editor.tsx:435-440`, `account-studio-page.tsx:1140-1148`). No surface can set a rate-card label any more. `part-kinds.ts:426-431` nonetheless still states *"They are stored separately so a studio may rename the one without moving the other"* — a capability the UI withdrew. A studio whose top rate read "Principal designer" on a client-facing agreement reads "Lead designer" after the first pick. HT-4 says "no free text", so this may well be right; it is a copy change on a signed document and nobody ruled it.

---

### W7-R3-21 · NOTE · confidence HIGH — `00618` carries two sections numbered `(6)` (was W7-R2-07)

`classify_project_time_entry_authority` at `:1417` and `materialize_standard_parts` at `:1839`. Cosmetic; a later graft citing "00618 section (6)" will be ambiguous.

---

### W7-R3-22 · NOTE · confidence HIGH — the studio-defaults card can be SAVED with a $0 rate, and only the composer refuses it later

`rateCardForSave` (`account-studio-page.tsx:105-117`) filters on a non-blank `roleName` only. So a studio can save defaults carrying a bound role at $0, `materialize_standard_parts` seeds every new agreement from it, and the refusal arrives one surface later in the composer's readiness panel. The new help sentence at `:1230-1233` says so in advance, which is why this is a note and not a finding — but the guard and the warning live in different rooms.

---

### W7-R3-23 · NOTE · confidence HIGH — `supabase/tests/commercial/design_services_authority_test.sql` still could not receive case (al), as §8 instructs

It is one of the six documented pre-existing failures and aborts before its first authority assert, so the coverage lives in `supabase/tests/billing/time_rate_resolution_test.sql` instead, per W1-R1-15's standing ruling. Correct call, already disclosed by the impl; recorded so §8's literal instruction is not read later as unmet work.

---

### W7-R3-24 · NOTE · confidence HIGH — `@patina/types` is dist-resolved and its `dist/` is gitignored

`packages/types/package.json` `main: ./dist/index.js`. The new `RosterRateRole` / `RateCardRow` exports live in `src/agreement.ts`; the built `dist/agreement.d.ts:202` carries them on this machine because the lane ran turbo, which is why a bare `pnpm --filter @patina/designer-portal type-check` passes here. A fresh checkout must build `@patina/types` first; `infra/deploy-portal.sh` already does. No action — recorded because this is the `proposalTierVisibility` incident class and the wave touches a dist-resolved package.

---

## Rulings check

| Ruling | Verdict |
|---|---|
| **HT-4** (enum binding, no free text) | **delivered** on every door a rate card is written through: the composer, the studio defaults, both seeds, the save, both pricing legs, the countersign carry, and a readiness blocker for an unbound role. Not delivered for authorities already countersigned (W7-R3-09) |
| **HT-41** (two-role card, the member picks) | delivered — case (al4) measures the pick deciding the BOUND card; the classifier's `v_team_role` ladder (designer → `NEW.rate_role` → `count(DISTINCT role)=1`) intact |
| **HT-11** (billable stated at every surface, no implicit default) | respected — internal is the one path where the pill states the answer instead of asking, because `00610`'s CHECK makes it the only answer, and the reason is printed beside it on both doors |
| **HT-26** (never a blank; "rate pending" is a fact) | respected, and correctly suppressed for internal rows where a pending alarm has no answer |
| **HT-35** | per-member, cross-device, default on, opt-out on her own profile, disclosed once, falling back to a one-tap manual start on the same clock. **The disclosure now stands long enough to read (R2-02 fixed) but asserts the wrong thing after an opt-out and suppresses the fallback — W7-R3-01.** W7-R3-11/12/15/19 remain |
| **HT-15** (W4's portal half) | delivered at both desk doors; the multi-studio choice is unruled (W7-R3-06); the cache half is incomplete (W7-R3-04); the ⌘K door is untested (W7-R3-05) |
| **HT-39** | correctly untouched — `useUpdatePhaseEstimates` present, no migration minted, `00620` spent by W2 |
| **P-5** (no flags) | holds — no `useFeatureFlag`, no `ComingSoon`, nothing gated by this wave. (`account-studio-page.tsx`'s `studio-workspaces` flag is pre-existing and untouched) |
| **P-4** (no backfill) | holds — the normalisation touches `proposal_service_rates` and `studio_agreement_defaults` only, unambiguous rows only; a postcondition asserts no snapshot row written; no `project_time_entries` row read or re-priced |
| **§0.12** (invoiced lock untouched) | holds — nothing on this branch touches `guard_invoiced_time_entry`. The W7-R3-03 residual interacts with it: the lock freezes a $0 authority-priced hour exactly as it freezes a correct one |
| **§0.19 / §0.20** (types + ACL seed) | holds — both regenerate clean from the worktree's own copies |
| **§0.23** (totals above rows) / **HT-36** (notes never in a rollup) | untouched by this wave |
| **Vision §4/§6** | no dashboard, no tab, no badge, no colour state, no per-second motion, no daily nudge. The fallback band is an affordance, not a nudge — modulo its standing placement (W7-R3-19) |
| **House sheet §A** | four deviations, all open: the 43px `<Select>` (impl-disclosed), the ~21px checkbox row, the inline font sizes on the profile block (W7-R3-08), the inline font size on the ledger's `— internal —` band (W7-R3-07) |

---

## What I did NOT verify

- **No browser pass.** I started no dev server. Every 390/1440 figure in `W7-impl.md` is the lane's own and unreplicated; `W7-fix-r2.md`'s is a static audit by its own admission. **The disclosure band and the opt-out fallback band remain unmeasured at both widths** (W7-R3-19) — the single largest place a major could still be hiding, and the only brief requirement I could not close.
- **W7-R3-01 was not driven.** I read the code path and confirmed `AccountSheet` is an always-mounted, event-opened overlay in the `(document)` layout (`layout.tsx:112`) rather than a route, which is what makes `held` stay true. I did not toggle the checkbox over a held document in a browser.
- **No e2e.** `apps/designer-portal/playwright.config.ts` hard-pins its `webServer` to port 3000 and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` — the peer program's port and the shared stack, both forbidden to this lane.
- **Prod not touched.** `00618`/`00619` exist only locally and on the lane branch. Note `00596`'s standing HT-6-a hazard and the `00618` studio-defaults normalisation both run at the same prod push; I did not measure Strata's `studio_agreement_defaults` row shapes.
- **iOS untouched** (correctly — W7 carries none).
- The eight SQL failures were matched to `supabase/tests/KNOWN_FAILURES.md` **by name**; I did not confirm each still fails for its documented reason.
- I did not chase `agreementDefaultsDirty` (`account-studio-page.tsx:647`), which `JSON.stringify`-compares `rateCardForSave`'s key order against the jsonb key order the DB returns. It looks like a pre-existing always-dirty shape; the single-mapper fix (W7-R1-01) narrowed it but a key-order mismatch against the DB's own ordering would still bite. Unmeasured.
- I did not exercise the W7-R3-03 residual through a direct RPC call; I read the refusal at `00618:591-595` and `_agreement_assert_cents` rather than inserting a $0 bound card and invoicing it.
- The `TZ=America/Chicago` behind W7-R3-02 is the app `.env`'s, which the sandbox denies reading; I confirmed the effect from the system clock and the view definition, not from that file.
