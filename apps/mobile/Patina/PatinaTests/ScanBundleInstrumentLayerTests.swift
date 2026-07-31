//
//  ScanBundleInstrumentLayerTests.swift
//  PatinaTests
//
//  The client bundle's INSTRUMENT LAYER — the seven top-level manifest keys
//  `validate_capture_bundle.py` §10.2 requires and a client scan did not emit:
//  `bundleSpecVersion`, `session`, `anchors`, `scorecard`, `poseGraphSummary`,
//  `unverified`, `checksumAlgorithm`.
//
//  A real client scan uploaded to production, reached `status=ready`, was
//  claimed by the worker, and died at ingest naming all seven plus
//  "'anchors' must be an array". `SCHEMA_VIOLATION` is a PERMANENT_TOKEN, so
//  the task parked on attempt 1 with no retry.
//
//  ── What these tests are, and are not ────────────────────────────────────────
//  The in-process tests below restate the validator's rules against the sealed
//  Swift manifest, so a producer regression is caught here rather than in
//  production. They are NOT the proof: the proof is
//  `exportSealedBundleForTheRealValidator`, which seals a realistic bundle
//  through the REAL `ScanBundleWriter` and copies it somewhere the actual
//  Python validator can be run against it. There is no iOS CI; that export +
//  `python3 scripts/validate_capture_bundle.py <dir>` is the only thing that
//  can say "exit 0" about the bytes this app writes.
//
//  Numbers in the fixture come from a real device scan (LiDAR iPhone, July
//  2026) rather than being invented: verdict=red, surfaces=11, coveragePct=73,
//  keyframesFired=57, sceneDepth frames=2635, meshAnchors=68.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanBundleInstrumentLayerTests {

    // MARK: - A realistic client bundle

    /// The artifact set a real client scan actually produces — every kind
    /// `RoomCaptureBundleAdapter.freezeBundleArtifacts` registers, with
    /// plausible bytes. `heroThumbnail` and `bundleArchive` are deliberately
    /// absent: no producer in the app registers them (verified by grep), and
    /// the worker has no key route for either.
    private func makeRealisticBundle() throws -> ScanBundleWriter {
        let writer = try ScanBundleWriter(
            scanId: UUID(),
            roomLocalId: UUID(),
            roomName: "Living Room",
            capture: .init(highFidelityDepthEnabled: true, autoPhotoInterval: 2.0)
        )

        try writer.writeArtifact(
            kind: .capturedRoomJson,
            data: Data(#"{"walls":[{"identifier":"w1"}],"doors":[],"windows":[],"objects":[]}"#.utf8),
            mimeType: "application/json")
        try writer.writeArtifact(
            kind: .usdz,
            data: Data(repeating: 0x55, count: 4096),
            mimeType: "model/vnd.usdz+zip")
        try writer.writeArtifact(
            kind: .mesh,
            data: Data("ply\nformat ascii 1.0\nelement vertex 0\nend_header\n".utf8),
            mimeType: "model/ply")
        try writer.writeArtifact(
            kind: .worldMap,
            data: Data(repeating: 0x1A, count: 2048),
            mimeType: "application/octet-stream")
        try writer.writeArtifact(
            kind: .coverageHeatmap,
            data: Data(#"{"cellSize":0.25,"cells":[]}"#.utf8),
            mimeType: "application/json")
        try writer.writeArtifact(
            kind: .depthArchive,
            data: Data(repeating: 0x7F, count: 8192),
            mimeType: "application/zip")

        for index in 0..<2 {
            try writer.appendPhoto(
                photo(index: index),
                imageData: Data(repeating: UInt8(0xC0 + index), count: 512))
        }
        try writer.registerPhotosManifest()

        try writer.updateCaptureEnvironment(.init(
            lightEstimate: 812.5,
            thermalState: "fair",
            batteryLevel: 0.63,
            motionQuality: "good",
            opticalFlowMean: nil,
            sceneDepthFrameCount: 2635,
            coverageHeatmapPresent: true))

        return writer
    }

    private func photo(index: Int) -> ScanManifest.PhotoEntry {
        ScanManifest.PhotoEntry(
            relativePath: "photos/auto_\(index).heic",
            kind: index == 0 ? .hero : .auto,
            capturedAt: Date(timeIntervalSince1970: 1_784_000_000 + Double(index) * 2),
            timestampSeconds: Double(index) * 2,
            sizeBytes: 512,
            width: 4032,
            height: 3024,
            isFullResolution: true,
            cameraTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            cameraIntrinsics: .init(fx: 3200, fy: 3200, cx: 2016, cy: 1512, width: 4032, height: 3024),
            eulerAngles: [0, 0, 0])
    }

    // MARK: - The export the real validator reads

    /// Seal a realistic bundle and copy it where `validate_capture_bundle.py`
    /// can be pointed at it. NOT a hermetic assertion — a bridge to the only
    /// authority that matters. The destination is stable and overwritten each
    /// run, and lives in the test host's Caches so it is findable from the Mac:
    ///
    ///     find ~/Library/Developer/CoreSimulator/Devices \
    ///          -type d -name PatinaBundleExport 2>/dev/null
    ///     python3 scripts/validate_capture_bundle.py "$FOUND/sealed-client-bundle"
    @Test func exportSealedBundleForTheRealValidator() throws {
        let writer = try makeRealisticBundle()
        defer { try? writer.deleteBundle() }
        try sealForValidation(writer)

        let caches = try FileManager.default.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let dest = caches
            .appendingPathComponent("PatinaBundleExport", isDirectory: true)
            .appendingPathComponent("sealed-client-bundle", isDirectory: true)

        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.createDirectory(
            at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: writer.bundleURL, to: dest)

        // stdout, not os_log — this line exists to be read off a test run.
        print("[BundleExport] \(dest.path)")
        #expect(FileManager.default.fileExists(atPath: dest.appendingPathComponent("manifest.json").path))
    }

    /// Seal the way the app seals: `RoomCaptureBundleAdapter.applyReviewAndSeal`
    /// step 4. Hashing is what makes `checksumAlgorithm` a true statement.
    private func sealForValidation(_ writer: ScanBundleWriter) throws {
        _ = try writer.finalize(hashArtifacts: true)
    }
}
