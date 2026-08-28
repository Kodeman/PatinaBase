# W3 · lane N1 — notes for the other lanes and the steward

Written by N1 after its gate, 2026-08-27. Branch `daily-return/w3-n1` @ `4a92058b5`.
Everything below is something N1 found but does **not** own. Nothing here was edited by N1.

---

## 1. For N2 — `Features/Recommendations/**`, `Features/Collections/**`, `YourSpacesView`, `StudioHubView`

**1a. `ProfileView` has no door on the house-first root, and needs one from you.**
The Studio tab's root *view* is `StudioHubView` (per the plan), and its root *route* is `.profile`
(see §4 for why). A tab-root route selects its tab and pops it to root, so on the flag-on root
`navigate(to: .profile)` opens the **Studio tab**, and `ProfileView` — the style badge, the stats
row, `YOUR ROOMS`, the settings entry — is not reachable at all. M1 says *"the monogram is gone —
Profile lives in the Studio tab"*, so the door belongs inside the hub: a labelled row in
`StudioHubView`'s tab-root wrapper that calls `coordinator.navigate(to: .profile)` **will not work**
(it pops to root). Give it its own row that pushes `ProfileView` some other way, or tell Fable the
Studio tab's root route should change. Settings is unaffected — `StudioHubView.swift:132` still
opens it.

**1b. `YourSpacesView` draws a back chevron at a tab root.** Shot
`shots/w3-n1-02-guest-spaces-flagon.png`: the top-left circular `‹` is `YourSpacesView`'s own, drawn
for when it is a *pushed* screen. As the Spaces tab root it has nothing to go back to. Your
"tab-root wrapper only" pass should suppress it when the view is a root.

**1c. `StudioHubView` is a section, not a screen.** It has no `ScrollView` and no title of its own,
so `HouseFirstRoot.studioRoot` currently supplies both — a `ScrollView`, 24 pt gutters, and
`.navigationTitle("Your Studio")`. When your wrapper lands, that shim in
`Features/Navigation/HouseFirstRoot.swift` should come out; ping N1/the steward rather than editing
it yourself.

**1d. The interfaces you consume are frozen.** `PatinaTab` (`title` / `canonicalName` /
`systemImage`), `RouteTabTable.tab(for:)` / `rootRoute(for:)` / `isTabRoot(_:)`,
`TabNavigationModel`, `PatinaTabBar`, and `AppCoordinator.{isHouseFirstRoot, tabs, openExternal,
selectTab, syncCurrentScreen}`. `PatinaTab.systemImage` exists for menu rows and widgets — **the bar
draws no icons** (M1 §6), so do not add one to the bar.

---

## 2. For N3 — `Features/Companion/**`, `Features/FirstLaunch/**`, `Features/Help/FirstLaunchTour.swift`

**2a. There are two Companion marks on the flag-on root right now, and retiring one is yours.**
`HouseFirstRoot` mounts `CompanionOverlay()` unchanged — so C8's coaching, phases, rows, panel and
`handleIntent` are literally untouched — *and* fills the bar's 54 pt trailing slot with a
`StrataMarkView` at 0.8 that calls `coordinator.toggleCompanion()`. Until you move the collapsed
Companion into the slot (B-2), the floating dock still draws above the bar. Visible in
`shots/w3-n1-05-client-today-flagon.png` and every other flag-on shot. Your work is to retire the
floating resting mark; the slot, its VoiceOver label (`Companion`) and its hit area already exist.

**2b. The Hearth policy is retired on the flag-on root, but nothing calls it that way yet.**
`CompanionHearthMetrics.reservesRootHearth(for:houseFirst:)` and `yieldsToPinnedFooter(for:houseFirst:)`
both take a defaulted `houseFirst: Bool = false`, so every existing caller keeps its W1b answer
exactly. `CompanionOverlay.swift:141` calls the one-argument form, so the dock still yields to a
pinned money act — which is the **right** interim, because the dock still draws. When 2a lands, pass
`houseFirst: coordinator.isHouseFirstRoot` there and the yield retires with the dock it was written
for. `HouseFirstRoot` never applies `companionHearthReservation` at all, so the 120 pt inset is
already gone on that root.

**2c. The tour still speaks the old copy, and it is anchored on the header, not the bar.**
`shots/w3-n1-01` (first capture, before Skip) shows step 1 rendering *"This is your Daily Room —
picks and stories chosen for your space."* — B-8's rewrite is yours. Note the anchor problem the
steward flagged as §7·F is now concrete: on the flag-on root the Studio control is the **tab**
(`PatinaTabBar`, N1's file), while on the flag-off root it is still
`DailyGreetingHeader.swift:124`. If you need a `firstLaunchTourAnchor` on the tab bar, send N1 the
exact modifier and anchor case and N1 will apply it — do not edit `PatinaTabBar.swift`.

**2d. `handleIntent` is unchanged and stays that way.** It routes through
`AppCoordinator.navigate(to:)`, which on the flag-on root pushes onto the tab already on screen, and
`.showRooms` / `.showEmergence` / `.showTable` reach their tabs correctly because
`.yourSpaces` and `.emergence(pieceId: nil)` are tab roots. No Companion row needed a change.

---

## 3. For the steward / whoever takes the unowned files

**3a. `Features/Money/MoneyScreenChrome.swift:33` — in no lane's set, not edited.**
`bottomClearance = CompanionHearthMetrics.dockHeight + 8` (148 pt) is sized to a dock that the bar
replaces. On the flag-on root the money screens now carry ~150 pt of dead space *plus* the bar —
`shots/w3-n1-07-money-footer-under-bar.png`. The one-line replacement already exists:

```swift
// MoneyScreenChrome.swift:33
static func bottomClearance(houseFirst: Bool) -> CGFloat {
    CompanionHearthMetrics.pinnedFooterClearance(houseFirst: houseFirst)   // 8 vs dockHeight + 8
}
```

`InvoicesMoneyRailTests:282` pins `bottomClearance >= dockHeight`, so that suite moves with it.
Steward §7·C offered "assign it, or accept the dead space and say so" — this is N1 saying so.

**3b. `Features/ProductDetail/**` — the `Add to Room` footer sits under the bar.**
`shots/w3-n1-08-deeplink-piece-switches-to-pieces-tab.png`: the pinned `Add to Room` button's lower
edge is cut by the tab bar's top hairline. Same class of problem as 3a — a pinned footer sized for
the dock — but a different file, and also unowned. Not a W3 acceptance item; recording it so it is
not discovered as a regression later.

**3c. `Features/Home/Views/DailyRoomView.swift:46` reads `coordinator.navigationPath.isEmpty`.**
On the flag-on root that path is inert and always empty, so `FirstLaunchTour(canAutoStart:)` reads
`true` regardless of the Today stack's depth. `DailyRoomView` belongs to no W3 lane. If the tour's
auto-start needs to be depth-aware on that root, the honest expression is:

```swift
// the tab-aware twin of `navigationPath.isEmpty`
coordinator.isHouseFirstRoot ? coordinator.tabs.stack(for: .today).isEmpty
                             : coordinator.navigationPath.isEmpty
```

---

## 4. For Fable — two rulings N1 took rather than blocking on

**4a. No new `AppRoute` case, so "Your Studio" borrows `.profile`.**
The Studio tab is a canonical destination with no route of its own. Minting one breaks five
exhaustive switches N1 does not own and C8 freezes: `CompanionContext.contextSummary`,
`CompanionContext.contextIcon`, `CompanionContextProvider.screenItems` (whose own comment says
*"There is deliberately no `default:`"* — adding an arm there is a product decision about what the
Companion offers on the Studio hub, which is N3's), `CompanionViewModel.screenIdentifier`, and
`Services/Companion/CompanionAPIClient.screenIdentifier` (in no lane's set at all). `.profile` is
the least-wrong stand-in — its screen is the one that already hosts `StudioHubView`
(`ProfileView.swift:123`) — and it costs the reachability of `ProfileView` on the flag-on root
(§1a). If Fable would rather pay the five-file cascade for an honest `.studio` route, it is a small
change and N1 will make it.

**4b. Steward §7·A — `roomEmergence` is filed under Spaces, not the brief's literal Pieces.**
The steward asked N1 to raise this rather than choose silently, so: N1 chose **Spaces**, matching
its sibling `roomSavedItems`, and the choice is close to inert. The table is read by `openExternal`
only — a link, a push, a restore — and neither `roomEmergence` nor `roomSavedItems` is reachable
that way (`NotificationRouter` emits neither; `DeepLinkHandler` maps neither). The behaviour the
steward actually wanted is structural instead: an in-app push stays on the tab already on screen, so
"Browse pieces for the Living Room" never leaves Spaces regardless of the table entry, and Today's
bell never leaves Today (§7·B). Both are pinned by
`TabNavigationModelTests.aRoomsBrowseNeverLeavesSpaces` and
`.theBellPushesOntoTodayRatherThanJumpingToStudio`.

**4c. 122 `navigate(to:)` sites, not the spec's 105 — and none of them changed.**
`grep -rn "navigate(to:" apps/mobile/Patina/Patina --include="*.swift" | wc -l` → **122**. All 122
already reach `AppCoordinator` or `DeepLinkHandler`, so the tab layer went in under them and not one
call site was edited. `HouseFirstRootTests.everyNavigateCallSiteGoesThroughTheCoordinator` fails if
that ever stops being true.
