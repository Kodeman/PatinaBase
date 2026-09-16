# W7 — adversarial review, round 2

**Reviewer** separate context · **Branch under review** `hour-tracking/portal` @ `da4133772`
**Base** `origin/hour-tracking/integration` @ `fd28a9542` · **Stack** `patina-hours`, Postgres `127.0.0.1:54422`
**Commits reviewed** `2e7567e61` · `513d7cbd3` · `3f7df185d` · `b6c0c1dc0` · `da4133772` (5 commits, 31 files, +5102 / −166)
**Round 1 findings:** 1 major (W7-R1-01) + 11 minor + 3 notes. **Round 1 fix applied: W7-R1-01 only.** The other fourteen were not addressed and are re-verified and carried forward below.

**NOT CLEAN. 1 blocker · 3 major · 15 minor · 6 notes.**

The blocker is a red gate, not a red change: `pnpm --filter @patina/designer-portal test` fails right now, on two date assertions that predate W7 and only fail inside a five-hour clock window. It is still a broken gate in this stage's own gate list, and nothing documents it.

---

## W7-R1-01 — verified fixed

The round-1 major is closed, in the full shape the finding asked for, and I re-measured each of the four parts rather than take the fix report's word:

| Part | Evidence |
|---|---|
| the picker on the studio Agreement-defaults card | `account-studio-page.tsx:1127-1167` — the free-text `<input placeholder="Principal designer">` is a `<Select>` over `ROSTER_RATE_ROLES`; `+ Add a role` (`:1206-1232`) seeds the next free role and is `disabled` once all four are taken |
| `rosterRole` through `studio_agreement_defaults.rate_card` | one `RateCardRow` in `@patina/types`, one `rateCardForSave` mapper used by BOTH the save and the dirty check |
| through `materialize_standard_parts` | `00618` section (6), grafted from `00575:3073` by line range, **two** deltas — the proposal-rates arm (`'rosterRole', r.roster_role`) and the studio-default arm, projected key by key with only the four values admitted. Both pinned by postconditions (`:2361`, `:2364`) and by `agreement_parts_test.sql` cases **40a**/**40b**, which I re-ran green |
| a readiness blocker | `readiness.ts:305` `UNBOUND_ROLE_BLOCKER`, fires on any role with no `rosterRole` on a `rate_card` part, holds send/sign not Save |

`grep -rn "Principal designer" apps/designer-portal/src packages` now returns only comments and test fixtures — §8's Done-when #3 is satisfied. Migration numbers `00618`/`00619` are unique across **every** ref (`git ls-tree` per branch: peer holds `00621+`; `00617` unminted). Commit hygiene is clean: five Conventional-Commit messages, `supabase/config.toml` never staged, no `.env`, no `.next`, no `next-env.d.ts` in the diff.

---

## Gates — re-run in this context, verbatim

| Command | Result |
|---|---|
| `npx supabase db reset --workdir …/agent-portal` | **clean**, exit 0. 00618 + 00619 applied, every postcondition passed |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green, 0 unexpected** (`time_rate_resolution_test.sql` green with case (al)) |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | 10 green / 16, **6 unexpected — the documented six** (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`; `KNOWN_FAILURES.md:97-101`). `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` both green **with** their new asserts |
| `run-sql-tests.sh -d …/supabase/tests/rls …` | 29 green / 31, **2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`). `internal_time_test`, `studio_hours_rollup_test`, `time_entry_admin_write_test`, `project_hours_total_test`, `studio_member_rates_test` all green |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/supabase test` | 102 files / 1255 pass, 12 skipped |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **RED — 2 suites failed, 2 tests failed** (578 / 580 suites, 7405 / 7407 tests). See **W7-R2-01** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (all pre-existing "unused eslint-disable") |
| `pnpm --filter @patina/admin-portal build` | compiled successfully (the §0.24 type-integrity gate) |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test` | 151 suites / 2475 tests, all pass |
| `pnpm db:generate` → `git diff --exit-code database.types.ts` | regenerated against the reset stack: **clean** |
| `python3 ./scripts/generate-legacy-grants.py` (the worktree's own copy, §0.20) | 2648 statements, **seed diff clean** |
| `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/006*.sql` | 14 files incl. `00618`; the seed carries them |

> The runner reports `expected-fail: 0` in every summary because `-d <worktree>/supabase/tests/<suite>` makes it look for `<dir>/KNOWN_FAILURES.md`, which does not exist (the real file is one level up). I matched all eight by name by hand against `KNOWN_FAILURES.md`. Same shape as the plan's own gate lines — not W7's doing.

---

## What I could not refute

| Claim the brief asked me to attack | How it was attacked | Result |
|---|---|---|
| A two-role rate card binds and resolves without free text | re-ran `time_rate_resolution_test.sql` case (al1/al1b/al2/al3/al4) — inserts through RLS as the actor — and independently read both pricing legs. `rate.roster_role = v_role` (resolver `00618:1288`) and `rate.roster_role = v_team_role` (classifier card PICK `:1713`), symmetric, each with the legacy label leg kept and gated on `roster_role IS NULL` | **holds.** A bound card and a label-collision card cannot both answer |
| The countersign carry snapshots the role | `agreement_fee_schedules_test.sql` green through the live rail (`upsert_agreement_parts` → send → sign → countersign), asserting the binding on the projected rate and that every snapshot row EQUALS the source row it froze | **holds** |
| The default label no longer strands | the drafting-room default is `{roles: []}`; the studio-defaults path is now bound (W7-R1-01 fix), normalised and blocked at readiness; `materialize_standard_parts` carries the binding from both arms | **holds for every card created from here on.** Does NOT hold for cards already countersigned — see W7-R2-08 |
| An internal entry can never be billable and never reaches an invoice | `supabase/tests/rls/internal_time_test.sql` green, and it asserts per role: the `00610` CHECK refuses a billable project-less row; `project_unbilled_time` count 0; `claim_time_entries` returns 0; a direct `SET invoice_id` raises through `aad_guard_time_entry_invoice_authority`; `invoice_id` stays NULL | **holds, at the DB** |
| The opt-out really stops auto-start | `hold` (`document-time-provider.tsx:457-462`) awaits `autostartDeclined()` through `qc.fetchQuery` on the same cache entry, after the `pausedRef` check and before `automaticBillableIntent`, and re-checks `heldRef` after. 7 provider cases mock the fetcher at module level | **holds for `hold`.** `resume()` remains ungated — W7-R1-06, still open |
| The disclosure shows exactly once per member | stamped on RENDER via `.update(…).eq('id',me).is('time_autostart_disclosed_at', null)` — idempotent server-side; a `stamped` ref blocks a second mutate per mount; a session flag dedups the event | **the "never again" half holds. The "shows" half does not** — W7-R2-02 |
| HT-35's columns are the member's own to write | `profiles` UPDATE is own-row only (r1 measured it; the policy set is unchanged by this branch) | **holds for writes.** Reads are wider — W7-R2-09 |
| Grafts are their heads' bodies + the named delta | five bodies, each extracted by line range with a banner naming its delta; postconditions `:2192-2219`, `:2361-2364` re-assert the shapes in the deployed bodies; ACLs survive `CREATE OR REPLACE` (r1 measured `pg_proc.proacl`) | **holds. No stale-body revert** |

---

## Findings

### W7-R2-01 · BLOCKER · confidence HIGH (measured, reproduced 3/3) — the designer-portal test gate is RED

```
Test Suites: 2 failed, 578 passed, 580 total
Tests:       2 failed, 7405 passed, 7407 total
```

- `src/components/document/__tests__/command-bar-log-time.test.tsx:210` — `expect(String(sent.startedAt).slice(0,10)).toBe('2026-09-01')` → **Received `"2026-09-02"`**
- `src/components/document/__tests__/hours-ledger-add-row.test.tsx:193` — the same assertion shape → expected `'2026-08-04'`

**Mechanism, measured not inferred.** `startedAtFromDateValue` (`components/document/time-capture.tsx:286-297`) keeps the CURRENT time-of-day and only moves the date: `at = new Date(now); at.setFullYear(y, m-1, d); return at.toISOString()`. `next/jest` loads the app's `.env`, which pins **`TZ=America/Chicago`** — I probed it inside the jest environment and it overrides the shell's `TZ` (a `TZ=UTC npx jest` run reproduces the same failure; the probe printed `TZ America/Chicago`). So from **19:00 CDT to midnight** (00:00–05:00 UTC) the constructed instant crosses UTC midnight and `toISOString()` reports the next day. Measured at 2026-09-13 19:23 CDT / 2026-09-14 00:23 UTC.

**Attribution, stated plainly.** Neither assertion is W7's. `command-bar-log-time.test.tsx:210` came in with W3's `014d81ad4`; `hours-ledger-add-row.test.tsx:193` with W3's `0dd74dde8`; `startedAtFromDateValue` is untouched by this branch; neither failing case goes near the internal door. W7's only edits to those two files are the `useOrganizations` mock and `toHaveLength(2)→(3)`. The impl and round 1 both ran the suite outside the window and reported 580/580 honestly.

It is graded a blocker anyway because the brief's gate list says *green*, this stage cannot be merged on a red `pnpm test`, and — unlike the eight SQL failures — **nothing documents it**, so the next hand in this window will read it as W7's breakage. Two ways out, either acceptable: pin the clock in both cases (`jest.useFakeTimers().setSystemTime(...)`, or date the fixture off midday), or add both to a jest-side known-failures note the way `KNOWN_FAILURES.md:direct_order_attribution_test.sql` records the identical UTC-midnight trap on the SQL side. **The repair is a W3-file repair landing in this stage, not a W7 redesign.**

---

### W7-R2-02 · MAJOR · confidence HIGH (read directly off the code path) — HT-35's one-time disclosure removes itself the instant it stamps, so it is shown for one network round trip

`AutostartBand` (`document-time-provider.tsx:776-838`):

```
const showDisclosure = held && settled && !optedOut && disclosedAt === null && !dismissed;
useEffect(() => { if (!showDisclosure || stamped.current) return;
  stamped.current = true; onDisclose(); … }, [showDisclosure, onDisclose]);
```

`onDisclose` is `markDisclosed.mutate()` → `useMarkTimeAutostartDisclosed` → on success `invalidateQueries(timeAutostartKeys.preference)` → the mounted `useTimeAutostartPreference` refetches → `disclosedAt` becomes non-null → `showDisclosure` flips false → **the band unmounts**. Total time on screen: one `UPDATE profiles` plus one `SELECT profiles` round trip. There is no minimum dwell, no reliance on the `Understood` act (`dismissed` is only a second, earlier exit), and no re-show path — the column is stamped, so it is "once and never again" with the *once* spent on a flash.

The seven new provider cases cannot see this: `useTimeAutostartPreference` is mocked as a static object that never changes after the mutate, so the band stays up in jsdom and `screen.getByText(/Patina keeps the time for you/)` passes.

HT-35's own test is *"appears once and never again"*. It appears for a fraction of a second and never again, which is the same as never having been disclosed. **Fix:** hold the band until the member's own act (dismiss on `Understood`, drive `showDisclosure` off local `dismissed` once stamped), or stamp on dismiss rather than on render, or don't invalidate the preference query from the stamp mutation (set the cache optimistically only for the *next* mount).

---

### W7-R2-03 · MAJOR · confidence HIGH (read directly; both surfaces) — `+ Add a role` now seeds a fully-named, bound role at $0/hr, and nothing stops it reaching a signed contract

Before this wave, `+ Add a role` seeded `{ roleName: "", hourlyRateCents: 0 }` in **both** the composer (`part-editor.tsx`) and the studio defaults (`account-studio-page.tsx`). The empty name was what caught an accidental or unfinished add:

- composer → `BLANK_ROLE_BLOCKER` (`readiness.ts:299`) held the send;
- studio defaults → `rateCardForSave`'s `.filter(role => role.roleName.trim())` dropped the row on save.

W7 seeds `{ roleName: nextFree.label, rosterRole: nextFree.value, hourlyRateCents: 0 }` at `part-editor.tsx:493-503` and `account-studio-page.tsx:1213-1222`. Both guards now pass, and **no other guard asks for a positive rate**:

- `readiness.ts:287-294` only requires that **at least one** role have a rate > 0 — a second role at $0 beside a priced one is clean;
- `upsert_agreement_parts` (`00618:592-596`) only refuses a rate that is *absent or JSON null*; `_agreement_assert_cents` accepts 0;
- `UNBOUND_ROLE_BLOCKER` is satisfied — the row IS bound.

The consequence is worse than the stranding HT-4 exists to close. A bound card wins **tier 1** in both pricing legs, and neither leg filters on a positive rate (`resolve_time_rate_cents` `00618:1279-1293` selects `min(rate.hourly_rate_cents)` and returns `'authority'`; the classifier picks the same row at `:1706-1722`). So every hour that roster role logs prices `rate_source='authority'`, `hourly_rate_cents = 0`, `rated_amount_cents = 0`, `billing_state='authorized'` — it reads as priced, bills at nothing, and `guard_invoiced_time_entry` (`00177:51-84`) freezes it at $0 the moment it is invoiced. After countersign the snapshot is immutable, so there is no repair short of a new agreement version.

Reachability is one stray click on an act that is now, by design, one click away from four seeded roles. **Fix:** a readiness blocker for any rate-card role whose `hourlyRateCents` is 0 (the retainer already has the analogous rule and says so explicitly), and keep the seed at the same shape; optionally leave `hourlyRateCents` unset so `upsert_agreement_parts`' existing "every role needs an hourly rate" refusal bites.

---

### W7-R2-04 · MINOR · confidence HIGH — an internal hour invalidates no cache at all

`useCreateTimeEntry`/`useUpdateTimeEntry`/`useDeleteTimeEntry` now read `onSuccess: (_, {projectId}) => { if (projectId) invalidateProjectTime(...) }`. For a project hour that still fires `timeKeys.all` and `timeKeys.studioUnbilled()`. For an internal hour **nothing runs** — and `timeKeys.ledger(params)` (`use-time-tracking.ts:867`) and `timeKeys.studioRollup(params)` (`:931`) both sit *under* `timeKeys.all`, which is exactly where an internal hour is supposed to surface.

The hours-ledger add row is covered by its own `void refetch()`. The **⌘K door is not**: `log-time-sheet.tsx:227` closes the sheet and relies entirely on the mutation's invalidation. Log a studio hour from ⌘K with the Hours sheet standing in the studio scope and the rollup keeps its old numbers until something else refetches. The code comment ("refetched by their callers") is not true of that path.

**Fix:** invalidate `timeKeys.all` (or at least `timeKeys.ledger`/`timeKeys.studioRollup`) on the project-less branch too.

---

### W7-R2-05 · MINOR · confidence HIGH — picking a role can collide with a legacy label, and the refusal arrives from the server with no warning in the picker

`upsert_agreement_parts` (`00618:563-567`) still refuses two roles with the same `roleName`. The picker disables an option whose **`rosterRole`** is taken, not one whose **label** collides. A card carrying a legacy unbound row labelled `"Lead designer"` plus a second row on which the designer picks `lead_designer` (which rewrites that row's label to `"Lead designer"`) reaches Save as two identically-named roles and is refused with *"the rate card names Lead designer twice"* — a sentence about a name the designer never typed. Escapable (bind the legacy row too), but the picker gave no sign.

---

### W7-R2-06 · MINOR — ruling owed · confidence HIGH — picking a role overwrites the studio's own wording, and the code says the opposite

Both pickers write `roleName: picked.label` alongside `rosterRole` (`part-editor.tsx:435-440`, `account-studio-page.tsx:1140-1148`). No surface can set a rate-card label any more. `part-kinds.ts:426-431` nonetheless states: *"The label is what the client reads; the value is what … match on. They are stored separately so a studio may rename the one without moving the other."* That capability no longer exists in the product — the comment describes a design the UI withdrew. A studio that called its top rate "Principal designer" on a client-facing agreement now reads "Lead designer" after the first pick. HT-4 says "no free text", so this may well be right; it is a copy change on a signed document and nobody ruled it.

---

### W7-R2-07 · NOTE — `00618` carries two sections numbered `(6)`: `classify_project_time_entry_authority` (`:1417`) and `materialize_standard_parts` (`:1839`). Cosmetic; a later graft that cites "section (6)" will be ambiguous.

---

### W7-R2-08 · NOTE — ruling owed · confidence HIGH — every already-countersigned agreement keeps stranding, and the ship report does not say so

00618's Deviation 1 (signed paper is not renormalised) is disclosed and defensible. What is not stated anywhere is its consequence for the defect this wave exists to close: an authority already countersigned from the old default card carries two `project_billing_authority_rates` rows labelled `"Principal designer"` / `"Associate"`, both `roster_role NULL`. Neither normalize-matches, so the legacy leg finds `count(*) = 0`, the single-card fallback needs exactly one card, and **every hour on that project goes on pricing `rate_source='none'`, `pending_authorization`, NULL `authority_rate_id`, for ever** — measured by round 1 as PROBE-A and unchanged by the fix. Section (2)'s `proposal_service_rates` normalisation cannot help either: it only stamps rows whose label already matches, which these by definition do not.

The repair path exists (revise/supersede the agreement and pick the roles), but it is a signed-document ceremony and no surface tells the studio it is needed. Worth one sentence in the ship report and a ruling on whether an owner gets an act that re-binds a live authority's rate rows.

---

### W7-R2-09 · NOTE — ruling owed · confidence HIGH (measured on the stack) — a member's auto-start preference is readable by her studio-mates

`00618` puts `time_autostart_opt_out` and `time_autostart_disclosed_at` on `public.profiles`. Measured `pg_policies` for `profiles` SELECT on the reset stack:

```
profiles_select_self         (auth.uid() = id)
profiles_select_counterparty can_view_profile(id)
profiles_select_admin        <platform admin>
profiles_select_agent_reader true
```

So a studio co-member, any platform admin, and `agent_reader` can all read whether a teammate turned the automatic timer off. Writes are correctly own-row only. HT-35 says *"per-member opt-out on their own profile"* and does not say the answer is private; a working preference about how closely one is timed is the kind of fact a studio might reasonably want kept to its owner. Flagging, not fixing.

---

## Round-1 findings carried forward — re-verified, all still open

The fix round applied W7-R1-01 alone. Each of the following was re-checked against `da4133772` in this context.

| Id | Severity | Status at `da4133772` |
|---|---|---|
| **W7-R1-02** | minor | **FIXED** by `da4133772` — `materialize_standard_parts` delta 1 carries `rosterRole` out of the proposal's own rates; postcondition `:2361` pins it |
| **W7-R1-03** | minor | **open.** The impl's measurement table still carries one HT-35 row (the profile opt-out). Neither the disclosure band nor the opt-out fallback band — both new, both carrying an act — has been measured at 390 or 1440, by the impl, by round 1, or by me. Both read `flex flex-wrap … px-4 py-2` with `min-h-11` acts, so I expect them to pass; expectation is not measurement. The placement question also stands: the band mounts as the first child of `DocumentTimeProvider`, above the whole document shell, so an opted-out member carries a permanent strip above every document page's own chrome |
| **W7-R1-04** | minor — ruling owed | **open.** `account-profile-page.tsx:188-200`: `<input type="checkbox" className="mt-[3px] h-4 w-4">` inside `<label className="flex max-w-md items-start gap-2.5">` with a `text-[13px] leading-relaxed` span and no `min-height` — a ~21px pointer target against the house sheet's 44px floor, worst at 390 |
| **W7-R1-05** | minor | **open.** `hours-ledger.tsx:1226` is still `font-mono text-[11px] uppercase tracking-[0.07em]`; the identical `— internal —` band at `:1597` is `t-head` (`.t-head` = `font-meta / 11px / .08em`). An inline font-size utility against the hard rule, and it will not match its own sibling |
| **W7-R1-06** | minor | **open.** `document-time-provider.tsx:538-565` `resume()` still starts `source: 'timer_auto'` with no preference check. Narrow today (an opted-out member reaches `paused` only via `startManually`), but her resumed hour carries a provenance she declined |
| **W7-R1-07** | minor | **open.** `command-bar-log-time.test.tsx:48` `let mockStudios = []` is still never reassigned; the comment at `:47` still promises an internal-door case; `grep -n "internal\|Studio time"` finds nothing but the two comments. The ⌘K studio door — its option, its held pill, its `projectId:null / studioId / source:'internal'` payload, its `valid` gate — is covered by no test at all |
| **W7-R1-08** | minor — ruling owed | **open.** `use-viewer-studio.ts` `useInternalTimeStudio` still returns `candidates[0]` after sorting by name then id; a member in two design studios silently lands her admin hour on the alphabetically-first, under an option that says only "Studio time — no document" |
| **W7-R1-09** | minor | **open.** `hold` still awaits `autostartDeclined()` (`auth.getUser()` + a `profiles` select) inside the serialised `enqueue`, before `automaticBillableIntent`, under the portal's default 3× retry with 1/2/4s backoff (`lib/react-query.ts:179-193`) — a ~7s worst case in front of the zero-tap path, with every queued act behind it |
| **W7-R1-10** | minor | **open.** `useTimeAutostartPreference` still returns `isSettled = isSuccess \|\| isError` and, on error, `{optedOut:false, disclosedAt:null}`; the band gates on `settled && disclosedAt === null`, so a transient read failure re-serves the one-time sentence and re-fires `time_autostart_disclosed`. (Interacts with W7-R2-02: the error path is the one case where the band *does* dwell) |
| **W7-R1-11** | minor | **open.** `ScopeEntryRow` (`:1796`) still renders every scoped row in one list with no `— internal —` band, and still prints `priced by <studio name>` (`:1818`) over an internal hour, because `row.studio_id` is set and the `"no pricing studio"` arm therefore never fires. The commit body for `3f7df185d` claims the grouping holds in the ledger; it holds only in the mine-scope list and W2's rollup band. Provenance itself is safe — `timeRateProvenance` (`authority-hours.ts:152`) returns `nonbillable` before it can return `pending`, which I re-read |
| **W7-R1-12** | note | **open.** `upsert_design_services_draft` still calls `_project_agreement_terms(…, p_rates, false)` with caller-supplied rates, and `_project_agreement_terms` (`00618:366-368`) now writes `roster_role` from `v_rate->>'rosterRole'` with neither the four-value sentence nor the one-rate-per-role check `upsert_agreement_parts` got. Unreachable today (no live caller sends `rosterRole`); the column CHECK bounds the value at a 23514 |
| **W7-R1-13** | note | **open.** `rosterRoleLabel` (`part-kinds.ts:446`) has no caller in `apps/` or `packages/` — confirmed by grep; the only hits are `.next` build output |
| **W7-R1-14** | note | **open.** `SOURCE_LABEL` (`hours-ledger.tsx:101-105`) still has no `'internal'` key, so an internal row's metadata line prints the raw `internal` beside "no document · non-billable" |
| **W7-R1-15** | note | recorded. §8's portal cites were stale at authoring; the impl said so in its commit body |
| impl-disclosed | note — ruling owed | The role picker is **43px**, the design system's own `<Select>` height, against the house sheet's 44px act floor. Same standing question as W7-R1-04, and a shared-control change either way |

---

## Rulings check

| Ruling | Verdict |
|---|---|
| **HT-4** (enum binding, no free text) | **delivered** on every door a rate card is now written through: the composer, the studio defaults, the seed, the save, both pricing legs, the countersign carry. Not delivered for authorities already countersigned (W7-R2-08) |
| **HT-41** (two-role card, the member picks) | delivered — case (al4) measures the pick deciding the BOUND card; the classifier's `v_team_role` ladder (designer → `NEW.rate_role` → `count(DISTINCT role)=1`) is intact |
| **HT-11** (billable stated at every surface) | respected — internal is the one path where the pill says the answer instead of asking, because `00610`'s CHECK makes it the only answer, and the reason is printed beside it |
| **HT-26** (never a blank; "rate pending" is a fact) | respected, and correctly suppressed for internal rows where a pending alarm has no answer |
| **HT-35** | per-member, cross-device, default on, opt-out on her own profile, falls back to a one-tap manual start that opens the same clock as `timer_manual`. **The "disclosed once" half is defeated by W7-R2-02**; W7-R1-03/04/06/10 remain |
| **HT-15** (W4's portal half) | delivered at both desk doors; the multi-studio choice is unruled (W7-R1-08); the cache half is incomplete (W7-R2-04) |
| **HT-39** | correctly untouched — `useUpdatePhaseEstimates` present, no migration minted, `00620` spent by W2 |
| **P-5** (no flags) | holds — no `useFeatureFlag`, no `ComingSoon`, nothing gated |
| **P-4** (no backfill) | holds — the normalisation touches `proposal_service_rates` and `studio_agreement_defaults` only, unambiguous rows only; postconditions assert no snapshot row written; no `project_time_entries` row read or re-priced |
| **§0.12** (invoiced lock untouched) | holds — no file on this branch touches `guard_invoiced_time_entry`. **Note the interaction with W7-R2-03**: the lock freezes a $0 authority-priced hour exactly as it freezes a correct one |
| **§0.19 / §0.20** (types + ACL seed) | holds — `database.types.ts` and `00-legacy-grants.sql` both regenerate clean from the worktree's own copies |
| **§0.23** (totals above rows) | untouched by this wave |
| **HT-36** (notes never in a rollup) | untouched by this wave |
| **Vision §4/§6** | no dashboard, no tab, no badge, no colour state, no per-second motion, no daily nudge. The fallback band is an affordance, not a nudge — modulo its placement (W7-R1-03) |
| **House sheet §A** | three deviations, all open: the 43px `<Select>`, the ~21px checkbox (W7-R1-04), the inline font-size on the new `— internal —` band (W7-R1-05) |

---

## What I did NOT verify

- **No browser pass.** I did not start a dev server; every 390/1440 figure in `W7-impl.md` and `W7-fix-r1.md` is the lane's own, unreplicated, and the fix round's figures come from a static harness, not the running sheet. W7-R1-03 and W7-R1-04 are read off the CSS.
- **No e2e.** `apps/designer-portal/playwright.config.ts` hard-pins port 3000 and `:54321` — the peer program's port and the shared stack, both forbidden to this lane.
- **Prod not touched.** `00618`/`00619` exist only locally and on the lane branch.
- **iOS untouched** (correctly — W7 carries none).
- The six commercial and two rls failures were matched to `KNOWN_FAILURES.md` **by name**; I did not confirm each still fails for its documented reason.
- I did not chase the `agreementDefaultsDirty` string comparison (`account-studio-page.tsx:647`), which compares `rateCardForSave`'s key order against whatever jsonb key order the DB returns. It looks like a pre-existing always-dirty shape rather than anything W7 changed, and I did not measure it.
- The `TZ=America/Chicago` that defeats W7-R2-01 was read out of the jest environment at runtime; I did not open the `.env` file it comes from (the sandbox denies reading `.env*`).
