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
    private var storyTask: Task<Void, Never>?

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
        todayStory = nil
        refreshTodaysStory()
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
        // No mock seed — recommendations are populated exclusively from the
        // backend in refreshFeedForSelectedRoom().
        allRecommendations = []
        refreshFeedForSelectedRoom()
    }

    /// Fetch today's editorial story from `editorial_stories` and bind to
    /// `todayStory`. Silent fail — the home screen renders without the
    /// story card when the request fails.
    func refreshTodaysStory() {
        storyTask?.cancel()
        storyTask = Task { [weak self] in
            do {
                let remote = try await EditorialStoriesAPIClient.shared.fetchTodaysStory()
                await MainActor.run {
                    guard let self else { return }
                    self.todayStory = remote.map { DailyStory(from: $0) }
                }
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[DailyRoomVM] story fetch failed: \(error)")
                #endif
            }
        }
    }

    /// Fetch the room-aware feed for the currently selected room. The
    /// remote response is the sole source of recommendations — there is
    /// no local mock fallback in production.
    func refreshFeedForSelectedRoom() {
        guard let localId = selectedRoomID,
              let remoteId = remoteIdByLocal[localId] else {
            spatialContext = [:]
            allRecommendations = []
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
                    self.allRecommendations = response.products.map { fp in
                        DailyRoomViewModel.recommendation(from: fp)
                    }
                }
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[DailyRoomVM] feed fetch failed: \(error)")
                #endif
                await MainActor.run { [weak self] in
                    self?.allRecommendations = []
                }
            }
        }
    }

    /// Convert a remote `FeedProduct` into the UI's `DailyRecommendation`.
    /// `whyCopy` is sourced from `spatial_context["why"]` when available;
    /// the spatial-context dictionary is also wired into `spatialContext`
    /// so `DailyProductCard` can render "why it fits" text. Maker name,
    /// product tier, and badges come from the server-side join + tier
    /// derivation in `/api/feed/:roomId`.
    private static func recommendation(from fp: FeedProduct) -> DailyRecommendation {
        let priceCents = Int((fp.price_retail ?? 0).rounded())
        let productTier = ProductTier(rawValue: fp.tier ?? "") ?? .styleMatch
        let product = Product(
            id: fp.id,
            name: fp.name,
            priceCents: priceCents,
            matchScore: 80,
            makerName: fp.maker_name ?? "Unknown Maker",
            makerLocation: nil,
            makerStory: nil,
            imageURL: fp.images?.first,
            usdzURL: nil,
            styleTags: [],
            materialTags: [],
            badges: fp.badges ?? [],
            category: .decor,
            tier: productTier
        )
        let why = fp.spatial_context?["why"] ?? ""
        return DailyRecommendation(
            id: fp.id,
            product: product,
            matchScore: 80,
            tier: Self.dailyTier(from: fp.tier),
            whyCopy: why,
            insight: nil,
            pairing: nil
        )
    }

    /// Map the server-derived tier string onto the home card's tier enum.
    /// Server emits `designer_selection`, `style_match`, `new_arrival`
    /// (see `get_recommendations` RPC in migration 00067). The Daily Room
    /// card surfaces only `designerSelection` and `standard` today; new
    /// arrivals and plain style matches both fall under `standard`.
    private static func dailyTier(from raw: String?) -> DailyRecommendation.Tier {
        switch raw {
        case "designer_selection": return .designerSelection
        default: return .standard
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
