//
//  RoomScanSession.swift
//  Patina
//
//  In-memory session object representing a single "Quiet Conversation"
//  room scan run. Created at the Threshold, mutated through the Walk,
//  finalized on the Soft Landing, then passed immutably through the rest
//  of the flow (Conversation → Reveal → FloorPlanPreview).
//
//  Per PRD §5.1.
//

import Foundation
import simd
import UIKit

/// How the room was captured.
public enum ScanMethod: String, Codable {
    case lidar
    case manual
}

/// Room dimensions extracted from the scan.
public struct ScanRoomDimensions: Codable, Equatable {
    public var length: Float    // meters
    public var width: Float     // meters
    public var height: Float?   // meters (LiDAR only)
    public var area: Float      // square meters

    public init(length: Float, width: Float, height: Float? = nil, area: Float) {
        self.length = length
        self.width = width
        self.height = height
        self.area = area
    }
}

/// High-level features the scan detected (or the user entered).
public struct ScanRoomFeatures: Codable, Equatable {
    public var windowCount: Int
    public var doorCount: Int
    public var hasFireplace: Bool
    public var roomType: String

    public init(
        windowCount: Int = 0,
        doorCount: Int = 0,
        hasFireplace: Bool = false,
        roomType: String = "living_room"
    ) {
        self.windowCount = windowCount
        self.doorCount = doorCount
        self.hasFireplace = hasFireplace
        self.roomType = roomType
    }
}

/// A single detected object (furniture, appliance, etc.).
public struct ScanDetectedObject: Codable, Equatable {
    public var category: String
    public var position: SIMD3<Float>
    public var dimensions: SIMD3<Float>
    public var confidence: Float

    public init(
        category: String,
        position: SIMD3<Float>,
        dimensions: SIMD3<Float>,
        confidence: Float
    ) {
        self.category = category
        self.position = position
        self.dimensions = dimensions
        self.confidence = confidence
    }
}

/// Immutable session record for a single room scan + style discovery run.
public struct RoomScanSession: Equatable {

    public let sessionId: UUID
    public let userId: String
    public let startedAt: Date
    public var completedAt: Date?

    /// Normalized scan progress (0...1).
    public var scanProgress: Float

    /// Normalized scan quality (0...1).
    public var scanQuality: Float

    /// Whether the scan was captured via LiDAR or entered manually.
    public var scanMethod: ScanMethod

    // MARK: - LiDAR artifacts

    /// Cloud URL for the uploaded USDZ mesh (populated after background upload).
    public var meshDataUrl: String?

    /// Cloud URL for the uploaded point cloud (optional).
    public var pointCloudUrl: String?

    // MARK: - Extracted data (both methods)

    public var dimensions: ScanRoomDimensions
    public var features: ScanRoomFeatures
    public var detectedObjects: [ScanDetectedObject]

    // MARK: - Device info

    public var deviceModel: String
    public var osVersion: String
    public var hasLidar: Bool

    /// Convenience — the UUID of the local `RoomModel` this session produced, if any.
    public var localRoomId: UUID?

    public init(
        sessionId: UUID = UUID(),
        userId: String,
        startedAt: Date = Date(),
        completedAt: Date? = nil,
        scanProgress: Float = 0,
        scanQuality: Float = 0,
        scanMethod: ScanMethod,
        meshDataUrl: String? = nil,
        pointCloudUrl: String? = nil,
        dimensions: ScanRoomDimensions = ScanRoomDimensions(length: 0, width: 0, area: 0),
        features: ScanRoomFeatures = ScanRoomFeatures(),
        detectedObjects: [ScanDetectedObject] = [],
        deviceModel: String = UIDeviceModel.current,
        osVersion: String = UIDeviceModel.osVersion,
        hasLidar: Bool,
        localRoomId: UUID? = nil
    ) {
        self.sessionId = sessionId
        self.userId = userId
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.scanProgress = scanProgress
        self.scanQuality = scanQuality
        self.scanMethod = scanMethod
        self.meshDataUrl = meshDataUrl
        self.pointCloudUrl = pointCloudUrl
        self.dimensions = dimensions
        self.features = features
        self.detectedObjects = detectedObjects
        self.deviceModel = deviceModel
        self.osVersion = osVersion
        self.hasLidar = hasLidar
        self.localRoomId = localRoomId
    }
}

// MARK: - Device info helper

/// Thin helper for pulling device/os metadata.
public enum UIDeviceModel {
    public static var current: String {
        UIDevice.current.model
    }

    public static var osVersion: String {
        UIDevice.current.systemVersion
    }
}
