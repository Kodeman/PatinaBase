# W3 · lane N1 — fix round

Written by N1 (the same implementer, second pass), 2026-08-27, in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n1` on `daily-return/w3-n1`.
Round base `2debf67e2`; review `waves/w3/n1-review.md`.

**Every blocking and every major is answered below — changed or rebutted, each with the evidence
under it.** Three of the nine are code changes N1 owns; four are rebuttals whose fix lives in a file
another lane owns, each shipped with the exact patch its owner should apply; two are corrections to
the lane's own artefacts.

One thing the review did not find, and N1 did while tracing BL-2, is fixed here: **the bar's
Companion slot presented nothing and took the whole screen out of the VoiceOver tree.** §BL-2b.

---

## The gate, re-run exactly

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **

$ xcodebuild test -project Patina.xcodeproj -scheme Patina -only-testing:PatinaTests \
    -destination id=3D350836-BAF9-443A-8598-588D8D4AEBF6 -derivedDataPath .build/dd
✔ Test run with 1037 tests in 120 suites passed after 3.541 seconds.
** TEST SUCCEEDED **
```

1037 − 1033 (the reviewed round) = **4 new tests**, listed per finding below. No suite lost a test;
`FirstLaunchTourTests` and `RouteAnalyticsParityTests` are inside that green run and untouched.

**Both new source pins were falsified before being trusted** — a pin that cannot fail is decoration.
With `.crossRoom` re-pointed at `ManualRoomEntryView()` in `HouseFirstRoot` only, and
`bareCallOwner` set to a file that does not exist:

```
✘ theTwoRootsDispatchTheSameDestinations() … Expectation failed:
    (a → "… case .crossRoom: CrossRoomView() case .manualRoomEntry: ManualRoomEntryView() …")
 == (b → "… case .crossRoom: ManualRoomEntryView() case .manualRoomEntry: ManualRoomEntryView() …")
✘ everyNavigateCallSiteGoesThroughTheCoordinator() … offenders → [13 AppCoordinator.swift lines]
✘ Test run with 25 tests in 1 suite failed after 0.397 seconds with 2 issues.
```

Both perturbations were reverted; `git diff` for `HouseFirstRoot.swift` carries no `ManualRoomEntry`
line and the gate above is the run on the reverted tree.

---

## BLOCKING

### BL-1 — the Studio tab reports `.profile` · **REBUTTED as un-fixable in this lane · pinned · escalated**

The finding is **correct and I am not disputing it**. What I am rebutting is that N1 can close it.

**The cascade, counted rather than described.** Minting `.studio` adds an arm to five switches over
`AppRoute` that carry no `default:` — verified by reading each one at HEAD:

| File | Symbol | Lane |
|---|---|---|
| `Features/Companion/Models/CompanionContext.swift:136` | `contextSummary` | **N3** |
| `Features/Companion/Models/CompanionContext.swift:227` | `contextIcon` | **N3** |
| `Features/Companion/Services/CompanionContextProvider.swift:118` | `screenItems` | **N3** |
| `Features/Companion/ViewModels/CompanionViewModel.swift:206` | `screenIdentifier` | **N3** |
| `Services/Companion/CompanionAPIClient.swift:321` | `screenIdentifier` | **no W3 lane** |

`CompanionContextProvider`'s own comment states the constraint: *"Exhaustive dispatch to per-area
builders. There is deliberately no `default:` — a newly-added `AppRoute` case must fail compilation
here."* So the change is not merely against the ownership rule — **it cannot compile on this branch
without editing four files N1 does not own**, and two of those arms (`screenItems`, `contextSummary`)
are product decisions about what the Companion says on the Studio hub, which is exactly what C8
freezes and what N3 is being asked to author.

**The one alternative that stays inside N1's files, and why it is worse.** `.profile` and the screen
would agree if `HouseFirstRoot`'s Studio root rendered `ProfileView()` instead of `StudioHubView` —
the route, the analytics name, the Companion context and `ProfileView`'s reachability all fall into
line at once. It is rejected because `build-plan.md` W3 says **"Studio = StudioHubView"** and assigns
that wrapper to N2; swapping the destination unilaterally is a larger deviation than the one being
complained about, and it is N2's line to draw.

**What N1 did instead — the debt is now tested, not silent.** New test
`HouseFirstRootTests.theStudioTabReportsProfileUntilAStudioRouteIsMinted` asserts the whole chain in
one place: `rootRoute(for: .studio) == .profile`, that entering the tab leaves
`currentScreen == .profile` **and** `companionContext.currentScreen == .profile`, that
`AppRoute.profile.analyticsScreenName == "Profile"`, and that the tab's canonical name is
`"Your Studio"`. It reddens the moment the honest route exists, so paying the debt cannot happen
quietly either.

**The ruling Fable owes, with the work priced.** If `.studio` is minted, the change is: one case in
`AppRoute` + `displayName` (N1); `analyticsScreenName` falls out of `displayName` as `"Your Studio"`
and `RouteAnalyticsParityTests` gains a row (N1); `RouteTabTable.rootRoute` + `isTabRoot` (N1); an
arm in both `destinationView` dispatchers rendering `StudioHubView`'s wrapper (N1, and the new
sync pin below keeps them equal); the five arms above (N3 ×4, plus an owner for
`CompanionAPIClient.swift`). If `.profile` stands, the paragraph for the canon digest is written out
in `n1-notes.md` §4a for whoever holds that file — N1 did not write it there itself, because
recording a consequence as canon presumes the ruling that has not been made.

### BL-2 — the floating Companion paints over the bar · **REBUTTED as N3's, with a reason it must NOT be closed by N1** · and see BL-2b

Retiring the floating dock from `HouseFirstRoot` — the one move available inside N1's files — would
**strand the Companion entirely**, because on this branch the dock is its only door:

```
$ grep -rn "toggleCompanion" apps/mobile/Patina/Patina
App/Coordinators/AppCoordinator.swift:697:    public func toggleCompanion() {
Features/Navigation/HouseFirstRoot.swift:132:            coordinator.toggleCompanion()      ← now removed, see BL-2b

$ grep -rn "isCompanionExpanded" apps/mobile/Patina/Patina
App/Coordinators/AppCoordinator.swift:53:    public var isCompanionExpanded = false
App/Coordinators/AppCoordinator.swift:699:            isCompanionExpanded.toggle()
ContentView.swift:191:            .accessibilityHidden(coordinator.isCompanionExpanded)
Features/Navigation/HouseFirstRoot.swift:42:                .accessibilityHidden(coordinator.isCompanionExpanded)
Features/Companion/Views/CompanionOverlay.swift:766:        coordinator.isCompanionExpanded = true
Features/Companion/Views/CompanionOverlay.swift:821:        coordinator.isCompanionExpanded = false
```

Expansion is `CompanionOverlay.expandToPanel()`, called only from inside that view (its own resting
mark at `:635` / `:669`, and its action rows). **Nothing outside the overlay can open the panel**, so
"retire the dock" and "put the Companion in the slot" are one commit, in `Features/Companion/**`,
and that is N3's set. Confirmed still open on my own simulator in the frames MJ-6 asked for:
`w3-n1-10` (Today), `w3-n1-11` (Pieces), `w3-n1-12` (Studio) — dark, XXL — all three show the dock's
caption `5 THINGS NEED YOUR EYE` drawn across the bar's label row and the `.minimal` orb sitting on
the bar's trailing slot.

**The patch N3 applies, both halves in one commit:**

```swift
// 1 · Features/Companion/Views/CompanionOverlay.swift — the slot becomes the door
.onChange(of: coordinator.isCompanionExpanded) { _, expanded in
    if expanded, !state.isExpanded { expandToPanel() }
    if !expanded, state.isExpanded { collapseToButton() }
}

// 2 · the same file, `displayMode` — the dock stops resting on the flag-on root
if coordinator.isHouseFirstRoot, !state.isExpanded { return .hidden }

// 3 · Features/Navigation/HouseFirstRoot.swift — N1 restores the button on your word
//     (`companionSlot`, currently the mark alone; see BL-2b)
```

Step 2 is what B-2 means by *the bar replaces the dock*; step 1 is what keeps the Companion
reachable while it happens; step 3 is one line in N1's file that N1 will apply the moment step 1
lands — send the two lines and it is done.

### BL-2b — NEW, found while answering BL-2: the Companion slot presented nothing and blinded VoiceOver · **FIXED**

`companionSlot` was a `Button` on `coordinator.toggleCompanion()` with the VoiceOver label
`Companion`. Per the greps above, `toggleCompanion()` flips `isCompanionExpanded`, **nothing observes
it**, and the only thing that reads it on this root is
`tabContent.accessibilityHidden(coordinator.isCompanionExpanded)`. So a tap on the bar's Companion:
presented no panel, changed nothing on glass — and took **all four tab stacks and the bar itself out
of the accessibility tree** until the person tapped the same invisible target again. Sighted: a dead
control. VoiceOver: the app disappears.

Fixed by making the fifth slot M1's Strata mark and nothing more — no `Button`, no label, no hint
(which also retires m11's hint) — until the overlay can act on the flag. Pinned by
`HouseFirstRootTests.theCompanionSlotOpensThePanelOrIsNotAControl`, written so that it permits N3's
wiring and forbids only the broken half:

```swift
#expect(overlayObservesTheFlag || !slotTogglesTheFlag)
```

The AX contract the review verified in the tree on shot `w3-n1-04` is otherwise unchanged: four
`AXTabButton`s labelled `Today` / `Your Spaces` / `Browse pieces` / `Your Studio`. The fifth
element's `Companion` label returns with N3's wiring — it is in the patch above, and in
`n1-notes.md` §2a.

### BL-3 — two Studio doors on the flag-on root · **REBUTTED as unowned · patch written · assignment needed**

`Features/Home/Views/DailyGreetingHeader.swift` is in no W3 lane's set (steward §6: N1 owns `App/**`,
`ContentView.swift`, `PatinaApp.swift`, `CompanionSafeArea.swift`, `Features/Navigation/**`;
`Features/Home/**` is in none of the three). Reproduced again in this round —
`w3-n1-10-client-today-dark-xxl-flagon.png` shows the `Studio 5` pill in the header while the bar
carries the Studio tab.

The patch is two lines, and it must keep the tour's anchor mounted on the flag-off root
(steward §7·F), which is why it gates the *control*, not the *anchor slot*:

```swift
// DailyGreetingHeader.swift — the header control is B-1's fallback "if the flag never flips"
if !coordinator.isHouseFirstRoot {
    studioControl
        .firstLaunchTourAnchor(.profileMonogram)
}
```

⚠ `DailyGreetingHeader` takes `attentionCount` and its callbacks as parameters and does not hold the
coordinator today — whoever takes the file either reads `@Environment(\.appCoordinator)` there or
takes a `showsStudioControl: Bool` from `DailyRoomView`. Either way it is one file plus its caller,
and `HomeHeaderTests` moves with it. **Assignment is Fable's** — N1 is not editing an unowned file
during a fix round.

---

## MAJOR

### MJ-1 — nothing pinned the two dispatchers in sync · **FIXED**

New `HouseFirstRootTests.theTwoRootsDispatchTheSameDestinations` extracts all six dispatcher
bodies from both roots by brace matching, drops whole-line comments through `SourceScan.code(in:)`,
collapses whitespace, and compares them pairwise: `destinationView`, `roomsDestination`,
`discoveryDestination`, `styleDestination`, `workCoreDestination`, `workDocumentsDestination`.
Falsified above — it prints both bodies and names the differing case. The moment N2 re-points a
route or wraps a root view in one file only, this reddens with the diff in the failure message.

### MJ-2 — the headline count was wrong in two directions · **FIXED (artefacts corrected)**

The numbers, re-measured this round:

```
$ git grep -c 'navigate(to:' 83b8c3340 -- 'apps/mobile/Patina/Patina/*.swift' | ... → 122   (base)
$ grep -rn 'navigate(to:' apps/mobile/Patina/Patina --include='*.swift' | wc -l →      121   (HEAD)
```

**Six call sites changed, not zero and not one** — five in `DeepLinkHandler.swift` (`configure`'s
queued replay, the APNs door, the universal-link branch, room, piece) and one in
`AppCoordinator.recomputePhase`'s post-re-auth restore. Proven from the diff rather than recalled:

```
$ git diff 83b8c3340..HEAD -- .../DeepLinkHandler.swift | grep -E '^[-+].*(navigate|openExternal)'
-            coordinator.navigate(to: pending)          +            coordinator.openExternal(pending)
-            coordinator.navigate(to: route)            +            coordinator.openExternal(route)
-                coordinator?.navigate(to: route)       +                coordinator?.openExternal(route)
-        coordinator?.navigate(to: .roomProject(…))     +        coordinator?.openExternal(.roomProject(…))
-        coordinator?.navigate(to: .pieceDetail(…))     +        coordinator?.openExternal(.pieceDetail(…))

$ git diff 83b8c3340..HEAD -- .../AppCoordinator.swift | grep '^-' | grep -v '^---'
-    public init() {
-            navigate(to: route)
```

The true statement, and the one now written in the artefacts: **no view-layer call site was edited —
all 121 remaining sites reach `AppCoordinator` or `DeepLinkHandler` untouched, and the six that
changed are the outside-entry doors, all inside N1's own files.** Corrected in `n1-notes.md` §4c and
in the shot ledger's `w3-n1` preamble. The commit body of `4a92058b5` is history and is not being
rewritten mid-wave; the contradiction is recorded here so the artefact that outlives the lane is the
correct one.

### MJ-3 — the pin allowed an empty receiver anywhere · **FIXED**

`everyNavigateCallSiteGoesThroughTheCoordinator` now allows a bare (self) `navigate(to:)` **only in
`AppCoordinator.swift`**; every other file must name an allowed receiver. Verified that this is the
true state of the tree before tightening — all 13 bare call lines live in `AppCoordinator.swift`
(the falsification run above prints them). A view that grows its own `func navigate(to:)` and calls
it unqualified is now visible to the scan, which is what the docstring always claimed.

### MJ-4 — "one tap to its canonical destination" holds only from an empty stack · **FIXED (test) + walk line handed over**

New `HouseFirstRootTests.aTabWithAStackRevealsItsStackTopAndRetappingRevealsTheRoot`: an
`openExternal(.invoiceDetail)` pushes onto Studio, a switch away and back reveals the **invoice**,
and a second tap on Studio reveals `RouteTabTable.rootRoute(for: .studio)` with the stack empty.

For the walker, the acceptance line needs one qualification. Suggested wording, for whoever owns the
W3 script (`build-plan.md` W3 acceptance / `waves/w3/walk.md`) — N1 does not edit the plan:

> *Studio is one tap from its canonical destination from an empty stack. After a deep link or a push
> tap has pushed onto a tab, the first tap on that tab reveals what was pushed and the second reveals
> the root — test both, and record the second tap as the pop.*

### MJ-5 — two screens ship visibly broken, and "saying so" is not an owner · **REBUTTED as unowned · both patches written · assignment needed**

Neither file is in any W3 lane's set (steward §6, §7·C). Both reproduced this round in dark + XXL:

- **`Features/Money/MoneyScreenChrome.swift:33`** — `bottomClearance = CompanionHearthMetrics.dockHeight + 8`
  (148 pt) sizes to a dock the bar replaces. The replacement API already exists and is tested:
  `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` → `8` on the flag-on root,
  `dockHeight + 8` off it. `InvoicesMoneyRailTests:282` pins `bottomClearance >= dockHeight` and
  moves with the call site.
- **`Features/ProductDetail/Views/ProductDetailView.swift:400-461`** — the pinned `Add to Room`
  capsule's lower edge is cut by the bar's top hairline: `w3-n1-13-piece-footer-under-bar-dark-xxl.png`,
  where the `.minimal` Companion orb also sits over both the capsule's trailing end and the bar's
  Strata slot. The bar's own `.padding(.bottom, 36)` is a hand-rolled home-indicator clearance
  written before anything else occupied that edge; the honest fix is the same
  `pinnedFooterClearance(houseFirst:)` seam, and the file's owner should make that call with the
  screen in front of them.

### MJ-6 — the XXL orb overlap is not closed, and no dark / Dynamic Type frame was shot · **PART FIXED (the evidence is now on disk) · the defect stays N3's**

Four frames taken this round on `dr-w3-n1`, **dark appearance, Dynamic Type XXL**
(`xcrun simctl ui … appearance dark` + `content_size extra-extra-large`), flag on, signed build:

| Shot | What it settles |
|---|---|
| `w3-n1-10-client-today-dark-xxl-flagon.png` | The bar itself is **clean** in dark at XXL — four labels legible, none truncated, `pearl` hairline and selected/muted states correct. W2's own XXL FAIL (the bubble over the Record's rows) **does not reproduce on this root**: the Record's text is clear. The collision moved to the bar — the dock's `5 THINGS NEED YOUR EYE` caption is drawn across the label row. BL-3's `Studio 5` header pill is in the same frame |
| `w3-n1-11-client-pieces-dark-xxl-flagon.png` | `Browse pieces` at XXL under the bar; `Pieces` selected. Same caption collision. ⚠ **new N2 item**: `RecommendationsView` draws its own back chevron at a tab root, exactly as `YourSpacesView` does (`n1-notes.md` §1b) |
| `w3-n1-12-client-studio-dark-xxl-flagon.png` | `Your Studio` at XXL; `Studio` selected; the hub's rows wrap without clipping. Same caption collision, and the resting mark over the `Active projects` row |
| `w3-n1-13-piece-footer-under-bar-dark-xxl.png` | MJ-5's second screen, in dark at XXL |

So: the **bar** passes dark + XXL, which is the half N1 owns and can answer. The **orb** is unchanged
and belongs to BL-2's single commit in N3's file. AX1+ sizes (m2) are still unpriced — the labels
carry `minimumScaleFactor(0.75)` on a fixed 49 pt row and will truncate above XXL.

---

## Minors

- **m1 · `barHeight` is asserted but never laid out** — taken, as honesty rather than geometry. The
  constant stays (N2/N3 consume the published interface) and its docstring now says what it is: M1's
  drawn figure on a 34 pt home-indicator device, while the bar frames itself at `itemHeight` and lets
  `safeAreaInset` add the device's real inset — 49 pt on a home-button device.
- **m11 · the Companion slot's hint** — retired with the button itself (BL-2b). It returns with N3's
  wiring, and the patch in `n1-notes.md` §2a carries `.accessibilityLabel("Companion")` without a
  hint that only repeats the gesture.
- **m12 · nine ledger rows for ten shots** — `w3-n1-08b` now has its own row; the four new dark/XXL
  rows are appended.
- **m2, m3, m5, m6, m7, m8, m9, m10 — read, not taken this round**, and each for a stated reason:
  m2 (AX1+ on a fixed-height bar) is a real unpriced cost of the hand-rolled bar that B-1 accepted in
  the abstract — it wants a design answer, not a patch; m3's two APIs get their production caller the
  moment MJ-5 is assigned; m5 (hidden tabs keep their lifecycles) is the price of per-tab state that
  `TabView` also pays, and the concrete impression-tracking case is bounded because a hidden tab
  cannot scroll; m6's one-runloop `currentScreen` lag is inherent to deriving from
  `visibleRoute.onChange` and would need the pop to become imperative again; m7 is Fable's one-word
  ruling; m8 is W1a's design (`--uitesting` forces flags off); m9 is the steward's `lint-delta` at
  integration; m10's two string-literal pins are the house style and better than nothing.
