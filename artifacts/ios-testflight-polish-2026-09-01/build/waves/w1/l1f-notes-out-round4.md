# W1 · L1-F — notes out, round 4 (fix round 2)

Written after the round-2 adversarial review (`RL1F-19`…`RL1F-35`). Every block below is appended
verbatim to its target's own `<lane>-notes.md`.

Rounds 1–3 (`L1F→D-1`, `L1F→C-1`, `L1F→A-1`, `L1F→B-1`, `L1F→A-2`, `L1F→D-2`, `L1F→B-2`, `L1F→B-3`,
`L1F→B-4`, `L1F→C-2`, `L1F→X-1`) stand except where a block below says otherwise. `L1F→X-2`
**supersedes** `L1F→X-1` — it repeats all four of its items and adds five.

---

## L1F→B-5 → **L1-B** · a third unread count, on the Studio tab, disagreeing with the other two

**Finding.** `RL1F-25` (round-2 review, major). Evidence:
`shots/w1-review-l1f-r2/07-studio-six-unread-updates-third-count.png`.

After **Mark all read** the feed shows zero unread, the bell says "3 unread" and
`StudioHub.Section.conversation` says **"Studio updates, 6 unread updates"** — three numbers for one
thing, on the shipped four-tab root. The 6 matches neither: migration 00534 writes two rows per
event, so this one is counting the un-deduped table.

`Features/Profile/ViewModels/**` is yours under steward ruling **S-3**, so this is your file.

`Features/Profile/ViewModels/StudioQueueBuilder.swift:392` as it stands on `first-flight/w1-l1b`:

```swift
        let unreadCount = context.unreadNotifications.count
```

Replace with:

```swift
        // C2-07 / RL1F-25: one count of what needs you, from the one service
        // every surface reads. `context.unreadNotifications` is the raw table,
        // which 00534 writes two rows per event into — so this row said 6 while
        // the feed said 0 and the bell said 3.
        let unreadCount = BadgeCountService.shared.unreadNotificationCount
```

`:33` (`unreadUpdateCount: context.unreadNotifications.count`) is the same number in the same builder
and takes the same replacement. `BadgeCountService` is `@Observable` and `@MainActor`; the builder is
already on the main actor.

**Why you will see this in your own test report.**
`BadgeFreshnessTests.thereIsNoSecondCount` (L1-F's file) now scans `Patina/Features/Profile` as well
as `Notifications` and `Home`, and greps for the *expression* rather than one spelling of it. While
the line above is unchanged it records a known issue naming this note. **It is not
`isIntermittent`** — so the moment you apply this, that block **fails** with
"the other half is still unapplied — …/StudioQueueBuilder.swift" recorded as an unexpected pass.
That is deliberate (`RL1F-19`: a waiver that passes in both states can never report anything). When
it goes red, delete the `StudioQueueBuilder.swift` entry from `BadgeFreshnessTests.owed` — the block
says so in its own message. L1-B merges 3rd, L1-F 4th, so the steward will be the one holding it;
`L1F→X-2` carries the instruction there too.

If you would rather not touch the file this wave, say so and it stays a known issue into W2 — but the
Studio tab then ships build 1 disagreeing with the bell about a number a tester can see on two
screens without scrolling.

---

## L1F→C-3 → **L1-C** · `RecordRefresh.run` must name the session it saves for

**Finding.** `RL1F-21` (round-2 review, major), reproduced by the reviewer on a clone. Evidence:
`shots/w1-review-l1f-r2/10-widget-snapshot-after-signin-no-ownerId.json`.

Signing in writes `widget-snapshot.json` with one real routed row and **no `ownerId`**, while
`patina.house.recordOwnerId` in the same App Group suite already holds the new account's id.
`HouseWidgetPayload.isPlaceholder` is `ownerId == nil`, so every family draws
`HouseWidgetCopy.noData` — "Open Patina to see your house." — over content that is on disk. And it is
not passive: `RecordSnapshotStore.save()` calls `reloadWidgets` in the same breath, so that frame is
**pushed** to the Home Screen. It self-heals on the next save, so the window is one refresh cycle —
on the sign-in every round-one tester performs. This is `GAP7B-02` verbatim, returning.

The cause is ordering, in your file. `Features/Home/ViewModels/RecordRefresh.swift`:

```swift
        snapshots.save(record)
        steps.append(.saved)

        // Attributed before the visit is stamped: …
        if let sessionUserId, !sessionUserId.isEmpty {
            owner.stamp(sessionUserId)
            steps.append(.attributed)
        }
```

`save` reads the stamp; the stamp is written on the next statement.

**L1-F's half is done.** `RecordSnapshotStore.save` now takes an `owner:` — it stamps before the
payload is composed and writes the named session into the payload directly rather than through the
`UserDefaults` round trip, so no save that names a session can produce an unowned payload. The
default is `nil`, which is exactly today's behaviour, so nothing breaks before you apply this.

**Your half is one word.** Same file, same line:

```swift
        snapshots.save(record, owner: sessionUserId)
        steps.append(.saved)
```

Leave the `owner.stamp(sessionUserId)` block below exactly as it is — it is now a harmless repeat of
what `save` already wrote, and it is what appends the `.attributed` step your own
`RecordRefreshOrderTests` reads. Nothing else in the function changes, and the `.discard` branch above
is untouched.

`WidgetSnapshotOwnershipTests.theRebuildNamesItsSession` (L1-F's file) is a source pin on that exact
line, recorded as a known issue **without** `isIntermittent` while it is owed — so it turns red the
moment you apply it and the block is deleted then. Same convention as `L1F→B-5` above.

### And `L1F→C-1` / `L1F→C-2` are still owed

`RL1F-19` (blocker) is the review walking `C2-07` a second time and finding it live: the bell still
announces "3 unread" after Mark all read. Verified again on this lane's clone today —
`DailyRoomView.BellButton` `AXValue: "3 unread"` (ledger row r3-01/r3-02 context).
`DailyRoomView.swift:282` on `first-flight/w1-l1c`:

```swift
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count,
```

→

```swift
                    // C2-07: one count, from the one service every surface
                    // reads. Today's private view model still drives the push
                    // primer (`presentPushPrimerIfEarned`); it no longer drives
                    // the badge, because marking a row read in the feed mutated
                    // a different instance and the bell went on badging 3.
                    unreadCount: BadgeCountService.shared.unreadNotificationCount,
```

Unchanged from `L1F→C-1`/`L1F→C-2` — re-sent because the review found it still open, and because the
pin that names it can now actually fail.

---

## L1F→X-2 → **the steward / integration** · nine things to carry through the merge

**Supersedes `L1F→X-1`.** Items 1–4 are that note verbatim; 5–9 are new.

1. **`AccountIsolationTests.theSignOutClearsThePreviousAccountsNavigationStack`** (L1-B's file) still
   carries `withKnownIssue(isIntermittent: true)` for Task F-L1B-2. That task **is** applied on
   `first-flight/w1-l1f`, on a deliberately different seam — `clearNavigationForEndedSession()`, keyed
   on the `.main → .auth/.launching` transition, rather than a rewrite of `beginSplashTransition`. The
   review (`RL1F-04`) ruled the deviation defensible and better. After merge 4, flip that test from
   `withKnownIssue(…) { #expect(clears) }` to a bare `#expect(clears)` and confirm it passes.

2. **`BadgeFreshnessTests.thereIsNoSecondCount`'s known issues** now number **two** and neither is
   `isIntermittent` any more (`RL1F-19`). They are entries in a dictionary at the top of the suite:

   ```swift
   private static let owed = [
       "Patina/Features/Home/Views/DailyRoomView.swift": "C2-07 · note L1F→C-1 …",
       "Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift": "RL1F-25 · note L1F→B-5 …"
   ]
   ```

   **A red run here is the wave working, not a break.** L1-C merges 1st and L1-B 3rd, so if either
   lane applies its note the corresponding block fails at merge 4 with an unexpected pass. The fix is
   to delete that entry from `owed` — the block's own message says so. If a block still *records*, its
   note is still owed and the finding is still open; check the file before signing the wave off.

3. **`LaunchWatchdog.swift` is added identically on `first-flight/w1-l1b` and `first-flight/w1-l1f`**
   (see `L1F→B-4`, and `RL1F-26` which re-verified it byte-for-byte). Expect a clean identical add/add
   at merge 4; if git reports a conflict on it, L1-B edited the file after merge 3 and **L1-B's version
   is the one to keep** — L1-F's copy is a verbatim import, never an edit.

4. **`C9-05` is closed by `L07-02`'s fix**, incidentally and correctly. `findings.json` still carries
   it as W2 / L1-F / open. `ThreadDetailView.swift` applies
   `pinnedFooterClearance(houseFirst: false)` — dockHeight + 8 = 148 pt — on the flag-off root too.
   Evidence: `shots/w1-review-l1f/17-flags-off-thread-composer-clears-dock.png`. Mark it
   closed-by-`L07-02`, and do **not** additionally apply the `.threadDetail`-in-`yieldsToPinnedFooter`
   route it originally asked for — that would double the inset.

5. **`D→F-3` is a rebase-time apply, and it is the one line that turns merge 4 red** (`RL1F-20`).
   `C-13` adds a **new** `PatinaColors.pearl` call site — the thread header's bottom rule — and L1-D's
   `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` is a bar at **zero** scanning all
   of `Patina/**`. L1-D merges 2nd, L1-F 4th, so `ios-gate.sh unit` on the integration tip after merge
   4 fails with "PatinaColors.pearl is still painted at: ThreadDetailView.swift ×1".

   It genuinely cannot be applied on this branch: `grep -rn "hairline" apps/mobile/Patina/Patina/` on
   `first-flight/w1-l1f` returns **0** — `PatinaColors.Border.hairline` does not exist on this base and
   the file would not compile, so the lane's own gate could not be green.

   **At merge 4**, in `Patina/Features/Messaging/Views/ThreadDetailView.swift`, inside `header`'s
   `.overlay(alignment: .bottom)`:

   ```swift
   Rectangle().fill(PatinaColors.pearl).frame(height: 1)
   ```

   →

   ```swift
   Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)
   ```

   The other four `pearl` sites in this lane's trees (`ThreadDetailView.swift:458`,
   `ThreadListView.swift:129,175`, `NotificationFeedView.swift:338`) are already swept on
   `first-flight/w1-l1d` and resolve at the merge itself. This one is only the fifth because `C-13`
   creates it.

6. **`O10` is the other rebase-time apply** (`RL1F-20`). L1-B's `Core/Persistence/LocalStoreReset.swift`
   carries the pending-link clear as a literal because `PendingLinkQueue` is L1-F's file and does not
   exist on L1-B's branch. **At merge 4**, replace:

   ```swift
        (UserDefaults(suiteName: LastSeenStore.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: "patina.deeplink.pending.v1")
   ```

   with:

   ```swift
        (UserDefaults(suiteName: PendingLinkQueue.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: PendingLinkQueue.defaultsKey)
   ```

   …and delete the comment's third and fourth sentences ("The key is written… O10)."), which describe
   the workaround rather than the code.

   **Confirmed, as O10 asked:** `PendingLinkQueue.appGroupIdentifier` is `"group.cloud.patina.app"` —
   the same value `LastSeenStore.appGroupIdentifier` holds — and `PendingLinkQueue.defaultsKey` is
   `"patina.deeplink.pending.v1"`, byte-for-byte the literal L1-B wrote. The two stores are in the same
   suite and the clear on L1-B's branch is landing in the right domain today.

7. **`A-63` is closed on `first-flight/w1-l1d`, with no L1-F code and no L1-F test** (`RL1F-31`).
   The row sits in L1-F's W1 table but L1-D built it: `PatinaDesignKit/Components/PatinaButton.swift`
   now carries `.padding(.horizontal, PatinaSpacing.lg)` (24 pt) inside the 52 pt frame, so the
   shortest label yields a capsule wider than it is tall, and `PatinaEmptyState.swift` uses
   `PatinaButton(ctaTitle, style: .secondary).fixedSize()`. Neither is on `main`. Confirm it on the
   merged tip with **L1-D's** `PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline`, and sign it
   off once rather than twice or not at all.

8. **`RecordRefresh.swift`'s one-word change (`L1F→C-3`) is L1-C's, at merge 1.** If it is not there by
   merge 4, `WidgetSnapshotOwnershipTests.theRebuildNamesItsSession` records its known issue and
   `GAP7B-02` is still open — a signed-in tester's first widget refresh will draw "Open Patina to see
   your house." over real content. The parameter exists from merge 4 onward, so the steward can apply
   the line directly on the tip if L1-C declines it; it is
   `snapshots.save(record, owner: sessionUserId)` and nothing else.

9. **`OrderHandoffTests` flakes under load, and it is not this lane's** (`RL1F-16`, seen again this
   round). A full `unit` run started while another `xcodebuild` was finishing failed 4 cases in that
   suite; the same suite alone on the same tree passed 15/15 in 0.09 s. `Features/Orders/**` is not
   L1-F's glob and this lane has never touched it. Re-run before treating it as a merge break.

