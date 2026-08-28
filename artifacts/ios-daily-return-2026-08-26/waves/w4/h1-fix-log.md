# W4 · lane H1 — fix log (round 1)

Against `waves/w4/h1-review.md`. Branch `daily-return/w4-h1`, worktree
`.codex/worktrees/agent-dr-w4-h1`. Blocking findings: none raised. Major: one.

---

## Major 1 — `RoomGalleryCard`'s Budget cell printed `—` for an unset budget — **FIXED**

**Finding:** `RoomGalleryCard.budgetString(for:)` returned `"—"` when `room.budgetCents == nil`,
against B M4's states row (*"no budget → the ghost act, never a `—`"*) and against the rest of the
same diff (`RoomModel.budgetLine`, `RoomHero.pieces`, `HouseRoomCard.card(for:)`,
`RoomScreenLines.figures` all draw nothing). The lane's own test pinned the dash as correct, and
`h1-notes.md` §5 disclosed it as a fix without naming it as the honesty gap it was.

**Disposition: changed, not rebutted.** The reviewer read it as a Fable call because the stat row
looked like a fixed three-cell layout. It is not — each cell is `.frame(maxWidth: .infinity)` and
each divider is its own view, so the row composes correctly with two cells and one divider. No
redesign was needed and no ruling is owed.

`apps/mobile/Patina/Patina/Features/Rooms/Components/RoomGalleryCard.swift`:

- `budgetString(for:)` now returns `String?` — `nil` where no budget is set, never a dash.
- New `RoomGalleryCard.statCells(for:)` builds the row: `Items` always, `Budget` **only when a
  budget exists**, `Match` always. `stats` iterates that list and draws a divider between cells.
- `matchString` promoted to a static function so the row builder can call it; its behaviour is
  byte-identical.

The dropped cell is a real absence, not a substitution: nothing else moves into the `Budget` slot,
and in particular the saved-pieces total (`$890` for the walked room) never appears under any
label it does not name. Pinned by an assertion, below.

**Tests** (`apps/mobile/Patina/PatinaTests/RoomBudgetTests.swift`):

- `theGalleryCardPrintsTheBudget` — the pinned `== "—"` is now `== nil` (the dash-pinning line the
  reviewer flagged is gone from the suite).
- New `theGalleryCardDropsTheBudgetCellWhenThereIsNone` — with no budget the row is exactly
  `["Items", "Match"]` and carries no `$890`; with `budgetCents = 900_000` it is
  `["Items", "Budget", "Match"]` and the Budget cell reads `$9.0K`.

The suite header's own claim (*"an unset budget draws nothing at all, never a `—`"*) is now true of
every surface the suite covers, the gallery card included.

**Live proof** (clone `dr-w4-h1`, both roots, `-DeploymentTarget local`, `client@patina.dev`):
`shots/w4-h1-14-flagon-spaces-no-budget-cell.png` and `-18-flagoff-spaces-no-budget-cell.png` show
`0 ITEMS | — MATCH` on a room whose budget was removed through the sheet; `-15` and `-17` show
`0 ITEMS | $9.0K BUDGET | — MATCH` on the same room with the budget set, on the flag-on and flag-off
roots respectively. The clear→re-set cycle also exercised the mirror live in both directions:
`public.rooms.budget_cents` for `19703872-…` went null and back to `900000` (`updated_at`
12:01:20Z), so the local state and the DB row are back exactly as `research/01-shot-ledger.md`
recorded them.

### Not changed, and why — the `— MATCH` cell one cell to its right

`matchString` still returns `"—"` when a room has no `averageMatchScore`. That dash is a different
claim: the match score is a figure **Patina** has not computed yet, not a figure its owner declined
to supply, and the em-dash idiom for it is SP-18's, pre-existing, and used identically by
`RoomProjectView`'s `— ROOM MATCH`. It is `h1-notes.md` §6.2's open item and the review's own
"no action needed from this review". The mechanism to drop it is now in place (one `if let` in
`statCells`) if Fable rules the other way — it is a one-line change plus a test, not a redesign.

---

## Finding 2 (Low-Medium) — `18 × 14 ft` above `14' × 18'` on one screen — **NOT changed; raised**

**Disposition: rebutted as an in-lane fix, escalated as a ruling.** The reviewer is right that the
two orders sit on one screen for the first time because of T4, and right that
`SpatialMetadataRow.swift` is inside H1's owned map. It is still the wrong lane fix:

1. The two rows disagree on **more than order** — `RoomHero.dimensions(for:)` prints
   `14 × 18 ft` (a unit word) and `SpatialMetadataRow.dimensionsString` prints `18' × 14'` (prime
   marks). Making them agree is a copy ruling on two idioms, not a swap of two operands, and W1b
   lane C owns the room-copy rulings (`TYPED, NOT SCANNED` came from there; `h1-notes.md` §6.3
   raises `galleryMetaLine` for the same reason).
2. `SpatialMetadataRow` draws on surfaces outside this wave's walk; changing its string changes
   them all, and no test in any lane pins its order today.
3. Silently reordering a *stored* pair of numbers is exactly the class of change that should be
   ruled rather than assumed, even when both orders are arithmetically correct.

The correct order is almost certainly `RoomHero`'s (`direction-b.md` writes `18 × 14 ft`), and the
fix is one line in `SpatialMetadataRow.dimensionsString` plus its unit word. **Filed for Fable**;
H1 will take it in a follow-up round on one word from the steward.

It was not disclosed in `h1-notes.md` — a real miss on the lane's part, since the walk shot
(`w4-h1-08`) shows both lines. It is now in `h1-notes.md` §6.5.

---

## Gate after the fix

- `apps/mobile/Patina/scripts/ios-gate.sh build` → **`** BUILD SUCCEEDED **`**, first run.
- `xcodebuild test … -only-testing:PatinaTests` on `dr-w4-h1`
  (`BA5B70BC-07A5-4F40-94A3-B6A7A307205B`), `-derivedDataPath .build/dd` →
  **`** TEST SUCCEEDED **` · 1116 tests in 126 suites** (1115 before; the new gallery-row test is
  the one addition).
- Sim check re-run on both roots (flag-off and `-PatinaFlags house-first`), shots 14–18.
- No `ios-gate.sh all`, no `lint-delta` (steward-only).
