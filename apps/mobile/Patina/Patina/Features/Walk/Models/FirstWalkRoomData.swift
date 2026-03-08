//
//  FirstWalkRoomData.swift
//  Patina
//
//  Data captured during the first walk, including room geometry
//  and detected features from RoomPlan.
//

import Foundation

/// Room data captured during the first walk
public struct FirstWalkRoomData: Codable {

    // MARK: - Identification

    /// Unique identifier for this room
    public let roomId: UUID

    /// User-assigned name (default: "Living Room")
    public var roomName: String

    // MARK: - Dimensions

    /// Room dimensions from RoomPlan
    public let dimensions: WalkRoomDimensions

    // MARK: - Features

    /// Detected features during the scan
    public let detectedFeatures: [DetectedFeature]

    // MARK: - Metadata

    /// How long the scan took
    public let scanDuration: TimeInterval

    /// When the scan completed
    public let completedAt: Date

    /// Scan coverage percentage (0-1)
    public let coveragePercentage: Float

    // MARK: - Hero Frame (Legacy - maintained for compatibility)

    /// HEIC compressed hero frame image data (~200KB)
    public var heroFrameData: Data?

    /// Quality score of the selected hero frame (0-1)
    public var heroFrameScore: Float?

    /// Number of candidate frames captured during scan
    public var candidateFrameCount: Int?

    // MARK: - Multi-Image Collection

    /// Collection of selected room images (hero + supporting)
    /// When present, supersedes heroFrameData/heroFrameScore
    public var imageCollection: RoomImageCollection?

    /// Convenience accessor for primary image data (prefers collection over legacy)
    public var primaryImageData: Data? {
        imageCollection?.heroImage?.imageData ?? heroFrameData
    }

    /// Convenience accessor for primary image score
    public var primaryImageScore: Float? {
        imageCollection?.heroImage?.qualityScore ?? heroFrameScore
    }

    /// All image data for upload (returns collection images or just hero)
    public var allImageData: [Data] {
        if let collection = imageCollection {
            return collection.allImages.compactMap { $0.imageData }
        }
        return heroFrameData.map { [$0] } ?? []
    }

    /// Total number of images captured
    public var totalImageCount: Int {
        imageCollection?.count ?? (heroFrameData != nil ? 1 : 0)
    }

    // MARK: - Initialization

    public init(
        roomId: UUID = UUID(),
        roomName: String = "Living Room",
        dimensions: WalkRoomDimensions,
        detectedFeatures: [DetectedFeature],
        scanDuration: TimeInterval,
        coveragePercentage: Float,
        heroFrameData: Data? = nil,
        heroFrameScore: Float? = nil,
        candidateFrameCount: Int? = nil,
        imageCollection: RoomImageCollection? = nil
    ) {
        self.roomId = roomId
        self.roomName = roomName
        self.dimensions = dimensions
        self.detectedFeatures = detectedFeatures
        self.scanDuration = scanDuration
        self.completedAt = Date()
        self.coveragePercentage = coveragePercentage
        self.heroFrameData = heroFrameData
        self.heroFrameScore = heroFrameScore
        self.candidateFrameCount = candidateFrameCount
        self.imageCollection = imageCollection
    }

    // MARK: - Feature Queries

    /// Whether the room has tall ceilings (>9ft / 2.74m)
    public var hasTallCeilings: Bool {
        dimensions.height > 2.74
    }

    /// Whether the room has multiple windows
    public var hasMultipleWindows: Bool {
        detectedFeatures.filter { $0.category == .window }.count > 1
    }

    /// Whether the room has a fireplace
    public var hasFireplace: Bool {
        detectedFeatures.contains { $0.category == .fireplace }
    }

    /// Whether the room has visible bookshelves
    public var hasBookshelf: Bool {
        detectedFeatures.contains { $0.category == .bookshelf }
    }

    /// Total window count
    public var windowCount: Int {
        detectedFeatures.filter { $0.category == .window }.count
    }
}

// MARK: - Walk Room Dimensions

/// Physical dimensions of the scanned room from RoomPlan
public struct WalkRoomDimensions: Codable {
    /// Width in meters
    public let width: Float

    /// Length in meters
    public let length: Float

    /// Height (ceiling) in meters
    public let height: Float

    /// Computed area in square meters
    public var area: Float {
        width * length
    }

    /// Computed volume in cubic meters
    public var volume: Float {
        width * length * height
    }

    /// Area in square feet (for display)
    public var areaInSquareFeet: Float {
        area * 10.764
    }

    public init(width: Float, length: Float, height: Float) {
        self.width = width
        self.length = length
        self.height = height
    }

    // MARK: - Presets for Testing

    public static let standard = WalkRoomDimensions(width: 4.5, length: 5.5, height: 2.7)
    public static let large = WalkRoomDimensions(width: 6.0, length: 8.0, height: 3.0)
    public static let small = WalkRoomDimensions(width: 3.0, length: 4.0, height: 2.4)
}

// MARK: - Detected Feature

/// A feature detected by RoomPlan during the scan
public struct DetectedFeature: Codable, Identifiable, Equatable {
    public let id: UUID
    public let category: FeatureCategory
    public let confidence: Float

    /// Associated value for features that have one (e.g., height for ceiling)
    public let value: Float?

    public init(
        id: UUID = UUID(),
        category: FeatureCategory,
        confidence: Float = 1.0,
        value: Float? = nil
    ) {
        self.id = id
        self.category = category
        self.confidence = confidence
        self.value = value
    }
}

/// Categories of detectable room features
public enum FeatureCategory: String, Codable, CaseIterable {
    case tallCeiling = "tall_ceiling"
    case window
    case largeWindow = "large_window"
    case door
    case fireplace
    case bookshelf
    case hardwoodFloor = "hardwood_floor"
    case cornerNook = "corner_nook"
    case openArea = "open_area"
    case seatingArea = "seating_area"

    /// Narration when this feature is detected
    public var narration: String {
        switch self {
        case .tallCeiling:
            return "Tall ceilings... that opens possibilities."
        case .window:
            return "Light coming in. That's important."
        case .largeWindow:
            return "That window is doing a lot of work in here."
        case .door:
            return "" // No narration for doors
        case .fireplace:
            return "A fireplace. The room has a heart."
        case .bookshelf:
            return "Books. Always a good sign."
        case .hardwoodFloor:
            return "Real wood floors. They've seen some life."
        case .cornerNook:
            return "I see a corner that wants something."
        case .openArea:
            return "Room to breathe here. I like that."
        case .seatingArea:
            return "A place to settle in."
        }
    }

    /// Whether this feature triggers narration
    public var triggersNarration: Bool {
        !narration.isEmpty
    }
}

// MARK: - Mock Data

extension FirstWalkRoomData {
    /// Sample room data for testing
    public static let sample = FirstWalkRoomData(
        roomName: "Living Room",
        dimensions: .standard,
        detectedFeatures: [
            DetectedFeature(category: .window, confidence: 0.95),
            DetectedFeature(category: .window, confidence: 0.92),
            DetectedFeature(category: .hardwoodFloor, confidence: 0.88),
            DetectedFeature(category: .openArea, confidence: 0.85)
        ],
        scanDuration: 145,
        coveragePercentage: 0.87
    )
}
