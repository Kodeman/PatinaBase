//  SiteScanService.swift
//  CaptureKit
//
//  F1–F4 seam — the pro site-scan: start a room scan, observe coverage, finish to
//  a local bundle, then upload. THIN by design — the concrete RoomPlan/ARKit
//  pipeline (mirroring the reference `Features/Walk/`) is the F-team's job; this
//  file only freezes the handle shape so F builds behind it. PURE Foundation.
//
//  Like `CameraService`, the live seam is `@MainActor`/`AnyObject`: a scan session
//  owns an AR/RoomPlan session and mutable capture state. Events mirror the
//  `frameState` stream pattern.

import Foundation

/// Progress from a live scan session (F2).
public enum FieldScanEvent: Sendable {
    /// Fractional room coverage, 0...1 — drives the F2 coverage meter.
    case coverage(Double)
    /// A human-readable status line (e.g. "Move closer to the far wall").
    case status(String)
    /// Live coach detail (item 5): per-surface checklist + warnings + coverage %.
    /// Emitted on the RoomPlan graph-update cadence; drives the F2 coach overlay.
    case coverageUpdate(CoverageSnapshot)
}

/// The finished local scan artifact (F3 review), before upload.
public struct FieldScanResult: Sendable, Codable {
    /// On-disk bundle the concrete wrote (USDZ + captured-room JSON + photos, …).
    public let localBundleURL: URL
    public let roomName: String?
    public let areaLabel: String?
    /// Identity captured when F2 created the scan session. Nil is accepted only
    /// for mock, preview, and legacy decoding; real upload requires an exact match.
    public let owner: CaptureOwnerIdentity?
    /// End-of-scan QA scorecard (item 5). Persisted to `scorecard.json` in the
    /// bundle; carried here so the F3 review can render the verdict without re-reading
    /// disk. Nil only for a legacy/degenerate scan that produced none.
    public let scorecard: Scorecard?

    public init(
        localBundleURL: URL,
        roomName: String? = nil,
        areaLabel: String? = nil,
        owner: CaptureOwnerIdentity? = nil,
        scorecard: Scorecard? = nil
    ) {
        self.localBundleURL = localBundleURL
        self.roomName = roomName
        self.areaLabel = areaLabel
        self.owner = owner
        self.scorecard = scorecard
    }
}

/// Receipt from a successful upload (F4).
public struct FieldScanUploadReceipt: Sendable, Codable {
    public let remoteScanID: String

    public init(remoteScanID: String) {
        self.remoteScanID = remoteScanID
    }
}

/// Honest local recovery errors for a durable scan the user explicitly retries.
public enum FieldScanRecoveryError: LocalizedError, Equatable {
    case transferNotFound
    case localBundleUnavailable
    case retryUnavailable
    case invalidTransferState

    public var errorDescription: String? {
        switch self {
        case .transferNotFound:
            return "This scan transfer is no longer available on this device."
        case .localBundleUnavailable:
            return "The local scan bundle is unavailable."
        case .retryUnavailable:
            return "Retry is not available for this scan."
        case .invalidTransferState:
            return "This scan is not waiting for recovery."
        }
    }
}

/// A durable scan left on-device for upload, confirmation, or recovery.
public struct FieldScanPendingUpload: Identifiable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let projectID: String?
    public let state: CaptureTransferState

    public init(id: String, name: String, projectID: String?,
                state: CaptureTransferState) {
        self.id = id
        self.name = name
        self.projectID = projectID
        self.state = state
    }
}

/// A live scan session handle (F2). Returned by `SiteScanService.startSession`;
/// the screen observes `events`, then either `finish()`es to a result or
/// `cancel()`s. A reference type — it wraps the live AR/RoomPlan session.
@MainActor
public protocol FieldScanSession: AnyObject {
    /// Coverage / status telemetry for the live scan UI.
    var events: AsyncStream<FieldScanEvent> { get }
    /// Stop scanning and write the local bundle.
    func finish() async throws -> FieldScanResult
    /// Abandon the scan and tear the session down.
    func cancel()
}

@MainActor
public protocol SiteScanService: AnyObject {
    /// Whether this device can run a room scan (LiDAR / RoomPlan present).
    var isSupported: Bool { get }
    /// Begin a scan session.
    func startSession() async throws -> any FieldScanSession
    /// Upload a finished scan, tying it to a project/room; returns the remote id.
    func upload(result: FieldScanResult, projectID: String?, projectRoomID: String?,
                name: String) async throws -> FieldScanUploadReceipt
    /// Discover transfers that survived leaving the upload flow or a relaunch.
    func pendingUploads() async -> [FieldScanPendingUpload]
    /// Idempotently resume the same durable reservations. Startup callers pass
    /// `false`; explicit user retry passes `true`.
    func resumePendingUploads(retryFailures: Bool) async

    /// Retry one user-reviewed rejected or failed durable scan and return its receipt.
    func retryPendingUpload(id: String) async throws -> FieldScanUploadReceipt
    /// Composition-root startup seam; intentionally not wired by the workflow slice.
    func reconcilePendingUploads() async
}

public extension SiteScanService {
    func pendingUploads() async -> [FieldScanPendingUpload] { [] }
    func resumePendingUploads(retryFailures: Bool) async {}

    func retryPendingUpload(id: String) async throws -> FieldScanUploadReceipt {
        throw FieldScanRecoveryError.retryUnavailable
    }
    func reconcilePendingUploads() async {
        await resumePendingUploads(retryFailures: false)
    }
}
