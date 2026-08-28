# W3 · lane N1 — root + routing · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n1`, branch
`daily-return/w3-n1`, base `83b8c3340`. Simulator `3D350836-BAF9-443A-8598-588D8D4AEBF6`
(`dr-w3-n1`). Written before any code. Format per lane: failing test → run → implement → run →
pathspec commit.

---

## 0. PUBLISHED INTERFACES — frozen after task 1's commit; N2/N3 consume these

```swift
// Features/Navigation/PatinaTab.swift
public enum PatinaTab: String, CaseIterable, Hashable, Sendable, Identifiable {
    case today, spaces, pieces, studio
    public var id: String { rawValue }
    /// B-7 (a): the bar's label — possessive dropped.
    public var title: String            // "Today" · "Spaces" · "Pieces" · "Studio"
    /// C4: the destination's canonical name, in full. THE VoiceOver label.
    public var canonicalName: String    // "Today" · "Your Spaces" · "Browse pieces" · "Your Studio"
    public var systemImage: String      // published for N2/N3; the bar itself draws NO icons (M1 §6)
}

// Features/Navigation/RouteTabTable.swift
public struct RouteTabTable {
    /// Exhaustive over `AppRoute` — no `default:`, so a new case fails to compile here.
    public static func tab(for route: AppRoute) -> PatinaTab
    /// The route each tab's root stands for. Total, never nil.
    public static func rootRoute(for tab: PatinaTab) -> AppRoute
    /// True for the four routes that ARE a tab's root.
    public static func isTabRoot(_ route: AppRoute) -> Bool
}

// Features/Navigation/TabNavigationModel.swift
@MainActor @Observable
public final class TabNavigationModel {
    public var selected: PatinaTab
    /// Writable; a shorter write (edge-swipe / system back) trims the mirror stack.
    public var paths: [PatinaTab: NavigationPath]
    public init(selected: PatinaTab = .today)

    /// Selects the route's tab, then pushes onto that tab's stack.
    /// A tab-root route selects its tab and pops it to root instead.
    public func navigate(to route: AppRoute)
    public func popToRoot(_ tab: PatinaTab)

    // additions beyond the four frozen members
    /// In-tab push: stays on `selected`. A tab-root route still switches.
    public func push(_ route: AppRoute)
    /// Tab tap. Re-tapping the selected tab pops it to root.
    public func select(_ tab: PatinaTab)
    public func pop()
    /// Top of the selected tab's stack, else that tab's root route.
    public var visibleRoute: AppRoute { get }
    public func stack(for tab: PatinaTab) -> [AppRoute]
}

// Features/Navigation/PatinaTabBar.swift
public struct PatinaTabBar<Trailing: View>: View {
    public static var itemHeight: CGFloat { 49 }
    public static var barHeight: CGFloat { 83 }        // 49 + 34 home-indicator safe area
    public init(
        selected: PatinaTab,
        onSelect: @escaping (PatinaTab) -> Void,
        @ViewBuilder trailing: () -> Trailing
    )
}

// Features/Navigation/HouseFirstRoot.swift
public struct HouseFirstRoot: View { public init() }

// App/Coordinators/AppCoordinator.swift — additions
extension AppCoordinator {
    /// Resolved ONCE in `init` from `FeatureFlags.shared.isOn(.houseFirst)` and held.
    public private(set) var isHouseFirstRoot: Bool { get }
    public var tabs: TabNavigationModel { get }
    /// A deep link, a universal link, a push tap, or a post-re-auth restore.
    /// Lands on the route's OWN tab. On the flag-off root this is `navigate(to:)`.
    public func openExternal(_ route: AppRoute)
    /// Re-derives `currentScreen` after SwiftUI popped a tab stack itself.
    public func syncCurrentScreen(to route: AppRoute)
}
```

### The routing rule, stated once

- **An in-app `navigate(to:)` pushes onto the tab you are already on.** Back returns you where you
  were. This is what settles steward §7·A (a room's "Browse pieces for the Living Room" never
  leaves Spaces) and §7·B (Today's bell pushes the feed onto Today) *structurally* — not by a table
  entry.
- **A tab-root route** (`.heroFrame`, `.yourSpaces`, `.emergence(pieceId: nil)`, `.profile`)
  selects its tab and pops it to root, wherever it is called from. No duplicate doors.
- **`openExternal(_:)`** — deep link, universal link, APNs tap, re-auth restore — reads
  `RouteTabTable.tab(for:)` and lands on that tab's stack.
- The one `.sheet(item:)` driver stays on `ContentView`'s outer `ZStack`, above all four stacks
  (steward §3). Not moved, not duplicated.

---

## 1. `PatinaTab` + `RouteTabTable` + tests

Failing test first: `PatinaTests/RouteTabTableTests.swift`.

- every one of the 31 `AppRoute` cases named with its expected tab (steward §1's table)
- the four canonical names and the four B-7 labels pinned verbatim
- `isTabRoot` true for exactly the four root routes; false for `.emergence(pieceId: "x")`
- `SourcePin`: `tab(for:)`'s body contains no `default:` — a new case must fail to compile
- every `NotificationRouter.route(forEntityType:)` answer lands on Studio / Spaces / Pieces as
  steward §4·c states
- every `DeepLinkHandler.route(forUniversalLink:)` answer lands on Pieces or Studio

Then implement. Commit `feat(ios): the tab table — every AppRoute case names its tab`.

## 2. `TabNavigationModel` + tests

`PatinaTests/TabNavigationModelTests.swift`:

- `navigate(to:)` selects the route's tab and pushes there, from any starting tab
- `navigate(to:)` with a tab-root route selects and pops to root
- `push(_:)` keeps the selected tab; a tab-root route still switches
- `select(_:)` on the already-selected tab pops it to root; on another tab it just switches
- each tab keeps its own stack across switches (push Spaces → switch to Studio → switch back →
  the Spaces push is still there)
- a direct shorter write into `paths[tab]` (what an edge swipe does) trims the mirror, and
  `visibleRoute` follows it
- `visibleRoute` at root answers the tab's root route

Commit `feat(ios): four stacks under one root — TabNavigationModel`.

## 3. `PatinaTabBar` + `HouseFirstRoot`

- `PatinaTabBar`: four items, `Inter Medium 13` (`PatinaTypography.uiSmall`), active
  `Text.primary` / inactive `Text.muted`, `pearl` 1 pt top hairline, background
  `Background.primary` bleeding through the bottom safe area, a 54 pt trailing slot. Hand-rolled
  semantics: the row is `.accessibilityElement(children: .contain)` with `.isTabBar`; each item is
  a `Button` carrying `.accessibilityLabel(tab.canonicalName)` and `.isSelected` when selected.
  No icons (M1 §6).
- `HouseFirstRoot`: four `NavigationStack`s over `coordinator.tabs.paths`, each with
  `.navigationDestination(for: AppRoute.self)` and `.interactivePopGestureEnabled()`; roots
  `DailyRoomView` · `YourSpacesView` · `RecommendationsView` · `StudioHubView`; the bar as a
  bottom `safeAreaInset`; `CompanionOverlay()` above; `.accessibilityHidden` on expand;
  `.onChange(of: coordinator.tabs.visibleRoute)` → `coordinator.syncCurrentScreen(to:)`.
  Trailing slot = the existing collapsed Companion mark (`CompanionMarkView`), a button on
  `coordinator.toggleCompanion()`, VoiceOver label `Companion`.
- **No** `.companionHearthReservation` on this root — B-2's retirement.

Commit `feat(ios): the house-first root — four stacks under the bar`.

## 4. Coordinator + the root choice + deep links

- `AppCoordinator`: `isHouseFirstRoot` (read once in `init`), `tabs`, `openExternal(_:)`,
  `syncCurrentScreen(to:)`; `navigate(to:)` and `goBack()` branch on the flag; the whole flag-off
  body is untouched.
- `PatinaApp.init()`: `FeatureFlags.shared.resolveAtLaunch()` moves ABOVE `AppCoordinator()` (it
  is the coordinator that now reads the flag). `PostHogService.initialize()` moves with it so the
  PostHog branch still has a source.
- `ContentView`: `mainContent` picks `HouseFirstRoot()` or the existing root from
  `coordinator.isHouseFirstRoot`. The existing root's body is moved verbatim into
  `legacyMainContent`, character for character.
- `DeepLinkHandler`: its five `coordinator.navigate(to:)` sites become `openExternal(_:)` —
  `configure`'s replay, `navigate(to:)` (the APNs door), the universal-link branch, room, piece.
  `AppDelegate` and `DecisionPushHandler` reach it through `DeepLinkHandler.shared.navigate(to:)`
  and need no edit.
- `AppCoordinator.recomputePhase`'s `pendingReturnRoute` restore becomes `openExternal`.
- `CompanionSafeArea`: `reservesRootHearth(for:)` and `yieldsToPinnedFooter(for:)` answer the
  retired value on the flag-on root, the W1b value on the flag-off root; add
  `pinnedFooterClearance` for `MoneyScreenChrome`'s owner (NOT edited here — unowned file).

Tests `PatinaTests/HouseFirstRootTests.swift`:

- root selection: flag on → `isHouseFirstRoot`; flag off → not; the value is held when the flag
  flips underneath
- an in-app `navigate(to:)` from Today keeps Today and pushes there
- `openExternal(.invoiceDetail)` from Today lands on Studio with the invoice pushed
- `openExternal` for every `NotificationRouter` entity type lands on the steward §4·c tab
- `goBack()` pops the selected tab only
- `SourcePin`: `ContentView.swift` + `HouseFirstRoot.swift` are the only files binding a root
  navigation path; every `navigate(to:` receiver in the app is the coordinator or
  `DeepLinkHandler`; `PatinaApp.init` resolves flags before it constructs `AppCoordinator`
- `SourcePin`: the flag-off branch still carries `companionHearthReservation` and `DailyRoomView()`

Commit `feat(ios): the root is chosen once — house-first behind the flag`.

## 5. Gate, sim check, notes

`ios-gate.sh build` (twice if the Git-SHA phase fails without an `error:` line), then
`xcodebuild test -only-testing:PatinaTests -destination id=3D350836-…` — the whole tier green.
Signed `.app`. Sim check on the clone: flag-on at three tiers (`client@patina.dev`,
`james.okafor@example.com`, guest — `password123`), each tab one tap to its canonical
destination; a universal link onto Studio; then flag-off compared against `shots/w2-*.png`.
Shots `shots/w3-n1-NN-*.png`, ledger rows under `## w3-n1`, `waves/w3/n1-notes.md` for the
cross-lane items.

---

## Deviations and rulings taken — carried into the report

1. **122 `navigate(to:)` sites, not 105** (steward §2·H). All 122 reach the coordinator or
   `DeepLinkHandler`; **none is edited** — the coordinator resolves the tab internally.
2. **No new `AppRoute` case.** "Your Studio" has no route of its own. Adding one breaks five
   exhaustive switches in `Features/Companion/**` (`CompanionContext.contextSummary`,
   `.contextIcon`, `CompanionContextProvider.screenItems` — "deliberately no `default:`",
   `CompanionViewModel.screenIdentifier`) and `Services/Companion/CompanionAPIClient.swift` —
   the files C8 freezes and N3 owns. The Studio tab's root route is therefore **`.profile`**,
   whose screen already hosts `StudioHubView` (`ProfileView.swift:123`).
3. **Consequence of 2:** on the flag-on root `ProfileView` is unreachable — the Studio tab's root
   view is `StudioHubView` (acceptance: "Studio one tap"). A Profile door inside the hub is
   **N2's** (`n1-notes.md` §1). Settings is unaffected (`StudioHubView.swift:132`).
4. **Steward §7·A ruling taken:** `roomEmergence` → **Spaces**, not the brief's literal Pieces,
   matching its sibling `roomSavedItems`. Inert either way — the in-tab push rule means neither is
   ever reached by a tab-switching entry, and neither is deep-linkable.
5. **Steward §7·C:** `MoneyScreenChrome.swift` is in no lane's set and is **not edited**;
   `CompanionHearthMetrics.pinnedFooterClearance` is provided for whoever takes it.
6. **Interim:** `CompanionOverlay()` is still mounted on the flag-on root, so its resting mark
   floats above the bar alongside the bar's own trailing mark until N3 retires the dock
   (`n1-notes.md` §2).
