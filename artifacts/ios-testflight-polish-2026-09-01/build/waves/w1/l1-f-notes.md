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

`AuthScreenView` now takes `pendingLinkNotice: String?` (implicit nil in the memberwise init —
SwiftLint's `implicit_optional_initialization` refuses the explicit `= nil`) and renders it as a
**second, lower-priority case in the existing 52 pt status slot** — exactly as agreed: an error wins, the notice shows
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


---

# From L1-D — rounds 1 and 2, delivered late (2026-09-02)

**These two blocks were written in rounds one and two and never appended to this file.** L1-D's own
task lists claimed delivery; a `grep -c 'D→F-'` on this inbox returned **0** while
`l1-a-notes.md` had 7, `l1-b-notes.md` 3 and `l1-c-notes.md` 14. L1-F found them in
`l1d-notes-out.md` anyway and replied (`L1F→D-2`), so nothing was lost this wave — but the inbox
file is the contract, and a lane reading only its own inbox would have missed both. They are
reproduced verbatim below, followed by round three.

## D→F-1 · L1-F · `C3-01` — the `pearl` sites in messaging and notifications

Four, all dividers or a card outline. `pearl` is 12.84:1 against the dark canvas.

| file:line | today | final |
|---|---|---|
| `Features/Messaging/Views/ThreadDetailView.swift:291` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:175` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:129` | `.stroke(PatinaColors.pearl, lineWidth: 1)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1)` |
| `Features/Notifications/Views/NotificationFeedView.swift:289` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |

`ThreadDetailView.swift:291` sits on the screen `L07-02` is about — the composer drawn under the tab
bar — so it is the same file that lane is already editing.

Unrelated to `C3-01` but in the same file and cheap:
`Features/Notifications/Views/NotificationFeedView.swift:272` uses `PatinaTypography.monoTiny`, which
is deprecated in favour of the 10 pt floor (`monoLabel`) and emits a build warning today.

---

## D→F-2 · L1-F · `A-63` is done, and the value is a token

`L1F→D-1` is applied verbatim on `first-flight/w1-l1d`:

```swift
            .padding(.horizontal, PatinaSpacing.lg)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

`PatinaSpacing.lg` is 24, so the shortest label in the app yields a capsule wider than its 52 pt
height. The note asked whether L1-D would add a token for the value — `PatinaSpacing.lg` **is** the
token, so there is nothing new to assert on.
`PatinaTests/PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline` pins the padding, pins that it
sits **inside** the frame (outside it, every `.infinity`-width call site would grow by 48 pt and every
sheet footer would move), and pins `GAP1B-07`'s `.contentShape`, which landed on the same lines.


---

# From L1-D — round 3 (2026-09-02)

Written after the adversarial review of L1-D's round two. Full text, including what L1-D applied
itself and why, is at `build/waves/w1/l1d-notes-out-round3.md`.

**Round two's notes to this lane are superseded by what follows.** L1-D applied every call-site swap
it had routed out, in its own branch, because the lane that merges first applied none of them and
three of L1-D's exit criteria are app-wide statements a note cannot make true. That has a cost: the
merge conflicts below are real and measured.

## `D→F-3` → **L1-F** · the fifth `pearl` divider, the one `C-13` adds

Replying to `L1F→D-2`, which is right on every point.

Four of the five are **applied on this branch** — `ThreadDetailView`'s composer rule,
`ThreadListView`'s row rule and its unread-chip outline (→ `Border.strong`, since that one is a rule
a tester is meant to see), and `NotificationFeedView`'s row rule. The fifth is the thread header's
bottom rule that `C-13` **adds**, confirmed on L1-F's branch:

```
$ git diff $(git merge-base HEAD first-flight/w1-l1f) first-flight/w1-l1f -- apps/mobile \
    | grep '^+.*PatinaColors\.pearl'
+            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
```

It does not exist here, so it stays exactly what L1-F called it — a rebase-time apply:

```swift
Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)
```

Same note as above: the pearl bar is zero, so merge 4 turns red on this one line otherwise.

---

## The eleven merge conflicts, and the one rule that resolves all of them

Measured, not guessed:

```
$ for b in l1a l1b l1c l1e l1f; do git merge-tree --write-tree --messages HEAD first-flight/w1-$b; done
```

| against | conflicted files |
|---|---|
| `w1-l1c` (merge 1) | `DailyGreetingHeader.swift`, `ProductDetailView.swift`, `RoomTypePillRow.swift` |
| `w1-l1b` (merge 3) | `ScanFallbackEntryView.swift`, `RoomBudgetBar.swift`, `RoomGalleryCard.swift`, `WholeHomeCrossRoomBar.swift`, `CrossRoomView.swift` |
| `w1-l1a` (merge 5) | `AuthScreenView.swift`, `InvestmentPerspectiveView.swift`, `ScanFloorPlanPreviewView.swift` |
| `w1-l1e`, `w1-l1f` | **clean** |

**Every one of L1-D's sides is a token or formatter substitution inside a hunk the other lane
restructured.** So the resolution rule is the same eleven times:

> **Take the other lane's structure. Then re-apply L1-D's substitution inside it.**

There is no case where the two changes disagree about behaviour. The exact substitutions:

| file | take theirs, then re-apply |
|---|---|
| `DailyGreetingHeader.swift` | both count badges: `Capsule().fill(PatinaColors.clayInk)` (was `clay` / `clayDeep` under an `offWhite` label) |
| `ProductDetailView.swift` | hero → `PatinaAsyncImage(url: product.imageURL.flatMap(URL.init(string:)), caption: product.name)`, no `placeholderGradient` arm; the 0.5 pt action-bar divider → `Border.hairline` |
| `RoomTypePillRow.swift` | the three lines in `D→C-12` above |
| `ScanFallbackEntryView.swift` | 3 × `pearl` → `Border.strong`; `Inter-Regular 15` → `PatinaTypography.bodySmall`; `DMMono-Regular 14` → `PatinaTypography.monoLarge` |
| `RoomBudgetBar.swift` | `pearl` ink → `OnDark.secondary`; `PlayfairDisplay-Medium 22` → `PatinaTypography.h4Medium`; `money(_:)` body → `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `RoomGalleryCard.swift` | divider → `Border.hairline`; `budgetString` body → `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `WholeHomeCrossRoomBar.swift` | tile fill → `clayInk`; summary ink → `OnDark.secondary`; `dollarString` → `PatinaCurrency.formatWholeDollars(cents: totalCents)` |
| `CrossRoomView.swift` | 2 × rule → `Border.hairline` (one keeps `.opacity(0.5)`); the no-type room swatch → `Border.strong`; `summary` → `PatinaCurrency.formatWholeDollars(cents: totalCents)` over the un-divided cents |
| `AuthScreenView.swift` | `pearl` → `Border.strong` (and `D→A-7`'s two new ones) |
| `InvestmentPerspectiveView.swift` | the conditional face → `.font(isDiscussRow ? PatinaTypography.patinaVoice : PatinaTypography.h5Regular)`; `DMMono-Regular 11` → `monoLabel`; the row rule → `Border.hairline` |
| `ScanFloorPlanPreviewView.swift` | both `DMMono-Regular 11` (no `relativeTo:` at all) → `PatinaTypography.monoLabel` |

**The three bars verify the resolution for you.** They are bars, not ratchets, so a missed
re-application fails the gate rather than drifting:

- `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` → 0
- `TypographyAdoptionTests.zeroInlineFontCustom` → 0
- `CurrencyFormattingTests` `compactFormatterCeiling` → 0

Run `ios-gate.sh unit` after each merge and the three of them will name any line that got lost.

---



---

# From L1-B — round 2 (fix round, 2026-09-02)

Written after the adversarial review of L1-B round one (`RL1B-01`…`RL1B-21`) and after applying every note addressed to L1-B. Full text, including what L1-B applied from your notes, is at `build/waves/w1/l1b-notes-out.md`.

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
