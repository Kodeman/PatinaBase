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
    @Attribute(.unique) public var bundlePath: String

    public var scanID: String
    public var roomID: String
    public var name: String
    public var projectID: String?
    public var projectRoomID: String?
    /// `room_scans.scan_schema_version` marker (3 = Field P1 instrument bundle).
    public var scanSchemaVersion: Int
    /// Per-artifact upload progress (Codable value array attribute).
    public var artifacts: [ScanArtifactUploadState]
    /// "pending" | "uploading" | "complete" | "failed".
    public var statusRaw: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(bundlePath: String, scanID: String, roomID: String, name: String,
                projectID: String?, projectRoomID: String?, scanSchemaVersion: Int = 3,
                artifacts: [ScanArtifactUploadState] = []) {
        self.bundlePath = bundlePath
        self.scanID = scanID
        self.roomID = roomID
        self.name = name
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.scanSchemaVersion = scanSchemaVersion
        self.artifacts = artifacts
        self.statusRaw = "pending"
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
