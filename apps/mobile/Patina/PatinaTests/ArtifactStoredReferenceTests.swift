//
//  ArtifactStoredReferenceTests.swift
//  PatinaTests
//
//  Pins WHAT THE DEVICE WRITES into a `room_scans` artifact URL column.
//
//  `room-scans` is a PRIVATE bucket — `public = false` in migration 00031, and
//  no later migration flips it. This uploader stored
//  `…/storage/v1/object/public/room-scans/<key>` there anyway, so
//  `room_scans.scan_bundle_url` and `room_scans.depth_archive_url` hold URLs
//  that answer `400 Bucket not found` (recorded as the second defect in
//  decision I104; repair authorised by R122).
//
//  The fix is writer-side and is the house convention for private buckets:
//  store the plain object key and sign at READ time. `capture-media` (00234)
//  stores `path`, `site-requests` (00374) stores `object_path`, and migration
//  00242 calls it "the capture-media pattern". Field's uploader has the same
//  seam (`RoomScanStoragePath.storedReference`) with the same test.
//
//  Nothing downstream regresses: every consumer already reduces the column to a
//  bucket key and none fetches it as a URL — `confirm-scan-bundle`,
//  `parse-room-scan`'s `objectKeyFromUrl`, the scan worker's
//  `keys.object_key_from_url`, and the portals' `publicUrlToPath` each carry an
//  explicit "no marker / no scheme → use as-is" branch.
//

import Testing
import Foundation
@testable import Patina

struct ArtifactStoredReferenceTests {
    private static let key =
        "bundle/9ad8f978-58b1-4e1a-9c2d-3f1b2c4d5e6f/"
        + "abcdef01-2345-6789-abcd-ef0123456789/keyframes.tar"

    @Test func storedReferenceIsTheBareKeyAndNotAPublicUrl() {
        let stored = ArtifactUploader.storedReference(forObjectPath: Self.key)

        #expect(stored == Self.key)
        // private bucket → no public URL is ever emitted
        #expect(!stored.contains("/object/public/"))
        #expect(!stored.contains("://"))
        // …nor an /object/authenticated/ path (would embed the project host in
        // a data column), nor a signed URL (a column is durable; a signature
        // expires).
        #expect(!stored.contains("/object/authenticated/"))
        #expect(!stored.contains("?"))
        #expect(!stored.contains("token="))
    }

    @Test func storedReferenceSurvivesTheReduction_everyConsumerPerforms() {
        // Split on the LAST "/room-scans/", else use as-is — the shared shape of
        // objectKeyFromUrl / object_key_from_url / publicUrlToPath.
        let stored = ArtifactUploader.storedReference(forObjectPath: Self.key)
        let marker = "/room-scans/"
        let derived = stored.range(of: marker, options: .backwards)
            .map { String(stored[$0.upperBound...]) } ?? stored

        #expect(derived == Self.key)
        // Still the 00077 RLS-legal shape: [1]=folder, [2]=user, [3]=room.
        #expect(derived.split(separator: "/").count == 4)
    }
}
