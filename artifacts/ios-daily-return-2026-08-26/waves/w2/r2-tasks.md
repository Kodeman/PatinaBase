# W2 · lane R2 — the Record UI — task list

Written before any code, per the program's writing-plans rule: failing test → run → implement → run
→ pathspec commit. One task per item of the brief's DELIVER list, plus the MJ-5 copy ruling and the
W1b carry-over 8a.

**Branch** `daily-return/w2-r2`, rebased onto `daily-return/integration` @ `59b389293` (R1's data
layer, R3's deletions and lane D's migrations are all beneath this lane — the first R2 dispatch died
before its first commit, so the lane starts empty on the integration tip).

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r2` ·
**Simulator** `0B472471-1E2E-4C04-825A-8668695264C1` (`dr-w2-r2`) ·
**DerivedData** `.build/dd` inside the worktree on every `xcodebuild`.

Gate for every task: `xcodebuild test … -only-testing:PatinaTests -derivedDataPath .build/dd`.
Full gate at the end: `scripts/ios-gate.sh build` (twice on a fresh tree) + the whole `PatinaTests`
tier + a signed `.app`.

---

## T1 — Home composition per tier, as a pure function

*Files:* `Patina/Features/Home/Models/TodayExperience.swift` ·
`PatinaTests/HomeCompositionTests.swift` (new)

The blocks a tier mounts are a rule, not a view. `TodayExperience` gains `HomeBlock`,
`HomeComposition.blocks(for:)` and the card-weight rule, so the composition is pinned without
rendering anything.

Failing tests first (`HomeCompositionTests`):
- guest with an empty record → `.record` is **absent**; `.startWithARoom`, `.story`, `.signInLine`
  present; no `.designerSeat`, no `.savedSummary`.
- discovering with an empty record → `.record` absent (synthesis §5 graft, overriding B §2).
- discovering with one MOVED row → `.record` present, still no `.designerSeat`.
- engaged with an empty record → `.record` **present** (the truthful empties draw) and
  `.designerSeat` present.
- activeProject → record, seat, house rail, story, in that order.
- `NEW THIS WEEK` is in the list at ≥3 rows and absent at 2.
- Next Move is the second block only when `record.needsYou.isEmpty`.
- weight: `.record` is `.hero` when the record is non-empty, and the story is `.row(96)` whenever
  the record drew anything.

## T2 — `HouseRecordCard`, and the row presentation rules

*Files:* `Patina/Features/Home/Views/HouseRecordCard.swift` (new) ·
`PatinaTests/HouseRecordCardTests.swift` (new)

The card is two eyebrows (`NEEDS YOU` / `MOVED`, DM Mono, uppercase), 56 pt rows with a hairline
between them, the state on the right, `See all →` when `hasMoreNeedsYou`/`hasMoreMoved`, and the
tier-dependent empties. What a row prints on the right is extracted as
`HouseRecordRowPresentation` so it is testable without a snapshot.

Failing tests first:
- a decision `.overdue` → lead `asked Aug 22`, late fragment `overdue` (the only red on the card
  besides money that is actually late).
- a proposal `.due(Sep 8)` → `by Sep 8`, nothing red.
- an invoice `.amount(425000, due: Sep 1)` not yet late → `$4,250.00 · due Sep 1`, not red; the same
  row after Sep 1 → red.
- a MOVED row with `isNew` → `Aug 25` plus a `· new` tick.
- **a row with `isStandingCondition` → no date, no tick** (r1-notes §9.1), whatever `isNew` says.
- `State.new` never appears (r1-notes §9.2) — the presentation treats it as `.none` and the builder
  never emits it.
- every row's VoiceOver label names the row and its state.
- the empties: `Nothing needs you right now.` / `Nothing moved since <weekday>.`

## T3 — MJ-5, the decision line (Fable's copy ruling)

*Files:* `Patina/Features/Home/Models/HouseRecord.swift` (R1's file — widening recorded in
`r2-notes.md`) · `PatinaTests/HouseRecordBuilderTests.swift`

`<Designer first name> asked about <decision title>.` when the decision carries a title;
`<Designer full name> asked you to choose.` only as the fallback. The proposal and invoice lines are
untouched and stay verbatim.

Failing tests first: the titled case; the untitled fallback; the one-word-name case (a
`business_name` fallback has no first name to take, so the whole name is the first name).

## T4 — The record's data path in `DailyRoomViewModel`

*Files:* `Patina/Features/Home/ViewModels/DailyRoomViewModel.swift` ·
`Patina/Features/Home/ViewModels/RecordRefresh.swift` (new) ·
`Patina/Core/Network/ProductAPIClient.swift` (the by-id read; unowned in W2, authorised by the
brief) · `PatinaTests/RecordRefreshOrderTests.swift` (new)

Order, pinned: `RecordSnapshotStore.load()` paints FIRST → `HouseRecordBuilder.build(…)` →
`RecordSnapshotStore.save(record)` → `LastSeenStore.markSeen()` **after** the build (r1-notes §3).
`products:` is the saved pieces' products fetched **by id, withdrawn ones included** — the one
addition to `ProductAPIClient` (`id=in.(…)`, no `deleted_at` filter; `get_recommendations` can never
return a withdrawn row).

Failing tests first:
- the snapshot paints before the build runs;
- `markSeen` stamps only after the build — inside the build closure the store still reads the old
  visit;
- a failed build leaves the snapshot's record on screen.

## T5 — The header: date, greeting, bell, the labelled `Studio` control

*Files:* `Patina/Features/Home/Views/DailyGreetingHeader.swift` ·
`PatinaTests/HomeHeaderTests.swift` (new)

`TimeOfDay.current.greeting` under the date line; the bell keeps its unread badge; the bare monogram
becomes a labelled `Studio` control printing `BadgeCountService.shared.attentionCount`.
`AttentionCountTests.everyConsumerReadsTheOneHint` reads `DailyRoomView.swift` by path and requires
`badges.studioHint` to stay in it — the read stays, at that path.

Failing tests first: the control prints the count and is labelled `Studio`; zero draws the label
without a number; the header names `Today` to VoiceOver (C4).

## T6 — `YourDesignerSeat`

*Files:* `Patina/Features/Home/Views/YourDesignerSeat.swift` (new) ·
`PatinaTests/DesignerSeatTests.swift` (new)

Name · studio · one line of what she is doing (from `liveLead`'s stage, else the project's phase) ·
`Message` via `MessagingAPIClient.createThread(projectId:)`, falling back to
`createDirectThread(counterpart:)` when there is no project. Draws from engaged upward.

Failing tests first: the seat's one line for each source; no project → the direct-thread path; no
designer → no seat.

## T7 — `YourHouseRail`

*Files:* `Patina/Features/Home/Views/YourHouseRail.swift` (new) ·
`Patina/Core/Network/ProjectsAPIClient.swift` (the `project_rooms` read; steward §5d proves the RLS
policy exists and tells R2 to raise the missing fetch path as a note) ·
`PatinaTests/YourHouseRailTests.swift` (new)

Project rooms as read-only cards with their real `budget_cents`/`committed_cents` where present,
local `RoomModel`s beside them, `Add a room` last; at guest/discovering with no room the two-act
`Start with a room` block, **type the dimensions first, scan it second**.

Failing tests first: a project room with a budget prints `$18,400 of $32,000 committed`; one with no
figures prints its name alone and no invented number; the two acts' order; an activeProject client's
house is never the empty state.

## T8 — `NewThisWeekRail`

*Files:* `Patina/Features/Home/Views/NewThisWeekRail.swift` (new) ·
`PatinaTests/NewThisWeekTests.swift` (new)

`get_recommendations` rows with `published_at` inside 7 days; **≥3 or it does not draw**; never pads.

Failing tests first: 3 rows draw, 2 rows do not; a row published 8 days ago is filtered out; a row
with no `published_at` is filtered out.

## T9 — The story, demoted, ordered, with its real unread dot

*Files:* `Patina/Core/Network/EditorialStoriesAPIClient.swift` ·
`Patina/Features/Home/Views/DailyRoomView.swift` · `PatinaTests/StoryOrderTests.swift` (new)

Order becomes `published_at desc, sort_order desc` (B §2: a newer story must not be buried by a
lower sort order). The card sits below the record and drops to a 96 pt row when the record drew
anything; the unread dot is SP-18's stored read id, unchanged.

## T10 — Next Move: second block only, and the empty-queue phase line

*Files:* `Patina/Features/Home/Models/TodayExperience.swift` ·
`PatinaTests/HomeCompositionTests.swift`

`TodayPriorityInput` gains the project's `current_phase` (`ProjectsAPIClient` already carries it).
With nothing waiting, the move names the phase instead of inventing a chore.

## T11 — Recompose `DailyRoomView`

*Files:* `Patina/Features/Home/Views/DailyRoomView.swift` ·
`PatinaTests/HomeCompositionTests.swift`

The blocks T1 names, in order, per tier; the record unflagged; `markSeen` wired here (not in
`ContentView.swift`) on appear and on `scenePhase → .active`, after the build; the push primer's two
call sites unchanged.

## T12 — Carry-over 8a: one top band

*Files:* `Patina/Design/Components/PatinaScreenChrome.swift` ·
`Patina/Features/Money/MoneyScreenChrome.swift` · the twelve call sites ·
`PatinaTests/MoneyAndStudioCopyTests.swift` · `PatinaTests/TopBandFoldTests.swift` (new)

`PatinaScreenChrome` owns the status-bar reservation; `.moneyScreenTopBand()` is deleted. The nine
pushed screens get the band from `.patinaScreen(…)`; the three money **sheets** (which have no
`.patinaScreen` — a sheet must not grow a coordinator back-chevron) read the same reservation
through `.patinaTopBand()`, defined beside the chrome.

Failing test first (`TopBandFoldTests`): no file under `Patina/` contains `moneyScreenTopBand`, and
`PatinaScreenChrome.swift` contains the `safeAreaInset(edge: .top` reservation.
