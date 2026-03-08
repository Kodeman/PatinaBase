//
//  TableViewModel.swift
//  Patina
//
//  ViewModel for managing the Table - user's furniture collection
//

import SwiftUI
import SwiftData
import Observation

/// ViewModel for the Table feature
@MainActor
@Observable
public final class TableViewModel {

    // MARK: - Properties

    /// Current items on the table
    private(set) var items: [TableItemModel] = []

    /// Currently selected item
    var selectedItem: TableItemModel?

    /// Item being dragged
    var draggingItem: TableItemModel?

    /// Whether the detail sheet is showing
    var isShowingDetail: Bool = false

    /// Whether the add item sheet is showing
    var isShowingAddSheet: Bool = false

    /// Filter by room
    var selectedRoomId: UUID?

    /// Sort order
    var sortOrder: SortOrder = .savedDate

    /// Loading state
    private(set) var isLoading: Bool = false

    /// Error message
    var errorMessage: String?

    /// Model context for SwiftData
    private var modelContext: ModelContext?

    // MARK: - Sort Options

    public enum SortOrder: String, CaseIterable {
        case savedDate = "Date Saved"
        case name = "Name"
        case patina = "Patina Level"
        case price = "Price"
        case interactions = "Most Viewed"

        var icon: String {
            switch self {
            case .savedDate: return "calendar"
            case .name: return "textformat"
            case .patina: return "leaf"
            case .price: return "dollarsign"
            case .interactions: return "eye"
            }
        }
    }

    // MARK: - Initialization

    public init() {}

    /// Configure with model context
    public func configure(with context: ModelContext) {
        self.modelContext = context
        fetchItems()
    }

    // MARK: - CRUD Operations

    /// Fetch all items from storage
    public func fetchItems() {
        guard let context = modelContext else { return }

        isLoading = true

        do {
            var descriptor = FetchDescriptor<TableItemModel>()

            // Apply room filter if set
            if let roomId = selectedRoomId {
                descriptor.predicate = #Predicate { item in
                    item.roomId == roomId
                }
            }

            // Apply sort order
            switch sortOrder {
            case .savedDate:
                descriptor.sortBy = [SortDescriptor(\.savedAt, order: .reverse)]
            case .name:
                descriptor.sortBy = [SortDescriptor(\.name)]
            case .patina:
                descriptor.sortBy = [SortDescriptor(\.savedAt)] // Older = more patina
            case .price:
                descriptor.sortBy = [SortDescriptor(\.priceInCents, order: .reverse)]
            case .interactions:
                descriptor.sortBy = [SortDescriptor(\.viewCount, order: .reverse)]
            }

            items = try context.fetch(descriptor)
        } catch {
            errorMessage = "Failed to fetch items: \(error.localizedDescription)"
        }

        isLoading = false
    }

    /// Add a new item to the table
    public func addItem(
        name: String,
        productId: String? = nil,
        imageURL: String? = nil,
        brandName: String? = nil,
        priceInCents: Int? = nil,
        roomId: UUID? = nil,
        notes: String? = nil
    ) {
        guard let context = modelContext else { return }

        let item = TableItemModel(
            name: name,
            productId: productId,
            imageURL: imageURL,
            notes: notes,
            brandName: brandName,
            priceInCents: priceInCents,
            roomId: roomId ?? selectedRoomId
        )

        // Position randomly on the table
        item.positionX = Float.random(in: 50...300)
        item.positionY = Float.random(in: 100...500)

        context.insert(item)

        do {
            try context.save()
            fetchItems()
            HapticManager.shared.notification(.success)
        } catch {
            errorMessage = "Failed to add item: \(error.localizedDescription)"
            HapticManager.shared.notification(.error)
        }
    }

    /// Remove an item from the table
    public func removeItem(_ item: TableItemModel) {
        guard let context = modelContext else { return }

        context.delete(item)

        do {
            try context.save()

            if selectedItem?.id == item.id {
                selectedItem = nil
                isShowingDetail = false
            }

            fetchItems()
            HapticManager.shared.impact(.medium)
        } catch {
            errorMessage = "Failed to remove item: \(error.localizedDescription)"
            HapticManager.shared.notification(.error)
        }
    }

    /// Update an item's position
    public func updatePosition(for item: TableItemModel, x: Float, y: Float) {
        item.updatePosition(x: x, y: y)
        saveContext()
    }

    /// Update an item's notes
    public func updateNotes(for item: TableItemModel, notes: String) {
        item.notes = notes
        saveContext()
    }

    /// Assign item to a room
    public func assignToRoom(_ item: TableItemModel, roomId: UUID?) {
        item.roomId = roomId
        saveContext()
        fetchItems() // Refresh in case filter is active
    }

    /// Record an interaction with an item
    public func recordInteraction(with item: TableItemModel) {
        item.recordInteraction()
        saveContext()
    }

    // MARK: - Selection

    /// Select an item and show details
    public func selectItem(_ item: TableItemModel) {
        selectedItem = item
        recordInteraction(with: item)
        isShowingDetail = true
        HapticManager.shared.selectionChanged()
    }

    /// Deselect current item
    public func deselectItem() {
        selectedItem = nil
        isShowingDetail = false
    }

    // MARK: - Dragging

    /// Begin dragging an item
    public func beginDrag(_ item: TableItemModel) {
        draggingItem = item
        HapticManager.shared.impact(.light)
    }

    /// Update drag position
    public func updateDrag(to position: CGPoint) {
        guard let item = draggingItem else { return }
        item.position = position
    }

    /// End dragging
    public func endDrag() {
        if let item = draggingItem {
            saveContext()
            HapticManager.shared.impact(.light)
        }
        draggingItem = nil
    }

    // MARK: - Filtering & Sorting

    /// Filter by room
    public func filterByRoom(_ roomId: UUID?) {
        selectedRoomId = roomId
        fetchItems()
    }

    /// Change sort order
    public func setSortOrder(_ order: SortOrder) {
        sortOrder = order
        fetchItems()
        HapticManager.shared.selectionChanged()
    }

    // MARK: - Computed Properties

    /// Items sorted by patina (oldest first)
    var itemsByPatina: [TableItemModel] {
        items.sorted { $0.patinaLevel > $1.patinaLevel }
    }

    /// Items that have developed significant patina
    var agedItems: [TableItemModel] {
        items.filter { $0.patinaLevel >= 0.5 }
    }

    /// Recently added items (last 7 days)
    var recentItems: [TableItemModel] {
        items.filter { $0.daysSinceSaved <= 7 }
    }

    /// Total value of items on table
    var totalValue: Int {
        items.compactMap(\.priceInCents).reduce(0, +)
    }

    /// Formatted total value
    var formattedTotalValue: String {
        let dollars = Double(totalValue) / 100.0
        return String(format: "$%.0f", dollars)
    }

    // MARK: - Private Helpers

    private func saveContext() {
        guard let context = modelContext else { return }

        do {
            try context.save()
        } catch {
            errorMessage = "Failed to save: \(error.localizedDescription)"
        }
    }
}
