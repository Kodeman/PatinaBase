//
//  ScanHaptics.swift
//  Patina
//
//  Named haptic helpers for the Quiet Conversation flow.
//  Per PRD §7 Haptic Specifications.
//
//  Threshold-crossing haptics fire EXACTLY ONCE per session — we track
//  which bands have already fired in a Set<Int>.
//

import Foundation
import UIKit

@MainActor
public final class ScanHaptics {

    public static let shared = ScanHaptics()

    private let manager = HapticManager.shared

    /// Bands that have already fired their haptic for this scan session.
    private var firedBands: Set<Int> = []

    private init() {}

    /// Reset fired-band tracking at the start of a new scan session.
    public func resetSession() {
        firedBands.removeAll()
    }

    /// Fire the haptic associated with a WhisperState band, at most once per session.
    public func fireIfNewBand(_ state: WhisperState) {
        let key = state.band.rawValue
        guard !firedBands.contains(key) else { return }
        firedBands.insert(key)
        fire(state.haptic)
    }

    /// Fire a specific whisper haptic unconditionally.
    public func fire(_ haptic: WhisperHaptic) {
        switch haptic {
        case .none:    return
        case .soft:    manager.impact(.soft)
        case .medium:  manager.impact(.medium)
        case .success: manager.notification(.success)
        }
    }

    // MARK: - Conversation haptics (PRD §7)

    /// Q1 image tapped, Q2 pill toggled, Q4 budget row tapped.
    public func imageOrPillSelect() {
        manager.impact(.light)
    }

    /// Q3 swatch tapped — "feels like pressing into material".
    public func swatchSelect() {
        manager.impact(.rigid)
    }

    /// Q5 priority card tapped — feels conclusive.
    public func prioritySelect() {
        manager.impact(.medium)
    }

    /// Q3 over-limit shake (4th selection rejected).
    public func swatchRejected() {
        manager.notification(.warning)
    }

    // MARK: - Scan edge cases

    /// Fast movement warning — `.rigid` per PRD §4.3.2.
    public func fastMovementWarning() {
        manager.impact(.rigid)
    }

    /// Fired once when the scan first crosses into "ready to complete" territory.
    public func finishingPhase() {
        manager.impact(.medium)
    }

    /// Fired on completion — `.success` per PRD §4.2.
    public func scanComplete() {
        manager.notification(.success)
    }
}
