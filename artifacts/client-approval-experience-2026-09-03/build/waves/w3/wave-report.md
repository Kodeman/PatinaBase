# Wave 3 — wave report

"The Decision, Delivered" · Wave 3 = **the habit** · integration pass 2026-09-05.

Branch `approvals/w3-integration`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`. Nothing pushed. No
production mutation. No `.env` read or written. No `.claude/`, `.agents/`, hook or settings
file touched.

---

## 1 · What merged

Three lanes, `--no-ff`, in the briefed order, then `origin/main` twice — it moved under us while
Wave 3 built, because the peer `studio-invoices` program shipped mid-wave.

| Commit | Subject |
|---|---|
| `a61e16dbf` | `chore(approvals): merge w3-backend` |
| `8d956eac5` | `chore(approvals): merge w3-web` |
| `d54b6fac8` | `chore(approvals): merge w3-iose` |
| `9c38a2645` | `chore(approvals): merge main — studio invoices landed` |
| `ca57c899f` | `chore(approvals): merge main — studio invoices deploy report` |

The tip is a descendant of `origin/main` at `fd064e56e`.

### Conflicts — two, both against main, both resolved minimally

1. **`supabase/seed/00-legacy-grants.sql`** — both sides appended their own migration's grant
   block. Kept both, 00571's ahead of 00572's, and closed the `DO $g$` block the markers had
   truncated. `DO`/`END` counts balance at 2196 each; the seed replays clean (see the reset
   below).
2. **`apps/client-portal/src/components/threshold/house-ledger.tsx`** (`owedWords`) — kept
   main's studio-invoice arms and applied P-24's `countInWords` speller to all three, then moved
   the four figure-spelled expectations in `house-ledger.test.tsx` / `threshold.test.tsx` onto
   words to match.

No other product code was written in this lane.

---

## 2 · Migrations — nothing renumbered

| File | Lane |
|---|---|
| `supabase/migrations/00572_she_sets_the_pace.sql` | backend |
| `supabase/migrations/00573_approval_record_typed_name.sql` | web |

Main's ledger tops out at `00571_studio_invoices.sql` (the peer program, now merged). 00570 was
never landed — it exists only on the unmerged `approvals/w2-web` tip, folded into 00569 at Wave 2
integration. **No collision, so our files stayed where the lanes minted them, and main's
migrations were not touched.**

### The three-lane contract, verified reconciled on the merged tree

The web lane coded three shapes against a backend that did not yet exist on its branch. All three
now match what 00572 actually built — read back off the reset local stack, not off the notes:

| Contract | On the merged tree |
|---|---|
| Snooze RPC | `set_decision_snooze(p_decision_id uuid, p_kind text)` — and `useSetDecisionSnooze` calls it with exactly `p_decision_id` / `p_kind` |
| Cadence tokens | column CHECK is `right_away` · `daily` · `weekly_sunday`; `@patina/shared`'s `ReminderCadence` union and zod enum are the same three; the edge functions carry a `normalizeReminderCadence` that maps the retired `immediate` / `daily_digest` spellings forward |
| Deploy order | migrations → edge functions → portals; unchanged, and load-bearing here (both new acts refuse until 00572 lands) |

---

## 3 · Gates — all green

Run on the merged tip, from the integration worktree.

| Gate | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/client-portal test` | **PASS** — **122 suites, 1812 tests** |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/supabase test` | **PASS** — 85 files, 1018 passed / 12 skipped |
| `pnpm --filter @patina/designer-portal type-check` | **PASS** |
| `pnpm --filter @patina/designer-portal test` (full jest) | **PASS** — **515 suites, 6174 tests**, 1 snapshot |
| `pnpm --filter @patina/notifications test` | **PASS** — 6 files, 89 tests |
| `pnpm --filter @patina/shared test` | **PASS** — 3 files, 51 tests |
| `pnpm --filter @patina/admin-portal build` | **PASS** — run because `packages/supabase` changed; the strictest gate in the repo |
| `deno test --allow-all _shared/ decision-first-notice/ notification-digest/ proposal-nudge/` | **PASS** — **322 passed, 0 failed** |
| `deno check` over the 10 touched/importing function entrypoints | **PASS** — all 10 checked, exit 0 |
| root `deno.lock` | **absent** — no lock pollution |
| `supabase db reset` | **PASS** — replayed from this tree; ledger `00573, 00572, 00571, 00569, 00568` |
| `./scripts/run-sql-tests.sh` | **PASS** — **159 total · 138 green · 21 expected-fail · 0 unexpected**; effective 159/159. The new `supabase/tests/notifications/she_sets_the_pace_test.sql` **PASS** |
| types regen | **IN SYNC** — regenerated off the reset DB, `diff` against `packages/supabase/src/database.types.ts` is empty (35,410 lines both) |
| `IOS_GATE_UDID=B6AD6271-… ios-gate.sh all` | **PASS** — `** BUILD SUCCEEDED **`, **2704 tests in 289 suites passed, 2 known issues** (the same pre-existing `BrandVoiceLint` "curated_mix" and `RoomLifecycleTests.theTodayRailFollowsALocalDelete` pair both iOS lanes have reported since Wave 1) |

### Client e2e — `npx playwright test`, service-role key exported from `supabase status -o env`

**26 passed, 3 failed.** Two of the three are the named pre-existing setup failures on main:

- `tests/plans-link.spec.ts:190` — plan transmittal guest link
- `tests/share-link.spec.ts:114` — guest share link; fails in setup with
  `23514 proposal b0000000-…-0002 is sent, so its authored copy is immutable`

The third is **not a Wave 3 regression, and it is not a flake in the fixture either — it is a
clock-zone artifact**, diagnosed rather than waved through:

- `tests/threshold.spec.ts:158` expected `September 12`, page said `September 13`.
- The seed writes the due date as `CURRENT_DATE + 7`, evaluated **in the database, which runs
  UTC**. The spec computes its expectation with `new Date()` **in the host's zone, CDT**. At the
  moment of the run the DB read `2026-09-06` and the host read `2026-09-05` — five hours apart,
  across midnight. `psql` confirmed `current_date = 2026-09-06`, `current_date+7 = 2026-09-13`
  while `date` on the host said `Sat Sep 5 22:34 CDT`.
- `git diff --name-only origin/main...HEAD -- apps/client-portal/tests/` is **empty** — Wave 3
  touched no e2e spec.
- Re-run under `TZ=UTC`, which makes the two clocks agree: **13 passed, 0 failed** — the whole
  `threshold.spec.ts` file, including `:158`.

So every gate is green excluding the two named pre-existing failures. This third one is logged as
an advisory against the spec, not against the wave — it will turn any suite red between local
7pm and midnight, and it will do so again next time regardless of what ships.

---

## 4 · Deploy set — computed over `fd064e56e...HEAD`

**Order is load-bearing: migrations → edge functions → portals.** Both new client acts refuse
until 00572 is applied.

### Migrations (above main's highest, 00571)

1. `supabase/migrations/00572_she_sets_the_pace.sql`
2. `supabase/migrations/00573_approval_record_typed_name.sql`

### Edge functions — 6

One `_shared` module changed: `_shared/decision-notify.ts`. The deploy set is its transitive
importers ∪ the changed function directories:

| Function | Why |
|---|---|
| `decision-first-notice` | dir changed **+** imports `decision-notify.ts` |
| `decision-reminders` | imports `decision-notify.ts` (`index.ts`, `logic.ts`) |
| `decision-resolved-notify` | imports `decision-notify.ts` |
| `expire-decisions` | dir changed **+** imports `decision-notify.ts` |
| `notification-digest` | dir changed **+** imports `decision-notify.ts` |
| `proposal-nudge` | dir changed **+** imports `decision-notify.ts` |

`invoice-reminders` **is not in the set.** It greps for `decision-notify` but only in a comment
(`index.ts:4`) — it has no import of it. Checked explicitly, because a grep-only deploy set would
have carried it.

### Portals — 2

- **`client-portal`** — the wave's own surface (record routes, successor thread, cadence picker,
  snooze).
- **`designer-portal`** — **no designer source file changed**, but it consumes the two
  `@patina/supabase` hooks this wave rewrote (`use-notification-preferences`,
  `use-project-approvals`) from `src/app/preferences/page.tsx`, `src/app/(document)/doc/[id]/page.tsx`
  and `src/components/document/approvals/project-approval-document.tsx`. A portal bundles the
  package's dist, so skipping it ships a stale one. Deploy it.
- `admin-portal` is **not** required: `packages/supabase` changed, but admin imports neither
  changed hook — only `database.types.ts`, which is compile-time. It was built as a gate, not
  queued as a deploy.

### pg_cron — four jobs, two of them replacements

00572 reschedules. Verified on the reset stack (`select jobname, schedule from cron.job`):

| Job | Schedule | Note |
|---|---|---|
| `decision-reminders-hourly` | `0 * * * *` | **replaces** `decision-reminders-daily` (00092, 09:00 UTC), which is unscheduled — the per-recipient not-before-8am-local gate needs an hour to release into |
| `notification-digest-hourly` | `20 * * * *` | **replaces** `notification-digest-daily` (00278, 15:00 UTC) — the summary owes the same 8am-local, never-Sunday promise as the letter, and a once-a-day cron cannot keep it |
| `client-push-window-release` | `*/15 * * * *` | new — `public.release_due_client_pushes(200)`, dispatching push envelopes held outside 8am–8pm local |
| `decision-first-notice-retry-sweep` | `*/30 * * * *` | new — `public.sweep_decision_first_notices(100)` |

Both retired daily jobs are confirmed **absent** from `cron.job` after the replay. On Strata the
`cron.unschedule` guards are `IF EXISTS`, so the migration is safe whether or not the old rows
are there.

---

## 5 · Walk prep

### iOS walk

Debug simulator build, signing left **on**, at the same path Waves 1 and 2 used:

```
xcodebuild build -scheme Patina -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath …/apps/mobile/Patina/.build/DerivedDataWalk
```

`** BUILD SUCCEEDED **`, exit 0. `codesign -dv` on the bundle: `Identifier=cloud.patina.app`,
`Signature=adhoc`, `Format=app bundle with Mach-O universal (x86_64 arm64)`, `Sealed Resources
version=2 rules=10 files=61` — the normal simulator signature.

**walkAppPath**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration/apps/mobile/Patina/.build/DerivedDataWalk/Build/Products/Debug-iphonesimulator/Patina.app`

Install on `cae-w1-walk` `29E64516-9C2F-4D77-95D8-55D7B61E017B` (erased at wave start, still
`Shutdown`). `Secrets.swift` was copied into the integration worktree at
`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift` — untracked and gitignored, as every
wave.

What the iOS walk is for: **P-30** the decision spread (two equal plates side by side; three or
more as a paged spread under a clay dot rule, never "2 of 4"; a tap sets a *leaning* and submits
nothing; one hold-to-act reading "I choose {option name}"), **P-26**'s Keep-a-copy half, and
**P-28**'s cadence and snooze on the phone.

### Web walk

`artifacts/client-approval-experience-2026-09-03/build/waves/w3/web-walk-env.md`, written to the
Wave 2 shape: the three pinned env vars and how to read them out of `supabase status` without
them reaching a file, the dev server command on :3002 from this worktree, the seeded homeowner
and her figures, and what to look for in each of P-26 / P-27 / P-28 — including the two acts the
seed cannot reach without a Stage-2 approval authored from the designer portal first.

It carries the UTC/local due-date warning from §3, so a walker reads the day off the letterbox
rather than off their own wrist.

---

## 6 · Findings merged as advisories

Both lane verdicts were *fix*, each with one open **major**. Neither is a BLOCKER; both are
documented in their lane notes and ride onto the branch.

- **backend M-R3-01** — `decisionsMailedDirect` uses the whole digest window instead of a
  24-hour floor. An approval whose direct letter left early in a stretched window can be
  suppressed from a later summary it should still appear in. It **under-sends**; it never
  over-sends, and it never suppresses an overdue notice or a superseding edition, so R16 holds.
- **iose R3-M1** — the "Don't remind me" confirmation promises an end condition nothing
  implements beyond the overdue notice. A copy/behaviour mismatch in the safe direction: it goes
  quieter than the sentence claims, never louder.

New this pass, against the test suite rather than the product:

- **INT-A1** — `apps/client-portal/tests/threshold.spec.ts:54` computes `INVOICE_DUE_DAY` in the
  host's zone while the seed computes the due date in the DB's UTC. The two disagree for the
  hours between local evening and UTC midnight, and the spec goes red on a correct page. The
  comment above it already says a literal date "turned the suite red the next morning" — the fix
  it reached for solved the wrong half. Reading the day from the DB (or pinning `TZ=UTC`) closes
  it. Not fixed here: this lane writes no product or test code beyond conflict resolution.

Carried, unchanged: Prettier warns on files these lanes touched; it warned identically on the
base versions in Waves 1 and 2, and the hook itself says it is advisory locally.

---

## 7 · Carry fixes — the two open majors, closed

Both `fix`-verdict majors from §6 are now closed on this branch. Lane log:
`carry-fix-notes.md`. Nothing else in either review was touched; every standing minor and nit
listed there is still standing.

| Item | Commit | What changed |
|---|---|---|
| **backend `M-R3-01`** | `98ead8ebe` | `notification-digest` gives the already-mailed check its own 24-hour floor. New pure helper `directMailWindowStart(windowStart, now)` = the LATER of the summary's window start and `now − 24 h`; `collectItems` passes that to `decisionsMailedDirect` and keeps `digestWindowStart` for its own collection. ux/03 §282 counts days; the digest was applying it over a period, so `weekly_sunday` dropped every approval announced that week (each mails its first notice direct) out of the Sunday summary, and its reminder never mailed either — it was held `cadence_digest` with `reminder_sent_at` stamped. |
| **iose `R3-M1`** | `3066f8c6e` | `DecisionSnooze.never.holdsUntil` is now *"I'll hold the reminders. Choose again here whenever you want them back."* — the act that ends the hold, not a return nothing detects. `confirmation` still appends `theTwoThatStillReachHer`, so `R16`'s two exceptions are still spoken. Pinned as a full-string equality plus a loop over the forbidden end-conditions. |
| **iose `R3-M1`, second half** | `3066f8c6e` | The chosen snooze now survives re-entry: `DecisionsAPIClient.decisionSnooze(decisionId:)` reads `decision_snoozes` (own row, `decision_snoozes_owner_select`), `DecisionSnooze.standing(kind:snoozedUntil:now:)` refuses a hold that has already lifted, and `loadSnooze` runs in `load(decisionId:)` when a projection arrived. A failed read says nothing and never sets `snoozeFailed`. |
| **`R3-m2`, as a consequence** | `3066f8c6e` | The "Remind me" menu is drawn whether or not a snooze stands — the new sentence says *choose again HERE*, and with the read-back the old `if/else` would have hidden the control permanently. Identifiers unchanged; pinned structurally (no `else` between the two accessibility ids). |

### Gates on the carry-fix tip

| Gate | Result |
|---|---|
| `deno test --config supabase/functions/deno.json notification-digest/logic.test.ts` | **PASS** — **24 passed, 0 failed** (22 before; +2 for `M-R3-01`) |
| `deno test --config supabase/functions/deno.json _shared/` | **PASS** — **284 passed, 0 failed** |
| `deno check --config supabase/functions/deno.json notification-digest/index.ts` | **PASS** |
| root `deno.lock` | **absent** — the shared config was passed on every run |
| `IOS_GATE_UDID=B6AD6271-… ios-gate.sh all` | **PASS**, exit 0 — `** BUILD SUCCEEDED **`, **2708 tests in 290 suites passed, 2 known issues** (2704/289 before; +4 tests, +1 suite), `✓ lint-delta: no new warnings in touched files` |
| walk-app rebuild → `.build/DerivedDataWalk/…/Debug-iphonesimulator/Patina.app` | **PASS** — `** BUILD SUCCEEDED **` |
| `supabase db reset` / SQL tests / client-portal / designer-portal / packages | **NOT RUN, and not owed** — no migration, no SQL, no portal and no package file changed; the iOS read goes through the table's existing SELECT policy |

The gate ran twice. The first run built and tested green but **failed `lint-delta`** with two new
warnings the fix itself introduced: `DecisionsViewModel.swift` crossed `file_length` (505 > 500) and
`DecisionPaceTests.swift` crossed `type_body_length` (312 > 300). Closed by compressing the view
model's added comments and moving the four read-back tests into their own suite,
`DecisionSnoozeReadBackTests`, in the same file — the same split the file's own header describes.
The two known issues are the pre-existing `BrandVoiceLint` "curated_mix" and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete` pair both iOS lanes have reported since Wave 1.

### Advisories

1. **`n-R3-05` shrinks but does not close.** `decisionsMailedDirect`'s `.limit(200)` still has no
   `order`. It now pages a day rather than a period, so a reader would need 200+
   `decision_required` email rows inside 24 hours to hit it.
2. **`R3-n3` reaches one more reader.** `theTwoThatStillReachHer` is appended to every
   confirmation, including on an undated approval where "If the date passes" points at no date —
   and the read-back means that sentence is now drawn on re-entry, not only in the session that
   chose it. The string is unchanged; the exposure is wider.
3. **Deploy set is unchanged except one function.** `notification-digest` must be redeployed;
   `_shared` was not edited, so its importers are not owed a redeploy for this fix. No migration.
4. **Prettier drift is inherited**, as in Waves 1 and 2: `prettier --check` fails on the base
   versions of all three `notification-digest` files at `42d9057e4`. Nothing was reformatted, and
   `deno fmt --check` is clean for every line these commits added.
