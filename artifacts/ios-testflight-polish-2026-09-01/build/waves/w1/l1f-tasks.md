# W1 · L1-F — Notifications, messaging, widget, deep links · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1f`, branch
`first-flight/w1-l1f`, base `ba83aa67f`. Written before any code, per PROGRAM.md §7.

Reading order taken: `rulings-2026-09-02.md` → `PROGRAM.md` §3 W1 (L1-F) + §7 + §11 →
`findings-by-lane.md` (authoritative) → `findings.json` → `waves/w1/steward.md` →
`waves/w1/l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md` (none addressed to L1-F) →
`waves/w0/l07-notes.md` §N2.

---

## The four standing lines

### 1. `IOS_GATE_UDID`

```bash
export IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81   # ff-w1-l1f
```

Launch line for every relaunch on that clone, and nothing else (§8, D1a):

```bash
xcrun simctl launch F72FA33F-EA98-493B-8B6B-98BE3F7BFD81 cloud.patina.app -DeploymentTarget local
```

### 2. The VISION check

*Name any finding in my table whose fix would add or entrench something VISION §6 refuses — tab / zone
/ dashboard UI beyond D1's ruling, shadows, red/green status, badges, engagement optimisation, the
word "AI" — and say why it survives.*

Three rows in this table touch a refusal. Nothing else in the lane does.

| Row | The refusal it touches | Why it survives |
|---|---|---|
| `C2-07` | **badges** | Ruled already, in PROGRAM.md §3 · L1-F, and carried here verbatim: *the badge stays, in one form only — a single count of what needs you, the same derived number `A-81` mandates in L1-B, rendered on the bell and mirrored to the app icon. What does NOT survive: any second badge, any badge on a surface that is not the bell or the icon, and any red-as-meaning.* This lane's fix makes the existing bell count **correct** and **single-sourced**; it adds no badge, no surface and no colour. `BadgeFreshnessTests` asserts the count comes from `BadgeCountService`; L1-B's `AttentionCountTests` asserts there is only one such count in the app. **This lane adds no app-icon badge** — mirroring to the icon is not in `C2-07`'s fix line and would be unrequested scope; recorded as a note to Fable rather than a commit. |
| `GAP7B-04` / `D5` | **tab / zone / dashboard UI** | Adding `.systemMedium` is a widget *family*, not a zone or a dashboard: the medium card draws the same MOVED rows the small one does, each with its own door. It carries no count, no tally, no status colour — `HouseWidgetPayloadTests.theWidgetHasNoLanguageForACount` scans every widget source for `needsYou`, `badge`, `isNew` and `.count` and stays green. D5 is Kody's ruling and names the medium family explicitly. |
| `L07-02` | **tab UI** | The composer yields to the four-tab bar. The bar itself is **V7**, the logged, dated D1 exception for the iOS app (surface #2). Nothing new is added; a screen is made to clear what D1 already shipped. |

Two rows deliberately do **not** get the treatment a refused pattern would give them:

- `C2-09`'s denied-authorization line is a sentence plus a Settings door — no red, no status chip.
- `C-14`'s empty state is an invitation, not an engagement mechanic; it makes no claim about how fast
  anyone replies (see Task F-11's copy note).

### 3. The notes I must apply

**None.** Every `build/waves/w1/<lane>-notes.md` on disk at the time of writing — `l1-a-notes.md`,
`l1-b-notes.md`, `l1-c-notes.md` — is addressed to another lane, and grep for `L1-F` across all three
returns nothing. `l1-f-notes.md` does not exist.

Two things the charter says will arrive here as notes, and their status:

| Owed to this lane | Source | Status |
|---|---|---|
| **`C1-18`/`C1-19` — the `.launching` watchdog**, with the exact 5–8 s timeout and the exact fallback sentence, applied in `AppCoordinator.swift` | L1-B (PROGRAM.md §3 W1 contested-file table; steward §5.3 "Not this lane") | **Not written.** Task F-13 sends L1-B a note asking for it. Not implemented here: the ruled deliverable is L1-B's *exact* timeout and *exact* sentence, and inventing either would defeat the mechanism. Reported `open` with that reason. |
| **`C2-06` — sign-out leaves the previous account's screens on the navigation stack** (L1-B's row, this lane's file) | Named directly in this lane's brief | **Implemented here**, Task F-02. `findings.json`'s fix line is complete and needs no copy decision. |

`build/waves/w1/l1-e-copy-deck.md` **does not exist yet** — checked immediately before the final
commit. The deck pass at integration applies its rows to this lane's files. Three strings this lane
writes are flagged for it in Task F-14.

### 4. The notes I will send

Written to `build/waves/w1/l1f-notes-out.md` **and** appended to each target lane's notes file, with
the exact final text. Task F-13 is where they are written; they are listed here so the list is
readable on its own.

| # | To | File it changes | Why |
|---|---|---|---|
| **L1F→D-1** | **L1-D** | `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift` | `A-63`. The root cause is `PatinaButton` having **zero** horizontal padding: its width comes only from `.frame(maxWidth: .infinity)`, and `PatinaEmptyState` applies `.fixedSize()` to it, which collapses the capsule to exactly the label's width — a 50 pt capsule with a 26 pt corner radius, i.e. a circle that cuts its own text. Nothing inside L1-F's globs can fix it without duplicating design-system chrome. |
| **L1F→C-1** | **L1-C** | `apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:258` | `C2-07`, the badge binding the contested-file table already routes here. One argument changes: the bell's `unreadCount` reads the shared `BadgeCountService` instead of Today's private `NotificationsViewModel`. |
| **L1F→A-1** | **L1-A** | `AuthScreenView.swift` + `ContentView.swift` (`.auth` case) | `C2-21` / `GAP7B-09`'s acknowledgement — the one line on the auth screen that says a link is being held. This lane publishes `AppCoordinator.pendingLinkNotice`; L1-A renders it. |
| **L1F→B-1** | **L1-B** | *(a request, not an edit)* | Asks for the `C1-18`/`C1-19` watchdog note with the exact timeout and fallback sentence, so `AppCoordinator.swift` can carry it before this lane merges (merge order puts L1-B at 3 and L1-F at 4). |

---

## Coverage — the 17 rows in `findings-by-lane.md` §"W1 · L1-F"

| id | sev | task that closes it | test that pins it |
|---|---|---|---|
| `L07-02` | blocker | F-12 | `ThreadHeaderTests.composerClearsTheTabBar` |
| `A-63` | major | **F-13** (note L1F→D-1; root cause is L1-D's file) | note only — see the row's entry in §Open |
| `A-80` | major | F-09 | `NotificationsLoadStateTests` |
| `B-16` | major | F-03 | `WidgetSnapshotOwnershipTests` |
| `C-13` | major | F-11 | `ThreadHeaderTests.aThreadNamesWhoYouAreMessaging` |
| `C-14` | major | F-11 | `ThreadHeaderTests.theAuditLineIsSuppressed…` |
| `C2-02` | major | F-01 | `DeepLinkQueueTests.aLinkArrivingBeforeConfigureIsStashed` |
| `C2-07` | major | F-08 + F-13 (L1F→C-1) | `BadgeFreshnessTests` |
| `C2-09` | major | F-10 | `PushAuthorizationCopyTests` |
| `C2-21` | major | F-01 | `DeepLinkQueueTests.everyNonMainPhaseQueues` |
| `C4-04` | major | F-11 | `ThreadHeaderTests.aFailedSendIsVisible…` |
| `GAP7B-02` | major | F-04 | `WidgetFlagOffRenderingTests` |
| `GAP7B-03` | major | F-07 | `WidgetProjectionTests.rowTitlesWrapRatherThanTruncate` |
| `GAP7B-04` | major | F-06 | `WidgetProjectionTests.theSmallFamilyDrawsOneRow…` |
| `GAP7B-05` | major | F-05 | `WidgetProjectionTests.everyProjectedRowCarriesARoute` |
| `GAP7B-09` | major | F-01 | `DeepLinkQueueTests.theQueueSurvivesAColdLaunch` |
| `L07-03` | major | F-11 | `ThreadHeaderTests.aFailedSendIsVisible…` |

Plus, from the brief: `C2-06` (L1-B's row, this lane's file) → F-02, `SignOutResetTests`.

---

## Tasks

Each task is: write the failing test → run it and see it fail → implement → run it and see it pass →
pathspec commit.

### F-01 — The deep-link FIFO: nothing is dropped, nothing is reported handled that wasn't

Closes `C2-02`, `C2-21`, `GAP7B-09` (which absorbs `GAP7-03`, `GAP7-04`).

1. **Failing test** — `PatinaTests/DeepLinkQueueTests.swift`:
   - a universal link arriving with `coordinator == nil` is **stashed**, and `configure(coordinator:)`
     replays it (`C2-02`);
   - a link arriving at `.auth`, `.onboarding` **and** `.launching` is queued, not silently pushed onto
     an unmounted stack (`C2-21`);
   - the queue is a FIFO of depth > 1 and drains **in order** at `.main`;
   - the queue is written to the App Group defaults and reloads from them, so it survives a cold launch
     (`GAP7B-09`), and an entry older than the TTL is dropped rather than replayed;
   - `handle` returns `false` for a link it discarded and `true` only for one it opened or queued;
   - **`patina://auth…` is never queued in any phase** — queueing the magic-link callback would
     deadlock the app, since `.main` is unreachable until that callback is handled.
2. **Run** — `-only-testing:PatinaTests/DeepLinkQueueTests`, expect failure.
3. **Implement**
   - new `Patina/App/DeepLinking/PendingLinkQueue.swift`: `maximumDepth = 5`,
     `timeToLive = 15 * 60` (one email-OTP round trip), persisted under
     `UserDefaults(suiteName: "group.cloud.patina.app")` with the `.standard` fallback the rest of the
     App Group code already takes.
   - `DeepLinkHandler`: one `deliver(_ route:for url:)` seam used by the universal-link arm, the room
     arm, the piece arm and the widget arm — open when the coordinator is mounted **and** at `.main`,
     otherwise enqueue. `navigate(to:)` keeps an in-memory route FIFO for the APNs path.
   - `AppCoordinator`: `pendingDeepLink: URL?` (one slot) is replaced by the queue; the `.main`
     transition drains it; `pendingLinkNotice: String?` is published for the auth screen.
4. **Run** — green.
5. **Commit** — `fix(ios-deeplinks): queue every non-main arrival, persist it, drain it in order`
   with an explicit pathspec.

### F-02 — Sign-out clears the navigation stacks

Closes `C2-06` (L1-B's row, this lane's file, named in the brief).

1. **Failing test** — `PatinaTests/SignOutResetTests.swift`: after a `.main → .auth` transition, both
   roots are at their root — `navigationPath.isEmpty`, every `tabs.stack(for:)` empty,
   `tabs.selected == .today`, `currentScreen == .heroFrame`.
2. Run · 3. Implement in `AppCoordinator.recomputePhase()`'s existing leave-`.main` branch · 4. Run.
5. **Commit** — `fix(ios-nav): clear every stack when a session ends`.

### F-03 — The widget snapshot names its account, and sign-out replaces it

Closes `B-16`.

1. **Failing test** — `PatinaTests/WidgetSnapshotOwnershipTests.swift`: a saved snapshot carries
   `ownerId`; `clearForSignedOut()` replaces the widget file with a placeholder carrying **no** owner
   and **no** rows, removes the record file, and calls the reload closure exactly once; the widget's
   own decoder reads that placeholder as `isPlaceholder`.
2. Run · 3. Implement — `ownerId` on `WidgetSnapshot` and `HouseWidgetPayload`,
   `RecordSnapshotStore.clearForSignedOut()`, and the call from `AppCoordinator`'s sign-out seam
   (`LocalStoreReset` fires only when a **different** account signs in, never on sign-out) · 4. Run.
5. **Commit** — `fix(ios-widget): stamp the snapshot's owner and replace it on sign-out`.

### F-04 — The placed widget draws what it was given, flag or no flag (D5)

Closes `GAP7B-02`.

1. **Failing test** — `PatinaTests/WidgetFlagOffRenderingTests.swift`: a payload with
   `"flagOn": false` and real rows draws those rows; only a payload with no owner is a placeholder.
2. Run · 3. Implement — `drawableRows` stops gating on `flagOn`; `isPlaceholder` becomes
   `ownerId == nil`. `flagOn` stays on the wire (W2 may re-gate promotion) and is no longer read by
   the render path. **Update** the two existing tests that pin the retired ruling —
   `HouseWidgetPayloadTests.theFlagOffDrawsNothingReal` and `.anAbsentFlagIsOff` · 4. Run.
5. **Commit** — `fix(ios-widget): render the snapshot regardless of house-widget (D5)`.

### F-05 — Every projected row has somewhere to go

Closes `GAP7B-05`.

1. **Failing test** — `PatinaTests/WidgetProjectionTests.swift`: a record whose MOVED half holds a
   story row with `route == nil` projects **only** the routed rows; the widget's link for every
   projected row resolves back through `DeepLinkHandler.route(forWidgetLink:in:)` to that row's own
   route, never the `.heroFrame` fallback.
2. Run · 3. Implement — `WidgetSnapshot.init(record:…)` `compactMap`s on the route ·
4. Run. **Update** `WidgetSnapshotTests.onlyMovedRowsAreProjected`, which pins the old behaviour.
5. **Commit** — `fix(ios-widget): project only rows that carry a destination`.

### F-06 — One tap target, one destination; and the medium family (D5)

Closes `GAP7B-04`.

1. **Failing test** — in `WidgetProjectionTests`: `systemSmall` draws **one** row and its `widgetURL`
   is that row's own door; `systemMedium` is a supported family and draws each row inside its own
   `Link`. Pinned in source (`SourcePin`/`SourceScan`, the pattern
   `HouseWidgetPayloadTests.theWidgetHasNoLanguageForACount` already uses) plus a payload-level
   assertion on the links themselves.
2. Run · 3. Implement in `HouseWidgetViews.swift` and `HouseWidget.swift` · 4. Run.
5. **Commit** — `fix(ios-widget): one row and one door on small, per-row links on medium`.

### F-07 — No title is cut mid-word

Closes `GAP7B-03`.

1. **Failing test** — in `WidgetProjectionTests`: the row title view sets `lineLimit(2)` and a
   `minimumScaleFactor`, on every family that draws a row.
2. Run · 3. Implement · 4. Run. 5. **Commit** — `fix(ios-widget): wrap row titles instead of cutting them`.

### F-08 — One count of what needs you, and it is fresh

Closes `C2-07` (with note **L1F→C-1**).

1. **Failing test** — `PatinaTests/BadgeFreshnessTests.swift`: `BadgeCountService` is the single
   source of the bell's unread count; marking a row read in the feed lowers it; `markAllRead` takes it
   to zero; a Studio-composed fallback row never counts (it was never delivered and has no read state).
2. Run · 3. Implement — `BadgeCountService.unreadNotificationCount` + `NotificationsViewModel`
   publishing into it on `load` / `markRead` / `markAllRead`; `resetForSessionChange()` zeroes it ·
4. Run. 5. **Commit** — `fix(ios-notifications): source the bell's count from one service`.

### F-09 — Loading is not "nothing yet"

Closes `A-80`.

1. **Failing test** — `PatinaTests/NotificationsLoadStateTests.swift`: a freshly constructed view model
   has **not** resolved, so the feed may not draw its empty state; the empty state is reachable only
   after a fetch that resolved with zero rows; a failed fetch is an error state, not an empty one.
2. Run · 3. Implement — `NotificationsViewModel.hasResolved`, read by `NotificationFeedView` before it
   falls through to `emptyView` · 4. Run.
5. **Commit** — `fix(ios-notifications): never assert 'nothing yet' before the fetch resolves`.

### F-10 — "Turn on notifications" is never a no-op

Closes `C2-09`.

1. **Failing test** — `PatinaTests/PushAuthorizationCopyTests.swift`: the pure decision function maps
   `.notDetermined` → ask, `.denied` → the app's own sentence plus a Settings door, `.authorized` →
   register without asking; the denied sentence prints no vendor string and the Settings door is
   `UIApplication.openSettingsURLString`.
2. Run · 3. Implement — `PushTokenService.authorizationOutcome(for:)` (pure, testable without touching
   `UNUserNotificationCenter`), `requestAuthorizationAndRegister()` reading
   `notificationSettings().authorizationStatus` first and returning the outcome, and `PushPrimerView`
   rendering the denied line + "Open Settings" instead of dismissing silently · 4. Run.
5. **Commit** — `fix(ios-push): read authorization before asking, and say so when it was denied`.

### F-11 — The thread says who you are talking to, and a failed send says so

Closes `C-13`, `C-14`, `C4-04`, `L07-03`.

1. **Failing test** — `PatinaTests/ThreadHeaderTests.swift`: a header is built from the thread summary
   (counterpart name, initials for the avatar, project name) and falls back honestly when a name is
   missing; the seeded audit line `"Project conversation opened."` is not a transcript row; a thread
   whose only content was that line renders the empty state; a send failure sets `sendError` and is
   rendered above the composer **on a thread that has messages**, with a retry that re-sends the
   restored draft.
2. Run · 3. Implement — `ThreadHeader` + `sendError` + `retrySend()` on `ThreadDetailViewModel`
   (`Features/Messaging/ViewModels/MessagingViewModel.swift`), header + empty state + failure banner in
   `ThreadDetailView.swift`. The header's data comes from `BadgeCountService.threadSummaries` when it is
   already loaded and from the existing `listThreadSummaries()` otherwise — **no new method in
   `Core/Network/MessagingAPIClient.swift`, which is L1-B's file** · 4. Run.
5. **Commit** — `fix(ios-messaging): a thread header, a real empty state, and a visible send failure`.

### F-12 — The composer clears the tab bar

Closes `L07-02` (blocker).

1. **Failing test** — in `ThreadHeaderTests`: `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:
   true)` is `barRowHeight + 8`, and `ThreadDetailView` applies exactly that to the composer, read from
   the coordinator's `isHouseFirstRoot` rather than a live flag read.
2. Run · 3. Implement per `waves/w0/l07-notes.md` §N2, with one deviation recorded in §Deviations ·
4. Run. 5. **Commit** — `fix(ios-messaging): the composer yields to the tab bar`.

### F-13 — Write the four notes

`build/waves/w1/l1f-notes-out.md`, and each block appended to its target's notes file.

### F-14 — Copy-deck check, then the self-check and the gates

1. Re-check `build/waves/w1/l1-e-copy-deck.md`. If it exists, apply every row addressed to a file this
   lane owns and record which. If it does not, say so in the report.
2. Self-check on `F72FA33F-EA98-493B-8B6B-98BE3F7BFD81` against the local stack, signed in as
   `client@patina.dev` / `password123`, screenshotting each changed screen before and after into
   `shots/w1-l1f/` with a one-line-per-shot `ledger.md`.
3. The cold-link protocol, 8 of 8 (PROGRAM.md §3 · L1-F exit criteria, steward §5.7's launch line).
4. `ios-gate.sh build` · `release` · `unit` · `lint-delta main`.

---

## Deviations from a ruled fix line, and why

| Where | Ruled text | What this lane does | Why |
|---|---|---|---|
| **F-12** | `waves/w0/l07-notes.md` §N2: `FeatureFlags.shared.isOn(.houseFirst)` | `coordinator.isHouseFirstRoot` | `MoneyScreenChrome.swift:38-39`, the metric's only existing caller, says in its own words: *"Callers pass the flag they already hold — `coordinator.isHouseFirstRoot`, resolved once at launch — never a live `FeatureFlags` read."* A late PostHog payload can flip `FeatureFlags` mid-session; it cannot flip the root. Same value at launch, strictly safer after it. |
| **F-11** | §N2's snippet `} else if let error = viewModel.error {` | a separate `sendError`, rendered **above the composer**; the transcript's load-error branch is unchanged | The snippet and the prose beside it disagree — the prose says *"rendering the error above the composer rather than in place of the transcript"*, which is what `C4-04` asks for too. One `error` field cannot be both. Splitting it lets a load failure keep its retry-the-load and a send failure get retry-the-send. |
| **F-11** | `C-14`'s fix line: *"Say hello to Leah — she usually replies within a day"* | "Say hello to Leah." + "Messages here go straight to your designer." | The app cannot know how fast a designer replies, and a first-run promise it cannot keep is the failure VISION cares most about. Flagged for L1-E's deck. |
| **F-04** | — | two existing tests are rewritten | `HouseWidgetPayloadTests.theFlagOffDrawsNothingReal` and `.anAbsentFlagIsOff` pin the ruling **D5 retires**. They are updated, not deleted, and the comment names D5. |
