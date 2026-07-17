//  FieldManifestAssembler.swift
//  CaptureKit
//
//  Assembles `manifest.json` at finish() (Field Capture P1 · item 8, spec §3). It
//  discovers the artifacts the recorders actually wrote into the bundle dir, stream-
//  hashes each (SHA-256, background — never load-whole-file), and writes a
//  deterministic manifest (sorted keys + stable artifact order) that
//  `scripts/validate_capture_bundle.py` accepts. UNVERIFIED is derived once via
//  `AnchorGate.isUnverified`. Pure — unit-tested against a synthetic bundle dir.
//
//  Artifact-path NOTE (spec-delta for item-8 sync): Field's posed-photo sidecar is
//  `photos_metadata.json` (a top-level JSON array of FieldPhotoEntry, item 3/I76),
//  not the spec §4 `photos/photos_metadata.ndjson`. The `photosManifest` artifact
//  points at the real file; the validator's photos-parity check is updated to match.

import Foundation

public enum FieldManifestAssembler {

    /// The recorder-derived inputs the assembler can't read off disk.
    public struct Inputs: Sendable {
        public var scanId: String
        public var roomName: String
        public var createdAt: String
        public var completedAt: String
        public var anchors: [AnchorRecord]
        public var scorecard: Scorecard
        public var device: FieldScanManifest.Device
        public var capture: FieldScanManifest.Capture
        public var session: FieldScanManifest.Session
        public var poseGraphSummary: FieldScanManifest.PoseGraphSummary
        public var captureEnvironment: FieldScanManifest.CaptureEnvironment
        public var annotations: FieldScanManifest.Annotations
        public var photos: [FieldPhotoEntry]

        public init(scanId: String, roomName: String, createdAt: String, completedAt: String,
                    anchors: [AnchorRecord], scorecard: Scorecard,
                    device: FieldScanManifest.Device, capture: FieldScanManifest.Capture,
                    session: FieldScanManifest.Session,
                    poseGraphSummary: FieldScanManifest.PoseGraphSummary,
                    captureEnvironment: FieldScanManifest.CaptureEnvironment,
                    annotations: FieldScanManifest.Annotations, photos: [FieldPhotoEntry]) {
            self.scanId = scanId; self.roomName = roomName
            self.createdAt = createdAt; self.completedAt = completedAt
            self.anchors = anchors; self.scorecard = scorecard
            self.device = device; self.capture = capture; self.session = session
            self.poseGraphSummary = poseGraphSummary
            self.captureEnvironment = captureEnvironment; self.annotations = annotations
            self.photos = photos
        }
    }

    struct Candidate { let path: String; let kind: String; let mime: String }

    /// Candidate artifacts in a STABLE order; the present ones are checksummed. Keys
    /// beyond usdz/capturedRoomJson are optional (validated only when listed).
    static let candidates: [Candidate] = [
        Candidate(path: "scan.usdz", kind: "usdz", mime: "model/vnd.usdz+zip"),
        Candidate(path: "captured_room.json", kind: "capturedRoomJson", mime: "application/json"),
        Candidate(path: "mesh.ply", kind: "mesh", mime: "application/octet-stream"),
        Candidate(path: "depth/depth_index.ndjson", kind: "depthIndex", mime: "application/x-ndjson"),
        Candidate(path: "photos_metadata.json", kind: "photosManifest", mime: "application/json"),
        Candidate(path: "scorecard.json", kind: "scorecard", mime: "application/json"),
        Candidate(path: "anchors.json", kind: "anchors", mime: "application/json"),
        Candidate(path: "keyframes/keyframe_index.ndjson", kind: "keyframeIndex", mime: "application/x-ndjson"),
        Candidate(path: "keyframes/keyframe_summary.json", kind: "keyframeSummary", mime: "application/json")
    ]

    /// Discover + checksum the present artifacts (stable order).
    public static func discoverArtifacts(in dir: URL) -> [ManifestArtifact] {
        candidates.compactMap { candidate in
            let url = dir.appendingPathComponent(candidate.path)
            guard let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int,
                  let sha = BundleChecksum.sha256(ofFile: url) else { return nil }
            return ManifestArtifact(kind: candidate.kind, relativePath: candidate.path,
                                    sizeBytes: size, sha256: sha, mimeType: candidate.mime)
        }
    }

    /// Assemble + write `manifest.json`. Returns the manifest (also for tests).
    @discardableResult
    public static func assemble(bundleDir: URL, inputs: Inputs) throws -> FieldScanManifest {
        let manifest = FieldScanManifest(
            schemaVersion: 3, bundleSpecVersion: 1,
            scanId: inputs.scanId, roomName: inputs.roomName,
            createdAt: inputs.createdAt, completedAt: inputs.completedAt,
            unverified: AnchorGate.isUnverified(anchorCount: inputs.anchors.count),
            checksumAlgorithm: "sha256",
            device: inputs.device, capture: inputs.capture, session: inputs.session,
            anchors: inputs.anchors, scorecard: inputs.scorecard,
            poseGraphSummary: inputs.poseGraphSummary,
            captureEnvironment: inputs.captureEnvironment, annotations: inputs.annotations,
            artifacts: discoverArtifacts(in: bundleDir), photos: inputs.photos)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]     // deterministic key order
        let data = try encoder.encode(manifest)
        try data.write(to: bundleDir.appendingPathComponent("manifest.json"), options: .atomic)
        return manifest
    }
}
