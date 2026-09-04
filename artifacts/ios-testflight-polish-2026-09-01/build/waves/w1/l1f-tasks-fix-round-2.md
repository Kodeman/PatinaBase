# W1 · L1-F — task list, fix round 2

Branch `first-flight/w1-l1f`, worktree `.codex/worktrees/agent-ff-w1-l1f`, base `main` after W0.
Written after the round-2 adversarial review (`RL1F-19`…`RL1F-35`). Round-1 and round-2 task lists
(`l1f-tasks.md`, `l1f-tasks-fix-round.md`) stand; nothing below reverts them.

## Standing lines

**`IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81`** — this lane's clone, one simulator, explicit
udid on every `simctl` call, never `booted`. Launch arguments on every relaunch:
`-DeploymentTarget local`. **No `-PatinaFlags`** — `house-first` is default-on since W0 · D1a.

**The VISION check.** Nothing in this round adds a tab, a zone, a dashboard, a shadow, a red/green
status dot, a badge on a new surface, an engagement mechanic, or the word AI.

Three lines earn a sentence each because they touch counting or notification:

- **FR2-01** widens the *bar* that forbids a second unread count. It removes counts from the app's
  vocabulary, it does not add one. `RL1F-25` found a **third** number on the Studio tab
  ("6 unread updates") disagreeing with both the bell and the feed; the pin could not see it because
  it grepped one spelling. Widening it is the VISION rule ("one count of what needs you, from one
  service") getting an enforcement that matches its own words. The Studio row itself is
  `Features/Profile/ViewModels/**` — **L1-B's** under steward ruling S-3 — so it leaves as a note.
- **FR2-07** makes the push primer open in the state it is already in. It asks for no permission the
  app was not already asking for, and it removes a dead button rather than adding a live one.
- **FR2-02** stamps a widget payload with the account it was built for. That is ownership, not
  engagement: the number of rows drawn is unchanged; the change is that a payload nobody owns is not
  pushed to a Home Screen over one that is.

**The notes I must apply.** Every `build/waves/w1/<lane>-notes.md` addressed to L1-F, re-read at the
start of this round:

| note | source | state |
|---|---|---|
| `F-L1B-1` (C1-19 + C1-18 watchdog), `F-L1B-3` (R-02), `F-L1B-4` (C4-12) | `l1-f-notes.md` (L1-B, round 1) | **applied**, round 2 (`RL1F-03` closed) |
| `D→F-1` (`A-63` capsule) , `D→F-2` (`A-63` is done, `PatinaSpacing.lg` is the token) | `l1-f-notes.md` (L1-D) | **no L1-F code** — recorded as an exit line, **FR2-11** (`RL1F-31`) |
| `D→F-3` (the fifth `pearl` divider, the one `C-13` adds) | `l1-f-notes.md` (L1-D, round 3) | **rebase-time apply** — `PatinaColors.Border.hairline` does not exist on this base (`grep -rn hairline Patina/` → 0). Exit line, **FR2-11** (`RL1F-20`) |
| `O10` (`LocalStoreReset`'s literal → `PendingLinkQueue.appGroupIdentifier` / `.defaultsKey`) | `l1-f-notes.md` (L1-B, round 2) | **rebase-time apply** — `LocalStoreReset.swift` is L1-B's glob and the file on this branch has no such line. Suite value confirmed matching. Exit line, **FR2-11** (`RL1F-20`) |
| `l1-e-copy-deck.md` row `A-52` → `NotificationFeedView.swift:193` | L1-E | **applied** in round 1 (`8d8582db2`); string at `:242` is the deck's final text verbatim |

No other row in `l1-e-copy-deck.md` names a file in this lane's globs (its sections are
`L1-A applies` / `L1-B` / `L1-C` / `L1-D` / `L1-E applies`; the one L1-F-owned file it touches is the
`A-52` row above, already in).

**The notes I will send** — written to `build/waves/w1/l1f-notes-out-round4.md` and appended verbatim
to each target's own `<lane>-notes.md`:

- `L1F→B-5` → **L1-B**: `StudioQueueBuilder.swift`'s third unread count (`RL1F-25`).
- `L1F→C-3` → **L1-C**: `RecordRefresh.run` must name the session it saves for (`RL1F-21`), and
  `L1F→C-1`/`L1F→C-2` are still owed (`RL1F-19`, second half).
- `L1F→X-2` → **the steward**: five exit lines (`RL1F-20` ×2, `RL1F-26`, `RL1F-31`, and the two
  known-issue blocks that now go red on contact).

---

## Coverage — every finding in this lane's W1 table

`build/findings-by-lane.md` §W1 · L1-F, 17 rows. Round 1 and round 2 closed sixteen; this round
touches the two the review reopened and the file-level defects behind them.

| finding | closed by | pinned by |
|---|---|---|
| `L07-02` | round 1 (`6d8a2d889`) | `ThreadHeaderTests.theComposerClearsTheTabBar` |
| `A-63` | **L1-D**, `first-flight/w1-l1d` — no L1-F code | `PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline` (L1-D's), exit line **FR2-11** |
| `A-80` | round 1 (`2326d92d6`) | `NotificationsLoadStateTests` |
| `B-16` | round 1 + round 2 (`9538f1d2b`, `5e3dac9d4`); **FR2-03** corrects what the design comments claim | `WidgetSnapshotOwnershipTests`, + **FR2-03**'s new case |
| `C-13` | round 2 (`97048b898`); **FR2-04** makes it survive accessibility text sizes | `ThreadHeaderTests` + **FR2-04**'s Dynamic Type case |
| `C-14` | round 1 (`6d8a2d889`); **FR2-09** keys the scroll anchor on what it renders | `ThreadHeaderTests` + **FR2-09** |
| `C2-02` | round 1 (`760ff545e`) | `DeepLinkQueueTests` |
| `C2-07` | L1-F's half done; **open** on L1-C's one line. **FR2-01** makes the pin fail on contact | `BadgeFreshnessTests.thereIsNoSecondCount` (**FR2-01**) |
| `C2-09` | round 1 + round 2; **FR2-07** closes the screen half the service already had | `PushAuthorizationCopyTests` + **FR2-07** |
| `C2-21` | round 1; **FR2-05** covers the cold-launch-at-Welcome shape | `DeepLinkQueueTests` + **FR2-05** |
| `C4-04` | round 1 (`6d8a2d889`); **FR2-10** makes the retry test assert its own name | `ThreadHeaderTests.retryCarriesTheFailedBody` (**FR2-10**) |
| `GAP7B-02` | round 1; **FR2-02** closes the sign-in window the review reproduced | `WidgetSnapshotOwnershipTests` + **FR2-02** |
| `GAP7B-03` | round 1 (`9538f1d2b`) | `WidgetProjectionTests` |
| `GAP7B-04` | round 1 + round 2 (`9cca0cb8b`) | `WidgetLinkRoutingTests` |
| `GAP7B-05` | round 1 (`9538f1d2b`) | `WidgetProjectionTests` |
| `GAP7B-09` | round 1; **FR2-05** covers the acknowledgement half | `DeepLinkQueueTests` + **FR2-05** |
| `L07-03` | round 2 (`97048b898`) | `ThreadHeaderTests` |

---

## FR2-01 · `RL1F-19` + `RL1F-25` — the one-count pin is a bar, not a waiver

`withKnownIssue(…, isIntermittent: true)` passes whether or not the issue occurs, so the widened scan
could never fail — the opposite of what round 2 claimed for it. And the expression it greps
(`notifications.filter { !$0.isRead }.count`) does not match `context.unreadNotifications.count`, which
is where the Studio tab's disagreeing "6 unread updates" comes from.

1. **Test.** `PatinaTests/BadgeFreshnessTests.swift` · `thereIsNoSecondCount`: drop
   `isIntermittent: true` from the `DailyRoomView.swift` block; scan for **both** spellings; add
   `Patina/Features/Profile` to the scanned trees with its own known-issue block naming
   `StudioQueueBuilder.swift` and note `L1F→B-5`. Both blocks' messages say, in the test report, that
   the block is to be deleted the moment it stops recording.
2. **Run** → the two known issues record, the run stays green.
3. **Implement** — nothing in product code: both owed lines are other lanes' files.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `test(ios-badges): the one-count bar fails on contact, and it can see all three counts`,
   pathspec `apps/mobile/Patina/PatinaTests/BadgeFreshnessTests.swift`.

## FR2-02 · `RL1F-21` — no save for a signed-in session writes an unowned payload

Reproduced by the review: the first save after sign-in writes `widget-snapshot.json` with real rows
and no `ownerId`, and `save()` reloads WidgetKit in the same breath, so the no-data card is *pushed*
over real content. `RecordRefresh.run` stamps the owner immediately **after** `snapshots.save(record)`.

The store's half is this lane's; the caller is `Features/Home/ViewModels/RecordRefresh.swift`,
**L1-C's** glob.

1. **Test.** `PatinaTests/WidgetSnapshotOwnershipTests.swift`: a store whose stamp is empty, saved with
   `owner:` → the payload carries the id and `isPlaceholder == false`; saved with no `owner:` and an
   empty stamp → placeholder, unchanged. Plus a source pin that `RecordRefresh.run` names the session
   it saves for, in a known-issue block that names `L1F→C-3` while it is owed.
2. **Run** → the new cases fail (`save` has no `owner:`), the source pin records its known issue.
3. **Implement.** `RecordSnapshotStore.save(_:houseLine:now:owner:)`: `owner` non-empty is stamped
   through a new injected `stampOwner` closure **inside the lock, before** the payload is composed.
   Default `nil` = today's behaviour exactly.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `fix(ios-widget): a save for a signed-in session cannot write an unowned payload`,
   pathspecs `apps/mobile/Patina/Patina/Core/Persistence/RecordSnapshotStore.swift`,
   `apps/mobile/Patina/PatinaTests/WidgetSnapshotOwnershipTests.swift`.

## FR2-03 · `RL1F-24` — the two doc comments say what actually runs

`RecordSnapshotStore.remove()` has three callers, not one, and after a real sign-out **both** files are
absent: `clearForSignedOut()` writes the placeholder, then an in-flight `RecordRefresh` for the ended
session sees a cleared stamp, decides `.discard`, and `remove()` takes the placeholder with it. The
user-visible outcome is the same card either way, so the behaviour stands — the sentences do not.

1. **Test.** `WidgetSnapshotOwnershipTests`: drive the real order — `clearForSignedOut()` then
   `remove()` — and assert both states are no-data (placeholder written, then no file), so the comment
   the fix writes is pinned rather than asserted.
2. **Run** → fails (no such case).
3. **Implement.** Correct the claim in `RecordSnapshotStore.swift` (`clearForSignedOut`'s and
   `remove()`'s doc comments) and in `WidgetSnapshot.swift`'s header: name all three callers, and say
   that a delete after the placeholder is expected and draws the same card.
4. **Run** → `ios-gate.sh unit`, `ios-gate.sh lint-delta main`.
5. **Commit** `docs(ios-widget): remove() has three callers, and a sign-out ends with no file at all`.

## FR2-04 · `RL1F-22` — the C-13 header survives accessibility text sizes

At `accessibility-extra-extra-extra-large` the header reads `Leah Hart…` / `Aspen Loft…`. A name cut
mid-word names a different person, which is the defect `C-13` exists to remove.

Measured, against the review's second claim: `BackChevronButton` is `.font(.system(size: 14))` inside
a fixed `36×36` frame — **not** Dynamic-Type-scaled — so the 54.5 pt leading inset stays correct at
every text size and does not change.

1. **Test.** `ThreadHeaderTests`: a Dynamic Type case pinning that the title takes two lines and a
   scale floor, and that the project line is dropped at `.accessibility1` and above.
2. **Run** → fails.
3. **Implement.** `ThreadDetailView.header`: title `.lineLimit(2)` + `.minimumScaleFactor(0.8)`;
   project line gated on `dynamicTypeSize < .accessibility1`.
4. **Run** → `ios-gate.sh unit`; screenshot at default and at AX3XL.
5. **Commit** `fix(ios-messaging): the header names the whole name at every text size`.

## FR2-05 · `RL1F-23` — a link held before the coordinator attaches is acknowledged

`GAP7B-09` shape (b) — cold launch at Welcome — is the first state every round-one tester is in, and
it is the one shape where nothing on screen says the tap was kept: `.onOpenURL` fires before
`configure(coordinator:)`, so `noteLinkHeld()` optional-chains to nothing, and `drainIfPossible()`
returns early without noting.

1. **Test.** `DeepLinkQueueTests`: handle a link with no coordinator, then `configure` at `.auth`,
   expect `pendingLinkNotice == AppCoordinator.pendingLinkNoticeLine`.
2. **Run** → fails.
3. **Implement.** `DeepLinkHandler.configure(coordinator:)`: after attaching, note the hold when the
   app cannot open and the queue is not empty.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `fix(ios-deeplinks): a link kept before the app was ready still says so`.

## FR2-06 · `RL1F-32` + `RL1F-33` — the two test seams

`DeepLinkHandler` gained an internal second `init` on a singleton whose own note forbids second
instances; `BadgeCountService.makeForTests` defaults to `UserDefaults.standard`, so a suite that
asserts a restored count reads the running simulator's real domain.

1. **Test.** A source pin in `BadgeFreshnessTests` that `DeepLinkHandler`'s second init is `private`
   and its test seam is `#if DEBUG`, and that `makeForTests` does not default to `.standard`.
2. **Run** → the pin fails.
3. **Implement.** `private init(queue:)` + `#if DEBUG static func makeForTests(queue:)`. For
   `BadgeCountService.makeForTests(defaults:)` the default becomes a **private, per-call suite**
   rather than being removed: `.standard` had to go, but ~30 call sites across five other lanes' test
   files omit the argument, and rewriting them would be an out-of-glob edit for a `RL1F-33` that is
   about what an omitted argument READS, not about whether one may be omitted.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `fix(ios-badges): a test seam cannot be reached by product code or by the device's defaults`.

## FR2-07 · `RL1F-30` — the primer opens in the state it is in

`C2-09`'s fix line says read the status **before** asking. The service does; the screen does not, so a
tester who already denied is offered "Turn on notifications" and learns it is inert by tapping it.
And `requestAuthorizationAndRegister`'s `catch` returns `.denied`, so a transport failure prints
"Notifications are off for Patina" and offers Settings for something Settings will not fix.

1. **Test.** `PushAuthorizationCopyTests`: a new `AuthorizationOutcome` case for a failed ask, source
   pins that the screen reads `notificationSettings()` in a `.task` and that the failed arm leaves the
   screen unchanged.
2. **Run** → fails.
3. **Implement.** `PushTokenService`: `case failed` returned from the `catch`. `PushPrimerView`: a
   `.task` that sets `isDenied` from the current status; `.failed` returns without dismissing.
4. **Run** → `ios-gate.sh unit`; screenshot the primer.
5. **Commit** `fix(ios-push): the primer opens in the state it is in, and a throw is not a refusal`.

## FR2-08 · `RL1F-29` — `pendingReturnRoute` ends with the session

`clearNavigationForEndedSession()` empties every stack but leaves the route captured two lines earlier
from the previous account's `currentScreen`, replayed on the next arrival at `.main` whoever that is.

1. **Test.** `SignOutResetTests`: force `.main → .auth` (the forced-sign-out path), then `.main`, and
   expect the previous screen is **not** restored for a different account; plus that the voluntary
   path (`.main → .launching`) keeps nothing.
2. **Run** → fails.
3. **Implement.** Both halves of the review's choice, because the simple one alone would have made
   the capture dead code (it runs two lines before the reset): `clearNavigationForEndedSession()`
   clears the route **and** its owner, and the capture moves to *after* the reset, stamped with the
   account it was taken from. The id has to be remembered while the session is still there —
   `lastKnownUserId`, filled in `recomputePhase()` — because by the time the phase flips to `.auth`
   `AuthService.currentUserId` is already nil; that IS the flip. The restore then fires only when the
   account arriving at `.main` is the one that left.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `fix(ios-nav): the return route belongs to the account it was taken from`.

## FR2-09 · `RL1F-34` + `RL1F-35` — the anchor and the round trip

The transcript renders `visibleMessages`; the scroll target is `messages.last?.id`. And `loadHeader()`
re-runs on every `load()`, so `.refreshable` fetches the whole inbox again for a header already on
screen.

1. **Test.** `ThreadHeaderTests`: source pins that the anchor keys on `visibleMessages` and that
   `loadHeader()` returns early when a header is already resolved.
2. **Run** → fails.
3. **Implement.** Key `onChange`/`scrollTo` on `visibleMessages`; `guard header == nil else { return }`.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `fix(ios-messaging): the scroll anchor is a row that is drawn, and a pull costs one round trip`.

## FR2-10 · `RL1F-27` + `RL1F-28` — two tests say what they are for

`theUnsentBubbleDrawsTheMessage` asserts `PatinaColors.clay.opacity(0.35)` as a string literal, which
forbids L1-D's `C3` sweep from touching a call site it legitimately owns.
`retryCarriesTheFailedBody` asserts only the no-failed-body path.

1. **Test.** Rewrite both: drop the colour literal, assert the bubble draws `Text(body)` and is not a
   status label; drive a real failed send through an injected client and assert `retrySend()` sends the
   failed body rather than the current draft.
2. **Run** → the retry case fails if `retrySend()` reads `draft`.
3. **Implement** — no product change expected; `retrySend()` already reads `failedSendBody`.
4. **Run** → `ios-gate.sh unit`.
5. **Commit** `test(ios-messaging): the retry case asserts its own name, and the bubble test stops forbidding a token`.

## FR2-11 · `RL1F-20`, `RL1F-26`, `RL1F-31` — the notes out and the exit lines

Documentation only, no code. Write `l1f-notes-out-round4.md` and append each block verbatim to its
target's `<lane>-notes.md`. Commit `docs(first-flight): L1-F round-4 notes out`.

---

## Gate

On the clone, `IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81`:

```
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

## Self-check (not a walk)

Local stack, `client@patina.dev` / `password123`, `-DeploymentTarget local`, no `-PatinaFlags`.
Before/after shots of the thread header (default and AX3XL) and the push primer into
`shots/w1-l1f/`, one `ledger.md` line each.
