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
import SwiftUI
import UIKit
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

    /// W3 · N2. SP-02 wired `p_category` and then filtered the result again on
    /// the client, so the screen never actually depended on the server's
    /// answer. The subtitle counts what the RPC returned, not what survived a
    /// second pass.
    @Test
    func theSubtitleCountsWhatTheServerReturned() {
        let viewModel = RecommendationsViewModel()
        viewModel.products = [
            Product(
                id: "a", name: "Brass Arc Floor Lamp", priceCents: 89_000, matchScore: 91,
                makerName: "Nordic Atelier", makerLocation: nil, makerStory: nil,
                imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
                category: .lighting, tier: .styleMatch
            )
        ]
        viewModel.activeFilter = "Lighting"
        #expect(viewModel.filteredProducts.count == 1)
        #expect(viewModel.headerSubtitle == "1 piece chosen for your space")
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

    // MARK: - One card size (SP-02)

    /// The browse column on the review device is 171 pt wide.
    private static let columnWidth: CGFloat = 171

    private static func infoHeight(name: String, maker: String? = "Nordic Atelier", rationale: String? = nil) -> CGFloat {
        let host = UIHostingController(
            rootView: BrowseCardInfo(
                makerName: maker,
                name: name,
                price: "$4,200",
                rationale: rationale
            )
            .frame(width: columnWidth)
        )
        return host.sizeThatFits(
            in: CGSize(width: columnWidth, height: .greatestFiniteMagnitude)
        ).height
    }

    /// A card's height must not follow its name. The text block reserves two
    /// lines for the name whatever it says, so a one-word piece and a piece
    /// whose name would wrap past the clamp are the same height — which is what
    /// keeps the two cards in a row one size.
    @Test
    func cardTextHeightDoesNotFollowNameLength() {
        let short = Self.infoHeight(name: "Chair")
        let twoLine = Self.infoHeight(name: "Heirloom Oak Dining Table")
        let runaway = Self.infoHeight(
            name: "Heirloom Oak Dining Table With A Name That Would Wrap Well Past Two Lines If Nothing Clamped It"
        )
        #expect(short == twoLine, "short \(short) vs two-line \(twoLine)")
        #expect(short == runaway, "short \(short) vs runaway \(runaway)")
    }

    /// The same clamp on the rationale line, and on a missing maker: neither
    /// may change the card's height either.
    @Test
    func cardTextHeightDoesNotFollowRationaleOrMissingMaker() {
        let plain = Self.infoHeight(name: "Chair", rationale: "Picked for your warm palette.")
        let long = Self.infoHeight(
            name: "Chair",
            rationale: "Picked for your warm palette, your oak preference, and the room's own proportions, which would run long."
        )
        #expect(plain == long, "plain \(plain) vs long \(long)")

        let named = Self.infoHeight(name: "Chair", maker: "Nordic Atelier")
        let anonymous = Self.infoHeight(name: "Chair", maker: nil)
        #expect(named == anonymous, "named \(named) vs anonymous \(anonymous)")
    }
}
