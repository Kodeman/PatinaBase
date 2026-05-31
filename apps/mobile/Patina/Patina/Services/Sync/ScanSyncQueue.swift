//
//  ScanSyncQueue.swift
//  Patina
//
//  Retry / queue / network-transition management for the room-scan sync
//  pipeline, extracted from RoomScanSyncService.swift (PT-6-1) without
//  behavior change.
//
//  Owns:
//   - the in-memory `QueuedUpload` fallback queue (used when no SwiftData
//     context is configured),
//   - the `NWPathMonitor` network-availability monitor plus the
//     expensive→cheap and offline→online transition detection.
//
//  The persistent (SwiftData) queue drain + per-item upload orchestration
//  stays on `RoomScanSyncService` because it calls back into the service's
//  upload entry points; this type holds the lower-level queue state the
//  service composes. Observable behavior is unchanged: the service still
//  publishes `isNetworkAvailable` / `pendingUploads`, and the same
//  NWPathMonitor handler logic runs — just relocated here and surfaced via
//  callbacks.
//

import Foundation
import Network

/// In-memory fallback upload descriptor (used when no SwiftData context is
/// configured). Mirrors the original `RoomScanSyncService.QueuedUpload`.
struct QueuedUpload {
    let roomData: FirstWalkRoomData
    let styleSignals: FirstWalkStyleSignals
    let projectId: UUID?
    var retryCount: Int = 0
}

/// Network monitoring + in-memory queue manager owned by
/// `RoomScanSyncService`.
@MainActor
final class ScanSyncQueue {

    // MARK: - In-memory queue

    /// In-memory fallback queue used when there's no SwiftData context.
    private(set) var uploadQueue: [QueuedUpload] = []

    /// Append a descriptor to the in-memory queue. Returns the new count.
    @discardableResult
    func enqueue(_ upload: QueuedUpload) -> Int {
        uploadQueue.append(upload)
        return uploadQueue.count
    }

    /// Replace the in-memory queue contents (used after a drain pass that
    /// retains only the still-failing descriptors).
    func replaceQueue(with uploads: [QueuedUpload]) {
        uploadQueue = uploads
    }

    /// Current in-memory queue depth.
    var count: Int { uploadQueue.count }

    // MARK: - Network monitoring

    /// Whether the network path is currently satisfied (online).
    private(set) var isNetworkAvailable = true

    /// Last observed `NWPath.isExpensive`. Used by `startMonitoring` to
    /// detect expensive→cheap transitions (e.g. LTE → Wi-Fi) so that scans
    /// deferred by the cellular gate can resume automatically.
    private var lastPathWasExpensive: Bool = false

    /// Thread-safe snapshot of the most recent `NWPath.isExpensive`.
    /// `NWPathMonitor` is otherwise the only source of truth, but its
    /// `currentPath` is only reliably populated after `start(queue:)` has
    /// published the first update — we read the cached copy instead.
    var cachedIsExpensive: Bool { lastPathWasExpensive }

    private let networkMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.patina.networkMonitor")

    /// Invoked when the path transitions offline→online. The service uses
    /// this to drain the persistent queue + resume deferred bundles.
    var onBecameOnline: (() async -> Void)?

    /// Invoked when the path transitions expensive→cheap (e.g. LTE → Wi-Fi)
    /// while remaining online. The service uses this to resume scans the
    /// cellular gate deferred.
    var onBecameUnmetered: (() async -> Void)?

    /// Invoked whenever the published `isNetworkAvailable` flag changes so
    /// the service can mirror it onto its own observable property.
    var onAvailabilityChanged: ((Bool) -> Void)?

    /// Begin observing network path updates. Mirrors the original
    /// `RoomScanSyncService.startNetworkMonitoring`.
    func startMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            let isExpensiveNow = path.isExpensive
            Task { @MainActor in
                guard let self else { return }
                let wasAvailable = self.isNetworkAvailable
                let wasExpensive = self.lastPathWasExpensive
                self.isNetworkAvailable = (path.status == .satisfied)
                self.lastPathWasExpensive = isExpensiveNow
                self.onAvailabilityChanged?(self.isNetworkAvailable)

                // Just-came-online path: drain persistent queue + resume any
                // advanced scan bundles we deferred while offline.
                if !wasAvailable && path.status == .satisfied {
                    await self.onBecameOnline?()
                }

                // Expensive → cheap (e.g. LTE → Wi-Fi) transition: resume
                // any scans that the cellular gate deferred. The opt-in
                // flag may or may not be set — `uploadAdvancedScanBundle`
                // re-checks the gate on entry so it's safe either way.
                if wasExpensive && !isExpensiveNow {
                    await self.onBecameUnmetered?()
                }
            }
        }
        networkMonitor.start(queue: monitorQueue)
    }

    /// `nonisolated` so it can be invoked from `RoomScanSyncService.deinit`
    /// (a nonisolated context). `NWPathMonitor.cancel()` is safe to call
    /// from any thread, matching the original direct-cancel behavior.
    nonisolated func stopMonitoring() {
        networkMonitor.cancel()
    }
}
