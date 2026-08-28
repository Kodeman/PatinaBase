# W3 — Steward setup + N1 inventory

Written by the W3 steward, 2026-08-27. Everything below is read off the tree at the base sha, not
recalled. Line numbers are `apps/mobile/Patina/Patina/`-relative unless stated.

## 0. Setup — done

| Thing | Value |
|---|---|
| Base sha | `83b8c3340` — `docs(ios): Daily Return — W2 wave record (lanes, reviews, fix logs, walk), W3 script, plan carry-overs` (`git -C /Users/kody/Code/patina-merged log --oneline -1 main`) |
| N1 worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n1` |
| N1 branch | `daily-return/w3-n1` (cut from `main`; **not pushed**) |
| N1 simulator | **`3D350836-BAF9-443A-8598-588D8D4AEBF6`** — `dr-w3-n1`, iPhone 17 Pro / iOS 26.5, Booted |
| Review device | `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro / iOS 26.5, Booted) — **the walker's, not N1's** |

```
$ git -C /Users/kody/Code/patina-merged worktree add \
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n1 -b daily-return/w3-n1 main
Preparing worktree (new branch 'daily-return/w3-n1')
HEAD is now at 83b8c3340 docs(ios): Daily Return — W2 wave record …
```

`Secrets.swift` copied in from the main checkout (`-rw-------`, 1.1k);
`git status --porcelain apps/mobile/Patina` in the worktree is **empty** — it is gitignored and did
not become a tracked change. **Never commit it.**

The simulator was **created, not cloned** — `simctl clone` fails with SimError 405 against a booted
source, and the review device is booted:

```
$ xcrun simctl create "dr-w3-n1" \
    com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro \
    com.apple.CoreSimulator.SimRuntime.iOS-26-5
3D350836-BAF9-443A-8598-588D8D4AEBF6
$ xcrun simctl boot 3D350836-… && xcrun simctl list devices | grep dr-w3-n1
    dr-w3-n1 (3D350836-BAF9-443A-8598-588D8D4AEBF6) (Booted)
```

The device type + runtime were read off `973D1724-…` so N1's clone matches the walker's frame
(402 × 874 pt) exactly.

⚠ **`simctl` needs `dangerouslyDisableSandbox: true`.** Sandboxed it dies on
`CoreSimulatorService connection became invalid` / `Unable to discover any Simulator runtimes`. So do
`xcodebuild`, `git worktree add`, and `git merge`.

**The worktree builds.** Run twice, as documented:

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 1
** BUILD FAILED **     (3 SwiftCompile failures, no `error:` line — the 'Stamp Git SHA' phase)
$ ./apps/mobile/Patina/scripts/ios-gate.sh build     # run 2, identical command
** BUILD SUCCEEDED **
```

### Cleanup already accounted for

- **No `dr-w2-*` simulators exist** — `xcrun simctl list devices | grep -i dr-w` returns nothing.
  The W2 steward's `dr-w2-{r1,r2,r3,int}` clones are already gone; nothing to delete.
- **No `agent-dr-w2-*` worktrees exist** — `ls -d .codex/worktrees/agent-dr-w2-*` → *no matches*,
  and `git worktree list` shows none. All five were retired after the W2 ff-merge.
- `git worktree list` still shows 20 unrelated worktrees (field-companion, splat, repoint, …) owned
  by other programs. **Out of scope — left alone.**

---

## 1. Every `AppRoute` case → its tab under B-7

Source: `App/Coordinators/Coordinator.swift:52-107`. **31 cases**, all listed. Tabs are B-7's four:
**Today · Spaces · Pieces · Studio** (labels), whose canonical destination titles / VoiceOver labels
are **Today · Your Spaces · Browse pieces · Your Studio** (C4 + B-7a).

| # | `AppRoute` case | `displayName` | Tab | Note |
|---|---|---|---|---|
| 1 | `heroFrame` | Home | **Today** | root-reset, never pushed (`ContentView.swift:218-220`) |
| 2 | `yourSpaces` | Your Spaces | **Spaces** | the tab's own root |
| 3 | `roomProject(roomId:)` | Room | **Spaces** | |
| 4 | `roomSettings(roomId:)` | Room Settings | **Spaces** | |
| 5 | `crossRoom` | All Items | **Spaces** | Room System "all items" |
| 6 | `manualRoomEntry` | Room Details | **Spaces** | |
| 7 | `roomSavedItems(roomId:)` | Saved | **Spaces** | ⚠ room-scoped, but mounts `CollectionsView` — see §7·A |
| 8 | `emergence(pieceId:)` | Emergence | **Pieces** | the tab's own root when `pieceId == nil` |
| 9 | `roomEmergence(roomId:)` | Emergence | **Pieces** | ⚠ contested — see §7·A |
| 10 | `table` | Saved | **Pieces** | the canonical Saved surface, behind M9's `Saved` row |
| 11 | `pieceDetail(pieceId:)` | Piece Detail | **Pieces** | |
| 12 | `scanFlow(reason:)` | Quiet Conversation | **Spaces** | |
| 13 | `styleQuiz` | Style Quiz | **Pieces** | |
| 14 | `styleResult(result:)` | Your Style | **Pieces** | |
| 15 | `arPlacement(productId:roomRemoteId:)` | AR Placement | **Spaces** | |
| 16 | `profile` | Profile | **Studio** | |
| 17 | `notifications` | Notifications | **Studio** | ⚠ also the header bell on Today — see §7·B |
| 18 | `designerConsultation` | Designer | **Studio** | |
| 19 | `designRequests(focusLeadId:)` | Design Request | **Studio** | |
| 20 | `projectList` | Projects | **Studio** | |
| 21 | `projectDetail(projectId:)` | Project | **Studio** | |
| 22 | `decisionList` | Decisions | **Studio** | |
| 23 | `decisionDetail(decisionId:)` | Decision | **Studio** | |
| 24 | `threadList` | Messages | **Studio** | |
| 25 | `threadDetail(threadId:)` | Conversation | **Studio** | |
| 26 | `proposalList` | Proposals | **Studio** | |
| 27 | `proposalDetail(proposalId:)` | Proposal | **Studio** | |
| 28 | `invoiceList` | Invoices | **Studio** | |
| 29 | `invoiceDetail(invoiceId:)` | Invoice | **Studio** | |
| 30 | `budget` | Budget | **Studio** | |
| 31 | `documentList` | Documents | **Studio** | |

Tally: Today 1 · Spaces 8 · Pieces 6 · Studio 16.

**Two other switches are exhaustive over `AppRoute` and must stay in sync** when the table lands:
`displayName` (`Coordinator.swift:109-142`) and `AppCoordinator.navigate(to:)`'s push/root split
(`AppCoordinator.swift:288-311`). `RouteAnalyticsParityTests` pins `analyticsScreenName` /
`legacyScreenName` — **the tab table must not change either**, or that suite reddens.

---

## 2. `navigate(to:)` call sites — **122**, not 105

```
$ grep -rn "navigate(to:" apps/mobile/Patina/Patina --include="*.swift" | wc -l
     122
```

⚠ **The spec's number is stale.** `direction-b.md` B-1, `rulings-2026-08-27.md` R2 and
`build-plan.md` W3/N1 all say **105**; the tree at the base sha carries **122**. W1a, W1b and W2
each added sites. N1 should plan against 122 and say so in its report rather than quietly meeting a
number that no longer describes the repo.

Per file (35 files):

| n | File |
|---|---|
| 22 | `Features/Home/Views/DailyRoomView.swift` |
| 15 | `App/Coordinators/AppCoordinator.swift` |
| 7 | `Features/Rooms/Views/RoomProjectView.swift` |
| 5 | `App/DeepLinking/DeepLinkHandler.swift` |
| 4 | `Features/Recommendations/Views/RecommendationsView.swift` |
| 4 | `Features/Notifications/Views/NotificationFeedView.swift` |
| 4 | `Features/Messaging/Views/ThreadListView.swift` |
| 4 | `Features/Collections/Views/CollectionsView.swift` |
| 4 | `Features/Budget/BudgetView.swift` |
| 3 | `Features/Proposals/Views/ProposalListView.swift` |
| 3 | `Features/Projects/Views/ProjectListView.swift` |
| 3 | `Features/Projects/Views/ProjectDetailView.swift` |
| 3 | `Features/Invoices/Views/InvoiceListView.swift` |
| 3 | `Features/FirstLaunch/Views/OnboardingFlowHost.swift` |
| 3 | `Features/DesignServices/DesignRequestStatusView.swift` |
| 3 | `Features/Decisions/Views/DecisionListView.swift` |
| 3 | `Features/Decisions/Views/DecisionDetailView.swift` |
| 3 | `Features/Companion/Views/CompanionOverlay.swift` |
| 2 | `Features/RoomScan/Views/QuietConversationFlowHost.swift` |
| 2 | `Features/Rooms/Views/YourSpacesView.swift` |
| 2 | `Features/Rooms/Views/NewRoomSheet.swift` |
| 2 | `Features/Rooms/Views/CrossRoomView.swift` |
| 2 | `Features/Profile/Views/ProfileView.swift` |
| 2 | `Features/Home/Views/DailyGreetingHeader.swift` |
| 2 | `Features/Documents/DocumentListView.swift` |
| 2 | `Features/DesignServices/MatchIntroductionView.swift` |
| 2 | `App/AppDelegate.swift` |
| 1 | `Features/StyleQuiz/Views/StyleResultView.swift` |
| 1 | `Features/StyleQuiz/Views/StyleQuizView.swift` |
| 1 | `Features/Rooms/Views/RoomSettingsView.swift` |
| 1 | `Features/Projects/Views/ProjectMessageDesignerLink.swift` |
| 1 | `Features/Profile/Views/StudioHubView.swift` |
| 1 | `Features/Invoices/Views/InvoiceDetailView.swift` |
| 1 | `Features/Decisions/DecisionPushHandler.swift` |
| 1 | `ContentView.swift` |

⚠ **Only 17 of these 35 files are in N1's owned set.** The other 18 belong to N2, N3, or to no W3
lane at all. If routing through the table requires editing a call site N1 does not own, it goes in
`waves/w3/n1-notes.md` as an integration note for the owner — the W1b/W2 rule, unchanged.
**Most sites should need no edit**: if `navigate(to:)` keeps its signature and the coordinator
resolves the tab internally from the table, the 122 sites are untouched. Prefer that shape.

---

## 3. Every `presentedSheet` site — 29 references, 6 sheet cases

`AppCoordinator.PresentedSheet` is defined at `AppCoordinator.swift:617-646`:
`.settings` · `.qr` · `.auth` · `.designServices(roomId:preselectedScanIds:)` · `.newRoom` ·
`.moveItem(itemId:)`. Presented by **one** driver — `ContentView.swift:85-90`
`.sheet(item: Binding(get:set:))` → `sheetContent(for:)` at `:99-131`.

| File:line | What it does |
|---|---|
| `App/Coordinators/AppCoordinator.swift:61` | `public var presentedSheet: PresentedSheet?` — the storage |
| `App/Coordinators/AppCoordinator.swift:201` | cleared on a phase change |
| `App/Coordinators/AppCoordinator.swift:323` | `= .designServices(...)` in `presentDesignServices` |
| `App/Coordinators/AppCoordinator.swift:524` | `= .qr` (intent) |
| `App/Coordinators/AppCoordinator.swift:528` | `= .settings` (intent) |
| `ContentView.swift:84` | comment |
| `ContentView.swift:86-87` | the one sheet binding (get / set) |
| `ContentView.swift:117` | `= nil` — design-request `onClose` |
| `App/DeepLinking/DeepLinkHandler.swift:170` | `= .qr` from an auth URL |
| `Features/Settings/Views/SettingsView.swift:75` | `= .qr` |
| `Features/Settings/Views/SettingsView.swift:212, 228` | `= nil` |
| `Features/Account/AccountView.swift:66` | comment |
| `Features/Account/AccountView.swift:68, 96` | `= nil` |
| `Features/Account/AccountView.swift:165` | `= .qr` |
| `Features/Profile/Views/StudioHubView.swift:132` | `= .settings` |
| `Features/Profile/Views/ProfileView.swift:157` | `= .settings` |
| `Features/QRAuth/Views/QRScannerView.swift:96-97` | reads `== .qr`, then `= nil` |
| `Features/Rooms/Views/CrossRoomView.swift:173` | `= .moveItem(itemId:)` |
| `Features/Rooms/Views/RoomProjectView.swift:352` | `= .moveItem(itemId:)` |
| `Features/Rooms/Views/YourSpacesView.swift:141, 190` | `= .newRoom` |
| `Features/Notifications/Views/NotificationFeedView.swift:195` | `= .auth` |
| `Features/Companion/Views/CompanionOverlay.swift:575, 577, 579` | `= .qr` / `.settings` / `.auth` |

**Why this matters to N1:** the sheet driver hangs off the **outer `ZStack`** in `ContentView.body`,
*above* the phase switch — not off the `NavigationStack`. It is already tab-agnostic and should stay
exactly where it is: one driver above all four stacks. Moving it inside a tab root would make
`.settings` from the Companion (`CompanionOverlay.swift:577`) present on whichever tab happens to be
selected, and dismiss on a tab switch. **Leave it above the tab container.**

---

## 4. Deep-link and push entry points

Four doors, all funnelling into `coordinator.navigate(to:)`. Every one needs a tab decision.

**a. `PatinaApp.swift` — the two wiring points.**
`.onOpenURL { DeepLinkHandler.shared.handle($0) }` and
`.onAppear { DeepLinkHandler.shared.configure(coordinator: coordinator) }`.

**b. `App/DeepLinking/DeepLinkHandler.swift`** (singleton, `configure(coordinator:)` at `:35`):
- `:35-40` `configure` **replays a queued route** — a link that arrives before the coordinator
  exists is held and fired on configure. ⚠ Under a tab root this replay must select a tab too;
  it is the easiest of the four to miss.
- `:46-49` `navigate(to:)` — the push path's entry (called by `AppDelegate`).
- `:60-110` `handle(_ url:) -> Bool` — universal links (`https`) first, then the custom scheme
  (`APIConfiguration.appURLScheme`) by host: `auth` (`:92`), `room` (`:95`), `piece` (`:98`).
- `:180-190` `handleRoomURL` → `.roomProject(roomId:)` → **Spaces**
- `:194-201` `handlePieceURL` → `.pieceDetail(pieceId:)` → **Pieces**
- `:112-176` `handleAuthURL` → sets `presentedSheet = .qr` at `:170` (no tab)
- `:211-238` `static route(forUniversalLink:)` — `https` + host `PatinaDeepLinks.clientHost` only:
  `piece`/`pieces` → **Pieces**; `invoices`/`invoice`, `proposals`/`proposal`,
  `decisions`/`decision` → **Studio**
- `:240` `handlePathBasedURL`

**c. `App/DeepLinking/NotificationRouter.swift`** — pure mapping, no navigation of its own:
- `:38` `resolve(apnsUserInfo:) -> (AppRoute?, String?)`
- `:51` `route(for: AppNotification) -> AppRoute?`
- `:60-88` `route(forEntityType:entityId:)`, switching on a **lower-cased** entity type:
  `project` → **Studio** · `proposal` → **Studio** · `decision` → **Studio** · `invoice` →
  **Studio** · `design_request` / `lead` → **Studio** · `thread` / `message_thread` → **Studio** ·
  `room` → **Spaces** · `product` / `piece` → **Pieces**

**d. `App/AppDelegate.swift:109-117`** — the APNs tap:
`NotificationRouter.resolve(apnsUserInfo:)` → `DeepLinkHandler.shared.navigate(to: resolved)`.
Plus `Features/Decisions/DecisionPushHandler.swift` (1 site).

**Consequence:** every push and every universal link lands in **Studio** or **Pieces** or **Spaces**
— never Today. Whatever tab was selected must switch, and the pushed route must land on *that tab's*
stack, not the visible one. This is the single highest-risk seam in N1.

---

## 5. Current root composition, and the 120 pt inset

**`PatinaApp.swift`** (at `Patina/PatinaApp.swift` — **the target root, NOT under `App/`**):
`init()` runs `PatinaFonts.registerAll()` → `AppCoordinator()` → `RoomScanSyncService.configure` →
`PostHogService.shared.initialize()` (skipped under `--uitesting`) → **`FeatureFlags.shared.resolveAtLaunch()`**.
`body` mounts `ContentView()` with `.environment(\.appCoordinator, coordinator)` + `.onOpenURL` +
`.onAppear(configure)` + the launch `.task` + the `scenePhase` observer.

**`ContentView.swift`** — outer `ZStack` → `switch coordinator.phase`:
`.launching` `SplashView` · `.auth` `AuthScreenView` · `.onboarding` `OnboardingFlowHost` ·
`.main` `mainContent`. The single `.sheet(item:)` driver and the
`.onChange(of: coordinator.currentScreen)` context-memory hook hang off that outer ZStack (§3).

**`mainContent` (`:133-181`) — the thing N1 replaces on the flag-on branch:**

```
ZStack {
    PatinaColors.Background.primary.ignoresSafeArea()
    NavigationStack(path: Binding(get/set coordinator.navigationPath)) {
        mainHomeView                                   // → DailyRoomView()
            .navigationDestination(for: AppRoute.self) { destinationView(for: $0) }
            .interactivePopGestureEnabled()            // R04 edge-swipe-back
    }
    .companionHearthReservation(isActive: reservesRootCompanionHearth)   // ← :166, THE 120 pt INSET
    .accessibilityHidden(coordinator.isCompanionExpanded)
    CompanionOverlay()
}
```

**ONE `NavigationStack` over ONE `NavigationPath`.** N1 makes it four. `destinationView(for:)`
(`:190-...`) dispatches to four grouped builders — `roomsDestination`, `discoveryDestination`,
`styleDestination`, `workCoreDestination`, `workDocumentsDestination` — which already group the
routes *almost* along the tab lines and are the natural seed for the four stacks' destinations.

**`AppCoordinator`** (`App/Coordinators/AppCoordinator.swift`) holds the whole nav model:
`navigationPath` (`:26`, with a `didSet` that trims the mirror on pop), `screenStack` (`:46`,
private), `rootScreen` (`:50`, private), `currentScreen` (`:69`), `isCompanionExpanded` (`:53`),
`presentedSheet` (`:61`). `navigate(to:)` (`:265-311`) does the SP-07 design-help guard, sets
`currentScreen`, calls `trackScreen`, then splits: `.heroFrame` **resets the root**
(`rootScreen = route; screenStack = []; navigationPath = NavigationPath()`), everything else
`push(route)`. `setCurrentScreen(_:)` (`:353`) is called by root views' `.onAppear` and re-syncs
`rootScreen` when the path is empty. `goBack()` (`:384`) pops. `handleIntent(_:)` (`:479`) and
`handleIntentWithResponse(_:)` (`:564`) are the Companion's routing door — **C8 says `handleIntent`
is unchanged**; N1 must make the tab layer satisfy it, not edit it.

⚠ **`navigationPath` / `screenStack` / `rootScreen` are a single-stack model.** Four stacks means
four paths. This is the refactor, and `AppCoordinator` is N1's file — but `handleIntent`'s behaviour
is N3's contract and `setCurrentScreen`'s `.onAppear` callers are spread across N2's roots.

**The 120 pt inset — exactly where it is applied:**
`Design/Components/CompanionSafeArea.swift` defines
`CompanionHearthMetrics.reservedHeight = collapsedDiameter 64 + hintAllowance 36 + verticalSpacing 20 = 120`,
and `extension View.companionHearthReservation(isActive:)` applies it as
`safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: reservedHeight) }`.
`companionSafeArea()` is a source-compatible alias.

**It is applied in exactly one production place: `ContentView.swift:166`**, on the `NavigationStack`,
gated by `reservesRootCompanionHearth` → `CompanionHearthMetrics.reservesRootHearth(for:)` which
returns `false` for `.scanFlow` and `.styleQuiz`. Retiring it on the flag-on root is therefore a
**one-line deletion in a file N1 owns** — B-2's "the 83 pt bar replaces the 120 pt hearth".

Three other consumers of the metrics must NOT be broken (the type stays; only the root's
`safeAreaInset` goes on the flag-on branch):

| Site | Uses |
|---|---|
| `Features/Money/MoneyScreenChrome.swift:33` | `bottomClearance = CompanionHearthMetrics.dockHeight + 8` — dockHeight is **140** (64+4+44+28), 20 pt more than `reservedHeight`; W1b's real fix |
| `Features/Companion/Views/CompanionOverlay.swift:140-141` | `yieldsToPinnedFooter(for:)` → `.minimal` on invoice/proposal/decision detail |
| `CompanionSafeArea.swift:50-58` | `reservesRootHearth(for:)` — the scan/quiz exemption |

⚠ Under the tab bar these three become **wrong, not just unused**: the money screens' 148 pt bottom
clearance is sized to a dock that no longer draws, and `yieldsToPinnedFooter` yields an orb that is
now a fixed bar slot. N1 owns `CompanionSafeArea.swift`; `MoneyScreenChrome.swift` and
`CompanionOverlay.swift` are **not** in any N-lane's owned set — see §7·C.

**`FeatureFlags`** (`Core/State/FeatureFlags.swift`, read-only for N1): `FeatureFlags.shared.isOn(.houseFirst)`.
Resolution is **synchronous** from PostHog's *persisted* payload — so **the first launch after a
fresh install resolves every flag off**, by design and documented in the file's header. Local walks
must pass `-PatinaFlags house-first`; `--uitesting` forces all flags off unless that argument names
them, so **no XCUITest can reach the flag-on root without the launch argument**.
Read `isOn(.houseFirst)` **once**, before the root mounts, and hold it — never re-read per body
evaluation.

---

## 6. Owned-file map

A lane needing a change in another lane's file writes it into `waves/w3/<lane>-notes.md`; the owner
applies it. Same rule as W1b/W2.

### N1 — root + routing (Opus xhigh)
- `apps/mobile/Patina/Patina/App/**` — `AppDelegate.swift`, `Coordinators/{AppCoordinator,Coordinator}.swift`, `DeepLinking/{DeepLinkHandler,NotificationRouter}.swift`, `Configuration/**`
- `apps/mobile/Patina/Patina/ContentView.swift`
- **`apps/mobile/Patina/Patina/PatinaApp.swift`** — ⚠ **added by the steward.** It is at the target
  root, *not* under `App/`, so "App/\*\*" does not cover it; the flag-on/flag-off root choice
  happens in it. N1 cannot do its job without it.
- `apps/mobile/Patina/Patina/Design/Components/CompanionSafeArea.swift`
- `apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift` — **READ-ONLY**
- **new** `apps/mobile/Patina/Patina/Features/Navigation/**` — `PatinaTabBar`, `TabRoot`,
  `RouteTabTable` (confirmed: `Features/Navigation/` does not exist yet)
- its tests under `apps/mobile/Patina/PatinaTests/**`

### N2 — Pieces + Saved + the tab roots
- `apps/mobile/Patina/Patina/Features/Recommendations/**`
- `apps/mobile/Patina/Patina/Features/Collections/**`
- `apps/mobile/Patina/Patina/Features/Rooms/Views/YourSpacesView.swift` — **tab-root wrapper only**
- `apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift` — **tab-root wrapper only**
- its tests

### N3 — Companion + tour
- `apps/mobile/Patina/Patina/Features/Companion/**`
- `apps/mobile/Patina/Patina/Features/FirstLaunch/**`
- `apps/mobile/Patina/PatinaTests/FirstLaunchTourTests.swift`
- **`apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift`** — ⚠ **added by the steward.**
  See §7·D: the tour the brief assigns N3 does **not** live in `Features/FirstLaunch/`.
- its tests

All ten pre-existing paths verified present at the base sha. `Features/Navigation/` verified absent.

---

## 7. Open questions and traps — read before writing the task list

**A · Two routes the tab rule does not settle cleanly.**
`roomEmergence(roomId:)` is *browse, scoped to a room*, reached from a room in the Spaces stack
(SP-11's "Browse pieces for the Living Room"). The literal rule ("emergence → Pieces") would throw
the user across tabs mid-flow and strand the room they came from behind a tab switch.
`roomSavedItems(roomId:)` has the mirror problem — a Rooms-shaped route that mounts
`CollectionsView`, a Pieces surface. **Steward's recommendation:** both stay in **Spaces** when
pushed from a room, on the "a push never changes tabs; only a deep link, a push notification, or a
tab tap does" rule. The table above records the brief's literal assignment for `roomEmergence`
(Pieces) — N1 should raise this and take a ruling rather than choose silently.

**B · `notifications` has two doors.** The bell lives in the Today header
(`DailyGreetingHeader.swift`), but the route maps to Studio. If tapping the bell jumps tabs, Today's
header sends you away from Today. Either the bell pushes onto the **Today** stack (recommended) or
Today gets a visible tab change. Needs a decision, not a default.

**C · Two Companion-geometry files are unowned.** `Features/Money/MoneyScreenChrome.swift:33` and
`Features/Companion/Views/CompanionOverlay.swift:140-141` both size themselves to the dock that B-2
retires. `CompanionOverlay.swift` is N3's (`Features/Companion/**`); **`MoneyScreenChrome.swift` is
in no W3 lane's set.** Its `bottomClearance` must become flag-aware or the money screens keep 148 pt
of dead space under the tab bar. Assign it, or accept the dead space and say so.

**D · The tour is not where the brief says it is.** `FirstLaunchTour.swift` — the step list, the
`FirstLaunchTourAnchor` enum, the `firstLaunchTourAnchor(_:)` modifier — lives in
**`Features/Help/`**, not `Features/FirstLaunch/` (which holds only the onboarding flow host,
coordinators, and metrics). Added to N3's map above.

**E · Tour step 2 is already unmountable — B-8 does not mention it.** B-8 rewrites steps 1 and 3.
But step 2's anchor is `.addToRoom` (`FirstLaunchTour.swift:239-245`), and W2 R3 retired
`DailyProductCard`. At the base sha the **only** `.firstLaunchTourAnchor(.addToRoom)` in the tree is
in a `#if DEBUG` `#Preview` (`FirstLaunchTour.swift:852`) — **no production view mounts it.** The
tour's drop-an-unmountable-step path will silently reduce the tour to two steps on both roots.
`FirstLaunchTourTests:642` pins `steps.map(\.anchor) == [.homeGreeting, .addToRoom, .profileMonogram]`.
N3 must either re-anchor step 2 or cut it — and either way it is a **third** ratified-copy change
beyond B-8's two. Surface to Fable for a ruling.

**F · Step 3's anchor already moved once.** `.profileMonogram` is no longer on a monogram: W2
re-pointed it at the Studio control in `DailyGreetingHeader.swift:124`. B-8 re-points step 3 at the
**Studio tab**. So on the flag-on root the anchor belongs on the tab bar (N1's file) while on the
flag-off root it must stay on the header control (`Features/Home/**`, unowned by any W3 lane). The
anchor is a raw-value string (`"profile-monogram"`, pinned by `FirstLaunchTourTests:747`) — renaming
it breaks the pinned test and the Sanity surface key. **Recommendation: keep the raw value, change
only the mount site.**

**G · The byte-for-byte flag-off obligation.** W2's Record is unflagged and must render identically
with the flag off. The acceptance line is "flag off restores the W2 root byte-for-byte", so the
flag-off branch must keep: the single `NavigationStack`, `companionHearthReservation` at
`ContentView.swift:166`, `CompanionOverlay()`, and `DailyRoomView()` as `mainHomeView`.
Practically: **add a second root beside the existing one; do not refactor the existing one.**
The cheapest proof is a screenshot diff of the flag-off root against a `main` build on the same
simulator — worth doing before N1 reports.

**H · 122 ≠ 105** (§2) — say so in the report rather than meeting a stale number.

---

## 8. Steward's gate reservations

`ios-gate.sh lint-delta` and `ios-gate.sh all` are **steward-only, on the integration branch** —
`lint-delta` adds temp worktrees to the shared `.git` and `all` grabs the first iPhone simulator it
finds, which would steal the walker's review device. Each lane runs `ios-gate.sh build` plus
`xcodebuild test -only-testing:PatinaTests -destination id=<its own clone>` in the **foreground**.
N1's destination id is **`3D350836-BAF9-443A-8598-588D8D4AEBF6`**.

No migrations are expected in W3 (`ls supabase/migrations | tail` head is `00538`; W5's 00539 is
still free). If a lane mints one, re-check the tip immediately before merge.
