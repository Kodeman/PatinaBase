# W3 · lane N1 — notes for the other lanes and the steward

Written by N1 after its gate, 2026-08-27. Branch `daily-return/w3-n1`, updated in the fix round
(`waves/w3/n1-fix-log.md`). Everything below is something N1 found but does **not** own. Nothing
here was edited by N1.

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

**1b. `YourSpacesView` draws a back chevron at a tab root — and so does `RecommendationsView`.** Shot
`shots/w3-n1-02-guest-spaces-flagon.png`: the top-left circular `‹` is `YourSpacesView`'s own, drawn
for when it is a *pushed* screen. As the Spaces tab root it has nothing to go back to. Your
"tab-root wrapper only" pass should suppress it when the view is a root.
⚠ **Fix round, 2026-08-27:** `shots/w3-n1-11-client-pieces-dark-xxl-flagon.png` shows the same
chevron on `RecommendationsView` as the **Pieces** tab root. Two files, one pass.

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

**2a. The floating dock paints over the bar, and closing it is one commit in your file — both
halves.** ⚠ **Rewritten in the fix round.** `HouseFirstRoot` mounts `CompanionOverlay()` unchanged —
C8's coaching, phases, rows, panel and `handleIntent` are literally untouched — and fills the bar's
54 pt trailing slot with a `StrataMarkView` at 0.8. **That mark is no longer a button.** It was one,
on `coordinator.toggleCompanion()`, and that was wrong: `toggleCompanion()` only flips
`isCompanionExpanded`, **nothing observes it**, and the only reader on this root is
`tabContent.accessibilityHidden(coordinator.isCompanionExpanded)` — so the tap presented no panel and
took all four stacks out of the VoiceOver tree until it was tapped again. Expansion is
`expandToPanel()`, reachable only from inside your view.

The dock still draws above the bar in every flag-on shot, dark and XXL included
(`w3-n1-05`, `w3-n1-10`, `w3-n1-11`, `w3-n1-12`): its caption — `NEXT STEPS`,
`5 THINGS NEED YOUR EYE` — lands across the bar's label row, and the `.minimal` orb sits on the
bar's own trailing slot. **Your commit, three steps:**

```swift
// 1 · CompanionOverlay.swift — the bar's slot becomes the door
.onChange(of: coordinator.isCompanionExpanded) { _, expanded in
    if expanded, !state.isExpanded { expandToPanel() }
    if !expanded, state.isExpanded { collapseToButton() }
}

// 2 · CompanionOverlay.swift, `displayMode` — the resting dock retires where the bar carries it
if coordinator.isHouseFirstRoot, !state.isExpanded { return .hidden }

// 3 · send N1 these two lines and N1 restores the slot's button in HouseFirstRoot.swift:
//     Button { coordinator.toggleCompanion() } label: { … }
//         .accessibilityLabel("Companion")        // M1 §6's fifth VoiceOver name
```

Step 1 before step 2, always — step 2 alone strands the Companion, which is why N1 did not take it.
`HouseFirstRootTests.theCompanionSlotOpensThePanelOrIsNotAControl` permits your wiring and forbids
only the broken half.

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
⚠ **Fix round:** the review (MJ-5) ruled that saying so is not an owner. **This file needs a name.**

**3b. `Features/ProductDetail/Views/ProductDetailView.swift:400-461` — the `Add to Room` footer is
clipped by the bar.** `shots/w3-n1-08-deeplink-piece-switches-to-pieces-tab.png` and, in dark at
Dynamic Type XXL, `shots/w3-n1-13-piece-footer-under-bar-dark-xxl.png`: the pinned capsule's lower
edge is cut by the tab bar's top hairline, and the Companion's `.minimal` orb sits over both the
capsule's trailing end and the bar's Strata slot. `bottomBar`'s `.padding(.bottom, 36)` is a
hand-rolled home-indicator clearance written before anything else occupied that edge; the same
`CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` seam 3a uses is the honest replacement,
but the file's owner should take that call with the screen in front of them. Also unowned — **also
needs a name.**

**3d. `Features/Home/Views/DailyGreetingHeader.swift` — two Studio doors on the flag-on root.**
⚠ **Fix round, from the review (BL-3).** The header still carries W2's labelled `Studio 5` pill
while the bar carries the Studio tab (`shots/w3-n1-05`, and in dark at XXL `shots/w3-n1-10`). M1's
sheet draws the header as date over greeting and a belled dot, **no monogram** — one Studio door, on
the bar — and B-1 makes the header control the *fallback* "if the flag never flips". The control is
`studioControl` at `:124`, and the same line carries the tour's step-3 anchor, which must stay
mounted on the flag-off root (steward §7·F). So the gate goes around the control, not the anchor:

```swift
if !coordinator.isHouseFirstRoot {
    studioControl
        .firstLaunchTourAnchor(.profileMonogram)
}
```

`DailyGreetingHeader` does not hold the coordinator today — it takes `attentionCount` and its
callbacks as parameters — so the owner either reads `@Environment(\.appCoordinator)` there or takes
a `showsStudioControl: Bool` from `DailyRoomView`. One file plus its caller; `HomeHeaderTests` moves
with it. `Features/Home/**` is in **no** W3 lane's set — **needs a name**, and N3 cannot finish B-8's
step 3 on the flag-off root without one.

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

⚠ **Fix round (review BL-1): the cost of the stand-in is larger than §1a said, and it is now
tested.** `RouteTabTable.rootRoute(for: .studio) == .profile`, and **both** entries into a tab root
run the full tracking path — `openExternal` calls `trackScreen(for:)` + `updateContext(for:)`
(`AppCoordinator.swift:376-379`), and a bar tap reaches `syncCurrentScreen(to:)`, which does the same
(`:392-397`). So on the flag-on root every visit to Studio, and every pop back to it, sends PostHog
the screen name **`Profile`** and hands the Companion **Profile's** context rows, while
`StudioHubView` under the title `Your Studio` is what is on glass. W4 reads that funnel.
`HouseFirstRootTests.theStudioTabReportsProfileUntilAStudioRouteIsMinted` now pins the whole chain,
so it reddens the moment the honest route lands.

**If `.profile` stands**, this is the paragraph for `research/11-canon-digest.md` — N1 has not
written it there, because recording a consequence as canon presumes the ruling:

> **The Studio tab has no route of its own (W3, R2/B-1).** `PatinaTab.studio`'s root route is
> `AppRoute.profile`, so on the `house-first` root a Studio visit is recorded in PostHog as the
> screen **`Profile`** and the Companion is given Profile's context. The screen shown is
> `StudioHubView` under the canonical title "Your Studio"; `ProfileView` is not reachable on that
> root. Anything reading the Studio funnel must read `Profile` and separate the two roots by the
> `house-first` flag. Minting `AppRoute.studio` would require an arm in five exhaustive switches
> that C8 freezes.

**If `.studio` is minted**, the work is: the case + `displayName` (N1); `analyticsScreenName` falls
out of `displayName` and `RouteAnalyticsParityTests` gains a row (N1); `RouteTabTable.rootRoute` +
`isTabRoot` (N1); an arm in both `destinationView` dispatchers, kept equal by the new
`theTwoRootsDispatchTheSameDestinations` pin (N1); and the five arms above — four in N3's files, one
in `Services/Companion/CompanionAPIClient.swift`, which needs an owner either way.

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

**4c. 122 `navigate(to:)` sites at the base, not the spec's 105 — and no view-layer site changed.**
⚠ **Corrected in the fix round (review MJ-2); the earlier "none of them changed" and the commit body
of `4a92058b5` were both wrong.**

```
$ git grep 'navigate(to:' 83b8c3340 -- 'apps/mobile/Patina/Patina/*.swift' | wc -l   → 122   (base)
$ grep -rn 'navigate(to:' apps/mobile/Patina/Patina --include='*.swift' | wc -l      → 121   (HEAD)
```

**Six sites changed, all of them outside-entry doors inside N1's own files** — five in
`DeepLinkHandler.swift` (`configure`'s queued replay, the APNs door, the universal-link branch, room,
piece) and one in `AppCoordinator.recomputePhase`'s post-re-auth restore; each became
`openExternal(_:)`, which on the flag-off root is `navigate(to:)` verbatim. **No view-layer call site
was edited**: the remaining 121 reach `AppCoordinator` or `DeepLinkHandler` untouched, which is what
made the lane small. `HouseFirstRootTests.everyNavigateCallSiteGoesThroughTheCoordinator` fails if
that stops being true — and, since the fix round, a bare unqualified `navigate(to:)` is allowed only
in `AppCoordinator.swift` rather than anywhere.

**4d. The bar's fifth slot is not a control yet — this is a deliberate retreat, not an oversight.**
See §2a: `toggleCompanion()` has no observer, so the button N1 shipped presented nothing and
`accessibilityHidden(isCompanionExpanded)` took the whole screen out of the VoiceOver tree. The mark
stays; the button returns with N3's two lines.
