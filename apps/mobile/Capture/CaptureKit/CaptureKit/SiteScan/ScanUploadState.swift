//  ScanUploadState.swift
//  CaptureKit
//
//  Per-artifact upload state + the pure resume planner for the resumable site-scan
//  upload (Field Capture P1 · item 8, Part 3). Persisted in the durable
//  `ScanUploadRecord` @Model so a relaunch resumes the SAME scanID and skips
//  already-uploaded artifacts instead of minting a new `room_scans` row (the
//  orphan hazard the audit flagged). The planner is pure — unit-tested.

import Foundation

/// One artifact's upload progress (mirrors the client `ArtifactUploadState`).
public struct ScanArtifactUploadState: Codable, Equatable, Sendable {

    public enum Status: String, Codable, Sendable {
        case pending, uploading, uploaded, failed, skipped
    }

    public var kind: String            // ArtifactKind wire string
    public var relativePath: String    // in the bundle dir
    public var mimeType: String
    public var storagePath: String?    // {folder}/{userId}/{scanId}/{filename} once known
    public var remoteUrl: String?      // patched onto the room_scans column
    public var sha256: String?
    public var column: String?         // room_scans URL column, nil if the kind has none
    public var status: Status
    public var attempts: Int
    public var lastError: String?

    public init(kind: String, relativePath: String, mimeType: String,
                storagePath: String? = nil, remoteUrl: String? = nil, sha256: String? = nil,
                column: String? = nil, status: Status = .pending, attempts: Int = 0,
                lastError: String? = nil) {
        self.kind = kind; self.relativePath = relativePath; self.mimeType = mimeType
        self.storagePath = storagePath; self.remoteUrl = remoteUrl; self.sha256 = sha256
        self.column = column; self.status = status; self.attempts = attempts; self.lastError = lastError
    }
}

public enum ScanUploadPlanner {

    /// Artifacts that still need an upload attempt (pending or previously failed) —
    /// the resume set. `uploaded`/`skipped`/`uploading` are excluded.
    public static func pending(_ artifacts: [ScanArtifactUploadState]) -> [ScanArtifactUploadState] {
        artifacts.filter { $0.status == .pending || $0.status == .failed }
    }

    /// Every artifact reached a terminal-success state (uploaded or deliberately
    /// skipped). Empty → not done (nothing to complete — completion gating).
    public static func allDone(_ artifacts: [ScanArtifactUploadState]) -> Bool {
        !artifacts.isEmpty && artifacts.allSatisfy { $0.status == .uploaded || $0.status == .skipped }
    }

    /// Fraction complete (uploaded + skipped) / total, for the F4 progress bar.
    public static func progress(_ artifacts: [ScanArtifactUploadState]) -> Double {
        guard !artifacts.isEmpty else { return 0 }
        let done = artifacts.filter { $0.status == .uploaded || $0.status == .skipped }.count
        return Double(done) / Double(artifacts.count)
    }

    /// Whether a fresh upload attempt may proceed for an artifact — bounded retries
    /// (3), mirroring the client backoff budget.
    public static let maxAttempts = 3
    public static func canAttempt(_ artifact: ScanArtifactUploadState) -> Bool {
        (artifact.status == .pending || artifact.status == .failed) && artifact.attempts < maxAttempts
    }
}
