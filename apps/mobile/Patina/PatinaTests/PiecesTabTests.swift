//
//  PiecesTabTests.swift
//  PatinaTests
//
//  W3 · N2 · M9. The Pieces tab is "Browse pieces" with a door to Saved that
//  cannot hide, and Saved stays a canonical surface of its own rather than
//  becoming a segment of the grid (B-7 b).
//
//  Two honesty rules ride here. The row draws at zero (F14 — Saved's door
//  disappearing at zero count is the reported defect), and the number it prints
//  is the count this screen actually knows — the local saved rows merged with
//  the account's `saved_items` — never a placeholder.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct PiecesTabTests {

    // MARK: - The row's copy (M9 states)

    @Test
    func theRowPrintsItsCountAndSaysNothingYetAtZero() {
        #expect(SavedDoorRow.meta(count: 0) == "Nothing yet")
        #expect(SavedDoorRow.meta(count: 1) == "1 piece")
        #expect(SavedDoorRow.meta(count: 3) == "3 pieces")
        #expect(SavedDoorRow.meta(count: 12) == "12 pieces")
    }

    @Test
    func theRowIsTitledSaved() {
        #expect(SavedDoorRow.title == "Saved")
    }

    // MARK: - B-7 (b): the row does not share the tab's accessibility label

    @Test
    func theRowCarriesItsOwnAccessibilityLabel() {
        #expect(SavedDoorRow.accessibilityLabel(count: 3) == "Saved, 3 pieces")
        #expect(SavedDoorRow.accessibilityLabel(count: 0) == "Saved, nothing yet")

        for count in [0, 1, 3] {
            #expect(
                SavedDoorRow.accessibilityLabel(count: count) != PatinaTab.pieces.canonicalName,
                "B-7 (b): the Saved row must not answer to the Pieces tab's label"
            )
        }
    }

    /// The two canonical names stay distinct: the tab opens "Browse pieces",
    /// the row opens "Saved", and `AppRoute.table` is what the app already
    /// calls Saved.
    @Test
    func theTwoCanonicalNamesStayDistinct() {
        #expect(PatinaTab.pieces.canonicalName == "Browse pieces")
        #expect(AppRoute.table.displayName == "Saved")
        #expect(AppRoute.table.displayName != PatinaTab.pieces.canonicalName)
    }

    // MARK: - The door opens the canonical Saved surface, on the Pieces tab

    /// `.table` is filed under Pieces and is NOT a tab root, so the push stays
    /// on the Pieces stack and Back returns to the grid rather than to Today.
    @Test
    func savedOpensOnThePiecesTabAndComesBack() {
        #expect(RouteTabTable.tab(for: .table) == .pieces)
        #expect(!RouteTabTable.isTabRoot(.table))

        let tabs = TabNavigationModel(selected: .pieces)
        tabs.push(.table)
        #expect(tabs.selected == .pieces)
        #expect(tabs.stack(for: .pieces) == [.table])
        #expect(tabs.visibleRoute == .table)

        tabs.pop()
        #expect(tabs.selected == .pieces)
        #expect(tabs.visibleRoute == RouteTabTable.rootRoute(for: .pieces))
    }

    /// Both roots dispatch `.table` to `CollectionsView`, whose Boards /
    /// All items tabs are untouched by this lane.
    @Test
    func savedIsStillTheBoardsAndAllItemsSurface() throws {
        #expect(CollectionsViewModel().tabs == ["Boards", "All items"])

        for path in [
            "Patina/Features/Navigation/HouseFirstRoot.swift",
            "Patina/ContentView.swift"
        ] {
            let source = try SourcePin.read(path)
            #expect(
                source.contains("case .table:\n            CollectionsView()"),
                "\(path) no longer dispatches .table to the canonical Saved surface"
            )
        }
    }

    // MARK: - The row draws only where M9 puts it

    /// M9 puts the row at the top of the Pieces **tab**. A pushed browse — the
    /// flag-off root's `.emergence(nil)`, and every room-scoped
    /// `roomEmergence` — is the same view and must not grow a second door.
    @Test
    func theRowIsDrawnOnlyWhenTheScreenIsTheTabRoot() throws {
        let source = try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        #expect(source.contains("if isTabRoot"))
        #expect(source.contains("SavedDoorRow("))
        #expect(source.contains("navigate(to: .table)"))
    }

    // MARK: - The chip filters on the server, and only there

    /// The values that go over the wire are `products.category` vocabulary:
    /// `get_aesthete_matches` compares `p.category = p_category` exactly
    /// (00244:1016), with no normalisation on either side.
    @Test
    func everyChipSendsItsLowercaseCategoryAsPCategory() {
        let viewModel = RecommendationsViewModel()
        for filter in viewModel.filters where filter != "All" {
            guard let raw = RecommendationsViewModel.category(forFilter: filter)?.rawValue else {
                Issue.record("chip \(filter) sends no p_category")
                continue
            }
            #expect(raw == raw.lowercased(), "p_category goes over the wire in the DB's vocabulary")
            #expect(ProductCategory(rawValue: raw) != nil)
        }
        #expect(RecommendationsViewModel.category(forFilter: "All") == nil)
    }

    /// The server is the filter. A second client-side pass over `activeFilter`
    /// can only subtract rows the RPC deliberately returned — the chip's count
    /// would then be a count of what survived the client, not the catalogue's.
    @Test
    func theGridShowsEverythingTheServerReturnedForTheActiveChip() {
        let viewModel = RecommendationsViewModel()
        viewModel.products = [
            Self.product(id: "a", category: .lighting),
            Self.product(id: "b", category: .decor)
        ]

        viewModel.activeFilter = "All"
        #expect(viewModel.filteredProducts.count == 2)

        viewModel.activeFilter = "Lighting"
        #expect(
            viewModel.filteredProducts.count == 2,
            "the grid re-filtered rows the server already scoped with p_category"
        )
    }

    @Test
    func nothingFiltersTheGridOnTheActiveChipInTheClient() throws {
        let source = try SourcePin.read(
            "Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift"
        )
        #expect(!source.contains("products.filter { $0.category.displayName == activeFilter }"))
        #expect(source.contains("category: category"))
    }

    // MARK: - Fixtures

    private static func product(id: String, category: ProductCategory) -> Product {
        Product(
            id: id,
            name: "Piece \(id)",
            priceCents: 1000,
            matchScore: 80,
            makerName: "Nordic Atelier",
            makerLocation: nil,
            makerStory: nil,
            imageURL: nil,
            usdzURL: nil,
            styleTags: [],
            materialTags: [],
            badges: [],
            category: category,
            tier: .styleMatch
        )
    }
}
