# W1b · Lane A (piece & saved) — task list

Implementer: lane A, worktree `.codex/worktrees/agent-dr-w1b-a`, branch `daily-return/w1b-a`,
base `main` @ `5b5c0c054`. Simulator clone `dr-w1b-a` `15C4C76A-DCDD-43C1-9119-D0B022F0A653`.

Planks: **SP-02, SP-06, SP-10 (client half), SP-11, SP-12, SP-14, SP-18**.
Suites owned and left green: `ProductDecodingTests`, `ProductVendorEmbedTests`,
`DailyRoomFeedMappingTests`, `AccountIsolationTests`, `CompanionActionMatrixTests`,
`ContextualExperienceTests`.

**Gate for every task** (foreground, sandbox disabled):

```bash
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-a/apps/mobile/Patina/scripts/ios-gate.sh build
xcodebuild test \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-a/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=15C4C76A-DCDD-43C1-9119-D0B022F0A653' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-a/.build/dd \
  -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO
```

**Interfaces neighbours rely on** (stated once, referenced by the tasks):

| Symbol | Shape after this lane | Who reads it |
|---|---|---|
| `Product` | gains optional `dimensions: ProductDimensions?`, `leadTimeWeeks: Int?`, `brand: String?`, `productDescription: String?`, `publishedAt: Date?`, `finish: String?`, `patinaManaged: Bool?`, `photoVerifiedAt: Date?`, `sourceURL: String?`, `shippingFlatCents: Int?`; computed `dimensionsLine`, `leadTimeLine`, `resolvedMakerName`, `hasResolvableMaker` | W2 record, W5 buyability gate |
| `ProductDimensions` | `struct { width, height, depth: Double?; unit: String? }`, decodes `products.dimensions` jsonb | W5 order sheet |
| `PatinaAsyncImage` | success image no longer reports a size larger than the proposal | every image surface in the app |
| `CreateSavedItemPayload.room_id` | `String?` (was `String`) — a roomless save is the standard path | lane B/D read `saved_items` only |
| `RoomsAPIClient.listItems(forUserId:)` | new — all of a user's saved rows, room or not | W2 discovering record |
| `LocalStoreClaim` | `pendingClaim`/`keep()`/`startFresh()` — the SP-06 first-sign-in claim | C's root, if it ever wants a different host |

**00533/00535 are not in the local DB.** Every new column decodes as an optional and the UI omits
the row when it is nil — the sim check must show "absent honestly", not a placeholder.

---

## Task 1 — SP-10 · the piece says what it is

**Files:** `Core/Models/ProductModel.swift`, `Core/Network/ProductAPIClient.swift`,
`Features/ProductDetail/Views/ProductDetailView.swift`;
tests `PatinaTests/ProductDecodingTests.swift`, `PatinaTests/Fixtures/recommendations_mixed_rows.json`.

**Failing test first** (`ProductDecodingTests`):

```swift
@Test
func specColumnsDecodeWhenPresent() throws {
    let json = """
    [{"id":"p-spec","name":"Heirloom Oak Dining Table","brand":"Nordic Atelier",
      "lead_time_weeks":8,"source_url":"https://example.test/oak",
      "dimensions":{"width":38,"depth":20,"height":30,"unit":"in"},
      "finish":"Oiled","patina_managed":true,"shipping_flat_cents":29900}]
    """
    let p = try #require(try ProductAPIClient.decodeProducts(from: Data(json.utf8)).first)
    #expect(p.leadTimeLine == "Ships in 8 weeks")
    #expect(p.dimensionsLine == "38\u{2033} W \u{00D7} 20\u{2033} D \u{00D7} 30\u{2033} H")
    #expect(p.resolvedMakerName == "Nordic Atelier")
}

@Test
func specColumnsAreAbsentHonestlyWhenNull() throws {
    let p = try #require(try ProductAPIClient.decodeProducts(from: Data(#"[{"id":"p","name":"n"}]"#.utf8)).first)
    #expect(p.dimensionsLine == nil)
    #expect(p.leadTimeLine == nil)
    #expect(p.hasResolvableMaker == false)     // "Unknown"/"Unknown Maker" is not a maker
}
```

**Implementation.** Add the ten optional properties + `ProductDimensions` to `Product`, decoded from
the snake_case RPC names; extend the memberwise init with defaulted parameters so every existing
call site compiles unchanged. `dimensionsLine` prints only the axes that are present, `″` for `in`
and `cm` otherwise. `resolvedMakerName` = `brand` ?? vendor name, and treats the literal `Unknown` /
`Unknown Maker` as no maker (`hasResolvableMaker == false`). `RawProductWithVendor` (the direct
piece fetch, which already selects `*`) decodes the same real `products` columns so the detail
screen shows them **today**, without 00533. `ProductDetailView` gets a spec block under the price:
size · lead time · maker · story, each row omitted entirely when its value is nil.

**Commit:** `feat(ios): SP-10 — decode the piece's spec columns and print size, lead time, maker`
pathspecs: the three source files + the two test paths.

---

## Task 2 — SP-02 · one card size, and the off-canvas top bar

**Files:** `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift`,
`Features/Recommendations/Views/RecommendationsView.swift`,
`Features/Recommendations/ViewModels/RecommendationsViewModel.swift`;
test `PatinaTests/BrowseGridContractTests.swift` (new).

**The measured cause** (proved in the sim before the fix, and again after —
`shots/w1b-a-02-*`): `PatinaAsyncImage` renders `image.resizable().aspectRatio(contentMode: .fill)`
with **no clip inside the component**. A fill-scaled image answers a proposal with a size that is
*larger* than the proposal on one axis, and `.frame(maxWidth: .infinity)` at the call site does not
clamp an oversized child — so the grid card and the piece-detail hero both report a width wider than
the screen. That is what pushes the browse cards off-canvas (`research/01-shot-ledger.md` g-15) and,
through the same component on the detail hero, puts the back chevron at `x = -85.3`
(`research/01-shot-ledger.md` "H0 verification"). It is not the matched-geometry transition.

**Failing test first:** `BrowseGridContractTests` pins the two pure decisions the geometry fix rides
with — `RecommendationsViewModel.category(forFilter:)` maps each chip to its `p_category`, and
`headerSubtitle` says "chosen", not "curated".

**Implementation.** In `PatinaAsyncImage`, render the success image as an `overlay` on a
`Color.clear` and clip it, so the component reports exactly the size it is given.
In `RecommendationsView`: one card aspect for the image area, the name pinned to two lines
(`reservesSpace: true`) and the rationale capped at two, so every card is the same size; a trailing
fade on the chip row. In `RecommendationsViewModel`: the chip sends `p_category` to the RPC so the
subtitle's number is the real one, and the subtitle reads "chosen for your space" /
"chosen for this room".

**Commit:** `fix(ios): SP-02 — contain the async image so the grid and the piece top bar stay on canvas`

---

## Task 3 — SP-14 · save once, and it is still saved tomorrow

**Files:** `Core/Network/RoomsAPIClient.swift` (unassigned in the steward map — claimed here, see
`a-notes.md`), `Features/ProductDetail/ViewModels/ProductDetailViewModel.swift`,
`Features/Recommendations/ViewModels/RecommendationsViewModel.swift`,
`Core/Models/TableItemModel.swift`, `Core/Models/SavedItem.swift`;
test `PatinaTests/SavedItemMirrorTests.swift` (new).

**Failing test first:** `TableItemModel.formattedPrice` and `SavedItem.fullFormattedPrice` both come
out of `PatinaCurrency` (the `$4200` vs `$4,200` split), and `CreateSavedItemPayload` encodes with a
null `room_id` when there is no room (the roomless mirror is the standard path).

**Implementation.** `CreateSavedItemPayload.room_id` becomes `String?`; add
`RoomsAPIClient.listItems(forUserId:)`. `ProductDetailViewModel` seeds `isSaved` from the local
store on load, makes `toggleSave` idempotent on `productId` (no second row), and mirrors to
`saved_items` with a null room. `RecommendationsViewModel.saveProduct` mirrors on every save, not
only room-scoped ones. Both price formatters route through `PatinaCurrency`.

**Commit:** `feat(ios): SP-14 — one save, mirrored with or without a room, one currency formatter`

---

## Task 4 — SP-12 · Saved has a door, and opens where the pieces are

**Files:** `Features/Companion/Services/CompanionActionRows.swift`,
`Features/Collections/ViewModels/CollectionsViewModel.swift`,
`Features/Collections/Views/CollectionsView.swift`;
test `PatinaTests/CompanionActionMatrixTests.swift`.

**Failing test first:** the Companion's `Saved` row is returned at a zero saved count, with the
empty count as its own hint.

**Implementation.** `collectionsRow` stops returning `nil` at zero. `CollectionsViewModel` resolves
its default tab to `All items` whenever the board count is zero. `addToBoard` gets its only caller:
an `Add to board` action on the saved row when at least one board exists — so a board can fill, and
the Boards tab stops being a promise nothing can keep.

**Commit:** `feat(ios): SP-12 — the Saved door opens at zero, and boards can hold a piece`

---

## Task 5 — SP-11 · a piece can be put in a room

**Files:** `Features/Recommendations/Views/RecommendationsView.swift`,
`Features/Recommendations/ViewModels/RecommendationsViewModel.swift`,
`Features/Home/Views/AddToRoomSheet.swift`, `Features/Rooms/Views/RoomProjectView.swift`,
`Features/Home/Views/TodayModules.swift`.

**Implementation.** Mount the existing `AddToRoomSheet` from the card menu as `Add to room`
whenever the reader has at least one room; the pick writes the local `SavedItem` into that room
(so `room.items.count` — the number Today prints — is true) and mirrors to `saved_items` with the
room's `remoteId`. A room whose `remoteId` is nil says so on screen instead of falling back
silently. The room-scoped browse titles itself with the room name, and the room's stacked triple
ask collapses to the single control `Browse pieces for the <Room>`.

**Commit:** `feat(ios): SP-11 — put a piece in a room, and scope the room's browse to the room`

---

## Task 6 — SP-18 · signals that are not real come down

**Files:** `Features/Rooms/Views/RoomProjectView.swift`,
`Features/ProductDetail/Views/ProductDetailView.swift`,
`Features/Profile/Views/ProfileView.swift`,
`Core/Network/EditorialStoriesAPIClient.swift`,
`Features/Home/ViewModels/DailyRoomViewModel.swift`,
`Features/Home/Views/DailyStoryCard.swift`, `Core/Persistence/StoryReadStore.swift` (new);
test `PatinaTests/DailyRoomFeedMappingTests.swift`.

**Failing test first:** a story whose id has been recorded as read is not unread; the story pick
prefers the highest `sort_order` the reader has not opened and falls back to the newest.

**Implementation.** The room stat row drops `IN AR` (`usdz_url` is hard-coded null on every path,
so the number can only ever be zero) and labels `MATCH` with what it matches against. Profile's
match stat carries the rationale the app computes, or comes down when it cannot. `StoryReadStore`
records a per-story read timestamp in `UserDefaults`; `DailyStory.isUnread` is driven from it
instead of the hard-coded `true`, and `DailyRoomViewModel` serves the highest-`sort_order` story
the reader has not opened.

**Commit:** `fix(ios): SP-18 — the AR stat, the unexplained match, and the permanent unread dot come down`

---

## Task 7 — SP-06 · guest work belongs to the guest

**Files:** `Services/Auth/AuthService.swift`, `Core/Persistence/LocalStoreClaim.swift` (new),
`Features/Companion/Views/CompanionOverlay.swift`;
test `PatinaTests/AccountIsolationTests.swift`.

**Failing test first:** the existing three `shouldWipeLocalStore` cases stay exactly as they are
(promote-only, never wiped on sign-out — this is the plank's data-loss risk), and a new pure
decision `LocalStoreClaim.shouldAsk(previousOwner:hasGuestWork:)` is true only on the first
sign-in of an install that carries guest work.

**Implementation.** On a first sign-in with guest rows present the claim becomes **explicit** — one
sheet, `Keep the room and the pieces you saved on this phone?` / `Keep them` / `Start fresh` —
presented from `CompanionOverlay`, which is the app-global surface in the `.main` phase. `Keep them`
claims exactly as today; `Start fresh` wipes through the existing `LocalStoreReset`. The counts the
Companion reads are then the signed-in account's own, because the account decided.

**Commit:** `feat(ios): SP-06 — the guest's work is claimed on purpose, not inherited`

---

## Task 8 — gate, sim check, shots

`ios-gate.sh build` + the full `PatinaTests` tier on `dr-w1b-a`; then a signed build (no
`CODE_SIGNING_ALLOWED=NO`) installed on the clone, launched `-DeploymentTarget local`, guest for the
piece/grid checks and `client@patina.dev` / `password123` for the saved checks. Shots to
`shots/w1b-a-NN-slug.png`, rows appended to `research/01-shot-ledger.md` under `## w1b-a`.

**Commit:** `docs(ios): Daily Return — W1b lane A task list, notes, ledger rows`
