//  CaptureMediaMimeTests.swift
//  CaptureTests
//
//  The capture-media bucket (00234) enforces an allowed_mime_types list, and a
//  MIME the uploader can emit but the bucket rejects is a Storage 400 at the
//  worst possible moment — which is exactly what bit M2. The map lived in the
//  app target, where the CaptureKit test scheme cannot see it; it lives in
//  CaptureKit now so this guard runs on every gate.

import Foundation
import Testing
@testable import CaptureKit

struct CaptureMediaMimeTests {
    /// Exactly what the uploader can put in the bucket today: HEIC/JPEG photos
    /// from the camera path, and .m4a voice segments. Nothing else is emitted
    /// by any code path, so nothing else is asserted here — an aspirational
    /// fixture list would make this guard read stronger than it is.
    private let emittable = ["a.heic", "a.HEIF", "a.jpg", "a.jpeg",
                             "voice-3f2504e0-000.m4a", "VOICE-3F2504E0-001.M4A"]

    @Test func everyEmittableMimeIsAllowedByTheBucket() {
        for name in emittable {
            let mime = CaptureMediaMime.forFilename(name)
            #expect(CaptureMediaMime.bucketAllowed.contains(mime),
                    "\(name) → \(mime) is not in the capture-media allow-list")
        }
    }

    @Test func m4aMapsToTheAudioMimeTheBucketAllows() {
        #expect(CaptureMediaMime.forFilename("voice-abc-000.m4a") == "audio/x-m4a")
        #expect(CaptureMediaMime.forFilename("VOICE-ABC-001.M4A") == "audio/x-m4a")
    }

    @Test func unknownExtensionsFallBackToOctetStream() {
        #expect(CaptureMediaMime.forFilename("a.usdz") == "application/octet-stream")
        #expect(CaptureMediaMime.forFilename("manifest.json") == "application/octet-stream")
        #expect(CaptureMediaMime.forFilename("noextension") == "application/octet-stream")
    }

    @Test func theAllowListMirrorsTheBucketExactly() {
        #expect(CaptureMediaMime.bucketAllowed.count == 10)
        #expect(CaptureMediaMime.bucketAllowed.contains("application/json"))
    }
}
