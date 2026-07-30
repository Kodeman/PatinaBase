//
//  ArtifactUploader.swift
//  Patina
//
//  Per-artifact upload logic for the advanced-scan (v2/v3) pipeline,
//  extracted from RoomScanSyncService.swift (PT-6-1) without behavior
//  change.
//
//  Owns the Storage bucket name, the size-gated direct/background upload
//  strategy, the artifact→column / artifact→storage-path mapping, the
//  `UploadCompletionRouter` that bridges `BackgroundScanUploader` callbacks
//  back to awaiting continuations, and the `UploadedBytesCounter` used to
//  throttle progress writes. `RoomScanSyncService` owns one instance and
//  delegates the actual byte-pushing here; the orchestration (bounded
//  concurrency loop, per-artifact state machine, DB column patches) stays
//  on the service so observable behavior is unchanged.
//

import Foundation
import Supabase

/// Routes `BackgroundScanUploader` progress + completion callbacks back to
/// the continuations that kicked the upload off.
///
/// Waiters register a continuation keyed by `(scanId, artifactKind)` before
/// enqueueing the descriptor; the uploader delegate invokes `resolve(...)`
/// on completion which pops the entry and resumes exactly once. This lets
/// the strict orchestration in `uploadArtifactsBoundedConcurrency` (TaskGroup
/// / bounded in-flight window) await the background URLSession path without
/// rewriting the top-level flow.
@MainActor
final class UploadCompletionRouter {
    private var continuations: [String: CheckedContinuation<Void, Error>] = [:]

    private static func key(scanId: UUID, kind: String) -> String {
        "\(scanId.uuidString)-\(kind)"
    }

    func register(
        scanId: UUID,
        kind: String,
        continuation: CheckedContinuation<Void, Error>
    ) {
        let k = Self.key(scanId: scanId, kind: kind)
        // If a duplicate enqueue sneaks in, fail the new waiter rather than
        // orphan the old one — the bounded-concurrency loop won't re-enter
        // for the same kind in practice, but better safe than wedged.
        if let existing = continuations.removeValue(forKey: k) {
            existing.resume(throwing: BackgroundScanUploader.UploadError.cancelled)
        }
        continuations[k] = continuation
    }

    func resolve(
        scanId: UUID,
        kind: String,
        result: Result<Void, BackgroundScanUploader.UploadError>
    ) {
        let k = Self.key(scanId: scanId, kind: kind)
        guard let cont = continuations.removeValue(forKey: k) else { return }
        switch result {
        case .success: cont.resume()
        case .failure(let err): cont.resume(throwing: err)
        }
    }
}

/// Tiny actor counter used to update `upload_progress` after each artifact
/// completes. Using an actor avoids `Sendable` mutation warnings inside the
/// TaskGroup closures.
actor UploadedBytesCounter {
    private(set) var uploaded: Int = 0
    private(set) var lastProgressPercent: Int = -1
    private var lastProgressWrite: Date = .distantPast

    func add(_ bytes: Int, total: Int) -> (percent: Int, shouldWrite: Bool) {
        uploaded += bytes
        let pct = min(100, Int((Double(uploaded) / Double(total)) * 100))
        let now = Date()
        let throttled = now.timeIntervalSince(lastProgressWrite) < 1.0
        if pct == lastProgressPercent || throttled {
            return (pct, false)
        }
        lastProgressPercent = pct
        lastProgressWrite = now
        return (pct, true)
    }
}

/// Per-artifact uploader. Pushes a single bundle artifact to Supabase
/// Storage (inline for small files, via `BackgroundScanUploader` for large
/// ones) and merges its SHA256 into `room_scans.artifacts_sha256`.
@MainActor
final class ArtifactUploader {

    /// Storage bucket that holds the advanced-scan bundle artifacts.
    let usdzBucket: String

    /// Router for BackgroundScanUploader continuations. Each in-flight
    /// artifact upload via the background URLSession path parks its waiter
    /// here, keyed by (scanId, artifactKind).
    let uploadRouter = UploadCompletionRouter()

    /// Artifact upload strategy. A size threshold decides whether we keep
    /// the inline supabase-swift upload (small files) or route through the
    /// background URLSession path.
    enum UploadStrategy { case direct, background }

    static let backgroundUploadThreshold: Int = 5 * 1024 * 1024

    static func strategy(for sizeBytes: Int) -> UploadStrategy {
        sizeBytes < backgroundUploadThreshold ? .direct : .background
    }

    init(usdzBucket: String) {
        self.usdzBucket = usdzBucket
        // Wire BackgroundScanUploader callbacks to the router / progress
        // surface. The uploader dispatches these on the main actor.
        BackgroundScanUploader.shared.onCompletion = { [weak self] scanId, kind, result in
            self?.uploadRouter.resolve(scanId: scanId, kind: kind, result: result)
        }
        BackgroundScanUploader.shared.onProgress = { [weak self] scanId, kind, pct in
            self?.applyBackgroundProgress(scanId: scanId, kind: kind, progress: pct)
        }
    }

    // MARK: - Artifact upload

    /// Upload a single artifact to Supabase Storage. Returns nil when the
    /// kind is a sidecar (no storage upload required); otherwise returns the
    /// **bucket object key** — what the caller writes into the artifact's
    /// `room_scans` URL column. `room-scans` is private, so a public URL there
    /// would not resolve; see the comment at the assignment below. On success
    /// we merge the SHA256 into `room_scans.artifacts_sha256` via the
    /// `merge_scan_artifact_sha256` RPC.
    func uploadArtifact(
        artifact: ScanManifest.Artifact,
        from bundleURL: URL,
        userId: UUID,
        roomId: UUID,
        scanId: UUID
    ) async throws -> String? {
        guard let (folderPrefix, filename) = Self.storagePathComponents(for: artifact) else {
            // Sidecar artifact — not uploaded on its own.
            return nil
        }

        let fileURL = bundleURL.appendingPathComponent(artifact.relativePath)
        // Lowercase the UUIDs: Storage RLS policy `auth.uid()::text =
        // (storage.foldername(name))[2]` compares against the lowercase
        // canonical UUID string Postgres uses, while iOS Foundation's
        // `UUID.uuidString` returns the uppercase form. The case mismatch
        // was the root cause of every artifact upload throwing
        // "new row violates row-level security policy" in the 2026-05-13
        // retest (scan 9AD8F978).
        let path = "\(folderPrefix)/\(userId.uuidString.lowercased())/\(roomId.uuidString.lowercased())/\(filename)"
        // STORE THE PLAIN BUCKET KEY, not a public URL. `room-scans` is a
        // PRIVATE bucket (`public = false`, migration 00031, never flipped), so
        // the `…/storage/v1/object/public/room-scans/<key>` string this line
        // used to return is a URL that answers `400 Bucket not found` —
        // recorded in I104 against `room_scans.scan_bundle_url` and
        // `depth_archive_url`, both of which this method feeds.
        //
        // Nothing regresses by dropping it: every consumer in the repo already
        // reduces the column back to a bucket key and never fetches it as a URL
        // (`confirm-scan-bundle`, `parse-room-scan`'s `objectKeyFromUrl`, the
        // scan worker's `keys.object_key_from_url`, the portals'
        // `publicUrlToPath`), and each has an explicit "no marker / no scheme →
        // use as-is" branch, pinned by `parse-room-scan/lib.test.ts`.
        //
        // Not `/object/authenticated/…`: no precedent in this repo, and it
        // embeds the project host in a data column. Not a signed URL: those
        // expire, and the house pattern is to sign at READ time
        // (`use-room-scans.ts`). Private buckets added since do exactly this —
        // `capture-media` (00234) stores `path`, `site-requests` (00374) stores
        // `object_path`.
        let storedReference = Self.storedReference(forObjectPath: path)

        // Size-gated strategy. Large files (>= 5 MB) go through the
        // BackgroundScanUploader so they survive app-suspension; smaller
        // files use the inline supabase-swift upload.
        let strategy = Self.strategy(for: artifact.sizeBytes)
        if strategy == .background {
            try await uploadArtifactViaBackground(
                artifact: artifact,
                fileURL: fileURL,
                storagePath: path,
                scanId: scanId
            )
        } else {
            let data = try Data(contentsOf: fileURL)

            // Build metadata (sha256 + scan ids) only when we have a hash.
            // FileOptions in supabase-swift exposes a `metadata: [String: AnyJSON]?`
            // field; the storage server persists it alongside the object.
            var metadata: [String: AnyJSON]? = nil
            if let sha = artifact.sha256, !sha.isEmpty {
                metadata = [
                    "sha256": .string(sha),
                    "scanId": .string(scanId.uuidString),
                    "artifactKind": .string(artifact.kind.rawValue)
                ]
            }

            try await supabase.storage
                .from(usdzBucket)
                .upload(
                    path,
                    data: data,
                    options: FileOptions(
                        contentType: artifact.mimeType,
                        upsert: true,
                        metadata: metadata
                    )
                )
        }

        let shaPreview = (artifact.sha256 ?? "").prefix(10)
        PatinaLog.sync.debug("[RoomScanSync] uploaded \(artifact.kind.rawValue) via \(strategy) sha=\(shaPreview)")

        // Merge the sha into room_scans.artifacts_sha256 (best-effort; the
        // RPC lives in migration 00082 — runtime only).
        if let sha = artifact.sha256, !sha.isEmpty {
            do {
                try await supabase
                    .rpc("merge_scan_artifact_sha256", params: ArtifactShaMergeParams(
                        p_scan_id: scanId.uuidString,
                        p_kind: artifact.kind.rawValue,
                        p_sha: sha
                    ))
                    .execute()
            } catch {
                PatinaLog.sync.error("[RoomScanSync] merge_scan_artifact_sha256 failed (non-fatal): \(error.localizedDescription)")
            }
        }

        return storedReference
    }

    /// Enqueue an artifact through `BackgroundScanUploader` and await its
    /// completion via a continuation parked in `uploadRouter`. The uploader
    /// delegates its `onCompletion` callback to the router in `init`, so
    /// the completion either resumes this continuation on success or
    /// throws the upstream `BackgroundScanUploader.UploadError`.
    ///
    /// The router bounces duplicate `(scanId, kind)` enqueues — which should
    /// only happen on resume, where `uploadAdvancedScanBundle` short-circuits
    /// any artifact whose state is already `.uploaded`. For an artifact in
    /// `.uploading` state, we still let this path re-enter: the uploader's
    /// upsert PUT is idempotent by design.
    func uploadArtifactViaBackground(
        artifact: ScanManifest.Artifact,
        fileURL: URL,
        storagePath: String,
        scanId: UUID
    ) async throws {
        let descriptor = BackgroundScanUploader.UploadDescriptor(
            scanId: scanId,
            artifactKind: artifact.kind.rawValue,
            sha256: artifact.sha256,
            mimeType: artifact.mimeType,
            sizeBytes: artifact.sizeBytes,
            fileURL: fileURL,
            storagePath: storagePath,
            sizeExpected: artifact.sizeBytes
        )

        // Register the continuation FIRST so the uploader's URLSession
        // completion handler can find it. Then enqueue. If enqueue throws
        // synchronously (invalid URL, missing session, etc.), resolve the
        // router entry with the failure so the continuation unwinds.
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            uploadRouter.register(
                scanId: scanId,
                kind: artifact.kind.rawValue,
                continuation: cont
            )
            Task { @MainActor in
                do {
                    try await BackgroundScanUploader.shared.upload(descriptor)
                } catch {
                    uploadRouter.resolve(
                        scanId: scanId,
                        kind: artifact.kind.rawValue,
                        result: .failure(.transport(error))
                    )
                }
            }
        }
    }

    /// Push `BackgroundScanUploader` progress callbacks into the in-memory
    /// `artifactState.status = .uploading` so UI observing the
    /// `RoomScanPackage` sees live progress. The uploader already throttles
    /// its callbacks to ~2 Hz so we don't need to debounce further.
    ///
    /// Kept minimal: we only bump the attempts counter / status transition;
    /// the precise percent is not persisted on `ArtifactUploadState` (that
    /// struct tracks status, not byte-progress). Callers that want live
    /// progress can subscribe to `BackgroundScanUploader.shared.onProgress`
    /// directly.
    func applyBackgroundProgress(
        scanId: UUID,
        kind: String,
        progress: Double
    ) {
        // Reserved for future per-artifact byte-progress surfacing. The
        // router continuation above resolves on completion, which flips
        // artifactState to .uploaded — that's where the UI flip happens.
        _ = (scanId, kind, progress)
    }

    // MARK: - Artifact → column / storage-path mapping

    /// THE routing table: where a kind's bytes go in Storage, and which
    /// `room_scans` column records the resulting object key. One switch, so
    /// the two facts cannot drift apart.
    ///
    /// They used to live in two switches whose comments contradicted each
    /// other about `.depthIndex` / `.photoThumbnails` / `.annotations` — one
    /// claimed those files were uploaded but not column-patched, the other
    /// that they were not uploaded at all. The second was right (see
    /// `uploadArtifact`'s guard), but only one of the two could ever be, and
    /// nothing stopped the next edit from re-splitting them.
    ///
    /// Column and folder are deliberately a single unit: a column holds the
    /// object key of an uploaded object, so a column without an upload is a
    /// permanently-NULL column and an upload without a column is an orphan
    /// object nothing can find. `nil` means neither — a local-only sidecar.
    ///
    /// The v3 columns (`bundle_manifest_url`, `photos_manifest_url`,
    /// `coverage_heatmap_url`) come from `supabase/migrations/00082_*.sql`.
    /// Swift compiles either way; at runtime the PATCH fails until that
    /// migration is applied.
    nonisolated private static func routing(
        for kind: ScanManifest.ArtifactKind
    ) -> (column: String, folder: String)? {
        switch kind {
        case .usdz:             return ("model_url", "usdz")
        case .capturedRoomJson: return ("captured_room_json_url", "captured_room")
        case .worldMap:         return ("world_map_url", "worldmap")
        case .mesh:             return ("mesh_url", "mesh")
        case .depthArchive:     return ("depth_archive_url", "depth")
        case .bundleArchive:    return ("scan_bundle_url", "bundle")
        case .heroThumbnail:    return ("hero_frame_url", "thumbnails")
        case .bundleManifest:   return ("bundle_manifest_url", "manifests")
        case .photosManifest:   return ("photos_manifest_url", "photos_manifest")
        case .coverageHeatmap:  return ("coverage_heatmap_url", "coverage")

        // Local-only sidecars: no column, and — the part that used to be
        // mis-documented — no upload either. `uploadArtifact(...)` guards on
        // `storagePathComponents(for:)`, and a nil there returns before a
        // single byte is sent; the orchestrator then marks the artifact
        // `.skipped`. `scanColumn(for:)` is consulted only AFTER a non-nil
        // upload result, so it can neither cause nor suppress an upload.
        //
        // Nothing is lost by holding these back — each one's content already
        // reaches the server inside an artifact that IS uploaded:
        //
        // - depthIndex: `depth/depth_index.ndjson` is written, registered, and
        //   only then is `depth/` zipped into `depth.zip` (`.depthArchive`), so
        //   the index rides along inside it.
        // - annotations: `ScanManifest.annotations` is a field of manifest.json,
        //   uploaded as `.bundleManifest`.
        // - photoThumbnails: every line is `photoId` + `thumbnailRelativePath` +
        //   `sizeBytes`, all three already in `manifest.photos`. More decisive:
        //   the thumbnail FILES are never uploaded (only full-resolution posed
        //   photos are, by `uploadPosedPhotos`), so a thumbnail index in Storage
        //   would index objects that do not exist.
        case .depthIndex,
             .photoThumbnails,
             .annotations:
            return nil
        }
    }

    nonisolated static func scanColumn(for kind: ScanManifest.ArtifactKind) -> String? {
        routing(for: kind)?.column
    }

    /// What goes in a `room_scans` artifact URL column for an object at
    /// `path` — the **plain bucket key**, unchanged.
    ///
    /// Extracted so the choice is reachable from a test rather than buried in
    /// an async method that needs a live Supabase client. See the long comment
    /// in `uploadArtifact` for why a key and not a public URL, an
    /// `/object/authenticated/` path, or a signed URL. Field's uploader has the
    /// identical seam (`RoomScanStoragePath.storedReference`).
    nonisolated static func storedReference(forObjectPath path: String) -> String { path }

    /// Where this artifact's bytes land in the `room-scans` bucket, or nil for
    /// a local-only sidecar. `uploadArtifact(...)` guards on this: nil returns
    /// before anything is sent. See `routing(for:)` for the table and for why
    /// exactly three kinds are held back.
    ///
    /// The folder is only the FIRST path segment — `uploadArtifact` completes
    /// the key as `<folder>/<userId>/<roomId>/<filename>`, which is what the
    /// 00031/00077 Storage policies check (`foldername(name)[2] = auth.uid()`).
    /// Those policies are prefix-agnostic, so a new folder here needs no
    /// migration.
    nonisolated static func storagePathComponents(for artifact: ScanManifest.Artifact) -> (folder: String, filename: String)? {
        guard let folder = routing(for: artifact.kind)?.folder else { return nil }
        let filename: String
        if let last = artifact.relativePath.split(separator: "/").last {
            filename = String(last)
        } else {
            filename = artifact.relativePath
        }
        return (folder, filename)
    }
}
