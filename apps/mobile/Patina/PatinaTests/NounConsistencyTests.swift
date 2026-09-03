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
//  sweep (that is W2 · L1-E's 48-row table). Sites in files another lane
//  owns are wrapped in `withKnownIssue` naming the row and the lane; see
//  `ErrorVoiceTests`'s header for the unwrap signal.
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
        withKnownIssue("deck row C5-09 / ItemActionMenu.swift:31 is L1-B's; unwrap after L1-B merges") {
            let source = try SourcePin.read("Patina/Features/Rooms/Views/ItemActionMenu.swift")
            #expect(!source.contains("\"View Product Detail\""))
            #expect(source.contains("\"See the piece\""))
        }
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

    @Test("the cross-room and room screens say 'pieces'")
    func roomsSurfacesSayPieces() throws {
        withKnownIssue("deck rows C5-09 / CrossRoomView.swift:64,81 and RoomProjectView.swift:212 are L1-B's") {
            let crossRoom = try SourcePin.read("Patina/Features/Rooms/Views/CrossRoomView.swift")
            #expect(!crossRoom.contains("\"All Items\""))
            let roomProject = try SourcePin.read("Patina/Features/Rooms/Views/RoomProjectView.swift")
            #expect(!roomProject.contains("\"Your Items\""))
        }
    }

    @Test("the profile's saved stat announces pieces, not items")
    func profileSavedStatSaysPieces() throws {
        withKnownIssue("deck row C5-09 / ProfileView.swift:217 accessibility label is L1-C's") {
            let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
            #expect(!source.contains("Saved items:"))
        }
    }

    @Test("the empty catalogue state never says 'products'")
    func emptyCatalogueStateSaysPieces() throws {
        withKnownIssue("deck row C5-09 / PatinaEmptyState.swift:66-67 is L1-D's; unwrap after L1-D merges") {
            let source = try SourcePin.read(
                "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift"
            )
            #expect(!source.contains("\"No products yet\""))
            #expect(!source.contains("Products you capture"))
        }
    }

    // MARK: - A-60 / C-22 — one name for the client's own space

    @Test("the Companion menu names the studio, and promises no Portal")
    func companionMenuNamesOneStudio() throws {
        withKnownIssue("deck rows A-60 / C-22 in CompanionActionRows.swift are L1-C's") {
            let source = try SourcePin.read("Patina/Features/Companion/Services/CompanionActionRows.swift")
            #expect(!source.contains("\"Your profile\""))
            #expect(!source.contains("Portal"))
            #expect(source.contains("\"Your studio\""))
        }
    }

    @Test("the profile screen no longer carries the retired 'YOUR PROFILE' header")
    func profileHeaderIsRetired() throws {
        withKnownIssue("deck row A-60 / ProfileView.swift:148 is L1-C's") {
            let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
            #expect(!source.contains("Text(\"YOUR PROFILE\")"))
        }
    }

    // MARK: - C5-16 — the literal "UNKNOWN MAKER" never reaches a reader

    @Test("saved-item rows drop the maker line rather than printing UNKNOWN MAKER")
    func savedItemRowsGuardTheMakerName() throws {
        withKnownIssue("deck rows C5-16 in Core/Models and Features/Rooms are L1-B's") {
            let model = try SourcePin.read("Patina/Core/Models/SavedItem.swift")
            #expect(model.contains("resolvedMakerName"))
            for path in [
                "Patina/Features/Rooms/Components/RoomItemRow.swift",
                "Patina/Features/Rooms/Views/ItemActionMenu.swift",
                "Patina/Features/Rooms/Views/MoveOrCopyItemSheet.swift"
            ] {
                let source = try SourcePin.read(path)
                #expect(source.contains("resolvedMakerName"), "\(path) still prints item.makerName raw")
            }
        }
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
