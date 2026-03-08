//
//  HeroFrameViewModel.swift
//  Patina
//
//  ViewModel for the Hero Frame home screen
//

import Foundation
import SwiftData
import Combine
import os.log

/// ViewModel managing the Hero Frame home screen state
@Observable
@MainActor
public final class HeroFrameViewModel {

    // MARK: - Published State

    /// All rooms for the current user
    public var rooms: [RoomModel] = []

    /// Current room index in the carousel
    public var currentRoomIndex: Int = 0

    /// Current time of day
    public var timeOfDay: TimeOfDay = .current

    /// Whether data is loading
    public var isLoading: Bool = false

    // MARK: - Computed Properties

    /// The currently displayed room
    public var currentRoom: RoomModel? {
        guard currentRoomIndex >= 0, currentRoomIndex < rooms.count else {
            return nil
        }
        return rooms[currentRoomIndex]
    }

    /// Whether there are multiple rooms to navigate
    public var hasMultipleRooms: Bool {
        rooms.count > 1
    }

    /// Total room count
    public var roomCount: Int {
        rooms.count
    }

    /// Whether any room has an active emergence
    public var hasAnyEmergence: Bool {
        rooms.contains { $0.hasActiveEmergence }
    }

    // MARK: - Private Properties

    private var modelContext: ModelContext?
    private var timeUpdateTimer: Timer?
    private let logger = Logger(subsystem: "com.patina.app", category: "HeroFrame")

    // MARK: - Initialization

    public init() {}

    // MARK: - Setup

    /// Configure with model context for data access
    public func configure(with modelContext: ModelContext) {
        self.modelContext = modelContext
        loadRooms()
        startTimeMonitor()
    }

    // MARK: - Data Loading

    /// Load all rooms from local storage
    public func loadRooms() {
        guard let context = modelContext else {
            logger.warning("No model context available")
            return
        }

        isLoading = true

        do {
            var descriptor = FetchDescriptor<RoomModel>()
            // Fetch all rooms, sort in memory for complex sorting
            var fetchedRooms = try context.fetch(descriptor)

            // Sort rooms: emergence first, then by most recent scan
            fetchedRooms.sort { lhs, rhs in
                if lhs.hasActiveEmergence != rhs.hasActiveEmergence {
                    return lhs.hasActiveEmergence && !rhs.hasActiveEmergence
                }
                return lhs.updatedAt > rhs.updatedAt
            }

            rooms = fetchedRooms
            logger.info("Loaded \(self.rooms.count) rooms")

            // Reset index if out of bounds
            if currentRoomIndex >= rooms.count {
                currentRoomIndex = max(0, rooms.count - 1)
            }

        } catch {
            logger.error("Failed to load rooms: \(error.localizedDescription)")
            rooms = []
        }

        isLoading = false
    }

    /// Refresh emergence state for all rooms
    public func refreshEmergenceState() {
        // In a real implementation, this would check with the backend
        // for new emergence notifications
        logger.debug("Refreshing emergence state")
    }

    // MARK: - Navigation

    /// Navigate to a specific room by index
    public func navigateToRoom(at index: Int) {
        guard index >= 0, index < rooms.count else { return }
        currentRoomIndex = index
    }

    /// Navigate to the next room
    public func nextRoom() {
        guard hasMultipleRooms else { return }
        currentRoomIndex = (currentRoomIndex + 1) % rooms.count
    }

    /// Navigate to the previous room
    public func previousRoom() {
        guard hasMultipleRooms else { return }
        currentRoomIndex = (currentRoomIndex - 1 + rooms.count) % rooms.count
    }

    /// Swipe handler - positive delta = swipe left (next), negative = swipe right (previous)
    public func handleSwipe(delta: CGFloat) {
        if delta > 50 {
            nextRoom()
        } else if delta < -50 {
            previousRoom()
        }
    }

    // MARK: - Navigation Intents

    /// Intent for tapping the photo
    public func photoTapIntent() -> HeroFrameIntent {
        guard let room = currentRoom else {
            return .showRoomList
        }
        return .showRoomDetail(roomId: room.id)
    }

    /// Intent for tapping the emergence card
    public func emergenceTapIntent() -> HeroFrameIntent {
        guard let room = currentRoom else {
            return .showEmergence(roomId: nil)
        }
        return .showEmergence(roomId: room.id)
    }

    /// Intent for tapping the stats badge
    public func statsTapIntent() -> HeroFrameIntent {
        guard let room = currentRoom else {
            return .showTable
        }
        return .showRoomSavedItems(roomId: room.id)
    }

    /// Intent for long-pressing the photo (room options)
    public func photoLongPressIntent() -> HeroFrameIntent {
        guard let room = currentRoom else {
            return .showRoomList
        }
        return .showRoomOptions(roomId: room.id)
    }

    /// Intent for tapping placeholder (no hero frame)
    public func placeholderTapIntent() -> HeroFrameIntent {
        guard let room = currentRoom else {
            return .startWalk
        }
        return .rescanRoom(roomId: room.id)
    }

    // MARK: - Time Monitoring

    /// Start monitoring time changes
    public func startTimeMonitor() {
        stopTimeMonitor()

        // Update immediately
        timeOfDay = .current

        // Check every minute for time changes
        timeUpdateTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateTimeOfDay()
            }
        }
    }

    /// Stop time monitoring
    public func stopTimeMonitor() {
        timeUpdateTimer?.invalidate()
        timeUpdateTimer = nil
    }

    private func updateTimeOfDay() {
        let newTime = TimeOfDay.current
        if newTime != timeOfDay {
            logger.debug("Time changed from \(self.timeOfDay.rawValue) to \(newTime.rawValue)")
            timeOfDay = newTime
        }
    }

}

// MARK: - Hero Frame Intent

/// Intent representing a navigation action from the Hero Frame
public enum HeroFrameIntent: Equatable {
    case showRoomList
    case showRoomDetail(roomId: UUID)
    case showEmergence(roomId: UUID?)
    case showRoomSavedItems(roomId: UUID)
    case showRoomOptions(roomId: UUID)
    case showTable
    case startWalk
    case rescanRoom(roomId: UUID)
    case expandCompanion

    /// Convert to AppRoute for navigation
    public func toAppRoute() -> AppRoute? {
        switch self {
        case .showRoomList:
            return .roomList
        case .showRoomDetail(let roomId):
            return .roomDetail(roomId: roomId)
        case .showEmergence(let roomId):
            if let roomId = roomId {
                return .roomEmergence(roomId: roomId)
            }
            return .emergence(pieceId: nil)
        case .showRoomSavedItems(let roomId):
            return .roomSavedItems(roomId: roomId)
        case .showRoomOptions(let roomId):
            return .roomOptions(roomId: roomId)
        case .showTable:
            return .table
        case .startWalk:
            return .walk
        case .rescanRoom(let roomId):
            return .rescan(roomId: roomId)
        case .expandCompanion:
            return nil // Handled separately
        }
    }
}
