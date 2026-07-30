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
    /// suspension; a per-scan/artifact continuation bridges the callback back into the
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
        [ScanArtifactTransferKey: CheckedContinuation<Result<Void, FieldBackgroundScanUploader.UploadError>, Never>] = [:]
    /// Completions that arrived with no waiter yet — a task that finished (or was
    /// re-delivered on relaunch) before `uploadViaBackground` registered its continuation.
    /// Drained by the next matching `uploadViaBackground` (item 8 · M3).
    private var bufferedCompletions:
        [ScanArtifactTransferKey: Result<Void, FieldBackgroundScanUploader.UploadError>] = [:]
    /// Startup recovery, U1 retry, and F4 may converge on the same durable scan.
    /// One task owns its background continuations and confirmation at a time.
    private var activeUploadTasks:
        [ScanUploadFlightKey: Task<FieldScanUploadReceipt, Error>] = [:]

    init(deps: WorkServiceDependencies) {
        self.client = deps.client
        self.session = deps.session
        self.store = deps.store

        // A durable non-complete record owns its bundle bytes, including rejected
        // and receiptless legacy "complete" rows. Only unowned old directories
        // are eligible for best-effort orphan cleanup.
        let protectedBundlePaths = store.scanBundlePathsProtectedFromSweep()
        Task.detached { [protectedBundlePaths] in
            SiteScanBundleHome.sweepOrphans(
                protectedRelativeKeys: protectedBundlePaths
            )
        }
    }

    /// Route a background-upload completion: resolve an in-process waiter if present,
    /// else buffer it — and, for an orphaned success (a task that finished while the app
    /// was dead), advance the durable record so the artifact isn't lost (M3).
    private func handleUploadCompletion(
        _ descriptor: FieldBackgroundScanUploader.Descriptor,
        _ result: Result<Void, FieldBackgroundScanUploader.UploadError>
    ) {
        guard let owner = CaptureOwnerIdentity(
            userID: descriptor.ownerUserID,
            workspaceID: descriptor.ownerWorkspaceID
        ) else { return }
        let key = ScanArtifactTransferKey(
            owner: owner,
            scanID: descriptor.scanID,
            kind: descriptor.kind
        )
        if let waiter = artifactContinuations.removeValue(forKey: key) {
            waiter.resume(returning: result)
            return
        }
        if case .success = result { persistOrphanCompletion(descriptor) }
        bufferedCompletions[key] = result
    }

    /// A success with no waiter = a task that finished while the app was dead. Mark its
    /// artifact `uploaded` on the durable record (the plain bucket key — see
    /// `RoomScanStoragePath.storedReference`) so a later resume skips it rather than
    /// re-uploading (M3).
    private func persistOrphanCompletion(
        _ descriptor: FieldBackgroundScanUploader.Descriptor
    ) {
        guard let owner = CaptureOwnerIdentity(
                userID: descriptor.ownerUserID,
                workspaceID: descriptor.ownerWorkspaceID
              ),
              let record = store.scanUploadRecord(
                scanID: descriptor.scanID,
                owner: owner
              ),
              let plan = Self.uploadDescriptors.first(where: {
                $0.kind == descriptor.kind
              }) else { return }
        let phase = record.transferState.phase
        guard phase != .complete, phase != .rejected else { return }

        var artifact = record.artifacts.first {
            $0.kind == descriptor.kind
        } ?? ScanArtifactUploadState(
            kind: descriptor.kind,
            relativePath: plan.relativePath,
            mimeType: descriptor.mimeType,
            column: plan.column
        )
        artifact.status = .uploaded
        artifact.storagePath = descriptor.storagePath
        artifact.remoteUrl = RoomScanStoragePath.storedReference(
            forObjectPath: descriptor.storagePath
        )
        artifact.sha256 = descriptor.sha256
        store.applyBackgroundScanArtifactCompletion(
            artifact,
            to: record
        )
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
        guard RoomCaptureSession.isSupported else {
            throw SiteScanError.unsupported
        }
        guard let owner = activeOwner else {
            throw SiteScanError.notAuthenticated
        }
        let scan = RoomPlanScanSession(owner: owner)
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
        guard let owner = activeOwner,
              let studioID = UUID(uuidString: owner.workspaceID) else {
            throw SiteScanError.notAuthenticated
        }
        let userID = try await currentUserID()
        try requireActiveOwner(owner)
        guard owner.matches(
            userID: userID.uuidString,
            workspaceID: studioID.uuidString
        ) else {
            throw SiteScanError.notAuthenticated
        }

        let rows: [OwnableProjectRow]
        do {
            rows = try await client
                .from("projects")
                .select("id, name")
                .eq("studio_id", value: studioID.uuidString)
                .or(
                    "designer_id.eq.\(userID.uuidString),"
                        + "created_by.eq.\(userID.uuidString)"
                )
                .order("updated_at", ascending: false)
                .execute()
                .value
        } catch {
            try requireActiveOwner(owner)
            throw error
        }
        try requireActiveOwner(owner)
        return rows.map {
            FieldProject(id: $0.id, name: $0.name, status: "")
        }
    }

    // MARK: - Upload

    func upload(
        result: FieldScanResult,
        projectID: String?,
        projectRoomID: String?,
        name: String
    ) async throws -> FieldScanUploadReceipt {
        guard let owner = activeOwner else {
            throw SiteScanError.notAuthenticated
        }
        guard result.owner == owner else {
            throw SiteScanError.exportFailed(
                "This scan belongs to a different account or workspace."
            )
        }
        let flightKey = ScanUploadFlightKey(
            owner: owner,
            bundlePath: SiteScanBundleHome.relativeKey(
                for: result.localBundleURL
            )
        )
        if let active = activeUploadTasks[flightKey] {
            return try await active.value
        }

        let task = Task { @MainActor [self] in
            defer { self.activeUploadTasks.removeValue(forKey: flightKey) }
            return try await self.performUploadRecordingFailure(
                result: result,
                projectID: projectID,
                projectRoomID: projectRoomID,
                name: name,
                owner: owner
            )
        }
        activeUploadTasks[flightKey] = task
        return try await task.value
    }

    private func performUploadRecordingFailure(
        result: FieldScanResult,
        projectID: String?,
        projectRoomID: String?,
        name: String,
        owner: CaptureOwnerIdentity
    ) async throws -> FieldScanUploadReceipt {
        do {
            return try await performUpload(
                result: result,
                projectID: projectID,
                projectRoomID: projectRoomID,
                name: name,
                owner: owner
            )
        } catch {
            let key = SiteScanBundleHome.relativeKey(
                for: result.localBundleURL
            )
            if activeOwner == owner,
               let record = store.scanUploadRecord(
                bundlePath: key,
                owner: owner
            ) {
                let prior = record.transferState
                let rejected: Bool
                if error is ScanArtifactIntegrityError {
                    rejected = true
                } else if case SiteScanError.bundleRejected = error {
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
                        retryCount: prior.retryCount + (rejected ? 0 : 1)
                    )
                )
            }
            throw error
        }
    }

    private func performUpload(
        result: FieldScanResult,
        projectID: String?,
        projectRoomID: String?,
        name: String,
        owner: CaptureOwnerIdentity
    ) async throws -> FieldScanUploadReceipt {
        let prepared = try await prepareUpload(
            result: result,
            projectID: projectID,
            projectRoomID: projectRoomID,
            name: name,
            owner: owner
        )
        let reserved = prepared.reserved
        let states = try await uploadBundleArtifacts(
            ArtifactUploadContext(
                bundle: prepared.bundle,
                scanID: reserved.scanID,
                roomID: reserved.roomID,
                userID: prepared.userID,
                reserved: reserved,
                owner: prepared.owner
            )
        )
        try requireActiveOwner(prepared.owner)
        try validateRequiredScanArtifacts(in: prepared.bundle)
        let requiredKinds = Self.uploadDescriptors.map(\.kind)
        guard ScanUploadPlanner.allRequiredUploaded(
            requiredKinds,
            existing: states
        ) else {
            throw SiteScanError.exportFailed(
                "Scan upload didn't finish — retry to complete it."
            )
        }

        try requireActiveOwner(prepared.owner)
        store.updateScanUploadRecord(
            reserved.record,
            artifacts: states,
            transfer: CaptureTransferState(
                phase: .awaitingConfirmation,
                progress: 100,
                retryCount: reserved.record.retryCount
            )
        )
        try await confirmBundle(
            scanID: reserved.scanID,
            reserved: reserved,
            artifactStates: states,
            owner: prepared.owner
        )
        try requireActiveOwner(prepared.owner)
        try await uploadPosedPhotosBestEffort(prepared)

        let receiptID = reserved.scanID.uuidString
        try requireActiveOwner(prepared.owner)
        try store.persistCompletedScanUploadRecord(
            reserved.record,
            artifacts: states,
            receiptID: receiptID
        )
        try requireActiveOwner(prepared.owner)
        SiteScanBundleHome.remove(bundleURL: prepared.bundle)
        return FieldScanUploadReceipt(remoteScanID: receiptID)
    }

    private func prepareUpload(
        result: FieldScanResult,
        projectID: String?,
        projectRoomID: String?,
        name: String,
        owner: CaptureOwnerIdentity
    ) async throws -> PreparedUpload {
        try requireActiveOwner(owner)
        guard result.owner == owner else {
            throw SiteScanError.notAuthenticated
        }
        await backgroundUploader.reconcileExistingTasks()
        try requireActiveOwner(owner)

        let userID = try await validatedUserID(for: owner)
        let reserved = try reservation(
            for: result.localBundleURL,
            projectID: projectID,
            projectRoomID: projectRoomID,
            name: name,
            owner: owner
        )
        guard reserved.record.transferState.phase != .rejected else {
            throw SiteScanError.bundleRejected
        }

        try await ensureRoom(
            reserved: reserved,
            picked: projectRoomID,
            name: name,
            userID: userID,
            owner: owner
        )
        try requireActiveOwner(owner)
        store.updateScanUploadRecord(
            reserved.record,
            transfer: CaptureTransferState(
                phase: .uploading,
                progress: reserved.record.transferState.progress,
                retryCount: reserved.record.retryCount
            )
        )
        let bundle = (
            try? SiteScanBundleHome.resolve(
                relativeKey: reserved.record.bundlePath
            )
        ) ?? result.localBundleURL
        try await insertProcessingScanIfNeeded(
            reserved: reserved,
            userID: userID,
            projectID: projectID,
            name: name,
            owner: owner
        )
        try requireActiveOwner(owner)
        return PreparedUpload(
            owner: owner,
            userID: userID,
            reserved: reserved,
            bundle: bundle
        )
    }

    private func uploadPosedPhotosBestEffort(
        _ prepared: PreparedUpload
    ) async throws {
        do {
            try await uploadScanPhotos(
                bundle: prepared.bundle,
                scanID: prepared.reserved.scanID,
                roomID: prepared.reserved.roomID,
                userID: prepared.userID,
                owner: prepared.owner
            )
        } catch {
            try requireActiveOwner(prepared.owner)
            logger.error(
                "[SiteScan] posed-photo upload failed; scan is ready without photos: \(error.localizedDescription)"
            )
        }
        try requireActiveOwner(prepared.owner)
    }

    private func insertProcessingScanIfNeeded(
        reserved: ScanReservation,
        userID: UUID,
        projectID: String?,
        name: String,
        owner: CaptureOwnerIdentity
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
            try requireActiveOwner(owner)
            try await client.from("room_scans")
                .upsert(
                    insert,
                    onConflict: "id",
                    returning: .minimal,
                    ignoreDuplicates: true
                )
                .execute()
            try requireActiveOwner(owner)
        } catch {
            try requireActiveOwner(owner)
            if let error = error as? PostgrestError,
               error.message.contains("owned by a different designer") {
                throw SiteScanError.foreignProjectOwner
            }
            throw error
        }
    }

    /// confirm-scan-bundle HEAD-verifies the patched URLs server-side and flips the row to
    /// ready (it calls mark_scan_upload_complete on success). C1: only fall back to the
    /// mark-complete RPC when confirm was UNREACHABLE (transport / relay / not-deployed /
    /// 5xx) — a 409 (or any other 4xx) is the server rejecting THIS bundle, so we leave the
    /// row `processing`, mark the record incomplete, and surface retry instead of marking a
    /// broken bundle ready.
    private func confirmBundle(
        scanID: UUID,
        reserved: ScanReservation,
        artifactStates: [ScanArtifactUploadState],
        owner: CaptureOwnerIdentity
    ) async throws {
        do {
            try requireActiveOwner(owner)
            try await client.functions.invoke(
                "confirm-scan-bundle",
                options: FunctionInvokeOptions(body: ConfirmScanBundleRequest(scan_id: scanID.uuidString)))
            try requireActiveOwner(owner)
        } catch {
            try requireActiveOwner(owner)
            let status = Self.httpStatus(of: error)
            switch ScanConfirmPolicy.fallback(forHTTPStatus: status) {
            case .markCompleteViaRPC:
                logger.error("[SiteScan] confirm-scan-bundle unreachable (\(status.map(String.init) ?? "transport")); marking complete via RPC: \(error.localizedDescription)")
                try requireActiveOwner(owner)
                try await client.rpc("mark_scan_upload_complete",
                                     params: ScanIDParam(p_scan_id: scanID.uuidString)).execute()
                try requireActiveOwner(owner)
            case .propagate:
                logger.error("[SiteScan] confirm-scan-bundle rejected the bundle (status \(status.map(String.init) ?? "?")); leaving row processing for retry")
                try requireActiveOwner(owner)
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
    private func uploadBundleArtifacts(
        _ context: ArtifactUploadContext
    ) async throws -> [ScanArtifactUploadState] {
        try requireActiveOwner(context.owner)
        try buildTransportArchives(bundle: context.bundle)
        try FieldManifestAssembler.refreshArtifacts(
            bundleDir: context.bundle
        )
        try validateRequiredScanArtifacts(in: context.bundle)

        var states = context.reserved.record.artifacts
        let allKinds = Self.uploadDescriptors.map(\.kind)
        if case .done = ScanUploadPlanner.nextStep(
            all: allKinds,
            existing: states,
            recordComplete: context.reserved.record.statusRaw == "complete"
        ) {
            try requireActiveOwner(context.owner)
            return states
        }
        let plan = ScanUploadPlanner.kindsToUpload(
            all: allKinds,
            existing: states
        )

        for descriptor in Self.uploadDescriptors
            where plan.contains(descriptor.kind) {
            try requireActiveOwner(context.owner)
            let uploaded = try await uploadArtifact(
                descriptor,
                existing: states,
                context: context
            )
            try requireActiveOwner(context.owner)
            upsert(&states, uploaded)
            store.updateScanUploadRecord(
                context.reserved.record,
                artifacts: states,
                status: CaptureTransferPhase.uploading.rawValue
            )
        }

        try await patchArtifactReferences(
            states,
            context: context
        )
        try requireActiveOwner(context.owner)
        return states
    }

    private func uploadArtifact(
        _ descriptor: ScanUploadDescriptor,
        existing states: [ScanArtifactUploadState],
        context: ArtifactUploadContext
    ) async throws -> ScanArtifactUploadState {
        try requireActiveOwner(context.owner)
        var working = states.first { $0.kind == descriptor.kind }
            ?? ScanArtifactUploadState(
                kind: descriptor.kind,
                relativePath: descriptor.relativePath,
                mimeType: descriptor.contentType,
                column: descriptor.column
            )
        guard ScanUploadPlanner.canAttempt(working) else {
            throw SiteScanError.exportFailed(
                "Upload of \(descriptor.kind) failed repeatedly — "
                    + "please try this scan again later."
            )
        }
        working.attempts += 1
        let fileURL = context.bundle.appendingPathComponent(descriptor.relativePath)
        let sha = BundleChecksum.sha256(ofFile: fileURL)
        let storagePath = RoomScanStoragePath.object(
            folder: descriptor.folder,
            userID: context.userID,
            roomID: context.roomID,
            filename: descriptor.filename
        )
        working.sha256 = sha
        working.storagePath = storagePath

        try requireActiveOwner(context.owner)
        let uploaded = await uploadViaBackground(
            backgroundDescriptor(
                for: descriptor,
                fileURL: fileURL,
                sha: sha,
                storagePath: storagePath,
                context: context
            )
        )
        try requireActiveOwner(context.owner)
        guard uploaded else {
            try recordArtifactFailure(
                &working,
                existing: states,
                context: context
            )
            throw SiteScanError.exportFailed(
                "Upload of \(descriptor.kind) failed — retry resumes "
                    + "where it left off."
            )
        }
        if let sha {
            try await mergeArtifactChecksum(
                sha,
                kind: descriptor.kind,
                context: context
            )
        }
        try requireActiveOwner(context.owner)
        working.status = .uploaded
        working.remoteUrl = RoomScanStoragePath.storedReference(forObjectPath: storagePath)
        return working
    }

    private func backgroundDescriptor(
        for descriptor: ScanUploadDescriptor,
        fileURL: URL,
        sha: String?,
        storagePath: String,
        context: ArtifactUploadContext
    ) -> FieldBackgroundScanUploader.Descriptor {
        FieldBackgroundScanUploader.Descriptor(
            scanID: context.scanID.uuidString,
            kind: descriptor.kind,
            ownerUserID: context.owner.userID,
            ownerWorkspaceID: context.owner.workspaceID,
            sha256: sha,
            mimeType: descriptor.contentType,
            fileURL: fileURL,
            storagePath: storagePath
        )
    }

    private func recordArtifactFailure(
        _ artifact: inout ScanArtifactUploadState,
        existing states: [ScanArtifactUploadState],
        context: ArtifactUploadContext
    ) throws {
        try requireActiveOwner(context.owner)
        artifact.status = .failed
        artifact.lastError = "background upload failed "
            + "(attempt \(artifact.attempts))"
        var failedStates = states
        upsert(&failedStates, artifact)
        store.updateScanUploadRecord(
            context.reserved.record,
            artifacts: failedStates,
            status: CaptureTransferPhase.retryableFailure.rawValue
        )
    }

    private func mergeArtifactChecksum(
        _ sha: String,
        kind: String,
        context: ArtifactUploadContext
    ) async throws {
        try requireActiveOwner(context.owner)
        _ = try? await client.rpc(
            "merge_scan_artifact_sha256",
            params: ArtifactShaMergeParams(
                p_scan_id: context.scanID.uuidString,
                p_kind: kind,
                p_sha: sha
            )
        ).execute()
        try requireActiveOwner(context.owner)
    }

    private func patchArtifactReferences(
        _ states: [ScanArtifactUploadState],
        context: ArtifactUploadContext
    ) async throws {
        try requireActiveOwner(context.owner)
        var patch = RoomScanArtifactPatch()
        for state in states where state.status == .uploaded {
            if let url = state.remoteUrl {
                patch.apply(column: state.column, url: url)
            }
        }
        try requireActiveOwner(context.owner)
        do {
            try await client.from("room_scans")
                .update(patch.withSchemaVersion(3))
                .eq("id", value: context.scanID.uuidString)
                .execute()
        } catch {
            try requireActiveOwner(context.owner)
            throw error
        }
        try requireActiveOwner(context.owner)
    }

    /// Enqueue one artifact on the background session and await its completion via the
    /// per-scan/artifact continuation (bridged from the delegate callback). If a
    /// completion was already buffered (an adopted/re-delivered task finished before we
    /// registered a waiter), drain it instead of re-enqueueing (M3).
    private func uploadViaBackground(
        _ descriptor: FieldBackgroundScanUploader.Descriptor
    ) async -> Bool {
        guard let owner = CaptureOwnerIdentity(
            userID: descriptor.ownerUserID,
            workspaceID: descriptor.ownerWorkspaceID
        ) else { return false }
        let key = ScanArtifactTransferKey(
            owner: owner,
            scanID: descriptor.scanID,
            kind: descriptor.kind
        )
        if let buffered = bufferedCompletions.removeValue(forKey: key) {
            if case .success = buffered { return true }
            return false
        }
        let result: Result<Void, FieldBackgroundScanUploader.UploadError> =
            await withCheckedContinuation { continuation in
                artifactContinuations[key] = continuation
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
    private func validateRequiredScanArtifacts(in bundle: URL) throws {
        let missing = ScanUploadDescriptor.missingRequiredArtifacts(
            in: bundle
        )
        guard missing.isEmpty else {
            throw ScanArtifactIntegrityError.missingRequiredArtifacts(
                missing.map(\.kind)
            )
        }
    }

    private func buildTransportArchives(bundle: URL) throws {
        let fileManager = FileManager.default
        func tar(
            directory: String,
            extensions: Set<String>,
            name: String
        ) throws {
            let source = bundle.appendingPathComponent(
                directory,
                isDirectory: true
            )
            let files = (try? fileManager.contentsOfDirectory(
                at: source,
                includingPropertiesForKeys: nil
            ))?.filter { extensions.contains($0.pathExtension) } ?? []
            guard !files.isEmpty else { return }
            try TarArchive.write(
                entries: TarArchive.bundleEntries(
                    directory: directory,
                    files: files
                ),
                to: bundle.appendingPathComponent(name)
            )
        }
        try tar(
            directory: "depth",
            extensions: ["bin"],
            name: "depth.tar"
        )
        try tar(
            directory: "keyframes",
            extensions: ["heic", "bin"],
            name: "keyframes.tar"
        )
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

    private struct PreparedUpload {
        let owner: CaptureOwnerIdentity
        let userID: UUID
        let reserved: ScanReservation
        let bundle: URL
    }

    private struct ArtifactUploadContext {
        let bundle: URL
        let scanID: UUID
        let roomID: UUID
        let userID: UUID
        let reserved: ScanReservation
        let owner: CaptureOwnerIdentity
    }

    /// The DURABLE (scanID, roomID) reservation for a bundle — persisted in a
    /// `ScanUploadRecord` (item 8) keyed by the bundle's container-independent relative
    /// path (`SiteScanBundleHome.relativeKey`). A relaunch (or a "Finish later" resume)
    /// reuses the SAME scanID instead of minting a fresh room_scans row (+ a spare rooms
    /// row), which is the orphaned-`processing`-row hazard the audit flagged in the prior
    /// in-memory dictionary.
    private func reservation(
        for bundleURL: URL,
        projectID: String?,
        projectRoomID: String?,
        name: String,
        owner: CaptureOwnerIdentity
    ) throws -> ScanReservation {
        let key = SiteScanBundleHome.relativeKey(for: bundleURL)
        if let existing = store.scanUploadRecord(bundlePath: key) {
            guard owner.matches(
                userID: existing.ownerUserID,
                workspaceID: existing.ownerWorkspaceID
            ) else {
                throw SiteScanError.exportFailed(
                    "This scan belongs to a different account or workspace."
                )
            }
            guard let scanID = UUID(uuidString: existing.scanID),
                  let roomID = UUID(uuidString: existing.roomID) else {
                throw SiteScanError.exportFailed(
                    "This scan’s local transfer record is invalid."
                )
            }
            return ScanReservation(
                scanID: scanID,
                roomID: roomID,
                record: existing
            )
        }

        let roomID = projectRoomID.flatMap(UUID.init(uuidString:)) ?? UUID()
        let scanID = UUID()
        let record = try store.insertScanUploadRecord(ScanUploadRecord(
            bundlePath: key,
            scanID: scanID.uuidString,
            roomID: roomID.uuidString,
            name: name,
            projectID: projectID,
            projectRoomID: projectRoomID,
            owner: owner
        ))
        return ScanReservation(
            scanID: scanID,
            roomID: roomID,
            record: record
        )
    }

    // MARK: - Durable recovery

    func pendingUploads() async -> [FieldScanPendingUpload] {
        guard let owner = activeOwner else { return [] }
        return store.scanUploadRecords(owner: owner).map {
            FieldScanPendingUpload(
                id: $0.scanID,
                name: $0.name,
                projectID: $0.projectID,
                state: $0.transferState
            )
        }
    }

    /// Explicit recovery for one user-reviewed failure/rejection.
    func retryPendingUpload(
        id: String
    ) async throws -> FieldScanUploadReceipt {
        guard let owner = activeOwner else {
            throw SiteScanError.notAuthenticated
        }
        guard let record = store.scanUploadRecord(
            scanID: id,
            owner: owner
        ) else {
            throw FieldScanRecoveryError.transferNotFound
        }
        let phase = record.transferState.phase
        guard phase == .rejected || phase == .retryableFailure else {
            throw FieldScanRecoveryError.invalidTransferState
        }
        guard let bundle = try? SiteScanBundleHome.resolve(
            relativeKey: record.bundlePath
        ), FileManager.default.fileExists(atPath: bundle.path) else {
            store.updateScanUploadRecord(
                record,
                transfer: CaptureTransferState(
                    phase: .rejected,
                    progress: record.transferState.progress,
                    errorMessage: FieldScanRecoveryError
                        .localBundleUnavailable.localizedDescription,
                    retryCount: record.retryCount
                )
            )
            throw FieldScanRecoveryError.localBundleUnavailable
        }

        record.prepareForRetry()
        try store.save()
        return try await upload(
            result: FieldScanResult(
                localBundleURL: bundle,
                roomName: record.name,
                owner: owner
            ),
            projectID: record.projectID,
            projectRoomID: record.projectRoomID,
            name: record.name
        )
    }

    /// Startup reconciliation seam: the composition root may call this with
    /// `retryFailures: false` after auth is ready. Explicit U1 retry passes true.
    /// The existing durable reservation keeps every replay idempotent.
    func resumePendingUploads(retryFailures: Bool) async {
        guard let owner = activeOwner else { return }

        await backgroundUploader.reconcileExistingTasks()
        guard activeOwner == owner else { return }

        for record in store.scanUploadRecords(owner: owner) {
            guard activeOwner == owner else { return }
            let phase = record.transferState.phase
            guard FieldScanRecoveryPolicy.canResumeWithoutReview(
                phase: phase,
                retryFailures: retryFailures
            ) else { continue }

            if phase == .retryableFailure {
                record.prepareForRetry()
                do {
                    try store.save()
                } catch {
                    continue
                }
            }

            guard let bundle = try? SiteScanBundleHome.resolve(
                relativeKey: record.bundlePath
            ),
            FileManager.default.fileExists(atPath: bundle.path) else {
                store.updateScanUploadRecord(
                    record,
                    transfer: CaptureTransferState(
                        phase: .retryableFailure,
                        errorMessage: "The local scan bundle is unavailable.",
                        retryCount: record.retryCount + 1
                    )
                )
                continue
            }

            let result = FieldScanResult(
                localBundleURL: bundle,
                roomName: record.name,
                owner: owner
            )
            _ = try? await upload(
                result: result,
                projectID: record.projectID,
                projectRoomID: record.projectRoomID,
                name: record.name
            )
        }
    }

    private var activeOwner: CaptureOwnerIdentity? {
        CaptureOwnerIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID
        )
    }

    private func requireActiveOwner(_ owner: CaptureOwnerIdentity) throws {
        guard activeOwner == owner else {
            throw SiteScanError.notAuthenticated
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

    private func validatedUserID(
        for owner: CaptureOwnerIdentity
    ) async throws -> UUID {
        let userID = try await currentUserID()
        try requireActiveOwner(owner)
        guard owner.matches(
            userID: userID.uuidString,
            workspaceID: session.workspaceID
        ) else {
            throw SiteScanError.notAuthenticated
        }
        return userID
    }

    private func ensureRoom(
        reserved: ScanReservation,
        picked: String?,
        name: String,
        userID: UUID,
        owner: CaptureOwnerIdentity
    ) async throws {
        guard picked.flatMap(UUID.init(uuidString:)) == nil else { return }
        try requireActiveOwner(owner)
        do {
            try await client.from("rooms")
                .upsert(
                    RoomInsert(
                        id: reserved.roomID,
                        user_id: userID,
                        name: name,
                        type: "other"),
                    onConflict: "id")
                .execute()
        } catch {
            try requireActiveOwner(owner)
            throw error
        }
        try requireActiveOwner(owner)
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
    private func uploadScanPhotos(
        bundle: URL,
        scanID: UUID,
        roomID: UUID,
        userID: UUID,
        owner: CaptureOwnerIdentity
    ) async throws {
        try requireActiveOwner(owner)
        let sidecarURL = bundle.appendingPathComponent(RoomScanStoragePath.Filename.photosMetadata)
        guard let sidecarData = try? Data(contentsOf: sidecarURL) else { return } // no photos captured
        let entries = try JSONDecoder().decode([FieldPhotoEntry].self, from: sidecarData)
        guard !entries.isEmpty else { return }

        let photosDir = bundle.appendingPathComponent(RoomScanStoragePath.Folder.photos, isDirectory: true)
        var rows: [FieldRoomScanImageInsert] = []
        rows.reserveCapacity(entries.count)

        for (index, entry) in entries.enumerated() {
            try requireActiveOwner(owner)
            do {
                // Full JPEG (required for a row).
                let jpegData = try Data(contentsOf: photosDir.appendingPathComponent(entry.filename))
                let jpegPath = RoomScanStoragePath.object(
                    folder: RoomScanStoragePath.Folder.photos, userID: userID,
                    roomID: roomID, filename: entry.filename)
                try requireActiveOwner(owner)
                try await client.storage.from(bucket).upload(
                    jpegPath, data: jpegData,
                    options: FileOptions(contentType: "image/jpeg", upsert: true))
                try requireActiveOwner(owner)
                let imageURL = try client.storage.from(bucket).getPublicURL(path: jpegPath).absoluteString

                // 256px thumb — populated from day one. If the thumb is missing or
                // its upload fails, fall back to the full JPEG URL so the
                // thumbnail_url column is never null.
                var thumbnailURL = imageURL
                if let thumbName = entry.thumbnailFilename {
                    do {
                        let thumbData = try Data(contentsOf: photosDir.appendingPathComponent(thumbName))
                        let thumbPath = RoomScanStoragePath.object(
                            folder: RoomScanStoragePath.Folder.photos, userID: userID,
                            roomID: roomID, filename: thumbName)
                        try requireActiveOwner(owner)
                        try await client.storage.from(bucket).upload(
                            thumbPath, data: thumbData,
                            options: FileOptions(contentType: "image/jpeg", upsert: true))
                        try requireActiveOwner(owner)
                        thumbnailURL = try client.storage.from(bucket).getPublicURL(path: thumbPath).absoluteString
                    } catch {
                        try requireActiveOwner(owner)
                        logger.error("[SiteScan] thumb upload failed (\(thumbName)); using full image URL: \(error.localizedDescription)")
                    }
                }

                try requireActiveOwner(owner)
                rows.append(FieldRoomScanImageInsert.auto(
                    from: entry, scanID: scanID, roomID: roomID,
                    displayOrder: index + 1, urls: (image: imageURL, thumbnail: thumbnailURL)))
            } catch {
                try requireActiveOwner(owner)
                logger.error("[SiteScan] posed photo skipped (\(entry.filename)): \(error.localizedDescription)")
            }
        }

        try requireActiveOwner(owner)
        guard !rows.isEmpty else { return }
        try requireActiveOwner(owner)
        try await client.from("room_scan_images")
            .upsert(
                rows,
                onConflict: "id",
                returning: .minimal
            )
            .execute()
        try requireActiveOwner(owner)
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

private struct ScanUploadFlightKey: Hashable {
    let owner: CaptureOwnerIdentity
    let bundlePath: String
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
