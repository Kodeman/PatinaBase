//
//  RecommendationsViewModel.swift
//  Patina
//
//  Manages product recommendations state, filtering, and interactions
//

import SwiftUI
import SwiftData

@Observable
final class RecommendationsViewModel {

    // MARK: - State

    var products: [Product] = []
    var activeFilter: String = "All"
    var isLoading = false
    var error: String?

    // MARK: - Filters

    let filters = ["All", "Seating", "Tables", "Lighting", "Storage"]

    // MARK: - Computed

    var filteredProducts: [Product] {
        if activeFilter == "All" { return products }
        return products.filter { $0.category.displayName == activeFilter }
    }

    var headerSubtitle: String {
        let count = filteredProducts.count
        return "\(count) piece\(count == 1 ? "" : "s") curated for your space"
    }

    // MARK: - Loading

    func loadRecommendations(roomId: String? = nil) async {
        isLoading = true
        error = nil

        do {
            let response = try await ProductAPIClient.shared.fetchRecommendations(roomId: roomId)
            await MainActor.run {
                self.products = response.items
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = "Couldn't load recommendations"
                self.isLoading = false
                // Load mock data as fallback
                self.products = Product.mockProducts
            }
        }
    }

    // MARK: - Interactions

    func trackView(_ product: Product) {
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .view, metadata: nil)
            )
        }
    }

    func saveProduct(_ product: Product, context: ModelContext) {
        // Save to SwiftData as TableItemModel
        let item = TableItemModel(
            name: product.name,
            productId: product.id,
            imageURL: product.imageURL,
            brandName: product.makerName,
            priceInCents: product.priceCents
        )
        context.insert(item)

        // Track interaction
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .save, metadata: nil)
            )
        }

        HapticManager.shared.notification(.success)
    }

    func skipProduct(_ product: Product) {
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .skip, metadata: nil)
            )
        }
    }
}
