//
//  CollectionsViewModel.swift
//  Patina
//
//  Manages collection boards and saved items from SwiftData
//

import SwiftUI
import SwiftData

@Observable
final class CollectionsViewModel {

    // MARK: - State

    var boards: [BoardModel] = []
    var savedItems: [TableItemModel] = []
    var activeTab: String = CollectionsViewModel.allItemsTab
    var isCreatingBoard = false
    var newBoardName = ""

    /// C4-03: the remote reconcile was `(try? …) ?? []` — a failure and an
    /// empty answer were the same value — and the view has one branch for
    /// both. A client whose saved pieces did not load was told "No saved
    /// items yet" about pieces she has.
    private(set) var lastLoadFailed = false

    /// True while the remote reconcile is in flight: the third state, so an
    /// empty local store during a first load is not published as emptiness.
    private(set) var isLoading = false

    /// What the Saved screen should draw. `loaded` carries whatever the local
    /// store holds, empty or not — that IS the answer once a load has landed.
    enum LoadState: Equatable {
        case loading
        case loaded
        case failed
    }

    var loadState: LoadState {
        if isLoading { return .loading }
        return lastLoadFailed ? .failed : .loaded
    }

    static let boardsTab = "Boards"
    static let allItemsTab = "All items"

    let tabs = [CollectionsViewModel.boardsTab, CollectionsViewModel.allItemsTab]

    /// SP-12: Saved opened on `Boards` by default, so the piece the reader had
    /// just saved sat one tab over under `All items` while the screen read
    /// "No boards yet". The default is the tab that holds the pieces whenever
    /// there is no board to show.
    static func defaultTab(boardCount: Int) -> String {
        boardCount == 0 ? allItemsTab : boardsTab
    }

    /// U06: the saved rows a room's own Saved screen shows. A room shows the
    /// pieces put in it and nothing else; with no room in hand the list is the
    /// whole table. Only reachable once a save can carry a room at all —
    /// before W4's fix round nothing ever wrote `roomId`, so this filter was
    /// always empty (`waves/w4/walk.md` item 4).
    static func items(_ items: [TableItemModel], inRoom roomId: UUID?) -> [TableItemModel] {
        guard let roomId else { return items }
        return items.filter { $0.roomId == roomId }
    }

    // MARK: - Loading

    func loadData(context: ModelContext) {
        // Fetch boards
        let boardDescriptor = FetchDescriptor<BoardModel>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        boards = (try? context.fetch(boardDescriptor)) ?? []
        activeTab = Self.defaultTab(boardCount: boards.count)

        // Fetch saved items
        let itemDescriptor = FetchDescriptor<TableItemModel>(sortBy: [SortDescriptor(\.savedAt, order: .reverse)])
        savedItems = (try? context.fetch(itemDescriptor)) ?? []

        // Reconcile with remote `saved_items` in the background — pulls
        // server saves not yet present locally.
        Task { @MainActor in
            await reconcileWithRemote(context: context)
        }
    }

    /// Pull `saved_items` from Supabase for the user's rooms and create
    /// matching SwiftData rows if missing. Safe to call repeatedly — uses
    /// `productId` as the dedupe key.
    @MainActor
    private func reconcileWithRemote(context: ModelContext) async {
        isLoading = true
        defer { isLoading = false }
        do {
            // Build the set of (room_id) values we know about.
            let store = RoomStore(context: context)
            let rooms = store.allRooms()
            let remoteIds = rooms.compactMap { $0.remoteId }
            guard !remoteIds.isEmpty else {
                // No synced room to ask about is not a failure — there is
                // nothing on the server that could be missing here.
                lastLoadFailed = false
                return
            }

            // B §3: the row names the room it was saved into, so the pulled
            // row's `room_id` has to land on the local model. Without this the
            // room half of the line is unreachable for anything the server
            // sent, which on a real account is most of the list.
            let localRoomIdByRemoteId = Dictionary(
                rooms.compactMap { room in room.remoteId.map { ($0, room.id) } },
                uniquingKeysWith: { first, _ in first }
            )

            var pulled: [RemoteSavedItem] = []
            var anyFailed = false
            for remoteId in remoteIds {
                do {
                    pulled.append(contentsOf: try await RoomsAPIClient.shared.listItems(forRoomId: remoteId))
                } catch {
                    // C4-03: one room's saves failing is not "no saved items".
                    anyFailed = true
                    #if DEBUG
                    PatinaLog.ui.error("[Collections] listItems failed for \(remoteId): \(error.localizedDescription)")
                    #endif
                }
            }
            lastLoadFailed = anyFailed

            let knownProductIds = Set(savedItems.compactMap { $0.productId })
            var didInsert = false
            for row in pulled {
                guard !knownProductIds.contains(row.product_id ?? ""),
                      let item = Self.localRow(from: row, roomIdByRemoteId: localRoomIdByRemoteId)
                else { continue }
                context.insert(item)
                didInsert = true
            }
            if didInsert {
                // Refresh local cache to reflect new inserts.
                let itemDescriptor = FetchDescriptor<TableItemModel>(sortBy: [SortDescriptor(\.savedAt, order: .reverse)])
                savedItems = (try? context.fetch(itemDescriptor)) ?? savedItems
            }
        }
    }

    /// One pulled `saved_items` row as the local model. Nil where the row
    /// names no product — there is nothing to show a reader without one.
    ///
    /// Two facts have to survive the crossing, and neither did before W4's
    /// fix round:
    ///
    /// - **the save date.** `saved_items.created_at` is `timestamptz DEFAULT
    ///   NOW()`, so PostgREST sends fractional seconds
    ///   (`2026-06-14T18:22:07.418293+00:00`). A bare `ISO8601DateFormatter`
    ///   rejects those and returns nil, and the `?? Date()` behind it stamped
    ///   every pulled row with the moment of the sync — the row printed
    ///   `Saved Aug 28` for a piece saved in June (C5).
    /// - **the room.** `room_id` is the server's id; the row draws the local
    ///   `RoomModel.name`, which is keyed by the local `UUID`.
    /// - **the note.** `saved_items.notes` reaches the DTO as of W4 lane H1
    ///   (`RemoteSavedItem.notes`); carrying it here is what lets a note
    ///   written on one device draw on another (`waves/w4/h2-notes.md` §3).
    static func localRow(
        from row: RemoteSavedItem,
        roomIdByRemoteId: [String: UUID]
    ) -> TableItemModel? {
        guard let productId = row.product_id else { return nil }
        return TableItemModel(
            name: row.name,
            productId: productId,
            imageURL: row.image_url,
            savedAt: ISO8601DateParsing.dateOrDay(from: row.created_at) ?? Date(),
            notes: row.notes,
            brandName: nil,
            priceInCents: row.price_in_cents,
            roomId: row.room_id.flatMap { roomIdByRemoteId[$0] }
        )
    }

    // MARK: - Board Management

    func createBoard(context: ModelContext) {
        guard !newBoardName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let board = BoardModel(name: newBoardName.trimmingCharacters(in: .whitespaces))
        context.insert(board)
        boards.insert(board, at: 0)
        newBoardName = ""
        isCreatingBoard = false
        HapticManager.shared.notification(.success)
    }

    func deleteBoard(_ board: BoardModel, context: ModelContext) {
        context.delete(board)
        boards.removeAll { $0.id == board.id }
    }

    /// SP-12: this is the call that was never made from anywhere, which is
    /// why a board could never fill. `CollectionsView`'s saved-row menu is now
    /// its caller.
    func addToBoard(_ board: BoardModel, productId: String) {
        board.addItem(productId)
        HapticManager.shared.impact(.light)
    }

    // MARK: - Saved Items

    /// R26: remove a saved item from the local store (the source the
    /// "All Items" tab reads). Backs the row's context-menu Remove action.
    ///
    /// Through `SavedRemoval` so the room's own copy and the account's mirror
    /// go with the row. Deleting the `TableItemModel` alone left the room the
    /// piece was added to still counting it (fix2-review MAJ-2).
    func removeSavedItem(_ item: TableItemModel, context: ModelContext) {
        if let productId = item.productId {
            SavedRemoval.remove(productId: productId, context: context)
        } else {
            context.delete(item)
        }
        savedItems.removeAll { $0.id == item.id }
        HapticManager.shared.impact(.light)
    }

    /// W4 (B §3): the reader's own sentence about a piece. Written locally
    /// first — that is where they typed it and where it must survive a failed
    /// network — then mirrored onto `saved_items.notes`.
    func setNote(_ note: String?, on item: TableItemModel, context: ModelContext) {
        item.notes = note
        try? context.save()
        if let index = savedItems.firstIndex(where: { $0.id == item.id }) {
            savedItems[index] = item
        }
        guard let productId = item.productId else { return }
        Task { await SavedItemNoteMirror.mirror(note: note, productId: productId) }
    }

    /// R26: pull-to-refresh — re-fetch the local store and await the remote
    /// `saved_items` reconciliation instead of firing it in the background.
    @MainActor
    func refresh(context: ModelContext) async {
        let boardDescriptor = FetchDescriptor<BoardModel>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        boards = (try? context.fetch(boardDescriptor)) ?? boards

        let itemDescriptor = FetchDescriptor<TableItemModel>(sortBy: [SortDescriptor(\.savedAt, order: .reverse)])
        savedItems = (try? context.fetch(itemDescriptor)) ?? savedItems

        await reconcileWithRemote(context: context)
    }
}
