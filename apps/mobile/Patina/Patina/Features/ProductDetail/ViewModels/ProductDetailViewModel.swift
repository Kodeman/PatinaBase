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

    /// Put this piece in a room — the act `Add to Room` names and, until W4's
    /// fix round, never performed: the button only toggled the account-wide
    /// save, so no path in the app ever set a room on a save
    /// (`waves/w4/walk.md` item 4).
    ///
    /// Three writes, in the order that keeps the local store authoritative
    /// (SP-14): the saved row gains its `roomId`, the room's own list gains
    /// the piece so its `SAVED PIECES` count is true, and the mirror carries
    /// `saved_items.room_id`. A room that has not synced has no `remoteId`,
    /// and the save is then local-first exactly as a guest's is.
    @MainActor
    func addToRoom(localId: UUID, remoteId: String?, context: ModelContext) {
        guard let product else { return }

        let existing = storedItems(productId: product.id, context: context)
        if existing.isEmpty {
            context.insert(TableItemModel(
                name: product.name,
                productId: product.id,
                imageURL: product.imageURL,
                brandName: product.resolvedMakerName ?? product.makerName,
                priceInCents: product.priceCents,
                roomId: localId
            ))
        } else {
            // A piece saved to the account earlier is not saved twice; it
            // gains the room it was just put in.
            for item in existing { item.roomId = localId }
        }

        let store = RoomStore(context: context)
        if store.room(id: localId)?.items.contains(where: { $0.productId == product.id }) != true {
            _ = store.addItem(product, matchScore: product.matchScore, toRoomId: localId)
        }

        isSaved = true
        roomContextLocalId = localId
        roomContextRemoteId = remoteId ?? roomContextRemoteId
        HapticManager.shared.notification(.success)
        Task { await mirrorSave(product: product, roomRemoteId: remoteId) }

        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .save, metadata: nil)
            )
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
            SavedRemoval.remove(productId: product.id, context: context)
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

    /// The row this screen writes, as a value — so "the payload carries the
    /// room" is a pinned fact rather than a claim about a network call.
    static func savePayload(
        product: Product,
        userId: String,
        roomRemoteId: String?
    ) -> CreateSavedItemPayload {
        CreateSavedItemPayload(
            room_id: roomRemoteId,
            user_id: userId,
            product_id: product.id,
            name: product.name,
            image_url: product.imageURL,
            price_in_cents: product.priceCents,
            price_cents_at_save: product.priceCents,
            source: SavedItemMirror.discoverySource,
            notes: nil
        )
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
            if let row = existing.first(where: { $0.product_id == product.id }) {
                // Already mirrored. If the piece has just been put in a room
                // and the server's row names none, that row is now wrong —
                // the local one says "· Guest Bedroom" and the account's does
                // not. Move it rather than leaving the two disagreeing.
                if let roomRemoteId, row.room_id == nil {
                    try await RoomsAPIClient.shared.updateItemRoom(id: row.id, roomId: roomRemoteId)
                }
                return
            }
            _ = try await RoomsAPIClient.shared.createItem(
                Self.savePayload(product: product, userId: userId, roomRemoteId: roomRemoteId)
            )
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[ProductDetail] save mirror failed: \(error.localizedDescription)")
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
