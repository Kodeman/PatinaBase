//  FieldPosedPhotoTests.swift
//  CaptureTests
//
//  The Field pro-site-scan posed-photo lane (Room View PHOTOS, I76) contracts:
//    • the pure capture GATE (interval / cap / inactive matrix),
//    • the `photos/` storage-key exact string (RLS-critical segment order + case),
//    • the `room_scan_images` insert DTO JSON-key snapshot incl. the 16-element
//      row-major `camera_transform`,
//    • the `photos_metadata.json` sidecar entry round-trip.
//  Pure CaptureKit types — no ARKit, no device, no Supabase — tested through the
//  CaptureTests → CaptureKit seam (same as FieldCapturePayloadTests).

import Foundation
import Testing
@testable import CaptureKit

struct FieldPosedPhotoTests {

    // MARK: - Gate: interval / cap / inactive

    @Test func gateHonorsInterval() {
        let t0 = Date(timeIntervalSinceReferenceDate: 0)
        // First frame while active (no prior capture) → capture.
        #expect(FieldPhotoGate.shouldCapture(now: t0, lastCapture: nil, count: 0, isActive: true))
        // Under the 2.0s interval → blocked.
        #expect(!FieldPhotoGate.shouldCapture(now: t0.addingTimeInterval(1.99), lastCapture: t0, count: 1, isActive: true))
        // Exactly at the interval (>=) → capture.
        #expect(FieldPhotoGate.shouldCapture(now: t0.addingTimeInterval(2.0), lastCapture: t0, count: 1, isActive: true))
        // Well past the interval → capture.
        #expect(FieldPhotoGate.shouldCapture(now: t0.addingTimeInterval(5.0), lastCapture: t0, count: 1, isActive: true))
        #expect(FieldPhotoGate.autoInterval == 2.0)
    }

    @Test func gateStopsSilentlyAtCap() {
        let t0 = Date(timeIntervalSinceReferenceDate: 0)
        let far = t0.addingTimeInterval(1_000) // interval never the blocker here
        #expect(FieldPhotoGate.maxPhotos == 60)
        // 59 captured so far → the 60th is allowed.
        #expect(FieldPhotoGate.shouldCapture(now: far, lastCapture: t0, count: 59, isActive: true))
        // 60 captured → cap reached, silent stop.
        #expect(!FieldPhotoGate.shouldCapture(now: far, lastCapture: t0, count: 60, isActive: true))
        // Over the cap → still blocked.
        #expect(!FieldPhotoGate.shouldCapture(now: far, lastCapture: t0, count: 75, isActive: true))
    }

    @Test func gateNeverCapturesWhenInactive() {
        let t0 = Date(timeIntervalSinceReferenceDate: 0)
        // Inactive dominates even a fresh, under-cap, past-interval frame.
        #expect(!FieldPhotoGate.shouldCapture(now: t0.addingTimeInterval(1_000), lastCapture: nil, count: 0, isActive: false))
        #expect(!FieldPhotoGate.shouldCapture(now: t0.addingTimeInterval(1_000), lastCapture: t0, count: 5, isActive: false))
    }

    // MARK: - Storage-key exact string (RLS)

    @Test func photosStoragePathShapeAndCase() {
        let uid = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let rid = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        let path = RoomScanStoragePath.object(
            folder: RoomScanStoragePath.Folder.photos,
            userID: uid,
            roomID: rid,
            filename: "auto_001.50.jpg"
        )
        // seg[1]=photos  seg[2]=uid  seg[3]=roomId  seg[4]=filename
        #expect(
            path
                == "photos/11111111-1111-1111-1111-111111111111/"
                + "22222222-2222-2222-2222-222222222222/"
                + "auto_001.50.jpg"
        )
        #expect(RoomScanStoragePath.Folder.photos == "photos")

        // UPPERCASE UUID in → canonical LOWERCASE segments (matches Postgres RLS).
        let upper = UUID(uuidString: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA")!
        let lowered = RoomScanStoragePath.object(
            folder: "photos",
            userID: upper,
            roomID: rid,
            filename: "thumb_auto_001.50.jpg"
        )
        #expect(
            lowered
                == "photos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/"
                + "22222222-2222-2222-2222-222222222222/"
                + "thumb_auto_001.50.jpg"
        )
    }

    // MARK: - Insert DTO JSON-key snapshot (+ 16-element camera_transform)

    private func sampleEntry(transform: [Double]) -> FieldPhotoEntry {
        FieldPhotoEntry(
            filename: "auto_002.00.jpg",
            thumbnailFilename: "thumb_auto_002.00.jpg",
            cameraTransform: transform,
            cameraIntrinsics: .init(fx: 1400, fy: 1400.5, cx: 960, cy: 720, width: 1920, height: 1440),
            eulerAngles: [0.1, 0.2, 0.3],
            lightEstimateLumens: 850,
            timestampSeconds: 2.0,
            capturedAt: "2026-07-17T00:00:00Z",
            width: 1440, height: 1920, fileSizeBytes: 234_567)
    }

    @Test func insertDTOMapsSnakeCaseKeysAndTransform() throws {
        let transform = (0..<16).map(Double.init) // 0.0 … 15.0, row-major
        let entry = sampleEntry(transform: transform)
        let scanID = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!
        let roomID = UUID(uuidString: "44444444-4444-4444-4444-444444444444")!

        let dto = FieldRoomScanImageInsert.auto(
            from: entry, scanID: scanID, roomID: roomID,
            displayOrder: 3, urls: (image: "https://cdn/img.jpg", thumbnail: "https://cdn/thumb.jpg"))

        let data = try JSONEncoder().encode(dto)
        let dict = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        // Identity + locked v1 constants.
        #expect(dict["id"] as? String == dto.id.uuidString)
        #expect(dict["scan_id"] as? String == scanID.uuidString)
        #expect(dict["room_id"] as? String == roomID.uuidString)
        #expect(dict["role"] as? String == "auto")
        #expect(dict["photo_kind"] as? String == "auto")
        #expect(dict["is_primary"] as? Bool == false)
        #expect(dict["is_full_resolution"] as? Bool == false)
        #expect(dict["mime_type"] as? String == "image/jpeg")
        #expect(dict["display_order"] as? Int == 3)

        // URLs + metadata pass-through.
        #expect(dict["image_url"] as? String == "https://cdn/img.jpg")
        #expect(dict["thumbnail_url"] as? String == "https://cdn/thumb.jpg")
        #expect(dict["captured_at"] as? String == "2026-07-17T00:00:00Z")
        #expect(dict["timestamp_seconds"] as? Double == 2.0)
        #expect(dict["width"] as? Int == 1440)
        #expect(dict["height"] as? Int == 1920)
        #expect(dict["file_size_bytes"] as? Int == 234_567)
        #expect(dict["light_estimate_lumens"] as? Double == 850)

        // 16-element row-major camera_transform preserved in order.
        let ct = try #require(dict["camera_transform"] as? [Double])
        #expect(ct.count == 16)
        #expect(ct == transform)

        // camera_intrinsics nested object.
        let intr = try #require(dict["camera_intrinsics"] as? [String: Any])
        #expect(intr["fx"] as? Double == 1400)
        #expect(intr["fy"] as? Double == 1400.5)
        #expect(intr["cx"] as? Double == 960)
        #expect(intr["cy"] as? Double == 720)
        #expect(intr["width"] as? Int == 1920)
        #expect(intr["height"] as? Int == 1440)

        // euler_angles [pitch, yaw, roll].
        let euler = try #require(dict["euler_angles"] as? [Double])
        #expect(euler == [0.1, 0.2, 0.3])

        // No stray keys beyond the room_scan_images columns this lane writes.
        #expect(Set(dict.keys) == Set([
            "id", "scan_id", "room_id", "role", "is_primary", "display_order",
            "image_url", "thumbnail_url", "captured_at", "camera_transform",
            "camera_intrinsics", "euler_angles", "photo_kind", "is_full_resolution",
            "timestamp_seconds", "width", "height", "file_size_bytes", "mime_type",
            "light_estimate_lumens"
        ]))
    }

    @Test func imageIDIsStablePerScanAndFilename() {
        let scanID = UUID(
            uuidString: "33333333-3333-3333-3333-333333333333"
        )!
        let first = FieldRoomScanImageInsert.deterministicID(
            scanID: scanID,
            filename: "auto_002.00.jpg"
        )
        let replay = FieldRoomScanImageInsert.deterministicID(
            scanID: scanID,
            filename: "auto_002.00.jpg"
        )
        let differentPhoto = FieldRoomScanImageInsert.deterministicID(
            scanID: scanID,
            filename: "auto_004.00.jpg"
        )
        let differentScan = FieldRoomScanImageInsert.deterministicID(
            scanID: UUID(
                uuidString: "55555555-5555-5555-5555-555555555555"
            )!,
            filename: "auto_002.00.jpg"
        )

        #expect(first == replay)
        #expect(first != differentPhoto)
        #expect(first != differentScan)
    }

    @Test func insertDTONilLightEstimateOmitsKey() throws {
        var transform = Array(repeating: 0.0, count: 16)
        transform[0] = 1; transform[5] = 1; transform[10] = 1; transform[15] = 1
        let entry = FieldPhotoEntry(
            filename: "auto_000.00.jpg", thumbnailFilename: nil,
            cameraTransform: transform,
            cameraIntrinsics: .init(fx: 1, fy: 1, cx: 0, cy: 0, width: 10, height: 10),
            eulerAngles: [0, 0, 0], lightEstimateLumens: nil,
            timestampSeconds: 0, capturedAt: "2026-07-17T00:00:00Z",
            width: 10, height: 10, fileSizeBytes: 100)
        let dto = FieldRoomScanImageInsert.auto(
            from: entry, scanID: UUID(), roomID: UUID(),
            displayOrder: 1, urls: (image: "https://cdn/i.jpg", thumbnail: "https://cdn/i.jpg"))
        let dict = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(dto)) as? [String: Any])
        // A nil Optional encodes to an absent key (default JSONEncoder behaviour).
        #expect(dict["light_estimate_lumens"] == nil)
    }

    // MARK: - Sidecar round-trip

    @Test func sidecarEntryRoundTrips() throws {
        let entries = [sampleEntry(transform: (0..<16).map(Double.init))]
        let data = try JSONEncoder().encode(entries)
        let back = try JSONDecoder().decode([FieldPhotoEntry].self, from: data)
        #expect(back == entries)
    }
}
