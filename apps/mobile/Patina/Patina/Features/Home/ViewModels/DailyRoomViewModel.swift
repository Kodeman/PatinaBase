//
//  DailyRoomViewModel.swift
//  Patina
//
//  ViewModel powering The Daily Room — editorial story + room-contextual feed.
//

import SwiftUI
import SwiftData

@MainActor
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
    /// The real SwiftData rows behind `rooms`, retained so Today can show one
    /// active room with its actual image, timestamps, and saved-item history.
    var roomModels: [RoomModel] = []
    var selectedRoomID: RoomSummary.ID?
    var categoryFilters: [CategoryFilter] = DailyRoomViewModel.defaultFilters
    var activeFilterID: String = "all"
    var allRecommendations: [DailyRecommendation] = []
    var presentingAddFor: Product?
    var toastMessage: String?

    /// The room the toast's message refers to, so its "View" action can open
    /// that exact room instead of doing nothing (U05).
    private(set) var toastRoomID: RoomSummary.ID?

    /// Whether the user has any persisted style profile (quiz / teaching
    /// output). Drives the empty-rail editorial module on the home screen:
    /// no profile → quiz prompt, profile present → scan/browse prompt.
    var hasStyleProfile: Bool = false
    var tastePortrait: TastePortrait?

    /// True while the room-aware feed request is in flight. The home view
    /// uses this to avoid flashing the empty-rail editorial module before
    /// the first response lands.
    var isFeedLoading: Bool = false

    /// Set when the feed request fails. A failed fetch used to be
    /// indistinguishable from "this room has no picks"; the home now renders
    /// this as a retry instead of an empty rail (U29).
    var feedError: String?

    /// Set when today's editorial story fails to load, so the story slot can
    /// offer a retry instead of silently collapsing (U29).
    var storyLoadFailed: Bool = false

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

    var activeRoomModel: RoomModel? {
        guard let selectedRoomID else { return roomModels.first }
        return roomModels.first(where: { $0.id == selectedRoomID }) ?? roomModels.first
    }

    var activeRoomCandidate: ContextRoomCandidate? {
        activeRoomModel.map {
            ContextRoomCandidate(
                id: $0.id,
                name: $0.name,
                updatedAt: $0.updatedAt,
                itemCount: $0.items.count,
                hasBeenScanned: $0.hasBeenScanned
            )
        }
    }

    var recentSavedItem: SavedItem? {
        activeRoomModel?.items.max(by: { $0.addedAt < $1.addedAt })
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

    /// Display label of the active category filter — names the filter in the
    /// filtered-empty copy ("Nothing in Seating for this room yet.").
    var activeFilterLabel: String {
        categoryFilters.first(where: { $0.id == activeFilterID })?.label ?? "this filter"
    }

    // MARK: - Lifecycle

    func load() {
        todayStory = nil
        refreshTodaysStory()
        if let ctx = modelContext {
            let preference = StylePreferenceStore(context: ctx).mostRecent()
            hasStyleProfile = preference != nil
            tastePortrait = preference.flatMap { TastePortrait(preference: $0) }
            let store = RoomStore(context: ctx)
            let realRooms = store.allRooms()
            // R31: never seed mock rooms — a brand-new user has 0 rooms and
            // home must agree with Profile about that. The empty state is an
            // invitation to scan, not a fake life.
            roomModels = realRooms
            rooms = realRooms.map { RoomSummary(from: $0) }
            remoteIdByLocal = Dictionary(
                uniqueKeysWithValues: realRooms.compactMap { room in
                    room.remoteId.map { (room.id, $0) }
                }
            )
        } else {
            rooms = []
            roomModels = []
            remoteIdByLocal = [:]
            hasStyleProfile = false
            tastePortrait = nil
        }

        let candidates = roomModels.map {
            ContextRoomCandidate(
                id: $0.id,
                name: $0.name,
                updatedAt: $0.updatedAt,
                itemCount: $0.items.count,
                hasBeenScanned: $0.hasBeenScanned
            )
        }
        let active = ContextMemoryStore.shared.activeRoom(
            from: candidates,
            currentSelectionID: RoomSelectionStore.shared.selectedLocalId
        )
        selectedRoomID = active?.id
        if let active {
            RoomSelectionStore.shared.select(
                localId: active.id,
                remoteId: remoteIdByLocal[active.id]
            )
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
                // SP-18: pick the highest-`sort_order` story the reader has not
                // opened, falling back to the newest — a `limit=1` fetch could
                // only ever return the same row, which is why the same card
                // appeared on every home, in dark mode, and after every
                // relaunch. The unread dot comes off the same record.
                let candidates = try await EditorialStoriesAPIClient.shared.fetchCandidates()
                // `Task` inherits the enclosing `@MainActor` isolation, so the
                // continuation already resumes on the main actor — no explicit
                // `MainActor.run` bounce needed (PT-3-4).
                guard let self else { return }
                let reads = StoryReadStore()
                let pickedId = reads.nextStoryId(from: candidates.map(\.id))
                let remote = candidates.first { $0.id == pickedId }
                self.todayStory = remote.map {
                    DailyStory(from: $0, isUnread: reads.isUnread(storyId: $0.id))
                }
                self.storyLoadFailed = false
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[DailyRoomVM] story fetch failed: \(error)")
                #endif
                guard !Task.isCancelled else { return }
                self?.storyLoadFailed = true
            }
        }
    }

    /// Fetch the room-aware feed for the currently selected room from the
    /// `get_recommendations` RPC — the same source the Recommendations
    /// surface reads, so match scores and categories on the home are the
    /// real per-product values rather than a constant (U02/U03). The remote
    /// response is the sole source of recommendations; there is no local
    /// mock fallback in production.
    func refreshFeedForSelectedRoom() {
        guard let localId = selectedRoomID,
              let remoteId = remoteIdByLocal[localId] else {
            spatialContext = [:]
            allRecommendations = []
            isFeedLoading = false
            feedError = nil
            return
        }
        feedTask?.cancel()
        isFeedLoading = true
        feedError = nil
        feedTask = Task { [weak self] in
            do {
                let response = try await ProductAPIClient.shared
                    .fetchRecommendations(roomId: remoteId)
                // Inherits `@MainActor` isolation (PT-3-4) — no bounce needed.
                guard let self else { return }
                // The RPC carries no per-product spatial copy; the "why it
                // fits" line stays empty until a room-aware source returns.
                self.spatialContext = [:]
                self.allRecommendations = response.items.map {
                    DailyRoomViewModel.recommendation(from: $0)
                }
                self.isFeedLoading = false
                self.feedError = nil
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[DailyRoomVM] feed fetch failed: \(error)")
                #endif
                // A cancelled task means a newer refresh superseded this one —
                // leave state alone so the in-flight request owns it.
                guard !Task.isCancelled else { return }
                self?.allRecommendations = []
                self?.isFeedLoading = false
                self?.feedError = "We couldn't load picks for this room."
            }
        }
    }

    /// Convert a catalog `Product` into the UI's `DailyRecommendation`.
    ///
    /// Both the card's match pill and its category filter read straight off
    /// the product, so a piece the RPC scored 87 reads 87 and a chair filters
    /// under Seating. The home card surfaces only `designerSelection` and
    /// `standard`; `style_match` and `new_arrival` both land on `standard`.
    static func recommendation(from product: Product) -> DailyRecommendation {
        DailyRecommendation(
            id: product.id,
            product: product,
            matchScore: product.matchScore,
            tier: product.tier == .designerSelection ? .designerSelection : .standard,
            whyCopy: "",
            insight: nil,
            pairing: nil
        )
    }

    // MARK: - Intent

    func selectRoom(_ room: RoomSummary) {
        selectedRoomID = room.id
        UISelectionFeedbackGenerator().selectionChanged()
        RoomSelectionStore.shared.select(
            localId: room.id,
            remoteId: remoteIdByLocal[room.id]
        )
        ContextMemoryStore.shared.rememberRoom(id: room.id)
        refreshFeedForSelectedRoom()
    }

    /// Privacy-filtered prompt input for the Companion foundation. Visible
    /// names are rehydrated from live models and never written to the recency
    /// store; user-authored room notes and messages are deliberately absent.
    func companionMemoryContext(projectAttentionSummary: String?) -> CompanionMemoryContext {
        let memory = ContextMemoryStore.shared
        guard memory.isEnabled else {
            return CompanionMemoryContext(isPersonalizationEnabled: false)
        }
        let latest = ContextActivityKind.allCases
            .compactMap { memory.latestActivity(of: $0) }
            .max(by: { $0.occurredAt < $1.occurredAt })

        return CompanionMemoryContext(
            isPersonalizationEnabled: true,
            activeRoomName: activeRoomModel?.name,
            tasteSummary: tastePortrait?.summary,
            preferredMaterials: tastePortrait?.materials ?? [],
            recentSavedItemName: recentSavedItem?.productName,
            projectAttentionSummary: projectAttentionSummary,
            latestActivity: latest?.kind
        )
    }

    func selectFilter(_ filter: CategoryFilter) {
        activeFilterID = filter.id
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// Clear the category filter — the escape hatch offered by the
    /// filtered-empty state so a filter with no matches isn't a dead end.
    func showAllCategories() {
        guard let all = categoryFilters.first(where: { $0.id == "all" }) else {
            activeFilterID = "all"
            return
        }
        selectFilter(all)
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
        toastRoomID = room.id
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            // Inherits `@MainActor` isolation (PT-3-4) — no bounce needed.
            guard !Task.isCancelled else { return }
            self?.toastMessage = nil
            self?.toastRoomID = nil
        }
    }
}
