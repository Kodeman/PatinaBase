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


---

## From L1-E (Copy) — round 2, 2026-09-02 (after the adversarial review of deck revision 1)

Full text, with the blocks sent to the other lanes, is at `build/waves/w1/l1e-notes-out.md`. Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 2**.

### Note F-L1E-1 — `A-52`'s third site was yours all along; thank you for catching it

`Features/Notifications/Views/NotificationFeedView.swift:193`. Deck revision 1 filed this row under
"L1-A applies", and `l1e-notes-out.md` round 1 recorded "**L1-F (none in W1)**" — so this lane never
told you about a row in your own glob (`Features/Notifications/**`, steward.md §5.7). You found and
applied it anyway; on `first-flight/w1-l1f` the guest empty state reads:

```swift
message: "Sign in to see updates on your projects and messages here.",
```

which is the deck's exact final text. **No action.** The routing is corrected in deck revision 2 and
the string is pinned by `GuestPromiseTests.notificationsGuestStateMakesNoPromise`. Recorded here so
the wave record shows the row had an owner who was told, rather than an owner who guessed.


---

## From L1-A — fix round (2026-09-02)

Full text, with the notes sent to the other lanes, is `build/waves/w1/l1a-notes-out-round2.md`.

### Note F-L1A-3 — the receiving half of `L1F→A-2` is in; one call-site line is still yours to unblock

`AuthScreenView` now takes `pendingLinkNotice: String? = nil` and renders it as a **second, lower
priority case in the existing 52 pt status slot** — exactly as agreed: an error wins, the notice shows
only when `errorMessage == nil`, and the slot's height is unchanged either way
(`AuthErrorRoutingTests.theNoticeYieldsToAnError` measures both through `UIHostingController`).

What is **not** in, because it does not compile on this branch: the one line in `ContentView.swift`'s
`.auth` case, which reads a property that exists only on `first-flight/w1-l1f`.

```swift
                    errorMessage: AuthService.shared.rootErrorMessage,
                    pendingLinkNotice: coordinator.pendingLinkNotice
```

L1-F merges **fourth** and L1-A **fifth** (D14), so this is a one-line addition at L1-A's rebase.
`AuthSheet.swift` needs nothing — the parameter defaults to nil, and a link held while the modal is up
is acknowledged by the sheet dismissing into the destination, as you said.

Reported open in L1-A's lane report against `C2-21` / `GAP7B-09`.

### Note F-L1A-4 — round one's two blocks were never appended to `l1-f-notes.md`

`RL1A-13`. `l1a-notes-out.md` carried a "To L1-F" section (Task `F-L1A-1`, Note `F-L1A-2`) that was
written to L1-A's own out-file but never appended to L1-F's inbox — `grep -n "A-52\|NotificationFeedView\|F-L1A" l1-f-notes.md`
returned nothing, while `l1-b`, `l1-c`, `l1-d` and `l1-e-notes.md` all carry their "From L1-A" block.

**No work was lost:** L1-F read `l1a-notes-out.md` directly and records `F-L1A-1 … Applied … Commit
8d8582db2` in `l1f-notes-out.md:251`, and answered `F-L1A-2` as `L1F→A-2`. The blocks are appended to
`l1-f-notes.md` in this round so §7's "an integration note that no owner scheduled is not a plan"
audit reads true from the inbox files alone.

---



---

## From L1-A — round one, appended late (RL1A-13)

These two blocks were written to `build/waves/w1/l1a-notes-out.md` during round one and never appended here. No work was lost — L1-F read the out-file directly and records `F-L1A-1 … Applied … Commit 8d8582db2`, and answered `F-L1A-2` as `L1F→A-2` — so this is the record catching up with the work, so that §7's "an integration note that no owner scheduled is not a plan" audit reads true from the inbox files alone.

### Task F-L1A-1 — `A-52`, from L1-E's copy deck, in L1-F's file

The deck files an `A-52` row under *"L1-A applies"* that lands in
`Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView`), which is **L1-F's**
glob. L1-A did not apply it. Exact final text, from the deck:

- `:193` message → `"Sign in to see updates on your projects and messages here."`
- `:192` title `"Nothing yet"` — **unchanged.**

The view is already correctly branched on auth state; only the sentence inside it still presumes a
designer relationship the guest does not have.

### Note F-L1A-2 — `C2-21` / `GAP7B-09`'s acknowledgement line

Both are **L1-F rows** on `AppCoordinator.swift` (the deep-link queue). PROGRAM.md §3 · L1-A's
integration notes say they carry "an L1-A acknowledgement line on the auth screen".

`AuthScreenView` now has a **fixed-height status slot** (`AuthScreenView.statusSlotHeight`, 52 pt,
always in the layout) built for `P-29`. It renders `errorMessage` today. If L1-F wants the queued-link
acknowledgement there, send back the exact sentence and the property name to read, and L1-A will add a
second, lower-priority case to the same slot — **not** a second element, because the whole point of
`P-29` is that nothing on that screen may move.

L1-A has **not** added an acknowledgement line: with no queue state exposed to read there is nothing to
render, and inventing a sentence for a mechanism L1-F has not built yet would be a guess.

