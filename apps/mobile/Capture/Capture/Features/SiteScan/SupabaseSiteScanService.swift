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
        uploader.onCompletion = { [weak self] descriptor, result in
            self?.handleUploadCompletion(descriptor, result)
        }
        return uploader
    }()
    private var artifactContinuations:
        [String: CheckedContinuation<Result<Void, FieldBackgroundScanUploader.UploadError>, Never>] = [:]
    /// Completions that arrived with no waiter yet — a task that finished (or was
    /// re-delivered on relaunch) before `uploadViaBackground` registered its continuation.
    /// Drained by the next matching `uploadViaBackground` (item 8 · M3).
    private var bufferedCompletions:
        [String: Result<Void, FieldBackgroundScanUploader.UploadError>] = [:]
    /// Adopt the background session's surviving tasks once per launch (M3).
    private var didReconcileUploads = false

    init(deps: WorkServiceDependencies) {
        self.client = deps.client
        self.session = deps.session
        self.store = deps.store
        // Reap abandoned bundle dirs (uploads that never finished) — best-effort, off
        // the init path (C2 retention).
        Task.detached { SiteScanBundleHome.sweepOrphans() }
    }

    /// Route a background-upload completion: resolve an in-process waiter if present,
    /// else buffer it — and, for an orphaned success (a task that finished while the app
    /// was dead), advance the durable record so the artifact isn't lost (M3).
    private func handleUploadCompletion(
        _ descriptor: FieldBackgroundScanUploader.Descriptor,
        _ result: Result<Void, FieldBackgroundScanUploader.UploadError>) {
        if let waiter = artifactContinuations.removeValue(forKey: descriptor.kind) {
            waiter.resume(returning: result)
            return
        }
        if case .success = result { persistOrphanCompletion(descriptor) }
        bufferedCompletions[descriptor.kind] = result
    }

    /// A success with no waiter = a task that finished while the app was dead. Mark its
    /// artifact `uploaded` on the durable record (the plain bucket key — see
    /// `RoomScanStoragePath.storedReference`) so a later resume skips it rather than
    /// re-uploading (M3).
    private func persistOrphanCompletion(_ descriptor: FieldBackgroundScanUploader.Descriptor) {
        guard let record = store.scanUploadRecord(scanID: descriptor.scanID),
              let plan = Self.uploadDescriptors.first(where: { $0.kind == descriptor.kind }) else { return }
        var states = record.artifacts
        if states.first(where: { $0.kind == descriptor.kind })?.status == .uploaded { return }
        var state = states.first { $0.kind == descriptor.kind }
            ?? ScanArtifactUploadState(kind: descriptor.kind, relativePath: plan.relativePath,
                                       mimeType: descriptor.mimeType, column: plan.column)
        state.status = .uploaded
        state.storagePath = descriptor.storagePath
        state.remoteUrl = RoomScanStoragePath.storedReference(forObjectPath: descriptor.storagePath)
        state.sha256 = descriptor.sha256
        upsert(&states, state)
        store.updateScanUploadRecord(record, artifacts: states, status: "uploading")
    }

    private func upsert(_ states: inout [ScanArtifactUploadState], _ state: ScanArtifactUploadState) {
        if let index = states.firstIndex(where: { $0.kind == state.kind }) {
            states[index] = state
        } else {
            states.append(state)
        }
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
        do {
            return try await performUpload(
                result: result, projectID: projectID,
                projectRoomID: projectRoomID, name: name)
        } catch {
            let key = SiteScanBundleHome.relativeKey(for: result.localBundleURL)
            if let record = store.scanUploadRecord(bundlePath: key) {
                let prior = record.transferState
                let rejected: Bool
                if case SiteScanError.bundleRejected = error {
                    rejected = true
                } else {
                    rejected = false
                }
                store.updateScanUploadRecord(
                    record,
                    transfer: CaptureTransferState(
                        phase: rejected ? .rejected : .retryableFailure,
                        progress: prior.progress,
                        errorMessage: error.localizedDescription,
                        retryCount: prior.retryCount + (rejected ? 0 : 1)))
            }
            throw error
        }
    }

    private func performUpload(
        result: FieldScanResult,
        projectID: String?,
        projectRoomID: String?,
        name: String
    ) async throws -> FieldScanUploadReceipt {
        // Adopt the background session's surviving tasks before planning this upload, so
        // a resume dedups against them and their completions aren't dropped (M3).
        if !didReconcileUploads {
            didReconcileUploads = true
            await backgroundUploader.reconcileExistingTasks()
        }

        // 1. Reserve this attempt's scan/room ids — or resume a prior attempt's,
        //    if this is a retry (see `reservation(for:...)` doc below).
        let reserved = reservation(
            for: result.localBundleURL,
            projectID: projectID,
            projectRoomID: projectRoomID,
            name: name)
        guard reserved.record.transferState.phase != .rejected else {
            throw SiteScanError.bundleRejected
        }
        let userID = try await currentUserID()
        try await ensureRoom(
            reserved: reserved, picked: projectRoomID,
            name: name, userID: userID)
        let scanID = reserved.scanID
        let roomID = reserved.roomID
        store.updateScanUploadRecord(
            reserved.record,
            transfer: CaptureTransferState(
                phase: .uploading,
                progress: reserved.record.transferState.progress,
                retryCount: reserved.record.retryCount))
        // Re-derive the bundle dir under the CURRENT container from the durable relative
        // key (the app-container path may have moved since it was written) — C2.
        let bundle = (try? SiteScanBundleHome.resolve(relativeKey: reserved.record.bundlePath))
            ?? result.localBundleURL

        // 2. Upsert the processing row with routing + best-effort metrics.
        try await upsertProcessingScan(
            reserved: reserved, userID: userID,
            projectID: projectID, name: name)

        // 3. Upload the full artifact set + patch URL columns + scan_schema_version
        //    (resumable — already-uploaded artifacts are skipped). See the helper.
        let artifactStates = try await uploadBundleArtifacts(
            bundle: bundle, scanID: scanID, roomID: roomID, userID: userID, reserved: reserved)

        // 4. Never confirm a partial bundle.
        guard ScanUploadPlanner.allDone(artifactStates) else {
            throw SiteScanError.exportFailed("Scan upload didn't finish — retry to complete it.")
        }

        // 5. confirm-scan-bundle (with C1 unreachable-vs-rejected discrimination).
        store.updateScanUploadRecord(
            reserved.record,
            artifacts: artifactStates,
            transfer: CaptureTransferState(
                phase: .awaitingConfirmation, progress: 100,
                retryCount: reserved.record.retryCount))
        try await confirmBundle(scanID: scanID, reserved: reserved, artifactStates: artifactStates)

        // 6. Posed photos (I76) — SEPARATE, best-effort lane, STRICTLY after ready.
        do {
            try await uploadScanPhotos(bundle: bundle, scanID: scanID, roomID: roomID, userID: userID)
        } catch {
            logger.error("[SiteScan] posed-photo upload failed; scan is ready without photos: \(error.localizedDescription)")
        }

        store.updateScanUploadRecord(
            reserved.record,
            artifacts: artifactStates,
            transfer: CaptureTransferState(
                phase: .complete, progress: 100,
                retryCount: reserved.record.retryCount,
                receiptID: scanID.uuidString))
        // 7. Retention: the bytes are safely server-side — reclaim the local bundle (C2).
        SiteScanBundleHome.remove(bundleURL: bundle)
        return FieldScanUploadReceipt(remoteScanID: scanID.uuidString)
    }

    private func upsertProcessingScan(
        reserved: ScanReservation,
        userID: UUID,
        projectID: String?,
        name: String
    ) async throws {
        let now = ISO8601DateFormatter().string(from: Date())
        let metrics = scanMetrics()
        let insert = RoomScanInsert(
            id: reserved.scanID,
            user_id: userID,
            room_id: reserved.roomID,
            project_id: projectID.flatMap { UUID(uuidString: $0) },
            project_room_id: nil,
            name: name,
            status: "processing",
            dimensions: metrics.dims.map {
                .init(width: $0.x, length: $0.z, height: $0.y, unit: "meters")
            },
            floor_area: metrics.area,
            coverage_percentage: metrics.coverage,
            scanned_at: now,
            created_at: now)
        do {
            try await client.from("room_scans")
                .upsert(insert, onConflict: "id")
                .execute()
        } catch let error as PostgrestError
                    where error.message.contains("owned by a different designer") {
            throw SiteScanError.foreignProjectOwner
        }
    }

    /// confirm-scan-bundle HEAD-verifies the patched URLs server-side and flips the row to
    /// ready (it calls mark_scan_upload_complete on success). C1: only fall back to the
    /// mark-complete RPC when confirm was UNREACHABLE (transport / relay / not-deployed /
    /// 5xx) — a 409 (or any other 4xx) is the server rejecting THIS bundle, so we leave the
    /// row `processing`, mark the record incomplete, and surface retry instead of marking a
    /// broken bundle ready.
    private func confirmBundle(scanID: UUID, reserved: ScanReservation,
                               artifactStates: [ScanArtifactUploadState]) async throws {
        do {
            try await client.functions.invoke(
                "confirm-scan-bundle",
                options: FunctionInvokeOptions(body: ConfirmScanBundleRequest(scan_id: scanID.uuidString)))
        } catch {
            let status = Self.httpStatus(of: error)
            switch ScanConfirmPolicy.fallback(forHTTPStatus: status) {
            case .markCompleteViaRPC:
                logger.error("[SiteScan] confirm-scan-bundle unreachable (\(status.map(String.init) ?? "transport")); marking complete via RPC: \(error.localizedDescription)")
                try await client.rpc("mark_scan_upload_complete",
                                     params: ScanIDParam(p_scan_id: scanID.uuidString)).execute()
            case .propagate:
                logger.error("[SiteScan] confirm-scan-bundle rejected the bundle (status \(status.map(String.init) ?? "?")); leaving row processing for retry")
                store.updateScanUploadRecord(
                    reserved.record,
                    artifacts: artifactStates,
                    transfer: CaptureTransferState(
                        phase: .rejected, progress: 100,
                        errorMessage: SiteScanError.bundleRejected.localizedDescription,
                        retryCount: reserved.record.retryCount))
                throw SiteScanError.bundleRejected
            }
        }
    }

    /// Upload every on-disk bundle artifact (skipping already-uploaded ones on a
    /// resume), merge each SHA-256, patch the URL columns + scan_schema_version, and
    /// persist per-artifact progress on the durable record. The upload PLAN and the
    /// resume/short-circuit decisions come from `ScanUploadPlanner` (M1) — the tested
    /// contract IS the shipped path.
    private func uploadBundleArtifacts(bundle: URL, scanID: UUID, roomID: UUID, userID: UUID,
                                       reserved: ScanReservation) async throws -> [ScanArtifactUploadState] {
        // Tar the heavy streams + fold the archives into the manifest (Part 3), so a
        // 500 MB bundle uploads as a handful of background tasks, not ~700.
        buildTransportArchives(bundle: bundle)
        try? FieldManifestAssembler.refreshArtifacts(bundleDir: bundle)

        var states = reserved.record.artifacts
        // Only artifacts actually on disk are in scope — optional archives may be absent
        // on a degenerate scan, and the planner must be able to reach `.confirm`.
        let present = Self.uploadDescriptors.filter {
            FileManager.default.fileExists(atPath: bundle.appendingPathComponent($0.relativePath).path)
        }
        let allKinds = present.map(\.kind)

        // Already fully uploaded + confirmed ⇒ nothing to do (planner short-circuit).
        if case .done = ScanUploadPlanner.nextStep(all: allKinds, existing: states,
                                                   recordComplete: reserved.record.statusRaw == "complete") {
            return states
        }
        let plan = ScanUploadPlanner.kindsToUpload(all: allKinds, existing: states)

        for descriptor in present where plan.contains(descriptor.kind) {
            var working = states.first { $0.kind == descriptor.kind }
                ?? ScanArtifactUploadState(kind: descriptor.kind, relativePath: descriptor.relativePath,
                                           mimeType: descriptor.contentType, column: descriptor.column)
            guard ScanUploadPlanner.canAttempt(working) else {
                throw SiteScanError.exportFailed(
                    "Upload of \(descriptor.kind) failed repeatedly — please try this scan again later.")
            }
            working.attempts += 1

            let fileURL = bundle.appendingPathComponent(descriptor.relativePath)
            let sha = BundleChecksum.sha256(ofFile: fileURL)
            let storagePath = RoomScanStoragePath.object(folder: descriptor.folder, userID: userID,
                                                         roomID: roomID, filename: descriptor.filename)
            working.sha256 = sha
            working.storagePath = storagePath

            // Transport via the BACKGROUND session; await the delegate's completion.
            let ok = await uploadViaBackground(FieldBackgroundScanUploader.Descriptor(
                scanID: scanID.uuidString, kind: descriptor.kind, sha256: sha,
                mimeType: descriptor.contentType, fileURL: fileURL, storagePath: storagePath))
            guard ok else {
                working.status = .failed
                working.lastError = "background upload failed (attempt \(working.attempts))"
                upsert(&states, working)
                store.updateScanUploadRecord(
                    reserved.record,
                    artifacts: states,
                    status: CaptureTransferPhase.retryableFailure.rawValue)
                throw SiteScanError.exportFailed("Upload of \(descriptor.kind) failed — retry resumes where it left off.")
            }
            if let sha {
                try? await client.rpc("merge_scan_artifact_sha256",
                    params: ArtifactShaMergeParams(p_scan_id: scanID.uuidString,
                                                   p_kind: descriptor.kind, p_sha: sha)).execute()
            }
            working.status = .uploaded
            // The PLAIN BUCKET KEY, not a public URL. `room-scans` is private
            // (00031), so `/object/public/room-scans/<key>` returns 400 Bucket
            // not found — I104 caught `scan_bundle_url` and `depth_archive_url`
            // storing exactly that. Every consumer already strips whatever is
            // here back to a key and signs at read time; the reasoning and the
            // rejected alternatives live on `storedReference`.
            working.remoteUrl = RoomScanStoragePath.storedReference(forObjectPath: storagePath)
            upsert(&states, working)
            store.updateScanUploadRecord(reserved.record, artifacts: states, status: "uploading")
        }

        // Rebuild the URL-column patch from every uploaded artifact (covers a resume where
        // the bytes landed but the row patch didn't) + stamp the schema version.
        var patch = RoomScanArtifactPatch()
        for state in states where state.status == .uploaded {
            if let url = state.remoteUrl { patch.apply(column: state.column, url: url) }
        }
        try await client.from("room_scans").update(patch.withSchemaVersion(3))
            .eq("id", value: scanID.uuidString).execute()
        return states
    }

    /// Enqueue one artifact on the background session and await its completion via the
    /// per-kind continuation (bridged from the uploader's delegate callback). If a
    /// completion was already buffered (an adopted/re-delivered task finished before we
    /// registered a waiter), drain it instead of re-enqueueing (M3).
    private func uploadViaBackground(_ descriptor: FieldBackgroundScanUploader.Descriptor) async -> Bool {
        if let buffered = bufferedCompletions.removeValue(forKey: descriptor.kind) {
            if case .success = buffered { return true }
            return false
        }
        let result: Result<Void, FieldBackgroundScanUploader.UploadError> =
            await withCheckedContinuation { continuation in
                artifactContinuations[descriptor.kind] = continuation
                Task { await backgroundUploader.enqueue(descriptor) }
            }
        if case .success = result { return true }
        return false
    }

    /// The HTTP status of a `confirm-scan-bundle` failure, or nil when it wasn't an HTTP
    /// response (transport / relay error ⇒ unreachable) — feeds `ScanConfirmPolicy` (C1).
    private static func httpStatus(of error: Error) -> Int? {
        if let functionsError = error as? FunctionsError,
           case let .httpError(code, _) = functionsError { return code }
        return nil
    }

    /// Tar depth/*.bin → depth.tar and keyframes/*.heic+*.bin → keyframes.tar into the
    /// bundle dir (transport archives; the per-file dirs remain the logical form).
    private func buildTransportArchives(bundle: URL) {
        let fm = FileManager.default
        func tar(dir: String, extensions: Set<String>, to name: String) {
            let src = bundle.appendingPathComponent(dir, isDirectory: true)
            guard let files = try? fm.contentsOfDirectory(at: src, includingPropertiesForKeys: nil)
                .filter({ extensions.contains($0.pathExtension) }), !files.isEmpty else { return }
            // Members carry the bundle-relative path, NOT the bare filename — see
            // TarArchive.bundleEntries, where the rule and the reason live (R120).
            try? TarArchive.write(entries: TarArchive.bundleEntries(directory: dir, files: files),
                                  to: bundle.appendingPathComponent(name))
        }
        tar(dir: "depth", extensions: ["bin"], to: "depth.tar")
        tar(dir: "keyframes", extensions: ["heic", "bin"], to: "keyframes.tar")
    }

    /// The full v1 bundle artifact set (stable order) + the bucket MIME allow-list live
    /// in CaptureKit (`ScanUploadDescriptor.all` / `ScanBucketMime`) so the drift-guard
    /// test can assert every upload Content-Type is bucket-legal (the M2 MIME fix —
    /// depthIndex had gone up as application/x-ndjson → Storage 400 invalid_mime_type).
    private static let uploadDescriptors = ScanUploadDescriptor.all

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
    /// `ScanUploadRecord` (item 8) keyed by the bundle's container-independent relative
    /// path (`SiteScanBundleHome.relativeKey`). A relaunch (or a "Finish later" resume)
    /// reuses the SAME scanID instead of minting a fresh room_scans row (+ a spare rooms
    /// row), which is the orphaned-`processing`-row hazard the audit flagged in the prior
    /// in-memory dictionary.
    private func reservation(for bundleURL: URL, projectID: String?,
                             projectRoomID: String?,
                             name: String) -> ScanReservation {
        // Container-independent key so a resume re-finds the record after a container
        // move (C2) — "SiteScans/site-scan-…", not the volatile absolute path.
        let key = SiteScanBundleHome.relativeKey(for: bundleURL)
        if let existing = store.scanUploadRecord(bundlePath: key),
           let scanID = UUID(uuidString: existing.scanID),
           let roomID = UUID(uuidString: existing.roomID) {
            return ScanReservation(scanID: scanID, roomID: roomID, record: existing)   // resume
        }
        let roomID = projectRoomID.flatMap(UUID.init(uuidString:)) ?? UUID()
        let scanID = UUID()
        let record = store.insertScanUploadRecord(ScanUploadRecord(
            bundlePath: key, scanID: scanID.uuidString, roomID: roomID.uuidString,
            name: name, projectID: projectID, projectRoomID: projectRoomID))
        return ScanReservation(scanID: scanID, roomID: roomID, record: record)
    }

    // MARK: - Durable recovery

    func pendingUploads() async -> [FieldScanPendingUpload] {
        store.scanUploadRecords().map {
            FieldScanPendingUpload(
                id: $0.scanID,
                name: $0.name,
                projectID: $0.projectID,
                state: $0.transferState)
        }
    }

    /// Startup reconciliation seam: the composition root may call this with
    /// `retryFailures: false` after auth is ready. Explicit U1 retry passes true.
    /// The existing durable reservation keeps every replay idempotent.
    func resumePendingUploads(retryFailures: Bool) async {
        if !didReconcileUploads {
            didReconcileUploads = true
            await backgroundUploader.reconcileExistingTasks()
        }

        for record in store.scanUploadRecords() {
            let phase = record.transferState.phase
            if phase == .rejected || phase == .complete { continue }
            if phase == .retryableFailure, !retryFailures { continue }

            if phase == .retryableFailure {
                record.artifacts = record.artifacts.map { artifact in
                    var reset = artifact
                    if reset.status == .failed {
                        reset.status = .pending
                        reset.attempts = 0
                        reset.lastError = nil
                    }
                    return reset
                }
                record.applyTransferState(CaptureTransferState(
                    phase: .queued,
                    retryCount: record.retryCount))
                try? store.save()
            }

            guard let bundle = try? SiteScanBundleHome.resolve(
                relativeKey: record.bundlePath),
                FileManager.default.fileExists(atPath: bundle.path) else {
                store.updateScanUploadRecord(
                    record,
                    transfer: CaptureTransferState(
                        phase: .retryableFailure,
                        errorMessage: "The local scan bundle is unavailable.",
                        retryCount: record.retryCount + 1))
                continue
            }

            let result = FieldScanResult(
                localBundleURL: bundle,
                roomName: record.name)
            _ = try? await upload(
                result: result,
                projectID: record.projectID,
                projectRoomID: record.projectRoomID,
                name: record.name)
        }
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

    private func ensureRoom(
        reserved: ScanReservation,
        picked: String?,
        name: String,
        userID: UUID
    ) async throws {
        guard picked.flatMap(UUID.init(uuidString:)) == nil else { return }
        try await client.from("rooms")
            .upsert(
                RoomInsert(
                    id: reserved.roomID,
                    user_id: userID,
                    name: name,
                    type: "other"),
                onConflict: "id")
            .execute()
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
