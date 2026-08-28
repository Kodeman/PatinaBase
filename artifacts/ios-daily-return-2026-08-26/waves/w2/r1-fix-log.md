# W2 · lane R1 — fix round

Branch `daily-return/w2-r1`, three fix commits on the seven build commits:

```
0368c5cc7 fix(ios): the record draws no date its own header contradicts
ebb4d9eeb fix(ios): a refused embed costs the designer's name, not the rows
3d05e027d fix(ios): the last visit is written where the widget can read it
```

Gate after the fixes (unsandboxed, foreground, `-derivedDataPath .build/dd`):

- `./scripts/ios-gate.sh build` → `** BUILD SUCCEEDED **`
- `xcodebuild test -only-testing:PatinaTests` → `Test run with 880 tests in 102 suites passed`
  (869 before the fix round; +11 new tests, no test deleted or weakened)
- the lane's seven suites, run alone → `Test run with 73 tests in 7 suites passed`
- signed simulator build: `.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`,
  `codesign -dv` → `Signature=adhoc`, `codesign -d --entitlements -` → `[Dict]` (empty)

---

## BLOCKING

### BL-1 — MOVED rows outside the window · **FIXED** (`0368c5cc7`)

`HouseRecordRow` gained `isStandingCondition: Bool` (additive; defaulted in the memberwise init,
`decodeIfPresent`-defaulted in the decoder, so no existing construction site or snapshot changes).
The builder now marks rather than silently exempts:

```swift
.compactMap { row -> HouseRecordRow? in
    switch row.kind {
    case .savedPieceRepriced:
        return row.asStandingCondition()
    case .matchedDesigner:
        return window.contains(row.date) ? row : row.asStandingCondition()
    default:
        return window.contains(row.date) ? row : nil
    }
}
```

- **(a) the false green test.** `everyRowCarriesARealDate` now asserts what the code holds —
  `window.contains(row.date) || row.isStandingCondition` — plus, for its own fixture, that nothing
  in it is standing. New test `aRowOutsideTheWindowIsMarkedAsAStandingCondition` builds a request
  picked up on Aug 5 against a last visit of Aug 26 and pins `!window.contains(row.date)`,
  `row.isStandingCondition`, `!row.isNew`.
- **(b) the missing signal.** R2 no longer re-derives the two `Kind`s: the flag is the contract, and
  it is written up for R2 in `r1-notes.md` §9.
- **(c) the cap.** The matched row is pinned out of the eviction set:

```swift
let pinned = moved.filter { $0.kind == .matchedDesigner }
let rest = moved.filter { $0.kind != .matchedDesigner }
let drawnMoved = (Array(pinned.prefix(maxRowsPerEyebrow))
    + rest.prefix(max(0, maxRowsPerEyebrow - pinned.count))).sorted { $0.date > $1.date }
```

New test `theMatchedRequestSurvivesTheCap` — three unread messages dated Aug 24/25/26 against a
request picked up Aug 5 — pins `moved.count == 3`, the matched row present, `hasMoreMoved`, and the
row last (still newest-first). Without the pin the old code drops it; the test is written against
exactly that.

### BL-2 — the discovering rows cannot reach a screen · **REBUTTED, and the ask is restated** (no R1 code change)

The review's own disposition is *"R1 rework: none required"* — the two halves that would feed these
rows are `ProductAPIClient.toProduct()` (unowned by every W2 lane) and a caller that fetches the
saved pieces' products by id (R2's `DailyRoomViewModel`). R1 owns neither file and edited neither.

Re-verified on this branch, so the steward is not taking it on trust:

```
$ grep -c "deleted_at" apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift
0
$ grep -rn "price_cents_at_save\|priceCentsAtSave" apps/mobile/Patina/Patina
Core/Network/RoomsAPIClient.swift:131:    public let price_cents_at_save: Int?   ← the declaration
Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:59    ← write
Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:175   ← write
Features/Recommendations/ViewModels/RecommendationsViewModel.swift:201 ← write
Features/ARPlacement/ViewModels/ARPlacementViewModel.swift:79        ← write
                                                    (one declaration, four writes, zero reads)
$ grep -rn "HouseRecordBuilder.build" apps/mobile/Patina/Patina | wc -l
       0        (the only callers are tests — the call site is R2's, r1-notes §3)
```

Behaviour today is the honest failure, not a wrong one: with no product carrying `deletedAt` and no
caller supplying `products:`, both rows draw **nothing**. Steward action needed, named in
`r1-notes.md` §1 with the exact two-hunk diff: assign `ProductAPIClient.swift` to a lane, and give
R2 the by-id product fetch.

### BL-3 — `LastSeenStore` wrote to `UserDefaults.standard` · **FIXED** (`3d05e027d`)

```swift
static let appGroupIdentifier = "group.cloud.patina.app"
let usesAppGroupDefaults: Bool

init(defaults: UserDefaults? = nil) {          // `defaults` is for tests
    ...
    let group = UserDefaults(suiteName: Self.appGroupIdentifier)
    self.defaults = group ?? .standard
    self.usesAppGroupDefaults = group != nil
```

Same honest-fallback shape as `RecordSnapshotStore`, same container, and the key is unchanged — so
nothing installed loses its idea of "new". New test `markSeenWritesIntoTheAppGroupSuite` writes
through `LastSeenStore()` and reads the value back out of
`UserDefaults(suiteName: "group.cloud.patina.app")`, restoring whatever was there first. It passed
in the test host, which also shows the suite opens without the entitlement being honoured — the
same condition the empty `codesign -d --entitlements` dict describes.

---

## MAJOR

### MJ-1 — the missing sentinel guard · **FIXED at the root** (`ebb4d9eeb`, `0368c5cc7`)

`RemoteDesignerRef.displayName` is now `String?` and returns nil rather than the literal
`"your designer"`, which removes the class the review named: there is one spelling of the fallback
and it lives with the copy (`subject(_:)` → `"Your designer"`). `resolveDesignerName`'s three
branches are symmetrical again. The one borrowed sentinel that remains is
`RemoteInvoiceDesignerRef.displayName` (`Services/API/InvoicesAPIClient.swift`, not R1's file); it is
filtered in the two places R1 owns — `HouseRecordBuilder.resolveDesignerName` (now
`first(where:)`, so a sentinel on the first invoice no longer stops the search) and
`StudioQueueBuilder.named(_:)`.

New test `aDesignerWithEveryNameColumnNullStillReadsAsASentence` decodes a decision whose embedded
profiles row has `display_name`, `full_name` and `business_name` all null and pins
`"Your designer asked you to choose."` and `!title.hasPrefix("your")`.

### MJ-2 — the embed on a query nothing can afford to lose · **FIXED by degrading** (`ebb4d9eeb`)

Both clients now retry once, on a 400 only, with the select they sent before this wave:

- `ProjectsAPIClient.projects(matching:)` → `select=*`
- `DecisionsAPIClient.decisions(matching:)` → `decisionSelectWithoutDesigner`, the same explicit
  column list with `project:projects(name)` and no `profiles`.

So a renamed constraint or a lagging schema cache on Strata costs a caption, not the project list,
the badge counts, the engagement tier or the Studio hub. New test
`theDegradedDecisionSelectKeepsEveryColumn` pins that the degraded select drops `profiles` and keeps
all thirteen columns the decoder needs. The steward's read-only probe against Strata is still worth
running, but it is no longer load-bearing.

### MJ-3 — the repriced row dated by the reader's own action · **FIXED as far as this lane can** (`0368c5cc7`)

The row is now **always** a standing condition: it never claims the save date as the change date,
and `markingNew(against:)` returns early for standing conditions, so it can never carry a "new"
tick earned by the reader's own save. What remains is the ruling the review flagged as Kody's or
Fable's — whether an undated price change should draw at all. R1's position, unchanged: it draws,
undated, or the discovering tier has nothing true to say. The test now pins
`row.isStandingCondition` and `!row.isNew` on the M2 lamp.

### MJ-4 — NEEDS YOU under-counting the Studio · **FIXED** (`0368c5cc7`)

`hasMoreNeedsYou` is computed against the pre-filter count:

```swift
let waiting = StudioQueueBuilder.itemizedAwaitingRows(...)     // every waiting item
...
hasMoreNeedsYou: waiting.count > drawnNeedsYou.count
```

New test `theDatelessWaitingItemStillCountsTowardHasMore`: three dated decisions plus one dateless
proposal → three rows drawn and `hasMoreNeedsYou == true`, so the Studio's `4` has a way through.

### MJ-5 — the copy deviation was undeclared · **DECLARED** (`r1-notes.md` §4, row five)

No copy change: the review calls the full display name defensible, and it is the only spelling that
survives a `business_name` fallback. The deviation table now carries it, with the mock's line and
R1's line side by side, so Fable rules on it from the notes rather than from a diff.

### MJ-6 — `matchedDesigner` dated by `leads.updated_at` · **FIXED** (`0368c5cc7`)

```swift
let picked = lead.introduction?.createdAt
    ?? lead.introduction?.offeredAt
    ?? lead.updatedAt
    ?? lead.createdAt
```

New test `theMatchedRowPrefersTheCeremonyDate` gives a lead an `updatedAt` of Aug 26 18:00 and a
ceremony `createdAt` of Aug 24 09:00 and pins the row on Aug 24. `updatedAt` survives as the last
resort for leads with no ceremony embed (RLS delivers it only at `sent`/`picked`), which is stated
in the code comment.

---

## MINOR

| # | Disposition |
|---|---|
| 1 · rounded title over exact detail | **Fixed.** Whole dollars only when the move is whole dollars (the mock's `$100 less` survives), exact cents otherwise; and a move under $1 draws no row at all. Two new tests: `aSubDollarMoveDrawsNoRow`, `anUnevenMoveStatesTheExactFigure` (`$100.49 less` over `Saved at $990.49 · now $890.00`). |
| 2 · `State.new` declared and never emitted | **Rebutted.** `case new` is in the interface the brief published and R2 may already switch over it; deleting a case mid-wave breaks R2's compile for a dead branch. Named in `r1-notes.md` §9 so R2 knows `isNew` is the only producer. Worth deleting at integration, not before. |
| 3 · the window is up to eight days | **Fixed in the test.** It now pins `window.start == startOfDay(now) − 7 d` exactly, and the code comment says why the window is whole days: the card prints whole days. |
| 4 · six-hour suppression slides indefinitely | **Rebutted, and tested.** The brief specifies exactly this — "a record built within 6 h of the previous build keeps the previous window anchor" — and the alternative (an absolute cap from the anchor) would empty the card under a reader who opens it often, which is the failure the suppression exists to prevent. New test `theAnchorHoldsAcrossThreeCloseOpens` pins the behaviour at three opens five hours apart so it is a decision, not an accident. |
| 5 · `.overdue`/`.due` resolved at build and persisted | **Rebutted, with the exposure named.** `.overdue` carries no date, so R2 cannot re-derive it; changing it to `.due(date)` would silently kill R2's red state mid-wave. The stale window is one frame: R2 rebuilds in the same open (`r1-notes.md` §3) and the snapshot is only the first paint. Written up in `r1-notes.md` §9 for R2 and for the walk. |
| 6 · the cap swallows `matchedDesigner` | **Fixed** — see BL-1 (c). |
| 7 · every unread thread attributed to the record's designer | **Documented** in `r1-notes.md` §10. No code change: the client's counterpart in a project thread is the studio side, and the row already falls back to `"A new message."` when no designer is known. A per-thread sender name needs a participant embed nobody owns in W2. |
| 8 · M1's second MOVED row has no source | **Documented** in `r1-notes.md` §10: `Leah added two pieces to the proposal.` has no `Kind`, no producer and is not built. It needs a proposal-revision event the app does not receive. |
| 9 · `fallbackDirectory` undeclared | **Declared** in `r1-notes.md` §4's additive list. |
| 10 · `decisionSelect` widened for a test | Accepted as noted; the fix round adds `decisionSelectWithoutDesigner` beside it, also `static` for the same reason. |
| 11 · unsynchronised `save`/`load` | **Fixed** (`3d05e027d`) — an `NSLock` around both. |
| 12 · `ProductModel.swift` at the edge of the ownership rule | **Steward ratification asked for** in `r1-notes.md` §11. R1 added a field to an existing type, not a new row type; no other W2 lane touches the file. |
| 13 · per-commit test counts wrong in the report | **Corrected.** The true count before this round was 62 `@Test` in 7 suites; it is now 73, and the tier is 880. |
| 14 · TDD order broke on the last two tasks | Accepted; no rework. Every fix in this round was written test-first — each new test asserts the opposite of the old behaviour and would fail on the parent commit. |
| 15 · two `function_parameter_count` suppressions | **Flagged** to the steward in `r1-notes.md` §11; both are on constructors whose parameter list is the wire shape. |
| 16 · the guest/discovering spec contradiction | **Handed to R2** in `r1-notes.md` §9 as a ruling, not a re-derivation. |
