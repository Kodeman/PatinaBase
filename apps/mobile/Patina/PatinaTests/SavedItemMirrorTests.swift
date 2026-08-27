//
//  SavedItemMirrorTests.swift
//  PatinaTests
//
//  SP-14. The save loop the nightly ritual depends on: one currency formatter
//  for every surface that prints a saved price, and a `saved_items` mirror
//  that carries a null room — the roomless save is the standard path, not a
//  special case, because `saved_items.room_id` has been nullable since
//  00055_saved_items.sql:23.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct SavedItemMirrorTests {

    // MARK: - One formatter

    /// The reported split: "$4200" on the Saved row against "$4,200" on the
    /// grid, for the same piece.
    @Test
    func savedRowAndGridPrintTheSamePrice() {
        let item = TableItemModel(name: "Heirloom Oak", productId: "p1", priceInCents: 420_000)
        let product = Product(
            id: "p1", name: "Heirloom Oak", priceCents: 420_000, matchScore: 50,
            makerName: "Nordic Atelier", makerLocation: nil, makerStory: nil,
            imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
            category: .tables, tier: .styleMatch
        )
        #expect(item.formattedPrice == product.fullFormattedPrice)
        #expect(product.fullFormattedPrice == PatinaCurrency.formatWholeDollars(cents: 420_000))
    }

    @Test
    func roomItemPrintsTheSamePriceAsTheGrid() {
        let saved = SavedItem(
            productId: "p1", productName: "Heirloom Oak", makerName: "Nordic Atelier",
            priceCents: 420_000, matchScore: 50, hasAR: false, thumbGradientKey: "tables"
        )
        #expect(saved.fullFormattedPrice == PatinaCurrency.formatWholeDollars(cents: 420_000))
    }

    @Test
    func aPriceWithNoCentsStillPrintsNothing() {
        let item = TableItemModel(name: "Unpriced", productId: "p2", priceInCents: nil)
        #expect(item.formattedPrice == nil)
    }

    // MARK: - The mirror carries a null room

    @Test
    func roomlessSaveEncodesANullRoom() throws {
        let payload = CreateSavedItemPayload(
            room_id: nil,
            user_id: "u1",
            product_id: "p1",
            name: "Heirloom Oak",
            image_url: nil,
            price_in_cents: 420_000,
            price_cents_at_save: 420_000,
            source: "ios",
            notes: nil
        )
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(payload)
        ) as? [String: Any]
        let object = try #require(json)
        #expect(object["product_id"] as? String == "p1")
        #expect(object["room_id"] is NSNull || object["room_id"] == nil)
    }

    @Test
    func roomScopedSaveStillCarriesItsRoom() throws {
        let payload = CreateSavedItemPayload(
            room_id: "room-1",
            user_id: "u1",
            product_id: "p1",
            name: "Heirloom Oak",
            image_url: nil,
            price_in_cents: 420_000,
            price_cents_at_save: 420_000,
            source: "ios",
            notes: nil
        )
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(payload)
        ) as? [String: Any]
        #expect(try #require(json)["room_id"] as? String == "room-1")
    }

    // MARK: - The guest's save is local, and honest about it

    /// The fix-round regression: `saveProduct` mirrored on every save, and
    /// `resolveUserId()` throws `notAuthenticated` for a guest — so the guest's
    /// heart-tap deleted its own row and printed a connection error. SP-14's
    /// risk note says the local store stays authoritative until sign-in.
    @Test
    func aGuestSaveIsNotMirrored() {
        #expect(SavedItemMirror.shouldAttempt(isAuthenticated: false) == false)
        #expect(SavedItemMirror.shouldAttempt(isAuthenticated: true) == true)
    }

    /// A guest tapping the heart keeps the piece and is told nothing failed.
    @Test
    func aGuestHeartTapKeepsThePieceAndSaysNothingFailed() async throws {
        let schema = Schema([TableItemModel.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let context = ModelContext(try ModelContainer(for: schema, configurations: [config]))
        let viewModel = RecommendationsViewModel()
        let product = Product(
            id: "p-guest", name: "Oak Reading Chair", priceCents: 180_000, matchScore: 70,
            makerName: "Nordic Atelier", makerLocation: nil, makerStory: nil,
            imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
            category: .seating, tier: .styleMatch
        )

        viewModel.isAccountAvailable = { false }
        viewModel.saveProduct(product, context: context)
        // Long enough for a mirror Task to have run and reverted, had one run.
        try await Task.sleep(for: .milliseconds(400))

        #expect(viewModel.isSaved(product))
        #expect(viewModel.saveFailureMessage == nil)
        let stored = try context.fetch(FetchDescriptor<TableItemModel>())
        #expect(stored.count == 1)
        #expect(stored.first?.productId == "p-guest")
    }

    /// The notice a signed-in reader gets when the mirror does not land names
    /// the phone and the account — it does not blame a connection the app
    /// cannot see, and does not promise a retry that does not exist.
    @Test
    func theDeferredNoticeSaysWhatIsTrue() {
        let notice = SavedItemMirror.deferredNotice
        #expect(notice.contains("Saved on this phone"))
        #expect(!notice.lowercased().contains("connection"))
        #expect(!notice.lowercased().contains("will reach"))
    }
}
