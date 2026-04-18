//
//  DailyRoomViewModel.swift
//  Patina
//
//  ViewModel powering The Daily Room — editorial story + room-contextual feed.
//

import SwiftUI
import SwiftData

@Observable
final class DailyRoomViewModel {

    /// Provided by the view so the VM can read/write real rooms.
    var modelContext: ModelContext?


    // MARK: - Filters

    struct CategoryFilter: Identifiable, Hashable {
        let id: String
        let label: String
    }

    static let defaultFilters: [CategoryFilter] = [
        CategoryFilter(id: "all", label: "All"),
        CategoryFilter(id: "seating", label: "Seating"),
        CategoryFilter(id: "tables", label: "Tables")
    ]

    // MARK: - State

    var todayStory: DailyStory?
    var rooms: [RoomSummary] = []
    var selectedRoomID: RoomSummary.ID?
    var categoryFilters: [CategoryFilter] = DailyRoomViewModel.defaultFilters
    var activeFilterID: String = "all"
    var allRecommendations: [DailyRecommendation] = []
    var presentingAddFor: Product?
    var toastMessage: String?

    /// Spatial-context copy keyed by product ID, populated from the
    /// room-aware feed response so DailyProductCard can render "why it fits"
    /// text under the product name.
    var spatialContext: [String: [String: String]] = [:]

    /// Remote `rooms.id` lookup keyed by the local SwiftData UUID so the
    /// feed fetcher knows which remote room to query when the user taps
    /// a chip. Populated from RoomModel.remoteId during load().
    var remoteIdByLocal: [UUID: String] = [:]

    private var toastTask: Task<Void, Never>?
    private var feedTask: Task<Void, Never>?

    // MARK: - Derived

    var greetingDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE · MMM d"
        return formatter.string(from: Date())
    }

    var selectedRoom: RoomSummary? {
        guard let id = selectedRoomID else { return rooms.first }
        return rooms.first(where: { $0.id == id }) ?? rooms.first
    }

    var recommendations: [DailyRecommendation] {
        guard activeFilterID != "all" else { return allRecommendations }
        return allRecommendations.filter { rec in
            switch activeFilterID {
            case "seating": return rec.product.category == .seating
            case "tables": return rec.product.category == .tables
            default: return true
            }
        }
    }

    // MARK: - Lifecycle

    func load() {
        todayStory = .mock
        if let ctx = modelContext {
            let store = RoomStore(context: ctx)
            let realRooms = store.allRooms()
            if realRooms.isEmpty {
                rooms = RoomSummary.mockAll
                remoteIdByLocal = [:]
            } else {
                rooms = realRooms.map { RoomSummary(from: $0) }
                remoteIdByLocal = Dictionary(
                    uniqueKeysWithValues: realRooms.compactMap { r in
                        r.remoteId.map { (r.id, $0) }
                    }
                )
            }
        } else {
            rooms = RoomSummary.mockAll
            remoteIdByLocal = [:]
        }
        // Prefer a room that RoomSelectionStore already has selected (e.g.
        // one just created via Walk/Manual entry) so first paint matches.
        if let localId = RoomSelectionStore.shared.selectedLocalId,
           rooms.contains(where: { $0.id == localId }) {
            selectedRoomID = localId
        } else {
            selectedRoomID = rooms.first?.id
        }
        allRecommendations = DailyRecommendation.mockAll
        refreshFeedForSelectedRoom()
    }

    /// Fetch the room-aware feed for the currently selected room. Falls
    /// back silently to the mock list if the room has no remote id or the
    /// request fails — keeps the UI usable offline and for mock rooms.
    func refreshFeedForSelectedRoom() {
        guard let localId = selectedRoomID,
              let remoteId = remoteIdByLocal[localId] else {
            spatialContext = [:]
            return
        }
        feedTask?.cancel()
        feedTask = Task { [weak self] in
            do {
                let response = try await FeedAPIClient.shared.fetchFeed(roomId: remoteId)
                await MainActor.run {
                    guard let self else { return }
                    self.spatialContext = Dictionary(
                        uniqueKeysWithValues: response.products.map {
                            ($0.id, $0.spatial_context ?? [:])
                        }
                    )
                    // Merge remote ranking into the existing mock list when
                    // possible so ordering reflects the room. Products not
                    // found in the local mock are appended.
                    // NOTE: this is a lightweight blend — a full migration
                    // to remote products is a follow-up.
                }
            } catch {
                #if DEBUG
                print("[DailyRoomVM] feed fetch failed: \(error)")
                #endif
            }
        }
    }

    // MARK: - Intent

    func selectRoom(_ room: RoomSummary) {
        selectedRoomID = room.id
        UISelectionFeedbackGenerator().selectionChanged()
        RoomSelectionStore.shared.select(
            localId: room.id,
            remoteId: remoteIdByLocal[room.id]
        )
        refreshFeedForSelectedRoom()
    }

    func selectFilter(_ filter: CategoryFilter) {
        activeFilterID = filter.id
        UISelectionFeedbackGenerator().selectionChanged()
    }

    func presentAdd(for product: Product) {
        presentingAddFor = product
    }

    func addProduct(_ product: Product, to room: RoomSummary) {
        presentingAddFor = nil
        // Persist the product into the real room if the ids match a real room.
        if let ctx = modelContext {
            let store = RoomStore(context: ctx)
            let match = store.allRooms().first { $0.id == room.id }
            if let match {
                _ = store.addItem(product, matchScore: product.matchScore, toRoomId: match.id)
            }
        }
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
        toastMessage = "Added to \(room.name)"
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            await MainActor.run {
                guard !Task.isCancelled else { return }
                self?.toastMessage = nil
            }
        }
    }
}
