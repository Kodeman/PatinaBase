# W1 · L1-F — notes OUT

Every change this lane needs in another lane's file, with the exact final text. Each block below is
also appended to the target lane's own `build/waves/w1/<target>-notes.md`, because a note the owner
did not schedule is not a plan.

Written 2026-09-02 by L1-F (notifications, messaging, widget, deep links) on
`first-flight/w1-l1f`.

---

## L1F→D-1 → **L1-D** · `PatinaButton` has zero horizontal padding (`A-63`)

**Finding.** `A-63` (T0/major, testerVisible, confidence 0.99): *the notifications empty-state "Sign
in" button is a circle narrower than its own label.*
`scan_ui` on the guest bell: `NotificationFeedView.GuestInvite` AXFrame `{{175.92, 551.25}, {50.17,
53.5}}` — 50 pt wide, 53.5 pt tall, and "Sign in" visibly spills past the stroke on both sides
(`shots/A/29-guest-bell.png`). It is the ONLY control on the screen a guest reaches from the home bell
in their first two minutes.

**Why this is L1-D's and not L1-F's.** The finding's own code judge located the root cause and it is
not in the notifications feature:

> `PatinaButton` (`PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:56-73`) has
> ZERO horizontal padding; its width comes solely from `.frame(maxWidth: .infinity)` with
> `.frame(height: 52)` and `.clipShape(Capsule())`. `PatinaEmptyState` (`PatinaEmptyState.swift:51-54`)
> applies `.fixedSize()` to it, which collapses the capsule to exactly the label's intrinsic width — so
> a short label yields a ~50 pt capsule whose 26 pt corner radius makes it a circle that cuts its own
> text. Same bug at wider labels: `shots/A/43-after-migrate.png` shows "Message your designer" touching
> the stroke on both sides. Design-system-wide (every `PatinaEmptyState` CTA in the app), not
> notifications-only. **Fix belongs in `PatinaButton`: add horizontal padding.**

`PatinaDesignKit/Sources/PatinaDesignKit/Components/**` is L1-D's glob (steward §5.5). Nothing inside
L1-F's globs can close this without hand-rolling a second capsule beside the design system's, which is
the divergence the design system exists to prevent.

**Exact final text.** `PatinaButton.swift`, inside `body`'s `Button` label — replace:

```swift
            .foregroundStyle(foregroundColor)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

with:

```swift
            .foregroundStyle(foregroundColor)
            // A-63: the capsule had no horizontal padding at all — its width
            // came only from `maxWidth: .infinity`. Under `.fixedSize()` (which
            // `PatinaEmptyState` applies to every CTA) that collapses to exactly
            // the label's width, and a 26 pt corner radius on a 50 pt box is a
            // circle that cuts its own text. The padding is inside the frame, so
            // an intrinsically-sized capsule is always wider than its label.
            .padding(.horizontal, PatinaSpacing.lg)
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

`PatinaSpacing.lg` is 24, so the shortest label in the app ("Sign in", ~50 pt) yields a ~98 pt capsule
— wider than its 52 pt height, which is what makes it read as a capsule rather than a circle.

**What this must not change.** Every `.infinity`-width use of `PatinaButton` (the auth screen, the
primer, every sheet footer) is unaffected: the frame still wins there and the padding is absorbed. The
change is visible only where `.fixedSize()` is applied.

**Where to prove it.** `A-63`'s own screen is L1-F's, and L1-F's `NotificationsLoadStateTests
.theGuestInvitationUsesTheDesignSystemState` pins that the CTA is `PatinaEmptyState`'s own — i.e. that
this fix reaches it. If L1-D adds a token for the value, L1-F is happy to assert on it; nothing in
L1-F's suites will break either way.

**Related, and deliberately NOT asked for here:** `C3-13` / `GAP1-04` (the fixed `.frame(height: 52)`
clipping labels at accessibility Dynamic Type) are W2 rows on the same three lines. This note asks only
for the padding.

---

## L1F→C-1 → **L1-C** · the bell's unread count reads one service (`C2-07`)

**Finding.** `C2-07` (T0/major): *the bell's unread badge stays stale after reading the feed.* Read
every row, pop back, and the bell still badges 3.

**Cause, and the half L1-F has already fixed.** Two independent `NotificationsViewModel` instances —
Today holds one in `@State` (`DailyRoomView.swift:28`) and computes the badge from it (`:258`), while
`NotificationFeedView` holds its own (`:12`), and `markRead` / `markAllRead` mutate only the feed's.
Today reloads from `.task` (`:106-108`), once per mount, so popping back to a mounted Today refreshes
nothing.

L1-F has made `BadgeCountService` the single source: it now carries
`unreadNotificationCount`, `NotificationsViewModel` publishes into it on load and after every
mark-read (including both optimistic rollbacks), and `resetForSessionChange()` zeroes it.
`PatinaTests/BadgeFreshnessTests` pins all of that.

**What is left, and it is one argument in L1-C's file.** `DailyRoomView.swift` is L1-C's under the
contested-file table, which routes *"L1-F's badge binding"* here as an integration note. Replace
`DailyRoomView.swift:258`:

```swift
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count,
```

with:

```swift
                    // C2-07: one count, from the one service every surface
                    // reads. Today's private view model still drives the push
                    // primer (`presentPushPrimerIfEarned`); it no longer drives
                    // the badge, because marking a row read in the feed mutated
                    // a different instance and the bell went on badging 3.
                    unreadCount: BadgeCountService.shared.unreadNotificationCount,
```

**Nothing else in the file changes.** `@State private var notificationsViewModel` (`:28`) and its
`.task { await notificationsViewModel.load(); presentPushPrimerIfEarned() }` stay exactly as they are —
that `load()` is what arms SP-08 / Q7's push primer, and it is also what publishes the count on Today's
own mount. `BadgeCountService` is `@Observable`, so the bell repaints when the feed marks a row read
without Today re-running anything.

**The VISION ruling this carries**, from PROGRAM.md §3 · L1-F, so it travels with the change: the badge
stays *in one form only* — a single count of what needs you, on the bell and the app icon, and nowhere
else. No second badge, no badge on another surface, no red-as-meaning. L1-F adds no app-icon badge in
W1 (not in `C2-07`'s fix line).

**How L1-C can check it landed:** `BadgeFreshnessTests.thereIsNoSecondCount` scans
`Features/Notifications/**` for the old expression; the same expression in `Features/Home/**` is what
this note removes.

---

## L1F→A-1 → **L1-A** · acknowledge a held link on the auth screen (`C2-21`, `GAP7B-09`)

**Findings.** `C2-21` and `GAP7B-09` (both T0/major): *a deep link tapped while signed out is queued
invisibly / never arrives, and nothing says anything had been kept.* Round one opens **signed out**, so
this is the first state every tester is in. `GAP7B-09`'s three shapes were all silent: warm at the auth
wall, cold at Welcome, and after signing in from the cold one the destination never appeared at all.

Both fix lines say the same thing: *"acknowledge it on the auth screen in one line."*

**What L1-F has built.** `PendingLinkQueue` — a bounded, persisted FIFO — keeps the link and the
coordinator replays it on arrival at `.main`. `AppCoordinator` publishes:

```swift
    public private(set) var pendingLinkNotice: String?
    public static let pendingLinkNoticeLine = "We'll open what you tapped once you're in."
```

`pendingLinkNotice` is set the moment an arrival is kept and cleared the moment the queue drains, so it
cannot outlive the thing it is about. `DeepLinkQueueTests.aQueuedLinkIsAcknowledged` and
`.theNoticeIsAHomeownerSentence` pin both halves.

**What L1-A applies — two files, both this lane's.**

**1. `Features/Authentication/Views/AuthScreenView.swift`** — a second optional line beside the error
banner it already has. Add the property beside `errorMessage`:

```swift
    /// A link the person tapped before they could be shown it, being held until
    /// they are in (`C2-21`, `GAP7B-09`). `AppCoordinator.pendingLinkNotice`.
    var pendingLinkNotice: String? = nil
```

and render it immediately AFTER the existing `if let errorMessage { … }` block (so a real failure is
still the first thing read):

```swift
            if let pendingLinkNotice {
                Text(pendingLinkNotice)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
                    .padding(.bottom, 16)
                    .accessibilityIdentifier("auth.welcome.pendingLinkNotice")
            }
```

Muted, not red: nothing has gone wrong. It is a promise the app keeps two taps later.

**2. `ContentView.swift`** (the `.auth` case, which steward §5.2 gives to L1-A) — pass it in, beside
the `errorMessage:` argument already there:

```swift
                    errorMessage: AuthService.shared.errorMessage,
                    pendingLinkNotice: coordinator.pendingLinkNotice
```

**Not asked for:** `AuthSheet.swift`'s `AuthScreenView(…)` call needs no change — the parameter
defaults to nil, and a link held while a modal auth sheet is up is acknowledged by the sheet's own
dismissal into the destination.

**One behaviour change worth knowing about**, because it touches the magic-link path L1-A owns: the
`patina://auth…` arm of `DeepLinkHandler` is now explicitly exempt from the queue **in every phase**,
including `.launching`. Before, a magic-link callback that arrived during the splash was stashed in
`pendingDeepLink` and drained only on arrival at `.main` — which is unreachable until that callback is
handled, so it was never drained. `DeepLinkQueueTests.authCallbacksBypassTheQueue` holds it open.

---

## L1F→B-1 → **L1-B** · this lane is holding `AppCoordinator.swift` for your watchdog note

**Not an edit — a request.** PROGRAM.md §3 W1's contested-file table gives
`App/Coordinators/AppCoordinator.swift` to **L1-F** outright (four of its five W1 rows are the deep-link
queue) and routes `C1-18` / `C1-19`'s `.launching` watchdog here as an integration note *"carrying the
exact 5–8 s timeout and the fallback line"*. Steward §5.3 repeats it.

**No such note exists.** At the time L1-F wrote its task list and again before its final commit,
`build/waves/w1/` held `l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md` and `steward.md`; none mentions
L1-F, and there is no `l1-f-notes.md`. L1-F has **not** implemented the watchdog: the ruled deliverable
is L1-B's *exact* timeout and *exact* fallback sentence, and inventing either would defeat the
mechanism the wave runs on. `C1-19` is reported open in L1-F's report with that reason.

**What L1-F needs, to apply it in one commit:**

1. the timeout, as a number in the 5–8 s band, and where it should be a named constant;
2. the exact fallback sentence a homeowner reads when auth readiness never lands;
3. whether the fallback phase is `.auth` (the finding's fix line says so) and whether the sentence is
   surfaced through `AuthService.errorMessage`, through a new coordinator property, or through the
   `pendingLinkNotice`-shaped seam L1-F just added;
4. `C1-18`'s half — whether the splash floor drops to ~0.6 s unconditionally or to 0 when
   `isAuthStateReady` is already true.

**What is already there for it to land on.** `recomputePhase()` now has two named seams,
`applyLeavingPhase(from:to:)` and `applyArrivingPhase(_:)`, and a DEBUG-only `forcePhaseForTesting(_:)`
that drives both — so `LaunchWatchdogTests` can prove a transition without standing up
`AuthService`'s auth-state stream. `splashDeadlineTask` and `scheduleSplashDeadlineRecompute()` are
untouched.

**Merge order** puts L1-B at 3 and L1-F at 4, so a note written before L1-F's fix round lands in this
wave. After that it is a steward-applied patch on the integration tip.

**Two things L1-F changed in that file that L1-B should know about**, since `C1-18`/`C1-19` sit beside
them:

- `pendingDeepLink: URL?` is **gone**. It was one slot, filled only at `.launching`, drained only at
  `.main`. It is now `PendingLinkQueue` on `DeepLinkHandler` — bounded, persisted, drained through
  `AppCoordinator.attachDeepLinkDrain(_:)`.
- The `.main → .auth / .launching` transition now clears both roots' navigation stacks and replaces the
  widget's App-Group snapshot (`C2-06`, `B-16`). `SignOutResetTests` covers it.

---

# L1-F — round 2 (2026-09-02, after reading `l1-f-notes.md` and `l1-e-copy-deck.md`)

Both landed while this lane was mid-build. Round 1 is the four notes above. Each block below is
appended verbatim to its target lane's inbox.

**What L1-F applied from its own inbox, so nobody re-applies it:**

| Note | Status |
|---|---|
| **F-L1A-1** (L1-A, carrying L1-E's deck row `A-52`) | **Applied**, `NotificationFeedView.swift` guest invitation: `"Sign in to see updates on your projects and messages here."` Title `"Nothing yet"` unchanged, as the deck says. Commit `8d8582db2`. |
| **D→F-1**, the `monoTiny` half | **Applied.** `NotificationFeedView.swift`'s notification-row timestamp reads `PatinaTypography.monoLabel`. `monoTiny` is already `@available(*, deprecated)` on this lane's base and was emitting a warning. Same commit. |
| **D→F-1**, the four `pearl` substitutions | **NOT applied — see D→F-1-reply below.** |
| **D→F-2** (`A-63` done, `PatinaSpacing.lg` is the token) | Acknowledged. Nothing to assert on in this lane; `NotificationsLoadStateTests.theGuestInvitationUsesTheDesignSystemState` already pins that the CTA is `PatinaEmptyState`'s own, so L1-D's fix reaches it. |
| **L1-C's note** (`C9-04` on `ThreadListView.swift:44`; `.companionBottomClearance()` exists) | Acknowledged, no conflict. `ThreadDetailView`'s composer uses `CompanionHearthMetrics.pinnedFooterClearance(houseFirst: coordinator.isHouseFirstRoot)` — a **derived** call, not a literal, so `CompanionInsetTests`' `N >= 90` scan will not trip on it. The `.companionBottomClearance()` modifier does not exist on this lane's base, so it could not be used here; swapping to it after L1-C merges is a one-line rebase change and L1-F has no objection. |
| **L1-X's note** (`L07-01` is SQL-only) | Acknowledged. Nothing owed, nothing waited on. |

---

## L1F→D-2 → **L1-D** · reply on `D→F-1`: the four `pearl` sites are a rebase-time apply

**`PatinaColors.Border` does not exist on `ba83aa67f`.** Verified on this lane's base:

```
$ grep -n "enum Border\|static let hairline\|Border.hairline" \
    apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift
(no matches)
```

So applying `D→F-1`'s four substitutions on `first-flight/w1-l1f` makes the branch stop compiling, and
`ios-gate.sh build` / `release` / `unit` are this lane's exit criteria. L1-D merges **second** and L1-F
**fourth** (D14), so the token is on the tip before this lane's merge — the four lines are a
rebase-time apply, not a lane change.

**They are unchanged from your note and none has moved**, because L1-F's own edits are elsewhere in
those files (a header above the transcript, a banner above the composer, one `.padding(.bottom, …)` on
the composer, and a `switch` in the feed's `content`). Re-grep rather than trusting the line numbers:

| file | today | final |
|---|---|---|
| `Features/Messaging/Views/ThreadDetailView.swift` (composer's top rule) | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadDetailView.swift` (**new** — the thread header's bottom rule L1-F added for `C-13`) | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:175` | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |
| `Features/Messaging/Views/ThreadListView.swift:129` | `.stroke(PatinaColors.pearl, lineWidth: 1)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1)` |
| `Features/Notifications/Views/NotificationFeedView.swift` (row hairline) | `Rectangle().fill(PatinaColors.pearl).frame(height: 1)` | `Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)` |

**Five, not four** — `C-13`'s header adds one more `pearl` divider on the same screen, drawn the same
way as the composer's. It is listed so the sweep does not miss it.

**Whoever gets there first is fine by L1-F**: the steward applying all five on the integration tip
after merge 2, or L1-F applying them in a fix round rebased onto that tip. They are mechanical and
carry no behaviour.

---

## L1F→A-2 → **L1-A** · reply on `F-L1A-2`: the exact sentence and the property to read

You asked for the sentence and the property name, and said the acknowledgement belongs as a **second,
lower-priority case in `AuthScreenView`'s existing fixed-height status slot** rather than a second
element, because `P-29` is that nothing on that screen may move. **Agreed — and that supersedes
`L1F→A-1`'s block**, which asked for a separate `Text` under the error banner. Use this instead.

**The property** (shipped, on `first-flight/w1-l1f`, `App/Coordinators/AppCoordinator.swift`):

```swift
    public private(set) var pendingLinkNotice: String?

    public static let pendingLinkNoticeLine = "We'll open what you tapped once you're in."
```

`AppCoordinator` is `@Observable`, so the slot repaints on its own. It is set the moment an arrival is
kept and cleared the moment the queue drains on arrival at `.main`, so it cannot outlive the thing it
is about. `DeepLinkQueueTests.aQueuedLinkIsAcknowledged` pins both edges;
`.theNoticeIsAHomeownerSentence` pins that the line names no URL, no vendor and no error.

**The sentence:** `"We'll open what you tapped once you're in."` — 40 characters, one line at the
default size. It is deliberately not "your link is waiting": the person does not think of it as a
link, they think of it as the invoice they tapped in Mail.

**The slot's precedence, as L1-F would rank it** (your call — you own `P-29`):

1. `AuthService.shared.errorMessage` — something went wrong and they must act.
2. `coordinator.pendingLinkNotice` — nothing is wrong; a promise is being kept.

So: render the notice only when `errorMessage == nil`. A person who just failed to sign in does not
need to be told their link is safe in the same 52 pt.

**The one call-site change** in `ContentView.swift`'s `.auth` case, beside the `errorMessage:`
argument that is already there:

```swift
                    errorMessage: AuthService.shared.errorMessage,
                    pendingLinkNotice: coordinator.pendingLinkNotice
```

`AuthSheet.swift`'s `AuthScreenView(…)` call needs nothing: the parameter defaults to nil, and a link
held while the modal sheet is up is acknowledged by the sheet dismissing into the destination.

**Not blocking L1-F.** If the slot never renders it, the link still arrives — the queue is not
cosmetic. What is lost is the acknowledgement half of `C2-21` / `GAP7B-09`, which is the half that
stops a tester concluding the link did nothing. L1-F reports it open against L1-A until it lands.

**One behaviour change in the auth path L1-A owns, restated because it is easy to miss:** the
`patina://auth…` arm of `DeepLinkHandler` is now explicitly exempt from the queue **in every phase**,
including `.launching`. Before, a magic-link callback arriving during the splash was stashed in
`pendingDeepLink` and drained only on arrival at `.main` — unreachable until that callback is handled,
so it was never drained. `DeepLinkQueueTests.authCallbacksBypassTheQueue` holds it open.
