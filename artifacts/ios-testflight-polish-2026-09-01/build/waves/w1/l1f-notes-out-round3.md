# W1 · L1-F — notes out, round 3 (fix round)

Written after the round-1 adversarial review (`RL1F-01`…`RL1F-18`) and after applying
`build/waves/w1/l1-f-notes.md`, which arrived at 19:26 — 23 minutes after this lane's last round-1
commit. Every block below is appended verbatim to its target's own notes file.

Round-1 and round-2 notes (`L1F→D-1`, `L1F→C-1`, `L1F→A-1`, `L1F→B-1`, `L1F→A-2`, `L1F→D-2`) stand
except where a block below says otherwise.

---

## L1F→B-2 → **L1-B** · drop the one `LaunchWatchdogTests` line F-L1B-1 tells me to drop

`l1-f-notes.md` Task F-L1B-1 carries its own ⚠, and this is it landing:

> ⚠ `LaunchWatchdogTests.anUnresolvedLaunchPaysAShortOne` asserts
> `floor < AppCoordinator.splashMinimumDuration` **against the old 1.5** — drop that one line when
> this lands.

**It has landed.** `AppCoordinator.splashMinimumDuration` is now
`LaunchWatchdog.splashFloor(isAuthStateReady: false)` — that is F-L1B-1's own edit 4, applied
verbatim — so the assertion reads `0.6 < 0.6` and is false.

`PatinaTests/LaunchWatchdogTests.swift` is your file. One line goes, at
`LaunchWatchdogTests.swift:96` as it stands on `first-flight/w1-l1b`:

```swift
        #expect(floor < AppCoordinator.splashMinimumDuration)
```

The two above it — `#expect(floor > 0)` and `#expect(floor <= 0.6)` — say everything that assertion
was for and stay.

L1-F's own `PatinaTests/LaunchWatchdogFallbackTests.swift` picks up the relationship from the other
side, so nothing is lost by the deletion:

```swift
        #expect(
            AppCoordinator.splashMinimumDuration
                == LaunchWatchdog.splashFloor(isAuthStateReady: false)
        )
        #expect(AppCoordinator.splashMinimumDuration < 1.5)
```

---

## L1F→B-3 → **L1-B** · `LocalStoreReset` does not know the deep-link queue's key

**Finding.** `RL1F-07` (round-1 review, major): the pending-link FIFO survives a session.

L1-F has closed the sign-out door: `AppCoordinator.clearNavigationForEndedSession()` now calls a
`deepLinkClear` closure that `DeepLinkHandler.configure(coordinator:)` registers, and
`SignOutResetTests.theQueueIsClearedWhenASessionEnds` pins it.

The second door is yours. `Core/Persistence/LocalStoreReset.swift`'s `wipeUserScopedData()` is what
runs when a **different account signs in** — the `A → B` path with no sign-out in between — and it
does not know `patina.deeplink.pending.v1` exists. The queue lives in the App Group suite with a
15-minute life, so on that path account A's tap can still drain into account B's first `.main`.

One line, beside `RecordOwnerStamp.shared.clear()` (`:66` on your branch):

```swift
        // A link account A tapped and never got to open is account A's request.
        // It lives in the App Group suite with a 15-minute life, so without
        // this it drains into account B's first `.main` (RL1F-07). The queue's
        // own `clear()` is `@MainActor`; the key is not, and this is the same
        // domain `RecordOwnerStamp` and `LastSeenStore` write to.
        (UserDefaults(suiteName: PendingLinkQueue.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: PendingLinkQueue.defaultsKey)
```

Both symbols are `static let` on `PendingLinkQueue` (`App/DeepLinking/PendingLinkQueue.swift`, L1-F's
file) and are already non-isolated, so this needs no `await` and no actor hop — which is why it is
written as the raw key rather than `PendingLinkQueue().clear()`.

If `wipeUserScopedData()` is not `@MainActor` on your branch this compiles as written; if it is, use
`PendingLinkQueue().clear()` instead and drop the comment's last sentence.

---

## L1F→B-4 → **L1-B** · `LaunchWatchdog.swift` is on `first-flight/w1-l1f` too, byte-identical

**Not a request — a record, so merge 3 → 4 holds no surprise.**

F-L1B-1's text references `LaunchWatchdog.stallDeadline` and
`LaunchWatchdog.splashFloor(isAuthStateReady:)`. `Core/State/LaunchWatchdog.swift` is your file and
your glob; it does not exist on `main`, so applying your note verbatim on this branch would not
compile and this lane's own gate could not be green.

So the file was brought across **unmodified**:

```bash
git checkout first-flight/w1-l1b -- apps/mobile/Patina/Patina/Core/State/LaunchWatchdog.swift
```

`git diff first-flight/w1-l1b:…/LaunchWatchdog.swift first-flight/w1-l1f:…/LaunchWatchdog.swift` is
empty. An add/add of identical content merges clean, so merge 3 (L1-B) → merge 4 (L1-F) resolves
without a conflict and the constants stay in exactly one place — which is the mechanism your note is
built on.

**The one thing that would break it:** editing `LaunchWatchdog.swift` on `first-flight/w1-l1b` before
merge 3. If you need to, say so and this lane will re-sync rather than let the steward hit an add/add
conflict. Nothing else in `Core/State/**` was touched — `FeatureFlags.swift` is unchanged in this
round, and its D1a default table is untouched as §5.7 requires.

---

## L1F→C-2 → **L1-C** · `C2-07` still reproduces — `L1F→C-1` is unapplied

**This supersedes nothing in `L1F→C-1`; it is the same one-line change, re-sent because the review
walked it and found the defect live.**

`RL1F-01` (round-1 review, **blocker**): *"C2-07 is claimed closed but reproduces exactly as written —
the bell still badges 3 after the feed is read."* Evidence:
`shots/w1-review-l1f/14-c2-07-bell-still-badges-3-after-mark-all-read.png`.

On `first-flight/w1-l1c` today the line is at **`DailyRoomView.swift:271`** (it was `:258` when
`L1F→C-1` was written — your own edits moved it):

```swift
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count,
```

Replace with:

```swift
                    // C2-07: one count, from the one service every surface
                    // reads. Today's private view model still drives the push
                    // primer (`presentPushPrimerIfEarned`); it no longer drives
                    // the badge, because marking a row read in the feed mutated
                    // a different instance and the bell went on badging 3.
                    unreadCount: BadgeCountService.shared.unreadNotificationCount,
```

Nothing else in the file changes — `@State private var notificationsViewModel` and its
`.task { await notificationsViewModel.load(); presentPushPrimerIfEarned() }` stay exactly as they are.
`BadgeCountService` is `@Observable`, so the bell repaints when the feed marks a row read without
Today re-running anything. L1-F's half (the service's `unreadNotificationCount`, published on load and
after every mark-read including both optimistic rollbacks, zeroed by `resetForSessionChange()`) is on
`first-flight/w1-l1f` and pinned by `BadgeFreshnessTests`.

**New this round, and the reason you will see it in your own test report:**
`BadgeFreshnessTests.thereIsNoSecondCount` used to scan only `Patina/Features/Notifications` — which
is exactly why a missing note passed the gate. It now scans `Patina/Features/Home` as well, with
`DailyRoomView.swift` routed through `withKnownIssue(isIntermittent: true)` while the line is still
there. It passes in both states by design (the convention L1-B set this wave), and the run names the
owed note for as long as it is owed. **When you apply this change the known issue simply stops
recording** — nothing goes red, and nothing needs deleting on your side.

`C2-07` is reported **open** in L1-F's round-2 report until this lands.

---

## L1F→X-1 → **the steward / integration** · four things to carry through the merge

1. **`AccountIsolationTests.theSignOutClearsThePreviousAccountsNavigationStack`** (L1-B's file) still
   carries `withKnownIssue(isIntermittent: true)` for Task F-L1B-2. That task **is** applied on
   `first-flight/w1-l1f`, on a deliberately different seam — `clearNavigationForEndedSession()`, keyed
   on the `.main → .auth/.launching` transition, rather than a rewrite of `beginSplashTransition`. The
   review (`RL1F-04`) rules the deviation defensible and better: it also covers the forced sign-out
   that never routes through `beginSplashTransition`. After merge 4, flip that test from
   `withKnownIssue(…) { #expect(clears) }` to a bare `#expect(clears)` and confirm it passes —
   otherwise the wave carries a permanently green known issue with no issue behind it.

2. **`BadgeFreshnessTests.thereIsNoSecondCount`'s known issue** is the mirror of that: it should stop
   recording once `L1F→C-2` lands. If the merged tip's run still names it, `C2-07` is still open —
   check `DailyRoomView.swift` before signing the wave off.

3. **`LaunchWatchdog.swift` is added identically on `first-flight/w1-l1b` and `first-flight/w1-l1f`**
   (see `L1F→B-4`). Expect a clean identical add/add at merge 4; if git reports a conflict on it, L1-B
   edited the file after merge 3 and **L1-B's version is the one to keep** — L1-F's copy is a
   verbatim import, never an edit.

4. **`C9-05` is closed by `L07-02`'s fix**, incidentally and correctly. `findings.json` still carries
   it as W2 / L1-F / open with a `retieredBy: D1` note.
   `ThreadDetailView.swift` applies `pinnedFooterClearance(houseFirst: false)` — dockHeight + 8 = 148 pt
   — on the flag-off root too, which is `waves/w0/l07-notes.md` §N2's own ruled fix line passing the
   flag through the same metric. Evidence:
   `shots/w1-review-l1f/17-flags-off-thread-composer-clears-dock.png` (composer at y 651.67 clearing
   the dock band at {{0,720},{402,120}}). Mark it closed-by-`L07-02` so W2 does not re-open a fixed
   screen, and so the `.threadDetail`-in-`yieldsToPinnedFooter` route it originally asked for is **not**
   applied on top of the padding — that would double the inset.
