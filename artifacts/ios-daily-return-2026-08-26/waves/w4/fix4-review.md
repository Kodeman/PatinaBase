# W4 — fourth fix round (F4): review (V4)

Reviewer V4, separate context, read-only. Reviewed commit `2ba1864de` on
`daily-return/integration` at `.codex/worktrees/agent-dr-w4-integration`
against ruling 1 (`waves/w4/rulings-fable.md`) and the root cause recorded in
`waves/w4/fix3-log.md`. Everything below was checked against the actual diff,
the actual files at commit tip, and the two proof screenshots — not against
F4's prose alone.

## Verdict: PASS. Ruling 1 landed correctly, on a clean single commit.

## What I checked and confirmed

- **Order.** `HouseRoomCard.cards` now returns `localRooms.sorted { $0.createdAt
  > $1.createdAt }.map(card(for:)) + projectRooms.map(card(for:))` — her rooms
  first, newest first, project rooms after. `DailyRoomViewModel.swift:438` is
  the only caller. `RoomStore.allRooms()` already returns
  `SortDescriptor(\.createdAt, order: .reverse)`, so the in-function sort is
  redundant with the normal caller but makes "newest first" a property of
  `cards` itself, provable without depending on the caller's fetch order — the
  report's own justification, and it checks out.
- **Width rule.** `cardWidth(inContainerOfWidth:) = min(280, max(200, width *
  0.72))`. Hand-checked: `cardWidth(320) = 230.4` (no clamp), `cardWidth(200) =
  200` (floor), `cardWidth(0) = 200` (floor), `cardWidth(1024) = 280`
  (ceiling), `cardWidth(402) = 280` (ceiling — 402×0.72 = 289.44, clamped
  down). `gutter = PatinaSpacing.md`, confirmed `= 16` in
  `PatinaDesignKit/Tokens/PatinaSpacing.swift:18`; `mdLarge = 20`, confirmed
  for the leading-padding arithmetic. So on 402 pt, second card x = 20 + 280 +
  16 = 316, matching both the new test and the on-device shot below.
- **Peek, on glass.** `shots/w4-fix4-01.png`: Guest Bedroom card fills from the
  left edge, Dining Room's left edge and a visible slice of its content sit
  inside the viewport at the right — exactly the described peek, not a
  cropped-to-invisible sliver.
- **Accessibility wrap, on glass.** `shots/w4-fix4-02.png`: Guest Bedroom,
  Dining Room, Living Room stacked full-width, in that order, at an
  accessibility text size. `layout(for:)` returns `.wrapped` only for
  `.isAccessibilitySize`, which is true for `.accessibility1`…`5` and false for
  `.xxLarge`/`.xxxLarge` — matches SwiftUI's actual `DynamicTypeSize` semantics,
  and the report's own terminology note about this (brief said "XXL", ruling
  says "accessibility sizes") is accurate and worth keeping for whoever reads
  the ruling later.
- **Heights follow content.** The room card's old `.frame(width: 240)` is now
  `.modifier(HouseCardWidth(wide:))`, with `.frame(minHeight: 150)` kept as-is
  (round 3's fix, untouched). `Add a room`'s old hard `.frame(width: 128,
  height: 150)` is now padding + `.frame(width: wide ? nil : 128)` +
  `.frame(maxWidth: wide ? .infinity : nil, minHeight: 150)` — it was the one
  card round 3 missed, and it's fixed here, as claimed.
- **Tests updated, not silenced.** `projectRoomsComeFirst` is renamed to
  `personsRoomsComeFirst` with its expected order flipped — not deleted, not
  weakened. `import SwiftUI` was needed and added for `DynamicTypeSize`. I
  hand-verified every new test's arithmetic against the production code above
  (`aCardIsAShareOfTheViewport`, `theCardWidthIsClamped`,
  `theSecondCardStartsOnScreen`, `theRoomSheMadeIsNeverPushedOffTheEdge`,
  `thePersonsRoomsAreNewestFirst`, `theRailWrapsAtAnAccessibilitySize`,
  `theRailStaysARailBelowThat`) — all correct, none tautological.
- **No unrelated change.** `git show --stat` on `2ba1864de`: exactly
  `YourHouseRail.swift`, `YourHouseRailTests.swift`, and
  `CompanionHearthView.swift`. The third file's diff is a 2-line doc-comment
  reflow only — no code changed. I independently confirmed
  `CompanionHearthView.swift` was 501 lines at parent `d5760170f` (one over
  SwiftLint's `file_length` warning threshold of 500) and is exactly 500 lines
  now — the disclosed, out-of-scope lint fix checks out precisely as
  described, not just approximately.
- **Pathspec commit, clean worktree.** One commit, three files, nothing else
  touched. `git status --short` on the worktree is clean. `.writer.lock.d` does
  not exist (rmdir happened). Branch is `daily-return/integration` as
  expected. Device `C57E9DB6-5C0E-4DA7-9F5E-148AC241E54D` (`dr-w4-fix4`) is
  gone from `simctl list devices` — cleanup happened. Both proof PNGs exist on
  disk at the paths given and show what the report says they show. Nothing was
  pushed (not checked directly, but no evidence to the contrary and the report
  doesn't claim otherwise).

## Findings

### MINOR — "Added six" undercounts the tests actually added by one (self-report accuracy, not a code defect)

- **File:** `apps/mobile/Patina/PatinaTests/YourHouseRailTests.swift`
- **Severity:** minor. **Confidence:** high.
- The TESTS bullet in the report says "Added six" and then lists five discrete
  items plus a sixth combined item ("the wrap across all five accessibility
  sizes plus all seven non-accessibility sizes"). That combined item is
  actually *two* separate `@Test` functions —
  `theRailWrapsAtAnAccessibilitySize` and `theRailStaysARailBelowThat` — not
  one. The diff shows 8 added `@Test(` lines, one of which is the rename of
  the pre-existing `projectRoomsComeFirst` → `personsRoomsComeFirst`, leaving
  **7** genuinely new tests, not 6. Interestingly, the report's own gate
  numbers ("1253 tests... F3's baseline was 1246; +7 are the new rail tests")
  get the delta right — so the discrepancy is internal to the report (a
  narrative miscount against its own gate-verified number), not evidence
  against the actual coverage, which is fine. Flagging only because the
  program runs on Honesty (C5) and self-consistency in what gets reported
  matters when a later reader (Kody, or the next round) counts on the prose.
  No code or test change is needed.

## For the walker — round 3's four commits, what to specifically probe on glass

Round 3 (`89219a906`, `8ce516b2b`, `a849b39fd`, `d5760170f`) is unit-verified
only per `fix3-log.md` — the gesture harness died mid-session and none of it
has been walked. F4 only re-confirmed the overlap piece of `a849b39fd` at
default text size. The round-4 walk should specifically cover:

1. **`89219a906` — un-save from every surface.** Add a piece to a room, then
   remove it three different ways in three separate passes: (a) the product
   detail screen's own Save/remove control, (b) the Saved row's own Remove
   action, (c) a Recommendation card's menu. After each, confirm: the room's
   saved-piece count and budget total both drop, and the piece does not
   reappear in the room, in Saved, or in any Companion count pill. This is the
   one where a partial removal previously left the room "saying one saved
   piece and counting its price against the budget" — that's a money-adjacent
   correctness claim (C5) and deserves all three paths walked, not one.
2. **`8ce516b2b` — Companion's one sheet driver.** Specifically try to trigger
   the SP-06 local-store claim sheet ("Keep them?") at the same time
   something else could compete for `.sheet` — e.g. open the `?` help panel
   right around a claim-eligible sign-in — and confirm the claim sheet still
   presents (this was the losing sheet in the old two-modifier-chain race,
   and per the commit message a stuck loser leaves
   `LocalStoreClaim.isAsking` true forever, suppressing hydrate for the whole
   session). Also confirm swipe-to-dismiss the claim sheet behaves the same as
   tapping "Keep them" — the commit claims parity there specifically. Then
   confirm the ordinary help-panel open still works normally (regression risk
   from moving to an enum-keyed `.sheet(item:)`).
3. **`a849b39fd` — story/rail overlap, at XXL specifically.** F4 only re-proved
   the 16 pt gap at *default* text size (incidental to the F4 shot, not a
   deliberate re-check). The original defect was worst at XXL (~13 pt overlap,
   stealing taps per the walker's original finding). Round 4's walk should set
   Dynamic Type to XXL (not an accessibility size — this is `.xxLarge`, which
   per this round's own `layout(for:)` still renders the rail as a horizontal
   strip, not wrapped) and confirm the story card no longer overlaps or steals
   taps from the rail there.
4. **`d5760170f` — Companion rows scroll at accessibility size.** Open the
   Companion panel at an accessibility text size and confirm "Your spaces" and
   "Your profile" are reachable by scrolling — on the flag-off root the
   Companion is the app's only nav surface, so this is a hard blocker if it
   doesn't scroll. Also glance at a normal text size to confirm the column is
   visually unchanged there (the commit claims "unchanged at every other
   one").

One more thing worth the walker's eye, not a round-3 item: in
`shots/w4-fix4-02.png` the floating Companion button sits directly on top of
the "Living Room" card's text at the accessibility size shown. It's plausibly
just a screenshot-timing artifact of where the button always floats, and not
something this round's diff touched or claims to have fixed — but if the
button's hit target overlaps a room card's hit target at accessibility sizes,
a tap meant for the room could land on the Companion instead. Worth one
tap-and-check while AX5 is already dialed in for item 3 above.
