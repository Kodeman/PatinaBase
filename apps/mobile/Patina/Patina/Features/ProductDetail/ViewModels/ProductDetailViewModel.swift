//
//  ProductDetailViewModel.swift
//  Patina
//
//  Manages product detail state, loading, and interactions
//

import SwiftUI
import SwiftData

@Observable
final class ProductDetailViewModel {

    // MARK: - State

    var product: Product?
    var isLoading = false
    var isSaved = false
    var error: String?

    /// Room context preserved from the entry point (Daily Room, search,
    /// companion rec). Drives "Place in *your* room" copy, AR mesh
    /// loading, and AddToRoomSheet pre-selection.
    var roomContextLocalId: UUID?
    var roomContextRemoteId: String?

    /// Spatial "why it fits" copy fetched from the feed response, keyed
    /// by context type (e.g. "scale", "light", "pairing").
    var spatialContext: [String: String] = [:]

    /// Assign room context at navigation time so the view and "Save View"
    /// action in AR know which room we're targeting.
    func attachRoomContext(
        localId: UUID?,
        remoteId: String?,
        spatialContext: [String: String] = [:]
    ) {
        self.roomContextLocalId = localId
        self.roomContextRemoteId = remoteId
        self.spatialContext = spatialContext
    }

    /// Persist this product to the attached room via the remote API.
    /// Falls back to local-only SwiftData insert if the room has no
    /// remoteId yet (mock room / offline).
    func addToAttachedRoom(source: String = "manual", context: ModelContext) async {
        guard let product else { return }
        if let remoteId = roomContextRemoteId {
            do {
                let userId = try await RoomsAPIClient.shared.resolveUserId()
                _ = try await RoomsAPIClient.shared.createItem(
                    CreateSavedItemPayload(
                        room_id: remoteId,
                        user_id: userId,
                        product_id: product.id,
                        name: product.name,
                        image_url: product.imageURL,
                        price_in_cents: product.priceCents,
                        source: source,
                        notes: nil
                    )
                )
                await MainActor.run { self.isSaved = true }
                return
            } catch {
                #if DEBUG
                print("[ProductDetail] remote add failed, falling back local: \(error)")
                #endif
            }
        }
        // Local fallback
        await MainActor.run {
            guard let localId = self.roomContextLocalId else { return }
            let store = RoomStore(context: context)
            _ = store.addItem(product, matchScore: product.matchScore, toRoomId: localId)
            self.isSaved = true
        }
    }

    // MARK: - Loading

    func loadProduct(id: String) async {
        isLoading = true
        do {
            let loaded = try await ProductAPIClient.shared.fetchProduct(id: id)
            await MainActor.run {
                self.product = loaded
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = "Couldn't load product"
                self.product = nil
                self.isLoading = false
            }
            #if DEBUG
            print("[ProductDetail] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - Actions

    func toggleSave(context: ModelContext) {
        guard let product else { return }
        isSaved.toggle()

        if isSaved {
            let item = TableItemModel(
                name: product.name,
                productId: product.id,
                imageURL: product.imageURL,
                brandName: product.makerName,
                priceInCents: product.priceCents
            )
            context.insert(item)
            HapticManager.shared.notification(.success)
        }

        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: isSaved ? .save : .skip, metadata: nil)
            )
        }
    }

    func trackView() {
        guard let product else { return }
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .view, metadata: nil)
            )
        }
    }
}
