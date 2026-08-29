# W6 · X3 — session isolation + the project rule (task list)

Lane `daily-return/w6-x3`, worktree `.codex/worktrees/agent-dr-w6-x3`, base `main` `4b35e0a94`.
Simulator clone **`dr-w6-x3` `63E0BC31-AD63-40CC-A609-1FCA5CA9C631`** (iPhone 17 Pro / iOS 26.5).

## What this lane closes

`waves/w5/walk.md` §"Carried forward" 1 and 2, restated in `build-plan.md` §W5-DONE:

1. **Session isolation.** Process-lifetime singletons are not reset on an in-process sign-out /
   sign-in. The walk's item 2 FAILed on its first attempt: `DesignerThreadOpener` resolved James
   against `client@patina.dev`'s stale project id, the server refused the cross-tenant
   `rpc_start_project_thread` (no leak — the send simply failed), and the user saw
   `We couldn't send that.`
2. **The project rule.** `DesignerRelationshipResolver.activeProject(in:)` is `projects.first {…}`
   with no tie-break, so `client@patina.dev`'s "Ask Leah" landed on `Birch Hollow` while every
   NEEDS YOU row was `Aspen Loft Refresh`. W4 already gave the *seat* the rule
   (`DesignerSeat.activeProject` / `urgentProjectId`, `YourDesignerSeat.swift:114-162`); the thread
   opener never got it.

## Owned files

`Services/Auth/AuthService.swift` · `Services/Badges/BadgeCountService.swift` ·
`Services/DesignServices/DesignRequestStatusService.swift` ·
`Features/Orders/ViewModels/OrdersService.swift` · `Features/Rooms/RoomSyncCoordinator.swift` ·
`Features/Messaging/DesignerThreadOpener.swift` · `Core/State/DesignerRelationship.swift`
(the project rule only) · **new** `Core/State/SessionScope.swift` · `PatinaTests/**` (own suites).

**Beyond the brief's list, and flagged to the steward** (`x3-notes.md`): three singletons hold the
signed-in client's own data behind `private(set)`, so an extension in `SessionScope.swift` cannot
clear them and the reset has to be declared in their own file —
`Features/Profile/ViewModels/StudioHubViewModel.swift`, `Services/Settings/SettingsService.swift`,
`Features/Purchase/PieceActChannel.swift`. One method each, no behaviour moved. Neither X1
(`PatinaWidget/**`, `project.pbxproj`, `App/**`, `Features/Navigation/**`) nor X2
(`Core/Persistence/RecordSnapshotStore.swift`, `Core/State/FeatureFlags.swift`,
`Features/Invoices/**`, `Services/Notifications/**`) owns any file this lane writes —
`waves/w6/steward.md` §8 and trap 13, which says outright that this work "lives in
`Services/Badges/`, `Services/DesignServices/` and `Features/Purchase/`, which neither X1 nor X2
owns".

## Tasks

### T1 — enumerate the singletons (no code)
Grep `static let shared` across `Patina/`, read each holder, and rule on every one: does it hold
the **signed-in client's own** data in memory for the process lifetime? Write the verdict table into
`x3-notes.md`. → **done before T2**, it is the input to the participant list.

### T2 — `SessionScoped` + `SessionScope` (failing test first)
1. Test `SessionScopeTests.everyParticipantIsResetBeforeAnythingRefetches` over fake conformers —
   red (no type).
2. `Core/State/SessionScope.swift`: `@MainActor protocol SessionScoped: AnyObject { func
   resetForSessionChange() }`; `enum SessionScope { static func participants() -> [any
   SessionScoped]; static func reset(_:); static func refresh() }`. Conformances that need no edit
   to their own file go in this file as extensions (`ProfileService.clear()`,
   `RoomSelectionStore.clear()`, `NotificationManager.clearAll()`, `RoomSyncCoordinator.forget()`).
3. Green.

### T3 — the six in-file resets
`BadgeCountService` (rows + five counts + `hasLoaded`/`projectsLoaded`/`lastRefreshFailed` + the
debounce task), `DesignRequestStatusService` (`requests`, `hasLoaded`, `sessionDismissedLeadIds`,
the debounce task), `OrdersService` (`orders`, `terms`, `hasLoaded`, `lastRefreshFailed`,
`isLoading`, the in-flight task), `StudioHubViewModel` (`snapshot`, `hasLoaded`, `failedSources`,
`isLoading`), `SettingsService` (`isLoaded` + the two toggles back to their defaults),
`PieceActChannel` (`currentAct`). Test per service: seed → `resetForSessionChange()` → reads empty.

### T4 — the seam in `AuthService`
1. Test `SessionSeamTests` on a pure `AuthService.isAccountChange(previous:incoming:)`:
   `nil→A` true · `A→A` false · `A→B` true · `A→nil` true · `nil→nil` false — red.
2. `startAuthStateListener`: hold `settledUserId`; on a change call `SessionScope.reset()`
   **before** `settleLocalStore` (which kicks `RoomSyncCoordinator.reconcileSharedStore`) and
   **before** the profile-hydration block; after the event switch, `SessionScope.refresh()` when
   there is a user. `.tokenRefreshed` / `.initialSession` for the same user reset nothing.
3. SourcePin test that the reset call sits above `settleLocalStore` in that file.

### T5 — the SourcePin over the whole tree
`SessionScopeSourcePinTests`: walk every `.swift` under `Patina/` with
`SourcePin.swiftFiles(under:)`, collect every type declaring `static let shared`, and assert each
one is either a `SessionScope` participant or carries a written exclusion reason in the test's own
table. A new singleton reddens this test instead of silently escaping the reset.

### T6 — the project rule
1. Test `DesignerProjectRuleTests`: three active projects, the record's first NEEDS YOU row
   pointing at the second → `resolve` returns `.project` on **that** project, and the seat picks the
   same one; no record → the most recently updated active project (list order); the urgent project
   without `designer_id` → the old fallback stands (R3 must not lose pre-emption). Red.
2. `DesignerRelationship.swift`: `activeProject(in:record:decisions:proposals:invoices:)` applies
   `DesignerSeat.urgentProjectId(…)` **within** the designer-bearing active set, falling back to
   `first`; `resolve` gains the same defaulted parameters so the 4 existing call sites compile
   unchanged.
3. `DesignerThreadOpener.currentRelationship` feeds it `BadgeCountService`'s retained rows and the
   admitted record (`RecordIdentity.decide(...) == .paint` → `RecordSnapshotStore.shared.load()`,
   never a foreign snapshot).

### T7 — the account-switch test
`SessionIsolationTests`: A's rows in every participant → `SessionScope.reset()` → each reads empty
→ apply B's rows → `DesignerThreadOpener`'s inputs resolve B's project. Doubles per service via
each service's own `apply(…)` / seeded init; nothing hits the network.

### T8 — gate
`scripts/ios-gate.sh build` (twice if the first fails on `GitCommit.swift`), then
`xcodebuild test -project … -scheme Patina -configuration Debug -destination id=63E0BC31-… \
-derivedDataPath .build/dd -only-testing:PatinaTests` — **whole tier green**, 1,413 as the floor.
No `ios-gate.sh all`, no `lint-delta` (steward-only). Signed `.app` from the test build's products.

### T9 — sim check on `dr-w6-x3`
`-DeploymentTarget local -PatinaFlags house-widget`. Sign in `client@patina.dev` → Settings →
Sign Out → sign in `james.okafor@example.com` → `Ask Leah to source this` → the thread is James's
(`psql`: `comms_threads.created_by` / participants), no error sheet. Shots
`shots/w6-x3-NN-*.png`; ledger rows under `## w6-x3`.

### T10 — finish
Pathspec commits (never `git add -A`, never push, never `git` in the main checkout), `rmdir
.writer.lock.d`, `git status --porcelain -uno` empty, report.

## Constraints inherited
Honesty (C5) — nothing here invents a row, a count or a "new"; brand voice (C6) on any copy
(this lane writes none); canonical names (C4). No migration this wave (tip 00540). `simctl` /
`xcodebuild` / `git worktree` unsandboxed, foreground. Screen capture ONLY
`xcrun simctl io <udid> screenshot`.

---

## Resumed lane (second X3 agent) — tasks T11–T14

The first agent's T1–T7 were on disk, uncommitted and never built. T8–T10 never ran.

### T11 — read every changed file, then build for the first time
Read the 8 modified + 3 new files before touching anything; keep what is right, rewrite what is not,
and say which in `x3-notes.md` §5. Result: everything kept, nothing rewritten.

### T12 — the foreground trigger moves to the app root (`integration.md` §6.2)
New `Features/Home/ViewModels/RecordForeground.swift` — one rebuild entry point, called from
`PatinaApp`'s `scenePhase` `.active` branch AND from `DailyRoomViewModel.refreshRecord()`; the two
coalesce so a foreground onto Today rebuilds once (a second rebuild would build against the visit
stamp the first just wrote and lose every `isNew` tick). SP-18's story pick moves with it so the
root's rebuild does not drop the record's MOVED story row. Tests:
`PatinaTests/RecordForegroundTests.swift` (coalescing + SourcePins), and
`RecordIdentityTests.thePaintPathIsScoped` follows the line that moved.

### T13 — gate
`scripts/ios-gate.sh build` → `** BUILD SUCCEEDED **` (second run; the first failed on this lane's
own new file, not on `GitCommit.swift`). `xcodebuild test -only-testing:PatinaTests` on
`dr-w6-x3r` → **1,433 tests in 157 suites passed** (W5 floor 1,413; +20).

### T14 — sim check on `dr-w6-x3r`, and where it stopped
`x3-notes.md` §7. Project rule and foreground rebuild proved; both roots render; the account-switch
leg BLOCKED by simulator input delivery failing mid-walk (blitz taps, then `System Events` `-609`),
reported rather than improvised around.
