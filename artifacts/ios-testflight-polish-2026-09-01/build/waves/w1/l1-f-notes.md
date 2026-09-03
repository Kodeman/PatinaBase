# W1 · L1-F — integration notes

Notes addressed **to** L1-F. Each is a numbered task for L1-F's own task list, carrying exact final
text.

---

## From L1-B (Data, persistence, resilience) — 2026-09-02

Four tasks, three of them in `App/Coordinators/AppCoordinator.swift` — the file the ownership model
gives L1-F whole, and the file two of L1-B's findings resolve into. Full context, and the notes L1-B
sent to the other lanes, in `build/waves/w1/l1b-notes-out.md`.

`PatinaTests/AccountIsolationTests.swift` and `PatinaTests/RefreshableSurfacesTests.swift` on
`first-flight/w1-l1b` carry `withKnownIssue(isIntermittent: true)` rows for Tasks F-L1B-2 and
F-L1B-4. They pass in both states by design — L1-B's gate must not go red before these land, and the
integration gate must not go red after — but the test report names each one that is still owed.

---

### Task F-L1B-1 — `C1-19` + `C1-18`: the `.launching` watchdog and the splash floor

L1-B owns `Features/Splash/**` and has landed its half: `SplashView` surfaces
`LaunchWatchdog.stallMessage` after `LaunchWatchdog.stallDeadline` (8 s) when auth readiness has not
arrived, and its wordmark animation now finishes inside 1.2 s. `Core/State/LaunchWatchdog.swift` is
new, is on `first-flight/w1-l1b`, and carries both constants;
`PatinaTests/LaunchWatchdogTests.swift` pins them. **This is the half that actually lets the person
move.**

**1. Two new stored properties, beside `splashDeadlineTask`:**

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

**2. A recompute at that deadline, beside `scheduleSplashDeadlineRecompute()`:**

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

**3. `derivePhase()` — replace:**

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

**4. `C1-18` — the floor.** Replace

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
`0.6` otherwise. ⚠ `LaunchWatchdogTests.anUnresolvedLaunchPaysAShortOne` asserts
`floor < AppCoordinator.splashMinimumDuration` **against the old 1.5** — drop that one line when this
lands. It is the only assertion in that suite that reads the current value on purpose.

---

### Task F-L1B-2 — `C2-06`: sign-out leaves the previous account's screens on the stack

Sign-out runs `presentedSheet = nil` + `beginSplashTransition()` + `signOut()`, and `recomputePhase`
clears only `presentedSheet` when leaving `.main` (`:223-225`). `navigationPath = NavigationPath()`
appears only in `navigate(to: .heroFrame)` (`:330`) and `resetToThreshold()` (`:694`) — so the next
session came back to the previous account's screens.

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

`screenStack` is `private var` at `:46`, so this has to be written inside `AppCoordinator.swift` — it
is not something L1-B could have reached from its own files.

L1-B has closed the other two thirds of the account-isolation set in its own files:
`LocalStoreOwnership` scopes every room and taste-portrait read so the guest a sign-out leaves behind
sees neither (`GAP3-18`, `B-15`). When this task lands,
`AccountIsolationTests.theSignOutClearsThePreviousAccountsNavigationStack` stops recording a known
issue — turn its `withKnownIssue(…) { #expect(clears) }` into a bare `#expect(clears)` at that point.

---

### Task F-L1B-3 — `R-02`: a failed cold launch deletes badge counts instead of degrading

`Services/Badges/BadgeCountService.swift`. In-process, `apply(…)` already preserves a failed source
(`nil` keeps the previous value) — that part is right. The gap is the **cold launch**: nothing is held
across a process boundary, so a first refresh that fails publishes zeros. The walk measured exactly
that, same account, one relaunch apart, backend unreachable: bell badge `3` → no badge, Studio pill
`Studio 5` → `Studio`, one record row gone, and the app never said a word.

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
- clear the key in `resetForSessionChange()`: they are the previous account's, and without this
  account B's first launch paints account A's numbers.

The VoiceOver half of `R-02` — the bell asserting "No unread notifications" over a count nobody
fetched — is `DailyGreetingHeader.swift` and went to **L1-C** as Task C-L1B-4.

---

### Task F-L1B-4 — `C4-12`: the thread detail

`Features/Messaging/Views/ThreadDetailView.swift` — `.refreshable` calling exactly what its `.task`
calls:

```swift
        .refreshable { await viewModel.load(threadId: threadId) }
```

(substitute the `.task`'s own call verbatim if the signature differs). This is the fourth of the five
Studio detail screens; the invoice detail already has one and is the in-repo pattern. L1-B has landed
the proposal and project details, the two it owns.

---

### Heads-up, no action

1. **`Patina/PatinaApp.swift` gains one line** — `.localStoreRecoveryNotice()`, on the `ContentView()`
   chain beside `.modelContainer(…)`. `PatinaApp.swift` is in no lane's glob; the modifier and its
   screen live entirely in `Core/Persistence/` (L1-B's). It is `C7-01`'s one-time "we had to start
   this phone's copy over" screen and it is a no-op on every launch that did not recover a store.
2. **`SessionScope.participants()` is 13, not 11** — `MatchScoreResolver` and `LocalRoomSignal` joined
   it. `SessionIsolationTests`'s count assertion and its `participantFiles` set are updated on
   `first-flight/w1-l1b`; a lane adding a twelfth singleton this wave should expect a conflict in
   exactly those two places.
3. **`Core/Persistence/WidgetSnapshot.swift` and `RecordSnapshotStore.swift` are untouched** by L1-B,
   as the glob says.

### VISION check on these notes

Nothing here adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement
mechanic or the word "AI". Task F-L1B-1 surfaces one sentence and shortens two animations; F-L1B-2
clears state; F-L1B-3 keeps an existing number on screen instead of deleting it; F-L1B-4 adds a
gesture.
