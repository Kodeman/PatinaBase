//
//  RoomModel.swift
//  Patina
//
//  SwiftData model for user's rooms
//

import SwiftData
import Foundation

/// Sync status for local room model
public enum RoomSyncStatus: String, Codable {
    case local = "local"           // Only exists locally
    case pending = "pending"       // Waiting to sync
    case syncing = "syncing"       // Currently uploading
    case synced = "synced"         // Synced with remote
    case failed = "failed"         // Sync failed
}

/// A room in the user's home
@Model
public final class RoomModel {

    // MARK: - Properties

    /// Unique identifier
    @Attribute(.unique) public var id: UUID

    /// Room name (e.g., "Living Room", "Master Bedroom")
    public var name: String

    /// Type of room
    public var roomType: String

    /// Whether the room has been scanned with AR
    public var hasBeenScanned: Bool

    /// Width in meters
    public var width: Double?

    /// Length in meters
    public var length: Double?

    /// Height in meters
    public var height: Double?

    /// User's notes about this room
    public var notes: String?

    /// When the room was created
    public var createdAt: Date

    /// Last updated timestamp
    public var updatedAt: Date

    /// AR scan data reference (file path or identifier)
    public var scanDataReference: String?

    // MARK: - Hero Frame Properties (Legacy - for single image support)

    /// HEIC compressed hero frame image data (~200KB)
    public var heroFrameData: Data?

    /// When the hero frame was captured
    public var heroFrameTimestamp: Date?

    /// Quality score of the hero frame (0-1)
    public var heroFrameScore: Float?

    /// Cloud reference ID for the hero frame
    public var heroFrameId: UUID?

    // MARK: - Multi-Image Properties

    /// JSON-encoded RoomImageCollectionMetadata
    public var imageCollectionMetadata: Data?

    /// Number of images in the collection (0 = legacy single hero frame mode)
    /// Default value required for SwiftData migration
    public var imageCount: Int = 0

    /// JSON-encoded dictionary of image URLs [role: url]
    /// Format: {"hero": "url1", "supporting_0": "url2", ...}
    public var imageUrlsJson: Data?

    // MARK: - Stats & Emergence

    /// Number of pieces saved to this room
    public var savedItemCount: Int

    /// Whether there's an active emergence notification for this room
    public var hasActiveEmergence: Bool

    /// Message to display in emergence card
    public var emergenceMessage: String?

    // MARK: - Sync Properties

    /// Remote scan ID from Supabase room_scans table
    public var remoteScanId: UUID?

    /// Current sync status
    public var syncStatusRaw: String

    /// When the room was last synced to the server
    public var lastSyncedAt: Date?

    /// Computed sync status
    public var syncStatus: RoomSyncStatus {
        get { RoomSyncStatus(rawValue: syncStatusRaw) ?? .local }
        set { syncStatusRaw = newValue.rawValue }
    }

    // MARK: - Initialization

    public init(
        id: UUID = UUID(),
        name: String,
        roomType: String = "other",
        hasBeenScanned: Bool = false,
        width: Double? = nil,
        length: Double? = nil,
        height: Double? = nil,
        notes: String? = nil,
        remoteScanId: UUID? = nil,
        syncStatus: RoomSyncStatus = .local,
        heroFrameData: Data? = nil,
        heroFrameScore: Float? = nil,
        imageCount: Int = 0
    ) {
        self.id = id
        self.name = name
        self.roomType = roomType
        self.hasBeenScanned = hasBeenScanned
        self.width = width
        self.length = length
        self.height = height
        self.notes = notes
        self.createdAt = Date()
        self.updatedAt = Date()
        self.scanDataReference = nil
        self.remoteScanId = remoteScanId
        self.syncStatusRaw = syncStatus.rawValue
        self.lastSyncedAt = nil

        // Hero frame (legacy)
        self.heroFrameData = heroFrameData
        self.heroFrameTimestamp = heroFrameData != nil ? Date() : nil
        self.heroFrameScore = heroFrameScore
        self.heroFrameId = nil

        // Multi-image
        self.imageCollectionMetadata = nil
        self.imageCount = imageCount
        self.imageUrlsJson = nil

        // Stats & emergence
        self.savedItemCount = 0
        self.hasActiveEmergence = false
        self.emergenceMessage = nil
    }

    // MARK: - Computed Properties

    /// Area in square meters
    public var area: Double? {
        guard let w = width, let l = length else { return nil }
        return w * l
    }

    /// Volume in cubic meters
    public var volume: Double? {
        guard let w = width, let l = length, let h = height else { return nil }
        return w * l * h
    }

    /// Formatted area string
    public var formattedArea: String? {
        guard let area = area else { return nil }
        let sqFeet = area * 10.764 // Convert to sq ft
        return String(format: "%.0f sq ft", sqFeet)
    }

    // MARK: - Methods

    /// Update the room dimensions
    public func updateDimensions(width: Double, length: Double, height: Double) {
        self.width = width
        self.length = length
        self.height = height
        self.hasBeenScanned = true
        self.updatedAt = Date()
    }

    /// Mark the room as scanned
    public func markAsScanned(scanReference: String?) {
        self.hasBeenScanned = true
        self.scanDataReference = scanReference
        self.updatedAt = Date()
    }

    // MARK: - Sync Methods

    /// Update sync status
    public func updateSyncStatus(_ status: RoomSyncStatus) {
        self.syncStatus = status
        self.updatedAt = Date()
    }

    /// Mark as synced with remote ID
    public func markAsSynced(remoteScanId: UUID) {
        self.remoteScanId = remoteScanId
        self.syncStatus = .synced
        self.lastSyncedAt = Date()
        self.updatedAt = Date()
    }

    /// Mark sync as failed
    public func markSyncFailed() {
        self.syncStatus = .failed
        self.updatedAt = Date()
    }

    /// Mark as pending sync
    public func markPendingSync() {
        self.syncStatus = .pending
        self.updatedAt = Date()
    }

    /// Whether this room needs to be synced
    public var needsSync: Bool {
        hasBeenScanned && (syncStatus == .local || syncStatus == .pending || syncStatus == .failed)
    }

    // MARK: - Hero Frame Methods

    /// Whether this room has a hero frame
    public var hasHeroFrame: Bool {
        heroFrameData != nil
    }

    /// Update the hero frame
    public func updateHeroFrame(data: Data, score: Float?) {
        self.heroFrameData = data
        self.heroFrameTimestamp = Date()
        self.heroFrameScore = score
        self.updatedAt = Date()
    }

    /// Mark hero frame as synced with cloud ID
    public func markHeroFrameSynced(cloudId: UUID) {
        self.heroFrameId = cloudId
        self.updatedAt = Date()
    }

    // MARK: - Multi-Image Methods

    /// Whether this room has a multi-image collection
    public var hasImageCollection: Bool {
        imageCount > 1 || imageCollectionMetadata != nil
    }

    /// Decode the image collection metadata
    public var imageCollection: RoomImageCollectionMetadata? {
        guard let data = imageCollectionMetadata else { return nil }
        return try? JSONDecoder().decode(RoomImageCollectionMetadata.self, from: data)
    }

    /// Get image URLs dictionary
    public var imageUrls: [String: String]? {
        guard let data = imageUrlsJson else { return nil }
        return try? JSONDecoder().decode([String: String].self, from: data)
    }

    /// All image URLs in display order
    public var orderedImageUrls: [String] {
        guard let urls = imageUrls else {
            // Fallback to hero frame URL if available
            if let heroId = heroFrameId?.uuidString {
                return [heroId]
            }
            return []
        }
        var ordered: [String] = []
        if let hero = urls["hero"] { ordered.append(hero) }
        for i in 0..<9 {
            if let url = urls["supporting_\(i)"] { ordered.append(url) }
        }
        return ordered
    }

    /// Hero image URL (from collection or legacy)
    public var heroImageUrl: String? {
        imageUrls?["hero"] ?? (heroFrameId != nil ? "hero" : nil)
    }

    /// Update image collection metadata
    public func updateImageCollection(metadata: RoomImageCollectionMetadata) {
        self.imageCollectionMetadata = try? JSONEncoder().encode(metadata)
        self.imageCount = metadata.images.count
        self.updatedAt = Date()
    }

    /// Update image URLs
    public func updateImageUrls(_ urls: [String: String]) {
        self.imageUrlsJson = try? JSONEncoder().encode(urls)
        self.updatedAt = Date()
    }

    /// Mark all images as synced with their cloud URLs
    public func markImagesSynced(urls: [String: String]) {
        updateImageUrls(urls)
        self.syncStatus = .synced
        self.lastSyncedAt = Date()
        self.updatedAt = Date()
    }

    // MARK: - Emergence Methods

    /// Set an active emergence notification
    public func setEmergence(message: String) {
        self.hasActiveEmergence = true
        self.emergenceMessage = message
        self.updatedAt = Date()
    }

    /// Clear the emergence notification
    public func clearEmergence() {
        self.hasActiveEmergence = false
        self.emergenceMessage = nil
        self.updatedAt = Date()
    }

    /// Increment saved item count
    public func incrementSavedItems() {
        self.savedItemCount += 1
        self.updatedAt = Date()
    }
}
