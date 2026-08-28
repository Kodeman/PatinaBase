# W3 · lane N1 — adversarial review

Reviewer, separate context, 2026-08-27. Read-only against
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n1` @ `2debf67e2`
(`daily-return/w3-n1`, base `83b8c3340`). Sources read in full: `build-plan.md` (Global
constraints, Team model, W1a DONE, W3), `rulings-2026-08-27.md` R2/Q4, `direction-b.md` §8
(B-1/B-2/B-7/B-8) and §2, `mock/fragments/b-M1.html` + `b-M1.sheet.html`, `b-M9.html` +
`b-M9.sheet.html`, `build-plan-critique.md` B7/B8/M18, `waves/w2/integration.md` + `walk.md`,
`waves/w3/steward.md`, `n1-tasks.md`, `n1-notes.md`.

**Verdict: the lane's own contract is met, and it is met well.** Every check the brief names
passes on my own evidence, including a gate I re-ran myself. Three items should be closed before
the W3 walk, and only one of them is a code decision N1 could have taken alone.

---

## 0. Independent verification

**The gate is real.** I re-ran the test tier myself, on the lane's own simulator, from the
committed tree:

```
$ xcodebuild test -project Patina.xcodeproj -scheme Patina -only-testing:PatinaTests \
    -destination id=3D350836-BAF9-443A-8598-588D8D4AEBF6 -derivedDataPath .build/dd
✔ Test run with 1033 tests in 120 suites passed after 4.125 seconds.
** TEST SUCCEEDED **
```

1033 − 980 (W2) = **53**, matching the three new suites the report claims. `FirstLaunchTourTests`
is green and untouched, as C8/B-8 require of this lane. `RouteAnalyticsParityTests` — the suite the
steward warned the tab table must not disturb — is inside that green run.

**Every checklist item from the brief, checked on the tree, not on the report:**

| Check | Result | Evidence |
|---|---|---|
| Published interfaces exist exactly | ✅ | `PatinaTab` (`title`/`canonicalName`/`systemImage`), `RouteTabTable.{tab(for:),rootRoute(for:),isTabRoot}`, `TabNavigationModel.{selected,paths,navigate,popToRoot,push,select,pop,visibleRoute,stack(for:)}`, `PatinaTabBar.{itemHeight,barHeight,init}`, `HouseFirstRoot.init()`, `AppCoordinator.{isHouseFirstRoot,tabs,openExternal,selectTab,syncCurrentScreen}` — all present with the published signatures |
| `RouteTabTable` exhaustive | ✅ | `AppRoute` has 31 cases (`Coordinator.swift:52-101`); `tab(for:)` names 1 + 9 + 5 + 16 = 31 with no `default:`; `theTableHasNoDefaultArm` pins it after comment-stripping |
| Every `navigate(to:)` site routes through the coordinator | ✅ (with a caveat, §M3) | `grep` over `Patina/` finds no receiver outside `coordinator` / `nav` / `DeepLinkHandler.shared` / self |
| `presentedSheet` routes through the coordinator on the flag-on root | ✅ | the single `.sheet(item:)` driver is still on `ContentView`'s outer `ZStack` above the phase switch (`ContentView.swift:84-90`), untouched, so it presents above all four stacks — steward §3 honoured |
| Deep links + push land on the right tab | ✅ | `openExternal` is the only reader of the table; `HouseFirstRootTests.{aPushTapLandsOnTheRoutesOwnTab, everyPushEntityTypeLandsOnItsTabThroughTheCoordinator, aRoomDeepLinkLandsOnSpaces}` + `RouteTabTableTests.everyUniversalLinkLandsOnItsTab`; sim-proven for `patina://piece/<id>` in shot 08 |
| Flag-off root byte-for-byte | ✅ | `git diff main...HEAD --numstat`: `ContentView.swift` **19 / 0** — nineteen added lines, **zero deletions**. The other four files' 17 deletions are two policy signatures gaining a defaulted `houseFirst: Bool = false`, `public init()` becoming `convenience`, five `coordinator.navigate` → `openExternal` in `DeepLinkHandler`, one in `recomputePhase`, and the `PatinaApp.init()` reorder. `openExternal` on the off root is `navigate(to:)` verbatim (`AppCoordinator.swift:353-355`) |
| The root is chosen once | ✅ | `public let isHouseFirstRoot` set in `init`; `theChoiceIsALetAndCannotChangeMidSession` pins exactly one `FeatureFlags.shared.isOn` in the coordinator; `theFlagIsResolvedBeforeTheCoordinatorIsBuilt` pins the `PatinaApp.init` ordering by source offset; `contentViewPicksTheRootFromTheCoordinator` pins that `ContentView` never reads `FeatureFlags` itself |
| Hearth inset retired only on the flag-on root | ✅ | `HouseFirstRoot` contains no `companionHearthReservation` (pinned); both policies take a **defaulted** flag so all existing callers keep the W1b answer — verified `CompanionOverlay.swift:141` still calls the one-arg form |
| VoiceOver labels = canonical names | ✅ | `.accessibilityLabel(tab.canonicalName)` per item, `.isSelected` on the selected one, `.isTabBar` on the container; `voiceOverSpeaksTheCanonicalNameInFull` pins the four strings; N1's AX-tree capture on shot 04 corroborates |
| 83 pt bar, hairline, labels per B-1 | ✅ (see m1) | 49 pt row + `safeAreaInset(.bottom)` with the background `.ignoresSafeArea(edges: .bottom)` — the canonical recipe, 49 + 34 = 83 on this device; 1 pt `pearl` top hairline; `PatinaTypography.uiSmall` = `Inter-Medium 13, relativeTo: .footnote` = M1 §6's `500 13px`; no icons |
| No unrelated change | ✅ | 14 source files + 13 artefact files, all inside N1's owned set (`App/**`, `ContentView.swift`, `PatinaApp.swift`, `CompanionSafeArea.swift`, new `Features/Navigation/**`, `PatinaTests/**`). `FeatureFlags.swift` untouched (read-only, as assigned). No migration minted — `00539` still free |
| Tests real | ✅ | not source pins dressed as behaviour: `TabNavigationModelTests` exercises push/select/pop/edge-swipe against the real model; `HouseFirstRootTests` drives a real `AppCoordinator` through the internal `init(houseFirstRoot:)` seam and asserts on both roots in one run |
| Conventional Commits, pathspecs | ✅ | `feat(ios):` ×2, `docs(ios):` ×1; every commit's file list matches its subject; no `Secrets.swift`, no `.env`, no foreign paths; 3 commits ahead of `origin/main`, nothing pushed |

**Deviations N1 declared that I confirmed true:** 122 `navigate(to:)` sites at the base
(`git grep 'navigate(to:' 83b8c3340 -- 'apps/mobile/Patina/Patina/*.swift' | wc -l` → **122**), not
the spec's 105; `roomEmergence`/`roomSavedItems` are unreachable from the deep-link and push layer
(`grep roomEmergence\|roomSavedItems App/DeepLinking/*.swift` → nothing), so the table entry for
them is genuinely close to inert; `MoneyScreenChrome.swift:33` still computes `dockHeight + 8`;
`DailyRoomView.swift:46` still reads `coordinator.navigationPath.isEmpty` (the only reader of that
property left outside the coordinator and `ContentView`).

**A hazard I went looking for and did not find:** `TabNavigationModel`'s route mirror is only
extended by `append`, so a push SwiftUI performed itself would desynchronise `visibleRoute`. That
requires `NavigationLink(value:)` — `grep -rn "NavigationLink(value:"` over `Patina/` returns
**nothing**, so the hole is unreachable. Likewise `AppCoordinator.setCurrentScreen` has **zero
callers** in the tree, so the "root views re-sync `rootScreen` from `.onAppear`" path the steward
described cannot clobber `currentScreen` across the four mounted stacks.

---

## Findings

Severity · confidence on every row. Nothing filtered.

### BLOCKING

**BL-1 · The Studio tab reports `.profile` to analytics and to the Companion — every visit, every
pop.** *(high confidence · consequence of ruling 4a, not disclosed in `n1-notes.md`)*
`RouteTabTable.rootRoute(for: .studio) == .profile`, and both entries into a tab root run the full
tracking path: `openExternal` calls `trackScreen(for: route)` + `updateContext(for: route)`
(`AppCoordinator.swift:376-379`), and a bar tap reaches `syncCurrentScreen(to:)`, which does the
same (`:392-397`) off `HouseFirstRoot`'s `.onChange(of: coordinator.tabs.visibleRoute)`. So on the
flag-on root, tapping **Studio** — the destination B-1 exists to expose, and the one the acceptance
line "Studio one tap at every tier" is about — records a **Profile** screen view in PostHog and
hands the Companion **Profile's** context rows, while the screen on glass is `StudioHubView` under
the title "Your Studio". `ProfileView` being unreachable is the cost N1 named; this is a second,
larger one it did not. It also silently re-points the funnel W2 and W4 will read.
*Not a code defect I can ask N1 to fix alone* — the honest fix is the `.studio` case N1 offered to
mint, which touches five exhaustive switches C8 freezes. **Fable's ruling is needed now**, before
N2 builds the Studio wrapper and N3 fills the Companion's Studio rows on top of `.profile`.

**BL-2 · The floating Companion paints over the tab bar, caption and all.** *(high confidence ·
visible in every flag-on shot · N3's file, W3's acceptance)*
`n1-notes.md` §2a calls this "two Companion marks". It is worse than a duplicate: in
`shots/w3-n1-04-guest-studio-flagon.png` the dock's caption **"NEXT STEPS"** is drawn straight
across the bar's label row between `Pieces` and `Studio`; in `w3-n1-05-client-today-flagon.png` it
reads **"5 THINGS NEED YOUR EYE"** across the same row; and in `w3-n1-06` / `w3-n1-07` the minimal
resting orb sits **on top of the bar's own trailing Strata slot**, hiding the mark N1 built. B-2's
whole claim is that the bar *replaces* the dock; right now they collide. Correctly scoped to N3,
but it must be closed before the W3 walk, not carried as an interim — it is the first thing a
walker sees at guest.

**BL-3 · Two Studio doors on the flag-on root, against M1.** *(high confidence · unowned file)*
`w3-n1-05` shows the header still carrying W2's labelled **`Studio 5`** pill while the bar carries
the **Studio** tab. M1's sheet describes the header as "date over the time-of-day greeting, bell
with a clay dot, **no monogram**" — one Studio door, on the bar. B-1's own text makes the header
control the *fallback* "if the flag never flips", so on the flag-on root it is redundant by design.
The control lives in `Features/Home/Views/DailyGreetingHeader.swift:124`, which belongs to **no W3
lane** — and it is also where steward §7·F parks the tour's step-3 anchor for the flag-off root, so
N3 cannot finish B-8 without an owner for this file either. **Assign it.**

### MAJOR

**MJ-1 · The destination dispatcher is duplicated with nothing pinning the two copies in sync.**
*(high confidence)*
`HouseFirstRoot`'s `destinationView(for:)` + five grouped helpers are a verbatim copy of
`ContentView`'s. Duplicating rather than sharing is the right call for the byte-for-byte
obligation, and both top-level switches are exhaustive, so a *new route* breaks both. But a
*changed destination* breaks neither: if N2 re-points `.table` or wraps `YourSpacesView` in
`ContentView` only, the two roots silently render different screens for the same route, and the
flag becomes a behaviour flag rather than a layout flag. `onlyTheTwoRootsOwnANavigationPath` does
not cover this. A cheap `SourcePin` that extracts both `destinationView` bodies and compares them
after `SourceScan.code(in:)` would close it, and would fail loudly the moment N2 edits one side.

**MJ-2 · The report's headline count is wrong in two directions, and the commit body contradicts
itself.** *(high confidence · no behavioural impact)*
The report says "ZERO of the navigate(to:) call sites were edited"; commit `4a92058b5`'s body says
"None of the 122 navigate(to:) call sites changed" and then, four lines later, names "the five
DeepLinkHandler doors plus the post-re-auth restore" that did change. **Six** sites changed. The
shot ledger undercounts them as "one `navigate(to: route)` becoming `openExternal(route)`". And the
count itself moved: `git grep 'navigate(to:'` is **122 at `83b8c3340`** but **121 at `HEAD`**. None
of this changes behaviour — `openExternal` on the flag-off root is `navigate(to:)` verbatim, which
I verified — and the *intent* ("no view-layer call site was edited") is true and is the good news
of this lane. But Fable reads these numbers, and one of them is now stale in the artefact that will
outlive the lane.

**MJ-3 · `everyNavigateCallSiteGoesThroughTheCoordinator` allows an empty receiver, so its
guarantee is weaker than its docstring.** *(high confidence)*
`allowedReceivers` includes `""` (needed for the coordinator's own bare self-calls). Consequence: a
bare `navigate(to: …)` **in any type** passes the pin — a view that grows its own
`func navigate(to:)` and calls it unqualified is invisible to the scan. The docstring claims
"nothing can push onto a stack the tab model does not know about"; the pin actually proves "no
*qualified* receiver outside the allow-list". Restricting the empty-receiver allowance to
`AppCoordinator.swift` would make it say what it claims.

**MJ-4 · "One tap to its canonical destination" holds only while the target tab's stack is
empty.** *(high confidence · standard tab semantics, but it is the acceptance line)*
`everyTabIsOneTapFromItsCanonicalDestination` starts from four empty stacks. After an APNs tap or a
deep link has pushed onto Studio, a later tap on **Studio** from Today reveals the pushed invoice,
not "Your Studio" — correct iOS behaviour, and a second tap pops to root, but the W3 acceptance
sentence is unqualified and the walker will test it after a deep-link step. Worth one added test
(`selecting a tab that already has a stack reveals its stack top; re-tapping reveals the root`) and
one line in the walk script.

**MJ-5 · Two screens ship visibly broken on the flag-on root, and N1's "saying so" is not an
owner.** *(high confidence)*
Steward §7·C offered "assign it, or accept the dead space and say so", and N1 said so — correctly,
and with the one-line fix written out. But the state that ships is: `MoneyScreenChrome`'s 148 pt
clearance leaves ~150 pt of dead space **plus** the bar under every money screen
(`w3-n1-07`), and `ProductDetailView`'s pinned "Add to Room" footer is clipped by the bar's
hairline (`w3-n1-08`). Both are unowned files. This is a wave-level assignment, not an N1 defect —
listing it so it does not reach the walk unassigned.

**MJ-6 · W2's carry-over "the XXL Companion-orb overlap, ruled to the bar" is not closed, and N1
shot no dark or Dynamic Type frame.** *(high confidence)*
`waves/w2/walk.md`'s single FAIL was the Companion bubble over Record/Budget text at XXL, ruled
out to W3 as "the Hearth/orb retirement". N1 retired the *inset* (structurally, and pinned) but not
the *orb* — so at XXL the defect is unchanged on the flag-on root and now also collides with the
bar (BL-2). All ten shots are light, Dynamic Type medium. The W3 acceptance line is "dark + XXL".
Both belong to N3 and the walker; naming it so the wave does not close believing it fixed.

### MINOR

**m1 · `PatinaTabBar.barHeight = 83` is asserted but never laid out.** *(high confidence)* The bar
frames itself at `itemHeight` 49 and lets `safeAreaInset` + the background's `ignoresSafeArea` add
the bottom safe area — which is the *right* implementation, and gives 83 on a 34 pt device. But
`barHeight` has exactly one reference in the whole tree, `HouseFirstRootTests:118`. The test pins a
constant nothing reads; on a device or orientation without a home indicator the bar is 49, and the
"83 pt" claim is device-specific rather than a property of the code.

**m2 · Dynamic Type on the bar.** *(high confidence)* `lineLimit(1)` + `minimumScaleFactor(0.75)`
on a fixed 49 pt row: at accessibility sizes the labels scale down 25 % and then truncate, and the
bar never grows. `uiSmall` is `relativeTo: .footnote`, so XXL (~17.5 pt) still fits an ~84 pt slot
— but AX1+ will not. A larger-text fallback (the system's own answer is a scrolling/HUD tab bar) is
a real cost of the hand-rolled bar that B-1 named in the abstract and nobody has priced yet.

**m3 · Two new API surfaces have no production caller.** *(high confidence)*
`CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` and the `houseFirst:` parameter on
`reservesRootHearth` are exercised only by tests — `HouseFirstRoot` never applies the reservation at
all, and `MoneyScreenChrome` was deliberately not edited. Justified as a documented hand-off, and
cheap; noting it because "add the API, hand it to nobody" is how dead code starts.

**m4 · `PatinaApp.init()`'s reorder also moved two statements on the flag-off root.**
*(high confidence · low risk)* `RoomScanSyncService.configure(modelContext:)` and the
`PersistenceController.shared.container` touch now run **after** `AppCoordinator()` and after
`PostHogService.initialize()`, on both roots. N1 disclosed the reorder. `AppCoordinator.init` does
not touch either service (it sets `currentScreen`, `observePhaseInputs()`,
`scheduleSplashDeadlineRecompute()`), and it is all one synchronous `init` before `body` mounts —
so I believe it is safe. But "byte-for-byte" is true of the view composition, not of launch order.

**m5 · Visited tabs stay mounted at `opacity(0)`, so their lifecycles keep running off-screen.**
*(medium confidence)* `tabContent` is a `ZStack` over `mounted`, with `opacity` / `allowsHitTesting`
/ `accessibilityHidden` doing the switching — the correct way to keep per-tab scroll and stack
state, and lazily mounted so a cold launch pays for one surface. The cost: once a tab is visited,
its `.task`s, observers and any `.onAppear` impression tracking stay live while it is off screen.
The concrete one is `RecommendationsView.swift:258` `.onAppear { viewModel.trackView(product) }` —
grid cells materialised while Pieces is hidden would record impressions for pieces nobody is
looking at. Bounded today (a hidden tab cannot scroll — hit testing is off), so I rate it low, but
it is the kind of thing that becomes an analytics bug after a refresh lands off-screen.

**m6 · `goBack()` on the flag-on root leaves `currentScreen` stale for one runloop.**
*(high confidence · low impact)* It pops and returns, relying on `HouseFirstRoot`'s `.onChange` to
re-derive. The flag-off branch updated `currentScreen` synchronously through `navigationPath.didSet`.
`ContextMemoryStore.remember(route:)` and `trackScreen` therefore fire a beat later, and not at all
if the root is not in the hierarchy. `goBackPopsTheSelectedTab` asserts only tab state, so nothing
pins the re-derivation.

**m7 · `roomEmergence` → Spaces still needs Fable's word.** *(high confidence)* N1 raised it as
asked rather than choosing silently, and I confirmed the choice is inert: neither `roomEmergence`
nor `roomSavedItems` is emitted by `NotificationRouter` or mapped by `DeepLinkHandler`, and the
table is read only by `openExternal`. The in-tab push rule delivers the behaviour steward §7·A
wanted regardless. It is a one-word ruling, not a rework.

**m8 · The flag-on root has zero UI-test coverage.** *(high confidence · pre-existing, W1a's
design)* `--uitesting` forces every flag off unless `-PatinaFlags` names it, and `ios-gate.sh ui`
passes no such argument — so `PatinaUITests` exercises only the legacy root. Everything proving the
bar is a unit test plus ten simulator screenshots. Correct per W1a, worth stating at the wave level.

**m9 · No lint on the four new files.** *(high confidence)* `lint-delta` is steward-only, so
new-warning status for `HouseFirstRoot.swift` (319 lines, a type plus a six-function extension) is
unknown until integration. The dispatcher was split into five helpers in `ContentView` precisely
because of `function_body_length`; the copy inherits that shape, so I expect it clean.

**m10 · Two pins are string-literal fragile.** *(medium confidence)*
`onlyTheTwoRootsOwnANavigationPath` matches the literal `NavigationStack(path:` — a line-wrapped
call slips past. `theFlagOffRootStillCarriesTheW2Shape` matches
`.companionHearthReservation(isActive: reservesRootCompanionHearth)` character for character, so a
harmless reformat reddens it. Both are the house style and both are better than nothing; noting the
failure mode.

**m11 · `.accessibilityHint("Double tap to open")` on the Companion slot.** *(high confidence)*
VoiceOver already speaks "double tap to activate" for a button; the hint duplicates the gesture
instead of describing the outcome. "Opens the Companion" would carry information.

**m12 · The shot ledger has nine rows for ten shots.** *(high confidence)* `w3-n1-08b` is described
inside row 08's cell rather than given its own row. Trivial, but the ledger is the artefact the
walker indexes.

---

## What I checked and found sound, so it is not re-litigated

- **The routing rule is the right call, and it is settled structurally rather than by table
  entries.** An in-app `navigate(to:)` pushing onto the tab already on screen — with only
  `openExternal` reading `RouteTabTable` — answers steward §7·A and §7·B in one stroke, and is
  pinned by `aRoomsBrowseNeverLeavesSpaces` and `theBellPushesOntoTodayRatherThanJumpingToStudio`.
  A tab-root route always selecting-and-popping means no door on the bar is ever pushed as a second
  copy. This is better than either option the steward offered.
- **The seam choice is why 122 view-layer call sites did not have to be touched.** Putting the tab
  layer under `AppCoordinator.navigate(to:)` rather than over it is the single decision that made
  this lane small, and it is guarded by two source pins.
- **The flag-off proof is honest.** N1 could have shipped a screenshot diff and called it green; it
  ran one, got 13.8 % differing, diagnosed the cause (a pre-W2-fix baseline plus relative dates and
  a time-of-day greeting that both moved between runs), and reported the diff as the real proof
  instead. That is C5 applied to its own evidence.
- **The AASA outcome is reported at the right claim level.** The universal link opened Safari; N1
  shot it (`08b`), named it a device claim the program does not make, and proved the identical
  `openExternal` → `RouteTabTable` path with the custom scheme instead. No overclaim.
- **`FeatureFlags.swift` was treated as read-only**, as assigned, and the first-launch-resolves-off
  deviation from W1a is respected: nothing on this root depends on a first-launch flag.
- **The Hearth policies take the flag as a parameter rather than reading `FeatureFlags` directly.**
  N1 tried the direct read first, found `@MainActor` broke `MoneyAndStudioCopyTests` /
  `InvoicesMoneyRailTests` from a nonisolated context, and backed out to a defaulted parameter that
  keeps the policy pure. Right answer, and the reasoning is recorded.

---

## Recommendation

**Merge the lane.** Nothing in it needs to go back to the implementer as a defect. Before the wave
closes, three things need an owner rather than a note:

1. **BL-1 — Fable rules on `.studio`.** If the honest route is minted, N1 said it is a small change
   and would make it; if `.profile` stands, the analytics and Companion consequence should be
   written into the canon digest so W4 does not read the funnel wrong.
2. **BL-2 — N3 retires the floating dock**, not "eventually" but as the first item of its lane. It
   is currently painting over the thing N1 built.
3. **BL-3 / MJ-5 — assign `DailyGreetingHeader.swift`, `MoneyScreenChrome.swift` and
   `Features/ProductDetail/**`.** Three unowned files now carry visible flag-on defects, and one of
   them also gates N3's B-8 anchor.

MJ-1 (a sync pin over the two dispatchers) is worth one small commit from N1 before N2 starts
editing tab roots; MJ-2 is a one-line correction to `n1-notes.md` and the shot ledger.
