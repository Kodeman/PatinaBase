# W4 · lane H1 — integration notes (rooms & budget)

Written by the H1 implementer. Everything here is either a change outside the brief's literal text,
a request on a file H1 does not own, or a fact the integration steward or Fable needs.

**Branch** `daily-return/w4-h1`, cut from `main` @ `1cb71c346`. 5 commits (the fifth is the review
fix round — `h1-fix-log.md`).
**Gate**: `ios-gate.sh build` **SUCCEEDED** (first run, no stamp-phase retry needed);
`xcodebuild test -only-testing:PatinaTests` on `dr-w4-h1`
(`BA5B70BC-07A5-4F40-94A3-B6A7A307205B`) — **1116 / 1116 green, 126 suites** after the fix round
(1115 before it).
No `ios-gate.sh all`, no `lint-delta` (steward-only).

---

## 1. One file H1 needs and does not own — the fit line's mount

`RoomFitLine` (`Features/Rooms/RoomFitLine.swift`) is complete: the value type, the gate, the unit
conversions, the view (`RoomFitLineView`), and ten tests. **It is mounted nowhere**, because M3
block 8 draws it on the piece screen and `Features/ProductDetail/**` is in **no lane's owned set**
this wave (`steward.md` §4 — "everything not listed here is unowned").

The mount is three lines in `ProductDetailView`, under the price/spec block:

```swift
if let room = /* the reader's most recent local room */,
   let fit = RoomFitLine.make(room: room, product: product) {
    RoomFitLineView(line: fit)
}
```

The only open question is *which* room — B §5 says "Your Living Room's", i.e. the room in context.
`ContextMemoryStore.shared` already remembers the last room opened (`rememberRoom(id:)`, called from
`DailyRoomView` and `RoomProjectView`), which is the natural source and needs no new state.

**Recommendation:** this belongs to W5's client lane, which owns the order sheet the same line draws
on (B §5 item 4). H1 has left the value type and the view ready so W5's task is the mount, not the
rule. If Fable wants it on the piece screen in W4, it is an integration-steward edit of one file.

## 2. Steward §4a taken, not deferred

`RemoteSavedItem` now decodes `notes` and `price_cents_at_save`
(`Core/Network/RoomsAPIClient.swift`, commit 1). §4a recommended this land as H1's first commit so
H2 is not blocked behind an integration note; the brief's DELIVER list did not name it, so it is
flagged here rather than assumed. **H2 does not need to file its own note** — the two optional
properties are on `main`'s shape of the DTO as of this branch. If H2 has already filed one, the
steward should drop it rather than apply it twice.

## 3. Two defects the sim walk found in H1's own work, fixed in the same branch

1. **`Set a budget` did not present.** The budget sheet was attached with `.sheet(isPresented:)` to
   the acts row *inside* `RoomProjectView`'s `ScrollView`, while the root `ZStack` already carried
   `.sheet(item: $actionItem)`. The inner sheet was silently dropped — the button reported as
   enabled and tappable in the AX tree and did nothing. Fixed by collapsing both into one
   `RoomProjectView.Presented` enum behind a single `.sheet(item:)` on the root. Re-verified live
   (`shots/w4-h1-06`). **This is worth carrying as a repo-wide caution:** a second `.sheet` on a
   descendant of a view that already has one does not present here.
2. **`18.0` where the person typed `18`.** `RoomSettingsView` re-expressed the stored metres back to
   feet without rounding first, and `18 ft → metres → feet` returns `17.999999999999996`. Fixed by
   rounding to a tenth before the whole-number test; pinned by a test.

## 4. Deviations from the brief's literal text

1. **The M4 stat row keeps two cells, and the budget went on its own line.** M4 block 3 draws
   `3 SAVED PIECES · $2,400 OF $9,000 BUDGET`, but "$2,400 of $9,000 budget" reads as a spend
   figure, which C5 and `steward.md` §7 forbid in as many words ("labelled, never a spend figure:
   `$2,400 in saved pieces · budget $9,000`"). So the stat row keeps `SAVED PIECES` and
   `ROOM MATCH`, and the ruled B §3 line draws under the header instead. Every number M4 asks for is
   on the screen; the labelling is the ruling's, not the mock's.
2. **`Items` is relabelled `Saved pieces`** on that stat row — M4's own label for the same number.
3. **The dated state line draws on the room screen and on the Today hero, not on the 240 × 150 rail
   card.** The rail card's meta already runs to two lines with the budget clause; a third line
   clips at 150 pt. `h1-tasks.md` names this as a deliberate cut.
4. **The room screen's meta line is M4's three parts** — `18 × 14 ft · 252 sq ft · TYPED, NOT
   SCANNED`. Orientation and window count moved off it; they still draw in `SpatialMetadataRow`
   directly below (visible in `shots/w4-h1-05`), so nothing was lost.
5. **`ManualRoomEntryView` does not set `measuredWithUnitControl`.** It is feet-labelled but it is
   not the segmented control the ruling names, so a room typed there is silent for the fit line
   until its owner opens `Edit dimensions` and saves on the segmented control. This is the
   conservative reading of "measured after W1b's segmented control landed" and it is testable
   either way — if Fable wants the manual-entry path to count, it is one line in
   `RoomStore.createRoom`.
6. **Only the budget mirrors.** `updateTypedDimensions` writes metres locally and does **not** PATCH
   `rooms.length_meters`/`width_meters`. The brief names the budget mirror and only the budget
   mirror; a dimensions mirror is a one-method addition to `RoomsAPIClient` whenever it is wanted.
7. **Tests were written beside their implementation, not strictly red-first**, as W2's R2 lane also
   recorded. The gate that matters is discriminating in both directions and pinned in both:
   `theLinePrintsBothNumbers` (draws) and `anUnmeasuredRoomDrawsNothing` (does not).

## 5. Two H1-owned honesty fixes the walk surfaced, taken

Both in `Features/Rooms/Components/RoomGalleryCard.swift`, both one-liners, both C5:

- The Spaces gallery card's **`BUDGET` cell printed `room.totalInvestmentCents`** — the sum of the
  room's saved pieces, under a label that named something else entirely. It now reads
  `room.budgetCents`, and where no budget is set **the cell does not draw at all** — never a `—`
  (M4's states row). The first cut of this fix kept the dash; the review caught it and the fix
  round replaced it with a composed row (`RoomGalleryCard.statCells(for:)`), so a budgetless room's
  card reads `0 ITEMS | — MATCH`. See `h1-fix-log.md`. Pinned by
  `theGalleryCardPrintsTheBudget`. Without this the app would have stored a $9,000 budget and shown
  a different number under the word *Budget* on the Spaces tab (`shots/w4-h1-11`).
- The **`JUST SCANNED` badge drew on a room that was typed**, on the same card whose meta line read
  `MANUAL ENTRY`. It is now gated on `hasBeenScanned`.

## 6. Open, for Fable — not H1's to rule

1. **`RoomBudgetBar` / `BudgetAssessment` still measure a room against a hard-coded $2K–$5K.**
   `RoomProjectView` declares `budgetMinCents = 200_000` / `budgetMaxCents = 500_000` as
   "from user preferences / quiz; defaults for now", and the bar prints
   `Your range: $2.0K–$5.0K` under a derived fill fraction. That is the exact synthesis-graft the
   brief names — *"$3,590 saved · your range $5K+" prints the quiz's own band label, never a derived
   figure*. Now that a room carries a real `budgetCents`, the bar has a stored number to measure
   against and the invented range can go. **Not touched** (it is a behaviour change nobody asked
   for, and the quiz band is a different question). One ruling, then one small commit.
2. **`— ROOM MATCH` and `— MATCH`** print an em dash where M4's rule for the *budget* is "never a
   `—`". The dash idiom is pre-existing (SP-18's row) and applies to the match score, not the
   budget — a figure Patina has not computed, rather than one its owner declined to give. Left
   alone; worth one word from Fable. After the fix round the mechanism to drop it is in place
   (`RoomGalleryCard.statCells(for:)` already composes the row conditionally), so a ruling costs
   one line plus a test.
3. **`RoomModel.galleryMetaLine` still says `Manual entry` / `Scanned Apr 2`**, where F51 ruled the
   `JUST SCANNED` / `MANUAL ENTRY` pair replaced by `TYPED, NOT SCANNED`. The room screen and the
   Today hero both use the ruled wording; the Spaces gallery card does not. It is H1's file and one
   line, but it is W1b lane C's copy ruling, so it is raised rather than changed.
4. **The Companion orb sits over the room screen's acts row on the flag-off root.** At one scroll
   position the orb's 120 pt hearth (`{{0,720},{402,120}}`) swallowed the taps on both ghost acts
   entirely — that is how the sheet defect in §3 was first mistaken for a hearth problem. Scrolling
   a little clears it, and the flag-on root is clean because the Companion is in the bar
   (`shots/w4-h1-12`). Pre-existing (W2's one FAIL, ruled to the bar in W3, which fixed the flag-on
   root only) — but W4 puts two new primary acts into exactly that band, so it is worth knowing.

5. **The room screen now prints the same two numbers in two orders, one line apart** (raised by the
   review; not disclosed in the first pass — a miss). `RoomScreenLines.make` composes
   `RoomHero.dimensions(for:)` → `14 × 18 ft`; `SpatialMetadataRow.dimensionsString`, drawn
   directly beneath it, prints `18' × 14'`. Same room, correct math both times, two idioms (unit
   word vs prime marks) and two orders. `shots/w4-h1-08` shows both lines together. H1 did **not**
   change it: reconciling them is a copy ruling on two idioms (W1b lane C's territory, same as
   §6.3), and `SpatialMetadataRow` draws on surfaces this wave did not walk. The likely answer is
   `RoomHero`'s order and wording (`direction-b.md` writes `18 × 14 ft`); it is one line plus a
   test on one word from the steward. Reasoning in `h1-fix-log.md`.

## 7. What H1 did NOT touch

`DailyRoomView.swift`, `DailyRoomViewModel.swift`, `HomeComposition`, `TodayModules.swift`,
`HouseRecord.swift`, `ScanFallbackEntryView.swift` (W1b lane C's — its segmented control was
restated in an owned component, not reached across for), `Features/ProductDetail/**`,
`Features/Collections/**`, `ProjectsAPIClient.swift`, any migration, any seed, any pbxproj
(`Patina/` and `PatinaTests/` are both `PBXFileSystemSynchronizedRootGroup`s — pbxproj:70-87 — so
the four new sources and two new test files needed **no** project-file edit).

`HouseRoomCard.cards(projectRooms:localRooms:)` and `RoomHero.make(room:)` keep their exact
signatures, so the frozen `DailyRoomViewModel` and H2's `DailyRoomView` compile untouched.

## 8. Local database

H1 ran **no** `supabase db reset` and wrote no seed. The only DB writes are the ones the app made
through PostgREST as `client@patina.dev` during the sim walk: one `rooms` row (`Living Room`,
`19703872-7da9-4912-8ce4-a978b1a6f308`) and its `budget_cents = 900000`. Lane D owns the database;
if D resets, that row goes and nothing breaks.
