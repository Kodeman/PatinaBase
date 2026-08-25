//  ScanUploadRecord.swift
//  CaptureKit
//
//  Durable site-scan upload state (Field Capture P1 · item 8, Part 3). Persisting the
//  reservation + per-artifact status in SwiftData means a relaunch resumes the SAME
//  scanID (and skips already-uploaded artifacts) instead of minting a fresh
//  `room_scans` row — closing the orphan hazard the audit flagged in Field's prior
//  in-memory reservation. Keyed by the bundle dir path (stable across relaunches).
//
//  ADDITIVE to `CaptureStore.schema` (the item-8 explicit need overrides the
//  "frozen schema" audit note — new @Model, no changes to existing models).

import Foundation
import SwiftData

@Model
public final class ScanUploadRecord {

    /// Stable key = the bundle path RELATIVE to Application Support ("SiteScans/site-scan-…",
    /// via `SiteScanBundleHome.relativeKey`). Container-independent so a resume re-resolves
    /// the absolute URL under the CURRENT app container (C2); one record per scan.
    @Attribute(.unique) public var bundlePath: String = ""

    public var scanID: String = ""
    public var roomID: String = ""
    /// Immutable creation-time owner stamp. Nil only for legacy/quarantined rows.
    public private(set) var ownerUserID: String?
    public private(set) var ownerWorkspaceID: String?
    public var name: String = ""
    public var projectID: String?
    public var projectRoomID: String?
    /// `room_scans.scan_schema_version` marker (3 = Field P1 instrument bundle).
    public var scanSchemaVersion: Int = 3
    /// Per-artifact upload progress (Codable value array attribute).
    public var artifacts: [ScanArtifactUploadState] = []
    /// CaptureTransferPhase raw value, with legacy `"pending"` accepted as queued.
    public var statusRaw: String = CaptureTransferPhase.queued.rawValue
    public var lastError: String?
    public var retryCount: Int = 0
    /// The server-confirmed scan id. Nil until confirmation succeeds.
    public var receiptID: String?
    public var createdAt: Date = Date()
    public var updatedAt: Date = Date()

    public init(bundlePath: String, scanID: String, roomID: String, name: String,
                projectID: String?, projectRoomID: String?, scanSchemaVersion: Int = 3,
                artifacts: [ScanArtifactUploadState] = [],
                owner: CaptureOwnerIdentity? = nil) {
        self.bundlePath = bundlePath
        self.scanID = scanID
        self.roomID = roomID
        self.ownerUserID = owner?.userID
        self.ownerWorkspaceID = owner?.workspaceID
        self.name = name
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.scanSchemaVersion = scanSchemaVersion
        self.artifacts = artifacts
        self.statusRaw = CaptureTransferPhase.queued.rawValue
        self.retryCount = 0
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

public extension ScanUploadRecord {
    var transferState: CaptureTransferState {
        let progress = Int((ScanUploadPlanner.progress(artifacts) * 100).rounded())
        let phase: CaptureTransferPhase
        switch statusRaw {
        case "pending": phase = .queued // legacy records
        case "failed": phase = .retryableFailure
        case "incomplete": phase = .rejected
        default: phase = CaptureTransferPhase(rawValue: statusRaw) ?? .queued
        }
        if phase == .complete {
            guard let receiptID, !receiptID.isEmpty else {
                return CaptureTransferState(
                    phase: .awaitingConfirmation, progress: 100,
                    retryCount: retryCount)
            }
        }
        return CaptureTransferState(
            phase: phase,
            progress: phase == .complete ? 100 : progress,
            errorMessage: lastError,
            retryCount: retryCount,
            receiptID: receiptID
        )
    }

    func applyTransferState(_ state: CaptureTransferState, now: Date = Date()) {
        var confirmedReceipt: String?
        if state.phase == .complete {
            let receipt = state.receiptID?.trimmingCharacters(
                in: .whitespacesAndNewlines) ?? ""
            guard !receipt.isEmpty else {
                statusRaw = CaptureTransferPhase.awaitingConfirmation.rawValue
                lastError = "Awaiting a server receipt."
                updatedAt = now
                return
            }
            confirmedReceipt = receipt
        }
        statusRaw = state.phase.rawValue
        lastError = state.errorMessage
        retryCount = state.retryCount
        if let confirmedReceipt { receiptID = confirmedReceipt }
        updatedAt = now
    }

    /// Explicit recovery transition for a user-reviewed failed or rejected scan.
    /// Successful artifact receipts remain intact; only failed attempts are reset.
    func prepareForRetry(now: Date = Date()) {
        artifacts = artifacts.map { artifact in
            var reset = artifact
            if reset.status == .failed {
                reset.status = .pending
                reset.attempts = 0
                reset.lastError = nil
            }
            return reset
        }
        applyTransferState(
            CaptureTransferState(
                phase: .queued,
                retryCount: retryCount
            ),
            now: now
        )
    }
}
