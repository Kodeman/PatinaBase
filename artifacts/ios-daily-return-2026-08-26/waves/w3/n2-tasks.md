# W3 · lane N2 — the Pieces tab, and Saved as its own door · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n2`, branch
`daily-return/w3-n2`, base `b101f5009` (**N1's tip**, not main — this lane consumes N1's frozen
interfaces). Simulator `4839354A-D6ED-4544-BC8D-079108E479CE` (`dr-w3-n2`, iPhone 17 Pro / iOS 26.5,
created fresh — the W2 clones are gone and the review device `973D1724-…` is the walker's).
Written before any code. Per task: failing test → run → implement → run → pathspec commit.

---

## 0. What is already true at the base — read before writing anything

Two of this lane's four deliverables are **already built** and must be *verified and completed*,
not re-invented:

- **`p_category` is already sent.** W1b lane A (SP-02) added
  `RecommendationsViewModel.category(forFilter:)` and threads it into
  `ProductAPIClient.fetchRecommendations(roomId:category:limit:offset:)`, which writes
  `params["p_category"] = category.rawValue` (`ProductAPIClient.swift:56`).
  `BrowseGridContractTests` already pins chip → category. **The half that is missing** is that the
  grid *still re-filters client-side*: `filteredProducts` is
  `products.filter { $0.category.displayName == activeFilter }`, so the screen filters twice and the
  server-side filter is not the thing on glass. That is task 2.
- **`RouteTabTable` already files `.emergence` / `.table` / `.pieceDetail` / `.styleQuiz` /
  `.styleResult` under `.pieces`, `.yourSpaces` under `.spaces`, `.profile` under `.studio`.**
  Nothing in the table needs an edit. The Companion's rows reach `.table` and `.yourSpaces` through
  `AppCoordinator.navigate(to:)` and keep working unchanged (task 5's pin).

The `p_category` values, read from the migrations rather than assumed:
`00533_piece_detail_contract.sql:65` declares `p_category TEXT DEFAULT NULL` and passes it to
`get_aesthete_matches`, whose filter is `AND (p_category IS NULL OR p.category = p_category)`
(`00244_aesthete_match_rpc.sql:1016`) — an **exact match on `products.category`**, no normalization.
The app's vocabulary for that column is `ProductCategory`: `seating` · `tables` · `lighting` ·
`storage` · `decor` · `textiles` (`ProductModel.swift:289-300`). So the wire value is
`ProductCategory.rawValue`, lowercase, and `All` must send **no** key at all.

## 0b. Owned files

New: `Patina/Features/Navigation/TabRoot.swift` (env key + the three wrappers),
`PatinaTests/PiecesTabTests.swift`, `PatinaTests/TabRootTitleTests.swift`.
Edited: `Patina/Features/Recommendations/Views/RecommendationsView.swift`,
`Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift`,
`Patina/Design/Components/PatinaScreenChrome.swift` (2 lines — the chevron gate),
`Patina/Features/Navigation/HouseFirstRoot.swift` (`root(for:)` only — see §6),
`PatinaTests/BrowseGridContractTests.swift`.
**Not touched:** `RouteTabTable.swift`, `PatinaTab.swift`, `TabNavigationModel.swift`,
`PatinaTabBar.swift`, `Coordinator.swift`, `ContentView.swift`, `Features/Companion/**`,
`Features/Collections/**` (the Saved surface is reached, not rewritten), `YourSpacesView.swift`,
`StudioHubView.swift`.

---

## 1. The tab-root seam: `isTabRoot` + the three wrappers

Failing tests first: `PatinaTests/TabRootTitleTests.swift`.

- `SpacesTabRoot` / `PiecesTabRoot` / `StudioTabRoot` each carry the C4 canonical name for their
  tab — `PatinaTab.spaces.canonicalName` == "Your Spaces", `.pieces` == "Browse pieces",
  `.studio` == "Your Studio" — as `.navigationTitle`, and the title string each wrapper names is
  read from `PatinaTab.canonicalName`, never re-typed as a literal (`SourcePin`).
- `SourcePin`: `PatinaScreenChrome` draws `BackChevronButton` only under `if !isTabRoot` — a tab
  root has nothing to go back to (n1-notes §1b: the chevron is on `YourSpacesView` **and**
  `RecommendationsView` in the flag-on shots).
- `SourcePin`: `HouseFirstRoot.root(for:)` names the three wrappers and no longer holds a
  `studioRoot` shim (n1-notes §1c asked for the shim to come out with this wrapper).

Implement `Patina/Features/Navigation/TabRoot.swift`:

```swift
extension EnvironmentValues { var isTabRoot: Bool }        // default false
extension View { func tabRoot(_ tab: PatinaTab) -> some View }
    // = .environment(\.isTabRoot, true).navigationTitle(tab.canonicalName)
struct SpacesTabRoot: View  { YourSpacesView().tabRoot(.spaces) }
struct PiecesTabRoot: View  { RecommendationsView().tabRoot(.pieces) }
struct StudioTabRoot: View  { ScrollView { StudioHubView() … }.tabRoot(.studio)
                              .navigationBarTitleDisplayMode(.large) }
```

`Spaces` and `Pieces` hide the system bar through `.patinaScreen`, so their `.navigationTitle` is
the accessibility/canon record rather than a drawn string — each screen already prints its canonical
title in-body ("Your Spaces" `YourSpacesView.swift:102`, "Browse pieces"
`RecommendationsView.swift` `scopedTitle`). Studio's bar is visible and draws it, because
`StudioHubView` is a section with no title of its own.

Two lines in `PatinaScreenChrome`: read `@Environment(\.isTabRoot)`, gate the chevron.

Commit `feat(ios): tab roots keep their canonical names and drop the back chevron`.

## 2. Server-side filtering, and only server-side

Failing tests in `PatinaTests/BrowseGridContractTests.swift` (the suite that already owns SP-02):

- `filteredProducts` returns **everything the server returned**, for any active chip — a row whose
  `category` does not match the chip is kept, because the server is the filter and a second client
  pass can only subtract rows the server deliberately sent.
- the wire value for each chip is `ProductCategory.rawValue`, lowercase, and matches the vocabulary
  `00244:1016` compares against; `All` maps to `nil`.
- `SourcePin`: `RecommendationsViewModel.swift` contains no `products.filter` on `activeFilter`.

Implement: `filteredProducts` becomes `products`; `applyActiveFilter` is unchanged (it already
re-fetches). No flash risk — `loadRecommendations` sets `isLoading = true` synchronously and
`content` draws `PatinaLoadingState` while it is true, so the previous chip's rows are never on
glass under the new chip's label.

Commit `fix(ios): the browse chip filters on the server, once`.

## 3. The Saved row — M9's door that cannot hide

Failing tests: `PatinaTests/PiecesTabTests.swift`.

- `SavedDoorRow` prints `Saved` and, for `count == 0`, `Nothing yet`; for 1, `1 piece`; for 3,
  `3 pieces` (M9 states; F14 — the door still draws at zero).
- its accessibility label is its own — `Saved, 3 pieces` / `Saved, nothing yet` — and is **not**
  `PatinaTab.pieces.canonicalName` (B-7 b: the row must not share the tab's label).
- `SourcePin`: `RecommendationsView` draws the row only under `isTabRoot`, and the row's action is
  `coordinator.navigate(to: .table)` — the canonical Saved surface
  (`AppRoute.table.displayName == "Saved"`, dispatched to `CollectionsView()` in both roots'
  dispatchers, Boards / All items untouched).
- `RouteTabTable.tab(for: .table) == .pieces` and `.table` is not a tab root, so the push stays on
  Pieces and Back returns to the grid.

Implement in `RecommendationsView`: a `savedDoorRow` between the header block and the chip row,
drawn `if isTabRoot`. Count = `viewModel.savedProductIds.count`, which `seedSavedState` already
seeds from the local `TableItemModel` rows **and** the account's `saved_items` — the honest number
this screen knows, not a fabricated one. Geometry per M9: full width, gutter 24 (the screen's own,
not the mock's 20 — every other block on this screen is 24 and M9's gutter is a mock-scale figure),
`Background.secondary`, radius 14, serif 18 medium title, mono uppercase meta right-aligned,
trailing chevron, `minHeight: 44`.

Commit `feat(ios): Saved is its own door at the top of Pieces (M9)`.

## 4. Mount the three roots

Edit `HouseFirstRoot.root(for:)`: `.spaces → SpacesTabRoot()`, `.pieces → PiecesTabRoot()`,
`.studio → StudioTabRoot()`; delete `studioRoot`. `.today` is untouched (N1/N3's).
This is an edit inside N1's file that n1-notes §1c explicitly invites; it is recorded in
`waves/w3/n2-notes.md` for the steward.

Existing `HouseFirstRootTests` must stay green.

Commit `feat(ios): the three tab roots mount under the bar`.

## 5. The flag-off root, byte for byte

Failing test in `PiecesTabTests`:

- with `isTabRoot` false — which is every pushed appearance of `RecommendationsView`, including the
  flag-off root's `.emergence(nil)` and every `roomEmergence` room-scoped browse — the Saved row is
  not drawn and the back chevron is.
- `SourcePin`: `ContentView.swift` is unmodified against the base (`git diff --stat` in the report),
  and the three Companion rows that name `.table` (`CompanionActionRows.swift:82,227`,
  `CompanionAreaBuilders.swift:123,129`) and `.yourSpaces` still resolve through `RouteTabTable`.

Commit folded into task 4 if no code change is needed beyond the gate.

## 6. Gate, sim check, notes

`ios-gate.sh build` from the worktree (twice if it fails with no `error:` line), then
`xcodebuild test … -only-testing:PatinaTests -destination id=4839354A-…` — the whole tier green,
no `ios-gate.sh all`, no `lint-delta` (steward-only). Signed `.app` recorded.

Sim check on the clone, `-DeploymentTarget local`:
**flag-on** (`-PatinaFlags house-first`) — Pieces tab → the Saved row → Saved with Boards / All
items; a chip tap with the Kong log showing `p_category`; Spaces and Studio tab roots with their
canonical titles and no back chevron.
**flag-off** (no launch arg) — the same screens as W2 left them: chevron back, no Saved row.
Shots `shots/w3-n2-NN-*.png`, ledger rows under `## w3-n2`, `waves/w3/n2-notes.md` for the
cross-lane items.
