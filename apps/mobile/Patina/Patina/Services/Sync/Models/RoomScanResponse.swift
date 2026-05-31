//
//  RoomScanResponse.swift
//  Patina
//
//  Decodable response model for `room_scans` SELECTs. Extracted from
//  RoomScanSyncService.swift (PT-6-1) without behavior change. Public API
//  surface preserved — `RoomScanSyncService.fetchRoomScans()` returns
//  `[RoomScanResponse]`.
//

import Foundation

/// Room scan response from Supabase
public struct RoomScanResponse: Decodable, Identifiable {
    public let id: UUID
    public let user_id: UUID
    public let project_id: UUID?
    public let name: String
    public let room_type: String?
    public let dimensions: DimensionsData?
    public let floor_area: Double?
    public let features: FeaturesData?
    public let style_signals: StyleSignalsData?
    public let suggested_styles: [String]?
    public let thumbnail_url: String?
    public let hero_frame_url: String?
    public let hero_frame_score: Float?
    public let status: String
    public let scanned_at: String?
    public let created_at: String

    public struct DimensionsData: Decodable {
        public let width: Float?
        public let length: Float?
        public let height: Float?
        public let unit: String?
    }

    public struct FeaturesData: Decodable {
        public let windows: [FeatureItem]?
        public let doors: [FeatureItem]?
        public let other: [FeatureItem]?

        public struct FeatureItem: Decodable {
            public let type: String
            public let confidence: Float?
            public let value: Float?
        }
    }

    public struct StyleSignalsData: Decodable {
        public let naturalLight: Float?
        public let openness: Float?
        public let warmth: Float?
        public let texture: Float?
    }
}
