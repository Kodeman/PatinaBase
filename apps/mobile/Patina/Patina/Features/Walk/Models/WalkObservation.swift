//
//  WalkObservation.swift
//  Patina
//
//  Observations made by Patina during the room walk.
//  Each observation includes narration text and style signal.
//

import Foundation
import Observation
import SwiftUI

/// An observation made during the walk
public struct WalkObservation: Identifiable, Equatable {
    public let id: UUID
    public let trigger: FeatureCategory
    public let narration: String
    public let styleSignal: StyleSignalType
    public let timestamp: Date

    public init(
        id: UUID = UUID(),
        trigger: FeatureCategory,
        narration: String? = nil,
        styleSignal: StyleSignalType,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.trigger = trigger
        self.narration = narration ?? trigger.narration
        self.styleSignal = styleSignal
        self.timestamp = timestamp
    }
}

/// Type of style signal affected by an observation
public enum StyleSignalType: String, Codable {
    case naturalLight
    case openness
    case warmth
    case texture

    /// How much this signal contributes (0.1 - 0.3)
    public var contribution: Float {
        switch self {
        case .naturalLight: return 0.2
        case .openness: return 0.2
        case .warmth: return 0.25
        case .texture: return 0.15
        }
    }
}

// MARK: - Feature to Observation Mapping

extension FeatureCategory {
    /// Style signal type associated with this feature
    public var styleSignalType: StyleSignalType {
        switch self {
        case .tallCeiling, .openArea:
            return .openness
        case .window, .largeWindow:
            return .naturalLight
        case .fireplace, .seatingArea:
            return .warmth
        case .bookshelf, .hardwoodFloor:
            return .texture
        case .cornerNook:
            return .warmth
        case .door:
            return .openness
        }
    }

    /// Create an observation from this feature
    public func toObservation() -> WalkObservation? {
        guard triggersNarration else { return nil }

        return WalkObservation(
            trigger: self,
            styleSignal: styleSignalType
        )
    }
}

// MARK: - Observation Queue

/// Manages the queue of observations to display.
///
/// Pacing per `mobile-first-launch §4.2`:
/// - Minimum **8 seconds** between consecutive observation reveals
/// - Maximum **3 observations per rolling 60-second window**
///
/// Both rules are enforced at `enqueue` time so a noisy detector cannot
/// flood the queue (rejected observations are silently dropped — they're
/// triggered by feature detection and will surface again if the feature
/// is re-detected later).
@Observable
public class ObservationQueue {
    public private(set) var currentObservation: WalkObservation?
    public private(set) var history: [WalkObservation] = []

    private var pendingObservations: [WalkObservation] = []
    @ObservationIgnored private var displayTask: Task<Void, Never>?

    /// Timestamps of recent observation *display starts* used to enforce
    /// the rolling-window cap. Trimmed on each enqueue.
    private var recentDisplays: [Date] = []
    private static let minimumGap: TimeInterval = 8
    private static let windowDuration: TimeInterval = 60
    private static let windowMax: Int = 3

    /// Add an observation to the queue if pacing rules permit.
    /// Returns `true` if the observation was accepted, `false` if dropped.
    @discardableResult
    public func enqueue(_ observation: WalkObservation) -> Bool {
        guard shouldAccept(at: Date()) else { return false }
        pendingObservations.append(observation)
        if displayTask == nil {
            startDisplayLoop()
        }
        return true
    }

    /// Clear all pending observations
    public func clear() {
        displayTask?.cancel()
        displayTask = nil
        pendingObservations = []
        currentObservation = nil
        recentDisplays.removeAll()
    }

    private func shouldAccept(at now: Date) -> Bool {
        // Trim entries outside the 60s window.
        recentDisplays.removeAll { now.timeIntervalSince($0) > Self.windowDuration }

        // Rule 1: rolling-window cap.
        if recentDisplays.count >= Self.windowMax { return false }

        // Rule 2: minimum gap from the last display.
        if let last = recentDisplays.last,
           now.timeIntervalSince(last) < Self.minimumGap {
            return false
        }
        return true
    }

    private func startDisplayLoop() {
        displayTask = Task { @MainActor in
            while !pendingObservations.isEmpty {
                let observation = pendingObservations.removeFirst()

                // Record the display-start timestamp for pacing.
                recentDisplays.append(Date())

                // Display the observation
                withAnimation(.easeInOut(duration: 0.3)) {
                    currentObservation = observation
                }

                // Keep displayed for 4 seconds per spec
                try? await Task.sleep(nanoseconds: 4_000_000_000)

                // Add to history
                history.append(observation)

                // Fade out
                withAnimation(.easeOut(duration: 0.3)) {
                    currentObservation = nil
                }

                // Hold the post-fade gap so the next reveal cannot happen
                // sooner than the 8s spec minimum (display 4s + this 4s).
                try? await Task.sleep(nanoseconds: 4_000_000_000)
            }

            displayTask = nil
        }
    }

    deinit {
        displayTask?.cancel()
    }
}
