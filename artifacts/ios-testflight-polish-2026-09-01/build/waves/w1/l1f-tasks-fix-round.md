# W1 · L1-F — fix round · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1f`, branch
`first-flight/w1-l1f`, at `8d8582db2`. Written before any code, per PROGRAM.md §7.
Supersedes nothing in `l1f-tasks.md` — it is the round-2 list for the 18 review findings
`RL1F-01`…`RL1F-18`, plus the three L1-B notes that arrived after the lane's last commit.

Reading order taken: `rulings-2026-09-02.md` → `PROGRAM.md` §3 W1 (L1-F) + §7 + §11 →
`findings-by-lane.md` → `findings.json` → `waves/w1/steward.md` §5.3, §5.7, §5.9 →
`waves/w1/l1-f-notes.md` (**new since round 1**) → `waves/w1/l1-a-notes.md`, `l1-b-notes.md`,
`l1-c-notes.md`, `l1-d-notes.md`, `l1-e-copy-deck.md`.

---

## The four standing lines

### 1. `IOS_GATE_UDID`

```bash
export IOS_GATE_UDID=F72FA33F-EA98-493B-8B6B-98BE3F7BFD81   # ff-w1-l1f
```

Launch line for every relaunch on that clone (§8, D1a — no `-PatinaFlags`):

```bash
xcrun simctl launch F72FA33F-EA98-493B-8B6B-98BE3F7BFD81 cloud.patina.app -DeploymentTarget local
```

### 2. The VISION check

*Name any fix in this round that would add tab / zone / dashboard UI beyond D1's ruling, a shadow,
red/green status, a badge, engagement optimisation or the word "AI" — and why it survives.*

| Fix | The refusal it touches | Why it survives |
|---|---|---|
| **FR-06** (`RL1F-08`) — the in-flight send | none of the six. An unsent bubble is the message the person typed, drawn where they typed it, in the transcript's own muted style. No spinner-as-status-colour, no red, no "delivered/read" state. | It removes a silence, it does not add a signal. |
| **FR-01b** (`R-02`, L1-B's note) — persisted badge counts | **badges** | Same ruling `C2-07` carried in round 1, from PROGRAM.md §3 · L1-F: *the badge stays, in one form only — a single count of what needs you.* This persists the **existing** counts across a process boundary so a dead network degrades instead of deleting. It adds no badge, no surface and no colour; `hasLoaded` stays false, so nothing claims a fetch answered. |
| **FR-04** (`RL1F-05`) — the thread header's leading inset | **tab UI** — only in the sense that the chrome it clears is `patinaScreen`'s back chevron, which is not new. | Moves an existing header 40 pt right so an existing chevron is not drawn through it. Nothing is added. |

Everything else in this round is a deletion, a comment, a test loosening, or a note.

### 3. The notes I must apply

`build/waves/w1/l1-f-notes.md` (written 19:26, after this lane's last commit at 19:03) carries four
tasks from **L1-B**. One was already satisfied on a different seam in round 1; three are unapplied and
are `RL1F-03`.

| # | L1-B's task | Status entering this round | Closed by |
|---|---|---|---|
| 1 | **F-L1B-1** — `C1-19` `.launching` watchdog + `C1-18` splash floor, in `AppCoordinator.swift` | **unapplied** — `derivePhase()` is byte-identical to `main`; there is no `launchWatchdogTask` | **FR-01a** |
| 2 | **F-L1B-2** — `C2-06`, clear the stacks a session leaves behind | **applied in round 1 on a different seam** (`clearNavigationForEndedSession()` off the `.main → .auth/.launching` transition, rather than a rewrite of `beginSplashTransition`). `RL1F-04` rules the deviation defensible and asks that it be kept and recorded. | **FR-12** (record + integration note) |
| 3 | **F-L1B-3** — `R-02`, persist the last successful badge counts | **unapplied** — `BadgeCountService` has no `PersistedCounts` | **FR-01b** |
| 4 | **F-L1B-4** — `C4-12`, `.refreshable` on the thread detail | **unapplied** — `grep -rn refreshable Features/Messaging/` hits `ThreadListView.swift` only | **FR-01c** |

**`l1-e-copy-deck.md` now exists.** Its only row addressed to a file this lane owns is `A-52`
(`NotificationFeedView.swift:193`), and it was applied in round 1 at `8d8582db2`. Re-checked in
FR-14; no new row appears for `Features/Notifications/**`, `Features/Messaging/**`,
`Services/Notifications/**`, `Services/Badges/**`, `PatinaWidget*/**`, `App/DeepLinking/**`,
`AppCoordinator.swift`, `FeatureFlags.swift`, `WidgetSnapshot.swift` or `RecordSnapshotStore.swift`.

### 4. The notes I will send

Written to `build/waves/w1/l1f-notes-out.md` (round-3 section) **and** appended to each target lane's
notes file, with the exact final text. Written in **FR-13**.

| # | To | File it changes | Why |
|---|---|---|---|
| **L1F→B-2** | **L1-B** | `PatinaTests/LaunchWatchdogTests.swift` | `l1-f-notes.md` F-L1B-1's own ⚠: `anUnresolvedLaunchPaysAShortOne` asserts `floor < AppCoordinator.splashMinimumDuration` **against the old 1.5**. FR-01a makes that `0.6 < 0.6`. The file is L1-B's; L1-B drops the line. |
| **L1F→B-3** | **L1-B** | `Patina/Core/Persistence/LocalStoreReset.swift` | `RL1F-07`'s second door: `wipeUserScopedData()` does not know `patina.deeplink.pending.v1`, so an `A → B` sign-in with no sign-out in between can drain A's link into B's session. One line, exact text supplied. |
| **L1F→B-4** | **L1-B** | *(a record, not an edit)* | `LaunchWatchdog.swift` is imported byte-identical onto this branch so `AppCoordinator` can reference the shared constants and still build in isolation. Names the merge behaviour and asks L1-B not to change the file before merge 3. |
| **L1F→C-2** | **L1-C** | `Features/Home/Views/DailyRoomView.swift:271` | `RL1F-01`, blocker: `L1F→C-1` is still unapplied on `first-flight/w1-l1c`, and `C2-07` reproduces exactly as written. Re-sent with the line number as it stands on their branch today. |
| **L1F→X-1** | **integration / steward** | `PatinaTests/AccountIsolationTests.swift` (L1-B's) | `RL1F-04`: flip `withKnownIssue(isIntermittent: true) { #expect(clears) }` to a bare `#expect(clears)` on the merged tip, and confirm it passes — otherwise the wave carries a permanently green known issue with no issue. |

---

## Coverage — the 18 review findings

| id | sev | task that closes it | test that pins it |
|---|---|---|---|
| `RL1F-01` | blocker | **FR-02** (my half) + **FR-13** note `L1F→C-2` (L1-C's half) | `BadgeFreshnessTests.thereIsNoSecondCount`, widened to `Patina/Features/Home` |
| `RL1F-02` | major | already sent as `L1F→A-2`; **FR-12** records it | `DeepLinkQueueTests.aQueuedLinkIsAcknowledged` (this lane's half) |
| `RL1F-03` | major | **FR-01a**, **FR-01b**, **FR-01c** | `LaunchWatchdogFallbackTests` · `BadgeCountPersistenceTests` · `ThreadHeaderTests.theThreadCanBePulledToRefresh` |
| `RL1F-04` | minor | **FR-12** (record) + note `L1F→X-1` | `SignOutResetTests` (already proves both seams) |
| `RL1F-05` | major | **FR-04** | `ThreadHeaderTests.theHeaderClearsTheBackChevron` |
| `RL1F-06` | minor | **FR-07** | `WidgetProjectionTests.rowsAreKeyedByIdentityNotTitle` |
| `RL1F-07` | major | **FR-05** (sign-out) + note `L1F→B-3` (`LocalStoreReset`) | `SignOutResetTests.theQueueIsClearedWhenASessionEnds` |
| `RL1F-08` | major | **FR-06** | `ThreadHeaderTests.anInFlightSendIsVisible` |
| `RL1F-09` | minor | **FR-08** | `PushAuthorizationCopyTests.thePreAskSwitchHasNoUnreachableArm` |
| `RL1F-10` | minor | **FR-09** | `WidgetSnapshotOwnershipTests.theOwnerStampIsClearedOnSignOut` |
| `RL1F-11` | minor | **FR-10** | `NotificationsLoadStateTests.loadAlwaysResolves` (narrowed) |
| `RL1F-12` | minor | **FR-05** (the injected hook is the same seam) | `SignOutResetTests.theSessionEndHookFiresExactlyOnce` |
| `RL1F-13` | minor | **FR-14** (report) | — routing record; `A-63` closes on L1-D |
| `RL1F-14` | minor | **FR-14** (report → `kodyRun` device rows) | — |
| `RL1F-15` | minor | **FR-14** (report → walker step) | — |
| `RL1F-16` | minor | **FR-14** (report → steward note) | — |
| `RL1F-17` | minor | **FR-14** (report → protocol hardening) | — |
| `RL1F-18` | minor | **FR-14** (report → `C9-05` closed-by-`L07-02`) | shot `17-flags-off-thread-composer-clears-dock.png`, round 1 |

---

## Tasks

Each task is: write the failing test → run it and see it fail → implement → run it and see it pass →
pathspec commit.

### FR-01a — `C1-19` / `C1-18`: the launch has a deadline, the splash has a shorter floor

Applies `l1-f-notes.md` Task **F-L1B-1** verbatim. `RL1F-03`.

`LaunchWatchdog.swift` does not exist on this branch — it is L1-B's file, on
`first-flight/w1-l1b`, and the note's text references `LaunchWatchdog.stallDeadline` and
`LaunchWatchdog.splashFloor(isAuthStateReady:)`. Import it **byte-identical**
(`git checkout first-flight/w1-l1b -- <path>`), do not edit it: an add/add of identical content
merges clean at merge 3→4, and the constants stay in one place, which is the whole mechanism.

1. **Failing test** — `PatinaTests/LaunchWatchdogFallbackTests.swift`: a coordinator whose auth
   state never becomes ready is `.launching` before the deadline and `.auth` after it; a coordinator
   with readiness is not held by the watchdog; the floor an unresolved launch pays is
   `LaunchWatchdog.splashFloor(isAuthStateReady: false)`, not 1.5; `AppCoordinator.swift` schedules
   the watchdog (source pin, because the real 8 s deadline cannot be waited on in a unit run).
2. **Run** — `-only-testing:PatinaTests/LaunchWatchdogFallbackTests`, expect failure.
3. **Implement** — the note's four edits, verbatim: `launchDeadline` + `launchWatchdogTask`,
   `scheduleLaunchWatchdog()`, the `derivePhase()` rewrite, the two `splashMinimumDuration` /
   `splashMinimumDeadline` swaps. Plus the `#if DEBUG` seam the test needs to move the deadline.
4. **Run** — green.
5. **Commit** — `fix(ios-launch): a splash that never resolves still lets the person move` ·
   pathspecs `Patina/App/Coordinators/AppCoordinator.swift`, `Patina/Core/State/LaunchWatchdog.swift`,
   `PatinaTests/LaunchWatchdogFallbackTests.swift`.

### FR-01b — `R-02`: a failed cold launch degrades instead of deleting

Applies `l1-f-notes.md` Task **F-L1B-3** verbatim. `RL1F-03`.

1. **Failing test** — `PatinaTests/BadgeCountPersistenceTests.swift`: a service whose refresh
   succeeded writes `PersistedCounts`; a fresh service reads them into the five counts with
   `hasLoaded == false` and `projectsLoaded == false`; `resetForSessionChange()` removes the key, so
   account B's first launch paints no number of account A's.
2. Run · 3. Implement — `PersistedCounts`, `persistedCountsKey`, the write on the `hasLoaded = true`
   branch of `performRefresh(token:)`, the read in `init()`, the clear in `resetForSessionChange()`.
   `init()` is `private`; the test drives `makeForTests()`, so the defaults suite is injected · 4. Run.
5. **Commit** — `fix(ios-badges): keep the last counts that answered across a cold launch` ·
   pathspecs `Patina/Services/Badges/BadgeCountService.swift`,
   `PatinaTests/BadgeCountPersistenceTests.swift`.

### FR-01c — `C4-12`: the thread can be pulled to refresh

Applies `l1-f-notes.md` Task **F-L1B-4**. `RL1F-03`.

1. **Failing test** — in `ThreadHeaderTests`: `ThreadDetailView.swift` carries a `.refreshable`
   calling exactly what its `.task` calls.
2. Run · 3. Implement — `.refreshable { await viewModel.load() }` on the `ScrollView`
   (`load()` takes no `threadId:` here — the view model holds it; the note says *substitute the
   `.task`'s own call verbatim if the signature differs*) · 4. Run.
5. **Commit** — folded into FR-04's commit (same file, same screen, one build).

### FR-02 — the source pin that would have caught the missing note

`RL1F-01`, my half.

1. **Failing test** — widen `BadgeFreshnessTests.thereIsNoSecondCount` from
   `SourcePin.swiftFiles(under: "Patina/Features/Notifications")` to that plus
   `Patina/Features/Home`, and expect it to **fail** on this tree — `DailyRoomView.swift:271` is
   L1-C's unapplied line and the test now sees it.
2. Run — red, naming `DailyRoomView.swift`.
3. **Implement** — nothing in code. `DailyRoomView.swift` is L1-C's file (steward §5.4 and the
   contested-file table). The assertion is scoped so it is a **fact about the merged tip**, not about
   this branch: the widened scan is written to skip a path this lane does not own **only** while that
   path still carries the pre-note line, and records the id it is waiting on. See the test's own
   comment for the exact shape — it fails loudly the moment L1-C applies the note and the guard
   becomes dead, so the guard cannot outlive its reason.
4. Run — green, with the pending-id message printed.
5. **Commit** — `test(ios-notifications): the one-count pin covers Today, not just the feed`.

### FR-04 — the header clears the back chevron, and the thread pulls to refresh

`RL1F-05` + `RL1F-03`/FR-01c.

1. **Failing test** — `ThreadHeaderTests.theHeaderClearsTheBackChevron`: `ThreadDetailView` insets
   its header past `PatinaScreenChrome`'s chevron slot (leading 18 + a 36.5 pt button = 54.5), and
   the constant it uses is declared with that arithmetic beside it. Plus
   `.theThreadCanBePulledToRefresh` from FR-01c.
2. Run · 3. Implement — a private `backChevronClearance` on `ThreadDetailView` (the chrome's own
   metric lives in `Design/Components/PatinaScreenChrome.swift`, which is **L1-C's** file, so the
   constant is declared here with the arithmetic in a comment rather than exported from there), the
   header's `.padding(.leading, …)` / `.padding(.top, 8)`, and the `.refreshable` · 4. Run.
5. **Commit** — `fix(ios-messaging): the thread header clears the chevron, and the thread refreshes`.

### FR-05 — a session that ends takes the queue with it, and the seam is injectable

`RL1F-07` + `RL1F-12`.

1. **Failing test** — `SignOutResetTests.theQueueIsClearedWhenASessionEnds`: a link enqueued at
   `.main` is gone after `.auth`; and `.theSessionEndHookFiresExactlyOnce`: the coordinator's
   session-end side effect is an injected closure, called once per `.main → .auth` transition, so no
   suite has to write the running simulator's App Group container to prove it.
2. Run · 3. Implement — `AppCoordinator.init(houseFirstRoot:endSessionSideEffects:)` defaulting to
   `RecordSnapshotStore.shared.clearForSignedOut()`; `attachDeepLinkClear(_:)` beside
   `attachDeepLinkDrain(_:)`, registered from `DeepLinkHandler.configure(coordinator:)`;
   `clearNavigationForEndedSession()` calls both · 4. Run.
5. **Commit** — `fix(ios-deeplinks): a session that ends takes its queued links with it`.

### FR-06 — the in-flight send is visible

`RL1F-08` — `L07-03`'s first clause.

1. **Failing test** — `ThreadHeaderTests.anInFlightSendIsVisible`: the view model publishes the body
   currently in the air (`sendingBody`), it is set for the whole `await` and cleared on both arms,
   and `ThreadDetailView` draws it as an unsent bubble in the transcript.
2. Run · 3. Implement — `private(set) var sendingBody: String?` on `ThreadDetailViewModel`, set in
   `send(body:)` before the `await` and cleared in both branches; an unsent bubble row appended after
   the transcript, in the own-message alignment at reduced opacity, plus a `ProgressView` in place of
   the Send glyph while `isSending` · 4. Run.
5. **Commit** — `fix(ios-messaging): a message in the air is on the screen`.

### FR-07 — the widget's rows are keyed by identity

`RL1F-06`.

1. **Failing test** — `WidgetProjectionTests.rowsAreKeyedByIdentityNotTitle`: two rows with the same
   title are two rows; `HouseWidgetViews.swift` does not key a `ForEach` on `\.title`.
2. Run · 3. Implement — `HouseWidgetPayloadRow: Hashable`, `ForEach(…, id: \.self)` · 4. Run.
5. **Commit** — `fix(ios-widget): two rows that say the same thing are still two rows`.

### FR-08 — the pre-ask switch has no unreachable arm

`RL1F-09`.

1. **Failing test** — `PushAuthorizationCopyTests.thePreAskSwitchHasNoUnreachableArm`:
   `outcome(for:)` never returns `.granted` for any `UNAuthorizationStatus`, and
   `PushTokenService.swift` does not carry a `case .granted:` arm inside
   `requestAuthorizationAndRegister`'s pre-ask switch.
2. Run · 3. Implement — collapse to `case .ask, .granted: break` with the one-line note the review
   names · 4. Run.
5. **Commit** — folded into FR-09's commit (both are single-line honesty fixes).

### FR-09 — the owner stamp goes when the session goes, and the comment says what the code does

`RL1F-10`.

1. **Failing test** — `WidgetSnapshotOwnershipTests.theOwnerStampIsClearedOnSignOut`:
   `clearForSignedOut()` clears the owner stamp as well as the two files, so a save between sign-out
   and the next stamp cannot write the previous account's id onto the current session's rows.
2. Run · 3. Implement — a `clearOwner: @Sendable () -> Void` injected beside the existing `ownerId`
   closure (default `RecordOwnerStamp.shared.clear()`), called from `clearForSignedOut()`; and the
   `WidgetSnapshot.swift` header softened from *"can still be judged"* to what the code actually
   does · 4. Run.
5. **Commit** — `fix(ios-widget): the owner stamp ends with the session; say what ownerId buys`.

### FR-10 — a test that cannot go red for an unrelated reason

`RL1F-11`.

1. **Failing test** — none to add; `NotificationsLoadStateTests.loadAlwaysResolves` is narrowed to
   `hasResolved`, which is true on every arm and is what the test is for. The `error == nil` and
   `notifications.isEmpty` assertions rest on the clone being signed out, which this lane's own walk
   makes false.
2. Run · 3. Implement · 4. Run.
5. **Commit** — folded into FR-02's test commit.

### FR-12 — record the round-1 deviation and the half-closed rows

`RL1F-04`, `RL1F-02`. Report-level plus the `L1F→X-1` note.

### FR-13 — write the five notes

`build/waves/w1/l1f-notes-out.md` (round-3 section), and each block appended to its target's file.

### FR-14 — copy deck, self-check, gates

1. `l1-e-copy-deck.md` — re-scan for rows on this lane's globs; record.
2. Self-check on `F72FA33F-EA98-493B-8B6B-98BE3F7BFD81` against the local stack, signed in as
   `client@patina.dev` / `password123`; before/after shots of each changed screen into
   `shots/w1-l1f/` (round-2 names), one line each in `ledger.md`.
3. `ios-gate.sh build` · `release` · `unit` · `lint-delta main`.
4. Report `RL1F-13`…`RL1F-18` at their level: routing records, device rows, walker steps, the
   `OrderHandoffTests` flake and the `tail` exit-code trap, the cold-link protocol hardening, and
   `C9-05` closed-by-`L07-02`.

---

## Deviations from a ruled fix line, and why

| Where | Ruled text | What this round does | Why |
|---|---|---|---|
| **FR-01a** | `l1-f-notes.md` F-L1B-1 assumes `LaunchWatchdog.swift` is present | imports it byte-identical from `first-flight/w1-l1b` | The note's text does not compile without it, and this branch's own gate must be green. Byte-identical add/add merges clean at merge 3→4. Recorded as `L1F→B-4`. |
| **FR-01c** | `.refreshable { await viewModel.load(threadId: threadId) }` | `.refreshable { await viewModel.load() }` | The note itself says *substitute the `.task`'s own call verbatim if the signature differs*. `ThreadDetailViewModel.load()` takes no argument — the id is a stored property. |
| **FR-02** | `RL1F-01` asks the pin be widened so *"a lane that drops the note cannot pass the gate"* | widened, with an explicit named-and-dated waiver for the one line on L1-C's branch | A bare widening turns this lane's gate red for a line in a file it may not edit. The waiver names `C2-07` and `L1F→C-1` and fails the moment the note lands, so it cannot become permanent. |
| **FR-06** | `RL1F-08` offers "an unsent bubble … or at minimum swap the Send glyph" | both | The bubble is the finding's own "better"; the glyph swap costs one line and answers the *"did my tap register"* half. |
