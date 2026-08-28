//
//  DailyRoomViewModel.swift
//  Patina
//
//  ViewModel powering The Daily Room — editorial story + room-contextual feed.
//
// swiftlint:disable file_length

import SwiftUI
import SwiftData

@MainActor
@Observable
final class DailyRoomViewModel { // swiftlint:disable:this type_body_length

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
    /// The row behind `todayStory`. The Record is built over the row, not the
    /// UI model, because it needs the real `published_at`.
    var todayStoryRow: RemoteEditorialStory?

    /// The story's own publish date, for the card's chip. The raw row is
    /// already retained for the record's MOVED row, so no model change is
    /// needed to print the date the mock draws.
    var todayStoryPublishedAt: Date? {
        todayStoryRow?.publishedAt.flatMap(ISO8601DateParsing.dateOrDay(from:))
    }

    /// The Record — what moved on the house while the person was away, and
    /// what is waiting on them. Painted from the snapshot first, then rebuilt.
    var record: HouseRecord = .empty
    /// The saved pieces, retained: the record composes its withdrawn and
    /// repriced rows over them.
    var savedItems: [TableItemModel] = []

    /// The rows NEW THIS WEEK may draw — already filtered to the seven-day
    /// window and already emptied when the supply floor is not met, so the
    /// view has no way to pad it.
    var newThisWeek: [Product] = []

    /// The designer's rooms on the client's projects — read-only cards on the
    /// house rail. Empty for anyone with no project, and after a failed read:
    /// the rail then draws the rooms the person made, and nothing invented.
    var projectRooms: [RemoteProjectRoom] = []

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
        // The last record, instantly, before a single fetch is in flight —
        // a cold launch must not open on a blank card (M1's "States" row).
        paintRecordSnapshot()
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
                self.todayStoryRow = remote
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

    // MARK: - The Record

    /// What we already knew, painted before anything is fetched. A guest has
    /// no house on file, so nothing of a previous session is put on screen —
    /// and neither does a record belonging to a DIFFERENT account, which the
    /// App Group container would otherwise hand straight to the next person to
    /// sign in on this device (`RecordIdentity`).
    func paintRecordSnapshot() {
        guard AuthService.shared.isAuthenticated else {
            record = .empty
            return
        }
        guard RecordIdentity.admits(session: AuthService.shared.currentUserId) else {
            record = .empty
            return
        }
        if let snapshot = RecordSnapshotStore.shared.load() {
            record = snapshot
        }
    }

    /// Rebuild the record for this open: snapshot first, then the build, then
    /// the save, and only then the visit stamp (`RecordRefresh` owns that
    /// order; r1-notes §3).
    ///
    /// Call it AFTER `BadgeCountService.refresh()` and
    /// `DesignRequestStatusService.refresh()` — the builder is pure and reads
    /// whatever those two are holding.
    func refreshRecord() async {
        guard AuthService.shared.isAuthenticated else {
            record = .empty
            return
        }
        // The story is one of the record's MOVED rows, so wait for the fetch
        // that is already in flight rather than building without it and
        // showing the row one open late.
        await storyTask?.value
        savedItems = fetchSavedItems()
        let products = await fetchSavedPieceProducts(for: savedItems)
        let saved = savedItems
        let story = todayStoryRow

        RecordRefresh.run(
            sessionUserId: AuthService.shared.currentUserId,
            build: { previous, lastSeenAt in
                HouseRecordBuilder.build(
                    from: BadgeCountService.shared,
                    saved: saved,
                    products: products,
                    story: story,
                    liveLead: DesignRequestStatusService.shared.liveLead,
                    lastSeen: lastSeenAt,
                    now: Date(),
                    previous: previous
                )
            },
            paint: { [weak self] painted in self?.record = painted }
        )
    }

    /// The catalogue's genuinely new rows. A guest sees this block too, so the
    /// read is not gated on a session; a failure simply leaves the block dark.
    func refreshNewThisWeek() async {
        do {
            let response = try await ProductAPIClient.shared.fetchRecommendations(limit: 24)
            newThisWeek = NewThisWeek.rows(from: response.items)
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[DailyRoomVM] new-this-week fetch failed: \(error)")
            #endif
            newThisWeek = []
        }
    }

    /// The client's project rooms. RLS has allowed this read since 00066; the
    /// app simply never made it (`waves/w2/steward.md` §5).
    func refreshProjectRooms() async {
        guard AuthService.shared.isAuthenticated else {
            projectRooms = []
            return
        }
        let ids = BadgeCountService.shared.projects.map(\.id)
        guard !ids.isEmpty else {
            projectRooms = []
            return
        }
        do {
            projectRooms = try await ProjectsAPIClient.shared.listProjectRooms(projectIds: ids)
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[DailyRoomVM] project rooms failed: \(error)")
            #endif
            // Keep only what still belongs to a project THIS account has. A
            // flaky read must not empty a real house, and it must not leave
            // another account's — or an ended project's — rooms on the rail.
            projectRooms = projectRooms.filter { ids.contains($0.project_id) }
        }
    }

    /// Every room the house holds — the designer's and the person's. The house
    /// rail draws when this is non-zero, which is why an activeProject client
    /// whose rooms all live on the project never sees the empty state.
    var houseRoomCards: [HouseRoomCard] {
        HouseRoomCard.cards(projectRooms: projectRooms, localRooms: roomModels)
    }

    private func fetchSavedItems() -> [TableItemModel] {
        guard let ctx = modelContext else { return [] }
        let descriptor = FetchDescriptor<TableItemModel>(
            sortBy: [SortDescriptor(\.savedAt, order: .reverse)]
        )
        return (try? ctx.fetch(descriptor)) ?? []
    }

    /// The saved pieces' catalogue rows, **withdrawn ones included** — the
    /// only read that can feed the record's "no longer available" row, because
    /// `get_recommendations` filters a withdrawn product out by construction
    /// (r1-notes §1). A failure here costs the two discovering rows and
    /// nothing else: they draw nothing rather than a guess (C5).
    private func fetchSavedPieceProducts(for saved: [TableItemModel]) async -> [Product] {
        let ids = Array(Set(saved.compactMap(\.productId)))
        guard !ids.isEmpty else { return [] }
        // Chunked: every id goes into one `id=in.(…)` query string, and a few
        // hundred saved pieces would push the URL past what PostgREST and the
        // edge in front of it will accept — costing both discovering rows.
        var products: [Product] = []
        for chunk in stride(from: 0, to: ids.count, by: Self.productIdsPerRead) {
            let slice = Array(ids[chunk..<min(chunk + Self.productIdsPerRead, ids.count)])
            do {
                products += try await ProductAPIClient.shared.fetchProducts(ids: slice)
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[DailyRoomVM] saved-piece products failed: \(error)")
                #endif
                return []
            }
        }
        return products
    }

    /// Ids per `id=in.(…)` read. A uuid plus its separator is ~37 characters,
    /// so 100 keeps the query string well inside every hop's limit.
    private static let productIdsPerRead = 100

    /// True while the Message tap is opening (or finding) the thread.
    var isOpeningDesignerThread: Bool = false

    /// SP-13's thread creation, from the seat: the project thread where a
    /// project exists, the direct thread where it does not. Returns the thread
    /// id, or nil when there is nothing to open — the caller navigates only on
    /// a real id, so a failure leaves the person where they were.
    func openDesignerThread(_ seat: DesignerSeat) async -> String? {
        isOpeningDesignerThread = true
        defer { isOpeningDesignerThread = false }
        do {
            if let projectId = seat.projectId {
                return try await MessagingAPIClient.shared.createThread(projectId: projectId)
            }
            if let designerId = seat.designerId {
                return try await MessagingAPIClient.shared.createDirectThread(counterpart: designerId)
            }
            return nil
        } catch {
            PatinaLog.ui.error("[DailyRoomVM] opening the designer thread failed: \(error.localizedDescription)")
            return nil
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
