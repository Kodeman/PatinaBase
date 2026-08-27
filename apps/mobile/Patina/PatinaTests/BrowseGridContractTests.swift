//
//  BrowseGridContractTests.swift
//  PatinaTests
//
//  SP-02. Pins the two pure decisions the browse grid's geometry fix rides
//  with: the filter chip's category reaches the RPC as `p_category` (so the
//  subtitle's number is the catalog's real count, not a count of the ≤20 rows
//  already fetched), and the subtitle says "chosen", not "curated".
//
//  The geometry itself — one card size, and a piece top bar that stays on
//  canvas — is a layout claim and is proved on the simulator, not here:
//  `shots/w1b-a-01-before-piece-topbar-offcanvas.png` (Add to Room reported at
//  x = -77.3, width 556.3 on a 402 pt screen) against
//  `shots/w1b-a-03-after-piece-topbar-onscreen.png`.
//

import Testing
@testable import Patina

@MainActor
struct BrowseGridContractTests {

    @Test
    func everyChipMapsToItsCategory() {
        let viewModel = RecommendationsViewModel()
        for filter in viewModel.filters where filter != "All" {
            let category = RecommendationsViewModel.category(forFilter: filter)
            #expect(category != nil, "chip \(filter) sends no p_category")
            #expect(category?.displayName == filter)
        }
    }

    @Test
    func allChipSendsNoCategory() {
        #expect(RecommendationsViewModel.category(forFilter: "All") == nil)
    }

    @Test
    func subtitleSaysChosenNotCurated() {
        let viewModel = RecommendationsViewModel()
        #expect(viewModel.headerSubtitle == "0 pieces chosen for your space")
        #expect(!viewModel.headerSubtitle.contains("curated"))
    }

    /// The chips the screen offers must all be real categories — a chip that
    /// maps to nothing would filter the grid to empty and print "0 pieces".
    @Test
    func chipVocabularyMatchesTheCategoryEnum() {
        let viewModel = RecommendationsViewModel()
        let chips = Set(viewModel.filters.filter { $0 != "All" })
        let categories = Set(ProductCategory.allCases.map(\.displayName))
        #expect(chips.isSubset(of: categories))
    }
}
