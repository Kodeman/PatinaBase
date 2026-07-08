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
}

/// The finished local scan artifact (F3 review), before upload.
public struct FieldScanResult: Sendable, Codable {
    /// On-disk bundle the concrete wrote (USDZ + captured-room JSON + photos, …).
    public let localBundleURL: URL
    public let roomName: String?
    public let areaLabel: String?

    public init(localBundleURL: URL, roomName: String? = nil, areaLabel: String? = nil) {
        self.localBundleURL = localBundleURL
        self.roomName = roomName
        self.areaLabel = areaLabel
    }
}

/// Receipt from a successful upload (F4).
public struct FieldScanUploadReceipt: Sendable, Codable {
    public let remoteScanID: String

    public init(remoteScanID: String) {
        self.remoteScanID = remoteScanID
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
}
