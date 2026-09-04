# W1 · L1-F — notes out, fix round 3 (round 5 of notes)

Written on `first-flight/w1-l1f` after applying `E4-L1F-1` and re-verifying the eighteen
round-one review findings. Two notes, both appended verbatim to the target's own
`build/waves/w1/<lane>-notes.md`.

Supersedes nothing. `L1F→E-1` (round 1), `L1F→A-2`, `L1F→B-3`, `L1F→B-4`, `L1F→B-5`,
`L1F→C-1`…`C-3` and `L1F→X-1`/`X-2` all stand as written, except the three items of `L1F→X-2`
that `O15` and `O17` have overtaken — corrected below in `L1F→X-3`.

---

## `L1F→E-2` → **L1-E** · `E4-L1F-1` taken in full, and nine strings the note did not name

### The three rows are in

`E4-L1F-1` is applied on `first-flight/w1-l1f` in commit
`fix(ios-messaging): the three sentences a failure shows, in the app's own glyph`.

| line | final, as shipped |
|---|---|
| `MessagingViewModel.swift:413` | `"We couldn’t send that. Nothing was lost — your message is still here."` |
| `MessagingViewModel.swift:75` | `"We couldn’t load your messages. Try again."` |
| `MessagingViewModel.swift:331` | `"We couldn’t load this conversation. Try again."` |

**The two rewordings are taken, not just the glyph.** The note offered them ("if you would
rather change only the glyph this wave and leave the wording, say so"). The answer is no: a
fragment sitting three lines from a whole sentence with a recovery, in the same file, is the
worse of the two inconsistencies, and both strings are rendered — `:75` at
`ThreadListView.swift:74`, `:331` at `ThreadDetailView.swift:39`, each on the empty-list arm a
failed load actually reaches.

**One thing the note could not see from outside the file, offered back.** Both load strings are
rendered inside `PatinaErrorState` (`Design/Components/PatinaErrorState.swift:14-38`), whose own
retry button already reads **`"Let's try that again"`** (`:16`, a default the two call sites do not
override). So on glass the screen now reads:

> ⚠ We couldn’t load your messages. Try again.
> **Let's try that again**

The sentence and the button say the same thing twice, in two different registers — and
`"Let's try that again"` is not a one-off: it is the app's standard recovery label, in **seven**
places (`MoneyFailureCopy.retry`, `HomeStoryRetryRow`, `ScanReviewView`, `ScanWalkView`,
`DesignRequestFlowView+Steps` ×2, and this component's default).

**And the note's own model does it the other way.** `MoneyFailureCopy` — the shape `E4-L1F-1` cites,
and the shape this lane's `sendFailureLine` doc comment names as its model — puts the *consequence*
in the sentence and the *recovery* in the button, never both in the sentence:

```
Features/Money/MoneyFailureCopy.swift:116  "We couldn't send your choice. Your designer hasn't seen it yet."
Features/Money/MoneyFailureCopy.swift:123  "We couldn't send that note. Your designer hasn't seen it yet."
Features/Money/MoneyFailureCopy.swift:30   static let retry = "Let's try that again"
```

By that pattern the two load rows would read **"We couldn’t load your messages."** and
**"We couldn’t load this conversation."**, with `PatinaErrorState`'s button carrying the recovery it
already carries.

**Applied as the note wrote them anyway**, because the note's two sanctioned answers were *take the
rows* or *change only the glyph and keep the fragments* — inventing a third text is the deck's call,
not a lane's, and L1-E merges last. Dropping the two `Try again.`s is a one-line edit at merge 6 if
the deck agrees. **Separately, `PatinaErrorState.swift:16` carries the same typewriter apostrophe** —
a component-level string on the sweep's blind side, rendered on every error state in the app, in
`Design/Components/**` (not this lane's).

**Pinned on this side, so the deck's own pin has something to agree with.**
`PatinaTests/ThreadHeaderTests.swift` gains
`theLoadFailuresAreWholeSentencesWithARecovery` — both strings, whole-sentence, `Try again`
present, no `U+0027`, no `http`, no `supabase` — and
`theFailureSentenceIsAHomeownerSentence` gains `#expect(!line.contains("'"))`. So
`BrandVoiceLintTests.messagingViewModelApostrophesAreCurly` can unwrap its `withKnownIssue` at
merge 6 and find the rows already there; if it goes red instead, something between merge 4 and
merge 6 reverted them.

### `E4-L1F-2` accepted as written

`AppCoordinator.swift:109`'s `pendingLinkNoticeLine` is a W2 row. Agreed, and for the reason the
note gives: no view binds it on this branch. It becomes live copy at **merge 5**, when L1-A adds
the one `ContentView.swift` line from `F-L1A-3` and `AuthScreenView`'s status slot starts
rendering it. That is inside W1's own integration window, not after it — so if L1-E would rather
promote it, merge 5 is the last moment it is still cheap. Recorded either way; this lane asks for
nothing.

### Nine strings in L1-F's globs the sweep still has not reached

The note says L1-F is "the one lane the round-3 apostrophe sweep skipped entirely". It is wider
than the three rows. Every one of these is **pre-existing** — `git diff <merge-base>..HEAD`
carries no `+` line among them, so this lane authored none of them and none is new copy on a
round-one path. Listed for W2 · L1-E's 48-row sweep, with the two that are fixtures marked:

| file:line | string | note |
|---|---|---|
| `Features/Notifications/ViewModels/NotificationsViewModel.swift:61` | `"Couldn't load notifications"` | rendered; same fragment shape as `:75`/`:331` were |
| `Features/Notifications/Views/PushPrimerView.swift:25` | `"We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else."` | rendered on the push primer |
| `Features/Messaging/Views/ThreadListView.swift:189` | `"Messages with your designer land here once you're working together."` | rendered, empty state |
| `Services/Notifications/InvoiceReminder.swift:32` | `"Remind me the day before it's due"` | rendered, action label |
| `Services/Notifications/InvoiceReminder.swift:71` | `"We'll send one notification: …"` | rendered |
| `Services/Notifications/InvoiceReminder.swift:86` | `"The day before it's due"` | rendered, primer title |
| `App/Coordinators/AppCoordinator.swift:109` | `"We'll open what you tapped once you're in."` | **`E4-L1F-2` already rules this W2** |
| `Features/Notifications/Models/AppNotification.swift:183` | `"Something's emerging"` | **fixture**, not shipped copy |
| `Features/Notifications/Models/AppNotification.swift:184` | `"A piece you've been eyeing just dropped in price"` | **fixture**, not shipped copy |
| `Design/Components/PatinaErrorState.swift:16` | `"Let's try that again"` | **not an L1-F glob** — but it is the button under both rows above, so it lands on the same screen |

Not touched this wave, deliberately, on `E4-L1F-2`'s own rule: a string nobody re-files as a
blocker belongs in the W2 sweep rather than in a W1 fix round's diff. If the deck would rather
have the six rendered non-fixture ones in W1, send them as rows and they land in one commit —
they are all in L1-F globs and none has a test that pins the current text.

**One outside this lane, seen while grepping.** `Features/Money/MoneyFailureCopy.swift:123`,
`Features/Purchase/AskDesignerSheet.swift:208` and `Features/Purchase/AskAboutPieceSheet.swift:172`
carry the same glyph in the same sentence shape (`"We couldn't send that…"`). Those are not
L1-F globs and this note does not claim them — passed on because the round-3 sweep's file list
is the thing that missed them, and `DecisionConsentValidationTests.swift:152` pins one of the
three, so a sweep there needs a test edit in the same commit.

---

## `L1F→X-3` → **the steward / integration** · four corrections to `L1F→X-2`

`L1F→X-2` (nine items, in `l1x-notes.md`) stands except where stated. These four have been
overtaken by L1-B's rounds 3 and 4, and the first would have the merger resolve a real conflict
as if it were not one. Items 2 and 3 are re-measurements that turn an open question into a fact;
item 4 makes a merge-4 step easier than the note promised.

### 1. `L1F→X-2` item 3 is now **false** — `LaunchWatchdog.swift` is no longer identical

Item 3 says the file "is added identically on `first-flight/w1-l1b` and `first-flight/w1-l1f`
… expect a clean identical add/add". `O17` changed L1-B's copy on purpose. Measured from this
worktree just now:

```
$ git diff first-flight/w1-l1b first-flight/w1-l1f -- \
    apps/mobile/Patina/Patina/Core/State/LaunchWatchdog.swift
-    static let splashSurfaceDeadline: TimeInterval = stallDeadline - 1.5
     static func shouldSurfaceStall(elapsed: TimeInterval, isAuthStateReady: Bool) -> Bool {
         guard !isAuthStateReady else { return false }
-        return elapsed >= splashSurfaceDeadline
+        return elapsed >= stallDeadline
     }
```

**Take L1-B's copy at merge 4**, per `O17`. It is a superset: `stallDeadline` is unchanged at 8,
which is the only symbol `AppCoordinator.scheduleLaunchWatchdog` reads
(`AppCoordinator.swift:233`), so no `AppCoordinator` edit follows. This lane's
`LaunchWatchdogFallbackTests` couples to the **name** only —
`#expect(code.contains("LaunchWatchdog.stallDeadline"))` at `:106`, no numeric assertion — so it
stays green on L1-B's copy. L1-B's own `LaunchWatchdogTests` pins the *ordering*
(`splashSurfaceDeadline < stallDeadline`), not either number.

### 2. `L1F→X-2` item 6 (`O10`) — the precondition it asked about is **satisfied**

`O10` says: *"If `PendingLinkQueue.appGroupIdentifier` is not `group.cloud.patina.app` … say so,
because then the two stores are not in the same suite."* Measured:

```
$ grep -n "appGroupIdentifier\|defaultsKey" \
    apps/mobile/Patina/Patina/App/DeepLinking/PendingLinkQueue.swift
60:    static let appGroupIdentifier = "group.cloud.patina.app"
62:    static let defaultsKey = "patina.deeplink.pending.v1"

$ grep -rn "static let appGroupIdentifier" apps/mobile/Patina/Patina/
Core/Persistence/LastSeenStore.swift:34:  = "group.cloud.patina.app"
Core/State/FeatureFlags.swift:251:        = "group.cloud.patina.app"
Features/Home/ViewModels/RecordOwner.swift:32: = "group.cloud.patina.app"
App/DeepLinking/PendingLinkQueue.swift:60:     = "group.cloud.patina.app"
```

Same suite, and the key literal L1-B wrote (`"patina.deeplink.pending.v1"`) is
`PendingLinkQueue.defaultsKey` character for character. **The merge-4 swap is safe as written**
and changes behaviour in no way — it is a literal becoming its own constant.

### 3. `L1F→X-2` item 2's two waivers still record, and both must die in one commit

`BadgeFreshnessTests.thereIsNoSecondCount`'s `owed` dictionary still carries both entries and
neither is `isIntermittent`, so both go red the moment their line lands:

- `Patina/Features/Home/Views/DailyRoomView.swift` → `C2-07`, note `L1F→C-1` (L1-C, merge 1)
- `Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift` → `RL1F-25`, note `L1F→B-5`
  (L1-B, scheduled at merge 4 by `l1b-notes-out.md` §S6)

`O15` confirms L1-B pins the same known issue from its side
(`AttentionCountTests.theStudioRowStillOwesTheSharedUnreadCount`, also not `isIntermittent`).
**When the `StudioQueueBuilder` binding lands at merge 4, delete both blocks in the same
commit** — one on each side — or the tier reports two known issues that no longer exist. Same
for the `DailyRoomView` entry after merge 1.

`O15` offers this lane the `StudioQueueBuilder` edit at merge 4 ("your file is already open at
that point"). **Accepted** — L1-F takes it at merge 4 if the merger has not already, since
`BadgeCountService.unreadNotificationCount` arrives with this lane's merge and the deletion of
this lane's own waiver belongs in the same commit as the binding.

### 4. Item 1 is easier than it was — L1-B rewrote the test onto this lane's seam

Re-read on `first-flight/w1-l1b@47bbffe3b`:
`AccountIsolationTests.theSignOutClearsThePreviousAccountsNavigationStack` now brace-matches the
body of **`func clearNavigationForEndedSession(`** — the deliberate deviation `RL1F-04` ruled
defensible — rather than `beginSplashTransition`, and its `withKnownIssue` is **no longer
`isIntermittent`**. So the merge-4 flip is mechanical: delete the `withKnownIssue(…)` wrapper,
leave the bare `#expect(clears)`. It will pass on the merged tip because that function exists on
this branch at `AppCoordinator.swift:404` and its body contains
`navigationPath = NavigationPath()` at `:406`.

### Unchanged from `L1F→X-2`

Items 4, 5, 7, 8, 9 stand exactly as written: `C9-05` closed-by-`L07-02`, still carried in
`findings.json` as **W2 / L1-F / open** and wanting that correction;
`D→F-3` as the rebase-time apply that turns merge 4 red if skipped — **and it is exactly one line**:
`Features/Messaging/Views/ThreadDetailView.swift:155`, the header rule `C-13` adds, becomes
`Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)`. The other four `PatinaColors.pearl`
sites in this lane's files (`ThreadListView.swift:129,175`, `ThreadDetailView.swift:475`,
`NotificationFeedView.swift:338`) are untouched here, so L1-D's already-swapped versions win the
merge on their own;
`A-63` closed on `first-flight/w1-l1d` with no L1-F code; `RecordRefresh.swift`'s one-word change
at merge 1; and `OrderHandoffTests` flaking under concurrent load in a file this lane has never
touched.
