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

---

## 8 · Walk fixes — round 1

The two round-1 walks (`walk-ios-r1.md`, `walk-web-r1.md`) returned one blocker and five majors.
All six are closed on this branch. Lane log: `walk-fix-notes.md`. Nothing else in either walk was
touched; every standing minor and nit there is still standing.

| Item | File | What changed |
|---|---|---|
| **`W3R1-B1`** (blocker) | `RecordSheet.swift` | "Keep a copy" was absent from every settled record in the build. `KeepACopyAct`'s `.task` hung off a `Group` that was an `EmptyView` until the image it was supposed to make arrived — and an `EmptyView` carries no modifiers, so the render never ran and the act never drew. The render moved onto `renderAnchor`, a zero-height accessibility-hidden `Color.clear` that always exists; the act above it stays conditional, which was the rule, not the defect. |
| **`W3R1-M1`** | `DecisionDetailView.swift` | The two-plate spread drew "Shak…" at the default text size: C-06's `fixedSize` capsule took its intrinsic width first inside a shared `HStack` and left the title the remainder of 171pt. The capsule is now one view (`recommendedCapsule`) placed by `plateNaming(…)` — beside the title at full width, beneath it when `compact`. The accessibility (`.stacked`) path is unchanged. The extraction also keeps `plate(_:compact:)` under SwiftLint's `function_body_length`, which `lint-delta` fails on. |
| **`W3R1-M2`** | `DecisionDetailView.swift` | Every plate of a three-or-more paged spread ran 24pt off the right edge — the `Recommended` capsule sliced, the clay leaning dot outside the viewport. `.padding(.horizontal, 24)` sat on the `LazyHStack` inside the `ScrollView` while `containerRelativeFrame` measures the scroll view itself. The inset moved to `.safeAreaPadding(.horizontal, 24)` on the scroll view. |
| **`W3W-R1-01`** | `approval-ask.tsx` | P-27's revision act inherited `--color-clay` on #FAF7F2 — 2.17:1, axe's only serious contrast failure left on the doorstep. Both render sites take `text-[var(--text-body)]` (#5C4A3C, 6.94:1). Clay keeps the rules and the caps. |
| **`W3W-R1-02`** | `approval-ask.tsx`, `use-project-approvals.ts`, `hooks/index.ts` | The web had only the write half of the snooze, so a cold load of an approval already snoozed drew the four acts with no said-line. New `useDecisionSnooze(decisionId)` (plain `decision_snoozes` read under `decision_snoozes_owner_select`, no client-side copy of the policy) plus `standingDecisionSnooze(row, now)`, which applies iOS's own honesty rule — `infinity` stands, a lifted hold is refused, an unknown kind or unparseable hour draws nothing. Keyed `projectApprovalKeys.snooze(…)` on the existing invalidation rail. `RemindMe` draws the confirmation on mount; this session's answer wins over the row. |
| **`W3W-R1-03`** | `approval-ask.tsx` | `landmark-unique` still fired: two approvals on ONE artifact edition is the ordinary case (the fixture's own G1/G2 and G6/G7 pairs), and title-plus-edition left both landmarks identical. The decision id now closes every name — `Discussion about {title} · Edition {N} · approval {decisionId}`. The visible heading is untouched. |

Tests for every behaviour changed: `RecordOfDecisionTests` gains the first call the suite has ever
made to `RecordKeepsake.image` (non-nil `UIImage`, non-zero size, print scale) plus the anchor pin;
`DecisionSpreadTests` gains two layout pins; `use-project-approvals.test.ts` gains a six-case suite
over the read half (its shared `createBrowserClient` mock gains a `from` builder); `approval-ask.test.tsx`
gains the landmark-collision case, the two contrast assertions and three snooze re-entry cases.

### Gates on the walk-fix tip

| Gate | Result |
|---|---|
| `IOS_GATE_UDID=B6AD6271-… ios-gate.sh all` | **PASS**, exit 0 — `** BUILD SUCCEEDED **`, **2712 tests in 290 suites passed, 2 known issues** (2708/290 at the carry-fix tip; +4 tests), `✓ lint-delta: no new warnings in touched files` |
| walk-app rebuild → `.build/DerivedDataWalk/…/Debug-iphonesimulator/Patina.app` | **PASS** — `** BUILD SUCCEEDED **`, exit 0; `codesign -dv`: `Identifier=cloud.patina.app`, `Signature=adhoc`, `Sealed Resources version=2 rules=10 files=61` |
| `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/client-portal test` | **PASS** — **122 suites, 1817 tests**, 0 failed (1806 before; +11) |
| `pnpm --dir packages/supabase test` | **PASS** — **85 files, 1024 tests**, 12 skipped, 0 failed (1018 before; +6) |
| deno tests / SQL tests / `supabase db reset` | **NOT RUN, and not owed** — no edge function, no migration and no SQL changed this round |

The first `ios-gate all` run failed compilation, not the fix: the new renderer test read
`UIImage.size` and `.scale` without `import UIKit` in `RecordOfDecisionTests.swift`
(`Property 'size' is not available due to missing import of defining module 'UIKit'`). One import;
the second run is the row above.

### Advisories

1. **Cross-surface snooze copy still diverges.** iOS says *"I'll hold the reminders until Sunday"*
   (`r2 M1` — a snooze only unblocks a letter, the cadence gate still runs underneath); web still
   says *"I'll ask you Sunday."* The read half now draws that web sentence on re-entry as well as
   after the press, so the over-promise is repeated more often than it was. Not in scope for this
   round — no finding named it — but it is the same defect iOS was ruled on.
2. **The web has no equivalent of iOS's `snoozeOptions` filter.** "When it's due" is offered on the
   doorstep whether or not the approval carries a date; iOS drops it (`DecisionSnooze.offered(hasDueDate:)`)
   because an undated "when it's due" is an invented timing. Untouched, and unraised by either walk.
3. **`W3R1-B1`'s class is not closed by its test.** The added pin is a source pin: it asserts the
   anchor exists ahead of the file's only `.task`. Any future `.task` on a conditional `Group` in
   another file has the same silent failure mode and no gate would catch it.
4. **Deploy set is unchanged.** No migration, no edge function. `@patina/supabase` changed, so the
   client-portal Worker must be rebuilt through `infra/deploy-portal.sh` (which rebuilds workspace
   dists) rather than deployed from a stale dist.

---

## 9 · Final fixes — the round-2 walks, closed

Round 2 (`walk-ios-r2.md`, `walk-web-r2.md`) left one major on each surface and the round-1
minors and nits standing. **Everything named in either walk is closed on this branch.** Nothing
else was touched, and no finding was closed by moving a document rather than the code — except
`W3R1-n3`, which *is* a document.

Tip at the start of this round: `a5295a963` (docs); code through `da8f6811b`.

### The two majors

| Item | Files | What changed |
|---|---|---|
| **`W3R2-M1`** (major) | `StudioHubView.swift`, `StudioHubViewModel.swift`, `StudioQueueModels.swift` | On a cold first entry the hub read "Awaiting you, **zero** things awaiting you / Nothing needs a decision." under a summary saying **eight** things needed her eye, and held that reading for as long as she stayed. Two causes. `isLoading` is false for the frames between mount and the `.task` firing, so the hub fell through to its sections and drew every one as empty — the branch now waits on `hasLoaded`. And the approvals leg is deliberately not a `failures` entry (it is the second half of one decision feed), so a projection read that did not answer produced no notice, no staleness line and no error card, only an empty section: new `hasLoadedProjection` holds every empty sentence AND every count word until the merge lands, and `load(retryingProjection:)` asks once more when it has not. The empty sentence also moves — "decision" is a choice between named alternatives and this section holds approvals too — to **"Nothing needs your answer."** |
| **`W3W-R2-01`** (major) + **`W3W-R1-05`** | `00573`, `use-project-approvals.ts`, `lib/record-of-decision.ts`, `record-sheet.tsx`, both record routes | The keepsake derived its signature block from the OUTCOME — approved therefore `electronic_signature` therefore "Signed electronically by typed name.", under an unconditional heading "Signed". So every approval answered before 00569 (every approval standing in production) printed a provenance claim its row cannot substantiate over an empty name line, and a RETURNED record was headed with the word for the act she did not perform. 00573 now projects `clientConsentMethod`, and `signatureBlock` composes the sheet **from the row**: `electronic_signature` + name → "Signed" / "Signed electronically by typed name: {name}."; `click_through` → "Confirmed" / "Confirmed by press-and-hold.", no name at all; `paper` → "Signed on paper."; NULL → **"Recorded" / "Recorded on {date}."**, no signature claim and no empty name line. |

### The nits and minors, all of them

| Item | Files | What changed |
|---|---|---|
| **`W3R1-n2`** | `PatinaStamp.swift`, `DecisionDetailView.swift`, `instruments/stamp.tsx` | A settled option choice was stamped APPROVED. Twelfth state on both surfaces: **CHOSEN**, mocha, doubled, tilted — APPROVED's twin in every dial but the word. The legacy iOS rail stamps by what the act was; a client sign-off, which carries no options by design, keeps APPROVED. `previously.tsx`'s "Answered" is deliberately untouched: it is a retired NOTE's lifecycle word, not a mark, and the web renders no option choice today. |
| **`W3R2-n1`** | `RecordOfDecision.swift`, `ProposalsViewModel.swift`, `ProjectApprovalBlock.swift` | Two pieces of the same paper carried different letterheads. `RecordOfDecision.masthead(projectId:projects:)` is now the only resolution for both rails. The seal sentence keeps the stricter `W2R1-m2` rule — it names a house or nothing. |
| **`W3R1-n3`** | `iose-notes.md` | Amended in place (not rewritten): `d2e6eefb7` restored the inline optional signature to the spread, so an option choice **can** be signed; what was removed is the modal consent step. |
| **`W3R1-n1`** | `00572`, `she_sets_the_pace_test.sql`, `DecisionPace.swift`, `approval-ask.tsx` | `set_decision_snooze` refuses a hold on an approval past its date — `RAISE EXCEPTION 'decision_past_due' USING ERRCODE = 'check_violation'`. The rule lived at two clients and one downstream reader; it lives at the write now. Both surfaces map the token onto the refusal sentence they already draw in the act's place, so a screen that raced the date says the rule rather than "that didn't save". |
| **`W3R2-n2`** | `00572` | "Tomorrow morning" is `next_local_morning(zone, now)` — the next 8am local. The old `date_trunc('day', now) + 1 day + 8h` read right at nine in the evening and held the reminders thirty-two hours at a quarter past midnight. Same answer as before on every choice made after 8am. |
| **`W3W-R1-06`** | `approval-ask.tsx` | The leaf of a thread — the newest edition, the one actually asking her something — drew "Review previous edition" as its one act. `revisionAct` points forward or returns nothing; the predecessor keeps "Review revised edition". No backward act was reinstated elsewhere. |
| **`W3W-R1-07`** | `details-sheet.tsx` | The legacy "Digest frequency" group is gone from the homeowner's sheet — it stood directly above the reminder cadence, was itself set, and nothing said which governed approval mail. The column stays and so does any studio-side use; the reconciliation is what goes. |
| **`W3W-R1-09`** | `approval-ask.tsx` | "Don't remind me" now says iOS's sentence word for word — *"I'll hold the reminders. Choose again here whenever you want them back."* — and "When it's due" is not offered on an undated approval (`snoozeActsOffered`, mirroring `DecisionSnooze.offered(hasDueDate:)`). |
| **`W3W-R1-04`** | `use-commercial-client.ts`, `lib/threshold/refusal.ts`, both record routes | A 403 is answered once and reads "This record could not be found." at once. New `isPermissionRefusal` (SQLSTATE `42501` / status 403, the repo's own idiom) and `retryUnlessRefused` — React Query's three tries for a bad moment, none for a closed door. |
| **`W3W-R1-08`** + **`W3W-R1-n1`** | `record-sheet.tsx` | Three landmarks — banner (toolbar), main (sheet), contentinfo (maker's mark) — so axe's `region` rule has nothing outside one; the inner letterhead is a plain block, not a second `<header>`, so `landmark-unique` cannot fire either. Print CSS forces `html`/`body` white as well as the sheet. |
| **`W3W-R1-n2`** | `approval-ask.tsx` | The date line reads **"Due August 31 · past its date"** in body ink — words, never the retired one, never a colour. Same refusal the money rail keeps with "Past due · {date}". |
| **`W3W-R1-n3`** | `details-sheet.tsx` | "Re-engagement" → **"Occasional notes from your studio"**. |

Deliberately not closed, and why: **`W3W-R2-n1`** (two approvals on one artifact edition print the
same MARK) is provenance of the drawing, which is what the checksum is; it was raised as "worth a
line in the docs if not a change in the code" and no ruling asked for the change. **`W3W-R2-n2`**
(the four Remind-me acts carry no `aria-pressed`) is recorded in the walk as a deliberate choice.

### Tests added or moved

`StudioHubProjectionTests.swift` (new, 8 cases — loading / answered-empty / answered-non-empty,
plus the failed-projection shape and the retry); `PatinaStampTests` +2; `RecordOfDecisionTests` +3;
`record-of-decision.test.ts` rewritten onto `signatureBlock` (7 cases, all four column values);
`refusal.test.ts` (new, 9 cases); the decision record page +4 (Recorded / stored-method /
paper / landmarks) and its 403 case; the proposal record page +2; `approval-ask.test.tsx` +6
(leaf-has-no-act, the two snooze-offer cases, the past-due refusal, the two date-line cases);
`details-sheet.test.tsx` +2; `use-project-approvals.test.ts` +1.

### Gates on the final tip

| Gate | Result |
|---|---|
| `IOS_GATE_UDID=B6AD6271-… ios-gate.sh all` | **PASS**, exit 0 — `** BUILD SUCCEEDED **`, **2725 tests in 291 suites passed, 2 known issues**, `✓ lint-delta: no new warnings in touched files`. Log: `ios-gate-final-r2.log` |
| walk-app rebuild → `.build/DerivedDataWalk/…/Debug-iphonesimulator/Patina.app` | **PASS** — `** BUILD SUCCEEDED **`, exit 0. `codesign -dv`: `Identifier=cloud.patina.app`, `Signature=adhoc`, `Format=app bundle with Mach-O universal (x86_64 arm64)`, `Sealed Resources version=2 rules=10 files=61`. The fix is in the bundle: `nm -a Patina.debug.dylib \| grep -c isAwaitingProjection` → **4** |
| `pnpm --filter @patina/client-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/client-portal test` | **PASS** — **123 suites, 1841 tests**, 0 failed (122/1817 at the walk-fix tip) |
| `pnpm --filter @patina/supabase type-check` / `test` | **PASS** — no output; **85 files, 1024 tests**, 12 skipped, 0 failed |
| `supabase db reset` + `scripts/run-sql-tests.sh` | **PASS** — reset clean, then **159 total · 138 green · 21 expected-fail · 0 unexpected · effective-green 159/159**. `she_sets_the_pace_test.sql` **PASS**. Logs: `sql-tests-final.log` |

Two SwiftLint ceilings were paid on the way, both by moving lines rather than by silencing a rule:
`StudioHubView`'s badge helpers moved into the file's existing private extension (`type_body_length`
300), and `DecisionsViewModel` is at exactly 500 lines (`file_length`) with the new flag's whole
note living in `DecisionPace.swift`.

### Notes for the deploy

1. **The deploy set grows by one migration.** `00572` and `00573` were both edited **in place** —
   branch-only files, unapplied on Strata, recorded in `stack-reset-notice.md`. Both must be
   pushed; `00573` redefines `get_project_decision_reviews`, so anything that redefines it after
   00573 must carry `clientSignature` **and** `clientConsentMethod` forward.
2. **No edge function changed**, and no `_shared` module — no importer redeploy is owed.
3. **`@patina/supabase` changed** (the projection's two new keys), so the client-portal Worker is
   built through `infra/deploy-portal.sh`, never from a stale dist.
4. **Prettier drift is inherited**, as in every prior round: `prettier --check` fails on the base
   versions of the client-portal files this round touched. Nothing was reformatted.
5. **The local stack was reset from this branch's tree** at the end of this round. A peer program
   needing its own unmerged schema re-resets from its own worktree.
