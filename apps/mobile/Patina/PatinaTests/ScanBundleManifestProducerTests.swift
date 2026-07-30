//
//  ScanBundleManifestProducerTests.swift
//  PatinaTests
//
//  Pins the two artifact producers added for the always-NULL `room_scans`
//  columns `bundle_manifest_url` and `photos_manifest_url`.
//
//  `ScanManifest.ArtifactKind` declares 13 kinds; before this branch only 8 had
//  a producer (usdz, capturedRoomJson, worldMap, mesh, depthArchive,
//  coverageHeatmap, depthIndex, photoThumbnails). `.bundleManifest` and
//  `.photosManifest` were never registered by anything, so their columns could
//  only ever be NULL — which also made the claim that annotations are "inlined
//  into the bundle manifest" false, since the manifest itself never shipped.
//
//  The self-pointer is the awkward one: manifest.json is the file that records
//  the artifact list, so registering it inside that list changes it. Its
//  `sizeBytes` is converged by write/measure/restate; its `sha256` is nil
//  forever, because no value can be written into a file that equals the hash of
//  that file and a WRONG hash is worse than none — the uploader stamps it onto
//  the Storage object and merges it into `room_scans.artifacts_sha256`.
//
//  Everything here is filesystem-only. `ScanBundleWriter` has no network
//  dependency at all: registering an artifact writes into
//  `Application Support/Scans/{scanId}/` and nothing else. Transmission happens
//  later and elsewhere, from the explicit design-request flow — the strict-local
//  hold is pinned separately by ScanHoldStateTests, ScanHoldMigratorTests,
//  ScanRecoveryServiceHeldTests and ScanDiskBudgetHeldTests, none of which this
//  branch touches.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanBundleManifestProducerTests {

    // MARK: - Fixtures

    private func makeWriter() throws -> ScanBundleWriter {
        try ScanBundleWriter(scanId: UUID(), roomName: "Test Room")
    }

    private func photo(index: Int) -> ScanManifest.PhotoEntry {
        ScanManifest.PhotoEntry(
            relativePath: "photos/auto_\(index).heic",
            kind: index == 0 ? .hero : .auto,
            capturedAt: Date(timeIntervalSince1970: 1_700_000_000 + Double(index)),
            timestampSeconds: Double(index),
            sizeBytes: 128,
            width: 1024,
            height: 768,
            cameraTransform: Array(repeating: 0.5, count: 16),
            cameraIntrinsics: .init(fx: 1, fy: 1, cx: 0.5, cy: 0.5, width: 1024, height: 768),
            eulerAngles: [0, 0, 0]
        )
    }

    private func manifestFileSize(_ writer: ScanBundleWriter) -> Int {
        let attrs = try? FileManager.default.attributesOfItem(atPath: writer.manifestURL.path)
        return (attrs?[.size] as? NSNumber)?.intValue ?? -1
    }

    // MARK: - .bundleManifest self-pointer

    @Test func finalizeRegistersTheManifestAsItsOwnArtifact() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        #expect(writer.currentManifest().artifacts.contains { $0.kind == .bundleManifest } == false)

        let sealed = try writer.finalize()
        let pointer = sealed.artifacts.first { $0.kind == .bundleManifest }

        #expect(pointer != nil)
        #expect(pointer?.relativePath == "manifest.json")
        #expect(pointer?.mimeType == "application/json")
    }

    /// The converged size: what the file says about itself is what the file is.
    /// A stale-by-a-few-bytes number would be the kind of plausible wrong value
    /// that gets trusted later.
    @Test func manifestPointerStatesItsOwnSizeOnDisk() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.appendPhoto(photo(index: 0), imageData: Data(repeating: 0xA1, count: 128))
        let sealed = try writer.finalize()

        let pointer = try #require(sealed.artifacts.first { $0.kind == .bundleManifest })
        #expect(pointer.sizeBytes == manifestFileSize(writer))
        #expect(pointer.sizeBytes > 0)
    }

    /// A self-hash is impossible, so it must be absent rather than wrong —
    /// including on the `hashArtifacts: true` path the seal actually uses.
    @Test func manifestPointerNeverCarriesASha256EvenWhenHashingIsOn() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.writeArtifact(
            kind: .capturedRoomJson,
            data: Data(#"{"walls":[]}"#.utf8),
            mimeType: "application/json"
        )
        let sealed = try writer.finalize(hashArtifacts: true)

        let pointer = try #require(sealed.artifacts.first { $0.kind == .bundleManifest })
        #expect(pointer.sha256 == nil)
        // …while a real artifact on the same pass does get hashed, so this is
        // an exclusion and not a broken hashing pass.
        let real = try #require(sealed.artifacts.first { $0.kind == .capturedRoomJson })
        #expect(real.sha256?.count == 64)
    }

    /// Re-sealing must not accumulate duplicate pointers or drift the size.
    @Test func resealingIsIdempotent() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        _ = try writer.finalize()
        let second = try writer.finalize()

        #expect(second.artifacts.filter { $0.kind == .bundleManifest }.count == 1)
        #expect(second.artifacts.first { $0.kind == .bundleManifest }?.sizeBytes == manifestFileSize(writer))
    }

    /// The bytes that will be uploaded must decode — the in-memory manifest is
    /// not what ships, the file is.
    @Test func sealedManifestOnDiskDecodesAndDescribesItself() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.appendPhoto(photo(index: 0), imageData: Data(repeating: 0xB2, count: 64))
        try writer.registerPhotosManifest()
        _ = try writer.finalize(hashArtifacts: true)

        let reloaded = try ScanBundleWriter.readManifest(at: writer.bundleURL)
        let pointer = try #require(reloaded.artifacts.first { $0.kind == .bundleManifest })
        #expect(pointer.sizeBytes == manifestFileSize(writer))
        #expect(reloaded.artifacts.contains { $0.kind == .photosManifest })
        #expect(reloaded.completedAt != nil)
    }

    // MARK: - .photosManifest sidecar

    @Test func photosManifestLineCountMatchesThePhotoCount() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        for i in 0..<3 {
            try writer.appendPhoto(photo(index: i), imageData: Data(repeating: 0xC3, count: 32))
        }
        try writer.registerPhotosManifest()

        let text = try String(contentsOf: writer.photosMetadataURL, encoding: .utf8)
        let lines = text.split(whereSeparator: \.isNewline)
        // This equality is what `confirm-scan-bundle` cross-checks against the
        // `room_scan_images` row count.
        #expect(lines.count == 3)

        let artifact = try #require(writer.currentManifest().artifacts.first { $0.kind == .photosManifest })
        #expect(artifact.relativePath == "photos/photos_metadata.ndjson")
        #expect(artifact.mimeType == "application/x-ndjson")
        #expect(artifact.sha256?.count == 64)
        let onDisk = (try? FileManager.default.attributesOfItem(atPath: writer.photosMetadataURL.path))
        #expect(artifact.sizeBytes == (onDisk?[.size] as? NSNumber)?.intValue)
    }

    /// The live-appended tail predates the review step; the registered sidecar
    /// must reflect the SEALED photo list, not the capture-time one.
    @Test func photosManifestRewritesTheCaptureTimeTail() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        let entry = photo(index: 0)
        try writer.appendPhoto(entry, imageData: Data(repeating: 0xD4, count: 16))

        var reviewed = entry
        reviewed.isUserSelectedHero = true
        reviewed.userAnnotation = "the good corner"
        try writer.replacePhotos([reviewed])
        try writer.registerPhotosManifest()

        let text = try String(contentsOf: writer.photosMetadataURL, encoding: .utf8)
        #expect(text.contains("the good corner"))
        #expect(text.split(whereSeparator: \.isNewline).count == 1)
    }

    /// No photos → no 0-byte object and no column that says nothing.
    @Test func photosManifestIsNotRegisteredWhenThereAreNoPhotos() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.registerPhotosManifest()

        #expect(writer.currentManifest().artifacts.contains { $0.kind == .photosManifest } == false)
    }

    // MARK: - Locality

    /// Everything sealing produces is a file inside the bundle directory. This
    /// is as close as a unit test gets to the strict-local hold: the writer has
    /// no client, no session and no network seam, so registering an artifact
    /// cannot move a byte off the device.
    @Test func everyRegisteredArtifactIsAFileInsideTheBundle() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.writeArtifact(kind: .usdz, data: Data(repeating: 0xE5, count: 256), mimeType: "model/vnd.usdz+zip")
        try writer.appendPhoto(photo(index: 0), imageData: Data(repeating: 0xF6, count: 64))
        try writer.registerPhotosManifest()
        let sealed = try writer.finalize(hashArtifacts: true)

        let bundlePath = writer.bundleURL.standardizedFileURL.path
        for artifact in sealed.artifacts {
            let url = writer.bundleURL.appendingPathComponent(artifact.relativePath).standardizedFileURL
            #expect(url.path.hasPrefix(bundlePath), "\(artifact.kind.rawValue)")
            #expect(FileManager.default.fileExists(atPath: url.path), "\(artifact.kind.rawValue)")
        }
    }
}
