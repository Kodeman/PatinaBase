# W1 · L1-C — task list (Layout, Companion, Dynamic Type)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1c`, branch
`first-flight/w1-l1c`, base `ba83aa67f` (W0 merge). Merges **first** in D14's order, so every diff
into another lane's file is a one-line deletion or a one-token swap and is listed as such.

---

## Standing lines

**1 — simulator.** Every `xcodebuild`/`simctl` call in this list runs with

```bash
export IOS_GATE_UDID=82831284-4F33-4B4A-ADB2-5F7104DB4EA1
```

and the explicit udid on the command line. Launch is
`xcrun simctl launch 82831284-4F33-4B4A-ADB2-5F7104DB4EA1 cloud.patina.app -DeploymentTarget local`
— **no `-PatinaFlags`** (D1a: `house-first` is the default-true answer, and the walkers must see the
bar). Repeat the argument on every relaunch. HID preflight before trusting any input.

**2 — VISION check.** No fix in this list adds tab, zone or dashboard UI beyond D1's ruling, a
shadow, red/green status, a badge, engagement optimisation, or the word "AI". Every row is a
subtraction or a reflow:

- T2/T3/T4/T5 (L0.4's four doors + the Spaces door) **remove five controls**.
- T7 (C-05) **removes** a `?` and renames two labels.
- T10 (A1-14) **deletes** a placeholder card.
- T13 (B-27) replaces a floating capsule with an in-flow title — one screen, no new chrome class.
- T14 (A-45) **stops** the product-detail controls scrolling away; it adds no control.
- The one thing that could read as new chrome is **T16**'s pinned pay footer on the invoice
  detail. It survives the check because it is the *same* Pay button the screen already draws,
  moved from below the fold to above it (`GAP2-24` measured it at y=875 on an 874 pt screen). It
  is not a bar, carries no status colour and no count.
- `companionCoachmark` and the tour bubble keep their existing single "Got it" / "Skip · Next"
  acts; T11 and T12 change where they sit and what colour they are, not how many there are.

**3 — the notes this lane must apply.** *(Rewritten in the fix round, 2026-09-02. The first draft of
this section was written at ~17:5x, before `l1-e-copy-deck.md` (18:06) and the L1-A / L1-D / L1-F /
L1-B blocks landed in `l1-c-notes.md`; it said the deck did not exist and that L1-A's guest sign-in
row had no note text. Both statements were false by the time the branch closed, and review row
`RL1C-18` caught the mismatch. What follows is the whole inbox — every block in `l1-c-notes.md`,
applied or declined in writing, per PROGRAM.md §7 step 2 and §3.)*

**Applied.**

| # | Note | Source | Where |
|---|---|---|---|
| T2 | `C-L04-1` — Today: stop passing the help closure | L0.4 | `DailyRoomView.swift` |
| T3 | `C-L04-2` — Companion: stop passing the help closure | L0.4 | `CompanionOverlay.swift` |
| T4 | `C-L04-3` — Piece detail: remove the `?` chip | L0.4 | `ProductDetailView.swift` |
| T5 | `C-L04-4` — Studio: remove the `?` corner | L0.4 | `ProfileView.swift` |
| T6 | `B-L04-1` — Spaces: remove the `?` door | `l1-b-notes.md`, moved here by steward ruling **S-1** | `YourSpacesView.swift` |
| T19 | `C-L1B-1` first half — `.refreshable` on the four tab roots | L1-B | four roots |
| T25 | `C-L1E-1`…`C-L1E-6` — the six copy-deck rows in this lane's files | L1-E deck | Companion rows, `ProfileView`, `SettingsView`, `RecommendationsView` |
| **F2** | `C-L1A-1` — `B-13`: the guest Studio CTA becomes **Sign in** → `.auth` | L1-A | `StudioHubView.swift` |
| **F3** | `C-L1A-2` — `C1-14`: Settings gets a signed-out sign-in row; the QR row moves inside the auth guard | L1-A | `SettingsView.swift` |
| **F4** | `C-L1A-3` — `A-52`: the two guest hints in `CompanionActionRows` | L1-A / L1-E deck | `CompanionActionRows.swift` + the two builders that thread `isAuthenticated` |
| **F5** | `C-L1B-2` — `C4-12`: `.refreshable` on the decision detail | L1-B | `DecisionDetailView.swift` |
| **F6** | `C-L1B-1` second half, **the two dropped steps** — `syncCompanionContext()` ×2 and `mirrorLastSeenIfNeeded()` in Today's `.refreshable`; `await StudioHubViewModel.shared.load()` in the Studio's | L1-B | `DailyRoomView.swift`, `ProfileView.swift` |

**Declined this wave, with the reason.** Every one of these needs a symbol that does not exist on
this lane's base (`ba83aa67f`) and is introduced by a lane that merges **after** L1-C (D14:
L1-C → L1-D → L1-B → L1-F → L1-A → L1-E). Verified absent by grep on the branch tip, listed with the
lane that must own the application after it merges. Because L1-C merges first and owns these files,
**the steward must route each row below to its named lane at merge**, or it is lost.

| Note | Symbol it needs | Verified absent | Owner after merge |
|---|---|---|---|
| `L1F→C-1` (`C2-07`) — the bell's one count | `BadgeCountService.unreadNotificationCount` | `grep -rn unreadNotificationCount Patina/` → 0 hits | **L1-F** (it adds the property; the one-line swap at `DailyRoomView.swift:271` goes with it) |
| `C-L1B-1` third half (`R-03`) — the staleness sentence on Today | `StudioHubViewModel.stalenessLine` | grep → 0 hits | **L1-B** |
| `C-L1B-3` (`C4-03`) — Your Spaces must not say "no rooms" about a failed fetch | `RoomSyncCoordinator.lastLoadFailed`, `PatinaErrorState` | grep → 0 hits | **L1-B** |
| `C-L1B-4` (`R-02`/`A-81`) — the bell must not assert absence | a "a fetch answered" flag on `NotificationsViewModel` (`hasLoaded`) | grep → 0 hits | **L1-B** (it owns the view model's load state) — the `unreadCountIsKnown` parameter on `DailyGreetingHeader` is a one-line addition L1-B can make in this file |
| `D→C-1` (`C-02`) — the Companion status line in dark mode | `PatinaColors.OnDark.secondary` | grep → 0 hits | **L1-D** |
| `D→C-2` (`C-01`) — the orb's optional hairline | `PatinaColors.Border.onDark` | grep → 0 hits | **L1-D** (and it is optional — "take it only if the screenshot says so") |
| `D→C-3` (`A-36`/`C-27`/`B-18`) — the missing-image state and the chrome scrim | `PatinaAsyncImage(caption:)`, `patinaChromeScrim`, `OnDark.primary` | grep → 0 hits | **L1-D** |
| `D→C-4` (`A3-01`) — the honest empty state | `PatinaEmptyState(.stillChoosingPieces)` | grep → 0 hits | **L1-D** |
| `D→C-5` (`A3-17`) — the story card with no hero | `PatinaAsyncImage(caption:)`, `OnDark.secondary` | grep → 0 hits | **L1-D** |
| `D→C-6` (`C3-01`) — the `pearl` hairline sites | `PatinaColors.Border.hairline` / `.strong` | grep → 0 hits | **L1-D** |
| `D→C-7` (`C3-15`/`C3-05`) — inline fonts and clay fills | `PatinaTypography.voiceSmall`, `PatinaColors.Interactive.active`, `clayInk` | grep → 0 hits for `voiceSmall` / `clayInk` | **L1-D** |
| `D→C-8` (`C-20`) — the disabled informational row | *no new symbol* — but the row it names, `HouseRecordCard.swift:375`, is only mis-contrasted **because** of L1-D's own token raise landing beside it; L1-D's note says its side is done and asks L1-C for the `.disabled` → `.allowsHitTesting` swap | n/a | **applied in the fix round** — see F11; it needs nothing from L1-D to compile |
| `D→C-9` (`GAP4-16`) — take both | n/a, a merge instruction | n/a | **steward** |
| `D→C-10` (`GAP1B-07`) — the global `.ghost` half is done on L1-D | n/a, a record | n/a | — |
| `C-L04-5` — the QR door | n/a, a record: the door is L1-A's | n/a | **L1-A** (reproduced in `l1c-notes-out.md` §4) |
| `C-L1A-4` — `GAP1B-08` / `P-34` are done in L1-A's files | n/a, a record | n/a | — |

`D→C-8` moved from "declined" to "applied" on a second read: it is the one L1-D note whose fix is
pure `Patina/**` layout with no kit symbol behind it, and `HouseRecordCard.swift` is in
`Features/Home/**`, this lane's own glob.

**4 — the notes this lane sends.** Written to
`build/waves/w1/l1c-notes-out.md` **and** appended to each target's notes file:

| To | Subject |
|---|---|
| L1-D | `GAP1B-07` second half — give `PatinaButton(.ghost)` a 44 pt floor globally (this lane fixes the two measured call sites) |
| L1-D | `GAP4-16` — the two lines this lane changed inside `RevealView.swift` (L1-D's file by name), so L1-D's `C3-15` edit at `:85`/`:127` does not conflict |
| L1-A | `GAP1B-08` — 44 pt minimum on the six auth text links, exact final text |
| L1-A | `P-34` — the Welcome screen at accessibility sizes, exact final text |
| L1-B | `C9-04` — the four one-line swaps in `Features/Rooms/Views/**` and `Features/{Documents,Projects}/**` this lane made, so the rebase is expected |
| L1-F | `C9-04` — the one-line swap in `ThreadListView.swift`; `ThreadDetailView.swift` is **untouched** (L07-02 is L1-F's) |

---

## Coverage — 28 findings, 28 tasks or reasons

| id | closed by | pinned by |
|---|---|---|
| `C9-04` | T1 | `CompanionInsetTests` |
| `C5-02` (context for T2–T6) | T2–T6 | `HelpDoorRemovalTests` |
| `C-05` | T6 + T7 | `HelpDoorRemovalTests`, `TapTargetTests` |
| `B-07`, `C-18` | T8 | `CoachMarkAnchorTests` |
| `A-100`, `C-23`, `A-99` | T9 | `SheetChromeTests` |
| `C5-05` | T9 | `SheetChromeTests` |
| `A1-14` | T10 | `RecommendationsFillTests` (source pin) |
| `A-50`, `B-10` | T11 | `CoachMarkAnchorTests` |
| `B-09` | T12 | `FirstLaunchTourTests` |
| `B-27`, `A-89` | T13 | `SheetChromeTests`, `CompanionInsetTests` |
| `A-45` | T14 | `SheetChromeTests` |
| `GAP1B-01`, `GAP1B-02`, `GAP1B-07` | T15 | `DecisionSheetDetentTests`, `TapTargetTests` |
| `B-28`, `GAP2-24` | T16 | `DecisionSheetDetentTests` (pinned-footer case) |
| `C6-18` | T17 | `TapTargetTests` |
| `B-60` | T18 | `SheetChromeTests` |
| `R-06` | T20 | `RecommendationsFillTests` |
| `C-06`, `GAP1B-03` | T21 | `DynamicTypeLayoutTests` |
| `GAP4-16` | T22 | `SheetChromeTests` (source pin) |
| `P-34`, `GAP1B-08` | **note to L1-A** (T23) | pinned in L1-A's lane |

---

## T1 — `C9-04`: one clearance, derived, not twenty literals

**Failing test first.** `PatinaTests/CompanionInsetTests.swift`:

1. `pinnedFooterClearance` is the only source — `companionBottomClearance()` returns it for both
   flag answers.
2. **Source scan.** Zero `.padding(.bottom, <literal ≥ 90>)` and zero
   `Spacer().frame(height: <literal ≥ 90>)` anywhere in `Patina/Features/**` **except**
   `Features/RoomScan/**`, which clears its own Whisper Bar and shutter, not the Companion
   (`reservesRootHearth(for: .scanFlow) == false` — `CompanionPresentationTests:134` already pins
   that). The exclusion is asserted with its reason in the failure message.
3. Every one of the sixteen call sites carries `.companionBottomClearance()`.

Run: red. **Implement:**

- `Design/Components/CompanionSafeArea.swift` — one new modifier
  `View.companionBottomClearance()`, a `ViewModifier` reading `@Environment(\.appCoordinator)` for
  `isHouseFirstRoot` and applying `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)`. It
  reads the flag itself so no call site repeats `coordinator.isHouseFirstRoot`.
- Sixteen one-line swaps (mine: `DailyRoomView:371`, `ProfileView:167`, `YourSpacesView:97`,
  `SettingsView:164`, `DailyStoryDetailView:150`, `DesignerConsultationView:46`,
  `RecommendationsView:278`; other lanes', one line each: `CrossRoomView:48`,
  `RoomProjectView:117`, `CollectionsView:188,291`, `DesignRequestStatusView:126`,
  `MatchIntroductionView:70`, `DocumentListView:22`, `ThreadListView:44`, `ProjectListView:46`).

**Why not inside `patinaScreen`,** which is the scaffold every pushed screen already applies:
`ThreadDetailView.swift` is one of them and **L1-F is adding its own
`pinnedFooterClearance` padding there for `L07-02`** (steward §5.4). A scaffold-level inset would
double with it in the one place a blocker is being fixed this wave. The money screens have the
same shape — ten of them already carry `MoneyScreenMetrics.bottomClearance(houseFirst:)`, which
`MoneyAndStudioCopyTests.moneyScreensShareOneChromeSource` pins by name — so the scaffold would
double there too. One modifier, applied once per scroll container, is the seam that survives both.
Recorded as a deliberate deviation from the brief's "at the scroll-container/root scaffold level":
it lands **at the scroll container**, not at the scaffold.

Commit: `fix(ios): derive every Companion bottom clearance from CompanionHearthMetrics (C9-04)`

## T2–T6 — the five `?` doors (`C5-02`, and the header half of `C-05`)

**Failing test first.** `PatinaTests/HelpDoorRemovalTests.swift` — source pins that
`DailyRoomView` passes `onHelpTap: nil`, `CompanionOverlay` passes `onHelp: nil`,
`ProductDetailView` has no `ProductDetailView.HelpButton`, `ProfileView` has no
`ProfileView.HelpButton` **and no empty leading-edge `HStack`**, `YourSpacesView` has no
`YourSpacesView.HelpButton`; and that all five files still contain `.helpPanel(`
(`ProductDetailRoomSaveTests:229` and `CompanionSheetDriverTests:77` depend on the sheet arms).

Implement exactly the text in `l1-c-notes.md` C-L04-1…4 and `l1-b-notes.md` B-L04-1.

Commit: `fix(ios): hide the five doorless ? help triggers (C5-02, C-05)`

## T7 — `C-05`: one `?` in the Spaces header, distinct labels

`YourSpacesView` still has two `HelpInfoIcon`s in the header band after T6 (`:71` yourSpaces,
`:158` newRoom) and one in the content (`:131` wholeHome), all three labelled "More information".
Drop the `newRoom` icon — its subject is the `+` button beside it — and give the two survivors
`accessibilityLabel:` values that name their subject. Pinned by `TapTargetTests`
(exactly one `?` in the header) and `HelpDoorRemovalTests` (no duplicate labels).

Commit: `fix(ios): one help affordance per Spaces header, with labels that name their subject (C-05)`

## T8 — `B-07` / `C-18`: the tooltip bubble

`HelpTooltip`'s popover body is sized `.padding(12)` → `.frame(maxWidth:)` →
`.fixedSize(vertical:)`, and the trigger's tap is an `.onTapGesture`, which VoiceOver cannot
activate. Reorder so the text's intrinsic height wins, give the bubble an opaque ground and real
vertical padding, and add an accessibility action so the trigger is reachable. `CoachMarkAnchorTests`
pins the order and the action.

Commit: `fix(ios): size the help tooltip from its text and make its trigger reachable (B-07, C-18)`

## T9 — `A-100` / `C-23` / `A-99` / `C5-05`: the Settings sheet

One sheet chrome: a `Done` control, a visible drag indicator, and the appearance override applied
**inside** the sheet (it reads the same `@AppStorage` key `PatinaApp` does, so switching back to
Light no longer leaves the sheet dark). Delete the `Help Center` row — `https://patina.cloud/help`
is a network-verified 404 that silently serves the marketing homepage. `SheetChromeTests`.

Commit: `fix(ios): one sheet chrome for Settings — Done, grabber, appearance, no 404 row (A-100, C-23, A-99, C5-05)`

## T10 — `A1-14`: delete the placeholder Matched Designer card

Commit: `fix(ios): drop the placeholder Matched Designer card (A1-14)`

## T11 — `A-50` / `B-10`: the Companion coach mark stops covering the panel

It is an `.overlay(alignment: .topLeading)` on `CompanionHearthView` with `.offset(y: -16)` — drawn
**on** the panel it describes. Move it into the same slot `introBubbleView` uses, above the Hearth
in the VStack. `CoachMarkAnchorTests` pins that it is not an overlay of the Hearth.
The tour popover's own placement is already correct (`B-10`'s codeNote); nothing there changes.

Commit: `fix(ios): anchor the Companion coach mark above the panel it explains (A-50, B-10)`

## T12 — `B-09`: the tour bubble in Patina's colours

`.font(.caption)/.headline/.body`, `Button(role: .cancel)` and `.borderedProminent` are the app's
only stock-iOS surface. Restyle to `PatinaTypography` + a clay confirm and a secondary Skip, with an
explicit `.tint` so the card does not depend on the global accent W0 set (`ed93064f6`).
`FirstLaunchTourTests`.

Commit: `fix(ios): restyle the first-launch tour card to the app's own system (B-09)`

## T13 — `B-27` / `A-89`: the floating title and the floating chevron

`ProfileView` is the only caller passing a non-nil `patinaScreen(title:)`, and only as the Studio
tab root. Render that title as an in-flow top band (`safeAreaInset(edge: .top)`, opaque ground)
instead of a floating capsule, so list content is inset below it and passes behind it. Give
`BackChevronButton` a material so it reads as chrome over scrolled content rather than a sticker on
it. `SheetChromeTests`.

Commit: `fix(ios): the Studio title is a band, not a floating capsule; the back control gets a material (B-27, A-89)`

## T14 — `A-45`: pin the product-detail top controls

The Back/Share/Save row is a child of the hero `ZStack` **inside** the `ScrollView`, so one swipe
takes it to y = -43. Lift it to an overlay on the outer container. `SheetChromeTests`.

Commit: `fix(ios): pin the product-detail top controls (A-45)`

## T15 — `GAP1B-01` / `GAP1B-02` / `GAP1B-07`: the two decision sheets

`.large` alone at `dynamicTypeSize >= .accessibility1` (content-driven otherwise), the button pair
moved into a bottom `safeAreaInset` so it never scrolls away, and `Cancel` off `.ghost` — which
renders as bare 17.6 pt text — onto `.secondary`, which is full width and 52 pt in the same
`PatinaButton`. `DecisionSheetDetentTests` + `TapTargetTests`.

Commit: `fix(ios): the decision sheets stay usable at accessibility text sizes (GAP1B-01, GAP1B-02, GAP1B-07)`

## T16 — `B-28` / `GAP2-24`: the invoice pay footer

Move `payFooter` out of the scroll flow into a bottom `safeAreaInset` with an opaque ground and the
`pinnedFooterClearance` the bar needs, so the Pay button and the failure banner are on screen at
rest and after a failure. `DecisionSheetDetentTests`.

Commit: `fix(ios): pin the invoice pay footer above the fold (B-28, GAP2-24)`

## T17 — `C6-18`: room-type chips

44 pt minimum, `.isSelected`, and a wrapping layout at accessibility sizes. `TapTargetTests`.

Commit: `fix(ios): room-type chips reach 44 pt, announce selection and wrap (C6-18)`

## T18 — `B-60`: the Add-a-new-room sheet

One opaque ground at a fixed detent, one tile treatment, SF Symbols for both rows in place of `◎`
and `📐`. `SheetChromeTests`.

Commit: `fix(ios): one ground and one icon system on the add-room sheet (B-60)`

## T19 — the `.refreshable` note (`C4-12`, `R-03`)

`DailyRoomView`, `ProfileView`, `YourSpacesView`, `RecommendationsView`. The Invoices screens
already have it.

Commit: `fix(ios): pull-to-refresh on the four roots L1-B named (C4-12, R-03)`

## T20 — `R-06`: Browse fills the screen

`.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)` before the `.background`.
`RecommendationsFillTests`.

Commit: `fix(ios): Browse fills the screen in every state (R-06)`

## T21 — `C-06` / `GAP1B-03`: the Today header at accessibility sizes

The greeting shares one horizontal band with the bell / help / Studio cluster, so the serif h1 is
squeezed to ~150 pt and breaks mid-word. Above `.accessibility1` the header becomes two rows —
greeting full width, controls beneath — and the display strings get `minimumScaleFactor` and
`allowsTightening`. `DynamicTypeLayoutTests`.

Commit: `fix(ios): the Today header reflows instead of breaking words (C-06, GAP1B-03)`

## T22 — `GAP4-16`: the Reveal's CTA in light mode

`StyleContinueButton` gains an explicit on-charcoal variant (default unchanged, so the four other
call sites are untouched); `RevealView` — L1-D's file by name — takes **two lines**: the variant on
the CTA and the semantic ground. Note to L1-D so `C3-15` at `:85`/`:127` rebases cleanly.
`SheetChromeTests` source pin.

Commit: `fix(ios): the Reveal's CTA is visible in light mode (GAP4-16)`

## T23 — the two notes out to L1-A (`P-34`, `GAP1B-08`)

Both live in `Features/Authentication/**`, L1-A's glob, and both carry `⇢L1-A` in this lane's own
table. Exact final text in `l1c-notes-out.md` and appended to `l1-a-notes.md`. Recorded **open** in
this lane with that reason.

## T24 — gates and the self-check

`ios-gate.sh build` · `release` · `unit` · `lint-delta main`, then the whole `PatinaTests` tier on
the clone, then the screenshots into `shots/w1-l1c/` with `ledger.md`.

---

## Outcome (written at close)

**Sixteen commits**, `ba83aa67f..5079b19e3`. Task numbering above is the plan; the commits group by
concern, because a file like `ProfileView.swift` carries `C9-04`, `C-L04-4`, `B-27`, the
`.refreshable` note and two deck rows at once and can only be staged once.

**Four things the plan did not foresee, each found by an existing pin or on the clone:**

1. `everyDefaultStepAnchorHasExactlyOneProductionMountPerRoot` requires exactly **one**
   `.profileMonogram` mount in `DailyGreetingHeader.swift`; T21's two layout branches each carried
   the modifier. Both now draw one `anchoredStudioControl`.
2. `C-L04-4` removed the 44 pt `?` row that was `ProfileView`'s **only** top spacing. The avatar
   takes it back — 44 pt pushed, 12 pt on the tab root where `patinaScreen`'s band supplies the rest.
3. `CompanionActionMatrixTests` pinned the six labels L1-E's deck row `C-L1E-1` renames; re-pinned.
4. `ProductDetailRoomSaveTests` and `CompanionSheetDriverTests` also asserted `presented = .help` —
   the line `C-L04-2`/`C-L04-3` remove. L0.4's note said they depended only on `HelpPanelSheet(`.
   Both now pin the arm and the sheet, which is what must survive round one.

**Two more, from the clone rather than a test:** the unread badge outgrew the bell it marks at
accessibility sizes once `GAP1B-03`'s row split made the cluster visible (capped, `5079b19e3`), and
moving the coach mark out of an inline `.overlay` dropped `CompanionOverlay`'s body from 502 lines to
497 — smaller, but across `type_body_length`'s *error* threshold into its *warning* band, which
`lint-delta` counts (region-scoped, `18fe1297f`).

---

# Fix round — 2026-09-02, after adversarial review (19 rows: 1 blocker, 7 major, 11 minor)

Same worktree, same branch, same clone `82831284-4F33-4B4A-ADB2-5F7104DB4EA1`. Tests first for every
row that a test can reach; the rows a test cannot reach say so and name the screenshot instead.

**Standing line 1 — simulator.** Unchanged: `export IOS_GATE_UDID=82831284-4F33-4B4A-ADB2-5F7104DB4EA1`,
explicit udid on every call, launch `xcrun simctl launch 82831284-4F33-4B4A-ADB2-5F7104DB4EA1
cloud.patina.app -DeploymentTarget local` with **no `-PatinaFlags`**, HID preflight before trusting input.

**Standing line 2 — VISION check on the fix round.** No row below adds tab, zone or dashboard UI
beyond D1's ruling, a shadow, red/green status, a badge, engagement optimisation, or the word "AI".
The rows worth naming because they *touch* something on that list:

- **F7 (RL1C-04)** changes an existing unread **badge** — it does not add one. VISION and L1-F's
  carried ruling allow exactly one count, on the bell and the app icon; this makes that one count
  stop covering the glyph it marks. Nothing is added; the badge's ceiling drops from `xxxLarge` to
  `large`.
- **F13 (RL1C-07)** replaces a translucent material with an opaque charcoal disc on the `.dark` back
  chevron. That is a ground, not a shadow — `PatinaShadows` is untouched, and the disc was already
  there.
- **F2/F3 (C-L1A-1 / C-L1A-2)** add two **sign-in** controls. Neither is engagement optimisation:
  both replace a dead end (a card pointing at Settings that had no sign-in row; a QR row a guest
  cannot use) with the door the finding asks for.
- **F9 (RL1C-16)** *suppresses* a coach mark. A subtraction.

**Standing line 3 — the notes to apply.** §3 above is rewritten in full: twelve applied (six of them
in this fix round, F2–F6 and F11), fifteen declined in writing with the absent symbol and the lane
that must own each after merge.

**Standing line 4 — the notes to send.** Appended to `l1c-notes-out.md` §§7–10 and to each target's
own inbox:

| To | Subject |
|---|---|
| L1-A | `StyleContinueButton.swift` gained a `ground:` parameter (defaulted; four other call sites untouched) — `Features/StyleConversation/**` is L1-A's glob and was never told (`RL1C-10`) |
| L1-D | `RoomTypePillRow.swift:56` (clay fill) and `:60` (pearl stroke) survive this lane's `C6-18` rewrite and are `C3-05` / `C3-01` sites L1-D must sweep after it merges (`RL1C-17`) |
| steward | three more `C9-04` one-line swaps in unassigned files — `CollectionsView.swift:188,291`, `DesignRequestStatusView.swift:126`, `MatchIntroductionView.swift:70` (`RL1C-11`) |
| steward | the fifteen declined notes above, each with its post-merge owner (`RL1C-01`) |

---

## F1 — `RL1C-01` + `RL1C-18`: the inbox ledger (docs only)

Rewrite §3. No test; it is the plan, not the code. Commit with the fix-round tasks.

## F2 — `C-L1A-1` (`B-13`): the guest Studio's CTA signs you in

**Test first.** `PatinaTests/GuestSignInDoorTests.swift` — `StudioHubView.swift` contains
`StudioHub.GuestSignInButton` and `coordinator.presentedSheet = .auth`, and no longer contains
`GuestSettingsButton`. Red, then apply the note's verbatim block.

## F3 — `C-L1A-2` (`C1-14`): Settings offers a guest a way to sign in

**Test first.** Same suite — `SettingsView.SignInButton` exists, is inside a
`if !authService.isAuthenticated` arm, and the `"Sign in on the web"` row is inside the
`if authService.isAuthenticated` arm (assert the QR row's source offset is greater than the guard's).

## F4 — `C-L1A-3` (`A-52`): the two guest hints in `CompanionActionRows`

**Test first.** `PatinaTests/CompanionActionMatrixTests.swift` gains two cases: `homeRow` for a guest
with no local rooms reads `"See what's on Patina"` and for every other state `"Back to your space"`;
`pieceActRow(.askAboutPiece)` reads `"Sign in and a designer will get back to you"` for a guest and
`"A designer will get back to you"` signed in. Thread `isAuthenticated` through
`discoveryItems` and `appendTail`; `hasLocalWork` comes from `context.roomCount > 0`.

## F5 — `C-L1B-2` (`C4-12`): `.refreshable` on the decision detail

**Test first.** `RefreshableRootsTests` — `DecisionDetailView.swift` contains `.refreshable` and the
call inside it matches the `.task`'s (`viewModel.load(decisionId: decisionId)`).

## F6 — `RL1C-08` + `RL1C-12`: the two refreshables that dropped steps

**Test first.** Same suite: `ProfileView`'s `.refreshable` contains `StudioHubViewModel.shared.load()`;
`DailyRoomView`'s contains `syncCompanionContext()` twice and `mirrorLastSeenIfNeeded()`.

## F7 — `RL1C-04`: the badge stops covering the bell

**Test first.** `DynamicTypeLayoutTests` — `UnreadBadge` caps at `.large`, not `.xxxLarge`. Then
photograph the header at `accessibility-extra-extra-extra-large` before and after.

## F8 — `RL1C-03`: `C-06`'s Companion half

**Test first.** `DynamicTypeLayoutTests` — the Companion row's `Text(label)` and `Text(hint)` chains
carry `minimumScaleFactor` and `allowsTightening` (chain-scoped, not a whole-file grep), and the
panel's action column scrolls unconditionally above `.accessibility1` rather than relying on
`ViewThatFits` to notice.

## F9 — `RL1C-16`: the tour does not draw over another tab

**Test first.** `CoachMarkAnchorTests` — `HouseFirstRoot` passes the tour a "still on Today" answer
and dismisses it when the selected tab leaves `.today`.

## F10 — `RL1C-05`: the six room-type chips fit at the default size

**Test first.** `TapTargetTests` — `RoomTypePillRow` offers a **wrapped** fallback before a
horizontal scroll, and any scroll fallback shows its indicator. Then photograph Manual Room Entry at
`large`.

## F11 — `D→C-8` (`C-20` body half): an informational row is not a disabled control

**Test first.** New case in `DynamicTypeLayoutTests` (contrast is L1-D's, the control class is
L1-C's): `HouseRecordCard` no longer carries `.disabled(row.route == nil)` and does carry
`.allowsHitTesting(row.route != nil)`.

## F12 — `RL1C-02`: the avatar monogram is centred

**Test first.** `SheetChromeTests` — `ProfileView`'s avatar `Circle()` chain applies `.overlay(` with
no `.padding(` between the `.frame(width: 80, height: 80)` and it. Then photograph the pushed
ProfileView.

## F13 — `RL1C-07`: the `.dark` back chevron on a ground it can be read on

**Test first.** `SheetChromeTests` — `BackChevronButton`'s `.dark` arm does not compose
`.regularMaterial`. Then photograph `DailyStoryDetailView`.

## F14 — `RL1C-06`: the keystone scan sees a two-line `Spacer().frame(height:)`

**Test first.** `CompanionInsetTests` — `hardCodedClearance` normalises whitespace over the whole
file, and a fixture string spelling the construct across two lines is detected. That turns the
existing keystone red on `ProductDetailView:474-476`; derive that figure from the screen's own act
bar rather than from `companionBottomClearance()` (the Companion figure is 57 pt on the house-first
root and the bar is ~117 pt tall — the review's literal suggestion would clip the sold-by block).

## F15 — `RL1C-19`: the clearance does not stack with the root reservation

**Test first.** `CompanionInsetTests` — `CompanionBottomClearance.height(houseFirst:rootReserves:)`
returns the air alone where the root already reserves the dock as safe area, and the whole
pinned-footer figure where nothing does.

## F16 — `RL1C-09`: one help affordance on Your Spaces

**Test first.** `TapTargetTests.spacesHeaderHasOneHelpAffordance` counts **every** `HelpInfoIcon` in
the file, not only the header's. Then drop the Whole Home icon.

## F17 — `RL1C-15`: the Settings Done button clears 44 pt in both axes

**Test first.** `TapTargetTests` — `SettingsView.DoneButton` carries `minWidth: 44`.

## F18 — `RL1C-13`: the three dead `.helpPanel` seams say they are seams

Comment at each `@State private var isHelpPanelPresented` naming C5-02 and W2; reword
`HelpDoorRemovalTests`' suite doc so the pin reads as *holding a seam open*, not as pinning a live
feature. No new test.

## F19 — `RL1C-14`: the Dynamic Type pins name their own subject

Chain-scope the three source greps (F8's mechanism). **Declined, with the reason:** an `ImageRenderer`
line-box assertion is not added. Rendering a `Text` and measuring its line boxes from a bitmap is not
something `swift-testing` can do without a text-layout harness this wave has no room to build and no
other suite to share it with; the mid-word claim stays **screenshot-verified**, and the shots are
named in the report and in `shots/w1-l1c/ledger.md`.

## F20 — `RL1C-10`, `RL1C-11`, `RL1C-17`: the notes that were never sent

Docs only. `l1c-notes-out.md` §§7–10, appended to `l1-a-notes.md`, `l1-d-notes.md` and `steward.md`.

## F21 — gates and the self-check

`ios-gate.sh build` · `unit` · `release` · `lint-delta main`, all four green, then the before/after
shots into `shots/w1-l1c/` with one ledger line each.

---

# Fix round 2 (2026-09-03) — the inbox that arrived after the first fix round closed

The first fix round closed at `117d547c8` on 2026-09-02 and was never reported; its work is on the
branch and was re-verified line by line this round (see the report). What follows is **new**:
`l1-c-notes.md` grew from 1,038 lines to 1,813 between then and now — thirteen further blocks
addressed to this lane, from five lanes' own fix rounds and reviews. Every one of them appears below
as a numbered task or a written decline, per PROGRAM.md §7 step 2 and §3.

## Standing lines (unchanged, restated for this round)

**1 — simulator.** `export IOS_GATE_UDID=82831284-4F33-4B4A-ADB2-5F7104DB4EA1`;
`xcrun simctl launch 82831284-4F33-4B4A-ADB2-5F7104DB4EA1 cloud.patina.app -DeploymentTarget local`,
no `-PatinaFlags`. HID preflight before trusting input.

**2 — VISION check.** Nothing in this round adds tab, zone or dashboard UI beyond D1's ruling, a
shadow, red/green status, a badge, engagement optimisation, or the word "AI". Two of the three code
tasks are **subtractions**: `G2` withholds a pill and a badge, and it withholds them *because* a
success colour on an absence is precisely the red/green status VISION §6 refuses — the one row this
round that the check does not merely survive but is motivated by. `G1` changes five codepoints.

## The notes this lane must apply — round 2

**Applied.**

| # | Note | From | Where |
|---|---|---|---|
| **G1** | `E3-L1C-1`, `E4-L1C-1`, `E4-L1C-2`, `E5-L1C-1` — five straight apostrophes → U+2019 | L1-E rounds 3/4/5 | `HomeStoryRetryRow.swift` ×2, `CompanionActionRows.swift` ×3, `DesignerConsultationView.swift` ×1 |
| **G2** | `O11` (`A-34`, `C-11`) — an unscored piece wears no match verdict | L1-B round 2 | `ProductDetailView.swift`, `RecommendationsView.swift` (badge **and** the combined a11y label) |

**Declined this wave, with the reason.** Each needs a symbol introduced by a lane that merges
**after** L1-C (D14: L1-C → L1-D → L1-B → L1-F → L1-A → L1-E). Verified absent by grep on the branch
tip today. **L1-C merges first and owns these files, so the steward must route each row to its named
lane at merge, or it is lost.**

| Note | Symbol it needs | Verified absent | Owner after merge |
|---|---|---|---|
| `L1F→C-1` / `L1F→C-2` / the `C2-07` half of `L1F→C-3` — the bell's one count | `BadgeCountService.unreadNotificationCount` | `grep -rn unreadNotificationCount Patina` → 0 hits (the *class* exists; the property does not) | **L1-F**, merge 4 — one line at `DailyRoomView.swift:282` |
| `L1F→C-3` — `RecordRefresh.run` must name the session it saves for | `RecordSnapshotStore.save(_:owner:)` — today's signature is `save(_:houseLine:now:)` | `grep -n "func save(" Core/Persistence/RecordSnapshotStore.swift` → no `owner:` | **L1-F**, merge 4 — one argument |
| `O12` (`L07-05`) — the Studio hub says *when* its numbers are from | `StudioHubViewModel.stalenessLine` | grep → 0 hits | **L1-B**, merge 3 |
| `O14` (`B-03`) — a deleted room leaves the Today rail | `LocalRoomSignal` (a **new file** on `first-flight/w1-l1b`) | grep → 0 hits | **L1-B**, merge 3. The note offers "if you would rather not take it, say so and it stays in S6" — **this lane says so**: it cannot compile here, and `l1b-notes-out.md` §S6 is the right home. |
| `D→C-12` (`C3-05`, `C3-01` on the room-type chip) | `PatinaColors.clayInk`, `PatinaColors.Border.strong` | grep → 0 hits | **L1-D**, merge 2 — and L1-D's own `D→C-13` already says so ("those are applied at merge 2 on the integration tip, not by L1-C"). Offsets moved this wave; see notes-out §14. |
| `D→C-13` — the two Companion files are a UNION merge | n/a, a merge instruction | n/a | **steward** |

**No action, recorded so the next reader does not go looking.**

| Note | Why nothing is owed |
|---|---|
| `E3-L1C-2` | L1-E fixed `StyleProfile.recommendationRationale` in its own worktree; `RecommendationsView.swift` needs no edit. The point of the note is that `C-38` is **not** closed by this lane alone. |
| `E3-L1C-4` | Explicitly "a W2 observation, not a W1 ask" — `CompanionContext.contextSummary`'s prompt nouns. |
| `A→C-1` | L1-A **withdrew** its substitution and took this lane's `P-34` item 2 text verbatim. A record, not an ask. |
| L1-E round 6 | `AskAboutPieceSheet.swift` is in no lane's globs; L1-E applied it. "Nothing in your worktree changes." |

**Declined with a judgement, not a missing symbol.**

`E3-L1C-3` + `E4-L1C-3` — **the greeting wrap.** `C5-06`'s longer strings ("Good evening", "Good
afternoon") wrap to two lines: on the flags-off root at the default size, and — per `E4-L1C-3`'s
correction — on the four-tab root at accessibility sizes too. The note gives no final text and says
in both rounds that **accepting the wrap is a legitimate answer**. This lane accepts it, and the
reason is this lane's own charter: `DailyGreetingHeader` already stacks its controls above
`.accessibility1` (`stacksControls(at:)`, `GAP1B-03`), so at the sizes `E4-L1C-3` photographs the
greeting has the **full width of the screen** and wraps between words, which is the outcome `C-06`
asks for. Forcing one line would mean `minimumScaleFactor` shrinking the app's signature serif on
its first screen, or truncating a four-word greeting — both worse than a two-line greeting. On the
flags-off root, D1 makes that root a kill-switch fallback. **No change.**

## G1 — the five apostrophes

**Test first.** `PatinaTests/CurlyApostropheTests.swift` — three cases, one per file, asserting the
curly form is present *and* the straight form absent, with both codepoints written as `\u{...}`
escapes rather than literals (a literal `’` and `'` are indistinguishable in a diff, which is how all
five got in). Red on all three, then apply. L1-E pins these too, but L1-C merges first and L1-E last,
so nothing holds the bytes on the integration tip for five merges without this.

## G2 — `O11`: an unscored piece wears no match verdict

**Test first.** `PatinaTests/UnscoredMatchPillTests.swift` — the guard is present in both files, the
combined accessibility label no longer interpolates `matchLabel` unconditionally, and `matchLabel`
still has the shape the guard assumes.

**One deviation from the note's final text, deliberate.** The note guards on
`Product.hasMatchScore`. That property is L1-B's and is **not on this lane's base** (grep → 0 hits),
so the guard is written as the predicate `hasMatchScore` is defined as — `product.matchScore > 0`.
Behaviour is identical; the rename is a merge-3 follow-up, sent as notes-out §13.

**Third site.** The note asks whether `RecommendationsView`'s third `matchLabel` use is inside a
scored-feed branch. It is not — it is `cardAccessibilityLabel`, and the note's own body says the
combined label "spoken as a card's headline attribute is the same claim". Guarded too; hiding the
badge alone would have left the claim audible and invisible, which is the worse of the two states.

## G3 — the shots the first fix round owed

`RL1C-05` and `RL1C-09` were changed but never photographed, and `RL1C-15` was never measured on the
clone. Four frames into `shots/w1-l1c/`, one ledger row each.

## G4 — notes out

`l1c-notes-out.md` §§13–15, appended to `l1-b-notes.md`, `l1-d-notes.md`, `l1-e-notes.md`,
`l1-f-notes.md` and `steward.md`.

## G5 — gates

`ios-gate.sh build` · `unit` · `release` · `lint-delta main`, all four green on the round-2 tip.
