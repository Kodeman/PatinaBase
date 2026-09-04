# W1 · L1-B — integration notes OUT

Written by L1-B, 2026-09-02, on branch `first-flight/w1-l1b`.

Every entry below is a change L1-B needs in a file another lane owns this wave. Each carries the
**exact final text**. Each has also been appended verbatim to the target lane's
`build/waves/w1/<target>-notes.md`, so the owner picks it up as a numbered task in its own list.

> **Round 2 (2026-09-02, after the adversarial review `RL1B-01`…`RL1B-21`).** Notes **O10–O13** and
> steward items **S1–S3** are appended at the bottom of this file and to each target's inbox. The
> paragraph below is **superseded**: `isIntermittent` is gone — see **S1**.

~~`PatinaTests/RefreshableSurfacesTests.swift` and `PatinaTests/AccountIsolationTests.swift` carry a
`withKnownIssue(isIntermittent: true)` row for **O2, O3, O4 and O8**. They pass in both states by
design.~~ **Superseded by S1.** `isIntermittent` made those three rows unfalsifiable — an unapplied
note looked exactly like an applied one (`RL1B-03`). It has been dropped. The rows are now plain
known issues: green here, where the notes are genuinely open, and **red the moment the note lands**,
as an unrecorded known issue. That red is the tripwire, and **S1** carries the exact replacement text
the steward applies at that merge.

| # | To | Finding | File |
|---|---|---|---|
| **O1** | L1-F | `C1-19`, `C1-18` | `App/Coordinators/AppCoordinator.swift` |
| **O2** | L1-F | `C2-06` | `App/Coordinators/AppCoordinator.swift` |
| **O3** | L1-C | `C4-12`, `R-03` | `Features/Home/Views/DailyRoomView.swift`, `Features/Profile/Views/ProfileView.swift`, `Features/Rooms/Views/YourSpacesView.swift`, `Features/Recommendations/Views/RecommendationsView.swift` |
| **O4** | L1-C | `C4-12` | `Features/Decisions/Views/DecisionDetailView.swift` |
| **O5** | L1-C | `C4-03` | `Features/Rooms/Views/YourSpacesView.swift` |
| **O6** | L1-F | `R-02` | `Services/Badges/BadgeCountService.swift` |
| **O7** | L1-C | `R-02`, `A-81` | `Features/Home/Views/DailyGreetingHeader.swift` |
| **O8** | L1-F | `C4-12` | `Features/Messaging/Views/ThreadDetailView.swift` |
| **O9** | L1-A, L1-F | — | heads-up only, no action |
| **O10** | L1-F | `RL1F-07` | `Core/Persistence/LocalStoreReset.swift` — swap one literal for `PendingLinkQueue.defaultsKey` |
| **O11** | L1-C | `A-34`, `C-11` | `Features/ProductDetail/Views/ProductDetailView.swift`, `Features/Recommendations/Views/RecommendationsView.swift` |
| **O12** | L1-C | `L07-05` | `Features/Profile/Views/StudioHubView.swift` |
| **O13** | L1-E | `A-34`, `C7-01` | copy deck rows — five new strings, plus one W2 row |
| **S1** | steward | `C4-12`, `C2-06` | `PatinaTests/RefreshableSurfacesTests.swift`, `PatinaTests/AccountIsolationTests.swift` |
| **S2** | steward | — | ownership ruling for two paths L1-B edited |
| **S3** | steward | `C3-01`, `C3-15`, `C9-08` | three integration notes with no owner after merge 3 |
| **S4** | steward | `RL1B-01` | `PatinaTests/OrderHandoffTests.swift` — the tier's flake, and an unowned file |

---

## O1 → L1-F · `C1-19` + `C1-18`: the `.launching` watchdog and the splash floor

`AppCoordinator.swift`. L1-B owns `Features/Splash/**` and has landed its half: `SplashView` surfaces
`LaunchWatchdog.stallMessage` after `LaunchWatchdog.stallDeadline` (8 s) when auth readiness has not
arrived, and its wordmark animation now finishes inside 1.2 s. `Core/State/LaunchWatchdog.swift` is
new, is on `first-flight/w1-l1b`, and carries both constants; `PatinaTests/LaunchWatchdogTests.swift`
pins them. **This is the half that actually lets the person move.**

### 1. Two new stored properties, beside `splashDeadlineTask`

```swift
    /// C1-19: the moment `.launching` stops being allowed to continue.
    ///
    /// `derivePhase()` returns `.launching` whenever `isAuthStateReady` is
    /// false, and that flag is set only from inside the `for await` over
    /// `supabase.auth.authStateChanges` (AuthService.swift:127-141). If the
    /// stream never yields — a failing keychain read is the recorded
    /// precedent — nothing else sets it and the splash is where the app ends.
    /// A tester cannot describe that beyond "it never opened".
    private let launchDeadline = Date().addingTimeInterval(LaunchWatchdog.stallDeadline)
    private var launchWatchdogTask: Task<Void, Never>?
```

### 2. A recompute at that deadline, beside `scheduleSplashDeadlineRecompute()`

```swift
    private func scheduleLaunchWatchdog() {
        launchWatchdogTask?.cancel()
        let deadline = launchDeadline
        launchWatchdogTask = Task { @MainActor [weak self] in
            let interval = deadline.timeIntervalSinceNow
            if interval > 0 {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
            guard !Task.isCancelled else { return }
            self?.recomputePhase()
        }
    }
```

Call it once, wherever `scheduleSplashDeadlineRecompute()` is first called at launch.

### 3. `derivePhase()` — replace

```swift
    private func derivePhase() -> AppPhase {
        let splashStillPlaying = Date() < splashMinimumDeadline
        if !AuthService.shared.isAuthStateReady || splashStillPlaying {
            return .launching
        }
```

with

```swift
    private func derivePhase() -> AppPhase {
        // C1-19: an unresolved launch may not hold the splash forever. Past
        // the deadline the app falls through to `.auth`, where the person has
        // something to tap; `SplashView` has been saying so since the same
        // moment.
        if !AuthService.shared.isAuthStateReady {
            return Date() >= launchDeadline ? .auth : .launching
        }
        if Date() < splashMinimumDeadline {
            return .launching
        }
```

### 4. `C1-18` — the floor

Replace

```swift
    public private(set) var splashMinimumDeadline: Date = Date().addingTimeInterval(1.5)
```

with

```swift
    // C1-18: ~1 s of init plus an unconditional 1.5 s floor plus a 0.5 s
    // crossfade is about three seconds to content, and the wordmark's own
    // fade was cut short of full opacity every cold launch.
    public private(set) var splashMinimumDeadline: Date =
        Date().addingTimeInterval(LaunchWatchdog.splashFloor(isAuthStateReady: false))
```

and

```swift
    public static let splashMinimumDuration: TimeInterval = 1.5
```

with

```swift
    public static let splashMinimumDuration: TimeInterval =
        LaunchWatchdog.splashFloor(isAuthStateReady: false)
```

`LaunchWatchdog.splashFloor(isAuthStateReady:)` returns `0` when readiness has already landed and
`0.6` otherwise; `LaunchWatchdogTests.anUnresolvedLaunchPaysAShortOne` asserts
`floor < AppCoordinator.splashMinimumDuration` **today** and will need that line dropped once this
lands — it is the one assertion in that suite that reads the old value on purpose.

---

## O2 → L1-F · `C2-06`: sign-out leaves the previous account's screens on the stack

`AppCoordinator.swift`. Sign-out runs `presentedSheet = nil` + `beginSplashTransition()` + `signOut()`,
and `recomputePhase` clears only `presentedSheet` when leaving `.main` (`:223-225`).
`navigationPath = NavigationPath()` appears only in `navigate(to: .heroFrame)` (`:330`) and
`resetToThreshold()` (`:694`) — so the next session came back to the previous account's screens.

Replace `beginSplashTransition` in full:

```swift
    /// Force a splash transition — used by sign-out to land back at
    /// `.auth` via a brief splash instead of leaving the home view
    /// visible while the session tears down.
    public func beginSplashTransition(duration: TimeInterval = splashMinimumDuration) {
        // C2-06: the `.main` branch is torn down on sign-out but this
        // coordinator survives it, holding the previous account's stacks.
        // `resetToThreshold()` already spells the reset out; this is the same
        // one, on the seam sign-out actually takes.
        navigationPath = NavigationPath()
        screenStack = []
        if isHouseFirstRoot {
            for tab in PatinaTab.allCases { tabs.popToRoot(tab) }
            tabs.selected = .today
        }
        splashMinimumDeadline = Date().addingTimeInterval(duration)
        scheduleSplashDeadlineRecompute()
        recomputePhase()
    }
```

`screenStack` is `private var` at `:46`, so this has to be written inside `AppCoordinator.swift` —
it is not something L1-B could have reached from its own files.

When this lands, `PatinaTests/AccountIsolationTests.swift`
→ `theSignOutClearsThePreviousAccountsNavigationStack` starts recording no known issue. Turn its
`withKnownIssue(…) { #expect(clears) }` into a bare `#expect(clears)` at that point.

---

## O3 → L1-C · `C4-12` + `R-03`: pull-to-refresh on the four tab roots, and Today's staleness line

`.refreshable` exists on twelve Features screens and on none of the four roots. With the backend down
the only recovery for Today is to background the app; pulling produced pixel-identical frames.

### `Features/Home/Views/DailyRoomView.swift`

On the root `ScrollView(showsIndicators: false)` at `:250`, immediately after the closing brace of its
`VStack`, add the modifier — the same sequence the `scenePhase` handler at `:168-186` runs:

```swift
        // R-03: the only recovery from a failed refresh was to background the
        // app. This runs exactly what the `.onChange(of: scenePhase)` handler
        // below runs, in the same order.
        .refreshable {
            viewModel.load()
            syncCompanionContext()
            await badges.refresh()
            await requestStatus.refresh()
            syncCompanionContext()
            await viewModel.refreshProjectRooms()
            await viewModel.refreshRecord()
            await ProfileService.shared.mirrorLastSeenIfNeeded()
            await viewModel.refreshNewThisWeek()
            await notificationsViewModel.load()
        }
```

`presentPushPrimerIfEarned()` is deliberately **not** in the list: a pull-to-refresh is not the moment
to put a permission prompt in front of someone.

### `Features/Profile/Views/ProfileView.swift`

```swift
        .refreshable {
            await StudioHubViewModel.shared.load()
            viewModel.loadData(context: modelContext)
        }
```

`StudioHubViewModel.load()` is what the screen's `.task` runs; `loadData(context:)` is what its
`onAppear` runs. Both, in that order.

### `Features/Rooms/Views/YourSpacesView.swift`

```swift
        .refreshable {
            await RoomSyncCoordinator.shared.reconcile(store: RoomStore(context: modelContext))
        }
```

### `Features/Recommendations/Views/RecommendationsView.swift`

```swift
        .refreshable { await viewModel.load() }
```

— matching whatever that screen's `.task` calls; if the `.task` calls something else, use that, and
the same arguments.

### R-03's second half — the staleness line on Today

`StudioHubViewModel` (L1-B's file) now exposes:

```swift
    var stalenessLine: String?   // "Last updated 2 minutes ago." / "We couldn’t reach your studio just now."
```

It is `nil` whenever the last refresh answered. Render it in `DailyRoomView`'s header block, below the
greeting, as a sentence:

```swift
                if let staleness = StudioHubViewModel.shared.stalenessLine {
                    Text(staleness)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("DailyRoomView.StalenessLine")
                }
```

**VISION constraint, carried verbatim from `L07-05`'s own fix line and the L0.7 walk:** *the affordance
must be a word ("last updated…", "we couldn't reach the studio"), never a dot or a badge.*

---

## O4 → L1-C · `C4-12`: the decision detail

`Features/Decisions/Views/DecisionDetailView.swift` — `.refreshable` calling exactly what its `.task`
calls:

```swift
        .refreshable { await viewModel.load(decisionId: decisionId) }
```

(substitute the `.task`'s own call verbatim if the signature differs).

---

## O5 → L1-C · `C4-03`: Your Spaces must not say "no rooms" about a failed fetch

`Features/Rooms/Views/YourSpacesView.swift`. `RoomSyncCoordinator` (L1-B's file) previously swallowed a
failed `listRooms` with a bare `return`; it now publishes:

```swift
    public private(set) var lastLoadFailed: Bool
    public private(set) var lastSuccessAt: Date?
    public var isLoading: Bool
```

A failed read deliberately does **not** stamp `lastRunAt`, so the retry below is not swallowed by the
thirty-second debounce.

Ahead of the existing empty state (`:31`, `:180`), add:

```swift
            } else if rooms.isEmpty && RoomSyncCoordinator.shared.lastLoadFailed {
                // C4-03: an empty list meant both "you have no rooms" and "we
                // could not read your rooms", and the copy asserted the first
                // to a client who has them.
                PatinaErrorState(
                    message: "We couldn’t reach your rooms. Check your connection and try again.",
                    action: {
                        Task {
                            await RoomSyncCoordinator.shared.reconcile(
                                store: RoomStore(context: modelContext)
                            )
                        }
                    }
                )
                .accessibilityIdentifier("YourSpacesView.ErrorState")
```

The branch must sit **before** the "No rooms yet" branch, not beside it.

---

## O6 → L1-F · `R-02`: a failed cold launch deletes badge counts instead of degrading

`Services/Badges/BadgeCountService.swift`. In-process, `apply(…)` already preserves a failed source
(`nil` keeps the previous value). The gap is the **cold launch**: nothing is held across a process
boundary, so a first refresh that fails publishes zeros, and the walk measured exactly that — bell
badge `3` → no badge, Studio pill `Studio 5` → `Studio`, one record row gone, all in one relaunch with
no word said.

Persist the last successful counts and restore them at init:

```swift
    /// R-02: what the last successful refresh knew, kept across launches.
    ///
    /// Without it a cold launch on a dead network does not degrade, it
    /// DELETES: the counts start at zero, the pill loses its number and the
    /// bell tells VoiceOver "No unread notifications" — all of it asserted,
    /// none of it fetched.
    private struct PersistedCounts: Codable {
        let pendingDecisionCount: Int
        let unreadMessageCount: Int
        let proposalsAwaitingSignatureCount: Int
        let payableInvoiceCount: Int
        let projectCount: Int
        let storedAt: Date
    }

    private static let persistedCountsKey = "patina.badge_counts.last_successful.v1"
```

- write it at the end of `performRefresh(token:)` on the `hasLoaded = true` branch only;
- read it in `init()` into the five counts, leaving `hasLoaded` and `projectsLoaded` **false** — the
  numbers are a floor to draw, not a claim that a fetch answered;
- clear it in `resetForSessionChange()`: they are the previous account's.

`resetForSessionChange()` must also remove the key, or account B's first launch paints account A's
numbers.

---

## O7 → L1-C · `R-02` + `A-81`: the bell must not assert absence it never checked

`Features/Home/Views/DailyGreetingHeader.swift:107`:

```swift
                    .accessibilityValue(unreadCount > 0 ? "\(unreadCount) unread" : "No unread notifications")
```

With the backend down and nothing fetched, `unreadCount` is `0` and VoiceOver is told **"No unread
notifications"** — an assertion the app never checked. Take a third input and say nothing rather than
say the wrong thing:

```swift
    /// R-02: `false` until a notifications fetch has answered. A count of zero
    /// that nobody fetched is not "none".
    var unreadCountIsKnown: Bool = true
```

```swift
                    .accessibilityValue(
                        unreadCount > 0
                            ? "\(unreadCount) unread"
                            : (unreadCountIsKnown ? "No unread notifications" : "")
                    )
```

`DailyRoomView` passes `unreadCountIsKnown: notificationsViewModel.hasLoaded` (or whatever that view
model's "a fetch answered" flag is called — it needs one either way).

**`A-81`, for the record:** the four numbers the finding counted are two counts each shown twice, and
both are already single-sourced (SP-16) and named for VoiceOver — `accessibilityLabel("Notifications")`
+ `accessibilityValue("3 unread")` on the bell, `StudioControlLabel.waitingValue(count:)` on the pill —
and the capped NEEDS YOU section already draws `See all →` off `record.hasMoreNeedsYou` (M1).
`PatinaTests/AttentionCountTests.swift` now pins all three. The line above is the last thing on that
screen that says something it does not know.

---

## O8 → L1-F · `C4-12`: the thread detail

`Features/Messaging/Views/ThreadDetailView.swift` — `.refreshable` calling exactly what its `.task`
calls:

```swift
        .refreshable { await viewModel.load(threadId: threadId) }
```

(substitute the `.task`'s own call verbatim if the signature differs). This is the fourth of the five
Studio detail screens; the invoice detail already has one and is the in-repo pattern.

---

## O9 → L1-A and L1-F · heads-up, no action

Three things L1-B changed that reach beyond its own globs, recorded so neither lane is surprised at
the merge:

1. **`Patina/PatinaApp.swift` gains one line** — `.localStoreRecoveryNotice()`, on the `ContentView()`
   chain beside `.modelContainer(…)`. `PatinaApp.swift` is in no lane's glob; the modifier and its
   screen live entirely in `Core/Persistence/` (L1-B's). It is C7-01's one-time "we had to start this
   phone's copy over" screen and it is a no-op on every launch that did not recover a store.
2. **`Product.matchLabel` no longer prints a percentage.** It bands — `Strong match` / `Good match` /
   `Worth a look` / `Not scored yet` (`A-34`, `C-11`). Its three call sites are
   `RecommendationsView.swift:338`, `:381` and `ProductDetailView.swift:413`, all L1-C's, and **none of
   them needs an edit** — the property's type is unchanged. `Product.hasMatchScore` is new beside it if
   a screen wants to hide the pill entirely on an unscored piece. If L1-E's deck rewrites these four
   strings, they are `Core/Models/ProductModel.swift` and L1-B applies the deck row.
3. **`SessionScope.participants()` is 13, not 11** — `MatchScoreResolver` and `LocalRoomSignal` joined
   it. `SessionIsolationTests`'s count assertion and its `participantFiles` set are updated on this
   branch; a lane adding a twelfth singleton this wave should expect a conflict in exactly those two
   places.

---
---

# Round 2 — after the adversarial review (2026-09-02)

Review findings `RL1B-01`…`RL1B-21`. Everything below is new since round 1.

---

## O10 → L1-F · `RL1F-07`: one literal to swap at merge 4

`L1F→B-3` is **applied** on `first-flight/w1-l1b`, in
`Core/Persistence/LocalStoreReset.swift`, immediately after `RecordOwnerStamp.shared.clear()`:

```swift
        // A link account A tapped and never got to open is account A's
        // request. It lives in the App Group suite with a 15-minute life, so
        // without this it drains into account B's first `.main` — the A → B
        // path with no sign-out in between (L1-F note L1F→B-3 / RL1F-07).
        // The key is written as a literal because `PendingLinkQueue` is
        // L1-F's file and does not exist on this branch; L1-F swaps it for
        // `PendingLinkQueue.defaultsKey` at merge 4 (l1b-notes-out.md O10).
        (UserDefaults(suiteName: LastSeenStore.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: "patina.deeplink.pending.v1")
```

`wipeUserScopedData()` **is** `@MainActor` on this branch (`LocalStoreReset` carries the annotation at
`:17`), so your note's alternative applies. `PendingLinkQueue` does not exist here — writing
`PendingLinkQueue.defaultsKey` would not compile and this lane's gate could not be green — hence the
literal.

**At merge 4, replace the two lines above with:**

```swift
        (UserDefaults(suiteName: PendingLinkQueue.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: PendingLinkQueue.defaultsKey)
```

…and delete the third and fourth sentences of the comment ("The key is written… O10)."). If
`PendingLinkQueue.appGroupIdentifier` is not `"group.cloud.patina.app"` — the value
`LastSeenStore.appGroupIdentifier` holds — say so, because then the two stores are not in the same
suite and the clear on this branch is landing in the wrong domain.

**Also for merge 4, a record, not a request:** `Core/State/LaunchWatchdog.swift` is **unchanged** on
`first-flight/w1-l1b` since you copied it (`L1F→B-4`) — `git diff` between the two branches on that
path is still empty. `PatinaTests/LaunchWatchdogTests.swift` line 96 is **dropped** per `L1F→B-2`;
the two assertions above it stay.

---

## O11 → L1-C · `A-34` + `C-11`: an unscored piece must not wear a green verdict

**Finding.** `RL1B-09` (review, major). `Product.matchLabel` now bands, and its fourth band is
`"Not scored yet"` — an *absence*. Both call sites render it as a **success-coloured pill**, so a
saved piece, a deep-linked piece, or any piece opened in a session that never scored it reads as a
green status meaning "we assessed this and the answer is nothing". VISION §6 refuses red/green status,
and this is the case where the colour is not just decoration but wrong.

`Product.hasMatchScore` (`Core/Models/ProductModel.swift:212`) exists for exactly this and has **no
production call site** today. It is `matchScore > 0`.

### `Features/ProductDetail/Views/ProductDetailView.swift:409-421`

Today:

```swift
                            HelpTooltip(
                                surfaceKey: SurfaceKeys.IOSApp.Home.matchPill,
                                fallback: "Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing."
                            ) {
                                Text(product.matchLabel)
                                    .font(PatinaTypography.mono)
                                    .foregroundStyle(PatinaColors.success)
                                    .tracking(0.3)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(PatinaColors.success.opacity(0.12))
                                    .clipShape(Capsule())
                            }
```

Final — the whole `HelpTooltip` is dropped when there is no score, the same way
`RecommendationsView.swift:334-340` already drops an unresolvable maker:

```swift
                            if product.hasMatchScore {
                                HelpTooltip(
                                    surfaceKey: SurfaceKeys.IOSApp.Home.matchPill,
                                    fallback: "Match score blends your room's dimensions, style cues, and palette against this piece. Higher means a better fit for the room you're viewing."
                                ) {
                                    Text(product.matchLabel)
                                        .font(PatinaTypography.mono)
                                        .foregroundStyle(PatinaColors.success)
                                        .tracking(0.3)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(PatinaColors.success.opacity(0.12))
                                        .clipShape(Capsule())
                                }
                            }
```

The `HStack` above it already contains the price, so dropping the pill leaves a complete row.

### `Features/Recommendations/Views/RecommendationsView.swift:380-389`

Today:

```swift
            // Match badge
            Text(product.matchLabel)
                .font(PatinaTypography.monoSmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .tracking(0.3)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .padding(8)
```

Final:

```swift
            // Match badge. A piece with no score wears no badge — the band
            // would read "Not scored yet" as a verdict (A-34 / RL1B-09).
            if product.hasMatchScore {
                Text(product.matchLabel)
                    .font(PatinaTypography.monoSmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .tracking(0.3)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(8)
            }
```

This badge is neutral-toned, so it is the milder of the two — but the card's own combined
accessibility label reads the band, and "Not scored yet" spoken as a card's headline attribute is the
same claim. `RecommendationsView.swift:338` is the third `matchLabel` site; check whether it is
inside a scored-feed branch already (it is fed by `reconciling(_:)`, so it should be) and leave it if
so.

**Also:** the `#expect` that makes this stick belongs in an L1-C suite —
`#expect(source.contains("if product.hasMatchScore"))` on both files. `MatchScoreResolverTests`
already pins `hasMatchScore`'s arithmetic on L1-B's side.

---

## O12 → L1-C · `L07-05`: the Studio hub never says *when* its numbers are from

**Finding.** `RL1B-08` (review, major). `L07-05`'s fix line is *"whatever staleness affordance `R-03`
lands on Today, apply to `StudioHubViewModel` in the same wave"*. L1-B built it —
`StudioHubViewModel.stalenessLine` (`Features/Profile/ViewModels/StudioHubViewModel.swift:64-77`) —
and **nothing renders it**: `grep -rn stalenessLine Patina` returns that one declaration.
`StudioHubView.swift:28` draws `loadMessage` only, which says *that* a refresh failed and never *when*
the figures on screen are from. Studio is a day-one tab root under D1.

`stalenessLine` is `String?` and is `nil` on a healthy screen. It returns
`"We couldn't reach your studio just now."` when the hub has never had an answer, and
`"Last updated 2 minutes ago."` (a `RelativeDateTimeFormatter`, `.full`) when it has. A sentence,
never a dot and never a badge — the walk's own constraint, carried from VISION §6.

### `Features/Profile/Views/StudioHubView.swift:28-30`

Today:

```swift
                if let loadMessage = viewModel.loadMessage {
                    partialLoadNotice(loadMessage)
                }
```

Final:

```swift
                if let loadMessage = viewModel.loadMessage {
                    partialLoadNotice(loadMessage)
                }
                if let stalenessLine = viewModel.stalenessLine {
                    Text(stalenessLine)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("StudioHub.StalenessLine")
                }
```

Placed **after** the notice deliberately: the notice says what went wrong and offers Refresh; the
staleness line says what the reader is looking at meanwhile. Both are `nil` together on a healthy
screen, so nothing new appears on the happy path.

---

## O13 → L1-E · five strings this lane added that no deck row covers

**Finding.** `RL1B-09` (review, major), second half. L1-E's suites are scoped to deck rows, so
user-visible copy L1-B introduced would ship unreviewed.

| where | string | why it exists |
|---|---|---|
| `Core/Models/ProductModel.swift` `matchLabel` | `"Strong match"` | `A-34`: the 70+ band |
| `Core/Models/ProductModel.swift` `matchLabel` | `"Good match"` | `A-34`: the 50–69 band |
| `Core/Models/ProductModel.swift` `matchLabel` | `"Worth a look"` | `A-34`: the 1–49 band — **the common case** for the observed 40–46 scores |
| `Core/Models/ProductModel.swift` `matchLabel` | `"Not scored yet"` | `C-11`: no score, not a bad one. See **O11** — L1-C hides the pill, so this should become unreachable on both current call sites |
| `Core/Persistence/LocalStoreRecoveryNotice.swift` | title `"We had to start this phone's copy over"` | `C7-01`: the one-time honesty screen |
| `Core/Persistence/LocalStoreRecoveryNotice.swift` | body `"Something on this phone became unreadable, so we started fresh. Your account's rooms and saved pieces come back the next time you're online."` | `C7-01` |

All six live in files **L1-B owns**, so a deck row lands as an L1-B apply, the same route
`C4-09`/`C5-16` took. If the deck rewrites them, say so before L1-E rebases and L1-B applies on the
integration tip.

**Plus one W2 row, not a W1 ask.** `A-34` bands the *piece*; the *room* average one screen away is
still a bare percentage — `Features/Rooms/Views/RoomProjectView.swift:442` and
`Features/Rooms/Components/RoomGalleryCard.swift:158`, both reading `RoomModel.averageMatchScore`,
rendered as `70%` under `ROOM MATCH`. L1-B has **deliberately left it numeric** this wave; the reason
is in the lane report and repeated here so the row is not lost:

* `A-34`'s own `where` is *Browse pieces* — the recommendation cards. The room average is a different
  statistic and carries no W1 finding of its own.
* The band vocabulary that exists does not fit the cell. The stat value renders at
  `PlayfairDisplay-Medium` 20 pt with no `lineLimit`, and the observed score range (40–46) puts the
  common case on `"Worth a look"` — three words that wrap in a two-cell `HStack`, at default type and
  worse above it. Changing the cell's shape is layout, and layout plus Dynamic Type is L1-C's this
  wave.
* Choosing shorter words is **copy**, which is this deck's, not L1-B's to invent.

So: a W2 deck row for the room-average vocabulary, decided with L1-C on the cell's shape.

---

## S1 → steward · the three ledger rows, and the exact text that replaces them

**Finding.** `RL1B-03` (review, major). Round 1 wrote three cross-lane pins as
`withKnownIssue(…, isIntermittent: true)`. An intermittent known issue passes whether or not the
expectation fails, so those three rows could not detect an unapplied note — which is precisely
PROGRAM.md §3's *"an integration note that no owner scheduled is not a plan, it is a hope"*.

> **Corrected 2026-09-03 (round 3, review `RL1B2-02` + `RL1B2-03`).** Round 2 claimed all three were
> done. Two were — `PatinaTests/RefreshableSurfacesTests.swift`. The third,
> `PatinaTests/AccountIsolationTests.swift`, still carried `isIntermittent: true` (at `:306`, not the
> `:253` this note gave), and its pin parsed `beginSplashTransition(`, which is **not** where L1-F
> implemented `C2-06`. Both are fixed on the branch now, and the replacement block below is rewritten
> to match. Everything above this line stands.

**Done on this branch:** `isIntermittent` is dropped from all three
(`PatinaTests/RefreshableSurfacesTests.swift:111,129`, `PatinaTests/AccountIsolationTests.swift:306`).
They stay green here, where the notes are genuinely open, and go **red as an unrecorded known issue**
the moment the owning lane's change is in the tree.

**Owed to you:** merge order is L1-C (1) → L1-D (2) → **L1-B (3)** → L1-F (4). L1-C's `.refreshable`
work is already in the tree at merge 3, so `theTabRootsRefresh` and the `DecisionDetailView` half of
`theRemainingDetailsRefresh` will fail **at merge 3**, and `AccountIsolationTests`'s `C2-06` row plus
`ThreadDetailView` at **merge 4**. That failure is the signal, not a regression. Replace each block
as below and re-run.

`PatinaTests/RefreshableSurfacesTests.swift` — `theTabRootsRefresh(path:)`:

```swift
    func theTabRootsRefresh(path: String) throws {
        #expect(try hasRefreshable(path), "\(path) owes .refreshable (l1b-notes-out.md O3)")
    }
```

`PatinaTests/RefreshableSurfacesTests.swift` — `theRemainingDetailsRefresh(path:)`:

```swift
    func theRemainingDetailsRefresh(path: String) throws {
        #expect(try hasRefreshable(path), "\(path) owes .refreshable (l1b-notes-out.md O4 / O8)")
    }
```

`PatinaTests/AccountIsolationTests.swift` — `theSignOutClearsThePreviousAccountsNavigationStack()`.

**Read this before you paste it.** The note (`O2`) asked for the clear in `beginSplashTransition()`.
L1-F put it in `clearNavigationForEndedSession()` instead, which is the better seam — it is the one
the forced-sign-out branch actually takes, and it clears the return route and the queued deep link
with it. `git show first-flight/w1-l1f:apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift`
shows `beginSplashTransition(` as four lines with no `navigationPath`, and
`clearNavigationForEndedSession()` at `:404` with `navigationPath = NavigationPath()`,
`screenStack = []`, `for tab in PatinaTab.allCases { tabs.popToRoot(tab) }` and
`tabs.selected = .today`. **`O2` is satisfied on L1-F's branch.** The replacement below reads that
function; the round-2 text, which read `beginSplashTransition(`, would have gone permanently red on a
note that had actually landed (review `RL1B2-03`).

```swift
    @Test
    func theSignOutClearsThePreviousAccountsNavigationStack() throws {
        let source = try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")
        let body = try #require(Self.endedSessionBody(in: source))
        #expect(body.contains("navigationPath = NavigationPath()"))
        #expect(body.contains("screenStack = []"))
        #expect(body.contains("tabs.selected = .today"))
    }
```

Keep `endedSessionBody(in:)` — the private brace-matching helper beside it on this branch — as it is.

Delete the `/// isIntermittent…` sentences from each doc comment as you go — they describe a mechanism
that is no longer there.

**If a row does not go red at its merge, the note was not applied.** That is the whole point of the
tripwire: read it as a finding, not as a flaky test.

---

## S2 → steward · two paths L1-B edited that its glob does not plainly cover

**Finding.** `RL1B-14` (review, minor). §7's rule is *"every file in the app belongs to exactly one
lane per wave"*, and both of these were assumed rather than ruled. Both changes are one line; the ask
is a recorded ruling in §5.9, or a note re-route.

| path | the edit | the argument |
|---|---|---|
| `apps/mobile/Patina/Patina/PatinaApp.swift` | one modifier line, `.localStoreRecoveryNotice()`, on the root `ContentView()` | In **no lane's glob at all**. `C7-01`'s notice is L1-B's (`Core/Persistence/**`) and a one-time recovery screen has to mount at the root or a recovered launch that never reaches a particular screen never sees it. Precedent: L1-A treated `Patina/Utilities/**` the same way. Pinned by `PersistenceMigrationTests.theNoticeIsMountedAtTheRoot`. |
| `apps/mobile/Patina/Patina/Features/Collections/Views/CollectionsView.swift:145-167` | `C4-03`'s third state — a `.failed` branch distinct from the empty one | L1-B's glob reads `Features/Collections/**  (schema side)`, and the residue table separately calls `Features/Collections/Views/**` *"beyond the schema side"* → no lane. But `C4-03` **is** L1-B's finding and the loading/empty/failed split is load-state honesty, this lane's charter. Pinned by `LoadStateHonestyTests.theSavedScreenHasAnErrorBranchDistinctFromItsEmptyOne`. |

Neither path is touched by any other lane's task list as far as L1-B can see, so the merge is not at
risk either way — this is about the ledger being true.

---

## S3 → steward · three integration notes that have no owner after merge 3

**Finding.** `RL1B-05` (review, major). Three notes addressed to L1-B name files inside L1-B's globs
and **cannot be applied on this branch** — every token and modifier they depend on exists only on
another lane's branch. L1-B's task list records them OPEN and defers them to *"a rebase-time apply on
the integration tip"*, but **no lane's task list owns that apply**, and §7 makes the steward's job
merge + gate, not applying notes. Left as is, L1-D reports `C3-01`/`C3-15` closed and L1-A reports
`C9-08` closed while ~77 literal sites and 5 exit-less number pads in L1-B's files stay unfixed — and
`TypographyAdoptionTests.theInlineFontCountNeverClimbs` is a ratchet, so it will not notice.

| note | finding | what | why it cannot land here | when it can |
|---|---|---|---|---|
| `l1-b-notes.md` **D→B-2** | `C3-01` | 45 `pearl` hairline sites in L1-B's files | `Border.hairline`, `Border.strong`, `OnDark.*` exist only on `first-flight/w1-l1d` | **after merge 2** (L1-D) |
| `l1-b-notes.md` **D→B-3** | `C3-15` | 32 inline `.custom(...)` fonts in L1-B's files | `voiceLead`, `monoLabel`, `bodySerif`, `h6`, `monoLarge` exist only on `first-flight/w1-l1d` | **after merge 2** (L1-D) |
| `l1-b-notes.md` **B-L1A-2** | `C9-08` | `.keyboardDoneToolbar()` on five `.numberPad`/`.decimalPad` fields | `Patina/Utilities/ViewModifiers/KeyboardDismissal.swift` exists only on `first-flight/w1-l1a` | **after merge 5** (L1-A) |

Two ways to close it, both fine, one of them has to be chosen and written down:

1. **A named task on the integration tip** — "apply `l1-b-notes.md` D→B-2, D→B-3 after merge 3; apply
   B-L1A-2 after merge 5", with the two note tables as the checklist and
   `TypographyAdoptionTests` + `KeyboardDismissalTests` re-run after each.
2. **A short L1-B fix round rebased onto the integration tip** after merge 2 for the two token
   sweeps, and after merge 5 for the number pads.

Either way, `C3-01`, `C3-15` and `C9-08` should **not** read as closed in L1-D's and L1-A's coverage
tables until the L1-B halves are in.

---

## S4 → steward · `PatinaTests/OrderHandoffTests.swift` has no owner and it is the tier's flake

**Finding.** `RL1B-01`, root-caused. The blocker's mechanism was `RoomStore.init` opening the app's
on-disk store on the main actor; that is fixed (`PersistenceController.isSharedContext`). What the
fix revealed is that the *detector* is fragile on its own account, and it belongs to nobody.

`OrderHandoffTests.waitFor` polls a `@MainActor` condition on a **3-second wall-clock budget**. The
condition can only become true when the main actor is free, and every `@MainActor` test in the other
180 suites is time this poll cannot use. Measured on this clone, same branch, same commit:

| run | tests | wall | result |
|---|---|---|---|
| 1 | 1671 | 4.87 s | passed |
| 2 | 1671 | 4.81 s | passed |
| 3 | 1673 | 8.00 s | **failed** — `OrderHandoffTests` ×4 |
| 4 (after halving this lane's added main-actor work) | 1672 | 5.20 s | passed |
| 5 | 1672 | 6.56 s | **failed** — `OrderHandoffTests` ×2 |
| 6 | 1672 | 5.36 s | passed |

Two runs of the identical tree, one red. That is a coin toss on a gate, and it will get worse: every
lane is adding suites this wave.

**Applied on `first-flight/w1-l1b`**, one line, at `OrderHandoffTests.swift:345`:

```swift
        timeout: Duration = .seconds(20),
```

…with a comment saying why. Nothing else in the file changes, no assertion changes, and no call site
passes an explicit `timeout:`. A settled condition still returns on the first pass, so the only cost
is the wait before a genuine failure is reported.

**Owed to you: the ruling.** `Features/Purchase/**` is *"no lane, no W1 work"* in the residue table,
and `PatinaTests/OrderHandoffTests.swift` is in no lane's glob. L1-B edited it because the failing
gate line was L1-B's own and the failure was in this file. Record it in §5.9 — either to L1-B for
this wave, or as a steward-owned test-infra change — and tell any lane whose own new suites push the
tier further that the ceiling is now 20 s, not 3.

**And the bigger half, which is yours to rule on, not L1-B's to fix quietly.**
`OrderHandoffTests` is not the only wall-clock poller in the tier. On a heavily loaded run — same
tree, same commit, **56.6 s** total instead of the usual 5–6 s — a *different* one went red:

```
✘ Test introGate_freshUser_pollsUntilTourResolves() recorded an issue at
  CompanionCoachingModelTests.swift:384:9: Expectation failed: (result → false) == true
✘ Test run with 1672 tests in 181 suites failed after 56.574 seconds
```

Same shape, different suite, and also in no lane's glob. The tier now has at least two suites whose
green depends on how busy the machine is, and every lane is adding suites this wave. L1-B has raised
the one the review named and has **not** touched `CompanionCoachingModelTests` — that is a second
unowned file and the ruling should cover both, rather than each lane widening whichever budget
happened to redden its own gate.

The durable version, for W2: a poller that yields until a condition holds should not carry a
wall-clock budget at all — the test's own `withTimeLimit` (or the suite's) is the right ceiling, and
`Issue.record("condition never became true")` at a fixed wall time is measuring the CI box.

---
---

# Round 3 (2026-09-03), after the second adversarial review `RL1B2-01`…`RL1B2-18`

Notes **O14**, **O15** and steward items **S5**, **S6**. Each is appended verbatim to its target's
`build/waves/w1/<target>-notes.md`.

| # | To | Finding | File |
|---|---|---|---|
| **O14** | L1-C | `B-03` | `Features/Home/Views/DailyRoomView.swift` — one `.onChange` so a deleted room leaves the Today rail |
| **O15** | L1-F | `RL1F-25` | reply to `L1F→B-5`: right note, wrong wave-position — it lands at merge 4 |
| **S5** | steward | `RL1B2-01` | seven wrapped `BrandVoiceLintTests` pins go red as *unexpected passes* after this lane merges |
| **S6** | steward | eight ids | the cross-lane halves whose owner has already merged, and the five files edited outside every glob |

---

## O14 → L1-C · `B-03`: a deleted room stays on the Today rail until the next foreground

**Finding.** `B-03`, second half, found by the round-2 review as `RL1B2-04`. Evidence on the shipped
four-tab root, this lane's clone: `shots/w1-review-l1b/15-today-house-rail-stale.png`,
`16-today-after-tab-roundtrip.png`, `17-today-after-foreground.png`.

After deleting a synced room, Spaces drew the correct empty state and Studio read `0 ROOMS`
(shots 11, 18) — but Today's **YOUR HOUSE** rail still drew *"Guest Bedroom · 158 sq ft"*: after a
scroll, after a full Today → Spaces → Today round trip, and only cleared after a background/foreground
cycle.

**Mechanism.** `RoomStore.delete` fires `LocalRoomSignal.shared.changed()`
(`Core/Persistence/RoomStore.swift:132,316`). `grep -rn LocalRoomSignal Patina` finds exactly one
consumer — `ProfileViewModel` (`:90,:102,:124`), which is why Studio is correct.
`DailyRoomView.swift:149` reloads the rail only from `.onChange(of: roomSync.revision)`, and
`RoomSyncCoordinator.revision` is the *server merge* signal: a local delete never bumps it. `B-03`'s
own fix line says *"drive both from one observable store"*, and Today is the tester's first screen
under D1.

**The change.** `Features/Home/Views/DailyRoomView.swift`. Beside the existing
`@State private var roomSync = RoomSyncCoordinator.shared` at `:39`:

```swift
    /// B-03: `roomSync.revision` is the server merge. A room deleted on this
    /// phone bumps `LocalRoomSignal` instead, and without this the rail keeps
    /// drawing it until the app is backgrounded (l1b-notes-out.md O14).
    @State private var localRooms = LocalRoomSignal.shared
```

and beside the existing `.onChange(of: roomSync.revision)` at `:149`:

```swift
        .onChange(of: localRooms.revision) { _, _ in
            viewModel.reloadRooms()
        }
```

`LocalRoomSignal` is `@MainActor @Observable` and lives at
`Patina/Core/Persistence/LocalRoomSignal.swift` on `first-flight/w1-l1b`; the file is new this wave,
so it arrives at **merge 3**. `viewModel.reloadRooms()` is `DailyRoomViewModel.swift:190` and is
already what the `roomSync` handler calls — this adds no new work, only a second reason to run it.

**Scheduling.** L1-C merges **first** (D14), so this cannot be a task in L1-C's own list, and it must
not be a hope. It is carried in **S6** as a named apply on the integration tip after merge 3.

**Pinned by** `RoomLifecycleTests.theTodayRailFollowsALocalDelete` on `first-flight/w1-l1b` — a known
issue, **not** `isIntermittent`, so it goes red the moment this lands. That red is the signal to
delete the block, not a regression.

---

## O15 → L1-F · reply to `L1F→B-5`: the note is right, and it lands at merge 4

**Your note.** `L1F→B-5` (`RL1F-25`): `StudioQueueBuilder.swift:33` and `:392` count
`context.unreadNotifications` — the raw table, which 00534 writes two rows per event into — so the
Studio row said *"6 unread updates"* beside a bell reading 3 and a feed reading 0. Your evidence,
`shots/w1-review-l1f-r2/07-studio-six-unread-updates-third-count.png`, is the shipped four-tab root.

**The note is accepted, and it is not declined.** `Features/Profile/ViewModels/**` is this lane's
under steward ruling **S-3**, the replacement you wrote is the right one, and `C2-07`'s ruling — one
count of what needs you, from the one service — is the reason.

**It cannot be applied on `first-flight/w1-l1b`.** `BadgeCountService.unreadNotificationCount` does
not exist on this branch:

```
$ grep -n "unreadNotificationCount" Patina/Services/Badges/BadgeCountService.swift
(no output)

$ git show first-flight/w1-l1f:apps/mobile/Patina/Patina/Services/Badges/BadgeCountService.swift \
    | grep -n "unreadNotificationCount"
52:    private(set) var unreadNotificationCount: Int = 0
58:        unreadNotificationCount = rows.filter { !$0.isStudioFallback && !$0.isRead }.count
```

`Services/Badges/**` is yours, the property arrives with your merge, and D14 puts **L1-B at 3 and
L1-F at 4**. Writing your two lines here would not compile. There is also no local substitute worth
having: `RemoteNotification` (the builder's row type) carries no `isStudioFallback`, so any dedup
inside the builder would be a *second* count computed a second way — the thing `C2-07` forbids.

**So it is scheduled, not dropped.** `l1b-notes-out.md` §S6 carries it as a named apply on the
integration tip immediately after **merge 4**, with your exact replacement text, and with the
instruction to delete the `StudioQueueBuilder.swift` entry from `BadgeFreshnessTests.owed` in the
same commit.

**And this lane pins its own half meanwhile.**
`AttentionCountTests.theStudioRowStillOwesTheSharedUnreadCount` (on `first-flight/w1-l1b`) records the
same known issue from this side — not `isIntermittent`, so it reddens the moment the binding lands,
which is the second signal that the block should be deleted. Your `thereIsNoSecondCount` and this
test will go red together; both are done, not broken.

---

## S5 → steward · seven `BrandVoiceLintTests` pins go red as unexpected passes at merge 6

**Finding.** `RL1B2-01` (review, blocker) — now fixed on this branch. L1-E's round-3 and round-4 notes
(`l1-b-notes.md` E3-L1B-1 … E3-L1B-5, E4-L1B-1) were unapplied; they are applied now, verbatim.

The consequence you need to know about is on **L1-E's** side. `BrandVoiceLintTests.swift` on
`first-flight/w1-l1e` wraps its pins for files other lanes own in `pinDirtyToday(_:row:)`, i.e. a
`withKnownIssue` that is **not** `isIntermittent`. Those wrappers were written against the state of
this branch **before** this round. Now that the rows are applied, each one becomes an *unexpected
pass* the moment L1-B is in the tree — which, since L1-E merges last, is every one of them at
**merge 6**.

The seven that will fire, all in `PatinaTests/BrandVoiceLintTests.swift`:

| test | file it pins |
|---|---|
| `moneyFailureCopyApostrophesAreCurly` | `Features/Money/MoneyFailureCopy.swift` |
| `scanReviewApostrophesAreCurly` | `Features/RoomScan/Views/ScanReviewView.swift` |
| `scanWalkApostrophesAreCurly` | `Features/RoomScan/Views/ScanWalkView.swift` |
| `styleResponseModelApostrophesAreCurly` | `Features/RoomScan/Shared/Models/StyleResponseModel.swift` |
| `scanUploadFailureCopyApostrophesAreCurly` | `Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift` |
| `localStoreRecoveryNoticeApostrophesAreCurly` | `Core/Persistence/LocalStoreRecoveryNotice.swift` |
| `styleResponseModelIsClean` / `namedAestheticIsClean` | the two `"Curated"` display-name tables |

**The fix is one line each:** swap `pinDirtyToday(path, row: …)` for `pinCleanToday(path)`. That is
what the wrapper is for; a red here means the deck landed.

**The eighth pin is the opposite case and needs no action.**
`roomsAPIClientApostrophesAreCurly` is `pinCleanToday` — **unwrapped** — and its own doc comment says
`first-flight/w1-l1b` adds `"We didn't get a response."` with U+0027 and that this pin exists to catch
it. It did. `Core/Network/RoomsAPIClient.swift:430` now reads `"We didn’t get a response. Try again."`
and that pin stays green through merge 6.

**Verified on this branch, not asserted:** `PatinaTests/CopyDeckRowsTests.swift` (new) reimplements
L1-E's `lintApostrophes` rule over the nine files and passes.

---

## S6 → steward · the cross-lane halves whose owner has already merged, and five unowned files

**Finding.** `RL1B2-04`, `-05`, `-06`, `-07`, `-08`, `-13` — six review rows with one shape. This
supersedes **S3**, which asked the same question for three of them and has had no ruling; **S2** and
**S4** are folded in so there is one table to rule on.

PROGRAM.md §7: *"an integration note that no owner scheduled is not a plan, it is a hope."* Every row
below is a note whose owner **cannot** schedule it — either because the symbol it needs arrives after
that lane's merge, or because that lane has already merged. Nothing in the table is a disagreement
about the change: the text is written, the mechanism is agreed, and the only thing missing is a
recorded decision about *where the apply happens*.

### The applies, in merge order

> **Round 4 correction (review `RL1B3-03`).** This table was missing **O5**, and the steward has
> since ruled on ownership for three of its rows. `steward.md` §"From L1-C — fix round" routes
> `C-L1B-1` (the Today staleness sentence), `C-L1B-3` (**= O5**) and `C-L1B-4` (**= O7**) to **L1-B
> after merge**. So *who* is settled; the only open question left in this section is **where** — the
> two options below. Every row now carries a `withKnownIssue` tripwire in this lane's suites, none
> `isIntermittent`, so a forgotten apply is a red test and not a silence.

| after merge | note | finding | file | what | re-run | tripwire |
|---|---|---|---|---|---|---|
| **1** (L1-C) | `l1b-notes-out.md` **O11** | `A-34`, `C-11` | `ProductDetailView.swift:413`, `RecommendationsView.swift:381` | draw the verdict pill only `if let verdict = product.matchVerdict` — see the revision below | `MatchScoreResolverTests` | `theVerdictPillsAreStillUnguarded` (×2) |
| **1** (L1-C) | **O12** | `L07-05` | `Features/Profile/Views/StudioHubView.swift` | render `viewModel.stalenessLine` | `LoadStateHonestyTests` | `theStudioHubStalenessLineIsStillOwed` |
| **1** (L1-C) | **O5** | `C4-03` | `Features/Rooms/Views/YourSpacesView.swift` | the error branch for `RoomSyncCoordinator.shared.lastLoadFailed` — Spaces is the surface `C4-03`'s own `where` names **first**, and it draws a bare `Text("No rooms yet")` with no error branch at all | `LoadStateHonestyTests` | `theSpacesErrorBranchIsStillOwed` |
| **1** (L1-C) | **O7** | `R-02`, `A-81` | `Features/Home/Views/DailyGreetingHeader.swift` | the bell must not assert "No unread notifications" over a count nobody fetched | `AttentionCountTests` | `theBellStillOwesItsKnownFlag` |
| **3** (L1-B) | **O14** | `B-03` | `Features/Home/Views/DailyRoomView.swift` | the `LocalRoomSignal` observer | `RoomLifecycleTests` |
| **4** (L1-F) | `l1-b-notes.md` **L1F→B-5** | `RL1F-25` | `StudioQueueBuilder.swift:33,392` | `BadgeCountService.shared.unreadNotificationCount`, then delete the `StudioQueueBuilder.swift` entry from `BadgeFreshnessTests.owed` | `BadgeFreshnessTests`, `AttentionCountTests` |
| **5** (L1-A) | `l1-b-notes.md` **B-L1A-2** | `C9-08` | five `.numberPad`/`.decimalPad` fields in L1-B's files | `.keyboardDoneToolbar()` | `KeyboardDismissalTests` |

Two ways to close it, unchanged from S3 — **one has to be chosen and written into §5.9**:

1. **Named tasks on the integration tip**, this table as the checklist, the named suite re-run after
   each.
2. **A short L1-B fix round rebased onto the tip**, after merge 1 and after merge 5.

Until the halves land, `A-81`, `L07-05`, `C9-08`, `C2-07`, the **Spaces half of `C4-03`** and the pill
half of `A-34`/`C-11` should **not** read as closed in any lane's coverage table. L1-B's own table
marks them open.

**Recommendation, added in round 4.** Option 2 — a short L1-B fix round rebased onto the tip after
merge 1, and a second after merge 5. Three of the four merge-1 rows are already the steward's own
"owner after merge: **L1-B**", the four tripwires live in L1-B's suites, and the two suites they name
(`LoadStateHonestyTests`, `AttentionCountTests`) are this lane's. A named task on the tip would work
equally well; what cannot happen is neither.

### `C3-01` and `C3-15` are **not** on that list, and S3 was wrong about them

`RL1B2-07` reads the two token sweeps as still unowned. On this branch they are —
`ScanFallbackEntryView.swift:181` is still `.font(.custom("Inter-Regular", size: 15, …))`. But
`l1-b-notes.md` **From L1-D — round 3** says L1-D applied every routed-out call-site swap in its own
branch, and that checks out:

```
$ git show first-flight/w1-l1d:…/Features/RoomScan/Views/ScanFallbackEntryView.swift \
    | grep -n "\.custom(\|pearl\|Border\.\|bodySmall\|monoLarge"
118:  … : PatinaColors.Border.strong,
174:  .font(PatinaTypography.bodySmall)
185:  … : PatinaColors.Border.strong,
235:  .font(PatinaTypography.monoLarge)
259:  .stroke(PatinaColors.Border.strong, lineWidth: 1.5)
```

Zero `pearl`, zero `.custom(`. So `C3-01` and `C3-15` need **no apply task** — they need the merge-3
conflict resolved by L1-D's own rule (*take L1-B's structure, re-apply L1-D's substitution*), which
is the conflict table at the end of this file. L1-D's three bars —
`BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile`,
`TypographyAdoptionTests.zeroInlineFontCustom`, `CurrencyFormattingTests.compactFormatterCeiling` —
name any line lost in the merge. **They are bars, not ratchets**; run `ios-gate.sh unit` after merge 3
and they answer.

`C9-08` is the genuine one: `grep -c keyboardDoneToolbar` over
`first-flight/w1-l1a`'s copies of all four files returns **0, 0, 0, 0**, so nobody has applied
`B-L1A-2` anywhere.

> **The user-visible one, so it is not lost in a list.** Until **O11** lands, a piece opened by id
> draws a verdict pill reading **"Not scored yet"** — `ProductAPIClient.fetchProduct` correctly maps
> `matchScore: 0` (`quality_score` is not a match), `matchLabel` bands `0` to that sentence, and
> `hasMatchScore` has no consumer because the guard is in L1-C's file. The alternative is a pill
> reading a flat 50% on a piece the grid just scored 73, which is `C-11` itself. It is a badge
> announcing the absence of a score, and it ships unless O11 is applied (review `RL1B2-08`).

### The **seven** files L1-B edited that no glob covers

`RL1B2-13`, corrected in round 4 by `RL1B3-08`: the table said five and the diff has seven. All seven
changes are correct and minimal; what is missing is the ruling. §5.9 stops at S-5.

| file | why L1-B touched it | previously raised as |
|---|---|---|
| `Patina/PatinaApp.swift` | one modifier line — `.localStoreRecoveryNotice()` for `C7-01` | S2 |
| `Features/Collections/Views/CollectionsView.swift` | `C4-03`'s three states, and E3-L1B-4's noun | S2 |
| `PatinaTests/OrderHandoffTests.swift` | `waitFor`'s 3 s wall-clock budget → 20 s (`RL1B-01`) | S4 |
| `PatinaTests/RoomBudgetTests.swift` | three currency expectations rewritten for `C5-14` | **not previously raised** |
| `PatinaTests/SessionIsolationTests.swift` | participant count 11 → 13, two new `SessionScoped` entries | **not previously raised** |
| `PatinaTests/DecisionConsentValidationTests.swift` | the assertions that break when E3-L1B-2's glyph swap lands on `MoneyFailureCopy`. `Features/Decisions/**` is L1-C's under S-3, and `git diff main...first-flight/w1-l1c --name-only` does **not** list this file, so there is no merge risk — only an unrecorded edit | **round 4** (`RL1B3-08`) |
| `PatinaTests/InvoicesMoneyRailTests.swift` | the assertions that break when `C5-14` retires the compact currency form. `Features/Invoices/**` is L1-C's under S-3; same check, same answer — L1-C does not touch this file | **round 4** (`RL1B3-08`) |

S4 also asked that the ruling cover `CompanionCoachingModelTests.swift` — a second wall-clock poller
this lane deliberately did **not** touch. That ask stands.

**Tell the wave the ceiling moved**: `OrderHandoffTests.waitFor` is now 20 s, not 3 s. A lane adding
main-actor suites is spending that budget.

---

## The merge-3 conflict list, so merge 3 is a checklist and not a discovery

`RL1B2-14`. `git merge-tree --write-tree --name-only <lane> first-flight/w1-l1b`, run on this branch
against all five other lanes:

| against | conflicts |
|---|---|
| `first-flight/w1-l1c` | **none** |
| `first-flight/w1-l1d` | **six** (below) |
| `first-flight/w1-l1f` | **none** |
| `first-flight/w1-l1a` | **one** — `PatinaTests/SessionIsolationTests.swift` |
| `first-flight/w1-l1e` | **none** |

Nineteen files are touched by both L1-B and L1-D; thirteen auto-merge.

| file | conflict | resolution rule |
|---|---|---|
| `Features/RoomScan/Views/ScanFallbackEntryView.swift` | L1-D's token sweep vs L1-B's `GAP4-02`/`GAP4-03` rewrite and `RL1B2-18`'s cell bounds | **take both**: L1-B's structure, L1-D's tokens on it. The two inline `.custom(...)` fonts at `:181,:242` are `D→B-3` and are owed either way |
| `Features/Rooms/Components/RoomBudgetBar.swift` | L1-D tokens vs L1-B's `C5-14` currency | take both |
| `Features/Rooms/Components/RoomGalleryCard.swift` | same | take both |
| `Features/Rooms/Components/WholeHomeCrossRoomBar.swift` | same | take both |
| `Features/Rooms/Views/CrossRoomView.swift` | L1-D tokens vs L1-B's `C5-14` + `C5-09` nouns at `:64,:81` | take both; the noun rows are L1-E's deck and must survive |
| `PatinaTests/RoomBudgetTests.swift` | both lanes rewrote expectations in the same suite | **L1-B's currency expectations win** where they disagree — they are the ones `C5-14`'s implementation now satisfies; keep every L1-D assertion that does not touch a currency string |
| `PatinaTests/SessionIsolationTests.swift` (vs L1-A) | both raised the participant count | **take the union of the `SessionScoped` entries and set the count to the resulting number.** L1-B added `LocalRoomSignal` and `MatchScoreResolver` (11 → 13); L1-A's additions are its own. The literal is a guard, not a fact — it must equal the list |

---

# Round 4 (fix round 3, 2026-09-03) — after review `RL1B3-01` … `RL1B3-12`

Three new notes and one revision. §S6 and the seven-file table above were **edited in place** this
round rather than restated here (`RL1B3-03`, `RL1B3-08`); the diff on this file shows both.

## O11 — **revised** · steward / whoever applies at merge 1 · `A-34`, `C-11`

The guard changed shape. `ProductModel` now carries a **`matchVerdict: String?`** — `nil` when
`hasMatchScore` is false, otherwise the band — so the call site does not have to remember to check a
separate flag. `matchLabel` is unchanged: it is the correct thing to **say** (VoiceOver reading "Not
scored yet" is honest, and L1-E ratified all four bands in `E3-L1B-3`); it was only ever wrong to
**draw**, because both render sites tint the capsule `PatinaColors.success` — a green verdict badge
announcing the absence of a verdict (review `RL1B3-04`).

**`Features/ProductDetail/Views/ProductDetailView.swift`** — today at `:413`, inside the
`HelpTooltip`:

```swift
Text(product.matchLabel)
    .font(PatinaTypography.mono)
    .foregroundStyle(PatinaColors.success)
    …
```

Final:

```swift
if let verdict = product.matchVerdict {
    Text(verdict)
        .font(PatinaTypography.mono)
        .foregroundStyle(PatinaColors.success)
        .tracking(0.3)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(PatinaColors.success.opacity(0.12))
        .clipShape(Capsule())
}
```

**`Features/Recommendations/Views/RecommendationsView.swift`** — today at `:381`, the badge over the
card image. Same shape: wrap the existing `Text(product.matchLabel)` and its six modifiers in
`if let verdict = product.matchVerdict { … Text(verdict) … }`.

**Do not touch `RecommendationsView.swift:338`.** That is `cardAccessibilityLabel`, and "Not scored
yet" spoken is right — `matchLabel` stays there.

**Re-run:** `MatchScoreResolverTests`. Two of its tests are `withKnownIssue` tripwires named
`theVerdictPillsAreStillUnguarded`; they go **red** when this lands, which is the signal to delete
them.

## O16 → **L1-E** · two copy questions, one a ratification and one a gap

### 1. `LocalStoreRecoveryNotice.body` — the deck quotes a sentence this branch has never had

`E3-L1B-3` gives the body's "today" column as:

> `"Something on this phone became unreadable, so we started fresh. Your account's rooms and saved
> pieces come back the next time you're online."`

`first-flight/w1-l1b` has never carried that text. `Core/Persistence/LocalStoreRecoveryNotice.swift:20-25`
reads, and has read since `497cf8bf6`:

> `"Something went wrong with the copy of your home kept on this phone, and we couldn’t read it.
> Anything saved to your account is still there and will come back as you go. Rooms you scanned on
> this phone and never sent are gone."`

`git log -p` on this file shows round 3's commit `a556ed576` changed only the apostrophe. No gate
catches the divergence: `BrandVoiceLintTests.localStoreRecoveryNoticeApostrophesAreCurly` lints
glyphs, not words (review `RL1B3-06`).

**The ask is ratification, not a rewrite.** The shipped sentence names what was lost — *"Rooms you
scanned on this phone and never sent are gone"* — and the deck's version does not. That third clause
is the honest half of a start-over screen. If L1-E agrees, replace the deck row's "final" column with
the shipped text so the two stop disagreeing. If L1-E prefers the shorter version, say so and L1-B
applies it — but then the deck should say where the unsent scans went.

### 2. Five strings that arrived after `O13` and have no deck row

`O13` asked L1-E to review seven new strings and `E3-L1B-3` answered all seven. These five landed in
rounds 2–4 and were never sent. All are in files L1-B owns; all are curly and, as far as this lane can
judge, in voice — so this is a ratification ask (review `RL1B3-07`).

| file:line | string | what it is |
|---|---|---|
| `Features/Proposals/Views/ProposalDetailView.swift:106` | `"Opening your proposal…"` | the `R-05` skeleton's own line, under the proposal's title when the app knows it |
| `Features/Proposals/Views/ProposalDetailView.swift:117-119` | `"Opening \(title)"` / `"Opening your proposal"` | the same skeleton's accessibility label, with and without a known title |
| `Features/RoomScan/Views/QuietConversationFlowHost.swift:216` | `"Getting ready…"` | `GAP4-25`'s `.initial` waiting state, beside a `ProgressView` |
| `Features/Profile/ViewModels/StudioHubViewModel.swift:70-74` | `"We couldn’t reach your studio just now."` · `"Last updated \(…)."` | `L07-05`'s `stalenessLine`, the two halves of "this is not current" |
| `Features/RoomScan/Views/QuietConversationFlowHost.swift:100-106` | `"Not now"` + hint `"Leaves setting up this room and goes back home."` | `GAP4-02`'s exit control. **Round 4 widened it from two steps to seven** (`RL1B3-10`), so the same two strings now appear on the style, reveal, soft-landing, floor-plan and threshold steps — worth a read in that wider context |

L1-E merges last and its lint sweeps only the files it pins, so nothing else will catch these.

## O17 → **L1-F** · `LaunchWatchdog.swift` is no longer byte-identical

Answering `L1F→B-4`, which recorded the two copies as identical. They now differ, on purpose.

`stallDeadline` is **unchanged at 8 s** — it is L1-F's forced-`.auth` deadline in
`AppCoordinator.scheduleLaunchWatchdog`, and nothing about `F-L1B-1` changes.

What is new is `LaunchWatchdog.splashSurfaceDeadline` (`= stallDeadline - 1.5`, i.e. **6.5 s**), which
is when `SplashView` renders `stallMessage`. The two halves shared one constant and the two clocks do
not start together: `AppCoordinator.launchDeadline` is a stored property initialised inside
`PatinaApp.init()`, strictly before `SplashView`'s body mounts and its `.task` begins sleeping. So at
T+8 s the coordinator recomputed first, `derivePhase()` past the deadline returned `.auth`, the splash
was torn down and its `.task` cancelled at the `guard !Task.isCancelled` — the C1-19 sentence was
unreachable UI in exactly the launches it exists for (review `RL1B3-02`).

**Nothing is asked of L1-F.** At merge 4, take **L1-B's** copy of `Core/State/LaunchWatchdog.swift`;
`AppCoordinator.swift` keeps reading `LaunchWatchdog.stallDeadline` and needs no edit.
`LaunchWatchdogTests.theSplashSpeaksBeforeTheCoordinatorForcesAuth` pins the ordering rather than
either number, so it survives a later change to 8.

## S7 → steward · what changed in §S6 this round

`RL1B3-03` and `RL1B3-08`. Both are corrections to this file, made in place above:

1. **§S6's applies table gains O5** (`C4-03`'s Spaces half). It was the one row missing, and Spaces is
   the surface `C4-03`'s own `where` names first. Sim-confirmed on the round-3 tree: Your Spaces drew
   `Text("No rooms yet")` with no error branch in the file at all.
2. **The steward's own routing is folded in.** `steward.md` §"From L1-C — fix round" already assigns
   `C-L1B-1`, `C-L1B-3` (= O5) and `C-L1B-4` (= O7) to **L1-B after merge**, so ownership is settled
   and only the *where* is open. §S6 now says so and recommends option 2.
3. **All four merge-1 rows now carry a `withKnownIssue` tripwire** in L1-B's own suites — O5 and O12
   in `LoadStateHonestyTests`, O7 in `AttentionCountTests`, O11 (×2) in `MatchScoreResolverTests`.
   None is `isIntermittent`, so each turns red the moment its note lands. An unapplied note is now a
   test, not a hope.
4. **The unowned-file table is seven rows, not five** —
   `PatinaTests/DecisionConsentValidationTests.swift` and `PatinaTests/InvoicesMoneyRailTests.swift`
   were edited and never listed. Both are the test files for globs S-3 gives L1-C, both edits are
   forced (E3-L1B-2's glyph swap and `C5-14`'s retirement of the compact currency form), and
   `git diff --name-only main...first-flight/w1-l1c` lists neither, so there is no merge risk — only
   an unrecorded edit. The §5.9 ruling should cover all seven, plus `CompanionCoachingModelTests.swift`
   (S4's standing ask).

