//
//  RoomScanSyncService+AdvancedBundle.swift
//  Patina
//
//  Advanced-scan (v2/v3) bundle upload orchestration for
//  RoomScanSyncService, split out of the main service file (PT-6-1).
//  This is a same-module extension on the existing `final class` so the
//  public API is unchanged — `uploadAdvancedScanBundle(...)` and
//  `resumePendingUploads(in:)` still live on RoomScanSyncService.
//
//  The orchestration here mutates RoomScanPackage.artifactState and
//  drives the bounded-concurrency artifact loop + posed-photo loop; the
//  stateless per-artifact byte-push lives in ArtifactUploader.
//

import Foundation
import Supabase
import SwiftData

/// Why an advanced-bundle upload is running. Drives whether the passive
/// cellular gate applies.
public enum UploadIntent: Sendable {
    /// Background/launch resume of a previously-committed upload. Honours the
    /// passive cellular gate (parks in `.pending` on a metered network when
    /// the user hasn't opted in). This is the default for `resumePendingUploads`.
    case backgroundSync
    /// The user explicitly tapped "Send" in the design-request flow. The
    /// request UI has already shown an inline metered-connection consent
    /// prompt, so the passive gate is bypassed — parking here would strand the
    /// user's in-flight request behind a Wi-Fi wait they didn't ask for.
    case userRequested
}

extension RoomScanSyncService {

    /// Upload an advanced-scan bundle end-to-end.
    ///
    /// Reads the manifest from disk, creates the parent `rooms` row (if new),
    /// inserts the `room_scans` row with v2 columns, then iterates every
    /// artifact in the manifest, uploading it to Supabase Storage and
    /// PATCHing the matching URL column. Photo metadata is inserted with full
    /// camera pose into `room_scan_images`. `room_features` rows are
    /// derived from the CapturedRoom parametric JSON when available.
    ///
    /// Per-artifact state is tracked on `RoomScanPackage.artifactState` so
    /// the upload is resumable if the app is killed mid-way.
    @discardableResult
    public func uploadAdvancedScanBundle(
        package: RoomScanPackage,
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        projectId: UUID? = nil,
        intent: UploadIntent = .backgroundSync
    ) async throws -> UploadResult {
        // Cellular gate: when on a metered network and the user hasn't
        // opted in, park the package in .pending with a "Waiting for Wi-Fi"
        // breadcrumb. The network monitor will re-enter this method via
        // `resumePendingUploads` on the next expensive→cheap transition. We
        // deliberately do NOT throw — the UI treats this as a benign
        // deferred state, not a failure.
        //
        // A `.userRequested` upload bypasses the passive gate entirely: the
        // design-request flow shows its own inline metered-data consent before
        // it ever calls in here, so parking would strand the user's request.
        if intent == .backgroundSync,
           cachedIsExpensive,
           !UserDefaults.standard.bool(forKey: Self.cellularOptInKey) {
            package.status = .pending
            package.lastError = "Waiting for Wi-Fi"
            try? modelContext?.save()
            PatinaLog.sync.debug("[RoomScanSync] deferred scan \(package.scanId) — on cellular without opt-in")
            return UploadResult(
                roomId: package.remoteRoomId ?? roomData.roomId,
                scanId: package.scanId
            )
        }

        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        await AuthService.shared.waitForAuthReady()
        guard let userId = await getCurrentUserId() else {
            let err = RoomScanSyncError.notAuthenticated
            lastError = err
            throw err
        }

        guard let bundleURL = package.absoluteBundleURL,
              FileManager.default.fileExists(atPath: bundleURL.path) else {
            let err = RoomScanSyncError.uploadFailed("Bundle directory missing at \(package.bundlePath)")
            lastError = err
            throw err
        }

        let manifest: ScanManifest
        do {
            manifest = try ScanBundleWriter.readManifest(at: bundleURL)
            UploadDiagnosticsLog.shared.log(
                event: "upload.read_manifest",
                scanId: package.scanId,
                extra: [
                    "bundle_url": bundleURL.path,
                    "artifact_count": String(manifest.artifacts.count),
                    "photo_count": String(manifest.photos.count),
                    "manifest_scan_id": manifest.scanId.uuidString,
                    "kinds": manifest.artifacts.map { $0.kind.rawValue }.joined(separator: ",")
                ]
            )
        } catch {
            UploadDiagnosticsLog.shared.log(
                event: "upload.read_manifest.failed",
                scanId: package.scanId,
                error: error.localizedDescription,
                extra: ["bundle_url": bundleURL.path]
            )
            let err = RoomScanSyncError.encodingError(error)
            lastError = err
            throw err
        }

        // 1. Ensure parent rooms row.
        let roomId: UUID
        if let existing = package.remoteRoomId {
            roomId = existing
        } else {
            do {
                roomId = try await insertRoom(roomData: roomData, userId: userId)
                package.remoteRoomId = roomId
            } catch {
                let err = RoomScanSyncError.networkError(error)
                lastError = err
                package.markFailed(err.localizedDescription)
                throw err
            }
        }

        package.markSyncing()

        // 2. Insert / upsert the scan row with v2 columns. The additional
        //    upload_started_at / upload_attempt_count / status="uploading"
        //    fields land via a follow-up PATCH so we can keep the insert
        //    struct strongly typed. (Migration 00082 introduces these
        //    columns; until it lands the PATCH is a runtime no-op.)
        let insert = buildV2Insert(
            roomData: roomData,
            styleSignals: styleSignals,
            userId: userId,
            remoteRoomId: roomId,
            projectId: projectId,
            manifest: manifest
        )

        do {
            try await supabase
                .from("room_scans")
                .upsert(insert, onConflict: "id")
                .execute()
        } catch {
            let err = RoomScanSyncError.networkError(error)
            lastError = err
            package.markFailed(err.localizedDescription)
            throw err
        }

        // Stamp upload_started_at + bump upload_attempt_count. Best-effort
        // — the underlying columns are in migration 00082 which may not be
        // present in every environment yet.
        await stampUploadStarted(scanId: package.scanId)

        // 3–4. Seed artifact state + upload artifacts. Small artifacts go
        //      first (fail fast on network issues), large ones run with
        //      bounded concurrency (max 2 in-flight).
        //
        // The loop is driven by the upload PLAN, not by `manifest.artifacts`.
        // The two differ by exactly one entry: manifest.json, which the manifest
        // cannot list (it is the list — see `ArtifactUploader.routing`) but which
        // must still be PUT and must still have its key written to
        // `room_scans.bundle_manifest_url`. That column being NULL is what
        // parked two real client scans at `MISSING_MANIFEST`. Because the plan
        // carries `.bundleManifest` as an ordinary entry, the generic
        // `scanColumn(for:)` PATCH inside `launchArtifactUpload` reaches it with
        // no special case.
        let uploadPlan = ArtifactUploader.uploadPlan(for: manifest, in: bundleURL)

        var state = package.artifactState
        if state.artifacts.isEmpty {
            state.artifacts = uploadPlan.map { ArtifactUploadState(kind: $0.kind) }
            state.photosTotal = manifest.photos.count
            state.photosUploaded = 0
            package.artifactState = state
        }

        let totalBytes = max(1, uploadPlan.reduce(0) { $0 + $1.sizeBytes } +
                                 manifest.photos.reduce(0) { $0 + $1.sizeBytes })
        let uploadedCounter = UploadedBytesCounter()

        try await uploadArtifactsBoundedConcurrency(
            artifacts: uploadPlan,
            bundleURL: bundleURL,
            package: package,
            scanId: package.scanId,
            userId: userId,
            roomId: roomId,
            totalBytes: totalBytes,
            uploadedCounter: uploadedCounter
        )

        // 5. Upload posed photos + insert room_scan_images rows (with pose).
        var photoUploadError: Error?
        do {
            try await uploadPosedPhotos(
                manifest: manifest,
                bundleURL: bundleURL,
                package: package,
                scanId: package.scanId,
                userId: userId,
                roomId: roomId
            )
        } catch {
            photoUploadError = error
            PatinaLog.sync.error("[RoomScanSync] Posed photos upload partial failure: \(error.localizedDescription)")
        }

        // Derive room_features from CapturedRoom parametric JSON (ancillary).
        if let capturedRoomArtifact = manifest.artifacts.first(where: { $0.kind == .capturedRoomJson }) {
            let url = bundleURL.appendingPathComponent(capturedRoomArtifact.relativePath)
            try? await insertRoomFeatures(
                from: url,
                scanId: package.scanId,
                roomId: roomId
            )
        }

        // 6. Gate completion on real success. Previously the per-artifact
        //    catch in launchArtifactUpload swallowed every failure, and this
        //    code would unconditionally PATCH upload_progress=100 and call
        //    mark_scan_upload_complete — leaving a "complete" row with no
        //    Storage objects behind it (the 2026-05-12 smoke-test bug).
        //
        //    A second class of failure: manifest.artifacts is empty (e.g.
        //    RoomCaptureService finalized without writing the USDZ /
        //    captured_room JSON / world_map / mesh artifacts to the
        //    manifest). In that case the loop above iterates zero times,
        //    allArtifactsDone is vacuously true, and we'd happily mark the
        //    scan complete with literally nothing uploaded. Treat an empty
        //    artifact list as a producer-side failure and refuse to ship.
        if manifest.artifacts.isEmpty {
            let err = RoomScanSyncError.uploadFailed(
                "manifest has zero artifacts — ScanBundleWriter did not record any (usdz/mesh/world_map/captured_room). Bundle producer bug."
            )
            UploadDiagnosticsLog.shared.log(
                event: "manifest.empty_artifacts",
                scanId: package.scanId,
                error: err.localizedDescription,
                extra: ["photos_in_manifest": String(manifest.photos.count)]
            )
            lastError = err
            package.markFailed(err.localizedDescription)
            throw err
        }
        if !package.artifactState.allArtifactsDone {
            let failed = package.artifactState.artifacts
                .filter { $0.status != .uploaded && $0.status != .skipped }
                .map { "\($0.kind.rawValue)(\($0.status.rawValue))\($0.lastError.map { ": \($0)" } ?? "")" }
                .joined(separator: ", ")
            let err = RoomScanSyncError.uploadFailed("artifacts incomplete: \(failed)")
            lastError = err
            package.markFailed(err.localizedDescription)
            throw err
        }
        if let err = photoUploadError {
            let wrapped = RoomScanSyncError.uploadFailed("posed-photos: \(err.localizedDescription)")
            lastError = wrapped
            package.markFailed(wrapped.localizedDescription)
            throw wrapped
        }

        await patchUploadProgress(scanId: package.scanId, progress: 100)

        // 7. Mark scan upload complete via RPC, then invoke the
        //    confirm-scan-bundle edge function (fire-and-forget — an edge
        //    function failure is not fatal to the local sync state).
        do {
            try await supabase
                .rpc("mark_scan_upload_complete", params: MarkUploadCompleteParams(
                    p_scan_id: package.scanId.uuidString
                ))
                .execute()
        } catch {
            PatinaLog.sync.error("[RoomScanSync] mark_scan_upload_complete failed (non-fatal): \(error.localizedDescription)")
        }

        do {
            try await supabase.functions.invoke(
                "confirm-scan-bundle",
                options: FunctionInvokeOptions(body: ConfirmScanBundleRequest(
                    scan_id: package.scanId.uuidString
                ))
            )
            PatinaLog.sync.debug("[RoomScanSync] confirm-scan-bundle: ok")
        } catch {
            PatinaLog.sync.error("[RoomScanSync] confirm-scan-bundle: err \(error.localizedDescription)")
        }

        // Also stamp the legacy status=ready / processed_at pair so existing
        // consumers of the v2 schema keep working.
        do {
            try await supabase
                .from("room_scans")
                .update([
                    "status": "ready",
                    "processed_at": ISO8601DateFormatter().string(from: Date())
                ])
                .eq("id", value: package.scanId.uuidString)
                .execute()
        } catch {
            PatinaLog.sync.error("[RoomScanSync] Final status patch failed: \(error.localizedDescription)")
        }

        // 8. Mark synced locally + (optionally) delete the on-disk bundle.
        if package.artifactState.allArtifactsDone && package.artifactState.allPhotosDone {
            package.markSynced()
            // Leave the bundle on disk for now so we can verify in QA; a
            // follow-up can opt-in to auto-delete after a successful upload.
        }

        return UploadResult(roomId: roomId, scanId: package.scanId)
    }

    // MARK: - Launch-time & network-transition resume

    /// Re-enter `uploadAdvancedScanBundle` for every `RoomScanPackage` row
    /// that's in `.syncing` or `.failed` state (i.e. interrupted from a
    /// prior session or recently network-failed). Bounded to the 10 most
    /// recent rows to avoid a stampede of retries on launch.
    ///
    /// Safe to call multiple times — `uploadAdvancedScanBundle` skips
    /// artifacts with status `.uploaded` on re-entry, and duplicate
    /// launches for the same scanId are bounced by the task-in-flight
    /// guard.
    @MainActor
    public func resumePendingUploads(in context: ModelContext) async {
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { pkg in
                (pkg.statusRaw == "syncing" || pkg.statusRaw == "failed")
                    && pkg.syncedAt == nil
            },
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )

        let packages: [RoomScanPackage]
        do {
            var d = descriptor
            d.fetchLimit = 10
            packages = try context.fetch(d)
        } catch {
            PatinaLog.sync.error("[RoomScanSync] resumePendingUploads fetch failed: \(error.localizedDescription)")
            return
        }

        guard !packages.isEmpty else { return }
        PatinaLog.sync.debug("[RoomScanSync] resuming \(packages.count) pending scan(s)")

        for package in packages {
            // Skip if the bundle directory is gone (evicted / deleted).
            guard let bundleURL = package.absoluteBundleURL,
                  FileManager.default.fileExists(atPath: bundleURL.path) else {
                continue
            }

            // Reconstruct minimal FirstWalkRoomData / FirstWalkStyleSignals
            // from the manifest. `uploadAdvancedScanBundle` is idempotent
            // on the core data — re-upserting with derived values is fine
            // because the original scan row already landed on a prior
            // attempt.
            let manifest: ScanManifest
            do {
                manifest = try ScanBundleWriter.readManifest(at: bundleURL)
            } catch {
                continue
            }

            let resumeRoomData = Self.deriveRoomData(
                from: manifest,
                package: package,
                context: context
            )
            let resumeSignals = FirstWalkStyleSignals()

            // Capture strong references for the detached task; the service
            // itself is a main-actor singleton so calling back in is safe.
            let captured = package
            Task { [weak self] in
                do {
                    _ = try await self?.uploadAdvancedScanBundle(
                        package: captured,
                        roomData: resumeRoomData,
                        styleSignals: resumeSignals
                    )
                } catch {
                    PatinaLog.sync.error("[RoomScanSync] resume upload failed for \(captured.scanId): \(error.localizedDescription)")
                }
            }
        }
    }

    /// Best-effort reconstruction of `FirstWalkRoomData` for resume. Pulls
    /// dimensions from the linked `RoomModel` row when available; otherwise
    /// falls back to zero values. The upsert path re-uses the existing
    /// scan's id so row overwrites are bounded to this one row, and any
    /// fields that `buildV2Insert` derives (style_signals, suggested_styles)
    /// are regenerated from whatever we pass in — so we keep the core
    /// name/id correct and accept stubbed dimensions as the tradeoff for
    /// not needing to re-parse the parametric captured_room.json.
    @MainActor
    static func deriveRoomData(
        from manifest: ScanManifest,
        package: RoomScanPackage,
        context: ModelContext
    ) -> FirstWalkRoomData {
        let roomLocalId = package.roomLocalId
        var width: Float = 0
        var length: Float = 0
        var height: Float = 0

        let descriptor = FetchDescriptor<RoomModel>(
            predicate: #Predicate { $0.id == roomLocalId }
        )
        if let room = try? context.fetch(descriptor).first {
            width = Float(room.width ?? 0)
            length = Float(room.length ?? 0)
            height = Float(room.height ?? 0)
        }

        let dims = WalkRoomDimensions(width: width, length: length, height: height)
        return FirstWalkRoomData(
            roomId: package.scanId,
            roomName: package.userProvidedRoomName ?? manifest.roomName,
            dimensions: dims,
            detectedFeatures: [],
            scanDuration: 0,
            coveragePercentage: 0
        )
    }

    // MARK: - Bounded-concurrency artifact loop

    /// Orchestrates the artifact upload loop with small-artifacts-first
    /// ordering and a bounded in-flight window (max 2). A successful upload
    /// bumps the upload_progress column (throttled to ~1Hz).
    ///
    /// `artifacts` is the upload PLAN (`ArtifactUploader.uploadPlan`), not the
    /// manifest's `artifacts[]` — it additionally carries manifest.json itself.
    private func uploadArtifactsBoundedConcurrency(
        artifacts: [ScanManifest.Artifact],
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID,
        totalBytes: Int,
        uploadedCounter: UploadedBytesCounter
    ) async throws {
        let sorted = artifacts.sorted { $0.sizeBytes < $1.sizeBytes }
        let maxInFlight = 2

        try await withThrowingTaskGroup(of: Void.self) { group in
            var iterator = sorted.makeIterator()

            // Launch the initial window.
            for _ in 0..<maxInFlight {
                if let artifact = iterator.next() {
                    self.launchArtifactUpload(
                        artifact: artifact,
                        bundleURL: bundleURL,
                        package: package,
                        scanId: scanId,
                        userId: userId,
                        roomId: roomId,
                        totalBytes: totalBytes,
                        uploadedCounter: uploadedCounter,
                        into: &group
                    )
                }
            }

            // As each completes, launch the next until we exhaust the queue.
            while try await group.next() != nil {
                if let artifact = iterator.next() {
                    self.launchArtifactUpload(
                        artifact: artifact,
                        bundleURL: bundleURL,
                        package: package,
                        scanId: scanId,
                        userId: userId,
                        roomId: roomId,
                        totalBytes: totalBytes,
                        uploadedCounter: uploadedCounter,
                        into: &group
                    )
                }
            }
        }
    }

    private func launchArtifactUpload(
        artifact: ScanManifest.Artifact,
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID,
        totalBytes: Int,
        uploadedCounter: UploadedBytesCounter,
        into group: inout ThrowingTaskGroup<Void, Error>
    ) {
        let priorState = package.artifactState.artifacts.first(where: { $0.kind == artifact.kind })
        if priorState?.status == .uploaded {
            // Already done on a prior run — bump counter & skip.
            group.addTask { [totalBytes, artifact] in
                let progress = await uploadedCounter.add(artifact.sizeBytes, total: totalBytes)
                if progress.shouldWrite {
                    await self.patchUploadProgress(scanId: scanId, progress: progress.percent)
                }
            }
            return
        }

        var artifactState = priorState ?? ArtifactUploadState(kind: artifact.kind)
        artifactState.status = .uploading
        artifactState.attempts += 1
        package.updateArtifact(artifactState)

        let capturedState = artifactState
        // Nil unless BOTH the `scanUploadShadowR2` toggle is on and the build
        // carries an `EDGE_API_URL`. Read per artifact so flipping the toggle
        // takes effect without restarting a sync in progress.
        let shadowLeg = ScanUploadShadowLeg.live()
        group.addTask { [artifact, totalBytes, capturedState, shadowLeg] in
            do {
                // The shadow runs INSIDE `afterPrimary`, which reaches it only
                // once the primary upload has returned and can neither throw
                // nor alter what it returned. See that function's comment.
                let (remoteUrl, shadowOutcome) = try await ScanUploadShadowLeg.afterPrimary(
                    primary: {
                        try await self.artifactUploader.uploadArtifact(
                            artifact: artifact,
                            from: bundleURL,
                            userId: userId,
                            roomId: roomId,
                            scanId: scanId
                        )
                    },
                    shadow: { uploaded in
                        // A nil result is a sidecar the primary never sent, so
                        // there are no bytes in Storage for the shadow to be a
                        // shadow OF.
                        guard uploaded != nil, let shadowLeg else { return .notAttempted }
                        return await shadowLeg.run(
                            artifact: artifact,
                            fileURL: bundleURL.appendingPathComponent(artifact.relativePath),
                            scanId: scanId
                        )
                    }
                )

                if let url = remoteUrl {
                    var done = ArtifactUploadState(
                        kind: capturedState.kind,
                        status: .uploaded,
                        remoteUrl: url,
                        lastError: nil,
                        attempts: capturedState.attempts
                    )
                    done.apply(shadow: shadowOutcome)
                    await MainActor.run { package.updateArtifact(done) }

                    if let column = ArtifactUploader.scanColumn(for: artifact.kind) {
                        try? await self.patchScanColumn(
                            scanId: scanId,
                            column: column,
                            value: url
                        )
                    }
                    UploadDiagnosticsLog.shared.log(
                        event: "artifact.uploaded",
                        scanId: scanId,
                        artifactKind: artifact.kind.rawValue,
                        sha: artifact.sha256,
                        extra: ["url": url]
                    )
                } else {
                    // Sidecar — not uploaded, mark skipped so allArtifactsDone holds.
                    let skipped = ArtifactUploadState(
                        kind: capturedState.kind,
                        status: .skipped,
                        remoteUrl: nil,
                        lastError: nil,
                        attempts: capturedState.attempts
                    )
                    await MainActor.run { package.updateArtifact(skipped) }
                    UploadDiagnosticsLog.shared.log(
                        event: "artifact.skipped",
                        scanId: scanId,
                        artifactKind: artifact.kind.rawValue
                    )
                }

                let progress = await uploadedCounter.add(artifact.sizeBytes, total: totalBytes)
                if progress.shouldWrite {
                    PatinaLog.sync.debug("[RoomScanSync] progress \(progress.percent)%")
                    await self.patchUploadProgress(scanId: scanId, progress: progress.percent)
                }
            } catch {
                let failed = ArtifactUploadState(
                    kind: capturedState.kind,
                    status: .failed,
                    remoteUrl: capturedState.remoteUrl,
                    lastError: error.localizedDescription,
                    attempts: capturedState.attempts
                )
                await MainActor.run { package.updateArtifact(failed) }
                PatinaLog.sync.error("[RoomScanSync] Artifact \(artifact.kind) upload failed: \(error.localizedDescription)")
                UploadDiagnosticsLog.shared.log(
                    event: "artifact.failed",
                    scanId: scanId,
                    artifactKind: artifact.kind.rawValue,
                    sha: artifact.sha256,
                    error: error.localizedDescription
                )

                // Record the error column + progress advance even on
                // failure so the progress bar doesn't stall.
                await self.patchUploadError(scanId: scanId, message: error.localizedDescription)
                let progress = await uploadedCounter.add(artifact.sizeBytes, total: totalBytes)
                if progress.shouldWrite {
                    await self.patchUploadProgress(scanId: scanId, progress: progress.percent)
                }
            }
        }
    }

    // MARK: - Upload-state column helpers

    private func stampUploadStarted(scanId: UUID) async {
        do {
            try await supabase
                .rpc("increment_scan_upload_attempt", params: ScanIdOnlyParams(
                    p_scan_id: scanId.uuidString
                ))
                .execute()
        } catch {
            // The RPC is optional (pending migration); fall back to a
            // direct PATCH of upload_started_at only.
            let payload: [String: String] = [
                "upload_started_at": ISO8601DateFormatter().string(from: Date()),
                "status": "uploading"
            ]
            _ = try? await supabase
                .from("room_scans")
                .update(payload)
                .eq("id", value: scanId.uuidString)
                .execute()
        }
    }

    private func patchUploadProgress(scanId: UUID, progress: Int) async {
        _ = try? await supabase
            .from("room_scans")
            .update(["upload_progress": progress])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    private func patchUploadError(scanId: UUID, message: String) async {
        _ = try? await supabase
            .from("room_scans")
            .update(["upload_error": message])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    // MARK: - Scan row helpers

    private func patchScanColumn(scanId: UUID, column: String, value: String) async throws {
        try await supabase
            .from("room_scans")
            .update([column: value])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    private func buildV2Insert(
        roomData: FirstWalkRoomData,
        styleSignals: FirstWalkStyleSignals,
        userId: UUID,
        remoteRoomId: UUID,
        projectId: UUID?,
        manifest: ScanManifest
    ) -> RoomScanV2Insert {
        let formatter = ISO8601DateFormatter()

        var windows: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        var doors: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        var other: [RoomScanInsert.FeaturesJSON.FeatureItem] = []
        for feature in roomData.detectedFeatures {
            let item = RoomScanInsert.FeaturesJSON.FeatureItem(
                type: feature.category.rawValue,
                confidence: feature.confidence,
                value: feature.value
            )
            switch feature.category {
            case .window, .largeWindow: windows.append(item)
            case .door: doors.append(item)
            default: other.append(item)
            }
        }

        let furniture = roomData.detectedFeatures
            .filter { $0.category == .seatingArea || $0.category == .bookshelf }
            .map { RoomScanInsert.FurnitureDetected(category: $0.category.rawValue, confidence: $0.confidence) }

        let suggestedStyles: [String] = {
            var styles: Set<String> = []
            if styleSignals.naturalLight > 0.7 { styles.insert("scandinavian"); styles.insert("coastal") }
            if styleSignals.warmth > 0.7 { styles.insert("rustic"); styles.insert("traditional") }
            if styleSignals.openness > 0.7 { styles.insert("minimalist"); styles.insert("modern") }
            if styleSignals.texture > 0.7 { styles.insert("bohemian"); styles.insert("eclectic") }
            if styles.isEmpty { styles.insert("transitional") }
            return Array(styles)
        }()

        let env = manifest.captureEnvironment
        let captureEnv = RoomScanV2Insert.CaptureEnvironmentJSON(
            lightEstimate: env.lightEstimate,
            thermalState: env.thermalState,
            batteryLevel: env.batteryLevel,
            motionQuality: env.motionQuality
        )

        let totalSize = manifest.artifacts.reduce(0) { $0 + $1.sizeBytes } +
            manifest.photos.reduce(0) { $0 + $1.sizeBytes }

        return RoomScanV2Insert(
            id: roomData.roomId,
            user_id: userId,
            room_id: remoteRoomId,
            project_id: projectId,
            name: roomData.roomName,
            room_type: nil,
            dimensions: RoomScanInsert.DimensionsJSON(
                width: roomData.dimensions.width,
                length: roomData.dimensions.length,
                height: roomData.dimensions.height,
                unit: "meters"
            ),
            floor_area: Double(roomData.dimensions.area),
            coverage_percentage: roomData.coveragePercentage,
            features: RoomScanInsert.FeaturesJSON(windows: windows, doors: doors, other: other),
            furniture_detected: furniture,
            style_signals: RoomScanInsert.StyleSignalsJSON(
                naturalLight: styleSignals.naturalLight,
                openness: styleSignals.openness,
                warmth: styleSignals.warmth,
                texture: styleSignals.texture,
                timeOfDay: styleSignals.timeOfDay?.rawValue,
                lightPreference: styleSignals.lightPreference?.rawValue,
                seatingPreference: styleSignals.seatingPreference?.rawValue,
                roomFeeling: styleSignals.roomFeeling,
                scanPace: styleSignals.scanPace.rawValue
            ),
            suggested_styles: suggestedStyles,
            scan_data: RoomScanInsert.ScanDataJSON(
                scanDuration: roomData.scanDuration,
                coveragePercentage: roomData.coveragePercentage,
                completedAt: formatter.string(from: roomData.completedAt)
            ),
            thumbnail_url: nil,
            model_url: nil,
            hero_frame_url: nil,
            hero_frame_score: roomData.heroFrameScore,
            scan_schema_version: manifest.schemaVersion,
            device_model: manifest.device.model,
            os_version: manifest.device.osVersion,
            has_lidar: manifest.device.hasLidar,
            scan_bundle_size_bytes: totalSize,
            capture_environment: captureEnv,
            status: "processing",
            scanned_at: formatter.string(from: roomData.completedAt),
            created_at: formatter.string(from: Date())
        )
    }

    // MARK: - Posed photos

    /// Actor-guarded accumulator used by the concurrent posed-photo upload
    /// loop. We collect successful insert rows here before writing them
    /// to `room_scan_images` in a single batched insert.
    private actor PosedPhotoCollector {
        private(set) var rows: [RoomScanImageInsertV2] = []

        func append(_ row: RoomScanImageInsertV2) {
            rows.append(row)
        }
    }

    private func uploadPosedPhotos(
        manifest: ScanManifest,
        bundleURL: URL,
        package: RoomScanPackage,
        scanId: UUID,
        userId: UUID,
        roomId: UUID
    ) async throws {
        let collector = PosedPhotoCollector()
        let maxInFlight = 3

        try await withThrowingTaskGroup(of: Void.self) { group in
            var iterator = manifest.photos.enumerated().makeIterator()

            func launchNext(into group: inout ThrowingTaskGroup<Void, Error>) {
                guard let next = iterator.next() else { return }
                let (index, photo) = next
                group.addTask { [scanId, roomId, userId, bundleURL] in
                    let photoURL = bundleURL.appendingPathComponent(photo.relativePath)
                    guard let data = try? Data(contentsOf: photoURL) else { return }

                    let filename = (photo.relativePath.split(separator: "/").last)
                        .map(String.init) ?? "photo.heic"
                    let storagePath = "photos/\(userId.uuidString.lowercased())/\(roomId.uuidString.lowercased())/\(filename)"

                    do {
                        // Idempotent-by-upsert: re-uploading the same bytes
                        // with `upsert: true` is a no-op from the client's
                        // point of view. Simpler than a list-then-HEAD probe
                        // and matches the v2 behaviour we rely on elsewhere.
                        try await supabase.storage
                            .from(self.usdzBucket)
                            .upload(
                                storagePath,
                                data: data,
                                options: FileOptions(
                                    contentType: photo.mimeType,
                                    upsert: true
                                )
                            )
                        let url = try supabase.storage
                            .from(self.usdzBucket)
                            .getPublicURL(path: storagePath)

                        // Honour the user's review-step picks: `isUserSelectedHero`
                        // wins over the auto-scored hero kind; `orderIndex`
                        // replaces the natural capture order when present.
                        let effectiveIsPrimary = photo.isUserSelectedHero || photo.kind == .hero
                        let effectiveDisplayOrder: Int
                        if effectiveIsPrimary {
                            effectiveDisplayOrder = 0
                        } else if let userOrder = photo.orderIndex {
                            effectiveDisplayOrder = userOrder + 1
                        } else {
                            effectiveDisplayOrder = index + 1
                        }
                        let trimmedCaption = photo.userAnnotation?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        let row = RoomScanImageInsertV2(
                            scan_id: scanId,
                            room_id: roomId,
                            role: photo.kind.rawValue,
                            is_primary: effectiveIsPrimary,
                            display_order: effectiveDisplayOrder,
                            feature_category: photo.associatedFeatureCategory,
                            image_url: url.absoluteString,
                            quality_score: photo.qualityScore,
                            sharpness_score: photo.sharpnessScore,
                            brightness_score: photo.brightnessScore,
                            composition_score: photo.compositionScore,
                            stability_score: photo.stabilityScore,
                            light_estimate_lumens: photo.lightEstimateLumens,
                            captured_at: photo.capturedAt,
                            camera_transform: photo.cameraTransform,
                            camera_intrinsics: PhotoIntrinsicsJSON(
                                fx: photo.cameraIntrinsics.fx,
                                fy: photo.cameraIntrinsics.fy,
                                cx: photo.cameraIntrinsics.cx,
                                cy: photo.cameraIntrinsics.cy,
                                width: photo.cameraIntrinsics.width,
                                height: photo.cameraIntrinsics.height
                            ),
                            euler_angles: photo.eulerAngles,
                            photo_kind: photo.kind.rawValue,
                            is_full_resolution: photo.isFullResolution,
                            associated_feature_id: photo.associatedFeatureId,
                            timestamp_seconds: photo.timestampSeconds,
                            width: photo.width,
                            height: photo.height,
                            file_size_bytes: photo.sizeBytes,
                            mime_type: photo.mimeType,
                            caption: (trimmedCaption?.isEmpty == false) ? trimmedCaption : nil
                        )
                        await collector.append(row)
                        await MainActor.run { package.incrementPhotosUploaded() }
                    } catch {
                        PatinaLog.sync.error("[RoomScanSync] Photo upload failed (\(filename)): \(error.localizedDescription)")
                    }
                }
            }

            for _ in 0..<maxInFlight { launchNext(into: &group) }
            while try await group.next() != nil {
                launchNext(into: &group)
            }
        }

        let uploaded = await collector.rows
        guard !uploaded.isEmpty else { return }

        try await supabase
            .from("room_scan_images")
            .insert(uploaded)
            .execute()

        // Keep the denormalized `image_count` column on `room_scans` in sync.
        // Best-effort — a transient failure here doesn't undo the inserts and
        // doesn't block the rest of the upload flow. Without this patch, the
        // column stays at its default (0) forever even when uploads succeed.
        try? await supabase
            .from("room_scans")
            .update(["image_count": uploaded.count])
            .eq("id", value: scanId.uuidString)
            .execute()
    }

    // MARK: - Room features from CapturedRoom JSON

    private func insertRoomFeatures(
        from capturedRoomURL: URL,
        scanId: UUID,
        roomId: UUID
    ) async throws {
        guard let data = try? Data(contentsOf: capturedRoomURL) else { return }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        var inserts: [RoomFeatureInsert] = []

        func positionOf(_ transform: [[Double]]?) -> (x: Double, y: Double, z: Double) {
            guard let m = transform, m.count >= 4, m[3].count >= 3 else { return (0, 0, 0) }
            return (m[0][3], m[1][3], m[2][3])
        }

        func dimensionsOf(_ dims: [Double]?) -> (w: Double?, h: Double?, d: Double?) {
            guard let dims = dims else { return (nil, nil, nil) }
            return (dims.indices.contains(0) ? dims[0] : nil,
                    dims.indices.contains(1) ? dims[1] : nil,
                    dims.indices.contains(2) ? dims[2] : nil)
        }

        func appendItems(_ items: [[String: Any]]?, type: String) {
            guard let items = items else { return }
            for item in items {
                let tx = item["transform"] as? [[Double]]
                let pos = positionOf(tx)
                let dims = dimensionsOf(item["dimensions"] as? [Double])
                let confidenceRaw = (item["confidence"] as? String) ?? "medium"
                let confidence: Double = {
                    switch confidenceRaw.lowercased() {
                    case "high": return 1.0
                    case "medium": return 0.8
                    case "low": return 0.6
                    default: return 0.7
                    }
                }()
                inserts.append(RoomFeatureInsert(
                    room_id: roomId,
                    scan_id: scanId,
                    type: type,
                    position_x: pos.x,
                    position_y: pos.y,
                    position_z: pos.z,
                    width: dims.w,
                    height: dims.h,
                    depth: dims.d,
                    confidence: confidence
                ))
            }
        }

        appendItems(json["walls"] as? [[String: Any]], type: "wall")
        appendItems(json["doors"] as? [[String: Any]], type: "door")
        appendItems(json["windows"] as? [[String: Any]], type: "window")
        appendItems(json["openings"] as? [[String: Any]], type: "opening")
        appendItems(json["objects"] as? [[String: Any]], type: "object")

        guard !inserts.isEmpty else { return }

        try await supabase
            .from("room_features")
            .insert(inserts)
            .execute()
    }
}
