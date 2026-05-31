//
//  RoomScanSyncDTOs.swift
//  Patina
//
//  Supabase RPC payload structs / DTOs for the room-scan sync pipeline.
//  Extracted from RoomScanSyncService.swift (PT-6-1) without behavior
//  change. These are the v1 `room_scans` / `rooms` / `room_scan_images`
//  insert + patch bodies plus the small RPC parameter structs.
//
//  The previously-`private` RPC parameter / patch structs are now
//  module-internal so they can live alongside the service; none were part
//  of the service's public API.
//

import Foundation

// MARK: - Sync status / error

/// Sync status for room scans
public enum RoomScanSyncStatus: String, Codable {
    case pending = "pending"
    case syncing = "syncing"
    case synced = "synced"
    case failed = "failed"
}

/// Error types for room scan sync
public enum RoomScanSyncError: Error, LocalizedError {
    case notAuthenticated
    case networkError(Error)
    case encodingError(Error)
    case uploadFailed(String)
    case storageError(Error)

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to sync room scans"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to encode scan data: \(error.localizedDescription)"
        case .uploadFailed(let message):
            return "Upload failed: \(message)"
        case .storageError(let error):
            return "Storage error: \(error.localizedDescription)"
        }
    }
}

// MARK: - v1 insert / patch bodies

/// Data structure for Supabase room_scan_images table insert
struct RoomScanImageInsert: Encodable {
    let scanId: UUID
    let role: String
    let isPrimary: Bool
    let displayOrder: Int
    let featureCategory: String?
    let imageUrl: String
    let qualityScore: Float
    let sharpnessScore: Float?
    let brightnessScore: Float?
    let compositionScore: Float?
    let stabilityScore: Float?
    let lightEstimate: Float
    let capturedAt: Date

    enum CodingKeys: String, CodingKey {
        case scanId = "scan_id"
        case role
        case isPrimary = "is_primary"
        case displayOrder = "display_order"
        case featureCategory = "feature_category"
        case imageUrl = "image_url"
        case qualityScore = "quality_score"
        case sharpnessScore = "sharpness_score"
        case brightnessScore = "brightness_score"
        case compositionScore = "composition_score"
        case stabilityScore = "stability_score"
        case lightEstimate = "light_estimate"
        case capturedAt = "captured_at"
    }
}

/// Data structure for Supabase room_scans table insert
struct RoomScanInsert: Encodable {
    let id: UUID
    let user_id: UUID
    let room_id: UUID?
    let project_id: UUID?
    let name: String
    let room_type: String?
    let dimensions: DimensionsJSON
    let floor_area: Double
    let coverage_percentage: Float?
    let features: FeaturesJSON
    let furniture_detected: [FurnitureDetected]
    let style_signals: StyleSignalsJSON
    let suggested_styles: [String]
    let scan_data: ScanDataJSON?
    let thumbnail_url: String?
    let model_url: String?
    let hero_frame_url: String?
    let hero_frame_score: Float?
    let status: String
    let scanned_at: String
    let created_at: String

    struct DimensionsJSON: Encodable {
        let width: Float
        let length: Float
        let height: Float
        let unit: String
    }

    struct FeaturesJSON: Encodable {
        let windows: [FeatureItem]
        let doors: [FeatureItem]
        let other: [FeatureItem]

        struct FeatureItem: Encodable {
            let type: String
            let confidence: Float
            let value: Float?
        }
    }

    struct FurnitureDetected: Encodable {
        let category: String
        let confidence: Float
    }

    struct StyleSignalsJSON: Encodable {
        let naturalLight: Float
        let openness: Float
        let warmth: Float
        let texture: Float
        let timeOfDay: String?
        let lightPreference: String?
        let seatingPreference: String?
        let roomFeeling: String?
        let scanPace: String
    }

    struct ScanDataJSON: Encodable {
        let scanDuration: TimeInterval
        let coveragePercentage: Float
        let completedAt: String
    }
}

/// Data structure for Supabase `rooms` table insert. The mobile app creates a
/// parent `rooms` row so every `room_scans` row has a `room_id` to hang off of,
/// which the server-side triggers (`increment_room_scan_count`) and the
/// designer portal depend on.
struct RoomInsert: Encodable {
    let id: UUID
    let user_id: UUID
    let name: String
    let type: String
    let width_meters: Double?
    let length_meters: Double?
    let height_meters: Double?
    let floor_area_sqm: Double?
    let volume_cbm: Double?
}

/// Patch body used to update `room_scans.model_url` after the USDZ upload
/// completes. The USDZ upload happens separately so the scan row gets patched
/// with the public URL once the file is actually in storage.
struct RoomScanModelURLPatch: Encodable {
    let model_url: String
}

/// Generic single-column patch for v2 advanced scan URLs.
struct RoomScanStringPatch: Encodable {
    let column: String
    let value: String

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicKey.self)
        try container.encode(value, forKey: DynamicKey(stringValue: column))
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
}
