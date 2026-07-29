//  LocalCaptureSyncService.swift
//  Capture
//
//  The concrete sync backbone (real mode). Offline-first: `enqueue` only ever
//  touches the local outbox and never blocks on the network; `drain` walks the
//  outbox oldest-first, and `commit` does the real work — uploads each artifact
//  to the `capture-media` bucket (00234) then calls `commit_field_capture`
//  (00235), idempotent on `Specimen.clientToken`. It streams `SyncSnapshot`s that
//  drive U1 and the offline-sync Live Activity.
//
//  Network I/O goes through the injected `SupabaseCaptureGateway`. A missing
//  gateway is deferrable: the record remains queued and is never presented as a
//  remote success without a server receipt.

import Foundation
import UIKit
import CaptureKit

enum LocalSyncError: LocalizedError {
    case specimenNotFound(UUID)
    /// No signed-in session — the capture must stay queued, not fail.
    case notAuthenticated
    case remoteUnavailable
    case missingRemoteReceipt
    case remoteRejected(String)

    var errorDescription: String? {
        switch self {
        case .specimenNotFound(let id): return "Specimen \(id) not found in the local store."
        case .notAuthenticated: return "Not signed in — captures stay queued until you connect."
        case .remoteUnavailable: return "Sync isn't available yet — this capture stays on this device."
        case .missingRemoteReceipt: return "The server did not confirm this capture."
        case .remoteRejected(let message): return message
        }
    }

    /// Deferrable failures leave the item queued (no `.failed`, no retry penalty).
    var isDeferrable: Bool {
        if case .notAuthenticated = self { return true }
        if case .remoteUnavailable = self { return true }
        return false
    }

    var isRejected: Bool {
        if case .remoteRejected = self { return true }
        return false
    }
}

@MainActor
final class LocalCaptureSyncService: CaptureSyncService {
    private let store: CaptureStore
    private let analytics: (any CaptureAnalytics)?
    /// Optional: when present, the offline-sync Live Activity tracks the queue.
    private let liveActivity: CaptureLiveActivityController?
    /// Identity source for the storage path (`<uid>/…`) + `p_organization_id`.
    private let session: (any SessionProviding)?
    /// When present, commits do real upload + RPC; nil leaves records queued.
    private let remote: SupabaseCaptureGateway?

    private let stream: AsyncStream<SyncSnapshot>
    private let continuation: AsyncStream<SyncSnapshot>.Continuation
    private var isDraining = false

    init(store: CaptureStore,
         analytics: (any CaptureAnalytics)? = nil,
         liveActivity: CaptureLiveActivityController? = nil,
         session: (any SessionProviding)? = nil,
         remote: SupabaseCaptureGateway? = nil) {
        self.store = store
        self.analytics = analytics
        self.liveActivity = liveActivity
        self.session = session
        self.remote = remote
        var cont: AsyncStream<SyncSnapshot>.Continuation!
        self.stream = AsyncStream(bufferingPolicy: .bufferingNewest(8)) { cont = $0 }
        self.continuation = cont
    }

    var snapshots: AsyncStream<SyncSnapshot> { stream }

    // ── enqueue ──────────────────────────────────────────────────────────────
    /// Persist the specimen in the local queue. Offline-safe: never reaches for
    /// the network.
    func enqueue(_ specimenID: UUID) async {
        guard let s = store.specimen(id: specimenID) else { return }
        s.applyTransferState(CaptureTransferState(
            phase: .queued, retryCount: s.retryCount))
        try? store.save()
        analytics?.event("sync.enqueue", ["id": specimenID.uuidString])
        emitFromOutbox(lastTitle: s.title)
    }

    // ── drain ────────────────────────────────────────────────────────────────
    /// Back online / manual retry: walk the outbox oldest-first, upload + commit
    /// each, emitting progress snapshots. Re-entrancy guarded.
    func drain() async {
        guard !isDraining else { return }
        let items = store.outbox().filter {
            $0.transferState.phase != .rejected
        }
        guard !items.isEmpty else { emitFromOutbox(); return }

        // Real mode with no session yet: nothing can be uploaded — keep the whole
        // outbox queued (never surface a failure) and wait for auth.
        if remote != nil, session?.userID == nil {
            for s in items where s.status != .queued {
                s.applyTransferState(CaptureTransferState(
                    phase: .queued, retryCount: s.retryCount))
            }
            try? store.save()
            analytics?.event("sync.drain.deferred", ["reason": "no-session", "count": "\(items.count)"])
            emitFromOutbox()
            return
        }

        isDraining = true
        defer { isDraining = false }

        beginDrain(items)

        var remaining = items.count
        for s in items {
            s.applyTransferState(CaptureTransferState(
                phase: .uploading, retryCount: s.retryCount))
            try? store.save()
            emit(queued: max(remaining - 1, 0), uploading: 1, lastTitle: s.title)

            do {
                _ = try await commit(s.id)                 // real: upload + RPC
                analytics?.event("sync.commit.ok", ["id": s.id.uuidString])
            } catch let error as LocalSyncError where error.isDeferrable {
                // No auth mid-drain — requeue with no retry penalty.
                s.applyTransferState(CaptureTransferState(
                    phase: .queued, retryCount: s.retryCount))
                try? store.save()
                analytics?.event("sync.commit.deferred", ["id": s.id.uuidString])
            } catch {
                let rejected = (error as? LocalSyncError)?.isRejected == true
                s.applyTransferState(CaptureTransferState(
                    phase: rejected ? .rejected : .retryableFailure,
                    progress: s.uploadProgress,
                    errorMessage: error.localizedDescription,
                    retryCount: s.retryCount + (rejected ? 0 : 1)))
                try? store.save()
                analytics?.event("sync.commit.fail", ["id": s.id.uuidString])
            }
            remaining -= 1
            emit(queued: remaining, uploading: 0, lastTitle: s.title)
        }

        let failed = failedCount()
        liveActivity?.end(.init(queued: 0, uploading: 0, failed: failed))
        analytics?.event("sync.drain.done", ["failed": "\(failed)"])
        emitFromOutbox()
    }

    // ── commit ───────────────────────────────────────────────────────────────
    /// Upload artifacts + land the record server-side. Idempotent on
    /// `Specimen.clientToken`. No gateway leaves the item queued.
    @discardableResult
    func commit(_ specimenID: UUID) async throws -> CommitReceipt {
        guard let s = store.specimen(id: specimenID) else {
            throw LocalSyncError.specimenNotFound(specimenID)
        }
        guard let remote else { throw LocalSyncError.remoteUnavailable }

        // Auth precondition: no session → stay queued (surfaced as deferrable, not
        // a failure). Missing/invalid workspace is fine — pass NULL org (00235
        // accepts a nullable p_organization_id).
        guard let uidString = session?.userID, let uid = UUID(uuidString: uidString) else {
            throw LocalSyncError.notAuthenticated
        }

        // (a) Upload each artifact to <uid>/<clientToken>/<file> in capture-media.
        // CaptureMediaPath lowercases both segments — storage RLS (00234) compares
        // against Postgres's lowercase auth.uid()::text, while Foundation's
        // uuidString is uppercase; building this inline previously threw an RLS
        // violation on every real upload.
        let folder = CaptureMediaPath.folder(userID: uid, clientToken: s.clientToken)
        let orderedPhotos = s.photos.sorted { $0.order < $1.order }
        let hasVoice = !(s.voiceAudioFilename ?? "").isEmpty
        let total = orderedPhotos.count + (hasVoice ? 1 : 0)
        var done = 0

        for photo in orderedPhotos {
            let url = store.mediaURL(for: photo.filename)
            guard let data = try? Data(contentsOf: url) else { continue } // file gone → skip
            let path = "\(folder)/\(photo.filename)"
            try await remote.upload(data, to: path, contentType: Self.mimeType(for: photo.filename))
            photo.remotePath = path
            done += 1
            bumpProgress(s, uploaded: done, total: total)
        }

        var uploadedVoicePath: String?
        if let voiceFile = s.voiceAudioFilename, !voiceFile.isEmpty {
            let url = store.mediaURL(for: voiceFile)
            if let data = try? Data(contentsOf: url) {
                let path = "\(folder)/\(voiceFile)"
                try await remote.upload(data, to: path, contentType: Self.mimeType(for: voiceFile))
                uploadedVoicePath = path
                done += 1
                bumpProgress(s, uploaded: done, total: total)
            }
        }
        try? store.save()

        // (b) Build the payload and call commit_field_capture.
        var payload = FieldCapturePayload(specimen: s, device: Self.deviceInfo())
        // Upgrade the voice path from the local filename to the full object path.
        if let uploadedVoicePath { payload.voice?.audioPath = uploadedVoicePath }

        let destination = s.destination == .inbox ? "inbox" : "library"
        let routing = CaptureRoutingContext(
            projectID: s.venue?.projectId.flatMap { UUID(uuidString: $0) },
            projectRoomID: s.venue?.projectRoomId.flatMap { UUID(uuidString: $0) },
            shelf: s.venue?.shelf,
            organizationID: session?.workspaceID.flatMap { UUID(uuidString: $0) }
        )
        s.applyTransferState(CaptureTransferState(
            phase: .awaitingConfirmation,
            progress: 100,
            retryCount: s.retryCount))
        try? store.save()
        emitTransferState(lastTitle: s.title)
        let result = try await remote.commit(
            clientCaptureID: s.clientToken,
            destination: destination,
            payload: payload,
            routing: routing
        )

        // (c) Map the result home.
        return try applyCommitResult(result, to: s)
    }

    // ── route ────────────────────────────────────────────────────────────────
    /// Triage a synced/inbox capture to library vs inbox; updates local status.
    /// A not-yet-committed specimen keeps only the local mutation (it carries its
    /// `destination` into the eventual commit). An already-committed capture being
    /// promoted to the library mirrors server-side via `route_field_capture`.
    func route(_ specimenID: UUID, to destination: CaptureDestination) async throws {
        guard let s = store.specimen(id: specimenID) else {
            throw LocalSyncError.specimenNotFound(specimenID)
        }
        let previousDestination = s.destination

        guard let remoteId = s.remoteId,
              let captureUUID = UUID(uuidString: remoteId),
              s.status == .committed else {
            s.destination = destination
            s.touch()
            try? store.save()
            await enqueue(specimenID)
            analytics?.event("sync.route", [
                "id": specimenID.uuidString,
                "to": destination.rawValue,
                "state": "queued"
            ])
            return
        }

        // A committed inbox capture can be promoted only after the server
        // returns a fresh receipt/status. Never optimistically claim success.
        if destination == .library {
            guard let remote else { throw LocalSyncError.remoteUnavailable }
            guard session?.userID != nil else { throw LocalSyncError.notAuthenticated }
            let routing = CaptureRoutingContext(
                projectID: s.venue?.projectId.flatMap { UUID(uuidString: $0) },
                projectRoomID: s.venue?.projectRoomId.flatMap { UUID(uuidString: $0) },
                shelf: s.venue?.shelf)
            let result = try await remote.route(captureID: captureUUID, routing: routing)
            _ = try applyCommitResult(result, to: s)
        } else if previousDestination != .inbox {
            throw LocalSyncError.remoteRejected(
                "A confirmed library capture can’t be moved to the inbox from this device.")
        }

        analytics?.event("sync.route", ["id": specimenID.uuidString, "to": destination.rawValue])
        emitFromOutbox()
    }

    // ── result mapping ─────────────────────────────────────────────────────────
    private func applyCommitResult(
        _ result: CaptureCommitResult,
        to s: Specimen
    ) throws -> CommitReceipt {
        guard let captureID = result.captureID else {
            throw LocalSyncError.missingRemoteReceipt
        }
        guard result.status == "saved" || result.status == "inbox" else {
            throw LocalSyncError.remoteRejected(
                "The server rejected this capture; review it before retrying.")
        }

        s.applyTransferState(CaptureTransferState(
            phase: .complete,
            progress: 100,
            retryCount: s.retryCount,
            receiptID: captureID.uuidString))
        if let productID = result.productID { s.committedProductId = productID.uuidString }

        // Server truth: only status=="saved" is a library landing. The only
        // other accepted receipt-backed result is the inbox safe harbor.
        let landedSaved = (result.status == "saved")
        s.destination = landedSaved ? .library : .inbox
        s.lifecycleRaw = (landedSaved ? CaptureLifecycle.State.saved
                                      : CaptureLifecycle.State.inbox).rawValue
        try? store.save()

        return CommitReceipt(
            remoteId: captureID.uuidString,
            productId: s.committedProductId,
            destination: landedSaved ? .library : .inbox,
            created: result.created ?? true
        )
    }

    private func bumpProgress(_ s: Specimen, uploaded: Int, total: Int) {
        // Reserve the last 10% for the commit RPC.
        s.uploadProgress = min(90, Int(Double(uploaded) / Double(max(total, 1)) * 90))
        try? store.save()
        emitTransferState(lastTitle: s.title)
    }

    private func beginDrain(_ items: [Specimen]) {
        liveActivity?.start(
            venueLabel: items.first?.venue?.placemarkName,
            state: .init(
                queued: items.count,
                uploading: 0,
                failed: 0,
                lastSpecimenTitle: items.first?.title))
        analytics?.event("sync.drain.start", ["count": "\(items.count)"])
    }

    // ── device + mime helpers ──────────────────────────────────────────────────
    private static func deviceInfo() -> FieldCapturePayload.Device {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return FieldCapturePayload.Device(
            model: hardwareModel(),
            osVersion: UIDevice.current.systemVersion,
            appVersion: "\(short) (\(build))"
        )
    }

    private static func hardwareModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let id = Mirror(reflecting: systemInfo.machine).children.reduce(into: "") { acc, element in
            if let value = element.value as? Int8, value != 0 {
                acc.append(Character(UnicodeScalar(UInt8(value))))
            }
        }
        return id.isEmpty ? UIDevice.current.model : id
    }

    private static func mimeType(for filename: String) -> String {
        switch (filename as NSString).pathExtension.lowercased() {
        case "heic", "heif": return "image/heic"
        case "jpg", "jpeg":  return "image/jpeg"
        case "png":          return "image/png"
        case "webp":         return "image/webp"
        case "m4a":          return "audio/x-m4a"
        case "mp4":          return "audio/mp4"
        case "aac":          return "audio/aac"
        case "wav":          return "audio/wav"
        default:             return "application/octet-stream"
        }
    }

    // ── snapshot plumbing ──────────────────────────────────────────────────────
    private func failedCount() -> Int {
        store.outbox().filter {
            $0.transferState.phase == .retryableFailure
                || $0.transferState.phase == .rejected
        }.count
    }

    /// Emit a snapshot derived purely from what's still in the outbox
    /// (ready/queued/failed) — used after enqueue/route and at drain edges.
    private func emitFromOutbox(lastTitle: String? = nil) {
        emitTransferState(lastTitle: lastTitle)
    }

    private func emitTransferState(lastTitle: String? = nil) {
        let out = store.outbox()
        let uploading = out.filter {
            $0.transferState.phase == .uploading
                || $0.transferState.phase == .awaitingConfirmation
        }.count
        let failed = out.filter {
            $0.transferState.phase == .retryableFailure
                || $0.transferState.phase == .rejected
        }.count
        let queued = max(out.count - uploading - failed, 0)
        emit(
            queued: queued,
            uploading: uploading,
            failed: failed,
            lastTitle: lastTitle ?? out.last?.title
        )
    }

    private func emit(queued: Int, uploading: Int, failed: Int? = nil, lastTitle: String?) {
        let failedN = failed ?? failedCount()
        let lastErr = store.outbox()
            .compactMap { $0.transferState.errorMessage }
            .first
        continuation.yield(SyncSnapshot(queued: queued, uploading: uploading,
                                        failed: failedN, lastError: lastErr))
        liveActivity?.update(.init(queued: queued, uploading: uploading,
                                   failed: failedN, lastSpecimenTitle: lastTitle))
    }
}
