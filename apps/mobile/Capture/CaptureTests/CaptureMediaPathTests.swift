//  CaptureMediaPathTests.swift
//  CaptureTests
//
//  Storage RLS on capture-media (migration 00234) gates on
//  `auth.uid()::text = (storage.foldername(name))[1]` — Postgres's lowercase
//  canonical UUID rendering. Foundation's `UUID.uuidString` is uppercase, so
//  this guards `CaptureMediaPath.folder` against ever building an upload path
//  that would throw an RLS violation.

import Foundation
import Testing
@testable import CaptureKit

struct CaptureMediaPathTests {
    @Test func folderIsFullyLowercasedFromUppercaseUUIDs() {
        let userID = UUID(uuidString: "9AD8F978-58B1-4E1A-9C2D-3F1B2C4D5E6F")!
        let clientToken = UUID(uuidString: "ABCDEF01-2345-6789-ABCD-EF0123456789")!

        let folder = CaptureMediaPath.folder(userID: userID, clientToken: clientToken)

        #expect(folder == "9ad8f978-58b1-4e1a-9c2d-3f1b2c4d5e6f/abcdef01-2345-6789-abcd-ef0123456789")
        #expect(folder == folder.lowercased())
    }
}

/// `room-scans` is PRIVATE (`public = false`, migration 00031, never flipped),
/// so a `/object/public/room-scans/<key>` URL stored in a `room_scans` artifact
/// column answers `400 Bucket not found` — the second defect I104 recorded,
/// against `scan_bundle_url` and `depth_archive_url`. The fix is writer-side:
/// store the plain object key, exactly as `capture-media` (00234) and
/// `site-requests` (00374) already do, and let readers sign at read time.
///
/// Same shape of assertion as `FieldCapturePayloadTests`' "private bucket → no
/// publicUrl emitted": the pin is on what LEAVES the device, not on how the
/// server later resolves it.
struct RoomScanStoredReferenceTests {
    private static let key = RoomScanStoragePath.object(
        folder: RoomScanStoragePath.Folder.usdz,
        userID: UUID(uuidString: "9AD8F978-58B1-4E1A-9C2D-3F1B2C4D5E6F")!,
        roomID: UUID(uuidString: "ABCDEF01-2345-6789-ABCD-EF0123456789")!,
        scanID: UUID(uuidString: "12345678-1234-5678-9ABC-123456789ABC")!,
        filename: RoomScanStoragePath.Filename.usdz
    )

    @Test func storedReferenceIsTheBareKeyAndNothingElse() {
        let stored = RoomScanStoragePath.storedReference(forObjectPath: Self.key)

        #expect(stored == Self.key)
        // private bucket → no public URL is ever emitted
        #expect(!stored.contains("/object/public/"))
        #expect(!stored.contains("://"))
        #expect(!stored.hasPrefix("/"))
        // …and no signed form either: a column is durable, a signature expires.
        #expect(!stored.contains("token="))
        #expect(!stored.contains("?"))
    }

    @Test func storedReferenceSurvivesTheRoundTripEveryConsumerPerforms() {
        // Each consumer (confirm-scan-bundle, parse-room-scan's
        // objectKeyFromUrl, the worker's keys.object_key_from_url, the portals'
        // publicUrlToPath) splits on the LAST "/room-scans/" and otherwise uses
        // the value as-is. A bare key must come back out unchanged.
        let stored = RoomScanStoragePath.storedReference(forObjectPath: Self.key)
        let marker = "/room-scans/"
        let derived = stored.range(of: marker, options: .backwards)
            .map { String(stored[$0.upperBound...]) } ?? stored

        #expect(derived == Self.key)
        // …and that key is still the RLS-legal shape: [1]=folder, [2]=user,
        // [3]=room (00077, 1-based).
        #expect(derived.split(separator: "/").count == 5)
    }
}
