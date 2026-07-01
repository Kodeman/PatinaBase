//  LocalCaptureSyncService.swift
//  Capture
//
//  Team D — the concrete sync backbone (replaces InMemoryCaptureSyncService in
//  AppContainer). Offline-first: `enqueue` only ever touches the local outbox
//  and never blocks on the network; `drain` walks the outbox oldest-first,
//  simulates artifact upload + commit, and streams `SyncSnapshot`s that drive
//  U1 and the offline-sync Live Activity.
//
//  The REAL backend (Supabase Storage upload to `capture-media` + the
//  `commit_field_capture` RPC, idempotent on `Specimen.clientToken`) is wired
//  post-validation — see the TODO in `commit`. No supabase dependency yet.

import Foundation
import CaptureKit

enum LocalSyncError: LocalizedError {
    case specimenNotFound(UUID)
    var errorDescription: String? {
        switch self {
        case .specimenNotFound(let id): return "Specimen \(id) not found in the local store."
        }
    }
}

@MainActor
final class LocalCaptureSyncService: CaptureSyncService {
    private let store: CaptureStore
    private let analytics: (any CaptureAnalytics)?
    /// Optional: when present, the offline-sync Live Activity tracks the queue.
    private let liveActivity: CaptureLiveActivityController?

    private let stream: AsyncStream<SyncSnapshot>
    private let continuation: AsyncStream<SyncSnapshot>.Continuation
    private var isDraining = false

    init(store: CaptureStore,
         analytics: (any CaptureAnalytics)? = nil,
         liveActivity: CaptureLiveActivityController? = nil) {
        self.store = store
        self.analytics = analytics
        self.liveActivity = liveActivity
        var cont: AsyncStream<SyncSnapshot>.Continuation!
        self.stream = AsyncStream(bufferingPolicy: .bufferingNewest(8)) { cont = $0 }
        self.continuation = cont
    }

    var snapshots: AsyncStream<SyncSnapshot> { stream }

    // ── enqueue ──────────────────────────────────────────────────────────────
    /// Mark the specimen ready and persist to the local outbox. Offline-safe:
    /// never reaches for the network. `.ready` and `.queued` both live in the
    /// outbox; we mark `.ready` here and let a drain (or the offline banner)
    /// move a stuck item to `.queued` — `CaptureStore.outbox()` covers both.
    func enqueue(_ specimenID: UUID) async {
        guard let s = store.specimen(id: specimenID) else { return }
        s.status = .ready
        s.lifecycleRaw = CaptureLifecycle.State.routed.rawValue
        s.lastSyncError = nil
        try? store.save()
        analytics?.event("sync.enqueue", ["id": specimenID.uuidString])
        emitFromOutbox(lastTitle: s.title)
    }

    // ── drain ────────────────────────────────────────────────────────────────
    /// Back online / manual retry: walk the outbox oldest-first, upload + commit
    /// each, emitting progress snapshots. Re-entrancy guarded.
    func drain() async {
        guard !isDraining else { return }
        let items = store.outbox()                       // ready/queued/failed, oldest-first
        guard !items.isEmpty else { emitFromOutbox(); return }
        isDraining = true
        defer { isDraining = false }

        liveActivity?.start(
            venueLabel: items.first?.venue?.placemarkName,
            state: .init(queued: items.count, uploading: 0, failed: 0,
                         lastSpecimenTitle: items.first?.title)
        )
        analytics?.event("sync.drain.start", ["count": "\(items.count)"])

        var remaining = items.count
        for s in items {
            s.status = .uploading
            s.uploadProgress = 0
            try? store.save()
            emit(queued: max(remaining - 1, 0), uploading: 1, lastTitle: s.title)

            // Simulated artifact upload progress (real bytes go up post-validation).
            for step in stride(from: 20, through: 100, by: 20) {
                s.uploadProgress = step
                try? store.save()
                try? await Task.sleep(nanoseconds: 60_000_000) // 60ms
            }

            do {
                _ = try await commit(s.id)                 // flips to .committed
                analytics?.event("sync.commit.ok", ["id": s.id.uuidString])
            } catch {
                s.status = .failed
                s.retryCount += 1
                s.lastSyncError = error.localizedDescription
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
    /// `Specimen.clientToken`. For validation this only flips local status; the
    /// real network call is deferred.
    @discardableResult
    func commit(_ specimenID: UUID) async throws -> CommitReceipt {
        guard let s = store.specimen(id: specimenID) else {
            throw LocalSyncError.specimenNotFound(specimenID)
        }

        // TODO(post-validation): wire supabase-swift —
        //   1. Upload each CapturePhoto/voice artifact to Storage bucket
        //      `capture-media` (path keyed by clientToken so replays dedupe).
        //   2. Call the `commit_field_capture` RPC with clientToken as the
        //      idempotency key; map the returned remote/product id back here.
        //   3. Surface a conflict (record changed server-side) by routing to .inbox.
        // For now: settle the record locally and synthesise a receipt.

        s.status = .committed
        s.uploadProgress = 100
        s.lastSyncError = nil
        if s.remoteId == nil { s.remoteId = UUID().uuidString }
        // Resolve lifecycle to its terminal home based on the routing decision.
        switch s.destination {
        case .inbox:                 s.lifecycleRaw = CaptureLifecycle.State.inbox.rawValue
        case .library, .undecided:   s.lifecycleRaw = CaptureLifecycle.State.saved.rawValue
        }
        try? store.save()

        return CommitReceipt(
            remoteId: s.remoteId ?? specimenID.uuidString,
            productId: s.committedProductId,
            destination: s.destination == .undecided ? .library : s.destination,
            created: true
        )
    }

    // ── route ────────────────────────────────────────────────────────────────
    /// Triage a synced/inbox capture to library vs inbox; updates local status.
    func route(_ specimenID: UUID, to destination: CaptureDestination) async throws {
        guard let s = store.specimen(id: specimenID) else {
            throw LocalSyncError.specimenNotFound(specimenID)
        }
        s.destination = destination
        s.lifecycleRaw = (destination == .inbox
            ? CaptureLifecycle.State.inbox
            : CaptureLifecycle.State.saved).rawValue
        try? store.save()
        // TODO(post-validation): mirror the routing decision server-side.
        analytics?.event("sync.route", ["id": specimenID.uuidString, "to": destination.rawValue])
        emitFromOutbox()
    }

    // ── snapshot plumbing ──────────────────────────────────────────────────────
    private func failedCount() -> Int {
        store.outbox().filter { $0.status == .failed }.count
    }

    /// Emit a snapshot derived purely from what's still in the outbox
    /// (ready/queued/failed) — used after enqueue/route and at drain edges.
    private func emitFromOutbox(lastTitle: String? = nil) {
        let out = store.outbox()
        let failed = out.filter { $0.status == .failed }.count
        let queued = out.count - failed
        emit(queued: queued, uploading: 0, failed: failed, lastTitle: lastTitle ?? out.last?.title)
    }

    private func emit(queued: Int, uploading: Int, failed: Int? = nil, lastTitle: String?) {
        let failedN = failed ?? failedCount()
        let lastErr = store.outbox().first(where: { $0.status == .failed })?.lastSyncError
        continuation.yield(SyncSnapshot(queued: queued, uploading: uploading,
                                        failed: failedN, lastError: lastErr))
        liveActivity?.update(.init(queued: queued, uploading: uploading,
                                   failed: failedN, lastSpecimenTitle: lastTitle))
    }
}
