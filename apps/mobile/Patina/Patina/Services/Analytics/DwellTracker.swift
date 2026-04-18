//
//  DwellTracker.swift
//  Patina
//
//  Tracks "how long was this product card visible, and how engaged was the
//  user while it was?" for the Daily Room feed. The view layer calls
//  `viewportEnter(...)` when a card becomes visible and `viewportExit(...)`
//  when it leaves, passing the current scroll velocity and visibility %.
//  On exit we assemble a `product_dwell` event and hand it to
//  DailyRoomBatchQueue.
//
//  Interpretation model is in
//  docs/specs/Data Tracking/patina-data-architecture.md §4.1.
//

import Foundation

actor DwellTracker {
    static let shared = DwellTracker()

    private struct Entry {
        let enteredAt: Date
        let feedPosition: Int
        let roomId: String?
        let scrollVelocityAtEntry: Double
        var maxVisibility: Double
        var expandedInsight: Bool
        var expandedPairing: Bool
    }

    private var active: [String: Entry] = [:]  // keyed by product_id

    // MARK: - Public API

    func viewportEnter(
        productId: String,
        feedPosition: Int,
        roomId: String?,
        scrollVelocity: Double,
        visibilityPct: Double
    ) {
        active[productId] = Entry(
            enteredAt: Date(),
            feedPosition: feedPosition,
            roomId: roomId,
            scrollVelocityAtEntry: scrollVelocity,
            maxVisibility: visibilityPct,
            expandedInsight: false,
            expandedPairing: false
        )
    }

    func updateVisibility(productId: String, visibilityPct: Double) {
        guard var e = active[productId] else { return }
        if visibilityPct > e.maxVisibility { e.maxVisibility = visibilityPct }
        active[productId] = e
    }

    func markInsightExpanded(productId: String) {
        guard var e = active[productId] else { return }
        e.expandedInsight = true
        active[productId] = e
    }

    func markPairingExpanded(productId: String) {
        guard var e = active[productId] else { return }
        e.expandedPairing = true
        active[productId] = e
    }

    func viewportExit(productId: String) async {
        guard let e = active.removeValue(forKey: productId) else { return }
        let durationMs = Int(Date().timeIntervalSince(e.enteredAt) * 1000)

        // Glanced (<1.5s) — neutral, skip to save bandwidth.
        // We still record <1.5s as "scrolled_past" for feed health.
        if durationMs < 1500 {
            let ev = DailyRoomEvent(
                type: .productDwell,
                productId: productId,
                roomId: e.roomId,
                metadata: [
                    "duration_ms": .int(durationMs),
                    "feed_position": .int(e.feedPosition),
                    "scroll_velocity": .double(e.scrollVelocityAtEntry),
                    "visibility_pct": .double(e.maxVisibility),
                    "classification": .string("scrolled_past")
                ]
            )
            await DailyRoomBatchQueue.shared.enqueue(ev)
            return
        }

        let classification: String
        switch durationMs {
        case ..<3000:   classification = "glanced"
        case ..<6000:   classification = "noticed"
        case ..<12000:  classification = "reading"
        case ..<20000:  classification = "considering"
        default:        classification = "imagining"
        }

        let ev = DailyRoomEvent(
            type: .productDwell,
            productId: productId,
            roomId: e.roomId,
            metadata: [
                "duration_ms": .int(durationMs),
                "feed_position": .int(e.feedPosition),
                "scroll_velocity": .double(e.scrollVelocityAtEntry),
                "visibility_pct": .double(e.maxVisibility),
                "expanded_insight": .bool(e.expandedInsight),
                "expanded_pairing": .bool(e.expandedPairing),
                "classification": .string(classification)
            ]
        )
        await DailyRoomBatchQueue.shared.enqueue(ev)
    }

    /// Called when the feed view disappears — flush any in-flight cards so
    /// their dwell time doesn't vanish with the view.
    func flushAll() async {
        let ids = Array(active.keys)
        for id in ids { await viewportExit(productId: id) }
    }
}
