//  FieldReachability.swift
//  Capture
//
//  The outbox was already excellent and completely invisible: nothing on the
//  camera surface said she was offline, and regained connectivity never
//  triggered a drain — drains fired only on enqueue, on launch reconciliation,
//  and on a manual "Retry all". One monitor closes both.

import Foundation
import Network

@MainActor
@Observable
public final class FieldReachability {
    public private(set) var isOnline = true
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "cloud.patina.field.reachability")
    private var onRestore: (() -> Void)?
    private var started = false

    public init() {}

    /// `NWPathMonitor.start(queue:)` may be called only once per instance —
    /// SwiftUI's `.task` re-fires on every reappearance (e.g. swipe to the
    /// session tray and back), not just first mount, so `start` itself must be
    /// safely re-callable. The callback is refreshed on every call; only the
    /// underlying monitor start is guarded.
    public func start(onRestore: @escaping () -> Void) {
        self.onRestore = onRestore
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let online = path.status == .satisfied
                let restored = online && !self.isOnline
                self.isOnline = online
                if restored { self.onRestore?() }
            }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }
}
