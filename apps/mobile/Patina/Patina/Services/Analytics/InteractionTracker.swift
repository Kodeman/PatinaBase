//
//  InteractionTracker.swift
//  Patina
//
//  Batches and sends behavioral interaction events to the API
//

import Foundation

actor InteractionTracker {
    static let shared = InteractionTracker()

    private var pendingEvents: [InteractionEvent] = []
    private var flushTask: Task<Void, Never>?

    // MARK: - Track

    /// Track an interaction event (batched, best-effort)
    func track(_ event: InteractionEvent) {
        pendingEvents.append(event)

        // Auto-flush when batch reaches threshold
        if pendingEvents.count >= 10 {
            flush()
        }
    }

    /// Convenience for common events
    func trackView(productId: String) {
        track(InteractionEvent(productId: productId, eventType: .view, metadata: nil))
    }

    func trackSave(productId: String) {
        track(InteractionEvent(productId: productId, eventType: .save, metadata: nil))
    }

    func trackSkip(productId: String) {
        track(InteractionEvent(productId: productId, eventType: .skip, metadata: nil))
    }

    func trackDwell(productId: String, seconds: Double) {
        track(InteractionEvent(
            productId: productId,
            eventType: .dwell,
            metadata: ["duration": String(format: "%.1f", seconds)]
        ))
    }

    // MARK: - Flush

    /// Send all pending events to the API
    func flush() {
        guard !pendingEvents.isEmpty else { return }
        let batch = pendingEvents
        pendingEvents.removeAll()

        Task {
            for event in batch {
                await ProductAPIClient.shared.trackInteraction(event)
            }
        }
    }
}
