//
//  ScanBundleStorageResolutionTests.swift
//  PatinaTests
//
//  THE bundle-validity invariant, exercised on a real bundle rather than on the
//  routing table alone:
//
//      every entry in manifest.artifacts[] resolves to an object the worker
//      can fetch.
//
//  `ArtifactRoutingTests` pins this per KIND. These pin it per BUNDLE — the
//  writer is driven the way `RoomCaptureBundleAdapter.freezeBundleArtifacts` +
//  `applyReviewAndSeal` drive it on a real scan, the bundle is sealed, and the
//  sealed manifest is then checked against what the uploader will actually PUT.
//  A kind-level table can be right while a producer still slips something past
//  it; the fatal bundles that motivated this work were producer bugs.
//
//  Why the invariant is fatal to break, in the server's own terms: the scan
//  worker's ingest stage fetches every listed artifact, then runs the vendored
//  `scripts/validate_capture_bundle.py`. An entry with no object behind it is
//  `MISSING_FILE` (fatal on the 2nd attempt, `TRANSIENT_UNTIL_ATTEMPTS = 2`);
//  an entry with no 64-hex `sha256` is `SCHEMA_VIOLATION`, which is in
//  `PERMANENT_TOKENS` and parks the task on attempt 1 with no retry at all.
//
//  The last test also EXPORTS the sealed bundle into the test host's tmp dir so
//  the reference validator can be run against the exact bytes the writer
//  produces — see its comment for the command.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanBundleStorageResolutionTests {

    /// Where `sealedRealisticBundle` leaves a copy for the reference validator.
    static let exportDirName = "validator-export"

    /// Build the bundle a real scan builds. Mirrors the freeze order in
    /// `RoomCaptureBundleAdapter.freezeBundleArtifacts` (captured room, USDZ,
    /// world map, mesh, coverage heatmap, depth archive, thumbnail index) and
    /// the seal in `applyReviewAndSeal` (photos manifest, then finalize).
    private func sealedRealisticBundle() throws -> ScanBundleWriter {
        let writer = try ScanBundleWriter(scanId: UUID(), roomName: "Living Room")

        try writer.writeArtifact(
            kind: .capturedRoomJson,
            data: Data(#"{"walls":[],"doors":[],"windows":[],"openings":[],"objects":[]}"#.utf8),
            mimeType: "application/json")
        try writer.writeArtifact(
            kind: .usdz,
            data: Data(repeating: 0xA1, count: 4096),
            mimeType: "model/vnd.usdz+zip")
        try writer.writeArtifact(
            kind: .worldMap,
            data: Data(repeating: 0xA2, count: 512),
            mimeType: "application/octet-stream")
        try writer.writeArtifact(
            kind: .mesh,
            data: Data("ply\nformat ascii 1.0\nelement vertex 0\nend_header\n".utf8),
            mimeType: "model/ply")
        try writer.writeArtifact(
            kind: .coverageHeatmap,
            data: Data(#"{"cells":[]}"#.utf8),
            mimeType: "application/json")

        // Depth: the recorder's index file, then the archive that carries it.
        try writer.appendDepthIndex(#"{"frame":0,"t":0.0}"#)
        try writer.writeArtifact(
            kind: .depthArchive,
            data: Data(repeating: 0xA3, count: 1024),
            mimeType: "application/zip")

        var hero = ScanManifest.PhotoEntry(
            relativePath: "photos/auto_0.heic",
            kind: .hero,
            capturedAt: Date(timeIntervalSince1970: 1_700_000_000),
            timestampSeconds: 0,
            sizeBytes: 96,
            width: 4032,
            height: 3024,
            cameraTransform: Array(repeating: 0.5, count: 16),
            cameraIntrinsics: .init(fx: 1, fy: 1, cx: 0.5, cy: 0.5, width: 4032, height: 3024),
            eulerAngles: [0, 0, 0])
        hero.thumbnailRelativePath = "photos/auto_0_thumb.heic"
        hero.thumbnailSizeBytes = 24
        try writer.appendPhoto(hero, imageData: Data(repeating: 0xB1, count: 96))

        try writer.registerPhotoThumbnailsIndex()
        try writer.setAnnotations(.init(roomNotes: "north wall gets the light"))
        try writer.registerPhotosManifest()
        _ = try writer.finalize(hashArtifacts: true)
        return writer
    }

    // MARK: - The invariant

    /// Every listed artifact is a file in the bundle AND has a Storage route.
    /// Those are the two halves of "the worker can fetch it": the uploader can
    /// only PUT bytes it has, and the worker can only GET a key it can derive.
    @Test func everyListedArtifactResolvesToAnObjectTheWorkerCanFetch() throws {
        let writer = try sealedRealisticBundle()
        defer { try? writer.deleteBundle() }

        let sealed = try ScanBundleWriter.readManifest(at: writer.bundleURL)
        #expect(!sealed.artifacts.isEmpty)

        for artifact in sealed.artifacts {
            let fileURL = writer.bundleURL.appendingPathComponent(artifact.relativePath)
            #expect(FileManager.default.fileExists(atPath: fileURL.path),
                    "\(artifact.kind.rawValue): listed but not in the bundle")
            #expect(ArtifactUploader.storagePathComponents(for: artifact) != nil,
                    "\(artifact.kind.rawValue): listed but never uploaded")
            #expect(ArtifactUploader.scanColumn(for: artifact.kind) != nil,
                    "\(artifact.kind.rawValue): uploaded but nothing records its key")
            // §10.5: a listed artifact without a 64-hex sha256 is a permanent
            // SCHEMA_VIOLATION — no retry, the failure mode that shipped.
            #expect(artifact.sha256?.count == 64, "\(artifact.kind.rawValue)")
            #expect(artifact.sizeBytes > 0, "\(artifact.kind.rawValue)")
        }
    }

    /// The three files a real scan writes and never sends. Each exists on disk;
    /// none is promised to the server.
    @Test func theDeviceLocalFilesAreOnDiskAndAbsentFromTheList() throws {
        let writer = try sealedRealisticBundle()
        defer { try? writer.deleteBundle() }

        let sealed = try ScanBundleWriter.readManifest(at: writer.bundleURL)

        for path in ["depth/depth_index.ndjson", "photos/photo_thumbnails.ndjson"] {
            let url = writer.bundleURL.appendingPathComponent(path)
            #expect(FileManager.default.fileExists(atPath: url.path), "\(path)")
        }
        for kind in [ScanManifest.ArtifactKind.depthIndex, .photoThumbnails, .annotations] {
            #expect(sealed.artifacts.contains { $0.kind == kind } == false, "\(kind.rawValue)")
        }
        // annotations reach the server as a FIELD of the manifest, not a file.
        #expect(sealed.annotations.roomNotes == "north wall gets the light")
    }

    /// The upload plan is the manifest's list plus manifest.json — no more, no
    /// less. This is the whole reason removing the self-entry costs nothing.
    @Test func theUploadPlanIsTheListPlusTheManifestItself() throws {
        let writer = try sealedRealisticBundle()
        defer { try? writer.deleteBundle() }

        let sealed = try ScanBundleWriter.readManifest(at: writer.bundleURL)
        let plan = ArtifactUploader.uploadPlan(for: sealed, in: writer.bundleURL)

        #expect(Set(plan.map(\.kind)) == Set(sealed.artifacts.map(\.kind)).union([.bundleManifest]))
        #expect(plan.count == sealed.artifacts.count + 1)

        // Every planned upload has a real file, a real route, and a real hash —
        // including the manifest, whose hash exists only out here.
        for artifact in plan {
            let fileURL = writer.bundleURL.appendingPathComponent(artifact.relativePath)
            #expect(FileManager.default.fileExists(atPath: fileURL.path), "\(artifact.kind.rawValue)")
            #expect(ArtifactUploader.storagePathComponents(for: artifact) != nil, "\(artifact.kind.rawValue)")
            #expect(artifact.sha256?.count == 64, "\(artifact.kind.rawValue)")
        }
    }

    /// A bundle sealed by the SHIPPED build still lists `.depthIndex`,
    /// `.photoThumbnails` and a hash-less `.bundleManifest`. The plan must not
    /// inherit them — in particular it must not carry two `.bundleManifest`
    /// entries, which would double-enqueue the same `(scanId, kind)` upload.
    /// (This does not repair such a bundle; its manifest.json bytes still name
    /// them, so ingest still rejects it until it is re-sealed.)
    @Test func theUploadPlanDropsALegacyBundlesUnuploadableEntries() throws {
        let writer = try sealedRealisticBundle()
        defer { try? writer.deleteBundle() }

        var legacy = try ScanBundleWriter.readManifest(at: writer.bundleURL)
        legacy.artifacts.append(.init(kind: .depthIndex,
                                      relativePath: "depth/depth_index.ndjson",
                                      sizeBytes: 20, sha256: String(repeating: "a", count: 64),
                                      mimeType: "application/x-ndjson"))
        legacy.artifacts.append(.init(kind: .photoThumbnails,
                                      relativePath: "photos/photo_thumbnails.ndjson",
                                      sizeBytes: 20, sha256: String(repeating: "b", count: 64),
                                      mimeType: "application/x-ndjson"))
        legacy.artifacts.append(.init(kind: .bundleManifest,
                                      relativePath: "manifest.json",
                                      sizeBytes: 4321, sha256: nil,
                                      mimeType: "application/json"))

        let plan = ArtifactUploader.uploadPlan(for: legacy, in: writer.bundleURL)

        #expect(plan.filter { $0.kind == .bundleManifest }.count == 1)
        #expect(plan.contains { $0.kind == .depthIndex } == false)
        #expect(plan.contains { $0.kind == .photoThumbnails } == false)
        #expect(plan.first { $0.kind == .bundleManifest }?.sha256?.count == 64)
    }

    // MARK: - Evidence for the reference validator

    /// Seal a realistic bundle and leave a copy where the authoritative checker
    /// can be pointed at it. `scripts/validate_capture_bundle.py` is the same
    /// code the worker vendors, so running it on these bytes is the closest a
    /// local test gets to the gate a real scan hits.
    ///
    ///     xcrun simctl get_app_container <udid> cloud.patina.app data
    ///     python3 scripts/validate_capture_bundle.py \
    ///       "<container>/tmp/validator-export/<scanId>"
    ///
    /// Expected today: the artifact-level checks (§10.4 required kinds, §10.5
    /// per-artifact existence/sha256/size, §10.11 photo parity) all pass, and
    /// the only failures named are the seven INSTRUMENT top-level keys
    /// (`session`, `anchors`, `scorecard`, `poseGraphSummary`, `unverified`,
    /// `checksumAlgorithm`, `bundleSpecVersion`) that a later wave adds. The
    /// client manifest has never carried them — see
    /// `ScanManifestSupersetTests.freshlyBuiltManifestOmitsEveryInstrumentKey`.
    @Test func sealedBundleIsExportedForTheReferenceValidator() throws {
        let writer = try sealedRealisticBundle()
        defer { try? writer.deleteBundle() }

        let exportRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent(Self.exportDirName, isDirectory: true)
        let dest = exportRoot.appendingPathComponent(writer.scanId.uuidString, isDirectory: true)
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.createDirectory(at: exportRoot, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: writer.bundleURL, to: dest)

        // The copy is the subject, so assert against the copy.
        let copied = try ScanBundleWriter.readManifest(at: dest)
        #expect(copied.artifacts.contains { $0.kind == .capturedRoomJson })
        #expect(copied.artifacts.contains { $0.kind == .usdz })
        for artifact in copied.artifacts {
            let url = dest.appendingPathComponent(artifact.relativePath)
            let bytes = try Data(contentsOf: url)
            #expect(bytes.count == artifact.sizeBytes, "\(artifact.kind.rawValue)")
        }
        // §10.11 photo parity: the sidecar's line count is manifest.photos.count.
        let sidecar = try String(
            contentsOf: dest.appendingPathComponent("photos/photos_metadata.ndjson"),
            encoding: .utf8)
        #expect(sidecar.split(whereSeparator: \.isNewline).count == copied.photos.count)
    }
}
