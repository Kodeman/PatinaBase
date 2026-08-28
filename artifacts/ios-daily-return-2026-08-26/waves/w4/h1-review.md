# W4 · lane H1 review — rooms & budget

Reviewer: separate context, read-only against `.codex/worktrees/agent-dr-w4-h1`
(`daily-return/w4-h1`, 4 commits on `1cb71c346`). Checked against
`source/build-plan.md` §W4 + §W2-DONE carry-overs, `source/direction-b.md` §3/§2/§9 W3 row/§11
M2+M4, `waves/w4/steward.md` §4 (owned-file map), and `waves/w4/h1-tasks.md`.

## Verification performed

- Re-read the full diff (`git diff main...HEAD`, 16 files, all inside H1's owned set per
  `steward.md` §4 — no foul).
- Re-ran `ios-gate.sh build` on the lane's worktree: **`** BUILD SUCCEEDED **` first run**, matching
  the report (no stamp-phase retry needed).
- Re-ran `xcodebuild test -only-testing:PatinaTests/{RoomBudgetTests,RoomFitLineTests,
  RoomHeroCardTests,YourHouseRailTests}` on `dr-w4-h1` (`BA5B70BC-…`): **53/53 green**, including
  the two honesty-pinning tests discussed below.
- Read `h1-notes.md`, cross-checked every disclosed item against the diff.
- Opened `shots/w4-h1-06`, `-08`, `-11` to visually confirm the sheet-presents fix, the room-screen
  figures, and the Spaces gallery card.
- Confirmed `git status --porcelain -uno` clean and `.writer.lock.d` removed.

## Overall

Strong lane. Local-first/mirror shape for the budget (`RoomBudgetCoordinator`) is correct and
well-tested (local-only, synced, failed-mirror, explicit-null-on-clear — all four paths pinned).
The project-room read-only rule is unchanged and regression-pinned. Both roots render correctly
because none of H1's changes branch on `FeatureFlags`/`house-first` — the shared value types and
views compose the same way under both roots. Commits are Conventional, pathspec, and match the
owned-file map exactly. The two self-found defects (dropped `.sheet`, float round-trip) are real
fixes with real regression tests. Two findings below are worth Fable's attention; neither blocks
integration.

## Findings

### 1. `RoomGalleryCard`'s Budget cell still prints a dash for an unset budget — the "never a dash" rule applied everywhere else in this same diff is not applied here

- **File:** `apps/mobile/Patina/Patina/Features/Rooms/Components/RoomGalleryCard.swift:128-134`
- **Severity:** Medium — **Confidence:** High (read the code, confirmed by the lane's own test)

`RoomGalleryCard.budgetString(for:)`:
```swift
static func budgetString(for room: RoomModel) -> String {
    guard let cents = room.budgetCents else { return "—" }
    ...
}
```
Every other surface H1 touched treats an absent budget as "draw nothing" — `RoomModel.budgetLine`
(`nil`), `RoomHero.pieces` (the clause is simply missing), `HouseRoomCard.card(for:)` (same), and
`RoomScreenLines.figures` (`nil`, with a T4 test titled *"no pieces and no budget draws no figure
line at all — never a dash"*). `build-plan.md`'s M4 states row is explicit: *"no budget → the ghost
act, never a `—`."* The Spaces gallery card is the one place in this diff where the rule is not
carried through — and it is not accidental: the lane's own test pins the dash as correct:
```swift
#expect(RoomGalleryCard.budgetString(for: space) == "—")
```
(`RoomBudgetTests.swift:279`, verified passing on this run.)

This is disclosed in `h1-notes.md` §5 ("It now reads `room.budgetCents`, or `—` where none is set")
— so it is not hidden — but it is presented purely as a fix (the mislabeled data source, which it
does correctly fix) without flagging that the fallback itself is the honesty violation the rest of
the diff goes out of its way to avoid. It is not raised in §6 ("Open, for Fable") alongside the
other loose ends on this exact file (the `MANUAL ENTRY` copy, the `— MATCH` cell). A homeowner who
sets no budget on a room sees `—` under the word `Budget` on the Spaces tab — a screen every tier
visits — while the room's own screen and the Today hero correctly draw nothing for the same room.

**Suggested fix:** the stat's three-cell layout (`Items` · `Budget` · `Match`) can't drop a cell
without a redesign, so this is a Fable call, not a same-lane one-liner — e.g. print the *pieces*
total under a correctly-named label when there's no budget (the pre-W4 number, honestly labelled)
or leave the cell blank/hyphen-free with a different visual treatment. Flagging for a ruling.

### 2. The room screen now shows the room's dimensions in the opposite order from the row directly below it, on the same screen

- **Files:** `apps/mobile/Patina/Patina/Features/Home/Views/RoomHeroCard.swift:55-64` (unchanged by
  this diff, but newly reused on the room screen) and
  `apps/mobile/Patina/Patina/Features/Rooms/Components/SpatialMetadataRow.swift:44-49`
  (pre-existing, untouched)
- **Severity:** Low-Medium — **Confidence:** High (visually confirmed, `shots/w4-h1-08`)

`RoomScreenLines.make` (new, T4) composes its meta line from `RoomHero.dimensions(for:)`, which
formats `"\(width) × \(length) ft"` (width first). `SpatialMetadataRow.dimensionsString`, drawn
directly beneath it when the room is empty, formats `"\(length)' × \(width)'"` (length first). Both
are correct math for the same room; nobody derived a wrong number. But before this diff the room
screen drew no raw `W × L` text at all — the old `metaLine(for:)` only ever composed
`squareFeet`/`orientationLabel`/`windowCount`/a scanned date. T4 is what puts a width-first
`"14 × 18 ft"` on screen for the first time, directly above a length-first `"18' × 14'"` that was
already there. `shots/w4-h1-08` shows both lines on one screen for the same room:
```
14 × 18 FT · 252 SQ FT · TYPED, NOT SCANNED
📐 18' × 14'   🧭 South-facing   🪟 2 windows   🚪 1 door
```
That reads as two different rooms to a careful person, for a screen whose whole purpose (M4's
sheet: *"the numbers on it must be correctable"*) is that the numbers are trustworthy. Not
disclosed in `h1-notes.md`. Both functions are outside H1's diff in the sense that neither's
*formatting order* was written by this lane, but T4 is what puts them on the same screen for the
first time, so the inconsistency is new user-visible surface area from this lane's work, not a
pre-existing bug this lane merely inherited silently.

**Suggested fix:** pick one order (probably width × length, matching `direction-b.md`'s `18 × 14 ft`
convention and `RoomHero.dimensions`) and fix `SpatialMetadataRow.dimensionsString` to match — a
one-line change, but the file is outside H1's owned set (`Features/Rooms/Components/` is owned;
double-checked — it *is* inside H1's map, `Features/Rooms/**`), so this is fixable in-lane if Fable
wants it in W4 rather than filed as a carry-over.

## Confirmed correct (spot-checked, no issue)

- **Local-first + mirror:** `RoomBudgetCoordinator.setBudget` writes local unconditionally before
  any network call; local-only rooms never call the remote; a synced room's PATCH failure downgrades
  to `.pending`/`needsSync` without losing the local value; clearing sends an explicit `null` via
  `AnyCodable`/`NSNull()`, confirmed round-tripping to `encodeNil()` — a PostgREST-correct clear, not
  an omitted key.
- **Project-room read-only rule:** `HouseRoomCard.card(for: RemoteProjectRoom)` (the project path)
  is untouched by this diff; `RoomProjectView` only ever opens a local `RoomModel` (`Query` filters
  on `RoomModel.self`), so a project room has no route into the edit acts by construction — pinned
  by `aProjectRoomStaysReadOnly`.
- **Both roots:** no `FeatureFlags`/`house-first` branching anywhere in the diff; the touched views
  (`RoomHeroCard`, `YourHouseRail`, `RoomProjectView`, `RoomGalleryCard`) are shared components, not
  root-specific, so the sim check's claim (both flag states) is structurally sound, not just
  observed.
- **`@Model` field safety:** `budgetCents: Int?` (implicit `nil`) and
  `measuredWithUnitControl: Bool = false` (explicit default) both default correctly for an existing
  store; the class's custom `init` doesn't need to set either, which is correct Swift/SwiftData
  behavior, not an oversight.
- **Deviation on M4's stat row (moving the budget off `"$2,400 OF $9,000 BUDGET"` into its own
  labelled line):** correctly grounded in `direction-b.md` §3's own example line
  (`"$2,400 in saved pieces · budget $9,000" — labelled, never a spend figure"`), not an
  invented call. Disclosed clearly in `h1-notes.md` §4.1.
- **Steward §4a (`RemoteSavedItem.notes`/`price_cents_at_save`):** delivered as recommended, tested,
  disclosed for H2 to skip filing its own note.
- **The two self-found defects** (dropped `.sheet(isPresented:)`, the `17.999999999999996` round-trip)
  are real, each with a regression test, and the sheet fix was re-verified live
  (`shots/w4-h1-06` shows it presenting correctly).
- Commits: 4, Conventional (`feat`/`fix`), pathspec (verified per-commit `--stat`), all within
  `steward.md` §4's H1 map. `git status --porcelain -uno` clean, `.writer.lock.d` absent.
- Test evidence matches the report: build succeeded first run; the four owned/new suites (53 tests)
  pass on the lane's clone, re-run independently.

## Not re-verified (would need the full 1115-test run / broader sim walk, out of scope for a
targeted lane review)

- The report's whole-tier claim ("1115 tests … 126 suites … TEST SUCCEEDED") — plausible given the
  53-test targeted re-run was clean and the diff touches only H1-owned files, but not independently
  re-run in full here.
- `waves/w4/h1-notes.md` §6 items (the hard-coded $2K–$5K range, the `— MATCH` dash, the
  `galleryMetaLine` copy, the Companion-orb overlap) are correctly identified as pre-existing and
  correctly routed to Fable rather than fixed in-lane — no action needed from this review.
