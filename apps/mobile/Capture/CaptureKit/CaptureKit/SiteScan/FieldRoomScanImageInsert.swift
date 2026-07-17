//  FieldRoomScanImageInsert.swift
//  CaptureKit
//
//  The `room_scan_images` INSERT row for ONE Field posed photo. Keys are the
//  snake_case PostgREST columns verbatim — encoded with a plain `JSONEncoder`
//  (no key strategy), matching supabase-swift's PostgREST encoder. Every column
//  has existed since migration 00077; a single BATCHED insert of these rows is
//  the only write the photo lane makes.
//
//  `image_count` on `room_scans` is kept in sync by the 00032 AFTER-INSERT
//  trigger on `room_scan_images` — this lane deliberately does NOT patch it
//  (the explicit patch is what produced the prod 40-vs-200 image_count
//  discrepancy).
//
//  v1 locked constants (I76/I82): `role`/`photo_kind` = "auto",
//  `is_primary` = false everywhere (cover resolution is portal-side),
//  `is_full_resolution` = false, `mime_type` = "image/jpeg".

import Foundation

public struct FieldRoomScanImageInsert: Encodable, Sendable {
    public let scan_id: UUID
    public let room_id: UUID
    public let role: String
    public let is_primary: Bool
    public let display_order: Int
    public let image_url: String
    public let thumbnail_url: String
    public let captured_at: String
    public let camera_transform: [Double]
    public let camera_intrinsics: Intrinsics
    public let euler_angles: [Double]
    public let photo_kind: String
    public let is_full_resolution: Bool
    public let timestamp_seconds: Double
    public let width: Int
    public let height: Int
    public let file_size_bytes: Int
    public let mime_type: String
    public let light_estimate_lumens: Double?

    /// `{ fx, fy, cx, cy, width, height }` → `room_scan_images.camera_intrinsics`.
    public struct Intrinsics: Encodable, Sendable {
        public let fx: Double
        public let fy: Double
        public let cx: Double
        public let cy: Double
        public let width: Int
        public let height: Int
    }

    public init(
        scan_id: UUID, room_id: UUID, role: String, is_primary: Bool, display_order: Int,
        image_url: String, thumbnail_url: String, captured_at: String,
        camera_transform: [Double], camera_intrinsics: Intrinsics, euler_angles: [Double],
        photo_kind: String, is_full_resolution: Bool, timestamp_seconds: Double,
        width: Int, height: Int, file_size_bytes: Int, mime_type: String,
        light_estimate_lumens: Double?
    ) {
        self.scan_id = scan_id
        self.room_id = room_id
        self.role = role
        self.is_primary = is_primary
        self.display_order = display_order
        self.image_url = image_url
        self.thumbnail_url = thumbnail_url
        self.captured_at = captured_at
        self.camera_transform = camera_transform
        self.camera_intrinsics = camera_intrinsics
        self.euler_angles = euler_angles
        self.photo_kind = photo_kind
        self.is_full_resolution = is_full_resolution
        self.timestamp_seconds = timestamp_seconds
        self.width = width
        self.height = height
        self.file_size_bytes = file_size_bytes
        self.mime_type = mime_type
        self.light_estimate_lumens = light_estimate_lumens
    }

    /// Build the row for an auto-sampled posed photo from its sidecar entry plus
    /// the resolved storage URLs. Centralises the v1 locked constants so the
    /// uploader and the DTO test exercise the exact same mapping.
    public static func auto(
        from entry: FieldPhotoEntry,
        scanID: UUID,
        roomID: UUID,
        displayOrder: Int,
        urls: (image: String, thumbnail: String)
    ) -> FieldRoomScanImageInsert {
        FieldRoomScanImageInsert(
            scan_id: scanID,
            room_id: roomID,
            role: "auto",
            is_primary: false,
            display_order: displayOrder,
            image_url: urls.image,
            thumbnail_url: urls.thumbnail,
            captured_at: entry.capturedAt,
            camera_transform: entry.cameraTransform,
            camera_intrinsics: Intrinsics(
                fx: entry.cameraIntrinsics.fx,
                fy: entry.cameraIntrinsics.fy,
                cx: entry.cameraIntrinsics.cx,
                cy: entry.cameraIntrinsics.cy,
                width: entry.cameraIntrinsics.width,
                height: entry.cameraIntrinsics.height
            ),
            euler_angles: entry.eulerAngles,
            photo_kind: "auto",
            is_full_resolution: false,
            timestamp_seconds: entry.timestampSeconds,
            width: entry.width,
            height: entry.height,
            file_size_bytes: entry.fileSizeBytes,
            mime_type: "image/jpeg",
            light_estimate_lumens: entry.lightEstimateLumens
        )
    }
}
