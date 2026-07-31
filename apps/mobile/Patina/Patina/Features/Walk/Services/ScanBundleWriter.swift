//
//  ScanBundleWriter.swift
//  Patina
//
//  Owns the on-disk bundle for a single scan under
//  Application Support/Scans/{scanId}/. Writes the manifest, accepts
//  artifact files from exporters, appends photo records as they arrive,
//  and finalizes by recomputing sizes + (optionally) sha256s.
//
//  Layout: `Scans/{scanId}/` holds manifest.json plus one file per registered
//  artifact — `defaultFileName(for:)` is the authoritative list — with posed
//  photos and their NDJSON sidecars under `photos/` and per-frame depth under
//  `depth/`.
//

import Foundation
import CryptoKit
import UIKit
import os.log

@MainActor
public final class ScanBundleWriter {

    // MARK: - Paths

    public let scanId: UUID
    public let bundleURL: URL
    public let photosURL: URL
    public let depthURL: URL
    public let manifestURL: URL
    public let photosMetadataURL: URL

    /// Relative path (e.g. "Scans/{scanId}") for persistence in SwiftData.
    public let relativePath: String

    private let fileManager = FileManager.default
    private let logger = Logger(subsystem: "com.patina.app", category: "ScanBundle")
    private let metadataIOQueue = DispatchQueue(label: "com.patina.scan.bundle.metadata", qos: .utility)

    /// In-memory copy of the manifest; persisted on every mutation.
    private var manifest: ScanManifest

    // MARK: - Init

    /// Create (or open) a bundle directory for the given scan.
    public init(
        scanId: UUID,
        roomLocalId: UUID? = nil,
        roomName: String = "Room",
        capture: ScanManifest.CaptureInfo = .init()
    ) throws {
        self.scanId = scanId
        let appSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let root = appSupport.appendingPathComponent("Scans", isDirectory: true)
        let bundle = root.appendingPathComponent(scanId.uuidString, isDirectory: true)
        let photos = bundle.appendingPathComponent("photos", isDirectory: true)
        let depth = bundle.appendingPathComponent("depth", isDirectory: true)

        self.bundleURL = bundle
        self.photosURL = photos
        self.depthURL = depth
        self.manifestURL = bundle.appendingPathComponent("manifest.json")
        self.photosMetadataURL = photos.appendingPathComponent("photos_metadata.ndjson")
        self.relativePath = "Scans/\(scanId.uuidString)"

        try fileManager.createDirectory(at: bundle, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: photos, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: depth, withIntermediateDirectories: true)

        self.manifest = ScanManifest(
            scanId: scanId,
            roomLocalId: roomLocalId,
            roomName: roomName,
            device: Self.currentDeviceInfo(),
            capture: capture
        )

        try writeManifest()
    }

    // MARK: - Device info

    public static func currentDeviceInfo() -> ScanManifest.DeviceInfo {
        ScanManifest.DeviceInfo(
            model: UIDevice.current.model,
            osVersion: UIDevice.current.systemVersion,
            hasLidar: Self.deviceHasLidar()
        )
    }

    public static func deviceHasLidar() -> Bool {
        // RoomCaptureSession.isSupported is effectively a LiDAR + iOS check; we
        // avoid importing RoomPlan here to keep this file framework-light, and
        // the capture service overrides `manifest.device.hasLidar` when it knows
        // better. supportsFrameSemantics(.sceneDepth) is LiDAR-only.
        if #available(iOS 14.0, *) {
            return true
        }
        return false
    }

    // MARK: - Artifact writes

    /// Write an artifact file from raw data and record it in the manifest.
    @discardableResult
    public func writeArtifact(
        kind: ScanManifest.ArtifactKind,
        data: Data,
        mimeType: String,
        fileName: String? = nil,
        computeHash: Bool = false
    ) throws -> ScanManifest.Artifact {
        let resolvedName = fileName ?? defaultFileName(for: kind)
        let fileURL = bundleURL.appendingPathComponent(resolvedName)
        try data.write(to: fileURL, options: .atomic)

        let artifact = ScanManifest.Artifact(
            kind: kind,
            relativePath: resolvedName,
            sizeBytes: data.count,
            sha256: computeHash ? sha256Hex(data) : nil,
            mimeType: mimeType
        )
        upsertArtifact(artifact)
        try writeManifest()
        return artifact
    }

    /// Import an existing file on disk into the bundle (moves it).
    @discardableResult
    public func importArtifact(
        kind: ScanManifest.ArtifactKind,
        sourceURL: URL,
        mimeType: String,
        fileName: String? = nil,
        computeHash: Bool = false
    ) throws -> ScanManifest.Artifact {
        let resolvedName = fileName ?? defaultFileName(for: kind)
        let destURL = bundleURL.appendingPathComponent(resolvedName)
        if fileManager.fileExists(atPath: destURL.path) {
            try fileManager.removeItem(at: destURL)
        }
        try fileManager.moveItem(at: sourceURL, to: destURL)

        let attrs = try fileManager.attributesOfItem(atPath: destURL.path)
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        var hash: String?
        if computeHash, let data = try? Data(contentsOf: destURL) {
            hash = sha256Hex(data)
        }
        let artifact = ScanManifest.Artifact(
            kind: kind,
            relativePath: resolvedName,
            sizeBytes: size,
            sha256: hash,
            mimeType: mimeType
        )
        upsertArtifact(artifact)
        try writeManifest()
        return artifact
    }

    public func artifactURL(for artifact: ScanManifest.Artifact) -> URL {
        bundleURL.appendingPathComponent(artifact.relativePath)
    }

    // MARK: - Photos

    /// Append a photo HEIC (written beside the manifest) and record its
    /// metadata both in the manifest and as a line in photos_metadata.ndjson
    /// so nothing is lost if the app is killed mid-scan.
    @discardableResult
    public func appendPhoto(
        _ entry: ScanManifest.PhotoEntry,
        imageData: Data
    ) throws -> URL {
        let fileURL = photosURL.appendingPathComponent(entry.relativePath.replacingOccurrences(of: "photos/", with: ""))
        try imageData.write(to: fileURL, options: .atomic)

        manifest.photos.append(entry)

        // Best-effort: append an NDJSON line for crash-safety.
        try appendPhotoNDJSON(entry)
        try writeManifest()
        return fileURL
    }

    /// Replace the photos list wholesale (used after post-scan scoring).
    public func replacePhotos(_ photos: [ScanManifest.PhotoEntry]) throws {
        manifest.photos = photos
        try writeManifest()
    }

    private func appendPhotoNDJSON(_ entry: ScanManifest.PhotoEntry) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let line = try encoder.encode(entry) + Data("\n".utf8)

        // Create if missing.
        if !fileManager.fileExists(atPath: photosMetadataURL.path) {
            fileManager.createFile(atPath: photosMetadataURL.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: photosMetadataURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
    }

    // MARK: - Environment snapshot

    public func updateCaptureEnvironment(_ environment: ScanManifest.CaptureEnvironment) throws {
        manifest.captureEnvironment = environment
        try writeManifest()
    }

    public func updateRoomName(_ name: String) throws {
        manifest.roomName = name
        try writeManifest()
    }

    public func markHighFidelityDepth(_ enabled: Bool) throws {
        manifest.capture.highFidelityDepthEnabled = enabled
        try writeManifest()
    }

    // MARK: - v3 additive helpers

    /// Persist the user-supplied review-step annotations into the manifest.
    public func setAnnotations(_ annotations: ScanManifest.Annotations) throws {
        manifest.annotations = annotations
        try writeManifest()
    }

    /// Tail-append a newline-terminated NDJSON line to
    /// `depth/depth_index.ndjson`. Mirrors the crash-safe pattern used for
    /// `photos_metadata.ndjson` so a mid-scan kill doesn't lose entries.
    public func appendDepthIndex(_ line: String) throws {
        let indexURL = depthURL.appendingPathComponent("depth_index.ndjson")
        // Ensure parent directory exists (init creates it, but be defensive).
        try fileManager.createDirectory(at: depthURL, withIntermediateDirectories: true)
        if !fileManager.fileExists(atPath: indexURL.path) {
            fileManager.createFile(atPath: indexURL.path, contents: nil)
        }
        let payload = line.hasSuffix("\n") ? line : line + "\n"
        let handle = try FileHandle(forWritingTo: indexURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: Data(payload.utf8))
    }

    /// Enumerate every photo in the manifest that has a thumbnail on disk and
    /// emit one NDJSON line per entry into `photos/photo_thumbnails.ndjson`.
    /// Safe to call repeatedly (rewrites the file from scratch each time).
    ///
    /// DEVICE-LOCAL. The index is written into the bundle and is NOT listed in
    /// `artifacts[]`, because it is never uploaded — and it is never uploaded
    /// because the thumbnail files it indexes are never uploaded either
    /// (`uploadPosedPhotos` sends only full-resolution posed photos). An index
    /// in Storage would name objects that do not exist. Listing it made the
    /// worker fail to resolve the kind at all — `keys.KIND_TO_FOLDER` has no
    /// `photoThumbnails` entry — so ingest skipped the fetch and the validator
    /// named `MISSING_FILE` against the manifest. Every field of a line
    /// (`photoId`, `thumbnailRelativePath`, `sizeBytes`) is already in
    /// `manifest.photos`, so the server loses nothing.
    public func registerPhotoThumbnailsIndex() throws {
        let indexURL = photosURL.appendingPathComponent("photo_thumbnails.ndjson")

        var buffer = Data()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        struct Line: Codable {
            let photoId: String
            let thumbnailRelativePath: String
            let sizeBytes: Int
        }

        for photo in manifest.photos {
            guard let thumb = photo.thumbnailRelativePath else { continue }
            let size = photo.thumbnailSizeBytes ?? 0
            let line = Line(
                photoId: photo.id.uuidString,
                thumbnailRelativePath: thumb,
                sizeBytes: size
            )
            let encoded = try encoder.encode(line)
            buffer.append(encoded)
            buffer.append(Data("\n".utf8))
        }

        try fileManager.createDirectory(at: photosURL, withIntermediateDirectories: true)
        try buffer.write(to: indexURL, options: .atomic)
    }

    // MARK: - Instrument layer (capture-bundle-spec-v1 §3.2–§3.5)

    /// Fold the seven instrument keys into the manifest and persist it.
    ///
    /// Call this IMMEDIATELY BEFORE `finalize(hashArtifacts: true)`, from the
    /// seal path and nowhere else: `checksumAlgorithm: "sha256"` is a claim
    /// about the artifact hashes, and `finalize` is what computes them — written
    /// at freeze it would sit on disk describing hashes that did not exist. That
    /// same `finalize` rewrites the manifest, so a layer applied here reaches
    /// the sealed bytes without a second pass.
    ///
    /// It writes no new FILE into the bundle. Field persists `scorecard.json`
    /// and `anchors.json` alongside the manifest; Patina deliberately does not,
    /// because what the bundle contains is what eventually leaves the phone
    /// when the user asks for design services, and that payload is the user's
    /// call (`RoomUploadService.holdLocally`). Everything the server needs is a
    /// manifest FIELD, and manifest.json already ships.
    ///
    /// The derived scalars are computed by `ScanManifest.apply(_:)` — see there.
    public func applyInstrumentLayer(_ layer: ScanManifest.InstrumentLayer) throws {
        manifest.apply(layer)
        try writeManifest()
    }

    // MARK: - Finalize

    /// Close out the bundle. Recomputes sizes, stamps `completedAt`, and writes
    /// the final manifest. Call from `didEndWith`.
    ///
    /// manifest.json is NOT among the artifacts refreshed here, and is not an
    /// entry in the list at all — see `upsertArtifact` and
    /// `ArtifactUploader.routing(for:)`. It is uploaded from
    /// `ArtifactUploader.uploadPlan(for:in:)`, which measures it after this
    /// method has written it for the last time.
    @discardableResult
    public func finalize(
        completedAt: Date = Date(),
        hashArtifacts: Bool = false
    ) throws -> ScanManifest {
        manifest.completedAt = completedAt

        // Recompute artifact sizes (files may have been rewritten in place).
        var refreshed: [ScanManifest.Artifact] = []
        for artifact in manifest.artifacts {
            let url = bundleURL.appendingPathComponent(artifact.relativePath)
            let attrs = try? fileManager.attributesOfItem(atPath: url.path)
            var copy = artifact
            copy.sizeBytes = (attrs?[.size] as? NSNumber)?.intValue ?? artifact.sizeBytes
            if hashArtifacts, let data = try? Data(contentsOf: url) {
                copy.sha256 = sha256Hex(data)
            }
            refreshed.append(copy)
        }
        manifest.artifacts = refreshed

        try writeManifest()
        return manifest
    }

    // MARK: - Current snapshot

    public func currentManifest() -> ScanManifest {
        manifest
    }

    public func totalBundleSize() -> Int {
        var total = 0
        if let enumerator = fileManager.enumerator(at: bundleURL, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let url as URL in enumerator {
                if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    total += size
                }
            }
        }
        return total
    }

    // MARK: - Cleanup

    /// Remove the entire bundle directory. Called by the sync service after a
    /// successful full upload.
    public func deleteBundle() throws {
        if fileManager.fileExists(atPath: bundleURL.path) {
            try fileManager.removeItem(at: bundleURL)
        }
    }

    // MARK: - Private

    private func defaultFileName(for kind: ScanManifest.ArtifactKind) -> String {
        switch kind {
        case .usdz: return "scan.usdz"
        case .capturedRoomJson: return "captured_room.json"
        case .worldMap: return "world_map.arworldmap"
        case .mesh: return "mesh.ply"
        case .depthArchive: return "depth.zip"
        case .heroThumbnail: return "hero_thumbnail.heic"
        case .bundleArchive: return "bundle.zip"
        // v3 additive kinds.
        case .coverageHeatmap: return "coverage_heatmap.json"
        case .depthIndex: return "depth/depth_index.ndjson"
        case .photoThumbnails: return "photos/photo_thumbnails.ndjson"
        case .annotations: return "annotations.json"
        // `.photosManifest` points at the existing NDJSON. `.bundleManifest`
        // names the root manifest, but is never registered through here —
        // `upsertArtifact` refuses it (the list cannot contain itself); the
        // uploader adds it from `ArtifactUploader.uploadPlan(for:in:)`.
        case .bundleManifest: return "manifest.json"
        case .photosManifest: return "photos/photos_metadata.ndjson"
        }
    }

    /// The ONLY path by which anything enters `manifest.artifacts`.
    ///
    /// It refuses any kind that will not be present in Storage
    /// (`ArtifactUploader.isManifestListed`). `artifacts[]` is a promise to the
    /// server: the validator fetches every entry and names `MISSING_FILE` for
    /// each one it cannot find, which is fatal on the second ingest attempt.
    /// So the promise is kept here, at the one place it can be made, rather
    /// than by every producer remembering.
    ///
    /// Dropping is deliberately the failure direction. A producer that
    /// registers an unroutable kind then yields a VALID bundle missing one
    /// optional entry, instead of a permanently-parked scan.
    private func upsertArtifact(_ artifact: ScanManifest.Artifact) {
        guard ArtifactUploader.isManifestListed(artifact.kind) else {
            logger.debug(
                "not listing \(artifact.kind.rawValue, privacy: .public) in artifacts[] — it does not reach Storage under its own key"
            )
            return
        }
        if let idx = manifest.artifacts.firstIndex(where: { $0.kind == artifact.kind }) {
            manifest.artifacts[idx] = artifact
        } else {
            manifest.artifacts.append(artifact)
        }
    }

    private func writeManifest() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(manifest)
        try data.write(to: manifestURL, options: .atomic)
    }

    private func sha256Hex(_ data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

/// The posed-photo sidecar producer. `photosManifest` was declared as an
/// `ArtifactKind` with a `room_scans` column waiting for it (00082) but had no
/// producer, so `photos_manifest_url` was NULL on every row.
///
/// Its sibling `bundleManifest` is produced too — but not here, and not as an
/// `artifacts[]` entry: manifest.json is the list, so it cannot be in it.
/// `ArtifactUploader.uploadPlan(for:in:)` appends it at upload time, which is
/// also the first moment its sha256 can be true. Rationale:
/// `ScanBundleManifestProducerTests`.
extension ScanBundleWriter {

    /// Rewrite `photos/photos_metadata.ndjson` from the sealed photo list and
    /// register it as `.photosManifest` — "one line per posed photo with pose +
    /// intrinsics" (00082). `appendPhoto` also appends here live for crash
    /// safety, but that tail predates the review step and can disagree on
    /// hero/order/caption; the line COUNT is the same either way, and that is
    /// what `confirm-scan-bundle` cross-checks against `room_scan_images`.
    public func registerPhotosManifest() throws {
        guard !manifest.photos.isEmpty else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        var buffer = Data()
        for photo in manifest.photos {
            buffer.append(try encoder.encode(photo))
            buffer.append(Data("\n".utf8))
        }
        try fileManager.createDirectory(at: photosURL, withIntermediateDirectories: true)
        try buffer.write(to: photosMetadataURL, options: .atomic)
        upsertArtifact(
            ScanManifest.Artifact(
                kind: .photosManifest,
                relativePath: "photos/photos_metadata.ndjson",
                sizeBytes: buffer.count,
                sha256: sha256Hex(buffer),
                mimeType: "application/x-ndjson"
            )
        )
        try writeManifest()
    }

}

// The read side — `readManifest(at:)` / `readArtifactData(_:in:)` — lives in
// `ScanBundleWriter+Reading.swift`. It moved when this file reached SwiftLint's
// 500-line gate, and it is the right seam to cut on: both are `static`, neither
// touches the writer's private state, and their caller is the sync service
// asking what is left to upload rather than anything writing a bundle.
