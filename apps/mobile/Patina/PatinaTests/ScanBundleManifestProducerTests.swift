//
//  ScanBundleManifestProducerTests.swift
//  PatinaTests
//
//  Pins the two producers for the always-NULL `room_scans` columns
//  `bundle_manifest_url` and `photos_manifest_url`, and — the part these tests
//  originally got wrong — WHERE each one's record belongs.
//
//  `.photosManifest` is an artifact: a file beside the manifest, uploaded under
//  its own key, listed in `artifacts[]`.
//
//  `.bundleManifest` is not. manifest.json is the artifact list, so it cannot
//  be an entry in itself, and the earlier attempt to make it one was
//  unsatisfiable rather than merely awkward: the self-entry converged its
//  `sizeBytes` but left `sha256` nil forever, while the server-side validator
//  (`scripts/validate_capture_bundle.py` §10.5) requires a 64-hex sha256 on
//  EVERY listed artifact and raises `SCHEMA_VIOLATION` without one —
//  a token in the worker's `PERMANENT_TOKENS`, i.e. parked on attempt 1 with no
//  retry. Two real client scans (`fa361ed4…`, `d995df8a…`) died of it.
//
//  So the manifest is uploaded WITHOUT being listed, exactly as Patina Field
//  does it (`FieldManifestAssembler.candidates` omits manifest.json;
//  `ScanUploadDescriptor.all` uploads it): `ArtifactUploader.uploadPlan(for:in:)`
//  appends it to whatever the manifest lists, which is also the first moment its
//  sha256 can be TRUE — measured off the finished file rather than written into
//  it. `bundle_manifest_url` is still patched, by the same generic
//  `scanColumn(for:)` PATCH that handles every other kind.
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
import CryptoKit
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

    // MARK: - .bundleManifest is uploaded, never listed

    /// The list does not contain itself. A self-entry is not merely redundant:
    /// it is the one entry whose `sha256` can never be filled in, and the
    /// validator rejects any listed artifact without one.
    @Test func sealingNeverListsTheManifestAsAnArtifactOfItself() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.writeArtifact(
            kind: .capturedRoomJson,
            data: Data(#"{"walls":[]}"#.utf8),
            mimeType: "application/json"
        )
        let sealed = try writer.finalize(hashArtifacts: true)

        #expect(sealed.artifacts.contains { $0.kind == .bundleManifest } == false)
        // …and the file on disk agrees, which is the copy that ships.
        let reloaded = try ScanBundleWriter.readManifest(at: writer.bundleURL)
        #expect(reloaded.artifacts.contains { $0.kind == .bundleManifest } == false)
    }

    /// Not listing it must not stop it shipping. The upload plan carries
    /// manifest.json, so `bundle_manifest_url` is still patched — the NULL that
    /// column used to hold is what parked both production scans at
    /// `MISSING_MANIFEST`.
    @Test func theUploadPlanCarriesTheManifestAndItsColumn() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.writeArtifact(kind: .usdz, data: Data(repeating: 0xA1, count: 64),
                                 mimeType: "model/vnd.usdz+zip")
        let sealed = try writer.finalize(hashArtifacts: true)

        let plan = ArtifactUploader.uploadPlan(for: sealed, in: writer.bundleURL)
        let entry = try #require(plan.first { $0.kind == .bundleManifest })

        #expect(entry.relativePath == "manifest.json")
        #expect(entry.mimeType == "application/json")
        // The three facts that make the PATCH happen, end to end.
        #expect(ArtifactUploader.scanColumn(for: .bundleManifest) == "bundle_manifest_url")
        #expect(ArtifactUploader.storagePathComponents(for: entry)?.folder == "manifests")
        #expect(ArtifactUploader.storagePathComponents(for: entry)?.filename == "manifest.json")
    }

    /// The hash a self-entry could never carry. Measured off the finished file
    /// at upload time, so it is both present and correct — the thing a written
    /// value could not be.
    @Test func theManifestUploadEntryCarriesARealSha256AndSize() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.appendPhoto(photo(index: 0), imageData: Data(repeating: 0xA1, count: 128))
        let sealed = try writer.finalize(hashArtifacts: true)

        let entry = try #require(
            ArtifactUploader.uploadPlan(for: sealed, in: writer.bundleURL)
                .first { $0.kind == .bundleManifest }
        )
        #expect(entry.sizeBytes == manifestFileSize(writer))
        #expect(entry.sizeBytes > 0)

        let bytes = try Data(contentsOf: writer.manifestURL)
        #expect(entry.sha256?.count == 64)
        #expect(entry.sha256 == SHA256.hash(data: bytes)
            .map { String(format: "%02x", $0) }.joined())
    }

    /// Re-sealing must not accumulate entries or drift a size.
    @Test func resealingIsIdempotent() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.writeArtifact(kind: .usdz, data: Data(repeating: 0xA1, count: 64),
                                 mimeType: "model/vnd.usdz+zip")
        _ = try writer.finalize()
        let second = try writer.finalize()

        #expect(second.artifacts.filter { $0.kind == .usdz }.count == 1)
        #expect(second.artifacts.contains { $0.kind == .bundleManifest } == false)

        let plan = ArtifactUploader.uploadPlan(for: second, in: writer.bundleURL)
        #expect(plan.filter { $0.kind == .bundleManifest }.count == 1)
        #expect(plan.first { $0.kind == .bundleManifest }?.sizeBytes == manifestFileSize(writer))
    }

    /// The bytes that will be uploaded must decode — the in-memory manifest is
    /// not what ships, the file is.
    @Test func sealedManifestOnDiskDecodesAndListsItsRealArtifacts() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        try writer.appendPhoto(photo(index: 0), imageData: Data(repeating: 0xB2, count: 64))
        try writer.registerPhotosManifest()
        _ = try writer.finalize(hashArtifacts: true)

        let reloaded = try ScanBundleWriter.readManifest(at: writer.bundleURL)
        #expect(reloaded.artifacts.contains { $0.kind == .photosManifest })
        #expect(reloaded.completedAt != nil)
        // Every entry hashed — the validator requires a 64-hex sha256 on each.
        for artifact in reloaded.artifacts {
            #expect(artifact.sha256?.count == 64, "\(artifact.kind.rawValue)")
        }
    }

    // MARK: - Device-local files are written but never listed

    /// The thumbnail index is still produced (it is a real local file); it is
    /// simply not promised to the server, because its own contents point at
    /// thumbnail files that `uploadPosedPhotos` never uploads.
    @Test func thePhotoThumbnailIndexIsWrittenToDiskButNotListed() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        var entry = photo(index: 0)
        entry.thumbnailRelativePath = "photos/auto_0_thumb.heic"
        entry.thumbnailSizeBytes = 12
        try writer.appendPhoto(entry, imageData: Data(repeating: 0xC3, count: 32))
        try writer.registerPhotoThumbnailsIndex()

        let indexURL = writer.photosURL.appendingPathComponent("photo_thumbnails.ndjson")
        #expect(FileManager.default.fileExists(atPath: indexURL.path))
        #expect(writer.currentManifest().artifacts.contains { $0.kind == .photoThumbnails } == false)
    }

    /// The single gate. Any producer — present or future — that tries to list a
    /// kind whose bytes do not reach Storage is refused at the one place an
    /// entry can be made, rather than by every producer remembering.
    @Test func theWriterRefusesToListAKindThatDoesNotReachStorage() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        for kind in ScanManifest.ArtifactKind.allCases
        where !ArtifactUploader.isManifestListed(kind) {
            _ = try writer.writeArtifact(
                kind: kind,
                data: Data(repeating: 0xD4, count: 8),
                mimeType: "application/octet-stream",
                fileName: "unlistable_\(kind.rawValue).bin"
            )
            #expect(
                writer.currentManifest().artifacts.contains { $0.kind == kind } == false,
                "\(kind.rawValue) reached artifacts[] but has no storage route"
            )
        }
    }

    // MARK: - .photosManifest sidecar

    @Test func photosManifestLineCountMatchesThePhotoCount() throws {
        let writer = try makeWriter()
        defer { try? writer.deleteBundle() }

        for index in 0..<3 {
            try writer.appendPhoto(photo(index: index), imageData: Data(repeating: 0xC3, count: 32))
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
