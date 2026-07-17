//  ContextCaptureProvenance.swift
//  CaptureKit
//
//  The spatial-address provenance for a mid-scan context capture (Field Capture P1 ·
//  item 7, R108.2, deck SC-07 Context stream). A detail photo or voice note grabbed
//  during a site-scan is pinned to the current camera pose + the scan's room/project
//  reference and lands in the Capture Inbox (`field_captures`, 00233) through the
//  EXISTING outbox — a sibling stream, NOT embedded in the scan bundle (bundle spec
//  §1/§4 route it to the Inbox, so there is no `notes/` in the v1 bundle).
//
//  BLESSABLE PROVENANCE CONTRACT (logged for the portal Inbox UI, item 12+): the
//  address rides the EXISTING `Specimen.provenanceRaw` → `FieldCapturePayload.provenance`
//  → `field_captures.provenance` JSONB path — additive, NO migration and NO change to
//  the frozen payload wire contract. Keys are namespaced under `siteScanContext.*`;
//  the 4×4 camera pose is a row-major comma-joined string (16 values, nil on non-Pro).
//  The portal reads these keys back (parity guaranteed by `from(_:)`).
//
//    siteScanContext.source        = "site-scan-context"
//    siteScanContext.scanId        = client scan-session id (device-stable correlation)
//    siteScanContext.projectId     = projects.id
//    siteScanContext.projectRoomId = SiteScan rooms.id (NOT project_rooms — see note)
//    siteScanContext.cameraPose    = "m00,m01,…,m33" row-major (absent on non-Pro)
//    siteScanContext.capturedAt    = ISO8601
//
//  ROUTING NOTE: SiteScan's `projectRoomID` is a `public.rooms` id, but
//  `field_captures.project_room_id` references `project_rooms(id)` — a different id
//  space. So the field_capture routes on `project_id` only (projects-compatible) and
//  carries the rooms-id + scan-id in provenance for the portal to resolve; it never
//  writes the rooms-id into `project_room_id` (which would fail the routing guard).

import Foundation

public struct ContextCaptureProvenance: Equatable, Sendable {

    public static let sourceValue = "site-scan-context"

    public let scanSessionId: String?
    public let projectId: String?
    public let projectRoomId: String?
    /// Row-major 4×4 camera pose (length 16), or nil on a non-Pro device (no ARKit).
    public let cameraPoseRowMajor: [Double]?
    public let capturedAt: String        // ISO8601

    public init(scanSessionId: String?, projectId: String?, projectRoomId: String?,
                cameraPoseRowMajor: [Double]?, capturedAt: String) {
        self.scanSessionId = scanSessionId
        self.projectId = projectId
        self.projectRoomId = projectRoomId
        self.cameraPoseRowMajor = (cameraPoseRowMajor?.count == 16) ? cameraPoseRowMajor : nil
        self.capturedAt = capturedAt
    }

    private enum Key {
        static let source = "siteScanContext.source"
        static let scanId = "siteScanContext.scanId"
        static let projectId = "siteScanContext.projectId"
        static let projectRoomId = "siteScanContext.projectRoomId"
        static let cameraPose = "siteScanContext.cameraPose"
        static let capturedAt = "siteScanContext.capturedAt"
    }

    /// Flatten to the `[String:String]` provenance map stored on the Specimen.
    public func provenanceEntries() -> [String: String] {
        var map: [String: String] = [Key.source: Self.sourceValue, Key.capturedAt: capturedAt]
        if let scanSessionId { map[Key.scanId] = scanSessionId }
        if let projectId { map[Key.projectId] = projectId }
        if let projectRoomId { map[Key.projectRoomId] = projectRoomId }
        if let cameraPoseRowMajor {
            map[Key.cameraPose] = cameraPoseRowMajor.map { String($0) }.joined(separator: ",")
        }
        return map
    }

    /// Rebuild from the provenance map (portal-reader parity). Returns nil if the
    /// map isn't a site-scan-context provenance.
    public static func from(_ map: [String: String]) -> ContextCaptureProvenance? {
        guard map[Key.source] == sourceValue else { return nil }
        let pose = map[Key.cameraPose]?.split(separator: ",").compactMap { Double($0) }
        return ContextCaptureProvenance(
            scanSessionId: map[Key.scanId],
            projectId: map[Key.projectId],
            projectRoomId: map[Key.projectRoomId],
            cameraPoseRowMajor: pose,
            capturedAt: map[Key.capturedAt] ?? "")
    }
}
