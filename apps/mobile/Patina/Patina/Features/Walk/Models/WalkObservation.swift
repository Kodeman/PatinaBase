//
//  WalkObservation.swift
//  Patina
//
//  Observations made by Patina during the room walk.
//  Each observation includes narration text and style signal.
//

import Foundation
import Combine
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

/// Manages the queue of observations to display
public class ObservationQueue: ObservableObject {
    @Published public private(set) var currentObservation: WalkObservation?
    @Published public private(set) var history: [WalkObservation] = []

    private var pendingObservations: [WalkObservation] = []
    private var displayTask: Task<Void, Never>?

    /// Add an observation to the queue
    public func enqueue(_ observation: WalkObservation) {
        pendingObservations.append(observation)

        // Start display loop if not running
        if displayTask == nil {
            startDisplayLoop()
        }
    }

    /// Clear all pending observations
    public func clear() {
        displayTask?.cancel()
        displayTask = nil
        pendingObservations = []
        currentObservation = nil
    }

    private func startDisplayLoop() {
        displayTask = Task { @MainActor in
            while !pendingObservations.isEmpty {
                let observation = pendingObservations.removeFirst()

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

                // Brief pause before next
                try? await Task.sleep(nanoseconds: 500_000_000)
            }

            displayTask = nil
        }
    }

    deinit {
        displayTask?.cancel()
    }
}
