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
    private let store: CaptureStore
    private let bucket = "room-scans"
    private let logger = Logger(subsystem: "cloud.patina.field", category: "SiteScan")

    /// Retained (weakly) so `upload` can read the finished scan's coarse metrics
    /// (floor area / dimensions / coverage) for the row — the frozen
    /// `FieldScanResult` only carries an area label. The F2/F3/F4 host owns the
    /// session strongly across the whole flow, so this resolves at upload time.
    #if canImport(RoomPlan)
    private weak var lastSession: RoomPlanScanSession?
    #endif

    /// Background-session artifact transport (item 8 Part 3). Uploads survive
    /// suspension; a per-kind continuation bridges the delegate callback back into the
    /// awaiting `upload()`, and the durable record resumes a kill mid-upload.
    private lazy var backgroundUploader: FieldBackgroundScanUploader = {
        let uploader = FieldBackgroundScanUploader(
            baseURL: AppConfiguration.supabaseURL, anonKey: AppConfiguration.supabaseAnonKey)
        uploader.accessTokenProvider = { [weak self] in try? await self?.client.auth.session.accessToken }
        uploader.refreshTokenProvider = { [weak self] in try? await self?.client.auth.refreshSession().accessToken }
        uploader.onCompletion = { [weak self] _, kind, result in
            self?.artifactContinuations.removeValue(forKey: kind)?.resume(returning: result)
        }
        return uploader
    }()
    private var artifactContinuations:
        [String: CheckedContinuation<Result<Void, FieldBackgroundScanUploader.UploadError>, Never>] = [:]

    init(deps: WorkServiceDependencies) {
        self.client = deps.client
        self.session = deps.session
        self.store = deps.store
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

        // 3. Upload the full artifact set + patch URL columns + scan_schema_version
        //    (resumable — already-uploaded artifacts are skipped). See the helper.
        let artifactStates = try await uploadBundleArtifacts(
            bundle: result.localBundleURL, scanID: scanID, roomID: roomID,
            userID: userID, reserved: reserved)

        // 4. confirm-scan-bundle HEAD-verifies the patched URLs server-side and flips
        //    the row to ready (it calls mark_scan_upload_complete on success). If it
        //    can't be reached, fall back to marking complete directly.
        do {
            try await client.functions.invoke(
                "confirm-scan-bundle",
                options: FunctionInvokeOptions(body: ConfirmScanBundleRequest(scan_id: scanID.uuidString)))
        } catch {
            logger.error("[SiteScan] confirm-scan-bundle failed; marking complete directly: \(error.localizedDescription)")
            try await client.rpc("mark_scan_upload_complete",
                                 params: ScanIDParam(p_scan_id: scanID.uuidString)).execute()
        }

        // 5. Posed photos (I76) — SEPARATE, best-effort lane, STRICTLY after ready.
        do {
            try await uploadScanPhotos(bundle: result.localBundleURL,
                                       scanID: scanID, roomID: roomID, userID: userID)
        } catch {
            logger.error("[SiteScan] posed-photo upload failed; scan is ready without photos: \(error.localizedDescription)")
        }

        store.updateScanUploadRecord(reserved.record, artifacts: artifactStates, status: "complete")
        return FieldScanUploadReceipt(remoteScanID: scanID.uuidString)
    }

    private func isUploaded(_ kind: String, in states: [ScanArtifactUploadState]) -> Bool {
        states.contains { $0.kind == kind && $0.status == .uploaded }
    }

    /// Upload every on-disk bundle artifact (skipping already-uploaded ones on a
    /// resume), merge each SHA-256, patch the URL columns + scan_schema_version, and
    /// persist per-artifact progress on the durable record.
    private func uploadBundleArtifacts(bundle: URL, scanID: UUID, roomID: UUID, userID: UUID,
                                       reserved: ScanReservation) async throws -> [ScanArtifactUploadState] {
        // Tar the heavy streams + fold the archives into the manifest (Part 3), so a
        // 500 MB bundle uploads as a handful of background tasks, not ~700.
        buildTransportArchives(bundle: bundle)
        try? FieldManifestAssembler.refreshArtifacts(bundleDir: bundle)

        var states = reserved.record.artifacts
        var patch = RoomScanArtifactPatch()
        for descriptor in Self.uploadDescriptors where !isUploaded(descriptor.kind, in: states) {
            let fileURL = bundle.appendingPathComponent(descriptor.relativePath)
            guard FileManager.default.fileExists(atPath: fileURL.path) else { continue }
            let sha = BundleChecksum.sha256(ofFile: fileURL)
            let storagePath = RoomScanStoragePath.object(folder: descriptor.folder, userID: userID,
                                                         roomID: roomID, filename: descriptor.filename)
            // Transport via the BACKGROUND session; await the delegate's completion.
            let ok = await uploadViaBackground(FieldBackgroundScanUploader.Descriptor(
                scanID: scanID.uuidString, kind: descriptor.kind, sha256: sha,
                mimeType: descriptor.contentType, fileURL: fileURL, storagePath: storagePath))
            guard ok else {
                states.append(ScanArtifactUploadState(
                    kind: descriptor.kind, relativePath: descriptor.relativePath,
                    mimeType: descriptor.contentType, storagePath: storagePath,
                    sha256: sha, column: descriptor.column, status: .failed))
                store.updateScanUploadRecord(reserved.record, artifacts: states, status: "failed")
                throw SiteScanError.exportFailed("Upload of \(descriptor.kind) failed — retry resumes.")
            }
            let url = try client.storage.from(bucket).getPublicURL(path: storagePath).absoluteString
            if let sha {
                try? await client.rpc("merge_scan_artifact_sha256",
                    params: ArtifactShaMergeParams(p_scan_id: scanID.uuidString,
                                                   p_kind: descriptor.kind, p_sha: sha)).execute()
            }
            patch.apply(column: descriptor.column, url: url)
            states.append(ScanArtifactUploadState(
                kind: descriptor.kind, relativePath: descriptor.relativePath,
                mimeType: descriptor.contentType, storagePath: storagePath, remoteUrl: url,
                sha256: sha, column: descriptor.column, status: .uploaded))
            store.updateScanUploadRecord(reserved.record, artifacts: states, status: "uploading")
        }
        try await client.from("room_scans").update(patch.withSchemaVersion(3))
            .eq("id", value: scanID.uuidString).execute()
        return states
    }

    /// Enqueue one artifact on the background session and await its completion via the
    /// per-kind continuation (bridged from the uploader's delegate callback).
    private func uploadViaBackground(_ descriptor: FieldBackgroundScanUploader.Descriptor) async -> Bool {
        let result: Result<Void, FieldBackgroundScanUploader.UploadError> =
            await withCheckedContinuation { continuation in
                artifactContinuations[descriptor.kind] = continuation
                Task { await backgroundUploader.enqueue(descriptor) }
            }
        if case .success = result { return true }
        return false
    }

    /// Tar depth/*.bin → depth.tar and keyframes/*.heic+*.bin → keyframes.tar into the
    /// bundle dir (transport archives; the per-file dirs remain the logical form).
    private func buildTransportArchives(bundle: URL) {
        let fm = FileManager.default
        func tar(dir: String, extensions: Set<String>, to name: String) {
            let src = bundle.appendingPathComponent(dir, isDirectory: true)
            guard let files = try? fm.contentsOfDirectory(at: src, includingPropertiesForKeys: nil)
                .filter({ extensions.contains($0.pathExtension) }), !files.isEmpty else { return }
            try? TarArchive.write(entries: files.map { TarArchive.Entry(name: $0.lastPathComponent, url: $0) },
                                  to: bundle.appendingPathComponent(name))
        }
        tar(dir: "depth", extensions: ["bin"], to: "depth.tar")
        tar(dir: "keyframes", extensions: ["heic", "bin"], to: "keyframes.tar")
    }

    /// The full v1 bundle artifact set (stable order). `column` non-nil ⇒ the URL is
    /// patched onto that room_scans column (confirm-scan-bundle HEAD-checks those).
    private struct UploadDescriptor {
        let relativePath, kind, folder, filename, contentType: String
        let column: String?
    }
    private static let uploadDescriptors: [UploadDescriptor] = [
        .init(relativePath: "scan.usdz", kind: "usdz", folder: "usdz",
              filename: "scan.usdz", contentType: "model/vnd.usdz+zip", column: "model_url"),
        .init(relativePath: "captured_room.json", kind: "capturedRoomJson", folder: "captured_room",
              filename: "captured_room.json", contentType: "application/json", column: "captured_room_json_url"),
        .init(relativePath: "mesh.ply", kind: "mesh", folder: "mesh",
              filename: "mesh.ply", contentType: "application/octet-stream", column: "mesh_url"),
        .init(relativePath: "manifest.json", kind: "bundleManifest", folder: "manifests",
              filename: "manifest.json", contentType: "application/json", column: "bundle_manifest_url"),
        .init(relativePath: "depth/depth_index.ndjson", kind: "depthIndex", folder: "depth",
              filename: "depth_index.ndjson", contentType: "application/x-ndjson", column: nil),
        .init(relativePath: "scorecard.json", kind: "scorecard", folder: "scorecard",
              filename: "scorecard.json", contentType: "application/json", column: nil),
        .init(relativePath: "anchors.json", kind: "anchors", folder: "anchors",
              filename: "anchors.json", contentType: "application/json", column: nil),
        .init(relativePath: "keyframes/keyframe_index.ndjson", kind: "keyframeIndex", folder: "keyframes",
              filename: "keyframe_index.ndjson", contentType: "application/x-ndjson", column: nil),
        .init(relativePath: "keyframes/keyframe_summary.json", kind: "keyframeSummary", folder: "keyframes",
              filename: "keyframe_summary.json", contentType: "application/json", column: nil),
        // Transport archives (Part 3) — the heavy streams; map to the archive columns
        // confirm-scan-bundle HEAD-checks (depth_archive_url / scan_bundle_url).
        .init(relativePath: "depth.tar", kind: "depthArchive", folder: "depth",
              filename: "depth.tar", contentType: "application/x-tar", column: "depth_archive_url"),
        .init(relativePath: "keyframes.tar", kind: "keyframesArchive", folder: "bundle",
              filename: "keyframes.tar", contentType: "application/x-tar", column: "scan_bundle_url")
    ]

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
        let record: ScanUploadRecord
    }

    /// The DURABLE (scanID, roomID) reservation for a bundle — persisted in a
    /// `ScanUploadRecord` (item 8) keyed by the bundle dir path. A relaunch (or a
    /// "Finish later" resume) reuses the SAME scanID instead of minting a fresh
    /// room_scans row (+ a spare rooms row), which is the orphaned-`processing`-row
    /// hazard the audit flagged in the prior in-memory dictionary.
    private func reservation(for bundleURL: URL, picked: String?, name: String,
                             userID: UUID) async throws -> ScanReservation {
        let path = bundleURL.path
        if let existing = store.scanUploadRecord(bundlePath: path),
           let scanID = UUID(uuidString: existing.scanID),
           let roomID = UUID(uuidString: existing.roomID) {
            return ScanReservation(scanID: scanID, roomID: roomID, record: existing)   // resume
        }
        let roomID = try await resolveRoomID(picked: picked, name: name, userID: userID)
        let scanID = UUID()
        let record = store.insertScanUploadRecord(ScanUploadRecord(
            bundlePath: path, scanID: scanID.uuidString, roomID: roomID.uuidString,
            name: name, projectID: nil, projectRoomID: picked))
        return ScanReservation(scanID: scanID, roomID: roomID, record: record)
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

/// Sparse URL-column + schema-version patch (item 8). Optional fields → nil is
/// OMITTED by the synthesized Encodable (`encodeIfPresent`), so a patch never nulls a
/// column it didn't set.
private struct RoomScanArtifactPatch: Encodable {
    var model_url: String?
    var captured_room_json_url: String?
    var mesh_url: String?
    var bundle_manifest_url: String?
    var depth_archive_url: String?
    var scan_bundle_url: String?
    var scan_schema_version: Int?

    mutating func apply(column: String?, url: String) {
        switch column {
        case "model_url": model_url = url
        case "captured_room_json_url": captured_room_json_url = url
        case "mesh_url": mesh_url = url
        case "bundle_manifest_url": bundle_manifest_url = url
        case "depth_archive_url": depth_archive_url = url
        case "scan_bundle_url": scan_bundle_url = url
        default: break
        }
    }
    func withSchemaVersion(_ version: Int) -> RoomScanArtifactPatch {
        var copy = self
        copy.scan_schema_version = version
        return copy
    }
}

private struct ArtifactShaMergeParams: Encodable {
    let p_scan_id: String
    let p_kind: String
    let p_sha: String
}

private struct ConfirmScanBundleRequest: Encodable {
    let scan_id: String
}

private struct ScanIDParam: Encodable {
    let p_scan_id: String
}
