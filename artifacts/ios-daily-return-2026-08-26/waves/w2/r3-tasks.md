# W2 R3 — Hygiene (Q4) — task list

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w2-r3` on `daily-return/w2-r3`,
base `e9da02569`. Baseline build proven green (second `ios-gate.sh build` run, per steward.md's
documented first-run-fails-on-GitCommit.swift workaround).

## 0. Call-graph proof (before any deletion)

Grep run from `apps/mobile/Patina`, production code only (`Patina/`), excluding each symbol's own
file, for **constructor-call syntax** `Symbol(` — not bare name matches, which pick up doc comments:

```
$ grep -rn "DailyProductCard(" Patina PatinaTests PatinaUITests --include="*.swift" | grep -v Home/Views/DailyProductCard.swift
(no output)
$ grep -rn "DailyProductDetailView(" Patina PatinaTests PatinaUITests --include="*.swift" | grep -v Home/Views/DailyProductDetailView.swift
(no output)
$ grep -rn "ContinueScanCard(" Patina PatinaTests PatinaUITests --include="*.swift" | grep -v Home/Views/ContinueScanCard.swift
(no output)
$ grep -rn "StudioHubSection(" Patina PatinaTests PatinaUITests --include="*.swift" | grep -v Home/Views/StudioHubSection.swift
Patina/Features/Home/Views/DailyRoomStateBlocks.swift:38:            StudioHubSection(
$ grep -rn "DesignRequestStatusCard(" Patina PatinaTests PatinaUITests --include="*.swift" | grep -v DesignServices/DesignRequestStatusCard.swift
(no output)
$ grep -rn "DailyRoomStateBlocks(" Patina PatinaTests PatinaUITests --include="*.swift" | grep -v Home/Views/DailyRoomStateBlocks.swift
(no output)
$ grep -rn "MarketplaceLinksSection(" Patina --include="*.swift" | grep -v Home/Views/MarketplaceLinksSection.swift
Patina/Features/Home/Views/DailyRoomStateBlocks.swift:43:            MarketplaceLinksSection()
$ grep -rn "WorkWithDesignerCTA(" Patina --include="*.swift" | grep -v Home/Views/WorkWithDesignerCTA.swift
Patina/Features/Home/Views/DailyRoomStateBlocks.swift:64:            WorkWithDesignerCTA(
$ grep -rn "RoomChipRail(\|RoomContextBar(\|DailyFeedEmptyModule(" Patina --include="*.swift" | grep -v Home/Views/
(no output)
```

**Verdict: build-plan-critique.md M1b is stale against this base.** M1b asserted `DailyProductCard ←
DailyRoomViewModel.swift, ProductCard.swift, DailyProductDetailView.swift`; `StudioHubSection ←
DailyRoomStateBlocks.swift, MarketplaceLinksSection.swift`; `ContinueScanCard ←
DesignRequestResumeBanner.swift`. Re-checked at `e9da02569`: every one of those "references" is a
**doc comment**, not a call site (`DailyRoomViewModel.swift:70` — "so DailyProductCard can render …";
`ProductCard.swift:9` — "The editorial variant … lives in … DailyProductCard.swift"; `DailyProductDetailView.swift:5`
— "morphs from a DailyProductCard via matchedGeometryEffect"; `DesignRequestResumeBanner.swift:11` —
"Mirrors the ContinueScanCard (PT-4-9) idiom"). None of these files actually instantiate the type.
**The only real call site among the whole Q4 set is `StudioHubSection(` inside `DailyRoomStateBlocks.swift`**
— and `DailyRoomStateBlocks(` itself has zero real callers, so that call site is dead too. `AddToRoomSheet`
(M1b's fourth citation) is confirmed live via `ProductDetailViewModel.swift` but is explicitly excluded
from R3's set (steward.md §7) — not touched here.

**A second finding neither the build plan nor the critique names**: `DailyRoomStateBlocks.swift` holds
**three** top-level structs, not one. `HomeStudioBlock` (line 25, dead per above) and `HomeFilteredFeedEmpty`
(line 122, dead — zero callers beyond its own preview) are Q4 orphans. **`HomeStoryRetryRow` (line 153)
is LIVE** — called from `DailyRoomView.swift:196` (`HomeStoryRetryRow(onRetry: { viewModel.refreshTodaysStory() })`,
U29's story-load-failure retry). Deleting the file wholesale would break `DailyRoomView.swift`'s build.
Per the brief's "re-home any piece a live surface still needs": Task 1 extracts `HomeStoryRetryRow`
into its own new file before deleting the rest. The struct's signature is unchanged, so `DailyRoomView.swift`
needs **no edit** — Swift resolves the type by name within the target regardless of which file defines
it, so the live call site keeps compiling without me touching R2's file.

Full deletion set proven zero-call-site (all eleven, plus the `HomeStudioBlock`/`HomeFilteredFeedEmpty`
structs bundled inside the twelfth file):

| File | Verdict |
|---|---|
| `Features/Home/Views/DailyRoomStateBlocks.swift` | dead root (`HomeStudioBlock`, `HomeFilteredFeedEmpty`) — **one live struct extracted first** (`HomeStoryRetryRow`) |
| `Features/Home/Views/StudioHubSection.swift` | dead (only caller is the dead root) |
| `Features/Home/Views/MarketplaceLinksSection.swift` | dead (only caller is the dead root) |
| `Features/Home/Views/WorkWithDesignerCTA.swift` | dead (only caller is the dead root) |
| `Features/Home/Views/RoomChipRail.swift` | dead |
| `Features/Home/Views/RoomContextBar.swift` | dead |
| `Features/Home/Views/DailyFeedEmptyModule.swift` | dead |
| `Features/Home/Views/DailyProductCard.swift` | dead |
| `Features/Home/Views/DailyProductDetailView.swift` | dead |
| `Features/Home/Views/ContinueScanCard.swift` | dead |
| `Features/DesignServices/DesignRequestStatusCard.swift` | dead |

Nested-type sweep (`grep -n "struct \|enum \|class \|typealias "` per file): every nested type in the
other ten files is `private` (`StudioRow`, `MarketplaceRow`, `MatchedImage`, `PreviewWrapper`) —
scoped to its own file, safe to delete with it.

`AddToRoomSheet.swift` / `AddedToRoomToast.swift` — **not touched**, confirmed live and excluded per
steward.md §7.

Test sweep: `grep -rn` over `PatinaTests`/`PatinaUITests` for all twelve symbol names returns zero
hits outside comments already covered above — no test file names any of them (confirms steward.md §7).
`pbxproj` sweep: `Patina.xcodeproj` uses `PBXFileSystemSynchronizedRootGroup` (verified, 5 occurrences)
and holds no explicit `PBXFileReference` for any of the eleven files — deleting from disk needs no
project-file edit.

---

## Task 1 — Delete the July home rail; re-home `HomeStoryRetryRow`

**Files:**
- New: `Patina/Features/Home/Views/HomeStoryRetryRow.swift` (struct moved verbatim out of `DailyRoomStateBlocks.swift`)
- Delete: `Patina/Features/Home/Views/DailyRoomStateBlocks.swift`, `StudioHubSection.swift`,
  `MarketplaceLinksSection.swift`, `WorkWithDesignerCTA.swift`, `RoomChipRail.swift`,
  `RoomContextBar.swift`, `DailyFeedEmptyModule.swift`, `DailyProductCard.swift`,
  `DailyProductDetailView.swift`, `ContinueScanCard.swift`
- Delete: `Patina/Features/DesignServices/DesignRequestStatusCard.swift`

**Interface neighbours rely on:** `HomeStoryRetryRow(onRetry: () -> Void)` — unchanged signature,
called from `DailyRoomView.swift:196` (R2's file, not edited here; the call resolves by type name
regardless of source file).

**No failing test to write first** — this is proven-dead-code removal, not new behavior. The gate is:
build was green before (§0 baseline); build + full `PatinaTests` tier must stay green after.

**Run (before):** baseline already proven — `ios-gate.sh build` → `** BUILD SUCCEEDED **` (second run,
first run's `GitCommit.swift` failure is the documented steward.md hazard).

**Implement:** extract `HomeStoryRetryRow` verbatim into its own file (header comment adapted, same
body); delete the ten Home/Views files above and the one DesignServices file.

**Run (after):** `ios-gate.sh build` on the lane's cloned simulator
(`3A0CDA6E-6752-403C-88B8-FB0CC5C897E6`) with `-derivedDataPath .build/dd`, then the full `PatinaTests`
tier the same way. Both green = the deletion was safe.

**Commit:** `refactor(ios): retire the July home rail (Q4) — twelve dead views, HomeStoryRetryRow re-homed`
— pathspec-restricted to the eleven deleted files + the one new file.

---

## Task 2 — Carry-over: retire the dead "Try in your room" Companion quick action

**Files:** `Patina/Features/Companion/Services/CompanionAreaBuilders.swift` (two call sites in
`discoveryItems`), `PatinaTests/CompanionActionMatrixTests.swift` (new pinning test + one stale
comment fix). `CompanionActionRows.swift`'s `tryInRoomRow(productId:)` factory function is left
defined, uncalled — "it returns the day an AR asset pipeline exists" (brief, verbatim); it has no
other callers so leaving it does not create dead-code drift elsewhere.

**Interface neighbours rely on:** none change — `CompanionActionProvider.actions(for:context:isAuthenticated:)`
keeps its signature; only the row list it returns for `.pieceDetail` / `.emergence` / `.roomEmergence`
shrinks by one entry.

**Evidence the row is currently reachable and dead-ends:** `CompanionAreaBuilders.swift:80` (`if let
piece = context.viewingPiece { rows.append(tryInRoomRow(productId: piece.id)) }` for `.emergence`/`.roomEmergence`)
and `:86` (`tryInRoomRow(productId: pieceId)`, unconditional, for `.pieceDetail`). `ProductDetailView.swift:402-406`
already gates its own on-screen AR button on `product.hasARModel` (SP-18 fixed that surface); the
Companion menu row has no equivalent gate — it appears for every product regardless of `usdz_url`,
and no seed product carries one today.

**Failing test first** (`PatinaTests/CompanionActionMatrixTests.swift`, new `@Test` near the
Discovery-area tests):

```swift
@Test
func tryInRoomRowNeverAppearsOnPieceDetailOrEmergence() {
    // The Companion's AR quick action dead-ends on every product while
    // usdz_url is NULL (carry-over, W1b SP-18 residual). It returns the
    // day an AR asset pipeline exists (build-plan.md W2 R3).
    for screen: AppRoute in [.pieceDetail(pieceId: "piece-1"), .emergence(pieceId: nil), .roomEmergence(roomId: Self.sampleRoomId)] {
        let ctx = Fixture.context(for: screen, roomCount: 1, active: false, tier: .discovering)
        let ids = CompanionActionProvider.actions(for: screen, context: ctx, isAuthenticated: true).map(\.analyticsId)
        #expect(!ids.contains("try_in_room"), "\(screen) still offers the dead-ended AR row")
    }
}
```

This fails today (`ids.contains("try_in_room")` is true for all three routes since `context.viewingPiece`
is always supplied by the `context(for:...)` fixture helper, per its own doc comment).

**Run:** `xcodebuild test -only-testing:PatinaTests/CompanionActionMatrixTests
-destination id=3A0CDA6E-6752-403C-88B8-FB0CC5C897E6 -derivedDataPath .build/dd` → new test fails,
existing tests unaffected.

**Implement:** remove the two `tryInRoomRow(...)` calls from `discoveryItems` in
`CompanionAreaBuilders.swift`; fix the now-stale fixture comment in `CompanionActionMatrixTests.swift:90-92`
("A viewing piece is supplied so the 'Try in your room' arm on discovery screens is exercised" — no
longer true, replaced with why `viewingPiece` is still supplied: it still drives `designerRow`'s
piece-aware copy elsewhere in the matrix).

**Run:** same command → green. Then the full `PatinaTests` tier once, to confirm no other pinned
exemplar menu asserted the row's presence (none do — grepped `PatinaTests` for `"Try in your room"` /
`try_in_room` before writing this task; zero hits besides the new test).

**Commit:** `fix(ios): retire the Companion's dead AR quick action (W1b SP-18 residual)` — pathspec
`Patina/Features/Companion/Services/CompanionAreaBuilders.swift PatinaTests/CompanionActionMatrixTests.swift`.

**Note on `CompanionActionMatrixTests.homeStudioRow*`** (named in the brief as a possible casualty):
`homeStudioRowHiddenAtDiscovering`/`ShownAtEngaged`/`HiddenWhenTierUnknown` (lines 411-436) test
`CompanionActionProvider.actions(...).contains("Your studio")` — the **live** Companion "Your studio"
row (`CompanionActionRows.swift:studioRow()`), a different symbol from the deleted `HomeStudioBlock`
SwiftUI struct that shared a similar name. Confirmed via `grep -n "HomeStudioBlock\|StudioHubSection\|…"
PatinaTests/CompanionActionMatrixTests.swift` → zero hits. These tests are **not touched** — they pin
live code, not the retired composition.

**Note on `DailyRoomFeedMappingTests`**: tests `DailyRoomViewModel.recommendation(from:)`, a `Product`
→ `DailyRecommendation` mapping — zero references to any of the twelve deleted symbols (`grep`
confirmed). **Not touched** — it tests live feed-mapping code untouched by this deletion.

---

## Task 3 — Carry-over: the accepted-but-unsigned seal glyph (rulings-fable.md #6)

**File:** `Patina/Features/Proposals/Views/ProposalDetailView.swift` — one site, `statusRow(_:)`
(currently line 81, `if viewModel.isSigned { … Image(systemName: "checkmark.seal.fill") … }`). Steward's
map grants R3 exactly this one file for this one edit; `ProposalStatusDisplay.swift` and
`ProposalsMoneyRailTests.swift` stay untouched (the latter is explicitly R2's to keep green).

**Interface neighbours rely on:** none. New `static func statusIcon(for:justSigned:)` added inside
`ProposalDetailView` itself (not `ProposalStatusDisplay`, to stay inside the one granted file) so the
decision is unit-testable via `@testable import Patina` without ViewInspector, which this repo does
not use for this view tree.

**Root cause, verified:** `RemoteProposal.isSigned` (`Services/API/ProposalsAPIClient.swift:81`) is
`status == "accepted"` — it does not check `signed_at`. `viewModel.isSigned` (`ProposalsViewModel.swift:79-81`,
lane B's file, not touched) is `didSign || proposal.isSigned == true`, so it is true for every accepted
proposal, signed or not. `ProposalDetailView.swift`'s `statusRow` uses `viewModel.isSigned` to gate
*entry* into the "accepted family" branch (kept as-is — it correctly means "just signed, or server says
accepted") but then unconditionally renders `checkmark.seal.fill` inside that branch, even though
`RemoteProposal.hasSignatureRecord` (`:86-87`, checks `signed_at` non-empty) already exists and is
already used correctly by `ProposalStatusDisplay.detailStatusLine` for the **text** ("Accepted" vs.
"Signed by … on …"). Only the **icon** never got the same check. The text is already right; only the
glyph is wrong.

**Failing test first** (new file, `PatinaTests/ProposalDetailStatusIconTests.swift` — new because
`ProposalsMoneyRailTests.swift` is R2's to keep green for the duration, per steward.md §8a):

```swift
import Testing
@testable import Patina

@MainActor
struct ProposalDetailStatusIconTests {
    private func decode(_ json: String) throws -> RemoteProposal {
        try JSONDecoder().decode(RemoteProposal.self, from: Data(json.utf8))
    }

    @Test
    func acceptedWithoutSignatureShowsTheCircleNotTheSeal() throws {
        // rulings-fable.md #6: checkmark.seal.fill claims a signature that
        // doesn't exist. accepted-but-unsigned must show checkmark.circle.
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: false) == "checkmark.circle")
    }

    @Test
    func acceptedWithSignatureRecordKeepsTheSeal() throws {
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": "Kody",
          "signed_at": "2026-07-02T00:00:00Z" }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: false) == "checkmark.seal.fill")
    }

    @Test
    func justSignedThisSessionShowsTheSealBeforeTheServerRecordArrives() throws {
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: true) == "checkmark.seal.fill")
    }
}
```

This fails to compile today (`ProposalDetailView.statusIcon` does not exist yet) — the TDD "red" state
for an extraction is the missing symbol, same as a failing assertion.

**Run:** `xcodebuild test -only-testing:PatinaTests/ProposalDetailStatusIconTests
-destination id=3A0CDA6E-6752-403C-88B8-FB0CC5C897E6 -derivedDataPath .build/dd` → build fails (symbol
missing).

**Implement:** add `static func statusIcon(for proposal: RemoteProposal, justSigned: Bool) -> String {
(proposal.hasSignatureRecord || justSigned) ? "checkmark.seal.fill" : "checkmark.circle" }` to
`ProposalDetailView`; change `Image(systemName: "checkmark.seal.fill")` to `Image(systemName:
Self.statusIcon(for: proposal, justSigned: viewModel.didSign))`. No other line in `statusRow` changes —
the text (`ProposalStatusDisplay.detailStatusLine`) was already correct.

**Run:** same command → green (3 tests). Then full `PatinaTests` tier once.

**Commit:** `fix(ios): accepted-but-unsigned proposal shows checkmark.circle, not the signed seal (rulings-fable.md #6)`
— pathspec `Patina/Features/Proposals/Views/ProposalDetailView.swift PatinaTests/ProposalDetailStatusIconTests.swift`.

---

## Task 4 — Canon digest note + integration notes (no code)

Append a dated subsection to the end of `research/11-canon-digest.md` §5 ("Proposed before, not
built") — the main checkout, not the worktree, since it is not a git-tracked file inside
`apps/mobile/Patina` (steward's map scopes R3's worktree to the iOS app; `research/` lives in the main
checkout per the brief). Write `waves/w2/r3-notes.md` with the file/diff/why for cross-lane awareness
(§0's `HomeStoryRetryRow` re-home; confirmation that `DailyRoomView.swift` needs no edit from any
other lane on account of this move).

---

## Gate (whole lane)

`ios-gate.sh build` + `xcodebuild test -only-testing:PatinaTests -destination
id=3A0CDA6E-6752-403C-88B8-FB0CC5C897E6 -derivedDataPath .build/dd` (the full `PatinaTests` tier, not
just the three new/changed suites) run once after Task 3, in the foreground, before the finish steps.
