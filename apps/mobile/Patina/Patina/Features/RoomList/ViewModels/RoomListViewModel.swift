//
//  RoomListViewModel.swift
//  Patina
//
//  ViewModel for the Room List - the returning user's landing screen
//

import SwiftUI
import SwiftData

/// ViewModel for the Room List screen
@Observable
public final class RoomListViewModel {

    // MARK: - State

    /// All rooms
    public var rooms: [RoomModel] = []

    /// Selected room for detail view
    public var selectedRoom: RoomModel?

    /// Loading state
    public var isLoading = false

    /// Error message
    public var errorMessage: String?

    // MARK: - Computed Properties

    /// Number of scanned rooms
    public var scannedRoomCount: Int {
        rooms.filter { $0.hasBeenScanned }.count
    }

    /// Rooms sorted by most recent
    public var sortedRooms: [RoomModel] {
        rooms.sorted { $0.updatedAt > $1.updatedAt }
    }

    /// Recently updated rooms (last 7 days)
    public var recentRooms: [RoomModel] {
        let weekAgo = Calendar.current.date(byAdding: .day, value: -7, to: Date())!
        return rooms.filter { $0.updatedAt > weekAgo }
    }

    // MARK: - Initialization

    public init() {}

    // MARK: - Data Loading

    /// Fetch rooms from SwiftData
    @MainActor
    public func fetchRooms(modelContext: ModelContext) {
        isLoading = true
        errorMessage = nil

        do {
            let descriptor = FetchDescriptor<RoomModel>(
                sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
            )
            rooms = try modelContext.fetch(descriptor)
            isLoading = false
        } catch {
            errorMessage = "Failed to load rooms: \(error.localizedDescription)"
            isLoading = false
        }
    }

    // MARK: - Room Management

    /// Add a new room
    @MainActor
    public func addRoom(name: String, roomType: String, modelContext: ModelContext) {
        let room = RoomModel(name: name, roomType: roomType)
        modelContext.insert(room)

        do {
            try modelContext.save()
            rooms.append(room)
        } catch {
            errorMessage = "Failed to save room: \(error.localizedDescription)"
        }
    }

    /// Delete a room
    @MainActor
    public func deleteRoom(_ room: RoomModel, modelContext: ModelContext) {
        modelContext.delete(room)

        do {
            try modelContext.save()
            rooms.removeAll { $0.id == room.id }
        } catch {
            errorMessage = "Failed to delete room: \(error.localizedDescription)"
        }
    }

    /// Update room name
    @MainActor
    public func updateRoomName(_ room: RoomModel, name: String, modelContext: ModelContext) {
        room.name = name
        room.updatedAt = Date()

        do {
            try modelContext.save()
        } catch {
            errorMessage = "Failed to update room: \(error.localizedDescription)"
        }
    }

    // MARK: - Room Type Helpers

    /// Get icon for room type
    public func icon(for roomType: String) -> String {
        switch roomType.lowercased() {
        case "livingroom", "living room", "living":
            return "sofa"
        case "bedroom":
            return "bed.double"
        case "kitchen":
            return "fork.knife"
        case "diningroom", "dining room", "dining":
            return "chair"
        case "office", "study":
            return "desktopcomputer"
        case "bathroom":
            return "shower"
        case "entryway", "entry", "foyer":
            return "door.left.hand.open"
        default:
            return "square.grid.2x2"
        }
    }

    /// Get display name for room type
    public func displayName(for roomType: String) -> String {
        switch roomType.lowercased() {
        case "livingroom":
            return "Living Room"
        case "diningroom":
            return "Dining Room"
        default:
            return roomType.capitalized
        }
    }
}

// MARK: - Mock Data

extension RoomListViewModel {

    /// Create with mock data for previews
    public static var mock: RoomListViewModel {
        let vm = RoomListViewModel()
        // In a real app, we'd populate with mock rooms
        return vm
    }

    /// Sample room types
    public static let roomTypes = [
        "Living Room",
        "Bedroom",
        "Dining Room",
        "Kitchen",
        "Office",
        "Bathroom",
        "Entryway",
        "Other"
    ]
}
