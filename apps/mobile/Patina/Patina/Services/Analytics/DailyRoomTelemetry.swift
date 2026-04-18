//
//  DailyRoomTelemetry.swift
//  Patina
//
//  Shared event model for The Daily Room behavioral telemetry pipeline.
//  Events are queued in DailyRoomBatchQueue and flushed every ~30s to
//  POST /api/interactions/batch on the client portal. Spec:
//  docs/specs/Data Tracking/patina-data-architecture.md
//

import Foundation

// MARK: - Event Type

/// Every event name in the Zone 1–4 vocabulary from the data architecture
/// spec. Must stay in sync with the CHECK constraint in
/// supabase/migrations/00069_daily_room_tracking.sql.
enum DailyRoomEventType: String, Codable {
    // Zone 1: greeting / session
    case appLaunched = "app_launched"
    case sessionStarted = "session_started"

    // Zone 2: stories
    case storyViewed = "story_viewed"
    case storyTapped = "story_tapped"
    case storyScrollDepth = "story_scroll_depth"
    case storyProductViewed = "story_product_viewed"
    case storyProductAdded = "story_product_added"
    case storyScrolledPast = "story_scrolled_past"

    // Zone 3: room channels
    case roomChannelViewed = "room_channel_viewed"
    case roomChannelSwitched = "room_channel_switched"
    case roomChannelDwell = "room_channel_dwell"
    case feedFilterApplied = "feed_filter_applied"
    case newPicksViewed = "new_picks_viewed"

    // Zone 4: product feed
    case productDwell = "product_dwell"
    case productAddInitiated = "product_add_initiated"
    case productAddedToRoom = "product_added_to_room"
    case productAddCancelled = "product_add_cancelled"
    case productSaved = "product_saved"
    case productMaterialViewed = "product_material_viewed"
    case productSwipedRight = "product_swiped_right"
    case productSwipedLeft = "product_swiped_left"
    case productDetailOpened = "product_detail_opened"
    case productInsightViewed = "product_insight_viewed"
    case productPairingTapped = "product_pairing_tapped"
    case productShared = "product_shared"
    case feedLoaded = "feed_loaded"
    case feedExhausted = "feed_exhausted"
    case feedScrollDepth = "feed_scroll_depth"
    case feedRefreshed = "feed_refreshed"
}

// MARK: - Metadata

/// A small JSON-compatible value type so metadata can hold numbers, bools,
/// and strings without resorting to `[String: String]`.
enum DailyRoomMetaValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .int(let v):    try c.encode(v)
        case .double(let v): try c.encode(v)
        case .bool(let v):   try c.encode(v)
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self)   { self = .bool(v); return }
        if let v = try? c.decode(Int.self)    { self = .int(v); return }
        if let v = try? c.decode(Double.self) { self = .double(v); return }
        self = .string(try c.decode(String.self))
    }
}

// MARK: - Event

struct DailyRoomEvent: Codable {
    let eventType: DailyRoomEventType
    let productId: String?
    let roomId: String?
    let metadata: [String: DailyRoomMetaValue]
    let timestamp: Date

    enum CodingKeys: String, CodingKey {
        case eventType = "event_type"
        case productId = "product_id"
        case roomId = "room_id"
        case metadata
        case timestamp
    }

    init(
        type: DailyRoomEventType,
        productId: String? = nil,
        roomId: String? = nil,
        metadata: [String: DailyRoomMetaValue] = [:],
        at date: Date = Date()
    ) {
        self.eventType = type
        self.productId = productId
        self.roomId = roomId
        self.metadata = metadata
        self.timestamp = date
    }
}
