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
    var activeTab: String = "Boards"
    var isCreatingBoard = false
    var newBoardName = ""

    let tabs = ["Boards", "All items"]

    // MARK: - Loading

    func loadData(context: ModelContext) {
        // Fetch boards
        let boardDescriptor = FetchDescriptor<BoardModel>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        boards = (try? context.fetch(boardDescriptor)) ?? []

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
        do {
            // Build the set of (room_id) values we know about.
            let store = RoomStore(context: context)
            let rooms = store.allRooms()
            let remoteIds = rooms.compactMap { $0.remoteId }
            guard !remoteIds.isEmpty else { return }

            var pulled: [RemoteSavedItem] = []
            for remoteId in remoteIds {
                let rows = (try? await RoomsAPIClient.shared.listItems(forRoomId: remoteId)) ?? []
                pulled.append(contentsOf: rows)
            }

            let knownProductIds = Set(savedItems.compactMap { $0.productId })
            var didInsert = false
            for row in pulled {
                guard let productId = row.product_id else { continue }
                if knownProductIds.contains(productId) { continue }
                let item = TableItemModel(
                    name: row.name,
                    productId: productId,
                    imageURL: row.image_url,
                    savedAt: ISO8601DateFormatter().date(from: row.created_at) ?? Date(),
                    brandName: nil,
                    priceInCents: row.price_in_cents
                )
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

    func addToBoard(_ board: BoardModel, productId: String) {
        board.addItem(productId)
        HapticManager.shared.impact(.light)
    }

    // MARK: - Saved Items

    /// R26: remove a saved item from the local store (the source the
    /// "All Items" tab reads). Backs the row's context-menu Remove action.
    func removeSavedItem(_ item: TableItemModel, context: ModelContext) {
        context.delete(item)
        savedItems.removeAll { $0.id == item.id }
        HapticManager.shared.impact(.light)
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
