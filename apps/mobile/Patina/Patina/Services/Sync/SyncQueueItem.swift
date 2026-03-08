//
//  SyncQueueItem.swift
//  Patina
//
//  SwiftData model for persistent sync queue.
//  Stores pending uploads that survive app restarts.
//

import SwiftData
import Foundation

/// Status of a sync queue item
public enum SyncQueueStatus: String, Codable, Sendable {
    case pending = "pending"     // Waiting to be processed
    case syncing = "syncing"     // Currently uploading
    case synced = "synced"       // Successfully synced
    case failed = "failed"       // Failed after retries
}

/// Type of sync operation
public enum SyncOperationType: String, Codable, Sendable {
    case roomScan = "room_scan"           // Full room scan upload
    case styleSignals = "style_signals"   // Style signals update
    case room = "room"                    // Room metadata update
    case roomFeatures = "room_features"   // Room features upload
}

/// Persistent queue item for room scan uploads
@Model
public final class SyncQueueItem {

    // MARK: - Identification

    /// Unique identifier for this queue item
    @Attribute(.unique) public var id: UUID

    /// Type of sync operation
    public var operationTypeRaw: String

    // MARK: - Data References

    /// ID of the room scan being uploaded
    public var roomScanId: UUID

    /// Optional room ID (for linking to rooms table)
    public var roomId: UUID?

    /// Encoded FirstWalkRoomData as JSON
    public var roomDataJSON: Data

    /// Encoded FirstWalkStyleSignals as JSON
    public var styleSignalsJSON: Data

    /// Optional USDZ model data
    public var usdzData: Data?

    /// Optional thumbnail image data
    public var thumbnailData: Data?

    // MARK: - Status

    /// Current sync status
    public var statusRaw: String

    /// Number of retry attempts
    public var retryCount: Int

    /// Last error message if failed
    public var lastError: String?

    // MARK: - Timestamps

    /// When the item was created
    public var createdAt: Date

    /// When the last sync attempt was made
    public var lastAttemptAt: Date?

    /// When the item was successfully synced
    public var syncedAt: Date?

    // MARK: - Computed Properties

    /// Computed sync status
    public var status: SyncQueueStatus {
        get { SyncQueueStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }

    /// Computed operation type
    public var operationType: SyncOperationType {
        get { SyncOperationType(rawValue: operationTypeRaw) ?? .roomScan }
        set { operationTypeRaw = newValue.rawValue }
    }

    /// Whether this item can be retried
    public var canRetry: Bool {
        retryCount < 3 && (status == .pending || status == .failed)
    }

    /// Whether this item should be processed
    public var needsProcessing: Bool {
        status == .pending || (status == .failed && canRetry)
    }

    // MARK: - Initialization

    public init(
        id: UUID = UUID(),
        operationType: SyncOperationType = .roomScan,
        roomScanId: UUID,
        roomId: UUID? = nil,
        roomDataJSON: Data,
        styleSignalsJSON: Data,
        usdzData: Data? = nil,
        thumbnailData: Data? = nil
    ) {
        self.id = id
        self.operationTypeRaw = operationType.rawValue
        self.roomScanId = roomScanId
        self.roomId = roomId
        self.roomDataJSON = roomDataJSON
        self.styleSignalsJSON = styleSignalsJSON
        self.usdzData = usdzData
        self.thumbnailData = thumbnailData
        self.statusRaw = SyncQueueStatus.pending.rawValue
        self.retryCount = 0
        self.lastError = nil
        self.createdAt = Date()
        self.lastAttemptAt = nil
        self.syncedAt = nil
    }

    // MARK: - Methods

    /// Mark as currently syncing
    public func markSyncing() {
        status = .syncing
        lastAttemptAt = Date()
    }

    /// Mark as successfully synced
    public func markSynced() {
        status = .synced
        syncedAt = Date()
        lastError = nil
    }

    /// Mark as failed with error
    public func markFailed(error: String) {
        status = .failed
        retryCount += 1
        lastError = error
        lastAttemptAt = Date()
    }

    /// Reset to pending for retry
    public func resetForRetry() {
        status = .pending
        lastError = nil
    }
}

// MARK: - Convenience Extensions

extension SyncQueueItem {
    /// Create a queue item from room data and style signals
    public static func create(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        usdzData: Data? = nil,
        thumbnailData: Data? = nil
    ) throws -> SyncQueueItem {
        let encoder = JSONEncoder()
        let roomDataJSON = try encoder.encode(roomData)
        let styleSignalsJSON = try encoder.encode(styleSignals)

        return SyncQueueItem(
            roomScanId: roomData.roomId,
            roomId: nil,
            roomDataJSON: roomDataJSON,
            styleSignalsJSON: styleSignalsJSON,
            usdzData: usdzData,
            thumbnailData: thumbnailData
        )
    }

    /// Decode the room data
    public func decodeRoomData() throws -> FirstWalkRoomData {
        let decoder = JSONDecoder()
        return try decoder.decode(FirstWalkRoomData.self, from: roomDataJSON)
    }

    /// Decode the style signals
    public func decodeStyleSignals() throws -> FirstWalkStyleSignals {
        let decoder = JSONDecoder()
        return try decoder.decode(FirstWalkStyleSignals.self, from: styleSignalsJSON)
    }
}

// MARK: - Fetch Descriptors

extension SyncQueueItem {
    /// Fetch descriptor for pending items
    public static var pendingItems: FetchDescriptor<SyncQueueItem> {
        var descriptor = FetchDescriptor<SyncQueueItem>(
            predicate: #Predicate { item in
                item.statusRaw == "pending"
            },
            sortBy: [SortDescriptor(\.createdAt)]
        )
        return descriptor
    }

    /// Fetch descriptor for items that need processing (pending or failed with retries left)
    public static var itemsNeedingProcessing: FetchDescriptor<SyncQueueItem> {
        var descriptor = FetchDescriptor<SyncQueueItem>(
            predicate: #Predicate { item in
                item.statusRaw == "pending" || (item.statusRaw == "failed" && item.retryCount < 3)
            },
            sortBy: [SortDescriptor(\.createdAt)]
        )
        return descriptor
    }

    /// Fetch descriptor for failed items
    public static var failedItems: FetchDescriptor<SyncQueueItem> {
        var descriptor = FetchDescriptor<SyncQueueItem>(
            predicate: #Predicate { item in
                item.statusRaw == "failed"
            },
            sortBy: [SortDescriptor(\.lastAttemptAt, order: .reverse)]
        )
        return descriptor
    }
}
