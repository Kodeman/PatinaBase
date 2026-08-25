//
//  KeyframeIngestLaneTests.swift
//  PatinaTests
//
//  Pins the client dense-frame keyframe lane (Rendered Room v2) against the
//  MERGED server contract:
//    • services/scan-modal/.../core/transforms.py :: parse_keyframe_index
//    • services/scan-pipeline/.../patina_scan_worker/keys.py (kind → column/folder)
//    • services/scan-pipeline/.../untar.py (keyframes.tar is untarred)
//
//  These are Simulator-safe: they exercise the ENCODE + INDEX + TAR path against
//  a synthetic pixel buffer. They do NOT prove real ARKit capture — that is the
//  owed device walk (RoomPlan/LiDAR cannot run on the Simulator).
//

import Testing
import Foundation
import CoreVideo
import simd
@testable import Patina

struct KeyframeIngestLaneTests {

    // MARK: - Helpers

    private func makeBundleDir() -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("kf-test-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makePixelBuffer(width: Int, height: Int) -> CVPixelBuffer {
        var pb: CVPixelBuffer?
        let attrs: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ]
        CVPixelBufferCreate(kCFAllocatorDefault, width, height,
                            kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pb)
        let buffer = pb!
        CVPixelBufferLockBaseAddress(buffer, [])
        if let base = CVPixelBufferGetBaseAddress(buffer) {
            memset(base, 128, CVPixelBufferGetBytesPerRow(buffer) * height)
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        return buffer
    }

    /// Column-major simd from a row-major 4x4 given as 16 doubles.
    private func makeTransform() -> simd_float4x4 {
        // A recognizable pose: translation (1, 2, 3), rotation left as identity.
        var m = matrix_identity_float4x4
        m.columns.3 = SIMD4<Float>(1, 2, 3, 1)
        return m
    }

    private func writeOneKeyframe(into bundleURL: URL,
                                  landscapeWidth: Int = 1920,
                                  landscapeHeight: Int = 1440) async -> KeyframeBundleWriter? {
        guard let writer = KeyframeBundleWriter(bundleURL: bundleURL) else { return nil }
        var intr = matrix_identity_float3x3
        intr.columns.0 = SIMD3<Float>(1000, 0, 0)   // fx
        intr.columns.1 = SIMD3<Float>(0, 1000, 0)   // fy
        intr.columns.2 = SIMD3<Float>(960, 720, 1)  // cx, cy
        let snapshot = KeyframeSnapshot(
            pixelBuffer: makePixelBuffer(width: landscapeWidth, height: landscapeHeight),
            cameraTransform: makeTransform(),
            intrinsics: intr,
            imageResolution: CGSize(width: landscapeWidth, height: landscapeHeight),
            timestampSeconds: 1.5,
            frameTimestamp: 42.125,
            sharpness: 2200
        )
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            writer.enqueue(snapshot) { cont.resume() }
        }
        writer.finish()
        return writer
    }

    private func firstIndexLine(_ writer: KeyframeBundleWriter) throws -> [String: Any] {
        let text = try String(contentsOf: writer.indexURL, encoding: .utf8)
        let line = text.split(separator: "\n").first.map(String.init) ?? ""
        let obj = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
        return obj ?? [:]
    }

    // MARK: - The field-for-field contract

    @Test func indexLineMatchesParseKeyframeIndexFieldForField() async throws {
        let bundle = makeBundleDir()
        defer { try? FileManager.default.removeItem(at: bundle) }
        guard let writer = await writeOneKeyframe(into: bundle) else {
            Issue.record("KeyframeBundleWriter could not be created")
            return
        }
        #expect(writer.framesWritten == 1)

        let entry = try firstIndexLine(writer)

        // heicPath — the bundle-relative RGB path (parse_keyframe_index →
        // relativePath). Must live under keyframes/ and end .heic.
        let heicPath = try #require(entry["heicPath"] as? String)
        #expect(heicPath.hasPrefix("keyframes/"))
        #expect(heicPath.hasSuffix(".heic"))

        // width/height — the ENCODED (portrait) extent. A 1920x1440 landscape
        // buffer rotated .right becomes 1440x1920 portrait.
        let width = try #require(entry["width"] as? Int)
        let height = try #require(entry["height"] as? Int)
        #expect(width == 1440)
        #expect(height == 1920)

        // intrinsics.{fx,fy,cx,cy,imageWidth,imageHeight} in the NATIVE landscape
        // frame — imageWidth/imageHeight are the names parse_keyframe_index reads.
        let intr = try #require(entry["intrinsics"] as? [String: Any])
        #expect((intr["fx"] as? Double) == 1000)
        #expect((intr["fy"] as? Double) == 1000)
        #expect((intr["cx"] as? Double) == 960)
        #expect((intr["cy"] as? Double) == 720)
        #expect((intr["imageWidth"] as? Int) == 1920)
        #expect((intr["imageHeight"] as? Int) == 1440)

        // THE portrait-rotation trigger: parse_keyframe_index /
        // PhotoPose.needs_right_rotation fires iff
        // (width, height) == (intr.imageHeight, intr.imageWidth). This is the
        // whole reason the server's 90°-CW correction applies to keyframes.
        #expect(width == (intr["imageHeight"] as? Int))
        #expect(height == (intr["imageWidth"] as? Int))

        // cameraTransform — flat 16, ROW-major, translation at 3/7/11.
        let transform = try #require(entry["cameraTransform"] as? [Double])
        #expect(transform.count == 16)
        #expect(transform[3] == 1)   // tx
        #expect(transform[7] == 2)   // ty
        #expect(transform[11] == 3)  // tz

        // timestampSeconds — the ordering key parse_keyframe_index sorts on.
        #expect((entry["timestampSeconds"] as? Double) == 1.5)

        // The referenced HEIC actually exists on disk.
        let heicURL = bundle.appendingPathComponent(heicPath)
        #expect(FileManager.default.fileExists(atPath: heicURL.path))
    }

    @Test func summaryIsWrittenWithFiredCount() async throws {
        let bundle = makeBundleDir()
        defer { try? FileManager.default.removeItem(at: bundle) }
        guard let writer = await writeOneKeyframe(into: bundle) else {
            Issue.record("writer nil"); return
        }
        writer.writeSummary(fired: 1, blurRejected: 0, rawBlurFailures: 0,
                            encodeDropped: 0, blurRejectionRatio: 0)
        let obj = try JSONSerialization.jsonObject(
            with: Data(contentsOf: writer.summaryURL)) as? [String: Any]
        #expect((obj?["fired"] as? Int) == 1)
    }

    // MARK: - Tar

    @Test func tarMembersAreNamedForTheKeyframesFolder() async throws {
        let bundle = makeBundleDir()
        defer { try? FileManager.default.removeItem(at: bundle) }
        guard let writer = await writeOneKeyframe(into: bundle) else {
            Issue.record("writer nil"); return
        }
        let heics = writer.heicFiles()
        #expect(heics.count == 1)

        let tarURL = bundle.appendingPathComponent(KeyframeBundleWriter.archiveRelativePath)
        let members = try TarArchive.write(
            entries: TarArchive.bundleEntries(
                directory: KeyframeBundleWriter.directoryName, files: heics),
            to: tarURL
        )
        #expect(members == 1)

        let data = try Data(contentsOf: tarURL)
        // ustar header name field (offset 0, 100 bytes) must be `keyframes/<file>`
        // so it matches the index's heicPath and the worker's member resolver
        // (_SAFE_ARCHIVE_MEMBER = keyframes/...(heic|bin)).
        let nameField = String(bytes: data.prefix(100).prefix { $0 != 0 }, encoding: .utf8) ?? ""
        #expect(nameField.hasPrefix("keyframes/"))
        #expect(nameField.hasSuffix(".heic"))
        // ustar magic at offset 257.
        let magic = String(bytes: data[257..<262], encoding: .utf8)
        #expect(magic == "ustar")
        // Two zero blocks terminate the archive.
        #expect(data.count >= 1024)
        #expect(data.suffix(1024).allSatisfy { $0 == 0 })
    }

    // MARK: - Manifest / enum contract

    /// The enum raw values ARE the wire contract: `keys.py` KIND_TO_URL_COLUMN /
    /// KIND_TO_FOLDER key on exactly these strings.
    @Test func artifactKindRawValuesMatchTheServer() {
        #expect(ScanManifest.ArtifactKind.keyframesArchive.rawValue == "keyframesArchive")
        #expect(ScanManifest.ArtifactKind.keyframeIndex.rawValue == "keyframeIndex")
        #expect(ScanManifest.ArtifactKind.keyframeSummary.rawValue == "keyframeSummary")
    }

    @Test func manifestRoundTripsTheThreeKeyframeKinds() throws {
        let kinds: [ScanManifest.ArtifactKind] = [.keyframesArchive, .keyframeIndex, .keyframeSummary]
        let artifacts = kinds.map {
            ScanManifest.Artifact(kind: $0, relativePath: "keyframes/x", sizeBytes: 1, mimeType: "application/octet-stream")
        }
        var manifest = ScanManifest(
            scanId: UUID(),
            device: .init(model: "test", osVersion: "18", hasLidar: true),
            artifacts: artifacts
        )
        manifest.artifacts = artifacts

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(manifest)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(ScanManifest.self, from: data)

        #expect(Set(decoded.artifacts.map { $0.kind }) == Set(kinds))
    }
}
