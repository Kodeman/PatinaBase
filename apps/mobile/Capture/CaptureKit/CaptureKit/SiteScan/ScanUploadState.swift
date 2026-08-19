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
    public var storagePath: String?    // {folder}/{userId}/{roomId}/{filename} once known
    public var remoteUrl: String?      // patched onto the room_scans column
    public var sha256: String?
    public var column: String?         // room_scans URL column, nil if the kind has none
    public var status: Status
    public var attempts: Int
    public var lastError: String?

    // MARK: - R2 shadow leg
    //
    // Outcome of the `field.scanUploadShadowR2` leg for this artifact
    // (`FieldScanUploadShadowLeg`). Device-local only — this struct is JSON
    // inside the durable `ScanUploadRecord` @Model, so recording the shadow here
    // costs no migration and cannot reach a server that is not meant to hear
    // about it yet.
    //
    // This is the home rather than `FieldScanManifest` because `manifest.json`
    // IS an uploaded artifact (descriptor kind `bundleManifest`, column
    // `bundle_manifest_url`): its bytes are hashed at upload time, merged
    // server-side via `merge_scan_artifact_sha256`, and HEAD-checked by
    // `confirm-scan-bundle`. Writing a shadow result into it would mutate a file
    // whose checksum has already been declared, and would ship a measurement the
    // dormancy contract says no server hears yet.
    //
    // All three are OPTIONAL so a record written by an earlier build still
    // decodes, and nil is a real third state: the leg was never ATTEMPTED
    // (toggle off, no `EDGE_API_URL`, artifact over the size cap, or a kind the
    // interface has no name for) as opposed to attempted and failed.

    /// True once the shadow upload reached a confirmed registry row.
    public var shadowUploaded: Bool?
    /// The digest the shadow leg computed off disk and declared to the intent.
    public var shadowSha256: String?
    /// Whether the confirmed digest came back equal to `shadowSha256` — the
    /// leg's whole point, since the primary path only ever compares against the
    /// sha it sent in its own `x-metadata` header.
    public var shadowMatched: Bool?

    public init(kind: String, relativePath: String, mimeType: String,
                storagePath: String? = nil, remoteUrl: String? = nil, sha256: String? = nil,
                column: String? = nil, status: Status = .pending, attempts: Int = 0,
                lastError: String? = nil, shadowUploaded: Bool? = nil,
                shadowSha256: String? = nil, shadowMatched: Bool? = nil) {
        self.kind = kind; self.relativePath = relativePath; self.mimeType = mimeType
        self.storagePath = storagePath; self.remoteUrl = remoteUrl; self.sha256 = sha256
        self.column = column; self.status = status; self.attempts = attempts; self.lastError = lastError
        self.shadowUploaded = shadowUploaded
        self.shadowSha256 = shadowSha256
        self.shadowMatched = shadowMatched
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

    /// Required confirmation gate: every declared kind must have a durable
    /// `.uploaded` state. A subset (or a deliberately skipped artifact) is never
    /// sufficient for a successful scan receipt.
    public static func allRequiredUploaded(
        _ requiredKinds: [String],
        existing: [ScanArtifactUploadState]
    ) -> Bool {
        guard !requiredKinds.isEmpty else { return false }
        let uploaded = Set(existing.filter { $0.status == .uploaded }.map(\.kind))
        return requiredKinds.allSatisfy(uploaded.contains)
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

    /// From the full artifact kind set + the durable states, the kinds still to
    /// upload (never uploaded, or previously failed) — the upload PLAN. Skips kinds
    /// already `uploaded` (a resume). Fresh record ⇒ every kind; complete ⇒ empty.
    public static func kindsToUpload(all: [String], existing: [ScanArtifactUploadState]) -> [String] {
        let done = Set(existing.filter { $0.status == .uploaded }.map(\.kind))
        return all.filter { !done.contains($0) }
    }

    /// The rehydration decision on relaunch / re-entry: keep uploading, confirm the
    /// bundle server-side (all bytes are up), or the record is already complete.
    public enum Step: Equatable, Sendable {
        case upload([String])   // these kinds still need bytes
        case confirm            // all uploaded → confirm-scan-bundle + mark complete
        case done               // record already marked complete
    }
    public static func nextStep(all: [String], existing: [ScanArtifactUploadState],
                                recordComplete: Bool) -> Step {
        if recordComplete { return .done }
        let remaining = kindsToUpload(all: all, existing: existing)
        return remaining.isEmpty ? .confirm : .upload(remaining)
    }
}

/// Whether a failed `confirm-scan-bundle` call may be short-circuited to the
/// `mark_scan_upload_complete` RPC (item 8 · C1). The RPC bypasses the server's
/// artifact HEAD-verification, so it is ONLY safe when confirm was UNREACHABLE
/// (transport down / relay / not-deployed / 5xx) — never when the server actually
/// looked at the bundle and rejected it (a 409 = missing artifacts, or any other 4xx),
/// which would mark a broken bundle `ready`. Pure — unit-tested.
public enum ScanConfirmPolicy {

    public enum Fallback: Equatable {
        case markCompleteViaRPC   // confirm unreachable → the bundle is fine, the function isn't
        case propagate            // the server rejected THIS bundle → surface retry, never mark ready
    }

    /// `status` is the HTTP status of the confirm failure, or nil when the error
    /// wasn't an HTTP response at all (transport error / relay error → unreachable).
    public static func fallback(forHTTPStatus status: Int?) -> Fallback {
        guard let status else { return .markCompleteViaRPC }          // transport/relay ⇒ unreachable
        if status == 404 || (500..<600).contains(status) {           // not deployed / server error
            return .markCompleteViaRPC
        }
        return .propagate                                            // 409 + every other 4xx ⇒ real verdict
    }
}
