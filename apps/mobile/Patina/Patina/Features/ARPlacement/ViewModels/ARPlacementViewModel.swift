//
//  ARPlacementViewModel.swift
//  Patina
//
//  ViewModel for AR furniture placement experience
//

import SwiftUI
import ARKit

@Observable
final class ARPlacementViewModel {

    // MARK: - State

    var product: Product?
    var isLoading = false
    var isPlaced = false
    var rotationAngle: Float = 0

    /// Remote room id (Supabase `rooms.id`) that this AR session is
    /// placing into. When set, the session attempts to load the most
    /// recent scan mesh for the room so the user sees their actual
    /// space instead of a generic plane.
    var roomRemoteId: String?

    /// Most recently loaded room-scan mesh URL — the ARPlacementManager
    /// downloads this and adds it as an anchor.
    var loadedMeshURL: URL?

    /// "Save View" result banner state
    var saveState: SaveState = .idle

    enum SaveState {
        case idle
        case saving
        case saved
        case failed(String)
    }

    // MARK: - Room mesh

    /// Attach a room before the AR session begins. Kicks off async mesh
    /// fetch from `room_scans` — the most recent scan's `model_url` wins.
    func attachRoom(remoteId: String) {
        self.roomRemoteId = remoteId
        Task { [weak self] in
            guard let self else { return }
            do {
                let scans = try await RoomsAPIClient.shared.listScans(forRoomId: remoteId)
                if let url = scans.first?.model_url.flatMap(URL.init(string:)) {
                    await MainActor.run { self.loadedMeshURL = url }
                }
            } catch {
                #if DEBUG
                print("[AR] failed to load room mesh: \(error)")
                #endif
            }
        }
    }

    /// "Save View" — persist the currently-placed product to the room.
    func saveCurrentPlacement() async {
        guard let product, let remoteId = roomRemoteId else { return }
        await MainActor.run { self.saveState = .saving }
        do {
            let userId = try await RoomsAPIClient.shared.resolveUserId()
            let transformBlob = [
                "rotation_y_rad": rotationAngle,
            ] as [String: Any]
            _ = try await RoomsAPIClient.shared.createItem(
                CreateSavedItemPayload(
                    room_id: remoteId,
                    user_id: userId,
                    product_id: product.id,
                    name: product.name,
                    image_url: product.imageURL,
                    price_in_cents: product.priceCents,
                    source: "ar_placement",
                    notes: "transform:\(transformBlob)"
                )
            )
            await MainActor.run { self.saveState = .saved }
        } catch {
            await MainActor.run {
                self.saveState = .failed(error.localizedDescription)
            }
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
                self.product = Product.mockProducts.first { $0.id == id }
                self.isLoading = false
            }
        }
    }

    // MARK: - AR Check

    var supportsAR: Bool {
        ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    var hasUSDZModel: Bool {
        product?.usdzURL != nil
    }

    // MARK: - Tracking

    func trackARPlacement() {
        guard let product else { return }
        Task {
            await ProductAPIClient.shared.trackInteraction(
                InteractionEvent(productId: product.id, eventType: .arPlace, metadata: nil)
            )
        }
    }
}
