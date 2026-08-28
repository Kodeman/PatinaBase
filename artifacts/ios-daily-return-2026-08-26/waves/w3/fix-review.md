# W3-fix — adversarial review (role V, separate context, read-only)

Branch `daily-return/integration` in `.codex/worktrees/agent-dr-w3-integration`,
`ccf1031f7` → `a3fd05af9`, six commits, no push (`git log origin/daily-return/integration`
→ no remote branch). Reviewed against `waves/w3/rulings-fable.md` 1–4, 6, 7,
`integration.md` §6–§7, `n1-notes.md` §3–§4, `n3-notes.md` §2, `n3-fix-log.md`,
`steward.md` §1/§7, and `fix-tasks.md`. Every commit read in full; the nine
`shots/w3-fix-*.png` read on glass. Gates were **not** re-run — this role is
read-only — so every gate claim below is checked against the source and the
shots, not against a fresh `xcodebuild`.

**Verdict: no blocking findings. Every one of the six rulings landed as ruled.**
Two MAJOR findings and seven MINOR/informational ones follow.

---

## 1. Ruling by ruling — what actually landed

| Ruling | Landed | Evidence |
|---|---|---|
| **R1** hoist the tour, tag the bar, gate the header pill | **YES** | `HouseFirstRoot.body` = `FirstLaunchTour(canAutoStart:) { rootContent }`; `PatinaTabBar.item(_:)` returns `control.firstLaunchTourAnchor(.profileMonogram)` only on `if tab == .studio`; raw value still `profile-monogram`; `DailyGreetingHeader` gains `showsStudioControl: Bool = true` with the pill **and its anchor inside the gate**; `DailyRoomView` passes `!coordinator.isHouseFirstRoot` and hosts the tour on the flag-off branch only. `eachRootHostsExactlyOneTourModel` scans all of `Patina/` and pins the host set to exactly `{DailyRoomView.swift, HouseFirstRoot.swift}`. `everyDefaultStepAnchorHasExactlyOneProductionMountPerRoot` is a genuine map (anchor → allowed file, `mounts == 1` inside, `== 0` everywhere else), which is stronger than the count it replaces. Shot `w3-fix-04`: header carries bell + `?`, no pill. |
| **R2** mint `AppRoute.studio` | **YES** | `case studio` + `displayName "Your Studio"` (so `analyticsScreenName` falls out of the `default:` arm); arms added in **ten** switches — both dispatchers (`ContentView`, `HouseFirstRoot`, verbatim), `AppCoordinator.navigate` push list, `AppCoordinator.updateContext` clear list, `RouteTabTable.tab(for:)`, `CompanionContext.contextSummary` + `.contextIcon`, `CompanionActionProvider.screenItems` + `studioPanelTitle` + `CompanionAreaBuilders.studioItems`, `CompanionViewModel.screenIdentifier`, `CompanionAPIClient.screenIdentifier`. `rootRoute(for: .studio) == .studio`. Analytics parity row `(.studio, "Your Studio")` added and `legacyScreenName == nil` pinned. |
| **R2** Settings / Sign Out / Delete Account from the Studio tab | **YES — traced end to end** | `StudioTabRoot` = `ProfileView().tabRoot(.studio)` → `ProfileView:160` `profileActionRow(icon:"gearshape", label:"Settings") { coordinator.presentedSheet = .settings }` → the sheet driver is on **`ContentView`'s outer body** (`ContentView.swift:84-89`), outside `mainContent`, so it serves both roots → `SettingsView` (its own `NavigationStack`) carries `"Sign Out"` (`:81`) and `"Delete account"` (`:89`) directly, plus a `NavigationLink` to `AccountView`, which carries both again. Three taps from the bar. Shots `w3-fix-05`/`06`. |
| **R3** one owner for the bottom clearance | **YES, in all ten files** | `bottomClearance(houseFirst:)` over `pinnedFooterClearance(houseFirst:)`; the eight money views each read `coordinator.isHouseFirstRoot` live (grep: 8/8 have `@Environment(\.appCoordinator)`); `ProductDetailView` branches on the same flag. `pinnedFooterClearance` has exactly one production caller, so the constant change is contained. |
| **R3** the test pin updated, not silenced | **YES, and strengthened** | `MoneyAndStudioCopyTests:250`'s source pin becomes `MoneyScreenMetrics.bottomClearance(houseFirst:` **and** a new `#expect(source.contains("coordinator.isHouseFirstRoot"))` per file — it now pins that the flag is read, not merely that the symbol is named. `InvoicesMoneyRailTests:282` and `TopBandFoldTests:68` re-aimed at `houseFirst: false` (the root they were written about). Two new behavioural pins added. |
| **R4** one step list on both roots, `.todayRecord`, renumber pinned | **YES** | `preHouseFirstSteps` deleted (zero references left in `apps/mobile/Patina`); `DailyRoomView`'s flag-off host drops `steps:`; `.addToRoom` retired from the list, case kept, and `theRetiredAnchorIsInNoStepList` forbids any list naming it while no view mounts it. The renumber is pinned **behaviourally**, not by comment: `aGuestWithAnEmptyRecordSeesStepOneOfTwo` registers only `.homeGreeting` + `.profileMonogram`, waits out the settle window, and asserts `totalSteps == 2`, `currentStepNumber == 1` → `2`, `isOnFinalStep`. This is the exact revert `n3-fix-log.md` specified, three edits and four test deletions, no more. |
| **R6** auto-start gated on the tab **and** the depth | **YES** | `TabNavigationModel.isShowingTodayRoot = selected == .today && stack(for: .today).isEmpty`; `HouseFirstRoot` reads it; `theTourGateIsClosedWhileAnotherTabIsOnScreen` walks all four transitions; a source pin forbids the root re-deriving the expression. Shots `w3-fix-01` (lands on Pieces, no tour) / `w3-fix-02` (starts on Today). |
| **R7** canon digest | **YES** | `research/11-canon-digest.md` §6 carries **C23** with the `RouteTabTable` / `steward.md §1` reference and the `roomEmergence` / `roomSavedItems` consequence, plus the tab-root exception. Uncommitted working-tree edit in the main checkout, as instructed. |

### Canon, checked directly

- **`legacyMainContent` is byte-for-byte W2's.** `git diff main -- ContentView.swift` is
  `+27 −1`; the single deleted line is the `private var mainContent: some View {`
  *declaration*, replaced by the flag wrapper plus a `private var legacyMainContent:
  some View {` declaration. The body below it is untouched.
- **C4 names**: `.studio.displayName == "Your Studio"`, and `ProfileView` reads
  `PatinaTab.studio.canonicalName` rather than re-typing it (`TabRootTitleTests`
  now asserts the literal `"Your Studio"` does **not** appear in `ProfileView`).
- **C8's cap**: the `.studio` menu is 4 rows + the provider's 2-row tail = 6 exactly
  (shot `w3-fix-07`), and `CompanionActionMatrixTests.allRoutes` gained `.studio`,
  so the ≤6 / ≤1-suggested / HOME-tail invariants cover it.
- **Honesty (C5)**: no fabricated copy; the shortened tour is a stated, tested
  behaviour; the R3 correction is documented with the measurement that forced it.
- **Hygiene**: every one of the 40 changed files is under `apps/mobile/Patina`; no
  `Secrets.swift`, no `.env`, no `git add -A` shape; six Conventional Commit
  subjects, one ruling each plus the lint split; no push.

### The R3 number

The correction from `8` to `barRowHeight + 8 = 57` is right, and the arithmetic
closes against the shots rather than against prose. On `dr-w3-int` the safe-area
bottom is 840 pt and the bar row is 791–840. `w3-fix-08` puts the `Add to Room`
capsule's lower edge at 783 — exactly `840 − 57` — i.e. 8 pt above the bar's top
hairline. The before-figure (754–804, identical on both roots) is the tell the
implementer names: a `safeAreaInset` on the stacks' container does not reach a
`NavigationStack`'s pushed destinations. `barRowHeight` is 49 and
`PatinaTabBar.itemHeight` is 49, pinned equal. I could not fault this.

---

## 2. Findings

### MAJOR

**V-1 — step 3's popover covers the Studio tab it points at.**
*Severity: major · Confidence: high (shot + source).*
`FirstLaunchTourAnchorModifier` attaches `.popover(isPresented:, arrowEdge: .top)`
(`FirstLaunchTour.swift:750`). `arrowEdge: .top` places the card **below** the
anchor, which is correct for `.homeGreeting` at the top of Today —
`w3-fix-02` shows the caret pointing up at the greeting — and impossible for an
anchor on the bottom bar. In `w3-fix-03` the card is repositioned by UIKit with
**no caret**, spanning roughly x 75–402 / y 680–843 pt, so it lies over the bar
row (791–840) and hides the `Spaces`, `Pieces` and `Studio` labels entirely: the
reader is introduced to a door they cannot see while the popover naming it is up.
The letter of the merge rule is met (step 3 *is* on the bar, and the header pill
is gone), which is why this is not blocking — but the whole point of R1's hoist
was that step 3 could finally *point at* the Studio tab, and as shipped it
occludes it. The fix is one expression: the arrow edge has to follow the anchor
(`.bottom` for `.profileMonogram` on the bar, `.top` elsewhere), and the shot
that proves it is a re-take of `w3-fix-03` with the Studio label visible.

**V-2 — on the flag-on Studio tab a signed-in reader gets a Companion row pointing
at the screen they are already on.**
*Severity: major (low end) · Confidence: high (source; not reachable in the
guest-only walk).*
`CompanionContextProvider.appendTail` appends `profileRow()` — *"Your profile ·
Style · Settings · Portal"*, route `.profile` — to every signed-in menu **except
`.profile`**, and its own doc comment states that exclusion exists precisely so a
screen does not offer itself. R2 minted a **second** route onto the same
composition (`StudioTabRoot` = `ProfileView`) and did not extend the exclusion, so
on `.studio` a signed-in user sees a row that pushes a duplicate `ProfileView`
onto the Studio tab, on top of the `ProfileView` that is the tab's root — the same
screen twice, the second copy with a back chevron. The row count stays at C8's 6,
so the DEBUG assert and `CompanionActionMatrixTests` pass; `w3-fix-07` was shot as
a **guest**, where the tail is `signInRow` instead, so the walk could not see it
either. One-word fix: `} else if screen != .profile && screen != .studio {`.

### MINOR / informational

**V-3 — `ProfileView`'s unconditional 120 pt tail is now the Studio tab's tail.**
*Severity: minor · Confidence: high.*
`ProfileView:167` ends with `Spacer().frame(height: 120)` — a dock-sized
reservation. As a **tab root** the bar already reserves its own 49 pt through
`safeAreaInset`, so the Studio tab now scrolls to ~120 pt of dead space, which is
the class R3 was ruled to close. Mitigating and the reason this is minor, not
major: the other two tab roots already do the same (`YourSpacesView:97`
`Spacer().frame(height: 120)`, `RecommendationsView:278` `.padding(.bottom, 120)`),
so this is a pre-existing wave-wide item that R2 extended to a fourth surface
rather than a new defect — the retired `StudioTabRoot` used `.padding(.bottom, 24)`.
It clips nothing. Worth a named owner in W4 alongside the `safeAreaInset` item the
report already flags as not-its.

**V-4 — `.profile` stopped being a tab root, and one in-app door moved with it.**
*Severity: minor · Confidence: high.*
Correctly disclosed in the report and pinned from both sides by
`RouteTabTableTests` (`isTabRoot(.studio)`, `!isTabRoot(.profile)`). The
consequence nobody walked: `DailyRoomView:231` — the Record's *"See all"* —
calls `navigate(to: .profile)`, which on the flag-on root used to select the
Studio tab and pop it to root and now pushes a full `ProfileView` onto **Today**,
titled nothing, with a chevron. That is C23's push rule behaving as written, so it
is not wrong; it is simply a changed landing that the flag-on walk did not cover.
No deep link or push notification maps to `.profile` or `.studio`
(`DeepLinkHandler`, `NotificationRouter` — grep returns nothing), so the external
doors are unaffected.

**V-5 — the Studio tab's Companion lost the QR row; the path survives elsewhere.**
*Severity: minor · Confidence: high.*
Before R2 the Studio tab reported `.profile`, so its Companion menu was
`accountItems`, which is the only menu carrying the QR / *"Sign in on the web"*
row (`CompanionActionMatrixTests:203` pins `route == .profile && signedIn`). It is
now `studioItems`, which has no QR row. Patina Field pairing is still reachable —
`SettingsView:71` carries *"Sign in on the web"* → `presentedSheet = .qr` — so this
is a changed route to a live door, not a lost one. Naming it because
`reference_feature_flags` / the Field-pairing runbook describe the QR door by its
old location.

**V-6 — the gate line's baseline number is wrong (the delta is right).**
*Severity: minor · Confidence: high.*
The report says *"1080 tests in 124 suites … (was 1077/123 at the base)"*. The base
was **1074**: `integration.md` §3b records `passed 1074 failed 0` on the same
device, and `git grep -c '@Test'` over `PatinaTests/` gives 1074 at `ccf1031f7` and
1080 at `a3fd05af9`. So the delta is +6, which reconciles exactly with the six
`@Test` declarations this round nets (+2 R1, +1 R2, +2 R3, −1 R4, +2 R6), and the
suite count +1 is `StudioDoorTests`. Nothing is missing; the stated baseline is
just off by three and will not line up against `integration.md` when Fable
compares waves.

**V-7 — the W3-fix wave record is on no branch.** *Severity: minor · Confidence: high.*
`git ls-files` on the integration branch returns the fourteen N1/N2/N3/steward
files and **not** `waves/w3/fix-tasks.md`, `waves/w3/rulings-fable.md`,
`waves/w3/walk.md`, this file, or any of the nine `shots/w3-fix-*.png` (2.3 MB,
`sips -Z 1100`, all present in the main checkout's working tree). This is
`integration.md` §8's trap repeating one round later. Fable's ff-merge should carry
them over the way `39543c9c0` carried N2's and N3's, or the round's evidence
survives only as untracked files.

**V-8 — two written contracts now contradict what ships, and the amendment is still owed.**
*Severity: minor · Confidence: high.*
R4 is ruled and correctly implemented, but B-8's *Rollback* clause (*"the tour is
gated by the same `house-first` flag as the root it describes"*) and W3's
acceptance line (*"flag off restores the W2 root byte-for-byte"*) are both still
literally true in the source docs and false in the binary: the flag-off tour's
copy and its step count both moved. The commit body says so plainly — *"B-8's
Rollback clause and W3's acceptance line want amending"* — and nothing amended
them. Two sentences in `source/direction-b.md` and the plan's W3 acceptance line.

**V-9 — `ContentView` is no longer `+19/−0` against `main`, and that is correct.**
*Informational · Confidence: high.*
The brief's expectation was written before R2. The file is now `+27 −1`: the
wrapper (+19, unchanged) plus R2's two dispatcher arms, and the one deletion is the
`mainContent` declaration line. `legacyMainContent`'s body is byte-identical, and
the `.studio` arm added to `ContentView`'s dispatcher is unreachable on the
flag-off root (nothing on that root produces `.studio`) — it exists because both
dispatchers are exhaustive, which is what `theTwoRootsDispatchTheSameDestinations`
requires. The canon holds; the number to check against in future rounds is
"`legacyMainContent` unchanged", not "+19/−0".

**V-10 — ruling 5 confirmed open, and R4 widened its blast radius.**
*Informational · Confidence: high.*
This round's own shots reproduce it: `w3-fix-02` reads *"This is your Daily Room —
picks and stories chosen for your space."* and `w3-fix-03` reads *"Your profile /
Rooms, saved pieces, and settings live here."* — Sanity's retired bodies, because
`resolvedBody` is `loaded?.body ?? step.fallback?.body`. Worth adding to the
ruling-5 note: now that R4 points **both** roots at the same three surface keys,
publishing the three documents in `n3-sanity-copy.md` changes the flag-off root's
tour too. That is what R4 wants, but it means the content op is no longer a
flag-on-only change and cannot be staged behind the flag.

---

## 3. What I did not verify

- **The gates.** `ios-gate.sh build`, the 1080-test run, and `lint-delta main` were
  not re-run (read-only role). The `lint-delta` story is at least self-consistent:
  `HouseFirstRootTests.swift` is 444 lines after `a3fd05af9` split
  `StudioDoorTests.swift` (83 lines) out of it, both under SwiftLint's 500-line
  file ceiling, and the split moved two `@Test`s with no assertion changed
  (diff-verified line by line).
- **The signed install and the simulator state.** Taken from the report; the nine
  shots are consistent with it (correct device chrome, guest session, both roots).
- **Anything needing a signed-in account**: the `Sign Out` / `Delete account` rows
  are inside `if authService.isAuthenticated` in `SettingsView`, so the guest walk
  proves the path and not the rows, exactly as the report states. V-2 is the item
  Kody's signed-in walk should look for first.
