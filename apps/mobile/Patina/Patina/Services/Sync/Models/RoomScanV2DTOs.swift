//
//  RoomScanV2DTOs.swift
//  Patina
//
//  v2/v3 advanced-scan Supabase insert structs. Extracted from
//  RoomScanSyncService.swift (PT-6-1) without behavior change. These were
//  previously `private` inside the service; they are now module-internal so
//  the extracted uploader collaborators can build them.
//

import Foundation

/// Insert body for the v2 `room_scans` row. Extends the v1 struct with the
/// bundle-level URL columns + device metadata.
struct RoomScanV2Insert: Encodable {
    let id: UUID
    let user_id: UUID
    let room_id: UUID?
    let project_id: UUID?
    let name: String
    let room_type: String?
    let dimensions: RoomScanInsert.DimensionsJSON
    let floor_area: Double
    let coverage_percentage: Float?
    let features: RoomScanInsert.FeaturesJSON
    let furniture_detected: [RoomScanInsert.FurnitureDetected]
    let style_signals: RoomScanInsert.StyleSignalsJSON
    let suggested_styles: [String]
    let scan_data: RoomScanInsert.ScanDataJSON?
    let thumbnail_url: String?
    let model_url: String?
    let hero_frame_url: String?
    let hero_frame_score: Float?
    // v2-only
    let scan_schema_version: Int
    let device_model: String?
    let os_version: String?
    let has_lidar: Bool?
    let scan_bundle_size_bytes: Int?
    let capture_environment: CaptureEnvironmentJSON?
    let status: String
    let scanned_at: String
    let created_at: String

    struct CaptureEnvironmentJSON: Encodable {
        let lightEstimate: Double?
        let thermalState: String?
        let batteryLevel: Double?
        let motionQuality: String?
    }
}

/// Insert body for the v2 `room_scan_images` rows (posed photos with full
/// camera pose / intrinsics).
struct RoomScanImageInsertV2: Encodable {
    let scan_id: UUID
    let room_id: UUID?
    let role: String
    let is_primary: Bool
    let display_order: Int
    let feature_category: String?
    let image_url: String
    let quality_score: Float?
    let sharpness_score: Float?
    let brightness_score: Float?
    let composition_score: Float?
    let stability_score: Float?
    let light_estimate_lumens: Double?
    let captured_at: Date
    let camera_transform: [Double]
    let camera_intrinsics: PhotoIntrinsicsJSON
    let euler_angles: [Double]
    let photo_kind: String
    let is_full_resolution: Bool
    let associated_feature_id: UUID?
    let timestamp_seconds: Double
    let width: Int
    let height: Int
    let file_size_bytes: Int
    let mime_type: String
    let caption: String?
}

struct PhotoIntrinsicsJSON: Encodable {
    let fx: Double
    let fy: Double
    let cx: Double
    let cy: Double
    let width: Int
    let height: Int
}

/// Insert body for the `room_features` rows derived from the CapturedRoom
/// parametric JSON.
struct RoomFeatureInsert: Encodable {
    let room_id: UUID
    let scan_id: UUID
    let type: String
    let position_x: Double
    let position_y: Double
    let position_z: Double
    let width: Double?
    let height: Double?
    let depth: Double?
    let confidence: Double
}
