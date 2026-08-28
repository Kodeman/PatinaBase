# W4 · lane H1 — rooms & budget — task list

Written by the H1 implementer before any code, per `source/build-plan.md`'s
"For agentic workers" note. Format: failing test → run → implement → run → pathspec commit.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-h1`, branch
`daily-return/w4-h1`, base `1cb71c346`. Simulator clone `dr-w4-h1`
`BA5B70BC-07A5-4F40-94A3-B6A7A307205B`. DerivedData `.build/dd`.

---

## What the code already does (read before writing)

- `RoomModel` (`Core/Models/RoomModel.swift`) stores `width`/`length`/`height` in **metres**,
  `squareFeet`/`formattedArea` convert; `totalInvestmentCents` sums the room's `SavedItem`s.
  **There is no budget field and no measured-with flag.** `updateDimensions(width:length:height:)`
  sets `hasBeenScanned = true` — it is the *scan* writer and must NOT be used by a typed edit
  (it would flip `TYPED, NOT SCANNED` to `SCANNED`, undoing F51).
- `RoomHero` (`Features/Home/Views/RoomHeroCard.swift`) already composes provenance, dimensions,
  piece count and the dated state line, and W2 deliberately left the budget out because
  `RoomModel` carried none (its own header says so). `HouseRoomCard`
  (`Features/Home/Views/YourHouseRail.swift`) already prints `budget_cents`/`committed_cents` for
  a **project** room and only `sq ft · N saved pieces` for a local one.
- `RoomSettingsView` has rename / type / scan card / share / delete — **no dimensions**, so M4's
  `Edit dimensions` route (`.roomSettings(roomId:)`) currently opens a screen that cannot edit them.
- `RoomProjectView` header prints `252 sq ft · South-facing · 2 windows · Scanned Aug 26`, a two-cell
  stat row (`Items`, `Room match`), and no budget and no acts row.
- The W1b segmented ft/m control is `ScanFallbackEntryView.unitToggle`
  (`Features/RoomScan/Views/…:149-159`) — **not H1's file**; H1 re-uses its shape in an owned
  component rather than editing it.
- `RemoteProjectRoom` already carries `budget_cents`/`committed_cents` and the room screen only
  ever opens a local `RoomModel`, so a project room has no edit act by construction — pinned, not built.
- `PatinaTests/` is a `PBXFileSystemSynchronizedRootGroup` (pbxproj:78-82), so **new test files
  need no pbxproj edit**. Neither do new sources under `Patina/`.
- 00537 §1 added `rooms.budget_cents integer` NULL. Nothing writes it.

## Owned files (steward.md §4)

`Features/Rooms/**` · `Features/Home/Views/{YourHouseRail,RoomHeroCard,AddToRoomSheet,AddedToRoomToast}.swift`
· `Core/Persistence/RoomStore.swift` · `Core/Network/RoomsAPIClient.swift` ·
`Core/Models/{RoomModel,RoomSummary}.swift` · suites `RoomHeroCardTests`, `YourHouseRailTests`,
`RoomCreationCoordinatorTests`, `FallbackRoomDraftTests` + new H1 suites.

**Not H1's, needed by deliverable 4's mount:** `Features/ProductDetail/**` is unowned. H1 builds
the fit line whole (value + view + tests) in `Features/Rooms/` and files the two-line mount as an
integration note in `waves/w4/h1-notes.md`.

---

## T1 — the room carries a budget and a measured-with flag

**Test** (`PatinaTests/RoomBudgetTests.swift`, new): a fresh `RoomModel` has `budgetCents == nil`
and `measuredWithUnitControl == false`; setting a budget through `RoomStore` stores the cents.
**Run** → red (no such members).
**Implement** `Core/Models/RoomModel.swift`: `public var budgetCents: Int? = nil` and
`public var measuredWithUnitControl: Bool = false`, both defaulted (`@Model` + an older store =
in-memory fallback otherwise — `feedback_ios_device_automation_traps_2026_08_25`). Add
`budgetLine` (`"budget $9,000"` or nil) and `savedPiecesFigureLine`
(`"$2,400 in saved pieces · budget $9,000"` per steward §7 — labelled, never a spend figure).
**Run** → green. **Commit** `feat(ios): a room carries its own budget and how it was measured`.

## T2 — the budget is written locally first and mirrored on sync

**Test** (same file): a `RoomBudgetCoordinator` over a stub `RoomBudgetRemote`
— (a) a local-only room (`remoteId == nil`): the value is stored, no PATCH is attempted,
`isLocalOnly == true`; (b) a synced room: the value is stored **and** one PATCH goes out carrying
`budget_cents` = the stored cents for that `remoteId`; (c) the remote throws: the value is still
stored locally and the room goes `.pending` (so a later sync picks it up); (d) clearing the budget
sends an explicit null.
**Run** → red. **Implement** `Core/Network/RoomsAPIClient.swift` `updateRoomBudget(id:cents:)` over
the existing `updateRoom(id:patch:)`, and `Features/Rooms/RoomBudgetCoordinator.swift` (new) in
`RoomCreationCoordinator`'s shape — protocol seam, local write can never fail, remote failure
downgrades instead of throwing. **Run** → green. **Commit**
`feat(ios): a room budget saves locally first and mirrors to rooms.budget_cents`.

## T3 — the rail and the hero print the real numbers

**Test** (`RoomHeroCardTests` + `YourHouseRailTests`, owned): a local room with 3 pieces and a
$9,000 budget renders `3 saved pieces · budget $9,000` on the hero and
`252 sq ft · 3 saved pieces · budget $9,000` on the rail card; with no budget neither prints one
and neither prints a `—`; a **project** room still prints `$18,400 of $32,000 committed` and is
still `isReadOnly` (regression pin for deliverable 2).
**Run** → red. **Implement** `RoomHero.pieces` and `HouseRoomCard.card(for: RoomModel)`; the
`cards(projectRooms:localRooms:)` and `RoomHero.make(room:)` signatures stay byte-identical because
`DailyRoomViewModel`/`DailyRoomView` are frozen/H2's. **Run** → green. **Commit**
`feat(ios): the house rail and the room hero print the room's real figures`.

## T4 — the room screen (M4): figures, the dated state line, and two acts

**Test** (`RoomBudgetTests`): the room screen's meta line reads
`18 × 14 ft · 252 sq ft · TYPED, NOT SCANNED`; its figure line reads
`$2,400 in saved pieces · budget $9,000`, degrades to `$2,400 in saved pieces` with no budget, and
is absent with neither; its state line is `RoomHero.stateLine`'s (dated state, never news).
**Run** → red. **Implement** `Features/Rooms/Views/RoomProjectView.swift`: a
`RoomScreenLines` value (testable without rendering) for the three lines, plus M4 block 6's two
ghost acts side by side — `Edit dimensions` → `.roomSettings(roomId:)`, `Set a budget` → the sheet
from T5. Stat row keeps its two cells; `Items` is relabelled `Saved pieces` (M4's own label).
Primary CTA untouched. **Run** → green. **Commit**
`feat(ios): the room screen carries its figures, its dated state line and M4's two acts`.

## T5 — Set a budget, and Edit dimensions on the segmented control

**Test** (`RoomBudgetTests`): `RoomBudgetSheet.parse("9,000")` → 900_000 cents; `""` → nil (remove);
`"abc"` → nil-with-no-write. `RoomDimensionEntry.metres(from: 18, unit: .feet)` == 18/3.28084 and
`(from: 5, unit: .metres)` == 5; a typed edit sets `measuredWithUnitControl` **and leaves
`hasBeenScanned` alone**.
**Run** → red. **Implement** `Features/Rooms/Components/RoomUnitToggle.swift` (new — the SP-19
segmented `Picker`, same shape as `ScanFallbackEntryView.unitToggle`, which H1 does not own),
`Features/Rooms/Views/RoomBudgetSheet.swift` (new), a Dimensions section in `RoomSettingsView`
using the toggle, and `RoomStore.setBudget` / `RoomStore.updateTypedDimensions` (the latter writes
metres + `measuredWithUnitControl = true` + `updatedAt`, and does **not** call
`RoomModel.updateDimensions`). **Run** → green. **Commit**
`feat(ios): Set a budget and Edit dimensions on the room, on the segmented unit control`.

## T6 — the fit line, gated on how the room was measured

**Test** (`PatinaTests/RoomFitLineTests.swift`, new): an 18 × 14 ft room measured on the segmented
control and an `84″ W × 38″ D` table →
`Your Living Room's longest wall is 18 ft. This table is 7 ft.`; the same room with
`measuredWithUnitControl == false` (every pre-existing room) → **nil**; a room with no dimensions →
nil; a piece with no width and no depth → nil; a metric piece (`unit: "cm"`) converts; the line
never contains "fits", "will fit", "perfect" or any promise.
**Run** → red. **Implement** `Features/Rooms/RoomFitLine.swift` (new): the value type + a small
`RoomFitLineView`. **Run** → green. **Commit**
`feat(ios): the fit line prints the two numbers, only for a room measured on the unit control`.

## T7 — the guest block keeps the light act first

**Test** (`YourHouseRailTests`): `StartWithARoomAct.ordered == [.typeTheDimensions, .scanIt]`,
the rail's `Add a room` dialog and `StartWithARoomBlock` both iterate `ordered`, and the titles are
`Type the dimensions` / `Scan it` (W4 regression pin over W2's ruling).
**Run** → expected green (the ruling landed in W2); if it is green with no code change, the task is
the pin, not a fix. **Commit** with T3's or on its own:
`test(ios): pin Start with a room's light-act-first order through W4`.

## T8 — steward §4a: `RemoteSavedItem` decodes `notes` and `price_cents_at_save`

Named by `waves/w4/steward.md` §4a as belonging in H1's file so H2 is not blocked behind an
integration note. **Test** (`RoomBudgetTests`): a `saved_items` row carrying `notes` and
`price_cents_at_save` decodes both; a row carrying neither still decodes.
**Run** → red. **Implement** two optional properties on `RemoteSavedItem`
(`Core/Network/RoomsAPIClient.swift`). **Run** → green. **Commit**
`feat(ios): the saved-item row decodes its note and its price at save`.

## T9 — gate, sim check, notes

- `apps/mobile/Patina/scripts/ios-gate.sh build` (twice on the first run in a fresh tree).
- `xcodebuild test … -only-testing:PatinaTests -destination id=BA5B70BC-…` — whole tier green.
- Sim check on the clone, `-DeploymentTarget local`, **both** with and without
  `-PatinaFlags house-first`; shots `shots/w4-h1-NN-*.png`; ledger rows under `## w4-h1`.
- `waves/w4/h1-notes.md`: the ProductDetail mount for the fit line, the T8 heads-up for H2, and
  every deviation.
- `rmdir .writer.lock.d`; `git status --porcelain -uno` empty.

## Out of scope, deliberately

M4's primary CTA (`Browse pieces for the Living Room` on the populated branch — the current
`Get design help with this room` is not named by the brief); the dimensions mirror to
`rooms.length_meters`/`width_meters` (only the **budget** mirror is named); removing
`RoomBudgetBar`/`BudgetAssessment`'s hard-coded $2K–$5K quiz range (a synthesis-graft question for
Fable, raised in `h1-notes.md`, not fixed here); the state line on the 240 × 150 rail card (two
lines of meta already fill it — the state line lands on the hero and the room screen).
