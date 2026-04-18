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

    let tabs = ["Boards", "All Items"]

    // MARK: - Loading

    func loadData(context: ModelContext) {
        // Fetch boards
        let boardDescriptor = FetchDescriptor<BoardModel>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        boards = (try? context.fetch(boardDescriptor)) ?? []

        // Fetch saved items
        let itemDescriptor = FetchDescriptor<TableItemModel>(sortBy: [SortDescriptor(\.savedAt, order: .reverse)])
        savedItems = (try? context.fetch(itemDescriptor)) ?? []
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
}
