//  SupabaseSiteScanService.swift
//  Capture · Wave F (Pro site-scan)
//
//  The real `SiteScanService` (real mode / LiDAR device). Drives a RoomPlan scan
//  via `RoomPlanScanSession`, then uploads the finished v1-minimal bundle (USDZ +
//  CapturedRoom JSON) to the `room-scans` bucket and writes the parent `rooms`
//  (when needed) + `room_scans` rows, mirroring the reference
//  `Patina/Services/Sync/RoomScanSyncService.swift` column population — trimmed to
//  the v1 artifact set + this migration's project linkage.
//
//  RLS does the scoping (no client-side role filtering):
//    • rooms / room_scans owner policies (00019 / 00014): `auth.uid() = user_id`
//      → we write user_id = the signed-in designer, and read our own rows back.
//    • storage RLS (00077): INSERT gates on the userId being path segment [2];
//      built once in `RoomScanStoragePath` so it can't regress.
//    • room_scans_guard_routing (THIS migration, 00258): project_id must be a
//      project the designer owns + is visible to them; fires only when linkage
//      is set — our designer-owned project passes.
//
//  supabase-swift lives ONLY app-side; the concrete uses the shared authenticated
//  client from `WorkServiceDependencies`.

import Foundation
import Supabase
import CaptureKit
#if canImport(RoomPlan)
import RoomPlan
#endif

@MainActor
final class SupabaseSiteScanService: SiteScanService {

    private let client: SupabaseClient
    private let session: any SessionProviding
    private let bucket = "room-scans"

    /// Retained (weakly) so `upload` can read the finished scan's coarse metrics
    /// (floor area / dimensions / coverage) for the row — the frozen
    /// `FieldScanResult` only carries an area label. The F2/F3/F4 host owns the
    /// session strongly across the whole flow, so this resolves at upload time.
    #if canImport(RoomPlan)
    private weak var lastSession: RoomPlanScanSession?
    #endif

    init(deps: WorkServiceDependencies) {
        self.client = deps.client
        self.session = deps.session
    }

    var isSupported: Bool {
        #if canImport(RoomPlan)
        return RoomCaptureSession.isSupported
        #else
        return false
        #endif
    }

    func startSession() async throws -> any FieldScanSession {
        #if canImport(RoomPlan)
        guard RoomCaptureSession.isSupported else { throw SiteScanError.unsupported }
        let scan = RoomPlanScanSession()
        lastSession = scan
        return scan
        #else
        throw SiteScanError.unsupported
        #endif
    }

    // MARK: - Upload

    func upload(result: FieldScanResult, projectID: String?, projectRoomID: String?,
                name: String) async throws -> FieldScanUploadReceipt {
        let userID = try await currentUserID()
        let scanID = UUID()

        // 1. Parent room: reuse the picked room (F1 room pick == a public.rooms id),
        //    otherwise create a designer-owned rooms row from the name field.
        let roomID = try await resolveRoomID(picked: projectRoomID, name: name, userID: userID)

        // 2. Insert the scan row (status=processing) with the project linkage +
        //    best-effort metrics. project_room_id stays nil in v1 — F1 picks a
        //    public.rooms id (→ room_id), not a project_rooms scope room.
        let iso = ISO8601DateFormatter()
        let now = iso.string(from: Date())
        let metrics = scanMetrics()
        let insert = RoomScanInsert(
            id: scanID, user_id: userID, room_id: roomID,
            project_id: projectID.flatMap { UUID(uuidString: $0) },
            project_room_id: nil,
            name: name, status: "processing",
            dimensions: metrics.dims.map {
                .init(width: $0.x, length: $0.z, height: $0.y, unit: "meters")
            },
            floor_area: metrics.area,
            coverage_percentage: metrics.coverage,
            scanned_at: now, created_at: now)
        try await client.from("room_scans").insert(insert).execute()

        // 3. Upload the two artifacts, then patch their URL columns.
        let modelURL = try await uploadArtifact(.usdz, bundle: result.localBundleURL,
                                                userID: userID, roomID: roomID)
        let jsonURL = try await uploadArtifact(.capturedRoom, bundle: result.localBundleURL,
                                               userID: userID, roomID: roomID)

        try await client.from("room_scans")
            .update(RoomScanURLPatch(model_url: modelURL, captured_room_json_url: jsonURL))
            .eq("id", value: scanID.uuidString)
            .execute()

        // 4. Owner-gated flip to ready (reused from the reference upload pipeline).
        try await client.rpc("mark_scan_upload_complete",
                             params: ScanIDParam(p_scan_id: scanID.uuidString)).execute()

        return FieldScanUploadReceipt(remoteScanID: scanID.uuidString)
    }

    // MARK: - Helpers

    private func currentUserID() async throws -> UUID {
        // The authenticated client is the source of truth for a canonical UUID
        // (SessionProviding.userID is a display string of unknown case).
        do {
            return try await client.auth.session.user.id
        } catch {
            throw SiteScanError.notAuthenticated
        }
    }

    private func resolveRoomID(picked: String?, name: String, userID: UUID) async throws -> UUID {
        if let picked, let existing = UUID(uuidString: picked) { return existing }
        let roomID = UUID()
        try await client.from("rooms")
            .insert(RoomInsert(id: roomID, user_id: userID, name: name, type: "other"))
            .execute()
        return roomID
    }

    /// Upload one v1 bundle artifact → `room-scans/{folder}/{uid}/{roomId}/{filename}`,
    /// return its public URL. Upsert makes an offline retry idempotent; the local
    /// bundle is never deleted, so a failure here is safely retryable.
    private func uploadArtifact(_ artifact: V1Artifact, bundle: URL,
                                userID: UUID, roomID: UUID) async throws -> String {
        let fileURL = bundle.appendingPathComponent(artifact.filename)
        let data = try Data(contentsOf: fileURL)
        let path = RoomScanStoragePath.object(
            folder: artifact.folder, userID: userID, roomID: roomID, filename: artifact.filename)
        try await client.storage.from(bucket)
            .upload(path, data: data, options: FileOptions(contentType: artifact.contentType, upsert: true))
        return try client.storage.from(bucket).getPublicURL(path: path).absoluteString
    }

    private func scanMetrics() -> ScanMetrics {
        #if canImport(RoomPlan)
        if let s = lastSession {
            return ScanMetrics(area: s.floorAreaSqm, dims: s.dimensionsMeters, coverage: s.lastCoverage)
        }
        #endif
        return ScanMetrics(area: nil, dims: nil, coverage: 0)
    }
}

// MARK: - Value types

/// The v1-minimal artifact set: a USDZ model + the CapturedRoom parametric JSON.
/// Maps each to its storage folder root, bundle filename, and MIME type — all
/// allowed on the `room-scans` bucket (00077).
private enum V1Artifact {
    case usdz
    case capturedRoom

    var folder: String {
        self == .usdz ? RoomScanStoragePath.Folder.usdz : RoomScanStoragePath.Folder.capturedRoom
    }
    var filename: String {
        self == .usdz ? RoomScanStoragePath.Filename.usdz : RoomScanStoragePath.Filename.capturedRoom
    }
    var contentType: String {
        self == .usdz ? "model/vnd.usdz+zip" : "application/json"
    }
}

/// Coarse, best-effort metrics read back from the finished session for the row.
private struct ScanMetrics {
    let area: Double?
    let dims: SIMD3<Double>?
    let coverage: Double
}

// MARK: - Wire DTOs (keys = PostgREST columns / RPC args, snake_case verbatim)

private struct RoomInsert: Encodable {
    let id: UUID
    let user_id: UUID
    let name: String
    let type: String
}

private struct RoomScanInsert: Encodable {
    let id: UUID
    let user_id: UUID
    let room_id: UUID
    let project_id: UUID?
    let project_room_id: UUID?
    let name: String
    let status: String
    let dimensions: DimensionsJSON?
    let floor_area: Double?
    let coverage_percentage: Double?
    let scanned_at: String
    let created_at: String

    struct DimensionsJSON: Encodable {
        let width: Double
        let length: Double
        let height: Double
        let unit: String
    }
}

private struct RoomScanURLPatch: Encodable {
    let model_url: String
    let captured_room_json_url: String
}

private struct ScanIDParam: Encodable {
    let p_scan_id: String
}
