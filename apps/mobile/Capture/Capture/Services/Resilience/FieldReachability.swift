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

    public init() {}

    public func start(onRestore: @escaping () -> Void) {
        self.onRestore = onRestore
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
