# W3-fix · role F — task list for `rulings-fable.md` 1, 2, 3, 4, 6, 7

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-integration`, branch
`daily-return/integration`, base `ccf1031f7`. Simulator `A71FDDF2-D0F6-442F-9E21-B77604013F02`
(`dr-w3-int`), `-derivedDataPath .build/dd`. Written before any code. One task per ruling, one
Conventional Commit per task, pathspec staging only, no push. Format per lane: failing test → run →
implement → run → pathspec commit.

Ruling 5 (Sanity bodies) is Kody's content op and is NOT in this list. Rulings 8, 9, 10 are backlog,
W4 and harness-note respectively.

---

## Task 1 — R1: hoist the tour above the four stacks

**The deviation.** `FirstLaunchTour` builds its model in `@State` inside `DailyRoomView` and
publishes it to that subtree only. On the house-first root the bar is a *sibling* of that subtree
(`HouseFirstRoot` mounts both), so a step-3 popover can never reach the Studio tab — which is why
W3 shipped the header's `Studio` pill beside the bar's Studio tab rather than kill B-8's step 3
(`integration.md` §6a).

**Exit 1, as ruled.** One tour model per root.

| File | Change |
|---|---|
| `Features/Navigation/HouseFirstRoot.swift` | `body` wraps the root content in `FirstLaunchTour(canAutoStart:)`. The bar is inside that wrapper, so the model reaches it. |
| `Features/Navigation/PatinaTabBar.swift` | the `.studio` arm of `item(_:)` takes `.firstLaunchTourAnchor(.profileMonogram)` — raw value unchanged (`profile-monogram`; it keys the Sanity document, steward §7·F) |
| `Features/Home/Views/DailyGreetingHeader.swift` | new `showsStudioControl: Bool = true`; the pill **and its anchor** draw only when it is true |
| `Features/Home/Views/DailyRoomView.swift` | passes `showsStudioControl: !coordinator.isHouseFirstRoot`; hosts `FirstLaunchTour` only on the flag-off root (the flag-on root's host is `HouseFirstRoot`) |

The anchor moves with the control, not separately: on the flag-off root the door is the header
pill, on the flag-on root it is the bar. Two mount sites, mutually exclusive by root.

**Tests (`PatinaTests/`)**

- `FirstLaunchTourTests.everyDefaultStepAnchorHasExactlyOneProductionMount` — becomes a mount **map**:
  `.homeGreeting` → `DailyGreetingHeader.swift` ×1, `.todayRecord` → `DailyRoomView.swift` ×1,
  `.profileMonogram` → `PatinaTabBar.swift` ×1 **and** `DailyGreetingHeader.swift` ×1, nowhere else.
  Stronger than the old bare count: it names the file each mount is allowed to live in.
- `FirstLaunchTourTests.theTourIsGatedByTheSameFlagAsTheRootItDescribes` — re-pinned to the new
  shape: `DailyRoomView` branches on `coordinator.isHouseFirstRoot`, `HouseFirstRoot` is the
  flag-on host, no live `FeatureFlags.shared.isOn(.houseFirst)` in either view.
- `HouseFirstRootTests.theStepThreeAnchorIsOnTheBarAndTheHeaderPillIsGone` (new) — source pins:
  `PatinaTabBar.swift` carries `.firstLaunchTourAnchor(.profileMonogram)` on the `.studio` arm;
  `DailyRoomView.swift` passes `showsStudioControl: !coordinator.isHouseFirstRoot`.
- `HouseFirstRootTests.theFlagOffRootStillCarriesTheW2Shape` — unchanged, still green:
  `legacyMainContent` is not touched.
- `HomeHeaderTests` — a case for each value of `showsStudioControl`.

**Commit** `fix(ios): the first-launch tour is hoisted above the four stacks`
pathspecs: the four sources + `PatinaTests/{FirstLaunchTourTests,HouseFirstRootTests,HomeHeaderTests}.swift`

---

## Task 2 — R2: mint `AppRoute.studio`

**The deviation.** `RouteTabTable.rootRoute(for: .studio) == .profile`, so every Studio visit
reports the PostHog screen `Profile` and hands the Companion Profile's rows, while "Your Studio" is
on glass — and `ProfileView` (Settings → Sign Out, Delete Account) is unreachable on the flag-on
root (`integration.md` §7.2, walk item).

**The route, and the five exhaustive switches.**

| File | Arm |
|---|---|
| `App/Coordinators/Coordinator.swift` | `case studio`; `displayName` → `"Your Studio"` (so `analyticsScreenName` falls out of it) |
| `Features/Navigation/RouteTabTable.swift` | `tab(for: .studio) = .studio`; `rootRoute(for: .studio) = .studio` |
| `ContentView.swift` + `Features/Navigation/HouseFirstRoot.swift` | `.studio` joins `workCoreDestination`, **verbatim in both** (`theTwoRootsDispatchTheSameDestinations` compares the six bodies) |
| `App/Coordinators/AppCoordinator.swift` | the push list in `navigate(to:)`, the clear list in `updateContext(for:)` |
| `Features/Companion/Models/CompanionContext.swift` | `contextSummary`, `contextIcon` |
| `Features/Companion/Services/CompanionContextProvider.swift` | `screenItems` → `studioItems`; `panelTitle` chain |
| `Features/Companion/Services/CompanionAreaBuilders.swift` | `studioItems` gains a `.studio` arm — **the Studio rows**: decisions, messages, proposals, budget. Four, plus the provider's two-row tail = 6, C8's cap exactly. |
| `Features/Companion/ViewModels/CompanionViewModel.swift`, `Services/Companion/CompanionAPIClient.swift` | `screenIdentifier` → `"studio"` |

**The screen.** `StudioTabRoot` renders `ProfileView()` — the identity line, the Studio hub, and
the Settings/Account door, exactly what the monogram opens on the flag-off root — under
`.tabRoot(.studio)`, so it draws no back chevron and carries the canonical title. `ProfileView`
prints that title when it is a tab root (it hides the system bar, so `navigationTitle` alone does
not draw) and is unchanged everywhere else. `ProfileView` remains `.profile`'s destination.

**Tests**

- `RouteAnalyticsParityTests.stableRouteScreenNamesAreUnchanged` — `(.studio, "Your Studio")`.
- `HouseFirstRootTests.theStudioTabReportsProfileUntilAStudioRouteIsMinted` → renamed
  `theStudioTabReportsItsOwnScreen`: `rootRoute(for: .studio) == .studio`, `currentScreen == .studio`,
  companion context `.studio`, `analyticsScreenName == "Your Studio" == PatinaTab.studio.canonicalName`.
- `HouseFirstRootTests.settingsAndAccountAreOneTapFromTheStudioTab` (new) — source pin: the Studio
  tab root is `ProfileView`, `ProfileView` presents `.settings`, and `SettingsView` reaches
  `AccountView` (which carries Sign Out and Delete Account).
- `RouteTabTableTests` — `.studio` row, counts 35/17, `eachTabNamesItsRootRoute`.
- `TabRootTitleTests.theStudioWrapperSuppliesTheScrollViewTheHubDoesNotHave` → re-pinned to the
  profile composition.
- `CompanionActionMatrixTests.allRoutes` — `.studio` added; the ≤6, ≤1-suggested, HOME-tail and
  QR-only-on-Profile invariants then cover it automatically.

**Commit** `feat(ios): the Studio tab gets a route of its own`

---

## Task 3 — R3: one owner for the money screens' bottom clearance

`MoneyScreenMetrics.bottomClearance` is `dockHeight + 8` — sized to a dock the bar replaces, so on
the flag-on root every money screen carries ~148 pt of dead space *plus* the bar
(`shots/w3-n1-07-money-footer-under-bar.png`).

| File | Change |
|---|---|
| `Features/Money/MoneyScreenChrome.swift` | `static let bottomClearance` → `static func bottomClearance(houseFirst: Bool)`, over `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` |
| the eight call sites — `InvoiceDetailView`, `InvoiceListView`, `ProposalDetailView`, `ProposalListView`, `DecisionDetailView`, `DecisionListView`, `ProjectDetailView`, `BudgetView` | read it with the live flag (`coordinator.isHouseFirstRoot`); `ProposalDetailView` and `ProjectDetailView` gain the `@Environment(\.appCoordinator)` they lack |
| `Features/ProductDetail/Views/ProductDetailView.swift` | the pinned `Add to Room` capsule's hand-rolled `.padding(.bottom, 36)` reads the same seam |

⚠ `ProductDetailView`'s capsule is a **pinned footer**, not scroll content, and its flag-off value
must not regress the W2 piece screen (where the Companion is already `.minimal`). The exact number
is decided against the running app, from a flag-on and a flag-off shot, before this commit is
written — not from the source alone.

**Tests** — `MoneyAndStudioCopyTests` (`:238` and `:250`'s source pin, updated to the new spelling,
not silenced), `InvoicesMoneyRailTests:282`, `TopBandFoldTests:68`, plus a new pin: flag-on is
bar-relative (8), flag-off is W1b's constant (`dockHeight + 8`).

**Commit** `fix(ios): the money screens' bottom clearance answers to the bar`

---

## Task 4 — R4: the B-8 tour rewrite applies on both roots

N3's argument, ruled its way. The exact revert is recorded in `n3-fix-log.md`.

| File | Change |
|---|---|
| `Features/Help/FirstLaunchTour.swift` | delete `preHouseFirstSteps`; `.addToRoom` is retired from every step list (the enum case stays — its raw value is pinned and the DEBUG preview still uses it) |
| `Features/Home/Views/DailyRoomView.swift` | the flag-off host drops its `steps:` argument and takes `defaultSteps` like the flag-on one |

Step 2 anchors on `.todayRecord` on both roots — the mount on `HouseRecordCard` is already
unconditional (the record is unflagged, R1). Where the record draws nothing the step drops and the
tour renumbers by the existing mechanism.

**Tests** — the four `// MARK: - The flag-off root's tour` tests go with `preHouseFirstSteps`
(`theFlagOffRootKeepsTheTourItShipped`, `theTwoStepListsAreActuallyDifferentCopy`,
`theFlagOffTourKeepsTheStepThatNeverMounts`, `theRecordAnchorMountsOnceAndIsInertOnTheFlagOffRoot`);
`theTourIsGatedByTheSameFlagAsTheRootItDescribes` survives in its task-1 shape (the *host* is still
gated, the copy no longer is). New: `aGuestWithAnEmptyRecordSeesStepOneOfTwo` — the drop-and-
renumber, pinned at the caption the walker will read. `.addToRoom` keeps its raw-value pin and gains
one: it appears in no step list.

**Commit** `fix(ios): the rewritten first-launch tour speaks on both roots`

---

## Task 5 — R6: the tour's auto-start gate is tab-aware

`canAutoStart` on the flag-on root must be "Today is the tab on screen **and** its stack is empty";
today it asks only the second half, so the tour auto-started over the Pieces tab (`w3-n3-13`).

| File | Change |
|---|---|
| `Features/Navigation/TabNavigationModel.swift` | new `isShowingTodayRoot` — `selected == .today && stack(for: .today).isEmpty` |
| `Features/Navigation/HouseFirstRoot.swift` | `canAutoStart: coordinator.tabs.isShowingTodayRoot` |

The flag-off expression (`coordinator.navigationPath.isEmpty`, in `DailyRoomView`) is unchanged.

**Tests** — `TabNavigationModelTests.theTourGateIsClosedWhileAnotherTabIsOnScreen`: true at rest;
false after `select(.pieces)`; false with a route pushed on Today; true again after popping and
re-selecting Today. Plus a source pin that `HouseFirstRoot` reads the model rather than re-deriving
the expression.

**Commit** `fix(ios): the tour auto-starts only while Today is on screen`

---

## Task 6 — R7: the canon digest records the push rule

One line in `research/11-canon-digest.md` §6 (a research file in the **main checkout**, not a
tracked worktree file — written directly, not committed from here):

> a push never changes tabs; only a deep link, a push notification, or a tab tap does

with the route→tab table reference (`waves/w3/steward.md` §1, `RouteTabTable`), which is what files
`roomEmergence` and `roomSavedItems` under Spaces.

---

## Gate (unsandboxed, foreground)

1. `apps/mobile/Patina/scripts/ios-gate.sh build` — re-run once on a failure with no `error:` line
   (the shared DerivedData makes it flaky).
2. `xcodebuild test -only-testing:PatinaTests -destination id=A71FDDF2-D0F6-442F-9E21-B77604013F02`.
3. `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main`.
4. Signed rebuild (**no** `CODE_SIGNING_ALLOWED=NO`) → install on `A71FDDF2-…`.
5. Shots into `artifacts/ios-daily-return-2026-08-26/shots/w3-fix-NN-*.png`:
   - flag-on Studio tab → Settings → **Sign Out** visible (not tapped) and **Delete Account** present
   - flag-on fresh install (keychain reset + uninstall/install) → tour step 3's popover on the bar's
     Studio tab, and no header pill
   - flag-on invoice detail `Pay` footer and piece `Add to Room` capsule clear of the bar
   - flag-on: after onboarding pushes Pieces, the tour does not auto-start until Today is selected
   - flag-off: the W2 home unchanged against `shots/w3-13-flagoff-today-client-final.png`
6. `rmdir .writer.lock.d`.

---

## Outcome — what landed, and the one number the plan could not name in advance

`daily-return/integration` `ccf1031f7` → `a3fd05af9`, six commits, no push.

| Ruling | Commit | Note |
|---|---|---|
| R1 | `d34c83f6c` | tour hoisted into `HouseFirstRoot`; anchor on the bar's `.studio` arm; header pill gated by `showsStudioControl` |
| R2 | `d36ac92b2` | `AppRoute.studio`, ten arms, `StudioTabRoot` = `ProfileView` under the canonical title |
| R3 | `1bb8029e1` | `bottomClearance(houseFirst:)` over `pinnedFooterClearance(houseFirst:)`, nine views + the piece capsule |
| R4 | `f0b84f5f8` | `preHouseFirstSteps` deleted; one list on both roots; `.addToRoom` retired |
| R6 | `0a3462248` | `TabNavigationModel.isShowingTodayRoot` |
| R7 | — | `research/11-canon-digest.md` §6 gains **C23** (main checkout, uncommitted by this agent) |
| — | `a3fd05af9` | `StudioDoorTests` split out so `lint-delta main` stays green |

**The correction R3 needed, measured rather than assumed.** `pinnedFooterClearance(houseFirst: true)`
was `8`, which is only right if the bar reserves its own space. It does not: a `safeAreaInset` on the
stacks' container does not reach a `NavigationStack`'s **pushed** destinations. Proof, on
`dr-w3-int`, in points:

| | before | after |
|---|---|---|
| bar's row | 791–840 (49 pt over a 34 pt home indicator) | unchanged |
| piece `Add to Room`, flag-**on** | 754–804 — **13 pt under the bar** | 733–783 — **8 pt clear** |
| piece `Add to Room`, flag-**off** | 754–804 | 754–804 — unchanged |

The flag-off row is the tell: W2's own 120 pt Hearth reservation does not reach that screen either,
so this is pre-existing behaviour and is **not** re-plumbed here. The house-first clearance is
therefore `barRowHeight + 8` = 57, not 8, and `CompanionHearthMetrics.barRowHeight` is pinned equal
to `PatinaTabBar.itemHeight`.

**Owed to Kody's signed-in walk** (a guest session cannot reach either): the `Sign Out` and
`Delete account` rows are inside `if authService.isAuthenticated` in `AccountView` / `SettingsView`,
so the guest walk proves the *path* — Studio tab → Settings → Account, three taps — and not the rows;
and an invoice **detail** with a live `Pay` footer needs an invoice. The clearance those money
screens read is the same constant the piece capsule demonstrates on glass, and every call site is
source-pinned to read it with the flag.
