//  ScanUploadDescriptor.swift
//  CaptureKit
//
//  The v1 bundle upload table + the room-scans bucket MIME allow-list (Field Capture
//  P1 · item 8). Lives in CaptureKit so the drift-guard test (`UploadStateTests`) can
//  assert every upload Content-Type is bucket-legal — the contract that broke the M2
//  walk (depthIndex went up as application/x-ndjson → Storage 400 invalid_mime_type).
//
//  TRANSPORT vs SEMANTIC (spec §11 B-17): `contentType` here is the STORAGE TRANSPORT
//  Content-Type — it MUST be in the bucket allow-list, so the two ndjson indexes and
//  the two tars ride as `application/octet-stream`. The manifest's `artifacts[].mimeType`
//  keeps the SEMANTIC type (application/x-ndjson / application/x-tar) — what the file IS,
//  for item 9's parser. The validator never compares mimeType, so the two stay decoupled.

import Foundation

/// One bundle artifact's upload plan. `column` non-nil ⇒ the URL is patched onto that
/// room_scans column (confirm-scan-bundle HEAD-checks those).
public struct ScanUploadDescriptor: Sendable, Equatable {
    public let relativePath: String
    public let kind: String
    public let folder: String
    public let filename: String
    /// Storage TRANSPORT Content-Type — MUST be in `ScanBucketMime.allowed` (00077).
    public let contentType: String
    public let column: String?

    public init(relativePath: String, kind: String, folder: String, filename: String,
                contentType: String, column: String?) {
        self.relativePath = relativePath; self.kind = kind; self.folder = folder
        self.filename = filename; self.contentType = contentType; self.column = column
    }

    /// The full v1 bundle artifact set, stable upload order.
    ///
    /// STORAGE LAYOUT CONTRACT (capture-bundle-spec-v1 **B-18** · §4 "Storage layout"):
    /// this `folder` column is the authoritative kind→folder map — every artifact
    /// PUTs to `{folder}/{userId}/{roomId}/{filename}`. The item-9 scan-pipeline
    /// worker mirrors it in `keys.KIND_TO_FOLDER` (services/scan-pipeline) and
    /// resolves the column-less kinds (`depthIndex`/`scorecard`/`anchors`/
    /// `keyframeIndex`/`keyframeSummary`) by prefix-swap off the manifest key.
    /// Keep this table, B-18, and `KIND_TO_FOLDER` in lockstep.
    public static let all: [ScanUploadDescriptor] = [
        .init(relativePath: "scan.usdz", kind: "usdz", folder: "usdz",
              filename: "scan.usdz", contentType: "model/vnd.usdz+zip", column: "model_url"),
        .init(relativePath: "captured_room.json", kind: "capturedRoomJson", folder: "captured_room",
              filename: "captured_room.json", contentType: "application/json", column: "captured_room_json_url"),
        .init(relativePath: "mesh.ply", kind: "mesh", folder: "mesh",
              filename: "mesh.ply", contentType: "application/octet-stream", column: "mesh_url"),
        .init(relativePath: "manifest.json", kind: "bundleManifest", folder: "manifests",
              filename: "manifest.json", contentType: "application/json", column: "bundle_manifest_url"),
        // Semantic type is application/x-ndjson; TRANSPORT is octet-stream (bucket-legal).
        .init(relativePath: "depth/depth_index.ndjson", kind: "depthIndex", folder: "depth",
              filename: "depth_index.ndjson", contentType: "application/octet-stream", column: nil),
        .init(relativePath: "scorecard.json", kind: "scorecard", folder: "scorecard",
              filename: "scorecard.json", contentType: "application/json", column: nil),
        .init(relativePath: "anchors.json", kind: "anchors", folder: "anchors",
              filename: "anchors.json", contentType: "application/json", column: nil),
        .init(relativePath: "keyframes/keyframe_index.ndjson", kind: "keyframeIndex", folder: "keyframes",
              filename: "keyframe_index.ndjson", contentType: "application/octet-stream", column: nil),
        .init(relativePath: "keyframes/keyframe_summary.json", kind: "keyframeSummary", folder: "keyframes",
              filename: "keyframe_summary.json", contentType: "application/json", column: nil),
        // Transport archives (Part 3) — heavy streams; semantic application/x-tar, but
        // TRANSPORT is octet-stream. Map to the archive columns confirm-scan-bundle checks.
        .init(relativePath: "depth.tar", kind: "depthArchive", folder: "depth",
              filename: "depth.tar", contentType: "application/octet-stream", column: "depth_archive_url"),
        .init(relativePath: "keyframes.tar", kind: "keyframesArchive", folder: "bundle",
              filename: "keyframes.tar", contentType: "application/octet-stream", column: "scan_bundle_url")
    ]
}

public extension ScanUploadDescriptor {
    /// The full local artifact contract. A required file must be a non-empty,
    /// regular file before the client may ask the server to confirm the bundle.
    static func missingRequiredArtifacts(
        in bundleURL: URL,
        fileManager: FileManager = .default
    ) -> [ScanUploadDescriptor] {
        all.filter { descriptor in
            let fileURL = bundleURL.appendingPathComponent(descriptor.relativePath)
            guard fileManager.fileExists(atPath: fileURL.path) else { return true }
            let values = try? fileURL.resourceValues(
                forKeys: [.isRegularFileKey, .fileSizeKey]
            )
            return values?.isRegularFile != true || (values?.fileSize ?? 0) <= 0
        }
    }
}

/// Correlates a background completion to one artifact of one scan. Artifact kind
/// alone is not unique when startup recovery and a foreground upload overlap.
public struct ScanArtifactTransferKey: Hashable, Sendable {
    public let scanID: String
    public let kind: String

    public init(scanID: String, kind: String) {
        self.scanID = scanID
        self.kind = kind
    }
}

/// Persisted identity carried by a background URLSession task. It allows a
/// completion delivered after relaunch to mutate only its original owner’s record.
public struct ScanBackgroundTransferMetadata: Equatable, Sendable {
    public let scanID: String
    public let artifactKind: String
    public let owner: CaptureOwnerIdentity
    public let sha256: String?

    public init(
        scanID: String,
        artifactKind: String,
        owner: CaptureOwnerIdentity,
        sha256: String? = nil
    ) {
        self.scanID = scanID
        self.artifactKind = artifactKind
        self.owner = owner
        self.sha256 = sha256
    }

    public init?(dictionary: [String: String]) {
        guard let scanID = dictionary["scanId"],
              let artifactKind = dictionary["artifactKind"],
              let owner = CaptureOwnerIdentity(
                userID: dictionary["ownerUserId"],
                workspaceID: dictionary["ownerWorkspaceId"]
              ) else { return nil }
        self.init(
            scanID: scanID,
            artifactKind: artifactKind,
            owner: owner,
            sha256: dictionary["sha256"]
        )
    }

    public var dictionary: [String: String] {
        var values = [
            "scanId": scanID,
            "artifactKind": artifactKind,
            "ownerUserId": owner.userID,
            "ownerWorkspaceId": owner.workspaceID
        ]
        if let sha256, !sha256.isEmpty { values["sha256"] = sha256 }
        return values
    }
}

public enum ScanArtifactIntegrityError: LocalizedError, Equatable {
    case missingRequiredArtifacts([String])

    public var transferPhase: CaptureTransferPhase { .rejected }

    public var errorDescription: String? {
        switch self {
        case .missingRequiredArtifacts(let kinds):
            return "Scan bundle is incomplete (missing: "
                + "\(kinds.joined(separator: ", "))). Review or rescan "
                + "before retrying."
        }
    }
}

/// Pinned copy of the `room-scans` bucket `allowed_mime_types` —
/// supabase/migrations/00077_advanced_room_scan.sql. Storage returns a deterministic
/// 400 `invalid_mime_type` on any upload Content-Type outside this set (and the retry
/// policy treats 400 as terminal). Keep in lockstep with 00077 (and any later migration
/// that re-sets the room-scans allow-list); the drift-guard test enforces membership.
public enum ScanBucketMime {
    public static let allowed: Set<String> = [
        "model/vnd.usdz+zip",
        "model/gltf+json",
        "model/gltf-binary",
        "model/ply",
        "application/octet-stream",
        "application/json",
        "application/zip",
        "image/heic",
        "image/jpeg",
        "image/png",
        "image/x-exr"
    ]
}
