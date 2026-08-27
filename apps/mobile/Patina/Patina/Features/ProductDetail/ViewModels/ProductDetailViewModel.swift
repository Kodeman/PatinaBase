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
                        price_cents_at_save: product.priceCents,
                        source: source,
                        notes: nil
                    )
                )
                await MainActor.run { self.isSaved = true }
                return
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[ProductDetail] remote add failed, falling back local: \(error)")
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
            PatinaLog.ui.error("[ProductDetail] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - Actions

    /// SP-14: seed `isSaved` from what is actually persisted before the screen
    /// draws. Without it a piece saved yesterday offers "Add to Room" again
    /// today, and tapping it writes a second row.
    @MainActor
    func seedSavedState(productId: String?, context: ModelContext) {
        guard let productId else { return }
        isSaved = !storedItems(productId: productId, context: context).isEmpty
    }

    /// SP-14: idempotent on `productId`. Saving twice keeps one local row and
    /// one `saved_items` row; unsaving removes both.
    func toggleSave(context: ModelContext) {
        guard let product else { return }
        let existing = storedItems(productId: product.id, context: context)

        if existing.isEmpty {
            isSaved = true
            context.insert(TableItemModel(
                name: product.name,
                productId: product.id,
                imageURL: product.imageURL,
                brandName: product.resolvedMakerName ?? product.makerName,
                priceInCents: product.priceCents,
                roomId: roomContextLocalId
            ))
            HapticManager.shared.notification(.success)
            // SP-14: the mirror is what makes a save survive a reinstall and
            // reach a second device. It runs whether or not a room is
            // attached — `saved_items.room_id` is nullable.
            Task { await mirrorSave(product: product, roomRemoteId: roomContextRemoteId) }
        } else {
            isSaved = false
            for item in existing { context.delete(item) }
            Task { await mirrorUnsave(productId: product.id) }
        }

        let saved = isSaved
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: saved ? .save : .skip, metadata: nil)
            )
        }
    }

    @MainActor
    private func storedItems(productId: String, context: ModelContext) -> [TableItemModel] {
        let descriptor = FetchDescriptor<TableItemModel>(
            predicate: #Predicate { $0.productId == productId }
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Writes the account's `saved_items` row, skipping the insert when one
    /// already exists for this product — the remote half of "save once".
    private func mirrorSave(product: Product, roomRemoteId: String?) async {
        // SP-14's risk note: a guest has no account to mirror into — the local
        // store stays authoritative until SP-06's claim step.
        guard SavedItemMirror.shouldAttempt(isAuthenticated: AuthService.shared.isAuthenticated) else { return }
        do {
            let userId = try await RoomsAPIClient.shared.resolveUserId()
            let existing = try await RoomsAPIClient.shared.listItems(forUserId: userId)
            if existing.contains(where: { $0.product_id == product.id }) { return }
            _ = try await RoomsAPIClient.shared.createItem(
                CreateSavedItemPayload(
                    room_id: roomRemoteId,
                    user_id: userId,
                    product_id: product.id,
                    name: product.name,
                    image_url: product.imageURL,
                    price_in_cents: product.priceCents,
                    price_cents_at_save: product.priceCents,
                    source: "ios",
                    notes: nil
                )
            )
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[ProductDetail] save mirror failed: \(error.localizedDescription)")
            #endif
        }
    }

    private func mirrorUnsave(productId: String) async {
        guard SavedItemMirror.shouldAttempt(isAuthenticated: AuthService.shared.isAuthenticated) else { return }
        do {
            let userId = try await RoomsAPIClient.shared.resolveUserId()
            let rows = try await RoomsAPIClient.shared.listItems(forUserId: userId)
            for row in rows where row.product_id == productId {
                try await RoomsAPIClient.shared.deleteItem(id: row.id)
            }
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[ProductDetail] unsave mirror failed: \(error.localizedDescription)")
            #endif
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

    /// Fired when the user taps the ShareLink in the top bar (R25).
    func trackShare() {
        guard let product else { return }
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .share, metadata: nil)
            )
        }
    }
}
