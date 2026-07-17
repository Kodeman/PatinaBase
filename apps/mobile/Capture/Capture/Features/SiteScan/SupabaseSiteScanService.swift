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
//  `ownableProjects()` below pre-filters F1's project picker to exactly what that
//  guard allows (narrower than the frozen `ProjectsService.listProjects()`, which
//  is RLS-scoped to designer_id OR client_id OR team-member — 00168) — so F1 can't
//  offer a project that only fails later, at this file's `upload()`.
//
//  supabase-swift lives ONLY app-side; the concrete uses the shared authenticated
//  client from `WorkServiceDependencies`.

import Foundation
import Supabase
import CaptureKit
import os.log
#if canImport(RoomPlan)
import RoomPlan
#endif

@MainActor
final class SupabaseSiteScanService: SiteScanService {

    private let client: SupabaseClient
    private let session: any SessionProviding
    private let bucket = "room-scans"
    private let logger = Logger(subsystem: "cloud.patina.field", category: "SiteScan")

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

    // MARK: - F1 picker

    /// Projects F1 may actually attach a scan to. Scoped server-side to mirror
    /// 00258's `room_scans_guard_routing` BEFORE INSERT guard exactly:
    /// `v_proj_designer IS DISTINCT FROM NEW.user_id AND v_proj_created IS
    /// DISTINCT FROM NEW.user_id` raises "cannot attach a scan to a project owned
    /// by a different designer" — i.e. the guard only ever allows `designer_id =
    /// auth.uid() OR created_by = auth.uid()`. That's narrower than the frozen
    /// `ProjectsService.listProjects()` (00168 RLS: designer_id OR client_id OR
    /// team-member), which would let a team-member designer pick a project here
    /// that then fails at upload. Not called in mock mode — `SiteScanSetupModel`
    /// falls back to the frozen `MockProjectsService` list there.
    func ownableProjects() async throws -> [FieldProject] {
        let userID = try await currentUserID().uuidString
        let rows: [OwnableProjectRow] = try await client
            .from("projects")
            .select("id, name")
            .or("designer_id.eq.\(userID),created_by.eq.\(userID)")
            .order("updated_at", ascending: false)
            .execute()
            .value
        return rows.map { FieldProject(id: $0.id, name: $0.name, status: "") }
    }

    // MARK: - Upload

    func upload(result: FieldScanResult, projectID: String?, projectRoomID: String?,
                name: String) async throws -> FieldScanUploadReceipt {
        let userID = try await currentUserID()

        // 1. Reserve this attempt's scan/room ids — or resume a prior attempt's,
        //    if this is a retry (see `reservation(for:...)` doc below).
        let reserved = try await reservation(for: result.localBundleURL,
                                             picked: projectRoomID, name: name, userID: userID)
        let scanID = reserved.scanID
        let roomID = reserved.roomID

        // 2. Upsert (not insert) the scan row (status=processing) with the project
        //    linkage + best-effort metrics, keyed on the reserved id. Upsert (vs.
        //    a plain insert) tolerates a retry that resumes after a prior attempt
        //    already wrote this row — see `reservation(for:...)`. project_room_id
        //    stays nil in v1 — F1 picks a public.rooms id (→ room_id), not a
        //    project_rooms scope room.
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
        do {
            try await client.from("room_scans").upsert(insert, onConflict: "id").execute()
        } catch let error as PostgrestError
                    where error.message.contains("owned by a different designer") {
            // Residual case (see SiteScanError.foreignProjectOwner): 00258's
            // guard still runs on every upsert attempt, insert-path or not, so it
            // catches this even on a retry of an already-reserved id.
            throw SiteScanError.foreignProjectOwner
        }

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

        // 5. Posed photos (I76) are a SEPARATE, best-effort lane. They upload
        //    STRICTLY AFTER the scan is marked ready, so a photo failure can never
        //    delay or fail the core scan — the accepted degraded mode is a ready
        //    scan with no photos. Single attempt, log-only.
        do {
            try await uploadScanPhotos(bundle: result.localBundleURL,
                                       scanID: scanID, roomID: roomID, userID: userID)
        } catch {
            logger.error("[SiteScan] posed-photo upload failed; scan is ready without photos: \(error.localizedDescription)")
        }

        // Full success — this bundle's reservation is spent; a later, unrelated
        // upload() call using the same URL (shouldn't happen, but be safe) gets a
        // fresh reservation rather than silently reusing a completed scan's ids.
        reservations[result.localBundleURL] = nil
        return FieldScanUploadReceipt(remoteScanID: scanID.uuidString)
    }

    // MARK: - Helpers

    /// This attempt's reserved (scanID, roomID) pair, keyed by the finished
    /// bundle's on-disk URL. `RoomPlanScanSession.finish()` mints a fresh temp
    /// directory per scan, so the key can't collide across unrelated scans, but
    /// stays STABLE across F4 retries of the same scan (`SiteScanUploadModel`
    /// re-invokes `upload()` on this same service instance without changing
    /// `result`). Without this, every retry minted a fresh scanID — and, when no
    /// room was picked, a fresh designer-owned `rooms` row via `resolveRoomID`
    /// too — orphaning a status='processing' room_scans row (and a spare rooms
    /// row) per retry. Cleared on full success above; a failed attempt's
    /// reservation is deliberately left cached so the next retry resumes it.
    private struct ScanReservation {
        let scanID: UUID
        let roomID: UUID
    }
    private var reservations: [URL: ScanReservation] = [:]

    private func reservation(for bundleURL: URL, picked: String?, name: String,
                             userID: UUID) async throws -> ScanReservation {
        if let cached = reservations[bundleURL] { return cached }
        let roomID = try await resolveRoomID(picked: picked, name: name, userID: userID)
        let fresh = ScanReservation(scanID: UUID(), roomID: roomID)
        reservations[bundleURL] = fresh
        return fresh
    }

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

    // MARK: - Posed photos (I76)

    /// Upload the scan's posed photos, then write ONE batched `room_scan_images`
    /// insert — the SEPARATE, variable-count lane that rides the SAME storage-key
    /// shape (`photos/{uid}/{roomId}/{filename}`) as the two core artifacts, so it
    /// needs zero policy work (00077 owner INSERT + 00287 designer read).
    ///
    /// Reads the `photos_metadata.json` sidecar the session wrote; an absent or
    /// malformed sidecar (or an empty one) is a clean no-op. Each photo is
    /// uploaded independently — a single bad photo is logged and SKIPPED, not
    /// fatal to the batch. `image_count` on `room_scans` is maintained by the
    /// 00032 AFTER-INSERT trigger — NO explicit patch here (the explicit patch is
    /// what produced the prod 40-vs-200 image_count discrepancy).
    private func uploadScanPhotos(bundle: URL, scanID: UUID, roomID: UUID, userID: UUID) async throws {
        let sidecarURL = bundle.appendingPathComponent(RoomScanStoragePath.Filename.photosMetadata)
        guard let sidecarData = try? Data(contentsOf: sidecarURL) else { return } // no photos captured
        let entries = try JSONDecoder().decode([FieldPhotoEntry].self, from: sidecarData)
        guard !entries.isEmpty else { return }

        let photosDir = bundle.appendingPathComponent(RoomScanStoragePath.Folder.photos, isDirectory: true)
        var rows: [FieldRoomScanImageInsert] = []
        rows.reserveCapacity(entries.count)

        for (index, entry) in entries.enumerated() {
            do {
                // Full JPEG (required for a row).
                let jpegData = try Data(contentsOf: photosDir.appendingPathComponent(entry.filename))
                let jpegPath = RoomScanStoragePath.object(
                    folder: RoomScanStoragePath.Folder.photos,
                    userID: userID, roomID: roomID, filename: entry.filename)
                try await client.storage.from(bucket).upload(
                    jpegPath, data: jpegData,
                    options: FileOptions(contentType: "image/jpeg", upsert: true))
                let imageURL = try client.storage.from(bucket).getPublicURL(path: jpegPath).absoluteString

                // 256px thumb — populated from day one. If the thumb is missing or
                // its upload fails, fall back to the full JPEG URL so the
                // thumbnail_url column is never null.
                var thumbnailURL = imageURL
                if let thumbName = entry.thumbnailFilename {
                    do {
                        let thumbData = try Data(contentsOf: photosDir.appendingPathComponent(thumbName))
                        let thumbPath = RoomScanStoragePath.object(
                            folder: RoomScanStoragePath.Folder.photos,
                            userID: userID, roomID: roomID, filename: thumbName)
                        try await client.storage.from(bucket).upload(
                            thumbPath, data: thumbData,
                            options: FileOptions(contentType: "image/jpeg", upsert: true))
                        thumbnailURL = try client.storage.from(bucket).getPublicURL(path: thumbPath).absoluteString
                    } catch {
                        logger.error("[SiteScan] thumb upload failed (\(thumbName)); using full image URL: \(error.localizedDescription)")
                    }
                }

                rows.append(FieldRoomScanImageInsert.auto(
                    from: entry, scanID: scanID, roomID: roomID,
                    displayOrder: index + 1, urls: (image: imageURL, thumbnail: thumbnailURL)))
            } catch {
                logger.error("[SiteScan] posed photo skipped (\(entry.filename)): \(error.localizedDescription)")
            }
        }

        guard !rows.isEmpty else { return }
        try await client.from("room_scan_images").insert(rows).execute()
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

/// `ownableProjects()`'s minimal read row — id + name, all the F1 picker needs
/// (see `FieldProject.status` default `""` at the call site).
private struct OwnableProjectRow: Decodable {
    let id: String
    let name: String
}

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
