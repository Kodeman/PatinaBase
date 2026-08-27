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

    /// U39: the room this load was scoped to (or nil for the general
    /// marketplace), remembered so `retry()` can re-invoke identically.
    private(set) var lastRoomId: String?

    /// U14/U29: what's been saved, driving the Save/Unsave menu toggle and
    /// the heart fill state. Seeded from persisted local + remote state by
    /// `seedSavedState` when the view loads (a prior visit's or another
    /// screen's/device's save counts too), then kept current by this
    /// instance's own `saveProduct`/`unsaveProduct` calls.
    private(set) var savedProductIds: Set<String> = []

    /// Maps a saved product to the remote `saved_items` row id so Unsave can
    /// mirror the removal — populated by `seedSavedState` for pre-existing
    /// saves and by `saveProduct` when this instance's own remote save
    /// succeeds.
    private var remoteSavedItemIds: [String: String] = [:]

    /// U29: transient notice shown when the remote save mirror fails, so the
    /// user never believes an unsaved item is saved. Cleared automatically.
    var saveFailureMessage: String?

    // MARK: - Filters

    let filters = ["All", "Seating", "Tables", "Lighting", "Storage"]

    // MARK: - Computed

    var filteredProducts: [Product] {
        if activeFilter == "All" { return products }
        return products.filter { $0.category.displayName == activeFilter }
    }

    var headerSubtitle: String {
        let count = filteredProducts.count
        let piece = "piece\(count == 1 ? "" : "s")"
        // U06/U07: room-scoped browse gets its own scoping language.
        // SP-02: "curated" is not how anyone here talks — the word is "chosen".
        let scope = lastRoomId != nil ? "chosen for this room" : "chosen for your space"
        return "\(count) \(piece) \(scope)"
    }

    /// SP-02: the chip's category goes to the RPC as `p_category`, so the
    /// subtitle's number is the catalog's real count for that category rather
    /// than however many of the ≤20 already-fetched rows happened to match.
    /// `All` clears the filter.
    static func category(forFilter filter: String) -> ProductCategory? {
        ProductCategory.allCases.first { $0.displayName == filter }
    }

    func isSaved(_ product: Product) -> Bool {
        savedProductIds.contains(product.id)
    }

    /// U29 fix: without this, a product saved in a prior visit (or from
    /// another screen/device) shows as unsaved here — the menu offers
    /// "Save" again with no unique constraint on `saved_items` to stop a
    /// duplicate row, and `unsaveProduct` can't mirror the remote delete
    /// because `remoteSavedItemIds` only ever knew about saves made by
    /// this instance. Seeds both from what's actually persisted: local
    /// `TableItemModel` rows for the fast/offline case, and — mirroring
    /// `CollectionsViewModel`'s own remote reconciliation — each synced
    /// room's `saved_items` rows for the remote id `unsaveProduct` needs.
    @MainActor
    func seedSavedState(context: ModelContext) async {
        let localDescriptor = FetchDescriptor<TableItemModel>()
        let localItems = (try? context.fetch(localDescriptor)) ?? []
        savedProductIds = Set(localItems.compactMap { $0.productId })

        let remoteRoomIds = RoomStore(context: context).allRooms().compactMap { $0.remoteId }
        for remoteRoomId in remoteRoomIds {
            guard let rows = try? await RoomsAPIClient.shared.listItems(forRoomId: remoteRoomId) else { continue }
            for row in rows {
                guard let productId = row.product_id else { continue }
                savedProductIds.insert(productId)
                remoteSavedItemIds[productId] = row.id
            }
        }
    }

    // MARK: - Loading

    /// - Parameter roomId: the room's synced **remote** id (`RoomModel.remoteId`),
    ///   never the local SwiftData id — this is passed straight to the
    ///   `get_recommendations` RPC's `p_room_id`, which filters against the
    ///   remote `rooms` table. Callers resolve local → remote before calling
    ///   (see `RecommendationsView.resolveRoomRemoteId`); a local id here
    ///   would silently no-op the room filter.
    func loadRecommendations(roomId: String? = nil) async {
        lastRoomId = roomId
        isLoading = true
        error = nil

        let category = Self.category(forFilter: activeFilter)
        do {
            let response = try await ProductAPIClient.shared.fetchRecommendations(
                roomId: roomId,
                category: category
            )
            await MainActor.run {
                self.products = response.items
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = "Couldn't load recommendations"
                self.products = []
                self.isLoading = false
            }
            #if DEBUG
            PatinaLog.ui.error("[Recommendations] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// SP-02: re-fetch for the chip the reader just tapped.
    func applyActiveFilter(roomId: String?) async {
        await loadRecommendations(roomId: roomId)
    }

    /// U39: re-invokes the last load with the same room scope — the retry
    /// affordance in `PatinaErrorState`.
    func retry() {
        Task { await loadRecommendations(roomId: lastRoomId) }
    }

    // MARK: - Interactions

    func trackView(_ product: Product) {
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .view, metadata: nil)
            )
        }
    }

    func saveProduct(_ product: Product, context: ModelContext, roomRemoteId: String? = nil) {
        // Save to SwiftData as TableItemModel
        let item = TableItemModel(
            name: product.name,
            productId: product.id,
            imageURL: product.imageURL,
            brandName: product.makerName,
            priceInCents: product.priceCents
        )
        context.insert(item)
        savedProductIds.insert(product.id)
        saveFailureMessage = nil

        // Mirror to Supabase `saved_items` so the save follows the user
        // across devices and surfaces in the designer portal.
        if let roomRemoteId {
            Task {
                do {
                    let userId = try await RoomsAPIClient.shared.resolveUserId()
                    let payload = CreateSavedItemPayload(
                        room_id: roomRemoteId,
                        user_id: userId,
                        product_id: product.id,
                        name: product.name,
                        image_url: product.imageURL,
                        price_in_cents: product.priceCents,
                        source: "ios",
                        notes: nil
                    )
                    let created = try await RoomsAPIClient.shared.createItem(payload)
                    await MainActor.run {
                        self.remoteSavedItemIds[product.id] = created.id
                    }
                } catch {
                    #if DEBUG
                    PatinaLog.ui.error("[Recommendations] save sync failed: \(error.localizedDescription)")
                    #endif
                    // U29: the remote mirror is what makes a save durable
                    // across devices/the portal — on failure, revert the
                    // visible saved state rather than let the user believe
                    // an unsaved item is saved.
                    await MainActor.run {
                        self.savedProductIds.remove(product.id)
                        context.delete(item)
                        self.showSaveFailure()
                    }
                }
            }
        }

        // Track interaction
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .save, metadata: nil)
            )
        }

        HapticManager.shared.notification(.success)
    }

    /// U14: reverses a save from the ⋯ menu — removes the local item and
    /// best-effort mirrors the removal remotely when `remoteSavedItemIds`
    /// knows the row id, whether that came from `seedSavedState` (a save
    /// made earlier/elsewhere) or this instance's own `saveProduct`.
    func unsaveProduct(_ product: Product, context: ModelContext) {
        savedProductIds.remove(product.id)

        let productId = product.id
        let descriptor = FetchDescriptor<TableItemModel>(
            predicate: #Predicate { $0.productId == productId }
        )
        if let matches = try? context.fetch(descriptor) {
            for match in matches { context.delete(match) }
        }

        if let remoteId = remoteSavedItemIds.removeValue(forKey: product.id) {
            Task {
                do {
                    try await RoomsAPIClient.shared.deleteItem(id: remoteId)
                } catch {
                    #if DEBUG
                    PatinaLog.ui.error("[Recommendations] unsave remote delete failed: \(error.localizedDescription)")
                    #endif
                }
            }
        }

        HapticManager.shared.notification(.success)
    }

    /// U29: shows the save-failure notice for a few seconds then clears it —
    /// deliberately lightweight, no dismiss affordance to wire up.
    private func showSaveFailure() {
        saveFailureMessage = "Couldn't save — check your connection and try again."
        Task {
            try? await Task.sleep(for: .seconds(4))
            await MainActor.run {
                self.saveFailureMessage = nil
            }
        }
    }

    func skipProduct(_ product: Product) {
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .skip, metadata: nil)
            )
        }
    }
}
