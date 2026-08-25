//
//  RoomCaptureBundleAdapter.swift
//  Patina
//
//  Writes captured scan data into the on-disk v2/v3 bundle via
//  `ScanBundleWriter`. Extracted from `RoomCaptureService` (PT-6-2): the USDZ /
//  CapturedRoom-JSON exports, the full `freezeBundleArtifacts` pass, the depth
//  index registration, and the depth/ directory zip.
//
//  This adapter holds NO observable state. It takes the captured room, writer,
//  recorders, and analyzers as explicit inputs so behavior matches the original
//  inline implementation 1:1. Diagnostics logging (UploadDiagnosticsLog) is
//  preserved verbatim so the freeze telemetry contract is unchanged.
//

import Foundation
import UIKit
import RoomPlan
import ARKit

/// Writes captured scan artifacts into a `ScanBundleWriter`-backed bundle.
@MainActor
final class RoomCaptureBundleAdapter {

    /// Inputs required to freeze a bundle. Bundled into a struct so the call
    /// site reads clearly and so adding a future input doesn't churn the
    /// freeze signature.
    struct FreezeContext {
        let writer: ScanBundleWriter
        let arSession: ARSession
        let capturedRoom: CapturedRoom?
        let analyzer: RoomCaptureAnalyzer
        let meshAnchors: [ARMeshAnchor]
        let depthRecorder: DepthFrameRecorder?
        /// The dense-frame keyframe recorder (Rendered Room v2). Freeze flushes
        /// it, tars `keyframes/` → `keyframes.tar`, and registers the archive +
        /// index + summary. Nil (or decision-only) leaves the bundle unchanged.
        let keyframeRecorder: KeyframeTelemetryRecorder?
        let posedPhotoService: PosedPhotoService?
        /// Latest quality metrics (for the environment snapshot's motionQuality).
        let qualityMetrics: QualityMonitor.QualityMetrics?
    }

    /// Inputs required to seal a bundle. Bundled for the same reason
    /// `FreezeContext` is: the call site reads as what it is, and the signature
    /// stopped churning every time the seal learned about one more thing —
    /// which it just did, for `instrument`.
    struct SealContext {
        let writer: ScanBundleWriter
        let annotations: ScanManifest.Annotations
        let heroPhotoId: UUID?
        let reorderedPhotoIds: [UUID]
        let photoAnnotations: [UUID: String]
        /// The manifest's instrument layer, snapshotted by
        /// `RoomCaptureService.finalizeInstrumentLane(arSession:)` when the
        /// session ended. Optional because a bundle whose instrument lane never
        /// ran has no honest layer to state, and half a layer is worse than
        /// none: the validator's §10.6 cross-checks (`unverified` vs
        /// `anchors.count`, `scorecard.anchorCount` vs `anchors.count`) would
        /// then fail on INCONSISTENCY rather than absence. A nil here seals
        /// exactly the bundle this path sealed before.
        let instrument: ScanManifest.InstrumentLayer?
    }

    // MARK: - Exports

    /// Export the captured room as USDZ data.
    /// - Returns: USDZ file data, or nil if export fails.
    func exportUSDZ(capturedRoom: CapturedRoom?) async -> Data? {
        guard let room = capturedRoom else {
            PatinaLog.scan.debug("exportUSDZ: No captured room available")
            return nil
        }

        do {
            // Create temporary URL for export
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(UUID().uuidString).usdz")

            // Export using RoomPlan's built-in export
            try room.export(to: tempURL, exportOptions: .model)

            // Read the exported file data
            let data = try Data(contentsOf: tempURL)

            // Clean up temporary file
            try? FileManager.default.removeItem(at: tempURL)

            PatinaLog.scan.debug("exportUSDZ: Successfully exported \(data.count) bytes")
            return data

        } catch {
            PatinaLog.scan.error("exportUSDZ: Failed to export - \(error.localizedDescription)")
            return nil
        }
    }

    /// Export CapturedRoom as JSON (authoritative geometry —
    /// walls/doors/windows/openings/objects with transforms and dimensions).
    /// Written to the current bundle as the `.capturedRoomJson` artifact.
    ///
    /// `CapturedRoom` is `Codable` (iOS 17+), so we encode it directly.
    /// The older `room.export(to:exportOptions:.parametric)` path only
    /// writes USDA — not JSON — and rejects a `.json` extension.
    @discardableResult
    func exportCapturedRoomJSON(capturedRoom: CapturedRoom?, writer: ScanBundleWriter?) async -> ScanManifest.Artifact? {
        guard let room = capturedRoom, let writer = writer else { return nil }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(room)
            return try writer.writeArtifact(
                kind: .capturedRoomJson,
                data: data,
                mimeType: "application/json"
            )
        } catch {
            PatinaLog.scan.error("[RoomCaptureService] CapturedRoom JSON export failed: \(error.localizedDescription)")
            return nil
        }
    }

    /// Export the beautified USDZ into the current bundle as the `.usdz` artifact.
    @discardableResult
    func exportUSDZToBundle(capturedRoom: CapturedRoom?, writer: ScanBundleWriter?) async -> ScanManifest.Artifact? {
        guard let writer = writer, let data = await exportUSDZ(capturedRoom: capturedRoom) else { return nil }
        do {
            return try writer.writeArtifact(
                kind: .usdz,
                data: data,
                mimeType: "model/vnd.usdz+zip"
            )
        } catch {
            PatinaLog.scan.error("[RoomCaptureService] USDZ bundle write failed: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Freeze

    /// Freeze the on-disk scan bundle: CapturedRoom JSON, USDZ, ARWorldMap,
    /// scene mesh, depth archive + index, coverage heatmap, photo thumbnail
    /// index, environment snapshot. Does NOT seal the manifest — that's the
    /// job of `finalizeBundleAfterReview(...)` after the user reviews the
    /// scan. Swallows per-artifact failures so the scan flow continues even
    /// if (e.g.) the world map isn't available yet.
    func freezeBundleArtifacts(_ context: FreezeContext) async {
        let writer = context.writer
        let arSession = context.arSession
        let scanId = writer.scanId
        UploadDiagnosticsLog.shared.log(event: "freeze.start", scanId: scanId)

        // 1. CapturedRoom parametric JSON (authoritative geometry)
        let crj = await exportCapturedRoomJSON(capturedRoom: context.capturedRoom, writer: writer)
        UploadDiagnosticsLog.shared.log(
            event: crj != nil ? "freeze.captured_room_json.ok" : "freeze.captured_room_json.skipped",
            scanId: scanId,
            extra: ["has_captured_room": context.capturedRoom == nil ? "false" : "true"]
        )

        // 2. USDZ (beautified mesh for ARQuickLook)
        let usdz = await exportUSDZToBundle(capturedRoom: context.capturedRoom, writer: writer)
        UploadDiagnosticsLog.shared.log(
            event: usdz != nil ? "freeze.usdz.ok" : "freeze.usdz.skipped",
            scanId: scanId,
            extra: ["has_captured_room": context.capturedRoom == nil ? "false" : "true"]
        )

        // 3. ARWorldMap
        let wm = await WorldMapExporter.exportToBundle(session: arSession, bundle: writer)
        UploadDiagnosticsLog.shared.log(
            event: wm != nil ? "freeze.world_map.ok" : "freeze.world_map.failed",
            scanId: scanId
        )

        // 4. Scene mesh from accumulated ARMeshAnchors. Using the cached
        // set (built up during the scan via didAdd/didUpdate) instead of
        // `arSession.currentFrame?.anchors` — by the time didEndWith fires
        // the session has usually cleared its anchor list.
        let anchors = context.meshAnchors
        let mesh = SceneMeshExporter.exportToBundle(anchors: anchors, bundle: writer)
        UploadDiagnosticsLog.shared.log(
            event: mesh != nil ? "freeze.mesh.ok" : "freeze.mesh.failed",
            scanId: scanId,
            extra: ["anchor_count": String(anchors.count)]
        )

        // 5. Flush the depth recorder so its NDJSON index is fully on disk
        //    before we zip the depth/ directory or register the index as
        //    an artifact.
        context.depthRecorder?.finishSession()

        // 6. Score the posed photos and fold scores into manifest entries.
        if let posed = context.posedPhotoService, !posed.emittedPhotos.isEmpty {
            var scored = posed.emittedPhotos
            for i in scored.indices {
                // Best-effort scoring — matching photo to a hero frame is
                // already handled by FrameScoringEngine for the legacy path;
                // for v2 we leave qualityScore nil when we can't map it and
                // let the server treat it as unscored.
                scored[i].qualityScore = scored[i].qualityScore ?? 0
            }
            try? writer.replacePhotos(scored)
        }

        // 7. Coverage heatmap artifact (JSON grid snapshot).
        var coverageHeatmapPresent = false
        do {
            let heatmap = await context.analyzer.currentHeatmap()
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(heatmap)
            _ = try writer.writeArtifact(
                kind: .coverageHeatmap,
                data: data,
                mimeType: "application/json"
            )
            coverageHeatmapPresent = true
        } catch {
            PatinaLog.scan.error("[RoomCaptureService] coverage heatmap write failed: \(error.localizedDescription)")
        }

        // 8. depth.zip — only if the recorder wrote anything.
        //
        // `depth/depth_index.ndjson` is deliberately NOT registered as a
        // `.depthIndex` artifact. It is never uploaded under its own key, and
        // the manifest must not list what will not be in Storage: the worker
        // prefix-swapped the entry to `depth/{uid}/{room}/depth_index.ndjson`
        // (keys.KIND_TO_FOLDER), 404'd, and raised MISSING_FILE — fatal on the
        // second ingest attempt. The recorder has already written the file and
        // the zip below carries the whole `depth/` directory, index included,
        // to `depth_archive_url`.
        let framesWritten = context.depthRecorder?.framesWritten ?? 0
        if framesWritten > 0 {
            // Best-effort zip of depth/ → depth.zip using NSFileCoordinator.
            if let zipURL = try? zipDepthDirectory(at: writer.bundleURL) {
                do {
                    let data = try Data(contentsOf: zipURL)
                    _ = try writer.writeArtifact(
                        kind: .depthArchive,
                        data: data,
                        mimeType: "application/zip"
                    )
                } catch {
                    PatinaLog.scan.error("[RoomCaptureService] depth archive register failed: \(error.localizedDescription)")
                }
                try? FileManager.default.removeItem(at: zipURL)
            }
        }

        // 8.5 Keyframes (dense-frame lane, Rendered Room v2). Flush the recorder
        //     (drains pending HEIC encodes, closes `keyframe_index.ndjson`,
        //     writes `keyframe_summary.json`), then tar the fired HEICs into
        //     `keyframes.tar` and register the three artifacts:
        //       • keyframesArchive → scan_bundle_url  (the RGB stream the splat
        //         pipeline trains on; parse_keyframe_index reads the index)
        //       • keyframeIndex / keyframeSummary → column-less uploads the
        //         worker resolves by prefix-swap into the `keyframes/` folder.
        //     Only the .heic members go in the tar; the index + summary upload
        //     as their own objects, exactly as Field and the prod fixture do.
        if let keyframeRecorder = context.keyframeRecorder, keyframeRecorder.isRecordingBundle {
            keyframeRecorder.finish()
            let heics = keyframeRecorder.heicFiles()
            if !heics.isEmpty {
                do {
                    let tarURL = writer.bundleURL.appendingPathComponent(KeyframeBundleWriter.archiveRelativePath)
                    let entries = TarArchive.bundleEntries(
                        directory: KeyframeBundleWriter.directoryName,
                        files: heics
                    )
                    let members = try TarArchive.write(entries: entries, to: tarURL)
                    if members > 0 {
                        _ = try writer.registerExistingArtifact(
                            kind: .keyframesArchive,
                            relativePath: KeyframeBundleWriter.archiveRelativePath,
                            mimeType: "application/x-tar"
                        )
                        _ = try writer.registerExistingArtifact(
                            kind: .keyframeIndex,
                            relativePath: KeyframeBundleWriter.indexRelativePath,
                            mimeType: "application/x-ndjson"
                        )
                        // Summary is best-effort (see KeyframeBundleWriter); only
                        // register it if it actually landed, so a listed artifact
                        // never points at a missing file.
                        let summaryURL = writer.bundleURL.appendingPathComponent(
                            KeyframeBundleWriter.summaryRelativePath
                        )
                        if FileManager.default.fileExists(atPath: summaryURL.path) {
                            _ = try writer.registerExistingArtifact(
                                kind: .keyframeSummary,
                                relativePath: KeyframeBundleWriter.summaryRelativePath,
                                mimeType: "application/json"
                            )
                        }
                    }
                } catch {
                    PatinaLog.scan.error("[RoomCaptureService] keyframe archive register failed: \(error.localizedDescription)")
                }
            }
        }

        // 9. Photo-thumbnails index — register after all photos are locked in.
        do {
            try writer.registerPhotoThumbnailsIndex()
        } catch {
            PatinaLog.scan.error("[RoomCaptureService] photo thumbnails index failed: \(error.localizedDescription)")
        }

        // 10. Environment snapshot. optical flow mean is left nil — the
        //     FrameScoringEngine does not yet expose a running mean, and we
        //     prefer nil over an inaccurate estimate.
        let env = ScanManifest.CaptureEnvironment(
            lightEstimate: arSession.currentFrame?.lightEstimate.map { Double($0.ambientIntensity) } ?? nil,
            thermalState: String(describing: ProcessInfo.processInfo.thermalState),
            batteryLevel: Double(UIDevice.current.batteryLevel),
            motionQuality: String(describing: context.qualityMetrics?.grade ?? .poor),
            opticalFlowMean: nil,
            sceneDepthFrameCount: framesWritten > 0 ? framesWritten : nil,
            coverageHeatmapPresent: coverageHeatmapPresent
        )
        try? writer.updateCaptureEnvironment(env)

        // Diagnostic line: total artifact count at freeze end. If this lands
        // as zero, every individual exporter above silently failed and the
        // upload pipeline will refuse to mark the scan complete (see
        // RoomScanSyncService.swift uploadRoomScan's empty-artifacts guard).
        let frozenArtifacts = writer.currentManifest().artifacts.map { $0.kind.rawValue }
        UploadDiagnosticsLog.shared.log(
            event: "freeze.end",
            scanId: scanId,
            extra: [
                "artifact_count": String(frozenArtifacts.count),
                "kinds": frozenArtifacts.joined(separator: ",")
            ]
        )

        // NOTE: manifest is NOT finalized here. `finalizeBundleAfterReview`
        // writes annotations, applies user hero/order selection, then seals
        // the manifest via `writer.finalize(hashArtifacts: true)`.
    }

    // MARK: - Review / seal

    /// Apply user-supplied review data (annotations, hero selection, photo
    /// ordering, per-photo captions) to the writer, refresh the posed-photo
    /// sidecar, and seal the manifest. Mirrors steps 1–3 of the original
    /// `finalizeBundleAfterReview`, plus the instrument layer; the façade keeps
    /// the public entry point and fires `onScanComplete`.
    ///
    /// Purely local. Sealing is what parks a scan in `.heldLocal` — no artifact
    /// registered here (or at freeze) is transmitted until the user asks for
    /// design services and `DesignRequestCoordinator` drives the upload.
    func applyReviewAndSeal(_ context: SealContext) throws {
        let writer = context.writer

        // 1. Persist annotations.
        try writer.setAnnotations(context.annotations)

        // 2. Apply hero selection + reorder + per-photo captions.
        if context.heroPhotoId != nil
            || !context.reorderedPhotoIds.isEmpty
            || !context.photoAnnotations.isEmpty {
            try writer.replacePhotos(
                Self.applyingReview(
                    to: writer.currentManifest().photos,
                    heroPhotoId: context.heroPhotoId,
                    reorderedPhotoIds: context.reorderedPhotoIds,
                    photoAnnotations: context.photoAnnotations
                )
            )
        }

        // 3. Rewrite + register the posed-photo NDJSON sidecar, now that the
        //    photo list is final. Best-effort: a sidecar failure must not cost
        //    the user a sealed scan, and every artifact this file indexes is
        //    uploaded independently of it.
        do {
            try writer.registerPhotosManifest()
        } catch {
            PatinaLog.scan.error("[RoomCaptureService] photos manifest register failed: \(error.localizedDescription)")
        }

        // 4. Fold in the instrument layer — the seven top-level keys
        //    `validate_capture_bundle.py` §10.2 requires of every v1 bundle
        //    (`bundleSpecVersion`, `session`, `anchors`, `scorecard`,
        //    `poseGraphSummary`, `unverified`, `checksumAlgorithm`). A client
        //    scan that omitted them died at ingest on SCHEMA_VIOLATION, which
        //    is a PERMANENT_TOKEN: parked on attempt 1, never retried.
        //
        //    Immediately before the seal, never after: `finalize` rewrites
        //    manifest.json from the same in-memory value, so this ordering puts
        //    the layer in the sealed bytes in one pass, and it is `finalize`
        //    that computes the sha256s `checksumAlgorithm` is a claim about.
        //
        //    Best-effort, deliberately: a scan the user just finished must not
        //    be lost to a manifest-write failure here. The server's verdict on
        //    a bundle missing the layer is a parked task; its verdict on a
        //    bundle that never sealed is nothing at all.
        if let instrument = context.instrument {
            do {
                try writer.applyInstrumentLayer(instrument)
            } catch {
                PatinaLog.scan.error(
                    "[RoomCaptureService] instrument layer write failed: \(error.localizedDescription)")
            }
        }

        // 5. Seal the manifest (recomputes sizes, hashes artifacts). It does
        //    NOT list manifest.json as an artifact of itself — the list cannot
        //    contain itself, and the entry could never carry the sha256 the
        //    validator requires. The uploader adds it from
        //    `ArtifactUploader.uploadPlan(for:in:)`, where the hash is real.
        //    Nothing here transmits: sealing writes into the on-disk bundle and
        //    the scan then rests in `.heldLocal`. Bytes leave the phone only
        //    later, from the explicit design-request flow.
        _ = try writer.finalize(hashArtifacts: true)
    }

    /// Fold the review step's three edits into the photo list. Pure — extracted
    /// from `applyReviewAndSeal` so the seal path reads as its four steps.
    private static func applyingReview(
        to photos: [ScanManifest.PhotoEntry],
        heroPhotoId: UUID?,
        reorderedPhotoIds: [UUID],
        photoAnnotations: [UUID: String]
    ) -> [ScanManifest.PhotoEntry] {
        // Build an index → orderIndex map from the caller's ordering.
        var orderLookup: [UUID: Int] = [:]
        for (idx, id) in reorderedPhotoIds.enumerated() {
            orderLookup[id] = idx
        }

        return photos.map { photo in
            var copy = photo
            if let heroId = heroPhotoId {
                copy.isUserSelectedHero = (copy.id == heroId)
            }
            if let idx = orderLookup[copy.id] {
                copy.orderIndex = idx
            }
            if let caption = photoAnnotations[copy.id] {
                let trimmed = caption.trimmingCharacters(in: .whitespacesAndNewlines)
                copy.userAnnotation = trimmed.isEmpty ? nil : trimmed
            }
            return copy
        }
    }

    // MARK: - Depth helpers

    /// Zip the `<bundleURL>/depth/` directory into a sibling `depth.zip`
    /// using `NSFileCoordinator`'s `forUploading` option. Returns the URL
    /// of the coordinator-provided zip in a temp location (caller is
    /// responsible for cleanup).
    private func zipDepthDirectory(at bundleURL: URL) throws -> URL {
        let depthDir = bundleURL.appendingPathComponent("depth", isDirectory: true)
        guard FileManager.default.fileExists(atPath: depthDir.path) else {
            throw NSError(
                domain: "RoomCaptureService",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "depth directory missing"]
            )
        }
        let coordinator = NSFileCoordinator()
        var coordError: NSError?
        var producedURL: URL?
        var innerError: Error?
        coordinator.coordinate(
            readingItemAt: depthDir,
            options: [.forUploading],
            error: &coordError
        ) { zippedTempURL in
            // `zippedTempURL` lives in a system temp dir and is valid only
            // within this block. Move it to our own temp location so the
            // caller can read it after the closure returns.
            let destURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(UUID().uuidString)-depth.zip")
            do {
                if FileManager.default.fileExists(atPath: destURL.path) {
                    try FileManager.default.removeItem(at: destURL)
                }
                try FileManager.default.moveItem(at: zippedTempURL, to: destURL)
                producedURL = destURL
            } catch {
                innerError = error
            }
        }
        if let coordError { throw coordError }
        if let innerError { throw innerError }
        guard let url = producedURL else {
            throw NSError(
                domain: "RoomCaptureService",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "zip coordinator returned no URL"]
            )
        }
        return url
    }
}
