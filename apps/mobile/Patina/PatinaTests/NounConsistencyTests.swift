//
//  NounConsistencyTests.swift
//  PatinaTests
//
//  PROGRAM.md §3 · L1-E: "the consumer lexicon is fixed: Piece · Room ·
//  Studio · Companion · Record. Assert zero user-facing occurrences of
//  'Product', 'Item', 'Your profile', 'Portal', 'Daily Room', 'UNKNOWN
//  MAKER' (C5-09, A-60, C-22, C5-16, A3-28)."
//
//  Scoped to the exact file:line sites `build/waves/w1/l1-e-copy-deck.md`
//  names — a targeted regression net for this wave's rows, not a whole-repo
//  sweep (that is W2 · L1-E's 48-row table).
//
//  Sites in files another lane owns are wrapped in `withKnownIssue` naming
//  the row and the lane; see `ErrorVoiceTests`'s header for the unwrap
//  signal. Two shape rules, both from the fix-round-2 review:
//
//  * `RL1E2-05` — **one `@Test` per deck row.** A wrapper holding several
//    rows passes on any ONE recorded failure, so a half-applied group used
//    to reach the tip silently.
//  * `RL1E2-15` — **every `SourcePin.read` is hoisted out of its wrapper.**
//    The wrapper swallowed a thrown read, so a renamed file left the pin
//    green forever.
//

import Testing
import Foundation
@testable import Patina

struct NounConsistencyTests {

    // MARK: - C5-09 — Piece, not Product or Item

    /// The sharp slice the finding is T0 for: a SwiftUI class name printed as
    /// a button label.
    @Test("the room item menu says 'See the piece', not a class name")
    func itemActionMenuNamesThePiece() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/ItemActionMenu.swift")
        #expect(!source.contains("\"View Product Detail\""))
        #expect(source.contains("\"See the piece\""))
    }

    /// The two `C5-09` sites in files **no W1 lane owns**, which L1-E
    /// therefore applies in its own worktree.
    /// `C5-09`'s `where` cites `Coordinator.swift:135,198`. Only `:135`
    /// (`displayName`) is copy; `:198` is `analyticsScreenName`, a PostHog
    /// screen name deliberately frozen by
    /// `RouteAnalyticsParityTests.stableRouteScreenNamesAreUnchanged` so a
    /// rename cannot silently break a dashboard. Renaming `displayName`
    /// therefore requires pinning the analytics name explicitly, exactly as
    /// `.table` and `.roomSavedItems` already do — asserted here so the two
    /// halves cannot drift apart.
    @Test("the routes and the saved-pieces empty state say 'pieces', and analytics does not move")
    func unownedSitesSayPieces() throws {
        let coordinator = try SourcePin.read("Patina/App/Coordinators/Coordinator.swift")
        #expect(coordinator.contains("case .crossRoom: return \"All pieces\""))
        #expect(AppRoute.crossRoom.displayName == "All pieces")
        #expect(AppRoute.crossRoom.analyticsScreenName == "All Items")

        let collections = try SourcePin.read("Patina/Features/Collections/Views/CollectionsView.swift")
        #expect(!collections.contains("\"No saved items yet\""))
        #expect(collections.contains("\"No saved pieces yet\""))
    }

    /// `RL1E2-09`: the tab directly above that empty state still read
    /// "All items", so the screen said both words at once. The view model is
    /// in `Features/Collections/**` beyond the schema side — no W1 lane
    /// (steward.md §5.1's residue row) — so it is L1-E's under the same
    /// clause `Coordinator.swift` was edited under.
    @Test("the Saved screen’s tab says 'All pieces', matching the empty state below it")
    func theSavedTabsSayPieces() throws {
        let source = try SourcePin.read("Patina/Features/Collections/ViewModels/CollectionsViewModel.swift")
        #expect(!source.contains("\"All items\""))
        #expect(source.contains("static let allItemsTab = \"All pieces\""))
    }

    @Test("the cross-room screen says 'pieces'")
    func crossRoomViewSaysPieces() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/CrossRoomView.swift")
        #expect(!source.contains("\"All Items\""))
    }

    @Test("the room screen’s section eyebrow says 'pieces'")
    func roomProjectViewSaysPieces() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/RoomProjectView.swift")
        #expect(!source.contains("\"Your Items\""))
    }

    @Test("the profile’s saved stat announces pieces, not items")
    func profileSavedStatSaysPieces() throws {
        let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        #expect(!source.contains("Saved items:"))
    }

    @Test("the empty catalogue state never says 'products'")
    func emptyCatalogueStateSaysPieces() throws {
        let source = try SourcePin.read(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift"
        )
        #expect(!source.contains("\"No products yet\""))
        #expect(!source.contains("Products you capture"))
    }

    // MARK: - A-60 / C-22 — one name for the client's own space

    @Test("the Companion menu names the studio, not a profile")
    func companionMenuNamesOneStudio() throws {
        let source = try SourcePin.read("Patina/Features/Companion/Services/CompanionActionRows.swift")
        #expect(!source.contains("\"Your profile\""))
        #expect(source.contains("\"Your studio\""))
    }

    /// `RL1E3-07`: this and the two needles below used to scan the whole
    /// source, so a comment naming the retired word satisfied them. They read
    /// string literals now — the approach `roleWordsCollapseToOnePerKind`
    /// already takes at the foot of this file.
    @Test("the Companion menu promises no Portal")
    func companionMenuPromisesNoPortal() throws {
        let literals = BrandVoiceLintTests.stringLiterals(
            in: try SourcePin.read("Patina/Features/Companion/Services/CompanionActionRows.swift")
        )
        #expect(!literals.contains { $0.contains("Portal") })
    }

    @Test("the profile screen no longer carries the retired 'YOUR PROFILE' header")
    func profileHeaderIsRetired() throws {
        let literals = BrandVoiceLintTests.stringLiterals(
            in: try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        )
        #expect(!literals.contains("YOUR PROFILE"))
    }

    // MARK: - C-38 — the boilerplate rationale, both implementations

    /// `RL1E2-08` / `RL1E2-20`: `C-38` had no pin at all, and the row was
    /// closed against `RecommendationsView` alone. There are **two**
    /// implementations of the sentence, and `RecommendationsView` reaches the
    /// other one first: its `recommendationRationale` returns `nil` only when
    /// there is no taste portrait, and delegates to
    /// `StyleProfile.recommendationRationale` when there is — which is the
    /// signed-in client's path, and the path the finding was observed on.
    /// `Features/Conversation/**` is "no lane, no W1 work" (steward.md §5.1),
    /// so the live half is L1-E's and is fixed here; the view half stays
    /// L1-C's.
    @Test("the taste portrait never falls back to the room-aware boilerplate")
    func stylePortraitCarriesNoBoilerplate() throws {
        let source = try SourcePin.read("Patina/Features/Conversation/Models/StyleProfile.swift")
        #expect(!source.contains("room-aware edit for"))
    }

    @Test("the browse grid’s card prints no rationale when there is no real match")
    func recommendationCardsCarryNoBoilerplate() throws {
        let source = try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        #expect(!source.contains("room-aware edit for"))
    }

    // MARK: - A-13 — the dead nudge above the real Continue button

    /// `RL1E2-08`: the deck carries `A-13` and nothing pinned it.
    /// `Features/StyleQuiz/**` is L1-A's, which has applied it by deleting
    /// `companionNudgeLabel` outright.
    @Test("the quiz’s dead 'Next question' nudge is gone")
    func theQuizNudgeIsGone() throws {
        let literals = BrandVoiceLintTests.stringLiterals(
            in: try SourcePin.read("Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift")
        )
        #expect(!literals.contains { $0.contains("Next question") })
    }

    // MARK: - C5-16 — the literal "UNKNOWN MAKER" never reaches a reader

    @Test("SavedItem carries the maker guard the Browse grid already has")
    func savedItemHasTheMakerGuard() throws {
        let source = try SourcePin.read("Patina/Core/Models/SavedItem.swift")
        #expect(source.contains("resolvedMakerName"))
    }

    @Test("the room row drops the maker line rather than printing UNKNOWN MAKER")
    func roomItemRowGuardsTheMakerName() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Components/RoomItemRow.swift")
        #expect(source.contains("resolvedMakerName"), "RoomItemRow still prints item.makerName raw")
    }

    @Test("the item menu drops the maker line rather than printing UNKNOWN MAKER")
    func itemActionMenuGuardsTheMakerName() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/ItemActionMenu.swift")
        #expect(source.contains("resolvedMakerName"), "ItemActionMenu still prints item.makerName raw")
    }

    @Test("the move/copy sheet drops the maker line rather than printing UNKNOWN MAKER")
    func moveOrCopySheetGuardsTheMakerName() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/MoveOrCopyItemSheet.swift")
        #expect(source.contains("resolvedMakerName"), "MoveOrCopyItemSheet still prints item.makerName raw")
    }

    // MARK: - A3-28 — one word for a kind of person, and it is never rendered

    /// `A3-28`'s schema half is reverted by ruling B2 v3 and its OAuth half is
    /// closed by `A3-07`. What survives into copy is the rule that no role
    /// word is ever *drawn*: the one fallback that could is
    /// `ProfileLookupService.bestName`, which already collapses
    /// "client"/"homeowner" to a single word.
    @Test("the role words a reader can see are one per kind of person")
    func roleWordsCollapseToOnePerKind() throws {
        let lookup = try SourcePin.read("Patina/Services/API/ProfileLookupService.swift")
        #expect(lookup.contains("case \"client\", \"homeowner\": return \"Client\""))
        for literal in BrandVoiceLintTests.stringLiterals(in: lookup) {
            #expect(literal != "Homeowner", "a third word for the client kind is rendered: \"\(literal)\"")
        }
    }
}
